import type { CircuitNode, ComponentDefinition } from "../../types";
import type { NormalizedBoardPin } from "../../simulation-state";
import { getPathLoadParameters, reverseGraph, findShortestPath, clamp01 } from "../../simulation-state";

export function getStrongestSource(sources: NormalizedBoardPin[]) {
  return sources.reduce<NormalizedBoardPin | null>((best, current) => {
    if (!best) return current;
    return current.voltage > best.voltage ? current : best;
  }, null);
}

export function getProbeReading(
  endpoint: string,
  sourceReach: Map<string, NormalizedBoardPin[]>,
  sinkReach: Set<string>,
  directSinkReach?: Set<string>,
) {
  const source = getStrongestSource(sourceReach.get(endpoint) ?? []);
  const grounded = sinkReach.has(endpoint);
  const directlyGrounded = directSinkReach ? directSinkReach.has(endpoint) : false;

  return {
    source,
    grounded,
    voltage: directlyGrounded ? 0 : (source?.voltage ?? 0),
    normalizedValue: directlyGrounded ? 0 : (source?.normalizedValue ?? 0),
  };
}

export function resolveNodeVoltage(
  endpoint: string,
  sourceReach: Map<string, NormalizedBoardPin[]>,
  sinkReach: Set<string>,
  signalGraph: Map<string, Set<string>> | undefined,
  sources: NormalizedBoardPin[] | undefined,
  sinks: NormalizedBoardPin[] | undefined,
  nodes: CircuitNode[] | undefined,
  dynamicComponents: ComponentDefinition[] | undefined,
) {
  const source = getStrongestSource(sourceReach.get(endpoint) ?? []);
  if (!source) return 0;
  if (sinkReach.has(endpoint)) return 0;
  if (!signalGraph || !sources || !sinks || !nodes) return source.voltage;

  const reversedSignalGraph = signalGraph
    ? reverseGraph(signalGraph)
    : undefined;
  const pathFromEndpointToSource = reversedSignalGraph
    ? findShortestPath(
        reversedSignalGraph,
        endpoint,
        new Set([source.handleId]),
        "",
      )
    : null;
  if (!pathFromEndpointToSource) return source.voltage;

  const targetSinks = new Set(sinks.map((sink) => sink.handleId));
  const pathFromEndpointToSink = findShortestPath(
    signalGraph,
    endpoint,
    targetSinks,
    "",
  );
  if (!pathFromEndpointToSink) return source.voltage;

  const sourceToEndpointPath = [...pathFromEndpointToSource].reverse();
  const fullPath = sourceToEndpointPath.concat(pathFromEndpointToSink.slice(1));
  const fullLoad = getPathLoadParameters({
    fullPath,
    nodes,
    dynamicComponents,
  });
  const beforeEndpointLoad = getPathLoadParameters({
    fullPath: sourceToEndpointPath,
    nodes,
    dynamicComponents,
  });
  const totalResistance = fullLoad.R_load > 0 ? fullLoad.R_load : 0.01;
  const availableVoltage = source.voltage - fullLoad.V_drop_load;
  const current = availableVoltage > 0 ? availableVoltage / totalResistance : 0;
  const resolvedVoltage =
    source.voltage -
    beforeEndpointLoad.V_drop_load -
    current * beforeEndpointLoad.R_load;

  return Math.max(0, resolvedVoltage);
}

export function measureProbePair(args: {
  positiveKey: string;
  negativeKey: string;
  sourceReach: Map<string, NormalizedBoardPin[]>;
  sinkReach: Set<string>;
  signalGraph?: Map<string, Set<string>>;
  sources?: NormalizedBoardPin[];
  sinks?: NormalizedBoardPin[];
  nodes?: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
}) {
  const positive = getProbeReading(
    args.positiveKey,
    args.sourceReach,
    args.sinkReach,
  );
  const negative = getProbeReading(
    args.negativeKey,
    args.sourceReach,
    args.sinkReach,
  );

  const positiveConnected = Boolean(positive.source) || positive.grounded;
  const negativeConnected = Boolean(negative.source) || negative.grounded;

  const positiveVoltage = positiveConnected
    ? resolveNodeVoltage(
        args.positiveKey,
        args.sourceReach,
        args.sinkReach,
        args.signalGraph,
        args.sources,
        args.sinks,
        args.nodes,
        args.dynamicComponents,
      )
    : 0;

  const negativeVoltage = negativeConnected
    ? resolveNodeVoltage(
        args.negativeKey,
        args.sourceReach,
        args.sinkReach,
        args.signalGraph,
        args.sources,
        args.sinks,
        args.nodes,
        args.dynamicComponents,
      )
    : 0;

  const connected = positiveConnected && negativeConnected;
  const voltage = connected ? positiveVoltage - negativeVoltage : 0;
  const referenceVoltage = Math.max(
    Math.abs(positive.source?.voltage ?? 0),
    Math.abs(negative.source?.voltage ?? 0),
    5,
  );

  return {
    voltage,
    normalizedValue: clamp01(Math.abs(voltage) / referenceVoltage),
    positive: { ...positive, voltage: positiveVoltage },
    negative: { ...negative, voltage: negativeVoltage },
    source: connected ? (positive.source ?? negative.source) : null,
  };
}
