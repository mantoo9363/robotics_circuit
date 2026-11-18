import type { CircuitNode, CircuitEdge } from "../lib/types";
import { getNodeSimulationModel } from "../lib/circuit/components";
import { checkPinConnectivity, getConnectedBoardPin, checkPinIsConnected } from "../lib/codeParsing/arduinoParser";
import { checkPicoGndConnectivity, checkPicoVccConnectivity } from "../lib/codeParsing/picoParser";
import { buildConductiveGraphForStore, getReachableGraphNodes } from "../lib/circuit/graph";
import { findMCUBoardNode } from "../lib/circuit/boardAdapter";

/**
 * Returns true when a Raspberry Pi Pico board node is present in the canvas.
 * Used to switch VCC/GND connectivity checks to Pico-aware helpers.
 *
 * ESP32 deliberately does NOT go through this path: checkPicoVccConnectivity/
 * checkPicoGndConnectivity only recognize `pico_*`-prefixed power/ground
 * handles, while the ESP32 board's handles are `esp32_3v3`/`esp32_gndN`. The
 * plain (non-Pico) checkPinConnectivity below already matches those via
 * substring checks (`includes("3v3")`, `includes("gnd")`), so ESP32 boards
 * correctly fall through to that generic path instead.
 */
function isPicoBoard(nodes: CircuitNode[]): boolean {
  return nodes.some(
    (n) =>
      n.data?.componentType === "raspberrypipico" ||
      n.data?.simulationModel === "raspberrypipico" ||
      n.type === "raspberrypipico" ||
      n.data?.componentType === "esp32" ||
      n.data?.simulationModel === "esp32" ||
      n.type === "esp32" ||
      (typeof n.id === "string" && (
        n.id.toLowerCase().includes("pico") ||
        n.id.toLowerCase().includes("esp32")
      )),
  );
}

/**
 * For a Pico I2C LCD, checks that the wired sda/scl pin is graph-reachable from the specific
 * GPIO the code declared (e.g. sda=Pin(0)), not just any I2C-capable pin. Falls back to the
 * generic whitelist check when no declared pin is known (e.g. non-Pico boards).
 */
export function checkPicoDeclaredI2cPin(
  nodeId: string,
  pinId: "sda" | "scl",
  declaredGpio: number | undefined,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): boolean {
  if (declaredGpio === undefined) {
    const boardNode = findMCUBoardNode(nodes);
    if (!boardNode) return checkPinConnectivity(nodeId, pinId, pinId, nodes, edges);
    const graph = buildConductiveGraphForStore(nodes, edges, { includeResistors: true });
    const reachable = getReachableGraphNodes(graph, `${nodeId}:${pinId}`);
    for (const ep of reachable) {
      if (ep.startsWith(`${boardNode.id}:`)) return true;
    }
    return false;
  }
  const boardNode = findMCUBoardNode(nodes);
  if (!boardNode) return false;
  const isEsp32 = getNodeSimulationModel(boardNode) === "esp32";
  const pinPrefix = isEsp32 ? "gpio" : "gp";
  const graph = buildConductiveGraphForStore(nodes, edges, {
    includeResistors: true,
  });
  const reachable = getReachableGraphNodes(graph, `${nodeId}:${pinId}`);
  return reachable.has(`${boardNode.id}:${pinPrefix}${declaredGpio}`);
}

/**
 * Checks if a component is fully connected according to strict electrical connectivity rules.
 * Enforces VCC, GND, and signal/data path connections back to the controller or power source.
 */
export function validateComponentConnections(
  node: CircuitNode,
  nodes: CircuitNode[],
  edges: CircuitEdge[],
): boolean {
  const model = getNodeSimulationModel(node);

  if (model === "lcd16x2") {
    const pico = isPicoBoard(nodes);
    const vccCheck = pico
      ? (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPicoVccConnectivity(id, pin, n, e)
      : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "vcc", n, e);
    const gndCheck = pico
      ? (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPicoGndConnectivity(id, pin, n, e)
      : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "gnd", n, e);
    const sdaCheck = pico
      ? checkPicoDeclaredI2cPin(node.id, "sda", undefined, nodes, edges)
      : checkPinConnectivity(node.id, "sda", "sda", nodes, edges);
    const sclCheck = pico
      ? checkPicoDeclaredI2cPin(node.id, "scl", undefined, nodes, edges)
      : checkPinConnectivity(node.id, "scl", "scl", nodes, edges);
    return (
      vccCheck(node.id, "vcc", nodes, edges) &&
      gndCheck(node.id, "gnd", nodes, edges) &&
      sdaCheck &&
      sclCheck
    );
  }

  if (model === "gasSensor") {
    const pico = isPicoBoard(nodes);
    const vccCheck = pico ? checkPicoVccConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "vcc", n, e);
    const gndCheck = pico ? checkPicoGndConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "gnd", n, e);
    const hasVcc =
      vccCheck(node.id, "a1", nodes, edges) ||
      vccCheck(node.id, "a2", nodes, edges) ||
      vccCheck(node.id, "h1", nodes, edges);
    const hasGnd =
      gndCheck(node.id, "b1", nodes, edges) ||
      gndCheck(node.id, "b2", nodes, edges) ||
      gndCheck(node.id, "h2", nodes, edges);
    const hasSignal =
      getConnectedBoardPin(node.id, "b1", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "b2", nodes, edges) !== null;
    return hasVcc && hasGnd && hasSignal;
  }

  if (model === "forceSensor") {
    const pico = isPicoBoard(nodes);
    const vccCheck = pico ? checkPicoVccConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "vcc", n, e);
    const gndCheck = pico ? checkPicoGndConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "gnd", n, e);
    const hasVcc =
      vccCheck(node.id, "pin1", nodes, edges) ||
      vccCheck(node.id, "pin2", nodes, edges);
    const hasGnd =
      gndCheck(node.id, "pin1", nodes, edges) ||
      gndCheck(node.id, "pin2", nodes, edges);
    const hasSignal =
      getConnectedBoardPin(node.id, "pin1", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "pin2", nodes, edges) !== null;
    return hasVcc && hasGnd && hasSignal;
  }

  if (model === "flexSensor") {
    const pico = isPicoBoard(nodes);
    const vccCheck = pico ? checkPicoVccConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "vcc", n, e);
    const gndCheck = pico ? checkPicoGndConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "gnd", n, e);
    const hasVcc =
      vccCheck(node.id, "pin1", nodes, edges) ||
      vccCheck(node.id, "pin2", nodes, edges);
    const hasGnd =
      gndCheck(node.id, "pin1", nodes, edges) ||
      gndCheck(node.id, "pin2", nodes, edges);
    const hasSignal =
      getConnectedBoardPin(node.id, "pin1", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "pin2", nodes, edges) !== null;
    return hasVcc && hasGnd && hasSignal;
  }

  if (model === "photoresistor") {
    const pico = isPicoBoard(nodes);
    const vccCheck = pico ? checkPicoVccConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "vcc", n, e);
    const gndCheck = pico ? checkPicoGndConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "gnd", n, e);
    const hasVcc =
      vccCheck(node.id, "pin1", nodes, edges) ||
      vccCheck(node.id, "pin2", nodes, edges);
    const hasGnd =
      gndCheck(node.id, "pin1", nodes, edges) ||
      gndCheck(node.id, "pin2", nodes, edges);
    const hasSignal =
      getConnectedBoardPin(node.id, "pin1", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "pin2", nodes, edges) !== null;
    return hasVcc && hasGnd && hasSignal;
  }

  if (model === "potentiometer") {
    const pico = isPicoBoard(nodes);
    const vccCheck = pico ? checkPicoVccConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "vcc", n, e);
    const gndCheck = pico ? checkPicoGndConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "gnd", n, e);
    const hasVcc =
      vccCheck(node.id, "pin1", nodes, edges) ||
      //       vccCheck(node.id, "pin2", nodes, edges);
      //     const hasGnd =
      //       gndCheck(node.id, "pin1", nodes, edges) ||
      //       gndCheck(node.id, "pin2", nodes, edges);
      //     const hasSignal =
      //       getConnectedBoardPin(node.id, "wiper", nodes, edges) !== null ||
      //       edges.some(
      //         (e) =>
      //           (e.source === node.id && e.sourceHandle === "wiper") ||
      //           (e.target === node.id && e.targetHandle === "wiper"),
      //       );
      vccCheck(node.id, "pin2", nodes, edges) ||
      vccCheck(node.id, "pin3", nodes, edges);
    const hasGnd =
      gndCheck(node.id, "pin1", nodes, edges) ||
      gndCheck(node.id, "pin2", nodes, edges) ||
      gndCheck(node.id, "pin3", nodes, edges);
    const hasSignal =
      getConnectedBoardPin(node.id, "wiper", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "pin2", nodes, edges) !== null;
    return hasVcc && hasGnd && hasSignal;
  }

  if (model === "temperatureSensor") {
    const pico = isPicoBoard(nodes);
    const hasVcc = pico
      ? (checkPicoVccConnectivity(node.id, "vs", nodes, edges) || checkPicoVccConnectivity(node.id, "vcc", nodes, edges))
      : (checkPinConnectivity(node.id, "vs", "vcc", nodes, edges) || checkPinConnectivity(node.id, "vcc", "vcc", nodes, edges));
    const hasGnd = pico
      ? (checkPicoGndConnectivity(node.id, "gnd", nodes, edges) || checkPicoGndConnectivity(node.id, "ground", nodes, edges))
      : (checkPinConnectivity(node.id, "gnd", "gnd", nodes, edges) || checkPinConnectivity(node.id, "ground", "gnd", nodes, edges));
    const hasSignal =
      getConnectedBoardPin(node.id, "vout", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "out", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "signal", nodes, edges) !== null;
    return hasVcc && hasGnd && hasSignal;
  }

  if (model === "dht11" || model === "dht22") {
    const pico = isPicoBoard(nodes);
    const hasVcc = pico
      ? (checkPicoVccConnectivity(node.id, "vcc", nodes, edges) || checkPicoVccConnectivity(node.id, "power", nodes, edges))
      : (checkPinConnectivity(node.id, "vcc", "vcc", nodes, edges) || checkPinConnectivity(node.id, "power", "vcc", nodes, edges));
    const hasGnd = pico
      ? (checkPicoGndConnectivity(node.id, "gnd", nodes, edges) || checkPicoGndConnectivity(node.id, "ground", nodes, edges))
      : (checkPinConnectivity(node.id, "gnd", "gnd", nodes, edges) || checkPinConnectivity(node.id, "ground", "gnd", nodes, edges));
    const hasSignal =
      getConnectedBoardPin(node.id, "data", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "signal", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "out", nodes, edges) !== null;
    return hasVcc && hasGnd && hasSignal;
  }

  if (model === "soilMoisture") {
    const pico = isPicoBoard(nodes);
    const vccCheck = pico ? checkPicoVccConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "vcc", n, e);
    const gndCheck = pico ? checkPicoGndConnectivity : (id: string, pin: string, n: CircuitNode[], e: CircuitEdge[]) => checkPinConnectivity(id, pin, "gnd", n, e);
    const hasVcc =
      vccCheck(node.id, "vcc1", nodes, edges) ||
      vccCheck(node.id, "vcc2", nodes, edges) ||
      vccCheck(node.id, "vcc", nodes, edges) ||
      vccCheck(node.id, "power", nodes, edges);
    const hasGnd =
      gndCheck(node.id, "gnd1", nodes, edges) ||
      gndCheck(node.id, "gnd2", nodes, edges) ||
      gndCheck(node.id, "gnd", nodes, edges) ||
      gndCheck(node.id, "ground", nodes, edges);
    const hasSignal =
      getConnectedBoardPin(node.id, "sig1", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "sig2", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "signal", nodes, edges) !== null ||
      getConnectedBoardPin(node.id, "sig", nodes, edges) !== null;
    return hasVcc && hasGnd && hasSignal;
  }

  if (model === "servo") {
    const pico = isPicoBoard(nodes);
    const hasVcc = pico
      ? checkPicoVccConnectivity(node.id, "power", nodes, edges)
      : checkPinConnectivity(node.id, "power", "vcc", nodes, edges);
    const hasGnd = pico
      ? checkPicoGndConnectivity(node.id, "ground", nodes, edges)
      : checkPinConnectivity(node.id, "ground", "gnd", nodes, edges);
    const hasSignal = getConnectedBoardPin(node.id, "signal", nodes, edges) !== null;
    return hasVcc && hasGnd && hasSignal;
  }

  if (model === "ultrasonicDistance") {
    const pico = isPicoBoard(nodes);
    const hasVcc = pico
      ? (checkPicoVccConnectivity(node.id, "power", nodes, edges) || checkPicoVccConnectivity(node.id, "vcc", nodes, edges))
      : (checkPinConnectivity(node.id, "power", "vcc", nodes, edges) || checkPinConnectivity(node.id, "vcc", "vcc", nodes, edges));
    const hasGnd = pico
      ? (checkPicoGndConnectivity(node.id, "ground", nodes, edges) || checkPicoGndConnectivity(node.id, "gnd", nodes, edges))
      : (checkPinConnectivity(node.id, "ground", "gnd", nodes, edges) || checkPinConnectivity(node.id, "gnd", "gnd", nodes, edges));
    const hasTrigger = getConnectedBoardPin(node.id, "trigger", nodes, edges) !== null;
    const hasEcho = getConnectedBoardPin(node.id, "echo", nodes, edges) !== null;
    return hasVcc && hasGnd && hasTrigger && hasEcho;
  }

  if (model === "pirSensor") {
    const pico = isPicoBoard(nodes);
    const hasVcc = pico
      ? checkPicoVccConnectivity(node.id, "power", nodes, edges)
      : checkPinConnectivity(node.id, "power", "vcc", nodes, edges);
    const hasGnd = pico
      ? checkPicoGndConnectivity(node.id, "ground", nodes, edges)
      : checkPinConnectivity(node.id, "ground", "gnd", nodes, edges);
    const hasSignal = getConnectedBoardPin(node.id, "signal", nodes, edges) !== null;
    return hasVcc && hasGnd && hasSignal;
  }

  if (model === "keypad4x4") {
    const pins = [
      "row1", "row2", "row3", "row4",
      "column1", "column2", "column3", "column4"
    ];
    return pins.every(p => getConnectedBoardPin(node.id, p, nodes, edges) !== null);
  }

  if (model === "keypad4x3") {
    const pins = [
      "row1", "row2", "row3", "row4",
      "column1", "column2", "column3"
    ];
    return pins.every(p => getConnectedBoardPin(node.id, p, nodes, edges) !== null);
  }

  if (model === "tiltSensor") {
    return (
      checkPinIsConnected(node.id, "pin1", nodes, edges) &&
      checkPinIsConnected(node.id, "pin2", nodes, edges)
    );
  }

  return true;
}
