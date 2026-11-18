import assert from "assert";
import { parseEsp32SessionActions } from "../lib/esp32/parser/sessionParser";
import { parseEsp32CppGpioActions } from "../lib/esp32/parser/cppPatterns";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { buildSimulationFrame } from "../lib/simulation-state";
import type { CircuitNode, CircuitEdge } from "../lib/types";

console.log("=================== INVESTIGATING ESP32 C++ EXECUTION & STALE STATE ===================");

// 1. Check what parseEsp32SessionActions returns for C++ code with const int LED = 2;
const cppCodeVariable = `
const int LED = 2;
void setup() { pinMode(LED, OUTPUT); }
void loop() { digitalWrite(LED, LOW); delay(1000); }
`.trim();

const cppCodeLiteralHigh = `
void setup() { pinMode(2, OUTPUT); }
void loop() { digitalWrite(2, HIGH); delay(1000); }
`.trim();

const cppCodeLiteralLow = `
void setup() { pinMode(2, OUTPUT); }
void loop() { digitalWrite(2, LOW); delay(1000); }
`.trim();

console.log("\n--- TEST A: Parser Output for Variable Syntax (const int LED = 2; digitalWrite(LED, LOW)) ---");
const actionsVar = parseEsp32SessionActions(cppCodeVariable, false);
console.log("Actions returned for variable syntax:", actionsVar);
assert.strictEqual(actionsVar.length, 1, "Variable syntax must now parse exactly 1 action");
assert.strictEqual(actionsVar[0].type, "gpio_write");
assert.strictEqual(actionsVar[0].pin, 2);
assert.strictEqual(actionsVar[0].value, 0);
console.log("  [PASS] Variable syntax const int LED = 2 parsed cleanly to GPIO2 LOW");


console.log("\n--- TEST B: Parser Output for Literal Syntax (digitalWrite(2, HIGH)) ---");
const actionsLiteralHigh = parseEsp32SessionActions(cppCodeLiteralHigh, false);
console.log("Actions returned for literal HIGH:", actionsLiteralHigh);

console.log("\n--- TEST C: Parser Output for Literal Syntax (digitalWrite(2, LOW)) ---");
const actionsLiteralLow = parseEsp32SessionActions(cppCodeLiteralLow, false);
console.log("Actions returned for literal LOW:", actionsLiteralLow);

// 2. Test Frame Transformer behavior when switching from Python (HIGH) to C++ (Variable / Unparsed)
const esp32Node: CircuitNode = {
  id: "esp32-1",
  type: "circuitComponent",
  position: { x: 0, y: 0 },
  data: { componentType: "esp32", simulationModel: "esp32", label: "ESP32", rotation: 0, properties: {} as any },
};

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

const edge1: CircuitEdge = { id: "e1", source: "esp32-1", sourceHandle: "gpio2", target: "resistor-1", targetHandle: "pin1" };
const edge2: CircuitEdge = { id: "e2", source: "resistor-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" };
const edge3: CircuitEdge = { id: "e3", source: "led-1", sourceHandle: "cathode", target: "esp32-1", targetHandle: "esp32_gnd1" };

const nodes = [esp32Node, resistorNode, ledNode];
const edges = [edge1, edge2, edge3];

// Step 1: Start Python simulation (sets GPIO2 HIGH)
const initialFramePython = buildSimulationFrame({
  tick: 0,
  nodes,
  edges,
  boardType: "esp32",
  running: true,
});

const framePython = applyEsp32SimulationToFrame(initialFramePython, {
  nodes,
  edges,
  picoCode: `from machine import Pin\nled = Pin(2, Pin.OUT)\nled.value(1)`,
  arduinoCode: "",
  dynamicComponents: [],
  selectedLanguage: "python",
} as any);

console.log("\n--- TEST D: Python Simulation LED State ---");
console.log("Python LED isPowered:", framePython.components["led-1"]?.isPowered);
console.log("Python GPIO2 pin in frame.boardPins:", framePython.boardPins?.find((p: any) => p.handleId === "gpio2"));

// Step 2: Now pass framePython (which contains GPIO2 HIGH in frame.boardPins) into C++ simulation with LOW code
const frameCppWithStaleState = applyEsp32SimulationToFrame(framePython, {
  nodes,
  edges,
  picoCode: "",
  arduinoCode: cppCodeVariable, // Unparsed C++ code (variable syntax)
  dynamicComponents: [],
  selectedLanguage: "cpp",
} as any);

console.log("\n--- TEST E: Switching to C++ (with stale frame.boardPins from Python) ---");
console.log("C++ LED isPowered (Stale State!):", frameCppWithStaleState.components["led-1"]?.isPowered);
console.log("C++ GPIO2 pin in frame.boardPins:", frameCppWithStaleState.boardPins?.find((p: any) => p.handleId === "gpio2"));

// Step 3: Fresh C++ simulation (no stale frame.boardPins)
const initialFrameFresh = buildSimulationFrame({
  tick: 0,
  nodes,
  edges,
  boardType: "esp32",
  running: true,
});

const frameCppFreshLiteralLow = applyEsp32SimulationToFrame(initialFrameFresh, {
  nodes,
  edges,
  picoCode: "",
  arduinoCode: cppCodeLiteralLow, // Explicit digitalWrite(2, LOW)
  dynamicComponents: [],
  selectedLanguage: "cpp",
} as any);

console.log("\n--- TEST F: Fresh C++ Simulation with Explicit digitalWrite(2, LOW) ---");
console.log("Fresh C++ LOW LED isPowered:", frameCppFreshLiteralLow.components["led-1"]?.isPowered);
console.log("Fresh C++ LOW GPIO2 pin in frame.boardPins:", frameCppFreshLiteralLow.boardPins?.find((p: any) => p.handleId === "gpio2"));
