import { applyServoInputToFrame } from "../lib/simulation/frameTransformers/servo";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import type { SimulationFrame } from "../lib/simulation-state";

/**
 * Regression: keypad door-lock on Arduino/AVR.
 *
 * The server (arduino-simulator) measures the real `Servo.h` pulse width off the
 * AVR run and emits `telemetry.angle` with `angleSource: "pwm"` — e.g. 90° while
 * `doorServo.write(90)` holds during the "Door OPEN" window. The client pipeline
 * then ran `applyServoInputToFrame`, which re-derived the angle from a
 * regex-parsed `loop()` timeline (`parseServoSequence`) that can't see the
 * keypad-/`if`-gated `write()` calls, and overwrote the real 90° with a stale
 * timeline value (0°) — so the horn never appeared to rotate.
 *
 * Fix: `applyServoInputToFrame` (and `applyServoSteeringButtonInputToFrame`)
 * bail out when the incoming frame already carries `angleSource: "pwm"`.
 */
const ARDUINO_ID = "uno-1";
const SERVO_ID = "sv-1";

const SKETCH = `
#include <Keypad.h>
#include <Servo.h>
Servo doorServo;
void setup() { doorServo.attach(3); doorServo.write(0); }
void loop() {
  if (entered == "4545") {
    doorServo.write(90);
    delay(3000);
    doorServo.write(0);
  }
}
`;

function nodes(): CircuitNode[] {
  return [
    { id: ARDUINO_ID, type: "arduino", position: { x: 0, y: 0 },
      data: { componentType: "arduino", simulationModel: "arduino", label: "Uno", properties: {} } as any },
    { id: SERVO_ID, type: "servo", position: { x: 200, y: 0 },
      data: { componentType: "servo", simulationModel: "servo", label: "SERVO1", properties: {} } as any },
  ];
}

const EDGES: CircuitEdge[] = [
  { id: "e-sig", source: SERVO_ID, sourceHandle: "signal", target: ARDUINO_ID, targetHandle: "d3" },
  { id: "e-pwr", source: SERVO_ID, sourceHandle: "power", target: ARDUINO_ID, targetHandle: "5v" },
  { id: "e-gnd", source: ARDUINO_ID, sourceHandle: "gnd1", target: SERVO_ID, targetHandle: "ground" },
];

function frame(servoTelemetry: Record<string, unknown>): SimulationFrame {
  return {
    tick: 40, boardType: "arduino", running: true, error: null, serialOutput: [],
    timestamp: 60_000, boardPins: [],
    components: {
      [SERVO_ID]: {
        nodeId: SERVO_ID, componentType: "servo", label: "SERVO1",
        isPowered: true, brightness: 1, voltage: 0, pins: {},
        telemetry: servoTelemetry as any,
      },
    },
  } as any;
}

export function runArduinoServoPwmAngleNotClobberedTests(): boolean {
  console.log("--- RUNNING ARDUINO SERVO PWM-ANGLE NOT-CLOBBERED TESTS ---");
  let passed = true;
  const ctx = { nodes: nodes(), edges: EDGES, arduinoCode: SKETCH, picoCode: "" };

  // 1. Server-measured 90° (angleSource:"pwm") must survive the transformer.
  {
    const out = applyServoInputToFrame(frame({ angle: 90, signalPin: 3, angleSource: "pwm", pulseUs: 1472 }), ctx);
    const t = out.components[SERVO_ID]?.telemetry as any;
    const ok = t?.angle === 90 && t?.angleSource === "pwm";
    console.log(ok
      ? "✅ Test 1: server pwm angle 90 preserved (not overwritten by loop() timeline)"
      : `❌ Test 1: angle got clobbered -> ${JSON.stringify(t)}`);
    if (!ok) passed = false;
  }

  // 2. Server-measured 0° (door locked) also survives — no false movement.
  {
    const out = applyServoInputToFrame(frame({ angle: 0, signalPin: 3, angleSource: "pwm", pulseUs: 544 }), ctx);
    const t = out.components[SERVO_ID]?.telemetry as any;
    const ok = t?.angle === 0 && t?.angleSource === "pwm";
    console.log(ok ? "✅ Test 2: server pwm angle 0 preserved" : `❌ Test 2: -> ${JSON.stringify(t)}`);
    if (!ok) passed = false;
  }

  // 3. Control — WITHOUT angleSource:"pwm" the guard must NOT fire: the
  //    transformer runs its normal path and stamps signalPin from the parsed
  //    sequence (proving it executed, not bailed).
  {
    const out = applyServoInputToFrame(frame({}), ctx);
    const t = out.components[SERVO_ID]?.telemetry as any;
    const ok = t?.signalPin === 3 && t?.angleSource !== "pwm" && typeof t?.angle === "number";
    console.log(ok
      ? `✅ Test 3: no pwm source -> transformer still runs (signalPin=${t?.signalPin}, angle=${t?.angle})`
      : `❌ Test 3: transformer did not run its normal path -> ${JSON.stringify(t)}`);
    if (!ok) passed = false;
  }

  return passed;
}

if (require.main === module) {
  process.exit(runArduinoServoPwmAngleNotClobberedTests() ? 0 : 1);
}
