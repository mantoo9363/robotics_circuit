import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import type { CircuitNode } from '@cs/lib/types';

const NODE_WIDTH = 80;
const NODE_HEIGHT = 80;
const OHM = '\u03A9';
const MICRO = '\u00B5';
 
const RESISTOR_PINS = [
  { id: 'pin1', label: 'Terminal 1', position: { x: NODE_WIDTH / 2, y: 4 } },
  { id: 'pin2', label: 'Terminal 2', position: { x: NODE_WIDTH / 2, y: NODE_HEIGHT - 4 } },
];
 
const RESISTANCE_MULTIPLIERS: Record<string, number> = {
  [`p${OHM}`]: 1e-12,
  [`n${OHM}`]: 1e-9,
  [`${MICRO}${OHM}`]: 1e-6,
  [`m${OHM}`]: 1e-3,
  [OHM]: 1,
  [`k${OHM}`]: 1e3,
  [`M${OHM}`]: 1e6,
  [`G${OHM}`]: 1e9,
};
 
const DIGIT_COLORS = [
  '#111111',
  '#6B2D0E',
  '#CC1111',
  '#F97316',
  '#FACC15',
  '#22C55E',
  '#2563EB',
  '#7C3AED',
  '#808080',
  '#F8FAFC',
];
 
const MULTIPLIER_COLORS: Record<number, string> = {
  [-2]: '#C0C0C0',
  [-1]: '#D4AF37',
  0: DIGIT_COLORS[0],
  1: DIGIT_COLORS[1],
  2: DIGIT_COLORS[2],
  3: DIGIT_COLORS[3],
  4: DIGIT_COLORS[4],
  5: DIGIT_COLORS[5],
  6: DIGIT_COLORS[6],
  7: DIGIT_COLORS[7],
  8: DIGIT_COLORS[8],
  9: DIGIT_COLORS[9],
};
 
function getResistanceOhms(value: unknown, unit: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  const unitKey = typeof unit === 'string' && unit.trim().length > 0 ? unit : OHM;
  return numericValue * (RESISTANCE_MULTIPLIERS[unitKey] ?? 1);
}
 
function getBandColors(ohms: number) {
  if (!Number.isFinite(ohms) || ohms <= 0) {
    return [DIGIT_COLORS[0], DIGIT_COLORS[0], DIGIT_COLORS[0], '#D4AF37'];
  }
 
  const exponent = Math.floor(Math.log10(ohms));
  let twoDigits = Math.round(ohms / 10 ** (exponent - 1));
  let multiplierExponent = exponent - 1;
 
  if (twoDigits >= 100) {
    twoDigits = Math.round(twoDigits / 10);
    multiplierExponent += 1;
  }
 
  const firstDigit = Math.floor(twoDigits / 10);
  const secondDigit = Math.abs(twoDigits % 10);
  const safeMultiplier = Math.max(-2, Math.min(9, multiplierExponent));
 
  return [
    DIGIT_COLORS[Math.max(0, Math.min(9, firstDigit))],
    DIGIT_COLORS[Math.max(0, Math.min(9, secondDigit))],
    MULTIPLIER_COLORS[safeMultiplier],
    '#D4AF37',
  ];
}
export function ResistorNode(props: NodeProps<CircuitNode>) {
  
  const resistance = props.data.properties?.resistance?.value ?? 1000;
  const selectedUnit = String(props.data.properties?.resistance?.unit ?? OHM);
  const bandColors = getBandColors(getResistanceOhms(resistance, selectedUnit));
  const valueLabel = `${resistance}${selectedUnit}`;
  const rotation = Number(props.data.rotation ?? 0);

  return (
    <BaseCircuitNode {...props} width={NODE_WIDTH} height={NODE_HEIGHT} pins={RESISTOR_PINS}>
      <div style={{ position: 'relative', width: NODE_WIDTH, height: NODE_HEIGHT }}>
        <svg
          width={NODE_WIDTH}
          height={NODE_HEIGHT}
          viewBox="-12 -24 24 48"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        >
          <line
            x1="0"
            y1="-20"
            x2="0"
            y2="20"
            fill="none"
            stroke="#8C8C8C"
            strokeWidth="2"
            strokeLinecap="round"
            strokeMiterlimit="10"
          />
          <path
            fill="#D9B477"
            d="M3.69-3.66c0-2.16,1.11-2.67,1.11-5.53s-3.35-3.81-3.58-4.55c-0.17-0.53-0.19-0.95-0.19-0.95s0.05-0.25-0.56-0.28s-1.49,0.28-1.49,0.28s-0.02,0.41-0.19,0.95C-1.45-13.01-4.8-12.06-4.8-9.2s1.11,3.37,1.11,5.53c0,0.99,0,6.05,0,7.04c0,2.16-1.11,2.67-1.11,5.53s3.35,3.81,3.58,4.55c0.17,0.53,0.19,0.95,0.19,0.95s-0.01,0.42,0.5,0.42s1.55-0.42,1.55-0.42s0.02-0.41,0.19-0.95c0.23-0.74,3.58-1.69,3.58-4.55S3.69,5.53,3.69,3.38C3.69,2.39,3.69-2.68,3.69-3.66z"
          />
          <path
            fill={bandColors[0]}
            d="M3.69-3.06h-7.38c0,0.63,0,1.58,0,2.56h7.38C3.69-1.48,3.69-2.43,3.69-3.06z"
          />
          <path
            fill={bandColors[1]}
            d="M3.69,3.38c0-0.24,0-0.71,0-1.31h-7.38c0,0.6,0,1.07,0,1.31c0,0.49-0.06,0.89-0.15,1.25h7.68C3.75,4.26,3.69,3.86,3.69,3.38z"
          />
          <path
            fill={bandColors[2]}
            d="M4.8,8.91c0-0.7-0.07-1.25-0.17-1.73h-9.26C-4.73,7.66-4.8,8.21-4.8,8.91c0,0.3,0.04,0.57,0.11,0.82h9.38C4.75,9.48,4.8,9.2,4.8,8.91z"
          />
          <path
            fill={bandColors[3]}
            d="M-4.8-9.2c0,0.22,0.02,0.41,0.03,0.6h9.53c0.01-0.2,0.03-0.38,0.03-0.6c0-0.13-0.01-0.25-0.03-0.37h-9.53C-4.78-9.45-4.8-9.33-4.8-9.2z"
          />
          <rect x="-0.16" y="-9.57" width="4.63" height="0.97" opacity="0.4" />
          <rect x="-4.65" y="-9.57" width="2.38" height="0.97" fill="#FFFF33" opacity="0.5" />
          <path
            fill="#FFFFFF"
            opacity="0.18"
            d="M-3.35-12.2c1.15-1.08,2.06-1.07,2.24-1.63c0.17-0.53,0.19-0.95,0.19-0.95s0.88-0.29,1.49-0.28c0.61,0.03,0.56,0.28,0.56,0.28s0.02,0.41,0.19,0.95c0.19,0.6,2.37,1.32,3.25,2.96c-2.35-1.28-5.23-1.73-7.92-1.33z"
          />
          <path
            fill="#000000"
            opacity="0.16"
            d="M3.69-3.66c0-2.16,1.11-2.67,1.11-5.53c0-1.1-0.5-1.92-1.15-2.57c0.25,2.3-1.05,3.06-1.05,5.01v7.04c0,2.16,1.11,2.67,1.11,5.53c0,2.33-2.22,3.36-3.18,4.15c-0.18,0.15-0.36,0.54-0.51,0.99c0.42-0.12,0.83-0.28,1.2-0.47c0.23-0.74,3.58-1.69,3.58-4.55S3.69,5.53,3.69,3.38C3.69,2.39,3.69-2.68,3.69-3.66z"
          />
        </svg>
      </div>

      <span
        style={{
          position: 'absolute',
          bottom: -16,
          left: '50%',
          transform: `translateX(-50%) rotate(${-rotation}deg)`,
          transformOrigin: 'center',
          fontSize: 9,
          color: '#777',
          fontFamily: 'sans-serif',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {valueLabel}
      </span>
    </BaseCircuitNode>
  );
}
 
