import { buildConductiveGraphForStore, getReachableGraphNodes } from "../../circuit/graph";
import { getNodeSimulationModel, getCapacitanceFarads, getResistanceOhms } from "../../circuit/components";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";

function addGraphConnection(
  graph: Map<string, Set<string>>,
  a: string,
  b: string,
) {
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a)!.add(b);
  graph.get(b)!.add(a);
}

function getSlideswitchActiveThrow(node: CircuitNode) {
  const state = node.data.properties?.state?.value;
  // 'left' → common connects to pin1, 'right' → common connects to pin2
  if (state === "left" || state === "off") return "pin1";
  if (state === "right" || state === "on") return "pin2";
  return "pin1"; // default
}

export function getNe555TimingNetwork(
  timerNode: CircuitNode,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
) {
  const graph = buildConductiveGraphForStore(nodes, edges, {
    includeResistors: false,
    includeDiodes: false,
  });
  const endpoint = (handle: string) => `${timerNode.id}:${handle}`;
  const vccNet = getReachableGraphNodes(graph, endpoint("pin8_vcc"));
  const gndNet = getReachableGraphNodes(graph, endpoint("pin1_gnd"));
  const dischargeNet = getReachableGraphNodes(graph, endpoint("pin7_dis"));
  const triggerNet = getReachableGraphNodes(graph, endpoint("pin2_trig"));
  const thresholdNet = getReachableGraphNodes(graph, endpoint("pin6_thresh"));
  const timingNet = new Set([...triggerNet, ...thresholdNet]);
  const astableMode =
    timingNet.has(endpoint("pin2_trig")) &&
    timingNet.has(endpoint("pin6_thresh"));
  const inNet = (net: Set<string>, nodeId: string, handle: string) =>
    net.has(`${nodeId}:${handle}`);

  let capacitance = 0;
  let timingCapacitor: {
    nodeId: string;
    positiveHandle: string;
    negativeHandle: string;
  } | null = null;
  let diodeTimingMode: "chargeBypass" | "dischargeBypass" | null = null;
  for (const node of nodes) {
    const model = getNodeSimulationModel(node);
    if (model !== "capacitor" && model !== "polarizedCapacitor") continue;
    const positiveHandle = model === "polarizedCapacitor" ? "anode" : "pin1";
    const negativeHandle = model === "polarizedCapacitor" ? "cathode" : "pin2";
    const positiveOnTiming = inNet(timingNet, node.id, positiveHandle);
    const negativeOnTiming = inNet(timingNet, node.id, negativeHandle);
    const positiveOnGround = inNet(gndNet, node.id, positiveHandle);
    const negativeOnGround = inNet(gndNet, node.id, negativeHandle);
    if (
      (positiveOnTiming && negativeOnGround) ||
      (negativeOnTiming && positiveOnGround)
    ) {
      const nodeCapacitance = getCapacitanceFarads(node);
      if (nodeCapacitance > capacitance) {
        capacitance = nodeCapacitance;
        timingCapacitor = { nodeId: node.id, positiveHandle, negativeHandle };
      }
    }
  }

  for (const node of nodes) {
    if (getNodeSimulationModel(node)?.toLowerCase() !== "diode") continue;
    const anodeOnTiming = inNet(timingNet, node.id, "anode");
    const cathodeOnTiming = inNet(timingNet, node.id, "cathode");
    const anodeOnDischarge = inNet(dischargeNet, node.id, "anode");
    const cathodeOnDischarge = inNet(dischargeNet, node.id, "cathode");
    if (anodeOnDischarge && cathodeOnTiming) diodeTimingMode = "chargeBypass";
    if (anodeOnTiming && cathodeOnDischarge)
      diodeTimingMode = "dischargeBypass";
  }

  const voltageSources: Array<{ endpoint: string; voltage: number }> = [];
  for (const node of nodes) {
    const model = getNodeSimulationModel(node);
    if (model === "arduino") {
      voltageSources.push({ endpoint: `${node.id}:5v`, voltage: 5 });
      voltageSources.push({ endpoint: `${node.id}:3v3`, voltage: 3.3 });
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
    }
  }

  let vcc = 0;
  let vccSourceConnected = false;
  for (const source of voltageSources) {
    if (vccNet.has(source.endpoint)) {
      vccSourceConnected = true;
      vcc = Math.max(vcc, source.voltage);
    }
  }

  const resetNet = getReachableGraphNodes(graph, endpoint("pin4_reset"));
  let resetV = vcc;
  for (const source of voltageSources) {
    if (resetNet.has(source.endpoint))
      resetV = Math.max(resetV, source.voltage);
  }
  const resetConnectedToGround = getReachableGraphNodes(graph, endpoint("pin4_reset")).has(endpoint("pin1_gnd"));
  if (resetConnectedToGround) resetV = 0;

  console.debug("[NE555 Reset Debug]", {
    nodeId: timerNode.id,
    resetNetSize: resetNet.size,
    resetV,
    resetConnectedToGround,
    voltageSources: voltageSources.map((s) => ({
      endpoint: s.endpoint,
      voltage: s.voltage,
    })),
  });

  return {
    vcc,
    vccSourceConnected,
    resetV,
    capacitance,
    timingCapacitor,
    astableMode,
    rA: getEquivalentResistanceForStore(
      nodes,
      edges,
      graph,
      vccNet,
      dischargeNet,
    ),
    rB: getEquivalentResistanceForStore(
      nodes,
      edges,
      graph,
      dischargeNet,
      timingNet,
    ),
    diodeTimingMode,
  };
}

function getEquivalentResistanceForStore(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  graphWithoutResistors: Map<string, Set<string>>,
  startNet: Set<string>,
  endNet: Set<string>,
): number {
  for (const pin of startNet) {
    if (endNet.has(pin)) return 0;
  }

  const nets: Set<string>[] = [];
  const visited = new Set<string>();

  nets.push(startNet);
  for (const pin of startNet) visited.add(pin);

  nets.push(endNet);
  for (const pin of endNet) visited.add(pin);

  for (const node of nodes) {
    if (getNodeSimulationModel(node) !== "resistor") continue;
    for (const pin of ["pin1", "pin2"]) {
      const pinStr = `${node.id}:${pin}`;
      if (!visited.has(pinStr)) {
        const net = getReachableGraphNodes(graphWithoutResistors, pinStr);
        nets.push(net);
        for (const p of net) visited.add(p);
      }
    }
  }

  const findNetIndex = (pinStr: string): number => {
    return nets.findIndex((net) => net.has(pinStr));
  };

  interface ResistorEdge {
    u: number;
    v: number;
    r: number;
  }
  let resistorEdges: ResistorEdge[] = [];

  for (const node of nodes) {
    if (getNodeSimulationModel(node) !== "resistor") continue;
    const r = getResistanceOhms(node);
    if (r <= 0) continue;
    const u = findNetIndex(`${node.id}:pin1`);
    const v = findNetIndex(`${node.id}:pin2`);
    if (u !== -1 && v !== -1 && u !== v) {
      resistorEdges.push({ u, v, r });
    }
  }

  const startIdx = 0;
  const endIdx = 1;

  let changed = true;
  let safetyCounter = 0;
  while (changed && safetyCounter < 1000) {
    safetyCounter++;
    changed = false;

    const edgeMap = new Map<string, number[]>();
    for (const edge of resistorEdges) {
      const key =
        edge.u < edge.v ? `${edge.u}-${edge.v}` : `${edge.v}-${edge.u}`;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key)!.push(edge.r);
    }

    const nextEdges: ResistorEdge[] = [];
    for (const [key, resistances] of edgeMap.entries()) {
      const [uStr, vStr] = key.split("-");
      const u = parseInt(uStr);
      const v = parseInt(vStr);
      if (resistances.length === 1) {
        nextEdges.push({ u, v, r: resistances[0] });
      } else {
        const invSum = resistances.reduce((sum, r) => sum + 1 / r, 0);
        nextEdges.push({ u, v, r: 1 / invSum });
        changed = true;
      }
    }
    resistorEdges = nextEdges;

    const degree = new Array(nets.length).fill(0);
    const adj = Array.from(
      { length: nets.length },
      () => [] as { neighbor: number; r: number; edgeIdx: number }[],
    );

    resistorEdges.forEach((edge, idx) => {
      degree[edge.u]++;
      degree[edge.v]++;
      adj[edge.u].push({ neighbor: edge.v, r: edge.r, edgeIdx: idx });
      adj[edge.v].push({ neighbor: edge.u, r: edge.r, edgeIdx: idx });
    });

    for (let i = 0; i < nets.length; i++) {
      if (i === startIdx || i === endIdx) continue;
      if (degree[i] === 2) {
        const [edgeA, edgeB] = adj[i];
        const u = edgeA.neighbor;
        const v = edgeB.neighbor;
        const newR = edgeA.r + edgeB.r;

        const idxA = edgeA.edgeIdx;
        const idxB = edgeB.edgeIdx;
        resistorEdges = resistorEdges.filter(
          (_, idx) => idx !== idxA && idx !== idxB,
        );

        if (u !== v) {
          resistorEdges.push({ u, v, r: newR });
        }
        changed = true;
        break;
      }
    }
  }

  const finalEdge = resistorEdges.find(
    (edge) =>
      (edge.u === startIdx && edge.v === endIdx) ||
      (edge.u === endIdx && edge.v === startIdx),
  );
  return finalEdge ? finalEdge.r : 0;
}

export function applyDrivenLoadsFromEndpoint(args: {
  sourceNode: CircuitNode;
  sourceHandle: string;
  sourceVoltage: number;
  supplyVoltage: number;
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  components: Record<string, SimulationFrame["components"][string]>;
  dutyCycle?: number;
}) {
  const graph = buildConductiveGraphForStore(args.nodes, args.edges, {
    includeResistors: true,
  });
  const outputReach = getReachableGraphNodes(
    graph,
    `${args.sourceNode.id}:${args.sourceHandle}`,
  );
  const groundReach = new Set<string>();
  const supplyReach = new Set<string>();
  const addReach = (target: Set<string>, start: string) => {
    for (const endpoint of getReachableGraphNodes(graph, start))
      target.add(endpoint);
  };

  for (const node of args.nodes) {
    const model = getNodeSimulationModel(node);
    const groundHandles =
      model === "arduino"
        ? ["gnd1", "gnd2", "gnd3"]
        : model === "raspberrypipico"
          ? [
            "pico_gnd1",
            "pico_gnd2",
            "pico_gnd3",
            "pico_gnd4",
            "pico_gnd5",
            "pico_gnd6",
            "pico_gnd7",
            "pico_gnd8",
          ]
          : model === "esp32"
            ? ["esp32_gnd1", "esp32_gnd2", "esp32_gnd3"]
            : model === "battery9v" ||
              model === "battery1_5v" ||
              model === "coincell" ||
              model === "powerSupply"
              ? ["negative"]
              : [];

    for (const handle of groundHandles) {
      addReach(groundReach, `${node.id}:${handle}`);
    }

    if (model === "arduino") {
      addReach(supplyReach, `${node.id}:5v`);
      addReach(supplyReach, `${node.id}:3v3`);
    }

    if (model === "raspberrypipico") {
      addReach(supplyReach, `${node.id}:pico_3v3`);
      addReach(supplyReach, `${node.id}:pico_vbus`);
      addReach(supplyReach, `${node.id}:pico_vsys`);
    }

    if (model === "esp32") {
      addReach(supplyReach, `${node.id}:esp32_3v3`);
      addReach(supplyReach, `${node.id}:esp32_vin`);
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
      if (enabled) addReach(supplyReach, `${node.id}:positive`);
    }
  }

  for (const node of args.nodes) {
    const model = getNodeSimulationModel(node);
    const previous = args.components[node.id];

    if (model === "led") {
      const anodeKey = `${node.id}:anode`;
      const cathodeKey = `${node.id}:cathode`;
      const sourceModePath =
        outputReach.has(anodeKey) && groundReach.has(cathodeKey);
      const sinkModePath =
        supplyReach.has(anodeKey) && outputReach.has(cathodeKey);
      const onOutputPath = sourceModePath || sinkModePath;
      const driveVoltage = sourceModePath
        ? args.sourceVoltage
        : args.supplyVoltage;
      const forward = sourceModePath
        ? args.sourceVoltage > 0.1
        : sinkModePath && args.supplyVoltage > 0.1 && args.sourceVoltage < 0.5;

      if (!forward) {
        if (onOutputPath || previous?.telemetry?.ne555Driven === true) {
          args.components[node.id] = {
            ...(previous ?? {
              nodeId: node.id,
              componentType: "led",
              label: node.data.label,
              isPowered: false,
              brightness: 0,
              voltage: 0,
              telemetry: {},
              pins: {},
            }),
            isPowered: false,
            brightness: 0,
            voltage: 0,
            telemetry: {
              ...(previous?.telemetry ?? {}),
              ne555Driven: onOutputPath,
              controlledByGpio: onOutputPath,
              pathBlocked: !onOutputPath,
            },
            pins: {
              ...(previous?.pins ?? {}),
              anode: {
                handleId: "anode",
                voltage: 0,
                normalizedValue: 0,
                active: onOutputPath,
              },
              cathode: {
                handleId: "cathode",
                voltage: 0,
                normalizedValue: 0,
                active: onOutputPath,
              },
            },
          };
        }
        continue;
      }

      const forwardVoltage = getLedForwardVoltage(node);
      const isPwmDuty =
        args.dutyCycle !== undefined ||
        (args.supplyVoltage > 0 && args.sourceVoltage < args.supplyVoltage - 0.05);
      const duty =
        args.dutyCycle !== undefined
          ? args.dutyCycle
          : args.supplyVoltage > 0
            ? clamp01(args.sourceVoltage / args.supplyVoltage)
            : 1.0;

      const peakVoltage = sourceModePath
        ? args.supplyVoltage
        : args.supplyVoltage;
      const effectiveDriveV = isPwmDuty ? peakVoltage : driveVoltage;

      const peakBrightness = clamp01(
        (effectiveDriveV - forwardVoltage) / Math.max(1, effectiveDriveV - 0.2),
      );
      const brightness = isPwmDuty
        ? Number((peakBrightness * duty).toFixed(3))
        : peakBrightness;

      let seriesR = 0;
      for (const n of args.nodes) {
        if (getNodeSimulationModel(n) === "resistor") {
          const p1 = `${n.id}:pin1`;
          const p2 = `${n.id}:pin2`;
          if (
            (outputReach.has(p1) || groundReach.has(p1)) &&
            (outputReach.has(p2) || groundReach.has(p2))
          ) {
            seriesR += getResistanceOhms(n);
          }
        }
      }
      const finalR = seriesR > 0 ? seriesR : 220;
      const peakCurrentMA = Math.max(
        0,
        ((peakVoltage - Math.max(0, forwardVoltage - 0.2)) / finalR) * 1000,
      );
      const currentMA = isPwmDuty
        ? Number((peakCurrentMA * duty).toFixed(2))
        : Number(peakCurrentMA.toFixed(2));

      const isPowered = duty > 0.001 && (brightness > 0 || currentMA > 0.05);

      args.components[node.id] = {
        ...(previous ?? {
          nodeId: node.id,
          componentType: "led",
          label: node.data.label,
          isPowered: false,
          brightness: 0,
          voltage: 0,
          telemetry: {},
          pins: {},
        }),
        isPowered,
        brightness,
        voltage: driveVoltage,
        telemetry: {
          ...(previous?.telemetry ?? {}),
          color: String(node.data.properties?.color?.value ?? previous?.telemetry?.color ?? "red"),
          currentMilliAmps: currentMA,
          seriesResistance: finalR,
          maxVoltage: forwardVoltage,
          overloadVoltage: peakVoltage,
          controlledByGpio: true,
          ne555Driven: getNodeSimulationModel(args.sourceNode) === "ne555",
          ne555DriveMode: sourceModePath ? "source" : "sink",
        },
        pins: {
          ...(previous?.pins ?? {}),
          anode: {
            handleId: "anode",
            voltage: driveVoltage,
            normalizedValue: clamp01(driveVoltage / 5),
            active: true,
          },
          cathode: {
            handleId: "cathode",
            voltage: sourceModePath ? 0 : args.sourceVoltage,
            normalizedValue: clamp01(args.sourceVoltage / 5),
            active: true,
          },
        },
      };
    }

    if (model === "piezo") {
      const positiveKey = `${node.id}:positive`;
      const negativeKey = `${node.id}:negative`;
      const sourceModePath =
        outputReach.has(positiveKey) && groundReach.has(negativeKey);
      const sinkModePath =
        supplyReach.has(positiveKey) && outputReach.has(negativeKey);
      const onOutputPath = sourceModePath || sinkModePath;
      const driveVoltage = sourceModePath
        ? args.sourceVoltage
        : args.supplyVoltage;
      const forward = sourceModePath
        ? args.sourceVoltage > 0.1
        : sinkModePath && args.supplyVoltage > 0.1 && args.sourceVoltage < 0.5;
      if (!forward) {
        if (onOutputPath || previous?.telemetry?.ne555Driven === true) {
          args.components[node.id] = {
            ...(previous ?? {
              nodeId: node.id,
              componentType: "piezo",
              label: node.data.label,
              isPowered: false,
              brightness: 0,
              voltage: 0,
              telemetry: {},
              pins: {},
            }),
            isPowered: false,
            brightness: 0,
            voltage: 0,
            telemetry: {
              ...(previous?.telemetry ?? {}),
              tone: "OFF",
              ne555Driven: onOutputPath,
            },
            pins: {
              ...(previous?.pins ?? {}),
              positive: {
                handleId: "positive",
                voltage: 0,
                normalizedValue: 0,
                active: onOutputPath,
              },
              negative: {
                handleId: "negative",
                voltage: 0,
                normalizedValue: 0,
                active: onOutputPath,
              },
            },
          };
        }
        continue;
      }

      args.components[node.id] = {
        ...(previous ?? {
          nodeId: node.id,
          componentType: "piezo",
          label: node.data.label,
          isPowered: false,
          brightness: 0,
          voltage: 0,
          telemetry: {},
          pins: {},
        }),
        isPowered: true,
        brightness: clamp01(driveVoltage / 5),
        voltage: driveVoltage,
        telemetry: {
          ...(previous?.telemetry ?? {}),
          tone: "ON",
          ne555Driven: getNodeSimulationModel(args.sourceNode) === "ne555",
          ne555DriveMode: sourceModePath ? "source" : "sink",
        },
        pins: {
          ...(previous?.pins ?? {}),
          positive: {
            handleId: "positive",
            voltage: driveVoltage,
            normalizedValue: clamp01(driveVoltage / 5),
            active: true,
          },
          negative: {
            handleId: "negative",
            voltage: sourceModePath ? 0 : args.sourceVoltage,
            normalizedValue: clamp01(args.sourceVoltage / 5),
            active: true,
          },
        },
      };
    }
    if (model === "ledrgb") {
      const redKey = `${node.id}:red`;
      const greenKey = `${node.id}:green`;
      const blueKey = `${node.id}:blue`;
      const groundKey = `${node.id}:ground`;

      const hasRed = outputReach.has(redKey) && groundReach.has(groundKey);
      const hasGreen = outputReach.has(greenKey) && groundReach.has(groundKey);
      const hasBlue = outputReach.has(blueKey) && groundReach.has(groundKey);

      if (hasRed || hasGreen || hasBlue) {
        const prevRed = (previous?.telemetry as any)?.red ?? 0;
        const prevGreen = (previous?.telemetry as any)?.green ?? 0;
        const prevBlue = (previous?.telemetry as any)?.blue ?? 0;

        const newRed = hasRed ? Math.round((args.sourceVoltage / (args.supplyVoltage || 3.3)) * 255) : prevRed;
        const newGreen = hasGreen ? Math.round((args.sourceVoltage / (args.supplyVoltage || 3.3)) * 255) : prevGreen;
        const newBlue = hasBlue ? Math.round((args.sourceVoltage / (args.supplyVoltage || 3.3)) * 255) : prevBlue;

        const maxV = Math.max(
          hasRed ? args.sourceVoltage : 0,
          hasGreen ? args.sourceVoltage : 0,
          hasBlue ? args.sourceVoltage : 0,
          previous?.voltage ?? 0,
        );

        const isPowered = newRed > 5 || newGreen > 5 || newBlue > 5 || maxV > 0.1;

        args.components[node.id] = {
          ...(previous ?? {
            nodeId: node.id,
            componentType: "ledrgb",
            label: node.data.label,
            isPowered: false,
            brightness: 0,
            voltage: 0,
            telemetry: {},
            pins: {},
          }),
          isPowered,
          brightness: clamp01(maxV / 3.3),
          voltage: maxV,
          telemetry: {
            ...(previous?.telemetry ?? {}),
            red: newRed,
            green: newGreen,
            blue: newBlue,
            maxVoltage: 3,
            overloadVoltage: 0,
            burnt: false,
            fault: "",
          },
          pins: {
            ...(previous?.pins ?? {}),
            red: { handleId: "red", voltage: hasRed ? args.sourceVoltage : (previous?.pins?.red?.voltage ?? 0), normalizedValue: newRed / 255, active: hasRed },
            green: { handleId: "green", voltage: hasGreen ? args.sourceVoltage : (previous?.pins?.green?.voltage ?? 0), normalizedValue: newGreen / 255, active: hasGreen },
            blue: { handleId: "blue", voltage: hasBlue ? args.sourceVoltage : (previous?.pins?.blue?.voltage ?? 0), normalizedValue: newBlue / 255, active: hasBlue },
            ground: { handleId: "ground", voltage: 0, normalizedValue: 0, active: true },
          },
        };
      }
    }
  }
}

export function syncNe555TimingCapacitor(args: {
  timingCapacitor: {
    nodeId: string;
    positiveHandle: string;
    negativeHandle: string;
  } | null;
  components: Record<string, SimulationFrame["components"][string]>;
  nodes: CircuitNode[];
  capVoltage: number;
  vcc: number;
  phase: "charging" | "discharging" | "idle";
}) {
  if (!args.timingCapacitor) return;
  const capNode = args.nodes.find(
    (node) => node.id === args.timingCapacitor?.nodeId,
  );
  if (!capNode) return;

  const referenceVoltage = Math.max(0.001, args.vcc);
  const lowerThreshold = referenceVoltage / 3;
  const upperThreshold = (referenceVoltage * 2) / 3;
  const timingWindow = Math.max(0.001, upperThreshold - lowerThreshold);
  const chargePercent = Number(
    Math.min(
      100,
      Math.max(0, ((args.capVoltage - lowerThreshold) / timingWindow) * 100),
    ).toFixed(1),
  );
  const dischargePercent = Number((100 - chargePercent).toFixed(1));
  const previous = args.components[capNode.id];

  args.components[capNode.id] = {
    ...(previous ?? {
      nodeId: capNode.id,
      componentType: capNode.data.componentType,
      label: capNode.data.label,
      isPowered: false,
      brightness: 0,
      voltage: 0,
      telemetry: {},
      pins: {},
    }),
    isPowered: args.capVoltage > 0.05,
    brightness: clamp01(args.capVoltage / referenceVoltage),
    voltage: args.capVoltage,
    telemetry: {
      ...(previous?.telemetry ?? {}),
      voltage: args.capVoltage,
      referenceVoltage,
      lowerThreshold,
      upperThreshold,
      phase: args.phase,
      charging: args.phase === "charging",
      discharging: args.phase === "discharging",
      chargePercent,
      dischargePercent,
      percentage: chargePercent,
      ne555TimingCapacitor: true,
    },
    pins: {
      ...(previous?.pins ?? {}),
      [args.timingCapacitor.positiveHandle]: {
        handleId: args.timingCapacitor.positiveHandle,
        voltage: args.capVoltage,
        normalizedValue: clamp01(args.capVoltage / referenceVoltage),
        active: args.vcc > 1,
      },
      [args.timingCapacitor.negativeHandle]: {
        handleId: args.timingCapacitor.negativeHandle,
        voltage: 0,
        normalizedValue: 0,
        active: args.vcc > 1,
      },
    },
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getLedForwardVoltage(node: CircuitNode): number {
  const color = String(node.data.properties?.color?.value ?? "red").toLowerCase();
  if (color === "blue" || color === "white") return 3.0;
  if (color === "green") return 2.1;
  if (color === "yellow" || color === "orange") return 2.0;
  return 1.8;
}