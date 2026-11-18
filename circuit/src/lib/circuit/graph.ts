import type { CircuitNode, CircuitEdge } from "../types";
import { getNodeSimulationModel, getSlideswitchActiveThrow } from "./components";
import { getBreadboardAutoConnections } from "./breadboard";
import { TILT_THRESHOLD } from "../simulation-state";

export function addGraphConnection(
  graph: Map<string, Set<string>>,
  a: string,
  b: string,
) {
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a)!.add(b);
  graph.get(b)!.add(a);
}

export function getReachableGraphNodes(
  graph: Map<string, Set<string>>,
  start: string,
) {
  const visited = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of graph.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  return visited;
}

export interface BuildGraphOptions {
  includeResistors?: boolean;
  includeDiodes?: boolean;
  includeCapacitors?: boolean;
  activeRelayNodeIds?: Set<string>;
}

export function buildConductiveGraph(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  options: BuildGraphOptions = { includeResistors: true },
  dynamicComponents: any[] = [],
) {
  const graph = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    addGraphConnection(
      graph,
      `${edge.source}:${edge.sourceHandle}`,
      `${edge.target}:${edge.targetHandle}`,
    );
  }

  for (const connection of getBreadboardAutoConnections(nodes, edges, dynamicComponents)) {
    addGraphConnection(
      graph,
      `${connection.nodeId}:${connection.handleId}`,
      `${connection.breadboardNodeId}:${connection.breadboardHandleId}`,
    );
  }

  for (const node of nodes) {
    const model = getNodeSimulationModel(node);

    if (model === "breadboard") {
      for (const railPrefix of [
        "top_positive",
        "top_negative",
        "bottom_negative",
        "bottom_positive",
      ]) {
        for (let index = 1; index < 30; index += 1) {
          addGraphConnection(
            graph,
            `${node.id}:${railPrefix}_${index}`,
            `${node.id}:${railPrefix}_${index + 1}`,
          );
        }
      }

      for (let column = 1; column <= 30; column += 1) {
        for (const rows of [
          ["j", "i", "h", "g", "f"],
          ["e", "d", "c", "b", "a"],
        ]) {
          for (let index = 0; index < rows.length - 1; index += 1) {
            addGraphConnection(
              graph,
              `${node.id}:${rows[index]}${column}`,
              `${node.id}:${rows[index + 1]}${column}`,
            );
          }
        }
      }
    }

    if (model === "arduino") {
      addGraphConnection(graph, `${node.id}:gnd1`, `${node.id}:gnd2`);
      addGraphConnection(graph, `${node.id}:gnd2`, `${node.id}:gnd3`);
    }

    if (model === "neopixel") {
      addGraphConnection(graph, `${node.id}:ground1`, `${node.id}:ground2`);
      addGraphConnection(graph, `${node.id}:vcc1`, `${node.id}:vcc2`);
    }

    if (model === "raspberrypipico") {
      const grounds = [
        "pico_gnd1",
        "pico_gnd2",
        "pico_gnd3",
        "pico_gnd4",
        "pico_gnd5",
        "pico_gnd6",
        "pico_gnd7",
        "pico_gnd8",
      ];
      for (let index = 0; index < grounds.length - 1; index += 1) {
        addGraphConnection(
          graph,
          `${node.id}:${grounds[index]}`,
          `${node.id}:${grounds[index + 1]}`,
        );
      }
    }

    if (model === "relayDpdt") {
      const isEnergized = options.activeRelayNodeIds?.has(node.id) ?? false;
      if (isEnergized) {
        // COM1 (terminal4) connects to NO1 (terminal8)
        addGraphConnection(graph, `${node.id}:terminal4`, `${node.id}:terminal8`);
        // COM2 (terminal13) connects to NO2 (terminal9)
        addGraphConnection(graph, `${node.id}:terminal13`, `${node.id}:terminal9`);
      } else {
        // COM1 (terminal4) connects to NC1 (terminal6)
        addGraphConnection(graph, `${node.id}:terminal4`, `${node.id}:terminal6`);
        // COM2 (terminal13) connects to NC2 (terminal11)
        addGraphConnection(graph, `${node.id}:terminal13`, `${node.id}:terminal11`);
      }
    }

    if (model === "slideswitch") {
      const activeThrow = getSlideswitchActiveThrow(node);
      addGraphConnection(
        graph,
        `${node.id}:common`,
        `${node.id}:${activeThrow}`,
      );
    }

    if (model === "pushbutton") {
      addGraphConnection(graph, `${node.id}:pin1a`, `${node.id}:pin1b`);
      addGraphConnection(graph, `${node.id}:pin2a`, `${node.id}:pin2b`);
      if (node.data.properties?.state?.value === "on") {
        addGraphConnection(graph, `${node.id}:pin1a`, `${node.id}:pin2a`);
        addGraphConnection(graph, `${node.id}:pin1b`, `${node.id}:pin2b`);
      }
    }

    if (model === "relaySpst") {
      addGraphConnection(graph, `${node.id}:terminal6`, `${node.id}:terminal7`);
      if (node.data.properties?.state?.value === "on") {
        addGraphConnection(graph, `${node.id}:terminal6`, `${node.id}:terminal12`);
        addGraphConnection(graph, `${node.id}:terminal7`, `${node.id}:terminal12`);
      } else {
        addGraphConnection(graph, `${node.id}:terminal6`, `${node.id}:terminal1`);
        addGraphConnection(graph, `${node.id}:terminal7`, `${node.id}:terminal1`);
      }
    }

    if (model === "esp32") {
      addGraphConnection(graph, `${node.id}:esp32_gnd1`, `${node.id}:esp32_gnd2`);
      addGraphConnection(graph, `${node.id}:esp32_gnd2`, `${node.id}:esp32_gnd3`);
    }

    if (model === "tiltSensor") {
      const angle = Number(node.data.properties?.angle?.value ?? 0);
      if (angle >= TILT_THRESHOLD) {
        addGraphConnection(graph, `${node.id}:pin1`, `${node.id}:pin2`);
      }
    }

    if (options.includeResistors && (model === "resistor" || model === "photoresistor" || model === "forceSensor" || model === "flexSensor" || model === "potentiometer" || model === "soilMoisture")) {
      addGraphConnection(graph, `${node.id}:pin1`, `${node.id}:pin2`);
    }

    if (options.includeDiodes && model === "diode") {
      addGraphConnection(graph, `${node.id}:anode`, `${node.id}:cathode`);
    }
    if (options.includeCapacitors && (model === "polarizedCapacitor" || model === "capacitor")) {
      addGraphConnection(graph, `${node.id}:anode`, `${node.id}:cathode`);
      addGraphConnection(graph, `${node.id}:pin1`, `${node.id}:pin2`);
    }
  }

  return graph;
}

export function buildConductiveGraphForStore(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  options: BuildGraphOptions = { includeResistors: true },
  dynamicComponents: any[] = [],
) {
  return buildConductiveGraph(nodes, edges, options, dynamicComponents);
}