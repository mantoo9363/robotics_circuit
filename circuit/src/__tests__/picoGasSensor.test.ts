import { strict as assert } from "assert";
import { getAnalogValueForPicoPin } from "../lib/codeParsing/picoAnalogPins";
import { parsePythonReadOutputsForInput } from "../lib/codeParsing/picoParser";
import { applyPicoSimulationToFrame } from "../lib/simulation/frameTransformers/pico";
import { buildSimulationFrame } from "../lib/simulation-state";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";

console.log("=================== PICO GAS SENSOR REGRESSION TEST SUITE ===================");

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

const gasNode: CircuitNode = {
  id: "gas-1",
  type: "gasSensor",
  position: { x: 400, y: 100 },
  data: {
    componentType: "gasSensor",
    label: "MQ-2 Gas Sensor",
    rotation: 0,
    properties: {
      name: { label: "Name", type: "string", value: "GAS1" },
      gasLevel: { label: "Gas Level", type: "number", value: 600, min: 0, max: 1023 },
    },
  },
};

// Wired: GP26 -> b1, a1/a2 jumpers, b1/b2 jumpers, h1->a1, h2->gnd, 3v3->a1
const edgesWired: CircuitEdge[] = [
  { id: "e1", source: "gas-1", sourceHandle: "a1", target: "gas-1", targetHandle: "a2" },
  { id: "e2", source: "gas-1", sourceHandle: "b1", target: "gas-1", targetHandle: "b2" },
  { id: "e3", source: "gas-1", sourceHandle: "h1", target: "gas-1", targetHandle: "a1" },
  { id: "e4", source: "gas-1", sourceHandle: "h2", target: "pico-1", targetHandle: "pico_gnd1" },
  { id: "e5", source: "pico-1", sourceHandle: "pico_3v3", target: "gas-1", targetHandle: "a1" },
  { id: "e6", source: "pico-1", sourceHandle: "gp26", target: "gas-1", targetHandle: "b1" },
];

console.log("\n--- TEST 1: Pico GP26 (Wired) 16-bit ADC Resolution ---");
const expected16 = Math.round((600 / 1023) * 65535); // 38437
const valWired16 = getAnalogValueForPicoPin(26, [picoNode, gasNode], edgesWired, "u16");
assert.equal(valWired16, expected16, `Pico 16-bit ADC read should be ${expected16}, got ${valWired16}`);
console.log(`  [PASS] Pico GP26 (Wired) read_u16 value: ${valWired16}`);

useCircuitStore.setState({ nodes: [picoNode, gasNode], edges: edgesWired, selectedLanguage: "python" } as any);
const codePico = `
from machine import ADC, Pin
gas = ADC(Pin(26))
val = gas.read_u16()
print("PICO_GAS:", val)
`;
const res = parsePythonReadOutputsForInput(codePico, -1, false, 0);
assert(res !== null, "Execution result should not be null");
assert.equal(res.serialLines[0], `PICO_GAS: ${expected16}`);
console.log(`  [PASS] AST Execution ADC(Pin(26)).read_u16() printed ${expected16}`);

const frame0 = buildSimulationFrame({
  tick: 1,
  timestamp: 0,
  nodes: [picoNode, gasNode],
  edges: edgesWired,
  boardType: "pico",
  running: true,
});
const ctx = {
  nodes: [picoNode, gasNode],
  edges: edgesWired,
  picoCode: codePico,
  arduinoCode: "",
  dynamicComponents: [],
  boardType: "pico",
  selectedLanguage: "python",
};
const resFrame = applyPicoSimulationToFrame(frame0, ctx as any);
const pin26 = resFrame.boardPins?.find((p) => p.pin === 26);
assert(pin26 !== undefined, "boardPins for GP26 should be defined");
assert.equal(pin26.mode, "INPUT");
assert.equal(pin26.value, Math.round((600 / 1023) * 255));
console.log(`  [PASS] Frame transformer populated boardPin 26: value=${pin26.value}, mode=${pin26.mode}`);

console.log("\n--- TEST 2: Pico GP27 (Unwired) returns 0 ---");
const valUnwired16 = getAnalogValueForPicoPin(27, [picoNode, gasNode], edgesWired, "u16");
assert.equal(valUnwired16, 0, `Unwired Pico pin should return 0, got ${valUnwired16}`);
console.log(`  [PASS] Pico GP27 (Unwired) read_u16 value: 0`);

console.log("\n--- TEST 3: Pico GP27 (Miswired to Power Pin a1) returns 0 ---");
const edgesMiswire: CircuitEdge[] = [
  ...edgesWired,
  { id: "e-miswire", source: "pico-1", sourceHandle: "gp27", target: "gas-1", targetHandle: "a1" },
];
const valMiswire16 = getAnalogValueForPicoPin(27, [picoNode, gasNode], edgesMiswire, "u16");
assert.equal(valMiswire16, 0, `Power pin a1 must not be read as signal, expected 0, got ${valMiswire16}`);
console.log(`  [PASS] Pico GP27 (Miswired to power pin a1) returns 0`);

console.log("\n=================== ALL PICO GAS SENSOR TESTS PASSED 100% ===================");
