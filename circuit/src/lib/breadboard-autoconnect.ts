import { COMPONENT_CATALOG } from './circuit-components';
import type { CircuitNode, CircuitEdge, ComponentDefinition, PinDefinition } from './types';

const SNAP_DISTANCE = 9;
const BREADBOARD_INSERT_X_TOLERANCE = 5.5;
const BREADBOARD_INSERT_Y_TOLERANCE = 24;

type WorldPin = {
  nodeId: string;
  handleId: string;
  x: number;
  y: number;
};

type PinPositionOverrides = Record<string, { x: number; y: number }>;

function getDefinition(node: CircuitNode, dynamicComponents?: ComponentDefinition[]) {
  return (
    dynamicComponents?.find((component) => component.type === node.data.componentType) ??
    COMPONENT_CATALOG.find((component) => component.type === node.data.componentType)
  );
}

function getNodeSize(node: CircuitNode, dynamicComponents?: ComponentDefinition[]) {
  const definition = getDefinition(node, dynamicComponents);
  const defaultWidth = definition?.defaultWidth ?? Number(node.width ?? 80);
  const defaultHeight = definition?.defaultHeight ?? Number(node.height ?? 80);
  return {
    width: Math.max(20, Number(node.data.width ?? defaultWidth)),
    height: Math.max(20, Number(node.data.height ?? defaultHeight)),
  };
}

export function getNodePins(node: CircuitNode, dynamicComponents?: ComponentDefinition[]) {
  return getDefinition(node, dynamicComponents)?.pins ?? [];
}

export function getWorldPinPosition(
  node: CircuitNode,
  pin: PinDefinition,
  dynamicComponents?: ComponentDefinition[]
) {
  const { width, height } = getNodeSize(node, dynamicComponents);
  const definition = getDefinition(node, dynamicComponents);
  const defaultWidth = definition?.defaultWidth ?? Number(node.width ?? 80);
  const defaultHeight = definition?.defaultHeight ?? Number(node.height ?? 80);
  const scaleX = width / defaultWidth;
  const scaleY = height / defaultHeight;
  const pinPositionOverrides =
    typeof node.data.pinPositions === 'object' &&
    node.data.pinPositions !== null &&
    !Array.isArray(node.data.pinPositions)
      ? (node.data.pinPositions as PinPositionOverrides)
      : {};
  const override = pinPositionOverrides[pin.id];
  const rotation = Number(node.data.rotation ?? 0);
  const rad = (rotation * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const pinX = Number(override?.x ?? pin.position.x * scaleX);
  const pinY = Number(override?.y ?? pin.position.y * scaleY);
  const rx = pinX - cx;
  const ry = pinY - cy;

  return {
    x: node.position.x + cx + (rx * Math.cos(rad) - ry * Math.sin(rad)),
    y: node.position.y + cy + (rx * Math.sin(rad) + ry * Math.cos(rad)),
  };
}

function getWorldPins(node: CircuitNode, dynamicComponents?: ComponentDefinition[]): WorldPin[] {
  return getNodePins(node, dynamicComponents).map((pin) => ({
    nodeId: node.id,
    handleId: pin.id,
    ...getWorldPinPosition(node, pin, dynamicComponents),
  }));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function breadboardInsertScore(pin: WorldPin, breadboardPin: WorldPin) {
  const dx = Math.abs(pin.x - breadboardPin.x);
  const dy = Math.abs(pin.y - breadboardPin.y);
  const radialDistance = Math.hypot(dx, dy);
  if (radialDistance <= SNAP_DISTANCE) return radialDistance;
  if (dx <= BREADBOARD_INSERT_X_TOLERANCE && dy <= BREADBOARD_INSERT_Y_TOLERANCE) {
    return dy + dx * 2;
  }
  return Number.POSITIVE_INFINITY;
}

export function getBreadboardAutoConnections(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  dynamicComponents?: ComponentDefinition[]
) {
  const breadboardPins = nodes
    .filter((node) => node.data.componentType === 'breadboard')
    .flatMap((node) => getWorldPins(node, dynamicComponents));
  if (breadboardPins.length === 0) return [];

  // Create a set of endpoints that already have wire connections
  const connectedEndpoints = new Set<string>();
  for (const edge of edges) {
    if (edge.sourceHandle) connectedEndpoints.add(`${edge.source}:${edge.sourceHandle}`);
    if (edge.targetHandle) connectedEndpoints.add(`${edge.target}:${edge.targetHandle}`);
  }

  const connections: Array<{
    nodeId: string;
    handleId: string;
    breadboardNodeId: string;
    breadboardHandleId: string;
  }> = [];

  for (const node of nodes) {
    if (node.data.componentType === 'breadboard') continue;
    for (const pin of getWorldPins(node, dynamicComponents)) {
      // Skip auto-connection if this pin already has a wire connection
      const endpointKey = `${node.id}:${pin.handleId}`;
      if (connectedEndpoints.has(endpointKey)) continue;

      let nearest: WorldPin | null = null;
      let nearestScore = Number.POSITIVE_INFINITY;

      for (const breadboardPin of breadboardPins) {
        const currentScore = breadboardInsertScore(pin, breadboardPin);
        if (currentScore < nearestScore) {
          nearest = breadboardPin;
          nearestScore = currentScore;
        }
      }

      if (nearest && Number.isFinite(nearestScore)) {
        connections.push({
          nodeId: node.id,
          handleId: pin.handleId,
          breadboardNodeId: nearest.nodeId,
          breadboardHandleId: nearest.handleId,
        });
      }
    }
  }

  return connections;
}

export function getSnappedNodePosition(
  node: CircuitNode,
  nodes: CircuitNode[],
  dynamicComponents?: ComponentDefinition[]
) {
  if (node.data.componentType === 'breadboard') return node.position;

  const breadboardPins = nodes
    .filter((candidate) => candidate.id !== node.id && candidate.data.componentType === 'breadboard')
    .flatMap((candidate) => getWorldPins(candidate, dynamicComponents));
  if (breadboardPins.length === 0) return node.position;

  let best:
    | {
        distance: number;
        dx: number;
        dy: number;
      }
    | null = null;

  for (const pin of getWorldPins(node, dynamicComponents)) {
    for (const breadboardPin of breadboardPins) {
      const currentDistance = distance(pin, breadboardPin);
      if (!best || currentDistance < best.distance) {
        best = {
          distance: currentDistance,
          dx: breadboardPin.x - pin.x,
          dy: breadboardPin.y - pin.y,
        };
      }
    }
  }

  if (!best || best.distance > SNAP_DISTANCE * 2.4) return node.position;
  return {
    x: Math.round((node.position.x + best.dx) / 10) * 10,
    y: Math.round((node.position.y + best.dy) / 10) * 10,
  };
}
