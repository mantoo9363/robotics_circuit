'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useState } from 'react';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode, PinDefinition } from '@cs/lib/types';
import { checkComponentStatus } from '@cs/utils/componentStatus';
import { InfoButton } from '@cs/components/InfoButton';
import { InfoPopup } from '@cs/components/InfoPopup';

const PIN_HIT_SIZE = 25;
const PIN_DOT_SIZE = 9;

type PinPositionOverrides = Record<string, { x: number; y: number }>;

interface BaseCircuitNodeProps extends NodeProps<CircuitNode> {
  width: number;
  height: number;
  pins: PinDefinition[];
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export function BaseCircuitNode({
  id,
  data,
  selected,
  width,
  height,
  pins,
  children,
  onClick,
  onDoubleClick,
}: BaseCircuitNodeProps) {
  const rotation = data.rotation ?? 0;
  const renderedWidth = Math.max(20, Number(data.width ?? width));
  const renderedHeight = Math.max(20, Number(data.height ?? height));
  const scaleX = renderedWidth / width;
  const scaleY = renderedHeight / height;
  const pinPositionOverrides =
    typeof data.pinPositions === 'object' && data.pinPositions !== null && !Array.isArray(data.pinPositions)
      ? (data.pinPositions as PinPositionOverrides)
      : {};
  const componentState = useCircuitStore((state) => state.simulationFrame?.components[id]);
  const rawTelemetry = componentState?.telemetry;
  const telemetry = rawTelemetry
    ? { ...rawTelemetry, isPowered: componentState?.isPowered }
    : componentState?.isPowered !== undefined
      ? ({ isPowered: componentState.isPowered } as Record<string, any>)
      : undefined;
  const pinsState = componentState?.pins;
  const showSparkEffect = telemetry?.spark === true || telemetry?.burnt === true;
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const [nodeHovered, setNodeHovered] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);

  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const status = isSimulating
    ? checkComponentStatus(data.componentType, telemetry, data.properties)
    : { severity: 'none' as const, message: '', details: '' };

  const showWarning = status.severity === 'warning' || status.severity === 'error';
  const showInfo = status.severity === 'none' && (status.message === 'LED Working' || status.message === 'Tilt Sensor Working');
  const showBadge = showWarning || showInfo;
  const isPopupVisible = showBadge && popupOpen;

  const selectNode = () => {
    useCircuitStore.setState((state) => ({
      nodes: state.nodes.map((node) => ({
        ...node,
        selected: node.id === id,
      })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: [id],
      selectedEdgeIds: [],
    }));
  };
  const handleNodeClick = (event: React.MouseEvent<HTMLDivElement>) => {
    selectNode();
    onClick?.(event);
  };

  // Convert degrees to radians for trigonometric rotation matrix math
  const rad = (rotation * Math.PI) / 180;
  const nearestPinDistance = pins.reduce((nearest, pin, index) => {
    for (let otherIndex = index + 1; otherIndex < pins.length; otherIndex += 1) {
      const other = pins[otherIndex];
      const pinOverride = pinPositionOverrides[pin.id];
      const otherOverride = pinPositionOverrides[other.id];
      const pinX = Number(pinOverride?.x ?? pin.position.x * scaleX);
      const pinY = Number(pinOverride?.y ?? pin.position.y * scaleY);
      const otherX = Number(otherOverride?.x ?? other.position.x * scaleX);
      const otherY = Number(otherOverride?.y ?? other.position.y * scaleY);
      const dx = pinX - otherX;
      const dy = pinY - otherY;
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
    return nearest;
  }, Number.POSITIVE_INFINITY);
  const pinHitSize = Number.isFinite(nearestPinDistance)
    ? Math.max(12, Math.min(PIN_HIT_SIZE, nearestPinDistance * 0.95))
    : PIN_HIT_SIZE;
  const pinDotSize = Math.max(4, Math.min(PIN_DOT_SIZE, pinHitSize - 2));

  return (
    <div
      className={`relative circuit-node ${isPopupVisible ? 'info-popup-visible' : ''}`}
      onMouseEnter={() => setNodeHovered(true)}
      onMouseLeave={() => {
        setNodeHovered(false);
        setHoveredPin(null);
      }}
      onClick={handleNodeClick}
      onDoubleClick={onDoubleClick}
      style={{
        width: renderedWidth,
        height: renderedHeight,
        overflow: 'visible',
      }}
    >
      {/* Component Visual Representation — Rotates ONLY visual asset, NOT the parent frame */}
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          overflow: 'visible',
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center',
          filter: selected
            ? [
                'drop-shadow(0 0 1px #2f80ff)',
                'drop-shadow(0 0 3px rgba(47, 128, 255, 0.95))',
                'drop-shadow(0 0 8px rgba(47, 128, 255, 0.35))',
              ].join(' ')
            : 'none',
          transition: 'transform 0.1s ease',
        }}
      >
        <div
          style={{
            width,
            height,
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: 'top left',
            overflow: 'visible',
          }}
        >
          {children}
        </div>
      </div>

      {showSparkEffect && (
        <div className="component-spark-effect" aria-hidden="true">
          <span className="spark-core" />
          <span className="spark-bolt spark-bolt-a" />
          <span className="spark-bolt spark-bolt-b" />
          <span className="spark-bolt spark-bolt-c" />
          <span className="spark-smoke spark-smoke-a" />
          <span className="spark-smoke spark-smoke-b" />
        </div>
      )}

      {/* Pins rendered as true rotation-adjusted visual + connectable dots */}
      {pins.map((pin) => {
        // 1. Establish the focal center point of your component frame footprint
        const cx = renderedWidth / 2;
        const cy = renderedHeight / 2;
        const override = pinPositionOverrides[pin.id];
        const pinX = Number(override?.x ?? pin.position.x * scaleX);
        const pinY = Number(override?.y ?? pin.position.y * scaleY);

        // 2. Map coordinates relative to the component center offset origin
        const rx = pinX - cx;
        const ry = pinY - cy;

        // 3. Compute 2D Rotation Matrix coordinates to locate pin post-rotation
        const rotatedX = cx + (rx * Math.cos(rad) - ry * Math.sin(rad));
        const rotatedY = cy + (rx * Math.sin(rad) + ry * Math.cos(rad));

        // 4. Dynamically figure out the optimal orthogonal face orientation handle path direction
        const relX = rotatedX / renderedWidth;
        const relY = rotatedY / renderedHeight;

        let handlePosition = Position.Left;
        if (relX >= 0.7)      handlePosition = Position.Right;
        else if (relX <= 0.3) handlePosition = Position.Left;
        else if (relY <= 0.3) handlePosition = Position.Top;
        else if (relY >= 0.7) handlePosition = Position.Bottom;

        const isHovered = hoveredPin === pin.id;
        const showPin = isHovered || (nodeHovered && selected);
        const pinActive = pinsState?.[pin.id]?.active ?? false;
        const dispatchPinEvent = (event: React.MouseEvent<HTMLDivElement>, eventName: string) => {
          const pinBounds = event.currentTarget.getBoundingClientRect();
          window.dispatchEvent(
            new CustomEvent(eventName, {
              detail: {
                nodeId: id,
                handleId: pin.id,
                clientX: pinBounds.left + pinBounds.width / 2,
                clientY: pinBounds.top + pinBounds.height / 2,
                button: event.button,
              },
            })
          );
          if (eventName === 'circuit-wire-pin-down') {
            event.preventDefault();
            event.stopPropagation();
          }
        };

        return (
          <div
            key={pin.id}
            data-circuit-pin-node={id}
            data-circuit-pin-handle={pin.id}
            onMouseEnter={() => setHoveredPin(pin.id)}
            onMouseLeave={() => setHoveredPin(null)}
            onMouseDownCapture={(event) => dispatchPinEvent(event, 'circuit-wire-pin-down')}
            onMouseUpCapture={(event) => dispatchPinEvent(event, 'circuit-wire-pin-up')}
            style={{
              position: 'absolute',
              left: rotatedX - pinHitSize / 2,
              top: rotatedY - pinHitSize / 2,
              width: pinHitSize,
              height: pinHitSize,
              zIndex: 10,
            }}
          >
            {/* Visual Pin Indicator Dot */}
            <div
              style={{
                position: 'absolute',
                left: (pinHitSize - pinDotSize) / 2,
                top: (pinHitSize - pinDotSize) / 2,
                width: pinDotSize,
                height: pinDotSize,
                borderRadius: '50%',
                background: pinActive ? (isHovered ? '#16a34a' : '#22c55e') : (isHovered ? '#fecaca' : '#eef6ff'),
                border: `1px solid ${pinActive ? (isHovered ? '#14532d' : '#16a34a') : (isHovered ? '#dc2626' : '#7f93aa')}`,
                boxShadow: pinActive ? (isHovered ? '0 0 0 4px rgba(34,197,94,0.18)' : '0 1px 2px rgba(15,23,42,0.1)') : '0 1px 2px rgba(15,23,42,0.1)',
                opacity: showPin ? 1 : 0,
                transition: 'all 0.15s ease',
                pointerEvents: 'none',
              }}
            />

            {/* Pin label tooltip shown when hovering */}
            {isHovered && (pin.label || pin.description) && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '120%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#0f172a',
                  color: '#f8fafc',
                  fontSize: 10,
                  lineHeight: 1.25,
                  padding: '5px 7px',
                  borderRadius: 4,
                  minWidth: 80,
                  maxWidth: 180,
                  whiteSpace: 'normal',
                  pointerEvents: 'none',
                  border: '1px solid #334155',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  zIndex: 20,
                }}
              >
                {pin.label && (
                  <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {pin.label}
                  </div>
                )}
                {pin.description && (
                  <div style={{ marginTop: pin.label ? 2 : 0, color: '#cbd5e1' }}>
                    {pin.description}
                  </div>
                )}
              </div>
            )}

            {/* React Flow Handle — Invisible interaction layer positioned over layout coordinate pins */}
            {(['source', 'target'] as const).map((handleType) => (
              <Handle
                key={handleType}
                id={pin.id}
                type={handleType}
                position={handlePosition}
                className="circuit-handle"
                title={pin.label}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  borderRadius: '50%',
                  cursor: 'crosshair',
                }}
              />
            ))}
          </div>
        );
      })}

      {/* Universal Component Info Badge and Popup overlay */}
      {showWarning && (
        <InfoButton
          severity={status.severity as 'warning' | 'error'}
          onClick={(e) => {
            e.stopPropagation();
            setPopupOpen(!popupOpen);
          }}
        />
      )}

      {showInfo && (
        <InfoButton
          severity="info"
          onClick={(e) => {
            e.stopPropagation();
            setPopupOpen(!popupOpen);
          }}
        />
      )}

      {isPopupVisible && (
        <InfoPopup
          status={status}
          onClose={() => setPopupOpen(false)}
        />
      )}

      <style jsx>{`
        .component-spark-effect {
          position: absolute;
          left: 50%;
          top: 42%;
          width: 58px;
          height: 58px;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 12;
        }

        .spark-core {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 30px;
          height: 30px;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: radial-gradient(circle, rgba(255, 245, 157, 0.95) 0 15%, rgba(249, 115, 22, 0.78) 38%, rgba(239, 68, 68, 0) 72%);
          filter: blur(1px);
          animation: component-spark-pulse 0.62s ease-in-out infinite;
        }

        .spark-bolt {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 4px;
          height: 26px;
          transform-origin: center top;
          background: linear-gradient(#fff7ad, #f97316 55%, rgba(249, 115, 22, 0));
          clip-path: polygon(42% 0, 100% 0, 58% 42%, 100% 42%, 28% 100%, 44% 52%, 0 52%);
          animation: component-spark-bolt 0.74s ease-in-out infinite;
        }

        .spark-bolt-a {
          transform: rotate(26deg) translateY(-7px);
        }

        .spark-bolt-b {
          transform: rotate(134deg) translateY(-6px);
          animation-delay: 0.16s;
        }

        .spark-bolt-c {
          transform: rotate(250deg) translateY(-8px);
          animation-delay: 0.3s;
        }

        .spark-smoke {
          position: absolute;
          left: 50%;
          top: 42%;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(31, 41, 55, 0.42), rgba(31, 41, 55, 0));
          filter: blur(2px);
          animation: component-spark-smoke 1.7s ease-out infinite;
        }

        .spark-smoke-b {
          left: 62%;
          animation-delay: 0.42s;
        }

        @keyframes component-spark-pulse {
          0%, 100% {
            opacity: 0.38;
            transform: translate(-50%, -50%) scale(0.82);
          }
          50% {
            opacity: 0.95;
            transform: translate(-50%, -50%) scale(1.1);
          }
        }

        @keyframes component-spark-bolt {
          0%, 100% {
            opacity: 0.2;
          }
          45% {
            opacity: 0.95;
          }
        }

        @keyframes component-spark-smoke {
          0% {
            opacity: 0;
            transform: translate(-50%, 8px) scale(0.65);
          }
          22% {
            opacity: 0.62;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -24px) scale(1.45);
          }
        }
      `}</style>
    </div>
  );
}
