import type { CircuitNode, ComponentDefinition } from "../../types";
import type { NormalizedBoardPin, SimulationComponentState } from "../../simulation-state";
import { findPinId, endpointKey, PIN_ALIASES, getSourceLabel } from "../../simulation-state";
import { measureProbePair } from "../probes/probeUtils";
import {
  validateMultimeterConnection,
  measurePassiveResistance,
  measurePassiveDiode,
  measureCircuitAcrossProbes,
} from "./multimeterSolver";

export interface MultimeterEvalContext {
  node: CircuitNode;
  nodes: CircuitNode[];
  dynamicComponents?: ComponentDefinition[];
  directSourceReach: Map<string, NormalizedBoardPin[]>;
  directSinkReach: Set<string>;
  directGraph: Map<string, Set<string>>;
  signalGraph: Map<string, Set<string>>;
  completeGraph: Map<string, Set<string>>;
  sources: NormalizedBoardPin[];
  sinks: NormalizedBoardPin[];
  running: boolean;
  componentState: SimulationComponentState;
}

export function evaluateMultimeterComponentState(ctx: MultimeterEvalContext): void {
  const {
    node,
    nodes,
    dynamicComponents,
    directSourceReach,
    directSinkReach,
    directGraph,
    signalGraph,
    completeGraph,
    sources,
    sinks,
    running,
    componentState,
  } = ctx;

  const positivePin = findPinId(node, dynamicComponents, [
    "positive",
    ...PIN_ALIASES.positive,
  ]);
  const negativePin = findPinId(node, dynamicComponents, [
    "negative",
    ...PIN_ALIASES.negative,
  ]);
  const positiveKey = endpointKey(node.id, positivePin);
  const negativeKey = endpointKey(node.id, negativePin);
  const measurement = measureProbePair({
    positiveKey,
    negativeKey,
    sourceReach: directSourceReach,
    sinkReach: directSinkReach,
    signalGraph,
    sources,
    sinks,
    nodes,
    dynamicComponents,
  });
  const rawMode = String(node.data.properties?.mode?.value ?? "voltage");
  const mode =
    rawMode === "voltage_ac"
      ? "voltage"
      : rawMode === "current_ac"
        ? "current"
        : rawMode;
  const passiveMeasurement =
    mode === "current" ||
    mode === "resistance" ||
    mode === "continuity" ||
    mode === "diode"
      ? measurePassiveResistance({
          positiveKey,
          negativeKey,
          graph: directGraph,
          nodes,
          dynamicComponents,
        })
      : { resistance: undefined, connected: false };
  const diodeMeasurement =
    mode === "diode"
      ? measurePassiveDiode({
          positiveKey,
          negativeKey,
          graph: directGraph,
          nodes,
          dynamicComponents,
        })
      : { diodeValue: undefined, connected: false };
  const circuitMeasurement =
    mode === "voltage" || mode === "current"
      ? measureCircuitAcrossProbes({
          positiveKey,
          negativeKey,
          graph: signalGraph,
          nodes,
          dynamicComponents,
          sources,
          sinks,
        })
      : { voltage: undefined, current: undefined, connected: false };
  const hasSignal =
    Boolean(measurement.source) ||
    measurement.positive.grounded ||
    measurement.negative.grounded;
  const isPassiveMode =
    mode === "resistance" || mode === "continuity" || mode === "diode";
  const connectionType = validateMultimeterConnection({
    positiveKey,
    negativeKey,
    directGraph,
    signalGraph,
    nodes,
    dynamicComponents,
    sources,
    sinks,
  });

  let multimeterError: string | undefined = undefined;
  if (mode === "current") {
    if (connectionType === "parallel") {
      multimeterError = "Err: Parallel";
    }
  } else if (mode === "voltage") {
    if (connectionType === "series") {
      multimeterError = "Err: Series";
    }
  }

  const measuredCurrent =
    mode === "current" &&
    !multimeterError &&
    typeof circuitMeasurement.current === "number"
      ? circuitMeasurement.current
      : mode === "current" &&
          !multimeterError &&
          typeof passiveMeasurement.resistance === "number" &&
          passiveMeasurement.resistance > 0
        ? measurement.voltage / passiveMeasurement.resistance
        : 0;
  const measuredVoltage =
    mode === "voltage" &&
    !multimeterError &&
    typeof circuitMeasurement.voltage === "number"
      ? circuitMeasurement.voltage
      : measurement.voltage;
  const hasReading =
    hasSignal ||
    isPassiveMode ||
    passiveMeasurement.connected ||
    diodeMeasurement.connected ||
    circuitMeasurement.connected;

  const componentStateTelemetry: Record<string, number | string | boolean> =
    {
      mode,
      voltage: Number(measuredVoltage.toFixed(3)),
      displayVoltage: Number(measuredVoltage.toFixed(2)),
      current: Number(measuredCurrent.toPrecision(6)),
      isOverloaded: Math.abs(measuredCurrent) > 10,
      ...(multimeterError ? { error: multimeterError } : {}),
    };

  if (
    circuitMeasurement.connected &&
    "sourceVoltage" in circuitMeasurement
  ) {
    componentStateTelemetry.circuitSourceVoltage = Number(
      circuitMeasurement.sourceVoltage.toFixed(3),
    );
    componentStateTelemetry.circuitTotalResistance = Number(
      circuitMeasurement.totalResistance.toFixed(3),
    );
    componentStateTelemetry.circuitVoltageDrop = Number(
      circuitMeasurement.totalVoltageDrop.toFixed(3),
    );
    componentStateTelemetry.measuredResistance = Number(
      circuitMeasurement.measuredResistance.toFixed(3),
    );
    componentStateTelemetry.measuredVoltageDrop = Number(
      circuitMeasurement.measuredVoltageDrop.toFixed(3),
    );
    componentStateTelemetry.formula =
      mode === "current" ? "I=(Vs-Vdrop)/Rtotal" : "V=I*Rsegment+Vdrop";
  }

  componentState.isPowered = running && hasReading;
  componentState.brightness = running && hasReading ? 1 : 0;
  componentState.voltage = measuredVoltage;
  componentState.telemetry = {
    ...componentStateTelemetry,
    ...(typeof passiveMeasurement.resistance === "number"
      ? {
          resistance: passiveMeasurement.resistance,
          continuityActive: passiveMeasurement.resistance < 50,
        }
      : {
          continuityActive: false,
        }),
    ...(typeof diodeMeasurement.diodeValue === "number"
      ? {
          diodeValue: diodeMeasurement.diodeValue,
        }
      : {}),
    positiveVoltage: Number(measurement.positive.voltage.toFixed(3)),
    negativeVoltage: Number(measurement.negative.voltage.toFixed(3)),
    positiveGroundConnected: measurement.positive.grounded,
    negativeGroundConnected: measurement.negative.grounded,
    source: getSourceLabel(measurement.source),
  };
  componentState.pins = {
    [positivePin]: {
      handleId: positivePin,
      voltage: measurement.positive.voltage,
      normalizedValue: measurement.positive.normalizedValue,
      active:
        Boolean(measurement.positive.source) ||
        measurement.positive.grounded,
    },
    [negativePin]: {
      handleId: negativePin,
      voltage: measurement.negative.voltage,
      normalizedValue: measurement.negative.normalizedValue,
      active:
        Boolean(measurement.negative.source) ||
        measurement.negative.grounded,
    },
  };
}
