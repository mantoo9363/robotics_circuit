/**
 * Permanent Regression Test Suite for Flex Sensor simulation frame transformer.
 * Verifies that applyFlexSensorInputToFrame parses arduinoCode and successfully writes
 * flex sensor mapped analog pins to the board pins state.
 */

import { useCircuitStore } from "../lib/store";
import { applyFlexSensorInputToFrame } from "../lib/simulation/frameTransformers/flexSensor";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import { validateComponentConnections } from "../utils/connectivity";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runFlexSensorTests(): boolean {
  console.log("=================== RUNNING FLEX SENSOR REGRESSION TESTS ===================\n");

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

  const flexNode: CircuitNode = {
    id: "flex1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "flexSensor",
      simulationModel: "flexSensor",
      label: "Flex Sensor",
      rotation: 0,
      properties: {
        bend: { value: 90, label: "Bend", type: "number", min: 0, max: 180 }
      } as any,
    },
  };

  const edges: CircuitEdge[] = [
    { id: "e1", source: "flex1", sourceHandle: "pin1", target: "uno1", targetHandle: "5v" },
    { id: "e2", source: "flex1", sourceHandle: "pin2", target: "uno1", targetHandle: "a0" },
    { id: "e3", source: "flex1", sourceHandle: "pin2", target: "uno1", targetHandle: "gnd" },
  ];

  const arduinoCode = `
    const int flexPin = A0;
    const int ledPin = 9;
    void setup() {
      pinMode(ledPin, OUTPUT);
    }
    void loop() {
      int val = analogRead(flexPin);
      int brightness = map(val, 0, 1023, 0, 255);
      analogWrite(ledPin, brightness);
    }
  `.trim();

  // Set the store state
  useCircuitStore.setState({
    nodes: [unoNode, flexNode],
    edges,
    arduinoCode,
    simulationStatus: "running"
  });

  const connVal = validateComponentConnections(flexNode, [unoNode, flexNode], edges);
  console.log(`[Test trace] validateComponentConnections return value: ${connVal}`);

  const frameRaw = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, flexNode],
    edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  try {
    const transformedFrame = applyFlexSensorInputToFrame(frameRaw);

    const pin14State = transformedFrame.boardPins.find(p => p.pin === 14); // A0 is pin 14
    console.log(`[Trace Flex Sensor] A0 (pin 14) value = ${pin14State?.value}, mode = ${pin14State?.mode}`);

    // Expect analog value for bend 90° -> mapped scale: 0.5 * 1023 = 511.5
    // 8-bit board pin value: 0.5 * 255 = 127.5 -> ~128
    if (!pin14State || pin14State.mode !== "INPUT" || Math.abs(pin14State.value - 128) > 2) {
      console.error("FAIL: A0 pin was not updated correctly from flex sensor mapped pins", pin14State);
      passed = false;
    } else {
      console.log("=> Flex Sensor value propagation test PASSED\n");
    }
  } catch (error) {
    console.error("FAIL: applyFlexSensorInputToFrame threw an error:", error);
    passed = false;
  }

  console.log("=================== FLEX SENSOR REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runFlexSensorTests();
  if (success) {
    console.log("✅ All flex sensor regression tests passed successfully.");
  } else {
    console.error("❌ Some flex sensor regression tests failed.");
    process.exit(1);
  }
}
