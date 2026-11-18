import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { frameBoardPinsToArduinoPins, upsertPinState } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { SimulatorState } from "../../arduino-simulator";
import { parsePushbuttonTogglePins, parsePotentiometerAnalogPins, parseL293DCarControlPins, getPressedArduinoButtonPins, getPressedArduinoButtonLabels, hasPressedLabel, getPressedCarButtonCommand, stripCodeComments, parseArduinoConstants, resolveArduinoNumber, clampByte, extractArduinoFunctionBody } from "../../codeParsing/arduinoParser";
import { parsePythonReadOutputsForInput } from "../../codeParsing/picoParser";
import { parseDigitalReadOutputsForInput } from "../../codeParsing/arduinoParser";

export function applyPushbuttonToggleInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType === "arduino" || frame.boardType === "pico") && frame.running) return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  const togglePins = parsePushbuttonTogglePins(arduinoCode);
  if (!togglePins) return frame;

  const hasButtonOrSwitch = nodes.some((node) => {
    const model = getNodeSimulationModel(node);
    return model === "pushbutton" || model === "slideswitch";
  });
  if (!hasButtonOrSwitch) return frame;

  const pressed = nodes.some((node) => {
    const model = getNodeSimulationModel(node);
    const stVal = node.data.properties?.state?.value;
    return (
      (model === "pushbutton" || model === "slideswitch") &&
      (stVal === "on" || stVal === "right")
    );
  });
  const memoryKey = `${togglePins.buttonPin}:${togglePins.ledPin}:${arduinoCode}`;
  const previous = arduinoInteractiveInputMemory.get(memoryKey) ?? {
    pressed,
    outputHigh: false,
  };
  let outputHigh =
    togglePins.fixedValue === null
      ? previous.outputHigh
      : togglePins.fixedValue > 0
        ? pressed
        : !pressed;

  if (togglePins.togglesState && pressed !== previous.pressed) {
    outputHigh = !previous.outputHigh;
  } else if (togglePins.fixedValue === null && !togglePins.togglesState) {
    outputHigh = pressed;
  }

  arduinoInteractiveInputMemory.set(memoryKey, { pressed, outputHigh });
  const pins = frameBoardPinsToArduinoPins(frame);
  pins.set(togglePins.buttonPin, {
    mode: togglePins.inputPullup ? "INPUT_PULLUP" : "INPUT",
    value: togglePins.activeWhenPressedLow
      ? pressed
        ? 0
        : 255
      : pressed
        ? 255
        : 0,
  });
  pins.set(togglePins.ledPin, {
    mode: "OUTPUT",
    value: outputHigh ? 255 : 0,
  });

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

const arduinoInteractiveInputMemory = new Map<
  string,
  { pressed: boolean; outputHigh: boolean }
>();

export function applyAnalogWriteInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType === "arduino" || frame.boardType === "pico") && frame.running) return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  const output = getAnalogWriteOutputAtTime(arduinoCode, frame.timestamp);
  if (!output) return frame;

  const pins = frameBoardPinsToArduinoPins(frame);
  pins.set(output.pin, {
    mode: "OUTPUT",
    value: output.value,
  });

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

function getAnalogWriteOutputAtTime(code: string, timestamp: number) {
  const sequence = parseAnalogWriteSequence(code);
  if (!sequence || sequence.length === 0) return null;

  const totalDuration = sequence.reduce((sum, step) => sum + step.duration, 0);
  if (totalDuration <= 0) return sequence[0];

  let cursor = timestamp % totalDuration;
  for (const step of sequence) {
    if (cursor < step.duration) return step;
    cursor -= step.duration;
  }

  return sequence[sequence.length - 1];
}

function parseAnalogWriteSequence(code: string) {
  const cleaned = stripCodeComments(code);
  if (!cleaned.includes("analogWrite")) return null;

  const constants = parseArduinoConstants(cleaned);
  const steps: Array<{ pin: number; value: number; duration: number }> = [];
  const forLoopPattern =
    /for\s*\(\s*(?:int\s+|byte\s+|uint8_t\s+|long\s+)?([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*|-?\d+)\s*;\s*\1\s*(<=|>=|<|>)\s*([A-Za-z_]\w*|-?\d+)\s*;\s*((?:\1\s*(?:[+-]=\s*(?:[A-Za-z_]\w*|-?\d+)|\+\+|--)|(?:\+\+|--)\s*\1))\s*\)\s*\{([\s\S]*?)\}/g;
  let loopMatch: RegExpExecArray | null;

  while ((loopMatch = forLoopPattern.exec(cleaned)) !== null) {
    const [, variableName, startRaw, operator, endRaw, updaterRaw, loopBody] =
      loopMatch;
    const writePattern = new RegExp(
      `analogWrite\\s*\\(\\s*([A-Za-z_]\\w*|-?\\d+)\\s*,\\s*${variableName}\\s*\\)`,
      "m",
    );
    const writeMatch = loopBody.match(writePattern);
    if (!writeMatch) continue;

    const pin = resolveArduinoNumber(writeMatch[1], constants);
    const start = resolveArduinoNumber(startRaw, constants);
    const end = resolveArduinoNumber(endRaw, constants);
    const delayMatch = loopBody.match(/delay\s*\(\s*([A-Za-z_]\w*|\d+)\s*\)/);
    const duration = delayMatch
      ? (resolveArduinoNumber(delayMatch[1], constants) ?? 30)
      : 30;
    let stepSize: number | null = null;
    let stepDirection = 1;
    const updater = updaterRaw.replace(/\s+/g, "");
    if (updater === `${variableName}++` || updater === `++${variableName}`) {
      stepSize = 1;
      stepDirection = 1;
    } else if (
      updater === `${variableName}--` ||
      updater === `--${variableName}`
    ) {
      stepSize = 1;
      stepDirection = -1;
    } else {
      const stepMatch = updaterRaw.match(
        new RegExp(
          `^\\s*${variableName}\\s*([+-]=)\\s*([A-Za-z_]\\w*|-?\\d+)\\s*$`,
        ),
      );
      if (stepMatch) {
        stepSize = resolveArduinoNumber(stepMatch[2], constants);
        stepDirection = stepMatch[1] === "+=" ? 1 : -1;
      }
    }

    if (
      pin === null ||
      start === null ||
      end === null ||
      stepSize === null ||
      stepSize === 0
    )
      continue;

    const step = stepDirection * stepSize;
    const shouldContinue = (value: number) => {
      if (operator === "<=") return value <= end;
      if (operator === ">=") return value >= end;
      if (operator === "<") return value < end;
      return value > end;
    };

    let guard = 0;
    for (
      let value = start;
      shouldContinue(value) && guard < 1024;
      value += step
    ) {
      steps.push({
        pin,
        value: clampByte(value),
        duration: Math.max(1, duration),
      });
      guard += 1;
    }
  }

  if (steps.length > 0) return steps;

  // Chronological sequence parser for multiple analogWrite + delay statements
  const loopBody = extractArduinoFunctionBody(cleaned, "loop");
  if (
    loopBody &&
    loopBody.includes("analogWrite") &&
    loopBody.includes("delay")
  ) {
    const tokenPattern =
      /analogWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*([A-Za-z_]\w*|-?\d+)\s*\)|delay\s*\(\s*([A-Za-z_]\w*|\d+)\s*\)/g;
    const currentValues = new Map<number, number>();
    const sequentialSteps: Array<{
      pin: number;
      value: number;
      duration: number;
    }> = [];

    for (const match of loopBody.matchAll(tokenPattern)) {
      if (match[1] !== undefined) {
        const pin = resolveArduinoNumber(match[1], constants);
        const val = resolveArduinoNumber(match[2], constants);
        if (pin !== null && val !== null) {
          currentValues.set(pin, clampByte(val));
        }
        continue;
      }

      if (match[3] !== undefined && currentValues.size > 0) {
        const duration = resolveArduinoNumber(match[3], constants) ?? 1000;
        for (const [pin, value] of currentValues.entries()) {
          sequentialSteps.push({
            pin,
            value,
            duration: Math.max(1, duration),
          });
        }
      }
    }

    if (sequentialSteps.length > 0) return sequentialSteps;
  }

  const constantWrite = cleaned.match(
    /analogWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*([A-Za-z_]\w*|-?\d+)\s*\)/,
  );
  if (!constantWrite) return null;

  const pin = resolveArduinoNumber(constantWrite[1], constants);
  const value = resolveArduinoNumber(constantWrite[2], constants);
  if (pin === null || value === null) return null;
  return [{ pin, value: clampByte(value), duration: 1000 }];
}

