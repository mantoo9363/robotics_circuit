import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { getArduinoDigitalPinForComponentConnection, frameBoardPinsToArduinoPins, upsertPinState } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { SimulatorState } from "../../arduino-simulator";
import { stripCodeComments, parseArduinoConstants, resolveArduinoNumber, parseUltrasonicOutputPins, parseDigitalReadOutputsForInput, parsePythonReadOutputsForInput } from "../../codeParsing";
import { parsePicoPinFromPythonCode } from "../../codeParsing/picoParser";
import { validateComponentConnections } from "../../../utils/connectivity";
import { resolveEsp32Language } from "../../circuit/languageUtils";

export function applyUltrasonicDistanceInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico" && frame.boardType !== "esp32") || !frame.running) return frame;

  const { nodes, edges, arduinoCode, picoCode, selectedLanguage } = useCircuitStore.getState();
  const mcuNode = nodes.find(
    (node: CircuitNode) =>
      getNodeSimulationModel(node) === "arduino" ||
      getNodeSimulationModel(node) === "raspberrypipico" ||
      getNodeSimulationModel(node) === "esp32",
  );
  if (!mcuNode) return frame;

  const ultrasonicNodes = nodes.filter(
    (node: CircuitNode) => getNodeSimulationModel(node) === "ultrasonicDistance",
  );
  if (ultrasonicNodes.length === 0) return frame;

  const isPico = getNodeSimulationModel(mcuNode) === "raspberrypipico";
  const isEsp32 = getNodeSimulationModel(mcuNode) === "esp32";
  const esp32Lang = isEsp32 ? resolveEsp32Language(selectedLanguage, arduinoCode, picoCode) : null;
  const isEsp32Python = esp32Lang?.isPython ?? false;
  const codeToParse = isPico
    ? picoCode
    : isEsp32
      ? (esp32Lang!.buffer === "pico" ? picoCode : arduinoCode)
      : arduinoCode;

  const poweredUltrasonicNode = ultrasonicNodes.find((n) => {
    return validateComponentConnections(n, nodes, edges);
  });

  if (!poweredUltrasonicNode) {
    const targetPinNumbers = new Set(
      ultrasonicNodes.map(n => {
        const triggerPin = getArduinoDigitalPinForComponentConnection(
          n.id,
          "trigger",
          mcuNode.id,
          edges,
        );
        return triggerPin;
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

    let replacedDistanceLine = false;
    const serialOutput = frame.serialOutput.map((line: string) => {
      const clean = line.trim();
      if (
        clean.startsWith("Distance:") ||
        clean.startsWith("Dist:") ||
        clean.startsWith("D:")
      ) {
        replacedDistanceLine = true;
        const prefix = clean.split(":")[0] + ":";
        return `${prefix} 0 cm`;
      }
      if (/Distance/i.test(line)) {
        replacedDistanceLine = true;
        return line;
      }
      return line;
    });

    if (
      !replacedDistanceLine &&
      ((isPico || isEsp32Python)
        ? codeToParse.includes("print")
        : codeToParse.includes("pulseIn") || codeToParse.includes("Distance"))
    ) {
      serialOutput.push("Distance: 0 cm");
    }

    const components = { ...frame.components };
    for (const n of ultrasonicNodes) {
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

  const hasCodeUsage = (isPico || isEsp32Python)
    ? (codeToParse.includes("time_pulse_us") || codeToParse.includes("distance"))
    : codeToParse.includes("pulseIn");

  let pinsUpdatedFrame = frame;

  if (hasCodeUsage) {
    const isPowered = true;
    const distanceCm = Math.max(2, Math.min(400, Number(poweredUltrasonicNode.data.properties?.distance?.value ?? 100)));

    const pins = frameBoardPinsToArduinoPins(frame);
    if (isPico || isEsp32Python) {
      const triggerPin = getArduinoDigitalPinForComponentConnection(
        poweredUltrasonicNode.id,
        "trigger",
        mcuNode.id,
        edges,
      ) ?? 3;

      const parsedOutputs = parsePythonReadOutputsForInput(
        codeToParse,
        triggerPin,
        true,
        frame.timestamp,
      );
      for (const output of parsedOutputs?.outputs ?? []) {
        upsertPinState(pins, output.pin, output.high);
      }
    } else {
      const ultrasonicOutput = parseUltrasonicOutputPins(codeToParse, distanceCm);
      for (const output of ultrasonicOutput?.pins ?? []) {
        upsertPinState(pins, output.pin, output.high);
      }
    }

    const displayDistance = Math.round(distanceCm);
    const replacementLine = `Distance: ${displayDistance} cm`;
    let replacedDistanceLine = false;
    const serialOutput = frame.serialOutput.map((line: string) => {
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
      ((isPico || isEsp32Python)
        ? codeToParse.includes("print")
        : codeToParse.includes("pulseIn") || codeToParse.includes("Distance"))
    ) {
      serialOutput.push(replacementLine);
    }

    if (isEsp32) {
      // ESP32 GPIO/voltage propagation is already fully handled by
      // applyEsp32SimulationToFrame earlier in the pipeline. buildSimulationFrame's
      // boardPins/serialOutput reconstruction below is gated to arduino/pico only
      // (see simulation-state.ts), so routing ESP32 through it would silently wipe
      // frame.boardPins back to []. Just merge the computed serial line onto the
      // frame we already have.
      pinsUpdatedFrame = { ...frame, serialOutput: serialOutput.slice(-100) };
    } else {
      const arduinoState: SimulatorState = {
        pins,
        serialOutput: serialOutput.slice(-100),
        running: frame.running,
        error: frame.error,
      };

      pinsUpdatedFrame = buildSimulationFrame({
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
  }

  const components = { ...pinsUpdatedFrame.components };
  for (const n of ultrasonicNodes) {
    const isPowered = validateComponentConnections(n, nodes, edges);
    const value = isPowered ? Math.max(2, Math.min(400, Number(n.data.properties?.distance?.value ?? 100))) : 0;
    const previousUltrasonic = components[n.id];
    const { error, ...restTelemetry } = previousUltrasonic?.telemetry ?? {};
    components[n.id] = {
      ...(previousUltrasonic ?? {
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
        distance: value,
      } : {
        ...(previousUltrasonic?.telemetry ?? {}),
        error: "Sensor Pins Disconnected",
      },
    };
  }

  return { ...pinsUpdatedFrame, components };
}

export function applyPirSensorInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico" && frame.boardType !== "esp32") || !frame.running) return frame;

  const { nodes, edges, arduinoCode, picoCode, selectedLanguage } = useCircuitStore.getState();
  const pirNodes = nodes.filter(
    (node: CircuitNode) => getNodeSimulationModel(node) === "pirSensor",
  );
  if (pirNodes.length === 0) return frame;

  const poweredPirNode = pirNodes.find((n) => {
    return validateComponentConnections(n, nodes, edges);
  });

  if (!poweredPirNode) {
    const mcuNode = nodes.find(
      (node: CircuitNode) =>
        getNodeSimulationModel(node) === "arduino" ||
        getNodeSimulationModel(node) === "raspberrypipico" ||
        getNodeSimulationModel(node) === "esp32",
    );
    const isPico = mcuNode ? getNodeSimulationModel(mcuNode) === "raspberrypipico" : false;
    const isEsp32 = mcuNode ? getNodeSimulationModel(mcuNode) === "esp32" : false;
    const targetPinNumbers = new Set(
      pirNodes.map(n => {
        const fallbackPin = isPico ? 28 : isEsp32 ? 27 : 2;
        const signalPin = mcuNode
          ? getArduinoDigitalPinForComponentConnection(
            n.id,
            "signal",
            mcuNode.id,
            edges,
          ) ?? fallbackPin
          : fallbackPin;
        return signalPin;
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

    let replacedPirValue = false;
    let replacedMotionLine = false;
    const serialOutput = frame.serialOutput.map((line: string) => {
      if (line.trim().startsWith("Motion:")) {
        replacedMotionLine = true;
        return "No Motion";
      }
      if (/Motion/i.test(line)) {
        replacedMotionLine = true;
        return line;
      }
      if (/^PIR:\s*[01]\s*$/i.test(line.trim())) {
        replacedPirValue = true;
        return "PIR: 0";
      }
      if (/PIR/i.test(line)) {
        replacedPirValue = true;
        return line;
      }
      return line;
    });

    const components = { ...frame.components };
    for (const n of pirNodes) {
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

  const isPowered = true;

  const motionValue = poweredPirNode.data.pirMotion ?? poweredPirNode.data.properties?.motion?.value;
  const motion =
    motionValue === true || motionValue === "true" || motionValue === 1;

  const mcuNode = nodes.find(
    (node: CircuitNode) =>
      getNodeSimulationModel(node) === "arduino" ||
      getNodeSimulationModel(node) === "raspberrypipico" ||
      getNodeSimulationModel(node) === "esp32",
  );
  if (!mcuNode) return frame;

  const isPico = getNodeSimulationModel(mcuNode) === "raspberrypipico";
  const isEsp32 = getNodeSimulationModel(mcuNode) === "esp32";
  const esp32Lang = isEsp32 ? resolveEsp32Language(selectedLanguage, arduinoCode, picoCode) : null;
  const isEsp32Python = esp32Lang?.isPython ?? false;
  const codeToParse = isPico
    ? picoCode
    : isEsp32
      ? (esp32Lang!.buffer === "pico" ? picoCode : arduinoCode)
      : arduinoCode;

  let signalPin: number | null = null;
  let ledOutputPin: number | null = null;

  if (isPico || isEsp32Python) {
    const fallbackPin =
      parsePicoPinFromPythonCode(picoCode, [
        "pir",
        "pirPin",
        "sensor",
        "motion",
      ]) ?? 28;
    signalPin =
      getArduinoDigitalPinForComponentConnection(
        poweredPirNode.id,
        "signal",
        mcuNode.id,
        edges,
      ) ?? fallbackPin;
    ledOutputPin =
      parsePicoPinFromPythonCode(picoCode, ["led", "ledPin", "output"]) ?? 15;
  } else {
    const constants = parseArduinoConstants(codeToParse);
    const fallbackPin =
      constants.get("pirPin") ??
      constants.get("PIR_PIN") ??
      constants.get("sensorPin") ??
      constants.get("motionPin") ??
      constants.get("inputPin") ??
      null;
    signalPin =
      getArduinoDigitalPinForComponentConnection(
        poweredPirNode.id,
        "signal",
        mcuNode.id,
        edges,
      ) ?? fallbackPin;
    if (signalPin === null) return frame;
    ledOutputPin =
      constants.get("ledPin") ??
      constants.get("LED_PIN") ??
      constants.get("led") ??
      null;
  }
  const pins = frameBoardPinsToArduinoPins(frame);
  pins.set(signalPin, { mode: "INPUT", value: motion ? 255 : 0 });

  const parsedOutputs = (isPico || isEsp32Python)
    ? parsePythonReadOutputsForInput(
      codeToParse,
      signalPin,
      motion,
      frame.timestamp,
    )
    : parseDigitalReadOutputsForInput(
      codeToParse,
      signalPin,
      motion,
      frame.timestamp,
    );
  const outputs = [...(parsedOutputs?.outputs ?? [])];
  if (
    ledOutputPin !== null &&
    !outputs.some((output) => output.pin === ledOutputPin)
  ) {
    outputs.push({ pin: ledOutputPin, high: motion });
  }
  for (const output of outputs) {
    upsertPinState(pins, output.pin, output.high);
  }

  const desiredMotionLine = motion ? "Motion Detected" : "No Motion";
  let replacedPirValue = false;
  let replacedMotionLine = false;
  const hasSerialPrint = codeToParse.includes(
    (isPico || isEsp32Python) ? "print" : "Serial.print",
  );
  const normalizedSerialOutput = frame.serialOutput.map((line: string) => {
    if (line.trim().startsWith("Motion:")) {
      replacedMotionLine = true;
      return desiredMotionLine;
    }
    if (/Motion/i.test(line)) {
      replacedMotionLine = true;
      return line;
    }
    if (/^PIR:\s*[01]\s*$/i.test(line.trim())) {
      replacedPirValue = true;
      return `PIR: ${motion ? 1 : 0}`;
    }
    if (/PIR/i.test(line)) {
      replacedPirValue = true;
      return line;
    }
    return line;
  });

  if (!hasSerialPrint) {
    if (
      !replacedPirValue &&
      codeToParse.includes((isPico || isEsp32Python) ? 'print("PIR: "' : 'Serial.print("PIR: "')
    ) {
      normalizedSerialOutput.push(`PIR: ${motion ? 1 : 0}`);
    }
    if (!replacedMotionLine) {
      normalizedSerialOutput.push(desiredMotionLine);
    }
  } else if (
    !replacedPirValue &&
    !replacedMotionLine &&
    (codeToParse.includes("PIR") ||
      codeToParse.includes("motion") ||
      codeToParse.includes("Motion"))
  ) {
    normalizedSerialOutput.push(desiredMotionLine);
  }

  const serialOutput = normalizedSerialOutput.slice(-100);

  let nextFrame: SimulationFrame;
  if (isEsp32) {
    // See the matching note in applyUltrasonicDistanceInputToFrame: ESP32 pin/voltage
    // state is already fully handled upstream, and buildSimulationFrame would wipe it
    // since its boardPins/serialOutput reconstruction is gated to arduino/pico only.
    nextFrame = { ...frame, serialOutput };
  } else {
    const arduinoState: SimulatorState = {
      pins,
      serialOutput,
      running: frame.running,
      error: frame.error,
    };

    nextFrame = buildSimulationFrame({
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
  const nextComponents = { ...nextFrame.components };
  for (const n of pirNodes) {
    const isPowered = validateComponentConnections(n, nodes, edges);
    const motionValue = isPowered ? (n.data.pirMotion ?? n.data.properties?.motion?.value) : false;
    const motion = motionValue === true || motionValue === "true" || motionValue === 1;
    const previous = nextComponents[n.id];
    const { error, ...restTelemetry } = previous?.telemetry ?? {};
    nextComponents[n.id] = {
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
      brightness: isPowered && motion ? 1 : 0,
      telemetry: isPowered ? {
        ...restTelemetry,
        motion,
        signalPin,
      } : {
        ...(previous?.telemetry ?? {}),
        error: "Sensor Pins Disconnected",
      },
    };
  }

  return { ...nextFrame, components: nextComponents };
}
