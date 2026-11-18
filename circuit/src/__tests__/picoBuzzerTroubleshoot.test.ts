/**
 * Permanent Regression Test Suite for Pico Buzzer Troubleshooting.
 * Verifies that:
 * 1. Under active zone (distance < 50), the buzzer turns ON if wired to GP20.
 * 2. Under safe zone (distance > 150), the buzzer turns OFF.
 * 3. Under pin mismatch (wired to GP19, code drives Pin 20), the buzzer remains OFF.
 */

import { useCircuitStore } from "../lib/store";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { PinState } from "../lib/arduino-simulator";

export function runPicoBuzzerTroubleshootTests(): boolean {
  console.log("=================== RUNNING PICO BUZZER TROUBLESHOOT TESTS ===================\n");

  let passed = true;

  const picoNode: CircuitNode = {
    id: "pico1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "raspberrypipico",
      simulationModel: "raspberrypipico",
      label: "Pico",
      rotation: 0,
      properties: {} as any,
    },
  };

  const ultraNode: CircuitNode = {
    id: "ultra1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "ultrasonicDistance",
      simulationModel: "ultrasonicDistance",
      label: "Ultrasonic",
      rotation: 0,
      properties: {
        distance: { value: 40, label: "Distance", type: "number", min: 2, max: 400 }
      } as any,
    },
  };

  const piezoNode: CircuitNode = {
    id: "piezo1",
    type: "circuitComponent",
    position: { x: 200, y: 200 },
    data: {
      componentType: "piezo",
      simulationModel: "piezo",
      label: "Buzzer",
      rotation: 0,
      properties: {} as any,
    },
  };

  // Case 1 & 2: Wired to GP20
  const edgesWiredGP20: CircuitEdge[] = [
    { id: "e1", source: "ultra1", sourceHandle: "trigger", target: "pico1", targetHandle: "gp10" },
    { id: "e2", source: "ultra1", sourceHandle: "echo", target: "pico1", targetHandle: "gp11" },
    { id: "e3", source: "piezo1", sourceHandle: "positive", target: "pico1", targetHandle: "gp20" },
    { id: "e4", source: "piezo1", sourceHandle: "negative", target: "pico1", targetHandle: "pico_gnd1" },
  ];

  // Case 3: Wired to GP19 (Mismatch)
  const edgesWiredGP19: CircuitEdge[] = [
    { id: "e1", source: "ultra1", sourceHandle: "trigger", target: "pico1", targetHandle: "gp10" },
    { id: "e2", source: "ultra1", sourceHandle: "echo", target: "pico1", targetHandle: "gp11" },
    { id: "e3", source: "piezo1", sourceHandle: "positive", target: "pico1", targetHandle: "gp19" },
    { id: "e4", source: "piezo1", sourceHandle: "negative", target: "pico1", targetHandle: "pico_gnd1" },
  ];

  const code = `
    from machine import Pin, time_pulse_us
    trig = Pin(10, Pin.OUT)
    echo = Pin(11, Pin.IN)
    buzzer = Pin(20, Pin.OUT)
    duration = time_pulse_us(echo, 1, 30000)
    distance = duration * 0.0343 / 2
    if distance < 50:
        buzzer.on()
    else:
        buzzer.off()
  `;

  // --- Case 1: Distance = 40 (< 50) and Wired to GP20 -> Buzzer ON ---
  console.log("--- Case 1: Active Zone (Distance = 40, Wired to GP20) ---");
  ultraNode.data.properties.distance.value = 40;

  useCircuitStore.setState({
    nodes: [picoNode, ultraNode, piezoNode],
    edges: edgesWiredGP20,
    picoCode: code,
    simulationStatus: "running"
  });

  const mockPinsCase1 = new Map<number, PinState>();
  mockPinsCase1.set(20, { mode: "OUTPUT", value: 255 });

  const frame1 = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [picoNode, ultraNode, piezoNode],
    edges: edgesWiredGP20,
    boardType: "pico",
    arduinoState: {
      pins: mockPinsCase1,
      serialOutput: [],
      running: true,
      error: null,
    },
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const buzzerState1 = frame1.components["piezo1"];
  console.log(`[Trace Case 1] Buzzer isPowered: ${buzzerState1?.isPowered}`);

  if (!buzzerState1 || !buzzerState1.isPowered) {
    console.error("FAIL: Buzzer did not turn ON when active and correctly wired", buzzerState1);
    passed = false;
  } else {
    console.log("=> Case 1 PASSED (Buzzer is powered)");
  }

  // --- Case 2: Distance = 200 (> 150) and Wired to GP20 -> Buzzer OFF ---
  console.log("\n--- Case 2: Safe Zone (Distance = 200, Wired to GP20) ---");
  ultraNode.data.properties.distance.value = 200;

  const mockPinsCase2 = new Map<number, PinState>();
  mockPinsCase2.set(20, { mode: "OUTPUT", value: 0 });

  const frame2 = buildSimulationFrame({
    tick: 2,
    timestamp: 200,
    nodes: [picoNode, ultraNode, piezoNode],
    edges: edgesWiredGP20,
    boardType: "pico",
    arduinoState: {
      pins: mockPinsCase2,
      serialOutput: [],
      running: true,
      error: null,
    },
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const buzzerState2 = frame2.components["piezo1"];
  console.log(`[Trace Case 2] Buzzer isPowered: ${buzzerState2?.isPowered}`);

  if (buzzerState2 && buzzerState2.isPowered) {
    console.error("FAIL: Buzzer did not turn OFF in safe zone", buzzerState2);
    passed = false;
  } else {
    console.log("=> Case 2 PASSED (Buzzer is unpowered)");
  }

  // --- Case 3: Distance = 40 and Wired to GP19 (Mismatch) -> Buzzer OFF ---
  console.log("\n--- Case 3: Pin Mismatch (Distance = 40, Wired to GP19, Driven on Pin 20) ---");
  ultraNode.data.properties.distance.value = 40;

  useCircuitStore.setState({
    nodes: [picoNode, ultraNode, piezoNode],
    edges: edgesWiredGP19,
    picoCode: code,
    simulationStatus: "running"
  });

  const frame3 = buildSimulationFrame({
    tick: 3,
    timestamp: 300,
    nodes: [picoNode, ultraNode, piezoNode],
    edges: edgesWiredGP19,
    boardType: "pico",
    arduinoState: {
      pins: mockPinsCase1, // drives pin 20
      serialOutput: [],
      running: true,
      error: null,
    },
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const buzzerState3 = frame3.components["piezo1"];
  console.log(`[Trace Case 3] Buzzer isPowered: ${buzzerState3?.isPowered}`);

  if (buzzerState3 && buzzerState3.isPowered) {
    console.error("FAIL: Buzzer turned ON despite pin mismatch", buzzerState3);
    passed = false;
  } else {
    console.log("=> Case 3 PASSED (Buzzer is correctly silent due to mismatch)");
  }

  console.log("\n=================== PICO BUZZER TROUBLESHOOT TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runPicoBuzzerTroubleshootTests();
  if (success) {
    console.log("✅ All pico buzzer troubleshoot tests passed successfully.");
  } else {
    console.error("❌ Some pico buzzer troubleshoot tests failed.");
    process.exit(1);
  }
}
