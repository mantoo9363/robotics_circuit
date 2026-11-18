import { strict as assert } from "assert";
import { applyL293DFrameTransformer } from "../lib/simulation/frameTransformers/l293d";
import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { checkBoardOvervoltage, buildSimulationFrame, type SimulationFrame } from "../lib/simulation-state";
import { NE555StateManager, CapacitorStateManager, KeypadStateManager } from "../lib/simulation/stateMaps";
import type { SimContext } from "../lib/simulation/types";

console.log("=================== RUNNING ESP32 L293D MOTOR DRIVER TESTS ===================");

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

const l293dNode: CircuitNode = {
  id: "l293d-1",
  type: "l293d",
  position: { x: 300, y: 100 },
  data: {
    componentType: "l293d",
    label: "L293D Driver",
    rotation: 0,
    properties: {},
  },
};

const motorNode: CircuitNode = {
  id: "motor-1",
  type: "dcmotor",
  position: { x: 500, y: 100 },
  data: {
    componentType: "dcmotor",
    label: "DC Motor",
    rotation: 0,
    properties: {},
  },
};

const batteryNode: CircuitNode = {
  id: "bat-1",
  type: "battery9v",
  position: { x: 300, y: 300 },
  data: {
    componentType: "battery9v",
    label: "9V Battery",
    rotation: 0,
    properties: {
      voltage: { label: "Voltage", type: "number", value: 9 },
    },
  },
};

const nodes: CircuitNode[] = [esp32Node, l293dNode, motorNode, batteryNode];

const edges: CircuitEdge[] = [
  // Logic power from ESP32 3V3
  { id: "e_vcc", source: "esp32-1", sourceHandle: "esp32_3v3", target: "l293d-1", targetHandle: "vcc", type: "wire" },
  // Motor power from 9V battery
  { id: "e_vs", source: "bat-1", sourceHandle: "positive", target: "l293d-1", targetHandle: "vs", type: "wire" },
  // Common ground
  { id: "e_gnd1", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "l293d-1", targetHandle: "gnd1", type: "wire" },
  { id: "e_gnd2", source: "bat-1", sourceHandle: "negative", target: "l293d-1", targetHandle: "gnd2", type: "wire" },
  // ESP32 control lines
  { id: "e_en1", source: "esp32-1", sourceHandle: "gpio14", target: "l293d-1", targetHandle: "enable1", type: "wire" },
  { id: "e_in1", source: "esp32-1", sourceHandle: "gpio27", target: "l293d-1", targetHandle: "input1", type: "wire" },
  { id: "e_in2", source: "esp32-1", sourceHandle: "gpio26", target: "l293d-1", targetHandle: "input2", type: "wire" },
  // Motor driven outputs
  { id: "e_out1", source: "l293d-1", sourceHandle: "output1", target: "motor-1", targetHandle: "pin1", type: "wire" },
  { id: "e_out2", source: "l293d-1", sourceHandle: "output2", target: "motor-1", targetHandle: "pin2", type: "wire" },
];

useCircuitStore.setState({ nodes, edges, selectedLanguage: "python" } as any);

function createFrameWithPins(gpio14Val: number, gpio27Val: number, gpio26Val: number): SimulationFrame {
  return {
    tick: 1,
    boardType: "esp32",
    running: true,
    error: null,
    serialOutput: [],
    timestamp: 100,
    boardPins: [
      { pin: 14, handleId: "esp32-1:gpio14", mode: "OUTPUT", value: gpio14Val > 0 ? 255 : 0, voltage: gpio14Val > 0 ? 3.3 : 0, normalizedValue: gpio14Val, active: gpio14Val > 0 },
      { pin: 27, handleId: "esp32-1:gpio27", mode: "OUTPUT", value: gpio27Val > 0 ? 255 : 0, voltage: gpio27Val > 0 ? 3.3 : 0, normalizedValue: gpio27Val, active: gpio27Val > 0 },
      { pin: 26, handleId: "esp32-1:gpio26", mode: "OUTPUT", value: gpio26Val > 0 ? 255 : 0, voltage: gpio26Val > 0 ? 3.3 : 0, normalizedValue: gpio26Val, active: gpio26Val > 0 },
      { pin: -1, handleId: "esp32-1:esp32_3v3", mode: "OUTPUT", value: 255, voltage: 3.3, normalizedValue: 1, active: true },
      { pin: -2, handleId: "esp32-1:esp32_gnd1", mode: "OUTPUT", value: 0, voltage: 0, normalizedValue: 0, active: false },
    ],
    components: {
      "bat-1": {
        nodeId: "bat-1",
        componentType: "battery9v",
        label: "9V Battery",
        isPowered: true,
        voltage: 9,
        brightness: 1,
        telemetry: {},
        pins: {
          positive: { handleId: "positive", voltage: 9, normalizedValue: 1, active: true },
          negative: { handleId: "negative", voltage: 0, normalizedValue: 0, active: true },
        },
      },
    },
  };
}

// --- TEST 1: Forward Direction (EN1=1, IN1=1, IN2=0) ---
console.log("\n--- TEST 1: Forward Rotation (EN1=HIGH, IN1=HIGH, IN2=LOW) ---");
const frameFwd = createFrameWithPins(1, 1, 0);
const resFwd = applyL293DFrameTransformer(frameFwd);
const l293dFwd = resFwd.components["l293d-1"];
const motorFwd = resFwd.components["motor-1"];

assert.equal(l293dFwd?.isPowered, true, "L293D should be powered by ESP32 3V3");
assert.equal(l293dFwd?.telemetry.channel1, "HIGH", "Channel 1 should be HIGH");
assert.equal(l293dFwd?.telemetry.channel2, "LOW", "Channel 2 should be LOW");
assert.equal(motorFwd?.isPowered, true, "Motor should be powered");
assert.equal(motorFwd?.telemetry.direction, "forward", "Motor direction should be forward");
assert.equal(motorFwd?.telemetry.rpm, 2400, "Motor RPM should be 2400 forward");
console.log("  [PASS] Motor Forward: direction=forward, rpm=2400, voltage=9V");

// --- TEST 2: Reverse Direction (EN1=1, IN1=0, IN2=1) ---
console.log("\n--- TEST 2: Reverse Rotation (EN1=HIGH, IN1=LOW, IN2=HIGH) ---");
const frameRev = createFrameWithPins(1, 0, 1);
const resRev = applyL293DFrameTransformer(frameRev);
const l293dRev = resRev.components["l293d-1"];
const motorRev = resRev.components["motor-1"];

assert.equal(l293dRev?.telemetry.channel1, "LOW", "Channel 1 should be LOW");
assert.equal(l293dRev?.telemetry.channel2, "HIGH", "Channel 2 should be HIGH");
assert.equal(motorRev?.isPowered, true, "Motor should be powered");
assert.equal(motorRev?.telemetry.direction, "reverse", "Motor direction should be reverse");
assert.equal(motorRev?.telemetry.rpm, -2400, "Motor RPM should be -2400 reverse");
console.log("  [PASS] Motor Reverse: direction=reverse, rpm=-2400, voltage=9V");

// --- TEST 3: Brake / Stop (EN1=1, IN1=0, IN2=0) ---
console.log("\n--- TEST 3: Brake / Stop (EN1=HIGH, IN1=LOW, IN2=LOW) ---");
const frameBrake = createFrameWithPins(1, 0, 0);
const resBrake = applyL293DFrameTransformer(frameBrake);
const motorBrake = resBrake.components["motor-1"];

assert.equal(motorBrake?.isPowered, false, "Motor should not be powered when both inputs LOW");
assert.equal(motorBrake?.telemetry.direction, "stopped", "Motor direction should be stopped");
assert.equal(motorBrake?.telemetry.rpm, 0, "Motor RPM should be 0");
console.log("  [PASS] Motor Brake/Stop: direction=stopped, rpm=0");

// --- TEST 4: Coast / Disable (EN1=0, IN1=1, IN2=0) ---
console.log("\n--- TEST 4: Coast / Disable (EN1=LOW) ---");
const frameCoast = createFrameWithPins(0, 1, 0);
const resCoast = applyL293DFrameTransformer(frameCoast);
const l293dCoast = resCoast.components["l293d-1"];
const motorCoast = resCoast.components["motor-1"];

assert.equal(l293dCoast?.telemetry.channel1, "HIGH_Z", "Channel 1 should be HIGH_Z when enable is LOW");
assert.equal(motorCoast?.isPowered, false, "Motor should not be powered when disabled");
assert.equal(motorCoast?.telemetry.direction, "stopped", "Motor direction should be stopped");
console.log("  [PASS] Motor Coast: channel1=HIGH_Z, direction=stopped, rpm=0");

// --- TEST 5: ESP32 VIN Safe with 9V Supply ---
console.log("\n--- TEST 5: ESP32 VIN Safe Limit with 9V External Supply ---");

const sourceReach9V = new Map<string, any>([
  ["esp32-1:esp32_vin", [{ handleId: "bat-1:positive", voltage: 9.0 }]],
]);
const graphDummy = new Map<string, Set<string>>([
  ["esp32-1:esp32_gnd1", new Set(["bat-1:negative"])],
  ["bat-1:negative", new Set(["esp32-1:esp32_gnd1"])],
]);

const overvoltage9V = checkBoardOvervoltage("esp32-1", sourceReach9V, graphDummy, nodes);
assert.equal(overvoltage9V.sparked, false, "9V applied to esp32_vin should NOT spark / burn the board");
console.log("  [PASS] 9V on esp32_vin: sparked=false (Board is NOT burnt, within 12V VIN limit)");

// --- TEST 6: ESP32 VIN Overvoltage (>12V) Detection ---
console.log("\n--- TEST 6: ESP32 VIN Overvoltage (>12V) Protection ---");
const sourceReach15V = new Map<string, any>([
  ["esp32-1:esp32_vin", [{ handleId: "bat-1:positive", voltage: 15.0 }]],
]);

const overvoltage15V = checkBoardOvervoltage("esp32-1", sourceReach15V, graphDummy, nodes);
assert.equal(overvoltage15V.sparked, true, "15V applied to esp32_vin should trigger overvoltage sparked=true");
console.log("  [PASS] 15V on esp32_vin: sparked=true (Safety protection properly triggers for >12V)");

// --- TEST 7: End-to-End MicroPython Dynamic PWM & Top-Level Setup Persistence ---
console.log("\n--- TEST 7: MicroPython Dynamic PWM Speed & Outside-the-Loop Setup Persistence ---");

const pythonCode = `
from machine import Pin, PWM
from time import sleep

en = PWM(Pin(25), freq=1000)
in1 = Pin(26, Pin.OUT)
in2 = Pin(27, Pin.OUT)

# Forward direction — set ONCE, outside the loop
in1.value(1)
in2.value(0)

while True:
    en.duty(256)
    print("PWM = 256")
    sleep(3)
    en.duty(512)
    print("PWM = 512")
    sleep(3)
`;

const e2eEdges: CircuitEdge[] = [
  { id: "e_vcc", source: "esp32-1", sourceHandle: "esp32_3v3", target: "l293d-1", targetHandle: "vcc" },
  { id: "e_vs", source: "bat-1", sourceHandle: "positive", target: "l293d-1", targetHandle: "vs" },
  { id: "e_gnd1", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "l293d-1", targetHandle: "gnd1" },
  { id: "e_gnd2", source: "bat-1", sourceHandle: "negative", target: "l293d-1", targetHandle: "gnd2" },
  { id: "e_en1", source: "esp32-1", sourceHandle: "gpio25", target: "l293d-1", targetHandle: "enable1" },
  { id: "e_in1", source: "esp32-1", sourceHandle: "gpio26", target: "l293d-1", targetHandle: "input1" },
  { id: "e_in2", source: "esp32-1", sourceHandle: "gpio27", target: "l293d-1", targetHandle: "input2" },
  { id: "e_out1", source: "l293d-1", sourceHandle: "output1", target: "motor-1", targetHandle: "pin1" },
  { id: "e_out2", source: "l293d-1", sourceHandle: "output2", target: "motor-1", targetHandle: "pin2" },
];

const simCtx: SimContext = {
  nodes,
  edges: e2eEdges,
  picoCode: pythonCode,
  arduinoCode: "",
  dynamicComponents: [],
  selectedLanguage: "python",
  boardType: "esp32",
  ne555State: new NE555StateManager(),
  capacitorState: new CapacitorStateManager(),
  keypad4x4State: new KeypadStateManager(),
  keypad4x3State: new KeypadStateManager(),
};

// Tick at ts=0: en.duty(256) -> ~25% duty
const frameTick0 = buildSimulationFrame({ tick: 0, timestamp: 0, nodes, edges: e2eEdges, boardType: "esp32", running: true });
const resultTick0 = applyFramePipeline(frameTick0, simCtx);
const motor0 = resultTick0.components["motor-1"];
const l293d0 = resultTick0.components["l293d-1"];

assert.equal(motor0?.isPowered, true, "Motor should be powered at PWM=256");
assert.equal(motor0?.telemetry.direction, "forward", "Motor direction should be forward");
assert.equal(motor0?.telemetry.speed, 25, "Motor speed should scale to 25%");
assert.equal(motor0?.telemetry.rpm, 600, "Motor RPM should be 600 at 25% duty (0.25 * 2400)");
assert.equal(motor0?.telemetry.openCircuit, false, "Circuit should not be open");
assert.equal(l293d0?.telemetry.channel1, "HIGH", "L293D Channel 1 should be HIGH");
assert.equal(l293d0?.telemetry.channel2, "LOW", "L293D Channel 2 should be LOW");
console.log("  [PASS] ts=0s (duty 256): direction=forward, speed=25%, rpm=600, openCircuit=false");

// Advance simulation across the sleep(3) interval to ts=3000ms: en.duty(512) -> ~50% duty
let resultTick1: SimulationFrame = resultTick0;
for (let t = 1000; t <= 3000; t += 1000) {
  const frameT = buildSimulationFrame({ tick: Math.round(t / 16), timestamp: t, nodes, edges: e2eEdges, boardType: "esp32", running: true });
  resultTick1 = applyFramePipeline(frameT, simCtx);
}
const motor1 = resultTick1.components["motor-1"];

assert.equal(motor1?.isPowered, true, "Motor should be powered at PWM=512");
assert.equal(motor1?.telemetry.direction, "forward", "Motor direction should persist forward across ticks");
assert.equal(motor1?.telemetry.speed, 50, "Motor speed should dynamically increase to 50%");
assert.equal(motor1?.telemetry.rpm, 1200, "Motor RPM should dynamically scale to 1200 at 50% duty");
assert.equal(motor1?.telemetry.openCircuit, false, "Circuit should remain closed");
console.log("  [PASS] ts=3s (duty 512): direction=forward, speed=50%, rpm=1200, openCircuit=false");

console.log("\n=================== ALL ESP32 L293D & OVERVOLTAGE TESTS PASSED ===================");
