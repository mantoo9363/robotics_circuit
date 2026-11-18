export interface CodeSlice {
  arduinoCode: string;
  setArduinoCode: (code: string) => void;
  showCodeEditor: boolean;
  toggleCodeEditor: () => void;

  selectedLanguage: "auto" | "cpp" | "python";
  setSelectedLanguage: (lang: "auto" | "cpp" | "python") => void;

  isBlocklyOpen: boolean;
  toggleBlocklyEditor: () => void;

  picoCode: string;
  setPicoCode: (code: string) => void;
}

export const createCodeSlice = (set: any, get: any): CodeSlice => ({
  arduinoCode: "",
  setArduinoCode: (code) => set({ arduinoCode: code }),
  showCodeEditor: false,
  toggleCodeEditor: () =>
    set((state: any) => ({ showCodeEditor: !state.showCodeEditor })),

  selectedLanguage: "auto" as const,
  setSelectedLanguage: (lang) => set({ selectedLanguage: lang }),
  isBlocklyOpen: false,
  toggleBlocklyEditor: () =>
    set((state: any) => ({
      isBlocklyOpen: !state.isBlocklyOpen,
    })),

  picoCode: "# Write your MicroPython code here",
  setPicoCode: (code) => set({ picoCode: code }),
});
