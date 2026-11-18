/**
 * Permanent Regression Test Suite for Piezo Buzzer Frequency parsing and propagation.
 * Verifies that:
 * 1. Arduino tone(...) code parses frequency and assigns it to the PinState.
 * 2. buildSimulationFrame traces the piezo's connection and assigns the frequency to telemetry.
 */

import { useCircuitStore } from "../lib/store";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { PinState } from "../lib/arduino-simulator";

export function runPiezoFrequencyTests(): boolean {
  console.log("=================== RUNNING PIEZO FREQUENCY REGRESSION TESTS ===================\n");

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

  const piezoNode: CircuitNode = {
    id: "piezo1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "piezo",
      simulationModel: "piezo",
      label: "Piezo Buzzer",
      rotation: 0,
      properties: {} as any,
    },
  };

  // Connected: piezo positive connects to D11, piezo negative connects to GND
  const edges: CircuitEdge[] = [
    { id: "e1", source: "piezo1", sourceHandle: "positive", target: "uno1", targetHandle: "d11" },
    { id: "e2", source: "piezo1", sourceHandle: "negative", target: "uno1", targetHandle: "gnd1" },
  ];

  console.log("--- Case 1: Arduino tone(11, 440) ---");
  const arduinoCode = `
    void setup() {
      tone(11, 440);
    }
    void loop() {}
  `;

  useCircuitStore.setState({
    nodes: [unoNode, piezoNode],
    edges: edges,
    arduinoCode,
    simulationStatus: "running"
  });

  const mockPins = new Map<number, PinState>();
  mockPins.set(11, { mode: "OUTPUT", value: 255, frequency: 440 });

  const frame = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, piezoNode],
    edges: edges,
    boardType: "arduino",
    arduinoState: {
      pins: mockPins,
      serialOutput: [],
      running: true,
      error: null,
    },
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const d11Pin = frame.boardPins.find((p) => p.pin === 11);
  console.log(`[Trace] Board Pin D11 frequency: ${d11Pin?.frequency} Hz, value: ${d11Pin?.value}`);

  if (!d11Pin || d11Pin.frequency !== 440) {
    console.error("FAIL: Board pin D11 frequency was not parsed correctly or is missing", d11Pin);
    passed = false;
  } else {
    console.log("=> Board pin D11 frequency parsed successfully");
  }

  const piezoState = frame.components["piezo1"];
  console.log(`[Trace] Piezo isPowered: ${piezoState?.isPowered}, telemetry:`, piezoState?.telemetry);

  if (!piezoState || piezoState.telemetry?.frequency !== 440 || piezoState.telemetry?.frequencyLabel !== "440 Hz") {
    console.error("FAIL: Piezo telemetry did not receive the correct frequency", piezoState?.telemetry);
    passed = false;
  } else {
    console.log("=> Piezo telemetry frequency received successfully");
  }

  // -----------------------------------------------------------------------------
  // Case 2: Pico PWM(Pin(16)) with freq(500) and duty_u16(32768)
  // -----------------------------------------------------------------------------
  console.log("\n--- Case 2: Pico PWM(Pin(16)) ---");
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
  const picoEdges: CircuitEdge[] = [
    { id: "e3", source: "piezo1", sourceHandle: "positive", target: "pico1", targetHandle: "gp16" },
    { id: "e4", source: "piezo1", sourceHandle: "negative", target: "pico1", targetHandle: "pico_gnd1" },
  ];

  const picoCode = `
    from machine import Pin, PWM
    buzzer = PWM(Pin(16))
    buzzer.freq(500)
    buzzer.duty_u16(32768)
  `;

  useCircuitStore.setState({
    nodes: [picoNode, piezoNode],
    edges: picoEdges,
    picoCode,
    simulationStatus: "running"
  });

  const mockPicoPins = new Map<number, PinState>();
  mockPicoPins.set(16, { mode: "OUTPUT", value: 128, frequency: 500 });

  const picoFrame = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [picoNode, piezoNode],
    edges: picoEdges,
    boardType: "pico",
    arduinoState: {
      pins: mockPicoPins,
      serialOutput: [],
      running: true,
      error: null,
    },
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const gp16Pin = picoFrame.boardPins.find((p) => p.pin === 16);
  console.log(`[Trace] Board Pin GP16 frequency: ${gp16Pin?.frequency} Hz, value: ${gp16Pin?.value}`);

  if (!gp16Pin || gp16Pin.frequency !== 500) {
    console.error("FAIL: Board pin GP16 frequency was not parsed correctly or is missing", gp16Pin);
    passed = false;
  } else {
    console.log("=> Board pin GP16 frequency parsed successfully");
  }

  const picoPiezoState = picoFrame.components["piezo1"];
  console.log(`[Trace] Piezo isPowered: ${picoPiezoState?.isPowered}, telemetry:`, picoPiezoState?.telemetry);

  if (!picoPiezoState || picoPiezoState.telemetry?.frequency !== 500 || picoPiezoState.telemetry?.frequencyLabel !== "500 Hz") {
    console.error("FAIL: Piezo telemetry did not receive the correct frequency", picoPiezoState?.telemetry);
    passed = false;
  } else {
    console.log("=> Piezo telemetry frequency received successfully");
  }

  console.log("\n=================== PIEZO FREQUENCY REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runPiezoFrequencyTests();
  if (success) {
    console.log("✅ All piezo frequency regression tests passed successfully.");
  } else {
    console.error("❌ Some piezo frequency regression tests failed.");
    process.exit(1);
  }
}
