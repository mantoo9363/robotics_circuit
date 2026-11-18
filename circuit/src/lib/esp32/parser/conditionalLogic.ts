/**
 * ESP32 MicroPython Conditional Logic Evaluator (AST-based)
 *
 * TODO / ARCHITECTURAL CLEANUP NOTE:
 * MicroPythonTokenizer, MicroPythonParser, and MicroPythonInterpreter currently live in
 * src/lib/codeParsing/picoParser.ts despite being 100% board-agnostic AST/tokenization tools.
 * Future cleanup should extract these shared classes into a neutral file
 * (e.g. src/lib/codeParsing/microPythonCore.ts) that both picoParser.ts and conditionalLogic.ts import from.
 *
 * CIRCULAR IMPORT CHECK:
 * picoParser.ts does NOT import anything from src/lib/esp32/* (directly or transitively).
 * This module imports from codeParsing/picoParser, keeping dependency flow strictly uni-directional.
 *
 * FUNCTIONALITY:
 * Reuses Pico's MicroPython AST Engine (Tokenizer -> Parser -> Interpreter) to evaluate conditional
 * control flow statements (e.g. `if btn.value() == 0: led.value(1) else: led.value(0)`) against
 * active ESP32 input pin logic levels (logicHigh: boolean).
 *
 * Supported constructs via AST execution:
 *   - Simple single-pin conditionals: `if pin_var.value() == 0:`, `if pin_var.value() == 1:`
 *   - Truthy / negated reads: `if pin_var.value():`, `if not pin_var.value():`
 *   - Variable reads: `val = pin_var.value()`, followed by `if val == 0: ...`
 *   - `thenBranch` and `elseBranch` output pin writes (`.value(1)`, `.value(0)`, `.on()`, `.off()`)
 *
 * Graceful fallback (unsupported / invalid syntax):
 *   - Catches tokenizer/parser/interpreter errors gracefully and returns an empty action array [].
 */

import {
  MicroPythonTokenizer,
  MicroPythonParser,
  MicroPythonInterpreter,
  type SimSessionState,
} from "../../codeParsing/picoParser";
import { getBoardAdapter } from "../../circuit/boardAdapter";
import type { Esp32GpioAction } from "./cppPatterns";

export function parseEsp32PythonConditionalActions(
  code: string,
  inputStates: Map<number, boolean>,
): Esp32GpioAction[] {
  if (!code || typeof code !== "string" || inputStates.size === 0) {
    return [];
  }
  const trimmedCode = code.trim();

  let tokens;
  try {
    const tokenizer = new MicroPythonTokenizer(trimmedCode);
    tokens = tokenizer.tokenize();
  } catch {
    return [];
  }

  let ast;
  try {
    const parser = new MicroPythonParser(tokens);
    ast = parser.parse();
  } catch {
    return [];
  }

  const state: SimSessionState = {
    code: trimmedCode,
    variables: new Map(),
    pins: new Map(),
    pwm: new Map(),
    lastTimestamp: 100,
    functions: new Map(),
    loopLines: [],
    loopPC: 0,
    loopWaitRemaining: 0,
    timers: [],
    irqs: [],
    virtualFS: new Map(),
    wdtTimeout: 0,
    wdtAccumulator: 0,
    rtcOffset: 0,
    freq: 160000000,
    outputs: [],
    serialLines: [],
    lcdStates: new Map(),
    neopixelStates: new Map(),
    preservePreSeededPinStates: true,
  };

  // Seed resolved input pin logic levels into interpreter memory
  for (const [pinNum, logicHigh] of inputStates.entries()) {
    state.pins.set(pinNum, {
      mode: "INPUT",
      value: logicHigh ? 1 : 0,
    });
  }

  const interpreter = new MicroPythonInterpreter(state);

  // Execute AST (setup statements + loop body)
  try {
    interpreter.execute(ast);
  } catch {
    return [];
  }

  const adapter = getBoardAdapter("esp32");
  const actions: Esp32GpioAction[] = [];

  // Convert output pin state changes into normalized Esp32GpioAction objects
  for (const out of state.outputs) {
    const pinState = state.pins.get(out.pin);
    if (pinState && (pinState.mode === "INPUT" || pinState.mode === "INPUT_PULLUP")) {
      continue;
    }

    const pinDef = adapter.parseHandleToPinNumber(`gpio${out.pin}`);
    if (!pinDef) {
      actions.push({
        type: "gpio_write",
        pin: out.pin,
        value: 0,
        warning: `Forbidden GPIO ${out.pin} reserved for internal SPI flash memory.`,
      });
      continue;
    }

    actions.push({
      type: "gpio_write",
      pin: pinDef.pinNumber,
      value: out.high ? 1 : 0,
    });
  }

  return actions;
}
