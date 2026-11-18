import React, { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function Ne555TimerIC(
  props: NodeProps<CircuitNode>
) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'ne555') ?? 
    { defaultWidth: 110, defaultHeight: 90, pins: [] };
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  
  // Track continuous frame signals telemetry securely from store.ts pipeline
  const chipTelemetry = useCircuitStore(
    (state) => state.simulationFrame?.components?.[props.id]?.telemetry
  );

  const outputVoltage = Number(chipTelemetry?.outputVoltage ?? 0);
  const isPowered = useCircuitStore(
    (state) => !!state.simulationFrame?.components?.[props.id]?.isPowered
  );

  // --- RENDERING CONFIGURATIONS ---
  const width = def.defaultWidth || 110;
  const height = def.defaultHeight || 90;

  // Dynamic filter glow asset assignment for SVG layer compatibility
  const glowFilter = isPowered && outputVoltage > 2.0 ? 'drop-shadow(0px 0px 2px #22c55e)' : undefined;

  return (
    <BaseCircuitNode
      {...props}
      width={width}
      height={height}
      pins={def.pins}
    >
      {/* Main Container Wrapper Layout Block */}
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
          {/* --- PHYSICAL CHIP SILICON MOLD BODY --- */}
          <rect
            x="15"
            y="20"
            width="80"
            height="50"
            rx="4"
            fill="#1e1e24"
            stroke="#2d2d34"
            strokeWidth="1"
          />

          {/* Half-Moon Mechanical Notch Identifier on Left Side */}
          <path
            data-testid="notch"
            d="M 15 40 A 5 5 0 0 1 15 50 Z"
            fill="#111116"
          />

          {/* Pin 1 Hardware Dot Orientation Marker Pointer */}
          <circle cx="23" cy="62" r="2.5" fill="#111116" />

          {/* --- LASER SILK-SCREEN PRINT INSCRIPTIONS --- */}
          <text
            x="55"
            y="43"
            textAnchor="middle"
            fontSize="9"
            fill="#94a3b8"
            fontWeight="bold"
            fontFamily="monospace"
            style={{ userSelect: 'none', letterSpacing: '1px' }}
          >
            NE555
          </text>
          <text
            x="55"
            y="52"
            textAnchor="middle"
            fontSize="5.5"
            fill="#475569"
            fontWeight="bold"
            fontFamily="sans-serif"
            style={{ userSelect: 'none' }}
          >
            {props.data.label || 'TIMER'}
          </text>

          {/* --- LIVE INDICATOR FLIP-FLOP RELAY LED GLOW --- */}
          {isSimulating && (
            <g transform="translate(55, 61)">
              <circle cx="0" cy="0" r="3" fill="#334155" />
              <circle 
                cx="0" 
                cy="0" 
                r="2" 
                fill={isPowered ? (outputVoltage > 2.0 ? '#22c55e' : '#f59e0b') : '#475569'} 
                style={{ filter: glowFilter }}
              />
            </g>
          )}

          {/* --- HARDWARE PIN GUIDE LEADS NET LIST --- */}
          {/* Top Rail Pack (Pins 8, 7, 6, 5 left to right layout) */}
          <line x1="25" y1="5" x2="25" y2="20" stroke="#94a3b8" strokeWidth="3" />
          <circle cx="25" cy="5" r="3" fill="#ef4444" data-title="VCC (8)" />
          
          <line x1="45" y1="5" x2="45" y2="20" stroke="#94a3b8" strokeWidth="3" />
          <circle cx="45" cy="5" r="3" fill="#eab308" data-title="DIS (7)" />
          
          <line x1="65" y1="5" x2="65" y2="20" stroke="#94a3b8" strokeWidth="3" />
          <circle cx="65" cy="5" r="3" fill="#a855f7" data-title="THR (6)" />
          
          <line x1="85" y1="5" x2="85" y2="20" stroke="#94a3b8" strokeWidth="3" />
          <circle cx="85" cy="5" r="3" fill="#64748b" data-title="CTL (5)" />

          {/* Bottom Rail Pack (Pins 1, 2, 3, 4 left to right layout) */}
          <line x1="25" y1="70" x2="25" y2="85" stroke="#94a3b8" strokeWidth="3" />
          <circle cx="25" cy="85" r="3" fill="#111827" data-title="GND (1)" />
          
          <line x1="45" y1="70" x2="45" y2="85" stroke="#94a3b8" strokeWidth="3" />
          <circle cx="45" cy="85" r="3" fill="#3b82f6" data-title="TRG (2)" />
          
          <line x1="65" y1="70" x2="65" y2="85" stroke="#94a3b8" strokeWidth="3" />
          <circle cx="65" cy="85" r="3" fill="#22c55e" data-title="OUT (3)" />
          
          <line x1="85" y1="70" x2="85" y2="85" stroke="#94a3b8" strokeWidth="3" />
          <circle cx="85" cy="85" r="3" fill="#dc2626" data-title="RST (4)" />

          {/* --- PIN STRUCTURAL LAYOUT CARD REFS INDEX LABELS --- */}
          <g fontSize="4" fill="#64748b" fontWeight="bold">
            <text x="25" y="26" textAnchor="middle">8</text>
            <text x="45" y="26" textAnchor="middle">7</text>
            <text x="65" y="26" textAnchor="middle">6</text>
            <text x="85" y="26" textAnchor="middle">5</text>
            <text x="25" y="67" textAnchor="middle">1</text>
            <text x="45" y="67" textAnchor="middle">2</text>
            <text x="65" y="67" textAnchor="middle">3</text>
            <text x="85" y="67" textAnchor="middle">4</text>
          </g>
        </svg>
      </div>
    </BaseCircuitNode>
  );
}