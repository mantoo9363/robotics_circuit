import * as Blockly from "blockly";

export const pythonGenerator: any = {
  ORDER_ATOMIC: 0,
};

pythonGenerator.forBlock = {};

// Keep track of declared pin variables and custom setup lines
const declaredVariables = new Set<string>();
const declaredPins = new Set<number>();

/* =========================================================
   VARIABLES GET
 ========================================================= */
pythonGenerator.forBlock["variables_get"] = (block: any) => {
  const varModel = block.workspace.getVariableById(block.getFieldValue("VAR"));
  const variable = varModel ? varModel.name : block.getFieldValue("VAR");
  return [variable, 0];
};

/* =========================================================
   VARIABLES SET
 ========================================================= */
pythonGenerator.forBlock["variables_set"] = (block: any, generator: any) => {
  const varModel = block.workspace.getVariableById(block.getFieldValue("VAR"));
  const variable = varModel ? varModel.name : block.getFieldValue("VAR");
  const value = generator.valueToCode(block, "VALUE", 0) || "0";
  return `${variable} = ${value}\n`;
};

/* =========================================================
   MATH NUMBER
 ========================================================= */
pythonGenerator.forBlock["math_number"] = (block: any) => {
  return [block.getFieldValue("NUM"), 0];
};

/* =========================================================
   TEXT
 ========================================================= */
pythonGenerator.forBlock["text"] = (block: any) => {
  return [`"${block.getFieldValue("TEXT")}"`, 0];
};

/* =========================================================
   HIGH LOW
 ========================================================= */
pythonGenerator.forBlock["high_low"] = (block: any) => {
  const state = block.getFieldValue("STATE");
  return [state === "HIGH" ? "1" : "0", 0];
};

/* =========================================================
   ANALOG PIN
 ========================================================= */
pythonGenerator.forBlock["analog_pin"] = (block: any) => {
  // Map A0-A5 to GP pins or analog channel index
  const pin = block.getFieldValue("PIN");
  // Typically, A0 is GP26 on Pico
  const map: Record<string, string> = {
    A0: "26",
    A1: "27",
    A2: "28",
    A3: "29",
  };
  return [map[pin] || "26", 0];
};

/* =========================================================
   DIGITAL PIN
 ========================================================= */
pythonGenerator.forBlock["digital_pin"] = (block: any) => {
  return [block.getFieldValue("PIN"), 0];
};

/* =========================================================
   ANALOG READ
 ========================================================= */
pythonGenerator.forBlock["analog_read"] = (block: any, generator: any) => {
  const pin = generator.valueToCode(block, "PIN", 0) || "26";
  // MicroPython: ADC(Pin(pin)).read_u16()
  return [`ADC(Pin(${pin})).read_u16()`, 0];
};

/* =========================================================
   SERIAL PRINT
 ========================================================= */
pythonGenerator.forBlock["serial_print"] = (block: any, generator: any) => {
  const text = generator.valueToCode(block, "TEXT", 0) || '""';
  return `print(${text})\n`;
};

/* =========================================================
   SET PIN
 ========================================================= */
pythonGenerator.forBlock["set_pin"] = (block: any, generator: any) => {
  const pin = generator.valueToCode(block, "PIN", 0) || "13";
  const state = generator.valueToCode(block, "STATE", 0) || "1";
  
  // We will generate:
  // pin_13.value(state)
  const pinNum = parseInt(pin, 10);
  if (!isNaN(pinNum)) {
    declaredPins.add(pinNum);
  }
  return `pin_${pin}.value(${state})\n`;
};

/* =========================================================
   BUILTIN LED
 ========================================================= */
pythonGenerator.forBlock["builtin_led"] = (block: any) => {
  const state = block.getFieldValue("STATE");
  const val = state === "HIGH" ? "1" : "0";
  // On Pico, GP25 is the built-in LED
  declaredPins.add(25);
  return `pin_25.value(${val})\n`;
};

/* =========================================================
   ANALOG WRITE
 ========================================================= */
pythonGenerator.forBlock["analog_write"] = (block: any, generator: any) => {
  const pin = generator.valueToCode(block, "PIN", 0) || "0";
  const value = generator.valueToCode(block, "VALUE", 0) || "0";
  // On Pico, you set analog write via PWM:
  // pwm_X = PWM(Pin(X))
  // pwm_X.duty_u16(value * 257)
  const pinNum = parseInt(pin, 10);
  // We can track custom setup for PWM as well, but for simplicity, we can do inline:
  // PWM(Pin(pin)).duty_u16(int(value * 65535 / 255))
  return `PWM(Pin(${pin})).duty_u16(int(${value} * 65535 / 255))\n`;
};

/* =========================================================
   DELAY
 ========================================================= */
pythonGenerator.forBlock["delay_ms"] = (block: any, generator: any) => {
  const ms = generator.valueToCode(block, "MS", 0) || "1000";
  // MicroPython time.sleep_ms(ms)
  return `time.sleep_ms(${ms})\n`;
};

/* =========================================================
   SERVO WRITE
 ========================================================= */
pythonGenerator.forBlock["servo_write"] = (block: any, generator: any) => {
  const pin = generator.valueToCode(block, "PIN", 0) || "9";
  const angle = generator.valueToCode(block, "ANGLE", 0) || "90";
  // Servo in MicroPython (using PWM):
  // duty = int((angle / 180 * 2 + 0.5) / 20 * 65535)
  // PWM(Pin(pin), freq=50).duty_u16(duty)
  return `PWM(Pin(${pin}), freq=50).duty_u16(int((${angle} / 180 * 2 + 0.5) / 20 * 65535))\n`;
};

/* =========================================================
   LOGIC COMPARE
 ========================================================= */
pythonGenerator.forBlock["logic_compare"] = (block: any, generator: any) => {
  const A = generator.valueToCode(block, "A", 0) || "0";
  const B = generator.valueToCode(block, "B", 0) || "0";
  const OP = block.getFieldValue("OP");

  const OPERATORS: any = {
    EQ: "==",
    NEQ: "!=",
    LT: "<",
    LTE: "<=",
    GT: ">",
    GTE: ">="
  };

  return [`${A} ${OPERATORS[OP]} ${B}`, 0];
};

/* =========================================================
   CONTROLS IF
 ========================================================= */
pythonGenerator.forBlock["controls_if"] = (block: any, generator: any) => {
  const condition = generator.valueToCode(block, "IF0", 0) || "False";
  const branch = generator.blockToCode(block.getInputTargetBlock("DO0"));
  
  // Python needs correct indentation:
  const indentedBranch = branch.trim()
    ? branch.split("\n").map((l: string) => "    " + l).join("\n")
    : "    pass";

  return `if ${condition}:\n${indentedBranch}\n`;
};

/* =========================================================
   UTILITIES
 ========================================================= */
pythonGenerator.valueToCode = function (block: any, name: string) {
  const target = block.getInputTargetBlock(name);
  if (!target) return "";
  const tuple = pythonGenerator.forBlock[target.type]?.(target, pythonGenerator);
  if (!tuple) return "";
  return Array.isArray(tuple) ? tuple[0] : tuple;
};

pythonGenerator.blockToCode = function (block: any): string {
  if (!block) return "";
  const gen = pythonGenerator.forBlock[block.type];
  let code = gen ? gen(block, pythonGenerator) : "";
  if (Array.isArray(code)) {
    code = "";
  }
  const next = block.getNextBlock?.();
  if (next) {
    code += pythonGenerator.blockToCode(next);
  }
  return code as string;
};

pythonGenerator.workspaceToCode = function (workspace: any) {
  declaredVariables.clear();
  declaredPins.clear();

  const topBlocks = workspace.getTopBlocks(true);
  let code = "";
  for (const block of topBlocks) {
    code += pythonGenerator.blockToCode(block);
  }
  return { code, declaredPins };
};
