import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { COMPONENT_CATALOG } from '@cs/lib/circuit-components';
import { refreshSimulationFrameFromCurrentCircuit, useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

const defSlide = COMPONENT_CATALOG.find((c) => c.type === 'slideswitch')!;
const defPush = COMPONENT_CATALOG.find((c) => c.type === 'pushbutton')!;

export function SlideswitchNode(props: NodeProps<CircuitNode>) {
  const stateProp = props.data.properties?.state;
  const options = stateProp?.options ?? ['left', 'right'];
  const hasOnOff = options.includes('off') || options.includes('on');

  const state = (stateProp?.value ?? (hasOnOff ? 'off' : 'left')) as string;
  const isRight = state === 'right' || state === 'on';

  const toggleSwitch = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextState = isRight ? (hasOnOff ? 'off' : 'left') : (hasOnOff ? 'on' : 'right');

    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              selected: true,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  state: {
                    ...(node.data.properties.state ?? {
                      label: 'State',
                      type: 'select' as const,
                      options: options,
                    }),
                    value: nextState,
                  },
                },
              },
            }
          : { ...node, selected: false }
      ),
      edges: store.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: [props.id],
      selectedEdgeIds: [],
    }));
    refreshSimulationFrameFromCurrentCircuit();
  };

  // SVG dimensions — same as before so pins line up
  // viewBox: 0 0 68 50
  // pin1 (left)   x=24, y=46
  // common (mid)  x=34, y=46
  // pin2 (right)  x=44, y=46
  
  // Knob travels from x=22 (left) to x=46 (right)
  const knobX = isRight ? 46 : 22;
  const trackColor = '#222';
  const leftActive = !isRight;   // common → pin1
  const rightActive = isRight;   // common → pin2

  return (
    <BaseCircuitNode
      {...props}
      width={defSlide.defaultWidth}
      height={defSlide.defaultHeight}
      pins={defSlide.pins}
      onClick={toggleSwitch}
    >
      <svg width={defSlide.defaultWidth} height={defSlide.defaultHeight} viewBox="0 0 68 50">
        {/* Body */}
        <rect x="10" y="6" width="48" height="26" rx="5" fill="#2a2a2a" stroke="#555" strokeWidth="1.5" />

        {/* Track groove */}
        <rect x="16" y="14" width="36" height="10" rx="5" fill={trackColor} />

        {/* Active-side glow on track */}
        {leftActive && (
          <rect x="16" y="14" width="18" height="10" rx="5" fill="#3b82f6" opacity="0.5" />
        )}
        {rightActive && (
          <rect x="34" y="14" width="18" height="10" rx="5" fill="#22c55e" opacity="0.5" />
        )}

        {/* Slider knob */}
        <circle
          cx={knobX}
          cy="19"
          r="7"
          fill={isRight ? '#22c55e' : '#3b82f6'}
          stroke={isRight ? '#16a34a' : '#1d4ed8'}
          strokeWidth="1.2"
        />
        {/* Knob grip lines */}
        <line x1={knobX - 2} y1="16" x2={knobX - 2} y2="22" stroke="white" strokeWidth="1" opacity="0.5" />
        <line x1={knobX} y1="16" x2={knobX} y2="22" stroke="white" strokeWidth="1" opacity="0.5" />
        <line x1={knobX + 2} y1="16" x2={knobX + 2} y2="22" stroke="white" strokeWidth="1" opacity="0.5" />

        {/* Terminal lead wires */}
        <line x1="24" y1="32" x2="24" y2="46" stroke={leftActive ? '#3b82f6' : '#666'} strokeWidth="2" strokeLinecap="round" />
        <line x1="34" y1="32" x2="34" y2="46" stroke="#aaa" strokeWidth="2" strokeLinecap="round" />
        <line x1="44" y1="32" x2="44" y2="46" stroke={rightActive ? '#22c55e' : '#666'} strokeWidth="2" strokeLinecap="round" />

        {/* Terminal dots */}
        <circle cx="24" cy="46" r="2.5" fill={leftActive ? '#3b82f6' : '#666'} />
        <circle cx="34" cy="46" r="2.5" fill="#aaa" />
        <circle cx="44" cy="46" r="2.5" fill={rightActive ? '#22c55e' : '#666'} />

        {/* Labels
        <text x="24" y="5" textAnchor="middle" fontSize="5" fill={leftActive ? '#60a5fa' : '#555'}>1</text>
        <text x="34" y="5" textAnchor="middle" fontSize="5" fill="#888">C</text>
        <text x="44" y="5" textAnchor="middle" fontSize="5" fill={rightActive ? '#4ade80' : '#555'}>2</text> */}

        {/* Direction arrows hint
        <text x="16" y="12" textAnchor="middle" fontSize="6" fill={leftActive ? '#60a5fa' : '#444'}>◀</text>
        <text x="52" y="12" textAnchor="middle" fontSize="6" fill={rightActive ? '#4ade80' : '#444'}>▶</text> */}
      </svg>
    </BaseCircuitNode>
  );
}

export function PushbuttonNode(props: NodeProps<CircuitNode>) {
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const state = props.data.properties?.state?.value === 'on' ? 'on' : 'off';
  const pressed = state === 'on';
  const toggleButton = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isSimulating) return;
    event.preventDefault();
    event.stopPropagation();
    const nextState = pressed ? 'off' : 'on';

    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  state: {
                    ...(node.data.properties.state ?? {
                      label: 'State',
                      type: 'select' as const,
                      options: ['off', 'on'],
                    }),
                    value: nextState,
                  },
                },
              },
            }
          : node
      ),
    }));
    refreshSimulationFrameFromCurrentCircuit();
  };

  return (
    <BaseCircuitNode
      {...props}
      width={defPush.defaultWidth}
      height={defPush.defaultHeight}
      pins={defPush.pins}
      onClick={toggleButton}
    >
      <svg width={60} height={60} viewBox="0 0 60 60">
        {/* Button body */}
        <rect x="10" y="10" width="40" height="40" rx="4" fill="#555" stroke="#777" strokeWidth="1.5" />
        {/* Button cap */}
        <circle cx="30" cy={pressed ? 32 : 30} r={pressed ? 10 : 12} fill={pressed ? '#2f2f2f' : '#cc3333'} stroke={pressed ? '#111827' : '#aa2222'} strokeWidth="1.5" />
        <circle cx="30" cy={pressed ? 30 : 28} r={pressed ? 6 : 8} fill={pressed ? '#555' : '#dd4444'} opacity="0.6" />
        {/* Pin leads */}
        <line x1="0" y1="15" x2="10" y2="15" stroke="#666" strokeWidth="2" />
        <line x1="50" y1="15" x2="60" y2="15" stroke="#666" strokeWidth="2" />
        <line x1="0" y1="45" x2="10" y2="45" stroke="#666" strokeWidth="2" />
        <line x1="50" y1="45" x2="60" y2="45" stroke="#666" strokeWidth="2" />
        <text x="30" y="57" textAnchor="middle" fontSize="6" fill="#777">
          {pressed ? 'ON' : 'OFF'}
        </text>
      </svg>
    </BaseCircuitNode>
  );
}
