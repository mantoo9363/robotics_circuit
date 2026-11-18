import { applyEsp32SimulationToFrame } from '../lib/simulation/frameTransformers/esp32';
import { applyKeypad4x4InputToFrame } from '../lib/simulation/frameTransformers/keypad';
import { KeypadStateManager } from '../lib/simulation/stateMaps';
import { checkComponentStatus } from '../utils/componentStatus';
import type { CircuitNode, CircuitEdge } from '../lib/types';
import type { SimulationFrame } from '../lib/simulation-state';
import type { SimContext } from '../lib/simulation/types';

/**
 * Regression: ESP32 + servo + FULLY-WIRED 4x4 keypad.
 *
 * `applyKeypad4x4InputToFrame` rebuilds the whole component map via
 * `buildSimulationFrame()` when the keypad passes connectivity (all 8 pins
 * wired). That rebuild has no ESP32 servo/PWM evaluator, so it used to reset the
 * servo — powered one transformer earlier by `applyEsp32SimulationToFrame` — to
 * `isPowered:false, telemetry:{}`, surfacing a false "Servo Pins Disconnected"
 * badge. Removing any one keypad wire hid the bug (keypad early-returns).
 *
 * The fix (`preserveUpstreamComponentState`) must keep the servo powered after
 * the keypad transformer, at every tick, whether or not the keypad is fully
 * wired.
 */
const ESP32_ID = 'esp32-1';
const SERVO_ID = 'servo-1';
const KEYPAD_ID = 'kp-1';

const PY_CODE = `
from machine import Pin, PWM
import time

rows = [Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(27, Pin.OUT), Pin(26, Pin.OUT)]
cols = [Pin(25, Pin.IN, Pin.PULL_UP), Pin(33, Pin.IN, Pin.PULL_UP),
        Pin(32, Pin.IN, Pin.PULL_UP), Pin(23, Pin.IN, Pin.PULL_UP)]

servo = PWM(Pin(18))
servo.freq(50)

def set_angle(angle):
    min_duty = 1638
    max_duty = 8192
    duty = int(min_duty + (angle / 180) * (max_duty - min_duty))
    servo.duty_u16(duty)

set_angle(0)

while True:
    for row in rows:
        row.value(1)
    time.sleep_ms(20)
`;

function nodes(): CircuitNode[] {
  return [
    { id: ESP32_ID, type: 'esp32', position: { x: 0, y: 0 },
      data: { componentType: 'esp32', simulationModel: 'esp32', label: 'ESP32', properties: {} } as any },
    { id: SERVO_ID, type: 'servo', position: { x: 300, y: 0 },
      data: { componentType: 'servo', simulationModel: 'servo', label: 'SERVO1', properties: {} } as any },
    { id: KEYPAD_ID, type: 'keypad4x4', position: { x: -300, y: 0 },
      data: { componentType: 'keypad4x4', simulationModel: 'keypad4x4', label: 'Keypad 4x4',
        properties: { pressedKeys: { label: 'Pressed Keys', type: 'string', value: '' } } } as any },
  ];
}

const SERVO_EDGES: CircuitEdge[] = [
  { id: 'sv-sig', source: SERVO_ID, sourceHandle: 'signal', target: ESP32_ID, targetHandle: 'gpio18' },
  { id: 'sv-pwr', source: SERVO_ID, sourceHandle: 'power', target: ESP32_ID, targetHandle: 'esp32_3v3' },
  { id: 'sv-gnd', source: ESP32_ID, sourceHandle: 'esp32_gnd1', target: SERVO_ID, targetHandle: 'ground' },
];

const KEYPAD_EDGES: CircuitEdge[] = [
  { id: 'kp-r1', source: KEYPAD_ID, sourceHandle: 'row1', target: ESP32_ID, targetHandle: 'gpio13' },
  { id: 'kp-r2', source: KEYPAD_ID, sourceHandle: 'row2', target: ESP32_ID, targetHandle: 'gpio14' },
  { id: 'kp-r3', source: KEYPAD_ID, sourceHandle: 'row3', target: ESP32_ID, targetHandle: 'gpio27' },
  { id: 'kp-r4', source: KEYPAD_ID, sourceHandle: 'row4', target: ESP32_ID, targetHandle: 'gpio26' },
  { id: 'kp-c1', source: KEYPAD_ID, sourceHandle: 'column1', target: ESP32_ID, targetHandle: 'gpio25' },
  { id: 'kp-c2', source: KEYPAD_ID, sourceHandle: 'column2', target: ESP32_ID, targetHandle: 'gpio33' },
  { id: 'kp-c3', source: KEYPAD_ID, sourceHandle: 'column3', target: ESP32_ID, targetHandle: 'gpio32' },
  { id: 'kp-c4', source: KEYPAD_ID, sourceHandle: 'column4', target: ESP32_ID, targetHandle: 'gpio23' },
];

function ctx(edges: CircuitEdge[]): SimContext {
  return {
    nodes: nodes(), edges, arduinoCode: PY_CODE, picoCode: PY_CODE,
    boardType: 'esp32', selectedLanguage: 'python', dynamicComponents: [],
    keypad4x4State: new KeypadStateManager(),
  } as any;
}

function freshFrame(tick: number): SimulationFrame {
  return {
    tick, boardType: 'esp32', running: true, error: null, serialOutput: [],
    timestamp: tick * 100, boardPins: [],
    components: {
      [SERVO_ID]: { nodeId: SERVO_ID, componentType: 'servo', label: 'SERVO1',
        isPowered: false, brightness: 0, voltage: 0, pins: {}, telemetry: {} },
      [KEYPAD_ID]: { nodeId: KEYPAD_ID, componentType: 'keypad4x4', label: 'Keypad 4x4',
        isPowered: false, brightness: 0, voltage: 0, pins: {}, telemetry: {} },
    },
  } as any;
}

/** Runs the two pipeline transformers that matter, in framePipeline order. */
function runPipelineSlice(c: SimContext, tick: number): SimulationFrame {
  let f = freshFrame(tick);
  f = applyEsp32SimulationToFrame(f, c);
  f = applyKeypad4x4InputToFrame(f, c);
  return f;
}

export function runEsp32ServoKeypadPipelineTests(): boolean {
  console.log('--- RUNNING ESP32 SERVO + FULLY-WIRED KEYPAD PIPELINE TESTS ---');
  let passed = true;

  // --- Test 1: 11 wires (keypad fully wired) — servo must stay powered every tick ---
  {
    const c = ctx([...SERVO_EDGES, ...KEYPAD_EDGES]);
    let ok = true;
    const samples: Record<string, unknown>[] = [];
    for (let tick = 2; tick <= 8; tick++) {
      const out = runPipelineSlice(c, tick);
      const sv = out.components[SERVO_ID];
      const kp = out.components[KEYPAD_ID];
      const status = checkComponentStatus('servo', { ...(sv?.telemetry ?? {}), isPowered: sv?.isPowered }, {});
      samples.push({ tick, sv: sv?.isPowered, angle: sv?.telemetry?.angle, kp: kp?.isPowered, sev: status.severity });
      if (sv?.isPowered !== true) ok = false;
      if (sv?.telemetry?.signalPin !== 18) ok = false;
      if (status.severity !== 'none') ok = false;
      if (kp?.isPowered !== true) ok = false; // keypad itself still works
    }
    if (ok) {
      console.log('✅ Test 1 Passed: servo stays isPowered:true (severity none) at all ticks with 11 wires; keypad still powered');
    } else {
      console.error('❌ Test 1 Failed: servo/keypad state regressed at 11 wires', samples);
      passed = false;
    }
  }

  // --- Test 2: 10 wires (one keypad wire missing) — servo still powered (no regression) ---
  {
    const c = ctx([...SERVO_EDGES, ...KEYPAD_EDGES.slice(0, 7)]); // drop column4
    let ok = true;
    for (let tick = 2; tick <= 6; tick++) {
      const out = runPipelineSlice(c, tick);
      const sv = out.components[SERVO_ID];
      if (sv?.isPowered !== true || sv?.telemetry?.signalPin !== 18) ok = false;
    }
    if (ok) {
      console.log('✅ Test 2 Passed: servo stays isPowered:true with 10 wires (keypad not fully wired)');
    } else {
      console.error('❌ Test 2 Failed: servo regressed at 10 wires');
      passed = false;
    }
  }

  // --- Test 3: keypad-only regression guard — a genuinely disconnected servo stays disconnected ---
  {
    const c = ctx([...KEYPAD_EDGES]); // servo has NO wires at all
    const out = runPipelineSlice(c, 4);
    const sv = out.components[SERVO_ID];
    const status = checkComponentStatus('servo', { ...(sv?.telemetry ?? {}), isPowered: sv?.isPowered }, {});
    const ok = sv?.isPowered === false && status.severity === 'warning' && status.message === 'Servo Pins Disconnected';
    if (ok) {
      console.log('✅ Test 3 Passed: unwired servo still correctly reports "Servo Pins Disconnected"');
    } else {
      console.error('❌ Test 3 Failed: unwired servo no longer flags disconnected', { sv, status });
      passed = false;
    }
  }

  return passed;
}

if (require.main === module) {
  const ok = runEsp32ServoKeypadPipelineTests();
  process.exit(ok ? 0 : 1);
}
