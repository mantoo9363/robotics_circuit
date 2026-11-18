import { useEffect, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import {
  refreshSimulationFrameFromCurrentCircuit,
  useCircuitStore,
} from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function FlexSensorNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'flexSensor')!;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const bend = Number(props.data.properties?.bend?.value) || 0;
  const isSimulating = useCircuitStore((state) => state.isSimulating);

  const telemetryBend = useCircuitStore(
    (state) =>
      Number(
        state.simulationFrame?.components?.[props.id]?.telemetry?.bend ?? bend
      )
  );

  const safeBend = isSimulating ? telemetryBend : bend;

  const [showSlider, setShowSlider] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draggingTip, setDraggingTip] = useState(false);
  // +1 = bend right, -1 = bend left; controls visual direction independent of simulation magnitude
  const [bendSign, setBendSign] = useState(1);

  const sliderY = 130 - (safeBend / 180) * 100;

  const toggleSlider = () => {
    if (!isSimulating) return;
    setShowSlider((prev) => !prev);
  };

  const updateBend = (nextBend: number) => {
    const clamped = Math.max(0, Math.min(180, nextBend));

    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  bend: {
                    ...(node.data.properties?.bend ?? {
                      label: 'Bend',
                      type: 'number',
                      unit: '°',
                      min: 0,
                      max: 180,
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

  // Handler for side-slider dragging
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging || !svgRef.current) return;

      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const scaleY = 340 / rect.height;
      const clientY = (e.clientY - rect.top) * scaleY - 170; // offset to align with viewBox y starting at -170

      // Restrict slider movement range (in SVG coordinate space: -40 to 60 corresponds to Y=30 to Y=130)
      const clampedY = Math.max(30, Math.min(130, clientY + 170));

      // Convert pixel position back to 0-180°
      const calculatedBend = ((130 - clampedY) / 100) * 180;
      updateBend(calculatedBend);
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

  // Handler for direct tip dragging
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!draggingTip || !svgRef.current) return;

      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const scaleX = 60 / rect.width;
      const scaleY = 340 / rect.height;

      // Translate screen coordinates to SVG viewBox coordinates (x starts at -30, y starts at -170)
      const x = (e.clientX - rect.left) * scaleX - 30;
      const y = (e.clientY - rect.top) * scaleY - 170;

      // Base coordinate of the flexible bend is at (0, 78)
      const dx = x;
      const dy = y - 78;

      // Track the sign of dx so the sensor bends toward the pointer direction
      const sign = dx >= 0 ? 1 : -1;
      setBendSign(sign);

      // Angle from pointing straight up (0, -1) to (dx, dy) — always positive magnitude
      const angleDegrees = Math.abs(Math.atan2(dx, -dy) * 180 / Math.PI);

      // Due to circular arc geometry, the chord angle to the tip is exactly half the total bend angle.
      // Multiply by 2 to align cursor tracking and eliminate the startup jump.
      const clampedBend = Math.max(0, Math.min(180, angleDegrees * 2));
      updateBend(clampedBend);
    };

    const up = () => setDraggingTip(false);

    if (draggingTip) {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [draggingTip, props.id]);

  // Reset bend angle and hide slider when simulation stops
  useEffect(() => {
    if (!isSimulating) {
      if (showSlider) setShowSlider(false);
      updateBend(0);
    }
  }, [isSimulating]);

  // Precompute curved tip position in SVG coordinate space for grab handle placement
  // Use signed bend so the handle tracks the actual visual curve direction
  let tipX = 0;
  let tipY = 78;
  let currentAngleRad = 0;
  const angleStepRad = (safeBend / 22) * bendSign * Math.PI / 180;
  for (let i = 0; i < 22; i++) {
    currentAngleRad += angleStepRad;
    tipX += 9.6 * Math.sin(currentAngleRad);
    tipY += -9.6 * Math.cos(currentAngleRad);
  }

  // Nested recursive segment rendering to simulate realistic physics-based strip bending
  // bendSign controls visual direction: +1 = right, -1 = left
  const angleStep = (safeBend / 22) * bendSign;

  const renderSegment = (index: number) => {
    if (index > 21) return null;

    const isTop = index === 21;
    const transform = index === 0
      ? `translate(0, 78) rotate(${angleStep})`
      : `translate(0, -9.6) rotate(${angleStep})`;

    return (
      <g transform={transform}>
        {/* Brown background film slice */}
        {!isTop ? (
          <rect x="-12.5" y="-9.6" width="25" height="9.6" fill="#B46819" />
        ) : (
          <path d="M-12.5,0v-8.9a12.5,12.5 0 1 1 25,0v8.9z" fill="#B46819" />
        )}

        {/* Silver side trace (cgfx__flex_silver) slice */}
        {!isTop ? (
          <rect x="7" y="-9.6" width="2" height="9.6" fill="#BFBFBF" />
        ) : (
          <path d="M7,0v-8.9h-4.25v-2.5h-12v2.5h-.5v-2.5l2.5,-2.5h13.75l2.5,2.5v11.4z" fill="#BFBFBF" />
        )}

        {/* Segment specific graphics (silver combs and black bars) */}
        {!isTop ? (
          <>
            <path d="M-9.5,0v-5h12.5v5z" fill="#BFBFBF" />
            <path d="M-9.25,-5v-4.6h12v4.6z" fill="#2C2C2C" />
          </>
        ) : (
          <>
            <path d="M-9.5,0v-5h12.5v5z" fill="#BFBFBF" />
            <path d="M-9.25,-5v-6.4h12v6.4z" fill="#2C2C2C" />
          </>
        )}

        {/* Recursively nest next segment */}
        {renderSegment(index + 1)}
      </g>
    );
  };

  return (
    <BaseCircuitNode
      {...props}
      width={def.defaultWidth}
      height={def.defaultHeight}
      pins={def.pins}
    >
      {isSimulating && <input type="hidden" value={safeBend} />}

      <div
        data-node-id={props.id}
        style={{ position: 'relative', width: '60px', height: '340px' }}
      >
        <svg
          ref={svgRef}
          width="60"
          height="340"
          viewBox="-30 -170 60 340"
          style={{ position: 'relative', zIndex: 2, display: 'block', overflow: 'visible' }}
        >
          {/* Main rigid base structural elements */}
          {/* Rigid brown film slice between y=95 and y=78 */}
          <rect x="-12.5" y="78" width="25" height="17" fill="#B46819" />
          <rect x="7" y="78" width="2" height="17" fill="#BFBFBF" />

          {/* Rigid bottom base */}
          <path d="M-12.5,95v50h25v-50z" fill="#B46819" opacity=".7" />
          <path d="M-9.25,85v-7h12v7z" fill="#2C2C2C" />
          <path d="M-9,145v-57.5h-.75v-5h.5v2.5h12v-2.5h.5v2.5l-2.5,2.5h-1.75v57.5z" fill="#BFBFBF" />
          <path d="M1,145v-38l6,-6v-6h2v50z" fill="#BFBFBF" />

          {/* Solder Tabs & Lead Pins */}
          <path d="M-6.25,163v-14a2.78,2.78 0 0 0 -2,-2.67a.34,.34 0 0 1 -.25,-.33v-23l1,-1h5l1,1v23a.34,.34 0 0 1 -.25,.33a2.78,2.78 0 0 0 -2,2.67v14zM-6.5,140.5v-4h3v4zM-6.5,131v-4h3v4z" fill="#8C8C8C" fillRule="evenodd" />
          <path d="M3.75,163v-14a2.78,2.78 0 0 0 -2,-2.67a.34,.34 0 0 1 -.25,-.33v-23l1,-1h5l1,1v23a.34,.34 0 0 1 -.25,.33a2.78,2.78 0 0 0 -2,2.67v14zM3.5,140.5v-4h3v4zM3.5,131v-4h3v4z" fill="#8C8C8C" fillRule="evenodd" />

          {/* Bending Segment groups */}
          <g onClick={toggleSlider} style={{ cursor: isSimulating ? 'pointer' : 'default' }}>
            {renderSegment(0)}
          </g>

          Always-visible live readout badge while simulating
          {isSimulating  && (
            <g transform="translate(0, 110)" style={{ pointerEvents: 'none' }}>
              <rect
                x="-18"
                y="-9"
                width="36"
                height="18"
                rx="9"
                fill="#0f172a"
                stroke="#d97706"
                strokeWidth="1.5"
                opacity="0.95"
              />
              <text
                x="0"
                y="3"
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="700"
                fill="#f8fafc"
                fontFamily="ui-sans-serif, system-ui"
              >
                {Math.round(safeBend)}°
              </text>
            </g>
          )}

          {/* Interactive slider controls overlay — ticks removed per design spec */}
          {isSimulating && showSlider && (
            <g>
              {/* Slider track fill
              <path
                d={`M 15 130 L 16 ${sliderY} L 20 ${sliderY} L 21 130 Z`}
                fill="#fbbf24"
                opacity="0.6"
              /> */}

              {/* Slider knob */}
              {/* <circle
                cx="18"
                cy={sliderY}
                r="8"
                fill="#d97706"
                stroke="#ffffff"
                strokeWidth="2"
                style={{
                  cursor: dragging ? 'grabbing' : 'grab',
                  filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.35))',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDragging(true);
                }}
              /> */}
              {/* <circle cx="18" cy={sliderY} r="2.5" fill="#ffffff" style={{ pointerEvents: 'none' }} /> */}

              {/* Degree readout tag */}
              {/* <g transform={`translate(18, ${sliderY - 14})`} style={{ pointerEvents: 'none' }}>
                <text x="0" y="1" textAnchor="middle" fontSize="8" fill="#ffffff" fontWeight="bold" fontFamily="ui-sans-serif, system-ui">
                  {Math.round(safeBend)}°
                </text>
              </g> */}
            </g>
          )}

          {/* Draggable interactive grab handle at the computed top tip */}
          {isSimulating && (
            <g>
              <circle
                cx={tipX}
                cy={tipY}
                r="10"
                fill="none"
                stroke={draggingTip ? "#fbbf24" : "#d97706"}
                strokeWidth="1.5"
                strokeDasharray="2 2"
                opacity="0.8"
              />
              <circle
                cx={tipX}
                cy={tipY}
                r="6"
                fill={draggingTip ? "#d97706" : "#fbbf24"}
                opacity="0.85"
                style={{
                  cursor: draggingTip ? 'grabbing' : 'grab',
                  filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.35))',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDraggingTip(true);
                }}
              />
            </g>
          )}
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
