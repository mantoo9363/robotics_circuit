import { type NodeProps } from '@xyflow/react';
import { useState } from 'react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { refreshSimulationFrameFromCurrentCircuit, useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function PotentiometerNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'potentiometer')!;
  const [isDragging, setIsDragging] = useState(false);
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const resistance = props.data.properties?.resistance?.value ?? 10000;
  const position = Math.max(0, Math.min(100, Number(props.data.properties?.position?.value ?? 50)));
  const selectedUnit = String(props.data.properties?.resistance?.unit ?? '\u03A9');
  const unit = `${resistance}${selectedUnit}`;
  
  // Angle: 0% points down-left (135°), 50% points straight up (270°), 100% points down-right (405° / 45°)
  const angle = 135 + (position / 100) * 270;
  const outputVoltage = useCircuitStore((state) =>
    Number(state.simulationFrame?.components[props.id]?.telemetry?.wiperVoltage ?? 0)
  );

  const updatePosition = (nextPosition: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(nextPosition)));
    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  position: {
                    ...(node.data.properties.position ?? {
                      label: 'Position',
                      type: 'number' as const,
                      unit: '%',
                      min: 0,
                      max: 100,
                    }),
                    value: clamped,
                  },
                },
              },
            }
          : node
      ),
    }));
    refreshSimulationFrameFromCurrentCircuit();
  };

  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;

    const angleRad = Math.atan2(dy, dx);
    const rotation = props.data.rotation ?? 0;
    // Adjust pointer angle relative to node's rotation
    let angleDeg = (angleRad * 180) / Math.PI - rotation;
    if (angleDeg < 0) angleDeg += 360;

    // Relative to dial's start position (135°)
    let relativeAngle = angleDeg - 135;
    if (relativeAngle < 0) relativeAngle += 360;

    let nextPosition = 50;
    if (relativeAngle <= 270) {
      nextPosition = (relativeAngle / 270) * 100;
    } else {
      nextPosition = relativeAngle > 315 ? 0 : 100;
    }
    updatePosition(nextPosition);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSimulating) return;

    // Select the node on down
    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? { ...node, selected: true }
          : { ...node, selected: false }
      ),
      edges: store.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: [props.id],
      selectedEdgeIds: [],
    }));

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    updateFromPointer(event);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !isSimulating) return;
    event.preventDefault();
    event.stopPropagation();
    updateFromPointer(event);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsDragging(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isSimulating) return;

    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 5 : 1;
      updatePosition(position + step);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 5 : 1;
      updatePosition(position - step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      updatePosition(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      updatePosition(100);
    }
  };

  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <div
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className={`outline-none rounded ${isSimulating ? 'cursor-pointer focus:ring-1 focus:ring-blue-500' : 'cursor-grab'}`}
        style={{ width: '100%', height: '100%' }}
      >
        <svg width={60} height={80} viewBox="0 0 60 80">
          {/* Body */}
          <circle cx="30" cy="35" r="22" fill="#334155" stroke="#64748b" strokeWidth="1.5" />
          <circle cx="30" cy="35" r="18" fill="#475569" stroke="#1f2937" strokeWidth="1" />
          {/* Dial mark */}
          <circle cx="30" cy="35" r="8" fill="#1f2937" stroke="#94a3b8" strokeWidth="1" />
          <line
            x1="30"
            y1="35"
            x2={30 + Math.cos((angle * Math.PI) / 180) * 15}
            y2={35 + Math.sin((angle * Math.PI) / 180) * 15}
            stroke="#f8fafc"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* Knob slot */}
          <line x1="26" y1="35" x2="34" y2="35" stroke="#94a3b8" strokeWidth="2" />
          {/* Terminal leads */}
          <line x1="22" y1="53" x2="22" y2="66" stroke="#666" strokeWidth="2" strokeLinecap="round" />
          <line x1="30" y1="53" x2="30" y2="66" stroke="#666" strokeWidth="2" strokeLinecap="round" />
          <line x1="38" y1="53" x2="38" y2="66" stroke="#666" strokeWidth="2" strokeLinecap="round" />
          <circle cx="22" cy="66" r="2" fill="#94a3b8" />
          <circle cx="30" cy="66" r="2" fill="#94a3b8" />
          <circle cx="38" cy="66" r="2" fill="#94a3b8" />
          {/* Value Badge */}
          <rect x="15" y="1" width="30" height="11" rx="2" fill="#0f172a" stroke="#3b82f6" strokeWidth="0.5" />
          <text x="30" y="5.5" textAnchor="middle" fontSize="5" fontWeight="600" fill="#ffffff">{position}%</text>
          <text x="30" y="10" textAnchor="middle" fontSize="4.5" fill="#60a5fa">
            {unit}
          </text>
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
