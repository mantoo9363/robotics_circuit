import type { CircuitNode, CircuitEdge } from './types';
import { COMPONENT_CATALOG } from './circuit-components';

function getDef(type: string) {
  return COMPONENT_CATALOG.find((c) => c.type === type);
}

function makeNode(
  id: string,
  type: string,
  x: number,
  y: number,
  propsOverride?: Record<string, { value: string | number }>
): CircuitNode {
  const def = getDef(type);
  const props = def?.defaultProperties ? structuredClone(def.defaultProperties) : {};
  if (propsOverride) {
    for (const [k, v] of Object.entries(propsOverride)) {
      if (props[k]) props[k] = { ...props[k], ...v };
      else props[k] = { ...v } as any;
    }
  }
  return {
    id,
    type,
    position: { x, y },
    data: {
      componentType: type,
      simulationModel: def?.simulationModel ?? type,
      label: def?.label ?? type,
      properties: props,
      rotation: 0,
    },
  };
}


function wire(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  color = '#22c55e'
): CircuitEdge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: 'wire',
    data: { color },
  };
}

// ---------------------------------------------------------------------------
// Arduino Presets
// ---------------------------------------------------------------------------

const arduinoBlinkNodes: CircuitNode[] = [
  makeNode('a-uno', 'arduino', 100, 100),
  makeNode('a-r1', 'resistor', 420, 210),
  makeNode('a-led1', 'led', 600, 180),
];
const arduinoBlinkEdges: CircuitEdge[] = [
  wire('aw1', 'a-uno', 'd13', 'a-r1', 'pin1'),
  wire('aw2', 'a-r1', 'pin2', 'a-led1', 'anode'),
  wire('aw3', 'a-led1', 'cathode', 'a-uno', 'gnd1', '#3b82f6'),
];
const arduinoBlinkCode = `// Arduino - Blink LED on pin 13

void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("Blink ready!");
}

void loop() {
  digitalWrite(13, HIGH);
  Serial.println("LED ON");
  delay(1000);
  digitalWrite(13, LOW);
  Serial.println("LED OFF");
  delay(1000);
}
`;

// Traffic Light
const arduinoTrafficNodes: CircuitNode[] = [
  makeNode('t-uno', 'arduino', 80, 80),
  makeNode('t-r1', 'resistor', 400, 100),
  makeNode('t-r2', 'resistor', 400, 210),
  makeNode('t-r3', 'resistor', 400, 320),
  makeNode('t-led-r', 'led', 600, 70, { color: { value: 'red' } }),
  makeNode('t-led-y', 'led', 600, 180, { color: { value: 'yellow' } }),
  makeNode('t-led-g', 'led', 600, 290, { color: { value: 'green' } }),
];
const arduinoTrafficEdges: CircuitEdge[] = [
  wire('tw1', 't-uno', 'd11', 't-r1', 'pin1'),
  wire('tw2', 't-r1', 'pin2', 't-led-r', 'anode'),
  wire('tw3', 't-led-r', 'cathode', 't-uno', 'gnd1', '#3b82f6'),
  wire('tw4', 't-uno', 'd12', 't-r2', 'pin1', '#eab308'),
  wire('tw5', 't-r2', 'pin2', 't-led-y', 'anode', '#eab308'),
  wire('tw6', 't-led-y', 'cathode', 't-uno', 'gnd2', '#3b82f6'),
  wire('tw7', 't-uno', 'd13', 't-r3', 'pin1'),
  wire('tw8', 't-r3', 'pin2', 't-led-g', 'anode'),
  wire('tw9', 't-led-g', 'cathode', 't-uno', 'gnd3', '#3b82f6'),
];
const arduinoTrafficCode = `// Arduino - Traffic Light
// Red=pin11, Yellow=pin12, Green=pin13

void setup() {
  pinMode(11, OUTPUT);
  pinMode(12, OUTPUT);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("Traffic light ready!");
}

void loop() {
  // Green
  digitalWrite(11, LOW);
  digitalWrite(12, LOW);
  digitalWrite(13, HIGH);
  Serial.println("GREEN");
  delay(2000);

  // Yellow
  digitalWrite(13, LOW);
  digitalWrite(12, HIGH);
  Serial.println("YELLOW");
  delay(1000);

  // Red
  digitalWrite(12, LOW);
  digitalWrite(11, HIGH);
  Serial.println("RED");
  delay(2000);
}
`;

// Fade LED (PWM)
const arduinoFadeNodes: CircuitNode[] = [
  makeNode('f-uno', 'arduino', 100, 100),
  makeNode('f-r1', 'resistor', 420, 210),
  makeNode('f-led1', 'led', 600, 180),
];
const arduinoFadeEdges: CircuitEdge[] = [
  wire('fw1', 'f-uno', 'd9', 'f-r1', 'pin1'),
  wire('fw2', 'f-r1', 'pin2', 'f-led1', 'anode'),
  wire('fw3', 'f-led1', 'cathode', 'f-uno', 'gnd1', '#3b82f6'),
];
const arduinoFadeCode = `// Arduino - Fade LED (PWM) on pin 9

void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
  Serial.println("Fade ready!");
}

void loop() {
  for (int brightness = 0; brightness <= 255; brightness += 5) {
    analogWrite(9, brightness);
    delay(30);
  }
  for (int brightness = 255; brightness >= 0; brightness -= 5) {
    analogWrite(9, brightness);
    delay(30);
  }
}
`;

// ---------------------------------------------------------------------------
// Arduino + L293D Presets (1 Motor, 2 Motors, 4 Motors)
// ---------------------------------------------------------------------------

// 1. Arduino + L293D + 1 DC Motor
const arduinoL293d1MotorNodes: CircuitNode[] = [
  makeNode('a-uno', 'arduino', 80, 80),
  makeNode('a-l293d', 'l293d', 380, 80),
  makeNode('a-motor1', 'dcmotor', 640, 140),
];
const arduinoL293d1MotorEdges: CircuitEdge[] = [
  wire('m1_e1', 'a-uno', '5v', 'a-l293d', 'vcc', '#ef4444'),
  wire('m1_e2', 'a-uno', '5v', 'a-l293d', 'vs', '#ef4444'),
  wire('m1_gnd', 'a-uno', 'gnd2', 'a-l293d', 'gnd1', '#000000'),
  wire('m1_e3', 'a-uno', 'd9', 'a-l293d', 'enable1', '#eab308'),
  wire('m1_e4', 'a-uno', 'd8', 'a-l293d', 'input1', '#22c55e'),
  wire('m1_e5', 'a-uno', 'd7', 'a-l293d', 'input2', '#3b82f6'),
  wire('m1_e6', 'a-l293d', 'output1', 'a-motor1', 'pin1', '#22c55e'),
  wire('m1_e7', 'a-l293d', 'output2', 'a-motor1', 'pin2', '#3b82f6'),
];
const arduinoL293d1MotorCode = `// Arduino + L293D + 1 DC Motor Speed controller
int ENA = 9;
int IN1 = 8;
int IN2 = 7;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  Serial.begin(9600);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
}

void loop() {
  analogWrite(ENA, 64);
  Serial.println("PWM = 64");
  delay(3000);

  analogWrite(ENA, 128);
  Serial.println("PWM = 128");
  delay(3000);

  analogWrite(ENA, 192);
  Serial.println("PWM = 192");
  delay(3000);

  analogWrite(ENA, 255);
  Serial.println("PWM = 255");
  delay(3000);
}
`;

// 2. Arduino + L293D + 2 DC Motors
const arduinoL293d2MotorsNodes: CircuitNode[] = [
  makeNode('a-uno', 'arduino', 80, 80),
  makeNode('a-l293d', 'l293d', 380, 80),
  makeNode('a-motorL', 'dcmotor', 640, 80),
  makeNode('a-motorR', 'dcmotor', 640, 240),
];
const arduinoL293d2MotorsEdges: CircuitEdge[] = [
  wire('m2_e1', 'a-uno', '5v', 'a-l293d', 'vcc', '#ef4444'),
  wire('m2_e2', 'a-uno', '5v', 'a-l293d', 'vs', '#ef4444'),
  wire('m2_gnd', 'a-uno', 'gnd2', 'a-l293d', 'gnd1', '#000000'),
  // Left Motor (Channel 1 & 2)
  wire('m2_e3', 'a-uno', 'd9', 'a-l293d', 'enable1', '#eab308'),
  wire('m2_e4', 'a-uno', 'd8', 'a-l293d', 'input1', '#22c55e'),
  wire('m2_e5', 'a-uno', 'd7', 'a-l293d', 'input2', '#3b82f6'),
  wire('m2_e6', 'a-l293d', 'output1', 'a-motorL', 'pin1', '#22c55e'),
  wire('m2_e7', 'a-l293d', 'output2', 'a-motorL', 'pin2', '#3b82f6'),
  // Right Motor (Channel 3 & 4)
  wire('m2_e8', 'a-uno', 'd3', 'a-l293d', 'enable2', '#eab308'),
  wire('m2_e9', 'a-uno', 'd4', 'a-l293d', 'input3', '#22c55e'),
  wire('m2_e10', 'a-uno', 'd5', 'a-l293d', 'input4', '#3b82f6'),
  wire('m2_e11', 'a-l293d', 'output3', 'a-motorR', 'pin1', '#22c55e'),
  wire('m2_e12', 'a-l293d', 'output4', 'a-motorR', 'pin2', '#3b82f6'),
];
const arduinoL293d2MotorsCode = `// Arduino + L293D + 2 DC Motors (Dual Channel Differential Drive)
int ENA = 9; int IN1 = 8; int IN2 = 7; // Left Motor
int ENB = 3; int IN3 = 4; int IN4 = 5; // Right Motor

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.begin(9600);
  Serial.println("L293D 2-Motor Differential Drive Ready!");
}

void loop() {
  // Both Motors Forward
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(ENA, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 255);
  Serial.println("Driving Forward");
  delay(2000);

  // Turn Left (Left Reverse, Right Forward)
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH); analogWrite(ENA, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 255);
  Serial.println("Turning Left");
  delay(1500);

  // Both Motors Stop
  analogWrite(ENA, 0); analogWrite(ENB, 0);
  Serial.println("Motors Stopped");
  delay(1000);
}
`;

// 3. Arduino + L293D + 4 DC Motors (4WD)
const arduinoL293d4MotorsNodes: CircuitNode[] = [
  makeNode('a-uno', 'arduino', 80, 80),
  makeNode('a-l293d', 'l293d', 380, 80),
  makeNode('fl', 'dcmotor', 640, 40),
  makeNode('rl', 'dcmotor', 640, 140),
  makeNode('fr', 'dcmotor', 640, 240),
  makeNode('rr', 'dcmotor', 640, 340),
];
const arduinoL293d4MotorsEdges: CircuitEdge[] = [
  wire('m4_e1', 'a-uno', '5v', 'a-l293d', 'vcc', '#ef4444'),
  wire('m4_e2', 'a-uno', '5v', 'a-l293d', 'vs', '#ef4444'),
  wire('m4_gnd', 'a-uno', 'gnd2', 'a-l293d', 'gnd1', '#000000'),
  // Left Side Control (Channel 1 & 2)
  wire('m4_e3', 'a-uno', 'd9', 'a-l293d', 'enable1', '#eab308'),
  wire('m4_e4', 'a-uno', 'd8', 'a-l293d', 'input1', '#22c55e'),
  wire('m4_e5', 'a-uno', 'd7', 'a-l293d', 'input2', '#3b82f6'),
  // Left Side Parallel Motors (FL & RL)
  wire('m4_e6', 'a-l293d', 'output1', 'fl', 'pin1', '#22c55e'),
  wire('m4_e7', 'a-l293d', 'output2', 'fl', 'pin2', '#3b82f6'),
  wire('m4_e8', 'a-l293d', 'output1', 'rl', 'pin1', '#22c55e'),
  wire('m4_e9', 'a-l293d', 'output2', 'rl', 'pin2', '#3b82f6'),

  // Right Side Control (Channel 3 & 4)
  wire('m4_e10', 'a-uno', 'd3', 'a-l293d', 'enable2', '#eab308'),
  wire('m4_e11', 'a-uno', 'd4', 'a-l293d', 'input3', '#22c55e'),
  wire('m4_e12', 'a-uno', 'd5', 'a-l293d', 'input4', '#3b82f6'),
  // Right Side Parallel Motors (FR & RR)
  wire('m4_e13', 'a-l293d', 'output3', 'fr', 'pin1', '#22c55e'),
  wire('m4_e14', 'a-l293d', 'output4', 'fr', 'pin2', '#3b82f6'),
  wire('m4_e15', 'a-l293d', 'output3', 'rr', 'pin1', '#22c55e'),
  wire('m4_e16', 'a-l293d', 'output4', 'rr', 'pin2', '#3b82f6'),
];
const arduinoL293d4MotorsCode = `// Arduino + L293D + 4 DC Motors (4WD Parallel Drive)
int ENA = 9; int IN1 = 8; int IN2 = 7; // Left Side (Front-Left & Rear-Left)
int ENB = 3; int IN3 = 4; int IN4 = 5; // Right Side (Front-Right & Rear-Right)

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.begin(9600);
  Serial.println("L293D 4WD 4-Motor Drive Ready!");
}

void loop() {
  // 4WD Forward
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(ENA, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 255);
  Serial.println("4WD Full Forward");
  delay(2500);

  // 4WD Reverse
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH); analogWrite(ENA, 255);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH); analogWrite(ENB, 255);
  Serial.println("4WD Full Reverse");
  delay(2500);

  // Stop
  analogWrite(ENA, 0); analogWrite(ENB, 0);
  Serial.println("4WD Stopped");
  delay(1000);
}
`;

// 4. Arduino + DHT11 Sensor + RGB LED Temperature Monitor
const arduinoDhtRgbNodes: CircuitNode[] = [
  makeNode('dht-uno', 'arduino', 80, 100),
  makeNode('dht-sensor', 'dht11', 480, 20),
  makeNode('dht-r-red', 'resistor', 480, 160, { resistance: { value: 220 } }),
  makeNode('dht-r-green', 'resistor', 480, 240, { resistance: { value: 220 } }),
  makeNode('dht-r-blue', 'resistor', 480, 320, { resistance: { value: 220 } }),
  makeNode('dht-rgb', 'ledrgb', 640, 220),
];


const arduinoDhtRgbEdges: CircuitEdge[] = [
  // DHT11 Wires
  wire('dht_e1', 'dht-sensor', 'vcc', 'dht-uno', '5v', '#ef4444'),
  wire('dht_e2', 'dht-sensor', 'gnd', 'dht-uno', 'gnd1', '#000000'),
  wire('dht_e3', 'dht-sensor', 'data', 'dht-uno', 'd2', '#22c55e'),
  // RGB LED Resistors & Wires
  wire('dht_e4', 'dht-uno', 'd9', 'dht-r-red', 'pin1', '#ef4444'),
  wire('dht_e5', 'dht-r-red', 'pin2', 'dht-rgb', 'red', '#ef4444'),
  wire('dht_e6', 'dht-uno', 'd10', 'dht-r-green', 'pin1', '#22c55e'),
  wire('dht_e7', 'dht-r-green', 'pin2', 'dht-rgb', 'green', '#22c55e'),
  wire('dht_e8', 'dht-uno', 'd11', 'dht-r-blue', 'pin1', '#3b82f6'),
  wire('dht_e9', 'dht-r-blue', 'pin2', 'dht-rgb', 'blue', '#3b82f6'),
  wire('dht_e10', 'dht-rgb', 'ground', 'dht-uno', 'gnd2', '#000000'),
];


const arduinoDhtRgbCode = `// Arduino + DHT11 Sensor + RGB LED Temperature Indicator
#include <DHT.h>

#define DHTPIN 2
#define DHTTYPE DHT11

const int redPin = 9;
const int greenPin = 10;
const int bluePin = 11;

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(9600);
  dht.begin();
  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);
  Serial.println("DHT11 + RGB Temp Monitor Ready!");
}

void loop() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();

  if (isnan(temp) || isnan(hum)) {
    Serial.println("DHT11 Error!");
    return;
  }

  Serial.print("Temp: ");
  Serial.print(temp);
  Serial.print(" C | Hum: ");
  Serial.print(hum);
  Serial.println(" %");

  if (temp < 20.0) {
    // Cold (<20°C) -> Blue LED
    digitalWrite(redPin, LOW);
    digitalWrite(greenPin, LOW);
    digitalWrite(bluePin, HIGH);
    Serial.println("Status: Cold (Blue LED)");
  }
  
  if (temp >= 20.0 && temp <= 30.0) {
    // Normal (20°C - 30°C) -> Green LED
    digitalWrite(redPin, LOW);
    digitalWrite(greenPin, HIGH);
    digitalWrite(bluePin, LOW);
    Serial.println("Status: Normal (Green LED)");
  }
  
  if (temp > 30.0) {
    // Hot (>30°C) -> Red LED
    digitalWrite(redPin, HIGH);
    digitalWrite(greenPin, LOW);
    digitalWrite(bluePin, LOW);
    Serial.println("Status: Hot (Red LED)");
  }

  delay(1000);
}
`;

// 5. Arduino + DHT11 Sensor + NeoPixel (WS2812B) Temperature Monitor
const arduinoDhtNeopixelNodes: CircuitNode[] = [

  makeNode('dht-neo-uno', 'arduino', 80, 100),
  makeNode('dht-neo-sensor', 'dht11', 480, 40),
  makeNode('dht-neo-pixel', 'neopixel', 480, 260),
];

const arduinoDhtNeopixelEdges: CircuitEdge[] = [
  // DHT11 Wires
  wire('dht_nw1', 'dht-neo-sensor', 'vcc', 'dht-neo-uno', '5v', '#ef4444'),
  wire('dht_nw2', 'dht-neo-sensor', 'gnd', 'dht-neo-uno', 'gnd1', '#000000'),
  wire('dht_nw3', 'dht-neo-sensor', 'data', 'dht-neo-uno', 'd2', '#22c55e'),
  // NeoPixel (WS2812B) Wires
  wire('dht_nw4', 'dht-neo-pixel', 'vcc1', 'dht-neo-uno', '5v', '#ef4444'),
  wire('dht_nw5', 'dht-neo-pixel', 'ground1', 'dht-neo-uno', 'gnd2', '#000000'),
  wire('dht_nw6', 'dht-neo-pixel', 'in', 'dht-neo-uno', 'd6', '#eab308'),
];

const arduinoDhtNeopixelCode = `// Arduino + DHT11 Sensor + NeoPixel (WS2812B) Temperature Monitor
#include <DHT.h>
#include <Adafruit_NeoPixel.h>

#define DHTPIN 2
#define DHTTYPE DHT11
#define NEO_PIN 6
#define NUMPIXELS 1

DHT dht(DHTPIN, DHTTYPE);
Adafruit_NeoPixel pixels(NUMPIXELS, NEO_PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  Serial.begin(9600);
  dht.begin();
  pixels.begin();
  pixels.clear();
  pixels.show();
  Serial.println("DHT11 + NeoPixel Monitor Ready!");
}

void loop() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();

  if (isnan(temp) || isnan(hum)) {
    Serial.println("DHT11 Error!");
    return;
  }

  Serial.print("Temp: ");
  Serial.print(temp);
  Serial.print(" C | Hum: ");
  Serial.print(hum);
  Serial.println(" %");

  if (temp < 20.0) {
    // Cold (<20°C) -> Blue NeoPixel
    pixels.setPixelColor(0, pixels.Color(0, 100, 255));
    pixels.show();
    Serial.println("Status: Cold (Blue NeoPixel)");
  }
  
  if (temp >= 20.0 && temp <= 30.0) {
    // Normal (20°C - 30°C) -> Green NeoPixel
    pixels.setPixelColor(0, pixels.Color(0, 255, 60));
    pixels.show();
    Serial.println("Status: Normal (Green NeoPixel)");
  }
  
  if (temp > 30.0) {
    // Hot (>30°C) -> Red NeoPixel
    pixels.setPixelColor(0, pixels.Color(255, 30, 0));
    pixels.show();
    Serial.println("Status: Hot (Red NeoPixel)");
  }

  delay(1000);
}
`;

// ---------------------------------------------------------------------------
// Raspberry Pi Pico Presets
// ---------------------------------------------------------------------------


const picoBlinkNodes: CircuitNode[] = [
  makeNode('p-pico', 'raspberrypipico', 100, 100),
  makeNode('p-r1', 'resistor', 420, 210),
  makeNode('p-led1', 'led', 600, 180),
];
const picoBlinkEdges: CircuitEdge[] = [
  wire('pw1', 'p-pico', 'gp15', 'p-r1', 'pin1'),
  wire('pw2', 'p-r1', 'pin2', 'p-led1', 'anode'),
  wire('pw3', 'p-led1', 'cathode', 'p-pico', 'pico_gnd1', '#3b82f6'),
];
const picoBlinkCode = `# MicroPython - Blink LED on GP15
from machine import Pin
import time

led = Pin(15, Pin.OUT)
print("Blink ready!")

while True:
    led.value(1)
    print("LED ON")
    time.sleep(1)
    led.value(0)
    print("LED OFF")
    time.sleep(1)
`;

const picoBlinkCodeCpp = `// Arduino C++ for Raspberry Pi Pico - Blink LED on GP15
void setup() {
  pinMode(15, OUTPUT);
  Serial.begin(115200);
  Serial.println("Pico C++ Blink ready!");
}

void loop() {
  digitalWrite(15, HIGH);
  Serial.println("LED ON");
  delay(1000);
  digitalWrite(15, LOW);
  Serial.println("LED OFF");
  delay(1000);
}
`;

// Pico Traffic Light
const picoTrafficNodes: CircuitNode[] = [
  makeNode('pt-pico', 'raspberrypipico', 80, 80),
  makeNode('pt-r1', 'resistor', 400, 100),
  makeNode('pt-r2', 'resistor', 400, 210),
  makeNode('pt-r3', 'resistor', 400, 320),
  makeNode('pt-led-r', 'led', 600, 70, { color: { value: 'red' } }),
  makeNode('pt-led-y', 'led', 600, 180, { color: { value: 'yellow' } }),
  makeNode('pt-led-g', 'led', 600, 290, { color: { value: 'green' } }),
];
const picoTrafficEdges: CircuitEdge[] = [
  wire('ptw1', 'pt-pico', 'gp13', 'pt-r1', 'pin1'),
  wire('ptw2', 'pt-r1', 'pin2', 'pt-led-r', 'anode'),
  wire('ptw3', 'pt-led-r', 'cathode', 'pt-pico', 'pico_gnd1', '#3b82f6'),
  wire('ptw4', 'pt-pico', 'gp14', 'pt-r2', 'pin1', '#eab308'),
  wire('ptw5', 'pt-r2', 'pin2', 'pt-led-y', 'anode', '#eab308'),
  wire('ptw6', 'pt-led-y', 'cathode', 'pt-pico', 'pico_gnd2', '#3b82f6'),
  wire('ptw7', 'pt-pico', 'gp15', 'pt-r3', 'pin1'),
  wire('ptw8', 'pt-r3', 'pin2', 'pt-led-g', 'anode'),
  wire('ptw9', 'pt-led-g', 'cathode', 'pt-pico', 'pico_gnd3', '#3b82f6'),
];
const picoTrafficCode = `# MicroPython - Traffic Light
# Red=GP13, Yellow=GP14, Green=GP15
from machine import Pin
import time

red = Pin(13, Pin.OUT)
yellow = Pin(14, Pin.OUT)
green = Pin(15, Pin.OUT)
print("Pico Traffic light ready!")

while True:
    red.value(0)
    yellow.value(0)
    green.value(1)
    print("GREEN")
    time.sleep(2)

    green.value(0)
    yellow.value(1)
    print("YELLOW")
    time.sleep(1)

    yellow.value(0)
    red.value(1)
    print("RED")
    time.sleep(2)
`;

const picoTrafficCodeCpp = `// Arduino C++ for Raspberry Pi Pico - Traffic Light
// Red=GP13, Yellow=GP14, Green=GP15
void setup() {
  pinMode(13, OUTPUT);
  pinMode(14, OUTPUT);
  pinMode(15, OUTPUT);
  Serial.begin(115200);
  Serial.println("Pico C++ Traffic light ready!");
}

void loop() {
  digitalWrite(13, LOW);
  digitalWrite(14, LOW);
  digitalWrite(15, HIGH);
  Serial.println("GREEN");
  delay(2000);

  digitalWrite(15, LOW);
  digitalWrite(14, HIGH);
  Serial.println("YELLOW");
  delay(1000);

  digitalWrite(14, LOW);
  digitalWrite(13, HIGH);
  Serial.println("RED");
  delay(2000);
}
`;

// Pico Onboard LED
const picoOnboardNodes: CircuitNode[] = [
  makeNode('po-pico', 'raspberrypipico', 100, 100),
];
const picoOnboardEdges: CircuitEdge[] = [];
const picoOnboardCode = `# MicroPython - Blink Onboard LED (GP25 / LED)
from machine import Pin
import time

try:
    led = Pin("LED", Pin.OUT)
except TypeError:
    led = Pin(25, Pin.OUT)

print("Onboard LED ready!")

while True:
    led.value(1)
    print("LED ON")
    time.sleep(1)
    led.value(0)
    print("LED OFF")
    time.sleep(1)
`;

const picoOnboardCodeCpp = `// Arduino C++ for Raspberry Pi Pico - Blink Onboard LED (LED_BUILTIN / GP25)
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("Pico C++ Onboard LED ready!");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("LED ON");
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("LED OFF");
  delay(1000);
}
`;

// Pico + L293D + 1 DC Motor
const picoL293d1MotorNodes: CircuitNode[] = [
  makeNode('p-pico', 'raspberrypipico', 80, 80),
  makeNode('p-l293d', 'l293d', 380, 80),
  makeNode('p-motor1', 'dcmotor', 640, 140),
];
const picoL293d1MotorEdges: CircuitEdge[] = [
  wire('pm1_e1', 'p-pico', 'pico_vbus', 'p-l293d', 'vcc', '#ef4444'),
  wire('pm1_e2', 'p-pico', 'pico_vbus', 'p-l293d', 'vs', '#ef4444'),
  wire('pm1_gnd', 'p-pico', 'pico_gnd4', 'p-l293d', 'gnd1', '#000000'),
  wire('pm1_e3', 'p-pico', 'gp15', 'p-l293d', 'enable1', '#eab308'),
  wire('pm1_e4', 'p-pico', 'gp14', 'p-l293d', 'input1', '#22c55e'),
  wire('pm1_e5', 'p-pico', 'gp13', 'p-l293d', 'input2', '#3b82f6'),
  wire('pm1_e6', 'p-l293d', 'output1', 'p-motor1', 'pin1', '#22c55e'),
  wire('pm1_e7', 'p-l293d', 'output2', 'p-motor1', 'pin2', '#3b82f6'),
];
const picoL293d1MotorPicoCode = `# MicroPython - Raspberry Pi Pico + L293D DC Motor Control
from machine import Pin, PWM
import time

ena = PWM(Pin(15))
ena.freq(1000)
in1 = Pin(14, Pin.OUT)
in2 = Pin(13, Pin.OUT)

print("Pico + L293D Motor Control Ready!")

while True:
    # Forward (100% Speed)
    in1.value(1)
    in2.value(0)
    ena.duty_u16(65535)
    print("Motor: Forward")
    time.sleep(2)

    # Reverse (50% Speed)
    in1.value(0)
    in2.value(1)
    ena.duty_u16(32768)
    print("Motor: Reverse")
    time.sleep(2)

    # Stop
    in1.value(0)
    in2.value(0)
    ena.duty_u16(0)
    print("Motor: Stopped")
    time.sleep(1)
`.trim();
const picoL293d1MotorCppCode = `// Arduino C++ for Raspberry Pi Pico + L293D 1-Motor Control
int ENA = 15; int IN1 = 14; int IN2 = 13;

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  Serial.begin(115200);
  Serial.println("Pico C++ L293D 1-Motor Control Ready!");
}

void loop() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(ENA, 255);
  Serial.println("Motor 1: Forward");
  delay(2000);

  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH); analogWrite(ENA, 128);
  Serial.println("Motor 1: Reverse");
  delay(2000);

  analogWrite(ENA, 0);
  Serial.println("Motor 1: Stopped");
  delay(1000);
}
`;

// Pico + L293D + 2 DC Motors
const picoL293d2MotorsNodes: CircuitNode[] = [
  makeNode('p-pico', 'raspberrypipico', 80, 80),
  makeNode('p-l293d', 'l293d', 380, 80),
  makeNode('p-motorL', 'dcmotor', 640, 80),
  makeNode('p-motorR', 'dcmotor', 640, 240),
];
const picoL293d2MotorsEdges: CircuitEdge[] = [
  wire('pm2_e1', 'p-pico', 'pico_vbus', 'p-l293d', 'vcc', '#ef4444'),
  wire('pm2_e2', 'p-pico', 'pico_vbus', 'p-l293d', 'vs', '#ef4444'),
  wire('pm2_gnd', 'p-pico', 'pico_gnd4', 'p-l293d', 'gnd1', '#000000'),
  // Left Motor (Channel 1 & 2)
  wire('pm2_e3', 'p-pico', 'gp15', 'p-l293d', 'enable1', '#eab308'),
  wire('pm2_e4', 'p-pico', 'gp14', 'p-l293d', 'input1', '#22c55e'),
  wire('pm2_e5', 'p-pico', 'gp13', 'p-l293d', 'input2', '#3b82f6'),
  wire('pm2_e6', 'p-l293d', 'output1', 'p-motorL', 'pin1', '#22c55e'),
  wire('pm2_e7', 'p-l293d', 'output2', 'p-motorL', 'pin2', '#3b82f6'),
  // Right Motor (Channel 3 & 4)
  wire('pm2_e8', 'p-pico', 'gp12', 'p-l293d', 'enable2', '#eab308'),
  wire('pm2_e9', 'p-pico', 'gp11', 'p-l293d', 'input3', '#22c55e'),
  wire('pm2_e10', 'p-pico', 'gp10', 'p-l293d', 'input4', '#3b82f6'),
  wire('pm2_e11', 'p-l293d', 'output3', 'p-motorR', 'pin1', '#22c55e'),
  wire('pm2_e12', 'p-l293d', 'output4', 'p-motorR', 'pin2', '#3b82f6'),
];
const picoL293d2MotorsPicoCode = `# MicroPython - Raspberry Pi Pico + L293D Dual DC Motor Control
from machine import Pin, PWM
import time

ena = PWM(Pin(15))
ena.freq(1000)
in1 = Pin(14, Pin.OUT)
in2 = Pin(13, Pin.OUT)

enb = PWM(Pin(12))
enb.freq(1000)
in3 = Pin(11, Pin.OUT)
in4 = Pin(10, Pin.OUT)

print("Pico + L293D Dual Motor Control Ready!")

while True:
    # Both Motors Forward
    in1.value(1); in2.value(0); ena.duty_u16(65535)
    in3.value(1); in4.value(0); enb.duty_u16(65535)
    print("Driving Forward")
    time.sleep(2)

    # Turn Left (Left Reverse, Right Forward)
    in1.value(0); in2.value(1); ena.duty_u16(65535)
    in3.value(1); in4.value(0); enb.duty_u16(65535)
    print("Turning Left")
    time.sleep(1.5)

    # Both Motors Stop
    in1.value(0); in2.value(0); ena.duty_u16(0)
    in3.value(0); in4.value(0); enb.duty_u16(0)
    print("Motors Stopped")
    time.sleep(1)
`.trim();
const picoL293d2MotorsCodeCpp = `// Arduino C++ for Raspberry Pi Pico + L293D Dual Motor Control
int ENA = 15; int IN1 = 14; int IN2 = 13;
int ENB = 12; int IN3 = 11; int IN4 = 10;

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.begin(115200);
  Serial.println("Pico C++ L293D Dual Motor Control Ready!");
}

void loop() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(ENA, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 255);
  Serial.println("Driving Forward");
  delay(2000);

  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH); analogWrite(ENA, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 255);
  Serial.println("Turning Left");
  delay(1500);

  analogWrite(ENA, 0); analogWrite(ENB, 0);
  Serial.println("Motors Stopped");
  delay(1000);
}
`;

// Arduino + L293D + 2 Hobby Gearmotors
const arduinoL293dHobbyNodes: CircuitNode[] = [
  makeNode('a-uno', 'arduino', 80, 80),
  makeNode('a-l293d', 'l293d', 380, 80),
  makeNode('a-hobbyL', 'hobbyGearmotor', 640, 80),
  makeNode('a-hobbyR', 'hobbyGearmotor', 640, 240),
];
const arduinoL293dHobbyEdges: CircuitEdge[] = [
  wire('ah_e1', 'a-uno', '5v', 'a-l293d', 'vcc', '#ef4444'),
  wire('ah_e2', 'a-uno', '5v', 'a-l293d', 'vs', '#ef4444'),
  wire('ah_gnd', 'a-uno', 'gnd2', 'a-l293d', 'gnd1', '#000000'),
  wire('ah_e3', 'a-uno', 'd9', 'a-l293d', 'enable1', '#eab308'),
  wire('ah_e4', 'a-uno', 'd8', 'a-l293d', 'input1', '#22c55e'),
  wire('ah_e5', 'a-uno', 'd7', 'a-l293d', 'input2', '#3b82f6'),
  wire('ah_e6', 'a-l293d', 'output1', 'a-hobbyL', 'pin1', '#22c55e'),
  wire('ah_e7', 'a-l293d', 'output2', 'a-hobbyL', 'pin2', '#3b82f6'),
  wire('ah_e8', 'a-uno', 'd3', 'a-l293d', 'enable2', '#eab308'),
  wire('ah_e9', 'a-uno', 'd4', 'a-l293d', 'input3', '#22c55e'),
  wire('ah_e10', 'a-uno', 'd5', 'a-l293d', 'input4', '#3b82f6'),
  wire('ah_e11', 'a-l293d', 'output3', 'a-hobbyR', 'pin1', '#22c55e'),
  wire('ah_e12', 'a-l293d', 'output4', 'a-hobbyR', 'pin2', '#3b82f6'),
];
const arduinoL293dHobbyCode = `// Arduino + L293D + 2 Hobby TT Gearmotors
int ENA = 9; int IN1 = 8; int IN2 = 7;
int ENB = 3; int IN3 = 4; int IN4 = 5;

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.begin(9600);
  Serial.println("L293D Dual Hobby Gearmotor Drive Ready!");
}

void loop() {
  // Drive Forward
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(ENA, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 255);
  Serial.println("Hobby Gearmotors: Forward");
  delay(2000);

  // Turn Left
  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH); analogWrite(ENA, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 255);
  Serial.println("Hobby Gearmotors: Turning Left");
  delay(1500);

  // Stop
  analogWrite(ENA, 0); analogWrite(ENB, 0);
  Serial.println("Hobby Gearmotors: Stopped");
  delay(1000);
}
`;

// Pico + L293D + 2 Hobby Gearmotors
const picoL293dHobbyNodes: CircuitNode[] = [
  makeNode('p-pico', 'raspberrypipico', 80, 80),
  makeNode('p-l293d', 'l293d', 380, 80),
  makeNode('p-hobbyL', 'hobbyGearmotor', 640, 80),
  makeNode('p-hobbyR', 'hobbyGearmotor', 640, 240),
];
const picoL293dHobbyEdges: CircuitEdge[] = [
  wire('ph_e1', 'p-pico', 'pico_vbus', 'p-l293d', 'vcc', '#ef4444'),
  wire('ph_e2', 'p-pico', 'pico_vbus', 'p-l293d', 'vs', '#ef4444'),
  wire('ph_gnd', 'p-pico', 'pico_gnd4', 'p-l293d', 'gnd1', '#000000'),
  wire('ph_e3', 'p-pico', 'gp15', 'p-l293d', 'enable1', '#eab308'),
  wire('ph_e4', 'p-pico', 'gp14', 'p-l293d', 'input1', '#22c55e'),
  wire('ph_e5', 'p-pico', 'gp13', 'p-l293d', 'input2', '#3b82f6'),
  wire('ph_e6', 'p-l293d', 'output1', 'p-hobbyL', 'pin1', '#22c55e'),
  wire('ph_e7', 'p-l293d', 'output2', 'p-hobbyL', 'pin2', '#3b82f6'),
  wire('ph_e8', 'p-pico', 'gp12', 'p-l293d', 'enable2', '#eab308'),
  wire('ph_e9', 'p-pico', 'gp11', 'p-l293d', 'input3', '#22c55e'),
  wire('ph_e10', 'p-pico', 'gp10', 'p-l293d', 'input4', '#3b82f6'),
  wire('ph_e11', 'p-l293d', 'output3', 'p-hobbyR', 'pin1', '#22c55e'),
  wire('ph_e12', 'p-l293d', 'output4', 'p-hobbyR', 'pin2', '#3b82f6'),
];
const picoL293dHobbyPicoCode = `# MicroPython - Raspberry Pi Pico + L293D Dual Hobby Gearmotor
from machine import Pin, PWM
import time

ena = PWM(Pin(15))
ena.freq(1000)
in1 = Pin(14, Pin.OUT)
in2 = Pin(13, Pin.OUT)

enb = PWM(Pin(12))
enb.freq(1000)
in3 = Pin(11, Pin.OUT)
in4 = Pin(10, Pin.OUT)

print("Pico + L293D Dual Hobby Gearmotor Ready!")

while True:
    # Forward
    in1.value(1); in2.value(0); ena.duty_u16(65535)
    in3.value(1); in4.value(0); enb.duty_u16(65535)
    print("Hobby Gearmotors: Forward")
    time.sleep(2)

    # Turn Left
    in1.value(0); in2.value(1); ena.duty_u16(65535)
    in3.value(1); in4.value(0); enb.duty_u16(65535)
    print("Hobby Gearmotors: Turning Left")
    time.sleep(1.5)

    # Stop
    in1.value(0); in2.value(0); ena.duty_u16(0)
    in3.value(0); in4.value(0); enb.duty_u16(0)
    print("Hobby Gearmotors: Stopped")
    time.sleep(1)
`.trim();
const picoL293dHobbyCppCode = `// Arduino C++ for Raspberry Pi Pico + L293D Dual Hobby Gearmotor
int ENA = 15; int IN1 = 14; int IN2 = 13;
int ENB = 12; int IN3 = 11; int IN4 = 10;

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.begin(115200);
  Serial.println("Pico C++ L293D Dual Hobby Gearmotor Ready!");
}

void loop() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(ENA, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 255);
  Serial.println("Hobby Gearmotors: Forward");
  delay(2000);

  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH); analogWrite(ENA, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 255);
  Serial.println("Hobby Gearmotors: Turning Left");
  delay(1500);

  analogWrite(ENA, 0); analogWrite(ENB, 0);
  Serial.println("Hobby Gearmotors: Stopped");
  delay(1000);
}
`;

// Pico + L293D + 4 DC Motors (4WD)
const picoL293d4MotorsNodes: CircuitNode[] = [
  makeNode('p-pico', 'raspberrypipico', 80, 80),
  makeNode('p-l293d', 'l293d', 380, 80),
  makeNode('fl', 'dcmotor', 640, 40),
  makeNode('rl', 'dcmotor', 640, 140),
  makeNode('fr', 'dcmotor', 640, 240),
  makeNode('rr', 'dcmotor', 640, 340),
];
const picoL293d4MotorsEdges: CircuitEdge[] = [
  wire('pm4_e1', 'p-pico', 'pico_vbus', 'p-l293d', 'vcc', '#ef4444'),
  wire('pm4_e2', 'p-pico', 'pico_vbus', 'p-l293d', 'vs', '#ef4444'),
  wire('pm4_gnd', 'p-pico', 'pico_gnd4', 'p-l293d', 'gnd1', '#000000'),
  // Left Side Control (Channel 1 & 2)
  wire('pm4_e3', 'p-pico', 'gp15', 'p-l293d', 'enable1', '#eab308'),
  wire('pm4_e4', 'p-pico', 'gp14', 'p-l293d', 'input1', '#22c55e'),
  wire('pm4_e5', 'p-pico', 'gp13', 'p-l293d', 'input2', '#3b82f6'),
  wire('pm4_e6', 'p-l293d', 'output1', 'fl', 'pin1', '#22c55e'),
  wire('pm4_e7', 'p-l293d', 'output2', 'fl', 'pin2', '#3b82f6'),
  wire('pm4_e8', 'p-l293d', 'output1', 'rl', 'pin1', '#22c55e'),
  wire('pm4_e9', 'p-l293d', 'output2', 'rl', 'pin2', '#3b82f6'),
  // Right Side Control (Channel 3 & 4)
  wire('pm4_e10', 'p-pico', 'gp12', 'p-l293d', 'enable2', '#eab308'),
  wire('pm4_e11', 'p-pico', 'gp11', 'p-l293d', 'input3', '#22c55e'),
  wire('pm4_e12', 'p-pico', 'gp10', 'p-l293d', 'input4', '#3b82f6'),
  wire('pm4_e13', 'p-l293d', 'output3', 'fr', 'pin1', '#22c55e'),
  wire('pm4_e14', 'p-l293d', 'output4', 'fr', 'pin2', '#3b82f6'),
  wire('pm4_e15', 'p-l293d', 'output3', 'rr', 'pin1', '#22c55e'),
  wire('pm4_e16', 'p-l293d', 'output4', 'rr', 'pin2', '#3b82f6'),
];
const picoL293d4MotorsPicoCode = `# MicroPython - Raspberry Pi Pico + L293D 4WD (4 Motors Parallel Drive)
from machine import Pin, PWM
import time

ena = PWM(Pin(15))
ena.freq(1000)
in1 = Pin(14, Pin.OUT)
in2 = Pin(13, Pin.OUT)

enb = PWM(Pin(12))
enb.freq(1000)
in3 = Pin(11, Pin.OUT)
in4 = Pin(10, Pin.OUT)

print("Pico + L293D 4WD Motor Drive Ready!")

while True:
    # 4WD Forward
    in1.value(1); in2.value(0); ena.duty_u16(65535)
    in3.value(1); in4.value(0); enb.duty_u16(65535)
    print("4WD Full Forward")
    time.sleep(2.5)

    # 4WD Reverse
    in1.value(0); in2.value(1); ena.duty_u16(65535)
    in3.value(0); in4.value(1); enb.duty_u16(65535)
    print("4WD Full Reverse")
    time.sleep(2.5)

    # Stop
    in1.value(0); in2.value(0); ena.duty_u16(0)
    in3.value(0); in4.value(0); enb.duty_u16(0)
    print("4WD Stopped")
    time.sleep(1)
`.trim();
const picoL293d4MotorsCppCode = `// Arduino C++ for Pico - L293D 4WD (4 Motors Parallel Drive)
int ENA = 15; int IN1 = 14; int IN2 = 13;
int ENB = 12; int IN3 = 11; int IN4 = 10;

void setup() {
  pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  Serial.begin(115200);
  Serial.println("Pico C++ L293D 4WD Motor Drive Ready!");
}

void loop() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(ENA, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(ENB, 255);
  Serial.println("4WD Full Forward");
  delay(2500);

  digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH); analogWrite(ENA, 255);
  digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH); analogWrite(ENB, 255);
  Serial.println("4WD Full Reverse");
  delay(2500);

  analogWrite(ENA, 0); analogWrite(ENB, 0);
  Serial.println("4WD Stopped");
  delay(1000);
}
`;

// Arduino + Dual L293D + 4 Independent DC Motors
const arduinoL293dDual4MotorsNodes: CircuitNode[] = [
  makeNode('a-uno', 'arduino', 80, 80),
  makeNode('l293d_1', 'l293d', 380, 40),
  makeNode('l293d_2', 'l293d', 380, 260),
  makeNode('m1', 'dcmotor', 640, 20),
  makeNode('m2', 'dcmotor', 640, 120),
  makeNode('m3', 'dcmotor', 640, 220),
  makeNode('m4', 'dcmotor', 640, 320),
];
const arduinoL293dDual4MotorsEdges: CircuitEdge[] = [
  // L293D #1 Power
  wire('d4m_e1', 'a-uno', '5v', 'l293d_1', 'vcc', '#ef4444'),
  wire('d4m_e2', 'a-uno', '5v', 'l293d_1', 'vs', '#ef4444'),
  wire('d4m_e_gnd1', 'a-uno', 'gnd2', 'l293d_1', 'gnd1', '#000000'),
  // L293D #2 Power
  wire('d4m_e3', 'a-uno', '5v', 'l293d_2', 'vcc', '#ef4444'),
  wire('d4m_e4', 'a-uno', '5v', 'l293d_2', 'vs', '#ef4444'),
  wire('d4m_e_gnd2', 'a-uno', 'gnd3', 'l293d_2', 'gnd1', '#000000'),
  // L293D #1 -> Motor 1 & 2
  wire('d4m_e5', 'a-uno', 'd9', 'l293d_1', 'enable1', '#eab308'),
  wire('d4m_e6', 'a-uno', 'd8', 'l293d_1', 'input1', '#22c55e'),
  wire('d4m_e7', 'a-uno', 'd7', 'l293d_1', 'input2', '#3b82f6'),
  wire('d4m_e8', 'l293d_1', 'output1', 'm1', 'pin1', '#22c55e'),
  wire('d4m_e9', 'l293d_1', 'output2', 'm1', 'pin2', '#3b82f6'),

  wire('d4m_e10', 'a-uno', 'd3', 'l293d_1', 'enable2', '#eab308'),
  wire('d4m_e11', 'a-uno', 'd4', 'l293d_1', 'input3', '#22c55e'),
  wire('d4m_e12', 'a-uno', 'd5', 'l293d_1', 'input4', '#3b82f6'),
  wire('d4m_e13', 'l293d_1', 'output3', 'm2', 'pin1', '#22c55e'),
  wire('d4m_e14', 'l293d_1', 'output4', 'm2', 'pin2', '#3b82f6'),

  // L293D #2 -> Motor 3 & 4
  wire('d4m_e15', 'a-uno', 'd10', 'l293d_2', 'enable1', '#eab308'),
  wire('d4m_e16', 'a-uno', 'd11', 'l293d_2', 'input1', '#22c55e'),
  wire('d4m_e17', 'a-uno', 'd12', 'l293d_2', 'input2', '#3b82f6'),
  wire('d4m_e18', 'l293d_2', 'output1', 'm3', 'pin1', '#22c55e'),
  wire('d4m_e19', 'l293d_2', 'output2', 'm3', 'pin2', '#3b82f6'),

  wire('d4m_e20', 'a-uno', 'd6', 'l293d_2', 'enable2', '#eab308'),
  wire('d4m_e21', 'a-uno', 'a0', 'l293d_2', 'input3', '#22c55e'),
  wire('d4m_e22', 'a-uno', 'a1', 'l293d_2', 'input4', '#3b82f6'),
  wire('d4m_e23', 'l293d_2', 'output3', 'm4', 'pin1', '#22c55e'),
  wire('d4m_e24', 'l293d_2', 'output4', 'm4', 'pin2', '#3b82f6'),
];
const arduinoL293dDual4MotorsCode = `// Arduino + Dual L293D ICs (4 Independent DC Motors)
int EN1 = 9; int IN1 = 8; int IN2 = 7;   // Motor 1
int EN2 = 3; int IN3 = 4; int IN4 = 5;   // Motor 2
int EN3 = 10; int IN5 = 11; int IN6 = 12; // Motor 3
int EN4 = 6; int IN7 = 14; int IN8 = 15;  // Motor 4 (A0=14, A1=15)

void setup() {
  pinMode(EN1, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(EN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(EN3, OUTPUT); pinMode(IN5, OUTPUT); pinMode(IN6, OUTPUT);
  pinMode(EN4, OUTPUT); pinMode(IN7, OUTPUT); pinMode(IN8, OUTPUT);
  Serial.begin(9600);
  Serial.println("Dual L293D 4 Independent Motors Ready!");
}

void loop() {
  // All 4 Motors Forward
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(EN1, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(EN2, 255);
  digitalWrite(IN5, HIGH); digitalWrite(IN6, LOW); analogWrite(EN3, 255);
  digitalWrite(IN7, HIGH); digitalWrite(IN8, LOW); analogWrite(EN4, 255);
  Serial.println("All 4 Motors: Forward");
  delay(2500);

  // Stop All
  analogWrite(EN1, 0); analogWrite(EN2, 0); analogWrite(EN3, 0); analogWrite(EN4, 0);
  Serial.println("All Motors Stopped");
  delay(1000);
}
`;

// Pico + Dual L293D + 4 Independent DC Motors
const picoL293dDual4MotorsNodes: CircuitNode[] = [
  makeNode('p-pico', 'raspberrypipico', 80, 80),
  makeNode('l293d_1', 'l293d', 380, 40),
  makeNode('l293d_2', 'l293d', 380, 260),
  makeNode('m1', 'dcmotor', 640, 20),
  makeNode('m2', 'dcmotor', 640, 120),
  makeNode('m3', 'dcmotor', 640, 220),
  makeNode('m4', 'dcmotor', 640, 320),
];
const picoL293dDual4MotorsEdges: CircuitEdge[] = [
  // Power
  wire('pd4_e1', 'p-pico', 'pico_vbus', 'l293d_1', 'vcc', '#ef4444'),
  wire('pd4_e2', 'p-pico', 'pico_vbus', 'l293d_1', 'vs', '#ef4444'),
  wire('pd4_e3', 'p-pico', 'pico_vbus', 'l293d_2', 'vcc', '#ef4444'),
  wire('pd4_e4', 'p-pico', 'pico_vbus', 'l293d_2', 'vs', '#ef4444'),
  // Ground
  wire('pd4_e_gnd1', 'p-pico', 'pico_gnd3', 'l293d_1', 'gnd1', '#000000'),
  wire('pd4_e_gnd2', 'p-pico', 'pico_gnd4', 'l293d_2', 'gnd1', '#000000'),
  // L293D #1 -> Motor 1 & 2
  wire('pd4_e5', 'p-pico', 'gp15', 'l293d_1', 'enable1', '#eab308'),
  wire('pd4_e6', 'p-pico', 'gp14', 'l293d_1', 'input1', '#22c55e'),
  wire('pd4_e7', 'p-pico', 'gp13', 'l293d_1', 'input2', '#3b82f6'),
  wire('pd4_e8', 'l293d_1', 'output1', 'm1', 'pin1', '#22c55e'),
  wire('pd4_e9', 'l293d_1', 'output2', 'm1', 'pin2', '#3b82f6'),

  wire('pd4_e10', 'p-pico', 'gp12', 'l293d_1', 'enable2', '#eab308'),
  wire('pd4_e11', 'p-pico', 'gp11', 'l293d_1', 'input3', '#22c55e'),
  wire('pd4_e12', 'p-pico', 'gp10', 'l293d_1', 'input4', '#3b82f6'),
  wire('pd4_e13', 'l293d_1', 'output3', 'm2', 'pin1', '#22c55e'),
  wire('pd4_e14', 'l293d_1', 'output4', 'm2', 'pin2', '#3b82f6'),

  // L293D #2 -> Motor 3 & 4
  wire('pd4_e15', 'p-pico', 'gp9', 'l293d_2', 'enable1', '#eab308'),
  wire('pd4_e16', 'p-pico', 'gp8', 'l293d_2', 'input1', '#22c55e'),
  wire('pd4_e17', 'p-pico', 'gp7', 'l293d_2', 'input2', '#3b82f6'),
  wire('pd4_e18', 'l293d_2', 'output1', 'm3', 'pin1', '#22c55e'),
  wire('pd4_e19', 'l293d_2', 'output2', 'm3', 'pin2', '#3b82f6'),

  wire('pd4_e20', 'p-pico', 'gp6', 'l293d_2', 'enable2', '#eab308'),
  wire('pd4_e21', 'p-pico', 'gp5', 'l293d_2', 'input3', '#22c55e'),
  wire('pd4_e22', 'p-pico', 'gp4', 'l293d_2', 'input4', '#3b82f6'),
  wire('pd4_e23', 'l293d_2', 'output3', 'm4', 'pin1', '#22c55e'),
  wire('pd4_e24', 'l293d_2', 'output4', 'm4', 'pin2', '#3b82f6'),
];
const picoL293dDual4MotorsPicoCode = `# MicroPython - Raspberry Pi Pico + Dual L293D (4 Independent Motors)
from machine import Pin, PWM
import time

en1 = PWM(Pin(15)); en1.freq(1000); in1 = Pin(14, Pin.OUT); in2 = Pin(13, Pin.OUT)
en2 = PWM(Pin(12)); en2.freq(1000); in3 = Pin(11, Pin.OUT); in4 = Pin(10, Pin.OUT)
en3 = PWM(Pin(9));  en3.freq(1000); in5 = Pin(8, Pin.OUT);  in6 = Pin(7, Pin.OUT)
en4 = PWM(Pin(6));  en4.freq(1000); in7 = Pin(5, Pin.OUT);  in8 = Pin(4, Pin.OUT)

print("Pico + Dual L293D 4 Independent Motors Ready!")

while True:
    # All 4 Motors Forward
    in1.value(1); in2.value(0); en1.duty_u16(65535)
    in3.value(1); in4.value(0); en2.duty_u16(65535)
    in5.value(1); in6.value(0); en3.duty_u16(65535)
    in7.value(1); in8.value(0); en4.duty_u16(65535)
    print("All 4 Motors: Forward")
    time.sleep(2.5)

    # Stop All
    en1.duty_u16(0); en2.duty_u16(0); en3.duty_u16(0); en4.duty_u16(0)
    print("All Motors Stopped")
    time.sleep(1)
`.trim();
const picoL293dDual4MotorsCppCode = `// Arduino C++ for Pico - Dual L293D (4 Independent Motors)
int EN1 = 15; int IN1 = 14; int IN2 = 13;
int EN2 = 12; int IN3 = 11; int IN4 = 10;
int EN3 = 9;  int IN5 = 8;  int IN6 = 7;
int EN4 = 6;  int IN7 = 5;  int IN8 = 4;

void setup() {
  pinMode(EN1, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(EN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(EN3, OUTPUT); pinMode(IN5, OUTPUT); pinMode(IN6, OUTPUT);
  pinMode(EN4, OUTPUT); pinMode(IN7, OUTPUT); pinMode(IN8, OUTPUT);
  Serial.begin(115200);
  Serial.println("Pico C++ Dual L293D 4 Independent Motors Ready!");
}

void loop() {
  digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(EN1, 255);
  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW); analogWrite(EN2, 255);
  digitalWrite(IN5, HIGH); digitalWrite(IN6, LOW); analogWrite(EN3, 255);
  digitalWrite(IN7, HIGH); digitalWrite(IN8, LOW); analogWrite(EN4, 255);
  Serial.println("All 4 Motors: Forward");
  delay(2500);

  analogWrite(EN1, 0); analogWrite(EN2, 0); analogWrite(EN3, 0); analogWrite(EN4, 0);
  Serial.println("All Motors Stopped");
  delay(1000);
}
`;

// Basic battery preset
const batteryNodes: CircuitNode[] = [
  makeNode('b-bat', 'battery9v', 100, 100),
  makeNode('b-r1', 'resistor', 350, 100),
  makeNode('b-led1', 'led', 550, 100),
];
const batteryEdges: CircuitEdge[] = [
  wire('bw1', 'b-bat', 'positive', 'b-r1', 'pin1', '#ef4444'),
  wire('bw2', 'b-r1', 'pin2', 'b-led1', 'anode', '#ef4444'),
  wire('bw3', 'b-led1', 'cathode', 'b-bat', 'negative', '#3b82f6'),
];

// Arduino - 7-Segment Display
const arduinoSevenSegNodes: CircuitNode[] = [
  makeNode('s-uno', 'arduino', 80, 80),
  makeNode('s-r1', 'resistor', 450, 200, { resistance: { value: 220 } }),
  makeNode('s-disp', 'sevenSegment', 600, 80, {
    displayType: { value: 'Common Cathode' },
    color: { value: 'red' },
  }),
];

const arduinoSevenSegEdges: CircuitEdge[] = [
  wire('sw1', 's-uno', 'd2', 's-disp', 'a'),
  wire('sw2', 's-uno', 'd3', 's-disp', 'b'),
  wire('sw3', 's-uno', 'd4', 's-disp', 'c'),
  wire('sw4', 's-uno', 'd5', 's-disp', 'd'),
  wire('sw5', 's-uno', 'd6', 's-disp', 'e'),
  wire('sw6', 's-uno', 'd7', 's-disp', 'f'),
  wire('sw7', 's-uno', 'd8', 's-disp', 'g'),
  wire('sw8', 's-uno', 'd9', 's-disp', 'dp'),
  wire('sw9', 's-disp', 'com1', 's-r1', 'pin1', '#3b82f6'),
  wire('sw10', 's-disp', 'com2', 's-r1', 'pin1', '#3b82f6'),
  wire('sw11', 's-r1', 'pin2', 's-uno', 'gnd1', '#3b82f6'),
];

const arduinoSevenSegCode = `// Arduino - 7-Segment Display (Common Cathode)
// Segments a-g on pins 2-8, DP on pin 9. COM pins to GND via 220 Ohm resistor.

const int segments[] = {2, 3, 4, 5, 6, 7, 8, 9};

// Digit patterns for 0-9 (Common Cathode: HIGH turns segment ON)
const byte digits[10] = {
  0b00111111, // 0
  0b00000110, // 1
  0b01011011, // 2
  0b01001111, // 3
  0b01100110, // 4
  0b01101101, // 5
  0b01111101, // 6
  0b00000111, // 7
  0b01111111, // 8
  0b01101111  // 9
};

void setup() {
  for (int i = 0; i < 8; i++) {
    pinMode(segments[i], OUTPUT);
  }
}

void loop() {
  for (int num = 0; num < 10; num++) {
    showDigit(num);
    delay(1000);
  }
}

void showDigit(int num) {
  byte pattern = digits[num];
  for (int i = 0; i < 7; i++) {
    digitalWrite(segments[i], (pattern >> i) & 1);
  }
  digitalWrite(9, LOW); // Keep DP off
}
`;

// Pico - 7-Segment Display
const picoSevenSegNodes: CircuitNode[] = [
  makeNode('p-pico', 'raspberrypipico', 80, 80),
  makeNode('p-r1', 'resistor', 450, 200, { resistance: { value: 220 } }),
  makeNode('p-disp', 'sevenSegment', 600, 80, {
    displayType: { value: 'Common Cathode' },
    color: { value: 'red' },
  }),
];

const picoSevenSegEdges: CircuitEdge[] = [
  wire('pw1', 'p-pico', 'gp0', 'p-disp', 'a'),
  wire('pw2', 'p-pico', 'gp1', 'p-disp', 'b'),
  wire('pw3', 'p-pico', 'gp2', 'p-disp', 'c'),
  wire('pw4', 'p-pico', 'gp3', 'p-disp', 'd'),
  wire('pw5', 'p-pico', 'gp4', 'p-disp', 'e'),
  wire('pw6', 'p-pico', 'gp5', 'p-disp', 'f'),
  wire('pw7', 'p-pico', 'gp6', 'p-disp', 'g'),
  wire('pw8', 'p-pico', 'gp7', 'p-disp', 'dp'),
  wire('pw9', 'p-disp', 'com1', 'p-r1', 'pin1', '#3b82f6'),
  wire('pw10', 'p-disp', 'com2', 'p-r1', 'pin1', '#3b82f6'),
  wire('pw11', 'p-r1', 'pin2', 'p-pico', 'pico_gnd1', '#3b82f6'),
];

const picoSevenSegCode = `# Raspberry Pi Pico - 7-Segment Display (Common Cathode)
# Segments a-g on GP0-GP6, DP on GP7. COM pins to GND via 220 Ohm resistor.

from machine import Pin
import time

segments = [Pin(i, Pin.OUT) for i in range(8)]

digits = [
    0b00111111, # 0
    0b00000110, # 1
    0b01011011, # 2
    0b01001111, # 3
    0b01100110, # 4
    0b01101101, # 5
    0b01111101, # 6
    0b00000111, # 7
    0b01111111, # 8
    0b01101111  # 9
]

def show_digit(num):
    pattern = digits[num]
    for i in range(7):
        segments[i].value((pattern >> i) & 1)
    segments[7].value(0) # Keep DP off

while True:
    for num in range(10):
        show_digit(num)
        time.sleep(1)
`;

const picoSevenSegCodeCpp = `// Pico C++ - 7-Segment Display (Common Cathode)
#include <Arduino.h>

const int segments[] = {0, 1, 2, 3, 4, 5, 6, 7};
const byte digits[10] = {
  0b00111111, 0b00000110, 0b01011011, 0b01001111,
  0b01100110, 0b01101101, 0b01111101, 0b00000111,
  0b01111111, 0b01101111
};

void setup() {
  for (int i = 0; i < 8; i++) {
    pinMode(segments[i], OUTPUT);
  }
}

void loop() {
  for (int num = 0; num < 10; num++) {
    byte pattern = digits[num];
    for (int i = 0; i < 7; i++) {
      digitalWrite(segments[i], (pattern >> i) & 1);
    }
    digitalWrite(7, LOW);
    delay(1000);
  }
}
`;

// Battery DPDT Pushbutton Toggle preset
const batteryDpdtNodes: CircuitNode[] = [
  makeNode('bdr-bat', 'battery9v', 80, 100),
  makeNode('bdr-pb', 'pushbutton', 250, 100),
  makeNode('bdr-relay', 'relayDpdt', 420, 120),
  makeNode('bdr-r1', 'resistor', 620, 80),
  makeNode('bdr-r2', 'resistor', 620, 220),
  makeNode('bdr-led-red', 'led', 760, 60, { color: { value: 'red' } }),
  makeNode('bdr-led-green', 'led', 760, 200, { color: { value: 'green' } }),
];
const batteryDpdtEdges: CircuitEdge[] = [
  wire('bdrw1', 'bdr-bat', 'positive', 'bdr-pb', 'pin1a', '#ef4444'),
  wire('bdrw2', 'bdr-bat', 'positive', 'bdr-relay', 'terminal4', '#ef4444'),
  wire('bdrw3', 'bdr-pb', 'pin2a', 'bdr-relay', 'terminal1', '#ef4444'),
  wire('bdrw4', 'bdr-relay', 'terminal16', 'bdr-bat', 'negative', '#3b82f6'),
  wire('bdrw5', 'bdr-relay', 'terminal6', 'bdr-r1', 'pin1', '#ef4444'),
  wire('bdrw6', 'bdr-r1', 'pin2', 'bdr-led-red', 'anode', '#ef4444'),
  wire('bdrw7', 'bdr-led-red', 'cathode', 'bdr-bat', 'negative', '#3b82f6'),
  wire('bdrw8', 'bdr-relay', 'terminal8', 'bdr-r2', 'pin1', '#22c55e'),
  wire('bdrw9', 'bdr-r2', 'pin2', 'bdr-led-green', 'anode', '#22c55e'),
  wire('bdrw10', 'bdr-led-green', 'cathode', 'bdr-bat', 'negative', '#3b82f6'),
];

// ---------------------------------------------------------------------------
// DPDT Relay Presets (Arduino, Pico, Motor Reversal)
// ---------------------------------------------------------------------------

// Arduino DPDT Relay Dual LED Switch
const arduinoDpdtNodes: CircuitNode[] = [
  makeNode('adr-uno', 'arduino', 60, 100),
  makeNode('adr-relay', 'relayDpdt', 450, 100),
  makeNode('adr-r1', 'resistor', 650, 60),
  makeNode('adr-r2', 'resistor', 650, 200),
  makeNode('adr-led-red', 'led', 800, 40, { color: { value: 'red' } }),
  makeNode('adr-led-green', 'led', 800, 180, { color: { value: 'green' } }),
];
const arduinoDpdtEdges: CircuitEdge[] = [
  wire('adrw1', 'adr-uno', 'd13', 'adr-relay', 'terminal1', '#ef4444'),
  wire('adrw2', 'adr-relay', 'terminal16', 'adr-uno', 'gnd1', '#3b82f6'),
  wire('adrw3', 'adr-uno', '5v', 'adr-relay', 'terminal4', '#ef4444'),
  wire('adrw4', 'adr-relay', 'terminal6', 'adr-r1', 'pin1', '#ef4444'),
  wire('adrw5', 'adr-r1', 'pin2', 'adr-led-red', 'anode', '#ef4444'),
  wire('adrw6', 'adr-led-red', 'cathode', 'adr-uno', 'gnd2', '#3b82f6'),
  wire('adrw7', 'adr-relay', 'terminal8', 'adr-r2', 'pin1', '#22c55e'),
  wire('adrw8', 'adr-r2', 'pin2', 'adr-led-green', 'anode', '#22c55e'),
  wire('adrw9', 'adr-led-green', 'cathode', 'adr-uno', 'gnd3', '#3b82f6'),
];
const arduinoDpdtCode = `// Arduino - DPDT Relay Control
// D13 drives coil (A1). COM1 powered by 5V.
// NC1 drives Red LED; NO1 drives Green LED.

void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("DPDT Relay Controller Ready!");
}

void loop() {
  // De-energized: NC1 connected (Red LED ON)
  digitalWrite(13, LOW);
  Serial.println("Relay OFF -> NC1 Active (Red LED ON)");
  delay(1500);

  // Energized: NO1 connected (Green LED ON)
  digitalWrite(13, HIGH);
  Serial.println("Relay ON -> NO1 Active (Green LED ON)");
  delay(1500);
}
`;

// Arduino DPDT Motor Direction Reversal
const arduinoDpdtMotorNodes: CircuitNode[] = [
  makeNode('admr-uno', 'arduino', 60, 100),
  makeNode('admr-relay', 'relayDpdt', 450, 120),
  makeNode('admr-bat', 'battery9v', 660, 40),
  makeNode('admr-motor', 'dcmotor', 660, 240),
];
const arduinoDpdtMotorEdges: CircuitEdge[] = [
  wire('admrw1', 'admr-uno', 'd12', 'admr-relay', 'terminal1', '#ef4444'),
  wire('admrw2', 'admr-relay', 'terminal16', 'admr-uno', 'gnd1', '#3b82f6'),
  wire('admrw3', 'admr-bat', 'positive', 'admr-relay', 'terminal6', '#ef4444'),
  wire('admrw4', 'admr-bat', 'positive', 'admr-relay', 'terminal9', '#ef4444'),
  wire('admrw5', 'admr-bat', 'negative', 'admr-relay', 'terminal8', '#3b82f6'),
  wire('admrw6', 'admr-bat', 'negative', 'admr-relay', 'terminal11', '#3b82f6'),
  wire('admrw7', 'admr-relay', 'terminal4', 'admr-motor', 'pin1', '#eab308'),
  wire('admrw8', 'admr-relay', 'terminal13', 'admr-motor', 'pin2', '#a855f7'),
];
const arduinoDpdtMotorCode = `// Arduino - DPDT Relay H-Bridge Motor Polarity Reverser
// D12 drives relay coil (A1). 9V Battery connected to DPDT cross pins.
// COM1 & COM2 connect to DC Motor terminals.

void setup() {
  pinMode(12, OUTPUT);
  Serial.begin(9600);
  Serial.println("DPDT Motor Reverser Ready!");
}

void loop() {
  // Relay De-energized: Forward Direction
  digitalWrite(12, LOW);
  Serial.println("Motor Direction: FORWARD");
  delay(2000);

  // Relay Energized: Reverse Direction
  digitalWrite(12, HIGH);
  Serial.println("Motor Direction: REVERSE");
  delay(2000);
}
`;

// Arduino DPDT Dual Motor & Dual LED Switch
const arduinoDpdtDualNodes: CircuitNode[] = [
  makeNode('add-uno', 'arduino', 60, 100),
  makeNode('add-relay', 'relayDpdt', 440, 120),
  makeNode('add-r1', 'resistor', 640, 40),
  makeNode('add-r2', 'resistor', 640, 200),
  makeNode('add-led-red', 'led', 780, 20, { color: { value: 'red' } }),
  makeNode('add-led-green', 'led', 780, 180, { color: { value: 'green' } }),
  makeNode('add-m1', 'dcmotor', 640, 100),
  makeNode('add-m2', 'dcmotor', 640, 260),
];

const arduinoDpdtDualEdges: CircuitEdge[] = [
  wire('addw1', 'add-uno', 'd12', 'add-relay', 'terminal1', '#ef4444'),
  wire('addw2', 'add-relay', 'terminal16', 'add-uno', 'gnd1', '#3b82f6'),
  wire('addw3', 'add-uno', '5v', 'add-relay', 'terminal4', '#ef4444'),
  wire('addw4', 'add-uno', '5v', 'add-relay', 'terminal13', '#ef4444'),
  // NC1 -> Red LED; NC2 -> Motor 1
  wire('addw5', 'add-relay', 'terminal6', 'add-r1', 'pin1', '#ef4444'),
  wire('addw6', 'add-r1', 'pin2', 'add-led-red', 'anode', '#ef4444'),
  wire('addw7', 'add-led-red', 'cathode', 'add-uno', 'gnd2', '#3b82f6'),
  wire('addw8', 'add-relay', 'terminal11', 'add-m1', 'pin1', '#eab308'),
  wire('addw9', 'add-m1', 'pin2', 'add-uno', 'gnd2', '#3b82f6'),
  // NO1 -> Green LED; NO2 -> Motor 2
  wire('addw10', 'add-relay', 'terminal8', 'add-r2', 'pin1', '#22c55e'),
  wire('addw11', 'add-r2', 'pin2', 'add-led-green', 'anode', '#22c55e'),
  wire('addw12', 'add-led-green', 'cathode', 'add-uno', 'gnd3', '#3b82f6'),
  wire('addw13', 'add-relay', 'terminal9', 'add-m2', 'pin1', '#a855f7'),
  wire('addw14', 'add-m2', 'pin2', 'add-uno', 'gnd3', '#3b82f6'),
];

const arduinoDpdtDualCode = `// Arduino - DPDT Dual Motor & Dual LED Controller
// D12 drives relay coil (A1). COM1 & COM2 connected to 5V.
// NC1/NC2 drive Red LED & Motor 1; NO1/NO2 drive Green LED & Motor 2.

void setup() {
  pinMode(12, OUTPUT);
  Serial.begin(9600);
  Serial.println("DPDT Dual Motor & LED Controller Ready!");
}

void loop() {
  // Relay OFF: Red LED ON & Motor 1 ON
  digitalWrite(12, LOW);
  Serial.println("Relay OFF -> Red LED & Motor 1 Active");
  delay(2000);

  // Relay ON: Green LED ON & Motor 2 ON
  digitalWrite(12, HIGH);
  Serial.println("Relay ON -> Green LED & Motor 2 Active");
  delay(2000);
}
`;

// Raspberry Pi Pico DPDT Relay
const picoDpdtNodes: CircuitNode[] = [
  makeNode('pdr-pico', 'raspberrypipico', 60, 40),
  makeNode('pdr-relay', 'relayDpdt', 380, 140),
  makeNode('pdr-r1', 'resistor', 580, 100),
  makeNode('pdr-r2', 'resistor', 580, 240),
  makeNode('pdr-led-red', 'led', 720, 80, { color: { value: 'red' } }),
  makeNode('pdr-led-green', 'led', 720, 220, { color: { value: 'green' } }),
];
const picoDpdtEdges: CircuitEdge[] = [
  wire('pdrw1', 'pdr-pico', 'gp15', 'pdr-relay', 'terminal1', '#ef4444'),
  wire('pdrw2', 'pdr-relay', 'terminal16', 'pdr-pico', 'pico_gnd4', '#3b82f6'),
  wire('pdrw3', 'pdr-pico', 'pico_3v3', 'pdr-relay', 'terminal4', '#ef4444'),
  wire('pdrw4', 'pdr-relay', 'terminal6', 'pdr-r1', 'pin1', '#ef4444'),
  wire('pdrw5', 'pdr-r1', 'pin2', 'pdr-led-red', 'anode', '#ef4444'),
  wire('pdrw6', 'pdr-led-red', 'cathode', 'pdr-pico', 'pico_gnd3', '#3b82f6'),
  wire('pdrw7', 'pdr-relay', 'terminal8', 'pdr-r2', 'pin1', '#22c55e'),
  wire('pdrw8', 'pdr-r2', 'pin2', 'pdr-led-green', 'anode', '#22c55e'),
  wire('pdrw9', 'pdr-led-green', 'cathode', 'pdr-pico', 'pico_gnd3', '#3b82f6'),
];
const picoDpdtCode = `# Raspberry Pi Pico - DPDT Relay Dual Load Switch
# Relay Coil connected to GP15

from machine import Pin
import time

relay = Pin(15, Pin.OUT)

print("Pico DPDT Relay ready!")

while True:
    relay.value(1)
    print("Relay ON: Green LED ON (NO1)")
    time.sleep(1)

    relay.value(0)
    print("Relay OFF: Red LED ON (NC1)")
    time.sleep(1)
`;
const picoDpdtCodeCpp = `// Raspberry Pi Pico - C++ DPDT Relay Dual Load Switch
// Relay Coil connected to GP15

void setup() {
  pinMode(15, OUTPUT);
  Serial.begin(9600);
  Serial.println("Pico DPDT Relay ready!");
}

void loop() {
  digitalWrite(15, HIGH);
  Serial.println("Relay ON: Green LED ON (NO1)");
  delay(1000);

  digitalWrite(15, LOW);
  Serial.println("Relay OFF: Red LED ON (NC1)");
  delay(1000);
}
`;

// Raspberry Pi Pico DPDT Dual Motor & Dual LED Switch
const picoDpdtDualNodes: CircuitNode[] = [
  makeNode('pdd-pico', 'raspberrypipico', 60, 40),
  makeNode('pdd-relay', 'relayDpdt', 380, 140),
  makeNode('pdd-r1', 'resistor', 580, 40),
  makeNode('pdd-r2', 'resistor', 580, 200),
  makeNode('pdd-led-red', 'led', 720, 20, { color: { value: 'red' } }),
  makeNode('pdd-led-green', 'led', 720, 180, { color: { value: 'green' } }),
  makeNode('pdd-m1', 'dcmotor', 580, 100),
  makeNode('pdd-m2', 'dcmotor', 580, 260),
];

const picoDpdtDualEdges: CircuitEdge[] = [
  wire('pddw1', 'pdd-pico', 'gp15', 'pdd-relay', 'terminal1', '#ef4444'),
  wire('pddw2', 'pdd-relay', 'terminal16', 'pdd-pico', 'pico_gnd4', '#3b82f6'),
  wire('pddw3', 'pdd-pico', 'pico_3v3', 'pdd-relay', 'terminal4', '#ef4444'),
  wire('pddw4', 'pdd-pico', 'pico_3v3', 'pdd-relay', 'terminal13', '#ef4444'),
  // NC1 -> Red LED; NC2 -> Motor 1
  wire('pddw5', 'pdd-relay', 'terminal6', 'pdd-r1', 'pin1', '#ef4444'),
  wire('pddw6', 'pdd-r1', 'pin2', 'pdd-led-red', 'anode', '#ef4444'),
  wire('pddw7', 'pdd-led-red', 'cathode', 'pdd-pico', 'pico_gnd3', '#3b82f6'),
  wire('pddw8', 'pdd-relay', 'terminal11', 'pdd-m1', 'pin1', '#eab308'),
  wire('pddw9', 'pdd-m1', 'pin2', 'pdd-pico', 'pico_gnd3', '#3b82f6'),
  // NO1 -> Green LED; NO2 -> Motor 2
  wire('pddw10', 'pdd-relay', 'terminal8', 'pdd-r2', 'pin1', '#22c55e'),
  wire('pddw11', 'pdd-r2', 'pin2', 'pdd-led-green', 'anode', '#22c55e'),
  wire('pddw12', 'pdd-led-green', 'cathode', 'pdd-pico', 'pico_gnd2', '#3b82f6'),
  wire('pddw13', 'pdd-relay', 'terminal9', 'pdd-m2', 'pin1', '#a855f7'),
  wire('pddw14', 'pdd-m2', 'pin2', 'pdd-pico', 'pico_gnd2', '#3b82f6'),
];

const picoDpdtDualCode = `# Raspberry Pi Pico - DPDT Relay Dual Motor & Dual LED Controller
# GP15 drives relay coil (A1). Pico 3.3V powers COM1 & COM2.
# NC1/NC2 drive Red LED & Motor 1; NO1/NO2 drive Green LED & Motor 2.

from machine import Pin
import time

relay = Pin(15, Pin.OUT)

print("Pico DPDT Dual Load Controller Ready!")

while True:
    relay.value(1)
    print("Relay ON -> Green LED & Motor 2 Active")
    time.sleep(2)

    relay.value(0)
    print("Relay OFF -> Red LED & Motor 1 Active")
    time.sleep(2)
`;

const picoDpdtDualCodeCpp = `// Raspberry Pi Pico - C++ DPDT Relay Dual Motor & Dual LED Controller

void setup() {
  pinMode(15, OUTPUT);
  Serial.begin(9600);
  Serial.println("Pico DPDT Dual Load Controller Ready!");
}

void loop() {
  digitalWrite(15, HIGH);
  Serial.println("Relay ON -> Green LED & Motor 2 Active");
  delay(2000);

  digitalWrite(15, LOW);
  Serial.println("Relay OFF -> Red LED & Motor 1 Active");
  delay(2000);
}
`;

// ---------------------------------------------------------------------------
// PNP Transistor Presets
// ---------------------------------------------------------------------------

// 1. Arduino PNP DC Motor Switch
const arduinoPnpMotorNodes: CircuitNode[] = [
  makeNode('pnp-uno', 'arduino', 60, 60),
  makeNode('pnp-q1', 'pnp', 380, 100, { beta: { value: 100 } }),
  makeNode('pnp-r1', 'resistor', 260, 200, { resistance: { value: 1000 } }),
  makeNode('pnp-m1', 'dcmotor', 540, 90),
];

const arduinoPnpMotorEdges: CircuitEdge[] = [
  // 5V to PNP Emitter (High-Side Switch)
  wire('pnpw1', 'pnp-uno', '5v', 'pnp-q1', 'emitter', '#ef4444'),
  // Arduino Pin D9 to Base via 1k resistor
  wire('pnpw2', 'pnp-uno', 'd9', 'pnp-r1', 'pin1', '#22c55e'),
  wire('pnpw3', 'pnp-r1', 'pin2', 'pnp-q1', 'base', '#22c55e'),
  // Collector to DC Motor pin1
  wire('pnpw4', 'pnp-q1', 'collector', 'pnp-m1', 'pin1', '#eab308'),
  // DC Motor pin2 to GND
  wire('pnpw5', 'pnp-m1', 'pin2', 'pnp-uno', 'gnd1', '#3b82f6'),
];

const arduinoPnpMotorCode = `// Arduino - High-Side PNP DC Motor Switch
// Pin D9 drives PNP base via a 1k resistor.
// Emitter connected to 5V, Collector to Motor positive.
// Active LOW: digitalWrite(9, LOW) turns the motor ON.

void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
  Serial.println("Arduino PNP Motor switch ready!");
}

void loop() {
  // Turn motor ON (pull base LOW)
  digitalWrite(9, LOW);
  Serial.println("Motor ON");
  delay(2000);

  // Turn motor OFF (pull base HIGH)
  digitalWrite(9, HIGH);
  Serial.println("Motor OFF");
  delay(2000);
}`.trim();


// 2. Pico PNP LED Dimmer (PWM)
const picoPnpLedDimmerNodes: CircuitNode[] = [
  makeNode('pnp-pico', 'raspberrypipico', 60, 40),
  makeNode('pnp-q2', 'pnp', 380, 100, { beta: { value: 150 } }),
  makeNode('pnp-r_base', 'resistor', 260, 200, { resistance: { value: 1000 } }),
  makeNode('pnp-r_lim', 'resistor', 540, 100, { resistance: { value: 220 } }),
  makeNode('pnp-led', 'led', 680, 90, { color: { value: 'blue' } }),
];

const picoPnpLedDimmerEdges: CircuitEdge[] = [
  // 3.3V to PNP Emitter (High-Side Switch)
  wire('pnpw6', 'pnp-pico', 'pico_3v3', 'pnp-q2', 'emitter', '#ef4444'),
  // Pico GP15 to Base via 1k resistor
  wire('pnpw7', 'pnp-pico', 'gp15', 'pnp-r_base', 'pin1', '#22c55e'),
  wire('pnpw8', 'pnp-r_base', 'pin2', 'pnp-q2', 'base', '#22c55e'),
  // Collector to current limiting resistor
  wire('pnpw9', 'pnp-q2', 'collector', 'pnp-r_lim', 'pin1', '#eab308'),
  // Current limiting resistor to LED anode
  wire('pnpw10', 'pnp-r_lim', 'pin2', 'pnp-led', 'anode', '#ef4444'),
  // LED cathode to GND
  wire('pnpw11', 'pnp-led', 'cathode', 'pnp-pico', 'pico_gnd4', '#3b82f6'),
];

const picoPnpLedDimmerCode = `# MicroPython - Pico High-Side PNP LED Dimmer (PWM)
# GP15 drives PNP base via a 1k resistor.
# Emitter connected to 3.3V, Collector to LED anode via resistor.
# Note: Inverted logic — duty cycle 0 (LOW) is full brightness, 65535 (HIGH) is OFF.

from machine import Pin, PWM
import time

pwm = PWM(Pin(15))
pwm.freq(1000)

print("Pico PNP LED Dimmer ready!")

while True:
    # Fade in (increase brightness -> decrease duty cycle)
    for duty in range(65535, -1, -2000):
        pwm.duty_u16(max(0, duty))
        time.sleep(0.05)
    
    # Fade out (decrease brightness -> increase duty cycle)
    for duty in range(0, 65536, 2000):
        pwm.duty_u16(min(65535, duty))
        time.sleep(0.05)
`.trim();

// 2b. Pico + DHT22 Temperature & Humidity Sensor
const picoDht22Nodes: CircuitNode[] = [
  makeNode('pdht22-sensor', 'dht22', 80, 100, {
    temperature: { value: 75.1 },
    humidity: { value: 19.9 },
  }),
  makeNode('pdht22-pico', 'raspberrypipico', 420, 80),
];

const picoDht22Edges: CircuitEdge[] = [
  // DHT22 data -> Pico GP15
  wire('pdht22-w1', 'pdht22-sensor', 'data', 'pdht22-pico', 'gp15', '#22c55e'),
  // DHT22 VCC -> Pico VBUS
  wire('pdht22-w2', 'pdht22-sensor', 'vcc', 'pdht22-pico', 'pico_vbus', '#22c55e'),
  // DHT22 GND -> Pico GND
  wire('pdht22-w3', 'pdht22-sensor', 'gnd', 'pdht22-pico', 'pico_gnd1', '#22c55e'),
];

const picoDht22Code = `from machine import Pin
import dht
import time

sensor = dht.DHT22(Pin(15))

last_temp = None
last_hum = None

print("DHT22 SENSOR")

while True:
    try:
        sensor.measure()

        temp = sensor.temperature()
        hum = sensor.humidity()

        if temp != last_temp or hum != last_hum:
            print(
                "\\rTemperature: {} C | Humidity: {} %".format(
                    temp, hum
                ),
                end=""
            )

            last_temp = temp
            last_hum = hum

    except Exception as e:
        print("\\rDHT22 Error:", e, end="")

    time.sleep(2)
`.trim();

const picoDht22CodeCpp = `// Arduino C++ for Raspberry Pi Pico - DHT22 Sensor on GP15
#include "DHT.h"

#define DHTPIN 15
#define DHTTYPE DHT22

DHT dht(DHTPIN, DHTTYPE);

float last_temp = -999;
float last_hum = -999;

void setup() {
  Serial.begin(115200);
  dht.begin();
  Serial.println("DHT22 SENSOR");
}

void loop() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();

  if (temp != last_temp || hum != last_hum) {
    Serial.print("\\rTemperature: ");
    Serial.print(temp);
    Serial.print(" C | Humidity: ");
    Serial.print(hum);
    Serial.print(" %");
    last_temp = temp;
    last_hum = hum;
  }
  delay(2000);
}
`.trim();

// 3. Basic PNP pushbutton circuit
const batteryPnpLedNodes: CircuitNode[] = [
  makeNode('pnp-bat', 'battery9v', 80, 80),
  makeNode('pnp-q3', 'pnp', 320, 100),
  makeNode('pnp-pb', 'pushbutton', 200, 240),
  makeNode('pnp-rb', 'resistor', 320, 240, { resistance: { value: 1000 } }),
  makeNode('pnp-rl', 'resistor', 480, 100, { resistance: { value: 470 } }),
  makeNode('pnp-led3', 'led', 620, 90, { color: { value: 'green' } }),
];

const batteryPnpLedEdges: CircuitEdge[] = [
  // Battery positive to PNP emitter
  wire('pnpbw1', 'pnp-bat', 'positive', 'pnp-q3', 'emitter', '#ef4444'),
  // Base to 1k resistor
  wire('pnpbw2', 'pnp-q3', 'base', 'pnp-rb', 'pin2', '#eab308'),
  // 1k resistor to pushbutton pin1a
  wire('pnpbw3', 'pnp-rb', 'pin1', 'pnp-pb', 'pin1a', '#eab308'),
  // Pushbutton pin2a to Ground (negative)
  wire('pnpbw4', 'pnp-pb', 'pin2a', 'pnp-bat', 'negative', '#3b82f6'),
  // Collector to 470R limiting resistor
  wire('pnpbw5', 'pnp-q3', 'collector', 'pnp-rl', 'pin1', '#22c55e'),
  // Limiting resistor to LED anode
  wire('pnpbw6', 'pnp-rl', 'pin2', 'pnp-led3', 'anode', '#ef4444'),
  // LED cathode to Battery negative
  wire('pnpbw7', 'pnp-led3', 'cathode', 'pnp-bat', 'negative', '#3b82f6'),
];


// 4. Arduino PNP/NPN H-Bridge DC Motor Driver (Complex)
const arduinoHBridgeNodes: CircuitNode[] = [
  makeNode('hb-uno', 'arduino', 60, 60),
  // High-Side Switches (PNP)
  makeNode('hb-q1', 'pnp', 480, 80),
  makeNode('hb-q2', 'pnp', 680, 80),
  // Low-Side Switches (NPN)
  makeNode('hb-q3', 'npn', 480, 320),
  makeNode('hb-q4', 'npn', 680, 320),
  // Base Resistors (1k)
  makeNode('hb-r1', 'resistor', 360, 100, { resistance: { value: 1000 } }),
  makeNode('hb-r2', 'resistor', 800, 100, { resistance: { value: 1000 } }),
  makeNode('hb-r3', 'resistor', 360, 340, { resistance: { value: 1000 } }),
  makeNode('hb-r4', 'resistor', 800, 340, { resistance: { value: 1000 } }),
  // DC Motor
  makeNode('hb-m1', 'dcmotor', 580, 200),
];

const arduinoHBridgeEdges: CircuitEdge[] = [
  // 5V to PNP Emitters
  wire('hbw1', 'hb-uno', '5v', 'hb-q1', 'emitter', '#ef4444'),
  wire('hbw2', 'hb-uno', '5v', 'hb-q2', 'emitter', '#ef4444'),

  // GND to NPN Emitters
  wire('hbw3', 'hb-uno', 'gnd1', 'hb-q3', 'emitter', '#3b82f6'),
  wire('hbw4', 'hb-uno', 'gnd2', 'hb-q4', 'emitter', '#3b82f6'),

  // Motor Pin 1 to Q1 (PNP) & Q3 (NPN) Collectors
  wire('hbw5', 'hb-q1', 'collector', 'hb-m1', 'pin1', '#eab308'),
  wire('hbw6', 'hb-q3', 'collector', 'hb-m1', 'pin1', '#eab308'),

  // Motor Pin 2 to Q2 (PNP) & Q4 (NPN) Collectors
  wire('hbw7', 'hb-q2', 'collector', 'hb-m1', 'pin2', '#eab308'),
  wire('hbw8', 'hb-q4', 'collector', 'hb-m1', 'pin2', '#eab308'),

  // Base connections via 1k resistors
  wire('hbw9', 'hb-uno', 'd4', 'hb-r1', 'pin1', '#22c55e'),
  wire('hbw10', 'hb-r1', 'pin2', 'hb-q1', 'base', '#22c55e'),

  wire('hbw11', 'hb-uno', 'd5', 'hb-r2', 'pin1', '#22c55e'),
  wire('hbw12', 'hb-r2', 'pin2', 'hb-q2', 'base', '#22c55e'),

  wire('hbw13', 'hb-uno', 'd6', 'hb-r3', 'pin1', '#22c55e'),
  wire('hbw14', 'hb-r3', 'pin2', 'hb-q3', 'base', '#22c55e'),

  wire('hbw15', 'hb-uno', 'd7', 'hb-r4', 'pin1', '#22c55e'),
  wire('hbw16', 'hb-r4', 'pin2', 'hb-q4', 'base', '#22c55e'),
];

const arduinoHBridgeCode = `// Arduino - PNP/NPN H-Bridge DC Motor Driver
// Controls direction of rotation using discrete transistors:
// - Q1, Q2: High-Side PNP (D4, D5) -> Active LOW
// - Q3, Q4: Low-Side NPN (D6, D7) -> Active HIGH

void setup() {
  pinMode(4, OUTPUT);
  pinMode(5, OUTPUT);
  pinMode(6, OUTPUT);
  pinMode(7, OUTPUT);

  // Initialize: All transistors OFF (PNP HIGH, NPN LOW)
  digitalWrite(4, HIGH);
  digitalWrite(5, HIGH);
  digitalWrite(6, LOW);
  digitalWrite(7, LOW);

  Serial.begin(9600);
  Serial.println("H-Bridge Motor Driver Ready!");
}

void loop() {
  // 1. Spin Forward
  Serial.println("Moving FORWARD");
  digitalWrite(4, HIGH); // Left PNP OFF
  digitalWrite(7, LOW);  // Right NPN OFF
  delay(10);             // Prevent shoot-through
  digitalWrite(5, LOW);  // Right PNP ON
  digitalWrite(6, HIGH); // Left NPN ON
  delay(3000);

  // 2. Coast/Stop
  Serial.println("Stopping");
  digitalWrite(4, HIGH);
  digitalWrite(5, HIGH);
  digitalWrite(6, LOW);
  digitalWrite(7, LOW);
  delay(2000);

  // 3. Spin Reverse
  Serial.println("Moving REVERSE");
  digitalWrite(5, HIGH); // Right PNP OFF
  digitalWrite(6, LOW);  // Left NPN OFF
  delay(10);             // Prevent shoot-through
  digitalWrite(4, LOW);  // Left PNP ON
  digitalWrite(7, HIGH); // Right NPN ON
  delay(3000);

  // 4. Coast/Stop
  Serial.println("Stopping");
  digitalWrite(4, HIGH);
  digitalWrite(5, HIGH);
  digitalWrite(6, LOW);
  digitalWrite(7, LOW);
  delay(2000);
}`.trim();

// ---------------------------------------------------------------------------
// Export all presets
// ---------------------------------------------------------------------------

export interface CircuitPreset {
  id: string;
  label: string;
  group: 'Arduino' | 'Raspberry Pi Pico' | 'Basic' | 'Imported';
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  arduinoCode?: string;
  picoCode?: string;
}

export const CIRCUIT_PRESETS: CircuitPreset[] = [
  {
    id: 'arduino-blink',
    label: 'Blink LED',
    group: 'Arduino',
    nodes: arduinoBlinkNodes,
    edges: arduinoBlinkEdges,
    arduinoCode: arduinoBlinkCode,
  },
  {
    id: 'arduino-traffic',
    label: 'Traffic Light',
    group: 'Arduino',
    nodes: arduinoTrafficNodes,
    edges: arduinoTrafficEdges,
    arduinoCode: arduinoTrafficCode,
  },
  {
    id: 'arduino-fade',
    label: 'Fade LED (PWM)',
    group: 'Arduino',
    nodes: arduinoFadeNodes,
    edges: arduinoFadeEdges,
    arduinoCode: arduinoFadeCode,
  },
  {
    id: 'arduino-l293d-1motor',
    label: 'Arduino + L293D (1 Motor)',
    group: 'Arduino',
    nodes: arduinoL293d1MotorNodes,
    edges: arduinoL293d1MotorEdges,
    arduinoCode: arduinoL293d1MotorCode,
  },
  {
    id: 'arduino-l293d-2motors',
    label: 'Arduino + L293D (2 Motors)',
    group: 'Arduino',
    nodes: arduinoL293d2MotorsNodes,
    edges: arduinoL293d2MotorsEdges,
    arduinoCode: arduinoL293d2MotorsCode,
  },
  {
    id: 'arduino-l293d-4motors',
    label: 'Arduino + L293D (4WD / 4 Motors)',
    group: 'Arduino',
    nodes: arduinoL293d4MotorsNodes,
    edges: arduinoL293d4MotorsEdges,
    arduinoCode: arduinoL293d4MotorsCode,
  },
  {
    id: 'arduino-l293d-hobbygearmotor',
    label: 'Arduino + L293D (Hobby Motors)',
    group: 'Arduino',
    nodes: arduinoL293dHobbyNodes,
    edges: arduinoL293dHobbyEdges,
    arduinoCode: arduinoL293dHobbyCode,
  },
  {
    id: 'arduino-l293d-2x-4motors',
    label: 'Arduino + Dual L293D (4 Motors)',
    group: 'Arduino',
    nodes: arduinoL293dDual4MotorsNodes,
    edges: arduinoL293dDual4MotorsEdges,
    arduinoCode: arduinoL293dDual4MotorsCode,
  },
  {
    id: 'arduino-sevensegment',
    label: 'Arduino + 7-Segment Display',
    group: 'Arduino',
    nodes: arduinoSevenSegNodes,
    edges: arduinoSevenSegEdges,
    arduinoCode: arduinoSevenSegCode,
  },
  {
    id: 'arduino-dpdt-relay',
    label: 'DPDT Relay Switch',
    group: 'Arduino',
    nodes: arduinoDpdtNodes,
    edges: arduinoDpdtEdges,
    arduinoCode: arduinoDpdtCode,
  },
  {
    id: 'arduino-dpdt-motor-reversal',
    label: 'DPDT Motor Polarity Reversal',
    group: 'Arduino',
    nodes: arduinoDpdtMotorNodes,
    edges: arduinoDpdtMotorEdges,
    arduinoCode: arduinoDpdtMotorCode,
  },
  {
    id: 'arduino-dpdt-dual-motor-led',
    label: 'DPDT Dual Motor & Dual LED Switch',
    group: 'Arduino',
    nodes: arduinoDpdtDualNodes,
    edges: arduinoDpdtDualEdges,
    arduinoCode: arduinoDpdtDualCode,
  },
  {
    id: 'arduino-pnp-motor',
    label: 'PNP Transistor High-Side Switch',
    group: 'Arduino',
    nodes: arduinoPnpMotorNodes,
    edges: arduinoPnpMotorEdges,
    arduinoCode: arduinoPnpMotorCode,
  },
  {
    id: 'arduino-hbridge-motor',
    label: 'PNP/NPN Transistor H-Bridge Motor Driver',
    group: 'Arduino',
    nodes: arduinoHBridgeNodes,
    edges: arduinoHBridgeEdges,
    arduinoCode: arduinoHBridgeCode,
  },
  {
    id: 'arduino-dht11-rgb',
    label: 'Arduino + DHT11 + RGB LED Temp Monitor',
    group: 'Arduino',
    nodes: arduinoDhtRgbNodes,
    edges: arduinoDhtRgbEdges,
    arduinoCode: arduinoDhtRgbCode,
  },
  {
    id: 'arduino-dht11-neopixel',
    label: 'Arduino + DHT11 + NeoPixel Temp Monitor',
    group: 'Arduino',
    nodes: arduinoDhtNeopixelNodes,
    edges: arduinoDhtNeopixelEdges,
    arduinoCode: arduinoDhtNeopixelCode,
  },

  {
    id: 'pico-blink',
    label: 'Blink LED',
    group: 'Raspberry Pi Pico',
    nodes: picoBlinkNodes,
    edges: picoBlinkEdges,
    picoCode: picoBlinkCode,
    arduinoCode: picoBlinkCodeCpp,
  },
  {
    id: 'pico-traffic',
    label: 'Traffic Light',
    group: 'Raspberry Pi Pico',
    nodes: picoTrafficNodes,
    edges: picoTrafficEdges,
    picoCode: picoTrafficCode,
    arduinoCode: picoTrafficCodeCpp,
  },
  {
    id: 'pico-onboard',
    label: 'Onboard LED',
    group: 'Raspberry Pi Pico',
    nodes: picoOnboardNodes,
    edges: picoOnboardEdges,
    picoCode: picoOnboardCode,
    arduinoCode: picoOnboardCodeCpp,
  },
  {
    id: 'pico-l293d-1motor',
    label: 'Pico + L293D (1 Motor)',
    group: 'Raspberry Pi Pico',
    nodes: picoL293d1MotorNodes,
    edges: picoL293d1MotorEdges,
    picoCode: picoL293d1MotorPicoCode,
    arduinoCode: picoL293d1MotorCppCode,
  },
  {
    id: 'pico-l293d-2motors',
    label: 'Pico + L293D (2 Motors)',
    group: 'Raspberry Pi Pico',
    nodes: picoL293d2MotorsNodes,
    edges: picoL293d2MotorsEdges,
    picoCode: picoL293d2MotorsPicoCode,
    arduinoCode: picoL293d2MotorsCodeCpp,
  },
  {
    id: 'pico-l293d-4motors',
    label: 'Pico + L293D (4WD / 4 Motors)',
    group: 'Raspberry Pi Pico',
    nodes: picoL293d4MotorsNodes,
    edges: picoL293d4MotorsEdges,
    picoCode: picoL293d4MotorsPicoCode,
    arduinoCode: picoL293d4MotorsCppCode,
  },
  {
    id: 'pico-l293d-hobbygearmotor',
    label: 'Pico + L293D (Hobby Motors)',
    group: 'Raspberry Pi Pico',
    nodes: picoL293dHobbyNodes,
    edges: picoL293dHobbyEdges,
    picoCode: picoL293dHobbyPicoCode,
    arduinoCode: picoL293dHobbyCppCode,
  },
  {
    id: 'pico-l293d-2x-4motors',
    label: 'Pico + Dual L293D (4 Motors)',
    group: 'Raspberry Pi Pico',
    nodes: picoL293dDual4MotorsNodes,
    edges: picoL293dDual4MotorsEdges,
    picoCode: picoL293dDual4MotorsPicoCode,
    arduinoCode: picoL293dDual4MotorsCppCode,
  },
  {
    id: 'pico-sevensegment',
    label: 'Pico + 7-Segment Display',
    group: 'Raspberry Pi Pico',
    nodes: picoSevenSegNodes,
    edges: picoSevenSegEdges,
    picoCode: picoSevenSegCode,
    arduinoCode: picoSevenSegCodeCpp,
  },
  {
    id: 'pico-dpdt-relay',
    label: 'DPDT Relay Switch',
    group: 'Raspberry Pi Pico',
    nodes: picoDpdtNodes,
    edges: picoDpdtEdges,
    picoCode: picoDpdtCode,
    arduinoCode: picoDpdtCodeCpp,
  },
  {
    id: 'pico-dpdt-dual-motor-led',
    label: 'DPDT Dual Motor & Dual LED Switch',
    group: 'Raspberry Pi Pico',
    nodes: picoDpdtDualNodes,
    edges: picoDpdtDualEdges,
    picoCode: picoDpdtDualCode,
    arduinoCode: picoDpdtDualCodeCpp,
  },
  {
    id: 'pico-pnp-led-dimmer',
    label: 'PNP Transistor LED Dimmer (PWM)',
    group: 'Raspberry Pi Pico',
    nodes: picoPnpLedDimmerNodes,
    edges: picoPnpLedDimmerEdges,
    picoCode: picoPnpLedDimmerCode,
  },
  {
    id: 'pico-dht22',
    label: 'Pico + DHT22 Sensor',
    group: 'Raspberry Pi Pico',
    nodes: picoDht22Nodes,
    edges: picoDht22Edges,
    picoCode: picoDht22Code,
    arduinoCode: picoDht22CodeCpp,
  },
  {
    id: 'battery-led',
    label: 'Battery + LED',
    group: 'Basic',
    nodes: batteryNodes,
    edges: batteryEdges,
  },
  {
    id: 'battery-dpdt-relay',
    label: 'Battery + DPDT Relay',
    group: 'Basic',
    nodes: batteryDpdtNodes,
    edges: batteryDpdtEdges,
  },
  {
    id: 'battery-pnp-led',
    label: 'Battery + PNP LED switch',
    group: 'Basic',
    nodes: batteryPnpLedNodes,
    edges: batteryPnpLedEdges,
  },
];


