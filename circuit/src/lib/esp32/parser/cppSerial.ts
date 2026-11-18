/**
 * ESP32 C++ (Arduino-style) Serial Communication Engine
 *
 * Implements Phase 3:
 *  - Serial.begin(baud) recognition as a safe setup call
 *  - Serial.print(expr, [format]) and Serial.println([expr], [format])
 *  - Multi-tick stream buffering (accumulates partial prints until newline or println)
 *  - Variable resolution, analogRead/digitalRead resolution, and String concatenation
 *  - Base formatting specifiers (HEX, BIN, DEC, OCT) and float precision
 *  - Conditional execution within if/else blocks
 */

import {
  stripCppComments,
  stripCppIncludes,
  parseCppConstants,
  extractCppFunctionBody,
  resolveCppPinNumber,
} from "./cppPatterns";
import { evaluateEsp32CppKeypad } from "./cppKeypad";
import { extractCppUltrasonicVariables, resolveEsp32PulseIn, evaluateCppArithmeticExpr } from "./cppUltrasonic";
import { extractCppIrReceiverVariables } from "./cppIrReceiver";
import { getAnalogValueForPicoPin } from "../../codeParsing/picoAnalogPins";
import type { CircuitNode, CircuitEdge } from "../../types";

export interface Esp32CppSerialContext {
  tick?: number;
  timestamp?: number;
  inputStates?: Map<number, boolean>;
  adcValues?: Map<number, number>;
  nodes?: CircuitNode[];
  edges?: CircuitEdge[];
  variables?: Map<string, any>;
}

export interface Esp32CppSerialResult {
  newLines: string[];
  allLines: string[];
  pendingBuffer: string;
}

interface CppSerialSessionState {
  rawSerialLines: string[];
  pendingBuffer: string;
  lastTick: number;
  setupExecuted: boolean;
}

// Global session state cache for ESP32 C++ simulation sessions
const sessionStates = new Map<string, CppSerialSessionState>();

/** Resets all or specific ESP32 C++ serial session buffers. */
export function resetEsp32CppSerialSessions(codeKey?: string) {
  if (codeKey) {
    sessionStates.delete(codeKey);
  } else {
    sessionStates.clear();
  }
}

/** Extracts parenthesized arguments from Serial.print(...) or Serial.println(...). */
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

/** Extracts matching curly brace block { ... } starting at startIndex. */
function extractBlock(
  code: string,
  startIndex: number,
): { block: string; endIndex: number } {
  const openBrace = code.indexOf("{", startIndex);
  if (openBrace === -1) {
    const semi = code.indexOf(";", startIndex);
    const end = semi !== -1 ? semi + 1 : code.length;
    return { block: code.slice(startIndex, end), endIndex: end };
  }

  let depth = 0;
  let inString = false;
  let quoteChar = "";

  for (let i = openBrace; i < code.length; i++) {
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

    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        return { block: code.slice(openBrace + 1, i), endIndex: i + 1 };
      }
    }
  }

  return { block: code.slice(openBrace + 1), endIndex: code.length };
}

/**
 * Formats a numeric or string value according to Arduino base specifier or decimal precision.
 */
function applyArduinoFormat(val: any, formatSpec: string): string {
  const num = Number(val);
  const spec = formatSpec.trim().toUpperCase();

  if (isNaN(num)) {
    return String(val);
  }

  if (spec === "HEX") {
    return (num >>> 0).toString(16).toUpperCase();
  }
  if (spec === "BIN") {
    return (num >>> 0).toString(2);
  }
  if (spec === "OCT") {
    return (num >>> 0).toString(8);
  }
  if (spec === "DEC") {
    return Math.round(num).toString(10);
  }

  // Decimal precision for floating point numbers: e.g. Serial.print(1.2345, 2) -> "1.23"
  if (/^\d+$/.test(spec)) {
    const digits = parseInt(spec, 10);
    return num.toFixed(digits);
  }

  return String(val);
}

/**
 * Evaluates a single argument expression for Serial.print.
 */
function evaluateSerialArgument(
  rawArg: string,
  constants: Map<string, number>,
  variables: Map<string, any>,
  context: Esp32CppSerialContext,
): string {
  let expr = rawArg.trim();
  if (!expr) return "";

  // Check for formatting specifier: Serial.print(val, FORMAT)
  // Need to be careful not to split inside String(...) or quotes
  let formatSpec: string | null = null;
  const commaIdx = expr.lastIndexOf(",");
  if (commaIdx !== -1) {
    const potentialFormat = expr.slice(commaIdx + 1).trim();
    const potentialExpr = expr.slice(0, commaIdx).trim();
    if (
      /^(?:HEX|BIN|DEC|OCT|\d+)$/i.test(potentialFormat) &&
      !potentialExpr.includes('"')
    ) {
      expr = potentialExpr;
      formatSpec = potentialFormat;
    }
  }

  // Evaluates a single operand (variable, literal, function call, or String(...))
  function evalOperand(op: string): string {
    const trimmed = op.trim();
    if (!trimmed) return "";

    // 1. Quoted string literal: "hello world" or 'c'
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    // 2. String(expr) constructor wrapper
    const stringCtorMatch = trimmed.match(/^String\s*\(([\s\S]*)\)$/);
    if (stringCtorMatch) {
      return evalOperand(stringCtorMatch[1]);
    }

    // 3. digitalRead(pin)
    const digitalReadMatch = trimmed.match(/^digitalRead\s*\(\s*([^,\s)]+)\s*\)$/);
    if (digitalReadMatch) {
      const pin = resolveCppPinNumber(digitalReadMatch[1], constants);
      if (pin !== null && context.inputStates) {
        return context.inputStates.get(pin) ? "1" : "0";
      }
      return "0";
    }

    // 4. analogRead(pin)
    const analogReadMatch = trimmed.match(/^analogRead\s*\(\s*([^,\s)]+)\s*\)$/);
    if (analogReadMatch) {
      const pin = resolveCppPinNumber(analogReadMatch[1], constants);
      if (pin !== null) {
        if (context.adcValues && context.adcValues.has(pin)) {
          return String(context.adcValues.get(pin));
        }
        if (context.nodes && context.edges) {
          const raw10 = getAnalogValueForPicoPin(pin, context.nodes, context.edges, "10bit");
          return String(raw10);
        }
      }
      return "0";
    }

    // 4b. pulseIn(pin, HIGH)
    const pulseMatch = trimmed.match(/^pulseIn\s*\(\s*([^,\s)]+)\s*,\s*(?:HIGH|1)(?:\s*,\s*\d+)?\s*\)$/);
    if (pulseMatch) {
      const pin = resolveCppPinNumber(pulseMatch[1], constants);
      if (pin !== null && context.nodes && context.edges) {
        return String(resolveEsp32PulseIn(pin, context.nodes, context.edges));
      }
      return "0";
    }

    // 5. millis() / micros()
    if (/^millis\s*\(\s*\)$/.test(trimmed)) {
      return String(context.timestamp ?? (context.tick ?? 0) * 100);
    }
    if (/^micros\s*\(\s*\)$/.test(trimmed)) {
      return String((context.timestamp ?? (context.tick ?? 0) * 100) * 1000);
    }

    // 6. Variables map lookup
    if (variables.has(trimmed)) {
      return String(variables.get(trimmed));
    }

    // 7. Constants map lookup
    if (constants.has(trimmed)) {
      return String(constants.get(trimmed));
    }

    // 8. Direct numeric literal
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }

    // 9. Arithmetic expression: e.g. duration * 0.034 / 2
    if (/[*/]/.test(trimmed) || (/[+-]/.test(trimmed) && !trimmed.includes('"') && !trimmed.includes("'"))) {
      const arithVal = evaluateCppArithmeticExpr(trimmed, variables, constants);
      if (arithVal !== null) {
        return String(arithVal);
      }
    }

    return trimmed;
  }

  // Handle ternary operator: cond ? trueVal : falseVal (e.g. ledState ? "LED ON" : "LED OFF")
  const ternaryMatch = expr.match(/^([\s\S]+?)\s*\?\s*([\s\S]+?)\s*:\s*([\s\S]+)$/);
  if (ternaryMatch) {
    const condStr = ternaryMatch[1].trim();
    const trueExpr = ternaryMatch[2].trim();
    const falseExpr = ternaryMatch[3].trim();

    let isTrue = false;
    if (variables.has(condStr)) {
      const v = variables.get(condStr);
      isTrue = Boolean(v && v !== "0" && v !== 0 && v !== "false" && v !== false && v !== "");
    } else if (constants.has(condStr)) {
      isTrue = Boolean(constants.get(condStr));
    } else {
      const evalCond = evalOperand(condStr);
      isTrue = Boolean(evalCond && evalCond !== "0" && evalCond !== "false" && evalCond !== "");
    }

    const chosen = isTrue ? trueExpr : falseExpr;
    const res = evalOperand(chosen);
    return formatSpec ? applyArduinoFormat(res, formatSpec) : res;
  }

  // Handle String concatenation: "Text " + String(val) + " more"
  if (expr.includes("+") && !expr.startsWith('"') && !expr.endsWith('"')) {
    const parts = expr.split("+");
    const evaluatedParts = parts.map((p) => evalOperand(p));
    const combined = evaluatedParts.join("");
    return formatSpec ? applyArduinoFormat(combined, formatSpec) : combined;
  }

  // If string literal contains '+' inside quotes, evalOperand will handle it directly
  if (expr.startsWith('"') && expr.endsWith('"') && !expr.slice(1, -1).includes('"')) {
    return evalOperand(expr);
  }

  // Split by '+' outside quotes if present
  if (expr.includes("+")) {
    const tokens: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '"' && (i === 0 || expr[i - 1] !== "\\")) {
        inQuotes = !inQuotes;
        cur += c;
      } else if (c === "+" && !inQuotes) {
        tokens.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    if (cur.trim()) tokens.push(cur.trim());

    if (tokens.length > 1) {
      const combined = tokens.map((t) => evalOperand(t)).join("");
      return formatSpec ? applyArduinoFormat(combined, formatSpec) : combined;
    }
  }

  const result = evalOperand(expr);
  return formatSpec ? applyArduinoFormat(result, formatSpec) : result;
}

/**
 * Extracts and tracks local and global variables in the C++ code block.
 */
function extractCppVariables(
  code: string,
  constants: Map<string, number>,
  context: Esp32CppSerialContext,
): Map<string, any> {
  const variables = new Map<string, any>(context.variables ?? []);

  // 1. digitalRead variables: int btn = digitalRead(BUTTON_PIN);
  const digitalReadRegex = /\b(?:(?:const\s+)?(?:int|bool|byte|auto)\s+)?([A-Za-z_]\w*)\s*=\s*digitalRead\s*\(\s*([^,\s)]+)\s*\)/g;
  let dMatch: RegExpExecArray | null;
  while ((dMatch = digitalReadRegex.exec(code)) !== null) {
    const varName = dMatch[1];
    const pin = resolveCppPinNumber(dMatch[2], constants);
    if (pin !== null && context.inputStates) {
      variables.set(varName, context.inputStates.get(pin) ? 1 : 0);
    } else {
      variables.set(varName, 0);
    }
  }

  // 2. analogRead variables: int potVal = analogRead(POT_PIN);
  const analogReadRegex = /\b(?:(?:const\s+)?(?:int|float|double|auto)\s+)?([A-Za-z_]\w*)\s*=\s*analogRead\s*\(\s*([^,\s)]+)\s*\)/g;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = analogReadRegex.exec(code)) !== null) {
    const varName = aMatch[1];
    const pin = resolveCppPinNumber(aMatch[2], constants);
    let val = 0;
    if (pin !== null) {
      if (context.adcValues && context.adcValues.has(pin)) {
        val = context.adcValues.get(pin)!;
      } else if (context.nodes && context.edges) {
        val = getAnalogValueForPicoPin(pin, context.nodes, context.edges, "10bit");
      }
    }
    variables.set(varName, val);
  }

  // 3. Generic map / math expressions: int brightness = map(potVal, 0, 1023, 0, 255);
  const mapRegex = /\b(?:(?:const\s+)?(?:int|float|double|auto)\s+)?([A-Za-z_]\w*)\s*=\s*map\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g;
  let mMatch: RegExpExecArray | null;
  while ((mMatch = mapRegex.exec(code)) !== null) {
    const varName = mMatch[1];
    const srcExpr = mMatch[2].trim();
    const inMin = Number(mMatch[3].trim());
    const inMax = Number(mMatch[4].trim());
    const outMin = Number(mMatch[5].trim());
    const outMax = Number(mMatch[6].trim());

    let srcVal = 0;
    if (variables.has(srcExpr)) {
      srcVal = Number(variables.get(srcExpr));
    } else if (constants.has(srcExpr)) {
      srcVal = Number(constants.get(srcExpr));
    } else if (/^\d+$/.test(srcExpr)) {
      srcVal = Number(srcExpr);
    } else if (srcExpr.startsWith("analogRead")) {
      const pMatch = srcExpr.match(/analogRead\s*\(\s*([^,\s)]+)\s*\)/);
      if (pMatch) {
        const pin = resolveCppPinNumber(pMatch[1], constants);
        if (pin !== null) {
          srcVal = context.adcValues?.get(pin) ?? (context.nodes && context.edges ? getAnalogValueForPicoPin(pin, context.nodes, context.edges, inMax > 1024 ? "12bit" : "10bit") : 0);
        }
      }
    }

    if (inMax !== inMin) {
      const mapped = Math.round(outMin + ((srcVal - inMin) * (outMax - outMin)) / (inMax - inMin));
      variables.set(varName, mapped);
    }
  }

  // 4. Division / arithmetic: int brightness = potVal / 4;
  const divRegex = /\b(?:(?:const\s+)?(?:int|float|double|auto)\s+)?([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*\/\s*(\d+)\s*;/g;
  let divMatch: RegExpExecArray | null;
  while ((divMatch = divRegex.exec(code)) !== null) {
    const varName = divMatch[1];
    const srcVar = divMatch[2];
    const div = Number(divMatch[3]) || 1;
    if (variables.has(srcVar)) {
      variables.set(varName, Math.round(Number(variables.get(srcVar)) / div));
    }
  }

  // 5. String variable declarations: String msg = "Status OK";
  const stringVarRegex = /\bString\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/g;
  let strMatch: RegExpExecArray | null;
  while ((strMatch = stringVarRegex.exec(code)) !== null) {
    const varName = strMatch[1];
    const expr = strMatch[2].trim();
    variables.set(varName, evaluateSerialArgument(expr, constants, variables, context));
  }

  // 6. Direct numeric variable assignments: int x = 42;
  const numVarRegex = /\b(?:int|float|double|byte)\s+([A-Za-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g;
  let numMatch: RegExpExecArray | null;
  while ((numMatch = numVarRegex.exec(code)) !== null) {
    const varName = numMatch[1];
    const numVal = Number(numMatch[2]);
    if (!variables.has(varName)) {
      variables.set(varName, numVal);
    }
  }

  // 7. Keypad getKey: char key = keypad.getKey();
  const kpRegex = /\b(?:(?:const\s+)?(?:char|auto)\s+)?([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\.getKey\s*\(\s*\)/g;
  let kpMatch: RegExpExecArray | null;
  while ((kpMatch = kpRegex.exec(code)) !== null) {
    const varName = kpMatch[1];
    const kpRes = evaluateEsp32CppKeypad(code, {
      tick: context.tick,
      timestamp: context.timestamp,
      nodes: context.nodes,
      edges: context.edges,
    });
    variables.set(varName, kpRes.pressedKey ?? "");
  }

  // 8. Ultrasonic pulseIn & distance variables
  if (context.nodes && context.edges) {
    const ultraVars = extractCppUltrasonicVariables(code, constants, {
      nodes: context.nodes,
      edges: context.edges,
    });
    for (const [k, v] of ultraVars.entries()) {
      if (!variables.has(k)) {
        variables.set(k, v);
      }
    }
  }

  // 9. IR Receiver variables
  extractCppIrReceiverVariables(code, {
    nodes: context.nodes,
    edges: context.edges,
    tick: context.tick,
  }, variables);

  return variables;
}

/**
 * Evaluates Serial.print / Serial.println statements within a code block.
 */
function evaluateSerialStatementsInBlock(
  block: string,
  constants: Map<string, number>,
  variables: Map<string, any>,
  context: Esp32CppSerialContext,
  pendingOutput: { buffer: string; newLines: string[] },
) {
  // Regex to match Serial.print(...) or Serial.println(...) or Serial.println()
  const serialRegex = /Serial\.(print|println)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = serialRegex.exec(block)) !== null) {
    const method = match[1]; // "print" or "println"
    const callStartIndex = match.index;
    const parenInfo = extractParenArgs(block, callStartIndex);

    if (!parenInfo) continue;

    const argsStr = parenInfo.argsStr;
    const isPrintln = method === "println";

    let outputText = "";
    if (argsStr.length > 0) {
      outputText = evaluateSerialArgument(argsStr, constants, variables, context);
    }

    // Append to pending buffer
    pendingOutput.buffer += outputText;
    if (isPrintln) {
      pendingOutput.buffer += "\n";
    }

    // Process all completed lines in buffer
    while (pendingOutput.buffer.includes("\n")) {
      const newlineIdx = pendingOutput.buffer.indexOf("\n");
      const line = pendingOutput.buffer.slice(0, newlineIdx);
      pendingOutput.newLines.push(line);
      pendingOutput.buffer = pendingOutput.buffer.slice(newlineIdx + 1);
    }
  }
}

/**
 * Evaluates conditional blocks containing Serial prints based on live input states.
 */
function evaluateConditionalsAndSerial(
  code: string,
  constants: Map<string, number>,
  variables: Map<string, any>,
  context: Esp32CppSerialContext,
  pendingOutput: { buffer: string; newLines: string[] },
) {
  const ifRegex = /\bif\s*\(/g;
  let ifMatch: RegExpExecArray | null;
  let lastIndex = 0;

  while ((ifMatch = ifRegex.exec(code)) !== null) {
    const ifStart = ifMatch.index;
    const parenInfo = extractParenArgs(code, ifStart);
    if (!parenInfo) continue;

    const condExpr = parenInfo.argsStr;
    const afterIf = parenInfo.afterIndex;

    const thenBlockInfo = extractBlock(code, afterIf);
    let elseBlock = "";
    let fullEndIndex = thenBlockInfo.endIndex;

    const afterThen = code.slice(thenBlockInfo.endIndex).trimStart();
    if (afterThen.startsWith("else")) {
      const elseStart = code.indexOf("else", thenBlockInfo.endIndex);
      const elseBlockInfo = extractBlock(code, elseStart + 4);
      elseBlock = elseBlockInfo.block;
      fullEndIndex = elseBlockInfo.endIndex;
    }

    // Evaluate code preceding this if statement
    const priorCode = code.slice(lastIndex, ifStart);
    evaluateSerialStatementsInBlock(priorCode, constants, variables, context, pendingOutput);

    // Evaluate condition
    let condResult = false;

    // Check digitalRead condition: e.g. digitalRead(btn) == LOW or digitalRead(btn) == 0
    const dReadCond = condExpr.match(/digitalRead\s*\(\s*([^,\s)]+)\s*\)\s*(==|!=)\s*(HIGH|LOW|1|0)/i);
    if (dReadCond) {
      const pin = resolveCppPinNumber(dReadCond[1], constants);
      const op = dReadCond[2];
      const targetState = dReadCond[3].toUpperCase() === "HIGH" || dReadCond[3] === "1";
      const actualState = pin !== null && context.inputStates ? !!context.inputStates.get(pin) : false;
      condResult = op === "==" ? actualState === targetState : actualState !== targetState;
    } else {
      // Check variable condition: e.g. btnState == LOW
      const varCond = condExpr.match(/([A-Za-z_]\w*)\s*(==|!=)\s*(HIGH|LOW|1|0)/i);
      if (varCond) {
        const varName = varCond[1];
        const op = varCond[2];
        const targetState = varCond[3].toUpperCase() === "HIGH" || varCond[3] === "1";
        const actualVal = variables.has(varName) ? Boolean(variables.get(varName)) : false;
        condResult = op === "==" ? actualVal === targetState : actualVal !== targetState;
      } else {
        // Numeric comparison: e.g. potVal > 500
        const compMatch = condExpr.match(/([A-Za-z_]\w*)\s*(>|<|>=|<=|==|!=)\s*(\d+)/);
        if (compMatch) {
          const varName = compMatch[1];
          const op = compMatch[2];
          const targetNum = Number(compMatch[3]);
          const actualNum = variables.has(varName) ? Number(variables.get(varName)) : 0;
          switch (op) {
            case ">": condResult = actualNum > targetNum; break;
            case "<": condResult = actualNum < targetNum; break;
            case ">=": condResult = actualNum >= targetNum; break;
            case "<=": condResult = actualNum <= targetNum; break;
            case "==": condResult = actualNum === targetNum; break;
            case "!=": condResult = actualNum !== targetNum; break;
          }
        } else {
          // Check char/string comparison: e.g. key == '1' or key != NO_KEY
          const charCond = condExpr.match(/([A-Za-z_]\w*)\s*(==|!=)\s*(?:'([^']*)'|"([^"]*)"|NO_KEY)/i);
          if (charCond) {
            const varName = charCond[1];
            const op = charCond[2];
            const targetStr = charCond[4] ?? charCond[3] ?? "";
            const actualStr = variables.has(varName) ? String(variables.get(varName)) : "";
            condResult = op === "==" ? actualStr === targetStr : actualStr !== targetStr;
          } else {
            // Check IR Receiver decode: if (IrReceiver.decode()) or if (irrecv.decode(...))
            if (/\b(?:IrReceiver|irrecv)\s*\.\s*decode\s*\(/i.test(condExpr)) {
              condResult = Boolean(variables.get("__ir_decoded"));
            } else if (/\b(?:IrReceiver\s*\.\s*decodedIRData\s*\.\s*command|results\s*\.\s*value)\s*(==|!=)\s*(0x[0-9a-fA-F]+|\d+)/i.test(condExpr)) {
              const irCmdMatch = condExpr.match(/\b(?:IrReceiver\s*\.\s*decodedIRData\s*\.\s*command|results\s*\.\s*value)\s*(==|!=)\s*(0x[0-9a-fA-F]+|\d+)/i)!;
              const op = irCmdMatch[1];
              const targetVal = irCmdMatch[2].startsWith("0x") || irCmdMatch[2].startsWith("0X")
                ? parseInt(irCmdMatch[2], 16)
                : parseInt(irCmdMatch[2], 10);
              const actualCmd = Number(variables.get("IrReceiver.decodedIRData.command") ?? variables.get("__ir_command") ?? 0);
              const hasDecoded = Boolean(variables.get("__ir_decoded"));
              condResult = op === "==" ? (hasDecoded && actualCmd === targetVal) : (!hasDecoded || actualCmd !== targetVal);
            } else {
              // Truthy/falsy variable: if (customKey) or if (!customKey)
              const truthyMatch = condExpr.match(/^(!?)\s*([A-Za-z_]\w*)$/);
              if (truthyMatch) {
                const inverted = truthyMatch[1] === "!";
                const varName = truthyMatch[2];
                const val = variables.get(varName);
                const isTruthy = Boolean(val && val !== "0" && val !== 0 && val !== "");
                condResult = inverted ? !isTruthy : isTruthy;
              } else {
              // Generic arithmetic comparison fallback: if (expr1 > expr2)
              const relMatch = condExpr.match(/^([\s\S]+?)\s*(>=|<=|==|!=|>|<)\s*([\s\S]+)$/);
              if (relMatch) {
                const leftVal = evaluateCppArithmeticExpr(relMatch[1].trim(), variables, constants);
                const rightVal = evaluateCppArithmeticExpr(relMatch[3].trim(), variables, constants);
                if (leftVal !== null && rightVal !== null) {
                  const op = relMatch[2];
                  if (op === ">") condResult = leftVal > rightVal;
                  else if (op === "<") condResult = leftVal < rightVal;
                  else if (op === ">=") condResult = leftVal >= rightVal;
                  else if (op === "<=") condResult = leftVal <= rightVal;
                  else if (op === "==") condResult = leftVal === rightVal;
                  else if (op === "!=") condResult = leftVal !== rightVal;
              }
            }
          }
        }
      }
    }
  }
}

    if (condResult) {
      evaluateSerialStatementsInBlock(thenBlockInfo.block, constants, variables, context, pendingOutput);
    } else if (elseBlock) {
      evaluateSerialStatementsInBlock(elseBlock, constants, variables, context, pendingOutput);
    }

    lastIndex = fullEndIndex;
    ifRegex.lastIndex = fullEndIndex;
  }

  // Evaluate remaining code after last if block
  const remainder = code.slice(lastIndex);
  evaluateSerialStatementsInBlock(remainder, constants, variables, context, pendingOutput);
}

/**
 * Evaluates ESP32 C++ Serial communication output for the current simulation frame.
 *
 * @param code ESP32 Arduino C++ source code.
 * @param context Live simulation frame context (inputs, ADC, timestamp, tick).
 * @returns Result object with newLines, allLines, and pendingBuffer.
 */
export function evaluateEsp32CppSerial(
  code: string,
  context: Esp32CppSerialContext = {},
): Esp32CppSerialResult {
  if (!code || typeof code !== "string") {
    return { newLines: [], allLines: [], pendingBuffer: "" };
  }

  const tick = context.tick ?? 0;
  const codeKey = code.slice(0, 100);

  // Initialize or retrieve persistent session state
  let session = sessionStates.get(codeKey);
  if (!session || tick === 0) {
    session = {
      rawSerialLines: [],
      pendingBuffer: "",
      lastTick: tick,
      setupExecuted: false,
    };
    sessionStates.set(codeKey, session);
  }

  const cleaned = stripCppIncludes(stripCppComments(code));
  const constants = parseCppConstants(code);
  const variables = extractCppVariables(cleaned, constants, context);

  const pendingOutput = {
    buffer: session.pendingBuffer,
    newLines: [] as string[],
  };

  // Run setup() Serial prints on tick 0 or first execution
  if (!session.setupExecuted || tick === 0) {
    const setupBody = extractCppFunctionBody(cleaned, "setup");
    if (setupBody) {
      evaluateConditionalsAndSerial(setupBody, constants, variables, context, pendingOutput);
    }
    session.setupExecuted = true;
  }

  // Run loop() Serial prints
  const loopBody = extractCppFunctionBody(cleaned, "loop") ?? cleaned;
  evaluateConditionalsAndSerial(loopBody, constants, variables, context, pendingOutput);

  // Update session state
  session.pendingBuffer = pendingOutput.buffer;
  session.lastTick = tick;

  if (pendingOutput.newLines.length > 0) {
    session.rawSerialLines.push(...pendingOutput.newLines);
    if (session.rawSerialLines.length > 100) {
      session.rawSerialLines = session.rawSerialLines.slice(-100);
    }
  }

  return {
    newLines: pendingOutput.newLines,
    allLines: [...session.rawSerialLines],
    pendingBuffer: session.pendingBuffer,
  };
}
