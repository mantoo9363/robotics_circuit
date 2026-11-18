/**
 * Permanent Regression Test Suite for Potentiometer simulation frame transformer.
 * Verifies that applyPotentiometerInputToFrame parses arduinoCode without throwing
 * ReferenceError and successfully writes potentiometer mapped analog pins to the board pins state.
 */

import { useCircuitStore } from "../lib/store";
import { applyPotentiometerInputToFrame } from "../lib/simulation/frameTransformers/photoresistorPotentiometer";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import { validateComponentConnections } from "../utils/connectivity";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runPotentiometerTests(): boolean {
  console.log("=================== RUNNING POTENTIOMETER REGRESSION TESTS ===================\n");

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

  const potNode: CircuitNode = {
    id: "pot1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "potentiometer",
      simulationModel: "potentiometer",
      label: "Potentiometer",
      rotation: 0,
      properties: {
        position: { value: 80, label: "Position", type: "number", min: 0, max: 100 }
      } as any,
    },
  };

  const edges: CircuitEdge[] = [
    { id: "e1", source: "pot1", sourceHandle: "pin1", target: "uno1", targetHandle: "5v" },
    { id: "e2", source: "pot1", sourceHandle: "pin3", target: "uno1", targetHandle: "gnd1" },
    { id: "e3", source: "pot1", sourceHandle: "wiper", target: "uno1", targetHandle: "a0" },
  ];

  const arduinoCode = `
    const int potPin = A0;
    const int ledPin = 9;
    void setup() {
      pinMode(ledPin, OUTPUT);
    }
    void loop() {
      int val = analogRead(potPin);
      int brightness = map(val, 0, 1023, 0, 255);
      analogWrite(ledPin, brightness);
    }
  `.trim();

  // Set the store state
  useCircuitStore.setState({
    nodes: [unoNode, potNode],
    edges,
    arduinoCode,
    simulationStatus: "running"
  });

  const connVal = validateComponentConnections(potNode, [unoNode, potNode], edges);
  console.log(`[Test trace] validateComponentConnections return value: ${connVal}`);

  const frameRaw = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, potNode],
    edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  try {
    const transformedFrame = applyPotentiometerInputToFrame(frameRaw);

    const pin9State = transformedFrame.boardPins.find(p => p.pin === 9);
    console.log(`[Trace Potentiometer] Pin 9 value = ${pin9State?.value}, mode = ${pin9State?.mode}`);

    if (!pin9State || pin9State.mode !== "OUTPUT" || Math.abs(pin9State.value - 204) > 10) {
      console.error("FAIL: Pin 9 (analogWrite destination) was not updated correctly from potentiometer mapped pins", pin9State);
      passed = false;
    } else {
      console.log("=> Potentiometer value propagation test PASSED\n");
    }
  } catch (error) {
    console.error("FAIL: applyPotentiometerInputToFrame threw an error:", error);
    passed = false;
  }

  console.log("=================== POTENTIOMETER REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runPotentiometerTests();
  if (success) {
    console.log("✅ All potentiometer regression tests passed successfully.");
  } else {
    console.error("❌ Some potentiometer regression tests failed.");
    process.exit(1);
  }
}
