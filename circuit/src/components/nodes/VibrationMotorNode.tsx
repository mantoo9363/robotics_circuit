import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import { useEffect, useRef } from 'react';
import type { CircuitNode } from '@cs/lib/types';

export function VibrationMotorNode(props: NodeProps<CircuitNode>) {
  const motorDef = getComponentDefinition(props.data.componentType || props.type || 'vibrationMotor')!;

  const motorState = useCircuitStore((s) => s.simulationFrame?.components[props.id]);
  const isSimulating = useCircuitStore((s) => s.isSimulating);

  // Read state and telemetry properties
  const isPowered = motorState?.isPowered ?? false;
  const vibrationIntensity = motorState?.brightness ?? 0;
  const appliedVoltage = motorState?.voltage ?? 0;

  const telemetry = motorState?.telemetry ?? {};
  const status = telemetry.status ?? 'OFF';
  const isBurnt = telemetry.burnt === true;
  const isOvervoltage = status === 'OVERVOLTAGE';

  // Read options from properties
  const soundEnabled = props.data.properties?.soundEnabled?.value !== 'off';
  const vibrationRingsEnabled = props.data.properties?.vibrationRingsEnabled?.value !== 'off';
  const maxVoltage = Number(props.data.properties?.maxVoltage?.value ?? 5);

  const spinning = isSimulating && isPowered && vibrationIntensity > 0 && !isBurnt && appliedVoltage >= 2.5;

  // Web Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  // Control Buzz Sound
  useEffect(() => {
    if (spinning && soundEnabled) {
      try {
        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            audioCtxRef.current = new AudioContextClass();
          }
        }

        const ctx = audioCtxRef.current;
        if (ctx) {
          if (ctx.state === 'suspended') {
            ctx.resume();
          }

          if (!oscRef.current) {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(250, ctx.currentTime);

            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(0, ctx.currentTime);

            osc.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.start();
            oscRef.current = osc;
            filterRef.current = filter;
            gainRef.current = gainNode;
          }

          if (oscRef.current && gainRef.current) {
            const ctxNow = ctx.currentTime;
            // Scale pitch: 65Hz to 140Hz based on current applied voltage relative to max voltage
            const pitch = 65 + Math.min(1.0, appliedVoltage / maxVoltage) * 75;
            oscRef.current.frequency.setTargetAtTime(pitch, ctxNow, 0.05);

            // Scale volume: max gain of 0.15 to avoid hurting user ears
            const vol = 0.01 + vibrationIntensity * 0.12;
            gainRef.current.gain.setTargetAtTime(vol, ctxNow, 0.05);
          }
        }
      } catch (err) {
        console.warn('Web Audio failure:', err);
      }
    } else {
      // Fade out sound
      if (gainRef.current && audioCtxRef.current) {
        try {
          gainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
        } catch (e) {}
      }

      const timeoutId = setTimeout(() => {
        if (oscRef.current) {
          try {
            oscRef.current.stop();
            oscRef.current.disconnect();
          } catch (e) {}
          oscRef.current = null;
        }
        if (filterRef.current) {
          try {
            filterRef.current.disconnect();
          } catch (e) {}
          filterRef.current = null;
        }
        if (gainRef.current) {
          try {
            gainRef.current.disconnect();
          } catch (e) {}
          gainRef.current = null;
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [spinning, soundEnabled, appliedVoltage, maxVoltage, vibrationIntensity]);

  // Clean up audio context on unmount
  useEffect(() => {
    return () => {
      if (oscRef.current) {
        try { oscRef.current.stop(); } catch (e) {}
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
      }
    };
  }, []);

  // Determine shake animation duration
  const shakeDuration = spinning ? Math.max(0.04, 0.16 - vibrationIntensity * 0.11) : 0;

  // Determine warnings classes
  const showWarningGlow = status === 'WARNING';
  const showDangerGlow = status === 'OVERVOLTAGE';
  const showBurstSymbol = isBurnt || showDangerGlow;

  return (
    <BaseCircuitNode {...props} width={motorDef.defaultWidth} height={motorDef.defaultHeight} pins={motorDef.pins}>
      <div
        className={`vibration-motor-wrapper ${showWarningGlow ? 'glow-warning' : ''} ${showDangerGlow ? 'glow-danger' : ''}`}
        style={{
          position: 'relative',
          width: `${motorDef.defaultWidth}px`,
          height: `${motorDef.defaultHeight}px`,
        }}
      >
        <div
          className={`vibration-motor-container ${spinning ? 'shaking' : ''}`}
          style={{
            width: '100%',
            height: '100%',
            animationDuration: shakeDuration ? `${shakeDuration}s` : undefined,
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="cgfx__motor-vibration" viewBox="-50 -105 100 155" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            {/* Wire Leads */}
            <g transform="translate(-51 -126)">
              <line x1="46" y1="121" x2="46" y2="126" fill="none" stroke="#8c8c8c" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="1.25" />
              <path d="M-6-5h2V-25c0-4,3-6,3-10V-59H-3v24c0,3-3,6-3,10Z" transform="translate(51 126)" fill="#414042" stroke="#231f20" strokeMiterlimit="10" strokeWidth="0.5" />
              <path d="M-3-51h2v-6H-3Z" transform="translate(51 126)" fill="#231f20" opacity="0.5" />
            </g>
            <g transform="translate(-51 -126)">
              <line id="Wire2-2" x1="56" y1="121" x2="56" y2="126" fill="none" stroke="#8c8c8c" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="1.25" />
              <path d="M6-5H4V-25c0-4-3-6-3-10V-59H3v24c0,3,3,6,3,10Z" transform="translate(51 126)" fill="#ed1c24" stroke="#8b0304" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="0.5" />
              <path d="M1-51H3v-6H1Z" transform="translate(51 126)" fill="#860101" opacity="0.5" />
            </g>

            {/* Selection indicator paths */}
            {props.selected && (
              <g transform="translate(-51 -126)">
                <line fill="none" stroke="#3b8ed7" strokeWidth="2" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" x1="46" y1="121" x2="46" y2="126" />
                <path style={{ fill: '#3b8ed7', stroke: 'none' }} d="M-6-5h2V-25c0-4,3-6,3-10V-59H-3v24c0,3-3,6-3,10Z" transform="translate(51 126)" />
                <path style={{ fill: '#3b8ed7', stroke: 'none' }} d="M-3-51h2v-6H-3Z" transform="translate(51 126)" />
                <line fill="none" stroke="#3b8ed7" strokeWidth="2" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" x1="56" y1="121" x2="56" y2="126" />
                <path style={{ fill: '#3b8ed7', stroke: 'none' }} d="M6-5H4V-25c0-4-3-6-3-10V-59H3v24c0,3,3,6,3,10Z" transform="translate(51 126)" />
                <path style={{ fill: '#3b8ed7', stroke: 'none' }} d="M1-51H3v-6H1Z" transform="translate(51 126)" />
                <rect fill="#3b8ed7" stroke="#3b8ed7" strokeWidth="3.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" x="46" y="56" width="9" height="12.52" rx="1" ry="1" />
                <circle fill="#3b8ed7" stroke="#3b8ed7" strokeWidth="3.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" cx="51" cy="51" r="14" />
                <circle fill="#3b8ed7" stroke="#3b8ed7" strokeWidth="3.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" cx="51" cy="51" r="12" />
              </g>
            )}

            {/* Motor Body Casing */}
            <g transform="translate(-51 -126)">
              <rect x="46" y="56" width="9" height="12.52" rx="1" ry="1" fill="#a7a9ac" stroke="#5f6062" strokeMiterlimit="10" />
              <circle cx="51" cy="51" r="14" fill="#d1d3d4" stroke="#5f6062" strokeMiterlimit="10" />
              <circle cx="51" cy="51" r="12" fill="#231f20" />
            </g>

            {/* Animated Vibration Rings */}
            {spinning && vibrationRingsEnabled && (
              <g className={`cgfx__animation ${showDangerGlow ? 'rings-danger' : ''}`} style={{ animationDuration: `${shakeDuration * 6}s` }}>
                <circle cx="0" cy="-75" r="14" fill="#d1d3d4" stroke="#5f6062" strokeMiterlimit="10" opacity="0.3" />
                <circle cx="0" cy="-75" r="12" fill="#231f20" opacity="0.3" />
                <g transform="translate(-51 -126)">
                  <path className="cgfx__innerring" d="M17-65a18,18,0,0,0-1-21" transform="translate(51 126)" fill="none" stroke="#7e8083" strokeLinecap="round" strokeMiterlimit="10" />
                  <path className="cgfx__innerring" d="M-17-65a18,18,0,0,1,1-21" transform="translate(51 126)" fill="none" stroke="#7e8083" strokeLinecap="round" strokeMiterlimit="10" />
                  <path className="cgfx__middlering" d="M19-63a21,21,0,0,0-1-25" transform="translate(51 126)" fill="none" stroke="#7e8083" strokeLinecap="round" strokeMiterlimit="10" />
                  <path className="cgfx__middlering" d="M-19-63a21,21,0,0,1,1-25" transform="translate(51 126)" fill="none" stroke="#7e8083" strokeLinecap="round" strokeMiterlimit="10" />
                  <path className="cgfx__outerring" d="M20-90a24,24,0,0,1,1,28" transform="translate(51 126)" fill="none" stroke="#7e8083" strokeLinecap="round" strokeMiterlimit="10" />
                  <path className="cgfx__outerring" d="M-20-90a24,24,0,0,0-1,28" transform="translate(51 126)" fill="none" stroke="#7e8083" strokeLinecap="round" strokeMiterlimit="10" />
                </g>
              </g>
            )}

            {/* Breakdown/Burst Symbol */}
            {showBurstSymbol && (
              <polygon
                className={`cgfx__breakdown ${isBurnt ? 'breakdown-burnt' : 'breakdown-danger'}`}
                transform="translate(0,-74) rotate(0) scale(2.4,2.4)"
                style={{ strokeMiterlimit: 10 }}
                points="2.415,-5.161 7.901,-7.299 5.471,-2.294 11.953,-0.565 5.126,1.63 8.332,8.197 2.59,5.053 -0.137,10.527 -2.24,4.375 -7.565,7.957 -6.133,2.443 -11.953,0.87 -5.945,-1.796 -8.854,-7.513 -3.289,-5.371 -1.401,-10.527"
              />
            )}
          </svg>
        </div>

        {/* Real-time telemetry badges inside editor */}
        {isSimulating && (
          <div className="vib-badge text-center">
            {isBurnt ? 'FAILED' : (spinning ? `Vibe: ${(vibrationIntensity * 100).toFixed(0)}%` : 'OFF')}
          </div>
        )}
      </div>

      <style jsx>{`
        .vibration-motor-wrapper {
          position: relative;
          border-radius: 50%;
          transition: box-shadow 0.25s ease;
        }

        .vibration-motor-container {
          position: relative;
          pointer-events: none;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Warning auras */
        .glow-warning {
          box-shadow: 0 0 15px 5px rgba(234, 179, 8, 0.65);
          animation: warning-pulse 1s infinite alternate ease-in-out;
        }

        .glow-danger {
          box-shadow: 0 0 20px 8px rgba(239, 68, 68, 0.8);
          animation: danger-pulse 0.4s infinite alternate ease-in-out;
        }

        /* Shaking container */
        .shaking {
          animation-name: vibration-shake;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
        }

        .vib-badge {
          position: absolute;
          bottom: -4px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(15, 23, 42, 0.85);
          color: #fff;
          font-size: 8px;
          font-weight: 800;
          padding: 1px 4px;
          border-radius: 3px;
          min-width: 40px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.25);
          pointer-events: none;
        }

        /* Ring expansion and decay styling */
        .cgfx__innerring {
          animation: inner-ring-pulse 1s infinite ease-out;
          transform-origin: 51px 51px;
        }

        .cgfx__middlering {
          animation: middle-ring-pulse 1s infinite ease-out 0.25s;
          transform-origin: 51px 51px;
        }

        .cgfx__outerring {
          animation: outer-ring-pulse 1s infinite ease-out 0.5s;
          transform-origin: 51px 51px;
        }

        /* Danger state rings override (red) */
        .rings-danger :global(.cgfx__innerring),
        .rings-danger :global(.cgfx__middlering),
        .rings-danger :global(.cgfx__outerring) {
          stroke: #ef4444 !important;
        }

        /* Burst symbols */
        .breakdown-danger {
          fill: #f59e0b;
          stroke: #ef4444;
          animation: danger-flash 0.3s infinite alternate linear;
        }

        .breakdown-burnt {
          fill: #4b5563;
          stroke: #1f2937;
          opacity: 0.9;
        }

        /* CSS Keyframe Animations */
        @keyframes vibration-shake {
          0% { transform: translate(0px, 0px) rotate(0deg); }
          20% { transform: translate(-1px, 1px) rotate(-0.5deg); }
          40% { transform: translate(-1px, -1px) rotate(0.5deg); }
          60% { transform: translate(1px, 1px) rotate(0deg); }
          80% { transform: translate(1px, -1px) rotate(-0.5deg); }
          100% { transform: translate(0px, 0px) rotate(0deg); }
        }

        @keyframes warning-pulse {
          0% { box-shadow: 0 0 10px 2px rgba(234, 179, 8, 0.4); }
          100% { box-shadow: 0 0 20px 8px rgba(234, 179, 8, 0.8); }
        }

        @keyframes danger-pulse {
          0% { box-shadow: 0 0 12px 3px rgba(239, 68, 68, 0.5); }
          100% { box-shadow: 0 0 25px 12px rgba(239, 68, 68, 0.95); }
        }

        @keyframes danger-flash {
          0% { opacity: 0.4; }
          100% { opacity: 1; }
        }

        @keyframes inner-ring-pulse {
          0% { opacity: 0; transform: scale(0.9); }
          25% { opacity: 0.85; }
          100% { opacity: 0; transform: scale(1.15); }
        }

        @keyframes middle-ring-pulse {
          0% { opacity: 0; transform: scale(0.85); }
          30% { opacity: 0.85; }
          100% { opacity: 0; transform: scale(1.25); }
        }

        @keyframes outer-ring-pulse {
          0% { opacity: 0; transform: scale(0.8); }
          35% { opacity: 0.85; }
          100% { opacity: 0; transform: scale(1.35); }
        }
      `}</style>
    </BaseCircuitNode>
  );
}
