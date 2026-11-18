import assert from 'node:assert';
import {
  evaluateEsp32CppBluetoothSerial,
  clearBluetoothSerialSession,
  pushGlobalBluetoothRx,
  clearGlobalBluetoothRx,
  getGlobalBluetoothRx,
  extractCppBluetoothVariables
} from '../lib/esp32/parser/cppBluetoothSerial';
import { evaluateEsp32CppConditionals } from '../lib/esp32/parser/cppConditionalLogic';
import { evaluateEsp32CppSerial, resetEsp32CppSerialSessions } from '../lib/esp32/parser/cppSerial';
import { buildSimulationFrame } from '../lib/simulation-state';
import { applyEsp32SimulationToFrame } from '../lib/simulation/frameTransformers/esp32';
import type { CircuitNode, CircuitEdge } from '../lib/types';

function createEsp32Node(id = 'esp32_1'): CircuitNode {
  return {
    id,
    type: 'esp32',
    position: { x: 100, y: 100 },
    data: {
      componentType: 'esp32',
      label: 'ESP32 DevKit V1',
      simulationModel: 'esp32',
      properties: {},
      rotation: 0,
    },
  };
}

export function runEsp32CppBluetoothSerialTests(): boolean {
  console.log('--- Running ESP32 C++ BluetoothSerial Tests ---');
  clearBluetoothSerialSession();
  clearGlobalBluetoothRx();

  // 1. begin() name capture & initialization
  {
    console.log('Test 1: begin() name capture & initialization');
    const code = `
#include <BluetoothSerial.h>

BluetoothSerial SerialBT;

void setup() {
  SerialBT.begin("ESP32_Robot_Car");
}

void loop() {
}
    `;

    const result = evaluateEsp32CppBluetoothSerial(code);
    assert(result !== null, 'result should not be null');
    assert.strictEqual(result.deviceName, 'ESP32_Robot_Car');
    assert.strictEqual(result.isInitialized, true);
    assert.strictEqual(result.initialized, true);
    console.log('✅ PASS: begin("name") captures custom device name');
  }

  // 2. TX print, println, formatting (DEC, HEX, BIN, float)
  {
    console.log('Test 2: TX print, println, formatting (DEC, HEX, BIN, float)');
    clearBluetoothSerialSession();
    clearGlobalBluetoothRx();
    const code = `
#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

void setup() {
  SerialBT.begin("ESP32_TX_Test");
  SerialBT.println("Bluetooth Initialized!");
  int val = 255;
  SerialBT.print("HEX: ");
  SerialBT.println(val, HEX);
  SerialBT.print("BIN: ");
  SerialBT.println(val, BIN);
  float temp = 24.567;
  SerialBT.print("Temp: ");
  SerialBT.println(temp, 2);
}

void loop() {
}
    `;

    const result = evaluateEsp32CppBluetoothSerial(code);
    assert(result !== null, 'result should not be null');
    assert.deepStrictEqual(result.output, [
      'Bluetooth Initialized!',
      'HEX: FF',
      'BIN: 11111111',
      'Temp: 24.57'
    ]);
    console.log('✅ PASS: TX formatting (strings, HEX, BIN, float decimals) verified');
  }

  // 3. RX available() and read() FIFO queue behavior
  {
    console.log('Test 3: RX available() and read() FIFO queue behavior');
    clearBluetoothSerialSession();
    clearGlobalBluetoothRx();
    const code = `
#include <BluetoothSerial.h>

BluetoothSerial SerialBT;

void setup() {
  SerialBT.begin("ESP32_RX_Test");
}

void loop() {
  if (SerialBT.available()) {
    char c = SerialBT.read();
    SerialBT.print("Echo: ");
    SerialBT.println(c);
  }
}
    `;

    // Before any input
    const frame0 = evaluateEsp32CppBluetoothSerial(code, { tick: 0 });
    assert.deepStrictEqual(frame0?.output, []);

    // Push "AB" to Bluetooth RX
    pushGlobalBluetoothRx('AB');
    assert.strictEqual(getGlobalBluetoothRx(), 'AB');

    // First read pops 'A' (tick 1)
    const frame1 = evaluateEsp32CppBluetoothSerial(code, { tick: 1 });
    assert.deepStrictEqual(frame1?.output, ['Echo: A']);
    assert.strictEqual(getGlobalBluetoothRx(), 'B');

    // Second read pops 'B' (tick 2)
    const frame2 = evaluateEsp32CppBluetoothSerial(code, { tick: 2 });
    assert.deepStrictEqual(frame2?.output, ['Echo: A', 'Echo: B']);
    assert.strictEqual(getGlobalBluetoothRx(), '');

    // Third read has nothing available (tick 3)
    const frame3 = evaluateEsp32CppBluetoothSerial(code, { tick: 3 });
    assert.deepStrictEqual(frame3?.output, ['Echo: A', 'Echo: B']);
    console.log('✅ PASS: RX FIFO queue popping and available() checks verified');
  }

  // 4. RX readString() consumes full buffer
  {
    console.log('Test 4: RX readString() consumes full buffer');
    clearBluetoothSerialSession();
    clearGlobalBluetoothRx();
    const code = `
#include <BluetoothSerial.h>

BluetoothSerial SerialBT;

void setup() {
  SerialBT.begin("ESP32_String_Test");
}

void loop() {
  if (SerialBT.available()) {
    String str = SerialBT.readString();
    SerialBT.println("Received: " + str);
  }
}
    `;

    pushGlobalBluetoothRx('FORWARD_SPEED_100');
    const result = evaluateEsp32CppBluetoothSerial(code);
    assert.deepStrictEqual(result?.output, ['Received: FORWARD_SPEED_100']);
    assert.strictEqual(getGlobalBluetoothRx(), '');
    console.log('✅ PASS: readString() full buffer retrieval verified');
  }

  // 5. Bluetooth-driven GPIO actuation (if c == 'F' -> digitalWrite HIGH, if c == 'S' -> digitalWrite LOW)
  {
    console.log('Test 5: Bluetooth-driven GPIO actuation');
    clearBluetoothSerialSession();
    clearGlobalBluetoothRx();
    const code = `
#include <BluetoothSerial.h>

BluetoothSerial SerialBT;
const int ledPin = 2;

void setup() {
  pinMode(ledPin, OUTPUT);
  SerialBT.begin("ESP32_Controller");
}

void loop() {
  if (SerialBT.available()) {
    char c = SerialBT.read();
    if (c == 'F') {
      digitalWrite(ledPin, HIGH);
    } else if (c == 'S') {
      digitalWrite(ledPin, LOW);
    }
  }
}
    `;

    // With 'F' in Bluetooth RX
    pushGlobalBluetoothRx('F');
    const actionsF = evaluateEsp32CppConditionals(code, new Map(), {});
    const actionF = actionsF.find((a) => a.pin === 2);
    assert.ok(actionF, 'Expected GPIO 2 action for cmd F');
    assert.strictEqual((actionF as any).value, 1, 'Expected GPIO 2 HIGH when receiving F');

    // With 'S' in Bluetooth RX
    clearGlobalBluetoothRx();
    pushGlobalBluetoothRx('S');
    const actionsS = evaluateEsp32CppConditionals(code, new Map(), {});
    const actionS = actionsS.find((a) => a.pin === 2);
    assert.ok(actionS, 'Expected GPIO 2 action for cmd S');
    assert.strictEqual((actionS as any).value, 0, 'Expected GPIO 2 LOW when receiving S');
    console.log('✅ PASS: Bluetooth conditional GPIO actuation (F -> HIGH, S -> LOW) verified');
  }

  // 6. Simultaneous dual-channel isolation (USB Serial vs Bluetooth Serial)
  {
    console.log('Test 6: Simultaneous dual-channel isolation (USB Serial vs Bluetooth Serial)');
    clearBluetoothSerialSession();
    clearGlobalBluetoothRx();
    resetEsp32CppSerialSessions();

    const code = `
#include <BluetoothSerial.h>

BluetoothSerial SerialBT;

void setup() {
  Serial.begin(115200);
  SerialBT.begin("ESP32_Dual_Channel");

  Serial.println("USB Serial Ready");
  SerialBT.println("Bluetooth Serial Ready");
}

void loop() {
}
    `;

    const btResult = evaluateEsp32CppBluetoothSerial(code);
    const usbResult = evaluateEsp32CppSerial(code);

    assert(btResult !== null);
    assert.deepStrictEqual(btResult.output, ['Bluetooth Serial Ready']);
    assert.strictEqual(btResult.deviceName, 'ESP32_Dual_Channel');

    assert.deepStrictEqual(usbResult.allLines, ['USB Serial Ready']);

    // Ensure zero cross-contamination
    assert(btResult.output.includes('Bluetooth Serial Ready'));
    assert(!btResult.output.includes('USB Serial Ready'));
    assert(usbResult.allLines.includes('USB Serial Ready'));
    assert(!usbResult.allLines.includes('Bluetooth Serial Ready'));
    console.log('✅ PASS: Dual-channel isolation verified — zero cross-talk between USB Serial & Bluetooth Serial');
  }

  // 7. End-to-end Simulation Frame pipeline integration
  {
    console.log('Test 7: End-to-end Simulation Frame pipeline integration');
    clearBluetoothSerialSession();
    clearGlobalBluetoothRx();

    const code = `
#include <BluetoothSerial.h>

BluetoothSerial SerialBT;

void setup() {
  SerialBT.begin("ESP32_E2E");
  SerialBT.println("Frame Test OK");
}

void loop() {
}
    `;

    const esp32Node = createEsp32Node();
    const baseFrame = buildSimulationFrame({
      nodes: [esp32Node],
      edges: [],
      boardType: 'esp32',
      tick: 0,
      running: true,
    });
    const updatedFrame = applyEsp32SimulationToFrame(baseFrame, {
      nodes: [esp32Node],
      edges: [],
      arduinoCode: code,
      picoCode: '',
      boardType: 'esp32',
      selectedLanguage: 'cpp',
      tick: 0,
    } as any);

    assert.ok(updatedFrame.bluetoothOutput, 'bluetoothOutput should exist on frame');
    assert.deepStrictEqual(updatedFrame.bluetoothOutput, ['Frame Test OK']);
    assert.strictEqual(updatedFrame.bluetoothDeviceName, 'ESP32_E2E');
    console.log('✅ PASS: Frame transformer correctly propagates bluetoothOutput and bluetoothDeviceName');
  }

  // 8. extractCppBluetoothVariables state extraction
  {
    console.log('Test 8: extractCppBluetoothVariables state extraction');
    clearBluetoothSerialSession();
    clearGlobalBluetoothRx();
    const code = `
BluetoothSerial SerialBT;
void setup() {
  SerialBT.begin("My_ESP32");
}
void loop() {
  if (SerialBT.available()) {
    char cmd = SerialBT.read();
  }
}
    `;

    pushGlobalBluetoothRx('X');
    const localVars = new Map<string, any>();
    extractCppBluetoothVariables(code, {}, localVars);
    assert.strictEqual(localVars.get('SerialBT.available()'), 1);
    assert.strictEqual(localVars.get('SerialBT.connected()'), 1);
    assert.strictEqual(localVars.get('cmd'), 'X');
    console.log('✅ PASS: Variable extraction from Bluetooth stream verified');
  }

  // 9. Arduino / Pico Circuit Isolation & Store Shape Safety
  {
    console.log('Test 9: Arduino / Pico Circuit Isolation & Store Shape Safety');
    clearBluetoothSerialSession();
    clearGlobalBluetoothRx();

    const arduinoNode: CircuitNode = {
      id: 'arduino_1',
      type: 'arduino',
      position: { x: 50, y: 50 },
      data: {
        componentType: 'arduino',
        label: 'Arduino Uno',
        simulationModel: 'arduino',
        properties: {},
        rotation: 0,
      },
    };

    const baseFrame = buildSimulationFrame({
      nodes: [arduinoNode],
      edges: [],
      boardType: 'arduino',
      tick: 0,
      running: true,
    });

    // Verify Arduino simulation frame defaults
    assert.strictEqual((baseFrame as any).bluetoothOutput, undefined);
    assert.strictEqual((baseFrame as any).bluetoothDeviceName, undefined);
    console.log('✅ PASS: Arduino/Pico simulation frame has no Bluetooth leak');
  }

  console.log('\n🎉 ALL ESP32 C++ BluetoothSerial tests passed!');
  return true;
}

if (process.argv[1] && (process.argv[1].endsWith('esp32CppBluetoothSerial.test.ts') || process.argv[1].endsWith('esp32CppBluetoothSerial.test.js'))) {
  runEsp32CppBluetoothSerialTests();
}

