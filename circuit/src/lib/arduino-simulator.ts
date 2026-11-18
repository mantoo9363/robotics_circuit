/**
 * Arduino Simulator — Two-tier approach:
 * 1. Compiles code via Wokwi's hexi API → runs on avr8js (real AVR simulation)
 * 2. Falls back to regex-based parser if compilation fails (offline mode)
 */

import { AVRRunner, AVRPinState } from './avr-runner';
import { useCircuitStore } from './store';
import { evaluateExpression } from './codeParsing/arduinoParser';

export interface PinState {
  mode: 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP' | 'UNSET';
  value: number; // 0-255 (0=LOW, 255=HIGH)
  frequency?: number; // Tone or PWM frequency in Hz
}

export interface SimulatorState {
  pins: Map<number, PinState>;
  serialOutput: string[];
  running: boolean;
  error: string | null;
  txActive?: boolean;
  rxActive?: boolean;
}

export interface UltrasonicDevice {
  triggerPin: number;
  echoPin: number;
  distanceCm: number;
}

export const DEFAULT_CODE = `// Traffic light controller
// Red: D13, Yellow: D12, Green: D11

void setup() {
  pinMode(13, OUTPUT);
  pinMode(12, OUTPUT);
  pinMode(11, OUTPUT);
  Serial.begin(9600);
  Serial.println("Traffic controller ready");
}

void loop() {
  digitalWrite(13, HIGH);
  digitalWrite(12, LOW);
  digitalWrite(11, LOW);
  Serial.println("RED");
  delay(2500);

  digitalWrite(13, LOW);
  digitalWrite(12, HIGH);
  digitalWrite(11, LOW);
  Serial.println("YELLOW");
  delay(900);

  digitalWrite(13, LOW);
  digitalWrite(12, LOW);
  digitalWrite(11, HIGH);
  Serial.println("GREEN");
  delay(2500);

  digitalWrite(11, LOW);
  digitalWrite(12, HIGH);
  Serial.println("YELLOW");
  delay(900);

  digitalWrite(13, LOW);
  digitalWrite(12, LOW);
  digitalWrite(11, LOW);
}
`;

// ---------------------------------------------------------------------------
// Hexi Compiler (Wokwi's free Arduino compilation API)
// ---------------------------------------------------------------------------

async function compileArduinoCode(
  code: string
): Promise<{ hex: string | null; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch('https://hexi.wokwi.com/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sketch: code }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      return { hex: null, error: `Compilation server error: ${resp.status}` };
    }
    const result = await resp.json();
    if (result.hex) {
      return { hex: result.hex, error: null };
    }
    return { hex: null, error: result.stderr || 'Compilation failed' };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError';
    return {
      hex: null,
      error: timedOut
        ? 'Compilation server timed out - using fallback simulator'
        : 'Cannot reach compilation server - using fallback simulator',
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// AVR Pin State → Our PinState conversion
// ---------------------------------------------------------------------------

function avrPinToOurPin(state: AVRPinState): PinState {
  switch (state) {
    case AVRPinState.High:
      return { mode: 'OUTPUT', value: 255 };
    case AVRPinState.Low:
      return { mode: 'OUTPUT', value: 0 };
    case AVRPinState.Input:
      return { mode: 'INPUT', value: 0 };
    case AVRPinState.InputPullUp:
      return { mode: 'INPUT_PULLUP', value: 0 };
    default:
      return { mode: 'UNSET', value: 0 };
  }
}

// ---------------------------------------------------------------------------
// Fallback: Simple regex-based parser (works offline)
// ---------------------------------------------------------------------------


type Instruction =
  | { type: 'pinMode'; pin: number; mode: 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP' }
  | { type: 'digitalWrite'; pin: number; value: number }
  | { type: 'analogWrite'; pin: number; value: number }
  | { type: 'delay'; ms: number }
  | { type: 'serialPrint'; text: string; isPrintln: boolean }
  | { type: 'serialPrintVar'; varName: string; isPrintln: boolean }
  | { type: 'analogRead'; pin: number; varName: string; isU16?: boolean }
  | { type: 'digitalRead'; pin: number; varName: string }
  | { type: 'readPin'; pin: number; varName: string }
  | { type: 'tone'; pin: number; frequency: number }
  | { type: 'noTone'; pin: number }
  | { type: 'ifBlock'; conditionPin?: number; conditionVar?: string; conditionOp?: string; conditionVal?: number | string; conditionExpr?: string; thenBranch: Instruction[]; elseBranch: Instruction[] }
  | { type: 'variableAssign'; varName: string; value?: number; expression?: string };

export function parseArduinoCode(code: string): {
  setup: Instruction[];
  loop: Instruction[];
  error: string | null;
} {
  const setup: Instruction[] = [];
  const loop: Instruction[] = [];
  let error: string | null = null;

  try {
    const cleaned = code
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    const declaredVars = new Set<string>();
    const declRegex = /\b(?:const\s+)?(?:int|long|byte|char|float|double|bool|String|Keypad|DHT|LiquidCrystal|LiquidCrystal_I2C|unsigned\s+(?:int|long)|uint8_t|uint16_t|uint32_t|[A-Za-z_]\w*)\s+(\w+)\b/g;
    let declMatch: RegExpExecArray | null;
    while ((declMatch = declRegex.exec(cleaned)) !== null) {
      declaredVars.add(declMatch[1]);
    }

    for (const match of cleaned.matchAll(/#define\s+([A-Za-z_]\w*)/g)) {
      declaredVars.add(match[1]);
    }

    const constVars = new Map<string, number>();
    // Prepopulate standard Arduino constants
    constVars.set('A0', 14);
    constVars.set('A1', 15);
    constVars.set('A2', 16);
    constVars.set('A3', 17);
    constVars.set('A4', 18);
    constVars.set('A5', 19);
    constVars.set('LED_BUILTIN', 13);

    // Scan for #define macros (e.g. #define BUZZER 8 or #define DHTPIN 2)
    const definePattern = /#define\s+([A-Za-z_]\w*)\s+([A-Za-z0-9_-]+)/g;
    for (const match of cleaned.matchAll(definePattern)) {
      const name = match[1];
      const valStr = match[2];
      if (constVars.has(valStr)) {
        constVars.set(name, constVars.get(valStr)!);
      } else if (valStr.startsWith('A') && /^\d+$/.test(valStr.slice(1))) {
        constVars.set(name, 14 + Number(valStr.slice(1)));
      } else if (/^-?\d+$/.test(valStr)) {
        constVars.set(name, Number(valStr));
      }
    }

    // Scan for initialized constants/variables (e.g. const int forcePin = A0;)
    const valDeclRegex = /\b(?:const\s+)?(?:int|long|byte|char|unsigned\s+int|uint8_t|uint16_t)\s+(\w+)\s*=\s*([\w]+)\b/g;
    let valMatch: RegExpExecArray | null;
    while ((valMatch = valDeclRegex.exec(cleaned)) !== null) {
      const name = valMatch[1];
      const valStr = valMatch[2];
      let val = 0;
      if (constVars.has(valStr)) {
        val = constVars.get(valStr)!;
      } else {
        val = parseInt(valStr, 10);
        if (isNaN(val)) val = 0;
      }
      constVars.set(name, val);
    }

    const setupBody = extractFunctionBody(cleaned, 'setup');
    if (setupBody) parseBlock(setupBody, setup, constVars);

    const loopBody = extractFunctionBody(cleaned, 'loop');
    if (loopBody) parseBlock(loopBody, loop, constVars);

    if (!setupBody && !loopBody) {
      error = '1:1: error: No setup() or loop() function found';
    }

    if (!error) {
      const lines = code.split('\n');
      const bodyRanges: { start: number; end: number }[] = [];
      for (const name of ['setup', 'loop']) {
        const match = new RegExp(`void\\s+${name}\\s*\\(\\s*\\)\\s*\\{`).exec(code);
        if (match) {
          const bodyStart = match.index + match[0].length;
          let depth = 1;
          for (let idx = bodyStart; idx < code.length; idx++) {
            if (code[idx] === '{') depth++;
            if (code[idx] === '}') depth--;
            if (depth === 0) {
              const startLine = code.substring(0, bodyStart).split('\n').length;
              bodyRanges.push({ start: startLine, end: code.substring(0, idx).split('\n').length });
              break;
            }
          }
        }
      }

      for (const range of bodyRanges) {
        for (let lineNum = range.start; lineNum <= range.end; lineNum++) {
          const raw = lines[lineNum - 1] || '';
          const stmt = raw.replace(/\/\/.*$/, '').trim();
          if (!stmt) continue;
          if (stmt.startsWith('/*') || stmt === '{' || stmt === '}') continue;
          if (/^(if|else|for|while|do|switch|case|default|return|break|continue)\b/.test(stmt)) continue;
          if (stmt.endsWith('{') || stmt.endsWith('}') || stmt.endsWith(':') || stmt.endsWith(';')) continue;
          if (/\w+\s*\(/.test(stmt)) {
            const nextToken = stmt.split(/[^a-zA-Z0-9_]/).filter(Boolean).pop() || '';
            error = `${lineNum}:1: error: expected ';' before '${nextToken}'`;
            break;
          }
        }
        if (error) break;
      }
    }

    if (!error) {
      const builtins = new Set(['HIGH', 'LOW', 'OUTPUT', 'INPUT', 'INPUT_PULLUP', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'LED_BUILTIN', 'keypad', 'keys', 'ROWS', 'COLS', 'rowPins', 'colPins']);
      const argRegex = /\b(pinMode|digitalWrite|analogWrite|digitalRead|analogRead)\s*\(\s*(\w+)\b/g;
      let argMatch: RegExpExecArray | null;
      while ((argMatch = argRegex.exec(code)) !== null) {
        const arg = argMatch[2];
        if (!/^\d+$/.test(arg) && !builtins.has(arg) && !declaredVars.has(arg)) {
          const lineNum = code.substring(0, argMatch.index).split('\n').length;
          error = `${lineNum}:1: error: '${arg}' was not declared in this scope`;
          break;
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Parse error';
  }

  return { setup, loop, error };
}

// ---------------------------------------------------------------------------
// Python block parser — extracts indented block lines
// ---------------------------------------------------------------------------

/** Returns lines that belong to the indented block starting after `startLineIdx`. */
function extractIndentedBlock(lines: string[], startLineIdx: number): { blockLines: string[]; nextIdx: number } {
  const blockLines: string[] = [];
  if (startLineIdx >= lines.length) return { blockLines, nextIdx: startLineIdx };

  // Determine reference indent from first non-empty line of block
  let refIndent = -1;
  let i = startLineIdx;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) { i++; continue; }
    refIndent = raw.length - raw.trimStart().length;
    break;
  }
  if (refIndent < 0) return { blockLines, nextIdx: i };

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) { blockLines.push(raw); i++; continue; }
    const indent = raw.length - raw.trimStart().length;
    if (indent < refIndent) break;
    blockLines.push(raw);
    i++;
  }
  return { blockLines, nextIdx: i };
}

/** Parses a flat list of Python lines into Instructions, recursively handling if/else. */
function parsePythonLines(
  lines: string[],
  pinVariables: Map<string, number>,
  pinModes: Map<string, string>,
  readVariables: Map<string, number> = new Map()
): Instruction[] {
  const instructions: Instruction[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    i++;

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Skip while True: header — caller already handles loop context
    if (/^while\s+(?:True|1)\s*:/.test(trimmed)) continue;

    // ── Pin declaration: led = Pin(15, Pin.OUT) ──
    const pinDeclMatch = trimmed.match(/^(\w+)\s*=\s*Pin\s*\(\s*([A-Za-z0-9_]+)\s*,\s*(?:Pin\.)?\s*(OUT|IN|PULL_UP)(?:\s*,\s*(?:Pin\.)?(?:PULL_UP|PULL_DOWN))?\s*\)/);
    if (pinDeclMatch) {
      const varName = pinDeclMatch[1];
      const pinStr = pinDeclMatch[2];
      const pin = /^\d+$/.test(pinStr) ? parseInt(pinStr, 10) : pinVariables.get(pinStr);
      if (pin !== undefined) {
        const modeStr = pinDeclMatch[3];
        const mode = modeStr === 'PULL_UP' ? 'INPUT_PULLUP' : modeStr === 'IN' ? 'INPUT' : 'OUTPUT';
        pinVariables.set(varName, pin);
        pinModes.set(varName, mode);
        instructions.push({ type: 'pinMode', pin, mode });
      }
      continue;
    }

    // ── Pin declaration with separate pull: switch_pin = Pin(13, Pin.IN, Pin.PULL_UP) ──
    const pinDeclPullMatch = trimmed.match(/^(\w+)\s*=\s*Pin\s*\(\s*([A-Za-z0-9_]+)\s*,\s*Pin\.IN\s*,\s*Pin\.PULL_UP\s*\)/);
    if (pinDeclPullMatch) {
      const varName = pinDeclPullMatch[1];
      const pinStr = pinDeclPullMatch[2];
      const pin = /^\d+$/.test(pinStr) ? parseInt(pinStr, 10) : pinVariables.get(pinStr);
      if (pin !== undefined) {
        pinVariables.set(varName, pin);
        pinModes.set(varName, 'INPUT_PULLUP');
        instructions.push({ type: 'pinMode', pin, mode: 'INPUT_PULLUP' });
      }
      continue;
    }

    // ── Parse assignment: motion = pir.value() ──
    const readAssignmentMatch = trimmed.match(/^(\w+)\s*=\s*(\w+)\s*\.\s*value\s*\(\s*\)/);
    if (readAssignmentMatch) {
      const varName = readAssignmentMatch[1];
      const pinVarName = readAssignmentMatch[2];
      const pin = pinVariables.get(pinVarName);
      if (pin !== undefined) {
        readVariables.set(varName, pin);
      }
      continue;
    }

    // ── ADC declaration: fsr = ADC(26) or fsr = ADC(Pin(26)) ──
    const adcDeclMatch = trimmed.match(/^(\w+)\s*=\s*ADC\s*\(\s*(?:Pin\s*\(\s*)?([A-Za-z0-9_]+)\s*\)?\s*\)/);
    if (adcDeclMatch) {
      const varName = adcDeclMatch[1];
      const pinStr = adcDeclMatch[2];
      const pin = /^\d+$/.test(pinStr) ? parseInt(pinStr, 10) : pinVariables.get(pinStr);
      if (pin !== undefined) {
        pinVariables.set(varName, pin);
        pinModes.set(varName, 'INPUT');
        instructions.push({ type: 'pinMode', pin, mode: 'INPUT' });
      }
      continue;
    }

    // ── Parse analog read assignment: value = fsr.read_u16() ──
    const adcReadMatch = trimmed.match(/^(\w+)\s*=\s*(\w+)\s*\.\s*read_u16\s*\(\s*\)/);
    if (adcReadMatch) {
      const varName = adcReadMatch[1];
      const adcVarName = adcReadMatch[2];
      const pin = pinVariables.get(adcVarName);
      if (pin !== undefined) {
        readVariables.set(varName, pin);
        instructions.push({ type: 'analogRead', pin, varName, isU16: true });
      }
      continue;
    }

    // ── Variable assignment: NO_PRESSURE = 3000 ──
    const assignMatch = trimmed.match(/^(\w+)\s*=\s*(-?\d+)\s*$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const value = parseInt(assignMatch[2], 10);
      pinVariables.set(varName, value);
      instructions.push({ type: 'variableAssign', varName, value });
      continue;
    }

    // ── IF block with direct variable check: if motion == 1: or if value <= NO_PRESSURE: ──
    const ifVarMatch = trimmed.match(/^if\s+(\w+)\s*(==|!=|<|>|<=|>=)\s*(\w+|HIGH|LOW|True|False)\s*:/i);
    if (ifVarMatch) {
      const condVar = ifVarMatch[1];
      const condOp = ifVarMatch[2];
      const valStr = ifVarMatch[3];
      const pin = readVariables.get(condVar) ?? pinVariables.get(condVar);
      if (pin !== undefined || readVariables.has(condVar) || pinVariables.has(condVar)) {
        const { blockLines: thenLines, nextIdx: afterThen } = extractIndentedBlock(lines, i);
        i = afterThen;
        const thenBranch = parsePythonLines(thenLines, pinVariables, pinModes, readVariables);

        let conditionVal: number | string = valStr;
        const upperVal = valStr.toUpperCase();
        if (upperVal === 'HIGH' || upperVal === 'TRUE') {
          conditionVal = 1;
        } else if (upperVal === 'LOW' || upperVal === 'FALSE') {
          conditionVal = 0;
        } else if (/^\d+$/.test(valStr)) {
          conditionVal = parseInt(valStr, 10);
        }

        const rootIfBlock: Instruction = {
          type: 'ifBlock',
          conditionPin: pin,
          conditionVar: condVar,
          conditionOp: condOp,
          conditionVal,
          thenBranch,
          elseBranch: [],
        };

        let currentIfBlock = rootIfBlock;

        while (i < lines.length) {
          const nextTrimmed = lines[i].trim();
          if (!nextTrimmed) {
            i++;
            continue;
          }
          if (/^elif\s+/.test(nextTrimmed)) {
            const elifMatch = nextTrimmed.match(/^elif\s+(\w+)\s*(==|!=|<|>|<=|>=)\s*(\w+|HIGH|LOW|True|False)\s*:/i);
            if (elifMatch) {
              i++;
              const elifVar = elifMatch[1];
              const elifOp = elifMatch[2];
              const elifValStr = elifMatch[3];
              const elifPin = readVariables.get(elifVar) ?? pinVariables.get(elifVar);

              const { blockLines: elifLines, nextIdx: afterElif } = extractIndentedBlock(lines, i);
              i = afterElif;
              const elifThenBranch = parsePythonLines(elifLines, pinVariables, pinModes, readVariables);

              let elifVal: number | string = elifValStr;
              const upperElifVal = elifValStr.toUpperCase();
              if (upperElifVal === 'HIGH' || upperElifVal === 'TRUE') {
                elifVal = 1;
              } else if (upperElifVal === 'LOW' || upperElifVal === 'FALSE') {
                elifVal = 0;
              } else if (/^\d+$/.test(elifValStr)) {
                elifVal = parseInt(elifValStr, 10);
              }

              const newIfBlock: Instruction = {
                type: 'ifBlock',
                conditionPin: elifPin,
                conditionVar: elifVar,
                conditionOp: elifOp,
                conditionVal: elifVal,
                thenBranch: elifThenBranch,
                elseBranch: [],
              };

              currentIfBlock.elseBranch = [newIfBlock];
              currentIfBlock = newIfBlock;
              continue;
            }
            break;
          } else if (/^else\s*:/.test(nextTrimmed)) {
            i++;
            const { blockLines: elseLines, nextIdx: afterElse } = extractIndentedBlock(lines, i);
            i = afterElse;
            currentIfBlock.elseBranch = parsePythonLines(elseLines, pinVariables, pinModes, readVariables);
            break;
          } else {
            break;
          }
        }

        instructions.push(rootIfBlock);
        continue;
      }
    }

    // ── IF block: if pin.value() == 0: ──
    const ifMatch = trimmed.match(/^if\s+(\w+)\s*\.\s*value\s*\(\s*\)\s*(==|!=|<|>|<=|>=)\s*(\w+|HIGH|LOW|True|False)\s*:/i);
    if (ifMatch) {
      const condVar = ifMatch[1];
      const condOp = ifMatch[2];
      const valStr = ifMatch[3];
      const pin = pinVariables.get(condVar) ?? readVariables.get(condVar);
      if (pin !== undefined) {
        const { blockLines: thenLines, nextIdx: afterThen } = extractIndentedBlock(lines, i);
        i = afterThen;
        const thenBranch = parsePythonLines(thenLines, pinVariables, pinModes, readVariables);

        let conditionVal: number | string = valStr;
        const upperVal = valStr.toUpperCase();
        if (upperVal === 'HIGH' || upperVal === 'TRUE') {
          conditionVal = 1;
        } else if (upperVal === 'LOW' || upperVal === 'FALSE') {
          conditionVal = 0;
        } else if (/^\d+$/.test(valStr)) {
          conditionVal = parseInt(valStr, 10);
        }

        const rootIfBlock: Instruction = {
          type: 'ifBlock',
          conditionPin: pin,
          conditionVar: condVar,
          conditionOp: condOp,
          conditionVal,
          thenBranch,
          elseBranch: [],
        };

        let currentIfBlock = rootIfBlock;

        while (i < lines.length) {
          const nextTrimmed = lines[i].trim();
          if (!nextTrimmed) {
            i++;
            continue;
          }
          if (/^elif\s+/.test(nextTrimmed)) {
            const elifMatch = nextTrimmed.match(/^elif\s+(\w+)\s*\.\s*value\s*\(\s*\)\s*(==|!=|<|>|<=|>=)\s*(\w+|HIGH|LOW|True|False)\s*:/i);
            if (elifMatch) {
              i++;
              const elifVar = elifMatch[1];
              const elifOp = elifMatch[2];
              const elifValStr = elifMatch[3];
              const elifPin = pinVariables.get(elifVar) ?? readVariables.get(elifVar);

              const { blockLines: elifLines, nextIdx: afterElif } = extractIndentedBlock(lines, i);
              i = afterElif;
              const elifThenBranch = parsePythonLines(elifLines, pinVariables, pinModes, readVariables);

              let elifVal: number | string = elifValStr;
              const upperElifVal = elifValStr.toUpperCase();
              if (upperElifVal === 'HIGH' || upperElifVal === 'TRUE') {
                elifVal = 1;
              } else if (upperElifVal === 'LOW' || upperElifVal === 'FALSE') {
                elifVal = 0;
              } else if (/^\d+$/.test(elifValStr)) {
                elifVal = parseInt(elifValStr, 10);
              }

              const newIfBlock: Instruction = {
                type: 'ifBlock',
                conditionPin: elifPin,
                conditionVar: elifVar,
                conditionOp: elifOp,
                conditionVal: elifVal,
                thenBranch: elifThenBranch,
                elseBranch: [],
              };

              currentIfBlock.elseBranch = [newIfBlock];
              currentIfBlock = newIfBlock;
              continue;
            }
            break;
          } else if (/^else\s*:/.test(nextTrimmed)) {
            i++;
            const { blockLines: elseLines, nextIdx: afterElse } = extractIndentedBlock(lines, i);
            i = afterElse;
            currentIfBlock.elseBranch = parsePythonLines(elseLines, pinVariables, pinModes, readVariables);
            break;
          } else {
            break;
          }
        }

        instructions.push(rootIfBlock);
        continue;
      }
    }

    // ── IF block by variable value (e.g. if not btn.value(): ) ──
    const ifNotMatch = trimmed.match(/^if\s+not\s+(\w+)(?:\.\s*value\s*\(\s*\))?\s*:/);
    if (ifNotMatch) {
      const condVar = ifNotMatch[1];
      const pin = pinVariables.get(condVar) ?? readVariables.get(condVar);
      if (pin !== undefined) {
        const { blockLines: thenLines, nextIdx: afterThen } = extractIndentedBlock(lines, i);
        i = afterThen;
        const thenBranch = parsePythonLines(thenLines, pinVariables, pinModes, readVariables);
        let elseBranch: Instruction[] = [];
        if (i < lines.length && /^else\s*:/.test(lines[i].trim())) {
          i++;
          const { blockLines: elseLines, nextIdx: afterElse } = extractIndentedBlock(lines, i);
          i = afterElse;
          elseBranch = parsePythonLines(elseLines, pinVariables, pinModes, readVariables);
        }
        instructions.push({
          type: 'ifBlock',
          conditionPin: pin,
          conditionVar: condVar,
          conditionOp: '==',
          conditionVal: 0,
          thenBranch,
          elseBranch,
        });
        continue;
      }
    }

    // ── IF block by variable truthiness (e.g. if btn.value(): or if motion: ) ──
    const ifTruthMatch = trimmed.match(/^if\s+(\w+)(?:\.\s*value\s*\(\s*\))?\s*:/);
    if (ifTruthMatch) {
      const condVar = ifTruthMatch[1];
      const pin = pinVariables.get(condVar) ?? readVariables.get(condVar);
      if (pin !== undefined) {
        const { blockLines: thenLines, nextIdx: afterThen } = extractIndentedBlock(lines, i);
        i = afterThen;
        const thenBranch = parsePythonLines(thenLines, pinVariables, pinModes, readVariables);
        let elseBranch: Instruction[] = [];
        if (i < lines.length && /^else\s*:/.test(lines[i].trim())) {
          i++;
          const { blockLines: elseLines, nextIdx: afterElse } = extractIndentedBlock(lines, i);
          i = afterElse;
          elseBranch = parsePythonLines(elseLines, pinVariables, pinModes, readVariables);
        }
        instructions.push({
          type: 'ifBlock',
          conditionPin: pin,
          conditionVar: condVar,
          conditionOp: '!=',
          conditionVal: 0,
          thenBranch,
          elseBranch,
        });
        continue;
      }
    }

    // ── else: (standalone, skip — handled above) ──
    if (/^else\s*:/.test(trimmed)) continue;

    // ── Print: print("text", var) ──
    const printMultiMatch = trimmed.match(/^print\s*\(\s*(?:"([^"]*)"|'([^']*)')\s*,\s*(\w+)\s*\)/);
    if (printMultiMatch) {
      const text = printMultiMatch[1] ?? printMultiMatch[2] ?? '';
      const varName = printMultiMatch[3];
      instructions.push({ type: 'serialPrint', text: text + ' ', isPrintln: false });
      instructions.push({ type: 'serialPrintVar', varName, isPrintln: true });
      continue;
    }

    // ── Print: print(var) ──
    const printVarMatch = trimmed.match(/^print\s*\(\s*(\w+)\s*\)/);
    if (printVarMatch) {
      const varName = printVarMatch[1];
      instructions.push({ type: 'serialPrintVar', varName, isPrintln: true });
      continue;
    }

    // ── Print: print("text") ──
    const printMatch = trimmed.match(/^print\s*\(\s*(?:"([^"]*)"|'([^']*)')\s*\)/);
    if (printMatch) {
      instructions.push({ type: 'serialPrint', text: printMatch[1] ?? printMatch[2] ?? '', isPrintln: true });
      continue;
    }

    // ── time.sleep() ──
    const sleepMatch = trimmed.match(/^(?:time\.)?sleep\s*\(\s*(\d+(?:\.\d+)?)\s*\)/);
    if (sleepMatch) {
      instructions.push({ type: 'delay', ms: Math.round(parseFloat(sleepMatch[1]) * 1000) });
      continue;
    }

    // ── sleep_ms() ──
    const sleepMsMatch = trimmed.match(/^(?:time\.)?sleep_ms\s*\(\s*(\d+)\s*\)/);
    if (sleepMsMatch) {
      instructions.push({ type: 'delay', ms: parseInt(sleepMsMatch[1], 10) });
      continue;
    }

    // ── pin.value(1) or pin.value(0) — OUTPUT write ──
    const valueWriteMatch = trimmed.match(/^(\w+)\s*\.\s*value\s*\(\s*(\d+|HIGH|LOW)\s*\)/);
    if (valueWriteMatch) {
      const varName = valueWriteMatch[1];
      const valStr = valueWriteMatch[2];
      const pin = pinVariables.get(varName);
      if (pin !== undefined) {
        const value = (valStr === '1' || valStr === 'HIGH') ? 255 : 0;
        instructions.push({ type: 'digitalWrite', pin, value });
      }
      continue;
    }

    // ── pin.on() / pin.off() / pin.high() / pin.low() ──
    const methodMatch = trimmed.match(/^(\w+)\s*\.\s*(on|off|high|low)\s*\(\s*\)/);
    if (methodMatch) {
      const varName = methodMatch[1];
      const pin = pinVariables.get(varName);
      if (pin !== undefined) {
        const value = (methodMatch[2] === 'on' || methodMatch[2] === 'high') ? 255 : 0;
        instructions.push({ type: 'digitalWrite', pin, value });
      }
      continue;
    }
  }

  return instructions;
}

function parsePythonCode(code: string): {
  setup: Instruction[];
  loop: Instruction[];
  error: string | null;
} {
  const setup: Instruction[] = [];
  const loop: Instruction[] = [];
  let error: string | null = null;

  try {
    const allLines = code.split('\n');
    const pinVariables = new Map<string, number>();
    const pinModes = new Map<string, string>();

    // Find the while True: loop line
    let whileIdx = -1;
    for (let i = 0; i < allLines.length; i++) {
      if (/^\s*while\s+(?:True|1)\s*:/i.test(allLines[i])) {
        whileIdx = i;
        break;
      }
    }

    const setupLines = whileIdx >= 0 ? allLines.slice(0, whileIdx) : allLines;
    const loopLines = whileIdx >= 0 ? allLines.slice(whileIdx + 1) : [];

    // Parse setup (before while True)
    const setupInstrs = parsePythonLines(setupLines, pinVariables, pinModes);
    setup.push(...setupInstrs);

    // Parse loop body (inside while True)
    if (loopLines.length > 0) {
      // Dedent loop lines
      const loopInstrs = parsePythonLines(loopLines, pinVariables, pinModes);
      loop.push(...loopInstrs);
    }

    if (!error && setup.length === 0 && loop.length === 0) {
      error = '1:1: error: No Pin configurations or executable statements found';
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Parse error';
  }

  return { setup, loop, error };
}

function extractFunctionBody(code: string, functionName: string) {
  const match = new RegExp(`void\\s+${functionName}\\s*\\(\\s*\\)\\s*\\{`).exec(code);
  if (!match) return null;

  const bodyStart = match.index + match[0].length;
  let depth = 1;
  for (let index = bodyStart; index < code.length; index += 1) {
    const char = code[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return code.slice(bodyStart, index);
  }

  return null;
}

function parseBlock(block: string, instructions: Instruction[], constVars: Map<string, number>) {
  let i = 0;
  while (i < block.length) {
    while (i < block.length && /\s/.test(block[i])) i++;
    if (i >= block.length) break;

    // 1. C++ for-loop
    const forMatch = block.slice(i).match(/^for\s*\(\s*(\w+)\s*=\s*(-?\d+)\s*;\s*\1\s*(<=|>=|<|>)\s*(-?\d+)\s*;\s*\1\s*([+-]=)\s*(\d+)\s*\)\s*\{/);
    if (forMatch) {
      i += forMatch[0].length;
      let depth = 1;
      let startIdx = i;
      while (i < block.length && depth > 0) {
        if (block[i] === '{') depth++;
        else if (block[i] === '}') depth--;
        i++;
      }
      const loopBody = block.slice(startIdx, i - 1);
      const [, variableName, startRaw, operator, endRaw, stepOperator, stepRaw] = forMatch;
      const start = Number(startRaw);
      const end = Number(endRaw);
      const stepSize = Number(stepRaw);
      const step = stepOperator === '+=' ? stepSize : -stepSize;
      const shouldContinue = (value: number) => {
        if (operator === '<=') return value <= end;
        if (operator === '>=') return value >= end;
        if (operator === '<') return value < end;
        return value > end;
      };
      if (step !== 0) {
        for (let value = start; shouldContinue(value); value += step) {
          const valuePattern = new RegExp(`\\b${variableName}\\b`, 'g');
          parseBlock(loopBody.replace(valuePattern, String(value)), instructions, constVars);
        }
      }
      continue;
    }

    // 2. C++ if / else-if / else chain
    const ifMatch = block.slice(i).match(/^if\s*\(/);
    if (ifMatch) {
      const extractBranchBody = (): string => {
        while (i < block.length && /\s/.test(block[i])) i++;
        if (i < block.length && block[i] === '{') {
          let depth = 1;
          const start = i + 1;
          i++;
          while (i < block.length && depth > 0) {
            if (block[i] === '{') depth++;
            else if (block[i] === '}') depth--;
            i++;
          }
          return block.slice(start, i - 1);
        } else {
          const start = i;
          while (i < block.length && block[i] !== ';') i++;
          if (i < block.length) i++;
          return block.slice(start, i);
        }
      };

      const extractCondition = (): string => {
        let depth = 1;
        const start = i;
        while (i < block.length && depth > 0) {
          if (block[i] === '(') depth++;
          else if (block[i] === ')') depth--;
          i++;
        }
        return block.slice(start, i - 1).trim();
      };

      i += ifMatch[0].length;
      const rootCondition = extractCondition();
      const rootThen = extractBranchBody();

      type Branch = { condition: string | null; body: string };
      const branches: Branch[] = [{ condition: rootCondition, body: rootThen }];

      while (i < block.length) {
        const rest = block.slice(i);
        const elseIfMatch = rest.match(/^\s*else\s+if\s*\(/);
        const elseMatch = rest.match(/^\s*else\s*(?!if)/);

        if (elseIfMatch) {
          const skipLen = rest.indexOf('(') + 1;
          i += skipLen;
          const cond = extractCondition();
          const body = extractBranchBody();
          branches.push({ condition: cond, body });
        } else if (elseMatch) {
          const skipLen = rest.indexOf('else') + 4;
          i += skipLen;
          const body = extractBranchBody();
          branches.push({ condition: null, body });
          break;
        } else {
          break;
        }
      }

      // Build nested ifBlock AST from bottom up
      let currentElse: Instruction[] = [];
      for (let b = branches.length - 1; b >= 0; b--) {
        const branch = branches[b];
        if (branch.condition === null) {
          const elseInsts: Instruction[] = [];
          parseBlock(branch.body, elseInsts, constVars);
          currentElse = elseInsts;
        } else {
          const thenInsts: Instruction[] = [];
          parseBlock(branch.body, thenInsts, constVars);
          currentElse = [{
            type: 'ifBlock',
            conditionExpr: branch.condition,
            thenBranch: thenInsts,
            elseBranch: currentElse,
          }];
        }
      }

      if (currentElse.length > 0) {
        instructions.push(currentElse[0]);
      }
      continue;
    }

    // 3. Simple statement ending with ';'
    let sStart = i;
    while (i < block.length && block[i] !== ';') {
      if (block[i] === '{' || block[i] === '}') break;
      i++;
    }
    if (i < block.length && block[i] === ';') i++;
    const stmt = block.slice(sStart, i).trim();
    if (stmt && stmt !== '{' && stmt !== '}') {
      parseStatement(stmt, instructions, constVars);
    } else if (sStart === i) {
      i++; // prevent infinite loop on stray symbols
    }
  }
}

function parseSimpleStatements(block: string, instructions: Instruction[], constVars: Map<string, number>) {
  const statements = block
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    parseStatement(stmt, instructions, constVars);
  }
}

function resolveValue(val: string): number {
  const t = val.trim();
  if (t === 'HIGH') return 1;
  if (t === 'LOW') return 0;
  if (t === 'OUTPUT') return 1;
  if (t === 'INPUT') return 0;
  if (t === 'INPUT_PULLUP') return 2;
  const num = parseInt(t, 10);
  return isNaN(num) ? 0 : num;
}

function resolveValueWithVars(val: string, constVars: Map<string, number>): number {
  const t = val.trim();
  if (constVars.has(t)) return constVars.get(t)!;
  if (t === 'HIGH') return 1;
  if (t === 'LOW') return 0;
  if (t === 'OUTPUT') return 1;
  if (t === 'INPUT') return 0;
  if (t === 'INPUT_PULLUP') return 2;
  const num = parseInt(t, 10);
  return isNaN(num) ? 0 : num;
}

function parseStatement(stmt: string, instructions: Instruction[], constVars: Map<string, number>) {
  const pinModeMatch = stmt.match(/pinMode\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (pinModeMatch) {
    const pin = resolveValueWithVars(pinModeMatch[1], constVars);
    const modeStr = pinModeMatch[2].trim();
    const mode =
      modeStr === 'INPUT_PULLUP'
        ? 'INPUT_PULLUP'
        : modeStr === 'INPUT'
          ? 'INPUT'
          : 'OUTPUT';
    instructions.push({ type: 'pinMode', pin, mode });
    return;
  }

  const digitalWriteMatch = stmt.match(/digitalWrite\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (digitalWriteMatch) {
    instructions.push({
      type: 'digitalWrite',
      pin: resolveValueWithVars(digitalWriteMatch[1], constVars),
      value: resolveValueWithVars(digitalWriteMatch[2], constVars),
    });
    return;
  }

  const analogWriteMatch = stmt.match(/analogWrite\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (analogWriteMatch) {
    instructions.push({
      type: 'analogWrite',
      pin: resolveValueWithVars(analogWriteMatch[1], constVars),
      value: Math.min(255, Math.max(0, resolveValueWithVars(analogWriteMatch[2], constVars))),
    });
    return;
  }

  // analogRead: int forceValue = analogRead(forcePin);
  const analogReadMatch = stmt.match(/(?:int|long|float|double|const)?\s*(\w+)\s*=\s*analogRead\s*\(\s*(\w+)\s*\)/);
  if (analogReadMatch) {
    const varName = analogReadMatch[1].trim();
    const pinStr = analogReadMatch[2].trim();
    const pin = resolveValueWithVars(pinStr, constVars);
    instructions.push({ type: 'analogRead', pin, varName });
    return;
  }

  // digitalRead: int state = digitalRead(pin);
  const digitalReadMatch = stmt.match(/(?:int|long|float|double|const)?\s*(\w+)\s*=\s*digitalRead\s*\(\s*(\w+)\s*\)/);
  if (digitalReadMatch) {
    const varName = digitalReadMatch[1].trim();
    const pinStr = digitalReadMatch[2].trim();
    const pin = resolveValueWithVars(pinStr, constVars);
    instructions.push({ type: 'digitalRead', pin, varName });
    return;
  }

  const delayMatch = stmt.match(/delay\s*\(\s*(\d+)\s*\)/);
  if (delayMatch) {
    instructions.push({ type: 'delay', ms: parseInt(delayMatch[1], 10) });
    return;
  }

  const toneMatch = stmt.match(/tone\s*\(\s*(\w+)\s*,\s*(\w+)[^)]*\)/);
  if (toneMatch) {
    instructions.push({
      type: 'tone',
      pin: resolveValueWithVars(toneMatch[1], constVars),
      frequency: resolveValueWithVars(toneMatch[2], constVars),
    });
    return;
  }

  const noToneMatch = stmt.match(/noTone\s*\(\s*(\w+)\s*\)/);
  if (noToneMatch) {
    instructions.push({
      type: 'noTone',
      pin: resolveValueWithVars(noToneMatch[1], constVars),
    });
    return;
  }

  // Serial.print(ln) literal string
  const serialMatch = stmt.match(/Serial\.(print|println)\s*\(\s*"([^"]*)"\s*\)/);
  if (serialMatch) {
    const isPrintln = serialMatch[1] === 'println';
    instructions.push({ type: 'serialPrint', text: serialMatch[2], isPrintln });
    return;
  }

  // Serial.write('U') character or string literal
  const serialWriteLitMatch = stmt.match(/Serial\.write\s*\(\s*(?:'([^'])'|"([^"]*)")\s*\)/);
  if (serialWriteLitMatch) {
    const text = serialWriteLitMatch[1] ?? serialWriteLitMatch[2] ?? '';
    instructions.push({ type: 'serialPrint', text, isPrintln: false });
    return;
  }

  // Serial.write(varOrNum)
  const serialWriteVarMatch = stmt.match(/Serial\.write\s*\(\s*([^)]+)\s*\)/);
  if (serialWriteVarMatch) {
    const varName = serialWriteVarMatch[1].trim();
    if (!varName.startsWith('"') && !varName.endsWith('"')) {
      instructions.push({ type: 'serialPrintVar', varName, isPrintln: false });
      return;
    }
  }

  // Serial.print(ln) variable or number
  const serialVarMatch = stmt.match(/Serial\.(print|println)\s*\(\s*([^"]+)\s*\)/);
  if (serialVarMatch) {
    const isPrintln = serialVarMatch[1] === 'println';
    const varName = serialVarMatch[2].trim();
    if (!varName.startsWith('"') && !varName.endsWith('"')) {
      instructions.push({ type: 'serialPrintVar', varName, isPrintln });
      return;
    }
  }

  if (stmt.match(/(?:Serial|dht|Wire)\.begin/i)) return;

  // Variable assignment / sensor reading (e.g. float temp = dht.readTemperature();)
  const assignMatch = stmt.match(/(?:float|double|int|long|byte|char|unsigned\s+int|uint8_t|uint16_t)?\s*(\w+)\s*=\s*(.+)/);
  if (
    assignMatch &&
    !stmt.startsWith('pinMode') &&
    !stmt.startsWith('digitalWrite') &&
    !stmt.startsWith('analogWrite') &&
    !stmt.startsWith('Serial.') &&
    !stmt.startsWith('dht.')
  ) {
    const varName = assignMatch[1].trim();
    const rhs = assignMatch[2].trim();
    instructions.push({ type: 'variableAssign', varName, expression: rhs });
    return;
  }
}

// ---------------------------------------------------------------------------
// Main Simulator Class
// ---------------------------------------------------------------------------

export class ArduinoSimulator {
  private pins: Map<number, PinState> = new Map();
  private serialOutput: string[] = [];
  private currentSerialLine = '';
  private isLastLineFinalized = true;
  private variables: Map<string, number> = new Map();
  private running = false;
  private avrRunner: AVRRunner | null = null;
  private abortController: AbortController | null = null;
  private onStateChange: (state: SimulatorState) => void;
  private useAVR = false;
  private ultrasonicDevices: UltrasonicDevice[];
  private analogVoltageCallback: ((channel: number) => number) | null = null;
  private inputPinCallback: ((pin: number) => number) | null = null;
  private onSimulatorStarted?: () => void;

  appendSerialChar(char: string) {
    if (char === '\n') {
      if (this.serialOutput.length > 0 && !this.isLastLineFinalized) {
        const lastIdx = this.serialOutput.length - 1;
        if (this.serialOutput[lastIdx].endsWith('\r')) {
          this.serialOutput[lastIdx] = this.serialOutput[lastIdx].slice(0, -1);
        }
      }
      this.isLastLineFinalized = true;
      this.notify();
      return;
    }

    if (char === '\r') return;

    if (this.isLastLineFinalized || this.serialOutput.length === 0) {
      this.serialOutput.push(char);
      this.isLastLineFinalized = false;
    } else {
      const lastIdx = this.serialOutput.length - 1;
      this.serialOutput[lastIdx] += char;
      if (this.serialOutput[lastIdx].length >= 80) {
        this.isLastLineFinalized = true;
      }
    }

    if (this.serialOutput.length > 100) {
      this.serialOutput.shift();
    }
    this.notify();
  }


  constructor(
    onStateChange: (state: SimulatorState) => void,
    options: {
      ultrasonicDevices?: UltrasonicDevice[];
      onSimulatorStarted?: () => void;
    } = {}
  ) {
    this.onStateChange = onStateChange;
    this.ultrasonicDevices = options.ultrasonicDevices ?? [];
    this.onSimulatorStarted = options.onSimulatorStarted;
    this.initPins();
  }

  /**
   * Set (or clear) the callback that provides real analog voltages for analogRead().
   * fn(channel) must return a voltage in the 0–5 V range.
   * Pass null to disable (analogRead will return 0).
   */
  setAnalogVoltageCallback(fn: ((channel: number) => number) | null) {
    this.analogVoltageCallback = fn;
    if (this.avrRunner) {
      const runner = this.avrRunner as any;
      if ('onGetAnalogVoltage' in runner) {
        runner.onGetAnalogVoltage = fn;
      } else if (typeof runner.setAnalogVoltageCallback === 'function' && fn) {
        runner.setAnalogVoltageCallback(fn);
      }
    }
  }

  /**
   * Set (or clear) the callback that provides live digital input pin values.
   * fn(pin) must return 0 (LOW / button pressed with PULL_UP) or 1 (HIGH).
   * Pass null to disable (all INPUT pins read as 1 = floating HIGH).
   */
  setInputPinCallback(fn: ((pin: number) => number) | null) {
    this.inputPinCallback = fn;
  }

  private initPins() {
    this.pins.clear();
    for (let i = 0; i <= 28; i++) {
      this.pins.set(i, { mode: 'UNSET', value: 0 });
    }
  }

  private notify(error?: string | null) {
    const now = Date.now();
    const txActive = this.avrRunner ? (now - this.avrRunner.lastTxTimestamp < 350) : false;
    const rxActive = this.avrRunner ? (now - this.avrRunner.lastRxTimestamp < 350) : false;
    this.onStateChange({
      pins: new Map(this.pins),
      serialOutput: [...this.serialOutput],
      running: this.running,
      error: error ?? null,
      txActive,
      rxActive,
    });
  }

  sendSerialData(data: string) {
    if (!this.running) return;
    if (this.avrRunner) {
      this.avrRunner.sendSerialString(data);
      this.notify();
    } else {
      this.serialOutput.push(`> ${data}`);
      this.notify();
    }
  }

  async start(code: string) {

    if (this.running) this.stop();

    this.initPins();
    this.serialOutput = [];
    this.currentSerialLine = '';
    this.variables.clear();
    this.running = true;
    this.useAVR = false;

    const isPython = /^\s*(from\s+machine|import\s+|\w+\s*=\s*Pin\()/m.test(code);
    if (isPython) {
      this.serialOutput.push('[Running MicroPython simulation...]');
      this.notify();
      await this.runFallback(code, true);
      return;
    }

    // Notify: compiling...
    this.serialOutput.push('[Compiling Arduino code...]');
    this.notify();

    // Try real AVR compilation first
    const { hex, error: compileError } = await compileArduinoCode(code);

    if (!this.running) return; // stopped while compiling

    if (hex) {
      // Real AVR simulation
      this.useAVR = true;
      this.serialOutput = ['[Compiled successfully — running AVR simulation]'];
      for (const device of this.ultrasonicDevices) {
        this.serialOutput.push(
          `[Ultrasonic HC-SR04: TRIG D${device.triggerPin}, ECHO D${device.echoPin}, ${Math.round(device.distanceCm)} cm]`
        );
      }
      this.notify();
      await this.runAVR(hex);
    } else if (compileError && /: error:|Error during build/i.test(compileError)) {
      this.serialOutput = ['[Compilation error]', ...compileError.split('\n').filter(Boolean)];
      this.stop(compileError);
      return;
    } else {
      this.serialOutput = [
        compileError || 'Compilation failed',
        '[Falling back to basic simulator]',
      ];
      this.notify();
      await this.runFallback(code);
    }
  }

  // -------------------------------------------------------------------------
  // Real AVR Simulation via avr8js
  // -------------------------------------------------------------------------

  private async runAVR(hex: string) {
    const runner = new AVRRunner(hex);
    this.avrRunner = runner;
    this.onSimulatorStarted?.();
    // Wire up the analog voltage callback if one was already set
    const r = runner as any;
    if ('onGetAnalogVoltage' in r) {
      r.onGetAnalogVoltage = this.analogVoltageCallback;
    } else if (typeof r.setAnalogVoltageCallback === 'function' && this.analogVoltageCallback) {
      r.setAnalogVoltageCallback(this.analogVoltageCallback);
    }
    const lastTriggerStates = new Map<string, boolean>();
    const triggerPulseCounts = new Map<string, number>();

    // Wire up serial output (streaming character append to active line)
    runner.usart.onByteTransmit = (value: number) => {
      runner.lastTxTimestamp = Date.now();
      this.appendSerialChar(String.fromCharCode(value));
    };

    // Wire up GPIO listeners — update pin states when ports change
    const updatePins = () => {
      for (let pin = 0; pin <= 19; pin++) {
        const rawState = runner.pinState(pin);
        // For output pins, pinState() reads the PIN register which does not
        // reflect the output latch in avr8js. Use isOutputHigh() to get the
        // true output value from DDR+PORT registers.
        if (rawState === AVRPinState.Low || rawState === AVRPinState.High) {
          // Pin is configured as output — check actual output latch
          const outputHigh = runner.isOutputHigh(pin);
          const pwmValue = runner.getPinPWMValue(pin);
          this.pins.set(pin, {
            mode: 'OUTPUT',
            value: pwmValue ?? (outputHigh ? 255 : 0),
          });
        } else {
          this.pins.set(pin, avrPinToOurPin(rawState));
        }
      }
    };

    const updateUltrasonicDevices = () => {
      for (const device of this.ultrasonicDevices) {
        const key = `${device.triggerPin}:${device.echoPin}`;
        // Use isOutputHigh() instead of pinState() — pinState() reads the PIN
        // register which does not reflect the output latch on avr8js.
        const triggerHigh = runner.isOutputHigh(device.triggerPin);
        const wasHigh = lastTriggerStates.get(key) ?? false;

        if (wasHigh && !triggerHigh) {
          const distanceCm = Math.max(2, Math.min(400, device.distanceCm));
          const echoMicros = distanceCm * 58;
          const pulseCount = (triggerPulseCounts.get(key) ?? 0) + 1;
          triggerPulseCounts.set(key, pulseCount);
          if (pulseCount === 1) {
            this.serialOutput.push(
              `[Ultrasonic echo armed: D${device.echoPin} HIGH for ${Math.round(echoMicros)}us]`
            );
            if (this.serialOutput.length > 100) this.serialOutput.shift();
          }
          runner.scheduleDigitalPulse(
            device.echoPin,
            runner.cpu.cycles + Math.round((runner.MHZ / 1_000_000) * 100),
            Math.round((runner.MHZ / 1_000_000) * echoMicros)
          );
        }

        lastTriggerStates.set(key, triggerHigh);
      }
    };

    let lastPortNotification = 0;
    const handlePortChange = () => {
      updatePins();
      updateKeypadPins();
      const now = Date.now();
      if (now - lastPortNotification >= 32) {
        lastPortNotification = now;
        this.notify();
      }
    };

    const KEY_MATRIX = [
      ["1", "2", "3", "A"],
      ["4", "5", "6", "B"],
      ["7", "8", "9", "C"],
      ["*", "0", "#", "D"],
    ];

    const updateKeypadPins = () => {
      const { nodes } = useCircuitStore.getState();
      const keypadNode = nodes.find((n: any) => {
        const ct = n.data.componentType ?? "";
        const sm = n.data.simulationModel ?? "";
        return ct === "keypad4x4" || sm === "keypad4x4" || ct === "keypad4x3" || sm === "keypad4x3" || ct.startsWith("keypad");
      });
      if (!keypadNode) return;

      const pressedKey = String(
        keypadNode.data.properties?.pressedKeys?.value ??
        keypadNode.data.properties?.pressedKey?.value ??
        ""
      );

      const rowPins = [9, 8, 7, 6];
      const colPins = [5, 4, 3, 2];

      let activeRowIdx = -1;
      let activeColIdx = -1;

      if (pressedKey) {
        for (let r = 0; r < KEY_MATRIX.length; r++) {
          const c = KEY_MATRIX[r].indexOf(pressedKey);
          if (c !== -1) {
            activeRowIdx = r;
            activeColIdx = c;
            break;
          }
        }
      }

      for (let c = 0; c < colPins.length; c++) {
        const colPin = colPins[c];
        let pullLow = false;
        if (pressedKey && c === activeColIdx && activeRowIdx !== -1) {
          const drivenRowPin = rowPins[activeRowIdx];
          if (runner.isOutputLow(drivenRowPin)) {
            pullLow = true;
          }
        }
        runner.setDigitalPin(colPin, !pullLow);
      }
    };

    runner.portB.addListener(handlePortChange);
    runner.portD.addListener(handlePortChange);
    runner.portC.addListener(handlePortChange);

    // Run CPU
    await runner.execute(() => {
      updatePins();
      updateKeypadPins();
      this.notify();
    }, updateUltrasonicDevices);
  }

  // -------------------------------------------------------------------------
  // Fallback regex-based simulation
  // -------------------------------------------------------------------------

  private async runFallback(code: string, isPython = false) {
    this.abortController = new AbortController();

    const { setup, loop, error } = isPython ? parsePythonCode(code) : parseArduinoCode(code);
    if (error) {
      this.serialOutput = ['[Compilation error]', error];
      this.stop(error);
      return;
    }

    this.onSimulatorStarted?.();

    // Execute setup()
    for (const instr of setup) {
      if (!this.running) return;
      const delayMs = this.executeInstruction(instr);
      if (delayMs > 0) {
        this.notify();
        await this.sleep(Math.min(delayMs, 3000));
        if (!this.running) return;
      }
    }
    this.notify();

    // Execute loop() repeatedly
    while (this.running) {
      let anyChange = false;
      for (const instr of loop) {
        if (!this.running) return;
        const delayMs = this.executeInstruction(instr);
        // Notify immediately after any instruction that may change pin state (ifBlock, digitalWrite)
        if (instr.type === 'ifBlock' || instr.type === 'digitalWrite' || instr.type === 'analogWrite' || instr.type === 'tone' || instr.type === 'noTone') {
          this.notify();
          anyChange = true;
        }
        if (delayMs > 0) {
          if (this.currentSerialLine.length > 0) {
            this.serialOutput.push(this.currentSerialLine);
            this.currentSerialLine = '';
            if (this.serialOutput.length > 100) this.serialOutput.shift();
          }
          this.notify();
          await this.sleep(Math.min(delayMs, 2000));
          if (!this.running) return;
        }
      }
      if (this.currentSerialLine.length > 0) {
        this.serialOutput.push(this.currentSerialLine);
        this.currentSerialLine = '';
        if (this.serialOutput.length > 100) this.serialOutput.shift();
      }
      if (!anyChange) this.notify();
      await this.sleep(50); // Poll at 20Hz for button state
    }
  }

  setInputPinState(pin: number, value: boolean) {
    if (this.avrRunner) {
      this.avrRunner.setDigitalPin(pin, value);
    }
    const pinState = this.pins.get(pin);
    if (pinState) {
      pinState.value = value ? 255 : 0;
    }
  }

  private executeInstruction(instr: Instruction): number {

    switch (instr.type) {
      case 'pinMode': {
        const pin = this.pins.get(instr.pin);
        if (pin) pin.mode = instr.mode;
        return 0;
      }
      case 'digitalWrite': {
        const pin = this.pins.get(instr.pin);
        // For Python/MicroPython: always allow OUTPUT writes (pin mode may not have been set yet)
        if (pin) {
          if (pin.mode === 'OUTPUT' || pin.mode === 'UNSET') {
            pin.value = instr.value ? 255 : 0;
            pin.mode = 'OUTPUT';
          }
        }
        return 0;
      }
      case 'tone': {
        const pin = this.pins.get(instr.pin);
        if (pin) {
          pin.mode = 'OUTPUT';
          pin.value = 255;
          pin.frequency = instr.frequency;
        }
        return 0;
      }
      case 'noTone': {
        const pin = this.pins.get(instr.pin);
        if (pin) {
          pin.mode = 'OUTPUT';
          pin.value = 0;
          pin.frequency = 0;
        }
        return 0;
      }
      case 'analogWrite': {
        const pin = this.pins.get(instr.pin);
        if (pin) {
          pin.mode = 'OUTPUT';
          pin.value = instr.value;
        }
        return 0;
      }
      case 'delay':
        return instr.ms;
      case 'serialPrint': {
        for (let i = 0; i < instr.text.length; i++) {
          this.appendSerialChar(instr.text[i]);
        }
        if (instr.isPrintln) {
          this.appendSerialChar('\n');
        }
        return 0;
      }
      case 'serialPrintVar': {
        let val: string | number;
        if (this.variables.has(instr.varName)) {
          val = this.variables.get(instr.varName)!;
        } else {
          const evalRes = evaluateExpression(instr.varName);
          val = evalRes !== 0 ? evalRes : resolveValue(instr.varName);
        }
        const str = String(val);
        for (let i = 0; i < str.length; i++) {
          this.appendSerialChar(str[i]);
        }
        if (instr.isPrintln) {
          this.appendSerialChar('\n');
        }
        return 0;
      }
      case 'analogRead': {
        const pinVal = this.pins.get(instr.pin);
        let voltage = 0;
        if (this.analogVoltageCallback) {
          const channel = instr.pin >= 14 && instr.pin <= 19 ? instr.pin - 14 : instr.pin;
          voltage = this.analogVoltageCallback(channel);
        } else if (pinVal) {
          voltage = (pinVal.value / 255) * 5;
        }
        const scale = instr.isU16 ? 65535 : 1023;
        const adcVal = Math.round((voltage / 5) * scale);
        this.variables.set(instr.varName, adcVal);
        if (pinVal) {
          pinVal.value = Math.round((voltage / 5) * 255);
        }
        return 0;
      }
      case 'digitalRead': {
        const pinVal = this.pins.get(instr.pin);
        let val = 1;
        if (this.inputPinCallback) {
          val = this.inputPinCallback(instr.pin);
        } else if (pinVal) {
          val = pinVal.value > 127 ? 1 : 0;
        }
        this.variables.set(instr.varName, val);
        if (pinVal) {
          pinVal.value = val ? 255 : 0;
        }
        return 0;
      }
      case 'readPin': {
        const pin = this.pins.get(instr.pin);
        if (pin && (pin.mode === 'INPUT' || pin.mode === 'INPUT_PULLUP')) {
          const rawVal = this.inputPinCallback ? this.inputPinCallback(instr.pin) : 1;
          pin.value = rawVal ? 255 : 0;
        }
        return 0;
      }
      case 'variableAssign': {
        const valStr = instr.expression ? evaluateExpression(instr.expression) : String(instr.value ?? 0);
        const valNum = Number(valStr);
        this.variables.set(instr.varName, isNaN(valNum) ? (instr.value ?? 0) : valNum);
        return 0;
      }
      case 'ifBlock': {
        let conditionMet = false;
        if (instr.conditionExpr) {
          let expr = instr.conditionExpr;
          for (const [vName, vVal] of this.variables.entries()) {
            expr = expr.replace(new RegExp(`\\b${vName}\\b`, 'g'), String(vVal));
          }
          expr = expr.replace(/isnan\s*\(\s*([^)]+)\s*\)/g, (_, arg) => {
            const num = Number(arg.trim());
            return isNaN(num) ? 'true' : 'false';
          });
          try {
            conditionMet = Boolean(new Function(`return (${expr});`)());
          } catch {
            conditionMet = false;
          }
        } else {
          let valToCompare = 0;
          if (instr.conditionVar && this.variables.has(instr.conditionVar)) {
            valToCompare = this.variables.get(instr.conditionVar)!;
          } else if (instr.conditionPin !== undefined) {
            valToCompare = this.inputPinCallback
              ? this.inputPinCallback(instr.conditionPin)
              : (this.pins.get(instr.conditionPin)?.value ?? 255) > 0 ? 1 : 0;
          }

          let targetVal = 0;
          if (typeof instr.conditionVal === 'string') {
            if (this.variables.has(instr.conditionVal)) {
              targetVal = this.variables.get(instr.conditionVal)!;
            } else {
              const parsedInt = parseInt(instr.conditionVal, 10);
              targetVal = isNaN(parsedInt) ? 0 : parsedInt;
            }
          } else {
            targetVal = instr.conditionVal ?? 0;
          }

          switch (instr.conditionOp) {
            case '==': conditionMet = valToCompare === targetVal; break;
            case '!=': conditionMet = valToCompare !== targetVal; break;
            case '<': conditionMet = valToCompare < targetVal; break;
            case '>': conditionMet = valToCompare > targetVal; break;
            case '<=': conditionMet = valToCompare <= targetVal; break;
            case '>=': conditionMet = valToCompare >= targetVal; break;
          }
        }

        // Execute the appropriate branch (synchronously — delays inside branches are returned)
        const branch = conditionMet ? instr.thenBranch : instr.elseBranch;
        let totalDelay = 0;
        for (const subInstr of branch) {
          totalDelay += this.executeInstruction(subInstr);
        }
        return totalDelay;
      }
    }
  }

  stop(error?: string) {
    this.running = false;
    if (this.avrRunner) {
      this.avrRunner.stop();
      this.avrRunner = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.initPins();
    this.notify(error ?? null);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (this.abortController) {
        this.abortController.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        });
      }
    });
  }
}
