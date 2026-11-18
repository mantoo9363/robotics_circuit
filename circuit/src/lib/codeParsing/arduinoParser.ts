import type { CircuitNode, CircuitEdge } from "../types";
import {
  buildConductiveGraphForStore,
  getReachableGraphNodes,
} from "../circuit/graph";
import { getNodeSimulationModelForStore } from "../circuit/components";
import { findMCUBoardNode, getBoardAdapter } from "../circuit/boardAdapter";

import { useCircuitStore } from "../store";

export function stripCodeComments(code: string): string {
  return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function parseArduinoConstants(code: string): Map<string, number> {
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

/**
 * Traces a connection from a component's named handle (e.g. "vout", "pin1") to
 * the Arduino / Pico board and returns the connected board pin number.
 * Returns null when no board pin is wired to that handle.
 */
export function getConnectedBoardPin(
  componentNodeId: string,
  componentHandle: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): { pinNumber: number; handleId: string } | null {
  // Find the Arduino / Pico board node via boardAdapter abstraction
  const boardNode = findMCUBoardNode(nodes);
  if (!boardNode) return null;

  const adapter = getBoardAdapter(boardNode);

  for (const edge of edges) {
    // Edge going from component → board
    const fromComponent =
      edge.source === componentNodeId &&
      edge.sourceHandle === componentHandle &&
      edge.target === boardNode.id;
    // Edge going from board → component
    const fromBoard =
      edge.target === componentNodeId &&
      edge.targetHandle === componentHandle &&
      edge.source === boardNode.id;

    const boardHandle = fromComponent
      ? edge.targetHandle
      : fromBoard
        ? edge.sourceHandle
        : null;

    if (!boardHandle) continue;

    const parsedPin = adapter.parseHandleToPinNumber(boardHandle);
    if (parsedPin) {
      return { pinNumber: parsedPin.pinNumber, handleId: parsedPin.handleId };
    }
  }

  return null;
}

export function resolveArduinoNumber(
  token: string,
  constants: Map<string, number>,
): number | null {
  const trimmed = token.trim();
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^A[0-5]$/i.test(trimmed)) return 14 + Number(trimmed.slice(1));
  return constants.get(trimmed) ?? null;
}

export function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function replaceBinaryLiterals(str: string): string {
  let res = str.replace(/\b0b([01]+)\b/g, (match, bin) => {
    return String(parseInt(bin, 2));
  });
  res = res.replace(/\bB([01]+)\b/g, (match, bin) => {
    return String(parseInt(bin, 2));
  });
  return res;
}

export function evaluateExpression(
  expr: string,
  variables: Map<string, number> = new Map(),
): number {
  let replaced = replaceBinaryLiterals(expr);

  replaced = replaced.replace(/\b0x([0-9a-fA-F]+)\b/g, (match, hex) => {
    return String(parseInt(hex, 16));
  });

  replaced = replaced.replace(/'(\\.|[^'\\])'/g, (match, charContent) => {
    if (charContent.startsWith("\\")) {
      const escaped = charContent.slice(1);
      if (escaped === "n") return "10";
      if (escaped === "r") return "13";
      if (escaped === "t") return "9";
      if (escaped === "b") return "8";
      if (escaped === "f") return "12";
      if (escaped === "\\") return "92";
      if (escaped === "'") return "39";
      if (escaped === '"') return "34";
      if (escaped === "0") return "0";
      if (escaped.startsWith("x")) {
        return String(parseInt(escaped.slice(1), 16));
      }
      if (/^[0-7]+$/.test(escaped)) {
        return String(parseInt(escaped, 8));
      }
      return String(escaped.charCodeAt(0));
    }
    return String(charContent.charCodeAt(0));
  });

  replaced = replaced.replace(/\b\w+\.readTemperature\s*\(\s*(true|1|false|0)?\s*\)/g, (match, fahrArg) => {
    try {
      const isFahrenheit = fahrArg === "true" || fahrArg === "1";
      const storeNodes = useCircuitStore.getState().nodes;
      if (storeNodes && storeNodes.length > 0) {
        const dhtNode = storeNodes.find((n: any) => n.data?.componentType === "dht11" || n.data?.componentType === "dht22" || n.data?.simulationModel === "dht11" || n.data?.simulationModel === "dht22");
        const celsius = dhtNode
          ? Number(dhtNode.data?.properties?.temperature?.value ?? 24)
          : Number(storeNodes.find((n: any) => n.data?.componentType === "temperatureSensor" || n.data?.simulationModel === "temperatureSensor")?.data?.properties?.temperature?.value ?? 25);
        if (isFahrenheit) {
          return String(Math.round(celsius * 1.8 + 32));
        }
        return String(celsius);
      }
    } catch (_) {}
    return "0";
  });
  replaced = replaced.replace(/\b\w+\.readHumidity\s*\(\s*\)/g, () => {
    try {
      const storeNodes = useCircuitStore.getState().nodes;
      if (storeNodes && storeNodes.length > 0) {
        const dhtNode = storeNodes.find((n: any) => n.data?.componentType === "dht11" || n.data?.componentType === "dht22" || n.data?.simulationModel === "dht11" || n.data?.simulationModel === "dht22");
        if (dhtNode) return String(dhtNode.data?.properties?.humidity?.value ?? 40);
      }
    } catch (_) {}
    return "0";
  });
  replaced = replaced.replace(/\b\w+\.computeHeatIndex\s*\(\s*([^,]+)\s*,\s*([^,)]+)(?:\s*,\s*(true|1|false|0))?\s*\)/g, (match, tempArg, humArg, isFahrArg) => {
    try {
      const isFahr = isFahrArg === "true" || isFahrArg === "1";
      const rawTemp = parseFloat(tempArg) || 24;
      const rawHum = parseFloat(humArg) || 40;
      const tempF = isFahr ? rawTemp : rawTemp * 1.8 + 32;
      const hiF = 0.5 * (tempF + 61.0 + ((tempF - 68.0) * 1.2) + (rawHum * 0.094));
      const result = isFahr ? hiF : (hiF - 32) * (5 / 9);
      return String(Number(result.toFixed(1)));
    } catch (_) {}
    return "0";
  });

  replaced = replaced.replace(/\b0x([0-9a-fA-F]+)\b/g, (match, hexVal) => {
    return String(parseInt(hexVal, 16));
  });

  const sortedVars = Array.from(variables.keys()).sort(
    (a, b) => b.length - a.length,
  );
  for (const varName of sortedVars) {
    if (
      varName === "HIGH" ||
      varName === "LOW" ||
      varName === "INPUT" ||
      varName === "OUTPUT" ||
      varName === "BIN" ||
      varName === "OCT" ||
      varName === "DEC" ||
      varName === "HEX"
    )
      continue;
    const varRegex = new RegExp(`\\b${varName}\\b`, "g");
    const val = variables.get(varName) ?? 0;
    replaced = replaced.replace(varRegex, String(val));
  }

  replaced = replaced.replace(
    /\((?:int|float|double|long|short|byte|char|bool)\)/g,
    "",
  );

  const sanitized = replaced.replace(/[^0-9.+\-*/() ]/g, "");
  try {
    if (sanitized.trim() === "") return 0;
    const result = new Function(`return (${sanitized});`)();
    return Number.isFinite(result) ? result : 0;
  } catch (e) {
    return 0;
  }
}

export function resolveTokenValue(
  token: string,
  variables: Map<string, number>,
): number {
  const trimmed = token.trim();
  if (variables.has(trimmed)) return variables.get(trimmed)!;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return parseInt(trimmed, 16);
  if (/^A[0-5]$/i.test(trimmed)) return 14 + Number(trimmed.slice(1));
  return 0;
}

export function parseAnalogWriteSequence(code: string): Array<{
  pin: number;
  value: number;
  duration: number;
}> | null {
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

export function getAnalogWriteOutputAtTime(
  code: string,
  timestamp: number,
): { pin: number; value: number; duration: number } | null {
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

export function extractArduinoFunctionBody(
  code: string,
  functionName: string,
): string | null {
  const match = new RegExp(`void\\s+${functionName}\\s*\\(\\s*\\)\\s*\\{`).exec(
    code,
  );
  if (!match) return null;

  const bodyStart = match.index + match[0].length;
  let depth = 1;
  for (let index = bodyStart; index < code.length; index += 1) {
    const char = code[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return code.slice(bodyStart, index);
  }

  return null;
}

export function parseTimedDigitalWriteSequence(code: string): Array<{
  pins: Map<number, boolean>;
  duration: number;
}> | null {
  const cleaned = stripCodeComments(code);
  if (!cleaned.includes("digitalWrite")) return null;

  const loopBody = extractArduinoFunctionBody(cleaned, "loop");
  if (!loopBody) return null;

  // This parser only handles linear digitalWrite → delay → digitalWrite sequences.
  // If the loop body contains conditionals (if/else/while/for), the digitalWrite
  // calls may be inside branches that are never taken -- we must not blindly
  // extract their states. Return null so the caller falls through.
  if (/\/\*[\s\S]*?\*\//.test(loopBody)) return null; // skip if block comments remain (strip didn't catch all)
  if (/\b(if|else|while|for|switch|case|break|continue)\b/.test(loopBody))
    return null;

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

export function getTimedDigitalWritePinsAtTime(
  code: string,
  timestamp: number,
): Map<number, boolean> | null {
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

export function parseServoSequence(code: string): {
  pin: number;
  steps: Array<{ angle: number; duration: number }>;
} | null {
  const cleaned = stripCodeComments(code);
  const constants = parseArduinoConstants(cleaned);
  const attachMatch = cleaned.match(
    /\b([A-Za-z_]\w*)\s*\.\s*attach\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)/,
  );
  if (!attachMatch) return null;

  const servoName = attachMatch[1];
  const pin = resolveArduinoNumber(attachMatch[2], constants);
  if (pin === null) return null;

  const loopMatch = cleaned.match(/void\s+loop\s*\(\s*\)\s*\{([\s\S]*?)\n?\}/);
  if (!loopMatch) return null;

  const stepPattern = new RegExp(
    `${servoName}\\s*\\.\\s*write\\s*\\(\\s*([A-Za-z_]\\w*|-?\\d+)\\s*\\)|delay\\s*\\(\\s*([A-Za-z_]\\w*|\\d+)\\s*\\)`,
    "g",
  );
  const steps: Array<{ angle: number; duration: number }> = [];
  let currentAngle: number | null = null;

  for (const match of loopMatch[1].matchAll(stepPattern)) {
    if (match[1] !== undefined) {
      const angle = resolveArduinoNumber(match[1], constants);
      if (angle !== null) currentAngle = Math.max(0, Math.min(180, angle));
      continue;
    }

    if (match[2] !== undefined && currentAngle !== null) {
      const duration = resolveArduinoNumber(match[2], constants) ?? 1000;
      steps.push({ angle: currentAngle, duration: Math.max(50, duration) });
    }
  }

  if (currentAngle !== null && steps.length === 0) {
    steps.push({ angle: currentAngle, duration: 1000 });
  }

  return steps.length > 0 ? { pin, steps } : null;
}

export function getServoAngleAtTime(
  sequence: NonNullable<ReturnType<typeof parseServoSequence>>,
  timestamp: number,
): number {
  const totalDuration = sequence.steps.reduce(
    (sum, step) => sum + step.duration,
    0,
  );
  if (totalDuration <= 0) return sequence.steps[0]?.angle ?? 0;

  let cursor = timestamp % totalDuration;
  for (const step of sequence.steps) {
    if (cursor < step.duration) return step.angle;
    cursor -= step.duration;
  }

  return sequence.steps[sequence.steps.length - 1]?.angle ?? 0;
}

export function servoHasSignalConnection(
  servoNodeId: string,
  arduinoNodeId: string,
  pin: number,
  edges: CircuitEdge[],
): boolean {
  const arduinoHandle = `d${pin}`;
  return edges.some((edge) => {
    const servoToBoard =
      edge.source === servoNodeId &&
      edge.sourceHandle === "signal" &&
      edge.target === arduinoNodeId &&
      edge.targetHandle === arduinoHandle;
    const boardToServo =
      edge.target === servoNodeId &&
      edge.targetHandle === "signal" &&
      edge.source === arduinoNodeId &&
      edge.sourceHandle === arduinoHandle;

    return servoToBoard || boardToServo;
  });
}

export function decodeArduinoStringLiteral(value: string): string {
  let decoded = value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

  decoded = decoded.replace(/\\x([0-9a-fA-F]{1,2})/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  decoded = decoded.replace(/\\([0-7]{1,3})/g, (match, octal) => {
    return String.fromCharCode(parseInt(octal, 8));
  });

  return decoded;
}

export function writeLcdText(args: {
  display: string[][];
  text: string;
  cursorColumn: number;
  cursorRow: number;
}): { cursorColumn: number; cursorRow: number; wroteText: boolean } {
  let cursorColumn = args.cursorColumn;
  let cursorRow = args.cursorRow;
  let wroteText = false;

  for (const char of args.text) {
    if (char === "\n" || char === "\r") {
      cursorRow = Math.min(1, cursorRow + 1);
      cursorColumn = 0;
      continue;
    }
    if (cursorRow > 1 || cursorColumn > 15) continue;
    args.display[cursorRow][cursorColumn] = char;
    cursorColumn += 1;
    wroteText = true;
  }

  return { cursorColumn, cursorRow, wroteText };
}

export function lcdBufferToLines(display: string[][]): {
  line1: string;
  line2: string;
} {
  return {
    line1: display[0].join("").trimEnd(),
    line2: display[1].join("").trimEnd(),
  };
}

export interface LCDState {
  ddram: Uint8Array;
  cgram: Uint8Array;
  cursorColumn: number;
  cursorRow: number;
  displayEnabled: boolean;
  cursorEnabled: boolean;
  blinkEnabled: boolean;
  backlightEnabled: boolean;
  scrollOffset: number;
  incrementMode: boolean;
  autoscroll: boolean;
  i2cLog: string[];
  error?: string | null;
}

export interface I2CBackpackDriver {
  logWrite(address: number, dataBytes: number[], state: LCDState): void;
}

export class PCF8574Driver implements I2CBackpackDriver {
  logWrite(address: number, dataBytes: number[], state: LCDState): void {
    const writeByteHex = "0x" + (address * 2).toString(16).toUpperCase();
    const bytesStr = dataBytes
      .map((b) => "0x" + b.toString(16).toUpperCase().padStart(2, "0"))
      .join(", ");
    state.i2cLog.push(
      `START -> ${writeByteHex} -> ACK -> ${bytesStr} -> ACK -> STOP`,
    );
    if (state.i2cLog.length > 30) state.i2cLog.shift();
  }
}

export class MCP23008Driver implements I2CBackpackDriver {
  logWrite(address: number, dataBytes: number[], state: LCDState): void {
    const writeByteHex = "0x" + (address * 2).toString(16).toUpperCase();
    const bytesStr = dataBytes
      .map((b) => "0x" + b.toString(16).toUpperCase().padStart(2, "0"))
      .join(", ");
    state.i2cLog.push(
      `START -> ${writeByteHex} -> ACK -> 0x09 (GPIO) -> ACK -> ${bytesStr} -> ACK -> STOP`,
    );
    if (state.i2cLog.length > 30) state.i2cLog.shift();
  }
}

export function extractFunctionBody(
  cleaned: string,
  funcPattern: RegExp,
): string {
  const m = cleaned.match(funcPattern);
  if (!m) return "";
  const start = m.index! + m[0].length;
  let depth = 1;
  let end = start;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return cleaned.slice(start, end);
}

export function unrollLoops(code: string): string {
  let unrolled = code;

  try {
    const constants = parseArduinoConstants(code);
    const declPattern = /Adafruit_NeoPixel\s+([A-Za-z_]\w*)\s*(?:\(\s*([^)]+)\s*\)|=\s*Adafruit_NeoPixel\s*\(\s*([^)]+)\s*\))/g;
    const stripSizes = new Map<string, number>();
    let match;
    const cleanedCode = stripCodeComments(code);
    while ((match = declPattern.exec(cleanedCode)) !== null) {
      const name = match[1];
      const argsText = match[2] || match[3];
      const parts = argsText.split(",").map((p) => p.trim());
      const sizeToken = parts[0];
      const resolvedSize = constants.get(sizeToken) ?? Number(sizeToken);
      if (Number.isInteger(resolvedSize)) {
        stripSizes.set(name, resolvedSize);
      }
    }

    unrolled = unrolled.replace(/for\s*\(\s*(?:int|char)\s+(\w+)\s*=[^;]+;\s*[^;]+;\s*[^)]+\)/g, (header, varName) => {
      let replacedHeader = header;
      for (const [name, value] of constants.entries()) {
        if (name === varName) continue;
        replacedHeader = replacedHeader.replace(new RegExp(`\\b${name}\\b`, "g"), String(value));
      }
      for (const [stripName, size] of stripSizes.entries()) {
        replacedHeader = replacedHeader.replace(new RegExp(`\\b${stripName}\\s*\\.\\s*numPixels\\s*\\(\\s*\\)`, "g"), String(size));
      }
      return replacedHeader;
    });
  } catch (e) { }

  const forLoopPattern =
    /for\s*\(\s*(?:int|char)\s+(\w+)\s*=\s*(?:'([^'])'|(\d+))\s*;\s*\1\s*(<|<=|>|>=)\s*(?:'([^'])'|(\d+))\s*;\s*\1\s*(\+\+|--)\s*\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;

  for (let pass = 0; pass < 5; pass++) {
    let replacedAny = false;
    unrolled = unrolled.replace(
      forLoopPattern,
      (
        fullMatch,
        varName,
        charStart,
        numStart,
        op,
        charEnd,
        numEnd,
        step,
        body,
      ) => {
        replacedAny = true;
        let start = charStart
          ? charStart.charCodeAt(0)
          : parseInt(numStart, 10);
        let end = charEnd ? charEnd.charCodeAt(0) : parseInt(numEnd, 10);

        const iterations = [];
        const isChar = !!charStart;
        let i = start;
        const limit = 200;
        let count = 0;

        const checkCondition = () => {
          if (op === "<") return i < end;
          if (op === "<=") return i <= end;
          if (op === ">") return i > end;
          if (op === ">=") return i >= end;
          return false;
        };

        while (checkCondition() && count < limit) {
          let iterationBody = body;
          const valReplacement = isChar
            ? `'${String.fromCharCode(i)}'`
            : String(i);
          iterationBody = iterationBody.replace(
            new RegExp(`\\b${varName}\\b`, "g"),
            valReplacement,
          );
          iterations.push(iterationBody);

          if (step === "++") i++;
          else if (step === "--") i--;
          else break;
          count++;
        }
        return iterations.join("\n");
      },
    );
    if (!replacedAny) break;
  }
  return unrolled;
}

export function parseLcdSegments(
  code: string,
): { commands: string; duration: number }[] {
  const loopBody = extractFunctionBody(code, /void\s+loop\s*\(\s*\)\s*\{/);
  if (!loopBody) return [];

  const segments: { commands: string; duration: number }[] = [];
  const delayPattern = /\bdelay\s*\(\s*(\d+)\s*\)\s*;/g;
  let delayMatch;
  let lastIndex = 0;

  const bodyToScan = stripCodeComments(loopBody);
  while ((delayMatch = delayPattern.exec(bodyToScan)) !== null) {
    const commands = bodyToScan.slice(lastIndex, delayMatch.index).trim();
    const duration = Number(delayMatch[1]);
    segments.push({ commands, duration });
    lastIndex = delayMatch.index + delayMatch[0].length;
  }

  const remaining = bodyToScan.slice(lastIndex).trim();
  if (remaining.length > 0) {
    segments.push({ commands: remaining, duration: 0 });
  }

  return segments;
}

export function splitOuterCommas(str: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if ((c === '"' || c === "'") && (i === 0 || str[i - 1] !== "\\")) {
      if (inQuotes && quoteChar === c) {
        inQuotes = false;
      } else if (!inQuotes) {
        inQuotes = true;
        quoteChar = c;
      }
    }
    if (c === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

export function checkPinConnectivity(
  nodeId: string,
  pinId: string,
  targetType: "gnd" | "vcc" | "sda" | "scl",
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): boolean {
  const graph = buildConductiveGraphForStore(nodes, edges, {
    includeResistors: true,
  });
  const startKey = `${nodeId}:${pinId}`;
  const reachable = getReachableGraphNodes(graph, startKey);

  for (const key of reachable) {
    const [targetNodeId, targetPinId] = key.split(":");
    if (targetNodeId === nodeId) continue;
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) continue;
    const model = getNodeSimulationModelForStore(targetNode);

    if (targetType === "gnd") {
      if (targetPinId?.toLowerCase().includes("gnd")) return true;
      if (model === "battery" && targetPinId === "neg") return true;
      if (model === "powerSupply" && targetPinId === "black") return true;
    } else if (targetType === "vcc") {
      if (
        targetPinId === "5v" ||
        targetPinId === "3v3" ||
        targetPinId === "vcc" ||
        targetPinId?.toLowerCase().includes("5v") ||
        targetPinId?.toLowerCase().includes("3v3") ||
        targetPinId?.toLowerCase().includes("vbus") ||
        targetPinId?.toLowerCase().includes("vsys")
      )
        return true;
      if (model === "battery" && targetPinId === "pos") return true;
      if (model === "powerSupply" && targetPinId === "red") return true;
    } else if (targetType === "sda") {
      if (
        targetPinId === "sda" ||
        targetPinId === "a4" ||
        targetPinId === "gp4" ||
        targetPinId === "gp0" ||
        targetPinId === "gp8" ||
        targetPinId === "gp12" ||
        targetPinId === "gp16" ||
        targetPinId === "gp20" ||
        targetPinId === "d18"
      )
        return true;
    } else if (targetType === "scl") {
      if (
        targetPinId === "scl" ||
        targetPinId === "a5" ||
        targetPinId === "gp5" ||
        targetPinId === "gp1" ||
        targetPinId === "gp9" ||
        targetPinId === "gp13" ||
        targetPinId === "gp17" ||
        targetPinId === "gp21" ||
        targetPinId === "d19"
      )
        return true;
    }
  }
  return false;
}

export function checkPinIsConnected(
  nodeId: string,
  pinId: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): boolean {
  const graph = buildConductiveGraphForStore(nodes, edges, { includeResistors: true });
  const startKey = `${nodeId}:${pinId}`;
  const reachable = getReachableGraphNodes(graph, startKey);
  for (const key of reachable) {
    const [targetNodeId] = key.split(":");
    if (targetNodeId !== nodeId) return true;
  }
  return false;
}

export function parseUltrasonicOutputPins(code: string, distanceCm: number) {
  const cleaned = stripCodeComments(code);
  if (!cleaned.includes("pulseIn")) return { pins: [] };

  const constants = parseArduinoConstants(cleaned);
  const pins: Array<{ pin: number; high: boolean; frequency?: number }> = [];

  let i = 0;
  while (i < cleaned.length) {
    const match = cleaned.slice(i).match(/^if\s*\(/);
    if (!match) {
      i++;
      continue;
    }

    i += match[0].length;
    let depth = 1;
    let condStart = i;
    let condEnd = -1;
    while (i < cleaned.length) {
      if (cleaned[i] === "(") depth++;
      else if (cleaned[i] === ")") {
        depth--;
        if (depth === 0) {
          condEnd = i;
          break;
        }
      }
      i++;
    }

    if (condEnd === -1) continue;
    const condition = cleaned.slice(condStart, condEnd).trim();
    i++; // move past ')'

    const parseBlock = (): { body: string; endIdx: number } => {
      while (i < cleaned.length && /\s/.test(cleaned[i])) i++;
      if (i >= cleaned.length) return { body: "", endIdx: i };

      if (cleaned[i] === "{") {
        let blockDepth = 1;
        let blockStart = i + 1;
        i++;
        while (i < cleaned.length) {
          if (cleaned[i] === "{") blockDepth++;
          else if (cleaned[i] === "}") {
            blockDepth--;
            if (blockDepth === 0) {
              return { body: cleaned.slice(blockStart, i), endIdx: i + 1 };
            }
          }
          i++;
        }
        return { body: cleaned.slice(blockStart), endIdx: i };
      }

      // Single statement (until semicolon)
      let stmtStart = i;
      while (i < cleaned.length && cleaned[i] !== ";") i++;
      if (i < cleaned.length) i++;
      return { body: cleaned.slice(stmtStart, i), endIdx: i };
    };

    const { body: thenBody, endIdx: thenEnd } = parseBlock();
    i = thenEnd;

    while (i < cleaned.length && /\s/.test(cleaned[i])) i++;

    let elseBody = "";
    if (cleaned.slice(i).startsWith("else")) {
      i += 4;
      const { body: eBody, endIdx: elseEnd } = parseBlock();
      elseBody = eBody;
      i = elseEnd;
    }

    // Only process if the condition references distance variables
    if (/\b(distance|dist|cm)\b/i.test(condition)) {
      // Evaluate condition
      let expr = condition;
      // Replace distance variables
      expr = expr.replace(/\b(distance|dist|cm)\b/gi, String(distanceCm));
      // Replace HIGH/LOW
      expr = expr.replace(/\bHIGH\b/g, "1").replace(/\bLOW\b/g, "0");
      // Replace hex values
      expr = expr.replace(/\b0x([0-9a-fA-F]+)\b/g, (_, hex) =>
        String(parseInt(hex, 16)),
      );
      // Sanitize
      const sanitized = expr.replace(/[^0-9.+\-*/()&|!=<> ]/g, "");

      let isTrue = false;
      try {
        const evalResult = new Function(`return (${sanitized});`)();
        isTrue = !!evalResult;
      } catch (e) { }

      const activeBlock = isTrue ? thenBody : elseBody;
      const writePattern =
        /digitalWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*(HIGH|LOW)\s*\)/g;
      for (const m of activeBlock.matchAll(writePattern)) {
        const pin = resolveArduinoNumber(m[1], constants);
        if (pin !== null) {
          pins.push({
            pin,
            high: m[2] === "HIGH",
          });
        }
      }
      const tonePattern = /\btone\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*([A-Za-z_]\w*|-?\d+)[^)]*\)/g;
      for (const match of activeBlock.matchAll(tonePattern)) {
        const pin = resolveArduinoNumber(match[1], constants);
        const freq = resolveArduinoNumber(match[2], constants);
        if (pin !== null) {
          pins.push({ pin, high: true, frequency: freq ?? undefined });
        }
      }
      const noTonePattern = /\bnoTone\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)/g;
      for (const match of activeBlock.matchAll(noTonePattern)) {
        const pin = resolveArduinoNumber(match[1], constants);
        if (pin !== null) {
          pins.push({ pin, high: false, frequency: 0 });
        }
      }
    }
  }

  return { pins };
}

export function parsePhotoresistorAnalogValue(node: CircuitNode): number {
  const rawLightLevel = Math.max(
    0,
    Math.min(1023, Number(node.data.properties?.lightLevel?.value ?? 512)),
  );
  const fraction =
    rawLightLevel <= 100
      ? (rawLightLevel / 100) * 0.5
      : 0.5 + ((rawLightLevel - 100) / 923) * 0.5;
  return Math.round(fraction * 1023);
}

export function parseDigitalReadOutputsForInput(
  code: string,
  inputPin: number,
  high: boolean,
  timestamp: number,
) {
  const cleaned = stripCodeComments(code);
  if (!cleaned.includes("digitalRead")) return null;

  const constants = parseArduinoConstants(cleaned);
  const readValue = high ? "HIGH" : "LOW";
  const readVariables = new Set<string>();
  const assignmentPattern =
    /\b([A-Za-z_]\w*)\s*=\s*digitalRead\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)/g;

  for (const match of cleaned.matchAll(assignmentPattern)) {
    const pin = resolveArduinoNumber(match[2], parseArduinoConstants(code));
    if (pin === inputPin) readVariables.add(match[1]);
  }

  const conditionSources = [
    `digitalRead\\s*\\(\\s*(?:${inputPin}|${Array.from(constants.entries())
      .filter(([, value]) => value === inputPin)
      .map(([name]) => name)
      .join("|")})\\s*\\)`,
    ...Array.from(readVariables),
  ].filter((source) => !source.endsWith("(?:)\\s*\\)"));

  const outputs: Array<{ pin: number; high: boolean; frequency?: number }> = [];
  const serialLines: string[] = [];

  const addTimedOutputs = (block: string) => {
    const tokenPattern =
      /digitalWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*(HIGH|LOW)\s*\)|delay\s*\(\s*([A-Za-z_]\w*|\d+)\s*\)/g;
    const currentPins = new Map<number, boolean>();
    const steps: Array<{ pins: Map<number, boolean>; duration: number }> = [];
    let hasDelay = false;

    for (const token of block.matchAll(tokenPattern)) {
      if (token[1] !== undefined) {
        const pin = resolveArduinoNumber(token[1], parseArduinoConstants(code));
        if (pin !== null) currentPins.set(pin, token[2] === "HIGH");
        continue;
      }

      if (token[3] !== undefined && currentPins.size > 0) {
        const duration =
          resolveArduinoNumber(token[3], parseArduinoConstants(code)) ?? 1000;
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

    if (!steps.length) return;

    const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
    let cursor = timestamp % totalDuration;
    const activeStep =
      steps.find((step) => {
        if (cursor < step.duration) return true;
        cursor -= step.duration;
        return false;
      }) ?? steps[steps.length - 1];

    for (const [pin, pinHigh] of activeStep.pins) {
      outputs.push({ pin, high: pinHigh });
    }
  };

  for (const source of conditionSources) {
    const ifPattern = new RegExp(
      `if\\s*\\(\\s*(?:${source})\\s*(?:==\\s*(HIGH|LOW))?\\s*\\)\\s*\\{([\\s\\S]*?)\\}(?:\\s*else\\s*\\{([\\s\\S]*?)\\})?`,
      "gi",
    );

    for (const match of cleaned.matchAll(ifPattern)) {
      const expected = match[1] ?? "HIGH";
      const block = expected === readValue ? match[2] : (match[3] ?? "");
      const serialPattern = /Serial\.print(?:ln)?\s*\(\s*"([^"]*)"\s*\)/g;

      addTimedOutputs(block);
      for (const serial of block.matchAll(serialPattern)) {
        serialLines.push(serial[1]);
      }
    }
  }

  if (outputs.length === 0 && serialLines.length === 0) return null;
  return { outputs, serialLines };
}

function evaluateCondition(
  condition: string,
  currentVal: number,
  constants: Map<string, number>
): boolean {
  let replaced = condition.replace(
    /\b(?:temp|temperature|celsius|temperatureC|tempC|gasLevel|sensorValue|moisture|val|reading)\b/gi,
    String(currentVal)
  );
  for (const [cName, cVal] of constants.entries()) {
    replaced = replaced.replace(new RegExp(`\\b${cName}\\b`, "g"), String(cVal));
  }
  const sanitized = replaced.replace(/[^0-9.+\-*/()&|!=<> ]/g, "");
  try {
    if (sanitized.trim() === "") return false;
    return Boolean(new Function(`return Boolean(${sanitized});`)());
  } catch (_) {
    const match = condition.match(/(>=|>|<=|<|==|!=)\s*([A-Za-z_]\w*|-?\d+(?:\.\d+)?)/);
    if (!match) return false;

    const op = match[1];
    const operandToken = match[2];
    const threshold = /^-?\d+(?:\.\d+)?$/.test(operandToken)
      ? Number(operandToken)
      : (constants.get(operandToken) ?? 0);

    switch (op) {
      case ">=": return currentVal >= threshold;
      case ">": return currentVal > threshold;
      case "<=": return currentVal <= threshold;
      case "<": return currentVal < threshold;
      case "==": return currentVal === threshold;
      case "!=": return currentVal !== threshold;
      default: return false;
    }
  }
}


function parsePinStatements(
  body: string,
  constants: Map<string, number>
): Array<{ pin: number; high: boolean; frequency?: number }> {
  const pinStates = new Map<number, Set<boolean>>();
  const list: Array<{ pin: number; high: boolean; frequency?: number }> = [];
  const writePattern =
    /digitalWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*(HIGH|LOW)\s*\)/g;
  const tonePattern = /\btone\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*([A-Za-z_]\w*|-?\d+)[^)]*\)/g;
  const noTonePattern = /\bnoTone\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)/g;

  for (const match of body.matchAll(writePattern)) {
    const pin = resolveArduinoNumber(match[1], constants);
    if (pin !== null) {
      const high = match[2] === "HIGH";
      if (!pinStates.has(pin)) pinStates.set(pin, new Set());
      pinStates.get(pin)!.add(high);
      list.push({ pin, high });
    }
  }
  for (const match of body.matchAll(tonePattern)) {
    const pin = resolveArduinoNumber(match[1], constants);
    const freq = resolveArduinoNumber(match[2], constants);
    if (pin !== null) {
      if (!pinStates.has(pin)) pinStates.set(pin, new Set());
      pinStates.get(pin)!.add(true);
      list.push({ pin, high: true, frequency: freq ?? undefined });
    }
  }
  for (const match of body.matchAll(noTonePattern)) {
    const pin = resolveArduinoNumber(match[1], constants);
    if (pin !== null) {
      if (!pinStates.has(pin)) pinStates.set(pin, new Set());
      pinStates.get(pin)!.add(false);
      list.push({ pin, high: false, frequency: 0 });
    }
  }

  const finalPins: Array<{ pin: number; high: boolean; frequency?: number }> = [];
  const processed = new Set<number>();

  for (const item of list) {
    const states = pinStates.get(item.pin);
    if (states && states.size > 1) {
      // Pin has both HIGH and LOW writes -> toggling/blinking, skip overriding
      continue;
    }
    if (!processed.has(item.pin)) {
      processed.add(item.pin);
      finalPins.push(item);
    }
  }

  return finalPins;
}

export function evaluateSensorIfElseChain(
  code: string,
  sensorVarPattern: string,
  currentVal: number,
  constants: Map<string, number>
): Array<{ pin: number; high: boolean; frequency?: number }> | null {
  const regex = new RegExp(`\\bif\\s*\\(\\s*(?:${sensorVarPattern})\\b`, "i");
  const match = regex.exec(code);
  if (!match) return null;

  let remaining = code.slice(match.index);

  while (true) {
    // 1. Check for `else if (...) {` or `if (...) {`
    const branchMatch = remaining.match(/^\s*(?:else\s+if|if)\s*\(([^)]+)\)\s*\{/i);
    if (branchMatch) {
      const condition = branchMatch[1];
      const start = branchMatch.index! + branchMatch[0].length;

      // Find matching closing brace
      let depth = 1;
      let end = start;
      for (let i = start; i < remaining.length; i++) {
        if (remaining[i] === "{") depth++;
        else if (remaining[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }

      const body = remaining.slice(start, end);
      if (evaluateCondition(condition, currentVal, constants)) {
        return parsePinStatements(body, constants);
      }

      remaining = remaining.slice(end + 1);
      continue;
    }

    // 2. Check for `else {`
    const elseMatch = remaining.match(/^\s*else\s*\{/i);
    if (elseMatch) {
      const start = elseMatch.index! + elseMatch[0].length;

      let depth = 1;
      let end = start;
      for (let i = start; i < remaining.length; i++) {
        if (remaining[i] === "{") depth++;
        else if (remaining[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }

      const body = remaining.slice(start, end);
      return parsePinStatements(body, constants);
    }

    break;
  }

  return [];
}

export function parseGasOutputPins(code: string, gasLevel: number) {
  const cleaned = stripCodeComments(code);
  const constants = parseArduinoConstants(cleaned);
  constants.set("A0", 14);

  const assignment = cleaned.match(
    /\b([A-Za-z_]\w*)\s*=\s*analogRead\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)/,
  );
  const sensorExpression = assignment
    ? assignment[1]
    : String.raw`analogRead\s*\(\s*(?:A0|14|[A-Za-z_]\w*)\s*\)`;

  const pins = evaluateSensorIfElseChain(cleaned, sensorExpression, gasLevel, constants);
  if (pins === null) return null;
  return { threshold: 400, active: true, pins };
}

export function parseTemperatureOutputPins(code: string, celsiusValue: number) {
  const cleaned = stripCodeComments(code);
  const constants = parseArduinoConstants(cleaned);
  constants.set("A0", 14);

  const temperatureVariables = new Set([
    "temperatureC",
    "tempC",
    "temp",
    "temperature",
    "celsius",
  ]);
  for (const match of cleaned.matchAll(
    /\b([A-Za-z_]\w*)\s*=\s*\([^;]*(?:voltage|analogRead|reading)[^;]*\)\s*[*+-][^;]*;/gi,
  )) {
    temperatureVariables.add(match[1]);
  }
  for (const match of cleaned.matchAll(
    /\b(?:float|double|int|long)\s+([A-Za-z_]\w*)\s*=\s*\([^;]*(?:voltage|analogRead|reading)[^;]*\)\s*[*+-][^;]*;/gi,
  )) {
    temperatureVariables.add(match[1]);
  }

  const variablePattern = Array.from(temperatureVariables)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const pins = evaluateSensorIfElseChain(cleaned, variablePattern, celsiusValue, constants);
  if (pins !== null) {
    return { pins };
  }

  // If no if/else conditional structure is found in code, return empty pins array
  return { pins: [] };
}

export function parseSoilMoistureOutputPins(code: string, moistureScaled: number) {
  const cleaned = stripCodeComments(code);
  const constants = parseArduinoConstants(cleaned);

  const moistureVariables = new Set([
    "moisture", "soilMoisture", "moistureLevel", "soil", "soilLevel",
  ]);
  for (const match of cleaned.matchAll(
    /\b([A-Za-z_]\w*)\s*=\s*(?:analogRead|map|mapInt)\s*\([^)]*\)\s*;/gi,
  )) {
    moistureVariables.add(match[1]);
  }

  const variablePattern = Array.from(moistureVariables)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const pins = evaluateSensorIfElseChain(cleaned, variablePattern, moistureScaled, constants);
  return { pins: pins ?? [] };
}


export function parsePushbuttonTogglePins(code: string) {
  const cleaned = stripCodeComments(code);
  if (!cleaned.includes("digitalRead") || !cleaned.includes("digitalWrite"))
    return null;

  const constants = parseArduinoConstants(cleaned);
  const inputPullup =
    /pinMode\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*INPUT_PULLUP\s*\)/.test(cleaned);
  const readMatch = cleaned.match(
    /\b([A-Za-z_]\w*)\s*=\s*digitalRead\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)/,
  );
  const writeMatch = cleaned.match(
    /digitalWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*(HIGH|LOW|[A-Za-z_]\w*)\s*\)/,
  );
  if (!readMatch || !writeMatch) return null;

  const readVariable = readMatch[1];
  const buttonPin = resolveArduinoNumber(readMatch[2], constants);
  const ledPin = resolveArduinoNumber(writeMatch[1], constants);
  if (buttonPin === null || ledPin === null) return null;

  const writeValue = writeMatch[2];
  const togglesState =
    writeValue !== "HIGH" &&
    writeValue !== "LOW" &&
    new RegExp(`\\b${writeValue}\\s*=\\s*!\\s*${writeValue}\\b`).test(cleaned);
  const activeWhenPressedLow =
    inputPullup ||
    new RegExp(
      `${readVariable}\\s*==\\s*LOW|LOW\\s*==\\s*${readVariable}`,
    ).test(cleaned);

  return {
    buttonPin,
    ledPin,
    inputPullup,
    activeWhenPressedLow,
    togglesState,
    fixedValue: writeValue === "HIGH" ? 255 : writeValue === "LOW" ? 0 : null,
  };
}

export function parsePotentiometerAnalogPins(
  code: string,
  analogValue: number,
) {
  const cleaned = stripCodeComments(code);
  if (!cleaned.includes("analogRead")) return null;

  const constants = parseArduinoConstants(cleaned);
  const readMatch = cleaned.match(
    /\b([A-Za-z_]\w*)\s*=\s*analogRead\s*\(\s*(A0|[A-Za-z_]\w*|-?\d+)\s*\)/,
  );
  if (!readMatch) return null;

  const readVariable = readMatch[1];
  const analogPin = resolveArduinoNumber(readMatch[2], constants);
  if (analogPin === null) return null;
  const outputs: Array<{ pin: number; value: number }> = [];
  const mappedVariables = new Map<string, number>();
  const mapAssignmentPattern = new RegExp(
    `\\b([A-Za-z_]\\w*)\\s*=\\s*map\\s*\\(\\s*${readVariable}\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\)`,
    "g",
  );

  for (const match of cleaned.matchAll(mapAssignmentPattern)) {
    const fromLow = Number(match[2]);
    const fromHigh = Number(match[3]);
    const toLow = Number(match[4]);
    const toHigh = Number(match[5]);
    let scaled = toLow;
    if (fromHigh !== fromLow) {
      scaled = ((analogValue - fromLow) * (toHigh - toLow)) / (fromHigh - fromLow) + toLow;
    }
    mappedVariables.set(match[1], clampByte(scaled));
  }

  const analogWritePattern =
    /analogWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*([A-Za-z_]\w*|-?\d+|map\s*\([^)]+\))\s*\)/g;
  for (const match of cleaned.matchAll(analogWritePattern)) {
    const pin = resolveArduinoNumber(match[1], constants);
    if (pin === null) continue;

    const rawValue = match[2].trim();
    let value: number | null = null;
    if (rawValue.startsWith("map")) {
      const mapMatch = rawValue.match(
        /map\s*\(\s*([A-Za-z_]\w*)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/,
      );
      if (mapMatch?.[1] === readVariable) {
        const fromLow = Number(mapMatch[2]);
        const fromHigh = Number(mapMatch[3]);
        const toLow = Number(mapMatch[4]);
        const toHigh = Number(mapMatch[5]);
        if (fromHigh !== fromLow) {
          value = clampByte(((analogValue - fromLow) * (toHigh - toLow)) / (fromHigh - fromLow) + toLow);
        }
      }
    } else {
      value =
        mappedVariables.get(rawValue) ??
        resolveArduinoNumber(rawValue, constants);
    }

    if (value !== null) outputs.push({ pin, value: clampByte(value) });
  }

  const evaluateBranchCondition = (
    cond: string,
    varName: string,
    val: number,
  ): boolean => {
    const condRegex = new RegExp(
      `\\b${varName}\\b\\s*(<=|>=|<|>|==|!=)\\s*([^]+)`,
      "i",
    );
    const match = cond.match(condRegex);
    if (!match) return false;

    const op = match[1];
    const thresholdExpr = match[2].trim();

    const evalExpr = (expr: string): number => {
      let resolved = expr;
      for (const [k, v] of constants.entries()) {
        resolved = resolved.replace(new RegExp(`\\b${k}\\b`, "g"), String(v));
      }
      try {
        const fn = new Function(`return (${resolved});`);
        return Number(fn());
      } catch {
        return 0;
      }
    };

    const threshold = evalExpr(thresholdExpr);

    if (op === "<") return val < threshold;
    if (op === "<=") return val <= threshold;
    if (op === ">") return val > threshold;
    if (op === ">=") return val >= threshold;
    if (op === "==") return val === threshold;
    if (op === "!=") return val !== threshold;
    return false;
  };

  interface CodeBranch {
    type: "if" | "else if" | "else";
    condition: string;
    body: string;
  }
  const branches: CodeBranch[] = [];
  const branchRegex = /\b(if|else\s+if|else)\b/g;
  let branchMatch;
  while ((branchMatch = branchRegex.exec(cleaned)) !== null) {
    const keyword = branchMatch[1];
    const keywordIdx = branchMatch.index;
    let condition = "";
    let searchStart = keywordIdx + keyword.length;

    if (
      keyword === "if" ||
      keyword === "else if" ||
      keyword.startsWith("else\t")
    ) {
      const openParenIdx = cleaned.indexOf("(", searchStart);
      if (openParenIdx !== -1) {
        let parenDepth = 1;
        let closeParenIdx = -1;
        for (let i = openParenIdx + 1; i < cleaned.length; i++) {
          if (cleaned[i] === "(") parenDepth++;
          else if (cleaned[i] === ")") {
            parenDepth--;
            if (parenDepth === 0) {
              closeParenIdx = i;
              break;
            }
          }
        }
        if (closeParenIdx !== -1) {
          condition = cleaned.slice(openParenIdx + 1, closeParenIdx).trim();
          searchStart = closeParenIdx + 1;
        }
      }
    }

    const openBraceIdx = cleaned.indexOf("{", searchStart);
    if (openBraceIdx !== -1) {
      let braceDepth = 1;
      let closeBraceIdx = -1;
      for (let i = openBraceIdx + 1; i < cleaned.length; i++) {
        if (cleaned[i] === "{") braceDepth++;
        else if (cleaned[i] === "}") {
          braceDepth--;
          if (braceDepth === 0) {
            closeBraceIdx = i;
            break;
          }
        }
      }
      if (closeBraceIdx !== -1) {
        const body = cleaned.slice(openBraceIdx + 1, closeBraceIdx);
        branches.push({
          type: keyword.includes("if")
            ? keyword.includes("else")
              ? "else if"
              : "if"
            : "else",
          condition,
          body,
        });
      }
    }
  }

  const chains: CodeBranch[][] = [];
  for (const b of branches) {
    if (b.type === "if") {
      chains.push([b]);
    } else {
      if (chains.length > 0) chains[chains.length - 1].push(b);
      else chains.push([b]);
    }
  }

  const activeBlocks: string[] = [];
  for (const chain of chains) {
    const referencesVar = chain.some((b) => b.condition.includes(readVariable));
    if (!referencesVar) continue;

    let activeIdx = -1;
    for (let i = 0; i < chain.length; i++) {
      const b = chain[i];
      if (b.type === "if" || b.type === "else if") {
        if (evaluateBranchCondition(b.condition, readVariable, analogValue)) {
          activeIdx = i;
          break;
        }
      } else {
        activeIdx = i;
        break;
      }
    }

    if (activeIdx !== -1) activeBlocks.push(chain[activeIdx].body);
  }

  const writePattern =
    /digitalWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*(HIGH|LOW)\s*\)/g;
  for (const block of activeBlocks) {
    for (const match of block.matchAll(writePattern)) {
      const pin = resolveArduinoNumber(match[1], constants);
      if (pin !== null)
        outputs.push({ pin, value: match[2] === "HIGH" ? 255 : 0 });
    }
  }

  return { analogPin, analogValue, outputs };
}

export function getPressedArduinoButtonPins(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
) {
  const pressedPins = new Set<number>();
  const arduinoNode = nodes.find(
    (node) => getNodeSimulationModelForStore(node) === "arduino",
  );
  if (!arduinoNode) return pressedPins;

  for (const node of nodes) {
    const model = getNodeSimulationModelForStore(node);
    if (model !== "pushbutton" && model !== "slideswitch") continue;
    if (model === "pushbutton" && node.data.properties?.state?.value !== "on")
      continue;

    for (const edge of edges) {
      const boardHandle =
        edge.source === arduinoNode.id && edge.target === node.id
          ? edge.sourceHandle
          : edge.target === arduinoNode.id && edge.source === node.id
            ? edge.targetHandle
            : null;
      const match =
        typeof boardHandle === "string" ? boardHandle.match(/^d(\d+)$/) : null;
      if (match) pressedPins.add(Number(match[1]));
    }
  }

  return pressedPins;
}

export function getPressedArduinoButtonLabels(nodes: CircuitNode[]) {
  const labels = new Set<string>();

  for (const node of nodes) {
    const model = getNodeSimulationModelForStore(node);
    if (model !== "pushbutton" && model !== "slideswitch") continue;
    if (model === "pushbutton" && node.data.properties?.state?.value !== "on")
      continue;

    const label = String(
      node.data.properties?.name?.value ?? node.data.label ?? "",
    )
      .trim()
      .toUpperCase();
    if (label) labels.add(label);
  }

  return labels;
}

export function hasPressedLabel(labels: Set<string>, tokens: string[]) {
  for (const label of labels) {
    if (tokens.some((token) => label.includes(token))) return true;
  }
  return false;
}

export type CarButtonCommand = "forward" | "back" | "left" | "right" | "stop";

export function getPressedCarButtonCommand(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  code: string,
): CarButtonCommand | null {
  const cleaned = stripCodeComments(code);
  const constants = parseArduinoConstants(cleaned);
  const pressedPins = getPressedArduinoButtonPins(nodes, edges);
  const pressedLabels = getPressedArduinoButtonLabels(nodes);
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const constValue = (...names: string[]) => {
    for (const name of names) {
      const value = constants.get(name);
      if (typeof value === "number") return value;
    }
    return null;
  };
  const pinPressed = (...names: string[]) => {
    const pin = constValue(...names);
    return pin !== null && pressedPins.has(pin);
  };

  if (
    pinPressed("btnStop", "buttonStop", "stopButton") ||
    hasPressedLabel(pressedLabels, ["STOP", "BRAKE", "BREAK"])
  )
    return "stop";
  if (
    pinPressed("btnLeft", "buttonLeft", "leftButton") ||
    hasPressedLabel(pressedLabels, ["LEFT"])
  )
    return "left";
  if (
    pinPressed("btnRight", "buttonRight", "rightButton") ||
    hasPressedLabel(pressedLabels, ["RIGHT"])
  )
    return "right";
  if (
    pinPressed("btnForward", "buttonForward", "forwardButton") ||
    hasPressedLabel(pressedLabels, ["FORWARD", "AAGE", "FRONT"])
  )
    return "forward";
  if (
    pinPressed(
      "btnBack",
      "btnReverse",
      "buttonBack",
      "buttonReverse",
      "reverseButton",
    ) ||
    hasPressedLabel(pressedLabels, ["BACK", "REVERSE", "PICHE"])
  )
    return "back";

  return null;
}

export function parseL293DCarControlPins(
  code: string,
  analogValue: number,
  pressedPins: Set<number>,
  pressedLabels = new Set<string>(),
) {
  const cleaned = stripCodeComments(code);
  if (
    !cleaned.includes("digitalRead") ||
    !cleaned.includes("digitalWrite") ||
    !cleaned.includes("analogWrite")
  )
    return null;

  const constants = parseArduinoConstants(cleaned);
  constants.set("A0", 14);
  const constValue = (...names: string[]) => {
    for (const name of names) {
      const value = constants.get(name);
      if (typeof value === "number") return value;
    }
    return null;
  };
  const analogReadMatch = cleaned.match(
    /\b([A-Za-z_]\w*)\s*=\s*analogRead\s*\(\s*(A0|[A-Za-z_]\w*|-?\d+)\s*\)/,
  );
  if (!analogReadMatch) return null;

  const readVariable = analogReadMatch[1];
  const mappedVariables = new Map<string, number>();
  const mapAssignmentPattern = new RegExp(
    `\\b([A-Za-z_]\\w*)\\s*=\\s*map\\s*\\(\\s*${readVariable}\\s*,\\s*0\\s*,\\s*1023\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)`,
    "g",
  );
  for (const match of cleaned.matchAll(mapAssignmentPattern)) {
    const min = Number(match[2]);
    const max = Number(match[3]);
    mappedVariables.set(
      match[1],
      clampByte(min + (analogValue / 1023) * (max - min)),
    );
  }

  const outputs: Array<{ pin: number; value: number }> = [];
  const inputPins = new Map<number, number>();
  const analogWritePattern =
    /analogWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*([A-Za-z_]\w*|-?\d+|map\s*\([^)]+\))\s*\)/g;
  for (const match of cleaned.matchAll(analogWritePattern)) {
    const pin = resolveArduinoNumber(match[1], constants);
    if (pin === null) continue;

    const rawValue = match[2].trim();
    let value =
      mappedVariables.get(rawValue) ??
      resolveArduinoNumber(rawValue, constants);
    if (value === null && rawValue.startsWith("map")) {
      const mapMatch = rawValue.match(
        /map\s*\(\s*([A-Za-z_]\w*)\s*,\s*0\s*,\s*1023\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/,
      );
      if (mapMatch?.[1] === readVariable) {
        value = clampByte(
          Number(mapMatch[2]) +
          (analogValue / 1023) * (Number(mapMatch[3]) - Number(mapMatch[2])),
        );
      }
    }

    outputs.push({ pin, value: clampByte(value ?? 0) });
  }

  const forwardPin = constValue("btnForward", "buttonForward", "forwardButton");
  const backPin = constValue(
    "btnBack",
    "btnReverse",
    "buttonBack",
    "buttonReverse",
    "reverseButton",
  );
  const stopPin = constValue("btnStop", "buttonStop", "stopButton");
  const leftPin = constValue("btnLeft", "buttonLeft", "leftButton");
  const rightPin = constValue("btnRight", "buttonRight", "rightButton");
  const enaPin = constValue("ENA", "ena");
  const enbPin = constValue("ENB", "enb");
  const in1Pin = constValue("IN1", "in1");
  const in2Pin = constValue("IN2", "in2");
  const in3Pin = constValue("IN3", "in3");
  const in4Pin = constValue("IN4", "in4");
  const command =
    (stopPin !== null && pressedPins.has(stopPin)) ||
      hasPressedLabel(pressedLabels, ["STOP", "BRAKE", "BREAK"])
      ? "stop"
      : (leftPin !== null && pressedPins.has(leftPin)) ||
        hasPressedLabel(pressedLabels, ["LEFT"])
        ? "left"
        : (rightPin !== null && pressedPins.has(rightPin)) ||
          hasPressedLabel(pressedLabels, ["RIGHT"])
          ? "right"
          : (forwardPin !== null && pressedPins.has(forwardPin)) ||
            hasPressedLabel(pressedLabels, ["FORWARD", "AAGE", "FRONT"])
            ? "forward"
            : (backPin !== null && pressedPins.has(backPin)) ||
              hasPressedLabel(pressedLabels, ["BACK", "REVERSE", "PICHE"])
              ? "back"
              : null;

  for (const pin of [forwardPin, backPin, stopPin, leftPin, rightPin]) {
    if (pin !== null) inputPins.set(pin, pressedPins.has(pin) ? 0 : 255);
  }

  if (
    command &&
    enaPin !== null &&
    enbPin !== null &&
    in1Pin !== null &&
    in2Pin !== null &&
    in3Pin !== null &&
    in4Pin !== null
  ) {
    const pwmOutputs = outputs.filter(
      (output) => output.pin === enaPin || output.pin === enbPin,
    );
    const existingPwm = Math.max(
      0,
      ...pwmOutputs.map((output) => output.value),
    );
    const drivePwm =
      command === "stop" ? 0 : pwmOutputs.length > 0 ? existingPwm : 180;
    const setOutput = (pin: number, value: number) =>
      outputs.push({ pin, value });

    setOutput(enaPin, drivePwm);
    setOutput(enbPin, drivePwm);

    if (command === "stop") {
      setOutput(in1Pin, 0);
      setOutput(in2Pin, 0);
      setOutput(in3Pin, 0);
      setOutput(in4Pin, 0);
    } else if (command === "left") {
      setOutput(in1Pin, 0);
      setOutput(in2Pin, 255);
      setOutput(in3Pin, 255);
      setOutput(in4Pin, 0);
    } else if (command === "right") {
      setOutput(in1Pin, 255);
      setOutput(in2Pin, 0);
      setOutput(in3Pin, 0);
      setOutput(in4Pin, 255);
    } else if (command === "forward") {
      setOutput(in1Pin, 255);
      setOutput(in2Pin, 0);
      setOutput(in3Pin, 255);
      setOutput(in4Pin, 0);
    } else if (command === "back") {
      setOutput(in1Pin, 0);
      setOutput(in2Pin, 255);
      setOutput(in3Pin, 0);
      setOutput(in4Pin, 255);
    }

    return {
      analogPin: 14,
      analogValue,
      inputPins: Array.from(inputPins, ([pin, value]) => ({ pin, value })),
      outputs,
    };
  }

  const branchPattern =
    /(?:if|else\s+if)\s*\(\s*digitalRead\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)\s*==\s*(LOW|HIGH)\s*\)\s*\{([\s\S]*?)\}/g;
  let activeBlock: string | null = null;
  for (const match of cleaned.matchAll(branchPattern)) {
    const pin = resolveArduinoNumber(match[1], constants);
    if (pin === null) continue;
    const pressed = pressedPins.has(pin);
    const readValue = pressed ? "LOW" : "HIGH";
    inputPins.set(pin, pressed ? 0 : 255);
    if (activeBlock === null && readValue === match[2]) activeBlock = match[3];
  }

  if (activeBlock !== null) {
    const writePattern =
      /digitalWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*(HIGH|LOW)\s*\)/g;
    for (const match of activeBlock.matchAll(writePattern)) {
      const pin = resolveArduinoNumber(match[1], constants);
      if (pin !== null)
        outputs.push({ pin, value: match[2] === "HIGH" ? 255 : 0 });
    }
  }

  if (outputs.length === 0 && inputPins.size === 0) return null;
  return {
    analogPin: 14,
    analogValue,
    inputPins: Array.from(inputPins, ([pin, value]) => ({ pin, value })),
    outputs,
  };
}
