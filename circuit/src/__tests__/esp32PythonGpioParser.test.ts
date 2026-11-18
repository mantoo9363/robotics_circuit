/**
 * Test Suite for ESP32 MicroPython GPIO Parser
 */

import { parseEsp32PythonGpioActions } from "../lib/esp32/parser/pythonPatterns";

export function runEsp32PythonGpioParserTests(): boolean {
  let passed = true;

  // Test 1: Happy path - MicroPython syntax
  const happyCode = `
from machine import Pin
led = Pin(2, Pin.OUT)
led.value(1)
relay = Pin(22, Pin.OUT, value=0)
relay.on()
`;
  const actions = parseEsp32PythonGpioActions(happyCode);

  const pin2Action = actions.find((a) => a.pin === 2 && a.type === "gpio_write" && a.value === 1);
  if (!pin2Action) {
    console.error("FAIL: MicroPython GPIO2 HIGH action missing", actions);
    passed = false;
  }

  const pin22Action = actions.find((a) => a.pin === 22 && a.type === "gpio_write" && a.value === 1);
  if (!pin22Action) {
    console.error("FAIL: MicroPython GPIO22 relay.on() action missing", actions);
    passed = false;
  }

  // Test 2: Edge case - Reserved SPI Flash pin (GPIO 6-11)
  const reservedCode = `
from machine import Pin
flash_pin = Pin(6, Pin.OUT)
flash_pin.on()
`;
  const reservedActions = parseEsp32PythonGpioActions(reservedCode);
  const pin6Action = reservedActions.find((a) => a.pin === 6);
  if (!pin6Action || !pin6Action.warning) {
    console.error("FAIL: Reserved SPI flash pin GPIO 6 was not rejected with warning", pin6Action);
    passed = false;
  }

  // Test 3: No-match case
  const unrelatedCode = `
x = 10
y = 20
print(x + y)
`;
  const emptyActions = parseEsp32PythonGpioActions(unrelatedCode);
  if (emptyActions.length !== 0) {
    console.error("FAIL: Unrelated MicroPython code returned unexpected actions", emptyActions);
    passed = false;
  }

  return passed;
}

if (require.main === module) {
  const ok = runEsp32PythonGpioParserTests();
  if (ok) {
    console.log("✅ All ESP32 MicroPython GPIO parser tests passed.");
  } else {
    console.error("❌ ESP32 MicroPython GPIO parser tests failed.");
    process.exit(1);
  }
}
