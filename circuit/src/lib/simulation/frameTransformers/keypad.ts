import type { SimulationFrame, SimulationComponentState } from "../../simulation-state";
import type { CircuitNode, CircuitEdge } from "../../types";
import { useCircuitStore } from "../../store";
import { useDynamicComponentsStore } from "../../../store/useDynamicComponentsStore";
import { getNodeSimulationModel } from "../../circuit/components";
import { getReachableGraphNodes, buildConductiveGraphForStore } from "../../circuit/graph";
import { frameBoardPinsToArduinoPins, getArduinoDigitalPinForComponentConnection, getLedNodeIdsConnectedToArduinoPin } from "../../circuit/pinMapping";
import { buildSimulationFrame } from "../../simulation-state";
import { SimulatorState } from "../../arduino-simulator";
import { stripCodeComments, parseArduinoConstants, resolveArduinoNumber } from "../../codeParsing/arduinoParser";
import type { SimContext } from "../types";
import { validateComponentConnections } from "../../../utils/connectivity";

type FrameApplySource = "socket" | "broadcast" | "storage" | "local";

/**
 * Restores component state that the keypad's internal buildSimulationFrame()
 * rebuild regressed to the bare default because that rebuild has no evaluator
 * for the component on this board (e.g. an ESP32 servo powered by an earlier
 * frame transformer). Components the rebuild actually evaluated are kept as-is;
 * the keypad node itself is skipped because it is patched separately.
 */
function preserveUpstreamComponentState(
  rebuilt: Record<string, SimulationComponentState>,
  incoming: Record<string, SimulationComponentState>,
  keypadNodeId: string,
): Record<string, SimulationComponentState> {
  const merged = { ...rebuilt };
  for (const [id, prev] of Object.entries(incoming)) {
    if (id === keypadNodeId || !prev?.isPowered) continue;
    const now = merged[id];
    const regressedToDefault =
      !now ||
      (now.isPowered === false &&
        (now.brightness ?? 0) === 0 &&
        Object.keys(now.telemetry ?? {}).length === 0);
    if (regressedToDefault) merged[id] = prev;
  }
  return merged;
}

export function applyKeypad4x4InputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  const keypadState = context.keypad4x4State;
  const st = keypadState.getState();
  if (!frame.running || frame.tick <= 1) {
    keypadState.reset();
  }

  const storeState = useCircuitStore.getState();
  const nodes = context?.nodes?.length ? context.nodes : storeState.nodes;
  const edges = context?.edges?.length ? context.edges : storeState.edges;
  const arduinoCode = context?.arduinoCode ?? storeState.arduinoCode;

  const keypadNode = nodes.find((node) => {
    const model = getNodeSimulationModel(node);
    return model === "keypad4x4";
  });
  if (!keypadNode) return frame;

  const isPowered = validateComponentConnections(keypadNode, nodes, edges);
  if (!isPowered) {
    const components = { ...frame.components };
    const previousComponentState = components[keypadNode.id];
    components[keypadNode.id] = {
      ...(previousComponentState ?? {
        nodeId: keypadNode.id,
        componentType: keypadNode.data.componentType,
        label: keypadNode.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered: false,
      telemetry: {
        ...(previousComponentState?.telemetry ?? {}),
        error: "Keypad Pins Disconnected",
      },
    };
    return { ...frame, components };
  }

  const KEY_MATRIX = [
    ["1", "2", "3", "A"],
    ["4", "5", "6", "B"],
    ["7", "8", "9", "C"],
    ["*", "0", "#", "D"],
  ];

  const pressedKeysStr = String(
    keypadNode.data.properties?.pressedKeys?.value ?? "",
  );
  const pressedKeys = new Set(pressedKeysStr ? pressedKeysStr.split(",") : []);

  let pinsUpdatedFrame = frame;

  if (frame.boardType === "arduino" || frame.boardType === "pico" || frame.boardType === "esp32") {
    const pins = frameBoardPinsToArduinoPins(frame);

    const rowPinNames = ["row1", "row2", "row3", "row4"];
    const colPinNames = ["column1", "column2", "column3", "column4"];

    let rowPins: (number | null)[] = [9, 8, 7, 6];
    let colPins: (number | null)[] = [5, 4, 3, 2];

    const mcuNode = nodes.find((node) => {
      const m = getNodeSimulationModel(node);
      return m === "arduino" || m === "raspberrypipico" || m === "esp32";
    });
    const mcuModel = mcuNode ? getNodeSimulationModel(mcuNode) : null;

    if (mcuNode) {
      const graph = buildConductiveGraphForStore(nodes, edges, {
        includeResistors: true,
      });

      const findConnectedMcuPin = (keypadPinName: string) => {
        const startKey = `${keypadNode.id}:${keypadPinName}`;
        const reachable = getReachableGraphNodes(graph, startKey);

        if (mcuModel === "arduino") {
          for (let pin = 0; pin <= 13; pin++) {
            if (reachable.has(`${mcuNode.id}:d${pin}`)) return pin;
          }
          for (let pin = 14; pin <= 19; pin++) {
            if (reachable.has(`${mcuNode.id}:a${pin - 14}`)) return pin;
          }
        } else if (mcuModel === "raspberrypipico") {
          for (let pin = 0; pin <= 28; pin++) {
            if (reachable.has(`${mcuNode.id}:gp${pin}`)) return pin;
          }
        } else if (mcuModel === "esp32") {
          for (let pin = 0; pin <= 39; pin++) {
            if (pin >= 6 && pin <= 11) continue;
            if (reachable.has(`${mcuNode.id}:gpio${pin}`)) return pin;
          }
        }
        return null;
      };

      rowPins = rowPinNames.map((name) => findConnectedMcuPin(name));
      colPins = colPinNames.map((name) => findConnectedMcuPin(name));
    }

    // Short circuit rows and columns based on pressed keys using Connected Components / Union-Find
    const activeConnections: [number, number][] = [];
    pressedKeys.forEach((key) => {
      let rIdx = -1;
      let cIdx = -1;
      for (let r = 0; r < KEY_MATRIX.length; r++) {
        const c = KEY_MATRIX[r].indexOf(key);
        if (c !== -1) {
          rIdx = r;
          cIdx = c;
          break;
        }
      }
      if (rIdx !== -1 && cIdx !== -1) {
        const targetRowPin = rowPins[rIdx];
        const targetColPin = colPins[cIdx];
        if (targetRowPin !== null && targetColPin !== null) {
          activeConnections.push([targetRowPin, targetColPin]);
        }
      }
    });

    const parent: Record<number, number> = {};
    const find = (i: number): number => {
      if (parent[i] === undefined) {
        parent[i] = i;
      }
      if (parent[i] === i) {
        return i;
      }
      return (parent[i] = find(parent[i]));
    };
    const union = (i: number, j: number) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent[rootI] = rootJ;
      }
    };

    activeConnections.forEach(([p1, p2]) => {
      union(p1, p2);
    });

    const components: Record<number, number[]> = {};
    Object.keys(parent).forEach((pinStr) => {
      const pin = Number(pinStr);
      const root = find(pin);
      if (!components[root]) {
        components[root] = [];
      }
      components[root].push(pin);
    });

    Object.values(components).forEach((pinGroup) => {
      const pinStates = pinGroup
        .map((p) => ({ pin: p, state: pins.get(p) }))
        .filter((x) => x.state !== undefined);

      const outputStates = pinStates.filter((x) => x.state?.mode === "OUTPUT");
      if (outputStates.length > 0) {
        const minValue = Math.min(...outputStates.map((x) => x.state!.value));
        pinStates.forEach((x) => {
          if (x.state!.mode !== "OUTPUT") {
            pins.set(x.pin, {
              mode: x.state!.mode,
              value: minValue,
            });
          }
        });
      } else {
        const pullUpStates = pinStates.filter(
          (x) => x.state?.mode === "INPUT_PULLUP",
        );
        if (pullUpStates.length > 0) {
          pinStates.forEach((x) => {
            if (x.state!.mode === "INPUT") {
              pins.set(x.pin, {
                mode: x.state!.mode,
                value: 255,
              });
            }
          });
        }
      }
    });

    // Helper to push text to persistent serial monitor logs
    const appendToLogs = (text: string) => {
      if (st.serialLogs.length > 0) {
        const lastIdx = st.serialLogs.length - 1;
        const lastLine = st.serialLogs[lastIdx];
        if (/^[1-9A-D\*#]*$/.test(lastLine) && /^[1-9A-D\*#]*$/.test(text)) {
          st.serialLogs[lastIdx] = lastLine + text;
          return;
        }
      }
      st.serialLogs.push(text);
    };

    // Edge-detection to prevent repeating keypresses on multiple frame/simulation ticks
    const newlyPressed: string[] = [];
    pressedKeys.forEach((key) => {
      if (!keypadState.getPressedKeys().has(key)) {
        newlyPressed.push(key);
      }
    });

    const isSyntheticArduino = mcuModel === "arduino" && frame.boardType === "arduino";

    if (isSyntheticArduino && newlyPressed.length > 0) {
      newlyPressed.forEach((key) => {
        // Parse correct password from code
        const cleanCode = stripCodeComments(arduinoCode);
        const passwordMatch = cleanCode.match(/password\s*=\s*"([^"]+)"/i);
        const correctPassword = passwordMatch ? passwordMatch[1] : "   ";

        // Trace or read ledPin
        const constants = parseArduinoConstants(arduinoCode);
        let ledPin = constants.get("ledPin") ?? constants.get("led") ?? 13;
        if (mcuNode && mcuModel === "arduino") {
          for (let p = 0; p <= 19; p++) {
            const leds = getLedNodeIdsConnectedToArduinoPin(
              mcuNode.id,
              p,
              nodes,
              edges,
            );
            if (leds.length > 0) {
              ledPin = p;
              break;
            }
          }
        }

        if (key === "#") {
          appendToLogs("#");

          if (st.inputPassword === correctPassword) {
            st.ledState = true;
            st.serialLogs.push("Access Granted");
          } else {
            st.ledState = false;
            st.serialLogs.push("Wrong Password");
          }
          st.inputPassword = "";

          // Clear pressedKeys textbox on UI after output is generated
          setTimeout(() => {
            useCircuitStore.setState((store) => ({
              nodes: store.nodes.map((n) =>
                n.id === keypadNode.id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        properties: {
                          ...n.data.properties,
                          pressedKeys: n.data.properties.pressedKeys
                            ? { ...n.data.properties.pressedKeys, value: "" }
                            : {
                                label: "Pressed Keys",
                                type: "string",
                                value: "",
                              },
                        },
                      },
                    }
                  : n,
              ),
            }));
          }, 800);
        } else if (key === "*") {
          appendToLogs("*");
          st.inputPassword = "";
          st.serialLogs.push("Cleared");

          // Clear pressedKeys textbox on UI after output is cleared
          setTimeout(() => {
            useCircuitStore.setState((store) => ({
              nodes: store.nodes.map((n) =>
                n.id === keypadNode.id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        properties: {
                          ...n.data.properties,
                          pressedKeys: n.data.properties.pressedKeys
                            ? { ...n.data.properties.pressedKeys, value: "" }
                            : {
                                label: "Pressed Keys",
                                type: "string",
                                value: "",
                              },
                        },
                      },
                    }
                  : n,
              ),
            }));
          }, 800);
        } else {
          appendToLogs(key);
          st.inputPassword += key;
        }

        pins.set(ledPin, {
          mode: "OUTPUT",
          value: st.ledState ? 255 : 0,
        });
      });
    }

    // Keep the led pin synced in subsequent frames (since key state might have been cleared on keyup)
    const constants = parseArduinoConstants(arduinoCode);
    let ledPin = constants.get("ledPin") ?? constants.get("led") ?? 13;
    if (mcuNode && mcuModel === "arduino") {
      for (let p = 0; p <= 19; p++) {
        const leds = getLedNodeIdsConnectedToArduinoPin(
          mcuNode.id,
          p,
          nodes,
          edges,
        );
        if (leds.length > 0) {
          ledPin = p;
          break;
        }
      }
    }
    pins.set(ledPin, {
      mode: "OUTPUT",
      value: st.ledState ? 255 : 0,
    });

    // Merge simulated logs with backend serial logs (avoiding duplicates) for synthetic Arduino only
    const combinedSerialOutput = isSyntheticArduino
      ? (() => {
          const out = [...frame.serialOutput];
          if (out.length === 0) {
            for (const log of st.serialLogs) {
              if (!out.includes(log)) {
                out.push(log);
              }
            }
          }
          return out;
        })()
      : frame.serialOutput;

    pinsUpdatedFrame = buildSimulationFrame({
      tick: frame.tick,
      nodes,
      edges,
      dynamicComponents: useDynamicComponentsStore.getState().components,
      boardType: frame.boardType,
      arduinoState: {
        pins,
        serialOutput: combinedSerialOutput.slice(-100),
        running: frame.running,
        error: frame.error,
      },
      running: frame.running,
      error: frame.error,
    });
  }

  const components = preserveUpstreamComponentState(
    pinsUpdatedFrame.components,
    frame.components,
    keypadNode.id,
  );
  const previousComponentState = components[keypadNode.id];

  components[keypadNode.id] = {
    ...(previousComponentState ?? {
      nodeId: keypadNode.id,
      componentType: keypadNode.data.componentType,
      label: keypadNode.data.label,
      isPowered: true,
      brightness: 0,
      voltage: 5.0,
      pins: {},
      telemetry: {},
    }),
    isPowered: true,
    telemetry: {
      ...(previousComponentState?.telemetry ?? {}),
      pressedKeys: pressedKeysStr,
    },
  };

  return { ...pinsUpdatedFrame, components };
}

export function applyKeypad4x3InputToFrame(
  frame: SimulationFrame,
  context: SimContext,
): SimulationFrame {
  const keypadState = context.keypad4x3State;
  const st = keypadState.getState();
  if (!frame.running || frame.tick <= 1) {
    keypadState.reset();
  }

  const storeState = useCircuitStore.getState();
  const nodes = context?.nodes?.length ? context.nodes : storeState.nodes;
  const edges = context?.edges?.length ? context.edges : storeState.edges;
  const arduinoCode = context?.arduinoCode ?? storeState.arduinoCode;

  const keypadNode = nodes.find((node) => {
    const model = getNodeSimulationModel(node);
    return model === "keypad4x3";
  });
  if (!keypadNode) return frame;

  const isPowered = validateComponentConnections(keypadNode, nodes, edges);
  if (!isPowered) {
    const components = { ...frame.components };
    const previousComponentState = components[keypadNode.id];
    components[keypadNode.id] = {
      ...(previousComponentState ?? {
        nodeId: keypadNode.id,
        componentType: keypadNode.data.componentType,
        label: keypadNode.data.label,
        isPowered: false,
        brightness: 0,
        voltage: 0,
        pins: {},
        telemetry: {},
      }),
      isPowered: false,
      telemetry: {
        ...(previousComponentState?.telemetry ?? {}),
        error: "Keypad Pins Disconnected",
      },
    };
    return { ...frame, components };
  }

  const KEY_MATRIX = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["*", "0", "#"],
  ];

  const pressedKeysStr = String(
    keypadNode.data.properties?.pressedKeys?.value ?? "",
  );
  const pressedKeys = new Set(pressedKeysStr ? pressedKeysStr.split(",") : []);

  let pinsUpdatedFrame = frame;

  if (frame.boardType === "arduino" || frame.boardType === "pico" || frame.boardType === "esp32") {
    const pins = frameBoardPinsToArduinoPins(frame);

    const rowPinNames = ["row1", "row2", "row3", "row4"];
    const colPinNames = ["column1", "column2", "column3"];

    let rowPins: (number | null)[] = [9, 8, 7, 6];
    let colPins: (number | null)[] = [5, 4, 3];

    const mcuNode = nodes.find((node) => {
      const m = getNodeSimulationModel(node);
      return m === "arduino" || m === "raspberrypipico" || m === "esp32";
    });
    const mcuModel = mcuNode ? getNodeSimulationModel(mcuNode) : null;

    if (mcuNode) {
      const graph = buildConductiveGraphForStore(nodes, edges, {
        includeResistors: true,
      });

      const findConnectedMcuPin = (keypadPinName: string) => {
        const startKey = `${keypadNode.id}:${keypadPinName}`;
        const reachable = getReachableGraphNodes(graph, startKey);

        if (mcuModel === "arduino") {
          for (let pin = 0; pin <= 13; pin++) {
            if (reachable.has(`${mcuNode.id}:d${pin}`)) return pin;
          }
          for (let pin = 14; pin <= 19; pin++) {
            if (reachable.has(`${mcuNode.id}:a${pin - 14}`)) return pin;
          }
        } else if (mcuModel === "raspberrypipico") {
          for (let pin = 0; pin <= 28; pin++) {
            if (reachable.has(`${mcuNode.id}:gp${pin}`)) return pin;
          }
        } else if (mcuModel === "esp32") {
          for (let pin = 0; pin <= 39; pin++) {
            if (pin >= 6 && pin <= 11) continue;
            if (reachable.has(`${mcuNode.id}:gpio${pin}`)) return pin;
          }
        }
        return null;
      };

      rowPins = rowPinNames.map((name) => findConnectedMcuPin(name));
      colPins = colPinNames.map((name) => findConnectedMcuPin(name));
    }

    // Short circuit rows and columns based on pressed keys using Connected Components / Union-Find
    const activeConnections: [number, number][] = [];
    pressedKeys.forEach((key) => {
      let rIdx = -1;
      let cIdx = -1;
      for (let r = 0; r < KEY_MATRIX.length; r++) {
        const c = KEY_MATRIX[r].indexOf(key);
        if (c !== -1) {
          rIdx = r;
          cIdx = c;
          break;
        }
      }
      if (rIdx !== -1 && cIdx !== -1) {
        const targetRowPin = rowPins[rIdx];
        const targetColPin = colPins[cIdx];
        if (targetRowPin !== null && targetColPin !== null) {
          activeConnections.push([targetRowPin, targetColPin]);
        }
      }
    });

    const parent: Record<number, number> = {};
    const find = (i: number): number => {
      if (parent[i] === undefined) {
        parent[i] = i;
      }
      if (parent[i] === i) {
        return i;
      }
      return (parent[i] = find(parent[i]));
    };
    const union = (i: number, j: number) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent[rootI] = rootJ;
      }
    };

    activeConnections.forEach(([p1, p2]) => {
      union(p1, p2);
    });

    const components: Record<number, number[]> = {};
    Object.keys(parent).forEach((pinStr) => {
      const pin = Number(pinStr);
      const root = find(pin);
      if (!components[root]) {
        components[root] = [];
      }
      components[root].push(pin);
    });

    Object.values(components).forEach((pinGroup) => {
      const pinStates = pinGroup
        .map((p) => ({ pin: p, state: pins.get(p) }))
        .filter((x) => x.state !== undefined);

      const outputStates = pinStates.filter((x) => x.state?.mode === "OUTPUT");
      if (outputStates.length > 0) {
        const minValue = Math.min(...outputStates.map((x) => x.state!.value));
        pinStates.forEach((x) => {
          if (x.state!.mode !== "OUTPUT") {
            pins.set(x.pin, {
              mode: x.state!.mode,
              value: minValue,
            });
          }
        });
      } else {
        const pullUpStates = pinStates.filter(
          (x) => x.state?.mode === "INPUT_PULLUP",
        );
        if (pullUpStates.length > 0) {
          pinStates.forEach((x) => {
            if (x.state!.mode === "INPUT") {
              pins.set(x.pin, {
                mode: x.state!.mode,
                value: 255,
              });
            }
          });
        }
      }
    });

    // Helper to push text to persistent serial monitor logs
    const appendToLogs = (text: string) => {
      if (st.serialLogs.length > 0) {
        const lastIdx = st.serialLogs.length - 1;
        const lastLine = st.serialLogs[lastIdx];
        if (/^[1-9\*#]*$/.test(lastLine) && /^[1-9\*#]*$/.test(text)) {
          st.serialLogs[lastIdx] = lastLine + text;
          return;
        }
      }
      st.serialLogs.push(text);
    };

    // Edge-detection to prevent repeating keypresses on multiple frame/simulation ticks
    const newlyPressed: string[] = [];
    pressedKeys.forEach((key) => {
      if (!keypadState.getPressedKeys().has(key)) {
        newlyPressed.push(key);
      }
    });

    const isSyntheticArduino = mcuModel === "arduino" && frame.boardType === "arduino";

    if (isSyntheticArduino && newlyPressed.length > 0) {
      newlyPressed.forEach((key) => {
        // Parse correct password from code
        const cleanCode = stripCodeComments(arduinoCode);
        const passwordMatch = cleanCode.match(/password\s*=\s*"([^"]+)"/i);
        const correctPassword = passwordMatch ? passwordMatch[1] : "1234";

        // Trace or read ledPin
        const constants = parseArduinoConstants(arduinoCode);
        let ledPin = constants.get("ledPin") ?? constants.get("led") ?? 13;
        if (mcuNode && mcuModel === "arduino") {
          for (let p = 0; p <= 19; p++) {
            const leds = getLedNodeIdsConnectedToArduinoPin(
              mcuNode.id,
              p,
              nodes,
              edges,
            );
            if (leds.length > 0) {
              ledPin = p;
              break;
            }
          }
        }

        if (key === "#") {
          appendToLogs("#");

          if (st.inputPassword === correctPassword) {
            st.ledState = true;
            st.serialLogs.push("Access Granted");
          } else {
            st.ledState = false;
            st.serialLogs.push("Wrong Password");
          }
          st.inputPassword = "";

          // Clear pressedKeys textbox on UI after output is generated
          setTimeout(() => {
            useCircuitStore.setState((store) => ({
              nodes: store.nodes.map((n) =>
                n.id === keypadNode.id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        properties: {
                          ...n.data.properties,
                          pressedKeys: n.data.properties.pressedKeys
                            ? { ...n.data.properties.pressedKeys, value: "" }
                            : {
                                label: "Pressed Keys",
                                type: "string",
                                value: "",
                              },
                        },
                      },
                    }
                  : n,
              ),
            }));
          }, 800);
        } else if (key === "*") {
          appendToLogs("*");
          st.inputPassword = "";
          st.serialLogs.push("Cleared");

          // Clear pressedKeys textbox on UI after output is cleared
          setTimeout(() => {
            useCircuitStore.setState((store) => ({
              nodes: store.nodes.map((n) =>
                n.id === keypadNode.id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        properties: {
                          ...n.data.properties,
                          pressedKeys: n.data.properties.pressedKeys
                            ? { ...n.data.properties.pressedKeys, value: "" }
                            : {
                                label: "Pressed Keys",
                                type: "string",
                                value: "",
                              },
                        },
                      },
                    }
                  : n,
              ),
            }));
          }, 800);
        } else {
          appendToLogs(key);
          st.inputPassword += key;
        }

        pins.set(ledPin, {
          mode: "OUTPUT",
          value: st.ledState ? 255 : 0,
        });
      });
    }

    // Keep the led pin synced in subsequent frames (since key state might have been cleared on keyup)
    const constants = parseArduinoConstants(arduinoCode);
    let ledPin = constants.get("ledPin") ?? constants.get("led") ?? 13;
    if (mcuNode && mcuModel === "arduino") {
      for (let p = 0; p <= 19; p++) {
        const leds = getLedNodeIdsConnectedToArduinoPin(
          mcuNode.id,
          p,
          nodes,
          edges,
        );
        if (leds.length > 0) {
          ledPin = p;
          break;
        }
      }
    }
    pins.set(ledPin, {
      mode: "OUTPUT",
      value: st.ledState ? 255 : 0,
    });

    // Merge simulated logs with backend serial logs (avoiding duplicates) for synthetic Arduino only
    const combinedSerialOutput = isSyntheticArduino
      ? (() => {
          const out = [...frame.serialOutput];
          if (out.length === 0) {
            for (const log of st.serialLogs) {
              if (!out.includes(log)) {
                out.push(log);
              }
            }
          }
          return out;
        })()
      : frame.serialOutput;

    pinsUpdatedFrame = buildSimulationFrame({
      tick: frame.tick,
      nodes,
      edges,
      dynamicComponents: useDynamicComponentsStore.getState().components,
      boardType: frame.boardType,
      arduinoState: {
        pins,
        serialOutput: combinedSerialOutput.slice(-100),
        running: frame.running,
        error: frame.error,
      },
      running: frame.running,
      error: frame.error,
    });
  }

  const components = preserveUpstreamComponentState(
    pinsUpdatedFrame.components,
    frame.components,
    keypadNode.id,
  );
  const previousComponentState = components[keypadNode.id];

  components[keypadNode.id] = {
    ...(previousComponentState ?? {
      nodeId: keypadNode.id,
      componentType: keypadNode.data.componentType,
      label: keypadNode.data.label,
      isPowered: true,
      brightness: 0,
      voltage: 5.0,
      pins: {},
      telemetry: {},
    }),
    isPowered: true,
    telemetry: {
      ...(previousComponentState?.telemetry ?? {}),
      pressedKeys: pressedKeysStr,
    },
  };

  return { ...pinsUpdatedFrame, components };
}

