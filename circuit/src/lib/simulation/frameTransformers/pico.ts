import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import type { SimContext } from "../types";
import { getNodeSimulationModel } from "../../circuit/components";
import { frameBoardPinsToMap, upsertPinState } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { parsePythonReadOutputsForInput, getOrCreateSession, getVisibleSerialLines } from "../../codeParsing/picoParser";
import { getAnalogValueForPicoPin } from "../../codeParsing/picoAnalogPins";
import { applyDrivenLoadsFromEndpoint } from "./stateMaps";
import { buildConductiveGraphForStore, getReachableGraphNodes, addGraphConnection } from "../../circuit/graph";
import { useCircuitStore } from "../../store";

const TILT_THRESHOLD = 45;

export function resolvePicoDigitalInputFromCircuit(
  pin: number,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  frame: SimulationFrame,
  picoCode = "",
): boolean | null {
  const picoNode = nodes.find(
    (node) => getNodeSimulationModel(node) === "raspberrypipico",
  );
  if (!picoNode) return null;

  const session = getOrCreateSession(picoCode, frame.timestamp, "pico");
  const graph = buildConductiveGraphForStore(nodes, edges, { includeResistors: true });

  // Add active keypad matrix short circuits to the graph (excluding consumed keys)
  const KEY_MATRIX = [
    ["1", "2", "3", "A"],
    ["4", "5", "6", "B"],
    ["7", "8", "9", "C"],
    ["*", "0", "#", "D"],
  ];
  for (const node of nodes) {
    const model = node.data?.componentType ?? node.type;
    if (model === "keypad4x4" || model === "keypad4x3") {
      const pressedKeysStr = String(node.data?.properties?.pressedKeys?.value ?? "");
      const pressedKeys = new Set(pressedKeysStr ? pressedKeysStr.split(",") : []);
      pressedKeys.forEach((key) => {
        if (session?.consumedKeys?.has(key)) {
          return;
        }
        let rIdx = -1;
        let cIdx = -1;
        for (let r = 0; r < KEY_MATRIX.length; r++) {
          const c = KEY_MATRIX[r].indexOf(key);
          if (c !== -1) {
            rIdx = r;
            cIdx = c;
            break;
          }
        }
        if (rIdx !== -1 && cIdx !== -1) {
          addGraphConnection(
            graph,
            `${node.id}:row${rIdx + 1}`,
            `${node.id}:column${cIdx + 1}`
          );
        }
      });
    }
  }

  const inputReach = getReachableGraphNodes(graph, `${picoNode.id}:gp${pin}`);
  let strongestSourceVoltage = 0;
  let grounded = false;

  const addSourceIfReachable = (endpoint: string, voltage: number) => {
    if (inputReach.has(endpoint))
      strongestSourceVoltage = Math.max(strongestSourceVoltage, voltage);
  };

  const addGroundIfReachable = (endpoint: string) => {
    if (inputReach.has(endpoint)) grounded = true;
  };

  addSourceIfReachable(`${picoNode.id}:pico_3v3`, 3.3);
  addSourceIfReachable(`${picoNode.id}:pico_vbus`, 5);
  addSourceIfReachable(`${picoNode.id}:pico_vsys`, 5);

  const gndPins = ["pico_gnd1", "pico_gnd2", "pico_gnd3", "pico_gnd4", "pico_gnd5", "pico_gnd6", "pico_gnd7", "pico_gnd8"];
  for (const gnd of gndPins) {
    addGroundIfReachable(`${picoNode.id}:${gnd}`);
  }

  for (const node of nodes) {
    const model = getNodeSimulationModel(node);

    if (
      model === "battery9v" ||
      model === "battery1_5v" ||
      model === "coincell" ||
      model === "powerSupply"
    ) {
      const enabled =
        model === "powerSupply"
          ? node.data.properties?.enabled?.value === "on"
          : true;
      const voltage = enabled
        ? Number(node.data.properties?.voltage?.value ?? 0)
        : 0;
      addSourceIfReachable(`${node.id}:positive`, voltage);
      addGroundIfReachable(`${node.id}:negative`);
    } else if (model === "pirSensor") {
      const motionValue = node.data?.pirMotion ?? node.data?.properties?.motion?.value;
      const motion = motionValue === true || motionValue === "true" || motionValue === 1;
      if (motion) {
        addSourceIfReachable(`${node.id}:signal`, 3.3);
      } else {
        addGroundIfReachable(`${node.id}:signal`);
      }
    }
  }

  if (session && picoNode) {
    for (let otherPin = 0; otherPin <= 28; otherPin++) {
      if (otherPin === pin) continue;
      const otherPinState = session.pins.get(otherPin);
      if (otherPinState && otherPinState.mode === "OUTPUT") {
        if (inputReach.has(`${picoNode.id}:gp${otherPin}`)) {
          if (otherPinState.value > 0) {
            strongestSourceVoltage = Math.max(strongestSourceVoltage, 3.3);
          } else {
            addGroundIfReachable(`${picoNode.id}:gp${otherPin}`);
          }
        }
      }
    }
  }

  const isPullUp = session?.pins.get(pin)?.mode === "INPUT_PULLUP";
  if (isPullUp && !grounded) {
    strongestSourceVoltage = Math.max(strongestSourceVoltage, 3.3);
  }

  if (grounded) return false;
  if (strongestSourceVoltage <= 0 && !grounded) return null;
  return strongestSourceVoltage >= 1.5;
}

export function applyPicoSimulationToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  if (!frame.running) return frame;

  const { nodes, edges, picoCode } = context;
  const picoNode = nodes.find(
    (n) => getNodeSimulationModel(n) === "raspberrypipico",
  );
  if (!picoNode) return frame;

  let outputs: Array<{ pin: number; high: boolean }> = [];
  let serialLines: string[] = [];

  const session = getOrCreateSession(picoCode, frame.timestamp, "pico");
  const gpPinsWithInputs = new Map<number, boolean>();
  for (let pin = 0; pin <= 28; pin++) {
    const sessionPin = session?.pins?.get(pin);
    if (sessionPin && sessionPin.mode === "OUTPUT") {
      continue;
    }
    const high = resolvePicoDigitalInputFromCircuit(pin, nodes, edges, frame, picoCode);
    if (high !== null) {
      gpPinsWithInputs.set(pin, high);
    }
  }

  if (gpPinsWithInputs.size > 0) {
    for (const [pin, high] of gpPinsWithInputs.entries()) {
      const res = parsePythonReadOutputsForInput(picoCode, pin, high, frame.timestamp, "pico");
      if (res) {
        outputs.push(...res.outputs);
        serialLines.push(...res.serialLines);
      }
    }
  } else {
    const res = parsePythonReadOutputsForInput(picoCode, -1, false, frame.timestamp, "pico");
    if (res) {
      outputs.push(...res.outputs);
      serialLines.push(...res.serialLines);
    }
  }

  const pins = frameBoardPinsToMap(frame);

  if (session) {
    session.pins.forEach((pinState, pinNum) => {
      if (pinState.mode !== "UNSET") {
        const pwmInfo = session.pwm.get(pinNum);
        pins.set(pinNum, {
          mode: pinState.mode as any,
          value: pinState.value,
          frequency: pwmInfo ? pwmInfo.freqHz : undefined,
        });
      }
    });
    session.pwm.forEach((pwmState, pinNum) => {
      const val = Math.max(0, Math.min(255, Math.round((pwmState.dutyU16 / 65535) * 255)));
      pins.set(pinNum, {
        mode: "OUTPUT",
        value: val,
      });
    });
  }

  for (const out of outputs) {
    upsertPinState(pins, out.pin, out.high);
  }

  // Evaluate analog sensor inputs on GP26, GP27, GP28 (ADC0, ADC1, ADC2)
  for (const adcPin of [26, 27, 28]) {
    const existing = pins.get(adcPin);
    if (existing && existing.mode === "OUTPUT") {
      continue;
    }
    const analogVal16 = getAnalogValueForPicoPin(adcPin, nodes, edges);
    pins.set(adcPin, {
      mode: "INPUT",
      value: Math.round((analogVal16 / 65535) * 255),
    });
  }

  const serialOutput = session
    ? getVisibleSerialLines(session)
    : (serialLines.length > 0 ? serialLines : (frame.serialOutput ?? []));

  const baseFrame = buildSimulationFrame({
    tick: frame.tick,
    nodes,
    edges,
    dynamicComponents: context.dynamicComponents,
    boardType: frame.boardType,
    arduinoState: {
      pins,
      serialOutput,
      running: frame.running,
      error: frame.error,
    },
    running: frame.running,
    error: frame.error,
  });

  // Convert Pico GPIO OUTPUT pins to voltage sources for circuit simulation
  const components = { ...baseFrame.components };
  for (const [pinNum, pinState] of pins.entries()) {
    if (pinState.mode === "OUTPUT") {
      // Pico GPIO pins output scaled voltage up to 3.3V based on pin duty value
      const gpHandle = `gp${pinNum}`;
      const voltage = (pinState.value / 255) * 3.3;
      if (!components[picoNode.id]) {
        components[picoNode.id] = {
          nodeId: picoNode.id,
          label: picoNode.data.label ?? "Raspberry Pi Pico",
          componentType: "raspberrypipico",
          pins: {},
          isPowered: true,
          brightness: 1,
          voltage: 3.3,
          telemetry: {},
        };
      }
      const picoComp = components[picoNode.id];
      if (picoComp && !picoComp.pins) {
        picoComp.pins = {};
      }
      if (picoComp && picoComp.pins) {
        picoComp.pins[gpHandle] = {
          handleId: gpHandle,
          voltage,
          normalizedValue: pinState.value > 0 ? 1.0 : 0,
          active: true,
        };
      }

      if (voltage > 0) {
        applyDrivenLoadsFromEndpoint({
          sourceNode: picoNode,
          sourceHandle: gpHandle,
          sourceVoltage: voltage,
          supplyVoltage: 3.3,
          dutyCycle: pinState.value / 255,
          nodes,
          edges,
          components,
        });
      }
    }
  }
  return {
    ...baseFrame,
    components,
  };
}

import { validateComponentConnections, checkPicoDeclaredI2cPin } from "../../../utils/connectivity";

export function applyPicoLcdOutputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  if (frame.boardType !== "pico") return frame;
  const { nodes, edges, picoCode } = context;
  const components = { ...frame.components };

  const lcdNodes = nodes.filter(
    (n) => getNodeSimulationModel(n) === "lcd16x2",
  );
  if (lcdNodes.length > 0) {
    const session = getOrCreateSession(picoCode, frame.timestamp, "pico");
    if (session) {
      for (const lcdNode of lcdNodes) {
        const addrStr = String(
          lcdNode.data.properties?.i2cAddress?.value ?? "0x27",
        );
        const hexMatch = addrStr.match(/0x([0-9a-fA-F]+)/);
        const addrNum = hexMatch
          ? parseInt(hexMatch[1], 16)
          : parseInt(addrStr, 10);

        const exactLcd = session.lcdStates?.get(addrNum);
        const hasDeclaredLcds = (session.lcdStates?.size ?? 0) > 0;

        if (exactLcd) {
          const isPowered =
            validateComponentConnections(lcdNode, nodes, edges) &&
            checkPicoDeclaredI2cPin(lcdNode.id, "sda", exactLcd.declaredSdaPin, nodes, edges) &&
            checkPicoDeclaredI2cPin(lcdNode.id, "scl", exactLcd.declaredSclPin, nodes, edges);
          const l1Chars: string[] = [];
          const l2Chars: string[] = [];
          if (isPowered) {
            for (let c = 0; c < 16; c++) {
              const idx1 = c;
              const idx2 = 0x40 + c;
              l1Chars.push(String.fromCharCode(exactLcd.ddram[idx1] || 32));
              l2Chars.push(String.fromCharCode(exactLcd.ddram[idx2] || 32));
            }
          }
          const line1 = isPowered ? l1Chars.join("") : "";
          const line2 = isPowered ? l2Chars.join("") : "";

          const telemetryState = {
            isPowered,
            isSignalOk: isPowered,
            hasConflict: false,
            error: isPowered ? "" : "Power Missing or Bus Disconnected",
            line1,
            line2,
            backlight: isPowered && exactLcd.backlight ? "on" : "off",
            displayEnabled: isPowered && exactLcd.displayEnabled,
            cursorEnabled: isPowered && exactLcd.cursorEnabled,
          };

          components[lcdNode.id] = {
            ...(components[lcdNode.id] ?? {
              nodeId: lcdNode.id,
              componentType: lcdNode.data.componentType,
              label: lcdNode.data.label,
              isPowered: false,
              brightness: 0,
              voltage: 0,
              pins: {},
              telemetry: {},
            }),
            isPowered,
            brightness: isPowered && exactLcd.backlight ? 1 : 0,
            telemetry: {
              ...(components[lcdNode.id]?.telemetry ?? {}),
              ...telemetryState,
            },
          };
        } else if (hasDeclaredLcds) {
          const declaredAddrs = Array.from(session.lcdStates?.keys() ?? []).map(
            (a) => "0x" + a.toString(16),
          );
          const isPowered = validateComponentConnections(lcdNode, nodes, edges);
          const telemetryState = {
            isPowered,
            isSignalOk: isPowered,
            hasConflict: false,
            error: `Address Mismatch: MicroPython initialized LCD at ${declaredAddrs.join(", ")}, but canvas node is set to 0x${addrNum.toString(16)}`,
            line1: "",
            line2: "",
            backlight: "off",
            displayEnabled: false,
            cursorEnabled: false,
          };

          components[lcdNode.id] = {
            ...(components[lcdNode.id] ?? {
              nodeId: lcdNode.id,
              componentType: lcdNode.data.componentType,
              label: lcdNode.data.label,
              isPowered: false,
              brightness: 0,
              voltage: 0,
              pins: {},
              telemetry: {},
            }),
            isPowered: false,
            brightness: 0,
            telemetry: {
              ...(components[lcdNode.id]?.telemetry ?? {}),
              ...telemetryState,
            },
          };
        }
      }
    }
  }

  return {
    ...frame,
    components,
  };
}
