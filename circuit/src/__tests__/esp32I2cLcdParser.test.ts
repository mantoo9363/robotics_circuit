import { getOrCreateSession } from "../lib/codeParsing/picoParser";

function assert(description: string, condition: boolean) {
  if (!condition) {
    console.error(`  [FAIL] ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  } else {
    console.log(`  [PASS] ${description}`);
  }
}

console.log("=================== ESP32 I2C LCD PARSER TEST SUITE ===================");

let testsFailed = 0;

function runTest(testName: string, testFn: () => void) {
  console.log(`\n--- ${testName} ---`);
  try {
    testFn();
  } catch (e: any) {
    console.error(`TEST FAILED: ${e.message}`);
    testsFailed++;
  }
}

// ─── TEST 1: Happy Path (putstr, move_to, clear) ─────────────────────────────
runTest("TEST 1: MicroPython I2C & I2cLcd API calls (putstr, move_to, clear)", () => {
  const code = `
from machine import I2C, Pin
from pico_i2c_lcd import I2cLcd

i2c = I2C(0, scl=Pin(22), sda=Pin(21))
lcd = I2cLcd(i2c, 0x27, 2, 16)

lcd.clear()
lcd.putstr("Hello ESP32")
lcd.move_to(0, 1)
lcd.putstr("Count: 42")
`.trim();

  const session = getOrCreateSession(code, 0);
  assert("Session created", session !== null);

  const lcd = session.lcdStates.get(0x27);
  assert("LCD state registered at 0x27", lcd !== undefined);

  if (lcd) {
    const l1Chars: string[] = [];
    const l2Chars: string[] = [];
    for (let c = 0; c < 16; c++) {
      l1Chars.push(String.fromCharCode(lcd.ddram[c] || 32));
      l2Chars.push(String.fromCharCode(lcd.ddram[0x40 + c] || 32));
    }
    const line1 = l1Chars.join("");
    const line2 = l2Chars.join("");

    assert("Line 1 contains 'Hello ESP32'", line1.includes("Hello ESP32"));
    assert("Line 2 contains 'Count: 42'", line2.includes("Count: 42"));
    assert("Declared SDA pin is 21", lcd.declaredSdaPin === 21);
    assert("Declared SCL pin is 22", lcd.declaredSclPin === 22);
  }
});

// ─── TEST 2: Custom Pin Declarations ──────────────────────────────────────────
runTest("TEST 2: Custom I2C Pin Assignment (SDA=GPIO18, SCL=GPIO19)", () => {
  const code = `
from machine import I2C, Pin
from pico_i2c_lcd import I2cLcd

i2c = I2C(0, scl=Pin(19), sda=Pin(18))
lcd = I2cLcd(i2c, 0x3F, 2, 16)
lcd.putstr("Custom Pins")
`.trim();

  const session = getOrCreateSession(code, 0);
  assert("Session created", session !== null);

  const lcd = session.lcdStates.get(0x3F);
  assert("LCD state registered at 0x3F", lcd !== undefined);

  if (lcd) {
    assert("Declared SDA pin is 18", lcd.declaredSdaPin === 18);
    assert("Declared SCL pin is 19", lcd.declaredSclPin === 19);
  }
});

// ─── TEST 3: No-Match Case ───────────────────────────────────────────────────
runTest("TEST 3: Code without LCD calls returns empty lcdStates", () => {
  const code = `
from machine import Pin
p = Pin(2, Pin.OUT)
p.value(1)
`.trim();

  const session = getOrCreateSession(code, 0);
  assert("Session created", session !== null);
  assert("lcdStates has 0 elements", session.lcdStates.size === 0);
});

console.log("\n=================== SUMMARY ===================");
if (testsFailed === 0) {
  console.log("✅ All ESP32 I2C LCD parser tests passed successfully.");
} else {
  console.error(`❌ ${testsFailed} test(s) failed.`);
  process.exit(1);
}
