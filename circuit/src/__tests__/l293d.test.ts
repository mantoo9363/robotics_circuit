/**
 * Unit test suite for standalone pin-level L293D motor driver simulation transformer.
 */

import { useCircuitStore } from "../lib/store";
import { applyL293DFrameTransformer } from "../lib/simulation/frameTransformers/l293d";
import { buildSimulationFrame, type SimulationFrame } from "../lib/simulation-state";
import type { CircuitNode, CircuitEdge } from "../lib/types";

function createMockL293DNode(id: string = "l293d_1"): CircuitNode {
  return {
    id,
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "l293d",
      simulationModel: "l293d",
      label: "L293D",
      rotation: 0,
      properties: {},
    },
  };
}

function createMockFrame(
  l293dNode: CircuitNode,
  pinValues: Partial<Record<string, number>>
): SimulationFrame {
  const baseFrame = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [l293dNode],
    edges: [],
    boardType: "none",
    running: true,
    error: null,
  });

  const pinsRecord: Record<string, { handleId: string; voltage: number; normalizedValue: number; active: boolean }> = {};
  for (const [pinName, voltage] of Object.entries(pinValues)) {
    if (voltage !== undefined) {
      pinsRecord[pinName] = {
        handleId: pinName,
        voltage,
        normalizedValue: voltage > 0 ? 1.0 : 0,
        active: voltage > 0,
      };
    }
  }

  return {
    ...baseFrame,
    components: {
      ...baseFrame.components,
      [l293dNode.id]: {
        nodeId: l293dNode.id,
        componentType: "l293d",
        label: "L293D",
        isPowered: (pinValues["vcc"] ?? 0) > 0,
        brightness: 0,
        voltage: pinValues["vcc"] ?? 0,
        telemetry: {},
        pins: pinsRecord,
      },
    },
  };
}

export function runL293DTests(): boolean {
  console.log("=================== RUNNING L293D REGRESSION & BEHAVIORAL TESTS ===================\n");
  let passed = true;

  const node = createMockL293DNode("chip1");
  useCircuitStore.setState({
    nodes: [node],
    edges: [],
    arduinoCode: "",
    simulationStatus: "running",
  });

  // Test 1 — Output HIGH
  {
    const frame = createMockFrame(node, { vcc: 5, vs: 9, enable1: 255, input1: 255 });
    const res = applyL293DFrameTransformer(frame);
    const out1 = res.components["chip1"]?.pins["output1"];
    if (out1?.voltage === 9 && out1?.active === true) {
      console.log("✓ Test 1 Passed: Output HIGH (9V, active: true)");
    } else {
      console.error("❌ Test 1 Failed:", out1);
      passed = false;
    }
  }

  // Test 2 — Output LOW
  {
    const frame = createMockFrame(node, { vcc: 5, vs: 9, enable1: 255, input1: 0 });
    const res = applyL293DFrameTransformer(frame);
    const out1 = res.components["chip1"]?.pins["output1"];
    if (out1?.voltage === 0 && out1?.active === true) {
      console.log("✓ Test 2 Passed: Output LOW (0V, active: true)");
    } else {
      console.error("❌ Test 2 Failed:", out1);
      passed = false;
    }
  }

  // Test 3 — HIGH-Z When Disabled
  {
    const frameLowInput = createMockFrame(node, { vcc: 5, vs: 9, enable1: 0, input1: 0 });
    const resLow = applyL293DFrameTransformer(frameLowInput);
    const out1Low = resLow.components["chip1"]?.pins["output1"];

    const frameHighInput = createMockFrame(node, { vcc: 5, vs: 9, enable1: 0, input1: 255 });
    const resHigh = applyL293DFrameTransformer(frameHighInput);
    const out1High = resHigh.components["chip1"]?.pins["output1"];

    if (out1Low?.active === false && out1High?.active === false) {
      console.log("✓ Test 3 Passed: HIGH-Z state when enable is LOW");
    } else {
      console.error("❌ Test 3 Failed:", { out1Low, out1High });
      passed = false;
    }
  }

  // Test 4 — No Logic Power (VCC = 0V)
  {
    const frame = createMockFrame(node, { vcc: 0, vs: 9, enable1: 255, input1: 255, enable2: 255, input3: 255 });
    const res = applyL293DFrameTransformer(frame);
    const pins = res.components["chip1"]?.pins;
    const allHighZ =
      pins?.output1?.active === false &&
      pins?.output2?.active === false &&
      pins?.output3?.active === false &&
      pins?.output4?.active === false;

    if (allHighZ) {
      console.log("✓ Test 4 Passed: No logic power forces all outputs to HIGH-Z");
    } else {
      console.error("❌ Test 4 Failed:", pins);
      passed = false;
    }
  }

  // Test 5 — Channel 1 HIGH
  {
    const frame = createMockFrame(node, { vcc: 5, vs: 12, enable1: 255, input1: 255 });
    const res = applyL293DFrameTransformer(frame);
    const out1 = res.components["chip1"]?.pins["output1"];
    if (out1?.voltage === 12 && out1?.active === true) {
      console.log("✓ Test 5 Passed: Channel 1 HIGH with VS = 12V");
    } else {
      console.error("❌ Test 5 Failed:", out1);
      passed = false;
    }
  }

  // Test 6 — Channel 2 LOW
  {
    const frame = createMockFrame(node, { vcc: 5, vs: 12, enable1: 255, input2: 0 });
    const res = applyL293DFrameTransformer(frame);
    const out2 = res.components["chip1"]?.pins["output2"];
    if (out2?.voltage === 0 && out2?.active === true) {
      console.log("✓ Test 6 Passed: Channel 2 LOW");
    } else {
      console.error("❌ Test 6 Failed:", out2);
      passed = false;
    }
  }

  // Test 7 — Shared Enable Group 1
  {
    const frame = createMockFrame(node, { vcc: 5, vs: 9, enable1: 0, input1: 255, input2: 255 });
    const res = applyL293DFrameTransformer(frame);
    const out1 = res.components["chip1"]?.pins["output1"];
    const out2 = res.components["chip1"]?.pins["output2"];
    if (out1?.active === false && out2?.active === false) {
      console.log("✓ Test 7 Passed: Shared Enable Group 1 disables both 1Y and 2Y");
    } else {
      console.error("❌ Test 7 Failed:", { out1, out2 });
      passed = false;
    }
  }

  // Test 8 — Shared Enable Group 2
  {
    const frame = createMockFrame(node, { vcc: 5, vs: 9, enable2: 0, input3: 255, input4: 255 });
    const res = applyL293DFrameTransformer(frame);
    const out3 = res.components["chip1"]?.pins["output3"];
    const out4 = res.components["chip1"]?.pins["output4"];
    if (out3?.active === false && out4?.active === false) {
      console.log("✓ Test 8 Passed: Shared Enable Group 2 disables both 3Y and 4Y");
    } else {
      console.error("❌ Test 8 Failed:", { out3, out4 });
      passed = false;
    }
  }

  // Test 9 — Enable Group Isolation
  {
    const frame = createMockFrame(node, { vcc: 5, vs: 9, enable1: 255, input1: 255, enable2: 0, input3: 255 });
    const res = applyL293DFrameTransformer(frame);
    const out1 = res.components["chip1"]?.pins["output1"];
    const out3 = res.components["chip1"]?.pins["output3"];
    if (out1?.active === true && out1?.voltage === 9 && out3?.active === false) {
      console.log("✓ Test 9 Passed: Enable Group 1 and Enable Group 2 are isolated");
    } else {
      console.error("❌ Test 9 Failed:", { out1, out3 });
      passed = false;
    }
  }

  // Test 10 — Independent Channels
  {
    const frameA = createMockFrame(node, { vcc: 5, vs: 9, enable1: 255, input1: 0, input2: 255 });
    const resA = applyL293DFrameTransformer(frameA);
    const out2A = resA.components["chip1"]?.pins["output2"];

    const frameB = createMockFrame(node, { vcc: 5, vs: 9, enable1: 255, input1: 255, input2: 255 });
    const resB = applyL293DFrameTransformer(frameB);
    const out2B = resB.components["chip1"]?.pins["output2"];

    if (out2A?.voltage === 9 && out2B?.voltage === 9) {
      console.log("✓ Test 10 Passed: Input 1A change does not affect Output 2Y");
    } else {
      console.error("❌ Test 10 Failed:", { out2A, out2B });
      passed = false;
    }
  }

  // Test 11 — VS Missing / 0V
  {
    const frame = createMockFrame(node, { vcc: 5, vs: 0, enable1: 255, input1: 255 });
    const res = applyL293DFrameTransformer(frame);
    const out1 = res.components["chip1"]?.pins["output1"];
    if (out1?.voltage === 0 && out1?.active === true) {
      console.log("✓ Test 11 Passed: Missing VS drives 0V when enabled HIGH");
    } else {
      console.error("❌ Test 11 Failed:", out1);
      passed = false;
    }
  }

  // Test 12 — PWM on Input
  {
    const frame1 = createMockFrame(node, { vcc: 5, vs: 9, enable1: 255, input1: 0 });
    const res1 = applyL293DFrameTransformer(frame1);
    const out1Frame1 = res1.components["chip1"]?.pins["output1"];

    const frame2 = createMockFrame(node, { vcc: 5, vs: 9, enable1: 255, input1: 255 });
    const res2 = applyL293DFrameTransformer(frame2);
    const out1Frame2 = res2.components["chip1"]?.pins["output1"];

    if (out1Frame1?.voltage === 0 && out1Frame1?.active === true && out1Frame2?.voltage === 9 && out1Frame2?.active === true) {
      console.log("✓ Test 12 Passed: PWM on input toggles between 0V and VS");
    } else {
      console.error("❌ Test 12 Failed:", { out1Frame1, out1Frame2 });
      passed = false;
    }
  }

  // Test 13 — PWM on Enable
  {
    const frame1 = createMockFrame(node, { vcc: 5, vs: 9, enable1: 0, input1: 255 });
    const res1 = applyL293DFrameTransformer(frame1);
    const out1Frame1 = res1.components["chip1"]?.pins["output1"];

    const frame2 = createMockFrame(node, { vcc: 5, vs: 9, enable1: 255, input1: 255 });
    const res2 = applyL293DFrameTransformer(frame2);
    const out1Frame2 = res2.components["chip1"]?.pins["output1"];

    if (out1Frame1?.active === false && out1Frame2?.active === true && out1Frame2?.voltage === 9) {
      console.log("✓ Test 13 Passed: PWM on enable toggles between HIGH-Z (active:false) and VS");
    } else {
      console.error("❌ Test 13 Failed:", { out1Frame1, out1Frame2 });
      passed = false;
    }
  }

  // Test 14 — Multiple L293D Instances
  {
    const nodeA = createMockL293DNode("l293d_A");
    const nodeB = createMockL293DNode("l293d_B");

    useCircuitStore.setState({
      nodes: [nodeA, nodeB],
      edges: [],
      arduinoCode: "",
      simulationStatus: "running",
    });

    const baseFrame = buildSimulationFrame({
      tick: 1,
      timestamp: 100,
      nodes: [nodeA, nodeB],
      edges: [],
      boardType: "none",
      running: true,
      error: null,
    });

    const multiFrame: SimulationFrame = {
      ...baseFrame,
      components: {
        ...baseFrame.components,
        "l293d_A": {
          nodeId: "l293d_A",
          componentType: "l293d",
          label: "L293D A",
          isPowered: true,
          brightness: 0,
          voltage: 5,
          telemetry: {},
          pins: {
            vcc: { handleId: "vcc", voltage: 5, normalizedValue: 1, active: true },
            vs: { handleId: "vs", voltage: 9, normalizedValue: 1, active: true },
            enable1: { handleId: "enable1", voltage: 255, normalizedValue: 1, active: true },
            input1: { handleId: "input1", voltage: 255, normalizedValue: 1, active: true },
          },
        },
        "l293d_B": {
          nodeId: "l293d_B",
          componentType: "l293d",
          label: "L293D B",
          isPowered: true,
          brightness: 0,
          voltage: 5,
          telemetry: {},
          pins: {
            vcc: { handleId: "vcc", voltage: 5, normalizedValue: 1, active: true },
            vs: { handleId: "vs", voltage: 12, normalizedValue: 1, active: true },
            enable1: { handleId: "enable1", voltage: 0, normalizedValue: 0, active: false },
            input1: { handleId: "input1", voltage: 0, normalizedValue: 0, active: false },
          },
        },
      },
    };

    const res = applyL293DFrameTransformer(multiFrame);
    const outA = res.components["l293d_A"]?.pins["output1"];
    const outB = res.components["l293d_B"]?.pins["output1"];

    if (outA?.voltage === 9 && outA?.active === true && outB?.active === false) {
      console.log("✓ Test 14 Passed: Multiple L293D instances evaluated independently");
    } else {
      console.error("❌ Test 14 Failed:", { outA, outB });
      passed = false;
    }
  }

  // Test 15 — Disconnected Motor Terminal (Open Circuit)
  {
    const motorNode: CircuitNode = {
      id: "motor_disc",
      type: "circuitComponent",
      position: { x: 400, y: 0 },
      data: {
        componentType: "dcmotor",
        simulationModel: "dcmotor",
        label: "DC Motor Disconnected",
        rotation: 0,
        properties: {},
      },
    };
    const disconnectedEdge: CircuitEdge = {
      id: "e_disc",
      source: "chip1",
      sourceHandle: "output1",
      target: "motor_disc",
      targetHandle: "pin1",
    };

    useCircuitStore.setState({
      nodes: [node, motorNode],
      edges: [disconnectedEdge],
      simulationStatus: "running",
    });

    const frameDisc = createMockFrame(node, { vcc: 5, vs: 9, enable1: 255, input1: 255 });

    const resDisc = applyL293DFrameTransformer(frameDisc);
    const motorComp = resDisc.components["motor_disc"];

    if (motorComp?.isPowered === false && motorComp?.telemetry?.rpm === 0 && motorComp?.telemetry?.openCircuit === true) {
      console.log("✓ Test 15 Passed: Disconnected motor wire halts rotation (openCircuit: true, RPM = 0)");
    } else {
      console.error("❌ Test 15 Failed:", motorComp);
      passed = false;
    }
  }

  console.log("\n=================== L293D TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runL293DTests();
  if (success) {
    console.log("✅ All 15 L293D behavioral tests passed successfully.");
  } else {
    console.error("❌ Some L293D behavioral tests failed.");
    process.exit(1);
  }
}
