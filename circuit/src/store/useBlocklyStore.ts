import { create } from "zustand";

interface BlocklyStore {
  code: string;
  workspaceXml: string;
  setCode: (code: string) => void;
  setWorkspaceXml: (workspaceXml: string) => void;
}

export const useBlocklyStore = create<BlocklyStore>((set) => ({
  code: "",
  workspaceXml: "",
  setCode: (code) => set({ code }),
  setWorkspaceXml: (workspaceXml) => set({ workspaceXml }),
}));
