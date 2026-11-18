import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { frameBoardPinsToArduinoPins } from "../../circuit/pinMapping";
import { buildSimulationFrame, getPotentiometerWiperVoltage } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { SimulatorState } from "../../arduino-simulator";
import {
  parsePhotoresistorAnalogValue,
  parsePotentiometerAnalogPins,
  getConnectedBoardPin,
} from "../../codeParsing/arduinoParser";
import { validateComponentConnections } from "../../../utils/connectivity";

export function applyPhotoresistorInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || !frame.running) return frame;

  const { nodes, edges } = useCircuitStore.getState();
  const photoresistors = nodes.filter(
    (node) => getNodeSimulationModel(node) === "photoresistor",
  );
  if (photoresistors.length === 0) return frame;

  const poweredPhotoresistor = photoresistors.find((n) => {
    const pin =
      getConnectedBoardPin(n.id, "pin1", nodes, edges) ||
      getConnectedBoardPin(n.id, "pin2", nodes, edges);
    return validateComponentConnections(n, nodes, edges) && pin !== null;
  });

  if (!poweredPhotoresistor) {
    const targetPinNumbers = new Set(
      photoresistors.map(n => {
        const pin =
          getConnectedBoardPin(n.id, "pin1", nodes, edges) ||
          getConnectedBoardPin(n.id, "pin2", nodes, edges);
        return pin ? pin.pinNumber : null;
      }).filter((p): p is number => p !== null)
    );

    const boardPins = frame.boardPins.map(pin => {
      if (targetPinNumbers.has(pin.pin)) {
        return { ...pin, value: 0, normalizedValue: 0, voltage: 0, active: false };
      }
      return pin;
    });

    const { arduinoCode } = useCircuitStore.getState();
    const hasSerialPrint = arduinoCode.includes("Serial.print");
    const serialOutput = hasSerialPrint
      ? frame.serialOutput
      : [...frame.serialOutput.slice(-99), "0"];

    const components = { ...frame.components };
    for (const n of photoresistors) {
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
      serialOutput,
      components,
    };
  }

  const connectedPin =
    getConnectedBoardPin(poweredPhotoresistor.id, "pin1", nodes, edges) ||
    getConnectedBoardPin(poweredPhotoresistor.id, "pin2", nodes, edges);

  const analogValue = parsePhotoresistorAnalogValue(poweredPhotoresistor);
  const targetPin = connectedPin ? connectedPin.pinNumber : 14;

  const pins = frameBoardPinsToArduinoPins(frame);
  if (connectedPin) {
    pins.set(targetPin, {
      mode: "INPUT",
      value: Math.round((analogValue / 1023) * 255),
    });
  }

  const { arduinoCode } = useCircuitStore.getState();
  const parsed = parsePotentiometerAnalogPins(arduinoCode, analogValue);
  if (parsed) {
    for (const output of parsed.outputs) {
      pins.set(output.pin, {
        mode: "OUTPUT",
        value: output.value,
      });
    }
  }

  const hasSerialPrint = arduinoCode.includes("Serial.print");
  const serialOutput = hasSerialPrint
    ? frame.serialOutput
    : [...frame.serialOutput.slice(-99), String(analogValue)];

  const arduinoState: SimulatorState = {
    pins,
    serialOutput,
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
  for (const n of photoresistors) {
    const pin =
      getConnectedBoardPin(n.id, "pin1", nodes, edges) ||
      getConnectedBoardPin(n.id, "pin2", nodes, edges);
    const isPowered = validateComponentConnections(n, nodes, edges) && pin !== null;
    const previousPhoto = components[n.id];
    const { error, ...restTelemetry } = previousPhoto?.telemetry ?? {};
    components[n.id] = {
      ...(previousPhoto ?? {
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
        lightLevel: Number(
          n.data.properties?.lightLevel?.value ?? 512,
        ),
      } : {
        ...(previousPhoto?.telemetry ?? {}),
        error: "Sensor Pins Disconnected",
      },
    };
  }

  return { ...nextFrame, components };
}

export function applyPotentiometerInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || !frame.running) return frame;

  const { nodes, edges } = useCircuitStore.getState();
  const potentiometers = nodes.filter(
    (node) => getNodeSimulationModel(node) === "potentiometer",
  );
  if (potentiometers.length === 0) return frame;

  const getPotPin = (nodeId: string) =>
    getConnectedBoardPin(nodeId, "wiper", nodes, edges) ||
    getConnectedBoardPin(nodeId, "pin2", nodes, edges);

  const poweredPot = potentiometers.find((n) => {
    const pin = getPotPin(n.id);
    return validateComponentConnections(n, nodes, edges) && pin !== null;
  });

  if (!poweredPot) {
    const targetPinNumbers = new Set(
      potentiometers.map(n => {
        const pin = getConnectedBoardPin(n.id, "wiper", nodes, edges);
//         const pin = getPotPin(n.id);
        return pin ? pin.pinNumber : null;
      }).filter((p): p is number => p !== null)
    );

    const boardPins = frame.boardPins.map(pin => {
      if (targetPinNumbers.has(pin.pin)) {
        return { ...pin, value: 0, normalizedValue: 0, voltage: 0, active: false };
      }
      return pin;
    });

    const components = { ...frame.components };
    for (const n of potentiometers) {
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
      components,
    };
  }

  const connectedPin = getConnectedBoardPin(poweredPot.id, "wiper", nodes, edges);
  const position = Math.max(0, Math.min(100, Number(poweredPot.data.properties?.position?.value ?? 50)));
  const wiperVoltage = getPotentiometerWiperVoltage(5, 0, position);
  const analogValue = Math.round((wiperVoltage / 5) * 1023);
//   const connectedPin = getPotPin(poweredPot.id);
  const { arduinoCode } = useCircuitStore.getState();

//   const positionVal = Number(poweredPot.data.properties?.position?.value ?? 50);
//   const analogValue = Math.round((positionVal / 100) * 1023);
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

  const arduinoState: SimulatorState = {
    pins,
    serialOutput: frame.serialOutput,
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
  for (const n of potentiometers) {
    const isPowered = validateComponentConnections(n, nodes, edges);
//     const pin = getPotPin(n.id);
//     const isPowered = validateComponentConnections(n, nodes, edges) && pin !== null;
    const value = isPowered ? Math.max(0, Math.min(100, Number(n.data.properties?.position?.value ?? 50))) : 0;
    const previousPot = components[n.id];
    const { error, ...restTelemetry } = previousPot?.telemetry ?? {};
    components[n.id] = {
      ...(previousPot ?? {
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
        position: value,
      } : {
        ...(previousPot?.telemetry ?? {}),
        error: "Sensor Pins Disconnected",
      },
    };
  }

  return { ...nextFrame, components };
}
