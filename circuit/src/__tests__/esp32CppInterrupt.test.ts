/**
 * esp32CppInterrupt.test.ts
 *
 * Dedicated test suite for ESP32 C++ (Arduino-style) Hardware Interrupts:
 *   - attachInterrupt(digitalPinToInterrupt(pin), isr, mode) and attachInterrupt(pin, isr, mode)
 *   - detachInterrupt(digitalPinToInterrupt(pin)) and detachInterrupt(pin)
 *   - Trigger modes: FALLING, RISING, CHANGE
 *   - Zero-argument ISR execution (void isr() { ... })
 *   - Boot-time false-trigger protection (idle pull-up starts at 1, does NOT fire at boot)
 *   - Edge-triggered latching (press -> hold -> release -> press)
 *   - checkEsp32CppSupport permissibility
 *   - Multi-component integration test (Button Interrupt + LED Toggle + Serial Output)
 */

import assert from "node:assert";
import {
  evaluateEsp32CppInterrupts,
  resetEsp32CppInterruptSessions,
  checkEsp32CppSupport,
  evaluateEsp32CppSerial,
  evaluateEsp32CppConditionals,
} from "../lib/esp32/parser";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { buildSimulationFrame } from "../lib/simulation-state";
import type { CircuitNode, CircuitEdge } from "../lib/types";

function createNode(id: string, type: string, label: string, properties: Record<string, any> = {}): CircuitNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      componentType: type,
      simulationModel: type,
      label,
      rotation: 0,
      properties,
    },
  } as CircuitNode;
}

function createEdge(id: string, fromNode: string, fromPin: string, toNode: string, toPin: string): CircuitEdge {
  return {
    id,
    source: fromNode,
    sourceHandle: fromPin,
    target: toNode,
    targetHandle: toPin,
  } as CircuitEdge;
}

console.log("=================== RUNNING ESP32 C++ HARDWARE INTERRUPT TESTS ===================");

// --- TEST 1: FALLING Edge (Standard INPUT_PULLUP Pushbutton) ---
console.log("\n--- TEST 1: FALLING Edge (Standard INPUT_PULLUP Pushbutton) ---");
{
  resetEsp32CppInterruptSessions();
  const code = `
#define BUTTON_PIN 18
#define LED_PIN 2

volatile int pressCount = 0;
volatile bool ledState = false;

void IRAM_ATTR handleButton() {
  pressCount++;
  ledState = !ledState;
}

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), handleButton, FALLING);
}

void loop() {
  digitalWrite(LED_PIN, ledState);
}
`;

  // Tick 0 (Boot): Pin 18 is idle HIGH (pullup) -> MUST NOT TRIGGER
  const inputBoot = new Map<number, boolean>([[18, true]]);
  const resBoot = evaluateEsp32CppInterrupts(code, { tick: 0, inputStates: inputBoot });
  assert.strictEqual(resBoot.variables.get("pressCount"), 0, "Boot must not trigger FALLING interrupt");
  assert.strictEqual(resBoot.variables.get("ledState"), false, "ledState must remain false at boot");

  // Tick 1 (t=50ms): Still HIGH -> No edge -> No trigger
  const resIdle = evaluateEsp32CppInterrupts(code, { tick: 1, inputStates: inputBoot });
  assert.strictEqual(resIdle.variables.get("pressCount"), 0, "Idle HIGH must not trigger");

  // Tick 2 (t=100ms): Pressed (HIGH -> LOW) -> FALLING edge -> TRIGGERS!
  const inputPress = new Map<number, boolean>([[18, false]]);
  const resPress1 = evaluateEsp32CppInterrupts(code, { tick: 2, inputStates: inputPress });
  assert.strictEqual(resPress1.variables.get("pressCount"), 1, "First falling edge must increment pressCount to 1");
  assert.strictEqual(resPress1.variables.get("ledState"), true, "First falling edge must toggle ledState to true");
  assert.ok(resPress1.triggeredPins.includes(18), "Triggered pins must include Pin 18");

  // Tick 3 (t=150ms): Held LOW -> No new edge -> MUST NOT RE-TRIGGER
  const resHold = evaluateEsp32CppInterrupts(code, { tick: 3, inputStates: inputPress });
  assert.strictEqual(resHold.variables.get("pressCount"), 1, "Holding button down must not re-trigger");

  // Tick 4 (t=200ms): Released (LOW -> HIGH) -> RISING edge -> MUST NOT TRIGGER FALLING handler
  const resRelease = evaluateEsp32CppInterrupts(code, { tick: 4, inputStates: inputBoot });
  assert.strictEqual(resRelease.variables.get("pressCount"), 1, "Release (rising edge) must not trigger FALLING handler");

  // Tick 5 (t=300ms): Pressed Again (HIGH -> LOW) -> 2nd FALLING edge -> TRIGGERS!
  const resPress2 = evaluateEsp32CppInterrupts(code, { tick: 5, inputStates: inputPress });
  assert.strictEqual(resPress2.variables.get("pressCount"), 2, "Second falling edge must increment pressCount to 2");
  assert.strictEqual(resPress2.variables.get("ledState"), false, "Second falling edge must toggle ledState back to false");

  console.log("  [PASS] FALLING edge trigger, edge-latching, and zero-arg ISR variable mutation verified");
}

// --- TEST 2: RISING Edge (Active-HIGH Sensor / Direct Pin Syntax) ---
console.log("\n--- TEST 2: RISING Edge (Direct Pin Syntax without digitalPinToInterrupt) ---");
{
  resetEsp32CppInterruptSessions();
  const code = `
const int sensorPin = 19;
volatile int riseCount = 0;

void onMotion() {
  riseCount = riseCount + 1;
}

void setup() {
  pinMode(sensorPin, INPUT_PULLDOWN);
  attachInterrupt(19, onMotion, RISING);
}

void loop() {}
`;

  // Tick 0 (Boot): Pin 19 is idle LOW -> MUST NOT TRIGGER
  const inputLow = new Map<number, boolean>([[19, false]]);
  const resBoot = evaluateEsp32CppInterrupts(code, { tick: 0, inputStates: inputLow });
  assert.strictEqual(resBoot.variables.get("riseCount"), 0, "Boot must not trigger RISING interrupt");

  // Tick 1: Transition LOW -> HIGH -> RISING edge -> TRIGGERS!
  const inputHigh = new Map<number, boolean>([[19, true]]);
  const resRise = evaluateEsp32CppInterrupts(code, { tick: 1, inputStates: inputHigh });
  assert.strictEqual(resRise.variables.get("riseCount"), 1, "Rising edge must increment riseCount to 1");

  // Tick 2: Held HIGH -> MUST NOT RE-TRIGGER
  const resHold = evaluateEsp32CppInterrupts(code, { tick: 2, inputStates: inputHigh });
  assert.strictEqual(resHold.variables.get("riseCount"), 1, "Held HIGH must not re-trigger");

  console.log("  [PASS] RISING edge trigger and direct pin syntax verified");
}

// --- TEST 3: CHANGE Mode (Both Edges) ---
console.log("\n--- TEST 3: CHANGE Mode (Both Edges) ---");
{
  resetEsp32CppInterruptSessions();
  const code = `
volatile int changeCount = 0;

void onToggle() {
  changeCount++;
}

void setup() {
  pinMode(4, INPUT);
  attachInterrupt(digitalPinToInterrupt(4), onToggle, CHANGE);
}

void loop() {}
`;

  // Tick 0: Boot idle LOW
  const inputLow = new Map<number, boolean>([[4, false]]);
  evaluateEsp32CppInterrupts(code, { tick: 0, inputStates: inputLow });

  // Tick 1: LOW -> HIGH (Edge 1)
  const inputHigh = new Map<number, boolean>([[4, true]]);
  const res1 = evaluateEsp32CppInterrupts(code, { tick: 1, inputStates: inputHigh });
  assert.strictEqual(res1.variables.get("changeCount"), 1, "Rising edge triggers in CHANGE mode");

  // Tick 2: HIGH -> LOW (Edge 2)
  const res2 = evaluateEsp32CppInterrupts(code, { tick: 2, inputStates: inputLow });
  assert.strictEqual(res2.variables.get("changeCount"), 2, "Falling edge triggers in CHANGE mode");

  console.log("  [PASS] CHANGE mode (rising + falling transitions) verified");
}

// --- TEST 4: detachInterrupt ---
console.log("\n--- TEST 4: detachInterrupt ---");
{
  resetEsp32CppInterruptSessions();
  const code = `
volatile int count = 0;

void isr() {
  count++;
}

void setup() {
  pinMode(18, INPUT_PULLUP);
  attachInterrupt(18, isr, FALLING);
  detachInterrupt(18); // Immediately unregister
}

void loop() {}
`;

  // Tick 0: Boot
  evaluateEsp32CppInterrupts(code, { tick: 0, inputStates: new Map([[18, true]]) });

  // Tick 1: Transition HIGH -> LOW -> Must NOT trigger because detached
  const res = evaluateEsp32CppInterrupts(code, { tick: 1, inputStates: new Map([[18, false]]) });
  assert.strictEqual(res.variables.get("count"), 0, "Detached interrupt must not fire");
  assert.strictEqual(res.triggeredPins.length, 0, "No pins triggered");

  console.log("  [PASS] detachInterrupt correctly unregisters handler");
}

// --- TEST 5: Direct digitalWrite & Serial.println inside ISR ---
console.log("\n--- TEST 5: Direct digitalWrite & Serial inside ISR ---");
{
  resetEsp32CppInterruptSessions();
  const code = `
void onButton() {
  digitalWrite(2, HIGH);
  Serial.println("ISR_FIRED");
}

void setup() {
  pinMode(18, INPUT_PULLUP);
  pinMode(2, OUTPUT);
  attachInterrupt(18, onButton, FALLING);
}

void loop() {}
`;

  evaluateEsp32CppInterrupts(code, { tick: 0, inputStates: new Map([[18, true]]) });
  const res = evaluateEsp32CppInterrupts(code, { tick: 1, inputStates: new Map([[18, false]]) });

  assert.strictEqual(res.actions.length, 1, "Expected 1 direct GPIO write action");
  const act = res.actions[0];
  assert.strictEqual(act.type, "gpio_write");
  if (act.type === "gpio_write") {
    assert.strictEqual(act.pin, 2);
    assert.strictEqual(act.value, 1);
  }
  assert.strictEqual(res.serialLines.length, 1);
  assert.strictEqual(res.serialLines[0], "ISR_FIRED");

  console.log("  [PASS] Direct digitalWrite and Serial.println inside ISR verified");
}

// --- TEST 6: checkEsp32CppSupport Permissibility ---
console.log("\n--- TEST 6: checkEsp32CppSupport Permissibility ---");
{
  const validSketch = `
void handlePress() {}
void setup() {
  attachInterrupt(digitalPinToInterrupt(18), handlePress, FALLING);
  detachInterrupt(18);
}
void loop() {}
`;
  const support = checkEsp32CppSupport(validSketch);
  assert.strictEqual(support.isSupported, true, "attachInterrupt & detachInterrupt must be supported");
  assert.strictEqual(support.unsupportedConstructs.length, 0);

  const invalidSketch = `
void setup() {
  WiFi.begin("ssid", "pass");
}
void loop() {}
`;
  const invalidSupport = checkEsp32CppSupport(invalidSketch);
  assert.strictEqual(invalidSupport.isSupported, false);
  assert.ok(invalidSupport.unsupportedConstructs.includes("WiFi library"));

  console.log("  [PASS] checkEsp32CppSupport permits attachInterrupt while guarding unsupported constructs");
}

// --- TEST 7: Multi-Component Integration Test (Button Interrupt + LED Toggle + Serial Output) ---
console.log("\n--- TEST 7: Multi-Component Integration (Button + LED + Serial) ---");
{
  resetEsp32CppInterruptSessions();

  const esp32Node = createNode("esp32-1", "esp32", "ESP32 DevKit");
  const buttonNode = createNode("btn-1", "pushbutton", "Button", { state: { value: "released" } });
  const ledNode = createNode("led-1", "led", "Status LED", { color: "green" });

  const nodes = [esp32Node, buttonNode, ledNode];
  const edges = [
    createEdge("e1", "esp32-1", "gpio18", "btn-1", "pin1"),
    createEdge("e2", "esp32-1", "esp32_gnd_1", "btn-1", "pin2"),
    createEdge("e3", "esp32-1", "gpio2", "led-1", "anode"),
    createEdge("e4", "esp32-1", "esp32_gnd_2", "led-1", "cathode"),
  ];

  const sketch = `
#define BTN_PIN 18
#define LED_PIN 2

volatile bool ledOn = false;
volatile int hitCount = 0;

void IRAM_ATTR buttonISR() {
  ledOn = !ledOn;
  hitCount++;
}

void setup() {
  Serial.begin(115200);
  pinMode(BTN_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  attachInterrupt(digitalPinToInterrupt(BTN_PIN), buttonISR, FALLING);
}

void loop() {
  if (ledOn) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
}
`;

  // Step 1: Boot (tick 0, button released) -> LED OFF
  const frame0 = buildSimulationFrame({ tick: 0, nodes, edges, boardType: "esp32", running: true });
  const out0 = applyEsp32SimulationToFrame(frame0, {
    nodes,
    edges,
    boardType: "esp32",
    arduinoCode: sketch,
    selectedLanguage: "cpp",
  } as any);

  const ledPin0 = out0.boardPins?.find(p => p.pin === 2);
  assert.strictEqual(ledPin0?.value, 0, "LED pin 2 must be LOW at boot");

  // Step 2: Press button (tick 1, button pressed -> pulls pin 18 LOW -> FALLING edge)
  buttonNode.data.properties.state.value = "pressed";
  const frame1 = buildSimulationFrame({ tick: 1, nodes, edges, boardType: "esp32", running: true });
  const out1 = applyEsp32SimulationToFrame(frame1, {
    nodes,
    edges,
    boardType: "esp32",
    arduinoCode: sketch,
    selectedLanguage: "cpp",
  } as any);

  const ledPin1 = out1.boardPins?.find(p => p.pin === 2);
  console.log("  [Trace Tick 1 LED Pin 2]:", ledPin1?.value);
  assert.strictEqual(ledPin1?.value, 255, "Interrupt must toggle LED pin 2 to HIGH (255)");

  // Step 3: Release button (tick 2, button released -> pin 18 returns to 3.3V / HIGH)
  buttonNode.data.properties.state.value = "released";
  const frame2 = buildSimulationFrame({ tick: 2, nodes, edges, boardType: "esp32", running: true });
  const out2 = applyEsp32SimulationToFrame(frame2, {
    nodes,
    edges,
    boardType: "esp32",
    arduinoCode: sketch,
    selectedLanguage: "cpp",
  } as any);

  const ledPin2 = out2.boardPins?.find(p => p.pin === 2);
  console.log("  [Trace Tick 2 LED Pin 2]:", ledPin2?.value);
  assert.strictEqual(ledPin2?.value, 255, "Release does not trigger FALLING; LED stays HIGH (255)");

  // Step 4: Press again (tick 3, 2nd button press -> FALLING edge -> toggles LED OFF)
  buttonNode.data.properties.state.value = "pressed";
  const frame3 = buildSimulationFrame({ tick: 3, nodes, edges, boardType: "esp32", running: true });
  const out3 = applyEsp32SimulationToFrame(frame3, {
    nodes,
    edges,
    boardType: "esp32",
    arduinoCode: sketch,
    selectedLanguage: "cpp",
  } as any);

  const ledPin3 = out3.boardPins?.find(p => p.pin === 2);
  console.log("  [Trace Tick 3 LED Pin 2]:", ledPin3?.value);
  assert.strictEqual(ledPin3?.value, 0, "2nd interrupt press must toggle LED pin 2 back to LOW (0)");

  console.log("  [PASS] Multi-component integration: Button Interrupt + LED Toggle + C++ Conditionals co-simulated");
}

// --- TEST 8: Software Debounce in ISR (millis timestamp check) + Ternary Serial Print ---
console.log("\n--- TEST 8: Software Debounce in ISR (millis timestamp check) + Ternary Serial Print ---");
{
  resetEsp32CppInterruptSessions();

  const debounceSketch = `
const int buttonPin = 18;
const int ledPin = 2;
volatile bool ledState = false;
volatile unsigned long lastPressTime = 0;
const unsigned long debounceDelay = 200;

void IRAM_ATTR onButtonPress() {
  unsigned long now = millis();
  if (now - lastPressTime > debounceDelay) {
    ledState = !ledState;
    lastPressTime = now;
  }
}

void setup() {
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
  attachInterrupt(digitalPinToInterrupt(buttonPin), onButtonPress, FALLING);
}

void loop() {
  digitalWrite(ledPin, ledState);
  Serial.println(ledState ? "LED ON" : "LED OFF");
}
`;

  // Tick 0: Boot (button released = HIGH)
  const res0 = evaluateEsp32CppInterrupts(debounceSketch, {
    tick: 0,
    timestamp: 0,
    inputStates: new Map([[18, true]]),
  });
  assert.strictEqual(res0.variables.get("ledState"), false);

  // Tick 1 (t = 250ms): Valid first press (FALLING: HIGH -> LOW)
  const res1 = evaluateEsp32CppInterrupts(debounceSketch, {
    tick: 1,
    timestamp: 250,
    inputStates: new Map([[18, false]]),
  });
  assert.strictEqual(res1.variables.get("ledState"), true, "First press at 250ms must toggle ledState to true");
  assert.strictEqual(res1.variables.get("lastPressTime"), 250);

  // Check Serial ternary output evaluation when ledState is true
  const serialResOn = evaluateEsp32CppSerial(debounceSketch, {
    tick: 1,
    timestamp: 250,
    inputStates: new Map([[18, false]]),
    variables: res1.variables,
  });
  console.log("  [Trace Serial Ternary (ON)]:", serialResOn.allLines);
  assert.ok(serialResOn.allLines.includes("LED ON"), "Serial.println must evaluate ternary to 'LED ON'");

  // Tick 2 (t = 280ms): Contact bounce glitch within 200ms debounce window
  evaluateEsp32CppInterrupts(debounceSketch, {
    tick: 2,
    timestamp: 270,
    inputStates: new Map([[18, true]]),
  });
  const resGlitch = evaluateEsp32CppInterrupts(debounceSketch, {
    tick: 3,
    timestamp: 280,
    inputStates: new Map([[18, false]]),
  });
  assert.strictEqual(resGlitch.variables.get("ledState"), true, "Bounce edge within 200ms window must be rejected");

  // Tick 4 (t = 500ms): Valid second press after 250ms (> 200ms debounce window)
  evaluateEsp32CppInterrupts(debounceSketch, {
    tick: 4,
    timestamp: 450,
    inputStates: new Map([[18, true]]),
  });
  const res2 = evaluateEsp32CppInterrupts(debounceSketch, {
    tick: 5,
    timestamp: 500,
    inputStates: new Map([[18, false]]),
  });
  assert.strictEqual(res2.variables.get("ledState"), false, "Second press at 500ms must toggle ledState back to false");

  // Check digitalWrite(ledPin, ledState) when ledState is true
  const condActionsOn = evaluateEsp32CppConditionals(debounceSketch, new Map([[18, false]]), {
    variables: res1.variables,
  });
  const pin2ActionOn = condActionsOn.find(a => a.type === "gpio_write" && a.pin === 2);
  assert.ok(pin2ActionOn && (pin2ActionOn as any).value === 1, "digitalWrite(ledPin, ledState) must write HIGH (1) to pin 2 when ledState is true");

  // Check Serial ternary output evaluation when ledState is false
  const serialResOff = evaluateEsp32CppSerial(debounceSketch, {
    tick: 5,
    timestamp: 500,
    inputStates: new Map([[18, false]]),
    variables: res2.variables,
  });
  console.log("  [Trace Serial Ternary (OFF)]:", serialResOff.allLines);
  assert.ok(serialResOff.allLines.includes("LED OFF"), "Serial.println must evaluate ternary to 'LED OFF'");

  // Check digitalWrite(ledPin, ledState) when ledState is false
  const condActionsOff = evaluateEsp32CppConditionals(debounceSketch, new Map([[18, false]]), {
    variables: res2.variables,
  });
  const pin2ActionOff = condActionsOff.find(a => a.type === "gpio_write" && a.pin === 2);
  assert.ok(pin2ActionOff && (pin2ActionOff as any).value === 0, "digitalWrite(ledPin, ledState) must write LOW (0) to pin 2 when ledState is false");

  console.log("  [PASS] Software debounce in ISR & ternary Serial output & direct digitalWrite(pin, ledState) verified");
}

console.log("\n=================== ALL ESP32 C++ INTERRUPT TESTS PASSED ===================");
