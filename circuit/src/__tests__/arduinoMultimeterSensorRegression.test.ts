import { buildSimulationFrame } from "../lib/simulation-state";
import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";

console.log("=================== ARDUINO & PICO MULTIMETER SENSOR PROBING REGRESSION TEST ===================");

let allPassed = true;

// TEST 1: Arduino D3 (OUTPUT HIGH 5V) -> Photoresistor (pin1) -> Photoresistor (pin2) -> Multimeter (+) -> Multimeter (-) -> Arduino GND
const unoNode: CircuitNode = {
  id: "uno1",
  type: "circuitComponent",
  position: { x: 0, y: 0 },
  data: { componentType: "arduino", simulationModel: "arduino", label: "Arduino", rotation: 0, properties: {} as any },
};

const ldrNode: CircuitNode = {
  id: "ldr1",
  type: "circuitComponent",
  position: { x: 100, y: 0 },
  data: {
    componentType: "photoresistor",
    simulationModel: "photoresistor",
    label: "Photoresistor",
    rotation: 0,
    properties: { lightLevel: { value: 512 } } as any,
  },
};

const meterNodeUno: CircuitNode = {
  id: "meter1",
  type: "circuitComponent",
  position: { x: 200, y: 0 },
  data: {
    componentType: "multimeter",
    simulationModel: "multimeter",
    label: "Multimeter",
    rotation: 0,
    properties: { mode: { value: "voltage" } } as any,
  },
};

const arduinoStateWithPin3High = {
  pins: new Map([[3, { mode: "OUTPUT", value: 255 }]]),
};

const edgesUnoLdr: CircuitEdge[] = [
  { id: "e1", source: "uno1", target: "ldr1", sourceHandle: "d3", targetHandle: "pin1" },
  { id: "e2", source: "ldr1", target: "meter1", sourceHandle: "pin2", targetHandle: "positive" },
  { id: "e3", source: "meter1", target: "uno1", sourceHandle: "negative", targetHandle: "gnd1" },
];

const frameUnoLdr = buildSimulationFrame({
  tick: 0,
  timestamp: 0,
  nodes: [unoNode, ldrNode, meterNodeUno],
  edges: edgesUnoLdr,
  boardType: "arduino",
  arduinoState: arduinoStateWithPin3High as any,
  running: true,
  error: null,
  dynamicComponents: COMPONENT_CATALOG,
});

const contextUnoLdr = {
  nodes: [unoNode, ldrNode, meterNodeUno],
  edges: edgesUnoLdr,
  arduinoCode: "void setup() { pinMode(3, OUTPUT); digitalWrite(3, HIGH); }",
  picoCode: "",
  selectedLanguage: "cpp" as const,
  boardType: "arduino" as const,
  dynamicComponents: COMPONENT_CATALOG as any,
};
const processedUnoLdr = applyFramePipeline(frameUnoLdr, contextUnoLdr as any);
const meterUnoLdrState = processedUnoLdr.components["meter1"];
console.log(`[Trace Test 1 - Arduino D3 HIGH -> Photoresistor -> Probe] Multimeter VDC = ${meterUnoLdrState?.telemetry?.voltage} V`);

if (meterUnoLdrState?.telemetry?.voltage !== 5) {
  console.error(`❌ Test 1 FAILED: Expected 5V across photoresistor path from driven Arduino D3, got ${meterUnoLdrState?.telemetry?.voltage}V`);
  allPassed = false;
} else {
  console.log("  [PASS] Arduino 5V photoresistor probe measured accurately as 5.00V\n");
}

// TEST 2: Arduino D3 (OUTPUT HIGH 5V) -> Force Sensor (pin1) -> Force Sensor (pin2) -> Multimeter (+) -> Multimeter (-) -> Arduino GND
const fsrNode: CircuitNode = {
  id: "fsr1",
  type: "circuitComponent",
  position: { x: 100, y: 100 },
  data: {
    componentType: "forceSensor",
    simulationModel: "forceSensor",
    label: "Force Sensor",
    rotation: 0,
    properties: { force: { value: 500 } } as any,
  },
};

const edgesUnoFsr: CircuitEdge[] = [
  { id: "ef1", source: "uno1", target: "fsr1", sourceHandle: "d3", targetHandle: "pin1" },
  { id: "ef2", source: "fsr1", target: "meter1", sourceHandle: "pin2", targetHandle: "positive" },
  { id: "ef3", source: "meter1", target: "uno1", sourceHandle: "negative", targetHandle: "gnd1" },
];

const frameUnoFsr = buildSimulationFrame({
  tick: 0,
  timestamp: 0,
  nodes: [unoNode, fsrNode, meterNodeUno],
  edges: edgesUnoFsr,
  boardType: "arduino",
  arduinoState: arduinoStateWithPin3High as any,
  running: true,
  error: null,
  dynamicComponents: COMPONENT_CATALOG as any,
});

const contextUnoFsr = {
  nodes: [unoNode, fsrNode, meterNodeUno],
  edges: edgesUnoFsr,
  arduinoCode: "void setup() { pinMode(3, OUTPUT); digitalWrite(3, HIGH); }",
  picoCode: "",
  selectedLanguage: "cpp" as const,
  boardType: "arduino" as const,
  dynamicComponents: COMPONENT_CATALOG as any,
};
const processedUnoFsr = applyFramePipeline(frameUnoFsr, contextUnoFsr as any);
const meterUnoFsrState = processedUnoFsr.components["meter1"];
console.log(`[Trace Test 2 - Arduino D3 HIGH -> Force Sensor -> Probe] Multimeter VDC = ${meterUnoFsrState?.telemetry?.voltage} V`);

if (meterUnoFsrState?.telemetry?.voltage !== 5) {
  console.error(`❌ Test 2 FAILED: Expected 5V across force sensor path on Arduino, got ${meterUnoFsrState?.telemetry?.voltage}V`);
  allPassed = false;
} else {
  console.log("  [PASS] Arduino 5V force sensor probe measured accurately as 5.00V\n");
}

// TEST 3: Direct 5V rail (non-pin) to Multimeter probe (Standard Unchanged Behavior)
const edgesUnoDirect: CircuitEdge[] = [
  { id: "ed1", source: "uno1", target: "meter1", sourceHandle: "5v", targetHandle: "positive" },
  { id: "ed2", source: "meter1", target: "uno1", sourceHandle: "negative", targetHandle: "gnd1" },
];

const frameUnoDirect = buildSimulationFrame({
  tick: 0,
  timestamp: 0,
  nodes: [unoNode, meterNodeUno],
  edges: edgesUnoDirect,
  boardType: "arduino",
  running: true,
  error: null,
  dynamicComponents: COMPONENT_CATALOG,
});

const meterUnoDirectState = frameUnoDirect.components["meter1"];
console.log(`[Trace Test 3 - Arduino Direct 5V Rail -> Probe] Multimeter VDC = ${meterUnoDirectState?.telemetry?.voltage} V`);

if (meterUnoDirectState?.telemetry?.voltage !== 5) {
  console.error(`❌ Test 3 FAILED: Expected 5V direct rail, got ${meterUnoDirectState?.telemetry?.voltage}V`);
  allPassed = false;
} else {
  console.log("  [PASS] Arduino direct 5V rail measured accurately as 5.00V\n");
}

console.log("=================== SUMMARY ===================");
if (allPassed) {
  console.log("✅ All Arduino & Pico Multimeter Sensor Probing Regression Tests PASSED.");
} else {
  console.error("❌ Some regression tests failed.");
  process.exit(1);
}
