import { applyEsp32LcdOutputToFrame } from "../lib/simulation/frameTransformers/esp32";
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

console.log("=================== ESP32 LCD FRAME TRANSFORMER TEST SUITE ===================");

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

function makeEsp32LcdCircuit(i2cAddress = "0x27") {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "lcd-1",
      type: "lcd16x2",
      data: {
        label: "LCD 16x2",
        componentType: "lcd16x2",
        properties: { i2cAddress: { label: "Address", type: "string", value: i2cAddress } },
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

  return { nodes, edges };
}

// ─── TEST 1: Telemetry Mapping Assertions ──────────────────────────────────
runTest("TEST 1: Parsed LCD state maps to telemetry shape expected by LCD16x2Node", () => {
  const { nodes, edges } = makeEsp32LcdCircuit();
  const code = `
from machine import I2C, Pin
from pico_i2c_lcd import I2cLcd

i2c = I2C(0, scl=Pin(22), sda=Pin(21))
lcd = I2cLcd(i2c, 0x27, 2, 16)
lcd.putstr("Line 1 Test")
lcd.move_to(0, 1)
lcd.putstr("Line 2 Test")
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
  const lcdTel = frame.components["lcd-1"]?.telemetry;

  assert("Telemetry exists for lcd-1", lcdTel !== undefined);
  assert("isPowered is true", lcdTel?.isPowered === true);
  assert("isSignalOk is true", lcdTel?.isSignalOk === true);
  assert("backlight is 'on'", lcdTel?.backlight === "on");
  assert("displayEnabled is true", lcdTel?.displayEnabled === true);
  assert("line1 starts with 'Line 1 Test'", String(lcdTel?.line1).startsWith("Line 1 Test"));
  assert("line2 starts with 'Line 2 Test'", String(lcdTel?.line2).startsWith("Line 2 Test"));
});

// ─── TEST 2: Forbidden SPI Flash Pin (GPIO 8) Rejection ─────────────────────
runTest("TEST 2: Forbidden SPI Flash Pin (GPIO 8) declared for SDA triggers error", () => {
  const { nodes, edges } = makeEsp32LcdCircuit();
  const code = `
from machine import I2C, Pin
from pico_i2c_lcd import I2cLcd

i2c = I2C(0, scl=Pin(22), sda=Pin(8))
lcd = I2cLcd(i2c, 0x27, 2, 16)
lcd.putstr("Should Fail")
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
  const lcdTel = frame.components["lcd-1"]?.telemetry;

  assert("isPowered is false for forbidden SPI pin", lcdTel?.isPowered === false);
  assert("error mentions Forbidden SPI Flash", String(lcdTel?.error).includes("Forbidden SPI Flash"));
});

console.log("\n=================== SUMMARY ===================");
if (testsFailed === 0) {
  console.log("✅ All ESP32 LCD frame transformer tests passed successfully.");
} else {
  console.error(`❌ ${testsFailed} test(s) failed.`);
  process.exit(1);
}
