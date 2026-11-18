import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../../circuit/graph";
import { getEndpointVoltage, getArduinoDigitalPinForComponentConnection } from "../../circuit/pinMapping";
import { getNe555TimingNetwork, applyDrivenLoadsFromEndpoint } from "./stateMaps";
import { syncNe555TimingCapacitor } from "./stateMaps";
import type { SimContext } from "../types";

export function applyNe555TimerInputToFrame(frame: SimulationFrame, context: SimContext): SimulationFrame {
  const ne555State = context.ne555State;
  if (!frame.running) return frame;

  const { nodes, edges } = useCircuitStore.getState();

  const timerNodes = nodes.filter(
    (node) =>
      node.data.componentType === "ne555" ||
      getNodeSimulationModel(node) === "ne555",
  );
  if (timerNodes.length === 0) return frame;

  const components = { ...frame.components };
  const boardPins = frame.boardPins ? [...frame.boardPins] : [];
  let serialOutput = frame.serialOutput;

  for (const timerNode of timerNodes) {
    const timingNetwork = getNe555TimingNetwork(timerNode, nodes, edges);
    const astableMode = timingNetwork.astableMode;

    // Debug logging for NE555 timing network
    console.log(
      `[NE555 Debug] nodeId: ${timerNode.id}, vcc: ${timingNetwork.vcc}, vccConnected: ${timingNetwork.vccSourceConnected}, astableMode: ${timingNetwork.astableMode}, rA: ${timingNetwork.rA}, rB: ${timingNetwork.rB}, capacitance: ${timingNetwork.capacitance}, resetV: ${timingNetwork.resetV}, diodeMode: ${timingNetwork.diodeTimingMode}`,
    );
    const incomingVoltages = new Map<number, number>();
    const connectedEdges = edges.filter(
      (edge) => edge.source === timerNode.id || edge.target === timerNode.id,
    );

    for (const edge of connectedEdges) {
      const isTarget = edge.target === timerNode.id;
      const localHandle = isTarget ? edge.targetHandle : edge.sourceHandle;
      const remoteNodeId = isTarget ? edge.source : edge.target;
      const remoteVoltage = getEndpointVoltage(
        frame,
        remoteNodeId,
        isTarget ? edge.sourceHandle : edge.targetHandle,
      );

      const normalHandle = localHandle?.toString().toLowerCase() || "";
      if (normalHandle.includes("pin1") || normalHandle.includes("gnd"))
        incomingVoltages.set(1, 0);
      if (normalHandle.includes("pin2") || normalHandle.includes("trig"))
        incomingVoltages.set(2, remoteVoltage);
      if (normalHandle.includes("pin4") || normalHandle.includes("reset"))
        incomingVoltages.set(4, remoteVoltage);
      if (normalHandle.includes("pin6") || normalHandle.includes("thresh"))
        incomingVoltages.set(6, remoteVoltage);
      if (normalHandle.includes("pin8") || normalHandle.includes("vcc"))
        incomingVoltages.set(8, remoteVoltage);
    }

    const vcc = incomingVoltages.get(8) ?? timingNetwork.vcc ?? 5.0;
    const gnd = incomingVoltages.get(1) ?? 0.0;
    const triggerV = incomingVoltages.get(2) ?? vcc; // Default internal pull-up behavior
    const thresholdV = incomingVoltages.get(6) ?? gnd;
    const resetV = timingNetwork.resetV; // Use the correctly calculated reset voltage from timing network

    // Find connected R1, R2, C values
    const rA = timingNetwork.rA;
    const rB = timingNetwork.rB;
    const capacitance = timingNetwork.capacitance;
    const previousState = ne555State.get(timerNode.id);
    const state = previousState || {
      capacitorVoltage: 0,
      isOutputHigh: true,
      lastTimestamp: frame.timestamp,
    };

    const dt = Math.max(0, (frame.timestamp - state.lastTimestamp) / 1000);
    state.lastTimestamp = frame.timestamp;

    let outputVoltage = gnd;
    let dischargeState = true;
    let timerPhase: "charging" | "discharging" | "idle" = "idle";
    let activeHighTimeSeconds = 0;
    let activeLowTimeSeconds = 0;
    let activePhaseElapsedSeconds = 0;

    if (!timingNetwork.vccSourceConnected || vcc < 1) {
      console.debug("[NE555 Branch]", "No VCC or VCC too low");
      outputVoltage = gnd;
      state.capacitorVoltage = 0;
      state.isOutputHigh = true;
      dischargeState = true;
      timerPhase = "idle";
    } else if (resetV < 0.7) {
      console.debug("[NE555 Branch]", "Reset active");
      // RESET ACTIVE - force output LOW
      outputVoltage = gnd;
      state.capacitorVoltage = 0;
      state.isOutputHigh = false;
      dischargeState = true;
      timerPhase = "idle";
    } else if (capacitance > 0 && rA > 0 && rB > 0) {
      console.debug("[NE555 Branch]", "Astable mode entered");
      const chargeResistance = Math.max(
        1,
        timingNetwork.diodeTimingMode === "chargeBypass" ? rA : rA + rB,
      );
      const dischargeResistance = Math.max(
        1,
        timingNetwork.diodeTimingMode === "dischargeBypass" ? 1 : rB,
      );
      const upperThreshold = (2 / 3) * vcc;
      const lowerThreshold = (1 / 3) * vcc;
      const highTimeSeconds = Math.max(
        0.001,
        0.69 * chargeResistance * capacitance,
      );
      const lowTimeSeconds = Math.max(
        0.001,
        0.69 * dischargeResistance * capacitance,
      );
      activeHighTimeSeconds = highTimeSeconds;
      activeLowTimeSeconds = lowTimeSeconds;

      const chargeTau = chargeResistance * capacitance;
      const dischargeTau = dischargeResistance * capacitance;

      let remainingTime = dt;
      let iterations = 0;

      while (remainingTime > 1e-9 && iterations < 100) {
        iterations++;
        if (state.isOutputHigh) {
          if (state.capacitorVoltage >= upperThreshold - 1e-12) {
            state.capacitorVoltage = upperThreshold;
            state.isOutputHigh = false;
            continue;
          }
          const timeToUpper =
            chargeTau <= 0
              ? 0
              : -chargeTau *
              Math.log(
                (vcc - upperThreshold) /
                Math.max(1e-12, vcc - state.capacitorVoltage),
              );
          if (remainingTime < timeToUpper || timeToUpper <= 0) {
            state.capacitorVoltage =
              vcc -
              (vcc - state.capacitorVoltage) *
              Math.exp(-remainingTime / Math.max(1e-12, chargeTau));
            remainingTime = 0;
          } else {
            state.capacitorVoltage = upperThreshold;
            remainingTime -= timeToUpper;
            state.isOutputHigh = false;
          }
        } else {
          if (state.capacitorVoltage <= lowerThreshold + 1e-12) {
            state.capacitorVoltage = lowerThreshold;
            state.isOutputHigh = true;
            continue;
          }
          const timeToLower =
            dischargeTau <= 0
              ? 0
              : -dischargeTau *
              Math.log(
                lowerThreshold / Math.max(1e-12, state.capacitorVoltage),
              );
          if (remainingTime < timeToLower || timeToLower <= 0) {
            state.capacitorVoltage =
              state.capacitorVoltage *
              Math.exp(-remainingTime / Math.max(1e-12, dischargeTau));
            remainingTime = 0;
          } else {
            state.capacitorVoltage = lowerThreshold;
            remainingTime -= timeToLower;
            state.isOutputHigh = true;
          }
        }
      }

      outputVoltage = state.isOutputHigh ? vcc * 0.9 : gnd;
      dischargeState = !state.isOutputHigh;
      timerPhase = state.isOutputHigh ? "charging" : "discharging";
      state.capacitorVoltage = Math.max(
        0,
        Math.min(vcc, state.capacitorVoltage),
      );

      if (state.isOutputHigh) {
        const ratio =
          (vcc - state.capacitorVoltage) /
          Math.max(1e-12, vcc - lowerThreshold);
        activePhaseElapsedSeconds =
          -chargeTau * Math.log(Math.max(1e-12, ratio));
      } else {
        const ratio = state.capacitorVoltage / Math.max(1e-12, upperThreshold);
        activePhaseElapsedSeconds =
          -dischargeTau * Math.log(Math.max(1e-12, ratio));
      }
      activePhaseElapsedSeconds = Math.max(0, activePhaseElapsedSeconds);
    } else {
      // No fake timer fallback: without detected R/C, behave as a threshold latch.
      const triggerV = incomingVoltages.get(2) ?? vcc;
      const thresholdV = incomingVoltages.get(6) ?? gnd;
      const upperThreshold = (2 / 3) * vcc;
      const lowerThreshold = (1 / 3) * vcc;

      if (triggerV < lowerThreshold) {
        outputVoltage = vcc;
        dischargeState = false;
      } else if (thresholdV > upperThreshold) {
        outputVoltage = gnd;
        dischargeState = true;
      } else {
        const prev = components[timerNode.id]?.telemetry;
        outputVoltage = Number(prev?.outputVoltage ?? gnd);
        dischargeState = prev?.dischargeState !== false;
      }
    }


    // Store state for next frame
    ne555State.set(timerNode.id, state);

    components[timerNode.id] = {
      ...(components[timerNode.id] ?? {
        nodeId: timerNode.id,
        componentType: "ne555",
      }),
      isPowered: vcc > 2.0,
      voltage: outputVoltage,
      telemetry: {
        vcc,
        vccSourceConnected: timingNetwork.vccSourceConnected,
        capV: state.capacitorVoltage,
        phase: timerPhase,
        charging: state.isOutputHigh,
        resetV,
        outputVoltage,
        dischargeState,
        astableMode,
        rA,
        rB,
        capacitance,
        diodeTimingMode: timingNetwork.diodeTimingMode ?? "none",
        diodeTimingBypass: timingNetwork.diodeTimingMode !== null,
        highTimeSeconds: Number(
          (
            activeHighTimeSeconds ||
            0.693 *
            Math.max(
              1,
              timingNetwork.diodeTimingMode === "chargeBypass" ? rA : rA + rB,
            ) *
            Math.max(0, capacitance)
          ).toFixed(3),
        ),
        lowTimeSeconds: Number(
          (
            activeLowTimeSeconds ||
            0.693 *
            Math.max(
              1,
              timingNetwork.diodeTimingMode === "dischargeBypass" ? 1 : rB,
            ) *
            Math.max(0, capacitance)
          ).toFixed(3),
        ),
        phaseElapsedSeconds: Number(activePhaseElapsedSeconds.toFixed(3)),
        phaseRemainingSeconds: Number(
          Math.max(
            0,
            (timerPhase === "charging"
              ? activeHighTimeSeconds
              : timerPhase === "discharging"
                ? activeLowTimeSeconds
                : 0) - activePhaseElapsedSeconds,
          ).toFixed(3),
        ),
      },
      pins: {
        pin1_gnd: {
          handleId: "pin1_gnd",
          voltage: gnd,
          normalizedValue: 0,
          active: true,
        },
        pin2_trig: {
          handleId: "pin2_trig",
          voltage: state.capacitorVoltage,
          normalizedValue: state.capacitorVoltage / (vcc || 5.0),
          active: true,
        },
        pin3_out: {
          handleId: "pin3_out",
          voltage: outputVoltage,
          normalizedValue: outputVoltage / (vcc || 5.0),
          active: true,
        },
        pin4_reset: {
          handleId: "pin4_reset",
          voltage: resetV,
          normalizedValue: resetV / (vcc || 5.0),
          active: true,
        },
        pin5_ctrl: {
          handleId: "pin5_ctrl",
          voltage: (2 / 3) * vcc,
          normalizedValue: 2 / 3,
          active: true,
        },
        pin6_thresh: {
          handleId: "pin6_thresh",
          voltage: state.capacitorVoltage,
          normalizedValue: state.capacitorVoltage / (vcc || 5.0),
          active: true,
        },
        pin7_dis: {
          handleId: "pin7_dis",
          voltage: dischargeState ? gnd : vcc,
          normalizedValue: dischargeState ? 0 : 1,
          active: true,
        },
        pin8_vcc: {
          handleId: "pin8_vcc",
          voltage: vcc,
          normalizedValue: 1,
          active: true,
        },
      },
    };

    syncNe555TimingCapacitor({
      timingCapacitor: timingNetwork.timingCapacitor,
      components,
      nodes,
      capVoltage: state.capacitorVoltage,
      vcc,
      phase: timerPhase,
    });

    const arduinoNode = nodes.find(
      (node) => node.data.componentType === "arduino",
    );
    const connectedOutputPin = arduinoNode
      ? (getArduinoDigitalPinForComponentConnection(
        timerNode.id,
        "pin3_out",
        arduinoNode.id,
        edges,
      ) ?? 2)
      : 2;
    const isHighSignal = outputVoltage >= 3.0;

    applyDrivenLoadsFromEndpoint({
      sourceNode: timerNode,
      sourceHandle: "pin3_out",
      sourceVoltage: outputVoltage,
      supplyVoltage: vcc,
      nodes,
      edges,
      components,
    });

    // Keep the visual pin state and Serial Monitor aligned with the simulated timer output.
    if (boardPins.length > 0) {
      boardPins.forEach((pin) => {
        const lastColon = pin.handleId?.lastIndexOf(":") ?? -1;
        const localHandleId =
          lastColon !== -1 ? pin.handleId.slice(lastColon + 1) : pin.handleId;
        if (
          pin.pin === connectedOutputPin ||
          localHandleId?.toLowerCase() === `d${connectedOutputPin}`
        ) {
          pin.normalizedValue = isHighSignal ? 1.0 : 0.0;
          pin.value = isHighSignal ? 255 : 0;
          pin.active = true;
          pin.mode = pin.mode === "INPUT_PULLUP" ? "INPUT_PULLUP" : "INPUT";
        }
      });
    }

    const readLinePattern = new RegExp(
      `^\\s*D${connectedOutputPin}\\s*=\\s*[01]\\s*$`,
      "i",
    );
    const nextReadLine = `D${connectedOutputPin} = ${isHighSignal ? 1 : 0}`;
    let replacedReadLine = false;
    serialOutput = serialOutput.map((line) => {
      if (!readLinePattern.test(line)) return line;
      replacedReadLine = true;
      return nextReadLine;
    });
    if (!replacedReadLine) {
      serialOutput = [...serialOutput.slice(-99), nextReadLine];
    }
  }

  return { ...frame, components, boardPins, serialOutput };
}