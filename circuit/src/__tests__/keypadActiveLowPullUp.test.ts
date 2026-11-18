import assert from "node:assert";
import { describe, it } from "node:test";
import { getOrCreateSession, clearSimSessions, parsePythonReadOutputsForInput } from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";

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

function createPicoNode(id = "pico_1"): CircuitNode {
  return {
    id,
    type: "raspberrypipico",
    position: { x: 100, y: 100 },
    data: {
      componentType: "raspberrypipico",
      label: "Raspberry Pi Pico",
      simulationModel: "raspberrypipico",
      properties: {},
      rotation: 0,
    },
  };
}

function createKeypadNode(id = "keypad_1", pressedKeys = ""): CircuitNode {
  return {
    id,
    type: "keypad4x4",
    position: { x: 0, y: 100 },
    data: {
      componentType: "keypad4x4",
      label: "Keypad 4x4",
      simulationModel: "keypad4x4",
      properties: {
        pressedKeys: { label: "Pressed Keys", type: "string", value: pressedKeys } as any,
      },
      rotation: 0,
    },
  };
}

const ALL_16_KEYS = [
  "1", "2", "3", "A",
  "4", "5", "6", "B",
  "7", "8", "9", "C",
  "*", "0", "#", "D",
];

export function runKeypadActiveLowPullUpTests(): boolean {
  try {
    const esp32 = createEsp32Node();
    const esp32Edges: CircuitEdge[] = [
      { id: "e_r1", source: "keypad_1", sourceHandle: "row1", target: esp32.id, targetHandle: "gpio13" },
      { id: "e_r2", source: "keypad_1", sourceHandle: "row2", target: esp32.id, targetHandle: "gpio14" },
      { id: "e_r3", source: "keypad_1", sourceHandle: "row3", target: esp32.id, targetHandle: "gpio27" },
      { id: "e_r4", source: "keypad_1", sourceHandle: "row4", target: esp32.id, targetHandle: "gpio26" },
      { id: "e_c1", source: "keypad_1", sourceHandle: "column1", target: esp32.id, targetHandle: "gpio25" },
      { id: "e_c2", source: "keypad_1", sourceHandle: "column2", target: esp32.id, targetHandle: "gpio33" },
      { id: "e_c3", source: "keypad_1", sourceHandle: "column3", target: esp32.id, targetHandle: "gpio32" },
      { id: "e_c4", source: "keypad_1", sourceHandle: "column4", target: esp32.id, targetHandle: "gpio23" },
    ];

    // 1. ESP32 Active-LOW Row Scan + Pin.PULL_UP Column (Key Pressed)
    clearSimSessions();
    const keypadPressed = createKeypadNode("keypad_1", "1");
    useCircuitStore.setState({ nodes: [esp32, keypadPressed], edges: esp32Edges });
    let code = `
from machine import Pin

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_UP), Pin(33, Pin.IN, Pin.PULL_UP), Pin(32, Pin.IN, Pin.PULL_UP), Pin(23, Pin.IN, Pin.PULL_UP)]

for r in rows:
    r.value(1)

rows[0].value(0)
val = cols[0].value()
if val == 0:
    print("Key 1 Detected!")
`;
    let s = getOrCreateSession(code, 100, "esp32");
    assert.ok(s.serialLines.includes("Key 1 Detected!"), "Must detect Key 1 when Row 0 is driven LOW and Col 0 is PULL_UP");

    // 2. ESP32 Active-LOW Row Scan + Pin.PULL_UP Column (Key NOT Pressed)
    clearSimSessions();
    const keypadUnpressed = createKeypadNode("keypad_1", "");
    useCircuitStore.setState({ nodes: [esp32, keypadUnpressed], edges: esp32Edges });
    code = `
from machine import Pin

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_UP), Pin(33, Pin.IN, Pin.PULL_UP), Pin(32, Pin.IN, Pin.PULL_UP), Pin(23, Pin.IN, Pin.PULL_UP)]

for r in rows:
    r.value(1)

rows[0].value(0)
val = cols[0].value()
if val == 0:
    print("False Detection!")
else:
    print("Idle HIGH Verified")
`;
    s = getOrCreateSession(code, 100, "esp32");
    assert.ok(s.serialLines.includes("Idle HIGH Verified"));
    assert.strictEqual(s.serialLines.includes("False Detection!"), false);

    // 3. ESP32 Active-HIGH Row Scan + Pin.PULL_DOWN Column
    clearSimSessions();
    useCircuitStore.setState({ nodes: [esp32, keypadPressed], edges: esp32Edges });
    code = `
from machine import Pin

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_DOWN), Pin(33, Pin.IN, Pin.PULL_DOWN), Pin(32, Pin.IN, Pin.PULL_DOWN), Pin(23, Pin.IN, Pin.PULL_DOWN)]

for r in rows:
    r.value(0)

rows[0].value(1)
val = cols[0].value()
if val == 1:
    print("Key 1 Active-HIGH Detected!")
`;
    s = getOrCreateSession(code, 100, "esp32");
    assert.ok(s.serialLines.includes("Key 1 Active-HIGH Detected!"));

    // 4. Raspberry Pi Pico Active-LOW Row Scan + Pin.PULL_UP Column
    clearSimSessions();
    const pico = createPicoNode();
    const picoEdges: CircuitEdge[] = [
      { id: "p_r1", source: "keypad_1", sourceHandle: "row1", target: pico.id, targetHandle: "gp14" },
      { id: "p_c1", source: "keypad_1", sourceHandle: "column1", target: pico.id, targetHandle: "gp25" },
    ];
    useCircuitStore.setState({ nodes: [pico, keypadPressed], edges: picoEdges });
    code = `
from machine import Pin

r = Pin(14, Pin.OUT)
c = Pin(25, Pin.IN, Pin.PULL_UP)

r.value(1)
r.value(0)
if c.value() == 0:
    print("Pico Key 1 Detected!")
`;
    s = getOrCreateSession(code, 100, "pico");
    assert.ok(s.serialLines.includes("Pico Key 1 Detected!"));

    // 5. Direct GPIO Output LOW acts as Ground for Input Pin.PULL_UP
    clearSimSessions();
    const directWireEdges: CircuitEdge[] = [
      { id: "e_wire", source: esp32.id, sourceHandle: "gpio13", target: esp32.id, targetHandle: "gpio25" },
    ];
    useCircuitStore.setState({ nodes: [esp32], edges: directWireEdges });
    code = `
from machine import Pin

out_pin = Pin(13, Pin.OUT)
in_pin = Pin(25, Pin.IN, Pin.PULL_UP)

out_pin.value(1)
v_high = in_pin.value()

out_pin.value(0)
v_low = in_pin.value()

print("GPIO13=HIGH -> in_pin:", v_high)
print("GPIO13=LOW -> in_pin:", v_low)
`;
    s = getOrCreateSession(code, 100, "esp32");
    assert.ok(s.serialLines.includes("GPIO13=HIGH -> in_pin: 1"));
    assert.ok(s.serialLines.includes("GPIO13=LOW -> in_pin: 0"));

    // 6. Full 16-Key Matrix Verification in Active-LOW + Pin.PULL_UP
    const scanLoopCodeActiveLow = `from machine import Pin
import time

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_UP), Pin(33, Pin.IN, Pin.PULL_UP), Pin(32, Pin.IN, Pin.PULL_UP), Pin(23, Pin.IN, Pin.PULL_UP)]
keys = [
    ['1', '2', '3', 'A'],
    ['4', '5', '6', 'B'],
    ['7', '8', '9', 'C'],
    ['*', '0', '#', 'D']
]

while True:
    for r in range(4):
        for row in rows:
            row.value(1)
        rows[r].value(0)
        for c in range(4):
            if cols[c].value() == 0:
                print("PRESSED:", keys[r][c])
                time.sleep_ms(300)
    time.sleep_ms(20)
`;

    for (const key of ALL_16_KEYS) {
      clearSimSessions();
      const kp = createKeypadNode("keypad_1", key);
      useCircuitStore.setState({ nodes: [esp32, kp], edges: esp32Edges });
      for (let tick = 1; tick <= 8; tick++) {
        parsePythonReadOutputsForInput(scanLoopCodeActiveLow, -1, false, tick * 50, "esp32");
      }
      const session = getOrCreateSession(scanLoopCodeActiveLow, 400, "esp32");
      assert.ok(
        (session.rawSerialLines ?? []).some((l) => l.includes(`PRESSED: ${key}`)),
        `Active-LOW 16-Key test: Key '${key}' must be detected in multi-row scan loop`,
      );
    }

    return true;
  } catch (e) {
    console.error("runKeypadActiveLowPullUpTests failed:", e);
    return false;
  }
}

describe("Active-LOW Matrix Keypad & LOW-Output Voltage Arbitration Tests", () => {
  const esp32 = createEsp32Node();
  const esp32Edges: CircuitEdge[] = [
    { id: "e_r1", source: "keypad_1", sourceHandle: "row1", target: esp32.id, targetHandle: "gpio13" },
    { id: "e_r2", source: "keypad_1", sourceHandle: "row2", target: esp32.id, targetHandle: "gpio14" },
    { id: "e_r3", source: "keypad_1", sourceHandle: "row3", target: esp32.id, targetHandle: "gpio27" },
    { id: "e_r4", source: "keypad_1", sourceHandle: "row4", target: esp32.id, targetHandle: "gpio26" },
    { id: "e_c1", source: "keypad_1", sourceHandle: "column1", target: esp32.id, targetHandle: "gpio25" },
    { id: "e_c2", source: "keypad_1", sourceHandle: "column2", target: esp32.id, targetHandle: "gpio33" },
    { id: "e_c3", source: "keypad_1", sourceHandle: "column3", target: esp32.id, targetHandle: "gpio32" },
    { id: "e_c4", source: "keypad_1", sourceHandle: "column4", target: esp32.id, targetHandle: "gpio23" },
  ];

  it("1. ESP32 Active-LOW Row Scan + Pin.PULL_UP Column (Key Pressed)", () => {
    clearSimSessions();
    const keypadPressed = createKeypadNode("keypad_1", "1");
    useCircuitStore.setState({ nodes: [esp32, keypadPressed], edges: esp32Edges });

    const code = `
from machine import Pin

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_UP), Pin(33, Pin.IN, Pin.PULL_UP), Pin(32, Pin.IN, Pin.PULL_UP), Pin(23, Pin.IN, Pin.PULL_UP)]

for r in rows:
    r.value(1)

rows[0].value(0)
val = cols[0].value()
if val == 0:
    print("Key 1 Detected!")
`;
    const s = getOrCreateSession(code, 100, "esp32");
    assert.ok(s.serialLines.includes("Key 1 Detected!"), "Must detect Key 1 when Row 0 is driven LOW and Col 0 is PULL_UP");
  });

  it("2. ESP32 Active-LOW Row Scan + Pin.PULL_UP Column (Key NOT Pressed)", () => {
    clearSimSessions();
    const keypadUnpressed = createKeypadNode("keypad_1", "");
    useCircuitStore.setState({ nodes: [esp32, keypadUnpressed], edges: esp32Edges });

    const code = `
from machine import Pin

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_UP), Pin(33, Pin.IN, Pin.PULL_UP), Pin(32, Pin.IN, Pin.PULL_UP), Pin(23, Pin.IN, Pin.PULL_UP)]

for r in rows:
    r.value(1)

rows[0].value(0)
val = cols[0].value()
if val == 0:
    print("False Detection!")
else:
    print("Idle HIGH Verified")
`;
    const s = getOrCreateSession(code, 100, "esp32");
    assert.ok(s.serialLines.includes("Idle HIGH Verified"), "Unpressed column must remain pulled up to HIGH (1)");
    assert.strictEqual(s.serialLines.includes("False Detection!"), false, "Must not trigger false detection when unpressed");
  });

  it("3. ESP32 Active-HIGH Row Scan + Pin.PULL_DOWN Column (Preservation Test)", () => {
    clearSimSessions();
    const keypadPressed = createKeypadNode("keypad_1", "1");
    useCircuitStore.setState({ nodes: [esp32, keypadPressed], edges: esp32Edges });

    const code = `
from machine import Pin

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_DOWN), Pin(33, Pin.IN, Pin.PULL_DOWN), Pin(32, Pin.IN, Pin.PULL_DOWN), Pin(23, Pin.IN, Pin.PULL_DOWN)]

for r in rows:
    r.value(0)

rows[0].value(1)
val = cols[0].value()
if val == 1:
    print("Active-HIGH Key 1 Detected!")
`;
    const s = getOrCreateSession(code, 100, "esp32");
    assert.ok(s.serialLines.includes("Active-HIGH Key 1 Detected!"), "Active-HIGH + PULL_DOWN must continue to pass");
  });

  it("4. Raspberry Pi Pico Active-LOW Row Scan + Pin.PULL_UP Column", () => {
    clearSimSessions();
    const pico = createPicoNode();
    const picoEdges: CircuitEdge[] = [
      { id: "pe_r1", source: "keypad_1", sourceHandle: "row1", target: pico.id, targetHandle: "gp13" },
      { id: "pe_r2", source: "keypad_1", sourceHandle: "row2", target: pico.id, targetHandle: "gp14" },
      { id: "pe_r3", source: "keypad_1", sourceHandle: "row3", target: pico.id, targetHandle: "gp27" },
      { id: "pe_r4", source: "keypad_1", sourceHandle: "row4", target: pico.id, targetHandle: "gp26" },
      { id: "pe_c1", source: "keypad_1", sourceHandle: "column1", target: pico.id, targetHandle: "gp20" },
      { id: "pe_c2", source: "keypad_1", sourceHandle: "column2", target: pico.id, targetHandle: "gp21" },
      { id: "pe_c3", source: "keypad_1", sourceHandle: "column3", target: pico.id, targetHandle: "gp22" },
      { id: "pe_c4", source: "keypad_1", sourceHandle: "column4", target: pico.id, targetHandle: "gp28" },
    ];

    const keypadPressed = createKeypadNode("keypad_1", "1");
    useCircuitStore.setState({ nodes: [pico, keypadPressed], edges: picoEdges });

    const code = `
from machine import Pin

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(20, Pin.IN, Pin.PULL_UP), Pin(21, Pin.IN, Pin.PULL_UP), Pin(22, Pin.IN, Pin.PULL_UP), Pin(28, Pin.IN, Pin.PULL_UP)]

for r in rows:
    r.value(1)

rows[0].value(0)
val = cols[0].value()
if val == 0:
    print("Pico Key 1 Detected!")
`;
    const s = getOrCreateSession(code, 100, "pico");
    assert.ok(s.serialLines.includes("Pico Key 1 Detected!"), "Pico must detect Key 1 on active-LOW scan with PULL_UP");
  });

  it("5. Non-Keypad Two-GPIO Handshake Test (Output LOW pulling Input PULL_UP to ground)", () => {
    clearSimSessions();
    const directWireEdges: CircuitEdge[] = [
      { id: "e_wire", source: esp32.id, sourceHandle: "gpio13", target: esp32.id, targetHandle: "gpio25" },
    ];
    useCircuitStore.setState({ nodes: [esp32], edges: directWireEdges });

    const code = `
from machine import Pin

out_pin = Pin(13, Pin.OUT)
in_pin = Pin(25, Pin.IN, Pin.PULL_UP)

out_pin.value(1)
v_high = in_pin.value()

out_pin.value(0)
v_low = in_pin.value()

print("GPIO13=HIGH -> in_pin:", v_high)
print("GPIO13=LOW -> in_pin:", v_low)
`;
    const s = getOrCreateSession(code, 100, "esp32");
    assert.ok(s.serialLines.includes("GPIO13=HIGH -> in_pin: 1"), "Must read HIGH when output is HIGH");
    assert.ok(s.serialLines.includes("GPIO13=LOW -> in_pin: 0"), "Must read LOW when output is LOW");
  });

  it("6. All 16 Keys Individually Verified in Active-LOW + Pin.PULL_UP Mode", () => {
    const scanLoopCodeActiveLow = `from machine import Pin
import time

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_UP), Pin(33, Pin.IN, Pin.PULL_UP), Pin(32, Pin.IN, Pin.PULL_UP), Pin(23, Pin.IN, Pin.PULL_UP)]
keys = [
    ['1', '2', '3', 'A'],
    ['4', '5', '6', 'B'],
    ['7', '8', '9', 'C'],
    ['*', '0', '#', 'D']
]

while True:
    for r in range(4):
        for row in rows:
            row.value(1)
        rows[r].value(0)
        for c in range(4):
            if cols[c].value() == 0:
                print("PRESSED:", keys[r][c])
                time.sleep_ms(300)
    time.sleep_ms(20)
`;

    for (const key of ALL_16_KEYS) {
      clearSimSessions();
      const kp = createKeypadNode("keypad_1", key);
      useCircuitStore.setState({ nodes: [esp32, kp], edges: esp32Edges });

      for (let tick = 1; tick <= 8; tick++) {
        parsePythonReadOutputsForInput(scanLoopCodeActiveLow, -1, false, tick * 50, "esp32");
      }
      const session = getOrCreateSession(scanLoopCodeActiveLow, 400, "esp32");
      assert.ok(
        (session.rawSerialLines ?? []).some((l) => l.includes(`PRESSED: ${key}`)),
        `Active-LOW 16-Key: Key '${key}' must be detected in scan loop`,
      );
    }
  });

  it("7. All 16 Keys Individually Verified in Active-HIGH + Pin.PULL_DOWN Mode", () => {
    const scanLoopCodeActiveHigh = `from machine import Pin
import time

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_DOWN), Pin(33, Pin.IN, Pin.PULL_DOWN), Pin(32, Pin.IN, Pin.PULL_DOWN), Pin(23, Pin.IN, Pin.PULL_DOWN)]
keys = [
    ['1', '2', '3', 'A'],
    ['4', '5', '6', 'B'],
    ['7', '8', '9', 'C'],
    ['*', '0', '#', 'D']
]

while True:
    for r in range(4):
        for row in rows:
            row.value(0)
        rows[r].value(1)
        for c in range(4):
            if cols[c].value() == 1:
                print("PRESSED_HIGH:", keys[r][c])
                time.sleep_ms(300)
    time.sleep_ms(20)
`;

    for (const key of ALL_16_KEYS) {
      clearSimSessions();
      const kp = createKeypadNode("keypad_1", key);
      useCircuitStore.setState({ nodes: [esp32, kp], edges: esp32Edges });

      for (let tick = 1; tick <= 8; tick++) {
        parsePythonReadOutputsForInput(scanLoopCodeActiveHigh, -1, false, tick * 50, "esp32");
      }
      const session = getOrCreateSession(scanLoopCodeActiveHigh, 400, "esp32");
      assert.ok(
        (session.rawSerialLines ?? []).some((l) => l.includes(`PRESSED_HIGH: ${key}`)),
        `Active-HIGH 16-Key: Key '${key}' must be detected in scan loop`,
      );
    }
  });

  it("8. Multi-Row Sequential Press Test (1 -> 5 -> 9 -> D in order)", () => {
    const scanLoopCode = `from machine import Pin
import time

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_UP), Pin(33, Pin.IN, Pin.PULL_UP), Pin(32, Pin.IN, Pin.PULL_UP), Pin(23, Pin.IN, Pin.PULL_UP)]
keys = [
    ['1', '2', '3', 'A'],
    ['4', '5', '6', 'B'],
    ['7', '8', '9', 'C'],
    ['*', '0', '#', 'D']
]

while True:
    for r in range(4):
        for row in rows:
            row.value(1)
        rows[r].value(0)
        for c in range(4):
            if cols[c].value() == 0:
                print("PRESSED:", keys[r][c])
                time.sleep_ms(300)
    time.sleep_ms(20)
`;

    clearSimSessions();
    const testSequence = ["1", "5", "9", "D"];
    let currentTs = 50;

    for (const key of testSequence) {
      // 1. Press key
      useCircuitStore.setState({
        nodes: [esp32, createKeypadNode("keypad_1", key)],
        edges: esp32Edges,
      });
      for (let t = 0; t < 4; t++) {
        currentTs += 50;
        parsePythonReadOutputsForInput(scanLoopCode, -1, false, currentTs, "esp32");
      }

      // 2. Release key (key-up)
      useCircuitStore.setState({
        nodes: [esp32, createKeypadNode("keypad_1", "")],
        edges: esp32Edges,
      });
      for (let t = 0; t < 2; t++) {
        currentTs += 50;
        parsePythonReadOutputsForInput(scanLoopCode, -1, false, currentTs, "esp32");
      }
    }

    const session = getOrCreateSession(scanLoopCode, currentTs, "esp32");
    const pressedLines = (session.rawSerialLines ?? []).filter((l) => l.startsWith("PRESSED: "));
    assert.deepStrictEqual(
      pressedLines,
      ["PRESSED: 1", "PRESSED: 5", "PRESSED: 9", "PRESSED: D"],
      "Must detect 1 -> 5 -> 9 -> D in exact order across sequential presses",
    );
  });

  it("9. Held-Key Debounce & Clean Release on Key-Up", () => {
    const scanLoopCode = `from machine import Pin
import time

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_UP), Pin(33, Pin.IN, Pin.PULL_UP), Pin(32, Pin.IN, Pin.PULL_UP), Pin(23, Pin.IN, Pin.PULL_UP)]
keys = [
    ['1', '2', '3', 'A'],
    ['4', '5', '6', 'B'],
    ['7', '8', '9', 'C'],
    ['*', '0', '#', 'D']
]

while True:
    for r in range(4):
        for row in rows:
            row.value(1)
        rows[r].value(0)
        for c in range(4):
            if cols[c].value() == 0:
                print("PRESSED:", keys[r][c])
                time.sleep_ms(300)
    time.sleep_ms(20)
`;

    clearSimSessions();
    // Key '5' is held down for 12 ticks
    useCircuitStore.setState({
      nodes: [esp32, createKeypadNode("keypad_1", "5")],
      edges: esp32Edges,
    });

    let ts = 50;
    for (let t = 1; t <= 12; t++) {
      ts += 50;
      parsePythonReadOutputsForInput(scanLoopCode, -1, false, ts, "esp32");
    }

    let session = getOrCreateSession(scanLoopCode, ts, "esp32");
    const pressed5Lines = (session.rawSerialLines ?? []).filter((l) => l === "PRESSED: 5");
    assert.strictEqual(
      pressed5Lines.length,
      1,
      "Holding key '5' must produce exactly 1 PRESSED line (consumed), not spam repeatedly",
    );

    // Release key '5'
    useCircuitStore.setState({
      nodes: [esp32, createKeypadNode("keypad_1", "")],
      edges: esp32Edges,
    });
    ts += 100;
    parsePythonReadOutputsForInput(scanLoopCode, -1, false, ts, "esp32");

    // Press key '5' again
    useCircuitStore.setState({
      nodes: [esp32, createKeypadNode("keypad_1", "5")],
      edges: esp32Edges,
    });
    for (let t = 1; t <= 4; t++) {
      ts += 50;
      parsePythonReadOutputsForInput(scanLoopCode, -1, false, ts, "esp32");
    }

    session = getOrCreateSession(scanLoopCode, ts, "esp32");
    const afterRelease5Lines = (session.rawSerialLines ?? []).filter((l) => l === "PRESSED: 5");
    assert.strictEqual(
      afterRelease5Lines.length,
      2,
      "Pressing key '5' after release must register as a fresh second press",
    );
  });
});
