import { COMPONENT_CATALOG } from "../circuit-components";
import { useDynamicComponentsStore } from "../../store/useDynamicComponentsStore";
import type { CircuitNode } from "../types";
import { getLedForwardVoltage } from "../simulation-state";

const ohm = "\u03A9";

const resistanceMultipliers: Record<string, number> = {
  [`p${ohm}`]: 1e-12,
  [`n${ohm}`]: 1e-9,
  [`\u00B5${ohm}`]: 1e-6,
  [`m${ohm}`]: 1e-3,
  [ohm]: 1,
  [`k${ohm}`]: 1e3,
  [`M${ohm}`]: 1e6,
  [`G${ohm}`]: 1e9,
};

const capacitanceMultipliers: Record<string, number> = {
  pF: 1e-12,
  nF: 1e-9,
  ["\u00B5F"]: 1e-6,
  mF: 1e-3,
  F: 1,
};

export function getResistanceOhms(node: CircuitNode): number {
  const value = Number(node.data.properties?.resistance?.value ?? 0);
  if (!Number.isFinite(value)) return 0;
  const unit = String(node.data.properties?.resistance?.unit ?? ohm);
  return value * (resistanceMultipliers[unit] ?? 1);
}

export function getPhotoresistorFraction(rawLightLevel: number): number {
  const clamped = Math.max(0, Math.min(1023, rawLightLevel));
  if (clamped <= 100) {
    return (clamped / 100) * 0.5;
  }
  return 0.5 + ((clamped - 100) / 923) * 0.5;
}

export function getPhotoresistorOhms(node: CircuitNode): number {
  const rawLightLevel = Number(node.data.properties?.lightLevel?.value ?? 512);
  const fraction = getPhotoresistorFraction(rawLightLevel);
  return 100 + (1_000_000 - 100) * Math.pow(1 - fraction, 2);
}

export function getPhotoresistorAnalogValue(node: CircuitNode): number {
  const rawLightLevel = Number(node.data.properties?.lightLevel?.value ?? 512);
  const fraction = getPhotoresistorFraction(rawLightLevel);
  return Math.round(fraction * 1023);
}

export function getCapacitanceFarads(node: CircuitNode): number {
  const value = Number(node.data.properties?.capacitance?.value ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const unit = String(
    node.data.properties?.capacitance?.unit ??
      node.data.properties?.unit?.value ??
      node.data.properties?.capacitanceUnit?.value ??
      "\u00B5F",
  )
    .replace(/Âµ|Ã‚Âµ|u/g, "\u00B5")
    .trim();
  return value * (capacitanceMultipliers[unit] ?? 1e-6);
}

export function getNodeSimulationModel(node: CircuitNode): string {
  const model = node.data.simulationModel;
  if (
    typeof model === "string" &&
    model.trim().length > 0 &&
    model !== "generic"
  )
    return model;
  return (
    useDynamicComponentsStore
      .getState()
      .components.find((component) => component.type === node.data.componentType)
      ?.simulationModel ??
    COMPONENT_CATALOG.find(
      (component) => component.type === node.data.componentType,
    )?.simulationModel ??
    node.data.componentType
  );
}

export function getComponentForwardVoltage(node: CircuitNode): number {
  return getLedForwardVoltage(node);
}

export function getSlideswitchActiveThrow(node: CircuitNode): "pin1" | "pin2" {
  const state = node.data.properties?.state?.value;
  if (state === "left" || state === "off") return "pin1";
  if (state === "right" || state === "on") return "pin2";
  return "pin1";
}

// Backward-compatible exports (for store.ts)
export const getResistanceOhmsForStore = getResistanceOhms;
export const getPhotoresistorOhmsForStore = getPhotoresistorOhms;
export const getCapacitanceFaradsForStore = getCapacitanceFarads;
export const getNodeSimulationModelForStore = getNodeSimulationModel;
export const getSlideswitchActiveThrowForStore = getSlideswitchActiveThrow;