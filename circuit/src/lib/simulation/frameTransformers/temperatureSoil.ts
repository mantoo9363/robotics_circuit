import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { frameBoardPinsToArduinoPins, upsertPinState } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { SimulatorState } from "../../arduino-simulator";
import {
  parseTemperatureOutputPins,
  getConnectedBoardPin,
  stripCodeComments,
  parseArduinoConstants,
  parseSoilMoistureOutputPins,
} from "../../codeParsing/arduinoParser";
import { parsePythonReadOutputsForInput } from "../../codeParsing/picoParser";
import { validateComponentConnections } from "../../../utils/connectivity";

export function applyTemperatureSensorInputToFrame(frame: SimulationFrame): SimulationFrame {
  const status = useCircuitStore.getState().simulationStatus;
  if (status !== "running") return frame;

  const { nodes, edges } = useCircuitStore.getState();

  const tempNodes = nodes.filter(
    (node) =>
      getNodeSimulationModel(node) === "temperatureSensor" ||
      node.data.componentType === "temperatureSensor",
  );
  if (tempNodes.length === 0) return frame;

  const poweredTempNode = tempNodes.find((n) => {
    const pin = getConnectedBoardPin(n.id, "vout", nodes, edges);
    return validateComponentConnections(n, nodes, edges) && pin !== null;
  });

  if (!poweredTempNode) {
    const targetPinNumbers = new Set(
      tempNodes.map(n => {
        const pin = getConnectedBoardPin(n.id, "vout", nodes, edges);
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
    const frameSerialOutput = frame.serialOutput || [];
    const hasCustomSerialOutput = frameSerialOutput.some(line =>
      line.includes("Temp") || line.includes("ADC") || line.includes("Voltage")
    );

    let serialOutput;
    if (!hasCustomSerialOutput) {
      let isReplaced = false;
      serialOutput = frameSerialOutput.map((line) => {
        const clean = line.trim();
        if (
          clean.startsWith("Temperature:") ||
          clean.startsWith("Temp:") ||
          clean.startsWith("T:")
        ) {
          isReplaced = true;
          const prefix = clean.split(":")[0] + ":";
          return `${prefix} 0.0 C`;
        }
        if (/Temperature/i.test(line)) {
          isReplaced = true;
          return line;
        }
        return line;
      });

      if (
        !isReplaced &&
        (arduinoCode.includes("analogRead") ||
          arduinoCode.includes("Temperature"))
      ) {
        serialOutput.push("Temperature: 0.0 C");
      }
    } else {
      serialOutput = frameSerialOutput;
    }

    const components = { ...frame.components };
    for (const n of tempNodes) {
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

  const connectedPin = getConnectedBoardPin(poweredTempNode.id, "vout", nodes, edges);
  const isPowered = true;

  const celsiusValue = Math.max(-40, Math.min(125, Number(poweredTempNode.data.properties?.temperature?.value ?? 25)));

  let pinsUpdatedFrame = frame;

  if (frame.boardType === "arduino" || frame.boardType === "pico") {
    const pins = frameBoardPinsToArduinoPins(frame);
    const signalPin = connectedPin ? connectedPin.pinNumber : 16;

    const voltageMillivolts = celsiusValue * 10 + 500;
    const targetVoltage = voltageMillivolts / 1000;

    const register8BitValue = Math.round((targetVoltage / 5.0) * 255);
    if (connectedPin) {
      pins.set(signalPin, {
        mode: "INPUT",
        value: Math.max(0, Math.min(255, register8BitValue)),
      });
    }

    const { arduinoCode } = useCircuitStore.getState();
    const temperatureOutput = parseTemperatureOutputPins(
      arduinoCode,
      celsiusValue,
    );
    for (const output of temperatureOutput.pins) {
      upsertPinState(pins, output.pin, output.high);
    }

    const frameSerialOutput = frame.serialOutput || [];
    const hasCustomSerialOutput = frameSerialOutput.some(line =>
      line.includes("Temp") || line.includes("ADC") || line.includes("Voltage")
    );

    let serialOutput;
    if (!hasCustomSerialOutput) {
      const logString = `Temperature: ${celsiusValue.toFixed(1)} C`;
      let isReplaced = false;
      serialOutput = frameSerialOutput.map((line) => {
        const clean = line.trim();
        if (
          clean.startsWith("Temperature:") ||
          clean.startsWith("Temp:") ||
          clean.startsWith("T:")
        ) {
          isReplaced = true;
          const prefix = clean.split(":")[0] + ":";
          return `${prefix} ${celsiusValue.toFixed(1)} C`;
        }
        if (/Temperature/i.test(line)) {
          isReplaced = true;
          return line;
        }
        return line;
      });

      if (
        !isReplaced &&
        (arduinoCode.includes("analogRead") ||
          arduinoCode.includes("Temperature"))
      ) {
        serialOutput.push(logString);
      }
    } else {
      serialOutput = frameSerialOutput;
    }

    pinsUpdatedFrame = buildSimulationFrame({
      tick: frame.tick,
      nodes,
      edges,
      dynamicComponents: useDynamicComponentsStore.getState().components,
      boardType: frame.boardType,
      arduinoState: {
        pins,
        serialOutput: serialOutput.slice(-100),
        running: frame.running,
        error: frame.error,
      },
      running: frame.running,
      error: frame.error,
    });
  }

  const components = { ...frame.components, ...pinsUpdatedFrame.components };
  for (const n of tempNodes) {
    const pin = getConnectedBoardPin(n.id, "vout", nodes, edges);
    const isPowered = validateComponentConnections(n, nodes, edges) && pin !== null;
    const value = isPowered ? Math.max(-40, Math.min(125, Number(n.data.properties?.temperature?.value ?? 25))) : 0;
    const previousComponentState = components[n.id];
    const { error, ...restTelemetry } = previousComponentState?.telemetry ?? {};
    components[n.id] = {
      ...(previousComponentState ?? {
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
        temperatureC: value,
        voltageOut: (value * 10 + 500) / 1000,
      } : {
        ...(previousComponentState?.telemetry ?? {}),
        error: "Sensor Pins Disconnected",
      },
    };
  }

  return { ...pinsUpdatedFrame, components };
}

export function applySoilMoistureInputToFrame(frame: SimulationFrame): SimulationFrame {
  const status = useCircuitStore.getState().simulationStatus;
  if (status !== "running") return frame;

  const { nodes, edges } = useCircuitStore.getState();

  const soilNodes = nodes.filter(
    (node) => getNodeSimulationModel(node) === "soilMoisture",
  );
  if (soilNodes.length === 0) return frame;

  const poweredSoilNode = soilNodes.find((n) => {
    const pin =
      getConnectedBoardPin(n.id, "sig1", nodes, edges) ||
      getConnectedBoardPin(n.id, "sig2", nodes, edges);
    return validateComponentConnections(n, nodes, edges) && pin !== null;
  });

  if (!poweredSoilNode) {
    const targetPinNumbers = new Set(
      soilNodes.map(n => {
        const pin =
          getConnectedBoardPin(n.id, "sig1", nodes, edges) ||
          getConnectedBoardPin(n.id, "sig2", nodes, edges);
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
    let isReplaced = false;
    const serialOutput = frame.serialOutput.map((line) => {
      const clean = line.trim();
      if (
        clean.startsWith("Soil:") ||
        clean.startsWith("Moisture:") ||
        clean.startsWith("Current Moisture:") ||
        clean.startsWith("S:")
      ) {
        isReplaced = true;
        const prefix = clean.split(":")[0] + ":";
        return `${prefix} 0`;
      }
      if (/Soil/i.test(line) || /Moisture/i.test(line)) {
        isReplaced = true;
        return line;
      }
      return line;
    });

    if (
      !isReplaced &&
      (arduinoCode.includes("analogRead") ||
        arduinoCode.includes("Soil") ||
        arduinoCode.includes("moisture"))
    ) {
      serialOutput.push("Soil: 0");
    }

    const components = { ...frame.components };
    for (const n of soilNodes) {
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
    getConnectedBoardPin(poweredSoilNode.id, "sig1", nodes, edges) ||
    getConnectedBoardPin(poweredSoilNode.id, "sig2", nodes, edges);

  const moistureValue = Math.max(0, Math.min(1023, Number(poweredSoilNode.data.properties?.moisture?.value ?? 0)));

  let pinsUpdatedFrame = frame;
  let isLedHigh = false;

  if (frame.boardType === "arduino" || frame.boardType === "pico") {
    const isPico = nodes.some(n => getNodeSimulationModel(n) === "raspberrypipico");
    if (isPico) {
      const pins = frameBoardPinsToArduinoPins(frame);
      const { picoCode } = useCircuitStore.getState();
      const sensorPin = connectedPin ? connectedPin.pinNumber : 15;

      if (connectedPin) {
        pins.set(sensorPin, {
          mode: "INPUT",
          value: Math.max(0, Math.min(255, Math.round((moistureValue / 1023) * 255))),
        });
      }

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

      pinsUpdatedFrame = buildSimulationFrame({
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
    } else {
      const pins = frameBoardPinsToArduinoPins(frame);
      const signalPin = connectedPin ? connectedPin.pinNumber : 15;

      const { arduinoCode } = useCircuitStore.getState();
      const constants = parseArduinoConstants(arduinoCode);
      
      let ledPin = constants.get("ledPin") ?? constants.get("led") ?? null;
      if (ledPin === null) {
        const ledNode = nodes.find((n) => getNodeSimulationModel(n) === "led");
        if (ledNode) {
          const connected =
            getConnectedBoardPin(ledNode.id, "anode", nodes, edges) ||
            getConnectedBoardPin(ledNode.id, "anodePin", nodes, edges) ||
            getConnectedBoardPin(ledNode.id, "pin1", nodes, edges) ||
            getConnectedBoardPin(ledNode.id, "positive", nodes, edges);
          if (connected) {
            ledPin = connected.pinNumber;
          }
        }
      }

      const cleanedCode = stripCodeComments(arduinoCode);

      let isSoilInverted = false;
      let maxMoistureRange = 100;
      const mapPattern =
        /map\s*\(\s*[^,]+\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i;
      const mapMatch = cleanedCode.match(mapPattern);
      if (mapMatch) {
        const fromLow = Number(mapMatch[1].trim());
        const fromHigh = Number(mapMatch[2].trim());
        const toHigh = Number(mapMatch[4].trim());
        if (Number.isFinite(fromLow) && Number.isFinite(fromHigh)) {
          isSoilInverted = fromLow > fromHigh;
        }
        if (Number.isFinite(toHigh) && toHigh > 0) {
          maxMoistureRange = toHigh;
        }
      }

      const pinVal = isSoilInverted
        ? 255 - Math.round((moistureValue / 1023) * 255)
        : Math.round((moistureValue / 1023) * 255);

      if (connectedPin) {
        pins.set(signalPin, {
          mode: "INPUT",
          value: pinVal,
        });
      }

      const hasMapCall = mapMatch !== null;
      const moisturePercent = isSoilInverted
        ? (1023 - moistureValue) / 1023
        : moistureValue / 1023;
      const moistureScaled = hasMapCall
        ? Math.round(moisturePercent * maxMoistureRange)
        : isSoilInverted
          ? 1023 - moistureValue
          : moistureValue;

      const ifConditionMatch = cleanedCode.match(
        /if\s*\(\s*moisture\s*(<|<=|>|>=|==|!=)\s*(\d+)\s*\)/i,
      );

      if (ifConditionMatch) {
        const operator = ifConditionMatch[1];
        const threshold = Number(ifConditionMatch[2]);

        if (operator === "<") isLedHigh = moistureScaled < threshold;
        else if (operator === "<=") isLedHigh = moistureScaled <= threshold;
        else if (operator === ">") isLedHigh = moistureScaled > threshold;
        else if (operator === ">=") isLedHigh = moistureScaled >= threshold;
        else if (operator === "==") isLedHigh = moistureScaled === threshold;
        else if (operator === "!=") isLedHigh = moistureScaled !== threshold;
      } else {
        isLedHigh = moistureScaled < maxMoistureRange * 0.4;
      }

      if (ledPin !== null) {
        pins.set(ledPin, {
          mode: "OUTPUT",
          value: isLedHigh ? 255 : 0,
        });
      }

      const soilMoistureOutput = parseSoilMoistureOutputPins(
        arduinoCode,
        moistureScaled,
      );
      for (const output of soilMoistureOutput.pins) {
        upsertPinState(pins, output.pin, output.high);
      }

      const logString = `Soil: ${moistureValue}`;
      let isReplaced = false;
      const serialOutput = frame.serialOutput.map((line) => {
        const clean = line.trim();
        if (
          clean.startsWith("Soil:") ||
          clean.startsWith("Moisture:") ||
          clean.startsWith("Current Moisture:") ||
          clean.startsWith("S:")
        ) {
          isReplaced = true;
          const prefix = clean.split(":")[0] + ":";
          return `${prefix} ${moistureValue}`;
        }
        if (/Soil/i.test(line) || /Moisture/i.test(line)) {
          isReplaced = true;
          return line;
        }
        return line;
      });

      if (
        !isReplaced &&
        (arduinoCode.includes("analogRead") ||
          arduinoCode.includes("Soil") ||
          arduinoCode.includes("moisture"))
      ) {
        serialOutput.push(logString);
      }

      pinsUpdatedFrame = buildSimulationFrame({
        tick: frame.tick,
        nodes,
        edges,
        dynamicComponents: useDynamicComponentsStore.getState().components,
        boardType: frame.boardType,
        arduinoState: {
          pins,
          serialOutput: serialOutput.slice(-100),
          running: frame.running,
          error: frame.error,
        },
        running: frame.running,
        error: frame.error,
      });
    }
  }

  const components = { ...frame.components, ...pinsUpdatedFrame.components };
  for (const n of soilNodes) {
    const pin =
      getConnectedBoardPin(n.id, "sig1", nodes, edges) ||
      getConnectedBoardPin(n.id, "sig2", nodes, edges);
    const isPowered = validateComponentConnections(n, nodes, edges) && pin !== null;
    const value = isPowered ? Math.max(0, Math.min(1023, Number(n.data.properties?.moisture?.value ?? 0))) : 0;
    const previousComponentState = components[n.id];
    const { error, ...restTelemetry } = previousComponentState?.telemetry ?? {};
    components[n.id] = {
      ...(previousComponentState ?? {
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
        moisture: value,
      } : {
        ...(previousComponentState?.telemetry ?? {}),
        error: "Sensor Pins Disconnected",
      },
    };
  }

  return { ...pinsUpdatedFrame, components };
}