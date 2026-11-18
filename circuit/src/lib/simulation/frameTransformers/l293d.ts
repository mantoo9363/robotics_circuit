import type { SimulationFrame } from "../../simulation-state";
import { findPinId } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import type { SimContext } from "../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { buildConductiveGraph, getReachableGraphNodes } from "../../circuit/graph";

/**
 * Result of a single L293D half-H bridge channel evaluation.
 */
interface ChannelEvaluation {
  voltage: number;
  normalizedValue: number;
  active: boolean;
  state: "HIGH_Z" | "LOW" | "HIGH";
}

/** Pin handle aliases for L293D IC components to ensure compatibility with custom SVGs/models. */
const PIN_ALIASES: Record<string, string[]> = {
  vcc: ["vcc", "vcc1", "logic_vcc", "pin16"],
  vs: ["vs", "vcc2", "vm", "motor_vcc", "pin8"],
  gnd: ["gnd", "gnd1", "gnd2", "gnd3", "gnd4", "pin4", "pin5", "pin12", "pin13"],
  enable1: ["enable1", "enable12", "en1", "en12", "pin1"],
  enable2: ["enable2", "enable34", "en2", "en34", "pin9"],
  input1: ["input1", "in1", "1a", "pin2"],
  input2: ["input2", "in2", "2a", "pin7"],
  input3: ["input3", "in3", "3a", "pin10"],
  input4: ["input4", "in4", "4a", "pin15"],
  output1: ["output1", "out1", "1y", "pin3"],
  output2: ["output2", "out2", "2y", "pin6"],
  output3: ["output3", "out3", "3y", "pin11"],
  output4: ["output4", "out4", "4y", "pin14"],
};

/** Recognized physical ground handles across all supported microcontrollers and power supplies. */
const COMMON_GND_HANDLES = [
  "gnd", "gnd1", "gnd2", "gnd3", "gnd4", "gnd5", "gnd6", "gnd7", "gnd8",
  "ground", "pico_gnd", "pico_gnd1", "pico_gnd2", "pico_gnd3", "pico_gnd4",
  "pico_gnd5", "pico_gnd6", "pico_gnd7", "pico_gnd8",
  "esp32_gnd", "esp32_gnd1", "esp32_gnd2", "esp32_gnd3",
  "negative", "minus", "black",
];

function clamp01(val: number): number {
  return Math.max(0, Math.min(1, val));
}

/**
 * Helper to evaluate digital threshold (value > 127 or voltage > 2.0V).
 */
function isSignalHigh(voltageOrVal: number): boolean {
  return voltageOrVal > 127 || voltageOrVal > 2.0;
}

/**
 * Resolves incoming pin voltage & PWM duty cycle for an L293D pin handle by querying board pins & edges.
 */
function getConnectedPinSignal(
  frame: SimulationFrame,
  nodeId: string,
  handle: string,
  edges: CircuitEdge[]
): { voltage: number; normalizedValue: number } {
  const aliases = PIN_ALIASES[handle.toLowerCase()] ?? [handle.toLowerCase()];
  let maxVoltage = 0;
  let maxNormalized = 0;
  let connected = false;

  for (const edge of edges) {
    const isTarget = edge.target === nodeId;
    const isSource = edge.source === nodeId;
    if (!isTarget && !isSource) continue;

    const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle)?.toLowerCase();
    if (!localHandle || !aliases.includes(localHandle)) continue;

    const remoteNodeId = isTarget ? edge.source : edge.target;
    const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
    if (!remoteHandle) continue;

    const matchedBoardPin = frame.boardPins?.find((p) => {
      if (!p.handleId) return false;
      const lastColon = p.handleId.lastIndexOf(":");
      const localId = lastColon !== -1 ? p.handleId.slice(lastColon + 1) : p.handleId;
      const boardNodeId = lastColon !== -1 ? p.handleId.slice(0, lastColon) : null;
      const matchesNode = !boardNodeId || boardNodeId === remoteNodeId;
      const matchesPin =
        localId.toLowerCase() === remoteHandle.toLowerCase() ||
        p.handleId.toLowerCase() === remoteHandle.toLowerCase();
      return matchesNode && matchesPin;
    });

    const isMcuPin =
      /^gp\d+$/i.test(remoteHandle) ||
      /^d\d+$/i.test(remoteHandle) ||
      /^gpio\d+$/i.test(remoteHandle);
    let v = 0;
    let norm = 0;

    const compPins = frame.components[remoteNodeId]?.pins;
    const compPin = compPins ? (compPins[remoteHandle] ?? compPins[remoteHandle.toLowerCase()]) : undefined;

    if (matchedBoardPin) {
      v = compPin?.voltage ?? matchedBoardPin.voltage;
      norm = compPin?.normalizedValue ?? matchedBoardPin.normalizedValue ?? (v > 0 ? 1 : 0);
    } else if (compPin) {
      v = compPin.voltage;
      norm = compPin.normalizedValue ?? (v > 0 ? 1 : 0);
    } else if (!isMcuPin) {
      v = getEndpointVoltage(frame, remoteNodeId, remoteHandle);
      norm = v > 0 ? 1 : 0;
    }

    if (!connected || v > maxVoltage) {
      maxVoltage = v;
      maxNormalized = norm;
      connected = true;
    }
  }

  if (connected) {
    return { voltage: maxVoltage, normalizedValue: maxNormalized };
  }

  const localPin = frame.components[nodeId]?.pins?.[handle];
  return {
    voltage: localPin?.voltage ?? 0,
    normalizedValue: localPin?.normalizedValue ?? (localPin?.voltage ? 1 : 0),
  };
}

/**
 * Evaluates logic state for a single L293D half-H bridge channel according to the TI datasheet truth table.
 */
function evaluateL293DChannel(
  enableSignal: { voltage: number; normalizedValue: number },
  inputSignal: { voltage: number; normalizedValue: number },
  vsVoltage: number,
  isPowered: boolean
): ChannelEvaluation {
  if (!isPowered) {
    return { voltage: 0, normalizedValue: 0, active: false, state: "HIGH_Z" };
  }

  if (!isSignalHigh(enableSignal.voltage) && enableSignal.normalizedValue <= 0) {
    return { voltage: 0, normalizedValue: 0, active: false, state: "HIGH_Z" };
  }

  const enableNorm =
    enableSignal.normalizedValue > 0
      ? enableSignal.normalizedValue
      : isSignalHigh(enableSignal.voltage)
      ? 1.0
      : 0;

  if (isSignalHigh(inputSignal.voltage) || inputSignal.normalizedValue > 0) {
    const inputNorm =
      inputSignal.normalizedValue > 0
        ? inputSignal.normalizedValue
        : isSignalHigh(inputSignal.voltage)
        ? 1.0
        : 0;
    const effectiveDuty = enableNorm * inputNorm;
    const driveVoltage = vsVoltage > 0 ? vsVoltage * effectiveDuty : 0;

    return {
      voltage: driveVoltage,
      normalizedValue: effectiveDuty,
      active: true,
      state: "HIGH",
    };
  }

  return {
    voltage: 0,
    normalizedValue: 0,
    active: true,
    state: "LOW",
  };
}

/** Dynamically updates components connected to L293D output channels using conductive reachability graphs. */
export function applyL293DDrivenLoads(args: {
  l293dNode: CircuitNode;
  channels: [ChannelEvaluation, ChannelEvaluation, ChannelEvaluation, ChannelEvaluation];
  vsVoltage: number;
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  components: Record<string, SimulationFrame["components"][string]>;
}) {
  const graph = buildConductiveGraph(args.nodes, args.edges, { includeResistors: true });
  const channelHandles = ["output1", "output2", "output3", "output4"];

  const channelReachMap = new Map<string, { evaluation: ChannelEvaluation; channelIndex: number }>();
  channelHandles.forEach((handle, idx) => {
    const chEval = args.channels[idx];
    const reach = getReachableGraphNodes(graph, `${args.l293dNode.id}:${handle}`);
    for (const endpoint of reach) {
      if (!channelReachMap.has(endpoint) || chEval.voltage > (channelReachMap.get(endpoint)?.evaluation.voltage ?? 0)) {
        channelReachMap.set(endpoint, { evaluation: chEval, channelIndex: idx });
      }
    }
  });

  const gndEndpoints = new Set<string>();
  for (const node of args.nodes) {
    for (const handleId of COMMON_GND_HANDLES) {
      const reach = getReachableGraphNodes(graph, `${node.id}:${handleId}`);
      for (const endpoint of reach) gndEndpoints.add(endpoint);
    }
  }

  for (const node of args.nodes) {
    if (node.id === args.l293dNode.id) continue;
    const model = getNodeSimulationModel(node);
    const previous = args.components[node.id];

    if (model === "dcmotor" || model === "hobbyGearmotor" || model === "vibrationMotor") {
      const pin1 = findPinId(node, undefined, ["pin1", "positive", "plus", "anode"]);
      const pin2 = findPinId(node, undefined, ["pin2", "negative", "minus", "cathode"]);
      const p1Key = `${node.id}:${pin1}`;
      const p2Key = `${node.id}:${pin2}`;

      const sig1 = channelReachMap.get(p1Key)?.evaluation;
      const sig2 = channelReachMap.get(p2Key)?.evaluation;
      if (sig1 === undefined && sig2 === undefined) continue;

      const p1Grounded = gndEndpoints.has(p1Key);
      const p2Grounded = gndEndpoints.has(p2Key);

      const hasClosedLoop =
        (sig1 !== undefined && sig2 !== undefined) ||
        (sig1 !== undefined && p2Grounded) ||
        (sig2 !== undefined && p1Grounded);

      const vsRef = Math.max(1, args.vsVoltage > 0 ? args.vsVoltage : 5);

      const baseComp = previous ?? {
        nodeId: node.id,
        componentType: node.data.componentType,
        label: node.data.label || "DC Motor",
        isPowered: false,
        brightness: 0,
        voltage: 0,
        telemetry: {},
        pins: {},
      };

      if (hasClosedLoop) {
        const v1 = sig1?.voltage ?? 0;
        const v2 = sig2?.voltage ?? 0;
        const active = (sig1?.active ?? false) || (sig2?.active ?? false);
        const diffV = v1 - v2;
        const normalizedSpeed = clamp01(Math.abs(diffV) / vsRef);
        const isPowered = Math.abs(diffV) > 0.05 && active;

        args.components[node.id] = {
          ...baseComp,
          isPowered,
          brightness: normalizedSpeed,
          voltage: Math.abs(diffV),
          telemetry: {
            ...(previous?.telemetry ?? {}),
            openCircuit: !isPowered,
            rpm: isPowered ? Math.round((diffV > 0 ? 2400 : -2400) * normalizedSpeed) : 0,
            direction: isPowered ? (diffV > 0.05 ? "forward" : "reverse") : "stopped",
            speed: isPowered ? Math.round(normalizedSpeed * 100) : 0,
            voltage: Math.abs(diffV),
          },
          pins: {
            ...(previous?.pins ?? {}),
            [pin1]: {
              handleId: pin1,
              voltage: v1,
              normalizedValue: clamp01(v1 / vsRef),
              active: sig1?.active ?? true,
            },
            [pin2]: {
              handleId: pin2,
              voltage: v2,
              normalizedValue: clamp01(v2 / vsRef),
              active: sig2?.active ?? true,
            },
          },
        };
      } else {
        // Disconnected terminal / open circuit
        args.components[node.id] = {
          ...baseComp,
          isPowered: false,
          brightness: 0,
          voltage: 0,
          telemetry: {
            ...(previous?.telemetry ?? {}),
            openCircuit: true,
            rpm: 0,
            direction: "stopped",
            speed: 0,
            voltage: 0,
          },
          pins: {
            ...(previous?.pins ?? {}),
            [pin1]: {
              handleId: pin1,
              voltage: sig1?.voltage ?? 0,
              normalizedValue: clamp01((sig1?.voltage ?? 0) / vsRef),
              active: sig1?.active ?? false,
            },
            [pin2]: {
              handleId: pin2,
              voltage: sig2?.voltage ?? 0,
              normalizedValue: clamp01((sig2?.voltage ?? 0) / vsRef),
              active: sig2?.active ?? false,
            },
          },
        };
      }
    }
  }
}

export interface L293DGroundValidationResult {
  isGndConnected: boolean;
  errorMessage?: string;
}

/**
 * Validates common ground connectivity between L293D, active controlling MCU (Arduino / Pico RP2040),
 * and any external motor power supply.
 *
 * Why this is needed:
 * Real H-bridge driver ICs (L293D) require a common ground return reference. Without a common ground:
 * 1. Control signals from MCU (Arduino/Pico) cannot establish a voltage potential across input pins.
 * 2. Motor supply (VCC2/VS) has no return path to ground, preventing current from driving the DC motor.
 * 3. The IC internal logic remains in an ungrounded, non-functional state.
 */
export function validateL293DCommonGround(
  nodeId: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  components: Record<string, SimulationFrame["components"][string]>
): L293DGroundValidationResult {
  // If there are no wires on canvas (e.g. mock isolated unit tests), bypass check
  if (edges.length === 0) return { isGndConnected: true };

  // Recognized ground aliases for L293D pins (Pins 4, 5, 12, 13)
  const gndAliases = PIN_ALIASES["gnd"];

  // Build graph of electrically connected nets across wires and breadboards
  const graph = buildConductiveGraph(nodes, edges, { includeResistors: true });

  // STEP 1: Collect all electrically reachable endpoints connected to L293D ground pins (Pins 4, 5, 12, 13)
  const l293dGndNetwork = new Set<string>();
  for (const alias of gndAliases) {
    const reach = getReachableGraphNodes(graph, `${nodeId}:${alias}`);
    for (const ep of reach) l293dGndNetwork.add(ep);
  }

  // Also include direct wire connections to L293D GND pins
  for (const edge of edges) {
    const isTarget = edge.target === nodeId;
    const isSource = edge.source === nodeId;
    if (!isTarget && !isSource) continue;

    const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle)?.toLowerCase();
    if (!localHandle || !gndAliases.includes(localHandle)) continue;

    const remoteNodeId = isTarget ? edge.source : edge.target;
    const remoteHandle = (isTarget ? edge.sourceHandle : edge.targetHandle)?.toLowerCase();
    if (remoteNodeId && remoteHandle) {
      l293dGndNetwork.add(`${remoteNodeId}:${remoteHandle}`);
    }
  }

  // Verify that L293D GND pins connect to at least one valid external ground source
  let hasValidExternalGnd = false;
  for (const ep of l293dGndNetwork) {
    const colonIdx = ep.lastIndexOf(":");
    const epNodeId = colonIdx !== -1 ? ep.slice(0, colonIdx) : "";
    const handle = (colonIdx !== -1 ? ep.slice(colonIdx + 1) : ep).toLowerCase();
    if (epNodeId !== nodeId && COMMON_GND_HANDLES.includes(handle)) {
      hasValidExternalGnd = true;
      break;
    }
  }

  if (!hasValidExternalGnd) {
    return {
      isGndConnected: false,
      errorMessage: "L293D NOT WORKING: COMMON GND CONNECTION REQUIRED",
    };
  }

  // STEP 2: Find all microcontrollers (Arduino / Raspberry Pi Pico) actively driving L293D inputs/enables
  const controlAliases = ["enable1", "enable2", "input1", "input2", "input3", "input4", "in1", "in2", "in3", "in4", "en1", "en2"];
  const controllingMcuNodeIds = new Set<string>();

  for (const edge of edges) {
    const isTarget = edge.target === nodeId;
    const isSource = edge.source === nodeId;
    if (!isTarget && !isSource) continue;

    const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle)?.toLowerCase();
    if (!localHandle || !controlAliases.some((alias) => localHandle.includes(alias))) continue;

    const remoteNodeId = isTarget ? edge.source : edge.target;
    const remoteNode = nodes.find((n) => n.id === remoteNodeId);
    if (!remoteNode) continue;

    const model = getNodeSimulationModel(remoteNode);
    const cType = remoteNode.data.componentType;
    if (["arduino", "pico"].includes(model) || ["arduino", "pico"].includes(cType)) {
      controllingMcuNodeIds.add(remoteNodeId);
    }
  }

  // Verify that every controlling Arduino or Pico MCU shares common ground with the L293D ground net
  for (const mcuId of controllingMcuNodeIds) {
    let mcuGndShared = false;
    for (const ep of l293dGndNetwork) {
      if (ep.startsWith(`${mcuId}:`)) {
        const handle = ep.slice(mcuId.length + 1).toLowerCase();
        if (COMMON_GND_HANDLES.includes(handle)) {
          mcuGndShared = true;
          break;
        }
      }
    }
    if (!mcuGndShared) {
      return {
        isGndConnected: false,
        errorMessage: "L293D NOT WORKING: COMMON GND CONNECTION REQUIRED",
      };
    }
  }

  // STEP 3: Identify external motor power supplies (Battery/Power Supply) connected to VS (Pin 8) or VCC (Pin 16)
  for (const edge of edges) {
    const isTarget = edge.target === nodeId;
    const isSource = edge.source === nodeId;
    if (!isTarget && !isSource) continue;

    const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle)?.toLowerCase();
    if (localHandle !== "vs" && localHandle !== "pin8" && localHandle !== "vcc" && localHandle !== "pin16") continue;

    const remoteNodeId = isTarget ? edge.source : edge.target;
    const remoteNode = nodes.find((n) => n.id === remoteNodeId);
    if (!remoteNode) continue;

    const model = getNodeSimulationModel(remoteNode);
    const cType = remoteNode.data.componentType;
    if (["battery", "powerSupply", "battery9v"].includes(model) || ["battery", "powerSupply", "battery9v"].includes(cType)) {
      let supplyGndShared = false;
      for (const ep of l293dGndNetwork) {
        if (ep.startsWith(`${remoteNodeId}:`)) {
          const handle = ep.slice(remoteNodeId.length + 1).toLowerCase();
          if (["negative", "minus", "gnd", "black"].includes(handle)) {
            supplyGndShared = true;
            break;
          }
        }
      }
      // If external supply negative is not tied to common ground, motor cannot run
      if (!supplyGndShared) {
        return {
          isGndConnected: false,
          errorMessage: "L293D NOT WORKING: COMMON GND CONNECTION REQUIRED",
        };
      }
    }
  }

  return { isGndConnected: true };
}

/** Applies standalone, pin-level electrical simulation for all L293D IC components in the simulation frame. */
export function applyL293DFrameTransformer(
  frame: SimulationFrame,
  context?: SimContext,
): SimulationFrame {
  if (!frame.running) return frame;

  const storeState = useCircuitStore.getState();
  const nodes = context?.nodes ?? storeState.nodes;
  const edges = context?.edges ?? storeState.edges;

  const l293dNodes = nodes.filter(
    (node) =>
      node.data.componentType === "l293d" ||
      getNodeSimulationModel(node) === "l293d"
  );

  if (l293dNodes.length === 0) return frame;

  const components = { ...frame.components };

  for (const node of l293dNodes) {
    const vccSig = getConnectedPinSignal(frame, node.id, "vcc", edges);
    const vsSig = getConnectedPinSignal(frame, node.id, "vs", edges);

    const vccVoltage = vccSig.voltage;
    const vsVoltage = vsSig.voltage;

    // Enforce common ground validation: L293D is considered powered ONLY when
    // logic supply (VCC1) > 0V AND all required common ground connections are satisfied.
    const gndValidation = validateL293DCommonGround(node.id, nodes, edges, components);
    const isGndConnected = gndValidation.isGndConnected;
    const isPowered = vccVoltage > 0 && isGndConnected;

    const enable1Sig = getConnectedPinSignal(frame, node.id, "enable1", edges);
    const enable2Sig = getConnectedPinSignal(frame, node.id, "enable2", edges);

    const input1Sig = getConnectedPinSignal(frame, node.id, "input1", edges);
    const input2Sig = getConnectedPinSignal(frame, node.id, "input2", edges);
    const input3Sig = getConnectedPinSignal(frame, node.id, "input3", edges);
    const input4Sig = getConnectedPinSignal(frame, node.id, "input4", edges);

    const ch1 = evaluateL293DChannel(enable1Sig, input1Sig, vsVoltage, isPowered);
    const ch2 = evaluateL293DChannel(enable1Sig, input2Sig, vsVoltage, isPowered);
    const ch3 = evaluateL293DChannel(enable2Sig, input3Sig, vsVoltage, isPowered);
    const ch4 = evaluateL293DChannel(enable2Sig, input4Sig, vsVoltage, isPowered);

    const previous = components[node.id];

    components[node.id] = {
      ...(previous ?? {
        nodeId: node.id,
        componentType: "l293d",
        label: node.data.label || "L293D",
        isPowered: false,
        brightness: 0,
        voltage: 0,
        telemetry: {},
        pins: {},
      }),
      isPowered,
      voltage: isPowered ? vccVoltage : 0,
      telemetry: {
        ...(previous?.telemetry ?? {}),
        isPowered,
        commonGndOk: isGndConnected,
        ...(gndValidation.errorMessage ? { error: gndValidation.errorMessage } : {}),
        vccVoltage,
        vsVoltage,
        channel1: ch1.state,
        channel2: ch2.state,
        channel3: ch3.state,
        channel4: ch4.state,
      },
      pins: {
        ...(previous?.pins ?? {}),
        vcc: {
          handleId: "vcc",
          voltage: vccVoltage,
          normalizedValue: vccVoltage > 0 ? 1.0 : 0,
          active: isPowered,
        },
        vs: {
          handleId: "vs",
          voltage: vsVoltage,
          normalizedValue: vsVoltage > 0 ? 1.0 : 0,
          active: vsVoltage > 0,
        },
        enable1: {
          handleId: "enable1",
          voltage: enable1Sig.voltage,
          normalizedValue: isSignalHigh(enable1Sig.voltage) ? 1.0 : 0,
          active: isSignalHigh(enable1Sig.voltage),
        },
        enable2: {
          handleId: "enable2",
          voltage: enable2Sig.voltage,
          normalizedValue: isSignalHigh(enable2Sig.voltage) ? 1.0 : 0,
          active: isSignalHigh(enable2Sig.voltage),
        },
        input1: {
          handleId: "input1",
          voltage: input1Sig.voltage,
          normalizedValue: isSignalHigh(input1Sig.voltage) ? 1.0 : 0,
          active: isSignalHigh(input1Sig.voltage),
        },
        input2: {
          handleId: "input2",
          voltage: input2Sig.voltage,
          normalizedValue: isSignalHigh(input2Sig.voltage) ? 1.0 : 0,
          active: isSignalHigh(input2Sig.voltage),
        },
        input3: {
          handleId: "input3",
          voltage: input3Sig.voltage,
          normalizedValue: isSignalHigh(input3Sig.voltage) ? 1.0 : 0,
          active: isSignalHigh(input3Sig.voltage),
        },
        input4: {
          handleId: "input4",
          voltage: input4Sig.voltage,
          normalizedValue: isSignalHigh(input4Sig.voltage) ? 1.0 : 0,
          active: isSignalHigh(input4Sig.voltage),
        },
        output1: {
          handleId: "output1",
          voltage: ch1.voltage,
          normalizedValue: ch1.normalizedValue,
          active: ch1.active,
        },
        output2: {
          handleId: "output2",
          voltage: ch2.voltage,
          normalizedValue: ch2.normalizedValue,
          active: ch2.active,
        },
        output3: {
          handleId: "output3",
          voltage: ch3.voltage,
          normalizedValue: ch3.normalizedValue,
          active: ch3.active,
        },
        output4: {
          handleId: "output4",
          voltage: ch4.voltage,
          normalizedValue: ch4.normalizedValue,
          active: ch4.active,
        },
      },
    };

    applyL293DDrivenLoads({
      l293dNode: node,
      channels: [ch1, ch2, ch3, ch4],
      vsVoltage,
      nodes,
      edges,
      components,
    });
  }

  return {
    ...frame,
    components,
  };
}
