'use client';

import { type NodeProps } from '@xyflow/react';
import { useEffect, useMemo } from 'react';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';
import { BaseCircuitNode } from './BaseCircuitNode';

const HISTORY_LENGTH = 88;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getNumberProperty(data: CircuitNode['data'], key: string, fallback: number) {
  const value = data.properties?.[key]?.value;
  return typeof value === 'number' ? value : fallback;
}

function getTelemetryNumber(
  telemetry: Record<string, number | string | boolean> | undefined,
  key: string,
  fallback: number
) {
  const value = telemetry?.[key];
  return typeof value === 'number' ? value : fallback;
}

function getWaveSample(waveform: string, phase: number) {
  const cycle = phase - Math.floor(phase);
  if (waveform === 'Square') return cycle < 0.5 ? 1 : -1;
  if (waveform === 'Triangle') return 1 - 4 * Math.abs(cycle - 0.5);
  return Math.sin(cycle * Math.PI * 2);
}

function formatFrequency(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}MHz`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}kHz`;
  return `${Math.round(value)}Hz`;
}

const nodeHistories = new Map<string, number[]>();
const nodeLastTicks = new Map<string, number | undefined>();

export function OscilloscopeNode(props: NodeProps<CircuitNode>) {
  const definition = getComponentDefinition(props.data.componentType || props.type || 'oscilloscope')!;
  const frame = useCircuitStore((state) => state.simulationFrame);


  const componentState = frame?.components[props.id];
  const signalVoltage =
    typeof componentState?.telemetry.signalVoltage === 'number'
      ? componentState.telemetry.signalVoltage
      : 0;
  const signalNormalized =
    typeof componentState?.telemetry.signalNormalized === 'number'
      ? componentState.telemetry.signalNormalized
      : 0;
  const groundConnected = componentState?.telemetry.groundConnected === true;
  const sourceLabel =
    typeof componentState?.telemetry.source === 'string'
      ? componentState.telemetry.source
      : 'NO SIGNAL';
  const signalSourceType =
    typeof componentState?.telemetry.signalSourceType === 'string'
      ? componentState.telemetry.signalSourceType
      : '';
  const functionGeneratorConnected = signalSourceType === 'functionGenerator';
  const powerSupplyConnected = signalSourceType === 'powerSupply';
  const waveform =
    typeof componentState?.telemetry.waveform === 'string'
      ? componentState.telemetry.waveform
      : 'Sine';
  const frequency = getTelemetryNumber(componentState?.telemetry, 'frequency', 0);
  const amplitude = getTelemetryNumber(componentState?.telemetry, 'amplitude', 0);
  const offset = getTelemetryNumber(componentState?.telemetry, 'offset', 0);
  const supplyVoltage = getTelemetryNumber(componentState?.telemetry, 'supplyVoltage', signalVoltage);
  const supplyCurrent = getTelemetryNumber(componentState?.telemetry, 'supplyCurrent', 0);
  const generatorEnabled = componentState?.telemetry.enabled === true;
  const voltsPerDiv = getNumberProperty(props.data, 'voltsPerDiv', 1);
  const timeScale = getNumberProperty(props.data, 'timeScale', 1);
  const screenWidth = 102;
  const screenHeight = 72;
  const screenX = 18;
  const screenY = 18;
  const centerY = screenY + screenHeight / 2;

  // Sync history when simulation tick changes
  if (!nodeHistories.has(props.id)) {
    nodeHistories.set(props.id, Array(HISTORY_LENGTH).fill(0.5));
  }
  const lastRenderedTick = nodeLastTicks.get(props.id);

  if (frame && frame.tick !== lastRenderedTick) {
    nodeLastTicks.set(props.id, frame.tick);
    const normalized = frame.running ? signalNormalized : 0;
    const historyData = nodeHistories.get(props.id)!;
    nodeHistories.set(props.id, [...historyData.slice(1), clamp01(normalized)]);
  } else if (!frame && lastRenderedTick !== undefined) {
    nodeLastTicks.set(props.id, undefined);
    const historyData = nodeHistories.get(props.id)!;
    nodeHistories.set(props.id, [...historyData.slice(1), 0]);
  }

  const history = nodeHistories.get(props.id)!;

  useEffect(() => {
    return () => {
      nodeHistories.delete(props.id);
      nodeLastTicks.delete(props.id);
    };
  }, [props.id]);

  const waveformPoints = useMemo(() => {
    if (frame?.running && powerSupplyConnected) {
      const samples = 96;
      const currentUnit = clamp(supplyCurrent / 5, 0, 1);
      const y = screenY + screenHeight - 6 - currentUnit * (screenHeight - 12);

      return Array.from({ length: samples }, (_, index) => {
        const unit = index / (samples - 1);
        const x = screenX + 4 + unit * (screenWidth - 8);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
    }

    if (frame?.running && functionGeneratorConnected) {
      const samples = 96;
      const frequencyFactor = frequency > 0 ? Math.log10(frequency) / 6 : 0;
      const visibleCycles = clamp((0.35 + frequencyFactor * 5.8) / Math.max(0.5, timeScale), 0.25, 8);
      const phaseOffset = ((frame.timestamp / 1000) * Math.min(frequency, 60)) % 1;
      const verticalScale = Math.max(0.1, voltsPerDiv) * 4;
      const outputAmplitude = generatorEnabled ? amplitude : 0;
      const outputOffset = generatorEnabled ? offset : 0;

      return Array.from({ length: samples }, (_, index) => {
        const unit = index / (samples - 1);
        const wave = getWaveSample(waveform, unit * visibleCycles + phaseOffset);
        const voltage = outputOffset + wave * outputAmplitude;
        const x = screenX + 4 + unit * (screenWidth - 8);
        const y = centerY - (voltage / verticalScale) * (screenHeight / 2 - 7);
        return `${x.toFixed(1)},${clamp(y, screenY + 4, screenY + screenHeight - 4).toFixed(1)}`;
      }).join(' ');
    }

    const gain = Math.max(0.2, Math.min(5, 1 / Math.max(0.1, voltsPerDiv)));
    const skip = Math.max(1, Math.round(timeScale));
    const samples = history.filter((_, index) => index % skip === 0);
    const visibleSamples = samples.length > 1 ? samples : history.slice(-2);

    return visibleSamples
      .map((value, index) => {
        const x = screenX + 4 + (index / Math.max(1, visibleSamples.length - 1)) * (screenWidth - 8);
        const centered = (value - 0.5) * gain;
        const y = centerY - centered * (screenHeight - 14);
        return `${x.toFixed(1)},${Math.max(screenY + 4, Math.min(screenY + screenHeight - 4, y)).toFixed(1)}`;
      })
      .join(' ');
  }, [
    amplitude,
    centerY,
    frame?.running,
    frame?.timestamp,
    frequency,
    functionGeneratorConnected,
    generatorEnabled,
    history,
    offset,
    powerSupplyConnected,
    timeScale,
    supplyCurrent,
    voltsPerDiv,
    waveform,
  ]);

  return (
    <BaseCircuitNode
      {...props}
      width={definition.defaultWidth}
      height={definition.defaultHeight}
      pins={definition.pins}
    >
      <svg width="180" height="140" viewBox="0 0 180 140" aria-label="Oscilloscope">
        <defs>
          <linearGradient id={`scope-body-${props.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffc34b" />
            <stop offset="1" stopColor="#e89a16" />
          </linearGradient>
          <filter id={`scope-glow-${props.id}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="7" y="7" width="166" height="116" rx="8" fill={`url(#scope-body-${props.id})`} />
        <rect x="12" y="12" width="156" height="106" rx="5" fill="none" stroke="#9a6415" strokeOpacity="0.35" />

        <rect x="15" y="15" width="111" height="80" rx="4" fill="#263137" />
        <rect x={screenX} y={screenY} width={screenWidth} height={screenHeight} rx="2" fill="#d8edf2" />
        <g stroke="#58777f" strokeWidth="0.55" opacity="0.55">
          {[1, 2, 3, 4].map((line) => (
            <line
              key={`h-${line}`}
              x1={screenX}
              y1={screenY + (line * screenHeight) / 5}
              x2={screenX + screenWidth}
              y2={screenY + (line * screenHeight) / 5}
            />
          ))}
          {[1, 2, 3, 4].map((line) => (
            <line
              key={`v-${line}`}
              x1={screenX + (line * screenWidth) / 5}
              y1={screenY}
              x2={screenX + (line * screenWidth) / 5}
              y2={screenY + screenHeight}
            />
          ))}
          <line x1={screenX} y1={centerY} x2={screenX + screenWidth} y2={centerY} strokeOpacity="0.8" />
        </g>
        <polyline
          points={waveformPoints}
          fill="none"
          stroke={frame?.running ? '#0ea5e9' : '#64748b'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={frame?.running ? `url(#scope-glow-${props.id})` : undefined}
        />

        <text x="22" y="32" fill="#2f4d55" fontSize="8" fontFamily="Arial" fontWeight="700">
          {frame?.running ? 'RUN' : 'IDLE'}
        </text>
        <text x="22" y="88" fill="#2f4d55" fontSize="8" fontFamily="Arial" fontWeight="700">
          {functionGeneratorConnected
            ? `${generatorEnabled ? amplitude.toFixed(1) : '0.0'}V`
            : powerSupplyConnected
              ? `${supplyVoltage.toFixed(1)}V`
              : `${signalVoltage.toFixed(2)}V`}
        </text>

        <g fontFamily="Arial" fontSize="6.5" fill="#4b5563" fontWeight="700">
          <text x="136" y="21">VOLTS</text>
          <text x="137" y="63">TIME</text>
          <text x="136" y="105">{sourceLabel}</text>
        </g>

        <rect x="136" y="25" width="24" height="15" rx="3" fill="#374148" />
        <text x="148" y="35" textAnchor="middle" fill="#e2e8f0" fontSize="8" fontFamily="Arial" fontWeight="700">
          {voltsPerDiv}V
        </text>
        <rect x="136" y="67" width="24" height="15" rx="3" fill="#374148" />
        <text x="148" y="77" textAnchor="middle" fill="#e2e8f0" fontSize="8" fontFamily="Arial" fontWeight="700">
          {timeScale}x
        </text>
        {functionGeneratorConnected && (
          <g fontFamily="Arial" fontWeight="700">
            <text x="22" y="43" fill="#2f4d55" fontSize="7">
              {waveform.toUpperCase()}
            </text>
            <text x="22" y="53" fill="#2f4d55" fontSize="7">
              {formatFrequency(frequency)}
            </text>
            <text x="22" y="63" fill="#2f4d55" fontSize="7">
              {generatorEnabled ? `OFF ${offset >= 0 ? '+' : ''}${offset.toFixed(1)}V` : 'OUTPUT OFF'}
            </text>
          </g>
        )}
        {powerSupplyConnected && (
          <g fontFamily="Arial" fontWeight="700">
            <text x="22" y="43" fill="#2f4d55" fontSize="7">
              CURRENT
            </text>
            <text x="22" y="53" fill="#2f4d55" fontSize="7">
              {supplyCurrent.toFixed(1)} A
            </text>
            <text x="22" y="63" fill="#2f4d55" fontSize="7">
              {supplyVoltage.toFixed(1)} V
            </text>
          </g>
        )}
        <circle cx="148" cy="51" r="9" fill="#4b5563" />
        <circle cx="148" cy="51" r="4" fill="#20292f" />
        <line x1="148" y1="51" x2="153" y2="45" stroke="#d1d5db" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="148" cy="93" r="9" fill="#4b5563" />
        <circle cx="148" cy="93" r="4" fill="#20292f" />
        <line x1="148" y1="93" x2="143" y2="86" stroke="#d1d5db" strokeWidth="1.4" strokeLinecap="round" />

        <path d="M42 116h96" stroke="#4b5563" strokeWidth="4" strokeLinecap="round" />
        <circle cx="82" cy="132" r="5" fill="#b91c1c" stroke="#7f1d1d" />
        <circle cx="110" cy="132" r="5" fill={groundConnected ? '#111827' : '#64748b'} stroke="#1f2937" />
        <text x="75" y="128" fill="#7f1d1d" fontSize="7" fontFamily="Arial" fontWeight="700">SIG</text>
        <text x="103" y="128" fill="#111827" fontSize="7" fontFamily="Arial" fontWeight="700">GND</text>
      </svg>
    </BaseCircuitNode>
  );
}
