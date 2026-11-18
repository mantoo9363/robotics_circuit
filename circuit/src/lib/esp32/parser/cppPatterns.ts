/**
 * ESP32 Arduino C++ GPIO Output & Input Parser
 *
 * Pattern & structure parser for ESP32 Arduino-C++ syntax:
 *   - void setup() { ... } and void loop() { ... } structure extraction
 *   - Constant and variable resolution (#define, const int, int, byte, uint8_t, GPIO_NUM_X)
 *   - #include <...> safely ignored as no-op
 *   - pinMode(pin, OUTPUT | INPUT | INPUT_PULLUP)
 *   - digitalWrite(pin, HIGH | LOW | 1 | 0)
 *   - digitalRead(pin)
 *
 * ESP32 Pin Validation & Quirks:
 *   - Valid range is GPIO0-GPIO39.
 *   - GPIO6-11 are strictly reserved for internal SPI flash memory; emits warning.
 *   - GPIO34, 35, 36, 39 are input-only (no output drivers); emits warning if used as OUTPUT.
 */

import { getBoardAdapter } from "../../circuit/boardAdapter";

export interface Esp32GpioWriteAction {
  type: "gpio_write";
  pin: number;
  value: 0 | 1;
  warning?: string;
  /** True when the write originated from setup() — only applied at simulation tick 0. */
  fromSetup?: true;
}

/** Emitted when a pin is declared as INPUT — carries pull resistor config. */
export interface Esp32GpioReadAction {
  type: "gpio_read";
  pin: number;
  pull: "none" | "up" | "down";
  warning?: string;
}

/** Emitted when a PWM channel is configured on a GPIO output pin. */
export interface Esp32PwmAction {
  type: "pwm_write";
  pin: number;
  /** Duty cycle normalized to 0–100 from either duty(0-1023) or duty_u16(0-65535). */
  dutyPercent: number;
  /** Exact 16-bit duty value (0-65535) for precise pulse-width angle mapping. */
  dutyU16: number;
  /** Optional PWM frequency in Hz, if explicitly set via .freq(n). */
  freqHz?: number;
  warning?: string;
}

/**
 * Emitted when machine.ADC(...).read() / .read_u16() / .read_uv() is called.
 * Raw values are pre-computed from the connected component's live wiper voltage.
 * resolution: '12bit' = 0-4095 (default), '16bit' = 0-65535, 'uv' = microvolts 0-3_300_000.
 */
export interface Esp32AdcAction {
  type: "adc_read";
  pin: number;
  resolution: "12bit" | "16bit" | "10bit" | "uv";
  warning?: string;
}

/** Normalized ESP32 GPIO action — output write, input declaration, PWM write, or ADC read. */
export type Esp32GpioAction = Esp32GpioWriteAction | Esp32GpioReadAction | Esp32PwmAction | Esp32AdcAction;

/** Strips single-line and multi-line comments from C++ code. */
export function stripCppComments(code: string): string {
  return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Safely strips #include directives from C++ code. */
export function stripCppIncludes(code: string): string {
  return code.replace(/#include\s*[<"][^>"]*[>"]/g, "");
}

/**
 * Parses #define macros and constant/variable declarations into a name-to-value map.
 * E.g. #define LED 2, const int BUTTON = 4, int pin = 15, byte x = 12
 */
export function parseCppConstants(code: string): Map<string, number> {
  const constants = new Map<string, number>();
  const cleaned = stripCppIncludes(stripCppComments(code));

  // Match #define NAME VALUE (e.g. #define LED_PIN 2 or #define PIN GPIO_NUM_4)
  const definePattern = /#define\s+([A-Za-z_]\w*)\s+([A-Za-z0-9_-]+)/g;
  for (const match of cleaned.matchAll(definePattern)) {
    const name = match[1];
    const valStr = match[2];
    const gpioMatch = valStr.match(/^GPIO_NUM_(\d+)$/i);
    if (gpioMatch) {
      constants.set(name, Number(gpioMatch[1]));
    } else if (/^-?\d+$/.test(valStr)) {
      constants.set(name, Number(valStr));
    }
  }

  // Match variable declarations: [const] [unsigned] (int|long|byte|char|uint8_t|uint16_t|auto) NAME = VALUE;
  const declPattern = /\b(?:const\s+)?(?:unsigned\s+)?(?:int|long|byte|char|uint8_t|uint16_t|auto)\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z0-9_]+)\s*;/g;
  for (const match of cleaned.matchAll(declPattern)) {
    const name = match[1];
    const valStr = match[2];
    const gpioMatch = valStr.match(/^GPIO_NUM_(\d+)$/i);
    if (gpioMatch) {
      constants.set(name, Number(gpioMatch[1]));
    } else if (/^-?\d+$/.test(valStr)) {
      constants.set(name, Number(valStr));
    } else if (constants.has(valStr)) {
      constants.set(name, constants.get(valStr)!);
    }
  }

  return constants;
}

/**
 * Extracts the body of a void function (e.g. void setup() or void loop())
 * using brace-depth counting. Returns null if function is not defined.
 */
export function extractCppFunctionBody(code: string, functionName: string): string | null {
  const match = new RegExp(`(?:void|int|bool|uint8_t|byte)\\s+(?:IRAM_ATTR\\s+)?${functionName}\\s*\\([^)]*\\)\\s*\\{|IRAM_ATTR\\s+(?:void|int|bool)\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`).exec(code);
  if (!match) return null;

  const bodyStart = match.index + match[0].length;
  let depth = 1;
  for (let idx = bodyStart; idx < code.length; idx++) {
    if (code[idx] === "{") depth++;
    if (code[idx] === "}") depth--;
    if (depth === 0) {
      return code.slice(bodyStart, idx);
    }
  }
  return null;
}

/** Resolves an argument token to a valid ESP32 GPIO pin number or null. */
export function resolveCppPinNumber(token: string, constants: Map<string, number>): number | null {
  const trimmed = token.trim();
  const gpioMatch = trimmed.match(/^GPIO_NUM_(\d+)$/i);
  if (gpioMatch) return Number(gpioMatch[1]);
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (constants.has(trimmed)) return constants.get(trimmed)!;

  // Standard Arduino ESP32 analog pin constants (A0, A3-A7, A10-A19)
  const aMatch = trimmed.match(/^A(\d+)$/i);
  if (aMatch) {
    const aNum = Number(aMatch[1]);
    const ESP32_A_MAP: Record<number, number> = {
      0: 36, 3: 39, 4: 32, 5: 33, 6: 34, 7: 35,
      10: 4, 11: 0, 12: 2, 13: 15, 14: 13, 15: 12, 16: 14, 17: 27, 18: 25, 19: 26,
    };
    if (ESP32_A_MAP[aNum] !== undefined) return ESP32_A_MAP[aNum];
  }
  return null;
}

/** Checks if a pin is one of the ESP32 input-only GPI pins (GPIO34, 35, 36, 39). */
export function isEsp32InputOnlyPin(pin: number): boolean {
  return pin === 34 || pin === 35 || pin === 36 || pin === 39;
}

/** Checks if a pin is in the ESP32 internal SPI flash reserved range (GPIO6-11). */
export function isEsp32ReservedFlashPin(pin: number): boolean {
  return pin >= 6 && pin <= 11;
}

/** Valid ESP32 ADC pins (ADC1: 32-39; ADC2: 0, 2, 4, 12-15, 25-27, excluding flash 6-11). */
export const ESP32_ADC_VALID_PINS = new Set([
  0, 2, 4,
  12, 13, 14, 15,
  25, 26, 27,
  32, 33, 34, 35, 36, 37, 38, 39,
]);

/** Checks if a GPIO pin is ADC capable on ESP32. */
export function isEsp32AdcPin(pin: number): boolean {
  return ESP32_ADC_VALID_PINS.has(pin);
}

/**
 * Strips all if/else conditional blocks from a code snippet, leaving only
 * unconditional (top-level) statements. Used to avoid extracting writes that
 * are inside conditional branches as if they were static initial pin states.
 */
function stripAllConditionalBlocks(code: string): string {
  let result = "";
  let i = 0;
  while (i < code.length) {
    const ifIdx = code.indexOf("if", i);
    if (ifIdx === -1) {
      result += code.slice(i);
      break;
    }
    // Ensure word boundary before and after 'if'
    const isStart = ifIdx === 0 || /[\s;{}(!]/.test(code[ifIdx - 1]);
    const afterIf = ifIdx + 2;
    const isEnd = afterIf < code.length && /[\s(]/.test(code[afterIf]);
    if (!isStart || !isEnd) {
      result += code.slice(i, afterIf);
      i = afterIf;
      continue;
    }
    // Emit code before the `if`
    result += code.slice(i, ifIdx);
    // Skip condition: find matching ')'
    const parenOpen = code.indexOf("(", afterIf);
    if (parenOpen === -1) { i = afterIf; continue; }
    let depth = 1;
    let condEnd = parenOpen + 1;
    while (condEnd < code.length && depth > 0) {
      if (code[condEnd] === "(") depth++;
      else if (code[condEnd] === ")") depth--;
      condEnd++;
    }
    // Skip then-block
    const thenBrace = code.indexOf("{", condEnd);
    if (thenBrace === -1) { i = condEnd; continue; }
    let bdepth = 1;
    let thenEnd = thenBrace + 1;
    while (thenEnd < code.length && bdepth > 0) {
      if (code[thenEnd] === "{") bdepth++;
      else if (code[thenEnd] === "}") bdepth--;
      thenEnd++;
    }
    // Optionally skip else-block
    let nextIdx = thenEnd;
    const afterThen = code.slice(thenEnd);
    const elseM = afterThen.match(/^\s*else\b/);
    if (elseM) {
      const elseStart = thenEnd + elseM[0].length;
      const elseBrace = code.indexOf("{", elseStart);
      if (elseBrace !== -1) {
        let edepth = 1;
        let elseEnd = elseBrace + 1;
        while (elseEnd < code.length && edepth > 0) {
          if (code[elseEnd] === "{") edepth++;
          else if (code[elseEnd] === "}") edepth--;
          elseEnd++;
        }
        nextIdx = elseEnd;
      } else {
        // Single-statement else (no braces): skip to semicolon
        const semi = code.indexOf(";", elseStart);
        nextIdx = semi !== -1 ? semi + 1 : code.length;
      }
    }
    i = nextIdx;
  }
  return result;
}

/**
 * Parses Arduino C++ source code for ESP32 GPIO statements.
 * Returns normalized Esp32GpioAction objects for valid output & input configurations.
 */
export function parseEsp32CppGpioActions(code: string): Esp32GpioAction[] {
  if (!code || typeof code !== "string") return [];

  const adapter = getBoardAdapter("esp32");
  const cleaned = stripCppIncludes(stripCppComments(code));
  const constants = parseCppConstants(code);

  const actions: Esp32GpioAction[] = [];
  const registeredReads = new Set<number>();
  const registeredAdcReads = new Set<number>();
  const declaredOutputPins = new Set<number>();

  // Determine code blocks to inspect: setup() and loop(), or full code if no functions defined.
  // For loop(), strip all if/else blocks so that conditional digitalWrite calls inside branches
  // are not mistakenly treated as unconditional static initial pin states (flash-then-off bug fix).
  const setupBody = extractCppFunctionBody(cleaned, "setup");
  const rawLoopBody = extractCppFunctionBody(cleaned, "loop");
  const loopBody = rawLoopBody !== null ? stripAllConditionalBlocks(rawLoopBody) : null;
  const codeBlocks = setupBody || loopBody ? [setupBody ?? "", loopBody ?? ""] : [cleaned];

  // isSetupBlock: when setupBody exists, index 0 is always setup(), index 1 is loop().
  // When neither setup nor loop exist we fall through to full-code scanning (no tagging needed).
  const hasNamedFunctions = !!(setupBody || loopBody);

  for (const [blockIdx, block] of codeBlocks.entries()) {
    const isSetupBlock = hasNamedFunctions && blockIdx === 0;
    if (!block.trim()) continue;

    // 1. Match pinMode(pin, OUTPUT | INPUT | INPUT_PULLUP)
    const pinModeRegex = /pinMode\s*\(\s*([^,\s)]+)\s*,\s*([A-Za-z0-9_]+)\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = pinModeRegex.exec(block)) !== null) {
      const pinToken = match[1];
      const mode = match[2].toUpperCase();
      const pinNum = resolveCppPinNumber(pinToken, constants);

      if (pinNum === null) continue;

      if (isEsp32ReservedFlashPin(pinNum)) {
        actions.push({
          type: "gpio_write",
          pin: pinNum,
          value: 0,
          warning: `Warning: Invalid or reserved SPI flash pin GPIO ${pinNum} configured as ${mode}.`,
        });
        continue;
      }

      if (mode === "OUTPUT") {
        if (isEsp32InputOnlyPin(pinNum)) {
          actions.push({
            type: "gpio_write",
            pin: pinNum,
            value: 0,
            warning: `ValueError: Pin(${pinNum}) doesn't have an output driver (input-only pin).`,
          });
          continue;
        }
        declaredOutputPins.add(pinNum);
      } else if (mode === "INPUT_PULLUP") {
        registeredReads.add(pinNum);
        actions.push({
          type: "gpio_read",
          pin: pinNum,
          pull: "up",
        });
      } else if (mode === "INPUT") {
        registeredReads.add(pinNum);
        actions.push({
          type: "gpio_read",
          pin: pinNum,
          pull: "none",
        });
      }
    }


    // 2. Match digitalWrite(pin, HIGH | LOW | 1 | 0 | const)
    const digitalWriteRegex = /digitalWrite\s*\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*\)/g;
    while ((match = digitalWriteRegex.exec(block)) !== null) {
      const pinToken = match[1];
      const valToken = match[2].toUpperCase();
      const pinNum = resolveCppPinNumber(pinToken, constants);

      if (pinNum === null) continue;

      if (isEsp32ReservedFlashPin(pinNum)) {
        actions.push({
          type: "gpio_write",
          pin: pinNum,
          value: 0,
          warning: `Forbidden GPIO ${pinNum} reserved for internal SPI flash memory.`,
        });
        continue;
      }

      if (isEsp32InputOnlyPin(pinNum)) {
        actions.push({
          type: "gpio_write",
          pin: pinNum,
          value: 0,
          warning: `ValueError: Pin(${pinNum}) doesn't have an output driver (input-only pin).`,
        });
        continue;
      }

      let val: 0 | 1 = 0;
      if (valToken === "HIGH" || valToken === "1") {
        val = 1;
      } else if (valToken === "LOW" || valToken === "0") {
        val = 0;
      } else {
        const resolvedVal = constants.get(match[2].trim());
        val = resolvedVal === 1 ? 1 : 0;
      }

      declaredOutputPins.add(pinNum);
      actions.push({
        type: "gpio_write",
        pin: pinNum,
        value: val,
        ...(isSetupBlock ? { fromSetup: true as const } : {}),
      });
    }

    // 3. Match digitalRead(pin) to ensure gpio_read is registered even if pinMode was omitted
    const digitalReadRegex = /digitalRead\s*\(\s*([^,\s)]+)\s*\)/g;
    while ((match = digitalReadRegex.exec(block)) !== null) {
      const pinToken = match[1];
      const pinNum = resolveCppPinNumber(pinToken, constants);
      if (pinNum !== null && !isEsp32ReservedFlashPin(pinNum) && !registeredReads.has(pinNum)) {
        registeredReads.add(pinNum);
        actions.push({
          type: "gpio_read",
          pin: pinNum,
          pull: "none",
        });
      }
    }

    // 4. Match analogWrite(pin, val) and ledcWrite(pin, val)
    const analogWriteRegex = /(?:analogWrite|ledcWrite)\s*\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*\)/g;
    while ((match = analogWriteRegex.exec(block)) !== null) {
      const pinToken = match[1];
      const valToken = match[2].trim();
      const pinNum = resolveCppPinNumber(pinToken, constants);

      if (pinNum === null) continue;

      if (isEsp32ReservedFlashPin(pinNum)) {
        actions.push({
          type: "pwm_write",
          pin: pinNum,
          dutyPercent: 0,
          dutyU16: 0,
          warning: `Forbidden GPIO ${pinNum} reserved for internal SPI flash memory.`,
        });
        continue;
      }

      if (isEsp32InputOnlyPin(pinNum)) {
        actions.push({
          type: "pwm_write",
          pin: pinNum,
          dutyPercent: 0,
          dutyU16: 0,
          warning: `ValueError: Pin(${pinNum}) doesn't have an output driver (input-only pin).`,
        });
        continue;
      }

      let numVal = 0;
      if (/^\d+$/.test(valToken)) {
        numVal = Number(valToken);
      } else if (constants.has(valToken)) {
        numVal = constants.get(valToken)!;
      }

      const clampedVal = Math.max(0, Math.min(255, numVal));
      const dutyPercent = Math.round(((clampedVal / 255) * 100) * 10) / 10;
      const dutyU16 = Math.round((clampedVal / 255) * 65535);

      declaredOutputPins.add(pinNum);
      actions.push({
        type: "pwm_write",
        pin: pinNum,
        dutyPercent,
        dutyU16,
        freqHz: 1000,
      });
    }

    // 5. Match analogRead(pin)
    const analogReadRegex = /analogRead\s*\(\s*([^,\s)]+)\s*\)/g;
    while ((match = analogReadRegex.exec(block)) !== null) {
      const pinToken = match[1];
      const pinNum = resolveCppPinNumber(pinToken, constants);
      if (pinNum === null || registeredAdcReads.has(pinNum)) continue;

      if (isEsp32ReservedFlashPin(pinNum)) {
        actions.push({
          type: "adc_read",
          pin: pinNum,
          resolution: "10bit",
          warning: `Forbidden GPIO ${pinNum} reserved for internal SPI flash memory.`,
        });
        registeredAdcReads.add(pinNum);
        continue;
      }

      if (!isEsp32AdcPin(pinNum)) {
        actions.push({
          type: "adc_read",
          pin: pinNum,
          resolution: "10bit",
          warning: `Warning: GPIO ${pinNum} is not an ADC-capable pin on ESP32.`,
        });
        registeredAdcReads.add(pinNum);
        continue;
      }

      registeredAdcReads.add(pinNum);
      actions.push({
        type: "adc_read",
        pin: pinNum,
        resolution: "10bit",
      });
    }
  }

  return actions;
}

/**
 * Extracts all analogRead pin declarations from ESP32 C++ code.
 */
export function parseEsp32CppAdcActions(code: string): Esp32AdcAction[] {
  const actions = parseEsp32CppGpioActions(code);
  return actions.filter((a): a is Esp32AdcAction => a.type === "adc_read");
}
