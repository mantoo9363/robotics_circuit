import type { SimulationFrame, SimulationNodePinState } from "../../simulation-state";
import type { SimContext } from "../types";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { getNodeSimulationModel } from "../../circuit/components";

export interface DoublePairDigitSegments {
  a: boolean;
  b: boolean;
  c: boolean;
  d: boolean;
  e: boolean;
  f: boolean;
  g: boolean;
  dp: boolean;
}

export interface DoublePairTelemetry {
  [key: string]: string | number | boolean;
  digitsState: string;
  rawDigitsState: string;
  colon: boolean;
  isPowered: boolean;
  color: string;
  displayType: string;
  hasResistor: boolean;
  currentMilliAmps: number;
  burnt: boolean;
  missingPower: boolean;
}

// Persistent active segment memory to smoothly support high-frequency multiplexing
const multiplexPersistence = new Map<
  string,
  {
    digits: [
      DoublePairDigitSegments,
      DoublePairDigitSegments,
      DoublePairDigitSegments,
      DoublePairDigitSegments
    ];
    colon: boolean;
    lastUpdated: number;
  }
>();

export function resetDoublePair7SegmentState(): void {
  multiplexPersistence.clear();
}

/**
 * Evaluates simulation frames for 4-Digit / DoublePair 7-Segment displays.
 * Fully compatible with Arduino Uno (5V) and Raspberry Pi Pico (3.3V).
 * Enforces strict closed-circuit requirements: requires completed GND (Common Cathode)
 * or completed VCC (Common Anode) paths for illumination.
 */
export function applyDoublePair7SegmentInputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  if (!frame.running) return frame;

  const { nodes, edges } = context;

  const displayNodes = nodes.filter(
    (node) =>
      getNodeSimulationModel(node) === "doublePair7Segment" ||
      node.data?.componentType === "doublePair7Segment" ||
      node.data?.simulationModel === "doublePair7Segment" ||
      getNodeSimulationModel(node) === "DoublePair_7segmentDisplay" ||
      node.data?.componentType === "DoublePair_7segmentDisplay" ||
      node.data?.simulationModel === "DoublePair_7segmentDisplay",
  );

  if (displayNodes.length === 0) return frame;

  const components = { ...frame.components };
  let changed = false;

  for (const node of displayNodes) {
    const displayType = (node.data.properties?.displayType?.value ?? "Common Cathode") as
      | "Common Cathode"
      | "Common Anode";
    const isCommonAnode = displayType === "Common Anode";
    const color = String(node.data.properties?.color?.value ?? "red");

    const pinsList = [
      "dig1", "dig2", "dig3", "dig4",
      "a", "b", "c", "d", "e", "f", "g", "dp",
      "vcc", "gnd", "sda", "scl",
    ] as const;

    const connectedEdges = edges.filter(
      (edge) => edge.source === node.id || edge.target === node.id,
    );

    /**
     * Resolves the ultimate driver endpoint and series resistance by traversing through
     * series resistors and breadboard buses.
     */
    const resolveConnectedEndpoint = (pinId: string): {
      remoteNodeId: string;
      remoteHandle: string;
      resistorOhms: number;
    } | null => {
      const edge = connectedEdges.find(
        (e) =>
          (e.source === node.id && e.sourceHandle === pinId) ||
          (e.target === node.id && e.targetHandle === pinId),
      );
      if (!edge) return null;

      const isTarget = edge.target === node.id;
      let remoteNodeId = isTarget ? edge.source : edge.target;
      let remoteHandle = isTarget ? edge.sourceHandle : edge.targetHandle;
      let remoteNode = nodes.find((n) => n.id === remoteNodeId);
      if (!remoteNode || !remoteHandle) return null;

      let resistorOhms = 0;

      // 1. Breadboard Hop
      if (remoteNode.data.componentType === "breadboard") {
        const bbEdges = edges.filter(
          (e) =>
            e.id !== edge.id &&
            ((e.source === remoteNodeId && e.sourceHandle === remoteHandle) ||
              (e.target === remoteNodeId && e.targetHandle === remoteHandle)),
        );
        for (const be of bbEdges) {
          const nextNodeId = be.source === remoteNodeId ? be.target : be.source;
          const nextHandle = be.source === remoteNodeId ? be.targetHandle : be.sourceHandle;
          const nextNode = nodes.find((n) => n.id === nextNodeId);
          if (nextNode && nextHandle) {
            remoteNode = nextNode;
            remoteNodeId = nextNodeId;
            remoteHandle = nextHandle;
            break;
          }
        }
      }

      // 2. Resistor Traversal
      if (getNodeSimulationModel(remoteNode) === "resistor") {
        resistorOhms += Number(remoteNode.data.properties?.resistance?.value ?? 0);
        const otherPin = remoteHandle === "pin1" ? "pin2" : "pin1";

        const resEdges = edges.filter(
          (e) =>
            (e.source === remoteNodeId && e.sourceHandle === otherPin) ||
            (e.target === remoteNodeId && e.targetHandle === otherPin),
        );
        for (const re of resEdges) {
          const nextNodeId = re.source === remoteNodeId ? re.target : re.source;
          const nextHandle = re.source === remoteNodeId ? re.targetHandle : re.sourceHandle;
          const nextNode = nodes.find((n) => n.id === nextNodeId);
          if (nextNode && nextHandle) {
            // Check if other side goes to breadboard
            if (nextNode.data.componentType === "breadboard") {
              const bbOtherEdges = edges.filter(
                (e) =>
                  e.id !== re.id &&
                  ((e.source === nextNodeId && e.sourceHandle === nextHandle) ||
                    (e.target === nextNodeId && e.targetHandle === nextHandle)),
              );
              for (const boe of bbOtherEdges) {
                const finalId = boe.source === nextNodeId ? boe.target : boe.source;
                const finalHandle = boe.source === nextNodeId ? boe.targetHandle : boe.sourceHandle;
                if (finalId && finalHandle) {
                  return { remoteNodeId: finalId, remoteHandle: finalHandle, resistorOhms };
                }
              }
            }
            return { remoteNodeId: nextNodeId, remoteHandle: nextHandle, resistorOhms };
          }
        }
      }

      return { remoteNodeId, remoteHandle, resistorOhms };
    };

    const pinReadings: Record<
      string,
      { voltage: number; grounded: boolean; connected: boolean; resistorOhms: number; sourceVoltage: number }
    > = {};
    const componentPins: Record<string, SimulationNodePinState> = {};

    for (const pinId of pinsList) {
      const resolved = resolveConnectedEndpoint(pinId);

      let voltage = 0;
      let sourceVoltage = 0;
      let grounded = false;
      let connected = false;
      let resistorOhms = 0;

      if (resolved) {
        connected = true;
        resistorOhms = resolved.resistorOhms;
        const { remoteNodeId, remoteHandle } = resolved;

        const rawVolt = getEndpointVoltage(frame, remoteNodeId, remoteHandle);

        const boardPin = frame.boardPins.find((p) => {
          if (!p.handleId) return false;
          const lastColon = p.handleId.lastIndexOf(":");
          const localHandleId =
            lastColon !== -1 ? p.handleId.slice(lastColon + 1) : p.handleId;
          return localHandleId.toLowerCase() === remoteHandle?.toLowerCase();
        });

        if (typeof rawVolt === "number" && rawVolt > 0) {
          voltage = rawVolt;
          sourceVoltage = rawVolt;
        } else if (typeof boardPin?.voltage === "number") {
          voltage = boardPin.voltage;
          sourceVoltage = boardPin.voltage;
        } else if (boardPin?.mode === "OUTPUT") {
          voltage = (boardPin.value !== undefined && boardPin.value > 0) ? 5.0 : 0.0;
          sourceVoltage = voltage;
        } else {
          voltage = 0;
          sourceVoltage = 0;
        }

        if (boardPin) {
          grounded =
            (boardPin.mode === "OUTPUT" && (boardPin.value === 0 || boardPin.voltage === 0)) ||
            boardPin.mode === "GND" ||
            voltage < 0.8;
        } else {
          grounded = voltage < 0.8;
        }
      }

      pinReadings[pinId] = { voltage, grounded, connected, resistorOhms, sourceVoltage };
      componentPins[pinId] = {
        handleId: pinId,
        voltage: Number(voltage.toFixed(2)),
        normalizedValue: Math.max(0, Math.min(1, voltage / 5.0)),
        active: connected,
      };
    }

    // Mandatory Power Validation: VCC and GND are both strictly required
    const isVccConnectedAndPowered = pinReadings["vcc"]?.connected && pinReadings["vcc"].voltage > 1.5;
    const isGndConnectedAndGrounded = pinReadings["gnd"]?.connected && (pinReadings["gnd"].grounded || pinReadings["gnd"].voltage < 0.8);
    const isModulePowered = isVccConnectedAndPowered && isGndConnectedAndGrounded;

    // Common Pin (Digit) Active Check (requires closed circuit to GND for CC, or VCC for CA + Module Power)
    const isDigitActive = (digKey: string): boolean => {
      if (!isModulePowered) return false;
      const r = pinReadings[digKey];
      if (isCommonAnode) {
        return !!(r?.connected && r.voltage > 1.5);
      } else {
        return !!(r?.connected && (r.grounded || (componentPins[digKey].active && r.voltage < 0.8)));
      }
    };

    // Segment Active Check (requires closed circuit to VCC for CC, or GND for CA + Module Power)
    const isSegActive = (segKey: string): boolean => {
      if (!isModulePowered) return false;
      const r = pinReadings[segKey];
      if (!r || !r.connected) return false;
      if (isCommonAnode) {
        return r.grounded || (componentPins[segKey].active && r.voltage < 0.8);
      } else {
        return r.voltage > 1.5;
      }
    };

    const emptyDigits = (): [
      DoublePairDigitSegments,
      DoublePairDigitSegments,
      DoublePairDigitSegments,
      DoublePairDigitSegments
    ] => [
      { a: false, b: false, c: false, d: false, e: false, f: false, g: false, dp: false },
      { a: false, b: false, c: false, d: false, e: false, f: false, g: false, dp: false },
      { a: false, b: false, c: false, d: false, e: false, f: false, g: false, dp: false },
      { a: false, b: false, c: false, d: false, e: false, f: false, g: false, dp: false },
    ];

    let currentPersistence = multiplexPersistence.get(node.id);
    if (!currentPersistence) {
      currentPersistence = {
        digits: emptyDigits(),
        colon: false,
        lastUpdated: frame.timestamp ?? 0,
      };
      multiplexPersistence.set(node.id, currentPersistence);
    }

    const digitKeys = ["dig1", "dig2", "dig3", "dig4"] as const;
    const segKeys = ["a", "b", "c", "d", "e", "f", "g", "dp"] as const;

    let anyDigitActiveThisTick = false;
    const activeDigitIndices: number[] = [];

    if (isModulePowered) {
      digitKeys.forEach((digKey, idx) => {
        const active = isDigitActive(digKey);
        if (active) {
          anyDigitActiveThisTick = true;
          activeDigitIndices.push(idx);
          const digitObj = currentPersistence!.digits[idx];
          segKeys.forEach((s) => {
            digitObj[s] = isSegActive(s);
          });
        }
      });
    }

    // Only blank persistence if module has lost power or timed out without refresh (>400ms)
    if (!isModulePowered) {
      currentPersistence.digits = emptyDigits();
    } else if (anyDigitActiveThisTick) {
      currentPersistence.lastUpdated = frame.timestamp ?? Date.now();
    } else {
      const now = frame.timestamp ?? Date.now();
      if (now - currentPersistence.lastUpdated > 400) {
        currentPersistence.digits = emptyDigits();
      }
    }

    // Current Calculation via Ohm's Law & Burnt state detection
    let maxCurrentMA = 0;
    let hasResistor = true;

    const sharedRes = pinReadings["gnd"]?.resistorOhms ?? 0;

    activeDigitIndices.forEach((dIdx) => {
      const digKey = digitKeys[dIdx];
      const digRes = (pinReadings[digKey]?.resistorOhms ?? 0) + sharedRes;
      const digSrcVolt =
        pinReadings[digKey]?.sourceVoltage ??
        (pinReadings["vcc"]?.sourceVoltage ?? 0);

      segKeys.forEach((s) => {
        if (currentPersistence!.digits[dIdx][s]) {
          const segRes = pinReadings[s]?.resistorOhms ?? 0;
          const rTotal = digRes + segRes;
          const srcVolt = isCommonAnode ? digSrcVolt : (pinReadings[s]?.sourceVoltage ?? 0);

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
      });
    });

    const burnt = maxCurrentMA > 50.0;
    const hasAnyActiveSegments = currentPersistence.digits.some((d) =>
      Object.values(d).some((v) => v === true),
    );
    const isPowered = isModulePowered && (anyDigitActiveThisTick || hasAnyActiveSegments) && !burnt;

    // Clone raw digits before applying burnt state
    const rawDigitsCopy: [
      DoublePairDigitSegments,
      DoublePairDigitSegments,
      DoublePairDigitSegments,
      DoublePairDigitSegments
    ] = JSON.parse(JSON.stringify(currentPersistence.digits));

    const displayDigits: [
      DoublePairDigitSegments,
      DoublePairDigitSegments,
      DoublePairDigitSegments,
      DoublePairDigitSegments
    ] = burnt ? emptyDigits() : currentPersistence.digits;

    const telemetry: DoublePairTelemetry = {
      digitsState: JSON.stringify(displayDigits),
      rawDigitsState: JSON.stringify(rawDigitsCopy),
      colon: currentPersistence.colon,
      isPowered,
      color,
      displayType,
      hasResistor,
      currentMilliAmps: maxCurrentMA,
      burnt,
      missingPower: !isModulePowered,
    };

    components[node.id] = {
      nodeId: node.id,
      componentType: "doublePair7Segment",
      label: node.data.label || "4-Digit 7-Segment",
      isPowered,
      brightness: isPowered ? 1 : 0,
      voltage: Math.max(0, ...Object.values(pinReadings).map((p) => p.voltage)),
      telemetry,
      pins: componentPins,
    };

    changed = true;
  }

  return changed ? { ...frame, components } : frame;
}
