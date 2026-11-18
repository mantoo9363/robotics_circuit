import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

export function NeopixelNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'neopixel')!;
  const component = useCircuitStore((s) => s.simulationFrame?.components[props.id]);
  const isPowered = component?.isPowered ?? false;
  const brightness = Number(component?.brightness ?? 0);
  
  const red = Number(component?.telemetry?.red ?? 0);
  const green = Number(component?.telemetry?.green ?? 0);
  const blue = Number(component?.telemetry?.blue ?? 0);

  const glowing = isPowered && brightness > 0 && (red > 0 || green > 0 || blue > 0);

  // Compute displayed color channels
  // Luminous Gamma-Correction Boost (gamma = 0.6)
  const boost = (val: number) => {
    if (val <= 0) return 0;
    return Math.round(255 * Math.pow(val / 255, 0.6) * brightness);
  };
  const dispR = boost(red);
  const dispG = boost(green);
  const dispB = boost(blue);
  const colorStr = `rgb(${dispR}, ${dispG}, ${dispB})`;

  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <div style={{ position: 'relative', width: def.defaultWidth, height: def.defaultHeight }}>
        {/* HTML Diffuse Halo */}
        {glowing && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 120,
              height: 120,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(${dispR}, ${dispG}, ${dispB}, ${0.7 + brightness * 0.25}) 0 15%, rgba(${dispR}, ${dispG}, ${dispB}, ${0.25 + brightness * 0.15}) 45%, rgba(${dispR}, ${dispG}, ${dispB}, 0) 75%)`,
              filter: 'blur(5px)',
              pointerEvents: 'none',
              mixBlendMode: 'screen',
              zIndex: 1,
            }}
          />
        )}

        <svg
          width={def.defaultWidth}
          height={def.defaultHeight}
          viewBox="-50 -50 100 100"
          role="img"
          aria-label="NeoPixel WS2812B"
          style={{ display: 'block', overflow: 'visible', pointerEvents: 'none', position: 'relative', zIndex: 2 }}
        >
          <defs>
            {/* Radial glow gradient if glowing */}
            {glowing && (
              <radialGradient id={`glowGrad-${props.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={colorStr} stopOpacity={0.8} />
                <stop offset="60%" stopColor={colorStr} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colorStr} stopOpacity={0} />
              </radialGradient>
            )}
            {/* 3D Lens sphere gradient */}
            {glowing && (
              <radialGradient id={`lensGrad-${props.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity={1.0} />
                <stop offset="30%" stopColor={`rgb(${Math.min(255, dispR + 80)}, ${Math.min(255, dispG + 80)}, ${Math.min(255, dispB + 80)})`} stopOpacity={0.95} />
                <stop offset="70%" stopColor={colorStr} stopOpacity={0.9} />
                <stop offset="100%" stopColor={`rgb(${Math.max(0, dispR - 40)}, ${Math.max(0, dispG - 40)}, ${Math.max(0, dispB - 40)})`} stopOpacity={0.95} />
              </radialGradient>
            )}
          </defs>

          {/* Selected outline path */}
          <path
            className="cgfx__selected"
            fill="none"
            stroke="#3b8ed7"
            strokeLinecap="round"
            strokeLinejoin="round"
            display="none"
            strokeWidth="3"
            d="M10,25a10,10 0,0,0 10,-10v-30a10,10 0,0,0 -10,-10h-20a10,10 0,0,0 -10,10v30a10,10 0,0,0 10,10zM19,0a4,4 0,0,0 -8,0a4,4 0,0,0 8,0zM-19,0a4,4 0,0,0 8,0a4,4 0,0,0 -8,0z"
          />

          {/* PCB Board background */}
          <path
            d="M10,25a10,10 0,0,0 10,-10v-30a10,10 0,0,0 -10,-10h-20a10,10 0,0,0 -10,10v30a10,10 0,0,0 10,10zM19,0a4,4 0,0,0 -8,0a4,4 0,0,0 8,0zM-19,0a4,4 0,0,0 8,0a4,4 0,0,0 -8,0z"
            fillRule="evenodd"
            fill="#114466"
          />

          {/* Terminal Pads: Top Row (-10, -20), (0, -20), (10, -20) */}
          <g className="cgfx__pth" transform="translate(-10, -20)">
            <circle fill="#BFBFBF" cx="0" cy="0" r="2.941" />
            <path opacity="0.3" d="M-1.199,1.102C-1.147,1.719-0.63,2.203,0,2.203c0.665,0,1.203-0.539,1.203-1.203V0h-2.407C-1.203,0-1.202,1.068-1.199,1.102z" />
            <circle fill="#DDDDDD" stroke="#898989" strokeWidth="0.15" strokeMiterlimit="10" cx="0" cy="0" r="1.203" />
          </g>
          <g className="cgfx__pth" transform="translate(0, -20)">
            <circle fill="#BFBFBF" cx="0" cy="0" r="2.941" />
            <path opacity="0.3" d="M-1.199,1.102C-1.147,1.719-0.63,2.203,0,2.203c0.665,0,1.203-0.539,1.203-1.203V0h-2.407C-1.203,0-1.202,1.068-1.199,1.102z" />
            <circle fill="#DDDDDD" stroke="#898989" strokeWidth="0.15" strokeMiterlimit="10" cx="0" cy="0" r="1.203" />
          </g>
          <g className="cgfx__pth" transform="translate(10, -20)">
            <circle fill="#BFBFBF" cx="0" cy="0" r="2.941" />
            <path opacity="0.3" d="M-1.199,1.102C-1.147,1.719-0.63,2.203,0,2.203c0.665,0,1.203-0.539,1.203-1.203V0h-2.407C-1.203,0-1.202,1.068-1.199,1.102z" />
            <circle fill="#DDDDDD" stroke="#898989" strokeWidth="0.15" strokeMiterlimit="10" cx="0" cy="0" r="1.203" />
          </g>

          {/* Terminal Pads: Bottom Row (-10, 20), (0, 20), (10, 20) */}
          <g className="cgfx__pth" transform="translate(-10, 20)">
            <circle fill="#BFBFBF" cx="0" cy="0" r="2.941" />
            <path opacity="0.3" d="M-1.199,1.102C-1.147,1.719-0.63,2.203,0,2.203c0.665,0,1.203-0.539,1.203-1.203V0h-2.407C-1.203,0-1.202,1.068-1.199,1.102z" />
            <circle fill="#DDDDDD" stroke="#898989" strokeWidth="0.15" strokeMiterlimit="10" cx="0" cy="0" r="1.203" />
          </g>
          <g className="cgfx__pth" transform="translate(0, 20)">
            <circle fill="#BFBFBF" cx="0" cy="0" r="2.941" />
            <path opacity="0.3" d="M-1.199,1.102C-1.147,1.719-0.63,2.203,0,2.203c0.665,0,1.203-0.539,1.203-1.203V0h-2.407C-1.203,0-1.202,1.068-1.199,1.102z" />
            <circle fill="#DDDDDD" stroke="#898989" strokeWidth="0.15" strokeMiterlimit="10" cx="0" cy="0" r="1.203" />
          </g>
          <g className="cgfx__pth" transform="translate(10, 20)">
            <circle fill="#BFBFBF" cx="0" cy="0" r="2.941" />
            <path opacity="0.3" d="M-1.199,1.102C-1.147,1.719-0.63,2.203,0,2.203c0.665,0,1.203-0.539,1.203-1.203V0h-2.407C-1.203,0-1.202,1.068-1.199,1.102z" />
            <circle fill="#DDDDDD" stroke="#898989" strokeWidth="0.15" strokeMiterlimit="10" cx="0" cy="0" r="1.203" />
          </g>

          {/* Onboard Components: Resistors and Capacitor */}
          <g className="cgfx__resistor0 cgfx__eg-resistor-onboard" transform="translate(15,-12)">
            <rect fill="#bfbfbf" x="-1.6" y="-4.8" width="3.2" height="9.6" rx="0.5" ry="0.5" />
            <rect fill="#333333" x="-1.6" y="-2" width="3.2" height="4" />
          </g>
          <g className="cgfx__resistor1 cgfx__eg-resistor-onboard" transform="translate(-15,-12)">
            <rect fill="#bfbfbf" x="-1.6" y="-4.8" width="3.2" height="9.6" rx="0.5" ry="0.5" />
            <rect fill="#333333" x="-1.6" y="-2" width="3.2" height="4" />
          </g>
          <g className="cgfx__resistor2 cgfx__eg-resistor-onboard" transform="translate(-15,12)">
            <rect fill="#bfbfbf" x="-1.6" y="-4.8" width="3.2" height="9.6" rx="0.5" ry="0.5" />
            <rect fill="#333333" x="-1.6" y="-2" width="3.2" height="4" />
          </g>
          <g className="cgfx__capacitor cgfx__eg-capacitor-onboard" transform="translate(15,12)">
            <rect fill="#bfbfbf" x="-1.6" y="-4.8" width="3.2" height="9.6" rx="0.5" ry="0.5" />
            <rect fill="#B7AC80" x="-1.6" y="-2" width="3.2" height="4" />
          </g>

          {/* Dynamic Glow Under the LED package */}
          {glowing && (
            <circle
              cx="0"
              cy="0"
              r="35"
              fill={`url(#glowGrad-${props.id})`}
              style={{ mixBlendMode: 'screen' }}
            />
          )}

          {/* Onboard LED Package */}
          <g className="cgfx__neopixel cgfx__led-rgb-onboard" transform="translate(0,0) rotate(180)">
            <rect fill="#bfbfbf" x="-8.75" y="-11.25" width="3.5" height="2" rx="0.5" ry="0.5" />
            <rect fill="#bfbfbf" x="-1.25" y="-11.25" width="3.5" height="2" rx="0.5" ry="0.5" />
            <rect fill="#bfbfbf" x="5.25" y="-11.25" width="3.5" height="2" rx="0.5" ry="0.5" />
            <rect fill="#bfbfbf" x="-8.75" y="9.25" width="3.5" height="2" rx="0.5" ry="0.5" />
            <rect fill="#bfbfbf" x="-1.75" y="9.25" width="3.5" height="2" rx="0.5" ry="0.5" />
            <rect fill="#bfbfbf" x="5.25" y="9.25" width="3.5" height="2" rx="0.5" ry="0.5" />
            <rect fill="#F2F2F2" width="19.5" height="19.5" x="-9.75" y="-9.75" rx="1" ry="1" />
            
            <circle fill="#FFFDFA" stroke="#E0E0E0" strokeWidth="0.8" r="7.9" cx="0" cy="0" />

            {/* Internal Die lead frames */}
            <path fill="#D8D8D8" d="M4.8-5.76L4.8-3.89A.5,.5 0,0,1 4.31-3.39L4.26-3.39A.5,.5 0,0,0 3.76-2.89L3.76-1.16A.5,.5 0,0,0 4.26-.66L7.47-.66A7.5,7.5 0,0,0 4.81-5.76z" />
            <path fill="#D8D8D8" d="M7.43,1.02L3.11,1.02L2.38,1.8L2.38,4.4A.5,.5 0,0,0 2.88,4.9L4.37,4.9A.5,.5 0,0,1 4.87,5.4L4.87,5.71A7.5,7.5 0,0,0 7.43,1.02z" />
            <path fill="#D8D8D8" d="M2.61,7.03L1.26,6.31A.5,.5 0,0,1 1,5.87L1,.47A.5,.5 0,0,1 1.5,.03L2.42-.03L2.42-2.81A.5,.5 0,0,0 1.92-3.31L-1.92-3.31A.5,.5 0,0,0 -2.42-2.81L-2.42-.03L-1.5-.03A.5,.5 0,0,1 -1,.47L-1,5.87A.5,.5 0,0,1 -1.26,6.31L-2.61,7.03A7.5,7.5 0,0,0 2.61,7.03z" />
            <path fill="#D8D8D8" d="M2.84,-6.94L2.84,-4.57L-2.84,-4.57L-2.84,-6.94A7.5,7.5 0,0,1 2.84,-6.94z" />
            <path fill="#D8D8D8" d="M-7.43,1.02L-3.11,1.02L-2.38,1.8L-2.38,4.4A.5,.5 0,0,1 -2.88,4.9L-4.37,4.9A.5,.5 0,0,0 -4.87,5.4L-4.87,5.71A7.5,7.5 0,0,1 -7.43,1.02z" />
            <path fill="#D8D8D8" d="M-4.8-5.76L-4.8-3.89A.5,.5 0,0,0 -4.31-3.39L-4.26-3.39A.5,.5 0,0,1 -3.76-2.89L-3.76-1.16A.5,.5 0,0,1 -4.26-.66L-7.47-.66A7.5,7.5 0,0,1 -4.81-5.76z" />
            
            <rect x="-1.75" y="-5.844" fill="#898888" width="3.094" height="4.116" />

            {/* Active / Glowing Lens */}
            <circle
              className="cgfx__basecolor cgfx__animate"
              fill={glowing ? `url(#lensGrad-${props.id})` : "#DDDDDD"}
              r="7.5"
              cx="0"
              cy="0"
              opacity={glowing ? 0.95 : 0}
            />
            {glowing && (
              <>
                <circle className="cgfx__lightsource cgfx__brightnessring2 cgfx__animate" opacity="0.4" fillOpacity={0.45} fill="#FFFFFF" cx="0" cy="0" r="4.5" />
                <circle className="cgfx__lightsource cgfx__brightnessring1 cgfx__animate" opacity="0.6" fillOpacity={0.45} fill="#FFFFFF" cx="0" cy="0" r="2.75" />
                <circle className="cgfx__lightsource cgfx__brightnessring1 cgfx__animate" opacity="0.85" fill="#FFFFFF" cx="0" cy="0" r="1.5" />
                {/* Casing Light Bleed Overlay */}
                <circle cx="0" cy="0" r="9.5" fill={colorStr} opacity="0.32" style={{ mixBlendMode: 'screen', pointerEvents: 'none' }} />
              </>
            )}
          </g>
        </svg>
      </div>
    </BaseCircuitNode>
  );
}
