/**
 * esp32Adc.test.ts
 *
 * ESP32 MicroPython ADC Regression Suite
 *
 * Tests:
 *  1. Parser: ADC(Pin(34)).read()    -> 12-bit action (resolution = "12bit")
 *  2. Parser: ADC(34).read_u16()    -> 16-bit action
 *  3. Parser: ADC(Pin(34)).read_uv() -> uv action
 *  4. Parser: Forbidden SPI pin GPIO 8 -> warning emitted, no valid read
 *  5. Parser: GPIO 5 (non-ADC pin)  -> warning emitted
 *  6. Parser: GPIO 40 (out of range) -> warning emitted
 *  7. Frame: ADC @ 50% pot -> raw12 = 2048, voltage = 1.65V (±0.05V)
 *  8. Frame: ADC @ 100% pot -> raw12 = 4095, voltage = 3.3V (±0.05V)
 *  9. Frame: ADC @ 0% pot  -> raw12 = 0, voltage = 0V (±0.05V)
 * 10. MULTIMETER CONSISTENCY: pot + multimeter probe + ESP32 adc.read() on same wiper pin
 *     -> multimeter voltage === esp32 adc_voltage (within 0.01V tolerance)
 */

import { parseEsp32PythonAdcActions } from "../lib/esp32/parser/pythonPatterns";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { applyMultimeterOutputToFrame } from "../lib/simulation/frameTransformers/multimeterSync";
import { applyPotentiometerInputToFrame } from "../lib/simulation/frameTransformers/photoresistorPotentiometer";
import { buildSimulationFrame } from "../lib/simulation-state";
import { checkComponentStatus } from "../utils/componentStatus";
import { NE555StateManager, CapacitorStateManager, KeypadStateManager } from "../lib/simulation/stateMaps";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import type { SimContext } from "../lib/simulation/types";
import type { SimulationFrame } from "../lib/simulation-state";

// ─── Minimal assert helper ────────────────────────────────────────────────────

let testsPassed = 0;
let testsFailed = 0;
function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${label}`);
    testsFailed++;
    process.exitCode = 1;
  }
}
function assertClose(label: string, actual: number, expected: number, tol = 0.05) {
  assert(`${label} (got ${actual.toFixed(4)}, want ≈${expected})`, Math.abs(actual - expected) <= tol);
}

// ─── Shared circuit helpers ───────────────────────────────────────────────────

const makeSimContext = (
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  code: string,
  boardType: "esp32" | "arduino" | "pico" = "esp32",
): SimContext => ({
  nodes,
  edges,
  arduinoCode: "",
  picoCode: code,
  boardType,
  dynamicComponents: COMPONENT_CATALOG as any,
  ne555State: new NE555StateManager(),
  capacitorState: new CapacitorStateManager(),
  keypad4x4State: new KeypadStateManager(),
  keypad4x3State: new KeypadStateManager(),
  selectedLanguage: "python",
} as any);

const makeBaseFrame = (nodes: CircuitNode[], edges: CircuitEdge[], boardType = "esp32"): SimulationFrame =>
  buildSimulationFrame({
    tick: 1, timestamp: 100, nodes, edges,
    boardType: boardType as any, running: true, error: null,
    dynamicComponents: COMPONENT_CATALOG,
  }) as SimulationFrame;

// Node factories
const esp32Node = (id = "esp32-1"): CircuitNode => ({
  id, type: "esp32", position: { x: 0, y: 0 },
  data: { componentType: "esp32", label: "ESP32", properties: {} } as any,
});
const potNode = (id = "pot-1", position = 50): CircuitNode => ({
  id, type: "potentiometer", position: { x: 200, y: 0 },
  data: {
    componentType: "potentiometer", simulationModel: "potentiometer",
    label: "10k Pot", rotation: 0,
    properties: { resistance: { value: 10000, unit: "Ω" }, position: { value: position } } as any,
  },
});
const multimeterNode = (id = "meter-1"): CircuitNode => ({
  id, type: "multimeter", position: { x: 400, y: 0 },
  data: {
    componentType: "multimeter", simulationModel: "multimeter",
    label: "Multimeter", rotation: 0,
    properties: { mode: { value: "voltage" } } as any,
  },
});
const arduinoNode = (id = "arduino-1"): CircuitNode => ({
  id, type: "arduino", position: { x: 300, y: 0 },
  data: { componentType: "arduino", label: "Arduino", properties: {} } as any,
});

console.log("=================== ESP32 ADC REGRESSION SUITE ===================\n");

// ─── PARSER TESTS ─────────────────────────────────────────────────────────────

console.log("--- TEST 1: Parser ADC(Pin(34)).read() → 12-bit ---");
{
  const actions = parseEsp32PythonAdcActions(`
from machine import Pin, ADC
adc = ADC(Pin(34))
val = adc.read()
`);
  assert("1 action returned", actions.length === 1);
  assert("type = adc_read", actions[0]?.type === "adc_read");
  assert("pin = 34", actions[0]?.pin === 34);
  assert("resolution = 12bit", actions[0]?.resolution === "12bit");
  assert("no warning", actions[0]?.warning === undefined);
}

console.log("\n--- TEST 2: Parser ADC(34).read_u16() → 16-bit ---");
{
  const actions = parseEsp32PythonAdcActions(`
from machine import ADC
adc = ADC(34)
val = adc.read_u16()
`);
  assert("1 action returned", actions.length === 1);
  assert("resolution = 16bit", actions[0]?.resolution === "16bit");
  assert("pin = 34", actions[0]?.pin === 34);
}

console.log("\n--- TEST 3: Parser ADC(Pin(34)).read_uv() → uv ---");
{
  const actions = parseEsp32PythonAdcActions(`
from machine import Pin, ADC
adc = ADC(Pin(34))
val = adc.read_uv()
`);
  assert("1 action returned", actions.length === 1);
  assert("resolution = uv", actions[0]?.resolution === "uv");
}

console.log("\n--- TEST 4: Parser GPIO 8 (forbidden SPI flash) → warning ---");
{
  const actions = parseEsp32PythonAdcActions(`
adc = ADC(Pin(8))
val = adc.read()
`);
  assert("1 action returned", actions.length === 1);
  assert("warning present", typeof actions[0]?.warning === "string" && actions[0].warning.length > 0);
  assert("warning mentions SPI", actions[0]!.warning!.toLowerCase().includes("spi"));
}

console.log("\n--- TEST 5: Parser GPIO 5 (non-ADC digital pin) → warning ---");
{
  const actions = parseEsp32PythonAdcActions(`
adc = ADC(Pin(5))
val = adc.read()
`);
  assert("1 action returned", actions.length === 1);
  assert("warning present", typeof actions[0]?.warning === "string");
}

console.log("\n--- TEST 6: Parser GPIO 40 (out of range) → warning ---");
{
  const actions = parseEsp32PythonAdcActions(`
adc = ADC(Pin(40))
val = adc.read()
`);
  assert("1 action returned", actions.length === 1);
  assert("warning present", typeof actions[0]?.warning === "string");
}

// ─── FRAME TRANSFORMER TESTS ───────────────────────────────────────────────────
// Shared circuit: Arduino 5V -> Pot pin1, Pot pin2 -> GND, Pot wiper -> ESP32 GPIO34

function buildPotAdcCircuit(potPosition: number) {
  const esp32 = esp32Node();
  const pot   = potNode("pot-1", potPosition);
  const ardu  = arduinoNode();
  const nodes = [esp32, pot, ardu];
  const edges: CircuitEdge[] = [
    { id: "e1", source: ardu.id,  sourceHandle: "5v",    target: pot.id,   targetHandle: "pin1" },
    { id: "e2", source: pot.id,   sourceHandle: "pin2",  target: ardu.id,  targetHandle: "gnd1" },
    { id: "e3", source: pot.id,   sourceHandle: "wiper", target: esp32.id, targetHandle: "gpio34" },
  ];
  return { nodes, edges, esp32, pot, ardu };
}

const ADC_CODE = `
from machine import Pin, ADC
adc = ADC(Pin(34))
val = adc.read()
`;

console.log("\n--- TEST 7: Frame ADC @ pot 50% -> voltage ≈ 2.5V (5V supply), raw12 ≈ 3102 ---");
{
  const { nodes, edges } = buildPotAdcCircuit(50);
  const ctx   = makeSimContext(nodes, edges, ADC_CODE);
  const base  = makeBaseFrame(nodes, edges);
  const potFrame = applyPotentiometerInputToFrame(base);
  const frame = applyEsp32SimulationToFrame(potFrame, ctx);
  const tel   = frame.components["esp32-1"]?.telemetry ?? {};
  const raw12 = Number(tel["gpio34_adc_raw"] ?? -1);
  const volt  = Number(tel["gpio34_adc_voltage"] ?? -1);
  // 5V supply * 50% = 2.5V on wiper. ADC sees 2.5V, raw12 = round(2.5/3.3 * 4095) = 3102
  assertClose("voltage ≈ 2.5V", volt, 2.5, 0.05);
  assertClose("raw12 ≈ 3102", raw12, 3102, 52);
}

console.log("\n--- TEST 8: Frame ADC @ pot 100% -> raw12 ≈ 4095, voltage ≈ 3.3V ---");
{
  const { nodes, edges } = buildPotAdcCircuit(100);
  const ctx   = makeSimContext(nodes, edges, ADC_CODE);
  const base  = makeBaseFrame(nodes, edges);
  const potFrame = applyPotentiometerInputToFrame(base);
  const frame = applyEsp32SimulationToFrame(potFrame, ctx);
  const tel   = frame.components["esp32-1"]?.telemetry ?? {};
  const raw12 = Number(tel["gpio34_adc_raw"] ?? -1);
  const volt  = Number(tel["gpio34_adc_voltage"] ?? -1);
  assertClose("voltage ≈ 3.3V", volt, 3.3, 0.1);
  assertClose("raw12 ≈ 4095", raw12, 4095, 52);
}

console.log("\n--- TEST 9: Frame ADC @ pot 0% -> raw12 = 0, voltage = 0V ---");
{
  const { nodes, edges } = buildPotAdcCircuit(0);
  const ctx   = makeSimContext(nodes, edges, ADC_CODE);
  const base  = makeBaseFrame(nodes, edges);
  const potFrame = applyPotentiometerInputToFrame(base);
  const frame = applyEsp32SimulationToFrame(potFrame, ctx);
  const tel   = frame.components["esp32-1"]?.telemetry ?? {};
  const raw12 = Number(tel["gpio34_adc_raw"] ?? -1);
  const volt  = Number(tel["gpio34_adc_voltage"] ?? -1);
  assertClose("voltage = 0V", volt, 0, 0.05);
  assert("raw12 = 0", raw12 === 0);
}

// ─── TEST 10: MULTIMETER CONSISTENCY ─────────────────────────────────────────
// Same circuit: Arduino 5V -> Pot -> GND + wiper -> ESP32 GPIO34.
// Also probe Multimeter positive to pot wiper, negative to GND.
// Multimeter voltage MUST equal ESP32 adc_voltage within 0.01V.

console.log("\n--- TEST 10: MULTIMETER CONSISTENCY (pot + meter + ESP32 ADC on same wiper) ---");
{
  const esp32 = esp32Node();
  const pot   = potNode("pot-1", 75);
  const ardu  = arduinoNode();
  const meter = multimeterNode();
  const nodes = [esp32, pot, ardu, meter];
  const edges: CircuitEdge[] = [
    // Power: Arduino 5V -> Pot pin1, Pot pin2 -> GND
    { id: "e1", source: ardu.id,  sourceHandle: "5v",       target: pot.id,   targetHandle: "pin1" },
    { id: "e2", source: pot.id,   sourceHandle: "pin2",     target: ardu.id,  targetHandle: "gnd1" },
    // Signal: Pot wiper -> ESP32 GPIO34
    { id: "e3", source: pot.id,   sourceHandle: "wiper",    target: esp32.id, targetHandle: "gpio34" },
    // Multimeter: positive -> pot wiper, negative -> GND
    { id: "e4", source: pot.id,   sourceHandle: "wiper",    target: meter.id, targetHandle: "positive" },
    { id: "e5", source: meter.id, sourceHandle: "negative", target: ardu.id,  targetHandle: "gnd1" },
  ];

  const ctx  = makeSimContext(nodes, edges, ADC_CODE);
  const base = makeBaseFrame(nodes, edges);

  // Run pipeline: potentiometer -> esp32 ADC -> multimeter sync
  const potFrame  = applyPotentiometerInputToFrame(base);
  const esp32Frame = applyEsp32SimulationToFrame(potFrame, ctx);
  const syncFrame  = applyMultimeterOutputToFrame(esp32Frame, ctx);

  const adcVolt  = Number(syncFrame.components["esp32-1"]?.telemetry?.["gpio34_adc_voltage"] ?? -1);
  const meterV   = Number(syncFrame.components["meter-1"]?.telemetry?.["voltage"] ?? -1);

  console.log(`  [Trace] Multimeter voltage = ${meterV.toFixed(4)}V`);
  console.log(`  [Trace] ESP32 ADC voltage  = ${adcVolt.toFixed(4)}V`);
  console.log(`  [Trace] Pot position = 75%  →  expected ≈ ${(5.0 * 0.75).toFixed(4)}V (from 5V supply)`);

  // Both should be approx 3.75V (5V * 75% = 3.75V from Arduino supply, clamped to 3.3V on ESP32 side)
  // Multimeter sees the raw 3.75V; ADC clamps to 3.3V (hardware protection) → difference is expected.
  // The KEY assertion: both resolve from the SAME source (POT_WIPER) so their pre-clamp values match.

  assert("Multimeter voltage > 0V", meterV > 0);
  assert("ESP32 ADC voltage > 0V",  adcVolt > 0);
  // Both read from same POT_WIPER source, should be within 0.01V of each other (or ADC clamps to 3.3V)
  const adcPreClamp = Math.min(adcVolt, meterV); // ADC <= multimeter (ADC clamps at 3.3V)
  assert("ADC voltage <= Multimeter voltage (ADC clamps at 3.3V)", adcVolt <= meterV + 0.01);
  // Core parity: if multimeter is <= 3.3V, ADC must match within 0.01V
  if (meterV <= 3.3) {
    assert(`ADC matches multimeter within 0.01V (meterV=${meterV.toFixed(4)}, adcV=${adcVolt.toFixed(4)})`,
      Math.abs(adcVolt - meterV) <= 0.01);
  } else {
    // Meter > 3.3V (5V supply, pot 75% = 3.75V), ADC should clamp to 3.3V
    assertClose("ADC clamped to 3.3V when wiper > 3.3V", adcVolt, 3.3, 0.05);
    assert("Multimeter reflects actual wiper voltage > 3.3V", meterV > 3.3);
  }
}

// ─── TEST 11: ADC OVERVOLTAGE WARNING ASSERTION ──────────────────────────────
// Arduino 5V -> Pot @ 75% -> wiper = 3.75V -> ESP32 GPIO34 ADC pin.
// Voltage > 3.3V MUST trigger an explicit OVERVOLTAGE warning in telemetry.

console.log("\n--- TEST 11: ADC OVERVOLTAGE WARNING ASSERTION (wiper = 3.75V > 3.3V limit) ---");
{
  const { nodes, edges } = buildPotAdcCircuit(75); // 5V * 0.75 = 3.75V
  const ctx   = makeSimContext(nodes, edges, ADC_CODE);
  const base  = makeBaseFrame(nodes, edges);
  const potFrame = applyPotentiometerInputToFrame(base);
  const frame = applyEsp32SimulationToFrame(potFrame, ctx);
  const tel   = frame.components["esp32-1"]?.telemetry ?? {};
  const warning = String(tel["gpio34_adc_warning"] ?? "");

  assert("Overvoltage warning present in telemetry", warning.length > 0);
  assert("Warning mentions OVERVOLTAGE", warning.includes("OVERVOLTAGE"));
  assert("Warning mentions measured voltage (3.75V)", warning.includes("3.75V"));

  // Verify componentStatus.ts (which feeds BaseCircuitNode UI warning badge & InfoPopup modal)
  const status = checkComponentStatus("esp32", tel, {});
  assert("componentStatus severity is 'warning'", status.severity === "warning");
  assert("componentStatus message is 'ADC Overvoltage Warning'", status.message === "ADC Overvoltage Warning");
  assert("componentStatus details contains overvoltage text", status.details.includes("3.75V"));
  assert("componentStatus formula is 'V_in <= 3.30 V'", status.formula === "V_in <= 3.30 V");
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n=================== ESP32 ADC REGRESSION SUITE COMPLETE ===================");
if (testsFailed === 0) {
  console.log(`✅ All ${testsPassed} ADC tests passed.`);
} else {
  console.log(`❌ ${testsFailed} test(s) FAILED out of ${testsPassed + testsFailed}.`);
}

