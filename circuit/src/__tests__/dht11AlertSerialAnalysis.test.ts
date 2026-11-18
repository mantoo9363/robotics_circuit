// Test suite to reproduce and analyze DHT11 + Serial Monitor + LED Alert behavior
import assert from 'node:assert';
import { parseArduinoCode, ArduinoSimulator } from '../lib/arduino-simulator';
import { useCircuitStore } from '../lib/store';

console.log('=== TEST: DHT11 SERIAL MONITOR & ALERT LED ANALYSIS ===');

// Setup mock store with a DHT11 node at 39°C
useCircuitStore.setState({
  nodes: [
    {
      id: 'aa-uno',
      type: 'customNode',
      data: { label: 'Arduino Uno', componentType: 'arduino', rotation: 0, properties: {} } as any,
      position: { x: 80, y: 100 }
    },
    {
      id: 'aa-dht11',
      type: 'customNode',
      data: {
        label: 'DHT11',
        componentType: 'dht11',
        rotation: 0,
        properties: {
          temperature: { label: 'Temperature', type: 'number', value: 39, unit: '°C' },
          humidity: { label: 'Humidity', type: 'number', value: 31, unit: '%' }
        }
      } as any,
      position: { x: 420, y: 80 }
    }
  ],
  edges: []
});

const alertSketch = `
#define DHTPIN 2
#define ALERT_LED 8
#define DHTTYPE DHT11

void setup() {
  pinMode(ALERT_LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();

  if (temp > 30.0) {
    digitalWrite(ALERT_LED, HIGH);
    Serial.println("ALERT: High Temperature Warning!");
  } else {
    digitalWrite(ALERT_LED, LOW);
  }
}
`;

console.log('\n--- 1. Testing parseArduinoCode on Alert Sketch ---');
const parsed = parseArduinoCode(alertSketch);
console.log('Parse error:', parsed.error);
console.log('Setup instructions:', parsed.setup);
console.log('Loop instructions:', parsed.loop);

console.log('\n--- 2. Simulating Execution in ArduinoSimulator ---');
const outputs: string[] = [];
const sim = new ArduinoSimulator((state) => {
  if (state.serialOutput.length > 0) {
    outputs.push(...state.serialOutput);
  }
});

for (const instr of parsed.setup) {
  (sim as any).executeInstruction(instr);
}
for (const instr of parsed.loop) {
  (sim as any).executeInstruction(instr);
}

const pin8 = (sim as any).pins.get(8);
console.log('Pin 8 state after 1 loop:', pin8);
console.log('Serial outputs collected:', outputs);
