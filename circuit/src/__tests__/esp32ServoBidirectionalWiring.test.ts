import assert from 'assert';
import { applyEsp32SimulationToFrame } from '../lib/simulation/frameTransformers/esp32';
import { checkComponentStatus } from '../utils/componentStatus';
import { validateComponentConnections } from '../utils/connectivity';
import type { CircuitNode, CircuitEdge } from '../lib/types';
import type { SimulationFrame } from '../lib/simulation-state';
import type { SimContext } from '../lib/simulation/types';

/**
 * Regression test suite for ESP32 + Servo bidirectional wiring & disconnected warning.
 */
export function runEsp32ServoBidirectionalWiringTests(): boolean {
  console.log('--- RUNNING ESP32 SERVO BIDIRECTIONAL WIRING TESTS ---');
  let passed = true;

  const esp32Node: CircuitNode = {
    id: 'esp32-1',
    type: 'esp32',
    position: { x: 0, y: 0 },
    data: { componentType: 'esp32', simulationModel: 'esp32', label: 'ESP32', properties: {} } as any,
  };

  const servoNode: CircuitNode = {
    id: 'servo-1',
    type: 'servo',
    position: { x: 200, y: 0 },
    data: { componentType: 'servo', simulationModel: 'servo', label: 'Micro Servo', properties: {} } as any,
  };

  const nodes = [esp32Node, servoNode];

  const pythonCode = `
from machine import Pin, PWM
servo = PWM(Pin(18), freq=50)
servo.duty_u16(4915) # 90 degrees
`;

  // --- Test 1: Standard Forward Wiring (ESP32 -> Servo) ---
  {
    const edgesForward: CircuitEdge[] = [
      { id: 'e1', source: 'esp32-1', sourceHandle: 'gpio18', target: 'servo-1', targetHandle: 'signal' },
      { id: 'e2', source: 'esp32-1', sourceHandle: 'esp32_3v3', target: 'servo-1', targetHandle: 'power' },
      { id: 'e3', source: 'esp32-1', sourceHandle: 'esp32_gnd1', target: 'servo-1', targetHandle: 'ground' },
    ];

    const ctx: SimContext = {
      nodes, edges: edgesForward, arduinoCode: '', picoCode: pythonCode, boardType: 'esp32', selectedLanguage: 'python', dynamicComponents: [],
    } as any;

    const baseFrame: SimulationFrame = {
      tick: 1, boardType: 'esp32', running: true, error: null, serialOutput: [],
      components: {
        'servo-1': { nodeId: 'servo-1', componentType: 'servo', label: 'Micro Servo', isPowered: false, brightness: 0, voltage: 0, pins: {}, telemetry: {} },
      },
      timestamp: 100, boardPins: [],
    } as any;

    const outFrame = applyEsp32SimulationToFrame(baseFrame, ctx);
    const servoState = outFrame.components['servo-1'];
    const status = checkComponentStatus(
      'servo',
      servoState?.telemetry ? { ...servoState.telemetry, isPowered: servoState.isPowered } : { isPowered: servoState?.isPowered },
      {}
    );

    const isConnected = validateComponentConnections(servoNode, nodes, edgesForward);
    const ok = isConnected && servoState?.isPowered === true && servoState?.telemetry?.angle === 90 && status.severity === 'none';

    if (ok) {
      console.log('✅ Test 1 Passed: Standard Forward Wiring (ESP32 -> Servo) isPowered=true, angle=90, no warning');
    } else {
      console.error('❌ Test 1 Failed: Forward Wiring mismatch', { isConnected, servoState, status });
      passed = false;
    }
  }

  // --- Test 2: Reverse Wiring (Servo -> ESP32) ---
  {
    const edgesReverse: CircuitEdge[] = [
      { id: 'e1', source: 'servo-1', sourceHandle: 'signal', target: 'esp32-1', targetHandle: 'gpio18' },
      { id: 'e2', source: 'servo-1', sourceHandle: 'power', target: 'esp32-1', targetHandle: 'esp32_3v3' },
      { id: 'e3', source: 'servo-1', sourceHandle: 'ground', target: 'esp32-1', targetHandle: 'esp32_gnd1' },
    ];

    const ctx: SimContext = {
      nodes, edges: edgesReverse, arduinoCode: '', picoCode: pythonCode, boardType: 'esp32', selectedLanguage: 'python', dynamicComponents: [],
    } as any;

    const baseFrame: SimulationFrame = {
      tick: 1, boardType: 'esp32', running: true, error: null, serialOutput: [],
      components: {
        'servo-1': { nodeId: 'servo-1', componentType: 'servo', label: 'Micro Servo', isPowered: false, brightness: 0, voltage: 0, pins: {}, telemetry: {} },
      },
      timestamp: 100, boardPins: [],
    } as any;

    const outFrame = applyEsp32SimulationToFrame(baseFrame, ctx);
    const servoState = outFrame.components['servo-1'];
    const status = checkComponentStatus(
      'servo',
      servoState?.telemetry ? { ...servoState.telemetry, isPowered: servoState.isPowered } : { isPowered: servoState?.isPowered },
      {}
    );

    const isConnected = validateComponentConnections(servoNode, nodes, edgesReverse);
    const ok = isConnected && servoState?.isPowered === true && servoState?.telemetry?.angle === 90 && status.severity === 'none';

    if (ok) {
      console.log('✅ Test 2 Passed: Reverse Wiring (Servo -> ESP32) isPowered=true, angle=90, no warning');
    } else {
      console.error('❌ Test 2 Failed: Reverse Wiring mismatch', { isConnected, servoState, status });
      passed = false;
    }
  }

  // --- Test 3: Genuinely Disconnected Servo (Missing Wires) -> Warning MUST appear ---
  {
    const edgesDisconnected: CircuitEdge[] = []; // No wires at all

    const ctx: SimContext = {
      nodes, edges: edgesDisconnected, arduinoCode: '', picoCode: pythonCode, boardType: 'esp32', selectedLanguage: 'python', dynamicComponents: [],
    } as any;

    const baseFrame: SimulationFrame = {
      tick: 1, boardType: 'esp32', running: true, error: null, serialOutput: [],
      components: {
        'servo-1': { nodeId: 'servo-1', componentType: 'servo', label: 'Micro Servo', isPowered: false, brightness: 0, voltage: 0, pins: {}, telemetry: {} },
      },
      timestamp: 100, boardPins: [],
    } as any;

    const outFrame = applyEsp32SimulationToFrame(baseFrame, ctx);
    const servoState = outFrame.components['servo-1'];
    const status = checkComponentStatus(
      'servo',
      servoState?.telemetry ? { ...servoState.telemetry, isPowered: servoState.isPowered } : { isPowered: servoState?.isPowered },
      {}
    );

    const isConnected = validateComponentConnections(servoNode, nodes, edgesDisconnected);
    const warningShown = !isConnected && servoState?.isPowered === false && status.severity === 'warning' && status.message === 'Servo Pins Disconnected';

    if (warningShown) {
      console.log('✅ Test 3 Passed: Genuinely Disconnected Servo correctly triggers "Servo Pins Disconnected" warning');
    } else {
      console.error('❌ Test 3 Failed: Disconnected warning did not trigger', { isConnected, servoState, status });
      passed = false;
    }
  }

  return passed;
}

if (require.main === module) {
  const ok = runEsp32ServoBidirectionalWiringTests();
  process.exit(ok ? 0 : 1);
}
