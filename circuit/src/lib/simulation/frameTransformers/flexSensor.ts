import type { SimulationFrame } from "../../simulation-state";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { frameBoardPinsToArduinoPins } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { SimulatorState } from "../../arduino-simulator";
import {
  parsePotentiometerAnalogPins,
  getConnectedBoardPin,
} from "../../codeParsing/arduinoParser";
import { validateComponentConnections } from "../../../utils/connectivity";

/** Evaluates the Flex Sensor bend angle and propagates mapped analog voltage input to the microcontroller simulation frame. */
export function applyFlexSensorInputToFrame(frame: SimulationFrame): SimulationFrame {
  const status = useCircuitStore.getState().simulationStatus;
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || status !== "running") return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  const flexNodes = nodes.filter((n) => getNodeSimulationModel(n) === "flexSensor");
  if (flexNodes.length === 0) return frame;

  const poweredFlexNode = flexNodes.find((n) => {
    const pin = getConnectedBoardPin(n.id, "pin1", nodes, edges) || getConnectedBoardPin(n.id, "pin2", nodes, edges);
    return validateComponentConnections(n, nodes, edges) && pin !== null;
  });

  if (!poweredFlexNode) {
    const targetPinNumbers = new Set(
      flexNodes.map(n => {
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
      if (clean.startsWith("Flex:") || clean.startsWith("Bend:")) {
        isReplaced = true;
        const prefix = clean.split(":")[0] + ":";
        return `${prefix} 0`;
      }
      if (/Flex/i.test(line)) {
        isReplaced = true;
        return line;
      }
      return line;
    });

    if (
      !isReplaced &&
      (arduinoCode.includes("analogRead") || arduinoCode.includes("Flex"))
    ) {
      serialOutput.push("Flex: 0");
    }

    const components = { ...frame.components };
    for (const n of flexNodes) {
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
    getConnectedBoardPin(poweredFlexNode.id, "pin1", nodes, edges) ||
    getConnectedBoardPin(poweredFlexNode.id, "pin2", nodes, edges);

  const bendVal = Number(poweredFlexNode.data.properties?.bend?.value ?? 0);
  // Linear scale: 0° flat maps to 1023, 180° fully bent maps to 0
  const analogValue = Math.round((1 - bendVal / 180) * 1023);
  const targetPin = connectedPin ? connectedPin.pinNumber : 14;

  if (frame.boardType === "pico") {
    const components = { ...frame.components };
    for (const n of flexNodes) {
      const pin = getConnectedBoardPin(n.id, "pin1", nodes, edges) || getConnectedBoardPin(n.id, "pin2", nodes, edges);
      const isPowered = validateComponentConnections(n, nodes, edges) && pin !== null;
      const level = isPowered ? Number(n.data.properties?.bend?.value ?? 0) : 0;
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
          bend: level,
        } : {
          ...(previous?.telemetry ?? {}),
          error: "Sensor Pins Disconnected",
        },
      };
    }
    return { ...frame, components };
  }

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

  const logString = `Flex: ${analogValue}`;
  let isReplaced = false;
  const serialOutput = frame.serialOutput.map((line) => {
    const clean = line.trim();
    if (clean.startsWith("Flex:") || clean.startsWith("Bend:")) {
      isReplaced = true;
      const prefix = clean.split(":")[0] + ":";
      return `${prefix} ${analogValue}`;
    }
    if (/Flex/i.test(line)) {
      isReplaced = true;
      return line;
    }
    return line;
  });

  if (
    !isReplaced &&
    (arduinoCode.includes("analogRead") || arduinoCode.includes("Flex"))
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
  for (const n of flexNodes) {
    const pin = getConnectedBoardPin(n.id, "pin1", nodes, edges) || getConnectedBoardPin(n.id, "pin2", nodes, edges);
    const isPowered = validateComponentConnections(n, nodes, edges) && pin !== null;
    const level = isPowered ? Number(n.data.properties?.bend?.value ?? 0) : 0;
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
        bend: level,
      } : {
        ...(previous?.telemetry ?? {}),
        error: "Sensor Pins Disconnected",
      },
    };
  }

  return { ...nextFrame, components };
}
