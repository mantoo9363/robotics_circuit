import {
  parseTimedDigitalWriteSequence,
  getTimedDigitalWritePinsAtTime,
} from "../lib/codeParsing";

export function runArduinoRgbLedTests(): boolean {
  console.log("=================== RUNNING ARDUINO RGB LED REGRESSION TESTS ===================\n");

  let passed = true;

  const arduinoCode = `
int RED = 10;
int GREEN = 9;
int BLUE = 12;

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(GREEN, OUTPUT);
  pinMode(BLUE, OUTPUT);
}

void loop() {

  // Red
  digitalWrite(RED, HIGH);
  digitalWrite(GREEN, LOW);
  digitalWrite(BLUE, LOW);
  delay(1000);

  // Green
  digitalWrite(RED, LOW);
  digitalWrite(GREEN, HIGH);
  digitalWrite(BLUE, LOW);
  delay(1000);

  // Blue
  digitalWrite(RED, LOW);
  digitalWrite(GREEN, LOW);
  digitalWrite(BLUE, HIGH);
  delay(1000);

  // Yellow
  digitalWrite(RED, HIGH);
  digitalWrite(GREEN, HIGH);
  digitalWrite(BLUE, LOW);
  delay(1000);

  // Purple
  digitalWrite(RED, HIGH);
  digitalWrite(GREEN, LOW);
  digitalWrite(BLUE, HIGH);
  delay(1000);

  // Cyan
  digitalWrite(RED, LOW);
  digitalWrite(GREEN, HIGH);
  digitalWrite(BLUE, HIGH);
  delay(1000);

  // White
  digitalWrite(RED, HIGH);
  digitalWrite(GREEN, HIGH);
  digitalWrite(BLUE, HIGH);
  delay(1000);
}
`.trim();

  const expectedStates = [
    { 10: true, 9: false, 12: false },
    { 10: false, 9: true, 12: false },
    { 10: false, 9: false, 12: true },
    { 10: true, 9: true, 12: false },
    { 10: true, 9: false, 12: true },
    { 10: false, 9: true, 12: true },
    { 10: true, 9: true, 12: true },
  ];

  const sequence = parseTimedDigitalWriteSequence(arduinoCode);
  if (!sequence) {
    console.error("FAIL: parseTimedDigitalWriteSequence returned null for valid RGB LED code.");
    return false;
  }

  if (sequence.length !== expectedStates.length) {
    console.error(
      `FAIL: expected ${expectedStates.length} sequence steps, got ${sequence.length}`,
    );
    passed = false;
  }

  sequence.forEach((step, index) => {
    const expected = expectedStates[index];
    if (!expected) return;

    const actual = {
      10: step.pins.get(10) ?? false,
      9: step.pins.get(9) ?? false,
      12: step.pins.get(12) ?? false,
    };

    const expectedDuration = 1000;
    if (step.duration !== expectedDuration) {
      console.error(
        `FAIL: step ${index} expected duration ${expectedDuration} but got ${step.duration}`,
      );
      passed = false;
    }

    if (
      actual[10] !== expected[10] ||
      actual[9] !== expected[9] ||
      actual[12] !== expected[12]
    ) {
      console.error(
        `FAIL: step ${index} pin states mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
      );
      passed = false;
    }
  });

  // Verify time sampling at several points in the loop.
  const timestampChecks: Array<{ time: number; expected: Record<number, boolean> }> = [
    { time: 0, expected: expectedStates[0] },
    { time: 999, expected: expectedStates[0] },
    { time: 1000, expected: expectedStates[1] },
    { time: 2999, expected: expectedStates[2] },
    { time: 6000, expected: expectedStates[6] },
    { time: 6999, expected: expectedStates[6] },
    { time: 7000, expected: expectedStates[0] },
  ];

  timestampChecks.forEach((check) => {
    const pins = getTimedDigitalWritePinsAtTime(arduinoCode, check.time);
    if (!pins) {
      console.error(`FAIL: getTimedDigitalWritePinsAtTime returned null at time=${check.time}`);
      passed = false;
      return;
    }

    const actual = {
      10: pins.get(10) ?? false,
      9: pins.get(9) ?? false,
      12: pins.get(12) ?? false,
    };

    if (
      actual[10] !== check.expected[10] ||
      actual[9] !== check.expected[9] ||
      actual[12] !== check.expected[12]
    ) {
      console.error(
        `FAIL: time ${check.time} expected=${JSON.stringify(check.expected)} actual=${JSON.stringify(actual)}`,
      );
      passed = false;
    }
  });

  // -------------------------------------------------------------
  // Test Case 2: 7-Color Sequence with Standard Pins (9, 10, 11)
  // -------------------------------------------------------------
  const standardRgbCode = `
const int RED   = 9;
const int GREEN = 10;
const int BLUE  = 11;

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(GREEN, OUTPUT);
  pinMode(BLUE, OUTPUT);
}

void loop() {
  // 1. Red
  digitalWrite(RED, HIGH); digitalWrite(GREEN, LOW); digitalWrite(BLUE, LOW); delay(1000);
  // 2. Green
  digitalWrite(RED, LOW); digitalWrite(GREEN, HIGH); digitalWrite(BLUE, LOW); delay(1000);
  // 3. Blue
  digitalWrite(RED, LOW); digitalWrite(GREEN, LOW); digitalWrite(BLUE, HIGH); delay(1000);
  // 4. Yellow
  digitalWrite(RED, HIGH); digitalWrite(GREEN, HIGH); digitalWrite(BLUE, LOW); delay(1000);
  // 5. Purple
  digitalWrite(RED, HIGH); digitalWrite(GREEN, LOW); digitalWrite(BLUE, HIGH); delay(1000);
  // 6. Cyan
  digitalWrite(RED, LOW); digitalWrite(GREEN, HIGH); digitalWrite(BLUE, HIGH); delay(1000);
  // 7. White
  digitalWrite(RED, HIGH); digitalWrite(GREEN, HIGH); digitalWrite(BLUE, HIGH); delay(1000);
}
`.trim();

  const standardExpectedStates = [
    { 9: true, 10: false, 11: false }, // Red
    { 9: false, 10: true, 11: false }, // Green
    { 9: false, 10: false, 11: true }, // Blue
    { 9: true, 10: true, 11: false },  // Yellow
    { 9: true, 10: false, 11: true },  // Purple
    { 9: false, 10: true, 11: true },  // Cyan
    { 9: true, 10: true, 11: true },   // White
  ];

  const standardSeq = parseTimedDigitalWriteSequence(standardRgbCode);
  if (!standardSeq || standardSeq.length !== standardExpectedStates.length) {
    console.error(`FAIL: Standard RGB sequence length mismatch. expected=${standardExpectedStates.length} actual=${standardSeq?.length}`);
    passed = false;
  } else {
    standardSeq.forEach((step, idx) => {
      const expected = standardExpectedStates[idx];
      const actual = {
        9: step.pins.get(9) ?? false,
        10: step.pins.get(10) ?? false,
        11: step.pins.get(11) ?? false,
      };
      if (actual[9] !== expected[9] || actual[10] !== expected[10] || actual[11] !== expected[11]) {
        console.error(`FAIL: Standard pin step ${idx} mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
        passed = false;
      }
    });
  }

  // -------------------------------------------------------------
  // Test Case 3: Constant Steady White Light in Loop
  // -------------------------------------------------------------
  const whiteLightCode = `
const int RED = 9;
const int GREEN = 10;
const int BLUE = 11;

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(GREEN, OUTPUT);
  pinMode(BLUE, OUTPUT);
}

void loop() {
  digitalWrite(RED, HIGH);
  digitalWrite(GREEN, HIGH);
  digitalWrite(BLUE, HIGH);
  delay(1000);
}
`.trim();

  const whitePins = getTimedDigitalWritePinsAtTime(whiteLightCode, 0);
  if (!whitePins) {
    console.error("FAIL: getTimedDigitalWritePinsAtTime returned null for constant white light code.");
    passed = false;
  } else {
    const actualWhite = {
      9: whitePins.get(9) ?? false,
      10: whitePins.get(10) ?? false,
      11: whitePins.get(11) ?? false,
    };
    if (!actualWhite[9] || !actualWhite[10] || !actualWhite[11]) {
      console.error(`FAIL: Constant white light pins mismatch. actual=${JSON.stringify(actualWhite)}`);
      passed = false;
    }
  }

  if (passed) {
    console.log(">=> All RGB LED sequence & white light tests PASSED\n");
  } else {
    console.error(">=> RGB LED tests FAILED\n");
  }

  console.log("=================== ARDUINO RGB LED REGRESSION TESTS COMPLETE ===================");
  return passed;
}

if (require.main === module) {
  const success = runArduinoRgbLedTests();
  if (success) {
    console.log("✅ All Arduino RGB LED tests passed successfully.");
  } else {
    console.error("❌ Some Arduino RGB LED tests failed.");
    process.exit(1);
  }
}
