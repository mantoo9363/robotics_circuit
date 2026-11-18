import { useEffect, useMemo, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition, useDynamicComponentsStore } from '@cs/store/useDynamicComponentsStore';
import { COMPONENT_CATALOG } from '@cs/lib/circuit-components';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

const defaultCatalogDef = COMPONENT_CATALOG.find((c) => c.type === 'relaySpst')!;

let cachedSvgPromise: Promise<string | null> | null = null;
let cachedSvgText: string | null = null;

function loadRelaySvg(): Promise<string | null> {
  if (cachedSvgText) return Promise.resolve(cachedSvgText);
  if (!cachedSvgPromise) {
    cachedSvgPromise = fetch('/parts/relay-spst.svg')
      .then((res) => (res.ok ? res.text() : null))
      .then((text) => {
        cachedSvgText = text;
        return text;
      })
      .catch(() => null);
  }
  return cachedSvgPromise;
}

/**
 * SPST Relay node component.
 * Electromagnetically actuated by Arduino / Raspberry Pi Pico code and circuit signals.
 * Dynamically moves the armature wire between NC and NO.
 */
export function SpstRelayNode(props: NodeProps<CircuitNode>) {
  const dynamicComponents = useDynamicComponentsStore((state) => state.components);
  const def =
    getComponentDefinition(props.data.componentType || props.type || 'relaySpst', dynamicComponents) ??
    defaultCatalogDef;

  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const componentState = useCircuitStore(
    (state) => state.simulationFrame?.components?.[props.id]
  );

  // Relay is electromagnetically controlled by circuit voltage and microcontroller code execution
  const isPowered =
    componentState?.isPowered === true || (componentState?.brightness ?? 0) > 0.01;
  const energised = isSimulating && isPowered;

  const vCoil = Number(componentState?.telemetry?.vCoil ?? 0);
  const iCoil = Number(componentState?.telemetry?.iCoil ?? 0);
  const pCoil = Number(componentState?.telemetry?.pCoil ?? 0);

  const [rawSvg, setRawSvg] = useState<string | null>(cachedSvgText);

  useEffect(() => {
    let cancelled = false;
    if (!cachedSvgText) {
      loadRelaySvg().then((text) => {
        if (!cancelled && text) {
          setRawSvg(text);
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const processedSvg = useMemo(() => {
    if (!rawSvg) return null;

    const is6Display = energised ? 'none' : 'inline';
    const is7Display = energised ? 'inline' : 'none';

    return rawSvg
      .replace(
        /<svg\b([^>]*)>/,
        '<svg width="100%" height="100%" style="display:block;width:100%;height:100%;" $1>'
      )
      .replace(
        /(class="cgfx__switch-6connected"[^>]*display=")[^"]*(")/,
        `$1${is6Display}$2`
      )
      .replace(
        /(class="cgfx__switch-7connected"[^>]*display=")[^"]*(")/,
        `$1${is7Display}$2`
      );
  }, [rawSvg, energised]);

  return (
    <BaseCircuitNode
      {...props}
      width={def.defaultWidth}
      height={def.defaultHeight}
      pins={def.pins}
    >
      <div
        data-node-id={props.id}
        className="spst-relay-shell"
        style={{
          position: 'relative',
          width: def.defaultWidth,
          height: def.defaultHeight,
          cursor: 'default',
        }}
      >
        {processedSvg ? (
          <div
            className="spst-relay-svg"
            style={{
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
            dangerouslySetInnerHTML={{ __html: processedSvg }}
          />
        ) : (
          <svg
            width={def.defaultWidth}
            height={def.defaultHeight}
            viewBox="-70 -50 140 100"
            style={{ display: 'block', width: '100%', height: '100%' }}
          >
            <rect
              x="-29.5"
              y="-20"
              width="59"
              height="40"
              rx="1"
              fill="#333333"
              stroke="#262626"
            />
          </svg>
        )}

        {/* Coil status LED indicator */}
        <div
          title={
            !isSimulating
              ? 'Simulation Stopped (Controlled by Arduino / Pico Code / Circuit)'
              : energised
                ? `Coil Energised by Code/Circuit (Vcoil: ${vCoil.toFixed(2)}V, Icoil: ${(iCoil * 1000).toFixed(1)}mA, Pcoil: ${(pCoil * 1000).toFixed(1)}mW) -> Armature Closed (COM <-> NO)`
                : `Coil De-energised (Vcoil: ${vCoil.toFixed(2)}V) -> Armature Open (COM <-> NC)`
          }
          style={{
            position: 'absolute',
            top: 32,
            left: 42,
            width: 5,
            height: 5,
            borderRadius: '50%',
            backgroundColor: energised ? '#22c55e' : '#52525b',
            boxShadow: energised ? '0 0 6px #22c55e' : 'none',
            transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
            pointerEvents: 'none',
          }}
        />
      </div>

      <style jsx>{`
        .spst-relay-shell {
          user-select: none;
        }
        .spst-relay-svg,
        .spst-relay-svg :global(svg) {
          width: 100%;
          height: 100%;
          display: block;
        }
      `}</style>
    </BaseCircuitNode>
  );
}
