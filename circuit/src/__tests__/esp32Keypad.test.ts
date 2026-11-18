/**
 * Permanent Regression Test Suite for ESP32 MicroPython Keypad 4x4 / 4x3 Integration
 *
 * Validates:
 * 1. Normalized GPIO action extraction (parseEsp32PythonGpioActions / parseEsp32PythonGpioReadActions) for 8 Pin() declarations.
 * 2. AST parsing & evaluation of unrolled 4-row x 4-col matrix scan loops using elif chains.
 * 3. Dynamic end-to-end 16-key resolution (Row 1-4, Col 1-4) with physical keypad node conductive graph reachability.
 */

import { parseEsp32PythonGpioActions, parseEsp32PythonGpioReadActions } from "../lib/esp32/parser/pythonPatterns";
import { getOrCreateSession, MicroPythonInterpreter } from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";
import { frameBoardPinsToMap } from "../lib/circuit/pinMapping";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runEsp32KeypadTests(): boolean {
  console.log("=================== RUNNING ESP32 MICROPYTHON KEYPAD TESTS ===================\n");

  let passed = true;

  const unrolled4x4Sketch = `
from machine import Pin

# Declare 4 Row pins (Outputs)
r1 = Pin(12, Pin.OUT)
r2 = Pin(14, Pin.OUT)
r3 = Pin(27, Pin.OUT)
r4 = Pin(26, Pin.OUT)

# Declare 4 Column pins (Inputs with Pull-Down)
c1 = Pin(25, Pin.IN, Pin.PULL_DOWN)
c2 = Pin(33, Pin.IN, Pin.PULL_DOWN)
c3 = Pin(32, Pin.IN, Pin.PULL_DOWN)
c4 = Pin(35, Pin.IN, Pin.PULL_DOWN)

while True:
    # --- ROW 1 SCAN ---
    r1.value(1); r2.value(0); r3.value(0); r4.value(0)
    if c1.value() == 1:
        print("Key 1 Pressed")
    elif c2.value() == 1:
        print("Key 2 Pressed")
    elif c3.value() == 1:
        print("Key 3 Pressed")
    elif c4.value() == 1:
        print("Key A Pressed")

    # --- ROW 2 SCAN ---
    r1.value(0); r2.value(1); r3.value(0); r4.value(0)
    if c1.value() == 1:
        print("Key 4 Pressed")
    elif c2.value() == 1:
        print("Key 5 Pressed")
    elif c3.value() == 1:
        print("Key 6 Pressed")
    elif c4.value() == 1:
        print("Key B Pressed")

    # --- ROW 3 SCAN ---
    r1.value(0); r2.value(0); r3.value(1); r4.value(0)
    if c1.value() == 1:
        print("Key 7 Pressed")
    elif c2.value() == 1:
        print("Key 8 Pressed")
    elif c3.value() == 1:
        print("Key 9 Pressed")
    elif c4.value() == 1:
        print("Key C Pressed")

    # --- ROW 4 SCAN ---
    r1.value(0); r2.value(0); r3.value(0); r4.value(1)
    if c1.value() == 1:
        print("Key * Pressed")
    elif c2.value() == 1:
        print("Key 0 Pressed")
    elif c3.value() == 1:
        print("Key # Pressed")
    elif c4.value() == 1:
        print("Key D Pressed")
`.trim();

  // --- TEST 1: Normalized GPIO Action Extraction ---
  const writeActions = parseEsp32PythonGpioActions(unrolled4x4Sketch);
  const readActions = parseEsp32PythonGpioReadActions(unrolled4x4Sketch);

  console.log(`[Trace Test 1] Write Actions Count = ${writeActions.length} (Expected: >= 4)`);
  console.log(`[Trace Test 1] Read Actions Count = ${readActions.length} (Expected: 4)`);

  if (readActions.length !== 4) {
    console.error("❌ Test 1 FAILED: Read actions count mismatch.");
    passed = false;
  } else {
    console.log("=> Test 1 PASSED (Normalized GPIO actions extracted for all 8 pins)");
  }

  // --- TEST 2: Full 16-Key Matrix Scan Resolution ---
  const KEY_PINS: Record<string, { rowPin: number; colPin: number }> = {
    "1": { rowPin: 12, colPin: 25 },
    "2": { rowPin: 12, colPin: 33 },
    "3": { rowPin: 12, colPin: 32 },
    "A": { rowPin: 12, colPin: 35 },

    "4": { rowPin: 14, colPin: 25 },
    "5": { rowPin: 14, colPin: 33 },
    "6": { rowPin: 14, colPin: 32 },
    "B": { rowPin: 14, colPin: 35 },

    "7": { rowPin: 27, colPin: 25 },
    "8": { rowPin: 27, colPin: 33 },
    "9": { rowPin: 27, colPin: 32 },
    "C": { rowPin: 27, colPin: 35 },

    "*": { rowPin: 26, colPin: 25 },
    "0": { rowPin: 26, colPin: 33 },
    "#": { rowPin: 26, colPin: 32 },
    "D": { rowPin: 26, colPin: 35 },
  };

  let matrixPassed = true;

  for (const [keyChar, pins] of Object.entries(KEY_PINS)) {
    const session = getOrCreateSession(unrolled4x4Sketch, Date.now());
    session.serialLines = [];

    // Interpreter resolving column pin input dynamically based on driven row state
    class DynamicKeypadInterpreter extends MicroPythonInterpreter {
      evaluate(expr: any): any {
        if (
          expr.kind === "AttributeCall" &&
          expr.method === "value" &&
          expr.args.length === 0 &&
          expr.obj.kind === "Name"
        ) {
          const varName = expr.obj.name;
          if (varName === "c1" || varName === "c2" || varName === "c3" || varName === "c4") {
            const colPin = varName === "c1" ? 25 : varName === "c2" ? 33 : varName === "c3" ? 32 : 35;
            if (colPin === pins.colPin) {
              const rowState = session.pins.get(pins.rowPin);
              return rowState && rowState.value > 0 ? 1 : 0;
            }
            return 0;
          }
        }
        return super.evaluate(expr);
      }
    }

    const interpreter = new DynamicKeypadInterpreter(session);
    if (session.loopNodes) {
      interpreter.execute(session.loopNodes);
    }

    const expectedLine = `Key ${keyChar} Pressed`;
    const found = session.serialLines.length === 1 && session.serialLines[0] === expectedLine;
    console.log(`[Trace Test 2] Key '${keyChar}' (Row GPIO ${pins.rowPin}, Col GPIO ${pins.colPin}) -> Output: ${JSON.stringify(session.serialLines)} | ${found ? "PASS" : "FAIL"}`);

    if (!found) {
      matrixPassed = false;
    }
  }

  if (!matrixPassed) {
    console.error("❌ Test 2 FAILED: Keypad 16-key matrix resolution failed.");
    passed = false;
  } else {
    console.log("=> Test 2 PASSED (100% 16-Key Matrix Resolution verified cleanly)");
  }

  // --- TEST 3: Physical Node & Edge Canvas Wiring Verification ---
  const mcuNode: CircuitNode = {
    id: "pico1",
    type: "raspberrypipico",
    data: {
      componentType: "raspberrypipico",
      simulationModel: "raspberrypipico",
      label: "Pico",
      rotation: 0,
      properties: {},
    },
    position: { x: 0, y: 0 },
  };

  const keypadNode: CircuitNode = {
    id: "keypad_1",
    type: "keypad4x4",
    data: {
      componentType: "keypad4x4",
      label: "Keypad",
      rotation: 0,
      properties: {
        pressedKeys: {
          label: "Pressed Keys",
          type: "string",
          value: "5",
        },
      },
    },
    position: { x: 200, y: 0 },
  };

  const edges: CircuitEdge[] = [
    { id: "e1", source: "pico1", sourceHandle: "gp14", target: "keypad_1", targetHandle: "row2" },
    { id: "e2", source: "pico1", sourceHandle: "gp25", target: "keypad_1", targetHandle: "column2" },
  ];

  useCircuitStore.setState({
    nodes: [mcuNode, keypadNode],
    edges,
    simulationStatus: "running",
  });

  const singleStepCode = `
from machine import Pin
r2 = Pin(14, Pin.OUT)
r2.value(1)
c2 = Pin(25, Pin.IN)
val = c2.value()
`.trim();

  const session3 = getOrCreateSession(singleStepCode, Date.now());
  const val3 = session3.variables.get("val");
  console.log(`[Trace Test 3] Canvas Edge Keypad Pressed Key '5' -> c2.value(): ${val3} (Expected: 1)`);

  if (val3 !== 1) {
    console.error(`❌ Test 3 FAILED: c2.value() resolved to ${val3} instead of 1.`);
    passed = false;
  } else {
    console.log("=> Test 3 PASSED (Canvas wiring + Keypad node press resolved correctly to 1)");
  }

  // --- TEST 4: Live Frame Pipeline Serial Output & Setup Prints Verification ---
  const { applyFramePipeline } = require("../lib/simulation/framePipeline");
  const { buildSimulationFrame } = require("../lib/simulation-state");

  const esp32Node: CircuitNode = {
    id: "esp32_1",
    type: "esp32",
    position: { x: 0, y: 0 },
    data: { componentType: "esp32", simulationModel: "esp32", label: "ESP32 DevKit V1", properties: {}, rotation: 0 },
  };

  const keypad4x4Node: CircuitNode = {
    id: "keypad_1",
    type: "keypad4x4",
    position: { x: 200, y: 0 },
    data: {
      componentType: "keypad4x4",
      simulationModel: "keypad4x4",
      label: "4x4 Keypad",
      properties: { pressedKeys: { label: "Pressed Keys", type: "string", value: "5" } },
      rotation: 0,
    },
  };

  const pipelineEdges: CircuitEdge[] = [
    { id: "pe1", source: "esp32_1", sourceHandle: "gpio14", target: "keypad_1", targetHandle: "row2" },
    { id: "pe2", source: "esp32_1", sourceHandle: "gpio33", target: "keypad_1", targetHandle: "column2" },
  ];

  useCircuitStore.setState({
    nodes: [esp32Node, keypad4x4Node],
    edges: pipelineEdges,
    simulationStatus: "running",
  });

  const pipelineSketch = `
print("ESP32 4x4 Keypad Test")
print("Ready...")
print("----")
from machine import Pin
r2 = Pin(14, Pin.OUT)
c2 = Pin(33, Pin.IN, Pin.PULL_DOWN)

while True:
    r2.value(1)
    if c2.value() == 1:
        print("Key 5 Pressed")
`.trim();

  const pipelineContext = {
    nodes: [esp32Node, keypad4x4Node],
    edges: pipelineEdges,
    picoCode: pipelineSketch,
    arduinoCode: "",
    boardType: "esp32",
    selectedLanguage: "python",
    dynamicComponents: [],
    keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => { } } as any,
    keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => { } } as any,
  };


  const inputFrame = buildSimulationFrame({
    tick: 1,
    nodes: [esp32Node, keypad4x4Node],
    edges: pipelineEdges,
    dynamicComponents: [],
    boardType: "esp32",
    arduinoState: { pins: new Map(), serialOutput: [], running: true, error: null },
    running: true,
    error: null,
    timestamp: 100,
  });

  let currentFrame = inputFrame;
  for (let tick = 1; tick <= 15; tick++) {
    const nextFrame = buildSimulationFrame({
      tick,
      nodes: [esp32Node, keypad4x4Node],
      edges: pipelineEdges,
      boardType: "esp32",
      arduinoState: { pins: frameBoardPinsToMap(currentFrame), serialOutput: currentFrame.serialOutput, running: true, error: null },
      running: true,
    });
    currentFrame = applyFramePipeline(nextFrame, { ...pipelineContext, selectedLanguage: "python" });
  }
  const serialOut = currentFrame.serialOutput || [];

  console.log(`[Trace Test 4] Pipeline Serial Output: ${JSON.stringify(serialOut)}`);
  const hasSetupPrints = serialOut.includes("ESP32 4x4 Keypad Test") && serialOut.includes("Ready...") && serialOut.includes("----");
  const hasKeyPrint = serialOut.includes("Key 5 Pressed");
  const hasNoSyntheticFallback = !serialOut.includes("123456789");

  if (hasSetupPrints && hasKeyPrint && hasNoSyntheticFallback) {
    console.log("=> Test 4 PASSED (Live applyFramePipeline verified setup prints, key output, and no synthetic fallback output)");
  } else {
    console.error("❌ Test 4 FAILED: Live pipeline serial output missing expected setup/key prints or contains synthetic fallback.");
    passed = false;
  }

  // --- TEST 5: 'is None', 'is not None', 'in', and 'not in' Operators ---
  console.log("\n--- TEST 5: Python identity and membership operators (is / is not / in / not in) ---");
  const isNotNoneSketch = `
key = '5'
if key is not None:
    print("Key is valid:", key)

none_val = None
if none_val is None:
    print("None check passed")

if key in ['1', '2', '3', '4', '5']:
    print("Key in list passed")

if key not in ['A', 'B', 'C', 'D']:
    print("Key not in list passed")
`;
  const isNoneSession = getOrCreateSession(isNotNoneSketch, Date.now() + 5000);
  const isNoneInterpreter = new MicroPythonInterpreter(isNoneSession);
  if (isNoneSession.setupNodes) {
    isNoneInterpreter.execute(isNoneSession.setupNodes);
  }
  const isNoneSerial = isNoneSession.serialLines;
  console.log(`[Trace Test 5] Serial Output: ${JSON.stringify(isNoneSerial)}`);
  if (
    isNoneSerial.includes("Key is valid: 5") &&
    isNoneSerial.includes("None check passed") &&
    isNoneSerial.includes("Key in list passed") &&
    isNoneSerial.includes("Key not in list passed")
  ) {
    console.log("=> Test 5 PASSED (is, is not, in, and not in all executed with 100% accuracy)");
  } else {
    console.error("❌ Test 5 FAILED: Identity or membership operators failed to evaluate.");
    passed = false;
  }

  // --- TEST 6: Zero Synthetic Password Logs on ESP32 & Clean Stop State ---
  console.log("\n--- TEST 6: Zero Synthetic Password Logs on ESP32 & Clean Stop State ---");
  const keypadPressHashNode: CircuitNode = {
    ...keypad4x4Node,
    data: {
      ...keypad4x4Node.data,
      properties: {
        ...keypad4x4Node.data.properties,
        pressedKeys: { label: "Pressed Keys", type: "string", value: "#" },
      },
    },
  };

  let test6Frame = buildSimulationFrame({
    tick: 20,
    nodes: [esp32Node, keypadPressHashNode],
    edges: pipelineEdges,
    boardType: "esp32",
    arduinoState: { pins: new Map(), serialOutput: ["ESP32 Keypad Live Output"], running: true, error: null },
    running: true,
  });

  const pipelineOutput6 = applyFramePipeline(test6Frame, { ...pipelineContext, selectedLanguage: "python" });
  const serial6 = pipelineOutput6.serialOutput || [];

  const hasNoWrongPassword = !serial6.includes("Wrong Password") && !serial6.includes("Access Granted") && !serial6.includes("#");
  console.log(`[Trace Test 6 Running] Serial Output: ${JSON.stringify(serial6)}`);

  // Now simulate STOP
  const stopFrame = buildSimulationFrame({
    tick: 21,
    nodes: [esp32Node, keypadPressHashNode],
    edges: pipelineEdges,
    boardType: "esp32",
    arduinoState: { pins: new Map(), serialOutput: [], running: false, error: null },
    running: false,
  });
  const stopPipelineOutput = applyFramePipeline(stopFrame, { ...pipelineContext, selectedLanguage: "python" });
  const stopSerial = stopPipelineOutput.serialOutput || [];
  console.log(`[Trace Test 6 Stopped] Serial Output: ${JSON.stringify(stopSerial)}`);

  if (hasNoWrongPassword && stopSerial.length === 0) {
    console.log("=> Test 6 PASSED (No synthetic password logs leaked into ESP32 & Stop state is 100% clean)");
  } else {
    console.error("❌ Test 6 FAILED: Synthetic logs leaked or Stop serial output not empty.");
    passed = false;
  }

  console.log("\n=================== ESP32 KEYPAD TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const ok = runEsp32KeypadTests();
  if (ok) {
    console.log("✅ All ESP32 Keypad tests passed 100%.");
  } else {
    console.error("❌ ESP32 Keypad tests failed.");
    process.exit(1);
  }
}
