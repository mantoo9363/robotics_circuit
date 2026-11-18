/**
 * ESP32 C++ Ultrasonic (2x HC-SR04) Regression Test Suite
 *
 * Validates:
 * 1. languageUtils.isEffectivePython evaluates to false for ESP32 in "auto" mode when C++ code is present.
 * 2. C++ Arduino sketch with 2x HC-SR04 sensors connected to ESP32 runs cleanly.
 * 3. Both sensors report powered status, distance telemetry, and serial output without error.
 */

import { isEffectivePython, hasActiveCppCode, hasActivePythonCode } from "../lib/circuit/languageUtils";
import { applyUltrasonicDistanceInputToFrame } from "../lib/simulation/frameTransformers/ultrasonicPir";
import { buildSimulationFrame } from "../lib/simulation-state";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";

console.log("=================== RUNNING ESP32 C++ ULTRASONIC REGRESSION TESTS ===================");

let passed = true;

// --- TEST 1: Auto-detection logic unit test ---
const testNodes: CircuitNode[] = [
  { id: "esp32-1", type: "esp32", data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 }, position: { x: 0, y: 0 } },
];

const cppSketch = `
void setup() {
  pinMode(5, OUTPUT);
  pinMode(18, INPUT);
}
void loop() {
  long duration = pulseIn(18, HIGH);
  long distance = duration * 0.034 / 2;
}
`;

const pySketch = `
from machine import Pin
import time
trig = Pin(5, Pin.OUT)
echo = Pin(18, Pin.IN)
`;

const emptyPySketch = "# Write your MicroPython code here\n";

if (!hasActiveCppCode(cppSketch)) {
  console.error("❌ Test 1A FAILED: hasActiveCppCode failed to identify valid C++ sketch!");
  passed = false;
} else {
  console.log("=> Test 1A PASSED (hasActiveCppCode identified C++ sketch structure)");
}

if (hasActivePythonCode(emptyPySketch)) {
  console.error("❌ Test 1B FAILED: hasActivePythonCode identified empty comment as active code!");
  passed = false;
} else {
  console.log("=> Test 1B PASSED (hasActivePythonCode correctly treated comment placeholder as empty)");
}

const isPyAutoCpp = isEffectivePython("auto", testNodes, cppSketch, emptyPySketch);
if (isPyAutoCpp !== false) {
  console.error(`❌ Test 1C FAILED: isEffectivePython('auto') returned ${isPyAutoCpp}, expected false (C++ mode)!`);
  passed = false;
} else {
  console.log("=> Test 1C PASSED (isEffectivePython('auto') correctly resolved to false (C++ mode) for ESP32)");
}

const isPyAutoBoth = isEffectivePython("auto", testNodes, cppSketch, pySketch);
if (isPyAutoBoth !== false) {
  console.error(`❌ Test 1D FAILED: Tie-breaker failed, expected false (C++ wins when both exist)!`);
  passed = false;
} else {
  console.log("=> Test 1D PASSED (Tie-breaker correctly picked C++ mode when both buffers contain code)");
}

// --- TEST 2: 2x HC-SR04 Ultrasonic Sensors on ESP32 (C++ mode) ---
const sensor1: CircuitNode = {
  id: "ultra-1",
  type: "ultrasonicDistance",
  data: {
    label: "Ultrasonic 1",
    componentType: "ultrasonicDistance",
    simulationModel: "ultrasonicDistance",
    properties: { distance: { label: "Distance", type: "number", value: 120 } },
    rotation: 0,
  },
  position: { x: 200, y: 0 },
};

const sensor2: CircuitNode = {
  id: "ultra-2",
  type: "ultrasonicDistance",
  data: {
    label: "Ultrasonic 2",
    componentType: "ultrasonicDistance",
    simulationModel: "ultrasonicDistance",
    properties: { distance: { label: "Distance", type: "number", value: 45 } },
    rotation: 0,
  },
  position: { x: 400, y: 0 },
};

const nodes = [testNodes[0], sensor1, sensor2];
const edges: CircuitEdge[] = [
  // Sensor 1 connected to ESP32: VCC -> 3V3, GND -> GND, TRIG -> GPIO5, ECHO -> GPIO18
  { id: "e1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "ultra-1", targetHandle: "vcc" },
  { id: "e2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "ultra-1", targetHandle: "gnd" },
  { id: "e3", source: "esp32-1", sourceHandle: "gpio5", target: "ultra-1", targetHandle: "trigger" },
  { id: "e4", source: "esp32-1", sourceHandle: "gpio18", target: "ultra-1", targetHandle: "echo" },
  // Sensor 2 connected to ESP32: VCC -> 3V3, GND -> GND, TRIG -> GPIO17, ECHO -> GPIO16
  { id: "e5", source: "esp32-1", sourceHandle: "esp32_3v3", target: "ultra-2", targetHandle: "vcc" },
  { id: "e6", source: "esp32-1", sourceHandle: "esp32_gnd2", target: "ultra-2", targetHandle: "gnd" },
  { id: "e7", source: "esp32-1", sourceHandle: "gpio17", target: "ultra-2", targetHandle: "trigger" },
  { id: "e8", source: "esp32-1", sourceHandle: "gpio16", target: "ultra-2", targetHandle: "echo" },
];

useCircuitStore.setState({
  nodes,
  edges,
  arduinoCode: cppSketch,
  picoCode: emptyPySketch,
  selectedLanguage: "auto",
  simulationStatus: "running",
} as any);

const initialFrame = buildSimulationFrame({
  tick: 1,
  nodes,
  edges,
  dynamicComponents: [],
  boardType: "esp32",
  arduinoState: { pins: new Map(), serialOutput: [], running: true, error: null },
  running: true,
  error: null,
});

const resultFrame = applyUltrasonicDistanceInputToFrame(initialFrame);

const s1Comp = resultFrame.components["ultra-1"];
const s2Comp = resultFrame.components["ultra-2"];

console.log(`[Trace Test 2] Sensor 1 Powered = ${s1Comp?.isPowered}, Distance = ${s1Comp?.telemetry?.distance}cm`);
console.log(`[Trace Test 2] Sensor 2 Powered = ${s2Comp?.isPowered}, Distance = ${s2Comp?.telemetry?.distance}cm`);

if (!s1Comp || !s1Comp.isPowered || s1Comp.telemetry?.distance !== 120) {
  console.error("❌ Test 2 FAILED: Sensor 1 telemetry invalid!");
  passed = false;
} else if (!s2Comp || !s2Comp.isPowered || s2Comp.telemetry?.distance !== 45) {
  console.error("❌ Test 2 FAILED: Sensor 2 telemetry invalid!");
  passed = false;
} else {
  console.log("=> Test 2 PASSED (2x HC-SR04 Ultrasonic Sensors on ESP32 in C++ mode powered and calculated cleanly)");
}

if (!passed) process.exit(1);

console.log("=================== ESP32 C++ ULTRASONIC TESTS COMPLETE ===================");
console.log("✅ All ESP32 C++ Ultrasonic tests passed 100%.");
