/**
 * Unit Test Suite for Circuit Presets Validation
 */

import { CIRCUIT_PRESETS } from "../lib/circuit-presets";
import { COMPONENT_CATALOG } from "../lib/circuit-components";

export function runCircuitPresetsTests(): boolean {
  console.log("=================== RUNNING CIRCUIT PRESETS VALIDATION TESTS ===================\n");

  let allPassed = true;

  console.log(`Total Presets to Validate: ${CIRCUIT_PRESETS.length}\n`);

  for (const preset of CIRCUIT_PRESETS) {
    console.log(`--- Checking Preset: [${preset.group}] "${preset.label}" (${preset.id}) ---`);

    // 1. Check basic metadata
    if (!preset.id || !preset.label || !preset.group || !Array.isArray(preset.nodes) || !Array.isArray(preset.edges)) {
      console.error(`❌ Preset ${preset.id} has invalid structure!`);
      allPassed = false;
      continue;
    }

    // 2. Validate Nodes
    const nodeIds = new Set<string>();
    for (const node of preset.nodes) {
      if (nodeIds.has(node.id)) {
        console.error(`❌ Duplicate node ID "${node.id}" in preset ${preset.id}`);
        allPassed = false;
      }
      nodeIds.add(node.id);

      const compType = node.data?.componentType || node.type;
      const def = COMPONENT_CATALOG.find((c) => c.type === compType);
      if (!def) {
        console.error(`❌ Unknown component type "${compType}" in node "${node.id}" (preset ${preset.id})`);
        allPassed = false;
        continue;
      }

      // Ensure simulationModel is present
      if (!node.data?.simulationModel) {
        console.error(`❌ Missing simulationModel on node "${node.id}" (preset ${preset.id})`);
        allPassed = false;
      }
    }

    // 3. Check for Coordinate Overlap with MCU boards
    const mcuNode = preset.nodes.find(
      (n) => n.type === "arduino" || n.type === "raspberrypipico"
    );
    if (mcuNode) {
      const mcuDef = COMPONENT_CATALOG.find((c) => c.type === mcuNode.type)!;
      const mcuLeft = mcuNode.position.x;
      const mcuRight = mcuNode.position.x + mcuDef.defaultWidth;
      const mcuTop = mcuNode.position.y;
      const mcuBottom = mcuNode.position.y + mcuDef.defaultHeight;

      for (const node of preset.nodes) {
        if (node.id === mcuNode.id) continue;
        const compDef = COMPONENT_CATALOG.find((c) => c.type === node.type);
        if (!compDef) continue;
        const left = node.position.x;
        const right = node.position.x + compDef.defaultWidth;
        const top = node.position.y;
        const bottom = node.position.y + compDef.defaultHeight;

        const overlaps = !(right <= mcuLeft || left >= mcuRight || bottom <= mcuTop || top >= mcuBottom);
        if (overlaps) {
          console.error(`❌ Overlapping placement: Node "${node.id}" overlaps MCU board in preset ${preset.id}!`);
          allPassed = false;
        }
      }
    }

    // 4. Validate Edges
    for (const edge of preset.edges) {
      if (!nodeIds.has(edge.source)) {
        console.error(`❌ Edge "${edge.id}" references non-existent source "${edge.source}"`);
        allPassed = false;
      }
      if (!nodeIds.has(edge.target)) {
        console.error(`❌ Edge "${edge.id}" references non-existent target "${edge.target}"`);
        allPassed = false;
      }

      const sourceNode = preset.nodes.find((n) => n.id === edge.source)!;
      const targetNode = preset.nodes.find((n) => n.id === edge.target)!;
      const sourceDef = COMPONENT_CATALOG.find((c) => c.type === (sourceNode.data?.componentType || sourceNode.type));
      const targetDef = COMPONENT_CATALOG.find((c) => c.type === (targetNode.data?.componentType || targetNode.type));

      if (edge.sourceHandle && sourceDef && !sourceDef.pins.some((p) => p.id === edge.sourceHandle)) {
        console.error(`❌ Invalid sourceHandle "${edge.sourceHandle}" on node "${sourceNode.id}" in edge "${edge.id}"`);
        allPassed = false;
      }
      if (edge.targetHandle && targetDef && !targetDef.pins.some((p) => p.id === edge.targetHandle)) {
        console.error(`❌ Invalid targetHandle "${edge.targetHandle}" on node "${targetNode.id}" in edge "${edge.id}"`);
        allPassed = false;
      }
    }

    console.log(`=> Preset "${preset.label}" validated (${preset.nodes.length} nodes, ${preset.edges.length} wires)`);
  }

  console.log("\n=================== CIRCUIT PRESETS VALIDATION COMPLETE ===================");
  if (allPassed) {
    console.log("✅ All circuit presets validated 100% successfully.");
  } else {
    console.error("❌ Some circuit presets failed validation.");
  }

  return allPassed;
}

runCircuitPresetsTests();
