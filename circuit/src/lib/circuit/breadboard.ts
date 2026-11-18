import type { CircuitNode, CircuitEdge } from "../types";
import type { DynamicComponentDefinition } from "../../store/useDynamicComponentsStore";
import { getNodeSimulationModelForStore } from "./components";

export interface BreadboardConnection {
  nodeId: string;
  handleId: string;
  breadboardNodeId: string;
  breadboardHandleId: string;
}

export function parseBreadboardHandle(handle: string) {
  const normalized = handle.toLowerCase().trim().replace(/_/g, "-");

  const railMatch = normalized.match(
    /^(tp|tn|bp|bn|top-positive|top-negative|bottom-positive|bottom-negative)-(\d+)$/,
  );
  if (railMatch) {
    const prefix = railMatch[1];
    const index = Number(railMatch[2]);
    const zeroBasedIndex = index >= 1 && index <= 30 ? index - 1 : index;
    if (prefix === "tp" || prefix === "top-positive")
      return {
        type: "rail",
        rail: "top_positive" as const,
        index: zeroBasedIndex,
      };
    if (prefix === "tn" || prefix === "top-negative")
      return {
        type: "rail",
        rail: "top_negative" as const,
        index: zeroBasedIndex,
      };
    if (prefix === "bn" || prefix === "bottom-negative")
      return {
        type: "rail",
        rail: "bottom_negative" as const,
        index: zeroBasedIndex,
      };
    if (prefix === "bp" || prefix === "bottom-positive")
      return {
        type: "rail",
        rail: "bottom_positive" as const,
        index: zeroBasedIndex,
      };
  }

  const verticalMatch = normalized.match(/^([a-j])(?:-?)(\d+)$/);
  if (verticalMatch) {
    const row = verticalMatch[1] as
      | "a"
      | "b"
      | "c"
      | "d"
      | "e"
      | "f"
      | "g"
      | "h"
      | "i"
      | "j";
    const rawColumn = Number(verticalMatch[2]);
    const colIndex =
      rawColumn >= 1 && rawColumn <= 30 ? rawColumn - 1 : rawColumn;
    return { type: "column", row, index: colIndex };
  }

  return null;
}

export function getBreadboardAutoConnections(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  dynamicComponents: DynamicComponentDefinition[],
): BreadboardConnection[] {
  const connections: BreadboardConnection[] = [];

  for (const edge of edges) {
    const endpoints = [
      {
        isBoard: false,
        nodeId: edge.source,
        handleId: edge.sourceHandle,
        otherNodeId: edge.target,
        otherHandleId: edge.targetHandle,
      },
      {
        isBoard: false,
        nodeId: edge.target,
        handleId: edge.targetHandle,
        otherNodeId: edge.source,
        otherHandleId: edge.sourceHandle,
      },
    ];

    for (const ep of endpoints) {
      if (!ep.handleId) continue;

      const breadboardNode = nodes.find(
        (n) =>
          n.id === ep.nodeId && getNodeSimulationModelForStore(n) === "breadboard",
      );
      if (!breadboardNode) continue;

      const parsed = parseBreadboardHandle(ep.handleId);
      if (!parsed) continue;

      connections.push({
        nodeId: ep.otherNodeId,
        handleId: ep.otherHandleId ?? "",
        breadboardNodeId: breadboardNode.id,
        breadboardHandleId: ep.handleId,
      });
    }
  }

  return connections;
}