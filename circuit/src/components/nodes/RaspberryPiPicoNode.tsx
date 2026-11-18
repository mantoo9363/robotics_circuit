import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

const LEFT_LABELS = [
  ['GP0', 24], ['GP1', 42], ['GND', 60], ['GP2', 78], ['GP3', 96],
  ['GP4', 114], ['GP5', 132], ['GND', 150], ['GP6', 168], ['GP7', 186],
  ['GP8', 204], ['GP9', 222], ['GND', 240], ['GP10', 258], ['GP11', 276],
  ['GP12', 294], ['GP13', 312], ['GND', 330], ['GP14', 348], ['GP15', 366],
] as const;

const RIGHT_LABELS = [
  ['VBUS', 24], ['VSYS', 42], ['GND', 60], ['3V3', 78], ['GP28', 114],
  ['GND', 132], ['GP27', 150], ['GP26', 168], ['GP22', 204], ['GND', 222],
  ['GP21', 240], ['GP20', 258], ['GP19', 276], ['GP18', 294], ['GND', 312],
  ['GP17', 330], ['GP16', 348],
] as const;

function labelColor(label: string) {
  if (label === 'GND') return '#9ca3af';
  if (label === 'VBUS' || label === 'VSYS') return '#fca5a5';
  if (label === '3V3') return '#facc15';
  return '#d7fbe8';
}

export function RaspberryPiPicoNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'raspberrypipico')!;
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const arduinoPins = useCircuitStore((state) => state.arduinoPins);
  const componentState = useCircuitStore((state) => state.simulationFrame?.components[props.id]);
  const burnt = componentState?.telemetry?.burnt === true;
  const gp25Active = isSimulating && !burnt && (arduinoPins.get(25)?.value ?? 0) > 0;

  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <svg
        width={def.defaultWidth}
        height={def.defaultHeight}
        viewBox={`0 0 ${def.defaultWidth} ${def.defaultHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Raspberry Pi Pico"
        style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}
      >
        <defs>
          <linearGradient id={`pico-board-${props.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#08a454" />
            <stop offset="60%" stopColor="#058d45" />
            <stop offset="100%" stopColor="#04783b" />
          </linearGradient>
          <filter id={`pico-shadow-${props.id}`} x="-20%" y="-10%" width="140%" height="120%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.22" />
          </filter>
        </defs>

        <rect x="16" y="8" width="158" height="374" rx="7" fill={`url(#pico-board-${props.id})`} stroke="#036b34" strokeWidth="2" filter={`url(#pico-shadow-${props.id})`} />

        <rect x="0.5" y="15" width="12" height="360" rx="2" fill="#2a3033" />
        <rect x="177.5" y="15" width="12" height="360" rx="2" fill="#2a3033" />

        {[...LEFT_LABELS].map(([label, y]) => (
          <g key={`left-${label}-${y}`}>
            <circle cx="6.5" cy={y} r="3.2" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />
            <circle cx="6.5" cy={y} r="1.55" fill="#263238" />
            <text x="26" y={y + 2.8} fontSize="7.2" fill={labelColor(label)} fontFamily="Arial, sans-serif" fontWeight="700">{label}</text>
          </g>
        ))}

        {[...RIGHT_LABELS].map(([label, y]) => (
          <g key={`right-${label}-${y}`}>
            <circle cx="183.5" cy={y} r="3.2" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />
            <circle cx="183.5" cy={y} r="1.55" fill="#263238" />
            <text x="164" y={y + 2.8} textAnchor="end" fontSize="7.2" fill={labelColor(label)} fontFamily="Arial, sans-serif" fontWeight="700">{label}</text>
          </g>
        ))}

        <rect x="64" y="0.5" width="62" height="20" rx="3" fill="#cbd5df" stroke="#7b8794" strokeWidth="1" />
        <rect x="71" y="4" width="48" height="10" rx="1.5" fill="#5f6872" />
        <rect x="76" y="6.3" width="38" height="4.6" rx="1" fill="#404852" />

        <rect x="55" y="137" width="80" height="80" rx="5" fill="#2e3336" stroke="#525a60" strokeWidth="1.2" />
        <circle cx="64" cy="146" r="3.3" fill="#60686f" />
        <text x="95" y="174" textAnchor="middle" fontSize="8.2" fill="#b8c0c8" fontFamily="Arial, sans-serif">RP2040</text>
        <text x="95" y="187" textAnchor="middle" fontSize="6.2" fill="#7f8994" fontFamily="Arial, sans-serif">ARM M0+</text>

        <rect x="68" y="230" width="54" height="31" rx="3" fill="#262b2e" stroke="#475059" strokeWidth="0.8" />
        <text x="95" y="250" textAnchor="middle" fontSize="5.8" fill="#8b949e" fontFamily="Arial, sans-serif">FLASH</text>

        <rect x="55" y="277" width="24" height="15" rx="2.5" fill="#eff6ff" stroke="#b7c3cf" strokeWidth="0.8" />
        <text x="67" y="287" textAnchor="middle" fontSize="5" fill="#334155" fontFamily="Arial, sans-serif" fontWeight="700">BOOT</text>

        <text x="95" y="322" textAnchor="middle" fontSize="13" fill="#ffffff" fontWeight="800" fontFamily="Arial, sans-serif">Raspberry Pi</text>
        <text x="95" y="340" textAnchor="middle" fontSize="11" fill="#d9fbe7" fontFamily="Arial, sans-serif" fontWeight="700">Pico</text>

        {/* Onboard User LED (GP25) */}
        <circle cx="134" cy="110" r="5" fill="#1d5f34" stroke="#0d3b20" strokeWidth="1" />
        {/* <text x="134" y="123" textAnchor="middle" fontSize="6" fill="#b8e8cb" fontFamily="Arial, sans-serif" fontWeight="700">LED</text> */}
        {gp25Active && (
          <BoardLed x={134} y={110} color="#1ee13d" radius={5} />
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