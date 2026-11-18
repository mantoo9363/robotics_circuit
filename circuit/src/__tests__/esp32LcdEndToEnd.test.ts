import { applyEsp32LcdOutputToFrame } from "../lib/simulation/frameTransformers/esp32";
import { buildSimulationFrame } from "../lib/simulation-state";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import type { SimContext } from "../lib/simulation/types";
import { validateComponentConnections } from "../utils/connectivity";

function assert(description: string, condition: boolean) {
  if (!condition) {
    console.error(`  [FAIL] ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  } else {
    console.log(`  [PASS] ${description}`);
  }
}

console.log("=================== ESP32 LCD END-TO-END REGRESSION TEST SUITE ===================");

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

// ─── TEST 1: Full Pipeline MicroPython "Hello ESP32" -> Canvas Render ────────
runTest("TEST 1: End-to-End simulation tick renders MicroPython text on LCD canvas", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", simulationModel: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "lcd-1",
      type: "lcd16x2",
      data: {
        label: "LCD 16x2",
        componentType: "lcd16x2",
        simulationModel: "lcd16x2",
        properties: { i2cAddress: { label: "Address", type: "string", value: "0x27" } },
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "lcd-1", targetHandle: "vcc" },
    { id: "e2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "lcd-1", targetHandle: "gnd" },
    { id: "e3", source: "esp32-1", sourceHandle: "gpio21", target: "lcd-1", targetHandle: "sda" },
    { id: "e4", source: "esp32-1", sourceHandle: "gpio22", target: "lcd-1", targetHandle: "scl" },
  ];

  const code = `
from machine import I2C, Pin
from pico_i2c_lcd import I2cLcd

i2c = I2C(0, scl=Pin(22), sda=Pin(21))
lcd = I2cLcd(i2c, 0x27, 2, 16)

lcd.clear()
lcd.putstr("Hello ESP32!")
lcd.move_to(0, 1)
lcd.putstr("MicroPython OK")
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

  const frame = applyEsp32LcdOutputToFrame(initialFrame, ctx);
  const tel = frame.components["lcd-1"]?.telemetry;

  assert("LCD telemetry present", tel !== undefined);
  assert("Line 1 contains 'Hello ESP32!'", String(tel?.line1).includes("Hello ESP32!"));
  assert("Line 2 contains 'MicroPython OK'", String(tel?.line2).includes("MicroPython OK"));
  assert("Display is powered", tel?.isPowered === true);
  assert("Backlight is on", tel?.backlight === "on");
  assert("Signal is OK", tel?.isSignalOk === true);
  assert("Error is empty", tel?.error === "");
});

// ─── TEST 2: Unwired declared pins (GPIO 18 / 19) -> LCD does NOT update ──────
runTest("TEST 2: Unwired declared pins (GPIO 18/19) surface miswire error and do not display", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", simulationModel: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "lcd-1",
      type: "lcd16x2",
      data: {
        label: "LCD 16x2",
        componentType: "lcd16x2",
        simulationModel: "lcd16x2",
        properties: { i2cAddress: { label: "Address", type: "string", value: "0x27" } },
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  // Canvas wired to GPIO 21 and 22
  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "lcd-1", targetHandle: "vcc" },
    { id: "e2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "lcd-1", targetHandle: "gnd" },
    { id: "e3", source: "esp32-1", sourceHandle: "gpio21", target: "lcd-1", targetHandle: "sda" },
    { id: "e4", source: "esp32-1", sourceHandle: "gpio22", target: "lcd-1", targetHandle: "scl" },
  ];

  // Code declares unwired pins 18 and 19
  const code = `
from machine import I2C, Pin
from pico_i2c_lcd import I2cLcd

i2c = I2C(0, scl=Pin(19), sda=Pin(18))
lcd = I2cLcd(i2c, 0x27, 2, 16)
lcd.putstr("Ghost Text")
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

  const frame = applyEsp32LcdOutputToFrame(initialFrame, ctx);
  const tel = frame.components["lcd-1"]?.telemetry;

  assert("Display is NOT powered", tel?.isPowered === false);
  assert("Signal is NOT OK", tel?.isSignalOk === false);
  assert("Line 1 is blank", tel?.line1 === "");
  assert("Error mentions I2C SDA/SCL Pin Miswire", String(tel?.error).includes("I2C SDA/SCL Pin Miswire"));
  assert("Serial output includes I2C Error", frame.serialOutput.some((line) => line.includes("[I2C Error]")));
});

// ─── TEST 3: Reversed SDA/SCL wiring (Demo circuit regression) ───────────────
runTest("TEST 3: Reversed SDA/SCL wiring (canvas sda->22, scl->21 vs code scl=22, sda=21) is detected as miswire", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", simulationModel: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "lcd-1",
      type: "lcd16x2",
      data: {
        label: "LCD 16x2",
        componentType: "lcd16x2",
        simulationModel: "lcd16x2",
        properties: { i2cAddress: { label: "Address", type: "string", value: "0x27" } },
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  // Canvas has reversed SDA/SCL: sda connected to gpio22, scl connected to gpio21
  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "lcd-1", targetHandle: "vcc" },
    { id: "e2", source: "esp32-1", sourceHandle: "esp32_gnd1", target: "lcd-1", targetHandle: "gnd" },
    { id: "e3", source: "esp32-1", sourceHandle: "gpio22", target: "lcd-1", targetHandle: "sda" },
    { id: "e4", source: "esp32-1", sourceHandle: "gpio21", target: "lcd-1", targetHandle: "scl" },
  ];

  // Code declares standard scl=Pin(22), sda=Pin(21)
  const code = `
from machine import SoftI2C, Pin
from pico_i2c_lcd import I2cLcd

i2c = SoftI2C(scl=Pin(22), sda=Pin(21))
lcd = I2cLcd(i2c, 0x27, 2, 16)
lcd.putstr("Reversed Pins")
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

  const frame = applyEsp32LcdOutputToFrame(initialFrame, ctx);
  const tel = frame.components["lcd-1"]?.telemetry;

  assert("Display is NOT powered on reversed pins", tel?.isPowered === false);
  assert("Signal is NOT OK on reversed pins", tel?.isSignalOk === false);
  assert("Line 1 is blank on reversed pins", tel?.line1 === "");
  assert("Error mentions I2C SDA/SCL Pin Miswire", String(tel?.error).includes("I2C SDA/SCL Pin Miswire"));
});

console.log("\n=================== SUMMARY ===================");
if (testsFailed === 0) {
  console.log("✅ All ESP32 LCD end-to-end regression tests passed successfully.");
} else {
  console.error(`❌ ${testsFailed} test(s) failed.`);
  process.exit(1);
}
