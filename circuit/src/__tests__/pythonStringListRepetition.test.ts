import assert from 'assert';
import { parsePythonReadOutputsForInput, clearSimSessions } from '../lib/codeParsing/picoParser';

/**
 * Regression tests for Python string and list repetition via `*` operator and `*=` AugAssign.
 */
export function runPythonStringListRepetitionTests(): boolean {
  console.log('--- RUNNING PYTHON STRING & LIST REPETITION TESTS ---');
  let passed = true;

  const runCase = (name: string, code: string, expectedSerial: string[]) => {
    clearSimSessions();
    const res = parsePythonReadOutputsForInput(code, 0, false, 0, 'esp32');
    const serial = res?.serialLines || [];
    try {
      assert.deepStrictEqual(serial, expectedSerial, `Mismatch in test: ${name}`);
      console.log(`✅ ${name} passed`);
    } catch (err: any) {
      console.error(`❌ ${name} failed:`, err.message);
      console.error(`   Expected:`, expectedSerial);
      console.error(`   Actual:  `, serial);
      passed = false;
    }
  };

  // 1. String * int
  runCase(
    'String * int repetition ("*" * 3)',
    `print("Entered:", "*" * 3)`,
    ['Entered: ***']
  );

  // 2. int * String (reversed order)
  runCase(
    'int * String repetition (3 * "*")',
    `print("Entered:", 3 * "*")`,
    ['Entered: ***']
  );

  // 3. String * len(variable)
  runCase(
    'String * len(variable) repetition ("*" * len(entered))',
    `entered = "abc"\nprint("Entered:", "*" * len(entered))`,
    ['Entered: ***']
  );

  // 4. String * 0 and negative
  runCase(
    'String * 0 and negative repetition',
    `print("Zero:", "*" * 0)\nprint("Neg:", "*" * -5)`,
    ['Zero: ', 'Neg: ']
  );

  // 5. List * int
  runCase(
    'List * int repetition ([1, 2] * 3)',
    `items = [1, 2] * 3\nprint(items[0], items[1], items[2], items[3], items[4], items[5], len(items))`,
    ['1 2 1 2 1 2 6']
  );

  // 6. int * List (reversed order)
  runCase(
    'int * List repetition (3 * [1, 2])',
    `items = 3 * [1, 2]\nprint(items[0], items[1], items[2], items[3], items[4], items[5], len(items))`,
    ['1 2 1 2 1 2 6']
  );

  // 7. Standard numeric multiplication preservation
  runCase(
    'Standard numeric multiplication (5 * 3, 2.5 * 2)',
    `print("Numbers:", 5 * 3, 2.5 * 2)`,
    ['Numbers: 15 5']
  );

  // 8. AugAssign *= with String
  runCase(
    'AugAssign *= with string (stars *= 3)',
    `stars = "*"\nstars *= 3\nprint("AugAssign string:", stars)`,
    ['AugAssign string: ***']
  );

  // 9. AugAssign *= with List
  runCase(
    'AugAssign *= with list (items *= 2)',
    `items = [7, 8]\nitems *= 2\nprint(items[0], items[1], items[2], items[3], len(items))`,
    ['7 8 7 8 4']
  );

  return passed;
}

if (require.main === module) {
  const ok = runPythonStringListRepetitionTests();
  process.exit(ok ? 0 : 1);
}
