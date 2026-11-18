import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraphForStore, getReachableGraphNodes, addGraphConnection } from "../../circuit/graph";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { getCapacitanceFarads, getResistanceOhmsForStore } from "../../circuit/components";
import { clamp01 } from "../../codeParsing/arduinoParser";
import { getNe555TimingNetwork } from "./stateMaps";
import type { SimContext } from "../types";

export function applyPolarizedCapacitorInputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  const ne555State = context.ne555State;
  const capacitorState = context.capacitorState;
  if (!frame.running) return frame;

  const { nodes, edges } = useCircuitStore.getState();

  const capNodes = nodes.filter(
    (node) =>
      node.data.componentType === "polarizedCapacitor" ||
      node.type === "polarizedCapacitor" ||
      node.data.componentType === "PolarizedCapacitor" ||
      node.type === "PolarizedCapacitor",
  );
  if (capNodes.length === 0) return frame;

  const components = { ...frame.components };
  const graph = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    addGraphConnection(
      graph,
      `${edge.source}:${edge.sourceHandle}`,
      `${edge.target}:${edge.targetHandle}`,
    );
  }

  for (const node of nodes) {
    const model = getNodeSimulationModel(node);

    if (model === "resistor" || model === "inductor") {
      addGraphConnection(graph, `${node.id}:pin1`, `${node.id}:pin2`);
    }

    if (model === "arduino") {
      addGraphConnection(graph, `${node.id}:gnd1`, `${node.id}:gnd2`);
      addGraphConnection(graph, `${node.id}:gnd2`, `${node.id}:gnd3`);
    }
  }

  const voltageSources: Array<{ endpoint: string; voltage: number }> = [];
  const groundEndpoints: string[] = [];

  for (const node of nodes) {
    const model = getNodeSimulationModel(node);

    if (model === "arduino") {
      voltageSources.push({ endpoint: `${node.id}:5v`, voltage: 5 });
      voltageSources.push({ endpoint: `${node.id}:3v3`, voltage: 3.3 });
      groundEndpoints.push(
        `${node.id}:gnd1`,
        `${node.id}:gnd2`,
        `${node.id}:gnd3`,
      );

      for (const pin of frame.boardPins) {
        const lastColon = pin.handleId.lastIndexOf(":");
        const localHandleId =
          lastColon !== -1 ? pin.handleId.slice(lastColon + 1) : pin.handleId;
        if (!localHandleId?.startsWith("d")) continue;
        if (pin.mode !== "OUTPUT" || !pin.active) continue;
        voltageSources.push({
          endpoint: `${node.id}:${localHandleId}`,
          voltage: pin.normalizedValue > 0 ? 5 : 0,
        });
      }
    }

    if (
      model === "battery9v" ||
      model === "battery1_5v" ||
      model === "coincell" ||
      model === "powerSupply"
    ) {
      const enabled =
        model === "powerSupply"
          ? node.data.properties?.enabled?.value === "on"
          : true;
      const voltage = enabled
        ? Number(node.data.properties?.voltage?.value ?? 0)
        : 0;
      voltageSources.push({
        endpoint: `${node.id}:positive`,
        voltage: Number.isFinite(voltage) ? voltage : 0,
      });
      groundEndpoints.push(`${node.id}:negative`);
    }

    if (model === "ne555") {
      const outputVoltage = Number(
        components[node.id]?.telemetry?.outputVoltage ??
          components[node.id]?.voltage ??
          0,
      );
      if (Number.isFinite(outputVoltage)) {
        voltageSources.push({
          endpoint: `${node.id}:pin3_out`,
          voltage: outputVoltage,
        });
      }
      groundEndpoints.push(`${node.id}:pin1_gnd`);
    }

    if (model === "functionGenerator") {
      const enabled = node.data.properties?.enabled?.value === "on";
      const amplitude = Math.max(
        0,
        Math.min(10, Number(node.data.properties?.amplitude?.value ?? 0)),
      );
      const offset = Math.max(
        -5,
        Math.min(5, Number(node.data.properties?.offset?.value ?? 0)),
      );
      voltageSources.push({
        endpoint: `${node.id}:positive`,
        voltage: enabled ? Math.max(0, Math.min(10, offset + amplitude)) : 0,
      });
      groundEndpoints.push(`${node.id}:negative`);
    }
  }

  const resolveNetVoltage = (start: string) => {
    const reachable = getReachableGraphNodes(graph, start);
    let voltage: number | null = null;
    let grounded = false;

    for (const source of voltageSources) {
      if (reachable.has(source.endpoint))
        voltage = Math.max(voltage ?? 0, source.voltage);
    }

    for (const ground of groundEndpoints) {
      if (reachable.has(ground)) grounded = true;
    }

    return {
      voltage: voltage ?? 0,
      grounded,
      reachable,
      connected: reachable.size > 1 || voltage !== null || grounded,
    };
  };

  for (const capNode of capNodes) {
    let anodeVoltage = 0;
    let cathodeVoltage = 0;

    const connectedEdges = edges.filter(
      (edge) => edge.source === capNode.id || edge.target === capNode.id,
    );

    for (const edge of connectedEdges) {
      const isTarget = edge.target === capNode.id;
      const localHandle =
        (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
      const remoteNodeId = isTarget ? edge.source : edge.target;
      const remoteVoltage = getEndpointVoltage(
        frame,
        remoteNodeId,
        isTarget ? edge.sourceHandle : edge.targetHandle,
      );

      const normalHandle = localHandle.toString().toLowerCase();
      if (normalHandle.includes("anode")) anodeVoltage = remoteVoltage;
      if (normalHandle.includes("cathode")) cathodeVoltage = remoteVoltage;
    }
    const anodeNet = resolveNetVoltage(`${capNode.id}:anode`);
    const cathodeNet = resolveNetVoltage(`${capNode.id}:cathode`);
    anodeVoltage = anodeNet.voltage;
    cathodeVoltage = cathodeNet.voltage;

    const rawCapValue = Number(
      capNode.data.properties?.capacitance?.value ?? 10,
    );
    const capValue = rawCapValue <= 0 ? 1 : rawCapValue;
    const capUnit = String(
      capNode.data.properties?.unit?.value ||
        capNode.data.properties?.capacitanceUnit?.value ||
        "µF",
    );

    let unitMultiplier = 1e-6;
    if (capUnit === "pF") unitMultiplier = 1e-12;
    if (capUnit === "nF") unitMultiplier = 1e-9;
    if (capUnit.includes("µ") || capUnit.includes("u") || capUnit.includes("Â"))
      unitMultiplier = 1e-6;
    if (capUnit === "mF") unitMultiplier = 1e-3;
    if (capUnit === "F") unitMultiplier = 1.0;

    const appliedPotentialDiff = Math.max(0, anodeVoltage - cathodeVoltage);
    const reversePotentialDiff = Math.max(0, cathodeVoltage - anodeVoltage);

    let seriesResistance = 1000;
    const capReach = new Set([...anodeNet.reachable, ...cathodeNet.reachable]);
    for (const node of nodes) {
      if (getNodeSimulationModel(node) !== "resistor") continue;
      if (capReach.has(`${node.id}:pin1`) || capReach.has(`${node.id}:pin2`)) {
        const resistance = getResistanceOhmsForStore(node);
        seriesResistance =
          resistance > 0
            ? resistance
            : Number(node.data.properties?.resistance?.value ?? 1000);
        break;
      }
    }

    const prevState = capacitorState.get(capNode.id);
    const previousTimestamp = prevState?.lastTimestamp ?? frame.timestamp;
    const previousReferenceVoltage = prevState?.referenceVoltage ?? 0;
    const currentStoredVoltage = prevState?.voltage ?? 0;

    const elapsedSeconds = Math.max(
      0.001,
      Math.min(1, (frame.timestamp - previousTimestamp) / 1000 || 0.01),
    );
    const netCapacitance = capValue * unitMultiplier;
    const tau = seriesResistance * netCapacitance;
    const alpha =
      tau > 0 ? Math.min(0.95, 1 - Math.exp(-elapsedSeconds / tau)) : 0.95;

    let nextVoltage = currentStoredVoltage;
    let capacitorPhase: "charging" | "discharging" | "holding" | "idle" =
      "idle";

    const ne555Nodes = nodes.filter((n) => n.data.componentType === "ne555" || n.type === "ne555");
    let matchedNe555CapV: number | null = null;
    let ne555Vcc = 9.0;
    for (const ne555Node of ne555Nodes) {
      const timingNetwork = getNe555TimingNetwork(ne555Node, nodes, edges);
      if (timingNetwork.timingCapacitor?.nodeId === capNode.id) {
        const ne555Prev = ne555State.get(ne555Node.id);
        const capVVal = components[ne555Node.id]?.telemetry?.capV;
        matchedNe555CapV = ne555Prev?.capacitorVoltage ?? (capVVal !== undefined && capVVal !== null ? Number(capVVal) : null);
        const vccVal = components[ne555Node.id]?.telemetry?.vcc;
        ne555Vcc = vccVal !== undefined && vccVal !== null ? Number(vccVal) : 9.0;
        break;
      }
    }

    if (matchedNe555CapV !== null) {
      nextVoltage = matchedNe555CapV;
      const targetNe555Node = ne555Nodes.find(n => {
        const timingNetwork = getNe555TimingNetwork(n, nodes, edges);
        return timingNetwork.timingCapacitor?.nodeId === capNode.id;
      });
      const ne555Phase = String(components[targetNe555Node?.id ?? ""]?.telemetry?.phase ?? "");
      capacitorPhase = ne555Phase === "charging" ? "charging" : ne555Phase === "discharging" ? "discharging" : "idle";
    } else {
      if (appliedPotentialDiff > nextVoltage) {
        capacitorPhase = "charging";
        nextVoltage += (appliedPotentialDiff - nextVoltage) * alpha;
      } else if (
        (!anodeNet.connected ||
          !cathodeNet.connected ||
          appliedPotentialDiff < nextVoltage) &&
        nextVoltage > 0.01
      ) {
        capacitorPhase = "discharging";
        nextVoltage -= nextVoltage * alpha;
      } else if (nextVoltage > 0.01) {
        capacitorPhase = "holding";
      } else {
        nextVoltage = 0;
      }
    }

    if (nextVoltage < 0.005) nextVoltage = 0;

    const referenceMax = Math.max(
      0.001,
      appliedPotentialDiff > 0.1 ? appliedPotentialDiff : 0,
      previousReferenceVoltage,
      nextVoltage,
      matchedNe555CapV !== null ? ne555Vcc : 0,
    );

    capacitorState.set(capNode.id, {
      voltage: nextVoltage,
      lastTimestamp: frame.timestamp,
      referenceVoltage: referenceMax,
    });

    const chargePercentage =
      rawCapValue <= 0
        ? 0
        : Math.min(
            100,
            Math.max(0, Math.round((nextVoltage / referenceMax) * 100)),
          );
    const polarityReversed = reversePotentialDiff > 0.1;

    components[capNode.id] = {
      ...(components[capNode.id] ?? {
        nodeId: capNode.id,
        componentType: "polarizedCapacitor",
      }),
      isPowered: nextVoltage > 0.1,
      voltage: nextVoltage,
      telemetry: {
        voltage: nextVoltage,
        lastTimestamp: frame.timestamp,
        anodeVoltage,
        cathodeVoltage,
        appliedPotentialDiff,
        referenceVoltage: referenceMax,
        polarityReversed,
        phase: capacitorPhase,
        charging: capacitorPhase === "charging",
        discharging: capacitorPhase === "discharging",
        seriesResistance,
        percentage: chargePercentage,
        anodeConnected: anodeNet.connected, // for pin warning
        cathodeConnected: cathodeNet.connected, // for pin warning
      },
      pins: {
        anode: {
          handleId: "anode",
          voltage: cathodeVoltage + nextVoltage,
          normalizedValue: clamp01((cathodeVoltage + nextVoltage) / 5.0),
          active: anodeNet.connected || nextVoltage > 0.1,
        },
        cathode: {
          handleId: "cathode",
          voltage: cathodeVoltage,
          normalizedValue: clamp01(cathodeVoltage / 5.0),
          active: cathodeNet.connected,
        },
      },
    };
  }

  return { ...frame, components };
}

