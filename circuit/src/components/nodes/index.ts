import type { NodeTypes } from '@xyflow/react';
import { ArduinoNode } from './ArduinoNode';
import { RaspberryPiPicoNode } from './RaspberryPiPicoNode';
import { ESP32Node } from './ESP32Node';
import { ImageCircuitNode } from './ImageCircuitNode';
import { FunctionGeneratorNode } from './FunctionGeneratorNode';
import { PowerSupplyNode } from './PowerSupplyNode';
import { PushbuttonNode } from './SwitchNode';
import { ResistorNode } from './ResistorNode';
import { Battery9VNode } from './BatteryNode';
import { LedNode } from './LEDNode';
import { MultimeterNode } from './MultimeterNode';
import { OscilloscopeNode } from './OscilloscopeNode';
import { CapacitorNode } from './CapacitorNode';
import { PotentiometerNode } from './PotentiometerNode';
import { SlideswitchNode } from './SwitchNode';
import { BreadboardNode } from './BreadboardNode';
import { DCMotorNode } from './MotorNode';
import { LCD16x2Node } from './LCD16x2Node';
import { UltrasonicDistanceNode } from './UltrasonicDistance';
import { PirSensorNode } from './Pirsensor';
import { TemperatureSensorNode } from './TemperatureSensor';
import { SoilMoistureNode } from './SoilMoisture';
// import { KeypadNode } from './Keypad';
import { Ne555TimerIC } from './Ne555TimerIC';
import { PolarizedCapacitor } from './PolarisedCapacitor';
import { StickyNoteNode } from './StickyNoteNode';
import { DiodeNode } from './DiodeNode';
import { VibrationMotorNode } from './VibrationMotorNode';
import { PhotoresistorNode } from './PhotoresistorNode';
import { ForceSensorNode } from './ForceSensor';
import { FlexSensorNode } from './FlexSensor';
import { TiltSensorNode } from './TiltSensor';
import { Keypad4x3Node } from './Keypad_4x3';
import { Keypad4x4Node } from './Keypad_4x4';
import { NeopixelNode } from './Neopixel';
import { SevenSegment } from './SevenSegment';
import { DoublePair_7segmentDisplay } from './DoublePair_7segmentDisplay';
import { SpstRelayNode } from './SpstRelay';
import { DpdtRelay } from './DpdtRelay';
import { NpnNode } from './Npn';
import { PnpNode } from './Pnp';
import { IrReceiverNode } from './IrReceiverNode';
import { IRRemoteNode } from './IRRemoteNode';
import { Dht11Node } from './Dht11';
import { Dht22Node } from './Dht22';

export const nodeTypes: NodeTypes = {
  resistor: ResistorNode,
  led: LedNode,
  pushbutton: PushbuttonNode,
  potentiometer: PotentiometerNode,
  capacitor: CapacitorNode,
  slideswitch: SlideswitchNode,
  battery9v: Battery9VNode,
  battery1_5v: ImageCircuitNode,
  coincell: ImageCircuitNode,
  breadboard: BreadboardNode,
  arduino: ArduinoNode,
  vibrationMotor: VibrationMotorNode,
  hobbyGearmotor: DCMotorNode,
  dcmotor: DCMotorNode,
  servo: ImageCircuitNode,
  npn: ImageCircuitNode,
  pnp: PnpNode,
  nmosSignal: ImageCircuitNode,
  pmosSignal: ImageCircuitNode,
  voltageRegulator: ImageCircuitNode,
  ledrgb: ImageCircuitNode,
  diode:DiodeNode,
  photoresistor: PhotoresistorNode,
  ultrasonicDistance: UltrasonicDistanceNode,
  pirSensor: PirSensorNode,
  piezo: ImageCircuitNode,
  polarizedCapacitor:PolarizedCapacitor,
  soilMoisture: SoilMoistureNode,
  temperatureSensor: TemperatureSensorNode,
  multimeter: MultimeterNode,
  oscilloscope: OscilloscopeNode,
  functionGenerator: FunctionGeneratorNode,
  powerSupply: PowerSupplyNode,
  microbit: ImageCircuitNode,
  lcd16x2: LCD16x2Node,
  keypad4x4: Keypad4x4Node,
  keypad4x3: Keypad4x3Node,
  irRemote: IRRemoteNode,
  irReceiver: IrReceiverNode,
  tiltSensor: TiltSensorNode,
  gasSensor: ImageCircuitNode,
  flexSensor: FlexSensorNode,
  forceSensor: ForceSensorNode,
  l293d: ImageCircuitNode,
  attiny: ImageCircuitNode,
  sevenSegment: SevenSegment,
  doublePair7Segment: DoublePair_7segmentDisplay,
  DoublePair_7segmentDisplay: DoublePair_7segmentDisplay,
  neopixel: NeopixelNode,
  relaySpst: SpstRelayNode,
  relayDpdt: DpdtRelay,
  raspberrypipico: RaspberryPiPicoNode,
  esp32: ESP32Node,
  dynamicComponent: ImageCircuitNode,
  dht11: Dht11Node,
  dht22: Dht22Node,
  ne555:Ne555TimerIC,
  stickyNote: StickyNoteNode,
};
