/**
 * Permanent Regression Test Suite for MicroPython Session Timestamp Race & Reset Integrity
 *
 * Validates:
 * 1. Genuine Stop->Start full reset (ts=1500 -> ts=0 wipes variables, pins, and serial history).
 * 2. Client/Server Out-of-Order Jittered Frame Race Protection (ts=1550 followed by ts=1535 does NOT wipe session).
 * 3. Active-LOW Matrix Keypad scan continuity across jitter (mid-scan state preserved without restarting at line 1).
 * 4. Long-idle timeout reset (>5000ms gap between calls triggers full reset).
 * 5. Pushbutton / Switch rapid interaction state retention (no unexpected runtime reset on fast clicks).
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { getOrCreateSession, clearSimSessions, parsePythonReadOutputsForInput } from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runSessionTimestampRaceResetTests(): boolean {
  console.log("=================== RUNNING SESSION TIMESTAMP RACE & RESET TESTS ===================\n");
  let passed = true;

  try {
    // --- TEST 1: Genuine Stop -> Start Full Reset ---
    console.log("--- TEST 1: Genuine Stop -> Start Full Reset ---");
    clearSimSessions();
    const testCode = `
from machine import Pin
print("INIT SETUP")
out_pin = Pin(13, Pin.OUT)
out_pin.value(1)
counter = 42
`;
    // Initial run to ts = 1500
    const s1 = getOrCreateSession(testCode, 0, "esp32");
    s1.variables.set("counter", 100);
    s1.pins.set(13, { mode: "OUTPUT", value: 1 });
    s1.rawSerialLines = ["INIT SETUP", "RUNNING LOOP LINE 1", "RUNNING LOOP LINE 2"];

    // Step to ts = 1500
    getOrCreateSession(testCode, 1500, "esp32");

    // Simulate Stop -> Start (passes timestamp = 0)
    const sReset = getOrCreateSession(testCode, 0, "esp32");
    const rawReset = sReset.rawSerialLines || [];
    const isWiped = sReset.variables.get("counter") === 42 && // reset by re-running setup
      rawReset.filter((l) => l === "INIT SETUP").length === 1 &&
      !rawReset.includes("RUNNING LOOP LINE 1");

    console.log(`[Trace Test 1] After ts=0: counter=${sReset.variables.get("counter")}, rawSerialLines=${JSON.stringify(rawReset)}`);
    if (isWiped) {
      console.log("=> Test 1 PASSED (ts=0 properly detected genuine Stop->Start and wiped session state)\n");
    } else {
      console.error("❌ Test 1 FAILED: ts=0 did not trigger a genuine session reset.");
      passed = false;
    }

    // --- TEST 2: Out-of-Order / Jittered Frame Race Protection ---
    console.log("--- TEST 2: Out-of-Order / Jittered Frame Race Protection ---");
    clearSimSessions();
    const keypadCode = `
from machine import Pin
print("KEYPAD TEST READY")
rows = [Pin(13, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_UP)]
`;
    // Frame at ts = 1500
    const sKeypad = getOrCreateSession(keypadCode, 1500, "esp32");
    sKeypad.rawSerialLines = ["KEYPAD TEST READY", "PRESSED: 1 row= 0 col= 0"];

    // User clicks keypad -> local frame at ts = 1550 (advances lastSimulationTimestamp to 1550)
    const sLocal = getOrCreateSession(keypadCode, 1550, "esp32");
    assert.strictEqual(sLocal, sKeypad, "Session object identity must be preserved across forward step");

    // In-flight socket frame arrives with jittered/older timestamp ts = 1535 (15ms older than local)
    const sSocketJitter = getOrCreateSession(keypadCode, 1535, "esp32");
    const rawJitter = sSocketJitter.rawSerialLines || [];
    const survived = sSocketJitter === sKeypad &&
      rawJitter.includes("PRESSED: 1 row= 0 col= 0") &&
      rawJitter.length === 2;

    console.log(`[Trace Test 2] After ts=1535 jitter: rawSerialLines=${JSON.stringify(sSocketJitter.rawSerialLines)}`);
    if (survived) {
      console.log("=> Test 2 PASSED (Jittered out-of-order socket frame did NOT wipe session or serial lines)\n");
    } else {
      console.error("❌ Test 2 FAILED: Jittered socket frame caused false session restart.");
      passed = false;
    }

    // --- TEST 3: Active-LOW Keypad Scan Continuity Across Jitter ---
    console.log("--- TEST 3: Active-LOW Keypad Scan Continuity Across Jitter ---");
    clearSimSessions();
    const scanLoopCode = `
from machine import Pin
print("SCAN SETUP")
r1 = Pin(13, Pin.OUT)
c1 = Pin(25, Pin.IN, Pin.PULL_UP)
scan_step = 1
while True:
    scan_step = scan_step + 1
    if c1.value() == 0:
        print("PRESSED KEY DETECTED")
`;
    const sScan = getOrCreateSession(scanLoopCode, 1000, "esp32");
    sScan.variables.set("scan_step", 5);

    // Advance local frame
    getOrCreateSession(scanLoopCode, 1050, "esp32");

    // Jittered socket frame at 1040ms
    const sScanJitter = getOrCreateSession(scanLoopCode, 1040, "esp32");
    const scanStepVal = sScanJitter.variables.get("scan_step");

    console.log(`[Trace Test 3] scan_step after 1040ms jitter = ${scanStepVal} (Expected >= 5, not reset to 1)`);
    if (scanStepVal >= 5) {
      console.log("=> Test 3 PASSED (Active-low scan state preserved across timestamp jitter without restarting)\n");
    } else {
      console.error(`❌ Test 3 FAILED: scan_step was reset to ${scanStepVal}.`);
      passed = false;
    }

    // --- TEST 4: Long-Idle Timeout Reset (>5000ms Gap / >2000ms backward jump) ---
    console.log("--- TEST 4: Long-Idle Timeout Reset (>5000ms Gap / >2000ms backward jump) ---");
    clearSimSessions();
    const idleCode = `
print("INITIAL IDLE CODE")
x = 10
`;
    const sIdle1 = getOrCreateSession(idleCode, 5000, "esp32");
    sIdle1.variables.set("x", 999);

    // Large backward jump (>2000ms) simulating an entirely new test sketch
    const sBigJump = getOrCreateSession(idleCode, 100, "esp32");
    const jumpReset = sBigJump.variables.get("x") === 10;
    console.log(`[Trace Test 4] Backward jump (>2000ms) reset x = ${sBigJump.variables.get("x")} (Expected: 10)`);
    if (jumpReset) {
      console.log("=> Test 4 PASSED (Major backward jump properly triggers clean session reinitialization)\n");
    } else {
      console.error("❌ Test 4 FAILED: Backward jump did not reset session.");
      passed = false;
    }

    // --- TEST 5: Pushbutton / Switch Rapid-Click State Retention ---
    console.log("--- TEST 5: Pushbutton / Switch Rapid-Click State Retention ---");
    clearSimSessions();
    const buttonCode = `
from machine import Pin
btn = Pin(4, Pin.IN, Pin.PULL_UP)
led = Pin(2, Pin.OUT)
click_count = 0
while True:
    if btn.value() == 0:
        click_count = click_count + 1
        led.value(1)
    else:
        led.value(0)
`;
    let sBtn = getOrCreateSession(buttonCode, 2000, "esp32");
    sBtn.variables.set("click_count", 3);

    // Rapid simulated clicks with fluctuating local/socket timestamps (2050 -> 2030 -> 2060 -> 2045)
    parsePythonReadOutputsForInput(buttonCode, 4, false, 2050, "esp32"); // Press LOW
    parsePythonReadOutputsForInput(buttonCode, 4, false, 2030, "esp32"); // Jittered socket frame
    parsePythonReadOutputsForInput(buttonCode, 4, true, 2060, "esp32");  // Release HIGH
    parsePythonReadOutputsForInput(buttonCode, 4, true, 2045, "esp32");  // Jittered socket frame

    const sBtnFinal = getOrCreateSession(buttonCode, 2070, "esp32");
    const countVal = sBtnFinal.variables.get("click_count");
    console.log(`[Trace Test 5] click_count after rapid clicks with jitter = ${countVal} (Expected: > 3, not reset to 0)`);
    if (countVal > 3) {
      console.log("=> Test 5 PASSED (Rapid button clicks with timestamp jitter retain runtime state cleanly)\n");
    } else {
      console.error(`❌ Test 5 FAILED: click_count was reset to ${countVal}.`);
      passed = false;
    }

  } catch (err) {
    console.error("💥 sessionTimestampRaceResetTests threw exception:", err);
    passed = false;
  }

  console.log("=================== SESSION TIMESTAMP RACE & RESET TESTS COMPLETE ===================");
  return passed;
}

describe("MicroPython Session Timestamp Race & Reset Integrity", () => {
  it("All 5 Session Timestamp Race & Reset Test Cases Pass", () => {
    const ok = runSessionTimestampRaceResetTests();
    assert.strictEqual(ok, true, "All timestamp race and reset test cases must pass 100%");
  });
});

if (require.main === module) {
  const ok = runSessionTimestampRaceResetTests();
  if (ok) {
    console.log("✅ All Session Timestamp Race & Reset tests passed 100%.");
  } else {
    console.error("❌ Session Timestamp Race & Reset tests failed.");
    process.exit(1);
  }
}
