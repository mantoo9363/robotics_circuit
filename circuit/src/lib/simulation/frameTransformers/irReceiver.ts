import type { SimulationFrame, SimulationNodePinState } from "../../simulation-state";
import type { SimContext } from "../types";
import type { CircuitNode, CircuitEdge } from "../../types";
import { getNodeSimulationModel } from "../../circuit/components";
import { getEndpointVoltage } from "../../circuit/pinMapping";

/**
 * Board-agnostic frame transformer for IR Receiver (e.g. VS1838B / TSOP38238).
 * Evaluates VCC / GND power delivery and decodes active wireless NEC transmission
 * from an irRemote node on the canvas.
 */
export function applyIrReceiverInputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  const { nodes, edges } = context;
  if (!nodes || !edges) return frame;

  const receiverNodes = nodes.filter(
    (n: CircuitNode) => getNodeSimulationModel(n) === "irReceiver" || n.type === "irReceiver"
  );
  if (receiverNodes.length === 0) return frame;

  // Find any active irRemote node on the canvas
  const remoteNodes = nodes.filter(
    (n: CircuitNode) => getNodeSimulationModel(n) === "irRemote" || n.type === "irRemote"
  );

  let activeCommand: { command: number; name: string; address: number; seq: number; timestamp: number } | null = null;

  // Only decode active remote transmissions when simulation is actively running past tick 0
  if (frame.tick > 0 && frame.running) {
    for (const rNode of remoteNodes) {
      const lastCmdVal = rNode.data?.properties?.lastCommand?.value;
      if (lastCmdVal) {
        try {
          const parsed = typeof lastCmdVal === "string" ? JSON.parse(lastCmdVal) : lastCmdVal;
          if (parsed && typeof parsed.command === "number") {
            const seq = typeof parsed.seq === "number" ? parsed.seq : (typeof parsed.timestamp === "number" ? parsed.timestamp : frame.tick);
            activeCommand = {
              command: parsed.command,
              name: parsed.name || "",
              address: parsed.address ?? 0,
              seq,
              timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : frame.tick,
            };
            break;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }
  }

  const updatedComponents = { ...frame.components };

  for (const rNode of receiverNodes) {
    const connectedEdges = edges.filter(
      (e: CircuitEdge) => e.source === rNode.id || e.target === rNode.id
    );

    // 1. Check VCC pin voltage (> 2.5V)
    const vccEdge = connectedEdges.find(
      (e: CircuitEdge) => (e.source === rNode.id && e.sourceHandle === "vcc") || (e.target === rNode.id && e.targetHandle === "vcc")
    );
    let vccVoltage = 0;
    if (vccEdge) {
      const isTarget = vccEdge.target === rNode.id;
      const remoteId = isTarget ? vccEdge.source : vccEdge.target;
      const remoteHandle = isTarget ? vccEdge.sourceHandle : vccEdge.targetHandle;
      vccVoltage = getEndpointVoltage(frame, remoteId, remoteHandle);
    }

    // 2. Check GND pin connection (< 0.8V or mode === "GND")
    const gndEdge = connectedEdges.find(
      (e: CircuitEdge) => (e.source === rNode.id && e.sourceHandle === "gnd") || (e.target === rNode.id && e.targetHandle === "gnd")
    );
    let gndConnected = false;
    if (gndEdge) {
      const isTarget = gndEdge.target === rNode.id;
      const remoteId = isTarget ? gndEdge.source : gndEdge.target;
      const remoteHandle = isTarget ? gndEdge.sourceHandle : gndEdge.targetHandle;

      const boardPin = frame.boardPins?.find((p: SimulationNodePinState) => {
        if (!p.handleId) return false;
        const lastColon = p.handleId.lastIndexOf(":");
        const localHandle = lastColon !== -1 ? p.handleId.slice(lastColon + 1) : p.handleId;
        return localHandle.toLowerCase() === remoteHandle?.toLowerCase();
      });

      if (boardPin && (boardPin.mode === "GND" || (boardPin.mode === "OUTPUT" && boardPin.value === 0))) {
        gndConnected = true;
      } else {
        const vGnd = getEndpointVoltage(frame, remoteId, remoteHandle);
        gndConnected = vGnd < 0.8;
      }
    }

    const isPowered = vccVoltage >= 2.5 && gndConnected;

    // 3. Find connected OUT pin on the board
    const outEdge = connectedEdges.find(
      (e: CircuitEdge) => (e.source === rNode.id && e.sourceHandle === "out") || (e.target === rNode.id && e.targetHandle === "out")
    );
    const signalPin = outEdge
      ? (outEdge.target === rNode.id ? outEdge.sourceHandle : outEdge.targetHandle) ?? null
      : null;

    const telemetry: Record<string, string | number | boolean> = {
      isPowered,
      vccVoltage,
      signalPin: signalPin || "",
    };
    if (isPowered && activeCommand) {
      telemetry.lastCommand = activeCommand.command;
      telemetry.commandName = activeCommand.name;
      telemetry.address = activeCommand.address;
      telemetry.seq = activeCommand.seq;
      telemetry.timestamp = activeCommand.timestamp;
      telemetry.tick = frame.tick;
    }

    updatedComponents[rNode.id] = {
      ...(updatedComponents[rNode.id] ?? { nodeId: rNode.id, componentType: "irReceiver" }),
      isPowered,
      voltage: isPowered ? vccVoltage : 0,
      telemetry,
    };
  }

  return {
    ...frame,
    components: updatedComponents,
  };
}
