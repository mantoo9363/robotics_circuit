/**
 * ESP32 C++ (Arduino-style) Bluetooth Serial (Classic SPP) Engine
 *
 * Implements Bluetooth Serial emulation for ESP32:
 *  - #include <BluetoothSerial.h> or "BluetoothSerial.h"
 *  - BluetoothSerial SerialBT;
 *  - SerialBT.begin("ESP32_Device_Name");
 *  - SerialBT.available();
 *  - SerialBT.read();
 *  - SerialBT.readString();
 *  - SerialBT.print(expr, [format]) and SerialBT.println([expr], [format])
 *  - SerialBT.write(byte / char / buffer)
 *  - SerialBT.connected();
 *  - Bidirectional TX/RX buffering with dedicated UI tab separation
 */

import {
  stripCppComments,
  stripCppIncludes,
  parseCppConstants,
  extractCppFunctionBody,
} from "./cppPatterns";
import type { CircuitNode, CircuitEdge } from "../../types";

export interface Esp32CppBluetoothContext {
  tick?: number;
  timestamp?: number;
  running?: boolean;
  rxBuffer?: string;
  nodes?: CircuitNode[];
  edges?: CircuitEdge[];
  variables?: Map<string, any>;
}

export interface Esp32CppBluetoothResult {
  deviceName: string;
  isInitialized: boolean;
  initialized: boolean;
  newLines: string[];
  allLines: string[];
  bluetoothOutput: string[];
  output: string[];
  pendingBuffer: string;
  available: boolean;
  rxLength: number;
  nextChar: string | null;
  readString: string;
}

interface CppBluetoothSessionState {
  deviceName: string;
  rawBtLines: string[];
  pendingBuffer: string;
  lastTick: number;
  setupExecuted: boolean;
  rxBuffer: string;
}

// Global session state for Bluetooth Serial
const btSessionStates = new Map<string, CppBluetoothSessionState>();

/** Resets all or specific ESP32 C++ Bluetooth Serial session buffers. */
export function resetEsp32CppBluetoothSessions(codeKey?: string) {
  if (codeKey) {
    btSessionStates.delete(codeKey);
  } else {
    btSessionStates.clear();
  }
}

export const clearBluetoothSerialSession = resetEsp32CppBluetoothSessions;

/** Global RX buffer accessor for Bluetooth Serial input simulation */
let globalBluetoothRxQueue = "";

export function pushGlobalBluetoothRx(text: string): void {
  globalBluetoothRxQueue += text;
}

export function clearGlobalBluetoothRx(): void {
  globalBluetoothRxQueue = "";
}

export function getGlobalBluetoothRx(): string {
  return globalBluetoothRxQueue;
}

export function popGlobalBluetoothRx(count: number = 1): string {
  const popped = globalBluetoothRxQueue.slice(0, count);
  globalBluetoothRxQueue = globalBluetoothRxQueue.slice(count);
  return popped;
}

/** Extracts parenthesized arguments from SerialBT.print(...) or SerialBT.println(...). */
function extractParenArgs(
  code: string,
  startIndex: number,
): { argsStr: string; afterIndex: number } | null {
  const openParen = code.indexOf("(", startIndex);
  if (openParen === -1) return null;

  let depth = 1;
  let inString = false;
  let quoteChar = "";

  for (let i = openParen + 1; i < code.length; i++) {
    const char = code[i];
    const prev = i > 0 ? code[i - 1] : "";

    if (inString) {
      if (char === quoteChar && prev !== "\\") {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth === 0) {
        return {
          argsStr: code.slice(openParen + 1, i).trim(),
          afterIndex: i + 1,
        };
      }
    }
  }

  return null;
}

/** Splits top-level arguments by comma, ignoring commas inside nested quotes/parens. */
function splitTopLevelArgs(argsStr: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];
    const prev = i > 0 ? argsStr[i - 1] : "";

    if (inQuotes) {
      current += char;
      if (char === quoteChar && prev !== "\\") {
        inQuotes = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuotes = true;
      quoteChar = char;
      current += char;
      continue;
    }

    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}

/** Evaluates simple expressions, string literals, and formatting specifiers. */
function evaluateBtExpr(
  expr: string,
  constants: Map<string, number>,
  localVars: Map<string, any>,
): string {
  const trimmed = expr.trim();
  if (!trimmed) return "";

  // String literal: "hello world"
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Pure integer
  if (/^-?\d+$/.test(trimmed)) {
    return trimmed;
  }

  // Pure hex
  if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
    return String(parseInt(trimmed, 16));
  }

  // Injected variables / local variables
  if (localVars.has(trimmed)) {
    return String(localVars.get(trimmed));
  }

  // Constants
  if (constants.has(trimmed)) {
    return String(constants.get(trimmed));
  }

  // String concatenation: "Key: " + key
  if (trimmed.includes("+")) {
    const segments = trimmed.split("+").map((s) => s.trim());
    return segments
      .map((seg) => evaluateBtExpr(seg, constants, localVars))
      .join("");
  }

  return trimmed;
}

/** Formats integer/float values based on Arduino base specifier (HEX, BIN, DEC, OCT). */
function formatBtValue(rawText: string, formatToken: string): string {
  const fmt = formatToken.trim().toUpperCase();
  const num = Number(rawText);

  if (isNaN(num)) return rawText;

  if (fmt === "HEX") {
    return (num >>> 0).toString(16).toUpperCase();
  }
  if (fmt === "BIN") {
    return (num >>> 0).toString(2);
  }
  if (fmt === "OCT") {
    return (num >>> 0).toString(8);
  }
  if (fmt === "DEC") {
    return String(Math.floor(num));
  }
  if (/^\d+$/.test(fmt)) {
    // Float precision: e.g. SerialBT.print(val, 2)
    const digits = parseInt(fmt, 10);
    return num.toFixed(digits);
  }

  return rawText;
}

/** Discovers the BluetoothSerial instance name in the sketch (default: "SerialBT"). */
export function extractBluetoothInstanceName(code: string): string | null {
  if (!code || typeof code !== "string") return null;
  const cleaned = stripCppIncludes(stripCppComments(code));
  const declMatch = cleaned.match(/\bBluetoothSerial\s+([A-Za-z_]\w*)/);
  return declMatch ? declMatch[1] : null;
}

/**
 * Extracts Bluetooth variables, available flag, and current read character
 * into the conditional evaluation context.
 */
export function extractCppBluetoothVariables(
  code: string,
  context: Esp32CppBluetoothContext,
  localVars: Map<string, any>,
): void {
  const btInstance = extractBluetoothInstanceName(code) || "SerialBT";
  const activeRx = context.rxBuffer ?? globalBluetoothRxQueue;

  const hasAvailable = activeRx.length > 0;
  const nextChar = hasAvailable ? activeRx[0] : "";
  const nextCharCode = hasAvailable ? activeRx.charCodeAt(0) : -1;

  localVars.set("__bt_available", hasAvailable);
  localVars.set("__bt_char", nextChar);
  localVars.set("__bt_char_code", nextCharCode);
  localVars.set("__bt_string", activeRx);
  localVars.set(`${btInstance}.available()`, hasAvailable ? 1 : 0);
  localVars.set(`${btInstance}.read()`, nextChar);
  localVars.set(`${btInstance}.readString()`, activeRx);
  localVars.set(`${btInstance}.connected()`, context.running !== false ? 1 : 0);

  // Extract variable assignments: e.g. char c = SerialBT.read();
  const loopBody = extractCppFunctionBody(code, "loop") || "";
  const varReadRegex = new RegExp(
    `\\b(?:(?:const\\s+)?(?:char|int|uint8_t|byte|auto)\\s+)?([A-Za-z_]\\w*)\\s*=\\s*(?:${btInstance}\\.)?read\\s*\\(\\s*\\)`,
    "g",
  );
  let varMatch: RegExpExecArray | null;
  while ((varMatch = varReadRegex.exec(loopBody)) !== null) {
    const varName = varMatch[1];
    localVars.set(varName, nextChar);
  }

  const varReadStrRegex = new RegExp(
    `\\b(?:(?:const\\s+)?(?:String|auto)\\s+)?([A-Za-z_]\\w*)\\s*=\\s*(?:${btInstance}\\.)?readString\\s*\\(\\s*\\)`,
    "g",
  );
  let strMatch: RegExpExecArray | null;
  while ((strMatch = varReadStrRegex.exec(loopBody)) !== null) {
    const varName = strMatch[1];
    localVars.set(varName, activeRx);
  }

  // Extract direct numeric variable declarations: float temp = 24.567; int val = 255;
  const numVarRegex = /\b(?:int|float|double|byte|uint8_t|uint16_t|uint32_t|long)\s+([A-Za-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g;
  let numMatch: RegExpExecArray | null;
  while ((numMatch = numVarRegex.exec(code)) !== null) {
    const varName = numMatch[1];
    const numVal = Number(numMatch[2]);
    if (!localVars.has(varName)) {
      localVars.set(varName, numVal);
    }
  }

  // Extract direct string variable declarations: String msg = "Hello";
  const stringVarRegex = /\b(?:String|const\s+char\*)\s+([A-Za-z_]\w*)\s*=\s*"([^"]*)"\s*;/g;
  let strLiteralMatch: RegExpExecArray | null;
  while ((strLiteralMatch = stringVarRegex.exec(code)) !== null) {
    const varName = strLiteralMatch[1];
    const strVal = strLiteralMatch[2];
    if (!localVars.has(varName)) {
      localVars.set(varName, strVal);
    }
  }
}

/**
 * Evaluates ESP32 C++ Bluetooth Serial communications.
 * Captures SerialBT.print, SerialBT.println, SerialBT.write, and maintains stream buffers.
 */
export function evaluateEsp32CppBluetoothSerial(
  code: string,
  context: Esp32CppBluetoothContext = {},
): Esp32CppBluetoothResult {
  if (!code || typeof code !== "string") {
    return {
      deviceName: "",
      isInitialized: false,
      initialized: false,
      newLines: [],
      allLines: [],
      bluetoothOutput: [],
      output: [],
      pendingBuffer: "",
      available: false,
      rxLength: 0,
      nextChar: null,
      readString: "",
    };
  }

  const cleaned = stripCppIncludes(stripCppComments(code));
  const isBluetoothUsed = /\bBluetoothSerial\b/.test(cleaned);
  if (!isBluetoothUsed) {
    return {
      deviceName: "",
      isInitialized: false,
      initialized: false,
      newLines: [],
      allLines: [],
      bluetoothOutput: [],
      output: [],
      pendingBuffer: "",
      available: false,
      rxLength: 0,
      nextChar: null,
      readString: "",
    };
  }

  const btInstance = extractBluetoothInstanceName(code) || "SerialBT";
  const constants = parseCppConstants(code);
  const localVars = new Map<string, any>(context.variables ?? []);
  extractCppBluetoothVariables(code, context, localVars);

  // Extract device name from begin("name")
  let deviceName = "ESP32_BT";
  const beginRegex = new RegExp(`\\b${btInstance}\\.begin\\s*\\(([^)]*)\\)`);
  const beginMatch = cleaned.match(beginRegex);
  if (beginMatch) {
    const arg = beginMatch[1].trim();
    if (arg) {
      if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
        deviceName = arg.slice(1, -1);
      } else {
        deviceName = evaluateBtExpr(arg, constants, localVars) || "ESP32_BT";
      }
    }
  }

  const codeKey = `${deviceName}:${code.length}`;
  let session = btSessionStates.get(codeKey);
  const tick = context.tick ?? 0;

  if (!session || tick === 0) {
    session = {
      deviceName,
      rawBtLines: [],
      pendingBuffer: "",
      lastTick: -1,
      setupExecuted: false,
      rxBuffer: context.rxBuffer ?? globalBluetoothRxQueue,
    };
    btSessionStates.set(codeKey, session);
  }

  const newLines: string[] = [];

  // Helper to append output chunks to the session stream
  function appendChunk(chunk: string, isPrintln: boolean) {
    if (isPrintln) {
      const fullLine = session!.pendingBuffer + chunk;
      session!.pendingBuffer = "";
      session!.rawBtLines.push(fullLine);
      newLines.push(fullLine);
    } else {
      if (chunk.includes("\n")) {
        const parts = (session!.pendingBuffer + chunk).split("\n");
        session!.pendingBuffer = parts.pop() ?? "";
        for (const line of parts) {
          session!.rawBtLines.push(line);
          newLines.push(line);
        }
      } else {
        session!.pendingBuffer += chunk;
      }
    }
  }

  // Process a code block for SerialBT.print / println / write statements
  function processPrintBlock(block: string) {
    const printCallRegex = new RegExp(`\\b${btInstance}\\s*\\.\\s*(print|println|write)\\s*\\(`, "g");
    let match: RegExpExecArray | null;

    while ((match = printCallRegex.exec(block)) !== null) {
      const method = match[1];
      const parenResult = extractParenArgs(block, match.index);
      if (!parenResult) continue;

      const isPrintln = method === "println";
      const isWrite = method === "write";
      const args = splitTopLevelArgs(parenResult.argsStr);

      if (args.length === 0) {
        if (isPrintln) appendChunk("", true);
        continue;
      }

      const mainExpr = args[0];
      const formatArg = args.length > 1 ? args[1] : undefined;

      let evaluated = evaluateBtExpr(mainExpr, constants, localVars);

      if (isWrite && /^\d+$/.test(evaluated)) {
        // write(char_code) -> single character
        evaluated = String.fromCharCode(parseInt(evaluated, 10));
      } else if (formatArg) {
        evaluated = formatBtValue(evaluated, formatArg);
      }

      appendChunk(evaluated, isPrintln);
    }
  }

  // 1. Execute setup() if not executed
  if (!session.setupExecuted) {
    const setupBody = extractCppFunctionBody(code, "setup");
    if (setupBody) {
      processPrintBlock(setupBody);
    }
    session.setupExecuted = true;
  }

  // 2. Execute loop()
  const loopBody = extractCppFunctionBody(code, "loop");
  if (loopBody && tick !== session.lastTick) {
    // If conditionals exist, only process active branches
    const available = localVars.get("__bt_available") === true;
    const nextChar = String(localVars.get("__bt_char") ?? "");

    // Check if loop has if (SerialBT.available()) or char conditionals
    const hasBtCondition = new RegExp(`\\b${btInstance}\\s*\\.\\s*available\\s*\\(`).test(loopBody);
    if (!hasBtCondition || available) {
      processPrintBlock(loopBody);
      if (available) {
        if (new RegExp(`\\b${btInstance}\\s*\\.\\s*readString\\s*\\(`).test(loopBody)) {
          popGlobalBluetoothRx(globalBluetoothRxQueue.length);
        } else if (new RegExp(`\\b${btInstance}\\s*\\.\\s*read\\s*\\(`).test(loopBody)) {
          popGlobalBluetoothRx(1);
        }
      }
    }
    session.lastTick = tick;
  }

  const activeRx = context.rxBuffer ?? globalBluetoothRxQueue;
  const linesCopy = [...session.rawBtLines];

  return {
    deviceName,
    isInitialized: true,
    initialized: true,
    newLines,
    allLines: linesCopy,
    bluetoothOutput: linesCopy,
    output: linesCopy,
    pendingBuffer: session.pendingBuffer,
    available: activeRx.length > 0,
    rxLength: activeRx.length,
    nextChar: activeRx.length > 0 ? activeRx[0] : null,
    readString: activeRx,
  };
}
