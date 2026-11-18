import { useCircuitStore } from "../lib/store";
import { applyL293DFrameTransformer } from "../lib/simulation/frameTransformers/l293d";
import { buildSimulationFrame, SimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";

function createArduinoNode(id: string): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "arduino",
      simulationModel: "arduino",
      label: "Arduino Uno",
      rotation: 0,
      properties: {},
    },
  };
}

function createPicoNode(id: string): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "pico",
      simulationModel: "pico",
      label: "Raspberry Pi Pico RP2040",
      rotation: 0,
      properties: {},
    },
  };
}

function createL293DNode(id: string): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: {
      componentType: "l293d",
      simulationModel: "l293d",
      label: "L293D Motor Driver",
      rotation: 0,
      properties: {},
    },
  };
}

function createDcMotorNode(id: string, label: string): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 400, y: 0 },
    data: {
      componentType: "dcmotor",
      simulationModel: "dcmotor",
      label,
      rotation: 0,
      properties: {},
    },
  };
}

function createBatteryNode(id: string): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 100, y: 200 },
    data: {
      componentType: "battery",
      simulationModel: "battery",
      label: "9V Battery",
      rotation: 0,
      properties: { voltage: { type: "number", label: "Voltage", value: 9 } },
    },
  };
}

export function runL293DCommonGndValidationTests(): boolean {
  console.log("=================== RUNNING L293D COMMON GND VALIDATION TESTS ===================");
  let passed = true;

  // --------------------------------------------------------------------------
  // TEST 1: Arduino UNO + L293D without Arduino GND Wire
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 1: Arduino UNO + L293D (Missing Arduino GND) ---");
  {
    const uno = createArduinoNode("uno1");
    const l293d = createL293DNode("l293d_1");
    const motor = createDcMotorNode("motor1", "DC Motor");

    const edgesWithoutGnd: CircuitEdge[] = [
      { id: "e1", source: "uno1", sourceHandle: "5v", target: "l293d_1", targetHandle: "vcc" },
      { id: "e2", source: "uno1", sourceHandle: "5v", target: "l293d_1", targetHandle: "vs" },
      { id: "e3", source: "uno1", sourceHandle: "d9", target: "l293d_1", targetHandle: "enable1" },
      { id: "e4", source: "uno1", sourceHandle: "d8", target: "l293d_1", targetHandle: "input1" },
      { id: "e5", source: "uno1", sourceHandle: "d7", target: "l293d_1", targetHandle: "input2" },
      { id: "e6", source: "l293d_1", sourceHandle: "output1", target: "motor1", targetHandle: "pin1" },
      { id: "e7", source: "l293d_1", sourceHandle: "output2", target: "motor1", targetHandle: "pin2" },
    ];

    useCircuitStore.setState({
      nodes: [uno, l293d, motor],
      edges: edgesWithoutGnd,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [uno, l293d, motor],
      edges: edgesWithoutGnd,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frameWithPins: SimulationFrame = {
      ...baseFrame,
      boardPins: [
        { handleId: "5v", pin: 0, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d9", pin: 9, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d8", pin: 8, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d7", pin: 7, voltage: 0.0, normalizedValue: 0.0, active: false, mode: "OUTPUT", value: 0 },
      ],
    };

    const res = applyL293DFrameTransformer(frameWithPins);
    const chipState = res.components["l293d_1"];
    const motorState = res.components["motor1"];

    const isHalted = chipState?.isPowered === false && motorState?.telemetry?.rpm === 0;
    const hasError = chipState?.telemetry?.error === "L293D NOT WORKING: COMMON GND CONNECTION REQUIRED";

    if (isHalted && hasError) {
      console.log("✓ Test 1 PASSED: Missing Arduino GND correctly disables L293D and triggers 'L293D NOT WORKING: COMMON GND CONNECTION REQUIRED'");
    } else {
      console.error("❌ Test 1 FAILED:", { isHalted, hasError, chipState, motorState });
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 2: Arduino UNO + L293D with Arduino GND Wire
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 2: Arduino UNO + L293D (Arduino GND Connected) ---");
  {
    const uno = createArduinoNode("uno1");
    const l293d = createL293DNode("l293d_1");
    const motor = createDcMotorNode("motor1", "DC Motor");

    const edgesWithGnd: CircuitEdge[] = [
      { id: "e1", source: "uno1", sourceHandle: "5v", target: "l293d_1", targetHandle: "vcc" },
      { id: "e2", source: "uno1", sourceHandle: "5v", target: "l293d_1", targetHandle: "vs" },
      { id: "e_gnd", source: "uno1", sourceHandle: "gnd1", target: "l293d_1", targetHandle: "gnd1" },
      { id: "e3", source: "uno1", sourceHandle: "d9", target: "l293d_1", targetHandle: "enable1" },
      { id: "e4", source: "uno1", sourceHandle: "d8", target: "l293d_1", targetHandle: "input1" },
      { id: "e5", source: "uno1", sourceHandle: "d7", target: "l293d_1", targetHandle: "input2" },
      { id: "e6", source: "l293d_1", sourceHandle: "output1", target: "motor1", targetHandle: "pin1" },
      { id: "e7", source: "l293d_1", sourceHandle: "output2", target: "motor1", targetHandle: "pin2" },
    ];

    useCircuitStore.setState({
      nodes: [uno, l293d, motor],
      edges: edgesWithGnd,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [uno, l293d, motor],
      edges: edgesWithGnd,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frameWithPins: SimulationFrame = {
      ...baseFrame,
      boardPins: [
        { handleId: "5v", pin: 0, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d9", pin: 9, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d8", pin: 8, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d7", pin: 7, voltage: 0.0, normalizedValue: 0.0, active: false, mode: "OUTPUT", value: 0 },
      ],
    };

    const res = applyL293DFrameTransformer(frameWithPins);
    const chipState = res.components["l293d_1"];
    const motorState = res.components["motor1"];

    const isPowered = chipState?.isPowered === true;
    const motorSpins = Number(motorState?.telemetry?.rpm ?? 0) === 2400;

    if (isPowered && motorSpins) {
      console.log("✓ Test 2 PASSED: Connected Arduino GND powers L293D and drives motor at 2400 RPM");
    } else {
      console.error("❌ Test 2 FAILED:", { isPowered, motorSpins, chipState });
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 3: Raspberry Pi Pico RP2040 + L293D (Missing Pico GND)
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 3: Raspberry Pi Pico RP2040 + L293D (Missing Pico GND) ---");
  {
    const pico = createPicoNode("pico1");
    const l293d = createL293DNode("l293d_1");
    const motor = createDcMotorNode("motor1", "DC Motor");

    const edgesWithoutGnd: CircuitEdge[] = [
      { id: "e1", source: "pico1", sourceHandle: "pico_vbus", target: "l293d_1", targetHandle: "vcc" },
      { id: "e2", source: "pico1", sourceHandle: "pico_vbus", target: "l293d_1", targetHandle: "vs" },
      { id: "e3", source: "pico1", sourceHandle: "gp15", target: "l293d_1", targetHandle: "enable1" },
      { id: "e4", source: "pico1", sourceHandle: "gp14", target: "l293d_1", targetHandle: "input1" },
      { id: "e5", source: "pico1", sourceHandle: "gp13", target: "l293d_1", targetHandle: "input2" },
      { id: "e6", source: "l293d_1", sourceHandle: "output1", target: "motor1", targetHandle: "pin1" },
      { id: "e7", source: "l293d_1", sourceHandle: "output2", target: "motor1", targetHandle: "pin2" },
    ];

    useCircuitStore.setState({
      nodes: [pico, l293d, motor],
      edges: edgesWithoutGnd,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [pico, l293d, motor],
      edges: edgesWithoutGnd,
      boardType: "pico",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frameWithPins: SimulationFrame = {
      ...baseFrame,
      boardPins: [
        { handleId: "pico_vbus", pin: 40, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "gp15", pin: 20, voltage: 3.3, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "gp14", pin: 19, voltage: 3.3, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "gp13", pin: 17, voltage: 0.0, normalizedValue: 0.0, active: false, mode: "OUTPUT", value: 0 },
      ],
    };

    const res = applyL293DFrameTransformer(frameWithPins);
    const chipState = res.components["l293d_1"];
    const motorState = res.components["motor1"];

    const isHalted = chipState?.isPowered === false && motorState?.telemetry?.rpm === 0;
    const hasError = chipState?.telemetry?.error === "L293D NOT WORKING: COMMON GND CONNECTION REQUIRED";

    if (isHalted && hasError) {
      console.log("✓ Test 3 PASSED: Missing Raspberry Pi Pico GND disables L293D and shows common GND error");
    } else {
      console.error("❌ Test 3 FAILED:", { isHalted, hasError, chipState });
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 4: Raspberry Pi Pico RP2040 + L293D (Pico GND Connected)
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 4: Raspberry Pi Pico RP2040 + L293D (Pico GND Connected) ---");
  {
    const pico = createPicoNode("pico1");
    const l293d = createL293DNode("l293d_1");
    const motor = createDcMotorNode("motor1", "DC Motor");

    const edgesWithGnd: CircuitEdge[] = [
      { id: "e1", source: "pico1", sourceHandle: "pico_vbus", target: "l293d_1", targetHandle: "vcc" },
      { id: "e2", source: "pico1", sourceHandle: "pico_vbus", target: "l293d_1", targetHandle: "vs" },
      { id: "e_gnd", source: "pico1", sourceHandle: "pico_gnd", target: "l293d_1", targetHandle: "gnd1" },
      { id: "e3", source: "pico1", sourceHandle: "gp15", target: "l293d_1", targetHandle: "enable1" },
      { id: "e4", source: "pico1", sourceHandle: "gp14", target: "l293d_1", targetHandle: "input1" },
      { id: "e5", source: "pico1", sourceHandle: "gp13", target: "l293d_1", targetHandle: "input2" },
      { id: "e6", source: "l293d_1", sourceHandle: "output1", target: "motor1", targetHandle: "pin1" },
      { id: "e7", source: "l293d_1", sourceHandle: "output2", target: "motor1", targetHandle: "pin2" },
    ];

    useCircuitStore.setState({
      nodes: [pico, l293d, motor],
      edges: edgesWithGnd,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [pico, l293d, motor],
      edges: edgesWithGnd,
      boardType: "pico",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frameWithPins: SimulationFrame = {
      ...baseFrame,
      boardPins: [
        { handleId: "pico_vbus", pin: 40, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "gp15", pin: 20, voltage: 3.3, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "gp14", pin: 19, voltage: 3.3, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "gp13", pin: 17, voltage: 0.0, normalizedValue: 0.0, active: false, mode: "OUTPUT", value: 0 },
      ],
    };

    const res = applyL293DFrameTransformer(frameWithPins);
    const chipState = res.components["l293d_1"];
    const motorState = res.components["motor1"];

    const isPowered = chipState?.isPowered === true;
    const motorSpins = Number(motorState?.telemetry?.rpm ?? 0) === 2400;

    if (isPowered && motorSpins) {
      console.log("✓ Test 4 PASSED: Raspberry Pi Pico RP2040 with GND powers L293D and drives motor at 2400 RPM");
    } else {
      console.error("❌ Test 4 FAILED:", { isPowered, motorSpins, chipState });
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 5: External 9V Battery + Arduino (Missing Battery GND Bridge)
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 5: External 9V Battery + Arduino (Missing Common Battery GND) ---");
  {
    const uno = createArduinoNode("uno1");
    const battery = createBatteryNode("bat1");
    const l293d = createL293DNode("l293d_1");
    const motor = createDcMotorNode("motor1", "DC Motor");

    // VCC from Arduino 5V, VS from Battery positive (+), Arduino GND connected to L293D,
    // BUT Battery negative (-) is NOT connected to common GND.
    const edgesWithoutBatGnd: CircuitEdge[] = [
      { id: "e1", source: "uno1", sourceHandle: "5v", target: "l293d_1", targetHandle: "vcc" },
      { id: "e2", source: "bat1", sourceHandle: "positive", target: "l293d_1", targetHandle: "vs" },
      { id: "e_gnd_mcu", source: "uno1", sourceHandle: "gnd1", target: "l293d_1", targetHandle: "gnd1" },
      { id: "e3", source: "uno1", sourceHandle: "d9", target: "l293d_1", targetHandle: "enable1" },
      { id: "e4", source: "uno1", sourceHandle: "d8", target: "l293d_1", targetHandle: "input1" },
      { id: "e5", source: "uno1", sourceHandle: "d7", target: "l293d_1", targetHandle: "input2" },
      { id: "e6", source: "l293d_1", sourceHandle: "output1", target: "motor1", targetHandle: "pin1" },
      { id: "e7", source: "l293d_1", sourceHandle: "output2", target: "motor1", targetHandle: "pin2" },
    ];

    useCircuitStore.setState({
      nodes: [uno, battery, l293d, motor],
      edges: edgesWithoutBatGnd,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [uno, battery, l293d, motor],
      edges: edgesWithoutBatGnd,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frameWithPins: SimulationFrame = {
      ...baseFrame,
      boardPins: [
        { handleId: "5v", pin: 0, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d9", pin: 9, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d8", pin: 8, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d7", pin: 7, voltage: 0.0, normalizedValue: 0.0, active: false, mode: "OUTPUT", value: 0 },
      ],
      components: {
        ...baseFrame.components,
        bat1: {
          nodeId: "bat1",
          componentType: "battery",
          label: "9V Battery",
          isPowered: true,
          voltage: 9.0,
          brightness: 0,
          telemetry: {},
          pins: {
            positive: { handleId: "positive", voltage: 9.0, normalizedValue: 1.0, active: true },
            negative: { handleId: "negative", voltage: 0.0, normalizedValue: 0.0, active: true },
          },
        },
      },
    };

    const res = applyL293DFrameTransformer(frameWithPins);
    const chipState = res.components["l293d_1"];
    const motorState = res.components["motor1"];

    const isHalted = chipState?.isPowered === false && motorState?.telemetry?.rpm === 0;
    const hasError = chipState?.telemetry?.error === "L293D NOT WORKING: COMMON GND CONNECTION REQUIRED";

    if (isHalted && hasError) {
      console.log("✓ Test 5 PASSED: Missing external battery common ground disables L293D and stops motor");
    } else {
      console.error("❌ Test 5 FAILED:", { isHalted, hasError, chipState });
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 6: External 9V Battery + Arduino (Common Battery GND Connected)
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 6: External 9V Battery + Arduino (Common Battery GND Connected) ---");
  {
    const uno = createArduinoNode("uno1");
    const battery = createBatteryNode("bat1");
    const l293d = createL293DNode("l293d_1");
    const motor = createDcMotorNode("motor1", "DC Motor");

    // Connect Battery negative (-) to L293D gnd2, sharing the common ground network!
    const edgesWithBatGnd: CircuitEdge[] = [
      { id: "e1", source: "uno1", sourceHandle: "5v", target: "l293d_1", targetHandle: "vcc" },
      { id: "e2", source: "bat1", sourceHandle: "positive", target: "l293d_1", targetHandle: "vs" },
      { id: "e_gnd_mcu", source: "uno1", sourceHandle: "gnd1", target: "l293d_1", targetHandle: "gnd1" },
      { id: "e_gnd_bat", source: "bat1", sourceHandle: "negative", target: "l293d_1", targetHandle: "gnd2" },
      { id: "e3", source: "uno1", sourceHandle: "d9", target: "l293d_1", targetHandle: "enable1" },
      { id: "e4", source: "uno1", sourceHandle: "d8", target: "l293d_1", targetHandle: "input1" },
      { id: "e5", source: "uno1", sourceHandle: "d7", target: "l293d_1", targetHandle: "input2" },
      { id: "e6", source: "l293d_1", sourceHandle: "output1", target: "motor1", targetHandle: "pin1" },
      { id: "e7", source: "l293d_1", sourceHandle: "output2", target: "motor1", targetHandle: "pin2" },
    ];

    useCircuitStore.setState({
      nodes: [uno, battery, l293d, motor],
      edges: edgesWithBatGnd,
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [uno, battery, l293d, motor],
      edges: edgesWithBatGnd,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const frameWithPins: SimulationFrame = {
      ...baseFrame,
      boardPins: [
        { handleId: "5v", pin: 0, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d9", pin: 9, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d8", pin: 8, voltage: 5.0, normalizedValue: 1.0, active: true, mode: "OUTPUT", value: 255 },
        { handleId: "d7", pin: 7, voltage: 0.0, normalizedValue: 0.0, active: false, mode: "OUTPUT", value: 0 },
      ],
      components: {
        ...baseFrame.components,
        bat1: {
          nodeId: "bat1",
          componentType: "battery",
          label: "9V Battery",
          isPowered: true,
          voltage: 9.0,
          brightness: 0,
          telemetry: {},
          pins: {
            positive: { handleId: "positive", voltage: 9.0, normalizedValue: 1.0, active: true },
            negative: { handleId: "negative", voltage: 0.0, normalizedValue: 0.0, active: true },
          },
        },
      },
    };

    const res = applyL293DFrameTransformer(frameWithPins);
    const chipState = res.components["l293d_1"];
    const motorState = res.components["motor1"];

    const isPowered = chipState?.isPowered === true;
    const motorSpins = Number(motorState?.telemetry?.rpm ?? 0) === 2400;

    if (isPowered && motorSpins) {
      console.log("✓ Test 6 PASSED: External 9V Battery + Arduino with shared common GND powers L293D and drives motor at 2400 RPM");
    } else {
      console.error("❌ Test 6 FAILED:", { isPowered, motorSpins, chipState });
      passed = false;
    }
  }

  console.log("\n=================== L293D COMMON GND VALIDATION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runL293DCommonGndValidationTests();
  if (success) {
    console.log("✅ All L293D Common GND Validation tests passed.");
  } else {
    console.error("❌ Some tests failed.");
    process.exit(1);
  }
}
