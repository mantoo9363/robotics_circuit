import type { CircuitNode, CircuitEdge } from "../types";
import type { SimulationFrame } from "../simulation-state";
import { NE555StateManager, CapacitorStateManager, KeypadStateManager } from "./stateMaps";
import { useDynamicComponentsStore } from "../../store/useDynamicComponentsStore";

export interface SimContext {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  arduinoCode: string;
  picoCode: string;
  dynamicComponents: ReturnType<
    typeof useDynamicComponentsStore.getState
  >["components"];
  boardType: "arduino" | "pico" | "esp32" | "none";
  ne555State: NE555StateManager;
  capacitorState: CapacitorStateManager;
  keypad4x4State: KeypadStateManager;
  keypad4x3State: KeypadStateManager;
  /** Optional: language hint passed by some ESP32 tests ('cpp' | 'python' | 'auto'). */
  selectedLanguage?: "cpp" | "python" | "auto";
}
                                      
export type FrameTransformer = (
  frame: SimulationFrame,
  context: SimContext,
) => SimulationFrame;
