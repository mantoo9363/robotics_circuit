import type { PinState, SimulatorState } from './arduino-simulator';
import {
  buildSimulationFrame,
  type SimulationFrame,
  type SimulationStartPayload,
} from './simulation-state';
import type { CircuitEdge, CircuitNode, ComponentDefinition } from './types';

function getNodeSimulationModel(node: CircuitNode, dynamicComponents?: ComponentDefinition[]) {
  const model = node.data.simulationModel;
  if (typeof model === 'string' && model.trim().length > 0 && model !== 'generic') return model;

  return (
    dynamicComponents?.find((component) => component.type === node.data.componentType)?.simulationModel ??
    node.data.componentType
  );
}

function stripCodeComments(code: string) {
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseArduinoConstants(code: string) {
  const constants = new Map<string, number>();
  const cleaned = stripCodeComments(code);
  const declarationPattern = /\b(?:const\s+)?(?:int|byte|uint8_t|long)\s+([A-Za-z_]\w*)\s*=\s*(-?\d+|A[0-5])\s*;/g;

  for (const match of cleaned.matchAll(declarationPattern)) {
    constants.set(match[1], match[2].startsWith('A') ? 14 + Number(match[2].slice(1)) : Number(match[2]));
  }

  return constants;
}

function resolveArduinoNumber(token: string, constants: Map<string, number>) {
  const trimmed = token.trim();
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return constants.get(trimmed) ?? null;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function frameToArduinoPins(frame: SimulationFrame) {
  const pins = new Map<number, PinState>();

  for (const pin of frame.boardPins) {
    if (!pin.handleId.startsWith('d') && !pin.handleId.startsWith('a') && !pin.handleId.startsWith('gp')) continue;
    pins.set(pin.pin, {
      mode: pin.mode as PinState['mode'],
      value: pin.value,
    });
  }

  return pins;
}

function getPressedArduinoButtonPins(args: {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  dynamicComponents?: ComponentDefinition[];
}) {
  const pressedPins = new Set<number>();
  const arduinoNode = args.nodes.find(
    (node) => getNodeSimulationModel(node, args.dynamicComponents) === 'arduino'
  );
  if (!arduinoNode) return pressedPins;

  for (const node of args.nodes) {
    const model = getNodeSimulationModel(node, args.dynamicComponents);
    if (model !== 'pushbutton' && model !== 'slideswitch') continue;
    if (node.data.properties?.state?.value !== 'on') continue;

    for (const edge of args.edges) {
      const boardHandle =
        edge.source === arduinoNode.id && edge.target === node.id
          ? edge.sourceHandle
          : edge.target === arduinoNode.id && edge.source === node.id
            ? edge.targetHandle
            : null;
      const match = typeof boardHandle === 'string' ? boardHandle.match(/^d(\d+)$/) : null;
      if (match) pressedPins.add(Number(match[1]));
    }
  }

  return pressedPins;
}

function getPressedArduinoButtonLabels(args: {
  nodes: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
}) {
  const labels = new Set<string>();

  for (const node of args.nodes) {
    const model = getNodeSimulationModel(node, args.dynamicComponents);
    if (model !== 'pushbutton' && model !== 'slideswitch') continue;
    if (node.data.properties?.state?.value !== 'on') continue;

    const label = String(node.data.properties?.name?.value ?? node.data.label ?? '')
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

function parseL293DCarControlPins(
  code: string,
  analogValue: number,
  pressedPins: Set<number>,
  pressedLabels = new Set<string>()
) {
  const cleaned = stripCodeComments(code);
  if (!cleaned.includes('digitalRead') || !cleaned.includes('digitalWrite') || !cleaned.includes('analogWrite')) {
    return null;
  }

  const constants = parseArduinoConstants(cleaned);
  constants.set('A0', 14);
  const constValue = (...names: string[]) => {
    for (const name of names) {
      const value = constants.get(name);
      if (typeof value === 'number') return value;
    }

    return null;
  };
  const analogReadMatch = cleaned.match(/\b([A-Za-z_]\w*)\s*=\s*analogRead\s*\(\s*(A0|[A-Za-z_]\w*|-?\d+)\s*\)/);
  if (!analogReadMatch) return null;

  const readVariable = analogReadMatch[1];
  const mappedVariables = new Map<string, number>();
  const mapAssignmentPattern = new RegExp(
    `\\b([A-Za-z_]\\w*)\\s*=\\s*map\\s*\\(\\s*${readVariable}\\s*,\\s*0\\s*,\\s*1023\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)`,
    'g'
  );
  for (const match of cleaned.matchAll(mapAssignmentPattern)) {
    const min = Number(match[2]);
    const max = Number(match[3]);
    mappedVariables.set(match[1], clampByte(min + (analogValue / 1023) * (max - min)));
  }

  const outputs: Array<{ pin: number; value: number }> = [];
  const inputPins = new Map<number, number>();
  const analogWritePattern = /analogWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*([A-Za-z_]\w*|-?\d+|map\s*\([^)]+\))\s*\)/g;
  for (const match of cleaned.matchAll(analogWritePattern)) {
    const pin = resolveArduinoNumber(match[1], constants);
    if (pin === null) continue;

    const rawValue = match[2].trim();
    let value = mappedVariables.get(rawValue) ?? resolveArduinoNumber(rawValue, constants);
    if (value === null && rawValue.startsWith('map')) {
      const mapMatch = rawValue.match(/map\s*\(\s*([A-Za-z_]\w*)\s*,\s*0\s*,\s*1023\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (mapMatch?.[1] === readVariable) {
        value = clampByte(Number(mapMatch[2]) + (analogValue / 1023) * (Number(mapMatch[3]) - Number(mapMatch[2])));
      }
    }

    outputs.push({ pin, value: clampByte(value ?? 0) });
  }

  const forwardPin = constValue('btnForward', 'buttonForward', 'forwardButton');
  const backPin = constValue('btnBack', 'btnReverse', 'buttonBack', 'buttonReverse', 'reverseButton');
  const stopPin = constValue('btnStop', 'buttonStop', 'stopButton');
  const leftPin = constValue('btnLeft', 'buttonLeft', 'leftButton');
  const rightPin = constValue('btnRight', 'buttonRight', 'rightButton');
  const enaPin = constValue('ENA', 'ena');
  const enbPin = constValue('ENB', 'enb');
  const in1Pin = constValue('IN1', 'in1');
  const in2Pin = constValue('IN2', 'in2');
  const in3Pin = constValue('IN3', 'in3');
  const in4Pin = constValue('IN4', 'in4');
  const command =
    (stopPin !== null && pressedPins.has(stopPin)) || hasPressedLabel(pressedLabels, ['STOP', 'BRAKE', 'BREAK'])
      ? 'stop'
      : (leftPin !== null && pressedPins.has(leftPin)) || hasPressedLabel(pressedLabels, ['LEFT'])
        ? 'left'
        : (rightPin !== null && pressedPins.has(rightPin)) || hasPressedLabel(pressedLabels, ['RIGHT'])
          ? 'right'
          : (forwardPin !== null && pressedPins.has(forwardPin)) || hasPressedLabel(pressedLabels, ['FORWARD', 'AAGE', 'FRONT'])
            ? 'forward'
            : (backPin !== null && pressedPins.has(backPin)) || hasPressedLabel(pressedLabels, ['BACK', 'REVERSE', 'PICHE'])
              ? 'back'
              : null;

  for (const pin of [forwardPin, backPin, stopPin, leftPin, rightPin]) {
    if (pin !== null) {
      inputPins.set(pin, pressedPins.has(pin) ? 0 : 255);
    }
  }

  if (
    command &&
    enaPin !== null &&
    enbPin !== null &&
    in1Pin !== null &&
    in2Pin !== null &&
    in3Pin !== null &&
    in4Pin !== null
  ) {
    const pwmOutputs = outputs.filter((output) => output.pin === enaPin || output.pin === enbPin);
    const existingPwm = Math.max(0, ...pwmOutputs.map((output) => output.value));
    const drivePwm = command === 'stop' ? 0 : pwmOutputs.length > 0 ? existingPwm : 180;
    const setOutput = (pin: number, value: number) => outputs.push({ pin, value });

    setOutput(enaPin, drivePwm);
    setOutput(enbPin, drivePwm);

    if (command === 'stop') {
      setOutput(in1Pin, 0); setOutput(in2Pin, 0);
      setOutput(in3Pin, 0); setOutput(in4Pin, 0);
    } else if (command === 'left') {
      setOutput(in1Pin, 0); setOutput(in2Pin, 255);
      setOutput(in3Pin, 255); setOutput(in4Pin, 0);
    } else if (command === 'right') {
      setOutput(in1Pin, 255); setOutput(in2Pin, 0);
      setOutput(in3Pin, 0); setOutput(in4Pin, 255);
    } else if (command === 'forward') {
      setOutput(in1Pin, 255); setOutput(in2Pin, 0);
      setOutput(in3Pin, 255); setOutput(in4Pin, 0);
    } else if (command === 'back') {
      setOutput(in1Pin, 0); setOutput(in2Pin, 255);
      setOutput(in3Pin, 0); setOutput(in4Pin, 255);
    }

    return {
      analogPin: 14,
      analogValue,
      inputPins: Array.from(inputPins, ([pin, value]) => ({ pin, value })),
      outputs,
    };
  }

  const branchPattern =
    /(?:if|else\s+if)\s*\(\s*digitalRead\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*\)\s*==\s*(LOW|HIGH)\s*\)\s*\{([\s\S]*?)\}/g;
  let activeBlock: string | null = null;
  for (const match of cleaned.matchAll(branchPattern)) {
    const pin = resolveArduinoNumber(match[1], constants);
    if (pin === null) continue;

    const pressed = pressedPins.has(pin);
    const readValue = pressed ? 'LOW' : 'HIGH';
    inputPins.set(pin, pressed ? 0 : 255);
    if (activeBlock === null && readValue === match[2]) {
      activeBlock = match[3];
    }
  }

  if (activeBlock !== null) {
    const writePattern = /digitalWrite\s*\(\s*([A-Za-z_]\w*|-?\d+)\s*,\s*(HIGH|LOW)\s*\)/g;
    for (const match of activeBlock.matchAll(writePattern)) {
      const pin = resolveArduinoNumber(match[1], constants);
      if (pin !== null) outputs.push({ pin, value: match[2] === 'HIGH' ? 255 : 0 });
    }
  }

  if (outputs.length === 0 && inputPins.size === 0) return null;
  return {
    analogPin: 14,
    analogValue,
    inputPins: Array.from(inputPins, ([pin, value]) => ({ pin, value })),
    outputs,
  };
}

export function applyArduinoL293DCarControlToFrame(
  frame: SimulationFrame,
  snapshot: SimulationStartPayload
) {
  if (frame.boardType !== 'arduino' || !frame.running) return frame;
  if (!snapshot.nodes.some((node) => getNodeSimulationModel(node, snapshot.dynamicComponents) === 'l293d')) {
    return frame;
  }

  const potentiometer = snapshot.nodes.find(
    (node) => getNodeSimulationModel(node, snapshot.dynamicComponents) === 'potentiometer'
  );
  const position = Math.max(
    0,
    Math.min(100, Number(potentiometer?.data.properties?.position?.value ?? 100))
  );
  const analogValue = Math.round((position / 100) * 1023);
  const pressedPins = getPressedArduinoButtonPins({
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    dynamicComponents: snapshot.dynamicComponents,
  });
  const pressedLabels = getPressedArduinoButtonLabels({
    nodes: snapshot.nodes,
    dynamicComponents: snapshot.dynamicComponents,
  });
  const parsed = parseL293DCarControlPins(snapshot.arduinoCode, analogValue, pressedPins, pressedLabels);
  if (!parsed) return frame;

  const pins = frameToArduinoPins(frame);
  pins.set(parsed.analogPin, {
    mode: 'INPUT',
    value: Math.round((parsed.analogValue / 1023) * 255),
  });
  for (const inputPin of parsed.inputPins) {
    pins.set(inputPin.pin, {
      mode: 'INPUT_PULLUP',
      value: inputPin.value,
    });
  }
  for (const output of parsed.outputs) {
    pins.set(output.pin, {
      mode: 'OUTPUT',
      value: output.value,
    });
  }

  const arduinoState: SimulatorState = {
    pins,
    serialOutput: frame.serialOutput,
    running: frame.running,
    error: frame.error,
  };

  return buildSimulationFrame({
    tick: frame.tick,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    dynamicComponents: snapshot.dynamicComponents,
    boardType: frame.boardType,
    arduinoState,
    servoMotions: snapshot.servoMotions,
    running: frame.running,
    error: frame.error,
  });
}
