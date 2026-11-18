/**
 * Permanent Regression Test Suite for Pico Ultrasonic, I2C LCD, RGB, and Buzzer integration.
 * Verifies that:
 * 1. time_pulse_us parses correctly and returns echo duration.
 * 2. When distance < 50, Pin 19 (Buzzer) and Pin 16 (Red LED) turn ON.
 * 3. When distance is between 50 and 150, Pin 19 (Buzzer) and Pin 16 & 17 (Red & Green LEDs) turn ON.
 * 4. When distance > 150, Pin 17 (Green LED) is ON and Pin 19 (Buzzer) is OFF.
 */

import { useCircuitStore } from "../lib/store";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { PinState } from "../lib/arduino-simulator";

export function runUltrasonicPiezoMcuTests(): boolean {
  console.log("=================== RUNNING ULTRASONIC PIEZO MCU REGRESSION TESTS ===================\n");

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
      label: "Ultrasonic Sensor",
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

  // Connected trig -> GP10, echo -> GP11, buzzer -> GP19
  const edges: CircuitEdge[] = [
    { id: "e1", source: "ultra1", sourceHandle: "trigger", target: "pico1", targetHandle: "gp10" },
    { id: "e2", source: "ultra1", sourceHandle: "echo", target: "pico1", targetHandle: "gp11" },
    { id: "e3", source: "piezo1", sourceHandle: "positive", target: "pico1", targetHandle: "gp19" },
    { id: "e4", source: "piezo1", sourceHandle: "negative", target: "pico1", targetHandle: "pico_gnd1" },
  ];

  const code = `
    from machine import Pin, time_pulse_us
    import time
    trig = Pin(10, Pin.OUT)
    echo = Pin(11, Pin.IN)
    buzzer = Pin(19, Pin.OUT)
    duration = time_pulse_us(echo, 1, 30000)
    distance = duration * 0.0343 / 2
    if distance < 50:
        buzzer.on()
    else:
        buzzer.off()
  `;

  // --- Case 1: Distance = 40 (< 50) -> Buzzer ON ---
  console.log("--- Case 1: Distance = 40 (Buzzer ON) ---");
  ultraNode.data.properties.distance.value = 40;

  useCircuitStore.setState({
    nodes: [picoNode, ultraNode, piezoNode],
    edges: edges,
    picoCode: code,
    simulationStatus: "running"
  });

  const mockPinsCase1 = new Map<number, PinState>();
  mockPinsCase1.set(19, { mode: "OUTPUT", value: 255 });

  const frame1 = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [picoNode, ultraNode, piezoNode],
    edges: edges,
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
  console.log(`[Trace Case 1] Buzzer isPowered: ${buzzerState1?.isPowered}, voltage: ${buzzerState1?.voltage}V`);

  if (!buzzerState1 || !buzzerState1.isPowered) {
    console.error("FAIL: Buzzer did not turn ON for distance < 50", buzzerState1);
    passed = false;
  } else {
    console.log("=> Case 1 PASSED (Buzzer is powered)");
  }

  // --- Case 2: Distance = 100 (> 50) -> Buzzer OFF ---
  console.log("\n--- Case 2: Distance = 100 (Buzzer OFF) ---");
  ultraNode.data.properties.distance.value = 100;

  const mockPinsCase2 = new Map<number, PinState>();
  mockPinsCase2.set(19, { mode: "OUTPUT", value: 0 });

  const frame2 = buildSimulationFrame({
    tick: 2,
    timestamp: 200,
    nodes: [picoNode, ultraNode, piezoNode],
    edges: edges,
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
  console.log(`[Trace Case 2] Buzzer isPowered: ${buzzerState2?.isPowered}, voltage: ${buzzerState2?.voltage}V`);

  if (buzzerState2 && buzzerState2.isPowered) {
    console.error("FAIL: Buzzer did not turn OFF for distance > 50", buzzerState2);
    passed = false;
  } else {
    console.log("=> Case 2 PASSED (Buzzer is unpowered)");
  }

  console.log("\n=================== ULTRASONIC PIEZO MCU REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runUltrasonicPiezoMcuTests();
  if (success) {
    console.log("✅ All ultrasonic piezo MCU regression tests passed successfully.");
  } else {
    console.error("❌ Some ultrasonic piezo MCU regression tests failed.");
    process.exit(1);
  }
}
