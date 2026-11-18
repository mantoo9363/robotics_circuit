/**
 * Permanent Regression Test Suite for MicroPython Pico 11-Step Sequential LCD Demo & Scope Degredation
 */

import { getOrCreateSession, parsePythonReadOutputsForInput } from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function run11StepLcdRegressionTests(): boolean {
  console.log("=================== RUNNING PICO 11-STEP LCD REGRESSION TESTS ===================\n");

  let passed = true;

  // -----------------------------------------------------------------------------
  // Test 1: 11-Step Sequential Setup Script with Section 9 Counter Loop
  // -----------------------------------------------------------------------------
  console.log("--- TEST 1: 11-Step LCD Demo Script with Section 9 Counter Loop ---");

  const code11Step = `
from pico_i2c_lcd import I2cLcd
import time

lcd = I2cLcd(None, 0x27, 2, 16)

# Step 1
lcd.clear()
lcd.putstr("1. Welcome")
time.sleep(1)

# Step 2  
lcd.clear()
lcd.putstr("2. Testing")
time.sleep(1)

# Section 9: Counter Loop
lcd.clear()
lcd.putstr("9. Counter:")
for i in range(3):
    lcd.move_to(0, 1)
    lcd.putstr(f"Count: {i}")
    time.sleep(1)

# Step 11: Final
lcd.clear()
lcd.putstr("11. Completed!")
`.trim();

  // Initial creation (t = 0)
  const session = getOrCreateSession(code11Step, 0);

  // Helper to read LCD Line 1 and Line 2
  const readLcd = () => {
    const l1: string[] = [];
    const l2: string[] = [];
    for (let c = 0; c < 16; c++) {
      l1.push(String.fromCharCode(session?.lcdState?.ddram[c] || 32));
      l2.push(String.fromCharCode(session?.lcdState?.ddram[0x40 + c] || 32));
    }
    return { l1: l1.join("").trim(), l2: l2.join("").trim() };
  };

  // Step 1 check at t = 0
  const lcd0 = readLcd();
  console.log(`[Trace t = 0ms]    Line 1 = "${lcd0.l1}" (Expected: "1. Welcome")`);
  if (lcd0.l1 !== "1. Welcome") {
    console.error(`FAIL: Expected '1. Welcome' at t = 0ms, got '${lcd0.l1}'`);
    passed = false;
  }

  // Tick to t = 1100ms -> Step 2
  parsePythonReadOutputsForInput(code11Step, 0, false, 1100);
  const lcd1100 = readLcd();
  console.log(`[Trace t = 1100ms] Line 1 = "${lcd1100.l1}" (Expected: "2. Testing")`);
  if (lcd1100.l1 !== "2. Testing") {
    console.error(`FAIL: Expected '2. Testing' at t = 1100ms, got '${lcd1100.l1}'`);
    passed = false;
  }

  // Tick to t = 2200ms -> Section 9 Counter Loop starts (Count: 0)
  parsePythonReadOutputsForInput(code11Step, 0, false, 2200);
  const lcd2200 = readLcd();
  console.log(`[Trace t = 2200ms] Line 1 = "${lcd2200.l1}", Line 2 = "${lcd2200.l2}" (Expected: Line 2 "Count: 0")`);
  if (lcd2200.l2 !== "Count: 0") {
    console.error(`FAIL: Expected Line 2 'Count: 0' at t = 2200ms, got '${lcd2200.l2}'`);
    passed = false;
  }

  // Tick to t = 3300ms -> Section 9 Counter Loop advances to (Count: 1)
  parsePythonReadOutputsForInput(code11Step, 0, false, 3300);
  const lcd3300 = readLcd();
  console.log(`[Trace t = 3300ms] Line 1 = "${lcd3300.l1}", Line 2 = "${lcd3300.l2}" (Expected: Line 2 "Count: 1")`);
  if (lcd3300.l2 !== "Count: 1") {
    console.error(`FAIL: Expected Line 2 'Count: 1' at t = 3300ms, got '${lcd3300.l2}'`);
    passed = false;
  }

  // Tick to t = 4400ms -> Section 9 Counter Loop advances to (Count: 2)
  parsePythonReadOutputsForInput(code11Step, 0, false, 4400);
  const lcd4400 = readLcd();
  console.log(`[Trace t = 4400ms] Line 1 = "${lcd4400.l1}", Line 2 = "${lcd4400.l2}" (Expected: Line 2 "Count: 2")`);
  if (lcd4400.l2 !== "Count: 2") {
    console.error(`FAIL: Expected Line 2 'Count: 2' at t = 4400ms, got '${lcd4400.l2}'`);
    passed = false;
  }

  // Tick to t = 5500ms -> Step 11 Final ("11. Completed!")
  parsePythonReadOutputsForInput(code11Step, 0, false, 5500);
  const lcd5500 = readLcd();
  console.log(`[Trace t = 5500ms] Line 1 = "${lcd5500.l1}" (Expected: "11. Completed!")`);
  if (lcd5500.l1 !== "11. Completed!") {
    console.error(`FAIL: Expected '11. Completed!' at t = 5500ms, got '${lcd5500.l1}'`);
    passed = false;
  }

  if (passed) {
    console.log("=> Test 1 PASSED - All 11 sequential steps & Section 9 counter loop animated progressively!\n");
  }

  // -----------------------------------------------------------------------------
  // Test 2: Degradation Verification for Out-of-Scope Cases (No Crash / No Error)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 2: Degradation Verification for Out-of-Scope Cases ---");

  // Out-of-Scope Case A: >100 range loop
  console.log("Case A: >100 range loop");
  const codeRangeOver100 = `
x = 0
for i in range(105):
    x += 1
`.trim();
  const sessionCap = getOrCreateSession(codeRangeOver100, 0);
  console.log(`[Trace >100 Range Loop] Result x = ${sessionCap?.variables.get("x")} (Expected: 105)`);
  if (sessionCap?.variables.get("x") !== 105) {
    console.error("FAIL: >100 Range Loop degradation failed");
    passed = false;
  } else {
    console.log("=> Case A PASSED (Degraded gracefully to atomic execution without crash)");
  }

  // Out-of-Scope Case B: List collection loop
  console.log("\nCase B: List collection loop");
  const codeListLoop = `
items = ["a", "b", "c"]
res = ""
for item in items:
    res += item
`.trim();
  const sessionList = getOrCreateSession(codeListLoop, 0);
  console.log(`[Trace List Loop] Result res = "${sessionList?.variables.get("res")}" (Expected: "abc")`);
  if (sessionList?.variables.get("res") !== "abc") {
    console.error("FAIL: List collection loop degradation failed");
    passed = false;
  } else {
    console.log("=> Case B PASSED (Degraded gracefully to atomic execution without crash)");
  }

  // Out-of-Scope Case C: Non-True while loop
  console.log("\nCase C: Non-True while loop");
  const codeWhile = `
count = 0
while count < 3:
    count += 1
`.trim();
  const sessionWhile = getOrCreateSession(codeWhile, 0);
  console.log(`[Trace Non-True While Loop] Result count = ${sessionWhile?.variables.get("count")} (Expected: 3)`);
  if (sessionWhile?.variables.get("count") !== 3) {
    console.error("FAIL: Non-True While loop degradation failed");
    passed = false;
  } else {
    console.log("=> Case C PASSED (Degraded gracefully to atomic execution without crash)\n");
  }

  console.log("=================== REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const ok = run11StepLcdRegressionTests();
  if (ok) {
    console.log("✅ All 11-step LCD & scope degradation tests passed 100%.");
  } else {
    console.error("❌ Some regression tests failed.");
    process.exit(1);
  }
}
