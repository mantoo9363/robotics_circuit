export interface NE555InternalState {
  capacitorVoltage: number;
  isOutputHigh: boolean;
  lastTimestamp: number;
}

export class NE555StateManager {
  private state = new Map<string, NE555InternalState>();

  get(id: string): NE555InternalState | undefined {
    return this.state.get(id);
  }

  set(id: string, state: NE555InternalState): void {
    this.state.set(id, state);
  }

  delete(id: string): boolean {
    return this.state.delete(id);
  }

  has(id: string): boolean {
    return this.state.has(id);
  }

  clear(): void {
    this.state.clear();
  }

  entries(): IterableIterator<[string, NE555InternalState]> {
    return this.state.entries();
  }
}

export interface CapacitorInternalState {
  voltage: number;
  lastTimestamp: number;
  referenceVoltage: number;
}

export class CapacitorStateManager {
  private state = new Map<string, CapacitorInternalState>();

  get(id: string): CapacitorInternalState | undefined {
    return this.state.get(id);
  }

  set(id: string, state: CapacitorInternalState): void {
    this.state.set(id, state);
  }

  delete(id: string): boolean {
    return this.state.delete(id);
  }

  has(id: string): boolean {
    return this.state.has(id);
  }

  clear(): void {
    this.state.clear();
  }

  entries(): IterableIterator<[string, CapacitorInternalState]> {
    return this.state.entries();
  }
}

export interface KeypadStateValue {
  inputPassword: string;
  ledState: boolean;
  serialLogs: string[];
}

export class KeypadStateManager {
  private state: KeypadStateValue = {
    inputPassword: "",
    ledState: false,
    serialLogs: [],
  };
  private pressedKeys = new Set<string>();

  getState(): KeypadStateValue {
    return this.state;
  }

  reset(password: string = ""): void {
    this.state = { inputPassword: password, ledState: false, serialLogs: [] };
    this.pressedKeys.clear();
  }

  setInputPassword(val: string): void {
    this.state.inputPassword = val;
  }

  appendInputPassword(key: string): void {
    this.state.inputPassword += key;
  }

  setLedState(on: boolean): void {
    this.state.ledState = on;
  }

  pushSerialLog(msg: string): void {
    this.state.serialLogs.push(msg);
  }

  appendSerialLog(text: string): void {
    const lastIdx = this.state.serialLogs.length - 1;
    if (lastIdx >= 0) {
      this.state.serialLogs[lastIdx] = this.state.serialLogs[lastIdx] + text;
    } else {
      this.state.serialLogs.push(text);
    }
  }

  getPressedKeys(): Set<string> {
    return this.pressedKeys;
  }

  setPressedKeys(keys: Set<string>): void {
    this.pressedKeys = keys;
  }
}
