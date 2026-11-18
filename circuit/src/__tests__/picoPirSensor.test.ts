/**
 * MicroPython Pico PIR Motion Sensor Verification Test Suite
 */

import { getOrCreateSession, parsePythonReadOutputsForInput } from "../lib/codeParsing/picoParser";

export function runPirSensorTests(): boolean {
  console.log("=================== RUNNING MICROPYTHON PICO PIR SENSOR TESTS ===================\n");

  let allPassed = true;

  const codePir = `
from machine import Pin
pir = Pin(28, Pin.IN)
led = Pin(15, Pin.OUT)

while True:
    val = pir.value()
    if val == 1:
        led.value(1)
    else:
        led.value(0)
`.trim();

  // -----------------------------------------------------------------------------
  // Test 1 (a & c): Motion Active (pirMotion: true) -> PIR = 1, LED = HIGH (GP15 = 1)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 1: Motion Active (PIR = 1, Downstream LED GP15 = HIGH) ---");
  const sessionMotion = getOrCreateSession(codePir, 0);

  // Simulate digital input HIGH (motion = true) on GP28
  const resMotion = parsePythonReadOutputsForInput(codePir, 28, true, 0);
  const pirValMotion = sessionMotion.variables.get("val");

  const ledOutputMotion = resMotion?.outputs.find((o) => o.pin === 15);
  const ledStateMotion = sessionMotion.pins.get(15)?.value;

  console.log(`[Trace Test 1] PIR pir.value() = ${pirValMotion} (Expected: 1)`);
  console.log(`[Trace Test 1] Downstream LED GP15 value = ${ledStateMotion} (Expected: 1 / HIGH)`);

  if (pirValMotion !== 1 || (ledOutputMotion && !ledOutputMotion.high) || !ledStateMotion || ledStateMotion <= 0) {
    console.error("❌ Test 1 FAILED: Motion Active logic failed");
    allPassed = false;
  } else {
    console.log("=> Test 1 PASSED (PIR returned 1 and LED went HIGH)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 2 (b & d): Motion Inactive (pirMotion: false) -> PIR = 0, LED = LOW (GP15 = 0)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 2: Motion Inactive (PIR = 0, Downstream LED GP15 = LOW) ---");

  // Simulate digital input LOW (motion = false) on GP28
  const resNoMotion = parsePythonReadOutputsForInput(codePir, 28, false, 100);
  const pirValNoMotion = sessionMotion.variables.get("val");

  const ledOutputNoMotion = resNoMotion?.outputs.find((o) => o.pin === 15);
  const ledStateNoMotion = sessionMotion.pins.get(15)?.value;

  console.log(`[Trace Test 2] PIR pir.value() = ${pirValNoMotion} (Expected: 0)`);
  console.log(`[Trace Test 2] Downstream LED GP15 value = ${ledStateNoMotion} (Expected: 0 / LOW)`);

  if (pirValNoMotion !== 0 || (ledOutputNoMotion && ledOutputNoMotion.high) || ledStateNoMotion !== 0) {
    console.error("❌ Test 2 FAILED: Motion Inactive logic failed");
    allPassed = false;
  } else {
    console.log("=> Test 2 PASSED (PIR returned 0 and LED went LOW)\n");
  }

  console.log("=================== PIR SENSOR TESTS COMPLETE ===================");
  return allPassed;
}

if (require.main === module) {
  const ok = runPirSensorTests();
  if (ok) {
    console.log("✅ All MicroPython Pico PIR Motion Sensor tests passed 100%.");
  } else {
    console.error("❌ Some PIR Motion Sensor tests failed.");
    process.exit(1);
  }
}
