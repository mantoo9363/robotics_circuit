/**
 * esp32PwmFrameTransformer.test.ts
 *
 * Tests for PWM output handling in applyEsp32SimulationToFrame.
 * Given a pwm_write action with a specific dutyPercent, verifies the effective
 * voltage and LED brightness on the connected load.
 *
 * Brightness formula (from stateMaps.ts):
 *   brightness = clamp01((driveVoltage - forwardVoltage) / (driveVoltage - 0.2))
 * where driveVoltage = 3.3 * dutyPercent / 100 and forwardVoltage ≈ 2.0V (red LED default).
 *
 * Key: brightness scales with driveVoltage, so:
 *   - 0% duty  → driveVoltage = 0V    → LED not powered (brightness = 0)
 *   - 50% duty → driveVoltage = 1.65V → below forwardVoltage → LED not powered
 *   - 100% duty→ driveVoltage = 3.3V  → fully powered
 *
 * NOTE: At 50% duty (1.65V), this is right at the forward voltage threshold for red LEDs
 * (~2.0V), so the LED may not light. Test uses a higher duty (e.g. 75%) or a lower
 * forward-voltage LED (green, 2.0V). The E2E test uses a comparative assertion
 * (100% > 75% > 0%) rather than fixed brightness values.
 */

import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import type { SimulationFrame } from "../lib/simulation-state";
import type { SimContext } from "../lib/simulation/types";
import { parseEsp32PythonPwmActions } from "../lib/esp32/parser/pythonPatterns";

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
  } else {
    console.error(`  [FAIL] ${label}`);
    process.exitCode = 1;
  }
}

/** Build a minimal SimContext for an ESP32 node driving a load on GPIO2. */
function buildContext(code: string, selectedLanguage: "python" | "cpp" = "python"): SimContext {
  const esp32NodeId = "esp32-node-1";
  const ledNodeId   = "led-node-1";
  const resistorId  = "resistor-node-1";

  const nodes: SimContext["nodes"] = [
    {
      id: esp32NodeId,
      type: "esp32",
      position: { x: 0, y: 0 },
      data: { componentType: "esp32", label: "ESP32 DevKit V1", properties: {} } as any,
    },
    {
      id: ledNodeId,
      type: "led",
      position: { x: 200, y: 0 },
      data: { componentType: "led", label: "LED", properties: { color: { value: "red" } } } as any,
    },
    {
      id: resistorId,
      type: "resistor",
      position: { x: 300, y: 0 },
      data: { componentType: "resistor", label: "Resistor", properties: { resistance: { value: 220 } } } as any,
    },
  ];

  const edges: SimContext["edges"] = [
    // ESP32 GPIO2 → LED anode
    {
      id: "e1", source: esp32NodeId, sourceHandle: "gpio2",
      target: ledNodeId, targetHandle: "anode",
    },
    // LED cathode → Resistor pin1
    {
      id: "e2", source: ledNodeId, sourceHandle: "cathode",
      target: resistorId, targetHandle: "pin1",
    },
    // Resistor pin2 → ESP32 GND
    {
      id: "e3", source: resistorId, sourceHandle: "pin2",
      target: esp32NodeId, targetHandle: "esp32_gnd1",
    },
  ];

  return {
    nodes,
    edges,
    arduinoCode: selectedLanguage === "cpp" ? code : "",
    picoCode: selectedLanguage === "python" ? code : "",
    boardType: "esp32",
    selectedLanguage,
    dynamicComponents: [],
  } as any;
}

function buildBaseFrame(): SimulationFrame {
  return {
    tick: 1,
    boardType: "esp32",
    running: true,
    error: null,
    serialOutput: [],
    components: {},
    timestamp: 100,
    boardPins: [],
  } as any;
}

console.log("=================== ESP32 PWM FRAME TRANSFORMER TESTS ===================\n");

// --- TEST 1: 0% duty → LED not powered ---
console.log("--- TEST 1: PWM 0% duty → LED not powered ---");
{
  const code = `
from machine import Pin, PWM
pwm = PWM(Pin(2))
pwm.freq(1000)
pwm.duty_u16(0)
`;
  const ctx   = buildContext(code);
  const frame = applyEsp32SimulationToFrame(buildBaseFrame(), ctx);
  const esp32 = frame.components["esp32-node-1"];
  const led   = frame.components["led-node-1"];

  const pinVoltage = esp32?.pins?.["gpio2"]?.voltage ?? -1;
  const pwmDuty    = esp32?.telemetry?.["gpio2_pwm_duty"] ?? -1;

  assert("esp32 gpio2 voltage = 0V at 0% duty", pinVoltage === 0);
  assert("gpio2_pwm_duty telemetry = 0", pwmDuty === 0);
  assert("LED isPowered = false at 0% duty", (led?.isPowered ?? true) === false);
  assert("LED brightness = 0 at 0% duty", (led?.brightness ?? -1) === 0);
  console.log(`  [Trace] gpio2 voltage = ${pinVoltage}V, pwmDuty = ${pwmDuty}%, LED brightness = ${led?.brightness?.toFixed(3) ?? "N/A"}`);
}

// --- TEST 2: 100% duty → LED fully powered ---
console.log("\n--- TEST 2: PWM 100% duty → LED fully powered ---");
{
  const code = `
from machine import Pin, PWM
pwm = PWM(Pin(2))
pwm.freq(1000)
pwm.duty_u16(65535)
`;
  const ctx   = buildContext(code);
  const frame = applyEsp32SimulationToFrame(buildBaseFrame(), ctx);
  const esp32 = frame.components["esp32-node-1"];
  const led   = frame.components["led-node-1"];

  const pinVoltage = esp32?.pins?.["gpio2"]?.voltage ?? -1;
  const pwmDuty    = (esp32?.telemetry?.["gpio2_pwm_duty"] as any) ?? -1;

  assert("esp32 gpio2 voltage = 3.3V at 100% duty", Math.abs(pinVoltage - 3.3) < 0.01);
  assert("gpio2_pwm_duty telemetry = 100", Math.abs((pwmDuty as number) - 100) < 0.2);
  assert("LED isPowered = true at 100% duty", (led?.isPowered ?? false) === true);
  assert("LED brightness > 0 at 100% duty", (led?.brightness ?? 0) > 0);
  console.log(`  [Trace] gpio2 voltage = ${pinVoltage}V, pwmDuty = ${pwmDuty}%, LED brightness = ${led?.brightness?.toFixed(3) ?? "N/A"}`);
}

// --- TEST 3: 75% duty → intermediate voltage ---
console.log("\n--- TEST 3: PWM 75% duty → intermediate voltage ---");
{
  const code = `
from machine import Pin, PWM
pwm = PWM(Pin(2))
pwm.duty(767)
`;
  const ctx   = buildContext(code);
  const frame = applyEsp32SimulationToFrame(buildBaseFrame(), ctx);
  const esp32 = frame.components["esp32-node-1"];
  const led   = frame.components["led-node-1"];

  const pinVoltage = esp32?.pins?.["gpio2"]?.voltage ?? -1;
  const pwmDuty    = (esp32?.telemetry?.["gpio2_pwm_duty"] as any) ?? -1;
  // 767/1023*100 ≈ 75%
  assert("gpio2 voltage ≈ 2.475V (3.3V × 75%)", Math.abs(pinVoltage - 2.475) < 0.05);
  assert("gpio2_pwm_duty telemetry ≈ 75%", Math.abs((pwmDuty as number) - 75) < 1.0);
  console.log(`  [Trace] gpio2 voltage = ${pinVoltage.toFixed(3)}V, pwmDuty = ${pwmDuty}%, LED brightness = ${led?.brightness?.toFixed(3) ?? "N/A"}`);
}

// --- TEST 4: gpio2_pwm_freq telemetry is populated when freq is set ---
console.log("\n--- TEST 4: freqHz telemetry populated ---");
{
  const code = `
from machine import Pin, PWM
pwm = PWM(Pin(2))
pwm.freq(5000)
pwm.duty_u16(32768)
`;
  const ctx   = buildContext(code);
  const frame = applyEsp32SimulationToFrame(buildBaseFrame(), ctx);
  const esp32 = frame.components["esp32-node-1"];
  const freq  = esp32?.telemetry?.["gpio2_pwm_freq"] ?? -1;
  assert("gpio2_pwm_freq telemetry = 5000", freq === 5000);
}

// --- TEST 5: Forbidden GPIO8 → no effect on frame ---
console.log("\n--- TEST 5: Forbidden GPIO8 → no gpio8 pin entry in esp32 ---");
{
  const code = `
from machine import Pin, PWM
pwm = PWM(Pin(8))
pwm.duty_u16(65535)
`;
  const ctx   = buildContext(code);
  const frame = applyEsp32SimulationToFrame(buildBaseFrame(), ctx);
  const esp32 = frame.components["esp32-node-1"];
  const gpio8 = esp32?.pins?.["gpio8"];
  assert("Forbidden gpio8 has no powered pin entry", !gpio8 || gpio8.voltage === 0);
}

console.log("\n=================== ESP32 PWM FRAME TRANSFORMER TESTS COMPLETE ===================");
const exitCode = process.exitCode ?? 0;
if (exitCode === 0) {
  console.log("✅ All ESP32 PWM Frame Transformer tests passed.");
} else {
  console.log(`❌ Some tests FAILED.`);
}
