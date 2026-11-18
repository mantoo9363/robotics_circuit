import { useEffect, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import {
  refreshSimulationFrameFromCurrentCircuit,
  useCircuitStore,
} from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function TiltSensorNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'tiltSensor')!;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Default angle set to 0
  const angle = Number(props.data.properties?.angle?.value) || 0;
  const isSimulating = useCircuitStore((state) => state.isSimulating);

  // Track runtime state
  const telemetryAngle = useCircuitStore(
    (state) =>
      Number(
        state.simulationFrame?.components?.[props.id]?.telemetry?.angle ?? angle
      )
  );

  const safeAngle = isSimulating ? telemetryAngle : angle;

  const [showUI, setShowUI] = useState(false);
  const [dragging, setDragging] = useState(false);

  const toggleUI = () => {
    setShowUI((prev) => !prev);
  };

  const updateAngle = (newAngle: number) => {
    // Tinkercad slider typically handles a range (e.g., 0 to 90 degrees)
    const clamped = Math.max(0, Math.min(90, newAngle));

    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  angle: {
                    ...(node.data.properties?.angle ?? {
                      label: 'Angle',
                      type: 'number',
                      unit: '°',
                      min: 0,
                      max: 90,
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

  // Drag logic mapped strictly to the horizontal slider track
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging || !svgRef.current) return;

      const svg = svgRef.current;
      const point = svg.createSVGPoint();
      point.x = e.clientX;
      point.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const localPoint = point.matrixTransform(ctm.inverse());
      const localX = localPoint.x;

      // Track boundaries: starts at x=36, ends at x=104 (width of 68px)
      const clampedX = Math.max(36, Math.min(104, localX));

      // Map the 68px physical slider range to 0-90 degrees
      const calcAngle = ((clampedX - 36) / 68) * 90;
      
      updateAngle(Math.round(calcAngle));
    };

    const up = () => setDragging(false);

    if (dragging) {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, props.id]);

  return (
    <BaseCircuitNode
      {...props}
      width={def.defaultWidth}
      height={def.defaultHeight}
      pins={def.pins}
    >
      {isSimulating && <input type="hidden" value={safeAngle} />}

      <div
        data-node-id={props.id}
        style={{ position: 'relative', width: '140px', height: '80px' }}
      >
        <svg
          ref={svgRef}
          width="140"
          height="80"
          viewBox="0 0 140 80"
          style={{ position: 'relative', zIndex: 2, display: 'block' }}
        >
          {/* STATIC LEAD PINS */}
          <line x1="25" y1="40" x2="35" y2="40" stroke="#a1a1aa" strokeWidth="3" strokeLinecap="round" />
          <line x1="98" y1="40" x2="112" y2="40" stroke="#a1a1aa" strokeWidth="3" strokeLinecap="round" />

          {/* SENSOR BODY (Completely FIXED now - No rotation transform applied!) */}
          <g 
            onClick={toggleUI}
            style={{ cursor: isSimulating ? 'pointer' : 'default' }}
          >
            {/* Green SW 200D Capsule */}
            <rect 
              x="40" 
              y="30" 
              width="57" 
              height="20" 
              rx="4" 
              fill="#22c55e" 
              stroke="#15803d" 
              strokeWidth="1.5" 
            />
            {/* Metallic End Caps */}
            <rect x="38" y="31" width="3" height="18" fill="#15803d" rx="1" />
            <rect x="96" y="31" width="3" height="18" fill="#15803d" rx="1" />
            
             {/* 2nd Metallic End Caps */}
            <rect x="36" y="33" width="3" height="14" fill="#15803d" rx="1" />
            <rect x="98" y="33" width="3" height="14" fill="#15803d" rx="1" />
            <text x="70" y="43" textAnchor="middle" fontSize="6" fill="#ffffff" fontWeight="bold" letterSpacing="0.5">
              SW 200D
            </text>
          </g>

          {/* INTERACTIVE HORIZONTAL SLIDER OVERLAY (Tinkercad Replica) */}
          {isSimulating && showUI && (
            <g>
              {/* Left Icon (Vertical Rectangle indicating straight state) */}
              <rect x="18" y="1" width="8" height="20" fill="none" stroke="#1f2937" strokeWidth="2" />

              {/* Slider Track Background (Pill shape) */}
              <rect x="36" y="10" width="68" height="10" rx="5" fill="#ffffff" stroke="#1f2937" strokeWidth="2" />

              {/* Internal Directional Arrow indicating slide path */}
              <path 
                d="M 64 15 L 72 15 M 69 12 L 72 15 L 69 18" 
                stroke="#1f2937" 
                strokeWidth="1.5" 
                fill="none" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />

              {/* Right Icon (Tilted Rectangle indicating tilted state) */}
              <g transform="translate(112, 15) rotate(45)">
                <rect x="-1" y="-14" width="8" height="20" fill="none" stroke="#1f2937" strokeWidth="2" />
              </g>

              {/* Draggable Black Thumb/Knob (Moves horizontally based on angle) */}
              <circle
                cx={36 + (safeAngle / 90) * 68} 
                cy="15"
                r="7"
                fill="#1f2937"
                style={{ cursor: dragging ? 'grabbing' : 'grab' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDragging(true);
                }}
              />
              
              {/* Optional: Small text indicating current angle value above the knob */}
              {dragging && (
                 <text x={36 + (safeAngle / 90) * 68} y="5" textAnchor="middle" fontSize="7" fill="#1f2937" fontWeight="bold">
                   {safeAngle}°
                 </text>
              )}
            </g>
          )}
        </svg>
      </div>
    </BaseCircuitNode>
  );
}