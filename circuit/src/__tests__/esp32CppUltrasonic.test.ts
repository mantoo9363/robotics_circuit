/**
 * ESP32 C++ (Arduino-Style) HC-SR04 Ultrasonic Distance Sensor Test Suite
 *
 * Validates Phase 7:
 *  1. Arithmetic expression evaluator edge cases (div-by-zero, malformed syntax, negative results, floats, parens)
 *  2. pulseIn(echoPin, HIGH) duration microsecond calculation for connected & powered HC-SR04
 *  3. Disconnected & unpowered sensor timeout (pulseIn returns 0)
 *  4. Dual HC-SR04 multi-sensor isolation on distinct ESP32 GPIO echo pins
 *  5. Conditional actuation (LED turned ON when distance < threshold, OFF when >= threshold)
 *  6. Serial communication (Serial.print + Serial.println outputs numeric distance cleanly)
 *  7. I2C 16x2 LCD display integration (lcd.print displays numeric distance)
 */

import {
  evaluateCppArithmeticExpr,
  resolveEsp32PulseIn,
  extractCppUltrasonicVariables,
  evaluateEsp32CppConditionals,
  evaluateEsp32CppSerial,
  resetEsp32CppSerialSessions,
  evaluateEsp32CppLcd,
  checkEsp32CppSupport,
} from "../lib/esp32/parser";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runEsp32CppUltrasonicTests(): boolean {
  console.log("=================== RUNNING ESP32 C++ ULTRASONIC SENSOR TESTS ===================");

  let passed = true;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      passed = false;
    } else {
      console.log(`✅ PASS: ${msg}`);
    }
  }

// =========================================================================
// TEST 1: Arithmetic Expression Evaluator & Edge Cases
// =========================================================================
console.log("\n--- TEST 1: Arithmetic Evaluator & Edge Cases ---");
const testVars = new Map<string, any>([
  ["duration", 5830], // ~100cm
  ["offset", 5],
  ["zeroVal", 0],
]);
const testConstants = new Map<string, number>([
  ["SCALE", 2],
]);

// 1A. Standard calculation: duration * 0.034 / 2
const res1 = evaluateCppArithmeticExpr("duration * 0.034 / 2", testVars, testConstants);
assert(res1 !== null && Math.abs(res1 - 99.11) < 0.1, `Standard distance formula evaluated (${res1} ≈ 99.11)`);

// 1B. Integer division formula: duration / 58
const res2 = evaluateCppArithmeticExpr("duration / 58", testVars, testConstants);
assert(res2 !== null && Math.abs(res2 - 100.51) < 0.1, `Integer division distance formula (${res2} ≈ 100.51)`);

// 1C. Nested parentheses & complex formula: ((duration / 2) / 29.1) + offset
const res3 = evaluateCppArithmeticExpr("((duration / 2) / 29.1) + offset", testVars, testConstants);
assert(res3 !== null && Math.abs(res3 - 105.17) < 0.1, `Parentheses & addition offset (${res3} ≈ 105.17)`);

// 1D. Division by zero safety: duration / 0 (must return 0 without throw)
const divZeroRes = evaluateCppArithmeticExpr("duration / 0", testVars, testConstants);
assert(divZeroRes === 0, `Division by zero safely returns 0 without crashing (${divZeroRes})`);

const divZeroVarRes = evaluateCppArithmeticExpr("duration / zeroVal", testVars, testConstants);
assert(divZeroVarRes === 0, `Division by zero variable safely returns 0 (${divZeroVarRes})`);

// 1E. Malformed expressions (must return null without crashing)
const malformed1 = evaluateCppArithmeticExpr("(5 + * 2)", testVars, testConstants);
assert(malformed1 === null, `Malformed expression '(5 + * 2)' safely returns null`);

const malformed2 = evaluateCppArithmeticExpr("duration +", testVars, testConstants);
assert(malformed2 === null, `Incomplete expression 'duration +' safely returns null`);

const malformed3 = evaluateCppArithmeticExpr("((5 + 2)", testVars, testConstants);
assert(malformed3 === null, `Unbalanced paren '((5 + 2)' safely returns null`);

// 1F. Negative results & unary minus: 5 - 20
const negRes = evaluateCppArithmeticExpr("5 - 20", testVars, testConstants);
assert(negRes === -15, `Negative result evaluated (${negRes} === -15)`);

const unaryMinusRes = evaluateCppArithmeticExpr("-duration + 1000", testVars, testConstants);
assert(unaryMinusRes === -4830, `Unary minus evaluated (${unaryMinusRes} === -4830)`);

// =========================================================================
// TEST 2: Circuit Setup & pulseIn() Resolution
// =========================================================================
console.log("\n--- TEST 2: pulseIn() Calculation & Disconnected Timeout ---");

const esp32Node: CircuitNode = {
  id: "esp32-1",
  type: "esp32",
  data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
  position: { x: 0, y: 0 },
};

const ultra1: CircuitNode = {
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

const ultra2: CircuitNode = {
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

const connectedEdges: CircuitEdge[] = [
  // Sensor 1: VCC -> 3V3, GND -> GND, TRIG -> GPIO5, ECHO -> GPIO18
  { id: "e1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "ultra-1", targetHandle: "vcc" },
  { id: "e2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "ultra-1", targetHandle: "gnd" },
  { id: "e3", source: "esp32-1", sourceHandle: "gpio5", target: "ultra-1", targetHandle: "trigger" },
  { id: "e4", source: "esp32-1", sourceHandle: "gpio18", target: "ultra-1", targetHandle: "echo" },
  // Sensor 2: VCC -> 3V3, GND -> GND, TRIG -> GPIO17, ECHO -> GPIO16
  { id: "e5", source: "esp32-1", sourceHandle: "esp32_3v3", target: "ultra-2", targetHandle: "vcc" },
  { id: "e6", source: "esp32-1", sourceHandle: "esp32_gnd2", target: "ultra-2", targetHandle: "gnd" },
  { id: "e7", source: "esp32-1", sourceHandle: "gpio17", target: "ultra-2", targetHandle: "trigger" },
  { id: "e8", source: "esp32-1", sourceHandle: "gpio16", target: "ultra-2", targetHandle: "echo" },
];

const nodes = [esp32Node, ultra1, ultra2];

// 2A. Connected Sensor 1 (120 cm): duration = (120 * 2) / 0.0343 ≈ 6997 µs
const duration1 = resolveEsp32PulseIn(18, nodes, connectedEdges);
const expected1 = Math.round((120 * 2) / 0.0343);
assert(duration1 === expected1, `pulseIn(18) on Sensor 1 (120cm) returned ${duration1} µs (expected ${expected1})`);

// 2B. Connected Sensor 2 (45 cm): duration = (45 * 2) / 0.0343 ≈ 2624 µs
const duration2 = resolveEsp32PulseIn(16, nodes, connectedEdges);
const expected2 = Math.round((45 * 2) / 0.0343);
assert(duration2 === expected2, `pulseIn(16) on Sensor 2 (45cm) returned ${duration2} µs (expected ${expected2})`);

// 2C. Unconnected Pin (e.g. GPIO4 has no echo attached)
const durationUnconnected = resolveEsp32PulseIn(4, nodes, connectedEdges);
assert(durationUnconnected === 0, `pulseIn(4) with no sensor connected returned 0 µs`);

// 2D. Disconnected / unpowered sensor (missing GND wire)
const brokenEdges = connectedEdges.filter(e => e.id !== "e2"); // remove Sensor 1 GND
const durationBroken = resolveEsp32PulseIn(18, nodes, brokenEdges);
assert(durationBroken === 0, `pulseIn(18) with disconnected GND returned 0 µs (timeout)`);

// =========================================================================
// TEST 3: Variable Extraction & Multi-Sensor Isolation
// =========================================================================
console.log("\n--- TEST 3: C++ Variable Extraction & Multi-Sensor Isolation ---");

const dualSensorCode = `
const int trig1 = 5;
const int echo1 = 18;
const int trig2 = 17;
const int echo2 = 16;

void setup() {
  pinMode(trig1, OUTPUT);
  pinMode(echo1, INPUT);
  pinMode(trig2, OUTPUT);
  pinMode(echo2, INPUT);
}

void loop() {
  long dur1 = pulseIn(echo1, HIGH);
  float dist1 = dur1 * 0.0343 / 2;

  long dur2 = pulseIn(echo2, HIGH);
  float dist2 = dur2 * 0.0343 / 2;
}
`;

const constants = new Map<string, number>([
  ["trig1", 5],
  ["echo1", 18],
  ["trig2", 17],
  ["echo2", 16],
]);

const extractedVars = extractCppUltrasonicVariables(dualSensorCode, constants, { nodes, edges: connectedEdges });
const dist1 = extractedVars.get("dist1");
const dist2 = extractedVars.get("dist2");

assert(dist1 !== undefined && Math.abs(dist1 - 120) < 1, `Sensor 1 distance extracted cleanly (${dist1} ≈ 120)`);
assert(dist2 !== undefined && Math.abs(dist2 - 45) < 1, `Sensor 2 distance extracted cleanly (${dist2} ≈ 45)`);

// =========================================================================
// TEST 4: Conditional Logic & Actuator Control (if/else)
// =========================================================================
console.log("\n--- TEST 4: Conditional Actuation (LED on threshold) ---");

const thresholdCode = `
const int trigPin = 5;
const int echoPin = 18;
const int ledPin = 2;

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  long duration = pulseIn(echoPin, HIGH);
  float distanceCm = duration * 0.0343 / 2;

  if (distanceCm < 50) {
    digitalWrite(ledPin, HIGH);
  } else {
    digitalWrite(ledPin, LOW);
  }
}
`;

// Sensor 1 is at 120cm (>= 50cm) -> LED must be LOW
const condActions1 = evaluateEsp32CppConditionals(thresholdCode, new Map(), { nodes, edges: connectedEdges });
const ledAction1 = condActions1.find((a): a is import("../lib/esp32/parser").Esp32GpioWriteAction => a.type === "gpio_write" && a.pin === 2);
assert(ledAction1 !== undefined && ledAction1.value === 0, `Distance = 120cm (>= 50cm): LED GPIO2 turned OFF (val = ${ledAction1?.value})`);

// Adjust Sensor 1 to 30cm (< 50cm) -> LED must be HIGH
const closeSensor1: CircuitNode = {
  ...ultra1,
  data: {
    ...ultra1.data,
    properties: { distance: { label: "Distance", type: "number", value: 30 } },
  },
};
const closeNodes = [esp32Node, closeSensor1, ultra2];
const condActions2 = evaluateEsp32CppConditionals(thresholdCode, new Map(), { nodes: closeNodes, edges: connectedEdges });
const ledAction2 = condActions2.find((a): a is import("../lib/esp32/parser").Esp32GpioWriteAction => a.type === "gpio_write" && a.pin === 2);
assert(ledAction2 !== undefined && ledAction2.value === 1, `Distance = 30cm (< 50cm): LED GPIO2 turned ON (val = ${ledAction2?.value})`);

// =========================================================================
// TEST 5: Serial Communication Output
// =========================================================================
console.log("\n--- TEST 5: Serial Communication Output ---");
resetEsp32CppSerialSessions();

const serialSketch = `
const int trigPin = 5;
const int echoPin = 18;

void setup() {
  Serial.begin(115200);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
}

void loop() {
  long duration = pulseIn(echoPin, HIGH);
  float distance = duration * 0.0343 / 2;

  Serial.print("Distance: ");
  Serial.println(distance, 1);
}
`;

const serialRes = evaluateEsp32CppSerial(serialSketch, {
  tick: 1,
  timestamp: 100,
  nodes,
  edges: connectedEdges,
});

assert(serialRes.allLines.length > 0, `Serial monitor captured output lines (count = ${serialRes.allLines.length})`);
assert(serialRes.allLines[0] === "Distance: 120.0" || serialRes.allLines[0].startsWith("Distance: 120"), `Serial output matches expected distance line: "${serialRes.allLines[0]}"`);

// =========================================================================
// TEST 6: I2C 16x2 LCD Display Output
// =========================================================================
console.log("\n--- TEST 6: I2C 16x2 LCD Display Output ---");

const lcdNode: CircuitNode = {
  id: "lcd-1",
  type: "lcd16x2",
  data: {
    label: "LCD 16x2 (I2C)",
    componentType: "lcd16x2",
    simulationModel: "lcd16x2",
    properties: { address: { label: "Address", type: "select", value: "0x27" } },
    rotation: 0,
  },
  position: { x: 300, y: 200 },
};

const lcdEdges: CircuitEdge[] = [
  ...connectedEdges,
  { id: "l1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "lcd-1", targetHandle: "vcc" },
  { id: "l2", source: "esp32-1", sourceHandle: "esp32_gnd3", target: "lcd-1", targetHandle: "gnd" },
  { id: "l3", source: "esp32-1", sourceHandle: "gpio21", target: "lcd-1", targetHandle: "sda" },
  { id: "l4", source: "esp32-1", sourceHandle: "gpio22", target: "lcd-1", targetHandle: "scl" },
];

const lcdSketch = `
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);

const int trigPin = 5;
const int echoPin = 18;

void setup() {
  lcd.init();
  lcd.backlight();
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
}

void loop() {
  long duration = pulseIn(echoPin, HIGH);
  float distance = duration * 0.0343 / 2;

  lcd.setCursor(0, 0);
  lcd.print("Dist: ");
  lcd.print(distance);
  lcd.print(" cm");
}
`;

const lcdStates = evaluateEsp32CppLcd(lcdSketch, {
  tick: 1,
  timestamp: 100,
  nodes: [esp32Node, ultra1, lcdNode],
  edges: lcdEdges,
});

assert(lcdStates.has(0x27), `LCD state created for 0x27`);
const lcd = lcdStates.get(0x27)!;
const l1Chars: string[] = [];
for (let i = 0; i < 16; i++) {
  l1Chars.push(String.fromCharCode(lcd.ddram[i] || 32));
}
const line1 = l1Chars.join("").trim();
const parsedDist = parseFloat(line1.replace("Dist: ", ""));
assert(!isNaN(parsedDist) && Math.abs(parsedDist - 120) < 1, `LCD line 1 displays ultrasonic distance: "${line1}" (parsed = ${parsedDist})`);

// =========================================================================
// TEST 7: C++ Support Inspector
// =========================================================================
console.log("\n--- TEST 7: C++ Support Inspector ---");
const supportStatus = checkEsp32CppSupport(thresholdCode);
  assert(supportStatus.isSupported === true, "checkEsp32CppSupport approves sketch with pulseIn and distance conditionals");

  if (!passed) {
    console.error("\n❌ Some tests in ESP32 C++ Ultrasonic suite failed!");
    return false;
  }

  console.log("\n=================== ALL ESP32 C++ ULTRASONIC TESTS PASSED ===================");
  return true;
}

if (process.argv[1] && process.argv[1].endsWith("esp32CppUltrasonic.test.ts")) {
  const success = runEsp32CppUltrasonicTests();
  if (!success) process.exit(1);
}
