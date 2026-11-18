/**
 * ESP32 C++ (Arduino-style) Digital I/O Test Suite
 *
 * Verifies Phase 1 foundation:
 *   - void setup() and void loop() structure extraction
 *   - Constant resolution (#define, const int, int, byte, GPIO_NUM_X)
 *   - #include and comment filtering
 *   - pinMode(pin, OUTPUT | INPUT | INPUT_PULLUP)
 *   - digitalWrite(pin, HIGH | LOW | 1 | 0)
 *   - digitalRead(pin) with conditional evaluation and direct assignment
 *   - Hardware safety guards (GPIO6-11 flash reserved, GPIO34-39 input-only)
 *   - C++ construct support inspector (checkEsp32CppSupport)
 */

import assert from "assert";
import {
  parseEsp32CppGpioActions,
  checkEsp32CppSupport,
} from "../lib/esp32/parser";
import { parseEsp32SessionActions } from "../lib/esp32/parser/sessionParser";
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
  ne555State,
  capacitorState,
  keypad4x4State,
  keypad4x3State,
  boardType: "esp32" as const,
  selectedLanguage: "cpp",
};

console.log("=================== RUNNING ESP32 C++ DIGITAL I/O TESTS ===================");

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
function createLedNode(id = "led-1", color = "red"): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 100, y: 0 },
    data: {
      componentType: "led",
      simulationModel: "led",
      label: "LED",
      rotation: 0,
      properties: { color: { value: color } } as any,
    },
  };
}

// Helper to create Pushbutton node
function createButtonNode(id = "btn-1", pressed = false): CircuitNode {
  return {
    id,
    type: "pushbutton",
    position: { x: 200, y: 0 },
    data: {
      componentType: "pushbutton",
      label: "Push Button",
      simulationModel: "pushbutton",
      properties: {
        state: { label: "State", type: "select" as const, value: pressed ? "pressed" : "released" },
      },
      rotation: 0,
    },
  };
}

// --- TEST 1: setup() and loop() with literal pin numbers ---
console.log("\n--- TEST 1: Basic setup() and loop() with literal pins ---");
const code1 = `
#include <Arduino.h>

void setup() {
  pinMode(2, OUTPUT);
  pinMode(4, OUTPUT);
}

void loop() {
  digitalWrite(2, HIGH);
  digitalWrite(4, LOW);
}
`;

const actions1 = parseEsp32CppGpioActions(code1);
const pin2Act = actions1.find((a) => a.pin === 2 && a.type === "gpio_write");
const pin4Act = actions1.find((a) => a.pin === 4 && a.type === "gpio_write");

assert.ok(pin2Act && pin2Act.type === "gpio_write" && pin2Act.value === 1, "GPIO2 must be written HIGH (1)");
assert.ok(pin4Act && pin4Act.type === "gpio_write" && pin4Act.value === 0, "GPIO4 must be written LOW (0)");
console.log("  [PASS] setup() and loop() extracted and literal digital writes verified");

// --- TEST 2: Variable and Macro Declarations (#define, const int, byte, GPIO_NUM_X) ---
console.log("\n--- TEST 2: Variable and Macro Declarations ---");
const code2 = `
#define LED_RED GPIO_NUM_2
const int LED_GREEN = 4;
int BUTTON_PIN = 15;
byte AUX_PIN = 23;

void setup() {
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(AUX_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_RED, HIGH);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(AUX_PIN, 1);
}
`;

const actions2 = parseEsp32CppGpioActions(code2);
const redAct = actions2.find((a) => a.pin === 2 && a.type === "gpio_write");
const greenAct = actions2.find((a) => a.pin === 4 && a.type === "gpio_write");
const btnAct = actions2.find((a) => a.pin === 15 && a.type === "gpio_read");
const auxAct = actions2.find((a) => a.pin === 23 && a.type === "gpio_write");

assert.ok(redAct && redAct.type === "gpio_write" && redAct.value === 1, "LED_RED (GPIO_NUM_2) must be 1");
assert.ok(greenAct && greenAct.type === "gpio_write" && greenAct.value === 0, "LED_GREEN (4) must be 0");
assert.ok(btnAct && btnAct.type === "gpio_read" && btnAct.pull === "up", "BUTTON_PIN (15) must be INPUT_PULLUP");
assert.ok(auxAct && auxAct.type === "gpio_write" && auxAct.value === 1, "AUX_PIN (23) must be 1");
console.log("  [PASS] Variable and macro identifiers (#define, const int, byte, GPIO_NUM_X) resolved accurately");

// --- TEST 3: Safe #include and comment stripping ---
console.log("\n--- TEST 3: Safe #include and comment stripping ---");
const code3 = `
// Single line comment
#include <WiFi.h>
#include "esp_system.h"
/* Multi-line
   comment block
*/
void setup() {
  // Setup comment
  pinMode(2, OUTPUT);
}
void loop() {
  /* Loop comment */
  digitalWrite(2, HIGH);
}
`;

const actions3 = parseEsp32CppGpioActions(code3);
assert.strictEqual(actions3.length, 1, "Only 1 write action expected after stripping comments/includes");
assert.strictEqual(actions3[0].pin, 2);
assert.strictEqual((actions3[0] as any).value, 1);
console.log("  [PASS] #include directives and multi-line comments safely ignored as no-op");

// --- TEST 4: Digital input pullup voltage resolution in frame ---
console.log("\n--- TEST 4: Digital input pullup voltage resolution ---");
const esp32Node = createEsp32Node();
const btnNode = createButtonNode("btn-1", false); // Unpressed

const edges4: CircuitEdge[] = [
  { id: "e_btn_pin", source: esp32Node.id, sourceHandle: "gpio4", target: btnNode.id, targetHandle: "pin1" },
  { id: "e_btn_gnd", source: btnNode.id, sourceHandle: "pin2", target: esp32Node.id, targetHandle: "esp32_gnd1" },
];

const codePullup = `
void setup() {
  pinMode(4, INPUT_PULLUP);
}
void loop() {}
`;

const initFrame = buildSimulationFrame({
  tick: 1,
  nodes: [esp32Node, btnNode],
  edges: edges4,
  boardType: "esp32",
  running: true,
});

const frame4 = applyEsp32SimulationToFrame(initFrame, {
  nodes: [esp32Node, btnNode],
  edges: edges4,
  arduinoCode: codePullup,
  picoCode: "",
  dynamicComponents: [],
  selectedLanguage: "cpp",
} as any);

const espComp4 = frame4.components[esp32Node.id];
assert.ok(espComp4 && espComp4.pins["gpio4"], "ESP32 pins must track gpio4");
assert.strictEqual(espComp4.pins["gpio4"].voltage, 3.3, "Unpressed button with INPUT_PULLUP must resolve to 3.3V (HIGH)");
assert.strictEqual(espComp4.pins["gpio4"].normalizedValue, 1.0, "Normalized value must be 1.0");
assert.strictEqual(espComp4.telemetry["gpio4_input_logicHigh"], true, "Telemetry logicHigh must be true");
assert.strictEqual(espComp4.telemetry["gpio4_input_pull"], "up", "Telemetry input_pull must be up");
console.log("  [PASS] INPUT_PULLUP unpressed button cleanly resolves to 3.3V / logic 1");

// --- TEST 5: Conditional logic evaluation (Button press toggles LED) ---
console.log("\n--- TEST 5: Conditional logic evaluation (if/else) ---");
const ledNode = createLedNode("led-1");
const edges5: CircuitEdge[] = [
  // Button on GPIO4 and GND
  { id: "e_btn_pin", source: esp32Node.id, sourceHandle: "gpio4", target: "btn-1", targetHandle: "pin2" },
  { id: "e_btn_gnd", source: "btn-1", sourceHandle: "pin1", target: esp32Node.id, targetHandle: "esp32_gnd1" },
  // LED on GPIO2 and GND
  { id: "e_led_anode", source: esp32Node.id, sourceHandle: "gpio2", target: "led-1", targetHandle: "anode" },
  { id: "e_led_cathode", source: "led-1", sourceHandle: "cathode", target: esp32Node.id, targetHandle: "esp32_gnd2" },
];

const codeConditional = `
const int BUTTON_PIN = 4;
const int LED_PIN = 2;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  if (digitalRead(BUTTON_PIN) == LOW) {
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
}
`;

// Case A: Button unpressed (pullup = HIGH) -> LED must be OFF
const btnUnpressed = createButtonNode("btn-1", false);
const baseFrameUnpressed = buildSimulationFrame({
  tick: 1,
  nodes: [esp32Node, btnUnpressed, ledNode],
  edges: edges5,
  boardType: "esp32",
  running: true,
});
const frameUnpressed = applyFramePipeline(baseFrameUnpressed, {
  ...defaultPipelineContext,
  nodes: [esp32Node, btnUnpressed, ledNode],
  edges: edges5,
  arduinoCode: codeConditional,
  picoCode: "",
} as any);

const ledCompOff = frameUnpressed.components[ledNode.id];
assert.strictEqual(ledCompOff?.isPowered, false, "LED must be unpowered when button is unpressed");

// Case B: Button pressed (pulled to GND = LOW) -> LED must be ON
const btnPressed = createButtonNode("btn-1", true);
const baseFramePressed = buildSimulationFrame({
  tick: 1,
  nodes: [esp32Node, btnPressed, ledNode],
  edges: edges5,
  boardType: "esp32",
  running: true,
});
const framePressed = applyFramePipeline(baseFramePressed, {
  ...defaultPipelineContext,
  nodes: [esp32Node, btnPressed, ledNode],
  edges: edges5,
  arduinoCode: codeConditional,
  picoCode: "",
} as any);

const ledCompOn = framePressed.components[ledNode.id];
assert.strictEqual(ledCompOn?.isPowered, true, "LED must be powered when button is pressed (LOW)");
console.log("  [PASS] C++ conditional if (digitalRead(btn) == LOW) toggles LED on physical button press");

// --- TEST 6: Direct read assignment digitalWrite(led, !digitalRead(btn)) ---
console.log("\n--- TEST 6: Direct read assignment ---");
const codeDirect = `
void setup() {
  pinMode(4, INPUT_PULLUP);
  pinMode(2, OUTPUT);
}
void loop() {
  digitalWrite(2, !digitalRead(4));
}
`;

const frameDirectPressed = applyFramePipeline(baseFramePressed, {
  ...defaultPipelineContext,
  nodes: [esp32Node, btnPressed, ledNode],
  edges: edges5,
  arduinoCode: codeDirect,
  picoCode: "",
} as any);

const ledDirectOn = frameDirectPressed.components[ledNode.id];
assert.strictEqual(ledDirectOn?.isPowered, true, "LED must be powered via direct inverted read assignment");
console.log("  [PASS] Direct read assignment digitalWrite(led, !digitalRead(btn)) verified");

// --- TEST 7: Hardware Safety Guards (Flash Pins & Input-Only Pins) ---
console.log("\n--- TEST 7: Hardware Safety Guards ---");
const codeForbidden = `
void setup() {
  pinMode(6, OUTPUT);      // Forbidden SPI flash pin
  pinMode(34, OUTPUT);     // Input-only pin
  pinMode(35, INPUT);      // Allowed input pin
}
void loop() {
  digitalWrite(6, HIGH);
  digitalWrite(34, HIGH);
}
`;

const actionsForbidden = parseEsp32CppGpioActions(codeForbidden);
const flashAct = actionsForbidden.find((a) => a.pin === 6);
const inputOnlyAct = actionsForbidden.find((a) => a.pin === 34);
const allowedInputAct = actionsForbidden.find((a) => a.pin === 35 && a.type === "gpio_read");

assert.ok(flashAct && flashAct.warning?.includes("SPI flash"), "GPIO6 must be rejected with SPI flash warning");
assert.ok(inputOnlyAct && inputOnlyAct.warning?.includes("input-only"), "GPIO34 OUTPUT must be rejected with input-only warning");
assert.ok(allowedInputAct && allowedInputAct.type === "gpio_read", "GPIO35 INPUT must be allowed cleanly");
console.log("  [PASS] Hardware safety guards enforced: SPI flash (GPIO6-11) and input-only (GPIO34-39)");

// --- TEST 8: C++ Support Inspector ---
console.log("\n--- TEST 8: C++ Support Inspector ---");
const pureDigitalCode = `
void setup() {
  pinMode(2, OUTPUT);
}
void loop() {
  digitalWrite(2, HIGH);
  delay(1000);
}
`;
const supportStatusValid = checkEsp32CppSupport(pureDigitalCode);
assert.strictEqual(supportStatusValid.isSupported, true, "Pure digital I/O sketch must be supported");
assert.strictEqual(supportStatusValid.unsupportedConstructs.length, 0);

const codeWithUnsupported = `
void setup() {
  pinMode(2, OUTPUT);
  WiFi.begin("SSID", "PASS");
}
void loop() {
  digitalWrite(2, HIGH);
}
`;
const supportStatusInvalid = checkEsp32CppSupport(codeWithUnsupported);
assert.strictEqual(supportStatusInvalid.isSupported, false, "WiFi library sketch must be flagged as unsupported");
assert.ok(supportStatusInvalid.unsupportedConstructs.includes("WiFi library"));
console.log("  [PASS] checkEsp32CppSupport cleanly differentiates supported constructs from unsupported constructs");

console.log("\n=================== ALL ESP32 C++ DIGITAL I/O TESTS PASSED ===================");
