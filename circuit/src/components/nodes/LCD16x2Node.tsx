import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

const I2C_PIN_LABELS = ['GND', 'VCC', 'SDA', 'SCL'];

export function LCD16x2Node(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'lcd16x2')!;
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const telemetry = useCircuitStore((state) => state.simulationFrame?.components[props.id]?.telemetry);
  const isRunning = isSimulating && telemetry !== undefined;

  // Telemetry overrides
  const line1 = isRunning ? String(telemetry?.line1 ?? '').slice(0, 16) : '';
  const line2 = isRunning ? String(telemetry?.line2 ?? '').slice(0, 16) : '';

  // Backlight & display states
  const backlightOn = isRunning && telemetry?.isPowered !== false && !telemetry?.error && (telemetry?.backlight === 'on');
  const displayEnabled = isRunning && telemetry?.isPowered !== false && !telemetry?.error && (telemetry?.displayEnabled === true);
  
  // Custom characters (CGRAM)
  let cgram = Array(64).fill(0);
  if (telemetry?.cgram) {
    if (typeof telemetry.cgram === 'string') {
      try {
        cgram = JSON.parse(telemetry.cgram);
      } catch (e) { }
    } else if (Array.isArray(telemetry.cgram)) {
      cgram = telemetry.cgram;
    }
  }

  // Cursor states
  const cursorEnabled = telemetry?.cursorEnabled === true;
  const blinkEnabled = telemetry?.blinkEnabled === true;
  const cursorColumn = Math.max(0, Math.min(15, Number(telemetry?.cursorColumn ?? 0)));
  const cursorRow = Math.max(0, Math.min(1, Number(telemetry?.cursorRow ?? 0)));

  // Properties
  const contrast = Number(props.data.properties?.contrast?.value ?? 80);

  return (
    <BaseCircuitNode
      {...props}
      width={def.defaultWidth}
      height={def.defaultHeight}
      pins={def.pins}
    >
      <svg
        width={def.defaultWidth}
        height={def.defaultHeight}
        viewBox={`0 0 ${def.defaultWidth} ${def.defaultHeight}`}
        role="img"
        aria-label="LCD 16x2"
        style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}
      >
        <defs>
          <style>{`
            @keyframes lcd-cursor-blink-anim {
              0%, 100% { opacity: 0; }
              50% { opacity: 1; }
            }
            .lcd-cursor-blinking {
              animation: lcd-cursor-blink-anim 1s step-end infinite;
            }
          `}</style>
          <linearGradient id={`lcd-board-${props.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#56ad70" />
            <stop offset="48%" stopColor="#4ea36a" />
            <stop offset="100%" stopColor="#40905e" />
          </linearGradient>
          <linearGradient id={`lcd-screen-${props.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={backlightOn ? '#4f75c7' : '#27344a'} />
            <stop offset="100%" stopColor={backlightOn ? '#182c68' : '#151b26'} />
          </linearGradient>
          <linearGradient id={`lcd-glass-${props.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#89a8ef" stopOpacity={backlightOn ? 0.38 : 0.08} />
            <stop offset="42%" stopColor="#426abd" stopOpacity={backlightOn ? 0.08 : 0.02} />
            <stop offset="100%" stopColor="#060b18" stopOpacity={0.38} />
          </linearGradient>
          <filter id={`lcd-shadow-${props.id}`} x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.4" floodColor="#0f172a" floodOpacity="0.32" />
          </filter>
        </defs>

        <rect x="6" y="8" width="308" height="164" rx="2" fill="#0b442e" opacity="0.24" />
        <rect x="4" y="6" width="312" height="164" rx="2" fill={`url(#lcd-board-${props.id})`} stroke="#4ea36a" strokeWidth="1.5" />

        {[
          [16, 18],
          [304, 18],
          [16, 158],
          [304, 158],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="7" fill="#cdd8d0" />
            <circle cx={x} cy={y} r="4.7" fill="#4d5b55" />
            <circle cx={x - 1.3} cy={y - 1.3} r="2" fill="#1b2422" opacity="0.55" />
          </g>
        ))}

        {Array.from({ length: 18 }, (_, index) => {
          const x = 26 + index * 9.7;
          return (
            <g key={index}>
              <circle cx={x} cy="19" r="3.15" fill="#d9dfd8" />
              <circle cx={x} cy="19" r="2" fill="#8c9b92" />
              <circle cx={x - 0.7} cy="18.3" r="0.75" fill="#ffffff" opacity="0.7" />
            </g>
          );
        })}

        {def.pins.map((pin, index) => (
          <g key={pin.id}>
            <circle cx={pin.position.x} cy={pin.position.y} r="4.7" fill="#20302c" />
            <circle cx={pin.position.x} cy={pin.position.y} r="3" fill="#d1c690" />
            <circle cx={pin.position.x} cy={pin.position.y} r="1.25" fill="#2c3635" />
            <text
              x="13"
              y={pin.position.y + 3}
              textAnchor="start"
              fontSize="6.2"
              fontFamily="Arial, sans-serif"
              fontWeight="700"
              fill="#20302c"
            >
              {I2C_PIN_LABELS[index]}
            </text>
          </g>
        ))}

        <rect x="29" y="52" width="281" height="91" rx="2" fill="#111827" opacity="0.25" />
        <rect x="30" y="44" width="280" height="99" rx="2" fill="#333333" filter={`url(#lcd-shadow-${props.id})`} />
        <rect x="42" y="63" width="260" height="65" rx="2" fill={isSimulating ? '#0b1736' : '#000000'} />
        <rect x="42" y="63" width="260" height="65" rx="2" fill={`url(#lcd-screen-${props.id})`} opacity={isSimulating ? (backlightOn ? 1 : 0.42) : 0} />
        <rect x="42" y="63" width="260" height="65" rx="2" fill={`url(#lcd-glass-${props.id})`} opacity={isSimulating ? 1 : 0} />

        {/* Character Dot Matrix background slots */}
        {isSimulating && (
          <>
            <LCDDotMatrix x={54} y={72} enabled={backlightOn} />
            <LCDDotMatrix x={54} y={100} enabled={backlightOn} />
          </>
        )}

        {/* Text and custom characters rendering */}
        {isSimulating && displayEnabled && (
          <g style={{ opacity: contrast / 100 }}>
            <LCDText x={57} y={87} value={line1} enabled={backlightOn} cgram={cgram} />
            <LCDText x={57} y={115} value={line2} enabled={backlightOn} cgram={cgram} />
          </g>
        )}

        {/* Visual Hardware Cursor (Underline) */}
        {isSimulating && displayEnabled && cursorEnabled && (
          <rect
            x={55 + cursorColumn * 14.6}
            y={cursorRow === 0 ? 86 : 114}
            width="11"
            height="2"
            fill={backlightOn ? '#cbe0ff' : '#506070'}
          />
        )}

        {/* Visual Blinking Block Cursor */}
        {isSimulating && displayEnabled && blinkEnabled && (
          <rect
            x={54 + cursorColumn * 14.6}
            y={cursorRow === 0 ? 72 : 100}
            width="11"
            height="16"
            fill={backlightOn ? '#cbe0ff' : '#506070'}
            opacity={0.5}
            className="lcd-cursor-blinking"
          />
        )}


      </svg>
    </BaseCircuitNode>
  );
}

function LCDDotMatrix({ x, y, enabled }: { x: number; y: number; enabled: boolean }) {
  const cells = Array.from({ length: 16 }, (_, cell) => cell);
  const dots = Array.from({ length: 35 }, (_, dot) => ({
    x: dot % 5,
    y: Math.floor(dot / 5),
  }));

  return (
    <g opacity={enabled ? 0.34 : 0.18}>
      {cells.map((cell) => (
        <g key={cell} transform={`translate(${x + cell * 14.6}, ${y})`}>
          {dots.map((dot) => (
            <rect
              key={`${dot.x}-${dot.y}`}
              x={dot.x * 2.08}
              y={dot.y * 2.42}
              width="1.45"
              height="1.65"
              rx="0.25"
              fill={enabled ? '#071c55' : '#09111f'}
              opacity="0.55"
            />
          ))}
        </g>
      ))}
    </g>
  );
}

function LCDCustomChar({ x, y, bytes, enabled }: { x: number; y: number; bytes: number[]; enabled: boolean }) {
  const dots: { x: number; y: number }[] = [];
  for (let row = 0; row < 8; row++) {
    const b = bytes[row] ?? 0;
    for (let col = 0; col < 5; col++) {
      if (b & (1 << (4 - col))) {
        dots.push({ x: col, y: row });
      }
    }
  }

  return (
    <g>
      {dots.map((dot) => (
        <rect
          key={`${dot.x}-${dot.y}`}
          x={x + dot.x * 2.08}
          y={y + dot.y * 2.42}
          width="1.45"
          height="1.65"
          rx="0.25"
          fill={enabled ? '#cbe0ff' : '#506070'}
          opacity={enabled ? 0.94 : 0.62}
        />
      ))}
    </g>
  );
}

function LCDText({
  x,
  y,
  value,
  enabled,
  cgram,
}: {
  x: number;
  y: number;
  value: string;
  enabled: boolean;
  cgram: number[];
}) {
  const chars = value.padEnd(16, ' ').split('');

  return (
    <g>
      {chars.map((char, i) => {
        const charCode = char.charCodeAt(0);
        if (charCode < 8) {
          // Custom Character from CGRAM
          const bytes = cgram.slice(charCode * 8, charCode * 8 + 8);
          // Dot Matrix Cell top-left is at x = 54 + cell * 14.6.
          // Cell Y is y - 15 (e.g. 87 - 15 = 72).
          return (
            <LCDCustomChar
              key={i}
              x={54 + i * 14.6}
              y={y - 15}
              bytes={bytes}
              enabled={enabled}
            />
          );
        }

        // Standard character text block
        return (
          <text
            key={i}
            x={x + i * 14.6}
            y={y}
            fontSize="15.2"
            fontFamily="'Courier New', monospace"
            fontWeight="700"
            fill={enabled ? '#cbe0ff' : '#506070'}
            opacity={enabled ? 0.94 : 0.62}
          >
            {char}
          </text>
        );
      })}
    </g>
  );
}
