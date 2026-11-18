import type { SimulationFrame } from "../../simulation-state";
import { useCircuitStore, refreshSimulationFrameFromCurrentCircuit } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import { validateComponentConnections } from "../../../utils/connectivity";
import { frameBoardPinsToArduinoPins, upsertPinState } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { parseTemperatureOutputPins } from "../../codeParsing/arduinoParser";
import { parseArduinoCode, ArduinoSimulator } from "../../arduino-simulator";

// DHT22 (AM2302) Operational Constants & Value Bounds
export const MIN_DHT22_TEMP = -40;
export const MAX_DHT22_TEMP = 80;
export const DEFAULT_DHT22_TEMP = 24;

export const MIN_DHT22_HUMIDITY = 0;
export const MAX_DHT22_HUMIDITY = 100;
export const DEFAULT_DHT22_HUMIDITY = 40;

// Persistent session state across simulation ticks
interface Dht22SerialSession {
  lastLoggedCycle: number;
  history: string[];
}
const dht22SerialSessions = new Map<string, Dht22SerialSession>();

// Formula & Clamping Helpers
export function clampDht22Temperature(temp: number): number {
  return Math.max(MIN_DHT22_TEMP, Math.min(MAX_DHT22_TEMP, temp));
}

export function clampDht22Humidity(hum: number): number {
  return Math.max(MIN_DHT22_HUMIDITY, Math.min(MAX_DHT22_HUMIDITY, hum));
}

export function calculateDht22TempRatio(temp: number): number {
  const clamped = clampDht22Temperature(temp);
  return (clamped - MIN_DHT22_TEMP) / (MAX_DHT22_TEMP - MIN_DHT22_TEMP);
}

export function calculateDht22TempFromRatio(ratio: number): number {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return MIN_DHT22_TEMP + clampedRatio * (MAX_DHT22_TEMP - MIN_DHT22_TEMP);
}

export function calculateDht22HumidityRatio(hum: number): number {
  const clamped = clampDht22Humidity(hum);
  return (clamped - MIN_DHT22_HUMIDITY) / (MAX_DHT22_HUMIDITY - MIN_DHT22_HUMIDITY);
}

export function calculateDht22HumidityFromRatio(ratio: number): number {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return MIN_DHT22_HUMIDITY + clampedRatio * (MAX_DHT22_HUMIDITY - MIN_DHT22_HUMIDITY);
}

// Store Action Handlers
export function updateDht22TemperatureInStore(nodeId: string, nextTemp: number): void {
  const clamped = clampDht22Temperature(nextTemp);
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
                  min: MIN_DHT22_TEMP,
                  max: MAX_DHT22_TEMP,
                }),
                value: Number(clamped.toFixed(1)),
              },
            },
          },
        }
        : node
    ),
  }));

  refreshSimulationFrameFromCurrentCircuit();
}

export function updateDht22HumidityInStore(nodeId: string, nextHum: number): void {
  const clamped = clampDht22Humidity(nextHum);
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
                  min: MIN_DHT22_HUMIDITY,
                  max: MAX_DHT22_HUMIDITY,
                }),
                value: Number(clamped.toFixed(1)),
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
export function applyDht22InputToFrame(frame: SimulationFrame): SimulationFrame {
  const storeNodes = useCircuitStore.getState().nodes;
  const nodes = storeNodes && storeNodes.length > 0 ? storeNodes : ((frame as any).circuitNodes ?? []);

  const dhtNodes = nodes.filter(
    (node: any) =>
      getNodeSimulationModel(node) === "dht22" ||
      node.data.componentType === "dht22",
  );
  if (dhtNodes.length === 0) return frame;

  const edges = useCircuitStore.getState().edges ?? [];
  const poweredDhtNode = dhtNodes.find((n: any) => validateComponentConnections(n, nodes, edges));

  let pinsUpdatedFrame = frame;

  if (poweredDhtNode && (frame.boardType === "arduino" || frame.boardType === "pico")) {
    const isPico = nodes.some((n: any) => getNodeSimulationModel(n) === "raspberrypipico");
    const properties = poweredDhtNode.data.properties ?? {};
    const temperature = clampDht22Temperature(Number(properties.temperature?.value ?? DEFAULT_DHT22_TEMP));

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
    const temperature = isPowered ? clampDht22Temperature(Number(properties.temperature?.value ?? DEFAULT_DHT22_TEMP)) : 0;
    const humidity = isPowered ? clampDht22Humidity(Number(properties.humidity?.value ?? DEFAULT_DHT22_HUMIDITY)) : 0;

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

  // Fix "nan" in serial output and evaluate user sketch for DHT22 dynamically (Arduino only)
  const rawSerial = pinsUpdatedFrame.serialOutput ?? frame.serialOutput ?? [];
  if (!isPico && rawSerial.length > 0 && dhtNodes.length > 0) {
    const poweredDhtNode = dhtNodes.find((n: any) => validateComponentConnections(n, nodes, edges)) ?? dhtNodes[0];
    const properties = poweredDhtNode.data.properties ?? {};
    const temp = clampDht22Temperature(Number(properties.temperature?.value ?? DEFAULT_DHT22_TEMP));
    const hum = clampDht22Humidity(Number(properties.humidity?.value ?? DEFAULT_DHT22_HUMIDITY));
    const tempStr = temp.toFixed(1);
    const humStr = hum.toFixed(1);

    const tempF = temp * 1.8 + 32;
    const tempFStr = tempF.toFixed(1);

    const { arduinoCode } = useCircuitStore.getState();
    const isDhtSketch = Boolean(arduinoCode && (/\bDHT\b/i.test(arduinoCode) || /\breadTemperature\b/i.test(arduinoCode)));

    if (isDhtSketch || rawSerial.some((line: any) => {
      const text = typeof line === "string" ? line : line?.text ?? String(line);
      return /\bDHT(?:22)?\s*(?:Error|Read Error|Failed)\b/i.test(text);
    })) {
      if (arduinoCode) {
        try {
          const parsed = parseArduinoCode(arduinoCode);
          if (parsed.setup.length > 0 || parsed.loop.length > 0) {
            const mcuNode = nodes.find((n: any) => n.data?.componentType === "arduino-uno" || n.data?.componentType === "raspberry-pi-pico");
            const sessionKey = mcuNode?.id ?? "default_dht22";
            const isSimulating = useCircuitStore.getState().isSimulating;
            const tick = frame.tick ?? 0;

            if (!isSimulating || tick <= 1) {
              dht22SerialSessions.delete(sessionKey);
            }

            let session = dht22SerialSessions.get(sessionKey);
            if (!session) {
              session = { lastLoggedCycle: 0, history: [] };
              dht22SerialSessions.set(sessionKey, session);
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

      if (/(Temperature|Temp|TempC|Celsius|\bT)\s*:\s*nan\b/gi.test(updated)) {
        updated = updated.replace(/(Temperature|Temp|TempC|Celsius|\bT)\s*:\s*nan\b/gi, `$1: ${tempStr}`);
        replacedAny = true;
      }
      if (/(Fahrenheit|TempF|DegF)\s*:\s*nan\b/gi.test(updated)) {
        updated = updated.replace(/(Fahrenheit|TempF|DegF)\s*:\s*nan\b/gi, `$1: ${tempFStr}`);
        replacedAny = true;
      }

      if (/(Humidity|Hum|RH|\bH)\s*:\s*nan\b/gi.test(updated)) {
        updated = updated.replace(/(Humidity|Hum|RH|\bH)\s*:\s*nan\b/gi, `$1: ${humStr}`);
        replacedAny = true;
      }

      if (replacedAny) return updated;

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
