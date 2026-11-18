import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function LEDRGBNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'ledrgb')!;
  const brightness = useCircuitStore((s) => s.simulationFrame?.components[props.id]?.brightness ?? 0);
  const component = useCircuitStore((s) => s.simulationFrame?.components[props.id]);
  const red = Number(component?.telemetry.red ?? 0);
  const green = Number(component?.telemetry.green ?? 0);
  const blue = Number(component?.telemetry.blue ?? 0);
  const glowing = brightness > 0;

  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <svg width={50} height={70} viewBox="0 0 50 70">
        <defs>
          {glowing && (
            <filter id={`rgbglow-${props.id}`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feFlood floodColor="#ffffff" floodOpacity="0.6" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="shadow" />
              <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>

        {/* Glow aura */}
        {glowing && (
          <ellipse cx="25" cy="30" rx="24" ry="28" fill="#ffffff" opacity={0.12 + brightness * 0.24} />
        )}

        {/* LED body - dome */}
        <ellipse
          cx="25" cy="30" rx="18" ry="22"
          fill={glowing ? '#ffffff' : '#e5e5e5'}
          stroke="#ccc" strokeWidth="1.5"
          opacity={glowing ? 1 : 0.9}
          filter={glowing ? `url(#rgbglow-${props.id})` : undefined}
        />
        {/* RGB color indicators */}
        <circle cx="16" cy="26" r="5" fill="#ef4444" opacity={0.3 + red * 0.7} />
        <circle cx="25" cy="22" r="5" fill="#22c55e" opacity={0.3 + green * 0.7} />
        <circle cx="34" cy="26" r="5" fill="#3b82f6" opacity={0.3 + blue * 0.7} />
        {/* Flat bottom */}
        <line x1="7" y1="48" x2="43" y2="48" stroke="#999" strokeWidth="2" />
        {/* Pin leads */}
        <line x1="8" y1="48" x2="8" y2="70" stroke="#ef4444" strokeWidth="1.5" />
        <line x1="20" y1="48" x2="20" y2="70" stroke="#666" strokeWidth="1.5" />
        <line x1="32" y1="48" x2="32" y2="70" stroke="#22c55e" strokeWidth="1.5" />
        <line x1="44" y1="48" x2="44" y2="70" stroke="#3b82f6" strokeWidth="1.5" />
        {/* Labels */}
        <text x="8" y="67" textAnchor="middle" fontSize="5" fill="#ccc">R</text>
        <text x="20" y="67" textAnchor="middle" fontSize="5" fill="#ccc">G</text>
        <text x="32" y="67" textAnchor="middle" fontSize="5" fill="#ccc">G</text>
        <text x="44" y="67" textAnchor="middle" fontSize="5" fill="#ccc">B</text>
      </svg>
    </BaseCircuitNode>
  );
}
