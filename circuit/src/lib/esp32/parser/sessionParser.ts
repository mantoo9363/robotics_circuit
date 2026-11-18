/**
 * ESP32 Session Parser (Orchestrator)
 *
 * Routes source code to the correct language parser and merges all
 * normalized Esp32GpioAction items (gpio_write + gpio_read) for the session.
 *
 * C++ path: gpio_write only (Phase 1 — gpio_read for C++ is deferred).
 * Python path: gpio_write (output) + gpio_read (input) merged together.
 */

import { parseEsp32CppGpioActions, type Esp32GpioAction } from "./cppPatterns";
import { parseEsp32PythonGpioActions, parseEsp32PythonGpioReadActions, parseEsp32PythonPwmActions } from "./pythonPatterns";
import { parseEsp32PythonConditionalActions } from "./conditionalLogic";
import { evaluateEsp32CppConditionals } from "./cppConditionalLogic";

/**
 * Parses ESP32 source code according to the active language mode.
 * Returns all normalized gpio_write, gpio_read, and pwm_write actions for this session.
 */
export function parseEsp32SessionActions(
  code: string,
  isPython: boolean,
): Esp32GpioAction[] {
  if (!code || typeof code !== "string") return [];

  if (isPython) {
    // Merge output writes + input declarations + PWM writes into one ordered list
    const writes = parseEsp32PythonGpioActions(code);
    const reads  = parseEsp32PythonGpioReadActions(code);
    const pwm    = parseEsp32PythonPwmActions(code);
    return [...writes, ...reads, ...pwm];
  }
  // C++: returns both gpio_write and gpio_read actions for declared pins
  return parseEsp32CppGpioActions(code);
}

/**
 * Evaluates MicroPython conditional logic against active input pin states.
 * Returns derived gpio_write actions for dependent output pins.
 */
export function evaluateEsp32PythonConditionals(
  code: string,
  inputStates: Map<number, boolean>,
): Esp32GpioAction[] {
  if (!code || typeof code !== "string") return [];
  return parseEsp32PythonConditionalActions(code, inputStates);
}

export { evaluateEsp32CppConditionals };
