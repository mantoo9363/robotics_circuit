/**
 * ESP32 C++ (Arduino-style) I2C 16x2 LCD Test Suite
 *
 * Verifies Phase 4:
 *   1. LiquidCrystal_I2C constructor + init() + backlight() + print()
 *   2. setCursor(col, row) + multi-line writes (line1 and line2)
 *   3. Wire.begin() default (21/22) vs Wire.begin(sda, scl) custom pins
 *   4. Strict SDA/SCL conductive graph reachability and miswire detection
 *   5. Forbidden SPI flash pin (GPIO6-11) protection
 *   6. checkEsp32CppSupport inspector permissibility
 *   7. Multi-component integration test (LCD + Serial + Potentiometer ADC)
 */

import assert from "assert";
import {
  evaluateEsp32CppLcd,
  checkEsp32CppSupport,
} from "../lib/esp32/parser";
import { applyEsp32SimulationToFrame, applyEsp32LcdOutputToFrame } from "../lib/simulation/frameTransformers/esp32";
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

console.log("=================== RUNNING ESP32 C++ I2C LCD TESTS ===================");

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

// Helper to create LCD node
function createLcdNode(id = "lcd-1", i2cAddress = "0x27"): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 150, y: 0 },
    data: {
      componentType: "lcd16x2",
      simulationModel: "lcd16x2",
      label: "16x2 I2C LCD",
      rotation: 0,
      properties: {
        i2cAddress: { value: i2cAddress },
        backpackType: { value: "PCF8574" },
      } as any,
    },
  };
}

// Helper to create Potentiometer node
function createPotNode(id = "pot-1", valPercent = 50): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 300, y: 0 },
    data: {
      componentType: "potentiometer",
      simulationModel: "potentiometer",
      label: "Potentiometer",
      rotation: 0,
      properties: { position: { value: valPercent } } as any,
    },
  };
}

// Helper to create wire edge
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

// Helper to build standard valid LCD wiring
function createValidLcdEdges(espId = "esp32-1", lcdId = "lcd-1", sdaGpio = 21, sclGpio = 22): CircuitEdge[] {
  return [
    createEdge("e-vcc", espId, "esp32_3v3", lcdId, "vcc"),
    createEdge("e-gnd", espId, "esp32_gnd1", lcdId, "gnd"),
    createEdge("e-sda", espId, `gpio${sdaGpio}`, lcdId, "sda"),
    createEdge("e-scl", espId, `gpio${sclGpio}`, lcdId, "scl"),
  ];
}

// --- TEST 1: Basic Constructor, Init, Backlight & Print ---
console.log("\n--- TEST 1: Basic Constructor, Init, Backlight & Print ---");
{
  const code = `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.print("Hello ESP32!");
}

void loop() {
}
`;

  const lcdStates = evaluateEsp32CppLcd(code);
  assert.strictEqual(lcdStates.has(0x27), true, "Expected LCD state for address 0x27");
  const lcd = lcdStates.get(0x27)!;
  assert.strictEqual(lcd.backlight, true, "Expected backlight ON");
  assert.strictEqual(lcd.displayEnabled, true, "Expected displayEnabled TRUE");

  const l1Chars: string[] = [];
  for (let i = 0; i < 16; i++) {
    l1Chars.push(String.fromCharCode(lcd.ddram[i] || 32));
  }
  const line1 = l1Chars.join("");
  assert.strictEqual(line1, "Hello ESP32!    ", "Line 1 should contain 'Hello ESP32!' padded with spaces");
  console.log("  [PASS] LiquidCrystal_I2C constructor, init(), backlight(), and print() verified");
}

// --- TEST 2: setCursor() & Multi-line Output ---
console.log("\n--- TEST 2: setCursor() & Multi-line Output ---");
{
  const code = `
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Line 1 Ready");
  lcd.setCursor(0, 1);
  lcd.print("Line 2 Active");
}

void loop() {
}
`;

  const lcdStates = evaluateEsp32CppLcd(code);
  const lcd = lcdStates.get(0x27)!;

  const l1Chars: string[] = [];
  const l2Chars: string[] = [];
  for (let i = 0; i < 16; i++) {
    l1Chars.push(String.fromCharCode(lcd.ddram[i] || 32));
    l2Chars.push(String.fromCharCode(lcd.ddram[64 + i] || 32));
  }
  assert.strictEqual(l1Chars.join(""), "Line 1 Ready    ");
  assert.strictEqual(l2Chars.join(""), "Line 2 Active   ");
  console.log("  [PASS] setCursor(col, row) correctly writes to row 0 (ddram[0..15]) and row 1 (ddram[64..79])");
}

// --- TEST 3: Wire.begin() Default (21/22) vs Wire.begin(sda, scl) Custom Pins ---
console.log("\n--- TEST 3: Wire.begin() Default (21/22) vs Wire.begin(sda, scl) Custom Pins ---");
{
  // Case A: Default (no Wire.begin or Wire.begin()) -> SDA=21, SCL=22
  const codeDefault = `
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
void setup() {
  Wire.begin();
  lcd.init();
}
void loop() {}
`;
  const statesDef = evaluateEsp32CppLcd(codeDefault);
  const lcdDef = statesDef.get(0x27)!;
  assert.strictEqual(lcdDef.declaredSdaPin, 21, "Default SDA must be GPIO21");
  assert.strictEqual(lcdDef.declaredSclPin, 22, "Default SCL must be GPIO22");

  // Case B: Explicit custom pins Wire.begin(4, 5) -> SDA=4, SCL=5
  const codeCustom = `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#define SDA_PIN 4
#define SCL_PIN 5
LiquidCrystal_I2C lcd(0x27, 16, 2);
void setup() {
  Wire.begin(SDA_PIN, SCL_PIN);
  lcd.init();
}
void loop() {}
`;
  const statesCustom = evaluateEsp32CppLcd(codeCustom);
  const lcdCustom = statesCustom.get(0x27)!;
  assert.strictEqual(lcdCustom.declaredSdaPin, 4, "Custom SDA must resolve to GPIO4");
  assert.strictEqual(lcdCustom.declaredSclPin, 5, "Custom SCL must resolve to GPIO5");
  console.log("  [PASS] Wire.begin() defaults (21/22) and Wire.begin(sda, scl) custom pin declarations verified");
}

// --- TEST 4: Strict SDA/SCL Graph Reachability & Miswire Detection ---
console.log("\n--- TEST 4: Strict SDA/SCL Graph Reachability & Miswire Detection ---");
{
  const esp32 = createEsp32Node("esp32-1");
  const lcd = createLcdNode("lcd-1", "0x27");
  const nodes = [esp32, lcd];

  const code = `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
void setup() {
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
  lcd.print("Test OK");
}
void loop() {}
`;

  // Case 4A: Valid wiring (SDA->GPIO21, SCL->GPIO22) -> isSignalOk: true
  const validEdges = createValidLcdEdges("esp32-1", "lcd-1", 21, 22);
  const initialFrame = buildSimulationFrame({ tick: 0, nodes, edges: validEdges, boardType: "esp32", running: true });
  const frameOk = applyEsp32LcdOutputToFrame(initialFrame, { ...defaultPipelineContext, nodes, edges: validEdges, arduinoCode: code });
  const compOk = frameOk.components["lcd-1"];
  assert.ok(compOk, "LCD component exists");
  assert.strictEqual(compOk.telemetry.isSignalOk, true, "Valid wiring must pass isSignalOk");
  assert.strictEqual(compOk.telemetry.error, "", "Error must be empty on valid wiring");
  assert.strictEqual(compOk.telemetry.line1, "Test OK         ");

  // Case 4B: Miswired / Reversed wiring (SDA->GPIO22, SCL->GPIO21) -> isSignalOk: false, Miswire error
  const reversedEdges = [
    createEdge("e-vcc", "esp32-1", "esp32_3v3", "lcd-1", "vcc"),
    createEdge("e-gnd", "esp32-1", "esp32_gnd1", "lcd-1", "gnd"),
    createEdge("e-sda-wrong", "esp32-1", "gpio22", "lcd-1", "sda"), // Wrong pin (connected to 22 instead of 21)
    createEdge("e-scl-wrong", "esp32-1", "gpio21", "lcd-1", "scl"), // Wrong pin (connected to 21 instead of 22)
  ];
  const frameMiswire = applyEsp32LcdOutputToFrame(initialFrame, { ...defaultPipelineContext, nodes, edges: reversedEdges, arduinoCode: code });
  const compMiswire = frameMiswire.components["lcd-1"];
  assert.strictEqual(compMiswire.telemetry.isSignalOk, false, "Reversed wiring must fail isSignalOk");
  assert.ok(String(compMiswire.telemetry.error).includes("I2C SDA/SCL Pin Miswire"), `Expected miswire error message, got: ${compMiswire.telemetry.error}`);
  assert.ok(frameMiswire.serialOutput && frameMiswire.serialOutput.some(s => s.includes("I2C Error")), "Serial output surfaces I2C Error");

  console.log("  [PASS] Strict conductive graph reachability and miswire detection verified");
}

// --- TEST 5: Forbidden SPI Flash Pin (GPIO6-11) Protection ---
console.log("\n--- TEST 5: Forbidden SPI Flash Pin (GPIO6-11) Protection ---");
{
  const esp32 = createEsp32Node("esp32-1");
  const lcd = createLcdNode("lcd-1", "0x27");
  const nodes = [esp32, lcd];
  const flashEdges = createValidLcdEdges("esp32-1", "lcd-1", 6, 7);

  const codeFlash = `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
void setup() {
  Wire.begin(6, 7); // Forbidden SPI flash pins
  lcd.init();
}
void loop() {}
`;

  const initialFrame = buildSimulationFrame({ tick: 0, nodes, edges: flashEdges, boardType: "esp32", running: true });
  const frameFlash = applyEsp32LcdOutputToFrame(initialFrame, { ...defaultPipelineContext, nodes, edges: flashEdges, arduinoCode: codeFlash });
  const compFlash = frameFlash.components["lcd-1"];
  assert.strictEqual(compFlash.telemetry.isSignalOk, false, "SPI flash pin must fail isSignalOk");
  assert.ok(String(compFlash.telemetry.error).includes("Forbidden SPI Flash"), `Expected Forbidden SPI Flash error, got: ${compFlash.telemetry.error}`);
  console.log("  [PASS] Forbidden SPI flash pin guard enforced on I2C SDA/SCL declarations");
}

// --- TEST 6: checkEsp32CppSupport Permissibility ---
console.log("\n--- TEST 6: checkEsp32CppSupport Permissibility ---");
{
  const validSketch = `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  Serial.begin(115200);
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.print("ESP32 Studio");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print(millis());
}
`;

  const status1 = checkEsp32CppSupport(validSketch);
  assert.strictEqual(status1.isSupported, true, "LCD sketch with Wire and LiquidCrystal_I2C must be supported");
  assert.strictEqual(status1.unsupportedConstructs.length, 0);

  const invalidSketch = `
#include <WiFi.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
void setup() {
  WiFi.begin("SSID", "PASS");
}
void loop() {}
`;

  const status2 = checkEsp32CppSupport(invalidSketch);
  assert.strictEqual(status2.isSupported, false, "WiFi sketch must still be flagged as unsupported");
  assert.ok(status2.unsupportedConstructs.includes("WiFi library"));
  console.log("  [PASS] checkEsp32CppSupport permits I2C / LCD sketches while guarding unsupported constructs");
}

// --- TEST 7: Multi-Component Integration Test (LCD + Serial + Potentiometer ADC) ---
console.log("\n--- TEST 7: Multi-Component Integration Test (LCD + Serial + Potentiometer ADC) ---");
{
  const esp32 = createEsp32Node("esp32-1");
  const lcd = createLcdNode("lcd-1", "0x27");
  const pot = createPotNode("pot-1", 50); // 50% wiper position -> ~512 (10-bit)

  const nodes = [esp32, lcd, pot];
  const edges = [
    // LCD wiring (VCC->3.3V, GND->GND, SDA->GPIO21, SCL->GPIO22)
    ...createValidLcdEdges("esp32-1", "lcd-1", 21, 22),
    // Potentiometer wiring (VCC->3.3V, GND->GND, Wiper->GPIO34)
    createEdge("e-pot-vcc", "esp32-1", "esp32_3v3", "pot-1", "pin1"),
    createEdge("e-pot-gnd", "esp32-1", "esp32_gnd2", "pot-1", "pin3"),
    createEdge("e-pot-sig", "pot-1", "wiper", "esp32-1", "gpio34"),
  ];

  const code = `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

const int potPin = 34;
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
}

void loop() {
  int val = analogRead(potPin);
  lcd.setCursor(0, 0);
  lcd.print("Pot: " + String(val));
  lcd.setCursor(0, 1);
  lcd.print("Status: Active");

  Serial.print("POT_VAL: ");
  Serial.println(val);
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

  // Verify LCD output
  const lcdComp = finalFrame.components["lcd-1"];
  assert.ok(lcdComp, "LCD component must exist in frame");
  assert.strictEqual(lcdComp.isPowered, true, "LCD is powered");
  assert.strictEqual(lcdComp.brightness, 1, "LCD brightness is 1 (backlight ON)");
  assert.strictEqual(lcdComp.telemetry.isSignalOk, true, "LCD signal is OK");
  console.log("  [Trace LCD Line 1]:", `"${lcdComp.telemetry.line1}"`);
  console.log("  [Trace LCD Line 2]:", `"${lcdComp.telemetry.line2}"`);
  assert.ok(String(lcdComp.telemetry.line1).startsWith("Pot: 512"), `Expected Line 1 to start with 'Pot: 512', got: ${lcdComp.telemetry.line1}`);
  assert.ok(String(lcdComp.telemetry.line2).startsWith("Status: Active"), `Expected Line 2 to start with 'Status: Active', got: ${lcdComp.telemetry.line2}`);

  // Verify Serial output
  assert.ok(finalFrame.serialOutput && finalFrame.serialOutput.length > 0, "Expected serialOutput in frame");
  const lastSerial = finalFrame.serialOutput[finalFrame.serialOutput.length - 1];
  console.log("  [Trace Serial Line]:", lastSerial);
  assert.strictEqual(lastSerial, "POT_VAL: 512");

  console.log("  [PASS] Multi-component integration: LCD (I2C) + Serial + Potentiometer (ADC) co-simulated");
}

console.log("\n=================== ALL ESP32 C++ I2C LCD TESTS PASSED ===================");
