'use client';

import { type NodeProps } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { refreshSimulationFrameFromCurrentCircuit, useCircuitStore } from '@cs/lib/store';
import type { CircuitNode, PropertyDefinition } from '@cs/lib/types';

type KnobKind = 'voltage' | 'current';

const KNOBS: Record<KnobKind, { x: number; y: number; min: number; max: number }> = {
  voltage: { x: 95, y: 27, min: 0, max: 30 },
  current: { x: 95, y: 61, min: 0, max: 5 },
};

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

function valueToDegrees(kind: KnobKind, value: number) {
  const knob = KNOBS[kind];
  const unit = (clamp(value, knob.min, knob.max) - knob.min) / (knob.max - knob.min);
  return -135 + unit * 270;
}

function unitToValue(kind: KnobKind, unit: number) {
  const knob = KNOBS[kind];
  const value = knob.min + clamp(unit, 0, 1) * (knob.max - knob.min);
  return Number(value.toFixed(kind === 'current' ? 1 : 1));
}

function angleToUnit(event: PointerEvent | React.PointerEvent<HTMLElement>, element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI) + 90;
  const normalized = angle < -180 ? angle + 360 : angle > 180 ? angle - 360 : angle;
  return clamp((normalized + 135) / 270, 0, 1);
}

export function PowerSupplyNode(props: NodeProps<CircuitNode>) {
  const definition = getComponentDefinition(props.data.componentType || props.type || 'powerSupply')!;
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const properties = props.data.properties;
  const enabled = propertyValue(properties, 'enabled', 'off') === 'on';
  const voltage = Number(propertyValue(properties, 'voltage', 5));
  const current = Number(propertyValue(properties, 'current', 1));

  useEffect(() => {
    let active = true;
    fetch('/parts/power-supply.svg')
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
    if (!isSimulating) return;
    setProperties({ enabled: enabled ? 'off' : 'on' });
  };

  const handleKnobPointerDown = (event: React.PointerEvent<HTMLButtonElement>, kind: KnobKind) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isSimulating) return;

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
        '--ps-voltage-deg': `${valueToDegrees('voltage', voltage)}deg`,
        '--ps-current-deg': `${valueToDegrees('current', current)}deg`,
      }) as React.CSSProperties,
    [current, voltage]
  );

  return (
    <BaseCircuitNode {...props} width={definition.defaultWidth} height={definition.defaultHeight} pins={definition.pins}>
      <div className="power-supply-shell" data-enabled={enabled ? 'on' : 'off'} style={knobStyles}>
        {svgMarkup ? (
          <div className="power-supply-svg" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
        ) : (
          <img
            src="/parts/power-supply.svg"
            alt=""
            draggable={false}
            style={{ width: definition.defaultWidth, height: definition.defaultHeight, display: 'block' }}
          />
        )}

        <div className="ps-readout ps-voltage">{enabled ? voltage.toFixed(1) : '0.0'} V</div>
        <div className="ps-readout ps-current">{enabled ? current.toFixed(1) : '0.0'} A</div>

        {(Object.keys(KNOBS) as KnobKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            className="ps-hotspot ps-knob"
            aria-label={kind}
            disabled={!isSimulating}
            onPointerDown={(event) => handleKnobPointerDown(event, kind)}
            style={{ left: KNOBS[kind].x - 15, top: KNOBS[kind].y - 15 }}
          />
        ))}

        <button
          type="button"
          className="ps-hotspot ps-power"
          aria-label="Power"
          disabled={!isSimulating}
          onPointerDown={handlePower}
        />
      </div>

      <style jsx>{`
        .power-supply-shell {
          position: relative;
          width: ${definition.defaultWidth}px;
          height: ${definition.defaultHeight}px;
          user-select: none;
        }

        .power-supply-svg,
        .power-supply-svg :global(svg) {
          width: ${definition.defaultWidth}px;
          height: ${definition.defaultHeight}px;
          display: block;
          overflow: visible;
        }

        .power-supply-svg :global(.cgfx__potentiometer-voltage .cgfx__knob) {
          transform: rotate(var(--ps-voltage-deg));
          transform-box: fill-box;
          transform-origin: center;
        }

        .power-supply-svg :global(.cgfx__potentiometer-current .cgfx__knob) {
          transform: rotate(var(--ps-current-deg));
          transform-box: fill-box;
          transform-origin: center;
        }

        .power-supply-shell :global(.cgfx__powerbtn .cgfx__toggle-on) {
          display: none;
        }

        .power-supply-shell[data-enabled='on'] :global(.cgfx__powerbtn .cgfx__toggle-off) {
          display: none;
        }

        .power-supply-shell[data-enabled='on'] :global(.cgfx__powerbtn .cgfx__toggle-on) {
          display: inline;
        }

        .ps-readout {
          position: absolute;
          left: 15px;
          width: 59px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #263536;
          font-family: Arial, sans-serif;
          font-weight: 700;
          font-size: 10px;
          line-height: 1;
          pointer-events: none;
        }

        .ps-voltage {
          top: 15px;
        }

        .ps-current {
          top: 48px;
        }

        .ps-hotspot {
          position: absolute;
          z-index: 4;
          border: 0;
          padding: 0;
          background: transparent;
          cursor: pointer;
          touch-action: none;
        }

        .ps-hotspot:disabled {
          cursor: not-allowed;
        }

        .ps-knob {
          width: 30px;
          height: 30px;
          border-radius: 50%;
        }

        .ps-power {
          left: 6px;
          top: 81px;
          width: 24px;
          height: 20px;
          border-radius: 12px;
        }
      `}</style>
    </BaseCircuitNode>
  );
}
