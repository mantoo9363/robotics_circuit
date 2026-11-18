import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { frameBoardPinsToArduinoPins, getArduinoDigitalPinForComponentConnection } from "../../circuit/pinMapping";
import { buildSimulationFrame, TILT_THRESHOLD } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { SimulatorState } from "../../arduino-simulator";
import {
  getTimedDigitalWritePinsAtTime,
  stripCodeComments,
  parseArduinoConstants,
  resolveArduinoNumber,
} from "../../codeParsing/arduinoParser";
import { getReachableGraphNodes, addGraphConnection } from "../../circuit/graph";

export function applyTimedDigitalWriteInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType === "arduino" || frame.boardType === "pico") && frame.running) return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  const outputPins = getTimedDigitalWritePinsAtTime(
    arduinoCode,
    frame.timestamp,
  );
  if (!outputPins) return frame;

  const pins = frameBoardPinsToArduinoPins(frame);
  for (const [pin, high] of outputPins) {
    pins.set(pin, {
      mode: "OUTPUT",
      value: high ? 255 : 0,
    });
  }

  const arduinoState: SimulatorState = {
    pins,
    serialOutput: frame.serialOutput,
    running: frame.running,
    error: frame.error,
  };

  return buildSimulationFrame({
    tick: frame.tick,
    nodes,
    edges,
    dynamicComponents: useDynamicComponentsStore.getState().components,
    boardType: frame.boardType,
    arduinoState,
    running: frame.running,
    error: frame.error,
  });
}



export function applyFunctionGeneratorInputToFrame(frame: SimulationFrame): SimulationFrame {
  const { nodes, edges } = useCircuitStore.getState();
  if (
    !nodes.some((node) => getNodeSimulationModel(node) === "functionGenerator")
  )
    return frame;

  const arduinoState: SimulatorState | undefined =
    (frame.boardType === "arduino" || frame.boardType === "pico")
      ? {
          pins: frameBoardPinsToArduinoPins(frame),
          serialOutput: frame.serialOutput,
          running: frame.running,
          error: frame.error,
        }
      : undefined;

  return buildSimulationFrame({
    tick: frame.tick,
    nodes,
    edges,
    dynamicComponents: useDynamicComponentsStore.getState().components,
    boardType: frame.boardType,
    arduinoState,
    running: frame.running,
    error: frame.error,
  });
}

export function applyDigitalReadSerialSyncToFrame(frame: SimulationFrame): SimulationFrame {
  if (!frame.running || (frame.boardType !== "arduino" && frame.boardType !== "pico")) return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  const readPins = getArduinoDigitalReadPinsFromCode(arduinoCode);
  if (readPins.length === 0) return frame;

  const arduinoNode = nodes.find(
    (node) => (node.data.componentType || node.type) === "arduino",
  );
  const boardPins = [...frame.boardPins];
  let serialOutput = frame.serialOutput;

  for (const pin of readPins) {
    const circuitHigh = resolveArduinoDigitalInputFromCircuit(
      pin,
      nodes,
      edges,
      frame,
    );
    const ne555Node = arduinoNode
      ? nodes.find(
          (node) =>
            getNodeSimulationModel(node) === "ne555" &&
            getArduinoDigitalPinForComponentConnection(
              node.id,
              "pin3_out",
              arduinoNode.id,
              edges,
            ) === pin,
        )
      : null;
    const ne555Voltage = ne555Node
      ? Number(frame.components[ne555Node.id]?.telemetry?.outputVoltage ?? NaN)
      : NaN;
    const boardPin = boardPins.find((candidate) => candidate.pin === pin);
    const high =
      circuitHigh !== null
        ? circuitHigh
        : Number.isFinite(ne555Voltage)
          ? ne555Voltage >= 3
          : (boardPin?.normalizedValue ?? 0) >= 0.5;

    if (boardPin) {
      // Never override an OUTPUT pin — sensor inputs shouldn't change actuator modes
      if (boardPin.mode === "OUTPUT") continue;
      boardPin.mode =
        boardPin.mode === "INPUT_PULLUP" ? "INPUT_PULLUP" : "INPUT";
      boardPin.value = high ? 255 : 0;
      boardPin.normalizedValue = high ? 1 : 0;
      boardPin.voltage = high ? 5 : 0;
      boardPin.active = true;
    }

    const linePattern = new RegExp(`^\\s*D${pin}\\s*=\\s*[01]\\s*$`, "i");
    const nextReadLine = `D${pin} = ${high ? 1 : 0}`;
    let replaced = false;
    serialOutput = serialOutput.map((line) => {
      if (!linePattern.test(line)) return line;
      replaced = true;
      return nextReadLine;
    });
    if (
      !replaced &&
      new RegExp(
        `Serial\\.print\\s*\\(\\s*["']D${pin}\\s*=\\s*["']\\s*\\)`,
        "i",
      ).test(arduinoCode)
    ) {
      serialOutput = [...serialOutput.slice(-99), nextReadLine];
    }
  }

  return { ...frame, boardPins, serialOutput };
}

function getArduinoDigitalReadPinsFromCode(code: string): number[] {
  const cleaned = stripCodeComments(code);
  const constants = parseArduinoConstants(cleaned);
  const pins = new Set<number>();
  const readPattern = /\bdigitalRead\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)/g;

  for (const match of cleaned.matchAll(readPattern)) {
    const pin = resolveArduinoNumber(match[1], constants);
    if (pin !== null && pin >= 0 && pin <= 13) pins.add(pin);
  }

  return Array.from(pins);
}

export function resolveArduinoDigitalInputFromCircuit(
  pin: number,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  frame: SimulationFrame,
): boolean | null {
  const arduinoNode = nodes.find(
    (node) => getNodeSimulationModel(node) === "arduino",
  );
  if (!arduinoNode) return null;

  const graph = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    addGraphConnection(
      graph,
      `${edge.source}:${edge.sourceHandle}`,
      `${edge.target}:${edge.targetHandle}`,
    );
  }

  for (const node of nodes) {
    const model = getNodeSimulationModel(node);

    if (model === "resistor" || model === "capacitor" || model === "inductor") {
      addGraphConnection(graph, `${node.id}:pin1`, `${node.id}:pin2`);
    }

    if (model === "tiltSensor") {
      const angle = Number(node.data.properties?.angle?.value ?? 0);
      if (angle >= TILT_THRESHOLD) {
        addGraphConnection(graph, `${node.id}:pin1`, `${node.id}:pin2`);
      }
    }

    if (model === "pushbutton") {
      addGraphConnection(graph, `${node.id}:pin1a`, `${node.id}:pin1b`);
      addGraphConnection(graph, `${node.id}:pin2a`, `${node.id}:pin2b`);
      if (node.data.properties?.state?.value === "on") {
        addGraphConnection(graph, `${node.id}:pin1a`, `${node.id}:pin2a`);
        addGraphConnection(graph, `${node.id}:pin1b`, `${node.id}:pin2b`);
      }
    }

    if (model === "slideswitch") {
      const state = node.data.properties?.state?.value;
      const common = "common";
      if (state === "left" || state === "off") {
        addGraphConnection(graph, `${node.id}:${common}`, `${node.id}:pin1`);
      } else if (state === "right" || state === "on") {
        addGraphConnection(graph, `${node.id}:${common}`, `${node.id}:pin2`);
      }
    }

    if (model === "arduino") {
      addGraphConnection(graph, `${node.id}:gnd1`, `${node.id}:gnd2`);
      addGraphConnection(graph, `${node.id}:gnd2`, `${node.id}:gnd3`);
    }
  }

  const inputReach = getReachableGraphNodes(graph, `${arduinoNode.id}:d${pin}`);
  let strongestSourceVoltage = 0;
  let grounded = false;

  const addSourceIfReachable = (endpoint: string, voltage: number) => {
    if (inputReach.has(endpoint))
      strongestSourceVoltage = Math.max(strongestSourceVoltage, voltage);
  };

  const addGroundIfReachable = (endpoint: string) => {
    if (inputReach.has(endpoint)) grounded = true;
  };

  addSourceIfReachable(`${arduinoNode.id}:5v`, 5);
  addSourceIfReachable(`${arduinoNode.id}:3v3`, 3.3);

  for (const groundHandle of ["gnd1", "gnd2", "gnd3"]) {
    addGroundIfReachable(`${arduinoNode.id}:${groundHandle}`);
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
    }

    if (model === "ne555") {
      const outputVoltage = Number(
        frame.components[node.id]?.telemetry?.outputVoltage ?? NaN,
      );
      if (Number.isFinite(outputVoltage))
        addSourceIfReachable(`${node.id}:pin3_out`, outputVoltage);
      addGroundIfReachable(`${node.id}:pin1_gnd`);
    }

    if (model === "functionGenerator") {
      const enabled = node.data.properties?.enabled?.value === "on";
      const amplitude = Math.max(
        0,
        Math.min(10, Number(node.data.properties?.amplitude?.value ?? 0)),
      );
      const offset = Math.max(
        -5,
        Math.min(5, Number(node.data.properties?.offset?.value ?? 0)),
      );
      addSourceIfReachable(
        `${node.id}:positive`,
        enabled ? Math.max(0, Math.min(10, offset + amplitude)) : 0,
      );
      addGroundIfReachable(`${node.id}:negative`);
    }
  }

  const isPullUp = frame.boardPins.find((p) => p.pin === pin)?.mode === "INPUT_PULLUP";
  if (isPullUp && !grounded) {
    strongestSourceVoltage = Math.max(strongestSourceVoltage, 5);
  }

  if (grounded) return false;
  if (strongestSourceVoltage <= 0 && !grounded) return null;
  return strongestSourceVoltage >= 2.5;
}


