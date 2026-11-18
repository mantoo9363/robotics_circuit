/**
 * ESP32 C++ IR Remote / Receiver Parser
 *
 * Implements Phase 9:
 *  - IrReceiver.begin(pin) / IRrecv irrecv(pin)
 *  - IrReceiver.decode() / irrecv.decode()
 *  - IrReceiver.decodedIRData.command / IrReceiver.decodedIRData.address
 *  - IrReceiver.resume()
 *  - Edge-triggered consumption & 21-button NEC dictionary matching
 *  - Hardware safety checks: GPIO 6-11 rejected, GPIO 34-39 (input-only) allowed
 */

import {
  stripCppComments,
  stripCppIncludes,
  parseCppConstants,
  resolveCppPinNumber,
  isEsp32ReservedFlashPin,
} from "./cppPatterns";
import { resolveIrReceiverValue, NEC_COMMANDS } from "./irReceiver";
import type { CircuitNode, CircuitEdge } from "../../types";
import type { SimulationFrame } from "../../simulation-state";

export interface Esp32CppIrReceiverContext {
  nodes?: CircuitNode[];
  edges?: CircuitEdge[];
  frame?: SimulationFrame | null;
  tick?: number;
  running?: boolean;
}

export interface Esp32CppIrReceiverResult {
  pin: number | null;
  decoded: boolean;
  command: number | null;
  address: number;
  warning?: string;
}

/**
 * Extracts the declared IR receiver GPIO pin from C++ source code.
 * Matches:
 *  - IrReceiver.begin(PIN)
 *  - IRrecv irrecv(PIN)
 *  - #define IR_RECEIVE_PIN 15
 */
export function extractCppIrReceiverPin(
  code: string,
  constants: Map<string, number>,
): number | null {
  const cleaned = stripCppIncludes(stripCppComments(code));

  // 1. IrReceiver.begin(pin)
  const beginMatch = cleaned.match(/\bIrReceiver\s*\.\s*begin\s*\(\s*([^,\s)]+)/);
  if (beginMatch) {
    const pin = resolveCppPinNumber(beginMatch[1], constants);
    if (pin !== null) return pin;
  }

  // 2. IRrecv <var>(pin)
  const constrMatch = cleaned.match(/\bIRrecv\s+[A-Za-z_]\w*\s*\(\s*([^,\s)]+)/);
  if (constrMatch) {
    const pin = resolveCppPinNumber(constrMatch[1], constants);
    if (pin !== null) return pin;
  }

  // 3. Known constant name fallback
  if (constants.has("IR_RECEIVE_PIN")) {
    return constants.get("IR_RECEIVE_PIN")!;
  }
  if (constants.has("RECV_PIN")) {
    return constants.get("RECV_PIN")!;
  }

  return null;
}

/**
 * Evaluates the C++ IR receiver state against active circuit simulation.
 */
export function evaluateEsp32CppIrReceiver(
  code: string,
  context?: Esp32CppIrReceiverContext,
): Esp32CppIrReceiverResult {
  if (!code || typeof code !== "string") {
    return { pin: null, decoded: false, command: null, address: 0 };
  }

  const constants = parseCppConstants(code);
  const pin = extractCppIrReceiverPin(code, constants);

  if (pin === null) {
    return { pin: null, decoded: false, command: null, address: 0 };
  }

  // Pin safety check: GPIO6-11 forbidden for SPI flash
  if (isEsp32ReservedFlashPin(pin)) {
    return {
      pin,
      decoded: false,
      command: null,
      address: 0,
      warning: `Forbidden GPIO ${pin} reserved for internal SPI flash memory.`,
    };
  }

  const frame = context?.frame ?? null;
  const nodes = context?.nodes;
  const edges = context?.edges;

  // Boot-time guard: at tick 0 or when not running, never trigger a false decode
  if (context?.running === false || (context?.tick !== undefined && context.tick === 0) || (frame && (!frame.running || frame.tick === 0))) {
    return { pin, decoded: false, command: null, address: 0 };
  }

  const effectiveFrame = frame ?? (context?.tick !== undefined ? ({ tick: context.tick, running: context.running ?? true } as any) : null);
  const cmd = resolveIrReceiverValue(pin, nodes, edges, effectiveFrame);

  if (cmd !== null) {
    return {
      pin,
      decoded: true,
      command: cmd,
      address: 0,
    };
  }

  return {
    pin,
    decoded: false,
    command: null,
    address: 0,
  };
}

/**
 * Extracts and injects IR receiver variables into local variable maps for C++ evaluations.
 */
export function extractCppIrReceiverVariables(
  code: string,
  context?: Esp32CppIrReceiverContext,
  localVars?: Map<string, any>,
): Map<string, any> {
  const vars = localVars ?? new Map<string, any>();
  const irRes = evaluateEsp32CppIrReceiver(code, context);

  // If this is a nested block without an IR pin declaration but vars already has IR variables, preserve them
  if (irRes.pin === null && vars.has("__ir_decoded")) {
    return vars;
  }

  // Expose evaluation flags
  vars.set("__ir_decoded", irRes.decoded ? 1 : 0);
  vars.set("__ir_command", irRes.command ?? 0);
  vars.set("__ir_address", irRes.address ?? 0);

  if (irRes.decoded && irRes.command !== null) {
    vars.set("IrReceiver.decodedIRData.command", irRes.command);
    vars.set("IrReceiver.decodedIRData.address", irRes.address);
    vars.set("results.value", irRes.command);
  } else {
    vars.set("IrReceiver.decodedIRData.command", 0);
    vars.set("IrReceiver.decodedIRData.address", 0);
    vars.set("results.value", 0);
  }

  return vars;
}
