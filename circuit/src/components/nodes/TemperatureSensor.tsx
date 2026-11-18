import { useEffect, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import {
  refreshSimulationFrameFromCurrentCircuit,
  useCircuitStore,
} from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function TemperatureSensorNode(
  props: NodeProps<CircuitNode>
) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'temperatureSensor')!;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Retrieve base temperature value (Default: 25°C)
  const temperature = props.data.properties?.temperature?.value !== undefined 
    ? Number(props.data.properties.temperature.value) 
    : 25;

  const isSimulating = useCircuitStore((state) => state.isSimulating);
  
  // Track telemetry safely from simulation workspace frames
  const telemetryTemperature = useCircuitStore(
    (state) =>
      Number(
        state.simulationFrame?.components?.[props.id]?.telemetry?.temperature ?? temperature
      )
  );

  const safeTemperature = isSimulating ? telemetryTemperature : temperature;
  
  const [showSlider, setShowSlider] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Scaled up layout canvas container dimensions
  const viewWidth = 140;
  const viewHeight = 150;

  // New larger slider bounds for seamless interaction mapping
  const minX = 25;
  const maxX = 115;
  const minTemp = -40;
  const maxTemp = 125;

  // Map temperature to slider X coordinate
  const getXFromTemp = (temp: number) => {
    return minX + ((temp - minTemp) / (maxTemp - minTemp)) * (maxX - minX);
  };

  // Map slider X coordinate back to temperature value
  const getTempFromX = (x: number) => {
    const clampedX = Math.max(minX, Math.min(maxX, x));
    return minTemp + ((clampedX - minX) / (maxX - minX)) * (maxTemp - minTemp);
  };

  const toggleSlider = () => {
    setShowSlider((prev) => !prev);
  };

  const updateTemperature = (nextTemp: number) => {
    const clamped = Math.max(minTemp, Math.min(maxTemp, nextTemp));

    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  temperature: {
                    ...(node.data.properties?.temperature ?? {
                      label: 'Temperature',
                      type: 'number',
                      unit: '°C',
                      min: -40,
                      max: 125,
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

  // Handle pointer tracking movements smoothly across the expanded scaling view width
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

      const calculatedTemp = getTempFromX(localX);
      updateTemperature(calculatedTemp);
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

  const sliderX = getXFromTemp(safeTemperature);

  return (
    <BaseCircuitNode
      {...props}
      width={viewWidth}
      height={viewHeight}
      pins={def.pins}
    >
      {isSimulating && (
        <input
          type="hidden"
          value={safeTemperature}
        />
      )}

      {/* Main Container Layout View matching new expanded aspect model */}
      <div 
        data-node-id={props.id}
        style={{ 
          position: 'relative', 
          width: `${viewWidth}px`, 
          height: `${viewHeight}px` 
        }}
      >
        <svg
          ref={svgRef}
          width={viewWidth}
          height={viewHeight}
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'block'
          }}
        >
          {/* --- TINKERCAD INTERACTIVE SLIDER OVERLAY (SCALED UP) --- */}
          {isSimulating && showSlider && (
            <g>
              {/* Thermometer Icon Left */}
              <g transform="translate(4, 10) scale(0.55)">
                <path d="M10 30 T 10 15 A 8 8 0 0 1 26 15 T 26 30 A 12 12 0 1 1 10 30 Z" fill="none" stroke="#2c3e50" strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="18" cy="42" r="6" fill="#2c3e50" />
              </g>

              {/* Main Outer Dark Track Slider Base Pill */}
              <rect
                x="22"
                y="16"
                width="96"
                height="14"
                rx="7"
                fill="#ffffff"
                stroke="#2c3e50"
                strokeWidth="2"
              />

              {/* Thermometer Icon Right */}
              <g transform="translate(118, 10) scale(0.55)">
                <path d="M10 30 T 10 15 A 8 8 0 0 1 26 15 T 26 30 A 12 12 0 1 1 10 30 Z" fill="none" stroke="#2c3e50" strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="18" cy="42" r="6" fill="#ef4444" />
              </g>

              {/* Interactive Sliding Draggable Value Selection Badge */}
              <g
                transform={`translate(${sliderX}, 23)`}
                style={{ cursor: dragging ? "grabbing" : "grab" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDragging(true);
                }}
              >
                {/* Tinkercad Rounded Pill Slider Handle */}
                <rect
                  x="-20"
                  y="-11"
                  width="40"
                  height="22"
                  rx="11"
                  fill="#2c3e50"
                />
                
                {/* Central Target Data Temperature Stream Metrics */}
                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fontSize="11"
                  fill="#ffffff"
                  fontWeight="bold"
                  style={{ userSelect: 'none' }}
                >
                  {Math.round(safeTemperature)}°C
                </text>
              </g>
            </g>
          )}

          {/* --- PHYSICAL TMP36 TRANSISTOR SHIELD DESIGN (LARGE SIZE) --- */}
          <g 
            onClick={toggleSlider} 
            style={{ cursor: "pointer" }}
            transform="translate(0, 10)" // Shifts everything down cleanly to save space for top slider slider
          >
            {/* Top Curved 3D Cap Shell */}
            <path
              d="M 35 60 A 35 15 0 0 1 105 60 Z"
              fill="#1e2022"
            />

            {/* Flat Main Body Face Chassis */}
            <rect
              x="35"
              y="60"
              width="70"
              height="38"
              fill="#2c3e50"
            />

            {/* Bottom Accent Border Rim Trim */}
            <rect
              x="31"
              y="98"
              width="78"
              height="8"
              rx="1"
              fill="#1a252f"
            />

            {/* Component Label Text Stamp ID */}
            <text
              x="70"
              y="86"
              textAnchor="middle"
              fontSize="18"
              fill="#ffffff"
              fontWeight="bold"
              letterSpacing="1"
              style={{ userSelect: 'none' }}
            >
              TMP
            </text>
          </g>

          {/* --- ENHANCED BOLD BREADBOARD TERMINAL PIN LEADS --- */}
          {/* Left Pin (Vs) Terminal Leg Trace line */}
          <line x1="50" y1="116" x2="50" y2="140" stroke="#cfcfcf" strokeWidth="5" strokeLinecap="round" />
          {/* Middle Pin (Vout) Terminal Leg Trace line */}
          <line x1="70" y1="116" x2="70" y2="140" stroke="#cfcfcf" strokeWidth="5" strokeLinecap="round" />
          {/* Right Pin (GND) Terminal Leg Trace line */}
          <line x1="90" y1="116" x2="90" y2="140" stroke="#cfcfcf" strokeWidth="5" strokeLinecap="round" />

          {/* Core Hardware Contact Node Dots */}
          <circle cx="50" cy="140" r="3" fill="#111827" />
          <circle cx="70" cy="140" r="3" fill="#111827" />
          <circle cx="90" cy="140" r="3" fill="#111827" />
        </svg>
      </div>
    </BaseCircuitNode>
  );
}