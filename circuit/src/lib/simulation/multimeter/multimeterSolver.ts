import type { CircuitNode, ComponentDefinition } from "../../types";
import type { NormalizedBoardPin } from "../../simulation-state";
import {
  collectReachable,
  collectReachableBlocked,
  endpointKey,
  getNodeSimulationModel,
  getComponentDefinition,
  findPinId,
  getResistanceOhms,
  getPhotoresistorOhms,
  getPotentiometerResistance,
  getLedForwardVoltage,
  reverseGraph,
  findShortestPath,
  getPathLoadParameters,
  PIN_ALIASES,
} from "../../simulation-state";

export function validateMultimeterConnection(args: {
  positiveKey: string;
  negativeKey: string;
  directGraph: Map<string, Set<string>>;
  signalGraph: Map<string, Set<string>>;
  nodes: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
  sources: NormalizedBoardPin[];
  sinks: NormalizedBoardPin[];
}): "floating" | "samenode" | "parallel" | "series" | "unknown" {
  const targetSources = new Set(args.sources.map((s) => s.handleId));
  const targetSinks = new Set(args.sinks.map((s) => s.handleId));

  // 1. Check Same Node
  const positiveNetBlocked = collectReachableBlocked(
    args.directGraph,
    args.positiveKey,
    args.negativeKey,
  );
  if (positiveNetBlocked.has(args.negativeKey)) {
    return "samenode";
  }

  // 2. Check Floating / Disconnected
  let posReachesSourceOrSink = false;
  for (const node of positiveNetBlocked) {
    if (targetSources.has(node) || targetSinks.has(node)) {
      posReachesSourceOrSink = true;
      break;
    }
  }

  const negativeNetBlocked = collectReachableBlocked(
    args.directGraph,
    args.negativeKey,
    args.positiveKey,
  );
  let negReachesSourceOrSink = false;
  for (const node of negativeNetBlocked) {
    if (targetSources.has(node) || targetSinks.has(node)) {
      negReachesSourceOrSink = true;
      break;
    }
  }

  if (!posReachesSourceOrSink || !negReachesSourceOrSink) {
    return "floating";
  }

  // 3. Check Parallel
  let isParallel = false;
  for (const node of args.nodes) {
    const model = getNodeSimulationModel(node, args.dynamicComponents);
    if (
      model === "slideswitch" ||
      model === "pushbutton" ||
      model === "breadboard" ||
      model === "arduino" ||
      model === "microbit" ||
      model === "multimeter"
    ) {
      continue;
    }

    const nodePins =
      getComponentDefinition(node, args.dynamicComponents)?.pins ?? [];
    let positivePinConnected = false;
    let negativePinConnected = false;

    for (const pin of nodePins) {
      const pinKey = endpointKey(node.id, pin.id);
      if (positiveNetBlocked.has(pinKey)) {
        positivePinConnected = true;
      }
      if (negativeNetBlocked.has(pinKey)) {
        negativePinConnected = true;
      }
    }

    if (positivePinConnected && negativePinConnected) {
      isParallel = true;
      break;
    }
  }

  if (isParallel) {
    return "parallel";
  }

  return "unknown";
}

export function measurePassiveResistance(args: {
  positiveKey: string;
  negativeKey: string;
  graph: Map<string, Set<string>>;
  nodes: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
}) {
  const positiveNet = new Set(collectReachable(args.graph, args.positiveKey));
  const negativeNet = new Set(collectReachable(args.graph, args.negativeKey));

  if (positiveNet.has(args.negativeKey) || negativeNet.has(args.positiveKey)) {
    return { resistance: 0, connected: true };
  }

  // Collect resistors that bridge the probes
  const bridgingResistors: Array<{
    node: CircuitNode;
    model: string;
    resistance: number;
  }> = [];
  let count = 0;

  for (const node of args.nodes) {
    const model = getNodeSimulationModel(node, args.dynamicComponents);
    if (
      model === "resistor" ||
      model === "photoresistor" ||
      model === "dcmotor" ||
      model === "vibrationMotor" ||
      model === "hobbyGearmotor" ||
      model === "piezo" ||
      model === "capacitor" ||
      model === "polarizedCapacitor"
    ) {
      const pin1 = endpointKey(
        node.id,
        findPinId(node, args.dynamicComponents, [
          "pin1",
          ...PIN_ALIASES.positive,
        ]),
      );
      const pin2 = endpointKey(
        node.id,
        findPinId(node, args.dynamicComponents, [
          "pin2",
          ...PIN_ALIASES.negative,
        ]),
      );
      const bridgesProbes =
        (positiveNet.has(pin1) && negativeNet.has(pin2)) ||
        (positiveNet.has(pin2) && negativeNet.has(pin1));

      if (bridgesProbes) {
        let resistance = 0;
        if (model === "resistor") {
          resistance = Math.max(0, getResistanceOhms(node));
        } else if (model === "photoresistor") {
          resistance = getPhotoresistorOhms(node);
        } else if (model === "capacitor" || model === "polarizedCapacitor") {
          resistance = 10_000_000;
        } else if (model === "piezo") {
          resistance = 100;
        } else {
          resistance = 10;
        }

        bridgingResistors.push({ node, model, resistance });
        count += 1;
      }
      continue;
    }

    if (model === "potentiometer") {
      const pin1 = endpointKey(
        node.id,
        findPinId(node, args.dynamicComponents, [
          "pin1",
          ...PIN_ALIASES.positive,
        ]),
      );
      const pin2 = endpointKey(
        node.id,
        findPinId(node, args.dynamicComponents, [
          "pin2",
          ...PIN_ALIASES.negative,
        ]),
      );
      const wiper = endpointKey(
        node.id,
        findPinId(node, args.dynamicComponents, [
          "wiper",
          ...PIN_ALIASES.wiper,
        ]),
      );
      const terminals = [
        [pin1, wiper, "pin1", "wiper"],
        [wiper, pin2, "wiper", "pin2"],
        [pin1, pin2, "pin1", "pin2"],
      ] as const;

      for (const [a, b, termA, termB] of terminals) {
        const bridgesProbes =
          (positiveNet.has(a) && negativeNet.has(b)) ||
          (positiveNet.has(b) && negativeNet.has(a));
        if (bridgesProbes) {
          const resistance = getPotentiometerResistance(
            node,
            termA,
            termB,
            args.dynamicComponents,
          );
          bridgingResistors.push({ node, model, resistance });
          count += 1;
          break;
        }
      }
    }
  }

  // If no resistors found, return undefined
  if (count === 0) {
    return { resistance: undefined, connected: false };
  }

  const allParallel = bridgingResistors.every((resistor) => {
    const pin1 = endpointKey(
      resistor.node.id,
      findPinId(resistor.node, args.dynamicComponents, [
        "pin1",
        ...PIN_ALIASES.positive,
      ]),
    );
    const pin2 = endpointKey(
      resistor.node.id,
      findPinId(resistor.node, args.dynamicComponents, [
        "pin2",
        ...PIN_ALIASES.negative,
      ]),
    );

    const pin1InPositive = positiveNet.has(pin1);
    const pin2InPositive = positiveNet.has(pin2);
    const pin1InNegative = negativeNet.has(pin1);
    const pin2InNegative = negativeNet.has(pin2);

    return (
      (pin1InPositive && pin2InNegative) || (pin1InNegative && pin2InPositive)
    );
  });

  let totalResistance: number;

  if (allParallel && count > 1) {
    const reciprocalSum = bridgingResistors.reduce((sum, r) => {
      return sum + (r.resistance > 0 ? 1 / r.resistance : 0);
    }, 0);
    totalResistance = reciprocalSum > 0 ? 1 / reciprocalSum : Infinity;
  } else {
    totalResistance = bridgingResistors.reduce(
      (sum, r) => sum + r.resistance,
      0,
    );
  }

  return {
    resistance: totalResistance,
    connected: true,
  };
}

export function measurePassiveDiode(args: {
  positiveKey: string;
  negativeKey: string;
  graph: Map<string, Set<string>>;
  nodes: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
}) {
  const positiveNet = new Set(collectReachable(args.graph, args.positiveKey));
  const negativeNet = new Set(collectReachable(args.graph, args.negativeKey));

  for (const node of args.nodes) {
    const model = getNodeSimulationModel(node, args.dynamicComponents);
    if (model !== "diode" && model !== "led") continue;

    const anode = endpointKey(
      node.id,
      findPinId(node, args.dynamicComponents, [
        "anode",
        ...PIN_ALIASES.positive,
      ]),
    );
    const cathode = endpointKey(
      node.id,
      findPinId(node, args.dynamicComponents, [
        "cathode",
        ...PIN_ALIASES.negative,
      ]),
    );
    const forwardBiased = positiveNet.has(anode) && negativeNet.has(cathode);
    const reverseBiased = positiveNet.has(cathode) && negativeNet.has(anode);

    if (forwardBiased) {
      return {
        diodeValue: model === "led" ? getLedForwardVoltage(node) : 0.7,
        connected: true,
      };
    }
    if (reverseBiased) {
      return { diodeValue: undefined, connected: true };
    }
  }

  return { diodeValue: undefined, connected: false };
}

export type CircuitProbeMeasurement =
  | {
      voltage: number | undefined;
      current: number | undefined;
      connected: false;
    }
  | {
      voltage: number;
      current: number;
      connected: true;
      sourceVoltage: number;
      totalResistance: number;
      totalVoltageDrop: number;
      measuredResistance: number;
      measuredVoltageDrop: number;
    };

export function measureCircuitAcrossProbes(args: {
  positiveKey: string;
  negativeKey: string;
  graph: Map<string, Set<string>>;
  nodes: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
  sources: NormalizedBoardPin[];
  sinks: NormalizedBoardPin[];
}): CircuitProbeMeasurement {
  const sourceTargets = new Set(args.sources.map((source) => source.handleId));
  const sinkTargets = new Set(args.sinks.map((sink) => sink.handleId));
  const reversedGraph = reverseGraph(args.graph);

  const sourcePath = findShortestPath(
    reversedGraph,
    args.positiveKey,
    sourceTargets,
    args.negativeKey,
  );
  const sinkPath = findShortestPath(
    args.graph,
    args.negativeKey,
    sinkTargets,
    args.positiveKey,
  );

  if (!sourcePath || !sinkPath) return { voltage: undefined, current: undefined, connected: false };

  const sourceKey = sourcePath[sourcePath.length - 1];
  const sourcePin = args.sources.find(
    (source) => source.handleId === sourceKey,
  )!;
  const sourceVoltage = sourcePin?.voltage ?? 0;

  const noBlockedEndpoint = "\u0000";
  const segmentPathDirect =
    args.positiveKey === args.negativeKey
      ? [args.positiveKey]
      : findShortestPath(
          args.graph,
          args.positiveKey,
          new Set([args.negativeKey]),
          noBlockedEndpoint,
        );

  if (segmentPathDirect) {
    const fullPath = [...sourcePath]
      .reverse()
      .concat(segmentPathDirect.slice(1), sinkPath.slice(1));
    const fullLoad = getPathLoadParameters({
      fullPath,
      nodes: args.nodes,
      dynamicComponents: args.dynamicComponents,
    });

    if (sourceVoltage <= fullLoad.V_drop_load) {
      return { voltage: 0, current: 0, connected: false };
    }

    const totalResistance = fullLoad.R_load > 0 ? fullLoad.R_load : 10;
    const current = (sourceVoltage - fullLoad.V_drop_load) / totalResistance;
    const segmentLoad = getPathLoadParameters({
      fullPath: segmentPathDirect,
      nodes: args.nodes,
      dynamicComponents: args.dynamicComponents,
    });
    const voltage = current * segmentLoad.R_load + segmentLoad.V_drop_load;

    return {
      voltage: voltage,
      current: current,
      connected: true,
      sourceVoltage,
      totalResistance,
      totalVoltageDrop: fullLoad.V_drop_load,
      measuredResistance: segmentLoad.R_load,
      measuredVoltageDrop: segmentLoad.V_drop_load,
    };
  }

  return { voltage: undefined, current: undefined, connected: false };
}
