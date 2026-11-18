import React, { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

/**
 * DPDT (Double Pole Double Throw) Relay Component.
 * Features an interactive 2D vector schematic illustration of a relay body with 8 pins,
 * showing coil and dual-pole switches that dynamically animate to the NO terminals when energized.
 */
export function DpdtRelay(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'relayDpdt') ?? 
    { defaultWidth: 140, defaultHeight: 100, pins: [] };

  const componentState = useCircuitStore((state) => state.simulationFrame?.components?.[props.id]);

  // Determine if the coil is energized (powered) in the simulation frame
  const isPowered = !!componentState?.isPowered;

  const width = def.defaultWidth || 140;
  const height = def.defaultHeight || 100;

  // Stylized color tokens
  const bodyColor = '#f59e0b';
  const strokeColor = '#b45309';
  const labelColor = '#451a03';
  const activeColor = '#10b981';
  const inactiveColor = '#475569';

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
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'block',
          }}
        >
          {/* Main Relay Body Case */}
          <rect
            x="25"
            y="20"
            width="90"
            height="60"
            rx="6"
            fill={bodyColor}
            stroke={strokeColor}
            strokeWidth="2.5"
          />

          {/* Key Orientation Notch on Left Edge */}
          <path
            d="M 25 45 A 5 5 0 0 1 25 55 Z"
            fill={strokeColor}
          />

          {/* Solder/Connection Pin Lead Rings */}
          <g fill="#cbd5e1" stroke="#64748b" strokeWidth="1">
            {/* Top row contact points */}
            <circle cx="35" cy="35" r="3.5" />
            <circle cx="55" cy="35" r="3.5" />
            <circle cx="75" cy="35" r="3.5" />
            <circle cx="105" cy="35" r="3.5" fill="#94a3b8" />

            {/* Bottom row contact points */}
            <circle cx="35" cy="65" r="3.5" />
            <circle cx="55" cy="65" r="3.5" />
            <circle cx="75" cy="65" r="3.5" />
            <circle cx="105" cy="65" r="3.5" fill="#94a3b8" />
          </g>

          {/* Terminal Silk-Screen Inscriptions */}
          <g fontSize="6" fill={labelColor} fontWeight="bold" fontFamily="monospace" textAnchor="middle">
            {/* Top terminals */}
            <text x="35" y="29">NO1</text>
            <text x="55" y="29">NC1</text>
            <text x="75" y="29">COM1</text>
            <text x="105" y="29">A1 (+)</text>

            {/* Bottom terminals */}
            <text x="35" y="76">NO2</text>
            <text x="55" y="76">NC2</text>
            <text x="75" y="76">COM2</text>
            <text x="105" y="76">A2 (-)</text>
          </g>

          {/* Component Reference Tag */}
          <text
            x="90"
            y="53"
            textAnchor="middle"
            fontSize="6.5"
            fill={labelColor}
            fontWeight="bold"
            fontFamily="sans-serif"
            opacity="0.85"
          >
            K2 / 5V
          </text>

          {/* --- INTERACTIVE SCHEMATIC LAYER --- */}
          
          {/* Electromagnetic Coil Symbol between A1 and A2 */}
          <line x1="105" y1="35" x2="105" y2="42" stroke={inactiveColor} strokeWidth="1.2" />
          <line x1="105" y1="65" x2="105" y2="58" stroke={inactiveColor} strokeWidth="1.2" />
          
          <rect
            x="100"
            y="42"
            width="10"
            height="16"
            fill={isPowered ? "rgba(34, 197, 94, 0.25)" : "rgba(71, 85, 105, 0.1)"}
            stroke={isPowered ? activeColor : inactiveColor}
            strokeWidth="1.5"
            style={{ transition: 'all 0.2s ease-in-out' }}
          />
          <line 
            x1="100" 
            y1="42" 
            x2="110" 
            y2="58" 
            stroke={isPowered ? activeColor : inactiveColor} 
            strokeWidth="1.2"
            style={{ transition: 'all 0.2s ease-in-out' }}
          />

          {/* Pole 1 Switch Circuit */}
          <line x1="75" y1="35" x2="75" y2="42" stroke={inactiveColor} strokeWidth="1.2" />
          <circle cx="75" cy="42" r="1.5" fill={inactiveColor} />

          <line x1="55" y1="35" x2="55" y2="42" stroke={inactiveColor} strokeWidth="1.2" />
          <circle cx="55" cy="42" r="1.2" fill={inactiveColor} />

          <line x1="35" y1="35" x2="35" y2="46" stroke={inactiveColor} strokeWidth="1.2" />
          <circle cx="35" cy="46" r="1.2" fill={inactiveColor} />

          {/* Switch Lever 1 (Moves from NC1 to NO1) */}
          <line
            x1="75"
            y1="42"
            x2={isPowered ? 36.5 : 56.5}
            y2={isPowered ? 45.5 : 42}
            stroke={isPowered ? activeColor : inactiveColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            style={{ transition: 'all 0.2s ease-in-out' }}
          />

          {/* Pole 2 Switch Circuit */}
          <line x1="75" y1="65" x2="75" y2="58" stroke={inactiveColor} strokeWidth="1.2" />
          <circle cx="75" cy="58" r="1.5" fill={inactiveColor} />

          <line x1="55" y1="65" x2="55" y2="58" stroke={inactiveColor} strokeWidth="1.2" />
          <circle cx="55" cy="58" r="1.2" fill={inactiveColor} />

          <line x1="35" y1="65" x2="35" y2="54" stroke={inactiveColor} strokeWidth="1.2" />
          <circle cx="35" cy="54" r="1.2" fill={inactiveColor} />

          {/* Switch Lever 2 (Moves from NC2 to NO2) */}
          <line
            x1="75"
            y1="58"
            x2={isPowered ? 36.5 : 56.5}
            y2={isPowered ? 54.5 : 58}
            stroke={isPowered ? activeColor : inactiveColor}
            strokeWidth="1.8"
            strokeLinecap="round"
            style={{ transition: 'all 0.2s ease-in-out' }}
          />

          {/* Mechanical Ganging/Linkage Dashed Coupling */}
          <line
            x1={isPowered ? 54 : 65}
            y1={isPowered ? 43.5 : 42}
            x2={isPowered ? 54 : 65}
            y2={isPowered ? 56.5 : 58}
            stroke="#94a3b8"
            strokeWidth="1.2"
            strokeDasharray="2,2"
            style={{ transition: 'all 0.2s ease-in-out' }}
          />
        </svg>
      </div>
    </BaseCircuitNode>
  );
}

export default memo(DpdtRelay);
