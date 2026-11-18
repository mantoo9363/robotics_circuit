'use client';

import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { COMPONENT_CATALOG } from '@cs/lib/circuit-components';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

const def = COMPONENT_CATALOG.find((c) => c.type === 'irReceiver')!;

export function IrReceiverNode(props: NodeProps<CircuitNode>) {
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const telemetry = useCircuitStore(
    (state) => state.simulationFrame?.components[props.id]?.telemetry
  );

  const isPowered = isSimulating && telemetry?.isPowered === true;
  const hasSignal = isSimulating && telemetry?.lastCommand !== undefined && telemetry?.lastCommand !== null;

  return (
    <BaseCircuitNode
      {...props}
      width={def?.defaultWidth ?? 90}
      height={def?.defaultHeight ?? 90}
      pins={def?.pins ?? []}
    >
      <div className="flex h-full w-full items-center justify-center bg-transparent select-none pointer-events-none">
        <svg
          width={def?.defaultWidth ?? 90}
          height={def?.defaultHeight ?? 90}
          viewBox="0 0 90 90"
          className="overflow-visible"
        >
          <defs>
            {/* Metallic casing gradient */}
            <linearGradient id={`ir-metal-${props.id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4b5563" />
              <stop offset="30%" stopColor="#9ca3af" />
              <stop offset="70%" stopColor="#6b7280" />
              <stop offset="100%" stopColor="#374151" />
            </linearGradient>

            {/* Dark optical filter lens dome */}
            <radialGradient id={`ir-lens-${props.id}`} cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor={hasSignal ? '#ff4d4d' : '#4a0e17'} />
              <stop offset="60%" stopColor={hasSignal ? '#b30000' : '#1f0407'} />
              <stop offset="100%" stopColor="#0a0102" />
            </radialGradient>

            {/* Signal burst glow filter */}
            <filter id={`ir-glow-${props.id}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 3 Lead wires at the bottom */}
          <rect x="23" y="60" width="4" height="18" fill="#d1d5db" stroke="#6b7280" strokeWidth="0.5" />
          <rect x="43" y="60" width="4" height="18" fill="#d1d5db" stroke="#6b7280" strokeWidth="0.5" />
          <rect x="63" y="60" width="4" height="18" fill="#d1d5db" stroke="#6b7280" strokeWidth="0.5" />

          {/* Main sensor body (rectangular epoxy/metal package) */}
          <rect
            x="15"
            y="12"
            width="60"
            height="50"
            rx="3"
            ry="3"
            fill={`url(#ir-metal-${props.id})`}
            stroke="#1f2937"
            strokeWidth="1.5"
          />

          {/* Metal mesh grid texture over sensor */}
          <line x1="20" y1="20" x2="70" y2="20" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="20" y1="28" x2="70" y2="28" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="20" y1="36" x2="70" y2="36" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="20" y1="44" x2="70" y2="44" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="20" y1="52" x2="70" y2="52" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />

          {/* Central IR photodiode dome lens */}
          <circle
            cx="45"
            cy="35"
            r="14"
            fill={`url(#ir-lens-${props.id})`}
            stroke={hasSignal ? '#ff1a1a' : '#2b0c10'}
            strokeWidth="1.5"
            filter={hasSignal ? `url(#ir-glow-${props.id})` : undefined}
          />

          {/* Power status indicator LED */}
          <circle
            cx="22"
            cy="20"
            r="2"
            fill={isPowered ? '#10b981' : '#374151'}
            stroke="#111827"
            strokeWidth="0.5"
          />

          {/* Sensor label text */}
          <text
            x="45"
            y="57"
            textAnchor="middle"
            fill="#e5e7eb"
            fontSize="7"
            fontFamily="sans-serif"
            fontWeight="bold"
          >
            VS1838B
          </text>

          {/* Pin identification markings */}
          <text x="25" y="72" textAnchor="middle" fill="#9ca3af" fontSize="5" fontFamily="monospace">
            OUT
          </text>
          <text x="45" y="72" textAnchor="middle" fill="#9ca3af" fontSize="5" fontFamily="monospace">
            GND
          </text>
          <text x="65" y="72" textAnchor="middle" fill="#9ca3af" fontSize="5" fontFamily="monospace">
            VCC
          </text>
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
