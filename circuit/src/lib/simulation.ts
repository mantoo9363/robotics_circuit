import type { CircuitNode, CircuitEdge } from './types';

// Power source component types
const POWER_SOURCES = ['battery9v', 'battery1_5v', 'coincell'];
// Components that have visual feedback when powered
const VISUAL_COMPONENTS = ['led', 'ledrgb', 'dcmotor', 'servo'];

interface SimulationResult {
  /** Set of node IDs that are in a complete circuit with a power source */
  poweredNodeIds: Set<string>;
  /** Voltage supplied by the power source in each node's loop (nodeId → voltage) */
  nodeVoltages: Map<string, number>;
}

/**
 * Build an adjacency graph from edges.
 * Each edge connects two endpoints: (source, sourceHandle) ↔ (target, targetHandle).
 * We treat each (nodeId, handleId) as a graph vertex and edges as undirected links.
 */
function buildGraph(edges: CircuitEdge[]) {
  // adjacency: nodeId → Set of connected nodeIds
  const adj = new Map<string, Set<string>>();

  for (const edge of edges) {
    const src = edge.source;
    const tgt = edge.target;

    if (!adj.has(src)) adj.set(src, new Set());
    if (!adj.has(tgt)) adj.set(tgt, new Set());
    adj.get(src)!.add(tgt);
    adj.get(tgt)!.add(src);
  }

  return adj;
}

/**
 * Check if there's a cycle (closed circuit) containing a given node.
 * Uses DFS to find if we can reach the start node again through at least 2 other nodes.
 */
function findNodesInCycles(adj: Map<string, Set<string>>, allNodeIds: string[]): Set<string> {
  const inCycle = new Set<string>();

  // For each node, try to find a cycle it belongs to
  for (const startNode of allNodeIds) {
    if (inCycle.has(startNode)) continue;
    if (!adj.has(startNode)) continue;

    // BFS/DFS to find cycles
    const visited = new Map<string, string | null>(); // node → parent
    const queue: Array<{ node: string; parent: string | null }> = [
      { node: startNode, parent: null },
    ];
    visited.set(startNode, null);
    let foundCycle = false;
    const cycleNodes = new Set<string>();

    while (queue.length > 0 && !foundCycle) {
      const { node, parent } = queue.shift()!;
      const neighbors = adj.get(node);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (neighbor === parent) continue; // Don't go back the way we came

        if (visited.has(neighbor)) {
          // Found a cycle! Trace back to collect all nodes in it
          foundCycle = true;
          // All visited nodes that are connected form part of the circuit
          for (const [n] of visited) {
            cycleNodes.add(n);
          }
          cycleNodes.add(neighbor);
          break;
        }

        visited.set(neighbor, node);
        queue.push({ node: neighbor, parent: node });
      }
    }

    if (foundCycle) {
      for (const n of cycleNodes) {
        inCycle.add(n);
      }
    }
  }

  return inCycle;
}

/**
 * Run a basic circuit simulation.
 * Detects complete circuits (closed loops) containing power sources
 * and marks connected components as "powered".
 */
export function runSimulation(nodes: CircuitNode[], edges: CircuitEdge[]): SimulationResult {
  const poweredNodeIds = new Set<string>();
  const nodeVoltages = new Map<string, number>();

  if (nodes.length === 0 || edges.length === 0) {
    return { poweredNodeIds, nodeVoltages };
  }

  const adj = buildGraph(edges);
  const allNodeIds = nodes.map((n) => n.id);
  const nodesInCycles = findNodesInCycles(adj, allNodeIds);

  // Find power sources that are in a cycle (complete circuit)
  const poweredSources: CircuitNode[] = [];
  for (const node of nodes) {
    if (POWER_SOURCES.includes(node.data.componentType) && nodesInCycles.has(node.id)) {
      poweredSources.push(node);
    }
  }

  // For each powered source, find all reachable nodes in the same cycle
  for (const source of poweredSources) {
    const voltage = Number(source.data.properties?.voltage?.value ?? 0);
    const visited = new Set<string>();
    const stack = [source.id];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);

      // Only include nodes that are part of a cycle (complete circuit)
      if (nodesInCycles.has(current)) {
        poweredNodeIds.add(current);
        nodeVoltages.set(current, voltage);
      }

      const neighbors = adj.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }
    }
  }

  return { poweredNodeIds, nodeVoltages };
}

/** Check if a component type shows visual feedback */
export function isVisualComponent(componentType: string): boolean {
  return VISUAL_COMPONENTS.includes(componentType);
}
