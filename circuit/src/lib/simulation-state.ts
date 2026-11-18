import type {
  CircuitEdge,
  CircuitNode,
  ComponentDefinition,
  PinDefinition,
} from "./types";
import type { PinState, SimulatorState } from "./arduino-simulator";
import {
  getServoAngleAtTime,
  type SimulationServoMotion,
} from "./servo-motion";
import { getBreadboardAutoConnections } from "./breadboard-autoconnect";
import { COMPONENT_CATALOG } from "./circuit-components";
import { spstRelayState } from "./simulation/frameTransformers/spstRelay";

export const TILT_THRESHOLD = 45;

export function isPinConnectedInGraph(pinKey: string, graph: Map<string, Set<string>>): boolean {
  if (graph.has(pinKey) && (graph.get(pinKey)?.size ?? 0) > 0) return true;
  for (const neighbors of graph.values()) {
    if (neighbors.has(pinKey)) return true;
  }
  return false;
}
import {
  analyzeResistorNetworks,
  getNetworkSummary,
} from "./resistor-network-analyzer";
import { measureProbePair } from "./simulation/probes/probeUtils";
import { evaluateMultimeterComponentState } from "./simulation/multimeter";
import { validateComponentConnections } from "../utils/connectivity";

export type SimulationBoardType = "arduino" | "pico" | "esp32" | "none";

let currentHighWeightNodes = new Set<string>();

export interface SimulationNodePinState {
  handleId: string;
  voltage: number;
  normalizedValue: number;
  active: boolean;
}

export interface SimulationComponentState {
  nodeId: string;
  componentType: string;
  label: string;
  isPowered: boolean;
  brightness: number;
  voltage: number;
  telemetry: Record<string, number | string | boolean>;
  pins: Record<string, SimulationNodePinState>;
}

export interface SimulationBoardPinState {
  pin: number;
  handleId: string;
  mode: string;
  value: number;
  normalizedValue: number;
  voltage: number;
  active: boolean;
  frequency?: number;
}

export interface SimulationFrame {
  tick: number;
  timestamp: number;
  running: boolean;
  boardType: SimulationBoardType;
  serialOutput: string[];
  bluetoothOutput?: string[];
  bluetoothDeviceName?: string;
  error: string | null;
  components: Record<string, SimulationComponentState>;
  boardPins: SimulationBoardPinState[];
  sessionId?: string;
}

export interface SimulationSnapshot {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  dynamicComponents?: ComponentDefinition[];
  boardType: SimulationBoardType;
  arduinoCode: string;
  picoCode: string;
  servoMotions?: SimulationServoMotion[];
  sessionId?: string;
}

export type SimulationStartPayload = SimulationSnapshot;

export type NormalizedBoardPin = {
  handleId: string;
  pin: number;
  mode: string;
  value: number;
  normalizedValue: number;
  voltage: number;
  active: boolean;
  kind: "source" | "sink" | "floating";
  frequency?: number;
};

const ARDUINO_GROUND_HANDLES = new Set(["gnd1", "gnd2", "gnd3"]);
const BATTERY_TYPES = new Set([
  "battery9v",
  "battery1_5v",
  "coincell",
  "powerSupply",
]);

interface BatteryInfo {
  nodeId: string;
  voltage: number;
  positivePin: string;
  negativePin: string;
  positiveKey: string;
  negativeKey: string;
  internalResistance: number;
  capacity: number;
}

interface BatteryNetwork {
  batteries: BatteryInfo[];
  configuration: "single" | "series" | "parallel" | "mixed" | "invalid";
  equivalentVoltage: number;
  equivalentCapacity: number;
  equivalentInternalResistance: number;
  warnings: string[];
  components?: {
    batteries: BatteryInfo[];
    analysis: Omit<BatteryNetwork, "batteries">;
  }[];
}
const LOAD_COMPONENTS = new Set([
  "resistor",
  "photoresistor",
  "forceSensor",
  "flexSensor",
  "capacitor",
  "dcmotor",
  "vibrationMotor",
  "hobbyGearmotor",
  "led",
]);
const OHM = "\u03A9";
const RESISTANCE_MULTIPLIERS: Record<string, number> = {
  [`p${OHM}`]: 1e-12,
  [`n${OHM}`]: 1e-9,
  [`\u00B5${OHM}`]: 1e-6,
  [`m${OHM}`]: 1e-3,
  [OHM]: 1,
  [`k${OHM}`]: 1e3,
  [`M${OHM}`]: 1e6,
  [`G${OHM}`]: 1e9,
};
const CAPACITANCE_MULTIPLIERS: Record<string, number> = {
  pF: 1e-12,
  nF: 1e-9,
  ["\u00B5F"]: 1e-6,
  mF: 1e-3,
  F: 1,
};
export const PIN_ALIASES = {
  positive: ["positive", "plus", "vcc", "power", "anode", "pin1", "+"],
  negative: ["negative", "minus", "ground", "gnd", "cathode", "pin2", "-"],
  signal: ["signal", "sig", "out", "analog", "data", "pin1"],
  wiper: ["wiper", "slider", "tap", "signal", "sig", "out", "analog", "data"],
  red: ["red", "r"],
  green: ["green", "g"],
  blue: ["blue", "b"],
  common: ["common", "com"],
};

export function endpointKey(nodeId: string, handleId: string) {
  return `${nodeId}:${handleId}`;
}

function getNodeLabel(node: CircuitNode) {
  const customName = node.data.properties?.name?.value;
  return typeof customName === "string" && customName.trim().length > 0
    ? customName
    : node.data.label;
}

export function getResistanceOhms(node: CircuitNode) {
  const resistance = Number(node.data.properties?.resistance?.value ?? 0);
  if (!Number.isFinite(resistance)) return 0;
  const unit = String(node.data.properties?.resistance?.unit ?? OHM);
  return resistance * (RESISTANCE_MULTIPLIERS[unit] ?? 1);
}

export function getPotentiometerWiperVoltage(
  voltage1: number,
  voltage2: number,
  positionPercent: number,
): number {
  const ratio = Math.max(0, Math.min(100, positionPercent)) / 100;
  return voltage1 * ratio + voltage2 * (1 - ratio);
}

export function getPotentiometerResistance(
  node: CircuitNode,
  pinA: string,
  pinB: string,
  dynamicComponents?: ComponentDefinition[],
): number {
  const totalResistance = getResistanceOhms(node);
  const position = Math.max(
    0,
    Math.min(100, Number(node.data.properties?.position?.value ?? 50)),
  );
  const ratio = position / 100;

  const pin1 = findPinId(node, dynamicComponents, [
    "pin1",
    ...PIN_ALIASES.positive,
  ]);
  const pin2 = findPinId(node, dynamicComponents, [
    "pin2",
    ...PIN_ALIASES.negative,
  ]);
  const wiper = findPinId(node, dynamicComponents, [
    "wiper",
    ...PIN_ALIASES.wiper,
  ]);

  // Strip handleId / endpointKey prefixes if present
  const cleanPinA = pinA.includes(":")
    ? pinA.slice(pinA.lastIndexOf(":") + 1)
    : pinA;
  const cleanPinB = pinB.includes(":")
    ? pinB.slice(pinB.lastIndexOf(":") + 1)
    : pinB;

  const set = new Set([cleanPinA, cleanPinB]);
  if (set.has(pin1) && set.has(wiper)) {
    return totalResistance * ratio;
  }
  if (set.has(wiper) && set.has(pin2)) {
    return totalResistance * (1 - ratio);
  }
  if (set.has(pin1) && set.has(pin2)) {
    return totalResistance;
  }
  return 0;
}

function getPhotoresistorFraction(rawLightLevel: number): number {
  const clamped = Math.max(0, Math.min(1023, rawLightLevel));
  if (clamped <= 100) {
    return (clamped / 100) * 0.5;
  }
  return 0.5 + ((clamped - 100) / 923) * 0.5;
}

// function getPhotoresistorOhms(node: CircuitNode) {
//   const rawLightLevel = Number(node.data.properties?.lightLevel?.value ?? 512);
//   const fraction = getPhotoresistorFraction(rawLightLevel);
//   return 100 + (1_000_000 - 100) * Math.pow(1 - fraction, 2);
// }
export function getPhotoresistorOhms(node: CircuitNode) {
  const lightLevel = Math.max(
    0,
    Math.min(100, Number(node.data.properties?.lightLevel?.value ?? 50)),
  );
  return 100 + (1_000_000 - 100) * Math.pow(1 - lightLevel / 100, 2);
}

function getCapacitanceFarads(node: CircuitNode) {
  const capacitance = Number(node.data.properties?.capacitance?.value ?? 0);
  if (!Number.isFinite(capacitance)) return 0;
  const unit = String(node.data.properties?.capacitance?.unit ?? "\u00B5F");
  return capacitance * (CAPACITANCE_MULTIPLIERS[unit] ?? 1e-6);
}

function getDynamicDefinition(
  node: CircuitNode,
  dynamicComponents?: ComponentDefinition[],
) {
  return dynamicComponents?.find(
    (component) => component.type === node.data.componentType,
  );
}

export function getComponentDefinition(
  node: CircuitNode,
  dynamicComponents?: ComponentDefinition[],
) {
  return (
    getDynamicDefinition(node, dynamicComponents) ??
    COMPONENT_CATALOG.find(
      (component) => component.type === node.data.componentType,
    )
  );
}

export function getNodeSimulationModel(
  node: CircuitNode,
  dynamicComponents?: ComponentDefinition[],
) {
  const model =
    node.data.simulationModel ??
    getComponentDefinition(node, dynamicComponents)?.simulationModel;
  return typeof model === "string" &&
    model.trim().length > 0 &&
    model !== "generic"
    ? model
    : node.data.componentType;
}

function normalizePinText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+_-]/g, "");
}

export function findPinId(
  node: CircuitNode,
  dynamicComponents: ComponentDefinition[] | undefined,
  candidates: string[],
) {
  const pins: PinDefinition[] =
    getComponentDefinition(node, dynamicComponents)?.pins ?? [];
  const normalizedCandidates = candidates.map(normalizePinText);
  const match = pins.find((pin) => {
    const id = normalizePinText(pin.id);
    const label = normalizePinText(pin.label);
    return (
      normalizedCandidates.includes(id) || normalizedCandidates.includes(label)
    );
  });
  return match?.id ?? candidates[0];
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getStrongestSource(sources: NormalizedBoardPin[]) {
  return sources.reduce<NormalizedBoardPin | null>((best, current) => {
    if (!best) return current;
    return current.voltage > best.voltage ? current : best;
  }, null);
}

export function getSourceLabel(source: NormalizedBoardPin | null) {
  return source?.handleId.split(":").at(-1) ?? "NO SIGNAL";
}

function getSourceNodeId(source: NormalizedBoardPin | null) {
  return source?.handleId.split(":")[0] ?? null;
}

function getProbeReading(
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

function resolveNodeVoltage(
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

export function getLedForwardVoltage(node: CircuitNode) {
  const voltageVal =
    node.data.properties?.voltage?.value ??
    node.data.properties?.maxVoltage?.value;
  if (voltageVal !== undefined && voltageVal !== null) {
    const parsed = Number(voltageVal);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const color = String(node.data.properties?.color?.value ?? "").toLowerCase();
  if (color === "white") return 3.2;
  if (color === "blue") return 3.0;
  if (color === "green") return 2.1;
  if (color === "yellow") return 2.0;
  if (color === "red") return 2.0;
  return 2.0;
}

export function reverseGraph(
  graph: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const reversed = new Map<string, Set<string>>();
  for (const [node, neighbors] of graph.entries()) {
    if (!reversed.has(node)) {
      reversed.set(node, new Set());
    }
    for (const neighbor of neighbors) {
      if (!reversed.has(neighbor)) {
        reversed.set(neighbor, new Set());
      }
      reversed.get(neighbor)!.add(node);
    }
  }
  return reversed;
}

export function findShortestPath(
  graph: Map<string, Set<string>>,
  start: string,
  targets: Set<string>,
  blocked: string,
): string[] | null {
  if (start === blocked) return null;
  if (targets.has(start)) return [start];

  const dist = new Map<string, number>();
  const parent = new Map<string, string>();
  const unvisited = new Set<string>();

  dist.set(start, 0);
  unvisited.add(start);

  while (unvisited.size > 0) {
    let current: string | null = null;
    let minDist = Infinity;
    for (const node of unvisited) {
      const d = dist.get(node) ?? Infinity;
      if (d < minDist) {
        minDist = d;
        current = node;
      }
    }

    if (current === null || minDist === Infinity) break;
    unvisited.delete(current);

    if (targets.has(current)) {
      const path: string[] = [];
      let curr: string | undefined = current;
      while (curr !== undefined) {
        path.push(curr);
        curr = parent.get(curr);
      }
      return path.reverse();
    }

    const neighbors = graph.get(current);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (neighbor === blocked) continue;

      let weight = 1;
      const lastColon = neighbor.lastIndexOf(":");
      if (lastColon !== -1) {
        const nodeId = neighbor.slice(0, lastColon);
        if (currentHighWeightNodes.has(nodeId)) {
          const lastColonCurr = current.lastIndexOf(":");
          const nodeIdCurr = current.slice(0, lastColonCurr);
          if (nodeId === nodeIdCurr) {
            weight = 1000;
          }
        }
      }

      const alt = minDist + weight;
      const neighborDist = dist.get(neighbor) ?? Infinity;
      if (alt < neighborDist) {
        dist.set(neighbor, alt);
        parent.set(neighbor, current);
        unvisited.add(neighbor);
      }
    }
  }

  return null;
}

function getSeriesResistanceNearEndpoint(args: {
  endpoint: string;
  graph: Map<string, Set<string>>;
  nodes: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
  directSourceReach: Map<string, NormalizedBoardPin[]>;
  directSinkReach: Set<string>;
  side: "source" | "sink";
}) {
  const island = new Set(collectReachable(args.graph, args.endpoint));
  let resistance = 0;
  let count = 0;

  for (const node of args.nodes) {
    const model = getNodeSimulationModel(node, args.dynamicComponents);
    if (model === "resistor" || model === "photoresistor") {
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
      const pin1InIsland = island.has(pin1);
      const pin2InIsland = island.has(pin2);
      if (pin1InIsland === pin2InIsland) continue;

      const otherPin = pin1InIsland ? pin2 : pin1;
      const connectedToSide =
        args.side === "source"
          ? (args.directSourceReach.get(otherPin)?.length ?? 0) > 0
          : args.directSinkReach.has(otherPin);

      if (!connectedToSide) continue;
      resistance +=
        model === "photoresistor"
          ? getPhotoresistorOhms(node)
          : Math.max(0, getResistanceOhms(node));
      count += 1;
    } else if (model === "potentiometer") {
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

      const pin1InIsland = island.has(pin1);
      const pin2InIsland = island.has(pin2);
      const wiperInIsland = island.has(wiper);

      const checkAndAdd = (
        pIn: string,
        pOut: string,
        termA: string,
        termB: string,
      ) => {
        if (island.has(pIn) && !island.has(pOut)) {
          const connectedToSide =
            args.side === "source"
              ? (args.directSourceReach.get(pOut)?.length ?? 0) > 0
              : args.directSinkReach.has(pOut);
          if (connectedToSide) {
            resistance += getPotentiometerResistance(
              node,
              termA,
              termB,
              args.dynamicComponents,
            );
            count += 1;
            return true;
          }
        }
        return false;
      };

      if (checkAndAdd(pin1, wiper, "pin1", "wiper")) continue;
      if (checkAndAdd(wiper, pin1, "pin1", "wiper")) continue;
      if (checkAndAdd(wiper, pin2, "wiper", "pin2")) continue;
      if (checkAndAdd(pin2, wiper, "wiper", "pin2")) continue;
      if (checkAndAdd(pin1, pin2, "pin1", "pin2")) continue;
      if (checkAndAdd(pin2, pin1, "pin1", "pin2")) continue;
    }
  }

  return { resistance, count };
}

function getCircuitSeriesResistance(args: {
  nodes: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
  directSourceReach: Map<string, NormalizedBoardPin[]>;
  directSinkReach: Set<string>;
}) {
  let resistance = 0;
  let count = 0;

  for (const node of args.nodes) {
    const model = getNodeSimulationModel(node, args.dynamicComponents);
    if (model !== "resistor" && model !== "photoresistor") continue;

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
    const pin1HasSource = (args.directSourceReach.get(pin1)?.length ?? 0) > 0;
    const pin2HasSource = (args.directSourceReach.get(pin2)?.length ?? 0) > 0;
    const pin1HasSink = args.directSinkReach.has(pin1);
    const pin2HasSink = args.directSinkReach.has(pin2);
    const bridgesSupply =
      (pin1HasSource && pin2HasSink) || (pin2HasSource && pin1HasSink);

    if (!bridgesSupply) continue;
    resistance +=
      model === "photoresistor"
        ? getPhotoresistorOhms(node)
        : Math.max(0, getResistanceOhms(node));
    count += 1;
  }

  return { resistance, count };
}

function measurePassiveResistance(args: {
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

  // Determine if resistors are in parallel or series
  // For parallel: all resistors must connect to the same two nets
  // For series: resistors connect in a chain

  // Check if all resistors connect to the same two nets (parallel configuration)
  // A resistor is parallel if both its pins connect to the positive and negative nets
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

    // For parallel: one pin in positive net, one pin in negative net
    return (
      (pin1InPositive && pin2InNegative) || (pin1InNegative && pin2InPositive)
    );
  });

  let totalResistance: number;

  if (allParallel && count > 1) {
    // Parallel: 1/R_total = 1/R1 + 1/R2 + ...
    const reciprocalSum = bridgingResistors.reduce((sum, r) => {
      return sum + (r.resistance > 0 ? 1 / r.resistance : 0);
    }, 0);
    totalResistance = reciprocalSum > 0 ? 1 / reciprocalSum : Infinity;
  } else {
    // Series: R_total = R1 + R2 + ...
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

function measurePassiveDiode(args: {
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

type CircuitProbeMeasurement =
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

function measureCircuitAcrossProbes(args: {
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
  const noBlockedEndpoint = "\u0000";

  const measureOrientation = (
    positiveKey: string,
    negativeKey: string,
    polarity: 1 | -1,
  ): CircuitProbeMeasurement | null => {
    // Find path from positive probe back to source (upstream)
    const sourcePath = findShortestPath(
      reversedGraph,
      positiveKey,
      sourceTargets,
      negativeKey,
    );
    // Find path from negative probe to sink (downstream)
    const sinkPath = findShortestPath(
      args.graph,
      negativeKey,
      sinkTargets,
      positiveKey,
    );

    if (!sourcePath || !sinkPath) return null;

    const sourceKey = sourcePath[sourcePath.length - 1];
    const sourcePin = args.sources.find(
      (source) => source.handleId === sourceKey,
    )!;
    const sourceVoltage = sourcePin?.voltage ?? 0;

    // Build the full path: source → positive_probe → negative_probe → sink
    // First try to find a direct path between probes
    const noBlockedEndpoint = "\u0000";
    const segmentPathDirect =
      positiveKey === negativeKey
        ? [positiveKey]
        : findShortestPath(
          args.graph,
          positiveKey,
          new Set([negativeKey]),
          noBlockedEndpoint,
        );

    if (segmentPathDirect) {
      // Direct path exists between probes - use it normally
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
        voltage: polarity * voltage,
        current: polarity * current,
        connected: true,
        sourceVoltage,
        totalResistance,
        totalVoltageDrop: fullLoad.V_drop_load,
        measuredResistance: segmentLoad.R_load,
        measuredVoltageDrop: segmentLoad.V_drop_load,
      };
    }

    // No direct segment path (probes are in series with the circuit).
    // CRITICAL: The (-) probe's only route back to source goes THROUGH the (+) probe,
    // so we must NOT block positiveKey here — use noBlockedEndpoint instead.
    const negSourcePath = findShortestPath(
      reversedGraph,
      negativeKey,
      sourceTargets,
      noBlockedEndpoint,
    );
    if (!negSourcePath) return null;

    // Build paths from source to each probe individually
    const pathFromSourceToPositive = [...sourcePath].reverse();
    const pathFromSourceToNegative = [...negSourcePath].reverse();

    // Full circuit for current calculation: source → (-) probe → sink
    const fullPath = pathFromSourceToNegative.concat(sinkPath.slice(1));
    const fullLoad = getPathLoadParameters({
      fullPath,
      nodes: args.nodes,
      dynamicComponents: args.dynamicComponents,
    });

    if (sourceVoltage <= fullLoad.V_drop_load)
      return { voltage: 0, current: 0, connected: false };

    const totalResistance = fullLoad.R_load > 0 ? fullLoad.R_load : 10;
    const current = (sourceVoltage - fullLoad.V_drop_load) / totalResistance;

    // Voltage at each probe = sourceVoltage minus accumulated drops up to that probe
    const beforePositiveLoad = getPathLoadParameters({
      fullPath: pathFromSourceToPositive,
      nodes: args.nodes,
      dynamicComponents: args.dynamicComponents,
    });
    const beforeNegativeLoad = getPathLoadParameters({
      fullPath: pathFromSourceToNegative,
      nodes: args.nodes,
      dynamicComponents: args.dynamicComponents,
    });

    const voltageAtPositive = Math.max(
      0,
      sourceVoltage -
      beforePositiveLoad.V_drop_load -
      current * beforePositiveLoad.R_load,
    );
    const voltageAtNegative = Math.max(
      0,
      sourceVoltage -
      beforeNegativeLoad.V_drop_load -
      current * beforeNegativeLoad.R_load,
    );
    const measuredVoltage = Math.max(0, voltageAtPositive - voltageAtNegative);

    return {
      voltage: polarity * measuredVoltage,
      current: polarity * current,
      connected: true,
      sourceVoltage,
      totalResistance,
      totalVoltageDrop: fullLoad.V_drop_load,
      measuredResistance: 0,
      measuredVoltageDrop: measuredVoltage,
    };
  };

  return (
    measureOrientation(args.positiveKey, args.negativeKey, 1) ??
    measureOrientation(args.negativeKey, args.positiveKey, -1) ?? {
      voltage: undefined,
      current: undefined,
      connected: false,
    }
  );
}

function connect(graph: Map<string, Set<string>>, a: string, b: string) {
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a)!.add(b);
  graph.get(b)!.add(a);
}

// One-way connection: current can flow from a → b but NOT b → a
// Used for LEDs and diodes to enforce polarity
function connectOneWay(graph: Map<string, Set<string>>, a: string, b: string) {
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a)!.add(b); // only a → b
}

function getSlideswitchActiveThrow(node: CircuitNode) {
  const state = node.data.properties?.state?.value;
  // Real SPDT slide switch with 3 terminals: pin1 (left), common (middle), pin2 (right)
  //   'left'  → common is connected to pin1 (left terminal)
  //   'right' → common is connected to pin2 (right terminal)
  //   anything else → open circuit
  if (state === "left") return "pin1";
  if (state === "right") return "pin2";
  // Legacy fallback: treat old 'on' as 'right', 'off' as 'left'
  if (state === "on") return "pin2";
  if (state === "off") return "pin1";
  return null; // open circuit
}

function addConductiveNodeInternalEdges(
  graph: Map<string, Set<string>>,
  node: CircuitNode,
  options: {
    includeLoads: boolean;
    excludeAmmeter?: boolean;
    activeTransistorNodeIds?: Set<string>;
    activeRelayNodeIds?: Set<string>;
  },
  dynamicComponents?: ComponentDefinition[],
) {
  const model = getNodeSimulationModel(node, dynamicComponents);

  if (options.includeLoads) {
    // LED is polarity-sensitive — use one-way (anode → cathode) edge
    // so that reverse-biased LED (cathode→+, anode→-) does NOT light up
    if (model === "led") {
      const anode = findPinId(node, dynamicComponents, [
        "anode",
        ...PIN_ALIASES.positive,
      ]);
      const cathode = findPinId(node, dynamicComponents, [
        "cathode",
        ...PIN_ALIASES.negative,
      ]);
      connectOneWay(
        graph,
        endpointKey(node.id, anode),
        endpointKey(node.id, cathode),
      );
      return;
    }
    if (model === "diode" || model === "polarizedCapacitor") {
      const anode = findPinId(node, dynamicComponents, [
        "anode",
        "pin1",
        ...PIN_ALIASES.positive,
      ]);
      const cathode = findPinId(node, dynamicComponents, [
        "cathode",
        "pin2",
        ...PIN_ALIASES.negative,
      ]);
      connectOneWay(
        graph,
        endpointKey(node.id, anode),
        endpointKey(node.id, cathode),
      );
      return;
    }
    if (model === "sevenSegment") {
      const displayType = String(node.data.properties?.displayType?.value ?? "Common Cathode");
      const isCommonAnode = displayType === "Common Anode";
      const comPins = ["com1", "com2"];
      const segPins = ["a", "b", "c", "d", "e", "f", "g", "dp"];

      for (const seg of segPins) {
        for (const com of comPins) {
          if (isCommonAnode) {
            connectOneWay(graph, endpointKey(node.id, com), endpointKey(node.id, seg));
          } else {
            connectOneWay(graph, endpointKey(node.id, seg), endpointKey(node.id, com));
          }
        }
      }
      return;
    }
    if (LOAD_COMPONENTS.has(model)) {
      const pin1 = findPinId(node, dynamicComponents, [
        "pin1",
        ...PIN_ALIASES.positive,
      ]);
      const pin2 = findPinId(node, dynamicComponents, [
        "pin2",
        ...PIN_ALIASES.negative,
      ]);
      connect(graph, endpointKey(node.id, pin1), endpointKey(node.id, pin2));
      return;
    }
  }

  const isTransistor = model === "npn" || model === "pnp";
  const isMosfet = model === "nmosSignal" || model === "pmosSignal";
  if (isTransistor || isMosfet) {
    if (options.activeTransistorNodeIds?.has(node.id)) {
      const pin1 = findPinId(
        node,
        dynamicComponents,
        isTransistor ? ["collector"] : ["drain"],
      );
      const pin2 = findPinId(
        node,
        dynamicComponents,
        isTransistor ? ["emitter"] : ["source"],
      );
      connect(graph, endpointKey(node.id, pin1), endpointKey(node.id, pin2));
    }
    return;
  }

  if (model === "breadboard") {
    for (const railPrefix of [
      "top_positive",
      "top_negative",
      "bottom_positive",
      "bottom_negative",
    ]) {
      const rail = Array.from(
        { length: 30 },
        (_, index) => `${railPrefix}_${index + 1}`,
      );
      for (let index = 0; index < rail.length - 1; index += 1) {
        connect(
          graph,
          endpointKey(node.id, rail[index]),
          endpointKey(node.id, rail[index + 1]),
        );
      }
    }

    for (let column = 1; column <= 30; column += 1) {
      const topGroup = ["j", "i", "h", "g", "f"].map(
        (row) => `${row}${column}`,
      );
      const bottomGroup = ["e", "d", "c", "b", "a"].map(
        (row) => `${row}${column}`,
      );
      for (const group of [topGroup, bottomGroup]) {
        for (let index = 0; index < group.length - 1; index += 1) {
          connect(
            graph,
            endpointKey(node.id, group[index]),
            endpointKey(node.id, group[index + 1]),
          );
        }
      }
    }
    return;
  }

  if (model === "potentiometer") {
    if (options.includeLoads) {
      const pin1 = findPinId(node, dynamicComponents, [
        "pin1",
        ...PIN_ALIASES.positive,
      ]);
      const pin2 = findPinId(node, dynamicComponents, [
        "pin2",
        ...PIN_ALIASES.negative,
      ]);
      const wiper = findPinId(node, dynamicComponents, [
        "wiper",
        ...PIN_ALIASES.wiper,
      ]);
      connect(graph, endpointKey(node.id, pin1), endpointKey(node.id, wiper));
      connect(graph, endpointKey(node.id, wiper), endpointKey(node.id, pin2));
      connect(graph, endpointKey(node.id, pin1), endpointKey(node.id, pin2));
    }
    return;
  }

  if (model === "tiltSensor") {
    const angle = Number(node.data.properties?.angle?.value ?? 0);
    if (angle >= TILT_THRESHOLD) {
      const pin1 = findPinId(node, dynamicComponents, ["pin1"]);
      const pin2 = findPinId(node, dynamicComponents, ["pin2"]);
      connect(graph, endpointKey(node.id, pin1), endpointKey(node.id, pin2));
    }
    return;
  }

  if (model === "slideswitch") {
    const common = findPinId(node, dynamicComponents, [
      "common",
      ...PIN_ALIASES.common,
    ]);
    const activeThrow = getSlideswitchActiveThrow(node);
    // Only connect if the switch is closed (not null/open)
    if (activeThrow !== null) {
      connect(
        graph,
        endpointKey(node.id, common),
        endpointKey(node.id, activeThrow),
      );
    }
    return;
  }

  if (model === "pushbutton") {
    const pin1a = findPinId(node, dynamicComponents, ["pin1a"]);
    const pin1b = findPinId(node, dynamicComponents, ["pin1b"]);
    const pin2a = findPinId(node, dynamicComponents, ["pin2a"]);
    const pin2b = findPinId(node, dynamicComponents, ["pin2b"]);
    connect(graph, endpointKey(node.id, pin1a), endpointKey(node.id, pin1b));
    connect(graph, endpointKey(node.id, pin2a), endpointKey(node.id, pin2b));
    if (node.data.properties?.state?.value === "on") {
      connect(graph, endpointKey(node.id, pin1a), endpointKey(node.id, pin2a));
      connect(graph, endpointKey(node.id, pin1b), endpointKey(node.id, pin2b));
    }
    return;
  }

  if (model === "relaySpst") {
    const com1 = findPinId(node, dynamicComponents, ["terminal6", "com1", "com"]);
    const com2 = findPinId(node, dynamicComponents, ["terminal7", "com2", "com"]);
    const noPin = findPinId(node, dynamicComponents, ["terminal12", "no"]);
    const ncPin = findPinId(node, dynamicComponents, ["terminal1", "nc"]);
    if (com1 && com2) {
      connect(graph, endpointKey(node.id, com1), endpointKey(node.id, com2));
    }
    const isEnergized =
      options.activeRelayNodeIds?.has(node.id) ??
      (node.data.properties?.state?.value === "on");
    if (isEnergized) {
      if (com1 && noPin) connect(graph, endpointKey(node.id, com1), endpointKey(node.id, noPin));
      if (com2 && noPin) connect(graph, endpointKey(node.id, com2), endpointKey(node.id, noPin));
    } else {
      if (com1 && ncPin) connect(graph, endpointKey(node.id, com1), endpointKey(node.id, ncPin));
      if (com2 && ncPin) connect(graph, endpointKey(node.id, com2), endpointKey(node.id, ncPin));
    }
    return;
  }

  if (model === "arduino") {
    connect(graph, endpointKey(node.id, "gnd1"), endpointKey(node.id, "gnd2"));
    connect(graph, endpointKey(node.id, "gnd2"), endpointKey(node.id, "gnd3"));
    return;
  }

  if (model === "neopixel") {
    connect(graph, endpointKey(node.id, "ground1"), endpointKey(node.id, "ground2"));
    connect(graph, endpointKey(node.id, "vcc1"), endpointKey(node.id, "vcc2"));
    return;
  }

  if (model === "multimeter") {
    if (!options.excludeAmmeter) {
      const rawMode = String(node.data.properties?.mode?.value ?? "voltage");
      const mode =
        rawMode === "voltage_ac"
          ? "voltage"
          : rawMode === "current_ac"
            ? "current"
            : rawMode;
      if (mode === "current") {
        const positivePin = findPinId(node, dynamicComponents, [
          "positive",
          ...PIN_ALIASES.positive,
        ]);
        const negativePin = findPinId(node, dynamicComponents, [
          "negative",
          ...PIN_ALIASES.negative,
        ]);
        connect(
          graph,
          endpointKey(node.id, positivePin),
          endpointKey(node.id, negativePin),
        );
      }
    }
    return;
  }

  if (model === "relayDpdt") {
    const isEnergized = options.activeRelayNodeIds?.has(node.id) ?? false;
    if (isEnergized) {
      // COM1 (terminal4) connects to NO1 (terminal8)
      connect(graph, endpointKey(node.id, "terminal4"), endpointKey(node.id, "terminal8"));
      // COM2 (terminal13) connects to NO2 (terminal9)
      connect(graph, endpointKey(node.id, "terminal13"), endpointKey(node.id, "terminal9"));
    } else {
      // COM1 (terminal4) connects to NC1 (terminal6)
      connect(graph, endpointKey(node.id, "terminal4"), endpointKey(node.id, "terminal6"));
      // COM2 (terminal13) connects to NC2 (terminal11)
      connect(graph, endpointKey(node.id, "terminal13"), endpointKey(node.id, "terminal11"));
    }
    return;
  }
}

export function collectReachable(
  graph: Map<string, Set<string>>,
  start: string,
  visited = new Set<string>(),
) {
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = graph.get(current);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return visited;
}

export function collectReachableBlocked(
  graph: Map<string, Set<string>>,
  start: string,
  blocked: string,
) {
  const visited = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === blocked) continue;
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = graph.get(current);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor) && neighbor !== blocked) {
        queue.push(neighbor);
      }
    }
  }

  return visited;
}

function getBatteryInfo(
  node: CircuitNode,
  dynamicComponents?: ComponentDefinition[],
): BatteryInfo | null {
  const model = getNodeSimulationModel(node, dynamicComponents);
  if (!BATTERY_TYPES.has(model)) return null;

  let voltage = Math.max(
    0,
    Number(
      node.data.properties?.voltage?.value ??
        (model === "battery9v"
          ? 9
          : model === "battery1_5v"
            ? 1.5
            : model === "coincell"
              ? 3.0
              : 0),
    ),
  );
  if (model === "battery1_5v" && voltage === 0) {
    voltage = 1.5;
  } else if (model === "coincell" && voltage === 0) {
    voltage = 3.0;
  } else if (model === "battery9v" && voltage === 0) {
    voltage = 9.0;
  }
  const positivePin = findPinId(node, dynamicComponents, [
    "positive",
    ...PIN_ALIASES.positive,
  ]);
  const negativePin = findPinId(node, dynamicComponents, [
    "negative",
    ...PIN_ALIASES.negative,
  ]);

  // Default internal resistance based on battery type (in ohms)
  let internalResistance = 0.1;
  let capacity = 1000; // Default capacity in mAh

  if (model === "battery9v") {
    internalResistance = 1.5;
    capacity = 500;
  } else if (model === "battery1_5v") {
    internalResistance = 0.2;
    capacity = 2000;
  } else if (model === "coincell") {
    internalResistance = 10;
    capacity = 200;
  } else if (model === "powerSupply") {
    internalResistance = 0.05;
    capacity = 10000;
  }

  return {
    nodeId: node.id,
    voltage,
    positivePin,
    negativePin,
    positiveKey: endpointKey(node.id, positivePin),
    negativeKey: endpointKey(node.id, negativePin),
    internalResistance,
    capacity,
  };
}

function analyzeBatteryComponent(
  batteries: BatteryInfo[],
  graph: Map<string, Set<string>>,
): {
  configuration: "single" | "series" | "parallel" | "mixed" | "invalid";
  equivalentVoltage: number;
  equivalentCapacity: number;
  equivalentInternalResistance: number;
  warnings: string[];
} {
  if (batteries.length === 1) {
    return {
      configuration: "single",
      equivalentVoltage: batteries[0].voltage,
      equivalentCapacity: batteries[0].capacity,
      equivalentInternalResistance: batteries[0].internalResistance,
      warnings: [],
    };
  }

  const warnings: string[] = [];

  // Group batteries by connected positive and negative terminals
  const positiveGroups = new Map<string, BatteryInfo[]>();
  const negativeGroups = new Map<string, BatteryInfo[]>();

  for (const battery of batteries) {
    const positiveNet = collectReachable(graph, battery.positiveKey);
    const negativeNet = collectReachable(graph, battery.negativeKey);

    // Find which positive net this battery belongs to
    let positiveGroupId: string | null = null;
    for (const [id, group] of positiveGroups.entries()) {
      if (group.length > 0 && positiveNet.has(group[0].positiveKey)) {
        positiveGroupId = id;
        break;
      }
    }
    if (!positiveGroupId) {
      positiveGroupId = `pos_${battery.nodeId}`;
      positiveGroups.set(positiveGroupId, []);
    }
    positiveGroups.get(positiveGroupId)!.push(battery);

    // Find which negative net this battery belongs to
    let negativeGroupId: string | null = null;
    for (const [id, group] of negativeGroups.entries()) {
      if (group.length > 0 && negativeNet.has(group[0].negativeKey)) {
        negativeGroupId = id;
        break;
      }
    }
    if (!negativeGroupId) {
      negativeGroupId = `neg_${battery.nodeId}`;
      negativeGroups.set(negativeGroupId, []);
    }
    negativeGroups.get(negativeGroupId)!.push(battery);

    // Check for reverse polarity connections
    for (const other of batteries) {
      if (other.nodeId === battery.nodeId) continue;
      if (positiveNet.has(other.negativeKey)) {
        warnings.push(
          `Reverse polarity detected: ${battery.nodeId} positive connected to ${other.nodeId} negative`,
        );
      }
      if (negativeNet.has(other.positiveKey)) {
        warnings.push(
          `Reverse polarity detected: ${battery.nodeId} negative connected to ${other.nodeId} positive`,
        );
      }
    }
  }

  // Check for direct positive-positive or negative-negative connections
  for (const battery of batteries) {
    const positiveNet = collectReachable(graph, battery.positiveKey);
    const negativeNet = collectReachable(graph, battery.negativeKey);

    for (const other of batteries) {
      if (other.nodeId === battery.nodeId) continue;
      if (positiveNet.has(other.positiveKey)) {
        warnings.push(
          `Positive-to-positive connection: ${battery.nodeId} and ${other.nodeId}`,
        );
      }
      if (negativeNet.has(other.negativeKey)) {
        warnings.push(
          `Negative-to-negative connection: ${battery.nodeId} and ${other.nodeId}`,
        );
      }
    }
  }

  // Determine configuration
  const positiveGroupCount = positiveGroups.size;
  const negativeGroupCount = negativeGroups.size;

  let configuration: BatteryNetwork["configuration"] = "invalid";
  let equivalentVoltage = 0;
  let equivalentCapacity = 0;
  let equivalentInternalResistance = 0;

  if (positiveGroupCount === 1 && negativeGroupCount === 1) {
    // All positives connected together, all negatives connected together = Parallel
    configuration = "parallel";
    const voltages = batteries.map((b) => b.voltage);
    const minVoltage = Math.min(...voltages);
    const maxVoltage = Math.max(...voltages);

    if (maxVoltage - minVoltage > 0.1) {
      warnings.push(
        `Mixed voltages in parallel: ${minVoltage.toFixed(2)}V to ${maxVoltage.toFixed(2)}V`,
      );
    }

    equivalentVoltage = minVoltage; // Use lowest voltage for safety
    equivalentCapacity = batteries.reduce((sum, b) => sum + b.capacity, 0);

    // Parallel: 1/Req = 1/R1 + 1/R2 + ...
    const conductanceSum = batteries.reduce(
      (sum, b) => sum + 1 / Math.max(b.internalResistance, 0.001),
      0,
    );
    equivalentInternalResistance = 1 / conductanceSum;
  } else if (
    positiveGroupCount === batteries.length &&
    negativeGroupCount === batteries.length
  ) {
    // Each battery has unique positive and negative nets = check if series
    // Series: positive of battery N connected to negative of battery N+1
    configuration = "series";
    equivalentVoltage = batteries.reduce((sum, b) => sum + b.voltage, 0);
    equivalentCapacity = Math.min(...batteries.map((b) => b.capacity));
    equivalentInternalResistance = batteries.reduce(
      (sum, b) => sum + b.internalResistance,
      0,
    );

    // Verify series connections
    for (let i = 0; i < batteries.length; i++) {
      const battery = batteries[i];
      const positiveNet = collectReachable(graph, battery.positiveKey);

      let seriesConnected = false;
      for (let j = 0; j < batteries.length; j++) {
        if (i === j) continue;
        if (positiveNet.has(batteries[j].negativeKey)) {
          seriesConnected = true;
          break;
        }
      }

      if (!seriesConnected && i < batteries.length - 1) {
        warnings.push(
          `Batteries may not be properly connected in series: ${battery.nodeId}`,
        );
      }
    }
  } else {
    // Mixed configuration
    configuration = "mixed";
    // Check if we can identify series strings
    const seriesStrings: BatteryInfo[][] = [];
    const processed = new Set<string>();

    for (const battery of batteries) {
      if (processed.has(battery.nodeId)) continue;

      const positiveNet = collectReachable(graph, battery.positiveKey);
      const negativeNet = collectReachable(graph, battery.negativeKey);

      const seriesGroup = [battery];
      processed.add(battery.nodeId);

      for (const other of batteries) {
        if (processed.has(other.nodeId)) continue;
        const otherPositiveNet = collectReachable(graph, other.positiveKey);

        if (positiveNet.has(other.negativeKey)) {
          seriesGroup.push(other);
          processed.add(other.nodeId);
        }
        if (otherPositiveNet.has(battery.negativeKey)) {
          seriesGroup.push(other);
          processed.add(other.nodeId);
        }
      }

      seriesStrings.push(seriesGroup);
    }

    const stringVoltages: number[] = [];
    const stringCapacities: number[] = [];
    const stringResistances: number[] = [];

    for (const stringBatteries of seriesStrings) {
      if (stringBatteries.length === 0) continue;

      const stringVoltage = stringBatteries.reduce(
        (sum, b) => sum + b.voltage,
        0,
      );
      const stringCapacity = Math.min(
        ...stringBatteries.map((b) => b.capacity),
      );
      const stringResistance = stringBatteries.reduce(
        (sum, b) => sum + b.internalResistance,
        0,
      );

      stringVoltages.push(stringVoltage);
      stringCapacities.push(stringCapacity);
      stringResistances.push(stringResistance);
    }

    if (stringVoltages.length > 0) {
      const minStringVoltage = Math.min(...stringVoltages);
      const maxStringVoltage = Math.max(...stringVoltages);

      if (maxStringVoltage - minStringVoltage < 0.1) {
        equivalentVoltage = minStringVoltage;
        equivalentCapacity = stringCapacities.reduce((sum, c) => sum + c, 0);
        const conductanceSum = stringResistances.reduce(
          (sum, r) => sum + 1 / Math.max(r, 0.001),
          0,
        );
        equivalentInternalResistance = 1 / conductanceSum;
      } else {
        warnings.push(
          `Mixed series-parallel configuration with different string voltages: ${minStringVoltage.toFixed(2)}V to ${maxStringVoltage.toFixed(2)}V`,
        );
        equivalentVoltage = minStringVoltage;
        equivalentCapacity = Math.min(...stringCapacities);
        equivalentInternalResistance = Math.min(...stringResistances);
      }
    } else {
      equivalentVoltage = batteries[0].voltage;
      equivalentCapacity = batteries[0].capacity;
      equivalentInternalResistance = batteries[0].internalResistance;
    }
  }

  return {
    configuration,
    equivalentVoltage: Number(equivalentVoltage.toFixed(2)),
    equivalentCapacity: Number(equivalentCapacity.toFixed(2)),
    equivalentInternalResistance: Number(
      equivalentInternalResistance.toFixed(4),
    ),
    warnings,
  };
}

function detectBatteryNetwork(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  dynamicComponents?: ComponentDefinition[],
): BatteryNetwork {
  const batteries = nodes
    .map((node) => getBatteryInfo(node, dynamicComponents))
    .filter((b): b is BatteryInfo => b !== null);

  if (batteries.length === 0) {
    return {
      batteries: [],
      configuration: "single",
      equivalentVoltage: 0,
      equivalentCapacity: 0,
      equivalentInternalResistance: 0,
      warnings: [],
      components: [],
    };
  }

  // Build connection graph
  const graph = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    const sourceKey = endpointKey(edge.source, edge.sourceHandle);
    const targetKey = endpointKey(edge.target, edge.targetHandle);
    if (!graph.has(sourceKey)) graph.set(sourceKey, new Set());
    if (!graph.has(targetKey)) graph.set(targetKey, new Set());
    graph.get(sourceKey)!.add(targetKey);
    graph.get(targetKey)!.add(sourceKey);
  }

  // Find connected components of batteries
  const batteryComponents: BatteryInfo[][] = [];
  const visitedBatteries = new Set<string>();

  for (const battery of batteries) {
    if (visitedBatteries.has(battery.nodeId)) continue;

    const component: BatteryInfo[] = [battery];
    visitedBatteries.add(battery.nodeId);

    const queue = [battery];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentReachable = new Set([
        ...collectReachable(graph, current.positiveKey),
        ...collectReachable(graph, current.negativeKey),
      ]);

      for (const other of batteries) {
        if (visitedBatteries.has(other.nodeId)) continue;
        if (
          currentReachable.has(other.positiveKey) ||
          currentReachable.has(other.negativeKey)
        ) {
          component.push(other);
          visitedBatteries.add(other.nodeId);
          queue.push(other);
        }
      }
    }
    batteryComponents.push(component);
  }

  const analyzedComponents = batteryComponents.map((comp) => {
    const analysis = analyzeBatteryComponent(comp, graph);
    return {
      batteries: comp,
      analysis,
    };
  });

  const primaryAnalysis =
    analyzedComponents.length > 0
      ? analyzedComponents[0].analysis
      : {
        configuration: "single" as const,
        equivalentVoltage: 0,
        equivalentCapacity: 0,
        equivalentInternalResistance: 0,
        warnings: [] as string[],
      };

  const allWarnings = analyzedComponents.flatMap((c) => c.analysis.warnings);

  return {
    batteries,
    configuration: analyzedComponents.length > 1 ? "mixed" : primaryAnalysis.configuration,
    equivalentVoltage: primaryAnalysis.equivalentVoltage,
    equivalentCapacity: primaryAnalysis.equivalentCapacity,
    equivalentInternalResistance: primaryAnalysis.equivalentInternalResistance,
    warnings: allWarnings,
    components: analyzedComponents,
  };
}

function validateMultimeterConnection(args: {
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
      model === "tiltSensor" ||
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

  // 4. Check Series
  let posReachesSource = false;
  let posReachesSink = false;
  for (const node of positiveNetBlocked) {
    if (targetSources.has(node)) posReachesSource = true;
    if (targetSinks.has(node)) posReachesSink = true;
  }

  let negReachesSource = false;
  let negReachesSink = false;
  for (const node of negativeNetBlocked) {
    if (targetSources.has(node)) negReachesSource = true;
    if (targetSinks.has(node)) negReachesSink = true;
  }

  const reachesBoth =
    (posReachesSource && negReachesSink) ||
    (posReachesSink && negReachesSource);
  if (reachesBoth) {
    return "series";
  }

  return "unknown";
}

function createGraph(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  options: {
    includeLoads: boolean;
    excludeAmmeter?: boolean;
    activeTransistorNodeIds?: Set<string>;
    activeRelayNodeIds?: Set<string>;
  },
  dynamicComponents?: ComponentDefinition[],
) {
  const graph = new Map<string, Set<string>>();

  for (const node of nodes) {
    const component = node.data.componentType;
    if (component === "arduino") {
    }
    addConductiveNodeInternalEdges(graph, node, options, dynamicComponents);
  }

  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    const sourceKey = endpointKey(edge.source, edge.sourceHandle);
    const targetKey = endpointKey(edge.target, edge.targetHandle);
    connect(graph, sourceKey, targetKey);
  }

  for (const connection of getBreadboardAutoConnections(
    nodes,
    edges,
    dynamicComponents,
  )) {
    connect(
      graph,
      endpointKey(connection.nodeId, connection.handleId),
      endpointKey(connection.breadboardNodeId, connection.breadboardHandleId),
    );
  }

  return { graph };
}

function normalizeArduinoPins(
  pins: Map<number, PinState>,
  boardType: SimulationBoardType,
  hasPico: boolean = false,
): SimulationBoardPinState[] {
  const isPico = boardType === "pico" || hasPico;
  const isEsp32 = boardType === "esp32";
  const boardPins: SimulationBoardPinState[] = [];
  for (let pin = 0; pin <= 39; pin += 1) {
    const pinState = pins.get(pin);
    if (!pinState) continue;
    const handleId = isEsp32
      ? `gpio${pin}`
      : isPico
        ? `gp${pin}`
        : pin <= 13
          ? `d${pin}`
          : `a${pin - 14}`;
    const normalizedValue = clamp01(pinState.value / 255);
    const voltage = (isPico || isEsp32) ? normalizedValue * 3.3 : normalizedValue * 5;
    boardPins.push({
      pin,
      handleId,
      mode: pinState.mode,
      value: pinState.value,
      normalizedValue,
      voltage,
      active: normalizedValue > 0,
      frequency: pinState.frequency,
    });
  }
  return boardPins;
}

function classifyBoardPins(
  nodes: CircuitNode[],
  boardType: SimulationBoardType,
  boardPins: SimulationBoardPinState[],
  dynamicComponents: ComponentDefinition[] | undefined,
  running: boolean,
  boardIsBurnt = false,
) {
  const normalizedPins: NormalizedBoardPin[] = [];
  for (const node of nodes) {
    const model = getNodeSimulationModel(node, dynamicComponents);
    if (model === "arduino" && boardType === "arduino") {
      for (const pin of boardPins) {
        const isPinBurnt = boardIsBurnt;
        normalizedPins.push({
          ...pin,
          voltage: isPinBurnt ? 0 : pin.voltage,
          value: isPinBurnt ? 0 : pin.value,
          normalizedValue: isPinBurnt ? 0 : pin.normalizedValue,
          active: isPinBurnt ? true : pin.active,
          handleId: endpointKey(node.id, pin.handleId),
          kind: isPinBurnt
            ? "sink"
            : pin.mode === "OUTPUT"
              ? pin.voltage > 0.5
                ? "source"
                : "sink"
              : pin.active
                ? "source"
                : "floating",
        });
      }
      normalizedPins.push({
        pin: -1,
        handleId: endpointKey(node.id, "5v"),
        mode: "POWER",
        value: boardIsBurnt ? 0 : 255,
        normalizedValue: boardIsBurnt ? 0 : 1,
        voltage: boardIsBurnt ? 0 : 5,
        active: true,
        kind: boardIsBurnt ? "sink" : "source",
      });
      normalizedPins.push({
        pin: -2,
        handleId: endpointKey(node.id, "3v3"),
        mode: "POWER",
        value: boardIsBurnt ? 0 : 255,
        normalizedValue: boardIsBurnt ? 0 : 1,
        voltage: boardIsBurnt ? 0 : 3.3,
        active: true,
        kind: boardIsBurnt ? "sink" : "source",
      });
      for (const groundHandle of ARDUINO_GROUND_HANDLES) {
        normalizedPins.push({
          pin: -3,
          handleId: endpointKey(node.id, groundHandle),
          mode: "GND",
          value: 0,
          normalizedValue: 0,
          voltage: 0,
          active: true,
          kind: "sink",
        });
      }
    }

    if (model === "raspberrypipico" && (boardType === "arduino" || boardType === "pico")) {
      for (const pin of boardPins) {
        if (pin.pin >= 0 && pin.pin <= 28) {
          const isPinBurnt = boardIsBurnt;
          normalizedPins.push({
            ...pin,
            voltage: isPinBurnt ? 0 : pin.voltage,
            value: isPinBurnt ? 0 : pin.value,
            normalizedValue: isPinBurnt ? 0 : pin.normalizedValue,
            active: isPinBurnt ? true : pin.active,
            handleId: endpointKey(node.id, `gp${pin.pin}`),
            kind: isPinBurnt
              ? "sink"
              : pin.mode === "OUTPUT"
                ? pin.voltage > 0.001
                  ? "source"
                  : "sink"
                : pin.active
                  ? "source"
                  : "floating",
          });
        }
      }
      normalizedPins.push({
        pin: -1,
        handleId: endpointKey(node.id, "pico_vbus"),
        mode: "POWER",
        value: boardIsBurnt ? 0 : 255,
        normalizedValue: boardIsBurnt ? 0 : 1,
        voltage: boardIsBurnt ? 0 : 5,
        active: true,
        kind: boardIsBurnt ? "sink" : "source",
      });
      normalizedPins.push({
        pin: -1,
        handleId: endpointKey(node.id, "pico_vsys"),
        mode: "POWER",
        value: boardIsBurnt ? 0 : 255,
        normalizedValue: boardIsBurnt ? 0 : 1,
        voltage: boardIsBurnt ? 0 : 5,
        active: true,
        kind: boardIsBurnt ? "sink" : "source",
      });
      normalizedPins.push({
        pin: -2,
        handleId: endpointKey(node.id, "pico_3v3"),
        mode: "POWER",
        value: boardIsBurnt ? 0 : 255,
        normalizedValue: boardIsBurnt ? 0 : 1,
        voltage: boardIsBurnt ? 0 : 3.3,
        active: true,
        kind: boardIsBurnt ? "sink" : "source",
      });
      const PICO_GROUND_HANDLES = [
        "pico_gnd1",
        "pico_gnd2",
        "pico_gnd3",
        "pico_gnd4",
        "pico_gnd5",
        "pico_gnd6",
        "pico_gnd7",
        "pico_gnd8",
      ];
      for (const groundHandle of PICO_GROUND_HANDLES) {
        normalizedPins.push({
          pin: -3,
          handleId: endpointKey(node.id, groundHandle),
          mode: "GND",
          value: 0,
          normalizedValue: 0,
          voltage: 0,
          active: true,
          kind: "sink",
        });
      }
    }

    if (model === "esp32" && (boardType === "arduino" || boardType === "pico" || boardType === "esp32")) {
      for (const pin of boardPins) {
        if (pin.pin >= 0 && pin.pin <= 39) {
          const isPinBurnt = boardIsBurnt;
          const pinVolt = pin.voltage;
          normalizedPins.push({
            ...pin,
            voltage: isPinBurnt ? 0 : pinVolt,
            value: isPinBurnt ? 0 : pin.value,
            normalizedValue: isPinBurnt ? 0 : (pinVolt > 0 ? 1 : 0),
            active: isPinBurnt ? true : pin.active,
            handleId: endpointKey(node.id, `gpio${pin.pin}`),
            kind: isPinBurnt
              ? "sink"
              : pin.mode === "OUTPUT"
                ? pinVolt > 0.001
                  ? "source"
                  : "sink"
                : pin.active
                  ? "source"
                  : "floating",
          });
        }
      }
      normalizedPins.push({
        pin: -1,
        handleId: endpointKey(node.id, "esp32_vin"),
        mode: "POWER",
        value: boardIsBurnt ? 0 : 255,
        normalizedValue: boardIsBurnt ? 0 : 1,
        voltage: boardIsBurnt ? 0 : 5,
        active: true,
        kind: boardIsBurnt ? "sink" : "source",
      });
      normalizedPins.push({
        pin: -2,
        handleId: endpointKey(node.id, "esp32_3v3"),
        mode: "POWER",
        value: boardIsBurnt ? 0 : 255,
        normalizedValue: boardIsBurnt ? 0 : 1,
        voltage: boardIsBurnt ? 0 : 3.3,
        active: true,
        kind: boardIsBurnt ? "sink" : "source",
      });
      const ESP32_GROUND_HANDLES = ["esp32_gnd1", "esp32_gnd2", "esp32_gnd3"];
      for (const groundHandle of ESP32_GROUND_HANDLES) {
        normalizedPins.push({
          pin: -3,
          handleId: endpointKey(node.id, groundHandle),
          mode: "GND",
          value: 0,
          normalizedValue: 0,
          voltage: 0,
          active: true,
          kind: "sink",
        });
      }
    }

    if (BATTERY_TYPES.has(model)) {
      const enabled =
        node.data.componentType === "powerSupply"
          ? running && node.data.properties?.enabled?.value === "on"
          : true;
      const defaultVoltage =
        model === "battery9v"
          ? 9
          : model === "battery1_5v"
            ? 1.5
            : model === "coincell"
              ? 3.0
              : 0;
      const voltage = enabled
        ? Number(node.data.properties?.voltage?.value ?? defaultVoltage)
        : 0;
      const normalizedValue = voltage > 0 ? 1 : 0;
      const positivePin = findPinId(node, dynamicComponents, [
        "positive",
        ...PIN_ALIASES.positive,
      ]);
      const negativePin = findPinId(node, dynamicComponents, [
        "negative",
        ...PIN_ALIASES.negative,
      ]);
      normalizedPins.push({
        pin: -1,
        handleId: endpointKey(node.id, positivePin),
        mode: "POWER",
        value: normalizedValue,
        normalizedValue,
        voltage,
        active: enabled,
        kind: enabled ? "source" : "floating",
      });
      normalizedPins.push({
        pin: -2,
        handleId: endpointKey(node.id, negativePin),
        mode: "GND",
        value: 0,
        normalizedValue: 0,
        voltage: 0,
        active: enabled,
        kind: enabled ? "sink" : "floating",
      });
    }

    if (model === "functionGenerator") {
      const enabled = node.data.properties?.enabled?.value === "on";
      const amplitude = Math.max(
        0,
        Math.min(10, Number(node.data.properties?.amplitude?.value ?? 0)),
      );
      const offset = Math.max(
        -5,
        Math.min(5, Number(node.data.properties?.offset?.value ?? 0)),
      );
      const voltage =
        running && enabled ? Math.max(0, Math.min(10, offset + amplitude)) : 0;
      const normalizedValue = voltage / 10;
      const positivePin = findPinId(node, dynamicComponents, [
        "positive",
        ...PIN_ALIASES.positive,
      ]);
      const negativePin = findPinId(node, dynamicComponents, [
        "negative",
        ...PIN_ALIASES.negative,
      ]);
      normalizedPins.push({
        pin: -10,
        handleId: endpointKey(node.id, positivePin),
        mode: "SIGNAL",
        value: Math.round(normalizedValue * 255),
        normalizedValue,
        voltage,
        active: running,
        kind: running ? "source" : "floating",
      });
      normalizedPins.push({
        pin: -11,
        handleId: endpointKey(node.id, negativePin),
        mode: "GND",
        value: 0,
        normalizedValue: 0,
        voltage: 0,
        active: running,
        kind: running ? "sink" : "floating",
      });
    }
  }
  return normalizedPins;
}

function createEmptyComponentState(
  node: CircuitNode,
): SimulationComponentState {
  return {
    nodeId: node.id,
    componentType: node.data.componentType,
    label: getNodeLabel(node),
    isPowered: false,
    brightness: 0,
    voltage: 0,
    telemetry: {},
    pins: {},
  };
}

interface TransistorCEParams {
  R_ce: number;
  V_ce_drop: number;
  mode: "Cutoff" | "Active" | "Saturation";
  conduction: "ON" | "OFF";
  vbe: number;
  vce: number;
  ib: number;
  ic: number;
  baseVoltage: number;
  collectorVoltage: number;
  emitterVoltage: number;
  missingBaseResistor: boolean;
  dutyCycle?: number;
}

function isPinExternallyConnected(
  nodeId: string,
  pinId: string,
  graph: Map<string, Set<string>>,
): boolean {
  const key = endpointKey(nodeId, pinId);
  const neighbors = graph.get(key);
  if (!neighbors || neighbors.size === 0) return false;
  for (const neighbor of neighbors) {
    const colonIndex = neighbor.lastIndexOf(":");
    const neighborNodeId = neighbor.slice(0, colonIndex);
    if (neighborNodeId !== nodeId) return true;
  }
  return false;
}

function calculatePathResistance(
  path: string[],
  nodes: CircuitNode[],
  dynamicComponents?: ComponentDefinition[],
): number {
  let resistance = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const k1 = path[i];
    const k2 = path[i + 1];
    const lastColon1 = k1.lastIndexOf(":");
    const nodeId1 = k1.slice(0, lastColon1);
    const pinId1 = k1.slice(lastColon1 + 1);
    const lastColon2 = k2.lastIndexOf(":");
    const nodeId2 = k2.slice(0, lastColon2);
    const pinId2 = k2.slice(lastColon2 + 1);

    if (nodeId1 === nodeId2) {
      const comp = nodes.find((n) => n.id === nodeId1);
      if (comp) {
        const m = getNodeSimulationModel(comp, dynamicComponents);
        if (m === "resistor") {
          resistance += getResistanceOhms(comp);
        } else if (m === "photoresistor") {
          resistance += getPhotoresistorOhms(comp);
        } else if (m === "potentiometer") {
          resistance += getPotentiometerResistance(
            comp,
            pinId1,
            pinId2,
            dynamicComponents,
          );
        }
      }
    }
  }
  return resistance;
}

export function getPathLoadParameters(args: {
  fullPath: string[];
  nodes: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
}) {
  let R_load = 0;
  let V_drop_load = 0;

  for (let i = 0; i < args.fullPath.length - 1; i++) {
    const k1 = args.fullPath[i];
    const k2 = args.fullPath[i + 1];

    const lastColon1 = k1.lastIndexOf(":");
    const nodeId1 = k1.slice(0, lastColon1);
    const pinId1 = k1.slice(lastColon1 + 1);

    const lastColon2 = k2.lastIndexOf(":");
    const nodeId2 = k2.slice(0, lastColon2);
    const pinId2 = k2.slice(lastColon2 + 1);

    if (nodeId1 === nodeId2) {
      const compNode = args.nodes.find((n) => n.id === nodeId1);
      if (compNode) {
        const compModel = getNodeSimulationModel(
          compNode,
          args.dynamicComponents,
        );
        if (compModel === "resistor") {
          R_load += getResistanceOhms(compNode);
        } else if (compModel === "photoresistor") {
          R_load += getPhotoresistorOhms(compNode);
        } else if (compModel === "potentiometer") {
          R_load += getPotentiometerResistance(
            compNode,
            pinId1,
            pinId2,
            args.dynamicComponents,
          );
        } else if (
          compModel === "capacitor" ||
          compModel === "polarizedCapacitor"
        ) {
          R_load += 10_000_000;
        } else if (
          compModel === "dcmotor" ||
          compModel === "vibrationMotor" ||
          compModel === "hobbyGearmotor"
        ) {
          R_load += 10;
        } else if (compModel === "piezo") {
          R_load += 100;
        } else if (compModel === "led") {
          const nodeAnode = findPinId(compNode, args.dynamicComponents, [
            "anode",
            ...PIN_ALIASES.positive,
          ]);
          const nodeCathode = findPinId(compNode, args.dynamicComponents, [
            "cathode",
            ...PIN_ALIASES.negative,
          ]);
          if (pinId1 === nodeAnode && pinId2 === nodeCathode) {
            V_drop_load += getLedForwardVoltage(compNode);
          } else if (pinId1 === nodeCathode && pinId2 === nodeAnode) {
            V_drop_load += 999;
          }
        } else if (compModel === "diode") {
          const anode = findPinId(compNode, args.dynamicComponents, [
            "anode",
            "pin1",
            ...PIN_ALIASES.positive,
          ]);
          const cathode = findPinId(compNode, args.dynamicComponents, [
            "cathode",
            "pin2",
            ...PIN_ALIASES.negative,
          ]);
          if (pinId1 === anode && pinId2 === cathode) {
            V_drop_load += 0.7;
          } else if (pinId1 === cathode && pinId2 === anode) {
            V_drop_load += 999;
          }
        } else if (compModel === "sevenSegment") {
          const displayType = String(compNode.data.properties?.displayType?.value ?? "Common Cathode");
          const isCommonAnode = displayType === "Common Anode";
          const comPins = ["com1", "com2"];
          const segPins = ["a", "b", "c", "d", "e", "f", "g", "dp"];

          const drop = 3.0;

          const isPin1Com = comPins.includes(pinId1);
          const isPin2Com = comPins.includes(pinId2);
          const isPin1Seg = segPins.includes(pinId1);
          const isPin2Seg = segPins.includes(pinId2);

          if (isCommonAnode) {
            if (isPin1Com && isPin2Seg) {
              V_drop_load += drop;
            } else if (isPin1Seg && isPin2Com) {
              V_drop_load += 999;
            }
          } else {
            if (isPin1Seg && isPin2Com) {
              V_drop_load += drop;
            } else if (isPin1Com && isPin2Seg) {
              V_drop_load += 999;
            }
          }
        }
      }
    }
  }
  return { R_load, V_drop_load };
}

/** Returns sources that can reach `pinKey` without passing through a capacitor or polarizedCapacitor — i.e. pure DC paths only. */
/** Returns sources that can reach `pinKey` without passing through a capacitor or polarizedCapacitor — i.e. pure DC paths only. */
function getDcOnlySourcesForPin(
  pinKey: string,
  sourcesForPin: NormalizedBoardPin[],
  signalGraph: Map<string, Set<string>>,
  nodes: CircuitNode[],
  dynamicComponents?: ComponentDefinition[],
): NormalizedBoardPin[] {
  const CAP_MODELS = new Set(["capacitor", "polarizedCapacitor"]);
  const reversedGraph = reverseGraph(signalGraph);
  return sourcesForPin.filter((source) => {
    const path = findShortestPath(reversedGraph, pinKey, new Set([source.handleId]), "");
    if (!path) return false;
    for (let i = 0; i < path.length - 1; i++) {
      const k1 = path[i];
      const k2 = path[i + 1];
      const nId1 = k1.slice(0, k1.lastIndexOf(":"));
      const nId2 = k2.slice(0, k2.lastIndexOf(":"));
      if (nId1 === nId2) {
        const comp = nodes.find((n) => n.id === nId1);
        if (comp && CAP_MODELS.has(getNodeSimulationModel(comp, dynamicComponents))) {
          return false; // path crosses a capacitor — not a DC path
        }
      }
    }
    return true;
  });
}



function getTransistorCEParameters(args: {
  node: CircuitNode;
  nodes: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
  sourceReach: Map<string, NormalizedBoardPin[]>;
  sinkReach: Set<string>;
  directSinkReach?: Set<string>;
  signalGraph: Map<string, Set<string>>;
  V_source: number;
  R_load: number;
  V_drop_load: number;
}): TransistorCEParams {
  const node = args.node;
  const compModel = getNodeSimulationModel(node, args.dynamicComponents);
  const isNPN = compModel === "npn" || compModel === "nmosSignal";
  const isTransistor = compModel === "npn" || compModel === "pnp";

  const basePin = findPinId(
    node,
    args.dynamicComponents,
    isTransistor ? ["base"] : ["gate"],
  );
  const collectorPin = findPinId(
    node,
    args.dynamicComponents,
    isTransistor ? ["collector"] : ["drain"],
  );
  const emitterPin = findPinId(
    node,
    args.dynamicComponents,
    isTransistor ? ["emitter"] : ["source"],
  );

  const baseKey = endpointKey(node.id, basePin);
  const collectorKey = endpointKey(node.id, collectorPin);
  const emitterKey = endpointKey(node.id, emitterPin);

  const isBConnected = isPinExternallyConnected(
    node.id,
    basePin,
    args.signalGraph,
  );
  const isCConnected = isPinExternallyConnected(
    node.id,
    collectorPin,
    args.signalGraph,
  );
  const isEConnected = isPinExternallyConnected(
    node.id,
    emitterPin,
    args.signalGraph,
  );
  const allConnected = isBConnected && isCConnected && isEConnected;

  // Build a DC-only sourceReach for the base: strip sources reachable only via capacitors.
  const rawBaseSources = args.sourceReach.get(baseKey) ?? [];
  const dcBaseSources = getDcOnlySourcesForPin(
    baseKey,
    rawBaseSources,
    args.signalGraph,
    args.nodes,
    args.dynamicComponents,
  );
  const dcBaseSourceReach = new Map(args.sourceReach);
  dcBaseSourceReach.set(baseKey, dcBaseSources);

  const baseReading = getProbeReading(
    baseKey,
    dcBaseSourceReach,
    args.sinkReach,
    args.directSinkReach,
  );
  const collectorReading = getProbeReading(
    collectorKey,
    args.sourceReach,
    args.sinkReach,
    args.directSinkReach,
  );
  const emitterReading = getProbeReading(
    emitterKey,
    args.sourceReach,
    args.sinkReach,
    args.directSinkReach,
  );

  let V_b = baseReading.voltage;
  if (baseReading.source && args.signalGraph) {
    const reversedSignalGraph = reverseGraph(args.signalGraph);
    const baseSourcePath = findShortestPath(
      reversedSignalGraph,
      baseKey,
      new Set([baseReading.source.handleId]),
      isTransistor ? emitterKey : collectorKey,
    );
    if (!baseSourcePath) {
      V_b = baseReading.grounded ? 0 : V_b;
    }
  }

  const V_c = collectorReading.voltage;
  const V_e = emitterReading.voltage;

  const vbe = isNPN ? V_b - V_e : V_e - V_b;
  const vce = isNPN ? V_c - V_e : V_e - V_c;

  const isReverse = isNPN ? V_e > V_c + 0.1 : V_c > V_e + 0.1;

  const V_be_threshold = isTransistor ? 0.7 : 2.0;
  const beta = 100;
  const R_internal_base = 10;

  let R_b = 0;
  let missingBaseResistor = false;

  if (baseReading.source && isNPN && args.signalGraph) {
    const reversedSignalGraph = reverseGraph(args.signalGraph);
    const baseSourcePath = findShortestPath(
      reversedSignalGraph,
      baseKey,
      new Set([baseReading.source.handleId]),
      emitterKey,
    );
    if (baseSourcePath) {
      R_b = calculatePathResistance(
        baseSourcePath,
        args.nodes,
        args.dynamicComponents,
      );
    }
  } else if (baseReading.grounded && !isNPN && args.signalGraph) {
    const rootSinks = new Set(
      Array.from(args.sinkReach).filter((h) => {
        const parts = h.split(":");
        const pinId = parts[parts.length - 1];
        return (
          pinId === "negative" ||
          pinId.startsWith("gnd") ||
          pinId.startsWith("pico_gnd") ||
          pinId === "common" ||
          pinId === "cathode"
        );
      })
    );
    const baseSinkPath = findShortestPath(
      args.signalGraph,
      baseKey,
      rootSinks,
      collectorKey,
    );
    if (baseSinkPath) {
      R_b = calculatePathResistance(
        baseSinkPath,
        args.nodes,
        args.dynamicComponents,
      );
    }
  }

  if (allConnected && R_b < 5) {
    missingBaseResistor = true;
  }

  let ib = 0;
  let ic = 0;
  let R_ce = 10000000;
  let V_ce_drop = 0;
  let mode: "Cutoff" | "Active" | "Saturation" = "Cutoff";
  let conduction: "ON" | "OFF" = "OFF";

  const isBaseFloating = !baseReading.source && !baseReading.grounded;
  if (allConnected && !isReverse && !isBaseFloating && vbe >= V_be_threshold) {
    const V_control = isNPN ? V_b : V_e;
    const V_ref = isNPN ? V_e : V_b;
    ib = Math.max(
      0,
      (V_control - V_ref - V_be_threshold) / (R_b + R_internal_base),
    );

    if (ib > 0) {
      conduction = "ON";
      const V_ce_sat = isTransistor ? 0.2 : 0.05;
      const I_c_sat = Math.max(
        0,
        (args.V_source - args.V_drop_load - V_e - V_ce_sat) /
        Math.max(1, args.R_load),
      );
      const I_c_active = ib * beta;

      if (I_c_active >= I_c_sat) {
        mode = "Saturation";
        ic = I_c_sat;
        R_ce = 0.1;
        V_ce_drop = V_ce_sat;
      } else {
        mode = "Active";
        ic = I_c_active;
        const R_total_needed = (args.V_source - args.V_drop_load - V_e) / ic;
        R_ce = Math.max(0.1, R_total_needed - args.R_load);
        V_ce_drop = 0;
      }
    }
  }

  const dutyCycle = baseReading.source?.normalizedValue ?? (baseReading.voltage > 0 ? clamp01(baseReading.voltage / (isNPN ? 5 : 3.3)) : 1.0);

  return {
    R_ce,
    V_ce_drop,
    mode,
    conduction,
    vbe: Number(vbe.toFixed(3)),
    vce: Number(vce.toFixed(3)),
    ib,
    ic,
    baseVoltage: V_b,
    collectorVoltage: V_c,
    emitterVoltage: V_e,
    missingBaseResistor,
    dutyCycle,
  };
}

function getGndPinsForNode(
  node: CircuitNode,
  dynamicComponents?: ComponentDefinition[],
) {
  const compDef = getComponentDefinition(node, dynamicComponents);
  if (!compDef) return [];
  return compDef.pins
    .filter((p) => {
      const idLower = p.id.toLowerCase();
      const labelLower = (p.label ?? "").toLowerCase();
      const descLower = (p.description ?? "").toLowerCase();
      return (
        idLower.includes("gnd") ||
        idLower === "negative" ||
        idLower === "minus" ||
        labelLower.includes("gnd") ||
        labelLower === "negative" ||
        labelLower === "minus" ||
        descLower.includes("gnd") ||
        descLower.includes("negative") ||
        descLower.includes("minus")
      );
    })
    .map((p) => p.id);
}

function areNodesGndConnected(
  graph: Map<string, Set<string>>,
  nodeId1: string,
  nodeId2: string,
  nodes: CircuitNode[],
  dynamicComponents?: ComponentDefinition[],
) {
  if (nodeId1 === nodeId2) return true;

  const node1 = nodes.find((n) => n.id === nodeId1);
  const node2 = nodes.find((n) => n.id === nodeId2);
  if (!node1 || !node2) return false;

  const gndPins1 = getGndPinsForNode(node1, dynamicComponents);
  const gndPins2 = getGndPinsForNode(node2, dynamicComponents);

  if (gndPins2.length === 0) return true;
  if (gndPins1.length === 0) return true;

  for (const gp1 of gndPins1) {
    const reachable = collectReachable(graph, endpointKey(nodeId1, gp1));
    for (const gp2 of gndPins2) {
      if (reachable.has(endpointKey(nodeId2, gp2))) {
        return true;
      }
    }
  }

  return false;
}

function isBoardShortCircuited(
  nodeId: string,
  graph: Map<string, Set<string>>,
  nodes: CircuitNode[],
  dynamicComponents?: ComponentDefinition[],
) {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return false;

  const boardModel = getNodeSimulationModel(node, dynamicComponents);
  if (boardModel !== "arduino" && boardModel !== "raspberrypipico") return false;

  const gndPins = getGndPinsForNode(node, dynamicComponents);
  const powerPins = boardModel === "arduino" ? ["5v", "3v3"] : ["pico_3v3", "pico_3v3_en", "pico_vbus", "pico_vsys"];

  for (const pPin of powerPins) {
    const reachable = collectReachable(graph, endpointKey(nodeId, pPin));
    for (const gPin of gndPins) {
      if (reachable.has(endpointKey(nodeId, gPin))) {
        return true;
      }
    }
  }

  return false;
}

function getSafeVoltageForPin(boardModel: string, pinId: string) {
  if (boardModel === "arduino") {
    if (pinId === "vin") return 12.0;
    return 5.50;
  } else if (boardModel === "raspberrypipico") {
    if (pinId === "pico_vbus" || pinId === "pico_vsys") return 5.50;
    return 3.60;
  }
  return 5.50;
}

function checkArduinoExternalPowerFaults(
  nodeId: string,
  graph: Map<string, Set<string>>,
  sourceReach: Map<string, NormalizedBoardPin[]>,
) {
  const POWER_PINS = ["vin", "5v", "3v3"] as const;
  const GND_PINS = ["gnd1", "gnd2", "gnd3"] as const;

  // ── Condition 1: Power rail directly shorted to GND ──────────────────────
  for (const pPin of POWER_PINS) {
    const pNet = collectReachable(graph, endpointKey(nodeId, pPin));
    for (const gPin of GND_PINS) {
      if (pNet.has(endpointKey(nodeId, gPin))) {
        return {
          sparked: true,
          shorted: true,
          faultPin: pPin,
          appliedVoltage: 0,
          safeLimit: pPin === "vin" ? 12.0 : pPin === "5v" ? 5.5 : 3.6,
          reason: `short-to-gnd`,
        };
      }
    }
  }

  // ── Condition 2: 5V and 3.3V rails directly bridged ──────────────────────
  const net5v = collectReachable(graph, endpointKey(nodeId, "5v"));
  const net3v3 = collectReachable(graph, endpointKey(nodeId, "3v3"));
  if (net5v.has(endpointKey(nodeId, "3v3")) || net3v3.has(endpointKey(nodeId, "5v"))) {
    return {
      sparked: true,
      shorted: true,
      faultPin: "5v/3v3",
      appliedVoltage: 5,
      safeLimit: 3.6,
      reason: `rail-conflict`,
    };
  }

  // ── Condition 3: External source voltage violations on power pins ─────────
  const PIN_LIMITS: Record<string, { min: number; max: number }> = {
    vin: { min: 7.0, max: 12.0 },
    "5v": { min: 0.0, max: 5.5 },
    "3v3": { min: 0.0, max: 3.6 },
  };

  const prefix = `${nodeId}:`;
  for (const [endpoint, sources] of sourceReach) {
    if (!endpoint.startsWith(prefix)) continue;
    const pinId = endpoint.split(":")[1];
    const limits = PIN_LIMITS[pinId];
    if (!limits) continue;

    for (const source of sources) {
      const v = source.voltage;

      if (v < 0) {
        return {
          sparked: true,
          shorted: false,
          faultPin: pinId,
          appliedVoltage: v,
          safeLimit: limits.max,
          reason: `reverse-polarity`,
        };
      }

      if (v > limits.max) {
        return {
          sparked: true,
          shorted: false,
          faultPin: pinId,
          appliedVoltage: v,
          safeLimit: limits.max,
          reason: `overvoltage`,
        };
      }
    }
  }

  // ── Condition 4: VIN directly bridged to 5V or 3.3V ─────────────────────
  const netVin = collectReachable(graph, endpointKey(nodeId, "vin"));
  if (netVin.has(endpointKey(nodeId, "5v")) || netVin.has(endpointKey(nodeId, "3v3"))) {
    for (const [endpoint, sources] of sourceReach) {
      if (!endpoint.startsWith(prefix)) continue;
      if (!endpoint.includes(":vin")) continue;
      for (const source of sources) {
        if (source.voltage > 5.5) {
          return {
            sparked: true,
            shorted: false,
            faultPin: "vin→5v",
            appliedVoltage: source.voltage,
            safeLimit: 5.5,
            reason: `vin-to-5v-bridge`,
          };
        }
      }
    }
  }

  return null;
}

export function checkBoardOvervoltage(
  nodeId: string,
  sourceReach: Map<string, NormalizedBoardPin[]>,
  graph: Map<string, Set<string>>,
  nodes: CircuitNode[],
  dynamicComponents?: ComponentDefinition[],
  signalGraph?: Map<string, Set<string>>,
): {
  sparked: boolean;
  maxReachedVoltage: number;
  maxSafeVoltage: number;
  shorted: boolean;
  faultMessage?: string;
} {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { sparked: false, maxReachedVoltage: 0, maxSafeVoltage: 5.5, shorted: false };

  const boardModel = getNodeSimulationModel(node, dynamicComponents);
  const defaultSafeLimit = boardModel === "arduino" ? 5.50 : 3.60;

  if (boardModel === "arduino" && signalGraph) {
    const extFault = checkArduinoExternalPowerFaults(nodeId, signalGraph, sourceReach);
    if (extFault) {
      const { faultPin, appliedVoltage, safeLimit, shorted, reason } = extFault;
      const faultMsg =
        reason === "short-to-gnd" ? `Arduino burnt: ${faultPin} pin shorted directly to GND!`
          : reason === "rail-conflict" ? `Arduino burnt: 5V and 3.3V rails are directly bridged!`
            : reason === "reverse-polarity" ? `Arduino burnt: Reverse polarity on ${faultPin} pin (${appliedVoltage.toFixed(1)}V). Check your wiring.`
              : reason === "vin-to-5v-bridge" ? `Arduino burnt: ${appliedVoltage.toFixed(1)}V from VIN was applied to the 5V pin. Safe limit: ${safeLimit}V.`
                : `Arduino burnt: ${appliedVoltage.toFixed(1)}V on ${faultPin} pin exceeds safe limit of ${safeLimit}V.`;

      return {
        sparked: true,
        maxReachedVoltage: Math.abs(appliedVoltage),
        maxSafeVoltage: safeLimit,
        shorted,
        faultMessage: faultMsg,
      };
    }
  }

  const isShorted = signalGraph ? isBoardShortCircuited(nodeId, signalGraph, nodes, dynamicComponents) : false;
  if (isShorted) {
    return {
      sparked: true,
      maxReachedVoltage: 0,
      maxSafeVoltage: defaultSafeLimit,
      shorted: true,
    };
  }

  let sparked = false;
  let maxOverloadVoltage = 0;
  let overloadSafeLimit = defaultSafeLimit;

  const prefix = `${nodeId}:`;
  for (const [endpoint, sources] of sourceReach) {
    if (!endpoint.startsWith(prefix)) continue;
    const pinId = endpoint.split(":")[1];

    let safeLimit = defaultSafeLimit;
    if (boardModel === "arduino") {
      if (pinId === "vin") safeLimit = 12.0;
    } else if (boardModel === "raspberrypipico") {
      if (pinId === "pico_vbus" || pinId === "pico_vsys") safeLimit = 5.50;
    } else if (boardModel === "esp32") {
      if (pinId === "esp32_vin") safeLimit = 12.0;
    }

    for (const source of sources) {
      const sourceNodeId = source.handleId.split(":")[0];
      if (
        areNodesGndConnected(
          graph,
          nodeId,
          sourceNodeId,
          nodes,
          dynamicComponents,
        )
      ) {
        if (source.voltage > safeLimit) {
          sparked = true;
          if (source.voltage > maxOverloadVoltage) {
            maxOverloadVoltage = source.voltage;
            overloadSafeLimit = safeLimit;
          }
        }
      }
    }
  }

  if (sparked) {
    return {
      sparked: true,
      maxReachedVoltage: maxOverloadVoltage,
      maxSafeVoltage: overloadSafeLimit,
      shorted: false,
    };
  }

  let maxVoltage = 0;
  for (const [endpoint, sources] of sourceReach) {
    if (!endpoint.startsWith(prefix)) continue;
    const pinId = endpoint.split(":")[1];
    if (boardModel === "arduino" && pinId === "vin") continue;
    if (boardModel === "raspberrypipico" && (pinId === "pico_vbus" || pinId === "pico_vsys")) continue;
    if (boardModel === "esp32" && pinId === "esp32_vin") continue;
    for (const source of sources) {
      const sourceNodeId = source.handleId.split(":")[0];
      if (areNodesGndConnected(graph, nodeId, sourceNodeId, nodes, dynamicComponents)) {
        maxVoltage = Math.max(maxVoltage, source.voltage);
      }
    }
  }

  return {
    sparked: false,
    maxReachedVoltage: maxVoltage,
    maxSafeVoltage: defaultSafeLimit,
    shorted: false,
  };
}

let getTimestampOverride: (() => number) | null = null;
export function registerTimestampProvider(fn: () => number) {
  getTimestampOverride = fn;
}

export function buildSimulationFrame(args: {
  tick: number;
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  dynamicComponents?: ComponentDefinition[];
  boardType: SimulationBoardType;
  arduinoState?: SimulatorState;
  servoMotions?: SimulationServoMotion[];
  running: boolean;
  error?: string | null;
  timestamp?: number;
}) {
  const {
    tick,
    nodes,
    edges,
    dynamicComponents,
    boardType,
    arduinoState,
    running,
  } = args;
  currentHighWeightNodes = new Set(
    nodes
      .filter((n) => {
        const m = getNodeSimulationModel(n, dynamicComponents);
        return m === "led" || m === "diode";
      })
      .map((n) => n.id),
  );

  const hasPico = nodes.some(
    (node) =>
      getNodeSimulationModel(node, dynamicComponents) === "raspberrypipico",
  );
  const boardPins =
    (boardType === "arduino" || boardType === "pico" || boardType === "esp32")
      ? normalizeArduinoPins(arduinoState?.pins ?? new Map(), boardType, hasPico)
      : [];

  const serialOutput =
    (boardType === "arduino" || boardType === "pico" || boardType === "esp32") ? (arduinoState?.serialOutput ?? []) : [];

  const collectSourceReachMap = (
    graph: Map<string, Set<string>>,
    sourcePins: NormalizedBoardPin[],
  ) => {
    const reach = new Map<string, NormalizedBoardPin[]>();
    for (const source of sourcePins) {
      for (const endpoint of collectReachable(graph, source.handleId)) {
        const bucket = reach.get(endpoint) ?? [];
        bucket.push(source);
        reach.set(endpoint, bucket);
      }
    }
    return reach;
  };

  const collectSinkReachSet = (
    graph: Map<string, Set<string>>,
    sinkPins: NormalizedBoardPin[],
  ) => {
    const reach = new Set<string>();
    for (const sink of sinkPins) {
      for (const endpoint of collectReachable(graph, sink.handleId)) {
        reach.add(endpoint);
      }
    }
    return reach;
  };

  // Build short circuit graph (excludes loads) for short circuit checks
  const { graph: shortCircuitGraph } = createGraph(
    nodes,
    edges,
    { includeLoads: false },
    dynamicComponents,
  );

  // Pass 1: Build control graph (transistors disconnected) to determine base voltages
  const { graph: controlGraph } = createGraph(
    nodes,
    edges,
    { includeLoads: true, activeTransistorNodeIds: new Set(), activeRelayNodeIds: new Set() },
    dynamicComponents,
  );
  let normalizedPins = classifyBoardPins(
    nodes,
    boardType,
    boardPins,
    dynamicComponents,
    running,
    false,
  );
  let sources = normalizedPins.filter((pin) => pin.kind === "source");
  let sinks = normalizedPins.filter((pin) => pin.kind === "sink");
  let controlSourceReach = collectSourceReachMap(controlGraph, sources);
  let controlSinkReach = collectSinkReachSet(controlGraph, sinks);

  const arduinoNode = nodes.find(
    (n) => getNodeSimulationModel(n, dynamicComponents) === "arduino",
  );
  const picoNode = nodes.find(
    (n) => getNodeSimulationModel(n, dynamicComponents) === "raspberrypipico",
  );
  const esp32Node = nodes.find(
    (n) => getNodeSimulationModel(n, dynamicComponents) === "esp32",
  );
  const boardNode = arduinoNode ?? picoNode ?? esp32Node;
  let boardIsBurnt = false;
  if (boardNode) {
    const { sparked } = checkBoardOvervoltage(
      boardNode.id,
      controlSourceReach,
      controlGraph,
      nodes,
      dynamicComponents,
      shortCircuitGraph,
    );
    boardIsBurnt = sparked;
  }

  if (boardIsBurnt) {
    normalizedPins = classifyBoardPins(
      nodes,
      boardType,
      boardPins,
      dynamicComponents,
      running,
      true,
    );
    sources = normalizedPins.filter((pin) => pin.kind === "source");
    sinks = normalizedPins.filter((pin) => pin.kind === "sink");
    controlSourceReach = collectSourceReachMap(controlGraph, sources);
    controlSinkReach = collectSinkReachSet(controlGraph, sinks);
  }
  const activeTransistorNodeIds = new Set<string>();

  for (const node of nodes) {
    const model = getNodeSimulationModel(node, dynamicComponents);
    const isTransistor = model === "npn" || model === "pnp";
    const isMosfet = model === "nmosSignal" || model === "pmosSignal";
    if (!isTransistor && !isMosfet) continue;

    const basePin = findPinId(
      node,
      dynamicComponents,
      isTransistor ? ["base"] : ["gate"],
    );
    const collectorPin = findPinId(
      node,
      dynamicComponents,
      isTransistor ? ["collector"] : ["drain"],
    );
    const emitterPin = findPinId(
      node,
      dynamicComponents,
      isTransistor ? ["emitter"] : ["source"],
    );

    const isBConnected = isPinExternallyConnected(
      node.id,
      basePin,
      controlGraph,
    );
    const isCConnected = isPinExternallyConnected(
      node.id,
      collectorPin,
      controlGraph,
    );
    const isEConnected = isPinExternallyConnected(
      node.id,
      emitterPin,
      controlGraph,
    );
    if (!isBConnected || !isCConnected || !isEConnected) continue;

    const baseKey = endpointKey(node.id, basePin);
    const collectorKey = endpointKey(node.id, collectorPin);
    const emitterKey = endpointKey(node.id, emitterPin);

    const baseReading = getProbeReading(
      baseKey,
      controlSourceReach,
      controlSinkReach,
    );
    const emitterReading = getProbeReading(
      emitterKey,
      controlSourceReach,
      controlSinkReach,
    );
    const collectorReading = getProbeReading(
      collectorKey,
      controlSourceReach,
      controlSinkReach,
    );

    const V_b = baseReading.voltage;
    const V_c = collectorReading.voltage;
    const V_e = emitterReading.voltage;

    const isNtype = model === "npn" || model === "nmosSignal";
    const threshold = isTransistor ? 0.7 : 2.0;
    const vControl = isNtype ? V_b - V_e : V_e - V_b;
    const isReverse = isNtype ? V_e > V_c + 0.1 : V_c > V_e + 0.1;

    if (!isReverse && vControl >= threshold) {
      activeTransistorNodeIds.add(node.id);
    }
  }

  /**
   * activeRelayNodeIds: A Set storing the node IDs of all relays (SPST and DPDT) that are actively 
   * energized during the current simulation frame.
   * 
   * For SPST: Checks coil potential difference with system-aware pico scaling & hysteresis.
   * For DPDT: Checks A1/A2 potential difference threshold.
   */
  const activeRelayNodeIds = new Set<string>();
  for (const node of nodes) {
    const model = getNodeSimulationModel(node, dynamicComponents);
    if (model === "relaySpst") {
      // Resolve pin IDs for positive and negative coil terminals
      const coilPos = findPinId(node, dynamicComponents, ["terminal5", "coil_pos", "coil_positive"]);
      const coilNeg = findPinId(node, dynamicComponents, ["terminal8", "coil_neg", "coil_negative"]);
      
      // Read current pin voltages from the control/source reach maps
      const posReading = getProbeReading(endpointKey(node.id, coilPos), controlSourceReach, controlSinkReach);
      const negReading = getProbeReading(endpointKey(node.id, coilNeg), controlSourceReach, controlSinkReach);
      
      // vCoil: The absolute potential difference across the electromagnetic coil
      const vCoil = Math.abs(posReading.voltage - negReading.voltage);
      
      // System-aware detection to support 3.3V microcontroller control signals
      const isPicoDriven =
        (posReading.voltage <= 3.4 && posReading.voltage >= 2.5) || boardType === "pico" || hasPico;
        
      // vPickup: Threshold voltage required to actuate the armature from rest (NC to NO)
      const rawPickup = Number(node.data.properties?.pickupVoltage?.value ?? 4.0);
      const vPickup = isPicoDriven && rawPickup === 4.0 ? 3.0 : rawPickup;
      
      // vRelease: Threshold voltage below which the armature drops back to rest (NO to NC)
      const rawRelease = Number(node.data.properties?.releaseVoltage?.value ?? 2.0);
      const vRelease = isPicoDriven && rawRelease === 2.0 ? 1.5 : rawRelease;

      // Retrieve previous tick state to compute hysteresis and prevent contact chatter
      const previousState = spstRelayState.getState(node.id, false);
      let isEnergized = false;
      if (previousState) {
        isEnergized = vCoil > vRelease;
      } else {
        isEnergized = vCoil >= vPickup;
      }

      if (isEnergized) {
        activeRelayNodeIds.add(node.id);
      }
    } else if (model === "relayDpdt") {
      const a1Reading = getProbeReading(endpointKey(node.id, "terminal1"), controlSourceReach, controlSinkReach);
      const a2Reading = getProbeReading(endpointKey(node.id, "terminal16"), controlSourceReach, controlSinkReach);
      const coilVoltage = Math.abs(a1Reading.voltage - a2Reading.voltage);
      if (coilVoltage >= 3.0) {
        activeRelayNodeIds.add(node.id);
      }
    }
  }

  // Pass 2: Build final graphs with dynamic C-E and relay connections
  const { graph: signalGraph } = createGraph(
    nodes,
    edges,
    { includeLoads: true, activeTransistorNodeIds, activeRelayNodeIds },
    dynamicComponents,
  );
  const { graph: loadGraph } = createGraph(
    nodes,
    edges,
    { includeLoads: true, activeTransistorNodeIds, activeRelayNodeIds },
    dynamicComponents,
  );
  const { graph: directGraph } = createGraph(
    nodes,
    edges,
    { includeLoads: false, activeTransistorNodeIds, activeRelayNodeIds },
    dynamicComponents,
  );
  // Create a complete graph for multimeter passive measurements that includes all connections
  // This graph includes both wire edges and resistor internal connections
  const { graph: completeGraph } = createGraph(
    nodes,
    edges,
    { includeLoads: true, activeTransistorNodeIds, activeRelayNodeIds },
    dynamicComponents,
  );
  sources = normalizedPins.filter((pin) => pin.kind === "source");
  sinks = normalizedPins.filter((pin) => pin.kind === "sink");
  const components: Record<string, SimulationComponentState> = {};

  // Detect battery network configuration
  const batteryNetwork = detectBatteryNetwork(nodes, edges, dynamicComponents);

  // Update battery source pins to use equivalent voltage of their connected component
  if (batteryNetwork.components && batteryNetwork.components.length > 0) {
    normalizedPins = normalizedPins.map((pin) => {
      for (const comp of batteryNetwork.components!) {
        const batteryInfo = comp.batteries.find(
          (b) => pin.handleId === b.positiveKey,
        );
        if (batteryInfo && pin.kind === "source") {
          return {
            ...pin,
            voltage: comp.analysis.equivalentVoltage,
            normalizedValue: comp.analysis.equivalentVoltage > 0 ? 1 : 0,
          };
        }
      }
      return pin;
    });
    sources = normalizedPins.filter((pin) => pin.kind === "source");
  }

  // Analyze resistor networks for series, parallel, and mixed configurations
  const sourceVoltage =
    batteryNetwork.batteries.length > 0 ? batteryNetwork.equivalentVoltage : 5; // Default to 5V if no batteries
  const resistorNetworkAnalysis = analyzeResistorNetworks(
    nodes,
    edges,
    dynamicComponents,
    sourceVoltage,
  );

  const initialSourceReach = collectSourceReachMap(signalGraph, sources);
  const initialSinkReach = collectSinkReachSet(loadGraph, sinks);
  for (const node of nodes) {
    if (getNodeSimulationModel(node, dynamicComponents) !== "potentiometer")
      continue;
    const pin1 = findPinId(node, dynamicComponents, [
      "pin1",
      ...PIN_ALIASES.positive,
    ]);
    const pin2 = findPinId(node, dynamicComponents, [
      "pin2",
      ...PIN_ALIASES.negative,
    ]);
    const wiper = findPinId(node, dynamicComponents, [
      "wiper",
      ...PIN_ALIASES.wiper,
    ]);
    const pin1Key = endpointKey(node.id, pin1);
    const pin2Key = endpointKey(node.id, pin2);
    const source1 = getStrongestSource(initialSourceReach.get(pin1Key) ?? []);
    const source2 = getStrongestSource(initialSourceReach.get(pin2Key) ?? []);
    const pin1Grounded = initialSinkReach.has(pin1Key);
    const pin2Grounded = initialSinkReach.has(pin2Key);
    const voltage1 = pin1Grounded ? 0 : (source1?.voltage ?? null);
    const voltage2 = pin2Grounded ? 0 : (source2?.voltage ?? null);
    if (voltage1 === null || voltage2 === null) continue;

    const position = Math.max(
      0,
      Math.min(100, Number(node.data.properties?.position?.value ?? 50)),
    );
    const voltage = getPotentiometerWiperVoltage(voltage1, voltage2, position);
    const reference = Math.max(Math.abs(voltage1), Math.abs(voltage2), 5);
    const normalizedValue = clamp01(Math.abs(voltage) / reference);
    normalizedPins = [
      ...normalizedPins,
      {
        pin: -20,
        handleId: endpointKey(node.id, wiper),
        mode: "POT_WIPER",
        value: Math.round(normalizedValue * 255),
        normalizedValue,
        voltage,
        active: running && Math.abs(voltage) > 0.001,
        kind: running && Math.abs(voltage) > 0.001 ? "source" : "floating",
      },
    ];
  }
  sources = normalizedPins.filter((pin) => pin.kind === "source");

  const sourceReach = new Map<string, NormalizedBoardPin[]>();
  const directSourceReach = new Map<string, NormalizedBoardPin[]>();
  for (const source of sources) {
    for (const endpoint of collectReachable(signalGraph, source.handleId)) {
      const bucket = sourceReach.get(endpoint) ?? [];
      bucket.push(source);
      sourceReach.set(endpoint, bucket);
    }
    for (const endpoint of collectReachable(directGraph, source.handleId)) {
      const bucket = directSourceReach.get(endpoint) ?? [];
      bucket.push(source);
      directSourceReach.set(endpoint, bucket);
    }
  }

  const sinkReach = new Set<string>();
  const directSinkReach = new Set<string>();
  for (const sink of sinks) {
    for (const endpoint of collectReachable(loadGraph, sink.handleId)) {
      sinkReach.add(endpoint);
    }
    for (const endpoint of collectReachable(directGraph, sink.handleId)) {
      directSinkReach.add(endpoint);
    }
  }

  for (const node of nodes) {
    const model = getNodeSimulationModel(node, dynamicComponents);
    const componentState = createEmptyComponentState(node);
    components[node.id] = componentState;

    if (model === "functionGenerator") {
      const enabled = node.data.properties?.enabled?.value === "on";
      const amplitude = Math.max(
        0,
        Math.min(10, Number(node.data.properties?.amplitude?.value ?? 0)),
      );
      const offset = Math.max(
        -5,
        Math.min(5, Number(node.data.properties?.offset?.value ?? 0)),
      );
      const frequency = Math.max(
        1,
        Math.min(1000000, Number(node.data.properties?.frequency?.value ?? 1)),
      );
      const waveform = String(node.data.properties?.waveform?.value ?? "Sine");
      const outputVoltage = Math.max(0, Math.min(10, offset + amplitude));
      componentState.isPowered = running && enabled;
      componentState.brightness = running && enabled ? 1 : 0;
      componentState.voltage = running && enabled ? outputVoltage : 0;
      componentState.telemetry = {
        enabled,
        waveform,
        frequency,
        amplitude,
        offset,
      };
      continue;
    }

    if (node.data.componentType === "powerSupply") {
      const positivePin = findPinId(node, dynamicComponents, [
        "positive",
        ...PIN_ALIASES.positive,
      ]);
      const negativePin = findPinId(node, dynamicComponents, [
        "negative",
        ...PIN_ALIASES.negative,
      ]);
      const positiveKey = endpointKey(node.id, positivePin);
      const negativeKey = endpointKey(node.id, negativePin);
      const enabled = node.data.properties?.enabled?.value === "on";
      const voltage = Math.max(
        0,
        Math.min(30, Number(node.data.properties?.voltage?.value ?? 0)),
      );
      const current = Math.max(
        0,
        Math.min(5, Number(node.data.properties?.current?.value ?? 0)),
      );
      const shortCircuit = collectReachable(directGraph, positiveKey).has(
        negativeKey,
      );

      componentState.isPowered = running && enabled;
      componentState.brightness = shortCircuit ? 0 : running && enabled ? 1 : 0;
      componentState.voltage = running && enabled ? voltage : 0;
      componentState.telemetry = {
        enabled,
        voltage,
        current,
        shortCircuit,
        spark: running && shortCircuit,
        burnt: running && shortCircuit,
        fault:
          running && shortCircuit ? `${node.data.label} short circuit` : "",
      };
      componentState.pins = {
        [positivePin]: {
          handleId: positivePin,
          voltage: running && enabled ? voltage : 0,
          normalizedValue: running && enabled && voltage > 0 ? 1 : 0,
          active: running && enabled && voltage > 0,
        },
        [negativePin]: {
          handleId: negativePin,
          voltage: 0,
          normalizedValue: 0,
          active: true,
        },
      };
      continue;
    }

    if (BATTERY_TYPES.has(model)) {
      const positivePin = findPinId(node, dynamicComponents, [
        "positive",
        ...PIN_ALIASES.positive,
      ]);
      const negativePin = findPinId(node, dynamicComponents, [
        "negative",
        ...PIN_ALIASES.negative,
      ]);
      const positiveKey = endpointKey(node.id, positivePin);
      const negativeKey = endpointKey(node.id, negativePin);
      const individualVoltage = Math.max(
        0,
        Number(node.data.properties?.voltage?.value ?? 0),
      );

      // Use equivalent voltage of the specific battery component
      const comp = batteryNetwork.components?.find((c) =>
        c.batteries.some((b) => b.nodeId === node.id),
      );
      const voltage = comp ? comp.analysis.equivalentVoltage : individualVoltage;
      const config = comp ? comp.analysis.configuration : "single";
      const equivVoltage = comp ? comp.analysis.equivalentVoltage : individualVoltage;
      const equivCapacity = comp ? comp.analysis.equivalentCapacity : 1000;
      const equivResistance = comp ? comp.analysis.equivalentInternalResistance : 0.1;

      const shortCircuit = collectReachable(directGraph, positiveKey).has(
        negativeKey,
      );

      componentState.isPowered = voltage > 0;
      componentState.brightness = shortCircuit ? 0 : clamp01(voltage / 9);
      componentState.voltage = voltage;
      componentState.telemetry = {
        voltage: Number(voltage.toFixed(2)),
        individualVoltage: Number(individualVoltage.toFixed(2)),
        configuration: config,
        equivalentVoltage: Number(equivVoltage.toFixed(2)),
        equivalentCapacity: Number(equivCapacity.toFixed(2)),
        equivalentInternalResistance: Number(equivResistance.toFixed(4)),
        shortCircuit,
        spark: running && shortCircuit,
        burnt: running && shortCircuit,
        fault:
          running && shortCircuit ? `${node.data.label} short circuit` : "",
      };
      componentState.pins = {
        [positivePin]: {
          handleId: positivePin,
          voltage: Number(voltage.toFixed(2)),
          normalizedValue: voltage > 0 ? 1 : 0,
          active: voltage > 0,
        },
        [negativePin]: {
          handleId: negativePin,
          voltage: 0,
          normalizedValue: 0,
          active: true,
        },
      };
      continue;
    }

    if (model === "led") {
      const anodePin = findPinId(node, dynamicComponents, [
        "anode",
        ...PIN_ALIASES.positive,
      ]);
      const cathodePin = findPinId(node, dynamicComponents, [
        "cathode",
        ...PIN_ALIASES.negative,
      ]);
      const anodeKey = endpointKey(node.id, anodePin);
      const cathodeKey = endpointKey(node.id, cathodePin);

      const targetSources = new Set(sources.map((s) => s.handleId));
      const targetSinks = new Set(sinks.map((s) => s.handleId));

      const potentialPowerPins = new Set<string>();
      let hasPowerSourceInCanvas = false;
      for (const n of nodes) {
        const m = getNodeSimulationModel(n, dynamicComponents);
        if (m === "arduino" || m === "raspberrypipico" || m === "esp32") {
          const pins = getComponentDefinition(n)?.pins ?? [];
          for (const p of pins) {
            potentialPowerPins.add(endpointKey(n.id, p.id));
          }
          hasPowerSourceInCanvas = true;
        } else if (
          m === "battery9v" ||
          m === "battery1_5v" ||
          m === "battery12v" ||
          m === "battery3v" ||
          m === "coinCell" ||
          m === "coincell" ||
          m === "powerSupply" ||
          m === "functionGenerator"
        ) {
          potentialPowerPins.add(endpointKey(n.id, "positive"));
          potentialPowerPins.add(endpointKey(n.id, "negative"));
          hasPowerSourceInCanvas = true;
        }
      }

      const reachableFromAnode = collectReachable(signalGraph, anodeKey);
      const reachesPowerAnode = [...reachableFromAnode].some((key) =>
        potentialPowerPins.has(key),
      );

      const reachableFromCathode = collectReachable(signalGraph, cathodeKey);
      const reachesPowerCathode = [...reachableFromCathode].some((key) =>
        potentialPowerPins.has(key),
      );

      const physicalOpenCircuit =
        running && (!reachesPowerAnode || !reachesPowerCathode);

      const hasOutputPinOnAnode = [...reachableFromAnode].some((key) => {
        const pin = normalizedPins.find((p) => p.handleId === key);
        return pin?.mode === "OUTPUT";
      });
      const hasOutputPinOnCathode = [...reachableFromCathode].some((key) => {
        const pin = normalizedPins.find((p) => p.handleId === key);
        return pin?.mode === "OUTPUT";
      });
      const hasTransistorOnAnode = [...reachableFromAnode].some((key) => {
        const nodeId = key.split(":")[0];
        const n = nodes.find((node) => node.id === nodeId);
        if (!n) return false;
        const model = getNodeSimulationModel(n, dynamicComponents);
        return model === "npn" || model === "pnp" || model === "nmosSignal" || model === "pmosSignal";
      });
      const hasTransistorOnCathode = [...reachableFromCathode].some((key) => {
        const nodeId = key.split(":")[0];
        const n = nodes.find((node) => node.id === nodeId);
        if (!n) return false;
        const model = getNodeSimulationModel(n, dynamicComponents);
        return model === "npn" || model === "pnp" || model === "nmosSignal" || model === "pmosSignal";
      });
      const controlledByTransistor = hasTransistorOnAnode || hasTransistorOnCathode;
      const controlledByGpio = hasOutputPinOnAnode || hasOutputPinOnCathode || controlledByTransistor;

      const reversedSignalGraph = reverseGraph(signalGraph);
      const sourcePath = findShortestPath(
        reversedSignalGraph,
        anodeKey,
        targetSources,
        cathodeKey,
      );
      const sinkPath = findShortestPath(
        signalGraph,
        cathodeKey,
        targetSinks,
        anodeKey,
      );

      let currentMilliAmps = 0;
      let totalResistance = 0;
      let totalVoltageDrop = 0;
      let pathBlocked = !sourcePath || !sinkPath;
      let bypassed = false;
      let V_source = 0;
      let sourcePin: NormalizedBoardPin | undefined;
      let pathDutyCycle = 1.0;

      if (sourcePath && sinkPath) {
        let sourceKey = sourcePath[sourcePath.length - 1];
        sourcePin = sources.find((s) => s.handleId === sourceKey);
        V_source = sourcePin ? sourcePin.voltage : 0;

        // If the source is a POT_WIPER, trace through the pot to the real battery.
        // The unloaded wiper voltage is misleading — instead use the battery voltage
        // and include the pot segment resistance so brightness varies with position.
        if (sourcePin?.mode === "POT_WIPER") {
          const potWiperKey = sourceKey;
          const potNodeId = potWiperKey.slice(0, potWiperKey.lastIndexOf(":"));
          const potNode = nodes.find((n) => n.id === potNodeId);
          if (potNode) {
            const pin1Id = findPinId(potNode, dynamicComponents, [
              "pin1",
              ...PIN_ALIASES.positive,
            ]);
            const pin2Id = findPinId(potNode, dynamicComponents, [
              "pin2",
              ...PIN_ALIASES.negative,
            ]);
            const pin1Key = endpointKey(potNodeId, pin1Id);
            const pin2Key = endpointKey(potNodeId, pin2Id);

            // Find the actual battery (non-wiper) source reachable from each pot terminal
            const realSources = new Set(
              sources
                .filter((s) => s.mode !== "POT_WIPER")
                .map((s) => s.handleId),
            );
            const pathViaPin1 = findShortestPath(
              reversedSignalGraph,
              pin1Key,
              realSources,
              potWiperKey,
            );
            const pathViaPin2 = findShortestPath(
              reversedSignalGraph,
              pin2Key,
              realSources,
              potWiperKey,
            );

            // Pick the terminal that reaches a real battery source
            let potPinKey = pin1Key;
            let batteryPath = pathViaPin1;
            if (!batteryPath && pathViaPin2) {
              potPinKey = pin2Key;
              batteryPath = pathViaPin2;
            }

            if (batteryPath) {
              const batteryKey = batteryPath[batteryPath.length - 1];
              const batteryPin = sources.find((s) => s.handleId === batteryKey);
              if (batteryPin) {
                // Extend sourcePath: [anode, ..., wiper, potTerminal, ..., battery]
                // This adds the pot segment into fullPath so resistance is computed correctly
                (sourcePath as string[]).push(
                  potPinKey,
                  ...batteryPath.slice(1),
                );
                V_source = batteryPin.voltage;
                sourcePin = batteryPin;
                sourceKey = batteryKey;
              }
            }
          }
        }

        pathDutyCycle = 1.0;
        if (sourcePin && sourcePin.normalizedValue !== undefined && sourcePin.normalizedValue < 1.0) {
          pathDutyCycle = Math.min(pathDutyCycle, sourcePin.normalizedValue);
        }

        const fullPath = [...sourcePath].reverse().concat(sinkPath);

        for (let i = 0; i < fullPath.length - 1; i++) {
          const k1 = fullPath[i];
          const k2 = fullPath[i + 1];

          const lastColon1 = k1.lastIndexOf(":");
          const nodeId1 = k1.slice(0, lastColon1);
          const pinId1 = k1.slice(lastColon1 + 1);

          const lastColon2 = k2.lastIndexOf(":");
          const nodeId2 = k2.slice(0, lastColon2);
          const pinId2 = k2.slice(lastColon2 + 1);

          if (nodeId1 === nodeId2) {
            const componentNode = nodes.find((n) => n.id === nodeId1);
            if (!componentNode) continue;

            const compModel = getNodeSimulationModel(
              componentNode,
              dynamicComponents,
            );
            if (compModel === "resistor") {
              totalResistance += getResistanceOhms(componentNode);
            } else if (compModel === "photoresistor") {
              totalResistance += getPhotoresistorOhms(componentNode);
            } else if (compModel === "potentiometer") {
              totalResistance += getPotentiometerResistance(
                componentNode,
                pinId1,
                pinId2,
                dynamicComponents,
              );
            } else if (
              compModel === "npn" ||
              compModel === "pnp" ||
              compModel === "nmosSignal" ||
              compModel === "pmosSignal"
            ) {
              const { R_load, V_drop_load } = getPathLoadParameters({
                fullPath,
                nodes,
                dynamicComponents,
              });
              const ceParams = getTransistorCEParameters({
                node: componentNode,
                nodes,
                dynamicComponents,
                sourceReach,
                sinkReach,
                directSinkReach,
                signalGraph,
                V_source,
                R_load,
                V_drop_load,
              });
              totalResistance += ceParams.R_ce;
              totalVoltageDrop += ceParams.V_ce_drop;
              if (ceParams.dutyCycle !== undefined) {
                pathDutyCycle = Math.min(pathDutyCycle, ceParams.dutyCycle);
              }
            } else if (compModel === "led") {
              const nodeAnode = findPinId(componentNode, dynamicComponents, [
                "anode",
                ...PIN_ALIASES.positive,
              ]);
              const nodeCathode = findPinId(componentNode, dynamicComponents, [
                "cathode",
                ...PIN_ALIASES.negative,
              ]);

              if (pinId1 === nodeCathode && pinId2 === nodeAnode) {
                pathBlocked = true;
              } else if (pinId1 === nodeAnode && pinId2 === nodeCathode) {
                totalVoltageDrop += getLedForwardVoltage(componentNode);
              }
            }
          }
        }

        const finalResistance = totalResistance > 0 ? totalResistance : 10;

        bypassed = false;
        if (sourcePin && sinkPath) {
          const reachableFromAnode = collectReachable(directGraph, anodeKey);
          const reachableFromSource = collectReachable(directGraph, sourcePin.handleId);
          for (const key of sinkPath) {
            if (reachableFromAnode.has(key) || reachableFromSource.has(key)) {
              bypassed = true;
              break;
            }
          }
        }

        // For PWM OUTPUT pins, diode conduction is gated by pulse peak voltage (5V/3.3V), not duty-averaged DC voltage.
        const isPwmOutput = sourcePin && sourcePin.mode === "OUTPUT" && pathDutyCycle < 1.0;
        const V_peak = isPwmOutput ? (boardType === "arduino" ? 5.0 : 3.3) : V_source;

        // LED knee voltage is ~0.2V below rated V_f — this is when the diode starts conducting.
        // Formula: I = (V_peak - V_knee) / R, where V_knee = V_f - 0.2
        const kneeVoltage = Math.max(0, totalVoltageDrop - 0.2);
        currentMilliAmps =
          !pathBlocked && V_peak >= kneeVoltage && V_peak > 0 && !bypassed
            ? Math.max(0, ((V_peak - kneeVoltage) / finalResistance) * 1000 * pathDutyCycle)
            : 0;
      }

      const maxVoltage = getLedForwardVoltage(node);
      const hasSeriesResistor = totalResistance > 0;
      const isPwmOutput = sourcePin && sourcePin.mode === "OUTPUT" && pathDutyCycle < 1.0;
      const V_peak = isPwmOutput ? (boardType === "arduino" ? 5.0 : 3.3) : V_source;
      const burnt =
        running &&
        ((V_peak > maxVoltage && !hasSeriesResistor) ||
          currentMilliAmps > 50);

      const normalizedCurrent = Math.min(1.0, currentMilliAmps / 20.0);
      let brightness = 0;
      if (burnt) {
        brightness = 0;
      } else if (currentMilliAmps > 0.05) {
        brightness = Number(Math.max(0.05, normalizedCurrent).toFixed(3));
      }

      let anodeVoltage = 0;
      let cathodeVoltage = 0;

      if (sourcePath && sinkPath && !pathBlocked && currentMilliAmps > 0) {
        let accumulatedResistanceBeforeAnode = 0;
        let accumulatedVoltageDropBeforeAnode = 0;
        const pathFromSourceToAnode = [...sourcePath].reverse();

        for (let i = 0; i < pathFromSourceToAnode.length - 1; i++) {
          const k1 = pathFromSourceToAnode[i];
          const k2 = pathFromSourceToAnode[i + 1];

          const lastColon1 = k1.lastIndexOf(":");
          const nodeId1 = k1.slice(0, lastColon1);
          const pinId1 = k1.slice(lastColon1 + 1);

          const lastColon2 = k2.lastIndexOf(":");
          const nodeId2 = k2.slice(0, lastColon2);
          const pinId2 = k2.slice(lastColon2 + 1);

          if (nodeId1 === nodeId2) {
            const comp = nodes.find((n) => n.id === nodeId1);
            if (comp) {
              const m = getNodeSimulationModel(comp, dynamicComponents);
              if (m === "resistor") {
                accumulatedResistanceBeforeAnode += getResistanceOhms(comp);
              } else if (m === "photoresistor") {
                accumulatedResistanceBeforeAnode += getPhotoresistorOhms(comp);
              } else if (m === "potentiometer") {
                accumulatedResistanceBeforeAnode += getPotentiometerResistance(
                  comp,
                  pinId1,
                  pinId2,
                  dynamicComponents,
                );
              } else if (
                m === "npn" ||
                m === "pnp" ||
                m === "nmosSignal" ||
                m === "pmosSignal"
              ) {
                const { R_load, V_drop_load } = getPathLoadParameters({
                  fullPath: sourcePath,
                  nodes,
                  dynamicComponents,
                });
                const ceParams = getTransistorCEParameters({
                  node: comp,
                  nodes,
                  dynamicComponents,
                  sourceReach,
                  sinkReach,
                  directSinkReach,
                  signalGraph,
                  V_source,
                  R_load,
                  V_drop_load,
                });
                accumulatedResistanceBeforeAnode += ceParams.R_ce;
                accumulatedVoltageDropBeforeAnode += ceParams.V_ce_drop;
              } else if (m === "led") {
                accumulatedVoltageDropBeforeAnode += getLedForwardVoltage(comp);
              }
            }
          }
        }

        const currentAmps = currentMilliAmps / 1000;
        anodeVoltage =
          V_source -
          (accumulatedVoltageDropBeforeAnode +
            currentAmps * accumulatedResistanceBeforeAnode);
        anodeVoltage = Math.max(0, anodeVoltage);
        cathodeVoltage = Math.max(0, anodeVoltage - getLedForwardVoltage(node));
      } else {
        anodeVoltage = sourcePin?.voltage ?? 0;
        cathodeVoltage = 0;
      }

      componentState.isPowered = !burnt && (currentMilliAmps > 0.05 || brightness > 0);
      componentState.brightness = brightness;
      componentState.voltage = burnt ? V_source : anodeVoltage;
      componentState.telemetry = {
        color: String(node.data.properties?.color?.value ?? "red"),
        currentMilliAmps: Number(currentMilliAmps.toFixed(2)),
        seriesResistance: Number(totalResistance.toFixed(2)),
        maxVoltage,
        overloadVoltage: Number(V_peak.toFixed(2)),
        burnt,
        pathBlocked,
        bypassed,
        physicalOpenCircuit,
        hasPowerSourceInCanvas,
        controlledByGpio,
        anodeConnected: isPinExternallyConnected(
          node.id,
          anodePin,
          signalGraph,
        ),
        cathodeConnected: isPinExternallyConnected(
          node.id,
          cathodePin,
          signalGraph,
        ),
        voltageAcross: Number(
          Math.abs(anodeVoltage - cathodeVoltage).toFixed(2),
        ),
        kvlViolation:
          running &&
          !pathBlocked &&
          !bypassed &&
          brightness <= 0.01 &&
          currentMilliAmps > 0 &&
          totalResistance > 0 &&
          Math.abs(
            V_source -
            (totalVoltageDrop + (currentMilliAmps / 1000) * totalResistance),
          ) > 1.0,
        invalidVoltageDrop:
          running &&
          !pathBlocked &&
          !bypassed &&
          brightness <= 0.01 &&
          currentMilliAmps > 0 &&
          totalResistance > 0 &&
          Math.abs(
            Math.abs(anodeVoltage - cathodeVoltage) -
            getLedForwardVoltage(node),
          ) > 1.0,
        fault: burnt
          ? currentMilliAmps > 50
            ? `LED burnt: ${currentMilliAmps.toFixed(1)}mA current`
            : `LED burnt: ${V_source.toFixed(1)}V > ${maxVoltage.toFixed(1)}V`
          : "",
      };
      componentState.pins = {
        [anodePin]: {
          handleId: anodePin,
          voltage: Number(anodeVoltage.toFixed(2)),
          normalizedValue: clamp01(anodeVoltage / 5),
          active: componentState.isPowered,
        },
        [cathodePin]: {
          handleId: cathodePin,
          voltage: Number(cathodeVoltage.toFixed(2)),
          normalizedValue: clamp01(cathodeVoltage / 5),
          active: componentState.isPowered,
        },
      };
      continue;
    }

    if (model === "ledrgb") {
      const groundPin = findPinId(node, dynamicComponents, [
        "ground",
        ...PIN_ALIASES.negative,
      ]);
      const groundConnected = sinkReach.has(endpointKey(node.id, groundPin));
      const channelPins = {
        red: findPinId(node, dynamicComponents, ["red", ...PIN_ALIASES.red]),
        green: findPinId(node, dynamicComponents, [
          "green",
          ...PIN_ALIASES.green,
        ]),
        blue: findPinId(node, dynamicComponents, ["blue", ...PIN_ALIASES.blue]),
      };
      const channels = ["red", "green", "blue"] as const;
      const maxVoltage = Math.max(
        1,
        Number(node.data.properties?.maxVoltage?.value ?? 3),
      );
      let overloadVoltage = 0;
      let total = 0;
      for (const channel of channels) {
        const pinId = channelPins[channel];
        const source = (
          sourceReach.get(endpointKey(node.id, pinId)) ?? []
        ).reduce<NormalizedBoardPin | null>((best, current) => {
          if (!best) return current;
          return current.voltage > best.voltage ? current : best;
        }, null);
        const directSource = getStrongestSource(
          directSourceReach.get(endpointKey(node.id, pinId)) ?? [],
        );
        if (
          directSource &&
          directSinkReach.has(endpointKey(node.id, groundPin))
        ) {
          overloadVoltage = Math.max(overloadVoltage, directSource.voltage);
        }
        const level = source && groundConnected ? source.normalizedValue : 0;
        total += level;
        componentState.pins[pinId] = {
          handleId: pinId,
          voltage: source?.voltage ?? 0,
          normalizedValue: level,
          active: level > 0,
        };
      }
      const burnt = running && overloadVoltage > maxVoltage;
      componentState.isPowered = !burnt && total > 0;
      componentState.brightness = burnt ? 0 : clamp01(total / 3);
      componentState.voltage = Math.max(
        componentState.pins[channelPins.red]?.voltage ?? 0,
        componentState.pins[channelPins.green]?.voltage ?? 0,
        componentState.pins[channelPins.blue]?.voltage ?? 0,
      );
      componentState.telemetry = {
        red: burnt
          ? 0
          : (componentState.pins[channelPins.red]?.normalizedValue ?? 0),
        green: burnt
          ? 0
          : (componentState.pins[channelPins.green]?.normalizedValue ?? 0),
        blue: burnt
          ? 0
          : (componentState.pins[channelPins.blue]?.normalizedValue ?? 0),
        maxVoltage,
        overloadVoltage: Number(overloadVoltage.toFixed(2)),
        burnt,
        fault: burnt
          ? `RGB LED burnt: ${overloadVoltage.toFixed(1)}V > ${maxVoltage.toFixed(1)}V`
          : "",
      };
      componentState.pins[groundPin] = {
        handleId: groundPin,
        voltage: 0,
        normalizedValue: 0,
        active: groundConnected,
      };
      continue;
    }

    if (model === "multimeter") {
      evaluateMultimeterComponentState({
        node,
        nodes,
        dynamicComponents,
        directSourceReach,
        directSinkReach,
        directGraph,
        signalGraph,
        completeGraph,
        sources,
        sinks,
        running,
        componentState,
      });
      continue;
    }

    if (model === "oscilloscope") {
      const signalPin = findPinId(node, dynamicComponents, [
        "signal",
        ...PIN_ALIASES.signal,
      ]);
      const groundPin = findPinId(node, dynamicComponents, [
        "ground",
        ...PIN_ALIASES.negative,
      ]);
      const measurement = measureProbePair({
        positiveKey: endpointKey(node.id, signalPin),
        negativeKey: endpointKey(node.id, groundPin),
        sourceReach,
        sinkReach,
      });
      const signalNormalized = measurement.normalizedValue;
      const groundConnected = measurement.negative.grounded;
      const sourceNodeId = getSourceNodeId(measurement.source);
      const sourceNode = sourceNodeId
        ? nodes.find((candidate) => candidate.id === sourceNodeId)
        : null;
      const sourceModel = sourceNode
        ? getNodeSimulationModel(sourceNode, dynamicComponents)
        : null;

      let activeFgNode: CircuitNode | null = null;
      if (sourceNode && sourceModel === "functionGenerator") {
        activeFgNode = sourceNode;
      } else {
        const positiveSources = sourceReach.get(endpointKey(node.id, signalPin)) ?? [];
        const fgSource = positiveSources.find((s) => {
          const sNodeId = getSourceNodeId(s);
          const sNode = sNodeId ? nodes.find((candidate) => candidate.id === sNodeId) : null;
          return sNode && getNodeSimulationModel(sNode, dynamicComponents) === "functionGenerator";
        });
        if (fgSource) {
          const sNodeId = getSourceNodeId(fgSource);
          activeFgNode = sNodeId ? nodes.find((candidate) => candidate.id === sNodeId) ?? null : null;
        } else {
          for (const tNode of nodes) {
            const m = getNodeSimulationModel(tNode, dynamicComponents);
            if (m === "npn" || m === "pnp" || m === "nmosSignal" || m === "pmosSignal") {
              const bPin = findPinId(tNode, dynamicComponents, ["base", "gate"]);
              const bSources = sourceReach.get(endpointKey(tNode.id, bPin)) ?? [];
              const bFg = bSources.find((s) => {
                const sNodeId = getSourceNodeId(s);
                const sNode = sNodeId ? nodes.find((candidate) => candidate.id === sNodeId) : null;
                return sNode && getNodeSimulationModel(sNode, dynamicComponents) === "functionGenerator";
              });
              if (bFg) {
                const sNodeId = getSourceNodeId(bFg);
                activeFgNode = sNodeId ? nodes.find((candidate) => candidate.id === sNodeId) ?? null : null;
                break;
              }
            }
          }
        }
      }

      const sourceTelemetry: Record<string, string | number | boolean> =
        activeFgNode
          ? {
            signalSourceType: "functionGenerator",
            waveform: String(
              activeFgNode.data.properties?.waveform?.value ?? "Sine",
            ),
            frequency: Math.max(
              1,
              Math.min(
                1000000,
                Number(activeFgNode.data.properties?.frequency?.value ?? 1),
              ),
            ),
            amplitude: Math.max(
              0,
              Math.min(
                10,
                Number(activeFgNode.data.properties?.amplitude?.value ?? 0),
              ),
            ),
            offset: Math.max(
              -5,
              Math.min(
                5,
                Number(activeFgNode.data.properties?.offset?.value ?? 0),
              ),
            ),
            enabled: activeFgNode.data.properties?.enabled?.value === "on",
            source: getNodeLabel(activeFgNode),
          }
          : sourceNode && sourceNode.data.componentType === "powerSupply"
            ? {
              signalSourceType: "powerSupply",
              source: getNodeLabel(sourceNode),
              supplyVoltage: Math.max(
                0,
                Math.min(
                  30,
                  Number(sourceNode.data.properties?.voltage?.value ?? 0),
                ),
              ),
              supplyCurrent: Math.max(
                0,
                Math.min(
                  5,
                  Number(sourceNode.data.properties?.current?.value ?? 0),
                ),
              ),
              enabled: sourceNode.data.properties?.enabled?.value === "on",
            }
            : {
              source: getSourceLabel(measurement.source),
            };

      componentState.isPowered = running && Boolean(measurement.source);
      componentState.brightness = running ? signalNormalized : 0;
      componentState.voltage = measurement.voltage;
      componentState.telemetry = {
        signalVoltage: Number(measurement.voltage.toFixed(3)),
        signalNormalized: Number(signalNormalized.toFixed(3)),
        signalProbeVoltage: Number(measurement.positive.voltage.toFixed(3)),
        groundProbeVoltage: Number(measurement.negative.voltage.toFixed(3)),
        groundConnected,
        ...sourceTelemetry,
      };
      componentState.pins = {
        [signalPin]: {
          handleId: signalPin,
          voltage: measurement.positive.voltage,
          normalizedValue: signalNormalized,
          active: Boolean(measurement.positive.source),
        },
        [groundPin]: {
          handleId: groundPin,
          voltage: measurement.negative.voltage,
          normalizedValue: measurement.negative.normalizedValue,
          active: groundConnected,
        },
      };
      continue;
    }

    if (model === "resistor") {
      const pin1 = findPinId(node, dynamicComponents, [
        "pin1",
        ...PIN_ALIASES.positive,
      ]);
      const pin2 = findPinId(node, dynamicComponents, [
        "pin2",
        ...PIN_ALIASES.negative,
      ]);
      const pin1Key = endpointKey(node.id, pin1);
      const pin2Key = endpointKey(node.id, pin2);

      const targetSources = new Set(sources.map((s) => s.handleId));
      const targetSinks = new Set(sinks.map((s) => s.handleId));
      const reversedSignalGraph = reverseGraph(signalGraph);

      // Check which pin is connected to the source for polar independence
      const path1 = findShortestPath(
        reversedSignalGraph,
        pin1Key,
        targetSources,
        pin2Key,
      );
      const path2 = findShortestPath(
        reversedSignalGraph,
        pin2Key,
        targetSources,
        pin1Key,
      );

      let sourcePath: string[] | null = null;
      let sinkPath: string[] | null = null;
      let anodePin = pin1;
      let cathodePin = pin2;

      if (path1) {
        sourcePath = path1;
        sinkPath = findShortestPath(signalGraph, pin2Key, targetSinks, pin1Key);
        anodePin = pin1;
        cathodePin = pin2;
      } else if (path2) {
        sourcePath = path2;
        sinkPath = findShortestPath(signalGraph, pin1Key, targetSinks, pin2Key);
        anodePin = pin2;
        cathodePin = pin1;
      }

      let currentMilliAmps = 0;
      let totalResistance = 0;
      let totalVoltageDrop = 0;
      let V_source = 0;
      let sourcePin: NormalizedBoardPin | undefined;

      if (sourcePath && sinkPath) {
        const sourceKey = sourcePath[sourcePath.length - 1];
        sourcePin = sources.find((s) => s.handleId === sourceKey);
        V_source = sourcePin ? sourcePin.voltage : 0;

        const fullPath = [...sourcePath].reverse().concat(sinkPath);

        for (let i = 0; i < fullPath.length - 1; i++) {
          const k1 = fullPath[i];
          const k2 = fullPath[i + 1];

          const lastColon1 = k1.lastIndexOf(":");
          const nodeId1 = k1.slice(0, lastColon1);

          if (nodeId1 === k2.slice(0, k2.lastIndexOf(":"))) {
            const componentNode = nodes.find((n) => n.id === nodeId1);
            if (componentNode) {
              const compModel = getNodeSimulationModel(
                componentNode,
                dynamicComponents,
              );
              let resistance = 0;
              let drop = 0;

              if (compModel === "resistor") {
                resistance = getResistanceOhms(componentNode);
              } else if (compModel === "photoresistor") {
                resistance = getPhotoresistorOhms(componentNode);
              } else if (compModel === "led" || compModel === "ledrgb") {
                drop = getLedForwardVoltage(componentNode);
              } else if (compModel === "diode") {
                drop = 0.7;
              } else if (compModel === "sevenSegment") {
                drop = 3.0;
              } else if (
                compModel === "dcmotor" ||
                compModel === "vibrationMotor" ||
                compModel === "hobbyGearmotor"
              ) {
                resistance = 10;
              }

              totalResistance += resistance;
              totalVoltageDrop += drop;
            }
          }
        }

        const finalResistance = totalResistance > 0 ? totalResistance : 10;
        const kneeVoltage = Math.max(0, totalVoltageDrop - 0.2);
        currentMilliAmps =
          V_source >= kneeVoltage && V_source > 0
            ? Math.max(0, ((V_source - kneeVoltage) / finalResistance) * 1000)
            : 0;
      }

      let anodeVoltage = 0;
      let cathodeVoltage = 0;

      if (sourcePath && sinkPath && currentMilliAmps > 0) {
        let accumulatedResistanceBeforeAnode = 0;
        let accumulatedVoltageDropBeforeAnode = 0;
        const pathFromSourceToAnode = [...sourcePath].reverse();

        for (let i = 0; i < pathFromSourceToAnode.length - 1; i++) {
          const k1 = pathFromSourceToAnode[i];
          const k2 = pathFromSourceToAnode[i + 1];

          const lastColon1 = k1.lastIndexOf(":");
          const nodeId1 = k1.slice(0, lastColon1);

          if (nodeId1 === k2.slice(0, k2.lastIndexOf(":"))) {
            const comp = nodes.find((n) => n.id === nodeId1);
            if (comp) {
              const m = getNodeSimulationModel(comp, dynamicComponents);
              if (m === "resistor") {
                accumulatedResistanceBeforeAnode += getResistanceOhms(comp);
              } else if (m === "photoresistor") {
                accumulatedResistanceBeforeAnode += getPhotoresistorOhms(comp);
              } else if (m === "led" || m === "ledrgb") {
                accumulatedVoltageDropBeforeAnode += getLedForwardVoltage(comp);
              } else if (m === "diode") {
                accumulatedVoltageDropBeforeAnode += 0.7;
              } else if (m === "sevenSegment") {
                accumulatedVoltageDropBeforeAnode += 3.0;
              } else if (
                m === "dcmotor" ||
                m === "vibrationMotor" ||
                m === "hobbyGearmotor"
              ) {
                accumulatedResistanceBeforeAnode += 10;
              }
            }
          }
        }

        const currentAmps = currentMilliAmps / 1000;
        anodeVoltage =
          V_source -
          (accumulatedVoltageDropBeforeAnode +
            currentAmps * accumulatedResistanceBeforeAnode);
        anodeVoltage = Math.max(0, anodeVoltage);
        const resistorValue = getResistanceOhms(node);
        cathodeVoltage = Math.max(
          0,
          anodeVoltage - currentAmps * resistorValue,
        );
      } else {
        const pin1Reading = getProbeReading(pin1Key, sourceReach, sinkReach);
        const pin2Reading = getProbeReading(pin2Key, sourceReach, sinkReach);
        anodeVoltage = pin1Reading.voltage;
        cathodeVoltage = pin2Reading.voltage;
      }

      const v_pin1 = anodePin === pin1 ? anodeVoltage : cathodeVoltage;
      const v_pin2 = anodePin === pin2 ? anodeVoltage : cathodeVoltage;

      const voltageAcross = Math.abs(v_pin1 - v_pin2);
      const resistance = getResistanceOhms(node);
      const current = currentMilliAmps / 1000;

      // Verify all three standard power dissipation equations
      const power_vi = voltageAcross * current;
      const power_i2r = current * current * resistance;
      const power_v2r =
        resistance > 0 ? (voltageAcross * voltageAcross) / resistance : 0;
      const power = power_vi;

      // Safety and fault condition checks
      const overheated = running && power > 0.25;
      const burnt = running && power > 0.5;
      const isOpen = resistance >= 10000000;
      const isShort = resistance <= 1;

      componentState.isPowered =
        running && Boolean(sourcePath && sinkPath) && voltageAcross > 0.001;
      componentState.voltage = voltageAcross;

      // Find network information for this resistor
      const resistorNetwork = resistorNetworkAnalysis.networks.find((network) =>
        network.resistors.some((r) => r.nodeId === node.id),
      );
      const resistorState = resistorNetwork?.resistorStates.find(
        (state) => state.nodeId === node.id,
      );

      componentState.telemetry = {
        resistance,
        voltageAcross: Number(voltageAcross.toFixed(2)),
        current: Number(current.toFixed(6)),
        power: Number(power.toFixed(6)),
        powerMilliWatts: Number((power * 1000).toFixed(2)),
        pin1Voltage: Number(v_pin1.toFixed(2)),
        pin2Voltage: Number(v_pin2.toFixed(2)),
        overheated,
        burnt,
        isOpen,
        isShort,
        // Enhanced network analysis data
        networkType: resistorNetwork?.type || "single",
        equivalentResistance:
          resistorNetwork?.equivalentResistance || resistance,
        networkCurrent: resistorNetwork?.totalCurrent || current,
        formattedResistance:
          resistorState?.formattedResistance || `${resistance.toFixed(2)} Ω`,
        formattedVoltage:
          resistorState?.formattedVoltage || `${voltageAcross.toFixed(2)} V`,
        formattedCurrent:
          resistorState?.formattedCurrent ||
          `${(current * 1000).toFixed(2)} mA`,
        formattedPower:
          resistorState?.formattedPower || `${(power * 1000).toFixed(2)} mW`,
        totalEquivalentResistance:
          resistorNetworkAnalysis.totalEquivalentResistance,
        totalCircuitCurrent: resistorNetworkAnalysis.totalCurrent,
        totalCircuitPower: resistorNetworkAnalysis.totalPower,
        hasShortCircuit: resistorNetworkAnalysis.hasShortCircuit,
        hasOpenCircuit: resistorNetworkAnalysis.hasOpenCircuit,
      };

      componentState.pins = {
        [pin1]: {
          handleId: pin1,
          voltage: Number(v_pin1.toFixed(3)),
          normalizedValue: clamp01(v_pin1 / 5),
          active: Boolean(sourcePath || sinkPath),
        },
        [pin2]: {
          handleId: pin2,
          voltage: Number(v_pin2.toFixed(3)),
          normalizedValue: clamp01(v_pin2 / 5),
          active: Boolean(sourcePath || sinkPath),
        },
      };
      continue;
    }

    if (model === "photoresistor") {
      const pin1 = findPinId(node, dynamicComponents, [
        "pin1",
        ...PIN_ALIASES.positive,
      ]);
      const pin2 = findPinId(node, dynamicComponents, [
        "pin2",
        ...PIN_ALIASES.negative,
      ]);
      const pin1Reading = getProbeReading(
        endpointKey(node.id, pin1),
        sourceReach,
        sinkReach,
      );
      const pin2Reading = getProbeReading(
        endpointKey(node.id, pin2),
        sourceReach,
        sinkReach,
      );
      const lightLevel = Math.max(
        0,
        Math.min(100, Number(node.data.properties?.lightLevel?.value ?? 50)),
      );
      const resistance = getPhotoresistorOhms(node);
      const voltageAcross = pin1Reading.voltage - pin2Reading.voltage;
      componentState.isPowered =
        running && (Boolean(pin1Reading.source) || Boolean(pin2Reading.source));
      componentState.brightness = running ? clamp01(lightLevel / 100) : 0;
      componentState.voltage = Math.abs(voltageAcross);
      componentState.telemetry = {
        lightLevel,
        resistance: Number(resistance.toFixed(2)),
        voltageAcross: Number(voltageAcross.toFixed(3)),
        pin1Voltage: Number(pin1Reading.voltage.toFixed(3)),
        pin2Voltage: Number(pin2Reading.voltage.toFixed(3)),
      };
      componentState.pins = {
        [pin1]: {
          handleId: pin1,
          voltage: pin1Reading.voltage,
          normalizedValue: pin1Reading.normalizedValue,
          active: Boolean(pin1Reading.source) || pin1Reading.grounded,
        },
        [pin2]: {
          handleId: pin2,
          voltage: pin2Reading.voltage,
          normalizedValue: pin2Reading.normalizedValue,
          active: Boolean(pin2Reading.source) || pin2Reading.grounded,
        },
      };
      continue;
    }

    if (model === "capacitor") {
      const pin1 = findPinId(node, dynamicComponents, [
        "pin1",
        ...PIN_ALIASES.positive,
      ]);
      const pin2 = findPinId(node, dynamicComponents, [
        "pin2",
        ...PIN_ALIASES.negative,
      ]);
      const pin1Reading = getProbeReading(
        endpointKey(node.id, pin1),
        sourceReach,
        sinkReach,
      );
      const pin2Reading = getProbeReading(
        endpointKey(node.id, pin2),
        sourceReach,
        sinkReach,
      );
      const pin1DirectReading = getProbeReading(
        endpointKey(node.id, pin1),
        directSourceReach,
        directSinkReach,
      );
      const pin2DirectReading = getProbeReading(
        endpointKey(node.id, pin2),
        directSourceReach,
        directSinkReach,
      );
      const voltageAcross = pin1Reading.voltage - pin2Reading.voltage;
      const directVoltageAcross =
        pin1DirectReading.voltage - pin2DirectReading.voltage;
      const effectiveVoltage =
        Math.abs(voltageAcross) > 0.001 ? voltageAcross : directVoltageAcross;
      const referenceVoltage = Math.max(
        Math.abs(pin1Reading.source?.voltage ?? 0),
        Math.abs(pin2Reading.source?.voltage ?? 0),
        Math.abs(pin1DirectReading.source?.voltage ?? 0),
        Math.abs(pin2DirectReading.source?.voltage ?? 0),
        5,
      );
      const chargeLevel = clamp01(
        Math.abs(effectiveVoltage) / referenceVoltage,
      );
      componentState.isPowered = running && chargeLevel > 0;
      componentState.brightness = running ? chargeLevel : 0;
      componentState.voltage = effectiveVoltage;
      componentState.telemetry = {
        capacitance: Number(node.data.properties?.capacitance?.value ?? 0),
        capacitanceFarads: Number(getCapacitanceFarads(node).toExponential(3)),
        voltageAcross: Number(effectiveVoltage.toFixed(3)),
        chargeLevel: Number(chargeLevel.toFixed(3)),
        charged: running && chargeLevel > 0.02,
      };
      componentState.pins = {
        [pin1]: {
          handleId: pin1,
          voltage: pin1Reading.voltage,
          normalizedValue: pin1Reading.normalizedValue,
          active: Boolean(pin1Reading.source) || pin1Reading.grounded,
        },
        [pin2]: {
          handleId: pin2,
          voltage: pin2Reading.voltage,
          normalizedValue: pin2Reading.normalizedValue,
          active: Boolean(pin2Reading.source) || pin2Reading.grounded,
        },
      };
      continue;
    }

    if (model === "potentiometer") {
      const pin1 = findPinId(node, dynamicComponents, [
        "pin1",
        ...PIN_ALIASES.positive,
      ]);
      const pin2 = findPinId(node, dynamicComponents, [
        "pin2",
        ...PIN_ALIASES.negative,
      ]);
      const wiper = findPinId(node, dynamicComponents, [
        "wiper",
        ...PIN_ALIASES.wiper,
      ]);
      const pin1Reading = getProbeReading(
        endpointKey(node.id, pin1),
        sourceReach,
        sinkReach,
      );
      const pin2Reading = getProbeReading(
        endpointKey(node.id, pin2),
        sourceReach,
        sinkReach,
      );
      const wiperReading = getProbeReading(
        endpointKey(node.id, wiper),
        sourceReach,
        sinkReach,
      );
      const position = Math.max(
        0,
        Math.min(100, Number(node.data.properties?.position?.value ?? 50)),
      );
      componentState.isPowered = running && Boolean(wiperReading.source);
      componentState.brightness = running ? clamp01(position / 100) : 0;
      componentState.voltage = wiperReading.voltage;
      componentState.telemetry = {
        resistance: getResistanceOhms(node),
        position,
        wiperVoltage: Number(wiperReading.voltage.toFixed(3)),
        pin1Voltage: Number(pin1Reading.voltage.toFixed(3)),
        pin2Voltage: Number(pin2Reading.voltage.toFixed(3)),
      };
      componentState.pins = {
        [pin1]: {
          handleId: pin1,
          voltage: pin1Reading.voltage,
          normalizedValue: pin1Reading.normalizedValue,
          active: Boolean(pin1Reading.source) || pin1Reading.grounded,
        },
        [wiper]: {
          handleId: wiper,
          voltage: wiperReading.voltage,
          normalizedValue: wiperReading.normalizedValue,
          active: Boolean(wiperReading.source) || wiperReading.grounded,
        },
        [pin2]: {
          handleId: pin2,
          voltage: pin2Reading.voltage,
          normalizedValue: pin2Reading.normalizedValue,
          active: Boolean(pin2Reading.source) || pin2Reading.grounded,
        },
      };
      continue;
    }

    if (model === "slideswitch") {
      const state = node.data.properties?.state?.value;
      const normalizedState =
        state === "right" || state === "on"
          ? "right"
          : state === "left" || state === "off"
            ? "left"
            : "left";
      const activeThrow = getSlideswitchActiveThrow(node);
      componentState.isPowered = true;
      componentState.brightness = 1;
      componentState.telemetry = {
        state: normalizedState,
        connectedTo: activeThrow ? `common-${activeThrow}` : "open",
      };
      continue;
    }

    if (model === "relaySpst") {
      const isEnergized = activeRelayNodeIds.has(node.id);
      const coilPos = findPinId(node, dynamicComponents, [
        "terminal5",
        "coil_pos",
        "coil_positive",
      ]);
      const coilNeg = findPinId(node, dynamicComponents, [
        "terminal8",
        "coil_neg",
        "coil_negative",
      ]);
      const posReading = getProbeReading(
        endpointKey(node.id, coilPos),
        controlSourceReach,
        controlSinkReach,
      );
      const negReading = getProbeReading(
        endpointKey(node.id, coilNeg),
        controlSourceReach,
        controlSinkReach,
      );
      const vCoil = Math.abs(posReading.voltage - negReading.voltage);
      const rCoil = Math.max(
        1,
        Number(node.data.properties?.coilResistance?.value ?? 70),
      );
      const iCoil = vCoil / rCoil;
      const pCoil = vCoil * iCoil;

      const isPicoDriven =
        (posReading.voltage <= 3.4 && posReading.voltage >= 2.5) || boardType === "pico" || hasPico;
      const rawPickup = Number(
        node.data.properties?.pickupVoltage?.value ?? 4.0,
      );
      const vPickup = isPicoDriven && rawPickup === 4.0 ? 3.0 : rawPickup;

      const vRelease = Number(
        node.data.properties?.releaseVoltage?.value ?? 2.0,
      );
      const iPickup = vPickup / rCoil;
      const iRelease = vRelease / rCoil;

      componentState.isPowered = isEnergized;
      componentState.brightness = isEnergized ? 1 : 0;
      componentState.voltage = vCoil;
      componentState.telemetry = {
        vCoil: Number(vCoil.toFixed(3)),
        iCoil: Number(iCoil.toFixed(4)),
        pCoil: Number(pCoil.toFixed(4)),
        iPickup: Number(iPickup.toFixed(4)),
        iRelease: Number(iRelease.toFixed(4)),
        energized: isEnergized,
        state: isEnergized ? "on" : "off",
        pickupVoltage: vPickup,
        releaseVoltage: vRelease,
        coilResistance: rCoil,
      };
      continue;
    }

    if (model === "relayDpdt") {
      const isEnergized = activeRelayNodeIds.has(node.id);
      const a1Reading = getProbeReading(endpointKey(node.id, "terminal1"), sourceReach, sinkReach);
      const a2Reading = getProbeReading(endpointKey(node.id, "terminal16"), sourceReach, sinkReach);
      const coilVoltage = Math.abs(a1Reading.voltage - a2Reading.voltage);

      componentState.isPowered = isEnergized;
      componentState.brightness = isEnergized ? 1 : 0;
      componentState.voltage = coilVoltage;
      componentState.telemetry = {
        coilVoltage: Number(coilVoltage.toFixed(3)),
        isEnergized,
      };

      const term4Reading = getProbeReading(endpointKey(node.id, "terminal4"), sourceReach, sinkReach);
      const term6Reading = getProbeReading(endpointKey(node.id, "terminal6"), sourceReach, sinkReach);
      const term8Reading = getProbeReading(endpointKey(node.id, "terminal8"), sourceReach, sinkReach);
      const term13Reading = getProbeReading(endpointKey(node.id, "terminal13"), sourceReach, sinkReach);
      const term11Reading = getProbeReading(endpointKey(node.id, "terminal11"), sourceReach, sinkReach);
      const term9Reading = getProbeReading(endpointKey(node.id, "terminal9"), sourceReach, sinkReach);

      componentState.pins = {
        terminal1: {
          handleId: "terminal1",
          voltage: a1Reading.voltage,
          normalizedValue: a1Reading.normalizedValue,
          active: Boolean(a1Reading.source) || a1Reading.grounded,
        },
        terminal16: {
          handleId: "terminal16",
          voltage: a2Reading.voltage,
          normalizedValue: a2Reading.normalizedValue,
          active: Boolean(a2Reading.source) || a2Reading.grounded,
        },
        terminal4: {
          handleId: "terminal4",
          voltage: term4Reading.voltage,
          normalizedValue: term4Reading.normalizedValue,
          active: Boolean(term4Reading.source) || term4Reading.grounded,
        },
        terminal6: {
          handleId: "terminal6",
          voltage: term6Reading.voltage,
          normalizedValue: term6Reading.normalizedValue,
          active: Boolean(term6Reading.source) || term6Reading.grounded,
        },
        terminal8: {
          handleId: "terminal8",
          voltage: term8Reading.voltage,
          normalizedValue: term8Reading.normalizedValue,
          active: Boolean(term8Reading.source) || term8Reading.grounded,
        },
        terminal13: {
          handleId: "terminal13",
          voltage: term13Reading.voltage,
          normalizedValue: term13Reading.normalizedValue,
          active: Boolean(term13Reading.source) || term13Reading.grounded,
        },
        terminal11: {
          handleId: "terminal11",
          voltage: term11Reading.voltage,
          normalizedValue: term11Reading.normalizedValue,
          active: Boolean(term11Reading.source) || term11Reading.grounded,
        },
        terminal9: {
          handleId: "terminal9",
          voltage: term9Reading.voltage,
          normalizedValue: term9Reading.normalizedValue,
          active: Boolean(term9Reading.source) || term9Reading.grounded,
        },
      };
      continue;
    }

    if (
      model === "npn" ||
      model === "pnp" ||
      model === "nmosSignal" ||
      model === "pmosSignal"
    ) {
      const isTransistor = model === "npn" || model === "pnp";
      const basePin = findPinId(
        node,
        dynamicComponents,
        isTransistor ? ["base"] : ["gate"],
      );
      const collectorPin = findPinId(
        node,
        dynamicComponents,
        isTransistor ? ["collector"] : ["drain"],
      );
      const emitterPin = findPinId(
        node,
        dynamicComponents,
        isTransistor ? ["emitter"] : ["source"],
      );

      const baseReading = getProbeReading(
        endpointKey(node.id, basePin),
        sourceReach,
        sinkReach,
      );
      const collectorReading = getProbeReading(
        endpointKey(node.id, collectorPin),
        sourceReach,
        sinkReach,
      );
      const emitterReading = getProbeReading(
        endpointKey(node.id, emitterPin),
        sourceReach,
        sinkReach,
      );

      const targetSources = new Set(sources.map((s) => s.handleId));
      const collectorKey = endpointKey(node.id, collectorPin);
      const reversedSignalGraph = reverseGraph(signalGraph);
      const pathFromCollectorToSource = findShortestPath(
        reversedSignalGraph,
        collectorKey,
        targetSources,
        endpointKey(node.id, emitterPin),
      );

      let V_source = 5;
      let R_load = 1000;
      let V_drop_load = 0;

      if (pathFromCollectorToSource) {
        const sourceKey =
          pathFromCollectorToSource[pathFromCollectorToSource.length - 1];
        const sourcePin = sources.find((s) => s.handleId === sourceKey);
        V_source = sourcePin ? sourcePin.voltage : 5;
        const pathParams = getPathLoadParameters({
          fullPath: pathFromCollectorToSource,
          nodes,
          dynamicComponents,
        });
        R_load = pathParams.R_load;
        V_drop_load = pathParams.V_drop_load;
      }

      const ceParams = getTransistorCEParameters({
        node,
        nodes,
        dynamicComponents,
        sourceReach,
        sinkReach,
        directSinkReach,
        signalGraph,
        V_source,
        R_load,
        V_drop_load,
      });

      if (node.id === "hb-q3") {
        console.log("hb-q3 directSinkReach:", Array.from(directSinkReach));
        console.log("hb-q3 emitterKey:", endpointKey(node.id, findPinId(node, dynamicComponents, ["emitter"])));
        console.log("hb-q3 emitter in directSinkReach:", directSinkReach.has(endpointKey(node.id, findPinId(node, dynamicComponents, ["emitter"]))));
      }

      const V_ce_sat = isTransistor ? 0.2 : 0.05;
      const I_c_sat = Math.max(
        0.001,
        (V_source - V_drop_load - ceParams.emitterVoltage - V_ce_sat) /
        Math.max(1, R_load),
      );
      const drive = I_c_sat > 0 ? clamp01(ceParams.ic / I_c_sat) : 0;

      componentState.isPowered = running && ceParams.conduction === "ON";
      componentState.brightness = running ? drive : 0;
      componentState.voltage = collectorReading.voltage;

      componentState.telemetry = {
        state: ceParams.conduction,
        conduction: ceParams.conduction,
        vbe: ceParams.vbe,
        vce: ceParams.vce,
        baseVoltage: Number(ceParams.baseVoltage.toFixed(3)),
        collectorVoltage: Number(ceParams.collectorVoltage.toFixed(3)),
        emitterVoltage: Number(ceParams.emitterVoltage.toFixed(3)),
        baseCurrent: Number((ceParams.ib * 1000).toFixed(3)),
        collectorCurrent: Number((ceParams.ic * 1000).toFixed(3)),
        mode: ceParams.mode,
        warning: ceParams.missingBaseResistor ? "Missing base resistor!" : "",
        missingBaseResistor: ceParams.missingBaseResistor,
      };

      componentState.pins = {
        [basePin]: {
          handleId: basePin,
          voltage: baseReading.voltage,
          normalizedValue: baseReading.normalizedValue,
          active: Boolean(baseReading.source) || baseReading.grounded,
        },
        [collectorPin]: {
          handleId: collectorPin,
          voltage: collectorReading.voltage,
          normalizedValue: collectorReading.normalizedValue,
          active: Boolean(collectorReading.source) || collectorReading.grounded,
        },
        [emitterPin]: {
          handleId: emitterPin,
          voltage: emitterReading.voltage,
          normalizedValue: emitterReading.normalizedValue,
          active: Boolean(emitterReading.source) || emitterReading.grounded,
        },
      };
      continue;
    }

    if (model === "arduino" || model === "raspberrypipico") {
      const activePins = boardPins.filter((pin) => pin.active);
      const { sparked, maxReachedVoltage, maxSafeVoltage, shorted, faultMessage } = checkBoardOvervoltage(
        node.id,
        sourceReach,
        controlGraph,
        nodes,
        dynamicComponents,
        shortCircuitGraph,
      );
      componentState.isPowered = running && !sparked;
      componentState.brightness = sparked ? 0 : componentState.brightness;
      componentState.voltage = maxReachedVoltage;
      componentState.telemetry = {
        activePins: activePins.length,
        maxReachedVoltage: Number(maxReachedVoltage.toFixed(2)),
        maxSafeVoltage,
        spark: sparked,
        burnt: sparked,
        txActive: arduinoState?.txActive ?? false,
        rxActive: arduinoState?.rxActive ?? false,
        fault: faultMessage
          ?? (shorted
            ? `${node.data.label} short circuit: Power line shorted to GND!`
            : sparked
              ? `${node.data.label} over-voltage: ${maxReachedVoltage.toFixed(1)}V > ${maxSafeVoltage.toFixed(1)}V`
              : ""),
      };
      continue;
    }

    if (model === "pushbutton") {
      const pressed = node.data.properties?.state?.value === "on";
      componentState.isPowered = pressed;
      componentState.brightness = pressed ? 1 : 0;
      componentState.telemetry = {
        pressed,
      };
      continue;
    }

    if (model === "dcmotor") {
      const pin1 = findPinId(node, dynamicComponents, [
        "pin1",
        ...PIN_ALIASES.positive,
      ]);
      const pin2 = findPinId(node, dynamicComponents, [
        "pin2",
        ...PIN_ALIASES.negative,
      ]);
      const pin1Key = endpointKey(node.id, pin1);
      const pin2Key = endpointKey(node.id, pin2);
      const reversedSignalGraph = reverseGraph(signalGraph);
      const sourceIds = new Set(sources.map((s) => s.handleId));

      const path1ToSource = findShortestPath(
        reversedSignalGraph,
        pin1Key,
        sourceIds,
        pin2Key,
      );
      const path2ToSource = findShortestPath(
        reversedSignalGraph,
        pin2Key,
        sourceIds,
        pin1Key,
      );

      const path1ToSink = findShortestPath(
        signalGraph,
        pin1Key,
        sinkReach,
        pin2Key,
      );
      const path2ToSink = findShortestPath(
        signalGraph,
        pin2Key,
        sinkReach,
        pin1Key,
      );

      const p1SourcePin = path1ToSource
        ? sources.find((s) => s.handleId === path1ToSource[path1ToSource.length - 1])
        : null;
      const p2SourcePin = path2ToSource
        ? sources.find((s) => s.handleId === path2ToSource[path2ToSource.length - 1])
        : null;

      const pin1Grounded = path1ToSink !== null;
      const pin2Grounded = path2ToSink !== null;

      const forwardThrottle =
        p1SourcePin && pin2Grounded ? p1SourcePin.normalizedValue : 0;
      const reverseThrottle =
        p2SourcePin && pin1Grounded ? p2SourcePin.normalizedValue : 0;

      const measurement = measureProbePair({
        positiveKey: pin1Key,
        negativeKey: pin2Key,
        sourceReach,
        sinkReach,
      });
      const hasClosedMotorCircuit = forwardThrottle > 0 || reverseThrottle > 0;
      const measuredThrottle = hasClosedMotorCircuit
        ? measurement.normalizedValue
        : 0;
      let throttle = Math.max(
        forwardThrottle,
        reverseThrottle,
        measuredThrottle,
      );
      const source =
        forwardThrottle >= reverseThrottle ? p1SourcePin : p2SourcePin;
      const motorVoltage = hasClosedMotorCircuit
        ? Math.abs(measurement.voltage) || (source?.voltage ?? 0)
        : 0;
      let rpm = Math.round(2400 * throttle);

      if (node.data.componentType === "hobbyGearmotor") {
        if (motorVoltage < 3.0) {
          throttle = 0;
          rpm = 0;
        } else {
          const maxVoltageVal = Number(
            node.data.properties?.maxVoltage?.value ?? 9,
          );
          const ratio =
            (motorVoltage - 3.0) / Math.max(0.1, maxVoltageVal - 3.0);
          throttle = Math.min(1.2, 0.45 + Math.max(0, ratio) * 0.55);
          // Real DC Motor RPM formula: RPM = Voltage * Kv
          // For a standard yellow TT hobby gearmotor (1:48 gear ratio):
          // Kv ≈ 33.33 RPM/V, yielding ~100 RPM at 3V, ~200 RPM at 6V, and ~300 RPM at 9V.
          rpm = Math.round(motorVoltage * 33.33);
        }
      } else if (node.data.componentType === "vibrationMotor") {
        const isReversePolarity =
          measurement.voltage < 0 ||
          (reverseThrottle > 0 && forwardThrottle === 0);
        if (motorVoltage < 2.5 || isReversePolarity) {
          throttle = 0;
        } else {
          const maxVoltageVal = Number(
            node.data.properties?.maxVoltage?.value ?? 5,
          );
          const ratio =
            (motorVoltage - 2.5) / Math.max(0.1, maxVoltageVal - 2.5);
          throttle = Math.min(1.2, 0.3 + ratio * 0.7);
        }
        rpm = Math.round(2400 * throttle);
      }

      componentState.isPowered = throttle > 0;
      componentState.brightness = throttle;
      componentState.voltage = motorVoltage;
      componentState.telemetry = {
        rpm,
        voltage: Number(motorVoltage.toFixed(2)),
        direction:
          reverseThrottle > forwardThrottle || measurement.voltage < 0
            ? "reverse"
            : "forward",
        openCircuit: !hasClosedMotorCircuit,
      };
      continue;
    }

    if (model === "servo") {
      const motion =
        (args.boardType === "arduino" || args.boardType === "pico")
          ? args.servoMotions?.find((item) =>
            item.connectedNodeIds.includes(node.id),
          )
          : undefined;
      if (motion) {
        const angle = getServoAngleAtTime(motion, Date.now());
        componentState.isPowered = running;
        componentState.brightness = running ? 1 : 0;
        componentState.telemetry = {
          angle,
          signalPin: motion.pin,
          servoName: motion.servoName,
          stepCount: motion.steps.length,
          totalDuration: motion.totalDuration,
        };
      }
      continue;
    }

    if (model === "piezo") {
      const positivePin = findPinId(node, dynamicComponents, [
        "positive",
        ...PIN_ALIASES.positive,
      ]);
      const negativePin = findPinId(node, dynamicComponents, [
        "negative",
        ...PIN_ALIASES.negative,
      ]);
      const positiveKey = endpointKey(node.id, positivePin);
      const negativeKey = endpointKey(node.id, negativePin);
      const measurement = measureProbePair({
        positiveKey,
        negativeKey,
        sourceReach,
        sinkReach,
        signalGraph,
        sources,
        sinks,
        nodes,
        dynamicComponents,
      });

      const piezoVoltage = Math.abs(measurement.voltage);

      const piezoSources = sourceReach.get(positiveKey) ?? [];
      const strongestSource = piezoSources.reduce<NormalizedBoardPin | null>((best, current) => {
        if (!best) return current;
        return current.voltage > best.voltage ? current : best;
      }, null);

      const piezoActive = piezoVoltage > 2.5 || (strongestSource !== null && strongestSource.active && strongestSource.voltage > 0.1);

      let frequency = 880; // default tone frequency
      if (piezoActive) {
        if (strongestSource && strongestSource.frequency) {
          frequency = strongestSource.frequency;
        }
      }

      componentState.isPowered = piezoActive;
      componentState.brightness = piezoActive ? measurement.normalizedValue : 0;
      componentState.voltage = piezoVoltage;
      componentState.telemetry = {
        tone: piezoActive ? "ON" : "OFF",
        frequency: frequency,
        frequencyLabel: piezoActive ? `${frequency} Hz` : "0 Hz",
        drive: Number(measurement.normalizedValue.toFixed(2)),
      };
      componentState.pins = {
        [positivePin]: {
          handleId: positivePin,
          voltage: measurement.positive.voltage,
          normalizedValue: measurement.positive.normalizedValue,
          active: piezoActive,
        },
        [negativePin]: {
          handleId: negativePin,
          voltage: measurement.negative.voltage,
          normalizedValue: measurement.negative.normalizedValue,
          active: piezoActive || measurement.negative.grounded,
        },
      };
      continue;
    }

    if (model === "gasSensor") {
      const gasLevel = Number(node.data.properties?.gasLevel?.value ?? 0);
      componentState.isPowered = validateComponentConnections(node, nodes, edges);
      componentState.brightness = clamp01(gasLevel / 1023);
      componentState.telemetry = {
        gasLevel,
      };
      continue;
    }

    if (model === "dht11" || model === "dht22") {
      const vccPin = findPinId(node, dynamicComponents, ["vcc", "power", ...PIN_ALIASES.positive]);
      const gndPin = findPinId(node, dynamicComponents, ["gnd", "ground", ...PIN_ALIASES.negative]);
      const dataPin = findPinId(node, dynamicComponents, ["data", "signal", ...PIN_ALIASES.signal]);

      const vccReading = getProbeReading(endpointKey(node.id, vccPin), sourceReach, sinkReach, directSinkReach);
      const gndReading = getProbeReading(endpointKey(node.id, gndPin), sourceReach, sinkReach, directSinkReach);
      const dataReading = getProbeReading(endpointKey(node.id, dataPin), sourceReach, sinkReach, directSinkReach);

      const vccVoltage = vccReading.voltage;
      const gndVoltage = gndReading.voltage;
      const voltage = vccVoltage - gndVoltage;

      const isConnected = validateComponentConnections(node, nodes, edges);
      const isPowered = isConnected && (running ? voltage > 3.0 : true);

      const isDht22 = model === "dht22";
      const minTemp = isDht22 ? -40 : 0;
      const maxTemp = isDht22 ? 80 : 50;
      const minHum = isDht22 ? 0 : 20;
      const maxHum = isDht22 ? 100 : 90;

      const tempVal = Number(node.data.properties?.temperature?.value ?? 24);
      const humVal = Number(node.data.properties?.humidity?.value ?? 40);
      const temperature = Math.max(minTemp, Math.min(maxTemp, tempVal));
      const humidity = Math.max(minHum, Math.min(maxHum, humVal));

      componentState.isPowered = isPowered;
      componentState.voltage = isPowered ? 5.0 : 0;
      componentState.telemetry = isPowered
        ? { temperature, humidity }
        : { error: "Sensor Pins Disconnected" };

      componentState.pins = {
        [vccPin]: {
          handleId: vccPin,
          voltage: vccVoltage,
          normalizedValue: clamp01(vccVoltage / 5),
          active: Boolean(vccReading.source) || vccReading.grounded,
        },
        [gndPin]: {
          handleId: gndPin,
          voltage: gndVoltage,
          normalizedValue: clamp01(gndVoltage / 5),
          active: gndReading.grounded,
        },
        [dataPin]: {
          handleId: dataPin,
          voltage: dataReading.voltage,
          normalizedValue: clamp01(dataReading.voltage / 5),
          active: Boolean(dataReading.source) || dataReading.grounded,
        },
      };
      continue;
    }

    if (model === "lcd16x2") {
      const vccPin = findPinId(node, dynamicComponents, ["vcc", "power", ...PIN_ALIASES.positive]);
      const gndPin = findPinId(node, dynamicComponents, ["gnd", "ground", ...PIN_ALIASES.negative]);
      const vccReading = getProbeReading(endpointKey(node.id, vccPin), sourceReach, sinkReach, directSinkReach);
      const gndReading = getProbeReading(endpointKey(node.id, gndPin), sourceReach, sinkReach, directSinkReach);

      const vccConnected = Boolean(vccReading.source) || vccReading.grounded;
      const gndConnected = gndReading.grounded;

      const vccVoltage = vccReading.voltage;
      const gndVoltage = gndReading.voltage;
      const voltage = vccVoltage - gndVoltage;

      componentState.isPowered = running && voltage > 4.0;
      componentState.voltage = voltage;
      componentState.pins = {
        [vccPin]: {
          handleId: vccPin,
          voltage: vccVoltage,
          normalizedValue: clamp01(vccVoltage / 5),
          active: vccConnected,
        },
        [gndPin]: {
          handleId: gndPin,
          voltage: gndVoltage,
          normalizedValue: clamp01(gndVoltage / 5),
          active: gndConnected,
        },
      };
      continue;
    }

    if (model === "neopixel") {
      const vccPin = findPinId(node, dynamicComponents, ["vcc1", "vcc", "power", ...PIN_ALIASES.positive]);
      const gndPin = findPinId(node, dynamicComponents, ["ground1", "gnd", "ground", ...PIN_ALIASES.negative]);
      const vccReading = getProbeReading(endpointKey(node.id, vccPin), sourceReach, sinkReach, directSinkReach);
      const gndReading = getProbeReading(endpointKey(node.id, gndPin), sourceReach, sinkReach, directSinkReach);

      const vccConnected = Boolean(vccReading.source) || vccReading.grounded;
      const gndConnected = gndReading.grounded;

      const vccVoltage = vccReading.voltage;
      const gndVoltage = gndReading.voltage;
      const voltage = vccVoltage - gndVoltage;

      componentState.isPowered = running && voltage > 4.0;
      componentState.voltage = voltage;
      componentState.pins = {
        [vccPin]: {
          handleId: vccPin,
          voltage: vccVoltage,
          normalizedValue: clamp01(vccVoltage / 5),
          active: vccConnected,
        },
        [gndPin]: {
          handleId: gndPin,
          voltage: gndVoltage,
          normalizedValue: clamp01(gndVoltage / 5),
          active: gndConnected,
        },
      };
      continue;
    }

    if (model === "tiltSensor") {
      const angle = Number(node.data.properties?.angle?.value ?? 0);
      const contactClosed = angle >= TILT_THRESHOLD;
      const tilted = contactClosed;

      const pin1Key = endpointKey(node.id, "pin1");
      const pin2Key = endpointKey(node.id, "pin2");

      const pin1Connected = isPinConnectedInGraph(pin1Key, directGraph);
      const pin2Connected = isPinConnectedInGraph(pin2Key, directGraph);
      const fullyConnected = pin1Connected && pin2Connected;
      const error = fullyConnected ? "" : "Tilt Sensor Terminal Disconnected";

      const pin1Reading = getProbeReading(pin1Key, sourceReach, sinkReach, directSinkReach);
      const pin2Reading = getProbeReading(pin2Key, sourceReach, sinkReach, directSinkReach);

      componentState.isPowered = contactClosed && fullyConnected;
      componentState.brightness = contactClosed ? 1 : 0;
      componentState.pins = {
        pin1: {
          handleId: "pin1",
          voltage: pin1Reading.voltage,
          normalizedValue: pin1Reading.normalizedValue,
          active: pin1Connected,
        },
        pin2: {
          handleId: "pin2",
          voltage: pin2Reading.voltage,
          normalizedValue: pin2Reading.normalizedValue,
          active: pin2Connected,
        },
      };
      componentState.telemetry = {
        angle,
        contactClosed,
        tilted,
        pin1Connected,
        pin2Connected,
        fullyConnected,
        error,
      };
      continue;
    }

    const connected = Array.from(sourceReach.keys()).some((key) =>
      key.startsWith(`${node.id}:`),
    );
    componentState.isPowered = connected;
  }

  return {
    tick,
    timestamp: args.timestamp ?? (getTimestampOverride ? getTimestampOverride() : Date.now()),
    running,
    boardType,
    serialOutput,
    error: args.error ?? arduinoState?.error ?? null,
    components,
    boardPins: normalizedPins,
  } satisfies SimulationFrame;
}