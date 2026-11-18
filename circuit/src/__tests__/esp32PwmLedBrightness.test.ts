/**
 * esp32PwmLedBrightness.test.ts
 *
 * Regression test suite verifying that PWM-driven discrete LEDs are modeled
 * using peak pulse voltage (gating diode forward voltage Vf) with visual brightness
 * and current scaled by duty cycle.
 *
 * Prevents regression where duty-averaged DC voltage was compared against Vf, causing:
 * - Red LEDs to stay dark below ~61% duty
 * - Blue/White LEDs to stay dark below ~91% duty
 * - Spurious "Insufficient Voltage" warning modals
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { buildSimulationFrame } from "../lib/simulation-state";
import { checkComponentStatus } from "../utils/componentStatus";
import type { CircuitNode, CircuitEdge } from "../lib/types";

function createNode(id: string, type: string, label: string, properties: Record<string, any> = {}): CircuitNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      componentType: type,
      label,
      rotation: 0,
      properties,
    },
  } as CircuitNode;
}

describe("PWM-Driven LED Peak-Voltage & Brightness Proportionality", () => {
  it("ESP32: Red LED glows proportionally across 10% -> 100% duty without Insufficient Voltage", () => {
    const espNode = createNode("esp-1", "esp32", "ESP32");
    const resNode = createNode("res-1", "resistor", "220Ω", {
      resistance: { label: "Resistance", type: "number", value: 220 },
    });
    const ledNode = createNode("led-1", "led", "Red LED", {
      color: { label: "Color", type: "string", value: "red" },
    });
    const edges: CircuitEdge[] = [
      { id: "e1", source: "esp-1", sourceHandle: "gpio25", target: "res-1", targetHandle: "pin1" },
      { id: "e2", source: "res-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" },
      { id: "e3", source: "led-1", sourceHandle: "cathode", target: "esp-1", targetHandle: "esp32_gnd1" },
    ];
    const nodes = [espNode, resNode, ledNode];

    let prevBrightness = 0;
    const dutyLevels = [10, 25, 50, 75, 100];

    for (const duty of dutyLevels) {
      const code = `
void setup() { pinMode(25, OUTPUT); }
void loop() { analogWrite(25, ${Math.round((duty / 100) * 255)}); }
`;
      const frame0 = buildSimulationFrame({ tick: 1, nodes, edges, dynamicComponents: [], boardType: "esp32", running: true });
      const ctx = { nodes, edges, arduinoCode: code, picoCode: "", dynamicComponents: [], boardType: "esp32", selectedLanguage: "cpp" };
      const frame = applyEsp32SimulationToFrame(frame0, ctx as any);
      const ledComp = frame.components["led-1"];

      assert(ledComp, `LED component must exist at duty ${duty}%`);
      assert.strictEqual(ledComp.isPowered, true, `LED must be powered at duty ${duty}%`);
      assert(Number(ledComp.brightness) > prevBrightness, `Brightness at ${duty}% (${ledComp.brightness}) must be > previous (${prevBrightness})`);
      assert(Number(ledComp.telemetry?.currentMilliAmps ?? 0) > 0, `Current must be > 0 at duty ${duty}%`);

      const status = checkComponentStatus(
        "led",
        { ...ledComp.telemetry, isPowered: ledComp.isPowered, voltage: ledComp.voltage },
        ledNode.data.properties,
      );
      assert.notStrictEqual(
        status.message,
        "Insufficient Voltage",
        `Must NOT trigger Insufficient Voltage warning at duty ${duty}%`,
      );

      prevBrightness = Number(ledComp.brightness);
    }
  });

  it("ESP32: Blue LED (high Vf ~3.0V) lights up and scales brightness even at 10% and 50% duty", () => {
    const espNode = createNode("esp-1", "esp32", "ESP32");
    const resNode = createNode("res-1", "resistor", "220Ω", {
      resistance: { label: "Resistance", type: "number", value: 220 },
    });
    const ledNode = createNode("led-1", "led", "Blue LED", {
      color: { label: "Color", type: "string", value: "blue" },
    });
    const edges: CircuitEdge[] = [
      { id: "e1", source: "esp-1", sourceHandle: "gpio25", target: "res-1", targetHandle: "pin1" },
      { id: "e2", source: "res-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" },
      { id: "e3", source: "led-1", sourceHandle: "cathode", target: "esp-1", targetHandle: "esp32_gnd1" },
    ];
    const nodes = [espNode, resNode, ledNode];

    const code = `
void setup() { pinMode(25, OUTPUT); }
void loop() { analogWrite(25, 128); }
`;
    const frame0 = buildSimulationFrame({ tick: 1, nodes, edges, dynamicComponents: [], boardType: "esp32", running: true });
    const ctx = { nodes, edges, arduinoCode: code, picoCode: "", dynamicComponents: [], boardType: "esp32", selectedLanguage: "cpp" };
    const frame = applyEsp32SimulationToFrame(frame0, ctx as any);
    const ledComp = frame.components["led-1"];

    assert(ledComp);
    assert.strictEqual(ledComp.isPowered, true, "Blue LED must be powered at 50% duty");
    assert(Number(ledComp.brightness ?? 0) > 0.02, `Blue LED brightness (${ledComp.brightness}) must be > 0.02 at 50% duty`);

    const status = checkComponentStatus(
      "led",
      { ...ledComp.telemetry, isPowered: ledComp.isPowered, voltage: ledComp.voltage },
      ledNode.data.properties,
    );
    assert.notStrictEqual(status.message, "Insufficient Voltage");
  });

  it("Arduino: PWM-driven LED conducts and scales brightness monotonically without Insufficient Voltage", () => {
    const ardNode = createNode("ard-1", "arduino", "Arduino Uno");
    const resNode = createNode("res-1", "resistor", "220Ω", {
      resistance: { label: "Resistance", type: "number", value: 220 },
    });
    const ledNode = createNode("led-1", "led", "Red LED", {
      color: { label: "Color", type: "string", value: "red" },
    });
    const edges: CircuitEdge[] = [
      { id: "e1", source: "ard-1", sourceHandle: "d9", target: "res-1", targetHandle: "pin1" },
      { id: "e2", source: "res-1", sourceHandle: "pin2", target: "led-1", targetHandle: "anode" },
      { id: "e3", source: "led-1", sourceHandle: "cathode", target: "ard-1", targetHandle: "gnd1" },
    ];
    const nodes = [ardNode, resNode, ledNode];

    let prevBrightness = 0;
    for (const duty of [10, 25, 50, 75, 100]) {
      const val = Math.round((duty / 100) * 255);
      const arduinoState = {
        pins: new Map([[9, { mode: "OUTPUT" as const, value: val }]]),
        serialOutput: [],
        running: true,
        error: null,
      };
      const frame = buildSimulationFrame({
        tick: 1,
        nodes,
        edges,
        dynamicComponents: [],
        boardType: "arduino",
        arduinoState,
        running: true,
      });
      const ledComp = frame.components["led-1"];

      assert(ledComp);
      assert.strictEqual(ledComp.isPowered, true, `Arduino LED must be powered at duty ${duty}%`);
      assert(Number(ledComp.brightness) > prevBrightness, `Brightness at ${duty}% (${ledComp.brightness}) must be > previous (${prevBrightness})`);

      const status = checkComponentStatus(
        "led",
        { ...ledComp.telemetry, isPowered: ledComp.isPowered, voltage: ledComp.voltage },
        ledNode.data.properties,
      );
      assert.notStrictEqual(status.message, "Insufficient Voltage");
      prevBrightness = Number(ledComp.brightness);
    }
  });
});
