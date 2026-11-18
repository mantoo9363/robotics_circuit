import { create } from "zustand";

interface EditorPanelStore {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export const useEditorPanelStore = create<EditorPanelStore>((set) => ({
  open: false,

  toggle: () =>
    set((state) => ({
      open: !state.open,
    })),

  close: () =>
    set({
      open: false,
    }),
}));