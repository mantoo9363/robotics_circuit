/**
 * Permanent Regression Test Suite for Pico Keypad-LCD Connection & Dynamic Input Resolution
 */

import { getOrCreateSession } from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runPicoKeypadLcdTests(): boolean {
  console.log("=================== RUNNING PICO KEYPAD-LCD TESTS ===================\n");

  let passed = true;

  // 1. Define nodes and edges representing the physical connections
  const picoNode: CircuitNode = {
    id: "pico1",
    type: "raspberrypipico",
    data: {
      componentType: "raspberrypipico",
      simulationModel: "raspberrypipico",
      label: "Pico",
      rotation: 0,
      properties: {},
    },
    position: { x: 0, y: 0 },
  };

  const keypadNode: CircuitNode = {
    id: "keypad1",
    type: "keypad4x4",
    data: {
      componentType: "keypad4x4",
      label: "Keypad",
      rotation: 0,
      properties: {
        pressedKeys: {
          label: "Pressed Keys",
          type: "string",
          value: "1", // Key "1" is pressed, connecting Row 1 to Column 1 (gp2 to gp6)
        },
      },
    },
    position: { x: 200, y: 0 },
  };

  const edges: CircuitEdge[] = [
    { id: "e1", source: "pico1", sourceHandle: "gp2", target: "keypad1", targetHandle: "row1" },
    { id: "e2", source: "pico1", sourceHandle: "gp6", target: "keypad1", targetHandle: "column1" },
  ];

  // Set the store state so resolveDynamicPinValue can query the active circuit
  useCircuitStore.setState({
    nodes: [picoNode, keypadNode],
    edges,
    simulationStatus: "running",
  });

  // 2. Test A: Read GP6 (which is wired). Expect: 1
  const codeA = `
from machine import Pin
r = Pin(2, Pin.OUT)
r.high()
c = Pin(6, Pin.IN)
val = c.value()
`.trim();

  const sessionA = getOrCreateSession(codeA, 0);
  const valA = sessionA.variables.get("val");

  console.log(`[Trace Test A] GP2 Output State: ${sessionA.pins.get(2)?.value} (Expected: 255)`);
  console.log(`[Trace Test A] GP6 c.value() resolved value: ${valA} (Expected: 1)`);

  if (valA !== 1) {
    console.error(`❌ Test A FAILED: GP6 did not resolve to 1.`);
    passed = false;
  } else {
    console.log("=> Test A PASSED (Wired pin resolved correctly to 1)");
  }

  // 3. Test B: Read GP11 (which is NOT wired in edges). Expect: 0
  const codeB = `
from machine import Pin
r = Pin(2, Pin.OUT)
r.high()
c = Pin(11, Pin.IN)
val = c.value()
`.trim();

  const sessionB = getOrCreateSession(codeB, 0);
  const valB = sessionB.variables.get("val");

  console.log(`[Trace Test B] GP11 c.value() resolved value: ${valB} (Expected: 0)`);

  if (valB !== 0) {
    console.error(`❌ Test B FAILED: GP11 resolved to ${valB} (Expected: 0) when it was not connected.`);
    passed = false;
  } else {
    console.log("=> Test B PASSED (Disconnected pin GP11 resolved correctly to 0)");
  }

  return passed;
}

if (require.main === module) {
  const ok = runPicoKeypadLcdTests();
  if (ok) {
    console.log("✅ All Pico Keypad-LCD tests passed 100%.");
  } else {
    console.error("❌ Pico Keypad-LCD tests failed.");
    process.exit(1);
  }
}
