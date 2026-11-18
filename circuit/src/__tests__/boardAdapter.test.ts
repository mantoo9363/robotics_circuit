/**
 * Permanent Regression Test Suite for BoardAdapter & Board Pin Parsing
 * 
 * Verifies pin connection resolution, dynamic branch pruning, analog offsets,
 * and Pico GPIO handle mapping for both Arduino (ATmega328P) and Raspberry Pi Pico (RP2040).
 */

import { getBoardAdapter, findMCUBoardNode } from "../lib/circuit/boardAdapter";
import { getConnectedBoardPin } from "../lib/codeParsing/arduinoParser";
import { parseLcdDisplayText } from "../lib/codeParsing/lcdParser";
import { parsePicoPinFromPythonCode } from "../lib/codeParsing/picoParser";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runBoardAdapterRegressionTests(): boolean {
  let passed = true;

  // -----------------------------------------------------------------------------
  // Checkpoint 1: Arduino Slide Switch + LED (Pin Connection Resolution)
  // -----------------------------------------------------------------------------
  const unoNode: CircuitNode = {
    id: "uno1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: { componentType: "arduino", simulationModel: "arduino", label: "Arduino Uno", properties: {}, rotation: 0 }
  };

  const swNode: CircuitNode = {
    id: "sw1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: {
      componentType: "slideswitch",
      simulationModel: "slideswitch",
      label: "Switch",
      properties: { state: { label: "State", type: "select", value: "right" } },
      rotation: 0
    }
  };

  const edgeUnoSwitch: CircuitEdge[] = [
    { id: "e1", source: "sw1", sourceHandle: "common", target: "uno1", targetHandle: "d2" },
    { id: "e2", source: "lcd1", sourceHandle: "sda", target: "uno1", targetHandle: "a4" },
    { id: "e3", source: "lcd1", sourceHandle: "scl", target: "uno1", targetHandle: "a5" },
    { id: "e4", source: "lcd1", sourceHandle: "vcc", target: "uno1", targetHandle: "5v" },
    { id: "e5", source: "lcd1", sourceHandle: "gnd", target: "uno1", targetHandle: "gnd1" },
  ];

  const connCheck1 = getConnectedBoardPin("sw1", "common", [unoNode, swNode], edgeUnoSwitch);
  if (!(connCheck1?.pinNumber === 2 && connCheck1?.handleId === "d2")) {
    console.error("FAIL: Checkpoint 1 - Arduino Pin D2 resolution failed", connCheck1);
    passed = false;
  }

  // -----------------------------------------------------------------------------
  // Checkpoint 2: Arduino Slide Switch + I2C LCD (16x2 Text Rendering)
  // -----------------------------------------------------------------------------
  const lcdNode: CircuitNode = {
    id: "lcd1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: {
      componentType: "lcd16x2",
      simulationModel: "lcd16x2",
      label: "LCD",
      properties: { i2cAddress: { label: "Address", type: "string", value: "0x27" } },
      rotation: 0
    }
  };

  const lcdCode = `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
const int switchPin = 2;
void setup() { pinMode(switchPin, INPUT_PULLUP); lcd.init(); }
void loop() {
  int state = digitalRead(switchPin);
  lcd.setCursor(0, 1);
  if (state == LOW) { lcd.print("ON              "); }
  else { lcd.print("OFF             "); }
}
`;

  // Test Right (ON -> LOW -> 0)
  const resRight = parseLcdDisplayText(lcdCode, "PCF8574", 0x27, lcdCode, [unoNode, lcdNode, swNode], edgeUnoSwitch);
  const row1Right = resRight ? Array.from({ length: 16 }, (_, i) => String.fromCharCode(resRight[0].state.ddram[40 + i])).join("").trim() : "";

  // Test Left (OFF -> HIGH -> 1)
  const swNodeLeft: CircuitNode = {
    ...swNode,
    data: { ...swNode.data, properties: { state: { label: "State", type: "select", value: "left" } } }
  };
  const resLeft = parseLcdDisplayText(lcdCode, "PCF8574", 0x27, lcdCode, [unoNode, lcdNode, swNodeLeft], edgeUnoSwitch);
  const row1Left = resLeft ? Array.from({ length: 16 }, (_, i) => String.fromCharCode(resLeft[0].state.ddram[40 + i])).join("").trim() : "";

  if (row1Right !== "ON" || row1Left !== "OFF") {
    console.error(`FAIL: Checkpoint 2 - LCD Branch Pruning failed. Right="${row1Right}", Left="${row1Left}"`);
    passed = false;
  }

  // -----------------------------------------------------------------------------
  // Checkpoint 3: Arduino Analog Pin Mapping (A0 -> Pin 14 Offset)
  // -----------------------------------------------------------------------------
  const potNode: CircuitNode = {
    id: "pot1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: { componentType: "potentiometer", simulationModel: "potentiometer", label: "Potentiometer", properties: {}, rotation: 0 }
  };

  const edgeUnoPot: CircuitEdge[] = [
    { id: "e2", source: "pot1", sourceHandle: "wiper", target: "uno1", targetHandle: "a0" }
  ];

  const connCheck3 = getConnectedBoardPin("pot1", "wiper", [unoNode, potNode], edgeUnoPot);
  if (!(connCheck3?.pinNumber === 14 && connCheck3?.handleId === "a0")) {
    console.error("FAIL: Checkpoint 3 - Arduino Analog A0 offset mapping failed", connCheck3);
    passed = false;
  }

  // -----------------------------------------------------------------------------
  // Checkpoint 4: Pico GPIO Handle Mapping & Execution
  // -----------------------------------------------------------------------------
  const picoNode: CircuitNode = {
    id: "pico1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: { componentType: "raspberrypipico", simulationModel: "raspberrypipico", label: "Pico", properties: {}, rotation: 0 }
  };

  const edgePicoSwitch: CircuitEdge[] = [
    { id: "e3", source: "sw1", sourceHandle: "common", target: "pico1", targetHandle: "gp15" }
  ];

  const connCheck4 = getConnectedBoardPin("sw1", "common", [picoNode, swNode], edgePicoSwitch);

  const pythonCode = `
from machine import Pin
switch = Pin(15, Pin.IN)
led = Pin(25, Pin.OUT)
if switch.value() == 0:
    led.value(1)
`;

  const parsedPicoPin = parsePicoPinFromPythonCode(pythonCode, ["switch"]);
  if (!(connCheck4?.pinNumber === 15 && connCheck4?.handleId === "gp15" && parsedPicoPin === 15)) {
    console.error("FAIL: Checkpoint 4 - Pico GP15 pin resolution failed", connCheck4, parsedPicoPin);
    passed = false;
  }

  return passed;
}

// Auto-run if executed directly via tsx / ts-node
if (require.main === module) {
  const success = runBoardAdapterRegressionTests();
  if (success) {
    console.log("✅ All permanent boardAdapter regression tests passed successfully.");
  } else {
    console.error("❌ Some boardAdapter regression tests failed.");
    process.exit(1);
  }
}
