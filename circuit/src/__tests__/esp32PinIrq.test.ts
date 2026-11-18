/**
 * esp32PinIrq.test.ts
 *
 * Test suite for MicroPython Pin.irq() hardware interrupt support across ESP32 and Pico.
 * Verifies:
 * 1. FALLING, RISING, and BOTH trigger conditions
 * 2. Positional and keyword argument styles: irq(handler, trigger) vs irq(trigger=..., handler=...)
 * 3. Handler correctly receives triggering Pin instance
 * 4. Mutation of global variables via `global` keyword inside handler
 * 5. Edge-triggered behavior (press -> release -> press)
 * 6. No false trigger on simulation start (idle pull-up starts at 1)
 * 7. Raspberry Pi Pico parity
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { getOrCreateSession, parsePythonReadOutputsForInput, clearSimSessions } from "../lib/codeParsing/picoParser";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { applyPicoSimulationToFrame } from "../lib/simulation/frameTransformers/pico";
import { buildSimulationFrame } from "../lib/simulation-state";
import type { CircuitNode, CircuitEdge } from "../lib/types";

function createNode(id: string, type: string, label: string, properties: Record<string, any> = {}): CircuitNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      componentType: type,
      simulationModel: type,
      label,
      rotation: 0,
      properties,
    },
  } as CircuitNode;
}

describe("MicroPython Pin.irq() Hardware Interrupt Support", () => {
  it("FALLING edge: triggers only when pin transitions from HIGH to LOW", () => {
    clearSimSessions();
    const code = `
from machine import Pin

button = Pin(18, Pin.IN, Pin.PULL_UP)
fall_count = 0

def on_fall(p):
    global fall_count
    fall_count = fall_count + 1

button.irq(trigger=Pin.IRQ_FALLING, handler=on_fall)
`;

    const s = getOrCreateSession(code, 0);

    // Boot (t=0): idle pullup is HIGH -> must NOT trigger
    parsePythonReadOutputsForInput(code, 18, true, 0);
    assert.strictEqual(s.variables.get("fall_count"), 0, "Boot must not trigger FALLING interrupt");

    // Still HIGH at t=50 -> no edge -> no trigger
    parsePythonReadOutputsForInput(code, 18, true, 50);
    assert.strictEqual(s.variables.get("fall_count"), 0);

    // Press (HIGH -> LOW) at t=100 -> FALLING edge -> triggers!
    parsePythonReadOutputsForInput(code, 18, false, 100);
    assert.strictEqual(s.variables.get("fall_count"), 1, "Falling edge must increment fall_count");

    // Held LOW at t=150 -> no new edge -> must NOT re-trigger
    parsePythonReadOutputsForInput(code, 18, false, 150);
    assert.strictEqual(s.variables.get("fall_count"), 1, "Holding button down must not re-trigger");

    // Release (LOW -> HIGH) at t=200 -> RISING edge -> must NOT trigger FALLING handler
    parsePythonReadOutputsForInput(code, 18, true, 200);
    assert.strictEqual(s.variables.get("fall_count"), 1, "Release must not trigger FALLING handler");

    // Press again (HIGH -> LOW) at t=300 -> 2nd FALLING edge -> triggers!
    parsePythonReadOutputsForInput(code, 18, false, 300);
    assert.strictEqual(s.variables.get("fall_count"), 2, "Second falling edge must increment fall_count");
  });

  it("RISING edge: triggers only when pin transitions from LOW to HIGH", () => {
    clearSimSessions();
    const code = `
from machine import Pin

button = Pin(19, Pin.IN, Pin.PULL_DOWN)
rise_count = 0

def on_rise(p):
    global rise_count
    rise_count = rise_count + 1

button.irq(trigger=Pin.IRQ_RISING, handler=on_rise)
`;

    const s = getOrCreateSession(code, 0);

    // Boot (t=0): idle pull-down is LOW -> must NOT trigger
    parsePythonReadOutputsForInput(code, 19, false, 0);
    assert.strictEqual(s.variables.get("rise_count"), 0, "Boot must not trigger RISING interrupt");

    // Press (LOW -> HIGH) at t=100 -> RISING edge -> triggers!
    parsePythonReadOutputsForInput(code, 19, true, 100);
    assert.strictEqual(s.variables.get("rise_count"), 1, "Rising edge must increment rise_count");

    // Release (HIGH -> LOW) at t=200 -> FALLING edge -> must NOT trigger
    parsePythonReadOutputsForInput(code, 19, false, 200);
    assert.strictEqual(s.variables.get("rise_count"), 1, "Falling edge must not trigger RISING handler");
  });

  it("BOTH edges: bitwise OR (Pin.IRQ_RISING | Pin.IRQ_FALLING) triggers on both transitions", () => {
    clearSimSessions();
    const code = `
from machine import Pin

button = Pin(4, Pin.IN)
toggle_count = 0

def on_toggle(p):
    global toggle_count
    toggle_count = toggle_count + 1

button.irq(trigger=Pin.IRQ_RISING | Pin.IRQ_FALLING, handler=on_toggle)
`;

    const s = getOrCreateSession(code, 0);
    assert.strictEqual(s.irqs[0]?.trigger, "BOTH", "Bitwise OR must register as BOTH trigger");

    // Boot (t=0): LOW
    parsePythonReadOutputsForInput(code, 4, false, 0);
    assert.strictEqual(s.variables.get("toggle_count"), 0);

    // Press: LOW -> HIGH -> triggers
    parsePythonReadOutputsForInput(code, 4, true, 100);
    assert.strictEqual(s.variables.get("toggle_count"), 1);

    // Release: HIGH -> LOW -> triggers
    parsePythonReadOutputsForInput(code, 4, false, 200);
    assert.strictEqual(s.variables.get("toggle_count"), 2);
  });

  it("Positional arguments: Pin.irq(handler, trigger) standard MicroPython signature", () => {
    clearSimSessions();
    const code = `
from machine import Pin

btn = Pin(18, Pin.IN, Pin.PULL_UP)
triggered = False

def my_callback(p):
    global triggered
    triggered = True

btn.irq(my_callback, Pin.IRQ_FALLING)
`;

    const s = getOrCreateSession(code, 0);
    assert.strictEqual(s.irqs[0]?.handler, "my_callback");
    assert.strictEqual(s.irqs[0]?.trigger, "FALLING");

    parsePythonReadOutputsForInput(code, 18, true, 0);
    assert.strictEqual(s.variables.get("triggered"), false);

    parsePythonReadOutputsForInput(code, 18, false, 100);
    assert.strictEqual(s.variables.get("triggered"), true);
  });

  it("Handler receives triggering Pin object with correct pin number", () => {
    clearSimSessions();
    const code = `
from machine import Pin

btn = Pin(21, Pin.IN, Pin.PULL_UP)
captured_pin_num = None

def handler(target):
    global captured_pin_num
    captured_pin_num = target.pin

btn.irq(trigger=Pin.IRQ_FALLING, handler=handler)
`;

    const s = getOrCreateSession(code, 0);
    parsePythonReadOutputsForInput(code, 21, true, 0);
    parsePythonReadOutputsForInput(code, 21, false, 100);

    assert.strictEqual(s.variables.get("captured_pin_num"), 21);
  });

  it("ESP32 end-to-end: exact user script prints INTERRUPT message in serial output", () => {
    clearSimSessions();
    const userCode = `
from machine import Pin
from time import sleep

button = Pin(18, Pin.IN, Pin.PULL_UP)
pressed = False

def button_interrupt(pin):
    global pressed
    pressed = True

button.irq(trigger=Pin.IRQ_FALLING, handler=button_interrupt)

while True:
    print("Main program running...")
    if pressed:
        print("INTERRUPT: BUTTON PRESSED")
        pressed = False
    sleep(1)
`;

    const espNode = createNode("esp-1", "esp32", "ESP32");
    const btnNode = createNode("btn-1", "pushbutton", "Button", {
      state: { label: "State", type: "string", value: "released" },
    });
    const edges: CircuitEdge[] = [
      { id: "e1", source: "esp-1", sourceHandle: "gpio18", target: "btn-1", targetHandle: "pin1" },
      { id: "e2", source: "btn-1", sourceHandle: "pin2", target: "esp-1", targetHandle: "esp32_gnd1" },
    ];
    const nodes = [espNode, btnNode];

    // Tick 0: Unpressed (pull-up keeps GPIO18 HIGH at 3.3V)
    const frame0 = buildSimulationFrame({ tick: 0, nodes, edges, dynamicComponents: [], boardType: "esp32", running: true });
    (frame0 as any).timestamp = 0;
    const ctx0 = { nodes, edges, arduinoCode: "", picoCode: userCode, dynamicComponents: [], boardType: "esp32", selectedLanguage: "python" };
    applyEsp32SimulationToFrame(frame0, ctx0 as any);

    const s0 = getOrCreateSession(userCode, 0);
    assert.strictEqual(s0.variables.get("pressed"), false, "Must not be pressed at tick 0");

    // Tick 1 (t=100): Button PRESSED (pin pulled to GND -> 0V, FALLING edge)
    btnNode.data.properties.state.value = "pressed";
    const frame1 = buildSimulationFrame({ tick: 1, nodes, edges, dynamicComponents: [], boardType: "esp32", running: true });
    (frame1 as any).timestamp = 100;
    const ctx1 = { nodes, edges, arduinoCode: "", picoCode: userCode, dynamicComponents: [], boardType: "esp32", selectedLanguage: "python" };
    applyEsp32SimulationToFrame(frame1, ctx1 as any);

    const s1 = getOrCreateSession(userCode, 100);
    assert.strictEqual(s1.variables.get("pressed"), true, "Pressed variable must be set to true by interrupt handler");

    // Tick 11 (t=1100): 1s sleep elapsed, while loop executes body
    const frame11 = buildSimulationFrame({ tick: 11, nodes, edges, dynamicComponents: [], boardType: "esp32", running: true });
    (frame11 as any).timestamp = 1100;
    const ctx11 = { nodes, edges, arduinoCode: "", picoCode: userCode, dynamicComponents: [], boardType: "esp32", selectedLanguage: "python" };
    const outFrame11 = applyEsp32SimulationToFrame(frame11, ctx11 as any);

    const serial = outFrame11.serialOutput ?? [];
    const hasInterruptMsg = serial.some((line) => line.includes("INTERRUPT: BUTTON PRESSED"));
    assert.strictEqual(hasInterruptMsg, true, `Serial output must contain "INTERRUPT: BUTTON PRESSED". Got: ${JSON.stringify(serial)}`);
  });

  it("Raspberry Pi Pico: Pin.irq() works with identical semantics", () => {
    clearSimSessions();
    const picoCode = `
from machine import Pin

button = Pin(15, Pin.IN, Pin.PULL_UP)
pico_triggered = False

def pico_cb(p):
    global pico_triggered
    pico_triggered = True

button.irq(trigger=Pin.IRQ_FALLING, handler=pico_cb)
`;

    const picoNode = createNode("pico-1", "raspberrypipico", "Raspberry Pi Pico");
    const btnNode = createNode("btn-1", "pushbutton", "Button", {
      state: { label: "State", type: "string", value: "off" },
    });
    const edges: CircuitEdge[] = [
      { id: "e1", source: "btn-1", sourceHandle: "pin1a", target: "pico-1", targetHandle: "gp15" },
      { id: "e2", source: "btn-1", sourceHandle: "pin2a", target: "pico-1", targetHandle: "pico_gnd1" },
    ];
    const nodes = [picoNode, btnNode];

    // Boot: unpressed
    const frame0 = buildSimulationFrame({ tick: 0, nodes, edges, dynamicComponents: [], boardType: "pico", running: true });
    (frame0 as any).timestamp = 0;
    const ctx0 = { nodes, edges, arduinoCode: "", picoCode, dynamicComponents: [], boardType: "pico", selectedLanguage: "python" };
    applyPicoSimulationToFrame(frame0, ctx0 as any);

    const s = getOrCreateSession(picoCode, 0);
    assert.strictEqual(s.variables.get("pico_triggered"), false);

    // Button pressed (GP15 -> GND)
    btnNode.data.properties.state.value = "on";
    const frame1 = buildSimulationFrame({ tick: 1, nodes, edges, dynamicComponents: [], boardType: "pico", running: true });
    (frame1 as any).timestamp = 100;
    const ctx1 = { nodes, edges, arduinoCode: "", picoCode, dynamicComponents: [], boardType: "pico", selectedLanguage: "python" };
    applyPicoSimulationToFrame(frame1, ctx1 as any);

    assert.strictEqual(s.variables.get("pico_triggered"), true, "Pico Pin.irq() callback must execute and set pico_triggered=true");
  });
});
