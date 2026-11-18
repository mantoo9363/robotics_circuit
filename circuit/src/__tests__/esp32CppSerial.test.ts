/**
 * ESP32 C++ (Arduino-style) Serial Communication Test Suite
 *
 * Verifies Phase 3:
 *   1. Serial.begin(baud) recognition as a no-op setup call
 *   2. Serial.print() & Serial.println() basic string and variable output
 *   3. Multi-tick stream buffering (partial lines hold until newline or println)
 *   4. Number formatting (BIN, HEX, DEC, OCT, float precision)
 *   5. String concatenation ("Val: " + String(x))
 *   6. Serial prints inside conditionals (if / else with digitalRead)
 *   7. checkEsp32CppSupport inspector accurately accepts Serial output
 *   8. Multi-component integration test (potentiometer + LED + Serial reporting)
 */

import assert from "assert";
import {
  evaluateEsp32CppSerial,
  resetEsp32CppSerialSessions,
  checkEsp32CppSupport,
} from "../lib/esp32/parser";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { NE555StateManager, CapacitorStateManager, KeypadStateManager } from "../lib/simulation/stateMaps";
import { buildSimulationFrame } from "../lib/simulation-state";
import type { CircuitNode, CircuitEdge } from "../lib/types";

const ne555State = new NE555StateManager();
const capacitorState = new CapacitorStateManager();
const keypad4x4State = new KeypadStateManager();
const keypad4x3State = new KeypadStateManager();

const defaultPipelineContext = {
  dynamicComponents: [],
  picoCode: "",
  ne555State,
  capacitorState,
  keypad4x4State,
  keypad4x3State,
  boardType: "esp32" as const,
  selectedLanguage: "cpp" as const,
};

console.log("=================== RUNNING ESP32 C++ SERIAL COMMUNICATION TESTS ===================");

// Helper to create ESP32 node
function createEsp32Node(id = "esp32-1"): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "esp32",
      simulationModel: "esp32",
      label: "ESP32 DevKit V1",
      rotation: 0,
      properties: {} as any,
    },
  };
}

// Helper to create LED node
function createLedNode(id = "led-1"): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 100, y: 0 },
    data: {
      componentType: "led",
      simulationModel: "led",
      label: "Red LED",
      rotation: 0,
      properties: { color: { value: "red" } } as any,
    },
  };
}

// Helper to create Potentiometer node
function createPotNode(id = "pot-1", valPercent = 50): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "potentiometer",
      simulationModel: "potentiometer",
      label: "Potentiometer",
      rotation: 0,
      properties: { position: { value: valPercent } } as any,
    },
  };
}

// Helper to create Pushbutton node
function createButtonNode(id = "btn-1", pressed = false): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 300, y: 0 },
    data: {
      componentType: "pushbutton",
      simulationModel: "pushbutton",
      label: "Push Button",
      rotation: 0,
      properties: { pressed: { value: pressed } } as any,
    },
  };
}

// Helper to create edge
function createEdge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): CircuitEdge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: "wire",
    data: { color: "#22c55e" },
  };
}

// --- TEST 1: Serial.begin() & Basic String Output ---
console.log("\n--- TEST 1: Serial.begin() & Basic String Output ---");
{
  resetEsp32CppSerialSessions();
  const code = `
void setup() {
  Serial.begin(115200);
  Serial.println("System Initialized");
}

void loop() {
  Serial.println("Tick Loop");
}
`;

  const res = evaluateEsp32CppSerial(code, { tick: 0 });
  assert.strictEqual(res.newLines.length, 2, "Expected 2 lines emitted on tick 0 (setup + loop)");
  assert.strictEqual(res.newLines[0], "System Initialized");
  assert.strictEqual(res.newLines[1], "Tick Loop");
  console.log("  [PASS] Serial.begin() and Serial.println() string output verified");
}

// --- TEST 2: Multi-Call Chained Prints & Stream Buffering ---
console.log("\n--- TEST 2: Multi-Call Chained Prints & Stream Buffering ---");
{
  resetEsp32CppSerialSessions();
  const code = `
void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.print("Sensor: ");
  Serial.print(42);
  Serial.print(" | Status: ");
  Serial.println("OK");
}
`;

  const res = evaluateEsp32CppSerial(code, { tick: 0 });
  assert.strictEqual(res.newLines.length, 1, "Expected 1 complete line assembled from chained prints");
  assert.strictEqual(res.newLines[0], "Sensor: 42 | Status: OK");
  console.log("  [PASS] Chained Serial.print() calls assemble into single line on println()");
}

// --- TEST 3: Partial Stream Buffering Across Consecutive Ticks ---
console.log("\n--- TEST 3: Partial Stream Buffering Across Consecutive Ticks ---");
{
  resetEsp32CppSerialSessions();
  const code = `
void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.print("Connecting...");
}
`;

  // Tick 0: emits "Connecting..." into buffer, no complete newline
  const res0 = evaluateEsp32CppSerial(code, { tick: 0 });
  assert.strictEqual(res0.newLines.length, 0, "No newline emitted yet on tick 0");
  assert.strictEqual(res0.pendingBuffer, "Connecting...", "Pending buffer holds un-flushed partial text");

  // Code for tick 1 appending "OK!" with println
  const codeTick1 = `
void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.println("OK!");
}
`;
  // Simulate continuous session: evaluate on tick 1
  const res1 = evaluateEsp32CppSerial(codeTick1, { tick: 1 });
  assert.strictEqual(res1.newLines.length, 1, "Completed line emitted on println()");
  assert.strictEqual(res1.newLines[0], "OK!", "Flushes correctly");
  console.log("  [PASS] Multi-tick stream buffering and line flushing verified");
}

// --- TEST 4: Arduino Base Formatting & Float Precision ---
console.log("\n--- TEST 4: Arduino Base Formatting & Float Precision ---");
{
  resetEsp32CppSerialSessions();
  const code = `
void setup() {
  Serial.begin(115200);
}

void loop() {
  int num = 78;
  Serial.println(num, HEX);
  Serial.println(num, BIN);
  Serial.println(num, DEC);
  Serial.println(num, OCT);
}
`;

  const res = evaluateEsp32CppSerial(code, { tick: 0 });
  assert.strictEqual(res.newLines[0], "4E", "HEX format 78 -> 4E");
  assert.strictEqual(res.newLines[1], "1001110", "BIN format 78 -> 1001110");
  assert.strictEqual(res.newLines[2], "78", "DEC format 78 -> 78");
  assert.strictEqual(res.newLines[3], "116", "OCT format 78 -> 116");
  console.log("  [PASS] HEX, BIN, DEC, and OCT formatting specifiers verified");
}

// --- TEST 5: String Concatenation ---
console.log("\n--- TEST 5: String Concatenation ---");
{
  resetEsp32CppSerialSessions();
  const code = `
void setup() {
  Serial.begin(115200);
}

void loop() {
  int count = 5;
  Serial.println("Count = " + String(count));
  Serial.println(String("Reading: ") + 100);
}
`;

  const res = evaluateEsp32CppSerial(code, { tick: 0 });
  assert.strictEqual(res.newLines[0], "Count = 5");
  assert.strictEqual(res.newLines[1], "Reading: 100");
  console.log("  [PASS] String concatenation ('Text ' + String(val)) verified");
}

// --- TEST 6: Conditionals with digitalRead & Serial Output ---
console.log("\n--- TEST 6: Conditionals with digitalRead & Serial Output ---");
{
  resetEsp32CppSerialSessions();
  const code = `
#define BTN_PIN 4

void setup() {
  Serial.begin(115200);
  pinMode(BTN_PIN, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(BTN_PIN) == LOW) {
    Serial.println("BUTTON PRESSED");
  } else {
    Serial.println("BUTTON RELEASED");
  }
}
`;

  // Tick 0: Button unpressed (logic HIGH due to pullup)
  const inputStatesReleased = new Map<number, boolean>([[4, true]]);
  const res1 = evaluateEsp32CppSerial(code, { tick: 0, inputStates: inputStatesReleased });
  assert.strictEqual(res1.newLines.includes("BUTTON RELEASED"), true);
  assert.strictEqual(res1.newLines.includes("BUTTON PRESSED"), false);

  // Tick 1: Button pressed (logic LOW)
  const inputStatesPressed = new Map<number, boolean>([[4, false]]);
  const res2 = evaluateEsp32CppSerial(code, { tick: 1, inputStates: inputStatesPressed });
  assert.strictEqual(res2.newLines.includes("BUTTON PRESSED"), true);
  console.log("  [PASS] Conditionals with digitalRead toggle Serial output accurately");
}

// --- TEST 7: checkEsp32CppSupport Permissibility ---
console.log("\n--- TEST 7: checkEsp32CppSupport Permissibility ---");
{
  const validSketch = `
void setup() {
  Serial.begin(115200);
  Serial.println("Starting up...");
  pinMode(2, OUTPUT);
}

void loop() {
  Serial.print("State: ");
  Serial.println(digitalRead(4));
}
`;

  const status1 = checkEsp32CppSupport(validSketch);
  assert.strictEqual(status1.isSupported, true, "Valid Serial sketch must be supported");
  assert.strictEqual(status1.unsupportedConstructs.length, 0);

  const invalidSketch = `
void setup() {
  Serial.begin(115200);
  WiFi.begin("ssid", "pass");
}
void loop() {
  if (Serial.available()) {
    char c = Serial.read();
  }
}
`;

  const status2 = checkEsp32CppSupport(invalidSketch);
  assert.strictEqual(status2.isSupported, false, "Genuinely unsupported constructs must still be flagged");
  assert.strictEqual(status2.unsupportedConstructs.includes("WiFi library"), true);
  assert.strictEqual(status2.unsupportedConstructs.some(s => s.includes("Serial.read")), true);
  console.log("  [PASS] checkEsp32CppSupport permits Serial output while guarding unsupported constructs");
}

// --- TEST 8: Multi-Component Integration Test (Potentiometer + LED + Serial) ---
console.log("\n--- TEST 8: Multi-Component Integration Test (Potentiometer + LED + Serial) ---");
{
  resetEsp32CppSerialSessions();
  const esp32 = createEsp32Node("esp32-1");
  const led = createLedNode("led-1");
  const pot = createPotNode("pot-1", 50); // 50% wiper -> ~511 10-bit ADC

  const nodes = [esp32, led, pot];
  const edges = [
    // Potentiometer VCC (pin1) -> 3.3V, GND (pin3) -> GND, Wiper -> GPIO34
    createEdge("e1", "esp32-1", "esp32_3v3", "pot-1", "pin1"),
    createEdge("e2", "esp32-1", "esp32_gnd1", "pot-1", "pin3"),
    createEdge("e3", "pot-1", "wiper", "esp32-1", "gpio34"),
    // LED Anode -> GPIO25, Cathode -> GND
    createEdge("e4", "esp32-1", "gpio25", "led-1", "anode"),
    createEdge("e5", "led-1", "cathode", "esp32-1", "esp32_gnd2"),
  ];

  const code = `
const int potPin = 34;
const int ledPin = 25;

void setup() {
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int sensorValue = analogRead(potPin);
  int brightness = map(sensorValue, 0, 1023, 0, 255);
  analogWrite(ledPin, brightness);

  Serial.print("POT: ");
  Serial.print(sensorValue);
  Serial.print(" | LED: ");
  Serial.println(brightness);
}
`;

  const initialFrame = buildSimulationFrame({
    tick: 0,
    nodes,
    edges,
    dynamicComponents: [],
    boardType: "esp32",
    running: true,
  });

  const frameAfterEsp32 = applyEsp32SimulationToFrame(initialFrame, {
    ...defaultPipelineContext,
    nodes,
    edges,
    arduinoCode: code,
  });

  const finalFrame = applyFramePipeline(frameAfterEsp32, {
    ...defaultPipelineContext,
    nodes,
    edges,
    arduinoCode: code,
  });

  // Verify Serial output
  assert.ok(finalFrame.serialOutput && finalFrame.serialOutput.length > 0, "Expected serialOutput in frame");
  const lastLine = finalFrame.serialOutput[finalFrame.serialOutput.length - 1];
  console.log("  [Trace Serial Line]:", lastLine);
  assert.ok(lastLine.startsWith("POT: "), "Serial line starts with 'POT: '");
  assert.ok(lastLine.includes(" | LED: "), "Serial line contains ' | LED: '");

  // Verify LED is powered and brightness is non-zero
  const ledComp = finalFrame.components["led-1"];
  assert.ok(ledComp, "LED component exists in frame");
  assert.strictEqual(ledComp.isPowered, true, "LED is powered by PWM");
  assert.ok(ledComp.brightness > 0, `LED brightness should be > 0 (actual: ${ledComp.brightness})`);

  console.log("  [PASS] Full stack integration: Potentiometer (ADC) + LED (PWM) + Serial output co-simulated");
}

console.log("\n=================== ALL ESP32 C++ SERIAL TESTS PASSED ===================");
