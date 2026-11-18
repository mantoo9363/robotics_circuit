import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { frameBoardPinsToArduinoPins, upsertPinState, getDirectArduinoAnalogPinForComponent } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { SimulatorState } from "../../arduino-simulator";
import { parsePotentiometerAnalogPins, parsePhotoresistorAnalogValue, parseTemperatureOutputPins, parseUltrasonicOutputPins } from "../../codeParsing/arduinoParser";
import { parsePythonReadOutputsForInput } from "../../codeParsing/picoParser";
import { validateComponentConnections } from "../../../utils/connectivity";

export function applyTemperatureSensorInputToFrame(frame: SimulationFrame): SimulationFrame {
  const status = useCircuitStore.getState().simulationStatus;
  if (status !== "running") return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();

  const tempNode = nodes.find(
    (node) =>
      getNodeSimulationModel(node) === "temperatureSensor" ||
      node.data.componentType === "temperatureSensor",
  );
  if (!tempNode) return frame;

  const celsiusValue = Math.max(
    -40,
    Math.min(125, Number(tempNode.data.properties?.temperature?.value ?? 25)),
  );
  if (!Number.isFinite(celsiusValue)) return frame;

  let pinsUpdatedFrame = frame;

  if (frame.boardType === "arduino" || frame.boardType === "pico") {
    const isPico = nodes.some(n => getNodeSimulationModel(n) === "raspberrypipico");
    if (isPico) {
      const pins = frameBoardPinsToArduinoPins(frame);
      const { picoCode } = useCircuitStore.getState();
      const sensorPin = getDirectArduinoAnalogPinForComponent(tempNode.id, ["pin1", "pin2"], nodes, edges) ?? 26;

      const voltage = celsiusValue * 0.01 + 0.5;
      pins.set(sensorPin, {
        mode: "INPUT",
        value: Math.max(0, Math.min(255, Math.round((voltage / 3.3) * 255))),
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
      const constants = parseArduinoConstants(arduinoCode);

      const signalPin =
        constants.get("TMP_PIN") ??
        constants.get("tempPin") ??
        constants.get("sensorPin") ??
        16;

      const voltageMillivolts = celsiusValue * 10 + 500;
      const targetVoltage = voltageMillivolts / 1000;

      const register8BitValue = Math.round((targetVoltage / 5.0) * 255);
      pins.set(signalPin, {
        mode: "INPUT",
        value: Math.max(0, Math.min(255, register8BitValue)),
      });

      const temperatureOutput = parseTemperatureOutputPins(
        arduinoCode,
        celsiusValue,
      );
      for (const output of temperatureOutput.pins) {
        upsertPinState(pins, output.pin, output.high);
      }

      // Dynamic Terminal Output String parsing for debugging logs
      // Only add temperature log if user hasn't already added their own serial output
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
        // User has custom serial output, don't interfere
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
  }

  const components = { ...frame.components, ...pinsUpdatedFrame.components };
  const isPowered = validateComponentConnections(tempNode, nodes, edges);
  const previousComponentState = components[tempNode.id];
  components[tempNode.id] = {
    ...(previousComponentState ?? {
      nodeId: tempNode.id,
      componentType: tempNode.data.componentType,
      label: tempNode.data.label,
      isPowered: false,
      brightness: 0,
      voltage: 5.0,
      pins: {},
      telemetry: {},
    }),
    isPowered,
    voltage: isPowered ? 5.0 : 0,
    telemetry: {
      ...(previousComponentState?.telemetry ?? {}),
      temperatureC: isPowered ? celsiusValue : 0,
      voltageOut: isPowered ? (celsiusValue * 10 + 500) / 1000 : 0,
    },
  };

  return { ...pinsUpdatedFrame, components };
}

function parseArduinoConstants(code: string): Map<string, number> {
  const constants = new Map<string, number>();
  const cleaned = stripCodeComments(code);

  const definePattern = /#define\s+([A-Za-z_]\w*)\s+([A-Za-z0-9_-]+)/g;
  for (const match of cleaned.matchAll(definePattern)) {
    const name = match[1];
    const valStr = match[2];
    if (valStr.startsWith("A") && /^\d+$/.test(valStr.slice(1))) {
      constants.set(name, 14 + Number(valStr.slice(1)));
    } else if (/^-?\d+$/.test(valStr)) {
      constants.set(name, Number(valStr));
    }
  }

  const declarationPattern =
    /\b(?:const\s+)?(?:int|byte|uint8_t|long)\s+([A-Za-z_]\w*)\s*=\s*(-?\d+|A[0-5])\s*;/g;

  for (const match of cleaned.matchAll(declarationPattern)) {
    constants.set(
      match[1],
      match[2].startsWith("A")
        ? 14 + Number(match[2].slice(1))
        : Number(match[2]),
    );
  }

  return constants;
}

function stripCodeComments(code: string): string {
  return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function applyUltrasonicDistanceInputToFrame(frame: SimulationFrame): SimulationFrame {
  const status = useCircuitStore.getState().simulationStatus;
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || status !== "running") return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  if (!arduinoCode.includes("pulseIn")) return frame;

  const ultrasonicNode = nodes.find(
    (node) => getNodeSimulationModel(node) === "ultrasonicDistance",
  );
  if (!ultrasonicNode) return frame;

  const distanceCm = Math.max(
    2,
    Math.min(
      400,
      Number(ultrasonicNode.data.properties?.distance?.value ?? 100),
    ),
  );
  if (!Number.isFinite(distanceCm)) return frame;

  const pins = frameBoardPinsToArduinoPins(frame);
  const ultrasonicOutput = parseUltrasonicOutputPins(arduinoCode, distanceCm);
  for (const output of ultrasonicOutput?.pins ?? []) {
    upsertPinState(pins, output.pin, output.high);
  }

  const displayDistance = Math.round(distanceCm);
  const replacementLine = `Distance: ${displayDistance} cm`;
  let replacedDistanceLine = false;
  const serialOutput = frame.serialOutput.map((line) => {
    const clean = line.trim();
    if (
      clean.startsWith("Distance:") ||
      clean.startsWith("Dist:") ||
      clean.startsWith("D:")
    ) {
      replacedDistanceLine = true;
      const prefix = clean.split(":")[0] + ":";
      return `${prefix} ${displayDistance} cm`;
    }
    if (/Distance/i.test(line)) {
      replacedDistanceLine = true;
      return line;
    }
    return line;
  });

  if (
    !replacedDistanceLine &&
    (arduinoCode.includes("pulseIn") || arduinoCode.includes("Distance"))
  ) {
    serialOutput.push(replacementLine);
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
  const isPowered = validateComponentConnections(ultrasonicNode, nodes, edges);
  const previousUltrasonic = components[ultrasonicNode.id];
  components[ultrasonicNode.id] = {
    ...(previousUltrasonic ?? {
      nodeId: ultrasonicNode.id,
      componentType: ultrasonicNode.data.componentType,
      label: ultrasonicNode.data.label,
      isPowered: false,
      brightness: 0,
      voltage: 5.0,
      pins: {},
      telemetry: {},
    }),
    isPowered,
    voltage: isPowered ? 5.0 : 0,
    telemetry: {
      ...(previousUltrasonic?.telemetry ?? {}),
      distance: isPowered ? distanceCm : 0,
    },
  };

  return { ...nextFrame, components };
}