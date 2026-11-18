/**
 * Permanent Regression Test Suite for SPST Relay Component.
 * Verifies catalog definition, pin mappings, electrical formulas,
 * coil voltage/current/power, pickup/release hysteresis, and load switching.
 */

import { COMPONENT_CATALOG } from '../lib/circuit-components';
import { nodeTypes } from '../components/nodes';
import { SpstRelayNode } from '../components/nodes/SpstRelay';
import { buildSimulationFrame } from '../lib/simulation-state';
import type { CircuitNode, CircuitEdge } from '../lib/types';

export function runSpstRelayTests(): boolean {
  console.log('=================== RUNNING SPST RELAY REGRESSION TESTS ===================\n');

  let passed = true;

  // -----------------------------------------------------------------------------
  // Test 1: Verify catalog definition & default properties
  // -----------------------------------------------------------------------------
  const relayDef = COMPONENT_CATALOG.find((c) => c.type === 'relaySpst');
  if (!relayDef) {
    console.error('FAIL: relaySpst definition not found in COMPONENT_CATALOG');
    passed = false;
  } else {
    console.log('=> Found relaySpst definition');
    if (relayDef.defaultWidth !== 140 || relayDef.defaultHeight !== 100) {
      console.error(`FAIL: Unexpected dimensions ${relayDef.defaultWidth}x${relayDef.defaultHeight}`);
      passed = false;
    }
    if (relayDef.pins.length !== 6) {
      console.error(`FAIL: Expected 6 pins, got ${relayDef.pins.length}`);
      passed = false;
    }

    const expectedPins = [
      { id: 'terminal1', x: 95, y: 35, labelContains: 'NC' },
      { id: 'terminal5', x: 55, y: 35, labelContains: 'Coil' },
      { id: 'terminal6', x: 45, y: 35, labelContains: 'COM' },
      { id: 'terminal7', x: 45, y: 65, labelContains: 'COM' },
      { id: 'terminal8', x: 55, y: 65, labelContains: 'Coil' },
      { id: 'terminal12', x: 95, y: 65, labelContains: 'NO' },
    ];

    for (const ep of expectedPins) {
      const pin = relayDef.pins.find((p) => p.id === ep.id);
      if (!pin || pin.position.x !== ep.x || pin.position.y !== ep.y) {
        console.error(`FAIL: Pin ${ep.id} mismatch:`, pin);
        passed = false;
      } else if (!pin.label.includes(ep.labelContains)) {
        console.error(`FAIL: Pin ${ep.id} expected label containing "${ep.labelContains}", got "${pin.label}"`);
        passed = false;
      } else if (!pin.description) {
        console.error(`FAIL: Pin ${ep.id} missing description`);
        passed = false;
      }
    }

    const props = relayDef.defaultProperties as Record<string, any>;
    if (props?.pickupVoltage?.value !== 4.0 || props?.releaseVoltage?.value !== 2.0 || props?.coilResistance?.value !== 70) {
      console.error('FAIL: Unexpected relay defaultProperties', props);
      passed = false;
    } else {
      console.log('=> relay defaultProperties verified (Vpickup=4V, Vrelease=2V, Rcoil=70Ω)');
    }
  }

  // -----------------------------------------------------------------------------
  // Test 2: Verify nodeTypes registration
  // -----------------------------------------------------------------------------
  if (nodeTypes.relaySpst !== SpstRelayNode) {
    console.error('FAIL: nodeTypes.relaySpst is not mapped to SpstRelayNode');
    passed = false;
  } else {
    console.log('=> nodeTypes.relaySpst properly registered as SpstRelayNode');
  }

  // -----------------------------------------------------------------------------
  // Test 3: Electrical formulas & simulation frame evaluation
  // -----------------------------------------------------------------------------
  const battery9v: CircuitNode = {
    id: 'bat1',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      componentType: 'battery9v',
      simulationModel: 'battery9v',
      label: '9V Battery',
      properties: {
        voltage: { label: 'Voltage', type: 'number', value: 9, unit: 'V' },
      },
      rotation: 0,
    },
  };

  const relayNode: CircuitNode = {
    id: 'relay1',
    type: 'customNode',
    position: { x: 100, y: 0 },
    data: {
      componentType: 'relaySpst',
      simulationModel: 'relaySpst',
      label: 'Relay',
      properties: {
        pickupVoltage: { label: 'Pickup Voltage', type: 'number', value: 4.0, unit: 'V' },
        releaseVoltage: { label: 'Release Voltage', type: 'number', value: 2.0, unit: 'V' },
        coilResistance: { label: 'Coil Resistance', type: 'number', value: 70, unit: 'Ω' },
      },
      rotation: 0,
    },
  };

  const resNode: CircuitNode = {
    id: 'res1',
    type: 'customNode',
    position: { x: 150, y: 0 },
    data: {
      componentType: 'resistor',
      simulationModel: 'resistor',
      label: '330Ω Resistor',
      properties: {
        resistance: { label: 'Resistance', type: 'number', value: 330, unit: 'Ω' },
      },
      rotation: 0,
    },
  };

  const ledNode: CircuitNode = {
    id: 'led1',
    type: 'customNode',
    position: { x: 200, y: 0 },
    data: {
      componentType: 'led',
      simulationModel: 'led',
      label: 'LED',
      properties: { color: { label: 'Color', type: 'select', value: 'green' } },
      rotation: 0,
    },
  };

  // Case A: Relay coil connected to 9V battery -> Vcoil = 9V >= 4V -> Relay Energizes!
  // COM connected to 9V battery positive, NO connected to 330Ω resistor -> LED anode, LED cathode to 9V battery negative
  const energizedEdges: CircuitEdge[] = [
    // Control / Coil circuit:
    { id: 'e1', source: 'bat1', sourceHandle: 'positive', target: 'relay1', targetHandle: 'terminal5' },
    { id: 'e2', source: 'bat1', sourceHandle: 'negative', target: 'relay1', targetHandle: 'terminal8' },
    // Load circuit through COM (terminal6) and NO (terminal12):
    { id: 'e3', source: 'bat1', sourceHandle: 'positive', target: 'relay1', targetHandle: 'terminal6' },
    { id: 'e4', source: 'relay1', sourceHandle: 'terminal12', target: 'res1', targetHandle: 'pin1' },
    { id: 'e5', source: 'res1', sourceHandle: 'pin2', target: 'led1', targetHandle: 'anode' },
    { id: 'e6', source: 'led1', sourceHandle: 'cathode', target: 'bat1', targetHandle: 'negative' },
  ];

  const frameEnergized = buildSimulationFrame({
    tick: 1,
    nodes: [battery9v, relayNode, resNode, ledNode],
    edges: energizedEdges,
    boardType: 'none',
    running: true,
  });

  const relayStateEnergized = frameEnergized.components['relay1'];
  const ledStateEnergized = frameEnergized.components['led1'];

  console.log(`[Trace Energized] Relay isPowered=${relayStateEnergized?.isPowered}, Vcoil=${relayStateEnergized?.telemetry?.vCoil}V, Icoil=${relayStateEnergized?.telemetry?.iCoil}A, Pcoil=${relayStateEnergized?.telemetry?.pCoil}W`);
  console.log(`[Trace Energized] LED isPowered=${ledStateEnergized?.isPowered}, brightness=${ledStateEnergized?.brightness}`);

  if (!relayStateEnergized?.isPowered || relayStateEnergized?.telemetry?.vCoil !== 9) {
    console.error('FAIL: Relay was not energized with 9V coil voltage', relayStateEnergized);
    passed = false;
  } else if (!ledStateEnergized?.isPowered || (ledStateEnergized?.brightness ?? 0) <= 0) {
    console.error('FAIL: Load circuit LED was not powered when relay energized', ledStateEnergized);
    passed = false;
  } else {
    console.log('=> Energized relay and load switching test PASSED');
  }

  // Case B: Disconnected coil -> Vcoil = 0V < 4V -> Relay De-energized -> LED must remain OFF!
  const deEnergizedEdges: CircuitEdge[] = [
    // Coil has NO connection
    // Load circuit through COM (terminal6) and NO (terminal12):
    { id: 'e3', source: 'bat1', sourceHandle: 'positive', target: 'relay1', targetHandle: 'terminal6' },
    { id: 'e4', source: 'relay1', sourceHandle: 'terminal12', target: 'res1', targetHandle: 'pin1' },
    { id: 'e5', source: 'res1', sourceHandle: 'pin2', target: 'led1', targetHandle: 'anode' },
    { id: 'e6', source: 'led1', sourceHandle: 'cathode', target: 'bat1', targetHandle: 'negative' },
  ];

  const frameDeEnergized = buildSimulationFrame({
    tick: 2,
    nodes: [battery9v, relayNode, resNode, ledNode],
    edges: deEnergizedEdges,
    boardType: 'none',
    running: true,
  });

  const relayStateDeEnergized = frameDeEnergized.components['relay1'];
  const ledStateDeEnergized = frameDeEnergized.components['led1'];

  console.log(`[Trace De-energized] Relay isPowered=${relayStateDeEnergized?.isPowered}, Vcoil=${relayStateDeEnergized?.telemetry?.vCoil}V`);
  console.log(`[Trace De-energized] LED isPowered=${ledStateDeEnergized?.isPowered}, brightness=${ledStateDeEnergized?.brightness}`);

  if (relayStateDeEnergized?.isPowered || (relayStateDeEnergized?.telemetry?.vCoil ?? 0) !== 0) {
    console.error('FAIL: Relay was energized when coil was unpowered', relayStateDeEnergized);
    passed = false;
  } else if (ledStateDeEnergized?.isPowered || (ledStateDeEnergized?.brightness ?? 0) > 0.01) {
    console.error('FAIL: Load circuit LED was powered when relay was de-energized', ledStateDeEnergized);
    passed = false;
  } else {
    console.log('=> De-energized relay isolation and open contact test PASSED');
  }

  // -----------------------------------------------------------------------------
  // Test 4: SVG regex transformation
  // -----------------------------------------------------------------------------
  const sampleSvg = `<svg viewBox="-70 -50 140 100"><g class="cgfx__switch-6connected" display="none"></g><g class="cgfx__switch-7connected" display="inline"></g></svg>`;

  const offSvg = sampleSvg
    .replace(/(class="cgfx__switch-6connected"[^>]*display=")[^"]*(")/, '$1inline$2')
    .replace(/(class="cgfx__switch-7connected"[^>]*display=")[^"]*(")/, '$1none$2');

  const onSvg = sampleSvg
    .replace(/(class="cgfx__switch-6connected"[^>]*display=")[^"]*(")/, '$1none$2')
    .replace(/(class="cgfx__switch-7connected"[^>]*display=")[^"]*(")/, '$1inline$2');

  // -----------------------------------------------------------------------------
  // Test 5: Frame Transformer Direct Test & Mathematical Formulas
  // -----------------------------------------------------------------------------
  const testFrame: any = {
    running: true,
    boardPins: [],
    components: {
      bat1: { nodeId: 'bat1', voltage: 5.0, pins: { positive: { voltage: 5.0 }, negative: { voltage: 0 } } },
      relay1: { nodeId: 'relay1', componentType: 'relaySpst' },
    },
  };

  // Set mock store state for transformer test
  const { useCircuitStore } = require('../lib/store');
  useCircuitStore.setState({
    nodes: [battery9v, relayNode, resNode, ledNode],
    edges: energizedEdges,
  });

  const { applySpstRelayInputToFrame } = require('../lib/simulation/frameTransformers/spstRelay');
  const transformedFrame = applySpstRelayInputToFrame(testFrame);
  const relayComp = transformedFrame.components['relay1'];

  console.log(`[Trace Transformer] Vcoil: ${relayComp?.telemetry?.vCoil}V, Icoil: ${relayComp?.telemetry?.iCoil}A, Pcoil: ${relayComp?.telemetry?.pCoil}W, vNO: ${relayComp?.telemetry?.vNO}V`);

  if (!relayComp?.isPowered || relayComp?.telemetry?.vCoil !== 5.0) {
    console.error('FAIL: applySpstRelayInputToFrame did not calculate Vcoil correctly', relayComp);
    passed = false;
  } else if (Math.abs(relayComp?.telemetry?.iCoil - (5.0 / 70)) > 0.001) {
    console.error('FAIL: applySpstRelayInputToFrame Icoil formula incorrect', relayComp);
    passed = false;
  } else {
    console.log('=> applySpstRelayInputToFrame mathematical formulas and pin outputs PASSED');
  }
  // -----------------------------------------------------------------------------
  // Test 6: Arduino & Raspberry Pi Pico Code-Driven Switching Tests
  // -----------------------------------------------------------------------------
  const arduinoUnoNode: CircuitNode = {
    id: 'uno1',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      componentType: 'arduino',
      simulationModel: 'arduino',
      label: 'Arduino Uno',
      properties: {},
      rotation: 0,
    },
  };

  const arduinoEdges: CircuitEdge[] = [
    // Arduino D7 -> Relay Coil+ (terminal5), Arduino GND -> Relay Coil- (terminal8)
    { id: 'ae1', source: 'uno1', sourceHandle: 'd7', target: 'relay1', targetHandle: 'terminal5' },
    { id: 'ae2', source: 'uno1', sourceHandle: 'gnd1', target: 'relay1', targetHandle: 'terminal8' },
    // 5V power -> COM (terminal6), NO (terminal12) -> Resistor -> LED -> GND
    { id: 'ae3', source: 'uno1', sourceHandle: '5v', target: 'relay1', targetHandle: 'terminal6' },
    { id: 'ae4', source: 'relay1', sourceHandle: 'terminal12', target: 'res1', targetHandle: 'pin1' },
    { id: 'ae5', source: 'res1', sourceHandle: 'pin2', target: 'led1', targetHandle: 'anode' },
    { id: 'ae6', source: 'led1', sourceHandle: 'cathode', target: 'uno1', targetHandle: 'gnd2' },
  ];

  // Arduino Code Tick 1: digitalWrite(7, HIGH) -> 5V Output
  const arduinoHighPins = new Map<number, any>([
    [7, { mode: 'OUTPUT', value: 255, voltage: 5.0, active: true }],
  ]);

  const frameArduinoHigh = buildSimulationFrame({
    tick: 10,
    nodes: [arduinoUnoNode, relayNode, resNode, ledNode],
    edges: arduinoEdges,
    boardType: 'arduino',
    arduinoState: { pins: arduinoHighPins, serialOutput: [] } as any,
    running: true,
  });

  const relayHigh = frameArduinoHigh.components['relay1'];
  const ledHigh = frameArduinoHigh.components['led1'];

  console.log(`[Trace Arduino HIGH] Relay isPowered: ${relayHigh?.isPowered}, Vcoil: ${relayHigh?.telemetry?.vCoil}V, LED brightness: ${ledHigh?.brightness}`);

  if (!relayHigh?.isPowered || relayHigh?.telemetry?.vCoil !== 5.0 || !ledHigh?.isPowered) {
    console.error('FAIL: Arduino digitalWrite(HIGH) did not energize relay and light LED', relayHigh, ledHigh);
    passed = false;
  } else {
    console.log('=> Arduino code digitalWrite(HIGH) code actuation PASSED');
  }

  // Arduino Code Tick 2: digitalWrite(7, LOW) -> 0V Output
  const arduinoLowPins = new Map<number, any>([
    [7, { mode: 'OUTPUT', value: 0, voltage: 0.0, active: false }],
  ]);

  const frameArduinoLow = buildSimulationFrame({
    tick: 11,
    nodes: [arduinoUnoNode, relayNode, resNode, ledNode],
    edges: arduinoEdges,
    boardType: 'arduino',
    arduinoState: { pins: arduinoLowPins, serialOutput: [] } as any,
    running: true,
  });

  const relayLow = frameArduinoLow.components['relay1'];
  const ledLow = frameArduinoLow.components['led1'];

  console.log(`[Trace Arduino LOW] Relay isPowered: ${relayLow?.isPowered}, Vcoil: ${relayLow?.telemetry?.vCoil}V, LED brightness: ${ledLow?.brightness}`);

  if (relayLow?.isPowered || (relayLow?.telemetry?.vCoil ?? 0) !== 0 || ledLow?.isPowered) {
    console.error('FAIL: Arduino digitalWrite(LOW) did not de-energize relay', relayLow, ledLow);
    passed = false;
  } else {
    console.log('=> Arduino code digitalWrite(LOW) code de-actuation PASSED');
  }

  // Raspberry Pi Pico 3.3V Code-Driven Test: GP15 (3.3V) -> Relay Energizes
  const picoNode: CircuitNode = {
    id: 'pico1',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      componentType: 'raspberrypipico',
      simulationModel: 'raspberrypipico',
      label: 'Raspberry Pi Pico',
      properties: {},
      rotation: 0,
    },
  };

  const picoEdges: CircuitEdge[] = [
    { id: 'pe1', source: 'pico1', sourceHandle: 'gp15', target: 'relay1', targetHandle: 'terminal5' },
    { id: 'pe2', source: 'pico1', sourceHandle: 'pico_gnd1', target: 'relay1', targetHandle: 'terminal8' },
    { id: 'pe3', source: 'pico1', sourceHandle: 'pico_vbus', target: 'relay1', targetHandle: 'terminal6' },
    { id: 'pe4', source: 'relay1', sourceHandle: 'terminal12', target: 'res1', targetHandle: 'pin1' },
    { id: 'pe5', source: 'res1', sourceHandle: 'pin2', target: 'led1', targetHandle: 'anode' },
    { id: 'pe6', source: 'led1', sourceHandle: 'cathode', target: 'pico1', targetHandle: 'pico_gnd2' },
  ];

  const picoHighPins = new Map<number, any>([
    [15, { mode: 'OUTPUT', value: 255, voltage: 3.3, active: true }],
  ]);

  const framePicoHigh = buildSimulationFrame({
    tick: 20,
    nodes: [picoNode, relayNode, resNode, ledNode],
    edges: picoEdges,
    boardType: 'pico',
    arduinoState: { pins: picoHighPins, serialOutput: [] } as any,
    running: true,
  });

  const relayPico = framePicoHigh.components['relay1'];
  const ledPico = framePicoHigh.components['led1'];

  console.log(`[Trace Pico 3.3V] Relay isPowered: ${relayPico?.isPowered}, Vcoil: ${relayPico?.telemetry?.vCoil}V, LED brightness: ${ledPico?.brightness}`);

  if (!relayPico?.isPowered || relayPico?.telemetry?.vCoil !== 3.3 || !ledPico?.isPowered) {
    console.error('FAIL: Pico 3.3V code did not actuate relay', relayPico, ledPico);
    passed = false;
  } else {
    console.log('=> Raspberry Pi Pico 3.3V code actuation PASSED');
  }

  // -----------------------------------------------------------------------------
  // Test 7: Debug User's Circuit — 5V on NC (Terminal 1) vs 5V on COM (Terminal 6/7)
  // -----------------------------------------------------------------------------
  // Scenario A: User's wiring (5V on NC terminal1, LED on NO terminal12, COM unconnected)
  const userScreenshotEdges: CircuitEdge[] = [
    { id: 'ue1', source: 'uno1', sourceHandle: 'd7', target: 'relay1', targetHandle: 'terminal5' },
    { id: 'ue2', source: 'uno1', sourceHandle: 'gnd1', target: 'relay1', targetHandle: 'terminal8' },
    // Wiring mistake: 5V connects to NC (terminal1) instead of COM
    { id: 'ue3', source: 'uno1', sourceHandle: '5v', target: 'relay1', targetHandle: 'terminal1' },
    { id: 'ue4', source: 'relay1', sourceHandle: 'terminal12', target: 'res1', targetHandle: 'pin1' },
    { id: 'ue5', source: 'res1', sourceHandle: 'pin2', target: 'led1', targetHandle: 'anode' },
    { id: 'ue6', source: 'led1', sourceHandle: 'cathode', target: 'uno1', targetHandle: 'gnd2' },
  ];

  const frameUserCircuitHigh = buildSimulationFrame({
    tick: 30,
    nodes: [arduinoUnoNode, relayNode, resNode, ledNode],
    edges: userScreenshotEdges,
    boardType: 'arduino',
    arduinoState: { pins: arduinoHighPins, serialOutput: [] } as any,
    running: true,
  });

  const relayUserHigh = frameUserCircuitHigh.components['relay1'];
  const ledUserHigh = frameUserCircuitHigh.components['led1'];

  console.log(`[Trace User Circuit HIGH] Relay isPowered: ${relayUserHigh?.isPowered}, Vcoil: ${relayUserHigh?.telemetry?.vCoil}V, LED isPowered: ${ledUserHigh?.isPowered}, brightness: ${ledUserHigh?.brightness}`);

  if (!relayUserHigh?.isPowered || relayUserHigh?.telemetry?.vCoil !== 5.0) {
    console.error('FAIL: Relay coil was not energized in user circuit test', relayUserHigh);
    passed = false;
  } else if (ledUserHigh?.isPowered || (ledUserHigh?.brightness ?? 0) > 0.01) {
    console.error('FAIL: Expected LED to be OFF when 5V is wired to NC and LED is on NO with COM open', ledUserHigh);
    passed = false;
  } else {
    console.log('=> User circuit diagnosis confirmed: LED remains OFF because 5V is wired to NC (Terminal 1) instead of COM (Terminal 6/7)');
  }

  // Scenario B: Corrected wiring (5V on COM terminal6, LED on NO terminal12)
  const correctedUserEdges: CircuitEdge[] = [
    { id: 'ce1', source: 'uno1', sourceHandle: 'd7', target: 'relay1', targetHandle: 'terminal5' },
    { id: 'ce2', source: 'uno1', sourceHandle: 'gnd1', target: 'relay1', targetHandle: 'terminal8' },
    // Corrected: 5V connects to COM (terminal6)
    { id: 'ce3', source: 'uno1', sourceHandle: '5v', target: 'relay1', targetHandle: 'terminal6' },
    { id: 'ce4', source: 'relay1', sourceHandle: 'terminal12', target: 'res1', targetHandle: 'pin1' },
    { id: 'ce5', source: 'res1', sourceHandle: 'pin2', target: 'led1', targetHandle: 'anode' },
    { id: 'ce6', source: 'led1', sourceHandle: 'cathode', target: 'uno1', targetHandle: 'gnd2' },
  ];

  const frameCorrectedHigh = buildSimulationFrame({
    tick: 31,
    nodes: [arduinoUnoNode, relayNode, resNode, ledNode],
    edges: correctedUserEdges,
    boardType: 'arduino',
    arduinoState: { pins: arduinoHighPins, serialOutput: [] } as any,
    running: true,
  });

  const frameCorrectedLow = buildSimulationFrame({
    tick: 32,
    nodes: [arduinoUnoNode, relayNode, resNode, ledNode],
    edges: correctedUserEdges,
    boardType: 'arduino',
    arduinoState: { pins: arduinoLowPins, serialOutput: [] } as any,
    running: true,
  });

  const relayCorrHigh = frameCorrectedHigh.components['relay1'];
  const ledCorrHigh = frameCorrectedHigh.components['led1'];
  const relayCorrLow = frameCorrectedLow.components['relay1'];
  const ledCorrLow = frameCorrectedLow.components['led1'];

  console.log(`[Trace Corrected HIGH] Relay isPowered: ${relayCorrHigh?.isPowered}, LED isPowered: ${ledCorrHigh?.isPowered}, brightness: ${ledCorrHigh?.brightness}`);
  console.log(`[Trace Corrected LOW] Relay isPowered: ${relayCorrLow?.isPowered}, LED isPowered: ${ledCorrLow?.isPowered}, brightness: ${ledCorrLow?.brightness}`);

  if (!relayCorrHigh?.isPowered || !ledCorrHigh?.isPowered || (ledCorrHigh?.brightness ?? 0) <= 0) {
    console.error('FAIL: Corrected circuit did not light LED when Relay energized', relayCorrHigh, ledCorrHigh);
    passed = false;
  } else if (relayCorrLow?.isPowered || ledCorrLow?.isPowered || (ledCorrLow?.brightness ?? 0) > 0.01) {
    console.error('FAIL: Corrected circuit did not turn OFF LED when Relay de-energized', relayCorrLow, ledCorrLow);
    passed = false;
  } else {
    console.log('=> Corrected wiring verified: LED successfully turns ON when Pin 7 is HIGH and OFF when Pin 7 is LOW');
  }

  // -----------------------------------------------------------------------------
  // Test 8: Direct Endpoint & Electrical Net Voltage Resolution
  // -----------------------------------------------------------------------------
  const { getEndpointVoltage, getDirectPinVoltage, getElectricalNetVoltage } = require('../lib/circuit/pinMapping');

  // Set the store state to the energized circuit
  useCircuitStore.setState({
    nodes: [battery9v, relayNode, resNode, ledNode],
    edges: [
      { id: 'e1', source: 'bat1', sourceHandle: 'positive', target: 'relay1', targetHandle: 'terminal5' },
      { id: 'e2', source: 'bat1', sourceHandle: 'negative', target: 'relay1', targetHandle: 'terminal8' },
      { id: 'e3', source: 'bat1', sourceHandle: 'positive', target: 'relay1', targetHandle: 'terminal6' },
      { id: 'e4', source: 'relay1', sourceHandle: 'terminal12', target: 'led1', targetHandle: 'anode' },
      { id: 'e5', source: 'led1', sourceHandle: 'cathode', target: 'bat1', targetHandle: 'negative' },
    ],
  });

  const relayDirectV = getDirectPinVoltage(transformedFrame, 'relay1', 'terminal12');
  console.log(`[Trace Test 8] Direct relay terminal12 voltage: ${relayDirectV}V`);
  if (relayDirectV === undefined || Math.abs(relayDirectV - 4.999) > 0.01) {
    console.error('FAIL: Direct pin voltage on relay terminal12 was not resolved as ~4.999V', relayDirectV);
    passed = false;
  } else {
    console.log('=> Direct pin voltage on relay terminal12 PASSED');
  }

  const ledNetV = getEndpointVoltage(transformedFrame, 'led1', 'anode');
  console.log(`[Trace Test 8] LED anode resolved net voltage: ${ledNetV}V`);
  if (Math.abs(ledNetV - 4.999) > 0.01) {
    console.error('FAIL: LED anode did not resolve 4.999V across the circuit edge', ledNetV);
    passed = false;
  } else {
    console.log('=> LED anode electrical net voltage resolution PASSED');
  }

  // -----------------------------------------------------------------------------
  // Test 9: Explicit 0V Pin Retention (voltage !== undefined)
  // -----------------------------------------------------------------------------
  const frameWithExplicitZero: any = {
    ...transformedFrame,
    components: {
      ...transformedFrame.components,
      customComp1: {
        nodeId: 'customComp1',
        componentType: 'custom',
        voltage: 5.0, // Fallback component voltage is 5V
        pins: {
          pinZero: { handleId: 'pinZero', voltage: 0.0, normalizedValue: 0, active: true },
        },
      },
    },
  };

  const explicitZeroV = getEndpointVoltage(frameWithExplicitZero, 'customComp1', 'pinZero');
  console.log(`[Trace Test 9] Explicit 0V pin voltage: ${explicitZeroV}V`);
  if (explicitZeroV !== 0.0) {
    console.error(`FAIL: Explicit 0V pin returned fallback voltage ${explicitZeroV} instead of 0.0`, explicitZeroV);
    passed = false;
  } else {
    console.log('=> Explicit 0V pin retention test PASSED');
  }

  // -----------------------------------------------------------------------------
  // Test 10: Electrical Net Voltage Conflict Detection (5V vs 0V)
  // -----------------------------------------------------------------------------
  const nodeA: CircuitNode = { id: 'nodeA', type: 'customNode', position: { x: 0, y: 0 }, data: { componentType: 'generic', label: 'Node A', properties: {}, rotation: 0 } };
  const nodeB: CircuitNode = { id: 'nodeB', type: 'customNode', position: { x: 50, y: 0 }, data: { componentType: 'generic', label: 'Node B', properties: {}, rotation: 0 } };

  useCircuitStore.setState({
    nodes: [nodeA, nodeB],
    edges: [
      { id: 'conf1', source: 'nodeA', sourceHandle: '5v', target: 'nodeB', targetHandle: 'gnd' },
    ],
  });

  const frameWithConflict: any = {
    running: true,
    boardType: 'none',
    components: {
      nodeA: { nodeId: 'nodeA', pins: { '5v': { handleId: '5v', voltage: 5.0, active: true } } },
      nodeB: { nodeId: 'nodeB', pins: { 'gnd': { handleId: 'gnd', voltage: 0.0, active: true } } },
    },
    boardPins: [],
  };

  const conflictNetV = getElectricalNetVoltage(frameWithConflict, 'nodeA', '5v');
  console.log(`[Trace Test 10] Conflicting net resolved voltage: ${conflictNetV}`);
  if (conflictNetV !== undefined) {
    console.error(`FAIL: Conflicting net with 5V and 0V returned ${conflictNetV} instead of undefined`, conflictNetV);
    passed = false;
  } else {
    console.log('=> Voltage conflict detection test PASSED (conflict produces undefined)');
  }
  // -----------------------------------------------------------------------------
  // Test 11: Negative Voltage Switching and System-Aware Normalization
  // -----------------------------------------------------------------------------
  const negativeRelayNode: CircuitNode = {
    id: 'relayNeg',
    type: 'customNode',
    position: { x: 100, y: 0 },
    data: {
      componentType: 'relaySpst',
      simulationModel: 'relaySpst',
      label: 'Relay Neg',
      properties: {
        pickupVoltage: { label: 'Pickup Voltage', type: 'number', value: 4.0, unit: 'V' },
        releaseVoltage: { label: 'Release Voltage', type: 'number', value: 2.0, unit: 'V' },
        coilResistance: { label: 'Coil Resistance', type: 'number', value: 70, unit: 'Ω' },
      },
      rotation: 0,
    },
  };

  const negativeEdges: CircuitEdge[] = [
    // Coil energized with 5V
    { id: 'negCoil1', source: 'uno1', sourceHandle: '5v', target: 'relayNeg', targetHandle: 'terminal5' },
    { id: 'negCoil2', source: 'uno1', sourceHandle: 'gnd1', target: 'relayNeg', targetHandle: 'terminal8' },
    // COM connected to a hypothetical -5V power source handle
    { id: 'negCom', source: 'negPower', sourceHandle: 'minus5v', target: 'relayNeg', targetHandle: 'terminal6' },
  ];

  useCircuitStore.setState({
    nodes: [arduinoUnoNode, negativeRelayNode],
    edges: negativeEdges,
  });

  const testFrameNeg: any = {
    running: true,
    boardType: 'pico', // We can test Pico board type to verify 3.3V system-aware normalization
    components: {
      relayNeg: { nodeId: 'relayNeg', componentType: 'relaySpst' },
      negPower: { nodeId: 'negPower', pins: { minus5v: { voltage: -5.0 } } },
      uno1: { nodeId: 'uno1', pins: { '5v': { voltage: 5.0 }, gnd1: { voltage: 0.0 } } },
    },
    boardPins: [],
  };

  const transformedFrameNeg = applySpstRelayInputToFrame(testFrameNeg);
  const relayNegComp = transformedFrameNeg.components['relayNeg'];

  console.log(`[Trace Test 11] vNO resolved with negative supply: ${relayNegComp?.telemetry?.vNO}V, normalized terminal6: ${relayNegComp?.pins?.terminal6?.normalizedValue}`);

  if (!relayNegComp?.isPowered) {
    console.error('FAIL: relayNeg did not energize with 5V coil voltage');
    passed = false;
  } else if (relayNegComp?.telemetry?.vNO !== -4.999) {
    console.error(`FAIL: relayNeg vNO expected -4.999V for -5V supply, got ${relayNegComp?.telemetry?.vNO}V`);
    passed = false;
  } else if (Math.abs((relayNegComp?.pins?.terminal6?.normalizedValue ?? 0) - 1.0) > 0.01) {
    // With Pico boardType, system logic voltage is 3.3V. Since absolute value of -5V is 5V, it should clamp to 1.0.
    console.error(`FAIL: relayNeg terminal6 normalizedValue expected to clamp to 1.0 for 5V magnitude on Pico logic, got ${relayNegComp?.pins?.terminal6?.normalizedValue}`);
    passed = false;
  } else {
    console.log('=> Negative voltage switching and system-aware normalization test PASSED');
  }

  // -----------------------------------------------------------------------------
  // Test 12: Simulation Graph Hysteresis Verification
  // -----------------------------------------------------------------------------
  // Load state manager
  const { spstRelayState } = require('../lib/simulation/frameTransformers/spstRelay');
  // Set relay state to energized (simulating previous state)
  spstRelayState.setState('relay1', true);

  // We set mock store state to verify graph build in getElectricalNetVoltage
  useCircuitStore.setState({
    nodes: [battery9v, relayNode, resNode, ledNode],
    edges: energizedEdges, // same edges as energized load circuit
  });

  // We manually evaluate buildSimulationFrame to verify the graph connections are formed under hysteresis
  // We pass a mock battery voltage of 3.0V to coil positive (terminal5).
  // Under 3.0V (below 4V pickup but above 2V release), because previousState is true,
  // the relay should remain energized and keep the LED load powered.
  const battery3v: CircuitNode = {
    id: 'bat1',
    type: 'customNode',
    position: { x: 0, y: 0 },
    data: {
      componentType: 'battery9v',
      simulationModel: 'battery9v',
      label: '9V Battery (set to 3V)',
      properties: {
        voltage: { label: 'Voltage', type: 'number', value: 3.0, unit: 'V' },
      },
      rotation: 0,
    },
  };

  const frameHysteresis = buildSimulationFrame({
    tick: 5,
    nodes: [battery3v, relayNode, resNode, ledNode],
    edges: energizedEdges,
    boardType: 'none',
    running: true,
  });

  const ledCompHysteresis = frameHysteresis.components['led1'];
  console.log(`[Trace Test 12] Hysteresis LED isPowered: ${ledCompHysteresis?.isPowered}, brightness: ${ledCompHysteresis?.brightness}`);

  if (!ledCompHysteresis?.isPowered || (ledCompHysteresis?.brightness ?? 0) <= 0) {
    console.error('FAIL: Hysteresis failed: LED load was disconnected in conductive graph when coil voltage dropped to 3.0V', ledCompHysteresis);
    passed = false;
  } else {
    console.log('=> Hysteresis graph connection verification test PASSED');
  }

  // Clear state manager after test
  spstRelayState.clear();
  console.log('\n=================== SPST RELAY REGRESSION TESTS COMPLETE ===================');
  return passed;
}

if (require.main === module) {
  const success = runSpstRelayTests();
  if (success) {
    console.log('✅ All SPST Relay regression tests passed.');
  } else {
    console.error('❌ SPST Relay regression tests failed.');
    process.exit(1);
  }
}
