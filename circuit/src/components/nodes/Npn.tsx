import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

/**
 * NPN Transistor node component matching the Tinkercad TO-92 vector specification.
 */
export function NpnNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'npn') ?? {
    defaultWidth: 60,
    defaultHeight: 70,
    pins: [
      { id: 'collector', label: 'Collector', position: { x: 13, y: 67 } },
      { id: 'base', label: 'Base', position: { x: 30, y: 67 } },
      { id: 'emitter', label: 'Emitter', position: { x: 47, y: 67 } },
    ],
  };

  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const componentState = useCircuitStore(
    (state) => state.simulationFrame?.components?.[props.id]
  );

  const telemetry = componentState?.telemetry;
  const isPowered = componentState?.isPowered ?? false;
  const isConductionOn = telemetry?.conduction === 'ON' || isPowered;
  const isBurnt = telemetry?.spark === true || telemetry?.burnt === true;
  const compName = String(props.data.properties?.name?.value ?? 'NPN');

  const width = def.defaultWidth || 60;
  const height = def.defaultHeight || 70;

  // Active glow effect when transistor is conducting current
  const glowFilter = isSimulating && isConductionOn
    ? 'drop-shadow(0px 0px 4px rgba(59, 130, 246, 0.7))'
    : undefined;

  return (
    <BaseCircuitNode
      {...props}
      width={width}
      height={height}
      pins={def.pins}
    >
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
          viewBox="-18 -40 36 42"
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'block',
            overflow: 'visible',
          }}
        >
          {/* Defs for gradients/filters if needed */}
          <defs>
            <filter id={`npn-glow-${props.id}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Wire leads (Collector, Base, Emitter) */}
          <g>
            {/* Collector wire (Left) */}
            <path
              d="M-10.01,0c0,0,0-1.99,0-2.86c0-2.14,3.51-2.17,3.51-4.16c0-0.97,0-6.19,0-6.19"
              fill="none"
              stroke="#8C8C8C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeMiterlimit="10"
            />
            {/* Base wire (Center) */}
            <path
              d="M-0.01,0c0-11.43,0-16.68,0-20"
              fill="none"
              stroke="#8C8C8C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeMiterlimit="10"
            />
            {/* Emitter wire (Right) */}
            <path
              d="M9.99,0c0,0,0-1.99,0-2.86C9.99-5,6.5-5.01,6.5-7c0-0.97,0-6.21,0-6.21"
              fill="none"
              stroke="#8C8C8C"
              strokeWidth="2"
              strokeLinecap="round"
              strokeMiterlimit="10"
            />
          </g>

          {/* Transistor Body (TO-92 Package) */}
          <g style={{ filter: glowFilter }}>
            {/* Main plastic casing body */}
            <path
              d="M10.89-8.86c0.53-0.67,0.83-1.4,0.83-2.17v-20.99c0-3.26-5.25-5.9-11.73-5.9s-11.73,2.64-11.73,5.9v20.99c0,0.77,0.3,1.5,0.83,2.17H10.89z"
              fill="#333333"
            />
            {/* Front flat face bezel / border */}
            <path
              d="M9.44-29.12v18.75H-9.41v-18.75H9.44 M10.94-30.62h-21.85v21.75h21.85V-30.62L10.94-30.62z"
              fill="#595959"
            />
            {/* Top curved bevel rim */}
            <path
              d="M-9.57-29.87l-0.01-0.74c-0.41-0.46-0.64-0.94-0.64-1.41c0-2.07,4.37-4.4,10.23-4.4c5.85,0,10.23,2.32,10.23,4.4c0,0.47-0.23,0.94-0.64,1.41l0.01,0.66l1.34,0.04c0.5-0.66,0.79-1.37,0.79-2.11c0-3.26-5.25-5.9-11.73-5.9s-11.73,2.64-11.73,5.9c0,0.76,0.3,1.48,0.82,2.15H-9.57z"
              fill="#595959"
            />
          </g>

          {/* Lead identification stamps (C, B, E) */}
          <g fill="#999999" fontSize="3.2" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
            <text x="-6.5" y="-12">C</text>
            <text x="0" y="-12">B</text>
            <text x="6.5" y="-12">E</text>
          </g>

          {/* Body silk-screen label (NPN) */}
          <text
            x="0"
            y="-22"
            textAnchor="middle"
            fontSize="4"
            fill="#E3E3E3"
            fontWeight="bold"
            fontFamily="monospace"
            letterSpacing="0.3"
          >
            {compName.length > 5 ? compName.slice(0, 5) : compName}
          </text>

          {/* Simulation status indicator */}
          {isSimulating && (
            <text
              x="0"
              y="-16.5"
              textAnchor="middle"
              fontSize="3.2"
              fill={isConductionOn ? '#22c55e' : '#71717a'}
              fontWeight="bold"
              fontFamily="monospace"
            >
              {isConductionOn ? 'ON' : 'OFF'}
            </text>
          )}

          {/* Overload / Burn Breakdown Graphic */}
          {isSimulating && isBurnt && (
            <polygon
              points="2.415,-5.161 7.901,-7.299 5.471,-2.294 11.953,-0.565 5.126,1.63 8.332,8.197 2.59,5.053 -0.137,10.527 -2.24,4.375 -7.565,7.957 -6.133,2.443 -11.953,0.87 -5.945,-1.796 -8.854,-7.513 -3.289,-5.371 -1.401,-10.527"
              transform="translate(0,-22) scale(1.2)"
              fill="#FF0000"
              stroke="#F7E60B"
              strokeWidth="0.8"
              opacity={0.85}
            />
          )}

          {/* Hardware terminal connection pin dots */}
          <circle cx="-10" cy="0" r="1.2" fill="#3b82f6" opacity={0.6} />
          <circle cx="0" cy="0" r="1.2" fill="#eab308" opacity={0.6} />
          <circle cx="10" cy="0" r="1.2" fill="#ef4444" opacity={0.6} />
        </svg>
      </div>
    </BaseCircuitNode>
  );
}

export const NPNTransistorNode = NpnNode;
