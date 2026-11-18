import {
  getReachableGraphNodes,
  buildConductiveGraph,
  addGraphConnection,
} from "./graph";
import { getNodeSimulationModel } from "./components";
import type { CircuitNode, CircuitEdge } from "../types";
import type { SimulationFrame } from "../simulation-state";
import type { PinState } from "../arduino-simulator";
import { useCircuitStore } from "../store";
import { parseBreadboardHandle } from "./breadboard";

export function getDirectArduinoAnalogPin(
  componentNodeId: string,
  componentHandles: string[],
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): number | null {
  const boardNode = nodes.find(
    (node) =>
      getNodeSimulationModel(node) === "arduino" ||
      getNodeSimulationModel(node) === "raspberrypipico",
  );
  if (!boardNode) return null;

  const isPico = getNodeSimulationModel(boardNode) === "raspberrypipico";
  const handles = new Set(componentHandles);

  for (const edge of edges) {
    const componentToBoard =
      edge.source === componentNodeId &&
      edge.sourceHandle &&
      handles.has(edge.sourceHandle) &&
      edge.target === boardNode.id;
    const boardToComponent =
      edge.target === componentNodeId &&
      edge.targetHandle &&
      handles.has(edge.targetHandle) &&
      edge.source === boardNode.id;
    const boardHandle = componentToBoard
      ? edge.targetHandle
      : boardToComponent
        ? edge.sourceHandle
        : null;
    const match = isPico
      ? String(boardHandle ?? "").match(/^gp(2[6-8])$/i)
      : String(boardHandle ?? "").match(/^a([0-5])$/i);
    if (match) {
      return isPico ? Number(match[1]) : 14 + Number(match[1]);
    }
  }

  return null;
}

export function getArduinoDigitalPinForComponent(
  componentNodeId: string,
  componentHandle: string,
  boardNodeId: string,
  edges: CircuitEdge[],
): number | null {
  for (const edge of edges) {
    const boardHandle =
      edge.source === componentNodeId &&
      edge.sourceHandle === componentHandle &&
      edge.target === boardNodeId
        ? edge.targetHandle
        : edge.target === componentNodeId &&
            edge.targetHandle === componentHandle &&
            edge.source === boardNodeId
          ? edge.sourceHandle
          : null;
    const match =
      typeof boardHandle === "string"
        ? boardHandle.match(/^(?:d|gp|gpio)(\d+)$/i)
        : null;
    if (match) return Number(match[1]);
  }

  return null;
}

export function getLedNodesConnectedToArduinoPin(
  arduinoNodeId: string,
  pin: number,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): string[] {
  const graph = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    addGraphConnection(
      graph,
      `${edge.source}:${edge.sourceHandle}`,
      `${edge.target}:${edge.targetHandle}`,
    );
  }

  for (const resistor of nodes) {
    if (getNodeSimulationModel(resistor) !== "resistor") continue;
    addGraphConnection(graph, `${resistor.id}:pin1`, `${resistor.id}:pin2`);
  }

  const isPico =
    nodes.find((n) => n.id === arduinoNodeId)?.data.componentType ===
    "raspberrypipico";
  const pinPrefix = isPico ? "gp" : "d";
  const reachable = getReachableGraphNodes(
    graph,
    `${arduinoNodeId}:${pinPrefix}${pin}`,
  );
  return nodes
    .filter((node) => getNodeSimulationModel(node) === "led")
    .filter(
      (node) =>
        reachable.has(`${node.id}:anode`) ||
        reachable.has(`${node.id}:cathode`),
    )
    .map((node) => node.id);
}

/**
 * Resolves fixed power references (GND, 5V, 3.3V, VCC) or returns undefined.
 */
export function getFixedPinVoltage(handle?: string | null): number | undefined {
  if (!handle) return undefined;
  const normalizedHandle = handle.toLowerCase();
  if (
    normalizedHandle === "gnd" ||
    normalizedHandle === "gnd1" ||
    normalizedHandle === "gnd2" ||
    normalizedHandle === "gnd3" ||
    normalizedHandle.startsWith("gnd") ||
    normalizedHandle.startsWith("pico_gnd")
  ) {
    return 0;
  }
  if (
    normalizedHandle === "5v" ||
    normalizedHandle === "5v1" ||
    normalizedHandle === "vcc" ||
    normalizedHandle === "pico_vbus"
  ) {
    return 5;
  }
  if (
    normalizedHandle === "3.3v" ||
    normalizedHandle === "3v3" ||
    normalizedHandle === "pico_3v3"
  ) {
    return 3.3;
  }
  return undefined;
}

/**
 * Resolves direct simulated pin voltage from component pins or board pins.
 * Preserves explicit 0V (voltage !== undefined).
 * 
 * SPST Relay Context:
 *   Resolves direct coil voltages (terminal5/8) or switch voltages (terminal6/7 for COM,
 *   terminal12 for NO, terminal1 for NC) straight from the component pin mappings without traversing wires.
 */
export function getDirectPinVoltage(
  frame: SimulationFrame,
  nodeId: string,
  handle?: string | null,
): number | undefined {
  if (!handle) return undefined;

  // Do not resolve direct voltages from passive components (resistors, LEDs, etc.) to avoid stale loop feedback
  const node = useCircuitStore.getState().nodes.find((n) => n.id === nodeId);
  const model = node ? getNodeSimulationModel(node) : "";
  const passiveModels = new Set([
    "resistor",
    "photoresistor",
    "led",
    "ledrgb",
    "diode",
    "polarizedCapacitor",
    "capacitor",
    "sevenSegment",
    "doublePair7Segment",
    "DoublePair_7segmentDisplay",
    "relaySpst",
    "relayDpdt",
  ]);
  if (passiveModels.has(model)) {
    return undefined;
  }

  // 1. Check fixed voltages first (GND, 5V, 3.3V, VCC, etc.)
  const fixed = getFixedPinVoltage(handle);
  if (fixed !== undefined) {
    return fixed;
  }

  const normalizedHandle = handle.toLowerCase();
  const component = frame.components[nodeId];

  // 2. Check direct matching in component.pins (e.g. component.pins["terminal12"])
  if (component?.pins?.[handle] && component.pins[handle].voltage !== undefined) {
    return component.pins[handle].voltage;
  }

  // 3. Fallback matching for case-insensitive/handleId mapping
  if (component?.pins) {
    const matched = Object.values(component.pins).find(
      (pin) => pin.handleId?.toLowerCase() === normalizedHandle,
    );
    if (matched && matched.voltage !== undefined) {
      return matched.voltage;
    }
  }

  // 4. Check micro-controller board pins mapping (e.g. matching GP15, D7, SCL, SDA, etc.)
  const boardPin = frame.boardPins.find((pin) => {
    if (!pin.handleId) return false;
    const lastColon = pin.handleId.lastIndexOf(":");
    const localHandleId =
      lastColon !== -1 ? pin.handleId.slice(lastColon + 1) : pin.handleId;
    return localHandleId.toLowerCase() === normalizedHandle;
  });

  if (boardPin && boardPin.voltage !== undefined) {
    return boardPin.voltage;
  }

  return undefined;
}

/**
 * Resolves electrical net voltage by traversing physical wires and internal conductive paths.
 * Reuses buildConductiveGraph and getReachableGraphNodes.
 * Detects conflicting sources on the same conductive net.
 * 
 * SPST Relay Context:
 *   When the relay armature connects COM (terminal6/7) to NO (terminal12) or NC (terminal1),
 *   these pins form an internal path within the conductive graph. This function traverses that path
 *   to determine the net voltage, ensuring that the supply voltage on COM propagates to the connected load.
 */
export function getElectricalNetVoltage(
  frame: SimulationFrame,
  nodeId: string,
  handle?: string | null,
): number | undefined {
  if (!handle) return undefined;

  const { nodes, edges } = useCircuitStore.getState();

  const activeRelayNodeIds = new Set<string>();
  for (const [id, compState] of Object.entries(frame.components)) {
    if (compState?.isPowered) {
      activeRelayNodeIds.add(id);
    }
  }

  // Construct conductive graph (excluding resistors to avoid load calculation decay here)
  const graph = buildConductiveGraph(nodes, edges, {
    includeResistors: false,
    activeRelayNodeIds,
  });
  const startKey = `${nodeId}:${handle}`;
  
  // Find all endpoints connected to this net
  const reachable = getReachableGraphNodes(graph, startKey);


  const resolvedSources: { key: string; voltage: number }[] = [];

  // Inspect each endpoint on the net for direct voltage sources
  for (const endpoint of reachable) {
    const colonIdx = endpoint.indexOf(":");
    if (colonIdx === -1) continue;
    const endNodeId = endpoint.slice(0, colonIdx);
    const endHandle = endpoint.slice(colonIdx + 1);

    const directV = getDirectPinVoltage(frame, endNodeId, endHandle);
    if (directV !== undefined) {
      resolvedSources.push({ key: endpoint, voltage: directV });
    }
  }

  if (resolvedSources.length === 0) {
    return undefined;
  }

  // Conflict detection: Warns if there is > 0.5V difference across distinct drivers on the same net (e.g. VCC to GND short)
  const voltages = resolvedSources.map((s) => s.voltage);
  const minV = Math.min(...voltages);
  const maxV = Math.max(...voltages);

  if (maxV - minV > 0.5) {
    console.warn(
      `[Electrical Net Conflict] Conflicting voltages on net '${startKey}':`,
      resolvedSources,
    );
    return undefined;
  }

  return resolvedSources[0].voltage;
}

/**
 * Hierarchical endpoint voltage resolution:
 * 1. Direct pin voltage (including fixed power references)
 * 2. Electrical net traversal across connected conductive graph (propagates SPST Relay contact outputs)
 * 3. Component fallback voltage
 */
export function getEndpointVoltage(
  frame: SimulationFrame,
  nodeId: string,
  handle?: string | null,
): number {
  if (handle) {
    const directV = getDirectPinVoltage(frame, nodeId, handle);
    if (directV !== undefined) {
      return directV;
    }

    const netV = getElectricalNetVoltage(frame, nodeId, handle);
    if (netV !== undefined) {
      return netV;
    }

    return 0;
  }

  return frame.components[nodeId]?.voltage ?? 0;
}

export function frameBoardPinsToMap(
  frame: SimulationFrame,
): Map<number, PinState> {
  const pins = new Map<number, PinState>();
  for (const pin of frame.boardPins) {
    const handleId = pin.handleId ?? String(pin.pin);
    const lastColon = handleId.lastIndexOf(":");
    const localHandleId =
      lastColon !== -1 ? handleId.slice(lastColon + 1) : handleId;
    if (
      !localHandleId.startsWith("d") &&
      !localHandleId.startsWith("a") &&
      !localHandleId.startsWith("gp") &&
      !localHandleId.startsWith("gpio")
    )
      continue;
    pins.set(pin.pin, {
      mode:
        pin.mode === "INPUT_PULLUP"
          ? "INPUT_PULLUP"
          : pin.mode === "INPUT"
            ? "INPUT"
            : pin.mode === "UNSET"
              ? "UNSET"
              : "OUTPUT",
      value: Math.round(pin.normalizedValue * 255),
    });
  }
  return pins;
}

export const frameBoardPinsToArduinoPins = frameBoardPinsToMap;

export function upsertPinState(
  pins: Map<number, PinState>,
  pin: number,
  high: boolean,
) {
  pins.set(pin, {
    mode: "OUTPUT",
    value: high ? 255 : 0,
  });
}

// Backward-compatible exports (for store.ts)
export const getDirectArduinoAnalogPinForComponent = getDirectArduinoAnalogPin;
export const getArduinoDigitalPinForComponentConnection =
  getArduinoDigitalPinForComponent;
export const getLedNodeIdsConnectedToArduinoPin =
  getLedNodesConnectedToArduinoPin;
