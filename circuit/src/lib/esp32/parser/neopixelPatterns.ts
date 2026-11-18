/**
 * ESP32 MicroPython NeoPixel Parser
 *
 * Extracts normalized `neopixel_write` actions from ESP32 MicroPython source code:
 *   - np = NeoPixel(Pin(pin), count) or NeoPixel(pin=Pin(pin), n=count)
 *   - neopixel.NeoPixel(...)
 *   - np[idx] = (r, g, b) or (r, g, b, w)
 *   - np.fill((r, g, b))
 *   - np.write() — commits the buffered pixels
 *
 * Hardware safety checks:
 *   - GPIO 6-11: Reserved for internal SPI flash (emits warning, blocked)
 *   - GPIO 34, 35, 36, 39: Input-only pins (emits warning, blocked)
 */

import { getBoardAdapter } from "../../circuit/boardAdapter";

export interface Esp32NeoPixelWriteAction {
  type: "neopixel_write";
  pin: number;
  pixels: Array<{ r: number; g: number; b: number }>;
  warning?: string;
}

/**
 * Parses ESP32 MicroPython source code for static NeoPixel buffer operations and commits.
 * Returns normalized Esp32NeoPixelWriteAction items for instances that invoked .write().
 */
export function parseEsp32PythonNeoPixelActions(code: string): Esp32NeoPixelWriteAction[] {
  if (!code || typeof code !== "string") return [];

  const adapter = getBoardAdapter("esp32");
  const actions: Esp32NeoPixelWriteAction[] = [];

  // Track NeoPixel instances: varName -> { pin, count, pixels: Array<{r,g,b}>, writeCalled: boolean }
  interface NeoPixelInstance {
    pin: number;
    count: number;
    pixels: Array<{ r: number; g: number; b: number }>;
    writeCalled: boolean;
    warning?: string;
  }

  const instances = new Map<string, NeoPixelInstance>();

  // Clean comments and normalize newlines
  const lines = code.split(/\r?\n/).map((line) => {
    const commentIdx = line.indexOf("#");
    return commentIdx >= 0 ? line.slice(0, commentIdx).trim() : line.trim();
  }).filter((line) => line.length > 0);

  for (const line of lines) {
    // 1. Constructor pattern:
    // np = NeoPixel(Pin(4), 8) or np = neopixel.NeoPixel(Pin(4), 8) or np = NeoPixel(pin=Pin(4), n=8)
    const constrMatch = line.match(
      /(?:([a-zA-Z_]\w*)\s*=\s*)?(?:neopixel\.)?NeoPixel\s*\(\s*(?:pin\s*=\s*)?(?:Pin\s*\(\s*(\d+)\s*\)|(\d+))\s*,\s*(?:n\s*=\s*)?(\d+)\s*\)/i,
    );

    if (constrMatch) {
      const varName = constrMatch[1] || "np";
      const rawPin = constrMatch[2] ?? constrMatch[3];
      const count = parseInt(constrMatch[4], 10) || 1;
      const pinNum = parseInt(rawPin, 10);

      const pinDef = adapter.parseHandleToPinNumber(`gpio${pinNum}`);
      let warning: string | undefined;

      if (!pinDef) {
        warning = `Forbidden GPIO ${pinNum} reserved for internal SPI flash memory.`;
      } else if (pinNum === 34 || pinNum === 35 || pinNum === 36 || pinNum === 39) {
        warning = `GPIO ${pinNum} is input-only and cannot drive NeoPixel data.`;
      }

      instances.set(varName, {
        pin: pinNum,
        count,
        pixels: Array.from({ length: count }, () => ({ r: 0, g: 0, b: 0 })),
        writeCalled: false,
        warning,
      });
      continue;
    }

    // 2. Fill pattern: np.fill((r, g, b)) or np.fill([r, g, b])
    const fillMatch = line.match(
      /([a-zA-Z_]\w*)\s*\.\s*fill\s*\(\s*[\(\[]\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*\d+)?\s*[\)\]]\s*\)/i,
    );
    if (fillMatch) {
      const varName = fillMatch[1];
      const inst = instances.get(varName);
      if (inst) {
        const r = Math.max(0, Math.min(255, parseInt(fillMatch[2], 10) || 0));
        const g = Math.max(0, Math.min(255, parseInt(fillMatch[3], 10) || 0));
        const b = Math.max(0, Math.min(255, parseInt(fillMatch[4], 10) || 0));
        inst.pixels = Array.from({ length: inst.count }, () => ({ r, g, b }));
      }
      continue;
    }

    // 3. Subscript assignment pattern: np[0] = (255, 0, 0) or np[0] = [255, 0, 0] or with 4th RGBW value
    const assignMatch = line.match(
      /([a-zA-Z_]\w*)\s*\[\s*(\d+)\s*\]\s*=\s*[\(\[]\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*\d+)?\s*[\)\]]/i,
    );
    if (assignMatch) {
      const varName = assignMatch[1];
      const idx = parseInt(assignMatch[2], 10);
      const inst = instances.get(varName);
      if (inst && idx >= 0 && idx < inst.count) {
        const r = Math.max(0, Math.min(255, parseInt(assignMatch[3], 10) || 0));
        const g = Math.max(0, Math.min(255, parseInt(assignMatch[4], 10) || 0));
        const b = Math.max(0, Math.min(255, parseInt(assignMatch[5], 10) || 0));
        inst.pixels[idx] = { r, g, b };
      }
      continue;
    }

    // 4. Write commit: np.write()
    const writeMatch = line.match(/([a-zA-Z_]\w*)\s*\.\s*write\s*\(\s*\)/i);
    if (writeMatch) {
      const varName = writeMatch[1];
      const inst = instances.get(varName);
      if (inst) {
        inst.writeCalled = true;
        actions.push({
          type: "neopixel_write",
          pin: inst.pin,
          pixels: inst.pixels.map((p) => ({ ...p })),
          warning: inst.warning,
        });
      }
      continue;
    }
  }

  return actions;
}
