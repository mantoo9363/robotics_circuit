/**
 * esp32ConditionalLogic.test.ts
 * Unit tests for ESP32 MicroPython AST-based conditional logic evaluator.
 */

import { parseEsp32PythonConditionalActions } from "../lib/esp32/parser/conditionalLogic";

function run() {
  let pass = 0;
  let fail = 0;

  function assert(label: string, condition: boolean) {
    if (condition) {
      console.log(`  [PASS] ${label}`);
      pass++;
    } else {
      console.error(`  [FAIL] ${label}`);
      fail++;
    }
  }

  console.log("=================== ESP32 CONDITIONAL LOGIC EVALUATOR TESTS ===================");

  // --- TEST 1: Happy path — direct if btn.value() == 0: led.value(1) else: led.value(0) ---
  console.log("\n--- TEST 1: Direct if btn.value() == 0 (Button Pressed -> logicHigh=false) ---");
  {
    const code = `
from machine import Pin
btn = Pin(14, Pin.IN, Pin.PULL_UP)
led = Pin(2, Pin.OUT)
if btn.value() == 0:
    led.value(1)
else:
    led.value(0)
`;
    // Scenario 1A: Button Pressed -> logicHigh = false (0)
    const inputsPressed = new Map<number, boolean>([[14, false]]);
    const actionsPressed = parseEsp32PythonConditionalActions(code, inputsPressed);
    const actPressed = actionsPressed[0];
    assert("Returns 1 output write action when pressed", actionsPressed.length === 1 && actPressed?.type === "gpio_write");
    assert("Output pin = 2", actPressed?.pin === 2);
    assert("Output value = 1 (LED ON)", actPressed?.type === "gpio_write" && actPressed.value === 1);

    // Scenario 1B: Button Released -> logicHigh = true (1)
    const inputsReleased = new Map<number, boolean>([[14, true]]);
    const actionsReleased = parseEsp32PythonConditionalActions(code, inputsReleased);
    const actReleased = actionsReleased[0];
    assert("Returns 1 output write action when released", actionsReleased.length === 1 && actReleased?.type === "gpio_write");
    assert("Output pin = 2", actReleased?.pin === 2);
    assert("Output value = 0 (LED OFF)", actReleased?.type === "gpio_write" && actReleased.value === 0);
  }

  // --- TEST 2: Supported Edge Case — Variable assignment `val = btn.value()` ---
  console.log("\n--- TEST 2: Variable assignment val = btn.value() ---");
  {
    const code = `
from machine import Pin
btn = Pin(14, Pin.IN, Pin.PULL_UP)
led = Pin(2, Pin.OUT)
val = btn.value()
if val == 0:
    led.on()
else:
    led.off()
`;
    const inputsPressed = new Map<number, boolean>([[14, false]]);
    const actions = parseEsp32PythonConditionalActions(code, inputsPressed);
    const act = actions[0];
    assert("Evaluates val == 0 -> led.on() (value = 1)", act?.type === "gpio_write" && act.pin === 2 && act.value === 1);
  }

  // --- TEST 3: Edge Case — Negated condition `if not btn.value():` ---
  console.log("\n--- TEST 3: Negated condition `if not btn.value():` ---");
  {
    const code = `
from machine import Pin
btn = Pin(14, Pin.IN, Pin.PULL_UP)
led = Pin(2, Pin.OUT)
if not btn.value():
    led.value(1)
`;
    const inputsPressed = new Map<number, boolean>([[14, false]]);
    const actions = parseEsp32PythonConditionalActions(code, inputsPressed);
    const act = actions[0];
    assert("Evaluates `not 0` as true -> led.value(1)", act?.type === "gpio_write" && act.pin === 2 && act.value === 1);
  }

  // --- TEST 4: Graceful Handling — Invalid syntax or empty input ---
  console.log("\n--- TEST 4: Invalid syntax / empty code graceful handling ---");
  {
    const invalidCode = `
if btn.value( == :
    this is bad syntax !!!
`;
    const inputs = new Map<number, boolean>([[14, false]]);
    const actions = parseEsp32PythonConditionalActions(invalidCode, inputs);
    assert("Gracefully returns [] for invalid syntax", Array.isArray(actions) && actions.length === 0);
  }

  console.log("\n=================== ESP32 CONDITIONAL LOGIC EVALUATOR TESTS COMPLETE ===================");
  if (fail === 0) {
    console.log(`\u2705 All ${pass} ESP32 Conditional Logic tests passed.`);
  } else {
    console.error(`\u274C ${fail} test(s) FAILED.`);
    process.exit(1);
  }
}

run();
