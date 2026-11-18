/**
 * ESP32 C++ Support Inspector
 *
 * Inspects ESP32 Arduino C++ source code to determine if it only uses
 * supported Phase 1 constructs (void setup/loop, pinMode, digitalWrite, digitalRead, delay).
 * Used by CodeEditor and Toolbar to conditionally remove the amber warning banner and
 * simulation block when the sketch is fully runnable.
 */

import { stripCppComments, stripCppIncludes } from "./cppPatterns";

export interface CppSupportStatus {
  isSupported: boolean;
  unsupportedConstructs: string[];
}

const UNSUPPORTED_CONSTRUCT_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "tone / noTone", regex: /\b(?:tone|noTone)\s*\(/ },
  { name: "Serial input (Serial.read / Serial.available)", regex: /\bSerial\.(?:read|available|parseInt|parseFloat|readString|readBytes)\s*\(/ },
  { name: "SPI library", regex: /\bSPI\.(?:begin|transfer)\s*\(/ },
  { name: "WiFi library", regex: /\bWiFi\.(?:begin|mode)\s*\(/ },
  { name: "Servo library", regex: /\b(?:Servo\s+\w+|\w+\.attach\s*\()/ },
];

/**
 * Checks if the given C++ source code contains only Phase 1 supported constructs.
 */
export function checkEsp32CppSupport(code: string): CppSupportStatus {
  if (!code || typeof code !== "string") {
    return { isSupported: true, unsupportedConstructs: [] };
  }

  const cleaned = stripCppIncludes(stripCppComments(code));
  const unsupported: string[] = [];

  for (const item of UNSUPPORTED_CONSTRUCT_PATTERNS) {
    if (item.regex.test(cleaned)) {
      unsupported.push(item.name);
    }
  }

  return {
    isSupported: unsupported.length === 0,
    unsupportedConstructs: unsupported,
  };
}
