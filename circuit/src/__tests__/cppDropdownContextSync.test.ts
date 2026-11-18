import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import type { SimulationFrame } from "../lib/simulation-state";
import { isEffectivePython } from "../lib/circuit/languageUtils";

console.log("=================== RUNNING CPP DROPDOWN & SIMCONTEXT SYNC REGRESSION TEST ===================");

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`✕ FAIL: ${message}`);
    testsFailed++;
  }
}

const esp32Node = {
  id: "esp32-1",
  type: "esp32",
  position: { x: 0, y: 0 },
  data: { label: "ESP32 DevKit V1", componentType: "esp32" },
};

const ledNode = {
  id: "led-1",
  type: "led",
  position: { x: 100, y: 0 },
  data: { label: "Red LED", componentType: "led", properties: { color: "red" } },
};

const resistorNode = {
  id: "resistor-1",
  type: "resistor",
  position: { x: 50, y: 0 },
  data: { label: "Resistor", componentType: "resistor", properties: { resistance: 220 } },
};

const nodes = [esp32Node, ledNode, resistorNode];

const edges = [
  { id: "e1", source: "esp32-1", sourceHandle: "gpio2", target: "resistor-1", targetHandle: "pin1" },
  { id: "e2", source: "resistor-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" },
  { id: "e3", source: "led-1", sourceHandle: "cathode", target: "esp32-1", targetHandle: "esp32_gnd1" },
];

const initialFrame: SimulationFrame = {
  tick: 0,
  timestamp: 1000,
  running: true,
  boardType: "esp32",
  components: {},
  boardPins: [],
  serialOutput: [],
  error: null,
};

// 1. Verify languageUtils.isEffectivePython
assert(
  isEffectivePython("auto", nodes as any) === true,
  "isEffectivePython('auto', ESP32 nodes) returns true (MicroPython default)"
);

assert(
  isEffectivePython("cpp", nodes as any) === false,
  "isEffectivePython('cpp', ESP32 nodes) returns false (explicit C++ mode)"
);

assert(
  isEffectivePython("python", nodes as any) === true,
  "isEffectivePython('python', ESP32 nodes) returns true (explicit Python mode)"
);

// 2. Verify frame transformer behavior when selectedLanguage is "cpp" in SimContext
const cppFrame = applyEsp32SimulationToFrame(initialFrame, {
  nodes: nodes as any,
  edges: edges as any,
  arduinoCode: "void setup() { pinMode(2, OUTPUT); digitalWrite(2, HIGH); }",
  picoCode: "from machine import Pin\nled = Pin(2, Pin.OUT)\nled.off()",
  selectedLanguage: "cpp",
  dynamicComponents: [],
  boardType: "esp32",
  ne555State: null as any,
  capacitorState: null as any,
  keypad4x4State: null as any,
  keypad4x3State: null as any,
});

assert(
  cppFrame.components["led-1"]?.isPowered === true,
  "Explicit selectedLanguage='cpp' executes arduinoCode (digitalWrite HIGH -> LED lit)"
);

// 3. Verify frame transformer behavior when selectedLanguage is "python" in SimContext
const pythonFrame = applyEsp32SimulationToFrame(initialFrame, {
  nodes: nodes as any,
  edges: edges as any,
  arduinoCode: "void setup() { pinMode(2, OUTPUT); digitalWrite(2, HIGH); }",
  picoCode: "from machine import Pin\nled = Pin(2, Pin.OUT)\nled.off()",
  selectedLanguage: "python",
  dynamicComponents: [],
  boardType: "esp32",
  ne555State: null as any,
  capacitorState: null as any,
  keypad4x4State: null as any,
  keypad4x3State: null as any,
});

assert(
  pythonFrame.components["led-1"]?.isPowered === false,
  "Explicit selectedLanguage='python' executes picoCode (led.off() -> LED off)"
);

console.log(`\nResults: ${testsPassed} Passed, ${testsFailed} Failed`);
if (testsFailed > 0) {
  process.exit(1);
}
