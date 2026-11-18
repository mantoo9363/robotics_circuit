/**
 * Permanent Regression Test: Verifies that time.sleep() inside conditional blocks
 * (if / elif / else) correctly interrupts execution, allowing buzzer.on() to remain
 * HIGH during the sleep duration rather than immediately running buzzer.off() in the same tick.
 */

import { getOrCreateSession, parsePythonReadOutputsForInput } from "../lib/codeParsing/picoParser";

export function runBuzzerSleepInsideIfTest(): boolean {
  console.log("=================== RUNNING BUZZER SLEEP INSIDE IF REGRESSION TESTS ===================\n");

  let passed = true;

  // -----------------------------------------------------------------------------
  // Case 1: buzzer.on() + time.sleep(0.1) + buzzer.off() inside an IF block
  // -----------------------------------------------------------------------------
  console.log("--- Case 1: buzzer.on() + time.sleep(0.1) + buzzer.off() inside IF block ---");

  const code = `
from machine import Pin
import time

buzzer = Pin(19, Pin.OUT)

while True:
    if True:
        buzzer.on()
        time.sleep(0.1)
        buzzer.off()
        time.sleep(0.1)
  `.trim();

  // Tick 1 (t = 100ms): buzzer.on() runs, sleep(0.1) interrupts execution -> Pin 19 MUST be HIGH
  const session1 = getOrCreateSession(code, 0);
  const result1 = parsePythonReadOutputsForInput(code, -1, false, 100);
  const pin19Val1 = session1.pins.get(19)?.value;

  console.log(`[Trace Tick 1] Pin 19 value = ${pin19Val1}`);

  if (pin19Val1 !== 255) {
    console.error("FAIL Tick 1: Pin 19 was not HIGH after buzzer.on() + sleep(0.1) inside IF block", pin19Val1);
    passed = false;
  } else {
    console.log("=> Tick 1 PASSED (Pin 19 is HIGH during sleep)");
  }

  // Tick 2 (t = 200ms, 100ms later): sleep finishes, continuation executes buzzer.off() -> Pin 19 MUST be LOW
  const result2 = parsePythonReadOutputsForInput(code, -1, false, 200);
  const pin19Val2 = session1.pins.get(19)?.value;

  console.log(`[Trace Tick 2] Pin 19 value = ${pin19Val2}`);

  if (pin19Val2 !== 0) {
    console.error("FAIL Tick 2: Pin 19 was not LOW after sleep finished and buzzer.off() ran", pin19Val2);
    passed = false;
  } else {
    console.log("=> Tick 2 PASSED (Pin 19 is LOW after off())");
  }

  console.log("\n=================== BUZZER SLEEP INSIDE IF REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runBuzzerSleepInsideIfTest();
  if (success) {
    console.log("✅ All buzzer sleep inside IF regression tests passed successfully.");
  } else {
    console.error("❌ Some buzzer sleep inside IF regression tests failed.");
    process.exit(1);
  }
}
