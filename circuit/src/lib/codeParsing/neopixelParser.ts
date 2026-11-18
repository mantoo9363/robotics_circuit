import { stripCodeComments, parseArduinoConstants, resolveArduinoNumber, evaluateExpression, unrollLoops } from "./arduinoParser";

export interface PixelColor {
  r: number;
  g: number;
  b: number;
}

export interface NeoPixelState {
  pixels: PixelColor[];
  brightness: number;
  initialized: boolean;
}

/**
 * Split arguments by commas only when they occur at parentheses nesting depth 0
 */
export function splitByCommaOutsideParens(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map(p => p.trim());
}

/**
 * HSV to RGB conversion matching Adafruit_NeoPixel rainbow/ColorHSV standard
 * h is 0-65535, s is 0-255, v is 0-255
 */
export function hsvToRgb(h: number, s: number, v: number): PixelColor {
  const saturation = s / 255;
  const value = v / 255;
  const hue = ((h % 65536) / 65536) * 360;

  const c = value * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - c;

  let r = 0, g = 0, b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Collapses if/else-if/else chains that condition on distance, temperature, or humidity
 * into only the active branch body. This must run before the unconditional if-stripping in
 * parseNeoPixelColors so that only the matching NeoPixel calls are emitted.
 */
export function collapseSensorConditionals(
  code: string,
  sensors: { distanceCm?: number; tempCelsius?: number; humidity?: number } = {},
): string {
  let result = "";
  let i = 0;
  while (i < code.length) {
    const ifMatch = code.slice(i).match(/^if\s*\(/);
    if (!ifMatch) { result += code[i++]; continue; }
    const ifHeaderStart = i;
    i += ifMatch[0].length;
    let depth = 1;
    let condStart = i;
    while (i < code.length && depth > 0) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") depth--;
      i++;
    }
    const condition = code.slice(condStart, i - 1);
    const hasDistance = sensors.distanceCm !== undefined && /\b(distance|dist|cm)\b/i.test(condition);
    const hasTemp = sensors.tempCelsius !== undefined && /\b(temperature|temp|celsius|tempC|tempF|t)\b/i.test(condition);
    const hasHum = sensors.humidity !== undefined && /\b(humidity|hum|h)\b/i.test(condition);

    if (!hasDistance && !hasTemp && !hasHum) {
      result += code.slice(ifHeaderStart, i);
      continue;
    }
    type Branch = { condition: string | null; body: string };
    const branches: Branch[] = [];
    const extractBracedBody = (): string => {
      while (i < code.length && /\s/.test(code[i])) i++;
      if (i >= code.length || code[i] !== "{") {
        const start = i;
        while (i < code.length && code[i] !== ";") i++;
        if (i < code.length) i++;
        return code.slice(start, i);
      }
      let bd = 1; i++;
      const bodyStart = i;
      while (i < code.length && bd > 0) {
        if (code[i] === "{") bd++;
        else if (code[i] === "}") bd--;
        i++;
      }
      return code.slice(bodyStart, i - 1);
    };
    branches.push({ condition, body: extractBracedBody() });
    while (i < code.length) {
      const rest = code.slice(i);
      const elseIfMatch = rest.match(/^\s*else\s+if\s*\(/);
      const elseMatch = rest.match(/^\s*else\s*(?!if)/);
      if (elseIfMatch) {
        i += elseIfMatch[0].length;
        depth = 1; condStart = i;
        while (i < code.length && depth > 0) {
          if (code[i] === "(") depth++;
          else if (code[i] === ")") depth--;
          i++;
        }
        branches.push({ condition: code.slice(condStart, i - 1), body: extractBracedBody() });
      } else if (elseMatch) {
        i += elseMatch[0].length;
        branches.push({ condition: null, body: extractBracedBody() });
        break;
      } else break;
    }
    let activeBody = "";
    for (const branch of branches) {
      if (branch.condition === null) { activeBody = branch.body; break; }
      let expr = branch.condition;
      if (sensors.distanceCm !== undefined) {
        expr = expr.replace(/\b(distance|dist|cm)\b/gi, String(sensors.distanceCm));
      }
      if (sensors.tempCelsius !== undefined) {
        expr = expr.replace(/\b(temperature|temp|celsius|tempC|tempF|t)\b/gi, String(sensors.tempCelsius));
      }
      if (sensors.humidity !== undefined) {
        expr = expr.replace(/\b(humidity|hum|h)\b/gi, String(sensors.humidity));
      }
      expr = expr.replace(/\bisnan\s*\([^)]*\)/gi, "false");
      expr = expr.replace(/\bHIGH\b/g, "1").replace(/\bLOW\b/g, "0");
      expr = expr.replace(/\b0x([0-9a-fA-F]+)\b/g, (_, h) => String(parseInt(h, 16)));
      const sanitized = expr.replace(/[^0-9.+\-*/()&|!=<> ]/g, "");
      let condMet = false;
      try { condMet = !!new Function(`return (${sanitized});`)(); } catch (_) {}
      if (condMet) { activeBody = branch.body; break; }
    }
    result += activeBody;
  }
  return result;
}

/**
 * Parses unrolled C++ code, simulates Adafruit_NeoPixel methods, and returns
 * the visible state of the pixel buffer for the requested Arduino digital pin.
 * @param analogPinValues Optional map of Arduino pin number (14=A0..19=A5) → live 0..1023 value
 *   used to resolve `analogRead(A0)` calls that would otherwise evaluate to 0.
 */
export function parseNeoPixelColors(
  code: string,
  pin: number,
  numPixels: number,
  analogPinValues?: Map<number, number>,
  distanceCm?: number,
  tempCelsius?: number,
  humidity?: number,
): NeoPixelState | null {

  const cleaned = stripCodeComments(code);

  if (!/\bAdafruit_NeoPixel\b/.test(cleaned)) {
    return null;
  }

  const unrolled = unrollLoops(cleaned);

  const constants = parseArduinoConstants(code);
  const variables = new Map<string, number>();
  for (const [k, v] of constants.entries()) {
    variables.set(k, v);
  }

  // Pre-resolve nested Color(r, g, b) calls in the code first using depth-aware parsing
  let resolvedCode = unrolled;

  // Pre-substitute analogRead(A0..A5) or analogRead(0..5) with live sensor values so that
  // NeoPixel code driven by sensors (LDR, potentiometer, etc.) shows the correct colour.
  if (analogPinValues && analogPinValues.size > 0) {
    const analogPinNames = ["A0", "A1", "A2", "A3", "A4", "A5"];
    resolvedCode = resolvedCode.replace(
      /\banalogRead\s*\(\s*([A-Za-z0-9_]+)\s*\)/g,
      (_match, pinExpr) => {
        const upper = pinExpr.trim().toUpperCase();
        // Match A0..A5 by name
        const nameIdx = analogPinNames.indexOf(upper);
        if (nameIdx >= 0) {
          const val = analogPinValues.get(14 + nameIdx);
          if (val !== undefined) return String(val);
        }
        // Match numeric literal 0..5 used as analog channel
        const pinNum = parseInt(pinExpr, 10);
        if (!isNaN(pinNum) && pinNum >= 0 && pinNum <= 5) {
          const val = analogPinValues.get(14 + pinNum);
          if (val !== undefined) return String(val);
        }
        return "0";
      },
    );
  }

  // Replace random(max) and random(min, max) with a random number first so they evaluate cleanly
  resolvedCode = resolvedCode.replace(/\brandom\s*\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g, (match, minExpr, maxExpr) => {
    try {
      const min = evaluateExpression(minExpr, variables);
      const max = evaluateExpression(maxExpr, variables);
      const val = Math.floor(Math.random() * (max - min) + min);
      return String(val);
    } catch (e) {
      return "0";
    }
  });
  resolvedCode = resolvedCode.replace(/\brandom\s*\(\s*([^)]+)\s*\)/g, (match, maxExpr) => {
    try {
      const max = evaluateExpression(maxExpr, variables);
      const val = Math.floor(Math.random() * max);
      return String(val);
    } catch (e) {
      return "0";
    }
  });

  const colorFindRegex = /(?:\b[A-Za-z_]\w*\.)?\bColor\s*\(/g;
  let colorMatch;
  while ((colorMatch = colorFindRegex.exec(resolvedCode)) !== null) {
    const pos = colorMatch.index;
    const matchStr = colorMatch[0];
    let depth = 1;
    let end = -1;
    const start = pos + matchStr.length;
    for (let i = start; i < resolvedCode.length; i++) {
      if (resolvedCode[i] === "(") depth++;
      else if (resolvedCode[i] === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) {
      const argText = resolvedCode.slice(start, end);
      const parts = splitByCommaOutsideParens(argText);
      let packedColor = 0;
      if (parts.length >= 3) {
        try {
          const r = evaluateExpression(parts[0], variables);
          const g = evaluateExpression(parts[1], variables);
          const b = evaluateExpression(parts[2], variables);
          packedColor = ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
        } catch (e) {}
      }
      resolvedCode =
        resolvedCode.slice(0, pos) +
        packedColor +
        resolvedCode.slice(end + 1);
      
      colorFindRegex.lastIndex = 0; // reset Exec pointer since string mutated
    }
  }

  // Discover and parse global arrays
  const arrays = new Map<string, number[]>();
  const arrayPattern = /\b(?:uint32_t|int|long|uint16_t|byte)\s+([A-Za-z_]\w*)\s*\[\s*\]\s*=\s*\{([^}]+)\}/g;
  for (const match of resolvedCode.matchAll(arrayPattern)) {
    const name = match[1];
    const valsText = match[2];
    const vals = valsText.split(",").map(v => {
      try {
        return evaluateExpression(v.trim(), variables);
      } catch(e) {
        return 0;
      }
    });
    arrays.set(name, vals);
  }

  // Replace array access lookups with literal values, e.g. colors[0] -> 16711680
  for (const [arrName, arrVals] of arrays.entries()) {
    const arrAccessPattern = new RegExp(`\\b${arrName}\\s*\\[\\s*(\\d+)\\s*\\]`, "g");
    resolvedCode = resolvedCode.replace(arrAccessPattern, (match, idxStr) => {
      const idx = parseInt(idxStr, 10);
      return String(arrVals[idx] ?? 0);
    });
  }

  // Discover strip objects
  const declPattern = /Adafruit_NeoPixel\s+([A-Za-z_]\w*)\s*(?:\(\s*([^)]+)\s*\)|=\s*Adafruit_NeoPixel\s*\(\s*([^)]+)\s*\))/g;
  const strips = new Map<
    string,
    {
      pin: number;
      numPixels: number;
      pixels: PixelColor[];
      brightness: number;
      initialized: boolean;
      colorOrder: string;
      frequency: string;
    }
  >();

  for (const match of resolvedCode.matchAll(declPattern)) {
    const name = match[1];
    const argsText = match[2] || match[3];
    const parts = argsText.split(",").map((p) => p.trim());

    const numPixelsToken = parts[0];
    const pinToken = parts[1];
    const colorOrder = parts[2] ?? "NEO_GRB";
    const frequency = parts[3] ?? "NEO_KHZ800";

    const declaredNumPixels = resolveArduinoNumber(numPixelsToken, constants) ?? numPixels;
    const declaredPin = resolveArduinoNumber(pinToken, constants) ?? pin;

    strips.set(name, {
      pin: declaredPin,
      numPixels: declaredNumPixels,
      pixels: Array.from({ length: declaredNumPixels }, () => ({ r: 0, g: 0, b: 0 })),
      brightness: 255,
      initialized: false,
      colorOrder,
      frequency,
    });
  }

  // Fallback default strip if none declared explicitly but calls are present
  if (strips.size === 0 && /\bsetPixelColor\b/.test(resolvedCode)) {
    strips.set("pixels", {
      pin,
      numPixels,
      pixels: Array.from({ length: numPixels }, () => ({ r: 0, g: 0, b: 0 })),
      brightness: 255,
      initialized: false,
      colorOrder: "NEO_GRB",
      frequency: "NEO_KHZ800",
    });
  }

  const visiblePixels = new Map<string, PixelColor[]>();
  const visibleBrightness = new Map<string, number>();
  const visibleInitialized = new Map<string, boolean>();

  // Process all statements sequentially after stripping block structures.
  // If sensor parameters (distance, temp, hum) are provided, first collapse if/else chains
  // into only the active branch so that the unconditional strip below gives correct results.
  const codeForStripping = collapseSensorConditionals(resolvedCode, {
    distanceCm,
    tempCelsius,
    humidity,
  });

  const cleanCode = codeForStripping
    .replace(/void\s+[A-Za-z_]\w*\s*\([^)]*\)\s*\{/g, "")
    .replace(/for\s*\([^)]*\)\s*\{/g, "")
    .replace(/if\s*\([^)]*\)\s*\{/g, "")
    .replace(/else\s*\{/g, "")
    .replace(/[\{\}]/g, "");

  const statements = cleanCode.split(";").map((s) => s.trim()).filter(Boolean);
  
  const assignRegex = /^(?:\b(?:int|byte|uint8_t|uint16_t|uint32_t|long|float|double|char|bool)\s+)?([A-Za-z_]\w*)\s*([+\-*/]?=)\s*([^;]+)$/;
  const methodRegex = /^([A-Za-z_]\w*)\s*\.\s*(begin|clear|show|fill|setPixelColor|setBrightness|rainbow)\s*\(([^)]*)\)$/;

  for (const stmt of statements) {
    const cleanStmt = stmt.trim();
    if (!cleanStmt) continue;

    // Check if assignment
    const assignMatch = cleanStmt.match(assignRegex);
    if (assignMatch) {
      const name = assignMatch[1];
      const op = assignMatch[2];
      const expr = assignMatch[3].trim();
      try {
        const val = evaluateExpression(expr, variables);
        if (op === "=") {
          variables.set(name, val);
        } else if (op === "+=") {
          variables.set(name, (variables.get(name) ?? 0) + val);
        } else if (op === "-=") {
          variables.set(name, (variables.get(name) ?? 0) - val);
        } else if (op === "*=") {
          variables.set(name, (variables.get(name) ?? 0) * val);
        } else if (op === "/=") {
          variables.set(name, (variables.get(name) ?? 0) / val);
        }
      } catch (e) {}
      continue;
    }

    // Check if method call
    const methodMatch = cleanStmt.match(methodRegex);
    if (methodMatch) {
      const objectName = methodMatch[1];
      const method = methodMatch[2];
      const argsString = methodMatch[3].trim();
      const args = argsString ? argsString.split(",").map((a) => a.trim()) : [];

      const strip = strips.get(objectName);
      if (!strip) continue;

      try {
        if (method === "begin") {
          strip.initialized = true;
        } else if (method === "clear") {
          strip.pixels.fill({ r: 0, g: 0, b: 0 });
        } else if (method === "setBrightness") {
          if (args.length >= 1) {
            strip.brightness = Math.max(0, Math.min(255, evaluateExpression(args[0], variables)));
          }
        } else if (method === "setPixelColor") {
          if (args.length >= 2) {
            const idx = evaluateExpression(args[0], variables);
            if (idx >= 0 && idx < strip.numPixels) {
              if (args.length >= 4) {
                const r = evaluateExpression(args[1], variables);
                const g = evaluateExpression(args[2], variables);
                const b = evaluateExpression(args[3], variables);
                // Clamp to 0..255. Use Math.min/max rather than `& 0xff` because raw
                // analogRead() values (0..1023) would silently wrap (e.g. 256 → 0).
                strip.pixels[idx] = {
                  r: Math.max(0, Math.min(255, Math.round(r))),
                  g: Math.max(0, Math.min(255, Math.round(g))),
                  b: Math.max(0, Math.min(255, Math.round(b))),
                };
              } else {
                const color = evaluateExpression(args[1], variables);
                const r = (color >> 16) & 0xff;
                const g = (color >> 8) & 0xff;
                const b = color & 0xff;
                strip.pixels[idx] = { r, g, b };
              }
            }
          }
        } else if (method === "fill") {
          if (args.length >= 1) {
            const color = evaluateExpression(args[0], variables);
            const first = args.length >= 2 ? evaluateExpression(args[1], variables) : 0;
            const count = args.length >= 3 ? evaluateExpression(args[2], variables) : strip.numPixels - first;
            const r = (color >> 16) & 0xff;
            const g = (color >> 8) & 0xff;
            const b = color & 0xff;
            for (let i = first; i < first + count && i < strip.numPixels; i++) {
              strip.pixels[i] = { r, g, b };
            }
          }
        } else if (method === "rainbow") {
          if (args.length >= 1) {
            const first_h = evaluateExpression(args[0], variables);
            const reps = args.length >= 2 ? evaluateExpression(args[1], variables) : 1;
            const sat = args.length >= 3 ? evaluateExpression(args[2], variables) : 255;
            const val = args.length >= 4 ? evaluateExpression(args[3], variables) : 255;
            for (let i = 0; i < strip.numPixels; i++) {
              const hue = first_h + (i * reps * 65536) / strip.numPixels;
              strip.pixels[i] = hsvToRgb(hue, sat, val);
            }
          }
        } else if (method === "show") {
          visiblePixels.set(objectName, strip.pixels.map((p) => ({ ...p })));
          visibleBrightness.set(objectName, strip.brightness);
          visibleInitialized.set(objectName, strip.initialized);
        }
      } catch (e) {
        // Catch syntax/evaluation errors during execution to avoid crashing
      }
    }
  }

  // Find the strip that matches the requested pin and return its visible state
  for (const [name, strip] of strips.entries()) {
    if (strip.pin === pin) {
      const pixels = visiblePixels.get(name) ?? strip.pixels;
      const brightness = visibleBrightness.get(name) ?? strip.brightness;
      const initialized = visibleInitialized.get(name) ?? strip.initialized;
      return { pixels, brightness, initialized };
    }
  }

  return null;
}
