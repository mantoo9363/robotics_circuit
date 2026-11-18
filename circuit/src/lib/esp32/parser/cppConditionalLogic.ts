import {
  stripCppComments,
  stripCppIncludes,
  parseCppConstants,
  extractCppFunctionBody,
  isEsp32InputOnlyPin,
  isEsp32ReservedFlashPin,
  resolveCppPinNumber,
  type Esp32GpioAction,
} from "./cppPatterns";
import { evaluateEsp32CppKeypad } from "./cppKeypad";
import { extractCppUltrasonicVariables, evaluateCppArithmeticExpr } from "./cppUltrasonic";
import { extractCppIrReceiverVariables } from "./cppIrReceiver";
import { extractCppBluetoothVariables } from "./cppBluetoothSerial";
export { extractCppBluetoothVariables } from "./cppBluetoothSerial";
import { getAnalogValueForPicoPin } from "../../codeParsing/picoAnalogPins";
import type { CircuitNode, CircuitEdge } from "../../types";

/** Extracts matching curly brace block code { ... } starting from startIndex. */
function extractBlockCode(
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

/** Resolves an argument token to a valid ESP32 GPIO pin number or null. */
function resolvePin(token: string, constants: Map<string, number>): number | null {
  return resolveCppPinNumber(token, constants);
}

/** Strips nested if/else statements from a code block so only direct, top-level statements remain. */
function stripNestedConditionals(block: string): string {
  let result = "";
  let i = 0;
  while (i < block.length) {
    const ifIndex = block.indexOf("if", i);
    if (ifIndex === -1) {
      result += block.slice(i);
      break;
    }
    const isWordStart = ifIndex === 0 || /\s|[;{}(!]/.test(block[ifIndex - 1]);
    const afterIf = ifIndex + 2;
    const isWordEnd = afterIf < block.length && (/\s|\(/.test(block[afterIf]));
    if (!isWordStart || !isWordEnd) {
      result += block.slice(i, afterIf);
      i = afterIf;
      continue;
    }

    result += block.slice(i, ifIndex);

    // Skip the if condition and then-block
    const parenIndex = block.indexOf("(", afterIf);
    if (parenIndex === -1) {
      i = afterIf;
      continue;
    }

    const extracted = extractIfCondition(block, parenIndex + 1);
    if (!extracted) {
      i = afterIf;
      continue;
    }

    const { afterIfIndex } = extracted;
    const { endIndex: afterThenIndex } = extractBlockCode(block, afterIfIndex);

    let nextIndex = afterThenIndex;
    const remaining = block.slice(afterThenIndex);
    const elseMatch = remaining.match(/^\s*else\b/);
    if (elseMatch) {
      const elseStart = afterThenIndex + elseMatch[0].length;
      const { endIndex: afterElseIndex } = extractBlockCode(block, elseStart);
      nextIndex = afterElseIndex;
    }

    i = nextIndex;
  }
  return result;
}

/** Parses digital and PWM writes inside a block of code. */
function parseWritesInBlock(
  block: string,
  constants: Map<string, number>,
): Esp32GpioAction[] {
  const actions: Esp32GpioAction[] = [];

  // Match digitalWrite(pin, val)
  const writeRegex = /digitalWrite\s*\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = writeRegex.exec(block)) !== null) {
    const pinToken = match[1];
    const valToken = match[2].toUpperCase();
    const pinNum = resolvePin(pinToken, constants);

    if (pinNum === null || isEsp32ReservedFlashPin(pinNum) || isEsp32InputOnlyPin(pinNum)) {
      continue;
    }

    let val: 0 | 1 = 0;
    if (valToken === "HIGH" || valToken === "1") {
      val = 1;
    } else if (valToken === "LOW" || valToken === "0") {
      val = 0;
    } else {
      const resolved = constants.get(match[2].trim());
      val = resolved === 1 ? 1 : 0;
    }

    actions.push({
      type: "gpio_write",
      pin: pinNum,
      value: val,
    });
  }

  // Match analogWrite(pin, val) and ledcWrite(pin, val)
  const analogWriteRegex = /(?:analogWrite|ledcWrite)\s*\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*\)/g;
  while ((match = analogWriteRegex.exec(block)) !== null) {
    const pinToken = match[1];
    const valToken = match[2];
    const pinNum = resolvePin(pinToken, constants);

    if (pinNum === null || isEsp32ReservedFlashPin(pinNum) || isEsp32InputOnlyPin(pinNum)) {
      continue;
    }

    let numVal = 0;
    if (/^\d+$/.test(valToken.trim())) {
      numVal = Number(valToken.trim());
    } else if (constants.has(valToken.trim())) {
      numVal = constants.get(valToken.trim())!;
    }

    const clampedVal = Math.max(0, Math.min(255, numVal));
    const dutyPercent = Math.round(((clampedVal / 255) * 100) * 10) / 10;
    const dutyU16 = Math.round((clampedVal / 255) * 65535);

    actions.push({
      type: "pwm_write",
      pin: pinNum,
      dutyPercent,
      dutyU16,
      freqHz: 1000,
    });
  }

  return actions;
}

/** Extracts parenthesized condition expression from if (...) using paren depth. */
function extractIfCondition(
  code: string,
  startIndex: number,
): { condExpr: string; afterIfIndex: number } | null {
  let depth = 1;
  for (let i = startIndex; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")") depth--;
    if (depth === 0) {
      return { condExpr: code.slice(startIndex, i).trim(), afterIfIndex: i + 1 };
    }
  }
  return null;
}

export interface Esp32CppConditionalsContext {
  nodes?: CircuitNode[];
  edges?: CircuitEdge[];
  variables?: Map<string, any>;
  constants?: Map<string, number>;
  frame?: any;
  tick?: number;
  running?: boolean;
}

/**
 * Evaluates C++ conditional statements and direct digitalRead/analogRead assignments
 * against active input states and ADC context.
 */
export function evaluateEsp32CppConditionals(
  code: string,
  inputStates: Map<number, boolean>,
  contextOrAdc?: Map<number, number> | Esp32CppConditionalsContext,
): Esp32GpioAction[] {
  if (!code || typeof code !== "string") {
    return [];
  }

  const cleaned = stripCppIncludes(stripCppComments(code));
  const parsedConstants = parseCppConstants(code);
  const contextConstants = contextOrAdc && !(contextOrAdc instanceof Map) ? contextOrAdc.constants : undefined;
  const constants = new Map<string, number>([...(contextConstants ?? []), ...parsedConstants]);
  const actions: Esp32GpioAction[] = [];

  const loopBody = extractCppFunctionBody(cleaned, "loop") ?? cleaned;
  const contextVars = contextOrAdc && !(contextOrAdc instanceof Map) ? contextOrAdc.variables : undefined;

  // Helper to resolve live ADC reading for an analog pin
  const getAdcVal = (pin: number, res: "10bit" | "12bit" = "10bit"): number => {
    if (!contextOrAdc) return 0;
    if (contextOrAdc instanceof Map) {
      const v = contextOrAdc.get(pin) ?? 0;
      if (res === "12bit" && v <= 1023) return Math.round((v / 1023) * 4095);
      if (res === "10bit" && v > 1023) return Math.round((v / 4095) * 1023);
      return v;
    }
    if (contextOrAdc.nodes && contextOrAdc.edges) {
      return getAnalogValueForPicoPin(pin, contextOrAdc.nodes, contextOrAdc.edges, res);
    }
    return 0;
  };

  // Track digitalRead variables: e.g. int buttonState = digitalRead(BUTTON_PIN);
  const readVars = new Map<string, number>(); // varName -> pinNumber
  const varReadRegex = /\b(?:(?:const\s+)?(?:int|bool|byte|auto)\s+)?([A-Za-z_]\w*)\s*=\s*digitalRead\s*\(\s*([^,\s)]+)\s*\)/g;
  let varMatch: RegExpExecArray | null;
  while ((varMatch = varReadRegex.exec(loopBody)) !== null) {
    const varName = varMatch[1];
    const pin = resolvePin(varMatch[2], constants);
    if (pin !== null) {
      readVars.set(varName, pin);
    }
  }

  // Track analogRead variables: e.g. int potVal = analogRead(POT_PIN);
  const adcVars = new Map<string, number>(); // varName -> pinNumber
  const varAdcRegex = /\b(?:(?:const\s+)?(?:int|float|double|auto)\s+)?([A-Za-z_]\w*)\s*=\s*analogRead\s*\(\s*([^,\s)]+)\s*\)/g;
  let varAdcMatch: RegExpExecArray | null;
  while ((varAdcMatch = varAdcRegex.exec(loopBody)) !== null) {
    const varName = varAdcMatch[1];
    const pin = resolvePin(varAdcMatch[2], constants);
    if (pin !== null) {
      adcVars.set(varName, pin);
    }
  }

  const localVars = new Map<string, any>(contextVars ?? []);
  if (contextOrAdc && !(contextOrAdc instanceof Map) && contextOrAdc.nodes && contextOrAdc.edges) {
    const ultraVars = extractCppUltrasonicVariables(code, constants, {
      nodes: contextOrAdc.nodes,
      edges: contextOrAdc.edges,
    }, localVars);
    for (const [k, v] of ultraVars.entries()) {
      if (!localVars.has(k)) {
        localVars.set(k, v);
      }
    }
  }

  const kpRegex = /\b(?:(?:const\s+)?(?:char|auto)\s+)?([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\.getKey\s*\(\s*\)/g;
  let kpMatch: RegExpExecArray | null;
  while ((kpMatch = kpRegex.exec(loopBody)) !== null) {
    const varName = kpMatch[1];
    const kpRes = evaluateEsp32CppKeypad(code, {
      nodes: contextOrAdc && !(contextOrAdc instanceof Map) ? contextOrAdc.nodes : undefined,
      edges: contextOrAdc && !(contextOrAdc instanceof Map) ? contextOrAdc.edges : undefined,
    });
    localVars.set(varName, kpRes.pressedKey ?? "");
  }

  // IR Receiver variables: only re-evaluate hardware state if not already pre-seeded by the caller
  // (e.g. via cppIrqVariables from the production frame pipeline). Overwriting pre-resolved IR state
  // with a no-circuit evaluation would cause decode() to falsely read as 0 (flash-then-off bug).
  if (!localVars.has("__ir_decoded")) {
    if (contextOrAdc && !(contextOrAdc instanceof Map)) {
      extractCppIrReceiverVariables(code, {
        nodes: contextOrAdc.nodes,
        edges: contextOrAdc.edges,
        frame: contextOrAdc.frame,
        tick: contextOrAdc.tick,
        running: contextOrAdc.running,
      }, localVars);
    } else {
      extractCppIrReceiverVariables(code, {}, localVars);
    }
  }

  // Bluetooth Serial variables (SerialBT.available(), SerialBT.read(), SerialBT.readString())
  if (contextOrAdc && !(contextOrAdc instanceof Map)) {
    extractCppBluetoothVariables(code, {
      nodes: contextOrAdc.nodes,
      edges: contextOrAdc.edges,
      tick: contextOrAdc.tick ?? contextOrAdc.frame,
      running: contextOrAdc.running,
    }, localVars);
  } else {
    extractCppBluetoothVariables(code, {}, localVars);
  }

  const calcVars = new Map<string, number>(); // varName -> calculatedValue (0-255)

  // Evaluates ADC/arithmetic mathematical expressions
  function evaluateAdcExpr(expr: string): number | null {
    const trimmed = expr.trim();
    if (calcVars.has(trimmed)) {
      return calcVars.get(trimmed)!;
    }
    if (localVars.has(trimmed)) {
      const v = Number(localVars.get(trimmed));
      if (Number.isFinite(v)) return v;
    }

    // Generic Arduino map(val, in_min, in_max, out_min, out_max)
    const mapMatch = trimmed.match(/map\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/);
    if (mapMatch) {
      const sourceExpr = mapMatch[1].trim();
      const inMin = Number(mapMatch[2].trim());
      const inMax = Number(mapMatch[3].trim());
      const outMin = Number(mapMatch[4].trim());
      const outMax = Number(mapMatch[5].trim());

      const readPinMatch = sourceExpr.match(/^analogRead\s*\(\s*([^,\s)]+)\s*\)$/);
      const pin = readPinMatch ? resolvePin(readPinMatch[1], constants) : adcVars.get(sourceExpr);

      if (pin !== undefined && pin !== null && inMax !== inMin) {
        // If inMax > 1024 (e.g. 4095 on ESP32), resolve 12-bit ADC value; otherwise 10-bit ADC value
        const res = inMax > 1024 ? "12bit" : "10bit";
        const adcReading = getAdcVal(pin, res);
        return Math.round(outMin + ((adcReading - inMin) * (outMax - outMin)) / (inMax - inMin));
      }
    }

    // Division: analogRead(...) / div or adcVar / div
    const divMatch = trimmed.match(/^(?:analogRead\s*\(\s*([^,\s)]+)\s*\)|([A-Za-z_]\w*))\s*\/\s*(\d+)$/);
    if (divMatch) {
      const pin = divMatch[1] ? resolvePin(divMatch[1], constants) : adcVars.get(divMatch[2]);
      const div = Number(divMatch[3]) || 1;
      if (pin !== undefined && pin !== null) {
        const res = div >= 16 ? "12bit" : "10bit";
        return Math.round(getAdcVal(pin, res) / div);
      }
    }

    const arithmeticVal = evaluateCppArithmeticExpr(trimmed, localVars, constants);
    if (arithmeticVal !== null) {
      return Math.round(arithmeticVal);
    }

    return null;
  }

  // Track calculated variables derived from ADC/math: e.g. int outputValue = sensorValue / 4;
  const calcVarRegex = /\b(?:(?:const\s+)?(?:int|float|double|auto)\s+)?([A-Za-z_]\w*)\s*=\s*([^;]+);/g;
  let calcVarMatch: RegExpExecArray | null;
  while ((calcVarMatch = calcVarRegex.exec(loopBody)) !== null) {
    const varName = calcVarMatch[1];
    const expr = calcVarMatch[2].trim();
    if (adcVars.has(varName) || readVars.has(varName)) continue;

    const val = evaluateAdcExpr(expr);
    if (val !== null) {
      calcVars.set(varName, val);
      localVars.set(varName, val);
    }
  }

  // 1. Direct digital assignments: digitalWrite(ledPin, digitalRead(btnPin)) or digitalWrite(ledPin, !digitalRead(btnPin))
  const directReadWriteRegex = /digitalWrite\s*\(\s*([^,\s)]+)\s*,\s*(!?)\s*digitalRead\s*\(\s*([^,\s)]+)\s*\)\s*\)/g;
  let directMatch: RegExpExecArray | null;
  while ((directMatch = directReadWriteRegex.exec(loopBody)) !== null) {
    const outPin = resolvePin(directMatch[1], constants);
    const inverted = directMatch[2] === "!";
    const inPin = resolvePin(directMatch[3], constants);

    if (outPin !== null && inPin !== null && !isEsp32InputOnlyPin(outPin) && !isEsp32ReservedFlashPin(outPin)) {
      const isHigh = inputStates.get(inPin) ?? false;
      const effectiveVal: 0 | 1 = (inverted ? !isHigh : isHigh) ? 1 : 0;
      actions.push({
        type: "gpio_write",
        pin: outPin,
        value: effectiveVal,
      });
    }
  }

  // Direct variable assignments: digitalWrite(ledPin, buttonState) or digitalWrite(ledPin, !buttonState)
  const directVarWriteRegex = /digitalWrite\s*\(\s*([^,\s)]+)\s*,\s*(!?)\s*([A-Za-z_]\w*)\s*\)/g;
  let directVarMatch: RegExpExecArray | null;
  while ((directVarMatch = directVarWriteRegex.exec(loopBody)) !== null) {
    const outPin = resolvePin(directVarMatch[1], constants);
    const inverted = directVarMatch[2] === "!";
    const varName = directVarMatch[3];
    const inPin = readVars.get(varName);

    if (outPin !== null && !isEsp32InputOnlyPin(outPin) && !isEsp32ReservedFlashPin(outPin)) {
      if (inPin !== undefined) {
        const isHigh = inputStates.get(inPin) ?? false;
        const effectiveVal: 0 | 1 = (inverted ? !isHigh : isHigh) ? 1 : 0;
        actions.push({
          type: "gpio_write",
          pin: outPin,
          value: effectiveVal,
        });
      } else if (localVars.has(varName)) {
        const rawVal = localVars.get(varName);
        const isHigh = Boolean(rawVal && rawVal !== "0" && rawVal !== 0 && rawVal !== "false" && rawVal !== false);
        const effectiveVal: 0 | 1 = (inverted ? !isHigh : isHigh) ? 1 : 0;
        actions.push({
          type: "gpio_write",
          pin: outPin,
          value: effectiveVal,
        });
      }
    }
  }

  // 2. Direct analogRead -> analogWrite mappings (e.g. analogWrite(led, map(potValue, 0, 4095, 0, 255)))
  const directAdcPwmRegex = /(?:analogWrite|ledcWrite)\s*\(\s*([^,\s)]+)\s*,\s*([^;]+)\s*\)/g;
  let directAdcMatch: RegExpExecArray | null;
  while ((directAdcMatch = directAdcPwmRegex.exec(loopBody)) !== null) {
    const outPin = resolvePin(directAdcMatch[1], constants);
    const expr = directAdcMatch[2].trim();
    if (outPin === null || isEsp32InputOnlyPin(outPin) || isEsp32ReservedFlashPin(outPin)) continue;

    const calculatedVal = evaluateAdcExpr(expr);
    if (calculatedVal !== null) {
      const clampedVal = Math.max(0, Math.min(255, calculatedVal));
      const dutyPercent = Math.round(((clampedVal / 255) * 100) * 10) / 10;
      const dutyU16 = Math.round((clampedVal / 255) * 65535);
      actions.push({
        type: "pwm_write",
        pin: outPin,
        dutyPercent,
        dutyU16,
        freqHz: 1000,
      });
    }
  }

  // 3. If conditionals: if ( ... ) { thenBlock } [else { elseBlock }]
  const ifRegex = /\bif\s*\(/g;
  let ifMatch: RegExpExecArray | null;

  while ((ifMatch = ifRegex.exec(loopBody)) !== null) {
    const extracted = extractIfCondition(loopBody, ifMatch.index + ifMatch[0].length);
    if (!extracted) continue;
    const { condExpr, afterIfIndex } = extracted;

    const { block: thenBlock, endIndex: afterThenIndex } = extractBlockCode(loopBody, afterIfIndex);

    let elseBlock: string | null = null;
    let endOfIfConstruct = afterThenIndex;
    const remainingAfterThen = loopBody.slice(afterThenIndex);
    const elseMatch = remainingAfterThen.match(/^\s*else\b/);
    if (elseMatch) {
      const elseStart = afterThenIndex + elseMatch[0].length;
      const { block: eb, endIndex: afterElseIndex } = extractBlockCode(loopBody, elseStart);
      elseBlock = eb;
      endOfIfConstruct = afterElseIndex;
    }

    let conditionResult: boolean | null = null;

    // Pattern A: digitalRead(pin) == HIGH / LOW / 1 / 0
    const readCompareMatch = condExpr.match(/digitalRead\s*\(\s*([^,\s)]+)\s*\)\s*(==|!=)\s*([A-Za-z0-9_]+)/);
    if (readCompareMatch) {
      const pin = resolvePin(readCompareMatch[1], constants);
      const op = readCompareMatch[2];
      const targetToken = readCompareMatch[3].toUpperCase();
      const targetVal = targetToken === "HIGH" || targetToken === "1" ? true : false;

      if (pin !== null) {
        const pinHigh = inputStates.get(pin) ?? false;
        conditionResult = op === "==" ? (pinHigh === targetVal) : (pinHigh !== targetVal);
      }
    }

    // Pattern B: variable == HIGH / LOW / 1 / 0
    if (conditionResult === null) {
      const varCompareMatch = condExpr.match(/([A-Za-z_]\w*)\s*(==|!=)\s*([A-Za-z0-9_]+)/);
      if (varCompareMatch) {
        const varName = varCompareMatch[1];
        const pin = readVars.get(varName);
        const op = varCompareMatch[2];
        const targetToken = varCompareMatch[3].toUpperCase();
        const targetVal = targetToken === "HIGH" || targetToken === "1" ? true : false;

        if (pin !== undefined) {
          const pinHigh = inputStates.get(pin) ?? false;
          conditionResult = op === "==" ? (pinHigh === targetVal) : (pinHigh !== targetVal);
        } else if (localVars.has(varName)) {
          const v = localVars.get(varName);
          const vBool = typeof v === "boolean" ? v : Boolean(v && v !== "0" && v !== "");
          conditionResult = op === "==" ? (vBool === targetVal) : (vBool !== targetVal);
        }
      }
    }

    // Pattern B2: char / string comparison: if (key == '1') or if (key != NO_KEY)
    if (conditionResult === null) {
      const charCondMatch = condExpr.match(/([A-Za-z_]\w*)\s*(==|!=)\s*(?:'([^']*)'|"([^"]*)"|NO_KEY)/i);
      if (charCondMatch) {
        const varName = charCondMatch[1];
        const op = charCondMatch[2];
        const targetStr = charCondMatch[4] ?? charCondMatch[3] ?? "";
        const actualStr = localVars.has(varName) ? String(localVars.get(varName)) : "";
        conditionResult = op === "==" ? actualStr === targetStr : actualStr !== targetStr;
      }
    }

    // Pattern B3: IR Receiver decode(): if (IrReceiver.decode()) or if (irrecv.decode(...))
    if (conditionResult === null) {
      if (/\b(?:IrReceiver|irrecv)\s*\.\s*decode\s*\(/i.test(condExpr)) {
        conditionResult = Boolean(localVars.get("__ir_decoded"));
      }
    }

    // Pattern B4: IR Receiver command compare: if (IrReceiver.decodedIRData.command == 0x45)
    if (conditionResult === null) {
      const irCmdMatch = condExpr.match(/\b(?:IrReceiver\s*\.\s*decodedIRData\s*\.\s*command|results\s*\.\s*value)\s*(==|!=)\s*(0x[0-9a-fA-F]+|\d+)/i);
      if (irCmdMatch) {
        const op = irCmdMatch[1];
        const targetVal = irCmdMatch[2].startsWith("0x") || irCmdMatch[2].startsWith("0X")
          ? parseInt(irCmdMatch[2], 16)
          : parseInt(irCmdMatch[2], 10);
        const actualCmd = Number(localVars.get("IrReceiver.decodedIRData.command") ?? localVars.get("__ir_command") ?? 0);
        const hasDecoded = Boolean(localVars.get("__ir_decoded"));
        conditionResult = op === "==" ? (hasDecoded && actualCmd === targetVal) : (!hasDecoded || actualCmd !== targetVal);
      }
    }

    // Pattern B5: Bluetooth Serial available() / connected()
    if (conditionResult === null) {
      if (/\b(?:SerialBT|[A-Za-z_]\w*)\s*\.\s*available\s*\(\s*\)/i.test(condExpr)) {
        conditionResult = Boolean(localVars.get("__bt_available"));
      } else if (/\b(?:SerialBT|[A-Za-z_]\w*)\s*\.\s*connected\s*\(\s*\)/i.test(condExpr)) {
        conditionResult = localVars.get("SerialBT.connected()") === 1 || Boolean(localVars.get("__bt_connected"));
      }
    }

    // Pattern B6: Direct Bluetooth Serial read() compare: if (SerialBT.read() == '1')
    if (conditionResult === null) {
      const btReadCompMatch = condExpr.match(/\b(?:SerialBT|[A-Za-z_]\w*)\s*\.\s*read\s*\(\s*\)\s*(==|!=)\s*(?:'([^']*)'|"([^"]*)"|(\d+))/i);
      if (btReadCompMatch) {
        const op = btReadCompMatch[1];
        const targetStr = btReadCompMatch[2] ?? btReadCompMatch[3] ?? (btReadCompMatch[4] !== undefined ? String.fromCharCode(Number(btReadCompMatch[4])) : "");
        const actualChar = String(localVars.get("__bt_char") ?? "");
        const hasAvailable = Boolean(localVars.get("__bt_available"));
        conditionResult = op === "==" ? (hasAvailable && actualChar === targetStr) : (!hasAvailable || actualChar !== targetStr);
      }
    }

    // Pattern C: analogRead(pin) > / < / >= / <= threshold
    if (conditionResult === null) {
      const adcCompareMatch = condExpr.match(/analogRead\s*\(\s*([^,\s)]+)\s*\)\s*(>=|<=|>|<|==|!=)\s*(\d+)/);
      if (adcCompareMatch) {
        const pin = resolvePin(adcCompareMatch[1], constants);
        const op = adcCompareMatch[2];
        const threshold = Number(adcCompareMatch[3]);
        if (pin !== null) {
          const adcVal = getAdcVal(pin, threshold > 1024 ? "12bit" : "10bit");
          if (op === ">") conditionResult = adcVal > threshold;
          else if (op === "<") conditionResult = adcVal < threshold;
          else if (op === ">=") conditionResult = adcVal >= threshold;
          else if (op === "<=") conditionResult = adcVal <= threshold;
          else if (op === "==") conditionResult = adcVal === threshold;
          else if (op === "!=") conditionResult = adcVal !== threshold;
        }
      }
    }

    // Pattern D: adcVar / numeric var (>|>=|<|<=|==|!=) threshold
    if (conditionResult === null) {
      const numVarCompareMatch = condExpr.match(/([A-Za-z_]\w*)\s*(>=|<=|>|<|==|!=)\s*(-?\d+(?:\.\d+)?)/);
      if (numVarCompareMatch) {
        const varName = numVarCompareMatch[1];
        const op = numVarCompareMatch[2];
        const threshold = Number(numVarCompareMatch[3]);
        const pin = adcVars.get(varName);
        if (pin !== undefined) {
          const adcVal = getAdcVal(pin, threshold > 1024 ? "12bit" : "10bit");
          if (op === ">") conditionResult = adcVal > threshold;
          else if (op === "<") conditionResult = adcVal < threshold;
          else if (op === ">=") conditionResult = adcVal >= threshold;
          else if (op === "<=") conditionResult = adcVal <= threshold;
          else if (op === "==") conditionResult = adcVal === threshold;
          else if (op === "!=") conditionResult = adcVal !== threshold;
        } else if (localVars.has(varName)) {
          const rawVal = localVars.get(varName);
          const numVal = Number(rawVal);
          if (Number.isFinite(numVal)) {
            if (op === ">") conditionResult = numVal > threshold;
            else if (op === "<") conditionResult = numVal < threshold;
            else if (op === ">=") conditionResult = numVal >= threshold;
            else if (op === "<=") conditionResult = numVal <= threshold;
            else if (op === "==") conditionResult = numVal === threshold;
            else if (op === "!=") conditionResult = numVal !== threshold;
          }
        }
      }
    }

    // Pattern D2: Generic arithmetic relational comparison: expr1 (>=|<=|>|<|==|!=) expr2
    if (conditionResult === null) {
      const relMatch = condExpr.match(/^([\s\S]+?)\s*(>=|<=|==|!=|>|<)\s*([\s\S]+)$/);
      if (relMatch) {
        const leftExpr = relMatch[1].trim();
        const op = relMatch[2];
        const rightExpr = relMatch[3].trim();
        const leftVal = evaluateCppArithmeticExpr(leftExpr, localVars, constants);
        const rightVal = evaluateCppArithmeticExpr(rightExpr, localVars, constants);
        if (leftVal !== null && rightVal !== null) {
          if (op === ">") conditionResult = leftVal > rightVal;
          else if (op === "<") conditionResult = leftVal < rightVal;
          else if (op === ">=") conditionResult = leftVal >= rightVal;
          else if (op === "<=") conditionResult = leftVal <= rightVal;
          else if (op === "==") conditionResult = leftVal === rightVal;
          else if (op === "!=") conditionResult = leftVal !== rightVal;
        }
      }
    }

    // Pattern E: truthy/negated read: if (!digitalRead(pin)) or if (digitalRead(pin))
    if (conditionResult === null) {
      const truthyReadMatch = condExpr.match(/^(!?)\s*digitalRead\s*\(\s*([^,\s)]+)\s*\)$/);
      if (truthyReadMatch) {
        const inverted = truthyReadMatch[1] === "!";
        const pin = resolvePin(truthyReadMatch[2], constants);
        if (pin !== null) {
          const pinHigh = inputStates.get(pin) ?? false;
          conditionResult = inverted ? !pinHigh : pinHigh;
        }
      }
    }

    // Pattern F: truthy/negated variable: if (!val) or if (val)
    if (conditionResult === null) {
      const truthyVarMatch = condExpr.match(/^(!?)\s*([A-Za-z_]\w*)$/);
      if (truthyVarMatch) {
        const inverted = truthyVarMatch[1] === "!";
        const varName = truthyVarMatch[2];
        const pin = readVars.get(varName);
        if (pin !== undefined) {
          const pinHigh = inputStates.get(pin) ?? false;
          conditionResult = inverted ? !pinHigh : pinHigh;
        } else if (localVars.has(varName)) {
          const v = localVars.get(varName);
          const vBool = typeof v === "boolean" ? v : Boolean(v && v !== "0" && v !== 0 && v !== "");
          conditionResult = inverted ? !vBool : vBool;
        }
      }
    }

    if (conditionResult === true) {
      if (/\bif\s*\(/.test(thenBlock)) {
        actions.push(...evaluateEsp32CppConditionals(thenBlock, inputStates, {
          nodes: contextOrAdc && !(contextOrAdc instanceof Map) ? contextOrAdc.nodes : undefined,
          edges: contextOrAdc && !(contextOrAdc instanceof Map) ? contextOrAdc.edges : undefined,
          variables: localVars,
          constants,
        }));
      }
      actions.push(...parseWritesInBlock(stripNestedConditionals(thenBlock), constants));
    } else if (conditionResult === false && elseBlock !== null) {
      if (/\bif\s*\(/.test(elseBlock)) {
        actions.push(...evaluateEsp32CppConditionals(elseBlock, inputStates, {
          nodes: contextOrAdc && !(contextOrAdc instanceof Map) ? contextOrAdc.nodes : undefined,
          edges: contextOrAdc && !(contextOrAdc instanceof Map) ? contextOrAdc.edges : undefined,
          variables: localVars,
          constants,
        }));
      }
      actions.push(...parseWritesInBlock(stripNestedConditionals(elseBlock), constants));
    }

    ifRegex.lastIndex = endOfIfConstruct;
  }

  return actions;
}
