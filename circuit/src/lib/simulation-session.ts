import {
  ArduinoSimulator,
  type SimulatorState,
  type UltrasonicDevice,
} from "./arduino-simulator";
import {
  buildSimulationFrame,
  getPotentiometerWiperVoltage,
  type SimulationFrame,
  type SimulationSnapshot,
  TILT_THRESHOLD,
} from "./simulation-state";
import type { CircuitEdge, CircuitNode } from "./types";
import { getBreadboardAutoConnections } from "./breadboard-autoconnect";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "./circuit/graph";


function arduinoDigitalPinFromHandle(handleId: string | null | undefined) {
  const match = String(handleId ?? "").match(/^d(\d+)$/i);
  if (!match) return null;
  const pin = Number(match[1]);
  return Number.isInteger(pin) && pin >= 0 && pin <= 13 ? pin : null;
}

function arduinoAnalogChannelFromHandle(handleId: string | null | undefined) {
  const match = String(handleId ?? "").match(/^a([0-5])$/i);
  if (!match) return null;
  const channel = Number(match[1]);
  return Number.isInteger(channel) && channel >= 0 && channel <= 5
    ? channel
    : null;
}

function picoDigitalPinFromHandle(handleId: string | null | undefined) {
  const match = String(handleId ?? "").match(/^gp(\d+)$/i);
  if (!match) return null;
  const pin = Number(match[1]);
  return Number.isInteger(pin) && pin >= 0 && pin <= 28 ? pin : null;
}

function findArduinoPinConnection(args: {
  edges: CircuitEdge[];
  componentNodeId: string;
  componentHandle: string;
  arduinoNodeId: string;
  isPico?: boolean;
}) {
  for (const edge of args.edges) {
    const componentToBoard =
      edge.source === args.componentNodeId &&
      edge.sourceHandle === args.componentHandle &&
      edge.target === args.arduinoNodeId;
    const boardToComponent =
      edge.target === args.componentNodeId &&
      edge.targetHandle === args.componentHandle &&
      edge.source === args.arduinoNodeId;

    if (componentToBoard) {
      return args.isPico
        ? picoDigitalPinFromHandle(edge.targetHandle)
        : arduinoDigitalPinFromHandle(edge.targetHandle);
    }
    if (boardToComponent) {
      return args.isPico
        ? picoDigitalPinFromHandle(edge.sourceHandle)
        : arduinoDigitalPinFromHandle(edge.sourceHandle);
    }
  }

  return null;
}

function findConnectedMcuDigitalPin(args: {
  edges: CircuitEdge[];
  nodes: CircuitNode[];
  componentNodeId: string;
  componentHandle: string;
  arduinoNodeId: string;
  isPico?: boolean;
}): number | null {
  const graph = buildConductiveGraphForStore(args.nodes, args.edges, { includeResistors: true });
  const startKey = `${args.componentNodeId}:${args.componentHandle}`;
  const reachable = getReachableGraphNodes(graph, startKey);

  for (const nodeKey of reachable) {
    if (nodeKey.startsWith(`${args.arduinoNodeId}:`)) {
      const pinHandle = nodeKey.substring(args.arduinoNodeId.length + 1);
      if (args.isPico) {
        const pin = picoDigitalPinFromHandle(pinHandle);
        if (pin !== null) return pin;
      } else {
        const pin = arduinoDigitalPinFromHandle(pinHandle);
        if (pin !== null) return pin;
        const analogChannel = arduinoAnalogChannelFromHandle(pinHandle);
        if (analogChannel !== null) return 14 + analogChannel;
      }
    }
  }
  return null;
}

function findArduinoAnalogChannelConnection(args: {
  edges: CircuitEdge[];
  nodes: CircuitNode[];
  componentNodeId: string;
  componentHandles: string[];
  arduinoNodeId: string;
}) {
  const graph = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a)!.add(b);
    graph.get(b)!.add(a);
  };

  // 1. Connect wires
  for (const edge of args.edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    const sourceKey = `${edge.source}:${edge.sourceHandle}`;
    const targetKey = `${edge.target}:${edge.targetHandle}`;
    connect(sourceKey, targetKey);
  }

  // 2. Connect breadboards internally
  for (const node of args.nodes) {
    const isBreadboard =
      node.data.componentType === "breadboard" ||
      node.data.simulationModel === "breadboard";
    if (!isBreadboard) continue;

    for (const railPrefix of [
      "top_positive",
      "top_negative",
      "bottom_positive",
      "bottom_negative",
    ]) {
      const rail = Array.from(
        { length: 30 },
        (_, index) => `${railPrefix}_${index + 1}`,
      );
      for (let index = 0; index < rail.length - 1; index += 1) {
        connect(`${node.id}:${rail[index]}`, `${node.id}:${rail[index + 1]}`);
      }
    }

    for (let column = 1; column <= 30; column += 1) {
      const topGroup = ["j", "i", "h", "g", "f"].map(
        (row) => `${row}${column}`,
      );
      const bottomGroup = ["e", "d", "c", "b", "a"].map(
        (row) => `${row}${column}`,
      );
      for (const group of [topGroup, bottomGroup]) {
        for (let index = 0; index < group.length - 1; index += 1) {
          connect(
            `${node.id}:${group[index]}`,
            `${node.id}:${group[index + 1]}`,
          );
        }
      }
    }
  }

  // 3. Connect breadboard auto-connections
  const autoConns = getBreadboardAutoConnections(args.nodes, args.edges);
  for (const conn of autoConns) {
    connect(
      `${conn.nodeId}:${conn.handleId}`,
      `${conn.breadboardNodeId}:${conn.breadboardHandleId}`,
    );
  }

  // 4. Trace reachable pins using BFS
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const handle of args.componentHandles) {
    const startKey = `${args.componentNodeId}:${handle}`;
    queue.push(startKey);
    visited.add(startKey);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Check if we reached the Arduino node and it is an analog pin (a0 - a5)
    if (current.startsWith(`${args.arduinoNodeId}:`)) {
      const pinHandle = current.substring(args.arduinoNodeId.length + 1);
      const analogChannel = arduinoAnalogChannelFromHandle(pinHandle);
      if (analogChannel !== null) {
        return analogChannel;
      }
    }

    const neighbors = graph.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  return null;
}

function findConnectedComponentHandle(args: {
  edges: CircuitEdge[];
  nodes: CircuitNode[];
  componentNodeId: string;
  handle: string;
  arduinoNodeId: string;
}): number | null {
  const graph = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a)!.add(b);
    graph.get(b)!.add(a);
  };

  for (const edge of args.edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    connect(`${edge.source}:${edge.sourceHandle}`, `${edge.target}:${edge.targetHandle}`);
  }

  for (const node of args.nodes) {
    const isBreadboard = node.data.componentType === 'breadboard' || node.data.simulationModel === 'breadboard';
    if (!isBreadboard) continue;
    for (const railPrefix of ['top_positive', 'top_negative', 'bottom_positive', 'bottom_negative']) {
      const rail = Array.from({ length: 30 }, (_, index) => `${railPrefix}_${index + 1}`);
      for (let index = 0; index < rail.length - 1; index += 1) {
        connect(`${node.id}:${rail[index]}`, `${node.id}:${rail[index + 1]}`);
      }
    }
    for (let column = 1; column <= 30; column += 1) {
      const topGroup = ['j', 'i', 'h', 'g', 'f'].map((row) => `${row}${column}`);
      const bottomGroup = ['e', 'd', 'c', 'b', 'a'].map((row) => `${row}${column}`);
      for (const group of [topGroup, bottomGroup]) {
        for (let index = 0; index < group.length - 1; index += 1) {
          connect(`${node.id}:${group[index]}`, `${node.id}:${group[index + 1]}`);
        }
      }
    }
  }

  const autoConns = getBreadboardAutoConnections(args.nodes, args.edges);
  for (const conn of autoConns) {
    connect(`${conn.nodeId}:${conn.handleId}`, `${conn.breadboardNodeId}:${conn.breadboardHandleId}`);
  }

  const visited = new Set<string>();
  const queue: string[] = [];
  const startKey = `${args.componentNodeId}:${args.handle}`;
  queue.push(startKey);
  visited.add(startKey);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.startsWith(`${args.arduinoNodeId}:`)) {
      const pinHandle = current.substring(args.arduinoNodeId.length + 1);
      const analogChannel = arduinoAnalogChannelFromHandle(pinHandle);
      if (analogChannel !== null) {
        return analogChannel;
      }
    }
    const neighbors = graph.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
  return null;
}


function getPhotoresistorFraction(rawLightLevel: number): number {
  const clamped = Math.max(0, Math.min(1023, rawLightLevel));
  if (clamped <= 100) {
    return (clamped / 100) * 0.5;
  }
  return 0.5 + ((clamped - 100) / 923) * 0.5;
}

function getPhotoresistorOhms(node: CircuitNode) {
  const rawLightLevel = Number(node.data.properties?.lightLevel?.value ?? 512);
  const fraction = getPhotoresistorFraction(rawLightLevel);
  return 100 + (1_000_000 - 100) * Math.pow(1 - fraction, 2);
}

function getPhotoresistorVoltage(node: CircuitNode) {
  const rawLightLevel = Number(node.data.properties?.lightLevel?.value ?? 512);
  const fraction = getPhotoresistorFraction(rawLightLevel);
  const analogValue = fraction * 1023;
  return (analogValue / 1023) * 5;
}

function getUltrasonicDevices(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): UltrasonicDevice[] {
  const boardNode = nodes.find(
    (node) =>
      node.data.componentType === "arduino" ||
      node.data.componentType === "raspberrypipico",
  );
  if (!boardNode) return [];

  const isPico = boardNode.data.componentType === "raspberrypipico";

  return nodes
    .filter((node) => node.data.componentType === "ultrasonicDistance")
    .map((node) => {
      const triggerPin = findArduinoPinConnection({
        edges,
        componentNodeId: node.id,
        componentHandle: "trigger",
        arduinoNodeId: boardNode.id,
        isPico,
      });
      const echoPin = findArduinoPinConnection({
        edges,
        componentNodeId: node.id,
        componentHandle: "echo",
        arduinoNodeId: boardNode.id,
        isPico,
      });
      const distanceCm = Number(node.data.properties?.distance?.value ?? 100);

      if (
        triggerPin === null ||
        echoPin === null ||
        !Number.isFinite(distanceCm)
      ) {
        return null;
      }

      return { triggerPin, echoPin, distanceCm };
    })
    .filter((device): device is UltrasonicDevice => device !== null);
}

function parseArduinoConstantPin(code: string, names: string[]) {
  const cleaned = code
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  for (const name of names) {
    const pattern = new RegExp(
      `\\b(?:const\\s+)?(?:int|byte|uint8_t|long)\\s+${name}\\s*=\\s*(\\d+)\\s*;`,
      "i",
    );
    const match = cleaned.match(pattern);
    if (!match) continue;

    const pin = Number(match[1]);
    if (Number.isInteger(pin) && pin >= 0 && pin <= 13) return pin;
  }

  return null;
}

import { validateComponentConnections } from "../utils/connectivity";

function getUltrasonicDevicesForSnapshot(
  snapshot: SimulationSnapshot,
): UltrasonicDevice[] {
  const wiredDevices = getUltrasonicDevices(snapshot.nodes, snapshot.edges);
  if (wiredDevices.length > 0) return wiredDevices;

  const ultrasonicNode = snapshot.nodes.find(
    (node) => node.data.componentType === "ultrasonicDistance",
  );
  if (!ultrasonicNode) return [];

  // Verify physical electrical connectivity before providing fallback device
  if (!validateComponentConnections(ultrasonicNode, snapshot.nodes, snapshot.edges)) {
    return [];
  }

  const triggerPin = parseArduinoConstantPin(snapshot.arduinoCode, [
    "trigPin",
    "triggerPin",
    "trig",
    "trigger",
  ]);
  const echoPin = parseArduinoConstantPin(snapshot.arduinoCode, [
    "echoPin",
    "echo",
  ]);
  const distanceCm = Number(
    ultrasonicNode.data.properties?.distance?.value ?? 100,
  );

  if (triggerPin === null || echoPin === null || !Number.isFinite(distanceCm)) {
    return [];
  }

  return [{ triggerPin, echoPin, distanceCm }];
}

/**
 * Build an ADC channel → voltage callback from the circuit snapshot.
 * Potentiometer wiper voltage = (position / 100) * 5 V.
 * Channel mapping: A0=0, A1=1 … A5=5 (Arduino pins 14-19).
 * The snapshotRef is a mutable holder so live knob updates propagate.
 */
function buildAnalogVoltageCallback(snapshotRef: {
  current: SimulationSnapshot;
}): (channel: number) => number {
  return (channel: number): number => {
    const { nodes, edges } = snapshotRef.current;
    const arduinoNode = nodes.find(
      (node) => node.data.componentType === "arduino",
    );
    const picoNode = nodes.find(
      (node) =>
        node.data.componentType === "raspberrypipico" ||
        node.data.simulationModel === "raspberrypipico",
    );

    for (const node of nodes) {
      const componentType = (node.data.componentType ?? "") as string;
      const simulationModel = (node.data.simulationModel ?? "") as string;

      const isPot =
        componentType === "potentiometer" ||
        simulationModel === "potentiometer";
      const isPhotoresistor =
        componentType === "photoresistor" ||
        simulationModel === "photoresistor";
      const isForceSensor =
        componentType === "forceSensor" ||
        simulationModel === "forceSensor";
      const isFlex =
        componentType === "flexSensor" ||
        simulationModel === "flexSensor";
      const isGas =
        componentType === "gasSensor" || simulationModel === "gasSensor";
      const isSoil =
        componentType === "soilMoisture" ||
        simulationModel === "soilMoisture";
      const isTemp =
        componentType === "temperatureSensor" ||
        simulationModel === "temperatureSensor";

      if (!isPot && !isPhotoresistor && !isForceSensor && !isFlex && !isGas && !isSoil && !isTemp) continue;

      // Check full electrical connectivity (VCC, GND, Signal)
      if (!validateComponentConnections(node, nodes, edges)) continue;

      let wiredChannel: number | null = null;
      if (arduinoNode) {
        wiredChannel = findArduinoAnalogChannelConnection({
          edges,
          nodes,
          componentNodeId: node.id,
          componentHandles: isPot
            ? ["wiper", "pin2"]
            : isPhotoresistor || isForceSensor || isFlex
              ? ["pin1", "pin2"]
              : isGas
                ? ["a1", "a2", "b1", "b2"]
                : isSoil
                  ? ["signal", "sig", "out", "sig1", "sig2"]
                  : ["out", "signal", "vout"],
          arduinoNodeId: arduinoNode.id,
        });
      } else if (picoNode) {
        const handles = isPot
          ? ["wiper"]
          : isPhotoresistor || isForceSensor || isFlex
            ? ["pin1", "pin2"]
            : isGas
              ? ["a1", "a2", "b1", "b2"]
              : isSoil
                ? ["signal", "sig", "out", "sig1", "sig2"]
                : ["out", "signal", "vout"];
        for (const h of handles) {
          for (const adcPin of [26, 27, 28]) {
            const connected = edges.some(
              (edge) =>
                (edge.source === node.id &&
                  edge.sourceHandle === h &&
                  edge.target === picoNode.id &&
                  edge.targetHandle === `gp${adcPin}`) ||
                (edge.target === node.id &&
                  edge.targetHandle === h &&
                  edge.source === picoNode.id &&
                  edge.sourceHandle === `gp${adcPin}`),
            );
            if (connected) {
              wiredChannel = adcPin;
              break;
            }
          }
          if (wiredChannel !== null) break;
        }
      }

      let fallbackChannel = picoNode ? 26 : 0;
      if (isGas) fallbackChannel = picoNode ? 26 : 0;
      else if (isSoil) fallbackChannel = picoNode ? 27 : 1;
      else if (isTemp) fallbackChannel = picoNode ? 28 : 2;
      else if (isPot)
        fallbackChannel = picoNode
          ? 26
          : Number(node.data.properties?.analogChannel?.value ?? 0);
      else if (isPhotoresistor)
        fallbackChannel = picoNode
          ? 26
          : Number(node.data.properties?.analogChannel?.value ?? 0);
      else if (isForceSensor)
        fallbackChannel = picoNode
          ? 26
          : Number(node.data.properties?.analogChannel?.value ?? 0);
      else if (isFlex)
        fallbackChannel = picoNode
          ? 26
          : Number(node.data.properties?.analogChannel?.value ?? 0);

      const targetChannel = wiredChannel ?? fallbackChannel;
      if (channel !== targetChannel) continue;

      if (isForceSensor) {
        // Fallback voltage divider (Vcc=5V, Rfixed=10k, Rfsr=Rmax*(Rmin/Rmax)^(force/10))
        const force = Math.max(0, Math.min(10, Number(node.data.properties?.force?.value ?? 0)));
        const Rmax = 10_000_000;
        const Rmin = 1_000;
        const rfsr = Rmax * Math.pow(Rmin / Rmax, force / 10);
        const rfixed = 10000;
        return 5 * (rfixed / (rfsr + rfixed));
      }

      if (isFlex) {
        const bendVal = Math.max(0, Math.min(180, Number(node.data.properties?.bend?.value ?? 0)));
        return 5 * (1 - bendVal / 180);
      }

      if (isPhotoresistor) return getPhotoresistorVoltage(node);
      if (isPot) {
        const position = Math.max(
          0,
          Math.min(100, Number(node.data.properties?.position?.value ?? 50)),
        );
        return getPotentiometerWiperVoltage(5, 0, position);
      }
      if (isGas) {
        const gasLevel = Math.max(
          0,
          Math.min(1023, Number(node.data.properties?.gasLevel?.value ?? 0)),
        );
        return (gasLevel / 1023) * 5;
      }
      if (isSoil) {
        const moisture = Math.max(
          0,
          Math.min(1023, Number(node.data.properties?.moisture?.value ?? 0)),
        );
        let isSoilInverted = false;
        const code = snapshotRef.current.arduinoCode;
        if (code) {
          const cleaned = code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
          const mapPattern = /map\s*\(\s*[^,]+\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,/i;
          const mapMatch = cleaned.match(mapPattern);
          if (mapMatch) {
            const fromLow = Number(mapMatch[1].trim());
            const fromHigh = Number(mapMatch[2].trim());
            if (Number.isFinite(fromLow) && Number.isFinite(fromHigh)) {
              isSoilInverted = fromLow > fromHigh;
            }
          }
        }
        const effectiveMoisture = isSoilInverted ? 1023 - moisture : moisture;
        return (effectiveMoisture / 1023) * 5;
      }
      if (isTemp) {
        const temperature = Math.max(
          -40,
          Math.min(125, Number(node.data.properties?.temperature?.value ?? 25)),
        );
        return temperature * 0.01 + 0.5;
      }
    }
    return 0;
  };
}

/**
 * Build a pin number → digital value callback from the circuit snapshot.
 * For pushbuttons: pressed='on' → 0 (active low with PULL_UP), released → 1
 * For slideswitches: state='right' → 0 (circuit closed), 'left' → 1
 * The snapshotRef is mutable so live button clicks propagate immediately.
 */
function buildInputPinCallback(
  snapshotRef: { current: SimulationSnapshot },
  initialEdges: CircuitEdge[],
): (pin: number) => number {
  return (requestedPin: number): number => {
    const { nodes, edges } = snapshotRef.current;
    // Prefer edges from the live snapshot, fall back to initial
    const activeEdges = edges.length > 0 ? edges : initialEdges;

    const arduinoNode = nodes.find(
      (n) => (n.data.componentType ?? "") === "arduino",
    );
    const picoNode = nodes.find(
      (n) => (n.data.componentType ?? "") === "raspberrypipico",
    );
    const boardNode = arduinoNode ?? picoNode;
    if (!boardNode) return 1;

    const isPico = boardNode === picoNode;

    const graph = buildConductiveGraphForStore(nodes, activeEdges);
    let pinHandle = isPico
      ? `gp${requestedPin}`
      : requestedPin >= 14 && requestedPin <= 19
        ? `a${requestedPin - 14}`
        : `d${requestedPin}`;

    const pinEndpoint = `${boardNode.id}:${pinHandle}`;
    const reachable = getReachableGraphNodes(graph, pinEndpoint);

    for (const node of nodes) {
      const ct = (node.data.componentType ?? "") as string;
      const sm = (node.data.simulationModel ?? "") as string;
      const isPushButton = ct === "pushbutton" || sm === "pushbutton";
      const isSlideSwitch = ct === "slideswitch" || sm === "slideswitch";
      const isPir = ct === "pirSensor" || sm === "pirSensor";
      const isTilt = ct === "tiltSensor" || sm === "tiltSensor";
      if (!isPushButton && !isSlideSwitch && !isPir && !isTilt) continue;

      // Check if any terminal/handle of this component is reachable from the requested pin
      let isConnected = false;
      for (const endpoint of reachable) {
        if (endpoint.startsWith(`${node.id}:`)) {
          isConnected = true;
          break;
        }
      }

      if (isConnected) {
        // Return state
        if (isPushButton) {
          const state = node.data.properties?.state?.value;
          // Pressed (ON) with PULL_UP = logic LOW = 0
          return state === "on" ? 0 : 1;
        }
        if (isTilt) {
          const angle = Number(node.data.properties?.angle?.value ?? 0);
          const contactClosed = angle >= TILT_THRESHOLD;
          return contactClosed ? 0 : 1;
        }
        if (isSlideSwitch) {
          const state = node.data.properties?.state?.value;
          // 'right' or 'on' = connected = LOW = 0
          // 'left' or 'off' = open = HIGH = 1
          if (state === "right" || state === "on") {
            return 0;
          }
          if (state === "left" || state === "off") {
            return 1;
          }
          // Default to HIGH if state is unrecognized
          return 1;
        }
        if (isPir) {
          const motionValue =
            node.data.pirMotion ?? node.data.properties?.motion?.value;
          return motionValue === true ||
            motionValue === "true" ||
            motionValue === 1 ||
            motionValue === "1"
            ? 1
            : 0;
        }
      }
    }

    // Default: floating HIGH (PULL_UP, button not pressed)
    return 1;
  };
}

export class SimulationSession {
  private readonly onFrame: (frame: SimulationFrame) => void;
  private arduinoSimulator: ArduinoSimulator | null = null;
  private picoTimer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private snapshot: SimulationSnapshot | null = null;
  /** Mutable ref so the analog callback always reads the latest node states. */
  private snapshotRef: { current: SimulationSnapshot } = {
    current: {
      nodes: [],
      edges: [],
      boardType: "none",
      arduinoCode: "",
      picoCode: "",
    },
  };

  constructor(onFrame: (frame: SimulationFrame) => void) {
    this.onFrame = onFrame;
  }

  sendSerialData(data: string) {
    if (this.arduinoSimulator) {
      this.arduinoSimulator.sendSerialData(data);
    }
  }

  start(snapshot: SimulationSnapshot) {
    this.stop();
    this.snapshot = snapshot;
    this.snapshotRef.current = snapshot;
    this.tick = 0;

    if (snapshot.boardType === "arduino") {
      const simulator = new ArduinoSimulator(
        (state) => this.pushArduinoFrame(this.snapshot || snapshot, state),
        {
          ultrasonicDevices: getUltrasonicDevicesForSnapshot(snapshot),
          onSimulatorStarted: () => this.updateSimulatorDigitalInputs(),
        },
      );
      // Wire analog input devices → ADC analog voltage
      const hasAnalogInputDevice = snapshot.nodes.some((n) => {
        const ct = n.data.componentType ?? "";
        const sm = n.data.simulationModel ?? "";
        return (
          ct === "potentiometer" ||
          sm === "potentiometer" ||
          ct === "photoresistor" ||
          sm === "photoresistor" ||
          ct === "forceSensor" ||
          sm === "forceSensor" ||
          ct === "flexSensor" ||
          sm === "flexSensor" ||
          ct === "gasSensor" ||
          sm === "gasSensor" ||
          ct === "soilMoisture" ||
          sm === "soilMoisture" ||
          ct === "temperatureSensor" ||
          sm === "temperatureSensor"
        );
      });
      if (hasAnalogInputDevice) {
        simulator.setAnalogVoltageCallback(
          buildAnalogVoltageCallback(this.snapshotRef),
        );
      }
      // Wire pushbutton/slideswitch/PIR → digital input pin values
      const hasDigitalInputDevice = snapshot.nodes.some((n) => {
        const ct = n.data.componentType ?? "";
        const sm = n.data.simulationModel ?? "";
        return (
          ct === "pushbutton" ||
          sm === "pushbutton" ||
          ct === "slideswitch" ||
          sm === "slideswitch" ||
          ct === "pirSensor" ||
          sm === "pirSensor" ||
          ct === "tiltSensor" ||
          sm === "tiltSensor" ||
          ct.startsWith("keypad") ||
          sm.startsWith("keypad")
        );
      });
      const hasPico = snapshot.nodes.some(
        (n) => (n.data.componentType ?? "") === "raspberrypipico",
      );
      if (hasDigitalInputDevice || hasPico) {
        simulator.setInputPinCallback(
          buildInputPinCallback(this.snapshotRef, snapshot.edges),
        );
      }
      this.arduinoSimulator = simulator;
      void simulator.start(snapshot.arduinoCode).then(() => {
        this.syncKeypadConnections();
      });
      return;
    }

    if (snapshot.boardType === "pico") {
      const emitPicoFrame = () => {
        this.tick += 1;
        this.onFrame(
          buildSimulationFrame({
            tick: this.tick,
            nodes: snapshot.nodes,
            edges: snapshot.edges,
            dynamicComponents: snapshot.dynamicComponents,
            boardType: "pico",
            servoMotions: snapshot.servoMotions,
            running: true,
            timestamp: Date.now(),
          }),
        );
      };

      emitPicoFrame();
      this.picoTimer = setInterval(emitPicoFrame, 100);
      return;
    }

    this.onFrame(
      buildSimulationFrame({
        tick: this.tick,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        dynamicComponents: snapshot.dynamicComponents,
        boardType: "none",
        servoMotions: snapshot.servoMotions,
        running: true,
      }),
    );
  }

  stop() {
    this.arduinoSimulator?.stop();
    this.arduinoSimulator = null;
    if (this.picoTimer) clearInterval(this.picoTimer);
    this.picoTimer = null;

    if (this.snapshot) {
      this.onFrame(
        buildSimulationFrame({
          tick: this.tick,
          nodes: this.snapshot.nodes,
          edges: this.snapshot.edges,
          dynamicComponents: this.snapshot.dynamicComponents,
          boardType: this.snapshot.boardType,
          servoMotions: this.snapshot.servoMotions,
          running: false,
        }),
      );
    }
  }

  /**
   * Push updated node/edge state into the session without restarting the
   * AVR simulation. This lets live property changes (e.g. turning the
   * potentiometer knob) propagate to analogRead() immediately.
   */
  updateSnapshot(
    partialSnapshot: Partial<Pick<SimulationSnapshot, "nodes" | "edges">>,
  ) {
    if (!this.snapshot) return;
    this.snapshot = { ...this.snapshot, ...partialSnapshot };
    this.snapshotRef.current = this.snapshot;
    this.syncKeypadConnections();
  }

  private syncKeypadConnections() {
    if (!this.snapshot) return;
    const { nodes, edges } = this.snapshot;

    const mcuNode = nodes.find(
      (node) =>
        (node.data.componentType || node.type) === "arduino" ||
        (node.data.componentType || node.type) === "raspberrypipico",
    );
    if (!mcuNode) return;

    const isPico = (mcuNode.data.componentType || mcuNode.type) === "raspberrypipico";

    const keypads = nodes.filter(
      (node) =>
        node.data.componentType === "keypad4x4" ||
        node.data.componentType === "keypad4x3",
    );

    const activeConnections: [number, number][] = [];

    for (const keypad of keypads) {
      const is4x4 = keypad.data.componentType === "keypad4x4";
      const pressedKeysStr = String(keypad.data.properties?.pressedKeys?.value ?? "");
      const pressedKeys = pressedKeysStr ? pressedKeysStr.split(",") : [];
      if (pressedKeys.length === 0) continue;

      const KEY_MATRIX = is4x4
        ? [
            ["1", "2", "3", "A"],
            ["4", "5", "6", "B"],
            ["7", "8", "9", "C"],
            ["*", "0", "#", "D"],
          ]
        : [
            ["1", "2", "3"],
            ["4", "5", "6"],
            ["7", "8", "9"],
            ["*", "0", "#"],
          ];

      const rowPinNames = ["row1", "row2", "row3", "row4"];
      const colPinNames = is4x4
        ? ["column1", "column2", "column3", "column4"]
        : ["column1", "column2", "column3"];

      const rowPins = rowPinNames.map((name) =>
        findConnectedMcuDigitalPin({
          edges,
          nodes,
          componentNodeId: keypad.id,
          componentHandle: name,
          arduinoNodeId: mcuNode.id,
          isPico,
        }),
      );

      const colPins = colPinNames.map((name) =>
        findConnectedMcuDigitalPin({
          edges,
          nodes,
          componentNodeId: keypad.id,
          componentHandle: name,
          arduinoNodeId: mcuNode.id,
          isPico,
        }),
      );

      pressedKeys.forEach((key) => {
        let rIdx = -1;
        let cIdx = -1;
        for (let r = 0; r < KEY_MATRIX.length; r++) {
          const c = KEY_MATRIX[r].indexOf(key);
          if (c !== -1) {
            rIdx = r;
            cIdx = c;
            break;
          }
        }
        if (rIdx !== -1 && cIdx !== -1) {
          const targetRowPin = rowPins[rIdx];
          const targetColPin = colPins[cIdx];
          if (targetRowPin !== null && targetColPin !== null) {
            activeConnections.push([targetRowPin, targetColPin]);
          }
        }
      });
    }

    // if (this.arduinoSimulator) {
    //   this.arduinoSimulator.setShortCircuits(activeConnections);
    // }
  }

  private updateSimulatorDigitalInputs() {
    if (!this.arduinoSimulator || !this.snapshot) return;

    const { nodes, edges } = this.snapshot;
    const mcuNode = nodes.find(
      (node) =>
        (node.data.componentType || node.type) === "arduino" ||
        (node.data.componentType || node.type) === "raspberrypipico",
    );
    if (!mcuNode) return;

    const isPico = (mcuNode.data.componentType || mcuNode.type) === "raspberrypipico";

    // Keypad 4x4 / 4x3 — set column pins HIGH (pull-up) to prevent phantom key presses
    const keypadTypes = ["keypad4x4", "keypad4x3"];
    for (const kpType of keypadTypes) {
      const kpNode = nodes.find(
        (node) => (node.data.componentType || node.type) === kpType,
      );
      if (!kpNode) continue;
      const colCount = kpType === "keypad4x4" ? 4 : 3;
      for (let i = 1; i <= colCount; i++) {
        const colHandle = `column${i}`;
        let pin = findArduinoPinConnection({
          edges,
          componentNodeId: kpNode.id,
          componentHandle: colHandle,
          arduinoNodeId: mcuNode.id,
          isPico,
        });
        if (pin === null) {
          const defaults = kpType === "keypad4x4" ? [5, 4, 3, 2] : [5, 4, 3];
          pin = defaults[i - 1];
        }
        this.arduinoSimulator.setInputPinState(pin, true);
      }
    }
  }

  private pushArduinoFrame(
    snapshot: SimulationSnapshot,
    state: SimulatorState,
  ) {
    this.tick += 1;
    this.onFrame(
      buildSimulationFrame({
        tick: this.tick,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        dynamicComponents: snapshot.dynamicComponents,
        boardType: snapshot.boardType,
        arduinoState: state,
        servoMotions: snapshot.servoMotions,
        running: state.running,
        error: state.error,
      }),
    );
  }
}
