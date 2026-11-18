/**
 * ESP32 C++ NeoPixel (WS2812B) Parser
 *
 * Parses Arduino-style Adafruit_NeoPixel source code for ESP32:
 *  - Adafruit_NeoPixel strip(numPixels, pin, type);
 *  - Adafruit_NeoPixel strip = Adafruit_NeoPixel(numPixels, pin, type);
 *  - strip.begin();
 *  - strip.setPixelColor(index, color) and strip.setPixelColor(index, r, g, b)
 *  - strip.Color(r, g, b) / Adafruit_NeoPixel::Color(r, g, b)
 *  - strip.clear();
 *  - strip.fill(color, first, count);
 *  - strip.setBrightness(b);
 *  - strip.show(); (commit trigger for buffer-until-show semantics)
 *  - Simple integer for-loop unrolling for effects / strip filling
 *
 * Safety & Hardware Validation:
 *  - GPIO 6-11: Reserved for internal SPI flash (emits warning, blocked)
 *  - GPIO 34, 35, 36, 39: Input-only pins (emits warning, blocked)
 */

import {
  stripCppComments,
  stripCppIncludes,
  parseCppConstants,
  extractCppFunctionBody,
  resolveCppPinNumber,
  isEsp32ReservedFlashPin,
  isEsp32InputOnlyPin,
} from "./cppPatterns";
import { extractCppIrReceiverVariables } from "./cppIrReceiver";
import type { Esp32NeoPixelWriteAction } from "./neopixelPatterns";
import type { CircuitNode, CircuitEdge } from "../../types";

export interface Esp32CppNeopixelContext {
  inputStates?: Map<number, boolean>;
  adcValues?: Map<number, number>;
  nodes?: CircuitNode[];
  edges?: CircuitEdge[];
  variables?: Map<string, any>;
  tick?: number;
  timestamp?: number;
  frame?: any;
}

interface NeoPixelPhase {
  buffer: Array<{ r: number; g: number; b: number }>;
  duration: number;
}

interface StripInstance {
  name: string;
  pin: number;
  numPixels: number;
  buffer: Array<{ r: number; g: number; b: number }>;
  visible: Array<{ r: number; g: number; b: number }>;
  phases: NeoPixelPhase[];
  showCalled: boolean;
  brightness: number;
  initialized: boolean;
  warning?: string;
}

/**
 * Splits comma-separated arguments while respecting nested parentheses.
 */
function splitArgs(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth++;
    else if (char === ")") depth--;

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

/**
 * Evaluates simple arithmetic or constant expressions.
 */
function evaluateSimpleExpr(
  expr: string,
  variables: Map<string, number>,
): number {
  const trimmed = expr.trim();
  if (!trimmed) return 0;

  if (/^-?\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  if (/^0x[0-9a-fA-F]+$/i.test(trimmed)) {
    return parseInt(trimmed, 16);
  }
  if (variables.has(trimmed)) {
    return variables.get(trimmed)!;
  }

  // Pre-resolve variables in the expression
  let sanitized = trimmed;
  for (const [vName, vVal] of variables.entries()) {
    sanitized = sanitized.replace(new RegExp(`\\b${vName}\\b`, "g"), String(vVal));
  }

  // Check if safe mathematical expression
  if (/^[0-9+\-*/()%><&|^~. ]+$/.test(sanitized)) {
    try {
      const fn = new Function(`return (${sanitized});`);
      const res = fn();
      if (typeof res === "number" && Number.isFinite(res)) {
        return Math.round(res);
      }
    } catch (_) {}
  }

  return 0;
}

/**
 * Unrolls simple single-variable increment loops:
 * for (int i = 0; i < NUM; i++) { ... }
 * Capped at max 256 iterations for simulation safety.
 */
function unrollSimpleForLoops(
  code: string,
  variables: Map<string, number>,
): string {
  const forRegex = /for\s*\(\s*(?:(?:int|uint8_t|uint16_t|size_t|auto)\s+)?([A-Za-z_]\w*)\s*=\s*([^;]+)\s*;\s*\1\s*<\s*([^;]+)\s*;\s*(?:\1\+\+|\+\+\1|\1\s*\+=\s*1)\s*\)\s*\{([^}]*)\}/g;

  return code.replace(forRegex, (_match, varName, startExpr, endExpr, loopBody) => {
    const startVal = evaluateSimpleExpr(startExpr, variables);
    const endVal = evaluateSimpleExpr(endExpr, variables);

    if (isNaN(startVal) || isNaN(endVal) || startVal >= endVal) {
      return "";
    }

    const maxIterations = 256;
    const count = Math.min(endVal - startVal, maxIterations);

    let unrolled = "";
    for (let i = 0; i < count; i++) {
      const currentVal = startVal + i;
      // Replace instances of loop variable inside loop body
      const replacedBody = loopBody.replace(
        new RegExp(`\\b${varName}\\b`, "g"),
        String(currentVal),
      );
      unrolled += replacedBody + "\n";
    }
    return unrolled;
  });
}

/**
 * Parses ESP32 C++ code for Adafruit_NeoPixel buffer operations and commits.
 * Returns normalized Esp32NeoPixelWriteAction items for instances that invoked .show().
 */
export function parseEsp32CppNeoPixelActions(
  code: string,
  context?: Esp32CppNeopixelContext,
): Esp32NeoPixelWriteAction[] {
  if (!code || typeof code !== "string") return [];

  const cleaned = stripCppIncludes(stripCppComments(code));
  if (!/\bAdafruit_NeoPixel\b/.test(cleaned)) {
    return [];
  }

  const constants = parseCppConstants(code);
  const variables = new Map<string, any>(constants);
  if (context?.variables) {
    for (const [k, v] of context.variables.entries()) {
      variables.set(k, v);
    }
  }

  // Extract IR Receiver variables if present
  if (context) {
    extractCppIrReceiverVariables(code, context, variables);
  } else {
    extractCppIrReceiverVariables(code, {}, variables);
  }

  // Track strips: name -> StripInstance
  const strips = new Map<string, StripInstance>();

  // 1. Discover Adafruit_NeoPixel constructor declarations
  // e.g. Adafruit_NeoPixel pixels(NUMPIXELS, PIN, NEO_GRB + NEO_KHZ800);
  // or   Adafruit_NeoPixel strip = Adafruit_NeoPixel(NUMPIXELS, PIN, NEO_GRB + NEO_KHZ800);
  const declPattern = /Adafruit_NeoPixel\s+([A-Za-z_]\w*)\s*(?:\(\s*([^)]+)\s*\)|=\s*Adafruit_NeoPixel\s*\(\s*([^)]+)\s*\))/g;
  let declMatch: RegExpExecArray | null;

  while ((declMatch = declPattern.exec(cleaned)) !== null) {
    const stripName = declMatch[1];
    const argsText = declMatch[2] || declMatch[3];
    const args = splitArgs(argsText);

    if (args.length >= 2) {
      const count = evaluateSimpleExpr(args[0], variables) || 1;
      const rawPin = args[1].trim();
      const pinNum = resolveCppPinNumber(rawPin, constants);

      if (pinNum !== null) {
        let warning: string | undefined;
        if (isEsp32ReservedFlashPin(pinNum)) {
          warning = `Forbidden GPIO ${pinNum} reserved for internal SPI flash memory.`;
        } else if (isEsp32InputOnlyPin(pinNum)) {
          warning = `GPIO ${pinNum} is input-only and cannot drive NeoPixel data.`;
        }

        strips.set(stripName, {
          name: stripName,
          pin: pinNum,
          numPixels: count,
          buffer: Array.from({ length: count }, () => ({ r: 0, g: 0, b: 0 })),
          visible: Array.from({ length: count }, () => ({ r: 0, g: 0, b: 0 })),
          phases: [],
          showCalled: false,
          brightness: 255,
          initialized: false,
          warning,
        });
      }
    }
  }

  if (strips.size === 0) {
    return [];
  }

/**
 * Pre-resolves Color(r, g, b) calls to packed 24-bit integers.
 * E.g. pixels.Color(255, 0, 0) or Adafruit_NeoPixel::Color(...)
 */
function resolveColorCalls(text: string, variables: Map<string, number>): string {
  let result = text;
  const colorFindRegex = /(?:\b[A-Za-z_]\w*(?:\.|::))?\bColor\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = colorFindRegex.exec(result)) !== null) {
    const pos = match.index;
    const matchStr = match[0];
    let depth = 1;
    let end = -1;
    const start = pos + matchStr.length;

    for (let i = start; i < result.length; i++) {
      if (result[i] === "(") depth++;
      else if (result[i] === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end !== -1) {
      const argText = result.slice(start, end);
      const parts = splitArgs(argText);
      let packedColor = 0;
      if (parts.length >= 3) {
        const r = Math.max(0, Math.min(255, evaluateSimpleExpr(parts[0], variables)));
        const g = Math.max(0, Math.min(255, evaluateSimpleExpr(parts[1], variables)));
        const b = Math.max(0, Math.min(255, evaluateSimpleExpr(parts[2], variables)));
        packedColor = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
      }
      result = result.slice(0, pos) + String(packedColor) + result.slice(end + 1);
      colorFindRegex.lastIndex = 0; // reset Exec pointer since string mutated
    }
  }

  return result;
}

  // 2. Extract setup and loop bodies
  const setupBody = extractCppFunctionBody(cleaned, "setup") ?? "";
  const loopBody = extractCppFunctionBody(cleaned, "loop") ?? cleaned;

  // Process a sequential block of code against the active strips
  const processBlock = (blockCode: string) => {
    const unrolled = unrollSimpleForLoops(blockCode, variables);
    const withColors = resolveColorCalls(unrolled, variables);

    // Track digitalRead variables if any: int buttonState = digitalRead(BUTTON_PIN);
    const varReadRegex = /\b(?:(?:const\s+)?(?:int|bool|byte|auto)\s+)?([A-Za-z_]\w*)\s*=\s*digitalRead\s*\(\s*([^,\s)]+)\s*\)/g;
    let varReadMatch: RegExpExecArray | null;
    while ((varReadMatch = varReadRegex.exec(unrolled)) !== null) {
      const vName = varReadMatch[1];
      const pin = resolveCppPinNumber(varReadMatch[2], constants);
      if (pin !== null) {
        const isHigh = context?.inputStates?.get(pin) ?? false;
        variables.set(vName, isHigh ? 1 : 0);
      }
    }

    // Process statements: assignments, if/else branches, and strip method calls
    // Handle conditional if/else blocks
    let i = 0;
    while (i < withColors.length) {
      while (i < withColors.length && /\s/.test(withColors[i])) i++;
      if (i >= withColors.length) break;

      const ifMatch = withColors.slice(i).match(/^if\s*\(/);
      if (ifMatch) {
        const start = i;
        i += ifMatch[0].length;
        let depth = 1;
        const condStart = i;
        while (i < withColors.length && depth > 0) {
          if (withColors[i] === "(") depth++;
          else if (withColors[i] === ")") depth--;
          i++;
        }
        const condExpr = withColors.slice(condStart, i - 1);

        // Extract if body
        while (i < withColors.length && /\s/.test(withColors[i])) i++;
        let ifBody = "";
        if (i < withColors.length && withColors[i] === "{") {
          let bDepth = 1;
          i++;
          const bStart = i;
          while (i < withColors.length && bDepth > 0) {
            if (withColors[i] === "{") bDepth++;
            else if (withColors[i] === "}") bDepth--;
            i++;
          }
          ifBody = withColors.slice(bStart, i - 1);
        } else {
          const sStart = i;
          while (i < withColors.length && withColors[i] !== ";") i++;
          if (i < withColors.length) i++;
          ifBody = withColors.slice(sStart, i);
        }

        // Check for else branch
        let elseBody = "";
        const rest = withColors.slice(i);
        const elseMatch = rest.match(/^\s*else\s*(?!if)/);
        if (elseMatch) {
          i += elseMatch[0].length;
          while (i < withColors.length && /\s/.test(withColors[i])) i++;
          if (i < withColors.length && withColors[i] === "{") {
            let bDepth = 1;
            i++;
            const bStart = i;
            while (i < withColors.length && bDepth > 0) {
              if (withColors[i] === "{") bDepth++;
              else if (withColors[i] === "}") bDepth--;
              i++;
            }
            elseBody = withColors.slice(bStart, i - 1);
          } else {
            const sStart = i;
            while (i < withColors.length && withColors[i] !== ";") i++;
            if (i < withColors.length) i++;
            elseBody = withColors.slice(sStart, i);
          }
        }

        // Evaluate condition
        let condMet = false;
        try {
          // Replace digitalRead(pin) directly in condition
          let evaluatedCond = condExpr.replace(/\bdigitalRead\s*\(\s*([^,\s)]+)\s*\)/g, (_m, pTok) => {
            const p = resolveCppPinNumber(pTok, constants);
            const isHigh = p !== null ? (context?.inputStates?.get(p) ?? false) : false;
            return isHigh ? "1" : "0";
          });
          evaluatedCond = evaluatedCond.replace(/\bHIGH\b/g, "1").replace(/\bLOW\b/g, "0");

          // Pre-process IrReceiver calls
          if (variables.has("__ir_decoded")) {
            const irDecoded = !!variables.get("__ir_decoded");
            const irCmd = variables.get("__ir_command") ?? 0;
            evaluatedCond = evaluatedCond
              .replace(/\bIrReceiver\.decode\s*\(\s*\)/g, irDecoded ? "true" : "false")
              .replace(/\bIrReceiver\.decodedIRData\.command\b/g, String(irCmd))
              .replace(/\bIrReceiver\.decodedIRData\.address\b/g, String(variables.get("__ir_address") ?? 0));
          } else {
            evaluatedCond = evaluatedCond.replace(/\bIrReceiver\.decode\s*\(\s*\)/g, "false");
          }

          for (const [vName, vVal] of variables.entries()) {
            evaluatedCond = evaluatedCond.replace(new RegExp(`\\b${vName}\\b`, "g"), String(vVal));
          }
          condMet = !!new Function(`return (${evaluatedCond});`)();
        } catch (_) {
          condMet = false;
        }

        if (condMet) {
          processBlock(ifBody);
        } else if (elseBody) {
          processBlock(elseBody);
        }
        continue;
      }

      // Check for standalone statement (until ;)
      const nextSemi = withColors.indexOf(";", i);
      const stmt = (nextSemi !== -1 ? withColors.slice(i, nextSemi) : withColors.slice(i)).trim();
      i = nextSemi !== -1 ? nextSemi + 1 : withColors.length;

      if (!stmt) continue;

      // Check for delay statements: delay(2000), delayMicroseconds(500)
      const delayMatch = stmt.match(/^(?:delay|delayMicroseconds)\s*\((.*)\)$/);
      if (delayMatch) {
        const rawDur = delayMatch[1].trim();
        let durMs = evaluateSimpleExpr(rawDur, variables);
        if (stmt.startsWith("delayMicroseconds")) {
          durMs = Math.max(1, Math.round(durMs / 1000));
        }
        if (durMs <= 0) durMs = 1;

        // Assign duration to the latest recorded phase for each active strip
        for (const strip of strips.values()) {
          if (strip.phases.length > 0) {
            const lastPhase = strip.phases[strip.phases.length - 1];
            if (lastPhase.duration === 0) {
              lastPhase.duration = durMs;
            } else {
              lastPhase.duration += durMs;
            }
          }
        }
        continue;
      }

      // Check for variable assignment: int color = 0xFF0000;
      const assignMatch = stmt.match(/^(?:\b(?:int|uint32_t|uint16_t|uint8_t|byte|auto)\s+)?([A-Za-z_]\w*)\s*=\s*(.+)$/);
      if (assignMatch) {
        const vName = assignMatch[1];
        const vExpr = assignMatch[2];
        const val = evaluateSimpleExpr(vExpr, variables);
        variables.set(vName, val);
        continue;
      }

      // Check for method calls on any discovered strip
      // e.g. pixels.begin(), pixels.clear(), pixels.setPixelColor(...), pixels.show(), pixels.fill(...)
      const methodMatch = stmt.match(/^([A-Za-z_]\w*)\s*\.\s*(begin|clear|show|fill|setPixelColor|setBrightness)\s*\((.*)\)$/);
      if (methodMatch) {
        const stripName = methodMatch[1];
        const method = methodMatch[2];
        const argsStr = methodMatch[3].trim();
        const args = splitArgs(argsStr);

        const strip = strips.get(stripName);
        if (!strip) continue;

        if (method === "begin") {
          strip.initialized = true;
        } else if (method === "clear") {
          strip.buffer = Array.from({ length: strip.numPixels }, () => ({ r: 0, g: 0, b: 0 }));
        } else if (method === "setBrightness") {
          if (args.length >= 1) {
            strip.brightness = Math.max(0, Math.min(255, evaluateSimpleExpr(args[0], variables)));
          }
        } else if (method === "fill") {
          if (args.length >= 1) {
            const colorVal = evaluateSimpleExpr(args[0], variables);
            const first = args.length >= 2 ? evaluateSimpleExpr(args[1], variables) : 0;
            const count = args.length >= 3 ? evaluateSimpleExpr(args[2], variables) : strip.numPixels - first;

            const r = (colorVal >> 16) & 0xff;
            const g = (colorVal >> 8) & 0xff;
            const b = colorVal & 0xff;

            for (let idx = first; idx < first + count && idx < strip.numPixels; idx++) {
              strip.buffer[idx] = { r, g, b };
            }
          }
        } else if (method === "setPixelColor") {
          if (args.length >= 2) {
            const idx = evaluateSimpleExpr(args[0], variables);
            if (idx >= 0 && idx < strip.numPixels) {
              if (args.length >= 4) {
                // 4-argument form: setPixelColor(idx, r, g, b)
                const r = Math.max(0, Math.min(255, evaluateSimpleExpr(args[1], variables)));
                const g = Math.max(0, Math.min(255, evaluateSimpleExpr(args[2], variables)));
                const b = Math.max(0, Math.min(255, evaluateSimpleExpr(args[3], variables)));
                strip.buffer[idx] = { r, g, b };
              } else {
                // 2-argument form: setPixelColor(idx, color)
                const colorVal = evaluateSimpleExpr(args[1], variables);
                const r = (colorVal >> 16) & 0xff;
                const g = (colorVal >> 8) & 0xff;
                const b = colorVal & 0xff;
                strip.buffer[idx] = { r, g, b };
              }
            }
          }
        } else if (method === "show") {
          // Commit buffer to visible state & record animation phase
          strip.visible = strip.buffer.map((p) => ({ ...p }));
          strip.phases.push({
            buffer: strip.buffer.map((p) => ({ ...p })),
            duration: 0,
          });
          strip.showCalled = true;
        }
      }
    }
  };

  // Run setup block first if present
  if (setupBody) {
    processBlock(setupBody);
  }

  // Clear phases before running loop block so setup-only shows don't pollute dynamic loop animation
  for (const strip of strips.values()) {
    strip.phases = [];
  }

  // Run loop block
  processBlock(loopBody);

  // Time-sliced multi-phase resolution:
  // If a strip executed multiple .show() calls with delays, choose the active phase based on current time
  const currentTime = (context?.timestamp !== undefined)
    ? context.timestamp
    : (context?.tick !== undefined ? context.tick * 100 : (typeof Date !== "undefined" ? Date.now() : 0));

  for (const strip of strips.values()) {
    if (strip.phases.length > 1) {
      let totalDuration = 0;
      for (const ph of strip.phases) {
        if (ph.duration <= 0) {
          ph.duration = 50; // default 50ms for instantaneous phase
        }
        totalDuration += ph.duration;
      }

      if (totalDuration > 0) {
        let cursor = ((currentTime % totalDuration) + totalDuration) % totalDuration;
        let activePhase = strip.phases[strip.phases.length - 1];
        for (const ph of strip.phases) {
          if (cursor < ph.duration) {
            activePhase = ph;
            break;
          }
          cursor -= ph.duration;
        }
        strip.visible = activePhase.buffer.map((p) => ({ ...p }));
      }
    }
  }

  // Return actions for strips where .show() was called
  const actions: Esp32NeoPixelWriteAction[] = [];
  for (const strip of strips.values()) {
    if (strip.showCalled) {
      actions.push({
        type: "neopixel_write",
        pin: strip.pin,
        pixels: strip.visible.map((p) => ({ ...p })),
        warning: strip.warning,
      });
    }
  }

  return actions;
}
