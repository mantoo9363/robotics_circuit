import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../../circuit/graph";
import { parseNeoPixelColors, collapseSensorConditionals } from "../../codeParsing/neopixelParser";
import { DEFAULT_DHT11_TEMP, DEFAULT_DHT11_HUMIDITY } from "./dht11";

import { getOrCreateSession } from "../../codeParsing/picoParser";
import { checkPinConnectivity, unrollLoops, getConnectedBoardPin, parseArduinoConstants, evaluateExpression, stripCodeComments } from "../../codeParsing/arduinoParser";
import { checkPicoGndConnectivity, checkPicoVccConnectivity } from "../../codeParsing/picoParser";
import type { SimContext } from "../types";



/**
 * Parses C++ Arduino code to find Serial.println("TEXT") calls and associated
 * pixels.setPixelColor(...) statements. It associates each color update with
 * its physically closest Serial print statement using code token indices,
 * enabling dynamic serial-driven state mapping.
 */
function extractSerialNeoPixelMappings(code: string): Map<string, Array<{ pixelIndex: number; color: { r: number; g: number; b: number } }>> {
  const mappings = new Map<string, Array<{ pixelIndex: number; color: { r: number; g: number; b: number } }>>();
  const cleaned = stripCodeComments(code);
  const unrolled = unrollLoops(cleaned);

  const constants = parseArduinoConstants(code);
  const variables = new Map<string, number>();
  for (const [k, v] of constants.entries()) {
    variables.set(k, v);
  }

  // Find all print statements
  const printRegex = /Serial\s*\.\s*println\s*\(\s*["']([^"']+)["']\s*\)/gi;
  const prints: Array<{ text: string; index: number }> = [];
  let printMatch;
  while ((printMatch = printRegex.exec(unrolled)) !== null) {
    prints.push({
      text: printMatch[1].toLowerCase().trim(),
      index: printMatch.index,
    });
  }

  if (prints.length === 0) return mappings;

  // Split arguments helper ignoring nested parentheses (e.g. Color(r,g,b))
  const splitArguments = (argsStr: string): string[] => {
    const args: string[] = [];
    let current = "";
    let depth = 0;
    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      
      if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) {
      args.push(current.trim());
    }
    return args;
  };

  // Find all setPixelColor statements
  const setPixelColorRegex = /(?:\b\w+\s*\.)?setPixelColor\s*\(([^;]+)\)/gi;
  let pixelMatch;
  const pixelStatements: Array<{
    index: number;
    pixelIndex: number;
    color: { r: number; g: number; b: number };
  }> = [];

  while ((pixelMatch = setPixelColorRegex.exec(unrolled)) !== null) {
    const args = splitArguments(pixelMatch[1]);
    let pixelIndex = -1;
    let r = 0, g = 0, b = 0;
    let valid = false;

    if (args.length === 2) {
      try {
        pixelIndex = evaluateExpression(args[0], variables);
        const colorExpr = args[1];
        const colorCallMatch = /Color\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i.exec(colorExpr);
        if (colorCallMatch) {
          r = Math.min(255, Math.max(0, evaluateExpression(colorCallMatch[1], variables)));
          g = Math.min(255, Math.max(0, evaluateExpression(colorCallMatch[2], variables)));
          b = Math.min(255, Math.max(0, evaluateExpression(colorCallMatch[3], variables)));
          valid = true;
        } else {
          const cVal = evaluateExpression(colorExpr, variables);
          r = (cVal >> 16) & 0xff;
          g = (cVal >> 8) & 0xff;
          b = cVal & 0xff;
          valid = true;
        }
      } catch (_) {}
    } else if (args.length === 4) {
      try {
        pixelIndex = evaluateExpression(args[0], variables);
        r = Math.min(255, Math.max(0, evaluateExpression(args[1], variables)));
        g = Math.min(255, Math.max(0, evaluateExpression(args[2], variables)));
        b = Math.min(255, Math.max(0, evaluateExpression(args[3], variables)));
        valid = true;
      } catch (_) {}
    }

    if (valid && pixelIndex !== -1) {
      pixelStatements.push({
        index: pixelMatch.index,
        pixelIndex,
        color: { r, g, b },
      });
    }
  }

  // Associate each setPixelColor with the closest print statement within 300 chars
  for (const pixelStmt of pixelStatements) {
    let closestPrint: typeof prints[0] | null = null;
    let minDistance = Infinity;

    for (const pr of prints) {
      const dist = Math.abs(pixelStmt.index - pr.index);
      if (dist < minDistance) {
        minDistance = dist;
        closestPrint = pr;
      }
    }

    if (closestPrint && minDistance < 300) {
      const key = closestPrint.text;
      if (!mappings.has(key)) {
        mappings.set(key, []);
      }
      mappings.get(key)!.push({
        pixelIndex: pixelStmt.pixelIndex,
        color: pixelStmt.color,
      });
    }
  }

  return mappings;
}

export function applyNeoPixelInputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  const status = useCircuitStore.getState().simulationStatus;
  if (
    (frame.boardType !== "arduino" && frame.boardType !== "pico") ||
    status !== "running"
  ) {
    return frame;
  }

  const { nodes, edges, arduinoCode, picoCode } = useCircuitStore.getState();

  const mcuNode = nodes.find(
    (node) =>
      getNodeSimulationModel(node) === "arduino" ||
      getNodeSimulationModel(node) === "raspberrypipico",
  );
  if (!mcuNode) return frame;

  const graph = buildConductiveGraphForStore(nodes, edges, { includeResistors: true });

  // 1. Establish parent connectivity for each NeoPixel node
  const neoPixelNodes = nodes.filter((n) => getNodeSimulationModel(n) === "neopixel");
  if (neoPixelNodes.length === 0) return frame;

  const parentMap = new Map<
    string,
    { type: "mcu"; pin: number; pinHandle: string } | { type: "pixel"; parentId: string } | null
  >();

  for (const node of neoPixelNodes) {
    const inReach = getReachableGraphNodes(graph, `${node.id}:in`);
    let parentFound = false;

    // Check if connected to another NeoPixel OUT
    for (const other of neoPixelNodes) {
      if (other.id === node.id) continue;
      if (inReach.has(`${other.id}:out`)) {
        parentMap.set(node.id, { type: "pixel", parentId: other.id });
        parentFound = true;
        break;
      }
    }

    if (parentFound) continue;

    // Check if connected to MCU Digital output pins
    if (frame.boardType === "arduino") {
      for (let pin = 0; pin <= 13; pin++) {
        if (inReach.has(`${mcuNode.id}:d${pin}`)) {
          parentMap.set(node.id, { type: "mcu", pin, pinHandle: `d${pin}` });
          parentFound = true;
          break;
        }
      }
      if (!parentFound) {
        // Check analog pins acting as digital
        for (let aPin = 0; aPin <= 5; aPin++) {
          if (inReach.has(`${mcuNode.id}:a${aPin}`)) {
            parentMap.set(node.id, { type: "mcu", pin: 14 + aPin, pinHandle: `a${aPin}` });
            parentFound = true;
            break;
          }
        }
      }
    } else if (frame.boardType === "pico") {
      for (let pin = 0; pin <= 28; pin++) {
        if (inReach.has(`${mcuNode.id}:gp${pin}`)) {
          parentMap.set(node.id, { type: "mcu", pin, pinHandle: `gp${pin}` });
          parentFound = true;
          break;
        }
      }
    }

    if (!parentFound) {
      parentMap.set(node.id, null);
    }
  }

  // 2. Discover and trace chains
  const chains = new Map<number, string[][]>(); // Map digital pin -> list of chains (each chain is a list of node IDs)
  const chainLoops = new Set<string>(); // Set of node IDs caught in cycles
  const mappedNodes = new Set<string>();

  // Start with nodes connected directly to MCU output pins
  for (const [nodeId, parent] of parentMap.entries()) {
    if (parent && parent.type === "mcu") {
      const pin = parent.pin;
      const chain: string[] = [];
      let currentId: string | null = nodeId;
      const visited = new Set<string>();

      while (currentId) {
        if (visited.has(currentId)) {
          // Loop detected! Flag all nodes in this cycle
          for (const loopId of visited) {
            chainLoops.add(loopId);
          }
          break;
        }
        visited.add(currentId);
        chain.push(currentId);
        mappedNodes.add(currentId);

        // Find follower (NeoPixel whose parent is this nodeId)
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

  // 3. Electrical & Power validation check
  const isPico = frame.boardType === "pico";
  const nodePoweredMap = new Map<string, { isPowered: boolean; error: string | null }>();

  for (const node of neoPixelNodes) {
    const isGndConnected = isPico
      ? checkPicoGndConnectivity(node.id, "ground1", nodes, edges)
      : checkPinConnectivity(node.id, "ground1", "gnd", nodes, edges);
    const isVccConnected = isPico
      ? checkPicoVccConnectivity(node.id, "vcc1", nodes, edges)
      : checkPinConnectivity(node.id, "vcc1", "vcc", nodes, edges);

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

  // 4. Retrieve simulated pixel states
  const pinStates = new Map<number, { pixels: Array<{ r: number; g: number; b: number }>; brightness: number; initialized?: boolean }>();

  if (frame.boardType === "arduino") {
    let unrolledCode = unrollLoops(arduinoCode);

    // Support pulseIn resolution for ultrasonic distance sensors in C++ NeoPixel parsing
    let distanceCm: number | undefined;
    const ultrasonicNode = nodes.find(
      (n) => getNodeSimulationModel(n) === "ultrasonicDistance" || n.data.componentType === "ultrasonicDistance"
    );
    if (ultrasonicNode) {
      const echoConn = getConnectedBoardPin(ultrasonicNode.id, "echo", nodes, edges);
      if (echoConn !== null) {
        const echoPin = echoConn.pinNumber;
        const isPowered = (() => {
          if (checkPinConnectivity(ultrasonicNode.id, "power", "vcc", nodes, edges)) {
            const isGnd = checkPinConnectivity(ultrasonicNode.id, "ground", "gnd", nodes, edges);
            return isGnd;
          }
          const powerConn = getConnectedBoardPin(ultrasonicNode.id, "power", nodes, edges);
          if (powerConn) {
            const boardPin = frame.boardPins.find(p => p.pin === powerConn.pinNumber);
            const isPinHigh = boardPin && boardPin.mode === "OUTPUT" && boardPin.value > 0;
            const isGnd = checkPinConnectivity(ultrasonicNode.id, "ground", "gnd", nodes, edges);
            return !!isPinHigh && isGnd;
          }
          return false;
        })();
        distanceCm = isPowered
          ? Math.max(2, Math.min(400, Number(ultrasonicNode.data.properties?.distance?.value ?? 100)))
          : 0;
        const duration = isPowered ? Math.round((distanceCm * 2) / 0.0343) : 0;
        const constants = parseArduinoConstants(unrolledCode);
        unrolledCode = unrolledCode.replace(
          /pulseIn\s*\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)(?:\s*,\s*[^)]+)?\s*\)/g,
          (match, pinToken) => {
            const resolvedPin = constants.get(pinToken) ?? Number(pinToken);
            if (resolvedPin === echoPin) {
              return String(duration);
            }
            return match;
          }
        );
      }
    }

    // Support DHT11 sensor readings in C++ NeoPixel parsing
    let dhtTemp: number | undefined;
    let dhtHum: number | undefined;
    const dhtNode = nodes.find(
      (n) => getNodeSimulationModel(n) === "dht11" || getNodeSimulationModel(n) === "dht22" || n.data.componentType === "dht11" || n.data.componentType === "dht22"
    );
    if (dhtNode) {
      const isPowered = (() => {
        const isVcc = checkPinConnectivity(dhtNode.id, "vcc", "vcc", nodes, edges);
        const isGnd = checkPinConnectivity(dhtNode.id, "gnd", "gnd", nodes, edges);
        return isVcc && isGnd;
      })();
      if (isPowered) {
        dhtTemp = Number(dhtNode.data?.properties?.temperature?.value ?? DEFAULT_DHT11_TEMP);
        dhtHum = Number(dhtNode.data?.properties?.humidity?.value ?? DEFAULT_DHT11_HUMIDITY);
      }
    }

    // Collapse sensor conditionals BEFORE segmenting so conditional branches aren't mistaken for sequential animations
    unrolledCode = collapseSensorConditionals(unrolledCode, {
      distanceCm,
      tempCelsius: dhtTemp,
      humidity: dhtHum,
    });

    const globalDecls = extractGlobalDeclarations(unrolledCode);
    const setupBody = extractFunctionBody(unrolledCode, /void\s+setup\s*\(\s*\)\s*\{/);
    const segments = parseNeoPixelSegments(unrolledCode);
    const totalCycleMs = segments.reduce((sum, s) => sum + s.duration, 0);

    let codeToRender = unrolledCode;
    if (segments.length > 0 && totalCycleMs > 0) {
      const cycleCount = Math.floor(frame.timestamp / totalCycleMs);
      const elapsed = frame.timestamp % totalCycleMs;

      let activeIndex = 0;
      let acc = 0;
      for (let i = 0; i < segments.length; i++) {
        acc += segments[i].duration;
        if (elapsed < acc) {
          activeIndex = i;
          break;
        }
      }

      const parts = [globalDecls, setupBody];
      if (cycleCount > 0) {
        for (const seg of segments) {
          parts.push(seg.commands);
        }
      }
      for (let i = 0; i <= activeIndex; i++) {
        parts.push(segments[i].commands);
      }
      codeToRender = parts.join("\n");
    } else {
      codeToRender = globalDecls + "\n" + setupBody + "\n" + unrolledCode;
    }

    // Build a live sensor-value map from boardPins so analogRead(A0..A5) can be resolved.
    const analogPinValues = new Map<number, number>();
    for (const boardPin of frame.boardPins) {
      if (boardPin.pin >= 14 && boardPin.pin <= 19) {
        analogPinValues.set(boardPin.pin, Math.round((boardPin.value / 255) * 1023));
      }
    }

    for (const [pin] of chains) {
      const state = parseNeoPixelColors(codeToRender, pin, 60, analogPinValues, distanceCm, dhtTemp, dhtHum);
      if (state) {
        pinStates.set(pin, state);
      }
    }


    // Dynamic serial-to-color mapping support for variable-bound conditional branches
    const serialMappings = extractSerialNeoPixelMappings(codeToRender);
    if (serialMappings.size > 0 && frame.serialOutput && frame.serialOutput.length > 0) {
      let activeMapping: Array<{ pixelIndex: number; color: { r: number; g: number; b: number } }> | null = null;
      for (let i = frame.serialOutput.length - 1; i >= 0; i--) {
        const rawItem = frame.serialOutput[i];
        const line = (typeof rawItem === "string" ? rawItem : (rawItem as any)?.text ?? String(rawItem ?? "")).trim().toLowerCase();
        for (const [key, mapping] of serialMappings.entries()) {
          if (line.includes(key) || key.includes(line)) {
            activeMapping = mapping;
            break;
          }
        }
        if (activeMapping) break;
      }

      if (activeMapping) {
        for (const [pin, state] of pinStates.entries()) {
          const updatedPixels = [...state.pixels];
          for (const update of activeMapping) {
            if (update.pixelIndex < updatedPixels.length) {
              updatedPixels[update.pixelIndex] = { ...update.color };
            }
          }
          pinStates.set(pin, {
            ...state,
            pixels: updatedPixels,
          });
        }
      }
    }

  } else if (frame.boardType === "pico") {
    const session = getOrCreateSession(picoCode, frame.timestamp, "pico");
    if (session && session.neopixelStates) {
      for (const [pin, state] of session.neopixelStates.entries()) {
        pinStates.set(pin, {
          pixels: state.pixels,
          brightness: 255, // MicroPython doesn't have built-in brightness scale
        });
      }
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
    let mcuPin: number | null = null;

    // Check if node is part of a valid chain
    const parent = parentMap.get(node.id);
    const inChain = mappedNodes.has(node.id);

    if (chainLoops.has(node.id)) {
      error = "Loop Connections (Feedback cycle)";
      isPowered = false;
    } else if (parent === null) {
      error = isPowered ? "Power without Data (IN Pin Floating)" : "Disconnected IN";
    } else if (!inChain) {
      error = isPowered ? "Power without Data" : "Disconnected IN";
    } else {
      // Find which pin chain it belongs to
      for (const [pin, pinChains] of chains) {
        let found = false;
        for (const chain of pinChains) {
          const idx = chain.indexOf(node.id);
          if (idx !== -1) {
            chainPosition = idx;
            mcuPin = pin;
            found = true;

            // Check if any upstream pixel in the chain is unpowered (cascading failure)
            let upstreamBroken = false;
            for (let u = 0; u < idx; u++) {
              const upstreamNodeId = chain[u];
              const upstreamPower = nodePoweredMap.get(upstreamNodeId);
              if (!upstreamPower || !upstreamPower.isPowered) {
                upstreamBroken = true;
                break;
              }
            }

            if (upstreamBroken) {
              error = "Broken Chain (Upstream Pixel Unpowered)";
              isPowered = false;
            } else if (!isPowered) {
              error = "Data without Power";
            } else {
              // Powered & Signal Intact -> Map colors!
              const backendColors = (frame.components[node.id]?.telemetry as any)?.neopixelColors;
              if (backendColors && Array.isArray(backendColors) && chainPosition < backendColors.length) {
                const pixelColor = backendColors[chainPosition] as any;
                red = pixelColor.r;
                green = pixelColor.g;
                blue = pixelColor.b;
                brightness = 255;
              } else {
                const pinState = pinStates.get(pin);
                if (pinState && idx < pinState.pixels.length) {
                  if (frame.boardType === "arduino" && pinState.initialized === false) {
                    error = "NeoPixel not initialized. Call begin() in setup().";
                    isPowered = false;
                  } else {
                    const pixelColor = pinState.pixels[idx];
                    red = pixelColor.r;
                    green = pixelColor.g;
                    blue = pixelColor.b;
                    brightness = pinState.brightness;
                  }
                }
              }
            }
            break;
          }
        }
        if (found) break;
      }
    }

    // Output warnings / check connections of OUT pin if it is wired but doesn't reach anything
    const outReach = getReachableGraphNodes(graph, `${node.id}:out`);
    const outWired = edges.some(
      (e) =>
        (e.source === node.id && e.sourceHandle === "out") ||
        (e.target === node.id && e.targetHandle === "out"),
    );

    if (outWired && !error) {
      let reachesFollower = false;
      for (const other of neoPixelNodes) {
        if (other.id === node.id) continue;
        if (outReach.has(`${other.id}:in`)) {
          reachesFollower = true;
          break;
        }
      }
      if (!reachesFollower) {
        error = "Disconnected OUT (Floating Wire)";
      }
    }

    const telemetry = {
      isPowered,
      red,
      green,
      blue,
      brightness,
      chainPosition,
      mcuPin: mcuPin ?? -1,
      error: error || "",
    };

    components[node.id] = {
      ...(previous ?? {
        nodeId: node.id,
        componentType: "neopixel",
        label: node.data.label || "NeoPixel",
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered,
      brightness: isPowered && (red > 0 || green > 0 || blue > 0) ? brightness / 255 : 0,
      telemetry,
    };
    changed = true;
  }

  return changed ? { ...frame, components } : frame;
}

function extractFunctionBody(code: string, regex: RegExp): string {
  const cleaned = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const match = regex.exec(cleaned);
  if (!match) return "";
  const start = match.index + match[0].length;
  let depth = 1;
  let end = start;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return cleaned.slice(start, end);
}

function parseNeoPixelSegments(code: string): { commands: string; duration: number }[] {
  const loopBody = extractFunctionBody(code, /void\s+loop\s*\(\s*\)\s*\{/);
  if (!loopBody) return [];

  const segments: { commands: string; duration: number }[] = [];
  const bodyToScan = loopBody.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  // Split loop body by statements ending with ';'
  const lines = bodyToScan.split(";").map(s => s.trim()).filter(Boolean);

  let currentCmds: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentCmds.push(line + ";");

    // If it is a show() statement
    if (/\bshow\s*\(\s*\)/.test(line)) {
      // Check if next statement is delay(ms)
      let duration = 200; // default transition step duration
      if (i + 1 < lines.length && /\bdelay\s*\(\s*(\d+)\s*\)/.test(lines[i + 1])) {
        const match = lines[i + 1].match(/\bdelay\s*\(\s*(\d+)\s*\)/);
        if (match) {
          duration = Number(match[1]);
          // Consume the delay statement
          currentCmds.push(lines[i + 1] + ";");
          i++;
        }
      }
      segments.push({
        commands: currentCmds.join("\n"),
        duration
      });
      currentCmds = [];
    }
  }

  if (currentCmds.length > 0) {
    segments.push({
      commands: currentCmds.join("\n"),
      duration: 0
    });
  }

  return segments;
}

function extractGlobalDeclarations(code: string): string {
  let cleaned = code;
  const removeBlock = (regex: RegExp) => {
    let match = regex.exec(cleaned);
    if (!match) return;
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === "{") depth++;
      else if (cleaned[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    cleaned = cleaned.slice(0, match.index) + cleaned.slice(end + 1);
  };
  removeBlock(/void\s+setup\s*\(\s*\)\s*\{/);
  removeBlock(/void\s+loop\s*\(\s*\)\s*\{/);
  return cleaned;
}
