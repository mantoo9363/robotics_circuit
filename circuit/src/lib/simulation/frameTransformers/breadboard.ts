import type { SimulationFrame as SimulationFrameType } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../../circuit/graph";
import { parseBreadboardHandle } from "../../circuit/breadboard";
import { getBreadboardAutoConnections } from "../../circuit/breadboard";

export function applyBreadboardInputToFrame(frame: SimulationFrameType): SimulationFrameType {
  if (!frame.running) return frame;

  const { nodes, edges } = useCircuitStore.getState();

  // 1. UNIVERSAL FILTER: Dhundhein ki canvas par koi active small breadboard hai ya nahi
  const breadboardNodes = nodes.filter(
    (node) =>
      node.data.componentType === "breadboard" || node.type === "breadboard",
  );
  if (breadboardNodes.length === 0) return frame;

  const components = { ...frame.components };

  // 2. BACKEND ADJACENCY MATRIX SOLVER (Dynamic Graph Construction)
  // Ek aisa graph map jo un sabhi wires/pins ko aapas mein interconnect karega jo same rows/columns mein hain
  const nodeConnections = new Map<
    string,
    Set<{ id: string; handle: string }>
  >();

  const registerConnection = (
    pinA: { id: string; handle: string },
    pinB: { id: string; handle: string },
  ) => {
    const keyA = `${pinA.id}:${pinA.handle}`;
    const keyB = `${pinB.id}:${pinB.handle}`;
    if (!nodeConnections.has(keyA)) nodeConnections.set(keyA, new Set());
    if (!nodeConnections.has(keyB)) nodeConnections.set(keyB, new Set());
    nodeConnections.get(keyA)!.add(pinB);
    nodeConnections.get(keyB)!.add(pinA);
  };

  // Edges (Wires) ka network path lock karna
  for (const edge of edges) {
    if (edge.source && edge.sourceHandle && edge.target && edge.targetHandle) {
      registerConnection(
        { id: edge.source, handle: edge.sourceHandle },
        { id: edge.target, handle: edge.targetHandle },
      );
    }
  }

  // 3. BREADBOARD INTERNAL HOLES SHORTING MESH
  for (const board of breadboardNodes) {
    // Top Power Rails (+ & -) aur Bottom Power Rails (+ & -) 30 columns tak pure interconnected hain
    const topPositiveGroup: Array<{ id: string; handle: string }> = [];
    const topNegativeGroup: Array<{ id: string; handle: string }> = [];
    const bottomNegativeGroup: Array<{ id: string; handle: string }> = [];
    const bottomPositiveGroup: Array<{ id: string; handle: string }> = [];

    // Columns 1 to 30 Vertical Lines mapping sets (Top group a-e, Bottom group f-j)
    const verticalColumnsTop = Array.from(
      { length: 30 },
      () => new Array<{ id: string; handle: string }>(),
    );
    const verticalColumnsBottom = Array.from(
      { length: 30 },
      () => new Array<{ id: string; handle: string }>(),
    );

    // Scan lines tracing wires that are locked directly onto this breadboard handles
    for (const edge of edges) {
      const endpoints = [
        {
          isBoard: edge.source === board.id,
          handle: edge.sourceHandle,
          remoteId: edge.target,
          remoteHandle: edge.targetHandle,
        },
        {
          isBoard: edge.target === board.id,
          handle: edge.targetHandle,
          remoteId: edge.source,
          remoteHandle: edge.sourceHandle,
        },
      ];

      for (const ep of endpoints) {
        if (!ep.isBoard || !ep.handle) continue;
        const parsed = parseBreadboardHandle(ep.handle);
        if (!parsed) continue;

        const remotePin = { id: ep.remoteId, handle: ep.remoteHandle || "" };
        if (parsed.type === "rail") {
          if (parsed.rail === "top_positive") topPositiveGroup.push(remotePin);
          else if (parsed.rail === "top_negative")
            topNegativeGroup.push(remotePin);
          else if (parsed.rail === "bottom_negative")
            bottomNegativeGroup.push(remotePin);
          else if (parsed.rail === "bottom_positive")
            bottomPositiveGroup.push(remotePin);
        } else if (parsed.type === "column") {
          if (parsed.index < 0 || parsed.index >= 30) continue;
          const row = parsed.row;
          if (row && ["j", "i", "h", "g", "f"].includes(row)) {
            verticalColumnsTop[parsed.index].push(remotePin);
          } else {
            verticalColumnsBottom[parsed.index].push(remotePin);
          }
        }
      }
    }

    // Connect all components connected to the same horizontal power rail rows
    const connectGroup = (group: Array<{ id: string; handle: string }>) => {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          registerConnection(group[i], group[j]);
        }
      }
    };

    connectGroup(topPositiveGroup);
    connectGroup(topNegativeGroup);
    connectGroup(bottomNegativeGroup);
    connectGroup(bottomPositiveGroup);

    // Connect all terminal points inside the same vertical columns cluster
    verticalColumnsTop.forEach((colGroup) => connectGroup(colGroup));
    verticalColumnsBottom.forEach((colGroup) => connectGroup(colGroup));
  }

  // 4. FLOOD-FILL VOLTAGE DISTRIBUTION (Breadth-First Search)
  // Sabhi elements ke updated mesh nodes par dynamic voltage signals flow karna
  const visited = new Set<string>();
  const queue: Array<{ id: string; handle: string; voltage: number }> = [];

  // Seed elements push: Jin components ke pass active dynamic logic voltage generate ho rha hai
  for (const [nodeId, comp] of Object.entries(components)) {
    if (!comp || typeof comp.voltage !== "number" || comp.voltage <= 0)
      continue;

    const endpoints = new Set<string>();
    if (comp.pins && Object.keys(comp.pins).length > 0) {
      for (const pinState of Object.values(comp.pins)) {
        endpoints.add(pinState.handleId);
      }
    }

    for (const edge of edges) {
      if (edge.source === nodeId && edge.sourceHandle)
        endpoints.add(edge.sourceHandle);
      if (edge.target === nodeId && edge.targetHandle)
        endpoints.add(edge.targetHandle);
    }

    for (const handle of endpoints) {
      queue.push({
        id: nodeId,
        handle,
        voltage: comp.pins?.[handle]?.voltage ?? comp.voltage,
      });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.id}:${current.handle}`;
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    // Connected neighbor blocks parse karke voltage update karna
    const neighbors = nodeConnections.get(currentKey);
    if (neighbors) {
      for (const n of neighbors) {
        if (components[n.id]) {
          // Dynamic scaling updating voltages back to components database telemetry
          components[n.id].voltage = Math.max(
            components[n.id].voltage ?? 0,
            current.voltage,
          );

          // For LEDs: track per-pin voltages so we can do polarity check after BFS
          if (components[n.id].componentType === "led") {
            if (!components[n.id].pins) components[n.id].pins = {};
            if (!components[n.id].pins![n.handle]) {
              components[n.id].pins![n.handle] = {
                handleId: n.handle,
                voltage: 0,
                normalizedValue: 0,
                active: false,
              };
            }
            components[n.id].pins![n.handle]!.voltage = Math.max(
              components[n.id].pins![n.handle]!.voltage ?? 0,
              current.voltage,
            );
          }
        }

        const nextKey = `${n.id}:${n.handle}`;
        if (!visited.has(nextKey)) {
          queue.push({ id: n.id, handle: n.handle, voltage: current.voltage });
        }
      }
    }
  }

  // POST-BFS: recalculate LED state using settled per-pin voltages.
  // This ensures we compare anode vs cathode AFTER both pins have received
  // their final voltages – correctly blocking reverse-biased LEDs.
  for (const [, comp] of Object.entries(components)) {
    if (!comp || comp.componentType !== "led") continue;
    const anodeV = comp.pins?.["anode"]?.voltage ?? 0;
    const cathodeV = comp.pins?.["cathode"]?.voltage ?? 0;
    const forwardBiased = anodeV > cathodeV + 0.5;
    if (!forwardBiased) {
      comp.isPowered = false;
      comp.brightness = 0;
    }
  }

  return { ...frame, components };
}