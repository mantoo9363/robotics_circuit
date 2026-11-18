import type { CircuitNode, CircuitEdge } from "../types";
import {
  buildConductiveGraphForStore,
  getReachableGraphNodes,
  addGraphConnection,
} from "../circuit/graph";
import { getNodeSimulationModelForStore } from "../circuit/components";
import { useCircuitStore } from "../store";
import { getAnalogValueForPicoPin } from "./picoAnalogPins";
import {
  resolveIrReceiverValue,
  resetIrReceiverState,
  NEC_COMMANDS,
} from "../esp32/parser/irReceiver";

export function stripCodeComments(code: string): string {
  return code
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/#.*$/gm, "");
}

export function parsePicoPinFromPythonCode(
  code: string,
  names: string[],
): number | null {
  const cleaned = stripCodeComments(code);

  for (const name of names) {
    const pattern = new RegExp(
      `\\b${name}\\s*=\\s*Pin\\s*\\(\\s*(\\d+)\\b`,
      "i",
    );
    const match = cleaned.match(pattern);
    if (match) {
      const pin = Number(match[1]);
      if (Number.isInteger(pin) && pin >= 0 && pin <= 28) return pin;
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// AST Type Definitions
// -----------------------------------------------------------------------------

interface Token {
  type:
    | "IDENTIFIER"
    | "NUMBER"
    | "STRING"
    | "FSTRING"
    | "KEYWORD"
    | "OPERATOR"
    | "INDENT"
    | "DEDENT"
    | "NEWLINE"
    | "EOF";
  value: string;
}

type ASTNode =
  | { kind: "Assign"; target: string; value: Expr }
  | { kind: "AugAssign"; target: string; op: string; value: Expr }
  | {
      kind: "If";
      condition: Expr;
      thenBranch: ASTNode[];
      elifBranches: Array<{ cond: Expr; body: ASTNode[] }>;
      elseBranch: ASTNode[] | null;
    }
  | { kind: "While"; condition: Expr; body: ASTNode[] }
  | { kind: "Raise"; expr?: Expr }
  | {
      kind: "For";
      varName: string;
      collection: Expr;
      isRange: boolean;
      start?: Expr;
      end?: Expr;
      step?: Expr;
      body: ASTNode[];
    }
  | {
      kind: "FunctionDef";
      name: string;
      params: Array<{ name: string; defaultValue: Expr | null }>;
      body: ASTNode[];
    }
  | { kind: "Return"; value: Expr | null }
  | { kind: "Break" }
  | { kind: "Continue" }
  | { kind: "Global"; varName: string }
  | {
      kind: "Try";
      tryBody: ASTNode[];
      excepts: Array<{
        errorClass: string | null;
        alias: string | null;
        body: ASTNode[];
      }>;
      finallyBody: ASTNode[] | null;
    }
  | { kind: "SubscriptAssign"; obj: Expr; index: Expr; value: Expr }
  | { kind: "TupleAssign"; targets: string[]; value: Expr }
  | { kind: "ExprStatement"; expr: Expr };

type Expr =
  | { kind: "BinOp"; op: string; left: Expr; right: Expr }
  | { kind: "BoolOp"; op: "and" | "or"; left: Expr; right: Expr }
  | { kind: "UnaryOp"; op: "not" | "-" | "~"; value: Expr }
  | { kind: "Compare"; op: string; left: Expr; right: Expr }
  | { kind: "Call"; callee: string; args: Array<{ name?: string; expr: Expr }> }
  | {
      kind: "AttributeCall";
      obj: Expr;
      method: string;
      args: Array<{ name?: string; expr: Expr }>;
    }
  | { kind: "Attribute"; obj: Expr; attr: string }
  | { kind: "Subscript"; obj: Expr; index: Expr }
  | { kind: "Slice"; start: Expr | null; end: Expr | null; step: Expr | null }
  | { kind: "ListLiteral"; items: Expr[] }
  | {
      kind: "ListComprehension";
      generator: Expr;
      varName: string;
      collection: Expr;
    }
  | { kind: "Name"; name: string }
  | { kind: "Literal"; value: any };

export interface LcdState {
  ddram: Uint8Array;
  cursor: number;
  backlight: boolean;
  displayEnabled: boolean;
  cursorEnabled: boolean;
  lastNibble: number | null;
  lastRs: number | null;
  lastEn: number;
  _debugCount?: number;
  /** GPIO number declared as sda=Pin(n) in the code's I2C() constructor, if known. */
  declaredSdaPin?: number;
  /** GPIO number declared as scl=Pin(n) in the code's I2C() constructor, if known. */
  declaredSclPin?: number;
}

export function createDefaultLcdState(): LcdState {
  const ddram = new Uint8Array(80);
  ddram.fill(32);
  return {
    ddram,
    cursor: 0,
    backlight: true,
    displayEnabled: true,
    cursorEnabled: false,
    lastNibble: null,
    lastRs: null,
    lastEn: 0,
  };
}

class SleepSignal {
  public remainingStatements: ASTNode[] = [];
  constructor(public ms: number) {}
}

export interface SimSessionState {
  boardType?: "pico" | "esp32";
  code: string;
  variables: Map<string, any>;
  pins: Map<number, { mode: string; value: number }>;
  pwm: Map<number, { dutyU16: number; freqHz: number }>;
  lastTimestamp: number;
  functions: Map<string, string>;
  loopLines: string[];
  loopPC: number;
  loopWaitRemaining: number;
  resumeStatements?: ASTNode[] | null;
  timers: Array<{
    period: number;
    mode: "PERIODIC" | "ONE_SHOT";
    callback: string;
    timeAccumulator: number;
  }>;
  irqs: Array<{
    pin: number;
    trigger: "RISING" | "FALLING" | "BOTH";
    handler: string;
    lastValue: number;
  }>;
  virtualFS: Map<string, string>;
  wdtTimeout: number;
  wdtAccumulator: number;
  rtcOffset: number;
  freq: number;
  outputs: Array<{ pin: number; high: boolean }>;
  serialLines: string[];
  pendingSerialBuffer?: string;
  currentSerialLine?: string;
  serialCursor?: number;
  setupNodes?: ASTNode[];
  loopNodes?: ASTNode[];
  setupPC?: number;
  setupFinished?: boolean;
  lcdStates: Map<number, LcdState>;
  lcdState?: LcdState;
  rawSerialLines?: string[];
  consumedKeys?: Set<string>;
  neopixelStates: Map<
    number,
    { pixels: Array<{ r: number; g: number; b: number }>; timestamp: number }
  >;
  irReceivers?: Array<{ pin: number; callback: any }>;
  /** When true, pin values pre-seeded before interpreter execution are preserved (used by ESP32 conditional evaluator). */
  preservePreSeededPinStates?: boolean;
}

/**
 * Generic terminal character stream processor supporting cursor positioning (\r),
 * newline line-feed (\n), backspace (\b), character overwriting, and rolling history.
 */
export function processSerialStream(state: SimSessionState, text: string): void {
  if (!state.rawSerialLines) state.rawSerialLines = [];
  if (state.currentSerialLine === undefined) state.currentSerialLine = "";
  if (state.serialCursor === undefined) state.serialCursor = state.currentSerialLine.length;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\r") {
      state.serialCursor = 0;
    } else if (char === "\n") {
      state.rawSerialLines.push(state.currentSerialLine);
      if (!state.serialLines) state.serialLines = [];
      state.serialLines.push(state.currentSerialLine);
      if (state.rawSerialLines.length > 100) {
        state.rawSerialLines = state.rawSerialLines.slice(-100);
      }
      state.currentSerialLine = "";
      state.serialCursor = 0;
    } else if (char === "\b") {
      state.serialCursor = Math.max(0, state.serialCursor - 1);
    } else {
      const cur: string = state.currentSerialLine ?? "";
      const cursor: number = state.serialCursor ?? 0;
      if (cursor < cur.length) {
        state.currentSerialLine = cur.substring(0, cursor) + char + cur.substring(cursor + 1);
      } else if (cursor === cur.length) {
        state.currentSerialLine = cur + char;
      } else {
        state.currentSerialLine = cur + " ".repeat(cursor - cur.length) + char;
      }
      state.serialCursor = cursor + 1;
    }
  }
}

/**
 * Returns visible serial lines including any active uncommitted line being streamed.
 */
export function getVisibleSerialLines(state: SimSessionState): string[] {
  if (!state.rawSerialLines) state.rawSerialLines = [];
  if (state.currentSerialLine && state.currentSerialLine.length > 0) {
    return [...state.rawSerialLines, state.currentSerialLine].slice(-100);
  }
  return state.rawSerialLines.slice(-100);
}

/**
 * Decodes standard Python string escape sequences (\n, \r, \t, \b, \f, \v, \\, \", \', \xHH, \0).
 */
export function unescapePythonString(str: string): string {
  return str.replace(/\\([nrtbfv\\'"0]|x[0-9a-fA-F]{2})/g, (_, esc) => {
    if (esc === "n") return "\n";
    if (esc === "r") return "\r";
    if (esc === "t") return "\t";
    if (esc === "b") return "\b";
    if (esc === "f") return "\f";
    if (esc === "v") return "\v";
    if (esc === "\\") return "\\";
    if (esc === "'") return "'";
    if (esc === '"') return '"';
    if (esc === "0") return "\0";
    if (esc.startsWith("x")) return String.fromCharCode(parseInt(esc.slice(1), 16));
    return esc;
  });
}

const MAX_LOOP_ITERATIONS = 1000;

// -----------------------------------------------------------------------------
// Tokenizer
// -----------------------------------------------------------------------------

export class MicroPythonTokenizer {
  private code: string;
  private pos: number = 0;
  private indentStack: number[] = [0];
  private pendingTokens: Token[] = [];
  private isAtLineStart: boolean = true;
  private parenDepth: number = 0;

  constructor(code: string) {
    this.code = code;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (true) {
      const tok = this.nextToken();
      tokens.push(tok);
      if (tok.type === "EOF") break;
    }
    return tokens;
  }

  private nextToken(): Token {
    if (this.pendingTokens.length > 0) {
      return this.pendingTokens.shift()!;
    }

    if (this.pos >= this.code.length) {
      if (this.indentStack.length > 1) {
        this.indentStack.pop();
        return { type: "DEDENT", value: "" };
      }
      return { type: "EOF", value: "" };
    }

    if (this.isAtLineStart && this.parenDepth === 0) {
      this.isAtLineStart = false;
      let indentSpaces = 0;
      while (
        this.pos < this.code.length &&
        (this.code[this.pos] === " " || this.code[this.pos] === "\t")
      ) {
        indentSpaces += this.code[this.pos] === "\t" ? 4 : 1;
        this.pos++;
      }

      let temp = this.pos;
      while (
        temp < this.code.length &&
        (this.code[temp] === " " ||
          this.code[temp] === "\t" ||
          this.code[temp] === "\r")
      ) {
        temp++;
      }
      if (
        temp >= this.code.length ||
        this.code[temp] === "\n" ||
        this.code[temp] === "#"
      ) {
        if (temp < this.code.length && this.code[temp] === "#") {
          while (temp < this.code.length && this.code[temp] !== "\n") {
            temp++;
          }
        }
        if (temp < this.code.length && this.code[temp] === "\n") {
          temp++;
        }
        this.pos = temp;
        this.isAtLineStart = true;
        if (this.pos >= this.code.length) {
          while (this.indentStack.length > 1) {
            this.indentStack.pop();
            this.pendingTokens.push({ type: "DEDENT", value: "" });
          }
          this.pendingTokens.push({ type: "EOF", value: "" });
          return this.pendingTokens.shift()!;
        }
        return this.nextToken();
      }

      const currentIndent = this.indentStack[this.indentStack.length - 1];
      if (indentSpaces > currentIndent) {
        this.indentStack.push(indentSpaces);
        return { type: "INDENT", value: "" };
      } else if (indentSpaces < currentIndent) {
        while (
          this.indentStack.length > 1 &&
          this.indentStack[this.indentStack.length - 1] > indentSpaces
        ) {
          this.indentStack.pop();
          this.pendingTokens.push({ type: "DEDENT", value: "" });
        }
        if (this.pendingTokens.length > 0) {
          return this.pendingTokens.shift()!;
        }
      }
    } else {
      if (this.isAtLineStart && this.parenDepth > 0) {
        this.isAtLineStart = false;
      }
      this.skipWhitespaceAndComments();
    }

    if (this.pos >= this.code.length) {
      if (this.indentStack.length > 1) {
        this.indentStack.pop();
        return { type: "DEDENT", value: "" };
      }
      return { type: "EOF", value: "" };
    }

    this.skipWhitespaceAndComments();

    if (this.pos >= this.code.length) {
      if (this.indentStack.length > 1) {
        this.indentStack.pop();
        return { type: "DEDENT", value: "" };
      }
      return { type: "EOF", value: "" };
    }

    const char = this.code[this.pos];

    if (char === "\n") {
      this.pos++;
      this.isAtLineStart = true;
      if (this.parenDepth > 0) {
        return this.nextToken();
      }
      return { type: "NEWLINE", value: "\n" };
    }

    // Match f-strings: f"..." or f'...' or F"..." or F'...
    if (
      (char === "f" || char === "F") &&
      (this.code[this.pos + 1] === '"' || this.code[this.pos + 1] === "'")
    ) {
      const quote = this.code[this.pos + 1];
      this.pos += 2;
      const start = this.pos;
      while (this.pos < this.code.length && this.code[this.pos] !== quote) {
        if (this.code[this.pos] === "\\") this.pos++;
        this.pos++;
      }
      const val = this.code.slice(start, this.pos);
      if (this.pos < this.code.length) this.pos++;
      return { type: "FSTRING", value: val };
    }

    if (char === '"' || char === "'") {
      const quote = char;
      this.pos++;
      const start = this.pos;
      while (this.pos < this.code.length && this.code[this.pos] !== quote) {
        if (this.code[this.pos] === "\\") this.pos++;
        this.pos++;
      }
      const val = this.code.slice(start, this.pos);
      if (this.pos < this.code.length) this.pos++;
      return { type: "STRING", value: val };
    }

    if (/\d/.test(char)) {
      const start = this.pos;
      if (char === "0" && this.pos + 1 < this.code.length) {
        const next = this.code[this.pos + 1].toLowerCase();
        if (next === "x") {
          this.pos += 2;
          while (
            this.pos < this.code.length &&
            /[0-9a-fA-F]/.test(this.code[this.pos])
          ) {
            this.pos++;
          }
          return { type: "NUMBER", value: this.code.slice(start, this.pos) };
        } else if (next === "b") {
          this.pos += 2;
          while (
            this.pos < this.code.length &&
            /[01]/.test(this.code[this.pos])
          ) {
            this.pos++;
          }
          return { type: "NUMBER", value: this.code.slice(start, this.pos) };
        } else if (next === "o") {
          this.pos += 2;
          while (
            this.pos < this.code.length &&
            /[0-7]/.test(this.code[this.pos])
          ) {
            this.pos++;
          }
          return { type: "NUMBER", value: this.code.slice(start, this.pos) };
        }
      }
      while (this.pos < this.code.length && /[\d.]/.test(this.code[this.pos])) {
        this.pos++;
      }
      return { type: "NUMBER", value: this.code.slice(start, this.pos) };
    }

    if (/[a-zA-Z_]/.test(char)) {
      const start = this.pos;
      while (
        this.pos < this.code.length &&
        /[a-zA-Z0-9_]/.test(this.code[this.pos])
      ) {
        this.pos++;
      }
      const val = this.code.slice(start, this.pos);
      const keywords = [
        "import",
        "from",
        "class",
        "def",
        "if",
        "elif",
        "else",
        "while",
        "for",
        "in",
        "is",
        "break",
        "continue",
        "raise",
        "return",
        "global",
        "not",
        "and",
        "or",
        "True",
        "False",
        "None",
        "try",
        "except",
        "as",
        "finally",
      ];
      if (keywords.includes(val)) {
        return { type: "KEYWORD", value: val };
      }
      return { type: "IDENTIFIER", value: val };
    }

    const multiOps = [
      "==",
      "!=",
      "<=",
      ">=",
      "+=",
      "-=",
      "*=",
      "/=",
      "<<",
      ">>",
      "//",
      "**",
    ];
    for (const op of multiOps) {
      if (this.code.startsWith(op, this.pos)) {
        this.pos += op.length;
        return { type: "OPERATOR", value: op };
      }
    }

    const singleOps = [
      "+",
      "-",
      "*",
      "/",
      "%",
      "=",
      "<",
      ">",
      "(",
      ")",
      "[",
      "]",
      "{",
      "}",
      ",",
      ":",
      ".",
      "&",
      "|",
      "^",
      "~",
    ];
    if (singleOps.includes(char)) {
      this.pos++;
      if (char === "(" || char === "[" || char === "{") {
        this.parenDepth++;
      } else if (char === ")" || char === "]" || char === "}") {
        this.parenDepth = Math.max(0, this.parenDepth - 1);
      }
      return { type: "OPERATOR", value: char };
    }

    this.pos++;
    return this.nextToken();
  }

  private skipWhitespaceAndComments() {
    while (this.pos < this.code.length) {
      const char = this.code[this.pos];
      if (char === " " || char === "\t" || char === "\r") {
        this.pos++;
      } else if (char === "#") {
        while (this.pos < this.code.length && this.code[this.pos] !== "\n") {
          this.pos++;
        }
      } else {
        break;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Parser
// -----------------------------------------------------------------------------

export class MicroPythonParser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ASTNode[] {
    const stmts: ASTNode[] = [];
    while (!this.isAtEnd()) {
      if (this.matchType("NEWLINE")) continue;
      const stmt = this.parseStatement();
      if (stmt) stmts.push(stmt);
    }
    return stmts;
  }

  private parseStatement(): ASTNode | null {
    if (this.matchKeyword("def")) return this.parseFunctionDef();
    if (this.matchKeyword("if")) return this.parseIf();
    if (this.matchKeyword("while")) return this.parseWhile();
    if (this.matchKeyword("for")) return this.parseFor();
    if (this.matchKeyword("return")) return this.parseReturn();
    if (this.matchKeyword("try")) return this.parseTry();
    if (this.matchKeyword("raise")) {
      const expr =
        !this.checkType("NEWLINE") && !this.isAtEnd()
          ? this.parseExpressionExternal()
          : undefined;
      this.consumeNewline();
      return { kind: "Raise", expr };
    }
    if (this.matchKeyword("break")) {
      this.consumeNewline();
      return { kind: "Break" };
    }
    if (this.matchKeyword("continue")) {
      this.consumeNewline();
      return { kind: "Continue" };
    }
    if (this.matchKeyword("global")) {
      const varName = this.consume(
        "IDENTIFIER",
        "Expect global variable name",
      ).value;
      this.consumeNewline();
      return { kind: "Global", varName };
    }
    if (this.matchKeyword("import") || this.matchKeyword("from")) {
      this.skipToNewline();
      return null;
    }

    return this.parseExpressionStatement();
  }

  private parseFunctionDef(): ASTNode {
    const name = this.consume("IDENTIFIER", "Expect function name").value;
    this.consumeOperator("(", "Expect '(' after function name");
    const params: Array<{ name: string; defaultValue: Expr | null }> = [];
    if (!this.checkOperator(")")) {
      do {
        const pName = this.consume("IDENTIFIER", "Expect parameter name").value;
        let defaultValue: Expr | null = null;
        if (this.matchOperator("=")) {
          defaultValue = this.parseExpression();
        }
        params.push({ name: pName, defaultValue });
      } while (this.matchOperator(","));
    }
    this.consumeOperator(")", "Expect ')' after parameters");
    this.consumeOperator(":", "Expect ':' before function body");
    const body = this.parseBlock();
    return { kind: "FunctionDef", name, params, body };
  }

  private parseIf(): ASTNode {
    const condition = this.parseExpression();
    this.consumeOperator(":", "Expect ':' after condition");
    const thenBranch = this.parseBlock();

    const elifBranches: Array<{ cond: Expr; body: ASTNode[] }> = [];
    let elseBranch: ASTNode[] | null = null;

    while (this.matchKeyword("elif")) {
      const cond = this.parseExpression();
      this.consumeOperator(":", "Expect ':' after condition");
      const body = this.parseBlock();
      elifBranches.push({ cond, body });
    }

    if (this.matchKeyword("else")) {
      this.consumeOperator(":", "Expect ':' after else");
      elseBranch = this.parseBlock();
    }

    return { kind: "If", condition, thenBranch, elifBranches, elseBranch };
  }

  private parseWhile(): ASTNode {
    const condition = this.parseExpression();
    this.consumeOperator(":", "Expect ':' after condition");
    const body = this.parseBlock();
    return { kind: "While", condition, body };
  }

  private parseFor(): ASTNode {
    const varName = this.consume(
      "IDENTIFIER",
      "Expect variable name in for loop",
    ).value;
    this.consumeKeyword("in", "Expect 'in' after for loop variable");

    const collection = this.parseExpression();
    this.consumeOperator(":", "Expect ':' after for loop header");
    const body = this.parseBlock();

    if (collection.kind === "Call" && collection.callee === "range") {
      let start: Expr = { kind: "Literal", value: 0 };
      let end: Expr = { kind: "Literal", value: 0 };
      let step: Expr | null = null;
      if (collection.args.length === 1) {
        end = collection.args[0].expr;
      } else if (collection.args.length === 2) {
        start = collection.args[0].expr;
        end = collection.args[1].expr;
      } else if (collection.args.length >= 3) {
        start = collection.args[0].expr;
        end = collection.args[1].expr;
        step = collection.args[2].expr;
      }
      return {
        kind: "For",
        varName,
        collection,
        isRange: true,
        start,
        end,
        step: step ?? undefined,
        body,
      };
    }

    return { kind: "For", varName, collection, isRange: false, body };
  }

  private parseReturn(): ASTNode {
    let value: Expr | null = null;
    if (!this.checkType("NEWLINE") && !this.checkType("EOF")) {
      value = this.parseExpression();
    }
    this.consumeNewline();
    return { kind: "Return", value };
  }

  private parseTry(): ASTNode {
    this.consumeOperator(":", "Expect ':' after try");
    const tryBody = this.parseBlock();

    const excepts: Array<{
      errorClass: string | null;
      alias: string | null;
      body: ASTNode[];
    }> = [];
    let finallyBody: ASTNode[] | null = null;

    while (this.matchKeyword("except")) {
      let errorClass: string | null = null;
      let alias: string | null = null;
      if (!this.checkOperator(":")) {
        errorClass = this.consume("IDENTIFIER", "Expect exception class").value;
        if (this.matchKeyword("as")) {
          alias = this.consume("IDENTIFIER", "Expect exception alias").value;
        }
      }
      this.consumeOperator(":", "Expect ':' after except header");
      const exceptBody = this.parseBlock();
      excepts.push({ errorClass, alias, body: exceptBody });
    }

    if (this.matchKeyword("finally")) {
      this.consumeOperator(":", "Expect ':' after finally");
      finallyBody = this.parseBlock();
    }

    if (excepts.length === 0 && finallyBody === null) {
      throw new Error("Expect 'except' or 'finally' after try block");
    }

    return { kind: "Try", tryBody, excepts, finallyBody };
  }

  private parseBlock(): ASTNode[] {
    this.consumeNewline();
    this.consume("INDENT", "Expect block to be indented");
    const stmts: ASTNode[] = [];
    while (!this.checkType("DEDENT") && !this.isAtEnd()) {
      if (this.matchType("NEWLINE")) continue;
      const stmt = this.parseStatement();
      if (stmt) stmts.push(stmt);
    }
    this.consume("DEDENT", "Expect end of block indentation");
    return stmts;
  }

  private parseExpressionStatement(): ASTNode {
    const expr = this.parseExpression();

    // Check for unpacking target assignment: x, y = ...
    if (expr.kind === "Name" && this.checkOperator(",")) {
      const targets: string[] = [expr.name];
      while (this.matchOperator(",")) {
        targets.push(
          this.consume("IDENTIFIER", "Expect variable name in unpacking").value,
        );
      }
      this.consumeOperator("=", "Expect '=' after unpacking targets");
      const value = this.parseExpression();
      this.consumeNewline();
      return { kind: "TupleAssign", targets, value };
    }

    if (this.matchOperator("=")) {
      if (expr.kind === "Subscript") {
        const value = this.parseExpression();
        this.consumeNewline();
        return {
          kind: "SubscriptAssign",
          obj: expr.obj,
          index: expr.index,
          value,
        };
      }
      if (expr.kind !== "Name") throw new Error("Invalid assignment target");
      const value = this.parseExpression();
      this.consumeNewline();
      return { kind: "Assign", target: expr.name, value };
    }

    const augOps = ["+=", "-=", "*=", "/="];
    for (const op of augOps) {
      if (this.matchOperator(op)) {
        if (expr.kind !== "Name") throw new Error("Invalid assignment target");
        const value = this.parseExpression();
        this.consumeNewline();
        return { kind: "AugAssign", target: expr.name, op, value };
      }
    }

    this.consumeNewline();
    return { kind: "ExprStatement", expr };
  }

  parseExpression(): Expr {
    const expr = this.parseOr();
    if (this.checkOperator(",")) {
      const items: Expr[] = [expr];
      while (this.matchOperator(",")) {
        items.push(this.parseOr());
      }
      return { kind: "ListLiteral", items };
    }
    return expr;
  }

  parseExpressionExternal(): Expr {
    return this.parseExpression();
  }

  private parseOr(): Expr {
    let expr = this.parseAnd();
    while (this.matchKeyword("or")) {
      const right = this.parseAnd();
      expr = { kind: "BoolOp", op: "or", left: expr, right };
    }
    return expr;
  }

  private parseAnd(): Expr {
    let expr = this.parseNot();
    while (this.matchKeyword("and")) {
      const right = this.parseNot();
      expr = { kind: "BoolOp", op: "and", left: expr, right };
    }
    return expr;
  }

  private parseNot(): Expr {
    if (this.matchKeyword("not")) {
      const right = this.parseNot();
      return { kind: "UnaryOp", op: "not", value: right };
    }
    return this.parseBitwiseOr();
  }

  private parseBitwiseOr(): Expr {
    let expr = this.parseBitwiseXor();
    while (this.matchOperator("|")) {
      expr = {
        kind: "BinOp",
        op: "|",
        left: expr,
        right: this.parseBitwiseXor(),
      };
    }
    return expr;
  }

  private parseBitwiseXor(): Expr {
    let expr = this.parseBitwiseAnd();
    while (this.matchOperator("^")) {
      expr = {
        kind: "BinOp",
        op: "^",
        left: expr,
        right: this.parseBitwiseAnd(),
      };
    }
    return expr;
  }

  private parseBitwiseAnd(): Expr {
    let expr = this.parseShift();
    while (this.matchOperator("&")) {
      expr = { kind: "BinOp", op: "&", left: expr, right: this.parseShift() };
    }
    return expr;
  }

  private parseShift(): Expr {
    let expr = this.parseComparison();
    while (true) {
      if (this.matchOperator("<<")) {
        expr = {
          kind: "BinOp",
          op: "<<",
          left: expr,
          right: this.parseComparison(),
        };
      } else if (this.matchOperator(">>")) {
        expr = {
          kind: "BinOp",
          op: ">>",
          left: expr,
          right: this.parseComparison(),
        };
      } else {
        break;
      }
    }
    return expr;
  }

  private parseComparison(): Expr {
    let expr = this.parseAddSub();
    const ops = ["==", "!=", "<", ">", "<=", ">="];
    while (true) {
      let matchedOp: string | null = null;
      for (const op of ops) {
        if (this.checkOperator(op)) {
          matchedOp = op;
          this.advance();
          break;
        }
      }
      if (!matchedOp) {
        if (this.matchKeyword("is")) {
          if (this.matchKeyword("not")) {
            matchedOp = "is not";
          } else {
            matchedOp = "is";
          }
        } else if (this.matchKeyword("not")) {
          if (this.matchKeyword("in")) {
            matchedOp = "not in";
          } else {
            throw new Error("Expect 'in' after 'not'");
          }
        } else if (this.matchKeyword("in")) {
          matchedOp = "in";
        }
      }
      if (!matchedOp) break;
      const right = this.parseAddSub();
      expr = { kind: "Compare", op: matchedOp, left: expr, right };
    }
    return expr;
  }

  private parseAddSub(): Expr {
    let expr = this.parseMulDiv();
    while (true) {
      if (this.matchOperator("+")) {
        expr = {
          kind: "BinOp",
          op: "+",
          left: expr,
          right: this.parseMulDiv(),
        };
      } else if (this.matchOperator("-")) {
        expr = {
          kind: "BinOp",
          op: "-",
          left: expr,
          right: this.parseMulDiv(),
        };
      } else {
        break;
      }
    }
    return expr;
  }

  private parseMulDiv(): Expr {
    let expr = this.parsePower();
    while (true) {
      if (this.matchOperator("*")) {
        expr = { kind: "BinOp", op: "*", left: expr, right: this.parsePower() };
      } else if (this.matchOperator("/")) {
        expr = { kind: "BinOp", op: "/", left: expr, right: this.parsePower() };
      } else if (this.matchOperator("//")) {
        expr = {
          kind: "BinOp",
          op: "//",
          left: expr,
          right: this.parsePower(),
        };
      } else if (this.matchOperator("%")) {
        expr = { kind: "BinOp", op: "%", left: expr, right: this.parsePower() };
      } else {
        break;
      }
    }
    return expr;
  }

  private parsePower(): Expr {
    let expr = this.parseUnary();
    while (this.matchOperator("**")) {
      expr = { kind: "BinOp", op: "**", left: expr, right: this.parseUnary() };
    }
    return expr;
  }

  private parseUnary(): Expr {
    if (this.matchOperator("-")) {
      return { kind: "UnaryOp", op: "-", value: this.parseUnary() };
    }
    if (this.matchOperator("~")) {
      return { kind: "UnaryOp", op: "~", value: this.parseUnary() };
    }
    return this.parseCallOrAttribute();
  }

  private parseCallOrAttribute(): Expr {
    let expr = this.parsePrimary();

    while (true) {
      if (this.matchOperator("(")) {
        const args: Array<{ name?: string; expr: Expr }> = [];
        if (!this.checkOperator(")")) {
          do {
            let argName: string | undefined;
            if (
              this.checkType("IDENTIFIER") &&
              this.peekNext()?.type === "OPERATOR" &&
              this.peekNext()?.value === "="
            ) {
              argName = this.advance().value;
              this.consumeOperator("=", "Expect '=' after keyword name");
            }
            args.push({ name: argName, expr: this.parseOr() });
          } while (this.matchOperator(","));
        }
        this.consumeOperator(")", "Expect ')' after call arguments");
        if (expr.kind === "Name") {
          expr = { kind: "Call", callee: expr.name, args };
        } else if (expr.kind === "Attribute") {
          expr = {
            kind: "AttributeCall",
            obj: expr.obj,
            method: expr.attr,
            args,
          };
        } else {
          throw new Error("Invalid call target");
        }
      } else if (this.matchOperator("[")) {
        const index = this.parseSubscriptIndex();
        this.consumeOperator("]", "Expect ']' after subscript index");
        expr = { kind: "Subscript", obj: expr, index };
      } else if (this.matchOperator(".")) {
        const attr = this.consume("IDENTIFIER", "Expect attribute name").value;
        expr = { kind: "Attribute", obj: expr, attr };
      } else {
        break;
      }
    }

    return expr;
  }

  private parseSubscriptIndex(): Expr {
    let start: Expr | null = null;
    let end: Expr | null = null;
    let step: Expr | null = null;

    if (this.checkOperator(":")) {
      this.consumeOperator(":", "Expect ':'");
      if (!this.checkOperator("]") && !this.checkOperator(":")) {
        end = this.parseOr();
      }
      if (this.matchOperator(":")) {
        step = this.parseOr();
      }
      return { kind: "Slice", start, end, step };
    }

    const first = this.parseOr();
    if (this.matchOperator(":")) {
      start = first;
      if (!this.checkOperator("]") && !this.checkOperator(":")) {
        end = this.parseOr();
      }
      if (this.matchOperator(":")) {
        step = this.parseOr();
      }
      return { kind: "Slice", start, end, step };
    }

    return first;
  }

  private parsePrimary(): Expr {
    if (this.matchKeyword("True")) return { kind: "Literal", value: true };
    if (this.matchKeyword("False")) return { kind: "Literal", value: false };
    if (this.matchKeyword("None")) return { kind: "Literal", value: null };

    if (this.checkType("NUMBER")) {
      const val = Number(this.advance().value);
      return { kind: "Literal", value: val };
    }

    if (this.checkType("STRING")) {
      const raw = this.advance().value;
      const val = unescapePythonString(raw);
      return { kind: "Literal", value: val };
    }

    if (this.checkType("FSTRING")) {
      const raw = this.advance().value;
      const val = unescapePythonString(raw);
      return { kind: "Literal", value: val, isFString: true } as any;
    }

    if (this.checkType("IDENTIFIER")) {
      const name = this.advance().value;
      return { kind: "Name", name };
    }

    if (this.matchOperator("(")) {
      const expr = this.parseExpression();
      this.consumeOperator(")", "Expect ')' after expression");
      return expr;
    }

    if (this.matchOperator("[")) {
      if (this.matchOperator("]")) {
        return { kind: "ListLiteral", items: [] };
      }
      const firstExpr = this.parseOr();
      if (this.matchKeyword("for")) {
        const varName = this.consume(
          "IDENTIFIER",
          "Expect variable name after 'for'",
        ).value;
        this.consumeKeyword("in", "Expect 'in' after variable name");
        const collection = this.parseExpression();
        this.consumeOperator(
          "]",
          "Expect ']' at the end of list comprehension",
        );
        return {
          kind: "ListComprehension",
          generator: firstExpr,
          varName,
          collection,
        };
      }
      const items: Expr[] = [firstExpr];
      while (this.matchOperator(",")) {
        if (this.checkOperator("]")) break;
        items.push(this.parseOr());
      }
      this.consumeOperator("]", "Expect ']' after list literal");
      return { kind: "ListLiteral", items };
    }

    throw new Error(`Unexpected token: ${JSON.stringify(this.peek())}`);
  }

  private checkType(type: Token["type"]): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private matchType(type: Token["type"]): boolean {
    if (this.checkType(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkKeyword(val: string): boolean {
    return this.checkType("KEYWORD") && this.peek().value === val;
  }

  private matchKeyword(val: string): boolean {
    if (this.checkKeyword(val)) {
      this.advance();
      return true;
    }
    return false;
  }

  private checkOperator(val: string): boolean {
    return this.checkType("OPERATOR") && this.peek().value === val;
  }

  private matchOperator(val: string): boolean {
    if (this.checkOperator(val)) {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(type: Token["type"], msg: string): Token {
    if (this.checkType(type)) return this.advance();
    throw new Error(`${msg} at token: ${JSON.stringify(this.peek())}`);
  }

  private consumeOperator(val: string, msg: string): Token {
    if (this.checkOperator(val)) return this.advance();
    throw new Error(`${msg} at token: ${JSON.stringify(this.peek())}`);
  }

  private consumeKeyword(val: string, msg: string): Token {
    if (this.checkKeyword(val)) return this.advance();
    throw new Error(`${msg} at token: ${JSON.stringify(this.peek())}`);
  }

  private consumeNewline() {
    while (this.matchType("NEWLINE"));
  }

  private skipToNewline() {
    while (!this.isAtEnd() && this.peek().type !== "NEWLINE") {
      this.advance();
    }
    this.consumeNewline();
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private peekNext(): Token | null {
    if (this.current + 1 >= this.tokens.length) return null;
    return this.tokens[this.current + 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }
}

// -----------------------------------------------------------------------------
// Interpreter & Execution
// -----------------------------------------------------------------------------

/** Multiplies two operands with Python semantics, supporting string and list repetition. */
export function pythonMultiply(a: any, b: any): any {
  if (typeof a === "string" && typeof b === "number") {
    const count = Math.floor(b);
    return count > 0 ? a.repeat(count) : "";
  }
  if (typeof b === "string" && typeof a === "number") {
    const count = Math.floor(a);
    return count > 0 ? b.repeat(count) : "";
  }
  if (Array.isArray(a) && typeof b === "number") {
    const count = Math.floor(b);
    if (count <= 0) return [];
    const res: any[] = [];
    for (let i = 0; i < count; i++) {
      res.push(...a);
    }
    return res;
  }
  if (Array.isArray(b) && typeof a === "number") {
    const count = Math.floor(a);
    if (count <= 0) return [];
    const res: any[] = [];
    for (let i = 0; i < count; i++) {
      res.push(...b);
    }
    return res;
  }
  return a * b;
}

export class MicroPythonInterpreter {
  private state: SimSessionState;
  private scopes: Array<Map<string, any>> = [new Map()];
  private globalsSet: Set<string> = new Set();

  constructor(state: SimSessionState) {
    this.state = state;
    for (const [name, val] of state.variables.entries()) {
      this.scopes[0].set(name, val);
    }
  }

  execute(nodes: ASTNode[]) {
    for (let i = 0; i < nodes.length; i++) {
      try {
        this.executeNode(nodes[i]);
      } catch (e) {
        if (e instanceof SleepSignal) {
          e.remainingStatements = [
            ...e.remainingStatements,
            ...nodes.slice(i + 1),
          ];
          throw e;
        }
        throw e;
      }
    }
  }

  private executeNode(node: ASTNode) {
    switch (node.kind) {
      case "Assign": {
        const val = this.evaluate(node.value);
        this.setVariable(node.target, val);
        break;
      }
      case "AugAssign": {
        const current = this.getVariable(node.target) ?? 0;
        const delta = this.evaluate(node.value);
        let next = current;
        if (node.op === "+=") next = current + delta;
        else if (node.op === "-=") next = current - delta;
        else if (node.op === "*=") next = pythonMultiply(current, delta);
        else if (node.op === "/=") next = current / delta;
        this.setVariable(node.target, next);
        break;
      }
      case "If": {
        const conditionMet = this.evaluate(node.condition);
        if (conditionMet) {
          this.execute(node.thenBranch);
        } else {
          let matched = false;
          for (const branch of node.elifBranches) {
            if (this.evaluate(branch.cond)) {
              this.execute(branch.body);
              matched = true;
              break;
            }
          }
          if (!matched && node.elseBranch) {
            this.execute(node.elseBranch);
          }
        }
        break;
      }
      case "While": {
        let iteration = 0;
        while (this.evaluate(node.condition)) {
          if (iteration >= MAX_LOOP_ITERATIONS) {
            break;
          }
          try {
            this.execute(node.body);
          } catch (e: any) {
            if (e.message === "Break") break;
            if (e.message === "Continue") {
              iteration++;
              continue;
            }
            throw e;
          }
          iteration++;
        }
        break;
      }
      case "For": {
        let iteration = 0;
        if (node.isRange) {
          const startVal = this.evaluate(node.start!);
          const endVal = this.evaluate(node.end!);
          const stepVal = node.step ? this.evaluate(node.step) : 1;

          if (stepVal > 0) {
            for (let i = startVal; i < endVal; i += stepVal) {
              if (iteration >= MAX_LOOP_ITERATIONS) {
                break;
              }
              this.setVariable(node.varName, i);
              try {
                this.execute(node.body);
              } catch (e: any) {
                if (e.message === "Break") break;
                if (e.message === "Continue") {
                  iteration++;
                  continue;
                }
                throw e;
              }
              iteration++;
            }
          } else if (stepVal < 0) {
            for (let i = startVal; i > endVal; i += stepVal) {
              if (iteration >= MAX_LOOP_ITERATIONS) {
                break;
              }
              this.setVariable(node.varName, i);
              try {
                this.execute(node.body);
              } catch (e: any) {
                if (e.message === "Break") break;
                if (e.message === "Continue") {
                  iteration++;
                  continue;
                }
                throw e;
              }
              iteration++;
            }
          }
        } else {
          const items = this.evaluate(node.collection);
          if (Array.isArray(items) || typeof items === "string") {
            for (const item of items) {
              if (iteration >= MAX_LOOP_ITERATIONS) {
                break;
              }
              this.setVariable(node.varName, item);
              try {
                this.execute(node.body);
              } catch (e: any) {
                if (e.message === "Break") break;
                if (e.message === "Continue") {
                  iteration++;
                  continue;
                }
                throw e;
              }
              iteration++;
            }
          }
        }
        break;
      }
      case "FunctionDef": {
        this.setVariable(node.name, {
          type: "Function",
          name: node.name,
          params: node.params,
          body: node.body,
        });
        break;
      }
      case "Return": {
        const val = node.value ? this.evaluate(node.value) : null;
        const err = new Error("Return");
        (err as any).returnValue = val;
        throw err;
      }
      case "Break":
        throw new Error("Break");
      case "Continue":
        throw new Error("Continue");
      case "Global":
        this.globalsSet.add(node.varName);
        break;
      case "Raise": {
        const val = node.expr ? this.evaluate(node.expr) : "RuntimeError";
        throw new Error(typeof val === "string" ? val : String(val));
      }
      case "Try": {
        let caughtError: any = null;
        try {
          this.execute(node.tryBody);
        } catch (e: any) {
          if (
            e.message === "Return" ||
            e.message === "Break" ||
            e.message === "Continue"
          ) {
            caughtError = e;
          } else {
            let caught = false;
            for (const handler of node.excepts) {
              if (
                !handler.errorClass ||
                e.message === handler.errorClass ||
                (e.name && e.name === handler.errorClass)
              ) {
                if (handler.alias) {
                  this.setVariable(handler.alias, e.message ?? String(e));
                }
                try {
                  this.execute(handler.body);
                } catch (errInExcept: any) {
                  caughtError = errInExcept;
                }
                caught = true;
                break;
              }
            }
            if (!caught) {
              caughtError = e;
            }
          }
        } finally {
          if (node.finallyBody) {
            try {
              this.execute(node.finallyBody);
            } catch (errInFinally: any) {
              caughtError = errInFinally;
            }
          }
        }
        if (caughtError) {
          throw caughtError;
        }
        break;
      }
      case "SubscriptAssign": {
        const obj = this.evaluate(node.obj);
        const idx = this.evaluate(node.index);
        const val = this.evaluate(node.value);
        if (Array.isArray(obj)) {
          obj[idx] = val;
        } else if (obj && obj.type === "NeoPixel") {
          if (idx >= 0 && idx < obj.count) {
            const r = Math.max(0, Math.min(255, Math.round(val?.[0] ?? 0)));
            const g = Math.max(0, Math.min(255, Math.round(val?.[1] ?? 0)));
            const b = Math.max(0, Math.min(255, Math.round(val?.[2] ?? 0)));
            obj.pixels[idx] = [r, g, b];
          }
        }
        break;
      }
      case "TupleAssign": {
        const val = this.evaluate(node.value);
        if (Array.isArray(val)) {
          for (let i = 0; i < node.targets.length; i++) {
            this.setVariable(node.targets[i], val[i]);
          }
        }
        break;
      }
      case "ExprStatement":
        this.evaluate(node.expr);
        break;
    }
  }

  evaluate(expr: Expr): any {
    switch (expr.kind) {
      case "Literal": {
        if ((expr as any).isFString && typeof expr.value === "string") {
          const rawStr = expr.value;
          return rawStr.replace(/{([^{}]+)}/g, (_, inner) => {
            try {
              let exprStr = inner.trim();
              let formatSpec = "";
              const colonIdx = exprStr.indexOf(":");
              if (colonIdx !== -1) {
                formatSpec = exprStr.slice(colonIdx + 1).trim();
                exprStr = exprStr.slice(0, colonIdx).trim();
              }
              const innerTokens = new MicroPythonTokenizer(exprStr).tokenize();
              const innerParser = new MicroPythonParser(innerTokens);
              const parsedExpr = innerParser.parseExpressionExternal();
              const val = this.evaluate(parsedExpr);
              if (formatSpec && typeof val === "number") {
                const match = formatSpec.match(/\.(\d+)f/);
                if (match) {
                  return val.toFixed(Number(match[1]));
                }
              }
              return String(val);
            } catch {
              return "";
            }
          });
        }
        return expr.value;
      }
      case "Name":
        return this.getVariable(expr.name);
      case "UnaryOp": {
        const val = this.evaluate(expr.value);
        if (expr.op === "not") return val > 0 ? 0 : 1;
        if (expr.op === "-") return -val;
        if (expr.op === "~") return ~val;
        return val;
      }
      case "BinOp": {
        const left = this.evaluate(expr.left);
        const right = this.evaluate(expr.right);
        if (expr.op === "+") return left + right;
        if (expr.op === "-") return left - right;
        if (expr.op === "*") return pythonMultiply(left, right);
        if (expr.op === "/") return left / right;
        if (expr.op === "//") return Math.floor(left / right);
        if (expr.op === "%") return left % right;
        if (expr.op === "**") return Math.pow(left, right);
        if (expr.op === "&") return left & right;
        if (expr.op === "|") {
          if (String(left).includes("IRQ") || String(right).includes("IRQ")) {
            return `${left} | ${right}`;
          }
          return left | right;
        }
        if (expr.op === "^") return left ^ right;
        if (expr.op === "<<") return left << right;
        if (expr.op === ">>") return left >> right;
        return 0;
      }
      case "BoolOp": {
        const left = this.evaluate(expr.left);
        if (expr.op === "or") {
          return left || this.evaluate(expr.right);
        } else {
          return left && this.evaluate(expr.right);
        }
      }
      case "Compare": {
        const left = this.evaluate(expr.left);
        const right = this.evaluate(expr.right);
        if (expr.op === "==" || expr.op === "is") return left === right ? 1 : 0;
        if (expr.op === "!=" || expr.op === "is not")
          return left !== right ? 1 : 0;
        if (expr.op === "in")
          return Array.isArray(right) || typeof right === "string"
            ? right.includes(left)
              ? 1
              : 0
            : 0;
        if (expr.op === "not in")
          return Array.isArray(right) || typeof right === "string"
            ? !right.includes(left)
              ? 1
              : 0
            : 1;
        if (expr.op === "<") return left < right ? 1 : 0;
        if (expr.op === ">") return left > right ? 1 : 0;
        if (expr.op === "<=") return left <= right ? 1 : 0;
        if (expr.op === ">=") return left >= right ? 1 : 0;
        return 0;
      }
      case "Call": {
        return this.callFunction(
          expr.callee,
          expr.args.map((a) => ({
            name: a.name,
            value: this.evaluate(a.expr),
          })),
        );
      }
      case "AttributeCall": {
        const objName = expr.obj.kind === "Name" ? expr.obj.name : null;
        const objVal = this.evaluate(expr.obj);
        return this.callAttribute(
          objVal,
          objName,
          expr.method,
          expr.args.map((a) => ({
            name: a.name,
            value: this.evaluate(a.expr),
          })),
        );
      }
      case "Subscript": {
        const obj = this.evaluate(expr.obj);
        const idx = this.evaluate(expr.index);
        if (typeof idx === "object" && idx !== null && idx.type === "slice") {
          if (Array.isArray(obj) || typeof obj === "string") {
            const start = idx.start !== null ? idx.start : 0;
            const end = idx.end !== null ? idx.end : obj.length;
            return obj.slice(start, end);
          }
          return null;
        }
        if (Array.isArray(obj) || typeof obj === "string") {
          return obj[idx];
        }
        return null;
      }
      case "Slice": {
        const start = expr.start ? this.evaluate(expr.start) : null;
        const end = expr.end ? this.evaluate(expr.end) : null;
        const step = expr.step ? this.evaluate(expr.step) : null;
        return { type: "slice", start, end, step };
      }
      case "ListLiteral": {
        return expr.items.map((item) => this.evaluate(item));
      }
      case "ListComprehension": {
        const collection = this.evaluate(expr.collection);
        const result: any[] = [];
        if (Array.isArray(collection)) {
          const oldVal = this.getVariable(expr.varName);
          for (const item of collection) {
            this.setVariable(expr.varName, item);
            result.push(this.evaluate(expr.generator));
          }
          if (oldVal !== undefined) {
            this.setVariable(expr.varName, oldVal);
          } else {
            this.scopes[this.scopes.length - 1].delete(expr.varName);
          }
        }
        return result;
      }
      case "Attribute": {
        const objName = (expr.obj as any).name;
        const objVal = this.evaluate(expr.obj);
        if (objVal && typeof objVal === "object" && expr.attr in objVal) {
          return objVal[expr.attr];
        }
        if (objName === "Pin") {
          if (expr.attr === "OUT") return "OUT";
          if (expr.attr === "IN") return "IN";
          if (expr.attr === "PULL_UP") return "PULL_UP";
          if (expr.attr === "PULL_DOWN") return "PULL_DOWN";
          if (expr.attr === "IRQ_RISING") return "IRQ_RISING";
          if (expr.attr === "IRQ_FALLING") return "IRQ_FALLING";
        }
        if (objName === "ADC") {
          if (expr.attr === "ATTN_11DB") return 3;
          if (expr.attr === "ATTN_6DB") return 2;
          if (expr.attr === "ATTN_2_5DB") return 1;
          if (expr.attr === "ATTN_0DB") return 0;
          if (expr.attr === "WIDTH_12BIT") return 12;
          if (expr.attr === "WIDTH_11BIT") return 11;
          if (expr.attr === "WIDTH_10BIT") return 10;
          if (expr.attr === "WIDTH_9BIT") return 9;
        }
        if (objName === "Timer") {
          if (expr.attr === "PERIODIC") return "PERIODIC";
          if (expr.attr === "ONE_SHOT") return "ONE_SHOT";
        }
        if (
          objName === "ir_remote" ||
          objName === "IRReceiver" ||
          objName === "NEC_8" ||
          objName === "NEC_16"
        ) {
          if (expr.attr in NEC_COMMANDS) return NEC_COMMANDS[expr.attr];
        }
        if (expr.attr in NEC_COMMANDS) {
          return NEC_COMMANDS[expr.attr];
        }
        if (objName === "board") {
          return expr.attr;
        }
        return 0;
      }
    }
  }

  callFunction(name: string, args: Array<{ name?: string; value: any }>): any {
    const rawArgs = args.map((a) => a.value);

    if (name === "print") {
      const positional = args
        .filter((a) => a.name !== "sep" && a.name !== "end")
        .map((a) => a.value);
      const sep = args.find((a) => a.name === "sep")?.value ?? " ";
      const end = args.find((a) => a.name === "end")?.value ?? "\n";
      const formatted = positional
        .map((arg) =>
          arg === null || arg === undefined ? "None" : String(arg),
        )
        .join(String(sep));

      processSerialStream(this.state, formatted + String(end));
      return null;
    }
    if (name === "range") {
      const start = rawArgs.length > 1 ? rawArgs[0] : 0;
      const stop = rawArgs.length > 1 ? rawArgs[1] : rawArgs[0];
      const step = rawArgs[2] ?? 1;
      const result: number[] = [];
      if (step > 0) {
        for (let i = start; i < stop; i += step) {
          result.push(i);
        }
      } else if (step < 0) {
        for (let i = start; i > stop; i += step) {
          result.push(i);
        }
      }
      return result;
    }
    if (name === "sleep" || name === "sleep_ms" || name === "sleep_us") {
      const ms =
        name === "sleep"
          ? rawArgs[0] * 1000
          : name === "sleep_us"
            ? rawArgs[0] / 1000
            : rawArgs[0];
      // SleepSignal unwinds the whole stack and resumes from a flattened list
      // of "remaining statements" — which cannot carry a pending `return` value
      // back to the caller. So a `sleep` inside a value-returning helper
      // (e.g. keypad debounce: `if pressed: sleep_ms(50); ...; return key`)
      // silently makes the helper return None. When we're executing inside a
      // user function (scope depth > 1), skip the suspend and only accumulate
      // the delay for outer-loop pacing, so the helper runs to its `return`.
      this.state.loopWaitRemaining = Math.max(this.state.loopWaitRemaining, ms);
      if (this.scopes.length > 1) return null;
      throw new SleepSignal(ms);
    }
    if (name === "ticks_ms") {
      return this.state.lastTimestamp;
    }
    if (name === "ticks_us") {
      return this.state.lastTimestamp * 1000;
    }
    if (name === "ticks_diff") {
      return rawArgs[0] - rawArgs[1];
    }
    if (name === "ticks_add") {
      return rawArgs[0] + rawArgs[1];
    }
    if (name === "bytes") {
      const arg = rawArgs[0];
      if (Array.isArray(arg)) {
        return arg;
      }
      if (typeof arg === "string") {
        return Array.from(arg).map((c) => c.charCodeAt(0));
      }
      if (typeof arg === "number") {
        return Array(arg).fill(0);
      }
      return [];
    }
    if (name === "len") return rawArgs[0]?.length ?? 0;
    if (name === "abs") return Math.abs(rawArgs[0]);
    if (name === "min") return Math.min(...rawArgs);
    if (name === "max") return Math.max(...rawArgs);
    if (name === "round") {
      const val = rawArgs[0];
      const ndigits = rawArgs[1];

      if (typeof val !== "number" || isNaN(val)) return val;

      if (ndigits === undefined || ndigits === null) {
        return Math.round(val);
      }

      const factor = Math.pow(10, ndigits);
      return (
        Math.round((val + Number.EPSILON * Math.sign(val)) * factor) / factor
      );
    }
    if (name === "str") return String(rawArgs[0]);
    if (name === "int") return parseInt(rawArgs[0], 10);
    if (name === "float") return parseFloat(rawArgs[0]);
    if (name === "bool") return !!rawArgs[0];
    if (name === "ord") {
      const val = rawArgs[0];
      if (typeof val === "string" && val.length > 0) {
        return val.charCodeAt(0);
      }
      return 0;
    }
    if (name === "chr") {
      return String.fromCharCode(rawArgs[0]);
    }
    if (name === "hex") {
      const val = rawArgs[0];
      if (typeof val === "number") {
        return "0x" + val.toString(16);
      }
      return "0x0";
    }

    if (name === "Pin") {
      let pinNum = rawArgs[0];
      // Named LED Pin conversion (B11)
      if (typeof pinNum === "string") {
        if (pinNum.toUpperCase() === "LED") pinNum = 25;
        else pinNum = parseInt(pinNum, 10);
      }

      // Handle keyword args in Pin construction (B10)
      const modeArg =
        args.find((a) => a.name === "mode")?.value ?? rawArgs[1] ?? "IN";
      const pullArg =
        args.find((a) => a.name === "pull")?.value ?? rawArgs[2] ?? null;

      // ESP32 input-only GPI pins check (GPIO 34, 35, 36, 39)
      const isInputOnlyPin =
        this.state.boardType === "esp32" &&
        typeof pinNum === "number" &&
        (pinNum === 34 || pinNum === 35 || pinNum === 36 || pinNum === 39);
      if (isInputOnlyPin && modeArg === "OUT") {
        this.state.serialLines.push(
          `>>> ValueError: Pin(${pinNum}) doesn't have an output driver (input-only pin)`,
        );
      }

      const pinMode = isInputOnlyPin
        ? "INPUT"
        : pullArg === "PULL_UP"
          ? "INPUT_PULLUP"
          : modeArg === "OUT"
            ? "OUTPUT"
            : "INPUT";
      const initialValue = pinMode === "INPUT_PULLUP" ? 255 : 0;
      if (
        !this.state.preservePreSeededPinStates ||
        !this.state.pins.has(pinNum)
      ) {
        this.state.pins.set(pinNum, { mode: pinMode, value: initialValue });
      }
      this.state.outputs.push({ pin: pinNum, high: false });
      return { type: "Pin", pin: pinNum };
    }
    if (name === "ADC") {
      const pinObj = rawArgs[0];
      let pinNum =
        typeof pinObj === "object" && pinObj.type === "Pin"
          ? pinObj.pin
          : pinObj;
      if (typeof pinNum === "number" && pinNum >= 0 && pinNum <= 2) {
        pinNum = 26 + pinNum;
      }
      this.state.pins.set(pinNum, { mode: "INPUT", value: 0 });
      return { type: "ADC", pin: pinNum };
    }
    if (name === "PWM") {
      const pinObj = rawArgs[0];
      const pinNum =
        typeof pinObj === "object" && pinObj.type === "Pin"
          ? pinObj.pin
          : pinObj;
      let pwmState = this.state.pwm.get(pinNum);
      if (!pwmState) {
        pwmState = { dutyU16: 0, freqHz: 0 };
        this.state.pwm.set(pinNum, pwmState);
      }
      const freqArg =
        args.find((a) => a.name === "freq")?.value ??
        (typeof rawArgs[1] === "number" ? rawArgs[1] : undefined);
      if (typeof freqArg === "number") {
        pwmState.freqHz = freqArg;
      }
      const dutyU16Arg = args.find((a) => a.name === "duty_u16")?.value;
      const dutyArg =
        args.find((a) => a.name === "duty")?.value ??
        (typeof rawArgs[2] === "number" ? rawArgs[2] : undefined);
      let val = 0;
      if (typeof dutyU16Arg === "number") {
        pwmState.dutyU16 = dutyU16Arg;
        val = Math.max(
          0,
          Math.min(255, Math.round((dutyU16Arg / 65535) * 255)),
        );
      } else if (typeof dutyArg === "number") {
        const duty10 = Math.max(0, Math.min(1023, dutyArg));
        pwmState.dutyU16 = Math.round((duty10 / 1023) * 65535);
        val = Math.max(0, Math.min(255, Math.round((duty10 / 1023) * 255)));
      }
      this.setPinState(pinNum, val > 0);
      const pState = this.state.pins.get(pinNum);
      if (pState) {
        pState.mode = "OUTPUT";
        pState.value = val;
      } else {
        this.state.pins.set(pinNum, { mode: "OUTPUT", value: val });
      }
      return { type: "PWM", pin: pinNum };
    }
    if (name === "I2C" || name === "SoftI2C") {
      const bus = name === "SoftI2C" ? -1 : rawArgs[0];
      const sdaArg =
        args.find((a) => a.name === "sda")?.value ??
        (name === "SoftI2C" ? rawArgs[0] : rawArgs[1]);
      const sclArg =
        args.find((a) => a.name === "scl")?.value ??
        (name === "SoftI2C" ? rawArgs[1] : rawArgs[2]);
      const sdaPin =
        typeof sdaArg === "object" && sdaArg?.type === "Pin"
          ? sdaArg.pin
          : undefined;
      const sclPin =
        typeof sclArg === "object" && sclArg?.type === "Pin"
          ? sclArg.pin
          : undefined;
      return { type: "I2C", bus, sdaPin, sclPin };
    }
    if (name === "I2cLcd") {
      const i2cObj = rawArgs[0];
      const addrArg = rawArgs[1];
      let address = 0x27;
      if (typeof addrArg === "number") {
        address = addrArg;
      } else if (typeof addrArg === "string") {
        address = addrArg.startsWith("0x")
          ? parseInt(addrArg.slice(2), 16)
          : parseInt(addrArg, 10);
      }
      return {
        type: "I2cLcd",
        address: isNaN(address) ? 0x27 : address,
        declaredSdaPin:
          typeof i2cObj?.sdaPin === "number" ? i2cObj.sdaPin : undefined,
        declaredSclPin:
          typeof i2cObj?.sclPin === "number" ? i2cObj.sclPin : undefined,
      };
    }
    if (name === "NeoPixel") {
      const pinObj = args.find((a) => a.name === "pin")?.value ?? rawArgs[0];
      const count = args.find((a) => a.name === "n")?.value ?? rawArgs[1] ?? 1;
      const pinNumber =
        typeof pinObj === "number"
          ? pinObj
          : typeof pinObj?.pin === "number"
            ? pinObj.pin
            : undefined;

      // Check ESP32 pin guards
      if (this.state.boardType === "esp32" && typeof pinNumber === "number") {
        if (pinNumber >= 6 && pinNumber <= 11) {
          this.state.serialLines.push(
            `>>> ValueError: Pin(${pinNumber}) reserved for internal SPI flash memory`,
          );
        } else if (
          pinNumber === 34 ||
          pinNumber === 35 ||
          pinNumber === 36 ||
          pinNumber === 39
        ) {
          this.state.serialLines.push(
            `>>> ValueError: Pin(${pinNumber}) doesn't have an output driver (input-only pin)`,
          );
        }
      }

      return {
        type: "NeoPixel",
        pin: pinNumber,
        count: count,
        pixels: Array.from({ length: count }, () => [0, 0, 0]),
        writeCalled: false,
      };
    }
    if (name === "IRReceiver" || name === "NEC_8" || name === "NEC_16") {
      const pinObj = args.find((a) => a.name === "pin")?.value ?? rawArgs[0];
      const pinNumber =
        typeof pinObj === "number"
          ? pinObj
          : typeof pinObj?.pin === "number"
            ? pinObj.pin
            : undefined;

      // Check ESP32 pin guards: GPIO 6-11 are reserved for internal SPI flash memory
      if (
        this.state.boardType === "esp32" &&
        typeof pinNumber === "number" &&
        pinNumber >= 6 &&
        pinNumber <= 11
      ) {
        this.state.serialLines.push(
          `>>> ValueError: Pin(${pinNumber}) reserved for internal SPI flash memory`,
        );
      }

      const callback =
        args.find((a) => a.name === "callback")?.value ?? rawArgs[1] ?? null;

      if (typeof pinNumber === "number" && callback) {
        if (!this.state.irReceivers) this.state.irReceivers = [];
        this.state.irReceivers.push({ pin: pinNumber, callback });
      }

      return {
        type: "IRReceiver",
        pin: pinNumber,
        callback,
      };
    }
    if (name === "UART") {
      return { type: "UART", id: rawArgs[0] };
    }
    if (name === "SPI") {
      return { type: "SPI", id: rawArgs[0] };
    }
    if (name === "Timer") {
      const timerObj = { type: "Timer", id: Math.random().toString() };
      this.state.variables.set(timerObj.id, timerObj);
      return timerObj;
    }
    if (name === "WDT") {
      const timeout = rawArgs[0] ?? 5000;
      this.state.wdtTimeout = timeout;
      this.state.wdtAccumulator = 0;
      return { type: "WDT" };
    }
    if (name === "RTC") {
      return { type: "RTC" };
    }
    if (name === "time_pulse_us") {
      const echoPinObj = rawArgs[0];
      const echoPinNum =
        typeof echoPinObj === "object" && echoPinObj.type === "Pin"
          ? echoPinObj.pin
          : echoPinObj;
      const timeout = rawArgs[2] ?? 30000; // Default timeout 30ms

      const nodes = useCircuitStore.getState().nodes;
      const ultraNode = nodes.find(
        (n) => n.data.componentType === "ultrasonicDistance",
      );
      const distance = ultraNode
        ? Number(ultraNode.data.properties?.distance?.value ?? 100)
        : 100;
      const duration = Math.round((distance * 2) / 0.0343);

      // Return 0 if duration exceeds timeout (simulating no echo received)
      if (duration > timeout || duration <= 0) {
        return 0;
      }

      return duration;
    }
    if (name === "HCSR04" || name === "hcsr04") {
      const trigArg = rawArgs[0];
      const echoArg = rawArgs[1];
      const triggerPin =
        typeof trigArg === "object" && trigArg.type === "Pin"
          ? trigArg.pin
          : trigArg;
      const echoPin =
        typeof echoArg === "object" && echoArg.type === "Pin"
          ? echoArg.pin
          : echoArg;
      return { type: "HCSR04", triggerPin, echoPin };
    }
    if (name === "DHT11" || name === "dht11" || name === "dht.DHT11") {
      const pinArg = rawArgs[0];
      const pin = typeof pinArg === "object" && pinArg.type === "Pin" ? pinArg.pin : pinArg;
      return { type: "DHT11", pin };
    }
    if (name === "DHT22" || name === "dht22" || name === "dht.DHT22") {
      const pinArg = rawArgs[0];
      const pin = typeof pinArg === "object" && pinArg.type === "Pin" ? pinArg.pin : pinArg;
      return { type: "DHT22", pin };
    }

    const func = this.getVariable(name);
    if (func && func.type === "Function") {
      const localScope = new Map<string, any>();
      // Map positional + keyword arguments + default values cleanly (B14/B10)
      for (let i = 0; i < func.params.length; i++) {
        const param = func.params[i];
        let val = undefined;
        const kwArg = args.find((a) => a.name === param.name);
        if (kwArg) {
          val = kwArg.value;
        } else if (i < args.length && !args[i].name) {
          val = args[i].value;
        } else if (param.defaultValue) {
          val = this.evaluate(param.defaultValue);
        }
        localScope.set(param.name, val);
      }

      this.scopes.push(localScope);
      try {
        const interpreter = new MicroPythonInterpreter(this.state);
        interpreter.scopes = this.scopes;
        interpreter.execute(func.body);
        this.scopes.pop();
        return null;
      } catch (e: any) {
        this.scopes.pop();
        if (e.message === "Return") {
          return e.returnValue;
        }
        throw e;
      }
    }
    console.warn(
      "[PICO INTERPRETER WARNING] Function not found or not callable:",
      name,
    );
    return null;
  }

  private getLcdState(objVal: any): LcdState {
    const address = typeof objVal?.address === "number" ? objVal.address : 0x27;
    let lcd = this.state.lcdStates.get(address);
    if (!lcd) {
      lcd = createDefaultLcdState();
      this.state.lcdStates.set(address, lcd);
    }
    if (typeof objVal?.declaredSdaPin === "number") {
      lcd.declaredSdaPin = objVal.declaredSdaPin;
    }
    if (typeof objVal?.declaredSclPin === "number") {
      lcd.declaredSclPin = objVal.declaredSclPin;
    }
    return lcd;
  }

  callAttribute(
    objVal: any,
    objName: string | null,
    method: string,
    args: Array<{ name?: string; value: any }>,
  ): any {
    const rawArgs = args.map((a) => a.value);

    if (
      (objName === "neopixel" || objVal === "neopixel") &&
      method === "NeoPixel"
    ) {
      return this.callFunction("NeoPixel", args);
    }

    if (
      (objName === "ir_remote" ||
        objVal === "ir_remote" ||
        objName === "ir_rx" ||
        objVal === "ir_rx") &&
      (method === "IRReceiver" || method === "NEC_8" || method === "NEC_16")
    ) {
      return this.callFunction(method, args);
    }

    if (objVal && objVal.type === "NeoPixel") {
      if (method === "write") {
        objVal.writeCalled = true;
        // Do not commit to hardware if pin is invalid
        if (this.state.boardType === "esp32" && typeof objVal.pin === "number") {
          const isInvalidPin =
            (objVal.pin >= 6 && objVal.pin <= 11) ||
            objVal.pin === 34 ||
            objVal.pin === 35 ||
            objVal.pin === 36 ||
            objVal.pin === 39;
          if (isInvalidPin) {
            return null;
          }
        }
        if (!this.state.neopixelStates) {
          this.state.neopixelStates = new Map();
        }
        this.state.neopixelStates.set(objVal.pin, {
          pixels: objVal.pixels.map((p: any) => ({
            r: Math.max(0, Math.min(255, Math.round(p?.[0] ?? 0))),
            g: Math.max(0, Math.min(255, Math.round(p?.[1] ?? 0))),
            b: Math.max(0, Math.min(255, Math.round(p?.[2] ?? 0))),
          })),
          timestamp: this.state.lastTimestamp,
        });
        return null;
      }
      if (method === "fill") {
        const val = rawArgs[0] ?? [0, 0, 0];
        const r = Math.max(0, Math.min(255, Math.round(val?.[0] ?? 0)));
        const g = Math.max(0, Math.min(255, Math.round(val?.[1] ?? 0)));
        const b = Math.max(0, Math.min(255, Math.round(val?.[2] ?? 0)));
        objVal.pixels = Array.from({ length: objVal.count }, () => [r, g, b]);
        return null;
      }
    }

    if (objVal && objVal.type === "I2cLcd") {
      const lcd = this.getLcdState(objVal);
      if (method === "clear") {
        if (lcd) {
          lcd.ddram.fill(32);
          lcd.cursor = 0;
        }
        return null;
      }
      if (method === "move_to") {
        const col = rawArgs[0] ?? 0;
        const row = rawArgs[1] ?? 0;
        if (lcd) {
          lcd.cursor = row === 0 ? col : 0x40 + col;
        }
        return null;
      }
      if (method === "putstr") {
        const str = String(rawArgs[0] ?? "");
        if (lcd) {
          for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i);
            if (charCode === 10) {
              // \n
              const col = lcd.cursor & 0x3f;
              lcd.cursor = lcd.cursor >= 0x40 ? 0 : 0x40;
            } else {
              if (lcd.cursor < 80) {
                lcd.ddram[lcd.cursor] = charCode;
                lcd.cursor++;
              }
            }
          }
        }
        return null;
      }
      if (method === "putchar") {
        const char = rawArgs[0] !== undefined ? String(rawArgs[0]) : "";
        if (lcd && char.length > 0) {
          const charCode = char.charCodeAt(0);
          if (lcd.cursor < 80) {
            lcd.ddram[lcd.cursor] = charCode;
            lcd.cursor++;
          }
        }
        return null;
      }
      if (method === "backlight_on") {
        if (lcd) lcd.backlight = true;
        return null;
      }
      if (method === "backlight_off") {
        if (lcd) lcd.backlight = false;
        return null;
      }
      if (method === "display_on") {
        if (lcd) lcd.displayEnabled = true;
        return null;
      }
      if (method === "display_off") {
        if (lcd) lcd.displayEnabled = false;
        return null;
      }
      if (method === "cursor_on") {
        if (lcd) lcd.cursorEnabled = true;
        return null;
      }
      if (method === "cursor_off") {
        if (lcd) lcd.cursorEnabled = false;
        return null;
      }
      return null;
    }

    // B2: Forward machine module-qualified constructor calls
    if (objName === "machine") {
      return this.callFunction(method, args);
    }

    if (objName === "busio") {
      if (method === "I2C") {
        return { type: "I2C", bus: 0 };
      }
    }

    // B1: Handle time/utime sleep and tick operations
    if (objName === "time" || objName === "utime") {
      if (method === "sleep" || method === "sleep_ms" || method === "sleep_us") {
        const ms =
          method === "sleep"
            ? rawArgs[0] * 1000
            : method === "sleep_us"
              ? rawArgs[0] / 1000
              : rawArgs[0];
        // See the `sleep` handling in callFunction(): SleepSignal cannot carry a
        // pending `return` value across the resume, so a `sleep` inside a
        // value-returning helper silently makes it return None. Inside a user
        // function (scope depth > 1) skip the suspend; only accumulate the
        // delay for outer-loop pacing.
        this.state.loopWaitRemaining = Math.max(
          this.state.loopWaitRemaining,
          ms,
        );
        if (this.scopes.length > 1) return null;
        throw new SleepSignal(ms);
      } else if (method === "ticks_ms") {
        return this.state.lastTimestamp;
      } else if (method === "ticks_us") {
        return this.state.lastTimestamp * 1000;
      } else if (method === "ticks_diff") {
        return rawArgs[0] - rawArgs[1];
      } else if (method === "ticks_add") {
        return rawArgs[0] + rawArgs[1];
      }
      return null;
    }

    if (objName === "dht") {
      if (method === "DHT11" || method === "dht11") {
        const pinArg = rawArgs[0];
        const pin = typeof pinArg === "object" && pinArg?.type === "Pin" ? pinArg.pin : pinArg;
        return { type: "DHT11", pin };
      }
      if (method === "DHT22" || method === "dht22") {
        const pinArg = rawArgs[0];
        const pin = typeof pinArg === "object" && pinArg?.type === "Pin" ? pinArg.pin : pinArg;
        return { type: "DHT22", pin };
      }
    }

    if (objName === "random" || objName === "urandom") {
      if (method === "randint") {
        const min = rawArgs[0] ?? 0;
        const max = rawArgs[1] ?? 0;
        return Math.floor(Math.random() * (max - min + 1) + min);
      }
      if (method === "random") {
        return Math.random();
      }
      if (method === "randrange") {
        const stop = rawArgs[0] ?? 0;
        return Math.floor(Math.random() * stop);
      }
      return null;
    }

    const obj = objVal ?? (objName ? this.getVariable(objName) : null);
    if (!obj) return null;

    // B6: Array/List list methods
    if (Array.isArray(obj)) {
      if (method === "append") {
        obj.push(rawArgs[0]);
        return null;
      }
      if (method === "pop") {
        return obj.pop();
      }
    }

    if (obj.type === "Pin") {
      const pinNum = obj.pin;
      if (method === "on" || method === "high") {
        this.setPinState(pinNum, true);
        return null;
      }
      if (method === "off" || method === "low") {
        this.setPinState(pinNum, false);
        return null;
      }
      if (method === "toggle") {
        const current = this.state.pins.get(pinNum)?.value ?? 0;
        this.setPinState(pinNum, current === 0);
        return null;
      }
      if (method === "value") {
        if (rawArgs.length > 0) {
          this.setPinState(pinNum, rawArgs[0] > 0);
          return null;
        } else {
          return this.resolveDynamicPinValue(pinNum);
        }
      }
      if (method === "irq") {
        let trigger: "RISING" | "FALLING" | "BOTH" = "BOTH";
        let triggerVal = args.find((a) => a.name === "trigger")?.value;
        let handlerVal = args.find((a) => a.name === "handler")?.value;

        // If not specified by keyword, resolve positional arguments
        if (!triggerVal && !handlerVal) {
          if (rawArgs.length >= 2) {
            const isFirstTrigger =
              typeof rawArgs[0] === "number" ||
              (typeof rawArgs[0] === "string" && rawArgs[0].includes("IRQ"));
            if (isFirstTrigger) {
              triggerVal = rawArgs[0];
              handlerVal = rawArgs[1];
            } else {
              handlerVal = rawArgs[0];
              triggerVal = rawArgs[1];
            }
          } else if (rawArgs.length === 1) {
            const isTrigger =
              typeof rawArgs[0] === "number" ||
              (typeof rawArgs[0] === "string" && rawArgs[0].includes("IRQ"));
            if (isTrigger) triggerVal = rawArgs[0];
            else handlerVal = rawArgs[0];
          }
        } else if (!handlerVal && rawArgs.length > 0) {
          handlerVal = rawArgs.find((v) => v !== triggerVal);
        } else if (!triggerVal && rawArgs.length > 0) {
          triggerVal = rawArgs.find((v) => v !== handlerVal);
        }

        const triggerStr = String(triggerVal ?? "");
        if (
          triggerVal === 3 ||
          (triggerStr.includes("IRQ_RISING") &&
            triggerStr.includes("IRQ_FALLING")) ||
          triggerStr === "BOTH"
        ) {
          trigger = "BOTH";
        } else if (triggerVal === 1 || triggerStr.includes("IRQ_RISING")) {
          trigger = "RISING";
        } else if (triggerVal === 2 || triggerStr.includes("IRQ_FALLING")) {
          trigger = "FALLING";
        }

        const handlerName =
          typeof handlerVal === "string"
            ? handlerVal
            : typeof handlerVal === "object" && handlerVal?.name
              ? handlerVal.name
              : handlerVal;

        // Initialize lastValue from current pin state (pull-up defaults to 1, pull-down to 0)
        // to prevent false-triggering on simulation start.
        const pinState = this.state.pins.get(pinNum);
        const initialLastVal =
          pinState?.mode === "INPUT_PULLUP" || (pinState?.value ?? 0) > 0
            ? 1
            : 0;

        this.state.irqs.push({
          pin: pinNum,
          trigger,
          handler: handlerName,
          lastValue: initialLastVal,
        });
        return null;
      }
    }

    if (obj.type === "ADC") {
      const pinNum = obj.pin;
      const nodes = useCircuitStore.getState().nodes;
      const edges = useCircuitStore.getState().edges;
      if (method === "read_u16") {
        return getAnalogValueForPicoPin(pinNum, nodes, edges, "u16");
      }
      if (method === "read") {
        return getAnalogValueForPicoPin(pinNum, nodes, edges, "12bit");
      }
      if (method === "read_uv") {
        return getAnalogValueForPicoPin(pinNum, nodes, edges, "uv");
      }
      if (method === "atten" || method === "width") {
        return null;
      }
    }

    if (obj.type === "IRReceiver") {
      if (method === "read") {
        return resolveIrReceiverValue(obj.pin);
      }
    }

    // B3: PWM method dispatches
    if (obj.type === "PWM") {
      const pinNum = obj.pin;
      if (method === "duty") {
        if (rawArgs.length > 0) {
          const duty10 = Math.max(0, Math.min(1023, rawArgs[0]));
          const dutyU16 = Math.round((duty10 / 1023) * 65535);
          let pwmState = this.state.pwm.get(pinNum);
          if (!pwmState) {
            pwmState = { dutyU16: 0, freqHz: 0 };
            this.state.pwm.set(pinNum, pwmState);
          }
          pwmState.dutyU16 = dutyU16;
          const val = Math.max(
            0,
            Math.min(255, Math.round((duty10 / 1023) * 255)),
          );
          this.setPinState(pinNum, val > 0);
          const pState = this.state.pins.get(pinNum);
          if (pState) {
            pState.mode = "OUTPUT";
            pState.value = val;
          }
          return null;
        } else {
          const dutyU16 = this.state.pwm.get(pinNum)?.dutyU16 ?? 0;
          return Math.round((dutyU16 / 65535) * 1023);
        }
      }
      if (method === "duty_u16") {
        if (rawArgs.length > 0) {
          const duty = rawArgs[0];
          let pwmState = this.state.pwm.get(pinNum);
          if (!pwmState) {
            pwmState = { dutyU16: 0, freqHz: 0 };
            this.state.pwm.set(pinNum, pwmState);
          }
          pwmState.dutyU16 = duty;
          const val = Math.max(
            0,
            Math.min(255, Math.round((duty / 65535) * 255)),
          );
          this.setPinState(pinNum, val > 0);
          const pState = this.state.pins.get(pinNum);
          if (pState) {
            pState.mode = "OUTPUT";
            pState.value = val;
          }
          return null;
        } else {
          return this.state.pwm.get(pinNum)?.dutyU16 ?? 0;
        }
      }
      if (method === "duty_ns") {
        if (rawArgs.length > 0) {
          const ns = rawArgs[0];
          const dutyU16 = Math.round(
            Math.max(0, Math.min(65535, (ns / 20_000_000) * 65535)),
          );
          let pwmState = this.state.pwm.get(pinNum);
          if (!pwmState) {
            pwmState = { dutyU16: 0, freqHz: 0 };
            this.state.pwm.set(pinNum, pwmState);
          }
          pwmState.dutyU16 = dutyU16;
          const val = Math.round((dutyU16 / 65535) * 255);
          let pinState = this.state.pins.get(pinNum);
          if (!pinState) {
            pinState = { mode: "OUTPUT", value: val };
            this.state.pins.set(pinNum, pinState);
          } else {
            pinState.value = val;
          }
          const existing = this.state.outputs.find((o) => o.pin === pinNum);
          if (existing) {
            existing.high = val > 0;
          } else {
            this.state.outputs.push({ pin: pinNum, high: val > 0 });
          }
          return null;
        } else {
          const dutyU16 = this.state.pwm.get(pinNum)?.dutyU16 ?? 0;
          return Math.round((dutyU16 / 65535) * 20_000_000);
        }
      }
      if (method === "freq") {
        if (rawArgs.length > 0) {
          const freq = rawArgs[0];
          let pwmState = this.state.pwm.get(pinNum);
          if (!pwmState) {
            pwmState = { dutyU16: 0, freqHz: 0 };
            this.state.pwm.set(pinNum, pwmState);
          }
          pwmState.freqHz = freq;
          return null;
        } else {
          return this.state.pwm.get(pinNum)?.freqHz ?? 0;
        }
      }
      if (method === "deinit") {
        this.state.pwm.delete(pinNum);
        return null;
      }
    }

    if (obj && obj.type === "HCSR04") {
      const nodes = useCircuitStore.getState().nodes;
      const ultraNode = nodes.find(
        (n) => n.data.componentType === "ultrasonicDistance",
      );
      const distance = ultraNode
        ? Number(ultraNode.data.properties?.distance?.value ?? 100)
        : 100;
      if (method === "distance_cm") {
        return distance;
      }
      if (method === "distance_mm") {
        return distance * 10;
      }
    }

    if (obj && (obj.type === "DHT11" || obj.type === "DHT22")) {
      const isDht22 = obj.type === "DHT22";
      const { nodes, edges } = useCircuitStore.getState();
      const targetModel = isDht22 ? "dht22" : "dht11";

      let dhtNode: any = null;
      if (typeof obj.pin === "number" && edges && edges.length > 0) {
        const pinHandle = `gp${obj.pin}`;
        const connectedEdge = edges.find(
          (e) => (e.sourceHandle === pinHandle || e.targetHandle === pinHandle)
        );
        if (connectedEdge) {
          const connectedId = connectedEdge.sourceHandle === pinHandle ? connectedEdge.target : connectedEdge.source;
          const candidate = nodes.find((n) => n.id === connectedId);
          if (candidate && (candidate.data?.componentType === targetModel || candidate.data?.simulationModel === targetModel)) {
            dhtNode = candidate;
          }
        }
      }

      if (!dhtNode) {
        dhtNode = nodes.find(
          (n) => (n.data?.componentType === targetModel || n.data?.simulationModel === targetModel)
        );
      }

      const temp = dhtNode
        ? Number(dhtNode.data.properties?.temperature?.value ?? 24)
        : 24;
      const hum = dhtNode
        ? Number(dhtNode.data.properties?.humidity?.value ?? 40)
        : 40;

      if (method === "measure") {
        return null;
      }
      if (method === "temperature") {
        if (rawArgs.length > 0 && (rawArgs[0] === true || rawArgs[0] === 1)) {
          return temp * 1.8 + 32;
        }
        return temp;
      }
      if (method === "humidity") {
        return hum;
      }
    }

    if (obj && obj.type === "I2C") {
      if (method === "try_lock") {
        return true;
      }
      if (method === "unlock") {
        return null;
      }
      if (method === "writeto") {
        const addr = rawArgs[0];
        const data = rawArgs[1];

        if (data) {
          const bytes = Array.isArray(data) ? data : [data];
          const lcd = this.getLcdState({ address: addr });
          if (lcd) {
            const lcdNode = useCircuitStore
              .getState()
              .nodes.find(
                (n) =>
                  n.data.componentType === "lcd16x2" ||
                  n.data.simulationModel === "lcd16x2",
              );
            let expectedAddr = 0x27;
            if (lcdNode) {
              const addrStr = String(
                lcdNode.data.properties?.i2cAddress?.value ?? "0x27",
              );
              const hexMatch = addrStr.match(/0x([0-9a-fA-F]+)/);
              if (hexMatch) {
                expectedAddr = parseInt(hexMatch[1], 16);
              } else {
                expectedAddr = parseInt(addrStr, 10);
              }
            }

            if (addr === expectedAddr) {
              for (const byte of bytes) {
                const rs = byte & 0x01;
                const rw = (byte & 0x02) >> 1;
                const en = (byte & 0x04) >> 2;
                const backlight = (byte & 0x08) > 0;
                const nibble = byte & 0xf0;

                lcd.backlight = backlight;

                // Detect falling edge of EN (from 1 to 0)
                if (lcd.lastEn === 1 && en === 0) {
                  if (lcd.lastNibble === null) {
                    lcd.lastNibble = nibble;
                    lcd.lastRs = rs;
                  } else {
                    const fullByte = lcd.lastNibble | (nibble >> 4);
                    const prevRs = lcd.lastRs ?? rs;
                    lcd.lastNibble = null;
                    lcd.lastRs = null;

                    if (prevRs === 0) {
                      // Command instruction
                      if (fullByte === 0x01) {
                        lcd.ddram.fill(32);
                        lcd.cursor = 0;
                      } else if (fullByte === 0x02) {
                        lcd.cursor = 0;
                      } else if ((fullByte & 0x80) !== 0) {
                        lcd.cursor = fullByte & 0x7f;
                      }
                    } else {
                      // Data character write
                      if (lcd.cursor < 80) {
                        lcd.ddram[lcd.cursor] = fullByte;
                        lcd.cursor++;
                      }
                    }
                  }
                }
                lcd.lastEn = en;
              }
            }
          }
        }
        return null;
      }
      if (method === "writeto_mem") {
        const addr = rawArgs[0];
        const memaddr = rawArgs[1];
        const data = rawArgs[2];
        this.state.serialLines.push(
          `[I2C Write to 0x${addr.toString(16).toUpperCase()} mem 0x${memaddr.toString(16).toUpperCase()}: ${data}]`,
        );
        return null;
      }
      if (method === "readfrom") {
        const addr = rawArgs[0];
        const nbytes = rawArgs[1] ?? 1;
        return Array(nbytes).fill(0);
      }
      if (method === "readfrom_mem") {
        const addr = rawArgs[0];
        const memaddr = rawArgs[1];
        const nbytes = rawArgs[2] ?? 1;
        if (addr === 0x76 || addr === 0x77) {
          const nodes = useCircuitStore.getState().nodes;
          const tempNode = nodes.find(
            (n) =>
              n.data.componentType === "temperatureSensor" ||
              n.data.simulationModel === "temperatureSensor",
          );
          const temp = tempNode
            ? Number(tempNode.data.properties?.temperature?.value ?? 25)
            : 25;
          const bytes = Array(nbytes).fill(0);
          bytes[0] = Math.round(temp);
          return bytes;
        }
        return Array(nbytes).fill(0);
      }
      if (method === "scan") {
        const nodes = useCircuitStore.getState().nodes;
        const addresses: number[] = [];
        console.log("[PICO DEBUG] scan: found", nodes.length, "nodes");
        for (const n of nodes) {
          const compType = n.data.componentType;
          const props = n.data.properties;
          const addrVal = props?.i2cAddress?.value ?? props?.address?.value;
          console.log(
            "[PICO DEBUG] scan node:",
            compType,
            "i2cAddress:",
            props?.i2cAddress,
            "address:",
            props?.address,
            "addrVal:",
            addrVal,
          );
          if (addrVal) {
            const addrStr = String(addrVal);
            let addr: number;
            const hMatch = addrStr.match(/0x([0-9a-fA-F]+)/);
            if (hMatch) {
              addr = parseInt(hMatch[1], 16);
            } else {
              addr = parseInt(addrStr, 10);
            }
            console.log(
              "[PICO DEBUG] scan parsed addr:",
              addr,
              "from:",
              addrStr,
            );
            if (!isNaN(addr) && addr > 0) addresses.push(addr);
          }
        }
        console.log("[PICO DEBUG] scan returning:", addresses);
        if (addresses.length === 0) return [0x3c, 0x76];
        return addresses;
      }
    }

    if (obj.type === "UART") {
      if (method === "write") {
        this.state.serialLines.push(`[UART Write: ${rawArgs[0]}]`);
        return rawArgs[0]?.length ?? 0;
      }
      if (method === "read" || method === "readline") return "";
      if (method === "any") return 0;
    }

    if (obj.type === "SPI") {
      if (method === "write") return null;
      if (method === "read") return Array(rawArgs[0] ?? 1).fill(0);
      if (method === "write_readinto") return null;
    }

    if (obj.type === "Timer") {
      if (method === "init") {
        const period =
          args.find((a) => a.name === "period")?.value ?? rawArgs[0] ?? 1000;
        const mode =
          args.find((a) => a.name === "mode")?.value ??
          rawArgs[1] ??
          "PERIODIC";
        const callback =
          args.find((a) => a.name === "callback")?.value ?? rawArgs[2] ?? "";

        const callbackName =
          typeof callback === "string"
            ? callback
            : typeof callback === "object" && callback?.name
              ? callback.name
              : callback;

        this.state.timers.push({
          period,
          mode: mode === "ONE_SHOT" ? "ONE_SHOT" : "PERIODIC",
          callback: callbackName,
          timeAccumulator: 0,
        });
        return null;
      }
    }

    if (obj.type === "WDT") {
      if (method === "feed") {
        this.state.wdtAccumulator = 0;
        this.state.serialLines.push("[WDT: Watchdog fed]");
        return null;
      }
    }

    if (obj.type === "RTC") {
      if (method === "datetime") {
        if (rawArgs.length > 0) {
          this.state.serialLines.push(
            `[RTC set to: ${JSON.stringify(rawArgs[0])}]`,
          );
        } else {
          return [2026, 7, 13, 1, 10, 30, 0, 0];
        }
        return null;
      }
    }

    function formatPythonSpec(val: any, spec: string): string {
      const specMatch = spec.match(
        /^(?:(.)?([<>=^]))?(0)?(\d+)?(?:\.(\d+))?([a-zA-Z%])?$/,
      );
      if (!specMatch) return String(val);

      const [, fillChar, align, zeroPad, widthStr, precisionStr, type] =
        specMatch;
      const num = Number(val);
      const isNumber = !isNaN(num);

      let formatted = "";

      if (type === "d" || type === "D") {
        formatted = isNumber ? String(Math.floor(num)) : String(val);
      } else if (type === "f" || type === "F") {
        // Default precision to 2 if unspecified (matching legacy simulator behavior), or parse explicit precision
        const precision =
          precisionStr !== undefined ? parseInt(precisionStr, 10) : 2;
        formatted = isNumber ? num.toFixed(precision) : String(val);
      } else if (type === "x") {
        formatted = isNumber ? Math.floor(num).toString(16) : String(val);
      } else if (type === "X") {
        formatted = isNumber
          ? Math.floor(num).toString(16).toUpperCase()
          : String(val);
      } else if (type === "b") {
        formatted = isNumber ? Math.floor(num).toString(2) : String(val);
      } else if (type === "%") {
        const precision =
          precisionStr !== undefined ? parseInt(precisionStr, 10) : 2;
        formatted = isNumber
          ? (num * 100).toFixed(precision) + "%"
          : String(val);
      } else {
        if (precisionStr !== undefined && isNumber) {
          formatted = num.toFixed(parseInt(precisionStr, 10));
        } else {
          formatted = String(val);
        }
      }

      const width = widthStr ? parseInt(widthStr, 10) : 0;
      if (width > formatted.length) {
        const padChar = zeroPad || fillChar === "0" ? "0" : fillChar || " ";
        const alignment = align || (zeroPad ? ">" : isNumber ? ">" : "<");
        if (alignment === ">") {
          formatted = formatted.padStart(width, padChar);
        } else if (alignment === "<") {
          formatted = formatted.padEnd(width, padChar);
        } else if (alignment === "^") {
          const totalPad = width - formatted.length;
          const leftPad = Math.floor(totalPad / 2);
          const rightPad = totalPad - leftPad;
          formatted =
            padChar.repeat(leftPad) + formatted + padChar.repeat(rightPad);
        }
      }

      return formatted;
    }

    // B8: Python string .format() implementation
    if (typeof obj === "string" && method === "format") {
      let result = obj;
      let argIndex = 0;

      result = result.replace(
        /\{(\d+)?(?::([^{}]+))?\}/g,
        (match, idxStr, spec) => {
          let value: any;
          if (idxStr !== undefined) {
            const idx = parseInt(idxStr, 10);
            value = rawArgs[idx];
          } else {
            value = rawArgs[argIndex++];
          }

          if (value === undefined) return match;
          if (!spec) return String(value);

          return formatPythonSpec(value, spec);
        },
      );

      return result;
    }

    return null;
  }

  private setPinState(pinNum: number, high: boolean) {
    const isInputOnlyPin =
      this.state.boardType === "esp32" &&
      (pinNum === 34 || pinNum === 35 || pinNum === 36 || pinNum === 39);
    if (isInputOnlyPin) {
      this.state.pins.set(pinNum, { mode: "INPUT", value: 0 });
      return;
    }
    let pinState = this.state.pins.get(pinNum);
    if (!pinState) {
      pinState = { mode: "OUTPUT", value: high ? 255 : 0 };
      this.state.pins.set(pinNum, pinState);
    } else {
      pinState.value = high ? 255 : 0;
    }
    const existing = this.state.outputs.find((o) => o.pin === pinNum);
    if (existing) {
      existing.high = high;
    } else {
      this.state.outputs.push({ pin: pinNum, high });
    }
  }

  private resolveDynamicPinValue(pinNum: number): number {
    const pinState = this.state.pins.get(pinNum);
    if (pinState && pinState.mode === "OUTPUT") {
      return pinState.value > 0 ? 1 : 0;
    }

    const { nodes, edges } = useCircuitStore.getState();
    const boardNode = nodes.find(
      (node) =>
        getNodeSimulationModelForStore(node) === "raspberrypipico" ||
        getNodeSimulationModelForStore(node) === "arduino" ||
        getNodeSimulationModelForStore(node) === "esp32" ||
        (typeof node.id === "string" &&
          (node.id.toLowerCase().includes("pico") ||
            node.id.toLowerCase().includes("esp32"))),
    );
    if (!boardNode) {
      return pinState ? (pinState.value > 0 ? 1 : 0) : 0;
    }
    const isEsp32 = getNodeSimulationModelForStore(boardNode) === "esp32";
    const pinHandlePrefix = isEsp32 ? "gpio" : "gp";

    const graph = buildConductiveGraphForStore(nodes, edges, {
      includeResistors: true,
    });

    const KEY_MATRIX = [
      ["1", "2", "3", "A"],
      ["4", "5", "6", "B"],
      ["7", "8", "9", "C"],
      ["*", "0", "#", "D"],
    ];

    // Clear any consumed keys that are no longer physically pressed
    const activePressed = new Set<string>();
    for (const node of nodes) {
      const model = node.data?.componentType ?? node.type;
      if (model === "keypad4x4" || model === "keypad4x3") {
        const pressedKeysStr = String(
          node.data?.properties?.pressedKeys?.value ?? "",
        );
        if (pressedKeysStr) {
          pressedKeysStr.split(",").forEach((k) => activePressed.add(k));
        }
      }
    }
    if (!this.state.consumedKeys) {
      this.state.consumedKeys = new Set<string>();
    }
    for (const k of this.state.consumedKeys) {
      if (!activePressed.has(k)) {
        this.state.consumedKeys.delete(k);
      }
    }

    // Add active keypad matrix short circuits to the graph (excluding consumed keys)
    for (const node of nodes) {
      const model = node.data?.componentType ?? node.type;
      if (model === "keypad4x4" || model === "keypad4x3") {
        const pressedKeysStr = String(
          node.data?.properties?.pressedKeys?.value ?? "",
        );
        const pressedKeys = new Set(
          pressedKeysStr ? pressedKeysStr.split(",") : [],
        );
        pressedKeys.forEach((key) => {
          if (this.state.consumedKeys?.has(key)) {
            return;
          }
          let rIdx = -1;
          let cIdx = -1;
          for (let r = 0; r < KEY_MATRIX.length; r++) {
            const c = KEY_MATRIX[r].indexOf(key);
            if (c !== -1) {
              rIdx = r;
              cIdx = c;
              break;
            }
          }
          if (rIdx !== -1 && cIdx !== -1) {
            addGraphConnection(
              graph,
              `${node.id}:row${rIdx + 1}`,
              `${node.id}:column${cIdx + 1}`,
            );
          }
        });
      }
    }

    const inputReach = getReachableGraphNodes(
      graph,
      `${boardNode.id}:${pinHandlePrefix}${pinNum}`,
    );

    let strongestSourceVoltage = 0;
    let grounded = false;

    const addSourceIfReachable = (endpoint: string, voltage: number) => {
      if (inputReach.has(endpoint)) {
        strongestSourceVoltage = Math.max(strongestSourceVoltage, voltage);
      }
    };

    const addGroundIfReachable = (endpoint: string) => {
      if (inputReach.has(endpoint)) grounded = true;
    };

    if (isEsp32) {
      addSourceIfReachable(`${boardNode.id}:esp32_3v3`, 3.3);
      addSourceIfReachable(`${boardNode.id}:esp32_vin`, 5);
    } else {
      addSourceIfReachable(`${boardNode.id}:pico_3v3`, 3.3);
      addSourceIfReachable(`${boardNode.id}:pico_vbus`, 5);
      addSourceIfReachable(`${boardNode.id}:pico_vsys`, 5);
    }

    const gndPins = isEsp32
      ? ["esp32_gnd1", "esp32_gnd2", "esp32_gnd3"]
      : [
          "pico_gnd1",
          "pico_gnd2",
          "pico_gnd3",
          "pico_gnd4",
          "pico_gnd5",
          "pico_gnd6",
          "pico_gnd7",
          "pico_gnd8",
        ];
    for (const gnd of gndPins) {
      addGroundIfReachable(`${boardNode.id}:${gnd}`);
    }

    let drivenLowByRow = false;
    let drivenHighByRow = false;

    for (let otherPin = 0; otherPin <= 39; otherPin++) {
      if (otherPin === pinNum) continue;
      const otherPinState = this.state.pins.get(otherPin);
      if (otherPinState && otherPinState.mode === "OUTPUT") {
        if (inputReach.has(`${boardNode.id}:${pinHandlePrefix}${otherPin}`)) {
          if (otherPinState.value > 0) {
            strongestSourceVoltage = Math.max(strongestSourceVoltage, 3.3);
            drivenHighByRow = true;
          } else {
            addGroundIfReachable(
              `${boardNode.id}:${pinHandlePrefix}${otherPin}`,
            );
            drivenLowByRow = true;
          }
        }
      }
    }

    for (const node of nodes) {
      const model = getNodeSimulationModelForStore(node);

      if (model === "battery" || model === "powerSupply") {
        const enabled =
          model === "powerSupply"
            ? node.data.properties?.enabled?.value === "on"
            : true;
        const voltage = enabled
          ? Number(node.data.properties?.voltage?.value ?? 0)
          : 0;
        addSourceIfReachable(`${node.id}:positive`, voltage);
        addGroundIfReachable(`${node.id}:negative`);
      } else if (model === "pirSensor") {
        const motionValue =
          node.data?.pirMotion ?? node.data?.properties?.motion?.value;
        const motion =
          motionValue === true || motionValue === "true" || motionValue === 1;
        if (motion) {
          addSourceIfReachable(`${node.id}:signal`, 3.3);
        } else {
          addGroundIfReachable(`${node.id}:signal`);
        }
      }
    }

    const isPullUp = pinState?.mode === "INPUT_PULLUP";
    if (isPullUp && !grounded) {
      strongestSourceVoltage = Math.max(strongestSourceVoltage, 3.3);
    }

    const consumeKeyIfConnected = () => {
      for (const node of nodes) {
        const model = node.data?.componentType ?? node.type;
        if (model === "keypad4x4" || model === "keypad4x3") {
          const pressedKeysStr = String(
            node.data?.properties?.pressedKeys?.value ?? "",
          );
          const pressedKeys = new Set(
            pressedKeysStr ? pressedKeysStr.split(",") : [],
          );
          pressedKeys.forEach((key) => {
            if (this.state.consumedKeys?.has(key)) return;
            let rIdx = -1;
            let cIdx = -1;
            for (let r = 0; r < KEY_MATRIX.length; r++) {
              const c = KEY_MATRIX[r].indexOf(key);
              if (c !== -1) {
                rIdx = r;
                cIdx = c;
                break;
              }
            }
            if (rIdx !== -1 && cIdx !== -1) {
              const columnHandle = `${node.id}:column${cIdx + 1}`;
              const rowHandle = `${node.id}:row${rIdx + 1}`;
              if (inputReach.has(columnHandle) && inputReach.has(rowHandle)) {
                this.state.consumedKeys?.add(key);
              }
            }
          });
        }
      }
    };

    if (grounded) {
      if (isPullUp && drivenLowByRow) {
        consumeKeyIfConnected();
      }
      return 0;
    }

    if (strongestSourceVoltage >= 1.5) {
      if (!isPullUp && drivenHighByRow) {
        consumeKeyIfConnected();
      }
      return 1;
    }
    return 0;
  }

  getVariable(name: string): any {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        return this.scopes[i].get(name);
      }
    }
    if (name in NEC_COMMANDS) {
      return NEC_COMMANDS[name];
    }
    return null;
  }

  setVariable(name: string, value: any) {
    if (this.globalsSet.has(name)) {
      this.scopes[0].set(name, value);
      this.state.variables.set(name, value);
      return;
    }

    const currentScope = this.scopes[this.scopes.length - 1];
    currentScope.set(name, value);
    if (this.scopes.length === 1) {
      this.state.variables.set(name, value);
    }
  }
}

// -----------------------------------------------------------------------------
// Session Manager
// -----------------------------------------------------------------------------

const simSessions = new Map<string, SimSessionState>();
let lastCallTime = 0;
let lastSimulationTimestamp = 0;

/** Clears all cached simulation sessions (used in testing & simulation restart). */
export function clearSimSessions(): void {
  simSessions.clear();
  resetIrReceiverState();
}

function stepIrReceivers(state: SimSessionState) {
  if (!state.irReceivers || state.irReceivers.length === 0) return;
  for (const binding of state.irReceivers) {
    if (binding.callback) {
      const cmd = resolveIrReceiverValue(binding.pin);
      if (cmd !== null && cmd !== undefined) {
        let funcName: string | undefined;
        if (typeof binding.callback === "string") {
          funcName = binding.callback;
        } else if (binding.callback && typeof binding.callback === "object") {
          funcName = binding.callback.name;
        }
        if (funcName) {
          const interpreter = new MicroPythonInterpreter(state);
          interpreter.callFunction(funcName, [
            { name: "data", value: cmd },
            { name: "addr", value: 0 },
            { name: "ctrl", value: 0 },
          ]);
          if (state.pendingSerialBuffer) {
            state.serialLines.push(state.pendingSerialBuffer);
            state.pendingSerialBuffer = "";
          }
        }
      }
    }
  }
}

function stepSetupNodes(state: SimSessionState) {
  const setupNodes = state.setupNodes;
  if (!setupNodes || state.setupFinished) return;

  const interpreter = new MicroPythonInterpreter(state);

  while (!state.setupFinished && state.loopWaitRemaining <= 0) {
    if (state.setupPC === undefined) state.setupPC = 0;
    if (state.setupPC >= setupNodes.length) {
      state.setupFinished = true;
      break;
    }

    const node = setupNodes[state.setupPC];

    // Check for dynamic top-level for loop unrolling
    if (node && node.kind === "For") {
      try {
        if (node.isRange) {
          const startVal = interpreter.evaluate(node.start!);
          const endVal = interpreter.evaluate(node.end!);
          const stepVal = node.step ? interpreter.evaluate(node.step!) : 1;

          if (
            typeof startVal === "number" &&
            typeof endVal === "number" &&
            typeof stepVal === "number" &&
            stepVal !== 0
          ) {
            const iterations = Math.ceil(
              Math.abs((endVal - startVal) / stepVal),
            );
            if (iterations <= 100) {
              const unrolledNodes: ASTNode[] = [];
              if (stepVal > 0) {
                for (let i = startVal; i < endVal; i += stepVal) {
                  unrolledNodes.push({
                    kind: "Assign",
                    target: node.varName,
                    value: { kind: "Literal", value: i },
                  });
                  unrolledNodes.push(...node.body);
                }
              } else {
                for (let i = startVal; i > endVal; i += stepVal) {
                  unrolledNodes.push({
                    kind: "Assign",
                    target: node.varName,
                    value: { kind: "Literal", value: i },
                  });
                  unrolledNodes.push(...node.body);
                }
              }
              setupNodes.splice(state.setupPC, 1, ...unrolledNodes);
              continue;
            }
          }
        } else {
          const items = interpreter.evaluate(node.collection);
          if (Array.isArray(items) && items.length <= 100) {
            const unrolledNodes: ASTNode[] = [];
            for (const item of items) {
              unrolledNodes.push({
                kind: "Assign",
                target: node.varName,
                value: { kind: "Literal", value: item },
              });
              unrolledNodes.push(...node.body);
            }
            setupNodes.splice(state.setupPC, 1, ...unrolledNodes);
            continue;
          }
        }
      } catch {
        // Fall back to atomic execution if evaluation fails
      }
    }

    try {
      interpreter.execute([node]);
    } catch (e: any) {
      if (e instanceof SleepSignal) {
        state.setupPC++;
        if (state.setupPC >= setupNodes.length) {
          state.setupFinished = true;
        }
        break;
      }
      state.serialLines.push(`RuntimeError: ${e.message}`);
      state.setupFinished = true;
      break;
    }

    state.setupPC++;
    if (state.setupPC >= setupNodes.length) {
      state.setupFinished = true;
    }
  }
}
export function getOrCreateSession(
  code: string,
  timestamp: number,
  boardType: "pico" | "esp32" = "pico",
): SimSessionState {
  let state = simSessions.get(code);
  const now = Date.now();

  if (state && boardType) {
    state.boardType = boardType;
  }

  if (
    !state ||
    (timestamp === 0
      ? lastSimulationTimestamp > 0
      : timestamp < lastSimulationTimestamp - 2000) ||
    now - lastCallTime > 5000
  ) {
    let tokens: Token[] = [];
    let tokenizeError: string | null = null;
    try {
      const tokenizer = new MicroPythonTokenizer(code);
      tokens = tokenizer.tokenize();
    } catch (e: any) {
      tokenizeError = e.message;
    }

    const setupNodes: ASTNode[] = [];
    const loopNodes: ASTNode[] = [];
    let parseError: string | null = null;

    if (!tokenizeError) {
      try {
        const parser = new MicroPythonParser(tokens);
        const ast = parser.parse();

        for (const node of ast) {
          const cond = (node as any).condition;
          const isTrueCond =
            (cond?.kind === "Literal" && Boolean(cond.value)) ||
            (cond?.kind === "Name" && cond.name === "True");
          if (node.kind === "While" && isTrueCond) {
            loopNodes.push(...node.body);
          } else {
            setupNodes.push(node);
          }
        }
      } catch (e: any) {
        parseError = e.message;
      }
    } else {
      parseError = tokenizeError;
    }

    state = {
      boardType,
      code,
      variables: new Map(),
      pins: new Map(),
      pwm: new Map(),
      lastTimestamp: timestamp,
      functions: new Map(),
      loopLines: [],
      loopPC: 0,
      loopWaitRemaining: 0,
      timers: [],
      irqs: [],
      virtualFS: new Map(),
      wdtTimeout: 0,
      wdtAccumulator: 0,
      rtcOffset: 0,
      freq: 125000000,
      outputs: [],
      serialLines: [],
      rawSerialLines: [],
      currentSerialLine: "",
      serialCursor: 0,
      lcdStates: new Map<number, LcdState>(),
      get lcdState() {
        return this.lcdStates.get(0x27) ?? this.lcdStates.values().next().value;
      },
      consumedKeys: new Set<string>(),
      neopixelStates: new Map(),
    };

    state.setupNodes = setupNodes;
    state.loopNodes = loopNodes;
    state.setupPC = 0;
    state.setupFinished = false;
    state.loopPC = 0;

    for (let i = 0; i <= 28; i++) {
      state.pins.set(i, { mode: "UNSET", value: 0 });
    }

    if (parseError) {
      processSerialStream(state, `>>> SyntaxError: ${parseError}\n`);
    } else {
      stepSetupNodes(state);
      if (state.setupFinished && state.loopNodes) {
        state.loopNodes = unrollPythonLoopNodes(state.loopNodes, state);
      }
    }

    simSessions.set(code, state);
  }

  stepIrReceivers(state);

  lastSimulationTimestamp = timestamp;
  lastCallTime = now;
  return state;
}

// -----------------------------------------------------------------------------
// Backward-Compatible Entry Point
// -----------------------------------------------------------------------------

export function parsePythonReadOutputsForInput(
  code: string,
  inputPin: number,
  high: boolean,
  timestamp: number,
  boardType: "pico" | "esp32" = "pico",
): {
  outputs: Array<{ pin: number; high: boolean }>;
  serialLines: string[];
} | null {
  const state = getOrCreateSession(code, timestamp, boardType);

  let deltaTime = timestamp - state.lastTimestamp;
  if (deltaTime < 0) deltaTime = 0;
  if (deltaTime > 1000) deltaTime = 1000;
  state.lastTimestamp = timestamp;

  const currentVal = high ? 1 : 0;

  const pinState = state.pins.get(inputPin);
  if (pinState && pinState.mode !== "OUTPUT") {
    pinState.value = currentVal;
  }

  // Handle WDT watchdog resets
  if (state.wdtTimeout > 0) {
    state.wdtAccumulator += deltaTime;
    if (state.wdtAccumulator >= state.wdtTimeout) {
      state.serialLines.push("[WDT RESET: Watchdog timed out!]");
      state.wdtAccumulator = 0;
      state.loopPC = 0;
      state.loopWaitRemaining = 0;
      state.variables.clear();
      state.pwm.clear();

      const setupNodes = state.setupNodes;
      if (setupNodes) {
        state.setupPC = 0;
        state.setupFinished = false;
        stepSetupNodes(state);
      }
    }
  }

  for (const irq of state.irqs) {
    if (irq.pin === inputPin) {
      const prevVal = irq.lastValue;
      if (currentVal !== prevVal) {
        const isRising = prevVal === 0 && currentVal === 1;
        const isFalling = prevVal === 1 && currentVal === 0;
        if (
          irq.trigger === "BOTH" ||
          (irq.trigger === "RISING" && isRising) ||
          (irq.trigger === "FALLING" && isFalling)
        ) {
          const funcName =
            typeof irq.handler === "string"
              ? irq.handler
              : (irq.handler as any)?.name;
          const funcVal = funcName ? state.variables.get(funcName) : null;
          if (funcVal && funcVal.type === "Function" && funcName) {
            const interpreter = new MicroPythonInterpreter(state);
            interpreter.callFunction(funcName, [
              { value: { type: "Pin", pin: irq.pin } },
            ]);
          }
        }
        irq.lastValue = currentVal;
      }
    }
  }

  for (const timer of state.timers) {
    timer.timeAccumulator += deltaTime;
    if (timer.timeAccumulator >= timer.period) {
      const funcVal = state.variables.get(timer.callback);
      if (funcVal && funcVal.type === "Function") {
        const interpreter = new MicroPythonInterpreter(state);
        interpreter.callFunction(timer.callback, []);
      }
      if (timer.mode === "PERIODIC") {
        timer.timeAccumulator -= timer.period;
      }
    }
  }

  if (state.irReceivers && state.irReceivers.length > 0) {
    for (const binding of state.irReceivers) {
      if (binding.callback) {
        const cmd = resolveIrReceiverValue(binding.pin);
        if (cmd !== null && cmd !== undefined) {
          const funcName =
            typeof binding.callback === "string"
              ? binding.callback
              : binding.callback?.name;
          if (funcName) {
            const interpreter = new MicroPythonInterpreter(state);
            interpreter.callFunction(funcName, [
              { name: "data", value: cmd },
              { name: "addr", value: 0 },
              { name: "ctrl", value: 0 },
            ]);
          }
        }
      }
    }
  }

  if (state.loopWaitRemaining > 0) {
    state.loopWaitRemaining -= deltaTime;
  }

  if (state.loopWaitRemaining <= 0 && !state.setupFinished) {
    stepSetupNodes(state);
    if (state.setupFinished && state.loopNodes) {
      state.loopNodes = unrollPythonLoopNodes(state.loopNodes, state);
    }
  }

  const loopNodes = state.loopNodes as ASTNode[];
  if (
    state.loopWaitRemaining <= 0 &&
    state.setupFinished &&
    loopNodes &&
    loopNodes.length > 0
  ) {
    const interpreter = new MicroPythonInterpreter(state);
    let nodesRun = 0;
    let pc = state.loopPC as number;

    if (state.resumeStatements && state.resumeStatements.length > 0) {
      const stmts = state.resumeStatements;
      state.resumeStatements = null;
      try {
        interpreter.execute(stmts);
      } catch (e: any) {
        if (e instanceof SleepSignal) {
          state.resumeStatements =
            e.remainingStatements.length > 0 ? e.remainingStatements : null;
        }
      }
    }

    while (state.loopWaitRemaining <= 0 && nodesRun < 20) {
      if (pc >= loopNodes.length) {
        pc = 0;
      }
      const node = loopNodes[pc];

      if (node && node.kind === "For") {
        try {
          if (node.isRange) {
            const startVal = interpreter.evaluate(node.start!);
            const endVal = interpreter.evaluate(node.end!);
            const stepVal = node.step ? interpreter.evaluate(node.step!) : 1;

            if (
              typeof startVal === "number" &&
              typeof endVal === "number" &&
              typeof stepVal === "number" &&
              stepVal !== 0
            ) {
              const iterations = Math.ceil(
                Math.abs((endVal - startVal) / stepVal),
              );
              if (iterations <= 100) {
                const unrolledNodes: ASTNode[] = [];
                if (stepVal > 0) {
                  for (let i = startVal; i < endVal; i += stepVal) {
                    unrolledNodes.push({
                      kind: "Assign",
                      target: node.varName,
                      value: { kind: "Literal", value: i },
                    });
                    unrolledNodes.push(...node.body);
                  }
                } else {
                  for (let i = startVal; i > endVal; i += stepVal) {
                    unrolledNodes.push({
                      kind: "Assign",
                      target: node.varName,
                      value: { kind: "Literal", value: i },
                    });
                    unrolledNodes.push(...node.body);
                  }
                }
                loopNodes.splice(pc, 1, ...unrolledNodes);
                continue;
              }
            }
          } else {
            const items = interpreter.evaluate(node.collection);
            if (Array.isArray(items) && items.length <= 100) {
              const unrolledNodes: ASTNode[] = [];
              for (const item of items) {
                unrolledNodes.push({
                  kind: "Assign",
                  target: node.varName,
                  value: { kind: "Literal", value: item },
                });
                unrolledNodes.push(...node.body);
              }
              loopNodes.splice(pc, 1, ...unrolledNodes);
              continue;
            }
          }
        } catch {
          // Fall back to atomic execution if evaluation fails
        }
      }

      try {
        interpreter.execute([node]);
      } catch (e: any) {
        if (e instanceof SleepSignal) {
          if (e.remainingStatements.length > 0) {
            state.resumeStatements = e.remainingStatements;
          }
        }
      }
      pc++;
      nodesRun++;
    }

    state.loopPC = pc;
  }

  const outputs = [...state.outputs];
  const serialLines = getVisibleSerialLines(state);

  state.outputs = [];

  if (outputs.length === 0 && serialLines.length === 0) return null;
  return { outputs, serialLines };
}

export function getPicoPwmDuty(code: string, pin: number): number | null {
  const state = simSessions.get(code);
  if (state && state.pwm.has(pin)) {
    return state.pwm.get(pin)!.dutyU16;
  }
  const cleaned = stripCodeComments(code);
  const u16Match = cleaned.match(/\bduty_u16\s*\(\s*(\d+)\s*\)/);
  if (u16Match) {
    return Number(u16Match[1]);
  }
  const duty10Match = cleaned.match(/\bduty\s*\(\s*(\d+)\s*\)/);
  if (duty10Match) {
    const duty10 = Number(duty10Match[1]);
    return Math.round((duty10 / 1023) * 65535);
  }
  const nsMatch = cleaned.match(/\bduty_ns\s*\(\s*(\d+)\s*\)/);
  if (nsMatch) {
    const ns = Number(nsMatch[1]);
    return Math.round(Math.max(0, Math.min(65535, (ns / 20_000_000) * 65535)));
  }
  return null;
}

export function parsePythonGasOutputPins(code: string, gasLevel: number) {
  return { threshold: 400, active: gasLevel > 400, pins: [] };
}

export function parsePythonTemperatureOutputPins(
  code: string,
  celsiusValue: number,
) {
  return { pins: [] };
}

export function parsePythonPotentiometerPins(
  code: string,
  analogValue: number,
) {
  return { analogPin: 26, analogValue, outputs: [] };
}

// ---------------------------------------------------------------------------
// Pico-specific pin connectivity helpers
// ---------------------------------------------------------------------------

/**
 * Pico GND pin IDs use the prefix "pico_gnd" (e.g. pico_gnd1 … pico_gnd8).
 * The Arduino parser's checkPinConnectivity only checks for pins that
 * start with plain "gnd", so Pico GND pins are never recognised as ground.
 *
 * This function walks the same conductive graph from the given component pin
 * and returns true when it reaches any Pico GND rail or a battery/power-supply
 * negative terminal.
 */
export function checkPicoGndConnectivity(
  nodeId: string,
  pinId: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): boolean {
  const graph = buildConductiveGraphForStore(nodes, edges, {
    includeResistors: true,
  });
  const startKey = `${nodeId}:${pinId}`;
  const reachable = getReachableGraphNodes(graph, startKey);

  for (const key of reachable) {
    const [targetNodeId, targetPinId] = key.split(":");
    if (!targetPinId || targetNodeId === nodeId) continue;

    const lower = targetPinId.toLowerCase();

    // Plain Arduino-style GND pins (kept for breadboard pass-through paths)
    if (lower.startsWith("gnd")) return true;

    // Pico-specific GND pins: pico_gnd1 … pico_gnd8
    if (lower.startsWith("pico_gnd")) return true;

    // ESP32-specific GND pins: esp32_gnd1 … esp32_gnd3
    if (lower.startsWith("esp32_gnd")) return true;

    // Battery negative terminal
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) continue;
    const model = getNodeSimulationModelForStore(targetNode);
    if (model === "battery" && targetPinId === "neg") return true;
    if (model === "powerSupply" && targetPinId === "black") return true;
  }

  return false;
}

/**
 * Pico VCC pin IDs are "pico_vbus" (USB 5 V), "pico_vsys" (system 5 V) and
 * "pico_3v3" (3.3 V regulated output). None of these match the Arduino
 * parser's checks for "5v", "3v3", or "vcc" — "pico_3v3" in particular
 * starts with "pico_" so even the startsWith("3v3") guard fails.
 *
 * This function uses the same graph traversal and returns true when any
 * Pico power pin or a battery/power-supply positive terminal is reachable.
 */
export function checkPicoVccConnectivity(
  nodeId: string,
  pinId: string,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): boolean {
  const graph = buildConductiveGraphForStore(nodes, edges, {
    includeResistors: true,
  });
  const startKey = `${nodeId}:${pinId}`;
  const reachable = getReachableGraphNodes(graph, startKey);

  for (const key of reachable) {
    const [targetNodeId, targetPinId] = key.split(":");
    if (!targetPinId || targetNodeId === nodeId) continue;

    const lower = targetPinId.toLowerCase();

    // Plain Arduino-style VCC pins (kept for breadboard pass-through paths)
    if (lower === "5v" || lower === "3v3" || lower === "vcc") return true;
    if (lower.startsWith("5v") || lower.startsWith("3v3")) return true;

    // Pico-specific power pins
    if (
      lower === "pico_vbus" || // VBUS  — 5 V from USB
      lower === "pico_vsys" || // VSYS  — 5 V system rail
      lower === "pico_3v3" // 3V3   — 3.3 V regulated output
    )
      return true;

    // ESP32-specific power pins
    if (
      lower === "esp32_3v3" || // 3V3   — 3.3 V regulated output
      lower === "esp32_vin" // VIN   — 5 V system rail
    )
      return true;

    // Battery / power-supply positive terminal
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) continue;
    const model = getNodeSimulationModelForStore(targetNode);
    if (model === "battery" && targetPinId === "pos") return true;
    if (model === "powerSupply" && targetPinId === "red") return true;
  }

  return false;
}

function unrollPythonLoopNodes(
  nodes: ASTNode[],
  state: SimSessionState,
): ASTNode[] {
  const result: ASTNode[] = [];
  const interpreter = new MicroPythonInterpreter(state);

  for (const node of nodes) {
    if (node.kind === "For") {
      try {
        let items: any[] = [];
        if (node.isRange) {
          const startVal = interpreter.evaluate(node.start!);
          const endVal = interpreter.evaluate(node.end!);
          const stepVal = node.step ? interpreter.evaluate(node.step) : 1;

          if (stepVal > 0) {
            for (let i = startVal; i < endVal; i += stepVal) {
              items.push(i);
            }
          } else {
            for (let i = startVal; i > endVal; i += stepVal) {
              items.push(i);
            }
          }
        } else {
          const collectionVal = interpreter.evaluate(node.collection);
          if (Array.isArray(collectionVal)) {
            items = collectionVal;
          }
        }

        if (items.length > 0) {
          for (const item of items) {
            result.push({
              kind: "Assign",
              target: node.varName,
              value: { kind: "Literal", value: item },
            });
            result.push(...unrollPythonLoopNodes(node.body, state));
          }
          continue;
        }
      } catch (e) {
        // Fallback on error
      }
    }
    result.push(node);
  }
  return result;
}
