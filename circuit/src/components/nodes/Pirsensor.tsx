import { useEffect, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { COMPONENT_CATALOG } from '@cs/lib/circuit-components';
import {
  refreshSimulationFrameFromCurrentCircuit,
  useCircuitStore,
} from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

const def =
  COMPONENT_CATALOG.find(
    (c) => c.type === 'pirSensor'
  )!;

export function PirSensorNode(
  props: NodeProps<CircuitNode>
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastMoveTimeRef = useRef<number>(0);

  const motionDetected =
    props.data.pirMotion === true ||
    props.data.properties?.motion?.value === 'true' ||
    props.data.properties?.motion?.value === 1;

  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const telemetryMotion = useCircuitStore(
    (state) =>
      !!state.simulationFrame?.components?.[props.id]?.telemetry?.motion
  );

  const safeMotion = isSimulating ? telemetryMotion || motionDetected : motionDetected;
  
  const [showRange, setShowRange] = useState(true);
  const [objectX, setObjectX] = useState(70);
  const [objectY, setObjectY] = useState(40);
  const [dragging, setDragging] = useState(false);
  const [isCurrentlyMoving, setIsCurrentlyMoving] = useState(false);
  const sensorX = 110;
  const sensorY = 225;

  const lastPosRef = useRef({ x: 70, y: 40 });

  const toggleRange = () => {
    setShowRange((prev) => !prev);
  };

  // Typed store update logic to bypass dynamic strict indexing signatures safely
  const updateMotionState = (isMovingInCone: boolean) => {
    useCircuitStore.setState((store: any) => {
      const currentNodes = store.nodes || [];
      return {
        nodes: currentNodes.map((node: any) =>
          node.id === props.id
            ? {
              ...node,
              data: {
                ...node.data,
                pirMotion: isMovingInCone,
                properties: Object.fromEntries(
                  Object.entries(node.data?.properties ?? {}).filter(
                    ([key]) => key !== 'motion'
                  )
                ),
              },
              }
            : node
        ),
      };
    });

    refreshSimulationFrameFromCurrentCircuit();
  };

  // Watchdog timer interval loop to reset motion status if the object stays static for >1.5s
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastMoveTimeRef.current > 1500) {
        setIsCurrentlyMoving(false);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const isTargetInsideCone = () => {
    const dx = objectX - sensorX;
    const dy = objectY - sensorY;
    const distancePx = Math.sqrt(dx * dx + dy * dy);

    const angleRad = Math.atan2(-dy, dx);
    const isInPIRAngle = angleRad >= (Math.PI * 35) / 180 && angleRad <= (Math.PI * 145) / 180;
    return distancePx <= 210 && dy < 0 && isInPIRAngle;
  };

  // Recalculate operational spatial logic frames relative to the dome focal center
  useEffect(() => {
    const isPIRTriggered = isTargetInsideCone() && isCurrentlyMoving;
    
    // SAFE CHECK: Only update store if the motion state actually transitions to a new value to prevent loops
    if (safeMotion !== isPIRTriggered) {
      updateMotionState(isPIRTriggered);
    }
  }, [objectX, objectY, isCurrentlyMoving, safeMotion]);

  // Handle cursor positioning arrays across the viewport bounds safely
  useEffect(() => {
    const move = (e: MouseEvent | PointerEvent) => {
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

      // Bound safety layout clamps preventing objects floating off-screen
      const safeX = Math.max(20, Math.min(200, localX));
      const safeY = Math.max(15, Math.min(255, localY));

      const dist = Math.hypot(safeX - lastPosRef.current.x, safeY - lastPosRef.current.y);
      if (dist >= 3) {
        lastPosRef.current = { x: safeX, y: safeY };
        lastMoveTimeRef.current = Date.now();
        setIsCurrentlyMoving(true);
      }

      setObjectX(safeX);
      setObjectY(safeY);
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
  }, [dragging]);

  // Precompute live operational criteria vectors ahead of UI paint
  const calcDx = objectX - sensorX;
  const calcDy = objectY - sensorY;
  const calcDistancePx = Math.sqrt(calcDx * calcDx + calcDy * calcDy);
  const calcAngleRad = Math.atan2(-calcDy, calcDx);
  const currentInPIRAngle = calcAngleRad >= (Math.PI * 35) / 180 && calcAngleRad <= (Math.PI * 145) / 180;
  const currentInsideCone = calcDistancePx <= 210 && calcDy < 0 && currentInPIRAngle;

  const realTimeTrigger = currentInsideCone && isCurrentlyMoving;

  const ballColor = realTimeTrigger ? "#4ade80" : "#2196f3";
  const radarFieldColor = realTimeTrigger ? "rgba(74, 222, 128, 0.04)" : "rgba(229, 231, 235, 0.1)";
  const radarStrokeColor = realTimeTrigger ? "rgba(74, 222, 128, 0.2)" : "rgba(156, 163, 175, 0.1)";

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
          value={safeMotion ? "HIGH" : "LOW"}
        />
      )}

      {/* Main Structural Wrapper Layout Element */}
      <div 
        data-node-id={props.id}
        style={{ 
          position: 'relative', 
          width: '220px',
          height: '300px'
        }}
      >
        <svg
          ref={svgRef}
          width="220"
          height="300"
          viewBox="0 0 220 300"
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'block'
          }}
        >
          {isSimulating && (
            <>
              {showRange && (
                <>
                  {/* PIR Faint Conical Waveguide Spread Frame */}
                  <path
                    d="M70 190 L20 35 A155 155 0 0 1 200 35 L150 190 Q110 175 70 190 Z"
                    fill={radarFieldColor}
                    stroke={radarStrokeColor}
                    strokeWidth="1.2"
                    strokeDasharray={realTimeTrigger ? "none" : "3 3"}
                  />

                  {/* Active Detection Ray Alignment Guides */}
                  {realTimeTrigger && (
                    <>
                      <line
                        x1="110"
                        y1="225"
                        x2={objectX}
                        y2={objectY}
                        stroke={radarStrokeColor}
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                    </>
                  )}

                  <line
                    x1="110"
                    y1="225"
                    x2={objectX}
                    y2={objectY}
                    stroke="#9ccfdc"
                    strokeWidth="2"
                    strokeDasharray="8 8"
                    opacity="0.75"
                  />

                  {/* Operational Telemetry status message display */}
                  <text
                    x="110"
                    y="182"
                    textAnchor="middle"
                    fontSize="10"
                    fill="#000000"
                    fontWeight="bold"
                  >
                    {realTimeTrigger ? "Motion Detected" : "No Motion"}
                  </text>
                </>
              )}
            </>
          )}

          {/* Persistent Draggable Interactive Object Target */}
          <circle
            cx={objectX}
            cy={objectY}
            r="14"
            fill={ballColor}
            stroke="#0f6f89"
            strokeWidth="3"
            style={{ cursor: dragging ? "grabbing" : "grab" }}
            onPointerDown={(e) => {
              e.stopPropagation(); 
              e.preventDefault();
              setDragging(true);
            }}
          />

          <image
            href="/parts/pir-sensor.svg"
            x="40"
            y="150"
            width="140"
            height="150"
            preserveAspectRatio="xMidYMid meet"
            onClick={toggleRange}
            style={{ cursor: "pointer" }}
          />
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
