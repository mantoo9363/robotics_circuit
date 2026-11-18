import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { buildSimulationFrame } from "../lib/simulation-state";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import type { SimContext } from "../lib/simulation/types";

function assert(description: string, condition: boolean) {
  if (!condition) {
    console.error(`  [FAIL] ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  } else {
    console.log(`  [PASS] ${description}`);
  }
}

console.log("=================== ESP32 GPIO COMPONENTS SWEEP TEST SUITE ===================");

let testsFailed = 0;

function runTest(testName: string, testFn: () => void) {
  console.log(`\n--- ${testName} ---`);
  try {
    testFn();
  } catch (e: any) {
    console.error(`TEST FAILED: ${e.message}`);
    testsFailed++;
  }
}

// ─── TEST 1: Slideswitch digital input read (Pin.IN) ─────────────────────────
runTest("TEST 1: Slideswitch digital input via Pin.IN (state left vs right)", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "sw-1",
      type: "slideswitch",
      data: {
        label: "Slide Switch",
        componentType: "slideswitch",
        properties: { state: { label: "State", type: "select", value: "right" } },
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "sw-1", targetHandle: "common" },
    { id: "e2", source: "esp32-1", sourceHandle: "gpio4", target: "sw-1", targetHandle: "pin2" },
  ];

  const code = `
from machine import Pin
sw = Pin(4, Pin.IN)
val = sw.value()
`.trim();

  const ctx: SimContext = {
    nodes,
    edges,
    picoCode: code,
    arduinoCode: "",
    dynamicComponents: [],
    keypad4x4State: { getState: () => ({ inputPassword: "" }) } as any,
    keypad4x3State: { getState: () => ({ inputPassword: "" }) } as any,
    selectedLanguage: "python",
  } as any;

  const initialFrame = buildSimulationFrame({
    tick: 0,
    nodes,
    edges,
    dynamicComponents: [],
    boardType: "esp32",
    running: true,
  });

  const frame = applyEsp32SimulationToFrame(initialFrame, ctx);
  const gpio4 = frame.components["esp32-1"]?.pins["gpio4"];
  const gpio4Tel = frame.components["esp32-1"]?.telemetry;

  assert("GPIO4 pin present in telemetry", gpio4 !== undefined);
  assert("GPIO4 input logicHigh is true when slideswitch is thrown to pin2 (3.3V)", gpio4Tel?.gpio4_input_logicHigh === true);
  assert("GPIO4 input voltage is 3.3V", gpio4Tel?.gpio4_input_voltage === 3.3);
});

// ─── TEST 2: Tilt Sensor digital input read (Pin.IN) ──────────────────────────
runTest("TEST 2: Tilt sensor digital input via Pin.IN (3.3V connected)", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "tilt-1",
      type: "tiltSensor",
      data: {
        label: "Tilt Sensor",
        componentType: "tiltSensor",
        properties: {},
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "tilt-1", targetHandle: "pin1" },
    { id: "e2", source: "esp32-1", sourceHandle: "gpio15", target: "tilt-1", targetHandle: "pin2" },
  ];

  const code = `
from machine import Pin
tilt = Pin(15, Pin.IN, Pin.PULL_DOWN)
val = tilt.value()
`.trim();

  const ctx: SimContext = {
    nodes,
    edges,
    picoCode: code,
    arduinoCode: "",
    dynamicComponents: [],
    keypad4x4State: { getState: () => ({ inputPassword: "" }) } as any,
    keypad4x3State: { getState: () => ({ inputPassword: "" }) } as any,
    selectedLanguage: "python",
  } as any;

  const initialFrame = buildSimulationFrame({
    tick: 0,
    nodes,
    edges,
    dynamicComponents: [],
    boardType: "esp32",
    running: true,
  });

  const frame = applyEsp32SimulationToFrame(initialFrame, ctx);
  const tel = frame.components["esp32-1"]?.telemetry;

  assert("GPIO15 telemetry registered", tel !== undefined);
  assert("GPIO15 input pull is 'down'", tel?.gpio15_input_pull === "down");
});

// ─── TEST 3: SPST & DPDT Relays driven via Pin.OUT HIGH ──────────────────────
runTest("TEST 3: SPST Relay coil driven via Pin.OUT (HIGH)", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "relay-1",
      type: "relaySpst",
      data: {
        label: "SPST Relay",
        componentType: "relaySpst",
        properties: {},
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "gpio14", target: "relay-1", targetHandle: "terminal1" },
    { id: "e2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "relay-1", targetHandle: "terminal12" },
  ];

  const code = `
from machine import Pin
relay = Pin(14, Pin.OUT)
relay.value(1)
`.trim();

  const ctx: SimContext = {
    nodes,
    edges,
    picoCode: code,
    arduinoCode: "",
    dynamicComponents: [],
    keypad4x4State: { getState: () => ({ inputPassword: "" }) } as any,
    keypad4x3State: { getState: () => ({ inputPassword: "" }) } as any,
    selectedLanguage: "python",
  } as any;

  const initialFrame = buildSimulationFrame({
    tick: 0,
    nodes,
    edges,
    dynamicComponents: [],
    boardType: "esp32",
    running: true,
  });

  const frame = applyEsp32SimulationToFrame(initialFrame, ctx);
  const pinState = frame.components["esp32-1"]?.pins["gpio14"];

  assert("GPIO14 pin state present", pinState !== undefined);
  assert("GPIO14 output voltage is 3.3V (HIGH)", pinState?.voltage === 3.3);
  assert("GPIO14 is active", pinState?.active === true);
});

console.log("\n=================== SUMMARY ===================");
if (testsFailed === 0) {
  console.log("✅ All ESP32 GPIO sweep tests passed successfully.");
} else {
  console.error(`❌ ${testsFailed} test(s) failed.`);
  process.exit(1);
}
