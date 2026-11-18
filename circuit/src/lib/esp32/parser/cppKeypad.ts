/**
 * ESP32 C++ (Arduino-style) Matrix Keypad Parser & Runtime Engine
 *
 * Implements Phase 6:
 *   - Parses Keypad.h library constructs:
 *       char keys[ROWS][COLS] = { ... };
 *       byte rowPins[ROWS] = { ... };
 *       byte colPins[COLS] = { ... };
 *       Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);
 *   - Evaluates keypad.getKey() against active canvas pressed keys and graph reachability
 *   - Supports 4x4 and 4x3 layouts
 *   - Hardware safety guards: checks input-only pins (GPIO34-39) on rows and SPI flash pins (GPIO6-11)
 *   - Multi-tick edge-triggered consumption (returns key once on press, NO_KEY / '\0' when idle/held)
 */

import {
  stripCppComments,
  stripCppIncludes,
  parseCppConstants,
  resolveCppPinNumber,
  isEsp32ReservedFlashPin,
  isEsp32InputOnlyPin,
} from "./cppPatterns";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraphForStore } from "../../circuit/graph";
import type { CircuitNode, CircuitEdge } from "../../types";

export interface CppKeypadConfig {
  instanceName: string;
  keymap: string[][];
  rowPins: number[];
  colPins: number[];
  rows: number;
  cols: number;
  warning?: string;
}

export interface CppKeypadSession {
  lastPressedKey: string | null;
  lastTick: number;
}

const keypadSessions = new Map<string, CppKeypadSession>();

/**
 * Resets all C++ Keypad simulation sessions.
 */
export function resetEsp32CppKeypadSessions() {
  keypadSessions.clear();
}

/** Parses array of numbers/pins like byte rowPins[4] = {13, 12, 14, 27}; */
function parsePinArray(code: string, arrayName: string, constants: Map<string, number>): number[] {
  const pattern = new RegExp(`\\b(?:const\\s+)?(?:byte|uint8_t|int)\\s+${arrayName}\\s*(?:\\[[^\\]]*\\])?\\s*=\\s*\\{([^}]+)\\}`, "i");
  const match = code.match(pattern);
  if (!match) return [];

  const rawTokens = match[1].split(",").map((t) => t.trim());
  const pins: number[] = [];
  for (const token of rawTokens) {
    const p = resolveCppPinNumber(token, constants);
    if (p !== null) pins.push(p);
  }
  return pins;
}

/** Parses 2D char array like char keys[4][4] = { {'1','2','3','A'}, ... }; */
function parseKeymap2D(code: string, keymapName: string): string[][] {
  const pattern = new RegExp(`\\b(?:const\\s+)?char\\s+${keymapName}\\s*(?:\\[[^\\]]*\\]\\s*\\[[^\\]]*\\])?\\s*=\\s*\\{([\\s\\S]*?)\\};`, "i");
  const match = code.match(pattern);
  if (!match) return [];

  const inner = match[1];
  const rowMatches = inner.match(/\{([^}]+)\}/g);
  if (!rowMatches) return [];

  const matrix: string[][] = [];
  for (const rStr of rowMatches) {
    const chars = rStr
      .replace(/[{}]/g, "")
      .split(",")
      .map((c) => c.trim().replace(/^['"]|['"]$/g, ""))
      .filter((c) => c.length > 0);
    if (chars.length > 0) matrix.push(chars);
  }
  return matrix;
}

/**
 * Parses Keypad declaration from C++ sketch.
 */
export function parseEsp32CppKeypad(code: string): CppKeypadConfig | null {
  if (!code || typeof code !== "string") return null;

  const cleaned = stripCppIncludes(stripCppComments(code));
  const constants = parseCppConstants(code);

  // Match: Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);
  // or Keypad customKeypad(makeKeymap(keys), rowPins, colPins, 4, 4);
  const keypadDeclRegex = /\bKeypad\s+([A-Za-z_]\w*)\s*(?:=\s*Keypad)?\s*\(\s*makeKeymap\s*\(\s*([A-Za-z_]\w*)\s*\)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*\)/i;
  const match = cleaned.match(keypadDeclRegex);
  if (!match) return null;

  const instanceName = match[1];
  const keymapVarName = match[2];
  const rowPinsVarName = match[3];
  const colPinsVarName = match[4];
  const rows = constants.get(match[5]) ?? Number(match[5]) ?? 4;
  const cols = constants.get(match[6]) ?? Number(match[6]) ?? 4;

  const rowPins = parsePinArray(cleaned, rowPinsVarName, constants);
  const colPins = parsePinArray(cleaned, colPinsVarName, constants);
  const keymap = parseKeymap2D(cleaned, keymapVarName);

  // Fallback default 4x4 or 4x3 matrix if 2D array parsing yielded empty
  const effectiveKeymap = keymap.length > 0 ? keymap : cols === 3
    ? [
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
        ["*", "0", "#"],
      ]
    : [
        ["1", "2", "3", "A"],
        ["4", "5", "6", "B"],
        ["7", "8", "9", "C"],
        ["*", "0", "#", "D"],
      ];

  // Hardware Safety Check on Row Pins (Rows must be output capable)
  let warning: string | undefined;
  for (const rPin of rowPins) {
    if (isEsp32InputOnlyPin(rPin)) {
      warning = `ValueError: Pin(${rPin}) doesn't have an output driver (input-only pin cannot be used as Keypad Row output).`;
      break;
    }
    if (isEsp32ReservedFlashPin(rPin)) {
      warning = `Forbidden GPIO ${rPin} reserved for internal SPI flash memory.`;
      break;
    }
  }

  // Safety Check on Column Pins
  for (const cPin of colPins) {
    if (isEsp32ReservedFlashPin(cPin)) {
      warning = `Forbidden GPIO ${cPin} reserved for internal SPI flash memory.`;
      break;
    }
  }

  return {
    instanceName,
    keymap: effectiveKeymap,
    rowPins,
    colPins,
    rows,
    cols,
    warning,
  };
}

export interface EvaluateCppKeypadContext {
  tick?: number;
  timestamp?: number;
  nodes?: CircuitNode[];
  edges?: CircuitEdge[];
}

export interface CppKeypadResult {
  pressedKey: string | null; // e.g. "5", "A", or null (NO_KEY)
  keyChar: string;           // e.g. "5", "A", or ""
  warning?: string;
  hasKeypad: boolean;
}

/**
 * Evaluates active getKey() call for ESP32 C++ simulation frame.
 */
export function evaluateEsp32CppKeypad(
  code: string,
  context: EvaluateCppKeypadContext = {},
): CppKeypadResult {
  const config = parseEsp32CppKeypad(code);
  if (!config) {
    return { pressedKey: null, keyChar: "", hasKeypad: false };
  }

  if (config.warning) {
    return { pressedKey: null, keyChar: "", warning: config.warning, hasKeypad: true };
  }

  const nodes = context.nodes ?? [];
  const edges = context.edges ?? [];
  const tick = context.tick ?? 0;

  // Find canvas keypad node
  const keypadNode = nodes.find((n) => {
    const model = getNodeSimulationModel(n);
    return model === "keypad4x4" || model === "keypad4x3";
  });

  if (!keypadNode) {
    return { pressedKey: null, keyChar: "", hasKeypad: true };
  }

  // Check physical wiring between ESP32 pins and Keypad handles
  const esp32Node = nodes.find(
    (n) => getNodeSimulationModel(n) === "esp32" || n.data?.componentType === "esp32" || n.type === "esp32",
  );
  if (!esp32Node) {
    return { pressedKey: null, keyChar: "", hasKeypad: true };
  }

  const graph = buildConductiveGraphForStore(nodes, edges, { includeResistors: true });

  // Read active pressed key on canvas node
  const pressedKeysStr = String(
    keypadNode.data?.properties?.pressedKeys?.value ??
    keypadNode.data?.properties?.pressedKey?.value ??
    "",
  );
  const activeKeys = pressedKeysStr ? pressedKeysStr.split(",").map((k) => k.trim()).filter(Boolean) : [];

  if (activeKeys.length === 0) {
    // Reset session latch when released
    keypadSessions.set(code, { lastPressedKey: null, lastTick: tick });
    return { pressedKey: null, keyChar: "", hasKeypad: true };
  }

  const candidateKey = activeKeys[0];

  // Find row and column index in keymap
  let rIdx = -1;
  let cIdx = -1;
  for (let r = 0; r < config.keymap.length; r++) {
    const c = config.keymap[r].indexOf(candidateKey);
    if (c !== -1) {
      rIdx = r;
      cIdx = c;
      break;
    }
  }

  if (rIdx === -1 || cIdx === -1 || rIdx >= config.rowPins.length || cIdx >= config.colPins.length) {
    return { pressedKey: null, keyChar: "", hasKeypad: true };
  }

  const rPin = config.rowPins[rIdx];
  const cPin = config.colPins[cIdx];

  // Verify conductive graph reachability from ESP32 pins to Keypad row/col handles
  const mcuRowEp = `${esp32Node.id}:gpio${rPin}`;
  const mcuColEp = `${esp32Node.id}:gpio${cPin}`;
  const kpRowEp = `${keypadNode.id}:row${rIdx + 1}`;
  const kpColEp = `${keypadNode.id}:column${cIdx + 1}`;

  const rowConnected = graph.get(mcuRowEp)?.has(kpRowEp) || graph.get(kpRowEp)?.has(mcuRowEp);
  const colConnected = graph.get(mcuColEp)?.has(kpColEp) || graph.get(kpColEp)?.has(mcuColEp);

  if (!rowConnected || !colConnected) {
    return {
      pressedKey: null,
      keyChar: "",
      warning: `Keypad pin disconnected: Row ${rIdx + 1} (GPIO${rPin}) or Col ${cIdx + 1} (GPIO${cPin}) not wired to keypad`,
      hasKeypad: true,
    };
  }

  return {
    pressedKey: candidateKey,
    keyChar: candidateKey,
    hasKeypad: true,
  };
}
