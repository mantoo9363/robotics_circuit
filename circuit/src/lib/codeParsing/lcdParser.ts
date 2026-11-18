import { stripCodeComments, parseArduinoConstants, resolveArduinoNumber, evaluateExpression, resolveTokenValue, splitOuterCommas, decodeArduinoStringLiteral, writeLcdText, lcdBufferToLines, getConnectedBoardPin, parsePhotoresistorAnalogValue } from "./arduinoParser";
import type { CircuitNode, CircuitEdge } from "../types";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../circuit/graph";
import { getNodeSimulationModelForStore } from "../circuit/components";
import { validateComponentConnections } from "../../utils/connectivity";
import { findMCUBoardNode, getBoardAdapter } from "../circuit/boardAdapter";
import { TILT_THRESHOLD } from "../simulation-state";
import { useCircuitStore } from "../store";

const arduinoSessions = new Map<string, {
  variables: Map<string, number>;
  lastTick: number;
}>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface LCDState {
  ddram: Uint8Array;
  cgram: Uint8Array;
  
  cursorColumn: number;
  cursorRow: number;
  displayEnabled: boolean;
  cursorEnabled: boolean;
  blinkEnabled: boolean;
  backlightEnabled: boolean;
  scrollOffset: number;
  incrementMode: boolean;
  autoscroll: boolean;
  i2cLog: string[];
  error?: string | null;
}

export interface I2CBackpackDriver {
  logWrite(address: number, dataBytes: number[], state: LCDState): void;
}

export class PCF8574Driver implements I2CBackpackDriver {
  logWrite(address: number, dataBytes: number[], state: LCDState): void {
    const writeByteHex = "0x" + (address * 2).toString(16).toUpperCase();
    const bytesStr = dataBytes
      .map((b) => "0x" + b.toString(16).toUpperCase().padStart(2, "0"))
      .join(", ");
    state.i2cLog.push(
      `START -> ${writeByteHex} -> ACK -> ${bytesStr} -> ACK -> STOP`,
    );
    if (state.i2cLog.length > 30) state.i2cLog.shift();
  }
}

export class MCP23008Driver implements I2CBackpackDriver {
  logWrite(address: number, dataBytes: number[], state: LCDState): void {
    const writeByteHex = "0x" + (address * 2).toString(16).toUpperCase();
    const bytesStr = dataBytes
      .map((b) => "0x" + b.toString(16).toUpperCase().padStart(2, "0"))
      .join(", ");
    state.i2cLog.push(
      `START -> ${writeByteHex} -> ACK -> 0x09 (GPIO) -> ACK -> ${bytesStr} -> ACK -> STOP`,
    );
    if (state.i2cLog.length > 30) state.i2cLog.shift();
  }
}

function getDisplayControlCmd(state: LCDState) {
  return 0x08 |
    (state.displayEnabled ? 0x04 : 0) |
    (state.cursorEnabled ? 0x02 : 0) |
    (state.blinkEnabled ? 0x01 : 0);
}

export function resolveIfElse(code: string, evaluateCondition: (cond: string) => boolean | "unknown"): string {
  let result = "";
  let i = 0;

  while (i < code.length) {
    const match = code.slice(i).match(/^if\s*\(/);
    if (!match) {
      result += code[i];
      i++;
      continue;
    }

    let ifStart = i;
    i += match[0].length;

    let depth = 1;
    let condStart = i;
    let condEnd = -1;
    while (i < code.length) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") {
        depth--;
        if (depth === 0) {
          condEnd = i;
          break;
        }
      }
      i++;
    }

    if (condEnd === -1) {
      result += code.slice(ifStart, i);
      continue;
    }

    const condition = code.slice(condStart, condEnd).trim();
    i++; // move past ')'

    const parseStatementOrBlock = (): { body: string; endIdx: number } => {
      while (i < code.length && /\s/.test(code[i])) i++;
      if (i >= code.length) return { body: "", endIdx: i };

      if (code[i] === "{") {
        let blockDepth = 1;
        let blockStart = i + 1;
        i++;
        while (i < code.length) {
          if (code[i] === "{") blockDepth++;
          else if (code[i] === "}") {
            blockDepth--;
            if (blockDepth === 0) {
              i++; // Move past the closing brace
              return { body: code.slice(blockStart, i - 1), endIdx: i };
            }
          }
          i++;
        }
        return { body: code.slice(blockStart), endIdx: i };
      }

      const ifSubMatch = code.slice(i).match(/^if\s*\(/);
      if (ifSubMatch) {
        let stmtStart = i;
        i += ifSubMatch[0].length;
        let d = 1;
        while (i < code.length) {
          if (code[i] === "(") d++;
          else if (code[i] === ")") {
            d--;
            if (d === 0) {
              i++;
              break;
            }
          }
          i++;
        }
        parseStatementOrBlock();
        while (i < code.length && /\s/.test(code[i])) i++;
        if (code.slice(i).startsWith("else")) {
          i += 4;
          parseStatementOrBlock();
        }
        return { body: code.slice(stmtStart, i), endIdx: i };
      }

      let stmtStart = i;
      while (i < code.length && code[i] !== ";") i++;
      if (i < code.length) i++;
      return { body: code.slice(stmtStart, i), endIdx: i };
    };

    const { body: thenBody, endIdx: thenEnd } = parseStatementOrBlock();
    i = thenEnd;

    while (i < code.length && /\s/.test(code[i])) i++;

    let elseBody = "";
    if (code.slice(i).startsWith("else")) {
      i += 4;
      const { body: eBody, endIdx: elseEnd } = parseStatementOrBlock();
      elseBody = eBody;
      i = elseEnd;
    }

    const conditionResult = evaluateCondition(condition);
    if (conditionResult === "unknown") {
      // Runtime-dependent condition — include both branches
      result += resolveIfElse(thenBody, evaluateCondition);
      if (elseBody) {
        result += resolveIfElse(elseBody, evaluateCondition);
      }
    } else if (conditionResult) {
      result += resolveIfElse(thenBody, evaluateCondition);
    } else if (elseBody) {
      result += resolveIfElse(elseBody, evaluateCondition);
    }
  }

  return result;
}

export function parseLcdDisplayText(
  code: string,
  backpackType?: string,
  lcdAddress?: number,
  fullArduinoCode: string = "",
  nodes: CircuitNode[] = [],
  edges: CircuitEdge[] = [],
  activePassword = "",
  keypadPassword: string = "",
): Array<{
  name: string;
  address: number;
  state: LCDState;
}> | null {
  const cleaned = stripCodeComments(code);
  const cleanedFull = fullArduinoCode ? stripCodeComments(fullArduinoCode) : cleaned;

  if (
    !/\b(?:Adafruit_)?LiquidCrystal(_I2C)?\b/.test(cleaned) &&
    !/\bhd44780\b/.test(cleaned) &&
    !/\.(print|write|clear|backlight|noBacklight|display|noDisplay|cursor|noCursor|blink|noBlink|home|setCursor|scrollDisplayLeft|scrollDisplayRight|autoscroll|noAutoscroll|leftToRight|rightToLeft|createChar|command)\s*\(/.test(
      cleaned,
    )
  )
    return null;

  const sketchAddresses = new Set<number>();
  let sketchAddress: number | null = null;
  let sketchBackpack: string | null = null;
  let className: string | null = null;

  const ctorPattern =
    /\b(LiquidCrystal_I2C|hd44780_I2Cexp|Adafruit_LiquidCrystal)\s+[A-Za-z_]\w*\s*\(\s*([^,\s)]+)/gi;
  const ctorMatches = [...cleanedFull.matchAll(ctorPattern)];

  for (const ctorMatch of ctorMatches) {
    className = ctorMatch[1];
    const addrToken = ctorMatch[2].trim();

    if (className === "Adafruit_LiquidCrystal") {
      sketchBackpack = "MCP23008";
    } else {
      sketchBackpack = "PCF8574";
    }

    let resolved: number | null = null;
    if (addrToken.toLowerCase().startsWith("0x")) {
      resolved = parseInt(addrToken, 16);
    } else if (/^\d+$/.test(addrToken)) {
      resolved = parseInt(addrToken, 10);
    } else {
      const fullConstants = parseArduinoConstants(fullArduinoCode);
      if (fullConstants.has(addrToken)) {
        resolved = fullConstants.get(addrToken)!;
      }
    }

    if (resolved !== null) {
      sketchAddresses.add(resolved);
      if (sketchAddress === null) sketchAddress = resolved;
    }
  }

  if (
    sketchBackpack !== null &&
    backpackType &&
    sketchBackpack !== backpackType
  ) {
    return [
      {
        name: "lcd",
        address: lcdAddress ?? 0x27,
        state: {
          ddram: new Uint8Array(80).fill(32),
          cgram: new Uint8Array(64),
          cursorColumn: 0,
          cursorRow: 0,
          displayEnabled: false,
          cursorEnabled: false,
          blinkEnabled: false,
          backlightEnabled: false,
          scrollOffset: 0,
          incrementMode: true,
          autoscroll: false,
          i2cLog: [],
          error: `I2C Backpack Type Mismatch! Sketch uses class ${className} (expects ${sketchBackpack}), but LCD properties are set to ${backpackType}.`,
        },
      },
    ];
  }

  if (
    sketchAddresses.size > 0 &&
    lcdAddress !== undefined &&
    !sketchAddresses.has(lcdAddress)
  ) {
    const hexSketch = Array.from(sketchAddresses)
      .map((a) => "0x" + a.toString(16).toUpperCase())
      .join(", ");
    const hexLcd = "0x" + lcdAddress.toString(16).toUpperCase();
    return [
      {
        name: "lcd",
        address: lcdAddress,
        state: {
          ddram: new Uint8Array(80).fill(32),
          cgram: new Uint8Array(64),
          cursorColumn: 0,
          cursorRow: 0,
          displayEnabled: false,
          cursorEnabled: false,
          blinkEnabled: false,
          backlightEnabled: false,
          scrollOffset: 0,
          incrementMode: true,
          autoscroll: false,
          i2cLog: [],
          error: `I2C Address Mismatch! Sketch uses ${hexSketch}, but LCD properties are set to ${hexLcd}.`,
        },
      },
    ];
  }

  const createDefaultLCDState = (): LCDState => ({
    ddram: new Uint8Array(80).fill(32),
    cgram: new Uint8Array(64),
    cursorColumn: 0,
    cursorRow: 0,
    displayEnabled: true,
    cursorEnabled: false,
    blinkEnabled: false,
    backlightEnabled: true,
    scrollOffset: 0,
    incrementMode: true,
    autoscroll: false,
    i2cLog: [],
  });

  const lcdObjects = new Map<string, { address: number; state: LCDState }>();
  lcdObjects.set("lcd", { address: 0x27, state: createDefaultLCDState() });

  const lcdDeclPattern =
    /\b(?:LiquidCrystal_I2C|hd44780_I2Cexp|Adafruit_LiquidCrystal|LiquidCrystal)\s+([A-Za-z_]\w*)\s*(?:\(\s*([^)]*)\s*\))?\s*;?/g;
  for (const match of cleanedFull.matchAll(lcdDeclPattern)) {
    const name = match[1];
    const args = match[2] ? match[2].split(",") : [];
    let address = 0x27;
    if (args.length > 0) {
      const resolved = evaluateExpression(args[0], parseArduinoConstants(fullArduinoCode));
      if (resolved !== 0) address = resolved;
    }
    lcdObjects.set(name, { address, state: createDefaultLCDState() });
  }

  if (lcdObjects.size > 1) {
    lcdObjects.delete("lcd");
  }

  const mcuNode = findMCUBoardNode(nodes);
  const mcuAdapter = getBoardAdapter(mcuNode);

  const getPinForModel = (modelName: string, defaultPin: number) => {
    const node = nodes.find(
      (n) => getNodeSimulationModelForStore(n) === modelName || n.data.componentType === modelName,
    );
    if (!node || !mcuNode) return defaultPin;
    const graph = buildConductiveGraphForStore(nodes, edges, { includeResistors: true });
    const startKey = `${node.id}:out`;
    const reachable = getReachableGraphNodes(graph, startKey);
    const reachablePin = mcuAdapter.getReachablePinNumber(mcuNode.id, reachable);
    if (reachablePin !== null) return reachablePin;

    for (const edge of edges) {
      let boardPinHandle: string | null | undefined = null;
      if (edge.source === node.id && edge.target === mcuNode.id) boardPinHandle = edge.targetHandle;
      else if (edge.target === node.id && edge.source === mcuNode.id) boardPinHandle = edge.sourceHandle;
      if (boardPinHandle) {
        const parsed = mcuAdapter.parseHandleToPinNumber(boardPinHandle);
        if (parsed) return parsed.pinNumber;
      }
    }
    return defaultPin;
  };
  const getUltrasonicPin = (): number => {
    const ultrasonicNode = nodes.find(
      (n) => getNodeSimulationModelForStore(n) === "ultrasonicDistance",
    );
    if (!ultrasonicNode || !mcuNode) return 4;
    const graph = buildConductiveGraphForStore(nodes, edges, { includeResistors: true });
    const startKey = `${ultrasonicNode.id}:echo`;
    const reachable = getReachableGraphNodes(graph, startKey);
    if (mcuAdapter.boardType === "arduino") {
      const pin = mcuAdapter.getReachablePinNumber(mcuNode.id, reachable);
      if (pin !== null && pin <= 13) return pin;
    }
    return 4;
  };

  const getSensorConnectedPin = (node: CircuitNode | undefined, pinIds: string[], defaultPin: number): number => {
    if (!node) return defaultPin;
    for (const pinId of pinIds) {
      const conn = getConnectedBoardPin(node.id, pinId, nodes, edges);
      if (conn) return conn.pinNumber;
    }
    return defaultPin;
  };

  const gasNode = nodes.find((n) => getNodeSimulationModelForStore(n) === "gasSensor");
  const isGasConnected = gasNode ? validateComponentConnections(gasNode, nodes, edges) : false;
  const gasPin = getSensorConnectedPin(gasNode, ["b1", "b2"], 14);
  const gasVal = (gasNode && isGasConnected) ? Number(gasNode.data.properties?.gasLevel?.value ?? 0) : 0;

  const soilNode = nodes.find((n) => getNodeSimulationModelForStore(n) === "soilMoisture");
  const isSoilConnected = soilNode ? validateComponentConnections(soilNode, nodes, edges) : false;
  const soilPin = getSensorConnectedPin(soilNode, ["sig1", "sig2"], 15);
  const soilVal = (soilNode && isSoilConnected) ? Number(soilNode.data.properties?.moisture?.value ?? 0) : 0;

  const dhtNode = nodes.find((n) => getNodeSimulationModelForStore(n) === "dht11" || getNodeSimulationModelForStore(n) === "dht22" || n.data?.componentType === "dht11" || n.data?.componentType === "dht22");
  const isDhtConnected = dhtNode ? validateComponentConnections(dhtNode, nodes, edges) : false;

  const tempNode = nodes.find((n) => getNodeSimulationModelForStore(n) === "temperatureSensor");
  const isTempConnected = tempNode ? validateComponentConnections(tempNode, nodes, edges) : false;
  const tempPin = getSensorConnectedPin(tempNode, ["vout"], 16);
  const tempCelsius = (tempNode && isTempConnected) ? Number(tempNode.data.properties?.temperature?.value ?? 25) : 0;
  const tmpValue_raw = isTempConnected ? Math.round(((tempCelsius * 0.01 + 0.5) / 5.0) * 1023) : 0;

  const dhtTempCelsius = (dhtNode && isDhtConnected)
    ? Number(dhtNode.data.properties?.temperature?.value ?? 24)
    : tempCelsius;
  const dhtHumidity = (dhtNode && isDhtConnected) ? Number(dhtNode.data.properties?.humidity?.value ?? 40) : 0;

  const ultrasonicNode = nodes.find((n) => getNodeSimulationModelForStore(n) === "ultrasonicDistance");
  const isUltrasonicConnected = ultrasonicNode ? validateComponentConnections(ultrasonicNode, nodes, edges) : false;
  const echoPin = getUltrasonicPin();
  const distVal = (ultrasonicNode && isUltrasonicConnected) ? Number(ultrasonicNode.data.properties?.distance?.value ?? 100) : 0;
  const duration_raw = isUltrasonicConnected ? Math.round((distVal * 2) / 0.0343) : 0;

  const ldrNode = nodes.find((n) => getNodeSimulationModelForStore(n) === "photoresistor");
  const isLdrConnected = ldrNode ? validateComponentConnections(ldrNode, nodes, edges) : false;
  const ldrPin = getSensorConnectedPin(ldrNode, ["pin1", "pin2"], 14);
  const ldrVal = (ldrNode && isLdrConnected) ? parsePhotoresistorAnalogValue(ldrNode) : 0;

  const pirNode = nodes.find((n) => getNodeSimulationModelForStore(n) === "pirSensor");
  const isPirConnected = pirNode ? validateComponentConnections(pirNode, nodes, edges) : false;
  const pirPin = getSensorConnectedPin(pirNode, ["signal"], 2);
  const pirMotionVal = pirNode ? (pirNode.data as any)?.pirMotion ?? pirNode.data.properties?.motion?.value : false;
  const pirMotion = isPirConnected && (pirMotionVal === true || pirMotionVal === "true" || pirMotionVal === 1 || pirMotionVal === "1");

  const forceNode = nodes.find((n) => getNodeSimulationModelForStore(n) === "forceSensor");
  const isForceConnected = forceNode ? validateComponentConnections(forceNode, nodes, edges) : false;
  const forcePin = getSensorConnectedPin(forceNode, ["pin1", "pin2"], 14);
  const forceValRaw = forceNode ? Number(forceNode.data.properties?.force?.value ?? 0) : 0;
  const forceVal = isForceConnected ? Math.round((forceValRaw / 10) * 1023) : 0;

  const flexNode = nodes.find((n) => getNodeSimulationModelForStore(n) === "flexSensor");
  const isFlexConnected = flexNode ? validateComponentConnections(flexNode, nodes, edges) : false;
  const flexPin = getSensorConnectedPin(flexNode, ["pin1", "pin2"], 14);
  const flexValRaw = flexNode ? Number(flexNode.data.properties?.bend?.value ?? 0) : 0;
  const flexVal = isFlexConnected ? Math.round((1 - flexValRaw / 180) * 1023) : 0;

  const sensorConstants = parseArduinoConstants(fullArduinoCode);
  const variables = new Map<string, number>();
  for (const [k, v] of sensorConstants.entries()) variables.set(k, v);
  for (let i = 0; i <= 5; i++) variables.set(`A${i}`, 14 + i);
  variables.set("HIGH", 1); variables.set("LOW", 0); variables.set("INPUT", 1);
  variables.set("OUTPUT", 0); variables.set("BIN", 2); variables.set("OCT", 8);
  variables.set("DEC", 10); variables.set("HEX", 16);

  const sessionKey = mcuNode ? mcuNode.id : "default";
  const isSimulating = useCircuitStore.getState().isSimulating;
  const tick = useCircuitStore.getState().simulationFrame?.tick ?? 0;

  if (!isSimulating || tick === 0) {
    arduinoSessions.delete(sessionKey);
  }

  let session = arduinoSessions.get(sessionKey);
  if (!session) {
    session = {
      variables: new Map<string, number>(),
      lastTick: tick,
    };
    arduinoSessions.set(sessionKey, session);
  }

  if (session.variables.size === 0) {
    for (const [k, v] of variables.entries()) {
      session.variables.set(k, v);
    }
    const initialAssignmentPattern = /(?:(?:const\s+)?\b(?:int|float|double|long|short|byte|uint8_t|uint16_t|uint32_t|char|bool|auto)\s+)?\b([A-Za-z_]\w*)\s*(?<![!<>=+\-*/])=(?!=)\s*([^;]+)/g;
    for (const match of cleaned.matchAll(initialAssignmentPattern)) {
      const varName = match[1];
      const exprStr = match[2];
      const val = evaluateWithSensors(exprStr);
      session.variables.set(varName, val);
    }
  }

  for (const [k, v] of session.variables.entries()) {
    variables.set(k, v);
  }

  function replaceBinaryLiterals(str: string): string {
    let res = str.replace(/\b0b([01]+)\b/g, (_, bin) => String(parseInt(bin, 2)));
    res = res.replace(/\bB([01]+)\b/g, (_, bin) => String(parseInt(bin, 2)));
    return res;
  }

  function readDigitalPinState(pinNum: number): number {
    if (!mcuNode) return 1;

    for (const node of nodes) {
      const ct = node.data.componentType ?? "";
      const sm = node.data.simulationModel ?? "";
      const isPushButton = ct === "pushbutton" || sm === "pushbutton";
      const isSlideSwitch = ct === "slideswitch" || sm === "slideswitch";
      const isPir = ct === "pirSensor" || sm === "pirSensor";
      const isTilt = ct === "tiltSensor" || sm === "tiltSensor";
      if (!isPushButton && !isSlideSwitch && !isPir && !isTilt) continue;

      let connectedPin: number | null = null;
      const handlesToCheck = isSlideSwitch
        ? ["common", "pin1", "pin2"]
        : isPushButton
          ? ["pin1", "pin2", "terminal1", "terminal2"]
          : isTilt
            ? ["pin1", "pin2"]
            : ["signal", "out"];

      for (const h of handlesToCheck) {
        const conn = getConnectedBoardPin(node.id, h, nodes, edges);
        if (conn) {
          connectedPin = conn.pinNumber;
          break;
        }
      }

      if (connectedPin === null) {
        for (const edge of edges) {
          const connectsToComp = edge.source === node.id || edge.target === node.id;
          const connectsToBoard = edge.source === mcuNode.id || edge.target === mcuNode.id;
          if (!connectsToComp || !connectsToBoard) continue;

          const boardHandle = edge.source === mcuNode.id ? edge.sourceHandle : edge.targetHandle;
          const parsed = mcuAdapter.parseHandleToPinNumber(boardHandle);
          if (!parsed) continue;

          connectedPin = parsed.pinNumber;
          break;
        }
      }

      if (connectedPin !== pinNum) continue;

      if (isPushButton) {
        const state = node.data.properties?.state?.value;
        return state === "on" ? 0 : 1;
      }
      if (isSlideSwitch) {
        const state = node.data.properties?.state?.value;
        return (state === "right" || state === "on") ? 0 : 1;
      }
      if (isPir) {
        const motionValue = (node as any).pirMotion ?? node.data.properties?.motion?.value;
        return (motionValue === true || motionValue === "true" || motionValue === 1 || motionValue === "1") ? 1 : 0;
      }
      if (isTilt) {
        const angle = Number(node.data.properties?.angle?.value ?? 0);
        const contactClosed = angle >= TILT_THRESHOLD;
        return contactClosed ? 0 : 1;
      }
    }
    return 1;
  }

  function evaluateWithSensors(expr: string): number {
    let replaced = replaceBinaryLiterals(expr);
    replaced = replaced.replace(/\b0x([0-9a-fA-F]+)\b/g, (_, hex) => String(parseInt(hex, 16)));
    replaced = replaced.replace(/'(\\.|[^'\\])'/g, (_, charContent) => {
      if (charContent.startsWith("\\")) {
        const escaped = charContent.slice(1);
        if (escaped === "n") return "10"; if (escaped === "r") return "13";
        if (escaped === "t") return "9"; if (escaped === "b") return "8";
        if (escaped === "f") return "12"; if (escaped === "\\") return "92";
        if (escaped === "'") return "39"; if (escaped === '"') return "34";
        if (escaped === "0") return "0";
        if (escaped.startsWith("x")) return String(parseInt(escaped.slice(1), 16));
        if (/^[0-7]+$/.test(escaped)) return String(parseInt(escaped, 8));
        return String(escaped.charCodeAt(0));
      }
      return String(charContent.charCodeAt(0));
    });
    replaced = replaced.replace(/\bHIGH\b/g, "1");
    replaced = replaced.replace(/\bLOW\b/g, "0");
    replaced = replaced.replace(/\bINPUT\b/g, "1");
    replaced = replaced.replace(/\bOUTPUT\b/g, "0");
    replaced = replaced.replace(/\b\w+\.readTemperature\s*\(\s*([^)]*)\s*\)/g, (_, arg) => {
      const isFahr = /true|1/i.test(arg.trim());
      return String(isFahr ? Math.round(dhtTempCelsius * 1.8 + 32) : dhtTempCelsius);
    });
    replaced = replaced.replace(/\b\w+\.readHumidity\s*\([^)]*\)/g, () => String(dhtHumidity));
    replaced = replaced.replace(/isnan\s*\(\s*([^)]+)\s*\)/g, (_, arg) => {
      const v = evaluateWithSensors(arg);
      return Number.isNaN(v) ? "1" : "0";
    });
    replaced = replaced.replace(/pulseIn\s*\(\s*([^,\s)]+)[^)]*\)/g, (_, pinToken) => {
      const pinNum = resolveTokenValue(pinToken, sensorConstants);
      if (pinNum === echoPin) return String(duration_raw);
      return "0";
    });
    replaced = replaced.replace(/analogRead\s*\(\s*([^)\s]+)\s*\)/g, (_, pinToken) => {
      const pinNum = resolveTokenValue(pinToken, sensorConstants);
      if (gasNode && pinNum === gasPin) return String(gasVal);
      if (soilNode && pinNum === soilPin) return String(soilVal);
      if (tempNode && pinNum === tempPin) return String(tmpValue_raw);
      if (ldrNode && pinNum === ldrPin) return String(ldrVal);
      if (forceNode && pinNum === forcePin) return String(forceVal);
      if (flexNode && pinNum === flexPin) return String(flexVal);
      return "0";
    });
    replaced = replaced.replace(/digitalRead\s*\(\s*([^)\s]+)\s*\)/g, (_, pinToken) => {
      const pinNum = resolveTokenValue(pinToken, sensorConstants);
      if (pirNode && pinNum === pirPin) return pirMotion ? "1" : "0";
      return String(readDigitalPinState(pinNum));
    });
    replaced = replaced.replace(/map\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, (_, v, fl, fh, tl, th) => {
      const val = evaluateWithSensors(v);
      const flVal = evaluateWithSensors(fl);
      const fhVal = evaluateWithSensors(fh);
      const tlVal = evaluateWithSensors(tl);
      const thVal = evaluateWithSensors(th);
      return String(Math.round(((val - flVal) * (thVal - tlVal)) / (fhVal - flVal) + tlVal));
    });
    replaced = replaced.replace(/constrain\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, (_, x, a, b) => {
      const valX = evaluateWithSensors(x);
      const valA = evaluateWithSensors(a);
      const valB = evaluateWithSensors(b);
      return String(Math.max(valA, Math.min(valB, valX)));
    });
    const sortedVars = Array.from(variables.keys()).sort((a, b) => b.length - a.length);
    for (const varName of sortedVars) {
      if (["HIGH", "LOW", "INPUT", "OUTPUT", "BIN", "OCT", "DEC", "HEX"].includes(varName)) continue;
      const varRegex = new RegExp(`\\b${varName}\\b`, "g");
      replaced = replaced.replace(varRegex, String(variables.get(varName) ?? 0));
    }
    replaced = replaced.replace(/\((?:int|float|double|long|short|byte|char|bool)\)/g, "");
    // Fallback any remaining undeclared variable names to 0 to prevent evaluation errors
    replaced = replaced.replace(/\b(?!true\b|false\b)[A-Za-z_]\w*\b/g, "0");
    const sanitized = replaced.replace(/[^0-9.+\-*/()&|!=<> ]/g, "");
    try {
      if (sanitized.trim() === "") return 0;
      const result = new Function(`return (${sanitized});`)();
      if (typeof result === "boolean") return result ? 1 : 0;
      return Number.isFinite(result) ? result : 0;
    } catch (e) {
      return 0;
    }
  }

  const assignmentPattern = /(?:(?:const\s+)?\b(?:int|float|double|long|short|byte|uint8_t|uint16_t|uint32_t|char|bool|auto)\s+)?\b([A-Za-z_]\w*)\s*(?<![!<>=+\-*/])=(?!=)\s*([^;]+)/g;
  const dynamicVars = new Set<string>();
  for (const match of cleaned.matchAll(assignmentPattern)) {
    const varName = match[1];
    const exprStr = match[2];
    const val = evaluateWithSensors(exprStr);
    variables.set(varName, val);
    // Track variables assigned from function calls (e.g. key = keypad.getKey()) as runtime-dynamic
    // BUT exclude pin/sensor reads (digitalRead, analogRead, millis, etc.) which evaluate via evaluateWithSensors
    if (
      /[a-zA-Z_]\w*\s*\(/.test(exprStr) &&
      !/\b(digitalRead|analogRead|millis|micros|pulseIn|readTemperature|readHumidity)\b/.test(exprStr)
    ) {
      dynamicVars.add(varName.toLowerCase());
    }
  }

  // Pre-process if/else blocks to filter active execution branches.
  // Conditions referencing runtime-dynamic variables return "unknown" so both branches are kept.
  const resolvedCode = resolveIfElse(cleaned, (cond) => {
    for (const dv of dynamicVars) {
      if (cond.toLowerCase().includes(dv)) return "unknown";
    }
    return evaluateWithSensors(cond) !== 0;
  });

  if (session && tick > session.lastTick) {
    const loopAssignmentPattern = /\b([A-Za-z_]\w*)\s*(?<![!<>=+\-*/])=(?!=)\s*([^;]+)/g;
    for (const match of resolvedCode.matchAll(loopAssignmentPattern)) {
      const varName = match[1];
      const exprStr = match[2];
      const val = evaluateWithSensors(exprStr);
      session.variables.set(varName, val);
      variables.set(varName, val);
    }

    const incDecPattern = /\b([A-Za-z_]\w*)\s*(\+\+|--)/g;
    for (const match of resolvedCode.matchAll(incDecPattern)) {
      const varName = match[1];
      const op = match[2];
      const currentVal = session.variables.get(varName) ?? 0;
      const val = op === "++" ? currentVal + 1 : currentVal - 1;
      session.variables.set(varName, val);
      variables.set(varName, val);
    }

    const compoundPattern = /\b([A-Za-z_]\w*)\s*(\+=|-=)\s*([^;]+)/g;
    for (const match of resolvedCode.matchAll(compoundPattern)) {
      const varName = match[1];
      const op = match[2];
      const delta = evaluateWithSensors(match[3]);
      const currentVal = session.variables.get(varName) ?? 0;
      const val = op === "+=" ? currentVal + delta : currentVal - delta;
      session.variables.set(varName, val);
      variables.set(varName, val);
    }

    session.lastTick = tick;
  }

  const lcdMethodStartPattern =
    /\b([A-Za-z_]\w*)\s*\.\s*(clear|home|setCursor|print|write|command|cursor|noCursor|blink|noBlink|display|noDisplay|backlight|noBacklight|scrollDisplayLeft|scrollDisplayRight|autoscroll|noAutoscroll|leftToRight|rightToLeft|createChar|init|begin)\s*\(/g;

  let hasLcdCalls = false;
  let match;

  lcdMethodStartPattern.lastIndex = 0;

  while ((match = lcdMethodStartPattern.exec(resolvedCode)) !== null) {
    const objectName = match[1];
    const method = match[2];
    const matchIndex = match.index;
    const openParenIdx = matchIndex + match[0].length - 1;

    let depth = 1;
    let closeParenIdx = -1;
    let inQuotes = false;
    let quoteChar = "";

    for (let i = openParenIdx + 1; i < resolvedCode.length; i++) {
      const c = resolvedCode[i];
      if ((c === '"' || c === "'") && (i === 0 || resolvedCode[i - 1] !== "\\")) {
        if (inQuotes && quoteChar === c) {
          inQuotes = false;
        } else if (!inQuotes) {
          inQuotes = true;
          quoteChar = c;
        }
      }
      if (!inQuotes) {
        if (c === "(") depth++;
        else if (c === ")") {
          depth--;
          if (depth === 0) {
            closeParenIdx = i;
            break;
          }
        }
      }
    }

    if (closeParenIdx === -1) continue;

    const args = resolvedCode.slice(openParenIdx + 1, closeParenIdx).trim();

    lcdMethodStartPattern.lastIndex = closeParenIdx + 1;

    const obj = lcdObjects.get(objectName);
    if (!obj) continue;

    hasLcdCalls = true;
    const state = obj.state;

    const matchingNode = nodes.find(
      (n) =>
        getNodeSimulationModelForStore(n) === "lcd16x2" &&
        parseInt(String(n.data.properties?.i2cAddress?.value ?? "0x27"), 16) ===
        obj.address,
    );
    if (matchingNode && !validateComponentConnections(matchingNode, nodes, edges)) {
      state.error = "Power Missing or Bus Disconnected";
      state.displayEnabled = false;
      state.backlightEnabled = false;
      continue;
    }
    const backpackTypeResolved =
      matchingNode?.data.properties?.backpackType?.value ?? "PCF8574";

    const logI2CWrite = (dataBytes: number[]) => {
      const driver =
        backpackTypeResolved === "MCP23008"
          ? new MCP23008Driver()
          : new PCF8574Driver();
      driver.logWrite(obj.address, dataBytes, state);
    };

    const logCommandI2C = (cmd: number) => {
      const backlightBit = state.backlightEnabled ? 0x08 : 0x00;
      const highEn = (cmd & 0xf0) | backlightBit | 0x04;
      const highDi = (cmd & 0xf0) | backlightBit | 0x00;
      const lowEn = ((cmd << 4) & 0xf0) | backlightBit | 0x04;
      const lowDi = ((cmd << 4) & 0xf0) | backlightBit | 0x00;
      logI2CWrite([highEn, highDi, lowEn, lowDi]);
    };

    const logDataI2C = (val: number) => {
      const backlightBit = state.backlightEnabled ? 0x08 : 0x00;
      const highEn = (val & 0xf0) | backlightBit | 0x04 | 0x01;
      const highDi = (val & 0xf0) | backlightBit | 0x00 | 0x01;
      const lowEn = ((val << 4) & 0xf0) | backlightBit | 0x04 | 0x01;
      const lowDi = ((val << 4) & 0xf0) | backlightBit | 0x00 | 0x01;
      logI2CWrite([highEn, highDi, lowEn, lowDi]);
    };

    if (method === "init" || method === "begin") {
      const fresh = createDefaultLCDState();
      state.ddram = fresh.ddram;
      state.cgram = fresh.cgram;
      state.cursorColumn = fresh.cursorColumn;
      state.cursorRow = fresh.cursorRow;
      state.scrollOffset = fresh.scrollOffset;

      if (backpackTypeResolved === "MCP23008") {
        const writeByteHex =
          "0x" + (obj.address * 2).toString(16).toUpperCase();
        state.i2cLog.push(
          `START -> ${writeByteHex} -> ACK -> 0x00 (IODIR) -> ACK -> 0x00 -> ACK -> STOP`,
        );
        state.i2cLog.push(
          `START -> ${writeByteHex} -> ACK -> 0x06 (GPPU) -> ACK -> 0x00 -> ACK -> STOP`,
        );
      }

      logCommandI2C(0x30);
      continue;
    }

    if (method === "clear") {
      state.ddram.fill(32);
      state.cursorColumn = 0;
      state.cursorRow = 0;
      state.scrollOffset = 0;
      logCommandI2C(0x01);
      continue;
    }

    if (method === "home") {
      state.cursorColumn = 0;
      state.cursorRow = 0;
      state.scrollOffset = 0;
      logCommandI2C(0x02);
      continue;
    }

    if (method === "scrollDisplayLeft") {
      state.scrollOffset = (state.scrollOffset + 1) % 40;
      logCommandI2C(0x18);
      continue;
    }

    if (method === "scrollDisplayRight") {
      state.scrollOffset = (state.scrollOffset + 39) % 40;
      logCommandI2C(0x1c);
      continue;
    }

    if (method === "backlight") {
      state.backlightEnabled = true;
      logCommandI2C(getDisplayControlCmd(state));
      continue;
    }

    if (method === "noBacklight") {
      state.backlightEnabled = false;
      logCommandI2C(getDisplayControlCmd(state));
      continue;
    }

    if (method === "display") {
      state.displayEnabled = true;
      logCommandI2C(getDisplayControlCmd(state));
      continue;
    }

    if (method === "noDisplay") {
      state.displayEnabled = false;
      logCommandI2C(getDisplayControlCmd(state));
      continue;
    }

    if (method === "cursor") {
      state.cursorEnabled = true;
      logCommandI2C(getDisplayControlCmd(state));
      continue;
    }

    if (method === "noCursor") {
      state.cursorEnabled = false;
      logCommandI2C(getDisplayControlCmd(state));
      continue;
    }

    if (method === "blink") {
      state.blinkEnabled = true;
      logCommandI2C(getDisplayControlCmd(state));
      continue;
    }

    if (method === "noBlink") {
      state.blinkEnabled = false;
      logCommandI2C(getDisplayControlCmd(state));
      continue;
    }

    if (method === "autoscroll") {
      state.autoscroll = true;
      logCommandI2C(0x04 | (state.incrementMode ? 0x02 : 0) | 0x01);
      continue;
    }

    if (method === "noAutoscroll") {
      state.autoscroll = false;
      logCommandI2C(0x04 | (state.incrementMode ? 0x02 : 0) | 0x00);
      continue;
    }

    if (method === "leftToRight") {
      state.incrementMode = true;
      logCommandI2C(0x04 | 0x02 | (state.autoscroll ? 0x01 : 0));
      continue;
    }

    if (method === "rightToLeft") {
      state.incrementMode = false;
      logCommandI2C(0x04 | 0x00 | (state.autoscroll ? 0x01 : 0));
      continue;
    }

    if (method === "setCursor") {
      const cursorMatch = args.match(/^\s*([^,]+)\s*,\s*([^,]+)\s*$/);
      if (!cursorMatch) continue;
      const colVal = evaluateExpression(cursorMatch[1], parseArduinoConstants(fullArduinoCode));
      const rowVal = evaluateExpression(cursorMatch[2], parseArduinoConstants(fullArduinoCode));
      state.cursorColumn = Math.max(0, Math.min(39, colVal));
      state.cursorRow = Math.max(0, Math.min(1, rowVal));
      const ddramAddr = state.cursorRow * 0x40 + state.cursorColumn;
      logCommandI2C(0x80 | ddramAddr);
      continue;
    }

    if (method === "createChar") {
      const charMatch = args.match(/^\s*([^,]+)\s*,\s*([^,]+)\s*$/);
      if (!charMatch) continue;
      const numVal = evaluateExpression(charMatch[1], parseArduinoConstants(fullArduinoCode));
      const arrayName = charMatch[2].trim();
      const escapedArrayName = escapeRegExp(arrayName);
      const arrayPattern = new RegExp(
        `\\b(?:const\\s+|static\\s+)*(?:byte|char|uint8_t|unsigned\\s+char|int|unsigned\\s+int)\\s+(?:const\\s+|static\\s+)*${escapedArrayName}\\s*(?:PROGMEM\\s*)*\\[\\s*\\d*\\s*\\]\\s*=\\s*\\{([^}]+)\\}`,
        "i",
      );
      const arrayMatch = cleanedFull.match(arrayPattern);
      if (arrayMatch) {
        const valTokens = arrayMatch[1].split(",");
        const byteVals = valTokens.map((tok) => evaluateExpression(tok, parseArduinoConstants(fullArduinoCode)));
        const cgramStart = (numVal & 7) * 8;
        for (let i = 0; i < 8; i++) {
          state.cgram[cgramStart + i] = byteVals[i] ?? 0;
        }
      }
      logCommandI2C(0x40 | ((numVal & 7) * 8));
      continue;
    }

    const writeCharToDDRAM = (charVal: number) => {
      const pos = state.cursorRow * 40 + state.cursorColumn;
      state.ddram[pos] = charVal;
      logDataI2C(charVal);

      if (state.incrementMode) {
        state.cursorColumn += 1;
        if (state.cursorColumn >= 40) state.cursorColumn = 0;
      } else {
        state.cursorColumn -= 1;
        if (state.cursorColumn < 0) state.cursorColumn = 39;
      }

      if (state.autoscroll) {
        if (state.incrementMode) {
          if (state.cursorColumn > 15 || state.cursorColumn === 0) {
            state.scrollOffset = (state.scrollOffset + 1) % 40;
          }
        } else {
          if (state.cursorColumn < 0 || state.cursorColumn < state.scrollOffset) {
            state.scrollOffset = (state.scrollOffset - 1 + 40) % 40;
          }
        }
      }
    };

    if (method === "write") {
      let byteVal = 0;
      const trimmedArgs = args.trim();
      const stringLiteralMatch = trimmedArgs.match(/^['"]((?:\\.|[^'"\\])*)['"]$/);
      if (stringLiteralMatch) {
        const decoded = decodeArduinoStringLiteral(stringLiteralMatch[1]);
        if (decoded.length > 0) {
          byteVal = decoded.charCodeAt(0);
        }
      } else {
        byteVal = evaluateExpression(trimmedArgs, parseArduinoConstants(fullArduinoCode));
      }
      writeCharToDDRAM(byteVal);
      continue;
    }

    if (method === "command") {
      const cmdVal = evaluateExpression(args, parseArduinoConstants(fullArduinoCode));
      logCommandI2C(cmdVal);

      if (cmdVal === 0x01) {
        state.ddram.fill(32);
        state.cursorColumn = 0;
        state.cursorRow = 0;
        state.scrollOffset = 0;
      } else if (cmdVal === 0x02) {
        state.cursorColumn = 0;
        state.cursorRow = 0;
        state.scrollOffset = 0;
      } else if ((cmdVal & 0xFC) === 0x04) {
        state.incrementMode = (cmdVal & 0x02) !== 0;
        state.autoscroll = (cmdVal & 0x01) !== 0;
      } else if ((cmdVal & 0xF8) === 0x08) {
        state.displayEnabled = (cmdVal & 0x04) !== 0;
        state.cursorEnabled = (cmdVal & 0x02) !== 0;
        state.blinkEnabled = (cmdVal & 0x01) !== 0;
      } else if ((cmdVal & 0xF0) === 0x10) {
        const displayShift = (cmdVal & 0x08) !== 0;
        const shiftRight = (cmdVal & 0x04) !== 0;
        if (displayShift) {
          if (shiftRight) {
            state.scrollOffset = (state.scrollOffset - 1 + 40) % 40;
          } else {
            state.scrollOffset = (state.scrollOffset + 1) % 40;
          }
        } else {
          if (shiftRight) {
            state.cursorColumn += 1;
            if (state.cursorColumn >= 40) state.cursorColumn = 0;
          } else {
            state.cursorColumn -= 1;
            if (state.cursorColumn < 0) state.cursorColumn = 39;
          }
        }
      } else if ((cmdVal & 0x80) !== 0) {
        const addr = cmdVal & 0x7F;
        if (addr >= 0x40) {
          state.cursorRow = 1;
          state.cursorColumn = Math.min(39, addr - 0x40);
        } else {
          state.cursorRow = 0;
          state.cursorColumn = Math.min(39, addr);
        }
      }
      continue;
    }

    if (method === "print") {
      let textToPrint = "";

      let keyVarName = "key";
      const getKeyMatch = resolvedCode.match(
        /\b(?:char\s+)?(\w+)\s*=\s*\w+\.getKey\(\)/,
      );
      if (getKeyMatch) {
        keyVarName = getKeyMatch[1];
      }

      let detectedPasswordVar = "inputPassword";
      const accumPattern = new RegExp(
        `\\b(\\w+)\\s*(?:\\+=\\s*${keyVarName}|=\\s*\\1\\s*\\+\\s*${keyVarName})\\b`,
      );
      // Search both resolved and original cleaned code (accumulation may be inside stripped if-block)
      const accumMatch = resolvedCode.match(accumPattern) ?? cleaned.match(accumPattern);
      if (accumMatch) {
        detectedPasswordVar = accumMatch[1];
      }

      const passwordVars = new Set([
        "inputpassword",
        "password",
        "pass",
        "entered",
        "enteredpass",
        detectedPasswordVar.toLowerCase(),
        keyVarName.toLowerCase(),
      ]);

      const resolveLcdPrintArg = (expr: string): string => {
        const activePassword = keypadPassword;
        let replacedExpr = expr.trim();
        const parts = splitOuterCommas(replacedExpr);
        const printValExpr = parts[0];

        let printValReplaced = printValExpr;
        for (const pVar of passwordVars) {
          const lengthRegex = new RegExp(`\\b${pVar}\\.length\\(\\)`, "gi");
          printValReplaced = printValReplaced.replace(
            lengthRegex,
            String(activePassword.length),
          );
        }

        for (const pVar of passwordVars) {
          const varRegex = new RegExp(`\\b${pVar}\\b`, "gi");
          printValReplaced = printValReplaced.replace(
            varRegex,
            `"${activePassword}"`,
          );
        }

        if (printValReplaced.includes("+")) {
          const partsConcat = printValReplaced.split("+").map((p) => p.trim());
          let allPartsLiterals = true;
          const resolvedParts = partsConcat.map((part) => {
            const match = part.match(/^['"]((?:\\.|[^'"\\])*)['"]$/);
            if (match) {
              return decodeArduinoStringLiteral(match[1]).replace(/\\'/g, "'");
            }
            if (/^\d+(\.\d+)?$/.test(part)) {
              return part;
            }
            allPartsLiterals = false;
            return "";
          });
          if (allPartsLiterals) {
            return resolvedParts.join("");
          }
        }

        const stringLiteralMatch = printValReplaced.match(
          /^['"]((?:\\.|[^'"\\])*)['"]$/,
        );
        if (stringLiteralMatch) {
          const decoded = decodeArduinoStringLiteral(
            stringLiteralMatch[1],
          ).replace(/\\'/g, "'");
          return decoded;
        }

        const lower = printValReplaced.toLowerCase();

        if (
          lower === "stars" ||
          lower === "masked" ||
          lower === "asterisks" ||
          lower.includes("mask")
        ) {
          return "*".repeat(activePassword.length);
        }
        

        const escapedPrintVal = escapeRegExp(printValReplaced);
        const strVarPattern = new RegExp(
          `(?:String|const\\s+char\\*|char\\s+\\w+\\[\\])\\s+${escapedPrintVal}\\s*=\\s*['"]([^'"]*)['"]`,
          "i",
        );
        
        const strVarMatch = cleaned.match(strVarPattern);
        if (strVarMatch) {
          return strVarMatch[1];
        }

        const hasCharCast = /\(char\)/.test(printValExpr);
        const evalVal = evaluateWithSensors(printValReplaced);
        if (isNaN(evalVal)) return "0";

        if (hasCharCast) {
          return String.fromCharCode(Math.round(evalVal));
        }

        let precision = 2;
        let isBaseFormat = false;
        let base = 10;
        if (parts.length > 1) {
          const secondArg = parts[1].trim();
          let resolvedSecond = resolveTokenValue(secondArg, parseArduinoConstants(fullArduinoCode));
          if (resolvedSecond === 0 && parseArduinoConstants(fullArduinoCode).has(secondArg)) {
            resolvedSecond = parseArduinoConstants(fullArduinoCode).get(secondArg)!;
          }
          if (secondArg === "BIN" || resolvedSecond === 2) {
            isBaseFormat = true;
            base = 2;
          } else if (secondArg === "OCT" || resolvedSecond === 8) {
            isBaseFormat = true;
            base = 8;
          } else if (secondArg === "DEC" || resolvedSecond === 10) {
            isBaseFormat = true;
            base = 10;
          } else if (secondArg === "HEX" || resolvedSecond === 16) {
            isBaseFormat = true;
            base = 16;
          } else if (!isNaN(resolvedSecond)) {
            precision = resolvedSecond;
          }
        }

        if (isBaseFormat) {
          const intVal = Math.round(evalVal);
          if (base === 16) {
            return intVal.toString(16).toUpperCase();
          }
          return intVal.toString(base);
        }

        return String(
          Math.round(evalVal * Math.pow(10, precision)) /
          Math.pow(10, precision),
        );
      };

      let printExpr = args;
      const commaIdx = args.indexOf(",");
      if (commaIdx !== -1) {
        const before = args.slice(0, commaIdx);
        const after = args.slice(commaIdx + 1);
        const hasOpeningQuote = before.includes('"') || before.includes("'");
        const hasClosingQuote = after.includes('"') || after.includes("'");
        if (!(hasOpeningQuote && hasClosingQuote)) {
          printExpr = before.trim();
        }
      }
      textToPrint = resolveLcdPrintArg(printExpr);

      for (let i = 0; i < textToPrint.length; i++) {
        writeCharToDDRAM(textToPrint.charCodeAt(i));
      }
    }
  }

  if (!hasLcdCalls) return null;

  return Array.from(lcdObjects.entries()).map(([name, obj]) => ({
    name,
    address: obj.address,
    state: obj.state,
  }));
}

export { };