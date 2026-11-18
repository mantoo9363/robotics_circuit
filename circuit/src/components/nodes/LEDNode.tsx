import { type NodeProps } from "@xyflow/react";
import { BaseCircuitNode } from "./BaseCircuitNode";
import { useCircuitStore } from "@cs/lib/store";
import type { CircuitNode } from "@cs/lib/types";

const NODE_WIDTH = 52;
const NODE_HEIGHT = 68;

const LED_PINS = [
  { id: "anode", label: "Anode (+)", position: { x: 36, y: 62 } },
  { id: "cathode", label: "Cathode (-)", position: { x: 16, y: 62 } },
];

const LED_COLORS: Record<string, { body: string; mask: string; glow: string }> =
  {
    red: { body: "#ff4040", mask: "#802020", glow: "255, 38, 38" },
    green: { body: "#22c55e", mask: "#14532d", glow: "34, 197, 94" },
    blue: { body: "#3b82f6", mask: "#1e3a8a", glow: "59, 130, 246" },
    yellow: { body: "#facc15", mask: "#854d0e", glow: "250, 204, 21" },
    white: { body: "#f8fafc", mask: "#94a3b8", glow: "255, 255, 255" },
  };

export function LedNode(props: NodeProps<CircuitNode>) {
  const selectedColor = String(props.data.properties?.color?.value ?? "red");
  const color = LED_COLORS[selectedColor] ?? LED_COLORS.red;
  const brightness = useCircuitStore(
    (state) => state.simulationFrame?.components[props.id]?.brightness ?? 0,
  );
  const burnt = useCircuitStore(
    (state) => state.simulationFrame?.components[props.id]?.telemetry?.burnt === true,
  );
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const lit = isSimulating && brightness > 0.002 && !burnt;
  const visualBrightness = lit ? Math.max(0.04, brightness) : 0;
  const glowSize = Math.round(24 + visualBrightness * 46);
  const coreAlpha = Math.min(0.92, visualBrightness * 0.78 + 0.12);
  const midAlpha = visualBrightness * 0.42;

  return (
    <BaseCircuitNode
      {...props}
      width={NODE_WIDTH}
      height={NODE_HEIGHT}
      pins={LED_PINS}
    >
      <div
        style={{ position: "relative", width: NODE_WIDTH, height: NODE_HEIGHT }}
      >
        {burnt && (
          <div className="led-bust-smoke">
            <span className="smoke smoke-a" />
            <span className="smoke smoke-b" />
            <span className="smoke smoke-c" />
          </div>
        )}

        {lit && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 24,
              width: glowSize,
              height: glowSize,
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${color.glow}, ${coreAlpha}) 0 18%, rgba(${color.glow}, ${midAlpha}) 42%, rgba(${color.glow}, 0) 76%)`,
              filter: "blur(3px)",
              pointerEvents: "none",
            }}
          />
        )}

        <svg
          width={NODE_WIDTH}
          height={NODE_HEIGHT}
          viewBox="-13 -31 26 34"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            filter: burnt
              ? "grayscale(1) brightness(0.5) contrast(1.28) sepia(0.55)"
              : lit
                ? `brightness(${0.88 + visualBrightness * 0.65}) saturate(${1 + visualBrightness * 0.8})`
                : undefined,
          }}
        >
          <path
            fill="none"
            stroke="#8C8C8C"
            strokeWidth="2"
            strokeLinecap="round"
            strokeMiterlimit="10"
            d="M5,0c0,0,0-1.13,0-2.06S2.5-4.48,2.5-5.72s0-4.54,0-4.54"
          />
          <line
            fill="none"
            stroke="#8C8C8C"
            strokeWidth="2"
            strokeLinecap="round"
            strokeMiterlimit="10"
            x1="-5"
            y1="-10"
            x2="-5"
            y2="0"
          />
          <path
            fill={color.body}
            d="M5.55-13.41v-8.26c0-3.76-3.04-6.8-6.8-6.8c-3.76,0-6.8,3.04-6.8,6.8v8.26v2.03v3.37c1.38,1.14,3.9,1.91,6.8,1.91c4.37,0,7.91-1.74,7.91-3.88c0-0.23,0-1.15,0-1.4C6.66-12.12,6.25-12.81,5.55-13.41z"
          />
          <path
            opacity="0.3"
            fill="#FFFFFF"
            d="M-1.25-14.34c3.76,0,6.8,1.33,6.8,2.96v-2.03c-1.38-1.17-3.9-1.96-6.8-1.96c-2.9,0-5.42,0.79-6.8,1.96v2.03C-8.05-13.02-5.01-14.34-1.25-14.34z"
          />
          <path
            opacity="0.5"
            d="M5.55-13.41v-1.97c0,1.64-3.04,2.96-6.8,2.96c-3.76,0-6.8-1.33-6.8-2.96h0v7.37c1.38,1.14,3.9,1.91,6.8,1.91c4.37,0,7.91-1.74,7.91-3.88c0-0.23,0-1.15,0-1.4C6.66-12.12,6.25-12.81,5.55-13.41z"
          />
          <path
            opacity="0.2"
            fill="#FFFFFF"
            d="M5.55-13.41v2.03c0,1.64-3.04,2.96-6.8,2.96c-3.76,0-6.8-1.33-6.8-2.96v2.03c1.38,1.17,3.9,1.96,6.8,1.96c4.37,0,7.91-1.79,7.91-3.99C6.66-12.12,6.25-12.81,5.55-13.41z"
          />
          <path
            opacity="0.7"
            fill="#FFFFFF"
            d="M-6.26-13.38c1.24,0.59,3.02,0.96,5.01,0.96c1.99,0,3.77-0.37,5.01-0.96c-1.24-0.59-3.02-0.96-5.01-0.96C-3.24-14.34-5.02-13.97-6.26-13.38z"
          />
          <path
            fill={color.mask}
            fillOpacity="1"
            opacity="0.45"
            d="M-1.25-8.41c3.76,0,6.8-1.33,6.8-2.96v-10.29c0-3.76-3.04-6.8-6.8-6.8c-3.76,0-6.8,3.04-6.8,6.8l0,10.29C-8.05-9.74-5.01-8.41-1.25-8.41z"
          />
        </svg>

        {burnt && (
          <svg
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            viewBox="-13 -31 26 34"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            <path
              d="M-3.8-26.2 L-1.9-21.8 L-5.3-18.6 L-1.3-15.7 L-4.8-11.5"
              fill="none"
              stroke="#f8fafc"
              strokeWidth="0.85"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.78"
            />
            <path
              d="M1.7-26 L0.1-21.5 L2.7-18.7 L1.1-15.3 L4.6-12.1"
              fill="none"
              stroke="#111827"
              strokeWidth="0.95"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.72"
            />
            <path
              d="M-6.4-17.5 L-2.2-18.3 L1.8-17.1 L5.4-18.4"
              fill="none"
              stroke="#fef3c7"
              strokeWidth="0.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.7"
            />
            <path
              d="M-5.9-13.6 C-3.8-12.2 1.2-11.8 4.9-13.4"
              fill="none"
              stroke="#020617"
              strokeWidth="0.9"
              strokeLinecap="round"
              opacity="0.45"
            />
            <circle
              cx="-1.2"
              cy="-18.4"
              r="1.45"
              fill="#111827"
              opacity="0.52"
            />
            <circle cx="2.4" cy="-16.2" r="1.1" fill="#78350f" opacity="0.58" />
          </svg>
        )}

        {lit && (
          <div
            style={{
              position: "absolute",
              left: 26,
              top: 24,
              width: Math.max(10, Math.min(18, 10 + visualBrightness * 10)),
              height: Math.max(10, Math.min(18, 10 + visualBrightness * 10)),
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              background: `rgba(${color.glow}, ${0.2 + visualBrightness * 0.18})`,
              filter: "blur(2px)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      <style jsx>{`
        .led-bust-smoke {
          position: absolute;
          inset: -16px;
          z-index: 3;
          pointer-events: none;
        }

        .smoke {
          position: absolute;
          left: 50%;
          top: 26px;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: radial-gradient(
            circle,
            rgba(31, 41, 55, 0.52),
            rgba(31, 41, 55, 0)
          );
          filter: blur(2px);
          animation: led-bust-smoke 1.8s ease-out infinite;
        }

        .smoke-a {
          margin-left: -12px;
        }

        .smoke-b {
          margin-left: 2px;
          animation-delay: 0.35s;
        }

        .smoke-c {
          margin-left: -2px;
          top: 18px;
          width: 26px;
          height: 26px;
          opacity: 0.72;
          animation-delay: 0.72s;
        }

        @keyframes led-bust-smoke {
          0% {
            opacity: 0;
            transform: translate(-50%, 12px) scale(0.62);
          }
          20% {
            opacity: 0.78;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -26px) scale(1.45);
          }
        }
      `}</style>
    </BaseCircuitNode>
  );
}
