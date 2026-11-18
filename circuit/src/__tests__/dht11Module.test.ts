/**
 * Permanent Regression Test Suite for DHT11 Module Component Registration
 */

import { COMPONENT_CATALOG, COMPONENT_THUMBNAILS } from "../lib/circuit-components";

export function runDht11ModuleTests(): boolean {
  // Check thumbnail
  if (COMPONENT_THUMBNAILS.dht11 !== "/parts/dht11_module.svg") {
    throw new Error(`Expected dht11 thumbnail to be /parts/dht11_module.svg, got ${COMPONENT_THUMBNAILS.dht11}`);
  }

  // Check component catalog definition
  const dht11Def = COMPONENT_CATALOG.find((comp) => comp.type === "dht11");
  if (!dht11Def) {
    throw new Error("dht11 not found in COMPONENT_CATALOG");
  }

  if (dht11Def.label !== "DHT11 Sensor") {
    throw new Error(`Expected label DHT11 Sensor, got ${dht11Def.label}`);
  }

  if (dht11Def.category !== "input") {
    throw new Error(`Expected category input, got ${dht11Def.category}`);
  }

  if (dht11Def.defaultWidth !== 140 || dht11Def.defaultHeight !== 205) {
    throw new Error(`Expected dimensions 140x205, got ${dht11Def.defaultWidth}x${dht11Def.defaultHeight}`);
  }

  const pins = dht11Def.pins;
  if (!pins || pins.length !== 3) {
    throw new Error(`Expected 3 pins, got ${pins?.length}`);
  }

  const dataPin = pins.find((p) => p.id === "data");
  if (!dataPin || dataPin.label !== "DATA" || dataPin.position.x !== 40 || dataPin.position.y !== 194) {
    throw new Error(`Invalid data pin definition: ${JSON.stringify(dataPin)}`);
  }

  const vccPin = pins.find((p) => p.id === "vcc");
  if (!vccPin || vccPin.label !== "VCC" || vccPin.position.x !== 70 || vccPin.position.y !== 194) {
    throw new Error(`Invalid vcc pin definition: ${JSON.stringify(vccPin)}`);
  }

  const gndPin = pins.find((p) => p.id === "gnd");
  if (!gndPin || gndPin.label !== "GND" || gndPin.position.x !== 100 || gndPin.position.y !== 194) {
    throw new Error(`Invalid gnd pin definition: ${JSON.stringify(gndPin)}`);
  }

  const props = dht11Def.defaultProperties;
  if (props?.name?.value !== "DHT1") {
    throw new Error(`Expected default name DHT1, got ${props?.name?.value}`);
  }

  if (props?.temperature?.unit !== "°C" || props?.humidity?.unit !== "%") {
    throw new Error(`Invalid temperature/humidity units in defaultProperties`);
  }

  console.log("PASS: DHT11 module component registration tests");
  return true;
}

if (typeof require !== "undefined" && require.main === module) {
  runDht11ModuleTests();
}
