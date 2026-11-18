import assert from "node:assert";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { buildSimulationFrame } from "../lib/simulation-state";
import { applyFramePipeline } from "../lib/simulation/framePipeline";
import { clearSimSessions } from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";

function createEsp32Node(id = "esp32-1"): CircuitNode {
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

function createIrReceiverNode(id = "irr-1"): CircuitNode {
  return {
    id,
    type: "irReceiver",
    position: { x: 350, y: 100 },
    data: {
      componentType: "irReceiver",
      label: "IR Receiver",
      simulationModel: "irReceiver",
      properties: {
        name: { label: "Name", type: "string", value: "IRR1" },
      },
      rotation: 0,
    },
  };
}

function createIrRemoteNode(
  id = "rem-1",
  lastCommand: { command: number; name: string; address: number } | null = null,
): CircuitNode {
  return {
    id,
    type: "irRemote",
    position: { x: 600, y: 100 },
    data: {
      componentType: "irRemote",
      label: "IR Remote",
      simulationModel: "irRemote",
      properties: {
        name: { label: "Name", type: "string", value: "IR1" },
        ...(lastCommand
          ? {
            lastCommand: {
              label: "Last Command",
              type: "string",
              value: JSON.stringify(lastCommand),
            },
          }
          : {}),
      },
      rotation: 0,
    },
  };
}

function runIrTick(
  code: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  tick = 1,
) {
  useCircuitStore.setState({
    nodes,
    edges,
    simulationStatus: "running",
  });

  const context: any = {
    nodes,
    edges,
    picoCode: code,
    arduinoCode: "",
    selectedLanguage: "python",
    dynamicComponents: [],
    keypad4x4State: { getState: () => ({ inputPassword: "" }), reset: () => { } },
    keypad4x3State: { getState: () => ({ inputPassword: "" }), reset: () => { } },
  };

  const initialFrame = buildSimulationFrame({
    tick,
    nodes,
    edges,
    dynamicComponents: [],
    boardType: "esp32",
    running: true,
    arduinoState: {
      pins: new Map(),
      serialOutput: [],
      error: null,
      running: true,
    },
  });

  return applyFramePipeline(initialFrame, context);
}

console.log("=================== RUNNING ESP32 IR RECEIVER TESTS (MILESTONE 1) ===================");

// --- TEST 1: Power Button (0x45) End-to-End Pipeline ---
console.log("\n--- TEST 1: Power Button (0x45) End-to-End Pipeline ---");
clearSimSessions();

const esp32Node = createEsp32Node();
const irrNode = createIrReceiverNode("irr-1");
const remNode = createIrRemoteNode("rem-1", { address: 0x00, command: 0x45, name: "POWER" });

const nodes1 = [esp32Node, irrNode, remNode];
const edges1: CircuitEdge[] = [
  // Power: VCC -> 3V3, GND -> GND
  { id: "e_vcc", source: esp32Node.id, sourceHandle: "esp32_3v3", target: irrNode.id, targetHandle: "vcc" },
  { id: "e_gnd", source: esp32Node.id, sourceHandle: "esp32_gnd1", target: irrNode.id, targetHandle: "gnd" },
  // Signal: OUT -> GPIO15
  { id: "e_out", source: irrNode.id, sourceHandle: "out", target: esp32Node.id, targetHandle: "gpio15" },
];

const codePowerButton = `
from machine import Pin
from ir_remote import IRReceiver

ir = IRReceiver(Pin(15))
cmd = ir.read()
if cmd == 0x45:
    print("Power Pressed: 0x45")
else:
    print("Other command:", cmd)
`;

const frame1 = runIrTick(codePowerButton, nodes1, edges1);
const comp1 = frame1.components[irrNode.id];
const telemetry1 = comp1?.telemetry;

assert.strictEqual(comp1?.isPowered, true, "IR Receiver must be powered");
assert.strictEqual(telemetry1?.lastCommand, 0x45, "Receiver telemetry must capture command 0x45");
assert.strictEqual(telemetry1?.commandName, "POWER", "Receiver telemetry must record 'POWER'");

const serial1 = frame1.serialOutput || [];
assert.ok(
  serial1.some((l: string) => l.includes("Power Pressed: 0x45")),
  `Expected serial output 'Power Pressed: 0x45', got: ${JSON.stringify(serial1)}`,
);
console.log("  [PASS] Single-button (Power 0x45) end-to-end pipeline verified cleanly");

// --- TEST 2: Unpowered Receiver Protection ---
console.log("\n--- TEST 2: Unpowered Receiver Protection ---");
clearSimSessions();

// Disconnect VCC
const edgesUnpowered: CircuitEdge[] = [
  { id: "e_gnd", source: esp32Node.id, sourceHandle: "esp32_gnd1", target: irrNode.id, targetHandle: "gnd" },
  { id: "e_out", source: irrNode.id, sourceHandle: "out", target: esp32Node.id, targetHandle: "gpio15" },
];

const codeUnpowered = `
from machine import Pin
from ir_remote import IRReceiver

ir = IRReceiver(Pin(15))
cmd = ir.read()
if cmd is None:
    print("Unpowered: None")
else:
    print("Unexpected command:", cmd)
`;

const frame2 = runIrTick(codeUnpowered, [esp32Node, irrNode, remNode], edgesUnpowered);
const comp2 = frame2.components[irrNode.id];

assert.strictEqual(comp2?.isPowered, false, "Receiver without VCC must report isPowered: false");
assert.strictEqual(comp2?.telemetry?.lastCommand ?? null, null, "Unpowered receiver must not report command");

const serial2 = frame2.serialOutput || [];
assert.ok(
  serial2.some((l: string) => l.includes("Unpowered: None")),
  `Expected 'Unpowered: None' in serial output, got: ${JSON.stringify(serial2)}`,
);
console.log("  [PASS] Unpowered receiver safely returns None and does not emit signals");

// --- TEST 3: Input-Only Pin (GPIO34) Support ---
console.log("\n--- TEST 3: Input-Only Pin (GPIO34) Support ---");
clearSimSessions();

const edgesGpio34: CircuitEdge[] = [
  { id: "e_vcc", source: esp32Node.id, sourceHandle: "esp32_3v3", target: irrNode.id, targetHandle: "vcc" },
  { id: "e_gnd", source: esp32Node.id, sourceHandle: "esp32_gnd1", target: irrNode.id, targetHandle: "gnd" },
  // Wire OUT to input-only GPIO34
  { id: "e_out34", source: irrNode.id, sourceHandle: "out", target: esp32Node.id, targetHandle: "gpio34" },
];

const codeGpio34 = `
from machine import Pin
from ir_remote import IRReceiver

ir = IRReceiver(Pin(34, Pin.IN))
cmd = ir.read()
if cmd == 0x45:
    print("GPIO34 Received Power")
`;

const frame3 = runIrTick(codeGpio34, [esp32Node, irrNode, remNode], edgesGpio34);
const serial3 = frame3.serialOutput || [];

assert.ok(
  !serial3.some((l: string) => l.includes("ValueError")),
  "Input-only GPIO34 must NOT raise ValueError when configured as input receiver",
);
assert.ok(
  serial3.some((l: string) => l.includes("GPIO34 Received Power")),
  `Expected 'GPIO34 Received Power', got: ${JSON.stringify(serial3)}`,
);
console.log("  [PASS] Input-only GPIO34 validly receives IR commands without error");

// --- TEST 4: Reserved Flash Pin (GPIO6) Guard ---
console.log("\n--- TEST 4: Reserved Flash Pin (GPIO6) Guard ---");
clearSimSessions();

const codeFlashPin = `
from machine import Pin
from ir_remote import IRReceiver

ir = IRReceiver(Pin(6))
`;

const frame4 = runIrTick(codeFlashPin, [esp32Node, irrNode, remNode], edges1);
const serial4 = frame4.serialOutput || [];
const hasFlashError = serial4.some(
  (l: string) => l.includes("ValueError") && l.includes("6") && l.includes("flash"),
);
assert.ok(hasFlashError, "Configuring GPIO6 must surface ValueError for flash memory reservation");
console.log("  [PASS] Reserved flash pin (GPIO6) blocked with ValueError");

// --- TEST 5: Idle State (No Remote Button Pressed) ---
console.log("\n--- TEST 5: Idle State (No Remote Button Pressed) ---");
clearSimSessions();

const remNodeIdle = createIrRemoteNode("rem-idle", null); // No command
const codeIdle = `
from machine import Pin
from ir_remote import IRReceiver

ir = IRReceiver(Pin(15))
cmd = ir.read()
if cmd is None:
    print("Idle: None")
`;

const frame5 = runIrTick(codeIdle, [esp32Node, irrNode, remNodeIdle], edges1);
const serial5 = frame5.serialOutput || [];
assert.ok(
  serial5.some((l: string) => l.includes("Idle: None")),
  `Expected 'Idle: None', got: ${JSON.stringify(serial5)}`,
);
console.log("  [PASS] Idle state returns None when no button has been clicked");

// --- TEST 6: Edge-Triggered .read() Semantics (Consume Once, then None) ---
console.log("\n--- TEST 6: Edge-Triggered .read() Semantics ---");
clearSimSessions();

const remNodeCmd1 = createIrRemoteNode("rem-edge", { address: 0x00, command: 0x45, name: "POWER" });
// Ensure initial timestamp
(remNodeCmd1.data.properties as any).lastCommand.value = JSON.stringify({
  address: 0x00,
  command: 0x45,
  name: "POWER",
  timestamp: 1000,
});

const codeEdgeTriggered = `
from machine import Pin
from ir_remote import IRReceiver

ir = IRReceiver(Pin(15))
c1 = ir.read()
c2 = ir.read()
print("First read:", c1)
print("Second read:", c2)
`;

const frame6a = runIrTick(codeEdgeTriggered, [esp32Node, irrNode, remNodeCmd1], edges1, 1);
const serial6a = frame6a.serialOutput || [];

assert.ok(
  serial6a.some((l: string) => l.includes("First read: 69")),
  `Expected 'First read: 69' (0x45), got: ${JSON.stringify(serial6a)}`,
);
assert.ok(
  serial6a.some((l: string) => l.includes("Second read: None")),
  `Expected 'Second read: None' on consumed buffer, got: ${JSON.stringify(serial6a)}`,
);
console.log("  [PASS] Single button press consumed once, subsequent read returns None");

// Next tick without new click: still returns None
const codeNextTick = `
from machine import Pin
from ir_remote import IRReceiver
ir = IRReceiver(Pin(15))
print("Next tick:", ir.read())
`;
const frame6b = runIrTick(codeNextTick, [esp32Node, irrNode, remNodeCmd1], edges1, 2);
const serial6b = frame6b.serialOutput || [];
assert.ok(
  serial6b.some((l: string) => l.includes("Next tick: None")),
  `Expected 'Next tick: None' without new click, got: ${JSON.stringify(serial6b)}`,
);
console.log("  [PASS] Subsequent tick with same un-clicked remote retains None");

// Now a new click arrives with newer timestamp
const remNodeCmd2 = createIrRemoteNode("rem-edge", { address: 0x00, command: 0x45, name: "POWER" });
(remNodeCmd2.data.properties as any).lastCommand.value = JSON.stringify({
  address: 0x00,
  command: 0x45,
  name: "POWER",
  timestamp: 2000, // Newer click event!
});

const codeNewClick = `
from machine import Pin
from ir_remote import IRReceiver
ir = IRReceiver(Pin(15))
print("New click:", ir.read())
`;
const frame6c = runIrTick(codeNewClick, [esp32Node, irrNode, remNodeCmd2], edges1, 3);
const serial6c = frame6c.serialOutput || [];
assert.ok(
  serial6c.some((l: string) => l.includes("New click: 69")),
  `Expected 'New click: 69' on arrival of newer click, got: ${JSON.stringify(serial6c)}`,
);
console.log("  [PASS] New button click triggers fresh consumption cleanly");

// --- TEST 7: Dual Independent Receivers Broadcast (Same Remote, 2 Pins) ---
console.log("\n--- TEST 7: Dual Independent Receivers Broadcast ---");
clearSimSessions();

const irrNode1 = createIrReceiverNode("irr-dual-1");
const irrNode2 = createIrReceiverNode("irr-dual-2");
const remBroadcast = createIrRemoteNode("rem-bcast", { address: 0x00, command: 0x45, name: "POWER" });
(remBroadcast.data.properties as any).lastCommand.value = JSON.stringify({
  address: 0x00,
  command: 0x45,
  name: "POWER",
  timestamp: 5000,
});

const dualEdges: CircuitEdge[] = [
  // Receiver 1: VCC -> 3V3, GND -> GND1, OUT -> GPIO15
  { id: "e1_vcc", source: esp32Node.id, sourceHandle: "esp32_3v3", target: irrNode1.id, targetHandle: "vcc" },
  { id: "e1_gnd", source: esp32Node.id, sourceHandle: "esp32_gnd1", target: irrNode1.id, targetHandle: "gnd" },
  { id: "e1_out", source: irrNode1.id, sourceHandle: "out", target: esp32Node.id, targetHandle: "gpio15" },
  // Receiver 2: VCC -> 3V3, GND -> GND2, OUT -> GPIO16
  { id: "e2_vcc", source: esp32Node.id, sourceHandle: "esp32_3v3", target: irrNode2.id, targetHandle: "vcc" },
  { id: "e2_gnd", source: esp32Node.id, sourceHandle: "esp32_gnd2", target: irrNode2.id, targetHandle: "gnd" },
  { id: "e2_out", source: irrNode2.id, sourceHandle: "out", target: esp32Node.id, targetHandle: "gpio16" },
];

const codeDual = `
from machine import Pin
from ir_remote import IRReceiver

ir1 = IRReceiver(Pin(15))
ir2 = IRReceiver(Pin(16))

val1 = ir1.read()
val2 = ir2.read()
print("R1:", val1, "R2:", val2)

val1_again = ir1.read()
val2_again = ir2.read()
print("R1_again:", val1_again, "R2_again:", val2_again)
`;

const frame7 = runIrTick(codeDual, [esp32Node, irrNode1, irrNode2, remBroadcast], dualEdges, 1);
const serial7 = frame7.serialOutput || [];

assert.ok(
  serial7.some((l: string) => l.includes("R1: 69 R2: 69")),
  `Expected both receivers to receive broadcast command 69, got: ${JSON.stringify(serial7)}`,
);
assert.ok(
  serial7.some((l: string) => l.includes("R1_again: None R2_again: None")),
  `Expected both receivers to have consumed command independently, got: ${JSON.stringify(serial7)}`,
);
console.log("  [PASS] Dual independent IR receivers both received broadcast optical command without conflict");

// --- TEST 8: Simulation Restart (tick === 0) State Cleanup ---
console.log("\n--- TEST 8: Simulation Restart (tick === 0) State Cleanup ---");
// Even if an irRemote previously had a command stored in its properties
const remWithOldCommand = createIrRemoteNode("rem-old", { address: 0x00, command: 0x45, name: "POWER" });

// Run at tick 0 (simulation startup/reset)
const frameRestart = runIrTick(codeIdle, [esp32Node, irrNode, remWithOldCommand], edges1, 0);
const restartComp = frameRestart.components[irrNode.id];

assert.strictEqual(
  restartComp?.telemetry?.lastCommand ?? null,
  null,
  "At tick 0, telemetry.lastCommand must be completely cleared",
);

const serialRestart = frameRestart.serialOutput || [];
assert.ok(
  serialRestart.some((l: string) => l.includes("Idle: None")),
  `Expected 'Idle: None' at tick 0 restart, got: ${JSON.stringify(serialRestart)}`,
);
console.log("  [PASS] Tick 0 clean reset verified: stale commands cleared on simulation restart");

// --- TEST 9: Full 21-Button NEC Dictionary Verification ---
console.log("\n--- TEST 9: Full 21-Button NEC Dictionary Verification ---");
clearSimSessions();

const testButtons = [
  { key: "num0", code: 0x16, name: "0" },
  { key: "num1", code: 0x0c, name: "1" },
  { key: "num2", code: 0x18, name: "2" },
  { key: "num3", code: 0x5e, name: "3" },
  { key: "num4", code: 0x08, name: "4" },
  { key: "num5", code: 0x1c, name: "5" },
  { key: "num6", code: 0x5a, name: "6" },
  { key: "num7", code: 0x42, name: "7" },
  { key: "num8", code: 0x52, name: "8" },
  { key: "num9", code: 0x4a, name: "9" },
  { key: "volplus", code: 0x46, name: "VOL+" },
  { key: "volmin", code: 0x15, name: "VOL-" },
  { key: "playpauze", code: 0x40, name: "PLAY/PAUSE" },
  { key: "up", code: 0x09, name: "UP" },
  { key: "down", code: 0x07, name: "DOWN" },
  { key: "eq", code: 0x19, name: "EQ" },
  { key: "strept", code: 0x0d, name: "ST/REPT" },
  { key: "funcstop", code: 0x47, name: "FUNC/STOP" },
  { key: "forward", code: 0x43, name: "FAST_FORWARD" },
  { key: "rewind", code: 0x44, name: "REWIND" },
  { key: "standby", code: 0x45, name: "POWER" },
];

let test9Seq = 100;
for (const btn of testButtons) {
  test9Seq += 1;
  const remBtnNode = createIrRemoteNode("rem-21", { address: 0x00, command: btn.code, name: btn.name });
  (remBtnNode.data.properties as any).lastCommand.value = JSON.stringify({
    address: 0x00,
    command: btn.code,
    name: btn.name,
    seq: test9Seq,
  });

  const codeBtn = `
from machine import Pin
from ir_remote import IRReceiver
ir = IRReceiver(Pin(15))
cmd = ir.read()
if cmd == ${btn.code}:
    print("Btn OK: ${btn.name}")
`;
  const f = runIrTick(codeBtn, [esp32Node, irrNode, remBtnNode], edges1, test9Seq);
  const serial = f.serialOutput || [];
  assert.ok(
    serial.some((l: string) => l.includes(`Btn OK: ${btn.name}`)),
    `Expected 'Btn OK: ${btn.name}' for code 0x${btn.code.toString(16)}, got: ${JSON.stringify(serial)}`,
  );
}
console.log("  [PASS] All 21 standard NEC buttons (0-9, Vol+/-, Play/Pause, Up/Down, etc.) mapped & verified");

// --- TEST 10: Peter Hinch Callback Style (ir_rx.nec.NEC_8) ---
console.log("\n--- TEST 10: Peter Hinch Callback Style (NEC_8) ---");
clearSimSessions();

const remCallbackNode = createIrRemoteNode("rem-cb", { address: 0x00, command: 0x45, name: "POWER" });
(remCallbackNode.data.properties as any).lastCommand.value = JSON.stringify({
  address: 0x00,
  command: 0x45,
  name: "POWER",
  seq: 9999,
});

const codeCallback = `
from machine import Pin
from ir_rx.nec import NEC_8

def on_ir_rx(data, addr, ctrl):
    print("Callback Data:", data, "Addr:", addr)

ir_dev = NEC_8(Pin(15), on_ir_rx)
`;

const frameCb = runIrTick(codeCallback, [esp32Node, irrNode, remCallbackNode], edges1, 1);
const serialCb = frameCb.serialOutput || [];

assert.ok(
  serialCb.some((l: string) => l.includes("Callback Data: 69 Addr: 0")),
  `Expected callback execution 'Callback Data: 69 Addr: 0', got: ${JSON.stringify(serialCb)}`,
);
console.log("  [PASS] Peter Hinch NEC_8 callback executed cleanly on decoded transmission");

console.log("\n=================== ALL ESP32 IR RECEIVER TESTS PASSED ===================");
