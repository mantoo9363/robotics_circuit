import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { parseServoSequence, getServoAngleAtTime } from "../../codeParsing/servoParser";
import { getPressedCarButtonCommand, stripCodeComments, parseArduinoConstants, resolveArduinoNumber } from "../../codeParsing/arduinoParser";
import { validateComponentConnections } from "../../../utils/connectivity";
import { getPicoPwmDuty } from "../../codeParsing/picoParser";
import { getArduinoDigitalPinForComponentConnection } from "../../circuit/pinMapping";

/**
 * True when the server (arduino-simulator) already measured this servo's angle
 * from the real Servo.h pulse width on the AVR run — it stamps
 * `telemetry.angleSource === "pwm"`. That is authoritative for an Arduino
 * sketch; client transformers that re-derive the angle from a regex-parsed
 * loop() timeline (which can't see keypad- or `if`-gated `write()` calls) must
 * not overwrite it.
 */
function hasServerMeasuredServoAngle(
  frame: SimulationFrame,
  nodes: CircuitNode[],
): boolean {
  return nodes.some(
    (n) =>
      getNodeSimulationModel(n) === "servo" &&
      frame.components[n.id]?.telemetry?.angleSource === "pwm",
  );
}

export function applyServoInputToFrame(
  frame: SimulationFrame,
  context?: {
    nodes?: CircuitNode[];
    edges?: CircuitEdge[];
    arduinoCode?: string;
    picoCode?: string;
  },
): SimulationFrame {
  const storeState = typeof useCircuitStore !== "undefined" ? useCircuitStore.getState() : { nodes: [], edges: [], arduinoCode: "", picoCode: "" };
  const nodes = (context?.nodes && context.nodes.length > 0) ? context.nodes : storeState.nodes;
  const edges = (context?.edges && context.edges.length > 0) ? context.edges : storeState.edges;
  const arduinoCode = context?.arduinoCode !== undefined ? context.arduinoCode : storeState.arduinoCode;
  const picoCode = context?.picoCode !== undefined ? context.picoCode : storeState.picoCode;

  const picoNode = nodes.find(
    (n) => getNodeSimulationModel(n) === "raspberrypipico",
  );

  if (picoNode) {
    const components = { ...frame.components };
    let changed = false;

    for (const node of nodes) {
      if (getNodeSimulationModel(node) !== "servo") continue;
      
      const pin = getArduinoDigitalPinForComponentConnection(
        node.id,
        "signal",
        picoNode.id,
        edges,
      );
      if (pin === null) continue;

      const duty = getPicoPwmDuty(picoCode, pin);
      if (duty === null) continue;

      // duty cycle maps 1638 to 8192 for 0 to 180 degrees
      const angle = Math.round(
        Math.max(0, Math.min(180, ((duty - 1638) / 6554) * 180)),
      );

      const previous = components[node.id];
      components[node.id] = {
        ...(previous ?? {
          nodeId: node.id,
          componentType: "servo",
          label: node.data.label,
          isPowered: false,
          brightness: 0,
          voltage: 0,
          pins: {},
          telemetry: {},
        }),
        isPowered: true,
        brightness: 1,
        telemetry: {
          ...(previous?.telemetry ?? {}),
          angle,
          signalPin: pin,
        },
      };
      changed = true;
    }

    return changed ? { ...frame, components } : frame;
  }

  // Server already measured the real AVR pulse -> don't clobber it with the
  // regex-parsed loop() timeline below.
  if (hasServerMeasuredServoAngle(frame, nodes)) return frame;

  if (!arduinoCode.includes("Servo") || !arduinoCode.includes(".write"))
    return frame;

  const sequence = parseServoSequence(arduinoCode);

  // No parseable loop() servo timeline (e.g. the sketch drives the servo only
  // from setup() or helper functions). We still can't know the angle, but a
  // correctly wired servo must not show a false "SERVO PINS DISCONNECTED"
  // badge — mark it powered from real wiring, leave the angle untouched
  // (horn rests at 0° / its last value). Was previously masked by
  // applyServoSteeringButtonInputToFrame force-writing isPowered every frame.
  if (!sequence) {
    const components = { ...frame.components };
    let changed = false;
    for (const node of nodes) {
      if (getNodeSimulationModel(node) !== "servo") continue;
      const isPowered = validateComponentConnections(node, nodes, edges);
      const previous = components[node.id];
      const { error, ...restTelemetry } = previous?.telemetry ?? {};
      components[node.id] = {
        ...(previous ?? {
          nodeId: node.id,
          componentType: "servo",
          label: node.data.label,
          isPowered: false,
          brightness: 0,
          voltage: 0,
          pins: {},
          telemetry: {},
        }),
        isPowered,
        brightness: isPowered ? 1 : 0,
        telemetry: isPowered
          ? restTelemetry
          : { ...(previous?.telemetry ?? {}), error: "Servo Pins Disconnected" },
      };
      changed = true;
    }
    return changed ? { ...frame, components } : frame;
  }

  const arduinoNode = nodes.find(
    (node) => node.data.componentType === "arduino",
  );
  if (!arduinoNode) return frame;

  const angle = getServoAngleAtTime(sequence, frame.timestamp);
  const components = { ...frame.components };
  let changed = false;

  for (const node of nodes) {
    if (getNodeSimulationModel(node) !== "servo") continue;
    if (!servoHasSignalConnection(node.id, arduinoNode.id, sequence.pin, edges))
      continue;

    const isPowered = validateComponentConnections(node, nodes, edges);

    const previous = components[node.id];
    const { error, ...restTelemetry } = previous?.telemetry ?? {};
    components[node.id] = {
      ...(previous ?? {
        nodeId: node.id,
        componentType: "servo",
        label: node.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered,
      brightness: isPowered ? 1 : 0,
      telemetry: isPowered ? {
        ...restTelemetry,
        angle,
        signalPin: sequence.pin,
      } : {
        ...(previous?.telemetry ?? {}),
        error: "Servo Pins Disconnected",
      },
    };
    changed = true;
  }

  return changed ? { ...frame, components } : frame;
}

function servoHasSignalConnection(
  servoNodeId: string,
  arduinoNodeId: string,
  pin: number,
  edges: CircuitEdge[],
) {
  const arduinoHandle = `d${pin}`;
  return edges.some((edge) => {
    const servoToBoard =
      edge.source === servoNodeId &&
      edge.sourceHandle === "signal" &&
      edge.target === arduinoNodeId &&
      edge.targetHandle === arduinoHandle;
    const boardToServo =
      edge.target === servoNodeId &&
      edge.targetHandle === "signal" &&
      edge.source === arduinoNodeId &&
      edge.sourceHandle === arduinoHandle;

    return servoToBoard || boardToServo;
  });
}

export function applyServoSteeringButtonInputToFrame(
  frame: SimulationFrame,
): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || !frame.running) return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  if (hasServerMeasuredServoAngle(frame, nodes)) return frame;
  const servoPin = parseServoAttachPin(arduinoCode);
  if (servoPin === null) return frame;

  const command = getPressedCarButtonCommand(nodes, edges, arduinoCode);
  // Car-steering visual fallback only: with no steering button pressed there is
  // no reason to move the servo. Without this guard the `: 90` default below
  // force-pinned every `Servo`+`.attach` sketch's servo to 90° on every frame.
  // Mirrors the sibling applyCarButtonVisualFallbackToFrame's `if (!command)`.
  if (!command) return frame;
  const leftPressed = command === "left";
  const rightPressed = command === "right";
  const angle = leftPressed ? 45 : rightPressed ? 135 : 90;
  const arduinoNode = nodes.find(
    (node) => node.data.componentType === "arduino",
  );
  if (!arduinoNode) return frame;

  const components = { ...frame.components };
  let changed = false;

  for (const node of nodes) {
    if (getNodeSimulationModel(node) !== "servo") continue;
    if (!servoHasSignalConnection(node.id, arduinoNode.id, servoPin, edges))
      continue;

    const isPowered = validateComponentConnections(node, nodes, edges);

    const previous = components[node.id];
    const { error, ...restTelemetry } = previous?.telemetry ?? {};
    components[node.id] = {
      ...(previous ?? {
        nodeId: node.id,
        componentType: "servo",
        label: node.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered,
      brightness: isPowered ? 1 : 0,
      telemetry: isPowered ? {
        ...restTelemetry,
        angle,
        signalPin: servoPin,
        steeringControl: true,
      } : {
        ...(previous?.telemetry ?? {}),
        error: "Servo Pins Disconnected",
      },
    };
    changed = true;
  }

  return changed ? { ...frame, components } : frame;
}

function parseServoAttachPin(code: string): number | null {
  const cleaned = stripCodeComments(code);
  if (!cleaned.includes("Servo") || !cleaned.includes(".attach")) return null;

  const constants = parseArduinoConstants(cleaned);
  const attachMatch = cleaned.match(
    /\b[A-Za-z_]\w*\s*\.\s*attach\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)/,
  );
  if (!attachMatch) return null;

  return resolveArduinoNumber(attachMatch[1], constants);
}

export function applyServoControllerInputToFrame(frame: SimulationFrame): SimulationFrame {
  const { nodes, edges } = useCircuitStore.getState();
  const components = { ...frame.components };
  let changed = false;

  for (const node of nodes) {
    if (getNodeSimulationModel(node) !== "servo") continue;
    if (node.data.servoControllerActive !== true) continue;

    const isPowered = frame.running && validateComponentConnections(node, nodes, edges);

    const angle = Number(node.data.servoControlAngle ?? 90);
    const speed = Number(node.data.servoControlSpeed ?? 50);
    const previous = components[node.id];
    const { error, ...restTelemetry } = previous?.telemetry ?? {};

    components[node.id] = {
      ...(previous ?? {
        nodeId: node.id,
        componentType: "servo",
        label: node.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered,
      brightness: isPowered ? 1 : 0,
      telemetry: isPowered ? {
        ...restTelemetry,
        angle: Math.max(0, Math.min(180, angle)),
        speed: Math.max(1, Math.min(100, speed)),
        manualControl: true,
      } : {
        ...(previous?.telemetry ?? {}),
        error: "Servo Pins Disconnected",
      },
    };
    changed = true;
  }

  return changed ? { ...frame, components } : frame;
}