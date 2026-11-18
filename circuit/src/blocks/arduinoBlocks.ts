import * as Blockly from "blockly";

Blockly.defineBlocksWithJsonArray([
  {
    type: "digital_write",
    message0: "set pin %1 to %2",
    args0: [
      {
        type: "field_number",
        name: "PIN",
        value: 13,
      },
      {
        type: "field_dropdown",
        name: "STATE",
        options: [
          ["HIGH", "HIGH"],
          ["LOW", "LOW"],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 230,
  },
  {
    type: "analog_read",
    message0: "read analog pin %1",
    args0: [
      {
        type: "field_input",
        name: "PIN",
        text: "A0",
      },
    ],
    output: "Number",
    colour: 120,
  },
]);