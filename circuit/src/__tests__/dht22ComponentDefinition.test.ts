/**
 * Permanent Regression Test Suite: DHT22 Component Definition & Registration
 */
import assert from "node:assert";
import { COMPONENT_CATALOG, COMPONENT_THUMBNAILS } from "../lib/circuit-components";
import { nodeTypes } from "../components/nodes";

export function runDht22ComponentTests(): boolean {
  console.log("=== Running DHT22 Component Definition Tests ===\n");

  // 1. Verify thumbnail registration
  assert.strictEqual(
    COMPONENT_THUMBNAILS.dht22,
    "/parts/DHT 22 Module.svg",
    "dht22 thumbnail must point to /parts/DHT 22 Module.svg"
  );
  console.log("=> Test 1 Passed: COMPONENT_THUMBNAILS.dht22 correctly registered.");

  // 2. Verify COMPONENT_CATALOG entry
  const dht22Def = COMPONENT_CATALOG.find((c) => c.type === "dht22");
  assert.ok(dht22Def, "dht22 must exist in COMPONENT_CATALOG");
  assert.strictEqual(dht22Def.label, "DHT22 Sensor");
  assert.strictEqual(dht22Def.category, "input");
  assert.strictEqual(dht22Def.defaultWidth, 140);
  assert.strictEqual(dht22Def.defaultHeight, 205);
  console.log("=> Test 2 Passed: COMPONENT_CATALOG basic properties (label, category, dimensions) verified.");

  // 3. Verify pins (data, vcc, gnd)
  const pinIds = dht22Def.pins.map((p) => p.id);
  assert.deepStrictEqual(pinIds, ["data", "vcc", "gnd"], "dht22 must define data, vcc, and gnd pins");
  console.log("=> Test 3 Passed: Pins (data, vcc, gnd) verified.");

  // 4. Verify default properties (temperature & humidity bounds)
  const props = dht22Def.defaultProperties as any;
  assert.ok(props.temperature, "temperature property must be defined");
  assert.strictEqual(props.temperature.value, 24);
  assert.strictEqual(props.temperature.min, -40);
  assert.strictEqual(props.temperature.max, 80);
  assert.strictEqual(props.temperature.unit, "°C");

  assert.ok(props.humidity, "humidity property must be defined");
  assert.strictEqual(props.humidity.value, 40);
  assert.strictEqual(props.humidity.min, 0);
  assert.strictEqual(props.humidity.max, 100);
  assert.strictEqual(props.humidity.unit, "%");
  console.log("=> Test 4 Passed: Temperature (-40 to +80°C) and Humidity (0 to 100%) property ranges verified.");

  // 5. Verify nodeTypes registration
  assert.ok(nodeTypes.dht22, "dht22 must be registered in nodeTypes");
  console.log("=> Test 5 Passed: nodeTypes.dht22 registered successfully.");

  console.log("\nAll DHT22 Component Definition Tests Passed ✅\n");
  return true;
}

if (process.argv[1]?.includes("dht22ComponentDefinition")) {
  runDht22ComponentTests();
}
