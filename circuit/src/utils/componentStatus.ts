export interface ComponentStatus {
  severity: 'none' | 'warning' | 'error';
  message: string;
  details: string;
  formula?: string;
  safeLimit?: string;
  currentValue?: string;
  educationalInfo?: string;
}

export interface ComponentInfoConfig {
  name: string;
  safeLimitText: string;
  defaultFormula: string;
  educationalInfo: string;
}

export const COMPONENT_INFO_REGISTRY: Record<string, ComponentInfoConfig> = {
  led: {
    name: 'LED',
    safeLimitText: '20.00 mA',
    defaultFormula: 'I = (V_battery - V_f) / R',
    educationalInfo: 'A Light Emitting Diode (LED) is a semiconductor light source that emits light when current flows through it in the forward direction. Exceeding its recommended operating current (typically 20.00 mA) will generate excess heat, degrading the semiconductor material and significantly reducing its lifespan or burning it completely.'
  },
  resistor: {
    name: 'Resistor',
    safeLimitText: '250.00 mW (0.25 W)',
    defaultFormula: 'P = I² * R',
    educationalInfo: 'A resistor limits the flow of electric current in a circuit. It converts electrical energy into heat. If the power dissipation (P) exceeds the resistor\'s physical power rating (typically 0.25 W or 250.00 mW for standard carbon film resistors), the resistor will overheat, which can cause it to burn out or damage surrounding components.'
  },
  battery9v: {
    name: '9V Battery',
    safeLimitText: 'None (Direct short circuit warning)',
    defaultFormula: 'I = V / R (R → 0)',
    educationalInfo: 'A 9V battery acts as a voltage supply. A short circuit occurs when a direct connection with zero resistance is made between the positive and negative terminals. Due to Ohm\'s Law (I = V/R), a resistance close to zero causes the current to spike dramatically, draining the battery instantly, heating it up, and potentially creating a fire hazard.'
  },
  battery1_5v: {
    name: '1.5V Battery',
    safeLimitText: 'None (Direct short circuit warning)',
    defaultFormula: 'I = V / R (R → 0)',
    educationalInfo: 'A 1.5V battery supplies constant DC voltage. Connecting the positive and negative terminals directly without a load causes a short circuit, resulting in high current draw and heat generation.'
  },
  coincell: {
    name: 'Coin Cell 3V',
    safeLimitText: 'None (Direct short circuit warning)',
    defaultFormula: 'I = V / R (R → 0)',
    educationalInfo: 'A CR2032 3V coin cell battery has a high internal resistance compared to other batteries, but a direct short circuit will still drain its capacity quickly and cause internal heating.'
  },
  powerSupply: {
    name: 'Power Supply',
    safeLimitText: 'None (Short circuit warning)',
    defaultFormula: 'I = V / R (R → 0)',
    educationalInfo: 'A power supply converts source power to regulated voltage and current. Short circuiting the output terminals causes high current protection to trigger or damages the internal regulation circuits.'
  },
  polarizedCapacitor: {
    name: 'Polarized Capacitor',
    safeLimitText: 'Rated Voltage (ex. 16.00 V)',
    defaultFormula: 'V_cap > V_rating',
    educationalInfo: 'Electrolytic capacitors are polarized and must be connected with correct polarity. Exceeding their maximum voltage rating leads to dielectric breakdown. This causes leakage current, internal gas expansion, and catastrophic physical rupture or explosion.'
  },
  arduino: {
    name: 'Arduino Uno R3',
    safeLimitText: '5.50 V (Max Supply)',
    defaultFormula: 'V_in > V_max',
    educationalInfo: 'The Arduino Uno operates safely up to a maximum supply voltage of 5.50 V. Feeding higher voltage into its VCC, 5V, or IO pins bypasses the voltage regulator, burning the main microcontroller chip (ATmega328P) permanently.'
  },
  raspberrypipico: {
    name: 'Raspberry Pi Pico',
    safeLimitText: '3.60 V (Max pin voltage)',
    defaultFormula: 'V_in > V_max',
    educationalInfo: 'The Raspberry Pi Pico\'s RP2040 microcontroller operates on 3.3V logic. Applying voltage greater than 3.60 V on any GPIO pin will destroy the input buffer of the pin and can damage the entire chip.'
  },
  pushbutton: {
    name: 'Pushbutton Switch',
    safeLimitText: '50.00 mA',
    defaultFormula: 'Open / Closed switch',
    educationalInfo: 'A pushbutton is a momentary switch that closes a circuit when pressed and returns to its open state when released. Avoid passing current above 50.00 mA through its contacts to prevent carbon deposits.'
  },
  potentiometer: {
    name: 'Potentiometer',
    safeLimitText: '500.00 mW (0.50 W)',
    defaultFormula: 'V_out = V_in * (R2 / R_total)',
    educationalInfo: 'A potentiometer is a variable resistor with a sliding contact. If excessive current flows through the wiper, the resistive track can overheat and degrade, causing inaccurate voltage division.'
  },
  capacitor: {
    name: 'Ceramic Capacitor',
    safeLimitText: 'Rated Voltage (ex. 50.00 V)',
    defaultFormula: 'Q = C * V',
    educationalInfo: 'Ceramic capacitors store charge in an electric field. Operating them above their maximum voltage rating can cause dielectric breakdown, resulting in short circuits.'
  },
  slideswitch: {
    name: 'Slide Switch',
    safeLimitText: '1.00 A',
    defaultFormula: 'SPDT Terminal Connection',
    educationalInfo: 'A slide switch is a single-pole double-throw switch that maintains its state. Exceeding its maximum contact current will cause arcing and welding of the contacts.'
  },
  breadboard: {
    name: 'Breadboard',
    safeLimitText: '1.00 A (Max line current)',
    defaultFormula: 'Contact Resistance (R ≈ 0.05 Ω)',
    educationalInfo: 'Solderless breadboards are designed for prototyping. Passing high currents (greater than 1.00 A) can melt the plastic housing and deform the internal metal spring clips.'
  },
  vibrationMotor: {
    name: 'Vibration Motor',
    safeLimitText: '5.00 V',
    defaultFormula: 'V_motor <= V_max',
    educationalInfo: 'A vibration motor is a DC motor with an unbalanced weight. Operating above 5.00 V causes high centrifugal forces, bearing wear, and winding burn-out.'
  },
  hobbyGearmotor: {
    name: 'Hobby Gearmotor',
    safeLimitText: '9.00 V',
    defaultFormula: 'V_motor <= V_max',
    educationalInfo: 'A yellow DC gearmotor converts electrical energy into high-torque rotation. Exceeding 9.00 V overheats the motor windings and can deform the plastic gears.'
  },
  dcmotor: {
    name: 'DC Motor',
    safeLimitText: '9.00 V',
    defaultFormula: 'V_motor <= V_max',
    educationalInfo: 'Standard DC motors operate using electromagnetic coils. Supplying voltages beyond 9.00 V produces excessive heat, melting the internal coil insulation.'
  },
  servo: {
    name: 'Servo Motor',
    safeLimitText: '6.00 V',
    defaultFormula: 'PWM Control Position',
    educationalInfo: 'Servos contain a DC motor, feedback potentiometer, and control circuit. Higher voltages will fry the internal control board.'
  },
  npn: {
    name: 'NPN Transistor',
    safeLimitText: 'V_be >= 0.70 V (Conduction)',
    defaultFormula: 'I_c = β * I_b',
    educationalInfo: 'NPN transistors conduct when base voltage is 0.70 V higher than emitter. A base resistor is required to prevent thermal runaway.'
  },
  pnp: {
    name: 'PNP Transistor',
    safeLimitText: 'V_eb >= 0.70 V (Conduction)',
    defaultFormula: 'I_c = β * I_b',
    educationalInfo: 'PNP transistors conduct when emitter voltage is 0.70 V higher than base. Current flows out of the base to trigger conduction.'
  },
  nmosSignal: {
    name: 'N-Channel MOSFET',
    safeLimitText: 'V_gs >= 2.00 V (Gate threshold)',
    defaultFormula: 'I_d = k * (V_gs - V_th)²',
    educationalInfo: 'N-MOSFETs act as switches. High voltage on the gate opens the channel. Keep gate voltage below 20V to prevent gate oxide damage.'
  },
  pmosSignal: {
    name: 'P-Channel MOSFET',
    safeLimitText: 'V_sg >= 2.00 V (Gate threshold)',
    defaultFormula: 'I_d = k * (V_sg - V_th)²',
    educationalInfo: 'P-MOSFETs act as switches. Low voltage on the gate opens the channel, allowing current to flow from source to drain.'
  },
  voltageRegulator: {
    name: 'Voltage Regulator 7805',
    safeLimitText: '15.00 V Max Input',
    defaultFormula: 'V_out = 5.00 V',
    educationalInfo: 'Linear regulators drop excess voltage as heat. High input voltage causes thermal shutdown or regulator failure.'
  },
  ledrgb: {
    name: 'RGB LED',
    safeLimitText: '20.00 mA per channel',
    defaultFormula: 'I = (V - V_f) / R',
    educationalInfo: 'An RGB LED combines Red, Green, and Blue diodes in one package. Running any color channel above 20.00 mA will damage the LED.'
  },
  diode: {
    name: 'Diode 1N4007',
    safeLimitText: '1.00 A (Max current)',
    defaultFormula: 'V_f ≈ 0.70 V',
    educationalInfo: 'Diodes allow current to flow in one direction only. Exceeding 1.00 A causes excessive heat dissipation across the PN junction.'
  },
  photoresistor: {
    name: 'Photoresistor (LDR)',
    safeLimitText: '100.00 mW',
    defaultFormula: 'R = f(Light)',
    educationalInfo: 'LDR resistance decreases in bright light. Exceeding its 100.00 mW power limit can burn the cadmium sulfide track.'
  },
  ultrasonicDistance: {
    name: 'Ultrasonic Distance Sensor',
    safeLimitText: '5.00 V',
    defaultFormula: 'Distance = (Time * Speed) / 2',
    educationalInfo: 'Measures distance using acoustic waves. Requires 5.00 V supply. High voltages will destroy the ultrasonic transducer circuit.'
  },
  pirSensor: {
    name: 'PIR Motion Sensor',
    safeLimitText: '5.00 V',
    defaultFormula: 'Passive Infrared Detection',
    educationalInfo: 'Detects motion by measuring infrared changes. Running it beyond 5.00 V will damage the pyroelectric sensor chip.'
  },
  piezo: {
    name: 'Piezo Buzzer',
    safeLimitText: '30.00 V',
    defaultFormula: 'Frequency Oscillations',
    educationalInfo: 'Produces sound via piezoelectric deformation. Applying voltage above 30.00 V can crack the internal ceramic disc.'
  },
  soilMoisture: {
    name: 'Soil Moisture Sensor',
    safeLimitText: '5.00 V',
    defaultFormula: 'Resistive moisture check',
    educationalInfo: 'Measures soil resistance to determine moisture levels. Exceeding 5.00 V accelerates corrosion of the probe terminals.'
  },
  temperatureSensor: {
    name: 'Temperature Sensor TMP36',
    safeLimitText: '5.00 V',
    defaultFormula: 'Temp = (V_out - 0.5) * 100',
    educationalInfo: 'Outputs voltage proportional to temperature. Exceeding supply voltage leads to internal shorting and thermal damage.'
  },
  dht11: {
    name: 'DHT11 Humidity & Temperature Sensor',
    safeLimitText: '5.00 V',
    defaultFormula: 'Digital Single-Wire Signal',
    educationalInfo: 'Outputs calibrated digital signal for temperature and humidity. Requires DATA, VCC (3.3V–5V), and GND connected.'
  },
  dht22: {
    name: 'DHT22 Humidity & Temperature Sensor',
    safeLimitText: '5.00 V',
    defaultFormula: 'Digital Single-Wire Signal',
    educationalInfo: 'Outputs calibrated high-precision digital signal for temperature (-40°C to 80°C) and humidity (0% to 100%). Requires DATA, VCC (3.3V–5V), and GND connected.'
  },
  multimeter: {
    name: 'Multimeter',
    safeLimitText: '10.00 A (Max current measurement)',
    defaultFormula: 'Ohm\'s Law (V = I * R)',
    educationalInfo: 'Measures electrical properties. Attempting to measure current above 10.00 A will blow the internal protection fuse.'
  },
  oscilloscope: {
    name: 'Oscilloscope',
    safeLimitText: '20.00 V (Max Input)',
    defaultFormula: 'Waveform Visualization',
    educationalInfo: 'Visualizes voltage signals over time. Applying input voltages above 20.00 V will overload the analog-to-digital converter.'
  },
  functionGenerator: {
    name: 'Function Generator',
    safeLimitText: '10.00 V',
    defaultFormula: 'Waveform signal output',
    educationalInfo: 'Generates AC signals. Short circuiting the signal generator output will overload its internal driver operational amplifier.'
  },
  microbit: {
    name: 'BBC micro:bit',
    safeLimitText: '3.30 V (Max Supply)',
    defaultFormula: 'Microcontroller logic',
    educationalInfo: 'An educational microcontroller platform. Operating above 3.30 V supply will destroy its onboard sensors and controller.'
  },
  lcd16x2: {
    name: 'LCD 16x2',
    safeLimitText: '5.00 V',
    defaultFormula: 'HD44780 controller logic',
    educationalInfo: 'Alphanumeric display. Exceeding 5.00 V will cause the display segments to fade, overheat, and fail permanently.'
  },
  keypad4x4: {
    name: '4x4 Keypad',
    safeLimitText: '5.00 V',
    defaultFormula: 'Matrix row-column scanning',
    educationalInfo: 'A matrix of 16 switches. High current through its rows can degrade the conductive switch contact points.'
  },
  keypad4x3: {
    name: '4x3 Keypad',
    safeLimitText: '5.00 V',
    defaultFormula: 'Matrix row-column scanning',
    educationalInfo: 'A matrix of 12 switches. Ensure current stays under 10 mA to keep the scanning signal lines clear.'
  },
  irRemote: {
    name: 'IR Remote Control',
    safeLimitText: '3.30 V',
    defaultFormula: 'NEC Protocol transmission',
    educationalInfo: 'Wireless infrared transmitter. Low battery will reduce infrared signal range and cause signal transmission errors.'
  },
  tiltSensor: {
    name: 'Tilt Sensor',
    safeLimitText: '5.00 V',
    defaultFormula: 'Switch activation by angle',
    educationalInfo: 'Uses a conductive ball inside a cylinder. Keep current low to avoid welding the ball to the internal terminals.'
  },
  gasSensor: {
    name: 'Gas Sensor MQ-2',
    safeLimitText: '5.00 V',
    defaultFormula: 'Heating network resistance',
    educationalInfo: 'Contains an internal heater. Operating above 5.00 V will burn out the heating element and make the sensor unresponsive.'
  },
  flexSensor: {
    name: 'Flex Sensor',
    safeLimitText: '100.00 mW',
    defaultFormula: 'R = f(Bend angle)',
    educationalInfo: 'Variable resistor whose resistance increases with bending. Bending it excessively can crack the resistive substrate.'
  },
  forceSensor: {
    name: 'Force Sensor (FSR)',
    safeLimitText: '100.00 mW',
    defaultFormula: 'R = f(Force applied)',
    educationalInfo: 'Resistor whose resistance drops under force. Keep power dissipation below 100.00 mW to avoid melting the plastic sheet.'
  },
  l293d: {
    name: 'L293D Motor Driver',
    safeLimitText: '36.00 V (Motor power)',
    defaultFormula: 'H-Bridge bidirectional drive',
    educationalInfo: 'Dual H-bridge driver. Drawing current above 600 mA per channel causes overheating. An external heatsink is advised.'
  },
  attiny: {
    name: 'ATtiny85 Microcontroller',
    safeLimitText: '5.50 V',
    defaultFormula: 'Microcontroller logic',
    educationalInfo: 'A small AVR microcontroller. Exceeding 5.50 V supply voltage will permanently damage the silicon gate oxide.'
  },
  sevenSegment: {
    name: '7-Segment Display',
    safeLimitText: '20.00 mA per segment',
    defaultFormula: 'LED segments matrix',
    educationalInfo: 'Numeric display made of LEDs. Current limiting resistors are required for each segment to prevent burn-out.'
  },
  doublePair7Segment: {
    name: '4-Digit 7-Segment Display',
    safeLimitText: '20.00 mA per segment',
    defaultFormula: 'Multiplexed LED segment matrix',
    educationalInfo: 'A 4-digit numeric display using time-division multiplexing. Current limiting resistors are required on digit select or segment lines to prevent overcurrent.'
  },
  DoublePair_7segmentDisplay: {
    name: '4-Digit 7-Segment Display',
    safeLimitText: '20.00 mA per segment',
    defaultFormula: 'Multiplexed LED segment matrix',
    educationalInfo: 'A 4-digit numeric display using time-division multiplexing. Current limiting resistors are required on digit select or segment lines to prevent overcurrent.'
  },
  neopixel: {
    name: 'NeoPixel RGB LED',
    safeLimitText: '5.00 V',
    defaultFormula: 'WS2812 Protocol logic',
    educationalInfo: 'Smart addressable RGB LED. Requires 5.00 V supply. Reverse voltage will immediately destroy the internal WS2812 controller.'
  },
  relaySpst: {
    name: 'SPST Relay',
    safeLimitText: '5.00 V (Coil voltage)',
    defaultFormula: 'Electromagnetic Coil Switch',
    educationalInfo: 'Coil draws current to close a contact. Ensure maximum contact current is respected to avoid contact welding.'
  },
  relayDpdt: {
    name: 'DPDT Relay',
    safeLimitText: '5.00 V (Coil voltage)',
    defaultFormula: 'Electromagnetic Coil Switch',
    educationalInfo: 'Double-pole double-throw switch. Keep contact voltage ratings within safe limits to prevent arcing.'
  },
  dynamicComponent: {
    name: 'Dynamic Component',
    safeLimitText: 'Custom defined limit',
    defaultFormula: 'Ohm\'s Law',
    educationalInfo: 'A dynamically configured component from the preset builder. Follow its specific operating guide.'
  },
  ne555: {
    name: 'NE555 Timer IC',
    safeLimitText: '16.00 V',
    defaultFormula: 'RC timing equations',
    educationalInfo: 'Timing IC. Exceeding 16.00 V VCC supply will overload and destroy the internal resistor divider comparator network.'
  },
  stickyNote: {
    name: 'Sticky Note',
    safeLimitText: 'None',
    defaultFormula: 'Text notation',
    educationalInfo: 'A markup sticky note used for writing custom documentation or instructions in the workspace.'
  }
};

/**
 * Format numerical values to exactly 2 decimal places with proper auto-ranged units.
 */
export function formatVal(val: number, type: 'voltage' | 'current' | 'resistance' | 'power'): string {
  const abs = Math.abs(val);
  if (type === 'voltage') {
    return `${val.toFixed(2)} V`;
  }
  if (type === 'current') {
    if (abs < 1e-6) {
      return `${(val * 1e6).toFixed(2)} µA`;
    }
    if (abs < 1e-3) {
      return `${(val * 1e6).toFixed(2)} µA`;
    }
    if (abs < 1) {
      return `${(val * 1000).toFixed(2)} mA`;
    }
    return `${val.toFixed(2)} A`;
  }
  if (type === 'resistance') {
    if (abs < 1000) {
      return `${val.toFixed(2)} Ω`;
    }
    if (abs < 1e6) {
      return `${(val / 1000).toFixed(2)} kΩ`;
    }
    if (abs < 1e9) {
      return `${(val / 1e6).toFixed(2)} MΩ`;
    }
    return `${(val / 1e9).toFixed(2)} GΩ`;
  }
  if (type === 'power') {
    if (abs < 1) {
      return `${(val * 1000).toFixed(2)} mW`;
    }
    return `${val.toFixed(2)} W`;
  }
  return String(val);
}

/**
 * Main rules engine to check component status from telemetry and properties.
 * Returns a warning or error payload if an anomaly is detected.
 * Returns severity 'none' during normal, safe operation.
 */
export function checkComponentStatus(
  componentType: string,
  telemetry: any,
  properties: any
): ComponentStatus {
  const meta = COMPONENT_INFO_REGISTRY[componentType];
  const defaultStatus: ComponentStatus = { severity: 'none', message: '', details: '' };

  if (!telemetry) return defaultStatus;

  if (
    componentType === 'sevenSegment' ||
    componentType === 'doublePair7Segment' ||
    componentType === 'DoublePair_7segmentDisplay'
  ) {
    const isPowered = telemetry.isPowered === true;
    const currentMA = telemetry.currentMilliAmps ?? 0;
    const hasResistor = telemetry.hasResistor !== false;
    const burnt = telemetry.burnt === true;

    if (burnt) {
      return {
        severity: 'error',
        message: '7-Segment Display Damaged',
        details: `The display has been permanently damaged due to excessive current. Current reached: ${currentMA === Infinity ? 'Infinity' : currentMA.toFixed(2) + ' mA'} exceeds Burnt Limit: 50.00 mA. Make sure to use series resistors on segment or common pins.`,
        formula: 'I = (V_source - V_f) / R',
        safeLimit: '50.00 mA',
        currentValue: currentMA === Infinity ? 'Infinity' : `${currentMA.toFixed(2)} mA`,
        educationalInfo: meta?.educationalInfo
      };
    }

    if (isPowered && currentMA > 20.00) {
      return {
        severity: 'warning',
        message: !hasResistor ? 'Missing Current Limiting Resistor' : 'Segment Overcurrent',
        details: !hasResistor
          ? 'The 7-segment display is connected directly without current-limiting series resistors. Operating without resistors can burn out the LED segments.'
          : `Segment is at high risk of damage due to overcurrent. Current: ${currentMA.toFixed(2)} mA exceeds Safe Limit: 20.00 mA.`,
        formula: 'I = (V_source - V_f) / R',
        safeLimit: '20.00 mA',
        currentValue: `${currentMA.toFixed(2)} mA`,
        educationalInfo: meta?.educationalInfo
      };
    }

    if (isPowered) {
      return {
        severity: 'none',
        message: 'Display Active',
        details: 'The 7-segment display is operating normally.',
        formula: meta?.defaultFormula,
        safeLimit: meta?.safeLimitText,
        currentValue: `${currentMA.toFixed(2)} mA`,
        educationalInfo: meta?.educationalInfo
      };
    }

    if (
      (componentType === 'doublePair7Segment' || componentType === 'DoublePair_7segmentDisplay') &&
      telemetry.missingPower
    ) {
      return {
        severity: 'warning',
        message: 'Missing Power Supply',
        details: 'The 4-digit 7-segment display requires both VCC (>1.5V) and GND (<0.8V) connections to operate.',
        formula: 'VCC & GND Connected',
        safeLimit: 'VCC >= 1.5V, GND = 0V',
        currentValue: 'Unpowered',
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 1. LED Rules (Dynamic checking boundaries)
  if (componentType === 'led') {
    const currentMA = telemetry.currentMilliAmps ?? 0;
    const safeLimitMA = 20.00;
    const voltage = telemetry.overloadVoltage ?? telemetry.voltage ?? 0;
    const maxVoltage = telemetry.maxVoltage ?? Number(properties?.voltage?.value ?? properties?.maxVoltage?.value ?? 3);
    const seriesResistance = telemetry.seriesResistance ?? 0;
    const pathBlocked = telemetry.pathBlocked === true;
    const bypassed = telemetry.bypassed === true;
    const anodeConnected = telemetry.anodeConnected === true;
    const cathodeConnected = telemetry.cathodeConnected === true;
    // const kvlViolation = telemetry.kvlViolation === true;
    const invalidVoltageDrop = telemetry.invalidVoltageDrop === true;

    if (telemetry.burnt) {
      const isOvervoltage = seriesResistance === 0 || (currentMA <= 1.0 && voltage > maxVoltage);
      return {
        severity: 'error',
        message: 'LED Damaged',
        details: isOvervoltage
          ? `LED has been damaged due to excessive voltage. Reached: ${formatVal(voltage, 'voltage')} exceeds Max Rating: ${formatVal(maxVoltage, 'voltage')}.`
          : `LED has been damaged due to excessive current. Current: ${currentMA.toFixed(2)} mA exceeds Burnt Limit: 50.00 mA.`,
        formula: isOvervoltage ? 'V_in > V_max' : 'I = (V_battery - V_f) / R',
        safeLimit: isOvervoltage ? formatVal(maxVoltage, 'voltage') : `50.00 mA`,
        currentValue: isOvervoltage ? formatVal(voltage, 'voltage') : `${currentMA.toFixed(2)} mA`,
        educationalInfo: meta?.educationalInfo
      };
    }

    if (bypassed) {
      return {
        severity: 'warning',
        message: 'Short Circuit',
        details: 'LED is short-circuited or bypassed by a direct zero-resistance connection.',
        formula: 'V_anode = V_cathode',
        safeLimit: 'No parallel bypass',
        currentValue: 'Bypassed',
        educationalInfo: meta?.educationalInfo
      };
    }

    // if (kvlViolation) {
    //   return {
    //     severity: 'warning',
    //     message: 'Kirchhoff Voltage Law Violation',
    //     details: 'Kirchhoff\'s Voltage Law (KVL) is violated: the sum of voltage drops in the closed loop does not equal the source supply voltage.',
    //     formula: 'ΣV_loop = V_supply - V_semiconductor - V_resistors = 0',
    //     safeLimit: 'KVL satisfied',
    //     currentValue: 'KVL Violation',
    //     educationalInfo: meta?.educationalInfo
    //   };
    // }

    if (invalidVoltageDrop) {
      return {
        severity: 'warning',
        message: 'Invalid Voltage Drop',
        details: 'The voltage drop across the LED does not match its physical forward voltage characterization.',
        formula: 'V_across = V_anode - V_cathode ≈ V_f',
        safeLimit: 'Forward voltage match',
        currentValue: 'Voltage drop mismatch',
        educationalInfo: meta?.educationalInfo
      };
    }

    if ((anodeConnected && !cathodeConnected) || (!anodeConnected && cathodeConnected)) {
      return {
        severity: 'warning',
        message: 'Floating Node',
        details: 'One of the LED terminals is floating or disconnected. A node must have complete paths to function.',
        formula: 'Floating Terminal',
        safeLimit: 'Both pins connected',
        currentValue: 'Floating Pin',
        educationalInfo: meta?.educationalInfo
      };
    }

    const physicalOpenCircuit = telemetry.physicalOpenCircuit === true;
    const hasPowerSourceInCanvas = telemetry.hasPowerSourceInCanvas === true;
    if (physicalOpenCircuit && (anodeConnected || cathodeConnected)) {
      if (!hasPowerSourceInCanvas) {
        return {
          severity: 'warning',
          message: 'Power Source Not Present',
          details: 'No power source (battery, power supply, or Arduino) is present in the circuit. Add a power source to power the LED.',
          formula: 'I = 0 (No power source)',
          safeLimit: 'Power source connected',
          currentValue: 'No power source',
          educationalInfo: meta?.educationalInfo
        };
      }
      return {
        severity: 'warning',
        message: 'Open Circuit',
        details: 'The circuit forms an open loop. There is no complete path from source to sink.',
        formula: 'I = 0 (Open loop)',
        safeLimit: 'Closed loop path',
        currentValue: 'Open Circuit',
        educationalInfo: meta?.educationalInfo
      };
    }

    const controlledByGpio = telemetry.controlledByGpio === true;
    if (pathBlocked && (anodeConnected || cathodeConnected) && !controlledByGpio && currentMA === 0) {
      return {
        severity: 'warning',
        message: 'Incomplete Circuit / Reverse Bias',
        details: 'The LED is not glowing because either the circuit loop is incomplete (missing a path to positive or negative battery terminals) or the LED is connected backwards (reverse biased).',
        formula: 'I = 0 (Open loop / Reverse biased)',
        safeLimit: 'Correct forward bias connection',
        currentValue: 'Path Blocked',
        educationalInfo: 'An LED requires a complete closed circuit and must be forward biased (anode to positive, cathode to negative) to conduct current. If the loop is broken or the polarity is reversed, no current flows.'
      };
    }

    if (anodeConnected && cathodeConnected && !physicalOpenCircuit && !pathBlocked && !bypassed && !controlledByGpio && currentMA === 0) {
      if (voltage < maxVoltage) {
        return {
          severity: 'warning',
          message: 'Insufficient Voltage',
          details: `LED is not glowing because the source supply voltage (${voltage.toFixed(2)} V) is less than the LED's required forward voltage (${maxVoltage.toFixed(2)} V).`,
          formula: 'V_source < V_forward',
          safeLimit: `>= ${maxVoltage.toFixed(2)} V`,
          currentValue: `${voltage.toFixed(2)} V`,
          educationalInfo: 'A light-emitting diode (LED) requires a minimum voltage (the forward voltage, V_f) to overcome its internal barrier potential and start conducting current. If the supply voltage is below this threshold, no current flows, and the LED remains off.'
        };
      }
    }

    if (currentMA > 30.00) {
      return {
        severity: 'warning',
        message: 'LED Overcurrent',
        details: `LED is at high risk of damage due to overcurrent. Current: ${currentMA.toFixed(2)} mA exceeds Safe Limit: ${safeLimitMA.toFixed(2)} mA.`,
        formula: 'P = I² * R',
        safeLimit: `${safeLimitMA.toFixed(2)} mA`,
        currentValue: `${currentMA.toFixed(2)} mA`,
        educationalInfo: meta?.educationalInfo
      };
    }

    if (currentMA > 20.00) {
      return {
        severity: 'warning',
        message: 'Over Current Warning',
        details: `LED is glowing, but its lifespan may be reduced. Current: ${currentMA.toFixed(2)} mA exceeds Safe Limit: ${safeLimitMA.toFixed(2)} mA (Warning Range: 20-30 mA).`,
        formula: meta?.defaultFormula,
        safeLimit: `${safeLimitMA.toFixed(2)} mA`,
        currentValue: `${currentMA.toFixed(2)} mA`,
        educationalInfo: meta?.educationalInfo
      };
    }

    if (currentMA > 0 && currentMA < 0.2) {
      return {
        severity: 'warning',
        message: 'LED Current Too Low',
        details: `LED current: ${currentMA.toFixed(2)} mA is too low for normal light emission. Recommended range is 10-20 mA.`,
        formula: 'I = V / R',
        safeLimit: '>= 0.20 mA',
        currentValue: `${currentMA.toFixed(2)} mA`,
        educationalInfo: meta?.educationalInfo
      };
    }

    if (currentMA > 0 && seriesResistance === 0) {
      return {
        severity: 'warning',
        message: 'Missing Current Limiting Resistor',
        details: `LED is connected directly without a series resistor. Without a current-limiting resistor, the LED may heat up or degrade over time. Current flowing: ${currentMA.toFixed(2)} mA.`,
        formula: meta?.defaultFormula,
        safeLimit: 'Resistor Connected',
        currentValue: `${currentMA.toFixed(2)} mA`,
        educationalInfo: meta?.educationalInfo
      };
    }

    // Normal operation — LED is glowing, show current info
    if (currentMA > 0) {
      return {
        severity: 'none',
        message: 'LED Working',
        details: `LED is operating normally. Current flowing: ${currentMA.toFixed(2)} mA through the circuit.`,
        formula: meta?.defaultFormula,
        safeLimit: `${safeLimitMA.toFixed(2)} mA`,
        currentValue: `${currentMA.toFixed(2)} mA`,
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 2. Resistor Rules (Power Overload check)
  if (componentType === 'resistor') {
    const powerW = telemetry.power ?? 0;
    const powerMW = telemetry.powerMilliWatts ?? (powerW * 1000);
    const safeLimitMW = 250.00; // 0.25 W

    if (powerMW > safeLimitMW) {
      return {
        severity: 'warning',
        message: 'Resistor Overloaded',
        details: `Power dissipation exceeds the resistor's physical rating. Power: ${powerMW.toFixed(2)} mW exceeds Limit: ${safeLimitMW.toFixed(2)} mW (0.25 W). The resistor will generate excessive heat.`,
        formula: meta?.defaultFormula,
        safeLimit: `${safeLimitMW.toFixed(2)} mW`,
        currentValue: `${powerMW.toFixed(2)} mW`,
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 3. Battery / Power Sources (Short Circuit check)
  if (['battery9v', 'battery1_5v', 'coincell', 'powerSupply'].includes(componentType)) {
    if (telemetry.shortCircuit || telemetry.burnt) {
      return {
        severity: 'error',
        message: 'Short Circuit Detected',
        details: `A direct zero-resistance connection has caused a short circuit. Current is extremely high and battery voltage dropped to 0.00 V.`,
        formula: meta?.defaultFormula ?? 'I = V / R (R → 0)',
        safeLimit: 'Load connected',
        currentValue: 'Short circuit',
        educationalInfo: meta?.educationalInfo
      };
    }
  }

const VOLTAGE_MULTIPLIERS: Record<string, number> = {
  pV: 1e-12,
  nV: 1e-9,
  '\u00B5V': 1e-6,
  uV: 1e-6,
  mV: 1e-3,
  V: 1,
  kV: 1e3,
  MV: 1e6,
  GV: 1e9,
};

  // 4. Polarized Capacitor Rules
  if (componentType === 'polarizedCapacitor') {
    const voltage = Math.abs(telemetry.voltageAcross ?? telemetry.voltage ?? 0);
    const ratingVal = Number(properties?.voltageRating?.value ?? 16);
    const ratingUnit = String(properties?.voltageRating?.unit ?? 'V');
    const rating = ratingVal * (VOLTAGE_MULTIPLIERS[ratingUnit] ?? 1);

    if (voltage > rating) {
      return {
        severity: 'error',
        message: 'Voltage Rating Exceeded',
        details: `Voltage across the capacitor exceeds its maximum rated voltage limit. Voltage: ${formatVal(voltage, 'voltage')} exceeds Rating: ${formatVal(rating, 'voltage')}.`,
        formula: meta?.defaultFormula,
        safeLimit: formatVal(rating, 'voltage'),
        currentValue: formatVal(voltage, 'voltage'),
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 5. RGB LED Rules
  if (componentType === 'ledrgb') {
    if (telemetry.burnt) {
      const maxVoltage = telemetry.maxVoltage ?? Number(properties?.maxVoltage?.value ?? 3);
      const overloadVoltage = telemetry.overloadVoltage ?? telemetry.voltage ?? 0;
      return {
        severity: 'error',
        message: 'RGB LED Damaged',
        details: `RGB LED has been damaged due to excessive voltage. Reached: ${formatVal(overloadVoltage, 'voltage')} exceeds Max Rating: ${formatVal(maxVoltage, 'voltage')}.`,
        formula: 'V_in > V_max',
        safeLimit: formatVal(maxVoltage, 'voltage'),
        currentValue: formatVal(overloadVoltage, 'voltage'),
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 6. Motor Rules
  if (['dcmotor', 'vibrationMotor', 'hobbyGearmotor'].includes(componentType)) {
    const voltage = telemetry.voltage ?? 0;
    const maxVoltage = Number(properties?.maxVoltage?.value ?? (componentType === 'vibrationMotor' ? 5 : 9));
    if (telemetry.burnt || voltage > maxVoltage + 0.5) {
      return {
        severity: 'error',
        message: 'Motor Overloaded/Damaged',
        details: `Motor has been overloaded or damaged. Reached Voltage: ${formatVal(voltage, 'voltage')} exceeds safety limit: ${formatVal(maxVoltage, 'voltage')}.`,
        formula: 'V_motor > V_max',
        safeLimit: formatVal(maxVoltage, 'voltage'),
        currentValue: formatVal(voltage, 'voltage'),
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 7. Arduino / Pico Rules
  if (['arduino', 'raspberrypipico'].includes(componentType)) {
    if (telemetry.burnt) {
      const reachedVoltage = telemetry.maxReachedVoltage ?? telemetry.voltage ?? 0;
      const maxSafeVoltage = telemetry.maxSafeVoltage ?? (componentType === 'arduino' ? 5.50 : 3.60);
      return {
        severity: 'error',
        message: 'Overvoltage Damage',
        details: `Microcontroller board has been damaged due to high voltage. Voltage Reached: ${formatVal(reachedVoltage, 'voltage')} exceeds Safe Limit: ${formatVal(maxSafeVoltage, 'voltage')}.`,
        formula: meta?.defaultFormula,
        safeLimit: formatVal(maxSafeVoltage, 'voltage'),
        currentValue: formatVal(reachedVoltage, 'voltage'),
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 8. LCD 16x2 Rules (Concise I2C validation warning)
  if (componentType === 'lcd16x2') {
    if (telemetry?.error) {
      const isAddressMismatch = telemetry.error.includes("Address Mismatch");
      const isAddressConflict = telemetry.error.includes("Conflict");
      const isArduinoDamaged = telemetry.error.includes("Arduino is Damaged");
      const isPowerMissing = telemetry.error.includes("Power Missing");
      const isBusDisconnected = telemetry.error.includes("Bus Disconnected");

      if (isArduinoDamaged) {
        return {
          severity: 'error',
          message: 'Arduino is Damaged',
          details: 'The microcontroller board is in a damaged/burnt state due to overvoltage or short circuit, cutting off all power and data to the LCD.',
          formula: 'Board State == Burnt',
          safeLimit: 'Arduino Operating Normal',
          currentValue: 'Arduino Damaged',
          educationalInfo: 'A damaged microcontroller stops executing code and shuts down its power rails. All connected peripherals lose power and communication.'
        };
      }

      if (isPowerMissing) {
        return {
          severity: 'warning',
          message: 'Power Missing',
          details: 'The LCD display is missing VCC and/or GND power supply connections.',
          formula: 'VCC & GND Connected',
          safeLimit: '5.00 V supply',
          currentValue: 'No Power',
          educationalInfo: 'An I2C LCD requires a 5V VCC supply and a common ground (GND) return path to power its driver chip and display backlight.'
        };
      }

      if (isBusDisconnected) {
        return {
          severity: 'warning',
          message: 'I2C Bus Disconnected',
          details: 'The I2C data lines (SDA/SCL) are disconnected or miswired.',
          formula: 'SDA & SCL Connected',
          safeLimit: 'Bus Lines Connected',
          currentValue: 'Disconnected',
          educationalInfo: 'I2C communication requires two bidirectional bus lines: Serial Data (SDA) and Serial Clock (SCL). If either is disconnected, the LCD cannot receive commands.'
        };
      }

      return {
        severity: 'error',
        message: isAddressMismatch ? 'I2C Address Mismatch' : isAddressConflict ? 'I2C Address Conflict' : 'I2C Backpack Type Mismatch',
        details: telemetry.error,
        formula: isAddressMismatch ? 'Sketch Address == LCD Address' : isAddressConflict ? 'Address Conflict' : 'Sketch Class == LCD Type',
        safeLimit: isAddressMismatch ? 'Matching I2C Address' : isAddressConflict ? 'No Address Conflict' : 'Matching I2C Backpack Type',
        currentValue: isAddressMismatch ? 'Address Mismatch' : isAddressConflict ? 'Address Conflict' : 'Type Mismatch',
        educationalInfo: isAddressMismatch
          ? 'In I2C communication, the sketch address must match the physical address of the LCD node. Otherwise, the LCD ignores all command packets.'
          : 'I2C LCD backpacks use different driver chips (like PCF8574 or MCP23008). The code must instantiate the correct library class to match the physical backpack chip.'
      };
    }

    if (telemetry?.isPowered === false) {
      return {
        severity: 'warning',
        message: 'Power Missing',
        details: 'The LCD display is missing VCC and/or GND power supply connections.',
        formula: 'VCC & GND Connected',
        safeLimit: '5.00 V supply',
        currentValue: 'No Power',
        educationalInfo: 'An I2C LCD requires a 5V VCC supply and a common ground (GND) return path to power its driver chip and display backlight.'
      };
    }

    if (telemetry?.isSignalOk === false) {
      return {
        severity: 'warning',
        message: 'I2C Bus Disconnected',
        details: 'The I2C data lines (SDA/SCL) are disconnected or miswired.',
        formula: 'SDA & SCL Connected',
        safeLimit: 'Bus Lines Connected',
        currentValue: 'Disconnected',
        educationalInfo: 'I2C communication requires two bidirectional bus lines: Serial Data (SDA) and Serial Clock (SCL). If either is disconnected, the LCD cannot receive commands.'
      };
    }
  }

  // 9. Keypad Rules (Enforce pin warning indicator)
  if (['keypad4x4', 'keypad4x3'].includes(componentType)) {
    if (telemetry?.error === 'Keypad Pins Disconnected') {
      return {
        severity: 'warning',
        message: 'Keypad Pins Disconnected',
        details: 'The keypad matrix row or column pins are disconnected or not wired to the board.',
        formula: 'All Row & Column Pins Connected',
        safeLimit: 'All Pins Wired',
        currentValue: 'Pins Disconnected',
        educationalInfo: 'Keypads use a matrix scanning system. If any row or column wire is disconnected, the microchip cannot read the corresponding keys.'
      };
    }
  }

  // 10. Sensor Rules (Enforce pin warning indicator)
  if (['gasSensor', 'forceSensor', 'flexSensor', 'photoresistor', 'temperatureSensor', 'dht11', 'dht22', 'soilMoisture', 'ultrasonicDistance', 'pirSensor', 'potentiometer'].includes(componentType)) {
    if (telemetry?.error === 'Sensor Pins Disconnected' || telemetry?.isPowered === false || (typeof telemetry?.error === 'string' && (telemetry.error.includes('Disconnected') || telemetry.error.includes('Missing')))) {
      let details = 'One or more required pins of the sensor are disconnected or not wired to the board.';
      let formula = 'VCC, GND & Signal Connected';
      let safeLimit = 'All Pins Connected';
      let educationalInfo = 'Sensors require a complete circuit to function and transmit readings.';

      if (componentType === 'soilMoisture') {
        details = 'One or more pins (VCC, GND, or SIG) of the soil moisture sensor are disconnected. All 3 terminals must be connected to read moisture levels.';
        formula = 'VCC, GND & SIG Connected';
        safeLimit = '3 Pins Connected';
        educationalInfo = 'The soil moisture sensor requires 3 connections: VCC (power), GND (ground return), and SIG (analog signal output) to measure soil resistance changes.';
      } else if (componentType === 'ultrasonicDistance') {
        details = 'One or more pins (VCC, GND, TRIG, or ECHO) of the ultrasonic sensor are disconnected. All 4 terminals must be connected to measure distance.';
        formula = 'VCC, GND, TRIG & ECHO Connected';
        safeLimit = '4 Pins Connected';
        educationalInfo = 'An ultrasonic distance sensor requires 4 connections: VCC and GND for power, TRIG (Trigger input) to initiate ultrasonic sound pulses, and ECHO (Echo output) to receive reflected waves.';
      } else if (componentType === 'gasSensor') {
        details = 'One or more pins (A1, H1, A2, B1, H2, B2) of the gas sensor are disconnected. Ensure heater (H1, H2) and sensor network terminals (A1, A2, B1, B2) are connected.';
        formula = 'Heater & Sensor Network Connected';
        safeLimit = 'A, B & H Terminals Connected';
        educationalInfo = 'The MQ-2 gas sensor uses a heating element (H1, H2) and a resistive gas-sensing mesh (A1, A2, B1, B2). It requires both networks to be wired properly to detect combustible gases.';
      } else if (componentType === 'forceSensor') {
        details = 'One or both terminals of the force sensor are disconnected. Both terminals must be connected to read force/pressure.';
        formula = 'Terminal 1 & Terminal 2 Connected';
        safeLimit = '2 Pins Connected';
        educationalInfo = 'A Force Sensitive Resistor (FSR) has 2 terminals and acts as a variable resistor whose resistance drops under applied force. Both terminals must be connected to form a voltage divider to measure analog changes.';
      } else if (componentType === 'temperatureSensor') {
        details = 'One or more pins (Vs, Vout, or GND) of the temperature sensor are disconnected. All 3 terminals must be connected to output voltage proportional to temperature.';
        formula = 'Vs, GND & Vout Connected';
        safeLimit = '3 Pins Connected';
        educationalInfo = 'The TMP36 temperature sensor requires 3 connections: Vs (voltage supply), GND (ground return), and Vout (analog voltage output representing temperature).';
      } else if (componentType === 'dht11' || componentType === 'dht22') {
        const isDht22 = componentType === 'dht22';
        details = `One or more pins (DATA, VCC, or GND) of the ${isDht22 ? 'DHT22' : 'DHT11'} sensor are disconnected. All 3 terminals must be connected to measure temperature and humidity.`;
        formula = 'DATA, VCC & GND Connected';
        safeLimit = '3 Pins Connected';
        educationalInfo = `The ${isDht22 ? 'DHT22' : 'DHT11'} sensor requires 3 pin connections: VCC (3.3V–5V supply), GND (ground return), and DATA (digital single-bus output).`;
      } else if (componentType === 'photoresistor') {
        details = 'One or both pins of the photoresistor are disconnected. Both pins must be connected to read light intensity.';
        formula = 'Pin 1 & Pin 2 Connected';
        safeLimit = '2 Pins Connected';
        educationalInfo = 'A photoresistor (LDR) is a light-sensitive variable resistor with 2 terminals. Both terminals must be connected to read ambient light level variations.';
      } else if (componentType === 'potentiometer') {
        details = 'One or more pins (Pin 1, Wiper Pin 2, or Pin 3) of the potentiometer are disconnected. All 3 terminals must be connected to function as a voltage divider.';
        formula = 'Pin 1, Wiper (Pin 2) & Pin 3 Connected';
        safeLimit = '3 Pins Connected';
        educationalInfo = 'A potentiometer has 3 pins: Pin 1 and Pin 3 are connected across the voltage supply, while the center Wiper (Pin 2) outputs the variable voltage signal.';
      } else if (componentType === 'pirSensor') {
        details = 'One or more pins (Power, Ground, or Signal) of the PIR sensor are disconnected. All 3 terminals must be connected to detect motion.';
        formula = 'Power, Ground & Signal Connected';
        safeLimit = '3 Pins Connected';
        educationalInfo = 'A Passive Infrared (PIR) motion sensor requires 3 connections: Power (VCC), Ground (GND) return, and a Signal (OUT) pin to send a high/low pulse when motion is detected.';
      }

      return {
        severity: 'warning',
        message: 'Sensor Pins Disconnected',
        details,
        formula,
        safeLimit,
        currentValue: 'Disconnected',
        educationalInfo
      };
    }
  }

  // 11. Servo Rules (Enforce pin warning indicator)
  if (componentType === 'servo') {
    if (telemetry?.error === 'Servo Pins Disconnected' || telemetry?.isPowered === false) {
      return {
        severity: 'warning',
        message: 'Servo Pins Disconnected',
        details: 'The Servo motor power or ground pins are disconnected.',
        formula: 'Power & Ground Connected',
        safeLimit: 'Pins Wired',
        currentValue: 'Disconnected',
        educationalInfo: 'A servo motor requires VCC (power) and GND (ground) connections to drive its internal motor and control board.'
      };
    }
  }


  // 12. Motor Pin Warning (partial connection)
  if (['dcmotor', 'vibrationMotor', 'hobbyGearmotor'].includes(componentType)) {
    const pin1Connected = telemetry.pin1Connected === true;
    const pin2Connected = telemetry.pin2Connected === true;
    if ((pin1Connected && !pin2Connected) || (!pin1Connected && pin2Connected)) {
      return {
        severity: 'warning',
        message: 'Motor Terminal Disconnected',
        details: 'One terminal of the motor is connected but the other is floating. Both terminals must be wired to complete the circuit and spin the motor.',
        formula: 'Terminal 1 & Terminal 2 Connected',
        safeLimit: 'Both terminals wired',
        currentValue: 'Floating Terminal',
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 13. Piezo Pin Warning (partial connection)
  if (componentType === 'piezo') {
    const positiveConnected = telemetry.positiveConnected === true;
    const negativeConnected = telemetry.negativeConnected === true;
    if ((positiveConnected && !negativeConnected) || (!positiveConnected && negativeConnected)) {
      return {
        severity: 'warning',
        message: 'Piezo Pin Disconnected',
        details: 'One terminal of the piezo buzzer is connected but the other is floating. Both the (+) positive and (-) negative pins must be connected for sound output.',
        formula: '(+) & (-) Pins Connected',
        safeLimit: 'Both pins wired',
        currentValue: 'Floating Terminal',
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 14. Polarized Capacitor Pin Warning (partial connection)
  if (componentType === 'polarizedCapacitor') {
    const anodeConnected = telemetry.anodeConnected === true;
    const cathodeConnected = telemetry.cathodeConnected === true;
    if ((anodeConnected && !cathodeConnected) || (!anodeConnected && cathodeConnected)) {
      return {
        severity: 'warning',
        message: 'Capacitor Pin Floating',
        details: 'One terminal of the polarized capacitor is connected but the other is floating. Both the Anode (+) and Cathode (-) pins must be connected.',
        formula: 'Anode (+) & Cathode (-) Connected',
        safeLimit: 'Both pins wired',
        currentValue: 'Floating Terminal',
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 15. Diode Pin Warning (partial connection)
  if (componentType === 'diode') {
    const anodeConnected = telemetry.anodeConnected === true;
    const cathodeConnected = telemetry.cathodeConnected === true;
    if ((anodeConnected && !cathodeConnected) || (!anodeConnected && cathodeConnected)) {
      return {
        severity: 'warning',
        message: 'Diode Pin Floating',
        details: 'One terminal of the diode is connected but the other is floating. Both the Anode and Cathode pins must be connected to form a complete circuit.',
        formula: 'Anode & Cathode Connected',
        safeLimit: 'Both pins wired',
        currentValue: 'Floating Terminal',
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 16. RGB LED Pin Warning (partial connection)
  if (componentType === 'ledrgb') {
    const groundConn = telemetry.groundConnected === true;
    const hasChannel = telemetry.redConnected === true || telemetry.greenConnected === true || telemetry.blueConnected === true;
    if (groundConn && !hasChannel) {
      return {
        severity: 'warning',
        message: 'RGB LED Channel Disconnected',
        details: 'The common Ground (GND) pin is connected but no color channel (Red, Green, or Blue) is wired to the board.',
        formula: 'GND + at least one R/G/B channel',
        safeLimit: 'Ground + min. 1 channel wired',
        currentValue: 'No channel connected',
        educationalInfo: meta?.educationalInfo
      };
    }
    if (!groundConn && hasChannel) {
      return {
        severity: 'warning',
        message: 'RGB LED Ground Disconnected',
        details: 'A color channel (Red/Green/Blue) is connected but the common Ground (GND) pin is not wired. Ground is required for any color to light up.',
        formula: 'GND + at least one R/G/B channel',
        safeLimit: 'Ground + min. 1 channel wired',
        currentValue: 'Ground floating',
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 17. NeoPixel WS2812B Warnings and Errors
  if (componentType === 'neopixel') {
    const errorMsg = telemetry.error;
    if (errorMsg) {
      return {
        severity: 'error',
        message: 'NeoPixel Error',
        details: errorMsg,
        formula: 'WS2812B logical validation',
        safeLimit: '5.00 V VCC + Ground + Connected Signal',
        currentValue: errorMsg,
        educationalInfo: meta?.educationalInfo
      };
    }
    const isPowered = telemetry.isPowered === true;
    if (isPowered) {
      return {
        severity: 'none',
        message: 'LED Working',
        details: `NeoPixel is powered and connected to MCU pin ${telemetry.mcuPin}. Current color: (${telemetry.red}, ${telemetry.green}, ${telemetry.blue})`,
        formula: 'RGB = (R, G, B)',
        safeLimit: '0 - 255 per channel',
        currentValue: `(${telemetry.red}, ${telemetry.green}, ${telemetry.blue})`,
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  // 18. ESP32 Microcontroller Rules
  if (componentType === 'esp32') {
    const hasAdcWarning = Object.keys(telemetry ?? {}).some((k) => k.endsWith('_adc_warning'));
    if (hasAdcWarning) {
      const warningKey = Object.keys(telemetry).find((k) => k.endsWith('_adc_warning'))!;
      const warningMsg = String(telemetry[warningKey]);
      return {
        severity: 'warning',
        message: 'ADC Overvoltage Warning',
        details: warningMsg,
        formula: 'V_in <= 3.30 V',
        safeLimit: '3.30 V max',
        currentValue: warningMsg,
        educationalInfo: 'ESP32 analog pins (ADC) have an absolute maximum input voltage limit of 3.3V. Exceeding 3.3V will clamp the digital reading at 4095 and may damage the internal ADC attenuator.'
      };
    }
  }

  // 19. Tilt Sensor Rules
  if (componentType === 'tiltSensor') {
    const pin1Connected = telemetry.pin1Connected === true;
    const pin2Connected = telemetry.pin2Connected === true;
    if ((pin1Connected && !pin2Connected) || (!pin1Connected && pin2Connected)) {
      return {
        severity: 'warning',
        message: 'Tilt Sensor Terminal Disconnected',
        details: 'One terminal of the tilt sensor is connected but the other is floating. Both terminals must be wired to complete the circuit.',
        formula: 'Terminal 1 & Terminal 2 Connected',
        safeLimit: 'Both terminals wired',
        currentValue: 'Floating Terminal',
        educationalInfo: meta?.educationalInfo
      };
    }
    if (!pin1Connected && !pin2Connected) {
      return {
        severity: 'warning',
        message: 'Tilt Sensor Disconnected',
        details: 'Both terminals of the tilt sensor are disconnected. Connect them to a circuit to detect tilt status.',
        formula: 'Terminal 1 & Terminal 2 Connected',
        safeLimit: 'Both terminals wired',
        currentValue: 'Disconnected',
        educationalInfo: meta?.educationalInfo
      };
    }
    if (pin1Connected && pin2Connected) {
      const stateText = telemetry.contactClosed ? "CLOSED (Active)" : "OPEN (Inactive)";
      return {
        severity: 'none',
        message: 'Tilt Sensor Working',
        details: `Tilt sensor is connected and operating normally. Current state is ${stateText} at angle ${telemetry.angle ?? 0}°.`,
        formula: 'Angle >= 45° -> CLOSED',
        safeLimit: 'Angle: 0° - 90°',
        currentValue: `${telemetry.angle ?? 0}° (${telemetry.contactClosed ? "CLOSED" : "OPEN"})`,
        educationalInfo: meta?.educationalInfo
      };
    }
  }

  return defaultStatus;
}
