import { strict as assert } from "assert";
import { useCircuitStore } from "../lib/store";
import { parsePythonReadOutputsForInput } from "../lib/codeParsing/picoParser";
import { getAnalogValueForPicoPin } from "../lib/codeParsing/picoAnalogPins";
import type { CircuitNode, CircuitEdge } from "../lib/types";

console.log("=================== RUNNING ESP32 SOIL MOISTURE ADC TESTS ===================");

const esp32Node: CircuitNode = {
  id: "esp32-1",
  type: "esp32",
  position: { x: 100, y: 100 },
  data: {
    componentType: "esp32",
    label: "ESP32 DevKit V1",
    rotation: 0,
    properties: {},
  },
};

const soilNode: CircuitNode = {
  id: "soil-1",
  type: "soilMoisture",
  position: { x: 300, y: 100 },
  data: {
    componentType: "soilMoisture",
    label: "Soil Moisture Sensor",
    rotation: 0,
    properties: {
      moisture: {
        label: "Moisture",
        type: "number",
        value: 295, // 295 / 1023 -> 28.8%
      },
    },
  },
};

const edges: CircuitEdge[] = [
  {
    id: "w1",
    source: "soil-1",
    sourceHandle: "vcc1",
    target: "esp32-1",
    targetHandle: "esp32_3v3",
    type: "wire",
    data: { color: "#22c55e" },
  },
  {
    id: "w2",
    source: "soil-1",
    sourceHandle: "gnd1",
    target: "esp32-1",
    targetHandle: "esp32_gnd2",
    type: "wire",
    data: { color: "#22c55e" },
  },
  {
    id: "w3",
    source: "soil-1",
    sourceHandle: "sig1",
    target: "esp32-1",
    targetHandle: "gpio34",
    type: "wire",
    data: { color: "#22c55e" },
  },
];

const nodes = [esp32Node, soilNode];

// --- TEST 1: Direct getAnalogValueForPicoPin with ESP32 board and 12-bit / u16 / uv resolutions ---
console.log("\n--- TEST 1: Direct getAnalogValueForPicoPin Resolution Tests ---");
const val12 = getAnalogValueForPicoPin(34, nodes, edges, "12bit");
const val16 = getAnalogValueForPicoPin(34, nodes, edges, "u16");
const valUv = getAnalogValueForPicoPin(34, nodes, edges, "uv");

const expected12 = Math.round((295 / 1023) * 4095); // 1181
const expected16 = Math.round((295 / 1023) * 65535); // 18899
const expectedUv = Math.round((295 / 1023) * 3300000); // 951613

assert.equal(val12, expected12, `12-bit ADC value should be ${expected12}, got ${val12}`);
assert.equal(val16, expected16, `16-bit ADC value should be ${expected16}, got ${val16}`);
assert.equal(valUv, expectedUv, `uv ADC value should be ${expectedUv}, got ${valUv}`);
console.log(`  [PASS] 12-bit read(): ${val12} (Expected: ${expected12})`);
console.log(`  [PASS] 16-bit read_u16(): ${val16} (Expected: ${expected16})`);
console.log(`  [PASS] Microvolt read_uv(): ${valUv} (Expected: ${expectedUv})`);

// --- TEST 2: Full AST execution of user MicroPython code ---
console.log("\n--- TEST 2: Full AST MicroPython Execution & Print Arguments ---");
useCircuitStore.setState({ nodes, edges, selectedLanguage: "python" } as any);

const code = `from machine import Pin, ADC
import time

soil_pin = ADC(Pin(34))
soil_pin.atten(ADC.ATTN_11DB)
buzzer_pin = Pin(25, Pin.OUT)
WET_THRESHOLD = 500

while True:
    moisture = soil_pin.read()
    print("Soil Moisture:", moisture)
    if moisture >= WET_THRESHOLD:
        print("WET - BUZZER ON")
    else:
        print("DRY - BUZZER OFF")
    time.sleep_ms(500)
`;

const resHigh = parsePythonReadOutputsForInput(code, -1, false, 100);
assert(resHigh !== null, "Execution result should not be null");
console.log("  [Trace] High moisture (295 / 1023 -> 1181) serial lines:", resHigh.serialLines);
assert.equal(resHigh.serialLines[0], `Soil Moisture: ${expected12}`, "First line should contain the numeric moisture value");
assert.equal(resHigh.serialLines[1], "WET - BUZZER ON", "Condition 1181 >= 500 should evaluate to true and print WET");
console.log("  [PASS] Multi-arg print('Soil Moisture:', moisture) preserved numeric value without dropping argument");
console.log("  [PASS] if moisture >= WET_THRESHOLD correctly evaluated to TRUE for high moisture");

// --- TEST 3: Low moisture conditional branch verification ---
console.log("\n--- TEST 3: Low Moisture Conditional Branching ---");
soilNode.data.properties.moisture.value = 50; // 50 / 1023 -> 200 (< 500)
const expectedLow12 = Math.round((50 / 1023) * 4095); // 200
useCircuitStore.setState({ nodes, edges } as any);

const resLow = parsePythonReadOutputsForInput(code, -1, false, 15000);
assert(resLow !== null, "Execution result should not be null");
console.log("  [Trace] Low moisture (50 / 1023 -> 200) serial lines:", resLow.serialLines);
assert.equal(resLow.serialLines[0], `Soil Moisture: ${expectedLow12}`);
assert.equal(resLow.serialLines[1], "DRY - BUZZER OFF", "Condition 200 >= 500 should evaluate to false and print DRY");
console.log("  [PASS] if moisture >= WET_THRESHOLD correctly evaluated to FALSE for low moisture");

// --- TEST 4: Pico ADC read_u16 backwards compatibility ---
console.log("\n--- TEST 4: Pico ADC read_u16 Backwards Compatibility ---");
const picoNode: CircuitNode = {
  id: "pico-1",
  type: "raspberrypipico",
  position: { x: 100, y: 100 },
  data: {
    componentType: "raspberrypipico",
    label: "Raspberry Pi Pico",
    rotation: 0,
    properties: {},
  },
};
const picoEdges: CircuitEdge[] = [
  {
    id: "pw1",
    source: "soil-1",
    sourceHandle: "vcc1",
    target: "pico-1",
    targetHandle: "pico_3v3",
    type: "wire",
  },
  {
    id: "pw2",
    source: "soil-1",
    sourceHandle: "gnd1",
    target: "pico-1",
    targetHandle: "pico_gnd1",
    type: "wire",
  },
  {
    id: "pw3",
    source: "soil-1",
    sourceHandle: "sig1",
    target: "pico-1",
    targetHandle: "gp26",
    type: "wire",
  },
];
const picoNodes = [picoNode, soilNode];
useCircuitStore.setState({ nodes: picoNodes, edges: picoEdges, selectedLanguage: "python" } as any);

const picoVal16 = getAnalogValueForPicoPin(26, picoNodes, picoEdges, "u16");
assert.equal(picoVal16, Math.round((50 / 1023) * 65535));
console.log(`  [PASS] Pico GP26 ADC read_u16 value: ${picoVal16}`);

// --- TEST 5: SyntaxError Surfacing in Serial Output ---
console.log("\n--- TEST 5: SyntaxError Surfaced in Serial Output on Parse Failure ---");
const brokenSyntaxCode = `while True\n    print("missing colon")`;
const brokenRes = parsePythonReadOutputsForInput(brokenSyntaxCode, -1, false, 30000);
assert(brokenRes !== null, "Execution result should not be null");
console.log("  [Trace] Syntax error serial lines:", brokenRes.serialLines);
assert.equal(brokenRes.serialLines.length, 1, "Should contain exactly one error line");
assert(brokenRes.serialLines[0].startsWith(">>> SyntaxError:"), "Line should begin with >>> SyntaxError:");
console.log("  [PASS] SyntaxError surfaced once to serial output without crashing or hanging");

// --- TEST 6: Undefined Variable Formatted as None in Print ---
console.log("\n--- TEST 6: Undefined Variable Formatted as None in Print ---");
const undefCode = `print("Val:", undeclared_var)`;
const undefRes = parsePythonReadOutputsForInput(undefCode, -1, false, 40000);
assert(undefRes !== null, "Execution result should not be null");
console.log("  [Trace] Undefined variable serial lines:", undefRes.serialLines);
assert.equal(undefRes.serialLines[0], "Val: None", "Undefined variable should format as 'None'");
console.log("  [PASS] Undefined variable correctly formatted as 'None'");

console.log("\n=================== ALL ESP32 SOIL MOISTURE ADC & ERROR TESTS PASSED ===================");
