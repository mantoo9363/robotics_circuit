import type { CircuitNode, CircuitEdge } from "../types";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../circuit/graph";
import { getNodeSimulationModelForStore } from "../circuit/components";
import { validateComponentConnections } from "../../utils/connectivity";

export function getAnalogValueForPicoPin(
  pinNum: number,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  resolution: "u16" | "12bit" | "10bit" | "uv" = "u16",
): number {
  const graph = buildConductiveGraphForStore(nodes, edges);
  const mcuNode = nodes.find(
    (n) => n.data.componentType === "raspberrypipico" || n.data.componentType === "esp32",
  );
  if (!mcuNode) return 0;

  const isEsp32 = mcuNode.data.componentType === "esp32";
  const pinPrefix = isEsp32 ? "gpio" : "gp";

  const startPin = `${mcuNode.id}:${pinPrefix}${pinNum}`;
  const reachable = getReachableGraphNodes(graph, startPin);

  const scaleFraction = (fraction: number): number => {
    const clamped = Math.max(0, Math.min(1.0, fraction));
    if (resolution === "10bit") {
      return Math.round(clamped * 1023);
    }
    if (resolution === "12bit") {
      return Math.round(clamped * 4095);
    }
    if (resolution === "uv") {
      return Math.round(clamped * 3_300_000);
    }
    return Math.round(clamped * 65535);
  };

  for (const node of nodes) {
    const model = getNodeSimulationModelForStore(node);
    if (model === "raspberrypipico" || model === "esp32") continue;

    // Check full electrical connectivity (VCC, GND, Signal)
    if (!validateComponentConnections(node, nodes, edges)) continue;

    // Potentiometer
    if (model === "potentiometer") {
      if (reachable.has(`${node.id}:wiper`)) {
        const val = Number(node.data.properties?.position?.value ?? 50);
        return scaleFraction(val / 100);
      }
    }

    // Photoresistor
    if (model === "photoresistor") {
      if (reachable.has(`${node.id}:pin1`) || reachable.has(`${node.id}:pin2`)) {
        const rawLightLevel = Math.max(0, Math.min(1023, Number(node.data.properties?.lightLevel?.value ?? 512)));
        const fraction =
          rawLightLevel <= 100
            ? (rawLightLevel / 100) * 0.5
            : 0.5 + ((rawLightLevel - 100) / 923) * 0.5;
        return scaleFraction(fraction);
      }
    }

    // Soil Moisture
    if (model === "soilMoisture") {
      const handles = ["signal", "sig", "out", "sig1", "sig2"];
      if (handles.some(h => reachable.has(`${node.id}:${h}`))) {
        const moisture = Math.max(0, Math.min(1023, Number(node.data.properties?.moisture?.value ?? 0)));
        return scaleFraction(moisture / 1023);
      }
    }

    // Temperature Sensor (e.g. TMP36)
    if (model === "temperatureSensor") {
      const handles = ["out", "signal", "vout"];
      if (handles.some(h => reachable.has(`${node.id}:${h}`))) {
        const celsius = Math.max(-40, Math.min(125, Number(node.data.properties?.temperature?.value ?? 25)));
        const mv = celsius * 10 + 500;
        const volts = mv / 1000;
        const ratio = Math.max(0, Math.min(1.0, volts / 3.3));
        return scaleFraction(ratio);
      }
    }

    // Gas Sensor
    if (model === "gasSensor") {
      const handles = ["b1", "b2"];
      if (handles.some(h => reachable.has(`${node.id}:${h}`))) {
        const gasVal = Math.max(0, Math.min(1023, Number(node.data.properties?.gasLevel?.value ?? 300)));
        return scaleFraction(gasVal / 1023);
      }
    }

    // Force Sensor
    if (model === "forceSensor") {
      if (reachable.has(`${node.id}:pin1`) || reachable.has(`${node.id}:pin2`)) {
        const force = Math.max(0, Math.min(1023, Number(node.data.properties?.force?.value ?? 0)));
        return scaleFraction(force / 1023);
      }
    }

    // Flex Sensor
    if (model === "flexSensor") {
      if (reachable.has(`${node.id}:pin1`) || reachable.has(`${node.id}:pin2`)) {
        const bendVal = Math.max(0, Math.min(180, Number(node.data.properties?.bend?.value ?? 0)));
        return scaleFraction(1 - bendVal / 180);
      }
    }
  }

  return 0;
}
