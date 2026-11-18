/**
 * Integration Test Suite: Arduino + L293D + 1 DC Motor, 2 DC Motors, and 4 DC Motors.
 * Verifies end-to-end pin voltage propagation, channel isolation, and motor drive evaluation.
 */

import { useCircuitStore } from "../lib/store";
import { applyL293DFrameTransformer } from "../lib/simulation/frameTransformers/l293d";
import { buildSimulationFrame, type SimulationFrame, type SimulationBoardPinState } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";

function createArduinoNode(id: string = "uno1"): CircuitNode {
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

function createL293DNode(id: string = "l293d_1"): CircuitNode {
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

function createArduinoBoardPins(pinStateMap: Record<string, number>): SimulationBoardPinState[] {
  const pinNumbers: Record<string, number> = {
    d3: 3, d4: 4, d5: 5, d7: 7, d8: 8, d9: 9, "5v": 100,
  };

  return Object.entries(pinStateMap).map(([handleId, voltage]) => ({
    pin: pinNumbers[handleId] ?? 0,
    handleId,
    mode: "OUTPUT",
    value: voltage > 0 ? 255 : 0,
    normalizedValue: voltage > 0 ? 1.0 : 0,
    voltage,
    active: voltage > 0,
  }));
}

export function runArduinoL293DMotorTests(): boolean {
  console.log("=================== RUNNING ARDUINO + L293D + DC MOTORS INTEGRATION TESTS ===================\n");
  let passed = true;

  // --------------------------------------------------------------------------
  // TEST 1: Arduino + L293D + 1 DC Motor
  // --------------------------------------------------------------------------
  console.log("--- SCENARIO 1: Arduino + L293D + 1 DC Motor ---");
  {
    const uno = createArduinoNode("uno1");
    const l293d = createL293DNode("l293d_1");
    const motor1 = createDcMotorNode("motor1", "DC Motor 1");

    const edges: CircuitEdge[] = [
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
      nodes: [uno, l293d, motor1],
      edges,
      arduinoCode: "",
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [uno, l293d, motor1],
      edges,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    // Forward drive: EN1(d9) = 5V, IN1(d8) = 5V, IN2(d7) = 0V
    const frameForward: SimulationFrame = {
      ...baseFrame,
      boardPins: createArduinoBoardPins({ "5v": 5.0, d9: 5.0, d8: 5.0, d7: 0.0 }),
    };

    const resForward = applyL293DFrameTransformer(frameForward);
    const out1 = resForward.components["l293d_1"]?.pins["output1"];
    const out2 = resForward.components["l293d_1"]?.pins["output2"];

    if (out1?.voltage === 5.0 && out1?.active === true && out2?.voltage === 0 && out2?.active === true) {
      console.log("✓ Scenario 1 Forward Drive PASSED: Output 1 = 5V (HIGH), Output 2 = 0V (LOW)");
    } else {
      console.error("❌ Scenario 1 Forward Drive FAILED:", { out1, out2 });
      passed = false;
    }

    // Disabled/Coast: EN1(d9) = 0V
    const frameDisable: SimulationFrame = {
      ...baseFrame,
      boardPins: createArduinoBoardPins({ "5v": 5.0, d9: 0.0, d8: 5.0, d7: 0.0 }),
    };

    const resDisable = applyL293DFrameTransformer(frameDisable);
    const out1Dis = resDisable.components["l293d_1"]?.pins["output1"];
    const out2Dis = resDisable.components["l293d_1"]?.pins["output2"];

    if (out1Dis?.active === false && out2Dis?.active === false) {
      console.log("✓ Scenario 1 Disabled/Coast PASSED: Both outputs set to HIGH-Z (active: false)");
    } else {
      console.error("❌ Scenario 1 Disabled/Coast FAILED:", { out1Dis, out2Dis });
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 2: Arduino + L293D + 2 DC Motors
  // --------------------------------------------------------------------------
  console.log("\n--- SCENARIO 2: Arduino + L293D + 2 DC Motors ---");
  {
    const uno = createArduinoNode("uno1");
    const l293d = createL293DNode("l293d_1");
    const motorLeft = createDcMotorNode("motor_left", "Left DC Motor");
    const motorRight = createDcMotorNode("motor_right", "Right DC Motor");

    const edges: CircuitEdge[] = [
      { id: "e1", source: "uno1", sourceHandle: "5v", target: "l293d_1", targetHandle: "vcc" },
      { id: "e2", source: "uno1", sourceHandle: "5v", target: "l293d_1", targetHandle: "vs" },
      { id: "e_gnd", source: "uno1", sourceHandle: "gnd1", target: "l293d_1", targetHandle: "gnd1" },
      // Left Motor: D9, D8, D7
      { id: "e3", source: "uno1", sourceHandle: "d9", target: "l293d_1", targetHandle: "enable1" },
      { id: "e4", source: "uno1", sourceHandle: "d8", target: "l293d_1", targetHandle: "input1" },
      { id: "e5", source: "uno1", sourceHandle: "d7", target: "l293d_1", targetHandle: "input2" },
      { id: "e6", source: "l293d_1", sourceHandle: "output1", target: "motor_left", targetHandle: "pin1" },
      { id: "e7", source: "l293d_1", sourceHandle: "output2", target: "motor_left", targetHandle: "pin2" },
      // Right Motor: D3, D4, D5
      { id: "e8", source: "uno1", sourceHandle: "d3", target: "l293d_1", targetHandle: "enable2" },
      { id: "e9", source: "uno1", sourceHandle: "d4", target: "l293d_1", targetHandle: "input3" },
      { id: "e10", source: "uno1", sourceHandle: "d5", target: "l293d_1", targetHandle: "input4" },
      { id: "e11", source: "l293d_1", sourceHandle: "output3", target: "motor_right", targetHandle: "pin1" },
      { id: "e12", source: "l293d_1", sourceHandle: "output4", target: "motor_right", targetHandle: "pin2" },
    ];

    useCircuitStore.setState({
      nodes: [uno, l293d, motorLeft, motorRight],
      edges,
      arduinoCode: "",
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [uno, l293d, motorLeft, motorRight],
      edges,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    // Turn Left: Left Motor Forward (d9=5V, d8=5V, d7=0V), Right Motor Reverse (d3=5V, d4=0V, d5=5V)
    const frameTurnLeft: SimulationFrame = {
      ...baseFrame,
      boardPins: createArduinoBoardPins({
        "5v": 5.0,
        d9: 5.0, d8: 5.0, d7: 0.0,
        d3: 5.0, d4: 0.0, d5: 5.0,
      }),
    };

    const resTurnLeft = applyL293DFrameTransformer(frameTurnLeft);
    const pins = resTurnLeft.components["l293d_1"]?.pins;

    const leftForward = pins?.output1?.voltage === 5.0 && pins?.output2?.voltage === 0.0;
    const rightReverse = pins?.output3?.voltage === 0.0 && pins?.output4?.voltage === 5.0;

    if (leftForward && rightReverse) {
      console.log("✓ Scenario 2 PASSED: 2 DC Motors driven independently (Left Forward: 5V/0V, Right Reverse: 0V/5V)");
    } else {
      console.error("❌ Scenario 2 FAILED:", pins);
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 3: Arduino + L293D + 4 DC Motors (4WD Configuration)
  // --------------------------------------------------------------------------
  console.log("\n--- SCENARIO 3: Arduino + L293D + 4 DC Motors (4WD) ---");
  {
    const uno = createArduinoNode("uno1");
    const l293d = createL293DNode("l293d_1");
    const flMotor = createDcMotorNode("fl", "Front Left Motor");
    const rlMotor = createDcMotorNode("rl", "Rear Left Motor");
    const frMotor = createDcMotorNode("fr", "Front Right Motor");
    const rrMotor = createDcMotorNode("rr", "Rear Right Motor");

    const edges: CircuitEdge[] = [
      { id: "e1", source: "uno1", sourceHandle: "5v", target: "l293d_1", targetHandle: "vcc" },
      { id: "e2", source: "uno1", sourceHandle: "5v", target: "l293d_1", targetHandle: "vs" },
      { id: "e_gnd", source: "uno1", sourceHandle: "gnd1", target: "l293d_1", targetHandle: "gnd1" },
      // Left side pins (d9:EN1, d8:IN1, d7:IN2)
      { id: "e3", source: "uno1", sourceHandle: "d9", target: "l293d_1", targetHandle: "enable1" },
      { id: "e4", source: "uno1", sourceHandle: "d8", target: "l293d_1", targetHandle: "input1" },
      { id: "e5", source: "uno1", sourceHandle: "d7", target: "l293d_1", targetHandle: "input2" },
      // Left side parallel connections (FL & RL motors on Out1 & Out2)
      { id: "e6", source: "l293d_1", sourceHandle: "output1", target: "fl", targetHandle: "pin1" },
      { id: "e7", source: "l293d_1", sourceHandle: "output2", target: "fl", targetHandle: "pin2" },
      { id: "e8", source: "l293d_1", sourceHandle: "output1", target: "rl", targetHandle: "pin1" },
      { id: "e9", source: "l293d_1", sourceHandle: "output2", target: "rl", targetHandle: "pin2" },

      // Right side pins (d3:EN2, d4:IN3, d5:IN4)
      { id: "e10", source: "uno1", sourceHandle: "d3", target: "l293d_1", targetHandle: "enable2" },
      { id: "e11", source: "uno1", sourceHandle: "d4", target: "l293d_1", targetHandle: "input3" },
      { id: "e12", source: "uno1", sourceHandle: "d5", target: "l293d_1", targetHandle: "input4" },
      // Right side parallel connections (FR & RR motors on Out3 & Out4)
      { id: "e13", source: "l293d_1", sourceHandle: "output3", target: "fr", targetHandle: "pin1" },
      { id: "e14", source: "l293d_1", sourceHandle: "output4", target: "fr", targetHandle: "pin2" },
      { id: "e15", source: "l293d_1", sourceHandle: "output3", target: "rr", targetHandle: "pin1" },
      { id: "e16", source: "l293d_1", sourceHandle: "output4", target: "rr", targetHandle: "pin2" },
    ];

    useCircuitStore.setState({
      nodes: [uno, l293d, flMotor, rlMotor, frMotor, rrMotor],
      edges,
      arduinoCode: "",
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [uno, l293d, flMotor, rlMotor, frMotor, rrMotor],
      edges,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    // 4WD Full Forward Drive (Left channel: d9=5V, d8=5V, d7=0V; Right channel: d3=5V, d4=5V, d5=0V)
    const frame4WDForward: SimulationFrame = {
      ...baseFrame,
      boardPins: createArduinoBoardPins({
        "5v": 5.0,
        d9: 5.0, d8: 5.0, d7: 0.0,
        d3: 5.0, d4: 5.0, d5: 0.0,
      }),
    };

    const res4WD = applyL293DFrameTransformer(frame4WDForward);
    const pins = res4WD.components["l293d_1"]?.pins;

    const channel12Forward = pins?.output1?.voltage === 5.0 && pins?.output2?.voltage === 0.0;
    const channel34Forward = pins?.output3?.voltage === 5.0 && pins?.output4?.voltage === 0.0;

    if (channel12Forward && channel34Forward) {
      console.log("✓ Scenario 3 PASSED: 4WD 4 DC Motors powered simultaneously across 4 half-H channels!");
    } else {
      console.error("❌ Scenario 3 FAILED:", pins);
      passed = false;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 4: Dynamic Voltage & PWM Speed Scaling (100%, 50%, 25%, 0%)
  // --------------------------------------------------------------------------
  console.log("\n--- SCENARIO 4: Dynamic Voltage & PWM Speed Scaling ---");
  {
    const uno = createArduinoNode("uno1");
    const l293d = createL293DNode("l293d_1");
    const motor1 = createDcMotorNode("motor1", "DC Motor 1");

    const edges: CircuitEdge[] = [
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
      nodes: [uno, l293d, motor1],
      edges,
      arduinoCode: "",
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [uno, l293d, motor1],
      edges,
      boardType: "arduino",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    // 100% PWM: EN1 = 5.0V -> 2400 RPM
    const frame100 = applyL293DFrameTransformer({
      ...baseFrame,
      boardPins: createArduinoBoardPins({ "5v": 5.0, d9: 5.0, d8: 5.0, d7: 0.0 }),
    });
    const m100 = frame100.components["motor1"];
    const rpm100 = Number(m100?.telemetry?.rpm ?? 0);

    // 50% PWM: EN1 = 2.5V -> 1200 RPM
    const frame50Pin = createArduinoBoardPins({ "5v": 5.0, d9: 2.5, d8: 5.0, d7: 0.0 });
    frame50Pin.find((p) => p.handleId === "d9")!.normalizedValue = 0.5;
    const frame50 = applyL293DFrameTransformer({
      ...baseFrame,
      boardPins: frame50Pin,
    });
    const m50 = frame50.components["motor1"];
    const rpm50 = Number(m50?.telemetry?.rpm ?? 0);

    // 25% PWM: EN1 = 1.25V -> 600 RPM
    const frame25Pin = createArduinoBoardPins({ "5v": 5.0, d9: 1.25, d8: 5.0, d7: 0.0 });
    frame25Pin.find((p) => p.handleId === "d9")!.normalizedValue = 0.25;
    const frame25 = applyL293DFrameTransformer({
      ...baseFrame,
      boardPins: frame25Pin,
    });
    const m25 = frame25.components["motor1"];
    const rpm25 = Number(m25?.telemetry?.rpm ?? 0);

    if (rpm100 === 2400 && rpm50 === 1200 && rpm25 === 600) {
      console.log("✓ Scenario 4 PASSED: Motor RPM scales dynamically with voltage/PWM (100%->2400 RPM, 50%->1200 RPM, 25%->600 RPM)");
    } else {
      console.error("❌ Scenario 4 FAILED:", { rpm100, rpm50, rpm25 });
      passed = false;
    }
  }

  console.log("\n=================== INTEGRATION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runArduinoL293DMotorTests();
  if (success) {
    console.log("✅ All Arduino + L293D + DC Motor (1, 2, 4 Motors) integration tests passed successfully.");
  } else {
    console.error("❌ Some integration tests failed.");
    process.exit(1);
  }
}
