import type { SimulationFrame } from "../simulation-state";
import type { SimContext, FrameTransformer } from "./types";
import { NE555StateManager, CapacitorStateManager, KeypadStateManager } from "./stateMaps";

import {
  applyBreadboardInputToFrame,
  applyNe555TimerInputToFrame,
  applyPolarizedCapacitorInputToFrame,
  applyDiodeInputToFrame,
  applyLcdInputToFrame,
  applyServoInputToFrame,
  applyServoSteeringButtonInputToFrame,
  applyCarButtonVisualFallbackToFrame,
  applyServoControllerInputToFrame,
  applyGasSensorInputToFrame,
  applyForceSensorInputToFrame,
  applyFlexSensorInputToFrame,
  applyTemperatureSensorInputToFrame,
  applySoilMoistureInputToFrame,
  applyUltrasonicDistanceInputToFrame,
  applyPirSensorInputToFrame,
  applyAnalogWriteInputToFrame,
  applyPushbuttonToggleInputToFrame,
  applyKeypad4x4InputToFrame,
  applyKeypad4x3InputToFrame,
  applyPhotoresistorInputToFrame,
  applyPotentiometerInputToFrame,
  applyL293DCarControlInputToFrame,
  applyL293DFrameTransformer,
  applyTimedDigitalWriteInputToFrame,
  applyFunctionGeneratorInputToFrame,
  applyDigitalReadSerialSyncToFrame,
  applyPicoSimulationToFrame,
  applyPicoLcdOutputToFrame,
  applyEsp32SimulationToFrame,
  applyEsp32LcdOutputToFrame,
  applyEsp32NeoPixelInputToFrame,
  applyPnpInputToFrame,
  applyMultimeterOutputToFrame,
  applyNeoPixelInputToFrame,
  applySevenSegmentInputToFrame,
  applyDoublePair7SegmentInputToFrame,
  applySpstRelayInputToFrame,
  applyDpdtRelayInputToFrame,
  applyNpnInputToFrame,
  applyTiltSensorInputToFrame,
  applyIrReceiverInputToFrame,
  applyDht11InputToFrame,
  applyDht22InputToFrame,
} from "./frameTransformers";

const ne555State = new NE555StateManager();
const capacitorState = new CapacitorStateManager();
const keypad4x4State = new KeypadStateManager();
const keypad4x3State = new KeypadStateManager();

var _circuitStore: any = null;
var _dynamicComponentsStore: any = null;

export function __setStores(circuitStore: any, dynamicComponentsStore: any) {
  _circuitStore = circuitStore;
  _dynamicComponentsStore = dynamicComponentsStore;
}

const transformers: FrameTransformer[] = [
  applyPicoSimulationToFrame,
  applyEsp32SimulationToFrame,
  applyBreadboardInputToFrame,
  applyNe555TimerInputToFrame,
  applyPolarizedCapacitorInputToFrame,
  applySpstRelayInputToFrame,
  applyDiodeInputToFrame,
  applyDpdtRelayInputToFrame,
  applyNpnInputToFrame,
  applyPnpInputToFrame,
  applyServoInputToFrame,
  applyServoSteeringButtonInputToFrame,
  applyCarButtonVisualFallbackToFrame,
  applyServoControllerInputToFrame,
  applyGasSensorInputToFrame,
  applyForceSensorInputToFrame,
  applyFlexSensorInputToFrame,
  applyTemperatureSensorInputToFrame,
  applySoilMoistureInputToFrame,
  applyUltrasonicDistanceInputToFrame,
  applyPirSensorInputToFrame,
  applyTiltSensorInputToFrame,
  applyDht11InputToFrame,
  applyDht22InputToFrame,
  applyAnalogWriteInputToFrame,
  applyPushbuttonToggleInputToFrame,
  applyKeypad4x4InputToFrame,
  applyKeypad4x3InputToFrame,
  applyPhotoresistorInputToFrame,
  applyPotentiometerInputToFrame,
  applyL293DCarControlInputToFrame,
  applyL293DFrameTransformer,
  applyTimedDigitalWriteInputToFrame,
  applyFunctionGeneratorInputToFrame,
  applyLcdInputToFrame,
  applySevenSegmentInputToFrame,
  applyDoublePair7SegmentInputToFrame,
  applyDigitalReadSerialSyncToFrame,
  applyPicoLcdOutputToFrame,
  applyEsp32LcdOutputToFrame,
  applyEsp32NeoPixelInputToFrame,
  applyMultimeterOutputToFrame,
  applyNeoPixelInputToFrame,
  applyIrReceiverInputToFrame,
];

export function applyFramePipeline(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  return transformers.reduce((acc, transformer) => {
    return transformer(acc, context);
  }, frame);
}

export function applyFramePipelineLegacy(
  frame: SimulationFrame,
): SimulationFrame {
  const store = _circuitStore;
  if (!store) return frame;
  const { nodes, edges, arduinoCode, picoCode } = store.getState();
  const dynamicComponents = _dynamicComponentsStore
    ? _dynamicComponentsStore.getState().components
    : {};

  const context: SimContext = {
    nodes,
    edges,
    arduinoCode,
    picoCode,
    dynamicComponents,
    boardType: frame.boardType,
    ne555State,
    capacitorState,
    keypad4x4State,
    keypad4x3State,
  };


  return applyFramePipeline(frame, context);
}


