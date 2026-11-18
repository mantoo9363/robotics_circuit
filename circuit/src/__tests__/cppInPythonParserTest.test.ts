import { parseEsp32PythonGpioActions, parseEsp32PythonGpioReadActions, parseEsp32PythonPwmActions } from "../lib/esp32/parser/pythonPatterns";
import { parseEsp32PythonConditionalActions } from "../lib/esp32/parser/conditionalLogic";
import { parseEsp32SessionActions } from "../lib/esp32/parser/sessionParser";

const cppCode = `
const int LED = 2;

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  digitalWrite(LED, HIGH);
  delay(1000);
  digitalWrite(LED, LOW);
  delay(1000);
}
`.trim();

console.log("=================== TESTING C++ CODE IN MICROPYTHON PARSERS ===================");

const gpioWrites = parseEsp32PythonGpioActions(cppCode);
console.log("parseEsp32PythonGpioActions(cppCode):", JSON.stringify(gpioWrites, null, 2));

const gpioReads = parseEsp32PythonGpioReadActions(cppCode);
console.log("parseEsp32PythonGpioReadActions(cppCode):", JSON.stringify(gpioReads, null, 2));

const pwmWrites = parseEsp32PythonPwmActions(cppCode);
console.log("parseEsp32PythonPwmActions(cppCode):", JSON.stringify(pwmWrites, null, 2));

const conditionals = parseEsp32PythonConditionalActions(cppCode, new Map([[4, true]]));
console.log("parseEsp32PythonConditionalActions(cppCode):", JSON.stringify(conditionals, null, 2));

const sessionActions = parseEsp32SessionActions(cppCode, true);
console.log("parseEsp32SessionActions(cppCode, isPython=true):", JSON.stringify(sessionActions, null, 2));
