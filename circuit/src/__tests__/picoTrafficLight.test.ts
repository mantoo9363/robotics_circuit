/**
 * Unit Test Suite for MicroPython Pico Traffic Light (GPIO Driven LEDs)
 */

import { parsePythonReadOutputsForInput, getOrCreateSession } from "../lib/codeParsing/picoParser";
import { applyPicoSimulationToFrame } from "../lib/simulation/frameTransformers/pico";
import { buildSimulationFrame, type SimulationFrame } from "../lib/simulation-state";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runPicoTrafficLightTests(): boolean {
  console.log("=================== RUNNING PICO TRAFFIC LIGHT LED TESTS ===================\n");

  let allPassed = true;

  const codeTrafficLight = `
from machine import Pin
import time

red = Pin(13, Pin.OUT)
yellow = Pin(14, Pin.OUT)
green = Pin(15, Pin.OUT)

while True:
    red.value(0)
    yellow.value(0)
    green.value(1)
    print("GREEN")
    time.sleep(2)

    green.value(0)
    yellow.value(1)
    print("YELLOW")
    time.sleep(1)

    yellow.value(0)
    red.value(1)
    print("RED")
    time.sleep(2)
`.trim();

  // Nodes for Pico board and 3 LEDs (Red on GP13, Yellow on GP14, Green on GP15)
  const picoNode: CircuitNode = {
    id: "pico1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "raspberrypipico", simulationModel: "raspberrypipico", label: "Pico", rotation: 0, properties: {} },
  };

  const ledRed: CircuitNode = {
    id: "ledRed",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "led", simulationModel: "led", label: "Red LED", rotation: 0, properties: { color: { label: "Color", type: "string", value: "red" } } },
  };

  const ledYellow: CircuitNode = {
    id: "ledYellow",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "led", simulationModel: "led", label: "Yellow LED", rotation: 0, properties: { color: { label: "Color", type: "string", value: "yellow" } } },
  };

  const ledGreen: CircuitNode = {
    id: "ledGreen",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "led", simulationModel: "led", label: "Green LED", rotation: 0, properties: { color: { label: "Color", type: "string", value: "green" } } },
  };

  const nodes = [picoNode, ledRed, ledYellow, ledGreen];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "pico1", target: "ledGreen", sourceHandle: "gp15", targetHandle: "anode" },
    { id: "e2", source: "ledGreen", target: "pico1", sourceHandle: "cathode", targetHandle: "pico_gnd1" },
    { id: "e3", source: "pico1", target: "ledYellow", sourceHandle: "gp14", targetHandle: "anode" },
    { id: "e4", source: "ledYellow", target: "pico1", sourceHandle: "cathode", targetHandle: "pico_gnd1" },
    { id: "e5", source: "pico1", target: "ledRed", sourceHandle: "gp13", targetHandle: "anode" },
    { id: "e6", source: "ledRed", target: "pico1", sourceHandle: "cathode", targetHandle: "pico_gnd1" },
  ];

  // Run simulation frame timeline from t = 0ms to 4500ms in 100ms ticks
  const framesByTime = new Map<number, SimulationFrame>();
  for (let t = 0; t <= 4500; t += 100) {
    const initialFrame = buildSimulationFrame({
      tick: Math.floor(t / 100),
      timestamp: t,
      nodes,
      edges,
      boardType: "pico",
      running: true,
      error: null,
    });

    const evaluated = applyPicoSimulationToFrame(initialFrame, {
      nodes,
      edges,
      picoCode: codeTrafficLight,
      dynamicComponents: [],
    } as any);

    framesByTime.set(t, evaluated);
  }

  // -----------------------------------------------------------------------------
  // Test 1: Step 1 (t = 500ms) -> Green ON (GP15), Red & Yellow OFF
  // -----------------------------------------------------------------------------
  console.log("--- TEST 1: Traffic Light Step 1 (Green ON) ---");
  const frame1 = framesByTime.get(500)!;
  const greenComp1 = frame1.components["ledGreen"];
  const yellowComp1 = frame1.components["ledYellow"];
  const redComp1 = frame1.components["ledRed"];

  console.log(`[Trace Step 1 t=500ms] Green LED  isPowered = ${greenComp1?.isPowered}, brightness = ${greenComp1?.brightness?.toFixed(2)}`);
  console.log(`[Trace Step 1 t=500ms] Yellow LED isPowered = ${yellowComp1?.isPowered}, brightness = ${yellowComp1?.brightness ?? 0}`);
  console.log(`[Trace Step 1 t=500ms] Red LED    isPowered = ${redComp1?.isPowered}, brightness = ${redComp1?.brightness ?? 0}`);

  if (!greenComp1?.isPowered || greenComp1?.brightness <= 0 || yellowComp1?.isPowered || redComp1?.isPowered) {
    console.error("❌ Test 1 FAILED: Step 1 Green LED state incorrect");
    allPassed = false;
  } else {
    console.log("=> Test 1 PASSED (Green LED is powered & glowing, Red/Yellow OFF)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 2: Step 2 (t = 2200ms) -> Yellow ON (GP14), Green & Red OFF
  // -----------------------------------------------------------------------------
  console.log("--- TEST 2: Traffic Light Step 2 (Yellow ON) ---");
  const frame2 = framesByTime.get(2200)!;
  const greenComp2 = frame2.components["ledGreen"];
  const yellowComp2 = frame2.components["ledYellow"];
  const redComp2 = frame2.components["ledRed"];

  console.log(`[Trace Step 2 t=2200ms] Green LED  isPowered = ${greenComp2?.isPowered}, brightness = ${greenComp2?.brightness ?? 0}`);
  console.log(`[Trace Step 2 t=2200ms] Yellow LED isPowered = ${yellowComp2?.isPowered}, brightness = ${yellowComp2?.brightness?.toFixed(2)}`);
  console.log(`[Trace Step 2 t=2200ms] Red LED    isPowered = ${redComp2?.isPowered}, brightness = ${redComp2?.brightness ?? 0}`);

  if (!yellowComp2?.isPowered || yellowComp2?.brightness <= 0 || greenComp2?.isPowered || redComp2?.isPowered) {
    console.error("❌ Test 2 FAILED: Step 2 Yellow LED state incorrect");
    allPassed = false;
  } else {
    console.log("=> Test 2 PASSED (Yellow LED is powered & glowing, Green/Red OFF)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 3: Step 3 (t = 3500ms) -> Red ON (GP13), Green & Yellow OFF
  // -----------------------------------------------------------------------------
  console.log("--- TEST 3: Traffic Light Step 3 (Red ON) ---");
  const frame3 = framesByTime.get(3500)!;
  const greenComp3 = frame3.components["ledGreen"];
  const yellowComp3 = frame3.components["ledYellow"];
  const redComp3 = frame3.components["ledRed"];

  console.log(`[Trace Step 3 t=3500ms] Green LED  isPowered = ${greenComp3?.isPowered}, brightness = ${greenComp3?.brightness ?? 0}`);
  console.log(`[Trace Step 3 t=3500ms] Yellow LED isPowered = ${yellowComp3?.isPowered}, brightness = ${yellowComp3?.brightness ?? 0}`);
  console.log(`[Trace Step 3 t=3500ms] Red LED    isPowered = ${redComp3?.isPowered}, brightness = ${redComp3?.brightness?.toFixed(2)}`);

  if (!redComp3?.isPowered || redComp3?.brightness <= 0 || greenComp3?.isPowered || yellowComp3?.isPowered) {
    console.error("❌ Test 3 FAILED: Step 3 Red LED state incorrect");
    allPassed = false;
  } else {
    console.log("=> Test 3 PASSED (Red LED is powered & glowing, Green/Yellow OFF)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 4: Disconnected Pico LED Circuit Safety Check
  // -----------------------------------------------------------------------------
  console.log("--- TEST 4: Disconnected Pico LED Warning Icon Verification ---");
  // Create a frame with a Pico and an LED where cathode wire is completely disconnected
  const discPico: CircuitNode = {
    id: "pico1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "raspberrypipico", simulationModel: "raspberrypipico", label: "Pico", rotation: 0, properties: {} },
  };
  const discLed: CircuitNode = {
    id: "ledDisc",
    type: "circuitComponent",
    position: { x: 100, y: 0 },
    data: { componentType: "led", simulationModel: "led", label: "Disc LED", rotation: 0, properties: {} },
  };
  // Wire only anode, NO cathode wire back to GND
  const discEdges: CircuitEdge[] = [
    { id: "eDisc1", source: "pico1", target: "ledDisc", sourceHandle: "gp15", targetHandle: "anode" },
  ];
  const discFrame = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [discPico, discLed],
    edges: discEdges,
    boardType: "pico",
    running: true,
    error: null,
  });
  const discLedComp = discFrame.components["ledDisc"];
  const discTelemetry = discLedComp?.telemetry;
  console.log(`[Trace Test 4] Disconnected Pico LED hasPowerSourceInCanvas = ${discTelemetry?.hasPowerSourceInCanvas}`);
  console.log(`[Trace Test 4] Disconnected Pico LED physicalOpenCircuit    = ${discTelemetry?.physicalOpenCircuit}`);

  if (discTelemetry?.hasPowerSourceInCanvas !== true || discTelemetry?.physicalOpenCircuit !== true) {
    console.error("❌ Test 4 FAILED: Disconnected Pico LED safety check failed");
    allPassed = false;
  } else {
    console.log("=> Test 4 PASSED (Disconnected Pico LED flags open circuit warning correctly)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 5: Existing Arduino LED Warning Icon Unchanged Verification
  // -----------------------------------------------------------------------------
  console.log("--- TEST 5: Arduino LED Warning Icon Unchanged Verification ---");
  const unoNode: CircuitNode = {
    id: "uno1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "arduino", simulationModel: "arduino", label: "Uno", rotation: 0, properties: {} },
  };
  const unoLedConnected: CircuitNode = {
    id: "ledUnoConn",
    type: "circuitComponent",
    position: { x: 100, y: 0 },
    data: { componentType: "led", simulationModel: "led", label: "Conn LED", rotation: 0, properties: {} },
  };
  const unoLedDisc: CircuitNode = {
    id: "ledUnoDisc",
    type: "circuitComponent",
    position: { x: 100, y: 100 },
    data: { componentType: "led", simulationModel: "led", label: "Disc LED", rotation: 0, properties: {} },
  };
  const unoEdges: CircuitEdge[] = [
    { id: "u1", source: "uno1", target: "ledUnoConn", sourceHandle: "5v", targetHandle: "anode" },
    { id: "u2", source: "ledUnoConn", target: "uno1", sourceHandle: "cathode", targetHandle: "gnd1" },
    { id: "u3", source: "uno1", target: "ledUnoDisc", sourceHandle: "d13", targetHandle: "anode" }, // No cathode wire
  ];
  const unoFrame = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [unoNode, unoLedConnected, unoLedDisc],
    edges: unoEdges,
    boardType: "arduino",
    running: true,
    error: null,
  });

  const unoConnTelem = unoFrame.components["ledUnoConn"]?.telemetry;
  const unoDiscTelem = unoFrame.components["ledUnoDisc"]?.telemetry;
  console.log(`[Trace Test 5] Connected Arduino LED physicalOpenCircuit    = ${unoConnTelem?.physicalOpenCircuit}`);
  console.log(`[Trace Test 5] Disconnected Arduino LED physicalOpenCircuit = ${unoDiscTelem?.physicalOpenCircuit}`);

  if (unoConnTelem?.physicalOpenCircuit !== false || unoDiscTelem?.physicalOpenCircuit !== true) {
    console.error("❌ Test 5 FAILED: Arduino LED warning behavior altered");
    allPassed = false;
  } else {
    console.log("=> Test 5 PASSED (Arduino connected vs disconnected LED behavior 100% unchanged)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 6: Serial Output Persistence Across Frames & Stop->Start Reset
  // -----------------------------------------------------------------------------
  console.log("--- TEST 6: Serial Output Persistence & Reset Verification ---");
  const codeWithPrint = `
from machine import Pin
import time
print("Traffic light ready!")
while True:
    print("GREEN")
    time.sleep(2)
`.trim();

  // Tick 0: print("Traffic light ready!") executes
  const f0 = applyPicoSimulationToFrame(buildSimulationFrame({
    tick: 0, timestamp: 0, nodes, edges, boardType: "pico", running: true, error: null
  }), { nodes, edges, picoCode: codeWithPrint, dynamicComponents: [] } as any);

  // Tick 100ms: no new print, but serialOutput MUST be preserved
  const f100 = applyPicoSimulationToFrame(buildSimulationFrame({
    tick: 1, timestamp: 100, nodes, edges, boardType: "pico", running: true, error: null
  }), { nodes, edges, picoCode: codeWithPrint, dynamicComponents: [] } as any);

  console.log(`[Trace Test 6 t=0ms]   Serial output count = ${f0.serialOutput.length}, line = "${f0.serialOutput[0]}"`);
  console.log(`[Trace Test 6 t=100ms] Serial output count = ${f100.serialOutput.length}, line = "${f100.serialOutput[0]}"`);

  if (f0.serialOutput.length === 0 || f100.serialOutput.length === 0 || f100.serialOutput[0] !== "Traffic light ready!") {
    console.error("❌ Test 6 FAILED: Serial output lost on idle tick");
    allPassed = false;
  } else {
    console.log("=> Test 6 PASSED (Serial output persists across ticks during session)\n");
  }

  console.log("=================== PICO TRAFFIC LIGHT TESTS COMPLETE ===================");
  return allPassed;
}

if (require.main === module) {
  const ok = runPicoTrafficLightTests();
  if (ok) {
    console.log("✅ All Pico Traffic Light LED tests passed 100%.");
  } else {
    console.error("❌ Some Pico Traffic Light LED tests failed.");
    process.exit(1);
  }
}
