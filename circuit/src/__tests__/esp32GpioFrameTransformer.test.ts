/**
 * Test Suite for ESP32 GPIO Frame Transformer
 * Asserts logic voltage is 3.3V (NOT 5V) on output pin handle endpoint.
 */

import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import type { CircuitNode } from "../lib/types";

export function runEsp32GpioFrameTransformerTests(): boolean {
  let passed = true;

  const esp32Node: CircuitNode = {
    id: "esp32_1",
    type: "esp32",
    position: { x: 0, y: 0 },
    data: {
      componentType: "esp32",
      simulationModel: "esp32",
      label: "ESP32 DevKit V1",
      properties: {},
      rotation: 0,
    },
  };

  const initialFrame: any = {
    running: true,
    tick: 1,
    timestamp: 100,
    boardType: "esp32",
    boardPins: [],
    components: {},
    nodes: [esp32Node],
    edges: [],
  };

  const context: any = {
    nodes: [esp32Node],
    edges: [],
    arduinoCode: "void setup() { pinMode(2, OUTPUT); digitalWrite(2, HIGH); }",
    picoCode: "",
    boardType: "esp32",
    dynamicComponents: [],
  };

  const outputFrame = applyEsp32SimulationToFrame(initialFrame, context);
  const esp32Comp = outputFrame.components["esp32_1"];

  if (!esp32Comp) {
    console.error("FAIL: ESP32 component state missing from output frame components!");
    return false;
  }

  const pin2State = esp32Comp.pins?.["gpio2"];

  if (!pin2State) {
    console.error("FAIL: gpio2 pin state missing from ESP32 component pins!", esp32Comp);
    passed = false;
  } else if (pin2State.voltage !== 3.3) {
    console.error(`FAIL: ESP32 GPIO2 voltage expected 3.3V, but got ${pin2State.voltage}V! (MUST NOT BE 5V)`, pin2State);
    passed = false;
  } else {
    console.log(`[PASS] ESP32 GPIO2 output voltage correctly verified as 3.3V logic level.`);
  }

  return passed;
}

if (require.main === module) {
  const ok = runEsp32GpioFrameTransformerTests();
  if (ok) {
    console.log("✅ All ESP32 GPIO Frame Transformer tests passed.");
  } else {
    console.error("❌ ESP32 GPIO Frame Transformer tests failed.");
    process.exit(1);
  }
}
