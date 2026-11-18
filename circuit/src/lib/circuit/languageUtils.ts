import type { CircuitNode } from "../types";
import { useCircuitStore } from "../store";

/**
 * Checks if MicroPython code buffer contains active code (excluding comments & whitespace).
 */
export function hasActivePythonCode(picoCode?: string): boolean {
  if (!picoCode || typeof picoCode !== "string") return false;
  const codeWithoutComments = picoCode.replace(/#.*$/gm, "").trim();
  return codeWithoutComments.length > 0;
}

/**
 * Checks if C++ Arduino code buffer contains active C++ sketch structures.
 */
export function hasActiveCppCode(arduinoCode?: string): boolean {
  if (!arduinoCode || typeof arduinoCode !== "string") return false;
  return /void\s+(?:setup|loop)\s*\(/i.test(arduinoCode) || /\b(?:pinMode|digitalWrite|pulseIn)\s*\(/i.test(arduinoCode);
}

/**
 * Resolves which code buffer holds the "live" ESP32 sketch and whether it's
 * MicroPython or C++.
 *
 * ESP32 supports both languages from a single "Auto" dropdown state, but the
 * app stores code in two separate buffers (`arduinoCode` for C++, `picoCode`
 * for MicroPython). When the language hasn't been picked explicitly, a fresh
 * ESP32 sketch defaults to the `picoCode` buffer (MicroPython) — so if the
 * user types C++ before the language is pinned, that C++ text physically
 * lands in `picoCode`, not `arduinoCode`. Detecting C++ signals in `picoCode`
 * too (not just `arduinoCode`) lets auto-detection flip languages without the
 * buffer switching out from under the user mid-sentence.
 */
export function resolveEsp32Language(
  selectedLanguage: string | undefined,
  arduinoCode: string,
  picoCode: string,
): { isPython: boolean; buffer: "arduino" | "pico" } {
  if (selectedLanguage === "cpp") return { isPython: false, buffer: "arduino" };
  if (selectedLanguage === "python") return { isPython: true, buffer: "pico" };

  if (hasActiveCppCode(arduinoCode)) return { isPython: false, buffer: "arduino" };
  if (hasActiveCppCode(picoCode)) return { isPython: false, buffer: "pico" };
  return { isPython: true, buffer: "pico" }; // MicroPython default, including empty sketch
}

/**
 * Resolves whether the current simulation context should execute as MicroPython.
 * Correctly evaluates "auto" mode for ESP32 based on active code content.
 */
export function isEffectivePython(
  selectedLanguage: string | undefined,
  nodes: CircuitNode[],
  arduinoCode?: string,
  picoCode?: string,
): boolean {
  if (selectedLanguage === "cpp") return false;
  if (selectedLanguage === "python") return true;

  const hasArduino = nodes.some((n) => (n.data?.componentType || n.type) === "arduino");
  const hasPico    = nodes.some((n) => (n.data?.componentType || n.type) === "raspberrypipico");
  const hasEsp32   = nodes.some((n) => (n.data?.componentType || n.type) === "esp32");

  if (hasArduino) return false;
  if (hasPico) return true;

  if (hasEsp32) {
    const cppCode = arduinoCode ?? (typeof window !== "undefined" ? useCircuitStore.getState().arduinoCode : "");
    const pyCode  = picoCode    ?? (typeof window !== "undefined" ? useCircuitStore.getState().picoCode : "");
    return resolveEsp32Language(selectedLanguage, cppCode, pyCode).isPython;
  }

  return false;
}
