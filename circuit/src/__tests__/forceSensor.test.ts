/**
 * Permanent Regression Test Suite for Force Sensor simulation frame transformer.
 * Verifies that applyForceSensorInputToFrame parses arduinoCode without throwing
 * and successfully propagates force value to the board pins state.
 */

import { useCircuitStore } from "../lib/store";
import { applyForceSensorInputToFrame } from "../lib/simulation/frameTransformers/gasForce";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import { validateComponentConnections } from "../utils/connectivity";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runForceSensorTests(): boolean {
  console.log("=================== RUNNING FORCE SENSOR REGRESSION TESTS ===================\n");

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

  const forceNode: CircuitNode = {
    id: "force1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "forceSensor",
      simulationModel: "forceSensor",
      label: "Force Sensor",
      rotation: 0,
      properties: {
        force: { value: 5.0, label: "Force", type: "number", min: 0, max: 10 }
      } as any,
    },
  };

  const edges: CircuitEdge[] = [
    { id: "e1", source: "force1", sourceHandle: "pin1", target: "uno1", targetHandle: "5v" },
    { id: "e2", source: "force1", sourceHandle: "pin2", target: "uno1", targetHandle: "a0" },
    { id: "e3", source: "force1", sourceHandle: "pin2", target: "uno1", targetHandle: "gnd1" },
  ];

  const arduinoCode = `
    const int forcePin = A0;
    void setup() {
      Serial.begin(9600);
    }
    void loop() {
      int val = analogRead(forcePin);
      Serial.println(val);
    }
  `.trim();

  // Set the store state
  useCircuitStore.setState({
    nodes: [unoNode, forceNode],
    edges,
    arduinoCode,
    simulationStatus: "running"
  });

  const connVal = validateComponentConnections(forceNode, [unoNode, forceNode], edges);
  console.log(`[Test trace] validateComponentConnections return value: ${connVal}`);

  const frameRaw = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, forceNode],
    edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  try {
    const transformedFrame = applyForceSensorInputToFrame(frameRaw);

    const pinA0State = transformedFrame.boardPins.find(p => p.pin === 14); // A0 is pin 14 on Uno
    console.log(`[Trace Force] A0 value = ${pinA0State?.value}, mode = ${pinA0State?.mode}`);

    // 5N is 50% of 10N -> value in boardPins should map to around 128 (out of 255)
    if (!pinA0State || Math.abs(pinA0State.value - 128) > 5) {
      console.error("FAIL: Pin A0 was not updated correctly from force sensor value", pinA0State);
      passed = false;
    } else {
      console.log("=> Force sensor value propagation test PASSED\n");
    }
  } catch (error) {
    console.error("FAIL: applyForceSensorInputToFrame threw an error:", error);
    passed = false;
  }

  console.log("=================== FORCE SENSOR REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runForceSensorTests();
  if (success) {
    console.log("✅ All force sensor regression tests passed successfully.");
  } else {
    console.error("❌ Some force sensor regression tests failed.");
    process.exit(1);
  }
}
