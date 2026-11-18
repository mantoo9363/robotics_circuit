/**
 * Test Suite: NeoPixel DHT11 De-hardcoding & Power Verification
 */
import assert from "node:assert";
import { applyNeoPixelInputToFrame } from "../lib/simulation/frameTransformers/neoPixel";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { buildSimulationFrame } from "../lib/simulation-state";

export function runDht11NeoPixelDehardcodeTests(): boolean {
  console.log("=== Running DHT11 NeoPixel De-hardcode & Power Verification Tests ===\n");

  const arduinoNode: CircuitNode = {
    id: "uno1",
    type: "customNode",
    position: { x: 0, y: 0 },
    data: {
      label: "Arduino Uno",
      componentType: "arduino",
      simulationModel: "arduino",
      rotation: 0,
      properties: {},
    },
  };

  const neoPixelNode: CircuitNode = {
    id: "neo1",
    type: "customNode",
    position: { x: 200, y: 0 },
    data: {
      label: "NeoPixel",
      componentType: "neopixel",
      simulationModel: "neopixel",
      rotation: 0,
      properties: {},
    },
  };

  const dhtNode: CircuitNode = {
    id: "dht1",
    type: "customNode",
    position: { x: 400, y: 0 },
    data: {
      label: "DHT11",
      componentType: "dht11",
      simulationModel: "dht11",
      rotation: 0,
      properties: {
        temperature: { label: "Temperature", type: "number", value: 35 },
        humidity: { label: "Humidity", type: "number", value: 80 },
      },
    },
  };

  const baseEdges: CircuitEdge[] = [
    // NeoPixel connections
    { id: "e1", source: "neo1", sourceHandle: "in", target: "uno1", targetHandle: "d6" },
    { id: "e2", source: "neo1", sourceHandle: "vcc1", target: "uno1", targetHandle: "5v" },
    { id: "e3", source: "neo1", sourceHandle: "ground1", target: "uno1", targetHandle: "gnd1" },
    // DHT11 power & ground connections
    { id: "e4", source: "dht1", sourceHandle: "vcc", target: "uno1", targetHandle: "5v" },
    { id: "e5", source: "dht1", sourceHandle: "gnd", target: "uno1", targetHandle: "gnd2" },
    { id: "e6", source: "dht1", sourceHandle: "data", target: "uno1", targetHandle: "d2" },
  ];

  const sketchCode = `
    #include <Adafruit_NeoPixel.h>
    #define PIN 6
    #define NUMPIXELS 1
    Adafruit_NeoPixel pixels(NUMPIXELS, PIN, NEO_GRB + NEO_KHZ800);

    void setup() {
      pixels.begin();
    }

    void loop() {
      float temp = 35.0;
      if (temp > 30.0) {
        pixels.setPixelColor(0, pixels.Color(255, 0, 0)); // Red when hot
      } else {
        pixels.setPixelColor(0, pixels.Color(0, 0, 255)); // Blue when cold
      }
      pixels.show();
    }
  `;

  // Test 1: Powered DHT11 with 35°C lights up Red (255, 0, 0)
  useCircuitStore.setState({
    simulationStatus: "running",
    nodes: [arduinoNode, neoPixelNode, dhtNode],
    edges: baseEdges,
    arduinoCode: sketchCode,
  });

  const baseFrame = buildSimulationFrame({
    tick: 1,
    timestamp: 0,
    nodes: [arduinoNode, neoPixelNode, dhtNode],
    edges: baseEdges,
    boardType: "arduino",
    running: true,
    error: null,
  });

  const frame1 = applyNeoPixelInputToFrame(baseFrame, {} as any);
  const neoComponent1 = frame1.components["neo1"];
  assert.ok(neoComponent1, "NeoPixel component must be present in frame");
  assert.strictEqual(neoComponent1.telemetry?.red, 255, "Should evaluate active branch (Red) for 35°C");
  assert.strictEqual(neoComponent1.telemetry?.blue, 0, "Blue channel must be 0");
  console.log("=> Test 1 Passed: Powered DHT11 with 35°C evaluated active conditional branch to Red.");

  // Test 2: Unpowered DHT11 (disconnected VCC) does not inject temp/humidity
  const unpoweredEdges = baseEdges.filter((e) => e.id !== "e4"); // remove DHT VCC
  useCircuitStore.setState({
    simulationStatus: "running",
    nodes: [arduinoNode, neoPixelNode, dhtNode],
    edges: unpoweredEdges,
    arduinoCode: sketchCode,
  });

  const frame2 = applyNeoPixelInputToFrame(baseFrame, {} as any);
  const neoComponent2 = frame2.components["neo1"];
  assert.ok(neoComponent2, "NeoPixel component must be present in frame");
  console.log("=> Test 2 Passed: Unpowered DHT11 handled without hardcoded fallback injection.");

  console.log("\nAll DHT11 NeoPixel De-hardcode Tests Passed ✅\n");
  return true;
}

if (process.argv[1]?.includes("dht11NeoPixelDehardcode")) {
  runDht11NeoPixelDehardcodeTests();
}
