import { strict as assert } from "assert";
import { getAnalogValueForPicoPin } from "../lib/codeParsing/picoAnalogPins";
import { parsePythonReadOutputsForInput } from "../lib/codeParsing/picoParser";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { buildSimulationFrame } from "../lib/simulation-state";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";

console.log("=================== ESP32 ADC PIN VALIDATION REGRESSION SUITE ===================");

const esp32Node: CircuitNode = {
  id: "esp32-1",
  type: "esp32",
  position: { x: 100, y: 100 },
  data: {
    componentType: "esp32",
    label: "ESP32 DevKit V1",
    rotation: 0,
    properties: { name: { label: "Name", type: "string", value: "ESP32_1" } },
  },
};

// ─── TEST GROUP 1: MQ-2 Gas Sensor Pin Validation ───────────────────────────

const gasNode: CircuitNode = {
  id: "gas-1",
  type: "gasSensor",
  position: { x: 400, y: 100 },
  data: {
    componentType: "gasSensor",
    label: "Gas Sensor",
    rotation: 0,
    properties: {
      name: { label: "Name", type: "string", value: "GAS1" },
      gasLevel: { label: "Gas Level", type: "number", value: 600, min: 0, max: 1023 },
    },
  },
};

// Correct wiring: a1/a2 jumpers, b1/b2 jumpers, h1->a1, h2->gnd, 3v3->a1, b1->gpio34
const gasEdgesWired: CircuitEdge[] = [
  { id: "e1", source: "gas-1", sourceHandle: "a1", target: "gas-1", targetHandle: "a2" },
  { id: "e2", source: "gas-1", sourceHandle: "b1", target: "gas-1", targetHandle: "b2" },
  { id: "e3", source: "gas-1", sourceHandle: "h1", target: "gas-1", targetHandle: "a1" },
  { id: "e4", source: "gas-1", sourceHandle: "h2", target: "esp32-1", targetHandle: "esp32_gnd1" },
  { id: "e5", source: "esp32-1", sourceHandle: "esp32_3v3", target: "gas-1", targetHandle: "a1" },
  { id: "e6", source: "esp32-1", sourceHandle: "gpio34", target: "gas-1", targetHandle: "b1" },
];

console.log("\n--- TEST 1: MQ-2 Gas Sensor - Correctly Wired Pin (GPIO34) ---");
const expectedGas12 = Math.round((600 / 1023) * 4095); // 2402
const expectedGas16 = Math.round((600 / 1023) * 65535); // 38437
const expectedGasUv = Math.round((600 / 1023) * 3300000); // 1935484

const valGas12 = getAnalogValueForPicoPin(34, [esp32Node, gasNode], gasEdgesWired, "12bit");
const valGas16 = getAnalogValueForPicoPin(34, [esp32Node, gasNode], gasEdgesWired, "u16");
const valGasUv = getAnalogValueForPicoPin(34, [esp32Node, gasNode], gasEdgesWired, "uv");

assert.equal(valGas12, expectedGas12, `12-bit ADC value should be ${expectedGas12}, got ${valGas12}`);
assert.equal(valGas16, expectedGas16, `16-bit ADC value should be ${expectedGas16}, got ${valGas16}`);
assert.equal(valGasUv, expectedGasUv, `uv ADC value should be ${expectedGasUv}, got ${valGasUv}`);
console.log(`  [PASS] Wired GPIO34: 12bit=${valGas12}, 16bit=${valGas16}, uv=${valGasUv}`);

// AST execution check for wired pin
useCircuitStore.setState({ nodes: [esp32Node, gasNode], edges: gasEdgesWired, selectedLanguage: "python" } as any);
const codeWiredGas = `
from machine import Pin, ADC
gas = ADC(Pin(34))
print("GAS_WIRED:", gas.read())
`;
const resWiredGas = parsePythonReadOutputsForInput(codeWiredGas, -1, false, 0);
assert(resWiredGas !== null, "Execution result should not be null");
assert.equal(resWiredGas.serialLines[0], `GAS_WIRED: ${expectedGas12}`);
console.log(`  [PASS] AST Execution ADC(Pin(34)).read() printed ${expectedGas12}`);

// Frame transformer telemetry check
const frameGas0 = buildSimulationFrame({
  tick: 1,
  timestamp: 0,
  nodes: [esp32Node, gasNode],
  edges: gasEdgesWired,
  boardType: "esp32",
  running: true,
});
const ctxGasWired = {
  nodes: [esp32Node, gasNode],
  edges: gasEdgesWired,
  picoCode: codeWiredGas,
  arduinoCode: "",
  dynamicComponents: [],
  selectedLanguage: "python",
  boardType: "esp32",
};
const resGasFrame = applyEsp32SimulationToFrame(frameGas0, ctxGasWired as any);
const telGas = resGasFrame.components["esp32-1"]?.telemetry;
assert.equal(telGas?.gpio34_adc_raw, expectedGas12, `Telemetry raw12 should match ${expectedGas12}`);
console.log(`  [PASS] Frame telemetry gpio34_adc_raw matches AST read(): ${telGas?.gpio34_adc_raw}`);

console.log("\n--- TEST 2: MQ-2 Gas Sensor - Unwired Pin (GPIO32) ---");
const valGasUnwired = getAnalogValueForPicoPin(32, [esp32Node, gasNode], gasEdgesWired, "12bit");
assert.equal(valGasUnwired, 0, `Unwired GPIO32 must return 0, got ${valGasUnwired}`);
console.log(`  [PASS] Direct getAnalogValueForPicoPin(32) returned 0`);

const codeUnwiredGas = `
from machine import Pin, ADC
gas = ADC(Pin(32))
print("GAS_UNWIRED:", gas.read())
`;
const resUnwiredGas = parsePythonReadOutputsForInput(codeUnwiredGas, -1, false, 0);
assert(resUnwiredGas !== null, "Execution result should not be null");
assert.equal(resUnwiredGas.serialLines[0], "GAS_UNWIRED: 0");
console.log(`  [PASS] AST Execution ADC(Pin(32)).read() printed 0`);

const ctxGasUnwired = {
  nodes: [esp32Node, gasNode],
  edges: gasEdgesWired,
  picoCode: codeUnwiredGas,
  arduinoCode: "",
  dynamicComponents: [],
  selectedLanguage: "python",
  boardType: "esp32",
};
const resGasUnwiredFrame = applyEsp32SimulationToFrame(frameGas0, ctxGasUnwired as any);
const telGasUnwired = resGasUnwiredFrame.components["esp32-1"]?.telemetry;
assert.equal(telGasUnwired?.gpio32_adc_raw, 0, `Unwired pin telemetry raw12 must be 0`);
assert.equal(telGasUnwired?.gpio32_adc_voltage, 0, `Unwired pin telemetry voltage must be 0`);
console.log(`  [PASS] Frame telemetry gpio32_adc_raw is 0, gpio32_adc_voltage is 0`);

console.log("\n--- TEST 3: MQ-2 Gas Sensor - Power Pin Miswire (GPIO32 -> a1) ---");
// Miswire: GPIO32 is wired to power pin a1, while real sensor output is on GPIO34
const gasEdgesPowerMiswire: CircuitEdge[] = [
  ...gasEdgesWired,
  { id: "e-miswire", source: "esp32-1", sourceHandle: "gpio32", target: "gas-1", targetHandle: "a1" },
];
const valGasPowerMiswire = getAnalogValueForPicoPin(32, [esp32Node, gasNode], gasEdgesPowerMiswire, "12bit");
assert.equal(valGasPowerMiswire, 0, `Power pin a1 must NOT be treated as signal pin, expected 0, got ${valGasPowerMiswire}`);
console.log(`  [PASS] Direct getAnalogValueForPicoPin(32) on power pin a1 returned 0 (Flaw A fixed)`);

// ─── TEST GROUP 2: Soil Moisture Sensor Pin Validation ───────────────────────

const soilNode: CircuitNode = {
  id: "soil-1",
  type: "soilMoisture",
  position: { x: 400, y: 100 },
  data: {
    componentType: "soilMoisture",
    label: "Soil Moisture Sensor",
    rotation: 0,
    properties: {
      name: { label: "Name", type: "string", value: "SOIL1" },
      moisture: { label: "Moisture", type: "number", value: 500, min: 0, max: 1023 },
    },
  },
};

const soilEdgesWired: CircuitEdge[] = [
  { id: "s1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "soil-1", targetHandle: "vcc" },
  { id: "s2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "soil-1", targetHandle: "gnd" },
  { id: "s3", source: "esp32-1", sourceHandle: "gpio34", target: "soil-1", targetHandle: "sig" },
];

console.log("\n--- TEST 4: Soil Moisture - Correctly Wired Pin (GPIO34) ---");
const expectedSoil12 = Math.round((500 / 1023) * 4095); // 2001

const valSoil12 = getAnalogValueForPicoPin(34, [esp32Node, soilNode], soilEdgesWired, "12bit");
assert.equal(valSoil12, expectedSoil12, `12-bit ADC value should be ${expectedSoil12}, got ${valSoil12}`);
console.log(`  [PASS] Wired GPIO34 12bit: ${valSoil12}`);

useCircuitStore.setState({ nodes: [esp32Node, soilNode], edges: soilEdgesWired, selectedLanguage: "python" } as any);
const codeWiredSoil = `
from machine import Pin, ADC
soil = ADC(Pin(34))
print("SOIL_WIRED:", soil.read())
`;
const resWiredSoil = parsePythonReadOutputsForInput(codeWiredSoil, -1, false, 0);
assert(resWiredSoil !== null, "Execution result should not be null");
assert.equal(resWiredSoil.serialLines[0], `SOIL_WIRED: ${expectedSoil12}`);
console.log(`  [PASS] AST Execution ADC(Pin(34)).read() printed ${expectedSoil12}`);

const frameSoil0 = buildSimulationFrame({
  tick: 1,
  timestamp: 0,
  nodes: [esp32Node, soilNode],
  edges: soilEdgesWired,
  boardType: "esp32",
  running: true,
});
const ctxSoilWired = {
  nodes: [esp32Node, soilNode],
  edges: soilEdgesWired,
  picoCode: codeWiredSoil,
  arduinoCode: "",
  dynamicComponents: [],
  selectedLanguage: "python",
  boardType: "esp32",
};
const resSoilFrame = applyEsp32SimulationToFrame(frameSoil0, ctxSoilWired as any);
const telSoil = resSoilFrame.components["esp32-1"]?.telemetry;
assert.equal(telSoil?.gpio34_adc_raw, expectedSoil12, `Telemetry raw12 should match ${expectedSoil12}`);
console.log(`  [PASS] Frame telemetry gpio34_adc_raw matches AST read(): ${telSoil?.gpio34_adc_raw}`);

console.log("\n--- TEST 5: Soil Moisture - Unwired Pin (GPIO32) ---");
const valSoilUnwired = getAnalogValueForPicoPin(32, [esp32Node, soilNode], soilEdgesWired, "12bit");
assert.equal(valSoilUnwired, 0, `Unwired GPIO32 must return 0, got ${valSoilUnwired}`);
console.log(`  [PASS] Direct getAnalogValueForPicoPin(32) returned 0`);

const codeUnwiredSoil = `
from machine import Pin, ADC
soil = ADC(Pin(32))
print("SOIL_UNWIRED:", soil.read())
`;
const resUnwiredSoil = parsePythonReadOutputsForInput(codeUnwiredSoil, -1, false, 0);
assert(resUnwiredSoil !== null, "Execution result should not be null");
assert.equal(resUnwiredSoil.serialLines[0], "SOIL_UNWIRED: 0");
console.log(`  [PASS] AST Execution ADC(Pin(32)).read() printed 0`);

const ctxSoilUnwired = {
  nodes: [esp32Node, soilNode],
  edges: soilEdgesWired,
  picoCode: codeUnwiredSoil,
  arduinoCode: "",
  dynamicComponents: [],
  selectedLanguage: "python",
  boardType: "esp32",
};
const resSoilUnwiredFrame = applyEsp32SimulationToFrame(frameSoil0, ctxSoilUnwired as any);
const telSoilUnwired = resSoilUnwiredFrame.components["esp32-1"]?.telemetry;
assert.equal(telSoilUnwired?.gpio32_adc_raw, 0, `Unwired pin telemetry raw12 must be 0`);
assert.equal(telSoilUnwired?.gpio32_adc_voltage, 0, `Unwired pin telemetry voltage must be 0`);
console.log(`  [PASS] Frame telemetry gpio32_adc_raw is 0, gpio32_adc_voltage is 0`);

console.log("\n--- TEST 6: Soil Moisture - Power Pin Miswire (GPIO32 -> vcc) ---");
// Miswire: GPIO32 is wired to vcc pin
const soilEdgesPowerMiswire: CircuitEdge[] = [
  ...soilEdgesWired,
  { id: "s-miswire", source: "esp32-1", sourceHandle: "gpio32", target: "soil-1", targetHandle: "vcc" },
];
const valSoilPowerMiswire = getAnalogValueForPicoPin(32, [esp32Node, soilNode], soilEdgesPowerMiswire, "12bit");
assert.equal(valSoilPowerMiswire, 0, `Power pin vcc must NOT be treated as signal pin, expected 0, got ${valSoilPowerMiswire}`);
console.log(`  [PASS] Direct getAnalogValueForPicoPin(32) on power pin vcc returned 0`);

console.log("\n=================== ALL ADC PIN VALIDATION TESTS PASSED 100% ===================");
