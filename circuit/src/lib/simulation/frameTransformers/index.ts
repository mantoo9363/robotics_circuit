import type { SimulationFrame } from "../../simulation-state";

// Re-export all transformers
export { applyBreadboardInputToFrame } from "./breadboard";
export { applyNe555TimerInputToFrame } from "./ne555";
export { applyPolarizedCapacitorInputToFrame } from "./polarizedCapacitor";
export { applyDiodeInputToFrame } from "./diode";
export { applyLcdInputToFrame } from "./lcd";
export {
  applyServoInputToFrame,
  applyServoSteeringButtonInputToFrame,
  applyServoControllerInputToFrame,
} from "./servo";
export {
  applyTemperatureSensorInputToFrame,
  applySoilMoistureInputToFrame,
} from "./temperatureSoil";
export {
  applyUltrasonicDistanceInputToFrame,
  applyPirSensorInputToFrame,
} from "./ultrasonicPir";
export {
  applyGasSensorInputToFrame,
  applyForceSensorInputToFrame,
} from "./gasForce";
export { applyFlexSensorInputToFrame } from "./flexSensor";
export {
  applyPhotoresistorInputToFrame,
  applyPotentiometerInputToFrame,
} from "./photoresistorPotentiometer";
export {
  applyPushbuttonToggleInputToFrame,
  applyAnalogWriteInputToFrame,
} from "./pushbuttonAnalogWrite";
export {
  applyKeypad4x4InputToFrame,
  applyKeypad4x3InputToFrame,
} from "./keypad";
export { applyCarButtonVisualFallbackToFrame } from "./carButtons";
export {
  applyTimedDigitalWriteInputToFrame,
  applyFunctionGeneratorInputToFrame,
  applyDigitalReadSerialSyncToFrame,
} from "./digitalReadSync";
export { applyL293DCarControlInputToFrame } from "./l293dCarControl";
export { applyL293DFrameTransformer } from "./l293d";
export { applyPicoSimulationToFrame, applyPicoLcdOutputToFrame } from "./pico";
export { applyEsp32SimulationToFrame, applyEsp32LcdOutputToFrame } from "./esp32";
export { applyPnpInputToFrame } from "./pnp";
export { applyMultimeterOutputToFrame } from "./multimeterSync";
export { applyNeoPixelInputToFrame } from "./neoPixel";
export { applyEsp32NeoPixelInputToFrame } from "./esp32Neopixel";
export { applySevenSegmentInputToFrame } from "./sevenSegment";
export {
  applyDoublePair7SegmentInputToFrame,
  resetDoublePair7SegmentState,
} from "./DoublePair_7segmentDisplay";
export { applySpstRelayInputToFrame } from "./spstRelay";
export { applyDpdtRelayInputToFrame } from "./dpdtRelay";
export { applyNpnInputToFrame } from "./npn";
export { applyTiltSensorInputToFrame } from "./tiltSensor";
export { applyIrReceiverInputToFrame } from "./irReceiver";
export { applyDht11InputToFrame } from "./dht11";
export { applyDht22InputToFrame } from "./dht22";

