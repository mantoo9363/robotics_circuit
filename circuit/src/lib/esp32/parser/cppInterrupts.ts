/**
 * ESP32 C++ (Arduino-style) Hardware Interrupts Parser & Runtime Engine
 *
 * Implements Phase 5:
 *   - attachInterrupt(digitalPinToInterrupt(pin), isrFunc, mode) and attachInterrupt(pin, isrFunc, mode)
 *   - detachInterrupt(digitalPinToInterrupt(pin)) and detachInterrupt(pin)
 *   - Trigger modes: RISING, FALLING, CHANGE
 *   - Zero-argument ISR execution (void myISR() { ... })
 *   - Global variable mutation and state persistence
 *   - Direct GPIO actions and Serial writes inside ISRs
 *   - Boot-time false-trigger protection (initializes lastValue from active pin state)
 *   - Clean multi-tick edge-triggered latching (press -> release -> press)
 */

import {
  stripCppComments,
  stripCppIncludes,
  parseCppConstants,
  extractCppFunctionBody,
  resolveCppPinNumber,
  isEsp32ReservedFlashPin,
  isEsp32InputOnlyPin,
  type Esp32GpioAction,
} from "./cppPatterns";
import type { CircuitNode, CircuitEdge } from "../../types";

export interface CppInterruptConfig {
  pin: number;
  handlerName: string;
  mode: "RISING" | "FALLING" | "CHANGE";
  lastValue: boolean;
}

export interface CppInterruptSession {
  registeredInterrupts: Map<number, CppInterruptConfig>;
  variables: Map<string, any>;
  lastTick: number;
  isrSerialLines: string[];
}

const cppInterruptSessions = new Map<string, CppInterruptSession>();

/**
 * Resets all C++ interrupt simulation sessions.
 */
export function resetEsp32CppInterruptSessions() {
  cppInterruptSessions.clear();
}

export interface Esp32CppInterruptContext {
  tick?: number;
  timestamp?: number;
  inputStates?: Map<number, boolean>;
  nodes?: CircuitNode[];
  edges?: CircuitEdge[];
}

export interface Esp32CppInterruptResult {
  triggeredPins: number[];
  actions: Esp32GpioAction[];
  serialLines: string[];
  variables: Map<string, any>;
}

/** Resolves trigger mode from string token. */
function resolveTriggerMode(token: string): "RISING" | "FALLING" | "CHANGE" | null {
  const upper = token.trim().toUpperCase();
  if (upper === "RISING" || upper === "1") return "RISING";
  if (upper === "FALLING" || upper === "2") return "FALLING";
  if (upper === "CHANGE" || upper === "3" || upper === "BOTH") return "CHANGE";
  return null;
}

/** Extracts parenthesized arguments from a call like attachInterrupt(...). */
function extractCallArgs(
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

/**
 * Parses attachInterrupt and detachInterrupt statements from C++ code.
 */
function parseInterruptRegistrations(
  code: string,
  constants: Map<string, number>,
  inputStates?: Map<number, boolean>,
): Map<number, CppInterruptConfig> {
  const interrupts = new Map<number, CppInterruptConfig>();
  const cleaned = stripCppIncludes(stripCppComments(code));

  // Regex to match attachInterrupt(...)
  const attachRegex = /\battachInterrupt\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = attachRegex.exec(cleaned)) !== null) {
    const parenInfo = extractCallArgs(cleaned, match.index);
    if (!parenInfo) continue;

    const parts = parenInfo.argsStr.split(",").map((p) => p.trim());
    if (parts.length < 3) continue;

    // Part 0: pin or digitalPinToInterrupt(pin)
    let pinToken = parts[0];
    const dPinMatch = pinToken.match(/^digitalPinToInterrupt\s*\(\s*([^,\s)]+)\s*\)$/);
    if (dPinMatch) {
      pinToken = dPinMatch[1];
    }
    const pin = resolveCppPinNumber(pinToken, constants);
    if (pin === null) continue;

    // Part 1: ISR function name
    const handlerName = parts[1].trim();
    if (!handlerName) continue;

    // Part 2: Mode (RISING, FALLING, CHANGE)
    const mode = resolveTriggerMode(parts[2]);
    if (!mode) continue;

    // Initialize lastValue from live pin state to avoid boot-time false triggers
    const initialVal = inputStates?.has(pin) ? Boolean(inputStates.get(pin)) : false;

    interrupts.set(pin, {
      pin,
      handlerName,
      mode,
      lastValue: initialVal,
    });
  }

  // Regex to match detachInterrupt(...)
  const detachRegex = /\bdetachInterrupt\s*\(/g;
  while ((match = detachRegex.exec(cleaned)) !== null) {
    const parenInfo = extractCallArgs(cleaned, match.index);
    if (!parenInfo) continue;

    let pinToken = parenInfo.argsStr.trim();
    const dPinMatch = pinToken.match(/^digitalPinToInterrupt\s*\(\s*([^,\s)]+)\s*\)$/);
    if (dPinMatch) {
      pinToken = dPinMatch[1];
    }
    const pin = resolveCppPinNumber(pinToken, constants);
    if (pin !== null) {
      interrupts.delete(pin);
    }
  }

  return interrupts;
}

/**
 * Initializes global variables from declarations in sketch.
 */
function extractInitialVariables(code: string, constants: Map<string, number>): Map<string, any> {
  const vars = new Map<string, any>();
  const cleaned = stripCppIncludes(stripCppComments(code));

  // Match: volatile bool pressed = false; or int counter = 0;
  const varRegex = /\b(?:volatile\s+)?(?:const\s+)?(bool|int|byte|uint8_t|float|double|String)\s+([A-Za-z_]\w*)\s*(?:=\s*([^;]+))?\s*;/g;
  let match: RegExpExecArray | null;

  while ((match = varRegex.exec(cleaned)) !== null) {
    const type = match[1];
    const name = match[2];
    const valExpr = match[3] ? match[3].trim() : "";

    if (!valExpr) {
      vars.set(name, type === "bool" ? false : type === "String" ? "" : 0);
      continue;
    }

    if (type === "bool") {
      vars.set(name, valExpr === "true" || valExpr === "HIGH" || valExpr === "1");
    } else if (type === "String") {
      vars.set(name, valExpr.replace(/^["']|["']$/g, ""));
    } else if (constants.has(valExpr)) {
      vars.set(name, constants.get(valExpr)!);
    } else if (/^-?\d+(?:\.\d+)?$/.test(valExpr)) {
      vars.set(name, Number(valExpr));
    } else {
      vars.set(name, 0);
    }
  }

  return vars;
}

/**
 * Executes an ISR body and updates session variables, direct writes, and serial logs.
 */
function executeIsrBody(
  isrBody: string,
  constants: Map<string, number>,
  variables: Map<string, any>,
  actions: Esp32GpioAction[],
  serialLines: string[],
  timestamp: number = 0,
) {
  function evalExpression(expr: string): number {
    const trimmed = expr.trim();
    if (trimmed === "millis()" || trimmed === "millis ( )") return timestamp;
    if (variables.has(trimmed)) return Number(variables.get(trimmed));
    if (constants.has(trimmed)) return Number(constants.get(trimmed));
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);

    // Binary arithmetic: a - b, a + b
    const binMatch = trimmed.match(/^([\s\S]+?)\s*([+\-*/])\s*([\s\S]+)$/);
    if (binMatch) {
      const left = evalExpression(binMatch[1]);
      const op = binMatch[2];
      const right = evalExpression(binMatch[3]);
      if (op === "+") return left + right;
      if (op === "-") return left - right;
      if (op === "*") return left * right;
      if (op === "/" && right !== 0) return left / right;
    }
    return 0;
  }

  function executeBlock(blockText: string) {
    const stmts = blockText.split(";").map((s) => s.trim()).filter(Boolean);
    for (const rawStmt of stmts) {
      // Strip type declaration: e.g. unsigned long now = ... -> now = ...
      const stmt = rawStmt.replace(/^(?:(?:unsigned\s+)?(?:long|int|bool|char|byte|uint8_t|uint16_t|uint32_t|auto)\s+)/, "");

      // Increment: count++ or ++count
      const incMatch = stmt.match(/^([A-Za-z_]\w*)\s*\+\+$/) || stmt.match(/^\+\+\s*([A-Za-z_]\w*)$/);
      if (incMatch) {
        const vName = incMatch[1];
        const cur = variables.get(vName) ?? 0;
        variables.set(vName, Number(cur) + 1);
        continue;
      }

      // Decrement: count-- or --count
      const decMatch = stmt.match(/^([A-Za-z_]\w*)\s*--$/) || stmt.match(/^--\s*([A-Za-z_]\w*)$/);
      if (decMatch) {
        const vName = decMatch[1];
        const cur = variables.get(vName) ?? 0;
        variables.set(vName, Number(cur) - 1);
        continue;
      }

      // Direct assignment: var = expr
      const assignMatch = stmt.match(/^([A-Za-z_]\w*)\s*=\s*([^;]+)$/);
      if (assignMatch) {
        const vName = assignMatch[1];
        const expr = assignMatch[2].trim();

        if (expr === "millis()" || expr === "millis ( )") {
          variables.set(vName, timestamp);
          continue;
        }

        // Boolean negation: !var
        if (expr.startsWith("!")) {
          const targetVar = expr.slice(1).trim();
          const curVal = variables.has(targetVar) ? Boolean(variables.get(targetVar)) : false;
          variables.set(vName, !curVal);
          continue;
        }

        // Boolean literals
        if (expr === "true" || expr === "HIGH" || expr === "1") {
          variables.set(vName, true);
          continue;
        }
        if (expr === "false" || expr === "LOW" || expr === "0") {
          variables.set(vName, false);
          continue;
        }

        // Arithmetic operations: var + 1, var - 1, etc.
        const binOpMatch = expr.match(/^([\s\S]+?)\s*([+\-*/])\s*([\s\S]+)$/);
        if (binOpMatch && (binOpMatch[1].includes("millis") || binOpMatch[2] === "-" || binOpMatch[2] === "+")) {
          const leftVal = evalExpression(binOpMatch[1]);
          const op = binOpMatch[2];
          const rightVal = evalExpression(binOpMatch[3]);
          let res = 0;
          if (op === "+") res = leftVal + rightVal;
          else if (op === "-") res = leftVal - rightVal;
          else if (op === "*") res = leftVal * rightVal;
          else if (op === "/" && rightVal !== 0) res = leftVal / rightVal;
          variables.set(vName, res);
          continue;
        }

        // Variable or constant
        if (variables.has(expr)) {
          variables.set(vName, variables.get(expr));
        } else if (constants.has(expr)) {
          variables.set(vName, constants.get(expr)!);
        } else if (/^-?\d+(?:\.\d+)?$/.test(expr)) {
          variables.set(vName, Number(expr));
        } else {
          variables.set(vName, expr.replace(/^["']|["']$/g, ""));
        }
        continue;
      }

      // Direct digitalWrite(pin, val) inside ISR
      const dWriteMatch = stmt.match(/^digitalWrite\s*\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*\)$/);
      if (dWriteMatch) {
        const pin = resolveCppPinNumber(dWriteMatch[1], constants);
        const valStr = dWriteMatch[2].trim();
        let val: 0 | 1 = 0;
        if (valStr === "HIGH" || valStr === "1" || valStr === "true") {
          val = 1;
        } else if (variables.has(valStr)) {
          val = variables.get(valStr) ? 1 : 0;
        }

        if (pin !== null) {
          if (isEsp32ReservedFlashPin(pin)) {
            actions.push({
              type: "gpio_write",
              pin,
              value: 0,
              warning: `Forbidden GPIO ${pin} reserved for internal SPI flash memory.`,
            });
          } else if (isEsp32InputOnlyPin(pin)) {
            actions.push({
              type: "gpio_write",
              pin,
              value: 0,
              warning: `ValueError: Pin(${pin}) doesn't have an output driver (input-only pin).`,
            });
          } else {
            actions.push({
              type: "gpio_write",
              pin,
              value: val,
            });
          }
        }
        continue;
      }

      // Direct Serial.print / println inside ISR
      const serialMatch = stmt.match(/^Serial\.(?:print|println)\s*\(\s*([^)]*)\s*\)$/);
      if (serialMatch) {
        const rawArg = serialMatch[1].trim();
        let printed = rawArg;
        if (rawArg.startsWith('"') && rawArg.endsWith('"')) {
          printed = rawArg.slice(1, -1);
        } else if (variables.has(rawArg)) {
          printed = String(variables.get(rawArg));
        } else if (constants.has(rawArg)) {
          printed = String(constants.get(rawArg));
        }
        serialLines.push(printed);
      }
    }
  }

  // Handle if statements within ISR
  const ifRegex = /\bif\s*\(/g;
  let ifMatch: RegExpExecArray | null;
  let lastIdx = 0;

  while ((ifMatch = ifRegex.exec(isrBody)) !== null) {
    const ifStart = ifMatch.index;
    const parenInfo = extractCallArgs(isrBody, ifStart);
    if (!parenInfo) continue;

    const condExpr = parenInfo.argsStr;
    const afterParen = parenInfo.afterIndex;

    const openBrace = isrBody.indexOf("{", afterParen);
    if (openBrace === -1) continue;

    let depth = 1;
    let closeBrace = -1;
    for (let i = openBrace + 1; i < isrBody.length; i++) {
      if (isrBody[i] === "{") depth++;
      else if (isrBody[i] === "}") {
        depth--;
        if (depth === 0) {
          closeBrace = i;
          break;
        }
      }
    }
    if (closeBrace === -1) continue;

    // Prior statements before this if
    const prior = isrBody.slice(lastIdx, ifStart);
    executeBlock(prior);

    // Evaluate condition: e.g. now - lastPressTime > debounceDelay or millis() - lastPressTime > 200
    let condPassed = false;
    const compMatch = condExpr.match(/([\s\S]+?)\s*(>|<|>=|<=|==|!=)\s*([\s\S]+)/);
    if (compMatch) {
      const leftVal = evalExpression(compMatch[1]);
      const op = compMatch[2];
      const rightVal = evalExpression(compMatch[3]);
      switch (op) {
        case ">": condPassed = leftVal > rightVal; break;
        case "<": condPassed = leftVal < rightVal; break;
        case ">=": condPassed = leftVal >= rightVal; break;
        case "<=": condPassed = leftVal <= rightVal; break;
        case "==": condPassed = leftVal === rightVal; break;
        case "!=": condPassed = leftVal !== rightVal; break;
      }
    }

    if (condPassed) {
      const innerBlock = isrBody.slice(openBrace + 1, closeBrace);
      executeBlock(innerBlock);
    }

    lastIdx = closeBrace + 1;
    ifRegex.lastIndex = closeBrace + 1;
  }

  const remainder = isrBody.slice(lastIdx);
  executeBlock(remainder);
}

/**
 * Evaluates ESP32 C++ hardware interrupts for a simulation step.
 *
 * @param code ESP32 Arduino C++ source code.
 * @param context Live simulation frame context.
 * @returns Triggered interrupt results, variable modifications, and GPIO/Serial actions.
 */
export function evaluateEsp32CppInterrupts(
  code: string,
  context: Esp32CppInterruptContext = {},
): Esp32CppInterruptResult {
  const tick = context.tick ?? 0;
  const inputStates = context.inputStates ?? new Map<number, boolean>();

  let session = cppInterruptSessions.get(code);
  const constants = parseCppConstants(code);

  if (!session || tick === 0) {
    session = {
      registeredInterrupts: parseInterruptRegistrations(code, constants, inputStates),
      variables: extractInitialVariables(code, constants),
      lastTick: tick,
      isrSerialLines: [],
    };
    cppInterruptSessions.set(code, session);

    // On tick 0 / boot, initialize all lastValue to current physical state (no false trigger)
    for (const [, config] of session.registeredInterrupts) {
      if (inputStates.has(config.pin)) {
        config.lastValue = Boolean(inputStates.get(config.pin));
      }
    }

    return {
      triggeredPins: [],
      actions: [],
      serialLines: [],
      variables: new Map(session.variables),
    };
  }

  const triggeredPins: number[] = [];
  const actions: Esp32GpioAction[] = [];
  const serialLines: string[] = [];

  // Check each registered interrupt for edge transitions
  for (const [pin, config] of session.registeredInterrupts) {
    const currentVal = inputStates.has(pin) ? Boolean(inputStates.get(pin)) : false;
    const prevVal = config.lastValue;

    const isRising = prevVal === false && currentVal === true;
    const isFalling = prevVal === true && currentVal === false;
    const isChange = prevVal !== currentVal;

    let shouldTrigger = false;
    if (config.mode === "RISING" && isRising) shouldTrigger = true;
    else if (config.mode === "FALLING" && isFalling) shouldTrigger = true;
    else if (config.mode === "CHANGE" && isChange) shouldTrigger = true;

    if (shouldTrigger) {
      triggeredPins.push(pin);

      // Extract and execute the zero-argument ISR function
      const isrBody = extractCppFunctionBody(code, config.handlerName);
      if (isrBody) {
        const ts = context.timestamp ?? (tick * 100);
        executeIsrBody(isrBody, constants, session.variables, actions, serialLines, ts);
      }
    }

    // Update edge history
    config.lastValue = currentVal;
  }

  session.lastTick = tick;

  return {
    triggeredPins,
    actions,
    serialLines,
    variables: new Map(session.variables),
  };
}
