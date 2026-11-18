import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../../circuit/graph";
import { getEndpointVoltage, getDirectArduinoAnalogPinForComponent as getDirectPin, frameBoardPinsToArduinoPins, upsertPinState } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { parseGasOutputPins, parseTemperatureOutputPins, parseUltrasonicOutputPins, parsePotentiometerAnalogPins } from "../../codeParsing/arduinoParser";
import { parsePythonReadOutputsForInput } from "../../codeParsing/picoParser";
import { SimulatorState } from "../../arduino-simulator";
import { validateComponentConnections } from "../../../utils/connectivity";

export function applyGasSensorInputToFrame(frame: SimulationFrame): SimulationFrame {
  const status = useCircuitStore.getState().simulationStatus;
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || status !== "running") return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  const gasLevel = nodes.reduce((max, node) => {
    if (getNodeSimulationModel(node) !== "gasSensor") return max;
    return Math.max(max, Number(node.data.properties?.gasLevel?.value ?? 0));
  }, 0);
  const isPico = nodes.some(n => getNodeSimulationModel(n) === "raspberrypipico");
  if (isPico) {
    const pins = frameBoardPinsToArduinoPins(frame);
    const { picoCode } = useCircuitStore.getState();
    const gasNode = nodes.find((n) => getNodeSimulationModel(n) === "gasSensor");
    if (!gasNode) return frame;

    const sensorPin = getDirectPin(gasNode.id, ["a", "pin1", "pin2"], nodes, edges) ?? 26;

    pins.set(sensorPin, {
      mode: "INPUT",
      value: Math.max(0, Math.min(255, Math.round((gasLevel / 1023) * 255))),
    });

    const parsedOutputs = parsePythonReadOutputsForInput(
      picoCode,
      sensorPin,
      true,
      frame.timestamp,
    );

    if (parsedOutputs) {
      for (const output of parsedOutputs.outputs) {
        upsertPinState(pins, output.pin, output.high);
      }
    }

    const nextFrame = buildSimulationFrame({
      tick: frame.tick,
      nodes,
      edges,
      dynamicComponents: useDynamicComponentsStore.getState().components,
      boardType: frame.boardType,
      arduinoState: {
        pins,
        serialOutput: (parsedOutputs?.serialLines && parsedOutputs.serialLines.length > 0)
          ? [...frame.serialOutput, ...parsedOutputs.serialLines].slice(-100)
          : frame.serialOutput,
        running: frame.running,
        error: frame.error,
      },
      running: frame.running,
      error: frame.error,
    });

    const components = { ...nextFrame.components };
    const previous = components[gasNode.id];
    components[gasNode.id] = {
      ...(previous ?? {
        nodeId: gasNode.id,
        componentType: gasNode.data.componentType,
        label: gasNode.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 5.0,
        pins: {},
        telemetry: {},
      }),
      isPowered: true,
      telemetry: {
        ...(previous?.telemetry ?? {}),
        gasLevel,
      },
    };

    return { ...nextFrame, components };
  }

  const hasGasSensor = nodes.some(
    (node) => getNodeSimulationModel(node) === "gasSensor",
  );
  if (!hasGasSensor) return frame;

  if (!arduinoCode.includes("analogRead") || !arduinoCode.includes("A0"))
    return frame;

  const pins = frameBoardPinsToArduinoPins(frame);
  pins.set(14, { mode: "INPUT", value: Math.round((gasLevel / 1023) * 255) });

  const gasOutput = parseGasOutputPins(arduinoCode, gasLevel);
  if (gasOutput) {
    for (const output of gasOutput.pins) {
      upsertPinState(pins, output.pin, output.high);
    }
  }

  const logString = `Gas: ${gasLevel}`;
  let isReplaced = false;
  const serialOutput = frame.serialOutput.map((line) => {
    const clean = line.trim();
    if (clean.startsWith("Gas:") || clean.startsWith("G:")) {
      isReplaced = true;
      const prefix = clean.split(":")[0] + ":";
      return `${prefix} ${gasLevel}`;
    }
    if (/Gas/i.test(line)) {
      isReplaced = true;
      return line;
    }
    return line;
  });

  if (
    !isReplaced &&
    (arduinoCode.includes("analogRead") || arduinoCode.includes("Gas"))
  ) {
    serialOutput.push(logString);
  }

  const arduinoState = {
    pins,
    serialOutput: serialOutput.slice(-100),
    running: frame.running,
    error: frame.error,
  };

  const nextFrame = buildSimulationFrame({
    tick: frame.tick,
    nodes,
    edges,
    dynamicComponents: useDynamicComponentsStore.getState().components,
    boardType: frame.boardType,
    arduinoState,
    running: frame.running,
    error: frame.error,
  });

  const components = { ...nextFrame.components };
  const gasNode = nodes.find((n) => getNodeSimulationModel(n) === "gasSensor");
  if (gasNode) {
    const isPowered = validateComponentConnections(gasNode, nodes, edges);
    const previous = components[gasNode.id];
    components[gasNode.id] = {
      ...(previous ?? {
        nodeId: gasNode.id,
        componentType: gasNode.data.componentType,
        label: gasNode.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 5.0,
        pins: {},
        telemetry: {},
      }),
      isPowered,
      voltage: isPowered ? 5.0 : 0,
      telemetry: {
        ...(previous?.telemetry ?? {}),
        gasLevel: isPowered ? gasLevel : 0,
      },
    };
  }

  return { ...nextFrame, components };
}

export function applyForceSensorInputToFrame(frame: SimulationFrame): SimulationFrame {
  const status = useCircuitStore.getState().simulationStatus;
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || status !== "running") return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  const isPico = nodes.some(n => getNodeSimulationModel(n) === "raspberrypipico");
  if (isPico) {
    const pins = frameBoardPinsToArduinoPins(frame);
    const { picoCode } = useCircuitStore.getState();
    const forceSensors = nodes.filter(
      (node) => getNodeSimulationModel(node) === "forceSensor",
    );
    if (forceSensors.length === 0) return frame;

    const forceSensor = forceSensors[0];
    const forceVal = Number(forceSensor.data.properties?.force?.value ?? 0);
    const analogValue = Math.round((forceVal / 10) * 1023);

    const sensorPin = getDirectPin(forceSensor.id, ["pin1", "pin2"], nodes, edges) ?? 26;

    pins.set(sensorPin, {
      mode: "INPUT",
      value: Math.max(0, Math.min(255, Math.round((analogValue / 1023) * 255))),
    });

    const parsedOutputs = parsePythonReadOutputsForInput(
      picoCode,
      sensorPin,
      true,
      frame.timestamp,
    );

    if (parsedOutputs) {
      for (const output of parsedOutputs.outputs) {
        upsertPinState(pins, output.pin, output.high);
      }
    }

    const nextFrame = buildSimulationFrame({
      tick: frame.tick,
      nodes,
      edges,
      dynamicComponents: useDynamicComponentsStore.getState().components,
      boardType: frame.boardType,
      arduinoState: {
        pins,
        serialOutput: (parsedOutputs?.serialLines && parsedOutputs.serialLines.length > 0)
          ? [...frame.serialOutput, ...parsedOutputs.serialLines].slice(-100)
          : frame.serialOutput,
        running: frame.running,
        error: frame.error,
      },
      running: frame.running,
      error: frame.error,
    });

    const components = { ...nextFrame.components };
    const previous = components[forceSensor.id];
    components[forceSensor.id] = {
      ...(previous ?? {
        nodeId: forceSensor.id,
        componentType: forceSensor.data.componentType,
        label: forceSensor.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 5.0,
        pins: {},
        telemetry: {},
      }),
      isPowered: true,
      telemetry: {
        ...(previous?.telemetry ?? {}),
        forceVal,
      },
    };

    return { ...nextFrame, components };
  }

  const forceSensors = nodes.filter(
    (node) => getNodeSimulationModel(node) === "forceSensor",
  );
  if (forceSensors.length === 0) return frame;

  const forceSensor = forceSensors[0];
  const forceVal = Number(forceSensor.data.properties?.force?.value ?? 0);
  const analogValue = Math.round((forceVal / 10) * 1023);

  const parsed = parsePotentiometerAnalogPins(arduinoCode, analogValue);
  if (!parsed) return frame;

  const directAnalogPin = getDirectArduinoAnalogPinForComponent(
    forceSensor.id,
    ["pin1", "pin2"],
    nodes,
    edges,
  );
  const hasPotentiometer = nodes.some(
    (node) => getNodeSimulationModel(node) === "potentiometer",
  );
  if (directAnalogPin !== null && parsed.analogPin !== directAnalogPin)
    return frame;
  if (directAnalogPin === null && hasPotentiometer) return frame;

  const pins = frameBoardPinsToArduinoPins(frame);
  pins.set(parsed.analogPin, {
    mode: "INPUT",
    value: Math.round((parsed.analogValue / 1023) * 255),
  });

  for (const output of parsed.outputs) {
    pins.set(output.pin, {
      mode: "OUTPUT",
      value: output.value,
    });
  }

  const logString = `Force: ${analogValue}`;
  let isReplaced = false;
  const serialOutput = frame.serialOutput.map((line) => {
    const clean = line.trim();
    if (clean.startsWith("Force:") || clean.startsWith("F:")) {
      isReplaced = true;
      const prefix = clean.split(":")[0] + ":";
      return `${prefix} ${analogValue}`;
    }
    if (/Force/i.test(line)) {
      isReplaced = true;
      return line;
    }
    return line;
  });

  if (
    !isReplaced &&
    (arduinoCode.includes("analogRead") || arduinoCode.includes("Force"))
  ) {
    serialOutput.push(logString);
  }

  const arduinoState: SimulatorState = {
    pins,
    serialOutput: serialOutput.slice(-100),
    running: frame.running,
    error: frame.error,
  };

  const nextFrame = buildSimulationFrame({
    tick: frame.tick,
    nodes,
    edges,
    dynamicComponents: useDynamicComponentsStore.getState().components,
    boardType: frame.boardType,
    arduinoState,
    running: frame.running,
    error: frame.error,
  });

  const components = { ...nextFrame.components };
  const isPowered = validateComponentConnections(forceSensor, nodes, edges);
  const previousForce = components[forceSensor.id];
  components[forceSensor.id] = {
    ...(previousForce ?? {
      nodeId: forceSensor.id,
      componentType: forceSensor.data.componentType,
      label: forceSensor.data.label,
      isPowered: false,
      brightness: 0,
      voltage: 5.0,
      pins: {},
      telemetry: {},
    }),
    isPowered,
    voltage: isPowered ? 5.0 : 0,
    telemetry: {
      ...(previousForce?.telemetry ?? {}),
      force: isPowered ? forceVal : 0,
    },
  };

  return { ...nextFrame, components };
}

function getDirectArduinoAnalogPinForComponent(
  componentNodeId: string,
  componentHandles: string[],
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): number | null {
  const arduinoNode = nodes.find(
    (node) => getNodeSimulationModel(node) === "arduino",
  );
  if (!arduinoNode) return null;
  const handles = new Set(componentHandles);

  for (const edge of edges) {
    const componentToBoard =
      edge.source === componentNodeId &&
      edge.sourceHandle &&
      handles.has(edge.sourceHandle) &&
      edge.target === arduinoNode.id;
    const boardToComponent =
      edge.target === componentNodeId &&
      edge.targetHandle &&
      handles.has(edge.targetHandle) &&
      edge.source === arduinoNode.id;
    const boardHandle = componentToBoard
      ? edge.targetHandle
      : boardToComponent
        ? edge.sourceHandle
        : null;
    const match = String(boardHandle ?? "").match(/^a([0-5])$/i);
    if (match) return 14 + Number(match[1]);
  }

  return null;
}