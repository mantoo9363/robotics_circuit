'use client';

import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { COMPONENT_CATALOG } from '@cs/lib/circuit-components';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';
import type { DoublePairDigitSegments } from '@cs/lib/simulation/frameTransformers/DoublePair_7segmentDisplay';

const def = COMPONENT_CATALOG.find((c) => c.type === 'doublePair7Segment') ?? {
  defaultWidth: 300,
  defaultHeight: 160,
  pins: [
    { id: 'dig1', label: 'DIG1', position: { x: 45, y: 15 } },
    { id: 'a', label: 'A', position: { x: 80, y: 15 } },
    { id: 'f', label: 'F', position: { x: 115, y: 15 } },
    { id: 'dig2', label: 'DIG2', position: { x: 150, y: 15 } },
    { id: 'dig3', label: 'DIG3', position: { x: 185, y: 15 } },
    { id: 'b', label: 'B', position: { x: 220, y: 15 } },
    { id: 'vcc', label: 'VCC', position: { x: 255, y: 15 } },
    { id: 'sda', label: 'SDA', position: { x: 280, y: 15 } },

    { id: 'e', label: 'E', position: { x: 45, y: 145 } },
    { id: 'd', label: 'D', position: { x: 80, y: 145 } },
    { id: 'dp', label: 'DP', position: { x: 115, y: 145 } },
    { id: 'c', label: 'C', position: { x: 150, y: 145 } },
    { id: 'g', label: 'G', position: { x: 185, y: 145 } },
    { id: 'dig4', label: 'DIG4', position: { x: 220, y: 145 } },
    { id: 'gnd', label: 'GND', position: { x: 255, y: 145 } },
    { id: 'scl', label: 'SCL', position: { x: 280, y: 145 } },
  ],
};

const COLOR_MAP: Record<string, { active: string; inactive: string; glow: string }> = {
  red: { active: '#ff2d55', inactive: '#2a1118', glow: 'rgba(255, 45, 85, 0.7)' },
  green: { active: '#4cd964', inactive: '#102816', glow: 'rgba(76, 217, 100, 0.7)' },
  blue: { active: '#007aff', inactive: '#0a1d33', glow: 'rgba(0, 122, 255, 0.7)' },
  yellow: { active: '#ffcc00', inactive: '#2d2508', glow: 'rgba(255, 204, 0, 0.7)' },
  white: { active: '#ffffff', inactive: '#222222', glow: 'rgba(255, 255, 255, 0.7)' },
};

// SVG Segment Polygon coordinates for each digit
const SEGMENTS_GEOMETRY = {
  a: '6,0 8.5,2.5 32,2.5 34.5,0 32,-2.5 8.5,-2.5',
  f: '2.5,4 5,6.5 5,30 2.5,32.5 0,30 0,6.5',
  b: '37,4 39.5,6.5 39.5,30 37,32.5 34.5,30 34.5,6.5',
  g: '6,34 8.5,36.5 32,36.5 34.5,34 32,31.5 8.5,31.5',
  e: '2.5,38 5,40.5 5,64 2.5,66.5 0,64 0,40.5',
  c: '37,38 39.5,40.5 39.5,64 37,66.5 34.5,64 34.5,40.5',
  d: '6,68 8.5,70.5 32,70.5 34.5,68 32,65.5 8.5,65.5',
};

export function DoublePair_7segmentDisplay(props: NodeProps<CircuitNode>) {
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const telemetry = useCircuitStore((state) => state.simulationFrame?.components[props.id]?.telemetry);
  const isRunning = isSimulating && telemetry !== undefined;

  const colorKey = String(props.data.properties?.color?.value ?? 'red');
  const colors = COLOR_MAP[colorKey] ?? COLOR_MAP.red;

  let digits: DoublePairDigitSegments[] = [
    { a: false, b: false, c: false, d: false, e: false, f: false, g: false, dp: false },
    { a: false, b: false, c: false, d: false, e: false, f: false, g: false, dp: false },
    { a: false, b: false, c: false, d: false, e: false, f: false, g: false, dp: false },
    { a: false, b: false, c: false, d: false, e: false, f: false, g: false, dp: false },
  ];

  if (isRunning) {
    if (telemetry?.digits && Array.isArray(telemetry.digits)) {
      digits = telemetry.digits;
    } else if (telemetry?.digitsState) {
      try {
        digits = JSON.parse(String(telemetry.digitsState));
      } catch (_) {}
    }
  }

  const digitOffsets = [
    { x: 46, y: 52 },
    { x: 103, y: 52 },
    { x: 183, y: 52 },
    { x: 240, y: 52 },
  ];

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
          viewBox="10 6 309 155"
          style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}
        >
          <defs>
            <filter id={`glow-${props.id}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* PCB Board Base */}
          <rect
            x="10"
            y="5"
            width="309"
            height="156"
            rx="8"
            fill="#1e1e1e"
            stroke="#333"
            strokeWidth="1.5"
          />

          {/* Mounting Holes */}
          <rect x="30" y="30" width="6" height="6" rx="3" fill="#111" stroke="#444" strokeWidth="1.5" />
          <rect x="294" y="30" width="6" height="6" rx="3" fill="#111" stroke="#444" strokeWidth="1.5" />
          <rect x="30" y="138" width="6" height="6" rx="3" fill="#111" stroke="#444" strokeWidth="1.5" />
          <rect x="294" y="138" width="6" height="6" rx="3" fill="#111" stroke="#444" strokeWidth="1.5" />

          {/* LED Display Screen Background Bezel */}
          <rect
            x="32"
            y="44"
            width="266"
            height="85"
            rx="2.5"
            fill="#2c2f33"
            stroke="#1c1d1f"
            strokeWidth="2"
          />

          {/* Render All 4 Digits */}
          {digits.map((digitState, dIdx) => {
            const offset = digitOffsets[dIdx] ?? { x: 46 + dIdx * 57, y: 52 };
            return (
              <g key={`digit-${dIdx}`} transform={`translate(${offset.x}, ${offset.y})`}>
                {Object.entries(SEGMENTS_GEOMETRY).map(([seg, points]) => {
                  const isActive = !!digitState?.[seg as keyof DoublePairDigitSegments];
                  return (
                    <polygon
                      key={seg}
                      points={points}
                      fill={isActive ? colors.active : colors.inactive}
                      filter={isActive ? `url(#glow-${props.id})` : undefined}
                    />
                  );
                })}
                {/* Decimal Point */}
                <circle
                  cx="41"
                  cy="68"
                  r="3"
                  fill={digitState?.dp ? colors.active : colors.inactive}
                  filter={digitState?.dp ? `url(#glow-${props.id})` : undefined}
                />
              </g>
            );
          })}

          {/* Center Colon */}
          <circle
            cx="167"
            cy="76"
            r="3.2"
            fill={telemetry?.colon ? colors.active : colors.inactive}
            filter={telemetry?.colon ? `url(#glow-${props.id})` : undefined}
          />
          <circle
            cx="167"
            cy="102"
            r="3.2"
            fill={telemetry?.colon ? colors.active : colors.inactive}
            filter={telemetry?.colon ? `url(#glow-${props.id})` : undefined}
          />

          {/* Bottom Silk Screen Text */}
          <text x="64" y="146" fill="#ffffff" fontSize="8.5" fontWeight="bold" letterSpacing="0.3">
            0.56&quot; 4-DIGIT 7-SEGMENT DISPLAY
          </text>
        </svg>
      </div>
    </BaseCircuitNode>
  );
}

export default DoublePair_7segmentDisplay;
