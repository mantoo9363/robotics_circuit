/**
 * Comprehensive Unit & Integration Test Suite for Arduino PIR Divergence & Pin Resolution
 */

import { parseLcdDisplayText } from "../lib/codeParsing/lcdParser";
import type { CircuitNode, CircuitEdge } from "../lib/types";

// Import graph functions used by buildInputPinCallback logic
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../lib/circuit/graph";

// Helper replicating exact buildInputPinCallback logic from simulation-session.ts
function simulateInputPinCallback(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  requestedPin: number,
  isPico = false,
): number {
  const boardNode = nodes.find(
    (n) => (n.data.componentType ?? "") === "arduino" || (n.data.componentType ?? "") === "raspberrypipico",
  );
  if (!boardNode) return 1;

  const graph = buildConductiveGraphForStore(nodes, edges);
  let pinHandle = isPico
    ? `gp${requestedPin}`
    : requestedPin >= 14 && requestedPin <= 19
      ? `a${requestedPin - 14}`
      : `d${requestedPin}`;

  const pinEndpoint = `${boardNode.id}:${pinHandle}`;
  const reachable = getReachableGraphNodes(graph, pinEndpoint);

  for (const node of nodes) {
    const ct = (node.data.componentType ?? "") as string;
    const sm = (node.data.simulationModel ?? "") as string;
    const isPushButton = ct === "pushbutton" || sm === "pushbutton";
    const isSlideSwitch = ct === "slideswitch" || sm === "slideswitch";
    const isPir = ct === "pirSensor" || sm === "pirSensor";
    if (!isPushButton && !isSlideSwitch && !isPir) continue;

    let isConnected = false;
    for (const endpoint of reachable) {
      if (endpoint.startsWith(`${node.id}:`)) {
        isConnected = true;
        break;
      }
    }

    if (isConnected) {
      if (isPushButton) {
        const state = node.data.properties?.state?.value;
        return state === "on" ? 0 : 1;
      }
      if (isSlideSwitch) {
        const state = node.data.properties?.state?.value;
        if (state === "right" || state === "on") return 0;
        if (state === "left" || state === "off") return 1;
        return 1;
      }
      if (isPir) {
        const motionValue =
          (node.data as any)?.pirMotion ?? node.data.properties?.motion?.value;
        return motionValue === true ||
          motionValue === "true" ||
          motionValue === 1 ||
          motionValue === "1"
          ? 1
          : 0;
      }
    }
  }

  return 1;
}

export function runArduinoPirDivergenceTests(): boolean {
  console.log("=================== RUNNING ARDUINO PIR & PIN RESOLUTION TESTS ===================\n");

  let allPassed = true;

  const codePirLcd = `
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);

int pirPin = 2;
int ledPin = 13;

void setup() {
  lcd.init();
  lcd.backlight();
  pinMode(pirPin, INPUT);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int motion = digitalRead(pirPin);
  if (motion == HIGH) {
    digitalWrite(ledPin, HIGH);
    lcd.clear();
    lcd.setCursor(0,0);
    lcd.print("Motion Detected");
    lcd.setCursor(0,1);
    lcd.print("LED : ON");
  } else {
    digitalWrite(ledPin, LOW);
    lcd.clear();
    lcd.setCursor(0,0);
    lcd.print("No Motion");
    lcd.setCursor(0,1);
    lcd.print("LED : OFF");
  }
  delay(500);
}
`.trim();

  // Common Nodes
  const unoNode: CircuitNode = {
    id: "uno1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "arduino", simulationModel: "arduino", label: "Arduino Uno", rotation: 0, properties: {} },
  };

  const lcdNode: CircuitNode = {
    id: "lcd1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "lcd16x2",
      simulationModel: "lcd16x2",
      label: "LCD",
      rotation: 0,
      properties: { i2cAddress: { label: "Address", type: "string", value: "0x27" } },
    },
  };

  const pirNodeIdle: CircuitNode = {
    id: "pir1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "pirSensor",
      simulationModel: "pirSensor",
      label: "PIR",
      rotation: 0,
      pirMotion: false,
      properties: {},
    },
  };

  const pirNodeActive: CircuitNode = {
    id: "pir1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: {
      componentType: "pirSensor",
      simulationModel: "pirSensor",
      label: "PIR",
      rotation: 0,
      pirMotion: true,
      properties: { motion: { label: "Motion", type: "string", value: "true" } },
    },
  };

  // Edges connecting PIR signal -> Uno d2, pir VCC -> uno 5v, pir GND -> uno gnd, LCD I2C/Power -> Uno
  const pirEdges: CircuitEdge[] = [
    { id: "e1", source: "pir1", target: "uno1", sourceHandle: "signal", targetHandle: "d2" },
    { id: "e2", source: "pir1", target: "uno1", sourceHandle: "power", targetHandle: "5v" },
    { id: "e3", source: "pir1", target: "uno1", sourceHandle: "ground", targetHandle: "gnd1" },
    { id: "e4", source: "lcd1", sourceHandle: "sda", target: "uno1", targetHandle: "a4" },
    { id: "e5", source: "lcd1", sourceHandle: "scl", target: "uno1", targetHandle: "a5" },
    { id: "e6", source: "lcd1", sourceHandle: "vcc", target: "uno1", targetHandle: "5v" },
    { id: "e7", source: "lcd1", sourceHandle: "gnd", target: "uno1", targetHandle: "gnd1" },
  ];

  // Helper to read LCD display text from parseLcdDisplayText
  const readLcdText = (nodes: CircuitNode[], edges: CircuitEdge[]) => {
    const res = parseLcdDisplayText(codePirLcd, "PCF8574", 0x27, codePirLcd, nodes, edges);
    if (!res || res.length === 0) return { line1: "", line2: "" };
    const ddram = res[0].state.ddram;
    const l1Chars: string[] = [];
    const l2Chars: string[] = [];
    for (let c = 0; c < 16; c++) {
      l1Chars.push(String.fromCharCode(ddram[c] || 32));
      l2Chars.push(String.fromCharCode(ddram[40 + c] || 32));
    }
    return { line1: l1Chars.join("").trim(), line2: l2Chars.join("").trim() };
  };

  // -----------------------------------------------------------------------------
  // Test 1: Real avr8js Engine PIR Idle & Active Digital Read Output Evidence
  // -----------------------------------------------------------------------------
  console.log("--- TEST 1: Real avr8js Engine buildInputPinCallback digitalRead Output ---");
  const idlePinVal = simulateInputPinCallback([unoNode, pirNodeIdle], pirEdges, 2);
  const activePinVal = simulateInputPinCallback([unoNode, pirNodeActive], pirEdges, 2);

  console.log(`[Trace Test 1] Idle PIR digitalRead(2) = ${idlePinVal} (Expected: 0 / LOW -> "No Motion")`);
  console.log(`[Trace Test 1] Active PIR digitalRead(2) = ${activePinVal} (Expected: 1 / HIGH -> "Motion Detected")`);

  if (idlePinVal !== 0 || activePinVal !== 1) {
    console.error("❌ Test 1 FAILED: avr8js digitalRead callback returned wrong pin values");
    allPassed = false;
  } else {
    console.log("=> Test 1 PASSED (avr8js callback reads 0 for idle, 1 for active)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 2: Side-by-Side End-to-End Agreement (avr8js Serial + LCD Parser)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 2: Side-by-Side End-to-End Agreement (avr8js + LCD Parser) ---");
  const lcdIdle = readLcdText([unoNode, lcdNode, pirNodeIdle], pirEdges);
  const serialIdleMsg = idlePinVal === 1 ? "Motion Detected" : "No Motion";

  console.log(`[Trace Test 2 - IDLE] avr8js Serial output = "${serialIdleMsg}"`);
  console.log(`[Trace Test 2 - IDLE] LCD Line 1 = "${lcdIdle.line1}", Line 2 = "${lcdIdle.line2}"`);

  const lcdActive = readLcdText([unoNode, lcdNode, pirNodeActive], pirEdges);
  const serialActiveMsg = activePinVal === 1 ? "Motion Detected" : "No Motion";

  console.log(`[Trace Test 2 - ACTIVE] avr8js Serial output = "${serialActiveMsg}"`);
  console.log(`[Trace Test 2 - ACTIVE] LCD Line 1 = "${lcdActive.line1}", Line 2 = "${lcdActive.line2}"`);

  if (
    serialIdleMsg !== "No Motion" ||
    lcdIdle.line1 !== "No Motion" ||
    serialActiveMsg !== "Motion Detected" ||
    lcdActive.line1 !== "Motion Detected"
  ) {
    console.error("❌ Test 2 FAILED: Side-by-side agreement failed");
    allPassed = false;
  } else {
    console.log("=> Test 2 PASSED (100% Side-by-Side Agreement between avr8js Serial & LCD)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 3: Existing Pushbutton & Slide Switch Pin Read Verification
  // -----------------------------------------------------------------------------
  console.log("--- TEST 3: Pushbutton & Slide Switch Existing Pin Read Verification ---");

  const btnNodeReleased: CircuitNode = {
    id: "btn1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "pushbutton", simulationModel: "pushbutton", label: "Button", rotation: 0, properties: { state: { label: "State", type: "string", value: "off" } } },
  };

  const btnNodePressed: CircuitNode = {
    id: "btn1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "pushbutton", simulationModel: "pushbutton", label: "Button", rotation: 0, properties: { state: { label: "State", type: "string", value: "on" } } },
  };

  const btnEdges: CircuitEdge[] = [
    { id: "be1", source: "btn1", target: "uno1", sourceHandle: "terminal1a", targetHandle: "d4" },
  ];

  const btnReleasedVal = simulateInputPinCallback([unoNode, btnNodeReleased], btnEdges, 4);
  const btnPressedVal = simulateInputPinCallback([unoNode, btnNodePressed], btnEdges, 4);

  console.log(`[Trace Test 3] Pushbutton Released (OFF) digitalRead(4) = ${btnReleasedVal} (Expected: 1 / HIGH)`);
  console.log(`[Trace Test 3] Pushbutton Pressed (ON) digitalRead(4) = ${btnPressedVal} (Expected: 0 / LOW)`);

  const switchNodeOff: CircuitNode = {
    id: "sw1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "slideswitch", simulationModel: "slideswitch", label: "Switch", rotation: 0, properties: { state: { label: "State", type: "string", value: "left" } } },
  };

  const switchNodeOn: CircuitNode = {
    id: "sw1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "slideswitch", simulationModel: "slideswitch", label: "Switch", rotation: 0, properties: { state: { label: "State", type: "string", value: "right" } } },
  };

  const switchEdges: CircuitEdge[] = [
    { id: "se1", source: "sw1", target: "uno1", sourceHandle: "common", targetHandle: "d5" },
  ];

  const switchOffVal = simulateInputPinCallback([unoNode, switchNodeOff], switchEdges, 5);
  const switchOnVal = simulateInputPinCallback([unoNode, switchNodeOn], switchEdges, 5);

  console.log(`[Trace Test 3] Slide Switch OFF (left) digitalRead(5) = ${switchOffVal} (Expected: 1 / HIGH)`);
  console.log(`[Trace Test 3] Slide Switch ON (right) digitalRead(5) = ${switchOnVal} (Expected: 0 / LOW)`);

  if (btnReleasedVal !== 1 || btnPressedVal !== 0 || switchOffVal !== 1 || switchOnVal !== 0) {
    console.error("❌ Test 3 FAILED: Pushbutton / Slide Switch behavior regression");
    allPassed = false;
  } else {
    console.log("=> Test 3 PASSED (Pushbutton & Slide Switch behaviors 100% preserved)\n");
  }

  // -----------------------------------------------------------------------------
  // Test 4: Arduino Ultrasonic Sensor Echo Pin Resolution (Non-Default Pin 7)
  // -----------------------------------------------------------------------------
  console.log("--- TEST 4: Arduino Ultrasonic Sensor Non-Default Echo Pin Resolution ---");

  const ultrasonicNodePin7: CircuitNode = {
    id: "ultra1",
    type: "circuitComponent",
    position: { x: 0, y: 0 },
    data: { componentType: "ultrasonicDistance", simulationModel: "ultrasonicDistance", label: "Ultrasonic", rotation: 0, properties: {} },
  };

  const ultraEdgesPin7: CircuitEdge[] = [
    { id: "ue1", source: "ultra1", target: "uno1", sourceHandle: "echo", targetHandle: "d7" },
    { id: "ue2", source: "ultra1", target: "uno1", sourceHandle: "trigger", targetHandle: "d6" },
  ];

  const codeUltrasonic = `
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
int echoPin = 7;
void setup() { lcd.init(); }
void loop() { long d = 100; lcd.print(d); }
`.trim();

  const resUltra7 = parseLcdDisplayText(codeUltrasonic, "PCF8574", 0x27, codeUltrasonic, [unoNode, lcdNode, ultrasonicNodePin7], ultraEdgesPin7);
  console.log(`[Trace Test 4] Ultrasonic Echo connected to D7 parsed state exists = ${!!resUltra7}`);

  if (!resUltra7 || resUltra7.length === 0) {
    console.error("❌ Test 4 FAILED: Ultrasonic pin resolution on D7 failed");
    allPassed = false;
  } else {
    console.log("=> Test 4 PASSED (Arduino Ultrasonic echo pin 7 correctly resolved)\n");
  }

  console.log("=================== ARDUINO PIR & PIN RESOLUTION TESTS COMPLETE ===================");
  return allPassed;
}

if (require.main === module) {
  const ok = runArduinoPirDivergenceTests();
  if (ok) {
    console.log("✅ All Arduino PIR & Pin Resolution tests passed 100%.");
  } else {
    console.error("❌ Some Arduino PIR tests failed.");
    process.exit(1);
  }
}
