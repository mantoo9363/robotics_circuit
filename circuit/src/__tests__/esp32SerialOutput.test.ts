import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { buildSimulationFrame } from "../lib/simulation-state";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode } from "../lib/types";

console.log("=================== RUNNING MULTI-TICK ESP32 SERIAL OUTPUT REGRESSION TEST ===================");

const esp32Node: CircuitNode = {
  id: "esp32-1",
  type: "esp32",
  position: { x: 0, y: 0 },
  data: {
    componentType: "esp32",
    simulationModel: "esp32",
    label: "ESP32 DevKit V1",
    properties: {},
    rotation: 0,
  },
};

const code = `
import time
while True:
    print("Distance: 220 cm")
    time.sleep_ms(500)
`;

useCircuitStore.setState({
  nodes: [esp32Node],
  edges: [],
  picoCode: code,
  arduinoCode: "",
  selectedLanguage: "python",
  simulationStatus: "running",
} as any);

const ctx = {
  nodes: [esp32Node],
  edges: [],
  arduinoCode: "",
  picoCode: code,
  dynamicComponents: [],
  boardType: "esp32",
  ne555State: null,
  capacitorState: null,
  keypad4x4State: null,
  keypad4x3State: null,
  selectedLanguage: "python",
} as any;

let frame = buildSimulationFrame({
  tick: 1,
  nodes: [esp32Node],
  edges: [],
  dynamicComponents: [],
  boardType: "esp32",
  running: true,
  timestamp: 100,
});

// Run 20 sequential simulation ticks (~1000ms delta) to step across multiple sleep_ms(500) boundaries
for (let tick = 1; tick <= 20; tick++) {
  frame = {
    ...frame,
    tick,
    timestamp: 100 + tick * 50, // 50ms per tick -> 20 ticks = 1000ms
  };
  frame = applyEsp32SimulationToFrame(frame, ctx) as any;
}

console.log(`[Multi-Tick Test] Final serialOutput array length =`, frame.serialOutput?.length);
console.log(`[Multi-Tick Test] Final serialOutput content =`, JSON.stringify(frame.serialOutput));

if (!Array.isArray(frame.serialOutput) || frame.serialOutput.length < 2 || !frame.serialOutput.includes("Distance: 220 cm")) {
  console.error("❌ Multi-Tick ESP32 Serial Output Test FAILED: serialOutput did not accumulate across sleep_ms boundaries!");
  process.exit(1);
} else {
  console.log("=> Multi-Tick ESP32 Serial Output Test PASSED (Serial lines accumulated cleanly across sleep_ms boundaries!)");
}

// TEST 2: Stopped Simulation returns frame unchanged without executing phantom 1-line session
console.log("\n--- TEST 2: Stopped Simulation (running = false) does not spawn 1-line phantom session ---");
const stoppedBaseFrame = buildSimulationFrame({
  tick: 0,
  nodes: [esp32Node],
  edges: [],
  dynamicComponents: [],
  boardType: "esp32",
  running: false,
  timestamp: 0,
});
const stoppedResultFrame = applyEsp32SimulationToFrame(stoppedBaseFrame, ctx);
console.log("[Stopped Test] stoppedResultFrame serialOutput =", JSON.stringify(stoppedResultFrame.serialOutput));

if (stoppedResultFrame.serialOutput && stoppedResultFrame.serialOutput.length > 0) {
  console.error("❌ Stopped Simulation Test FAILED: serialOutput spawned phantom lines on running = false!");
  process.exit(1);
} else {
  console.log("=> Stopped Simulation Test PASSED (Clean 0 lines on running = false, no phantom artifacts!)");
}

// TEST 3: print() with sep and end keyword arguments
console.log("\n--- TEST 3: print() with sep='-' and end='\\n' ---");
const kwCode = `
print("A", "B", "C", sep="-")
print("x:", 42, sep=" ")
`;
const kwCtx = { ...ctx, picoCode: kwCode };
let kwFrame = buildSimulationFrame({
  tick: 1,
  nodes: [esp32Node],
  edges: [],
  dynamicComponents: [],
  boardType: "esp32",
  running: true,
  timestamp: 100,
});
kwFrame = applyEsp32SimulationToFrame(kwFrame, kwCtx) as any;
console.log("[TEST 3 Output]", JSON.stringify(kwFrame.serialOutput));
if (!kwFrame.serialOutput?.includes("A-B-C") || !kwFrame.serialOutput?.includes("x: 42")) {
  console.error("❌ TEST 3 FAILED: sep/end kwargs not formatted correctly!");
  process.exit(1);
} else {
  console.log("  [PASS] sep='-' formatted cleanly into 'A-B-C'");
}

// TEST 4: print(..., end="") line continuation across multiple print calls
console.log("\n--- TEST 4: print(..., end='') line continuation ---");
const contCode = `
print("Hello", end=" ")
print("World!")
print("1", "2", sep=":", end="")
print(":3")
`;
const contCtx = { ...ctx, picoCode: contCode };
let contFrame = buildSimulationFrame({
  tick: 1,
  nodes: [esp32Node],
  edges: [],
  dynamicComponents: [],
  boardType: "esp32",
  running: true,
  timestamp: 100,
});
contFrame = applyEsp32SimulationToFrame(contFrame, contCtx) as any;
console.log("[TEST 4 Output]", JSON.stringify(contFrame.serialOutput));
if (!contFrame.serialOutput?.includes("Hello World!") || !contFrame.serialOutput?.includes("1:2:3")) {
  console.error("❌ TEST 4 FAILED: Line continuation with end='' did not produce single combined lines!");
  process.exit(1);
} else {
  console.log("  [PASS] end=' ' combined into 'Hello World!'");
  console.log("  [PASS] end='' combined into '1:2:3'");
}

console.log("\n=================== MULTI-TICK ESP32 SERIAL TEST COMPLETE ===================");
