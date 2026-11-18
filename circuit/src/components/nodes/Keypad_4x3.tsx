import { useState, useEffect } from 'react';
import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import {
  refreshSimulationFrameFromCurrentCircuit,
  useCircuitStore,
} from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function Keypad4x3Node(props: NodeProps<CircuitNode>) {
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  
  // Exclusively fetching 4x3 keypad properties from the catalog
  const def = getComponentDefinition(props.data.componentType || props.type || 'keypad4x3') ?? { defaultWidth: 100, defaultHeight: 180, pins: [] };

  // Single pressed key tracking as required by standard simulation matrix engines
  const pressedKeyStr = String(props.data.properties?.pressedKeys?.value ?? '');
  const [localActiveKey, setLocalActiveKey] = useState<string | null>(pressedKeyStr || null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useEffect(() => {
    setLocalActiveKey(pressedKeyStr || null);
  }, [pressedKeyStr]);

  // Dedicated 4x3 Matrix
  const KEY_MATRIX = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#']
  ];

  const updatePressedKey = (key: string | null) => {
    // 1. Locate physical matrix row and column indices for simulator propagation
    let r = 0, c = 0;
    if (key) {
      for (let i = 0; i < KEY_MATRIX.length; i++) {
        const j = KEY_MATRIX[i].indexOf(key);
        if (j !== -1) {
          r = i + 1; // Base-1 indexed rows
          c = j + 1; // Base-1 indexed columns
          break;
        }
      }
    }

    useCircuitStore.setState((store) => ({
      nodes: store.nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: {
                  ...node.data.properties,
                  // Directly syncing properties that the fallback loop logic engine needs
                  pressedKeys: { label: 'Pressed Keys', type: 'string', value: key || '' },
                  pressedKey: { label: 'Pressed Key', type: 'string', value: key || '' },
                  activeRow: { label: 'Active Row', type: 'number', value: r },
                  activeColumn: { label: 'Active Column', type: 'number', value: c },
                },
              },
            }
          : node
      ),
    }));
    refreshSimulationFrameFromCurrentCircuit();
  };

  const handleKeyPressStart = (e: React.PointerEvent, key: string) => {
    if (!isSimulating) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey) {
      // Toggle latch mode holding
      if (localActiveKey === key) {
        setLocalActiveKey(null);
        updatePressedKey(null);
      } else {
        setLocalActiveKey(key);
        updatePressedKey(key);
      }
    } else {
      // Momentary press mode triggers down
      setLocalActiveKey(key);
      updatePressedKey(key);
    }
  };

  const handleKeyPressEnd = (e: React.PointerEvent, key: string) => {
    if (!isSimulating) return;
    e.preventDefault();
    e.stopPropagation();

    if (!e.shiftKey && localActiveKey === key) {
      // Release momentary press
      setLocalActiveKey(null);
      updatePressedKey(null);
    }
  };

  const handleKeyPressLeave = (e: React.PointerEvent, key: string) => {
    setHoveredKey(null);
    if (!isSimulating) return;
    e.preventDefault();
    e.stopPropagation();

    if (localActiveKey === key && !e.shiftKey) {
      // Prevent button getting stuck if dragged out of bound zone
      setLocalActiveKey(null);
      updatePressedKey(null);
    }
  };

  // Dedicated 4x3 Dimensions Layout
  const colsCount = 3;
  const btnWidth = 18;
  const btnHeight = 18;
  const gapX = 5;
  const gapY = 5;
  const gridWidth = colsCount * btnWidth + (colsCount - 1) * gapX;

  const padWidth = 80;
  const padX = 15;
  const padCenter = padX + padWidth / 2;

  const startX = padCenter - gridWidth / 2;
  const startY = 20;

  const ribbonRightX = 87;
  const headerWidth = 66;

  const width = def.defaultWidth || 100;
  const height = def.defaultHeight || 180;

  return (
    <BaseCircuitNode
      {...props}
      width={width}
      height={height}
      pins={def.pins}
    >
      <div 
        data-node-id={props.id}
        style={{ 
          position: 'relative', 
          width: `${width}px`, 
          height: `${height}px` 
        }}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block' }}
        >
          {/* --- MAIN KEYPAD PAD BODY (Matte Dark Charcoal Style) --- */}
          <rect
            x={padX}
            y="14"
            width={padWidth}
            height="100"
            rx="12"
            fill="#1e1e1e"
            stroke="#2c2c2c"
            strokeWidth="3.5"
          />

          {/* Subtle Inner Highlight Border */}
          <rect
            x={padX + 2.5}
            y="16.5"
            width={padWidth - 5}
            height="95"
            rx="9"
            fill="none"
            stroke="rgba(255, 255, 255, 0.03)"
            strokeWidth="1"
          />

          {/* --- RENDER KEY MATRIX BUTTONS --- */}
          {KEY_MATRIX.map((row, rIdx) => {
            return row.map((key, cIdx) => {
              const x = startX + cIdx * (btnWidth + gapX);
              const y = startY + rIdx * (btnHeight + gapY);
              
              const isPressed = localActiveKey === key;
              const isHovered = hoveredKey === key;
              
              // Colors matching the Tinkercad standard hardware
              let btnColor = "#3b82f6"; // Blue for numbers (1-9, 0)
              let shadowColor = "#1d4ed8";
              
              if (key === '*' || key === '#') {
                btnColor = "#ef4444"; // Red for * and #
                shadowColor = "#b91c1c";
              }

              return (
                <g
                  key={key}
                  className="nodrag nopan"
                  style={{ cursor: isSimulating ? 'pointer' : 'default' }}
                  onPointerDown={(e) => handleKeyPressStart(e, key)}
                  onPointerUp={(e) => handleKeyPressEnd(e, key)}
                  onPointerLeave={(e) => handleKeyPressLeave(e, key)}
                  onPointerEnter={() => isSimulating && setHoveredKey(key)}
                >
                  {/* Button Bottom Shadow (3D Depth) */}
                  {!isPressed && (
                    <rect
                      x={x}
                      y={y + 1.5}
                      width={btnWidth}
                      height={btnHeight}
                      rx="3.5"
                      fill={shadowColor}
                    />
                  )}

                  {/* Button Front Face */}
                  <rect
                    x={x}
                    y={isPressed ? y + 1.5 : y}
                    width={btnWidth}
                    height={isPressed ? btnHeight - 1.5 : btnHeight - 0.5}
                    rx="3.5"
                    fill={isPressed ? "#ffffff" : btnColor}
                    stroke={isHovered && isSimulating ? "#22c55e" : "rgba(0,0,0,0.15)"}
                    strokeWidth={isHovered && isSimulating ? "1.5" : "0.5"}
                    opacity={1}
                    filter={isPressed ? "none" : "drop-shadow(0px 1px 1px rgba(0,0,0,0.25))"}
                  />
                  
                  {/* Inner Shading Ring for glossy touch */}
                  {!isPressed && (
                    <rect
                      x={x + 0.5}
                      y={y + 0.5}
                      width={btnWidth - 1}
                      height={btnHeight - 2}
                      rx="3"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.25)"
                      strokeWidth="0.75"
                    />
                  )}

                  {/* Character label text */}
                  <text
                    x={x + btnWidth / 2}
                    y={isPressed ? y + btnHeight / 2 + 4.5 : y + btnHeight / 2 + 3}
                    textAnchor="middle"
                    fontSize="10"
                    fill={isPressed ? "#1a1a1a" : "#ffffff"}
                    fontWeight="bold"
                    fontFamily="Inter, system-ui, -apple-system, sans-serif"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >
                    {key}
                  </text>
                </g>
              );
            });
          })}

          {/* --- FLEXIBLE BOTTOM MEMBRANE RIBBON CABLE --- */}
          <path
            d={`M 23 114 L 23 144 L ${ribbonRightX} 144 L ${ribbonRightX} 114 Z`}
            fill="#2c2c2c"
            stroke="#151515"
            strokeWidth="0.75"
          />

          {/* Yellow/Gold contact tracks */}
          {def.pins.map((pin) => {
            const x = pin.position.x;
            return (
              <g key={`rail-${pin.id}`}>
                <rect x={x - 1} y="114" height="28" width="2" fill="#181818" stroke="rgba(0,0,0,0.3)" strokeWidth="0.25" />
                <line x1={x} y1="114" x2={x} y2="138" stroke="#ffd700" strokeWidth="0.75" />
              </g>
            );
          })}

          {/* --- HOUSING TERMINAL CONNECTIONS BLOCK --- */}
          <rect
            x="22"
            y="136"
            width={headerWidth}
            height="8"
            rx="1.5"
            fill="#111111"
            stroke="#222222"
            strokeWidth="0.5"
          />

          {/* Pins contact nodes */}
          {def.pins.map((pin) => (
            <circle key={`contact-${pin.id}`} cx={pin.position.x} cy="140" r="1.5" fill="#ffd700" />
          ))}

          {/* Visual Link Lines pointing directly out to the Node layout grid */}
          {def.pins.map((pin) => (
            <line key={`link-${pin.id}`} x1={pin.position.x} y1="140" x2={pin.position.x} y2="160" stroke="#708090" strokeWidth="2.5" strokeLinecap="round" />
          ))}
          
          {/* External Wire Grid Target Center Points */}
          {def.pins.map((pin) => (
            <circle key={`wire-target-${pin.id}`} cx={pin.position.x} cy={pin.position.y} r="2" fill="#111827" />
          ))}
        </svg>
      </div>
    </BaseCircuitNode>
  );
}