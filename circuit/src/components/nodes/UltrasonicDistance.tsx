import { useEffect, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import {
  refreshSimulationFrameFromCurrentCircuit,
  useCircuitStore,
} from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function UltrasonicDistanceNode(
  props: NodeProps<CircuitNode>
) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'ultrasonicDistance')!;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Retrieve the base state property distance value dynamically
  const distance = Number(props.data.properties?.distance?.value) || 0;

  const isSimulating = useCircuitStore((state) => state.isSimulating);
  
  // Track telemetry metrics safely from simulation workspace frames
  const telemetryDistance = useCircuitStore(
    (state) =>
      Number(
        state.simulationFrame?.components?.[props.id]?.telemetry?.distance ?? distance
      )
  );

  // Fallback to active runtime stream state tracking data models
  const safeDistance = isSimulating ? telemetryDistance : distance;
  
  const [showRange, setShowRange] = useState(false);
  const [objectX, setObjectX] = useState(90);
  const [objectY, setObjectY] = useState(80);
  const [dragging, setDragging] = useState(false);

  const toggleRange = () => {
    setShowRange((prev) => !prev);
  };

  const updateDistance = (nextDistance: number) => {
    // Keep absolute limits only at storage engine layer to protect external hardware simulators
    const clamped = Math.max(2, Math.min(400, nextDistance));

    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  distance: {
                    ...(node.data.properties?.distance ?? {
                      label: 'Distance',
                      type: 'number',
                      unit: 'cm',
                      min: 2,
                      max: 400,
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

  // Manage unlimited mouse pointer movements and calculation sequences globally
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
      const localY = localPoint.y;

      // Distance constraints removed so the tracking ball can go anywhere
      setObjectX(localX);
      setObjectY(localY);

      // Distance calculation logic matrix parameters
      const dx = localX - 90;
      const dy = localY - 180;
      const distancePx = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate true conversion parameters from raw coordinate structures
      const distanceCm = distancePx * 2.22; 
      updateDistance(distanceCm);
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
          value={safeDistance}
        />
      )}

      {/* Main Container Layer Mapping Block */}
      <div 
        data-node-id={props.id}
        style={{ 
          position: 'relative', 
          width: '180px', 
          height: '320px' 
        }}
      >
        {/* Core Vector Design Rendering Engine */}
        <svg
          ref={svgRef}
          width="180"
          height="320"
          viewBox="0 0 180 320"
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'block'
          }}
        >
          {/* {isSimulating && (
            <>
              {showRange && (
                <>
                  <path
                    d="
                      M10 180
                      A80 80 0 0 1 170 180
                      L10 180
                      Z
                    "
                    fill="rgba(0,255,120,0.12)"
                    stroke="#10b981"
                    strokeWidth="2"
                  />

                  <path
                    d="M50 180 A40 40 0 0 1 130 180"
                    fill="none"
                    stroke="rgba(0,200,100,0.4)"
                    strokeWidth="1.5"
                  />

                  <path
                    d="M30 180 A60 60 0 0 1 150 180"
                    fill="none"
                    stroke="rgba(0,200,100,0.4)"
                    strokeWidth="1.5"
                  />

                  <path
                    d="M10 180 A80 80 0 0 1 170 180"
                    fill="none"
                    stroke="rgba(0,200,100,0.4)"
                    strokeWidth="1.5"
                  />

                  <line
                    x1="90"
                    y1="180"
                    x2="90"
                    y2="100"
                    stroke="#10b981"
                    strokeDasharray="4 4"
                  />

                  <line
                    x1="90"
                    y1="180"
                    x2={objectX}
                    y2={objectY}
                    stroke="#00ff00"
                    strokeWidth="2"
                  />

                  <circle
                    cx={objectX}
                    cy={objectY}
                    r="10"
                    fill="#ff4444"
                    stroke="white"
                    strokeWidth="2"
                    style={{ cursor: dragging ? "grabbing" : "grab" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDragging(true);
                    }}
                  />

                  <text
                    x="90"
                    y="20"
                    textAnchor="middle"
                    fontSize="12"
                    fill="#10b981"
                    fontWeight="bold"
                  >
                    {safeDistance.toFixed(1)} cm
                  </text>
                </>
              )}
            </>
          )} */}

          {/* Electronic PCB Hardware Motherboard Frame Body */}
          <rect
            x="10"
            y="190"
            width="160"
            height="80"
            rx="6"
            fill="#003b78"
            onClick={toggleRange}
            style={{ cursor: "pointer" }}
          />

          <circle
            cx="45"
            cy="230"
            r="32"
            fill="#d4d4d4"
            onClick={toggleRange}
            style={{ cursor: "pointer" }}
          />

          <circle
            cx="132"
            cy="230"
            r="32"
            fill="#d4d4d4"
            onClick={toggleRange}
            style={{ cursor: "pointer" }}
          />

                {/* Left Ultrasonic Barrel Transceiver Node */}
          <circle cx="45" cy="230" r="32" fill="#d4d4d4" />
          <circle cx="45" cy="230" r="24" fill="#5f5f5f" />
          <circle cx="45" cy="230" r="16" fill="#a7a72c" />
          <circle cx="45" cy="230" r="10" fill="#9c9c9c" />

          {/* Right Ultrasonic Barrel Receiver Node */}
          <circle cx="132" cy="230" r="32" fill="#d4d4d4" />
          <circle cx="132" cy="230" r="24" fill="#5f5f5f" />
          <circle cx="132" cy="230" r="16" fill="#a7a72c" />
          <circle cx="132" cy="230" r="10" fill="#9c9c9c" />

          {/* Professional Tinkercad-like Radar Simulation Logic Block */}
          {(() => {
            // Anti-disappearance constraints: Safely limits coordinates so the ball never flies off-canvas
            const safeX = Math.max(10, Math.min(170, objectX));
            const safeY = Math.max(10, Math.min(310, objectY));

            // Calculate current vector variables relative to the sensor top emitting plane (90, 190)
            const dx = safeX - 90;
            const dy = safeY - 190;
            const distancePx = Math.sqrt(dx * dx + dy * dy);

            // Compute standard angular trajectory boundaries for the 45-degree acoustic cone field
            const angleRad = Math.atan2(-dy, dx);
            const isInConeAngle = angleRad >= Math.PI / 4 && angleRad <= (3 * Math.PI) / 4;
            
            // True operational limit rule check: Ultrasonic sensors physically cap object capturing bounds
            const isInRadarRange = distancePx <= 160 && dy < 0 && isInConeAngle;
            
            // Interactive UI status styles with extremely low background opacity as requested
            const ballColor = isInRadarRange ? "#4ade80" : "#2196f3"; // Light green if active, blue if undetected
            const radarFieldColor = isInRadarRange ? "rgba(74, 222, 128, 0.04)" : "rgba(229, 231, 235, 0.1)"; // Very faint transparency
            const radarStrokeColor = isInRadarRange ? "rgba(74, 222, 128, 0.2)" : "rgba(156, 163, 175, 0.1)"; // Ultra-light borders

            return (
              <>
                {/* Core Conical Waveguide Path - Visualizes the acoustic signal spread bounds */}
                {isSimulating && showRange && (
                  <path
                    d="
                      M 60 190 
                      L 10 30 
                      A 110 110 0 0 1 170 30 
                      L 120 190 
                      Z
                    "
                    fill={radarFieldColor}
                    stroke={radarStrokeColor}
                    strokeWidth="1.2"
                    strokeDasharray={isInRadarRange ? "none" : "3 3"}
                  />
                )}

                {/* Laser Tracking Ray Alignment Guides - Draws path targeting ONLY when within sensor boundaries */}
                {isSimulating && showRange && isInRadarRange && (
                  <>
                    <line
                      x1="60"
                      y1="190"
                      x2={safeX}
                      y2={safeY}
                      stroke={radarStrokeColor}
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <line
                      x1="120"
                      y1="190"
                      x2={safeX}
                      y2={safeY}
                      stroke={radarStrokeColor}
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                  </>
                )}

                {/* Draggable Simulation Target Object - Stays persistent and responsive across all states */}
                <circle
                  cx={safeX}
                  cy={safeY}
                  r="10"
                  fill={ballColor}
                  stroke="white"
                  strokeWidth="2"
                  style={{ cursor: dragging ? "grabbing" : "grab" }}
                  onPointerDown={(e) => {
                    e.stopPropagation(); 
                    e.preventDefault();
                    setDragging(true);
                  }}
                />

                {/* Live Real-Time Telemetry Matrix Output Text Element */}
                {isSimulating && showRange && (
                  <text
                    x="90"
                    y="175"
                    textAnchor="middle"
                    fontSize="11"
                    fill="#000000"
                    fontWeight="bold"
                  >
                    {isInRadarRange ? `${safeDistance.toFixed(1)} cm` : "Out of Range"}
                  </text>
                )}
              </>
            );
          })()}

          {/* Component Branding Serial Crest */}
          <text
            x="85"
            y="200"
            textAnchor="middle"
            fontSize="12"
            fill="white"
            fontWeight="bold"
          >
            HC-SR04
          </text>
          
          {/* Main Quartz System Resonator Crystal */}
          <rect
            x="68"
            y="205"
            width="40"
            height="12"
            rx="6"
            fill="#b0b0b0"
            stroke="#e0e0e0"
            strokeWidth="1"
          />
          
          {/* Pin Function Identification Tags */}
          <text x="-40" y="160" fontSize="6" fill="white" transform="rotate(-90 72 155)">VCC</text>
          <text x="-30" y="160" fontSize="6" fill="white" transform="rotate(-90 82 155)">TRIG</text>
          <text x="-20" y="160" fontSize="6" fill="white" transform="rotate(-90 92 155)">ECHO</text>
          <text x="-10" y="160" fontSize="6" fill="white" transform="rotate(-90 102 155)">GND</text>

          {/* Interface Lead Connection Terminal Traces */}
          <line x1="75" y1="270" x2="75" y2="300" stroke="#cfcfcf" strokeWidth="4" />
          <line x1="85" y1="270" x2="85" y2="300" stroke="#cfcfcf" strokeWidth="4" />
          <line x1="95" y1="270" x2="95" y2="300" stroke="#cfcfcf" strokeWidth="4" />
          <line x1="105" y1="270" x2="105" y2="300" stroke="#cfcfcf" strokeWidth="4" />
          
          {/* Hardware Structural Spacer Alignment Points */}
          <circle cx="15" cy="200" r="4" fill="#d9d9d9" />
          <circle cx="164" cy="200" r="4" fill="#d9d9d9" />
          <circle cx="15" cy="260" r="4" fill="#d9d9d9" />
          <circle cx="164" cy="260" r="4" fill="#d9d9d9" />
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
