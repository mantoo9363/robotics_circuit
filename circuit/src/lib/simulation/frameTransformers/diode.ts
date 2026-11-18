import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../../circuit/graph";

export function applyDiodeInputToFrame(frame: SimulationFrame): SimulationFrame {
  if (!frame.running) return frame;

  const { nodes, edges } = useCircuitStore.getState();

  const diodeNodes = nodes.filter(
    (node) =>
      node.data.componentType === "diode" ||
      node.type === "diode" ||
      node.data.componentType === "Diode",
  );
  if (diodeNodes.length === 0) return frame;

  const components = { ...frame.components };

  for (const diodeNode of diodeNodes) {
    let anodeVoltage = 0;
    let cathodeVoltage = 0;

    const connectedEdges = edges.filter(
      (edge) => edge.source === diodeNode.id || edge.target === diodeNode.id,
    );

    // Check which pins have wires connected (for floating-pin warning)
    const anodeConnected = connectedEdges.some(
      (e) =>
        (e.target === diodeNode.id && e.targetHandle?.toLowerCase().includes("anode")) ||
        (e.source === diodeNode.id && e.sourceHandle?.toLowerCase().includes("anode")),
    );
    const cathodeConnected = connectedEdges.some(
      (e) =>
        (e.target === diodeNode.id && e.targetHandle?.toLowerCase().includes("cathode")) ||
        (e.source === diodeNode.id && e.sourceHandle?.toLowerCase().includes("cathode")),
    );

    for (const edge of connectedEdges) {
      const isTarget = edge.target === diodeNode.id;
      const localHandle =
        (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
      const remoteNodeId = isTarget ? edge.source : edge.target;
      const remoteVoltage = getEndpointVoltage(
        frame,
        remoteNodeId,
        isTarget ? edge.sourceHandle : edge.targetHandle,
      );

      // FIXED: Strict structural normalization to match case-sensitive definition registries
      const normalHandle = localHandle.toString().toLowerCase();
      if (normalHandle.includes("anode")) anodeVoltage = remoteVoltage;
      if (normalHandle.includes("cathode")) cathodeVoltage = remoteVoltage;
    }


    // const forwardThreshold = 0.7;
    // let outputVoltage = 0;
    // let isForwardBiased = false;

    // if (anodeVoltage > cathodeVoltage + 0.05) {
    //   isForwardBiased = true;
    //   outputVoltage = Math.max(0, anodeVoltage - forwardThreshold);
    // }
    // Silicon diode standard barrier threshold logic
    const forwardThreshold = 0.7;
    let outputVoltage = 0;
    let isForwardBiased = false;

    // Universal implementation checking barrier voltage logic
    if (anodeVoltage - cathodeVoltage >= 0.1) {
      isForwardBiased = true;
      outputVoltage = Math.max(0, anodeVoltage - forwardThreshold);
    }
    components[diodeNode.id] = {
      ...(components[diodeNode.id] ?? {
        nodeId: diodeNode.id,
        componentType: "diode",
      }),
      isPowered: isForwardBiased,
      voltage: outputVoltage,
      telemetry: {
        anodeVoltage,
        cathodeVoltage,
        biasMode: isForwardBiased ? "Forward Bias (ON)" : "Reverse Bias (OFF)",
        anodeConnected, // for pin warning
        cathodeConnected, // for pin warning
      },
      pins: {
        anode: {
          handleId: "anode",
          voltage: anodeVoltage,
          normalizedValue: anodeVoltage / 5.0,
          active: true,
        },
        cathode: {
          handleId: "cathode",
          voltage: outputVoltage,
          normalizedValue: outputVoltage / 5.0,
          active: true,
        },
      },
    };

    if (isForwardBiased) {
      for (const edge of connectedEdges) {
        const isTarget = edge.target === diodeNode.id;
        const localHandle =
          (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
        if (localHandle.toString().toLowerCase().includes("cathode")) {
          const remoteNodeId = isTarget ? edge.source : edge.target;
          if (components[remoteNodeId]) {
            components[remoteNodeId].voltage = outputVoltage;
          }
        }
      }
    }
  }

  return { ...frame, components };
}