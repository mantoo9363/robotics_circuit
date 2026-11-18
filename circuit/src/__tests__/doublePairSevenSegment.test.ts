import assert from "node:assert";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { buildSimulationFrame } from "../lib/simulation-state";
import {
  applyDoublePair7SegmentInputToFrame,
  resetDoublePair7SegmentState,
  type DoublePairDigitSegments,
} from "../lib/simulation/frameTransformers/DoublePair_7segmentDisplay";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import { nodeTypes } from "../components/nodes";

export function runDoublePairSevenSegmentTests(): boolean {
  console.log("=================== RUNNING DOUBLEPAIR 7-SEGMENT TEST SUITE ===================");
  let allPassed = true;

  const testWrapper = (name: string, fn: () => void) => {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
    } catch (e) {
      console.error(`  [FAIL] ${name}:`, e);
      allPassed = false;
    }
  };

  function createDoublePairNode(
    id = "disp_4d_1",
    displayType: "Common Cathode" | "Common Anode" = "Common Cathode",
    color = "red",
  ): CircuitNode {
    return {
      id,
      type: "doublePair7Segment",
      position: { x: 300, y: 100 },
      data: {
        componentType: "doublePair7Segment",
        label: "4-Digit Display",
        simulationModel: "doublePair7Segment",
        properties: {
          displayType: { label: "Type", type: "select" as const, value: displayType },
          color: { label: "Color", type: "select" as const, value: color },
        },
        rotation: 0,
      },
    };
  }

  // --- TEST 1: Component Catalog & NodeTypes Registration ---
  testWrapper("Catalog and nodeTypes registration", () => {
    const def = COMPONENT_CATALOG.find((c) => c.type === "doublePair7Segment");
    assert.ok(def, "doublePair7Segment must exist in COMPONENT_CATALOG");
    assert.strictEqual(def.pins.length, 16, "Must define 16 pins (12 multiplexed + 4 I2C/aux)");
    assert.ok(nodeTypes.doublePair7Segment, "doublePair7Segment must be registered in nodeTypes");
    assert.ok(
      nodeTypes.DoublePair_7segmentDisplay,
      "DoublePair_7segmentDisplay must be registered in nodeTypes",
    );
  });

  const unoNode: CircuitNode = {
    id: "uno_1",
    type: "arduino",
    position: { x: 50, y: 50 },
    data: {
      componentType: "arduino",
      label: "Arduino Uno",
      simulationModel: "arduino",
      properties: {},
      rotation: 0,
    },
  };

  const picoNode: CircuitNode = {
    id: "pico_1",
    type: "raspberrypipico",
    position: { x: 50, y: 50 },
    data: {
      componentType: "raspberrypipico",
      label: "Raspberry Pi Pico",
      simulationModel: "raspberrypipico",
      properties: {},
      rotation: 0,
    },
  };

  // --- TEST 2: Arduino Common Cathode with Series Resistor on Dig1 ---
  testWrapper("Arduino Common Cathode with Series Resistor on Dig1", () => {
    resetDoublePair7SegmentState();
    const dispCC = createDoublePairNode("disp_cc_1", "Common Cathode", "red");
    const resistorDig1: CircuitNode = {
      id: "res_dig1",
      type: "resistor",
      position: { x: 200, y: 50 },
      data: {
        componentType: "resistor",
        label: "220 Ohm Resistor",
        simulationModel: "resistor",
        properties: { resistance: { label: "Resistance", type: "number" as const, value: 220 } },
        rotation: 0,
      },
    };

    const nodes = [unoNode, dispCC, resistorDig1];
    const edges: CircuitEdge[] = [
      // DIG1 select -> Resistor pin1, Resistor pin2 -> Arduino D2 (LOW)
      { id: "e_res_dig1", source: "disp_cc_1", sourceHandle: "dig1", target: "res_dig1", targetHandle: "pin1" },
      { id: "e_res_uno", source: "res_dig1", sourceHandle: "pin2", target: "uno_1", targetHandle: "d2" },
      // Segment A -> Arduino D3 (HIGH)
      { id: "e_sega", source: "uno_1", sourceHandle: "d3", target: "disp_cc_1", targetHandle: "a" },
      // Segment B -> Arduino D4 (HIGH)
      { id: "e_segb", source: "uno_1", sourceHandle: "d4", target: "disp_cc_1", targetHandle: "b" },
    ];

    const mockPins = new Map<number, { mode: string; value: number }>();
    mockPins.set(2, { mode: "OUTPUT", value: 0 }); // dig1 LOW
    mockPins.set(3, { mode: "OUTPUT", value: 255 }); // D3 HIGH (5V)
    mockPins.set(4, { mode: "OUTPUT", value: 255 }); // D4 HIGH (5V)

    const context: any = {
      nodes,
      edges,
      picoCode: "",
      arduinoCode: "",
      selectedLanguage: "cpp",
      dynamicComponents: [],
      keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
      keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    };

    const frame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes,
      edges,
      dynamicComponents: [],
      boardType: "arduino",
      running: true,
      arduinoState: { pins: mockPins, serialOutput: [], running: true, error: null } as any,
    });

    const outFrame = applyDoublePair7SegmentInputToFrame(frame, context);
    const telemetry = outFrame.components?.["disp_cc_1"]?.telemetry;

    assert.ok(telemetry, "Telemetry must exist");
    assert.strictEqual(telemetry.displayType, "Common Cathode");
    assert.strictEqual(telemetry.burnt, false, "Must not burn with 220 ohm resistor on DIG1");
    assert.strictEqual(telemetry.hasResistor, true, "Must detect resistor");

    const digits: DoublePairDigitSegments[] = JSON.parse(String(telemetry.digitsState));
    assert.strictEqual(digits[0].a, true, "Digit 1 Segment A must be active");
    assert.strictEqual(digits[0].b, true, "Digit 1 Segment B must be active");
    assert.strictEqual(digits[0].c, false, "Digit 1 Segment C must be inactive");
  });

  // --- TEST 3: Common Anode Driving with 220 Ohm Series Resistor ---
  testWrapper("Common Anode Driving with 220 Ohm Resistor", () => {
    resetDoublePair7SegmentState();
    const dispCA = createDoublePairNode("disp_ca_1", "Common Anode", "blue");
    const resistorDig2: CircuitNode = {
      id: "res_dig2",
      type: "resistor",
      position: { x: 200, y: 50 },
      data: {
        componentType: "resistor",
        label: "220 Ohm Resistor",
        simulationModel: "resistor",
        properties: { resistance: { label: "Resistance", type: "number" as const, value: 220 } },
        rotation: 0,
      },
    };

    const nodes = [unoNode, dispCA, resistorDig2];
    const edges: CircuitEdge[] = [
      // DIG2 select -> Resistor pin1, Resistor pin2 -> Arduino D5 (HIGH / 5V)
      { id: "e_res_dig2", source: "disp_ca_1", sourceHandle: "dig2", target: "res_dig2", targetHandle: "pin1" },
      { id: "e_res_uno2", source: "res_dig2", sourceHandle: "pin2", target: "uno_1", targetHandle: "d5" },
      // Segment G -> Arduino D6 (LOW / 0V)
      { id: "e_segg", source: "uno_1", sourceHandle: "d6", target: "disp_ca_1", targetHandle: "g" },
    ];

    const mockPins = new Map<number, { mode: string; value: number }>();
    mockPins.set(5, { mode: "OUTPUT", value: 255 }); // dig2 HIGH (5V)
    mockPins.set(6, { mode: "OUTPUT", value: 0 }); // g LOW (0V)

    const context: any = {
      nodes,
      edges,
      picoCode: "",
      arduinoCode: "",
      selectedLanguage: "cpp",
      dynamicComponents: [],
      keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
      keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    };

    const frame = buildSimulationFrame({
      tick: 2,
      timestamp: 200,
      nodes,
      edges,
      dynamicComponents: [],
      boardType: "arduino",
      running: true,
      arduinoState: { pins: mockPins, serialOutput: [], running: true, error: null } as any,
    });

    // Provide 5V at resistor pin2
    frame.components["res_dig2"] = {
      nodeId: "res_dig2",
      componentType: "resistor",
      pins: {
        pin1: { handleId: "pin1", voltage: 5.0, normalizedValue: 1, active: true },
        pin2: { handleId: "pin2", voltage: 5.0, normalizedValue: 1, active: true },
      },
    } as any;

    const outFrame = applyDoublePair7SegmentInputToFrame(frame, context);
    const telemetry = outFrame.components?.["disp_ca_1"]?.telemetry;

    assert.ok(telemetry, "Telemetry must exist for Common Anode");
    assert.strictEqual(telemetry.burnt, false, "Must not burn with 220 ohm resistor");

    const digits: DoublePairDigitSegments[] = JSON.parse(String(telemetry.digitsState));
    assert.strictEqual(digits[1].g, true, "Digit 2 Segment G must be ON (CA)");
    assert.strictEqual(digits[1].a, false, "Digit 2 Segment A must be OFF");
    assert.strictEqual(digits[0].g, false, "Digit 1 Segment G must be OFF");
  });

  // --- TEST 4: Arduino Direct Unresisted 5V Overcurrent / Burnt State ---
  testWrapper("Arduino Direct Unresisted 5V Overcurrent (Burnt State)", () => {
    resetDoublePair7SegmentState();
    const dispBurn = createDoublePairNode("disp_burn_1", "Common Cathode", "red");
    const nodes = [unoNode, dispBurn];
    const edges: CircuitEdge[] = [
      { id: "e_dig1", source: "uno_1", sourceHandle: "d2", target: "disp_burn_1", targetHandle: "dig1" },
      { id: "e_sega", source: "uno_1", sourceHandle: "d3", target: "disp_burn_1", targetHandle: "a" },
    ];

    const mockPins = new Map<number, { mode: string; value: number }>();
    mockPins.set(2, { mode: "OUTPUT", value: 0 }); // dig1 LOW
    mockPins.set(3, { mode: "OUTPUT", value: 255 }); // D3 HIGH (5V unresisted)

    const context: any = {
      nodes,
      edges,
      picoCode: "",
      arduinoCode: "",
      selectedLanguage: "cpp",
      dynamicComponents: [],
      keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
      keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    };

    const frame = buildSimulationFrame({
      tick: 3,
      timestamp: 300,
      nodes,
      edges,
      dynamicComponents: [],
      boardType: "arduino",
      running: true,
      arduinoState: { pins: mockPins, serialOutput: [], running: true, error: null } as any,
    });

    const outFrame = applyDoublePair7SegmentInputToFrame(frame, context);
    const telemetry = outFrame.components?.["disp_burn_1"]?.telemetry;

    assert.ok(telemetry, "Telemetry must exist");
    assert.strictEqual(telemetry.burnt, true, "Direct unresisted 5V must trigger burnt = true");
    assert.strictEqual(telemetry.hasResistor, false, "hasResistor must be false");

    const displayDigits: DoublePairDigitSegments[] = JSON.parse(String(telemetry.digitsState));
    const rawDigits: DoublePairDigitSegments[] = JSON.parse(String(telemetry.rawDigitsState));
    assert.strictEqual(displayDigits[0].a, false, "Display digits must blank when burnt");
    assert.strictEqual(rawDigits[0].a, true, "Raw digits reflect logical pin state");
  });

  // --- TEST 5: Raspberry Pi Pico (3.3V MicroPython / C++) Driving ---
  testWrapper("Raspberry Pi Pico (3.3V) Compatibility with Series Resistor", () => {
    resetDoublePair7SegmentState();
    const dispPico = createDoublePairNode("disp_pico_1", "Common Cathode", "green");
    const resistorDig3: CircuitNode = {
      id: "res_dig3",
      type: "resistor",
      position: { x: 200, y: 50 },
      data: {
        componentType: "resistor",
        label: "220 Ohm Resistor",
        simulationModel: "resistor",
        properties: { resistance: { label: "Resistance", type: "number" as const, value: 220 } },
        rotation: 0,
      },
    };

    const nodes = [picoNode, dispPico, resistorDig3];
    const edges: CircuitEdge[] = [
      // DIG3 -> Resistor -> GP0 (0V)
      { id: "e_pico_res", source: "disp_pico_1", sourceHandle: "dig3", target: "res_dig3", targetHandle: "pin1" },
      { id: "e_pico_uno", source: "res_dig3", sourceHandle: "pin2", target: "pico_1", targetHandle: "gp0" },
      // GP1 -> Segment D (3.3V)
      { id: "e_pico_segd", source: "pico_1", sourceHandle: "gp1", target: "disp_pico_1", targetHandle: "d" },
      // GP2 -> Segment E (3.3V)
      { id: "e_pico_sege", source: "pico_1", sourceHandle: "gp2", target: "disp_pico_1", targetHandle: "e" },
    ];

    const context: any = {
      nodes,
      edges,
      picoCode: "",
      arduinoCode: "",
      selectedLanguage: "python",
      dynamicComponents: [],
      keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
      keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    };

    const frame = buildSimulationFrame({
      tick: 4,
      timestamp: 400,
      nodes,
      edges,
      dynamicComponents: [],
      boardType: "pico",
      running: true,
    });
    frame.boardPins = [
      { handleId: "pico_1:gp0", pin: 0, mode: "OUTPUT", voltage: 0, normalizedValue: 0, active: true, kind: "sink", value: 0 },
      { handleId: "pico_1:gp1", pin: 1, mode: "OUTPUT", voltage: 3.3, normalizedValue: 0.66, active: true, kind: "source", value: 255 },
      { handleId: "pico_1:gp2", pin: 2, mode: "OUTPUT", voltage: 3.3, normalizedValue: 0.66, active: true, kind: "source", value: 255 },
    ];

    const outFrame = applyDoublePair7SegmentInputToFrame(frame, context);
    const telemetry = outFrame.components?.["disp_pico_1"]?.telemetry;

    assert.ok(telemetry, "Pico telemetry must exist");
    assert.strictEqual(telemetry.burnt, false, "Must not burn on 3.3V Pico with 220 ohm resistor");

    const digits: DoublePairDigitSegments[] = JSON.parse(String(telemetry.digitsState));
    assert.strictEqual(digits[2].d, true, "Pico Digit 3 Segment D must be ON");
    assert.strictEqual(digits[2].e, true, "Pico Digit 3 Segment E must be ON");
    assert.strictEqual(digits[2].a, false, "Pico Digit 3 Segment A must be OFF");
  });

  // --- TEST 6: Multiplexing Persistence Across Frames ---
  testWrapper("Multiplexing Frame Persistence (Multi-Digit Scanning)", () => {
    resetDoublePair7SegmentState();
    const dispScan = createDoublePairNode("disp_scan_1", "Common Cathode", "yellow");
    const resistorDig: CircuitNode = {
      id: "res_dig_scan",
      type: "resistor",
      position: { x: 200, y: 50 },
      data: {
        componentType: "resistor",
        label: "220 Ohm Resistor",
        simulationModel: "resistor",
        properties: { resistance: { label: "Resistance", type: "number" as const, value: 220 } },
        rotation: 0,
      },
    };

    const nodes = [unoNode, dispScan, resistorDig];

    // Connect DIG1, DIG2 with resistor on DIG1 and Segments A, B
    const edges: CircuitEdge[] = [
      { id: "e_d1_res", source: "disp_scan_1", sourceHandle: "dig1", target: "res_dig_scan", targetHandle: "pin1" },
      { id: "e_d1_uno", source: "res_dig_scan", sourceHandle: "pin2", target: "uno_1", targetHandle: "d2" },
      { id: "e_d2", source: "uno_1", sourceHandle: "d3", target: "disp_scan_1", targetHandle: "dig2" },
      { id: "e_sa", source: "uno_1", sourceHandle: "d4", target: "disp_scan_1", targetHandle: "a" },
      { id: "e_sb", source: "uno_1", sourceHandle: "d5", target: "disp_scan_1", targetHandle: "b" },
    ];

    const context: any = {
      nodes,
      edges,
      picoCode: "",
      arduinoCode: "",
      selectedLanguage: "cpp",
      dynamicComponents: [],
      keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
      keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    };

    // Frame 1: Scanning Digit 1 (DIG1=LOW, DIG2=HIGH, Segment A=HIGH)
    const pinsF1 = new Map<number, { mode: string; value: number }>();
    pinsF1.set(2, { mode: "OUTPUT", value: 0 }); // DIG1 Active
    pinsF1.set(3, { mode: "OUTPUT", value: 255 }); // DIG2 Inactive
    pinsF1.set(4, { mode: "OUTPUT", value: 255 }); // Seg A Active
    pinsF1.set(5, { mode: "OUTPUT", value: 0 }); // Seg B Inactive

    const frame1 = buildSimulationFrame({
      tick: 10,
      timestamp: 1000,
      nodes,
      edges,
      dynamicComponents: [],
      boardType: "arduino",
      running: true,
      arduinoState: { pins: pinsF1, serialOutput: [], running: true, error: null } as any,
    });
    const out1 = applyDoublePair7SegmentInputToFrame(frame1, context);
    const tel1 = out1.components?.["disp_scan_1"]?.telemetry;
    const rawDigits1: DoublePairDigitSegments[] = JSON.parse(String(tel1.rawDigitsState));
    assert.strictEqual(rawDigits1[0].a, true, "Frame 1: Digit 1 Seg A active");

    // Frame 2: Scanning Digit 2 (DIG1=HIGH, DIG2=LOW, Segment B=HIGH)
    const pinsF2 = new Map<number, { mode: string; value: number }>();
    pinsF2.set(2, { mode: "OUTPUT", value: 255 }); // DIG1 Inactive
    pinsF2.set(3, { mode: "OUTPUT", value: 0 }); // DIG2 Active
    pinsF2.set(4, { mode: "OUTPUT", value: 0 }); // Seg A Inactive
    pinsF2.set(5, { mode: "OUTPUT", value: 255 }); // Seg B Active

    const frame2 = buildSimulationFrame({
      tick: 11,
      timestamp: 1010,
      nodes,
      edges,
      dynamicComponents: [],
      boardType: "arduino",
      running: true,
      arduinoState: { pins: pinsF2, serialOutput: [], running: true, error: null } as any,
    });
    const out2 = applyDoublePair7SegmentInputToFrame(frame2, context);
    const tel2 = out2.components?.["disp_scan_1"]?.telemetry;
    const rawDigits2: DoublePairDigitSegments[] = JSON.parse(String(tel2.rawDigitsState));

    // Verify persistence: Digit 1 should retain Seg A ON while Digit 2 has Seg B ON
    assert.strictEqual(rawDigits2[0].a, true, "Persistence: Digit 1 Seg A must stay retained");
    assert.strictEqual(rawDigits2[1].b, true, "Digit 2 Seg B must now be active");
  });

  // --- TEST 7: Common Cathode Missing GND / Floating Digits Stays Completely OFF ---
  testWrapper("Common Cathode Missing GND / Floating Digits stays completely OFF", () => {
    resetDoublePair7SegmentState();
    const dispNoGnd = createDoublePairNode("disp_nognd_1", "Common Cathode", "red");
    const nodes = [unoNode, dispNoGnd];
    // Connect segments to 5V (HIGH), but DO NOT connect dig1..dig4 or gnd
    const edges: CircuitEdge[] = [
      { id: "e_sa", source: "uno_1", sourceHandle: "d2", target: "disp_nognd_1", targetHandle: "a" },
      { id: "e_sb", source: "uno_1", sourceHandle: "d3", target: "disp_nognd_1", targetHandle: "b" },
      { id: "e_sc", source: "uno_1", sourceHandle: "d4", target: "disp_nognd_1", targetHandle: "c" },
      { id: "e_sd", source: "uno_1", sourceHandle: "d5", target: "disp_nognd_1", targetHandle: "d" },
    ];

    const mockPins = new Map<number, { mode: string; value: number }>();
    mockPins.set(2, { mode: "OUTPUT", value: 255 }); // 5V
    mockPins.set(3, { mode: "OUTPUT", value: 255 }); // 5V
    mockPins.set(4, { mode: "OUTPUT", value: 255 }); // 5V
    mockPins.set(5, { mode: "OUTPUT", value: 255 }); // 5V

    const context: any = {
      nodes,
      edges,
      picoCode: "",
      arduinoCode: "",
      selectedLanguage: "cpp",
      dynamicComponents: [],
      keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
      keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    };

    const frame = buildSimulationFrame({
      tick: 20,
      timestamp: 2000,
      nodes,
      edges,
      dynamicComponents: [],
      boardType: "arduino",
      running: true,
      arduinoState: { pins: mockPins, serialOutput: [], running: true, error: null } as any,
    });

    const outFrame = applyDoublePair7SegmentInputToFrame(frame, context);
    const telemetry = outFrame.components?.["disp_nognd_1"]?.telemetry;

    assert.ok(telemetry, "Telemetry must exist");
    const digits: DoublePairDigitSegments[] = JSON.parse(String(telemetry.digitsState));
    // Verify all digits and segments are completely OFF because GND / dig cathode is not connected
    for (let d = 0; d < 4; d++) {
      assert.strictEqual(digits[d].a, false, `Digit ${d + 1} Seg A must be OFF without GND`);
      assert.strictEqual(digits[d].b, false, `Digit ${d + 1} Seg B must be OFF without GND`);
      assert.strictEqual(digits[d].c, false, `Digit ${d + 1} Seg C must be OFF without GND`);
      assert.strictEqual(digits[d].d, false, `Digit ${d + 1} Seg D must be OFF without GND`);
    }
  });

  // --- TEST 8: Common Anode Missing VCC / Floating Digits Stays Completely OFF ---
  testWrapper("Common Anode Missing VCC / Floating Digits stays completely OFF", () => {
    resetDoublePair7SegmentState();
    const dispNoVcc = createDoublePairNode("disp_novcc_1", "Common Anode", "red");
    const nodes = [unoNode, dispNoVcc];
    // Connect segments to 0V (LOW / Ground), but DO NOT connect dig1..dig4 or vcc
    const edges: CircuitEdge[] = [
      { id: "e_sa", source: "uno_1", sourceHandle: "d2", target: "disp_novcc_1", targetHandle: "a" },
      { id: "e_sb", source: "uno_1", sourceHandle: "d3", target: "disp_novcc_1", targetHandle: "b" },
    ];

    const mockPins = new Map<number, { mode: string; value: number }>();
    mockPins.set(2, { mode: "OUTPUT", value: 0 }); // 0V / sink
    mockPins.set(3, { mode: "OUTPUT", value: 0 }); // 0V / sink

    const context: any = {
      nodes,
      edges,
      picoCode: "",
      arduinoCode: "",
      selectedLanguage: "cpp",
      dynamicComponents: [],
      keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
      keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    };

    const frame = buildSimulationFrame({
      tick: 21,
      timestamp: 2100,
      nodes,
      edges,
      dynamicComponents: [],
      boardType: "arduino",
      running: true,
      arduinoState: { pins: mockPins, serialOutput: [], running: true, error: null } as any,
    });

    const outFrame = applyDoublePair7SegmentInputToFrame(frame, context);
    const telemetry = outFrame.components?.["disp_novcc_1"]?.telemetry;

    assert.ok(telemetry, "Telemetry must exist");
    const digits: DoublePairDigitSegments[] = JSON.parse(String(telemetry.digitsState));
    // Verify all digits and segments are completely OFF because VCC / dig anode is not connected
    for (let d = 0; d < 4; d++) {
      assert.strictEqual(digits[d].a, false, `Digit ${d + 1} Seg A must be OFF without VCC`);
      assert.strictEqual(digits[d].b, false, `Digit ${d + 1} Seg B must be OFF without VCC`);
    }
  });

  // --- TEST 9: Shared Module GND / VCC Closed Circuit Driving ---
  testWrapper("Shared Module GND / VCC header pin driving", () => {
    resetDoublePair7SegmentState();
    const dispModule = createDoublePairNode("disp_mod_1", "Common Cathode", "blue");
    const resistorGnd: CircuitNode = {
      id: "res_gnd_mod",
      type: "resistor",
      position: { x: 200, y: 50 },
      data: {
        componentType: "resistor",
        label: "220 Ohm Resistor",
        simulationModel: "resistor",
        properties: { resistance: { label: "Resistance", type: "number" as const, value: 220 } },
        rotation: 0,
      },
    };

    const nodes = [unoNode, dispModule, resistorGnd];
    // Connect gnd via 220 ohm resistor to Uno GND, and Seg A to Uno D2 (5V)
    const edges: CircuitEdge[] = [
      { id: "e_gnd_res", source: "disp_mod_1", sourceHandle: "gnd", target: "res_gnd_mod", targetHandle: "pin1" },
      { id: "e_gnd_uno", source: "res_gnd_mod", sourceHandle: "pin2", target: "uno_1", targetHandle: "gnd" },
      { id: "e_sega", source: "uno_1", sourceHandle: "d2", target: "disp_mod_1", targetHandle: "a" },
    ];

    const mockPins = new Map<number, { mode: string; value: number }>();
    mockPins.set(2, { mode: "OUTPUT", value: 255 }); // 5V

    const context: any = {
      nodes,
      edges,
      picoCode: "",
      arduinoCode: "",
      selectedLanguage: "cpp",
      dynamicComponents: [],
      keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
      keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    };

    const frame = buildSimulationFrame({
      tick: 22,
      timestamp: 2200,
      nodes,
      edges,
      dynamicComponents: [],
      boardType: "arduino",
      running: true,
      arduinoState: { pins: mockPins, serialOutput: [], running: true, error: null } as any,
    });

    const outFrame = applyDoublePair7SegmentInputToFrame(frame, context);
    const telemetry = outFrame.components?.["disp_mod_1"]?.telemetry;

    assert.ok(telemetry, "Telemetry must exist");
    const digits: DoublePairDigitSegments[] = JSON.parse(String(telemetry.digitsState));
    // When global GND is connected and no multiplex dig pins are isolated, all digits display the segment
    assert.strictEqual(digits[0].a, true, "Digit 1 Seg A must be ON with module GND connected");
    assert.strictEqual(digits[1].a, true, "Digit 2 Seg A must be ON with module GND connected");
    assert.strictEqual(digits[2].a, true, "Digit 3 Seg A must be ON with module GND connected");
    assert.strictEqual(digits[3].a, true, "Digit 4 Seg A must be ON with module GND connected");
  });

  return allPassed;
}

if (
  process.argv[1]?.endsWith("doublePairSevenSegment.test.ts") ||
  process.argv[1]?.endsWith("doublePairSevenSegment.test.js")
) {
  const ok = runDoublePairSevenSegmentTests();
  process.exit(ok ? 0 : 1);
}
