/**
 * End-to-End Test Suite for ESP32 GPIO Output: ESP32 + LED + Resistor + GND
 * Verifies LED telemetry is lit and pathBlocked is false for both C++ and MicroPython.
 */

import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { NE555StateManager, CapacitorStateManager, KeypadStateManager } from "../lib/simulation/stateMaps";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runEsp32GpioEndToEndTests(): boolean {
  let passed = true;

  const ne555State = new NE555StateManager();
  const capacitorState = new CapacitorStateManager();
  const keypad4x4State = new KeypadStateManager();
  const keypad4x3State = new KeypadStateManager();

  // 1. Setup Canvas Nodes: ESP32 + LED + Resistor
  const esp32Node: CircuitNode = {
    id: "esp32_1",
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

  const ledNode: CircuitNode = {
    id: "led_1",
    type: "led",
    position: { x: 100, y: 0 },
    data: {
      componentType: "led",
      simulationModel: "led",
      label: "Red LED",
      properties: { color: { label: "Color", type: "select", value: "red" } },
      rotation: 0,
    },
  };

  const resistorNode: CircuitNode = {
    id: "resistor_1",
    type: "resistor",
    position: { x: 200, y: 0 },
    data: {
      componentType: "resistor",
      simulationModel: "resistor",
      label: "220Ω Resistor",
      properties: { resistance: { label: "Resistance", type: "number", value: 220 } },
      rotation: 0,
    },
  };

  // 2. Connect: ESP32:gpio2 -> LED:anode, LED:cathode -> Resistor:pin1, Resistor:pin2 -> ESP32:esp32_gnd1
  const edges: CircuitEdge[] = [
    { id: "e1", source: "esp32_1", sourceHandle: "gpio2", target: "led_1", targetHandle: "anode", data: { color: "#ff0000" } },
    { id: "e2", source: "led_1", sourceHandle: "cathode", target: "resistor_1", targetHandle: "pin1", data: { color: "#000000" } },
    { id: "e3", source: "resistor_1", sourceHandle: "pin2", target: "esp32_1", targetHandle: "esp32_gnd1", data: { color: "#000000" } },
  ];

  const nodes = [esp32Node, ledNode, resistorNode];

  // ── TEST A: Arduino C++ End-to-End ──
  const cppCode = `
    void setup() {
      pinMode(2, OUTPUT);
      digitalWrite(2, HIGH);
    }
  `;

  const frameCpp: any = {
    running: true,
    tick: 1,
    timestamp: 100,
    boardType: "esp32",
    boardPins: [],
    components: {},
    nodes,
    edges,
  };

  const contextCpp: any = {
    nodes,
    edges,
    arduinoCode: cppCode,
    picoCode: "",
    boardType: "esp32",
    selectedLanguage: "cpp",
    dynamicComponents: [],
    ne555State,
    capacitorState,
    keypad4x4State,
    keypad4x3State,
  };

  const frameCpp1 = applyFramePipeline(frameCpp, contextCpp);
  const frameCpp2 = applyFramePipeline({ ...frameCpp1, tick: 2, timestamp: 200 }, contextCpp);
  const ledCompCpp = frameCpp2.components["led_1"];

  if (!ledCompCpp) {
    console.error("FAIL C++ E2E: LED component missing from pipeline output!");
    passed = false;
  } else {
    const isPowered = ledCompCpp.isPowered === true;
    const pathBlocked = ledCompCpp.telemetry?.pathBlocked === true;

    if (!isPowered || pathBlocked) {
      console.error("FAIL C++ E2E: LED telemetry invalid", { isPowered, pathBlocked, ledCompCpp });
      passed = false;
    } else {
      console.log("✅ [PASS] C++ E2E: ESP32 GPIO2 HIGH successfully powered LED with pathBlocked = false.");
    }
  }

  // ── TEST B: MicroPython End-to-End ──
  const pythonCode = `
from machine import Pin
led = Pin(2, Pin.OUT)
led.value(1)
`;

  const framePy: any = {
    running: true,
    tick: 1,
    timestamp: 100,
    boardType: "esp32",
    boardPins: [],
    components: {},
    nodes,
    edges,
  };

  const contextPy: any = {
    nodes,
    edges,
    arduinoCode: "",
    picoCode: pythonCode,
    boardType: "esp32",
    selectedLanguage: "python",
    dynamicComponents: [],
    ne555State,
    capacitorState,
    keypad4x4State,
    keypad4x3State,
  };

  const framePy1 = applyFramePipeline(framePy, contextPy);
  const framePy2 = applyFramePipeline({ ...framePy1, tick: 2, timestamp: 200 }, contextPy);
  const ledCompPy = framePy2.components["led_1"];

  if (!ledCompPy) {
    console.error("FAIL MicroPython E2E: LED component missing from pipeline output!");
    passed = false;
  } else {
    const isPowered = ledCompPy.isPowered === true;
    const pathBlocked = ledCompPy.telemetry?.pathBlocked === true;

    if (!isPowered || pathBlocked) {
      console.error("FAIL MicroPython E2E: LED telemetry invalid", { isPowered, pathBlocked, ledCompPy });
      passed = false;
    } else {
      console.log("✅ [PASS] MicroPython E2E: ESP32 GPIO2 HIGH successfully powered LED with pathBlocked = false.");
    }
  }

  // ── TEST C: Input-Only Pin (GPIO34) Configured as OUTPUT ──
  console.log("\n--- TEST C: Input-Only Pin (GPIO 34) Configured as OUTPUT ---");
  const edgesInputOnly: CircuitEdge[] = [
    { id: "e1_34", source: "esp32_1", sourceHandle: "gpio34", target: "led_1", targetHandle: "anode", data: { color: "#ff0000" } },
    { id: "e2_34", source: "led_1", sourceHandle: "cathode", target: "resistor_1", targetHandle: "pin1", data: { color: "#000000" } },
    { id: "e3_34", source: "resistor_1", sourceHandle: "pin2", target: "esp32_1", targetHandle: "esp32_gnd1", data: { color: "#000000" } },
  ];

  const inputOnlyOutCode = `
from machine import Pin
led = Pin(34, Pin.OUT)
led.value(1)
  `.trim();

  const frameInputOnly: any = {
    running: true,
    tick: 1,
    timestamp: 100,
    boardType: "esp32",
    boardPins: [],
    components: {},
    nodes,
    edges: edgesInputOnly,
  };

  const contextInputOnly: any = {
    nodes,
    edges: edgesInputOnly,
    arduinoCode: "",
    picoCode: inputOnlyOutCode,
    boardType: "esp32",
    selectedLanguage: "python",
    dynamicComponents: [],
    ne555State,
    capacitorState,
    keypad4x4State,
    keypad4x3State,
  };

  const frameInputOnly1 = applyFramePipeline(frameInputOnly, contextInputOnly);
  const frameInputOnly2 = applyFramePipeline({ ...frameInputOnly1, tick: 2, timestamp: 200 }, contextInputOnly);
  const ledCompInputOnly = frameInputOnly2.components["led_1"];
  const serialInputOnly = frameInputOnly2.serialOutput || [];

  console.log(`[Trace Test C] Serial Output: ${JSON.stringify(serialInputOnly)}`);
  const hasValueError = serialInputOnly.some((line: string) =>
    line.includes("ValueError: Pin(34) doesn't have an output driver")
  );
  const ledIsNotPowered = !ledCompInputOnly || ledCompInputOnly.isPowered !== true;

  if (hasValueError && ledIsNotPowered) {
    console.log("✅ [PASS] Input-Only Pin (GPIO34) correctly raised ValueError and did NOT power the connected LED.");
  } else {
    console.error("❌ [FAIL] Input-Only Pin (GPIO34) did not surface ValueError or erroneously powered LED", {
      hasValueError,
      ledIsNotPowered,
      ledCompInputOnly,
    });
    passed = false;
  }

  // ── TEST D: Input-Only Pin (GPIO34) Configured as INPUT ──
  console.log("\n--- TEST D: Input-Only Pin (GPIO 34) Configured as INPUT ---");
  const inputOnlyInCode = `
from machine import Pin
btn = Pin(34, Pin.IN)
val = btn.value()
print("Pin 34 read:", val)
  `.trim();

  const frameInputIn1 = applyFramePipeline(frameInputOnly, { ...contextInputOnly, picoCode: inputOnlyInCode });
  const frameInputIn2 = applyFramePipeline({ ...frameInputIn1, tick: 2, timestamp: 200 }, { ...contextInputOnly, picoCode: inputOnlyInCode });
  const serialInputIn = frameInputIn2.serialOutput || [];

  console.log(`[Trace Test D] Serial Output: ${JSON.stringify(serialInputIn)}`);
  const hasNoValueError = !serialInputIn.some((line: string) => line.includes("ValueError"));
  const hasReadOutput = serialInputIn.includes("Pin 34 read: 0");

  if (hasNoValueError && hasReadOutput) {
    console.log("✅ [PASS] Input-Only Pin (GPIO34) as Pin.IN works cleanly without errors.");
  } else {
    console.error("❌ [FAIL] Input-Only Pin (GPIO34) as Pin.IN failed", { hasNoValueError, hasReadOutput, serialInputIn });
    passed = false;
  }

  return passed;
}

if (require.main === module) {
  const ok = runEsp32GpioEndToEndTests();
  if (ok) {
    console.log("✅ All ESP32 GPIO End-to-End tests passed.");
  } else {
    console.error("❌ ESP32 GPIO End-to-End tests failed.");
    process.exit(1);
  }
}
