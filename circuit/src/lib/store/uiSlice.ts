export interface UISlice {
  circuitName: string;
  setCircuitName: (name: string) => void;
  pendingStickyNote?: boolean;
  notesVisible: boolean;
  setNotesVisible: (visible: boolean) => void;
}

export const createUISlice = (set: any, get: any): UISlice => ({
  circuitName: "Untitled Circuit",
  setCircuitName: (name) => set({ circuitName: name }),
  pendingStickyNote: false,
  notesVisible: true,
  setNotesVisible: (visible) => set({ notesVisible: visible }),
});
