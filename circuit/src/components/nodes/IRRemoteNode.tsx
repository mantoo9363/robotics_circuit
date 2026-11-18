'use client';

import { useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { COMPONENT_CATALOG } from '@cs/lib/circuit-components';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

const def = COMPONENT_CATALOG.find((c) => c.type === 'irRemote')!;

// Standard NEC Remote 21-Button Codes (Address = 0x00)
export const IR_REMOTE_BUTTON_CODES: Record<string, { code: number; name: string }> = {
  standby: { code: 0x45, name: 'POWER' },
  volplus: { code: 0x46, name: 'VOL+' },
  funcstop: { code: 0x47, name: 'FUNC/STOP' },
  rewind: { code: 0x44, name: 'REWIND' },
  playpauze: { code: 0x40, name: 'PLAY/PAUSE' },
  forward: { code: 0x43, name: 'FAST_FORWARD' },
  down: { code: 0x07, name: 'DOWN' },
  volmin: { code: 0x15, name: 'VOL-' },
  up: { code: 0x09, name: 'UP' },
  num0: { code: 0x16, name: '0' },
  eq: { code: 0x19, name: 'EQ' },
  strept: { code: 0x0d, name: 'ST/REPT' },
  num1: { code: 0x0c, name: '1' },
  num2: { code: 0x18, name: '2' },
  num3: { code: 0x5e, name: '3' },
  num4: { code: 0x08, name: '4' },
  num5: { code: 0x1c, name: '5' },
  num6: { code: 0x5a, name: '6' },
  num7: { code: 0x42, name: '7' },
  num8: { code: 0x52, name: '8' },
  num9: { code: 0x4a, name: '9' },
};

let globalRemoteClickSeq = 0;

export function IRRemoteNode(props: NodeProps<CircuitNode>) {
  const [activeBtn, setActiveBtn] = useState<string | null>(null);

  const handleButtonClick = (btnKey: string) => {
    const btnInfo = IR_REMOTE_BUTTON_CODES[btnKey];
    if (!btnInfo) return;

    setActiveBtn(btnKey);
    setTimeout(() => setActiveBtn(null), 250);

    globalRemoteClickSeq += 1;
    const commandPayload = {
      address: 0x00,
      command: btnInfo.code,
      name: btnInfo.name,
      seq: globalRemoteClickSeq,
      timestamp: Date.now(),
    };

    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((n) =>
        n.id === props.id
          ? {
              ...n,
              data: {
                ...n.data,
                properties: {
                  ...n.data.properties,
                  lastCommand: {
                    label: 'Last Command',
                    type: 'string',
                    value: JSON.stringify(commandPayload),
                  },
                },
              },
            }
          : n
      ),
    }));
  };

  return (
    <BaseCircuitNode
      {...props}
      width={def?.defaultWidth ?? 160}
      height={def?.defaultHeight ?? 240}
      pins={[]}
    >
      <div className="relative w-full h-full select-none cursor-pointer">
        <svg
          width={def?.defaultWidth ?? 160}
          height={def?.defaultHeight ?? 240}
          viewBox="-80 -150 160 300"
          className="overflow-visible block"
        >
          {/* Remote Body */}
          <rect
            x="-65"
            y="-145"
            width="130"
            height="290"
            rx="16"
            ry="16"
            fill="#1f242d"
            stroke="#111827"
            strokeWidth="3"
          />

          {/* IR Emitter Window at Top */}
          <path
            d="M-20 -145 Q0 -152 20 -145 Z"
            fill="#7f1d1d"
            stroke="#991b1b"
            strokeWidth="1"
          />

          {/* Transmitter Active LED indicator */}
          <circle
            cx="0"
            cy="-135"
            r="3"
            fill={activeBtn ? '#ef4444' : '#4b5563'}
            filter={activeBtn ? 'drop-shadow(0 0 4px #ef4444)' : undefined}
          />

          {/* Remote Brand/Header */}
          <text
            x="0"
            y="-122"
            textAnchor="middle"
            fill="#9ca3af"
            fontSize="8"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            IR REMOTE
          </text>

          {/* --- ROW 1: POWER, VOL+, FUNC/STOP --- */}
          {/* Standby / Power Button */}
          <g
            onClick={() => handleButtonClick('standby')}
            className="cursor-pointer hover:opacity-90 active:scale-95 transition-transform"
          >
            <circle
              cx="-42"
              cy="-95"
              r="14"
              fill={activeBtn === 'standby' ? '#dc2626' : '#b91c1c'}
              stroke="#991b1b"
              strokeWidth="1.5"
            />
            {/* Power symbol */}
            <line x1="-42" y1="-102" x2="-42" y2="-95" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            <path
              d="M-46 -98 A6 6 0 1 0 -38 -98"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>

          {/* Vol+ Button */}
          <g
            onClick={() => handleButtonClick('volplus')}
            className="cursor-pointer hover:opacity-90 active:scale-95 transition-transform"
          >
            <circle
              cx="0"
              cy="-95"
              r="14"
              fill={activeBtn === 'volplus' ? '#3b82f6' : '#2563eb'}
              stroke="#1d4ed8"
              strokeWidth="1.5"
            />
            <text x="0" y="-91" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
              VOL+
            </text>
          </g>

          {/* Func/Stop Button */}
          <g
            onClick={() => handleButtonClick('funcstop')}
            className="cursor-pointer hover:opacity-90 active:scale-95 transition-transform"
          >
            <circle
              cx="42"
              cy="-95"
              r="14"
              fill={activeBtn === 'funcstop' ? '#4b5563' : '#374151'}
              stroke="#1f2937"
              strokeWidth="1.5"
            />
            <text x="42" y="-92" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">
              FUNC
            </text>
          </g>

          {/* --- ROW 2: REWIND, PLAY/PAUSE, FAST FORWARD --- */}
          <g onClick={() => handleButtonClick('rewind')} className="cursor-pointer hover:opacity-90">
            <circle cx="-42" cy="-60" r="14" fill={activeBtn === 'rewind' ? '#4b5563' : '#374151'} stroke="#1f2937" strokeWidth="1" />
            <text x="-42" y="-57" textAnchor="middle" fill="#ffffff" fontSize="9">|◄◄</text>
          </g>

          <g onClick={() => handleButtonClick('playpauze')} className="cursor-pointer hover:opacity-90">
            <circle cx="0" cy="-60" r="14" fill={activeBtn === 'playpauze' ? '#4b5563' : '#374151'} stroke="#1f2937" strokeWidth="1" />
            <text x="0" y="-57" textAnchor="middle" fill="#ffffff" fontSize="9">►||</text>
          </g>

          <g onClick={() => handleButtonClick('forward')} className="cursor-pointer hover:opacity-90">
            <circle cx="42" cy="-60" r="14" fill={activeBtn === 'forward' ? '#4b5563' : '#374151'} stroke="#1f2937" strokeWidth="1" />
            <text x="42" y="-57" textAnchor="middle" fill="#ffffff" fontSize="9">►►|</text>
          </g>

          {/* --- ROW 3: DOWN, VOL-, UP --- */}
          <g onClick={() => handleButtonClick('down')} className="cursor-pointer hover:opacity-90">
            <circle cx="-42" cy="-25" r="14" fill={activeBtn === 'down' ? '#4b5563' : '#374151'} stroke="#1f2937" strokeWidth="1" />
            <text x="-42" y="-22" textAnchor="middle" fill="#ffffff" fontSize="10">▼</text>
          </g>

          <g onClick={() => handleButtonClick('volmin')} className="cursor-pointer hover:opacity-90">
            <circle cx="0" cy="-25" r="14" fill={activeBtn === 'volmin' ? '#3b82f6' : '#2563eb'} stroke="#1d4ed8" strokeWidth="1.5" />
            <text x="0" y="-21" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">VOL-</text>
          </g>

          <g onClick={() => handleButtonClick('up')} className="cursor-pointer hover:opacity-90">
            <circle cx="42" cy="-25" r="14" fill={activeBtn === 'up' ? '#4b5563' : '#374151'} stroke="#1f2937" strokeWidth="1" />
            <text x="42" y="-22" textAnchor="middle" fill="#ffffff" fontSize="10">▲</text>
          </g>

          {/* --- ROW 4: 0, EQ, ST/REPT --- */}
          <g onClick={() => handleButtonClick('num0')} className="cursor-pointer hover:opacity-90">
            <circle cx="-42" cy="10" r="14" fill={activeBtn === 'num0' ? '#6b7280' : '#4b5563'} stroke="#374151" strokeWidth="1" />
            <text x="-42" y="14" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">0</text>
          </g>

          <g onClick={() => handleButtonClick('eq')} className="cursor-pointer hover:opacity-90">
            <circle cx="0" cy="10" r="14" fill={activeBtn === 'eq' ? '#4b5563' : '#374151'} stroke="#1f2937" strokeWidth="1" />
            <text x="0" y="13" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">EQ</text>
          </g>

          <g onClick={() => handleButtonClick('strept')} className="cursor-pointer hover:opacity-90">
            <circle cx="42" cy="10" r="14" fill={activeBtn === 'strept' ? '#4b5563' : '#374151'} stroke="#1f2937" strokeWidth="1" />
            <text x="42" y="13" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="bold">RPT</text>
          </g>

          {/* --- NUMERIC KEYPAD: 1 to 9 --- */}
          {/* Row 5: 1, 2, 3 */}
          {[
            { id: 'num1', label: '1', x: -42 },
            { id: 'num2', label: '2', x: 0 },
            { id: 'num3', label: '3', x: 42 },
          ].map((btn) => (
            <g key={btn.id} onClick={() => handleButtonClick(btn.id)} className="cursor-pointer hover:opacity-90">
              <circle cx={btn.x} cy="45" r="14" fill={activeBtn === btn.id ? '#6b7280' : '#4b5563'} stroke="#374151" strokeWidth="1" />
              <text x={btn.x} y="49" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">{btn.label}</text>
            </g>
          ))}

          {/* Row 6: 4, 5, 6 */}
          {[
            { id: 'num4', label: '4', x: -42 },
            { id: 'num5', label: '5', x: 0 },
            { id: 'num6', label: '6', x: 42 },
          ].map((btn) => (
            <g key={btn.id} onClick={() => handleButtonClick(btn.id)} className="cursor-pointer hover:opacity-90">
              <circle cx={btn.x} cy="80" r="14" fill={activeBtn === btn.id ? '#6b7280' : '#4b5563'} stroke="#374151" strokeWidth="1" />
              <text x={btn.x} y="84" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">{btn.label}</text>
            </g>
          ))}

          {/* Row 7: 7, 8, 9 */}
          {[
            { id: 'num7', label: '7', x: -42 },
            { id: 'num8', label: '8', x: 0 },
            { id: 'num9', label: '9', x: 42 },
          ].map((btn) => (
            <g key={btn.id} onClick={() => handleButtonClick(btn.id)} className="cursor-pointer hover:opacity-90">
              <circle cx={btn.x} cy="115" r="14" fill={activeBtn === btn.id ? '#6b7280' : '#4b5563'} stroke="#374151" strokeWidth="1" />
              <text x={btn.x} y="119" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">{btn.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
