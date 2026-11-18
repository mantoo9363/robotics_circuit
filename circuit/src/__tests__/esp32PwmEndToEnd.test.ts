/**
 * esp32PwmEndToEnd.test.ts
 *
 * End-to-end PWM brightness test: ESP32 + LED + resistor circuit.
 * Verifies that LED brightness at 75% duty < brightness at 100% duty,
 * and 0% duty results in LED not powered.
 *
 * Uses relative comparison (not fixed values) since LED brightness follows:
 *   brightness = clamp01((effectiveV - forwardVoltage) / (effectiveV - 0.2))
 * which is nonlinear. The test only asserts ordering, not exact values.
 */

import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import type { SimulationFrame } from "../lib/simulation-state";
import type { SimContext } from "../lib/simulation/types";

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
  } else {
    console.error(`  [FAIL] ${label}`);
    process.exitCode = 1;
  }
}

/** Build context for ESP32 + LED + resistor wired to GPIO2. */
function buildContext(code: string): SimContext {
  const esp32Id    = "esp32-e2e-1";
  const ledId      = "led-e2e-1";
  const resistorId = "res-e2e-1";

  const nodes: SimContext["nodes"] = [
    {
      id: esp32Id,
      type: "esp32",
      position: { x: 0, y: 0 },
      data: { componentType: "esp32", label: "ESP32 DevKit V1", properties: {} } as any,
    },
    {
      id: ledId,
      type: "led",
      position: { x: 200, y: 0 },
      data: { componentType: "led", label: "LED", properties: { color: { value: "red" } } } as any,
    },
    {
      id: resistorId,
      type: "resistor",
      position: { x: 300, y: 0 },
      data: { componentType: "resistor", label: "220Ω", properties: { resistance: { value: 220 } } } as any,
    },
  ];

  const edges: SimContext["edges"] = [
    { id: "e1", source: esp32Id, sourceHandle: "gpio2", target: ledId, targetHandle: "anode" },
    { id: "e2", source: ledId,   sourceHandle: "cathode", target: resistorId, targetHandle: "pin1" },
    { id: "e3", source: resistorId, sourceHandle: "pin2", target: esp32Id, targetHandle: "esp32_gnd1" },
  ];

  return {
    nodes, edges,
    arduinoCode: "", picoCode: code,
    boardType: "esp32", selectedLanguage: "python",
    dynamicComponents: [],
  } as any;
}

function buildFrame(): SimulationFrame {
  return {
    tick: 1, boardType: "esp32", running: true, error: null,
    serialOutput: [], components: {}, timestamp: 100, boardPins: [],
  } as any;
}

console.log("=================== ESP32 PWM END-TO-END TESTS ===================\n");

// Measure brightness at three duty levels
const code0 = `
from machine import Pin, PWM
pwm = PWM(Pin(2))
pwm.duty_u16(0)
`;
const code75 = `
from machine import Pin, PWM
pwm = PWM(Pin(2))
pwm.duty_u16(49151)
`;
const code100 = `
from machine import Pin, PWM
pwm = PWM(Pin(2))
pwm.duty_u16(65535)
`;

const frame0   = applyEsp32SimulationToFrame(buildFrame(), buildContext(code0));
const frame75  = applyEsp32SimulationToFrame(buildFrame(), buildContext(code75));
const frame100 = applyEsp32SimulationToFrame(buildFrame(), buildContext(code100));

const led0   = frame0.components["led-e2e-1"];
const led75  = frame75.components["led-e2e-1"];
const led100 = frame100.components["led-e2e-1"];

const b0   = led0?.brightness ?? 0;
const b75  = led75?.brightness ?? 0;
const b100 = led100?.brightness ?? 0;

// Effective voltages
const v0   = frame0.components["esp32-e2e-1"]?.pins?.["gpio2"]?.voltage ?? 0;
const v75  = frame75.components["esp32-e2e-1"]?.pins?.["gpio2"]?.voltage ?? 0;
const v100 = frame100.components["esp32-e2e-1"]?.pins?.["gpio2"]?.voltage ?? 0;

console.log("--- SCENARIO: 0% / 75% / 100% PWM duty → LED brightness ordering ---");
console.log(`  [Trace] 0%   duty: gpio2 = ${v0.toFixed(3)}V, LED brightness = ${b0.toFixed(3)}, isPowered = ${led0?.isPowered ?? false}`);
console.log(`  [Trace] 75%  duty: gpio2 = ${v75.toFixed(3)}V, LED brightness = ${b75.toFixed(3)}, isPowered = ${led75?.isPowered ?? false}`);
console.log(`  [Trace] 100% duty: gpio2 = ${v100.toFixed(3)}V, LED brightness = ${b100.toFixed(3)}, isPowered = ${led100?.isPowered ?? false}`);

assert("0% duty: LED not powered", (led0?.isPowered ?? true) === false);
assert("0% duty: brightness = 0", b0 === 0);

assert("100% duty: LED powered", (led100?.isPowered ?? false) === true);
assert("100% duty: brightness > 0", b100 > 0);

// gpio2 voltage ordering
assert("0% gpio2 voltage = 0V", v0 === 0);
assert("75% gpio2 voltage ≈ 2.475V (3.3 × 0.75)", Math.abs(v75 - 2.475) < 0.05);
assert("100% gpio2 voltage = 3.3V", Math.abs(v100 - 3.3) < 0.01);

// Relative brightness ordering — strictly monotonic with duty
assert("brightness: 100% > 0%", b100 > b0);

// 75% duty (1.65+V) may or may not light LED depending on forwardVoltage.
// 49151/65535 = 75% → effectiveV = 2.475V. Red LED forwardV = 2.0V → should light.
assert("75% duty: LED powered (effectiveV 2.475V > 2.0V forwardV)", (led75?.isPowered ?? false) === true);
assert("brightness: 100% > 75% > 0%", b100 > b75 && b75 > b0);

console.log("\n=================== ESP32 PWM END-TO-END TESTS COMPLETE ===================");
const exitCode = process.exitCode ?? 0;
if (exitCode === 0) {
  console.log("✅ All ESP32 PWM E2E tests passed.");
} else {
  console.log("❌ Some tests FAILED.");
}
