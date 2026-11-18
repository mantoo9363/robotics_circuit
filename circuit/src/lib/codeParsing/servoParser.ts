import { stripCodeComments, parseArduinoConstants, resolveArduinoNumber } from "./arduinoParser";
import type { CircuitNode, CircuitEdge } from "../types";

export interface ServoSequence {
  pin: number;
  steps: Array<{ angle: number; duration: number }>;
}

export function parseServoSequence(code: string): ServoSequence | null {
  const cleaned = stripCodeComments(code);
  const constants = parseArduinoConstants(cleaned);
  const attachMatch = cleaned.match(
    /\b([A-Za-z_]\w*)\s*\.\s*attach\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)/,
  );
  if (!attachMatch) return null;

  const servoName = attachMatch[1];
  const pin = resolveArduinoNumber(attachMatch[2], constants);
  if (pin === null) return null;

  const loopMatch = cleaned.match(/void\s+loop\s*\(\s*\)\s*\{([\s\S]*?)\n?\}/);
  if (!loopMatch) return null;

  const stepPattern = new RegExp(
    `${servoName}\\s*\\.\\s*write\\s*\\(\\s*([A-Za-z_]\\w*|-?\\d+)\\s*\\)|delay\\s*\\(\\s*([A-Za-z_]\\w*|\\d+)\\s*\\)`,
    "g",
  );
  const steps: Array<{ angle: number; duration: number }> = [];
  let currentAngle: number | null = null;

  for (const match of loopMatch[1].matchAll(stepPattern)) {
    if (match[1] !== undefined) {
      const angle = resolveArduinoNumber(match[1], constants);
      if (angle !== null) currentAngle = Math.max(0, Math.min(180, angle));
      continue;
    }

    if (match[2] !== undefined && currentAngle !== null) {
      const duration = resolveArduinoNumber(match[2], constants) ?? 1000;
      steps.push({ angle: currentAngle, duration: Math.max(50, duration) });
    }
  }

  if (currentAngle !== null && steps.length === 0) {
    steps.push({ angle: currentAngle, duration: 1000 });
  }

  return steps.length > 0 ? { pin, steps } : null;
}

export function getServoAngleAtTime(
  sequence: NonNullable<ReturnType<typeof parseServoSequence>>,
  timestamp: number,
): number {
  const totalDuration = sequence.steps.reduce(
    (sum, step) => sum + step.duration,
    0,
  );
  if (totalDuration <= 0) return sequence.steps[0]?.angle ?? 0;

  let cursor = timestamp % totalDuration;
  for (const step of sequence.steps) {
    if (cursor < step.duration) return step.angle;
    cursor -= step.duration;
  }

  return sequence.steps[sequence.steps.length - 1]?.angle ?? 0;
}

export function servoHasSignalConnection(
  servoNodeId: string,
  arduinoNodeId: string,
  pin: number,
  edges: CircuitEdge[],
): boolean {
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