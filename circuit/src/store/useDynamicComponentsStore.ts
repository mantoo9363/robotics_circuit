'use client';

import { create } from 'zustand';
import { COMPONENT_CATALOG, COMPONENT_THUMBNAILS } from '@cs/lib/circuit-components';
import type { ComponentDefinition, DynamicComponentBehavior } from '@cs/lib/types';

const STORAGE_KEY = 'circuit-studio:dynamic-components';

export type DynamicComponentDefinition = ComponentDefinition & {
  thumbnail: string;
  dynamicBehavior: DynamicComponentBehavior;
};

interface DynamicComponentsStore {
  components: DynamicComponentDefinition[];
  hydrated: boolean;
  hydrate: () => void;
  addComponent: (component: DynamicComponentDefinition) => void;
  removeComponent: (type: string) => void;
}

function readComponents(): DynamicComponentDefinition[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistComponents(components: DynamicComponentDefinition[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(components));
  } catch {
    /* ignore private-mode/quota failures */
  }
}

export const useDynamicComponentsStore = create<DynamicComponentsStore>((set, get) => ({
  components: [],
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ components: readComponents(), hydrated: true });
  },
  addComponent: (component) => {
    set((state) => {
      const components = [
        ...state.components.filter((item) => item.type !== component.type),
        component,
      ];
      persistComponents(components);
      return { components };
    });
  },
  removeComponent: (type) => {
    set((state) => {
      const components = state.components.filter((item) => item.type !== type);
      persistComponents(components);
      return { components };
    });
  },
}));

export function getStaticComponentDefinition(componentType: string) {
  return COMPONENT_CATALOG.find((component) => component.type === componentType);
}

export function getComponentDefinition(componentType: string, dynamicComponents?: ComponentDefinition[]) {
  return (
    getStaticComponentDefinition(componentType) ??
    dynamicComponents?.find((component) => component.type === componentType) ??
    useDynamicComponentsStore.getState().components.find((component) => component.type === componentType)
  );
}

export function getComponentCatalog(dynamicComponents: ComponentDefinition[]) {
  return [...COMPONENT_CATALOG, ...dynamicComponents];
}

export function getComponentThumbnail(componentType: string, dynamicComponents?: ComponentDefinition[]) {
  return (
    COMPONENT_THUMBNAILS[componentType] ??
    getComponentDefinition(componentType, dynamicComponents)?.thumbnail ??
    ''
  );
}
