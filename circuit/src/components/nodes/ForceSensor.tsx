import { useEffect, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import {
  refreshSimulationFrameFromCurrentCircuit,
  useCircuitStore,
} from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

// Returns a color ramp (blue -> amber -> red) based on force intensity (0-10N)
function getForceColor(force: number) {
  const pct = Math.max(0, Math.min(1, force / 10));
  if (pct < 0.4) return { main: '#0284c7', light: '#38bdf8', glow: 'rgba(56,189,248,0.55)' };
  if (pct < 0.75) return { main: '#d97706', light: '#fbbf24', glow: 'rgba(251,191,36,0.55)' };
  return { main: '#dc2626', light: '#f87171', glow: 'rgba(248,113,113,0.55)' };
}

export function ForceSensorNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'forceSensor')!;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Retrieve base state property value dynamically (defaulting to 0N)
  const force = Number(props.data.properties?.force?.value) || 0;
  const isSimulating = useCircuitStore((state) => state.isSimulating);

  // Track telemetry metrics safely from simulation workspace frames
  const telemetryForce = useCircuitStore(
    (state) =>
      Number(
        state.simulationFrame?.components?.[props.id]?.telemetry?.force ?? force
      )
  );

  // Fallback to active runtime stream state tracking data models
  const safeForce = force;
  const colors = getForceColor(safeForce);

  const [showSlider, setShowSlider] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sliderY, setSliderY] = useState(130); // Tracks current position of the overlay handle

  const toggleSlider = () => {
    if (!isSimulating) return;
    setShowSlider((prev) => !prev);
  };

  const updateForce = (nextForce: number) => {
    // Exact limits requested: 0 to 10 Newtons
    const clamped = Math.max(0, Math.min(10, nextForce));

    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  force: {
                    ...(node.data.properties?.force ?? {
                      label: 'Force',
                      type: 'number',
                      unit: 'N',
                      min: 0,
                      max: 10,
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

  // Sync internal UI slider position with runtime force data models when not actively dragging
  useEffect(() => {
    if (!dragging) {
      // Maps 0N - 10N to a pixel bounds range of Y=130 (0N) down to Y=40 (10N)
      const targetY = 130 - (safeForce / 10) * 90;
      setSliderY(targetY);
    }
  }, [safeForce, dragging]);

  // Handle vertical sliding gestures perfectly inside the overlay boundaries
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
      const localY = localPoint.y;

      // Restrict overlay bounds movement range
      const clampedY = Math.max(40, Math.min(130, localY));
      setSliderY(clampedY);

      // Convert pixel position back to 0-10N
      const calculatedForce = ((130 - clampedY) / 90) * 10;
      updateForce(calculatedForce);
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
      {isSimulating && <input type="hidden" value={safeForce} />}

      <div
        data-node-id={props.id}
        style={{ position: 'relative', width: '120px', height: '240px' }}
      >
        <svg
          ref={svgRef}
          width="120"
          height="240"
          viewBox="0 0 120 240"
          style={{ position: 'relative', zIndex: 2, display: 'block' }}
        >
          <defs>
            {/* Depth gradient for the sensor head */}
            <radialGradient id="headGrad" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#6b7280" />
              <stop offset="55%" stopColor="#4b5563" />
              <stop offset="100%" stopColor="#374151" />
            </radialGradient>

            {/* Flexible substrate tail gradient */}
            <linearGradient id="tailGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a5f3fc" />
              <stop offset="50%" stopColor="#bff4f0" />
              <stop offset="100%" stopColor="#a5f3fc" />
            </linearGradient>

            {/* Pressure wedge fill, color driven by live force intensity */}
            <linearGradient id="pressureGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={colors.light} />
              <stop offset="100%" stopColor={colors.main} />
            </linearGradient>

            <clipPath id="headClip">
              <circle cx="60" cy="55" r="27" />
            </clipPath>
          </defs>

          {/* HARDWARE REPLICA DESIGN */}
          {/* Flexible Substrate Tail Body */}
          <rect x="52" y="70" width="16" height="90" rx="2" fill="url(#tailGrad)" stroke="#0891b2" strokeWidth="1.5" />
          <line x1="56" y1="72" x2="56" y2="160" stroke="#0891b2" strokeWidth="1" opacity="0.7" />
          <line x1="64" y1="72" x2="64" y2="160" stroke="#0891b2" strokeWidth="1" opacity="0.7" />

          {/* Solder Tabs */}
          <rect x="52" y="160" width="6" height="8" fill="#cbd5e1" stroke="#64748b" strokeWidth="0.5" />
          <rect x="62" y="160" width="6" height="8" fill="#cbd5e1" stroke="#64748b" strokeWidth="0.5" />

          {/* Connection Lead Pins (Matches catalog: x=55, x=65, y=223) */}
          <line x1="55" y1="168.5" x2="55" y2="185" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="65" y1="168.5" x2="65" y2="185" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />

          {/* Round Sensitive Head Base */}
          <g
            onClick={toggleSlider}
            style={{ cursor: isSimulating ? 'pointer' : 'default' }}
          >
            {/* Soft glow ring behind the head, active only during simulation */}
            {isSimulating && (
              <circle
                cx="60"
                cy="55"
                r="31"
                fill="none"
                stroke={colors.light}
                strokeWidth="4"
                opacity="0.35"
              />
            )}

            <circle
              cx="60"
              cy="55"
              r="28"
              fill="url(#headGrad)"
              stroke={isSimulating ? colors.main : '#1f2937'}
              strokeWidth="2.5"
              style={{ transition: 'stroke 0.2s ease' }}
            />

            {/* Interdigitated resistive mesh - horizontal comb pattern like a real FSR */}
            <g clipPath="url(#headClip)" opacity="0.85">
              {Array.from({ length: 11 }).map((_, i) => {
                const y = 34 + i * 4.2;
                const inset = Math.abs(i - 5) * 2.4;
                return (
                  <line
                    key={i}
                    x1={35 + inset}
                    y1={y}
                    x2={85 - inset}
                    y2={y}
                    stroke="#9ca3af"
                    strokeWidth="1.1"
                  />
                );
              })}
              <line x1="60" y1="30" x2="60" y2="80" stroke="#6b7280" strokeWidth="1" strokeDasharray="1.5 2" />
            </g>

            <circle cx="60" cy="55" r="27" fill="none" stroke="#1f2937" strokeWidth="1" opacity="0.5" />
          </g>

          {/* Always-visible live readout badge while simulating (matches physical sensor readback) */}
          {isSimulating && !showSlider && (
            <g transform="translate(60, 92)" style={{ pointerEvents: 'none' }}>
              <rect
                x="-26"
                y="-10"
                width="52"
                height="20"
                rx="10"
                fill="#0f172a"
                stroke={colors.main}
                strokeWidth="1.5"
                opacity="0.95"
              />
              <text
                x="0"
                y="4"
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="#f8fafc"
                fontFamily="ui-sans-serif, system-ui"
              >
                {safeForce.toFixed(2)}N
              </text>
            </g>
          )}

          {/* INTERACTIVE TINKERCAD SIMULATION OVERLAY */}
          {isSimulating && showSlider && (
            <g>
              {/* Vertical Capsule Wedge Background Slider Track */}
              {/* <rect
                x="46"
                y="33"
                width="28"
                height="114"
                rx="14"
                fill="#0f172a"
                fillOpacity="0.06"
                stroke={colors.main}
                strokeWidth="2"
                style={{ filter: 'drop-shadow(0px 2px 5px rgba(0,0,0,0.25))', transition: 'stroke 0.2s ease' }}
              /> */}

              {/* Tick marks: 0N, 2.5N, 5N, 7.5N, 10N */}
              {[0, 2.5, 5, 7.5, 10].map((n) => {
                const y = 130 - (n / 10) * 90;
                return (
                  <g key={n}>
                    <line x1="74" y1={y} x2="78" y2={y} stroke="#64748b" strokeWidth="1" />
                    <text x="81" y={y + 2.5} fontSize="6" fill="#000000" fontFamily="ui-sans-serif, system-ui">
                      {n}
                    </text>
                  </g>
                );
              })}

              {/* Wedge Gradient Fill representing pressure capacity */}
              <path
                d={`M 54 135 L 56 ${sliderY} L 64 ${sliderY} L 66 135 Z`}
                fill="url(#pressureGrad)"
              />

              {/* Adjustable Circular Slider Knob Handle */}
              <circle
                cx="60"
                cy={sliderY}
                r="9"
                fill={colors.main}
                stroke="#ffffff"
                strokeWidth="2.5"
                style={{
                  cursor: dragging ? 'grabbing' : 'grab',
                  filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.35))',
                  transition: dragging ? 'none' : 'fill 0.2s ease',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDragging(true);
                }}
              />
              <circle cx="60" cy={sliderY} r="3" fill="#ffffff" style={{ pointerEvents: 'none' }} />

              {/* Dynamic Readout Tag Overlay displaying accurate force metrics */}
              <g transform={`translate(60, ${sliderY - 18})`} style={{ pointerEvents: 'none' }}>
                <rect x="-24" y="-10" width="48" height="15" rx="4" fill="#1e293b" />
                <text x="0" y="1.5" textAnchor="middle" fontSize="8.5" fill="#ffffff" fontWeight="bold" fontFamily="ui-sans-serif, system-ui">
                  {safeForce.toFixed(2)}N
                </text>
              </g>

              
            </g>
          )}
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
