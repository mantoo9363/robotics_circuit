/**
 * Permanent Regression Test Suite for Multi-Address I2C LCD Support in Pico Simulator
 */

import { getOrCreateSession } from "../lib/codeParsing/picoParser";
import { applyPicoLcdOutputToFrame } from "../lib/simulation/frameTransformers/pico";
import { buildSimulationFrame, type SimulationFrame } from "../lib/simulation-state";
import type { SimContext } from "../lib/simulation/types";
import type { CircuitNode, CircuitEdge } from "../lib/types";

export function runMultiLcdRegressionTests(): boolean {
  console.log("=================== RUNNING MULTI-ADDRESS I2C LCD REGRESSION TESTS ===================\n");

  let allPassed = true;

  // Helper to read DDRAM from LcdState as line1 and line2 strings
  const readLcd = (lcd: any) => {
    if (!lcd) return { l1: "", l2: "" };
    const l1: string[] = [];
    const l2: string[] = [];
    for (let c = 0; c < 16; c++) {
      l1.push(String.fromCharCode(lcd.ddram[c] || 32));
      l2.push(String.fromCharCode(lcd.ddram[0x40 + c] || 32));
    }
    return { l1: l1.join("").trim(), l2: l2.join("").trim() };
  };

  // -----------------------------------------------------------------------------
  // Test A: Single LCD Parity (0x27)
  // -----------------------------------------------------------------------------
  console.log("--- TEST A: Single LCD Parity (Address 0x27) ---");
  const codeSingle = `
from pico_i2c_lcd import I2cLcd
lcd = I2cLcd(None, 0x27, 2, 16)
lcd.clear()
lcd.putstr("Soil: 19218")
`.trim();

  const sessionSingle = getOrCreateSession(codeSingle, 0);
  const lcd0x27_Single = sessionSingle.lcdStates.get(0x27) || sessionSingle.lcdState;
  const readSingle = readLcd(lcd0x27_Single);
  console.log(`[Trace Test A] Line 1 = "${readSingle.l1}" (Expected: "Soil: 19218")`);

  if (readSingle.l1 !== "Soil: 19218") {
    console.error("❌ Test A FAILED");
    allPassed = false;
  } else {
    console.log("=> Test A PASSED\n");
  }

  // -----------------------------------------------------------------------------
  // Test B: Dual LCDs, Two Different Addresses (0x27 & 0x26)
  // -----------------------------------------------------------------------------
  console.log("--- TEST B: Dual LCDs, Two Different Addresses (0x27 & 0x26) ---");
  const codeDual = `
from pico_i2c_lcd import I2cLcd
lcd1 = I2cLcd(None, 0x27, 2, 16)
lcd2 = I2cLcd(None, 0x26, 2, 16)

lcd1.clear()
lcd1.putstr("Gas Sensor: 450")

lcd2.clear()
lcd2.putstr("Dist: 172cm")
`.trim();

  const sessionDual = getOrCreateSession(codeDual, 0);
  const lcd1_Data = readLcd(sessionDual.lcdStates.get(0x27));
  const lcd2_Data = readLcd(sessionDual.lcdStates.get(0x26));

  console.log(`[Trace Test B - 0x27] Line 1 = "${lcd1_Data.l1}" (Expected: "Gas Sensor: 450")`);
  console.log(`[Trace Test B - 0x26] Line 1 = "${lcd2_Data.l1}" (Expected: "Dist: 172cm")`);

  if (lcd1_Data.l1 !== "Gas Sensor: 450" || lcd2_Data.l1 !== "Dist: 172cm") {
    console.error("❌ Test B FAILED");
    allPassed = false;
  } else {
    console.log("=> Test B PASSED\n");
  }

  // -----------------------------------------------------------------------------
  // Test C: Dual LCDs, Same Address Edge Case (0x27 & 0x27)
  // -----------------------------------------------------------------------------
  console.log("--- TEST C: Dual LCDs, Same Address Edge Case (0x27 & 0x27) ---");
  const codeSameAddr = `
from pico_i2c_lcd import I2cLcd
lcdA = I2cLcd(None, 0x27, 2, 16)
lcdB = I2cLcd(None, 0x27, 2, 16)

lcdA.clear()
lcdA.putstr("First Write")

lcdB.move_to(0, 1)
lcdB.putstr("Second Write")
`.trim();

  const sessionSame = getOrCreateSession(codeSameAddr, 0);
  const lcdSame_Data = readLcd(sessionSame.lcdStates.get(0x27));

  console.log(`[Trace Test C - Shared 0x27] Line 1 = "${lcdSame_Data.l1}", Line 2 = "${lcdSame_Data.l2}"`);
  if (lcdSame_Data.l1 !== "First Write" || lcdSame_Data.l2 !== "Second Write") {
    console.error("❌ Test C FAILED");
    allPassed = false;
  } else {
    console.log("=> Test C PASSED\n");
  }

  // -----------------------------------------------------------------------------
  // Test D: Unmatched Canvas LCD Node Address (Code 0x27, Canvas 0x25)
  // -----------------------------------------------------------------------------
  console.log("--- TEST D: Unmatched Canvas LCD Node Address (Code 0x27, Canvas 0x25) ---");
  const dummyPico: CircuitNode = {
    id: "pico1",
    type: "circuitComponent",
    position: { x: -200, y: 0 },
    data: {
      componentType: "raspberrypipico",
      simulationModel: "raspberrypipico",
      label: "Pico",
      rotation: 0,
      properties: {},
    },
  };
  const dummyNodes: CircuitNode[] = [
    dummyPico,
    {
      id: "pico1",
      type: "circuitComponent",
      position: { x: 0, y: 0 },
      data: {
        componentType: "raspberrypipico",
        simulationModel: "raspberrypipico",
        label: "Pico",
        rotation: 0,
        properties: {},
      },
    },
    {
      id: "lcd_node_27",
      type: "circuitComponent",
      position: { x: 0, y: 0 },
      data: {
        componentType: "lcd16x2",
        simulationModel: "lcd16x2",
        label: "LCD 0x27",
        rotation: 0,
        properties: { i2cAddress: { label: "Address", type: "string", value: "0x27" } },
      },
    },
    {
      id: "lcd_node_25",
      type: "circuitComponent",
      position: { x: 0, y: 0 },
      data: {
        componentType: "lcd16x2",
        simulationModel: "lcd16x2",
        label: "LCD 0x25",
        rotation: 0,
        properties: { i2cAddress: { label: "Address", type: "string", value: "0x25" } },
      },
    },
  ];
  // Wire lcd_node_27 (vcc/gnd/sda/scl) to the Pico so it's actually "powered" —
  // Test D is meant to exercise address-matching fallback, not connectivity gating.
  // lcd_node_25 is intentionally left unwired: its expected blank output comes from
  // the address never matching a session lcdState, before isPowered is even checked.
  const dummyEdges: CircuitEdge[] = [
    { id: "e1", source: "lcd_node_27", sourceHandle: "vcc", target: "pico1", targetHandle: "pico_3v3" },
    { id: "e2", source: "lcd_node_27", sourceHandle: "gnd", target: "pico1", targetHandle: "gnd" },
    { id: "e3", source: "lcd_node_27", sourceHandle: "sda", target: "pico1", targetHandle: "gp4" },
    { id: "e4", source: "lcd_node_27", sourceHandle: "scl", target: "pico1", targetHandle: "gp5" },
    { id: "e5", source: "lcd_node_25", sourceHandle: "vcc", target: "pico1", targetHandle: "pico_3v3" },
    { id: "e6", source: "lcd_node_25", sourceHandle: "gnd", target: "pico1", targetHandle: "gnd" },
    { id: "e7", source: "lcd_node_25", sourceHandle: "sda", target: "pico1", targetHandle: "gp4" },
    { id: "e8", source: "lcd_node_25", sourceHandle: "scl", target: "pico1", targetHandle: "gp5" },
  ];

  const initialFrame = buildSimulationFrame({
    tick: 0,
    timestamp: 0,
    running: true,
    boardType: "pico",
    nodes: dummyNodes,
    edges: dummyEdges,
  });

  const context = {
    nodes: dummyNodes,
    edges: dummyEdges,
    picoCode: codeSingle,
  } as any as SimContext;

  let transformedFrame: SimulationFrame | null = null;
  try {
    transformedFrame = applyPicoLcdOutputToFrame(initialFrame, context);
  } catch (e: any) {
    console.error("❌ Test D Threw Error:", e);
    allPassed = false;
  }

  const comp27 = transformedFrame?.components["lcd_node_27"];
  const comp25 = transformedFrame?.components["lcd_node_25"];
  const comp27Line1 = String(comp27?.telemetry?.line1 ?? "").trim();
  const comp25Line1 = String(comp25?.telemetry?.line1 ?? "").trim();
  console.log(`[Trace Test D - Node 0x27 Line 1] = "${comp27Line1}" (Expected: "Soil: 19218")`);
  console.log(`[Trace Test D - Node 0x25 Line 1] = "${comp25Line1}" (Expected: "" / blank fallback)`);

  if (comp27Line1 !== "Soil: 19218" || comp25Line1 !== "") {
    console.error("❌ Test D FAILED");
    allPassed = false;
  } else {
    console.log("=> Test D PASSED\n");
  }

  // -----------------------------------------------------------------------------
  // Test E: Explicit Telemetry Error on Address Mismatch (Code 0x25, Canvas 0x27)
  // -----------------------------------------------------------------------------
  console.log("--- TEST E: Explicit Telemetry Error on Address Mismatch (Code 0x25, Canvas 0x27) ---");
  const codeMismatch = `
from pico_i2c_lcd import I2cLcd
lcd = I2cLcd(None, 0x25, 2, 16)
lcd.clear()
lcd.putstr("Mismatch Text")
`.trim();

  const contextMismatch = {
    nodes: dummyNodes,
    edges: dummyEdges,
    picoCode: codeMismatch,
  } as any as SimContext;

  let frameMismatch: SimulationFrame | null = null;
  try {
    frameMismatch = applyPicoLcdOutputToFrame(initialFrame, contextMismatch);
  } catch (e: any) {
    console.error("❌ Test E Threw Error:", e);
    allPassed = false;
  }

  const comp27Mismatch = frameMismatch?.components["lcd_node_27"];
  const err27 = String(comp27Mismatch?.telemetry?.error ?? "");
  console.log(`[Trace Test E - Node 0x27 Error] = "${err27}"`);

  if (!err27.includes("Address Mismatch")) {
    console.error("❌ Test E FAILED: Expected Address Mismatch error in telemetry");
    allPassed = false;
  } else {
    console.log("=> Test E PASSED\n");
  }

  console.log("=================== MULTI-ADDRESS I2C LCD REGRESSION TESTS COMPLETE ===================");
  return allPassed;
}

if (require.main === module) {
  const ok = runMultiLcdRegressionTests();
  if (ok) {
    console.log("✅ All multi-address I2C LCD regression tests passed 100%.");
  } else {
    console.error("❌ Some multi-address I2C LCD regression tests failed.");
    process.exit(1);
  }
}
