import {
  getOrCreateSession,
  parsePythonReadOutputsForInput,
  clearSimSessions,
} from "../lib/codeParsing/picoParser";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";

/**
 * Regression: Pico (MicroPython) 4x4 keypad read through a `get_key()` helper
 * that debounces with `time.sleep_ms()` — the very common pattern
 *
 *   def get_key():
 *       ...
 *       if cols[c].value() == 1:
 *           time.sleep_ms(50)
 *           while cols[c].value() == 1:
 *               time.sleep_ms(10)
 *           return keys[r][c]
 *
 * Root cause: `SleepSignal` unwinds the whole call stack and resumes from a
 * flattened "remaining statements" list, which cannot carry a pending `return`
 * value back to the caller — so a `sleep` inside a value-returning helper made
 * it silently return `None`, and no key was ever registered.
 *
 * Fix (picoParser.ts): when executing inside a user function (scope depth > 1),
 * `sleep` / `sleep_ms` / `sleep_us` skip the suspend and only accumulate the
 * delay for outer-loop pacing, so the helper runs through to its `return`.
 *
 * Shared with ESP32 MicroPython (same session engine).
 */
const PICO = "pico1";
const KP = "kp1";

function nodes(pressed: string): CircuitNode[] {
  return [
    { id: PICO, type: "raspberrypipico", position: { x: 0, y: 0 },
      data: { componentType: "raspberrypipico", simulationModel: "raspberrypipico", label: "Pico", properties: {} } } as any,
    { id: KP, type: "keypad4x4", position: { x: 200, y: 0 },
      data: { componentType: "keypad4x4", label: "Keypad",
        properties: { pressedKeys: { label: "Pressed Keys", type: "string", value: pressed } } } } as any,
  ];
}

const EDGES: CircuitEdge[] = (
  [["gp6", "row1"], ["gp7", "row2"], ["gp8", "row3"], ["gp9", "row4"],
   ["gp10", "column1"], ["gp11", "column2"], ["gp12", "column3"], ["gp13", "column4"]] as const
).map(([g, h], i) => ({ id: "e" + i, source: PICO, sourceHandle: g, target: KP, targetHandle: h })) as any;

const CODE = `
from machine import Pin
import time
rows = [Pin(6, Pin.OUT), Pin(7, Pin.OUT), Pin(8, Pin.OUT), Pin(9, Pin.OUT)]
cols = [Pin(10, Pin.IN, Pin.PULL_DOWN), Pin(11, Pin.IN, Pin.PULL_DOWN),
        Pin(12, Pin.IN, Pin.PULL_DOWN), Pin(13, Pin.IN, Pin.PULL_DOWN)]
keys = [['1','2','3','A'],['4','5','6','B'],['7','8','9','C'],['*','0','#','D']]
def get_key():
    for r in range(4):
        for row in rows:
            row.value(0)
        rows[r].value(1)
        for c in range(4):
            if cols[c].value() == 1:
                time.sleep_ms(50)
                while cols[c].value() == 1:
                    time.sleep_ms(10)
                return keys[r][c]
    return None
print("KEYPAD READY")
while True:
    key = get_key()
    if key is not None:
        print("Key pressed:", key)
`;

function step(pressed: string, ts0: number, n: number): { ts: number } {
  useCircuitStore.setState({ nodes: nodes(pressed), edges: EDGES, simulationStatus: "running" } as any);
  let ts = ts0;
  for (let i = 0; i < n; i++) {
    ts += 50;
    parsePythonReadOutputsForInput(CODE, -1, false, ts, "pico");
  }
  return { ts };
}

export function runPicoKeypadDebounceHelperTests(): boolean {
  console.log("--- RUNNING PICO KEYPAD DEBOUNCE-HELPER TESTS ---");
  let passed = true;

  // 1. Press "5" -> get_key() must return it despite the sleep_ms debounce.
  {
    clearSimSessions();
    const { ts } = step("5", 0, 60);
    const s = getOrCreateSession(CODE, ts + 50, "pico");
    const serial = (s.rawSerialLines ?? []) as string[];
    const ok = serial.some((l) => l.includes("Key pressed: 5"));
    console.log(ok
      ? "✅ Test 1: get_key() returned '5' through the sleep_ms debounce"
      : `❌ Test 1: '5' never registered -> ${JSON.stringify(serial.slice(-6))}`);
    if (!ok) passed = false;
  }

  // 2. After release, the key must NOT keep re-firing (edge, not level).
  {
    clearSimSessions();
    const a = step("5", 0, 40);
    const b = step("", a.ts, 30); // key released
    const s = getOrCreateSession(CODE, b.ts + 50, "pico");
    const serial = (s.rawSerialLines ?? []) as string[];
    const count = serial.filter((l) => l.includes("Key pressed: 5")).length;
    const ok = count === 1;
    console.log(ok
      ? "✅ Test 2: '5' registered exactly once (no repeat after release)"
      : `❌ Test 2: registered ${count} times -> ${JSON.stringify(serial.slice(-8))}`);
    if (!ok) passed = false;
  }

  // 3. General: a `sleep` inside a value-returning helper no longer swallows
  //    the return value.
  {
    clearSimSessions();
    useCircuitStore.setState({ nodes: nodes(""), edges: [], simulationStatus: "running" } as any);
    const code = `
import time
def f():
    time.sleep_ms(50)
    return 42
print("start")
while True:
    x = f()
    print("got", x)
`;
    let ts = 0;
    for (let i = 0; i < 20; i++) { ts += 50; parsePythonReadOutputsForInput(code, -1, false, ts, "pico"); }
    const s = getOrCreateSession(code, ts + 50, "pico");
    const serial = (s.rawSerialLines ?? []) as string[];
    const ok = serial.some((l) => l.includes("got 42")) && !serial.some((l) => l.includes("got None"));
    console.log(ok
      ? "✅ Test 3: sleep-then-return in helper propagates the value (got 42)"
      : `❌ Test 3: -> ${JSON.stringify(serial.slice(-6))}`);
    if (!ok) passed = false;
  }

  return passed;
}

if (require.main === module) {
  process.exit(runPicoKeypadDebounceHelperTests() ? 0 : 1);
}
