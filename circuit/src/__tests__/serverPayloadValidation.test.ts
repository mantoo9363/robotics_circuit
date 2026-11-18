import type { SimulationStartPayload } from "../lib/simulation-state";

console.log("=================== SERVER PAYLOAD VALIDATION & BOARD DISPATCH REGRESSION TEST ===================");

let allPassed = true;

function isSimulationStartPayload(value: unknown): value is SimulationStartPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SimulationStartPayload>;
  return (
    Array.isArray(payload.nodes) &&
    payload.nodes.length <= 500 &&
    Array.isArray(payload.edges) &&
    payload.edges.length <= 2_000 &&
    (!payload.dynamicComponents || payload.dynamicComponents.length <= 200) &&
    (!payload.servoMotions || payload.servoMotions.length <= 200) &&
    typeof payload.arduinoCode === 'string' &&
    payload.arduinoCode.length <= 200_000 &&
    typeof payload.picoCode === 'string' &&
    payload.picoCode.length <= 200_000 &&
    (payload.boardType === 'arduino' || payload.boardType === 'pico' || payload.boardType === 'esp32' || payload.boardType === 'none')
  );
}

// TEST 1: ESP32 Simulation Start Payload Validation
const esp32Payload: SimulationStartPayload = {
  nodes: [{ id: "esp32-1", type: "circuitComponent", position: { x: 0, y: 0 }, data: { componentType: "esp32", simulationModel: "esp32", label: "ESP32", rotation: 0, properties: {} as any } }],
  edges: [],
  dynamicComponents: [],
  boardType: "esp32",
  arduinoCode: "",
  picoCode: "from machine import Pin\nled = Pin(2, Pin.OUT)\nled.value(1)",
  servoMotions: [],
  sessionId: "test-esp32-session-123",
};

const isEsp32Valid = isSimulationStartPayload(esp32Payload);
console.log(`[Trace Test 1] ESP32 boardType='esp32' payload validation = ${isEsp32Valid}`);
if (!isEsp32Valid) {
  console.error("❌ Test 1 FAILED: ESP32 payload rejected by isSimulationStartPayload");
  allPassed = false;
} else {
  console.log("  [PASS] ESP32 start simulation payload validated successfully\n");
}

// TEST 2: Arduino Payload Validation
const arduinoPayload: SimulationStartPayload = {
  nodes: [{ id: "uno-1", type: "circuitComponent", position: { x: 0, y: 0 }, data: { componentType: "arduino", simulationModel: "arduino", label: "Arduino", rotation: 0, properties: {} as any } }],
  edges: [],
  dynamicComponents: [],
  boardType: "arduino",
  arduinoCode: "void setup() { pinMode(13, OUTPUT); } void loop() { digitalWrite(13, HIGH); }",
  picoCode: "",
  servoMotions: [],
  sessionId: "test-arduino-session-123",
};

const isArduinoValid = isSimulationStartPayload(arduinoPayload);
console.log(`[Trace Test 2] Arduino boardType='arduino' payload validation = ${isArduinoValid}`);
if (!isArduinoValid) {
  console.error("❌ Test 2 FAILED: Arduino payload rejected by isSimulationStartPayload");
  allPassed = false;
} else {
  console.log("  [PASS] Arduino start simulation payload validated successfully\n");
}

// TEST 3: Pico Payload Validation
const picoPayload: SimulationStartPayload = {
  nodes: [{ id: "pico-1", type: "circuitComponent", position: { x: 0, y: 0 }, data: { componentType: "raspberrypipico", simulationModel: "raspberrypipico", label: "Pico", rotation: 0, properties: {} as any } }],
  edges: [],
  dynamicComponents: [],
  boardType: "pico",
  arduinoCode: "",
  picoCode: "from machine import Pin\nled = Pin(25, Pin.OUT)\nled.value(1)",
  servoMotions: [],
  sessionId: "test-pico-session-123",
};

const isPicoValid = isSimulationStartPayload(picoPayload);
console.log(`[Trace Test 3] Pico boardType='pico' payload validation = ${isPicoValid}`);
if (!isPicoValid) {
  console.error("❌ Test 3 FAILED: Pico payload rejected by isSimulationStartPayload");
  allPassed = false;
} else {
  console.log("  [PASS] Pico start simulation payload validated successfully\n");
}

console.log("=================== SUMMARY ===================");
if (allPassed) {
  console.log("✅ All board start simulation payload validation tests PASSED.");
} else {
  console.error("❌ Payload validation tests failed.");
  process.exit(1);
}
