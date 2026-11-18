import type { Node, Edge } from '@xyflow/react';

export interface PinDefinition {
  id: string;
  label: string;
  description?: string;
  position: { x: number; y: number };
}

export interface PropertyDefinition {
  label: string;
  type: 'number' | 'string' | 'select';
  value: string | number;
  unit?: string;
  options?: string[];
  min?: number;
  max?: number;
}

export type ComponentCategory = 'basic' | 'output' | 'input' | 'power' | 'all';

export interface ComponentDefinition {
  type: string;
  label: string;
  category: ComponentCategory;
  simulationModel?: string;
  defaultProperties: Record<string, PropertyDefinition>;
  pins: PinDefinition[];
  defaultWidth: number;
  defaultHeight: number;
  thumbnail?: string;
  dynamicBehavior?: DynamicComponentBehavior;
  dynamicFields?: DynamicFieldDefinition[];
}

export type DynamicFieldType = 'text' | 'color' | 'file';

export interface DynamicFieldDefinition {
  id: string;
  label: string;
  type: DynamicFieldType;
  defaultValue?: string;
}

export type DynamicActionKind = 'none' | 'showText' | 'showImage' | 'toggleText' | 'toggleImage';

export interface DynamicComponentAction {
  kind: DynamicActionKind;
  text?: string;
  imageSrc?: string;
}

export interface DynamicComponentBehavior {
  singleClick: DynamicComponentAction;
  doubleClick: DynamicComponentAction;
  simulationStart: DynamicComponentAction;
}

export interface CircuitNodeData {
  componentType: string;
  simulationModel?: string;
  label: string;
  properties: Record<string, PropertyDefinition>;
  rotation: number;
  [key: string]: unknown;
}

export interface CircuitEdgeData {
  color: string;
  [key: string]: unknown;
}

export type CircuitNode = Node<CircuitNodeData>;
export type CircuitEdge = Edge<CircuitEdgeData>;

export interface HistoryState {
  past: Array<{ nodes: CircuitNode[]; edges: CircuitEdge[] }>;
  future: Array<{ nodes: CircuitNode[]; edges: CircuitEdge[] }>;
}
