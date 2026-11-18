import { create } from "zustand";
import type { PinState } from "../arduino-simulator";
import type { CircuitPreset } from "../circuit-presets";
import type { CircuitEdge, CircuitNode, CircuitNodeData, HistoryState } from "../types";
import type {
  SimulationBoardType,
  SimulationFrame,
} from "../simulation-state";
import { __registerCircuitStore, __registerPipelineFn } from "../store-legacy";
import { applyFramePipelineLegacy, __setStores as __setPipelineStores } from "../simulation/framePipeline";
import { useDynamicComponentsStore } from "../../store/useDynamicComponentsStore";
import { createCircuitSlice } from "./circuitSlice";
import { createSimulationSlice } from "./simulationSlice";
import { createCodeSlice } from "./codeSlice";
import { createUISlice } from "./uiSlice";

interface CircuitStore {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: any) => void;

  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  setSelection: (nodeIds: string[], edgeIds: string[]) => void;

  wireColor: string;
  setWireColor: (color: string) => void;

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

  arduinoCode: string;
  setArduinoCode: (code: string) => void;
  showCodeEditor: boolean;
  toggleCodeEditor: () => void;

  selectedLanguage: "auto" | "cpp" | "python";
  setSelectedLanguage: (lang: "auto" | "cpp" | "python") => void;

  isBlocklyOpen: boolean;
  toggleBlocklyEditor: () => void;

  arduinoPins: Map<number, PinState>;
  serialOutput: string[];
  avrSerialOutput: string[];
  fallbackSerialOutput: string[];
  bluetoothOutput: string[];
  bluetoothDeviceName: string | null;
  sendBluetoothSerial: (text: string) => void;
  clearBluetoothSerial: () => void;

  picoCode: string;
  setPicoCode: (code: string) => void;

  circuitName: string;
  setCircuitName: (name: string) => void;

  loadPreset: (preset: CircuitPreset) => void;
  resetToDefault: () => void;
  addNode: (node: CircuitNode) => void;
  moveNode: (nodeId: string, position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, data: Partial<CircuitNodeData>) => void;
  deleteSelected: () => void;
  rotateSelected: () => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  history: HistoryState;
  pendingStickyNote?: boolean;
  notesVisible: boolean;
  setNotesVisible: (visible: boolean) => void;
}

export const useCircuitStore = create<CircuitStore>((set, get) => ({
  ...createCircuitSlice(set, get),
  ...createSimulationSlice(set, get),
  ...createCodeSlice(set, get),
  ...createUISlice(set, get),
}));

__registerCircuitStore(useCircuitStore);
__setPipelineStores(useCircuitStore, useDynamicComponentsStore);
__registerPipelineFn(applyFramePipelineLegacy);

export {
  applySimulationFrameFromSocket,
  refreshSimulationFrameFromCurrentCircuit,
  initSimulationCrossTabSync,
  ensureSimulationSocketSubscribed,
} from "../store-legacy";

export type { LCDState } from "../store-legacy";
