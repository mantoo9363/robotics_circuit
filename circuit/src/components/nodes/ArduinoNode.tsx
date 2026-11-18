import { type NodeProps } from '@xyflow/react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getComponentDefinition, getStaticComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitNode } from '@cs/lib/types';

function svgPointToNodePoint(x: number, y: number) {
  const sourceViewBox = { x: -160, y: -125, width: 320, height: 250 };
  const staticDef = getStaticComponentDefinition('arduino')!;
  const scale = Math.min(staticDef.defaultWidth / sourceViewBox.width, staticDef.defaultHeight / sourceViewBox.height);
  const xOffset = (staticDef.defaultWidth - sourceViewBox.width * scale) / 2;
  const yOffset = (staticDef.defaultHeight - sourceViewBox.height * scale) / 2;

  return {
    x: xOffset + (x - sourceViewBox.x) * scale,
    y: yOffset + (y - sourceViewBox.y) * scale,
  };
}

const BOARD_LED_POSITIONS = {
  led13: svgPointToNodePoint(-25, -57),
  tx: svgPointToNodePoint(-25, -38),
  rx: svgPointToNodePoint(-25, -28),
  on: svgPointToNodePoint(100.5, -38),
};

export function ArduinoNode(props: NodeProps<CircuitNode>) {
  const def = getComponentDefinition(props.data.componentType || props.type || 'arduino')!;
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const arduinoPins = useCircuitStore((state) => state.arduinoPins);

  const componentState = useCircuitStore((state) => state.simulationFrame?.components[props.id]);
  const burnt = componentState?.telemetry?.burnt === true;
  const d13Active = isSimulating && !burnt && (arduinoPins.get(13)?.value ?? 0) > 0;
  const txActive = isSimulating && !burnt && (componentState?.telemetry?.txActive === true || (arduinoPins.get(1)?.value ?? 0) > 0);
  const rxActive = isSimulating && !burnt && (componentState?.telemetry?.rxActive === true || (arduinoPins.get(0)?.value ?? 0) > 0);

  return (
    <BaseCircuitNode {...props} width={def.defaultWidth} height={def.defaultHeight} pins={def.pins}>
      <div className="arduino-board-visual">
        <svg
          width={def.defaultWidth}
          height={def.defaultHeight}
          viewBox={`0 0 ${def.defaultWidth} ${def.defaultHeight}`}
          role="img"
          aria-label="Arduino Uno R3"
          style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}
        >
          <image
            href="/parts/arduino-uno-r3.svg"
            x="0"
            y="0"
            width={def.defaultWidth}
            height={def.defaultHeight}
            preserveAspectRatio="xMidYMid meet"
          />

          {isSimulating && !burnt && (
            <>
              <BoardLed {...BOARD_LED_POSITIONS.on} color="#1ee13d" />
              {d13Active && <BoardLed {...BOARD_LED_POSITIONS.led13} color="#ffb000" />}
              {txActive && <BoardLed {...BOARD_LED_POSITIONS.tx} color="#ffb000" />}
              {rxActive && <BoardLed {...BOARD_LED_POSITIONS.rx} color="#ffb000" />}
            </>
          )}
        </svg>
      </div>

      <style jsx>{`
        .arduino-board-visual {
          width: ${def.defaultWidth}px;
          height: ${def.defaultHeight}px;
          overflow: visible;
        }
      `}</style>
    </BaseCircuitNode>
  );
}


function BoardLed({
  x,
  y,
  color,
  radius = 3.2,
}: {
  x: number;
  y: number;
  color: string;
  radius?: number;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={radius + 8} fill={color} opacity={0.14} />
      <circle cx={x} cy={y} r={radius + 4} fill={color} opacity={0.32} />
      <circle cx={x} cy={y} r={radius} fill={color} opacity={0.95} />
    </g>
  );
}
