import assert from "node:assert";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { buildSimulationFrame } from "../lib/simulation-state";
import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { clearSimSessions } from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";

function createEsp32Node(id = "esp32-1"): CircuitNode {
  return {
    id,
    type: "esp32",
    position: { x: 100, y: 100 },
    data: {
      componentType: "esp32",
      label: "ESP32 DevKit V1",
      simulationModel: "esp32",
      properties: {},
      rotation: 0,
    },
  };
}

function createSevenSegmentNode(
  id = "disp-1",
  displayType: "Common Cathode" | "Common Anode" = "Common Cathode",
): CircuitNode {
  return {
    id,
    type: "sevenSegment",
    position: { x: 400, y: 100 },
    data: {
      componentType: "sevenSegment",
      label: "7-Segment Display",
      simulationModel: "sevenSegment",
      properties: {
        displayType: { label: "Type", type: "select", value: displayType },
        color: { label: "Color", type: "select", value: "red" },
      },
      rotation: 0,
    },
  };
}

function createResistorNode(id = "r-1", ohms = 220): CircuitNode {
  return {
    id,
    type: "resistor",
    position: { x: 400, y: 300 },
    data: {
      componentType: "resistor",
      label: "Resistor",
      simulationModel: "resistor",
      properties: {
        resistance: { label: "Resistance", type: "number", value: ohms },
      },
      rotation: 0,
    },
  };
}

function runSevenSegmentTick(
  code: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  tick = 1,
) {
  useCircuitStore.setState({
    nodes,
    edges,
    simulationStatus: "running",
  });

  const context: any = {
    nodes,
    edges,
    picoCode: code,
    arduinoCode: "",
    selectedLanguage: "python",
    dynamicComponents: [],
    keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
  };

  const initialFrame = buildSimulationFrame({
    tick,
    nodes,
    edges,
    dynamicComponents: [],
    boardType: "esp32",
    running: true,
    arduinoState: {
      pins: new Map(),
      serialOutput: [],
      error: null,
      running: true,
    },
  });

  return applyFramePipeline(initialFrame, context);
}

console.log("=================== RUNNING ESP32 7-SEGMENT DISPLAY TESTS ===================");

// --- TEST 1: Common Cathode - Display digit '0' (a, b, c, d, e, f = 1, g = 0) with 220Ω resistor ---
console.log("\n--- TEST 1: Common Cathode - Display digit '0' ---");
clearSimSessions();

const esp32Node = createEsp32Node();
const dispCC = createSevenSegmentNode("disp-cc", "Common Cathode");
const r220 = createResistorNode("r-220", 220);

const nodes1 = [esp32Node, dispCC, r220];
const edges1: CircuitEdge[] = [
  // Segments a..g connected to GPIO16..22
  { id: "e_a", source: esp32Node.id, sourceHandle: "gpio16", target: dispCC.id, targetHandle: "a" },
  { id: "e_b", source: esp32Node.id, sourceHandle: "gpio17", target: dispCC.id, targetHandle: "b" },
  { id: "e_c", source: esp32Node.id, sourceHandle: "gpio18", target: dispCC.id, targetHandle: "c" },
  { id: "e_d", source: esp32Node.id, sourceHandle: "gpio19", target: dispCC.id, targetHandle: "d" },
  { id: "e_e", source: esp32Node.id, sourceHandle: "gpio21", target: dispCC.id, targetHandle: "e" },
  { id: "e_f", source: esp32Node.id, sourceHandle: "gpio22", target: dispCC.id, targetHandle: "f" },
  { id: "e_g", source: esp32Node.id, sourceHandle: "gpio23", target: dispCC.id, targetHandle: "g" },
  { id: "e_dp", source: esp32Node.id, sourceHandle: "gpio25", target: dispCC.id, targetHandle: "dp" },

  // COM1 -> Resistor pin1, Resistor pin2 -> esp32_gnd1
  { id: "e_com", source: dispCC.id, sourceHandle: "com1", target: r220.id, targetHandle: "pin1" },
  { id: "e_gnd", source: r220.id, sourceHandle: "pin2", target: esp32Node.id, targetHandle: "esp32_gnd1" },
];

const codeDigit0 = `
from machine import Pin
# 0 = a, b, c, d, e, f ON, g and dp OFF
pins = [Pin(p, Pin.OUT) for p in [16, 17, 18, 19, 21, 22, 23, 25]]
for i in range(6):
    pins[i].value(1)
pins[6].value(0) # g
pins[7].value(0) # dp
`;

const frame1 = runSevenSegmentTick(codeDigit0, nodes1, edges1);
const comp1 = frame1.components[dispCC.id];
const telemetry1 = comp1?.telemetry;
const digitState1 = JSON.parse(String(telemetry1?.digitState ?? "{}"));

assert.strictEqual(comp1?.isPowered, true, "Display should be powered");
assert.strictEqual(telemetry1?.burnt, false, "Display should NOT be burnt");
assert.strictEqual(telemetry1?.hasResistor, true, "Series resistor should be detected");
assert.strictEqual(digitState1.a, true, "Segment a should be lit");
assert.strictEqual(digitState1.b, true, "Segment b should be lit");
assert.strictEqual(digitState1.c, true, "Segment c should be lit");
assert.strictEqual(digitState1.d, true, "Segment d should be lit");
assert.strictEqual(digitState1.e, true, "Segment e should be lit");
assert.strictEqual(digitState1.f, true, "Segment f should be lit");
assert.strictEqual(digitState1.g, false, "Segment g should be unlit");
assert.strictEqual(digitState1.dp, false, "Segment dp should be unlit");
console.log("  [PASS] Digit '0' displayed accurately on Common Cathode display");

// --- TEST 2: Common Cathode - Display digit '8' (all a..g segments active) ---
console.log("\n--- TEST 2: Common Cathode - Display digit '8' ---");
clearSimSessions();

const codeDigit8 = `
from machine import Pin
# 8 = all a..g ON, dp OFF
pins = [Pin(p, Pin.OUT) for p in [16, 17, 18, 19, 21, 22, 23, 25]]
for i in range(7):
    pins[i].value(1)
pins[7].value(0) # dp
`;

const frame2 = runSevenSegmentTick(codeDigit8, nodes1, edges1);
const comp2 = frame2.components[dispCC.id];
const digitState2 = JSON.parse(String(comp2?.telemetry?.digitState ?? "{}"));

for (const seg of ["a", "b", "c", "d", "e", "f", "g"]) {
  assert.strictEqual(digitState2[seg], true, `Segment ${seg} should be lit for digit 8`);
}
assert.strictEqual(digitState2.dp, false, "Segment dp should be unlit");
console.log("  [PASS] Digit '8' (all 7 segments lit) verified cleanly");

// --- TEST 3: Common Anode - Inverted active-LOW logic ---
console.log("\n--- TEST 3: Common Anode - Inverted active-LOW logic ---");
clearSimSessions();

const dispCA = createSevenSegmentNode("disp-ca", "Common Anode");
const nodes3 = [esp32Node, dispCA, r220];
const edges3: CircuitEdge[] = [
  // Segments to GPIO16..23 (b through resistor r220)
  { id: "e3_a", source: esp32Node.id, sourceHandle: "gpio16", target: dispCA.id, targetHandle: "a" },
  { id: "e3_b1", source: esp32Node.id, sourceHandle: "gpio17", target: r220.id, targetHandle: "pin1" },
  { id: "e3_b2", source: r220.id, sourceHandle: "pin2", target: dispCA.id, targetHandle: "b" },
  { id: "e3_c", source: esp32Node.id, sourceHandle: "gpio18", target: dispCA.id, targetHandle: "c" },
  { id: "e3_d", source: esp32Node.id, sourceHandle: "gpio19", target: dispCA.id, targetHandle: "d" },
  { id: "e3_e", source: esp32Node.id, sourceHandle: "gpio21", target: dispCA.id, targetHandle: "e" },
  { id: "e3_f", source: esp32Node.id, sourceHandle: "gpio22", target: dispCA.id, targetHandle: "f" },
  { id: "e3_g", source: esp32Node.id, sourceHandle: "gpio23", target: dispCA.id, targetHandle: "g" },

  // Common Anode COM tied directly to 3.3V
  { id: "e3_com", source: dispCA.id, sourceHandle: "com1", target: esp32Node.id, targetHandle: "esp32_3v3" },
];

const codeCommonAnodeDigit1 = `
from machine import Pin
# Common Anode: Active LOW (0 = ON, 1 = OFF).
# Light segment b (pulled LOW through series resistor r220)
pins = [Pin(p, Pin.OUT) for p in [16, 17, 18, 19, 21, 22, 23]]
for p in pins:
    p.value(1) # Default all OFF in common anode

# Turn on b by pulling LOW through r220
pins[1].value(0) # b
`;

const frame3 = runSevenSegmentTick(codeCommonAnodeDigit1, nodes3, edges3);
const comp3 = frame3.components[dispCA.id];
const digitState3 = JSON.parse(String(comp3?.telemetry?.digitState ?? "{}"));

assert.strictEqual(comp3?.isPowered, true, "Common Anode display should be powered");
assert.strictEqual(digitState3.b, true, "Segment b should be lit (active-low)");
assert.strictEqual(digitState3.a, false, "Segment a should be unlit");
assert.strictEqual(digitState3.c, false, "Segment c should be unlit");
assert.strictEqual(digitState3.a, false, "Segment a should be unlit");
assert.strictEqual(digitState3.d, false, "Segment d should be unlit");
console.log("  [PASS] Common Anode inverted active-LOW logic verified (Digit 1 illuminated)");

// --- TEST 4: Direct COM-to-GND without series resistor (Edge Case #1 & Burnout) ---
console.log("\n--- TEST 4: Direct COM-to-GND without series resistor (Burnout Protection) ---");
clearSimSessions();

const nodes4 = [esp32Node, dispCC];
const edges4: CircuitEdge[] = [
  { id: "e4_a", source: esp32Node.id, sourceHandle: "gpio16", target: dispCC.id, targetHandle: "a" },
  // Direct COM1 to esp32_gnd1 (NO resistor)
  { id: "e4_com_direct", source: dispCC.id, sourceHandle: "com1", target: esp32Node.id, targetHandle: "esp32_gnd1" },
];

const codeDirect = `
from machine import Pin
a = Pin(16, Pin.OUT)
a.value(1)
`;

const frame4 = runSevenSegmentTick(codeDirect, nodes4, edges4);
const comp4 = frame4.components[dispCC.id];
const telemetry4 = comp4?.telemetry;

assert.strictEqual(telemetry4?.hasResistor, false, "Direct connection must report hasResistor: false");
assert.strictEqual(telemetry4?.burnt, true, "Display without series resistor must burn out");
assert.strictEqual(comp4?.isPowered, false, "Burnt display must not be powered");
assert.strictEqual(telemetry4?.digitState, "{}", "Burnt display must have empty digit layout");
console.log("  [PASS] Direct COM-to-GND without resistor triggers burnout protection cleanly");

// --- TEST 5: Input-Only Pin (GPIO34) Safety Guard ---
console.log("\n--- TEST 5: Input-Only Pin (GPIO34) Safety Guard ---");
clearSimSessions();

const edges5: CircuitEdge[] = [
  // Attempt to drive segment a from input-only GPIO34
  { id: "e5_a", source: esp32Node.id, sourceHandle: "gpio34", target: dispCC.id, targetHandle: "a" },
  { id: "e5_com", source: dispCC.id, sourceHandle: "com1", target: r220.id, targetHandle: "pin1" },
  { id: "e5_gnd", source: r220.id, sourceHandle: "pin2", target: esp32Node.id, targetHandle: "esp32_gnd1" },
];

const codeInputOnly = `
from machine import Pin
a = Pin(34, Pin.OUT)
a.value(1)
`;

const frame5 = runSevenSegmentTick(codeInputOnly, [esp32Node, dispCC, r220], edges5);
const serial5 = frame5.serialOutput || [];
const hasValueError34 = serial5.some((line: string) => line.includes("ValueError") && line.includes("34"));
assert.ok(hasValueError34, "Must surface ValueError when configuring input-only GPIO34 as OUTPUT");

const comp5 = frame5.components[dispCC.id];
const digitState5 = JSON.parse(String(comp5?.telemetry?.digitState ?? "{}"));
assert.strictEqual(digitState5.a ?? false, false, "Segment a must NOT light from input-only pin");
console.log("  [PASS] GPIO34 input-only pin guard enforced with ValueError and unlit segment");

// --- TEST 6: Dynamic Digit Cycling across Ticks ---
console.log("\n--- TEST 6: Dynamic Digit Cycling across Ticks ---");
clearSimSessions();

// Tick 1: Display digit '1' (b, c)
const codeTick1 = `
from machine import Pin
b = Pin(17, Pin.OUT)
c = Pin(18, Pin.OUT)
b.value(1)
c.value(1)
`;
const frameT1 = runSevenSegmentTick(codeTick1, nodes1, edges1, 1);
const ds1 = JSON.parse(String(frameT1.components[dispCC.id]?.telemetry?.digitState ?? "{}"));
assert.strictEqual(ds1.b, true, "Tick 1: b lit");
assert.strictEqual(ds1.c, true, "Tick 1: c lit");
assert.strictEqual(ds1.a ?? false, false, "Tick 1: a unlit");

// Tick 2: Display digit '7' (a, b, c)
const codeTick2 = `
from machine import Pin
a = Pin(16, Pin.OUT)
b = Pin(17, Pin.OUT)
c = Pin(18, Pin.OUT)
a.value(1)
b.value(1)
c.value(1)
`;
const frameT2 = runSevenSegmentTick(codeTick2, nodes1, edges1, 2);
const ds2 = JSON.parse(String(frameT2.components[dispCC.id]?.telemetry?.digitState ?? "{}"));
assert.strictEqual(ds2.a, true, "Tick 2: a lit");
assert.strictEqual(ds2.b, true, "Tick 2: b lit");
assert.strictEqual(ds2.c, true, "Tick 2: c lit");
console.log("  [PASS] Dynamic digit state transitions across simulation ticks verified");

console.log("\n=================== ALL ESP32 7-SEGMENT TESTS PASSED ===================");
