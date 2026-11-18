import * as Blockly from "blockly";

export const arduinoGenerator: any = {
  ORDER_ATOMIC: 0,
};

arduinoGenerator.forBlock = {};

/* =========================================================
   GLOBAL VARIABLES
========================================================= */

const declaredVariables = new Set<string>();

/* =========================================================
   VARIABLES GET
========================================================= */

arduinoGenerator.forBlock["variables_get"] =
(block: any) => {

  const varModel =
    block.workspace.getVariableById(
      block.getFieldValue("VAR")
    );

  const variable =
    varModel
      ? varModel.name
      : block.getFieldValue("VAR");

  return [variable, 0];
};



/* =========================================================
   VARIABLES SET
========================================================= */

arduinoGenerator.forBlock["variables_set"] =
(block: any, generator: any) => {

  const varModel =
    block.workspace.getVariableById(
      block.getFieldValue("VAR")
    );

  const variable =
    varModel
      ? varModel.name
      : block.getFieldValue("VAR");

  const value =
    generator.valueToCode(
      block,
      "VALUE",
      0
    ) || "0";

  let code = "";

  if (!declaredVariables.has(variable)) {

    declaredVariables.add(variable);

    code += `int ${variable} = 0;\n`;
  }

  code += `${variable} = ${value};\n`;

  return code;
};

/* =========================================================
   MATH NUMBER
========================================================= */

arduinoGenerator.forBlock["math_number"] =
(block: any) => {

  return [
    block.getFieldValue("NUM"),
    0
  ];
};

/* =========================================================
   TEXT
========================================================= */

arduinoGenerator.forBlock["text"] =
(block: any) => {

  return [
    `"${block.getFieldValue("TEXT")}"`,
    0
  ];
};

/* =========================================================
   HIGH LOW
========================================================= */

arduinoGenerator.forBlock["high_low"] =
(block: any) => {

  const state =
    block.getFieldValue("STATE");

  return [state, 0];
};

/* =========================================================
   ANALOG PIN
========================================================= */

arduinoGenerator.forBlock["analog_pin"] =
(block: any) => {

  return [
    block.getFieldValue("PIN"),
    0
  ];
};

/* =========================================================
   DIGITAL PIN
========================================================= */

arduinoGenerator.forBlock["digital_pin"] =
(block: any) => {

  return [
    block.getFieldValue("PIN"),
    0
  ];
};

/* =========================================================
   ANALOG READ
========================================================= */

arduinoGenerator.forBlock["analog_read"] =
(block: any, generator: any) => {

  const pin =
    generator.valueToCode(
      block,
      "PIN",
      0
    ) || "A0";

  return [
    `analogRead(${pin})`,
    0
  ];
};

/* =========================================================
   SERIAL PRINT
========================================================= */

arduinoGenerator.forBlock["serial_print"] =
(block: any, generator: any) => {

  const text =
    generator.valueToCode(
      block,
      "TEXT",
      0
    ) || '""';

  return `
Serial.println(${text});
`;
};

/* =========================================================
   SET PIN
========================================================= */

arduinoGenerator.forBlock["set_pin"] =
(block: any, generator: any) => {

  const pin =
    generator.valueToCode(
      block,
      "PIN",
      0
    ) || "13";

  const state =
    generator.valueToCode(
      block,
      "STATE",
      0
    ) || "HIGH";

  return `
pinMode(${pin}, OUTPUT);
digitalWrite(${pin}, ${state});
`;
};

/* =========================================================
   BUILTIN LED
========================================================= */

arduinoGenerator.forBlock["builtin_led"] =
(block: any) => {

  const state =
    block.getFieldValue("STATE");

  return `
digitalWrite(13, ${state});
`;
};

/* =========================================================
   ANALOG WRITE
========================================================= */

arduinoGenerator.forBlock["analog_write"] =
(block: any, generator: any) => {

  const pin =
    generator.valueToCode(
      block,
      "PIN",
      0
    ) || "0";

  const value =
    generator.valueToCode(
      block,
      "VALUE",
      0
    ) || "0";

  return `
analogWrite(${pin}, ${value});
`;
};

/* =========================================================
   DELAY
========================================================= */

arduinoGenerator.forBlock["delay_ms"] =
(block: any, generator: any) => {

  const ms =
    generator.valueToCode(
      block,
      "MS",
      0
    ) || "1000";

  return `
delay(${ms});
`;
};

/* =========================================================
   SERVO WRITE
========================================================= */

arduinoGenerator.forBlock["servo_write"] =
(block: any, generator: any) => {

  const pin =
    generator.valueToCode(
      block,
      "PIN",
      0
    ) || "9";

  const angle =
    generator.valueToCode(
      block,
      "ANGLE",
      0
    ) || "90";

  return `
servo.attach(${pin});
servo.write(${angle});
`;
};

/* =========================================================
   LOGIC COMPARE
========================================================= */

arduinoGenerator.forBlock["logic_compare"] =
(block: any, generator: any) => {

  const A =
    generator.valueToCode(
      block,
      "A",
      0
    ) || "0";

  const B =
    generator.valueToCode(
      block,
      "B",
      0
    ) || "0";

  const OP =
    block.getFieldValue("OP");

  const OPERATORS: any = {
    EQ: "==",
    NEQ: "!=",
    LT: "<",
    LTE: "<=",
    GT: ">",
    GTE: ">="
  };

  return [
    `${A} ${OPERATORS[OP]} ${B}`,
    0
  ];
};

/* =========================================================
   CONTROLS IF
========================================================= */

arduinoGenerator.forBlock["controls_if"] =
(block: any, generator: any) => {

  const condition =
    generator.valueToCode(
      block,
      "IF0",
      0
    ) || "false";

  const branch =
    generator.blockToCode(
      block.getInputTargetBlock("DO0")
    );

  return `
if (${condition}) {

${branch}

}
`;
};

/* =========================================================
   VALUE TO CODE
========================================================= */

arduinoGenerator.valueToCode =
function (
  block: any,
  name: string
) {

  const target =
    block.getInputTargetBlock(name);

  if (!target) return "";

  const tuple =
    arduinoGenerator.forBlock[
      target.type
    ]?.(
      target,
      arduinoGenerator
    );

  if (!tuple) return "";

  return Array.isArray(tuple)
    ? tuple[0]
    : tuple;
};

/* =========================================================
   BLOCK TO CODE
========================================================= */

arduinoGenerator.blockToCode =
function (block: any): string {

  if (!block) return "";

  const gen =
    arduinoGenerator.forBlock[
      block.type
    ];

  let code =
    gen
      ? gen(block, arduinoGenerator)
      : "";

  if (Array.isArray(code)) {
    code = "";
  }

  const next =
    block.getNextBlock?.();

  if (next) {
    code +=
      arduinoGenerator.blockToCode(
        next
      );
  }

  return code as string;
};

/* =========================================================
   WORKSPACE TO CODE
========================================================= */

arduinoGenerator.workspaceToCode =
function (workspace: any) {

  declaredVariables.clear();

  const topBlocks =
    workspace.getTopBlocks(true);

  let code = "";

  for (const block of topBlocks) {

    code +=
      arduinoGenerator.blockToCode(
        block
      );
  }

  return code;
};
