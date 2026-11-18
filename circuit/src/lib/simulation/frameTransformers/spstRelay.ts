import type { SimulationFrame } from "../../simulation-state";
import type { SimContext } from "../types";
import { useCircuitStore } from "../../store";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { endpointKey } from "../../simulation-state";

// Helper to clamp values between 0 and 1
const clamp01 = (val: number): number => Math.max(0, Math.min(1, val));

/**
 * SPST Relay State Manager to maintain hysteresis between simulation ticks.
 * Prevents armature fluttering when coil voltage is between Vrelease and Vpickup.
 */
class SpstRelayStateManager {
  private relayStates = new Map<string, boolean>();

  public getState(nodeId: string, defaultValue = false): boolean {
    return this.relayStates.get(nodeId) ?? defaultValue;
  }

  public setState(nodeId: string, isEnergized: boolean): void {
    this.relayStates.set(nodeId, isEnergized);
  }

  public clear(): void {
    this.relayStates.clear();
  }
}

export const spstRelayState = new SpstRelayStateManager();

/**
 * SPST Relay Frame Transformer.
 *
 * Electrical Formulas Implemented:
 * 1. Coil Voltage Difference:
 *    Vcoil = |Vcoil+ - Vcoil-|
 * 2. Coil Current (Ohm's Law):
 *    Icoil = Vcoil / Rcoil  (default Rcoil = 70 Ω)
 * 3. Coil Power (Joule's Law):
 *    Pcoil = Vcoil * Icoil = (Vcoil^2) / Rcoil
 * 4. Pickup and Release Hysteresis:
 *    - If previously OFF: turns ON when Vcoil >= Vpickup (default 4.0 V)
 *    - If previously ON: turns OFF when Vcoil <= Vrelease (default 2.0 V)
 *    - In between: maintains previous state to prevent chatter
 * 5. Contact Voltage & Switching:
 *    - Closed (ON): V_NO = V_COM - V_drop (Rcontact ≈ 0.05 Ω), V_NC = 0 V
 *    - Open (OFF): V_NO = 0 V, V_NC = V_COM
 */
export function applySpstRelayInputToFrame(
  frame: SimulationFrame,
  _context?: SimContext,
): SimulationFrame {
  if (!frame.running) {
    spstRelayState.clear();
    return frame;
  }

  // Use contextual nodes and edges if available to support isolated executions
  const contextNodes = _context?.nodes;
  const contextEdges = _context?.edges;
  const { nodes, edges } = (contextNodes && contextEdges)
    ? { nodes: contextNodes, edges: contextEdges }
    : useCircuitStore.getState();

  const relayNodes = nodes.filter(
    (node) =>
      node.data.componentType === "relaySpst" ||
      node.type === "relaySpst" ||
      node.data.componentType === "spstRelay" ||
      node.data.componentType === "relay-spst",
  );

  if (relayNodes.length === 0) return frame;

  const components = { ...frame.components };

  for (const relayNode of relayNodes) {
    const connectedEdges = edges.filter(
      (edge) => edge.source === relayNode.id || edge.target === relayNode.id,
    );

    // Terminal input voltage accumulators
    let vCoilPos = 0; // Voltage at positive coil terminal (Pin 5)
    let vCoilNeg = 0; // Voltage at negative coil terminal (Pin 8)
    let vCom: number | undefined = undefined; // Supply voltage at common contact COM (Pin 6/7)
    
    // Physical connection flags (used in telemetry & debugging indicators)
    let coilPosConnected = false;
    let coilNegConnected = false;
    let comConnected = false;
    let noConnected = false;
    let ncConnected = false;

    // =========================================================================
    // PHASE 1: Read only coil inputs and contact supply inputs (COM)
    // Load terminals (terminal12 / NO, terminal1 / NC) are isolated from coil logic.
    // =========================================================================
    for (const edge of connectedEdges) {
      const isTarget = edge.target === relayNode.id;
      const localHandle =
        (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
      const remoteNodeId = isTarget ? edge.source : edge.target;
      const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;

      const norm = localHandle.toString().toLowerCase();

      // Coil Positive Terminal (Terminal 5 / Coil+)
      if (
        norm === "terminal5" ||
        norm === "coil+" ||
        norm === "coil_pos" ||
        norm === "coil_positive" ||
        norm === "pin5"
      ) {
        vCoilPos = getEndpointVoltage(frame, remoteNodeId, remoteHandle);
        coilPosConnected = true;
      }

      // Coil Negative Terminal (Terminal 8 / Coil-)
      if (
        norm === "terminal8" ||
        norm === "coil-" ||
        norm === "coil_neg" ||
        norm === "coil_negative" ||
        norm === "pin8"
      ) {
        vCoilNeg = getEndpointVoltage(frame, remoteNodeId, remoteHandle);
        coilNegConnected = true;
      }

      // Common Switch Contact (Terminal 6 / Terminal 7 / COM)
      if (
        norm === "terminal6" ||
        norm === "terminal7" ||
        norm === "com" ||
        norm === "common" ||
        norm === "pin6" ||
        norm === "pin7"
      ) {
        const supplyV = getEndpointVoltage(frame, remoteNodeId, remoteHandle);
        // If multiple COMs are connected, we pick the one with the maximum absolute voltage (conflict resolution)
        if (vCom === undefined || Math.abs(supplyV) > Math.abs(vCom)) {
          vCom = supplyV;
        }
        comConnected = true;
      }

      // Normally Open Contact (Terminal 12 / NO) - track connectivity only
      if (
        norm === "terminal12" ||
        norm === "no" ||
        norm === "normally_open" ||
        norm === "pin12"
      ) {
        noConnected = true;
      }

      // Normally Closed Contact (Terminal 1 / NC) - track connectivity only
      if (
        norm === "terminal1" ||
        norm === "nc" ||
        norm === "normally_closed" ||
        norm === "pin1"
      ) {
        ncConnected = true;
      }
    }

    // resolvedCom: Supply voltage resolved at COM switch terminal
    const resolvedCom = vCom ?? 0;

    // =========================================================================
    // PHASE 2: Calculate Coil Voltage Difference & Read Parameters
    // =========================================================================
    
    // vCoil: Absolute potential difference across the coil winding terminals (positive vs negative)
    const vCoil = Math.abs(vCoilPos - vCoilNeg);
    
    // rCoil: Internal copper coil wire resistance in Ohms (defaults to 70Ω if not configured)
    const rCoil = Math.max(
      1,
      Number(relayNode.data.properties?.coilResistance?.value ?? 70),
    );
    
    // hasPico/isPicoDriven: Checks if a Pico microcontroller is driving the positive coil terminal
    const hasPico = nodes.some(
      (n) =>
        n.data.componentType === "raspberrypipico" ||
        n.type === "raspberrypipico",
    );
    const isPicoDriven = (vCoilPos <= 3.4 && vCoilPos >= 2.5) || frame.boardType === "pico" || hasPico;
    
    // vPickup / vRelease: Standard thresholds scaled down automatically for 3.3V boards to guarantee actuation
    const rawPickup = Number(
      relayNode.data.properties?.pickupVoltage?.value ?? 4.0,
    );
    const rawRelease = Number(
      relayNode.data.properties?.releaseVoltage?.value ?? 2.0,
    );
    const vPickup = isPicoDriven && rawPickup === 4.0 ? 3.0 : rawPickup;
    const vRelease = isPicoDriven && rawRelease === 2.0 ? 1.5 : rawRelease;
    
    // rContact: Internal metal armature contact resistance in Ohms (defaults to 0.05Ω)
    const rContact = Number(
      relayNode.data.properties?.contactResistance?.value ?? 0.05,
    );

    // Choose divisor voltage for normalization (3.3V for Pico-driven circuits, 5V otherwise)
    const sysVoltage = isPicoDriven ? 3.3 : 5.0;

    // iCoil / pCoil: Current (Ohm's Law) and Power dissipation (Joule's Law) for coil state telemetry
    const iCoil = vCoil / rCoil;
    const pCoil = vCoil * iCoil;
    
    // iPickup / iRelease: Current values mapped from the pickup/release thresholds
    const iPickup = vPickup / rCoil;
    const iRelease = vRelease / rCoil;

    // =========================================================================
    // PHASE 3: Determine Relay State via Hysteresis & Thresholds
    // =========================================================================
    
    // previousState: Reads from the tick state-manager to retain switch position
    const previousState = spstRelayState.getState(relayNode.id, false);
    let isEnergized = false;

    // Hysteresis comparison to prevent high-frequency chattering/fluttering
    if (previousState) {
      isEnergized = iCoil > iRelease && vCoil > vRelease;
    } else {
      isEnergized = iCoil >= iPickup && vCoil >= vPickup;
    }

    spstRelayState.setState(relayNode.id, isEnergized);

    // =========================================================================
    // PHASE 4: Calculate Contact Output Voltages & Update Simulation Frame
    // =========================================================================
    // Preserve negative voltages correctly across switch contact, keeping the tiny drop
    const vDrop = 0.001;
    const vNO = isEnergized 
      ? (resolvedCom >= 0 ? Math.max(0, resolvedCom - vDrop) : Math.min(0, resolvedCom + vDrop))
      : 0;
    const vNC = !isEnergized 
      ? (resolvedCom >= 0 ? Math.max(0, resolvedCom - vDrop) : Math.min(0, resolvedCom + vDrop))
      : 0;

    components[relayNode.id] = {
      ...(components[relayNode.id] ?? {
        nodeId: relayNode.id,
        componentType: "relaySpst",
      }),
      isPowered: isEnergized,
      brightness: isEnergized ? 1 : 0,
      voltage: vCoil,
      telemetry: {
        vCoil: Number(vCoil.toFixed(3)),
        iCoil: Number(iCoil.toFixed(4)),
        pCoil: Number(pCoil.toFixed(4)),
        iPickup: Number(iPickup.toFixed(4)),
        iRelease: Number(iRelease.toFixed(4)),
        vCoilPos: Number(vCoilPos.toFixed(3)),
        vCoilNeg: Number(vCoilNeg.toFixed(3)),
        vCom: Number(resolvedCom.toFixed(3)),
        vNO: Number(vNO.toFixed(3)),
        vNC: Number(vNC.toFixed(3)),
        energized: isEnergized,
        state: isEnergized ? "on" : "off",
        pickupVoltage: vPickup,
        releaseVoltage: vRelease,
        coilResistance: rCoil,
        contactResistance: rContact,
        coilPosConnected,
        coilNegConnected,
        comConnected,
        noConnected,
        ncConnected,
      },
      pins: {
        terminal5: {
          handleId: "terminal5",
          voltage: vCoilPos,
          normalizedValue: clamp01(Math.abs(vCoilPos) / sysVoltage),
          active: coilPosConnected,
        },
        terminal8: {
          handleId: "terminal8",
          voltage: vCoilNeg,
          normalizedValue: clamp01(Math.abs(vCoilNeg) / sysVoltage),
          active: coilNegConnected,
        },
        terminal6: {
          handleId: "terminal6",
          voltage: resolvedCom,
          normalizedValue: clamp01(Math.abs(resolvedCom) / sysVoltage),
          active: comConnected,
        },
        terminal7: {
          handleId: "terminal7",
          voltage: resolvedCom,
          normalizedValue: clamp01(Math.abs(resolvedCom) / sysVoltage),
          active: comConnected,
        },
        terminal12: {
          handleId: "terminal12",
          voltage: vNO,
          normalizedValue: clamp01(Math.abs(vNO) / sysVoltage),
          active: noConnected,
        },
        terminal1: {
          handleId: "terminal1",
          voltage: vNC,
          normalizedValue: clamp01(Math.abs(vNC) / sysVoltage),
          active: ncConnected,
        },
      },
    };

    console.log("[SPST Relay Simulation]", {
      relayId: relayNode.id,
      vCoilPos,
      vCoilNeg,
      vCoil,
      previousState,
      isEnergized,
      vCom,
      vNO,
      terminal12Voltage: vNO,
    });
  }

  return { ...frame, components };
}
