import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../../circuit/graph";
import { frameBoardPinsToArduinoPins, upsertPinState } from "../../circuit/pinMapping";
import { buildSimulationFrame, TILT_THRESHOLD } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { SimulatorState } from "../../arduino-simulator";
import { parsePythonReadOutputsForInput } from "../../codeParsing/picoParser";
import { parseDigitalReadOutputsForInput, checkPinIsConnected } from "../../codeParsing/arduinoParser";

export function applyTiltSensorInputToFrame(frame: SimulationFrame): SimulationFrame {
  if ((frame.boardType !== "arduino" && frame.boardType !== "pico") || !frame.running) return frame;

  const { nodes, edges, arduinoCode, picoCode } = useCircuitStore.getState();
  const tiltNodes = nodes.filter(
    (node: CircuitNode) => getNodeSimulationModel(node) === "tiltSensor"
  );
  if (tiltNodes.length === 0) return frame;

  // Evaluate each tilt sensor node present in the canvas
  const tiltComponents: Record<string, any> = {};
  const pins = frameBoardPinsToArduinoPins(frame);
  const mcuNode = nodes.find(
    (node: CircuitNode) =>
      getNodeSimulationModel(node) === "arduino" ||
      getNodeSimulationModel(node) === "raspberrypipico",
  );

  let updatedPins = false;
  let nextFrame = frame;

  for (const poweredTiltNode of tiltNodes) {
    const pin1Connected = checkPinIsConnected(poweredTiltNode.id, "pin1", nodes, edges);
    const pin2Connected = checkPinIsConnected(poweredTiltNode.id, "pin2", nodes, edges);
    const fullyConnected = pin1Connected && pin2Connected;
    const error = fullyConnected ? "" : "Tilt Sensor Terminal Disconnected";

    if (!fullyConnected) {
      tiltComponents[poweredTiltNode.id] = {
        ...(frame.components[poweredTiltNode.id] ?? {
          nodeId: poweredTiltNode.id,
          componentType: poweredTiltNode.data.componentType,
          label: poweredTiltNode.data.label,
          isPowered: false,
          brightness: 0,
          voltage: 0,
          pins: {},
          telemetry: {},
        }),
        isPowered: false,
        telemetry: {
          ...(frame.components[poweredTiltNode.id]?.telemetry ?? {}),
          angle: Number(poweredTiltNode.data.properties?.angle?.value ?? 0),
          contactClosed: false,
          tilted: false,
          pin1Connected,
          pin2Connected,
          fullyConnected: false,
          error,
        },
      };
      continue;
    }

    if (!mcuNode) continue;

    const isPico = getNodeSimulationModel(mcuNode) === "raspberrypipico";
    const codeToParse = isPico ? picoCode : arduinoCode;

    // Build conductive graph to trace through breadboards, wires, etc.
    const condGraph = buildConductiveGraphForStore(nodes, edges, { includeResistors: true });
    const reachable1 = getReachableGraphNodes(condGraph, `${poweredTiltNode.id}:pin1`);
    const reachable2 = getReachableGraphNodes(condGraph, `${poweredTiltNode.id}:pin2`);

    let signalPin: number | null = null;
    const boardPrefix = isPico ? "gp" : "d";

    // Find MCU board pin in the reachable graph nodes of both terminals
    for (const key of Array.from(reachable1).concat(Array.from(reachable2))) {
      const [nodeId, handle] = key.split(":");
      if (nodeId === mcuNode.id) {
        const match = handle.match(new RegExp(`^${boardPrefix}(\\d+)$`, "i"));
        if (match) {
          signalPin = Number(match[1]);
          break;
        }
      }
    }

    if (signalPin === null) continue;

    const angle = Number(poweredTiltNode.data.properties?.angle?.value ?? 0);
    const contactClosed = angle >= TILT_THRESHOLD;
    const tilted = contactClosed;

    // Tilt sensor behaves as a continuous switch: contact closed (tilted >= threshold)
    // pulls signal pin to GND (isHigh = false); open contact leaves signal HIGH (isHigh = true).
    const isHigh = !contactClosed;

    pins.set(signalPin, {
      mode: pins.get(signalPin)?.mode ?? "INPUT",
      value: isHigh ? 255 : 0,
    });
    updatedPins = true;

    // Parse code execution outputs based on the digital read state of the tilt pin
    const parsedOutputs = isPico
      ? parsePythonReadOutputsForInput(
        codeToParse,
        signalPin,
        isHigh,
        frame.timestamp,
      )
      : parseDigitalReadOutputsForInput(
        codeToParse,
        signalPin,
        isHigh,
        frame.timestamp,
      );

    const outputs = [...(parsedOutputs?.outputs ?? [])];
    for (const output of outputs) {
      upsertPinState(pins, output.pin, output.high);
      updatedPins = true;
    }

    // Handle Serial outputs for tilt sensor readings (e.g. Tilt: 1/0)
    const desiredTiltLine = tilted ? "Tilt Detected" : "Normal State";
    let replacedTiltLine = false;

    const normalizedSerialOutput = frame.serialOutput.map((line: string) => {
      const clean = line.trim();
      if (clean.startsWith("Tilt:")) {
        replacedTiltLine = true;
        return `Tilt: ${tilted ? 1 : 0}`;
      }
      if (/Tilt/i.test(line)) {
        replacedTiltLine = true;
        return line;
      }
      return line;
    });

    const hasSerialPrint = codeToParse.includes(
      isPico ? "print" : "Serial.print",
    );

    if (!hasSerialPrint) {
      if (!replacedTiltLine && (codeToParse.includes("Tilt") || codeToParse.includes("tilt"))) {
        normalizedSerialOutput.push(desiredTiltLine);
      }
    }

    tiltComponents[poweredTiltNode.id] = {
      ...(frame.components[poweredTiltNode.id] ?? {
        nodeId: poweredTiltNode.id,
        componentType: poweredTiltNode.data.componentType,
        label: poweredTiltNode.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 5.0,
        pins: {},
        telemetry: {},
      }),
      isPowered: true,
      voltage: tilted ? 5.0 : 0.0,
      telemetry: {
        ...(frame.components[poweredTiltNode.id]?.telemetry ?? {}),
        angle,
        contactClosed,
        tilted,
        pin1Connected: true,
        pin2Connected: true,
        fullyConnected: true,
        error: "",
      },
    };
    const serialOutputChanged =
      normalizedSerialOutput.length !== frame.serialOutput.length ||
      normalizedSerialOutput.some((line, idx) => line !== frame.serialOutput[idx]);

    if (serialOutputChanged) {
      nextFrame = {
        ...nextFrame,
        serialOutput: normalizedSerialOutput.slice(-100),
      };
    }
  }

  if (updatedPins) {
    const arduinoState: SimulatorState = {
      pins,
      serialOutput: nextFrame.serialOutput,
      running: frame.running,
      error: frame.error,
    };

    nextFrame = buildSimulationFrame({
      tick: frame.tick,
      nodes,
      edges,
      dynamicComponents: useDynamicComponentsStore.getState().components,
      boardType: frame.boardType,
      arduinoState,
      running: frame.running,
      error: frame.error,
    });
  }

  const preservedComponents: Record<string, any> = {};
  for (const [id, comp] of Object.entries(frame.components)) {
    if (comp.componentType === "lcd16x2" && comp.telemetry?.line1 !== undefined) {
      preservedComponents[id] = comp;
    }
  }

  return { ...nextFrame, components: { ...nextFrame.components, ...preservedComponents, ...tiltComponents } };
}
