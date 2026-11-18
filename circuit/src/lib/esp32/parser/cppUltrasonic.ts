/**
 * ESP32 C++ (Arduino-style) HC-SR04 Ultrasonic Distance Sensor Parser & Evaluator
 *
 * Implements Phase 7:
 *  - Resolves pulseIn(echoPin, HIGH) against active canvas ultrasonicDistance nodes
 *  - Calculates ultrasonic round-trip duration in microseconds based on distance property
 *  - Handles disconnected/unpowered sensor timeout (returns 0)
 *  - Provides safe arithmetic expression evaluation (+, -, *, /, parens, unary minus, div-by-zero protection)
 *  - Tracks duration and distance variables for conditionals, Serial, and LCD outputs
 */

import { resolveCppPinNumber } from "./cppPatterns";
import { getNodeSimulationModel } from "../../circuit/components";
import { buildConductiveGraph, getReachableGraphNodes } from "../../circuit/graph";
import { validateComponentConnections } from "../../../utils/connectivity";
import type { CircuitNode, CircuitEdge } from "../../types";

export interface Esp32CppUltrasonicContext {
  nodes?: CircuitNode[];
  edges?: CircuitEdge[];
}

/**
 * Resolves the simulated pulseIn() duration in microseconds for an ESP32 GPIO pin.
 * Returns 0 if disconnected, unpowered, or timed out.
 */
export function resolveEsp32PulseIn(
  pin: number,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): number {
  if (!nodes || !edges || nodes.length === 0) return 0;

  const esp32Node = nodes.find(
    (n) => getNodeSimulationModel(n) === "esp32" || n.data?.componentType === "esp32" || n.type === "esp32",
  );
  if (!esp32Node) return 0;

  const ultrasonicNodes = nodes.filter(
    (n) => getNodeSimulationModel(n) === "ultrasonicDistance" || n.data?.componentType === "ultrasonicDistance",
  );
  if (ultrasonicNodes.length === 0) return 0;

  const graph = buildConductiveGraph(nodes, edges, { includeResistors: true });
  const pinEndpoint = `${esp32Node.id}:gpio${pin}`;
  const reachable = getReachableGraphNodes(graph, pinEndpoint);

  for (const uNode of ultrasonicNodes) {
    const echoEndpoint = `${uNode.id}:echo`;
    if (reachable.has(echoEndpoint)) {
      const isPowered = validateComponentConnections(uNode, nodes, edges);
      if (!isPowered) return 0;

      const rawDistance = Number(uNode.data?.properties?.distance?.value ?? 100);
      const distanceCm = Math.max(2, Math.min(400, Number.isFinite(rawDistance) ? rawDistance : 100));
      // Standard HC-SR04 speed of sound duration in microseconds: duration = (distanceCm * 2) / 0.0343
      return Math.round((distanceCm * 2) / 0.0343);
    }
  }

  return 0;
}

/**
 * Tokenizes an arithmetic expression into numbers, operators, parens, and variable identifiers.
 */
function tokenizeArithmetic(expr: string): string[] | null {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const char = expr[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === "(" || char === ")" || char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push(char);
      i++;
      continue;
    }
    if (/\d/.test(char) || (char === "." && i + 1 < expr.length && /\d/.test(expr[i + 1]))) {
      let numStr = "";
      while (i < expr.length && (/[\d.]/.test(expr[i]))) {
        numStr += expr[i];
        i++;
      }
      tokens.push(numStr);
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let ident = "";
      while (i < expr.length && /[A-Za-z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      tokens.push(ident);
      continue;
    }
    // Unrecognized character
    return null;
  }
  return tokens;
}

/**
 * Evaluates a mathematical arithmetic expression with variables, constants, and numbers.
 * Supports +, -, *, /, unary -, and parentheses.
 * Gracefully handles division by zero (returns 0), malformed expressions (returns null), and negative results.
 */
export function evaluateCppArithmeticExpr(
  expr: string,
  variables: Map<string, any> = new Map(),
  constants: Map<string, number> = new Map(),
): number | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  const tokens = tokenizeArithmetic(trimmed);
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;

  function parsePrimary(): number | null {
    if (pos >= tokens!.length) return null;
    const token = tokens![pos];

    // Unary plus
    if (token === "+") {
      pos++;
      return parsePrimary();
    }

    // Unary minus
    if (token === "-") {
      pos++;
      const val = parsePrimary();
      return val !== null ? -val : null;
    }

    // Parenthesized expression
    if (token === "(") {
      pos++;
      const val = parseAddSub();
      if (pos >= tokens!.length || tokens![pos] !== ")") {
        return null; // Mismatched paren
      }
      pos++; // Consume ')'
      return val;
    }

    // Numeric literal
    if (/^\d+(\.\d+)?$/.test(token) || /^\.\d+$/.test(token)) {
      pos++;
      return Number(token);
    }

    // Variable or constant identifier
    if (/^[A-Za-z_]\w*$/.test(token)) {
      pos++;
      if (variables.has(token)) {
        const v = Number(variables.get(token));
        return Number.isFinite(v) ? v : 0;
      }
      if (constants.has(token)) {
        const c = Number(constants.get(token));
        return Number.isFinite(c) ? c : 0;
      }
      return 0; // Undeclared variable fallback to 0
    }

    return null;
  }

  function parseMulDiv(): number | null {
    let left = parsePrimary();
    if (left === null) return null;

    while (pos < tokens!.length && (tokens![pos] === "*" || tokens![pos] === "/")) {
      const op = tokens![pos];
      pos++;
      const right = parsePrimary();
      if (right === null) return null;

      if (op === "*") {
        left = left * right;
      } else {
        // Division by zero safeguard
        if (right === 0) {
          left = 0;
        } else {
          left = left / right;
        }
      }
    }

    return left;
  }

  function parseAddSub(): number | null {
    let left = parseMulDiv();
    if (left === null) return null;

    while (pos < tokens!.length && (tokens![pos] === "+" || tokens![pos] === "-")) {
      const op = tokens![pos];
      pos++;
      const right = parseMulDiv();
      if (right === null) return null;

      if (op === "+") {
        left = left + right;
      } else {
        left = left - right;
      }
    }

    return left;
  }

  const result = parseAddSub();
  if (pos !== tokens.length || result === null || !Number.isFinite(result)) {
    return null;
  }

  return result;
}

/**
 * Extracts and tracks pulseIn and ultrasonic-derived distance variables in C++ source code.
 */
export function extractCppUltrasonicVariables(
  code: string,
  constants: Map<string, number>,
  context: Esp32CppUltrasonicContext = {},
  existingVars?: Map<string, any>,
): Map<string, number> {
  const variables = new Map<string, number>();
  const nodes = context.nodes ?? [];
  const edges = context.edges ?? [];

  // 1. Direct pulseIn assignments: long duration = pulseIn(ECHO_PIN, HIGH);
  const pulseInRegex = /\b(?:(?:const|volatile|unsigned)\s+)*(?:long|int|float|double|auto)\s+([A-Za-z_]\w*)\s*=\s*pulseIn\s*\(\s*([^,\s)]+)\s*,\s*(?:HIGH|1)(?:\s*,\s*\d+)?\s*\)/g;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pulseInRegex.exec(code)) !== null) {
    const varName = pMatch[1];
    const pin = resolveCppPinNumber(pMatch[2], constants);
    if (pin !== null) {
      const durationUs = resolveEsp32PulseIn(pin, nodes, edges);
      variables.set(varName, durationUs);
    } else {
      variables.set(varName, 0);
    }
  }

  // 2. Ultrasonic math calculations: float distance = duration * 0.034 / 2;
  const varAssignRegex = /\b(?:(?:const|volatile|unsigned)\s+)*(?:long|int|float|double|auto)\s+([A-Za-z_]\w*)\s*=\s*([^;]+);/g;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = varAssignRegex.exec(code)) !== null) {
    const varName = aMatch[1];
    const expr = aMatch[2].trim();
    if (variables.has(varName)) continue;
    if (existingVars && existingVars.has(varName)) continue;

    // Direct pulseIn inline expression: float distance = pulseIn(18, HIGH) * 0.034 / 2;
    let expandedExpr = expr;
    const inlinePulseMatch = expr.match(/pulseIn\s*\(\s*([^,\s)]+)\s*,\s*(?:HIGH|1)(?:\s*,\s*\d+)?\s*\)/);
    if (inlinePulseMatch) {
      const pin = resolveCppPinNumber(inlinePulseMatch[1], constants);
      const durationUs = pin !== null ? resolveEsp32PulseIn(pin, nodes, edges) : 0;
      expandedExpr = expr.replace(inlinePulseMatch[0], String(durationUs));
    }

    const calculated = evaluateCppArithmeticExpr(expandedExpr, variables, constants);
    if (calculated !== null) {
      variables.set(varName, calculated);
    }
  }

  return variables;
}
