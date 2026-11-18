"use client";

import { useCallback, useMemo, useRef } from "react";
import { type EdgeProps, useReactFlow } from "@xyflow/react";
import { useCircuitStore } from "@cs/lib/store";
import {
  getComponentDefinition,
  useDynamicComponentsStore,
} from "@cs/store/useDynamicComponentsStore";
import { getWorldPinPosition } from "@cs/lib/breadboard-autoconnect";
import type { CircuitEdge, CircuitNode } from "@cs/lib/types";

type WirePoint = { x: number; y: number };
type WireDragState = {
  pointIndex: number;
  companionIndex: number | null;
  inserted: boolean;
  started: boolean;
  startScreen: WirePoint;
  segmentStart: WirePoint;
  segmentEnd: WirePoint;
};

const GRID_SIZE = 20;
const DRAG_START_DISTANCE = 5;

const CORNER_RADIUS = 6;

function buildPath(points: WirePoint[]): string {
  if (points.length < 2) return "";

  const pathPoints: WirePoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (
      Math.round(prev.x) !== Math.round(curr.x) &&
      Math.round(prev.y) !== Math.round(curr.y)
    ) {
      pathPoints.push({ x: prev.x, y: curr.y });
    }
    pathPoints.push(curr);
  }

  return buildRoundedPath(pathPoints);
}

function buildRoundedPath(pathPoints: WirePoint[]): string {
  const R = CORNER_RADIUS;
  const parts: string[] = [];
  parts.push(`M${pathPoints[0].x} ${pathPoints[0].y}`);

  for (let i = 1; i < pathPoints.length; i++) {
    const prev = pathPoints[i - 1];
    const curr = pathPoints[i];
    const next = pathPoints[i + 1];

    if (!next) {
      parts.push(`L${curr.x} ${curr.y}`);
      continue;
    }

    const prevSegIsH = Math.round(prev.y) === Math.round(curr.y);
    const currSegIsH = Math.round(curr.y) === Math.round(next.y);

    if (prevSegIsH !== currSegIsH) {
      if (prevSegIsH) {
        const dir = curr.x > prev.x ? 1 : -1;
        const postDir = next.y > curr.y ? 1 : -1;
        parts.push(`L${curr.x - dir * R} ${curr.y}`);
        parts.push(`Q${curr.x} ${curr.y} ${curr.x} ${curr.y + postDir * R}`);
      } else {
        const dir = curr.y > prev.y ? 1 : -1;
        const postDir = next.x > curr.x ? 1 : -1;
        parts.push(`L${curr.x} ${curr.y - dir * R}`);
        parts.push(`Q${curr.x} ${curr.y} ${curr.x + postDir * R} ${curr.y}`);
      }
    } else {
      parts.push(`L${curr.x} ${curr.y}`);
    }
  }

  return parts.join(" ");
}

function snap(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function pointsEqual(a: WirePoint, b: WirePoint) {
  return (
    Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y)
  );
}

function isCollinear(a: WirePoint, b: WirePoint, c: WirePoint) {
  const horizontal =
    Math.round(a.y) === Math.round(b.y) && Math.round(b.y) === Math.round(c.y);
  const vertical =
    Math.round(a.x) === Math.round(b.x) && Math.round(b.x) === Math.round(c.x);
  return horizontal || vertical;
}

function cleanupWaypoints(
  points: WirePoint[],
  sourcePoint: WirePoint,
  targetPoint: WirePoint,
) {
  const cleaned: WirePoint[] = [];

  for (const point of points) {
    const snapped = { x: snap(point.x), y: snap(point.y) };
    if (pointsEqual(snapped, sourcePoint) || pointsEqual(snapped, targetPoint))
      continue;
    if (cleaned.length > 0 && pointsEqual(cleaned[cleaned.length - 1], snapped))
      continue;
    cleaned.push(snapped);
  }

  let index = 0;
  while (index < cleaned.length) {
    const previous = index === 0 ? sourcePoint : cleaned[index - 1];
    const current = cleaned[index];
    const next =
      index === cleaned.length - 1 ? targetPoint : cleaned[index + 1];

    if (isCollinear(previous, current, next)) {
      cleaned.splice(index, 1);
      index = Math.max(0, index - 1);
    } else {
      index++;
    }
  }

  return cleaned;
}

function getInsertIndex(point: WirePoint, points: WirePoint[]) {
  let bestIndex = 1;
  let minDistance = Infinity;

  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index];
    const b = points[index + 1];
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.hypot(point.x - middle.x, point.y - middle.y);

    if (distance < minDistance) {
      minDistance = distance;
      bestIndex = index + 1;
    }
  }

  return bestIndex;
}

function buildUSegmentWaypoints(
  start: WirePoint,
  end: WirePoint,
  cursor: WirePoint,
): WirePoint[] {
  const horizontalRun = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);

  if (horizontalRun) {
    return [
      { x: snap(start.x), y: snap(cursor.y) },
      { x: snap(end.x), y: snap(cursor.y) },
    ];
  }

  return [
    { x: snap(cursor.x), y: snap(start.y) },
    { x: snap(cursor.x), y: snap(end.y) },
  ];
}

function toWaypoint(value: unknown): WirePoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (point): point is WirePoint =>
      typeof point?.x === "number" && typeof point?.y === "number",
  );
}

function getExactPinPoint(
  node: CircuitNode | undefined,
  handleId?: string | null,
  dynamicComponents = useDynamicComponentsStore.getState().components,
): WirePoint | null {
  if (!node || !handleId) return null;

  const componentType = node.data.componentType;
  if (typeof componentType !== "string") return null;

  const def = getComponentDefinition(componentType, dynamicComponents);
  if (!def) return null;

  const pin = def.pins.find((item) => item.id === handleId);
  return pin ? getWorldPinPosition(node, pin, dynamicComponents) : null;
}

export function WireEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceHandleId,
  targetHandleId,
  data,
  selected,
}: EdgeProps) {
  const { screenToFlowPosition } = useReactFlow();
  const sourceNode = useCircuitStore((state) =>
    state.nodes.find((node) => node.id === source),
  );
  const targetNode = useCircuitStore((state) =>
    state.nodes.find((node) => node.id === target),
  );
  const dynamicComponents = useDynamicComponentsStore(
    (state) => state.components,
  );
  const activePointIndex = useRef<number | null>(null);
  const currentWaypointsRef = useRef<WirePoint[]>([]);
  const dragStateRef = useRef<WireDragState | null>(null);
  const waypoints = useMemo(
    () => toWaypoint(data?.waypoints),
    [data?.waypoints],
  );
  const color = (data?.color as string | undefined) ?? "#22c55e";
  const sourcePoint = useMemo(() => {
    return (
      getExactPinPoint(sourceNode, sourceHandleId, dynamicComponents) ?? {
        x: sourceX,
        y: sourceY,
      }
    );
  }, [dynamicComponents, sourceHandleId, sourceNode, sourceX, sourceY]);
  const targetPoint = useMemo(() => {
    return (
      getExactPinPoint(targetNode, targetHandleId, dynamicComponents) ?? {
        x: targetX,
        y: targetY,
      }
    );
  }, [dynamicComponents, targetHandleId, targetNode, targetX, targetY]);

  const allPoints = useMemo(
    () => [sourcePoint, ...waypoints, targetPoint],
    [sourcePoint, targetPoint, waypoints],
  );

  const pathD = useMemo(() => buildPath(allPoints), [allPoints]);

  const selectWire = useCallback(() => {
    useCircuitStore.setState((state) => ({
      edges: state.edges.map((edge) => ({ ...edge, selected: edge.id === id })),
      nodes: state.nodes.map((node) => ({ ...node, selected: false })),
      selectedEdgeIds: [id],
      selectedNodeIds: [],
    }));
  }, [id]);

  const handleWireMouseDown = useCallback(
    (event: React.MouseEvent<SVGElement>) => {
      event.stopPropagation();
      event.preventDefault();
      selectWire();
    },
    [selectWire],
  );

  const updateWaypoints = useCallback(
    (nextWaypoints: WirePoint[]) => {
      const safeWaypoints = cleanupWaypoints(
        nextWaypoints,
        sourcePoint,
        targetPoint,
      );
      useCircuitStore.setState((state) => ({
        edges: state.edges.map((edge: CircuitEdge) =>
          edge.id === id
            ? {
                ...edge,
                selected: true,
                data: {
                  ...edge.data,
                  color: edge.data?.color ?? color,
                  waypoints: safeWaypoints,
                },
              }
            : edge,
        ),
      }));
    },
    [color, id, sourcePoint, targetPoint],
  );

  const startBendDrag = useCallback(
    (event: React.MouseEvent<SVGElement>, existingPointIndex?: number) => {
      event.stopPropagation();
      event.preventDefault();
      selectWire();
      if (!selected) return;

      const cursor = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const snappedCursor = { x: snap(cursor.x), y: snap(cursor.y) };
      const pointIndex =
        existingPointIndex ??
        Math.max(0, getInsertIndex(snappedCursor, allPoints) - 1);
      const insertIndex = pointIndex + 1;
      const segmentStart =
        existingPointIndex === undefined
          ? allPoints[insertIndex - 1]
          : sourcePoint;
      const segmentEnd =
        existingPointIndex === undefined ? allPoints[insertIndex] : targetPoint;

      currentWaypointsRef.current = [...waypoints];
      activePointIndex.current = pointIndex;
      dragStateRef.current = {
        pointIndex,
        companionIndex: null,
        inserted: existingPointIndex === undefined,
        started: false,
        startScreen: { x: event.clientX, y: event.clientY },
        segmentStart,
        segmentEnd,
      };

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dragState = dragStateRef.current;
        if (!dragState || activePointIndex.current === null) return;

        const moved = Math.hypot(
          moveEvent.clientX - dragState.startScreen.x,
          moveEvent.clientY - dragState.startScreen.y,
        );
        if (!dragState.started && moved < DRAG_START_DISTANCE) return;

        if (!dragState.started) {
          useCircuitStore.getState().pushHistory();
          dragState.started = true;

          if (dragState.inserted) {
            const withInsertedPoint = [...currentWaypointsRef.current];
            const uWaypoints = buildUSegmentWaypoints(
              dragState.segmentStart,
              dragState.segmentEnd,
              snappedCursor,
            );
            withInsertedPoint.splice(dragState.pointIndex, 0, ...uWaypoints);
            currentWaypointsRef.current = withInsertedPoint;
            dragState.companionIndex = dragState.pointIndex + 1;
          }
        }

        const flowPoint = screenToFlowPosition({
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        });
        const updatedPoint = { x: snap(flowPoint.x), y: snap(flowPoint.y) };
        const updatedWaypoints = [...currentWaypointsRef.current];
        if (dragState.inserted && dragState.companionIndex !== null) {
          const [firstPoint, secondPoint] = buildUSegmentWaypoints(
            dragState.segmentStart,
            dragState.segmentEnd,
            updatedPoint,
          );
          updatedWaypoints[dragState.pointIndex] = firstPoint;
          updatedWaypoints[dragState.companionIndex] = secondPoint;
        } else {
          updatedWaypoints[activePointIndex.current] = updatedPoint;
        }
        currentWaypointsRef.current = updatedWaypoints;
        updateWaypoints(updatedWaypoints);
      };

      const onMouseUp = () => {
        activePointIndex.current = null;
        dragStateRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [
      allPoints,
      screenToFlowPosition,
      selectWire,
      selected,
      sourcePoint,
      targetPoint,
      updateWaypoints,
      waypoints,
    ],
  );

  const removeWaypoint = useCallback(
    (event: React.MouseEvent<SVGCircleElement>, pointIndex: number) => {
      event.stopPropagation();
      event.preventDefault();
      if (!selected || waypoints.length === 0) return;

      useCircuitStore.getState().pushHistory();
      updateWaypoints(waypoints.filter((_, index) => index !== pointIndex));
    },
    [selected, updateWaypoints, waypoints],
  );

  return (
    <g>
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: selected ? "grab" : "pointer" }}
        onMouseDown={
          selected ? (event) => startBendDrag(event) : handleWireMouseDown
        }
      />

      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 3.5 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          filter: selected ? `drop-shadow(0 0 3px ${color})` : "none",
          pointerEvents: "none",
        }}
      />

      {selected &&
        waypoints.map((waypoint, index) => (
          <circle
            key={`${id}-waypoint-${index}`}
            cx={waypoint.x}
            cy={waypoint.y}
            r={5}
            fill="#ffffff"
            stroke={color}
            strokeWidth={2}
            style={{ cursor: "grab" }}
            onMouseDown={(event) => startBendDrag(event, index)}
            onDoubleClick={(event) => removeWaypoint(event, index)}
          />
        ))}
    </g>
  );
}
