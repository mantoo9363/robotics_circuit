import { buildSimulationFrame } from "../lib/simulation-state";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { applyPicoSimulationToFrame } from "../lib/simulation/frameTransformers/pico";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import type { SimulatorState } from "../lib/arduino-simulator";

console.log("=================== PLATFORM-WIDE STALE STATE CHECK (ARDUINO, PICO, ESP32) ===================");

let allPassed = true;

// Shared circuit topology: MCU -> Resistor -> LED -> GND
const ledNode: CircuitNode = {
  id: "led-1",
  type: "circuitComponent",
  position: { x: 100, y: 0 },
  data: { componentType: "led", simulationModel: "led", label: "LED", rotation: 0, properties: { color: { value: "red" } } as any },
};

const resistorNode: CircuitNode = {
  id: "resistor-1",
  type: "circuitComponent",
  position: { x: 50, y: 0 },
  data: { componentType: "resistor", simulationModel: "resistor", label: "220Ω Resistor", rotation: 0, properties: { resistance: { value: 220 } } as any },
};

// ── TEST 1: ARDUINO BOARD (AVR Wasm SimulatorState) ──
console.log("\n--- TEST 1: ARDUINO (AVR Wasm SimulatorState) ---");
const arduinoNode: CircuitNode = {
  id: "uno-1",
  type: "circuitComponent",
  position: { x: 0, y: 0 },
  data: { componentType: "arduino", simulationModel: "arduino", label: "Arduino Uno", rotation: 0, properties: {} as any },
};

const unoEdge1: CircuitEdge = { id: "e1", source: "uno-1", sourceHandle: "d13", target: "resistor-1", targetHandle: "pin1" };
const unoEdge2: CircuitEdge = { id: "e2", source: "resistor-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" };
const unoEdge3: CircuitEdge = { id: "e3", source: "led-1", sourceHandle: "cathode", target: "uno-1", targetHandle: "gnd1" };

// 1A. Arduino Run 1 (Pin 13 HIGH)
const pinsHigh = new Map<number, any>([
  [13, { pin: 13, mode: "OUTPUT", value: 255 }],
]);
const arduinoStateHigh: SimulatorState = { pins: pinsHigh, serialOutput: [], running: true, error: null };

const frameArduinoHigh = buildSimulationFrame({
  tick: 1,
  nodes: [arduinoNode, resistorNode, ledNode],
  edges: [unoEdge1, unoEdge2, unoEdge3],
  boardType: "arduino",
  arduinoState: arduinoStateHigh,
  running: true,
});
console.log("Arduino Run 1 (Pin 13 HIGH) LED isPowered:", frameArduinoHigh.components["led-1"]?.isPowered);

// 1B. Arduino Run 2: Stop simulation & start fresh with Pin 13 LOW
const pinsLow = new Map<number, any>([
  [13, { pin: 13, mode: "OUTPUT", value: 0 }],
]);
const arduinoStateLow: SimulatorState = { pins: pinsLow, serialOutput: [], running: true, error: null };

const frameArduinoLow = buildSimulationFrame({
  tick: 1,
  nodes: [arduinoNode, resistorNode, ledNode],
  edges: [unoEdge1, unoEdge2, unoEdge3],
  boardType: "arduino",
  arduinoState: arduinoStateLow,
  running: true,
});
console.log("Arduino Run 2 (Pin 13 LOW) LED isPowered:", frameArduinoLow.components["led-1"]?.isPowered);

if (frameArduinoLow.components["led-1"]?.isPowered === false) {
  console.log("  [PASS] Arduino correctly turns LED OFF when pin is LOW (no stale state persistence in Wasm state)");
} else {
  console.error("❌ Arduino FAILED: Stale state persisted!");
  allPassed = false;
}


// ── TEST 2: RASPBERRY PI PICO (MicroPython Frame Transformer) ──
console.log("\n--- TEST 2: RASPBERRY PI PICO (MicroPython Frame Transformer) ---");
const picoNode: CircuitNode = {
  id: "pico-1",
  type: "circuitComponent",
  position: { x: 0, y: 0 },
  data: { componentType: "raspberrypipico", simulationModel: "raspberrypipico", label: "Pico", rotation: 0, properties: {} as any },
};

const picoEdge1: CircuitEdge = { id: "pe1", source: "pico-1", sourceHandle: "gp25", target: "resistor-1", targetHandle: "pin1" };
const picoEdge2: CircuitEdge = { id: "pe2", source: "resistor-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" };
const picoEdge3: CircuitEdge = { id: "pe3", source: "led-1", sourceHandle: "cathode", target: "pico-1", targetHandle: "pico_gnd1" };

// 2A. Pico Run 1 (gp25 HIGH)
const initialPicoFrame = buildSimulationFrame({
  tick: 0,
  nodes: [picoNode, resistorNode, ledNode],
  edges: [picoEdge1, picoEdge2, picoEdge3],
  boardType: "pico",
  running: true,
});

const framePicoHigh = applyPicoSimulationToFrame(initialPicoFrame, {
  nodes: [picoNode, resistorNode, ledNode],
  edges: [picoEdge1, picoEdge2, picoEdge3],
  picoCode: `from machine import Pin\nled = Pin(25, Pin.OUT)\nled.value(1)`,
  arduinoCode: "",
  dynamicComponents: [],
  selectedLanguage: "python",
} as any);
console.log("Pico Run 1 (gp25 HIGH) LED isPowered:", framePicoHigh.components["led-1"]?.isPowered);

// 2B. Pico Run 2 (gp25 LOW) - passing framePicoHigh as previous frame
const framePicoLow = applyPicoSimulationToFrame(framePicoHigh, {
  nodes: [picoNode, resistorNode, ledNode],
  edges: [picoEdge1, picoEdge2, picoEdge3],
  picoCode: `from machine import Pin\nled = Pin(25, Pin.OUT)\nled.value(0)`,
  arduinoCode: "",
  dynamicComponents: [],
  selectedLanguage: "python",
} as any);
console.log("Pico Run 2 (gp25 LOW) LED isPowered:", framePicoLow.components["led-1"]?.isPowered);

if (framePicoLow.components["led-1"]?.isPowered === false) {
  console.log("  [PASS] Pico correctly turns LED OFF when code changes to led.value(0)");
} else {
  console.error("❌ Pico FAILED: Stale state persisted!");
  allPassed = false;
}


// ── TEST 3: ESP32 (MicroPython & C++ Frame Transformer) ──
console.log("\n--- TEST 3: ESP32 FRAME TRANSFORMER ---");
const esp32Node: CircuitNode = {
  id: "esp32-1",
  type: "circuitComponent",
  position: { x: 0, y: 0 },
  data: { componentType: "esp32", simulationModel: "esp32", label: "ESP32", rotation: 0, properties: {} as any },
};

const esp32Edge1: CircuitEdge = { id: "ee1", source: "esp32-1", sourceHandle: "gpio2", target: "resistor-1", targetHandle: "pin1" };
const esp32Edge2: CircuitEdge = { id: "ee2", source: "resistor-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" };
const esp32Edge3: CircuitEdge = { id: "ee3", source: "led-1", sourceHandle: "cathode", target: "esp32-1", targetHandle: "esp32_gnd1" };

const esp32Nodes = [esp32Node, resistorNode, ledNode];
const esp32Edges = [esp32Edge1, esp32Edge2, esp32Edge3];

// 3A. ESP32 Run 1 (Python GPIO2 HIGH)
const initialEsp32Frame = buildSimulationFrame({
  tick: 0,
  nodes: esp32Nodes,
  edges: esp32Edges,
  boardType: "esp32",
  running: true,
});

const frameEsp32PythonHigh = applyEsp32SimulationToFrame(initialEsp32Frame, {
  nodes: esp32Nodes,
  edges: esp32Edges,
  picoCode: `from machine import Pin\nled = Pin(2, Pin.OUT)\nled.value(1)`,
  arduinoCode: "",
  dynamicComponents: [],
  selectedLanguage: "python",
} as any);

console.log("ESP32 Run 1 (Python GPIO2 HIGH) LED isPowered:", frameEsp32PythonHigh.components["led-1"]?.isPowered);

// 3B. ESP32 Run 2: Simulation restart (tick = 0) with C++ unparsed variable code
const restartEsp32Frame = buildSimulationFrame({
  tick: 0,
  nodes: esp32Nodes,
  edges: esp32Edges,
  boardType: "esp32",
  running: true,
});

const frameEsp32CppUnparsed = applyEsp32SimulationToFrame(restartEsp32Frame, {
  nodes: esp32Nodes,
  edges: esp32Edges,
  picoCode: "",
  arduinoCode: `const int LED = 2;\nvoid setup() { pinMode(LED, OUTPUT); }\nvoid loop() { digitalWrite(LED, LOW); }`,
  dynamicComponents: [],
  selectedLanguage: "cpp",
} as any);

console.log("ESP32 Run 2 (Restart simulation with C++ unparsed code) LED isPowered:", frameEsp32CppUnparsed.components["led-1"]?.isPowered);

if (frameEsp32CppUnparsed.components["led-1"]?.isPowered === false) {
  console.log("  [PASS] ESP32 correctly resets pin state on tick 0, LED is dark for unparsed C++ code");
} else {
  console.error("❌ ESP32 FAILED: Stale pin state persisted on simulation restart!");
  allPassed = false;
}

console.log("\n=================== SUMMARY ===================");
if (allPassed) {
  console.log("✅ Platform check complete. All stale state reset tests PASSED.");
} else {
  console.error("❌ Platform stale state tests FAILED.");
  process.exit(1);
}
