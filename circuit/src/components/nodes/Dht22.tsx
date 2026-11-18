import { useEffect, useRef, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';
import {
  MIN_DHT22_TEMP,
  MAX_DHT22_TEMP,
  DEFAULT_DHT22_TEMP,
  MIN_DHT22_HUMIDITY,
  MAX_DHT22_HUMIDITY,
  DEFAULT_DHT22_HUMIDITY,
  calculateDht22TempFromRatio,
  calculateDht22HumidityFromRatio,
  updateDht22TemperatureInStore,
  updateDht22HumidityInStore,
} from '@cs/lib/simulation/frameTransformers/dht22';

export function Dht22Node(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'dht22')!;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Property values with fallbacks from functionality module
  const temperature = props.data.properties?.temperature?.value !== undefined
    ? Number(props.data.properties.temperature.value)
    : DEFAULT_DHT22_TEMP;

  const humidity = props.data.properties?.humidity?.value !== undefined
    ? Number(props.data.properties.humidity.value)
    : DEFAULT_DHT22_HUMIDITY;

  const isSimulating = useCircuitStore((state) => state.isSimulating);

  // Live telemetry stream readings
  const telemetryTemperature = useCircuitStore(
    (state) =>
      Number(
        state.simulationFrame?.components?.[props.id]?.telemetry?.temperature ?? temperature
      )
  );

  const telemetryHumidity = useCircuitStore(
    (state) =>
      Number(
        state.simulationFrame?.components?.[props.id]?.telemetry?.humidity ?? humidity
      )
  );

  const safeTemperature = isSimulating ? telemetryTemperature : temperature;
  const safeHumidity = isSimulating ? telemetryHumidity : humidity;

  const [showSliders, setShowSliders] = useState(true);
  const [draggingTemp, setDraggingTemp] = useState(false);
  const [draggingHum, setDraggingHum] = useState(false);

  const toggleSliders = () => {
    setShowSliders((prev) => !prev);
  };

  // Track coordinates for slider rendering
  const trackTempXStart = 32;
  const trackTempXEnd = 110;

  const trackHumXStart = 32;
  const trackHumXEnd = 110;

  // UI Event listener for dragging interaction
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if ((!draggingTemp && !draggingHum) || !svgRef.current) return;

      const svg = svgRef.current;
      const point = svg.createSVGPoint();
      point.x = e.clientX;
      point.y = e.clientY;

      const ctm = svg.getScreenCTM();
      if (!ctm) return;

      const svgPoint = point.matrixTransform(ctm.inverse());

      if (draggingTemp) {
        const clampedX = Math.max(trackTempXStart, Math.min(trackTempXEnd, svgPoint.x));
        const ratio = (clampedX - trackTempXStart) / (trackTempXEnd - trackTempXStart);
        const nextTemp = calculateDht22TempFromRatio(ratio);
        updateDht22TemperatureInStore(props.id, nextTemp);
      }

      if (draggingHum) {
        const clampedX = Math.max(trackHumXStart, Math.min(trackHumXEnd, svgPoint.x));
        const ratio = (clampedX - trackHumXStart) / (trackHumXEnd - trackHumXStart);
        const nextHum = calculateDht22HumidityFromRatio(ratio);
        updateDht22HumidityInStore(props.id, nextHum);
      }
    };

    const up = () => {
      setDraggingTemp(false);
      setDraggingHum(false);
    };

    if (draggingTemp || draggingHum) {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [draggingTemp, draggingHum, props.id]);

  const viewWidth = def?.defaultWidth ?? 140;
  const viewHeight = def?.defaultHeight ?? 205;

  const tempKnobX = trackTempXStart + ((safeTemperature - MIN_DHT22_TEMP) / (MAX_DHT22_TEMP - MIN_DHT22_TEMP)) * (trackTempXEnd - trackTempXStart);
  const humKnobX = trackHumXStart + ((safeHumidity - MIN_DHT22_HUMIDITY) / (MAX_DHT22_HUMIDITY - MIN_DHT22_HUMIDITY)) * (trackHumXEnd - trackHumXStart);

  return (
    <BaseCircuitNode
      {...props}
      width={viewWidth}
      height={viewHeight}
      pins={def?.pins ?? []}
    >
      <div style={{ position: 'relative', width: viewWidth, height: viewHeight }}>
        <svg
          ref={svgRef}
          width={viewWidth}
          height={viewHeight}
          viewBox={`0 -65 ${viewWidth} ${viewHeight + 65}`}
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'block',
            overflow: 'visible',
          }}
        >
          {/* --- INTERACTIVE RANGE SLIDERS UI OVERLAY (ABOVE MODULE) --- */}
          {(isSimulating && showSliders) && (
            <g transform="translate(0, -60)">
              {/* Sliders Container Box */}
              <rect
                x="4"
                y="0"
                width="132"
                height="54"
                rx="6"
                fill="#0f172a"
                stroke="#334155"
                strokeWidth="1.5"
                opacity="0.95"
              />

              {/* === TEMPERATURE SLIDER UI === */}
              <text x="6" y="19" fontSize="8" fill="#f87171" fontWeight="bold" style={{ userSelect: 'none' }}>
                {MIN_DHT22_TEMP}°
              </text>
              <rect
                x={trackTempXStart}
                y="13"
                width={trackTempXEnd - trackTempXStart}
                height="6"
                rx="3"
                fill="#1e293b"
                stroke="#475569"
                strokeWidth="1"
              />
              <rect
                x={trackTempXStart}
                y="13"
                width={Math.max(0, tempKnobX - trackTempXStart)}
                height="6"
                rx="3"
                fill="#ef4444"
              />
              <text x="115" y="19" fontSize="8" fill="#f87171" fontWeight="bold" style={{ userSelect: 'none' }}>
                {MAX_DHT22_TEMP}°
              </text>
              <circle
                cx={tempKnobX}
                cy="16"
                r="7"
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth="1.5"
                style={{ cursor: draggingTemp ? 'grabbing' : 'grab' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDraggingTemp(true);
                }}
              />
              <text
                x={tempKnobX}
                y="7"
                textAnchor="middle"
                fontSize="8"
                fill="#fca5a5"
                fontWeight="bold"
                style={{ userSelect: 'none' }}
              >
                {safeTemperature.toFixed(1)}°C
              </text>

              {/* === HUMIDITY SLIDER UI === */}
              <text x="8" y="44" fontSize="8" fill="#38bdf8" fontWeight="bold" style={{ userSelect: 'none' }}>
                {MIN_DHT22_HUMIDITY}%
              </text>
              <rect
                x={trackHumXStart}
                y="38"
                width={trackHumXEnd - trackHumXStart}
                height="6"
                rx="3"
                fill="#1e293b"
                stroke="#475569"
                strokeWidth="1"
              />
              <rect
                x={trackHumXStart}
                y="38"
                width={Math.max(0, humKnobX - trackHumXStart)}
                height="6"
                rx="3"
                fill="#0284c7"
              />
              <text x="114" y="44" fontSize="8" fill="#38bdf8" fontWeight="bold" style={{ userSelect: 'none' }}>
                {MAX_DHT22_HUMIDITY}%
              </text>
              <circle
                cx={humKnobX}
                cy="41"
                r="7"
                fill="#0284c7"
                stroke="#ffffff"
                strokeWidth="1.5"
                style={{ cursor: draggingHum ? 'grabbing' : 'grab' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDraggingHum(true);
                }}
              />
              <text
                x={humKnobX}
                y="32"
                textAnchor="middle"
                fontSize="8"
                fill="#7dd3fc"
                fontWeight="bold"
                style={{ userSelect: 'none' }}
              >
                {safeHumidity.toFixed(1)}%
              </text>
            </g>
          )}

          {/* --- DHT22 HARDWARE MODULE IMAGE --- */}
          <g onClick={toggleSliders} style={{ cursor: 'pointer' }}>
            <image
              href="/parts/DHT 22 Module.svg"
              x="0"
              y="0"
              width={viewWidth}
              height={viewHeight}
              preserveAspectRatio="xMidYMid meet"
            />
          </g>
        </svg>
      </div>
    </BaseCircuitNode>
  );
}

export const Dht22 = Dht22Node;
