import type { SimulationFrame } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { getNodeSimulationModel } from "../../circuit/components";
import {
  buildConductiveGraphForStore,
  getReachableGraphNodes,
} from "../../circuit/graph";
import { getEndpointVoltage } from "../../circuit/pinMapping";
import { parseLcdDisplayText, resolveIfElse } from "../../codeParsing/lcdParser";
import { checkPinConnectivity } from "../../codeParsing/arduinoParser";
import { checkPicoGndConnectivity, checkPicoVccConnectivity } from "../../codeParsing/picoParser";
import type { SimContext } from "../types";

export function applyLcdInputToFrame(frame: SimulationFrame, context: SimContext): SimulationFrame {
  const status = useCircuitStore.getState().simulationStatus;
  if (
    (frame.boardType !== "arduino" && frame.boardType !== "pico") ||
    status !== "running"
  )
    return frame;

  const { nodes, edges, arduinoCode } = useCircuitStore.getState();

  // Unroll loop blocks before segment parsing to handle delay animations correctly
  const unrolledCode = unrollLoops(arduinoCode);

  // Parse delay-separated segments for both setup() and loop()
  const setupSegments = parseFunctionLcdSegments(
    unrolledCode,
    /void\s+setup\s*\(\s*\)\s*\{/,
  );
  const loopSegments = parseFunctionLcdSegments(
    unrolledCode,
    /void\s+loop\s*\(\s*\)\s*\{/,
  );

  const totalSetupDuration = setupSegments.reduce((sum, s) => sum + s.duration, 0);
  let codeToRender = unrolledCode; // fallback: whole code if no delay() found

  if (totalSetupDuration > 0 && frame.timestamp < totalSetupDuration) {
    // ── Setup Phase (0 to totalSetupDuration ms) ──
    let activeIndex = 0;
    let acc = 0;
    for (let i = 0; i < setupSegments.length; i++) {
      acc += setupSegments[i].duration;
      if (frame.timestamp < acc) {
        activeIndex = i;
        break;
      }
    }
    const parts: string[] = [];
    for (let i = 0; i <= activeIndex; i++) {
      parts.push(setupSegments[i].commands);
    }
    codeToRender = parts.join("\n");
  } else if (loopSegments.length > 0) {
    // ── Loop Phase (after setup completes) ──
    const loopTimestamp = Math.max(0, frame.timestamp - totalSetupDuration);
    const totalCycleMs = loopSegments.reduce((sum, s) => sum + s.duration, 0);
    const setupCode = setupSegments.map((s) => s.commands).join("\n");

    if (totalCycleMs > 0) {
      const cycleCount = Math.floor(loopTimestamp / totalCycleMs);
      const elapsed = loopTimestamp % totalCycleMs;

      let activeIndex = 0;
      let acc = 0;
      for (let i = 0; i < loopSegments.length; i++) {
        acc += loopSegments[i].duration;
        if (elapsed < acc) {
          activeIndex = i;
          break;
        }
      }

      const parts = [setupCode];
      if (cycleCount > 0) {
        for (const seg of loopSegments) {
          parts.push(seg.commands);
        }
      }
      for (let i = 0; i <= activeIndex; i++) {
        parts.push(loopSegments[i].commands);
      }
      codeToRender = parts.join("\n");
    } else {
      codeToRender = setupCode + "\n" + loopSegments.map((s) => s.commands).join("\n");
    }
  }

  const components = { ...frame.components };
  let changed = false;

  // Track active I2C addresses for conflict checks
  const activeLcdAddresses = new Map<number, string[]>();
  for (const node of nodes) {
    if (getNodeSimulationModel(node) !== "lcd16x2") continue;
    const addrStr = String(node.data.properties?.i2cAddress?.value ?? "0x27");
    const address = parseInt(addrStr, 16);
    if (!activeLcdAddresses.has(address)) {
      activeLcdAddresses.set(address, []);
    }
    activeLcdAddresses.get(address)!.push(node.id);
  }

  for (const node of nodes) {
    if (getNodeSimulationModel(node) !== "lcd16x2") continue;

    // Read backpack type from node properties (default: PCF8574)
    const rawBackpackType = String(
      node.data.properties?.backpackType?.value ?? "PCF8574",
    );
    const backpackType = rawBackpackType.replace("-based", "");

    // Read I2C address from node properties
    const addrStr = String(node.data.properties?.i2cAddress?.value ?? "0x27");
    const address = parseInt(addrStr, 16);

    const sharingNodes = activeLcdAddresses.get(address) ?? [];
    const hasConflict = sharingNodes.length > 1;

    // Electrical connection check
    const isPico = frame.boardType === "pico" || nodes.some((n) => n.data.componentType === "raspberrypipico");
    const isGndConnected = isPico
      ? checkPicoGndConnectivity(node.id, "gnd", nodes, edges)
      : checkPinConnectivity(node.id, "gnd", "gnd", nodes, edges);
    const isVccConnected = isPico
      ? checkPicoVccConnectivity(node.id, "vcc", nodes, edges)
      : checkPinConnectivity(node.id, "vcc", "vcc", nodes, edges);
    const isSdaConnected = checkPinConnectivity(
      node.id,
      "sda",
      "sda",
      nodes,
      edges,
    );
    const isSclConnected = checkPinConnectivity(
      node.id,
      "scl",
      "scl",
      nodes,
      edges,
    );

    const isPowered = isGndConnected && isVccConnected;
    const isSignalOk = isSdaConnected && isSclConnected;

    const arduinoNode = nodes.find(
      (n) =>
        getNodeSimulationModel(n) === "arduino" ||
        getNodeSimulationModel(n) === "raspberrypipico",
    );
    const arduinoBurnt = arduinoNode
      ? frame.components[arduinoNode.id]?.telemetry?.burnt === true
      : false;

    let line1 = "";
    let line2 = "";
    let telemetryState: any = {
      isPowered,
      hasConflict,
      isSignalOk,
      error: null,
    };

    if (arduinoBurnt) {
      telemetryState.error = "Arduino is Damaged";
      telemetryState.displayEnabled = false;
      telemetryState.backlight = "off";
      line1 = "";
      line2 = "";
    } else if (hasConflict) {
      telemetryState.error = `I2C Address Conflict (0x${address.toString(16).toUpperCase()})`;
      telemetryState.displayEnabled = false;
      telemetryState.backlight = "off";
      line1 = "I2C ADDR CONFLICT";
      line2 = "CHECK CONFIG";
    } else if (!isPowered) {
      telemetryState.error = "Power Missing (VCC/GND)";
      telemetryState.displayEnabled = false;
      telemetryState.backlight = "off";
      line1 = "";
      line2 = "";
    } else if (!isSignalOk) {
      telemetryState.error = "Bus Disconnected (SDA/SCL)";
      telemetryState.displayEnabled = false;
      telemetryState.backlight = "off";
      line1 = "";
      line2 = "";
    } else {
      const activePassword = context?.keypad4x4State?.getState()?.inputPassword ||
                             context?.keypad4x3State?.getState()?.inputPassword ||
                             "";
      // Get accumulated keypad text from keypad state managers
      let keypadPassword = "";
      if (context.keypad4x4State) {
        const kpState = context.keypad4x4State.getState();
        if (kpState.inputPassword) keypadPassword = kpState.inputPassword;
      }
      if (!keypadPassword && context.keypad4x3State) {
        const kpState = context.keypad4x3State.getState();
        if (kpState.inputPassword) keypadPassword = kpState.inputPassword;
      }

      // Run parser using node's specific physical config
      const lcdStates = parseLcdDisplayText(
        codeToRender,
        backpackType,
        address,
        arduinoCode,
        nodes,
        edges,
        activePassword,
        keypadPassword,
      );

      if (lcdStates) {
        const parsedObj = lcdStates.find((item) => item.address === address);
        if (parsedObj) {
          const state = parsedObj.state;
          if (state.error) {
            telemetryState.error = state.error;
            telemetryState.displayEnabled = false;
            telemetryState.backlight = "off";
            line1 = "";
            line2 = "";
          } else {
            const l1Chars: string[] = [];
            const l2Chars: string[] = [];
            for (let c = 0; c < 16; c++) {
              const idx1 = (state.scrollOffset + c) % 40;
              const idx2 = 40 + ((state.scrollOffset + c) % 40);
              l1Chars.push(String.fromCharCode(state.ddram[idx1]));
              l2Chars.push(String.fromCharCode(state.ddram[idx2]));
            }
            line1 = l1Chars.join("");
            line2 = l2Chars.join("");

            telemetryState = {
              ...telemetryState,
              line1,
              line2,
              backlight: state.backlightEnabled ? "on" : "off",
              displayEnabled: state.displayEnabled,
              cursorEnabled: state.cursorEnabled,
              blinkEnabled: state.blinkEnabled,
              cursorColumn: state.cursorColumn,
              cursorRow: state.cursorRow,
              cgram: Array.from(state.cgram),
              i2cLog: state.i2cLog,
            };
          }
        } else if (lcdStates.length > 0) {
          const declaredAddrs = lcdStates.map(
            (item) => "0x" + item.address.toString(16),
          );
          telemetryState = {
            ...telemetryState,
            error: `Address Mismatch: Arduino sketch address ${declaredAddrs.join(", ")} does not match LCD node address 0x${address.toString(16)}`,
            line1: "",
            line2: "",
            backlight: "off",
            displayEnabled: false,
          };
        } else {
          // Default powered on empty display
          line1 = "Display Ready...";
          line2 = `Address: 0x${address.toString(16).toUpperCase()}`;
          telemetryState = {
            ...telemetryState,
            line1,
            line2,
            backlight: "on",
            displayEnabled: true,
          };
        }
      }
    }

    const previous = components[node.id];
    components[node.id] = {
      ...(previous ?? {
        nodeId: node.id,
        componentType: node.data.componentType,
        label: node.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered,
      brightness:
        isPowered && telemetryState.backlight === "on" && !telemetryState.error
          ? 1
          : 0,
      telemetry: {
        ...(previous?.telemetry ?? {}),
        ...telemetryState,
        backpackType,
      },
    };
    changed = true;
  }

  return changed ? { ...frame, components } : frame;
}

function unrollLoops(code: string): string {
  let unrolled = code;

  // Matches loops like: for(int i=0; i<10; i++) { ... } or for(char c='A'; c<='J'; c++) { ... }
  const forLoopPattern =
    /for\s*\(\s*(?:int|char)\s+(\w+)\s*=\s*(?:'([^'])'|(\d+))\s*;\s*\1\s*(<|<=|>|>=)\s*(?:'([^'])'|(\d+))\s*;\s*\1\s*(\+\+|--)\s*\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;

  for (let pass = 0; pass < 5; pass++) {
    let replacedAny = false;
    unrolled = unrolled.replace(
      forLoopPattern,
      (
        fullMatch,
        varName,
        charStart,
        numStart,
        op,
        charEnd,
        numEnd,
        step,
        body,
      ) => {
        replacedAny = true;
        let start = charStart
          ? charStart.charCodeAt(0)
          : parseInt(numStart, 10);
        let end = charEnd ? charEnd.charCodeAt(0) : parseInt(numEnd, 10);

        const iterations = [];
        const isChar = !!charStart;
        let i = start;
        const limit = 200;
        let count = 0;

        const checkCondition = () => {
          if (op === "<") return i < end;
          if (op === "<=") return i <= end;
          if (op === ">") return i > end;
          if (op === ">=") return i >= end;
          return false;
        };

        while (checkCondition() && count < limit) {
          let iterationBody = body;
          const valReplacement = isChar
            ? `'${String.fromCharCode(i)}'`
            : String(i);
          iterationBody = iterationBody.replace(
            new RegExp(`\\b${varName}\\b`, "g"),
            valReplacement,
          );
          iterations.push(iterationBody);

          if (step === "++") i++;
          else if (step === "--") i--;
          else break;
          count++;
        }
        return iterations.join("\n");
      },
    );
    if (!replacedAny) break;
  }
  return unrolled;
}

function extractFunctionBody(cleaned: string, funcPattern: RegExp): string {
  const m = cleaned.match(funcPattern);
  if (!m) return "";
  const start = m.index! + m[0].length;
  let depth = 1;
  let end = start;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return cleaned.slice(start, end);
}

function parseFunctionLcdSegments(
  code: string,
  funcPattern: RegExp,
): { commands: string; duration: number }[] {
  const body = extractFunctionBody(code, funcPattern);
  if (!body) return [];

  const segments: { commands: string; duration: number }[] = [];
  const delayPattern = /\bdelay\s*\(\s*(\d+)\s*\)\s*;/g;
  let delayMatch;
  let lastIndex = 0;

  const bodyToScan = stripCodeComments(body);
  const resolved = resolveIfElse(bodyToScan, (cond) => {
    if (/isnan/i.test(cond)) return false;
    return "unknown";
  });

  while ((delayMatch = delayPattern.exec(resolved)) !== null) {
    const commands = resolved.slice(lastIndex, delayMatch.index).trim();
    const duration = Number(delayMatch[1]);
    segments.push({ commands, duration });
    lastIndex = delayMatch.index + delayMatch[0].length;
  }

  const remaining = resolved.slice(lastIndex).trim();
  if (remaining.length > 0) {
    segments.push({ commands: remaining, duration: 0 });
  }

  return segments;
}

function stripCodeComments(code: string): string {
  return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}