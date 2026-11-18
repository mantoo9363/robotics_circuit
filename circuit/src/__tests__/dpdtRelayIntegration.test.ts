import { applyDpdtRelayInputToFrame } from "../lib/simulation/frameTransformers/dpdtRelay";
import { applyPicoSimulationToFrame } from "../lib/simulation/frameTransformers/pico";
import { parsePythonReadOutputsForInput, MicroPythonTokenizer, MicroPythonParser } from "../lib/codeParsing/picoParser";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import { CIRCUIT_PRESETS } from "../lib/circuit-presets";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import type { SimContext } from "../lib/simulation/types";
import { useCircuitStore } from "../lib/store";
import { NE555StateManager, CapacitorStateManager, KeypadStateManager } from "../lib/simulation/stateMaps";

export function runDpdtRelayIntegrationTests(): boolean {
  console.log("=================== RUNNING DPDT RELAY INTEGRATION TESTS ===================\n");
  let passedCount = 0;
  let failedCount = 0;

  const reportTest = (name: string, success: boolean, bugReport?: string) => {
    if (success) {
      console.log(`✅ ${name} PASSED`);
      passedCount += 1;
    } else {
      console.error(`❌ ${name} FAILED`);
      if (bugReport) {
        console.error(bugReport);
      }
      failedCount += 1;
    }
  };

  // Common Node Definitions
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

  const relayNode: CircuitNode = {
    id: "relay1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "relayDpdt",
      simulationModel: "relayDpdt",
      label: "DPDT Relay",
      rotation: 0,
      properties: {} as any,
    },
  };

  const rRedNode: CircuitNode = {
    id: "rRed",
    type: "circuitComponent",
    position: { x: 400, y: 0 },
    data: {
      componentType: "resistor",
      simulationModel: "resistor",
      label: "220 Ohm Resistor (Red Path)",
      rotation: 0,
      properties: { resistance: { value: 220, unit: "Ω" } } as any,
    },
  };

  const ledRedNode: CircuitNode = {
    id: "ledRed",
    type: "circuitComponent",
    position: { x: 500, y: 0 },
    data: {
      componentType: "led",
      simulationModel: "led",
      label: "Red LED",
      rotation: 0,
      properties: { color: { value: "red" } } as any,
    },
  };

  const rGreenNode: CircuitNode = {
    id: "rGreen",
    type: "circuitComponent",
    position: { x: 400, y: 200 },
    data: {
      componentType: "resistor",
      simulationModel: "resistor",
      label: "220 Ohm Resistor (Green Path)",
      rotation: 0,
      properties: { resistance: { value: 220, unit: "Ω" } } as any,
    },
  };

  const ledGreenNode: CircuitNode = {
    id: "ledGreen",
    type: "circuitComponent",
    position: { x: 500, y: 200 },
    data: {
      componentType: "led",
      simulationModel: "led",
      label: "Green LED",
      rotation: 0,
      properties: { color: { value: "green" } } as any,
    },
  };

  // Full Circuit Edges
  const fullEdges: CircuitEdge[] = [
    // Coil Connections
    { id: "eCoilA1", source: "uno1", sourceHandle: "d7", target: "relay1", targetHandle: "terminal1" }, // A1 (+)
    { id: "eCoilA2", source: "relay1", sourceHandle: "terminal16", target: "uno1", targetHandle: "gnd1" }, // A2 (-)
    // Power Connections to poles
    { id: "ePowerCOM1", source: "uno1", sourceHandle: "5v", target: "relay1", targetHandle: "terminal4" }, // COM1
    { id: "ePowerCOM2", source: "uno1", sourceHandle: "5v", target: "relay1", targetHandle: "terminal13" }, // COM2
    // Red LED Path (NC1)
    { id: "eNC1_to_rRed", source: "relay1", sourceHandle: "terminal6", target: "rRed", targetHandle: "pin1" },
    { id: "e_rRed_to_ledRed", source: "rRed", sourceHandle: "pin2", target: "ledRed", targetHandle: "anode" },
    { id: "e_ledRed_to_gnd", source: "ledRed", sourceHandle: "cathode", target: "uno1", targetHandle: "gnd1" },
    // Green LED Path (NO2)
    { id: "eNO2_to_rGreen", source: "relay1", sourceHandle: "terminal9", target: "rGreen", targetHandle: "pin1" },
    { id: "e_rGreen_to_ledGreen", source: "rGreen", sourceHandle: "pin2", target: "ledGreen", targetHandle: "anode" },
    { id: "e_ledGreen_to_gnd", source: "ledGreen", sourceHandle: "cathode", target: "uno1", targetHandle: "gnd1" },
  ];

  // Helper to load stores
  const syncStore = (edges: CircuitEdge[] = fullEdges) => {
    useCircuitStore.setState({
      nodes: [unoNode, relayNode, rRedNode, ledRedNode, rGreenNode, ledGreenNode],
      edges,
      arduinoCode: "",
      simulationStatus: "running"
    });
  };

  // Helper to build SimContext from explicit node/edge lists (canonical, no store reads)
  const makeContext = (
    nodes: CircuitNode[],
    edges: CircuitEdge[],
  ): SimContext => ({
    nodes,
    edges,
    arduinoCode: "",
    picoCode: "",
    dynamicComponents: COMPONENT_CATALOG as any,
    boardType: "arduino",
    ne555State: new NE555StateManager(),
    capacitorState: new CapacitorStateManager(),
    keypad4x4State: new KeypadStateManager(),
    keypad4x3State: new KeypadStateManager(),
  });

  // ===========================================================================
  // Test Case 1: Arduino Pin Output
  // ===========================================================================
  console.log("--- Test Case 1: Arduino Pin Output ---");
  try {
    syncStore();

    // 1. Check LOW State
    const pinsMapLOW = new Map();
    pinsMapLOW.set(7, { mode: "OUTPUT", value: 0 });
    const frameLOW = buildSimulationFrame({
      tick: 1,
      nodes: [unoNode, relayNode],
      edges: fullEdges,
      boardType: "arduino",
      arduinoState: { pins: pinsMapLOW } as any,
      running: true,
      dynamicComponents: COMPONENT_CATALOG,
    });
    const pin7LOW = frameLOW.boardPins.find(p => p.pin === 7);
    const lowIs0 = pin7LOW?.voltage === 0;

    // 2. Check HIGH State
    const pinsMapHIGH = new Map();
    pinsMapHIGH.set(7, { mode: "OUTPUT", value: 255 });
    const frameHIGH = buildSimulationFrame({
      tick: 2,
      nodes: [unoNode, relayNode],
      edges: fullEdges,
      boardType: "arduino",
      arduinoState: { pins: pinsMapHIGH } as any,
      running: true,
      dynamicComponents: COMPONENT_CATALOG,
    });
    const pin7HIGH = frameHIGH.boardPins.find(p => p.pin === 7);
    const highIs5 = pin7HIGH?.voltage === 5.0;

    const ok = lowIs0 && highIs5;
    reportTest("Test Case 1: Arduino Pin Output", ok, `
## Bug Report
**Test Case:** Test Case 1: Arduino Pin Output
**Expected State:** LOW pin 7 voltage = 0V, HIGH pin 7 voltage = 5V.
**Actual State:** LOW pin 7 voltage = ${pin7LOW?.voltage}V, HIGH pin 7 voltage = ${pin7HIGH?.voltage}V.
**Bug Location:** Arduino digital pin state updates.
**Root Cause:** Digital pin values are not mapped correctly to analog potentials.
**Required Fix:** Correct normalizeArduinoPins voltage mapping.
`);
  } catch (e: any) {
    reportTest("Test Case 1: Arduino Pin Output", false, e.message);
  }

  // ===========================================================================
  // Test Case 2: Relay Coil A1/A2 potential trigger checks
  // ===========================================================================
  console.log("\n--- Test Case 2: Relay Coil A1/A2 Potential Trigger ---");
  try {
    syncStore();

    // Helper to evaluate relay state
    const evaluateCoil = (vA1: number, vA2: number): boolean => {
      const testEdges = [
        ...fullEdges.filter(e => e.id !== "eCoilA2"),
        { id: "eCoilA2", source: "relay1", sourceHandle: "terminal16", target: "uno1", targetHandle: "d8" }
      ];

      const frame = buildSimulationFrame({
        tick: 3,
        nodes: [unoNode, relayNode],
        edges: testEdges,
        boardType: "arduino",
        running: true,
        dynamicComponents: COMPONENT_CATALOG,
      });

      frame.boardPins = [
        { pin: 7, handleId: "uno1:d7", mode: "OUTPUT", value: vA1 === 5 ? 255 : 0, normalizedValue: vA1 / 5, voltage: vA1, active: vA1 > 0 },
        { pin: 8, handleId: "uno1:d8", mode: "OUTPUT", value: vA2 === 5 ? 255 : 0, normalizedValue: vA2 / 5, voltage: vA2, active: vA2 > 0 },
        { pin: -1, handleId: "uno1:5v", mode: "POWER", value: 255, normalizedValue: 1, voltage: 5.0, active: true },
      ] as any;

      const transformed = applyDpdtRelayInputToFrame(
        frame,
        makeContext([unoNode, relayNode], testEdges),
      );
      return transformed.components["relay1"]?.isPowered ?? false;
    };

    const lowLow = evaluateCoil(0, 0) === false; // OFF
    const highLow = evaluateCoil(5, 0) === true;  // ON
    const lowHigh = evaluateCoil(0, 5) === true;  // ON (voltage difference)
    const highHigh = evaluateCoil(5, 5) === false; // OFF

    const ok = lowLow && highLow && lowHigh && highHigh;
    reportTest("Test Case 2: Relay Coil A1/A2", ok, `
## Bug Report
**Test Case:** Test Case 2: Relay Coil A1/A2
**Expected State:** lowLow=OFF, highLow=ON, lowHigh=ON, highHigh=OFF.
**Actual State:** lowLow=${evaluateCoil(0,0)}, highLow=${evaluateCoil(5,0)}, lowHigh=${evaluateCoil(0,5)}, highHigh=${evaluateCoil(5,5)}.
**Bug Location:** Relay coil energized check in dpdtRelay.ts.
**Root Cause:** The energized check does not compute the absolute difference between terminal1 and terminal16.
**Required Fix:** Update isEnergized check to: Math.abs(incomingA1 - incomingA2) >= 3.0.
`);
  } catch (e: any) {
    reportTest("Test Case 2: Relay Coil A1/A2", false, e.message);
  }

  // ===========================================================================
  // Test Case 3: Relay OFF Contact State
  // ===========================================================================
  console.log("\n--- Test Case 3: Relay OFF Contact State ---");
  try {
    syncStore();

    const frame = buildSimulationFrame({
      tick: 4,
      nodes: [unoNode, relayNode],
      edges: fullEdges,
      boardType: "arduino",
      running: true,
      dynamicComponents: COMPONENT_CATALOG,
    });

    frame.boardPins = [
      { pin: 7, handleId: "uno1:d7", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: false },
      { pin: -2, handleId: "uno1:gnd1", mode: "POWER", value: 0, normalizedValue: 0, voltage: 0, active: false },
      { pin: -1, handleId: "uno1:5v", mode: "POWER", value: 255, normalizedValue: 1, voltage: 5.0, active: true },
    ] as any;

    const transformed = applyDpdtRelayInputToFrame(
      frame,
      makeContext([unoNode, relayNode], fullEdges),
    );
    const relayState = transformed.components["relay1"];

    const isPowered = relayState?.isPowered ?? false;
    const term4V = relayState?.pins?.["terminal4"]?.voltage ?? 0;
    const term6V = relayState?.pins?.["terminal6"]?.voltage ?? 0;
    const term8V = relayState?.pins?.["terminal8"]?.voltage ?? 0;
    const term13V = relayState?.pins?.["terminal13"]?.voltage ?? 0;
    const term11V = relayState?.pins?.["terminal11"]?.voltage ?? 0;
    const term9V = relayState?.pins?.["terminal9"]?.voltage ?? 0;

    // In OFF state, COM1 (terminal4) connects to NC1 (terminal6) -> both should have 5V
    // COM2 (terminal13) connects to NC2 (terminal11) -> both should have 5V
    // NO1 (terminal8) and NO2 (terminal9) should be isolated/0V
    const com1Nc1 = term4V === 5.0 && term6V === 5.0;
    const com1No1 = term8V === 0.0;
    const com2Nc2 = term13V === 5.0 && term11V === 5.0;
    const com2No2 = term9V === 0.0;

    const ok = !isPowered && com1Nc1 && com1No1 && com2Nc2 && com2No2;

    reportTest("Test Case 3: Relay OFF Contact State", ok, `
## Bug Report
**Test Case:** Test Case 3: Relay OFF Contact State
**Expected State:** isPowered=false, COM1/NC1=5V, NO1=0V, COM2/NC2=5V, NO2=0V.
**Actual State:** isPowered=${isPowered}, COM1=${term4V}V, NC1=${term6V}V, NO1=${term8V}V, COM2=${term13V}V, NC2=${term11V}V, NO2=${term9V}V.
**Bug Location:** Relay de-energized routing logic in dpdtRelay.ts.
**Root Cause:** NC contacts are not connected to COM contacts in de-energized mode.
**Required Fix:** Ensure outNC1 = outCOM1 and outNC2 = outCOM2 when de-energized.
`);
  } catch (e: any) {
    reportTest("Test Case 3: Relay OFF Contact State", false, e.message);
  }

  // ===========================================================================
  // Test Case 4: Relay ON Contact State
  // ===========================================================================
  console.log("\n--- Test Case 4: Relay ON Contact State ---");
  try {
    syncStore();

    const frame = buildSimulationFrame({
      tick: 5,
      nodes: [unoNode, relayNode],
      edges: fullEdges,
      boardType: "arduino",
      running: true,
      dynamicComponents: COMPONENT_CATALOG,
    });

    frame.boardPins = [
      { pin: 7, handleId: "uno1:d7", mode: "OUTPUT", value: 255, normalizedValue: 1, voltage: 5.0, active: true },
      { pin: -2, handleId: "uno1:gnd1", mode: "POWER", value: 0, normalizedValue: 0, voltage: 0, active: false },
      { pin: -1, handleId: "uno1:5v", mode: "POWER", value: 255, normalizedValue: 1, voltage: 5.0, active: true },
    ] as any;

    const transformed = applyDpdtRelayInputToFrame(
      frame,
      makeContext([unoNode, relayNode], fullEdges),
    );
    const relayState = transformed.components["relay1"];

    const isPowered = relayState?.isPowered ?? false;
    const term4V = relayState?.pins?.["terminal4"]?.voltage ?? 0;
    const term6V = relayState?.pins?.["terminal6"]?.voltage ?? 0;
    const term8V = relayState?.pins?.["terminal8"]?.voltage ?? 0;
    const term13V = relayState?.pins?.["terminal13"]?.voltage ?? 0;
    const term11V = relayState?.pins?.["terminal11"]?.voltage ?? 0;
    const term9V = relayState?.pins?.["terminal9"]?.voltage ?? 0;

    // In ON state, COM1 (terminal4) connects to NO1 (terminal8) -> both should have 5V
    // COM2 (terminal13) connects to NO2 (terminal9) -> both should have 5V
    // NC1 (terminal6) and NC2 (terminal11) should be isolated/0V
    const com1Nc1 = term6V === 0.0;
    const com1No1 = term4V === 5.0 && term8V === 5.0;
    const com2Nc2 = term11V === 0.0;
    const com2No2 = term13V === 5.0 && term9V === 5.0;

    const ok = isPowered && com1Nc1 && com1No1 && com2Nc2 && com2No2;

    reportTest("Test Case 4: Relay ON Contact State", ok, `
## Bug Report
**Test Case:** Test Case 4: Relay ON Contact State
**Expected State:** isPowered=true, COM1/NO1=5V, NC1=0V, COM2/NO2=5V, NC2=0V.
**Actual State:** isPowered=${isPowered}, COM1=${term4V}V, NO1=${term8V}V, NC1=${term6V}V, COM2=${term13V}V, NO2=${term9V}V, NC2=${term11V}V.
**Bug Location:** Relay energized routing logic in dpdtRelay.ts.
**Root Cause:** NO contacts are not connected to COM contacts in energized mode.
**Required Fix:** Ensure outNO1 = outCOM1 and outNO2 = outCOM2 when energized.
`);
  } catch (e: any) {
    reportTest("Test Case 4: Relay ON Contact State", false, e.message);
  }

  // ===========================================================================
  // Test Case 5: Red LED Circuit
  // ===========================================================================
  console.log("\n--- Test Case 5: Red LED Circuit (Relay = OFF) ---");
  try {
    syncStore();

    // With coil = OFF (0V), NC1 receives 5V from COM1, which should power Red LED
    const frame = buildSimulationFrame({
      tick: 6,
      nodes: [unoNode, relayNode, rRedNode, ledRedNode],
      edges: fullEdges,
      boardType: "arduino",
      running: true,
      dynamicComponents: COMPONENT_CATALOG,
    });

    frame.boardPins = [
      { pin: 7, handleId: "uno1:d7", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: false },
      { pin: -2, handleId: "uno1:gnd1", mode: "POWER", value: 0, normalizedValue: 0, voltage: 0, active: false },
      { pin: -1, handleId: "uno1:5v", mode: "POWER", value: 255, normalizedValue: 1, voltage: 5.0, active: true },
    ] as any;

    // Run DPDT Relay simulation
    let transformed = applyDpdtRelayInputToFrame(
      frame,
      makeContext([unoNode, relayNode, rRedNode, ledRedNode, rGreenNode, ledGreenNode], fullEdges),
    );

    const anodeV = transformed.components["ledRed"]?.pins?.["anode"]?.voltage ?? 0;
    const isRedPowered = anodeV >= 1.5; // LED forward voltage threshold

    reportTest("Test Case 5: Red LED Circuit", isRedPowered, `
## Bug Report
**Test Case:** Test Case 5: Red LED Circuit
**Expected State:** Red LED Anode voltage > 1.8V (receives 5V via NC1).
**Actual State:** Red LED Anode voltage = ${anodeV}V.
**Bug Location:** Voltage propagation to downstream node ledRed.
**Root Cause:** Downstream propagation did not write to components[remoteNodeId].pins[remoteHandle].voltage.
**Required Fix:** In dpdtRelay.ts propagateToPin(), set component pins and voltage correctly.
`);
  } catch (e: any) {
    reportTest("Test Case 5: Red LED Circuit", false, e.message);
  }

  // ===========================================================================
  // Test Case 6: Green LED Circuit
  // ===========================================================================
  console.log("\n--- Test Case 6: Green LED Circuit (Relay = ON) ---");
  try {
    syncStore();

    // With coil = ON (5V), NO2 receives 5V from COM2, which should power Green LED
    const frame = buildSimulationFrame({
      tick: 7,
      nodes: [unoNode, relayNode, rGreenNode, ledGreenNode],
      edges: fullEdges,
      boardType: "arduino",
      running: true,
      dynamicComponents: COMPONENT_CATALOG,
    });

    frame.boardPins = [
      { pin: 7, handleId: "uno1:d7", mode: "OUTPUT", value: 255, normalizedValue: 1, voltage: 5.0, active: true },
      { pin: -2, handleId: "uno1:gnd1", mode: "POWER", value: 0, normalizedValue: 0, voltage: 0, active: false },
      { pin: -1, handleId: "uno1:5v", mode: "POWER", value: 255, normalizedValue: 1, voltage: 5.0, active: true },
    ] as any;

    let transformed = applyDpdtRelayInputToFrame(
      frame,
      makeContext([unoNode, relayNode, rRedNode, ledRedNode, rGreenNode, ledGreenNode], fullEdges),
    );

    const anodeV = transformed.components["ledGreen"]?.pins?.["anode"]?.voltage ?? 0;
    const isGreenPowered = anodeV >= 1.5;

    reportTest("Test Case 6: Green LED Circuit", isGreenPowered, `
## Bug Report
**Test Case:** Test Case 6: Green LED Circuit
**Expected State:** Green LED Anode voltage > 1.8V (receives 5V via NO2).
**Actual State:** Green LED Anode voltage = ${anodeV}V.
**Bug Location:** Voltage propagation to downstream node ledGreen.
**Root Cause:** Downstream propagation did not write to components[remoteNodeId].pins[remoteHandle].voltage.
**Required Fix:** In dpdtRelay.ts propagateToPin(), set component pins and voltage correctly.
`);
  } catch (e: any) {
    reportTest("Test Case 6: Green LED Circuit", false, e.message);
  }

  // ===========================================================================
  // Test Case 7: LED Switching Test
  // ===========================================================================
  console.log("\n--- Test Case 7: LED Switching Test (State Toggling) ---");
  try {
    syncStore();

    // State 1: Relay OFF
    const frameOFF = buildSimulationFrame({
      tick: 8,
      nodes: [unoNode, relayNode, rRedNode, ledRedNode, rGreenNode, ledGreenNode],
      edges: fullEdges,
      boardType: "arduino",
      running: true,
      dynamicComponents: COMPONENT_CATALOG,
    });
    frameOFF.boardPins = [
      { pin: 7, handleId: "uno1:d7", mode: "OUTPUT", value: 0, normalizedValue: 0, voltage: 0, active: false },
      { pin: -2, handleId: "uno1:gnd1", mode: "POWER", value: 0, normalizedValue: 0, voltage: 0, active: false },
      { pin: -1, handleId: "uno1:5v", mode: "POWER", value: 255, normalizedValue: 1, voltage: 5.0, active: true },
    ] as any;

    const transOFF = applyDpdtRelayInputToFrame(
      frameOFF,
      makeContext([unoNode, relayNode, rRedNode, ledRedNode, rGreenNode, ledGreenNode], fullEdges),
    );
    const redV_OFF = transOFF.components["ledRed"]?.pins?.["anode"]?.voltage ?? 0;
    const greenV_OFF = transOFF.components["ledGreen"]?.pins?.["anode"]?.voltage ?? 0;

    // State 2: Relay ON
    const frameON = buildSimulationFrame({
      tick: 9,
      nodes: [unoNode, relayNode, rRedNode, ledRedNode, rGreenNode, ledGreenNode],
      edges: fullEdges,
      boardType: "arduino",
      running: true,
      dynamicComponents: COMPONENT_CATALOG,
    });
    frameON.boardPins = [
      { pin: 7, handleId: "uno1:d7", mode: "OUTPUT", value: 255, normalizedValue: 1, voltage: 5.0, active: true },
      { pin: -2, handleId: "uno1:gnd1", mode: "POWER", value: 0, normalizedValue: 0, voltage: 0, active: false },
      { pin: -1, handleId: "uno1:5v", mode: "POWER", value: 255, normalizedValue: 1, voltage: 5.0, active: true },
    ] as any;

    const transON = applyDpdtRelayInputToFrame(
      frameON,
      makeContext([unoNode, relayNode, rRedNode, ledRedNode, rGreenNode, ledGreenNode], fullEdges),
    );
    const redV_ON = transON.components["ledRed"]?.pins?.["anode"]?.voltage ?? 0;
    const greenV_ON = transON.components["ledGreen"]?.pins?.["anode"]?.voltage ?? 0;

    const state1Correct = redV_OFF >= 1.5 && greenV_OFF === 0;
    const state2Correct = redV_ON === 0 && greenV_ON >= 1.5;

    reportTest("Test Case 7: LED Switching Test", state1Correct && state2Correct, `
## Bug Report
**Test Case:** Test Case 7: LED Switching Test
**Expected State:** State 1 (OFF): Red=5V, Green=0V; State 2 (ON): Red=0V, Green=5V.
**Actual State:** State 1: Red=${redV_OFF}V, Green=${greenV_OFF}V. State 2: Red=${redV_ON}V, Green=${greenV_ON}V.
**Bug Location:** Double-pole simultaneous switching logic.
**Root Cause:** Simultaneous state updates for Pole 1 and Pole 2 are not synchronized.
**Required Fix:** Ensure both COM1/NC1/NO1 and COM2/NC2/NO2 switch values on the same tick.
`);
  } catch (e: any) {
    reportTest("Test Case 7: LED Switching Test", false, e.message);
  }

  // ===========================================================================
  // Test Case 8: Continuous Switching (20s Run)
  // ===========================================================================
  console.log("\n--- Test Case 8: Continuous Switching ---");
  try {
    syncStore();

    let sequenceValid = true;

    for (let timeSec = 0; timeSec < 20; timeSec += 1) {
      const period = Math.floor(timeSec / 3);
      const isHigh = period % 2 === 1;

      const pinsMap = new Map();
      pinsMap.set(7, { mode: "OUTPUT", value: isHigh ? 255 : 0 });

      const frame = buildSimulationFrame({
        tick: 10 + timeSec,
        nodes: [unoNode, relayNode, rRedNode, ledRedNode, rGreenNode, ledGreenNode],
        edges: fullEdges,
        boardType: "arduino",
        arduinoState: { pins: pinsMap } as any,
        running: true,
        dynamicComponents: COMPONENT_CATALOG,
        timestamp: 1000 + timeSec * 1000,
      });

      const transformed = applyDpdtRelayInputToFrame(
        frame,
        makeContext([unoNode, relayNode, rRedNode, ledRedNode, rGreenNode, ledGreenNode], fullEdges),
      );
      const redV = transformed.components["ledRed"]?.pins?.["anode"]?.voltage ?? 0;
      const greenV = transformed.components["ledGreen"]?.pins?.["anode"]?.voltage ?? 0;

      if (isHigh) {
        if (redV !== 0.0 || greenV < 1.5) {
          sequenceValid = false;
          console.error(`[Fail at t=${timeSec}s] Expected HIGH: Red=0V, Green=5V. Got Red=${redV}V, Green=${greenV}V`);
          break;
        }
      } else {
        if (redV < 1.5 || greenV !== 0.0) {
          sequenceValid = false;
          console.error(`[Fail at t=${timeSec}s] Expected LOW: Red=5V, Green=0V. Got Red=${redV}V, Green=${greenV}V`);
          break;
        }
      }
    }

    reportTest("Test Case 8: Continuous Switching", sequenceValid, `
## Bug Report
**Test Case:** Test Case 8: Continuous Switching
**Expected State:** Correct sequence of Red/Green toggling every 3s.
**Actual State:** Sequence mismatch or failure during pin transition.
**Bug Location:** Frame state updates / simulation tick transitions.
**Root Cause:** Pin modes or simulation status becoming out of sync during multiple ticks.
**Required Fix:** Verify correct frame pipeline execution.
`);
  } catch (e: any) {
    reportTest("Test Case 8: Continuous Switching", false, e.message);
  }

  // Test Case 9: Verify DPDT Circuit Presets Validity
  try {
    const dpdtPresets = CIRCUIT_PRESETS.filter((p) =>
      p.nodes.some((n) => n.type === 'relayDpdt' || n.data?.componentType === 'relayDpdt')
    );
    const expectedPresetIds = [
      'arduino-dpdt-relay',
      'arduino-dpdt-motor-reversal',
      'arduino-dpdt-dual-motor-led',
      'pico-dpdt-relay',
      'pico-dpdt-dual-motor-led',
      'battery-dpdt-relay',
    ];
    let presetsValid = dpdtPresets.length >= 6;
    for (const expectedId of expectedPresetIds) {
      const found = dpdtPresets.find((p) => p.id === expectedId);
      if (!found) {
        presetsValid = false;
        console.error(`[Preset Test Fail] Missing expected DPDT preset: ${expectedId}`);
      } else if (found.nodes.length === 0 || found.edges.length === 0) {
        presetsValid = false;
        console.error(`[Preset Test Fail] Preset ${expectedId} has empty nodes or edges.`);
      }
    }
    reportTest("Test Case 9: DPDT Circuit Presets Validation", presetsValid, "DPDT circuit presets failed validation.");
  } catch (e: any) {
    reportTest("Test Case 9: DPDT Circuit Presets Validation", false, e.message);
  }

  // Test Case 10: Raspberry Pi Pico DPDT Relay Green & Red LED Simulation Toggling
  try {
    const picoPreset = CIRCUIT_PRESETS.find((p) => p.id === "pico-dpdt-relay");
    if (!picoPreset || !picoPreset.picoCode) {
      throw new Error("pico-dpdt-relay preset or picoCode missing");
    }

    const context: any = {
      nodes: picoPreset.nodes,
      edges: picoPreset.edges,
      picoCode: picoPreset.picoCode,
      dynamicComponents: COMPONENT_CATALOG,
    };

    let greenLedGlowed = false;
    let redLedGlowed = false;

    // Simulate 3 seconds (3000ms) in 200ms steps
    for (let timeMs = 0; timeMs <= 3000; timeMs += 200) {
      const stepFrame = buildSimulationFrame({
        tick: Math.floor(timeMs / 200),
        nodes: picoPreset.nodes,
        edges: picoPreset.edges,
        dynamicComponents: COMPONENT_CATALOG,
        boardType: "pico",
        arduinoState: {
          pins: new Map(),
          serialOutput: [],
          running: true,
          error: null,
        },
        running: true,
        timestamp: timeMs,
      });

      const picoFrame = applyPicoSimulationToFrame(stepFrame, context);
      const finalFrame = applyDpdtRelayInputToFrame(picoFrame, context);

      const greenLed = finalFrame.components["pdr-led-green"];
      const redLed = finalFrame.components["pdr-led-red"];

      if (greenLed && greenLed.isPowered && (greenLed.brightness ?? 0) > 0.1) {
        greenLedGlowed = true;
      }
      if (redLed && redLed.isPowered && (redLed.brightness ?? 0) > 0.1) {
        redLedGlowed = true;
      }
    }

    const picoDpdtOk = greenLedGlowed && redLedGlowed;
    reportTest(
      "Test Case 10: Raspberry Pi Pico DPDT Relay Simulation",
      picoDpdtOk,
      `Pico DPDT Relay failed: Green LED glowed=${greenLedGlowed}, Red LED glowed=${redLedGlowed}`
    );
  } catch (e: any) {
    console.error("[TestCase10Error]", e);
    reportTest("Test Case 10: Raspberry Pi Pico DPDT Relay Simulation", false, e.message);
  }

  // Test Case 11: Arduino DPDT Dual Motor & Dual LED Preset Simulation
  try {
    const dualPreset = CIRCUIT_PRESETS.find((p) => p.id === "arduino-dpdt-dual-motor-led");
    if (!dualPreset) {
      throw new Error("arduino-dpdt-dual-motor-led preset missing");
    }

    const context: any = {
      nodes: dualPreset.nodes,
      edges: dualPreset.edges,
      arduinoCode: dualPreset.arduinoCode,
      dynamicComponents: COMPONENT_CATALOG,
    };

    // State A: Relay OFF (D12 LOW) -> Red LED & Motor 1 ON
    const frameOff = buildSimulationFrame({
      tick: 1,
      nodes: dualPreset.nodes,
      edges: dualPreset.edges,
      dynamicComponents: COMPONENT_CATALOG,
      boardType: "arduino",
      arduinoState: {
        pins: new Map([[12, { mode: "OUTPUT", value: 0 }]]),
        serialOutput: [],
        running: true,
        error: null,
      },
      running: true,
    });
    const finalOff = applyDpdtRelayInputToFrame(frameOff, context);
    const redOff = finalOff.components["add-led-red"];
    const greenOff = finalOff.components["add-led-green"];
    const m1Off = finalOff.components["add-m1"];
    const m2Off = finalOff.components["add-m2"];

    const stateOffOk = redOff?.isPowered && m1Off?.isPowered && !greenOff?.isPowered && !m2Off?.isPowered;

    // State B: Relay ON (D12 HIGH) -> Green LED & Motor 2 ON
    const frameOn = buildSimulationFrame({
      tick: 2,
      nodes: dualPreset.nodes,
      edges: dualPreset.edges,
      dynamicComponents: COMPONENT_CATALOG,
      boardType: "arduino",
      arduinoState: {
        pins: new Map([[12, { mode: "OUTPUT", value: 255 }]]),
        serialOutput: [],
        running: true,
        error: null,
      },
      running: true,
    });
    const finalOn = applyDpdtRelayInputToFrame(frameOn, context);
    const redOn = finalOn.components["add-led-red"];
    const greenOn = finalOn.components["add-led-green"];
    const m1On = finalOn.components["add-m1"];
    const m2On = finalOn.components["add-m2"];

    const stateOnOk = !redOn?.isPowered && !m1On?.isPowered && greenOn?.isPowered && m2On?.isPowered;

    reportTest(
      "Test Case 11: DPDT Dual Motor & Dual LED Simulation",
      Boolean(stateOffOk && stateOnOk),
      `Dual load failed: State OFF (Red:${redOff?.isPowered}, M1:${m1Off?.isPowered}), State ON (Green:${greenOn?.isPowered}, M2:${m2On?.isPowered})`
    );
  } catch (e: any) {
    reportTest("Test Case 11: DPDT Dual Motor & Dual LED Simulation", false, e.message);
  }

  // Test Case 12: Raspberry Pi Pico DPDT Dual Motor & Dual LED Preset Simulation
  try {
    const picoDualPreset = CIRCUIT_PRESETS.find((p) => p.id === "pico-dpdt-dual-motor-led");
    if (!picoDualPreset || !picoDualPreset.picoCode) {
      throw new Error("pico-dpdt-dual-motor-led preset or picoCode missing");
    }

    const context: any = {
      nodes: picoDualPreset.nodes,
      edges: picoDualPreset.edges,
      picoCode: picoDualPreset.picoCode,
      dynamicComponents: COMPONENT_CATALOG,
    };

    let stateOnOk = false;
    let stateOffOk = false;

    // Simulate 5 seconds (5000ms) in 200ms steps
    for (let timeMs = 0; timeMs <= 5000; timeMs += 200) {
      const stepFrame = buildSimulationFrame({
        tick: Math.floor(timeMs / 200),
        nodes: picoDualPreset.nodes,
        edges: picoDualPreset.edges,
        dynamicComponents: COMPONENT_CATALOG,
        boardType: "pico",
        arduinoState: {
          pins: new Map(),
          serialOutput: [],
          running: true,
          error: null,
        },
        running: true,
        timestamp: timeMs,
      });

      const picoFrame = applyPicoSimulationToFrame(stepFrame, context);
      const finalFrame = applyDpdtRelayInputToFrame(picoFrame, context);

      const greenLed = finalFrame.components["pdd-led-green"];
      const redLed = finalFrame.components["pdd-led-red"];
      const m1 = finalFrame.components["pdd-m1"];
      const m2 = finalFrame.components["pdd-m2"];

      // Check Relay ON (Green LED + Motor 2 ON)
      if (greenLed?.isPowered && m2?.isPowered && !redLed?.isPowered && !m1?.isPowered) {
        stateOnOk = true;
      }
      // Check Relay OFF (Red LED + Motor 1 ON)
      if (redLed?.isPowered && m1?.isPowered && !greenLed?.isPowered && !m2?.isPowered) {
        stateOffOk = true;
      }
    }

    reportTest(
      "Test Case 12: Raspberry Pi Pico DPDT Dual Motor & Dual LED Simulation",
      Boolean(stateOnOk && stateOffOk),
      `Pico Dual load failed: State ON=${stateOnOk}, State OFF=${stateOffOk}`
    );
  } catch (e: any) {
    reportTest("Test Case 12: Raspberry Pi Pico DPDT Dual Motor & Dual LED Simulation", false, e.message);
  }

  console.log("\n=================== INTEGRATION TEST SUMMARY ===================");
  console.log(`Total Test Cases: ${passedCount + failedCount}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log("===============================================================");

  return failedCount === 0;
}

if (require.main === module) {
  const ok = runDpdtRelayIntegrationTests();
  if (ok) {
    console.log("✅ All DPDT Relay integration tests passed 100%.");
  } else {
    console.error("❌ Some DPDT Relay integration tests failed.");
    process.exit(1);
  }
}
