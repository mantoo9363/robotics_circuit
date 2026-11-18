import { buildSimulationFrame } from '../lib/simulation-state';
import { CIRCUIT_PRESETS } from '../lib/circuit-presets';
import { COMPONENT_CATALOG } from '../lib/circuit-components';
import { useCircuitStore } from '../lib/store';
import type { CircuitNode } from '../lib/types';
import assert from 'node:assert';

console.log('=================== RUNNING PNP TRANSISTOR PRESET REGRESSION TESTS ===================\n');

function runPnpPresetTests() {
  // 1. Arduino PNP DC Motor Switch
  console.log('--- PRESET 1: Arduino + PNP + DC Motor Switch ---');
  const arduinoPnp = CIRCUIT_PRESETS.find(p => p.id === 'arduino-pnp-motor')!;
  assert(arduinoPnp, 'arduino-pnp-motor preset should exist');

  // Case 1A: Base is LOW (D9 = LOW) -> PNP turns ON -> Motor spinning
  useCircuitStore.setState({ nodes: arduinoPnp.nodes, edges: arduinoPnp.edges, simulationStatus: 'running' });
  const frameLow = buildSimulationFrame({
    tick: 1,
    nodes: arduinoPnp.nodes,
    edges: arduinoPnp.edges,
    boardType: 'arduino',
    arduinoState: {
      pins: new Map([[9, { mode: 'OUTPUT', value: 0 }]]), // LOW
      serialOutput: [],
      running: true,
      error: null
    },
    running: true,
    dynamicComponents: COMPONENT_CATALOG
  });

  const motorLow = frameLow.components['pnp-m1'];
  const pnpLow = frameLow.components['pnp-q1'];
  console.log(`  [D9=LOW] PNP state: ${pnpLow.telemetry?.conduction}, Motor powered: ${motorLow.isPowered}, RPM: ${motorLow.telemetry?.rpm}`);
  assert.strictEqual(pnpLow.telemetry?.conduction, 'ON', 'PNP should conduct when base is LOW');
  assert.strictEqual(motorLow.isPowered, true, 'Motor should be powered when PNP conducts');

  // Case 1B: Base is HIGH (D9 = HIGH) -> PNP turns OFF -> Motor stopped
  const frameHigh = buildSimulationFrame({
    tick: 2,
    nodes: arduinoPnp.nodes,
    edges: arduinoPnp.edges,
    boardType: 'arduino',
    arduinoState: {
      pins: new Map([[9, { mode: 'OUTPUT', value: 255 }]]), // HIGH
      serialOutput: [],
      running: true,
      error: null
    },
    running: true,
    dynamicComponents: COMPONENT_CATALOG
  });

  const motorHigh = frameHigh.components['pnp-m1'];
  const pnpHigh = frameHigh.components['pnp-q1'];
  console.log(`  [D9=HIGH] PNP state: ${pnpHigh.telemetry?.conduction}, Motor powered: ${motorHigh.isPowered}`);
  assert.strictEqual(pnpHigh.telemetry?.conduction, 'OFF', 'PNP should be cutoff when base is HIGH');
  assert.strictEqual(motorHigh.isPowered, false, 'Motor should be unpowered when PNP is cutoff');


  // 2. Pico PNP LED Dimmer (PWM)
  console.log('\n--- PRESET 2: Pico + PNP + LED PWM Dimmer ---');
  const picoPnp = CIRCUIT_PRESETS.find(p => p.id === 'pico-pnp-led-dimmer')!;
  assert(picoPnp, 'pico-pnp-led-dimmer preset should exist');

  // Case 2A: Base is LOW (GP15 = 0) -> PNP ON -> LED ON
  const framePicoLow = buildSimulationFrame({
    tick: 1,
    nodes: picoPnp.nodes,
    edges: picoPnp.edges,
    boardType: 'pico',
    arduinoState: {
      pins: new Map([[15, { mode: 'OUTPUT', value: 0 }]]), // 0% duty
      serialOutput: [],
      running: true,
      error: null
    },
    running: true,
    dynamicComponents: COMPONENT_CATALOG
  });

  const ledLow = framePicoLow.components['pnp-led'];
  const pnpPicoLow = framePicoLow.components['pnp-q2'];
  console.log(`  [GP15=0] PNP state: ${pnpPicoLow.telemetry?.conduction}, LED powered: ${ledLow.isPowered}, Brightness: ${ledLow.brightness}`);
  assert.strictEqual(pnpPicoLow.telemetry?.conduction, 'ON', 'PNP should conduct when GP15 is LOW');
  assert.strictEqual(ledLow.isPowered, true, 'LED should be powered');

  // Case 2B: Base is HIGH (GP15 = 255) -> PNP OFF -> LED OFF
  const framePicoHigh = buildSimulationFrame({
    tick: 2,
    nodes: picoPnp.nodes,
    edges: picoPnp.edges,
    boardType: 'pico',
    arduinoState: {
      pins: new Map([[15, { mode: 'OUTPUT', value: 255 }]]), // 100% duty (HIGH)
      serialOutput: [],
      running: true,
      error: null
    },
    running: true,
    dynamicComponents: COMPONENT_CATALOG
  });

  const ledHigh = framePicoHigh.components['pnp-led'];
  const pnpPicoHigh = framePicoHigh.components['pnp-q2'];
  console.log(`  [GP15=255] PNP state: ${pnpPicoHigh.telemetry?.conduction}, LED powered: ${ledHigh.isPowered}`);
  assert.strictEqual(pnpPicoHigh.telemetry?.conduction, 'OFF', 'PNP should be cutoff when GP15 is HIGH');
  assert.strictEqual(ledHigh.isPowered, false, 'LED should be unpowered');


  // 3. Basic PNP Pushbutton LED switch
  console.log('\n--- PRESET 3: Battery + PNP + LED Switch ---');
  const basicPnp = CIRCUIT_PRESETS.find(p => p.id === 'battery-pnp-led')!;
  assert(basicPnp, 'battery-pnp-led preset should exist');

  // Case 3A: Pushbutton pressed -> Base connected to GND -> PNP ON -> LED ON
  const pressedNodes = basicPnp.nodes.map(n => {
    if (n.id === 'pnp-pb') {
      return {
        ...n,
        data: {
          ...n.data,
          properties: {
            ...n.data.properties,
            state: { label: 'State', type: 'select' as const, value: 'on', options: ['off', 'on'] }
          }
        }
      } as any as CircuitNode;
    }
    return n;
  });

  const framePressed = buildSimulationFrame({
    tick: 1,
    nodes: pressedNodes,
    edges: basicPnp.edges,
    boardType: 'arduino',
    running: true,
    dynamicComponents: COMPONENT_CATALOG
  });

  const ledPressed = framePressed.components['pnp-led3'];
  const pnpPressed = framePressed.components['pnp-q3'];
  console.log(`  [Button Pressed] PNP state: ${pnpPressed.telemetry?.conduction}, LED powered: ${ledPressed.isPowered}`);
  assert.strictEqual(pnpPressed.telemetry?.conduction, 'ON', 'PNP should conduct when button is pressed');
  assert.strictEqual(ledPressed.isPowered, true, 'LED should be ON');

  // Case 3B: Pushbutton released -> Base floating -> PNP OFF -> LED OFF
  const frameReleased = buildSimulationFrame({
    tick: 2,
    nodes: basicPnp.nodes, // button released (off) by default
    edges: basicPnp.edges,
    boardType: 'arduino',
    running: true,
    dynamicComponents: COMPONENT_CATALOG
  });

  const ledReleased = frameReleased.components['pnp-led3'];
  const pnpReleased = frameReleased.components['pnp-q3'];
  console.log(`  [Button Released] PNP state: ${pnpReleased.telemetry?.conduction}, LED powered: ${ledReleased.isPowered}`);
  assert.strictEqual(pnpReleased.telemetry?.conduction, 'OFF', 'PNP should be cutoff when button is released');
  assert.strictEqual(ledReleased.isPowered, false, 'LED should be OFF');


  // 4. Arduino PNP/NPN H-Bridge Motor Driver
  console.log('\n--- PRESET 4: Arduino PNP/NPN H-Bridge DC Motor Driver ---');
  const hbPnp = CIRCUIT_PRESETS.find(p => p.id === 'arduino-hbridge-motor')!;
  assert(hbPnp, 'arduino-hbridge-motor preset should exist');

  // Case 4A: Forward direction (D4=HIGH, D5=LOW, D6=HIGH, D7=LOW) -> Spin forward
  useCircuitStore.setState({ nodes: hbPnp.nodes, edges: hbPnp.edges, simulationStatus: 'running' });
  const frameHbFwd = buildSimulationFrame({
    tick: 1,
    nodes: hbPnp.nodes,
    edges: hbPnp.edges,
    boardType: 'arduino',
    arduinoState: {
      pins: new Map([
        [4, { mode: 'OUTPUT', value: 255 }], // Q1 PNP base = HIGH (OFF)
        [5, { mode: 'OUTPUT', value: 0 }],   // Q2 PNP base = LOW  (ON)
        [6, { mode: 'OUTPUT', value: 255 }], // Q3 NPN base = HIGH (ON)
        [7, { mode: 'OUTPUT', value: 0 }]    // Q4 NPN base = LOW  (OFF)
      ]),
      serialOutput: [],
      running: true,
      error: null
    },
    running: true,
    dynamicComponents: COMPONENT_CATALOG
  });

  const motorHbFwd = frameHbFwd.components['hb-m1'];
  console.log('TRANSISTORS IN FORWARD STATE:');
  console.log('  hb-q1 (PNP left) telemetry:', JSON.stringify(frameHbFwd.components['hb-q1'], null, 2));
  console.log('  hb-q2 (PNP right) telemetry:', JSON.stringify(frameHbFwd.components['hb-q2'], null, 2));
  console.log('  hb-q3 (NPN left) telemetry:', JSON.stringify(frameHbFwd.components['hb-q3'], null, 2));
  console.log('  hb-q4 (NPN right) telemetry:', JSON.stringify(frameHbFwd.components['hb-q4'], null, 2));
  console.log('FORWARD MOTOR TELEMETRY:', JSON.stringify(motorHbFwd, null, 2));
  console.log(`  [FORWARD] Motor powered: ${motorHbFwd.isPowered}, Direction: ${motorHbFwd.telemetry?.direction}, RPM: ${motorHbFwd.telemetry?.rpm}`);
  assert.strictEqual(motorHbFwd.isPowered, true, 'Motor should be powered in FORWARD state');
  assert.strictEqual(motorHbFwd.telemetry?.direction, 'reverse', 'Motor direction should be reverse (right-to-left)');

  // Case 4B: Reverse direction (D4=LOW, D5=HIGH, D6=LOW, D7=HIGH) -> Spin reverse
  const frameHbRev = buildSimulationFrame({
    tick: 2,
    nodes: hbPnp.nodes,
    edges: hbPnp.edges,
    boardType: 'arduino',
    arduinoState: {
      pins: new Map([
        [4, { mode: 'OUTPUT', value: 0 }],   // Q1 PNP base = LOW  (ON)
        [5, { mode: 'OUTPUT', value: 255 }], // Q2 PNP base = HIGH (OFF)
        [6, { mode: 'OUTPUT', value: 0 }],   // Q3 NPN base = LOW  (OFF)
        [7, { mode: 'OUTPUT', value: 255 }]  // Q4 NPN base = HIGH (ON)
      ]),
      serialOutput: [],
      running: true,
      error: null
    },
    running: true,
    dynamicComponents: COMPONENT_CATALOG
  });

  const motorHbRev = frameHbRev.components['hb-m1'];
  console.log('TRANSISTORS IN REVERSE STATE:');
  console.log('  hb-q1 (PNP left) conduction:', frameHbRev.components['hb-q1']?.telemetry?.conduction);
  console.log('  hb-q2 (PNP right) conduction:', frameHbRev.components['hb-q2']?.telemetry?.conduction);
  console.log('  hb-q3 (NPN left) conduction:', frameHbRev.components['hb-q3']?.telemetry?.conduction);
  console.log('  hb-q4 (NPN right) conduction:', frameHbRev.components['hb-q4']?.telemetry?.conduction);
  console.log('REVERSE MOTOR TELEMETRY:', JSON.stringify(motorHbRev, null, 2));
  console.log(`  [REVERSE] Motor powered: ${motorHbRev.isPowered}, Direction: ${motorHbRev.telemetry?.direction}, RPM: ${motorHbRev.telemetry?.rpm}`);
  assert.strictEqual(motorHbRev.isPowered, true, 'Motor should be powered in REVERSE state');
  assert.strictEqual(motorHbRev.telemetry?.direction, 'forward', 'Motor direction should be forward (left-to-right)');

  // Case 4C: Stop state (All OFF: D4=HIGH, D5=HIGH, D6=LOW, D7=LOW) -> Motor stopped
  const frameHbStop = buildSimulationFrame({
    tick: 3,
    nodes: hbPnp.nodes,
    edges: hbPnp.edges,
    boardType: 'arduino',
    arduinoState: {
      pins: new Map([
        [4, { mode: 'OUTPUT', value: 255 }], // Q1 PNP base = HIGH (OFF)
        [5, { mode: 'OUTPUT', value: 255 }], // Q2 PNP base = HIGH (OFF)
        [6, { mode: 'OUTPUT', value: 0 }],   // Q3 NPN base = LOW  (OFF)
        [7, { mode: 'OUTPUT', value: 0 }]    // Q4 NPN base = LOW  (OFF)
      ]),
      serialOutput: [],
      running: true,
      error: null
    },
    running: true,
    dynamicComponents: COMPONENT_CATALOG
  });

  const motorHbStop = frameHbStop.components['hb-m1'];
  console.log(`  [STOP] Motor powered: ${motorHbStop.isPowered}`);
  assert.strictEqual(motorHbStop.isPowered, false, 'Motor should be stopped');

  console.log('\n=================== PNP PRESET REGRESSION TESTS COMPLETE ===================');
  console.log('✅ All PNP Transistor Preset regression tests passed.');
}

try {
  runPnpPresetTests();
} catch (e: any) {
  console.error('❌ PNP Transistor Preset regression tests FAILED:', e.message);
  process.exit(1);
}
