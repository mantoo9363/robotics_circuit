import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function DiodeNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'diode') ?? 
    { defaultWidth: 32, defaultHeight: 96, pins: [] };
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  
  // Real-time listener for simulator framework components frame dictionary
  const componentState = useCircuitStore(
    (state) => state.simulationFrame?.components?.[props.id]
  );

  const telemetry = componentState?.telemetry;
  const isForward = componentState?.isPowered ?? false;

  // Configuration metrics extracted matching your strict schema layout
  const width = def.defaultWidth || 32;
  const height = def.defaultHeight || 96;

  // Dynamic Neon filter glow layer configuration when component holds live forward current
  const glowFilter = isSimulating && isForward ? 'drop-shadow(0px 0px 5px #22c55e)' : undefined;

  return (
    <BaseCircuitNode
      {...props}
      width={width}
      height={height}
      pins={def.pins}
    >
      {/* Main Container Layout Wrapper matching vertical aspect block */}
      <div 
        data-node-id={props.id}
        style={{ 
          position: 'relative', 
          width: `${width}px`, 
          height: `${height}px`,
          userSelect: 'none'
        }}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'block'
          }}
        >
          {/* --- VERTICAL TERMINAL LEADS (HARDWARE LEGS) --- */}
          {/* Top Pin Lead (Anode) -> Linked perfectly to coordinate {x: 16, y: 8} */}
          <line x1="16" y1="8" x2="16" y2="25" stroke="#94a3b8" strokeWidth="2.5" />
          <circle cx="16" cy="8" r="2.5" fill="#3b82f6" />

          {/* Bottom Pin Lead (Cathode) -> Linked perfectly to coordinate {x: 16, y: 88} */}
          <line x1="16" y1="71" x2="16" y2="88" stroke="#94a3b8" strokeWidth="2.5" />
          <circle cx="16" cy="88" r="2.5" fill="#ef4444" />

          {/* --- CYLINDRICAL COMPONENT MAIN CHASSIS BODY --- */}
          <rect
            x="4"
            y="25"
            width="24"
            height="46"
            rx="3"
            fill="#1e293b"
            stroke="#0f172a"
            strokeWidth="1.5"
            style={{ filter: glowFilter }}
          />

          {/* --- POLARIZATION BAND STRIPE (Tinkercad Silver Ring on Cathode side - Bottom) --- */}
          <rect
            x="4"
            y="61"
            width="24"
            height="6"
            fill="#94a3b8"
          />

          {/* --- SILK-SCREEN GRAPHICS TEXT TYPOGRAPHY --- */}
          {/* Main Identifier Stamp */}
          <text
            x="16"
            y="44"
            textAnchor="middle"
            fontSize="6"
            fill="#ffffff"
            fontWeight="bold"
            fontFamily="sans-serif"
            transform="rotate(-90 16 42)" // Rotates text to fit cleanly inside vertical layout
          >
            DIODE
          </text>

          {/* Live Dynamic Telemetry State Tag Overlay (Displays ON or OFF) */}
          {isSimulating && (
            <text
              x="16"
              y="54"
              textAnchor="middle"
              fontSize="5.5"
              fill={isForward ? '#22c55e' : '#ef4444'}
              fontWeight="bold"
              fontFamily="monospace"
            >
              {isForward ? "ON" : "OFF"}
            </text>
          )}

          {/* Polarized Polarity Helper Stamps */}
          <text x="16" y="22" textAnchor="middle" fill="#3b82f6" fontSize="7" fontWeight="bold" fontFamily="sans-serif">+</text>
          <text x="16" y="78" textAnchor="middle" fill="#ef4444" fontSize="7" fontWeight="bold" fontFamily="sans-serif">-</text>
        </svg>
      </div>
    </BaseCircuitNode>
  );
}