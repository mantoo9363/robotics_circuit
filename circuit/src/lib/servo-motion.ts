import type { CircuitEdge, CircuitNode } from './types';

export interface ServoMotionStep {
  angle: number;
  duration: number;
}

export interface SimulationServoMotion {
  servoName: string;
  pin: number;
  steps: ServoMotionStep[];
  totalDuration: number;
  connectedNodeIds: string[];
}

function stripCodeComments(code: string) {
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseArduinoConstants(code: string) {
  const constants = new Map<string, number>();
  const cleaned = stripCodeComments(code);
  const declarationPattern = /\b(?:const\s+)?(?:int|byte|uint8_t|long)\s+([A-Za-z_]\w*)\s*=\s*(-?\d+)\s*;/g;

  for (const match of cleaned.matchAll(declarationPattern)) {
    constants.set(match[1], Number(match[2]));
  }

  return constants;
}

function resolveArduinoNumber(token: string, constants: Map<string, number>) {
  const trimmed = token.trim();
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return constants.get(trimmed) ?? null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function servoHasSignalConnection(
  servoNodeId: string,
  arduinoNodeId: string,
  pin: number,
  edges: CircuitEdge[]
) {
  const arduinoHandle = `d${pin}`;
  return edges.some((edge) => {
    const servoToBoard =
      edge.source === servoNodeId &&
      edge.sourceHandle === 'signal' &&
      edge.target === arduinoNodeId &&
      edge.targetHandle === arduinoHandle;
    const boardToServo =
      edge.target === servoNodeId &&
      edge.targetHandle === 'signal' &&
      edge.source === arduinoNodeId &&
      edge.sourceHandle === arduinoHandle;

    return servoToBoard || boardToServo;
  });
}

export function getServoAngleAtTime(
  motion: Pick<SimulationServoMotion, 'steps' | 'totalDuration'>,
  timestamp: number
) {
  const totalDuration =
    motion.totalDuration > 0
      ? motion.totalDuration
      : motion.steps.reduce((sum, step) => sum + step.duration, 0);
  if (totalDuration <= 0) return motion.steps[0]?.angle ?? 0;

  let cursor = timestamp % totalDuration;
  for (const step of motion.steps) {
    if (cursor < step.duration) return step.angle;
    cursor -= step.duration;
  }

  return motion.steps[motion.steps.length - 1]?.angle ?? 0;
}

export function parseServoMotionsForCircuit(
  code: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[]
): SimulationServoMotion[] {
  const cleaned = stripCodeComments(code);
  if (!cleaned.includes('.attach') || !cleaned.includes('.write')) return [];

  const constants = parseArduinoConstants(cleaned);
  const arduinoNode = nodes.find((node) => node.data.componentType === 'arduino');
  if (!arduinoNode) return [];

  const loopMatch = cleaned.match(/void\s+loop\s*\(\s*\)\s*\{([\s\S]*?)\n?\}/);
  if (!loopMatch) return [];

  const attachPattern = /\b([A-Za-z_]\w*)\s*\.\s*attach\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)/g;
  const motions: SimulationServoMotion[] = [];

  for (const attachMatch of cleaned.matchAll(attachPattern)) {
    const servoName = attachMatch[1];
    const pin = resolveArduinoNumber(attachMatch[2], constants);
    if (pin === null) continue;

    const stepPattern = new RegExp(
      `${escapeRegExp(servoName)}\\s*\\.\\s*write\\s*\\(\\s*([A-Za-z_]\\w*|-?\\d+)\\s*\\)|delay\\s*\\(\\s*([A-Za-z_]\\w*|\\d+)\\s*\\)`,
      'g'
    );
    const steps: ServoMotionStep[] = [];
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

    if (steps.length === 0) continue;

    const connectedNodeIds = nodes
      .filter(
        (node) =>
          node.data.componentType === 'servo' &&
          servoHasSignalConnection(node.id, arduinoNode.id, pin, edges)
      )
      .map((node) => node.id);

    motions.push({
      servoName,
      pin,
      steps,
      totalDuration: steps.reduce((sum, step) => sum + step.duration, 0),
      connectedNodeIds,
    });
  }

  return motions;
}
