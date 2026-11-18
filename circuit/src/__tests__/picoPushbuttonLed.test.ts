/**
 * Permanent Regression Test Suite for MicroPython Pico Pushbutton + LED Integration
 * 
 * Verifies live multi-frame button press/release toggling:
 * - Frame 1 (OFF / Released): button.value() = 1 (PULL_UP high), LED output = 0V (OFF)
 * - Frame 2 (ON / Pressed):  button.value() = 0 (GND pulled low), LED output = 3.3V (ON)
 * - Frame 3 (OFF / Released): button.value() = 1 (PULL_UP high), LED output = 0V (OFF)
 */

import { applyPicoSimulationToFrame } from "../lib/simulation/frameTransformers/pico";
import { buildSimulationFrame } from "../lib/simulation-state";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { COMPONENT_CATALOG } from "../lib/circuit-components";

export function runPicoPushbuttonTest(): boolean {
  console.log("=================== RUNNING PICO PUSHBUTTON + LED MULTI-FRAME TESTS ===================");

  const picoNode: CircuitNode = {
    id: "pico1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: { componentType: "raspberrypipico", simulationModel: "raspberrypipico", label: "Pico", properties: {}, rotation: 0 },
  };

  const btnNodeOff: CircuitNode = {
    id: "btn1",
    type: "customNode",
    position: { x: 100, y: 0 },
    data: {
      componentType: "pushbutton",
      simulationModel: "pushbutton",
      label: "Pushbutton",
      rotation: 0,
      properties: { state: { label: "State", type: "string", value: "off" } },
    },
  };

  const btnNodeOn: CircuitNode = {
    ...btnNodeOff,
    data: {
      ...btnNodeOff.data,
      properties: { state: { label: "State", type: "string", value: "on" } },
    },
  };

  const ledNode: CircuitNode = {
    id: "led1",
    type: "customNode",
    position: { x: 200, y: 0 },
    data: { componentType: "led", simulationModel: "led", label: "LED", rotation: 0, properties: {} },
  };

  // Edges: btn:pin1a -> pico:gp14, btn:pin2a -> pico:pico_gnd1, led:anode -> pico:gp15, led:cathode -> pico:pico_gnd2
  const edges: CircuitEdge[] = [
    { id: "e1", source: "btn1", target: "pico1", sourceHandle: "pin1a", targetHandle: "gp14" },
    { id: "e2", source: "btn1", target: "pico1", sourceHandle: "pin2a", targetHandle: "pico_gnd1" },
    { id: "e3", source: "led1", target: "pico1", sourceHandle: "anode", targetHandle: "gp15" },
    { id: "e4", source: "led1", target: "pico1", sourceHandle: "cathode", targetHandle: "pico_gnd2" },
  ];

  const picoCode = `
from machine import Pin
import time

button = Pin(14, Pin.IN, Pin.PULL_UP)
led = Pin(15, Pin.OUT)

while True:
    if button.value() == 0:
        led.value(1)
    else:
        led.value(0)
    time.sleep_ms(10)
`.trim();

  let passed = true;

  // --- FRAME 1: Button Released (OFF) ---
  const frame1Raw = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    nodes: [picoNode, btnNodeOff, ledNode],
    edges,
    boardType: "pico",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG as any,
  });
  const frame1Eval = applyPicoSimulationToFrame(frame1Raw, {
    nodes: [picoNode, btnNodeOff, ledNode],
    edges,
    arduinoCode: "",
    picoCode,
    boardType: "pico",
    dynamicComponents: COMPONENT_CATALOG as any,
    ne555State: null as any,
    capacitorState: null as any,
    keypad4x4State: null as any,
    keypad4x3State: null as any,
  });

  const gp15VoltageFrame1 = frame1Eval.components["pico1"]?.pins?.["gp15"]?.voltage ?? 0;
  console.log(`[Trace Frame 1 - Button Released] GP15 LED Voltage = ${gp15VoltageFrame1} V (Expected: 0 V)`);
  if (gp15VoltageFrame1 !== 0) {
    console.error("❌ Frame 1 FAILED: LED lit while button was released");
    passed = false;
  }

  // --- FRAME 2: Button Pressed (ON) ---
  const frame2Raw = buildSimulationFrame({
    tick: 1,
    timestamp: 50,
    nodes: [picoNode, btnNodeOn, ledNode],
    edges,
    boardType: "pico",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG as any,
  });
  const frame2Eval = applyPicoSimulationToFrame(frame2Raw, {
    nodes: [picoNode, btnNodeOn, ledNode],
    edges,
    arduinoCode: "",
    picoCode,
    boardType: "pico",
    dynamicComponents: COMPONENT_CATALOG as any,
    ne555State: null as any,
    capacitorState: null as any,
    keypad4x4State: null as any,
    keypad4x3State: null as any,
  });

  const gp15VoltageFrame2 = frame2Eval.components["pico1"]?.pins?.["gp15"]?.voltage ?? 0;
  console.log(`[Trace Frame 2 - Button Pressed] GP15 LED Voltage = ${gp15VoltageFrame2} V (Expected: 3.3 V)`);
  if (gp15VoltageFrame2 !== 3.3) {
    console.error("❌ Frame 2 FAILED: LED failed to light up when button pressed");
    passed = false;
  }

  // --- FRAME 3: Button Released Again (OFF) ---
  const frame3Raw = buildSimulationFrame({
    tick: 2,
    timestamp: 100,
    nodes: [picoNode, btnNodeOff, ledNode],
    edges,
    boardType: "pico",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG as any,
  });
  const frame3Eval = applyPicoSimulationToFrame(frame3Raw, {
    nodes: [picoNode, btnNodeOff, ledNode],
    edges,
    arduinoCode: "",
    picoCode,
    boardType: "pico",
    dynamicComponents: COMPONENT_CATALOG as any,
    ne555State: null as any,
    capacitorState: null as any,
    keypad4x4State: null as any,
    keypad4x3State: null as any,
  });

  const gp15VoltageFrame3 = frame3Eval.components["pico1"]?.pins?.["gp15"]?.voltage ?? 0;
  console.log(`[Trace Frame 3 - Button Released Again] GP15 LED Voltage = ${gp15VoltageFrame3} V (Expected: 0 V)`);
  if (gp15VoltageFrame3 !== 0) {
    console.error("❌ Frame 3 FAILED: LED failed to turn off after button released");
    passed = false;
  }

  if (passed) {
    console.log("=> Test PASSED (MicroPython button.value() dynamically toggles LED across multiple simulation frames 100% cleanly!)\n");
  }

  return passed;
}

const ok = runPicoPushbuttonTest();
if (!ok) process.exit(1);
