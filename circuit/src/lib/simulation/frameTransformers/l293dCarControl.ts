import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { frameBoardPinsToArduinoPins, upsertPinState } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { SimulatorState } from "../../arduino-simulator";
import { parseL293DCarControlPins, getPressedArduinoButtonPins, getPressedArduinoButtonLabels, hasPressedLabel, stripCodeComments, extractArduinoFunctionBody, parseArduinoConstants, resolveArduinoNumber } from "../../codeParsing/arduinoParser";

export function applyL293DCarControlInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || !frame.running) return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  if (!nodes.some((node) => getNodeSimulationModel(node) === "l293d"))
    return frame;

  const potentiometer = nodes.find(
    (node) => getNodeSimulationModel(node) === "potentiometer",
  );
  const position = Math.max(
    0,
    Math.min(
      100,
      Number(potentiometer?.data.properties?.position?.value ?? 100),
    ),
  );
  const analogValue = Math.round((position / 100) * 1023);
  const parsed = parseL293DCarControlPins(
    arduinoCode,
    analogValue,
    getPressedArduinoButtonPins(nodes, edges),
    getPressedArduinoButtonLabels(nodes),
  );
  if (!parsed) return frame;

  const pins = frameBoardPinsToArduinoPins(frame);
  pins.set(parsed.analogPin, {
    mode: "INPUT",
    value: Math.round((parsed.analogValue / 1023) * 255),
  });
  for (const inputPin of parsed.inputPins) {
    pins.set(inputPin.pin, {
      mode: "INPUT_PULLUP",
      value: inputPin.value,
    });
  }
  for (const output of parsed.outputs) {
    pins.set(output.pin, {
      mode: "OUTPUT",
      value: output.value,
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

export function applyTimedDigitalWriteInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || !frame.running) return frame;

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

function getTimedDigitalWritePinsAtTime(code: string, timestamp: number): Map<number, boolean> | null {
  const sequence = parseTimedDigitalWriteSequence(code);
  if (!sequence || sequence.length === 0) return null;

  const totalDuration = sequence.reduce((sum, step) => sum + step.duration, 0);
  if (totalDuration <= 0) return sequence[0].pins;

  let cursor = timestamp % totalDuration;
  for (const step of sequence) {
    if (cursor < step.duration) return step.pins;
    cursor -= step.duration;
  }

  return sequence[sequence.length - 1].pins;
}

function parseTimedDigitalWriteSequence(code: string) {
  const cleaned = stripCodeComments(code);
  if (!cleaned.includes("digitalWrite")) return null;

  const loopBody = extractArduinoFunctionBody(cleaned, "loop");
  if (!loopBody) return null;

  // Only handles linear digitalWrite → delay sequences; skip if conditionals exist
  if (/\b(if|else|while|for|switch|case|break|continue)\b/.test(loopBody)) return null;

  const constants = parseArduinoConstants(cleaned);
  const tokenPattern =
    /digitalWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*(HIGH|LOW)\s*\)|delay\s*\(\s*([A-Za-z_]\w*|\d+)\s*\)/g;
  const currentPins = new Map<number, boolean>();
  const steps: Array<{ pins: Map<number, boolean>; duration: number }> = [];

  for (const match of loopBody.matchAll(tokenPattern)) {
    if (match[1] !== undefined) {
      const pin = resolveArduinoNumber(match[1], constants);
      if (pin !== null) currentPins.set(pin, match[2] === "HIGH");
      continue;
    }

    if (match[3] !== undefined && currentPins.size > 0) {
      const duration = resolveArduinoNumber(match[3], constants) ?? 1000;
      steps.push({
        pins: new Map(currentPins),
        duration: Math.max(1, duration),
      });
    }
  }

  if (steps.length === 0 && currentPins.size > 0) {
    steps.push({
      pins: new Map(currentPins),
      duration: 1000,
    });
  }

  return steps.length > 0 ? steps : null;
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

