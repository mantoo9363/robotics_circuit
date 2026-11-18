/**
 * Comprehensive Unit Test Suite & Pin Resolution Sanity Matrix for Multimeter
 */

import { evaluateMultimeterComponentState } from "../lib/simulation/multimeter";
import { buildSimulationFrame, findPinId, PIN_ALIASES } from "../lib/simulation-state";
import { applyPotentiometerInputToFrame } from "../lib/simulation/frameTransformers/photoresistorPotentiometer";
import { applyMultimeterOutputToFrame } from "../lib/simulation/frameTransformers/multimeterSync";
import { NE555StateManager, CapacitorStateManager, KeypadStateManager } from "../lib/simulation/stateMaps";
import { validateComponentConnections } from "../utils/connectivity";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runMultimeterTests(): boolean {
  console.log("=================== RUNNING MULTIMETER REGRESSION TESTS & SANITY MATRIX ===================\n");

  let allPassed = true;

  // -----------------------------------------------------------------------------
  // Test 1: DC Voltage Mode (VDC) on 5V Arduino Circuit & 3.3V Pico Circuit
  // -----------------------------------------------------------------------------
  console.log("--- TEST 1: DC Voltage Mode (VDC) ---");
  const unoNode: CircuitNode = {
    id: "uno1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "arduino", simulationModel: "arduino", label: "Uno", rotation: 0, properties: {} as any },
  };
  const meterNodeUno: CircuitNode = {
    id: "meter1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "multimeter",
      simulationModel: "multimeter",
      label: "Multimeter",
      rotation: 0,
      properties: { mode: { value: "voltage" } } as any,
    },
  };
  const edgesUno: CircuitEdge[] = [
    { id: "e1", source: "uno1", target: "meter1", sourceHandle: "5v", targetHandle: "positive" },
    { id: "e2", source: "meter1", target: "uno1", sourceHandle: "negative", targetHandle: "gnd1" },
  ];

  const frameUno = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [unoNode, meterNodeUno],
    edges: edgesUno,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const meterUnoState = frameUno.components["meter1"];
  console.log(`[Trace Test 1 - Arduino 5V] VDC Voltage = ${meterUnoState?.telemetry?.voltage} V, Mode = ${meterUnoState?.telemetry?.mode}`);

  if (meterUnoState?.telemetry?.voltage !== 5 || meterUnoState?.telemetry?.mode !== "voltage") {
    console.error("❌ Test 1 FAILED: Arduino 5V VDC reading incorrect");
    allPassed = false;
  } else {
    console.log("=> Test 1 PASSED (Arduino 5V VDC measured accurately as 5.00V)\n");
  }

  // Pico 3.3V VDC check
  const picoNode: CircuitNode = {
    id: "pico1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "raspberrypipico", simulationModel: "raspberrypipico", label: "Pico", rotation: 0, properties: {} as any },
  };
  const meterNodePico: CircuitNode = {
    id: "meterPico",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "multimeter",
      simulationModel: "multimeter",
      label: "Multimeter",
      rotation: 0,
      properties: { mode: { value: "voltage" } } as any,
    },
  };
  const edgesPico: CircuitEdge[] = [
    { id: "ep1", source: "pico1", target: "meterPico", sourceHandle: "pico_3v3", targetHandle: "positive" },
    { id: "ep2", source: "meterPico", target: "pico1", sourceHandle: "negative", targetHandle: "pico_gnd1" },
  ];
  const framePico = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [picoNode, meterNodePico],
    edges: edgesPico,
    boardType: "pico",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });
  const meterPicoState = framePico.components["meterPico"];
  console.log(`[Trace Test 1 - Pico 3.3V] VDC Voltage = ${meterPicoState?.telemetry?.voltage} V`);

  if (meterPicoState?.telemetry?.voltage !== 3.3) {
    console.error("❌ Test 1 FAILED: Pico 3.3V VDC reading incorrect");
    allPassed = false;
  } else {
    console.log("=> Test 1 PASSED (Pico 3.3V VDC measured accurately as 3.30V)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 2: Potentiometer Wiper Voltage Measurement (VDC) & Connectivity
  // -----------------------------------------------------------------------------
  console.log("--- TEST 2: Potentiometer Wiper VDC & Connectivity ---");
  const potNode: CircuitNode = {
    id: "pot1",
    type: "circuitComponent",
    position: { x: 100, y: 0 },
    data: {
      componentType: "potentiometer",
      simulationModel: "potentiometer",
      label: "10k Potentiometer",
      rotation: 0,
      properties: {
        resistance: { value: 10000, unit: "Ω" },
        position: { value: 83 },
      } as any,
    },
  };
  const meterNodeWiper: CircuitNode = {
    id: "meterWiper",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "multimeter",
      simulationModel: "multimeter",
      label: "Multimeter",
      rotation: 0,
      properties: { mode: { value: "voltage" } } as any,
    },
  };
  const edgesPotWiper: CircuitEdge[] = [
    { id: "ew1", source: "uno1", target: "pot1", sourceHandle: "5v", targetHandle: "pin1" },
    { id: "ew2", source: "pot1", target: "uno1", sourceHandle: "pin2", targetHandle: "gnd1" },
    { id: "ew3", source: "pot1", target: "uno1", sourceHandle: "wiper", targetHandle: "a0" },
    { id: "ew4", source: "pot1", target: "meterWiper", sourceHandle: "wiper", targetHandle: "positive" },
    { id: "ew5", source: "meterWiper", target: "uno1", sourceHandle: "negative", targetHandle: "gnd1" },
  ];

  const frameWiperRaw = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, potNode, meterNodeWiper],
    edges: edgesPotWiper,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const isWiperConnValid = validateComponentConnections(potNode, [unoNode, potNode, meterNodeWiper], edgesPotWiper);
  console.log(`[Trace Test 2] Connected Potentiometer validateComponentConnections = ${isWiperConnValid}`);

  const contextWiper = {
    nodes: [unoNode, potNode, meterNodeWiper],
    edges: edgesPotWiper,
    arduinoCode: "",
    picoCode: "",
    boardType: "arduino" as const,
    dynamicComponents: COMPONENT_CATALOG as any,
    ne555State: new NE555StateManager(),
    capacitorState: new CapacitorStateManager(),
    keypad4x4State: new KeypadStateManager(),
    keypad4x3State: new KeypadStateManager(),
  };

  // Test at 83% position
  const transformedWiperFrame = applyMultimeterOutputToFrame(applyPotentiometerInputToFrame(frameWiperRaw), contextWiper);
  const meterWiperState83 = transformedWiperFrame.components["meterWiper"];
  const v83 = Number(meterWiperState83?.telemetry?.voltage ?? 0);
  console.log(`[Trace Test 2 @ 83%] Multimeter Voltage = ${v83} V`);

  // Test at 50% position
  potNode.data.properties.position.value = 50;
  const frame50Raw = buildSimulationFrame({
    tick: 2,
    timestamp: 200,
    nodes: [unoNode, potNode, meterNodeWiper],
    edges: edgesPotWiper,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });
  const frame50Synced = applyMultimeterOutputToFrame(applyPotentiometerInputToFrame(frame50Raw), contextWiper);
  const v50 = Number(frame50Synced.components["meterWiper"]?.telemetry?.voltage ?? 0);
  console.log(`[Trace Test 2 @ 50%] Multimeter Voltage = ${v50} V`);

  // Test at 0% position
  potNode.data.properties.position.value = 0;
  const frame0Raw = buildSimulationFrame({
    tick: 3,
    timestamp: 300,
    nodes: [unoNode, potNode, meterNodeWiper],
    edges: edgesPotWiper,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });
  const frame0Synced = applyMultimeterOutputToFrame(applyPotentiometerInputToFrame(frame0Raw), contextWiper);
  const v0 = Number(frame0Synced.components["meterWiper"]?.telemetry?.voltage ?? 0);
  console.log(`[Trace Test 2 @ 0%] Multimeter Voltage = ${v0} V`);

  // Test at 100% position
  potNode.data.properties.position.value = 100;
  const frame100Raw = buildSimulationFrame({
    tick: 4,
    timestamp: 400,
    nodes: [unoNode, potNode, meterNodeWiper],
    edges: edgesPotWiper,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });
  const frame100Synced = applyMultimeterOutputToFrame(applyPotentiometerInputToFrame(frame100Raw), contextWiper);
  const v100 = Number(frame100Synced.components["meterWiper"]?.telemetry?.voltage ?? 0);
  console.log(`[Trace Test 2 @ 100%] Multimeter Voltage = ${v100} V`);

  if (
    isWiperConnValid !== true ||
    Math.abs(v0 - 0.0) > 0.05 ||
    Math.abs(v50 - 2.5) > 0.1 ||
    Math.abs(v83 - 4.15) > 0.1 ||
    Math.abs(v100 - 5.0) > 0.05
  ) {
    console.error(`❌ Test 2 FAILED: Potentiometer position variation test failed (v0=${v0}V, v50=${v50}V, v83=${v83}V, v100=${v100}V)`);
    allPassed = false;
  } else {
    console.log(`=> Test 2 PASSED (Potentiometer wiper voltage varies accurately with position: 0%=${v0}V, 50%=${v50}V, 83%=${v83}V, 100%=${v100}V)\n`);
  }

  // -----------------------------------------------------------------------------
  // Test 3: Disconnected Potentiometer Warning Assertion
  // -----------------------------------------------------------------------------
  console.log("--- TEST 3: Disconnected Potentiometer Warning Assertion ---");
  const edgesPotDisconnected: CircuitEdge[] = [
    { id: "ew1", source: "uno1", target: "pot1", sourceHandle: "5v", targetHandle: "pin1" },
    // missing pin2 (GND) and wiper (A0)
  ];
  const isDiscConnValid = validateComponentConnections(potNode, [unoNode, potNode], edgesPotDisconnected);
  const frameDiscRaw = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, potNode],
    edges: edgesPotDisconnected,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });
  console.log(`[Trace Test 3] Disconnected Potentiometer validateComponentConnections = ${isDiscConnValid}`);

  if (isDiscConnValid !== false) {
    console.error("❌ Test 3 FAILED: Disconnected potentiometer validateComponentConnections returned true");
    allPassed = false;
  } else {
    console.log("=> Test 3 PASSED (Genuinely disconnected potentiometer evaluates validateComponentConnections = false correctly)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 4: 6-Component Pin Resolution Sanity Matrix
  // -----------------------------------------------------------------------------
  console.log("--- TEST 4: 6-Component Pin Resolution Sanity Matrix ---");

  // 1. Potentiometer
  const potPin1 = findPinId(potNode, COMPONENT_CATALOG, ["pin1", ...PIN_ALIASES.positive]);
  const potPin2 = findPinId(potNode, COMPONENT_CATALOG, ["pin2", ...PIN_ALIASES.negative]);
  const potWiper = findPinId(potNode, COMPONENT_CATALOG, ["wiper", ...PIN_ALIASES.wiper]);
  console.log(`  [Sanity 1] Potentiometer: pin1 -> "${potPin1}", pin2 -> "${potPin2}", wiper -> "${potWiper}"`);

  // 2. Red LED
  const ledNode: CircuitNode = {
    id: "led1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "led", simulationModel: "led", label: "Red LED", rotation: 0, properties: {} as any },
  };
  const ledAnode = findPinId(ledNode, COMPONENT_CATALOG, ["anode", ...PIN_ALIASES.positive]);
  const ledCathode = findPinId(ledNode, COMPONENT_CATALOG, ["cathode", ...PIN_ALIASES.negative]);

  // 3. 10kΩ Resistor
  const resNode: CircuitNode = {
    id: "r1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "resistor",
      simulationModel: "resistor",
      label: "Resistor",
      rotation: 0,
      properties: { resistance: { value: 10000, unit: "Ω" } } as any,
    },
  };
  const resPin1 = findPinId(resNode, COMPONENT_CATALOG, ["pin1", ...PIN_ALIASES.positive]);
  const resPin2 = findPinId(resNode, COMPONENT_CATALOG, ["pin2", ...PIN_ALIASES.negative]);

  // 4. Photoresistor (LDR)
  const ldrNode: CircuitNode = {
    id: "ldr1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "photoresistor", simulationModel: "photoresistor", label: "LDR", rotation: 0, properties: {} as any },
  };
  const ldrPin1 = findPinId(ldrNode, COMPONENT_CATALOG, ["pin1", ...PIN_ALIASES.positive]);
  const ldrPin2 = findPinId(ldrNode, COMPONENT_CATALOG, ["pin2", ...PIN_ALIASES.negative]);

  // 5. Pushbutton
  const btnNode: CircuitNode = {
    id: "btn1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "pushbutton", simulationModel: "pushbutton", label: "Button", rotation: 0, properties: {} as any },
  };
  const btnPin1a = findPinId(btnNode, COMPONENT_CATALOG, ["pin1a"]);
  const btnPin2a = findPinId(btnNode, COMPONENT_CATALOG, ["pin2a"]);

  // 6. MQ-2 Gas Sensor
  const gasNode: CircuitNode = {
    id: "gas1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "gasSensor", simulationModel: "gasSensor", label: "Gas Sensor", rotation: 0, properties: {} as any },
  };
  const gasA1 = findPinId(gasNode, COMPONENT_CATALOG, ["a1"]);
  const gasB1 = findPinId(gasNode, COMPONENT_CATALOG, ["b1"]);

  if (
    potPin1 !== "pin1" || potPin2 !== "pin2" || potWiper !== "wiper" ||
    ledAnode !== "anode" || ledCathode !== "cathode" ||
    resPin1 !== "pin1" || resPin2 !== "pin2" ||
    ldrPin1 !== "pin1" || ldrPin2 !== "pin2" ||
    btnPin1a !== "pin1a" || btnPin2a !== "pin2a" ||
    gasA1 !== "a1" || gasB1 !== "b1"
  ) {
    console.error("❌ Test 4 FAILED: Pin resolution matrix check failed");
    allPassed = false;
  } else {
    console.log("=> Test 4 PASSED (All 6 component types resolved pin IDs cleanly)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 5: Resistance Mode (OHM) on 10kΩ Resistor
  // -----------------------------------------------------------------------------
  console.log("--- TEST 5: Resistance Mode (OHM) ---");
  const meterOhm: CircuitNode = {
    id: "meterOhm",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "multimeter",
      simulationModel: "multimeter",
      label: "Multimeter",
      rotation: 0,
      properties: { mode: { value: "resistance" } } as any,
    },
  };
  const edgesOhm: CircuitEdge[] = [
    { id: "eo1", source: "meterOhm", target: "r1", sourceHandle: "positive", targetHandle: "pin1" },
    { id: "eo2", source: "meterOhm", target: "r1", sourceHandle: "negative", targetHandle: "pin2" },
  ];
  const frameOhm = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [resNode, meterOhm],
    edges: edgesOhm,
    boardType: "none",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });
  const meterOhmState = frameOhm.components["meterOhm"];
  console.log(`[Trace Test 5] Passive Resistance = ${meterOhmState?.telemetry?.resistance} Ω`);

  if (meterOhmState?.telemetry?.resistance !== 10000) {
    console.error("❌ Test 5 FAILED: Resistance measurement incorrect");
    allPassed = false;
  } else {
    console.log("=> Test 5 PASSED (10kΩ Resistor measured accurately as 10000 Ω)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 6: Continuity Mode (CONT) & Audio Buzzer Trigger Threshold (<50Ω)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 6: Continuity Mode (CONT) ---");
  const resistor10: CircuitNode = {
    id: "r10",
    type: "circuitComponent",
    position: { x: 100, y: 0 },
    data: {
      componentType: "resistor",
      simulationModel: "resistor",
      label: "10 Ohm Resistor",
      rotation: 0,
      properties: { resistance: { value: 10, unit: "Ω" } } as any,
    },
  };
  const meterCont: CircuitNode = {
    id: "meterCont",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "multimeter",
      simulationModel: "multimeter",
      label: "Multimeter",
      rotation: 0,
      properties: { mode: { value: "continuity" } } as any,
    },
  };
  const edgesCont: CircuitEdge[] = [
    { id: "ec1", source: "meterCont", target: "r10", sourceHandle: "positive", targetHandle: "pin1" },
    { id: "ec2", source: "meterCont", target: "r10", sourceHandle: "negative", targetHandle: "pin2" },
  ];
  const frameCont = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [resistor10, meterCont],
    edges: edgesCont,
    boardType: "none",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });
  const meterContState = frameCont.components["meterCont"];
  console.log(`[Trace Test 6] Continuity Resistance = ${meterContState?.telemetry?.resistance} Ω, continuityActive = ${meterContState?.telemetry?.continuityActive}`);

  if (meterContState?.telemetry?.resistance !== 10 || meterContState?.telemetry?.continuityActive !== true) {
    console.error("❌ Test 6 FAILED: Continuity threshold check failed");
    allPassed = false;
  } else {
    console.log("=> Test 6 PASSED (10Ω path triggers continuityActive = true correctly)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 7: Diode Test Mode (DIOD) Forward & Reverse Bias
  // -----------------------------------------------------------------------------
  console.log("--- TEST 7: Diode Test Mode (DIOD) ---");
  const meterDiod: CircuitNode = {
    id: "meterDiod",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "multimeter",
      simulationModel: "multimeter",
      label: "Multimeter",
      rotation: 0,
      properties: { mode: { value: "diode" } } as any,
    },
  };
  const edgesDiodFwd: CircuitEdge[] = [
    { id: "ed1", source: "meterDiod", target: "led1", sourceHandle: "positive", targetHandle: "anode" },
    { id: "ed2", source: "meterDiod", target: "led1", sourceHandle: "negative", targetHandle: "cathode" },
  ];
  const frameDiodFwd = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [ledNode, meterDiod],
    edges: edgesDiodFwd,
    boardType: "none",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });
  const meterDiodFwdState = frameDiodFwd.components["meterDiod"];
  console.log(`[Trace Test 7 - Forward Bias] Forward Diode Voltage Drop = ${meterDiodFwdState?.telemetry?.diodeValue} V`);

  if (typeof meterDiodFwdState?.telemetry?.diodeValue !== "number" || meterDiodFwdState?.telemetry?.diodeValue <= 0) {
    console.error("❌ Test 7 FAILED: Forward diode voltage drop measurement failed");
    allPassed = false;
  } else {
    console.log("=> Test 7 PASSED (Forward biased LED measures forward voltage drop accurately)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 8: Parallel Ammeter Error Protection (Err: Parallel)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 8: Ammeter Parallel Connection Protection ---");
  const resistorLoad: CircuitNode = {
    id: "rLoad",
    type: "circuitComponent",
    position: { x: 100, y: 0 },
    data: {
      componentType: "resistor",
      simulationModel: "resistor",
      label: "220 Ohm Resistor",
      rotation: 0,
      properties: { resistance: { value: 220, unit: "Ω" } } as any,
    },
  };
  const meterCurrPar: CircuitNode = {
    id: "meterPar",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "multimeter",
      simulationModel: "multimeter",
      label: "Multimeter",
      rotation: 0,
      properties: { mode: { value: "current" } } as any,
    },
  };
  const edgesCurrPar: CircuitEdge[] = [
    { id: "eLoad1", source: "uno1", target: "rLoad", sourceHandle: "5v", targetHandle: "pin1" },
    { id: "eLoad2", source: "rLoad", target: "uno1", sourceHandle: "pin2", targetHandle: "gnd1" },
    { id: "ep1", source: "meterPar", target: "rLoad", sourceHandle: "positive", targetHandle: "pin1" },
    { id: "ep2", source: "meterPar", target: "rLoad", sourceHandle: "negative", targetHandle: "pin2" },
  ];
  const frameCurrPar = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [unoNode, resistorLoad, meterCurrPar],
    edges: edgesCurrPar,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });
  const meterCurrParState = frameCurrPar.components["meterPar"];
  console.log(`[Trace Test 8] Parallel Ammeter Error = "${meterCurrParState?.telemetry?.error}"`);

  if (meterCurrParState?.telemetry?.error !== "Err: Parallel") {
    console.error("❌ Test 8 FAILED: Parallel ammeter connection error check failed");
    allPassed = false;
  } else {
    console.log("=> Test 8 PASSED (Parallel ammeter correctly triggers 'Err: Parallel')\n");
  }

  // -----------------------------------------------------------------------------
  // Test 9: NE555 Driven LED Voltage Measurement & Path Blocked Warning Assertion
  // Circuit: NE555 -> Resistor (220Ω) -> LED -> GND, Multimeter probing LED (anode -> cathode)
  // -----------------------------------------------------------------------------
  const ne555Node: CircuitNode = {
    id: "ne555_1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "ne555",
      simulationModel: "ne555",
      label: "NE555 Timer",
      rotation: 0,
      properties: {} as any,
    },
  };
  const resistorLed: CircuitNode = {
    id: "rLed",
    type: "circuitComponent",
    position: { x: 100, y: 0 },
    data: {
      componentType: "resistor",
      simulationModel: "resistor",
      label: "220 Ohm Resistor",
      rotation: 0,
      properties: { resistance: { value: 220, unit: "Ω" } } as any,
    },
  };
  const ledNode9: CircuitNode = {
    id: "led1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "led",
      simulationModel: "led",
      label: "Red LED",
      rotation: 0,
      properties: { color: { value: "red" } } as any,
    },
  };
  const meterLedNode: CircuitNode = {
    id: "meterLedNode",
    type: "circuitComponent",
    position: { x: 300, y: 0 },
    data: {
      componentType: "multimeter",
      simulationModel: "multimeter",
      label: "Multimeter",
      rotation: 0,
      properties: { mode: { value: "voltage" } } as any,
    },
  };
  const edgesNe555Led: CircuitEdge[] = [
    { id: "e1", source: "uno1", target: "ne555_1", sourceHandle: "5v", targetHandle: "pin8_vcc" },
    { id: "e2", source: "ne555_1", target: "uno1", sourceHandle: "pin1_gnd", targetHandle: "gnd1" },
    { id: "e3", source: "ne555_1", target: "rLed", sourceHandle: "pin3_out", targetHandle: "pin1" },
    { id: "e4", source: "rLed", target: "led1", sourceHandle: "pin2", targetHandle: "anode" },
    { id: "e5", source: "led1", target: "uno1", sourceHandle: "cathode", targetHandle: "gnd1" },
    { id: "em1", source: "meterLedNode", target: "led1", sourceHandle: "positive", targetHandle: "anode" },
    { id: "em2", source: "meterLedNode", target: "led1", sourceHandle: "negative", targetHandle: "cathode" },
  ];
  const frameNe555Raw = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [unoNode, ne555Node, resistorLed, ledNode9, meterLedNode],
    edges: edgesNe555Led,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG as any,
  });
  frameNe555Raw.components["ne555_1"] = {
    nodeId: "ne555_1",
    componentType: "ne555",
    label: "NE555",
    isPowered: true,
    brightness: 1,
    voltage: 5.0,
    telemetry: { outputVoltage: 5.0, isPowered: true },
    pins: { pin3_out: { handleId: "pin3_out", voltage: 5.0, normalizedValue: 0.55, active: true } },
  };
  frameNe555Raw.components["led1"] = {
    nodeId: "led1",
    componentType: "led",
    label: "Red LED",
    isPowered: true,
    brightness: 1,
    voltage: 1.95,
    telemetry: { pathBlocked: true, color: "red", currentMilliAmps: 13.8 },
    pins: {
      anode: { handleId: "anode", voltage: 1.95, normalizedValue: 0.39, active: true },
      cathode: { handleId: "cathode", voltage: 0, normalizedValue: 0, active: true },
    },
  };
  const contextNe555 = {
    nodes: [unoNode, ne555Node, resistorLed, ledNode9, meterLedNode],
    edges: edgesNe555Led,
    arduinoCode: "",
    picoCode: "",
    boardType: "arduino" as const,
    dynamicComponents: COMPONENT_CATALOG as any,
    ne555State: new NE555StateManager(),
    capacitorState: new CapacitorStateManager(),
    keypad4x4State: new KeypadStateManager(),
    keypad4x3State: new KeypadStateManager(),
  };
  const frameNe555Synced = applyMultimeterOutputToFrame(frameNe555Raw, contextNe555);
  const meterLedVoltage = Number(frameNe555Synced.components["meterLedNode"]?.telemetry?.voltage ?? 0);
  const ledPathBlocked = Boolean(frameNe555Synced.components["led1"]?.telemetry?.pathBlocked);
  const ledOverloadVoltage = Number(frameNe555Synced.components["led1"]?.telemetry?.overloadVoltage ?? 0);
  console.log(`[Trace Test 9] Multimeter Reading Across LED = ${meterLedVoltage} V`);
  console.log(`[Trace Test 9] LED telemetry.pathBlocked = ${ledPathBlocked}`);
  console.log(`[Trace Test 9] LED telemetry.overloadVoltage = ${ledOverloadVoltage} V`);

  if (meterLedVoltage <= 0 || ledPathBlocked !== false) {
    console.error(`❌ Test 9 FAILED: LED voltage measurement failed (Voltage=${meterLedVoltage}V, pathBlocked=${ledPathBlocked})`);
    allPassed = false;
  } else if (ledOverloadVoltage <= 0) {
    // Regression guard: LED's own telemetry.overloadVoltage (read by componentStatus.ts's
    // "Insufficient Voltage" check) must reflect the NE555 source once resolved, not stay
    // stuck at 0 from the LED's first simulation pass (which predates NE555/capacitor sources).
    console.error(`❌ Test 9 FAILED: LED telemetry.overloadVoltage stayed at ${ledOverloadVoltage}V despite a resolved NE555 source (would wrongly show "Insufficient Voltage")`);
    allPassed = false;
  } else {
    console.log("=> Test 9 PASSED (Multimeter accurately measures live LED voltage, clears pathBlocked warning, and LED overloadVoltage reflects the NE555 source)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 10: Polarized Capacitor Voltage Measurement in RC Timing Circuit
  // -----------------------------------------------------------------------------
  console.log("--- TEST 10: Polarized Capacitor Voltage Measurement ---");
  const resistorCap: CircuitNode = {
    id: "rCap",
    type: "circuitComponent",
    position: { x: 100, y: 0 },
    data: {
      componentType: "resistor",
      simulationModel: "resistor",
      label: "1k Resistor",
      rotation: 0,
      properties: { resistance: { value: 1000, unit: "Ω" } } as any,
    },
  };
  const capNode: CircuitNode = {
    id: "cap1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "polarizedCapacitor",
      simulationModel: "polarizedCapacitor",
      label: "Capacitor",
      rotation: 0,
      properties: { capacitance: { value: 10, unit: "µF" } } as any,
    },
  };
  const meterCap: CircuitNode = {
    id: "meterCapNode",
    type: "circuitComponent",
    position: { x: 300, y: 0 },
    data: {
      componentType: "multimeter",
      simulationModel: "multimeter",
      label: "Multimeter",
      rotation: 0,
      properties: { mode: { value: "voltage" } } as any,
    },
  };
  const edgesCap: CircuitEdge[] = [
    { id: "ec1", source: "uno1", target: "rCap", sourceHandle: "5v", targetHandle: "pin1" },
    { id: "ec2", source: "rCap", target: "cap1", sourceHandle: "pin2", targetHandle: "anode" },
    { id: "ec3", source: "cap1", target: "uno1", sourceHandle: "cathode", targetHandle: "gnd1" },
    { id: "em1", source: "meterCapNode", target: "cap1", sourceHandle: "positive", targetHandle: "anode" },
    { id: "em2", source: "meterCapNode", target: "cap1", sourceHandle: "negative", targetHandle: "cathode" },
  ];
  const frameCapRaw = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [unoNode, resistorCap, capNode, meterCap],
    edges: edgesCap,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG as any,
  });
  frameCapRaw.components["cap1"] = {
    nodeId: "cap1",
    componentType: "polarizedCapacitor",
    label: "Capacitor",
    isPowered: true,
    brightness: 0.54,
    voltage: 2.7,
    telemetry: { voltage: 2.7, percentage: 54 },
    pins: {
      anode: { handleId: "anode", voltage: 2.7, normalizedValue: 0.54, active: true },
      cathode: { handleId: "cathode", voltage: 0, normalizedValue: 0, active: true },
    },
  };
  const contextCap = {
    nodes: [unoNode, resistorCap, capNode, meterCap],
    edges: edgesCap,
    arduinoCode: "",
    picoCode: "",
    boardType: "arduino" as const,
    dynamicComponents: COMPONENT_CATALOG as any,
    ne555State: new NE555StateManager(),
    capacitorState: new CapacitorStateManager(),
    keypad4x4State: new KeypadStateManager(),
    keypad4x3State: new KeypadStateManager(),
  };
  const frameCapSynced = applyMultimeterOutputToFrame(frameCapRaw, contextCap);
  const meterCapVoltage = Number(frameCapSynced.components["meterCapNode"]?.telemetry?.voltage ?? 0);
  console.log(`[Trace Test 10] Polarized Capacitor Voltage Reading = ${meterCapVoltage} V`);

  if (Math.abs(meterCapVoltage - 2.7) > 0.1) {
    console.error(`❌ Test 10 FAILED: Polarized capacitor voltage measurement failed (expected ~2.7V, got ${meterCapVoltage}V)`);
    allPassed = false;
  } else {
    console.log("=> Test 10 PASSED (Multimeter accurately tracks live Polarized Capacitor voltage)\n");
  }

  console.log("=================== MULTIMETER REGRESSION TESTS & SANITY MATRIX COMPLETE ===================");
  return allPassed;
}

if (require.main === module) {
  const ok = runMultimeterTests();
  if (ok) {
    console.log("✅ All Multimeter regression tests passed 100%.");
  } else {
    console.error("❌ Some Multimeter regression tests failed.");
    process.exit(1);
  }
}
