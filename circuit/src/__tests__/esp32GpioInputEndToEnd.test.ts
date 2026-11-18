/**
 * esp32GpioInputEndToEnd.test.ts
 * E2E: ESP32 + pushbutton + LED, MicroPython reads button state and lights LED.
 * Assert final LED telemetry matches expected button state.
 * Uses applyFramePipeline (same pattern as esp32GpioEndToEnd.test.ts).
 */

import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { NE555StateManager, CapacitorStateManager, KeypadStateManager } from "../lib/simulation/stateMaps";
import type { CircuitNode, CircuitEdge } from "../lib/types";

const ne555State    = new NE555StateManager();
const capacitorState = new CapacitorStateManager();
const keypad4x4State = new KeypadStateManager();
const keypad4x3State = new KeypadStateManager();

function makeNode(id: string, type: string, componentType: string, props: Record<string, any> = {}): CircuitNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { componentType, simulationModel: componentType, label: type, properties: props, rotation: 0 },
  };
}

function makeEdge(id: string, source: string, sh: string, target: string, th: string): CircuitEdge {
  return { id, source, sourceHandle: sh, target, targetHandle: th, data: { color: "#000000" } };
}

function makeFrame(nodes: CircuitNode[], edges: CircuitEdge[], code: string) {
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
      picoCode: code,
      boardType: "esp32" as const,
      selectedLanguage: "python",
      dynamicComponents: [],
      ne555State,
      capacitorState,
      keypad4x4State,
      keypad4x3State,
    } as any,
  };
}

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

  console.log("=================== ESP32 GPIO INPUT END-TO-END TESTS ===================");

  /**
   * Phase 2 Slice 1.5 E2E scope:
   *   1. gpio_read: Input pin voltage is correctly resolved from connected components.
   *   2. MicroPython AST conditional evaluation (`if btn.value() == 0: led.value(1) else: led.value(0)`):
   *      - When button is pressed: GPIO14 = LOW (0V) -> led.value(1) -> LED ON.
   *      - When button is released: GPIO14 = HIGH (3.3V) -> led.value(0) -> LED OFF.
   */

  const esp32 = makeNode("esp32_1", "esp32", "esp32");
  const led   = makeNode("led_1", "led", "led", { color: { label: "Color", type: "select" as const, value: "red" } });

  const baseEdges = [
    makeEdge("e3", "esp32_1", "gpio2",    "led_1",   "anode"),
    makeEdge("e4", "led_1",   "cathode",  "esp32_1", "esp32_gnd2"),
  ];

  const code = `
from machine import Pin
btn = Pin(14, Pin.IN, Pin.PULL_UP)
led = Pin(2, Pin.OUT)
if btn.value() == 0:
    led.value(1)
else:
    led.value(0)
`;

  // --- SCENARIO A: Button pressed -> GPIO14 LOW -> Conditional led.value(1) -> LED ON ---
  console.log("\n--- SCENARIO A: Button pressed \u2192 GPIO14 LOW \u2192 Conditional led.value(1) (LED ON) ---");
  {
    const btn   = makeNode("btn_1", "pushbutton", "pushbutton", {
      state: { label: "State", type: "select" as const, value: "pressed" },
    });
    const edges = [
      makeEdge("e1", "esp32_1", "gpio14", "btn_1",   "pin2"),
      makeEdge("e2", "btn_1",   "pin1",   "esp32_1", "esp32_gnd1"),
      ...baseEdges,
    ];

    const { frame, context } = makeFrame([esp32, btn, led], edges, code);
    const result = applyFramePipeline(frame as any, context);

    const logicHigh14 = result.components["esp32_1"]?.telemetry?.["gpio14_input_logicHigh"];
    const voltage14   = result.components["esp32_1"]?.telemetry?.["gpio14_input_voltage"];
    const gpio2Pin    = result.components["esp32_1"]?.pins?.["gpio2"];
    const ledCompA    = result.components["led_1"];

    assert("GPIO14 input logicHigh = false (button pressed \u2192 LOW)", logicHigh14 === false);
    assert("GPIO14 input voltage = 0V when button pressed", (voltage14 as number ?? 99) === 0);
    assert("GPIO2 output voltage = 3.3V (conditional led.value(1))", gpio2Pin?.voltage === 3.3);
    assert("LED is powered ON when button is pressed", ledCompA?.isPowered === true);
    assert("LED pathBlocked = false", ledCompA?.telemetry?.pathBlocked !== true);
    assert("LED brightness > 0", (ledCompA?.brightness ?? 0) > 0);
    console.log(`  [Trace] GPIO14 = ${voltage14}V, GPIO2 = ${gpio2Pin?.voltage}V, LED brightness = ${ledCompA?.brightness?.toFixed(2)}`);
  }

  // --- SCENARIO B: Button released -> GPIO14 HIGH -> Conditional led.value(0) -> LED OFF ---
  console.log("\n--- SCENARIO B: Button released \u2192 GPIO14 HIGH \u2192 Conditional led.value(0) (LED OFF) ---");
  {
    const btn   = makeNode("btn_1", "pushbutton", "pushbutton", {
      state: { label: "State", type: "select" as const, value: "released" },
    });
    const edges = [
      makeEdge("e1", "esp32_1", "gpio14", "btn_1",   "pin2"),
      makeEdge("e2", "btn_1",   "pin1",   "esp32_1", "esp32_gnd1"),
      ...baseEdges,
    ];

    const { frame, context } = makeFrame([esp32, btn, led], edges, code);
    const result = applyFramePipeline(frame as any, context);

    const logicHigh14 = result.components["esp32_1"]?.telemetry?.["gpio14_input_logicHigh"];
    const voltage14   = result.components["esp32_1"]?.telemetry?.["gpio14_input_voltage"];
    const gpio2Pin    = result.components["esp32_1"]?.pins?.["gpio2"];
    const ledCompB    = result.components["led_1"];

    assert("GPIO14 input logicHigh = true (PULL_UP + released \u2192 HIGH)", logicHigh14 === true);
    assert("GPIO14 input voltage = 3.3V (PULL_UP default)", (voltage14 as number ?? 0) === 3.3);
    assert("GPIO2 output voltage = 0V (conditional led.value(0))", (gpio2Pin?.voltage ?? 99) === 0);
    assert("LED is NOT powered (GPIO2 LOW)", ledCompB?.isPowered !== true);
    console.log(`  [Trace] GPIO14 = ${voltage14}V, GPIO2 = ${gpio2Pin?.voltage}V, LED isPowered = ${ledCompB?.isPowered}`);
  }

  console.log("\n=================== ESP32 GPIO INPUT END-TO-END TESTS COMPLETE ===================");
  if (fail === 0) {
    console.log(`\u2705 All ${pass} ESP32 GPIO Input E2E tests passed.`);
  } else {
    console.error(`\u274C ${fail} test(s) FAILED.`);
    process.exit(1);
  }
}

run();

