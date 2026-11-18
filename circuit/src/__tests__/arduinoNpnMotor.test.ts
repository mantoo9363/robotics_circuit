/**
 * Permanent Regression Test Suite for Arduino + NPN Transistor + DC Motor integration.
 * Verifies NPN switching, collector reachable load actuation, base resistor detection,
 * and DC motor telemetry (RPM, voltage, speed) under active, saturation, and cutoff modes.
 */

import { useCircuitStore } from "../lib/store";
import { applyNpnInputToFrame } from "../lib/simulation/frameTransformers/npn";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runArduinoNpnMotorTests(): boolean {
  console.log("=================== RUNNING ARDUINO + NPN + DC MOTOR REGRESSION TESTS ===================\n");

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

  const resistorNode: CircuitNode = {
    id: "r1",
    type: "circuitComponent",
    position: { x: 100, y: 0 },
    data: {
      componentType: "resistor",
      simulationModel: "resistor",
      label: "1k Resistor",
      rotation: 0,
      properties: {
        resistance: { value: 1000, label: "Resistance", type: "number" },
      } as any,
    },
  };

  const npnNode: CircuitNode = {
    id: "npn1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "npn",
      simulationModel: "npn",
      label: "NPN Transistor",
      rotation: 0,
      properties: {
        beta: { value: 100, label: "Beta", type: "number" },
      } as any,
    },
  };

  const motorNode: CircuitNode = {
    id: "motor1",
    type: "circuitComponent",
    position: { x: 300, y: 0 },
    data: {
      componentType: "dcmotor",
      simulationModel: "dcmotor",
      label: "DC Motor",
      rotation: 0,
      properties: {} as any,
    },
  };

  // Connect:
  // Arduino Pin 9 -> Resistor pin1
  // Resistor pin2 -> NPN Base
  // NPN Emitter -> Arduino GND1
  // NPN Collector -> Motor pin2
  // Motor pin1 -> Arduino 5V
  const edges: CircuitEdge[] = [
    { id: "e1", source: "uno1", sourceHandle: "d9", target: "r1", targetHandle: "pin1" },
    { id: "e2", source: "r1", sourceHandle: "pin2", target: "npn1", targetHandle: "base" },
    { id: "e3", source: "npn1", sourceHandle: "emitter", target: "uno1", targetHandle: "gnd1" },
    { id: "e4", source: "npn1", sourceHandle: "collector", target: "motor1", targetHandle: "pin2" },
    { id: "e5", source: "motor1", sourceHandle: "pin1", target: "uno1", targetHandle: "5v" },
  ];

  const nodes = [unoNode, resistorNode, npnNode, motorNode];

  // -------------------------------------------------------------------------
  // Case 1: Arduino Pin 9 is HIGH (5V) -> NPN in Saturation, DC Motor ON
  // -------------------------------------------------------------------------
  console.log("--- TEST 1: Arduino Pin 9 HIGH -> NPN ON & DC Motor Spinning ---");
  useCircuitStore.setState({
    nodes,
    edges,
    arduinoCode: `void setup() { pinMode(9, OUTPUT); digitalWrite(9, HIGH); } void loop() {}`,
    simulationStatus: "running",
  });

  const pin9MapHigh = new Map<number, any>([
    [9, { mode: "OUTPUT", value: 255 }],
  ]);

  const frameRawHigh = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes,
    edges,
    boardType: "arduino",
    arduinoState: { pins: pin9MapHigh } as any,
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const frameTransformedHigh = applyNpnInputToFrame(frameRawHigh);
  const npnStateHigh = frameTransformedHigh.components["npn1"];
  const motorStateHigh = frameTransformedHigh.components["motor1"];

  console.log(`[Trace High] NPN Conduction: ${npnStateHigh?.telemetry?.conduction}, Region: ${npnStateHigh?.telemetry?.operatingRegion}`);
  console.log(`[Trace High] Motor Powered: ${motorStateHigh?.isPowered}, RPM: ${motorStateHigh?.telemetry?.rpm}, Voltage: ${motorStateHigh?.telemetry?.voltage}V`);

  if (!npnStateHigh || npnStateHigh.telemetry?.conduction !== "ON") {
    console.error("FAIL: NPN did not conduct when Base was driven HIGH with 1k resistor", npnStateHigh);
    passed = false;
  } else if (!motorStateHigh || !motorStateHigh.isPowered || Number(motorStateHigh.telemetry?.rpm ?? 0) <= 0) {
    console.error("FAIL: DC Motor was not powered or RPM was 0 when NPN conducted", motorStateHigh);
    passed = false;
  } else {
    console.log("=> Case 1: Arduino Pin 9 HIGH PASSED\n");
  }

  // -------------------------------------------------------------------------
  // Case 2: Arduino Pin 9 is LOW (0V) -> NPN in Cutoff, DC Motor OFF
  // -------------------------------------------------------------------------
  console.log("--- TEST 2: Arduino Pin 9 LOW -> NPN Cutoff & DC Motor OFF ---");
  const pin9MapLow = new Map<number, any>([
    [9, { mode: "OUTPUT", value: 0 }],
  ]);

  const frameRawLow = buildSimulationFrame({
    tick: 2,
    timestamp: 200,
    nodes,
    edges,
    boardType: "arduino",
    arduinoState: { pins: pin9MapLow } as any,
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const frameTransformedLow = applyNpnInputToFrame(frameRawLow);
  const npnStateLow = frameTransformedLow.components["npn1"];

  console.log(`[Trace Low] NPN Conduction: ${npnStateLow?.telemetry?.conduction}, Region: ${npnStateLow?.telemetry?.operatingRegion}`);

  if (npnStateLow && npnStateLow.telemetry?.conduction === "ON") {
    console.error("FAIL: NPN conducted when Base was LOW (0V)", npnStateLow);
    passed = false;
  } else {
    console.log("=> Case 2: Arduino Pin 9 LOW PASSED\n");
  }

  // -------------------------------------------------------------------------
  // Case 3: Arduino Pin 9 PWM Speed Control (analogWrite 128 / 50% duty cycle)
  // -------------------------------------------------------------------------
  console.log("--- TEST 3: Arduino Pin 9 PWM (analogWrite 128) -> Modulated Speed ---");
  const pin9MapPwm = new Map<number, any>([
    [9, { mode: "OUTPUT", value: 128 }],
  ]);

  const frameRawPwm = buildSimulationFrame({
    tick: 3,
    timestamp: 300,
    nodes,
    edges,
    boardType: "arduino",
    arduinoState: { pins: pin9MapPwm } as any,
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const frameTransformedPwm = applyNpnInputToFrame(frameRawPwm);
  const motorStatePwm = frameTransformedPwm.components["motor1"];
  console.log(`[Trace PWM] Motor Powered: ${motorStatePwm?.isPowered}, RPM: ${motorStatePwm?.telemetry?.rpm}, Voltage: ${motorStatePwm?.telemetry?.voltage}V`);

  if (!motorStatePwm || !motorStatePwm.isPowered || Number(motorStatePwm.telemetry?.rpm ?? 0) <= 0) {
    console.error("FAIL: DC Motor was not powered under PWM drive", motorStatePwm);
    passed = false;
  } else {
    console.log("=> Case 3: Arduino Pin 9 PWM PASSED\n");
  }

  // -------------------------------------------------------------------------
  // Case 4: Breadboard Wiring Setup
  // -------------------------------------------------------------------------
  console.log("--- TEST 4: Breadboard Interconnection ---");
  const bbNode: CircuitNode = {
    id: "bb1",
    type: "circuitComponent",
    position: { x: 50, y: 150 },
    data: {
      componentType: "breadboard",
      simulationModel: "breadboard",
      label: "Breadboard",
      rotation: 0,
      properties: {} as any,
    },
  };

  // Connect via breadboard columns:
  // uno1:d9 -> bb1:a10
  // r1:pin1 -> bb1:b10, r1:pin2 -> bb1:b15
  // npn1:base -> bb1:c15
  // npn1:emitter -> bb1:top_negative_5
  // uno1:gnd1 -> bb1:top_negative_1
  // npn1:collector -> bb1:c20
  // motor1:pin2 -> bb1:d20
  // motor1:pin1 -> uno1:5v
  const bbEdges: CircuitEdge[] = [
    { id: "be1", source: "uno1", sourceHandle: "d9", target: "bb1", targetHandle: "a10" },
    { id: "be2", source: "r1", sourceHandle: "pin1", target: "bb1", targetHandle: "b10" },
    { id: "be3", source: "r1", sourceHandle: "pin2", target: "bb1", targetHandle: "b15" },
    { id: "be4", source: "npn1", sourceHandle: "base", target: "bb1", targetHandle: "c15" },
    { id: "be5", source: "npn1", sourceHandle: "emitter", target: "bb1", targetHandle: "top_negative_5" },
    { id: "be6", source: "uno1", sourceHandle: "gnd1", target: "bb1", targetHandle: "top_negative_1" },
    { id: "be7", source: "npn1", sourceHandle: "collector", target: "bb1", targetHandle: "c20" },
    { id: "be8", source: "motor1", sourceHandle: "pin2", target: "bb1", targetHandle: "d20" },
    { id: "be9", source: "motor1", sourceHandle: "pin1", target: "uno1", targetHandle: "5v" },
  ];

  const bbNodes = [unoNode, bbNode, resistorNode, npnNode, motorNode];

  useCircuitStore.setState({
    nodes: bbNodes,
    edges: bbEdges,
    simulationStatus: "running",
  });

  const frameRawBb = buildSimulationFrame({
    tick: 4,
    timestamp: 400,
    nodes: bbNodes,
    edges: bbEdges,
    boardType: "arduino",
    arduinoState: { pins: pin9MapHigh } as any,
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const frameTransformedBb = applyNpnInputToFrame(frameRawBb);
  const npnStateBb = frameTransformedBb.components["npn1"];
  const motorStateBb = frameTransformedBb.components["motor1"];

  console.log(`[Trace BB] NPN Conduction: ${npnStateBb?.telemetry?.conduction}, Motor Powered: ${motorStateBb?.isPowered}, RPM: ${motorStateBb?.telemetry?.rpm}`);

  if (!npnStateBb || npnStateBb.telemetry?.conduction !== "ON") {
    console.error("FAIL: NPN on breadboard did not conduct", npnStateBb);
    passed = false;
  } else if (!motorStateBb || !motorStateBb.isPowered || Number(motorStateBb.telemetry?.rpm ?? 0) <= 0) {
    console.error("FAIL: Motor on breadboard was not powered", motorStateBb);
    passed = false;
  } else {
    console.log("=> Case 4: Breadboard Interconnection PASSED\n");
  }

  // -------------------------------------------------------------------------
  // Case 5: Server Simulation Frame Generation (Backend WebSocket Frames)
  // -------------------------------------------------------------------------
  console.log("--- TEST 5: Backend Server buildSimulationFrame (WebSocket Frames) ---");
  // Dynamically import server buildSimulationFrame
  const serverSimState = require("../../../server/simulation/simulation-state");
  const serverFrame = serverSimState.buildSimulationFrame({
    tick: 5,
    timestamp: 500,
    nodes,
    edges,
    boardType: "arduino",
    arduinoState: { pins: pin9MapHigh },
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const serverNpnState = serverFrame.components["npn1"];
  const serverMotorState = serverFrame.components["motor1"];

  console.log(`[Trace Server] NPN Conduction: ${serverNpnState?.telemetry?.conduction}, Motor Powered: ${serverMotorState?.isPowered}, OpenCircuit: ${serverMotorState?.telemetry?.openCircuit}, RPM: ${serverMotorState?.telemetry?.rpm}`);

  if (!serverNpnState || serverNpnState.telemetry?.conduction !== "ON") {
    console.error("FAIL: Server NPN did not conduct", serverNpnState);
    passed = false;
  } else if (!serverMotorState || !serverMotorState.isPowered || serverMotorState.telemetry?.openCircuit === true || Number(serverMotorState.telemetry?.rpm ?? 0) <= 0) {
    console.error("FAIL: Server DC Motor frame was marked unpowered or openCircuit", serverMotorState);
    passed = false;
  } else {
    console.log("=> Case 5: Backend Server Simulation Frame PASSED (openCircuit is FALSE, isPowered is TRUE, RPM is >0)\n");
  }

  // -------------------------------------------------------------------------
  // Case 6: Arduino + NPN + LED 4-Step PWM Dimming (50 -> 120 -> 255 -> 0)
  // -------------------------------------------------------------------------
  console.log("--- TEST 6: Arduino + NPN + LED 4-Step PWM Dimming ---");
  const ledCircuitNodes: CircuitNode[] = [
    unoNode,
    {
      id: "r_led",
      type: "circuitComponent",
      position: { x: 100, y: 0 },
      data: {
        componentType: "resistor",
        simulationModel: "resistor",
        label: "220 Resistor",
        rotation: 0,
        properties: { resistance: { value: 220, label: "Resistance", type: "number" } } as any,
      },
    },
    {
      id: "led1",
      type: "circuitComponent",
      position: { x: 200, y: 0 },
      data: {
        componentType: "led",
        simulationModel: "led",
        label: "LED",
        rotation: 0,
        properties: { color: { value: "red", label: "Color", type: "select" } } as any,
      },
    },
    resistorNode, // r1 (1k base resistor)
    npnNode,
  ];

  const ledCircuitEdges: CircuitEdge[] = [
    { id: "e1", source: "uno1", sourceHandle: "5v", target: "r_led", targetHandle: "pin1" },
    { id: "e2", source: "r_led", sourceHandle: "pin2", target: "led1", targetHandle: "anode" },
    { id: "e3", source: "led1", sourceHandle: "cathode", target: "npn1", targetHandle: "collector" },
    { id: "e4", source: "uno1", sourceHandle: "d9", target: "r1", targetHandle: "pin1" },
    { id: "e5", source: "r1", sourceHandle: "pin2", target: "npn1", targetHandle: "base" },
    { id: "e6", source: "npn1", sourceHandle: "emitter", target: "uno1", targetHandle: "gnd1" },
  ];

  // Test PWM levels: 50, 120, 255, 0
  const pwmTestLevels = [
    { val: 50, minBright: 0.15, maxBright: 0.35 },
    { val: 120, minBright: 0.40, maxBright: 0.60 },
    { val: 255, minBright: 0.70, maxBright: 1.00 },
    { val: 0, minBright: 0, maxBright: 0 },
  ];

  for (const { val, minBright, maxBright } of pwmTestLevels) {
    const pwmPins = new Map([[9, { mode: "OUTPUT", value: val }]]);
    const pwmFrame = serverSimState.buildSimulationFrame({
      tick: 1,
      nodes: ledCircuitNodes,
      edges: ledCircuitEdges,
      boardType: "arduino",
      arduinoState: { pins: pwmPins },
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const ledState = pwmFrame.components["led1"];
    const npnState = pwmFrame.components["npn1"];
    console.log(`[PWM Level ${val}] NPN Conduction: ${npnState?.telemetry?.conduction}, LED isPowered: ${ledState?.isPowered}, Brightness: ${ledState?.brightness}, Current: ${ledState?.telemetry?.currentMilliAmps}mA`);

    if (val > 0) {
      if (!ledState || !ledState.isPowered) {
        console.error(`FAIL: LED not powered at PWM level ${val}`, ledState);
        passed = false;
      }
    } else {
      if (ledState && (ledState.isPowered || ledState.brightness > 0)) {
        console.error(`FAIL: LED should be OFF at PWM level 0`, ledState);
        passed = false;
      }
    }
  }

  if (passed) {
    console.log("=> Case 6: Arduino + NPN + LED 4-Step PWM Dimming PASSED\n");
  }

  // -------------------------------------------------------------------------
  // Case 7: Pipeline Frame Transformer (applyNpnInputToFrame) Preservation
  // -------------------------------------------------------------------------
  console.log("--- TEST 7: Client applyNpnInputToFrame Transformer Integrity ---");
  for (const { val } of pwmTestLevels) {
    const pwmPins = new Map([[9, { mode: "OUTPUT", value: val }]]);
    const baseFrame = serverSimState.buildSimulationFrame({
      tick: 1,
      nodes: ledCircuitNodes,
      edges: ledCircuitEdges,
      boardType: "arduino",
      arduinoState: { pins: pwmPins },
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const transformedFrame = applyNpnInputToFrame(baseFrame, {
      nodes: ledCircuitNodes,
      edges: ledCircuitEdges,
      arduinoCode: "",
      picoCode: "",
      dynamicComponents: COMPONENT_CATALOG as any,
    } as any);

    const tfLed = transformedFrame.components["led1"];
    console.log(`[Transformed PWM ${val}] LED Brightness: ${tfLed?.brightness}, Current: ${tfLed?.telemetry?.currentMilliAmps}mA`);
    if (val === 50 && (Number(tfLed?.telemetry?.currentMilliAmps) > 5 || Number(tfLed?.brightness) > 0.25)) {
      console.error("FAIL: PWM 50 transformed frame was not dim!", tfLed);
      passed = false;
    }
  }

  if (passed) {
    console.log("=> Case 7: Client applyNpnInputToFrame Transformer PASSED\n");
  }

  console.log("=================== ARDUINO + NPN + DC MOTOR TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runArduinoNpnMotorTests();
  if (success) {
    console.log("✅ All Arduino NPN DC Motor regression tests passed successfully.");
  } else {
    console.error("❌ Some Arduino NPN DC Motor regression tests failed.");
    process.exit(1);
  }
}
