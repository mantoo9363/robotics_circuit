/**
 * voltageUtils.ts
 *
 * Shared utility for resolving live circuit voltage at any endpoint.
 *
 * Extracted from multimeterSync.ts (pure move, zero behavior change).
 * Both multimeterSync.ts and future consumers (e.g. ESP32 ADC transformer)
 * call collectCircuitSourcesAndSinks() to get the same canonical source/sink
 * arrays, guaranteeing numerical parity across the simulation.
 *
 * TODO: MicroPythonTokenizer/Parser/Interpreter currently live in
 * picoParser.ts despite being board-agnostic. Future cleanup should move
 * them to a neutral file (e.g. microPythonCore.ts) that both picoParser.ts
 * and ESP32 import from. Not blocking now.
 */

import type { SimulationFrame, NormalizedBoardPin } from "../simulation-state";
import { endpointKey, findPinId, PIN_ALIASES, clamp01 } from "../simulation-state";
import { getNodeSimulationModel } from "./components";
import { buildConductiveGraph, getReachableGraphNodes } from "./graph";
import type { CircuitNode, CircuitEdge } from "../types";
import type { useDynamicComponentsStore } from "../../store/useDynamicComponentsStore";
import { validateComponentConnections } from "../../utils/connectivity";

/** Minimal parameter bag — avoids importing the full SimContext to keep this neutral. */
export interface CircuitVoltageContext {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  dynamicComponents: ReturnType<typeof useDynamicComponentsStore.getState>["components"];
}

/** Return type from collectCircuitSourcesAndSinks. */
export interface CircuitSourceSinkResult {
  sources: NormalizedBoardPin[];
  sinks: NormalizedBoardPin[];
}

/**
 * Collects all resolved voltage sources and GND sinks present in the circuit.
 * Includes:
 *   - Active board GPIO output pins (from frame.boardPins)
 *   - Battery / power supply terminals
 *   - Arduino 5V / 3.3V rails and GND pins
 *   - Raspberry Pi Pico 3.3V / VBUS rails and GND pins
 *   - Synthetic potentiometer wiper voltages (POT_WIPER mode)
 *   - Dynamic component outputs: NE555 pin3_out, polarized capacitor anode
 *
 * This is the single source of truth for voltage resolution shared between
 * multimeterSync.ts and any other transformer that needs live pin voltages.
 */
export function collectCircuitSourcesAndSinks(
  frame: SimulationFrame,
  ctx: CircuitVoltageContext,
): CircuitSourceSinkResult {
  const components = frame.components;
  const sources: NormalizedBoardPin[] = [];
  const sinks: NormalizedBoardPin[] = [];

  // 1. Board pins from frame
  if (frame.boardPins) {
    for (const pin of frame.boardPins) {
      if (pin.active && (pin.mode === "OUTPUT" || pin.voltage > 0.05)) {
        sources.push({
          handleId: pin.handleId,
          pin: pin.pin,
          mode: pin.mode,
          value: pin.value,
          normalizedValue: pin.normalizedValue,
          voltage: pin.voltage,
          active: pin.active,
          kind: "source",
        });
      } else if (
        pin.active &&
        (pin.mode === "GND" || pin.handleId.toLowerCase().includes("gnd"))
      ) {
        sinks.push({
          handleId: pin.handleId,
          pin: pin.pin,
          mode: pin.mode,
          value: pin.value,
          normalizedValue: pin.normalizedValue,
          voltage: pin.voltage,
          active: pin.active,
          kind: "sink",
        });
      }
    }
  }

  // 2. Battery, power supply, and board nodes
  for (const node of ctx.nodes) {
    const model = getNodeSimulationModel(node);
    if (
      model === "battery9v" ||
      model === "battery1_5v" ||
      model === "coincell" ||
      model === "powerSupply"
    ) {
      const enabled =
        model === "powerSupply"
          ? frame.running && node.data.properties?.enabled?.value === "on"
          : true;
      const voltage = enabled
        ? Number(node.data.properties?.voltage?.value ?? 0)
        : 0;
      const positivePin = findPinId(node, ctx.dynamicComponents, [
        "positive",
        ...PIN_ALIASES.positive,
      ]);
      const negativePin = findPinId(node, ctx.dynamicComponents, [
        "negative",
        ...PIN_ALIASES.negative,
      ]);
      if (enabled && voltage > 0) {
        sources.push({
          handleId: endpointKey(node.id, positivePin),
          pin: -1,
          mode: "POWER",
          value: 1,
          normalizedValue: 1,
          voltage,
          active: true,
          kind: "source",
        });
      }
      sinks.push({
        handleId: endpointKey(node.id, negativePin),
        pin: -2,
        mode: "GND",
        value: 0,
        normalizedValue: 0,
        voltage: 0,
        active: enabled,
        kind: "sink",
      });
    }

    if (model === "arduino") {
      for (const gndHandle of ["gnd1", "gnd2", "gnd3"]) {
        sinks.push({
          handleId: endpointKey(node.id, gndHandle),
          pin: -3,
          mode: "GND",
          value: 0,
          normalizedValue: 0,
          voltage: 0,
          active: true,
          kind: "sink",
        });
      }
      sources.push({
        handleId: endpointKey(node.id, "5v"),
        pin: -4,
        mode: "POWER",
        value: 255,
        normalizedValue: 1,
        voltage: 5.0,
        active: true,
        kind: "source",
      });
      sources.push({
        handleId: endpointKey(node.id, "3v3"),
        pin: -5,
        mode: "POWER",
        value: 168,
        normalizedValue: 0.66,
        voltage: 3.3,
        active: true,
        kind: "source",
      });
    }

    if (model === "raspberrypipico") {
      for (const gndHandle of [
        "pico_gnd1",
        "pico_gnd2",
        "pico_gnd3",
        "pico_gnd4",
        "pico_gnd5",
        "pico_gnd6",
        "pico_gnd7",
        "pico_gnd8",
      ]) {
        sinks.push({
          handleId: endpointKey(node.id, gndHandle),
          pin: -6,
          mode: "GND",
          value: 0,
          normalizedValue: 0,
          voltage: 0,
          active: true,
          kind: "sink",
        });
      }
      sources.push({
        handleId: endpointKey(node.id, "pico_3v3"),
        pin: -7,
        mode: "POWER",
        value: 168,
        normalizedValue: 0.66,
        voltage: 3.3,
        active: true,
        kind: "source",
      });
      sources.push({
        handleId: endpointKey(node.id, "pico_vbus"),
        pin: -8,
        mode: "POWER",
        value: 255,
        normalizedValue: 1,
        voltage: 5.0,
        active: true,
        kind: "source",
      });
    }

    if (model === "esp32") {
      for (const gndHandle of ["esp32_gnd1", "esp32_gnd2", "esp32_gnd3"]) {
        sinks.push({
          handleId: endpointKey(node.id, gndHandle),
          pin: -9,
          mode: "GND",
          value: 0,
          normalizedValue: 0,
          voltage: 0,
          active: true,
          kind: "sink",
        });
      }
      sources.push({
        handleId: endpointKey(node.id, "esp32_3v3"),
        pin: -10,
        mode: "POWER",
        value: 168,
        normalizedValue: 0.66,
        voltage: 3.3,
        active: true,
        kind: "source",
      });
    }
  }

  // 2.5 Potentiometer wiper synthetic source calculation (POT_WIPER)
  const directGraphForPot = buildConductiveGraph(
    ctx.nodes,
    ctx.edges,
    { includeResistors: false },
    ctx.dynamicComponents,
  );
  const initialSourceReachForPot = new Map<string, NormalizedBoardPin[]>();
  for (const source of sources) {
    for (const endpoint of getReachableGraphNodes(directGraphForPot, source.handleId)) {
      const bucket = initialSourceReachForPot.get(endpoint) ?? [];
      bucket.push(source);
      initialSourceReachForPot.set(endpoint, bucket);
    }
  }
  const initialSinkReachForPot = new Set<string>();
  for (const sink of sinks) {
    for (const endpoint of getReachableGraphNodes(directGraphForPot, sink.handleId)) {
      initialSinkReachForPot.add(endpoint);
    }
  }

  for (const node of ctx.nodes) {
    if (getNodeSimulationModel(node) !== "potentiometer") continue;
    const pin1 = findPinId(node, ctx.dynamicComponents, [
      "pin1",
      ...PIN_ALIASES.positive,
    ]);
    const pin2 = findPinId(node, ctx.dynamicComponents, [
      "pin2",
      ...PIN_ALIASES.negative,
    ]);
    const wiper = findPinId(node, ctx.dynamicComponents, [
      "wiper",
      ...PIN_ALIASES.wiper,
    ]);
    const pin1Key = endpointKey(node.id, pin1);
    const pin2Key = endpointKey(node.id, pin2);
    const source1 = (initialSourceReachForPot.get(pin1Key) ?? []).reduce<NormalizedBoardPin | null>((best, current) => {
      if (!best) return current;
      return current.voltage > best.voltage ? current : best;
    }, null);
    const source2 = (initialSourceReachForPot.get(pin2Key) ?? []).reduce<NormalizedBoardPin | null>((best, current) => {
      if (!best) return current;
      return current.voltage > best.voltage ? current : best;
    }, null);
    const pin1Grounded = initialSinkReachForPot.has(pin1Key);
    const pin2Grounded = initialSinkReachForPot.has(pin2Key);
    const voltage1 = pin1Grounded ? 0 : (source1?.voltage ?? null);
    const voltage2 = pin2Grounded ? 0 : (source2?.voltage ?? null);
    if (voltage1 === null || voltage2 === null) continue;

    const position = Math.max(
      0,
      Math.min(100, Number(node.data.properties?.position?.value ?? 50)),
    );
    const ratio = position / 100;
    const wiperVoltage = voltage1 * ratio + voltage2 * (1 - ratio);
    const reference = Math.max(Math.abs(voltage1), Math.abs(voltage2), 5);
    const normalizedValue = clamp01(Math.abs(wiperVoltage) / reference);

    sources.push({
      handleId: endpointKey(node.id, wiper),
      pin: -20,
      mode: "POT_WIPER",
      value: Math.round(normalizedValue * 255),
      normalizedValue,
      voltage: wiperVoltage,
      active: frame.running && Math.abs(wiperVoltage) > 0.001,
      kind: frame.running && Math.abs(wiperVoltage) > 0.001 ? "source" : "floating",
    });
  }

  // 3. Dynamic components resolved in frame.components (NE555, PolarizedCapacitor)
  for (const node of ctx.nodes) {
    const model = getNodeSimulationModel(node);
    const compState = components[node.id];
    if (!compState) continue;

    if (model === "ne555") {
      const outputVoltage = Number(
        compState.telemetry?.outputVoltage ?? compState.voltage ?? 0,
      );
      if (outputVoltage > 2.0) {
        const outputPin = findPinId(node, ctx.dynamicComponents, [
          "pin3_out",
        ]);
        sources.push({
          handleId: endpointKey(node.id, outputPin),
          pin: -30,
          mode: "NE555_OUT",
          value: Math.round((outputVoltage / 9) * 255),
          normalizedValue: outputVoltage / 9,
          voltage: outputVoltage,
          active: true,
          kind: "source",
        });
      }
      const gndPin = findPinId(node, ctx.dynamicComponents, ["pin1_gnd"]);
      sinks.push({
        handleId: endpointKey(node.id, gndPin),
        pin: -31,
        mode: "GND",
        value: 0,
        normalizedValue: 0,
        voltage: 0,
        active: true,
        kind: "sink",
      });
    }

    if (model === "polarizedCapacitor" || model === "capacitor") {
      const capVoltage = Number(
        compState.telemetry?.voltage ?? compState.voltage ?? 0,
      );
      const anodePin = findPinId(node, ctx.dynamicComponents, [
        "anode",
        "pin1",
        ...PIN_ALIASES.positive,
      ]);
      const cathodePin = findPinId(node, ctx.dynamicComponents, [
        "cathode",
        "pin2",
        ...PIN_ALIASES.negative,
      ]);
      const anodeVoltage = Number(
        compState.pins?.[anodePin]?.voltage ?? capVoltage,
      );
      const cathodeVoltage = Number(
        compState.pins?.[cathodePin]?.voltage ?? 0,
      );

      if (anodeVoltage > 0.05) {
        sources.push({
          handleId: endpointKey(node.id, anodePin),
          pin: -40,
          mode: "CAP_ANODE",
          value: Math.round(clamp01(anodeVoltage / 5) * 255),
          normalizedValue: clamp01(anodeVoltage / 5),
          voltage: anodeVoltage,
          active: true,
          kind: "source",
        });
      }
      sinks.push({
        handleId: endpointKey(node.id, cathodePin),
        pin: -41,
        mode: "CAP_CATHODE",
        value: 0,
        normalizedValue: 0,
        voltage: cathodeVoltage,
        active: true,
        kind: "sink",
      });
    }

    // 4. Analog sensors (gasSensor, soilMoisture, temperatureSensor)
    if (model === "gasSensor") {
      if (validateComponentConnections(node, ctx.nodes, ctx.edges)) {
        const gasVal = Math.max(0, Math.min(1023, Number(node.data.properties?.gasLevel?.value ?? 300)));
        const normalizedValue = gasVal / 1023;
        const voltage = normalizedValue * 3.3;
        for (const h of ["b1", "b2"]) {
          sources.push({
            handleId: endpointKey(node.id, h),
            pin: -50,
            mode: "GAS_OUT",
            value: Math.round(normalizedValue * 255),
            normalizedValue,
            voltage,
            active: frame.running && voltage > 0.001,
            kind: frame.running && voltage > 0.001 ? "source" : "floating",
          });
        }
      }
    }

    if (model === "soilMoisture") {
      if (validateComponentConnections(node, ctx.nodes, ctx.edges)) {
        const moisture = Math.max(0, Math.min(1023, Number(node.data.properties?.moisture?.value ?? 0)));
        const normalizedValue = moisture / 1023;
        const voltage = normalizedValue * 3.3;
        for (const h of ["signal", "sig", "out", "sig1", "sig2"]) {
          sources.push({
            handleId: endpointKey(node.id, h),
            pin: -51,
            mode: "SOIL_OUT",
            value: Math.round(normalizedValue * 255),
            normalizedValue,
            voltage,
            active: frame.running && voltage > 0.001,
            kind: frame.running && voltage > 0.001 ? "source" : "floating",
          });
        }
      }
    }

    if (model === "temperatureSensor") {
      if (validateComponentConnections(node, ctx.nodes, ctx.edges)) {
        const celsius = Math.max(-40, Math.min(125, Number(node.data.properties?.temperature?.value ?? 25)));
        const mv = celsius * 10 + 500;
        const volts = mv / 1000;
        const ratio = Math.max(0, Math.min(1.0, volts / 3.3));
        const voltage = ratio * 3.3;
        for (const h of ["out", "signal", "vout"]) {
          sources.push({
            handleId: endpointKey(node.id, h),
            pin: -52,
            mode: "TEMP_OUT",
            value: Math.round(ratio * 255),
            normalizedValue: ratio,
            voltage,
            active: frame.running && voltage > 0.001,
            kind: frame.running && voltage > 0.001 ? "source" : "floating",
          });
        }
      }
    }
  }

  return { sources, sinks };
}

/**
 * Resolves the highest-priority live voltage reachable from a given endpoint handle
 * (e.g. "esp32-1:gpio34") using a pre-built directSourceReach map.
 *
 * Returns the voltage in volts, or 0 if no source is reachable.
 */
export function resolveEndpointVoltage(
  endpointKeyStr: string,
  directSourceReach: Map<string, NormalizedBoardPin[]>,
): number {
  const candidates = directSourceReach.get(endpointKeyStr) ?? [];
  if (candidates.length === 0) return 0;
  const best = candidates.reduce<NormalizedBoardPin | null>((b, c) =>
    !b || c.voltage > b.voltage ? c : b, null);
  return best?.voltage ?? 0;
}
