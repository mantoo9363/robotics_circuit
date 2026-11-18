import assert from "node:assert";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { buildSimulationFrame } from "../lib/simulation-state";
import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { resetEsp32NeoPixelCache } from "../lib/simulation/frameTransformers/esp32Neopixel";
import { clearSimSessions } from "../lib/codeParsing/picoParser";

function createEsp32Node(id = "esp32_1"): CircuitNode {
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

function createNeoPixelNode(id: string): CircuitNode {
  return {
    id,
    type: "neopixel",
    position: { x: 300, y: 100 },
    data: {
      componentType: "neopixel",
      label: "NeoPixel",
      simulationModel: "neopixel",
      properties: {},
      rotation: 0,
    },
  };
}

function runPipelineTick(
  code: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  tick = 1,
  running = true,
) {
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
    running,
    arduinoState: {
      pins: new Map(),
      serialOutput: [],
      error: null,
      running,
    },
  });

  return applyFramePipeline(initialFrame, context);
}

console.log("=================== RUNNING ESP32 NEOPIXEL TEST SUITE ===================");

// --- TEST 1: Chain Ordering Test (in -> out -> in -> out) ---
console.log("\n--- TEST 1: Chain Ordering Test (in -> out -> in -> out) ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const esp32Node1 = createEsp32Node();
const pix1 = createNeoPixelNode("pix1");
const pix2 = createNeoPixelNode("pix2");
const pix3 = createNeoPixelNode("pix3");

const chainNodes = [esp32Node1, pix1, pix2, pix3];
const chainEdges: CircuitEdge[] = [
  // Power: VCC and GND from ESP32 to pix1
  { id: "e_vcc1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: pix1.id, targetHandle: "vcc1" },
  { id: "e_gnd1", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: pix1.id, targetHandle: "ground1" },

  // Data: ESP32 GPIO4 -> pix1:in
  { id: "e_d1", source: esp32Node1.id, sourceHandle: "gpio4", target: pix1.id, targetHandle: "in" },

  // Daisy chain pix1 -> pix2
  { id: "e_d2", source: pix1.id, sourceHandle: "out", target: pix2.id, targetHandle: "in" },
  { id: "e_vcc2", source: pix1.id, sourceHandle: "vcc2", target: pix2.id, targetHandle: "vcc1" },
  { id: "e_gnd2", source: pix1.id, sourceHandle: "ground2", target: pix2.id, targetHandle: "ground1" },

  // Daisy chain pix2 -> pix3
  { id: "e_d3", source: pix2.id, sourceHandle: "out", target: pix3.id, targetHandle: "in" },
  { id: "e_vcc3", source: pix2.id, sourceHandle: "vcc2", target: pix3.id, targetHandle: "vcc1" },
  { id: "e_gnd3", source: pix2.id, sourceHandle: "ground2", target: pix3.id, targetHandle: "ground1" },
];

const codeChain = `
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(Pin(4), 3)
np[0] = (255, 0, 0)
np[1] = (0, 255, 0)
np[2] = (0, 0, 255)
np.write()
`;

const frameChain = runPipelineTick(codeChain, chainNodes, chainEdges);

const c1 = frameChain.components["pix1"];
const c2 = frameChain.components["pix2"];
const c3 = frameChain.components["pix3"];

assert.strictEqual(c1?.telemetry?.red, 255, "Pix1 red must be 255");
assert.strictEqual(c1?.telemetry?.green, 0, "Pix1 green must be 0");
assert.strictEqual(c1?.telemetry?.blue, 0, "Pix1 blue must be 0");
assert.strictEqual(c1?.telemetry?.chainPosition, 0, "Pix1 chainPosition must be 0");

assert.strictEqual(c2?.telemetry?.red, 0, "Pix2 red must be 0");
assert.strictEqual(c2?.telemetry?.green, 255, "Pix2 green must be 255");
assert.strictEqual(c2?.telemetry?.blue, 0, "Pix2 blue must be 0");
assert.strictEqual(c2?.telemetry?.chainPosition, 1, "Pix2 chainPosition must be 1");

assert.strictEqual(c3?.telemetry?.red, 0, "Pix3 red must be 0");
assert.strictEqual(c3?.telemetry?.green, 0, "Pix3 green must be 0");
assert.strictEqual(c3?.telemetry?.blue, 255, "Pix3 blue must be 255");
assert.strictEqual(c3?.telemetry?.chainPosition, 2, "Pix3 chainPosition must be 2");

console.log("  [PASS] 3-node NeoPixel chain ordered accurately: Red(0) -> Green(1) -> Blue(2)");

// --- TEST 2: Buffer not applied until .write() called ---
console.log("\n--- TEST 2: Buffer not applied until .write() called ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const codeNoWrite = `
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(Pin(4), 3)
np[0] = (255, 0, 0)
np[1] = (0, 255, 0)
np[2] = (0, 0, 255)
# Note: np.write() is intentionally omitted!
`;

const frameNoWrite = runPipelineTick(codeNoWrite, chainNodes, chainEdges);
const nw1 = frameNoWrite.components["pix1"];
const nw2 = frameNoWrite.components["pix2"];
const nw3 = frameNoWrite.components["pix3"];

assert.strictEqual(nw1?.telemetry?.red ?? 0, 0, "Pix1 must remain unlit before write()");
assert.strictEqual(nw2?.telemetry?.green ?? 0, 0, "Pix2 must remain unlit before write()");
assert.strictEqual(nw3?.telemetry?.blue ?? 0, 0, "Pix3 must remain unlit before write()");
console.log("  [PASS] Pixels remain unlit until .write() commits the buffer");

// --- TEST 3: .fill() method ---
console.log("\n--- TEST 3: .fill() method ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const codeFill = `
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(Pin(4), 3)
np.fill((100, 150, 200))
np.write()
`;

const frameFill = runPipelineTick(codeFill, chainNodes, chainEdges);
for (const pId of ["pix1", "pix2", "pix3"]) {
  const comp = frameFill.components[pId];
  assert.strictEqual(comp?.telemetry?.red, 100, `${pId} red should be 100`);
  assert.strictEqual(comp?.telemetry?.green, 150, `${pId} green should be 150`);
  assert.strictEqual(comp?.telemetry?.blue, 200, `${pId} blue should be 200`);
}
console.log("  [PASS] .fill((100, 150, 200)) correctly set all pixels");

// --- TEST 4: Cross-Frame Persistence & Tick 0 Reset ---
console.log("\n--- TEST 4: Cross-Frame Persistence & Tick 0 Reset ---");
// Tick 1: sets colors
const frameTick1 = runPipelineTick(codeChain, chainNodes, chainEdges, 1, true);
assert.strictEqual(frameTick1.components["pix1"]?.telemetry?.red, 255);

// Tick 2: simulated sleep tick with code that doesn't re-write
const codeSleep = `
import time
time.sleep_ms(100)
`;
const frameTick2 = runPipelineTick(codeSleep, chainNodes, chainEdges, 2, true);
assert.strictEqual(frameTick2.components["pix1"]?.telemetry?.red, 255, "Pix1 red must persist across ticks");
assert.strictEqual(frameTick2.components["pix2"]?.telemetry?.green, 255, "Pix2 green must persist across ticks");
assert.strictEqual(frameTick2.components["pix3"]?.telemetry?.blue, 255, "Pix3 blue must persist across ticks");
console.log("  [PASS] Cross-frame persistence verified: colors retained during sleep_ms");

// Tick 0 (Reset / Stop): must clear all pixels
const frameReset = runPipelineTick(codeChain, chainNodes, chainEdges, 0, false);
assert.strictEqual(frameReset.components["pix1"]?.telemetry?.red, 0, "Pix1 red must be 0 on tick 0");
assert.strictEqual(frameReset.components["pix1"]?.brightness, 0, "Pix1 brightness must be 0 on tick 0");
assert.strictEqual(frameReset.components["pix1"]?.isPowered, false, "Pix1 isPowered must be false on tick 0");
console.log("  [PASS] Tick 0 clean reset verified: all pixels reset to 0/off");

// --- TEST 5: Extra Pixels vs Actual Wired Nodes ---
console.log("\n--- TEST 5: Extra Pixels vs Actual Wired Nodes ---");
clearSimSessions();
resetEsp32NeoPixelCache();

// Code configures 10 pixels, but canvas only has 3 wired nodes
const codeExtra = `
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(Pin(4), 10)
np[0] = (255, 0, 0)
np[1] = (0, 255, 0)
np[2] = (0, 0, 255)
np[3] = (50, 50, 50)
np[9] = (200, 200, 200)
np.write()
`;

const frameExtra = runPipelineTick(codeExtra, chainNodes, chainEdges);
assert.strictEqual(frameExtra.components["pix1"]?.telemetry?.red, 255);
assert.strictEqual(frameExtra.components["pix2"]?.telemetry?.green, 255);
assert.strictEqual(frameExtra.components["pix3"]?.telemetry?.blue, 255);
console.log("  [PASS] Extra declared pixels (10 pixels for 3 wired nodes) handled safely without crash");

// --- TEST 6: Unpowered Chain (VCC/GND Missing) ---
console.log("\n--- TEST 6: Unpowered Chain (VCC/GND Missing) ---");
clearSimSessions();
resetEsp32NeoPixelCache();

// Remove VCC and GND edges, leaving only Data
const unpoweredEdges = chainEdges.filter((e) => !e.id.includes("vcc") && !e.id.includes("gnd"));
const frameUnpowered = runPipelineTick(codeChain, chainNodes, unpoweredEdges);

for (const pId of ["pix1", "pix2", "pix3"]) {
  const comp = frameUnpowered.components[pId];
  assert.strictEqual(comp?.isPowered, false, `${pId} isPowered must be false when unpowered`);
  assert.strictEqual(comp?.brightness, 0, `${pId} brightness must be 0 when unpowered`);
  assert.strictEqual(comp?.telemetry?.red, 0, `${pId} red must be 0 when unpowered`);
}
console.log("  [PASS] Unpowered chain verified: all pixels remain completely off");

// --- TEST 7: Multiple Independent NeoPixel Instances on Different Pins ---
console.log("\n--- TEST 7: Multiple Independent NeoPixel Instances on Different Pins ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const strip1Node = createNeoPixelNode("strip1_node");
const strip2Node = createNeoPixelNode("strip2_node");

const multiNodes = [esp32Node1, strip1Node, strip2Node];
const multiEdges: CircuitEdge[] = [
  // Strip 1 on GPIO4
  { id: "m_vcc1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: strip1Node.id, targetHandle: "vcc1" },
  { id: "m_gnd1", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: strip1Node.id, targetHandle: "ground1" },
  { id: "m_d1", source: esp32Node1.id, sourceHandle: "gpio4", target: strip1Node.id, targetHandle: "in" },

  // Strip 2 on GPIO5
  { id: "m_vcc2", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: strip2Node.id, targetHandle: "vcc1" },
  { id: "m_gnd2", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: strip2Node.id, targetHandle: "ground1" },
  { id: "m_d2", source: esp32Node1.id, sourceHandle: "gpio5", target: strip2Node.id, targetHandle: "in" },
];

const codeMulti = `
from machine import Pin
from neopixel import NeoPixel

np1 = NeoPixel(Pin(4), 1)
np2 = NeoPixel(Pin(5), 1)

np1[0] = (255, 0, 0)
np2[0] = (0, 0, 255)

np1.write()
np2.write()
`;

const frameMulti = runPipelineTick(codeMulti, multiNodes, multiEdges);
assert.strictEqual(frameMulti.components["strip1_node"]?.telemetry?.red, 255, "Strip 1 (GPIO4) must be Red");
assert.strictEqual(frameMulti.components["strip1_node"]?.telemetry?.blue, 0);
assert.strictEqual(frameMulti.components["strip2_node"]?.telemetry?.red, 0);
assert.strictEqual(frameMulti.components["strip2_node"]?.telemetry?.blue, 255, "Strip 2 (GPIO5) must be Blue");
console.log("  [PASS] Multiple independent NeoPixel instances on GPIO4 and GPIO5 isolated cleanly");

// --- TEST 8: Flash-Reserved and Input-Only Pin Protection ---
console.log("\n--- TEST 8: Flash-Reserved and Input-Only Pin Protection ---");
clearSimSessions();
resetEsp32NeoPixelCache();

// Input-only pin GPIO34
const codeInputOnly = `
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(Pin(34), 1)
np[0] = (255, 255, 255)
np.write()
`;
const frameInputOnly = runPipelineTick(codeInputOnly, chainNodes, chainEdges);
const serialInputOnly = frameInputOnly.serialOutput || [];
const hasValueError34 = serialInputOnly.some((l: string) => l.includes("ValueError") && l.includes("34"));
assert.ok(hasValueError34, "Must surface ValueError for input-only GPIO34");

// Flash-reserved pin GPIO6
const codeFlash = `
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(Pin(6), 1)
np[0] = (255, 255, 255)
np.write()
`;
const frameFlash = runPipelineTick(codeFlash, chainNodes, chainEdges);
const serialFlash = frameFlash.serialOutput || [];
const hasValueError6 = serialFlash.some((l: string) => l.includes("ValueError") && l.includes("6"));
assert.ok(hasValueError6, "Must surface ValueError for SPI flash GPIO6");

console.log("  [PASS] Hardware safety guards enforced: GPIO34 and GPIO6 rejected with ValueError");

// --- TEST 9: Clamping Out-of-Range RGB and RGBW Formats ---
console.log("\n--- TEST 9: Clamping Out-of-Range RGB and RGBW Formats ---");
clearSimSessions();
resetEsp32NeoPixelCache();

const codeClamped = `
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(pin=Pin(4), n=3)
np[0] = (-50, 999, 128)        # Clamping test
np[1] = (0, 255, 0, 128)        # RGBW 4-tuple test
np.write()
`;

const frameClamped = runPipelineTick(codeClamped, chainNodes, chainEdges);
const cl1 = frameClamped.components["pix1"];
const cl2 = frameClamped.components["pix2"];

assert.strictEqual(cl1?.telemetry?.red, 0, "-50 clamped to 0");
assert.strictEqual(cl1?.telemetry?.green, 255, "999 clamped to 255");
assert.strictEqual(cl1?.telemetry?.blue, 128, "128 unchanged");

assert.strictEqual(cl2?.telemetry?.red, 0);
assert.strictEqual(cl2?.telemetry?.green, 255);
assert.strictEqual(cl2?.telemetry?.blue, 0);
console.log("  [PASS] RGB values clamped to 0-255 & RGBW 4th value safely handled");

// --- TEST 10: Disconnected IN Pin Safe No-Op ---
console.log("\n--- TEST 10: Disconnected IN Pin Safe No-Op ---");
clearSimSessions();
resetEsp32NeoPixelCache();

// Edges only have power, data pin is completely disconnected
const disconnectedEdges: CircuitEdge[] = [
  { id: "e_vcc1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: pix1.id, targetHandle: "vcc1" },
  { id: "e_gnd1", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: pix1.id, targetHandle: "ground1" },
];

const frameDisc = runPipelineTick(codeChain, [esp32Node1, pix1], disconnectedEdges);
const compDisc = frameDisc.components["pix1"];
assert.strictEqual(compDisc?.telemetry?.red, 0, "Disconnected data pin must result in red = 0");
assert.strictEqual(compDisc?.brightness, 0, "Disconnected data pin must have brightness = 0");
assert.ok(String(compDisc?.telemetry?.error).includes("Data"), "Error should indicate missing data");
console.log("  [PASS] Disconnected IN pin handled safely without crash");

console.log("\n=================== ALL ESP32 NEOPIXEL TESTS PASSED ===================");
