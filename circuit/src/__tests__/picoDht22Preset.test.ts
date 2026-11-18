/**
 * Test Suite for Pico + DHT22 Sensor Circuit Preset
 */

import { strict as assert } from 'assert';
import { CIRCUIT_PRESETS } from '../lib/circuit-presets';
import { applyPicoSimulationToFrame } from '../lib/simulation/frameTransformers/pico';
import { buildSimulationFrame } from '../lib/simulation-state';
import { useCircuitStore } from '../lib/store';

export function runPicoDht22PresetTests(): boolean {
  console.log('=== Running Pico + DHT22 Preset Validation Tests ===\n');

  // 1. Verify preset existence and metadata
  const preset = CIRCUIT_PRESETS.find((p) => p.id === 'pico-dht22');
  assert.ok(preset, "Preset 'pico-dht22' must be registered in CIRCUIT_PRESETS");
  assert.strictEqual(preset.label, 'Pico + DHT22 Sensor');
  assert.strictEqual(preset.group, 'Raspberry Pi Pico');
  console.log('=> Test 1 Passed: Preset registered with correct label and group.');

  // 2. Verify nodes and initial values
  const picoNode = preset.nodes.find((n) => n.type === 'raspberrypipico');
  const dhtNode = preset.nodes.find((n) => n.type === 'dht22');
  assert.ok(picoNode, 'Pico node must be present in preset');
  assert.ok(dhtNode, 'DHT22 node must be present in preset');
  assert.strictEqual(dhtNode.data.properties.temperature.value, 75.1);
  assert.strictEqual(dhtNode.data.properties.humidity.value, 19.9);
  console.log('=> Test 2 Passed: Preset nodes and default properties (75.1 C, 19.9 %) verified.');

  // 3. Verify wire connectivity
  const dataEdge = preset.edges.find(
    (e) =>
      (e.source === dhtNode.id && e.sourceHandle === 'data' && e.target === picoNode.id && e.targetHandle === 'gp15') ||
      (e.target === dhtNode.id && e.targetHandle === 'data' && e.source === picoNode.id && e.sourceHandle === 'gp15')
  );
  const vccEdge = preset.edges.find(
    (e) =>
      (e.source === dhtNode.id && e.sourceHandle === 'vcc' && e.target === picoNode.id && e.targetHandle === 'pico_vbus') ||
      (e.target === dhtNode.id && e.targetHandle === 'vcc' && e.source === picoNode.id && e.sourceHandle === 'pico_vbus')
  );
  const gndEdge = preset.edges.find(
    (e) =>
      (e.source === dhtNode.id && e.sourceHandle === 'gnd' && e.target === picoNode.id && e.targetHandle === 'pico_gnd1') ||
      (e.target === dhtNode.id && e.targetHandle === 'gnd' && e.source === picoNode.id && e.sourceHandle === 'pico_gnd1')
  );

  assert.ok(dataEdge, 'DHT22 data pin must connect to Pico GP15');
  assert.ok(vccEdge, 'DHT22 VCC pin must connect to Pico VBUS');
  assert.ok(gndEdge, 'DHT22 GND pin must connect to Pico GND1');
  console.log('=> Test 3 Passed: All circuit wiring verified.');

  // 4. Test MicroPython execution with preset code
  assert.ok(preset.picoCode, 'Preset must include MicroPython code');
  
  useCircuitStore.setState({
    nodes: preset.nodes,
    edges: preset.edges,
    picoCode: preset.picoCode,
  });

  const frame1 = buildSimulationFrame({
    tick: 1,
    nodes: preset.nodes,
    edges: preset.edges,
    boardType: 'pico',
    running: true,
    timestamp: 0,
  });

  const res1 = applyPicoSimulationToFrame(frame1, {
    nodes: preset.nodes,
    edges: preset.edges,
    picoCode: preset.picoCode,
  } as any);

  console.log('[Test 4] res1.serialOutput:', JSON.stringify(res1.serialOutput));
  assert.strictEqual(res1.serialOutput[0], 'DHT22 SENSOR');
  assert.strictEqual(res1.serialOutput[1], 'Temperature: 75.1 C | Humidity: 19.9 %');
  console.log('=> Test 4 Passed: MicroPython code correctly reads DHT22 initial values (75.1 C, 19.9 %).');

  // 5. Dynamic slider change test
  const updatedNodes: any[] = preset.nodes.map((node) => {
    if (node.id === dhtNode.id) {
      return {
        ...node,
        data: {
          ...node.data,
          properties: {
            ...node.data.properties,
            temperature: { ...(node.data.properties?.temperature ?? {}), value: 28.4 },
            humidity: { ...(node.data.properties?.humidity ?? {}), value: 65.2 },
          },
        },
      };
    }
    return node;
  });

  useCircuitStore.setState({
    nodes: updatedNodes,
    edges: preset.edges,
    picoCode: preset.picoCode,
  });

  // Step intermediate frame at 1000ms
  applyPicoSimulationToFrame(
    buildSimulationFrame({
      tick: 2,
      nodes: updatedNodes,
      edges: preset.edges,
      boardType: 'pico',
      running: true,
      timestamp: 1000,
    }),
    {
      nodes: updatedNodes,
      edges: preset.edges,
      picoCode: preset.picoCode,
    } as any
  );

  // Step frame at 2000ms
  applyPicoSimulationToFrame(
    buildSimulationFrame({
      tick: 3,
      nodes: updatedNodes,
      edges: preset.edges,
      boardType: 'pico',
      running: true,
      timestamp: 2000,
    }),
    {
      nodes: updatedNodes,
      edges: preset.edges,
      picoCode: preset.picoCode,
    } as any
  );

  // Step frame at 3000ms (after 2s sleep expired)
  const frameFinal = buildSimulationFrame({
    tick: 4,
    nodes: updatedNodes,
    edges: preset.edges,
    boardType: 'pico',
    running: true,
    timestamp: 3000,
  });

  const res2 = applyPicoSimulationToFrame(frameFinal, {
    nodes: updatedNodes,
    edges: preset.edges,
    picoCode: preset.picoCode,
  } as any);

  console.log('[Test 5] res2.serialOutput:', JSON.stringify(res2.serialOutput));
  assert.strictEqual(res2.serialOutput[0], 'DHT22 SENSOR');
  assert.strictEqual(res2.serialOutput[1], 'Temperature: 28.4 C | Humidity: 65.2 %');
  console.log('=> Test 5 Passed: Dynamic slider update correctly reflected in serial monitor output.');

  console.log('\nAll Pico + DHT22 Preset Tests Passed! ✅\n');
  return true;
}

if (process.argv[1]?.includes('picoDht22Preset')) {
  runPicoDht22PresetTests();
}
