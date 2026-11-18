import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { getNodeSimulationModel, getResistanceOhms } from "../../circuit/components";
import { addGraphConnection, getReachableGraphNodes } from "../../circuit/graph";
import { getBreadboardAutoConnections } from "../../circuit/breadboard";
import type { SimContext } from "../types";

export interface NpnParameters {
  beta: number;
  vbeOn: number;
  vceSat: number;
  maxCollectorCurrent?: number;
  maxPower?: number;
  maxVce?: number;
}

/**
 * NPN Transistor dynamic frame transformer.
 * Calculates instantaneous electrical behavior across Cutoff, Active, and Saturation regions
 * based on actual circuit voltages, without modifying any other component or introducing artificial leakage.
 * Fully compatible with microcontrollers, power sources, resistors, capacitors, LEDs, motors, buzzers, and sensors.
 */
export function applyNpnInputToFrame(
  frame: SimulationFrame,
  context?: SimContext,
): SimulationFrame {
  if (!frame.running) return frame;

  const { nodes, edges } = useCircuitStore.getState();
  const dynamicComponents = context?.dynamicComponents ?? [];

  const npnNodes = nodes.filter((node) => {
    const model = getNodeSimulationModel(node);
    const compType = node.data.componentType?.toLowerCase();
    const type = node.type?.toLowerCase();
    return model === "npn" || compType === "npn" || type === "npn";
  });

  if (npnNodes.length === 0) return frame;

  const components = { ...frame.components };

  // Build conductive wire graph for path tracing
  const wireGraph = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    addGraphConnection(
      wireGraph,
      `${edge.source}:${edge.sourceHandle}`,
      `${edge.target}:${edge.targetHandle}`,
    );
  }

  // Add breadboard auto-connections
  for (const connection of getBreadboardAutoConnections(nodes, edges, dynamicComponents)) {
    addGraphConnection(
      wireGraph,
      `${connection.nodeId}:${connection.handleId}`,
      `${connection.breadboardNodeId}:${connection.breadboardHandleId}`,
    );
  }

  // Add internal connections for pass-through components (resistors, loads, breadboards, switches, etc.)
  for (const node of nodes) {
    const model = getNodeSimulationModel(node);
    if (model === "resistor" || model === "photoresistor") {
      addGraphConnection(wireGraph, `${node.id}:pin1`, `${node.id}:pin2`);
    } else if (model === "led" || model === "ledrgb" || model === "diode") {
      addGraphConnection(wireGraph, `${node.id}:anode`, `${node.id}:cathode`);
    } else if (model === "dcmotor" || model === "hobbyGearmotor" || model === "vibrationMotor") {
      addGraphConnection(wireGraph, `${node.id}:pin1`, `${node.id}:pin2`);
      addGraphConnection(wireGraph, `${node.id}:terminal1`, `${node.id}:terminal2`);
      addGraphConnection(wireGraph, `${node.id}:positive`, `${node.id}:negative`);
    } else if (model === "piezo") {
      addGraphConnection(wireGraph, `${node.id}:positive`, `${node.id}:negative`);
      addGraphConnection(wireGraph, `${node.id}:pin1`, `${node.id}:pin2`);
    } else if (model === "breadboard") {
      for (const railPrefix of [
        "top_positive",
        "top_negative",
        "bottom_negative",
        "bottom_positive",
      ]) {
        for (let index = 1; index < 30; index += 1) {
          addGraphConnection(
            wireGraph,
            `${node.id}:${railPrefix}_${index}`,
            `${node.id}:${railPrefix}_${index + 1}`,
          );
        }
      }
      for (let column = 1; column <= 30; column += 1) {
        for (const rows of [
          ["j", "i", "h", "g", "f"],
          ["e", "d", "c", "b", "a"],
        ]) {
          for (let index = 0; index < rows.length - 1; index += 1) {
            addGraphConnection(
              wireGraph,
              `${node.id}:${rows[index]}${column}`,
              `${node.id}:${rows[index + 1]}${column}`,
            );
          }
        }
      }
    } else if (model === "arduino") {
      addGraphConnection(wireGraph, `${node.id}:gnd1`, `${node.id}:gnd2`);
      addGraphConnection(wireGraph, `${node.id}:gnd2`, `${node.id}:gnd3`);
    } else if (model === "raspberrypipico") {
      const grounds = [
        "pico_gnd1",
        "pico_gnd2",
        "pico_gnd3",
        "pico_gnd4",
        "pico_gnd5",
        "pico_gnd6",
        "pico_gnd7",
        "pico_gnd8",
      ];
      for (let index = 0; index < grounds.length - 1; index += 1) {
        addGraphConnection(
          wireGraph,
          `${node.id}:${grounds[index]}`,
          `${node.id}:${grounds[index + 1]}`,
        );
      }
    } else if (model === "pushbutton") {
      addGraphConnection(wireGraph, `${node.id}:pin1a`, `${node.id}:pin1b`);
      addGraphConnection(wireGraph, `${node.id}:pin2a`, `${node.id}:pin2b`);
      if (node.data.properties?.state?.value === "on") {
        addGraphConnection(wireGraph, `${node.id}:pin1a`, `${node.id}:pin2a`);
        addGraphConnection(wireGraph, `${node.id}:pin1b`, `${node.id}:pin2b`);
      }
    }
  }

  for (const npnNode of npnNodes) {
    const beta = Math.max(1, Number(npnNode.data.properties?.beta?.value ?? 100));
    const vbeOn = Math.max(0.1, Number(npnNode.data.properties?.vbeOn?.value ?? 0.70));
    const vceSat = Math.max(0.01, Number(npnNode.data.properties?.vceSat?.value ?? 0.20));

    const connectedEdges = edges.filter(
      (edge) => edge.source === npnNode.id || edge.target === npnNode.id,
    );

    // Identify handle mappings
    const isPinMatch = (handle: string | undefined | null, targetPin: string) => {
      if (!handle) return false;
      const h = handle.toLowerCase();
      if (targetPin === "base") return h === "base" || h === "b" || h === "gate";
      if (targetPin === "collector") return h === "collector" || h === "c" || h === "drain";
      if (targetPin === "emitter") return h === "emitter" || h === "e" || h === "source";
      return false;
    };

    const isBaseConnected = connectedEdges.some((e) =>
      e.target === npnNode.id ? isPinMatch(e.targetHandle, "base") : isPinMatch(e.sourceHandle, "base"),
    );
    const isCollectorConnected = connectedEdges.some((e) =>
      e.target === npnNode.id ? isPinMatch(e.targetHandle, "collector") : isPinMatch(e.sourceHandle, "collector"),
    );
    const isEmitterConnected = connectedEdges.some((e) =>
      e.target === npnNode.id ? isPinMatch(e.targetHandle, "emitter") : isPinMatch(e.sourceHandle, "emitter"),
    );

    let V_b = 0;
    let V_c = 0;
    let V_e = 0;

    const isGroundHandle = (handle: string | undefined | null) => {
      if (!handle) return false;
      const h = handle.toLowerCase();
      return (
        h === "gnd" ||
        h.startsWith("gnd") ||
        h === "negative" ||
        h === "-" ||
        h.startsWith("pico_gnd")
      );
    };

    for (const edge of connectedEdges) {
      const isTarget = edge.target === npnNode.id;
      const localHandle = (isTarget ? edge.targetHandle : edge.sourceHandle) || "";
      const remoteNodeId = isTarget ? edge.source : edge.target;
      const remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
      const remoteVoltage = isGroundHandle(remoteHandle)
        ? 0
        : getEndpointVoltage(frame, remoteNodeId, remoteHandle);

      if (isPinMatch(localHandle, "base")) {
        V_b = Math.max(V_b, remoteVoltage);
      } else if (isPinMatch(localHandle, "collector")) {
        V_c = Math.max(V_c, remoteVoltage);
      } else if (isPinMatch(localHandle, "emitter")) {
        V_e = Math.max(V_e, remoteVoltage);
      }
    }

    // Measure base circuit series resistance Rb & discover base voltage source
    let R_b = 0;
    let V_b_source = V_b;
    const baseReachable = getReachableGraphNodes(wireGraph, `${npnNode.id}:base`);
    for (const node of nodes) {
      const model = getNodeSimulationModel(node);
      if (model === "resistor") {
        if (baseReachable.has(`${node.id}:pin1`) || baseReachable.has(`${node.id}:pin2`)) {
          R_b += getResistanceOhms(node);
        }
      } else if (model === "arduino" || model === "raspberrypipico") {
        for (const pin of frame.boardPins) {
          if (
            baseReachable.has(`${node.id}:${pin.handleId}`) ||
            baseReachable.has(pin.handleId)
          ) {
            if (pin.active && pin.voltage > 0) {
              V_b_source = Math.max(V_b_source, pin.voltage);
            }
          }
        }
      } else if (model === "powerSupply" || model === "battery" || model === "battery9v" || model === "battery1_5v") {
        if (baseReachable.has(`${node.id}:positive`) || baseReachable.has(`${node.id}:v`)) {
          const supVolt = Number(frame.components[node.id]?.voltage ?? node.data.properties?.voltage?.value ?? 5.0);
          V_b_source = Math.max(V_b_source, supVolt);
        }
      } else if (model === "potentiometer") {
        if (baseReachable.has(`${node.id}:wiper`)) {
          const potVolt = Number(frame.components[node.id]?.pins?.wiper?.voltage ?? frame.components[node.id]?.voltage ?? 0);
          V_b_source = Math.max(V_b_source, potVolt);
        }
      } else if (model === "pirSensor" || model === "ultrasonicDistance" || model === "temperatureSensor") {
        if (baseReachable.has(`${node.id}:out`) || baseReachable.has(`${node.id}:signal`)) {
          const sensVolt = Number(frame.components[node.id]?.voltage ?? frame.components[node.id]?.telemetry?.voltage ?? 0);
          V_b_source = Math.max(V_b_source, sensVolt);
        }
      }
    }

    if (V_b_source > 0 && V_b === 0) {
      V_b = V_b_source;
    }

    // Verify emitter voltage via emitter graph reachability
    const emitterReachable = getReachableGraphNodes(wireGraph, `${npnNode.id}:emitter`);
    let emitterGrounded = false;
    for (const reachableKey of emitterReachable) {
      const parts = reachableKey.split(":");
      if (parts.length === 2 && isGroundHandle(parts[1])) {
        emitterGrounded = true;
        break;
      }
    }
    if (emitterGrounded) {
      V_e = 0;
    }

    // Measure collector load resistance Rload and discover supply voltage Vsource
    let R_load = 0;
    let V_source = V_c > 0 ? V_c : 0;
    let V_drop_load = 0;
    const collectorReachable = getReachableGraphNodes(wireGraph, `${npnNode.id}:collector`);
    for (const node of nodes) {
      const model = getNodeSimulationModel(node);
      if (model === "resistor") {
        if (collectorReachable.has(`${node.id}:pin1`) || collectorReachable.has(`${node.id}:pin2`)) {
          R_load += getResistanceOhms(node);
        }
      } else if (model === "led" || model === "ledrgb") {
        if (collectorReachable.has(`${node.id}:anode`) || collectorReachable.has(`${node.id}:cathode`)) {
          V_drop_load += 2.0; // Typical LED forward drop
        }
      } else if (model === "dcmotor" || model === "hobbyGearmotor" || model === "vibrationMotor") {
        if (
          collectorReachable.has(`${node.id}:pin1`) ||
          collectorReachable.has(`${node.id}:pin2`) ||
          collectorReachable.has(`${node.id}:terminal1`) ||
          collectorReachable.has(`${node.id}:terminal2`) ||
          collectorReachable.has(`${node.id}:positive`) ||
          collectorReachable.has(`${node.id}:negative`)
        ) {
          R_load += 30; // Motor winding resistance
        }
      } else if (model === "piezo") {
        if (collectorReachable.has(`${node.id}:positive`) || collectorReachable.has(`${node.id}:negative`) || collectorReachable.has(`${node.id}:pin1`) || collectorReachable.has(`${node.id}:pin2`)) {
          R_load += 100; // Piezo internal impedance
        }
      } else if (model === "diode") {
        if (collectorReachable.has(`${node.id}:anode`) || collectorReachable.has(`${node.id}:cathode`)) {
          V_drop_load += 0.7; // Standard silicon diode drop
        }
      } else if (model === "battery9v" || model === "battery1_5v" || model === "coincell" || model === "powerSupply" || model === "battery") {
        if (collectorReachable.has(`${node.id}:positive`) || collectorReachable.has(`${node.id}:v`)) {
          const batVolt = Number(frame.components[node.id]?.voltage ?? node.data.properties?.voltage?.value ?? 5.0);
          V_source = Math.max(V_source, batVolt);
        }
      } else if (model === "arduino") {
        if (collectorReachable.has(`${node.id}:5v`) || collectorReachable.has(`${node.id}:vin`)) {
          V_source = Math.max(V_source, 5.0);
        } else if (collectorReachable.has(`${node.id}:3v3`)) {
          V_source = Math.max(V_source, 3.3);
        }
      } else if (model === "raspberrypipico") {
        if (collectorReachable.has(`${node.id}:vsys`) || collectorReachable.has(`${node.id}:vbus`)) {
          V_source = Math.max(V_source, 5.0);
        } else if (collectorReachable.has(`${node.id}:3v3`)) {
          V_source = Math.max(V_source, 3.3);
        }
      }
    }

    if (V_source > 0 && V_c === 0) {
      V_c = V_source;
    } else if (V_source === 0 && V_c > 0) {
      V_source = V_c;
    } else if (V_source === 0 && V_c === 0) {
      V_source = 5.0;
    }

    if (R_load <= 0) {
      R_load = 1000; // Default minimum load if directly hooked to power supply
    }

    const missingBaseResistor = isBaseConnected && R_b < 5;

    // Terminal voltage differentials
    const vbe = V_b - V_e;
    const vbc = V_b - V_c;
    const vce = V_c - V_e;

    // Dynamic state calculations
    let ib = 0;
    let icActual = 0;
    let operatingRegion: "cutoff" | "active" | "saturation" = "cutoff";
    let effectiveVce = Math.max(0, vce);
    let conduction: "ON" | "OFF" = "OFF";

    const R_internal_base = 10; // Ohms

    // Cutoff check: Base disconnected, emitter disconnected, reverse bias, or Vbe < threshold
    if (!isBaseConnected || !isEmitterConnected || vbe < vbeOn || (isCollectorConnected && V_e > V_c + 0.1)) {
      operatingRegion = "cutoff";
      conduction = "OFF";
      ib = 0;
      icActual = 0;
      effectiveVce = Math.max(0, vce);
    } else {
      // Base current (dynamic Ohm's law on base-emitter junction)
      ib = Math.max(0, (V_b - V_e - vbeOn) / (R_b + R_internal_base));

      if (ib > 0) {
        conduction = "ON";

        // Maximum available collector saturation current permitted by external network
        const icAvailable = Math.max(
          0,
          (V_source - V_drop_load - V_e - vceSat) / Math.max(1, R_load),
        );

        // Active mode demand current
        const icActive = ib * beta;

        if (icActive < icAvailable && vce > vceSat) {
          operatingRegion = "active";
          icActual = icActive;
          const R_needed = (V_source - V_drop_load - V_e) / Math.max(1e-6, icActual);
          const R_ce = Math.max(0.1, R_needed - R_load);
          effectiveVce = Math.max(vceSat, Math.min(vce, icActual * R_ce));
        } else {
          operatingRegion = "saturation";
          icActual = icAvailable;
          effectiveVce = vceSat;
        }
      } else {
        operatingRegion = "cutoff";
        conduction = "OFF";
        ib = 0;
        icActual = 0;
        effectiveVce = Math.max(0, vce);
      }
    }

    const ieActual = icActual + ib;
    const forcedBeta = ib > 0 ? icActual / ib : 0;
    const powerWatts = (effectiveVce * icActual) + (Math.max(0, vbe) * ib);
    const powerMilliwatts = powerWatts * 1000;

    components[npnNode.id] = {
      ...(components[npnNode.id] ?? {
        nodeId: npnNode.id,
        componentType: "npn",
      }),
      isPowered: conduction === "ON",
      voltage: effectiveVce,
      telemetry: {
        baseVoltage: Number(V_b.toFixed(3)),
        collectorVoltage: Number(V_c.toFixed(3)),
        emitterVoltage: Number(V_e.toFixed(3)),
        vbe: Number(vbe.toFixed(3)),
        vbc: Number(vbc.toFixed(3)),
        vce: Number(effectiveVce.toFixed(3)),
        baseCurrent: Number((ib * 1000).toFixed(3)), // mA
        collectorCurrent: Number((icActual * 1000).toFixed(3)), // mA
        emitterCurrent: Number((ieActual * 1000).toFixed(3)), // mA
        power: Number(powerMilliwatts.toFixed(3)), // mW
        powerWatts: Number(powerWatts.toFixed(6)),
        operatingRegion,
        mode: operatingRegion.charAt(0).toUpperCase() + operatingRegion.slice(1),
        conduction,
        beta,
        forcedBeta: Number(forcedBeta.toFixed(2)),
        missingBaseResistor,
        warning: missingBaseResistor ? "Missing base resistor!" : "",
        isBaseConnected,
        isCollectorConnected,
        isEmitterConnected,
      },
      pins: {
        base: {
          handleId: "base",
          voltage: V_b,
          normalizedValue: V_b / 5.0,
          active: isBaseConnected && (V_b > 0.1 || ib > 0),
        },
        collector: {
          handleId: "collector",
          voltage: conduction === "ON" ? V_e + effectiveVce : V_c,
          normalizedValue: V_c / 5.0,
          active: isCollectorConnected,
        },
        emitter: {
          handleId: "emitter",
          voltage: V_e,
          normalizedValue: V_e / 5.0,
          active: isEmitterConnected,
        },
      },
    };

    // Modulate collector network and actuate connected in-scope loads
    if (conduction === "ON" && isCollectorConnected) {
      const effectiveLoadVoltage = Math.max(0, V_source - effectiveVce);
      for (const node of nodes) {
        if (node.id === npnNode.id) continue;
        const remoteModel = getNodeSimulationModel(node);
        const isLoadReachable =
          collectorReachable.has(`${node.id}:pin1`) ||
          collectorReachable.has(`${node.id}:pin2`) ||
          collectorReachable.has(`${node.id}:terminal1`) ||
          collectorReachable.has(`${node.id}:terminal2`) ||
          collectorReachable.has(`${node.id}:anode`) ||
          collectorReachable.has(`${node.id}:cathode`) ||
          collectorReachable.has(`${node.id}:positive`) ||
          collectorReachable.has(`${node.id}:negative`);

        if (!isLoadReachable) continue;

        if (remoteModel === "led" || remoteModel === "ledrgb" || remoteModel === "sevenSegment") {
          const dutyCycle = Math.min(1, Math.max(0, V_b / 5.0));
          const effectiveCurrentMA = icActual * 1000 * dutyCycle;
          const normalizedCurrent = Math.min(1, effectiveCurrentMA / 20.0);
          const drive = effectiveCurrentMA > 0.05 ? Number(Math.max(0.05, normalizedCurrent).toFixed(3)) : 0;
          components[node.id] = {
            ...(components[node.id] ?? { nodeId: node.id, componentType: remoteModel }),
            isPowered: drive > 0,
            brightness: drive,
            voltage: effectiveLoadVoltage,
            telemetry: {
              ...(components[node.id]?.telemetry ?? {}),
              brightness: drive,
              currentMilliAmps: Number(effectiveCurrentMA.toFixed(2)),
              current: Number(effectiveCurrentMA.toFixed(2)),
              pathBlocked: false,
              physicalOpenCircuit: false,
            },
          };
        } else if (remoteModel === "dcmotor" || remoteModel === "hobbyGearmotor" || remoteModel === "vibrationMotor") {
          const drive = Math.min(1, icActual / 0.15);
          let rpm = Math.round(2400 * drive);
          let throttle = drive;

          if (node.data.componentType === "hobbyGearmotor") {
            if (effectiveLoadVoltage < 3.0) {
              throttle = 0;
              rpm = 0;
            } else {
              const maxVoltageVal = Number(node.data.properties?.maxVoltage?.value ?? 9);
              const ratio = (effectiveLoadVoltage - 3.0) / Math.max(0.1, maxVoltageVal - 3.0);
              throttle = Math.min(1.2, 0.45 + Math.max(0, ratio) * 0.55);
              rpm = Math.round(effectiveLoadVoltage * 33.33);
            }
          } else if (node.data.componentType === "vibrationMotor") {
            if (effectiveLoadVoltage < 2.5) {
              throttle = 0;
              rpm = 0;
            }
          }

          components[node.id] = {
            ...(components[node.id] ?? { nodeId: node.id, componentType: remoteModel }),
            isPowered: throttle > 0,
            voltage: effectiveLoadVoltage,
            brightness: throttle,
            telemetry: {
              ...(components[node.id]?.telemetry ?? {}),
              speed: throttle,
              rpm,
              voltage: effectiveLoadVoltage,
              current: Number((icActual * 1000).toFixed(2)),
              direction: "forward",
            },
          };
        } else if (remoteModel === "piezo") {
          components[node.id] = {
            ...(components[node.id] ?? { nodeId: node.id, componentType: remoteModel }),
            isPowered: true,
            voltage: effectiveLoadVoltage,
            telemetry: {
              ...(components[node.id]?.telemetry ?? {}),
              active: true,
              current: Number((icActual * 1000).toFixed(2)),
            },
          };
        }
      }
    }
  }

  return { ...frame, components };
}
