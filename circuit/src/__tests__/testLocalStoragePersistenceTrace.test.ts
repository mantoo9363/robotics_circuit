import { parseEsp32PythonGpioActions } from "../lib/esp32/parser/pythonPatterns";
import { getOrCreateSession } from "../lib/codeParsing/picoParser";

console.log("=================== TESTING BLINK PERSISTENCE CAUSE ===================");

// Case A: Truly empty / placeholder code
const placeholderCode = "# Write your MicroPython code here";
const actionsPlaceholder = parseEsp32PythonGpioActions(placeholderCode);
const sessionPlaceholder = getOrCreateSession(placeholderCode, 1000);

console.log("Case A (Placeholder Code):");
console.log("  actions count:", actionsPlaceholder.length);
console.log("  session loopNodes count:", sessionPlaceholder?.loopNodes?.length ?? 0);

// Case B: Restored / Cached Blink Code
const blinkCode = `from machine import Pin
import time
led = Pin(2, Pin.OUT)
while True:
    led.value(1)
    time.sleep(1)
    led.value(0)
    time.sleep(1)
`;

const actionsBlink = parseEsp32PythonGpioActions(blinkCode);
const sessionBlink = getOrCreateSession(blinkCode, 1000);

console.log("\nCase B (Restored Blink Code from localStorage):");
console.log("  actions count:", actionsBlink.length);
console.log("  session loopNodes count:", sessionBlink?.loopNodes?.length ?? 0);
console.log("  session outputs over time:");

for (let t = 0; t <= 3000; t += 500) {
  const s = getOrCreateSession(blinkCode, t);
  const pin2Val = s.pins.get(2)?.value;
  console.log(`    t=${t}ms: GPIO 2 = ${pin2Val}`);
}
