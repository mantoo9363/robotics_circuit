/**
 * Permanent Regression Test Suite for Soil Moisture LED driver fallback logic.
 * Verifies that applySoilMoistureInputToFrame:
 * 1. Does NOT drive a default pin (Pin 8) if no ledPin constant is defined and no LED component exists in the editor.
 * 2. Drives the correct pin if an LED component is connected in the editor.
 * 3. Drives the correct pin if a ledPin constant is defined in the Arduino code.
 */

import { useCircuitStore } from "../lib/store";
import { applySoilMoistureInputToFrame } from "../lib/simulation/frameTransformers/temperatureSoil";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runSoilMoistureLedTests(): boolean {
  console.log("=================== RUNNING SOIL MOISTURE LED REGRESSION TESTS ===================\n");

  let passed = true;

  const unoNode: CircuitNode = {
    id: "uno1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "arduino",
      simulationModel: "arduino",
      label: "Uno",
      rotation: 0,
      properties: {} as any,
    },
  };

  const soilNode: CircuitNode = {
    id: "soil1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "soilMoisture",
      simulationModel: "soilMoisture",
      label: "Soil Sensor",
      rotation: 0,
      properties: {
        moisture: { value: 100, label: "Moisture", type: "number", min: 0, max: 1023 }
      } as any,
    },
  };

  // VCC connected to 5v, GND connected to gnd1, SIG connected to a0
  const baseEdges: CircuitEdge[] = [
    { id: "e1", source: "soil1", sourceHandle: "vcc1", target: "uno1", targetHandle: "5v" },
    { id: "e2", source: "soil1", sourceHandle: "gnd1", target: "uno1", targetHandle: "gnd1" },
    { id: "e3", source: "soil1", sourceHandle: "sig1", target: "uno1", targetHandle: "a0" },
  ];

  // -----------------------------------------------------------------------------
  // Case 1: No constants defined, no LED component exists in editor
  // -----------------------------------------------------------------------------
  console.log("--- Case 1: No constants, no LED component in editor ---");
  const codeCase1 = `
    void setup() {
      Serial.begin(9600);
    }
    void loop() {
      int val = analogRead(A0);
      Serial.println(val);
    }
  `.trim();

  useCircuitStore.setState({
    nodes: [unoNode, soilNode],
    edges: baseEdges,
    arduinoCode: codeCase1,
    simulationStatus: "running"
  });

  const frameRaw1 = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, soilNode],
    edges: baseEdges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const transformedFrame1 = applySoilMoistureInputToFrame(frameRaw1);
  const pin8State = transformedFrame1.boardPins.find(p => p.pin === 8);
  console.log(`[Trace Case 1] Pin 8 state = ${pin8State ? `${pin8State.mode}:${pin8State.value}` : "undefined"}`);

  if (pin8State && pin8State.mode === "OUTPUT") {
    console.error("FAIL: Pin 8 was driven as OUTPUT even though no LED constant or component was defined/added!");
    passed = false;
  } else {
    console.log("=> Case 1 PASSED (no default pin was driven)\n");
  }

  // -----------------------------------------------------------------------------
  // Case 2: No constants defined, but LED component is connected in editor to Pin 13
  // -----------------------------------------------------------------------------
  console.log("--- Case 2: No constants, but LED component is connected to Pin 13 ---");
  const ledNode: CircuitNode = {
    id: "led1",
    type: "circuitComponent",
    position: { x: 400, y: 0 },
    data: {
      componentType: "led",
      simulationModel: "led",
      label: "LED",
      rotation: 0,
      properties: {} as any,
    },
  };

  const case2Edges = [
    ...baseEdges,
    { id: "e4", source: "led1", sourceHandle: "anode", target: "uno1", targetHandle: "d13" },
    { id: "e5", source: "led1", sourceHandle: "cathode", target: "uno1", targetHandle: "gnd2" },
  ];

  // Set moisture value to 20 so that isLedHigh (moistureScaled < 40) is true
  const soilNodeLowMoisture = {
    ...soilNode,
    data: {
      ...soilNode.data,
      properties: {
        moisture: { value: 20, label: "Moisture", type: "number", min: 0, max: 1023 }
      } as any,
    }
  };

  useCircuitStore.setState({
    nodes: [unoNode, soilNodeLowMoisture, ledNode],
    edges: case2Edges,
    arduinoCode: codeCase1,
    simulationStatus: "running"
  });

  const frameRaw2 = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, soilNodeLowMoisture, ledNode],
    edges: case2Edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const transformedFrame2 = applySoilMoistureInputToFrame(frameRaw2);
  const pin13State = transformedFrame2.boardPins.find(p => p.pin === 13);
  console.log(`[Trace Case 2] Pin 13 state = ${pin13State ? `${pin13State.mode}:${pin13State.value}` : "undefined"}`);

  if (!pin13State || pin13State.mode !== "OUTPUT" || pin13State.value !== 255) {
    console.error("FAIL: Pin 13 was not driven as OUTPUT/HIGH based on LED component connectivity", pin13State);
    passed = false;
  } else {
    console.log("=> Case 2 PASSED (LED pin detected from connectivity and driven)\n");
  }

  // -----------------------------------------------------------------------------
  // Case 3: ledPin constant is defined in Arduino code as Pin 6
  // -----------------------------------------------------------------------------
  console.log("--- Case 3: ledPin constant defined in Arduino code as Pin 6 ---");
  const codeCase3 = `
    const int ledPin = 6;
    void setup() {
      pinMode(ledPin, OUTPUT);
    }
    void loop() {
      int val = analogRead(A0);
      if (val < 400) {
        digitalWrite(ledPin, HIGH);
      } else {
        digitalWrite(ledPin, LOW);
      }
    }
  `.trim();

  useCircuitStore.setState({
    nodes: [unoNode, soilNode],
    edges: baseEdges,
    arduinoCode: codeCase3,
    simulationStatus: "running"
  });

  const frameRaw3 = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, soilNode],
    edges: baseEdges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const transformedFrame3 = applySoilMoistureInputToFrame(frameRaw3);
  const pin6State = transformedFrame3.boardPins.find(p => p.pin === 6);
  console.log(`[Trace Case 3] Pin 6 state = ${pin6State ? `${pin6State.mode}:${pin6State.value}` : "undefined"}`);

  if (!pin6State || pin6State.mode !== "OUTPUT" || pin6State.value !== 255) {
    console.error("FAIL: Pin 6 (defined in code) was not driven correctly", pin6State);
    passed = false;
  } else {
    console.log("=> Case 3 PASSED (LED pin resolved from constants and driven)\n");
  }

  console.log("=================== SOIL MOISTURE LED REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runSoilMoistureLedTests();
  if (success) {
    console.log("✅ All soil moisture LED regression tests passed successfully.");
  } else {
    console.error("❌ Some soil moisture LED regression tests failed.");
    process.exit(1);
  }
}
