/**
 * esp32PythonGpioInputParser.test.ts
 * Regression tests for parseEsp32PythonGpioReadActions (Phase 2 — Digital Input).
 */

import { parseEsp32PythonGpioReadActions } from "../lib/esp32/parser/pythonPatterns";

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

  console.log("=================== ESP32 PYTHON GPIO INPUT PARSER TESTS ===================");

  // --- TEST 1: Simple Pin.IN declaration ---
  console.log("\n--- TEST 1: Simple Pin.IN (no pull) ---");
  {
    const code = `btn = Pin(4, Pin.IN)`;
    const actions = parseEsp32PythonGpioReadActions(code);
    assert("Returns 1 gpio_read action", actions.length === 1);
    assert("pin = 4", actions[0]?.pin === 4);
    assert("pull = none", actions[0]?.pull === "none");
    assert("type = gpio_read", actions[0]?.type === "gpio_read");
  }

  // --- TEST 2: Pin.IN with PULL_UP ---
  console.log("\n--- TEST 2: Pin.IN with Pin.PULL_UP ---");
  {
    const code = `btn = Pin(14, Pin.IN, Pin.PULL_UP)`;
    const actions = parseEsp32PythonGpioReadActions(code);
    assert("Returns 1 gpio_read action", actions.length === 1);
    assert("pin = 14", actions[0]?.pin === 14);
    assert("pull = up", actions[0]?.pull === "up");
  }

  // --- TEST 3: Pin.IN with PULL_DOWN ---
  console.log("\n--- TEST 3: Pin.IN with Pin.PULL_DOWN ---");
  {
    const code = `sensor = Pin(26, Pin.IN, Pin.PULL_DOWN)`;
    const actions = parseEsp32PythonGpioReadActions(code);
    assert("Returns 1 gpio_read action", actions.length === 1);
    assert("pin = 26", actions[0]?.pin === 26);
    assert("pull = down", actions[0]?.pull === "down");
  }

  // --- TEST 4: Zero-arg .value() READ call linked to Pin.IN var ---
  console.log("\n--- TEST 4: Zero-arg btn.value() after Pin.IN declaration ---");
  {
    const code = `
btn = Pin(4, Pin.IN, Pin.PULL_UP)
if btn.value():
    led.on()
`;
    const actions = parseEsp32PythonGpioReadActions(code);
    // Should emit exactly 1 gpio_read for pin 4 (declaration + read deduped)
    const pin4Reads = actions.filter((a) => a.pin === 4 && a.type === "gpio_read");
    assert("Exactly 1 gpio_read for pin 4", pin4Reads.length === 1);
    assert("pull = up carried through", pin4Reads[0]?.pull === "up");
  }

  // --- TEST 5: Forbidden GPIO 6-11 rejected with warning ---
  console.log("\n--- TEST 5: Forbidden GPIO8 (SPI flash reserved) ---");
  {
    const code = `x = Pin(8, Pin.IN)`;
    const actions = parseEsp32PythonGpioReadActions(code);
    assert("Returns 1 action (warning)", actions.length === 1);
    assert("type = gpio_read (warning passthrough)", actions[0]?.type === "gpio_read");
    assert("Has warning message", typeof actions[0]?.warning === "string");
    assert("Warning mentions GPIO 8", actions[0]?.warning?.includes("8") ?? false);
  }

  // --- TEST 6: No-match case (empty code) ---
  console.log("\n--- TEST 6: No-match (pure output code, no Pin.IN) ---");
  {
    const code = `
led = Pin(2, Pin.OUT)
led.on()
`;
    const actions = parseEsp32PythonGpioReadActions(code);
    assert("Returns 0 gpio_read actions", actions.length === 0);
  }

  // --- TEST 7: Multiple input pins in one script ---
  console.log("\n--- TEST 7: Multiple input pins ---");
  {
    const code = `
btn  = Pin(4,  Pin.IN, Pin.PULL_UP)
pir  = Pin(15, Pin.IN)
sw   = Pin(21, Pin.IN, Pin.PULL_DOWN)
`;
    const actions = parseEsp32PythonGpioReadActions(code);
    assert("Returns 3 gpio_read actions", actions.length === 3);
    assert("btn  pin 4  pull=up",   actions.some((a) => a.pin === 4  && a.pull === "up"));
    assert("pir  pin 15 pull=none", actions.some((a) => a.pin === 15 && a.pull === "none"));
    assert("sw   pin 21 pull=down", actions.some((a) => a.pin === 21 && a.pull === "down"));
  }

  console.log("\n=================== ESP32 PYTHON GPIO INPUT PARSER TESTS COMPLETE ===================");
  if (fail === 0) {
    console.log(`\u2705 All ${pass} ESP32 MicroPython GPIO Input Parser tests passed.`);
  } else {
    console.error(`\u274C ${fail} test(s) FAILED.`);
    process.exit(1);
  }
}

run();
