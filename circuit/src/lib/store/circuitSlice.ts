import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
} from "@xyflow/react";
import { v4 as uuidv4 } from "uuid";
import type { CircuitEdge, CircuitNode, CircuitNodeData, HistoryState } from "../types";

import { refreshSimulationFrameFromCurrentCircuit } from "../store-legacy";

export interface CircuitSlice {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: Connection) => void;

  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  setSelection: (nodeIds: string[], edgeIds: string[]) => void;

  wireColor: string;
  setWireColor: (color: string) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  history: HistoryState;

  addNode: (node: CircuitNode) => void;
  moveNode: (nodeId: string, position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, data: Partial<CircuitNodeData>) => void;
  deleteSelected: () => void;
  rotateSelected: () => void;
}

const MAX_HISTORY = 50;

export const createCircuitSlice = (set: any, get: any): CircuitSlice => ({
  nodes: [],
  edges: [],

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    if (get().isSimulating) {
      refreshSimulationFrameFromCurrentCircuit();
    }
  },
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    if (get().isSimulating) {
      refreshSimulationFrameFromCurrentCircuit();
    }
  },
  onConnect: (connection) => {
    const { wireColor } = get();
    get().pushHistory();
    const newEdge: CircuitEdge = {
      id: uuidv4(),
      source: connection.source,
      sourceHandle: connection.sourceHandle,
      target: connection.target,
      targetHandle: connection.targetHandle,
      type: "wire",
      data: { color: wireColor },
    };
    set({ edges: [...get().edges, newEdge] });
    if (get().isSimulating) {
      refreshSimulationFrameFromCurrentCircuit();
    }
  },

  selectedNodeIds: [],
  selectedEdgeIds: [],
  setSelection: (nodeIds, edgeIds) => {
    set({ selectedNodeIds: nodeIds, selectedEdgeIds: edgeIds });
  },

  wireColor: "#22c55e",
  setWireColor: (color) => {
    const { edges, selectedEdgeIds } = get();
    const selectedEdgeSet = new Set(selectedEdgeIds);
    const hasSelectedWire = edges.some((edge: CircuitEdge) => selectedEdgeSet.has(edge.id));

    if (!hasSelectedWire) {
      set({ wireColor: color });
      return;
    }

    const colorChanged = edges.some(
      (edge: CircuitEdge) => selectedEdgeSet.has(edge.id) && edge.data?.color !== color,
    );

    if (colorChanged) {
      get().pushHistory();
    }

    set({
      wireColor: color,
      edges: edges.map((edge: CircuitEdge) =>
        selectedEdgeSet.has(edge.id)
          ? { ...edge, data: { ...edge.data, color } }
          : edge,
      ),
    });
  },

  history: { past: [], future: [] },

  pushHistory: () => {
    const { nodes, edges, history } = get();
    const snapshot = {
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    };
    const past = [...history.past, snapshot].slice(-MAX_HISTORY);
    set({ history: { past, future: [] } });
  },

  undo: () => {
    const { history, nodes, edges } = get();
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, -1);
    set({
      nodes: previous.nodes,
      edges: previous.edges,
      history: {
        past: newPast,
        future: [
          { nodes: structuredClone(nodes), edges: structuredClone(edges) },
          ...history.future,
        ],
      },
    });
  },

  redo: () => {
    const { history, nodes, edges } = get();
    if (history.future.length === 0) return;
    const next = history.future[0];
    const newFuture = history.future.slice(1);
    set({
      nodes: next.nodes,
      edges: next.edges,
      history: {
        past: [
          ...history.past,
          { nodes: structuredClone(nodes), edges: structuredClone(edges) },
        ],
        future: newFuture,
      },
    });
  },

  addNode: (node) => {
    get().pushHistory();
    set({ nodes: [...get().nodes, node] });
  },

  moveNode: (nodeId, position) => {
    set({
      nodes: get().nodes.map((node: CircuitNode) =>
        node.id === nodeId ? { ...node, position } : node,
      ),
    });
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map((node: CircuitNode) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node,
      ),
    });
  },

  deleteSelected: () => {
    const { nodes, edges, selectedNodeIds, selectedEdgeIds } = get();
    if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return;
    get().pushHistory();
    set({
      nodes: nodes.filter((node: CircuitNode) => !selectedNodeIds.includes(node.id)),
      edges: edges.filter(
        (edge: CircuitEdge) =>
          !selectedEdgeIds.includes(edge.id) &&
          !selectedNodeIds.includes(edge.source) &&
          !selectedNodeIds.includes(edge.target),
      ),
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });
    if (get().isSimulating) {
      refreshSimulationFrameFromCurrentCircuit();
    }
  },

  rotateSelected: () => {
    const { nodes, selectedNodeIds } = get();
    if (selectedNodeIds.length === 0) return;
    get().pushHistory();
    set({
      nodes: nodes.map((node: CircuitNode) =>
        selectedNodeIds.includes(node.id)
          ? {
              ...node,
              data: {
                ...node.data,
                rotation: ((node.data.rotation || 0) + 90) % 360,
              },
            }
          : node,
      ),
    });
  },
});
