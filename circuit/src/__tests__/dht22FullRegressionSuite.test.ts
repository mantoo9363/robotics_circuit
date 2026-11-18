/**
 * Permanent Regression Test Suite for DHT22 Sensor with Arduino, Raspberry Pi Pico, LCD16x2, and NeoPixel
 */

import { COMPONENT_CATALOG, COMPONENT_THUMBNAILS } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { buildSimulationFrame } from "../lib/simulation-state";
import { useCircuitStore } from "../lib/store";
import {
  applyDht22InputToFrame,
  clampDht22Temperature,
  clampDht22Humidity,
  calculateDht22TempRatio,
  calculateDht22TempFromRatio,
  MIN_DHT22_TEMP,
  MAX_DHT22_TEMP,
  MIN_DHT22_HUMIDITY,
  MAX_DHT22_HUMIDITY,
} from "../lib/simulation/frameTransformers/dht22";
import { getOrCreateSession } from "../lib/codeParsing/picoParser";
import { parseLcdDisplayText } from "../lib/codeParsing/lcdParser";
import { applyLcdInputToFrame } from "../lib/simulation/frameTransformers/lcd";

export function runDht22FullRegressionTests(): boolean {
  console.log("=================== RUNNING DHT22 FULL REGRESSION SUITE ===================\n");

  // TEST 1: Component Catalog & Thumbnail
  console.log("--- TEST 1: DHT22 Component Catalog & Thumbnail ---");
  const dht22Def = COMPONENT_CATALOG.find((c) => c.type === "dht22");
  if (!dht22Def) {
    throw new Error("❌ Test 1 FAILED: dht22 not found in COMPONENT_CATALOG");
  }
  if (dht22Def.pins.length !== 3) {
    throw new Error(`❌ Test 1 FAILED: Expected 3 pins, got ${dht22Def.pins.length}`);
  }
  if (COMPONENT_THUMBNAILS.dht22 !== "/parts/DHT 22 Module.svg") {
    throw new Error(`❌ Test 1 FAILED: Expected /parts/DHT 22 Module.svg, got ${COMPONENT_THUMBNAILS.dht22}`);
  }
  console.log("=> Test 1 PASSED: DHT22 registered in catalog with pins and thumbnail\n");

  // TEST 2: Clamping & Ratio Mathematics
  console.log("--- TEST 2: Clamping and Ratio Conversion ---");
  if (clampDht22Temperature(-50) !== MIN_DHT22_TEMP || clampDht22Temperature(100) !== MAX_DHT22_TEMP) {
    throw new Error("❌ Test 2 FAILED: clampDht22Temperature bounds error");
  }
  if (clampDht22Humidity(-10) !== MIN_DHT22_HUMIDITY || clampDht22Humidity(120) !== MAX_DHT22_HUMIDITY) {
    throw new Error("❌ Test 2 FAILED: clampDht22Humidity bounds error");
  }
  const midTemp = calculateDht22TempFromRatio(0.5);
  if (Math.abs(midTemp - 20) > 0.001) {
    throw new Error(`❌ Test 2 FAILED: Expected ratio 0.5 to equal 20°C, got ${midTemp}`);
  }
  if (Math.abs(calculateDht22TempRatio(20) - 0.5) > 0.001) {
    throw new Error("❌ Test 2 FAILED: calculateDht22TempRatio incorrect");
  }
  console.log("=> Test 2 PASSED: Clamping and ratio conversion math accurate\n");

  // TEST 3: Frame Transformer Telemetry & Voltage
  console.log("--- TEST 3: Frame Transformer Telemetry ---");
  const dht22Node: CircuitNode = {
    id: "dht22_1",
    type: "customNode",
    position: { x: 100, y: 100 },
    data: {
      label: "DHT22 Sensor",
      componentType: "dht22",
      simulationModel: "dht22",
      rotation: 0,
      properties: {
        temperature: { label: "Temperature", type: "number", value: -15.5, unit: "°C", min: -40, max: 80 },
        humidity: { label: "Humidity", type: "number", value: 65.4, unit: "%", min: 0, max: 100 },
      },
    },
  };
  const unoNode: CircuitNode = {
    id: "uno1",
    type: "customNode",
    position: { x: 300, y: 100 },
    data: {
      label: "Arduino Uno",
      componentType: "arduino",
      simulationModel: "arduino",
      rotation: 0,
      properties: {},
    },
  };
  const edges: CircuitEdge[] = [
    { id: "e1", source: "dht22_1", sourceHandle: "data", target: "uno1", targetHandle: "d2" },
    { id: "e2", source: "dht22_1", sourceHandle: "vcc", target: "uno1", targetHandle: "5v" },
    { id: "e3", source: "dht22_1", sourceHandle: "gnd", target: "uno1", targetHandle: "gnd1" },
  ];

  useCircuitStore.setState({
    nodes: [dht22Node, unoNode],
    edges,
    arduinoCode: `
#include <DHT.h>
#define DHTPIN 2
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);
void setup() { dht.begin(); }
void loop() { float t = dht.readTemperature(); }
    `,
  });

  const baseFrame = buildSimulationFrame({
    tick: 1,
    nodes: [dht22Node, unoNode],
    edges,
    dynamicComponents: COMPONENT_CATALOG,
    boardType: "arduino",
    running: true,
  });

  const transformed = applyDht22InputToFrame(baseFrame);
  const dhtState = transformed.components["dht22_1"];
  if (!dhtState || !dhtState.isPowered) {
    throw new Error("❌ Test 3 FAILED: DHT22 component was not marked as powered");
  }
  if (dhtState.telemetry?.temperature !== -15.5 || dhtState.telemetry?.humidity !== 65.4) {
    throw new Error(`❌ Test 3 FAILED: Unexpected telemetry ${JSON.stringify(dhtState.telemetry)}`);
  }
  console.log("=> Test 3 PASSED: DHT22 powered with live negative temperature and decimal humidity telemetry\n");

  // TEST 4: Pico MicroPython DHT22 Support
  console.log("--- TEST 4: Pico MicroPython DHT22 Parsing ---");
  const picoCode = `
import dht
from machine import Pin

sensor = dht.DHT22(Pin(2))
sensor.measure()
t = sensor.temperature()
h = sensor.humidity()
`;
  const session = getOrCreateSession(picoCode, 100);
  if (!session) {
    throw new Error("❌ Test 4 FAILED: Could not create Pico session");
  }
  console.log("=> Test 4 PASSED: MicroPython dht.DHT22 session created and executed\n");

  // TEST 5: LCD16x2 + DHT22 Display Integration
  console.log("--- TEST 5: LCD16x2 + DHT22 Display Integration ---");
  const lcdNode: CircuitNode = {
    id: "lcd1",
    type: "customNode",
    position: { x: 500, y: 100 },
    data: {
      label: "LCD 16x2",
      componentType: "lcd16x2",
      simulationModel: "lcd16x2",
      rotation: 0,
      properties: {},
    },
  };
  const lcdEdges: CircuitEdge[] = [
    ...edges,
    { id: "e4", source: "lcd1", sourceHandle: "vcc", target: "uno1", targetHandle: "5v" },
    { id: "e5", source: "lcd1", sourceHandle: "gnd", target: "uno1", targetHandle: "gnd2" },
    { id: "e6", source: "lcd1", sourceHandle: "sda", target: "uno1", targetHandle: "a4" },
    { id: "e7", source: "lcd1", sourceHandle: "scl", target: "uno1", targetHandle: "a5" },
  ];

  const lcdArduinoCode = `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
DHT dht(2, DHT22);
void setup() {
  lcd.init();
  dht.begin();
}
void loop() {
  lcd.setCursor(0, 0);
  lcd.print("Temp: ");
  lcd.print(dht.readTemperature());
}
`;
  useCircuitStore.setState({
    nodes: [dht22Node, unoNode, lcdNode],
    edges: lcdEdges,
    arduinoCode: lcdArduinoCode,
    simulationStatus: 'running',
    isSimulating: true,
  });

  const lcdFrame = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [dht22Node, unoNode, lcdNode],
    edges: lcdEdges,
    boardType: "arduino",
    running: true,
  });
  const lcdTransformed = applyLcdInputToFrame(lcdFrame, {} as any);
  const lcdTelemetry = lcdTransformed.components["lcd1"]?.telemetry;

  console.log(`[Trace LCD Output] Line 1 = "${lcdTelemetry?.line1}"`);
  if (!String(lcdTelemetry?.line1 ?? "").includes("Temp: -15.5")) {
    throw new Error(`❌ Test 5 FAILED: Expected LCD Line 1 to contain 'Temp: -15.5', got '${lcdTelemetry?.line1}'`);
  }
  console.log("=> Test 5 PASSED: LCD16x2 renders DHT22 temperature accurately\n");

  // TEST 6: Pico MicroPython Continuous Serial Execution & Preservation
  console.log("--- TEST 6: Pico MicroPython Continuous Serial Execution ---");
  const picoDhtCode = `
from machine import Pin
import dht
import time

sensor = dht.DHT22(Pin(15))
print("Pico DHT22 Weather Monitor Ready!")

while True:
    try:
        sensor.measure()
        temp = sensor.temperature()
        hum = sensor.humidity()
        print(f"Temperature: {temp:.1f} °C | Humidity: {hum:.1f} %")
    except Exception as e:
        print("DHT22 Read Error:", e)
    time.sleep(2)
`;
  const picoNode = {
    id: "pico1",
    type: "raspberry-pi-pico",
    data: { componentType: "raspberry-pi-pico", label: "Raspberry Pi Pico" },
  };
  const picoDht22Node = {
    id: "dht1",
    type: "dht22",
    data: {
      componentType: "dht22",
      properties: {
        temperature: { value: 26.5 },
        humidity: { value: 65.0 },
      },
    },
  };
  const picoDhtEdges = [
    { id: "pe1", source: "dht1", sourceHandle: "vcc", target: "pico1", targetHandle: "pico_3v3" },
    { id: "pe2", source: "dht1", sourceHandle: "gnd", target: "pico1", targetHandle: "pico_gnd1" },
    { id: "pe3", source: "dht1", sourceHandle: "data", target: "pico1", targetHandle: "gp15" },
  ];

  useCircuitStore.setState({
    nodes: [picoNode, picoDht22Node] as any,
    edges: picoDhtEdges as any,
    picoCode: picoDhtCode,
    arduinoCode: `// Stale C++ code that should NOT override Pico MicroPython
#include <DHT.h>
void setup() { Serial.println("Stale C++"); }
void loop() { Serial.println("Stale C++ Loop"); }`,
    isSimulating: true,
  });

  const picoSimFrame = buildSimulationFrame({
    tick: 1,
    timestamp: 500,
    nodes: [picoNode, picoDht22Node] as any,
    edges: picoDhtEdges as any,
    boardType: "pico",
    arduinoState: { pins: new Map(), serialOutput: ["Pico DHT22 Weather Monitor Ready!"], running: true, error: null },
    running: true,
    error: null,
  });

  const picoDhtTransformed = applyDht22InputToFrame(picoSimFrame);
  if (picoDhtTransformed.serialOutput?.some((l) => l.includes("Stale C++"))) {
    throw new Error("❌ Test 6 FAILED: applyDht22InputToFrame incorrectly evaluated arduinoCode on Pico frame");
  }

  const { parsePythonReadOutputsForInput } = require("../lib/codeParsing/picoParser");
  parsePythonReadOutputsForInput(picoDhtCode, -1, false, 500);
  const step2Res = parsePythonReadOutputsForInput(picoDhtCode, -1, false, 2500);

  const finalPicoSession = getOrCreateSession(picoDhtCode, 2500);
  const serialText = (finalPicoSession.rawSerialLines ?? []).join(" ");
  console.log(`[Trace Pico Serial] Output = "${serialText}"`);

  if (!serialText.includes("Temperature: 26.5 °C | Humidity: 65.0 %")) {
    throw new Error(`❌ Test 6 FAILED: Expected continuous formatted temp/humidity output, got '${serialText}'`);
  }
  console.log("=> Test 6 PASSED: Pico MicroPython executes continuous loop with f-string format specifiers cleanly\n");

  console.log("=================== ALL DHT22 REGRESSION TESTS PASSED ===================\n");
  return true;
}

if (process.argv[1]?.includes("dht22FullRegressionSuite")) {
  runDht22FullRegressionTests();
}
