import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import type { SimContext } from "../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { frameBoardPinsToArduinoPins, upsertPinState } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { SimulatorState } from "../../arduino-simulator";
import {
  parseGasOutputPins,
  parsePotentiometerAnalogPins,
  getConnectedBoardPin,
} from "../../codeParsing/arduinoParser";
import { validateComponentConnections } from "../../../utils/connectivity";

export function applyGasSensorInputToFrame(
  frame: SimulationFrame,
  context?: SimContext,
): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || !frame.running) return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  const gasNodes = nodes.filter((n) => getNodeSimulationModel(n) === "gasSensor");
  if (gasNodes.length === 0) return frame;

  const getGasPin = (nodeId: string) =>
    getConnectedBoardPin(nodeId, "b1", nodes, edges) ||
    getConnectedBoardPin(nodeId, "b2", nodes, edges) ||
    getConnectedBoardPin(nodeId, "a1", nodes, edges) ||
    getConnectedBoardPin(nodeId, "a2", nodes, edges) ||
    getConnectedBoardPin(nodeId, "out", nodes, edges) ||
    getConnectedBoardPin(nodeId, "sig", nodes, edges);

  const poweredGasNode = gasNodes.find((n) => {
    const pin = getGasPin(n.id);
    return validateComponentConnections(n, nodes, edges) && pin !== null;
  });

  if (!poweredGasNode) {
    const targetPinNumbers = new Set(
      gasNodes.map(n => {
        const pin = getGasPin(n.id);
        return pin ? pin.pinNumber : null;
      }).filter((p): p is number => p !== null)
    );

    const boardPins = frame.boardPins.map(pin => {
      if (targetPinNumbers.has(pin.pin)) {
        return {
          ...pin,
          value: 0,
          normalizedValue: 0,
          voltage: 0,
          active: false,
        };
      }
      return pin;
    });

    let isReplaced = false;
    const serialOutput = frame.serialOutput.map((line) => {
      const clean = line.trim();
      if (clean.startsWith("Gas:") || clean.startsWith("G:")) {
        isReplaced = true;
        const prefix = clean.split(":")[0] + ":";
        return `${prefix} 0`;
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
      serialOutput.push("Gas: 0");
    }

    const components = { ...frame.components };
    for (const n of gasNodes) {
      components[n.id] = {
        ...(components[n.id] ?? {
          nodeId: n.id,
          componentType: n.data.componentType,
          label: n.data.label,
          isPowered: false,
          brightness: 0,
          voltage: 0,
          pins: {},
          telemetry: {},
        }),
        isPowered: false,
        telemetry: {
          ...(components[n.id]?.telemetry ?? {}),
          error: "Sensor Pins Disconnected",
        },
      };
    }

    return {
      ...frame,
      boardPins,
      serialOutput: serialOutput.slice(-100),
      components,
    };
  }

  const connectedPin = getGasPin(poweredGasNode.id);

  const gasLevel = Number(poweredGasNode.data.properties?.gasLevel?.value ?? 0);
  const targetPin = connectedPin ? connectedPin.pinNumber : 14;

  const pins = frameBoardPinsToArduinoPins(frame);
  if (connectedPin) {
    pins.set(targetPin, { mode: "INPUT", value: Math.round((gasLevel / 1023) * 255) });
  }

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

  const components = { ...frame.components, ...nextFrame.components };
  for (const n of gasNodes) {
    const pin = getGasPin(n.id);
    const isPowered = validateComponentConnections(n, nodes, edges) && pin !== null;
    const level = isPowered ? Number(n.data.properties?.gasLevel?.value ?? 0) : 0;
    const previous = components[n.id];
    const { error, ...restTelemetry } = previous?.telemetry ?? {};
    components[n.id] = {
      ...(previous ?? {
        nodeId: n.id,
        componentType: n.data.componentType,
        label: n.data.label,
        isPowered: false,
        brightness: 0,
        voltage: isPowered ? 5.0 : 0,
        pins: {},
        telemetry: {},
      }),
      isPowered,
      voltage: isPowered ? 5.0 : 0,
      telemetry: isPowered ? {
        ...restTelemetry,
        gasLevel: level,
      } : {
        ...(previous?.telemetry ?? {}),
        error: "Sensor Pins Disconnected",
      },
    };
  }

  return { ...nextFrame, components };
}

// Checks direct edge connectivity between sensor pins and a multimeter probe (breadboard multi-hop requires conductive graph traversal).
function isSensorConnectedToMultimeter(
  sensorNodeId: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): boolean {
  return edges.some((edge) => {
    const isTarget = edge.target === sensorNodeId && (edge.targetHandle === "pin1" || edge.targetHandle === "pin2");
    const isSource = edge.source === sensorNodeId && (edge.sourceHandle === "pin1" || edge.sourceHandle === "pin2");
    if (!isTarget && !isSource) return false;
    const otherId = isTarget ? edge.source : edge.target;
    const otherNode = nodes.find((n) => n.id === otherId);
    return otherNode ? getNodeSimulationModel(otherNode) === "multimeter" : false;
  });
}

export function applyForceSensorInputToFrame(
  frame: SimulationFrame,
  context?: SimContext,
): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || !frame.running) return frame;

  const nodes = context?.nodes ?? useCircuitStore.getState().nodes;
  const edges = context?.edges ?? useCircuitStore.getState().edges;
  const arduinoCode = context?.arduinoCode ?? useCircuitStore.getState().arduinoCode;
  const forceNodes = nodes.filter((n) => getNodeSimulationModel(n) === "forceSensor");
  if (forceNodes.length === 0) return frame;

  const poweredForceNode = forceNodes.find((n) => {
    const pin = getConnectedBoardPin(n.id, "pin1", nodes, edges) || getConnectedBoardPin(n.id, "pin2", nodes, edges);
    return (validateComponentConnections(n, nodes, edges) && pin !== null) || isSensorConnectedToMultimeter(n.id, nodes, edges);
  });

  if (!poweredForceNode) {
    const targetPinNumbers = new Set(
      forceNodes.map(n => {
        const pin = getConnectedBoardPin(n.id, "pin1", nodes, edges) || getConnectedBoardPin(n.id, "pin2", nodes, edges);
        return pin ? pin.pinNumber : null;
      }).filter((p): p is number => p !== null)
    );

    const boardPins = frame.boardPins.map(pin => {
      if (targetPinNumbers.has(pin.pin)) {
        return {
          ...pin,
          value: 0,
          normalizedValue: 0,
          voltage: 0,
          active: false,
        };
      }
      return pin;
    });

    let isReplaced = false;
    const serialOutput = frame.serialOutput.map((line) => {
      const clean = line.trim();
      if (clean.startsWith("Force:") || clean.startsWith("F:")) {
        isReplaced = true;
        const prefix = clean.split(":")[0] + ":";
        return `${prefix} 0`;
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
      serialOutput.push("Force: 0");
    }

    const components = { ...frame.components };
    for (const n of forceNodes) {
      components[n.id] = {
        ...(components[n.id] ?? {
          nodeId: n.id,
          componentType: n.data.componentType,
          label: n.data.label,
          isPowered: false,
          brightness: 0,
          voltage: 0,
          pins: {},
          telemetry: {},
        }),
        isPowered: false,
        telemetry: {
          ...(components[n.id]?.telemetry ?? {}),
          error: "Sensor Pins Disconnected",
        },
      };
    }

    return {
      ...frame,
      boardPins,
      serialOutput: serialOutput.slice(-100),
      components,
    };
  }

  const connectedPin =
    getConnectedBoardPin(poweredForceNode.id, "pin1", nodes, edges) ||
    getConnectedBoardPin(poweredForceNode.id, "pin2", nodes, edges);

  const forceVal = Number(poweredForceNode.data.properties?.force?.value ?? 0);
  const analogValue = Math.round((forceVal / 10) * 1023);
  const targetPin = connectedPin ? connectedPin.pinNumber : 14;

  const pins = frameBoardPinsToArduinoPins(frame);
  if (connectedPin) {
    pins.set(targetPin, {
      mode: "INPUT",
      value: Math.round((analogValue / 1023) * 255),
    });
  }

  const parsed = parsePotentiometerAnalogPins(arduinoCode, analogValue);
  if (parsed) {
    for (const output of parsed.outputs) {
      pins.set(output.pin, {
        mode: "OUTPUT",
        value: output.value,
      });
    }
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

  const components = { ...frame.components, ...nextFrame.components };
  for (const n of forceNodes) {
    const pin = getConnectedBoardPin(n.id, "pin1", nodes, edges) || getConnectedBoardPin(n.id, "pin2", nodes, edges);
    const isPowered = (validateComponentConnections(n, nodes, edges) && pin !== null) || isSensorConnectedToMultimeter(n.id, nodes, edges);
    const level = isPowered ? Number(n.data.properties?.force?.value ?? 0) : 0;
    const previous = components[n.id];
    const { error, ...restTelemetry } = previous?.telemetry ?? {};
    components[n.id] = {
      ...(previous ?? {
        nodeId: n.id,
        componentType: n.data.componentType,
        label: n.data.label,
        isPowered: false,
        brightness: 0,
        voltage: isPowered ? 5.0 : 0,
        pins: {
          pin1: { handleId: "pin1", voltage: isPowered ? 5.0 : 0, normalizedValue: isPowered ? 1.0 : 0, active: isPowered },
          pin2: { handleId: "pin2", voltage: isPowered ? 5.0 : 0, normalizedValue: isPowered ? 1.0 : 0, active: isPowered },
        },
        telemetry: {},
      }),
      isPowered,
      voltage: isPowered ? 5.0 : 0,
      pins: {
        ...(previous?.pins ?? {}),
        pin1: { handleId: "pin1", voltage: isPowered ? 5.0 : 0, normalizedValue: isPowered ? 1.0 : 0, active: isPowered },
        pin2: { handleId: "pin2", voltage: isPowered ? 5.0 : 0, normalizedValue: isPowered ? 1.0 : 0, active: isPowered },
      },
      telemetry: isPowered ? {
        ...restTelemetry,
        force: level,
      } : {
        ...(previous?.telemetry ?? {}),
        error: "Sensor Pins Disconnected",
      },
    };
  }

  return { ...nextFrame, components };
}