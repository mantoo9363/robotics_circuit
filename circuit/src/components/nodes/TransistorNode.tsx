import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import type { CircuitNode } from '@cs/lib/types';

export function NPNTransistorNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'npn')!;
  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <svg width={60} height={70} viewBox="0 0 60 70">
        {/* Collector lead */}
        <line x1="45" y1="0" x2="45" y2="18" stroke="#666" strokeWidth="2" />
        {/* Emitter lead */}
        <line x1="45" y1="52" x2="45" y2="70" stroke="#666" strokeWidth="2" />
        {/* Base lead */}
        <line x1="0" y1="35" x2="18" y2="35" stroke="#666" strokeWidth="2" />
        {/* Transistor body */}
        <circle cx="35" cy="35" r="18" fill="none" stroke="#888" strokeWidth="1.5" />
        {/* Base line */}
        <line x1="18" y1="22" x2="18" y2="48" stroke="#333" strokeWidth="3" />
        {/* Collector */}
        <line x1="18" y1="26" x2="45" y2="18" stroke="#333" strokeWidth="2" />
        {/* Emitter with arrow */}
        <line x1="18" y1="44" x2="45" y2="52" stroke="#333" strokeWidth="2" />
        {/* Arrow on emitter */}
        <polygon points="38,50 45,52 40,46" fill="#333" />
        {/* Labels */}
        <text x="50" y="14" fontSize="7" fill="#aaa">C</text>
        <text x="3" y="30" fontSize="7" fill="#aaa">B</text>
        <text x="50" y="66" fontSize="7" fill="#aaa">E</text>
      </svg>
    </BaseCircuitNode>
  );
}
