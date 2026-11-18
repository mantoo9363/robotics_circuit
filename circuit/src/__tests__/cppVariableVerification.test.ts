import { parseEsp32SessionActions } from "../lib/esp32/parser/sessionParser";
import { buildSimulationFrame } from "../lib/simulation-state";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import type { CircuitNode, CircuitEdge } from "../lib/types";

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

const nodes = [esp32Node, resistorNode, ledNode];
const edges = [
  { id: "e1", source: "esp32-1", sourceHandle: "gpio2", target: "resistor-1", targetHandle: "pin1" },
  { id: "e2", source: "resistor-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" },
  { id: "e3", source: "led-1", sourceHandle: "cathode", target: "esp32-1", targetHandle: "esp32_gnd1" },
];

const codeWithVariables = `
const int LED = 2;
void setup() { pinMode(LED, OUTPUT); }
void loop() { digitalWrite(LED, HIGH); }
`.trim();

console.log("=================== VERIFYING C++ CODE PARSING ACTIONS ===================");

const actionsVar = parseEsp32SessionActions(codeWithVariables, false);
console.log("Raw actions for code WITH VARIABLES (const int LED = 2; digitalWrite(LED, HIGH)):");
console.log(JSON.stringify(actionsVar, null, 2));

console.log("\n--- TEST SCENARIO A: Explicit C++ Language Selection (selectedLanguage = 'cpp') ---");
const frameCpp = applyEsp32SimulationToFrame(
  buildSimulationFrame({ tick: 0, nodes, edges, boardType: "esp32", running: true }),
  {
    nodes,
    edges,
    picoCode: `from machine import Pin\nled = Pin(2, Pin.OUT)\nled.value(1)`,
    arduinoCode: codeWithVariables,
    dynamicComponents: [],
    selectedLanguage: "cpp",
  } as any
);

console.log("\n--- TEST SCENARIO C: C++ Code Text Passed to Python Parser (isPython = true) ---");
const actionsPythonOnCppCode = parseEsp32SessionActions(codeWithVariables, true);
console.log("Python parser actions on C++ code text:");
console.log(JSON.stringify(actionsPythonOnCppCode, null, 2));

console.log("\n--- TEST SCENARIO B: Auto Language Selection (selectedLanguage = 'auto') with background picoCode ---");
const frameAuto = applyEsp32SimulationToFrame(
  buildSimulationFrame({ tick: 0, nodes, edges, boardType: "esp32", running: true }),
  {
    nodes,
    edges,
    picoCode: `from machine import Pin\nled = Pin(2, Pin.OUT)\nled.value(1)`,
    arduinoCode: codeWithVariables,
    dynamicComponents: [],
    selectedLanguage: "auto",
  } as any
);

console.log("Auto mode with Python in background -> LED isPowered:", frameAuto.components["led-1"]?.isPowered);

