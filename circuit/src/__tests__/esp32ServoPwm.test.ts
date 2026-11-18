/**
 * esp32ServoPwm.test.ts
 *
 * Side-by-side verification and regression test suite for Servo PWM across
 * Arduino, Pico, and ESP32 boards.
 */

import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { applyServoInputToFrame } from "../lib/simulation/frameTransformers/servo";
import type { SimulationFrame } from "../lib/simulation-state";
import type { SimContext } from "../lib/simulation/types";

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  [PASS] ${label}`);
  } else {
    console.error(`  [FAIL] ${label}`);
    process.exitCode = 1;
  }
}

console.log("=================== SERVO PWM REGRESSION & ESP32 TEST SUITE ===================\n");

// --- TEST 1: ESP32 + Servo at 0° angle (duty_u16 = 1638) ---
console.log("--- TEST 1: ESP32 Servo at 0° angle (duty_u16 = 1638) ---");
{
  const esp32Id = "esp32-1";
  const servoId = "servo-1";
  const nodes: SimContext["nodes"] = [
    { id: esp32Id, type: "esp32", position: { x: 0, y: 0 }, data: { componentType: "esp32", label: "ESP32", properties: {} } as any },
    { id: servoId, type: "servo", position: { x: 200, y: 0 }, data: { componentType: "servo", label: "Servo", properties: {} } as any },
  ];
  const edges: SimContext["edges"] = [
    { id: "e1", source: esp32Id, sourceHandle: "gpio2", target: servoId, targetHandle: "signal" },
  ];
  const code = `
from machine import Pin, PWM
servo = PWM(Pin(2), freq=50)
servo.duty_u16(1638)
`;
  const ctx: SimContext = {
    nodes, edges, arduinoCode: "", picoCode: code, boardType: "esp32", selectedLanguage: "python", dynamicComponents: [],
  } as any;
  const baseFrame: SimulationFrame = {
    tick: 1, boardType: "esp32", running: true, error: null, serialOutput: [], components: {}, timestamp: 100, boardPins: [],
  } as any;

  const esp32Frame = applyEsp32SimulationToFrame(baseFrame, ctx);
  const finalFrame = applyServoInputToFrame(esp32Frame);
  const servo = finalFrame.components[servoId];

  assert("ESP32 Servo is powered", servo?.isPowered === true);
  assert("ESP32 Servo angle = 0°", servo?.telemetry?.angle === 0);
  assert("ESP32 Servo signalPin = 2", servo?.telemetry?.signalPin === 2);
}

// --- TEST 2: ESP32 + Servo at 90° angle (duty_u16 = 4915) ---
console.log("\n--- TEST 2: ESP32 Servo at 90° angle (duty_u16 = 4915) ---");
{
  const esp32Id = "esp32-1";
  const servoId = "servo-1";
  const nodes: SimContext["nodes"] = [
    { id: esp32Id, type: "esp32", position: { x: 0, y: 0 }, data: { componentType: "esp32", label: "ESP32", properties: {} } as any },
    { id: servoId, type: "servo", position: { x: 200, y: 0 }, data: { componentType: "servo", label: "Servo", properties: {} } as any },
  ];
  const edges: SimContext["edges"] = [
    { id: "e1", source: esp32Id, sourceHandle: "gpio14", target: servoId, targetHandle: "signal" },
  ];
  const code = `
from machine import Pin, PWM
servo = PWM(Pin(14), freq=50)
servo.duty_u16(4915)
`;
  const ctx: SimContext = {
    nodes, edges, arduinoCode: "", picoCode: code, boardType: "esp32", selectedLanguage: "python", dynamicComponents: [],
  } as any;
  const baseFrame: SimulationFrame = {
    tick: 1, boardType: "esp32", running: true, error: null, serialOutput: [], components: {}, timestamp: 100, boardPins: [],
  } as any;

  const esp32Frame = applyEsp32SimulationToFrame(baseFrame, ctx);
  const finalFrame = applyServoInputToFrame(esp32Frame);
  const servo = finalFrame.components[servoId];

  assert("ESP32 Servo is powered", servo?.isPowered === true);
  assert("ESP32 Servo angle = 90°", servo?.telemetry?.angle === 90);
  assert("ESP32 Servo signalPin = 14", servo?.telemetry?.signalPin === 14);
}

// --- TEST 3: ESP32 + Servo at 180° angle (duty_u16 = 8192) ---
console.log("\n--- TEST 3: ESP32 Servo at 180° angle (duty_u16 = 8192) ---");
{
  const esp32Id = "esp32-1";
  const servoId = "servo-1";
  const nodes: SimContext["nodes"] = [
    { id: esp32Id, type: "esp32", position: { x: 0, y: 0 }, data: { componentType: "esp32", label: "ESP32", properties: {} } as any },
    { id: servoId, type: "servo", position: { x: 200, y: 0 }, data: { componentType: "servo", label: "Servo", properties: {} } as any },
  ];
  const edges: SimContext["edges"] = [
    { id: "e1", source: esp32Id, sourceHandle: "gpio26", target: servoId, targetHandle: "signal" },
  ];
  const code = `
from machine import Pin, PWM
servo = PWM(Pin(26), freq=50)
servo.duty_u16(8192)
`;
  const ctx: SimContext = {
    nodes, edges, arduinoCode: "", picoCode: code, boardType: "esp32", selectedLanguage: "python", dynamicComponents: [],
  } as any;
  const baseFrame: SimulationFrame = {
    tick: 1, boardType: "esp32", running: true, error: null, serialOutput: [], components: {}, timestamp: 100, boardPins: [],
  } as any;

  const esp32Frame = applyEsp32SimulationToFrame(baseFrame, ctx);
  const finalFrame = applyServoInputToFrame(esp32Frame);
  const servo = finalFrame.components[servoId];

  assert("ESP32 Servo is powered", servo?.isPowered === true);
  assert("ESP32 Servo angle = 180°", servo?.telemetry?.angle === 180);
  assert("ESP32 Servo signalPin = 26", servo?.telemetry?.signalPin === 26);
}

// --- TEST 4: Arduino Servo Regression (Servo.attach(9); myservo.write(90)) ---
console.log("\n--- TEST 4: Arduino Servo Regression (Servo.attach(9); myservo.write(90)) ---");
{
  const arduinoId = "arduino-1";
  const servoId = "servo-1";
  const nodes: SimContext["nodes"] = [
    { id: arduinoId, type: "arduino", position: { x: 0, y: 0 }, data: { componentType: "arduino", label: "Arduino", properties: {} } as any },
    { id: servoId, type: "servo", position: { x: 200, y: 0 }, data: { componentType: "servo", label: "Servo", properties: {} } as any },
  ];
  const edges: SimContext["edges"] = [
    { id: "e1", source: arduinoId, sourceHandle: "d9", target: servoId, targetHandle: "signal" },
    { id: "e2", source: arduinoId, sourceHandle: "5v", target: servoId, targetHandle: "power" },
    { id: "e3", source: arduinoId, sourceHandle: "gnd1", target: servoId, targetHandle: "ground" },
  ];
  const arduinoCode = `
#include <Servo.h>
Servo myservo;
void setup() {
  myservo.attach(9);
}
void loop() {
  myservo.write(90);
  delay(1000);
}
`;
  const ctx: SimContext = {
    nodes, edges, arduinoCode, picoCode: "", boardType: "arduino", selectedLanguage: "cpp", dynamicComponents: [],
  } as any;
  const baseFrame: SimulationFrame = {
    tick: 1, boardType: "arduino", running: true, error: null, serialOutput: [], components: {}, timestamp: 100, boardPins: [],
  } as any;

  const finalFrame = applyServoInputToFrame(baseFrame, ctx);
  const servo = finalFrame.components[servoId];

  assert("Arduino Servo is powered", servo?.isPowered === true);
  assert("Arduino Servo angle = 90°", servo?.telemetry?.angle === 90);
  assert("Arduino Servo signalPin = 9", servo?.telemetry?.signalPin === 9);
}

// --- TEST 5: Pico Servo Regression (PWM(Pin(15)).duty_u16(4915)) ---
console.log("\n--- TEST 5: Pico Servo Regression (PWM(Pin(15)).duty_u16(4915)) ---");
{
  const picoId = "pico-1";
  const servoId = "servo-1";
  const nodes: SimContext["nodes"] = [
    { id: picoId, type: "raspberrypipico", position: { x: 0, y: 0 }, data: { componentType: "raspberrypipico", label: "Pico", properties: {} } as any },
    { id: servoId, type: "servo", position: { x: 200, y: 0 }, data: { componentType: "servo", label: "Servo", properties: {} } as any },
  ];
  const edges: SimContext["edges"] = [
    { id: "e1", source: picoId, sourceHandle: "gp15", target: servoId, targetHandle: "signal" },
  ];
  const picoCode = `
from machine import Pin, PWM
servo = PWM(Pin(15))
servo.duty_u16(4915)
`;
  const ctx: SimContext = {
    nodes, edges, arduinoCode: "", picoCode, boardType: "pico", selectedLanguage: "python", dynamicComponents: [],
  } as any;
  const baseFrame: SimulationFrame = {
    tick: 1, boardType: "pico", running: true, error: null, serialOutput: [], components: {}, timestamp: 100, boardPins: [],
  } as any;

  const finalFrame = applyServoInputToFrame(baseFrame, ctx);
  const servo = finalFrame.components[servoId];

  assert("Pico Servo is powered", servo?.isPowered === true);
  assert("Pico Servo angle = 90°", servo?.telemetry?.angle === 90);
  assert("Pico Servo signalPin = 15", servo?.telemetry?.signalPin === 15);
}

// --- TEST 6: ESP32 + Disconnected Servo ---
console.log("\n--- TEST 6: ESP32 + Disconnected Servo ---");
{
  const esp32Id = "esp32-1";
  const servoId = "servo-1";
  const nodes: SimContext["nodes"] = [
    { id: esp32Id, type: "esp32", position: { x: 0, y: 0 }, data: { componentType: "esp32", label: "ESP32", properties: {} } as any },
    { id: servoId, type: "servo", position: { x: 200, y: 0 }, data: { componentType: "servo", label: "Servo", properties: {} } as any },
  ];
  const edges: SimContext["edges"] = []; // Unwired
  const code = `
from machine import Pin, PWM
servo = PWM(Pin(2), freq=50)
servo.duty_u16(4915)
`;
  const ctx: SimContext = {
    nodes, edges, arduinoCode: "", picoCode: code, boardType: "esp32", selectedLanguage: "python", dynamicComponents: [],
  } as any;
  const baseFrame: SimulationFrame = {
    tick: 1, boardType: "esp32", running: true, error: null, serialOutput: [], components: {}, timestamp: 100, boardPins: [],
  } as any;

  const esp32Frame = applyEsp32SimulationToFrame(baseFrame, ctx);
  const finalFrame = applyServoInputToFrame(esp32Frame);
  const servo = finalFrame.components[servoId];

  assert("Unwired Servo angle telemetry is undefined", servo?.telemetry?.angle === undefined);
}

console.log("\n=================== SERVO PWM REGRESSION & ESP32 TEST SUITE COMPLETE ===================");
const exitCode = process.exitCode ?? 0;
if (exitCode === 0) {
  console.log("✅ All Servo PWM tests passed.");
} else {
  console.log("❌ Some Servo PWM tests FAILED.");
}
