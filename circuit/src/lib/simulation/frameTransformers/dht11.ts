import type { SimulationFrame } from "../../simulation-state";
import { useCircuitStore, refreshSimulationFrameFromCurrentCircuit } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { validateComponentConnections } from "../../../utils/connectivity";
import { frameBoardPinsToArduinoPins, upsertPinState } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { parseTemperatureOutputPins } from "../../codeParsing/arduinoParser";
import { parseArduinoCode, ArduinoSimulator } from "../../arduino-simulator";

// DHT11 Operational Constants & Value Bounds
export const MIN_DHT11_TEMP = 0;
export const MAX_DHT11_TEMP = 50;
export const DEFAULT_DHT11_TEMP = 24;

export const MIN_DHT11_HUMIDITY = 20;
export const MAX_DHT11_HUMIDITY = 90;
export const DEFAULT_DHT11_HUMIDITY = 40;

// Persistent session state across simulation ticks
interface DhtSerialSession {
  lastLoggedCycle: number;
  history: string[];
}
const dhtSerialSessions = new Map<string, DhtSerialSession>();

// Formula & Clamping Helpers
export function clampDht11Temperature(temp: number): number {
  return Math.max(MIN_DHT11_TEMP, Math.min(MAX_DHT11_TEMP, temp));
}

export function clampDht11Humidity(hum: number): number {
  return Math.max(MIN_DHT11_HUMIDITY, Math.min(MAX_DHT11_HUMIDITY, hum));
}

export function calculateDht11TempRatio(temp: number): number {
  const clamped = clampDht11Temperature(temp);
  return (clamped - MIN_DHT11_TEMP) / (MAX_DHT11_TEMP - MIN_DHT11_TEMP);
}

export function calculateDht11TempFromRatio(ratio: number): number {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return MIN_DHT11_TEMP + clampedRatio * (MAX_DHT11_TEMP - MIN_DHT11_TEMP);
}

export function calculateDht11HumidityRatio(hum: number): number {
  const clamped = clampDht11Humidity(hum);
  return (clamped - MIN_DHT11_HUMIDITY) / (MAX_DHT11_HUMIDITY - MIN_DHT11_HUMIDITY);
}

export function calculateDht11HumidityFromRatio(ratio: number): number {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return MIN_DHT11_HUMIDITY + clampedRatio * (MAX_DHT11_HUMIDITY - MIN_DHT11_HUMIDITY);
}

// Store Action Handlers
export function updateDht11TemperatureInStore(nodeId: string, nextTemp: number): void {
  const clamped = clampDht11Temperature(nextTemp);
  useCircuitStore.setState((store) => ({
    nodes: store.nodes.map((node) =>
      node.id === nodeId
        ? {
          ...node,
          data: {
            ...node.data,
            properties: {
              ...node.data.properties,
              temperature: {
                ...(node.data.properties?.temperature ?? {
                  label: "Temperature",
                  type: "number",
                  unit: "°C",
                  min: MIN_DHT11_TEMP,
                  max: MAX_DHT11_TEMP,
                }),
                value: Math.round(clamped),
              },
            },
          },
        }
        : node
    ),
  }));

  refreshSimulationFrameFromCurrentCircuit();
}

export function updateDht11HumidityInStore(nodeId: string, nextHum: number): void {
  const clamped = clampDht11Humidity(nextHum);
  useCircuitStore.setState((store) => ({
    nodes: store.nodes.map((node) =>
      node.id === nodeId
        ? {
          ...node,
          data: {
            ...node.data,
            properties: {
              ...node.data.properties,
              humidity: {
                ...(node.data.properties?.humidity ?? {
                  label: "Humidity",
                  type: "number",
                  unit: "%",
                  min: MIN_DHT11_HUMIDITY,
                  max: MAX_DHT11_HUMIDITY,
                }),
                value: Math.round(clamped),
              },
            },
          },
        }
        : node
    ),
  }));

  refreshSimulationFrameFromCurrentCircuit();
}

// Simulation Frame Transformer
export function applyDht11InputToFrame(frame: SimulationFrame): SimulationFrame {
  const storeNodes = useCircuitStore.getState().nodes;
  const nodes = storeNodes && storeNodes.length > 0 ? storeNodes : ((frame as any).circuitNodes ?? []);

  const dhtNodes = nodes.filter(
    (node: any) =>
      getNodeSimulationModel(node) === "dht11" ||
      node.data.componentType === "dht11",
  );
  if (dhtNodes.length === 0) return frame;

  const edges = useCircuitStore.getState().edges ?? [];
  const poweredDhtNode = dhtNodes.find((n: any) => validateComponentConnections(n, nodes, edges));

  let pinsUpdatedFrame = frame;

  if (poweredDhtNode && (frame.boardType === "arduino" || frame.boardType === "pico")) {
    const isPico = nodes.some((n: any) => getNodeSimulationModel(n) === "raspberrypipico");
    const properties = poweredDhtNode.data.properties ?? {};
    const temperature = clampDht11Temperature(Number(properties.temperature?.value ?? DEFAULT_DHT11_TEMP));

    if (!isPico) {
      const pins = frameBoardPinsToArduinoPins(frame);
      const { arduinoCode } = useCircuitStore.getState();

      const temperatureOutput = parseTemperatureOutputPins(arduinoCode, temperature);
      for (const output of temperatureOutput.pins) {
        upsertPinState(pins, output.pin, output.high);
      }

      pinsUpdatedFrame = buildSimulationFrame({
        tick: frame.tick,
        nodes,
        edges,
        dynamicComponents: useDynamicComponentsStore.getState().components,
        boardType: frame.boardType,
        arduinoState: {
          pins,
          serialOutput: frame.serialOutput,
          running: frame.running,
          error: frame.error,
        },
        running: frame.running,
        error: frame.error,
      });
    }
  }

  const components = { ...frame.components, ...pinsUpdatedFrame.components };

  for (const n of dhtNodes) {
    const isPowered = validateComponentConnections(n, nodes, edges);
    const properties = n.data.properties ?? {};
    const temperature = isPowered ? clampDht11Temperature(Number(properties.temperature?.value ?? DEFAULT_DHT11_TEMP)) : 0;
    const humidity = isPowered ? clampDht11Humidity(Number(properties.humidity?.value ?? DEFAULT_DHT11_HUMIDITY)) : 0;

    const existingTelemetry = components[n.id]?.telemetry ?? {};
    const { error, ...restTelemetry } = existingTelemetry;

    components[n.id] = {
      ...(components[n.id] ?? {
        nodeId: n.id,
        componentType: n.data.componentType,
        label: n.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered,
      voltage: isPowered ? 5.0 : 0,
      telemetry: isPowered
        ? {
          ...restTelemetry,
          temperature,
          humidity,
        }
        : {
          ...existingTelemetry,
          error: "Sensor Pins Disconnected",
        },
    };
  }

  const isPico =
    frame.boardType === "pico" ||
    nodes.some((n: any) => getNodeSimulationModel(n) === "raspberrypipico");

  // Fix "nan" in serial output that occurs when AVR DHT library can't communicate
  // with the simulated sensor (one-wire protocol is not driven by the simulation).
  // Replace any "nan" occurrences in serial lines with the actual sensor values
  // from the DHT11 node's properties (set via the UI slider).
  // Dynamically update serial monitor output lines to reflect active DHT11 node slider properties
  const rawSerial = pinsUpdatedFrame.serialOutput ?? frame.serialOutput ?? [];
  if (!isPico && rawSerial.length > 0 && dhtNodes.length > 0) {
    const poweredDhtNode = dhtNodes.find((n: any) => validateComponentConnections(n, nodes, edges)) ?? dhtNodes[0];
    const properties = poweredDhtNode.data.properties ?? {};
    const temp = clampDht11Temperature(Number(properties.temperature?.value ?? DEFAULT_DHT11_TEMP));
    const hum = clampDht11Humidity(Number(properties.humidity?.value ?? DEFAULT_DHT11_HUMIDITY));
    const tempStr = Number.isInteger(temp) ? String(temp) : temp.toFixed(1);
    const humStr = Number.isInteger(hum) ? String(hum) : hum.toFixed(1);

    const tempF = temp * 1.8 + 32;
    const tempFStr = Number.isInteger(tempF) ? String(tempF) : tempF.toFixed(1);

    const { arduinoCode } = useCircuitStore.getState();
    const isDhtSketch = Boolean(arduinoCode && (/\bDHT\b/i.test(arduinoCode) || /\breadTemperature\b/i.test(arduinoCode)));

    // If AVR binary produced "DHT11 Error!" due to 1-wire timing in C++ library or DHT sketch is active,
    // evaluate the user's compiler sketch dynamically to produce their exact serial output format
    if (isDhtSketch || rawSerial.some((line: any) => {
      const text = typeof line === "string" ? line : line?.text ?? String(line);
      return /\bDHT(?:11)?\s*(?:Error|Read Error|Failed)\b/i.test(text);
    })) {
      if (arduinoCode) {
        try {
          const parsed = parseArduinoCode(arduinoCode);
          if (parsed.setup.length > 0 || parsed.loop.length > 0) {
            const mcuNode = nodes.find((n: any) => n.data?.componentType === "arduino-uno" || n.data?.componentType === "raspberry-pi-pico");
            const sessionKey = mcuNode?.id ?? "default";
            const isSimulating = useCircuitStore.getState().isSimulating;
            const tick = frame.tick ?? 0;

            if (!isSimulating || tick <= 1) {
              dhtSerialSessions.delete(sessionKey);
            }

            let session = dhtSerialSessions.get(sessionKey);
            if (!session) {
              session = { lastLoggedCycle: 0, history: [] };
              dhtSerialSessions.set(sessionKey, session);
            }

            let setupDuration = 0;
            for (const instr of parsed.setup) {
              if (instr.type === "delay") {
                setupDuration += instr.ms;
              }
            }

            let loopDuration = 0;
            for (const instr of parsed.loop) {
              if (instr.type === "delay") {
                loopDuration += instr.ms;
              } else if (instr.type === "ifBlock") {
                for (const sub of instr.thenBranch) {
                  if (sub.type === "delay") loopDuration += sub.ms;
                }
              }
            }
            const cycleDuration = loopDuration > 0 ? loopDuration : 1000;

            const loopElapsed = Math.max(0, frame.timestamp - setupDuration);
            const currentCycle = loopElapsed > 0 ? 1 + Math.floor(loopElapsed / cycleDuration) : 1;

            if (session.lastLoggedCycle === 0) {
              const newLines: string[] = [];
              const sim = new ArduinoSimulator((state) => {
                const lines = state.serialOutput.map((l: any) => typeof l === "string" ? l : l?.text ?? String(l));
                newLines.length = 0;
                newLines.push(...lines);
              });
              for (const instr of parsed.setup) {
                (sim as any).executeInstruction(instr);
              }
              for (const instr of parsed.loop) {
                (sim as any).executeInstruction(instr);
              }
              session.history.push(...newLines);
              session.lastLoggedCycle = currentCycle;
            } else if (currentCycle > session.lastLoggedCycle) {
              const missedCycles = currentCycle - session.lastLoggedCycle;
              for (let c = 0; c < missedCycles; c++) {
                const newLines: string[] = [];
                const sim = new ArduinoSimulator((state) => {
                  const lines = state.serialOutput.map((l: any) => typeof l === "string" ? l : l?.text ?? String(l));
                  newLines.length = 0;
                  newLines.push(...lines);
                });
                for (const instr of parsed.loop) {
                  (sim as any).executeInstruction(instr);
                }
                session.history.push(...newLines);
              }
              if (session.history.length > 100) {
                session.history.splice(0, session.history.length - 100);
              }
              session.lastLoggedCycle = currentCycle;
            }

            if (session.history.length > 0) {
              return {
                ...pinsUpdatedFrame,
                components,
                serialOutput: [...session.history],
              };
            }
          }
        } catch (_) { }
      }
    }

    const fixedSerial = rawSerial.map((line) => {
      let updated = line;
      let replacedAny = false;

      // Only replace literal 'nan' occurrences; never overwrite historical numbers
      if (/(Temperature|Temp|TempC|Celsius|\bT)\s*:\s*nan\b/gi.test(updated)) {
        updated = updated.replace(/(Temperature|Temp|TempC|Celsius|\bT)\s*:\s*nan\b/gi, `$1: ${tempStr}`);
        replacedAny = true;
      }
      if (/(Fahrenheit|TempF|DegF)\s*:\s*nan\b/gi.test(updated)) {
        updated = updated.replace(/(Fahrenheit|TempF|DegF)\s*:\s*nan\b/gi, `$1: ${tempFStr}`);
        replacedAny = true;
      }

      // Only replace literal 'nan' humidity outputs
      if (/(Humidity|Hum|RH|\bH)\s*:\s*nan\b/gi.test(updated)) {
        updated = updated.replace(/(Humidity|Hum|RH|\bH)\s*:\s*nan\b/gi, `$1: ${humStr}`);
        replacedAny = true;
      }

      if (replacedAny) return updated;

      // Context-aware fallback for lines containing "nan" without explicit labels
      if (/\bnan\b/i.test(line)) {
        let nanCount = 0;
        return line.replace(/(?:(.*?))(\bnan\b)/gi, (match, prefix: string) => {
          nanCount++;
          const lowerPrefix = prefix.toLowerCase();
          if (/\b(?:fahrenheit|degf|tempf)\b|f\s*[:=]?\s*$/i.test(lowerPrefix) || /\|\s*fahrenheit/i.test(lowerPrefix)) {
            return prefix + tempFStr;
          }
          if (/\b(?:humidity|hum|rh)\b|%\s*$/i.test(lowerPrefix) || /\|\s*humidity/i.test(lowerPrefix)) {
            return prefix + humStr;
          }
          if (/\b(?:celsius|temp|tempc|temperature)\b|c\s*[:=]?\s*$/i.test(lowerPrefix)) {
            return prefix + tempStr;
          }

          const totalNansInLine = (line.match(/\bnan\b/gi) || []).length;
          if (totalNansInLine >= 3) {
            if (nanCount === 1) return prefix + tempStr;
            if (nanCount === 2) return prefix + tempFStr;
            if (nanCount === 3) return prefix + humStr;
          } else {
            if (nanCount === 1) return prefix + tempStr;
            if (nanCount === 2) return prefix + humStr;
          }
          return prefix + tempStr;
        });
      }

      return line;
    });

    return {
      ...pinsUpdatedFrame,
      components,
      serialOutput: fixedSerial,
    };
  }

  return {
    ...pinsUpdatedFrame,
    components,
  };
}
