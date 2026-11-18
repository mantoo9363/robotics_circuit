/**
 * ESP32 MicroPython GPIO Parser (Output + Input + PWM)
 *
 * Regex/pattern matchers for ESP32 MicroPython GPIO syntax:
 *
 * OUTPUT (Phase 1 — unchanged):
 *   - Pin(pin, Pin.OUT) or Pin(pin, mode=Pin.OUT)
 *   - pin_var.value(1 | 0)
 *   - pin_var.on() / pin_var.off()
 *   - Pin(pin, Pin.OUT, value=1 | 0)
 *
 * INPUT (Phase 2 — added):
 *   - Pin(pin, Pin.IN)
 *   - Pin(pin, Pin.IN, Pin.PULL_UP)
 *   - Pin(pin, Pin.IN, Pin.PULL_DOWN)
 *   - pin_var.value() — zero-arg read call, emits gpio_read action
 *
 * PWM OUTPUT (Phase 2 Slice 2 — added now):
 *   - pwm = PWM(Pin(pin))                    → construction
 *   - pwm.freq(1000)                         → optional freq setting
 *   - pwm.duty(512)                          → duty 0-1023 (10-bit), normalized to dutyPercent
 *   - pwm.duty_u16(32768)                    → duty 0-65535, normalized to dutyPercent
 *   - Inline: PWM(Pin(pin)).duty_u16(n)      → also supported (Blockly analog_write output)
 *
 * Reuses Esp32BoardAdapter pin range validation (GPIO0-39 excluding 6-11).
 * Emits normalized Esp32GpioWriteAction (gpio_write), Esp32GpioReadAction (gpio_read),
 * or Esp32PwmAction (pwm_write).
 */

import { getBoardAdapter } from "../../circuit/boardAdapter";
import type { Esp32GpioAction, Esp32GpioReadAction, Esp32PwmAction, Esp32AdcAction } from "./cppPatterns";


/**
 * Parses MicroPython source code for ESP32 GPIO digital output statements.
 * Returns normalized Esp32GpioAction objects.
 */
export function parseEsp32PythonGpioActions(code: string): Esp32GpioAction[] {
  if (!code || typeof code !== "string") return [];

  const adapter = getBoardAdapter("esp32");
  const actions: Esp32GpioAction[] = [];
  const varToPin = new Map<string, number>();

  // Pattern 1: pin_var = Pin(2, Pin.OUT) or Pin(2, Pin.OUT, value=1)
  const pinDeclRegex = /(?:([a-zA-Z_]\w*)\s*=\s*)?Pin\s*\(\s*(\d+)\s*,\s*(?:mode\s*=\s*)?Pin\.OUT(?:\s*,\s*value\s*=\s*([01]))?\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = pinDeclRegex.exec(code)) !== null) {
    const varName = match[1];
    const rawPin = match[2];
    const initialVal = match[3];
    const pinDef = adapter.parseHandleToPinNumber(`gpio${rawPin}`);

    if (pinDef === null) {
      actions.push({
        type: "gpio_write",
        pin: Number(rawPin),
        value: 0,
        warning: `Forbidden GPIO ${rawPin} reserved for internal SPI flash memory.`,
      });
      continue;
    }

    const isInputOnly =
      pinDef.pinNumber === 34 ||
      pinDef.pinNumber === 35 ||
      pinDef.pinNumber === 36 ||
      pinDef.pinNumber === 39;

    if (isInputOnly) {
      actions.push({
        type: "gpio_write",
        pin: pinDef.pinNumber,
        value: 0,
        warning: `GPIO ${pinDef.pinNumber} is input-only and cannot be configured as OUTPUT.`,
      });
      continue;
    }

    if (varName) {
      varToPin.set(varName, pinDef.pinNumber);
    }

    if (initialVal !== undefined) {
      actions.push({
        type: "gpio_write",
        pin: pinDef.pinNumber,
        value: Number(initialVal) as 0 | 1,
      });
    }
  }

  // Pattern 2: varName.value(1 | 0) or varName.on() / varName.off()
  const pinMethodRegex = /([a-zA-Z_]\w*)\s*\.\s*(value|on|off)\s*\(\s*([01])?\s*\)/gi;

  while ((match = pinMethodRegex.exec(code)) !== null) {
    const varName = match[1];
    const method = match[2].toLowerCase();
    const argVal = match[3];

    let targetPin = varToPin.get(varName);

    // Fallback: if varName is named like pin_2, gp2, or gpio2
    if (targetPin === undefined) {
      const matchPin = varName.match(/^(?:pin_|gp|gpio)?(\d+)$/i);
      if (matchPin) {
        const pinDef = adapter.parseHandleToPinNumber(`gpio${matchPin[1]}`);
        if (pinDef) targetPin = pinDef.pinNumber;
      }
    }

    if (targetPin === undefined) continue;

    const isTargetInputOnly =
      targetPin === 34 || targetPin === 35 || targetPin === 36 || targetPin === 39;
    if (isTargetInputOnly) continue;

    let val: 0 | 1 = 0;
    if (method === "on") {
      val = 1;
    } else if (method === "off") {
      val = 0;
    } else if (method === "value") {
      val = argVal === "1" ? 1 : 0;
    }

    actions.push({
      type: "gpio_write",
      pin: targetPin,
      value: val,
    });
  }

  // Pattern 3: Inline Direct Write: Pin(2, Pin.OUT).value(1) or .on() / .off()
  const inlineWriteRegex = /Pin\s*\(\s*(\d+)\s*,\s*Pin\.OUT\s*\)\s*\.\s*(value|on|off)\s*\(\s*([01])?\s*\)/gi;

  while ((match = inlineWriteRegex.exec(code)) !== null) {
    const rawPin = match[1];
    const method = match[2].toLowerCase();
    const argVal = match[3];
    const pinDef = adapter.parseHandleToPinNumber(`gpio${rawPin}`);

    if (pinDef === null) {
      actions.push({
        type: "gpio_write",
        pin: Number(rawPin),
        value: 0,
        warning: `Forbidden GPIO ${rawPin} reserved for internal SPI flash memory.`,
      });
      continue;
    }

    const isInputOnly =
      pinDef.pinNumber === 34 ||
      pinDef.pinNumber === 35 ||
      pinDef.pinNumber === 36 ||
      pinDef.pinNumber === 39;

    if (isInputOnly) {
      actions.push({
        type: "gpio_write",
        pin: pinDef.pinNumber,
        value: 0,
        warning: `GPIO ${pinDef.pinNumber} is input-only and cannot be configured as OUTPUT.`,
      });
      continue;
    }

    let val: 0 | 1 = 0;
    if (method === "on") val = 1;
    else if (method === "off") val = 0;
    else if (method === "value") val = argVal === "1" ? 1 : 0;

    actions.push({
      type: "gpio_write",
      pin: pinDef.pinNumber,
      value: val,
    });
  }

  return actions;
}

/**
 * Parses MicroPython source code for ESP32 GPIO digital INPUT declarations.
 * Detects Pin(x, Pin.IN), Pin(x, Pin.IN, Pin.PULL_UP/PULL_DOWN).
 * A zero-argument varName.value() call also emits a gpio_read action.
 * Returns normalized Esp32GpioReadAction objects.
 */
export function parseEsp32PythonGpioReadActions(code: string): Esp32GpioReadAction[] {
  if (!code || typeof code !== "string") return [];

  const adapter = getBoardAdapter("esp32");
  const actions: Esp32GpioReadAction[] = [];
  const varToPin = new Map<string, { pinNumber: number; pull: "none" | "up" | "down" }>();

  // Pattern: btn = Pin(4, Pin.IN) or Pin(4, Pin.IN, Pin.PULL_UP) or Pin(4, Pin.IN, Pin.PULL_DOWN)
  // Group 1: optional var name, Group 2: pin number, Group 3: optional PULL_UP/PULL_DOWN
  const pinInRegex =
    /(?:([a-zA-Z_]\w*)\s*=\s*)?Pin\s*\(\s*(\d+)\s*,\s*(?:mode\s*=\s*)?Pin\.IN(?:\s*,\s*Pin\.(PULL_UP|PULL_DOWN))?\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = pinInRegex.exec(code)) !== null) {
    const varName = match[1];
    const rawPin = match[2];
    const pullRaw = match[3]; // "PULL_UP" | "PULL_DOWN" | undefined
    const pinDef = adapter.parseHandleToPinNumber(`gpio${rawPin}`);

    if (pinDef === null) {
      actions.push({
        type: "gpio_read",
        pin: Number(rawPin),
        pull: "none",
        warning: `Forbidden GPIO ${rawPin} reserved for internal SPI flash memory.`,
      });
      continue;
    }

    const pull: "none" | "up" | "down" =
      pullRaw === "PULL_UP" ? "up" : pullRaw === "PULL_DOWN" ? "down" : "none";

    if (varName) {
      varToPin.set(varName, { pinNumber: pinDef.pinNumber, pull });
    }

    actions.push({
      type: "gpio_read",
      pin: pinDef.pinNumber,
      pull,
    });
  }

  // Pattern: zero-arg varName.value() call = gpio_read (no argument means READ not WRITE)
  const readCallRegex = /([a-zA-Z_]\w*)\s*\.\s*value\s*\(\s*\)/gi;

  while ((match = readCallRegex.exec(code)) !== null) {
    const varName = match[1];
    const pinInfo = varToPin.get(varName);
    if (!pinInfo) continue; // Only emit if we saw the corresponding Pin.IN declaration

    // Avoid duplicate: only add if not already emitted for this pin
    const alreadyEmitted = actions.some(
      (a) => a.type === "gpio_read" && a.pin === pinInfo.pinNumber,
    );
    if (!alreadyEmitted) {
      actions.push({
        type: "gpio_read",
        pin: pinInfo.pinNumber,
        pull: pinInfo.pull,
      });
    }
  }

  return actions;
}

/**
 * Parses MicroPython source code for ESP32 PWM output statements.
 *
 * Handles two duty APIs (both normalized to 0–100 dutyPercent):
 *   - duty(0-1023):   10-bit ESP32 hardware default  → dutyPercent = value / 1023 * 100
 *   - duty_u16(0-65535): 16-bit MicroPython standard → dutyPercent = value / 65535 * 100
 *
 * duty_ns is intentionally NOT supported — it requires a known frequency to convert
 * to a meaningful duty percent, and freq defaults are not reliably inferrable. Flag
 * this as a known gap if encountered.
 *
 * Supports:
 *   - Named var form: `pwm = PWM(Pin(2)); pwm.freq(1000); pwm.duty(512)`
 *   - Inline form:    `PWM(Pin(2)).duty_u16(32768)` (Blockly analog_write output)
 *   - Inline + freq:  `PWM(Pin(2), freq=50).duty_u16(n)` (Blockly servo_write output)
 *
 * Returns normalized Esp32PwmAction objects.
 */
export function parseEsp32PythonPwmActions(code: string): Esp32PwmAction[] {
  if (!code || typeof code !== "string") return [];

  const adapter = getBoardAdapter("esp32");
  const actions: Esp32PwmAction[] = [];

  // Track: varName -> { pin, freqHz }
  const pwmVarToPin = new Map<string, { pin: number; freqHz?: number }>();

  // Pattern 1: Named var PWM construction
  // e.g. pwm = PWM(Pin(2)) or pwm = PWM(Pin(2), freq=1000, duty=512) or pwm = PWM(Pin(2), duty_u16=32768)
  const pwmDeclRegex =
    /([a-zA-Z_]\w*)\s*=\s*PWM\s*\(\s*Pin\s*\(\s*(\d+)\s*\)([^)]*)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = pwmDeclRegex.exec(code)) !== null) {
    const varName = match[1];
    const rawPin  = match[2];
    const restArgs = match[3] ?? "";
    const pinDef  = adapter.parseHandleToPinNumber(`gpio${rawPin}`);

    if (pinDef === null) {
      actions.push({
        type: "pwm_write",
        pin: Number(rawPin),
        dutyPercent: 0,
        dutyU16: 0,
        warning: `Forbidden GPIO ${rawPin} reserved for internal SPI flash memory.`,
      });
      continue;
    }

    const freqMatch = /freq\s*=\s*(\d+)/i.exec(restArgs);
    const freqArg = freqMatch ? Number(freqMatch[1]) : undefined;

    pwmVarToPin.set(varName, { pin: pinDef.pinNumber, freqHz: freqArg });

    // Check if duty or duty_u16 is specified directly in the constructor
    const duty10Match = /\bduty\s*=\s*(\d+)/i.exec(restArgs);
    const duty16Match = /\bduty_u16\s*=\s*(\d+)/i.exec(restArgs);

    if (duty10Match) {
      const rawDuty = Number(duty10Match[1]);
      const clamped = Math.max(0, Math.min(1023, rawDuty));
      const dutyPercent = Math.round((clamped / 1023) * 100 * 10) / 10;
      const dutyU16 = Math.round((clamped / 1023) * 65535);
      actions.push({
        type: "pwm_write",
        pin: pinDef.pinNumber,
        dutyPercent,
        dutyU16,
        ...(freqArg !== undefined ? { freqHz: freqArg } : {}),
      });
    } else if (duty16Match) {
      const rawDuty = Number(duty16Match[1]);
      const clamped = Math.max(0, Math.min(65535, rawDuty));
      const dutyPercent = Math.round((clamped / 65535) * 100 * 10) / 10;
      actions.push({
        type: "pwm_write",
        pin: pinDef.pinNumber,
        dutyPercent,
        dutyU16: clamped,
        ...(freqArg !== undefined ? { freqHz: freqArg } : {}),
      });
    }
  }

  // Pattern 2: Named var .freq(n) call (sets/updates freqHz on existing entry)
  const freqCallRegex = /([a-zA-Z_]\w*)\s*\.\s*freq\s*\(\s*(\d+)\s*\)/gi;
  while ((match = freqCallRegex.exec(code)) !== null) {
    const varName = match[1];
    const freqHz  = Number(match[2]);
    const entry   = pwmVarToPin.get(varName);
    if (entry) entry.freqHz = freqHz;
  }

  // Pattern 3: Named var duty calls
  // pwm.duty(512) — 10-bit (0-1023)
  const duty10Regex = /([a-zA-Z_]\w*)\s*\.\s*duty\s*\(\s*(\d+)\s*\)/gi;
  while ((match = duty10Regex.exec(code)) !== null) {
    const varName  = match[1];
    const rawDuty  = Number(match[2]);
    const entry    = pwmVarToPin.get(varName);
    if (!entry) continue;

    const clamped    = Math.max(0, Math.min(1023, rawDuty));
    const dutyPercent = Math.round((clamped / 1023) * 100 * 10) / 10; // 1 decimal
    const dutyU16    = Math.round((clamped / 1023) * 65535);
    actions.push({
      type: "pwm_write",
      pin: entry.pin,
      dutyPercent,
      dutyU16,
      ...(entry.freqHz !== undefined ? { freqHz: entry.freqHz } : {}),
    });
  }

  // pwm.duty_u16(32768) — 16-bit (0-65535)
  const duty16Regex = /([a-zA-Z_]\w*)\s*\.\s*duty_u16\s*\(\s*(\d+)\s*\)/gi;
  while ((match = duty16Regex.exec(code)) !== null) {
    const varName  = match[1];
    const rawDuty  = Number(match[2]);
    const entry    = pwmVarToPin.get(varName);
    if (!entry) continue;

    const clamped    = Math.max(0, Math.min(65535, rawDuty));
    const dutyPercent = Math.round((clamped / 65535) * 100 * 10) / 10;
    actions.push({
      type: "pwm_write",
      pin: entry.pin,
      dutyPercent,
      dutyU16: clamped,
      ...(entry.freqHz !== undefined ? { freqHz: entry.freqHz } : {}),
    });
  }

  // Pattern 4: Inline form — PWM(Pin(2)).duty_u16(n) or PWM(Pin(2), freq=50).duty_u16(n)
  // Covers Blockly analog_write + servo_write generated code
  const inlineDuty16Regex =
    /PWM\s*\(\s*Pin\s*\(\s*(\d+)\s*\)(?:\s*,\s*freq\s*=\s*(\d+))?\s*\)\s*\.\s*duty_u16\s*\(\s*(\d+)\s*\)/gi;
  while ((match = inlineDuty16Regex.exec(code)) !== null) {
    const rawPin   = match[1];
    const freqArg  = match[2] ? Number(match[2]) : undefined;
    const rawDuty  = Number(match[3]);
    const pinDef   = adapter.parseHandleToPinNumber(`gpio${rawPin}`);

    if (pinDef === null) {
      actions.push({
        type: "pwm_write",
        pin: Number(rawPin),
        dutyPercent: 0,
        dutyU16: 0,
        warning: `Forbidden GPIO ${rawPin} reserved for internal SPI flash memory.`,
      });
      continue;
    }

    const clamped    = Math.max(0, Math.min(65535, rawDuty));
    const dutyPercent = Math.round((clamped / 65535) * 100 * 10) / 10;
    actions.push({
      type: "pwm_write",
      pin: pinDef.pinNumber,
      dutyPercent,
      dutyU16: clamped,
      ...(freqArg !== undefined ? { freqHz: freqArg } : {}),
    });
  }

  // Inline form — PWM(Pin(2)).duty(n)  — 10-bit inline
  const inlineDuty10Regex =
    /PWM\s*\(\s*Pin\s*\(\s*(\d+)\s*\)(?:\s*,\s*freq\s*=\s*(\d+))?\s*\)\s*\.\s*duty\s*\(\s*(\d+)\s*\)/gi;
  while ((match = inlineDuty10Regex.exec(code)) !== null) {
    const rawPin   = match[1];
    const freqArg  = match[2] ? Number(match[2]) : undefined;
    const rawDuty  = Number(match[3]);
    const pinDef   = adapter.parseHandleToPinNumber(`gpio${rawPin}`);

    if (pinDef === null) {
      actions.push({
        type: "pwm_write",
        pin: Number(rawPin),
        dutyPercent: 0,
        dutyU16: 0,
        warning: `Forbidden GPIO ${rawPin} reserved for internal SPI flash memory.`,
      });
      continue;
    }

    const clamped    = Math.max(0, Math.min(1023, rawDuty));
    const dutyPercent = Math.round((clamped / 1023) * 100 * 10) / 10;
    const dutyU16    = Math.round((clamped / 1023) * 65535);
    actions.push({
      type: "pwm_write",
      pin: pinDef.pinNumber,
      dutyPercent,
      dutyU16,
      ...(freqArg !== undefined ? { freqHz: freqArg } : {}),
    });
  }

  return actions;
}

/**
 * Parses MicroPython ADC usage on ESP32.
 *
 * Supported patterns:
 *   adc = ADC(Pin(34))         -- ADC constructor with Pin object
 *   adc = ADC(34)              -- ADC constructor with bare pin number
 *   val = adc.read()           -- 12-bit result (0-4095)
 *   val = adc.read_u16()       -- 16-bit result (0-65535)
 *   val = adc.read_uv()        -- microvolts (0-3_300_000)
 *   adc.atten(ADC.ATTN_11DB)   -- acknowledged, ignored (defaults to full 0-3.3V range)
 *   adc.width(ADC.WIDTH_12BIT) -- acknowledged, ignored
 *
 * Valid ADC pins: GPIO 32-39 (ADC1) + GPIO 0,2,4,12-15,25-27 (ADC2).
 * GPIO 6-11 are forbidden (SPI flash). Other GPIOs emit a warning.
 *
 * Voltage resolution happens in esp32.ts via voltageUtils.collectCircuitSourcesAndSinks.
 */
export function parseEsp32PythonAdcActions(code: string): Esp32AdcAction[] {
  if (!code || typeof code !== "string") return [];

  const adapter = getBoardAdapter("esp32");
  const actions: Esp32AdcAction[] = [];

  // Valid ESP32 ADC pins (ADC1 + ADC2, excluding forbidden SPI flash 6-11)
  const ADC_VALID_PINS = new Set([
    0, 2, 4,
    12, 13, 14, 15,
    25, 26, 27,
    32, 33, 34, 35, 36, 37, 38, 39,
  ]);

  // Step 1: Build var -> pin map from ADC(Pin(X)) or ADC(X)
  const varToPin = new Map<string, number>();

  const adcPinRegex = /([a-zA-Z_]\w*)\s*=\s*ADC\s*\(\s*Pin\s*\(\s*(\d+)\s*\)\s*(?:,\s*atten\s*=\s*[\w.]+\s*)?\)/gi;
  let match: RegExpExecArray | null;
  while ((match = adcPinRegex.exec(code)) !== null) {
    varToPin.set(match[1], Number(match[2]));
  }

  const adcBareRegex = /([a-zA-Z_]\w*)\s*=\s*ADC\s*\(\s*(\d+)\s*\)/gi;
  while ((match = adcBareRegex.exec(code)) !== null) {
    if (!varToPin.has(match[1])) varToPin.set(match[1], Number(match[2]));
  }

  // Step 2: Scan .read() / .read_u16() / .read_uv() calls
  const readRegex = /([a-zA-Z_]\w*)\s*\.\s*(read(?:_u16|_uv)?)\s*\(\s*\)/gi;
  while ((match = readRegex.exec(code)) !== null) {
    const varName = match[1];
    const method  = match[2].toLowerCase();
    if (!varToPin.has(varName)) continue;

    const rawPin = varToPin.get(varName)!;

    if (rawPin >= 6 && rawPin <= 11) {
      actions.push({ type: "adc_read", pin: rawPin, resolution: "12bit",
        warning: `Forbidden GPIO ${rawPin} reserved for SPI flash -- ADC read ignored.` });
      continue;
    }

    if (adapter.parseHandleToPinNumber(`gpio${rawPin}`) === null) {
      actions.push({ type: "adc_read", pin: rawPin, resolution: "12bit",
        warning: `GPIO ${rawPin} is outside valid ESP32 range (0-39) -- ADC read ignored.` });
      continue;
    }

    if (!ADC_VALID_PINS.has(rawPin)) {
      actions.push({ type: "adc_read", pin: rawPin, resolution: "12bit",
        warning: `GPIO ${rawPin} is not a standard ADC pin -- result may be unreliable.` });
      continue;
    }

    const resolution: Esp32AdcAction["resolution"] =
      method === "read_u16" ? "16bit" : method === "read_uv" ? "uv" : "12bit";

    actions.push({ type: "adc_read", pin: rawPin, resolution });
  }

  return actions;
}

export interface Esp32UltrasonicAction {
  type: "ultrasonic_read";
  triggerPin?: number;
  echoPin?: number;
}

/**
 * Parses MicroPython source code for ESP32 Ultrasonic Distance Sensor usage.
 * Extracts trigger & echo pins from Pin(X, Pin.OUT) / Pin(Y, Pin.IN) declarations,
 * time_pulse_us(echo, 1), or HCSR04(trigger_pin=X, echo_pin=Y) constructor calls.
 * Uses unclaimed pin pairing to correctly isolate multi-sensor setups.
 */
export function parseEsp32PythonUltrasonicActions(code: string): Esp32UltrasonicAction[] {
  if (!code || typeof code !== "string") return [];

  const adapter = getBoardAdapter("esp32");
  const actions: Esp32UltrasonicAction[] = [];

  // Track ordered declarations: { varName, pin, mode, claimed }
  const outDecls: Array<{ varName: string; pin: number; claimed: boolean }> = [];
  const inDecls: Array<{ varName: string; pin: number }> = [];

  // Step 1: Parse Pin declarations in source order
  const pinDeclRegex = /(?:([a-zA-Z_]\w*)\s*=\s*)?Pin\s*\(\s*(\d+)\s*,\s*(?:mode\s*=\s*)?Pin\.(OUT|IN)/gi;
  let match: RegExpExecArray | null;
  while ((match = pinDeclRegex.exec(code)) !== null) {
    const varName = match[1];
    const pinNum = Number(match[2]);
    const mode = match[3].toUpperCase() as "IN" | "OUT";
    const pinDef = adapter.parseHandleToPinNumber(`gpio${pinNum}`);
    if (pinDef !== null && varName) {
      if (mode === "OUT") {
        outDecls.push({ varName, pin: pinDef.pinNumber, claimed: false });
      } else {
        inDecls.push({ varName, pin: pinDef.pinNumber });
      }
    }
  }

  // Step 2: Parse HCSR04(trigger_pin=X, echo_pin=Y) constructor calls (explicit pairing)
  const hcsr04Regex = /HCSR04\s*\(\s*(?:trigger_pin\s*=\s*(\d+)|\s*(\d+))\s*,\s*(?:echo_pin\s*=\s*(\d+)|\s*(\d+))\s*\)/gi;
  while ((match = hcsr04Regex.exec(code)) !== null) {
    const trigPin = Number(match[1] || match[2]);
    const echoPin = Number(match[3] || match[4]);
    const trigDef = adapter.parseHandleToPinNumber(`gpio${trigPin}`);
    const echoDef = adapter.parseHandleToPinNumber(`gpio${echoPin}`);
    if (trigDef && echoDef) {
      actions.push({ type: "ultrasonic_read", triggerPin: trigDef.pinNumber, echoPin: echoDef.pinNumber });
    }
  }

  // Helper to extract trailing index number from variable name (e.g., trig1 -> 1)
  const getVarIndex = (name: string): string | null => {
    const m = name.match(/(\d+)$/);
    return m ? m[1] : null;
  };

  // Step 3: Parse time_pulse_us(echo_var_or_num, 1) calls
  const pulseRegex = /time_pulse_us\s*\(\s*([a-zA-Z_]\w*|\d+)\s*,\s*([01])(?:\s*,\s*\d+)?\s*\)/gi;
  while ((match = pulseRegex.exec(code)) !== null) {
    const echoArg = match[1];
    const inIndex = inDecls.findIndex((d) => d.varName === echoArg);

    let echoPin: number | undefined;
    let triggerPin: number | undefined;

    if (inIndex !== -1) {
      const inEntry = inDecls[inIndex];
      echoPin = inEntry.pin;
      const echoNumSuffix = getVarIndex(inEntry.varName);

      // Strategy 1: Match by variable suffix number (e.g., trig1 with echo1)
      if (echoNumSuffix !== null) {
        const matchedOut = outDecls.find(
          (o) => !o.claimed && getVarIndex(o.varName) === echoNumSuffix,
        );
        if (matchedOut) {
          triggerPin = matchedOut.pin;
          matchedOut.claimed = true;
        }
      }

      // Strategy 2: If grouped declaration (e.g. trig1, trig2 then echo1, echo2), match by index
      if (triggerPin === undefined && outDecls.length === inDecls.length && outDecls[inIndex] && !outDecls[inIndex].claimed) {
        triggerPin = outDecls[inIndex].pin;
        outDecls[inIndex].claimed = true;
      }

      // Strategy 3: Fallback to first unclaimed OUT pin
      if (triggerPin === undefined) {
        const fallbackOut = outDecls.find((o) => !o.claimed);
        if (fallbackOut) {
          triggerPin = fallbackOut.pin;
          fallbackOut.claimed = true;
        }
      }
    } else if (!isNaN(Number(echoArg))) {
      echoPin = Number(echoArg);
    }

    actions.push({ type: "ultrasonic_read", triggerPin, echoPin });
  }

  return actions;
}

export interface Esp32KeypadAction {
  type: "keypad_read";
  rowPins: number[];
  colPins: number[];
}

/**
 * Parses MicroPython source code for ESP32 Keypad declarations.
 * Detects row and column pin definitions from arrays or Keypad class instantiations:
 *   row_pins = [19, 18, 5, 17] or [Pin(19, Pin.OUT), ...]
 *   col_pins = [16, 4, 0, 2] or [Pin(16, Pin.IN), ...]
 *   Keypad(rows=[19, 18, 5, 17], cols=[16, 4, 0, 2])
 */
export function parseEsp32PythonKeypadActions(code: string): Esp32KeypadAction[] {
  if (!code || typeof code !== "string") return [];

  const adapter = getBoardAdapter("esp32");
  const actions: Esp32KeypadAction[] = [];

  const parsePinList = (text: string): number[] => {
    const pins: number[] = [];
    const pinMatches = text.match(/\b\d+\b/g);
    if (pinMatches) {
      for (const numStr of pinMatches) {
        const p = Number(numStr);
        const pinDef = adapter.parseHandleToPinNumber(`gpio${p}`);
        if (pinDef !== null) {
          pins.push(pinDef.pinNumber);
        }
      }
    }
    return pins;
  };

  // Strategy 1: Keypad(rows=[...], cols=[...]) constructor
  const keypadClassRegex = /Keypad\s*\(\s*rows\s*=\s*\[([^\]]+)\]\s*,\s*cols\s*=\s*\[([^\]]+)\]\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = keypadClassRegex.exec(code)) !== null) {
    const rowPins = parsePinList(match[1]);
    const colPins = parsePinList(match[2]);
    if (rowPins.length > 0 && colPins.length > 0) {
      actions.push({ type: "keypad_read", rowPins, colPins });
    }
  }

  // Strategy 2: row_pins = [...] and col_pins = [...] assignment arrays
  const rowAssignRegex = /(?:row_pins|rows)\s*=\s*\[([^\]]+)\]/i;
  const colAssignRegex = /(?:col_pins|cols)\s*=\s*\[([^\]]+)\]/i;

  const rowMatch = rowAssignRegex.exec(code);
  const colMatch = colAssignRegex.exec(code);

  if (rowMatch && colMatch) {
    const rowPins = parsePinList(rowMatch[1]);
    const colPins = parsePinList(colMatch[1]);
    if (rowPins.length > 0 && colPins.length > 0) {
      const exists = actions.some(
        (a) => a.rowPins.join(",") === rowPins.join(",") && a.colPins.join(",") === colPins.join(","),
      );
      if (!exists) {
        actions.push({ type: "keypad_read", rowPins, colPins });
      }
    }
  }

  return actions;
}

