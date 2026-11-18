import React from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function PolarizedCapacitor(
  props: NodeProps<CircuitNode>
) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'polarizedCapacitor') ?? 
    { defaultWidth: 70, defaultHeight: 90, pins: [] };
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  
  // Read live metrics from the simulation frame dictionary.
  const componentState = useCircuitStore(
    (state) => state.simulationFrame?.components?.[props.id]
  );

  // --- LOGIC FIX: TELEMETRY AND VOLTAGE CROSS-LINKING SYSTEM ---
  const telemetry = componentState?.telemetry;
  const voltage = telemetry && 'voltage' in telemetry 
    ? Number(telemetry.voltage) 
    : Number(componentState?.voltage ?? 0);

  // REAL-TIME PERCENTAGE STREAM EXTRACTION: Gathers value dynamically from store telemetry frame
  const chargePercent = telemetry && 'chargePercent' in telemetry
    ? Number(telemetry.chargePercent)
    : telemetry && 'percentage' in telemetry
      ? Number(telemetry.percentage)
      : 0;
  const dischargePercent = telemetry && 'dischargePercent' in telemetry
    ? Number(telemetry.dischargePercent)
    : Math.max(0, 100 - chargePercent);
  const phase = telemetry && 'phase' in telemetry
    ? String(telemetry.phase)
    : telemetry && telemetry.charging === true
      ? 'charging'
      : telemetry && telemetry.discharging === true
        ? 'discharging'
        : 'idle';
  const displayChargePercent = Number.isFinite(chargePercent)
    ? Math.max(0, Math.min(100, chargePercent)).toFixed(1)
    : '0.0';
  const displayDischargePercent = Number.isFinite(dischargePercent)
    ? Math.max(0, Math.min(100, dischargePercent)).toFixed(1)
    : '0.0';
    
  const isCharged = voltage > 0.5;

  // --- CONFIGURATIONS AND UNITS EXTRACTION ---
  const width = def.defaultWidth || 70;
  const height = def.defaultHeight || 90;

  const capValue = props.data.properties?.capacitance?.value ?? '1';
  const capUnit = props.data.properties?.capacitance?.unit ?? props.data.properties?.unit?.value ?? props.data.properties?.capacitanceUnit?.value ?? 'µF';
  const voltRating = props.data.properties?.voltageRating?.value ?? '16';
  const voltUnit = props.data.properties?.voltageRating?.unit ?? 'V';

  // Dynamic filter glow layer matrix configuration when component holds live charge
  const glowFilter = isSimulating && isCharged ? 'drop-shadow(0px 0px 4px #3b82f6)' : undefined;

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
          ref={null}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'block'
          }}
        >
          {/* --- PHYSICAL HARDWARE WIRE PINS --- */}
          <line x1="25" y1="65" x2="25" y2="85" stroke="#94a3b8" strokeWidth="2.5" />
          <circle cx="25" cy="85" r="3" fill="#3b82f6" data-title="Anode (+)" />

          <line x1="45" y1="65" x2="45" y2="80" stroke="#94a3b8" strokeWidth="2.5" />
          <circle cx="45" cy="80" r="3" fill="#64748b" data-title="Cathode (-)" />

          {/* --- CYLINDRICAL CAPACITOR CHASSIS BODY --- */}
          <rect
            x="15"
            y="10"
            width="40"
            height="55"
            rx="6"
            fill="#27272a"
            stroke="#3f3f46"
            strokeWidth="1.5"
            style={{ filter: glowFilter }}
          />

          {/* Top metallic convex seal vent */}
          <ellipse cx="35" cy="12" rx="20" ry="3" fill="#52525b" />
          <path d="M 20 12 L 50 12" stroke="#3f3f46" strokeWidth="0.5" />

          {/* Minus '-' indicators inside negative orientation tracking grid */}
          <g fill="#52525b" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            <text x="49" y="27">-</text>
            <text x="49" y="42">-</text>
            <text x="49" y="57">-</text>
          </g>

          {/* --- SILK-SCREEN SPECS GRAPHICS TYPOGRAPHY --- */}
          <text
            x="29"
            y="26"
            textAnchor="middle"
            fontSize="6"
            fill="#ffffff"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {`${capValue}${capUnit}`}
          </text>
          <text
            x="29"
            y="34"
            textAnchor="middle"
            fontSize="5"
            fill="#a1a1aa"
            fontFamily="sans-serif"
          >
            {`${voltRating}${voltUnit}`}
          </text>

          {/* Real-time capacitor charge/discharge telemetry */}
          {isSimulating && (
            <text
              x="29"
              y="44"
              textAnchor="middle"
              fontSize="4.7"
              fill={phase === 'charging' ? '#38bdf8' : '#93c5fd'}
              fontWeight="bold"
              fontFamily="monospace"
            >
              {`C ${displayChargePercent}%`}
            </text>
          )}

          {isSimulating && (
            <text
              x="29"
              y="51"
              textAnchor="middle"
              fontSize="4.7"
              fill={phase === 'discharging' ? '#fbbf24' : '#a1a1aa'}
              fontWeight="bold"
              fontFamily="monospace"
            >
              {`D ${displayDischargePercent}%`}
            </text>
          )}

          {/* Smaller complementary voltage string shifted cleanly below the percentage element */}
          {isSimulating && (
            <text
              x="29"
              y="59"
              textAnchor="middle"
              fontSize="4.3"
              fill={isCharged ? '#3b82f6' : '#71717a'}
              fontWeight="medium"
              fontFamily="monospace"
            >
              {voltage.toFixed(1)}V
            </text>
          )}

          {/* Plus Sign identifier stamp printed on the positive hardware side */}
          <g fill="#ef4444" fontSize="7" fontWeight="bold" textAnchor="middle">
            <text x="20" y="27">+</text>
            <text x="20" y="42">+</text>
            <text x="20" y="56">+</text>
          </g>
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
