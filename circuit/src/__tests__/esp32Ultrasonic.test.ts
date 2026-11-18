/**
 * ESP32 MicroPython Ultrasonic Distance Sensor Regression Tests
 *
 * Validates:
 * 1. Single Ultrasonic sensor parsing via time_pulse_us() and HCSR04 driver.
 * 2. Multi-sensor pin isolation: ensures Sensor 1 (trig 5, echo 18) and Sensor 2 (trig 12, echo 14)
 *    do not cross-match trigger pins.
 * 3. Distance telemetry propagation from canvas slider to SimulationFrame components.
 * 4. Disconnected sensor error telemetry handling ("Sensor Pins Disconnected").
 */

import { parseEsp32PythonUltrasonicActions } from "../lib/esp32/parser/pythonPatterns";
import { applyUltrasonicDistanceInputToFrame } from "../lib/simulation/frameTransformers/ultrasonicPir";
import { buildSimulationFrame } from "../lib/simulation-state";
import { useCircuitStore } from "../lib/store";

console.log("=================== RUNNING ESP32 ULTRASONIC REGRESSION TESTS ===================");

// --- TEST 1: Single Sensor time_pulse_us Parsing ---
const codeSingle = `
from machine import Pin, time_pulse_us
import time

trig = Pin(5, Pin.OUT)
echo = Pin(18, Pin.IN)

trig.value(1)
time.sleep_us(10)
trig.value(0)

pulse_len = time_pulse_us(echo, 1)
distance = (pulse_len * 0.0343) / 2
print("Distance:", distance)
`;

const actionsSingle = parseEsp32PythonUltrasonicActions(codeSingle);
console.log(`[Trace Test 1] Single sensor parsed action count = ${actionsSingle.length}`);
console.log(`[Trace Test 1] Trigger pin = ${actionsSingle[0]?.triggerPin}, Echo pin = ${actionsSingle[0]?.echoPin}`);

if (actionsSingle.length !== 1 || actionsSingle[0].triggerPin !== 5 || actionsSingle[0].echoPin !== 18) {
  console.error("❌ Test 1 FAILED: Single sensor trigger/echo pins incorrect!");
  process.exit(1);
} else {
  console.log("=> Test 1 PASSED (Single sensor trigger GPIO5 and echo GPIO18 parsed cleanly)");
}

// --- TEST 2: Multi-Sensor Trigger/Echo Isolation ---
const codeMulti = `
from machine import Pin, time_pulse_us

# Sensor 1
trig1 = Pin(5, Pin.OUT)
echo1 = Pin(18, Pin.IN)

# Sensor 2
trig2 = Pin(12, Pin.OUT)
echo2 = Pin(14, Pin.IN)

d1 = (time_pulse_us(echo1, 1) * 0.0343) / 2
d2 = (time_pulse_us(echo2, 1) * 0.0343) / 2
`;

const actionsMulti = parseEsp32PythonUltrasonicActions(codeMulti);
console.log(`[Trace Test 2] Multi-sensor action count = ${actionsMulti.length}`);
console.log(`[Trace Test 2 - Sensor 1] Trigger = ${actionsMulti[0]?.triggerPin}, Echo = ${actionsMulti[0]?.echoPin}`);
console.log(`[Trace Test 2 - Sensor 2] Trigger = ${actionsMulti[1]?.triggerPin}, Echo = ${actionsMulti[1]?.echoPin}`);

if (
  actionsMulti.length !== 2 ||
  actionsMulti[0].triggerPin !== 5 ||
  actionsMulti[0].echoPin !== 18 ||
  actionsMulti[1].triggerPin !== 12 ||
  actionsMulti[1].echoPin !== 14
) {
  console.error("❌ Test 2 FAILED: Multi-sensor trigger/echo cross-matched!");
  process.exit(1);
} else {
  console.log("=> Test 2 PASSED (Multi-sensor trigger/echo pairs correctly isolated without cross-matching!)");
}

// --- TEST 2B: Grouped Declarations (trig1, trig2 declared first, then echo1, echo2) ---
const codeGrouped = `
from machine import Pin, time_pulse_us

# Grouped declarations: all OUT pins first, all IN pins second
trig1 = Pin(5, Pin.OUT)
trig2 = Pin(12, Pin.OUT)
echo1 = Pin(18, Pin.IN)
echo2 = Pin(14, Pin.IN)

d1 = (time_pulse_us(echo1, 1) * 0.0343) / 2
d2 = (time_pulse_us(echo2, 1) * 0.0343) / 2
`;

const actionsGrouped = parseEsp32PythonUltrasonicActions(codeGrouped);
console.log(`[Trace Test 2B] Grouped declarations action count = ${actionsGrouped.length}`);
console.log(`[Trace Test 2B - Sensor 1] Trigger = ${actionsGrouped[0]?.triggerPin}, Echo = ${actionsGrouped[0]?.echoPin}`);
console.log(`[Trace Test 2B - Sensor 2] Trigger = ${actionsGrouped[1]?.triggerPin}, Echo = ${actionsGrouped[1]?.echoPin}`);

if (
  actionsGrouped.length !== 2 ||
  actionsGrouped[0].triggerPin !== 5 ||
  actionsGrouped[0].echoPin !== 18 ||
  actionsGrouped[1].triggerPin !== 12 ||
  actionsGrouped[1].echoPin !== 14
) {
  console.error("❌ Test 2B FAILED: Grouped declarations mis-paired trigger/echo!");
  process.exit(1);
} else {
  console.log("=> Test 2B PASSED (Grouped declarations correctly paired trig1/echo1 and trig2/echo2!)");
}

// --- TEST 3: HCSR04 Driver Class Constructor Parsing ---
const codeDriver = `
from hcsr04 import HCSR04
sensor = HCSR04(trigger_pin=25, echo_pin=26)
d = sensor.distance_cm()
`;

const actionsDriver = parseEsp32PythonUltrasonicActions(codeDriver);
console.log(`[Trace Test 3] HCSR04 driver action count = ${actionsDriver.length}`);
console.log(`[Trace Test 3] Trigger = ${actionsDriver[0]?.triggerPin}, Echo = ${actionsDriver[0]?.echoPin}`);

if (actionsDriver.length !== 1 || actionsDriver[0].triggerPin !== 25 || actionsDriver[0].echoPin !== 26) {
  console.error("❌ Test 3 FAILED: HCSR04 driver constructor pins incorrect!");
  process.exit(1);
} else {
  console.log("=> Test 3 PASSED (HCSR04 driver constructor trigger GPIO25 and echo GPIO26 parsed cleanly)");
}

import type { CircuitNode, CircuitEdge } from "../lib/types";

// --- TEST 4: Frame Transformer Integration & Telemetry ---
const nodes: CircuitNode[] = [
  { id: "esp32-1", type: "esp32", position: { x: 0, y: 0 }, data: { componentType: "esp32", simulationModel: "esp32", label: "ESP32", rotation: 0, properties: {} as any } },
  {
    id: "ultra-1",
    type: "ultrasonicDistance",
    position: { x: 100, y: 0 },
    data: {
      componentType: "ultrasonicDistance",
      simulationModel: "ultrasonicDistance",
      label: "Ultrasonic 1",
      rotation: 0,
      properties: { distance: { value: 168 } } as any,
    },
  },
];

// --- TEST 4: Frame Transformer Integration with REAL Catalog Handle IDs (esp32_3v3, esp32_gnd1, power, ground) ---
const edgesReal: CircuitEdge[] = [
  { id: "e1", source: "esp32-1", sourceHandle: "gpio5", target: "ultra-1", targetHandle: "trigger" },
  { id: "e2", source: "esp32-1", sourceHandle: "gpio18", target: "ultra-1", targetHandle: "echo" },
  { id: "e3", source: "esp32-1", sourceHandle: "esp32_3v3", target: "ultra-1", targetHandle: "power" },
  { id: "e4", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "ultra-1", targetHandle: "ground" },
];

useCircuitStore.setState({
  nodes,
  edges: edgesReal,
  picoCode: codeSingle,
  arduinoCode: "",
  simulationStatus: "running",
} as any);

const baseFrame = buildSimulationFrame({
  tick: 1,
  nodes,
  edges: edgesReal,
  dynamicComponents: [],
  boardType: "esp32",
  running: true,
});

const frameWithUltrasonic = applyUltrasonicDistanceInputToFrame(baseFrame);
const ultraComponent = frameWithUltrasonic.components["ultra-1"];

console.log(`[Trace Test 4] Component telemetry distance = ${ultraComponent?.telemetry?.distance}`);
console.log(`[Trace Test 4] Component isPowered = ${ultraComponent?.isPowered}`);
console.log(`[Trace Test 4] Component error = ${ultraComponent?.telemetry?.error}`);
console.log(`[Trace Test 4] Serial output = ${JSON.stringify(frameWithUltrasonic.serialOutput)}`);

if (ultraComponent?.telemetry?.distance !== 168 || ultraComponent?.isPowered !== true || ultraComponent?.telemetry?.error) {
  console.error("❌ Test 4 FAILED: Distance telemetry not 168cm or sensor flagged as disconnected with real handles!");
  process.exit(1);
} else {
  console.log("=> Test 4 PASSED (ESP32 Ultrasonic with real catalog handles: esp32_3v3, esp32_gnd1, power, ground is properly connected & powered!)");
}

// --- TEST 5: Real Catalog Handle Alternative Pins (esp32_vin, esp32_gnd2, vcc, gnd) ---
const edgesAlt: CircuitEdge[] = [
  { id: "e1", source: "esp32-1", sourceHandle: "gpio5", target: "ultra-1", targetHandle: "trigger" },
  { id: "e2", source: "esp32-1", sourceHandle: "gpio18", target: "ultra-1", targetHandle: "echo" },
  { id: "e3", source: "esp32-1", sourceHandle: "esp32_vin", target: "ultra-1", targetHandle: "vcc" },
  { id: "e4", source: "esp32-1", sourceHandle: "esp32_gnd2", target: "ultra-1", targetHandle: "gnd" },
];

useCircuitStore.setState({
  nodes,
  edges: edgesAlt,
  picoCode: codeSingle,
  arduinoCode: "",
  simulationStatus: "running",
} as any);

const frameAlt = applyUltrasonicDistanceInputToFrame(baseFrame);
const ultraComponentAlt = frameAlt.components["ultra-1"];

if (ultraComponentAlt?.telemetry?.distance !== 168 || ultraComponentAlt?.isPowered !== true || ultraComponentAlt?.telemetry?.error) {
  console.error("❌ Test 5 FAILED: Alternative real handles (esp32_vin, esp32_gnd2) failed!");
  process.exit(1);
} else {
  console.log("=> Test 5 PASSED (Alternative real handles esp32_vin + esp32_gnd2 verified!)");
}

// --- TEST 6: Disconnected Sensor correctly flags warning ---
const edgesDisconnected: CircuitEdge[] = [
  { id: "e1", source: "esp32-1", sourceHandle: "gpio5", target: "ultra-1", targetHandle: "trigger" },
  // Missing echo, vcc, gnd
];

useCircuitStore.setState({
  nodes,
  edges: edgesDisconnected,
  picoCode: codeSingle,
  arduinoCode: "",
  simulationStatus: "running",
} as any);

const frameDisc = applyUltrasonicDistanceInputToFrame(baseFrame);
const ultraComponentDisc = frameDisc.components["ultra-1"];

console.log(`[Trace Test 6] Disconnected component isPowered = ${ultraComponentDisc?.isPowered}`);
console.log(`[Trace Test 6] Disconnected component error = ${ultraComponentDisc?.telemetry?.error}`);

if (ultraComponentDisc?.isPowered !== false || ultraComponentDisc?.telemetry?.error !== "Sensor Pins Disconnected") {
  console.error("❌ Test 6 FAILED: Genuinely disconnected sensor did not flag 'Sensor Pins Disconnected'!");
  process.exit(1);
} else {
  console.log("=> Test 6 PASSED (Genuinely disconnected sensor correctly reports 'Sensor Pins Disconnected' and isPowered=false!)");
}

console.log("\n=================== ESP32 ULTRASONIC TESTS COMPLETE ===================");
console.log("✅ All ESP32 Ultrasonic Distance tests passed 100%.");
