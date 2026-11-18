/**
 * Permanent Regression Test for simulationSlice boardType Detection & Board Precedence
 */

import { useCircuitStore } from "../lib/store";
import type { CircuitNode } from "../lib/types";

export function runEsp32BoardDetectionTests(): boolean {
  let passed = true;

  const esp32Node: CircuitNode = {
    id: "node_esp32",
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

  // Test (a): ESP32 node alone on canvas -> boardType "esp32"
  useCircuitStore.setState({ nodes: [esp32Node] });
  const detectedSingle = useCircuitStore.getState().detectBoardType();
  const activeBoardSingle = useCircuitStore.getState().activeBoardType;

  if (detectedSingle !== "esp32" || activeBoardSingle !== "esp32") {
    console.error(`FAIL: ESP32 alone expected boardType "esp32", got detected="${detectedSingle}", active="${activeBoardSingle}"`);
    passed = false;
  }

  // Test (b): Precedence order when multiple MCU nodes exist
  const arduinoNode: CircuitNode = {
    id: "node_arduino",
    type: "arduino",
    position: { x: 0, y: 0 },
    data: {
      componentType: "arduino",
      simulationModel: "arduino",
      label: "Arduino Uno R3",
      properties: {},
      rotation: 0,
    },
  };

  const picoNode: CircuitNode = {
    id: "node_pico",
    type: "raspberrypipico",
    position: { x: 0, y: 0 },
    data: {
      componentType: "raspberrypipico",
      simulationModel: "raspberrypipico",
      label: "Raspberry Pi Pico",
      properties: {},
      rotation: 0,
    },
  };

  // Arduino + ESP32 -> Arduino takes precedence (hasArduino ? arduino : ...)
  useCircuitStore.setState({ nodes: [arduinoNode, esp32Node] });
  const detectedArduinoWins = useCircuitStore.getState().detectBoardType();
  if (detectedArduinoWins !== "arduino") {
    console.error(`FAIL: Arduino + ESP32 expected "arduino", got "${detectedArduinoWins}"`);
    passed = false;
  }

  // Pico + ESP32 -> Pico takes precedence (hasPico ? pico : ...)
  useCircuitStore.setState({ nodes: [picoNode, esp32Node] });
  const detectedPicoWins = useCircuitStore.getState().detectBoardType();
  if (detectedPicoWins !== "pico") {
    console.error(`FAIL: Pico + ESP32 expected "pico", got "${detectedPicoWins}"`);
    passed = false;
  }

  return passed;
}

if (require.main === module) {
  const ok = runEsp32BoardDetectionTests();
  if (ok) {
    console.log("✅ All ESP32 board detection tests passed.");
  } else {
    console.error("❌ ESP32 board detection tests failed.");
    process.exit(1);
  }
}
