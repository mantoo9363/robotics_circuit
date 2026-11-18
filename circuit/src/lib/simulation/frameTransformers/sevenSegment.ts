import type { SimulationFrame, SimulationNodePinState } from "../../simulation-state";
import type { SimContext } from "../types";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { getNodeSimulationModel } from "../../circuit/components";

export function applySevenSegmentInputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  if (!frame.running) return frame;

  const { nodes, edges } = context;

  const sevenSegmentNodes = nodes.filter(
    (node) => getNodeSimulationModel(node) === "sevenSegment",
  );
  if (sevenSegmentNodes.length === 0) return frame;

  const components = { ...frame.components };
  let changed = false;

  for (const node of sevenSegmentNodes) {
    const pinsList = ["a", "b", "c", "d", "e", "f", "g", "dp", "com1", "com2"] as const;
    const pinReadings: Record<string, { voltage: number; grounded: boolean }> = {};
    const componentPins: Record<string, SimulationNodePinState> = {};

    const connectedEdges = edges.filter(
      (edge) => edge.source === node.id || edge.target === node.id,
    );

    const getSeriesResistorValue = (pinId: string): number => {
      const edge = connectedEdges.find(
        (e) =>
          (e.source === node.id && e.sourceHandle === pinId) ||
          (e.target === node.id && e.targetHandle === pinId),
      );
      if (!edge) return 0;

      const isTarget = edge.target === node.id;
      const remoteNodeId = isTarget ? edge.source : edge.target;
      const remoteNode = nodes.find((n) => n.id === remoteNodeId);
      if (!remoteNode) return 0;

      if (getNodeSimulationModel(remoteNode) === "resistor") {
        return Number(remoteNode.data.properties?.resistance?.value ?? 0);
      }

      if (remoteNode.data.componentType === "breadboard") {
        const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
        const otherEdges = edges.filter(
          (e) =>
            e.id !== edge.id &&
            ((e.source === remoteNodeId && e.sourceHandle === remoteHandle) ||
              (e.target === remoteNodeId && e.targetHandle === remoteHandle)),
        );
        for (const oe of otherEdges) {
          const nextNodeId = oe.source === remoteNodeId ? oe.target : oe.source;
          const nextNode = nodes.find((n) => n.id === nextNodeId);
          if (nextNode && getNodeSimulationModel(nextNode) === "resistor") {
            return Number(nextNode.data.properties?.resistance?.value ?? 0);
          }
        }
      }

      return 0;
    };

    const getSourceVoltage = (pinId: string): number => {
      const edge = connectedEdges.find(
        (e) =>
          (e.source === node.id && e.sourceHandle === pinId) ||
          (e.target === node.id && e.targetHandle === pinId),
      );
      if (!edge) return 0;

      const isTarget = edge.target === node.id;
      const remoteNodeId = isTarget ? edge.source : edge.target;
      const remoteNode = nodes.find((n) => n.id === remoteNodeId);
      if (!remoteNode) return 0;

      if (getNodeSimulationModel(remoteNode) === "resistor") {
        const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
        const otherPin = remoteHandle === "pin1" ? "pin2" : "pin1";
        const resComponent = frame.components[remoteNodeId];
        return resComponent?.pins?.[otherPin]?.voltage ?? 0;
      }

      const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
      return getEndpointVoltage(frame, remoteNodeId, remoteHandle);
    };

    for (const pinId of pinsList) {
      const edge = connectedEdges.find(
        (e) =>
          (e.source === node.id && e.sourceHandle === pinId) ||
          (e.target === node.id && e.targetHandle === pinId),
      );

      let voltage = 0;
      let grounded = false;
      let active = false;

      if (edge) {
        const isTarget = edge.target === node.id;
        const remoteNodeId = isTarget ? edge.source : edge.target;
        const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;

        voltage = getEndpointVoltage(frame, remoteNodeId, remoteHandle);

        const boardPin = frame.boardPins.find((p) => {
          if (!p.handleId) return false;
          const lastColon = p.handleId.lastIndexOf(":");
          const localHandleId =
            lastColon !== -1 ? p.handleId.slice(lastColon + 1) : p.handleId;
          return localHandleId.toLowerCase() === remoteHandle?.toLowerCase();
        });

        if (boardPin) {
          grounded =
            (boardPin.mode === "OUTPUT" && boardPin.value === 0) ||
            boardPin.mode === "GND";
          active = true;
        } else {
          grounded = voltage < 0.8;
          active = true;
        }
      }

      pinReadings[pinId] = { voltage, grounded };
      componentPins[pinId] = {
        handleId: pinId,
        voltage: Number(voltage.toFixed(2)),
        normalizedValue: Math.max(0, Math.min(1, voltage / 5)),
        active,
      };
    }

    const displayType = String(node.data.properties?.displayType?.value ?? "Common Cathode");
    const isCommonAnode = displayType === "Common Anode";

    const isComActive = (comPinId: string) => {
      const r = pinReadings[comPinId];
      if (isCommonAnode) {
        return r.voltage > 1.5;
      } else {
        return r.grounded || (componentPins[comPinId].active && r.voltage < 0.8);
      }
    };

    const isSegActive = (segPinId: string) => {
      const r = pinReadings[segPinId];
      if (isCommonAnode) {
        return r.grounded || (componentPins[segPinId].active && r.voltage < 0.8);
      } else {
        return r.voltage > 1.5;
      }
    };

    const com1Active = isComActive("com1");
    const com2Active = isComActive("com2");
    const displayActive = com1Active || com2Active;

    const segments = ["a", "b", "c", "d", "e", "f", "g", "dp"] as const;
    const digitState: Record<string, boolean> = {};

    for (const seg of segments) {
      const segActive = isSegActive(seg);
      digitState[seg] = displayActive && segActive;
    }

    // Ohm's Law Current Calculation
    let maxCurrentMA = 0;
    let hasResistor = true;

    const activeComVolt = isCommonAnode
      ? Math.max(
          com1Active ? getSourceVoltage("com1") : 0,
          com2Active ? getSourceVoltage("com2") : 0,
        )
      : 0;

    for (const seg of segments) {
      if (digitState[seg]) {
        const rVal = getSeriesResistorValue(seg);
        const comRes1 = com1Active ? getSeriesResistorValue("com1") : 0;
        const comRes2 = com2Active ? getSeriesResistorValue("com2") : 0;
        const rTotal = rVal + comRes1 + comRes2;

        const srcVolt = isCommonAnode ? activeComVolt : getSourceVoltage(seg);
        let currentMA = 0;
        if (srcVolt > 3.0) {
          if (rTotal === 0) {
            currentMA = Infinity;
            hasResistor = false;
          } else {
            currentMA = ((srcVolt - 3.0) / rTotal) * 1000;
          }
        }
        if (currentMA > maxCurrentMA) {
          maxCurrentMA = currentMA;
        }
      }
    }

    const burnt = maxCurrentMA > 50.00;

    const componentState = components[node.id] || {
      nodeId: node.id,
      componentType: "sevenSegment",
      label: node.data.label || "7-Segment Display",
      isPowered: false,
      brightness: 0,
      voltage: 0,
      telemetry: {},
      pins: {},
    };

    componentState.isPowered = frame.running && displayActive && !burnt;
    componentState.voltage = Math.max(...Object.values(pinReadings).map((p) => p.voltage));
    componentState.telemetry = {
      displayType,
      com1Active,
      com2Active,
      hasResistor,
      currentMilliAmps: maxCurrentMA,
      burnt,
      digitState: JSON.stringify(burnt ? {} : digitState), // Empty layout if burnt
    };
    componentState.pins = componentPins;

    components[node.id] = componentState;
    changed = true;
  }

  if (changed) {
    return {
      ...frame,
      components,
    };
  }

  return frame;
}
