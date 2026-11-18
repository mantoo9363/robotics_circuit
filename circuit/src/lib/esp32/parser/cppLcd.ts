/**
 * ESP32 C++ (Arduino-style) I2C 16x2 LCD Parser
 *
 * Implements Phase 4:
 *   - LiquidCrystal_I2C lcd(addr, cols, rows) constructor parsing
 *   - Wire.begin(sda, scl) and default Wire.begin() (SDA=21, SCL=22)
 *   - lcd.init(), lcd.begin(), lcd.backlight(), lcd.noBacklight()
 *   - lcd.clear(), lcd.setCursor(col, row)
 *   - lcd.print(expr) / lcd.write(char) with variable resolution & String concatenation
 *   - Conditionals (if/else) evaluation with live circuit inputs
 *   - Produces LcdState matching the shared canvas component telemetry contract
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
import type { LcdState } from "../../codeParsing/picoParser";
import type { CircuitNode, CircuitEdge } from "../../types";

export interface Esp32CppLcdContext {
  tick?: number;
  timestamp?: number;
  inputStates?: Map<number, boolean>;
  adcValues?: Map<number, number>;
  nodes?: CircuitNode[];
  edges?: CircuitEdge[];
}

export function createDefaultEsp32CppLcdState(
  sdaPin = 21,
  sclPin = 22,
): LcdState {
  const ddram = new Uint8Array(80);
  ddram.fill(32); // Space character (ASCII 32)
  return {
    ddram,
    cursor: 0,
    backlight: true,
    displayEnabled: true,
    cursorEnabled: false,
    lastNibble: null,
    lastRs: null,
    lastEn: 0,
    declaredSdaPin: sdaPin,
    declaredSclPin: sclPin,
  };
}

/** Extracts parenthesized arguments from a call like lcd.print(...) or lcd.setCursor(...). */
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
 * Evaluates an argument expression for lcd.print(...).
 */
function evaluateLcdArgument(
  rawArg: string,
  constants: Map<string, number>,
  variables: Map<string, any>,
  context: Esp32CppLcdContext,
): string {
  let expr = rawArg.trim();
  if (!expr) return "";

  function evalOperand(op: string): string {
    const trimmed = op.trim();
    if (!trimmed) return "";

    // 1. Quoted string literal: "Hello" or 'A'
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

    // 5. Variables map lookup
    if (variables.has(trimmed)) {
      return String(variables.get(trimmed));
    }

    // 6. Constants map lookup
    if (constants.has(trimmed)) {
      return String(constants.get(trimmed));
    }

    // 7. Direct numeric literal
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }

    // 8. Arithmetic expression: e.g. duration * 0.034 / 2
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
    return evalOperand(chosen);
  }

  // Handle String concatenation: "Text " + String(val)
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
      return tokens.map((t) => evalOperand(t)).join("");
    }
  }

  return evalOperand(expr);
}

/**
 * Extracts declared I2C SDA and SCL pins from Wire.begin(sda, scl) or defaults to (21, 22).
 */
function extractDeclaredI2cPins(
  code: string,
  constants: Map<string, number>,
): { sdaPin: number; sclPin: number } {
  let sdaPin = 21; // Default ESP32 SDA
  let sclPin = 22; // Default ESP32 SCL

  const wireBeginMatch = code.match(/Wire\.begin\s*\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*\)/);
  if (wireBeginMatch) {
    const resolvedSda = resolveCppPinNumber(wireBeginMatch[1], constants);
    const resolvedScl = resolveCppPinNumber(wireBeginMatch[2], constants);
    if (resolvedSda !== null) sdaPin = resolvedSda;
    if (resolvedScl !== null) sclPin = resolvedScl;
  }

  return { sdaPin, sclPin };
}

/**
 * Tracks local and global variables for LCD printing expressions.
 */
function extractLcdVariables(
  code: string,
  constants: Map<string, number>,
  context: Esp32CppLcdContext,
): Map<string, any> {
  const variables = new Map<string, any>();

  // digitalRead variables
  const dReadRegex = /\b(?:(?:const\s+)?(?:int|bool|byte|auto)\s+)?([A-Za-z_]\w*)\s*=\s*digitalRead\s*\(\s*([^,\s)]+)\s*\)/g;
  let dMatch: RegExpExecArray | null;
  while ((dMatch = dReadRegex.exec(code)) !== null) {
    const varName = dMatch[1];
    const pin = resolveCppPinNumber(dMatch[2], constants);
    variables.set(varName, pin !== null && context.inputStates?.get(pin) ? 1 : 0);
  }

  // analogRead variables
  const aReadRegex = /\b(?:(?:const\s+)?(?:int|float|double|auto)\s+)?([A-Za-z_]\w*)\s*=\s*analogRead\s*\(\s*([^,\s)]+)\s*\)/g;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = aReadRegex.exec(code)) !== null) {
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

  // map(...) expressions
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
    }

    if (inMax !== inMin) {
      variables.set(varName, Math.round(outMin + ((srcVal - inMin) * (outMax - outMin)) / (inMax - inMin)));
    }
  }

  // String variables
  const strRegex = /\bString\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/g;
  let sMatch: RegExpExecArray | null;
  while ((sMatch = strRegex.exec(code)) !== null) {
    const varName = sMatch[1];
    variables.set(varName, evaluateLcdArgument(sMatch[2].trim(), constants, variables, context));
  }

  // Numeric literals
  const numRegex = /\b(?:int|float|double|byte)\s+([A-Za-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/g;
  let nMatch: RegExpExecArray | null;
  while ((nMatch = numRegex.exec(code)) !== null) {
    const varName = nMatch[1];
    if (!variables.has(varName)) {
      variables.set(varName, Number(nMatch[2]));
    }
  }

  // Keypad getKey: char key = keypad.getKey();
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

  // Ultrasonic pulseIn & distance variables
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

  // IR Receiver variables
  extractCppIrReceiverVariables(code, {
    nodes: context.nodes,
    edges: context.edges,
    tick: context.tick,
  }, variables);

  return variables;
}

/**
 * Writes a string to the LCD DDRAM starting at the current cursor position.
 */
function writeToLcdDdram(lcd: LcdState, text: string) {
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Determine row bounds: row 0 (0..15), row 1 (64..79)
    if (lcd.cursor >= 0 && lcd.cursor < 16) {
      lcd.ddram[lcd.cursor] = charCode;
      lcd.cursor++;
    } else if (lcd.cursor >= 64 && lcd.cursor < 80) {
      lcd.ddram[lcd.cursor] = charCode;
      lcd.cursor++;
    } else {
      // Out of standard 16x2 range, advance cursor safely
      if (lcd.cursor < 80) lcd.cursor++;
    }
  }
}

/**
 * Evaluates LCD statements in a block of code (print, setCursor, clear, backlight).
 */
function evaluateLcdStatementsInBlock(
  block: string,
  lcdObjName: string,
  lcd: LcdState,
  constants: Map<string, number>,
  variables: Map<string, any>,
  context: Esp32CppLcdContext,
) {
  // Regex to match lcd.<method>(...)
  const methodRegex = new RegExp(`\\b${lcdObjName}\\.(init|begin|clear|backlight|noBacklight|setCursor|print|write)\\s*\\(`, "g");
  let match: RegExpExecArray | null;

  while ((match = methodRegex.exec(block)) !== null) {
    const method = match[1];
    const callStart = match.index;
    const parenInfo = extractParenArgs(block, callStart);
    const argsStr = parenInfo ? parenInfo.argsStr : "";

    switch (method) {
      case "init":
      case "begin":
        lcd.displayEnabled = true;
        lcd.backlight = true;
        break;

      case "backlight":
        lcd.backlight = true;
        break;

      case "noBacklight":
        lcd.backlight = false;
        break;

      case "clear":
        lcd.ddram.fill(32);
        lcd.cursor = 0;
        break;

      case "setCursor": {
        const parts = argsStr.split(",").map((p) => p.trim());
        const col = parts[0] ? (variables.get(parts[0]) ?? constants.get(parts[0]) ?? Number(parts[0])) || 0 : 0;
        const row = parts[1] ? (variables.get(parts[1]) ?? constants.get(parts[1]) ?? Number(parts[1])) || 0 : 0;
        const clampedCol = Math.max(0, Math.min(15, Number(col)));
        const clampedRow = Math.max(0, Math.min(1, Number(row)));
        lcd.cursor = clampedRow === 0 ? clampedCol : 64 + clampedCol;
        break;
      }

      case "print":
      case "write": {
        const text = evaluateLcdArgument(argsStr, constants, variables, context);
        writeToLcdDdram(lcd, text);
        break;
      }
    }
  }
}

/**
 * Evaluates conditional blocks containing LCD writes based on live input states.
 */
function evaluateConditionalsAndLcd(
  code: string,
  lcdObjName: string,
  lcd: LcdState,
  constants: Map<string, number>,
  variables: Map<string, any>,
  context: Esp32CppLcdContext,
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
    evaluateLcdStatementsInBlock(priorCode, lcdObjName, lcd, constants, variables, context);

    // Evaluate condition
    let condResult = false;
    const dReadCond = condExpr.match(/digitalRead\s*\(\s*([^,\s)]+)\s*\)\s*(==|!=)\s*(HIGH|LOW|1|0)/i);
    if (dReadCond) {
      const pin = resolveCppPinNumber(dReadCond[1], constants);
      const op = dReadCond[2];
      const targetState = dReadCond[3].toUpperCase() === "HIGH" || dReadCond[3] === "1";
      const actualState = pin !== null && context.inputStates ? !!context.inputStates.get(pin) : false;
      condResult = op === "==" ? actualState === targetState : actualState !== targetState;
    } else {
      const varCond = condExpr.match(/([A-Za-z_]\w*)\s*(==|!=)\s*(HIGH|LOW|1|0)/i);
      if (varCond) {
        const varName = varCond[1];
        const op = varCond[2];
        const targetState = varCond[3].toUpperCase() === "HIGH" || varCond[3] === "1";
        const actualVal = variables.has(varName) ? Boolean(variables.get(varName)) : false;
        condResult = op === "==" ? actualVal === targetState : actualVal !== targetState;
      } else {
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
      evaluateLcdStatementsInBlock(thenBlockInfo.block, lcdObjName, lcd, constants, variables, context);
    } else if (elseBlock) {
      evaluateLcdStatementsInBlock(elseBlock, lcdObjName, lcd, constants, variables, context);
    }

    lastIndex = fullEndIndex;
    ifRegex.lastIndex = fullEndIndex;
  }

  // Evaluate remaining code
  const remainder = code.slice(lastIndex);
  evaluateLcdStatementsInBlock(remainder, lcdObjName, lcd, constants, variables, context);
}

/**
 * Parses and evaluates ESP32 C++ I2C LCD state.
 *
 * @param code ESP32 Arduino C++ source code.
 * @param context Live simulation frame context.
 * @returns Map of I2C address -> LcdState.
 */
export function evaluateEsp32CppLcd(
  code: string,
  context: Esp32CppLcdContext = {},
): Map<number, LcdState> {
  const lcdStates = new Map<number, LcdState>();
  if (!code || typeof code !== "string") return lcdStates;

  const cleaned = stripCppIncludes(stripCppComments(code));
  const constants = parseCppConstants(code);
  const { sdaPin, sclPin } = extractDeclaredI2cPins(code, constants);

  // Match LiquidCrystal_I2C object declaration: LiquidCrystal_I2C lcd(0x27, 16, 2);
  const ctorRegex = /\b(?:LiquidCrystal_I2C|hd44780_I2Cexp|Adafruit_LiquidCrystal)\s+([A-Za-z_]\w*)\s*\(\s*([^,\s)]+)/g;
  let ctorMatch: RegExpExecArray | null;

  while ((ctorMatch = ctorRegex.exec(code)) !== null) {
    const objName = ctorMatch[1];
    const addrToken = ctorMatch[2].trim();

    let addr = 0x27; // Default I2C address
    if (addrToken.toLowerCase().startsWith("0x")) {
      addr = parseInt(addrToken, 16);
    } else if (/^\d+$/.test(addrToken)) {
      addr = parseInt(addrToken, 10);
    } else if (constants.has(addrToken)) {
      addr = constants.get(addrToken)!;
    }

    const lcdState = createDefaultEsp32CppLcdState(sdaPin, sclPin);
    const variables = extractLcdVariables(cleaned, constants, context);

    // Evaluate setup()
    const setupBody = extractCppFunctionBody(cleaned, "setup");
    if (setupBody) {
      evaluateConditionalsAndLcd(setupBody, objName, lcdState, constants, variables, context);
    }

    // Evaluate loop()
    const loopBody = extractCppFunctionBody(cleaned, "loop") ?? cleaned;
    evaluateConditionalsAndLcd(loopBody, objName, lcdState, constants, variables, context);

    lcdStates.set(addr, lcdState);
  }

  return lcdStates;
}
