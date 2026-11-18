/**
 * esp32CppKeypad.test.ts
 *
 * Dedicated test suite for ESP32 C++ (Arduino-style) Matrix Keypad Support:
 *   - Keypad.h constructor and keymap parsing (4x4 and 4x3 layouts)
 *   - rowPins / colPins array extraction and resolution
 *   - Interactive getKey() resolution via conductive graph reachability
 *   - Disconnected row/column pin detection
 *   - Hardware safety guards (GPIO34-39 input-only row pin rejection, GPIO6-11 flash pin rejection)
 *   - Multi-component integration test (Keypad + 16x2 I2C LCD + Serial)
 */

import assert from "node:assert";
import {
  parseEsp32CppKeypad,
  evaluateEsp32CppKeypad,
  resetEsp32CppKeypadSessions,
  evaluateEsp32CppSerial,
  evaluateEsp32CppLcd,
} from "../lib/esp32/parser";
import { buildSimulationFrame } from "../lib/simulation-state";
import { applyEsp32SimulationToFrame, applyEsp32LcdOutputToFrame } from "../lib/simulation/frameTransformers/esp32";
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

console.log("=================== RUNNING ESP32 C++ MATRIX KEYPAD TESTS ===================");

// --- TEST 1: 4x4 Keypad Keymap & Pin Parsing ---
console.log("\n--- TEST 1: 4x4 Keypad Keymap & Pin Parsing ---");
{
  const sketch4x4 = `
#include <Keypad.h>

const byte ROWS = 4;
const byte COLS = 4;

char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};

byte rowPins[ROWS] = {13, 12, 14, 27};
byte colPins[COLS] = {26, 25, 33, 32};

Keypad customKeypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

void setup() {}
void loop() {}
`;

  const config = parseEsp32CppKeypad(sketch4x4);
  assert.ok(config, "Config must be parsed successfully");
  assert.strictEqual(config.instanceName, "customKeypad");
  assert.strictEqual(config.rows, 4);
  assert.strictEqual(config.cols, 4);
  assert.deepStrictEqual(config.rowPins, [13, 12, 14, 27]);
  assert.deepStrictEqual(config.colPins, [26, 25, 33, 32]);
  assert.strictEqual(config.keymap[0][0], "1");
  assert.strictEqual(config.keymap[0][3], "A");
  assert.strictEqual(config.keymap[3][0], "*");
  assert.strictEqual(config.keymap[3][3], "D");

  console.log("  [PASS] Standard 4x4 Keypad declaration, keymap, and pin arrays parsed accurately");
}

// --- TEST 2: 4x3 Keypad Layout Support ---
console.log("\n--- TEST 2: 4x3 Keypad Layout Support ---");
{
  const sketch4x3 = `
#include <Keypad.h>

const byte ROWS = 4;
const byte COLS = 3;

char keys[ROWS][COLS] = {
  {'1','2','3'},
  {'4','5','6'},
  {'7','8','9'},
  {'*','0','#'}
};

byte rowPins[ROWS] = {13, 12, 14, 27};
byte colPins[COLS] = {26, 25, 33};

Keypad keypad(makeKeymap(keys), rowPins, colPins, 4, 3);

void setup() {}
void loop() {}
`;

  const config = parseEsp32CppKeypad(sketch4x3);
  assert.ok(config, "4x3 Config must be parsed successfully");
  assert.strictEqual(config.rows, 4);
  assert.strictEqual(config.cols, 3);
  assert.deepStrictEqual(config.rowPins, [13, 12, 14, 27]);
  assert.deepStrictEqual(config.colPins, [26, 25, 33]);
  assert.strictEqual(config.keymap[0].length, 3);
  assert.strictEqual(config.keymap[3][2], "#");

  console.log("  [PASS] 4x3 Keypad layout dimensions and keymap parsed accurately");
}

// --- TEST 3: Interactive getKey() Resolution via Conductive Graph ---
console.log("\n--- TEST 3: Interactive getKey() Resolution via Conductive Graph ---");
{
  resetEsp32CppKeypadSessions();
  const esp32Node = createNode("esp32-1", "esp32", "ESP32 DevKit");
  const keypadNode = createNode("kp-1", "keypad4x4", "Keypad 4x4", {
    pressedKeys: { value: "5" }, // '5' is Row 2 (index 1), Col 2 (index 1)
  });

  const nodes = [esp32Node, keypadNode];
  const edges = [
    createEdge("r1", "esp32-1", "gpio13", "kp-1", "row1"),
    createEdge("r2", "esp32-1", "gpio12", "kp-1", "row2"),
    createEdge("r3", "esp32-1", "gpio14", "kp-1", "row3"),
    createEdge("r4", "esp32-1", "gpio27", "kp-1", "row4"),
    createEdge("c1", "esp32-1", "gpio26", "kp-1", "column1"),
    createEdge("c2", "esp32-1", "gpio25", "kp-1", "column2"),
    createEdge("c3", "esp32-1", "gpio33", "kp-1", "column3"),
    createEdge("c4", "esp32-1", "gpio32", "kp-1", "column4"),
  ];

  const sketch = `
#include <Keypad.h>
byte rowPins[4] = {13, 12, 14, 27};
byte colPins[4] = {26, 25, 33, 32};
char keys[4][4] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
Keypad customKeypad = Keypad(makeKeymap(keys), rowPins, colPins, 4, 4);

void setup() {}
void loop() {
  char key = customKeypad.getKey();
}
`;

  const res = evaluateEsp32CppKeypad(sketch, { nodes, edges });
  assert.strictEqual(res.pressedKey, "5", "Expected pressed key '5' to be resolved");
  assert.strictEqual(res.keyChar, "5");

  // Idle when released
  keypadNode.data.properties.pressedKeys.value = "";
  const resIdle = evaluateEsp32CppKeypad(sketch, { nodes, edges });
  assert.strictEqual(resIdle.pressedKey, null, "Expected null when released");

  console.log("  [PASS] Interactive getKey() matrix lookup and release resolution verified");
}

// --- TEST 4: Disconnected Pin Detection ---
console.log("\n--- TEST 4: Disconnected Pin Detection ---");
{
  const esp32Node = createNode("esp32-1", "esp32", "ESP32 DevKit");
  const keypadNode = createNode("kp-1", "keypad4x4", "Keypad 4x4", {
    pressedKeys: { value: "A" }, // Row 1, Col 4
  });

  const nodes = [esp32Node, keypadNode];
  // Missing Column 4 connection!
  const edges = [
    createEdge("r1", "esp32-1", "gpio13", "kp-1", "row1"),
    createEdge("c1", "esp32-1", "gpio26", "kp-1", "column1"),
  ];

  const sketch = `
#include <Keypad.h>
byte rowPins[4] = {13, 12, 14, 27};
byte colPins[4] = {26, 25, 33, 32};
char keys[4][4] = { {'1','2','3','A'}, {'4','5','6','B'}, {'7','8','9','C'}, {'*','0','#','D'} };
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, 4, 4);
`;

  const res = evaluateEsp32CppKeypad(sketch, { nodes, edges });
  assert.strictEqual(res.pressedKey, null, "Disconnected pin must yield null key");
  assert.ok(res.warning?.includes("Keypad pin disconnected"), "Expected pin disconnected warning");

  console.log("  [PASS] Disconnected row/column pin detection verified");
}

// --- TEST 5: Input-Only Row Pin Safety Guard ---
console.log("\n--- TEST 5: Input-Only Row Pin Safety Guard ---");
{
  const sketchBadRow = `
#include <Keypad.h>
byte rowPins[4] = {34, 12, 14, 27}; // GPIO34 is input-only!
byte colPins[4] = {26, 25, 33, 32};
char keys[4][4] = { {'1','2','3','A'}, {'4','5','6','B'}, {'7','8','9','C'}, {'*','0','#','D'} };
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, 4, 4);
`;

  const config = parseEsp32CppKeypad(sketchBadRow);
  assert.ok(config?.warning?.includes("doesn't have an output driver"), "Input-only row pin must be rejected");

  console.log("  [PASS] Input-only pin (GPIO34) row output rejection verified");
}

// --- TEST 6: Reserved Flash Pin Guard ---
console.log("\n--- TEST 6: Reserved Flash Pin Guard ---");
{
  const sketchFlash = `
#include <Keypad.h>
byte rowPins[4] = {6, 12, 14, 27}; // GPIO6 is internal SPI flash!
byte colPins[4] = {26, 25, 33, 32};
char keys[4][4] = { {'1','2','3','A'}, {'4','5','6','B'}, {'7','8','9','C'}, {'*','0','#','D'} };
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, 4, 4);
`;

  const config = parseEsp32CppKeypad(sketchFlash);
  assert.ok(config?.warning?.includes("Forbidden GPIO 6"), "SPI flash pin must be rejected");

  console.log("  [PASS] Internal SPI flash pin (GPIO6) rejection verified");
}

// --- TEST 7: Multi-Component Integration Test (Keypad + LCD + Serial) ---
console.log("\n--- TEST 7: Multi-Component Integration (Keypad + LCD + Serial) ---");
{
  resetEsp32CppKeypadSessions();
  const esp32Node = createNode("esp32-1", "esp32", "ESP32 DevKit");
  const keypadNode = createNode("kp-1", "keypad4x4", "Keypad 4x4", {
    pressedKeys: { value: "7" }, // Row 3, Col 1
  });
  const lcdNode = createNode("lcd-1", "lcd16x2", "LCD 16x2", { address: "0x27" });

  const nodes = [esp32Node, keypadNode, lcdNode];
  const edges = [
    // Keypad rows
    createEdge("r1", "esp32-1", "gpio13", "kp-1", "row1"),
    createEdge("r2", "esp32-1", "gpio12", "kp-1", "row2"),
    createEdge("r3", "esp32-1", "gpio14", "kp-1", "row3"),
    createEdge("r4", "esp32-1", "gpio27", "kp-1", "row4"),
    // Keypad cols
    createEdge("c1", "esp32-1", "gpio26", "kp-1", "column1"),
    createEdge("c2", "esp32-1", "gpio25", "kp-1", "column2"),
    createEdge("c3", "esp32-1", "gpio33", "kp-1", "column3"),
    createEdge("c4", "esp32-1", "gpio32", "kp-1", "column4"),
    // LCD I2C
    createEdge("lcd-vcc", "esp32-1", "esp32_3v3", "lcd-1", "vcc"),
    createEdge("lcd-gnd", "esp32-1", "esp32_gnd_1", "lcd-1", "gnd"),
    createEdge("lcd-sda", "esp32-1", "gpio21", "lcd-1", "sda"),
    createEdge("lcd-scl", "esp32-1", "gpio22", "lcd-1", "scl"),
  ];

  const integrationSketch = `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

byte rowPins[4] = {13, 12, 14, 27};
byte colPins[4] = {26, 25, 33, 32};
char keys[4][4] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
Keypad customKeypad = Keypad(makeKeymap(keys), rowPins, colPins, 4, 4);

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  lcd.init();
  lcd.backlight();
}

void loop() {
  char customKey = customKeypad.getKey();
  if (customKey) {
    Serial.println(customKey);
    lcd.setCursor(0, 0);
    lcd.print("Pressed: ");
    lcd.print(customKey);
  }
}
`;

  // Step 1: Run through Serial evaluation
  const serialRes = evaluateEsp32CppSerial(integrationSketch, {
    tick: 1,
    nodes,
    edges,
  });
  console.log("  [Trace Serial Output]:", serialRes.allLines);
  assert.ok(serialRes.allLines.includes("7"), "Serial output must contain '7'");

  // Step 2: Run through LCD evaluation
  const lcdStates = evaluateEsp32CppLcd(integrationSketch, {
    tick: 1,
    nodes,
    edges,
  });
  assert.ok(lcdStates, "LCD states must exist");
  const lcd0x27 = lcdStates.get(0x27);
  assert.ok(lcd0x27, "LCD 0x27 must exist");
  const l1Chars: string[] = [];
  for (let i = 0; i < 16; i++) {
    l1Chars.push(String.fromCharCode(lcd0x27.ddram[i] || 32));
  }
  const line1 = l1Chars.join("");
  console.log("  [Trace LCD Line 1]:", `"${line1}"`);
  assert.ok(line1.startsWith("Pressed: 7"), "LCD line 1 must start with 'Pressed: 7'");

  console.log("  [PASS] Multi-component integration: Keypad + LCD + Serial co-simulated successfully");
}

console.log("\n=================== ALL ESP32 C++ MATRIX KEYPAD TESTS PASSED ===================");
