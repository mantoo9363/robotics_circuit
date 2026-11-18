"use client";
import { useCallback } from "react";
import { type ConnectionLineComponentProps } from "@xyflow/react";

type WirePoint = { x: number; y: number };

interface SparkConnectionLineProps extends ConnectionLineComponentProps {
  waypoints?: WirePoint[];
}

interface SparkWirePathProps {
  fromX: number;

  fromY: number;

  toX: number;

  toY: number;

  color: string;

  isInvalid?: boolean;

  waypoints?: WirePoint[];

  interactive?: boolean;

  onAddWaypoint?: (x: number, y: number) => void;
}

const CORNER_RADIUS = 8;

function buildConnectionPath(
  fromX: number,

  fromY: number,

  toX: number,

  toY: number,

  waypoints: WirePoint[] = [],
) {
  const points = [{ x: fromX, y: fromY }, ...waypoints, { x: toX, y: toY }];

  if (points.length < 2) return "";

  const pathPoints: { x: number; y: number }[] = [points[0]];

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

function buildRoundedPath(pathPoints: { x: number; y: number }[]): string {
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

export function SparkWirePath({
  fromX,

  fromY,

  toX,

  toY,

  color,

  isInvalid = false,

  waypoints = [],

  interactive = false,

  onAddWaypoint,
}: SparkWirePathProps) {
  const pathD = buildConnectionPath(fromX, fromY, toX, toY, waypoints);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (!onAddWaypoint) return;

      event.stopPropagation();

      event.preventDefault();

      onAddWaypoint(event.clientX, event.clientY);
    },

    [onAddWaypoint],
  );

  return (
    <g className="circuit-connection-line">
      {interactive && onAddWaypoint && (
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
          style={{ cursor: "pointer" }}
          onMouseDown={handleMouseDown}
        />
      )}

      <path
        d={pathD}
        fill="none"
        stroke={isInvalid ? "#ef4444" : color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={interactive ? { pointerEvents: "none" } : undefined}
      />

      <g transform={`translate(${toX} ${toY})`}>
        <circle r={2.2} fill="#ffcf5a" />

        {Array.from({ length: 8 }).map((_, index) => {
          const angle = (index / 8) * Math.PI * 2;

          const inner = 5;

          const outer = 9;

          return (
            <line
              key={index}
              x1={Math.cos(angle) * inner}
              y1={Math.sin(angle) * inner}
              x2={Math.cos(angle) * outer}
              y2={Math.sin(angle) * outer}
              stroke="#ffc44d"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          );
        })}
      </g>
    </g>
  );
}

export function SparkConnectionLine({
  fromX,

  fromY,

  toX,

  toY,

  connectionLineStyle,

  connectionStatus,

  waypoints = [],
}: SparkConnectionLineProps) {
  const color =
    typeof connectionLineStyle?.stroke === "string"
      ? connectionLineStyle.stroke
      : "#22c55e";

  return (
    <SparkWirePath
      fromX={fromX}
      fromY={fromY}
      toX={toX}
      toY={toY}
      color={color}
      isInvalid={connectionStatus === "invalid"}
      waypoints={waypoints}
    />
  );
}
