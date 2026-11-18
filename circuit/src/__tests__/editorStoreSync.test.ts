import { useCircuitStore } from "../lib/store";

console.log("=================== RUNNING EDITOR & STORE SYNC REGRESSION TEST ===================");

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`✕ FAIL: ${message}`);
    testsFailed++;
  }
}

// 1. Initial State Verification
const store = useCircuitStore.getState();
assert(
  typeof store.picoCode === "string" && store.picoCode.length > 0,
  "picoCode is initialized in store"
);

// 2. Set MicroPython Code
useCircuitStore.getState().setPicoCode("print('Hello ESP32')");
assert(
  useCircuitStore.getState().picoCode === "print('Hello ESP32')",
  "setPicoCode updates store reactively"
);

// 3. Reset Code
useCircuitStore.getState().setPicoCode("# Write your MicroPython code here");
assert(
  useCircuitStore.getState().picoCode === "# Write your MicroPython code here",
  "setPicoCode resets store to placeholder comment"
);

console.log(`\nResults: ${testsPassed} Passed, ${testsFailed} Failed`);
if (testsFailed > 0) {
  process.exit(1);
}
