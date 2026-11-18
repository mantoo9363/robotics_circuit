import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { v4 as uuidv4 } from "uuid";
import { COMPONENT_CATALOG } from "./circuit-components";
import { type PinState, type SimulatorState } from "./arduino-simulator";
import { getSimulationSocket } from "./socket-client";
import type {
  CircuitEdge,
  CircuitNode,
  CircuitNodeData,
  HistoryState,
} from "./types";
import type { CircuitPreset } from "./circuit-presets";
import { parseServoMotionsForCircuit } from "./servo-motion";
import type {
  SimulationBoardType,
  SimulationComponentState,
  SimulationFrame,
  SimulationStartPayload,
} from "./simulation-state";
import { buildSimulationFrame, getLedForwardVoltage, registerTimestampProvider } from "./simulation-state";
import { useDynamicComponentsStore } from "../store/useDynamicComponentsStore";
import { getBreadboardAutoConnections } from "./breadboard-autoconnect";
import {
  buildConductiveGraphForStore,
  getReachableGraphNodes,
  addGraphConnection,
} from "./circuit/graph";
import {
  getResistanceOhmsForStore,
  getPhotoresistorOhmsForStore,
  getCapacitanceFaradsForStore,
  getNodeSimulationModelForStore as getNodeSimulationModel,
} from "./circuit/components";
import { parseBreadboardHandle } from "./circuit/breadboard";
import {
  getDirectArduinoAnalogPinForComponent,
  getArduinoDigitalPinForComponentConnection,
  getLedNodeIdsConnectedToArduinoPin,
} from "./circuit/pinMapping";
import { parseLcdDisplayText as parseLcdDisplayTextNew } from "./codeParsing/lcdParser";
export function createDefaultCircuit(): {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
} {
  return {
    nodes: [],
    edges: [],
  };
}

function frameToArduinoPins(frame: SimulationFrame) {
  const map = new Map<number, PinState>();
  for (const pin of frame.boardPins) {
    const lastColon = pin.handleId.lastIndexOf(":");
    const localHandleId =
      lastColon !== -1 ? pin.handleId.slice(lastColon + 1) : pin.handleId;
    if (
      !localHandleId.startsWith("d") &&
      !localHandleId.startsWith("a") &&
      !localHandleId.startsWith("gp")
    )
      continue;
    map.set(pin.pin, {
      mode: pin.mode as PinState["mode"],
      value: pin.value,
      frequency: pin.frequency,
    });
  }
  return map;
}

function frameToPoweredNodes(frame: SimulationFrame) {
  return new Set(
    Object.values(frame.components)
      .filter((component) => component.isPowered)
      .map((component) => component.nodeId),
  );
}

const MAX_HISTORY = 50;
const defaultCircuit = createDefaultCircuit();

const SIM_BROADCAST_NAME = "circuit-studio-simulation-v1";
const SIM_LAST_FRAME_LS = "circuit-studio:last-sim-frame";

export let pendingSimulationStart: SimulationStartPayload | null = null;
export function setPendingSimulationStart(v: SimulationStartPayload | null) { pendingSimulationStart = v; }
export let simulationSocketSubscribed = false;
export function resetSimulationSocketSubscribed() { simulationSocketSubscribed = false; }

let simBroadcastChannel: BroadcastChannel | null = null;
let crossTabSyncInitialized = false;
let persistFrameTimer: ReturnType<typeof setTimeout> | null = null;
let lastMirroredFrameAt = 0;
const SIMULATION_MIRROR_INTERVAL_MS = 250;
export let ignoreIncomingSimulationFrames = false;
export function setIgnoreIncomingSimulationFrames(v: boolean) { ignoreIncomingSimulationFrames = v; }
let activeSimulationStart: SimulationStartPayload | null = null;
export function setActiveSimulationStart(payload: SimulationStartPayload | null) { activeSimulationStart = payload; }
export function getActiveSimulationStart() { return activeSimulationStart; }

export const useCircuitStoreRef: { current: any } = { current: null as any };

export function __registerCircuitStore(store: any) {
  useCircuitStoreRef.current = store;
}

export const ne555StateMap = new Map<string, any>();
export const polarizedCapacitorStateMap = new Map<string, any>();

export interface LCDState {
  ddram: Uint8Array;
  cgram: Uint8Array;
  cursorColumn: number;
  cursorRow: number;
  displayEnabled: boolean;
  cursorEnabled: boolean;
  blinkEnabled: boolean;
  backlightEnabled: boolean;
  scrollOffset: number;
  incrementMode: boolean;
  autoscroll: boolean;
  i2cLog: string[];
}

export function logSimulationStartDetails(payload: SimulationStartPayload) {
  if (typeof payload === "object" && payload !== null) {
    console.group("Simulation Start Payload");
    console.log("Board type:", payload.boardType);
    console.log("Session ID:", payload.sessionId);
    console.log("Nodes:", payload.nodes?.length ?? 0);
    console.log("Edges:", payload.edges?.length ?? 0);
    console.groupEnd();
  }
}

let _pipelineFn: ((frame: SimulationFrame) => SimulationFrame) | null = null;

export function __registerPipelineFn(fn: (frame: SimulationFrame) => SimulationFrame) {
  _pipelineFn = fn;
}

function getStore() {
  if (!useCircuitStoreRef.current) throw new Error('Store not initialized');
  return useCircuitStoreRef.current;
}

function runPipeline(frame: SimulationFrame): SimulationFrame {
  if (_pipelineFn) return _pipelineFn(frame);
  return frame;
}

function getSimulationBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!simBroadcastChannel) {
    try {
      simBroadcastChannel = new BroadcastChannel(SIM_BROADCAST_NAME);
    } catch {
      return null;
    }
  }
  return simBroadcastChannel;
}

function resetSimulationVisualState() {
  getStore().setState({
    isSimulating: false,
    simulationStatus: "idle",
    simulationError: null,
    simulationFrame: null,
    poweredNodeIds: new Set<string>(),
    nodeVoltages: new Map<string, number>(),
    arduinoPins: new Map<number, PinState>(),
    serialOutput: [],
  });
}

/** Stale LS / legacy keys must never show "running" — only socket + BroadcastChannel set that. */
function tryApplyStoredSimulationFrame(raw: string | null) {
  if (!raw) return;
  try {
    const frame = JSON.parse(raw) as SimulationFrame;
    if (!frame || typeof frame.tick !== "number") return;

    if (frame.running) {
      try {
        localStorage.removeItem(SIM_LAST_FRAME_LS);
      } catch {
        /* ignore */
      }
      return;
    }

    applySimulationFrameToStore(frame, "storage");
  } catch {
    try {
      localStorage.removeItem(SIM_LAST_FRAME_LS);
    } catch {
      /* ignore */
    }
  }
}

export function clearSimulationSnapshotForOtherTabs() {
  if (typeof window === "undefined") return;
  if (persistFrameTimer) {
    clearTimeout(persistFrameTimer);
    persistFrameTimer = null;
  }
  lastMirroredFrameAt = 0;
  try {
    localStorage.removeItem(SIM_LAST_FRAME_LS);
  } catch {
    /* ignore */
  }
  try {
    getSimulationBroadcastChannel()?.postMessage({ t: "stopped" });
  } catch {
    /* ignore */
  }
}

function persistLastFrameDebounced(frame: SimulationFrame) {
  if (typeof window === "undefined") return;
  if (frame.running) return;
  if (persistFrameTimer) return;
  persistFrameTimer = setTimeout(() => {
    persistFrameTimer = null;
    try {
      localStorage.setItem(SIM_LAST_FRAME_LS, JSON.stringify(frame));
    } catch {
      /* quota or private mode */
    }
  }, 200);
}

/** Mirror simulation frames to other app tabs. */
function republishSimulationFrame(
  frame: SimulationFrame,
  mirrorToOtherTabs = true,
  forwardToCad = false,
) {
  const now = Date.now();
  const shouldMirror =
    !frame.running || now - lastMirroredFrameAt >= SIMULATION_MIRROR_INTERVAL_MS;
  if (!shouldMirror) return;
  lastMirroredFrameAt = now;
  if (mirrorToOtherTabs) {
    try {
      getSimulationBroadcastChannel()?.postMessage({ t: "frame", frame });
    } catch {
      /* ignore */
    }
  }
  try {
    const socket = getSimulationSocket();
    if (forwardToCad && socket.connected && frame.running) {
      socket.emit("simulation:cad-frame", frame);
    }
  } catch {
    /* ignore */
  }
  persistLastFrameDebounced(frame);
}

type FrameApplySource = "socket" | "broadcast" | "storage" | "local";

function applySimulationFrameToStore(
  frame: SimulationFrame,
  source: FrameApplySource,
) {
  const { currentSimulationSessionId } = getStore().getState();
  if (source === "socket") {
    if (
      currentSimulationSessionId &&
      frame.sessionId &&
      frame.sessionId !== currentSimulationSessionId
    ) {
      return;
    }
  }
  if (ignoreIncomingSimulationFrames && frame.running) return;

  // Track absolute start time for simulation frame timestamps
  let startTimestamp = getStore().getState().simulationStartTimestamp;
  const isCompiling =
    frame.running &&
    Array.isArray(frame.serialOutput) &&
    frame.serialOutput.some((line) => line.includes("[Compiling Arduino code...]"));

  if (frame.running && !isCompiling) {
    if (!startTimestamp) {
      startTimestamp = Date.now();
      getStore().setState({ simulationStartTimestamp: startTimestamp });
    }
    // Override absolute timestamp with relative milliseconds elapsed since starting
    frame.timestamp = Date.now() - startTimestamp;
  } else {
    if (startTimestamp !== null) {
      getStore().setState({ simulationStartTimestamp: null });
    }
    frame.timestamp = 0;
  }

  // Servo angle measured from the real Servo.h pulse on the AVR run
  // (telemetry.angleSource === "pwm", set by the server's evaluateServo). The
  // Arduino/Pico rebuild just below uses the client buildSimulationFrame, which
  // has no servoAngles path and would drop this — capture it now, restore it
  // after the rebuild so the horn actually rotates (ESP32 has no rebuild, which
  // is why it already works there).
  const serverServoPwm: Record<string, SimulationComponentState> = {};
  if (source === "socket") {
    for (const [id, c] of Object.entries(frame.components)) {
      if (c?.componentType === "servo" && c.telemetry?.angleSource === "pwm") {
        serverServoPwm[id] = c;
      }
    }
  }

  // For socket frames with a running Arduino/Pico board, rebuild using the
  // client's buildSimulationFrame so the two-pass relay solver (and all other
  // client-side graph logic) runs on every tick — not just when the user drags
  // a component.  This is exactly what refreshSimulationFrameFromCurrentCircuit
  // does on drag; we replicate it here so dragging is never required.
  if (
    source === "socket" &&
    frame.running &&
    !isCompiling &&
    (frame.boardType === "arduino" || frame.boardType === "pico" || frame.boardType === "esp32")
  ) {
    const storeState = getStore().getState();
    frame = buildSimulationFrame({
      tick: frame.tick,
      nodes: storeState.nodes,
      edges: storeState.edges,
      dynamicComponents: useDynamicComponentsStore.getState().components,
      boardType: frame.boardType,
      arduinoState: {
        pins: frameToArduinoPins(frame).size > 0 ? frameToArduinoPins(frame) : storeState.arduinoPins,
        serialOutput: frame.serialOutput,
        running: frame.running,
        error: frame.error,
      },
      running: frame.running,
      error: frame.error ?? null,
      timestamp: frame.timestamp,
    });
  }

  // Restore the server-measured servo angle the rebuild above discarded.
  // runPipeline's applyServoInputToFrame bails out on angleSource === "pwm",
  // so this value now survives to the store.
  if (Object.keys(serverServoPwm).length > 0) {
    frame = { ...frame, components: { ...frame.components, ...serverServoPwm } };
  }

  const effectiveFrame = runPipeline(frame);
  const componentVoltages = new Map<string, number>();
  for (const component of Object.values(effectiveFrame.components)) {
    componentVoltages.set(component.nodeId, component.voltage);
  }

  getStore().setState({
    isSimulating: effectiveFrame.running,
    simulationStatus: effectiveFrame.error
      ? "error"
      : effectiveFrame.running
        ? "running"
        : "idle",
    simulationError: effectiveFrame.error,
    simulationFrame: effectiveFrame,
    poweredNodeIds: frameToPoweredNodes(effectiveFrame),
    nodeVoltages: componentVoltages,
    serialOutput: effectiveFrame.serialOutput,
    bluetoothOutput: effectiveFrame.bluetoothOutput ?? getStore().getState().bluetoothOutput ?? [],
    bluetoothDeviceName: effectiveFrame.bluetoothDeviceName ?? getStore().getState().bluetoothDeviceName ?? null,
    arduinoPins:
      (effectiveFrame.boardType === "arduino" || effectiveFrame.boardType === "pico" || effectiveFrame.boardType === "esp32")
        ? frameToArduinoPins(effectiveFrame)
        : new Map(),
  });

  republishSimulationFrame(
    effectiveFrame,
    source === "socket" || source === "local",
    source === "socket" || source === "local",
  );
}

export function applySimulationFrameFromSocket(frame: SimulationFrame) {
  applySimulationFrameToStore(frame, "socket");
}

export function refreshSimulationFrameFromCurrentCircuit() {
  const state = getStore().getState();
  const frame = state.simulationFrame;
  if (!frame) return;

  const boardType = frame.boardType;
  const refreshedFrame = buildSimulationFrame({
    tick: frame.tick + 1,
    timestamp: frame.timestamp,
    nodes: state.nodes,
    edges: state.edges,
    dynamicComponents: useDynamicComponentsStore.getState().components,
    boardType,
    arduinoState:
      (boardType === "arduino" || boardType === "pico" || boardType === "esp32")
        ? {
          pins: state.arduinoPins,
          serialOutput: state.serialOutput,
          running: frame.running,
          error: frame.error,
        }
        : undefined,
    running: frame.running,
    error: frame.error,
  });

  applySimulationFrameToStore(refreshedFrame, "local");

  // Push updated node/edge state to the server so the Python simulator's
  // inputPinCallback picks up live button/switch changes immediately.
  if (frame.running) {
    try {
      const socket = getSimulationSocket();
      socket.emit("simulation:update-nodes", {
        nodes: state.nodes,
        edges: state.edges,
      });
    } catch {
      // socket not available — ignore
    }
  }
}

/** Subscribe to other tabs + replay last frame from localStorage (cross-tab). */
export function initSimulationCrossTabSync() {
  if (typeof window === "undefined" || crossTabSyncInitialized) return;
  crossTabSyncInitialized = true;

  const ch = getSimulationBroadcastChannel();
  if (ch) {
    ch.onmessage = (
      ev: MessageEvent<{ t?: string; frame?: SimulationFrame }>,
    ) => {
      if (ev.data?.t === "stopped") {
        resetSimulationVisualState();
        return;
      }
      if (ev.data?.t === "frame" && ev.data.frame) {
        applySimulationFrameToStore(ev.data.frame, "broadcast");
      }
    };
  }

  try {
    tryApplyStoredSimulationFrame(localStorage.getItem(SIM_LAST_FRAME_LS));
  } catch {
    /* ignore */
  }

  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key !== SIM_LAST_FRAME_LS) return;
    if (!e.newValue) {
      resetSimulationVisualState();
      return;
    }
    tryApplyStoredSimulationFrame(e.newValue);
  });
}

/** Attach frame + lifecycle handlers once per tab. */
export function ensureSimulationSocketSubscribed() {
  if (simulationSocketSubscribed) return;
  simulationSocketSubscribed = true;
  const socket = getSimulationSocket();

  socket.on("connect", () => {
    getStore().setState({ simulationBackendConnected: true });
    const payload = pendingSimulationStart ?? activeSimulationStart;
    if (payload) {
      socket.emit("simulation:start", payload);
      pendingSimulationStart = null;
    }
  });

  socket.on("disconnect", () => {
    getStore().setState({
      simulationBackendConnected: false,
    });
  });

  socket.on("connect_error", (error: Error) => {
    const state = getStore().getState();
    getStore().setState({
      simulationBackendConnected: false,
      ...(state.isSimulating
        ? {}
        : { simulationStatus: "error", simulationError: error.message }),
    });
  });

  socket.on("simulation:ready", () => {
    getStore().setState({ simulationBackendConnected: true });
    const payload = pendingSimulationStart;
    if (payload) {
      socket.emit("simulation:start", payload);
      pendingSimulationStart = null;
    }
  });

  socket.on("simulation:frame", (frame: SimulationFrame) => {
    applySimulationFrameFromSocket(frame);
  });

  socket.on("simulation:error", (payload: { error?: unknown }) => {
    getStore().setState({
      isSimulating: false,
      simulationStatus: "error",
      simulationError:
        typeof payload?.error === "string"
          ? payload.error
          : "Simulation failed.",
    });
  });
}

try {
  registerTimestampProvider(() => {
    try {
      const state = getStore().getState();
      const start = state.simulationStartTimestamp;
      if (state.isSimulating && start !== null) {
        return Date.now() - start;
      }
    } catch {
      // ignore
    }
    return Date.now();
  });
} catch {
  // ignore
}
