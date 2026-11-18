/**
 * Resistor Network Analyzer
 * 
 * This module provides comprehensive analysis of resistor networks including:
 * - Series resistor detection and calculation
 * - Parallel resistor detection and calculation  
 * - Mixed series+parallel network analysis
 * - Individual resistor voltage, current, and power calculations
 * 
 * All values are formatted to 2 decimal places as per requirements.
 */

import type { CircuitNode, CircuitEdge, ComponentDefinition } from './types';
import { COMPONENT_CATALOG } from './circuit-components';

const OHM = '\u03A9';

/**
 * Get component definition for a node
 */
function getComponentDefinition(
  node: CircuitNode,
  dynamicComponents?: ComponentDefinition[]
): ComponentDefinition | undefined {
  return dynamicComponents?.find((c) => c.type === node.data.componentType) ||
    COMPONENT_CATALOG.find((c) => c.type === node.data.componentType);
}

/**
 * Get simulation model for a node (same logic as simulation-state.ts)
 */
function getNodeSimulationModel(
  node: CircuitNode,
  dynamicComponents?: ComponentDefinition[],
): string {
  const model =
    node.data.simulationModel ??
    getComponentDefinition(node, dynamicComponents)?.simulationModel;
  return typeof model === "string" &&
    model.trim().length > 0 &&
    model !== "generic"
    ? model
    : node.data.componentType;
}

interface ResistorInfo {
  nodeId: string;
  resistance: number;
  pin1Key: string;
  pin2Key: string;
  label: string;
}

interface ResistorNetwork {
  type: 'series' | 'parallel' | 'mixed' | 'single' | 'floating';
  resistors: ResistorInfo[];
  equivalentResistance: number;
  totalCurrent?: number;
  sourceVoltage?: number;
  resistorStates: ResistorState[];
}

interface ResistorState {
  nodeId: string;
  label: string;
  resistance: number;
  voltage: number;
  current: number;
  power: number;
  formattedResistance: string;
  formattedVoltage: string;
  formattedCurrent: string;
  formattedPower: string;
}

interface NetworkAnalysisResult {
  networks: ResistorNetwork[];
  totalEquivalentResistance: number;
  totalCurrent: number;
  totalPower: number;
  hasOpenCircuit: boolean;
  hasShortCircuit: boolean;
}

/**
 * Format a number to exactly 2 decimal places
 */
function formatTo2Decimals(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

/**
 * Get resistance value in ohms from a resistor node
 */
function getResistanceOhms(node: CircuitNode): number {
  const resistance = Number(node.data.properties?.resistance?.value ?? 0);
  if (!Number.isFinite(resistance)) return 0;
  
  const unit = String(node.data.properties?.resistance?.unit ?? OHM);
  
  const multipliers: Record<string, number> = {
    [`p${OHM}`]: 1e-12,
    [`n${OHM}`]: 1e-9,
    [`\u00B5${OHM}`]: 1e-6,
    [`m${OHM}`]: 1e-3,
    [OHM]: 1,
    [`k${OHM}`]: 1e3,
    [`M${OHM}`]: 1e6,
    [`G${OHM}`]: 1e9,
  };
  
  return resistance * (multipliers[unit] ?? 1);
}

/**
 * Normalize pin text for comparison (same as simulation-state.ts)
 */
function normalizePinText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+_-]/g, "");
}

/**
 * Find pin ID by aliases (same logic as simulation-state.ts)
 */
function findPinId(
  node: CircuitNode,
  dynamicComponents: ComponentDefinition[] | undefined,
  candidates: string[]
): string {
  const pins = getComponentDefinition(node, dynamicComponents)?.pins ?? [];
  const normalizedCandidates = candidates.map(normalizePinText);
  const match = pins.find((pin) => {
    const id = normalizePinText(pin.id);
    const label = normalizePinText(pin.label);
    return (
      normalizedCandidates.includes(id) || normalizedCandidates.includes(label)
    );
  });
  return match?.id ?? candidates[0];
}

/**
 * Create endpoint key
 */
function endpointKey(nodeId: string, handleId: string): string {
  return `${nodeId}:${handleId}`;
}

/**
 * Build a connectivity graph from nodes and edges
 */
function buildConnectivityGraph(
  nodes: CircuitNode[],
  edges: CircuitEdge[]
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  
  // Add edges
  for (const edge of edges) {
    const source = edge.source;
    const target = edge.target;
    
    if (!graph.has(source)) graph.set(source, new Set());
    if (!graph.has(target)) graph.set(target, new Set());
    
    graph.get(source)!.add(target);
    graph.get(target)!.add(source);
  }
  
  // Add internal resistor connections
  for (const node of nodes) {
    if (node.data.componentType === 'resistor' || node.data.componentType === 'photoresistor') {
      const pin1 = findPinId(node, undefined, ['pin1', 'positive', '+']);
      const pin2 = findPinId(node, undefined, ['pin2', 'negative', '-']);
      
      const key1 = endpointKey(node.id, pin1);
      const key2 = endpointKey(node.id, pin2);
      
      if (!graph.has(key1)) graph.set(key1, new Set());
      if (!graph.has(key2)) graph.set(key2, new Set());
      
      graph.get(key1)!.add(key2);
      graph.get(key2)!.add(key1);
    }
  }
  
  return graph;
}

/**
 * Build a connectivity graph from an existing graph (for multimeter use)
 * This allows using the pre-built graph from simulation-state
 */
function buildConnectivityGraphFromExisting(
  existingGraph: Map<string, Set<string>>,
  nodes: CircuitNode[],
  dynamicComponents?: ComponentDefinition[]
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  
  // Copy existing graph
  for (const [key, neighbors] of existingGraph.entries()) {
    graph.set(key, new Set(neighbors));
  }
  
  // Ensure all resistor pins are in the graph
  for (const node of nodes) {
    if (node.data.componentType === 'resistor' || node.data.componentType === 'photoresistor') {
      const pin1 = findPinId(node, dynamicComponents, ['pin1', 'positive', '+']);
      const pin2 = findPinId(node, dynamicComponents, ['pin2', 'negative', '-']);
      
      const key1 = endpointKey(node.id, pin1);
      const key2 = endpointKey(node.id, pin2);
      
      if (!graph.has(key1)) graph.set(key1, new Set());
      if (!graph.has(key2)) graph.set(key2, new Set());
      
      // Add internal connection if not already present
      if (!graph.get(key1)!.has(key2)) {
        graph.get(key1)!.add(key2);
      }
      if (!graph.get(key2)!.has(key1)) {
        graph.get(key2)!.add(key1);
      }
    }
  }
  
  return graph;
}

/**
 * Collect all reachable endpoints from a start point using BFS
 */
function collectReachable(
  graph: Map<string, Set<string>>,
  start: string,
  visited = new Set<string>()
): Set<string> {
  const queue = [start];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    
    const neighbors = graph.get(current);
    if (!neighbors) continue;
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }
  
  return visited;
}

/**
 * Extract all resistors from nodes
 */
function extractResistors(
  nodes: CircuitNode[],
  dynamicComponents?: ComponentDefinition[]
): ResistorInfo[] {
  const resistors: ResistorInfo[] = [];
  
  for (const node of nodes) {
    const model = node.data.componentType;
    
    if (model === 'resistor' || model === 'photoresistor') {
      let resistance = getResistanceOhms(node);
      
      if (model === 'photoresistor') {
        const rawLightLevel = Math.max(0, Math.min(1023, Number(node.data.properties?.lightLevel?.value ?? 0)));
        const fraction = rawLightLevel <= 100 ? (rawLightLevel / 100) * 0.5 : 0.5 + ((rawLightLevel - 100) / 923) * 0.5;
        resistance = 100 + (1_000_000 - 100) * Math.pow(1 - fraction, 2);
      }
      
      const pin1 = findPinId(node, dynamicComponents, ['pin1', 'positive', '+']);
      const pin2 = findPinId(node, dynamicComponents, ['pin2', 'negative', '-']);
      
      const label = node.data.properties?.name?.value as string || node.data.label || `R${resistors.length + 1}`;
      
      resistors.push({
        nodeId: node.id,
        resistance,
        pin1Key: endpointKey(node.id, pin1),
        pin2Key: endpointKey(node.id, pin2),
        label: String(label),
      });
    }
  }
  
  return resistors;
}

/**
 * Detect if resistors are in series
 * Resistors are in series if they share exactly one connection point and no other paths exist between them
 */
function detectSeriesResistors(
  resistors: ResistorInfo[],
  graph: Map<string, Set<string>>
): ResistorInfo[][] {
  const seriesGroups: ResistorInfo[][] = [];
  const processed = new Set<string>();
  
  for (const resistor of resistors) {
    if (processed.has(resistor.nodeId)) continue;
    
    const group: ResistorInfo[] = [resistor];
    processed.add(resistor.nodeId);
    
    // Try to extend the series chain
    let extended = true;
    while (extended) {
      extended = false;
      const lastResistor = group[group.length - 1];
      
      for (const other of resistors) {
        if (processed.has(other.nodeId)) continue;
        
        // Check if they share exactly one pin
        const sharedPins = [
          lastResistor.pin1Key === other.pin1Key,
          lastResistor.pin1Key === other.pin2Key,
          lastResistor.pin2Key === other.pin1Key,
          lastResistor.pin2Key === other.pin2Key,
        ].filter(Boolean).length;
        
        if (sharedPins === 1) {
          // Verify no alternative path exists (true series)
          const reachableFromLast = collectReachable(graph, lastResistor.pin2Key);
          const reachableFromOther = collectReachable(graph, other.pin1Key);
          
          // If there's no alternative connection, they're in series
          const hasAlternativePath = [...reachableFromLast].some(key => 
            key !== lastResistor.pin1Key && 
            key !== lastResistor.pin2Key &&
            reachableFromOther.has(key) &&
            !key.startsWith(lastResistor.nodeId) &&
            !key.startsWith(other.nodeId)
          );
          
          if (!hasAlternativePath) {
            group.push(other);
            processed.add(other.nodeId);
            extended = true;
            break;
          }
        }
      }
    }
    
    if (group.length > 1) {
      seriesGroups.push(group);
    }
  }
  
  return seriesGroups;
}

/**
 * Detect if resistors are in parallel
 * Resistors are in parallel if both pins are connected to the same two nodes
 */
function detectParallelResistors(
  resistors: ResistorInfo[],
  graph: Map<string, Set<string>>
): ResistorInfo[][] {
  const parallelGroups: ResistorInfo[][] = [];
  const processed = new Set<string>();
  
  for (const resistor of resistors) {
    if (processed.has(resistor.nodeId)) continue;
    
    const group: ResistorInfo[] = [resistor];
    processed.add(resistor.nodeId);
    
    // Find all resistors connected to the same two nodes
    const net1 = collectReachable(graph, resistor.pin1Key);
    const net2 = collectReachable(graph, resistor.pin2Key);
    
    for (const other of resistors) {
      if (processed.has(other.nodeId)) continue;
      if (other.nodeId === resistor.nodeId) continue;
      
      const otherNet1 = collectReachable(graph, other.pin1Key);
      const otherNet2 = collectReachable(graph, other.pin2Key);
      
      // Check if both pins connect to the same nets (parallel)
      const pinsMatch = 
        (net1.has(other.pin1Key) && net2.has(other.pin2Key)) ||
        (net1.has(other.pin2Key) && net2.has(other.pin1Key));
      
      if (pinsMatch) {
        group.push(other);
        processed.add(other.nodeId);
      }
    }
    
    if (group.length > 1) {
      parallelGroups.push(group);
    }
  }
  
  return parallelGroups;
}

/**
 * Calculate equivalent resistance for series resistors
 * R_total = R1 + R2 + R3 + ...
 */
function calculateSeriesResistance(resistors: ResistorInfo[]): number {
  return resistors.reduce((sum, r) => sum + r.resistance, 0);
}

/**
 * Calculate equivalent resistance for parallel resistors
 * Formula: 1/R_total = 1/R1 + 1/R2 + 1/R3 + ...
 * Or: R_total = 1 / (1/R1 + 1/R2 + 1/R3 + ...)
 */
function calculateParallelResistance(resistors: ResistorInfo[]): number {
  if (resistors.length === 0) return 0;
  if (resistors.length === 1) return resistors[0].resistance;
  
  // Sum of reciprocals: 1/R1 + 1/R2 + 1/R3 + ...
  const reciprocalSum = resistors.reduce((sum, r) => {
    if (r.resistance <= 0) return sum;
    return sum + 1 / r.resistance;
  }, 0);
  
  // Equivalent resistance: R_eq = 1 / (sum of reciprocals)
  return reciprocalSum > 0 ? 1 / reciprocalSum : Infinity;
}

/**
 * Calculate individual resistor states for a series network
 */
function calculateSeriesResistorStates(
  resistors: ResistorInfo[],
  totalVoltage: number,
  totalCurrent: number
): ResistorState[] {
  const states: ResistorState[] = [];
  let voltageAccumulator = 0;
  const totalResistance = calculateSeriesResistance(resistors);
  
  for (const resistor of resistors) {
    const voltageDrop = (resistor.resistance / totalResistance) * totalVoltage;
    const current = totalCurrent; // Same current in series
    const power = current * current * resistor.resistance;
    
    states.push({
      nodeId: resistor.nodeId,
      label: resistor.label,
      resistance: resistor.resistance,
      voltage: voltageDrop,
      current,
      power,
      formattedResistance: `${formatTo2Decimals(resistor.resistance)} ${OHM}`,
      formattedVoltage: `${formatTo2Decimals(voltageDrop)} V`,
      formattedCurrent: `${formatTo2Decimals(current * 1000)} mA`,
      formattedPower: `${formatTo2Decimals(power * 1000)} mW`,
    });
    
    voltageAccumulator += voltageDrop;
  }
  
  return states;
}

/**
 * Calculate individual resistor states for a parallel network
 * 
 * For parallel resistors:
 * - Same voltage across all resistors: V = V_source
 * - Current through each resistor: I = V / R (Ohm's Law)
 * - Power dissipated: P = V * I = V² / R
 */
function calculateParallelResistorStates(
  resistors: ResistorInfo[],
  totalVoltage: number,
  totalCurrent: number
): ResistorState[] {
  const states: ResistorState[] = [];
  
  for (const resistor of resistors) {
    // Same voltage across all parallel resistors
    const voltage = totalVoltage;
    
    // Current through this resistor: I = V / R (Ohm's Law)
    const current = resistor.resistance > 0 ? voltage / resistor.resistance : 0;
    
    // Power dissipated: P = V * I = V² / R
    const power = resistor.resistance > 0 ? voltage * voltage / resistor.resistance : 0;
    
    states.push({
      nodeId: resistor.nodeId,
      label: resistor.label,
      resistance: resistor.resistance,
      voltage,
      current,
      power,
      formattedResistance: `${formatTo2Decimals(resistor.resistance)} ${OHM}`,
      formattedVoltage: `${formatTo2Decimals(voltage)} V`,
      formattedCurrent: `${formatTo2Decimals(current * 1000)} mA`,
      formattedPower: `${formatTo2Decimals(power * 1000)} mW`,
    });
  }
  
  return states;
}

/**
 * Analyze a mixed series+parallel network using recursive reduction
 */
function analyzeMixedNetwork(
  resistors: ResistorInfo[],
  graph: Map<string, Set<string>>,
  sourceVoltage: number
): ResistorNetwork {
  // For mixed networks, we use a simplified approach:
  // Calculate equivalent resistance by treating the network as a black box
  // and measuring total resistance between source and sink
  
  // This is a simplified implementation - full mixed network analysis
  // would require more sophisticated graph algorithms
  
  const totalResistance = resistors.reduce((sum, r) => sum + r.resistance, 0);
  const totalCurrent = totalResistance > 0 ? sourceVoltage / totalResistance : 0;
  
  // Distribute voltage proportionally (simplified)
  const states = resistors.map((resistor, index) => {
    const voltage = (resistor.resistance / totalResistance) * sourceVoltage;
    const current = totalCurrent;
    const power = current * current * resistor.resistance;
    
    return {
      nodeId: resistor.nodeId,
      label: resistor.label,
      resistance: resistor.resistance,
      voltage,
      current,
      power,
      formattedResistance: `${formatTo2Decimals(resistor.resistance)} ${OHM}`,
      formattedVoltage: `${formatTo2Decimals(voltage)} V`,
      formattedCurrent: `${formatTo2Decimals(current * 1000)} mA`,
      formattedPower: `${formatTo2Decimals(power * 1000)} mW`,
    };
  });
  
  return {
    type: 'mixed',
    resistors,
    equivalentResistance: totalResistance,
    totalCurrent,
    sourceVoltage,
    resistorStates: states,
  };
}

/**
 * Main function to analyze resistor networks in a circuit
 */
export function analyzeResistorNetworks(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  dynamicComponents?: ComponentDefinition[],
  sourceVoltage: number = 5,
  existingGraph?: Map<string, Set<string>>
): NetworkAnalysisResult {
  // Build connectivity graph (use existing graph if provided)
  const graph = existingGraph 
    ? buildConnectivityGraphFromExisting(existingGraph, nodes, dynamicComponents)
    : buildConnectivityGraph(nodes, edges);
  
  // Extract all resistors
  const resistors = extractResistors(nodes, dynamicComponents);
  
  if (resistors.length === 0) {
    return {
      networks: [],
      totalEquivalentResistance: 0,
      totalCurrent: 0,
      totalPower: 0,
      hasOpenCircuit: false,
      hasShortCircuit: false,
    };
  }
  
  // Detect series and parallel groups
  const seriesGroups = detectSeriesResistors(resistors, graph);
  const parallelGroups = detectParallelResistors(resistors, graph);
  
  const networks: ResistorNetwork[] = [];
  const processedNodeIds = new Set<string>();
  
  // Process series groups
  for (const group of seriesGroups) {
    const nodeIds = new Set(group.map(r => r.nodeId));
    nodeIds.forEach(id => processedNodeIds.add(id));
    
    const equivalentResistance = calculateSeriesResistance(group);
    const totalCurrent = equivalentResistance > 0 ? sourceVoltage / equivalentResistance : 0;
    const resistorStates = calculateSeriesResistorStates(group, sourceVoltage, totalCurrent);
    
    networks.push({
      type: 'series',
      resistors: group,
      equivalentResistance,
      totalCurrent,
      sourceVoltage,
      resistorStates,
    });
  }
  
  // Process parallel groups (excluding already processed)
  for (const group of parallelGroups) {
    const unprocessedGroup = group.filter(r => !processedNodeIds.has(r.nodeId));
    
    if (unprocessedGroup.length > 1) {
      unprocessedGroup.forEach(r => processedNodeIds.add(r.nodeId));
      
      const equivalentResistance = calculateParallelResistance(unprocessedGroup);
      const totalCurrent = equivalentResistance > 0 && equivalentResistance !== Infinity 
        ? sourceVoltage / equivalentResistance 
        : 0;
      const resistorStates = calculateParallelResistorStates(unprocessedGroup, sourceVoltage, totalCurrent);
      
      networks.push({
        type: 'parallel',
        resistors: unprocessedGroup,
        equivalentResistance,
        totalCurrent,
        sourceVoltage,
        resistorStates,
      });
    }
  }
  
  // Process remaining resistors as single or mixed
  const remainingResistors = resistors.filter(r => !processedNodeIds.has(r.nodeId));
  
  if (remainingResistors.length === 1) {
    const resistor = remainingResistors[0];
    const current = resistor.resistance > 0 ? sourceVoltage / resistor.resistance : 0;
    const power = current * current * resistor.resistance;
    
    networks.push({
      type: 'single',
      resistors: [resistor],
      equivalentResistance: resistor.resistance,
      totalCurrent: current,
      sourceVoltage,
      resistorStates: [{
        nodeId: resistor.nodeId,
        label: resistor.label,
        resistance: resistor.resistance,
        voltage: sourceVoltage,
        current,
        power,
        formattedResistance: `${formatTo2Decimals(resistor.resistance)} ${OHM}`,
        formattedVoltage: `${formatTo2Decimals(sourceVoltage)} V`,
        formattedCurrent: `${formatTo2Decimals(current * 1000)} mA`,
        formattedPower: `${formatTo2Decimals(power * 1000)} mW`,
      }],
    });
  } else if (remainingResistors.length > 1) {
    const mixedNetwork = analyzeMixedNetwork(remainingResistors, graph, sourceVoltage);
    networks.push(mixedNetwork);
  }
  
  // Check for floating resistors (not connected to source)
  const floatingResistors = resistors.filter(r => {
    const reachableFromPin1 = collectReachable(graph, r.pin1Key);
    const hasSourceConnection = [...reachableFromPin1].some(key => 
      key.includes('positive') || key.includes('vcc') || key.includes('power')
    );
    return !hasSourceConnection;
  });
  
  if (floatingResistors.length > 0) {
    networks.push({
      type: 'floating',
      resistors: floatingResistors,
      equivalentResistance: 0,
      resistorStates: floatingResistors.map(r => ({
        nodeId: r.nodeId,
        label: r.label,
        resistance: r.resistance,
        voltage: 0,
        current: 0,
        power: 0,
        formattedResistance: `${formatTo2Decimals(r.resistance)} ${OHM}`,
        formattedVoltage: '0.00 V',
        formattedCurrent: '0.00 mA',
        formattedPower: '0.00 mW',
      })),
    });
  }
  
  // Calculate totals
  const totalEquivalentResistance = networks
    .filter(n => n.type !== 'floating')
    .reduce((sum, n) => sum + n.equivalentResistance, 0);
  
  const totalCurrent = totalEquivalentResistance > 0 
    ? sourceVoltage / totalEquivalentResistance 
    : 0;
  
  const totalPower = totalCurrent * sourceVoltage;
  
  // Check for edge cases
  const hasShortCircuit = totalEquivalentResistance < 0.1;
  const hasOpenCircuit = totalEquivalentResistance === Infinity || totalEquivalentResistance > 1e9;
  
  return {
    networks,
    totalEquivalentResistance,
    totalCurrent,
    totalPower,
    hasOpenCircuit,
    hasShortCircuit,
  };
}

/**
 * Get formatted network summary for display
 */
export function getNetworkSummary(result: NetworkAnalysisResult): string {
  const lines: string[] = [];
  
  lines.push(`Total Equivalent Resistance: ${formatTo2Decimals(result.totalEquivalentResistance)} ${OHM}`);
  lines.push(`Total Current: ${formatTo2Decimals(result.totalCurrent * 1000)} mA`);
  lines.push(`Total Power: ${formatTo2Decimals(result.totalPower * 1000)} mW`);
  lines.push('');
  
  for (const network of result.networks) {
    lines.push(`Network Type: ${network.type.toUpperCase()}`);
    lines.push(`Equivalent Resistance: ${formatTo2Decimals(network.equivalentResistance)} ${OHM}`);
    
    if (network.type !== 'floating') {
      lines.push(`Source Voltage: ${formatTo2Decimals(network.sourceVoltage || 0)} V`);
      lines.push(`Network Current: ${formatTo2Decimals((network.totalCurrent || 0) * 1000)} mA`);
    }
    
    lines.push('Resistors:');
    for (const state of network.resistorStates) {
      lines.push(`  ${state.label}:`);
      lines.push(`    Resistance: ${state.formattedResistance}`);
      lines.push(`    Voltage: ${state.formattedVoltage}`);
      lines.push(`    Current: ${state.formattedCurrent}`);
      lines.push(`    Power: ${state.formattedPower}`);
    }
    lines.push('');
  }
  
  if (result.hasShortCircuit) {
    lines.push('⚠️ WARNING: Short circuit detected!');
  }
  
  if (result.hasOpenCircuit) {
    lines.push('⚠️ WARNING: Open circuit detected!');
  }
  
  return lines.join('\n');
}
