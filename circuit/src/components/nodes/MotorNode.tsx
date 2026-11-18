import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import { useEffect, useMemo, useState, useRef } from 'react';
import type { CircuitNode } from '@cs/lib/types';

function getWireBatteryX(edge: { source: string; target: string; data?: Record<string, unknown> }, batteryId: string, fallbackX: number) {
  const waypoints = edge.data?.waypoints;
  if (Array.isArray(waypoints) && waypoints.length > 0) {
    const point = edge.source === batteryId ? waypoints[0] : edge.target === batteryId ? waypoints[waypoints.length - 1] : null;
    if (point && typeof point === 'object' && 'x' in point && typeof point.x === 'number') return point.x;
  }
  return fallbackX;
}

export function DCMotorNode(props: NodeProps<CircuitNode>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const motorDef = getComponentDefinition(props.data.componentType || props.type || 'dcmotor')!;
  const motorSvgSrc =
    props.data.componentType === 'vibrationMotor'
      ? '/parts/vibration-motor.svg'
      : props.data.componentType === 'hobbyGearmotor'
        ? '/parts/hobby-gearmotor.svg'
        : '/parts/dcmotor.svg';
  const motorState = useCircuitStore((s) => s.simulationFrame?.components[props.id]);
  const isSimulating = useCircuitStore((s) => s.isSimulating);
  const nodes = useCircuitStore((s) => s.nodes);
  const edges = useCircuitStore((s) => s.edges);
  const drive = motorState?.brightness ?? 0;
  const rpm = Number(motorState?.telemetry?.rpm ?? 0);
  const motorVoltage = Number(motorState?.telemetry?.voltage ?? motorState?.voltage ?? 0);
  const direction = String(motorState?.telemetry?.direction ?? 'forward');
  const openCircuit = Boolean(motorState?.telemetry?.openCircuit === true);
  const visualDirection = useMemo(() => {
    const batteryTypes = new Set(['battery9v', 'battery1_5v', 'coincell']);
    const motorEdges = edges.filter((edge) => edge.source === props.id || edge.target === props.id);

    for (const battery of nodes) {
      if (!batteryTypes.has(battery.data.componentType)) continue;
      const pin1Edge = motorEdges.find(
        (edge) =>
          (edge.source === props.id && edge.sourceHandle === 'pin1' && edge.target === battery.id) ||
          (edge.target === props.id && edge.targetHandle === 'pin1' && edge.source === battery.id)
      );
      const pin2Edge = motorEdges.find(
        (edge) =>
          (edge.source === props.id && edge.sourceHandle === 'pin2' && edge.target === battery.id) ||
          (edge.target === props.id && edge.targetHandle === 'pin2' && edge.source === battery.id)
      );
      if (!pin1Edge || !pin2Edge) continue;

      const pin1BatteryX = getWireBatteryX(pin1Edge, battery.id, battery.position.x + 20);
      const pin2BatteryX = getWireBatteryX(pin2Edge, battery.id, battery.position.x + 43);
      return pin2BatteryX > pin1BatteryX ? 'forward' : 'reverse';
    }

    return direction;
  }, [direction, edges, nodes, props.id]);
  const rotationLabel = visualDirection === 'reverse' ? 'CCW' : 'CW';
  const rpmValue = Math.max(0, Math.round(Math.abs(rpm)));
  const effectiveDrive = Math.max(drive, Math.min(1, Math.abs(motorVoltage) / 9), Math.min(1, rpmValue / 2400));
  const spinning = isSimulating && motorState?.isPowered === true && effectiveDrive > 0 && !openCircuit;
  const armSize = Math.max(0.5, Math.min(2, Number(props.data.properties?.armSize?.value ?? 1)));
  const spinDuration = Math.max(0.08, 0.75 - effectiveDrive * 0.67);
  const spinAnimation = visualDirection === 'reverse' ? 'dc-motor-ring-spin-reverse' : 'dc-motor-ring-spin-forward';
  const armAnimation = visualDirection === 'reverse' ? 'dc-motor-arm-spin-reverse' : 'dc-motor-arm-spin-forward';
  const shaftAnimation = visualDirection === 'reverse' ? 'dc-motor-shaft-rotate-reverse' : 'dc-motor-shaft-rotate-forward';
  const notchAnimation = visualDirection === 'reverse' ? 'dc-motor-shaft-notch-rotate-reverse' : 'dc-motor-shaft-notch-rotate-forward';
  const spinStyle = spinning
    ? {
        animationName: spinAnimation,
        animationDuration: `${spinDuration}s`,
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
      }
    : undefined;
  const [motorSvg, setMotorSvg] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(motorSvgSrc)
      .then((response) => response.text())
      .then((svg) => {
        if (!cancelled) setMotorSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setMotorSvg('');
      });
    return () => {
      cancelled = true;
    };
  }, [motorSvgSrc]);

  useEffect(() => {
    if (!containerRef.current) return;
    const rpmTextEl = containerRef.current.querySelector('.cgfx__rpm');
    if (rpmTextEl) {
      const signedRpm = spinning ? (direction === 'reverse' ? -rpmValue : rpmValue) : 0;
      rpmTextEl.textContent = `${signedRpm} RPM`;
      rpmTextEl.setAttribute('display', 'inline');
    }
  });

  return (
    <BaseCircuitNode {...props} width={motorDef.defaultWidth} height={motorDef.defaultHeight} pins={motorDef.pins}>
      <div ref={containerRef} className={spinning ? `dc-motor-svg spinning spin-${visualDirection === 'reverse' ? 'reverse' : 'forward'}` : 'dc-motor-svg'}>
        {motorSvg ? (
          <div
            className="dc-motor-inline"
            dangerouslySetInnerHTML={{ __html: motorSvg }}
          />
        ) : (
          <svg width={motorDef.defaultWidth} height={motorDef.defaultHeight} viewBox={`0 0 ${motorDef.defaultWidth} ${motorDef.defaultHeight}`}>
            <circle cx="50" cy="50" r="30" fill="#c9c9c9" stroke="#777" strokeWidth="2" />
            <text x="50" y="56" textAnchor="middle" fontSize="18" fill="#4b5563" fontWeight="bold">M</text>
            <line x1="40" y1="86" x2="40" y2="112" stroke="#666" strokeWidth="2" />
            <line x1="60" y1="86" x2="60" y2="112" stroke="#ef4444" strokeWidth="2" />
          </svg>
        )}
        {spinning && props.data.componentType !== 'hobbyGearmotor' && (
          <div
            className="motor-speed"
            style={{
              opacity: 0.35 + Math.min(0.55, effectiveDrive * 0.55),
              animationName: spinAnimation,
              animationDuration: `${spinDuration}s`,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
            }}
          />
        )}
        {/* When openCircuit is true the motor will not spin (no visible badge) */}
        {props.data.componentType !== 'hobbyGearmotor' && (
          <div
            className="visible-fan"
            style={spinStyle}
          >
            <span className="fan-blade blade-a" />
            <span className="fan-blade blade-b" />
            <span className="fan-blade blade-c" />
            <span className="fan-blade blade-d" />
            <span className="fan-hub" />
            <span className="fan-direction-dot" />
          </div>
        )}
        {spinning && <div className={`rotation-badge ${visualDirection === 'reverse' ? 'rotation-reverse' : 'rotation-forward'}`}>{rotationLabel}</div>}
        {props.data.componentType !== 'hobbyGearmotor' && <div className="rpm-badge">{spinning ? rpmValue : 0} RPM</div>}
      </div>

      {/* no open-circuit badge: motor remains inactive when openCircuit is true */}

      <style jsx>{`
        .dc-motor-svg {
          position: relative;
          width: ${motorDef.defaultWidth}px;
          height: ${motorDef.defaultHeight}px;
          pointer-events: none;
          user-select: none;
        }

        .dc-motor-inline {
          width: 100%;
          height: 100%;
        }

        .dc-motor-inline :global(svg) {
          width: 100%;
          height: 100%;
          display: block;
          overflow: visible;
        }

        /* Standard DC motor propeller animation */
        .spinning .dc-motor-inline:not(.cgfx__motor-hobby-gear) :global(.cgfx__arm) {
          transform-box: fill-box;
          transform-origin: center;
          animation-name: ${armAnimation};
          animation-duration: ${spinDuration}s;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        /* Hobby gear motor 3D shaft rotation animation */
        .spinning .dc-motor-inline :global(.cgfx__motor-hobby-gear) :global(.cgfx__arm),
        .spinning .dc-motor-inline :global(.cgfx__motor-hobby-gear) :global(.cgfx__arm_flat) {
          transform-box: fill-box;
          transform-origin: center;
          animation-name: ${shaftAnimation};
          animation-duration: ${spinDuration}s;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        /* Hobby gear motor 3D shaft notches rotation animation */
        .spinning .dc-motor-inline :global(.cgfx__motor-hobby-gear) :global(.cgfx__arm_notch_l),
        .spinning .dc-motor-inline :global(.cgfx__motor-hobby-gear) :global(.cgfx__arm_notch_r) {
          transform-box: fill-box;
          transform-origin: center;
          animation-name: ${notchAnimation};
          animation-duration: ${spinDuration}s;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        .motor-speed {
          position: absolute;
          left: 50%;
          top: 31%;
          width: 46px;
          height: 46px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          border: 2px solid rgba(148, 163, 184, 0.55);
          border-left-color: transparent;
          border-right-color: transparent;
        }

        .visible-fan {
          position: absolute;
          left: 50%;
          top: 31%;
          width: ${44 * armSize}px;
          height: ${44 * armSize}px;
          transform: translate(-50%, -50%);
          pointer-events: none;
          opacity: 0.95;
        }

        .fan-blade {
          position: absolute;
          left: 50%;
          top: 50%;
          width: ${7 * armSize}px;
          height: ${19 * armSize}px;
          margin-left: ${-3.5 * armSize}px;
          margin-top: ${-19 * armSize}px;
          transform-origin: 50% 100%;
          border-radius: 999px 999px 45% 45%;
          background: linear-gradient(#fef08a, #facc15 55%, #eab308);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
        }

        .blade-a {
          transform: rotate(0deg);
        }

        .blade-b {
          transform: rotate(90deg);
        }

        .blade-c {
          transform: rotate(180deg);
        }

        .blade-d {
          transform: rotate(270deg);
        }

        .fan-hub {
          position: absolute;
          left: 50%;
          top: 50%;
          width: ${10 * armSize}px;
          height: ${10 * armSize}px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: #fde047;
          border: 1px solid #ca8a04;
          box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.55);
        }

        .fan-direction-dot {
          position: absolute;
          left: 50%;
          top: 50%;
          width: ${5 * armSize}px;
          height: ${5 * armSize}px;
          margin-left: ${9 * armSize}px;
          margin-top: ${-16 * armSize}px;
          border-radius: 999px;
          background: #f97316;
          box-shadow: 0 0 4px rgba(249, 115, 22, 0.85);
        }

        .rotation-badge {
          position: absolute;
          left: 50%;
          top: 62%;
          transform: translateX(-50%);
          min-width: 34px;
          border-radius: 999px;
          padding: 2px 5px;
          text-align: center;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0;
          color: white;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.2);
        }

        .rotation-forward {
          background: #16a34a;
        }

        .rotation-reverse {
          background: #dc2626;
        }

        .rpm-badge {
          position: absolute;
          left: 50%;
          top: 78%;
          transform: translateX(-50%);
          min-width: 52px;
          border-radius: 4px;
          padding: 2px 5px;
          text-align: center;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0;
          color: #0f172a;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(148, 163, 184, 0.65);
          box-shadow: 0 2px 5px rgba(15, 23, 42, 0.12);
        }

        @keyframes dc-motor-arm-spin-forward {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes dc-motor-arm-spin-reverse {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(-360deg);
          }
        }

        @keyframes dc-motor-shaft-rotate-forward {
          from {
            transform: rotateX(0deg);
          }
          to {
            transform: rotateX(360deg);
          }
        }

        @keyframes dc-motor-shaft-rotate-reverse {
          from {
            transform: rotateX(0deg);
          }
          to {
            transform: rotateX(-360deg);
          }
        }

        @keyframes dc-motor-shaft-notch-rotate-forward {
          0% {
            transform: translateY(0px) scaleY(1);
            opacity: 1;
          }
          25% {
            transform: translateY(-4.5px) scaleY(0);
            opacity: 0.5;
          }
          50% {
            transform: translateY(0px) scaleY(-1);
            opacity: 0;
          }
          75% {
            transform: translateY(4.5px) scaleY(0);
            opacity: 0.5;
          }
          100% {
            transform: translateY(0px) scaleY(1);
            opacity: 1;
          }
        }

        @keyframes dc-motor-shaft-notch-rotate-reverse {
          0% {
            transform: translateY(0px) scaleY(1);
            opacity: 1;
          }
          25% {
            transform: translateY(4.5px) scaleY(0);
            opacity: 0.5;
          }
          50% {
            transform: translateY(0px) scaleY(-1);
            opacity: 0;
          }
          75% {
            transform: translateY(-4.5px) scaleY(0);
            opacity: 0.5;
          }
          100% {
            transform: translateY(0px) scaleY(1);
            opacity: 1;
          }
        }

        @keyframes dc-motor-ring-spin-forward {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }

        @keyframes dc-motor-ring-spin-reverse {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(-360deg);
          }
        }
      `}</style>
      <style jsx global>{`
        @keyframes dc-motor-ring-spin-forward {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }

        @keyframes dc-motor-ring-spin-reverse {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(-360deg);
          }
        }
      `}</style>
    </BaseCircuitNode>
  );
}

export function ServoNode(props: NodeProps<CircuitNode>) {
  const active = useCircuitStore((s) => (s.simulationFrame?.components[props.id]?.brightness ?? 0) > 0);
  const defServo = getComponentDefinition(props.data.componentType || props.type || 'servo')!;

  return (
    <BaseCircuitNode {...props} width={defServo.defaultWidth} height={defServo.defaultHeight} pins={defServo.pins}>
      <svg width={80} height={70} viewBox="0 0 80 70">
        {/* Servo body */}
        <rect x="5" y="5" width="70" height="40" rx="3" fill="#3366aa" stroke="#224488" strokeWidth="1.5" />
        {/* Mounting tabs */}
        <rect x="0" y="15" width="8" height="10" rx="2" fill="#3366aa" stroke="#224488" strokeWidth="1" />
        <rect x="72" y="15" width="8" height="10" rx="2" fill="#3366aa" stroke="#224488" strokeWidth="1" />
        {/* Servo horn */}
        <circle cx="60" cy="25" r="10" fill="#444" stroke="#666" strokeWidth="1" />
        <line x1="60" y1="25" x2="60" y2="15" stroke={active ? '#f8fafc' : '#888'} strokeWidth="2" />
        <circle cx="60" cy="25" r="3" fill="#888" />
        {/* Label */}
        <text x="30" y="30" textAnchor="middle" fontSize="8" fill="#fff">SERVO</text>
        {/* Wire leads */}
        <line x1="25" y1="45" x2="25" y2="70" stroke="#f97316" strokeWidth="2" />
        <line x1="40" y1="45" x2="40" y2="70" stroke="#ef4444" strokeWidth="2" />
        <line x1="55" y1="45" x2="55" y2="70" stroke="#8B4513" strokeWidth="2" />
      </svg>
    </BaseCircuitNode>
  );
}
