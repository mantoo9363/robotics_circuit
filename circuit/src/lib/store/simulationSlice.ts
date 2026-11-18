import { getSimulationSocket } from "../socket-client";
import type { PinState } from "../arduino-simulator";
import type { CircuitPreset } from "../circuit-presets";
import type { CircuitNode } from "../types";
import type {
  SimulationBoardType,
  SimulationFrame,
  SimulationStartPayload,
} from "../simulation-state";
import { parseServoMotionsForCircuit } from "../servo-motion";
import { SimulationSession } from "../simulation-session";
import { resolveEsp32Language } from "../circuit/languageUtils";
import { useDynamicComponentsStore } from "../../store/useDynamicComponentsStore";
import {
  ne555StateMap,
  polarizedCapacitorStateMap,
  setPendingSimulationStart,
  setIgnoreIncomingSimulationFrames,
  clearSimulationSnapshotForOtherTabs,
  ensureSimulationSocketSubscribed,
  createDefaultCircuit,
  logSimulationStartDetails,
  applySimulationFrameFromSocket,
  setActiveSimulationStart,
} from "../store-legacy";

let localSimulationSession: SimulationSession | null = null;

export interface SimulationSlice {
  isSimulating: boolean;
  simulationStatus: "idle" | "connecting" | "running" | "error";
  simulationBackendConnected: boolean;
  simulationError: string | null;
  simulationFrame: SimulationFrame | null;
  currentSimulationSessionId: string | null;
  poweredNodeIds: Set<string>;
  nodeVoltages: Map<string, number>;
  simulationStartTimestamp: number | null;
  toggleSimulation: () => Promise<void>;

  activeBoardType: SimulationBoardType;
  detectBoardType: () => SimulationBoardType;

  arduinoPins: Map<number, PinState>;
  serialOutput: string[];
  avrSerialOutput: string[];
  fallbackSerialOutput: string[];
  bluetoothOutput: string[];
  bluetoothDeviceName: string | null;
  sendBluetoothSerial: (text: string) => void;
  clearBluetoothSerial: () => void;

  loadPreset: (preset: CircuitPreset) => void;
  resetToDefault: () => void;
}

export const createSimulationSlice = (set: any, get: any): SimulationSlice => ({
  isSimulating: false,
  simulationStatus: "idle",
  simulationBackendConnected: false,
  simulationError: null,
  simulationFrame: null,
  currentSimulationSessionId: null as string | null,
  poweredNodeIds: new Set<string>(),
  nodeVoltages: new Map<string, number>(),
  simulationStartTimestamp: null as number | null,

  activeBoardType: "arduino",
  detectBoardType: () => {
    const nodes: CircuitNode[] = get().nodes;
    const hasArduino = nodes.some(
      (node: CircuitNode) => (node.data.componentType || node.type) === "arduino",
    );
    const hasPico = nodes.some(
      (node: CircuitNode) => (node.data.componentType || node.type) === "raspberrypipico",
    );
    const hasEsp32 = nodes.some(
      (node: CircuitNode) => (node.data.componentType || node.type) === "esp32",
    );
    const boardType: SimulationBoardType = hasArduino
      ? "arduino"
      : hasPico
        ? "pico"
        : hasEsp32
          ? "esp32"
          : "none";
    console.log(
      boardType,
      hasArduino,
      hasPico,
      "boardType>>>>>>>>>>>>>>>>>>>>",
    );
    if (process.env.NODE_ENV === "development") {
      console.log("[Simulation] Board Type Detected:", boardType, { hasArduino, hasPico });
    }
    set({ activeBoardType: boardType });
    return boardType;
  },

  arduinoPins: new Map<number, PinState>(),
  serialOutput: [],
  avrSerialOutput: [],
  fallbackSerialOutput: [],
  bluetoothOutput: [],
  bluetoothDeviceName: null,
  sendBluetoothSerial: (text: string) => {
    // Dynamic import to avoid circular dependency
    import("../esp32/parser/cppBluetoothSerial").then(({ pushGlobalBluetoothRx }) => {
      pushGlobalBluetoothRx(text);
    });
  },
  clearBluetoothSerial: () => {
    set({ bluetoothOutput: [] });
  },

  toggleSimulation: async () => {
    const socket = getSimulationSocket();
    const {
      isSimulating,
      simulationStatus,
      nodes,
      edges,
      arduinoCode,
      picoCode,
      detectBoardType,
      selectedLanguage,
    } = get();

    if (isSimulating || simulationStatus === "connecting") {
      localSimulationSession?.stop();
      localSimulationSession = null;
      setActiveSimulationStart(null);
      setIgnoreIncomingSimulationFrames(true);
      setPendingSimulationStart(null);
      if (socket.connected) {
        socket.emit("simulation:stop");
      } else {
        socket.disconnect();
      }
      clearSimulationSnapshotForOtherTabs();
      ne555StateMap.clear();
      polarizedCapacitorStateMap.clear();
      import("../esp32/parser/cppBluetoothSerial").then(({ clearGlobalBluetoothRx, resetEsp32CppBluetoothSessions }) => {
        clearGlobalBluetoothRx();
        resetEsp32CppBluetoothSessions();
      });
      set({
        isSimulating: false,
        simulationStatus: "idle",
        simulationError: null,
        simulationFrame: null,
        currentSimulationSessionId: null,
        poweredNodeIds: new Set<string>(),
        nodeVoltages: new Map<string, number>(),
        arduinoPins: new Map<number, PinState>(),
        serialOutput: [],
        bluetoothOutput: [],
        bluetoothDeviceName: null,
      });
      return;
    }

    ensureSimulationSocketSubscribed();
    setIgnoreIncomingSimulationFrames(false);
    ne555StateMap.clear();
    polarizedCapacitorStateMap.clear();

    const boardType = detectBoardType();
    const hasArduino = nodes.some(
      (node: CircuitNode) => (node.data.componentType || node.type) === "arduino",
    );
    const hasPico = nodes.some(
      (node: CircuitNode) => (node.data.componentType || node.type) === "raspberrypipico",
    );
    const hasEsp32 = nodes.some(
      (node: CircuitNode) => (node.data.componentType || node.type) === "esp32",
    );
    const esp32Buffer = hasEsp32 && !hasArduino
      ? resolveEsp32Language(selectedLanguage, arduinoCode, picoCode)
      : null;
    const effectiveIsPython = esp32Buffer
      ? esp32Buffer.isPython
      : (selectedLanguage === "auto" ? hasPico && !hasArduino : selectedLanguage === "python");
    const effectiveCode = esp32Buffer
      ? (esp32Buffer.buffer === "pico" ? picoCode : arduinoCode)
      : (effectiveIsPython ? picoCode : arduinoCode);

    const dynamicComponents = useDynamicComponentsStore.getState().components;
    const sessionId = String(Date.now());
    const servoMotions =
      boardType === "arduino"
        ? parseServoMotionsForCircuit(effectiveCode, nodes, edges)
        : [];
    const payload: SimulationStartPayload = {
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
      dynamicComponents: structuredClone(dynamicComponents),
      boardType,
      arduinoCode: effectiveCode,
      picoCode,
      servoMotions,
      sessionId,
    };

    logSimulationStartDetails(payload);

    set({
      simulationStatus: "connecting",
      simulationError: null,
      activeBoardType: boardType,
      currentSimulationSessionId: sessionId,
      serialOutput: [],
    });

    localSimulationSession = new SimulationSession((frame) => {
      applySimulationFrameFromSocket({ ...frame, sessionId });
    });
    localSimulationSession.start(payload);
    setActiveSimulationStart(payload);

    if (!socket.connected) {
      setPendingSimulationStart(payload);
      socket.connect();
      return;
    }

    setPendingSimulationStart(null);
    set({ simulationBackendConnected: true });
    socket.emit("simulation:start", payload);
  },

  loadPreset: (preset) => {
    const socket = getSimulationSocket();
    localSimulationSession?.stop();
    localSimulationSession = null;
    setActiveSimulationStart(null);
    socket.emit("simulation:stop");
    clearSimulationSnapshotForOtherTabs();
    ne555StateMap.clear();
    polarizedCapacitorStateMap.clear();

    get().pushHistory();
    set({
      circuitName: preset.label || "Untitled Circuit",
      nodes: structuredClone(preset.nodes),
      edges: structuredClone(preset.edges),
      isSimulating: false,
      simulationStatus: "idle",
      simulationError: null,
      simulationFrame: null,
      poweredNodeIds: new Set<string>(),
      nodeVoltages: new Map<string, number>(),
      arduinoPins: new Map<number, PinState>(),
      serialOutput: [],
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedLanguage: "auto",
      ...(preset.arduinoCode ? { arduinoCode: preset.arduinoCode } : {}),
      ...(preset.picoCode ? { picoCode: preset.picoCode } : {}),
    });
  },

  resetToDefault: () => {
    const socket = getSimulationSocket();
    localSimulationSession?.stop();
    localSimulationSession = null;
    setActiveSimulationStart(null);
    socket.emit("simulation:stop");
    clearSimulationSnapshotForOtherTabs();
    ne555StateMap.clear();
    polarizedCapacitorStateMap.clear();

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("circuit-studio:circuit-state");
      } catch {
        /* ignore */
      }
    }

    const defaultCirc = createDefaultCircuit();
    set({
      circuitName: "Untitled Circuit",
      nodes: defaultCirc.nodes,
      edges: defaultCirc.edges,
      isSimulating: false,
      simulationStatus: "idle",
      simulationError: null,
      simulationFrame: null,
      poweredNodeIds: new Set<string>(),
      nodeVoltages: new Map<string, number>(),
      arduinoPins: new Map<number, PinState>(),
      serialOutput: [],
      selectedNodeIds: [],
      selectedEdgeIds: [],
      arduinoCode: "",
      picoCode: "# Write your MicroPython code here",
      selectedLanguage: "auto",
    });
  },
});
