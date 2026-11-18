import { checkComponentStatus } from "../utils/componentStatus";
import { buildSimulationFrame } from "../lib/simulation-state";
import type { CircuitNode, CircuitEdge } from "../lib/types";

console.log("=================== ESP32 / PICO / ARDUINO POWER SOURCE WARNING REGRESSION TEST ===================");

let allPassed = true;

// TEST 1: ESP32 GPIO HIGH -> LED
const esp32Node: CircuitNode = {
  id: "esp32-1",
  type: "circuitComponent",
  position: { x: 0, y: 0 },
  data: { componentType: "esp32", simulationModel: "esp32", label: "ESP32", rotation: 0, properties: {} as any },
};

const ledNode: CircuitNode = {
  id: "led-1",
  type: "circuitComponent",
  position: { x: 100, y: 0 },
  data: { componentType: "led", simulationModel: "led", label: "LED", rotation: 0, properties: { color: { value: "red" } } as any },
};

const resistorNode: CircuitNode = {
  id: "resistor-1",
  type: "circuitComponent",
  position: { x: 50, y: 0 },
  data: { componentType: "resistor", simulationModel: "resistor", label: "220Ω Resistor", rotation: 0, properties: { resistance: { value: 220 } } as any },
};

const edge1: CircuitEdge = { id: "e1", source: "esp32-1", sourceHandle: "gpio2", target: "resistor-1", targetHandle: "pin1" };
const edge2: CircuitEdge = { id: "e2", source: "resistor-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" };
const edge3: CircuitEdge = { id: "e3", source: "led-1", sourceHandle: "cathode", target: "esp32-1", targetHandle: "esp32_gnd1" };

const frame = buildSimulationFrame({
  tick: 1,
  nodes: [esp32Node, resistorNode, ledNode],
  edges: [edge1, edge2, edge3],
  dynamicComponents: [],
  boardType: "esp32",
  boardPins: [
    { pin: 2, handleId: "gpio2", mode: "OUTPUT", value: 255, normalizedValue: 1.0, voltage: 3.3, active: true },
  ],
  running: true,
} as any);

const ledState = frame.components["led-1"];
console.log(`[Trace Test 1] ESP32-driven LED telemetry:`, {
  hasPowerSourceInCanvas: ledState?.telemetry?.hasPowerSourceInCanvas,
  physicalOpenCircuit: ledState?.telemetry?.physicalOpenCircuit,
  pathBlocked: ledState?.telemetry?.pathBlocked,
  currentMilliAmps: ledState?.telemetry?.currentMilliAmps,
  isPowered: ledState?.isPowered,
});

if (ledState?.telemetry?.hasPowerSourceInCanvas !== true) {
  console.error("❌ Test 1 FAILED: hasPowerSourceInCanvas is false for ESP32 circuit!");
  allPassed = false;
} else {
  console.log("  [PASS] hasPowerSourceInCanvas is true for ESP32 circuit");
}

if (ledState?.telemetry?.physicalOpenCircuit === true) {
  console.error("❌ Test 1 FAILED: physicalOpenCircuit is true for ESP32 circuit!");
  allPassed = false;
} else {
  console.log("  [PASS] physicalOpenCircuit is false for connected ESP32 circuit");
}

if (ledState?.telemetry?.pathBlocked === true) {
  console.error("❌ Test 1 FAILED: pathBlocked is true for active ESP32 GPIO circuit!");
  allPassed = false;
} else {
  console.log("  [PASS] pathBlocked is false for active ESP32 GPIO circuit");
}

const currentMilliAmps = Number(ledState?.telemetry?.currentMilliAmps ?? 0);
if (ledState?.isPowered !== true || currentMilliAmps <= 0) {
  console.error("❌ Test 1 FAILED: LED is not powered or current is 0 for active ESP32 GPIO circuit!");
  allPassed = false;
} else {
  console.log(`  [PASS] LED is powered with current = ${currentMilliAmps}mA`);
}

const status = checkComponentStatus("led-1", "led", frame);
console.log(`[Trace Test 1] checkComponentStatus result message = "${status?.message ?? "NONE (SUCCESS)"}"`);

if (status?.severity === "warning" || status?.severity === "error") {
  console.error(`❌ Test 1 FAILED: LED shows warning '${status?.message}'!`);
  allPassed = false;
} else {
  console.log("  [PASS] NO warning or error status for active ESP32-driven LED\n");
}

// TEST 2: Pico GPIO -> LED (Sanity Check)
const picoNode: CircuitNode = {
  id: "pico-1",
  type: "circuitComponent",
  position: { x: 0, y: 0 },
  data: { componentType: "raspberrypipico", simulationModel: "raspberrypipico", label: "Pico", rotation: 0, properties: {} as any },
};

const picoEdge1: CircuitEdge = { id: "pe1", source: "pico-1", sourceHandle: "gp25", target: "led-1", targetHandle: "anode" };
const picoEdge2: CircuitEdge = { id: "pe2", source: "led-1", sourceHandle: "cathode", target: "pico-1", targetHandle: "gnd1" };

const picoFrame = buildSimulationFrame({
  tick: 1,
  nodes: [picoNode, ledNode],
  edges: [picoEdge1, picoEdge2],
  dynamicComponents: [],
  boardType: "pico",
  running: true,
});

const picoLedState = picoFrame.components["led-1"];
const picoStatus = checkComponentStatus("led-1", "led", picoFrame);

if (picoLedState?.telemetry?.hasPowerSourceInCanvas !== true || picoStatus?.message === "Power Source Not Present") {
  console.error("❌ Test 2 FAILED: Pico circuit has power source warning!");
  allPassed = false;
} else {
  console.log("  [PASS] NO 'Power Source Not Present' warning for Pico-driven LED\n");
}

// TEST 3: Arduino GPIO -> LED (Sanity Check)
const arduinoNode: CircuitNode = {
  id: "uno-1",
  type: "circuitComponent",
  position: { x: 0, y: 0 },
  data: { componentType: "arduino", simulationModel: "arduino", label: "Arduino", rotation: 0, properties: {} as any },
};

const unoEdge1: CircuitEdge = { id: "ue1", source: "uno-1", sourceHandle: "d13", target: "led-1", targetHandle: "anode" };
const unoEdge2: CircuitEdge = { id: "ue2", source: "led-1", sourceHandle: "cathode", target: "uno-1", targetHandle: "gnd1" };

const arduinoFrame = buildSimulationFrame({
  tick: 1,
  nodes: [arduinoNode, ledNode],
  edges: [unoEdge1, unoEdge2],
  dynamicComponents: [],
  boardType: "arduino",
  running: true,
});

const arduinoLedState = arduinoFrame.components["led-1"];
const arduinoStatus = checkComponentStatus("led-1", "led", arduinoFrame);

if (arduinoLedState?.telemetry?.hasPowerSourceInCanvas !== true || arduinoStatus?.message === "Power Source Not Present") {
  console.error("❌ Test 3 FAILED: Arduino circuit has power source warning!");
  allPassed = false;
} else {
  console.log("  [PASS] NO 'Power Source Not Present' warning for Arduino-driven LED\n");
}

console.log("=================== SUMMARY ===================");
if (allPassed) {
  console.log("✅ All power source warning regression tests PASSED.");
} else {
  console.error("❌ Power source warning regression tests FAILED.");
  process.exit(1);
}
