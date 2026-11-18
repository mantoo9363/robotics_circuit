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

console.log("=================== ESP32 ADC SENSORS SWEEP TEST SUITE ===================");

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

// ─── TEST 1: Photoresistor (LDR) analog voltage read via ADC(Pin(34)) ────────
runTest("TEST 1: Photoresistor (LDR) analog voltage read via ADC.read()", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "ldr-1",
      type: "photoresistor",
      data: {
        label: "Photoresistor",
        componentType: "photoresistor",
        properties: { lightLevel: { label: "Light Level", type: "number", value: 512 } },
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "ldr-1", targetHandle: "pin1" },
    { id: "e2", source: "esp32-1", sourceHandle: "gpio34", target: "ldr-1", targetHandle: "pin2" },
  ];

  const code = `
from machine import ADC, Pin
adc = ADC(Pin(34))
val = adc.read()
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

  assert("GPIO34 ADC voltage is 3.3V", tel?.gpio34_adc_voltage === 3.3);
  assert("GPIO34 ADC raw 12-bit reading is 4095", tel?.gpio34_adc_raw === 4095);
});

// ─── TEST 2: Soil Moisture Sensor analog voltage read ────────────────────────
runTest("TEST 2: Soil Moisture Sensor analog voltage read via ADC.read()", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "soil-1",
      type: "soilMoisture",
      data: {
        label: "Soil Moisture",
        componentType: "soilMoisture",
        properties: {},
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "soil-1", targetHandle: "vcc" },
    { id: "e2", source: "esp32-1", sourceHandle: "gpio35", target: "soil-1", targetHandle: "sig" },
  ];

  const code = `
from machine import ADC, Pin
adc = ADC(Pin(35))
val = adc.read()
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

  assert("GPIO35 ADC voltage registered", tel?.gpio35_adc_voltage !== undefined);
  assert("GPIO35 ADC raw 12-bit registered", tel?.gpio35_adc_raw !== undefined);
});

// ─── TEST 3: Temperature / Gas / Force / Flex Sensors analog voltage reads ───
runTest("TEST 3: Force Sensor (FSR) analog voltage read via ADC.read()", () => {
  const nodes: any[] = [
    {
      id: "esp32-1",
      type: "esp32",
      data: { label: "ESP32", componentType: "esp32", properties: {}, rotation: 0 },
      position: { x: 0, y: 0 },
    },
    {
      id: "fsr-1",
      type: "forceSensor",
      data: {
        label: "Force Sensor",
        componentType: "forceSensor",
        properties: {},
        rotation: 0,
      },
      position: { x: 200, y: 0 },
    },
  ];

  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32-1", sourceHandle: "esp32_3v3", target: "fsr-1", targetHandle: "pin1" },
    { id: "e2", source: "esp32-1", sourceHandle: "gpio32", target: "fsr-1", targetHandle: "pin2" },
  ];

  const code = `
from machine import ADC, Pin
adc = ADC(Pin(32))
val = adc.read()
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

  assert("GPIO32 ADC voltage is 3.3V", tel?.gpio32_adc_voltage === 3.3);
  assert("GPIO32 ADC raw 12-bit reading is 4095", tel?.gpio32_adc_raw === 4095);
});

console.log("\n=================== SUMMARY ===================");
if (testsFailed === 0) {
  console.log("✅ All ESP32 ADC sweep tests passed successfully.");
} else {
  console.error(`❌ ${testsFailed} test(s) failed.`);
  process.exit(1);
}
