/**
 * esp32PythonPwmParser.test.ts
 *
 * Unit tests for parseEsp32PythonPwmActions — the ESP32 MicroPython PWM parser.
 * Covers: duty(0-1023), duty_u16(0-65535), normalization parity, named-var form,
 * inline form, freq capture, GPIO6-11 rejection, out-of-range clamping, no-match.
 */

import { parseEsp32PythonPwmActions } from "../lib/esp32/parser/pythonPatterns";

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
  } else {
    console.error(`  [FAIL] ${label}`);
    process.exitCode = 1;
  }
}

console.log("=================== ESP32 PYTHON PWM PARSER TESTS ===================\n");

// --- TEST 1: Named var form — duty(0-1023) ---
console.log("--- TEST 1: Named var duty(512) → ~50% ---");
{
  const code = `
from machine import Pin, PWM
pwm = PWM(Pin(2))
pwm.freq(1000)
pwm.duty(512)
`;
  const actions = parseEsp32PythonPwmActions(code);
  assert("Returns 1 pwm_write action", actions.length === 1);
  assert("pin = 2", actions[0]?.pin === 2);
  assert("type = pwm_write", actions[0]?.type === "pwm_write");
  // duty(512) → 512/1023*100 ≈ 50.0 %
  assert("dutyPercent ≈ 50% (512/1023)", Math.abs((actions[0]?.dutyPercent ?? 0) - 50.0) < 1.0);
  assert("freqHz = 1000", actions[0]?.freqHz === 1000);
}

// --- TEST 2: Named var form — duty_u16(32768) → ~50% ---
console.log("\n--- TEST 2: Named var duty_u16(32768) → ~50% ---");
{
  const code = `
from machine import Pin, PWM
pwm2 = PWM(Pin(4))
pwm2.duty_u16(32768)
`;
  const actions = parseEsp32PythonPwmActions(code);
  assert("Returns 1 pwm_write action", actions.length === 1);
  assert("pin = 4", actions[0]?.pin === 4);
  // duty_u16(32768) → 32768/65535*100 ≈ 50.0 %
  assert("dutyPercent ≈ 50% (32768/65535)", Math.abs((actions[0]?.dutyPercent ?? 0) - 50.0) < 1.0);
}

// --- TEST 3: Normalization parity — duty(512) ≈ duty_u16(32768) ---
console.log("\n--- TEST 3: Normalization parity — duty(512) vs duty_u16(32768) ---");
{
  const code10 = `pwm = PWM(Pin(2))\npwm.duty(512)`;
  const code16 = `pwm = PWM(Pin(2))\npwm.duty_u16(32768)`;
  const result10 = parseEsp32PythonPwmActions(code10);
  const result16 = parseEsp32PythonPwmActions(code16);
  assert("Both produce 1 action", result10.length === 1 && result16.length === 1);
  const diff = Math.abs((result10[0]?.dutyPercent ?? 0) - (result16[0]?.dutyPercent ?? 0));
  assert("dutyPercent values within 0.2% of each other", diff < 0.2);
}

// --- TEST 4: duty(0) → 0%, duty(1023) → 100% ---
console.log("\n--- TEST 4: duty(0) and duty(1023) boundary values ---");
{
  const code0 = `pwm = PWM(Pin(2))\npwm.duty(0)`;
  const code100 = `pwm = PWM(Pin(2))\npwm.duty(1023)`;
  const r0 = parseEsp32PythonPwmActions(code0);
  const r100 = parseEsp32PythonPwmActions(code100);
  assert("duty(0) → dutyPercent = 0", r0[0]?.dutyPercent === 0);
  assert("duty(1023) → dutyPercent = 100", Math.abs((r100[0]?.dutyPercent ?? 0) - 100) < 0.1);
}

// --- TEST 5: duty_u16(0) → 0%, duty_u16(65535) → 100% ---
console.log("\n--- TEST 5: duty_u16(0) and duty_u16(65535) boundary values ---");
{
  const code0 = `pwm = PWM(Pin(5))\npwm.duty_u16(0)`;
  const code100 = `pwm = PWM(Pin(5))\npwm.duty_u16(65535)`;
  const r0 = parseEsp32PythonPwmActions(code0);
  const r100 = parseEsp32PythonPwmActions(code100);
  assert("duty_u16(0) → dutyPercent = 0", r0[0]?.dutyPercent === 0);
  assert("duty_u16(65535) → dutyPercent = 100", Math.abs((r100[0]?.dutyPercent ?? 0) - 100) < 0.1);
}

// --- TEST 6: Inline form — PWM(Pin(2)).duty_u16(n) [Blockly analog_write] ---
console.log("\n--- TEST 6: Inline duty_u16 form ---");
{
  const code = `PWM(Pin(2)).duty_u16(32768)\n`;
  const actions = parseEsp32PythonPwmActions(code);
  assert("Inline form: returns 1 action", actions.length === 1);
  assert("Inline form: pin = 2", actions[0]?.pin === 2);
  assert("Inline form: dutyPercent ≈ 50%", Math.abs((actions[0]?.dutyPercent ?? 0) - 50) < 1);
}

// --- TEST 7: Inline form with freq — PWM(Pin(pin), freq=50).duty_u16(n) [Blockly servo_write] ---
console.log("\n--- TEST 7: Inline duty_u16 with freq=50 (servo_write) ---");
{
  // Use GPIO13 (safe pin, outside 6-11 forbidden range)
  const codeLiteral = `PWM(Pin(13), freq=50).duty_u16(4915)\n`;
  const actions = parseEsp32PythonPwmActions(codeLiteral);
  assert("Inline with freq: returns 1 action", actions.length === 1);
  assert("freqHz = 50", actions[0]?.freqHz === 50);
  assert("pin = 13", actions[0]?.pin === 13);
}

// --- TEST 8: Forbidden GPIO6-11 → rejected with warning ---
console.log("\n--- TEST 8: GPIO8 (forbidden SPI flash) rejected ---");
{
  const code = `pwm = PWM(Pin(8))\npwm.duty(512)`;
  const actions = parseEsp32PythonPwmActions(code);
  // Forbidden pin: PWM construction emits warning action, duty call has no entry → 1 warning action
  assert("Returns 1 warning action for forbidden pin", actions.length === 1);
  assert("Warning action has warning field", typeof actions[0]?.warning === "string");
  assert("Warning mentions GPIO 8", actions[0]?.warning?.includes("8") ?? false);
  assert("dutyPercent = 0 for forbidden pin", actions[0]?.dutyPercent === 0);
}

// --- TEST 9: Inline forbidden GPIO9 ---
console.log("\n--- TEST 9: Inline GPIO9 (forbidden) rejected ---");
{
  const code = `PWM(Pin(9)).duty_u16(32768)\n`;
  const actions = parseEsp32PythonPwmActions(code);
  assert("Inline forbidden pin: 1 warning action", actions.length === 1);
  assert("Warning mentions 9", actions[0]?.warning?.includes("9") ?? false);
}

// --- TEST 10: No PWM code → empty result ---
console.log("\n--- TEST 10: No-match (pure gpio_write code) ---");
{
  const code = `
from machine import Pin
led = Pin(2, Pin.OUT)
led.on()
`;
  const actions = parseEsp32PythonPwmActions(code);
  assert("No PWM code: returns []", actions.length === 0);
}

// --- TEST 11: Out-of-range duty clamped gracefully ---
console.log("\n--- TEST 11: Out-of-range duty(9999) clamped to 100% ---");
{
  const code = `pwm = PWM(Pin(2))\npwm.duty(9999)`;
  const actions = parseEsp32PythonPwmActions(code);
  assert("Returns 1 action", actions.length === 1);
  assert("dutyPercent clamped to 100", Math.abs((actions[0]?.dutyPercent ?? 0) - 100) < 0.1);
}

// --- TEST 12: duty_u16 out-of-range clamped ---
console.log("\n--- TEST 12: Out-of-range duty_u16(99999) clamped to 100% ---");
{
  const code = `pwm = PWM(Pin(2))\npwm.duty_u16(99999)`;
  const actions = parseEsp32PythonPwmActions(code);
  assert("Returns 1 action", actions.length === 1);
  assert("dutyPercent clamped to 100", Math.abs((actions[0]?.dutyPercent ?? 0) - 100) < 0.1);
}

console.log("\n=================== ESP32 PYTHON PWM PARSER TESTS COMPLETE ===================");
const exitCode = process.exitCode ?? 0;
if (exitCode === 0) {
  console.log("✅ All ESP32 MicroPython PWM Parser tests passed.");
} else {
  console.log(`❌ Some tests FAILED.`);
}
