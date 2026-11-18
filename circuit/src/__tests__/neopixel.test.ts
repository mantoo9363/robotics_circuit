import { useCircuitStore } from "../lib/store";
import { applyNeoPixelInputToFrame } from "../lib/simulation/frameTransformers/neoPixel";
import { parseNeoPixelColors } from "../lib/codeParsing/neopixelParser";
import { parsePythonReadOutputsForInput } from "../lib/codeParsing/picoParser";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runNeoPixelTests(): boolean {
  console.log("=================== RUNNING NEOPIXEL REGRESSION TESTS ===================\n");
  let passed = true;

  // 1. Test C++ Parser logic with Constructor args, begin() initialization, and single-pixel index filtering
  const cppCode = `
    #include <Adafruit_NeoPixel.h>
    #define PIN 6
    #define NUMPIXELS 3
    Adafruit_NeoPixel pixels(NUMPIXELS, PIN, NEO_GRB + NEO_KHZ800);
    void setup() {
      pixels.begin();
    }
    void loop() {
      pixels.clear();
      pixels.setPixelColor(0, pixels.Color(255, 0, 0));
      pixels.setPixelColor(1, 0x00FF00); // Index 1: should be ignored in this single-pixel phase
      pixels.setBrightness(128);
      pixels.show();
    }
  `.trim();

  const parsedState = parseNeoPixelColors(cppCode, 6, 3);
  if (!parsedState) {
    console.error("FAIL: parseNeoPixelColors returned null for valid code");
    passed = false;
  } else {
    const p0 = parsedState.pixels[0];
    const p1 = parsedState.pixels[1];
    if (p0.r !== 255 || p0.g !== 0 || p0.b !== 0) {
      console.error("FAIL: Pixel 0 color was not parsed correctly:", p0);
      passed = false;
    } else if (!p1 || p1.r !== 0 || p1.g !== 255 || p1.b !== 0) {
      console.error("FAIL: Pixel 1 color was not parsed correctly:", p1);
      passed = false;
    } else if (parsedState.brightness !== 128) {
      console.error("FAIL: Brightness was not parsed correctly:", parsedState.brightness);
      passed = false;
    } else if (parsedState.initialized !== true) {
      console.error("FAIL: Initialized status was not set to true after begin()");
      passed = false;
    } else {
      console.log("=> C++ NeoPixel Parser tests (Initialization & Multi-pixel) PASSED");
    }
  }

  // 2. Test Uninitialized warning check
  const uninitializedCppCode = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixels(3, 6);
    void loop() {
      pixels.setPixelColor(0, 255, 0, 0);
      pixels.show();
    }
  `.trim();
  const uninitParsed = parseNeoPixelColors(uninitializedCppCode, 6, 3);
  if (!uninitParsed || uninitParsed.initialized !== false) {
    console.error("FAIL: Uninitialized strip was not flagged initialized=false");
    passed = false;
  } else {
    console.log("=> Uninitialized NeoPixel status tracking PASSED");
  }

  // 3. Test Global Array parsing and subscript evaluation
  const arrayCppCode = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixel(1, 6);
    uint32_t colors[]={
      pixel.Color(255,10,20),
      pixel.Color(0,255,30),
      pixel.Color(0,0,255)
    };
    void setup() {
      pixel.begin();
    }
    void loop() {
      pixel.setPixelColor(0, colors[1]);
      pixel.show();
    }
  `.trim();
  const arrayParsed = parseNeoPixelColors(arrayCppCode, 6, 1);
  if (!arrayParsed || arrayParsed.pixels[0].g !== 255 || arrayParsed.pixels[0].r !== 0) {
    console.error("FAIL: Global array color lookup failed:", arrayParsed?.pixels[0]);
    passed = false;
  } else {
    console.log("=> Global Array lookup and subscript substitution PASSED");
  }

  // 4. Test random() value injection
  const randomCppCode = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixel(1, 6);
    void setup() {
      pixel.begin();
    }
    void loop() {
      pixel.setPixelColor(0, random(50, 100), random(200), 0);
      pixel.show();
    }
  `.trim();
  const randParsed = parseNeoPixelColors(randomCppCode, 6, 1);
  if (!randParsed) {
    console.error("FAIL: Random generator parse returned null");
    passed = false;
  } else {
    const p = randParsed.pixels[0];
    if (p.r < 50 || p.r >= 100 || p.g < 0 || p.g >= 200 || p.b !== 0) {
      console.error("FAIL: Random values out of bounds:", p);
      passed = false;
    } else {
      console.log("=> random() dynamic generation PASSED");
    }
  }

  // 5. Test sequential assignments (b += 5, etc.)
  const assignCppCode = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixel(1, 6);
    void setup() {
      pixel.begin();
    }
    void loop() {
      int b = 100;
      b += 50;
      pixel.setBrightness(b);
      pixel.show();
    }
  `.trim();
  const assignParsed = parseNeoPixelColors(assignCppCode, 6, 1);
  if (!assignParsed || assignParsed.brightness !== 150) {
    console.error("FAIL: Sequential variable assignment failed:", assignParsed);
    passed = false;
  } else {
    console.log("=> Sequential assignments (+=, -=, etc.) PASSED");
  }

  // 6. Test Chain Discovery & Voltage/Power Validation
  const unoNode: CircuitNode = {
    id: "uno1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "arduino", simulationModel: "arduino", label: "Uno", rotation: 0, properties: {} as any },
  };

  const p1Node: CircuitNode = {
    id: "pix1",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: { componentType: "neopixel", simulationModel: "neopixel", label: "Pixel 1", rotation: 0, properties: {} as any },
  };

  const p2Node: CircuitNode = {
    id: "pix2",
    type: "circuitComponent",
    position: { x: 300, y: 0 },
    data: { componentType: "neopixel", simulationModel: "neopixel", label: "Pixel 2", rotation: 0, properties: {} as any },
  };

  const edges: CircuitEdge[] = [
    // Signal chain: uno -> pix1 -> pix2
    { id: "e1", source: "uno1", sourceHandle: "d6", target: "pix1", targetHandle: "in" },
    { id: "e2", source: "pix1", sourceHandle: "out", target: "pix2", targetHandle: "in" },

    // Power connections for Pix1
    { id: "e3", source: "uno1", sourceHandle: "5v", target: "pix1", targetHandle: "vcc1" },
    { id: "e4", source: "uno1", sourceHandle: "gnd1", target: "pix1", targetHandle: "ground1" },

    // Power connections for Pix2 (cascaded from Pix1)
    { id: "e5", source: "pix1", sourceHandle: "vcc2", target: "pix2", targetHandle: "vcc1" },
    { id: "e6", source: "pix1", sourceHandle: "ground2", target: "pix2", targetHandle: "ground1" },
  ];

  useCircuitStore.setState({
    nodes: [unoNode, p1Node, p2Node],
    edges,
    arduinoCode: cppCode,
    picoCode: "",
    simulationStatus: "running",
  });

  const frameRaw = buildSimulationFrame({
    tick: 1,
    timestamp: 50,
    nodes: [unoNode, p1Node, p2Node],
    edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  try {
    const transformed = applyNeoPixelInputToFrame(frameRaw, {
      nodes: [unoNode, p1Node, p2Node],
      edges,
      arduinoCode: cppCode,
      picoCode: "",
      boardType: "arduino",
      dynamicComponents: COMPONENT_CATALOG,
    } as any);

    const comp1 = transformed.components["pix1"];
    const comp2 = transformed.components["pix2"];

    if (!comp1 || !comp1.isPowered || comp1.telemetry.red !== 255 || comp1.telemetry.green !== 0 || comp1.telemetry.blue !== 0) {
      console.error("FAIL: Pixel 1 was not simulated/powered correctly:", comp1);
      passed = false;
    } else if (!comp2 || !comp2.isPowered || comp2.telemetry.red !== 0 || comp2.telemetry.green !== 255 || comp2.telemetry.blue !== 0) {
      console.error("FAIL: Pixel 2 was not simulated/powered correctly:", comp2);
      passed = false;
    } else {
      console.log("=> Arduino Chain Discovery & State Mapping tests PASSED");
    }
  } catch (e) {
    console.error("FAIL: applyNeoPixelInputToFrame threw an error:", e);
    passed = false;
  }

  // 7. Test Cascading Signal Drop (Power block)
  // Disconnect power connection to Pix1
  const edgesUnpowered = edges.filter(e => e.id !== "e3");
  useCircuitStore.setState({
    nodes: [unoNode, p1Node, p2Node],
    edges: edgesUnpowered,
    arduinoCode: cppCode,
    picoCode: "",
    simulationStatus: "running",
  });

  const frameRawUnpowered = buildSimulationFrame({
    tick: 2,
    timestamp: 100,
    nodes: [unoNode, p1Node, p2Node],
    edges: edgesUnpowered,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  try {
    const transformed = applyNeoPixelInputToFrame(frameRawUnpowered, {
      nodes: [unoNode, p1Node, p2Node],
      edges: edgesUnpowered,
      arduinoCode: cppCode,
      picoCode: "",
      boardType: "arduino",
      dynamicComponents: COMPONENT_CATALOG,
    } as any);

    const comp1 = transformed.components["pix1"];
    const comp2 = transformed.components["pix2"];

    if (comp1?.isPowered) {
      console.error("FAIL: Pixel 1 should have been unpowered");
      passed = false;
    } else if (comp2?.isPowered || comp2?.telemetry?.error !== "Broken Chain (Upstream Pixel Unpowered)") {
      console.error("FAIL: Pixel 2 should have blocked data due to upstream failure:", comp2);
      passed = false;
    } else {
      console.log("=> Cascading Failure / Signal Block tests PASSED");
    }
  } catch (e) {
    console.error("FAIL: applyNeoPixelInputToFrame (cascading check) threw an error:", e);
    passed = false;
  }

  // 8. Test Uninitialized frame warnings mapping
  useCircuitStore.setState({
    nodes: [unoNode, p1Node, p2Node],
    edges,
    arduinoCode: uninitializedCppCode,
    picoCode: "",
    simulationStatus: "running",
  });
  const uninitFrameRaw = buildSimulationFrame({
    tick: 3,
    timestamp: 150,
    nodes: [unoNode, p1Node, p2Node],
    edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });
  try {
    const transformed = applyNeoPixelInputToFrame(uninitFrameRaw, {
      nodes: [unoNode, p1Node, p2Node],
      edges,
      arduinoCode: uninitializedCppCode,
      picoCode: "",
      boardType: "arduino",
      dynamicComponents: COMPONENT_CATALOG,
    } as any);
    const comp1 = transformed.components["pix1"];
    if (comp1?.isPowered || comp1?.telemetry?.error !== "NeoPixel not initialized. Call begin() in setup().") {
      console.error("FAIL: Transformer did not apply uninitialized warning error message correctly:", comp1);
      passed = false;
    } else {
      console.log("=> Uninitialized Transformer Warning mapping PASSED");
    }
  } catch (e) {
    console.error("FAIL: Uninitialized warning check threw:", e);
    passed = false;
  }

  // 9. Test Delay Slicing Animation mapping (Second user code example)
  const delayCppCode = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixel(1, 6);
    void setup() {
      pixel.begin();
    }
    void loop() {
      pixel.setPixelColor(0, pixel.Color(255,255,255));
      pixel.show();
      delay(500);

      pixel.clear();
      pixel.show();
      delay(500);
    }
  `.trim();

  // Test state at timestamp = 200 (should be White)
  useCircuitStore.setState({
    nodes: [unoNode, p1Node],
    edges: [
      { id: "e1", source: "uno1", sourceHandle: "d6", target: "pix1", targetHandle: "in" },
      { id: "e3", source: "uno1", sourceHandle: "5v", target: "pix1", targetHandle: "vcc1" },
      { id: "e4", source: "uno1", sourceHandle: "gnd1", target: "pix1", targetHandle: "ground1" },
    ],
    arduinoCode: delayCppCode,
    picoCode: "",
    simulationStatus: "running",
  });

  const frameT200 = buildSimulationFrame({
    tick: 4,
    timestamp: 200,
    nodes: [unoNode, p1Node],
    edges: useCircuitStore.getState().edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  const frameT700 = buildSimulationFrame({
    tick: 5,
    timestamp: 700,
    nodes: [unoNode, p1Node],
    edges: useCircuitStore.getState().edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  try {
    const t200Transformed = applyNeoPixelInputToFrame(frameT200, {
      nodes: [unoNode, p1Node],
      edges: useCircuitStore.getState().edges,
      arduinoCode: delayCppCode,
      picoCode: "",
      boardType: "arduino",
      dynamicComponents: COMPONENT_CATALOG,
    } as any);

    const t700Transformed = applyNeoPixelInputToFrame(frameT700, {
      nodes: [unoNode, p1Node],
      edges: useCircuitStore.getState().edges,
      arduinoCode: delayCppCode,
      picoCode: "",
      boardType: "arduino",
      dynamicComponents: COMPONENT_CATALOG,
    } as any);

    const p200 = t200Transformed.components["pix1"];
    const p700 = t700Transformed.components["pix1"];

    if (!p200 || p200.telemetry.red !== 255 || p200.telemetry.green !== 255 || p200.telemetry.blue !== 255) {
      console.error("FAIL: Time-sliced segment at 200ms was not white:", p200);
      passed = false;
    } else if (!p700 || p700.telemetry.red !== 0 || p700.telemetry.green !== 0 || p700.telemetry.blue !== 0) {
      console.error("FAIL: Time-sliced segment at 700ms was not cleared/black:", p700);
      passed = false;
    } else {
      console.log("=> Delay Slicing and Multi-Segment Animation PASSED");
    }
  } catch (e) {
    console.error("FAIL: Delay slicing check threw:", e);
    passed = false;
  }

  // 10. Test Pico MicroPython simulation with random.randint and subscript constraints
  const picoTestCode = `
from machine import Pin
from neopixel import NeoPixel
import random
import time

np = NeoPixel(Pin(15), 1)

while True:
    np[0] = (255, 0, 0)
    np[1] = (0, 255, 0) # Should be safely ignored
    np.write()
    time.sleep(0.5)
  `.trim();

  const picoNode: CircuitNode = {
    id: "pico1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "raspberrypipico", simulationModel: "raspberrypipico", label: "Pico", rotation: 0, properties: {} as any },
  };

  const picoPixelNode: CircuitNode = {
    id: "pixPico",
    type: "circuitComponent",
    position: { x: 200, y: 0 },
    data: { componentType: "neopixel", simulationModel: "neopixel", label: "Pixel 1", rotation: 0, properties: {} as any },
  };

  useCircuitStore.setState({
    nodes: [picoNode, picoPixelNode],
    edges: [
      { id: "pe1", source: "pico1", sourceHandle: "gp15", target: "pixPico", targetHandle: "in" },
      { id: "pe3", source: "pico1", sourceHandle: "pico_3v3", target: "pixPico", targetHandle: "vcc1" },
      { id: "pe4", source: "pico1", sourceHandle: "pico_gnd1", target: "pixPico", targetHandle: "ground1" },
    ],
    arduinoCode: "",
    picoCode: picoTestCode,
    simulationStatus: "running",
  });

  const framePico = buildSimulationFrame({
    tick: 6,
    timestamp: 100,
    nodes: [picoNode, picoPixelNode],
    edges: useCircuitStore.getState().edges,
    boardType: "pico",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  try {
    // Step the MicroPython execution loop so the while True loop statements are executed!
    parsePythonReadOutputsForInput(picoTestCode, 0, false, 50);
    parsePythonReadOutputsForInput(picoTestCode, 0, false, 100);

    const picoTransformed = applyNeoPixelInputToFrame(framePico, {
      nodes: [picoNode, picoPixelNode],
      edges: useCircuitStore.getState().edges,
      arduinoCode: "",
      picoCode: picoTestCode,
      boardType: "pico",
      dynamicComponents: COMPONENT_CATALOG,
    } as any);

    const compPico = picoTransformed.components["pixPico"];
    if (!compPico || compPico.telemetry.red !== 255 || compPico.telemetry.green !== 0 || compPico.telemetry.blue !== 0) {
      console.error("FAIL: Pico MicroPython simulation failed:", compPico);
      passed = false;
    } else {
      console.log("=> Pico MicroPython interpreter simulation PASSED");
    }
  } catch (e) {
    console.error("FAIL: Pico MicroPython check threw:", e);
    passed = false;
  }

  // 11. Test Pico Loop unrolling yielding with list iteration and sleep
  const picoColorsLoopCode = `
from machine import Pin
from neopixel import NeoPixel
import time

np = NeoPixel(Pin(15), 1)

colors = [
    (255,0,0),
    (0,255,0),
    (0,0,255)
]

while True:
    for color in colors:
        np[0] = color
        np.write()
        time.sleep(0.7)
  `.trim();

  try {
    // Chronological Execution Step 1: run at t = 100 (should be Red)
    useCircuitStore.setState({
      nodes: [picoNode, picoPixelNode],
      edges: [
        { id: "pe1", source: "pico1", sourceHandle: "gp15", target: "pixPico", targetHandle: "in" },
        { id: "pe3", source: "pico1", sourceHandle: "pico_3v3", target: "pixPico", targetHandle: "vcc1" },
        { id: "pe4", source: "pico1", sourceHandle: "pico_gnd1", target: "pixPico", targetHandle: "ground1" },
      ],
      arduinoCode: "",
      picoCode: picoColorsLoopCode,
      simulationStatus: "running",
    });

    parsePythonReadOutputsForInput(picoColorsLoopCode, 0, false, 100);
    const frameP100 = buildSimulationFrame({
      tick: 7,
      timestamp: 100,
      nodes: [picoNode, picoPixelNode],
      edges: useCircuitStore.getState().edges,
      boardType: "pico",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const t100Transformed = applyNeoPixelInputToFrame(frameP100, {
      nodes: [picoNode, picoPixelNode],
      edges: useCircuitStore.getState().edges,
      arduinoCode: "",
      picoCode: picoColorsLoopCode,
      boardType: "pico",
      dynamicComponents: COMPONENT_CATALOG,
    } as any);

    // Chronological Execution Step 2: run at t = 800 (should be Green, since first sleep is 700ms)
    parsePythonReadOutputsForInput(picoColorsLoopCode, 0, false, 800);
    const frameP800 = buildSimulationFrame({
      tick: 8,
      timestamp: 800,
      nodes: [picoNode, picoPixelNode],
      edges: useCircuitStore.getState().edges,
      boardType: "pico",
      running: true,
      error: null,
      dynamicComponents: COMPONENT_CATALOG,
    });

    const t800Transformed = applyNeoPixelInputToFrame(frameP800, {
      nodes: [picoNode, picoPixelNode],
      edges: useCircuitStore.getState().edges,
      arduinoCode: "",
      picoCode: picoColorsLoopCode,
      boardType: "pico",
      dynamicComponents: COMPONENT_CATALOG,
    } as any);

    const compP100 = t100Transformed.components["pixPico"];
    const compP800 = t800Transformed.components["pixPico"];

    if (!compP100 || compP100.telemetry.red !== 255 || compP100.telemetry.green !== 0 || compP100.telemetry.blue !== 0) {
      console.error("FAIL: Pico loop unroll at 100ms was not Red:", compP100);
      passed = false;
    } else if (!compP800 || compP800.telemetry.red !== 0 || compP800.telemetry.green !== 255 || compP800.telemetry.blue !== 0) {
      console.error("FAIL: Pico loop unroll at 800ms was not Green:", compP800);
      passed = false;
    } else {
      console.log("=> Pico loop unrolling and sleep yielding PASSED");
    }
  } catch (e) {
    console.error("FAIL: Pico loop unroll check threw:", e);
    passed = false;
  }

  // 12. Test Parallel NeoPixel Branches (both connected to pin 6)
  const parallelEdges: CircuitEdge[] = [
    { id: "pe1", source: "uno1", sourceHandle: "d6", target: "pix1", targetHandle: "in" },
    { id: "pe2", source: "uno1", sourceHandle: "d6", target: "pix2", targetHandle: "in" },

    { id: "pe3", source: "uno1", sourceHandle: "5v", target: "pix1", targetHandle: "vcc1" },
    { id: "pe4", source: "uno1", sourceHandle: "gnd1", target: "pix1", targetHandle: "ground1" },

    { id: "pe5", source: "uno1", sourceHandle: "5v", target: "pix2", targetHandle: "vcc1" },
    { id: "pe6", source: "uno1", sourceHandle: "gnd1", target: "pix2", targetHandle: "ground1" },
  ];

  useCircuitStore.setState({
    nodes: [unoNode, p1Node, p2Node],
    edges: parallelEdges,
    arduinoCode: cppCode,
    picoCode: "",
    simulationStatus: "running",
  });

  const frameParallel = buildSimulationFrame({
    tick: 9,
    timestamp: 100,
    nodes: [unoNode, p1Node, p2Node],
    edges: parallelEdges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG,
  });

  try {
    const transformed = applyNeoPixelInputToFrame(frameParallel, {
      nodes: [unoNode, p1Node, p2Node],
      edges: parallelEdges,
      arduinoCode: cppCode,
      picoCode: "",
      boardType: "arduino",
      dynamicComponents: COMPONENT_CATALOG,
    } as any);

    const comp1 = transformed.components["pix1"];
    const comp2 = transformed.components["pix2"];

    if (!comp1 || comp1.telemetry.red !== 255) {
      console.error("FAIL: Parallel branch pixel 1 failed to glow:", comp1);
      passed = false;
    } else if (!comp2 || comp2.telemetry.red !== 255) {
      console.error("FAIL: Parallel branch pixel 2 failed to glow:", comp2);
      passed = false;
    } else {
      console.log("=> Parallel branches mapping PASSED");
    }
  } catch (e) {
    console.error("FAIL: Parallel branches check threw:", e);
    passed = false;
  }

  // 13. Test Constant-Bound and numPixels()-Bound C++ loops
  const constantCppCode = `
    #include <Adafruit_NeoPixel.h>
    #define NUMPIXELS 5
    #define PIN 6
    Adafruit_NeoPixel pixels(NUMPIXELS, PIN, NEO_GRB + NEO_KHZ800);
    void setup() {
      pixels.begin();
    }
    void loop() {
      // Loop with constant
      for (int i = 0; i < NUMPIXELS; i++) {
        pixels.setPixelColor(i, pixels.Color(255, 0, 0));
      }
      pixels.show();
      delay(500);
      // Loop with numPixels()
      for (int i = 0; i < pixels.numPixels(); i++) {
        pixels.setPixelColor(i, pixels.Color(0, 255, 0));
      }
      pixels.show();
      delay(500);
    }
  `.trim();

  const constantParsed = parseNeoPixelColors(constantCppCode, 6, 5);
  if (!constantParsed) {
    console.error("FAIL: parseNeoPixelColors returned null for constantCppCode");
    passed = false;
  } else {
    const p0 = constantParsed.pixels[0];
    const p4 = constantParsed.pixels[4];
    if (!p0 || p0.g !== 255 || !p4 || p4.g !== 255) {
      console.error("FAIL: Constant-bound and numPixels()-bound loop execution failed to write correct colors:", constantParsed.pixels);
      passed = false;
    } else {
      console.log("=> Constant-bound and numPixels()-bound loop unrolling PASSED");
    }
  }

  console.log("=================== NEOPIXEL REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runNeoPixelTests();
  if (success) {
    console.log("✅ All NeoPixel regression tests passed successfully.");
  } else {
    console.error("❌ Some NeoPixel regression tests failed.");
    process.exit(1);
  }
}
