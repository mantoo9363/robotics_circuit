import { parseEsp32PythonGpioActions } from "../lib/esp32/parser/pythonPatterns";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import type { SimulationFrame } from "../lib/simulation-state";
import { getOrCreateSession } from "../lib/codeParsing/picoParser";

console.log("=================== INVESTIGATING BLINK WITH PLACEHOLDER CODE ===================");

const placeholderCode = "# Write your MicroPython code here";

// 1. Test Python Parser on placeholder
const actions = parseEsp32PythonGpioActions(placeholderCode);
console.log("1. parseEsp32PythonGpioActions(placeholder) actions count:", actions.length);

// 2. Test getOrCreateSession on placeholder across multiple ticks
console.log("\n2. Testing getOrCreateSession across ticks:");
for (let tick = 0; tick <= 5; tick++) {
  const timestamp = tick * 500; // 500ms intervals
  const session = getOrCreateSession(placeholderCode, timestamp);
  const pin2State = session.pins.get(2);
  console.log(`  Tick ${tick} (t=${timestamp}ms): pin 2 state =`, pin2State);
}

// 3. Test applyEsp32SimulationToFrame across ticks
const baseNodes = [
  {
    id: "esp32-1",
    type: "esp32",
    position: { x: 0, y: 0 },
    data: { label: "ESP32 DevKit V1", componentType: "esp32" },
  },
  {
    id: "led-1",
    type: "led",
    position: { x: 100, y: 0 },
    data: { label: "Red LED", componentType: "led", properties: { color: "red" } },
  },
  {
    id: "resistor-1",
    type: "resistor",
    position: { x: 50, y: 0 },
    data: { label: "Resistor", componentType: "resistor", properties: { resistance: 220 } },
  },
];

const baseEdges = [
  { id: "e1", source: "esp32-1", sourceHandle: "gpio2", target: "resistor-1", targetHandle: "pin1" },
  { id: "e2", source: "resistor-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" },
  { id: "e3", source: "led-1", sourceHandle: "cathode", target: "esp32-1", targetHandle: "esp32_gnd1" },
];

console.log("\n3. Testing applyEsp32SimulationToFrame across ticks (tick 0 to 10):");
for (let tick = 0; tick <= 10; tick++) {
  const frame: SimulationFrame = {
    tick,
    timestamp: tick * 500, // 500ms intervals (0s, 0.5s, 1s, 1.5s, 2s...)
    running: true,
    boardType: "esp32",
    components: {},
    boardPins: [],
    serialOutput: [],
    error: null,
  };

  const outputFrame = applyEsp32SimulationToFrame(frame, {
    nodes: baseNodes as any,
    edges: baseEdges as any,
    arduinoCode: placeholderCode,
    picoCode: placeholderCode,
    selectedLanguage: "auto",
    dynamicComponents: [],
    boardType: "esp32",
    ne555State: null as any,
    capacitorState: null as any,
    keypad4x4State: null as any,
    keypad4x3State: null as any,
  });

  const ledComp = outputFrame.components["led-1"];
  console.log(`  Tick ${tick} (t=${tick * 500}ms): LED isPowered=${ledComp?.isPowered}, brightness=${ledComp?.brightness}, voltage=${ledComp?.voltage}`);
}
