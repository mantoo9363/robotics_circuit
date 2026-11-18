/**
 * Permanent Regression Test Suite for Seven Segment Display simulation.
 * Verifies that applySevenSegmentInputToFrame frame transformer correctly computes
 * illuminated segments based on Common Cathode and Common Anode electrical states.
 */

import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import { applySevenSegmentInputToFrame } from "../lib/simulation/frameTransformers/sevenSegment";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runSevenSegmentTests(): boolean {
  console.log("=================== RUNNING SEVEN SEGMENT REGRESSION TESTS ===================\n");

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

  const picoNode: CircuitNode = {
    id: "pico1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "raspberrypipico",
      simulationModel: "raspberrypipico",
      label: "Raspberry Pi Pico",
      rotation: 0,
      properties: {} as any,
    },
  };

  const segmentNode: CircuitNode = {
    id: "disp1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "sevenSegment",
      simulationModel: "sevenSegment",
      label: "7-Segment Display",
      rotation: 0,
      properties: {
        name: { label: "Name", type: "string", value: "DISP1" },
        displayType: {
          label: "Type",
          type: "select",
          value: "Common Cathode",
          options: ["Common Cathode", "Common Anode"],
        },
        color: {
          label: "Color",
          type: "select",
          value: "red",
          options: ["red", "green", "blue", "yellow", "white"],
        },
      } as any,
    },
  };

  // Wire up: Arduino pins D2-D11 to display com1, com2, a-g, dp
  const edges: CircuitEdge[] = [
    { id: "e_com1", source: "uno1", sourceHandle: "d2", target: "disp1", targetHandle: "com1" },
    { id: "e_com2", source: "uno1", sourceHandle: "d3", target: "disp1", targetHandle: "com2" },
    { id: "e_a", source: "uno1", sourceHandle: "d4", target: "disp1", targetHandle: "a" },
    { id: "e_b", source: "uno1", sourceHandle: "d5", target: "disp1", targetHandle: "b" },
    { id: "e_c", source: "uno1", sourceHandle: "d6", target: "disp1", targetHandle: "c" },
    { id: "e_d", source: "uno1", sourceHandle: "d7", target: "disp1", targetHandle: "d" },
    { id: "e_e", source: "uno1", sourceHandle: "d8", target: "disp1", targetHandle: "e" },
    { id: "e_f", source: "uno1", sourceHandle: "d9", target: "disp1", targetHandle: "f" },
    { id: "e_g", source: "uno1", sourceHandle: "d10", target: "disp1", targetHandle: "g" },
    { id: "e_dp", source: "uno1", sourceHandle: "d11", target: "disp1", targetHandle: "dp" },
  ];

  // Mock pin mapping for state check:
  // pins: com1=2, com2=3, a=4, b=5, c=6, d=7, e=8, f=9, g=10, dp=11
  const mockPins = new Map<number, { mode: 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP' | 'UNSET'; value: number }>();
  for (let p = 2; p <= 11; p++) {
    mockPins.set(p, { mode: 'OUTPUT', value: 0 }); // Default all LOW (0V)
  }

  const mockArduinoState = {
    pins: mockPins,
    serialOutput: [],
    running: true,
    error: null,
  };

  const mockContext = {
    nodes: [unoNode, segmentNode],
    edges,
    arduinoCode: "",
    picoCode: "",
    dynamicComponents: COMPONENT_CATALOG,
    boardType: "arduino" as const,
  };

  // -------------------------------------------------------------
  // Test 1: Common Cathode - Active Low COM1, Active High Segments
  // -------------------------------------------------------------
  console.log("--- TEST 1: Common Cathode Mode ---");
  // CC setup: com1 (D2) = LOW (0), com2 (D3) = HIGH (255) (inactive)
  // seg a (D4) = HIGH (255), seg b (D5) = LOW (0), dp (D11) = HIGH (255)
  mockPins.get(2)!.value = 0; // com1 LOW
  mockPins.get(3)!.value = 255; // com2 HIGH
  mockPins.get(4)!.value = 255; // a HIGH
  mockPins.get(5)!.value = 0; // b LOW
  mockPins.get(11)!.value = 255; // dp HIGH

  let rawFrame = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, segmentNode],
    edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
    arduinoState: mockArduinoState as any,
  });

  let frame = applySevenSegmentInputToFrame(rawFrame, mockContext as any);

  let telemetry = frame.components[segmentNode.id]?.telemetry;
  if (!telemetry) {
    console.error("FAIL: Telemetry not generated for SevenSegment display");
    passed = false;
  } else {
    console.log(`[Trace CC] burnt = ${telemetry.burnt} (Expected: true)`);
    console.log(`[Trace CC] hasResistor = ${telemetry.hasResistor} (Expected: false)`);
    console.log(`[Trace CC] currentMilliAmps = ${telemetry.currentMilliAmps} (Expected: Infinity)`);

    if (telemetry.burnt !== true) {
      console.error("FAIL: Should be burnt on direct connection");
      passed = false;
    }
    if (telemetry.hasResistor !== false) {
      console.error("FAIL: hasResistor should be false on direct connection");
      passed = false;
    }
  }

  // -------------------------------------------------------------
  // Test 2: Common Anode - Active High COM1, Active Low Segments
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: Common Anode Mode ---");
  segmentNode.data.properties.displayType.value = "Common Anode";

  // CA setup: com1 (D2) = HIGH (255), com2 (D3) = LOW (0) (inactive)
  // seg a (D4) = LOW (0), seg b (D5) = HIGH (255), dp (D11) = LOW (0)
  mockPins.get(2)!.value = 255; // com1 HIGH
  mockPins.get(3)!.value = 0; // com2 LOW
  mockPins.get(4)!.value = 0; // a LOW
  mockPins.get(5)!.value = 255; // b HIGH
  mockPins.get(11)!.value = 0; // dp LOW

  rawFrame = buildSimulationFrame({
    tick: 2,
    timestamp: 200,
    nodes: [unoNode, segmentNode],
    edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
    arduinoState: mockArduinoState as any,
  });

  frame = applySevenSegmentInputToFrame(rawFrame, mockContext as any);

  telemetry = frame.components[segmentNode.id]?.telemetry;
  if (!telemetry) {
    console.error("FAIL: Telemetry not generated for SevenSegment display");
    passed = false;
  } else {
    console.log(`[Trace CA] burnt = ${telemetry.burnt} (Expected: true)`);
    console.log(`[Trace CA] hasResistor = ${telemetry.hasResistor} (Expected: false)`);

    if (telemetry.burnt !== true) {
      console.error("FAIL: Should be burnt on direct CA connection");
      passed = false;
    }
    if (telemetry.hasResistor !== false) {
      console.error("FAIL: hasResistor should be false on direct CA connection");
      passed = false;
    }
  }

  // -------------------------------------------------------------
  // Test 3: Series Resistor Compatibility Verification
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: Series Resistor Mode ---");
  segmentNode.data.properties.displayType.value = "Common Cathode";

  const resistorNode: CircuitNode = {
    id: "res1",
    type: "circuitComponent",
    position: { x: 100, y: 100 },
    data: {
      componentType: "resistor",
      simulationModel: "resistor",
      label: "Resistor",
      rotation: 0,
      properties: {
        resistance: { label: "Resistance", type: "string", value: "220" },
      } as any,
    },
  };

  // Wire: D4 -> Resistor -> Segment A
  // com1 -> D2 (GND)
  const resistorEdges: CircuitEdge[] = [
    { id: "e_com1", source: "uno1", sourceHandle: "d2", target: "disp1", targetHandle: "com1" },
    { id: "e_res_in", source: "uno1", sourceHandle: "d4", target: "res1", targetHandle: "pin1" },
    { id: "e_res_out", source: "res1", sourceHandle: "pin2", target: "disp1", targetHandle: "a" },
  ];

  // Drive D4 HIGH (255) and D2 LOW (0)
  mockPins.get(2)!.value = 0; // com1 LOW
  mockPins.get(4)!.value = 255; // D4 HIGH

  const resistorContext = {
    nodes: [unoNode, resistorNode, segmentNode],
    edges: resistorEdges,
    arduinoCode: "",
    picoCode: "",
    dynamicComponents: COMPONENT_CATALOG,
    boardType: "arduino" as const,
  };

  rawFrame = buildSimulationFrame({
    tick: 3,
    timestamp: 300,
    nodes: [unoNode, resistorNode, segmentNode],
    edges: resistorEdges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
    arduinoState: mockArduinoState as any,
  });

  frame = applySevenSegmentInputToFrame(rawFrame, resistorContext as any);

  telemetry = frame.components[segmentNode.id]?.telemetry;
  if (!telemetry) {
    console.error("FAIL: Telemetry not generated for resistor test");
    passed = false;
  } else {
    const digitState = JSON.parse(String(telemetry.digitState));
    console.log(`[Trace Resistor] Resistor output segment A = ${digitState.a} (Expected: true)`);
    console.log(`[Trace Resistor] hasResistor = ${telemetry.hasResistor} (Expected: true)`);
    console.log(`[Trace Resistor] currentMilliAmps = ${Number(telemetry.currentMilliAmps).toFixed(2)} mA (Expected: ~9.09 mA)`);
    console.log(`[Trace Resistor] burnt = ${telemetry.burnt} (Expected: false)`);

    if (digitState.a !== true) {
      console.error("FAIL: Segment A did not light up through the series resistor");
      passed = false;
    }
    if (telemetry.hasResistor !== true) {
      console.error("FAIL: hasResistor should be true on series resistor connection");
      passed = false;
    }
    if (telemetry.burnt !== false) {
      console.error("FAIL: Should not be burnt on safe resistor connection");
      passed = false;
    }
    if (Math.abs(Number(telemetry.currentMilliAmps ?? 0) - 9.09) > 0.5) {
      console.error("FAIL: Current calculation is incorrect");
      passed = false;
    }
  }

  // -------------------------------------------------------------
  // Test 4: Raspberry Pi Pico Compatibility & Logic Thresholds
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Raspberry Pi Pico Compatibility Mode ---");
  segmentNode.data.properties.displayType.value = "Common Cathode";

  // Wire: Pico gp4 -> segment a
  //       Pico gp2 -> display com1 (LOW / GND)
  const picoEdges: CircuitEdge[] = [
    { id: "e_pico_com1", source: "pico1", sourceHandle: "gp2", target: "disp1", targetHandle: "com1" },
    { id: "e_pico_a", source: "pico1", sourceHandle: "gp4", target: "disp1", targetHandle: "a" },
  ];

  // Mock Pico pin mapping (gp2 = GND/LOW, gp4 = 3.3V/HIGH)
  // Pico pins array maps: pin index 2 = gp2, index 4 = gp4
  const mockPicoPins = new Map<number, { mode: 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP' | 'UNSET'; value: number }>();
  mockPicoPins.set(2, { mode: 'OUTPUT', value: 0 }); // gp2 set LOW
  mockPicoPins.set(4, { mode: 'OUTPUT', value: 255 }); // gp4 set HIGH

  const mockPicoArduinoState = {
    pins: mockPicoPins,
    serialOutput: [],
    running: true,
    error: null,
  };

  const picoContext = {
    nodes: [picoNode, segmentNode],
    edges: picoEdges,
    arduinoCode: "",
    picoCode: "",
    dynamicComponents: COMPONENT_CATALOG,
    boardType: "pico" as const,
  };

  rawFrame = buildSimulationFrame({
    tick: 4,
    timestamp: 400,
    nodes: [picoNode, segmentNode],
    edges: picoEdges,
    boardType: "pico",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
    arduinoState: mockPicoArduinoState as any,
  });

  frame = applySevenSegmentInputToFrame(rawFrame, picoContext as any);

  telemetry = frame.components[segmentNode.id]?.telemetry;
  if (!telemetry) {
    console.error("FAIL: Telemetry not generated for Pico test");
    passed = false;
  } else {
    console.log(`[Trace Pico] burnt = ${telemetry.burnt} (Expected: true)`);
    console.log(`[Trace Pico] hasResistor = ${telemetry.hasResistor} (Expected: false)`);

    if (telemetry.burnt !== true) {
      console.error("FAIL: Should be burnt on direct Pico connection");
      passed = false;
    }
  }

  // -------------------------------------------------------------
  // Test 5: MicroPython List Comprehension & Range Evaluation
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: MicroPython List Comprehension & Range Evaluation ---");
  const picoCode = `
from machine import Pin
pins = [Pin(i, Pin.OUT) for i in range(8)]
`;
  try {
    const { getOrCreateSession } = require("../lib/codeParsing/picoParser");
    const session = getOrCreateSession(picoCode, 0);

    let test5Passed = true;
    for (let i = 0; i < 8; i++) {
      const pinState = session.pins.get(i);
      console.log(`[Trace Test 5] Pin GP${i} mode = ${pinState?.mode} (Expected: OUTPUT)`);
      if (pinState?.mode !== "OUTPUT") {
        test5Passed = false;
      }
    }

    if (!test5Passed) {
      console.error("FAIL: List comprehension or range() evaluation failed to register pins as OUTPUT");
      passed = false;
    } else {
      console.log("SUCCESS: MicroPython List Comprehension and range() evaluated correctly!");
    }
  } catch (e: any) {
    console.error("FAIL: Exception thrown during Test 5 parsing/evaluation:", e.stack || e.message);
    passed = false;
  }

  // -------------------------------------------------------------
  // Test 6: MicroPython loopNodes Unrolling Yield & Timing Verification
  // -------------------------------------------------------------
  console.log("\n--- TEST 6: MicroPython loopNodes Unrolling Yield & Timing Verification ---");
  const picoLoopCode = `
from machine import Pin
from time import sleep
pins = [Pin(i, Pin.OUT) for i in range(8)]
while True:
    for i in range(8):
        pins[i].value(1)
        sleep(1)
`;
  try {
    const { getOrCreateSession, parsePythonReadOutputsForInput } = require("../lib/codeParsing/picoParser");
    
    // Start session at timestamp 0
    const session = getOrCreateSession(picoLoopCode, 0);

    // Run first loop iteration
    parsePythonReadOutputsForInput(picoLoopCode, -1, false, 0);

    console.log(`[Trace Test 6 - Tick 1] Pin GP0 value = ${session.pins.get(0)?.value} (Expected: 255/HIGH)`);
    console.log(`[Trace Test 6 - Tick 1] Pin GP1 value = ${session.pins.get(1)?.value} (Expected: 0/LOW)`);
    console.log(`[Trace Test 6 - Tick 1] loopWaitRemaining = ${session.loopWaitRemaining} ms (Expected: 1000)`);

    let test6Passed = true;
    if (session.pins.get(0)?.value !== 255) {
      console.error("FAIL: Pin GP0 was not set HIGH in the first iteration");
      test6Passed = false;
    }
    if (session.pins.get(1)?.value !== 0) {
      console.error("FAIL: Pin GP1 should still be LOW in the first iteration");
      test6Passed = false;
    }
    if (session.loopWaitRemaining !== 1000) {
      console.error("FAIL: Loop did not yield/sleep for 1000ms");
      test6Passed = false;
    }

    // Advance time by 1000ms and run the next iteration
    parsePythonReadOutputsForInput(picoLoopCode, -1, false, 1000);

    console.log(`[Trace Test 6 - Tick 2] Pin GP1 value = ${session.pins.get(1)?.value} (Expected: 255/HIGH)`);
    console.log(`[Trace Test 6 - Tick 2] loopWaitRemaining = ${session.loopWaitRemaining} ms (Expected: 1000)`);

    if (session.pins.get(1)?.value !== 255) {
      console.error("FAIL: Pin GP1 was not set HIGH in the second iteration after sleep");
      test6Passed = false;
    }

    if (!test6Passed) {
      passed = false;
    } else {
      console.log("SUCCESS: loopNodes unrolled and yielded timing sequences correctly!");
    }
  } catch (e: any) {
    console.error("FAIL: Exception thrown during Test 6 parsing/evaluation:", e.stack || e.message);
    passed = false;
  }

  console.log("\n=================== SEVEN SEGMENT REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runSevenSegmentTests();
  if (success) {
    console.log("✅ All seven segment regression tests passed successfully.");
  } else {
    console.error("❌ Some seven segment regression tests failed.");
    process.exit(1);
  }
}
