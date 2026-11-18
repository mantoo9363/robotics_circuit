import { useEffect, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import {
  refreshSimulationFrameFromCurrentCircuit,
  useCircuitStore,
} from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function PhotoresistorNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'photoresistor')!;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const [showSlider, setShowSlider] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (isSimulating && !showSlider) setShowSlider(true);
    if (!isSimulating && showSlider) setShowSlider(false);
  }, [isSimulating, showSlider]);

  const rawLightLevel = Math.max(
    0,
    Math.min(1023, Number(props.data.properties?.lightLevel?.value ?? 512)),
  );
  const lightLevel = rawLightLevel;
  const lightFraction =
    lightLevel <= 100
      ? (lightLevel / 100) * 0.5
      : 0.5 + ((lightLevel - 100) / 923) * 0.5;

  const telemetry = useCircuitStore((state) => state.simulationFrame?.components[props.id]?.telemetry);
  const resistance =
    typeof telemetry?.resistance === 'number'
      ? telemetry.resistance
      : 100 + (1_000_000 - 100) * Math.pow(1 - lightFraction, 2);
  const resistanceLabel =
    resistance >= 1_000_000
      ? `${(resistance / 1_000_000).toFixed(2)}M`
      : resistance >= 1_000
        ? `${(resistance / 1_000).toFixed(1)}k`
        : `${Math.round(resistance)}`;

  // Scaled up layout canvas container dimensions
  const viewWidth = 140;
  const viewHeight = 150;

  const sliderMin = 0;
  const sliderMax = 1023;
  const minX = 42;
  const maxX = 98;

  const getXFromLightLevel = (value: number) =>
    minX + ((value - sliderMin) / (sliderMax - sliderMin)) * (maxX - minX);

  const getLightLevelFromX = (x: number) => {
    const clamped = Math.max(minX, Math.min(maxX, x));
    return (
      sliderMin + ((clamped - minX) / (maxX - minX)) * (sliderMax - sliderMin)
    );
  };

  const updateLightLevel = (nextValue: number) => {
    const clamped = Math.round(Math.max(sliderMin, Math.min(sliderMax, nextValue)));
    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  lightLevel: {
                    ...(node.data.properties?.lightLevel ?? {
                      label: 'Light Level',
                      type: 'number',
                      unit: '',
                      min: 0,
                      max: 1023,
                    }),
                    value: clamped,
                  },
                },
              },
            }
          : node,
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
      updateLightLevel(getLightLevelFromX(localX));
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

  const sliderX = getXFromLightLevel(lightLevel);

  const customPins = [
    { id: 'pin1', label: 'Pin 1', position: { x: 60, y: 130 } },
    { id: 'pin2', label: 'Pin 2', position: { x: 80, y: 130 } },
  ];

  return (
    <BaseCircuitNode {...props} width={viewWidth} height={viewHeight} pins={customPins}>
      <svg
        ref={svgRef}
        width={viewWidth}
        height={viewHeight}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        aria-label="Photoresistor"
        style={{ overflow: 'visible' }}
        onClick={() => setShowSlider((prev) => !prev)}
      >
        {/* Glow behind the photoresistor component depending on light fraction */}
        <defs>
          <radialGradient id={`ldr-glow-${props.id}`} cx="50%" cy="50%" r="58%">
            <stop offset="0%" stopColor="#fff7a8" stopOpacity={0.8 * Math.min(1, lightFraction)} />
            <stop offset="100%" stopColor="#facc15" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* --- PREMIUM HORIZONTAL DRAGGABLE SLIDER OVERLAY (TOP) --- */}
        {isSimulating && showSlider && (
          <g onClick={(e) => e.stopPropagation()}>
            {/* Left solid dark circle (representing darkness) */}
            <circle cx="15" cy="30" r="7" fill="#2c3e50" />

            {/* Rounded pill track (white background, thick dark outline) */}
            <rect
              x="30"
              y="20"
              width="80"
              height="20"
              rx="10"
              fill="#ffffff"
              stroke="#2c3e50"
              strokeWidth="2.5"
            />

            {/* Small arrow inside the track */}
            <text x="54" y="34" fontSize="13" fill="#2c3e50" fontWeight="bold" style={{ userSelect: 'none' }}>
              ➔
            </text>

            {/* Draggable large dark circle handle */}
            <circle
              cx={sliderX}
              cy={30}
              r="10"
              fill="#2c3e50"
              style={{ cursor: dragging ? 'grabbing' : 'grab' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setDragging(true);
              }}
            />

            {/* Right sun icon (representing brightness) */}
            <g>
              <circle cx="125" cy="30" r="6" fill="none" stroke="#2c3e50" strokeWidth="2.5" />
              <g stroke="#2c3e50" strokeWidth="2.5" strokeLinecap="round">
                <line x1="125" y1="17" x2="125" y2="20" />
                <line x1="125" y1="40" x2="125" y2="43" />
                <line x1="112" y1="30" x2="115" y2="30" />
                <line x1="135" y1="30" x2="138" y2="30" />
                <line x1="116" y1="21" x2="118" y2="23" />
                <line x1="132" y1="37" x2="134" y2="39" />
                <line x1="116" y1="39" x2="118" y2="37" />
                <line x1="132" y1="23" x2="134" y2="21" />
              </g>
            </g>
          </g>
        )}

        {/* --- PHOTORESISTOR HARDWARE GRAPHIC (CENTERED UNDERNEATH) --- */}
        <g>
          {/* Silver/Blue Contact Legs */}
          <line x1="60" y1="108" x2="60" y2="130" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" />
          <line x1="80" y1="108" x2="80" y2="130" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" />

          {/* Light Glow effect centered on the LDR */}
          <circle cx="70" cy="95" r="28" fill={`url(#ldr-glow-${props.id})`} />

          {/* Outer Blue Ring Chassis */}
          <circle cx="70" cy="95" r="20" fill="#3b82f6" stroke="#2563eb" strokeWidth="2.5" />

          {/* Inner Light-Cream Face Plate */}
          <circle cx="70" cy="95" r="16" fill="#e8ebd8" stroke="#b45309" strokeWidth="1.5" />

          {/* Draggable serpentine track lines */}
          <path
            d="M 59 86 L 79 86 A 2.5 2.5 0 0 1 79 91 L 61 91 A 2.5 2.5 0 0 0 61 96 L 79 96 A 2.5 2.5 0 0 1 79 101 L 59 101"
            fill="none"
            stroke="#b45309"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Subtle details dots inside faceplate
          <circle cx="59" cy="95" r="2" fill="#cbd5e1" />
          <circle cx="81" cy="95" r="2" fill="#cbd5e1" /> */}
        </g>

        {/* Value Label Box */}
        <text x="70" y="145" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#475569" style={{ userSelect: 'none' }}>
          {lightLevel} | {resistanceLabel}Ω
        </text>
      </svg>
    </BaseCircuitNode>
  );
}
