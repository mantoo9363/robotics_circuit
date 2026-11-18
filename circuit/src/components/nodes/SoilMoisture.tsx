import { useEffect, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import {
  refreshSimulationFrameFromCurrentCircuit,
  useCircuitStore,
} from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function SoilMoistureNode(
  props: NodeProps<CircuitNode>
) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'soilMoisture')!;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Mapped to Tinkercad range 0-1023 (Default: 0)
  const moisture = props.data.properties?.moisture?.value !== undefined 
    ? Number(props.data.properties.moisture.value) 
    : 0;

  const isSimulating = useCircuitStore((state) => state.isSimulating);
  
  // Track telemetry from simulation frame workspace safely
  const telemetryMoisture = useCircuitStore(
    (state) =>
      Number(
        state.simulationFrame?.components?.[props.id]?.telemetry?.moisture ?? moisture
      )
  );

  const safeMoisture = isSimulating ? telemetryMoisture : moisture;
  
  const [showSlider, setShowSlider] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Slider bounds tracking relative to viewport coordinates
  const minX = 35;
  const maxX = 75;
  const minVal = 0;
  const maxVal = 1023;

  // Map moisture index to slider X coordinate
  const getXFromMoisture = (val: number) => {
    return minX + ((val - minVal) / (maxVal - minVal)) * (maxX - minX);
  };

  // Map slider X coordinate back to moisture index
  const getMoistureFromX = (x: number) => {
    const clampedX = Math.max(minX, Math.min(maxX, x));
    return minVal + ((clampedX - minX) / (maxX - minX)) * (maxVal - minVal);
  };

  const toggleSlider = () => {
    setShowSlider((prev) => !prev);
  };

  const updateMoisture = (nextVal: number) => {
    const clamped = Math.max(minVal, Math.min(maxVal, nextVal));

    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  moisture: {
                    ...(node.data.properties?.moisture ?? {
                      label: 'Moisture',
                      type: 'number',
                      unit: '',
                      min: 0,
                      max: 1023,
                    }),
                    value: Math.round(clamped),
                  },
                },
              },
            }
          : node
      ),
    }));

    refreshSimulationFrameFromCurrentCircuit();
  };

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

      const calculatedMoisture = getMoistureFromX(localX);
      updateMoisture(calculatedMoisture);
    };

    const up = () => setDragging(false);

    if (dragging) {
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, props.id]);

  const sliderX = getXFromMoisture(safeMoisture);

  return (
    <BaseCircuitNode
      {...props}
      width={def.defaultWidth}
      height={def.defaultHeight}
      pins={def.pins}
    >
      {isSimulating && (
        <input
          type="hidden"
          value={safeMoisture}
        />
      )}

      {/* Main Container Wrapper Layout Block */}
      <div 
        data-node-id={props.id}
        style={{ 
          position: 'relative', 
          width: `${def.defaultWidth}px`, 
          height: `${def.defaultHeight}px` 
        }}
      >
        <svg
          ref={svgRef}
          width={def.defaultWidth}
          height={def.defaultHeight}
          viewBox={`0 0 ${def.defaultWidth} ${def.defaultHeight}`}
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'block'
          }}
        >
          {/* --- PHYSICAL SOIL MOISTURE SENSOR HARDWARE BODY --- */}
          <g 
            onClick={toggleSlider} 
            style={{ cursor: "pointer" }}
          >
            {/* Dark Red Matte PCB Upper Module Board */}
            <path
              d="M 23 12 A 6 6 0 0 1 87 12 L 87 38 L 23 38 Z"
              fill="#b91c1c"
            />
            
            {/* Authentic Metallic Component Ring Mounting Holes */}
            <circle cx="28" cy="17" r="3" fill="#ffffff" stroke="#7f1d1d" strokeWidth="0.8" />
            <circle cx="82" cy="17" r="3" fill="#ffffff" stroke="#7f1d1d" strokeWidth="0.8" />

            {/* Silk-Screen Text Brand Stamp Typography */}
            <text
              x="55"
              y="26"
              textAnchor="middle"
              fontSize="4.8"
              fill="#e2e8f0"
              fontWeight="bold"
              style={{ userSelect: 'none' }}
            >
              Soil Moisture
            </text>
            <text
              x="55"
              y="32"
              textAnchor="middle"
              fontSize="4.8"
              fill="#e2e8f0"
              fontWeight="bold"
              style={{ userSelect: 'none' }}
            >
              Sensor
            </text>

            {/* Upper On-board Trace Contacts Terminal Blocks */}
            <rect x="37" y="17" width="37" height="6" rx="0.5" fill="#7f1d1d" />
            

            {/* Left Sensor Probe Prong Leg */}
            <path
              d="M 23 38 L 23 84 L 31 94 L 39 84 L 39 38 Z"
              fill="#e2e8f0"
              stroke="#cbd5e1"
              strokeWidth="0.5"
            />
            {/* Grid Array Sensor Contacts on Left Prong */}
            <circle cx="31" cy="46" r="0.8" fill="#94a3b8" />
            <circle cx="31" cy="54" r="0.8" fill="#94a3b8" />
            <circle cx="31" cy="62" r="0.8" fill="#94a3b8" />
            <circle cx="31" cy="70" r="0.8" fill="#94a3b8" />
            <circle cx="31" cy="78" r="0.8" fill="#94a3b8" />

            {/* Right Sensor Probe Prong Leg */}
            <path
              d="M 71 38 L 71 84 L 79 94 L 87 84 L 87 38 Z"
              fill="#e2e8f0"
              stroke="#cbd5e1"
              strokeWidth="0.5"
            />
            {/* Grid Array Sensor Contacts on Right Prong */}
            <circle cx="79" cy="46" r="0.8" fill="#94a3b8" />
            <circle cx="79" cy="54" r="0.8" fill="#94a3b8" />
            <circle cx="79" cy="62" r="0.8" fill="#94a3b8" />
            <circle cx="79" cy="70" r="0.8" fill="#94a3b8" />
            <circle cx="79" cy="78" r="0.8" fill="#94a3b8" />
          </g>

          {/* --- EXACT TINKERCAD SLIDER INTERACTION OVERLAY (CROSSING PRONGS) --- */}
          {isSimulating && showSlider && (
            <g>
              {/* Left Dry Water Droplet Icon with Dark Outline */}
              <g transform="translate(14, 59)">
                <path 
                  d="M 4 0 Q 0 4 4 8 Q 8 4 4 0 Z" 
                  fill="#ffffff" 
                  stroke="#1f2937" 
                  strokeWidth="1.2" 
                />
              </g>

              {/* Tinkercad Center Track Slot Base line */}
              <rect
                x="28"
                y="62"
                width="54"
                height="3"
                rx="1.5"
                fill="#ffffff"
                stroke="#1f2937"
                strokeWidth="1"
              />

              {/* Right Wet Water Droplet Icon with Dark Outline */}
              <g transform="translate(88, 59)">
                <path 
                  d="M 4 0 Q 0 4 4 8 Q 8 4 4 0 Z" 
                  fill="#38bdf8" 
                  stroke="#1f2937" 
                  strokeWidth="1.2" 
                />
              </g>

              {/* Slider Circular Black Handle Knob Selector */}
              <g
                transform={`translate(${sliderX}, 63.5)`}
                style={{ cursor: dragging ? "grabbing" : "grab" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDragging(true);
                }}
              >
                <circle cx="0" cy="0" r="5" fill="#1f2937" />
              </g>
            </g>
          )}

          {/* --- TERMINAL CONNECTIONS (MATCHING CATALOG SPECIFICATIONS) --- */}
          
          {/* Group 1: Upper Header Wire Blocks (y: 40) */}
          {/* vcc1 (41, 40) */}
         
          <circle cx="41" cy="20" r="2.5" fill="#0000FF" />
          
          {/* gnd1 (55, 40) */}
          
          <circle cx="55" cy="20" r="2.5" fill="#0000FF" />
          
          {/* sig1 (70, 40) */}
         
          <circle cx="70" cy="20" r="2.5" fill="#0000FF" />

  {/* Upper On-board Trace Contacts Terminal Blocks */}
            <rect x="37" y="0" width="37" height="6" rx="0.5" fill="#7f1d1d" />
          {/* Group 2: Lower Breakout Connection Pins (y: 51) */}
          {/* vcc2 (45, 51) */}
         
          <line x1="41" y1="2" x2="41" y2="17" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="41" cy="3" r="3" fill="#111827" />

          {/* gnd2 (55, 51) */}
          <line x1="55" y1="2" x2="55" y2="18" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="55" cy="3" r="3" fill="#111827" />

          {/* sig2 (65, 51) */}
          <line x1="70" y1="1" x2="70" y2="17" stroke="#6b7280" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="70" cy="3" r="3" fill="#111827" />
        </svg>
      </div>
    </BaseCircuitNode>
  );
}