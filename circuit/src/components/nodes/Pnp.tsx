import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

/** PNP BJT Transistor node component with TO-92 casing visual, pin handles, and live telemetry overlay. */
export function PnpNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'pnp') ?? {
    defaultWidth: 120,
    defaultHeight: 130,
    pins: [
      { id: 'collector', label: 'Collector', position: { x: 75, y: 65 } },
      { id: 'base', label: 'Base', position: { x: 60, y: 65 } },
      { id: 'emitter', label: 'Emitter', position: { x: 45, y: 65 } },
    ],
  };

  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const componentState = useCircuitStore(
    (state) => state.simulationFrame?.components?.[props.id]
  );

  const isConducting = componentState?.isPowered ?? false;
  const telemetry = componentState?.telemetry;
  const mode = (telemetry?.mode as string) || (isConducting ? 'ON' : 'OFF');
  const hasWarning = Boolean(telemetry?.missingBaseResistor || telemetry?.warning);

  const width = def.defaultWidth || 80;
  const height = def.defaultHeight || 90;

  const glowFilter = isSimulating && isConducting
    ? 'drop-shadow(0px 0px 5px rgba(34, 197, 94, 0.75))'
    : hasWarning && isSimulating
      ? 'drop-shadow(0px 0px 5px rgba(239, 68, 68, 0.75))'
      : undefined;

  const componentName = String(props.data.properties?.name?.value || 'PNP');

  return (
    <BaseCircuitNode {...props} width={width} height={height} pins={def.pins}>
      <div
        data-node-id={props.id}
        style={{
          position: 'relative',
          width: `${width}px`,
          height: `${height}px`,
          userSelect: 'none',
        }}
      >
        <svg
          width={width}
          height={height}
          viewBox="-40 -45 80 90"
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'block',
            filter: glowFilter,
          }}
        >
          <g className="cgfx__wireview">
            {/* Terminal leads */}
            {/* Collector Lead (Right) */}
            <path
              style={{ fill: 'none', stroke: '#8C8C8C', strokeWidth: 2, strokeLinecap: 'round' }}
              d="M9.99,0c0,0,0-1.99,0-2.86C9.99-5,6.5-5.01,6.5-7c0-0.97,0-6.21,0-6.21"
            />
            {/* Emitter Lead (Left) */}
            <path
              style={{ fill: 'none', stroke: '#8C8C8C', strokeWidth: 2, strokeLinecap: 'round' }}
              d="M-10.01,0c0,0,0-1.99,0-2.86c0-2.14,3.51-2.17,3.51-4.16c0-0.97,0-6.19,0-6.19"
            />
            {/* Base Lead (Center) */}
            <path
              style={{ fill: 'none', stroke: '#8C8C8C', strokeWidth: 2, strokeLinecap: 'round' }}
              d="M-0.01,0c0-11.43,0-16.68,0-20"
            />

            {/* TO-92 Casing Body */}
            <g>
              <path
                fill="#2b2b2b"
                stroke="#1c1c1c"
                strokeWidth="0.8"
                d="M10.89-8.86c0.53-0.67,0.83-1.4,0.83-2.17v-20.99c0-3.26-5.25-5.9-11.73-5.9s-11.73,2.64-11.73,5.9v20.99c0,0.77,0.3,1.5,0.83,2.17H10.89z"
              />
              <path
                fill="#4a4a4a"
                d="M9.44-29.12v18.75H-9.41v-18.75H9.44 M10.94-30.62h-21.85v21.75h21.85V-30.62L10.94-30.62z"
              />
              <path
                fill="#595959"
                d="M-9.57-29.87l-0.01-0.74c-0.41-0.46-0.64-0.94-0.64-1.41c0-2.07,4.37-4.4,10.23-4.4c5.85,0,10.23,2.32,10.23,4.4c0,0.47-0.23,0.94-0.64,1.41l0.01,0.66l1.34,0.04c0.5-0.66,0.79-1.37,0.79-2.11c0-3.26-5.25-5.9-11.73-5.9s-11.73,2.64-11.73,5.9c0,0.76,0.3,1.48,0.82,2.15H-9.57z"
              />
            </g>

            {/* Pin Identification Stamps: E (Left), B (Center), C (Right) */}
            <g style={{ fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.3 }} stroke="#888888">
              {/* E (Emitter) at x = -6.5 */}
              <g transform="translate(-7.7,-13.25) scale(0.4)">
                <g className="E" transform="translate(3,0)">
                  <path d="M1.52 3.05l-2.93 0l0-6.05l2.93 0m-.4 3.02l-2.45 0" />
                </g>
              </g>
              {/* B (Base) at x = 0 */}
              <g transform="translate(-1.1,-13.25) scale(0.4)">
                <g className="B" transform="translate(2.75,0)">
                  <path d="M.38 0c.68 0 1.06-.55 1.06-1.69 0-1.33-1.27-1.27-1.27-1.27h-1.66v5.93h1.87c0 0 1.34 0 1.34-1.35 0-1.47-1.34-1.62-1.34-1.62h-1.83z" />
                </g>
              </g>
              {/* C (Collector) at x = 6.5 */}
              <g transform="translate(5.3,-13.25) scale(0.4)">
                <g className="C" transform="translate(3,0)">
                  <path d="M1.52-2.76c.09-.13-2.1-.78-2.85.52-.52.9-.56 3.44-.28 4.19.69 1.83 3.14.85 3.14.85" />
                </g>
              </g>
            </g>

            {/* Transistor Type Stamp: "P" */}
            <g style={{ fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.3 }} stroke="#E3E3E3">
              <g transform="translate(-3.3,-22) scale(1.1)">
                <g className="P" transform="translate(3,0)">
                  <path d="M-1.66 3.03v-6.05h1.92c0 0 1.45-.1 1.45 1.47 0 1.31-.23 1.83-1.56 1.83h-1.8" />
                </g>
              </g>
            </g>

            {/* Component Name Badge */}
            <text
              x="0"
              y="-31"
              textAnchor="middle"
              fontSize="4.8"
              fill="#9ca3af"
              fontWeight="600"
              fontFamily="sans-serif"
            >
              {componentName}
            </text>

            {/* Live Simulation Telemetry Overlay */}
            {isSimulating && (
              <g>
                <rect
                  x="-12"
                  y="-5"
                  width="24"
                  height="4.5"
                  rx="1.2"
                  fill="#111827"
                  fillOpacity="0.85"
                  stroke={isConducting ? '#22c55e' : '#64748b'}
                  strokeWidth="0.4"
                />
                <text
                  x="0"
                  y="-1.8"
                  textAnchor="middle"
                  fontSize="3.2"
                  fill={isConducting ? '#22c55e' : '#94a3b8'}
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {isConducting ? (mode === 'saturation' ? 'SAT' : 'ACT') : 'OFF'}
                </text>
              </g>
            )}

            {/* Warning indicator if base resistor is missing */}
            {isSimulating && hasWarning && (
              <polygon
                transform="translate(0,-22) scale(0.6)"
                style={{ opacity: 0.85, fill: '#ef4444', stroke: '#fbbf24', strokeWidth: 0.5 }}
                points="2.415,-5.161 7.901,-7.299 5.471,-2.294 11.953,-0.565 5.126,1.63 8.332,8.197 2.59,5.053 -0.137,10.527 -2.24,4.375 -7.565,7.957 -6.133,2.443 -11.953,0.87 -5.945,-1.796 -8.854,-7.513 -3.289,-5.371 -1.401,-10.527"
              />
            )}
          </g>
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
