import type { CircuitNode, CircuitEdge } from "../../types";
import type { SimulationFrame } from "../../simulation-state";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { getEndpointVoltage } from "../../circuit/pinMapping";

/**
 * Tracks the last consumed transmission sequence and simulation tick per MCU pin.
 * Ensures edge-triggered .read() semantics: a single button transmission is returned
 * once per button click per pin, allowing multiple evaluators in the same simulation tick
 * to read the command, but returning null on subsequent ticks until a new click arrives.
 */
const lastConsumedTimestamps = new Map<number, { seq: number; tick: number }>();

/** Complete 21-Button Standard NEC Protocol Command Map (Address 0x00) */
export const NEC_COMMANDS: Record<string, number> = {
  POWER: 0x45,
  STANDBY: 0x45,
  VOL_PLUS: 0x46,
  VOLPLUS: 0x46,
  FUNC_STOP: 0x47,
  FUNC: 0x47,
  STOP: 0x47,
  REWIND: 0x44,
  PLAY_PAUSE: 0x40,
  PLAY: 0x40,
  PAUSE: 0x40,
  FAST_FORWARD: 0x43,
  FORWARD: 0x43,
  DOWN: 0x07,
  VOL_MINUS: 0x15,
  VOLMINUS: 0x15,
  UP: 0x09,
  NUM_0: 0x16,
  NUM0: 0x16,
  EQ: 0x19,
  ST_REPT: 0x0d,
  RPT: 0x0d,
  REPT: 0x0d,
  NUM_1: 0x0c,
  NUM1: 0x0c,
  NUM_2: 0x18,
  NUM2: 0x18,
  NUM_3: 0x5e,
  NUM3: 0x5e,
  NUM_4: 0x08,
  NUM4: 0x08,
  NUM_5: 0x1c,
  NUM5: 0x1c,
  NUM_6: 0x5a,
  NUM6: 0x5a,
  NUM_7: 0x42,
  NUM7: 0x42,
  NUM_8: 0x52,
  NUM8: 0x52,
  NUM_9: 0x4a,
  NUM9: 0x4a,
};

/** Resets all IR receiver consumption tracking and cached command states. */
export function resetIrReceiverState(): void {
  lastConsumedTimestamps.clear();
}

/** Resolves the decoded NEC command byte from an IR receiver connected to the specified MCU pin. */
export function resolveIrReceiverValue(
  pinNum?: number,
  overrideNodes?: CircuitNode[],
  overrideEdges?: CircuitEdge[],
  overrideFrame?: SimulationFrame | null,
): number | null {
  if (typeof pinNum !== "number") return null;
  // Pin guard: Flash memory pins GPIO6-11 are prohibited
  if (pinNum >= 6 && pinNum <= 11) return null;

  const store = useCircuitStore.getState();
  const nodes = overrideNodes || store.nodes;
  const edges = overrideEdges || store.edges;
  const frame = overrideFrame || store.simulationFrame;
  if (!nodes || !edges) return null;

  // On tick 0 or stopped simulation, reset consumption history and return null
  if (frame && (frame.tick === 0 || !frame.running)) {
    resetIrReceiverState();
    return null;
  }

  const pinHandle = `gpio${pinNum}`;

  // 1. Locate the edge connecting this MCU pin to an irReceiver's "out" pin
  const irEdge = edges.find((e) => {
    const isTargetReceiver =
      e.targetHandle === "out" &&
      (e.sourceHandle?.toLowerCase() === pinHandle || e.sourceHandle?.toLowerCase() === `gp${pinNum}`);
    const isSourceReceiver =
      e.sourceHandle === "out" &&
      (e.targetHandle?.toLowerCase() === pinHandle || e.targetHandle?.toLowerCase() === `gp${pinNum}`);
    return isTargetReceiver || isSourceReceiver;
  });

  if (!irEdge) return null;

  const receiverNodeId = irEdge.sourceHandle === "out" ? irEdge.source : irEdge.target;
  const receiverNode = nodes.find((n) => n.id === receiverNodeId);
  if (!receiverNode) return null;

  // 2. Validate electrical power (VCC and GND)
  const isPowered = isIrReceiverConnectedAndPowered(receiverNode, nodes, edges, frame);
  if (!isPowered) return null;

  // 3. Check for active decoded command from frame telemetry or remote node properties
  let cmd: number | null = null;
  let seq: number = 0;

  if (frame?.components?.[receiverNodeId]?.telemetry?.lastCommand !== undefined) {
    const rawCmd = frame.components[receiverNodeId].telemetry?.lastCommand;
    if (typeof rawCmd === "number") {
      cmd = rawCmd;
      const rawSeq =
        frame.components[receiverNodeId].telemetry?.seq ??
        frame.components[receiverNodeId].telemetry?.tick ??
        frame.components[receiverNodeId].telemetry?.timestamp;
      seq = typeof rawSeq === "number" ? rawSeq : (frame.tick ?? 1);
    }
  }

  // Fallback: check all irRemote nodes on the canvas if frame telemetry isn't set yet
  if (cmd === null) {
    const remoteNodes = nodes.filter(
      (n) => n.type === "irRemote" || getNodeSimulationModel(n) === "irRemote"
    );
    for (const rNode of remoteNodes) {
      const rawCmd = rNode.data?.properties?.lastCommand?.value;
      if (rawCmd) {
        try {
          const parsed = typeof rawCmd === "string" ? JSON.parse(rawCmd) : rawCmd;
          if (parsed && typeof parsed.command === "number") {
            cmd = parsed.command;
            seq =
              typeof parsed.seq === "number"
                ? parsed.seq
                : typeof parsed.timestamp === "number"
                  ? parsed.timestamp
                  : 1;
            break;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }
  }

  if (cmd === null) return null;

  // 4. Edge-Triggered Semantics: Check if this specific transmission sequence has already been consumed by this pin in an earlier tick
  const currentTick = frame?.tick ?? 1;
  const lastConsumed = lastConsumedTimestamps.get(pinNum);
  if (lastConsumed !== undefined) {
    if (lastConsumed.seq >= seq && currentTick > lastConsumed.tick) {
      return null; // Already consumed by this receiver pin in a prior simulation frame
    }
  }

  // Mark as consumed for this pin on current tick
  lastConsumedTimestamps.set(pinNum, { seq, tick: currentTick });
  return cmd;
}

/** Checks whether the specified IR receiver has valid VCC (> 2.5V) and GND connections. */
export function isIrReceiverConnectedAndPowered(
  receiverNode: CircuitNode,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  frame?: SimulationFrame | null,
): boolean {
  const connectedEdges = edges.filter(
    (e) => e.source === receiverNode.id || e.target === receiverNode.id
  );

  // Check VCC (> 2.5V)
  const vccEdge = connectedEdges.find(
    (e) =>
      (e.source === receiverNode.id && e.sourceHandle === "vcc") ||
      (e.target === receiverNode.id && e.targetHandle === "vcc")
  );
  if (!vccEdge) return false;

  const vccTarget = vccEdge.target === receiverNode.id;
  const vccRemoteId = vccTarget ? vccEdge.source : vccEdge.target;
  const vccRemoteHandle = (vccTarget ? vccEdge.sourceHandle : vccEdge.targetHandle) || "";

  let vccVoltage = 0;
  if (frame && frame.components && Object.keys(frame.components).length > 0) {
    vccVoltage = getEndpointVoltage(frame, vccRemoteId, vccRemoteHandle);
  }
  if (vccVoltage < 2.5) {
    // Structural fallback check (e.g. connected directly to 3V3, 5V, VCC, or VIN handle)
    const h = vccRemoteHandle.toLowerCase();
    if (h.includes("3v3") || h.includes("vcc") || h.includes("5v") || h.includes("vin")) {
      vccVoltage = 3.3;
    }
  }
  if (vccVoltage < 2.5) return false;

  // Check GND (< 0.8V or mode === "GND")
  const gndEdge = connectedEdges.find(
    (e) =>
      (e.source === receiverNode.id && e.sourceHandle === "gnd") ||
      (e.target === receiverNode.id && e.targetHandle === "gnd")
  );
  if (!gndEdge) return false;

  const gndTarget = gndEdge.target === receiverNode.id;
  const gndRemoteId = gndTarget ? gndEdge.source : gndEdge.target;
  const gndRemoteHandle = (gndTarget ? gndEdge.sourceHandle : gndEdge.targetHandle) || "";

  if (frame && frame.components) {
    const boardPin = frame.boardPins?.find((p) => {
      if (!p.handleId) return false;
      const lastColon = p.handleId.lastIndexOf(":");
      const localHandle = lastColon !== -1 ? p.handleId.slice(lastColon + 1) : p.handleId;
      return localHandle.toLowerCase() === gndRemoteHandle.toLowerCase();
    });

    if (boardPin && (boardPin.mode === "GND" || (boardPin.mode === "OUTPUT" && boardPin.value === 0))) {
      return true;
    }
    const vGnd = getEndpointVoltage(frame, gndRemoteId, gndRemoteHandle);
    return vGnd < 0.8;
  }

  // Structural fallback check
  const gh = gndRemoteHandle.toLowerCase();
  return gh.includes("gnd");
}
