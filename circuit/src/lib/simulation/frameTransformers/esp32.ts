/**
 * ESP32 Simulation Frame Transformer
 *
 * Consumes normalized Esp32GpioAction objects from sessionParser.ts.
 * Language-agnostic transformer setting 3.3V logic levels on ESP32 GPIO handles.
 * Uses applyDrivenLoadsFromEndpoint to propagate power to loads (LEDs, resistors, multimeters).
 *
 * Phase 2 (Digital Input):
 *   gpio_read actions model the voltage present on the INPUT pin driven by
 *   external components (pushbutton, PIR, slide switch, etc.).
 *   Pull-up behavior: with Pin.PULL_UP, the pin defaults HIGH (3.3V) unless
 *   a connected component actively pulls it to GND.
 */

import type { SimulationFrame } from "../../simulation-state";
import type { SimContext } from "../types";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildSimulationFrame } from "../../simulation-state";
import { frameBoardPinsToMap, upsertPinState, getEndpointVoltage } from "../../circuit/pinMapping";
import {
  parseEsp32SessionActions,
  evaluateEsp32PythonConditionals,
  evaluateEsp32CppConditionals,
  evaluateEsp32CppSerial,
  evaluateEsp32CppBluetoothSerial,
  evaluateEsp32CppLcd,
  evaluateEsp32CppInterrupts,
  type Esp32AdcAction,
} from "../../esp32/parser";
import { parseEsp32PythonAdcActions } from "../../esp32/parser/pythonPatterns";
import { applyDrivenLoadsFromEndpoint } from "./stateMaps";
import { buildConductiveGraphForStore, buildConductiveGraph, getReachableGraphNodes } from "../../circuit/graph";
import { isEffectivePython, resolveEsp32Language } from "../../circuit/languageUtils";
import { collectCircuitSourcesAndSinks, resolveEndpointVoltage } from "../../circuit/voltageUtils";
import { getOrCreateSession, parsePythonReadOutputsForInput } from "../../codeParsing/picoParser";
import { validateComponentConnections, checkPicoDeclaredI2cPin } from "../../../utils/connectivity";

/** ESP32 GND handle names used for pull-up ground detection. */
const ESP32_GND_HANDLES = ["esp32_gnd1", "esp32_gnd2", "esp32_gnd3"];

/**
 * Resolves whether an ESP32 GPIO input pin is actively being pulled LOW
 * by a connected component (button/PIR/switch pressed state).
 * Returns the effective voltage on that input pin.
 */
function resolveInputPinVoltage(
  esp32NodeId: string,
  gpioHandle: string,
  pull: "none" | "up" | "down",
  nodes: SimContext["nodes"],
  edges: SimContext["edges"],
  pins?: Map<number, any>,
): number {
  const graph = buildConductiveGraphForStore(nodes, edges, { includeResistors: true });

  // Add active keypad matrix short-circuits to the graph for pressed keys
  const KEY_MATRIX = [
    ["1", "2", "3", "A"],
    ["4", "5", "6", "B"],
    ["7", "8", "9", "C"],
    ["*", "0", "#", "D"],
  ];
  for (const node of nodes) {
    const model = node.data?.componentType ?? node.type;
    if (model === "keypad4x4" || model === "keypad4x3") {
      const pressedKeysStr = String(node.data?.properties?.pressedKeys?.value ?? "");
      const pressedKeys = new Set(pressedKeysStr ? pressedKeysStr.split(",") : []);
      pressedKeys.forEach((key) => {
        let rIdx = -1;
        let cIdx = -1;
        for (let r = 0; r < KEY_MATRIX.length; r++) {
          const c = KEY_MATRIX[r].indexOf(key);
          if (c !== -1) {
            rIdx = r;
            cIdx = c;
            break;
          }
        }
        if (rIdx !== -1 && cIdx !== -1) {
          const epA = `${node.id}:row${rIdx + 1}`;
          const epB = `${node.id}:column${cIdx + 1}`;
          if (!graph.has(epA)) graph.set(epA, new Set());
          if (!graph.has(epB)) graph.set(epB, new Set());
          graph.get(epA)!.add(epB);
          graph.get(epB)!.add(epA);
        }
      });
    }
  }

  const pinEndpoint = `${esp32NodeId}:${gpioHandle}`;
  const reach = getReachableGraphNodes(graph, pinEndpoint);

  // Check if this input pin's net is connected to another ESP32 GPIO output pin actively driven HIGH/LOW
  let outputDrivenLow = false;
  if (pins) {
    for (let otherPin = 0; otherPin <= 39; otherPin++) {
      if (otherPin >= 6 && otherPin <= 11) continue;
      const otherHandle = `gpio${otherPin}`;
      if (gpioHandle === otherHandle) continue;
      if (reach.has(`${esp32NodeId}:${otherHandle}`)) {
        const pinState = pins.get(otherPin);
        if (pinState && pinState.mode === "OUTPUT") {
          if (pinState.value > 0) {
            return 3.3; // Driven HIGH by another GPIO output pin (e.g. matrix scan row pin)
          } else {
            outputDrivenLow = true; // Driven LOW by another GPIO output pin (e.g. active-low matrix scan row)
          }
        }
      }
    }
  }

  // Check if this pin's net is connected to GND (i.e. something is pulling it LOW)
  let pulledToGnd = outputDrivenLow;
  for (const node of nodes) {
    const model = getNodeSimulationModel(node);
    const gndHandles =
      model === "arduino" ? ["gnd1", "gnd2", "gnd3"]
        : model === "raspberrypipico" ? ["pico_gnd1", "pico_gnd2", "pico_gnd3", "pico_gnd4", "pico_gnd5", "pico_gnd6", "pico_gnd7", "pico_gnd8"]
          : model === "esp32" ? ESP32_GND_HANDLES
            : model === "battery9v" || model === "battery1_5v" || model === "coincell" || model === "powerSupply"
              ? ["negative"]
              : [];

    for (const h of gndHandles) {
      if (reach.has(`${node.id}:${h}`)) {
        pulledToGnd = true;
        break;
      }
    }
    if (pulledToGnd) break;
  }

  if (pulledToGnd) return 0; // Actively pulled LOW

  // Check if this pin's net is connected to a VCC / power pin (actively driven HIGH)
  for (const node of nodes) {
    const model = getNodeSimulationModel(node);
    const vccHandles =
      model === "arduino" ? ["5v", "3v3"]
        : model === "raspberrypipico" ? ["pico_3v3", "pico_vbus", "pico_vsys"]
          : model === "esp32" ? ["esp32_3v3", "esp32_vin"]
            : model === "battery9v" || model === "battery1_5v" || model === "coincell" || model === "powerSupply"
              ? ["positive"]
              : [];

    for (const h of vccHandles) {
      if (reach.has(`${node.id}:${h}`)) {
        return 3.3; // Actively driven HIGH by power rail
      }
    }
  }

  // Also check pushbutton / slide switch pressed state pulling the pin LOW
  for (const node of nodes) {
    const model = getNodeSimulationModel(node);
    if (model === "pushbutton") {
      const pressed = node.data.properties?.state?.value === "pressed";
      if (pressed && (reach.has(`${node.id}:pin1`) || reach.has(`${node.id}:pin2`))) {
        pulledToGnd = true;
        break;
      }
    }
  }

  if (pulledToGnd) return 0; // Actively pulled LOW

  // Not pulled to GND — apply pull resistor default
  if (pull === "up") return 3.3;   // PULL_UP default = HIGH
  if (pull === "down") return 0;   // PULL_DOWN default = LOW
  return 0;                        // Floating = treat as LOW
}

export function applyEsp32SimulationToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  if (!frame.running) return frame;

  const { nodes, edges, arduinoCode, picoCode, boardType } = context;
  const esp32Node = nodes.find(
    (n) =>
      getNodeSimulationModel(n) === "esp32" ||
      n.data?.componentType === "esp32" ||
      n.type === "esp32",
  );

  if (!esp32Node) return frame;

  const esp32Lang = resolveEsp32Language((context as any).selectedLanguage, arduinoCode, picoCode);
  const isPython = esp32Lang.isPython;
  const code = esp32Lang.buffer === "pico" ? picoCode : arduinoCode;

  const actions = parseEsp32SessionActions(code, isPython);
  const pins = frame.tick === 0 ? new Map<number, any>() : frameBoardPinsToMap(frame);

  // --- Resolve INPUT pins (gpio_read) voltages & logic levels ---
  const inputStates = new Map<number, boolean>();
  const inputPinData: Array<{ pin: number; pull: "up" | "down" | "none"; voltage: number; logicHigh: boolean }> = [];

  for (const act of actions) {
    if (act.type !== "gpio_read") continue;
    if (act.pin >= 6 && act.pin <= 11) continue; // Forbidden SPI flash pins

    const gpioHandle = `gpio${act.pin}`;
    const drivenVoltage = resolveInputPinVoltage(
      esp32Node.id,
      gpioHandle,
      act.pull,
      nodes,
      edges,
      pins,
    );
    const logicHigh = drivenVoltage >= 1.65; // 3.3V logic mid-point threshold
    inputStates.set(act.pin, logicHigh);
    inputPinData.push({ pin: act.pin, pull: act.pull, voltage: drivenVoltage, logicHigh });
  }

  // --- Step MicroPython AST session engine with resolved pin inputs ---
  const ts = frame.timestamp ?? (frame.tick * 100);
  let outputs: Array<{ pin: number; high: boolean }> = [];
  let serialLines: string[] = [];
  let bluetoothLines: string[] = [];
  let bluetoothDeviceName = "ESP32_BT";

  // Consolidate latest write value per output pin.
  // For C++ (not Python): setup()-originated writes (fromSetup: true) are only applied at tick 0.
  // On subsequent ticks they are skipped so that the last conditional write (e.g. LED HIGH after
  // IR button press) persists instead of being reset by the setup() LOW on every frame.
  const pinValues = new Map<number, 0 | 1>();
  for (const act of actions) {
    if (act.type === "gpio_write" && act.pin >= 0 && act.pin <= 39) {
      if (act.pin >= 6 && act.pin <= 11) continue; // Ignore forbidden SPI flash pins
      if (!isPython && act.fromSetup && frame.tick > 0) continue; // Skip setup() writes after tick 0
      pinValues.set(act.pin, act.value);
    }
  }

  // Collect latest PWM duty per output pin (dutyPercent 0-100 → effective voltage 0–3.3V)
  const pwmValues = new Map<number, { dutyPercent: number; dutyU16: number; freqHz?: number }>();
  for (const act of actions) {
    if (act.type === "pwm_write" && act.pin >= 0 && act.pin <= 39) {
      if (act.pin >= 6 && act.pin <= 11) continue;
      pwmValues.set(act.pin, { dutyPercent: act.dutyPercent, dutyU16: act.dutyU16, freqHz: act.freqHz });
    }
  }

  let cppIrqVariables: Map<string, any> | undefined;
  if (isPython) {
    if (inputStates.size > 0) {
      for (const [pin, high] of inputStates.entries()) {
        const res = parsePythonReadOutputsForInput(code, pin, high, ts, "esp32");
        if (res) {
          outputs.push(...res.outputs);
          serialLines.push(...res.serialLines);
        }
      }
    } else {
      const res = parsePythonReadOutputsForInput(code, -1, false, ts, "esp32");
      if (res) {
        outputs.push(...res.outputs);
        serialLines.push(...res.serialLines);
      }
    }
  } else {
    // --- Step ESP32 C++ Hardware Interrupts Engine ---
    const irqRes = evaluateEsp32CppInterrupts(code, {
      tick: frame.tick,
      timestamp: ts,
      inputStates,
      nodes,
      edges,
    });
    cppIrqVariables = irqRes.variables;

    for (const act of irqRes.actions) {
      if (act.type === "gpio_write" && act.pin >= 0 && act.pin <= 39) {
        if (act.pin >= 6 && act.pin <= 11) continue;
        pinValues.set(act.pin, act.value);
      }
    }

    // --- Step ESP32 C++ Serial Engine with live circuit context ---
    const cppSerialRes = evaluateEsp32CppSerial(code, {
      tick: frame.tick,
      timestamp: ts,
      inputStates,
      nodes,
      edges,
      variables: cppIrqVariables,
    });
    serialLines = cppSerialRes.allLines;
    if (irqRes.serialLines.length > 0) {
      serialLines = [...serialLines, ...irqRes.serialLines];
    }

    // --- Step ESP32 C++ Bluetooth Serial Engine ---
    const cppBtRes = evaluateEsp32CppBluetoothSerial(code, {
      tick: frame.tick,
      timestamp: ts,
      running: frame.running,
      nodes,
      edges,
      variables: cppIrqVariables,
    });
    bluetoothLines = cppBtRes.allLines;
    bluetoothDeviceName = cppBtRes.deviceName;
  }

  const session = isPython ? getOrCreateSession(code, ts, "esp32") : null;
  const serialOutput = isPython
    ? (session?.rawSerialLines ? session.rawSerialLines.slice(-100) : (serialLines.length > 0 ? serialLines : (frame.serialOutput ?? [])))
    : (serialLines.length > 0 ? serialLines : (frame.serialOutput ?? []));
  const bluetoothOutput = bluetoothLines.length > 0 ? bluetoothLines : (frame.bluetoothOutput ?? []);

  // Merge dynamic session pin values from AST execution engine if present
  if (session) {
    session.pins.forEach((pinState, pinNum) => {
      if (pinNum >= 6 && pinNum <= 11) return; // Ignore forbidden SPI flash pins
      if (pinState.mode === "OUTPUT" && !pwmValues.has(pinNum)) {
        pinValues.set(pinNum, pinState.value > 0 ? 1 : 0);
      }
    });

    if (session.pwm) {
      session.pwm.forEach((pwmState, pinNum) => {
        if (pinNum >= 6 && pinNum <= 11) return; // Ignore forbidden SPI flash pins
        const dutyPercent = Math.round((pwmState.dutyU16 / 65535) * 100 * 10) / 10;
        const existing = pwmValues.get(pinNum);
        pwmValues.set(pinNum, {
          dutyPercent,
          dutyU16: pwmState.dutyU16,
          freqHz: pwmState.freqHz || existing?.freqHz,
        });
      });
    }
  }

  // --- Evaluate MicroPython AST conditional logic (if btn.value() == 0: led.value(1)) ---
  if (isPython && inputStates.size > 0) {
    const condActions = evaluateEsp32PythonConditionals(code, inputStates);
    for (const act of condActions) {
      if (act.type === "gpio_write" && act.pin >= 0 && act.pin <= 39) {
        if (act.pin >= 6 && act.pin <= 11) continue;
        pinValues.set(act.pin, act.value);
      }
    }
  }

  // --- Evaluate C++ conditional logic (if (digitalRead(btn) == LOW) digitalWrite(led, HIGH), analogRead, analogWrite) ---
  if (!isPython) {
    const condActions = evaluateEsp32CppConditionals(code, inputStates, {
      nodes,
      edges,
      variables: cppIrqVariables,
      frame,
      tick: frame.tick,
      running: frame.running,
    });
    for (const act of condActions) {
      if (act.type === "gpio_write" && act.pin >= 0 && act.pin <= 39) {
        if (act.pin >= 6 && act.pin <= 11) continue;
        pinValues.set(act.pin, act.value);
      }
      if (act.type === "pwm_write" && act.pin >= 0 && act.pin <= 39) {
        if (act.pin >= 6 && act.pin <= 11) continue;
        pwmValues.set(act.pin, { dutyPercent: act.dutyPercent, dutyU16: act.dutyU16, freqHz: act.freqHz });
      }
    }
  }

  for (const [pinNum, val] of pinValues.entries()) {
    upsertPinState(pins, pinNum, val === 1);
  }

  for (const [pinNum, pwmData] of pwmValues.entries()) {
    const effectiveV = 3.3 * (Math.max(0, Math.min(100, pwmData.dutyPercent)) / 100);
    if (effectiveV > 0) {
      pins.set(pinNum, {
        mode: "OUTPUT",
        value: Math.round((pwmData.dutyPercent / 100) * 255),
        frequency: pwmData.freqHz,
      });
    }
  }

  const baseFrame = buildSimulationFrame({
    tick: frame.tick,
    nodes,
    edges,
    dynamicComponents: context.dynamicComponents,
    boardType: frame.boardType,
    arduinoState: {
      pins,
      serialOutput,
      running: frame.running,
      error: frame.error,
    },
    running: frame.running,
    error: frame.error,
  });

  const components = { ...baseFrame.components };

  if (!components[esp32Node.id]) {
    components[esp32Node.id] = {
      nodeId: esp32Node.id,
      label: esp32Node.data?.label ?? "ESP32 DevKit V1",
      componentType: "esp32",
      pins: {},
      isPowered: true,
      brightness: 1,
      voltage: 3.3,
      telemetry: {},
    };
  }

  const esp32Comp = components[esp32Node.id];
  if (esp32Comp && !esp32Comp.pins) {
    esp32Comp.pins = {};
  }

  // Populate telemetry & pins for INPUT pins
  for (const inData of inputPinData) {
    const gpioHandle = `gpio${inData.pin}`;
    if (esp32Comp && esp32Comp.pins) {
      esp32Comp.pins[gpioHandle] = {
        handleId: gpioHandle,
        voltage: inData.voltage,
        normalizedValue: inData.logicHigh ? 1.0 : 0,
        active: true,
      };
    }
    if (esp32Comp && esp32Comp.telemetry !== undefined) {
      esp32Comp.telemetry[`gpio${inData.pin}_input_pin`] = inData.pin;
      esp32Comp.telemetry[`gpio${inData.pin}_input_pull`] = inData.pull;
      esp32Comp.telemetry[`gpio${inData.pin}_input_voltage`] = inData.voltage;
      esp32Comp.telemetry[`gpio${inData.pin}_input_logicHigh`] = inData.logicHigh;
    }
  }

  // --- Handle OUTPUT pins (gpio_write, including evaluated conditionals & persisted state) ---
  for (const [pinNum, pinState] of pins.entries()) {
    if (pinState?.mode !== "OUTPUT") continue;
    // Skip if PWM handles this pin without an explicit gpio_write override
    const hasPwm = pwmValues.has(pinNum);
    const hasExplicitDigitalWrite = pinValues.has(pinNum) || actions.some((a) => a.type === "gpio_write" && a.pin === pinNum);
    if (hasPwm && !hasExplicitDigitalWrite) continue;

    const isHigh = pinState.value > 0 || (pinState as any).value === true || (pinState as any).high === true;
    const gpioHandle = `gpio${pinNum}`;
    // ESP32 GPIO logic HIGH outputs 3.3V (NOT 5V)
    const voltage = isHigh ? 3.3 : 0;

    if (esp32Comp && esp32Comp.pins) {
      esp32Comp.pins[gpioHandle] = {
        handleId: gpioHandle,
        voltage,
        normalizedValue: isHigh ? 1.0 : 0,
        active: true,
      };
    }

    applyDrivenLoadsFromEndpoint({
      sourceNode: esp32Node,
      sourceHandle: gpioHandle,
      sourceVoltage: voltage,
      supplyVoltage: 3.3,
      nodes,
      edges,
      components,
    });
  }

  // --- Handle PWM OUTPUT pins (pwm_write) ---
  // Effective average voltage = 3.3V × dutyPercent/100.
  // applyDrivenLoadsFromEndpoint accepts fractional sourceVoltage — LED brightness
  // is computed as clamp01((sourceVoltage - forwardVoltage) / (sourceVoltage - 0.2))
  // in stateMaps.ts, which already scales with fractional input voltage.
  for (const [pinNum, pwmData] of pwmValues.entries()) {
    // Skip if this pin also has an explicit gpio_write action — gpio_write takes precedence
    const hasExplicitDigitalWrite = actions.some((a) => a.type === "gpio_write" && a.pin === pinNum);
    if (hasExplicitDigitalWrite) continue;

    const gpioHandle = `gpio${pinNum}`;
    const effectiveV = 3.3 * (Math.max(0, Math.min(100, pwmData.dutyPercent)) / 100);
    const pinHighFlag = effectiveV > 0;

    // Mark pin state with PWM duty value
    if (pinHighFlag) {
      pins.set(pinNum, {
        mode: "OUTPUT",
        value: Math.round((pwmData.dutyPercent / 100) * 255),
        frequency: pwmData.freqHz,
      });
    } else {
      pins.set(pinNum, {
        mode: "OUTPUT",
        value: 0,
        frequency: pwmData.freqHz,
      });
    }

    if (esp32Comp?.pins) {
      esp32Comp.pins[gpioHandle] = {
        handleId: gpioHandle,
        voltage: effectiveV,
        normalizedValue: pwmData.dutyPercent / 100,
        active: true,
      };
    }

    if (esp32Comp?.telemetry !== undefined) {
      esp32Comp.telemetry[`${gpioHandle}_pwm_duty`] = pwmData.dutyPercent;
      esp32Comp.telemetry[`${gpioHandle}_pwm_duty_u16`] = pwmData.dutyU16;
      esp32Comp.telemetry[`${gpioHandle}_pwm_voltage`] = effectiveV;
      if (pwmData.freqHz !== undefined) {
        esp32Comp.telemetry[`${gpioHandle}_pwm_freq`] = pwmData.freqHz;
      }
    }

    if (effectiveV > 0) {
      applyDrivenLoadsFromEndpoint({
        sourceNode: esp32Node,
        sourceHandle: gpioHandle,
        sourceVoltage: effectiveV,
        supplyVoltage: 3.3,
        dutyCycle: pwmData.dutyPercent / 100,
        nodes,
        edges,
        components,
      });
    }

    // Update wired Servo component telemetry if connected to this PWM pin
    for (const edge of edges) {
      const isEsp32Source =
        edge.source === esp32Node.id &&
        edge.sourceHandle === gpioHandle &&
        edge.targetHandle === "signal";
      const isEsp32Target =
        edge.target === esp32Node.id &&
        edge.targetHandle === gpioHandle &&
        edge.sourceHandle === "signal";

      if (isEsp32Source || isEsp32Target) {
        const targetNodeId = isEsp32Source ? edge.target : edge.source;
        const targetNode = nodes.find((n) => n.id === targetNodeId);
        if (targetNode && getNodeSimulationModel(targetNode) === "servo") {
          const dutyU16 = pwmData.dutyU16;
          const angle = Math.round(Math.max(0, Math.min(180, ((dutyU16 - 1638) / 6554) * 180)));
          const prev = components[targetNode.id];
          components[targetNode.id] = {
            ...(prev ?? {
              nodeId: targetNode.id,
              componentType: "servo",
              label: targetNode.data?.label ?? "Servo",
              isPowered: false,
              brightness: 0,
              voltage: 0,
              pins: {},
              telemetry: {},
            }),
            isPowered: true,
            brightness: 1,
            telemetry: {
              ...(prev?.telemetry ?? {}),
              angle,
              signalPin: pinNum,
            },
          };
        }
      }
    }
  }

  // --- Handle ADC reads (MicroPython machine.ADC and C++ analogRead) ---
  // Voltage is resolved via collectCircuitSourcesAndSinks — same code path as multimeter.
  // This guarantees ADC and multimeter readings are numerically identical for the same circuit.
  const adcActions: Esp32AdcAction[] = isPython
    ? parseEsp32PythonAdcActions(code)
    : actions.filter((a): a is Esp32AdcAction => a.type === "adc_read");

  if (adcActions.length > 0) {
    // Build source/sink map once for all ADC reads this frame
    const { sources, sinks } = collectCircuitSourcesAndSinks(baseFrame, {
      nodes,
      edges,
      dynamicComponents: context.dynamicComponents,
    });
    const directGraph = buildConductiveGraph(
      nodes,
      edges,
      { includeResistors: true },
      context.dynamicComponents,
    );
    // Pre-compute directSourceReach: endpoint -> [source, ...]
    const directSourceReach = new Map<string, (typeof sources)[number][]>();
    for (const source of sources) {
      for (const ep of getReachableGraphNodes(directGraph, source.handleId)) {
        const bucket = directSourceReach.get(ep) ?? [];
        bucket.push(source);
        directSourceReach.set(ep, bucket);
      }
    }

    for (const act of adcActions) {
      if (act.warning) {
        // Forbidden / out-of-range / non-ADC pin — store warning, skip voltage resolution
        if (esp32Comp?.telemetry !== undefined) {
          esp32Comp.telemetry[`gpio${act.pin}_adc_warning`] = act.warning;
        }
        continue;
      }

      const gpioHandle = `gpio${act.pin}`;
      const pinEndpoint = `${esp32Node.id}:${gpioHandle}`;

      // Walk the conductive graph from the ESP32 ADC pin to find live voltage
      const reachable = getReachableGraphNodes(directGraph, pinEndpoint);
      // Find the highest-voltage source reachable from this pin
      let wiperVoltage = 0;
      for (const ep of reachable) {
        const v = resolveEndpointVoltage(ep, directSourceReach);
        if (v > wiperVoltage) wiperVoltage = v;
      }
      // Also check if the pin endpoint itself maps to a source directly
      const directV = resolveEndpointVoltage(pinEndpoint, directSourceReach);
      if (directV > wiperVoltage) wiperVoltage = directV;

      // Check for Overvoltage (>3.3V)
      if (wiperVoltage > 3.305 && esp32Comp?.telemetry !== undefined) {
        esp32Comp.telemetry[`${gpioHandle}_adc_warning`] = `ADC OVERVOLTAGE — Pin ${gpioHandle} measured ${wiperVoltage.toFixed(2)}V, exceeds 3.3V safe limit, may damage real hardware.`;
      }

      // Clamp to 3.3V rail for simulation
      const clampedV = Math.max(0, Math.min(3.3, wiperVoltage));
      const fraction = clampedV / 3.3;

      const raw10 = Math.round(fraction * 1023);
      const raw12 = Math.round(fraction * 4095);
      const raw16 = Math.round(fraction * 65535);
      const rawUv = Math.round(fraction * 3_300_000);

      if (esp32Comp?.telemetry !== undefined) {
        esp32Comp.telemetry[`${gpioHandle}_adc_voltage`] = clampedV;
        esp32Comp.telemetry[`${gpioHandle}_adc_raw_10bit`] = raw10;
        esp32Comp.telemetry[`${gpioHandle}_adc_raw`] = raw12;
        esp32Comp.telemetry[`${gpioHandle}_adc_u16`] = raw16;
        esp32Comp.telemetry[`${gpioHandle}_adc_uv`] = rawUv;
      }
    }
  }

  return {
    ...baseFrame,
    components,
    bluetoothOutput,
    bluetoothDeviceName,
  };
}

/**
 * ESP32 MicroPython I2C LCD Frame Transformer
 * Applies parsed MicroPython I2C LCD state to connected lcd16x2 canvas components.
 */
export function applyEsp32LcdOutputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  if (frame.boardType !== "esp32") return frame;

  const { nodes, edges, picoCode, arduinoCode } = context;

  // Enforce language check: only process MicroPython I2C LCD code
  const isPython = isEffectivePython((context as any).selectedLanguage, nodes, arduinoCode, picoCode);
  const code = isPython ? (picoCode || arduinoCode || "") : (arduinoCode || picoCode || "");

  const lcdNodes = nodes.filter(
    (n) => getNodeSimulationModel(n) === "lcd16x2",
  );
  if (lcdNodes.length === 0) return frame;

  let sessionLcdStates: Map<number, any> | undefined;
  let defaultLcd: any | undefined;

  if (isPython) {
    const session = getOrCreateSession(code, frame.timestamp, "esp32");
    if (!session) return frame;
    sessionLcdStates = session.lcdStates;
    defaultLcd = session.lcdState;
  } else {
    sessionLcdStates = evaluateEsp32CppLcd(code, {
      tick: frame.tick,
      timestamp: frame.timestamp,
      nodes,
      edges,
    });
    if (!sessionLcdStates || sessionLcdStates.size === 0) return frame;
    defaultLcd = sessionLcdStates.get(0x27) ?? sessionLcdStates.values().next().value;
  }

  const components = { ...frame.components };
  let changed = false;

  for (const lcdNode of lcdNodes) {
    const addrStr = String(
      lcdNode.data.properties?.i2cAddress?.value ?? "0x27",
    );
    const hexMatch = addrStr.match(/0x([0-9a-fA-F]+)/);
    const addrNum = hexMatch
      ? parseInt(hexMatch[1], 16)
      : parseInt(addrStr, 10);

    const lcd =
      sessionLcdStates?.get(addrNum) ??
      (addrNum === 0x27 ? defaultLcd : undefined);

    if (!lcd) continue;

    const sdaPin = lcd.declaredSdaPin ?? 21; // Default ESP32 SDA pin
    const sclPin = lcd.declaredSclPin ?? 22; // Default ESP32 SCL pin

    // Enforce SPI Flash (GPIO 6-11) and out-of-range GPIO pin validation for declared SDA/SCL pins
    const isSdaForbidden = (sdaPin >= 6 && sdaPin <= 11) || sdaPin < 0 || sdaPin > 39;
    const isSclForbidden = (sclPin >= 6 && sclPin <= 11) || sclPin < 0 || sclPin > 39;

    const isSdaConnected = checkPicoDeclaredI2cPin(lcdNode.id, "sda", sdaPin, nodes, edges);
    const isSclConnected = checkPicoDeclaredI2cPin(lcdNode.id, "scl", sclPin, nodes, edges);

    const isBaseConnected = validateComponentConnections(lcdNode, nodes, edges);
    const isElectricallyConnected = isBaseConnected && isSdaConnected && isSclConnected;

    let isSignalOk = isElectricallyConnected && !isSdaForbidden && !isSclForbidden;
    let error: string | null = null;

    if (!isBaseConnected) {
      error = "Power Missing or Bus Disconnected";
    } else if (isSdaForbidden) {
      error = `Forbidden SPI Flash / Invalid Pin (GPIO ${sdaPin}) declared for I2C SDA`;
      isSignalOk = false;
    } else if (isSclForbidden) {
      error = `Forbidden SPI Flash / Invalid Pin (GPIO ${sclPin}) declared for I2C SCL`;
      isSignalOk = false;
    } else if (!isSdaConnected || !isSclConnected) {
      error = `I2C SDA/SCL Pin Miswire — Declared SDA=GPIO${sdaPin}, SCL=GPIO${sclPin} not connected to LCD`;
      isSignalOk = false;
    }

    const isPowered = isElectricallyConnected && !isSdaForbidden && !isSclForbidden;
    const l1Chars: string[] = [];
    const l2Chars: string[] = [];

    if (isPowered) {
      for (let c = 0; c < 16; c++) {
        const idx1 = c;
        const idx2 = 0x40 + c;
        l1Chars.push(String.fromCharCode(lcd.ddram[idx1] || 32));
        l2Chars.push(String.fromCharCode(lcd.ddram[idx2] || 32));
      }
    }

    const line1 = isPowered ? l1Chars.join("") : "";
    const line2 = isPowered ? l2Chars.join("") : "";

    const telemetryState = {
      isPowered,
      isSignalOk,
      hasConflict: false,
      error: error ?? "",
      line1,
      line2,
      backlight: isPowered && lcd.backlight ? "on" : "off",
      displayEnabled: isPowered && lcd.displayEnabled,
      cursorEnabled: isPowered && lcd.cursorEnabled,
    };

    components[lcdNode.id] = {
      ...(components[lcdNode.id] ?? {
        nodeId: lcdNode.id,
        componentType: lcdNode.data.componentType,
        label: lcdNode.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered,
      brightness: isPowered && lcd.backlight ? 1 : 0,
      telemetry: {
        ...(components[lcdNode.id]?.telemetry ?? {}),
        ...telemetryState,
      },
    };
    changed = true;
    let nextSerialOutput = frame.serialOutput ?? [];
    if (error && !isSignalOk) {
      const errorMsg = `>>> [I2C Error] ${error}`;
      if (!nextSerialOutput.includes(errorMsg)) {
        nextSerialOutput = [...nextSerialOutput, errorMsg];
      }
    }

    return changed ? {
      ...frame,
      components,
      serialOutput: nextSerialOutput,
      bluetoothOutput: frame.bluetoothOutput,
      bluetoothDeviceName: frame.bluetoothDeviceName,
    } : frame;
  }

  return frame;
}
