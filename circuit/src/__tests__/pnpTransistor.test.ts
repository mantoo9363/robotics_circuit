import assert from 'node:assert';
import { getComponentDefinition } from '../store/useDynamicComponentsStore';
import { nodeTypes } from '../components/nodes';
import { PnpNode } from '../components/nodes/Pnp';
import { PNPTransistorModel, DEFAULT_PNP_PARAMETERS } from '../lib/simulation/frameTransformers/pnp';

console.log('🧪 Running Comprehensive PNP Transistor Tests (11 test suites)...');

// ----------------------------------------------------
// TEST 1: Component Definition & Pin Coordinates
// ----------------------------------------------------
console.log('  Testing Test 1: Component Definition & Pin Mapping...');
const pnpDef = getComponentDefinition('pnp');
assert(pnpDef, 'PNP component definition should exist');
assert.strictEqual(pnpDef.defaultWidth, 120, 'PNP default width should be 120');
assert.strictEqual(pnpDef.defaultHeight, 130, 'PNP default height should be 130');

const pinIds = pnpDef.pins.map((p) => p.id);
assert(pinIds.includes('collector'), 'PNP pins must include collector');
assert(pinIds.includes('base'), 'PNP pins must include base');
assert(pinIds.includes('emitter'), 'PNP pins must include emitter');

const collectorPin = pnpDef.pins.find((p) => p.id === 'collector');
const basePin = pnpDef.pins.find((p) => p.id === 'base');
const emitterPin = pnpDef.pins.find((p) => p.id === 'emitter');

assert.deepStrictEqual(collectorPin?.position, { x: 75, y: 65 }, 'Collector pin position must match (75, 65)');
assert.deepStrictEqual(basePin?.position, { x: 60, y: 65 }, 'Base pin position must match (60, 65)');
assert.deepStrictEqual(emitterPin?.position, { x: 45, y: 65 }, 'Emitter pin position must match (45, 65)');
assert.strictEqual(nodeTypes.pnp, PnpNode, 'nodeTypes.pnp must map to PnpNode component');

// ----------------------------------------------------
// TEST 2: Cutoff State (VE = 5V, VB = 5V)
// ----------------------------------------------------
console.log('  Testing Test 2: Cutoff (VE = 5V, VB = 5V)...');
const cutoffResult = PNPTransistorModel.simulate(5.0, 5.0, 0.0, 1000, 220, 0, true, true, true);
assert.strictEqual(cutoffResult.state, 'cutoff', 'Transistor must be in cutoff when VE = VB');
assert.strictEqual(cutoffResult.isConducting, false, 'Transistor must not be conducting in cutoff');
assert.strictEqual(cutoffResult.collectorCurrent, 0, 'Collector current must be 0 in cutoff');
assert.strictEqual(cutoffResult.baseCurrent, 0, 'Base current must be 0 in cutoff');
assert.strictEqual(cutoffResult.emitterCurrent, 0, 'Emitter current must be 0 in cutoff');

// ----------------------------------------------------
// TEST 3: Forward Bias / Forward-Active (VE = 5V, VB = 4.3V)
// ----------------------------------------------------
console.log('  Testing Test 3: Forward Bias (VE = 5V, VB = 4.3V)...');
const forwardActiveResult = PNPTransistorModel.simulate(5.0, 4.3, 2.5, 10000, 1000, 0, true, true, true);
assert.strictEqual(forwardActiveResult.VEB, 0.7, 'VEB should be 0.7V');
assert(forwardActiveResult.isConducting, 'Transistor should be conducting when VE - VB >= 0.7V');
assert(forwardActiveResult.baseCurrent > 0, 'Base current should be > 0');
assert(forwardActiveResult.collectorCurrent > 0, 'Collector current should be > 0');

// ----------------------------------------------------
// TEST 4: Base Above Emitter (VE = 5V, VB = 5.5V)
// ----------------------------------------------------
console.log('  Testing Test 4: Base Above Emitter (VE = 5V, VB = 5.5V)...');
const reverseBiasResult = PNPTransistorModel.simulate(5.0, 5.5, 0.0, 1000, 220, 0, true, true, true);
assert.strictEqual(reverseBiasResult.state, 'cutoff', 'Transistor must be OFF when VB > VE');
assert.strictEqual(reverseBiasResult.isConducting, false);
assert.strictEqual(reverseBiasResult.collectorCurrent, 0);

// ----------------------------------------------------
// TEST 5: Saturation State (VE = 5V, VB = 0V, strong base drive)
// ----------------------------------------------------
console.log('  Testing Test 5: Saturation State (VE = 5V, VB = 0V)...');
const saturationResult = PNPTransistorModel.simulate(5.0, 0.0, 0.0, 1000, 220, 2.0, true, true, true);
assert.strictEqual(saturationResult.state, 'saturation', 'Transistor must enter saturation under strong base drive');
assert.strictEqual(saturationResult.isConducting, true);
assert.strictEqual(saturationResult.V_ce_drop, 0.2, 'V_EC drop in saturation must be V_EC(sat) = 0.2V');
assert(saturationResult.collectorCurrent > 0, 'Collector current must flow in saturation');

// ----------------------------------------------------
// TEST 6: LED Switching Circuit (5V -> E, C -> LED -> R -> GND)
// ----------------------------------------------------
console.log('  Testing Test 6: LED Switching Circuit...');
// Base pulled LOW (0V) -> ON
const ledOnResult = PNPTransistorModel.simulate(5.0, 0.0, 0.0, 1000, 220, 2.0, true, true, true);
assert(ledOnResult.isConducting, 'LED circuit: PNP must conduct when base is LOW');
const drivenVout = 5.0 - ledOnResult.V_ce_drop;
assert(drivenVout >= 4.8, 'Driven collector voltage must be ~4.8V');

// Base pulled HIGH (5V) -> OFF
const ledOffResult = PNPTransistorModel.simulate(5.0, 5.0, 0.0, 1000, 220, 2.0, true, true, true);
assert(!ledOffResult.isConducting, 'LED circuit: PNP must turn OFF when base is HIGH');

// ----------------------------------------------------
// TEST 7: Arduino 5V GPIO Control
// ----------------------------------------------------
console.log('  Testing Test 7: Arduino 5V GPIO Control...');
// digitalWrite(PIN, LOW) -> 0V
const arduinoLow = PNPTransistorModel.simulate(5.0, 0.0, 0.0, 1000, 220, 2.0, true, true, true);
assert.strictEqual(arduinoLow.state, 'saturation');
assert.strictEqual(arduinoLow.isConducting, true);

// digitalWrite(PIN, HIGH) -> 5V
const arduinoHigh = PNPTransistorModel.simulate(5.0, 5.0, 0.0, 1000, 220, 2.0, true, true, true);
assert.strictEqual(arduinoHigh.state, 'cutoff');
assert.strictEqual(arduinoHigh.isConducting, false);

// ----------------------------------------------------
// TEST 8: PWM Support
// ----------------------------------------------------
console.log('  Testing Test 8: PWM Base Drive Response...');
// PWM 25% (mean voltage 1.25V)
const pwm25 = PNPTransistorModel.simulate(5.0, 1.25, 0.0, 2200, 500, 1.5, true, true, true);
// PWM 75% (mean voltage 3.75V)
const pwm75 = PNPTransistorModel.simulate(5.0, 3.75, 0.0, 2200, 500, 1.5, true, true, true);
assert(pwm25.baseCurrent > pwm75.baseCurrent, 'Lower base voltage (higher duty on active-low) must produce higher base current');

// ----------------------------------------------------
// TEST 9: Raspberry Pi Pico 3.3V GPIO Support
// ----------------------------------------------------
console.log('  Testing Test 9: Raspberry Pi Pico 3.3V GPIO Support...');
// Pico 3.3V rail -> E, Pico GPIO (0V) -> Base
const picoOn = PNPTransistorModel.simulate(3.3, 0.0, 0.0, 1000, 330, 1.8, true, true, true);
assert.strictEqual(picoOn.VEB, 3.3, 'VEB should be 3.3V on Pico');
assert(picoOn.isConducting, 'PNP must conduct with 3.3V Pico GPIO LOW');

// Pico GPIO HIGH (3.3V) -> Base
const picoOff = PNPTransistorModel.simulate(3.3, 3.3, 0.0, 1000, 330, 1.8, true, true, true);
assert.strictEqual(picoOff.state, 'cutoff', 'PNP must turn OFF with 3.3V Pico GPIO HIGH');

// ----------------------------------------------------
// TEST 10: Power Calculation
// ----------------------------------------------------
console.log('  Testing Test 10: Power Calculation...');
const powerSim = PNPTransistorModel.simulate(5.0, 4.0, 2.0, 5000, 500, 0.0, true, true, true);
const expectedPower = powerSim.VEC * powerSim.collectorCurrent + powerSim.VEB * powerSim.baseCurrent;
assert(Math.abs(powerSim.power - expectedPower) < 1e-6, 'Power calculation P = VEC*IC + VEB*IB must match');

// ----------------------------------------------------
// TEST 11: Floating Pins and Warning System
// ----------------------------------------------------
console.log('  Testing Test 11: Floating Pins and Warning System...');
// Floating Base
const floatingBase = PNPTransistorModel.simulate(5.0, 0.0, 0.0, 1000, 220, 0, false, true, true);
assert(floatingBase.warnings.some((w) => w.includes('base is floating')), 'Must detect floating base');
assert.strictEqual(floatingBase.isConducting, false);

// Floating Emitter
const floatingEmitter = PNPTransistorModel.simulate(5.0, 0.0, 0.0, 1000, 220, 0, true, false, true);
assert(floatingEmitter.warnings.some((w) => w.includes('emitter is floating')), 'Must detect floating emitter');

// Floating Collector
const floatingCollector = PNPTransistorModel.simulate(5.0, 0.0, 0.0, 1000, 220, 0, true, true, false);
assert(floatingCollector.warnings.some((w) => w.includes('collector is floating')), 'Must detect floating collector');

// Missing Base Resistor warning (RB < 5 ohms)
const noBaseResistor = PNPTransistorModel.simulate(5.0, 0.0, 0.0, 0, 220, 0, true, true, true);
assert.strictEqual(noBaseResistor.missingBaseResistor, true, 'Must detect missing base resistor');
assert(noBaseResistor.warnings.some((w) => w.includes('Missing base resistor')), 'Warning must alert missing base resistor');

console.log('✅ All 11 PNP Transistor test suites passed successfully!');
