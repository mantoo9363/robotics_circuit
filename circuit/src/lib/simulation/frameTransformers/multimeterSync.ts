import type { SimulationFrame, NormalizedBoardPin } from "../../simulation-state";
import { endpointKey, findPinId, PIN_ALIASES, clamp01 } from "../../simulation-state";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraph, getReachableGraphNodes } from "../../circuit/graph";
import { evaluateMultimeterComponentState } from "../multimeter";
import type { SimContext } from "../types";

/** Re-evaluates LED warnings, Potentiometers, and Multimeter nodes in frame using post-pipeline dynamic component voltages. */
export function applyMultimeterOutputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  if (!frame.running) return frame;

  const components = { ...frame.components };
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
  for (const node of context.nodes) {
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
      const positivePin = findPinId(node, context.dynamicComponents, [
        "positive",
        ...PIN_ALIASES.positive,
      ]);
      const negativePin = findPinId(node, context.dynamicComponents, [
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
  }

  // 2.5 Potentiometer wiper synthetic source calculation
  const directGraphForPot = buildConductiveGraph(
    context.nodes,
    context.edges,
    { includeResistors: false },
    context.dynamicComponents,
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

  for (const node of context.nodes) {
    if (getNodeSimulationModel(node) !== "potentiometer") continue;
    const pin1 = findPinId(node, context.dynamicComponents, [
      "pin1",
      ...PIN_ALIASES.positive,
    ]);
    const pin2 = findPinId(node, context.dynamicComponents, [
      "pin2",
      ...PIN_ALIASES.negative,
    ]);
    const wiper = findPinId(node, context.dynamicComponents, [
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
  for (const node of context.nodes) {
    const model = getNodeSimulationModel(node);
    const compState = components[node.id];
    if (!compState) continue;

    if (model === "ne555") {
      const outputVoltage = Number(
        compState.telemetry?.outputVoltage ?? compState.voltage ?? 0,
      );
      if (outputVoltage > 2.0) {
        const outputPin = findPinId(node, context.dynamicComponents, [
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
      const gndPin = findPinId(node, context.dynamicComponents, ["pin1_gnd"]);
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
      const anodePin = findPinId(node, context.dynamicComponents, [
        "anode",
        "pin1",
        ...PIN_ALIASES.positive,
      ]);
      const cathodePin = findPinId(node, context.dynamicComponents, [
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

    if (model === "l293d") {
      const vsRef = Math.max(1, Number(compState.telemetry?.vsVoltage ?? 5));
      for (const [pinName, pinState] of Object.entries(compState.pins ?? {})) {
        if (!pinState || !pinState.active) continue;
        const lowerName = pinName.toLowerCase();
        if (lowerName.startsWith("output") || lowerName.startsWith("out") || lowerName.endsWith("y")) {
          if (pinState.voltage > 0.05) {
            sources.push({
              handleId: endpointKey(node.id, pinName),
              pin: -50,
              mode: "L293D_OUT",
              value: Math.round(clamp01(pinState.voltage / vsRef) * 255),
              normalizedValue: clamp01(pinState.voltage / vsRef),
              voltage: pinState.voltage,
              active: true,
              kind: "source",
            });
          } else {
            sinks.push({
              handleId: endpointKey(node.id, pinName),
              pin: -51,
              mode: "L293D_OUT_LOW",
              value: 0,
              normalizedValue: 0,
              voltage: 0,
              active: true,
              kind: "sink",
            });
          }
        }
      }
    }
  }

  // Build signal graph (includes resistors) for path checking and multimeter reachability
  const signalGraph = buildConductiveGraph(
    context.nodes,
    context.edges,
    { includeResistors: true },
    context.dynamicComponents,
  );

  // 4. Update LED telemetry.pathBlocked once NE555/dynamic sources are resolved
  const targetSources = new Set(sources.map((s) => s.handleId));
  const targetSinks = new Set(sinks.map((s) => s.handleId));

  for (const node of context.nodes) {
    if (getNodeSimulationModel(node) !== "led") continue;
    const compState = components[node.id];
    if (!compState) continue;

    const anodePin = findPinId(node, context.dynamicComponents, [
      "anode",
      ...PIN_ALIASES.positive,
    ]);
    const cathodePin = findPinId(node, context.dynamicComponents, [
      "cathode",
      ...PIN_ALIASES.negative,
    ]);
    const anodeKey = endpointKey(node.id, anodePin);
    const cathodeKey = endpointKey(node.id, cathodePin);

    const reachableFromAnode = getReachableGraphNodes(signalGraph, anodeKey);
    const reachableFromCathode = getReachableGraphNodes(signalGraph, cathodeKey);
    const hasSource = Array.from(targetSources).some((s) => reachableFromAnode.has(s));
    const hasSink = Array.from(targetSinks).some((s) => reachableFromCathode.has(s));

    if (hasSource && hasSink) {
      // Resolve the actual reachable source voltage (may include NE555/capacitor
      // synthetic sources not yet known during the LED's first simulation pass)
      // so telemetry.overloadVoltage reflects reality, not a stale 0.
      const resolvedSource = sources
        .filter((s) => reachableFromAnode.has(s.handleId))
        .reduce<NormalizedBoardPin | null>(
          (best, cur) => (!best || cur.voltage > best.voltage ? cur : best),
          null,
        );

      components[node.id] = {
        ...compState,
        telemetry: {
          ...compState.telemetry,
          pathBlocked: false,
          ...(resolvedSource ? { overloadVoltage: resolvedSource.voltage } : {}),
        },
      };
    }
  }

  // Fast check: return immediately if no multimeter nodes exist on canvas
  const multimeterNodes = context.nodes.filter(
    (node) =>
      node.data.componentType === "multimeter" ||
      getNodeSimulationModel(node) === "multimeter",
  );
  if (multimeterNodes.length === 0) return { ...frame, components };

  // 5. Build graphs for multimeter reachability
  const directGraph = buildConductiveGraph(
    context.nodes,
    context.edges,
    { includeResistors: false },
    context.dynamicComponents,
  );
  const completeGraph = signalGraph;

  const directSourceReach = new Map<string, NormalizedBoardPin[]>();
  for (const source of sources) {
    for (const endpoint of getReachableGraphNodes(directGraph, source.handleId)) {
      const bucket = directSourceReach.get(endpoint) ?? [];
      bucket.push(source);
      directSourceReach.set(endpoint, bucket);
    }
  }

  const directSinkReach = new Set<string>();
  for (const sink of sinks) {
    for (const endpoint of getReachableGraphNodes(directGraph, sink.handleId)) {
      directSinkReach.add(endpoint);
    }
  }

  // Fallback voltage resolver: Used ONLY when directSourceReach has no entry for a probe endpoint
  const resolveProbeFallback = (endpointKeyStr: string) => {
    const existing = directSourceReach.get(endpointKeyStr) ?? [];
    if (existing.length > 0) return;

    const reachableEndpoints = getReachableGraphNodes(directGraph, endpointKeyStr);

    // 1. Check if any reachable endpoint matches a synthesized source entry in sources[]
    for (const ep of reachableEndpoints) {
      const matchingSource = sources.find((s) => s.handleId === ep);
      if (matchingSource) {
        directSourceReach.set(endpointKeyStr, [matchingSource]);
        return;
      }
    }

    // 2. Check if any reachable endpoint matches a resolved component pin voltage in frame.components
    for (const ep of reachableEndpoints) {
      const lastColon = ep.lastIndexOf(":");
      if (lastColon === -1) continue;
      const targetNodeId = ep.slice(0, lastColon);
      const targetPinId = ep.slice(lastColon + 1);

      const comp = components[targetNodeId];
      if (!comp || comp.componentType === "multimeter") continue;

      const pinVoltage = Number(
        comp.pins?.[targetPinId]?.voltage ?? comp.voltage ?? 0,
      );
      if (pinVoltage > 0.01) {
        directSourceReach.set(endpointKeyStr, [
          {
            handleId: ep,
            pin: -99,
            mode: "PIN_FALLBACK",
            value: Math.round(clamp01(pinVoltage / 5) * 255),
            normalizedValue: clamp01(pinVoltage / 5),
            voltage: pinVoltage,
            active: true,
            kind: "source",
          },
        ]);
        break;
      }
    }
  };

  for (const node of multimeterNodes) {
    const componentState = components[node.id]
      ? { ...components[node.id] }
      : {
        nodeId: node.id,
        componentType: "multimeter",
        label: node.data.label || "Multimeter",
        isPowered: false,
        brightness: 0,
        voltage: 0,
        telemetry: {},
        pins: {},
      };

    const positivePin = findPinId(node, context.dynamicComponents, [
      "positive",
      ...PIN_ALIASES.positive,
    ]);
    const negativePin = findPinId(node, context.dynamicComponents, [
      "negative",
      ...PIN_ALIASES.negative,
    ]);
    const positiveKey = endpointKey(node.id, positivePin);
    const negativeKey = endpointKey(node.id, negativePin);

    // Resolve fallback for probed endpoints if directSourceReach is empty
    resolveProbeFallback(positiveKey);
    resolveProbeFallback(negativeKey);

    evaluateMultimeterComponentState({
      node,
      nodes: context.nodes,
      dynamicComponents: context.dynamicComponents,
      directSourceReach,
      directSinkReach,
      directGraph,
      signalGraph,
      completeGraph,
      sources,
      sinks,
      running: frame.running,
      componentState,
    });

    components[node.id] = componentState;
  }

  return { ...frame, components };
}
