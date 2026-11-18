/**
 * ESP32 MicroPython NeoPixel (WS2812B) Frame Transformer
 *
 * Handles NeoPixel LED rendering for ESP32 MicroPython code:
 * - Scoped strictly to frame.boardType === "esp32" (zero Arduino/Pico interference)
 * - Resolves daisy-chained NeoPixel nodes (in -> out -> in -> out) in exact forward order
 * - Validates VCC (3.3V/5V) and GND connectivity per node
 * - Maps committed pixel colors from MicroPython AST session or static action parser
 * - Implements cross-frame persistence across ticks (sleep_ms) until next .write()
 * - Clean reset on tick === 0 or !frame.running
 */

import type { SimulationFrame } from "../../simulation-state";
import type { SimContext } from "../types";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../../circuit/graph";
import {
  checkPicoGndConnectivity,
  checkPicoVccConnectivity,
  getOrCreateSession,
} from "../../codeParsing/picoParser";
import { parseEsp32PythonNeoPixelActions } from "../../esp32/parser/neopixelPatterns";
import { parseEsp32CppNeoPixelActions } from "../../esp32/parser/cppNeopixel";

// Module-level persistent cache of committed pixel colors per ESP32 GPIO pin:
// pin -> Array<{ r: number; g: number; b: number }>
const esp32PixelCache = new Map<number, Array<{ r: number; g: number; b: number }>>();

export function resetEsp32NeoPixelCache(): void {
  esp32PixelCache.clear();
}

/**
 * Transforms simulation frame with ESP32 NeoPixel telemetry and RGB values.
 */
export function applyEsp32NeoPixelInputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  // Strict Board Guard: ONLY run for ESP32
  if (frame.boardType !== "esp32") return frame;

  const { nodes, edges, picoCode, arduinoCode } = context;

  // Find ESP32 node
  const esp32Node = nodes.find(
    (n: any) =>
      getNodeSimulationModel(n) === "esp32" ||
      n.data?.componentType === "esp32" ||
      n.type === "esp32",
  );

  const neoPixelNodes = nodes.filter((n: any) => getNodeSimulationModel(n) === "neopixel");

  // Handle stopped simulation or restart reset
  if (!frame.running || frame.tick === 0) {
    esp32PixelCache.clear();

    if (neoPixelNodes.length === 0) return frame;

    const components = { ...frame.components };
    let changed = false;

    for (const node of neoPixelNodes) {
      const prev = components[node.id];
      components[node.id] = {
        ...(prev ?? {
          nodeId: node.id,
          componentType: "neopixel",
          label: node.data?.label || "NeoPixel",
          isPowered: false,
          brightness: 0,
          voltage: 0,
          pins: {},
          telemetry: {},
        }),
        isPowered: false,
        brightness: 0,
        voltage: 0,
        telemetry: {
          ...(prev?.telemetry ?? {}),
          red: 0,
          green: 0,
          blue: 0,
          chainPosition: -1,
          mcuPin: -1,
          error: "",
        },
      };
      changed = true;
    }

    return changed ? { ...frame, components } : frame;
  }

  if (!esp32Node || neoPixelNodes.length === 0) return frame;

  const code = (context as any).selectedLanguage === "python" ? picoCode : (picoCode || arduinoCode);

  const graph = buildConductiveGraphForStore(nodes, edges, { includeResistors: true });

  // 1. Establish parent connectivity for each NeoPixel node
  // parentMap: nodeId -> { type: "mcu", pin: number } | { type: "pixel", parentId: string } | null
  const parentMap = new Map<
    string,
    { type: "mcu"; pin: number } | { type: "pixel", parentId: string } | null
  >();

  for (const node of neoPixelNodes) {
    const inReach = getReachableGraphNodes(graph, `${node.id}:in`);
    let parentFound = false;

    // Check if connected to another NeoPixel's OUT pin
    for (const other of neoPixelNodes) {
      if (other.id === node.id) continue;
      if (inReach.has(`${other.id}:out`)) {
        parentMap.set(node.id, { type: "pixel", parentId: other.id });
        parentFound = true;
        break;
      }
    }

    if (parentFound) continue;

    // Check if connected to an ESP32 GPIO pin (gpio0..39)
    for (let pin = 0; pin <= 39; pin++) {
      if (pin >= 6 && pin <= 11) continue; // Forbidden SPI flash pins
      const pinHandle = `gpio${pin}`;
      if (inReach.has(`${esp32Node.id}:${pinHandle}`)) {
        parentMap.set(node.id, { type: "mcu", pin });
        parentFound = true;
        break;
      }
    }

    if (!parentFound) {
      parentMap.set(node.id, null);
    }
  }

  // 2. Discover and trace chains starting from direct MCU-connected root nodes
  // chains: Map<pinNumber, string[][]> (list of chains per pin)
  const chains = new Map<number, string[][]>();
  const chainLoops = new Set<string>();
  const mappedNodes = new Set<string>();

  for (const [nodeId, parent] of parentMap.entries()) {
    if (parent && parent.type === "mcu") {
      const pin = parent.pin;
      const chain: string[] = [];
      let currentId: string | null = nodeId;
      const visited = new Set<string>();

      while (currentId) {
        if (visited.has(currentId)) {
          // Cycle / loop detected!
          for (const loopId of visited) {
            chainLoops.add(loopId);
          }
          break;
        }
        visited.add(currentId);
        chain.push(currentId);
        mappedNodes.add(currentId);

        // Find follower node whose parent is currentId
        let nextId: string | null = null;
        for (const [nId, p] of parentMap.entries()) {
          if (p && p.type === "pixel" && p.parentId === currentId) {
            nextId = nId;
            break;
          }
        }
        currentId = nextId;
      }

      if (!chains.has(pin)) {
        chains.set(pin, []);
      }
      chains.get(pin)!.push(chain);
    }
  }

  // 3. Electrical & Power validation per NeoPixel node
  const nodePoweredMap = new Map<string, { isPowered: boolean; error: string | null }>();

  for (const node of neoPixelNodes) {
    const isGndConnected = checkPicoGndConnectivity(node.id, "ground1", nodes, edges);
    const isVccConnected = checkPicoVccConnectivity(node.id, "vcc1", nodes, edges);
    const isPowered = isGndConnected && isVccConnected;

    let error: string | null = null;
    if (!isPowered) {
      if (!isVccConnected && !isGndConnected) {
        error = "Power & Ground Missing";
      } else if (!isVccConnected) {
        error = "VCC/Power Missing";
      } else {
        error = "Ground Missing";
      }
    }

    nodePoweredMap.set(node.id, { isPowered, error });
  }

  // 4. Retrieve simulated pixel states from MicroPython interpreter AST session
  // or fall back to static pattern matcher if session is unavailable
  const ts = frame.timestamp ?? (frame.tick * 100);
  const session = getOrCreateSession(code, ts, "esp32");

  if (session && session.neopixelStates) {
    for (const [pin, state] of session.neopixelStates.entries()) {
      if (state && Array.isArray(state.pixels)) {
        esp32PixelCache.set(pin, state.pixels.map((p) => ({ ...p })));
      }
    }
  }

  // Also check static regex actions if session didn't have this pin
  const staticActions = parseEsp32PythonNeoPixelActions(code);
  for (const act of staticActions) {
    if (!esp32PixelCache.has(act.pin) && act.pixels.length > 0) {
      esp32PixelCache.set(act.pin, act.pixels.map((p) => ({ ...p })));
    }
  }

  // Check C++ Adafruit_NeoPixel actions
  const inputStates = new Map<number, boolean>();
  if (Array.isArray(frame.boardPins)) {
    for (const p of frame.boardPins) {
      inputStates.set(p.pin, p.value > 0);
    }
  }
  const cppActions = parseEsp32CppNeoPixelActions(code, {
    inputStates,
    nodes,
    edges,
    tick: frame.tick,
    timestamp: (context as any).timestamp ?? (typeof Date !== "undefined" ? Date.now() : frame.tick * 100),
    frame,
  });
  for (const act of cppActions) {
    if (act.pixels.length > 0) {
      esp32PixelCache.set(act.pin, act.pixels.map((p) => ({ ...p })));
    }
  }

  // 5. Update components telemetry and states
  const components = { ...frame.components };
  let changed = false;

  for (const node of neoPixelNodes) {
    const previous = components[node.id];
    const powerInfo = nodePoweredMap.get(node.id) ?? { isPowered: false, error: "Power Missing" };

    let isPowered = powerInfo.isPowered;
    let error = powerInfo.error;
    let red = 0;
    let green = 0;
    let blue = 0;
    let brightness = 0;
    let chainPosition = -1;
    let mcuPin = -1;

    const parent = parentMap.get(node.id);
    const inChain = mappedNodes.has(node.id);

    if (chainLoops.has(node.id)) {
      error = "Loop Connections (Feedback cycle)";
      isPowered = false;
    } else if (parent === null || !inChain) {
      error = isPowered ? "Power without Data (IN Pin Floating)" : "Disconnected IN";
    } else {
      // Find chain position
      for (const [pin, pinChains] of chains) {
        let found = false;
        for (const chain of pinChains) {
          const idx = chain.indexOf(node.id);
          if (idx !== -1) {
            chainPosition = idx;
            mcuPin = pin;
            found = true;

            // Check if any upstream pixel in the chain is unpowered (cascading signal break)
            let upstreamBroken = false;
            for (let u = 0; u < idx; u++) {
              const upstreamId = chain[u];
              const upstreamPower = nodePoweredMap.get(upstreamId);
              if (!upstreamPower || !upstreamPower.isPowered) {
                upstreamBroken = true;
                break;
              }
            }

            if (upstreamBroken) {
              error = "Broken Chain (Upstream Pixel Unpowered)";
              isPowered = false;
            } else if (isPowered) {
              // Powered and signal intact — retrieve pixel colors from cache
              const cachedPixels = esp32PixelCache.get(pin);
              if (cachedPixels && idx < cachedPixels.length) {
                const color = cachedPixels[idx];
                red = color.r;
                green = color.g;
                blue = color.b;
                brightness = (red > 0 || green > 0 || blue > 0) ? 1 : 0;
              }
            }
            break;
          }
        }
        if (found) break;
      }
    }

    components[node.id] = {
      ...(previous ?? {
        nodeId: node.id,
        componentType: "neopixel",
        label: node.data?.label || "NeoPixel",
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered: isPowered && (red > 0 || green > 0 || blue > 0 || (brightness > 0)),
      brightness,
      voltage: isPowered ? 3.3 : 0,
      telemetry: {
        ...(previous?.telemetry ?? {}),
        red,
        green,
        blue,
        error: error || "",
        chainPosition,
        mcuPin,
      },
    };
    changed = true;
  }

  return changed ? { ...frame, components } : frame;
}
