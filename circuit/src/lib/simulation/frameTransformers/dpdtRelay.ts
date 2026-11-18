import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import type { SimContext } from "../types";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { getNodeSimulationModel } from "../../circuit/components";

/**
 * Applies DPDT Relay electrical simulation to the frame:
 * 1. Checks potential difference across Coil terminals A1 (terminal1) and A2 (terminal16).
 * 2. If energized (voltage >= 3V), routes COM1 (terminal4) to NO1 (terminal8) and COM2 (terminal13) to NO2 (terminal9).
 * 3. If de-energized, routes COM1 to NC1 (terminal6) and COM2 to NC2 (terminal11).
 * 4. Propagates the resulting conductive voltages to all connected downstream nodes.
 */
export function applyDpdtRelayInputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  if (!frame.running) return frame;

  const { nodes, edges } = context;

  const findSeriesResistance = (ledId: string): number => {
    const ledEdges = edges.filter((e) => e.source === ledId || e.target === ledId);
    for (const edge of ledEdges) {
      const otherId = edge.source === ledId ? edge.target : edge.source;
      const otherNode = nodes.find((n) => n.id === otherId);
      if (otherNode && getNodeSimulationModel(otherNode) === "resistor") {
        return Number(otherNode.data.properties?.resistance?.value ?? 220);
      }
    }
    return 220;
  };

  // Find all DPDT Relay nodes on the canvas
  const relayNodes = nodes.filter(
    (node) =>
      node.data.componentType === "relayDpdt" ||
      node.type === "relayDpdt" ||
      getNodeSimulationModel(node) === "relayDpdt"
  );
  if (relayNodes.length === 0) return frame;

  const components = { ...frame.components };

  for (const relayNode of relayNodes) {
    // Find all edges connected to this relay node
    const connectedEdges = edges.filter(
      (edge) => edge.source === relayNode.id || edge.target === relayNode.id
    );

    // Track incoming voltages at each pin of the relay using multi-pass resolution
    let incomingA1 = 0;
    let incomingA2 = 0;

    // Pass 1: Resolve Coil terminals (A1, A2) first
    for (const edge of connectedEdges) {
      const isTarget = edge.target === relayNode.id;
      const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
      if (localHandle === "terminal1" || localHandle === "terminal16") {
        const remoteNodeId = isTarget ? edge.source : edge.target;
        const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
        const remoteVoltage = getEndpointVoltage(frame, remoteNodeId, remoteHandle);
        if (localHandle === "terminal1") incomingA1 = remoteVoltage;
        if (localHandle === "terminal16") incomingA2 = remoteVoltage;
      }
    }

    // Pass 2: Calculate and update energized state in the frame components
    const coilVoltage = Math.abs(incomingA1 - incomingA2);
    const isEnergized = coilVoltage >= 3.0; // Trigger threshold set at 3V

    components[relayNode.id] = {
      ...(components[relayNode.id] ?? {
        nodeId: relayNode.id,
        componentType: "relayDpdt",
      }),
      isPowered: isEnergized,
      voltage: coilVoltage,
    };
    frame.components = components;

    // Pass 3: Resolve Switch contacts (COM, NC, NO) using updated isPowered state
    let incomingCOM1 = 0;
    let incomingNC1 = 0;
    let incomingNO1 = 0;
    let incomingCOM2 = 0;
    let incomingNC2 = 0;
    let incomingNO2 = 0;

    for (const edge of connectedEdges) {
      const isTarget = edge.target === relayNode.id;
      const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
      if (localHandle !== "terminal1" && localHandle !== "terminal16") {
        const remoteNodeId = isTarget ? edge.source : edge.target;
        const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
        const remoteVoltage = getEndpointVoltage(frame, remoteNodeId, remoteHandle);

        if (localHandle === "terminal4") incomingCOM1 = remoteVoltage;
        if (localHandle === "terminal6") incomingNC1 = remoteVoltage;
        if (localHandle === "terminal8") incomingNO1 = remoteVoltage;
        if (localHandle === "terminal13") incomingCOM2 = remoteVoltage;
        if (localHandle === "terminal11") incomingNC2 = remoteVoltage;
        if (localHandle === "terminal9") incomingNO2 = remoteVoltage;
      }
    }

    // Route switch poles depending on coil energization state
    let outCOM1 = 0;
    let outNC1 = 0;
    let outNO1 = 0;
    let outCOM2 = 0;
    let outNC2 = 0;
    let outNO2 = 0;

    if (isEnergized) {
      // COM1 connected to NO1; NC1 is open/disconnected
      const vSwitch1 = Math.max(incomingCOM1, incomingNO1);
      outCOM1 = vSwitch1;
      outNO1 = vSwitch1;
      outNC1 = incomingNC1;

      // COM2 connected to NO2; NC2 is open/disconnected
      const vSwitch2 = Math.max(incomingCOM2, incomingNO2);
      outCOM2 = vSwitch2;
      outNO2 = vSwitch2;
      outNC2 = incomingNC2;
    } else {
      // COM1 connected to NC1; NO1 is open/disconnected
      const vSwitch1 = Math.max(incomingCOM1, incomingNC1);
      outCOM1 = vSwitch1;
      outNC1 = vSwitch1;
      outNO1 = incomingNO1;

      // COM2 connected to NC2; NO2 is open/disconnected
      const vSwitch2 = Math.max(incomingCOM2, incomingNC2);
      outCOM2 = vSwitch2;
      outNC2 = vSwitch2;
      outNO2 = incomingNO2;
    }

    // Set updated state for the component in the frame (including pin values and telemetry)
    components[relayNode.id] = {
      ...components[relayNode.id],
      telemetry: {
        coilVoltage,
        isEnergized,
        pole1State: isEnergized ? "COM1 -> NO1" : "COM1 -> NC1",
        pole2State: isEnergized ? "COM2 -> NO2" : "COM2 -> NC2",
      },
      pins: {
        terminal1: { handleId: "terminal1", voltage: incomingA1, normalizedValue: incomingA1 / 5.0, active: true },
        terminal16: { handleId: "terminal16", voltage: incomingA2, normalizedValue: incomingA2 / 5.0, active: true },
        terminal4: { handleId: "terminal4", voltage: outCOM1, normalizedValue: outCOM1 / 5.0, active: true },
        terminal6: { handleId: "terminal6", voltage: outNC1, normalizedValue: outNC1 / 5.0, active: true },
        terminal8: { handleId: "terminal8", voltage: outNO1, normalizedValue: outNO1 / 5.0, active: true },
        terminal13: { handleId: "terminal13", voltage: outCOM2, normalizedValue: outCOM2 / 5.0, active: true },
        terminal11: { handleId: "terminal11", voltage: outNC2, normalizedValue: outNC2 / 5.0, active: true },
        terminal9: { handleId: "terminal9", voltage: outNO2, normalizedValue: outNO2 / 5.0, active: true },
      },
    };

    // Helper to propagate output voltage recursively to all connected downstream components
    const propagateToPin = (terminalId: string, voltageVal: number, visited = new Set<string>()) => {
      const visitKey = `${relayNode.id}:${terminalId}`;
      if (visited.has(visitKey)) return;
      visited.add(visitKey);

      const pinEdges = edges.filter(
        (e) =>
          (e.source === relayNode.id && e.sourceHandle === terminalId) ||
          (e.target === relayNode.id && e.targetHandle === terminalId)
      );

      for (const edge of pinEdges) {
        const isTarget = edge.target === relayNode.id;
        const remoteNodeId = isTarget ? edge.source : edge.target;
        const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;

        propagateFromNode(remoteNodeId, remoteHandle, voltageVal, visited);
      }
    };

    const propagateFromNode = (
      nodeId: string,
      handleId: string | null | undefined,
      voltageVal: number,
      visited: Set<string>
    ) => {
      if (!handleId) return;
      const visitKey = `${nodeId}:${handleId}`;
      if (visited.has(visitKey)) return;
      visited.add(visitKey);

      const remoteNode = nodes.find((n) => n.id === nodeId);
      const model = remoteNode ? getNodeSimulationModel(remoteNode) : "";

      const isPowerSource =
        model === "arduino" ||
        model === "raspberrypipico" ||
        model === "battery9v" ||
        model === "battery1_5v" ||
        model === "battery12v" ||
        model === "battery3v" ||
        model === "coinCell" ||
        model === "coincell" ||
        model === "powerSupply" ||
        model === "functionGenerator";

      if (isPowerSource) return;

      if (!components[nodeId]) {
        components[nodeId] = {
          nodeId,
          voltage: 0,
          pins: {},
        } as any;
      }

      components[nodeId].voltage = voltageVal;
      // isPowered drives visual state (glow, brightness) in all node renderers
      components[nodeId].isPowered = voltageVal > 0;
      if (voltageVal === 0) {
        components[nodeId].brightness = 0;
        if (components[nodeId].telemetry) {
          components[nodeId].telemetry.currentMilliAmps = 0;
          components[nodeId].telemetry.voltage = 0;
          components[nodeId].telemetry.overloadVoltage = 0;
          components[nodeId].telemetry.burnt = false;
          components[nodeId].telemetry.rpm = 0;
          components[nodeId].telemetry.openCircuit = true;
        }
      }

      if (!components[nodeId].pins) {
        components[nodeId].pins = {};
      }
      components[nodeId].pins[handleId] = {
        handleId,
        voltage: voltageVal,
        active: voltageVal > 0,
      } as any;

      // Trace through series components like resistors, LEDs, and motors
      if (remoteNode) {
        if (model === "resistor" || model === "photoresistor") {
          const isPositiveOrPin1 = handleId === "pin1" || handleId === "positive";
          const otherPin = isPositiveOrPin1 ? "pin2" : "pin1";
          components[nodeId].pins[otherPin] = {
            handleId: otherPin,
            voltage: voltageVal,
            active: voltageVal > 0,
          } as any;

          const nextEdges = edges.filter(
            (e) =>
              (e.source === nodeId && e.sourceHandle === otherPin) ||
              (e.target === nodeId && e.targetHandle === otherPin)
          );
          for (const edge of nextEdges) {
            const isTarget = edge.target === nodeId;
            const nextNodeId = isTarget ? edge.source : edge.target;
            const nextHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
            propagateFromNode(nextNodeId, nextHandle, voltageVal, visited);
          }
        } else if (model === "led") {
          if (handleId === "anode") {
            const cathodeV = Math.max(0, voltageVal - 1.8);
            // Set brightness so the LED glow renders (renderer reads brightness, not just isPowered)
            components[nodeId].brightness = voltageVal > 0 ? Math.min(1, voltageVal / 5.0) : 0;

            if (voltageVal > 0) {
              const R = findSeriesResistance(nodeId);
              const currentMA = Math.max(0, ((voltageVal - 1.8) / R) * 1000);
              if (!components[nodeId].telemetry) {
                components[nodeId].telemetry = {};
              }
              components[nodeId].telemetry.currentMilliAmps = currentMA;
              components[nodeId].telemetry.seriesResistance = R;
              components[nodeId].telemetry.overloadVoltage = voltageVal;
              components[nodeId].telemetry.voltage = voltageVal;
              components[nodeId].telemetry.pathBlocked = false;
              components[nodeId].telemetry.physicalOpenCircuit = false;
              components[nodeId].telemetry.anodeConnected = true;
              components[nodeId].telemetry.cathodeConnected = true;
            }
            components[nodeId].pins["cathode"] = {
              handleId: "cathode",
              voltage: cathodeV,
              active: cathodeV > 0,
            } as any;

            const nextEdges = edges.filter(
              (e) =>
                (e.source === nodeId && e.sourceHandle === "cathode") ||
                (e.target === nodeId && e.targetHandle === "cathode")
            );
            for (const edge of nextEdges) {
              const isTarget = edge.target === nodeId;
              const nextNodeId = isTarget ? edge.source : edge.target;
              const nextHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
              propagateFromNode(nextNodeId, nextHandle, cathodeV, visited);
            }
          }
        } else if (model === "dcmotor" || model === "hobbyGearmotor" || model === "vibrationMotor") {
          const throttle = voltageVal > 0 ? Math.min(1.0, voltageVal / 5.0) : 0;
          const rpm = Math.round(2400 * throttle);
          components[nodeId].brightness = throttle;
          components[nodeId].isPowered = throttle > 0;
          if (!components[nodeId].telemetry) {
            components[nodeId].telemetry = {};
          }
          components[nodeId].telemetry.rpm = rpm;
          components[nodeId].telemetry.voltage = voltageVal;
          components[nodeId].telemetry.openCircuit = throttle === 0;
          components[nodeId].telemetry.direction = "forward";
        }
      }
    };

    // Propagate voltages for all paths (clear inactive paths to 0V)
    propagateToPin("terminal4", outCOM1);
    propagateToPin("terminal6", isEnergized ? 0 : outNC1);
    propagateToPin("terminal8", isEnergized ? outNO1 : 0);
    propagateToPin("terminal13", outCOM2);
    propagateToPin("terminal11", isEnergized ? 0 : outNC2);
    propagateToPin("terminal9", isEnergized ? outNO2 : 0);
  }

  return { ...frame, components };
}
