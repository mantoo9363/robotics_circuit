# ESP32 Circuit Simulation Architecture & Status

This document provides a comprehensive reference for the ESP32 integration within the circuit simulation studio. It details completed capabilities, pipeline architecture, shared code reuse, resolved cross-cutting fixes, backlog, and instructions for continuing development.

---

## 1. Overview

* **Approach**: ESP32 support is implemented via a **pattern-based AST parser & frame transformer** ("fake interpreter") for MicroPython source code. It translates actions into normalized canvas component states (`3.3V` logic levels, PWM duty cycles, ADC sampling, I2C telemetry, matrix keypads, ultrasonic distance sensing).
* **Execution Model**: Operating at the signal & telemetry layer.
* **Scope & Language**: MicroPython primary, with **C++ (Arduino-style) Phase 1 & 2 Foundation** active (supporting `setup()`/`loop()`, `pinMode`, `digitalWrite`, `digitalRead`, `analogWrite`, `analogRead`, and conditionals). Advanced C++ engine features (Serial monitor, complex libraries) remain pending in Phase 3+.

---

## 2. Architecture & Pipeline

### Pipeline Dataflow
```
[Blockly / CodeEditor]
         │ (MicroPython source code)
         ▼
[languageUtils.ts]
   - Smart Auto-Detection: routes MicroPython vs. literal C++ stub
         │
         ▼
[esp32/parser/* & codeParsing/*]
   - pythonPatterns.ts / picoParser.ts (MicroPython AST & Conditionals)
   - ultrasonicPir.ts (reused shared HC-SR04 pulse calculator)
         │
         ▼
[Normalized Action Contract]
   - { type: "gpio_write", pin: 2, value: 1 }
   - { type: "gpio_read", pin: 4, pull: "up" }
   - { type: "pwm_write", pin: 15, dutyPercent: 50, dutyU16: 32768, freqHz: 1000 }
   - { type: "adc_read", pin: 34, resolution: "12bit" }
   - { type: "keypad_scan", keys: ["5"] }
   - { type: "ultrasonic_read", distanceCm: 104 }
         │
         ▼
[frameTransformers/esp32.ts & frameTransformers/ultrasonicPir.ts / keypad.ts]
   - Maps normalized actions into SimulationFrame component states
   - Evaluates input pin voltages & conditional logic (if/else)
   - Dispatches power & signals to connected loads via stateMaps.ts
         │
         ▼
[Canvas Components & UI Telemetry]
```

### Key Shared-Reuse Points
To maintain platform parity and avoid code fragmentation, ESP32 reuses core abstractions across the simulator:

1. **MicroPython Tokenizer / Parser / Interpreter (`picoParser.ts`)**:
   * *Why Reused*: Board-agnostic MicroPython syntax processing (expressions, conditionals, variable scopes). Reused directly by `evaluateEsp32PythonConditionals` to handle dynamic `if/else` execution paths.
2. **16x2 I2C LCD Node & Transformer (`LCD16x2Node.tsx` & `picoLcdOutputToFrame`)**:
   * *Why Reused*: 100% generic display renderer. Reads `telemetry.line1` and `telemetry.line2` regardless of which microcontroller board drives the I2C bus.
3. **HC-SR04 Ultrasonic Distance Sensor (`frameTransformers/ultrasonicPir.ts`)**:
   * *Why Reused*: Board-agnostic pulse calculation & telemetry renderer. Extended to support ESP32.
4. **4x4 / 4x3 Matrix Keypad (`frameTransformers/keypad.ts`)**:
   * *Why Reused*: Board-agnostic matrix row/column scanning and AST keypress evaluation. Extended to support ESP32 GPIO pin definitions.
5. **Conductive Graph & Live Voltage Resolution (`voltageUtils.ts` -> `collectCircuitSourcesAndSinks`)**:
   * *Why Reused*: Single source of truth for circuit voltage propagation, shared between multimeter measurements, potentiometer wiper dividers, and ESP32 ADC reads.
6. **Endpoint Load Propagator (`stateMaps.ts` -> `applyDrivenLoadsFromEndpoint`)**:
   * *Why Reused*: Drives LEDs, active buzzers, RGB LEDs, DC motors, and relays from any board's output pin handle without needing board-specific component drivers.

---

## 3. What's Complete (Phase-by-Phase)

### Phase 1: Core Foundation & Board Adapter
* **Features**: ESP32 board catalog, 40-pin layout (`GPIO0-39`), SPI flash forbidden pin guard (`GPIO6-11`), node metadata.
* **Test Files**:
  * `src/__tests__/esp32BoardAdapter.test.ts`
  * `src/__tests__/esp32BoardDetection.test.ts`

### Phase 2: Digital I/O, Conditional Logic & PWM
* **Features**: Digital outputs (`Pin.OUT`), digital inputs (`Pin.IN`, `Pin.PULL_UP`), AST conditional evaluation (`if/else`), PWM duty cycles for LED brightness and Servo motor pulse-width positioning (`0–180°`).
* **Test Files**:
  * `src/__tests__/esp32PythonGpioParser.test.ts`
  * `src/__tests__/esp32GpioFrameTransformer.test.ts`
  * `src/__tests__/esp32GpioEndToEnd.test.ts`
  * `src/__tests__/esp32PythonGpioInputParser.test.ts`
  * `src/__tests__/esp32GpioInputFrameTransformer.test.ts`
  * `src/__tests__/esp32GpioInputEndToEnd.test.ts`
  * `src/__tests__/esp32ConditionalLogic.test.ts`
  * `src/__tests__/esp32PythonPwmParser.test.ts`
  * `src/__tests__/esp32PwmFrameTransformer.test.ts`
  * `src/__tests__/esp32PwmEndToEnd.test.ts`
  * `src/__tests__/esp32ServoPwm.test.ts`

### Phase 3: ADC (Analog-to-Digital Converter)
* **Features**: 12-bit (`0–4095`), 16-bit (`read_u16`, `0–65535`), and microvolt (`read_uv`) readings. Integrated with voltage divider math & 3.6V overvoltage telemetry warnings.
* **Test Files**:
  * `src/__tests__/esp32Adc.test.ts`

### Phase 4: I2C & LCD Display Integration
* **Features**: `SoftI2C` / `I2C` scanning, HD44780 initialization commands, `lcd.putstr()` parsing, dynamic telemetry updates.
* **Test Files**:
  * `src/__tests__/esp32I2cLcdParser.test.ts`
  * `src/__tests__/esp32LcdFrameTransformer.test.ts`
  * `src/__tests__/esp32LcdEndToEnd.test.ts`

### Phase 5: Component Sweeps
* **Features**: Validation across relays, RGB LEDs, DC motors, photoresistors, soil moisture sensors, force sensors, flex sensors, gas sensors, and thermistors.
* **Test Files**:
  * `src/__tests__/esp32GpioComponentsSweep.test.ts`
  * `src/__tests__/esp32PwmComponentsSweep.test.ts`
  * `src/__tests__/esp32AdcSensorsSweep.test.ts`

### Phase 6: Keypad & Ultrasonic Distance Sensors (COMPLETED)
* **Features**:
  * **4x4 & 4x3 Matrix Keypads**: Row/column matrix scanning and end-to-end conditional logic (`if key == '5': led.on()`).
  * **HC-SR04 Ultrasonic Distance Sensor**: MicroPython support (`time_pulse_us`), multi-sensor isolation, real-time distance calculations (2cm–400cm), and disconnected pin error assertions (`telemetry.error = "Sensor Pins Disconnected"`).
* **Test Files**:
  * `src/__tests__/esp32Keypad.test.ts`
  * `src/__tests__/esp32UltrasonicCpp.test.ts`

### Resolved Cross-Cutting Fixes
1. **Smart Language Auto-Detection**: Implemented `hasActiveCppCode` and `hasActivePythonCode` in `languageUtils.ts` so `"auto"` mode detects C++ vs. MicroPython dynamically.
2. **Serial Output Forwarding for ESP32**: Added `|| boardType === "esp32"` in `buildSimulationFrame()` (`simulation-state.ts:2949`) to preserve `serialOutput` in simulation frames.
3. **Power Source Classification**: Fixed `hasPowerSourceInCanvas` missing ESP32 board check in `simulation-state.ts`.
4. **GPIO Source Resolution**: Updated `classifyBoardPins` to classify active ESP32 output GPIO pins as power sources.
5. **Stale Pin-State Reset**: Added `frame.tick === 0` pin map resets in `esp32.ts` to prevent voltage carryover across simulation restarts.
6. **Backend Payload Validation**: Updated backend server payload validator to permit `boardType: "esp32"`.
7. **Monaco Editor Model Sync**: Added model synchronization `useEffect` in `CodeEditor.tsx` to ensure Monaco Editor reactively reflects store updates.

### Phase 7: Serial Output & Simulation Session Teardown (COMPLETED)
* **Features**:
  * **MicroPython Serial Output**: Captured `{ outputs, serialLines }` return value from `parsePythonReadOutputsForInput` in `esp32.ts` across `time.sleep_ms()` boundaries and appended to `frame.serialOutput`.
  * **Frame Builder Board Support**: Added `"esp32"` to `boardPins` and `serialOutput` checks in `buildSimulationFrame` (`simulation-state.ts:2999-3004`).
  * **Simulation Session Leak Cleanup**: Added `useEffect` unmount cleanup hook in `Toolbar.tsx` calling `toggleSimulation()` to terminate active WebSocket simulation sessions on navigation or tab unmount across all board types.
* **Test Files**:
  * `src/__tests__/esp32SerialOutput.test.ts` (Multi-tick test)

### Phase 8: ADC Multi-Resolution & Method Expansion (COMPLETED)
* **Features**:
  * **12-bit Native ESP32 Read**: Implemented `.read()` resolving 12-bit integers (`0–4095`) via `picoParser.ts` and `picoAnalogPins.ts` with `gpio` handle detection.
  * **Microvolt & Legacy Read**: Added `.read_uv()` (`0–3,300,000 µV`) and preserved `.read_u16()` (`0–65535`).
  * **Attenuation & Width No-Ops**: Added no-op handling for `.atten()` & `.width()` and `ADC.ATTN_*` / `ADC.WIDTH_*` constants.
* **Test Files**:
  * `src/__tests__/esp32SoilMoistureAdc.test.ts`

### Phase 9: Error Surfacing & C++ Guard UX (COMPLETED)
* **Features**:
  * **SyntaxError Surfacing**: Automatically surfaces `>>> SyntaxError: <message>` once to the SERIAL panel on AST parse failures instead of staying silently blank.
  * **Undefined Variable Serialization**: `print()` formats undeclared/missing variables as `"None"` instead of dropping values into empty whitespace.
  * **C++ Mode Banner & Execution Guard**: Displays an amber warning banner in `CodeEditor.tsx` and disables the "Start Simulation" button with a tooltip in `Toolbar.tsx` when ESP32 is set to C++.
* **Test Files**:
  * `src/__tests__/esp32SoilMoistureAdc.test.ts` (Tests 5 & 6)

### Phase 10: L293D Motor Driver Integration (COMPLETED)
* **Features**:
  * **ESP32 MCU Pin Match**: Expanded `isMcuPin` in `l293d.ts` to match `/^gpio\d+$/i` alongside Pico (`gp\d+`) and Arduino (`d\d+`).
  * **ESP32 Ground Rails**: Added `esp32_gnd`, `esp32_gnd1`, `esp32_gnd2`, `esp32_gnd3` to `commonGndHandles` in `applyL293DDrivenLoads`.
  * **Full H-Bridge States**: Verified forward rotation (`2400 RPM`), reverse rotation (`-2400 RPM`), brake/stop (`0 RPM`), and coast/disable (`HIGH_Z`).
* **Test Files**:
  * `src/__tests__/esp32L293d.test.ts`

### Phase 11: ESP32 VIN Overvoltage Exemption (COMPLETED)
* **Features**:
  * **12V Safe Limit on `esp32_vin`**: Added `esp32_vin` (12.0V safe limit) exception in `checkBoardOvervoltage` (`simulation-state.ts:2966-2970`) and excluded it from logic rail voltage clamping loops.
  * **Prevents False Board Burn**: External high-voltage supplies (such as 9V battery sharing ground with ESP32) no longer trigger a false `boardIsBurnt` shutdown.
* **Test Files**:
  * `src/__tests__/esp32L293d.test.ts` (Tests 5 & 6)

### Phase 12: MicroPython 10-bit PWM & Shared Web Audio (COMPLETED)
* **Features**:
  * **10-bit `.duty()` (0–1023)**: Added native `.duty()` setter and getter support in `picoParser.ts`, correctly scaling to `duty_u16` (`duty * 65535 / 1023`) and pin state `value` (`duty * 255 / 1023`).
  * **PWM Constructor Keyword Args**: Supported `PWM(Pin(x), freq=..., duty=...)` keyword parameters on constructor initialization.
  * **Frequency Forwarding**: Forwarded `frequency: pwmData.freqHz` to `pins.set()` in `esp32.ts` so tone frequencies reach `boardPins`.
  * **User Gesture Web Audio Unlock**: Created `circuit/src/lib/audio.ts` singleton and invoked `unlockAudioContext()` inside "Start Simulation" button `onClick` in `Toolbar.tsx` to satisfy browser autoplay security policies.
* **Test Files**:
  * `src/__tests__/esp32PwmComponentsSweep.test.ts` (Tests 4 & 5)

### Phase 13: `print()` `sep=` / `end=` Keyword Args & Stream Buffering (COMPLETED)
* **Features**:
  * **`sep=` Custom Separator**: Filters `sep` from positional parameters and joins arguments using the specified separator (e.g. `print("A", "B", sep="-")` ➔ `"A-B"`).
  * **`end=` Line Continuation & Buffering**: Accumulates partial lines in `pendingSerialBuffer` across multiple `print(..., end="")` calls and emits completed lines only on newline (`\n`).
  * **Language Engine Scope**: Advanced syntax (multiple assignment, dict comprehensions, lambdas, classes) surfaces `>>> SyntaxError: ...` cleanly to the serial monitor and remains backlogged for future expansion.
* **Test Files**:
  * `src/__tests__/esp32SerialOutput.test.ts` (Tests 3 & 4)

### Phase 14: Input-Only Pin (GPIO 34, 35, 36, 39) Hardware Protection (COMPLETED)
* **Features**:
  * **Input-Only GPI Guard**: Real ESP32 silicon has no output drivers on `GPIO34, GPIO35, GPIO36(VP), GPIO39(VN)`. If user code configures these pins with `Pin.OUT`, the interpreter surfaces `>>> ValueError: Pin(x) doesn't have an output driver (input-only pin)` to the SERIAL monitor.
  * **Output Suppression**: The simulator forces the pin mode to `INPUT` with `value = 0`, preventing false driving of connected canvas loads (e.g. LEDs).
* **Test Files**:
  * `src/__tests__/esp32GpioEndToEnd.test.ts` (Tests C & D)

### Phase 15: Advanced Python Operators & Conditional Syntax (COMPLETED)
* **Features**:
  * **Membership & Identity Operators**: Fully supported `is`, `is not`, `in`, `not in` in conditional expressions (e.g. `if key is not None:`, `if x in list:`).
  * **Syntax Guard & Error Messaging**: Unsupported constructs (multiple assignments, dict comprehensions, lambdas, classes) cleanly surface `>>> SyntaxError: ...` to the SERIAL monitor.
* **Test Files**:
  * `src/__tests__/esp32ConditionalLogic.test.ts`

### Phase 16: Multi-Component System Integration Suite (COMPLETED)
* **Features**:
  * **Full Hardware Stack Co-simulation**: Validates simultaneous operation of LCD displays, Servos, ADC sensors, matrix keypads, and LEDs.
  * **Cross-Subsystem State Persistence**: Guarantees frame pipelines and state managers maintain non-interfering isolation under multi-component workloads.
* **Test Files**:
  * `src/__tests__/esp32MultiComponentIntegration.test.ts`

### Phase 17: NeoPixel (WS2812B) (COMPLETED)
* **Features**:
  * **Chained Pixel Writes**: Traverses `in -> out -> in -> out` conductive graph chains and maps `pixels[0], pixels[1], pixels[2]` accurately to physical canvas nodes in sequence.
  * **`.fill()` / `.write()` Buffer Semantics**: Supports indexed assignment `np[i] = (r, g, b)`, `.fill((r, g, b))`, and `.write()`. Pixel colors only commit to simulation telemetry upon calling `.write()`, mirroring physical hardware.
  * **Pin Safety Guards**: Enforces `ValueError` on SPI flash pins (`GPIO6-11`) and input-only pins (`GPIO34, 35, 36, 39`).
  * **Cross-Frame Persistence & Tick 0 Reset**: Preserves committed pixel colors during `time.sleep_ms()` across simulation ticks, and resets to off on `tick === 0` or simulation stop.
* **Test Files**:
  * `src/__tests__/esp32Neopixel.test.ts` (10 tests)
  * `src/__tests__/esp32MultiComponentIntegration.test.ts` (Tests 1, 9, 11)

### Phase 18: 7-Segment Display (COMPLETED)
* **Features**:
  * **Raw-Pin GPIO Digit Rendering**: Single-digit 10-pin display driven directly via standard MicroPython `Pin(x, Pin.OUT)` and `pin.value(1/0)` digital writes.
  * **Common Cathode & Common Anode Modes**: Supports active-HIGH segment driving for Common Cathode (COM to GND) and inverted active-LOW driving for Common Anode (COM to 3.3V).
  * **Fixed COM-to-GND Grounding Edge Case**: Enhanced board-agnostic transformer (`sevenSegment.ts`) grounded check to explicitly recognize `boardPin.mode === "GND"` alongside `"OUTPUT"`, ensuring direct COM-to-GND wiring accurately establishes ground reference.
  * **Burnout & Current Protection**: Enforces Ohm's Law series resistance calculation; direct connection without series resistor correctly triggers `burnt: true` and blanks display layout.
  * **Pin Safety Guards**: Enforces `ValueError` on input-only pins (`GPIO34, 35, 36, 39`) to prevent invalid segment driving.
* **Test Files**:
  * `src/__tests__/esp32SevenSegment.test.ts` (6 tests)
  * `src/__tests__/esp32MultiComponentIntegration.test.ts` (Tests 6, 7, 8, 10, 11)

### Phase 19: IR Remote/Receiver (COMPLETED)
* **Features**:
  * **New `irReceiver` 3-Pin Component**: Added 3-pin infrared receiver (`vcc`, `gnd`, `out`) representing standard VS1838B / TSOP38238 sensor in `circuit-components.ts` with dynamic optical reception glow.
  * **Interactive 21-Button NEC Remote (`IRRemoteNode.tsx`)**: Upgraded `irRemote` to an interactive node featuring 21 clickable buttons (Power, Vol+/-, 0-9, Play/Pause, Up/Down, EQ, etc.) with active visual click ripples and transmitter LED flash.
  * **Edge-Triggered `.read()` Semantics**: Scoped by simulation tick/sequence counter (`seq`); a button press is consumed exactly once per receiver pin, and subsequent calls in loops or next ticks return `None` until a new click event arrives.
  * **Dual-Receiver Broadcast Support**: Multiple independent IR receivers wired to distinct MCU pins (e.g. `GPIO15` and `GPIO16`) each consume the broadcast optical signal independently without collision or starvation.
  * **Peter Hinch `NEC_8` Callback Compatibility**: Supports both beginner polling API (`IRReceiver.read()`) and advanced callback architecture (`from ir_rx.nec import NEC_8; NEC_8(Pin(15), callback)`).
  * **Tick 0 / Restart Cleanup**: Clears command telemetry and resets consumption state on simulation reset (`tick === 0`) or stop, preventing stale command leakage into new simulation sessions.
  * **Hardware Safety Guards**: Enforces `ValueError` on internal SPI flash pins (`GPIO6-11`). Input-only pins (`GPIO34, 35, 36, 39`) are accepted cleanly as valid input receivers.
* **Test Files**:
  * `src/__tests__/esp32IrReceiver.test.ts` (10 tests)
  * `src/__tests__/esp32MultiComponentIntegration.test.ts` (Tests 9, 10, 11)

### Phase 20: ESP32 C++ (Arduino-style) Support — Phase 1, 2, 3, 4, 5 & 6 (COMPLETED)
* **Features**:
  * **`setup()` / `loop()` Structure**: Automatically parses standard Arduino C++ sketch entrypoints, filtering out comments and `#include` preprocessor directives.
  * **Pin Mode & Digital I/O**: Supports `pinMode(pin, INPUT | OUTPUT | INPUT_PULLUP)`, `digitalWrite(pin, HIGH | LOW | 1 | 0)`, and `digitalRead(pin)`.
  * **C++ Conditionals & Variable Resolution**: Evaluates boolean conditionals (e.g. `if (digitalRead(btn) == LOW)`) and resolves identifiers declared via `#define`, `const int`, `int`, `byte`, and `GPIO_NUM_X`.
  * **`analogWrite()` / `analogRead()` (8-bit / 10-bit Scale Conversion)**:
    * `analogWrite(pin, val)`: 8-bit resolution (`0–255`), mapped to PWM duty cycle (`val / 255 * 100%`) and `duty_u16` (`val * 257`).
    * `analogRead(pin)`: 10-bit Arduino default (`0–1023`), scaled from 12-bit ESP32 ADC hardware reading (`val * 1023 / 4095`), honoring input-only pin capabilities.
  * **Serial Communication (Phase 3)**:
    * `Serial.begin(baud)` recognized as a setup call.
    * `Serial.print(expr, [format])` and `Serial.println([expr], [format])` support string literals, numeric variables, `analogRead` / `digitalRead` expressions, and string concatenation (`"Text: " + String(val)`).
    * Number base formatting specifiers (`HEX`, `BIN`, `DEC`, `OCT`) and decimal float precision (`Serial.print(val, 2)`).
    * Multi-tick stream buffering: partial `Serial.print()` chunks hold across calls in the same loop iteration and flush completed lines upon `\n` / `println()`.
  * **I2C / 16x2 LCD Display (Phase 4)**:
    * `LiquidCrystal_I2C lcd(addr, cols, rows)` constructor parsing (e.g. `0x27`, `0x3F`).
    * `Wire.begin()` (default SDA=21, SCL=22) and `Wire.begin(sda, scl)` custom pin assignment.
    * `lcd.init()`, `lcd.begin()`, `lcd.backlight()`, `lcd.noBacklight()`, `lcd.clear()`, `lcd.setCursor(col, row)`.
    * `lcd.print(expr)` supporting string literals, variables, sensor reads (`analogRead`, `digitalRead`), and `String` concatenations.
    * Strict conductive graph reachability and miswire enforcement reusing `checkPicoDeclaredI2cPin` and forbidden SPI flash pin guards (`GPIO6-11`).
  * **Hardware Interrupts (Phase 5)**:
    * `attachInterrupt(digitalPinToInterrupt(pin), isr, mode)` and `attachInterrupt(pin, isr, mode)` support for `FALLING`, `RISING`, and `CHANGE` trigger modes.
    * `detachInterrupt(digitalPinToInterrupt(pin))` and `detachInterrupt(pin)` de-registration.
    * Zero-argument ISR execution (`void isr() { ... }` / `void IRAM_ATTR isr() { ... }`) with variable mutation, direct `digitalWrite`, and `Serial.println` inside ISRs.
    * Boot-time false-trigger protection (`lastValue` initialized from physical input state) and edge-triggered latching.
  * **Matrix Keypad (Phase 6)**:
    * Standard Arduino `Keypad.h` library syntax parsing: `Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS)` for both 4x4 (16 keys) and 4x3 (12 keys) layouts.
    * Interactive `keypad.getKey()` resolution via conductive graph reachability from MCU GPIO row/col pins to interactive canvas keypad component.
    * Conditionals (`if (key)`, `if (key != NO_KEY)`, `if (key == '1')`), Serial logging (`Serial.println(key)`), and LCD display (`lcd.print(key)`).
    * Hardware safety guards rejecting input-only pins (`GPIO34-39`) as row outputs and SPI flash pins (`GPIO6-11`).
  * **HC-SR04 Ultrasonic Distance Sensor (Phase 7)**:
    * `pulseIn(echoPin, HIGH)` round-trip duration calculation in microseconds based on canvas `distance` property (`(distanceCm * 2) / 0.0343`).
    * Disconnected and unpowered sensor timeout handling (returns `0`).
    * Safe generic arithmetic expression evaluator (`+`, `-`, `*`, `/`, parens, unary minus, div-by-zero safeguard returning `0`, negative results) for distance conversions (`duration * 0.034 / 2`, `duration / 58.2`).
    * Multi-sensor isolation matching echo pins to corresponding canvas nodes independently.
    * Conditionals (`if (distanceCm < 50)`), Serial output (`Serial.println(distanceCm)`), and I2C LCD display (`lcd.print(distanceCm)`).
  * **`checkEsp32CppSupport` Dynamic Banner**: Inspects C++ code AST for unsupported constructs; allows `Serial`, `LiquidCrystal_I2C` / `Wire`, `attachInterrupt` / `detachInterrupt`, `Keypad`, `pulseIn` / `delayMicroseconds` and flags genuinely unsupported patterns (e.g. `Serial.read`, `WiFi`).
* **Test Files**:
  * `src/__tests__/esp32CppGpio.test.ts`
  * `src/__tests__/esp32CppPwmAdc.test.ts` (and `src/__tests__/esp32CppGpioParser.test.ts`)
  * `src/__tests__/esp32CppSerial.test.ts` (8 tests)
  * `src/__tests__/esp32CppLcd.test.ts` (7 tests)
  * `src/__tests__/esp32CppInterrupt.test.ts` (8 tests)
  * `src/__tests__/esp32CppKeypad.test.ts` (7 tests)
  * `src/__tests__/esp32CppUltrasonic.test.ts` (7 tests)

### Phase 21: Cross-Cutting Bug Fixes (Resolved Cross-Cutting Fixes)
* **Resolved Issues**:
  1. **L293D Motor RPM/PWM Dynamic Sync Bug**: Synchronized active PWM duty cycle from simulation session to `esp32.ts` and passed context parameters into `l293d.ts`, resolving motor RPM stalls during dynamic PWM speed adjustments.
  2. **ADC Gas Sensor Power-Pin False-Positive & Missing Telemetry Sources**: Fixed `picoAnalogPins.ts` false reachability match on power pins (`a1`, `a2`), restricting ADC sampling exclusively to signal pins (`b1`, `b2`). Added ESP32 telemetry source propagation in `voltageUtils.ts` (`collectCircuitSourcesAndSinks`).
  3. **I2C LCD SDA/SCL Declared-Pin Wiring Enforcement & SoftI2C Parsing Bug Fix**: Replaced address-based loose association with strict conductive graph reachability from declared MCU SDA/SCL pins to LCD pins. Fixed `SoftI2C(scl=Pin(...), sda=Pin(...))` keyword argument parsing in `picoParser.ts`.
  6. **ESP32 SPI-Flash / Input-Only Pin Guard Leak**: Scoped board guards (`GPIO 6-11`, `GPIO 34-39`) in `picoParser.ts` to `boardType === "esp32"`, preserving Pico GP6-11 and GP34 operations.
  7. **Matrix Keypad Active-LOW + PULL_UP Voltage Arbitration**: Gated `consumeKeyIfConnected()` on polarity-aware row driving in `picoParser.ts` and driven-low row ground propagation in `esp32.ts`.
  8. **Matrix Keypad Canvas Click/Drag Event Isolation**: Added `e.stopPropagation()` and `nodrag nopan` to SVG keypad buttons in `Keypad_4x4.tsx` and `Keypad_4x3.tsx`.
  9. **Client/Server Simulation Timestamp Race Protection**: Widened backward timestamp jitter tolerance to -2000ms in `picoParser.ts` and preserved server frame timestamp in `store-legacy.ts`.
  10. **Python String & List Repetition via `*` / `*=`**: Added `pythonMultiply()` in `picoParser.ts` for `str * int`, `int * str`, `list * int`, `int * list`.
  11. **ESP32 Servo Bidirectional Signal Wiring**: Made PWM servo signal edge matching bidirectional in `esp32.ts`, fixing false disconnected warnings and horn rotation.

### Phase 22: MicroPython Interpreter, UI Event Handling & Hardware Multi-Component Co-simulation (COMPLETED)
* **Features**:
  * **Pico / ESP32 Pin Guard Disambiguation**: Guarded SPI flash pins (`GPIO6-11`) and input-only pins (`GPIO34, 35, 36, 39`) with `this.state.boardType === "esp32"` in `picoParser.ts` and explicitly propagated `boardType: "esp32"` in `esp32.ts`, `pico.ts`, `neoPixel.ts`, and `esp32Neopixel.ts`. Pico GP6-11 and GP34 now operate without false `ValueError` exceptions.
  * **Matrix Keypad Active-LOW Polarity & Voltage Arbitration**: Polarity-aware `consumeKeyIfConnected()` checks `(isPullUp && drivenLowByRow)` for active-LOW scanning and `(!isPullUp && drivenHighByRow)` for active-HIGH scanning. `esp32.ts` correctly marks driven-low output pins as grounded in input net reachability, enabling all 16 keys on rows 0–3 to register cleanly.
  * **Canvas Pointer Event Isolation (`stopPropagation` + `nodrag`)**: Added `e.stopPropagation()` on `onPointerDown`, `onPointerUp`, and `onPointerLeave` handlers in `Keypad_4x4.tsx` and `Keypad_4x3.tsx`, along with `nodrag nopan` class on SVG `<g>` key elements, preventing React Flow canvas drag listeners from clearing pressed keys.
  * **Simulation Timestamp Jitter & Race Condition Immunity**: Replaced rigid `-10ms` backward timestamp reset threshold with `-2000ms` jitter tolerance in `picoParser.ts` (`getOrCreateSession`), reserving session re-initialization exclusively for `timestamp === 0` (Stop $\rightarrow$ Start) and `> 5000ms` idle timeouts. `refreshSimulationFrameFromCurrentCircuit()` in `store-legacy.ts` preserves existing frame timestamps.
  * **Python String & List Multiplication**: Implemented `pythonMultiply()` in `picoParser.ts` for `BinOp` `*` and `AugAssign` `*=`, supporting `string * int`, `int * string`, `list * int`, and `int * list` (including `* len(var)`), eliminating `NaN` evaluation errors.
  * **ESP32 Servo Bidirectional Wiring**: Updated `applyEsp32SimulationToFrame` in `esp32.ts` to match servo signal edges bidirectionally (`source === esp32` OR `target === esp32`), ensuring `telemetry.angle` and `isPowered: true` populate accurately regardless of wire drawing direction.
* **Test Files**:
  * `src/__tests__/picoNeopixelPinGuard.test.ts`
  * `src/__tests__/keypadActiveLowPullUp.test.ts` (4 tests)
  * `src/__tests__/keypadRealClickFlow.test.ts` (4 tests)
  * `src/__tests__/sessionTimestampRaceReset.test.ts` (5 tests)
  * `src/__tests__/pythonStringListRepetition.test.ts` (9 tests)
  * `src/__tests__/esp32ServoBidirectionalWiring.test.ts` (3 tests)



## 4. Known Open Issues & Backlog Flags

1. **Fragile String Mutation in `ultrasonicPir.ts`**:
   - The ultrasonic frame transformer currently intercepts `frame.serialOutput` lines starting with `"Distance:"` and mutates them to `"Distance: 0 cm"` when pins are disconnected.
   - *Backlog Action*: Refactor to check component telemetry error states cleanly instead of intercepting / modifying serialized user strings.

2. **Pin Validation Architecture Notes**:
   - **Mismatched Wiring**: Code configuring unwired pins safely reads `0` via graph reachability without crashing or leaking state (matches unplugged physical breadboard behavior).
   - **Reserved Flash Pins (`GPIO6-11`)**: Excluded from the canvas DevKit V1 component (matching physical hardware where SPI flash pins are enclosed under RF shield) and rejected by board adapter.
   - **Pull Resistors on GPI Pins (`GPIO34-39`)**: Accepted in constructor without error; electrical read state is governed by conductive graph reachability.

3. **Advanced Python Syntax Engine Status**:
   - **Identity & Membership Operators (`is`, `is not`, `in`, `not in`)**: ✅ **Fully Supported** in conditional expressions (e.g. `if key is not None:`, `if x in list:`).
   - **Other Unsupported Constructs**: Multiple assignments (`a, b = 1, 2`), dictionary comprehensions, lambda expressions, and class definitions surface `>>> SyntaxError: ...` cleanly to the SERIAL panel and are safely backlogged for a dedicated language engine expansion.

4. **NeoPixel RGBW Hardware Backlog**:
   - RGBW 4-tuple values `(r, g, b, w)` are safely accepted without parser errors. Since standard WS2812B simulated components are 3-channel RGB, the 4th value is currently silently ignored without a user-facing warning. Dedicated RGBW LED rendering remains backlogged.

5. **Features Pending Real Browser UI Click-Through (Rule 5 Audit)**:
   - The following components have 100% passing automated test suites, but must be verified in the real browser UI before being considered fully done:
     - **Servo Motor** (0°, 90°, 180° `duty_u16` angles)
     - **I2C 16x2 LCD Display** (`SoftI2C` text rendering)
     - **4x4 & 4x3 Matrix Keypads** (Interactive key clicking)
     - **ADC Sensors** (Potentiometer, Soil Moisture, Temp, Gas, Force, Flex sliders)
     - **L293D Motor Driver** (Interactive motor driving)

6. **C++ (Arduino-Style) Mode Scope**:
   - Phase 1, 2 & 3 foundation is completed: `setup()`/`loop()`, digital I/O (`pinMode`, `digitalWrite`, `digitalRead`), conditionals (`if/else`), `analogWrite()` (PWM 8-bit), `analogRead()` (ADC 10-bit), and Serial Communication (`Serial.begin`, `Serial.print`, `Serial.println`, multi-tick stream buffering).
   - Dynamic banner (`checkEsp32CppSupport`) informs users of active capabilities; simulation execution is permitted for supported constructs and safely guarded only if unsupported constructs (e.g. `Serial.read`, `attachInterrupt`, `WiFi`) are detected.
   - Peripheral libraries (I2C/LCD, Ultrasonic, Keypad, etc.) remain in upcoming phases.

---

## 5. Backlog & Roadmap

| Component / Feature | Automated Tests | Human UI Verified? | Status / Notes |
| :--- | :---: | :---: | :--- |
| **Live Serial Output (`print`)** | ✅ PASS | ✅ **YES** | Verified live with 25 accumulated lines & 0-line stop reset. |
| **HC-SR04 Ultrasonic Sensor** | ✅ PASS | ✅ **YES** | Real distance calculation & disconnected pin detection verified. |
| **LED / GPIO Digital Output** | ✅ PASS | ✅ **YES** | Active driving & voltage resolution verified. |
| **PWM Actuators (Buzzer, RGB, Motor)** | ✅ PASS | ✅ **YES** | Verified live with Piezo buzzer tone (1000/2000Hz) & sound rings. |
| **Soil Moisture Sensor (ADC)** | ✅ PASS | ⏳ Pending UI Click | Dedicated test suite passes (`esp32SoilMoistureAdc.test.ts`). |
| **L293D H-Bridge Motor Driver** | ✅ PASS | ⏳ Pending UI Click | Dedicated test suite passes (`esp32L293d.test.ts`). |
| **Servo Motor (PWM Angle Control)** | ✅ PASS | ⏳ Pending UI Click | Automated test suite passes (`esp32ServoPwm.test.ts`). |
| **I2C 16x2 LCD Display** | ✅ PASS | ⏳ Pending UI Click | Automated test suite passes (`esp32LcdEndToEnd.test.ts`). |
| **Matrix Keypad (4x4 & 4x3)** | ✅ PASS | ⏳ Pending UI Click | Automated test suite passes (`esp32Keypad.test.ts`). |
| **ADC Sensors (Pot, Temp, Gas, Force, Flex)** | ✅ PASS | ⏳ Pending UI Click | Automated test suite passes (`esp32AdcSensorsSweep.test.ts`). |
| **NeoPixel (WS2812B)** | ✅ PASS | ✅ **DONE** | Chained pixel writes, `.fill()`/`.write()`, pin safety guards, cross-frame color persistence (`esp32Neopixel.test.ts`). |
| **7-Segment Display** | ✅ PASS | ✅ **DONE** | Raw-pin GPIO digit rendering (common cathode/anode), direct COM-to-GND grounding fix (`esp32SevenSegment.test.ts`). |
| **IR Remote / Receiver** | ✅ PASS | ✅ **DONE** | 3-pin receiver, 21-button remote, edge-triggered `.read()`, dual-receiver broadcast, NEC_8 callback (`esp32IrReceiver.test.ts`). |
| **PWM-Driven LED Brightness** | ✅ PASS | ✅ **DONE** | Peak pulse voltage modeling for diode Vf threshold, proportional duty dimming (`esp32PwmLedBrightness.test.ts`). |
| **Hardware Interrupts (`Pin.irq`)** | ✅ PASS | ✅ **DONE** | Edge-triggered callback invocation, parameter binding, boot-time false-trigger fix (`esp32PinIrq.test.ts`). |
| **C++ (Arduino-Style) Full Engine** | ✅ PASS | ⏳ In Progress | **Partial — Phase 1, 2 & 3 done (GPIO, PWM, ADC, Serial)**. Digital I/O, PWM (`analogWrite`), ADC (`analogRead`), Serial prints, stream buffering, dynamic banner (`esp32CppGpio.test.ts`, `esp32CppSerial.test.ts`). |

---

## 6. Full Automated Regression Suite

To run the full suite across all subsystems:

```bash
# 1. Base simulator type checks
npx tsc --noEmit

# 2. Main regression runner (17 test suites)
npx tsx src/__tests__/runAllTests.ts

# Or run individual regression suites:
npx tsx src/__tests__/boardAdapter.test.ts
npx tsx src/__tests__/pico11StepLcdRegression.test.ts
npx tsx src/__tests__/picoMultiLcdRegression.test.ts
npx tsx src/__tests__/picoPirSensor.test.ts
npx tsx src/__tests__/arduinoPirDivergence.test.ts
npx tsx src/__tests__/picoTrafficLight.test.ts
npx tsx src/__tests__/multimeter.test.ts
npx tsx src/__tests__/l293d.test.ts
npx tsx src/__tests__/l293dCommonGndValidation.test.ts
npx tsx src/__tests__/circuitPresetsL293d.test.ts
npx tsx src/__tests__/soilMoistureLed.test.ts
npx tsx src/__tests__/sevenSegment.test.ts

# 3. ESP32 test suites
npx tsx src/__tests__/esp32BoardAdapter.test.ts
npx tsx src/__tests__/esp32BoardDetection.test.ts
npx tsx src/__tests__/esp32PythonGpioParser.test.ts
npx tsx src/__tests__/esp32GpioFrameTransformer.test.ts
npx tsx src/__tests__/esp32GpioEndToEnd.test.ts
npx tsx src/__tests__/esp32PythonGpioInputParser.test.ts
npx tsx src/__tests__/esp32GpioInputFrameTransformer.test.ts
npx tsx src/__tests__/esp32GpioInputEndToEnd.test.ts
npx tsx src/__tests__/esp32ConditionalLogic.test.ts
npx tsx src/__tests__/esp32PythonPwmParser.test.ts
npx tsx src/__tests__/esp32PwmFrameTransformer.test.ts
npx tsx src/__tests__/esp32PwmEndToEnd.test.ts
npx tsx src/__tests__/esp32PwmLedBrightness.test.ts
npx tsx src/__tests__/esp32ServoPwm.test.ts
npx tsx src/__tests__/esp32Adc.test.ts
npx tsx src/__tests__/esp32AdcSensorsSweep.test.ts
npx tsx src/__tests__/esp32AdcPinValidation.test.ts
npx tsx src/__tests__/esp32I2cLcdParser.test.ts
npx tsx src/__tests__/esp32LcdFrameTransformer.test.ts
npx tsx src/__tests__/esp32LcdEndToEnd.test.ts
npx tsx src/__tests__/esp32Keypad.test.ts
npx tsx src/__tests__/esp32UltrasonicCpp.test.ts
npx tsx src/__tests__/esp32SerialOutput.test.ts
npx tsx src/__tests__/esp32SoilMoistureAdc.test.ts
npx tsx src/__tests__/esp32L293d.test.ts
npx tsx src/__tests__/esp32Neopixel.test.ts
npx tsx src/__tests__/esp32SevenSegment.test.ts
npx tsx src/__tests__/esp32IrReceiver.test.ts
npx tsx src/__tests__/esp32MultiComponentIntegration.test.ts
npx tsx src/__tests__/esp32CppGpio.test.ts
npx tsx src/__tests__/esp32CppGpioParser.test.ts
npx tsx src/__tests__/esp32CppSerial.test.ts
npx tsx src/__tests__/esp32CppLcd.test.ts
npx tsx src/__tests__/esp32CppInterrupt.test.ts
npx tsx src/__tests__/esp32CppKeypad.test.ts
npx tsx src/__tests__/esp32PinIrq.test.ts
npx tsx src/__tests__/esp32CppUltrasonic.test.ts
npx tsx src/__tests__/esp32CppNeopixel.test.ts
npx tsx src/__tests__/esp32CppIrReceiver.test.ts
```
