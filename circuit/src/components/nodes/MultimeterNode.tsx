'use client';

import { type NodeProps } from '@xyflow/react';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';
import { BaseCircuitNode } from './BaseCircuitNode';
import { useEffect, useRef } from 'react';

const OHM = '\u03A9';
const MICRO = '\u00B5';

function formatResistance(value: number) {
  const absValue = Math.abs(value);

  if (absValue < 1e-9) {
    return { value: (value * 1e12).toFixed(2), unit: ` p${OHM}` };
  }
  if (absValue < 1e-6) {
    return { value: (value * 1e9).toFixed(2), unit: ` n${OHM}` };
  }
  if (absValue < 1e-3) {
    return { value: (value * 1e6).toFixed(2), unit: ` ${MICRO}${OHM}` };
  }
  if (absValue < 1) {
    return { value: (value * 1000).toFixed(2), unit: ` m${OHM}` };
  }
  if (absValue < 1000) {
    return { value: value.toFixed(2), unit: ` ${OHM}` };
  }
  if (absValue < 1e6) {
    return { value: (value / 1000).toFixed(2), unit: ` k${OHM}` };
  }
  if (absValue < 1e9) {
    return { value: (value / 1e6).toFixed(2), unit: ` M${OHM}` };
  }
  return { value: (value / 1e9).toFixed(2), unit: ` G${OHM}` };
}

export function MultimeterNode(props: NodeProps<CircuitNode>) {
  const definition = getComponentDefinition(props.data.componentType || props.type || 'multimeter')!;
  const frame = useCircuitStore((state) => state.simulationFrame);
  const componentState = frame?.components[props.id];
  const isLive = frame?.running && componentState?.isPowered;

  const telemetry = componentState?.telemetry ?? {};
  const selectedMode = props.data.properties?.mode?.value ?? 'voltage';
  const rawMode =
    selectedMode === 'voltage_ac' || selectedMode === 'current_ac'
      ? selectedMode
      : telemetry.mode ?? selectedMode;
  const isAcMode = rawMode === 'voltage_ac' || rawMode === 'current_ac';
  const mode = rawMode === 'voltage_ac' ? 'voltage' : rawMode === 'current_ac' ? 'current' : rawMode;

  // Web Audio continuity buzzer
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  useEffect(() => {
    if (isLive && mode === 'continuity' && telemetry.continuityActive) {
      try {
        if (!audioCtxRef.current) {
          const AudioContextClass =
            window.AudioContext ||
            (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            audioCtxRef.current = new AudioContextClass();
          }
        }
        const ctx = audioCtxRef.current;
        if (ctx) {
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
          if (!oscRef.current) {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);

            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(0.12, ctx.currentTime);

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.start();
            oscRef.current = osc;
          }
        }
      } catch (e) {
        console.warn('Continuity buzzer error:', e);
      }
    } else {
      if (oscRef.current) {
        try {
          oscRef.current.stop();
          oscRef.current.disconnect();
        } catch (e) {}
        oscRef.current = null;
      }
    }
  }, [isLive, mode, telemetry.continuityActive]);

  useEffect(() => {
    return () => {
      if (oscRef.current) {
        try { oscRef.current.stop(); } catch (e) {}
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
      }
    };
  }, []);

  // Display calculations and auto-ranging
  let displayValue = '--.--';
  let displayUnit = '';
  let displayModeLabel = 'VDC';

  if (isLive) {
    if (telemetry.error) {
      displayValue = String(telemetry.error);
      displayUnit = '';
      if (mode === 'voltage') {
        displayModeLabel = isAcMode ? 'VAC' : 'VDC';
      } else if (mode === 'current') {
        displayModeLabel = isAcMode ? 'AAC' : 'ADC';
      }
    } else if (mode === 'voltage') {
      displayModeLabel = isAcMode ? 'VAC' : 'VDC';
      const val = typeof telemetry.voltage === 'number' ? telemetry.voltage : 0;
      if (Math.abs(val) < 1) {
        displayValue = (val * 1000).toFixed(2);
        displayUnit = ' mV';
      } else {
        displayValue = val.toFixed(2);
        displayUnit = ' V';
      }
    } else if (mode === 'current') {
      displayModeLabel = isAcMode ? 'AAC' : 'ADC';
      if (telemetry.isOverloaded) {
        displayValue = 'OVERLOAD';
        displayUnit = '';
      } else {
        const val = typeof telemetry.current === 'number' ? telemetry.current : 0;
        const absVal = Math.abs(val);
        if (absVal < 1e-3) {
          displayValue = (val * 1e6).toFixed(2);
          displayUnit = ' µA';
        } else if (absVal < 1) {
          displayValue = (val * 1000).toFixed(2);
          displayUnit = ' mA';
        } else {
          displayValue = val.toFixed(2);
          displayUnit = ' A';
        }
      }
    } else if (mode === 'resistance') {
      displayModeLabel = 'OHM';
      const val = telemetry.resistance;
      if (typeof val !== 'number') {
        displayValue = 'OL';
        displayUnit = '';
      } else {
        const formatted = formatResistance(val);
        displayValue = formatted.value;
        displayUnit = formatted.unit;
      }
    } else if (mode === 'continuity') {
      displayModeLabel = 'CONT';
      const val = telemetry.resistance;
      if (typeof val !== 'number') {
        displayValue = 'OL';
        displayUnit = '';
      } else {
        const formatted = formatResistance(val);
        displayValue = val < 50 ? `${formatted.value} •))` : 'OL';
        displayUnit = val < 50 ? formatted.unit : '';
      }
    } else if (mode === 'diode') {
      displayModeLabel = 'DIOD';
      const val = telemetry.diodeValue;
      if (typeof val !== 'number') {
        displayValue = 'OL';
        displayUnit = '';
      } else {
        displayValue = val.toFixed(2);
        displayUnit = ' V';
      }
    }
  } else {
    // Idle modes mapping
    if (mode === 'voltage') {
      displayModeLabel = isAcMode ? 'VAC' : 'VDC';
      displayValue = '--.--';
      displayUnit = ' V';
    } else if (mode === 'current') {
      displayModeLabel = isAcMode ? 'AAC' : 'ADC';
      displayValue = '--.--';
      displayUnit = ' A';
    } else if (mode === 'resistance') {
      displayModeLabel = 'OHM';
      displayValue = '--.--';
      displayUnit = ` ${OHM}`;
    } else if (mode === 'continuity') {
      displayModeLabel = 'CONT';
      displayValue = 'OPEN';
      displayUnit = '';
    } else if (mode === 'diode') {
      displayModeLabel = 'DIOD';
      displayValue = 'OPEN';
      displayUnit = '';
    }
  }

  const displayText = `${displayValue}${displayUnit}`;
  const fontSize = displayText.length > 8 ? 8 : 11;

  return (
    <BaseCircuitNode
      {...props}
      width={definition.defaultWidth}
      height={definition.defaultHeight}
      pins={definition.pins}
    >
      <svg width="120" height="80" viewBox="0 0 120 80" aria-label="Multimeter">
        <defs>
          <linearGradient id={`meter-body-${props.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffc247" />
            <stop offset="1" stopColor="#e59516" />
          </linearGradient>
        </defs>

        <rect x="6" y="8" width="108" height="54" rx="6" fill={`url(#meter-body-${props.id})`} />
        <rect x="11" y="13" width="98" height="44" rx="4" fill="none" stroke="#8f5f13" strokeOpacity="0.35" />
        <rect x="11" y="17" width="78" height="28" rx="3" fill="#263137" />
        <rect x="14" y="20" width="72" height="22" rx="2" fill="#d8edf2" opacity="0.92" />

        <text x="82" y="11" textAnchor="middle" fill="#5b3a0c" fontSize="8" fontFamily="Arial" fontWeight="700">
          {displayModeLabel}
        </text>
        <text x="83" y="36" textAnchor="end" fill="#31454c" fontSize={fontSize} fontFamily="Courier, monospace" fontWeight="700">
          {displayText}
        </text>

        <g transform="translate(99 31)">
          <circle r="10" fill="#4b5563" />
          <circle r="5" fill="#20292f" />
          <line x1="0" y1="0" x2="5" y2="-6" stroke="#d1d5db" strokeWidth="1.4" strokeLinecap="round" />
        </g>

        <path d="M42 61h36" stroke="#4b5563" strokeWidth="4" strokeLinecap="round" />
        <path d="M55 40v28" stroke="#111827" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M65 40v28" stroke="#b91c1c" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="55" cy="40" r="4" fill="#111827" stroke="#020617" />
        <circle cx="65" cy="40" r="4" fill="#b91c1c" stroke="#7f1d1d" />
        <text x="49" y="55" fill="#111827" fontSize="8" fontFamily="Arial" fontWeight="700">-</text>
        <text x="69" y="55" fill="#7f1d1d" fontSize="8" fontFamily="Arial" fontWeight="700">+</text>
        <circle cx="99" cy="51" r="3.5" fill={isLive ? '#22c55e' : '#94a3b8'} />
      </svg>
    </BaseCircuitNode>
  );
}
