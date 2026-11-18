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

console.log("=================== ESP32 PWM COMPONENTS SWEEP TEST SUITE ===================");

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

// ─── TEST 1: Piezo Buzzer generic PWM voltage & duty cycle ─────────────────────
// Note: Audio pitch/tone frequency synthesis is currently unimplemented across all simulator boards.
// Here we verify generic PWM voltage propagation & duty telemetry for Piezo.
runTest("TEST 1: Piezo Buzzer driven via PWM(Pin(25)) generic duty & voltage", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "piezo-1",
      type: "piezo",
      data: {
        label: "Piezo",
        componentType: "piezo",
        properties: {},
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "gpio25", target: "piezo-1", targetHandle: "positive" },
    { id: "e2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "piezo-1", targetHandle: "negative" },
  ];

  const code = `
from machine import Pin, PWM
bz = PWM(Pin(25), freq=1000, duty=512)
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
  const esp32Comp = frame.components["esp32-1"];
  const pinState = esp32Comp?.pins["gpio25"];

  assert("GPIO25 pin state present", pinState !== undefined);
  assert("GPIO25 PWM effective voltage ≈ 1.65V (50% duty)", Math.abs(pinState?.voltage - 1.65) < 0.1);
  assert("GPIO25 PWM duty telemetry registered", esp32Comp?.telemetry?.gpio25_pwm_duty !== undefined);
});

// ─── TEST 2: RGB LED 3-channel PWM duty driving ──────────────────────────────
runTest("TEST 2: RGB LED Red/Green/Blue driven by 3 PWM channels", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "rgb-1",
      type: "ledrgb",
      data: {
        label: "RGB LED",
        componentType: "ledrgb",
        properties: {},
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "gpio12", target: "rgb-1", targetHandle: "red" },
    { id: "e2", source: "esp32-1", sourceHandle: "gpio13", target: "rgb-1", targetHandle: "green" },
    { id: "e3", source: "esp32-1", sourceHandle: "gpio14", target: "rgb-1", targetHandle: "blue" },
    { id: "e4", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "rgb-1", targetHandle: "ground" },
  ];

  const code = `
from machine import Pin, PWM
r = PWM(Pin(12), duty=1023)
g = PWM(Pin(13), duty=512)
b = PWM(Pin(14), duty=0)
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
  const rgbComp = frame.components["rgb-1"];

  assert("RGB component present", rgbComp !== undefined);
  assert("RGB LED is powered", rgbComp?.isPowered === true);
  assert("Red channel normalized value > 0.9", (rgbComp?.pins?.["red"]?.normalizedValue ?? 0) > 0.9);
  assert("Blue channel normalized value is 0", rgbComp?.pins?.["blue"]?.normalizedValue === 0);
});

// ─── TEST 3: DC Motor / Gearmotor PWM Speed Control ──────────────────────────
runTest("TEST 3: DC Motor speed control via PWM duty cycle", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "m1",
      type: "dcmotor",
      data: {
        label: "DC Motor",
        componentType: "dcmotor",
        properties: {},
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "gpio27", target: "m1", targetHandle: "pin1" },
    { id: "e2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "m1", targetHandle: "pin2" },
  ];

  const code = `
from machine import Pin, PWM
motor = PWM(Pin(27), duty=768)
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
  const pinState = frame.components["esp32-1"]?.pins["gpio27"];

  assert("GPIO27 pin state present for motor", pinState !== undefined);
  assert("GPIO27 PWM voltage ≈ 2.475V (75% duty)", Math.abs(pinState?.voltage - 2.475) < 0.1);
});

// ─── TEST 4: Piezo Buzzer duty(512) & freq(1000) method calls ────────────────
runTest("TEST 4: Piezo Buzzer duty(512) & freq(1000) method calls with audio pitch", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "piezo-1",
      type: "piezo",
      data: { label: "Piezo", componentType: "piezo", properties: {}, rotation: 0 },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "gpio25", target: "piezo-1", targetHandle: "positive" },
    { id: "e2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "piezo-1", targetHandle: "negative" },
  ];

  const codeOn = `
from machine import Pin, PWM
bz = PWM(Pin(25))
bz.freq(1000)
bz.duty(512)
`.trim();

  const ctxOn: SimContext = {
    nodes,
    edges,
    picoCode: codeOn,
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

  const frameOn = applyEsp32SimulationToFrame(initialFrame, ctxOn);
  const piezoCompOn = frameOn.components["piezo-1"];

  assert("Piezo is powered when duty(512)", piezoCompOn?.isPowered === true);
  assert("Piezo brightness > 0.01 (triggers visual ripple)", (piezoCompOn?.brightness ?? 0) > 0.01);
  assert("Piezo tone is ON", piezoCompOn?.telemetry?.tone === "ON");
  assert("Piezo frequency is 1000 Hz", piezoCompOn?.telemetry?.frequency === 1000);

  // Test silent phase (duty=0)
  const codeOff = `
from machine import Pin, PWM
bz = PWM(Pin(25))
bz.duty(0)
`.trim();

  const ctxOff: SimContext = {
    ...ctxOn,
    picoCode: codeOff,
  };

  const frameOff = applyEsp32SimulationToFrame(initialFrame, ctxOff);
  const piezoCompOff = frameOff.components["piezo-1"];

  assert("Piezo is NOT powered when duty(0)", piezoCompOff?.isPowered === false);
  assert("Piezo brightness is 0 when silent", piezoCompOff?.brightness === 0);
  assert("Piezo tone is OFF", piezoCompOff?.telemetry?.tone === "OFF");
});

// ─── TEST 5: Piezo Buzzer PWM(Pin(25), freq=2000, duty=512) Constructor Args ──
runTest("TEST 5: Piezo Buzzer PWM constructor arguments (freq & duty)", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "piezo-1",
      type: "piezo",
      data: { label: "Piezo", componentType: "piezo", properties: {}, rotation: 0 },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "gpio25", target: "piezo-1", targetHandle: "positive" },
    { id: "e2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "piezo-1", targetHandle: "negative" },
  ];

  const code = `
from machine import Pin, PWM
bz = PWM(Pin(25), freq=2000, duty=512)
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
  const piezoComp = frame.components["piezo-1"];

  assert("Constructor args: Piezo is powered", piezoComp?.isPowered === true);
  assert("Constructor args: Piezo brightness > 0.01", (piezoComp?.brightness ?? 0) > 0.01);
  assert("Constructor args: Piezo frequency is 2000 Hz", piezoComp?.telemetry?.frequency === 2000);
});

console.log("\n=================== SUMMARY ===================");
if (testsFailed === 0) {
  console.log("✅ All ESP32 PWM sweep tests passed successfully.");
} else {
  console.error(`❌ ${testsFailed} test(s) failed.`);
  process.exit(1);
}
