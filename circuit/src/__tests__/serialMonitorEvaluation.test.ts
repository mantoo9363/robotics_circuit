// Standalone test suite for dynamic Serial Monitor printing of variables, expressions, and sensor calls
import assert from 'node:assert';
import { parseArduinoCode, ArduinoSimulator } from '../lib/arduino-simulator';

console.log('=== RUNNING SERIAL MONITOR DYNAMIC EVALUATION TEST ===');

// Test 1: Numeric values formatted as numbers
{
  const code = `
    void setup() {
      Serial.begin(9600);
      int temp = 28;
      int hum = 72;
      Serial.print("Temp: ");
      Serial.print(temp);
      Serial.print(" C | Hum: ");
      Serial.println(hum);
    }
    void loop() {}
  `;
  const { setup } = parseArduinoCode(code);
  const outputs: string[] = [];
  const sim = new ArduinoSimulator((state) => {
    outputs.push(...state.serialOutput);
  });

  for (const instr of setup) {
    (sim as any).executeInstruction(instr);
  }

  const fullSerial = outputs.join('');
  console.log('[Trace Output 1]:', fullSerial);
  assert.ok(fullSerial.includes('Temp: 28 C | Hum: 72'), 'Output must contain Temp: 28 C | Hum: 72');
  assert.ok(!fullSerial.includes('Temp: \x1c'), 'Output must NOT contain ASCII control char');
  console.log('=> Test 1 PASSED: Numeric variables output cleanly as numbers');
}

// Test 2: Sensor function calls inside Serial.print
{
  const code = `
    void setup() {
      Serial.begin(9600);
      Serial.print("Sensor Read: ");
      Serial.println(dht.readTemperature());
    }
    void loop() {}
  `;
  const { setup } = parseArduinoCode(code);
  const outputs: string[] = [];
  const sim = new ArduinoSimulator((state) => {
    outputs.push(...state.serialOutput);
  });

  for (const instr of setup) {
    (sim as any).executeInstruction(instr);
  }

  const fullSerial = outputs.join('');
  console.log('[Trace Output 2]:', fullSerial);
  assert.ok(fullSerial.includes('Sensor Read: 24'), 'Output must dynamically evaluate dht.readTemperature()');
  console.log('=> Test 2 PASSED: Dynamic sensor function calls evaluated cleanly');
}

console.log('=== ALL SERIAL MONITOR TESTS PASSED ✅ ===');
