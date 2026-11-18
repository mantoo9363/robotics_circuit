import assert from "node:assert";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { buildSimulationFrame } from "../lib/simulation-state";
import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { resetEsp32NeoPixelCache } from "../lib/simulation/frameTransformers/esp32Neopixel";
import { parseEsp32CppNeoPixelActions } from "../lib/esp32/parser/cppNeopixel";
import { evaluateEsp32CppSerial, resetEsp32CppSerialSessions } from "../lib/esp32/parser/cppSerial";
import { evaluateEsp32CppConditionals } from "../lib/esp32/parser/cppConditionalLogic";

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

function runCppPipelineTick(
  code: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  inputStates?: Map<number, boolean>,
  tick = 1,
  running = true,
) {
  const context: any = {
    nodes,
    edges,
    picoCode: "",
    arduinoCode: code,
    selectedLanguage: "cpp",
    dynamicComponents: [],
    keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
    keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => {} },
  };

  const boardPins: any[] = [];
  if (inputStates) {
    for (const [pin, isHigh] of inputStates.entries()) {
      boardPins.push({
        pin,
        handleId: `gpio${pin}`,
        mode: "INPUT",
        value: isHigh ? 1 : 0,
        normalizedValue: isHigh ? 1 : 0,
        voltage: isHigh ? 3.3 : 0,
        active: isHigh,
      });
    }
  }

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
  initialFrame.boardPins = boardPins;

  return applyFramePipeline(initialFrame, context);
}

export function runEsp32CppNeopixelTests(): boolean {
  console.log("=================== RUNNING ESP32 C++ NEOPIXEL TESTS ===================");

  // --- TEST 1: Constructor parsing with #define and const int ---
  console.log("\n--- TEST 1: Constructor Parsing & Pin Resolution ---");
  const code1 = `
    #include <Adafruit_NeoPixel.h>
    #define PIN 4
    #define NUMPIXELS 8
    Adafruit_NeoPixel pixels(NUMPIXELS, PIN, NEO_GRB + NEO_KHZ800);

    void setup() {
      pixels.begin();
    }

    void loop() {
      pixels.setPixelColor(0, pixels.Color(255, 0, 0));
      pixels.show();
    }
  `;

  const actions1 = parseEsp32CppNeoPixelActions(code1);
  assert.strictEqual(actions1.length, 1, "Expected 1 NeoPixel write action");
  assert.strictEqual(actions1[0].pin, 4, "Expected pin 4");
  assert.strictEqual(actions1[0].pixels.length, 8, "Expected 8 pixels");
  assert.deepStrictEqual(actions1[0].pixels[0], { r: 255, g: 0, b: 0 }, "Pixel 0 should be RED");
  assert.deepStrictEqual(actions1[0].pixels[1], { r: 0, g: 0, b: 0 }, "Pixel 1 should be OFF");
  console.log("✅ PASS: Constructor with #define parsed correctly (pin 4, 8 pixels, pixel 0 RED)");

  // --- TEST 2: Buffer-Until-Show Semantics ---
  console.log("\n--- TEST 2: Buffer-Until-Show Semantics ---");
  const codeNoShow = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel strip(4, 5, NEO_GRB + NEO_KHZ800);
    void setup() { strip.begin(); }
    void loop() {
      strip.setPixelColor(0, strip.Color(0, 255, 0));
      // Notice: NO strip.show() called!
    }
  `;
  const actionsNoShow = parseEsp32CppNeoPixelActions(codeNoShow);
  assert.strictEqual(actionsNoShow.length, 0, "No actions should be emitted if .show() was not called");
  console.log("✅ PASS: Without .show(), no action is emitted (buffer remains uncommitted)");

  // --- TEST 3: .clear() and .fill() & 4-arg setPixelColor ---
  console.log("\n--- TEST 3: .clear(), .fill(), and 4-arg setPixelColor ---");
  const codeClearFill = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel strip(4, 18);
    void setup() {
      strip.begin();
      strip.fill(strip.Color(100, 100, 100)); // fill all with gray
      strip.setPixelColor(0, 255, 0, 0); // 4-arg form (red)
      strip.setPixelColor(1, 0, 255, 0); // 4-arg form (green)
      strip.setPixelColor(2, 0, 0, 255); // 4-arg form (blue)
      strip.show();
    }
    void loop() {}
  `;
  const actionsClearFill = parseEsp32CppNeoPixelActions(codeClearFill);
  assert.strictEqual(actionsClearFill.length, 1);
  assert.strictEqual(actionsClearFill[0].pin, 18);
  assert.deepStrictEqual(actionsClearFill[0].pixels[0], { r: 255, g: 0, b: 0 });
  assert.deepStrictEqual(actionsClearFill[0].pixels[1], { r: 0, g: 255, b: 0 });
  assert.deepStrictEqual(actionsClearFill[0].pixels[2], { r: 0, g: 0, b: 255 });
  assert.deepStrictEqual(actionsClearFill[0].pixels[3], { r: 100, g: 100, b: 100 });
  console.log("✅ PASS: .fill() and 4-arg setPixelColor(idx, r, g, b) working cleanly");

  // --- TEST 4: Simple for-loop unrolling ---
  console.log("\n--- TEST 4: Simple for-loop unrolling ---");
  const codeForLoop = `
    #include <Adafruit_NeoPixel.h>
    const int NUM = 4;
    const int PIN = 23;
    Adafruit_NeoPixel pixels = Adafruit_NeoPixel(NUM, PIN, NEO_GRB + NEO_KHZ800);

    void setup() {
      pixels.begin();
    }

    void loop() {
      for (int i = 0; i < NUM; i++) {
        pixels.setPixelColor(i, pixels.Color(0, 50 * i, 100));
      }
      pixels.show();
    }
  `;
  const actionsForLoop = parseEsp32CppNeoPixelActions(codeForLoop);
  assert.strictEqual(actionsForLoop.length, 1);
  assert.strictEqual(actionsForLoop[0].pin, 23);
  assert.deepStrictEqual(actionsForLoop[0].pixels[0], { r: 0, g: 0, b: 100 });
  assert.deepStrictEqual(actionsForLoop[0].pixels[1], { r: 0, g: 50, b: 100 });
  assert.deepStrictEqual(actionsForLoop[0].pixels[2], { r: 0, g: 100, b: 100 });
  assert.deepStrictEqual(actionsForLoop[0].pixels[3], { r: 0, g: 150, b: 100 });
  console.log("✅ PASS: Simple for-loop correctly unrolled and updated all 4 pixels");

  // --- TEST 5: Hardware Pin Safety Guards (GPIO 6-11 & GPIO 34-39) ---
  console.log("\n--- TEST 5: Hardware Pin Safety Guards ---");
  const codeFlash = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel strip(4, 6); // GPIO6 is reserved flash
    void loop() { strip.show(); }
  `;
  const actionsFlash = parseEsp32CppNeoPixelActions(codeFlash);
  assert.strictEqual(actionsFlash.length, 1);
  assert.ok(actionsFlash[0].warning?.includes("Forbidden GPIO 6"), "Expected flash pin warning");

  const codeInputOnly = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel strip(4, 34); // GPIO34 is input-only
    void loop() { strip.show(); }
  `;
  const actionsInputOnly = parseEsp32CppNeoPixelActions(codeInputOnly);
  assert.strictEqual(actionsInputOnly.length, 1);
  assert.ok(actionsInputOnly[0].warning?.includes("input-only"), "Expected input-only pin warning");
  console.log("✅ PASS: Pin guards for SPI flash (GPIO6) and Input-only (GPIO34) verified");

  // --- TEST 6: Multi-Pixel Daisy Chain Pipeline Integration ---
  console.log("\n--- TEST 6: Multi-Pixel Daisy Chain Pipeline Integration ---");
  resetEsp32NeoPixelCache();

  const esp32Node = createEsp32Node();
  const pix1 = createNeoPixelNode("pix1");
  const pix2 = createNeoPixelNode("pix2");
  const pix3 = createNeoPixelNode("pix3");

  const chainNodes = [esp32Node, pix1, pix2, pix3];
  const chainEdges: CircuitEdge[] = [
    // Power: 3.3V and GND from ESP32 to pix1
    { id: "e_vcc1", source: esp32Node.id, sourceHandle: "esp32_3v3", target: pix1.id, targetHandle: "vcc1" },
    { id: "e_gnd1", source: esp32Node.id, sourceHandle: "esp32_gnd1", target: pix1.id, targetHandle: "ground1" },

    // Data: ESP32 GPIO4 -> pix1:in
    { id: "e_d1", source: esp32Node.id, sourceHandle: "gpio4", target: pix1.id, targetHandle: "in" },

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
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixels(3, 4, NEO_GRB + NEO_KHZ800);
    void setup() {
      pixels.begin();
      pixels.setPixelColor(0, pixels.Color(255, 0, 0));
      pixels.setPixelColor(1, pixels.Color(0, 255, 0));
      pixels.setPixelColor(2, pixels.Color(0, 0, 255));
      pixels.show();
    }
    void loop() {}
  `;

  const frameOut = runCppPipelineTick(codeChain, chainNodes, chainEdges);

  assert.strictEqual(frameOut.components["pix1"].telemetry.chainPosition, 0, "pix1 position 0");
  assert.strictEqual(frameOut.components["pix1"].telemetry.red, 255, "pix1 Red = 255");
  assert.strictEqual(frameOut.components["pix1"].telemetry.green, 0, "pix1 Green = 0");

  assert.strictEqual(frameOut.components["pix2"].telemetry.chainPosition, 1, "pix2 position 1");
  assert.strictEqual(frameOut.components["pix2"].telemetry.green, 255, "pix2 Green = 255");

  assert.strictEqual(frameOut.components["pix3"].telemetry.chainPosition, 2, "pix3 position 2");
  assert.strictEqual(frameOut.components["pix3"].telemetry.blue, 255, "pix3 Blue = 255");
  console.log("✅ PASS: Frame transformer resolved 3-node daisy chain with R, G, B colors");

  // --- TEST 7: Multiple Independent Strips ---
  console.log("\n--- TEST 7: Multiple Independent Strips ---");
  const codeMultiStrips = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel stripA(2, 4);
    Adafruit_NeoPixel stripB(2, 16);

    void setup() {
      stripA.begin();
      stripB.begin();
    }

    void loop() {
      stripA.setPixelColor(0, 0xFF0000);
      stripA.show();

      stripB.setPixelColor(0, 0x0000FF);
      stripB.show();
    }
  `;
  const actionsMulti = parseEsp32CppNeoPixelActions(codeMultiStrips);
  assert.strictEqual(actionsMulti.length, 2, "Expected 2 independent write actions");
  const stripAAct = actionsMulti.find((a) => a.pin === 4);
  const stripBAct = actionsMulti.find((a) => a.pin === 16);
  assert.ok(stripAAct, "Found strip on GPIO 4");
  assert.ok(stripBAct, "Found strip on GPIO 16");
  assert.deepStrictEqual(stripAAct.pixels[0], { r: 255, g: 0, b: 0 });
  assert.deepStrictEqual(stripBAct.pixels[0], { r: 0, g: 0, b: 255 });
  console.log("✅ PASS: Multiple independent strips evaluated on GPIO 4 and GPIO 16");

  // --- TEST 8: Multi-Component Integration (NeoPixel + Button + Serial) ---
  console.log("\n--- TEST 8: Multi-Component Integration (NeoPixel + Button + Serial) ---");
  resetEsp32CppSerialSessions();

  const codeIntegration = `
    #include <Adafruit_NeoPixel.h>
    #define PIN 4
    #define BUTTON_PIN 15
    Adafruit_NeoPixel pixels(1, PIN, NEO_GRB + NEO_KHZ800);

    void setup() {
      Serial.begin(115200);
      pinMode(BUTTON_PIN, INPUT_PULLUP);
      pixels.begin();
    }

    void loop() {
      if (digitalRead(BUTTON_PIN) == LOW) {
        pixels.setPixelColor(0, pixels.Color(255, 0, 0));
        pixels.show();
        Serial.println("COLOR: RED");
      } else {
        pixels.setPixelColor(0, pixels.Color(0, 255, 0));
        pixels.show();
        Serial.println("COLOR: GREEN");
      }
    }
  `;

  // 1. Button Pressed (active LOW) -> Red + "COLOR: RED"
  const inputPressed = new Map<number, boolean>([[15, false]]); // pin 15 is LOW
  const actionsPressed = parseEsp32CppNeoPixelActions(codeIntegration, { inputStates: inputPressed });
  assert.strictEqual(actionsPressed.length, 1);
  assert.deepStrictEqual(actionsPressed[0].pixels[0], { r: 255, g: 0, b: 0 }, "Expected RED when button is pressed");

  const serialPressed = evaluateEsp32CppSerial(codeIntegration, { inputStates: inputPressed });
  assert.ok(serialPressed.allLines.includes("COLOR: RED"), "Serial should contain COLOR: RED");

  // 2. Button Released (HIGH with PULLUP) -> Green + "COLOR: GREEN"
  resetEsp32CppSerialSessions();
  const inputReleased = new Map<number, boolean>([[15, true]]); // pin 15 is HIGH
  const actionsReleased = parseEsp32CppNeoPixelActions(codeIntegration, { inputStates: inputReleased });
  assert.strictEqual(actionsReleased.length, 1);
  assert.deepStrictEqual(actionsReleased[0].pixels[0], { r: 0, g: 255, b: 0 }, "Expected GREEN when button is released");

  const serialReleased = evaluateEsp32CppSerial(codeIntegration, { inputStates: inputReleased });
  assert.ok(serialReleased.allLines.includes("COLOR: GREEN"), "Serial should contain COLOR: GREEN");
  console.log("✅ PASS: Multi-component integration (NeoPixel + Button + Serial) verified cleanly in both states");

  // --- TEST 9: Unwired Pin Scenario ---
  console.log("\n--- TEST 9: Unwired Pin Scenario ---");
  resetEsp32NeoPixelCache();
  const esp32NodeUnwired = createEsp32Node("esp32_unwired");
  const pixUnwired = createNeoPixelNode("pix_unwired");

  const unwiredNodes = [esp32NodeUnwired, pixUnwired];
  // Power connected, but Data IN is floating (not connected to GPIO5)
  const unwiredEdges: CircuitEdge[] = [
    { id: "e_vcc_u", source: esp32NodeUnwired.id, sourceHandle: "esp32_3v3", target: pixUnwired.id, targetHandle: "vcc1" },
    { id: "e_gnd_u", source: esp32NodeUnwired.id, sourceHandle: "esp32_gnd1", target: pixUnwired.id, targetHandle: "ground1" },
  ];

  const codeUnwired = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixels(8, 5, NEO_GRB + NEO_KHZ800);
    void setup() {
      pixels.begin();
      pixels.setPixelColor(0, pixels.Color(255, 0, 0));
      pixels.show();
    }
    void loop() {}
  `;

  const frameUnwired = runCppPipelineTick(codeUnwired, unwiredNodes, unwiredEdges);
  const compUnwired = frameUnwired.components["pix_unwired"];
  assert.ok(compUnwired, "Component should exist");
  assert.strictEqual(compUnwired.isPowered, false, "Unwired pixel should NOT be powered/lit");
  assert.strictEqual(compUnwired.brightness, 0, "Brightness should be 0");
  assert.strictEqual(compUnwired.telemetry.chainPosition, -1, "chainPosition should be -1");
  assert.strictEqual(compUnwired.telemetry.mcuPin, -1, "mcuPin should be -1");
  assert.strictEqual(compUnwired.telemetry.error, "Power without Data (IN Pin Floating)", "Error should reflect floating data line");
  console.log("✅ PASS: Unwired pin fails safely — nothing lights up, error reflects floating IN");

  // --- TEST 10: Daisy-Chain Cascading Break Scenario ---
  console.log("\n--- TEST 10: Daisy-Chain Cascading Break Scenario ---");
  resetEsp32NeoPixelCache();
  const esp32NodeCascade = createEsp32Node("esp32_c");
  const pixC1 = createNeoPixelNode("pix_c1");
  const pixC2 = createNeoPixelNode("pix_c2");
  const pixC3 = createNeoPixelNode("pix_c3");

  const cascadeNodes = [esp32NodeCascade, pixC1, pixC2, pixC3];
  const cascadeEdges: CircuitEdge[] = [
    // pixC1 fully powered from ESP32
    { id: "e_vcc_c1", source: esp32NodeCascade.id, sourceHandle: "esp32_3v3", target: pixC1.id, targetHandle: "vcc1" },
    { id: "e_gnd_c1", source: esp32NodeCascade.id, sourceHandle: "esp32_gnd1", target: pixC1.id, targetHandle: "ground1" },
    { id: "e_d_c1", source: esp32NodeCascade.id, sourceHandle: "gpio4", target: pixC1.id, targetHandle: "in" },

    // pixC2: data and VCC connected, but GND DISCONNECTED (Broken node)
    { id: "e_d_c2", source: pixC1.id, sourceHandle: "out", target: pixC2.id, targetHandle: "in" },
    { id: "e_vcc_c2", source: pixC1.id, sourceHandle: "vcc2", target: pixC2.id, targetHandle: "vcc1" },
    // Notice: ground2 -> ground1 is missing for pixC2!

    // pixC3: daisy chained from pixC2 with VCC & GND connected from pixC1
    { id: "e_d_c3", source: pixC2.id, sourceHandle: "out", target: pixC3.id, targetHandle: "in" },
    { id: "e_vcc_c3", source: pixC1.id, sourceHandle: "vcc2", target: pixC3.id, targetHandle: "vcc1" },
    { id: "e_gnd_c3", source: pixC1.id, sourceHandle: "ground2", target: pixC3.id, targetHandle: "ground1" },
  ];

  const codeCascade = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixels(3, 4, NEO_GRB + NEO_KHZ800);
    void setup() {
      pixels.begin();
      pixels.setPixelColor(0, pixels.Color(255, 0, 0));
      pixels.setPixelColor(1, pixels.Color(0, 255, 0));
      pixels.setPixelColor(2, pixels.Color(0, 0, 255));
      pixels.show();
    }
    void loop() {}
  `;

  const frameCascade = runCppPipelineTick(codeCascade, cascadeNodes, cascadeEdges);

  // 1. Pixel 1 (before the break) must remain lit and fully functional
  const compC1 = frameCascade.components["pix_c1"];
  assert.strictEqual(compC1.isPowered, true, "Pixel 1 before break should remain powered");
  assert.strictEqual(compC1.telemetry.red, 255, "Pixel 1 Red should be 255");
  assert.strictEqual(compC1.telemetry.error, "", "Pixel 1 should have no error");

  // 2. Pixel 2 (at the break) has missing ground
  const compC2 = frameCascade.components["pix_c2"];
  assert.strictEqual(compC2.isPowered, false, "Pixel 2 at break must not be powered");
  assert.strictEqual(compC2.telemetry.error, "Ground Missing", "Pixel 2 should flag Ground Missing");

  // 3. Pixel 3 (after the break) has broken upstream signal -> goes dark
  const compC3 = frameCascade.components["pix_c3"];
  assert.strictEqual(compC3.isPowered, false, "Pixel 3 after break must be dark");
  assert.strictEqual(compC3.brightness, 0, "Pixel 3 brightness must be 0");
  assert.strictEqual(compC3.telemetry.error, "Broken Chain (Upstream Pixel Unpowered)", "Pixel 3 should flag broken upstream chain");
  console.log("✅ PASS: Cascading break verified — Pixel 1 stays lit, Pixel 2/3 go dark with cascading error");

  // --- TEST 11: Out-of-Range Pixel Index Scenario ---
  console.log("\n--- TEST 11: Out-of-Range Pixel Index Scenario ---");
  const codeOutOfRange = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixels(8, 4, NEO_GRB + NEO_KHZ800);
    void setup() {
      pixels.begin();
      pixels.setPixelColor(0, pixels.Color(255, 0, 0)); // valid index 0
      pixels.setPixelColor(999, pixels.Color(0, 255, 0)); // out-of-range positive index
      pixels.setPixelColor(-5, pixels.Color(0, 255, 0)); // out-of-range negative index
      pixels.setPixelColor(7, pixels.Color(0, 0, 255)); // valid index 7
      pixels.show();
    }
    void loop() {}
  `;

  let actionsOutOfRange: any[] = [];
  assert.doesNotThrow(() => {
    actionsOutOfRange = parseEsp32CppNeoPixelActions(codeOutOfRange);
  }, "Out-of-range pixel indexing must not throw exception");

  assert.strictEqual(actionsOutOfRange.length, 1, "Expected 1 write action");
  assert.strictEqual(actionsOutOfRange[0].pixels.length, 8, "Expected 8 pixel array");
  assert.deepStrictEqual(actionsOutOfRange[0].pixels[0], { r: 255, g: 0, b: 0 }, "Pixel 0 should be RED");
  assert.deepStrictEqual(actionsOutOfRange[0].pixels[7], { r: 0, g: 0, b: 255 }, "Pixel 7 should be BLUE");
  for (let p = 1; p <= 6; p++) {
    assert.deepStrictEqual(actionsOutOfRange[0].pixels[p], { r: 0, g: 0, b: 0 }, `Pixel ${p} should remain OFF`);
  }
  console.log("✅ PASS: Out-of-range indices (999, -5) silently ignored without crash; valid pixels work normally");

  // --- TEST 12: Multi-Phase Blinking Animation with delay() ---
  console.log("\n--- TEST 12: Multi-Phase Blinking Animation with delay() ---");
  const codeBlink = `
    #include <Adafruit_NeoPixel.h>
    const int NEOPIXEL_PIN = 18;
    const int NUM_PIXELS = 3;
    Adafruit_NeoPixel pixels(NUM_PIXELS, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);

    void setup() {
      pixels.begin();
      pixels.clear();
      pixels.show();
    }

    void loop() {
      // Phase 1 (0ms - 2000ms): RGB ON
      pixels.setPixelColor(0, pixels.Color(255, 0, 0));
      pixels.setPixelColor(1, pixels.Color(0, 255, 0));
      pixels.setPixelColor(2, pixels.Color(0, 0, 255));
      pixels.show();
      delay(2000);

      // Phase 2 (2000ms - 4000ms): All OFF
      pixels.clear();
      pixels.show();
      delay(2000);
    }
  `;

  // Test Phase 1 active at t = 500ms
  const actBlinkP1 = parseEsp32CppNeoPixelActions(codeBlink, { timestamp: 500 });
  assert.strictEqual(actBlinkP1.length, 1);
  assert.deepStrictEqual(actBlinkP1[0].pixels[0], { r: 255, g: 0, b: 0 });
  assert.deepStrictEqual(actBlinkP1[0].pixels[1], { r: 0, g: 255, b: 0 });
  assert.deepStrictEqual(actBlinkP1[0].pixels[2], { r: 0, g: 0, b: 255 });

  // Test Phase 2 active at t = 2500ms
  const actBlinkP2 = parseEsp32CppNeoPixelActions(codeBlink, { timestamp: 2500 });
  assert.strictEqual(actBlinkP2.length, 1);
  assert.deepStrictEqual(actBlinkP2[0].pixels[0], { r: 0, g: 0, b: 0 });
  assert.deepStrictEqual(actBlinkP2[0].pixels[1], { r: 0, g: 0, b: 0 });
  assert.deepStrictEqual(actBlinkP2[0].pixels[2], { r: 0, g: 0, b: 0 });

  // Test Phase 1 repeat at t = 4500ms
  const actBlinkP3 = parseEsp32CppNeoPixelActions(codeBlink, { timestamp: 4500 });
  assert.strictEqual(actBlinkP3.length, 1);
  assert.deepStrictEqual(actBlinkP3[0].pixels[0], { r: 255, g: 0, b: 0 });
  assert.deepStrictEqual(actBlinkP3[0].pixels[1], { r: 0, g: 255, b: 0 });
  assert.deepStrictEqual(actBlinkP3[0].pixels[2], { r: 0, g: 0, b: 255 });
  console.log("✅ PASS: Multi-phase blinking animation accurately cycles between ON and OFF across time");

  // --- TEST 13: 3-Phase Color Chaser Pipeline Integration ---
  console.log("\n--- TEST 13: 3-Phase Color Chaser Pipeline Integration ---");
  const codeChaser = `
    #include <Adafruit_NeoPixel.h>
    #define PIN 4
    #define NUM 3
    Adafruit_NeoPixel strip(NUM, PIN, NEO_GRB + NEO_KHZ800);

    void setup() {
      strip.begin();
    }

    void loop() {
      // Step 1: Pixel 0 RED
      strip.clear();
      strip.setPixelColor(0, strip.Color(255, 0, 0));
      strip.show();
      delay(1000);

      // Step 2: Pixel 1 GREEN
      strip.clear();
      strip.setPixelColor(1, strip.Color(0, 255, 0));
      strip.show();
      delay(1000);

      // Step 3: Pixel 2 BLUE
      strip.clear();
      strip.setPixelColor(2, strip.Color(0, 0, 255));
      strip.show();
      delay(1000);
    }
  `;

  const actChaser1 = parseEsp32CppNeoPixelActions(codeChaser, { timestamp: 200 }); // Step 1
  assert.deepStrictEqual(actChaser1[0].pixels[0], { r: 255, g: 0, b: 0 });
  assert.deepStrictEqual(actChaser1[0].pixels[1], { r: 0, g: 0, b: 0 });

  const actChaser2 = parseEsp32CppNeoPixelActions(codeChaser, { timestamp: 1200 }); // Step 2
  assert.deepStrictEqual(actChaser2[0].pixels[0], { r: 0, g: 0, b: 0 });
  assert.deepStrictEqual(actChaser2[0].pixels[1], { r: 0, g: 255, b: 0 });

  const actChaser3 = parseEsp32CppNeoPixelActions(codeChaser, { timestamp: 2200 }); // Step 3
  assert.deepStrictEqual(actChaser3[0].pixels[1], { r: 0, g: 0, b: 0 });
  assert.deepStrictEqual(actChaser3[0].pixels[2], { r: 0, g: 0, b: 255 });
  console.log("✅ PASS: 3-phase color chaser cycles through red -> green -> blue phases cleanly");

  console.log("\n=================== ALL ESP32 C++ NEOPIXEL TESTS PASSED ===================");
  return true;
}

if (process.argv[1] && process.argv[1].endsWith("esp32CppNeopixel.test.ts")) {
  runEsp32CppNeopixelTests();
}
