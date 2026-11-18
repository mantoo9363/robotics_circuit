// src/store/useCustomPresetsStore.ts
// Drop this file into: src/store/useCustomPresetsStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CircuitPreset } from '@cs/lib/circuit-presets';

interface CustomPresetsStore {
  customPresets: CircuitPreset[];
  addPreset: (preset: CircuitPreset) => void;
  removePreset: (id: string) => void;
  updatePreset: (id: string, preset: CircuitPreset) => void;
}

export const useCustomPresetsStore = create<CustomPresetsStore>()(
  persist(
    (set) => ({
      customPresets: [],

      addPreset: (preset) =>
        set((state) => ({
          customPresets: [...state.customPresets, preset],
        })),

      removePreset: (id) =>
        set((state) => ({
          customPresets: state.customPresets.filter((p) => p.id !== id),
        })),

      updatePreset: (id, preset) =>
        set((state) => ({
          customPresets: state.customPresets.map((p) => (p.id === id ? preset : p)),
        })),
    }),
    {
      name: 'circuit-studio-custom-presets', // localStorage key
    }
  )
);