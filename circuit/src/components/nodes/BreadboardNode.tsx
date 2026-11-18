import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import type { CircuitNode } from '@cs/lib/types';

const rowLabelsTop =['j', 'i', 'h', 'g', 'f'];
const rowLabelsBottom = ['e', 'd', 'c', 'b', 'a'];

function hole(x: number, y: number, key: string) {
  return (
    <circle
      key={key}
      cx={x}
      cy={y}
      r="3"
      fill="#2f3437"
      stroke="#b8bcc0"
      strokeWidth="0.75"
    />
  );
}

export function BreadboardNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'breadboard')!;
  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <svg width={def.defaultWidth} height={def.defaultHeight} viewBox="0 0 350 230">
        <rect x="2" y="2" width="346" height="226" rx="5" fill="#e8e8e8" stroke="#cfd3d8" strokeWidth="1.5" />
        <rect x="12" y="10" width="326" height="210" rx="3" fill="#f5f5f5" opacity="0.55" />
{/* horizontal lining */}
        <line x1="20" y1="20" x2="330" y2="20" stroke="#ef4444" strokeWidth="1" opacity="0.65" />
        <line x1="20" y1="30" x2="330" y2="30" stroke="#3b82f6" strokeWidth="1" opacity="0.65" />
        <line x1="20" y1="200" x2="330" y2="200" stroke="#3b82f6" strokeWidth="1" opacity="0.65" />
        <line x1="20" y1="210" x2="330" y2="210" stroke="#ef4444" strokeWidth="1" opacity="0.65" />
 {/* Vertyical lining up */}
       {Array.from({ length: 30 }, (_, index) => {
  const x = 30 + index * 10;

  return (
    <line
      key={index}
      x1={x}
      y1="55"
      x2={x}
      y2="105"
      stroke="#151313"
      strokeWidth="1"
      opacity="0.65"
    />
  );
})}

 {/* Vertyical lining down */}
     {Array.from({ length: 30 }, (_, index) => {
  const x = 30 + index * 10;

  return (
    <line
      key={index}
      x1={x}
      y1="125"
      x2={x}
      y2="175"
      stroke="#151313"
      strokeWidth="1"
      opacity="0.65"
    />
  );
})}
     
 {/* for + and - text in breadboard */}
        <text x="13" y="23" fontSize="8" fill="#ef4444" fontWeight="700">+</text>
        <text x="13" y="33" fontSize="8" fill="#3b82f6" fontWeight="700">-</text>
        <text x="13" y="203" fontSize="8" fill="#3b82f6" fontWeight="700">-</text>
        <text x="13" y="213" fontSize="8" fill="#ef4444" fontWeight="700">+</text>

        {Array.from({ length: 30 }, (_, index) => {
          const x = 30 + index * 10;
          return [
            hole(x, 20, `tp-${index}`),
            hole(x, 30, `tn-${index}`),
            hole(x, 200, `bn-${index}`),
            hole(x, 210, `bp-${index}`),
          ];
        })}

        <line x1="18" y1="112" x2="332" y2="112" stroke="#d3d7dc" strokeWidth="8" />
        <line x1="18" y1="112" x2="332" y2="112" stroke="#c3c8ce" strokeWidth="1" />
 {/* for left side */}
        {rowLabelsTop.map((row, rowIndex) => (
          <text key={`label-${row}`} x="16" y={63 + rowIndex * 10} fontSize="7" fill="#64748b" textAnchor="middle">
            {row}
          </text>
        ))}
        {rowLabelsBottom.map((row, rowIndex) => (
          <text key={`label-${row}`} x="16" y={133 + rowIndex * 10} fontSize="7" fill="#64748b" textAnchor="middle">
            {row}
          </text>
        ))}
{/*  for right side */}
{rowLabelsTop.map((row, rowIndex) => (
          <text key={`label-${row}`} x="333" y={63 + rowIndex * 10} fontSize="7" fill="#64748b" textAnchor="middle">
            {row}
          </text>
        ))}
        {rowLabelsBottom.map((row, rowIndex) => (
          <text key={`label-${row}`} x="333" y={133 + rowIndex * 10} fontSize="7" fill="#64748b" textAnchor="middle">
            {row}
          </text>
        ))}

        {rowLabelsTop.flatMap((row, rowIndex) =>
          Array.from({ length: 30 }, (_, index) => hole(30 + index * 10, 60 + rowIndex * 10, `${row}-${index}`))
        )}
        {rowLabelsBottom.flatMap((row, rowIndex) =>
          Array.from({ length: 30 }, (_, index) => hole(30 + index * 10, 130 + rowIndex * 10, `${row}-${index}`))
        )}

        {Array.from({ length: 30 }, (_, index) => (
          <text key={`col-${index}`} x={30 + index * 10} y="49" fontSize="5" fill="#94a3b8" textAnchor="middle">
            {index + 1}
          </text>
        ))}
        {Array.from({ length: 30 }, (_, index) => (
          <text key={`colb-${index}`} x={30 + index * 10} y="184" fontSize="5" fill="#94a3b8" textAnchor="middle">
            {index + 1}
          </text>
        ))}
      </svg>
    </BaseCircuitNode>
  );
}
