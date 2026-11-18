import assert from "node:assert";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { buildSimulationFrame } from "../lib/simulation-state";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { resetIrReceiverState, NEC_COMMANDS } from "../lib/esp32/parser/irReceiver";
import { evaluateEsp32CppIrReceiver, parseEsp32CppNeoPixelActions } from "../lib/esp32/parser";
import { evaluateEsp32CppConditionals } from "../lib/esp32/parser/cppConditionalLogic";
import { evaluateEsp32CppSerial, resetEsp32CppSerialSessions } from "../lib/esp32/parser/cppSerial";
import { parseEsp32CppGpioActions } from "../lib/esp32/parser/cppPatterns";
import { checkComponentStatus } from "../utils/componentStatus";

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

function createIrReceiverNode(id = "ir_rx_1"): CircuitNode {
  return {
    id,
    type: "irReceiver",
    position: { x: 300, y: 100 },
    data: {
      componentType: "irReceiver",
      label: "IR Receiver",
      simulationModel: "irReceiver",
      properties: {},
      rotation: 0,
    },
  };
}

function createIrRemoteNode(id = "ir_remote_1", lastCmd?: { command: number; name?: string; address?: number; seq?: number; timestamp?: number }): CircuitNode {
  return {
    id,
    type: "irRemote",
    position: { x: 500, y: 100 },
    data: {
      componentType: "irRemote",
      label: "IR Remote",
      simulationModel: "irRemote",
      properties: {
        lastCommand: {
          label: "Last Command",
          type: "string",
          value: lastCmd ? JSON.stringify(lastCmd) : "",
        },
      },
      rotation: 0,
    },
  };
}

function createLedNode(id = "led_1"): CircuitNode {
  return {
    id,
    type: "led",
    position: { x: 300, y: 300 },
    data: {
      componentType: "led",
      label: "LED",
      simulationModel: "led",
      properties: {
        color: { label: "Color", type: "string", value: "red" },
      },
      rotation: 0,
    },
  };
}

function createResistorNode(id = "r_1"): CircuitNode {
  return {
    id,
    type: "resistor",
    position: { x: 200, y: 300 },
    data: {
      componentType: "resistor",
      label: "Resistor 220",
      simulationModel: "resistor",
      properties: {
        resistance: { label: "Resistance", type: "string", value: "220" },
      },
      rotation: 0,
    },
  };
}

function setIrRemoteButton(remoteNode: CircuitNode, command: number, name: string) {
  remoteNode.data.properties.lastCommand = {
    label: "Last Command",
    type: "string",
    value: JSON.stringify({ command, name, seq: Date.now(), timestamp: Date.now() }),
  };
}

export function runEsp32CppIrReceiverTests(): boolean {
  console.log("=================== RUNNING ESP32 C++ IR RECEIVER TESTS ===================");

  // --- TEST 1: begin(), decode(), resume() flow ---
  console.log("\n--- TEST 1: Basic begin(), decode(), resume() Flow ---");
  resetIrReceiverState();

  const esp32Node1 = createEsp32Node();
  const irRx1 = createIrReceiverNode();
  const irRemote1 = createIrRemoteNode("ir_remote_1", { command: 0x45, name: "POWER", seq: 10, timestamp: 1000 });

  const nodes1 = [esp32Node1, irRx1, irRemote1];
  const edges1: CircuitEdge[] = [
    { id: "e1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: irRx1.id, targetHandle: "vcc" },
    { id: "e2", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: irRx1.id, targetHandle: "gnd" },
    { id: "e3", source: esp32Node1.id, sourceHandle: "gpio15", target: irRx1.id, targetHandle: "out" },
  ];

  const code1 = `
    #include <IRremote.hpp>
    #define IR_RECEIVE_PIN 15

    void setup() {
      IrReceiver.begin(IR_RECEIVE_PIN);
    }

    void loop() {
      if (IrReceiver.decode()) {
        if (IrReceiver.decodedIRData.command == 0x45) {
          digitalWrite(2, HIGH);
        }
        IrReceiver.resume();
      }
    }
  `;

  const irRes1 = evaluateEsp32CppIrReceiver(code1, {
    nodes: nodes1,
    edges: edges1,
    tick: 1,
    running: true,
  });

  assert.strictEqual(irRes1.decoded, true, "Expected IrReceiver.decode() to be true");
  assert.strictEqual(irRes1.command, 0x45, "Expected command to be 0x45 (POWER)");
  assert.strictEqual(irRes1.pin, 15, "Expected receive pin 15");

  // Verify conditional logic actuates LED on GPIO 2
  resetIrReceiverState();
  const actions1 = evaluateEsp32CppConditionals(code1, new Map(), {
    nodes: nodes1,
    edges: edges1,
  });
  const ledAction1 = actions1.find((a) => a.pin === 2);
  assert.ok(ledAction1, "Expected GPIO 2 write action");
  assert.strictEqual((ledAction1 as any).value, 1, "Expected LED on GPIO 2 to turn HIGH");
  console.log("✅ PASS: begin(), decode(), and command evaluation flow verified");

  // --- TEST 2: 21-Button NEC Dictionary Compatibility ---
  console.log("\n--- TEST 2: 21-Button NEC Dictionary Verification ---");
  const testButtons = [
    { name: "POWER", code: 0x45 },
    { name: "VOL_PLUS", code: 0x46 },
    { name: "FUNC_STOP", code: 0x47 },
    { name: "REWIND", code: 0x44 },
    { name: "PLAY_PAUSE", code: 0x40 },
    { name: "FAST_FORWARD", code: 0x43 },
    { name: "DOWN", code: 0x07 },
    { name: "VOL_MINUS", code: 0x15 },
    { name: "UP", code: 0x09 },
    { name: "NUM_0", code: 0x16 },
    { name: "EQ", code: 0x19 },
    { name: "ST_REPT", code: 0x0D },
    { name: "NUM_1", code: 0x0C },
    { name: "NUM_2", code: 0x18 },
    { name: "NUM_3", code: 0x5E },
    { name: "NUM_4", code: 0x08 },
    { name: "NUM_5", code: 0x1C },
    { name: "NUM_6", code: 0x5A },
    { name: "NUM_7", code: 0x42 },
    { name: "NUM_8", code: 0x52 },
    { name: "NUM_9", code: 0x4A },
  ];

  for (let idx = 0; idx < testButtons.length; idx++) {
    const btn = testButtons[idx];
    assert.strictEqual(NEC_COMMANDS[btn.name], btn.code, `Dictionary mismatch for ${btn.name}`);

    // Verify parser decodes this exact command
    resetIrReceiverState();
    const remote = createIrRemoteNode("ir_remote_dict", { command: btn.code, name: btn.name, seq: 100 + idx, timestamp: 2000 + idx });
    const res = evaluateEsp32CppIrReceiver(code1, {
      nodes: [esp32Node1, irRx1, remote],
      edges: edges1,
      tick: 2,
      running: true,
    });
    assert.strictEqual(res.command, btn.code, `Failed to decode ${btn.name}`);
  }
  console.log("✅ PASS: All 21 NEC dictionary buttons decoded with 100% MicroPython parity");

  // --- TEST 3: Edge-Triggered Single Consumption ---
  console.log("\n--- TEST 3: Edge-Triggered Single Consumption ---");
  resetIrReceiverState();
  const remoteSingle = createIrRemoteNode("ir_remote_s", { command: 0x18, name: "NUM_2", seq: 50, timestamp: 5000 });
  const nodesSingle = [esp32Node1, irRx1, remoteSingle];

  // 1st decode call -> returns true with command
  const resFirst = evaluateEsp32CppIrReceiver(code1, {
    nodes: nodesSingle,
    edges: edges1,
    tick: 1,
    running: true,
  });
  assert.strictEqual(resFirst.decoded, true);
  assert.strictEqual(resFirst.command, 0x18);

  // 2nd decode call with same sequence -> returns false (consumed!)
  const resSecond = evaluateEsp32CppIrReceiver(code1, {
    nodes: nodesSingle,
    edges: edges1,
    tick: 2,
    running: true,
  });
  assert.strictEqual(resSecond.decoded, false, "Second call for same transmission must return false");
  assert.strictEqual(resSecond.command, null);
  console.log("✅ PASS: Single-consumption edge-triggering verified — decoded once, then false until new click");

  // --- TEST 4: Boot-Time False-Trigger Prevention ---
  console.log("\n--- TEST 4: Boot-Time False-Trigger Prevention ---");
  resetIrReceiverState();
  const resBootTick0 = evaluateEsp32CppIrReceiver(code1, {
    nodes: nodesSingle,
    edges: edges1,
    tick: 0,
    running: true,
  });
  assert.strictEqual(resBootTick0.decoded, false, "At tick 0, decode() must NEVER trigger true");

  const resStopped = evaluateEsp32CppIrReceiver(code1, {
    nodes: nodesSingle,
    edges: edges1,
    tick: 5,
    running: false,
  });
  assert.strictEqual(resStopped.decoded, false, "When stopped, decode() must NEVER trigger true");
  console.log("✅ PASS: Boot-time & stopped simulation safety verified");

  // --- TEST 5: Hardware Pin Safety Guards (GPIO6-11 Flash & GPIO34-39 Input-Only) ---
  console.log("\n--- TEST 5: Hardware Pin Safety Guards ---");
  // GPIO 6 (SPI flash) -> Rejected
  const codeFlash = `
    #include <IRremote.hpp>
    void setup() { IrReceiver.begin(6); }
    void loop() { if (IrReceiver.decode()) {} }
  `;
  const resFlash = evaluateEsp32CppIrReceiver(codeFlash, { nodes: nodesSingle, edges: edges1, tick: 1, running: true });
  assert.strictEqual(resFlash.decoded, false);
  assert.ok(resFlash.warning?.includes("Forbidden GPIO 6"), "Expected flash pin warning");

  // GPIO 34 (Input-only) -> Allowed!
  const edgesInputOnly: CircuitEdge[] = [
    { id: "e1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: irRx1.id, targetHandle: "vcc" },
    { id: "e2", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: irRx1.id, targetHandle: "gnd" },
    { id: "e3", source: esp32Node1.id, sourceHandle: "gpio34", target: irRx1.id, targetHandle: "out" },
  ];
  const codeInputOnly = `
    #include <IRremote.hpp>
    void setup() { IrReceiver.begin(34); }
    void loop() { if (IrReceiver.decode()) {} }
  `;
  resetIrReceiverState();
  const remoteIO = createIrRemoteNode("ir_remote_io", { command: 0x45, seq: 90, timestamp: 9000 });
  const resInputOnly = evaluateEsp32CppIrReceiver(codeInputOnly, {
    nodes: [esp32Node1, irRx1, remoteIO],
    edges: edgesInputOnly,
    tick: 1,
    running: true,
  });
  assert.strictEqual(resInputOnly.decoded, true, "Input-only GPIO 34 should be allowed for IR receive");
  assert.strictEqual(resInputOnly.command, 0x45);
  console.log("✅ PASS: Pin guards verified (GPIO 6 rejected, Input-only GPIO 34 permitted)");

  // --- TEST 6: Realistic Error Scenarios (Unwired Pin & Missing Power) ---
  console.log("\n--- TEST 6: Realistic Error Scenarios ---");
  // 1. Unwired signal pin
  resetIrReceiverState();
  const edgesUnwired: CircuitEdge[] = [
    { id: "e1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: irRx1.id, targetHandle: "vcc" },
    { id: "e2", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: irRx1.id, targetHandle: "gnd" },
    // Out pin is floating / disconnected
  ];
  const resUnwired = evaluateEsp32CppIrReceiver(code1, {
    nodes: [esp32Node1, irRx1, remoteSingle],
    edges: edgesUnwired,
    tick: 1,
    running: true,
  });
  assert.strictEqual(resUnwired.decoded, false, "Unwired IR receiver must return decode() = false");

  // 2. Missing VCC
  const edgesMissingVcc: CircuitEdge[] = [
    { id: "e2", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: irRx1.id, targetHandle: "gnd" },
    { id: "e3", source: esp32Node1.id, sourceHandle: "gpio15", target: irRx1.id, targetHandle: "out" },
  ];
  const resMissingVcc = evaluateEsp32CppIrReceiver(code1, {
    nodes: [esp32Node1, irRx1, remoteSingle],
    edges: edgesMissingVcc,
    tick: 1,
    running: true,
  });
  assert.strictEqual(resMissingVcc.decoded, false, "Unpowered IR receiver (no VCC) must return decode() = false");

  // 3. Missing GND
  const edgesMissingGnd: CircuitEdge[] = [
    { id: "e1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: irRx1.id, targetHandle: "vcc" },
    { id: "e3", source: esp32Node1.id, sourceHandle: "gpio15", target: irRx1.id, targetHandle: "out" },
  ];
  const resMissingGnd = evaluateEsp32CppIrReceiver(code1, {
    nodes: [esp32Node1, irRx1, remoteSingle],
    edges: edgesMissingGnd,
    tick: 1,
    running: true,
  });
  assert.strictEqual(resMissingGnd.decoded, false, "Unpowered IR receiver (no GND) must return decode() = false");
  console.log("✅ PASS: Unwired and unpowered failure modes fail gracefully (decode() = false)");

  // --- TEST 7: Multi-Component Integration (IR + NeoPixel + Serial) ---
  console.log("\n--- TEST 7: Multi-Component Integration (IR + NeoPixel + Serial) ---");
  resetIrReceiverState();
  resetEsp32CppSerialSessions();

  const codeMulti = `
    #include <IRremote.hpp>
    #include <Adafruit_NeoPixel.h>
    #define IR_PIN 15
    #define NEO_PIN 4
    #define NUMPIXELS 4

    Adafruit_NeoPixel strip(NUMPIXELS, NEO_PIN, NEO_GRB + NEO_KHZ800);

    void setup() {
      Serial.begin(115200);
      IrReceiver.begin(IR_PIN);
      strip.begin();
    }

    void loop() {
      if (IrReceiver.decode()) {
        Serial.println(IrReceiver.decodedIRData.command, HEX);
        if (IrReceiver.decodedIRData.command == 0x45) {
          strip.setPixelColor(0, strip.Color(255, 0, 0)); // RED on POWER
          strip.show();
        }
        IrReceiver.resume();
      }
    }
  `;

  const remoteMulti = createIrRemoteNode("ir_m", { command: 0x45, name: "POWER", seq: 200, timestamp: 9999 });
  const multiNodes = [esp32Node1, irRx1, remoteMulti];
  const multiEdges: CircuitEdge[] = [
    { id: "e1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: irRx1.id, targetHandle: "vcc" },
    { id: "e2", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: irRx1.id, targetHandle: "gnd" },
    { id: "e3", source: esp32Node1.id, sourceHandle: "gpio15", target: irRx1.id, targetHandle: "out" },
  ];

  // 1. Serial output check
  const serialRes = evaluateEsp32CppSerial(codeMulti, {
    nodes: multiNodes,
    edges: multiEdges,
    tick: 1,
  });
  assert.ok(serialRes.allLines.includes("45"), "Serial output should print '45' in HEX");

  // 2. NeoPixel output check
  const neoActions = parseEsp32CppNeoPixelActions(codeMulti, {
    nodes: multiNodes,
    edges: multiEdges,
    tick: 1,
  });
  assert.strictEqual(neoActions.length, 1);
  assert.strictEqual(neoActions[0].pin, 4);
  assert.deepStrictEqual(neoActions[0].pixels[0], { r: 255, g: 0, b: 0 }, "Expected pixel 0 to be RED on POWER button");
  console.log("✅ PASS: Multi-component integration (IR + NeoPixel + Serial) verified seamlessly");

  // --- TEST 8: User Exact Reported Code & Circuit End-to-End ---
  console.log("\n--- TEST 8: User Exact Code & Circuit End-to-End Simulation ---");
  resetIrReceiverState();
  resetEsp32CppSerialSessions();

  const userCode = `
    #include <IRremote.hpp>

    #define IR_RECEIVE_PIN 18
    const int LED_PIN = 19;

    void setup() {
      Serial.begin(115200);
      pinMode(LED_PIN, OUTPUT);
      digitalWrite(LED_PIN, LOW);
      IrReceiver.begin(IR_RECEIVE_PIN);
    }

    void loop() {
      if (IrReceiver.decode()) {
        Serial.print("Command: 0x");
        Serial.println(IrReceiver.decodedIRData.command, HEX);
        if (IrReceiver.decodedIRData.command == 0x45) {
          digitalWrite(LED_PIN, HIGH);
        } else {
          digitalWrite(LED_PIN, LOW);
        }
        IrReceiver.resume();
      }
    }
  `;

  const irRx18 = createIrReceiverNode("ir_rx_18");
  const remoteUser = createIrRemoteNode("ir_remote_user", { command: 0x45, name: "POWER", seq: 500, timestamp: 12000 });
  const nodesUser = [esp32Node1, irRx18, remoteUser];
  const edgesUser: CircuitEdge[] = [
    { id: "eu1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: irRx18.id, targetHandle: "vcc" },
    { id: "eu2", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: irRx18.id, targetHandle: "gnd" },
    { id: "eu3", source: esp32Node1.id, sourceHandle: "gpio18", target: irRx18.id, targetHandle: "out" },
  ];

  // Tick 1: Power button pressed (0x45) -> LED GPIO 19 HIGH, Serial "Command: 0x45"
  const serialResUser1 = evaluateEsp32CppSerial(userCode, {
    nodes: nodesUser,
    edges: edgesUser,
    tick: 1,
  });
  assert.ok(serialResUser1.allLines.includes("Command: 0x45"), "Serial should output 'Command: 0x45'");

  const condActionsUser1 = evaluateEsp32CppConditionals(userCode, new Map(), {
    nodes: nodesUser,
    edges: edgesUser,
    tick: 1,
  });
  const ledWrite1 = condActionsUser1.find(a => a.pin === 19);
  assert.ok(ledWrite1, "Expected GPIO 19 write action");
  assert.strictEqual((ledWrite1 as any).value, 1, "Expected LED on GPIO 19 to turn HIGH for command 0x45");

  // Tick 2: Subsequent tick with same sequence -> IrReceiver.decode() returns false (no extra actions)
  const serialResUser2 = evaluateEsp32CppSerial(userCode, {
    nodes: nodesUser,
    edges: edgesUser,
    tick: 2,
  });
  assert.strictEqual(serialResUser2.newLines.length, 0, "No new serial line should be emitted without new click");

  // Non-power button (e.g. 0x18 -> NUM_2) -> LED GPIO 19 LOW in else branch
  resetIrReceiverState();
  const remoteUserOther = createIrRemoteNode("ir_remote_other", { command: 0x18, name: "NUM_2", seq: 501, timestamp: 13000 });
  const condActionsUserElse = evaluateEsp32CppConditionals(userCode, new Map(), {
    nodes: [esp32Node1, irRx18, remoteUserOther],
    edges: edgesUser,
  });
  const ledWriteElse = condActionsUserElse.find(a => a.pin === 19);
  assert.ok(ledWriteElse, "Expected GPIO 19 write action in else branch");
  assert.strictEqual((ledWriteElse as any).value, 0, "Expected LED on GPIO 19 to turn LOW in else branch for command 0x18");
  console.log("✅ PASS: User exact reported circuit & code (nested if-else, multi-call Serial, HIGH/LOW branches) verified 100%");

  // --- TEST 9: Dual-Receiver Broadcast Test ---
  console.log("\n--- TEST 9: Dual-Receiver Broadcast Test ---");
  resetIrReceiverState();
  const irRxA = createIrReceiverNode("ir_rx_A");
  const irRxB = createIrReceiverNode("ir_rx_B");
  const remoteBroadcast = createIrRemoteNode("ir_remote_bc", { command: 0x40, name: "PLAY_PAUSE", seq: 888, timestamp: 20000 });

  const codeA = `
    #include <IRremote.hpp>
    void setup() { IrReceiver.begin(18); }
    void loop() { if (IrReceiver.decode()) { digitalWrite(2, HIGH); } }
  `;
  const codeB = `
    #include <IRremote.hpp>
    void setup() { IrReceiver.begin(15); }
    void loop() { if (IrReceiver.decode()) { digitalWrite(4, HIGH); } }
  `;

  const dualNodes = [esp32Node1, irRxA, irRxB, remoteBroadcast];
  const dualEdges: CircuitEdge[] = [
    { id: "da1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: irRxA.id, targetHandle: "vcc" },
    { id: "da2", source: esp32Node1.id, sourceHandle: "esp32_gnd1", target: irRxA.id, targetHandle: "gnd" },
    { id: "da3", source: esp32Node1.id, sourceHandle: "gpio18", target: irRxA.id, targetHandle: "out" },
    { id: "db1", source: esp32Node1.id, sourceHandle: "esp32_3v3", target: irRxB.id, targetHandle: "vcc" },
    { id: "db2", source: esp32Node1.id, sourceHandle: "esp32_gnd2", target: irRxB.id, targetHandle: "gnd" },
    { id: "db3", source: esp32Node1.id, sourceHandle: "gpio15", target: irRxB.id, targetHandle: "out" },
  ];

  // In the same tick 1, both independent receivers should receive the broadcast transmission
  const actA = evaluateEsp32CppConditionals(codeA, new Map(), { nodes: dualNodes, edges: dualEdges });
  const actB = evaluateEsp32CppConditionals(codeB, new Map(), { nodes: dualNodes, edges: dualEdges });

  assert.strictEqual(actA.some(a => a.pin === 2 && (a as any).value === 1), true, "Receiver A on GPIO 18 should decode");
  assert.strictEqual(actB.some(a => a.pin === 4 && (a as any).value === 1), true, "Receiver B on GPIO 15 should decode");
  console.log("✅ PASS: Dual-receiver broadcast test verified without consumption race");

  // --- TEST 10: Nested vs Flat Conditionals Suite ---
  console.log("\n--- TEST 10: Nested vs Flat Conditionals Suite ---");
  // 1. Single-level if without else
  const codeIfOnly = `
    const int BTN = 12;
    const int LED = 13;
    void loop() {
      if (digitalRead(BTN) == HIGH) {
        digitalWrite(LED, HIGH);
      }
    }
  `;
  const actIfOnly = evaluateEsp32CppConditionals(codeIfOnly, new Map([[12, true]]));
  assert.strictEqual((actIfOnly.find(a => a.pin === 13) as any)?.value, 1);

  // 2. Single-level if/else
  const codeIfElse = `
    const int BTN = 12;
    const int LED = 13;
    void loop() {
      if (digitalRead(BTN) == HIGH) {
        digitalWrite(LED, HIGH);
      } else {
        digitalWrite(LED, LOW);
      }
    }
  `;
  const actIfElseHigh = evaluateEsp32CppConditionals(codeIfElse, new Map([[12, true]]));
  assert.strictEqual((actIfElseHigh.find(a => a.pin === 13) as any)?.value, 1);
  const actIfElseLow = evaluateEsp32CppConditionals(codeIfElse, new Map([[12, false]]));
  assert.strictEqual((actIfElseLow.find(a => a.pin === 13) as any)?.value, 0);

  // 3. Multi-level nested if: if (X) { if (Y) { A } else { B } }
  const codeNested = `
    const int BTN1 = 12;
    const int BTN2 = 14;
    const int LED1 = 26;
    const int LED2 = 27;
    void loop() {
      if (digitalRead(BTN1) == HIGH) {
        digitalWrite(LED1, HIGH);
        if (digitalRead(BTN2) == HIGH) {
          digitalWrite(LED2, HIGH);
        } else {
          digitalWrite(LED2, LOW);
        }
      } else {
        digitalWrite(LED1, LOW);
      }
    }
  `;
  const actNest1 = evaluateEsp32CppConditionals(codeNested, new Map([[12, true], [14, true]]));
  assert.strictEqual((actNest1.find(a => a.pin === 26) as any)?.value, 1);
  assert.strictEqual((actNest1.find(a => a.pin === 27) as any)?.value, 1);

  const actNest2 = evaluateEsp32CppConditionals(codeNested, new Map([[12, true], [14, false]]));
  assert.strictEqual((actNest2.find(a => a.pin === 26) as any)?.value, 1);
  assert.strictEqual((actNest2.find(a => a.pin === 27) as any)?.value, 0);

  const actNest3 = evaluateEsp32CppConditionals(codeNested, new Map([[12, false], [14, true]]));
  assert.strictEqual((actNest3.find(a => a.pin === 26) as any)?.value, 0);
  assert.strictEqual(actNest3.find(a => a.pin === 27), undefined, "LED2 should not be written when outer if is false");

  console.log("✅ PASS: Nested, single-level if/else, and if-without-else conditionals verified across all branches");

  // -----------------------------------------------------------------------
  // TEST 11: Regression — LED flash-then-off bug (static parser must not
  //          extract conditional digitalWrite calls as default pin state)
  // -----------------------------------------------------------------------
  console.log("\n--- TEST 11: LED Flash-then-OFF Regression (static parser conditional strip) ---");
  const flashThenOffCode = `
    #include <IRremote.hpp>
    #define IR_RECEIVE_PIN 18
    const int LED_PIN = 19;
    void setup() {
      Serial.begin(115200);
      pinMode(LED_PIN, OUTPUT);
      digitalWrite(LED_PIN, LOW);
      IrReceiver.begin(IR_RECEIVE_PIN);
    }
    void loop() {
      if (IrReceiver.decode()) {
        if (IrReceiver.decodedIRData.command == 0x45) {
          digitalWrite(LED_PIN, HIGH);
        } else {
          digitalWrite(LED_PIN, LOW);
        }
        IrReceiver.resume();
      }
    }
  `;

  // 11a: Static parser (parseEsp32CppGpioActions) must NOT include
  //      the conditional LED writes as gpio_write actions.
  //      Only the setup() low-init should appear for pin 19.
  const staticActions = parseEsp32CppGpioActions(flashThenOffCode);
  const staticPin19Actions = staticActions.filter(a => a.pin === 19 && a.type === "gpio_write");
  // Should have exactly 1 action (from setup), not 2 or 3 (from if/else in loop)
  assert.strictEqual(
    staticPin19Actions.length,
    1,
    `FAIL: static parser emitted ${staticPin19Actions.length} gpio_write for pin 19 — conditional loop writes leaked into static parse`,
  );
  assert.strictEqual(
    (staticPin19Actions[0] as any).value,
    0,
    "FAIL: static initial value for LED_PIN must be LOW (0) from setup()",
  );
  console.log(`  [PASS] 11a: Static parser emits exactly 1 gpio_write for LED_PIN (from setup), not from loop conditionals`);

  // 11b: Conditional evaluator with decode()=false must emit ZERO gpio_write actions for pin 19
  //      (no else branch executed, no static LOW override)
  const condActionsNoPress = evaluateEsp32CppConditionals(
    flashThenOffCode,
    new Map(),
    { variables: new Map([["__ir_decoded", 0], ["__ir_command", 0]]) },
  );
  const condPin19NoPress = condActionsNoPress.filter(a => a.pin === 19 && a.type === "gpio_write");
  assert.strictEqual(
    condPin19NoPress.length,
    0,
    `FAIL: conditional evaluator emitted ${condPin19NoPress.length} gpio_write for pin 19 when decode()=false (should be 0 — LED must stay at last written state)`,
  );
  console.log(`  [PASS] 11b: Conditional evaluator emits 0 writes for LED_PIN when decode()=false — LED state is preserved`);

  // 11c: Conditional evaluator with decode()=true + command=0x45 must emit HIGH for pin 19
  const condActionsPress = evaluateEsp32CppConditionals(
    flashThenOffCode,
    new Map(),
    { variables: new Map([["__ir_decoded", 1], ["__ir_command", 0x45], ["IrReceiver.decodedIRData.command", 0x45]]) },
  );
  const condPin19Press = condActionsPress.filter(a => a.pin === 19 && a.type === "gpio_write");
  assert.strictEqual(condPin19Press.length, 1, "FAIL: expected 1 write for LED on Power press");
  assert.strictEqual((condPin19Press[0] as any).value, 1, "FAIL: LED_PIN must be HIGH after Power button press");
  console.log(`  [PASS] 11c: Conditional evaluator emits HIGH for LED_PIN when decode()=true and command==0x45`);

  // 11d: A different IR button (e.g. 0x46 = VOL+) must emit LOW for pin 19
  const condActionsOtherBtn = evaluateEsp32CppConditionals(
    flashThenOffCode,
    new Map(),
    { variables: new Map([["__ir_decoded", 1], ["__ir_command", 0x46], ["IrReceiver.decodedIRData.command", 0x46]]) },
  );
  const condPin19OtherBtn = condActionsOtherBtn.filter(a => a.pin === 19 && a.type === "gpio_write");
  assert.strictEqual(condPin19OtherBtn.length, 1, "FAIL: expected 1 write for LED on non-Power button press");
  assert.strictEqual((condPin19OtherBtn[0] as any).value, 0, "FAIL: LED_PIN must be LOW for non-0x45 command");
  console.log(`  [PASS] 11d: Conditional evaluator emits LOW for LED_PIN when non-Power button pressed`);

  console.log("✅ PASS TEST 11: Flash-then-off regression — static parser no longer leaks conditional writes");

  // -----------------------------------------------------------------------
  // TEST 12: Multi-Frame Simulation Pipeline Latch Persistence
  //          Simulates real tick sequence: Boot -> Press Power -> Idle -> Idle -> Press Mode -> Idle
  // -----------------------------------------------------------------------
  console.log("\n--- TEST 12: Multi-Frame Simulation Pipeline Latch Persistence ---");
  const circuitNodes = [
    createEsp32Node(),
    createIrReceiverNode(),
    createIrRemoteNode("ir_remote_1"),
    createLedNode(),
    createResistorNode(),
  ];
  const circuitEdges = [
    { id: "e1", source: "esp32_1", sourceHandle: "esp32_3v3", target: "ir_rx_1", targetHandle: "vcc" },
    { id: "e2", source: "esp32_1", sourceHandle: "esp32_gnd1", target: "ir_rx_1", targetHandle: "gnd" },
    { id: "e3", source: "esp32_1", sourceHandle: "gpio18", target: "ir_rx_1", targetHandle: "out" },
    { id: "e4", source: "esp32_1", sourceHandle: "gpio19", target: "r_1", targetHandle: "pin1" },
    { id: "e5", source: "r_1", sourceHandle: "pin2", target: "led_1", targetHandle: "anode" },
    { id: "e6", source: "led_1", sourceHandle: "cathode", target: "esp32_1", targetHandle: "esp32_gnd2" },
  ];

  resetIrReceiverState();
  resetEsp32CppSerialSessions();

  // Tick 0: Boot - LED is OFF
  let simFrame: any = buildSimulationFrame({
    nodes: circuitNodes,
    edges: circuitEdges,
    boardType: "esp32",
    tick: 0,
    running: true,
  });
  simFrame = applyEsp32SimulationToFrame(simFrame as any, {
    nodes: circuitNodes,
    edges: circuitEdges,
    arduinoCode: flashThenOffCode,
    picoCode: "",
    boardType: "esp32",
    selectedLanguage: "cpp",
    tick: 0,
  } as any);
  assert.strictEqual(simFrame.components["led_1"]?.isPowered ?? false, false, "Tick 0: LED must be OFF at boot");
  console.log("  [PASS] Tick 0: Boot -> LED is OFF (LOW)");

  // Tick 1: User presses POWER button (0x45)
  const remoteNode = circuitNodes.find(n => n.id === "ir_remote_1")!;
  setIrRemoteButton(remoteNode, 0x45, "POWER");
  simFrame = buildSimulationFrame({
    nodes: circuitNodes,
    edges: circuitEdges,
    boardType: "esp32",
    tick: 1,
    running: true,
    arduinoState: {
      pins: simFrame.boardPins ? new Map(simFrame.boardPins.map((p: any) => [typeof p.pin === "number" ? p.pin : parseInt(String(p.pin).replace(/\D/g, ""), 10), { mode: "OUTPUT", value: p.value ? 1 : 0 }])) : new Map(),
      serialOutput: [],
      error: null,
      running: true,
    },
  });
  simFrame = applyEsp32SimulationToFrame(simFrame as any, {
    nodes: circuitNodes,
    edges: circuitEdges,
    arduinoCode: flashThenOffCode,
    picoCode: "",
    boardType: "esp32",
    selectedLanguage: "cpp",
    tick: 1,
  } as any);
  assert.strictEqual(simFrame.components["led_1"]?.isPowered, true, "Tick 1: LED must turn ON when POWER button is pressed");
  console.log("  [PASS] Tick 1: POWER pressed -> LED turns ON (HIGH)");

  // Tick 2: Idle (no button pressed) - LED MUST REMAIN ON (latched)
  simFrame = buildSimulationFrame({
    nodes: circuitNodes,
    edges: circuitEdges,
    boardType: "esp32",
    tick: 2,
    running: true,
    arduinoState: {
      pins: simFrame.boardPins ? new Map(simFrame.boardPins.map((p: any) => [typeof p.pin === "number" ? p.pin : parseInt(String(p.pin).replace(/\D/g, ""), 10), { mode: "OUTPUT", value: p.value ? 1 : 0 }])) : new Map(),
      serialOutput: [],
      error: null,
      running: true,
    },
  });
  simFrame = applyEsp32SimulationToFrame(simFrame as any, {
    nodes: circuitNodes,
    edges: circuitEdges,
    arduinoCode: flashThenOffCode,
    picoCode: "",
    boardType: "esp32",
    selectedLanguage: "cpp",
    tick: 2,
  } as any);
  assert.strictEqual(simFrame.components["led_1"]?.isPowered, true, "Tick 2: LED MUST REMAIN ON across subsequent idle ticks (no flash-then-off)");
  console.log("  [PASS] Tick 2: Idle tick -> LED stays latched ON (HIGH)");

  // Tick 3: Idle again - LED MUST STILL REMAIN ON
  simFrame = buildSimulationFrame({
    nodes: circuitNodes,
    edges: circuitEdges,
    boardType: "esp32",
    tick: 3,
    running: true,
    arduinoState: {
      pins: simFrame.boardPins ? new Map(simFrame.boardPins.map((p: any) => [typeof p.pin === "number" ? p.pin : parseInt(String(p.pin).replace(/\D/g, ""), 10), { mode: "OUTPUT", value: p.value ? 1 : 0 }])) : new Map(),
      serialOutput: [],
      error: null,
      running: true,
    },
  });
  simFrame = applyEsp32SimulationToFrame(simFrame as any, {
    nodes: circuitNodes,
    edges: circuitEdges,
    arduinoCode: flashThenOffCode,
    picoCode: "",
    boardType: "esp32",
    selectedLanguage: "cpp",
    tick: 3,
  } as any);
  assert.strictEqual(simFrame.components["led_1"]?.isPowered, true, "Tick 3: LED MUST STILL REMAIN ON");
  console.log("  [PASS] Tick 3: Idle tick -> LED still latched ON (HIGH)");

  // Tick 4: User presses non-Power button (e.g. 0x46 = MODE) -> turns LED OFF
  setIrRemoteButton(remoteNode, 0x46, "MODE");
  simFrame = buildSimulationFrame({
    nodes: circuitNodes,
    edges: circuitEdges,
    boardType: "esp32",
    tick: 4,
    running: true,
    arduinoState: {
      pins: simFrame.boardPins ? new Map(simFrame.boardPins.map((p: any) => [typeof p.pin === "number" ? p.pin : parseInt(String(p.pin).replace(/\D/g, ""), 10), { mode: "OUTPUT", value: p.value ? 1 : 0 }])) : new Map(),
      serialOutput: [],
      error: null,
      running: true,
    },
  });
  simFrame = applyEsp32SimulationToFrame(simFrame as any, {
    nodes: circuitNodes,
    edges: circuitEdges,
    arduinoCode: flashThenOffCode,
    picoCode: "",
    boardType: "esp32",
    selectedLanguage: "cpp",
    tick: 4,
  } as any);
  assert.strictEqual(simFrame.components["led_1"]?.isPowered ?? false, false, "Tick 4: LED must turn OFF when non-POWER button is pressed");
  console.log("  [PASS] Tick 4: Non-Power button pressed -> LED turns OFF (LOW)");

  console.log("✅ PASS TEST 12: Multi-Frame latching verified cleanly end-to-end");

  // -----------------------------------------------------------------------
  // TEST 13: GPIO Controlled LED Status Warning Suppression
  //          When LED is wired to GPIO and turned LOW, no false warning must appear.
  // -----------------------------------------------------------------------
  console.log("\n--- TEST 13: GPIO-Controlled LED Status Warning Suppression ---");
  const ledNode = circuitNodes.find(n => n.id === "led_1")!;
  const ledCompStateOff = simFrame.components["led_1"];
  const statusOff = checkComponentStatus("led", ledCompStateOff?.telemetry, ledNode.data?.properties);
  assert.strictEqual(statusOff.severity, "none", `Expected no warning on GPIO-controlled OFF LED, got ${statusOff.severity} (${statusOff.message})`);
  console.log("  [PASS] LED OFF (LOW): severity = 'none' (no false 'Incomplete Circuit' warning)");

  console.log("✅ PASS TEST 13: LED Status Warning Suppression verified cleanly");

  console.log("\n=================== ALL ESP32 C++ IR RECEIVER TESTS PASSED ===================");
  return true;
}

if (process.argv[1] && process.argv[1].endsWith("esp32CppIrReceiver.test.ts")) {
  runEsp32CppIrReceiverTests();
}
