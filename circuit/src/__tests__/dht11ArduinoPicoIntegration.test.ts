/**
 * Permanent Integration Test Suite for DHT11 Arduino & Raspberry Pi Pico Multi-MCU Support
 */

import { COMPONENT_CATALOG } from "../lib/circuit-components";
import { parseLcdDisplayText } from "../lib/codeParsing/lcdParser";
import { getBoardAdapter } from "../lib/circuit/boardAdapter";
import type { CircuitNode } from "../lib/types";

export function runDht11IntegrationTests(): boolean {
  // Test 1: Verify DHT11 catalog definition
  const dhtDef = COMPONENT_CATALOG.find((c) => c.type === "dht11");
  if (!dhtDef) {
    throw new Error("FAIL: dht11 component not found in COMPONENT_CATALOG");
  }

  // Test 2: BoardAdapter pin resolution for both Arduino and Pico
  const arduinoAdapter = getBoardAdapter("arduino");
  const picoAdapter = getBoardAdapter("raspberrypipico");

  const arduinoDataPin = arduinoAdapter.parseHandleToPinNumber("d2");
  if (!arduinoDataPin || arduinoDataPin.pinNumber !== 2) {
    throw new Error("FAIL: ArduinoBoardAdapter failed to parse handle d2");
  }

  const picoDataPin = picoAdapter.parseHandleToPinNumber("gp15");
  if (!picoDataPin || picoDataPin.pinNumber !== 15) {
    throw new Error("FAIL: PicoBoardAdapter failed to parse handle gp15");
  }

  // Test 3: Arduino LCD code parsing with dht.readTemperature() & dht.readHumidity()
  const dhtNode: CircuitNode = {
    id: "dht1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: {
      componentType: "dht11",
      simulationModel: "dht11",
      label: "DHT11 Sensor",
      rotation: 0,
      properties: {
        temperature: { label: "Temperature", type: "number", value: 30, unit: "°C" },
        humidity: { label: "Humidity", type: "number", value: 65, unit: "%" },
      },
    },
  };

  const lcdNode: CircuitNode = {
    id: "lcd1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: {
      componentType: "lcd16x2",
      simulationModel: "lcd16x2",
      label: "LCD Screen",
      rotation: 0,
      properties: {},
    },
  };

  const arduinoNode: CircuitNode = {
    id: "uno1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: {
      componentType: "arduino",
      simulationModel: "arduino",
      label: "Arduino Uno",
      rotation: 0,
      properties: {},
    },
  };

  const edges = [
    { id: "e1", source: "dht1", sourceHandle: "data", target: "uno1", targetHandle: "d2" },
    { id: "e2", source: "dht1", sourceHandle: "vcc", target: "uno1", targetHandle: "5v" },
    { id: "e3", source: "dht1", sourceHandle: "gnd", target: "uno1", targetHandle: "gnd1" },
  ];

  const arduinoCode = `
    #include <DHT.h>
    #include <LiquidCrystal.h>
    LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
    DHT dht(2, DHT11);
    void setup() {
      lcd.begin(16, 2);
      lcd.print("Temp:");
      lcd.print(dht.readTemperature());
      lcd.setCursor(0, 1);
      lcd.print("Hum:");
      lcd.print(dht.readHumidity());
    }
  `;

  const lcdResults = parseLcdDisplayText(arduinoCode, undefined, undefined, arduinoCode, [dhtNode, lcdNode, arduinoNode], edges);
  if (!lcdResults || lcdResults.length === 0) {
    throw new Error("FAIL: parseLcdDisplayText returned null or empty");
  }

  const ddram = lcdResults[0].state.ddram;
  const ddramText = String.fromCharCode(...Array.from(ddram));
  if (!ddramText.includes("Temp:30") || !ddramText.includes("Hum:65")) {
    throw new Error(`FAIL: Arduino LCD parsing failed for DHT11. DDRAM: "${ddramText}"`);
  }

  // Test 4: Verify LED Pin 8 and Buzzer Pin 9 actuation when temperature > 30°C
  const userSketch = `
    #include <DHT.h>
    #define DHTPIN 2
    #define DHTTYPE DHT11
    #define LED_PIN 8
    #define BUZZER_PIN 9
    DHT dht(DHTPIN, DHTTYPE);
    void setup() {
      pinMode(LED_PIN, OUTPUT);
      pinMode(BUZZER_PIN, OUTPUT);
      dht.begin();
    }
    void loop() {
      float temperature = dht.readTemperature();
      if (temperature > 30) {
        digitalWrite(LED_PIN, HIGH);
        tone(BUZZER_PIN, 1000);
      } else {
        digitalWrite(LED_PIN, LOW);
        noTone(BUZZER_PIN);
      }
    }
  `;

  const { applyDht11InputToFrame } = require("../lib/simulation/frameTransformers/dht11");
  const { useCircuitStore } = require("../lib/store");

  const alertDhtNode: CircuitNode = {
    id: "dht1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: {
      componentType: "dht11",
      simulationModel: "dht11",
      label: "DHT11 Sensor",
      rotation: 0,
      properties: {
        temperature: { label: "Temperature", type: "number", value: 33, unit: "°C" },
        humidity: { label: "Humidity", type: "number", value: 52, unit: "%" },
      },
    },
  };

  useCircuitStore.setState({
    nodes: [alertDhtNode, arduinoNode],
    edges,
    arduinoCode: userSketch,
    simulationStatus: "running",
  });

  const baseFrame = {
    tick: 1,
    timestamp: 100,
    boardType: "arduino",
    running: true,
    error: null,
    boardPins: [
      { pin: 8, mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
      { pin: 9, mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: true },
    ],
    serialOutput: [],
    components: {},
  };

  const processedFrame = applyDht11InputToFrame(baseFrame as any);
  const pin8State = processedFrame.boardPins?.find((p: any) => p.pin === 8);
  const pin9State = processedFrame.boardPins?.find((p: any) => p.pin === 9);

  if (!pin8State || pin8State.value !== 255) {
    throw new Error(`FAIL: LED Pin 8 not set to HIGH (255) when temperature = 33°C. Got: ${pin8State?.value}`);
  }
  if (!pin9State || pin9State.value !== 255) {
    throw new Error(`FAIL: Buzzer Pin 9 not set to HIGH (255) when temperature = 33°C. Got: ${pin9State?.value}`);
  }

  console.log("PASS: DHT11 Arduino & Raspberry Pi Pico multi-MCU integration tests (including LED & Buzzer alerts)");
  return true;
}

if (typeof require !== "undefined" && require.main === module) {
  runDht11IntegrationTests();
}
