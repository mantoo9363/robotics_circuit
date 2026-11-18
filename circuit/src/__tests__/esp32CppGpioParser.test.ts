/**
 * Test Suite for ESP32 Arduino C++ GPIO Parser
 */

import { parseEsp32CppGpioActions } from "../lib/esp32/parser/cppPatterns";

export function runEsp32CppGpioParserTests(): boolean {
  let passed = true;

  // Test 1: Happy path - valid pin HIGH / LOW
  const happyCode = `
    void setup() {
      pinMode(2, OUTPUT);
      digitalWrite(2, HIGH);
      pinMode(23, OUTPUT);
      digitalWrite(23, LOW);
    }
  `;
  const actions = parseEsp32CppGpioActions(happyCode);

  const pin2Action = actions.find((a) => a.pin === 2 && a.type === "gpio_write");
  if (!pin2Action || (pin2Action.type === "gpio_write" && pin2Action.value !== 1)) {
    console.error("FAIL: C++ GPIO2 HIGH action missing or invalid", pin2Action);
    passed = false;
  }

  const pin23Action = actions.find((a) => a.pin === 23 && a.type === "gpio_write");
  if (!pin23Action || (pin23Action.type === "gpio_write" && pin23Action.value !== 0)) {
    console.error("FAIL: C++ GPIO23 LOW action missing or invalid", pin23Action);
    passed = false;
  }

  // Test 2: Edge case - Reserved SPI Flash pin (GPIO 6-11) rejected
  const reservedCode = `
    void setup() {
      pinMode(6, OUTPUT);
      digitalWrite(6, HIGH);
    }
  `;
  const reservedActions = parseEsp32CppGpioActions(reservedCode);
  const pin6Action = reservedActions.find((a) => a.pin === 6);
  if (!pin6Action || !pin6Action.warning) {
    console.error("FAIL: Reserved SPI flash pin GPIO 6 was not rejected with a warning!", pin6Action);
    passed = false;
  }

  // Test 3: No-match case - Unrelated code returns no actions and does not crash
  const unrelatedCode = `
    int calc(int a, int b) {
      return a + b;
    }
  `;
  const emptyActions = parseEsp32CppGpioActions(unrelatedCode);
  if (emptyActions.length !== 0) {
    console.error("FAIL: Unrelated code produced unexpected actions", emptyActions);
    passed = false;
  }

  // Test 4: Stress-test stripAllConditionalBlocks with unconditional loop writes
  // Verifies that digitalWrite calls OUTSIDE if-blocks in loop() are extracted,
  // while digitalWrite calls INSIDE if/else blocks are stripped from static defaults.
  const loopMixedCode = `
    void setup() {
      pinMode(2, OUTPUT);
      pinMode(4, OUTPUT);
      pinMode(5, OUTPUT);
    }
    void loop() {
      digitalWrite(2, HIGH); // Unconditional write before if
      if (digitalRead(18) == HIGH) {
        digitalWrite(2, LOW); // Conditional inside then-block
        digitalWrite(5, HIGH); // Conditional inside then-block
      } else {
        digitalWrite(2, LOW); // Conditional inside else-block
        digitalWrite(5, LOW);  // Conditional inside else-block
      }
      digitalWrite(4, LOW);  // Unconditional write after if/else
    }
  `;
  const loopActions = parseEsp32CppGpioActions(loopMixedCode);
  
  const pin2Loop = loopActions.find((a) => a.pin === 2 && a.type === "gpio_write");
  if (!pin2Loop || pin2Loop.type !== "gpio_write" || pin2Loop.value !== 1) {
    console.error("FAIL: Unconditional loop write for GPIO 2 (HIGH) was lost or overwritten by conditional block!", pin2Loop);
    passed = false;
  }

  const pin4Loop = loopActions.find((a) => a.pin === 4 && a.type === "gpio_write");
  if (!pin4Loop || pin4Loop.type !== "gpio_write" || pin4Loop.value !== 0) {
    console.error("FAIL: Unconditional loop write for GPIO 4 (LOW) was lost!", pin4Loop);
    passed = false;
  }

  const pin5Loop = loopActions.find((a) => a.pin === 5 && a.type === "gpio_write");
  if (pin5Loop) {
    console.error("FAIL: Conditional-only write for GPIO 5 was unexpectedly extracted as static write!", pin5Loop);
    passed = false;
  }

  return passed;
}

if (require.main === module) {
  const ok = runEsp32CppGpioParserTests();
  if (ok) {
    console.log("✅ All ESP32 C++ GPIO parser tests passed.");
  } else {
    console.error("❌ ESP32 C++ GPIO parser tests failed.");
    process.exit(1);
  }
}
