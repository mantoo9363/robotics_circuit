import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { getNodeSimulationModel } from "../../circuit/components";
import type { SimContext } from "../types";

/** Configurable parameters for a PNP BJT Transistor. */
export interface PNPTransistorParameters {
  beta: number;
  vbe: number;
  vceSat: number;
  maxCurrent: number;
  maxPower: number;
  rInternalBase: number;
}

export const DEFAULT_PNP_PARAMETERS: PNPTransistorParameters = {
  beta: 100,
  vbe: 0.7,
  vceSat: 0.2,
  maxCurrent: 0.8, // 800 mA
  maxPower: 0.625, // 625 mW
  rInternalBase: 10, // 10 ohms internal base resistance
};

/** State and telemetry result of PNP Transistor electrical simulation. */
export interface PNPTransistorSimulationResult {
  state: "cutoff" | "forward-active" | "saturation";
  emitterVoltage: number;
  baseVoltage: number;
  collectorVoltage: number;
  VEB: number;
  VEC: number;
  baseCurrent: number;
  collectorCurrent: number;
  emitterCurrent: number;
  power: number;
  isConducting: boolean;
  R_ce: number;
  V_ce_drop: number;
  missingBaseResistor: boolean;
  warnings: string[];
}

/** Mathematical and electrical simulation model for PNP BJT Transistors. */
export class PNPTransistorModel {
  /** Calculate base-emitter forward voltage VEB = VE - VB. */
  static calculateVEB(VE: number, VB: number): number {
    return VE - VB;
  }

  /** Calculate emitter-collector voltage drop VEC = VE - VC. */
  static calculateVEC(VE: number, VC: number): number {
    return VE - VC;
  }

  /** Returns true if the transistor is in cutoff regime (OFF). */
  static isCutoff(VEB: number, threshold = DEFAULT_PNP_PARAMETERS.vbe): boolean {
    return VEB < threshold;
  }

  /** Returns true if base-emitter junction is forward-biased and conducting. */
  static isConducting(VEB: number, threshold = DEFAULT_PNP_PARAMETERS.vbe): boolean {
    return VEB >= threshold;
  }

  /** Returns true if collector current has reached circuit saturation limit. */
  static isSaturated(IC_active: number, IC_sat: number): boolean {
    return IC_active >= IC_sat;
  }

  /** Calculate base current IB flowing out of the base terminal. */
  static calculateBaseCurrent(
    VE: number,
    VB: number,
    RB: number,
    params: Partial<PNPTransistorParameters> = {},
  ): number {
    const vbeTh = params.vbe ?? DEFAULT_PNP_PARAMETERS.vbe;
    const rInt = params.rInternalBase ?? DEFAULT_PNP_PARAMETERS.rInternalBase;
    const veb = VE - VB;
    if (veb < vbeTh) return 0;
    return Math.max(0, (veb - vbeTh) / (RB + rInt));
  }

  /** Calculate collector current IC and operating mode based on surrounding circuit. */
  static calculateCollectorCurrent(
    IB: number,
    VE: number,
    VC: number,
    Rload: number,
    VdropLoad: number,
    params: Partial<PNPTransistorParameters> = {},
  ): {
    ic: number;
    mode: "cutoff" | "forward-active" | "saturation";
    R_ce: number;
    V_ce_drop: number;
  } {
    const beta = params.beta ?? DEFAULT_PNP_PARAMETERS.beta;
    const vceSat = params.vceSat ?? DEFAULT_PNP_PARAMETERS.vceSat;

    if (IB <= 0) {
      return {
        ic: 0,
        mode: "cutoff",
        R_ce: 10000000,
        V_ce_drop: 0,
      };
    }

    const IC_active = IB * beta;
    const IC_sat = Math.max(
      0,
      (VE - VdropLoad - VC - vceSat) / Math.max(1, Rload),
    );

    if (IC_active >= IC_sat && IC_sat > 0) {
      return {
        ic: IC_sat,
        mode: "saturation",
        R_ce: 0.1,
        V_ce_drop: vceSat,
      };
    }

    const R_total_needed = IC_active > 0 ? (VE - VdropLoad - VC) / IC_active : 10000000;
    return {
      ic: IC_active,
      mode: "forward-active",
      R_ce: Math.max(0.1, R_total_needed - Rload),
      V_ce_drop: 0,
    };
  }

  /** Calculate total emitter current IE = IC + IB. */
  static calculateEmitterCurrent(IB: number, IC: number): number {
    return IC + IB;
  }

  /** Calculate total transistor power dissipation P = VEC * IC + VEB * IB. */
  static calculatePower(
    VEC: number,
    IC: number,
    VEB: number,
    IB: number,
  ): number {
    return Math.max(0, VEC * IC + VEB * IB);
  }

  /** Complete simulation of a PNP BJT given terminal conditions and circuit load. */
  static simulate(
    VE: number,
    VB: number,
    VC: number,
    RB: number,
    Rload: number,
    VdropLoad: number,
    isBaseConnected: boolean,
    isEmitterConnected: boolean,
    isCollectorConnected: boolean,
    customParams: Partial<PNPTransistorParameters> = {},
  ): PNPTransistorSimulationResult {
    const params: PNPTransistorParameters = {
      ...DEFAULT_PNP_PARAMETERS,
      ...customParams,
    };

    const warnings: string[] = [];
    if (!isEmitterConnected) warnings.push("PNP emitter is floating.");
    if (!isBaseConnected) warnings.push("PNP base is floating.");
    if (!isCollectorConnected) warnings.push("PNP collector is floating.");

    const allConnected = isBaseConnected && isEmitterConnected && isCollectorConnected;
    const VEB = this.calculateVEB(VE, VB);
    const VEC = this.calculateVEC(VE, VC);
    const isReverse = VC > VE + 0.1;

    let missingBaseResistor = false;
    if (allConnected && RB < 5 && VEB >= params.vbe) {
      missingBaseResistor = true;
      warnings.push("Missing base resistor!");
    }

    if (!allConnected || isReverse || VEB < params.vbe) {
      return {
        state: "cutoff",
        emitterVoltage: VE,
        baseVoltage: VB,
        collectorVoltage: VC,
        VEB: Number(VEB.toFixed(3)),
        VEC: Number(VEC.toFixed(3)),
        baseCurrent: 0,
        collectorCurrent: 0,
        emitterCurrent: 0,
        power: 0,
        isConducting: false,
        R_ce: 10000000,
        V_ce_drop: 0,
        missingBaseResistor,
        warnings,
      };
    }

    const baseCurrent = this.calculateBaseCurrent(VE, VB, RB, params);
    const { ic, mode, R_ce, V_ce_drop } = this.calculateCollectorCurrent(
      baseCurrent,
      VE,
      VC,
      Rload,
      VdropLoad,
      params,
    );
    const emitterCurrent = this.calculateEmitterCurrent(baseCurrent, ic);
    const power = this.calculatePower(VEC, ic, VEB, baseCurrent);

    if (ic > params.maxCurrent) {
      warnings.push(`Collector current (${(ic * 1000).toFixed(1)}mA) exceeds maximum rating (${(params.maxCurrent * 1000).toFixed(1)}mA).`);
    }
    if (power > params.maxPower) {
      warnings.push(`Power dissipation (${(power * 1000).toFixed(1)}mW) exceeds maximum rating (${(params.maxPower * 1000).toFixed(1)}mW).`);
    }

    return {
      state: mode,
      emitterVoltage: VE,
      baseVoltage: VB,
      collectorVoltage: VC,
      VEB: Number(VEB.toFixed(3)),
      VEC: Number(VEC.toFixed(3)),
      baseCurrent,
      collectorCurrent: ic,
      emitterCurrent,
      power,
      isConducting: true,
      R_ce,
      V_ce_drop,
      missingBaseResistor,
      warnings,
    };
  }
}

/** Frame transformer applying PNP Transistor electrical simulation to the simulation frame. */
export function applyPnpInputToFrame(
  frame: SimulationFrame,
  _context?: SimContext,
): SimulationFrame {
  if (!frame.running) return frame;

  const { nodes, edges } = useCircuitStore.getState();
  const pnpNodes = nodes.filter(
    (node) =>
      node.data.componentType === "pnp" ||
      node.type === "pnp" ||
      getNodeSimulationModel(node) === "pnp",
  );

  if (pnpNodes.length === 0) return frame;

  const components = { ...frame.components };

  for (const pnpNode of pnpNodes) {
    let emitterVoltage = 0;
    let baseVoltage = 0;
    let collectorVoltage = 0;

    const connectedEdges = edges.filter(
      (edge) => edge.source === pnpNode.id || edge.target === pnpNode.id,
    );

    const emitterConnected = connectedEdges.some(
      (e) =>
        (e.target === pnpNode.id && String(e.targetHandle).toLowerCase().includes("emitter")) ||
        (e.source === pnpNode.id && String(e.sourceHandle).toLowerCase().includes("emitter")),
    );
    const baseConnected = connectedEdges.some(
      (e) =>
        (e.target === pnpNode.id && String(e.targetHandle).toLowerCase().includes("base")) ||
        (e.source === pnpNode.id && String(e.sourceHandle).toLowerCase().includes("base")),
    );
    const collectorConnected = connectedEdges.some(
      (e) =>
        (e.target === pnpNode.id && String(e.targetHandle).toLowerCase().includes("collector")) ||
        (e.source === pnpNode.id && String(e.sourceHandle).toLowerCase().includes("collector")),
    );

    // Read voltages at each terminal
    for (const edge of connectedEdges) {
      const isTarget = edge.target === pnpNode.id;
      const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
      const remoteNodeId = isTarget ? edge.source : edge.target;
      const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
      const remoteVoltage = getEndpointVoltage(frame, remoteNodeId, remoteHandle);

      const normalHandle = localHandle.toString().toLowerCase();
      if (normalHandle.includes("emitter")) emitterVoltage = remoteVoltage;
      if (normalHandle.includes("base")) baseVoltage = remoteVoltage;
      if (normalHandle.includes("collector")) collectorVoltage = remoteVoltage;
    }

    // Extract configurable properties
    const props = pnpNode.data.properties ?? {};
    const beta = Number(props.beta?.value ?? DEFAULT_PNP_PARAMETERS.beta);
    const vbe = Number(props.vbe?.value ?? DEFAULT_PNP_PARAMETERS.vbe);
    const vceSat = Number(props.vceSat?.value ?? DEFAULT_PNP_PARAMETERS.vceSat);
    const maxCurrent = Number(props.maxCurrent?.value ?? DEFAULT_PNP_PARAMETERS.maxCurrent);
    const maxPower = Number(props.maxPower?.value ?? DEFAULT_PNP_PARAMETERS.maxPower);

    // Base loop resistance RB calculation
    let RB = 0;
    for (const edge of connectedEdges) {
      const isTarget = edge.target === pnpNode.id;
      const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
      if (localHandle.toString().toLowerCase().includes("base")) {
        const remoteNodeId = isTarget ? edge.source : edge.target;
        const remoteNode = nodes.find((n) => n.id === remoteNodeId);
        if (remoteNode && getNodeSimulationModel(remoteNode) === "resistor") {
          const val = Number(remoteNode.data.properties?.resistance?.value ?? 1000);
          RB += val;
        }
      }
    }

    // Collector load resistance
    let Rload = 220;
    let VdropLoad = 0;
    for (const edge of connectedEdges) {
      const isTarget = edge.target === pnpNode.id;
      const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
      if (localHandle.toString().toLowerCase().includes("collector")) {
        const remoteNodeId = isTarget ? edge.source : edge.target;
        const remoteNode = nodes.find((n) => n.id === remoteNodeId);
        if (remoteNode) {
          const model = getNodeSimulationModel(remoteNode);
          if (model === "led") {
            VdropLoad += 2.0;
          } else if (model === "resistor") {
            Rload = Number(remoteNode.data.properties?.resistance?.value ?? 220);
          }
        }
      }
    }

    const simResult = PNPTransistorModel.simulate(
      emitterVoltage,
      baseVoltage,
      collectorVoltage,
      RB,
      Rload,
      VdropLoad,
      baseConnected,
      emitterConnected,
      collectorConnected,
      { beta, vbe, vceSat, maxCurrent, maxPower },
    );

    const serverComponent = frame.components[pnpNode.id];
    const isConducting = serverComponent ? (serverComponent.isPowered && simResult.isConducting) : simResult.isConducting;
    if (!isConducting) {
      simResult.isConducting = false;
      simResult.state = "cutoff";
      simResult.baseCurrent = 0;
      simResult.collectorCurrent = 0;
      simResult.emitterCurrent = 0;
      simResult.power = 0;
      simResult.R_ce = 10000000;
      simResult.V_ce_drop = 0;
    }

    // Driven collector output voltage when conducting
    const drivenCollectorVoltage = simResult.isConducting
      ? Math.max(0, emitterVoltage - simResult.V_ce_drop)
      : 0;

    components[pnpNode.id] = {
      ...(components[pnpNode.id] ?? {
        nodeId: pnpNode.id,
        componentType: "pnp",
      }),
      isPowered: simResult.isConducting,
      voltage: drivenCollectorVoltage,
      brightness: simResult.isConducting ? (simResult.state === "saturation" ? 1.0 : 0.6) : 0,
      telemetry: {
        state: simResult.isConducting ? "ON" : "OFF",
        mode: simResult.state,
        conduction: simResult.isConducting ? "ON" : "OFF",
        emitterVoltage: simResult.emitterVoltage,
        baseVoltage: simResult.baseVoltage,
        collectorVoltage: simResult.isConducting ? drivenCollectorVoltage : simResult.collectorVoltage,
        VEB: simResult.VEB,
        VEC: simResult.VEC,
        vbe: simResult.VEB,
        vce: simResult.VEC,
        baseCurrent: Number((simResult.baseCurrent * 1000).toFixed(3)),
        collectorCurrent: Number((simResult.collectorCurrent * 1000).toFixed(3)),
        emitterCurrent: Number((simResult.emitterCurrent * 1000).toFixed(3)),
        power: Number((simResult.power * 1000).toFixed(3)),
        missingBaseResistor: simResult.missingBaseResistor,
        warning: simResult.warnings.join(" "),
        emitterConnected,
        baseConnected,
        collectorConnected,
      },
      pins: {
        emitter: {
          handleId: "emitter",
          voltage: emitterVoltage,
          normalizedValue: emitterVoltage / 5.0,
          active: emitterConnected,
        },
        base: {
          handleId: "base",
          voltage: baseVoltage,
          normalizedValue: baseVoltage / 5.0,
          active: baseConnected,
        },
        collector: {
          handleId: "collector",
          voltage: simResult.isConducting ? drivenCollectorVoltage : collectorVoltage,
          normalizedValue: (simResult.isConducting ? drivenCollectorVoltage : collectorVoltage) / 5.0,
          active: collectorConnected,
        },
      },
    };

    // Propagate driven collector output to connected downstream loads (e.g. LED)
    if (simResult.isConducting && drivenCollectorVoltage > 0) {
      for (const edge of connectedEdges) {
        const isTarget = edge.target === pnpNode.id;
        const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
        if (localHandle.toString().toLowerCase().includes("collector")) {
          const remoteNodeId = isTarget ? edge.source : edge.target;
          if (components[remoteNodeId]) {
            components[remoteNodeId].voltage = drivenCollectorVoltage;
            components[remoteNodeId].isPowered = true;
          }
        }
      }
    }
  }

  return { ...frame, components };
}
