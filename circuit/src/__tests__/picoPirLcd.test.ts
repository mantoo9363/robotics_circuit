/**
 * Permanent Regression Test Suite for Pico PIR Sensor & LCD Connection & Dynamic Input Resolution
 */

import { getOrCreateSession } from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";
import { applyPirSensorInputToFrame } from "../lib/simulation/frameTransformers/ultrasonicPir";
import { applyPicoLcdOutputToFrame } from "../lib/simulation/frameTransformers/pico";
import { buildSimulationFrame, type SimulationFrame } from "../lib/simulation-state";
import type { SimContext } from "../lib/simulation/types";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runPicoPirLcdTests(): boolean {
  console.log("=================== RUNNING PICO PIR-LCD COMPATIBILITY TESTS ===================\n");

  let allPassed = true;

  // 1. Define nodes and edges representing the physical connections
  const picoNode: CircuitNode = {
    id: "pico1",
    type: "circuitComponent",
    data: {
      componentType: "raspberrypipico",
      simulationModel: "raspberrypipico",
      label: "Pico",
      rotation: 0,
      properties: {},
    },
    position: { x: 0, y: 0 },
  };

  const lcdNode: CircuitNode = {
    id: "lcd1",
    type: "circuitComponent",
    data: {
      componentType: "lcd16x2",
      simulationModel: "lcd16x2",
      label: "LCD",
      rotation: 0,
      properties: {
        i2cAddress: { label: "Address", type: "string", value: "0x27" },
      },
    },
    position: { x: 200, y: 0 },
  };

  const pirNode: CircuitNode = {
    id: "pir1",
    type: "circuitComponent",
    data: {
      componentType: "pirsensor",
      simulationModel: "pirSensor",
      label: "PIR Sensor",
      rotation: 0,
      properties: {
        motion: { label: "Motion", type: "string", value: "false" },
      },
      pirMotion: false,
    },
    position: { x: -200, y: 0 },
  };

  const edges: CircuitEdge[] = [
    // LCD connections
    { id: "e1", source: "lcd1", sourceHandle: "vcc", target: "pico1", targetHandle: "pico_3v3" },
    { id: "e2", source: "lcd1", sourceHandle: "gnd", target: "pico1", targetHandle: "gnd" },
    { id: "e3", source: "lcd1", sourceHandle: "sda", target: "pico1", targetHandle: "gp4" },
    { id: "e4", source: "lcd1", sourceHandle: "scl", target: "pico1", targetHandle: "gp5" },
    // PIR connections
    { id: "e5", source: "pir1", sourceHandle: "power", target: "pico1", targetHandle: "pico_3v3" },
    { id: "e6", source: "pir1", sourceHandle: "ground", target: "pico1", targetHandle: "gnd" },
    { id: "e7", source: "pir1", sourceHandle: "signal", target: "pico1", targetHandle: "gp28" },
  ];

  const code = `
from machine import Pin, I2C
from pico_i2c_lcd import I2cLcd
import time

pir = Pin(28, Pin.IN)
i2c = I2C(0, sda=Pin(4), scl=Pin(5))
lcd = I2cLcd(i2c, 0x27, 2, 16)

while True:
    val = pir.value()
    lcd.clear()
    if val == 1:
        lcd.putstr("Motion Detected")
    else:
        lcd.putstr("No Motion")
    time.sleep(1)
`.trim();

  // -----------------------------------------------------------------------------
  // Test 1: Motion Active -> PIR = 1, LCD displays "Motion Detected"
  // -----------------------------------------------------------------------------
  console.log("--- TEST 1: Motion Active (PIR = 1, LCD displays 'Motion Detected') ---");

  pirNode.data.pirMotion = true;
  if (pirNode.data.properties && pirNode.data.properties.motion) {
    pirNode.data.properties.motion.value = "true";
  }

  useCircuitStore.setState({
    nodes: [picoNode, lcdNode, pirNode],
    edges,
    picoCode: code,
    simulationStatus: "running",
  });

  const frame1 = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    running: true,
    boardType: "pico",
    nodes: [picoNode, lcdNode, pirNode],
    edges,
  });

  const context = {
    nodes: [picoNode, lcdNode, pirNode],
    edges,
    picoCode: code,
  } as any as SimContext;

  // Run the transformers
  const frameWithPirInput1 = applyPirSensorInputToFrame(frame1);
  const frameWithLcdOutput1 = applyPicoLcdOutputToFrame(frameWithPirInput1, context);

  const lcdComponent1 = frameWithLcdOutput1.components["lcd1"];
  const line1Text1 = String(lcdComponent1?.telemetry?.line1 ?? "").trim();

  console.log(`[Trace Test 1] LCD Line 1 = "${line1Text1}" (Expected: "Motion Detected")`);
  if (line1Text1 !== "Motion Detected") {
    console.error(`❌ Test 1 FAILED: LCD did not display 'Motion Detected', got '${line1Text1}'`);
    allPassed = false;
  } else {
    console.log("=> Test 1 PASSED\n");
  }

  // -----------------------------------------------------------------------------
  // Test 2: Motion Inactive -> PIR = 0, LCD displays "No Motion"
  // -----------------------------------------------------------------------------
  console.log("--- TEST 2: Motion Inactive (PIR = 0, LCD displays 'No Motion') ---");

  pirNode.data.pirMotion = false;
  if (pirNode.data.properties && pirNode.data.properties.motion) {
    pirNode.data.properties.motion.value = "false";
  }

  useCircuitStore.setState({
    nodes: [picoNode, lcdNode, pirNode],
    edges,
    picoCode: code,
    simulationStatus: "running",
  });

  const frame2 = buildSimulationFrame({
    tick: 1,
    timestamp: 1100, // advance time to let code loop run
    running: true,
    boardType: "pico",
    nodes: [picoNode, lcdNode, pirNode],
    edges,
  });

  // Run the transformers
  const frameWithPirInput2 = applyPirSensorInputToFrame(frame2);
  const frameWithLcdOutput2 = applyPicoLcdOutputToFrame(frameWithPirInput2, context);

  const lcdComponent2 = frameWithLcdOutput2.components["lcd1"];
  const line1Text2 = String(lcdComponent2?.telemetry?.line1 ?? "").trim();

  console.log(`[Trace Test 2] LCD Line 1 = "${line1Text2}" (Expected: "No Motion")`);
  if (line1Text2 !== "No Motion") {
    console.error(`❌ Test 2 FAILED: LCD did not display 'No Motion', got '${line1Text2}'`);
    allPassed = false;
  } else {
    console.log("=> Test 2 PASSED\n");
  }

  return allPassed;
}

if (require.main === module) {
  const ok = runPicoPirLcdTests();
  if (ok) {
    console.log("✅ All Pico PIR-LCD compatibility tests passed 100%.");
  } else {
    console.error("❌ Pico PIR-LCD compatibility tests failed.");
    process.exit(1);
  }
}
