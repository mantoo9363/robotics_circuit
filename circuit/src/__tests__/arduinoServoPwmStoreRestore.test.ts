import { useCircuitStore, applySimulationFrameFromSocket } from "../lib/store";
import type { SimulationFrame } from "../lib/simulation-state";

/**
 * Regression: keypad door-lock servo on Arduino/AVR — horn never rotated in the
 * UI even though the server sent angle 90 (works fine on ESP32).
 *
 * `applySimulationFrameToStore` rebuilds Arduino/Pico socket frames through the
 * client `buildSimulationFrame`, which has NO `servoAngles` path — so the
 * server-measured `telemetry.angle` (angleSource: "pwm") was dropped before it
 * reached the store, and the servo SVG (which rotates off
 * `simulationFrame.components[id].telemetry.angle`) stayed at 0°. ESP32 has no
 * such rebuild, which is why it already worked there.
 *
 * Fix: capture the `angleSource === "pwm"` servo components before the rebuild
 * and restore them after it (store-legacy.ts).
 */
const UNO = "uno-1";
const SERVO = "sv-1";

const SKETCH = `
#include <Keypad.h>
#include <Servo.h>
Servo doorServo;
void setup(){ doorServo.attach(3); doorServo.write(0); }
void loop(){ if (entered=="4545"){ doorServo.write(90); delay(3000); doorServo.write(0); } }
`;

function seedStore() {
  useCircuitStore.setState({
    nodes: [
      { id: UNO, type: "arduino", position: { x: 0, y: 0 },
        data: { componentType: "arduino", simulationModel: "arduino", label: "Uno", properties: {} } } as any,
      { id: SERVO, type: "servo", position: { x: 200, y: 0 },
        data: { componentType: "servo", simulationModel: "servo", label: "SERVO1", properties: {} } } as any,
    ],
    edges: [
      { id: "e-sig", source: SERVO, sourceHandle: "signal", target: UNO, targetHandle: "d3" },
      { id: "e-pwr", source: SERVO, sourceHandle: "power", target: UNO, targetHandle: "5v" },
      { id: "e-gnd", source: UNO, sourceHandle: "gnd1", target: SERVO, targetHandle: "ground" },
    ] as any,
    arduinoCode: SKETCH,
    currentSimulationSessionId: null,
    simulationStartTimestamp: null,
  } as any);
}

function socketFrame(angle: number): SimulationFrame {
  return {
    tick: 50, boardType: "arduino", running: true, error: null, serialOutput: ["ACCESS GRANTED", "Door OPEN"],
    timestamp: 0, boardPins: [], sessionId: undefined,
    components: {
      [SERVO]: {
        nodeId: SERVO, componentType: "servo", label: "SERVO1",
        isPowered: true, brightness: 1, voltage: 0, pins: {},
        telemetry: { angle, signalPin: 3, angleSource: "pwm", pulseUs: angle === 90 ? 1472 : 544 },
      },
    },
  } as any;
}

export function runArduinoServoPwmStoreRestoreTests(): boolean {
  console.log("--- RUNNING ARDUINO SERVO PWM STORE-RESTORE TESTS ---");
  let passed = true;

  // 1. Server sends angle 90 (Door OPEN) -> store keeps 90 through the rebuild.
  {
    seedStore();
    applySimulationFrameFromSocket(socketFrame(90));
    const t = useCircuitStore.getState().simulationFrame?.components[SERVO]?.telemetry as any;
    const ok = t?.angle === 90 && t?.angleSource === "pwm";
    console.log(ok
      ? "✅ Test 1: store servo telemetry.angle === 90 after socket frame (rebuild did not drop it)"
      : `❌ Test 1: got ${JSON.stringify(t)}`);
    if (!ok) passed = false;
  }

  // 2. Then server sends angle 0 (Door CLOSED) -> store follows back to 0.
  {
    applySimulationFrameFromSocket(socketFrame(0));
    const t = useCircuitStore.getState().simulationFrame?.components[SERVO]?.telemetry as any;
    const ok = t?.angle === 0 && t?.angleSource === "pwm";
    console.log(ok ? "✅ Test 2: store servo telemetry.angle back to 0" : `❌ Test 2: got ${JSON.stringify(t)}`);
    if (!ok) passed = false;
  }

  return passed;
}

if (require.main === module) {
  process.exit(runArduinoServoPwmStoreRestoreTests() ? 0 : 1);
}
