'use client';

import { type NodeProps } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { refreshSimulationFrameFromCurrentCircuit, useCircuitStore } from '@cs/lib/store';
import type { CircuitNode, PropertyDefinition } from '@cs/lib/types';

type KnobKind = 'frequency' | 'amplitude' | 'offset';
type Waveform = 'Sine' | 'Square' | 'Triangle';

const KNOBS: Record<KnobKind, { x: number; y: number; min: number; max: number; log?: boolean }> = {
  frequency: { x: 96, y: 27, min: 1, max: 1000000, log: true },
  amplitude: { x: 96, y: 61, min: 0, max: 10 },
  offset: { x: 96, y: 95, min: -5, max: 5 },
};

const WAVEFORMS: Array<{ value: Waveform; x: number; y: number }> = [
  { value: 'Square', x: 131, y: 27 },
  { value: 'Sine', x: 156, y: 27 },
  { value: 'Triangle', x: 181, y: 27 },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function propertyValue(
  properties: CircuitNode['data']['properties'],
  key: string,
  fallback: string | number
) {
  return properties[key]?.value ?? fallback;
}

function valueToUnit(kind: KnobKind, value: number) {
  const knob = KNOBS[kind];
  const clamped = clamp(value, knob.min, knob.max);
  if (knob.log) {
    return (Math.log10(clamped) - Math.log10(knob.min)) / (Math.log10(knob.max) - Math.log10(knob.min));
  }
  return (clamped - knob.min) / (knob.max - knob.min);
}

function unitToValue(kind: KnobKind, unit: number) {
  const knob = KNOBS[kind];
  const clampedUnit = clamp(unit, 0, 1);
  if (knob.log) {
    const value = 10 ** (Math.log10(knob.min) + clampedUnit * (Math.log10(knob.max) - Math.log10(knob.min)));
    return Math.round(value);
  }
  const decimals = kind === 'offset' || kind === 'amplitude' ? 1 : 0;
  return Number((knob.min + clampedUnit * (knob.max - knob.min)).toFixed(decimals));
}

function valueToDegrees(kind: KnobKind, value: number) {
  return -135 + valueToUnit(kind, value) * 270;
}

function angleToUnit(event: PointerEvent | React.PointerEvent<HTMLElement>, element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI) + 90;
  const normalized = angle < -180 ? angle + 360 : angle > 180 ? angle - 360 : angle;
  return clamp((normalized + 135) / 270, 0, 1);
}

function formatFrequency(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)} MHz`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} kHz`;
  return `${Math.round(value)} Hz`;
}

export function FunctionGeneratorNode(props: NodeProps<CircuitNode>) {
  const definition = getComponentDefinition(props.data.componentType || props.type || 'functionGenerator')!;
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const properties = props.data.properties;
  const enabled = propertyValue(properties, 'enabled', 'off') === 'on';
  const waveform = String(propertyValue(properties, 'waveform', 'Sine')) as Waveform;
  const frequency = Number(propertyValue(properties, 'frequency', 1000));
  const amplitude = Number(propertyValue(properties, 'amplitude', 5));
  const offset = Number(propertyValue(properties, 'offset', 0));
  const isLive = isSimulating;

  useEffect(() => {
    let active = true;
    fetch('/parts/function-generator.svg')
      .then((response) => response.text())
      .then((markup) => {
        if (active) setSvgMarkup(markup);
      })
      .catch(() => {
        if (active) setSvgMarkup(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const setProperties = (updates: Record<string, string | number>) => {
    useCircuitStore.setState((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== props.id) return node;
        const nextProperties = { ...node.data.properties };
        for (const [key, value] of Object.entries(updates)) {
          const previous = nextProperties[key] ?? definition.defaultProperties[key];
          nextProperties[key] = {
            ...previous,
            value,
          } as PropertyDefinition;
        }
        return {
          ...node,
          data: {
            ...node.data,
            properties: nextProperties,
          },
        };
      }),
    }));
    refreshSimulationFrameFromCurrentCircuit();
  };

  const handlePower = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isLive) return;
    setProperties({ enabled: enabled ? 'off' : 'on' });
  };

  const handleWaveform = (event: React.PointerEvent<HTMLButtonElement>, nextWaveform: Waveform) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isLive) return;
    setProperties({ waveform: nextWaveform });
  };

  const handleKnobPointerDown = (event: React.PointerEvent<HTMLButtonElement>, kind: KnobKind) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isLive) return;

    const target = event.currentTarget;
    const applyPointer = (pointerEvent: PointerEvent | React.PointerEvent<HTMLButtonElement>) => {
      setProperties({ [kind]: unitToValue(kind, angleToUnit(pointerEvent, target)) });
    };

    applyPointer(event);

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();
      applyPointer(pointerEvent);
    };
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const knobStyles = useMemo(
    () =>
      ({
        '--fg-frequency-deg': `${valueToDegrees('frequency', frequency)}deg`,
        '--fg-amplitude-deg': `${valueToDegrees('amplitude', amplitude)}deg`,
        '--fg-offset-deg': `${valueToDegrees('offset', offset)}deg`,
      }) as React.CSSProperties,
    [amplitude, frequency, offset]
  );

  return (
    <BaseCircuitNode {...props} width={definition.defaultWidth} height={definition.defaultHeight} pins={definition.pins}>
      <div
        className="function-generator-shell"
        data-enabled={enabled ? 'on' : 'off'}
        data-waveform={waveform.toLowerCase()}
        style={knobStyles}
      >
        {svgMarkup ? (
          <div className="function-generator-svg" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
        ) : (
          <img
            src="/parts/function-generator.svg"
            alt=""
            draggable={false}
            style={{ width: definition.defaultWidth, height: definition.defaultHeight, display: 'block' }}
          />
        )}

        <div className="fg-readout fg-frequency">{formatFrequency(frequency)}</div>
        <div className="fg-readout fg-amplitude">{amplitude.toFixed(1)} V</div>
        <div className="fg-readout fg-offset">{offset >= 0 ? '+' : ''}{offset.toFixed(1)} V</div>

        {(Object.keys(KNOBS) as KnobKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            className="fg-hotspot fg-knob"
            aria-label={kind}
            disabled={!isLive}
            onPointerDown={(event) => handleKnobPointerDown(event, kind)}
            style={{ left: KNOBS[kind].x - 15, top: KNOBS[kind].y - 15 }}
          />
        ))}

        {WAVEFORMS.map((button) => (
          <button
            key={button.value}
            type="button"
            className="fg-hotspot fg-button"
            aria-label={button.value}
            disabled={!isLive}
            onPointerDown={(event) => handleWaveform(event, button.value)}
            style={{ left: button.x - 12, top: button.y - 12 }}
          />
        ))}

        <button
          type="button"
          className="fg-hotspot fg-power"
          aria-label="Power"
          disabled={!isLive}
          onPointerDown={handlePower}
        />
      </div>

      <style jsx>{`
        .function-generator-shell {
          position: relative;
          width: ${definition.defaultWidth}px;
          height: ${definition.defaultHeight}px;
          user-select: none;
        }

        .function-generator-svg,
        .function-generator-svg :global(svg) {
          width: ${definition.defaultWidth}px;
          height: ${definition.defaultHeight}px;
          display: block;
          overflow: visible;
        }

        .function-generator-svg :global(.cgfx__potentiometer-frequency .cgfx__knob) {
          transform: rotate(var(--fg-frequency-deg));
          transform-box: fill-box;
          transform-origin: center;
        }

        .function-generator-svg :global(.cgfx__potentiometer-amplitude .cgfx__knob) {
          transform: rotate(var(--fg-amplitude-deg));
          transform-box: fill-box;
          transform-origin: center;
        }

        .function-generator-svg :global(.cgfx__potentiometer-dc-offset .cgfx__knob) {
          transform: rotate(var(--fg-offset-deg));
          transform-box: fill-box;
          transform-origin: center;
        }

        .function-generator-shell :global(.cgfx__pressed),
        .function-generator-shell[data-enabled='off'] :global(.cgfx__powerbtn .cgfx__toggle-on),
        .function-generator-shell[data-enabled='on'] :global(.cgfx__powerbtn .cgfx__toggle-off),
        .function-generator-shell[data-waveform='sine'] :global(.cgfx__button-sine .cgfx__up),
        .function-generator-shell[data-waveform='square'] :global(.cgfx__button-square .cgfx__up),
        .function-generator-shell[data-waveform='triangle'] :global(.cgfx__button-triangle .cgfx__up) {
          display: none;
        }

        .function-generator-shell[data-enabled='on'] :global(.cgfx__powerbtn .cgfx__toggle-on),
        .function-generator-shell[data-waveform='sine'] :global(.cgfx__button-sine .cgfx__pressed),
        .function-generator-shell[data-waveform='square'] :global(.cgfx__button-square .cgfx__pressed),
        .function-generator-shell[data-waveform='triangle'] :global(.cgfx__button-triangle .cgfx__pressed) {
          display: inline;
        }

        .fg-readout {
          position: absolute;
          left: 13px;
          width: 61px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #263536;
          font-family: Arial, sans-serif;
          font-weight: 700;
          font-size: 9px;
          line-height: 1;
          pointer-events: none;
        }

        .fg-frequency {
          top: 14px;
        }

        .fg-amplitude {
          top: 48px;
        }

        .fg-offset {
          top: 82px;
        }

        .fg-hotspot {
          position: absolute;
          z-index: 4;
          border: 0;
          padding: 0;
          background: transparent;
          cursor: pointer;
          touch-action: none;
        }

        .fg-hotspot:disabled {
          cursor: not-allowed;
        }

        .fg-knob {
          width: 30px;
          height: 30px;
          border-radius: 50%;
        }

        .fg-button {
          width: 24px;
          height: 24px;
          border-radius: 4px;
        }

        .fg-power {
          left: 10px;
          top: 111px;
          width: 28px;
          height: 22px;
          border-radius: 12px;
        }
      `}</style>
    </BaseCircuitNode>
  );
}
