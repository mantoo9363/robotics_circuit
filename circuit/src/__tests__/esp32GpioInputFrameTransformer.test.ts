/**
 * esp32GpioInputFrameTransformer.test.ts
 * Tests gpio_read input pin voltage resolution via applyFramePipeline.
 * Validates: PULL_UP default HIGH, button-pressed LOW, PULL_DOWN default LOW.
 */

import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { NE555StateManager, CapacitorStateManager, KeypadStateManager } from "../lib/simulation/stateMaps";
import type { CircuitNode, CircuitEdge } from "../lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ne555State    = new NE555StateManager();
const capacitorState = new CapacitorStateManager();
const keypad4x4State = new KeypadStateManager();
const keypad4x3State = new KeypadStateManager();

function makeEsp32Node(id = "esp32_1"): CircuitNode {
  return {
    id,
    type: "esp32",
    position: { x: 0, y: 0 },
    data: { componentType: "esp32", simulationModel: "esp32", label: "ESP32 DevKit V1", properties: {}, rotation: 0 },
  };
}

function makeButtonNode(id: string, pressed: boolean): CircuitNode {
  return {
    id,
    type: "pushbutton",
    position: { x: 200, y: 0 },
    data: {
      componentType: "pushbutton",
      simulationModel: "pushbutton",
      label: "Button",
      rotation: 0,
      properties: { state: { label: "State", type: "select" as const, value: pressed ? "pressed" : "released" } },
    },
  };
}

function makeEdge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): CircuitEdge {
  return { id, source, sourceHandle, target, targetHandle, data: { color: "#000000" } };
}

function makeFrame(nodes: CircuitNode[], edges: CircuitEdge[], code: string, isPython = true) {
  return {
    frame: {
      running: true,
      tick: 1,
      timestamp: 100,
      boardType: "esp32" as const,
      boardPins: [],
      components: {},
      nodes,
      edges,
    },
    context: {
      nodes,
      edges,
      arduinoCode: "",
      picoCode: isPython ? code : "",
      boardType: "esp32" as const,
      selectedLanguage: isPython ? "python" : "cpp",
      dynamicComponents: [],
      ne555State,
      capacitorState,
      keypad4x4State,
      keypad4x3State,
    } as any,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

function run() {
  let pass = 0;
  let fail = 0;

  function assert(label: string, condition: boolean) {
    if (condition) {
      console.log(`  [PASS] ${label}`);
      pass++;
    } else {
      console.error(`  [FAIL] ${label}`);
      fail++;
    }
  }

  console.log("=================== ESP32 GPIO INPUT FRAME TRANSFORMER TESTS ===================");

  // --- TEST 1: PULL_UP — button released → pin reads HIGH (3.3V) ---
  console.log("\n--- TEST 1: PULL_UP default \u2014 button released \u2192 pin HIGH (3.3V) ---");
  {
    const esp32 = makeEsp32Node("esp32_1");
    const btn   = makeButtonNode("btn_1", false); // NOT pressed
    // Button pin2 connected to ESP32 gpio14, button pin1 NOT wired to GND here (floating path)
    const edges = [makeEdge("e1", "esp32_1", "gpio14", "btn_1", "pin2")];
    const code  = `btn = Pin(14, Pin.IN, Pin.PULL_UP)\nif btn.value():\n    pass`;
    const { frame, context } = makeFrame([esp32, btn], [edges[0]], code);
    const result = applyFramePipeline(frame as any, context);

    const gpio14    = result.components["esp32_1"]?.pins?.["gpio14"];
    const logicHigh = result.components["esp32_1"]?.telemetry?.["gpio14_input_logicHigh"];
    const pull      = result.components["esp32_1"]?.telemetry?.["gpio14_input_pull"];
    assert("gpio14 pin exists in components", gpio14 !== undefined);
    assert("PULL_UP + released → voltage = 3.3V", (gpio14?.voltage ?? 0) === 3.3);
    assert("logicHigh = true", logicHigh === true);
    assert("pull carried in telemetry = up", pull === "up");
  }

  // --- TEST 2: PULL_UP — button pressed → pin reads LOW (0V) ---
  console.log("\n--- TEST 2: PULL_UP \u2014 button pressed \u2192 pin LOW (0V) ---");
  {
    const esp32 = makeEsp32Node("esp32_1");
    const btn   = makeButtonNode("btn_1", true); // PRESSED
    const edges = [makeEdge("e1", "esp32_1", "gpio14", "btn_1", "pin2"),
                   makeEdge("e2", "btn_1",   "pin1",  "esp32_1", "esp32_gnd1")];
    const code  = `btn = Pin(14, Pin.IN, Pin.PULL_UP)\nif btn.value():\n    pass`;
    const { frame, context } = makeFrame([esp32, btn], edges, code);
    const result = applyFramePipeline(frame as any, context);

    const gpio14   = result.components["esp32_1"]?.pins?.["gpio14"];
    const logicH14 = result.components["esp32_1"]?.telemetry?.["gpio14_input_logicHigh"];
    assert("gpio14 pin exists in components", gpio14 !== undefined);
    assert("PULL_UP + pressed → voltage = 0V", (gpio14?.voltage ?? 99) === 0);
    assert("logicHigh = false", logicH14 === false);
  }

  // --- TEST 3: PULL_DOWN default — no GND driver → pin reads LOW ---
  console.log("\n--- TEST 3: PULL_DOWN default \u2014 nothing connected \u2192 pin LOW (0V) ---");
  {
    const esp32 = makeEsp32Node("esp32_1");
    const code  = `sensor = Pin(26, Pin.IN, Pin.PULL_DOWN)`;
    const { frame, context } = makeFrame([esp32], [], code);
    const result = applyFramePipeline(frame as any, context);

    const gpio26   = result.components["esp32_1"]?.pins?.["gpio26"];
    const logicH26 = result.components["esp32_1"]?.telemetry?.["gpio26_input_logicHigh"];
    const pull26   = result.components["esp32_1"]?.telemetry?.["gpio26_input_pull"];
    assert("gpio26 pin exists", gpio26 !== undefined);
    assert("PULL_DOWN + floating → voltage = 0V", (gpio26?.voltage ?? 99) === 0);
    assert("logicHigh = false", logicH26 === false);
    assert("pull = down in telemetry", pull26 === "down");
  }

  // --- TEST 4: No-pull floating pin → LOW ---
  console.log("\n--- TEST 4: No pull (Pin.IN only) \u2014 floating \u2192 LOW ---");
  {
    const esp32 = makeEsp32Node("esp32_1");
    const code  = `pir = Pin(15, Pin.IN)`;
    const { frame, context } = makeFrame([esp32], [], code);
    const result = applyFramePipeline(frame as any, context);

    const gpio15   = result.components["esp32_1"]?.pins?.["gpio15"];
    assert("gpio15 pin exists", gpio15 !== undefined);
    assert("No pull + floating → voltage = 0V", (gpio15?.voltage ?? 99) === 0);
  }

  console.log("\n=================== ESP32 GPIO INPUT FRAME TRANSFORMER TESTS COMPLETE ===================");
  if (fail === 0) {
    console.log(`\u2705 All ${pass} ESP32 GPIO Input Frame Transformer tests passed.`);
  } else {
    console.error(`\u274C ${fail} test(s) FAILED.`);
    process.exit(1);
  }
}

run();
