/**
  * Permanent Regression Test for ESP32 BoardAdapter & Pin Catalog Rules
  */

import { Esp32BoardAdapter, findMCUBoardNode, getBoardAdapter } from "../lib/circuit/boardAdapter";
import type { CircuitNode } from "../lib/types";

export function runEsp32BoardAdapterTests(): boolean {
  let passed = true;
  const adapter = new Esp32BoardAdapter();

  // Test 1: Valid GPIO pins parsing
  const checkGpio2 = adapter.parseHandleToPinNumber("gpio2");
  if (!(checkGpio2?.boardType === "esp32" && checkGpio2?.pinNumber === 2 && checkGpio2?.handleId === "gpio2" && checkGpio2?.isAnalogChannel === true)) {
    console.error("FAIL: ESP32 gpio2 parsing failed", checkGpio2);
    passed = false;
  }

  const checkGpio39 = adapter.parseHandleToPinNumber("gpio39");
  if (!(checkGpio39?.boardType === "esp32" && checkGpio39?.pinNumber === 39 && checkGpio39?.isAnalogChannel === true)) {
    console.error("FAIL: ESP32 gpio39 parsing failed", checkGpio39);
    passed = false;
  }

  const checkGp23 = adapter.parseHandleToPinNumber("gp23");
  if (!(checkGp23?.boardType === "esp32" && checkGp23?.pinNumber === 23 && checkGp23?.isAnalogChannel === false)) {
    console.error("FAIL: ESP32 gp23 parsing failed", checkGp23);
    passed = false;
  }

  // Test 2: Reserved internal SPI flash memory pins (GPIO6-11) MUST return null
  for (let pin = 6; pin <= 11; pin++) {
    const res = adapter.parseHandleToPinNumber(`gpio${pin}`);
    if (res !== null) {
      console.error(`FAIL: Reserved SPI flash pin gpio${pin} did not return null!`, res);
      passed = false;
    }
  }

  // Test 3: Invalid & out-of-range pins return null
  const invalidHandles = [null, undefined, "", "gpio40", "gpio-1", "invalid_pin"];
  for (const handle of invalidHandles) {
    const res = adapter.parseHandleToPinNumber(handle);
    if (res !== null) {
      console.error(`FAIL: Invalid handle "${handle}" did not return null`, res);
      passed = false;
    }
  }

  // Test 4: Reachable pin resolution bypassing reserved pins 6-11
  const reachable = new Set<string>(["esp32_1:gpio6", "esp32_1:gpio14"]);
  const reachablePin = adapter.getReachablePinNumber("esp32_1", reachable);
  if (reachablePin !== 14) {
    console.error(`FAIL: Reachable pin expected 14, got ${reachablePin}`);
    passed = false;
  }

  // Test 5: findMCUBoardNode and getBoardAdapter
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

  const foundNode = findMCUBoardNode([esp32Node]);
  if (foundNode !== esp32Node) {
    console.error("FAIL: findMCUBoardNode failed to identify esp32 node", foundNode);
    passed = false;
  }

  const adapterForNode = getBoardAdapter(esp32Node);
  if (adapterForNode.boardType !== "esp32") {
    console.error("FAIL: getBoardAdapter(node) did not return esp32 adapter", adapterForNode);
    passed = false;
  }

  const adapterForString = getBoardAdapter("esp32");
  if (adapterForString.boardType !== "esp32") {
    console.error("FAIL: getBoardAdapter('esp32') did not return esp32 adapter", adapterForString);
    passed = false;
  }

  return passed;
}

if (require.main === module) {
  const ok = runEsp32BoardAdapterTests();
  if (ok) {
    console.log("✅ All Esp32BoardAdapter tests passed.");
  } else {
    console.error("❌ Esp32BoardAdapter tests failed.");
    process.exit(1);
  }
}
