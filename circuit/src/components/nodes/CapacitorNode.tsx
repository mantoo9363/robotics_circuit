import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function CapacitorNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'capacitor')!;
  const cap = props.data.properties?.capacitance?.value ?? 100;
  const unit = String(props.data.properties?.capacitance?.unit ?? '\u00B5F');
  const telemetry = useCircuitStore((state) => state.simulationFrame?.components[props.id]?.telemetry);
  const voltage = Number(telemetry?.voltageAcross ?? 0);
  const charged = Number(telemetry?.chargeLevel ?? 0);
  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <div style={{ position: 'relative', width: def.defaultWidth, height: def.defaultHeight }}>
        {charged > 0 && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 20,
              width: 42,
              height: 42,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(34, 197, 94, ${0.18 + charged * 0.34}) 0 22%, rgba(34, 197, 94, 0) 72%)`,
              filter: 'blur(3px)',
              pointerEvents: 'none',
            }}
          />
        )}
        <img
          src="/parts/capacitor.svg"
          alt="Capacitor"
          width={def.defaultWidth}
          height={def.defaultHeight}
          draggable={false}
          style={{
            width: def.defaultWidth,
            height: def.defaultHeight,
            display: 'block',
            objectFit: 'contain',
            pointerEvents: 'none',
            userSelect: 'none',
            filter: charged > 0 ? `brightness(${1 + charged * 0.25}) saturate(${1 + charged * 0.8})` : undefined,
          }}
        />
        {charged > 0 && (
          <div
            style={{
              position: 'absolute',
              left: 13,
              top: 9,
              width: 28,
              height: 19,
              borderRadius: 999,
              border: '1px solid rgba(34, 197, 94, 0.72)',
              boxShadow: `inset 0 0 ${4 + charged * 8}px rgba(34, 197, 94, 0.45)`,
              opacity: 0.45 + charged * 0.4,
              pointerEvents: 'none',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: -12,
            transform: 'translateX(-50%)',
            fontSize: 8,
            color: '#64748b',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {cap}{unit}{Math.abs(voltage) > 0.05 ? `  ${voltage.toFixed(1)}V` : ''}
        </div>
      </div>
    </BaseCircuitNode>
  );
}
