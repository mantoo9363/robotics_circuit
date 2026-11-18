'use client';

import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { COMPONENT_CATALOG } from '@cs/lib/circuit-components';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

const def = COMPONENT_CATALOG.find((c) => c.type === 'sevenSegment')!;

const COLOR_MAP: Record<string, { active: string; inactive: string; glow: string }> = {
  red: { active: '#ff2d55', inactive: '#3a111a', glow: 'rgba(255, 45, 85, 0.65)' },
  green: { active: '#4cd964', inactive: '#123318', glow: 'rgba(76, 217, 100, 0.65)' },
  blue: { active: '#007aff', inactive: '#051b33', glow: 'rgba(0, 122, 255, 0.65)' },
  yellow: { active: '#ffcc00', inactive: '#332a00', glow: 'rgba(255, 204, 0, 0.65)' },
  white: { active: '#ffffff', inactive: '#2c2c2c', glow: 'rgba(255, 255, 255, 0.65)' },
};

// Exact polygon coordinates from public/parts/seven-segment.svg
const SEGMENTS_GEOMETRY = {
  a: '-6.094,-25 -8.085,-23.342 -5.405,-20.123 12.831,-20.123 16.888,-23.499 15.638,-25',
  b: '15.129,-2.87 18.438,-21.637 17.668,-22.562 12.957,-18.641 10.292,-3.525 12.594,-0.76',
  c: '10.852,21.385 14.102,2.958 12.437,0.958 8.997,3.821 6.307,19.075 9.303,22.674',
  d: '6.51,25 8.366,23.454 5.588,20.117 -11.838,20.117 -15.946,23.537 -14.728,25',
  e: '-12.424,0.812 -15.395,3.285 -18.363,20.117 -18.363,20.117 -18.438,20.543 -16.726,22.6 -13.353,19.791 -10.429,3.209',
  f: '-9.022,-22.562 -11.15,-20.791 -14.239,-3.274 -12.267,-0.905 -9.262,-3.407 -6.433,-19.452',
  g: '9.559,-2.499 -8.446,-2.499 -11.487,0.032 -9.534,2.378 8.825,2.378 11.657,0.021',
};

export function SevenSegment(props: NodeProps<CircuitNode>) {
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const telemetry = useCircuitStore((state) => state.simulationFrame?.components[props.id]?.telemetry);
  const isRunning = isSimulating && telemetry !== undefined;

  const colorKey = String(props.data.properties?.color?.value ?? 'red');
  const colors = COLOR_MAP[colorKey] ?? COLOR_MAP.red;

  let digitState: Record<string, boolean> = {};

  if (isRunning) {
    try {
      digitState = telemetry.digitState ? JSON.parse(String(telemetry.digitState)) : {};
    } catch (e) {
      // Graceful fallback
    }
  }

  return (
    <BaseCircuitNode
      {...props}
      width={def.defaultWidth}
      height={def.defaultHeight}
      pins={def.pins}
    >
      <div className="flex h-full w-full items-center justify-center bg-transparent">
        <svg
          width={def.defaultWidth}
          height={def.defaultHeight}
          viewBox="-60 -70 120 140"
          style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}
        >
          <defs>
            <filter id={`glow-${props.id}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Main display module background package matching public svg style */}
          <rect fill="#3C4042" x="-25" y="-37.5" width="50" height="75" rx="1.5" ry="1.5" />

          {/* Solder holes / pins layout matching SVG layout */}
          {[-20, -10, 0, 10, 20].map((cx) => (
            <g key={`pins-${cx}`}>
              <circle cx={cx} cy={-30} r={1.5} fill="#505355" />
              <circle cx={cx} cy={30} r={1.5} fill="#505355" />
            </g>
          ))}

          {/* Digit Segments */}
          <g>
            {Object.entries(SEGMENTS_GEOMETRY).map(([seg, points]) => {
              const isActive = !!digitState[seg];
              return (
                <polygon
                  key={seg}
                  points={points}
                  style={{
                    fill: isActive ? colors.active : colors.inactive,
                    filter: isActive ? `url(#glow-${props.id})` : 'none',
                    transition: 'fill 0.12s ease-out, filter 0.12s ease-out',
                  }}
                />
              );
            })}
            {/* DP circle matching SVG coords */}
            <circle
              cx={16.239}
              cy={22.815}
              r={2.718}
              style={{
                fill: digitState.dp ? colors.active : colors.inactive,
                filter: digitState.dp ? `url(#glow-${props.id})` : 'none',
                transition: 'fill 0.12s ease-out, filter 0.12s ease-out',
              }}
            />
          </g>
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
