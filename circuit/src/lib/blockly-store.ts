import { create } from "zustand";

interface BlocklyState {
  code: string;
  setCode: (code: string) => void;
}

export const useBlocklyStore = create<BlocklyState>((set) => ({
  code: "",
  setCode: (code) => set({ code }),
}));