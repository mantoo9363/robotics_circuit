import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import type { CircuitNode } from '@cs/lib/types';

const getDef9v = () => getComponentDefinition('battery9v')!;
const getDef1_5v = () => getComponentDefinition('battery1_5v')!;
const getDefCoin = () => getComponentDefinition('coincell')!;

export function Battery9VNode(props: NodeProps<CircuitNode>) {
  const voltage = props.data.properties?.voltage?.value ?? 9;
  const displayVoltage = Number(voltage).toFixed(2);
  const def = getDef9v();
  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <svg
        width={def.defaultWidth}
        height={def.defaultHeight}
        viewBox="0 0 70 100"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Battery body */}
        <rect x="5" y="15" width="60" height="80" rx="4" fill="#2a2a2a" stroke="#444" strokeWidth="1.5" />
        {/* Top connector - left smaller = negative, right larger = positive */}
        <rect x="18" y="2" width="10" height="13" rx="2" fill="#555" stroke="#888" strokeWidth="1" />
        <rect x="38" y="-1" width="14" height="16" rx="2" fill="#666" stroke="#ef4444" strokeWidth="1.5" />
        {/* Label */}
        <text x="35" y="55" textAnchor="middle" fontSize="12" fill="#ccc" fontWeight="bold">{displayVoltage}V</text>
        {/* Polarity: left smaller = - (gray), right larger = + (red) */}
        <text x="23" y="12" textAnchor="middle" fontSize="12" fill="#aaaaaa" fontWeight="bold">-</text>
        <text x="45" y="12" textAnchor="middle" fontSize="12" fill="#ef4444" fontWeight="bold">+</text>
      </svg>
    </BaseCircuitNode>
  );
}

export function Battery1_5VNode(props: NodeProps<CircuitNode>) {
  const voltage = props.data.properties?.voltage?.value ?? 1.5;
  const displayVoltage = Number(voltage).toFixed(2);
  const def = getDef1_5v();
  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <svg width={60} height={90} viewBox="0 0 60 90">
        {/* Top terminal */}
        <line x1="30" y1="0" x2="30" y2="10" stroke="#666" strokeWidth="2" />
        <rect x="22" y="10" width="16" height="6" fill="#aaa" />
        {/* Battery body */}
        <rect x="10" y="16" width="40" height="58" rx="3" fill="#4488cc" stroke="#336699" strokeWidth="1.5" />
        {/* Label */}
        <text x="30" y="50" textAnchor="middle" fontSize="11" fill="white" fontWeight="bold">{displayVoltage}V</text>
        {/* Bottom terminal */}
        <rect x="20" y="74" width="20" height="6" fill="#aaa" />
        <line x1="30" y1="80" x2="30" y2="90" stroke="#666" strokeWidth="2" />
        {/* Polarity */}
        <text x="46" y="22" fontSize="9" fill="#fff" fontWeight="bold">+</text>
        <text x="46" y="72" fontSize="9" fill="#fff" fontWeight="bold">-</text>
      </svg>
    </BaseCircuitNode>
  );
}

export function CoinCellNode(props: NodeProps<CircuitNode>) {
  const voltage = props.data.properties?.voltage?.value ?? 3;
  const displayVoltage = Number(voltage).toFixed(2);
  const def = getDefCoin();
  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <svg width={60} height={60} viewBox="0 0 60 60">
        <line x1="30" y1="0" x2="30" y2="8" stroke="#666" strokeWidth="2" />
        <circle cx="30" cy="30" r="22" fill="#c0c0c0" stroke="#999" strokeWidth="1.5" />
        <circle cx="30" cy="30" r="16" fill="#d4d4d4" stroke="#bbb" strokeWidth="1" />
        <text x="30" y="28" textAnchor="middle" fontSize="8" fill="#555" fontWeight="bold">CR2032</text>
        <text x="30" y="38" textAnchor="middle" fontSize="9" fill="#555">{displayVoltage}V</text>
        <line x1="30" y1="52" x2="30" y2="60" stroke="#666" strokeWidth="2" />
      </svg>
    </BaseCircuitNode>
  );
}
