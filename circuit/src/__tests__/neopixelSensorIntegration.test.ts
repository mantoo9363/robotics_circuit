import { parseNeoPixelColors } from "../lib/codeParsing/neopixelParser";
import { getOrCreateSession } from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";
import { applyNeoPixelInputToFrame } from "../lib/simulation/frameTransformers/neoPixel";
import { buildSimulationFrame } from "../lib/simulation-state";
import { COMPONENT_CATALOG } from "../lib/circuit-components";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runNeoPixelSensorIntegrationTests(): boolean {
  console.log("=================== RUNNING NEOPIXEL SENSOR INTEGRATION TESTS ===================\n");
  let passed = true;

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Arduino: analogRead(A0) resolved from analogPinValues map — Gap 3 fix
  // ─────────────────────────────────────────────────────────────────────────────
  const ldrCode = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixels(1, 6);
    void setup() { pixels.begin(); }
    void loop() {
      int val = analogRead(A0);
      pixels.setPixelColor(0, val / 4, 0, 0);
      pixels.show();
    }
  `.trim();

  // Simulate LDR slider at ~80%: 819 on 0..1023 scale.
  const analogPinValues = new Map<number, number>([[14, 819]]); // 14 = A0
  const ldrParsed = parseNeoPixelColors(ldrCode, 6, 1, analogPinValues);

  if (!ldrParsed) {
    console.error("FAIL (test 1): parseNeoPixelColors returned null for LDR-driven code");
    passed = false;
  } else {
    const expectedRed = Math.max(0, Math.min(255, Math.round(819 / 4))); // 204
    if (ldrParsed.pixels[0].r !== expectedRed) {
      console.error(`FAIL (test 1): Expected red=${expectedRed}, got red=${ldrParsed.pixels[0].r}`);
      passed = false;
    } else {
      console.log(`=> Test 1 PASS: analogRead(A0)=819 -> red=${ldrParsed.pixels[0].r} (expected ${expectedRed})`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Arduino: analogRead(A0) with NO analogPinValues — falls back to 0 (off)
  // ─────────────────────────────────────────────────────────────────────────────
  const ldrParsedNoMap = parseNeoPixelColors(ldrCode, 6, 1);
  if (!ldrParsedNoMap) {
    console.error("FAIL (test 2): parseNeoPixelColors returned null without analogPinValues");
    passed = false;
  } else {
    if (ldrParsedNoMap.pixels[0].r !== 0) {
      console.error(`FAIL (test 2): Expected red=0 when no sensor map, got red=${ldrParsedNoMap.pixels[0].r}`);
      passed = false;
    } else {
      console.log(`=> Test 2 PASS: No analogPinValues -> red=0 (NeoPixel off, sensor disconnected)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Arduino: raw analogRead value > 255 passed directly as channel — clamped not wrapped
  //    Gap 1 regression: old code 256 & 0xff = 0 (BLACK). New code min(255,256) = 255.
  // ─────────────────────────────────────────────────────────────────────────────
  const wrapTestCode = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixels(1, 6);
    void setup() { pixels.begin(); }
    void loop() {
      int val = analogRead(A0);
      pixels.setPixelColor(0, val, 0, 0);
      pixels.show();
    }
  `.trim();

  // Sensor at exactly 256 — old code silently wrapped to 0, new code clamps to 255
  const wrapMap = new Map<number, number>([[14, 256]]);
  const wrapParsed = parseNeoPixelColors(wrapTestCode, 6, 1, wrapMap);
  if (!wrapParsed) {
    console.error("FAIL (test 3): parseNeoPixelColors returned null for wrap-test code");
    passed = false;
  } else {
    const gotRed = wrapParsed.pixels[0].r;
    if (gotRed === 0) {
      console.error("FAIL (test 3): red=0 means value 256 wrapped (&0xff bug). Expected clamp to 255.");
      passed = false;
    } else if (gotRed === 255) {
      console.log(`=> Test 3 PASS: analogRead value 256 clamped to red=255 (no silent wrapping)`);
    } else {
      console.error(`FAIL (test 3): Unexpected red=${gotRed} for analogRead=256`);
      passed = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Arduino: analogRead=512 passed directly — old &0xff produced 0, now clamps to 255
  // ─────────────────────────────────────────────────────────────────────────────
  const boundaryMap = new Map<number, number>([[14, 512]]);
  const boundaryParsed = parseNeoPixelColors(wrapTestCode, 6, 1, boundaryMap);
  if (!boundaryParsed) {
    console.error("FAIL (test 4): parseNeoPixelColors returned null for boundary test");
    passed = false;
  } else {
    const gotRed = boundaryParsed.pixels[0].r;
    if (gotRed === 0) {
      console.error("FAIL (test 4): red=0 means 512 wrapped (&0xff=0 bug). Expected 255 (clamp).");
      passed = false;
    } else if (gotRed === 255) {
      console.log(`=> Test 4 PASS: analogRead value 512 clamped to red=255`);
    } else {
      console.error(`FAIL (test 4): Unexpected red=${gotRed} for analogRead=512`);
      passed = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Pico: read_u16() value > 255 in tuple must be clamped on np.write()
  //    Gap 2: picoParser must not store r=50000 into neopixelStates
  // ─────────────────────────────────────────────────────────────────────────────
  const picoCode = `
from machine import Pin
from neopixel import NeoPixel
np = NeoPixel(Pin(0), 1)
np[0] = (50000, 0, 0)
np.write()
  `.trim();

  try {
    const session = getOrCreateSession(picoCode, 100);
    if (!session) {
      console.error("FAIL (test 5): getOrCreateSession returned null for pico NeoPixel code");
      passed = false;
    } else if (!session.neopixelStates || session.neopixelStates.size === 0) {
      console.error("FAIL (test 5): neopixelStates is empty — np.write() not captured");
      passed = false;
    } else {
      const pixelState = session.neopixelStates.get(0);
      if (!pixelState) {
        console.error("FAIL (test 5): No state for pin 0");
        passed = false;
      } else {
        const gotRed = pixelState.pixels[0]?.r;
        if (gotRed !== undefined && gotRed > 255) {
          console.error(`FAIL (test 5): r=${gotRed} exceeds 8-bit max — clamping not applied on np.write()`);
          passed = false;
        } else if (gotRed === 255) {
          console.log(`=> Test 5 PASS: Pico np.write() with r=50000 clamped to r=255`);
        } else {
          console.error(`FAIL (test 5): Unexpected r=${gotRed}, expected 255 (clamped from 50000)`);
          passed = false;
        }
      }
    }
  } catch (e) {
    console.error("FAIL (test 5): Exception during Pico NeoPixel session:", e);
    passed = false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Arduino: analogRead by numeric pin literal (analogRead(0)) resolves correctly
  // ─────────────────────────────────────────────────────────────────────────────
  const numericPinCode = `
    #include <Adafruit_NeoPixel.h>
    Adafruit_NeoPixel pixels(1, 6);
    void setup() { pixels.begin(); }
    void loop() {
      int val = analogRead(0);
      pixels.setPixelColor(0, val / 4, 0, 0);
      pixels.show();
    }
  `.trim();

  const numericPinMap = new Map<number, number>([[14, 400]]); // pin 14 = A0 = analogRead(0)
  const numericPinParsed = parseNeoPixelColors(numericPinCode, 6, 1, numericPinMap);
  if (!numericPinParsed) {
    console.error("FAIL (test 6): parseNeoPixelColors returned null for numeric pin literal code");
    passed = false;
  } else {
    const expectedRed = Math.max(0, Math.min(255, Math.round(400 / 4))); // 100
    if (numericPinParsed.pixels[0].r !== expectedRed) {
      console.error(`FAIL (test 6): Expected red=${expectedRed}, got red=${numericPinParsed.pixels[0].r}`);
      passed = false;
    } else {
      console.log(`=> Test 6 PASS: analogRead(0) with map[14]=400 -> red=${numericPinParsed.pixels[0].r}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Ultrasonic + NeoPixel: pulseIn substitution resolves to correct colour band
  //    Code: distance <= 25 → 4 Red, <= 50 → 3 Yellow, <= 75 → 2 Green, <= 100 → 1 Green
  //    Sensor at 35 cm → duration = round(35*2/0.0343) = 2040 µs → distance = 34.8 → band: Yellow (3px)
  // ─────────────────────────────────────────────────────────────────────────────
  const ultrasonicNeoPixelCode = `
#include <Adafruit_NeoPixel.h>
#define NEO_PIN 6
#define NUM_PIXELS 4
#define TRIG_PIN 9
#define ECHO_PIN 10
Adafruit_NeoPixel pixels(NUM_PIXELS, NEO_PIN, NEO_GRB + NEO_KHZ800);
void setup() { pixels.begin(); pixels.clear(); pixels.show(); }
void loop() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH);
  float distance = duration * 0.034 / 2;
  pixels.clear();
  if (distance <= 25) { for (int i = 0; i < 4; i++) { pixels.setPixelColor(i, pixels.Color(255, 0, 0)); } }
  else if (distance <= 50) { for (int i = 0; i < 3; i++) { pixels.setPixelColor(i, pixels.Color(255, 255, 0)); } }
  else if (distance <= 75) { for (int i = 0; i < 2; i++) { pixels.setPixelColor(i, pixels.Color(0, 255, 0)); } }
  else if (distance <= 100) { pixels.setPixelColor(0, pixels.Color(0, 255, 0)); }
  pixels.show();
}
  `.trim();

  // Simulate pulseIn already resolved to a duration corresponding to 35 cm.
  // duration = round(35*2/0.0343) = 2040 µs  →  distance = 2040*0.034/2 = 34.68 cm  →  <= 50 Yellow
  const durationFor35cm = Math.round((35 * 2) / 0.0343);
  const codeWith35cm = ultrasonicNeoPixelCode.replace(
    /pulseIn\s*\([^)]+\)/,
    String(durationFor35cm)
  );
  const parsed35 = parseNeoPixelColors(codeWith35cm, 6, 4, undefined, 35);
  if (!parsed35) {
    console.error("FAIL (test 7): parseNeoPixelColors returned null for ultrasonicNeoPixelCode at 35 cm");
    passed = false;
  } else {
    // pixels[0..2] should be Yellow (255, 255, 0), pixel[3] should be OFF (0,0,0)
    const allYellow = [0, 1, 2].every(i => parsed35.pixels[i].r === 255 && parsed35.pixels[i].g === 255 && parsed35.pixels[i].b === 0);
    const lastOff = parsed35.pixels[3].r === 0 && parsed35.pixels[3].g === 0 && parsed35.pixels[3].b === 0;
    if (!allYellow || !lastOff) {
      console.error(`FAIL (test 7): Expected pixels[0..2]=Yellow, pixels[3]=OFF. Got:`, JSON.stringify(parsed35.pixels));
      passed = false;
    } else {
      console.log(`=> Test 7 PASS: ultrasonic 35 cm -> Yellow band (pixels[0..2]=Yellow, pixels[3]=OFF)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Ultrasonic + NeoPixel: 5 cm distance → RED band (distance <= 25 → 4 Red)
  // ─────────────────────────────────────────────────────────────────────────────
  const durationFor5cm = Math.round((5 * 2) / 0.0343);
  const codeWith5cm = ultrasonicNeoPixelCode.replace(
    /pulseIn\s*\([^)]+\)/,
    String(durationFor5cm)
  );
  const parsed5 = parseNeoPixelColors(codeWith5cm, 6, 4, undefined, 5);
  if (!parsed5) {
    console.error("FAIL (test 8): parseNeoPixelColors returned null for ultrasonicNeoPixelCode at 5 cm");
    passed = false;
  } else {
    const allRed = parsed5.pixels.slice(0, 4).every(p => p.r === 255 && p.g === 0 && p.b === 0);
    if (!allRed) {
      console.error(`FAIL (test 8): Expected all 4 pixels RED at 5 cm. Got:`, JSON.stringify(parsed5.pixels));
      passed = false;
    } else {
      console.log(`=> Test 8 PASS: ultrasonic 5 cm -> RED band (all 4 pixels RED)`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Ultrasonic + NeoPixel: 150 cm distance → ALL OFF (distance > 100 → clear)
  // ─────────────────────────────────────────────────────────────────────────────
  const durationFor150cm = Math.round((150 * 2) / 0.0343);
  const codeWith150cm = ultrasonicNeoPixelCode.replace(
    /pulseIn\s*\([^)]+\)/,
    String(durationFor150cm)
  );
  const parsed150 = parseNeoPixelColors(codeWith150cm, 6, 4, undefined, 150);
  if (!parsed150) {
    console.error("FAIL (test 9): parseNeoPixelColors returned null for ultrasonicNeoPixelCode at 150 cm");
    passed = false;
  } else {
    const allOff = parsed150.pixels.every(p => p.r === 0 && p.g === 0 && p.b === 0);
    if (!allOff) {
      console.error(`FAIL (test 9): Expected all pixels OFF at 150 cm. Got:`, JSON.stringify(parsed150.pixels));
      passed = false;
    } else {
      console.log(`=> Test 9 PASS: ultrasonic 150 cm -> ALL OFF (distance > 100)`);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────
  // 10. Serial-driven NeoPixel: Edge detection state machine syncing via Serial Monitor logs
  // ─────────────────────────────────────────────────────────────────────────────
  const serialCode = `
#include <Adafruit_NeoPixel.h>
#define NEO_PIN 6
#define NUM_PIXELS 1
Adafruit_NeoPixel pixels(NUM_PIXELS, NEO_PIN, NEO_GRB + NEO_KHZ800);
void setup() { pixels.begin(); }
void loop() {
  if (colorIndex == 0) {
    pixels.setPixelColor(0, pixels.Color(255, 0, 0));
    Serial.println("RED");
  } else if (colorIndex == 1) {
    pixels.setPixelColor(0, pixels.Color(0, 255, 0));
    Serial.println("GREEN");
  } else if (colorIndex == 2) {
    pixels.setPixelColor(0, pixels.Color(0, 0, 255));
    Serial.println("BLUE");
  }
}
  `.trim();

  const unoNode: CircuitNode = {
    id: "uno1",
    type: "arduino",
    position: { x: 0, y: 0 },
    data: { componentType: "arduino", label: "Arduino Uno R3", properties: { name: { value: "Arduino1" } }, rotation: 0 }
  } as any;
  const pixelNode: CircuitNode = {
    id: "pix1",
    type: "neopixel",
    position: { x: 100, y: 0 },
    data: { componentType: "neopixel", label: "NeoPixel (WS2812B)", properties: { name: { value: "PIX1" } }, rotation: 0 }
  } as any;

  const edges: CircuitEdge[] = [
    { id: "e1", source: "uno1", sourceHandle: "5v", target: "pix1", targetHandle: "vcc1", type: "wire" },
    { id: "e2", source: "uno1", sourceHandle: "gnd1", target: "pix1", targetHandle: "ground1", type: "wire" },
    { id: "e3", source: "uno1", sourceHandle: "d6", target: "pix1", targetHandle: "in", type: "wire" }
  ];

  useCircuitStore.setState({
    nodes: [unoNode, pixelNode],
    edges,
    arduinoCode: serialCode,
    picoCode: "",
    simulationStatus: "running"
  });

  const frameBase = buildSimulationFrame({
    tick: 1,
    timestamp: 100,
    nodes: [unoNode, pixelNode],
    edges,
    boardType: "arduino",
    running: true,
    error: null,
    dynamicComponents: COMPONENT_CATALOG
  });

  // Verify RED
  const frameRed = { ...frameBase, serialOutput: ["RED"] };
  try {
    const transformed = applyNeoPixelInputToFrame(frameRed, {
      nodes: [unoNode, pixelNode],
      edges,
      arduinoCode: serialCode,
      picoCode: "",
      boardType: "arduino",
      dynamicComponents: COMPONENT_CATALOG
    } as any);

    const comp = transformed.components["pix1"];
    if (!comp || comp.telemetry.red !== 255 || comp.telemetry.green !== 0 || comp.telemetry.blue !== 0) {
      console.error(`FAIL (test 10 - RED): Expected pixel RED (255,0,0). Got:`, JSON.stringify(comp?.telemetry));
      passed = false;
    } else {
      console.log(`=> Test 10 (RED) PASS: Serial output ["RED"] -> Red color`);
    }
  } catch (e: any) {
    console.error("FAIL (test 10 - RED) threw error:", e.message);
    passed = false;
  }

  // Verify GREEN
  const frameGreen = { ...frameBase, serialOutput: ["RED", "GREEN"] };
  try {
    const transformed = applyNeoPixelInputToFrame(frameGreen, {
      nodes: [unoNode, pixelNode],
      edges,
      arduinoCode: serialCode,
      picoCode: "",
      boardType: "arduino",
      dynamicComponents: COMPONENT_CATALOG
    } as any);

    const comp = transformed.components["pix1"];
    if (!comp || comp.telemetry.red !== 0 || comp.telemetry.green !== 255 || comp.telemetry.blue !== 0) {
      console.error(`FAIL (test 10 - GREEN): Expected pixel GREEN (0,255,0). Got:`, JSON.stringify(comp?.telemetry));
      passed = false;
    } else {
      console.log(`=> Test 10 (GREEN) PASS: Serial output ["RED", "GREEN"] -> Green color`);
    }
  } catch (e: any) {
    console.error("FAIL (test 10 - GREEN) threw error:", e.message);
    passed = false;
  }

  // Verify BLUE (backward scanning skipping unmatched logs)
  const frameBlue = { ...frameBase, serialOutput: ["RED", "GREEN", "BLUE", "other irrelevant message"] };
  try {
    const transformed = applyNeoPixelInputToFrame(frameBlue, {
      nodes: [unoNode, pixelNode],
      edges,
      arduinoCode: serialCode,
      picoCode: "",
      boardType: "arduino",
      dynamicComponents: COMPONENT_CATALOG
    } as any);

    const comp = transformed.components["pix1"];
    if (!comp || comp.telemetry.red !== 0 || comp.telemetry.green !== 0 || comp.telemetry.blue !== 255) {
      console.error(`FAIL (test 10 - BLUE): Expected pixel BLUE (0,0,255). Got:`, JSON.stringify(comp?.telemetry));
      passed = false;
    } else {
      console.log(`=> Test 10 (BLUE) PASS: Serial output ["RED", "GREEN", "BLUE", ...] -> Blue color (backward scanning works)`);
    }
  } catch (e: any) {
    console.error("FAIL (test 10 - BLUE) threw error:", e.message);
    passed = false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n=================== NEOPIXEL SENSOR INTEGRATION TESTS ${passed ? "PASSED" : "FAILED"} ===================\n`);
  return passed;
}

if (require.main === module) {
  const ok = runNeoPixelSensorIntegrationTests();
  if (ok) {
    console.log("✅ All NeoPixel Sensor Integration tests passed.");
  } else {
    console.error("❌ Some NeoPixel Sensor Integration tests failed.");
    process.exit(1);
  }
}
