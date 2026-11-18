import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { stripCodeComments, parseArduinoConstants, resolveArduinoNumber } from "../../codeParsing/arduinoParser";
import { servoHasSignalConnection } from "../../codeParsing/servoParser";

type CarButtonCommand = "forward" | "back" | "left" | "right" | "stop";

export function applyCarButtonVisualFallbackToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || !frame.running) return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  const command = getPressedCarButtonCommand(nodes, edges, arduinoCode);
  if (!command) return frame;

  const motors = nodes
    .filter((node) => getNodeSimulationModel(node) === "dcmotor")
    .sort((a, b) => {
      const aName = String(
        a.data.properties?.name?.value ?? a.data.label ?? a.id,
      );
      const bName = String(
        b.data.properties?.name?.value ?? b.data.label ?? b.id,
      );
      return aName.localeCompare(bName);
    });
  if (motors.length === 0) return frame;

  const components = { ...frame.components };
  const getPreviousDrive = (
    previous: SimulationFrame["components"][string] | undefined,
  ) => {
    if (!previous || command === "stop") return 0;
    const previousForward = Number(previous.telemetry?.forwardThrottle ?? 0);
    const previousReverse = Number(previous.telemetry?.reverseThrottle ?? 0);
    const previousDrive = Number(previous.brightness ?? 0);
    const currentDrive = Math.max(
      Number.isFinite(previousForward) ? previousForward : 0,
      Number.isFinite(previousReverse) ? previousReverse : 0,
      Number.isFinite(previousDrive) ? previousDrive : 0,
    );
    if (currentDrive > 0)
      return clamp01(currentDrive);

    const previousRpm = Number(previous.telemetry?.rpm ?? 0);
    return clamp01(
      Math.max(
        Number.isFinite(previousRpm) ? Math.abs(previousRpm) / 2400 : 0,
        180 / 255,
      ),
    );
  };
  const motorDirection = (index: number): "forward" | "reverse" => {
    if (command === "back") return "reverse";
    if (command === "left") return index === 0 ? "reverse" : "forward";
    if (command === "right") return index === 0 ? "forward" : "reverse";
    return "forward";
  };

  motors.forEach((node, index) => {
    const direction = motorDirection(index);
    const previous = components[node.id];
    const drive = getPreviousDrive(previous);
    const rpm = Math.round(2400 * drive);
    const voltage = drive > 0 ? 9 * drive : 0;
    const previousDriveSource = String(previous?.telemetry?.driveSource ?? "");
    const driveSource =
      previousDriveSource === "L293D" || previousDriveSource === "direct"
        ? previousDriveSource
        : "button";
    components[node.id] = {
      ...(previous ?? {
        nodeId: node.id,
        componentType: node.data.componentType,
        label: node.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered: drive > 0,
      brightness: drive,
      voltage,
      telemetry: {
        ...(previous?.telemetry ?? {}),
        rpm,
        voltage,
        direction,
        rotation: direction === "reverse" ? "anticlockwise" : "clockwise",
        forwardThrottle: direction === "forward" ? drive : 0,
        reverseThrottle: direction === "reverse" ? drive : 0,
        driveSource,
      },
    };
  });

  return { ...frame, components };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function applyServoSteeringButtonInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || !frame.running) return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();
  const servoPin = parseServoAttachPin(arduinoCode);
  if (servoPin === null) return frame;

  const command = getPressedCarButtonCommand(nodes, edges, arduinoCode);
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
        signalPin: servoPin,
        steeringControl: true,
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

function getPressedCarButtonCommand(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  code: string,
): CarButtonCommand | null {
  const cleaned = stripCodeComments(code);
  const constants = parseArduinoConstants(cleaned);
  const pressedPins = getPressedArduinoButtonPins(nodes, edges);
  const pressedLabels = getPressedArduinoButtonLabels(nodes);
  const constValue = (...names: string[]) => {
    for (const name of names) {
      const value = constants.get(name);
      if (typeof value === "number") return value;
    }

    return null;
  };
  const pinPressed = (...names: string[]) => {
    const pin = constValue(...names);
    return pin !== null && pressedPins.has(pin);
  };

  if (
    pinPressed("btnStop", "buttonStop", "stopButton") ||
    hasPressedLabel(pressedLabels, ["STOP", "BRAKE", "BREAK"])
  ) {
    return "stop";
  }
  if (
    pinPressed("btnLeft", "buttonLeft", "leftButton") ||
    hasPressedLabel(pressedLabels, ["LEFT"])
  ) {
    return "left";
  }
  if (
    pinPressed("btnRight", "buttonRight", "rightButton") ||
    hasPressedLabel(pressedLabels, ["RIGHT"])
  ) {
    return "right";
  }
  if (
    pinPressed("btnForward", "buttonForward", "forwardButton") ||
    hasPressedLabel(pressedLabels, ["FORWARD", "AAGE", "FRONT"])
  ) {
    return "forward";
  }
  if (
    pinPressed(
      "btnBack",
      "btnReverse",
      "buttonBack",
      "buttonReverse",
      "reverseButton",
    ) ||
    hasPressedLabel(pressedLabels, ["BACK", "REVERSE", "PICHE"])
  ) {
    return "back";
  }

  return null;
}

function getPressedArduinoButtonPins(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
) {
  const pressedPins = new Set<number>();
  const arduinoNode = nodes.find(
    (node) => getNodeSimulationModel(node) === "arduino",
  );
  if (!arduinoNode) return pressedPins;

  for (const node of nodes) {
    const model = getNodeSimulationModel(node);
    if (model !== "pushbutton" && model !== "slideswitch") continue;
    // Pushbutton: only active when 'on'. Slideswitch: always active (left or right)
    if (model === "pushbutton" && node.data.properties?.state?.value !== "on")
      continue;

    for (const edge of edges) {
      const boardHandle =
        edge.source === arduinoNode.id && edge.target === node.id
          ? edge.sourceHandle
          : edge.target === arduinoNode.id && edge.source === node.id
            ? edge.targetHandle
            : null;
      const match =
        typeof boardHandle === "string" ? boardHandle.match(/^d(\d+)$/) : null;
      if (match) pressedPins.add(Number(match[1]));
    }
  }

  return pressedPins;
}

function getPressedArduinoButtonLabels(nodes: CircuitNode[]) {
  const labels = new Set<string>();

  for (const node of nodes) {
    const model = getNodeSimulationModel(node);
    if (model !== "pushbutton" && model !== "slideswitch") continue;
    // Pushbutton: only active when 'on'. Slideswitch: always active.
    if (model === "pushbutton" && node.data.properties?.state?.value !== "on")
      continue;

    const label = String(
      node.data.properties?.name?.value ?? node.data.label ?? "",
    )
      .trim()
      .toUpperCase();
    if (label) labels.add(label);
  }

  return labels;
}

function hasPressedLabel(labels: Set<string>, tokens: string[]) {
  for (const label of labels) {
    if (tokens.some((token) => label.includes(token))) return true;
  }

  return false;
}

