import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

const LEFT_LABELS = [
  ['3V3', 30], ['EN', 50], ['VP', 70], ['VN', 90], ['D34', 110],
  ['D35', 130], ['D32', 150], ['D33', 170], ['D25', 190], ['D26', 210],
  ['D27', 230], ['D14', 250], ['D12', 270], ['D13', 290], ['GND', 310],
] as const;

const RIGHT_LABELS = [
  ['VIN', 30], ['GND', 50], ['D23', 70], ['D22', 90], ['TX0', 110],
  ['RX0', 130], ['D21', 150], ['GND', 170], ['D19', 190], ['D18', 210],
  ['D5', 230], ['D17', 250], ['D16', 270], ['D4', 290], ['D2', 310],
  ['D0', 330],
] as const;

function labelColor(label: string) {
  if (label === 'GND') return '#9ca3af';
  if (label === 'VIN') return '#fca5a5';
  if (label === '3V3' || label === 'EN') return '#facc15';
  return '#d7fbe8';
}

/**
 * React Flow custom node representing the ESP32 DevKit V1 microcontroller board.
 */
export function ESP32Node(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'esp32')!;
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const arduinoPins = useCircuitStore((state) => state.arduinoPins);
  const componentState = useCircuitStore((state) => state.simulationFrame?.components[props.id]);
  const burnt = componentState?.telemetry?.burnt === true;
  const gpio2Active = isSimulating && !burnt && (arduinoPins.get(2)?.value ?? 0) > 0;

  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <svg
        width={def.defaultWidth}
        height={def.defaultHeight}
        viewBox={`0 0 ${def.defaultWidth} ${def.defaultHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="ESP32 DevKit V1"
        style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}
      >
        <defs>
          <linearGradient id={`esp32-board-${props.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="60%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <filter id={`esp32-shadow-${props.id}`} x="-20%" y="-10%" width="140%" height="120%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Main Board PCB */}
        <rect x="16" y="8" width="158" height="344" rx="7" fill={`url(#esp32-board-${props.id})`} stroke="#334155" strokeWidth="2" filter={`url(#esp32-shadow-${props.id})`} />

        {/* Header Pin Strip Bars */}
        <rect x="0.5" y="20" width="12" height="320" rx="2" fill="#2a3033" />
        <rect x="177.5" y="20" width="12" height="320" rx="2" fill="#2a3033" />

        {/* Left Side Labels & Pins */}
        {[...LEFT_LABELS].map(([label, y]) => (
          <g key={`left-${label}-${y}`}>
            <circle cx="6.5" cy={y} r="3.2" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />
            <circle cx="6.5" cy={y} r="1.55" fill="#263238" />
            <text x="26" y={y + 2.8} fontSize="7.2" fill={labelColor(label)} fontFamily="Arial, sans-serif" fontWeight="700">{label}</text>
          </g>
        ))}

        {/* Right Side Labels & Pins */}
        {[...RIGHT_LABELS].map(([label, y]) => (
          <g key={`right-${label}-${y}`}>
            <circle cx="183.5" cy={y} r="3.2" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />
            <circle cx="183.5" cy={y} r="1.55" fill="#263238" />
            <text x="164" y={y + 2.8} textAnchor="end" fontSize="7.2" fill={labelColor(label)} fontFamily="Arial, sans-serif" fontWeight="700">{label}</text>
          </g>
        ))}

        {/* USB Connector */}
        <rect x="64" y="0.5" width="62" height="20" rx="3" fill="#cbd5df" stroke="#7b8794" strokeWidth="1" />
        <rect x="71" y="4" width="48" height="10" rx="1.5" fill="#5f6872" />
        <rect x="76" y="6.3" width="38" height="4.6" rx="1" fill="#404852" />

        {/* ESP-WROOM-32 Metal Shield */}
        <rect x="45" y="60" width="100" height="120" rx="4" fill="#94a3b8" stroke="#64748b" strokeWidth="1.2" />
        <rect x="49" y="64" width="92" height="112" rx="2" fill="#cbd5e1" opacity={0.6} />
        <text x="95" y="115" textAnchor="middle" fontSize="11" fill="#1e293b" fontFamily="Arial, sans-serif" fontWeight="800">ESP-WROOM-32</text>
        <text x="95" y="132" textAnchor="middle" fontSize="7" fill="#334155" fontFamily="Arial, sans-serif">ESP32-DWD0WDQ6</text>

        {/* Buttons (EN and BOOT) */}
        <rect x="35" y="320" width="24" height="15" rx="2.5" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" />
        <text x="47" y="330" textAnchor="middle" fontSize="5.5" fill="#334155" fontFamily="Arial, sans-serif" fontWeight="700">EN</text>

        <rect x="131" y="320" width="24" height="15" rx="2.5" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.8" />
        <text x="143" y="330" textAnchor="middle" fontSize="5.5" fill="#334155" fontFamily="Arial, sans-serif" fontWeight="700">BOOT</text>

        <text x="95" y="270" textAnchor="middle" fontSize="13" fill="#ffffff" fontWeight="800" fontFamily="Arial, sans-serif">ESP32</text>
        <text x="95" y="285" textAnchor="middle" fontSize="9" fill="#38bdf8" fontFamily="Arial, sans-serif" fontWeight="700">DevKit V1</text>

        {/* Onboard Blue User LED (GPIO 2) */}
        <circle cx="134" cy="220" r="4.5" fill="#1e3a8a" stroke="#1d4ed8" strokeWidth="1" />
        {gpio2Active && (
          <BoardLed x={134} y={220} color="#3b82f6" radius={4.5} />
        )}
      </svg>
    </BaseCircuitNode>
  );
}

function BoardLed({
  x,
  y,
  color,
  radius = 3.2,
}: {
  x: number;
  y: number;
  color: string;
  radius?: number;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={radius + 8} fill={color} opacity={0.14} />
      <circle cx={x} cy={y} r={radius + 4} fill={color} opacity={0.32} />
      <circle cx={x} cy={y} r={radius} fill={color} opacity={0.95} />
    </g>
  );
}
