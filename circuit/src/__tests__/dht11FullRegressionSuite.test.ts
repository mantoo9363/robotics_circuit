/**
 * Permanent Regression Test Suite for DHT11 Sensor with Arduino, Raspberry Pi Pico, and LCD16x2
 */

import { COMPONENT_CATALOG } from "../lib/circuit-components";
import { parseLcdDisplayText } from "../lib/codeParsing/lcdParser";
import { getOrCreateSession } from "../lib/codeParsing/picoParser";
import { validateComponentConnections } from "../utils/connectivity";
import { applyDht11InputToFrame } from "../lib/simulation/frameTransformers/dht11";
import { applyLcdInputToFrame } from "../lib/simulation/frameTransformers/lcd";
import { buildSimulationFrame } from "../lib/simulation-state";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runDht11FullRegressionTests(): boolean {
  console.log("=================== RUNNING DHT11 FULL REGRESSION SUITE ===================\n");

  let allPassed = true;

  // -----------------------------------------------------------------------------
  // Test 1: Catalog & Pin Definitions
  // -----------------------------------------------------------------------------
  console.log("--- TEST 1: DHT11 Component Catalog Registration ---");
  const dhtDef = COMPONENT_CATALOG.find((c) => c.type === "dht11");
  if (!dhtDef) {
    console.error("❌ Test 1 FAILED: dht11 component not found in COMPONENT_CATALOG");
    allPassed = false;
  } else if (dhtDef.pins.length !== 3) {
    console.error(`❌ Test 1 FAILED: Expected 3 pins, got ${dhtDef.pins.length}`);
    allPassed = false;
  } else {
    console.log("=> Test 1 PASSED: DHT11 registered with DATA, VCC, GND pins\n");
  }

  // -----------------------------------------------------------------------------
  // Test 2: Arduino + DHT11 + LCD Integration
  // -----------------------------------------------------------------------------
  console.log("--- TEST 2: Arduino + DHT11 + LCD Integration ---");
  const dhtNodeArduino: CircuitNode = {
    id: "dht1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: {
      componentType: "dht11",
      simulationModel: "dht11",
      label: "DHT11 Sensor",
      rotation: 0,
      properties: {
        temperature: { label: "Temperature", type: "number", value: 28, unit: "°C" },
        humidity: { label: "Humidity", type: "number", value: 72, unit: "%" },
      },
    },
  };

  const lcdNodeArduino: CircuitNode = {
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

  const unoNode: CircuitNode = {
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

  const arduinoEdges: CircuitEdge[] = [
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
      lcd.print("Temp: ");
      lcd.print(dht.readTemperature());
      lcd.setCursor(0, 1);
      lcd.print("Hum: ");
      lcd.print(dht.readHumidity());
    }
  `;

  const arduinoLcdResults = parseLcdDisplayText(
    arduinoCode,
    undefined,
    undefined,
    arduinoCode,
    [dhtNodeArduino, lcdNodeArduino, unoNode],
    arduinoEdges,
  );

  if (!arduinoLcdResults || arduinoLcdResults.length === 0) {
    console.error("❌ Test 2 FAILED: Arduino parseLcdDisplayText returned null");
    allPassed = false;
  } else {
    const text = String.fromCharCode(...Array.from(arduinoLcdResults[0].state.ddram));
    console.log(`[Trace Test 2] LCD Output = "${text.trim()}"`);
    if (text.includes("Temp: 28") && text.includes("Hum: 72")) {
      console.log("=> Test 2 PASSED: Arduino DHT11 reading correctly displayed on LCD\n");
    } else {
      console.error(`❌ Test 2 FAILED: Expected "Temp: 28" & "Hum: 72", got "${text.trim()}"`);
      allPassed = false;
    }
  }

  // -----------------------------------------------------------------------------
  // Test 3: Raspberry Pi Pico + DHT11 + LCD Integration (MicroPython)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 3: Raspberry Pi Pico + DHT11 + LCD Integration ---");
  const picoCode = `
import dht
from machine import Pin
from pico_i2c_lcd import I2cLcd

sensor = dht.DHT11(Pin(15))
lcd = I2cLcd(None, 0x27, 2, 16)

sensor.measure()
t = sensor.temperature()
h = sensor.humidity()

lcd.clear()
lcd.putstr("Temp: " + str(t) + "C")
  `.trim();

  const picoSession = getOrCreateSession(picoCode, 0);
  const lcdStatePico = picoSession.lcdStates.get(0x27) || picoSession.lcdState;
  if (!lcdStatePico) {
    console.error("❌ Test 3 FAILED: picoSession.lcdState is undefined");
    allPassed = false;
  } else {
    const l1Pico = Array.from(lcdStatePico.ddram.slice(0, 16))
      .map((c) => String.fromCharCode(c || 32))
      .join("")
      .trim();

    console.log(`[Trace Test 3] Pico LCD Line 1 = "${l1Pico}" (Expected: "Temp: 24C")`);
    if (l1Pico.includes("Temp: 24C")) {
      console.log("=> Test 3 PASSED: Pico DHT11 MicroPython reading correctly displayed on LCD\n");
    } else {
      console.error(`❌ Test 3 FAILED: Expected "Temp: 24C", got "${l1Pico}"`);
      allPassed = false;
    }
  }

  // -----------------------------------------------------------------------------
  // Test 4: Pin Connectivity & Diagnostic Warnings
  // -----------------------------------------------------------------------------
  console.log("--- TEST 4: Pin Connectivity & Diagnostic Warnings ---");
  const isConnected = validateComponentConnections(dhtNodeArduino, [dhtNodeArduino, unoNode], arduinoEdges);
  if (!isConnected) {
    console.error("❌ Test 4 FAILED: Connected DHT11 returned false for validateComponentConnections");
    allPassed = false;
  } else {
    console.log("=> Test 4 PASSED: DHT11 connectivity validation verified\n");
  }

  // -----------------------------------------------------------------------------
  // Test 5: Simulation Frame Transformer
  // -----------------------------------------------------------------------------
  console.log("--- TEST 5: DHT11 Simulation Frame Transformer ---");
  useCircuitStore.setState({ nodes: [dhtNodeArduino, unoNode], edges: arduinoEdges });
  const initFrame = buildSimulationFrame({
    tick: 1,
    nodes: [dhtNodeArduino, unoNode],
    edges: arduinoEdges,
    boardType: "arduino" as const,
    running: true,
  });
  const updatedFrame = applyDht11InputToFrame(initFrame);
  const dhtComp = updatedFrame.components["dht1"];

  if (!dhtComp || !dhtComp.isPowered || dhtComp.telemetry?.temperature !== 28) {
    console.error("❌ Test 5 FAILED: DHT11 frame transformer failed to populate telemetry");
    allPassed = false;
  } else {
    console.log(`=> Test 5 PASSED: Telemetry populated -> Temp: ${dhtComp.telemetry.temperature}°C, Hum: ${dhtComp.telemetry.humidity}%\n`);
  }

  // -----------------------------------------------------------------------------
  // Test 6: Setup Phase LCD Delay Animation & Loop Transition
  // -----------------------------------------------------------------------------
  console.log("--- TEST 6: DHT11 + LCD Setup Phase Delay & Loop Transition ---");
  const setupSketch = `
    #include <Wire.h>
    #include <LiquidCrystal_I2C.h>
    #include <DHT.h>

    DHT dht(2, DHT11);
    LiquidCrystal_I2C lcd(0x27, 16, 2);

    void setup() {
      dht.begin();
      lcd.init();
      lcd.backlight();
      lcd.setCursor(0, 0);
      lcd.print("DHT11 Testing");
      delay(2000);
      lcd.clear();
    }

    void loop() {
      float temperature = dht.readTemperature();
      float humidity = dht.readHumidity();

      if (isnan(temperature) || isnan(humidity)) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("DHT11 Error!");
        delay(2000);
        return;
      }

      lcd.setCursor(0, 0);
      lcd.print("Temp: ");
      lcd.print(temperature);
      lcd.print(" C ");

      lcd.setCursor(0, 1);
      lcd.print("Hum: ");
      lcd.print(humidity);
      lcd.print(" % ");

      delay(2000);
    }
  `;

  const test6Edges: CircuitEdge[] = [
    { id: "e1", source: "dht1", sourceHandle: "data", target: "uno1", targetHandle: "d2" },
    { id: "e2", source: "dht1", sourceHandle: "vcc", target: "uno1", targetHandle: "5v" },
    { id: "e3", source: "dht1", sourceHandle: "gnd", target: "uno1", targetHandle: "gnd1" },
    { id: "e4", source: "lcd1", sourceHandle: "vcc", target: "uno1", targetHandle: "5v" },
    { id: "e5", source: "lcd1", sourceHandle: "gnd", target: "uno1", targetHandle: "gnd2" },
    { id: "e6", source: "lcd1", sourceHandle: "sda", target: "uno1", targetHandle: "a4" },
    { id: "e7", source: "lcd1", sourceHandle: "scl", target: "uno1", targetHandle: "a5" },
  ];

  useCircuitStore.setState({
    nodes: [dhtNodeArduino, unoNode, lcdNodeArduino],
    edges: test6Edges,
    arduinoCode: setupSketch,
    simulationStatus: 'running',
    isSimulating: true,
  });

  // Frame at t=1000ms (within setup phase 0-2000ms)
  const setupFrame = buildSimulationFrame({
    tick: 10,
    timestamp: 1000,
    nodes: [dhtNodeArduino, unoNode, lcdNodeArduino],
    edges: test6Edges,
    boardType: 'arduino',
    running: true,
  });
  const setupTransformed = applyLcdInputToFrame(setupFrame, {} as any);
  const setupLcd = setupTransformed.components["lcd1"]?.telemetry;

  // Frame at t=3000ms (after setup phase completes)
  const loopFrame = buildSimulationFrame({
    tick: 30,
    timestamp: 3000,
    nodes: [dhtNodeArduino, unoNode, lcdNodeArduino],
    edges: test6Edges,
    boardType: 'arduino',
    running: true,
  });
  const loopTransformed = applyLcdInputToFrame(loopFrame, {} as any);
  const loopLcd = loopTransformed.components["lcd1"]?.telemetry;

  console.log(`[Trace Setup t=1000ms] LCD Line 1 = "${setupLcd?.line1}" (Expected: "DHT11 Testing")`);
  console.log(`[Trace Loop  t=3000ms] LCD Line 1 = "${loopLcd?.line1}", Line 2 = "${loopLcd?.line2}"`);

  if (!String(setupLcd?.line1 ?? "").includes("DHT11 Testing") || !String(loopLcd?.line1 ?? "").includes("Temp: 28") || String(loopLcd?.line1 ?? "").includes("DHT11 Error!")) {
    console.error("❌ Test 6 FAILED: Setup delay timeline or loop sensor rendering failed");
    allPassed = false;
  } else {
    console.log("=> Test 6 PASSED: Setup banner 'DHT11 Testing' displayed at t=1000ms, transitioned cleanly to 'Temp: 28 C' at t=3000ms\n");
  }

  console.log("=================== DHT11 SUITE RESULT: " + (allPassed ? "ALL PASSED ✅" : "SOME FAILED ❌") + " ===================");
  return allPassed;
}

if (typeof require !== "undefined" && require.main === module) {
  runDht11FullRegressionTests();
}
