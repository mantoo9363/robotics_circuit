import assert from "node:assert";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { buildSimulationFrame } from "../lib/simulation-state";
import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { resetEsp32NeoPixelCache } from "../lib/simulation/frameTransformers/esp32Neopixel";
import { clearSimSessions } from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";

function createEsp32Node(id = "esp32-1"): CircuitNode {
  return {
    id,
    type: "esp32",
    position: { x: 100, y: 100 },
    data: {
      componentType: "esp32",
      label: "ESP32 DevKit V1",
      simulationModel: "esp32",
      properties: {},
      rotation: 0,
    },
  };
}

function createNeoPixelNode(id = "neopixel-1"): CircuitNode {
  return {
    id,
    type: "neopixel",
    position: { x: 300, y: 100 },
    data: {
      componentType: "neopixel",
      label: "NeoPixel WS2812B",
      simulationModel: "neopixel",
      properties: {},
      rotation: 0,
    },
  };
}

function createLcdNode(id = "lcd-1"): CircuitNode {
  return {
    id,
    type: "lcd16x2",
    position: { x: 300, y: 250 },
    data: {
      componentType: "lcd16x2",
      label: "I2C LCD 16x2",
      simulationModel: "lcd16x2",
      properties: {
        i2cAddress: { label: "I2C Address", type: "select", value: "0x27" },
      },
      rotation: 0,
    },
  };
}

function createServoNode(id = "servo-1"): CircuitNode {
  return {
    id,
    type: "servo",
    position: { x: 300, y: 400 },
    data: {
      componentType: "servo",
      label: "Servo Motor",
      simulationModel: "servo",
      properties: {},
      rotation: 0,
    },
  };
}

function createSoilMoistureNode(id = "soil-1", moistureVal = 295): CircuitNode {
  return {
    id,
    type: "soilMoisture",
    position: { x: 300, y: 550 },
    data: {
      componentType: "soilMoisture",
      label: "Soil Moisture Sensor",
      simulationModel: "soilMoisture",
      properties: {
        moisture: { label: "Moisture", type: "number", value: moistureVal },
      },
      rotation: 0,
    },
  };
}

function createKeypadNode(id = "keypad-1", pressedKey = "5"): CircuitNode {
  return {
    id,
    type: "keypad4x4",
    position: { x: 300, y: 700 },
    data: {
      componentType: "keypad4x4",
      label: "4x4 Matrix Keypad",
      simulationModel: "keypad4x4",
      properties: {
        pressedKeys: { label: "Pressed Keys", type: "string", value: pressedKey },
      },
      rotation: 0,
    },
  };
}

function createSevenSegmentNode(id = "disp-1", displayType: "Common Cathode" | "Common Anode" = "Common Cathode"): CircuitNode {
  return {
    id,
    type: "sevenSegment",
    position: { x: 300, y: 850 },
    data: {
      componentType: "sevenSegment",
      label: "7-Segment Display",
      simulationModel: "sevenSegment",
      properties: {
        displayType: { label: "Type", type: "select", value: displayType },
        color: { label: "Color", type: "select", value: "red" },
      },
      rotation: 0,
    },
  };
}

function createIrReceiverNode(id = "irr-1"): CircuitNode {
  return {
    id,
    type: "irReceiver",
    position: { x: 300, y: 1000 },
    data: {
      componentType: "irReceiver",
      label: "IR Receiver",
      simulationModel: "irReceiver",
      properties: {},
      rotation: 0,
    },
  };
}

function createIrRemoteNode(id = "rem-1", command: number, name: string, seq: number): CircuitNode {
  return {
    id,
    type: "irRemote",
    position: { x: 500, y: 1000 },
    data: {
      componentType: "irRemote",
      label: "IR Remote",
      simulationModel: "irRemote",
      properties: {
        lastCommand: {
          label: "Last Command",
          type: "string",
          value: JSON.stringify({ address: 0x00, command, name, seq }),
        },
      },
      rotation: 0,
    },
  };
}

function createResistorNode(id = "r-1", ohms = 220): CircuitNode {
  return {
    id,
    type: "resistor",
    position: { x: 300, y: 1000 },
    data: {
      componentType: "resistor",
      label: "Resistor",
      simulationModel: "resistor",
      properties: {
        resistance: { label: "Resistance", type: "number", value: ohms },
      },
      rotation: 0,
    },
  };
}

function runIntegrationTick(
  code: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  tick = 1,
) {
  useCircuitStore.setState({
    nodes,
    edges,
    simulationStatus: "running",
  });

  const context: any = {
    nodes,
    edges,
    picoCode: code,
    arduinoCode: "",
    selectedLanguage: "python",
    dynamicComponents: [],
    keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
  };

  const initialFrame = buildSimulationFrame({
    tick,
    nodes,
    edges,
    dynamicComponents: [],
    boardType: "esp32",
    running: true,
    arduinoState: {
      pins: new Map(),
      serialOutput: [],
      error: null,
      running: true,
    },
  });

  return applyFramePipeline(initialFrame, context);
}

console.log("=================== RUNNING ESP32 MULTI-COMPONENT INTEGRATION SUITE ===================");

// --- TEST 1: NeoPixel + I2C LCD on the same ESP32 ---
console.log("\n--- TEST 1: NeoPixel + I2C LCD on same ESP32 ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const esp32_1 = createEsp32Node();
const neo_1 = createNeoPixelNode();
const lcd_1 = createLcdNode();

const nodes1 = [esp32_1, neo_1, lcd_1];
const edges1: CircuitEdge[] = [
  // NeoPixel on GPIO4, 3V3, GND
  { id: "e_np_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: neo_1.id, targetHandle: "vcc1" },
  { id: "e_np_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: neo_1.id, targetHandle: "ground1" },
  { id: "e_np_din", source: esp32_1.id, sourceHandle: "gpio4", target: neo_1.id, targetHandle: "in" },

  // LCD on GPIO21 (SDA), GPIO22 (SCL), 3V3, GND
  { id: "e_lcd_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: lcd_1.id, targetHandle: "vcc" },
  { id: "e_lcd_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: lcd_1.id, targetHandle: "gnd" },
  { id: "e_lcd_sda", source: esp32_1.id, sourceHandle: "gpio21", target: lcd_1.id, targetHandle: "sda" },
  { id: "e_lcd_scl", source: esp32_1.id, sourceHandle: "gpio22", target: lcd_1.id, targetHandle: "scl" },
];

const codeLcdNeo = `
from machine import I2C, Pin
from neopixel import NeoPixel
from pico_i2c_lcd import I2cLcd

np = NeoPixel(Pin(4), 1)
np[0] = (0, 255, 128)
np.write()

i2c = I2C(0, scl=Pin(22), sda=Pin(21))
lcd = I2cLcd(i2c, 0x27, 2, 16)
lcd.putstr("NeoPixel Active")
`;

const frame1 = runIntegrationTick(codeLcdNeo, nodes1, edges1);

const neoComp1 = frame1.components[neo_1.id];
const lcdComp1 = frame1.components[lcd_1.id];

assert.strictEqual(neoComp1?.telemetry?.red, 0, "NeoPixel red should be 0");
assert.strictEqual(neoComp1?.telemetry?.green, 255, "NeoPixel green should be 255");
assert.strictEqual(neoComp1?.telemetry?.blue, 128, "NeoPixel blue should be 128");
assert.strictEqual(neoComp1?.isPowered, true, "NeoPixel should be powered");

assert.ok(String(lcdComp1?.telemetry?.line1).includes("NeoPixel Active"), "LCD should display 'NeoPixel Active'");
assert.strictEqual(lcdComp1?.isPowered, true, "LCD should be powered");

console.log("  [PASS] NeoPixel and I2C LCD co-exist seamlessly with zero pin/state collisions");

// --- TEST 2: NeoPixel + PWM Servo Motor ---
console.log("\n--- TEST 2: NeoPixel + PWM Servo Motor ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const servo_2 = createServoNode();
const nodes2 = [esp32_1, neo_1, servo_2];
const edges2: CircuitEdge[] = [
  // NeoPixel on GPIO4
  { id: "e2_np_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: neo_1.id, targetHandle: "vcc1" },
  { id: "e2_np_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: neo_1.id, targetHandle: "ground1" },
  { id: "e2_np_din", source: esp32_1.id, sourceHandle: "gpio4", target: neo_1.id, targetHandle: "in" },

  // Servo on GPIO13 (PWM)
  { id: "e2_srv_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: servo_2.id, targetHandle: "vcc" },
  { id: "e2_srv_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: servo_2.id, targetHandle: "ground" },
  { id: "e2_srv_sig", source: esp32_1.id, sourceHandle: "gpio13", target: servo_2.id, targetHandle: "signal" },
];

const codeServoNeo = `
from machine import Pin, PWM
from neopixel import NeoPixel

np = NeoPixel(Pin(4), 1)
np[0] = (255, 50, 0)
np.write()

servo = PWM(Pin(13), freq=50)
servo.duty_u16(4915) # 90 degrees
`;

const frame2 = runIntegrationTick(codeServoNeo, nodes2, edges2);

const neoComp2 = frame2.components[neo_1.id];
const srvComp2 = frame2.components[servo_2.id];

assert.strictEqual(neoComp2?.telemetry?.red, 255);
assert.strictEqual(neoComp2?.telemetry?.green, 50);
assert.strictEqual(neoComp2?.telemetry?.blue, 0);

assert.strictEqual(srvComp2?.isPowered, true, "Servo should be powered");
assert.strictEqual(srvComp2?.telemetry?.angle, 90, "Servo angle should be 90 degrees");
assert.strictEqual(srvComp2?.telemetry?.signalPin, 13, "Servo signal pin should be 13");

console.log("  [PASS] NeoPixel and PWM Servo function simultaneously without telemetry interference");

// --- TEST 3: NeoPixel + ADC Soil Moisture Sensor ---
console.log("\n--- TEST 3: NeoPixel + ADC Soil Moisture Sensor ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const soil_3 = createSoilMoistureNode("soil-3", 800); // 800 / 1023 moisture
const nodes3 = [esp32_1, neo_1, soil_3];
const edges3: CircuitEdge[] = [
  // NeoPixel on GPIO4
  { id: "e3_np_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: neo_1.id, targetHandle: "vcc1" },
  { id: "e3_np_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: neo_1.id, targetHandle: "ground1" },
  { id: "e3_np_din", source: esp32_1.id, sourceHandle: "gpio4", target: neo_1.id, targetHandle: "in" },

  // Soil Sensor on GPIO32 (ADC1)
  { id: "e3_soil_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: soil_3.id, targetHandle: "vcc1" },
  { id: "e3_soil_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: soil_3.id, targetHandle: "gnd1" },
  { id: "e3_soil_sig", source: esp32_1.id, sourceHandle: "gpio32", target: soil_3.id, targetHandle: "sig1" },
];

const codeAdcNeo = `
from machine import Pin, ADC
from neopixel import NeoPixel

adc = ADC(Pin(32))
moisture = adc.read()

np = NeoPixel(Pin(4), 1)
if moisture > 1000:
    np[0] = (0, 0, 255) # Wet -> Blue
else:
    np[0] = (255, 0, 0) # Dry -> Red
np.write()
`;

const frame3 = runIntegrationTick(codeAdcNeo, nodes3, edges3);

const neoComp3 = frame3.components[neo_1.id];
assert.strictEqual(neoComp3?.telemetry?.red, 0, "High moisture -> Red must be 0");
assert.strictEqual(neoComp3?.telemetry?.blue, 255, "High moisture -> Blue must be 255");
console.log("  [PASS] ADC live read accurately drives NeoPixel conditional color response");

// --- TEST 4: NeoPixel + 4x4 Matrix Keypad ---
console.log("\n--- TEST 4: NeoPixel + 4x4 Matrix Keypad ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const keypad_4 = createKeypadNode("keypad-4", "5");
const nodes4 = [esp32_1, neo_1, keypad_4];
const edges4: CircuitEdge[] = [
  // NeoPixel on GPIO4
  { id: "e4_np_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: neo_1.id, targetHandle: "vcc1" },
  { id: "e4_np_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: neo_1.id, targetHandle: "ground1" },
  { id: "e4_np_din", source: esp32_1.id, sourceHandle: "gpio4", target: neo_1.id, targetHandle: "in" },

  // Keypad: Row2 on GPIO14, Col2 on GPIO33
  { id: "e4_kp_r2", source: esp32_1.id, sourceHandle: "gpio14", target: keypad_4.id, targetHandle: "row2" },
  { id: "e4_kp_c2", source: esp32_1.id, sourceHandle: "gpio33", target: keypad_4.id, targetHandle: "column2" },
];

const codeKeypadNeo = `
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(Pin(4), 1)
r2 = Pin(14, Pin.OUT)
c2 = Pin(33, Pin.IN, Pin.PULL_DOWN)

r2.value(1)
if c2.value() == 1:
    np[0] = (255, 255, 0) # Key 5 detected -> Yellow
else:
    np[0] = (0, 0, 0)
np.write()
`;

const frame4 = runIntegrationTick(codeKeypadNeo, nodes4, edges4);
const neoComp4 = frame4.components[neo_1.id];

assert.strictEqual(neoComp4?.telemetry?.red, 255, "Key 5 pressed -> Red = 255");
assert.strictEqual(neoComp4?.telemetry?.green, 255, "Key 5 pressed -> Green = 255");
assert.strictEqual(neoComp4?.telemetry?.blue, 0, "Key 5 pressed -> Blue = 0");
console.log("  [PASS] Keypad matrix scan dynamically updates NeoPixel color");

// --- TEST 5: All Components Together (LCD + Servo + Soil ADC + NeoPixel) ---
console.log("\n--- TEST 5: All Components Together (LCD + Servo + Soil ADC + NeoPixel) ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const allNodes = [esp32_1, neo_1, lcd_1, servo_2, soil_3];
const allEdges: CircuitEdge[] = [
  // 1. NeoPixel on GPIO4
  { id: "ea_np_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: neo_1.id, targetHandle: "vcc1" },
  { id: "ea_np_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: neo_1.id, targetHandle: "ground1" },
  { id: "ea_np_din", source: esp32_1.id, sourceHandle: "gpio4", target: neo_1.id, targetHandle: "in" },

  // 2. LCD on GPIO21 (SDA) + GPIO22 (SCL)
  { id: "ea_lcd_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: lcd_1.id, targetHandle: "vcc" },
  { id: "ea_lcd_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: lcd_1.id, targetHandle: "gnd" },
  { id: "ea_lcd_sda", source: esp32_1.id, sourceHandle: "gpio21", target: lcd_1.id, targetHandle: "sda" },
  { id: "ea_lcd_scl", source: esp32_1.id, sourceHandle: "gpio22", target: lcd_1.id, targetHandle: "scl" },

  // 3. Servo on GPIO13 (PWM)
  { id: "ea_srv_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: servo_2.id, targetHandle: "vcc" },
  { id: "ea_srv_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: servo_2.id, targetHandle: "ground" },
  { id: "ea_srv_sig", source: esp32_1.id, sourceHandle: "gpio13", target: servo_2.id, targetHandle: "signal" },

  // 4. Soil Moisture on GPIO32 (ADC)
  { id: "ea_soil_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: soil_3.id, targetHandle: "vcc1" },
  { id: "ea_soil_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: soil_3.id, targetHandle: "gnd1" },
  { id: "ea_soil_sig", source: esp32_1.id, sourceHandle: "gpio32", target: soil_3.id, targetHandle: "sig1" },
];

const codeAll = `
from machine import I2C, Pin, PWM, ADC
from neopixel import NeoPixel
from pico_i2c_lcd import I2cLcd

# 1. LCD
i2c = I2C(0, scl=Pin(22), sda=Pin(21))
lcd = I2cLcd(i2c, 0x27, 2, 16)
lcd.putstr("All Systems GO")

# 2. Servo
servo = PWM(Pin(13), freq=50)
servo.duty_u16(8192) # 180 degrees

# 3. ADC
adc = ADC(Pin(32))
m = adc.read()

# 4. NeoPixel
np = NeoPixel(Pin(4), 1)
np[0] = (0, 255, 0) # Green
np.write()
`;

const frameAll = runIntegrationTick(codeAll, allNodes, allEdges);

const neoAll = frameAll.components[neo_1.id];
const lcdAll = frameAll.components[lcd_1.id];
const srvAll = frameAll.components[servo_2.id];

assert.strictEqual(neoAll?.telemetry?.green, 255, "NeoPixel green = 255");
assert.strictEqual(neoAll?.isPowered, true, "NeoPixel powered");

assert.ok(String(lcdAll?.telemetry?.line1).includes("All Systems GO"), "LCD line 1 shows 'All Systems GO'");
assert.strictEqual(lcdAll?.isPowered, true, "LCD powered");

assert.strictEqual(srvAll?.telemetry?.angle, 180, "Servo angle = 180");
assert.strictEqual(srvAll?.isPowered, true, "Servo powered");

console.log("  [PASS] All 4 peripheral subsystems (LCD + Servo + ADC + NeoPixel) operate simultaneously without conflict");

// --- TEST 6: 7-Segment + NeoPixel on same ESP32 ---
console.log("\n--- TEST 6: 7-Segment + NeoPixel on same ESP32 ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const disp6 = createSevenSegmentNode("disp-6", "Common Cathode");
const r6 = createResistorNode("r-6", 220);

const nodes6 = [esp32_1, neo_1, disp6, r6];
const edges6: CircuitEdge[] = [
  // NeoPixel on GPIO4
  { id: "e6_np_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: neo_1.id, targetHandle: "vcc1" },
  { id: "e6_np_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: neo_1.id, targetHandle: "ground1" },
  { id: "e6_np_din", source: esp32_1.id, sourceHandle: "gpio4", target: neo_1.id, targetHandle: "in" },

  // 7-Segment segments b (GPIO17), c (GPIO18)
  { id: "e6_b", source: esp32_1.id, sourceHandle: "gpio17", target: disp6.id, targetHandle: "b" },
  { id: "e6_c", source: esp32_1.id, sourceHandle: "gpio18", target: disp6.id, targetHandle: "c" },
  { id: "e6_com", source: disp6.id, sourceHandle: "com1", target: r6.id, targetHandle: "pin1" },
  { id: "e6_gnd", source: r6.id, sourceHandle: "pin2", target: esp32_1.id, targetHandle: "esp32_gnd1" },
];

const codeNeoSeg = `
from machine import Pin
from neopixel import NeoPixel

# NeoPixel Cyan (0, 255, 255)
np = NeoPixel(Pin(4), 1)
np[0] = (0, 255, 255)
np.write()

# 7-Segment Display '1' (b, c active)
b = Pin(17, Pin.OUT)
c = Pin(18, Pin.OUT)
b.value(1)
c.value(1)
`;

const frame6 = runIntegrationTick(codeNeoSeg, nodes6, edges6);
const neoComp6 = frame6.components[neo_1.id];
const segComp6 = frame6.components[disp6.id];
const ds6 = JSON.parse(String(segComp6?.telemetry?.digitState ?? "{}"));

assert.strictEqual(neoComp6?.telemetry?.green, 255, "NeoPixel green = 255");
assert.strictEqual(neoComp6?.telemetry?.blue, 255, "NeoPixel blue = 255");
assert.strictEqual(segComp6?.isPowered, true, "7-Segment powered");
assert.strictEqual(ds6.b, true, "7-Segment b lit");
assert.strictEqual(ds6.c, true, "7-Segment c lit");
console.log("  [PASS] 7-Segment display and NeoPixel operate concurrently without state collision");

// --- TEST 7: 7-Segment + ADC Soil Moisture Sensor ---
console.log("\n--- TEST 7: 7-Segment + ADC Soil Moisture Sensor ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const disp7 = createSevenSegmentNode("disp-7", "Common Cathode");
const r7 = createResistorNode("r-7", 220);
const soil7 = createSoilMoistureNode("soil-7", 800); // 800 / 1023 moisture -> ADC 12-bit > 1000

const nodes7 = [esp32_1, soil7, disp7, r7];
const edges7: CircuitEdge[] = [
  // Soil Moisture on GPIO32
  { id: "e7_soil_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: soil7.id, targetHandle: "vcc1" },
  { id: "e7_soil_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: soil7.id, targetHandle: "gnd1" },
  { id: "e7_soil_sig", source: esp32_1.id, sourceHandle: "gpio32", target: soil7.id, targetHandle: "sig1" },

  // 7-Segment segment a on GPIO16
  { id: "e7_a", source: esp32_1.id, sourceHandle: "gpio16", target: disp7.id, targetHandle: "a" },
  { id: "e7_com", source: disp7.id, sourceHandle: "com1", target: r7.id, targetHandle: "pin1" },
  { id: "e7_gnd", source: r7.id, sourceHandle: "pin2", target: esp32_1.id, targetHandle: "esp32_gnd1" },
];

const codeAdcSeg = `
from machine import Pin, ADC

adc = ADC(Pin(32))
m = adc.read()

a = Pin(16, Pin.OUT)
if m > 1000:
    a.value(1) # Moisture threshold met -> light segment a
else:
    a.value(0)
`;

const frame7 = runIntegrationTick(codeAdcSeg, nodes7, edges7);
const segComp7 = frame7.components[disp7.id];
const ds7 = JSON.parse(String(segComp7?.telemetry?.digitState ?? "{}"));

assert.strictEqual(segComp7?.isPowered, true, "7-Segment powered");
assert.strictEqual(ds7.a, true, "Segment a lit based on ADC read > 1000");
console.log("  [PASS] ADC live read accurately drives 7-Segment display segment");

// --- TEST 8: Full 5-Peripheral Stack (7-Seg + LCD + Servo + ADC + NeoPixel) ---
console.log("\n--- TEST 8: Full 5-Peripheral Stack (7-Seg + LCD + Servo + ADC + NeoPixel) ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const disp8 = createSevenSegmentNode("disp-8", "Common Cathode");
const r8 = createResistorNode("r-8", 220);

const allNodes5 = [esp32_1, neo_1, lcd_1, servo_2, soil_3, disp8, r8];
const allEdges5: CircuitEdge[] = [
  // 1. NeoPixel on GPIO4
  { id: "e8_np_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: neo_1.id, targetHandle: "vcc1" },
  { id: "e8_np_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: neo_1.id, targetHandle: "ground1" },
  { id: "e8_np_din", source: esp32_1.id, sourceHandle: "gpio4", target: neo_1.id, targetHandle: "in" },

  // 2. LCD on GPIO21 (SDA) + GPIO22 (SCL)
  { id: "e8_lcd_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: lcd_1.id, targetHandle: "vcc" },
  { id: "e8_lcd_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: lcd_1.id, targetHandle: "gnd" },
  { id: "e8_lcd_sda", source: esp32_1.id, sourceHandle: "gpio21", target: lcd_1.id, targetHandle: "sda" },
  { id: "e8_lcd_scl", source: esp32_1.id, sourceHandle: "gpio22", target: lcd_1.id, targetHandle: "scl" },

  // 3. Servo on GPIO13 (PWM)
  { id: "e8_srv_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: servo_2.id, targetHandle: "vcc" },
  { id: "e8_srv_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: servo_2.id, targetHandle: "ground" },
  { id: "e8_srv_sig", source: esp32_1.id, sourceHandle: "gpio13", target: servo_2.id, targetHandle: "signal" },

  // 4. Soil Moisture on GPIO32 (ADC)
  { id: "e8_soil_vcc", source: esp32_1.id, sourceHandle: "esp32_3v3", target: soil_3.id, targetHandle: "vcc1" },
  { id: "e8_soil_gnd", source: esp32_1.id, sourceHandle: "esp32_gnd1", target: soil_3.id, targetHandle: "gnd1" },
  { id: "e8_soil_sig", source: esp32_1.id, sourceHandle: "gpio32", target: soil_3.id, targetHandle: "sig1" },

  // 5. 7-Segment on GPIO16 (a), GPIO17 (b)
  { id: "e8_seg_a", source: esp32_1.id, sourceHandle: "gpio16", target: disp8.id, targetHandle: "a" },
  { id: "e8_seg_b", source: esp32_1.id, sourceHandle: "gpio17", target: disp8.id, targetHandle: "b" },
  { id: "e8_seg_com", source: disp8.id, sourceHandle: "com1", target: r8.id, targetHandle: "pin1" },
  { id: "e8_seg_gnd", source: r8.id, sourceHandle: "pin2", target: esp32_1.id, targetHandle: "esp32_gnd1" },
];

const codeAll5 = `
from machine import I2C, Pin, PWM, ADC
from neopixel import NeoPixel
from pico_i2c_lcd import I2cLcd

# 1. LCD
i2c = I2C(0, scl=Pin(22), sda=Pin(21))
lcd = I2cLcd(i2c, 0x27, 2, 16)
lcd.putstr("Full Stack ESP32")

# 2. Servo (90 deg)
servo = PWM(Pin(13), freq=50)
servo.duty_u16(4915)

# 3. ADC
adc = ADC(Pin(32))
m = adc.read()

# 4. NeoPixel (Magenta)
np = NeoPixel(Pin(4), 1)
np[0] = (255, 0, 255)
np.write()

# 5. 7-Segment (a and b active)
a = Pin(16, Pin.OUT)
b = Pin(17, Pin.OUT)
a.value(1)
b.value(1)
`;

const frameAll5 = runIntegrationTick(codeAll5, allNodes5, allEdges5);

const neoComp8 = frameAll5.components[neo_1.id];
const lcdComp8 = frameAll5.components[lcd_1.id];
const srvComp8 = frameAll5.components[servo_2.id];
const segComp8 = frameAll5.components[disp8.id];
const ds8 = JSON.parse(String(segComp8?.telemetry?.digitState ?? "{}"));

assert.strictEqual(neoComp8?.telemetry?.red, 255, "NeoPixel red = 255");
assert.strictEqual(neoComp8?.telemetry?.blue, 255, "NeoPixel blue = 255");
assert.ok(String(lcdComp8?.telemetry?.line1).includes("Full Stack ESP32"), "LCD shows 'Full Stack ESP32'");
assert.strictEqual(srvComp8?.telemetry?.angle, 90, "Servo angle = 90 deg");
assert.strictEqual(segComp8?.isPowered, true, "7-Segment powered");
assert.strictEqual(ds8.a, true, "7-Segment a lit");
assert.strictEqual(ds8.b, true, "7-Segment b lit");

console.log("  [PASS] Full 5-Peripheral Stack (7-Seg + LCD + Servo + ADC + NeoPixel) verified simultaneously without conflict");

// --- TEST 9: IR Receiver + NeoPixel (Remote button press triggers color change) ---
console.log("\n--- TEST 9: IR Receiver + NeoPixel (Button press triggers color change) ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const esp9 = createEsp32Node("esp-9");
const irr9 = createIrReceiverNode("irr-9");
const rem9 = createIrRemoteNode("rem-9", 0x0c, "1", 1001); // Button '1' (NUM_1)
const neo9 = createNeoPixelNode("neo-9");

const nodes9 = [esp9, irr9, rem9, neo9];
const edges9: CircuitEdge[] = [
  // IR Receiver: VCC -> 3V3, GND -> GND1, OUT -> GPIO15
  { id: "e9_vcc", source: esp9.id, sourceHandle: "esp32_3v3", target: irr9.id, targetHandle: "vcc" },
  { id: "e9_gnd", source: esp9.id, sourceHandle: "esp32_gnd1", target: irr9.id, targetHandle: "gnd" },
  { id: "e9_out", source: irr9.id, sourceHandle: "out", target: esp9.id, targetHandle: "gpio15" },
  // NeoPixel: VCC -> 3V3, GND -> GND2, IN -> GPIO4
  { id: "e9_nvcc", source: esp9.id, sourceHandle: "esp32_3v3", target: neo9.id, targetHandle: "vcc1" },
  { id: "e9_ngnd", source: esp9.id, sourceHandle: "esp32_gnd2", target: neo9.id, targetHandle: "ground1" },
  { id: "e9_ndin", source: esp9.id, sourceHandle: "gpio4", target: neo9.id, targetHandle: "in" },
];

const codeIrNeo = `
from machine import Pin
from ir_remote import IRReceiver, NUM_1, POWER
from neopixel import NeoPixel

np = NeoPixel(Pin(4), 1)
ir = IRReceiver(Pin(15))
cmd = ir.read()

if cmd == NUM_1:
    np[0] = (255, 0, 0) # Red on Button 1
    np.write()
    print("NeoPixel set to RED")
elif cmd == POWER:
    np[0] = (0, 0, 0)
    np.write()
`;

const frame9 = runIntegrationTick(codeIrNeo, nodes9, edges9);
const neoComp9 = frame9.components[neo9.id];
const irrComp9 = frame9.components[irr9.id];

assert.strictEqual(irrComp9?.isPowered, true, "IR Receiver must be powered");
assert.strictEqual(neoComp9?.isPowered, true, "NeoPixel must be powered");
assert.strictEqual(neoComp9?.telemetry?.red, 255, "NeoPixel red channel must be 255");
assert.strictEqual(neoComp9?.telemetry?.green, 0, "NeoPixel green channel must be 0");
assert.strictEqual(neoComp9?.telemetry?.blue, 0, "NeoPixel blue channel must be 0");

const serial9 = frame9.serialOutput || [];
assert.ok(
  serial9.some((l: string) => l.includes("NeoPixel set to RED")),
  `Expected 'NeoPixel set to RED' in serial output, got: ${JSON.stringify(serial9)}`,
);
console.log("  [PASS] IR Receiver button click dynamically updated NeoPixel color cleanly");

// --- TEST 10: IR Receiver + 7-Segment Display (Numeric buttons drive digit segments) ---
console.log("\n--- TEST 10: IR Receiver + 7-Segment Display ---");
clearSimSessions();

const esp10 = createEsp32Node("esp-10");
const irr10 = createIrReceiverNode("irr-10");
const rem10 = createIrRemoteNode("rem-10", 0x42, "7", 2002); // Button '7' (NUM_7)
const disp10 = createSevenSegmentNode("disp-10", "Common Cathode");
const res10 = createResistorNode("res-10", 220);

const nodes10 = [esp10, irr10, rem10, disp10, res10];
const edges10: CircuitEdge[] = [
  // IR Receiver: VCC -> 3V3, GND -> GND1, OUT -> GPIO15
  { id: "e10_vcc", source: esp10.id, sourceHandle: "esp32_3v3", target: irr10.id, targetHandle: "vcc" },
  { id: "e10_gnd", source: esp10.id, sourceHandle: "esp32_gnd1", target: irr10.id, targetHandle: "gnd" },
  { id: "e10_out", source: irr10.id, sourceHandle: "out", target: esp10.id, targetHandle: "gpio15" },
  // 7-Segment COM: com1 -> resistor -> esp32_gnd2
  { id: "e10_com", source: disp10.id, sourceHandle: "com1", target: res10.id, targetHandle: "pin1" },
  { id: "e10_rgnd", source: res10.id, sourceHandle: "pin2", target: esp10.id, targetHandle: "esp32_gnd2" },
  // Segments A, B, C for digit '7':
  { id: "e10_a", source: esp10.id, sourceHandle: "gpio16", target: disp10.id, targetHandle: "a" },
  { id: "e10_b", source: esp10.id, sourceHandle: "gpio17", target: disp10.id, targetHandle: "b" },
  { id: "e10_c", source: esp10.id, sourceHandle: "gpio18", target: disp10.id, targetHandle: "c" },
];

const codeIr7Seg = `
from machine import Pin
from ir_remote import IRReceiver, NUM_7

ir = IRReceiver(Pin(15))
cmd = ir.read()

seg_a = Pin(16, Pin.OUT)
seg_b = Pin(17, Pin.OUT)
seg_c = Pin(18, Pin.OUT)

if cmd == NUM_7:
    seg_a.value(1)
    seg_b.value(1)
    seg_c.value(1)
    print("Digit 7 illuminated")
`;

const frame10 = runIntegrationTick(codeIr7Seg, nodes10, edges10);
const segComp10 = frame10.components[disp10.id];
const ds10 = JSON.parse(String(segComp10?.telemetry?.digitState ?? "{}"));

assert.strictEqual(segComp10?.isPowered, true, "7-Segment must be powered");
assert.strictEqual(ds10.a, true, "Segment A must be illuminated");
assert.strictEqual(ds10.b, true, "Segment B must be illuminated");
assert.strictEqual(ds10.c, true, "Segment C must be illuminated");

const serial10 = frame10.serialOutput || [];
assert.ok(
  serial10.some((l: string) => l.includes("Digit 7 illuminated")),
  `Expected 'Digit 7 illuminated', got: ${JSON.stringify(serial10)}`,
);
console.log("  [PASS] IR Receiver numeric command accurately rendered digit '7' on 7-segment display");

// --- TEST 11: Complete 6-Peripheral Heterogeneous Stack ---
console.log("\n--- TEST 11: Complete 6-Peripheral Stack (IR + 7-Seg + LCD + Servo + ADC + NeoPixel) ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const esp11 = createEsp32Node("esp-11");
const irr11 = createIrReceiverNode("irr-11");
const rem11 = createIrRemoteNode("rem-11", 0x45, "POWER", 3003);
const disp11 = createSevenSegmentNode("disp-11", "Common Cathode");
const res11 = createResistorNode("res-11", 220);
const lcd11 = createLcdNode("lcd-11");
const servo11 = createServoNode("servo-11");
const soil11 = createSoilMoistureNode("soil-11", 300);
const neo11 = createNeoPixelNode("neo-11");

const allNodes11 = [esp11, irr11, rem11, disp11, res11, lcd11, servo11, soil11, neo11];
const allEdges11: CircuitEdge[] = [
  // 1. IR: GPIO15, 3V3, GND1
  { id: "e11_irvcc", source: esp11.id, sourceHandle: "esp32_3v3", target: irr11.id, targetHandle: "vcc" },
  { id: "e11_irgnd", source: esp11.id, sourceHandle: "esp32_gnd1", target: irr11.id, targetHandle: "gnd" },
  { id: "e11_irout", source: irr11.id, sourceHandle: "out", target: esp11.id, targetHandle: "gpio15" },
  // 2. 7-Seg: GPIO16, GPIO17, GND2 through resistor
  { id: "e11_com", source: disp11.id, sourceHandle: "com1", target: res11.id, targetHandle: "pin1" },
  { id: "e11_rgnd", source: res11.id, sourceHandle: "pin2", target: esp11.id, targetHandle: "esp32_gnd2" },
  { id: "e11_sega", source: esp11.id, sourceHandle: "gpio16", target: disp11.id, targetHandle: "a" },
  { id: "e11_segb", source: esp11.id, sourceHandle: "gpio17", target: disp11.id, targetHandle: "b" },
  // 3. LCD: SDA -> GPIO21, SCL -> GPIO22, VCC -> 3V3, GND -> GND3
  { id: "e11_lsda", source: esp11.id, sourceHandle: "gpio21", target: lcd11.id, targetHandle: "sda" },
  { id: "e11_lscl", source: esp11.id, sourceHandle: "gpio22", target: lcd11.id, targetHandle: "scl" },
  { id: "e11_lvcc", source: esp11.id, sourceHandle: "esp32_3v3", target: lcd11.id, targetHandle: "vcc" },
  { id: "e11_lgnd", source: esp11.id, sourceHandle: "esp32_gnd3", target: lcd11.id, targetHandle: "gnd" },
  // 4. Servo: PWM -> GPIO13, VCC -> 3V3, GND -> GND3
  { id: "e11_spwm", source: esp11.id, sourceHandle: "gpio13", target: servo11.id, targetHandle: "signal" },
  { id: "e11_svcc", source: esp11.id, sourceHandle: "esp32_3v3", target: servo11.id, targetHandle: "vcc" },
  { id: "e11_sgnd", source: esp11.id, sourceHandle: "esp32_gnd3", target: servo11.id, targetHandle: "ground" },
  // 5. ADC Soil: AOUT -> GPIO32, VCC -> 3V3, GND -> GND1
  { id: "e11_aout", source: soil11.id, sourceHandle: "sig1", target: esp11.id, targetHandle: "gpio32" },
  { id: "e11_avcc", source: esp11.id, sourceHandle: "esp32_3v3", target: soil11.id, targetHandle: "vcc1" },
  { id: "e11_agnd", source: esp11.id, sourceHandle: "esp32_gnd1", target: soil11.id, targetHandle: "gnd1" },
  // 6. NeoPixel: DIN -> GPIO4, VDD -> 3V3, GND -> GND2
  { id: "e11_ndin", source: esp11.id, sourceHandle: "gpio4", target: neo11.id, targetHandle: "in" },
  { id: "e11_nvcc", source: esp11.id, sourceHandle: "esp32_3v3", target: neo11.id, targetHandle: "vcc1" },
  { id: "e11_ngnd", source: esp11.id, sourceHandle: "esp32_gnd2", target: neo11.id, targetHandle: "ground1" },
];

const codeStack11 = `
from machine import Pin, PWM, ADC, I2C
from ir_remote import IRReceiver, POWER
from neopixel import NeoPixel
from pico_i2c_lcd import I2cLcd

# 1. IR
ir = IRReceiver(Pin(15))
cmd = ir.read()

# 2. LCD
i2c = I2C(0, scl=Pin(22), sda=Pin(21))
lcd = I2cLcd(i2c, 0x27, 2, 16)
lcd.putstr("IR Active")

# 3. Servo
servo = PWM(Pin(13), freq=50)
servo.duty(77)

# 4. ADC
adc = ADC(Pin(32))
m = adc.read()

# 5. NeoPixel
np = NeoPixel(Pin(4), 1)
if cmd == POWER:
    np[0] = (0, 255, 0) # Green
    np.write()

# 6. 7-Segment
a = Pin(16, Pin.OUT)
b = Pin(17, Pin.OUT)
a.value(1)
b.value(1)
`;

const frame11 = runIntegrationTick(codeStack11, allNodes11, allEdges11);

const neo11Comp = frame11.components[neo11.id];
const irr11Comp = frame11.components[irr11.id];
const lcd11Comp = frame11.components[lcd11.id];
const srv11Comp = frame11.components[servo11.id];
const seg11Comp = frame11.components[disp11.id];
const ds11 = JSON.parse(String(seg11Comp?.telemetry?.digitState ?? "{}"));

assert.strictEqual(irr11Comp?.isPowered, true, "IR must be powered");
assert.strictEqual(neo11Comp?.telemetry?.green, 255, "NeoPixel green = 255");
assert.ok(String(lcd11Comp?.telemetry?.line1).includes("IR Active"), "LCD displays 'IR Active'");
assert.strictEqual(srv11Comp?.telemetry?.angle, 90, "Servo angle = 90 deg");
assert.strictEqual(seg11Comp?.isPowered, true, "7-Segment is powered");
assert.strictEqual(ds11.a, true, "7-Segment A lit");
assert.strictEqual(ds11.b, true, "7-Segment B lit");

console.log("  [PASS] Full 6-Peripheral Stack (IR + 7-Seg + LCD + Servo + ADC + NeoPixel) verified simultaneously without conflict");

console.log("\n=================== ALL MULTI-COMPONENT INTEGRATION TESTS PASSED ===================");
