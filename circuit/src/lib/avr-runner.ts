/**
 * AVR8js Runner — Real ATmega328P simulation in the browser
 * Wraps avr8js CPU with GPIO, timers, and USART peripherals
 */
import {
  avrInstruction,
  AVRTimer,
  CPU,
  timer0Config,
  timer1Config,
  timer2Config,
  AVRIOPort,
  portBConfig,
  portCConfig,
  portDConfig,
  usart0Config,
  AVRUSART,
  PinState as AVRPinState,
  AVRTWI,
  twiConfig,
} from 'avr8js';
import { loadHex } from './intelhex';

const FLASH = 0x8000; // 32KB flash for ATmega328p

export { AVRPinState };

export class AVRRunner {
  readonly program = new Uint16Array(FLASH);
  readonly cpu: CPU;
  readonly timer0: AVRTimer;
  readonly timer1: AVRTimer;
  readonly timer2: AVRTimer;
  readonly portB: AVRIOPort;
  readonly portC: AVRIOPort;
  readonly portD: AVRIOPort;
  readonly usart: AVRUSART;
  readonly twi: AVRTWI;

  /**
   * Optional callback for real analog voltage reads.
   * Called with the ADC channel number (0–5 for A0–A5).
   * Should return voltage in volts (0–5). If null, returns 0.
   */
  onGetAnalogVoltage: ((channel: number) => number) | null = null;

  lastTxTimestamp = 0;
  lastRxTimestamp = 0;

  private stopped = false;
  private scheduledPinEvents: Array<{ cycle: number; pin: number; value: boolean }> = [];
  readonly MHZ = 16e6;

  private externalPinOverrides = new Map<number, boolean>();

  // ── DHT11 one-wire emulator ──────────────────────────────────────────────
  /** Return live {temperature, humidity} from circuit store. null = disabled. */
  onGetDhtValues: (() => { temperature: number; humidity: number }) | null = null;
  /** Arduino digital pin wired to DHT DATA line (default D2). */
  private dhtDataPin = 2;
  /** Tracks OUTPUT→INPUT transition on the DATA pin. */
  private _dhtD2WasOutput = false;
  private _dhtResponsePending = false;

  constructor(hex: string) {
    loadHex(hex, new Uint8Array(this.program.buffer));
    this.cpu = new CPU(this.program);
    this.timer0 = new AVRTimer(this.cpu, timer0Config);
    this.timer1 = new AVRTimer(this.cpu, timer1Config);
    this.timer2 = new AVRTimer(this.cpu, timer2Config);
    this.portB = new AVRIOPort(this.cpu, portBConfig);
    this.portC = new AVRIOPort(this.cpu, portCConfig);
    this.portD = new AVRIOPort(this.cpu, portDConfig);
    this.usart = new AVRUSART(this.cpu, usart0Config, this.MHZ);
    this.twi = new AVRTWI(this.cpu, twiConfig, this.MHZ);

    this.usart.onByteTransmit = (_value: number) => {
      this.lastTxTimestamp = Date.now();
    };

    // Wire up I2C Auto-Ack handler so that lcd.init() does not hang in Wire library loop
    this.twi.eventHandler = {
      start: (repeated: boolean) => this.twi.completeStart(),
      stop: () => this.twi.completeStop(),
      connectToSlave: (address: number, write: boolean) => this.twi.completeConnect(true),
      writeByte: (value: number) => this.twi.completeWrite(true),
      readByte: (ack: boolean) => this.twi.completeRead(0xff),
    };

    // Default all floating input pins to HIGH to prevent false-LOW digitalRead readings
    for (let i = 0; i < 8; i++) {
      this.portB.setPin(i, true);
      this.portC.setPin(i, true);
      this.portD.setPin(i, true);
    }

    // Hook PORT & DDR register writes to automatically pull INPUT_PULLUP pins HIGH in avr8js
    // without overriding explicit external pin LOW signals (e.g. switch to GND)
    const syncPullups = (port: AVRIOPort, ddrAddr: number, portAddr: number, startPin: number) => {
      const ddr = this.cpu.data[ddrAddr];
      const portVal = this.cpu.data[portAddr];
      for (let bit = 0; bit < 8; bit++) {
        const pinNum = startPin + bit;
        const isInput = ((ddr >> bit) & 1) === 0;
        const isPullup = ((portVal >> bit) & 1) === 1;
        if (isInput) {
          if (this.externalPinOverrides.has(pinNum)) {
            port.setPin(bit, this.externalPinOverrides.get(pinNum)!);
          } else if (isPullup) {
            port.setPin(bit, true);
          }
        }
      }
    };

    const hookPortWrite = (port: AVRIOPort, ddrAddr: number, portAddr: number, startPin: number) => {
      this.cpu.writeHooks[portAddr] = (value: number) => {
        this.cpu.data[portAddr] = value;
        syncPullups(port, ddrAddr, portAddr, startPin);
      };
    };

    hookPortWrite(this.portD, 0x2a, 0x2b, 0);
    hookPortWrite(this.portB, 0x24, 0x25, 8);
    hookPortWrite(this.portC, 0x27, 0x28, 14);

    // Simulate ADC (analogRead) — uses onGetAnalogVoltage callback when available.
    // ADMUX low nibble = channel (0=A0 … 5=A5). ADCSRA bit6 = ADSC (start conversion).
    this.cpu.writeHooks[0x7a] = (value: number) => {
      if (value & (1 << 6)) {
        this.cpu.data[0x7a] = value & ~(1 << 6); // clear ADSC
        const channel = this.cpu.data[0x7c] & 0x0f; // ADMUX MUX bits
        let analogValue: number;
        if (this.onGetAnalogVoltage) {
          const voltage = Math.max(0, Math.min(5, this.onGetAnalogVoltage(channel)));
          analogValue = Math.round((voltage / 5) * 1023);
        } else {
          analogValue = 0;
        }
        this.cpu.data[0x78] = analogValue & 0xff;        // ADCL
        this.cpu.data[0x79] = (analogValue >> 8) & 0x3;  // ADCH
        return true;
      }
    };
  }

  /**
   * Get Arduino pin state (0-19, where 14-19 = A0-A5)
   */
  pinState(pin: number): AVRPinState {
    if (pin >= 0 && pin <= 7) return this.portD.pinState(pin);
    if (pin >= 8 && pin <= 13) return this.portB.pinState(pin - 8);
    if (pin >= 14 && pin <= 19) return this.portC.pinState(pin - 14);
    return AVRPinState.Input;
  }

  /**
   * Check if an Arduino digital pin is configured as OUTPUT and driven HIGH.
   * 
   * avr8js's pinState() reads the PIN register, which does not reflect
   * the output latch state. This method reads DDR + PORT registers directly.
   * 
   * ATmega328P register addresses:
   *   PortD (pins 0-7):  DDRD=0x2A, PORTD=0x2B
   *   PortB (pins 8-13): DDRB=0x24, PORTB=0x25
   *   PortC (pins 14-19): DDRC=0x27, PORTC=0x28
   */
  isOutputHigh(pin: number): boolean {
    let ddrAddr: number, portAddr: number, bit: number;
    if (pin >= 0 && pin <= 7) {
      ddrAddr = 0x2a; portAddr = 0x2b; bit = pin;
    } else if (pin >= 8 && pin <= 13) {
      ddrAddr = 0x24; portAddr = 0x25; bit = pin - 8;
    } else if (pin >= 14 && pin <= 19) {
      ddrAddr = 0x27; portAddr = 0x28; bit = pin - 14;
    } else {
      return false;
    }
    const isOutput = (this.cpu.data[ddrAddr] >> bit) & 1;
    const portValue = (this.cpu.data[portAddr] >> bit) & 1;
    return isOutput === 1 && portValue === 1;
  }

  isOutputLow(pin: number): boolean {
    let ddrAddr: number, portAddr: number, bit: number;
    if (pin >= 0 && pin <= 7) {
      ddrAddr = 0x2a; portAddr = 0x2b; bit = pin;
    } else if (pin >= 8 && pin <= 13) {
      ddrAddr = 0x24; portAddr = 0x25; bit = pin - 8;
    } else if (pin >= 14 && pin <= 19) {
      ddrAddr = 0x27; portAddr = 0x28; bit = pin - 14;
    } else {
      return false;
    }
    const isOutput = (this.cpu.data[ddrAddr] >> bit) & 1;
    const portValue = (this.cpu.data[portAddr] >> bit) & 1;
    return isOutput === 1 && portValue === 0;
  }

  /** Reads the active ATmega328P hardware PWM duty value for a PWM-capable pin. */
  getPinPWMValue(pin: number): number | null {
    switch (pin) {
      case 3:
        return ((this.cpu.data[0xb0] >> 4) & 3) !== 0 ? this.cpu.data[0xb4] : null;
      case 5:
        return ((this.cpu.data[0x44] >> 4) & 3) !== 0 ? this.cpu.data[0x48] : null;
      case 6:
        return ((this.cpu.data[0x44] >> 6) & 3) !== 0 ? this.cpu.data[0x47] : null;
      case 9:
        return ((this.cpu.data[0x80] >> 6) & 3) !== 0
          ? (this.cpu.data[0x88] | (this.cpu.data[0x89] << 8)) & 0xff
          : null;
      case 10:
        return ((this.cpu.data[0x80] >> 4) & 3) !== 0
          ? (this.cpu.data[0x8a] | (this.cpu.data[0x8b] << 8)) & 0xff
          : null;
      case 11:
        return ((this.cpu.data[0xb0] >> 6) & 3) !== 0 ? this.cpu.data[0xb3] : null;
      default:
        return null;
    }
  }

  setDigitalPin(pin: number, value: boolean) {
    this.externalPinOverrides.set(pin, value);
    if (pin >= 0 && pin <= 7) {
      this.portD.setPin(pin, value);
      return;
    }
    if (pin >= 8 && pin <= 13) {
      this.portB.setPin(pin - 8, value);
      return;
    }
    if (pin >= 14 && pin <= 19) {
      this.portC.setPin(pin - 14, value);
    }
  }

  scheduleDigitalPulse(pin: number, startCycles: number, durationCycles: number) {
    const start = Math.max(this.cpu.cycles, Math.round(startCycles));
    const duration = Math.max(1, Math.round(durationCycles));
    this.scheduledPinEvents.push(
      { cycle: start, pin, value: true },
      { cycle: start + duration, pin, value: false }
    );
    this.scheduledPinEvents.sort((a, b) => a.cycle - b.cycle);
  }

  private processScheduledPinEvents() {
    while (
      this.scheduledPinEvents.length > 0 &&
      this.scheduledPinEvents[0].cycle <= this.cpu.cycles
    ) {
      const event = this.scheduledPinEvents.shift()!;
      this.setDigitalPin(event.pin, event.value);
    }
    // DHT11 one-wire emulator: poll DDRD every 16 cycles to detect start-pulse release.
    // The DHT library toggles the DATA pin OUTPUT→LOW (start) then releases to INPUT;
    // at that moment we schedule the full 40-bit sensor response.
    if (this.onGetDhtValues) {
      const d2IsOutput = !!((this.cpu.data[0x2a] >> this.dhtDataPin) & 1);
      if (d2IsOutput) {
        // Pin is OUTPUT (sketch driving start pulse) — arm the detector.
        this._dhtD2WasOutput = true;
        this._dhtResponsePending = false;
      } else if (this._dhtD2WasOutput && !this._dhtResponsePending) {
        // Pin just transitioned OUTPUT→INPUT: schedule the DHT11 response.
        this._dhtD2WasOutput = false;
        this._dhtResponsePending = true;
        this.scheduleDht11Response();
      }
    }
  }

  /** Set which Arduino digital pin the DHT DATA wire is connected to (default D2). */
  setDhtDataPin(pin: number): void {
    this.dhtDataPin = pin;
    this._dhtD2WasOutput = false;
    this._dhtResponsePending = false;
  }

  /**
   * Schedule a complete DHT11 40-bit one-wire response on the DATA pin.
   * Protocol: 80µs LOW + 80µs HIGH (ready), then 40 data bits (MSB first).
   * Each bit: 50µs LOW + 26µs HIGH (0-bit) or 70µs HIGH (1-bit).
   * Frame: [HUM_INT, HUM_DEC, TEMP_INT, TEMP_DEC, CHECKSUM].
   */
  private scheduleDht11Response(): void {
    const { temperature, humidity } = this.onGetDhtValues!();
    const tempInt = Math.max(0, Math.min(50, Math.round(temperature)));
    const humInt = Math.max(20, Math.min(90, Math.round(humidity)));
    const data = [humInt, 0, tempInt, 0, (humInt + tempInt) & 0xFF];
    const us = (n: number) => Math.round((this.MHZ / 1_000_000) * n);
    const pin = this.dhtDataPin;
    let t = this.cpu.cycles;

    // Sensor acknowledgment: 80µs LOW + 80µs HIGH
    this.scheduledPinEvents.push({ cycle: t, pin, value: false }); t += us(80);
    this.scheduledPinEvents.push({ cycle: t, pin, value: true }); t += us(80);

    // 40 data bits — MSB first per byte
    for (const byte of data) {
      for (let b = 7; b >= 0; b--) {
        const isOne = (byte >> b) & 1;
        this.scheduledPinEvents.push({ cycle: t, pin, value: false }); t += us(50);
        this.scheduledPinEvents.push({ cycle: t, pin, value: isOne === 1 });
        t += isOne === 1 ? us(70) : us(26);
      }
    }
    // End: 50µs LOW then release HIGH
    this.scheduledPinEvents.push({ cycle: t, pin, value: false }); t += us(50);
    this.scheduledPinEvents.push({ cycle: t, pin, value: true });
    this.scheduledPinEvents.sort((a, b) => a.cycle - b.cycle);
  }

  /**
   * Run the CPU. Calls `callback` approximately every 31ms (500K cycles at 16MHz).
   */
  async execute(callback: () => void, afterInstruction?: () => void) {
    this.stopped = false;
    const cyclesPerFrame = 500000;
    let nextFrameCycle = this.cpu.cycles + cyclesPerFrame;

    let lastTime = Date.now();

    while (!this.stopped) {
      const now = Date.now();
      const elapsedMs = now - lastTime;

      // Target cycles to run based on real-time elapsed
      // At 16MHz (this.MHZ), we need 16000 cycles per millisecond
      const cyclesToRun = Math.round((this.MHZ / 1000) * elapsedMs);

      // Cap simulated time to avoid lag spikes (max 100ms of simulated time at once)
      const maxCyclesToRun = Math.round((this.MHZ / 1000) * 100);
      const targetCycles = this.cpu.cycles + Math.min(cyclesToRun, maxCyclesToRun);

      const startTime = Date.now();
      const batchSize = 10000;

      while (this.cpu.cycles < targetCycles && !this.stopped) {
        const remaining = targetCycles - this.cpu.cycles;
        const currentBatch = Math.min(batchSize, remaining);

        for (let i = 0; i < currentBatch && !this.stopped; i += 1) {
          avrInstruction(this.cpu);
          this.cpu.tick();
          // processScheduledPinEvents: run every 16 cycles (~1µs) — enough for PWM accuracy
          if ((this.cpu.cycles & 15) === 0) {
            this.processScheduledPinEvents();
          }
          // afterInstruction (ultrasonic echo): run every 1600 cycles (~100µs) — ultrasonic pulses are ms-scale
          if ((this.cpu.cycles & 1599) === 0) {
            afterInstruction?.();
          }
        }

        if (this.cpu.cycles >= nextFrameCycle) {
          callback();
          nextFrameCycle = this.cpu.cycles + cyclesPerFrame;
        }

        // Safety timeout: yield if we have been executing synchronously for > 10ms
        if (Date.now() - startTime > 10) {
          break;
        }
      }

      lastTime = now;

      // Yield to host environment's event loop (always use setTimeout to allow UI rendering and network I/O to process)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  }

  sendSerialByte(value: number) {
    this.usart.writeByte(value);
    this.lastRxTimestamp = Date.now();
  }

  sendSerialString(text: string) {
    for (let i = 0; i < text.length; i++) {
      this.usart.writeByte(text.charCodeAt(i));
    }
    this.lastRxTimestamp = Date.now();
  }

  stop() {
    this.stopped = true;
  }
}
