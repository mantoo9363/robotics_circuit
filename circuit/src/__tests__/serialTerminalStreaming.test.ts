import { applyPicoSimulationToFrame } from "../lib/simulation/frameTransformers/pico";
import { applyEsp32SimulationToFrame } from "../lib/simulation/frameTransformers/esp32";
import { buildSimulationFrame } from "../lib/simulation-state";
import { useCircuitStore } from "../lib/store";
import type { CircuitNode, CircuitEdge } from "../lib/types";
import { getOrCreateSession, getVisibleSerialLines } from "../lib/codeParsing/picoParser";

export function runSerialTerminalStreamingTests(): boolean {
  console.log("=================== RUNNING SERIAL TERMINAL STREAMING TESTS ===================\n");
  let allPassed = true;

  const picoNode: CircuitNode = {
    id: "pico-1",
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

  // TEST 1: Newline Test (Standard Output)
  console.log("--- TEST 1: Newline Test (Standard print with newline) ---");
  {
    const code = `
print("DHT22 SENSOR")
print("Temperature: 24 C | Humidity: 40 %")
    `.trim();

    useCircuitStore.setState({
      nodes: [picoNode],
      edges: [],
      picoCode: code,
      arduinoCode: "",
      simulationStatus: "running",
    } as any);

    const ctx = {
      nodes: [picoNode],
      edges: [],
      picoCode: code,
      dynamicComponents: [],
      boardType: "pico",
    } as any;

    const frame0 = buildSimulationFrame({
      tick: 1,
      nodes: [picoNode],
      edges: [],
      dynamicComponents: [],
      boardType: "pico",
      running: true,
      timestamp: 100,
    });

    const res = applyPicoSimulationToFrame(frame0, ctx);
    console.log("[Trace Test 1] Serial output:", JSON.stringify(res.serialOutput));

    if (
      !res.serialOutput ||
      res.serialOutput.length !== 2 ||
      res.serialOutput[0] !== "DHT22 SENSOR" ||
      res.serialOutput[1] !== "Temperature: 24 C | Humidity: 40 %"
    ) {
      console.error("❌ Test 1 FAILED: Expected 2 separate newline lines");
      allPassed = false;
    } else {
      console.log("=> Test 1 PASSED: Newline output formatted cleanly as individual lines\n");
    }
  }

  // TEST 2: end="" Test (Immediate display without waiting for newline)
  console.log("--- TEST 2: end='' Test (Immediate display and line concatenation) ---");
  {
    const codeSingle = `print("Hello", end="")`;
    useCircuitStore.setState({
      nodes: [picoNode],
      edges: [],
      picoCode: codeSingle,
      simulationStatus: "running",
    } as any);

    const frameSingle = applyPicoSimulationToFrame(
      buildSimulationFrame({ tick: 1, nodes: [picoNode], edges: [], boardType: "pico", running: true, timestamp: 100 }),
      { nodes: [picoNode], edges: [], picoCode: codeSingle, dynamicComponents: [], boardType: "pico" } as any,
    );
    console.log("[Trace Test 2A] Single end='' serial output:", JSON.stringify(frameSingle.serialOutput));

    if (!frameSingle.serialOutput || frameSingle.serialOutput.length === 0 || frameSingle.serialOutput[0] !== "Hello") {
      console.error("❌ Test 2A FAILED: print('Hello', end='') must be visible immediately!");
      allPassed = false;
    } else {
      console.log("=> Test 2A PASSED: print('Hello', end='') displayed immediately without newline");
    }

    const codeMulti = `
print("Hello ", end="")
print("World", end="")
    `.trim();
    useCircuitStore.setState({
      nodes: [picoNode],
      edges: [],
      picoCode: codeMulti,
      simulationStatus: "running",
    } as any);

    const frameMulti = applyPicoSimulationToFrame(
      buildSimulationFrame({ tick: 2, nodes: [picoNode], edges: [], boardType: "pico", running: true, timestamp: 200 }),
      { nodes: [picoNode], edges: [], picoCode: codeMulti, dynamicComponents: [], boardType: "pico" } as any,
    );
    console.log("[Trace Test 2B] Multi end='' serial output:", JSON.stringify(frameMulti.serialOutput));

    if (!frameMulti.serialOutput || frameMulti.serialOutput.length === 0 || frameMulti.serialOutput[0] !== "Hello World") {
      console.error("❌ Test 2B FAILED: Multiple end='' prints must concatenate into 'Hello World'!");
      allPassed = false;
    } else {
      console.log("=> Test 2B PASSED: Consecutive end='' prints concatenated to 'Hello World'\n");
    }
  }

  // TEST 3: \r Carriage Return Overwrite Test
  console.log("--- TEST 3: \\r Carriage Return Overwrite Test ---");
  {
    const codeCr = `
print("Value: 10", end="")
print("\\rValue: 20", end="")
    `.trim();

    useCircuitStore.setState({
      nodes: [picoNode],
      edges: [],
      picoCode: codeCr,
      simulationStatus: "running",
    } as any);

    const frameCr = applyPicoSimulationToFrame(
      buildSimulationFrame({ tick: 1, nodes: [picoNode], edges: [], boardType: "pico", running: true, timestamp: 100 }),
      { nodes: [picoNode], edges: [], picoCode: codeCr, dynamicComponents: [], boardType: "pico" } as any,
    );
    console.log("[Trace Test 3] \\r overwrite serial output:", JSON.stringify(frameCr.serialOutput));

    if (!frameCr.serialOutput || frameCr.serialOutput.length === 0 || frameCr.serialOutput[0] !== "Value: 20") {
      console.error(`❌ Test 3 FAILED: Expected ['Value: 20'], got ${JSON.stringify(frameCr.serialOutput)}`);
      allPassed = false;
    } else {
      console.log("=> Test 3 PASSED: \\r moved cursor to index 0 and overwrote line to 'Value: 20'\n");
    }
  }

  // TEST 4: Final DHT22 Sensor Test with Slider Changes
  console.log("--- TEST 4: Final DHT22 Sensor Dynamic Test ---");
  {
    const dht22Node: CircuitNode = {
      id: "dht22-1",
      type: "dht22",
      position: { x: 100, y: 100 },
      data: {
        componentType: "dht22",
        simulationModel: "dht22",
        label: "DHT22 Sensor",
        properties: {
          temperature: { label: "Temperature", type: "number", value: 31.5, unit: "°C", min: -40, max: 80 },
          humidity: { label: "Humidity", type: "number", value: 85.0, unit: "%", min: 0, max: 100 },
        },
        rotation: 0,
      },
    };

    const dhtCode = `
from machine import Pin
import dht
import time

sensor = dht.DHT22(Pin(2))
sensor.measure()
temp = sensor.temperature()
hum = sensor.humidity()
print("DHT22 SENSOR")
print("Temperature:", temp, "C | Humidity:", hum, "%")
    `.trim();

    useCircuitStore.setState({
      nodes: [picoNode, dht22Node],
      edges: [
        { id: "e1", source: "pico-1", sourceHandle: "gp2", target: "dht22-1", targetHandle: "data" },
      ],
      picoCode: dhtCode,
      arduinoCode: "",
      simulationStatus: "running",
    } as any);

    const ctx = {
      nodes: [picoNode, dht22Node],
      edges: [
        { id: "e1", source: "pico-1", sourceHandle: "gp2", target: "dht22-1", targetHandle: "data" },
      ],
      picoCode: dhtCode,
      dynamicComponents: [],
      boardType: "pico",
    } as any;

    const frameDht = applyPicoSimulationToFrame(
      buildSimulationFrame({ tick: 1, nodes: [picoNode, dht22Node], edges: [], boardType: "pico", running: true, timestamp: 100 }),
      ctx,
    );
    console.log("[Trace Test 4] DHT22 serial output:", JSON.stringify(frameDht.serialOutput));

    if (
      !frameDht.serialOutput ||
      frameDht.serialOutput.length < 2 ||
      frameDht.serialOutput[0] !== "DHT22 SENSOR" ||
      !frameDht.serialOutput[1].includes("Temperature: 31.5 C | Humidity: 85 %")
    ) {
      console.error(`❌ Test 4 FAILED: DHT22 values not read accurately, got ${JSON.stringify(frameDht.serialOutput)}`);
      allPassed = false;
    } else {
      console.log("=> Test 4 PASSED: DHT22 values evaluated from slider and output cleanly to serial monitor\n");
    }
  }

  console.log("=================== SERIAL TERMINAL STREAMING TESTS COMPLETE ===================");
  return allPassed;
}

if (require.main === module) {
  const ok = runSerialTerminalStreamingTests();
  process.exit(ok ? 0 : 1);
}
