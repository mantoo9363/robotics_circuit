import type { CircuitNode } from "../types";
import { getNodeSimulationModelForStore } from "./components";

export type BoardType = "arduino" | "raspberrypipico" | "esp32";

export interface BoardPinDefinition {
  boardType: BoardType;
  pinNumber: number;
  handleId: string;
  isAnalogChannel: boolean;
}

export interface BoardAdapter {
  boardType: BoardType;
  parseHandleToPinNumber(handleId: string | null | undefined): BoardPinDefinition | null;
  getReachablePinNumber(mcuNodeId: string, reachable: Set<string>): number | null;
}

export class ArduinoBoardAdapter implements BoardAdapter {
  readonly boardType: BoardType = "arduino";

  parseHandleToPinNumber(handleId: string | null | undefined): BoardPinDefinition | null {
    if (!handleId) return null;
    const str = String(handleId).trim();

    // Digital pins d0..d13 or bare numeric 0..13
    const digitalMatch = str.match(/^(?:d)?(\d+)$/i);
    if (digitalMatch) {
      const pin = Number(digitalMatch[1]);
      if (Number.isInteger(pin) && pin >= 0 && pin <= 13) {
        return {
          boardType: "arduino",
          pinNumber: pin,
          handleId: str,
          isAnalogChannel: false,
        };
      }
    }

    // Analog pins a0..a5 -> mapped to 14..19
    const analogMatch = str.match(/^a([0-5])$/i);
    if (analogMatch) {
      const channel = Number(analogMatch[1]);
      return {
        boardType: "arduino",
        pinNumber: 14 + channel,
        handleId: str,
        isAnalogChannel: true,
      };
    }

    return null;
  }

  getReachablePinNumber(mcuNodeId: string, reachable: Set<string>): number | null {
    for (let pin = 0; pin <= 13; pin++) {
      if (reachable.has(`${mcuNodeId}:d${pin}`)) return pin;
    }
    for (let pin = 0; pin <= 5; pin++) {
      if (reachable.has(`${mcuNodeId}:a${pin}`)) return 14 + pin;
    }
    return null;
  }
}

export class PicoBoardAdapter implements BoardAdapter {
  readonly boardType: BoardType = "raspberrypipico";

  parseHandleToPinNumber(handleId: string | null | undefined): BoardPinDefinition | null {
    if (!handleId) return null;
    const str = String(handleId).trim();

    // GPIO pins gp0..gp28
    const match = str.match(/^(?:gp|d)?(\d+)$/i);
    if (match) {
      const pin = Number(match[1]);
      if (Number.isInteger(pin) && pin >= 0 && pin <= 28) {
        return {
          boardType: "raspberrypipico",
          pinNumber: pin,
          handleId: str,
          isAnalogChannel: str.toLowerCase().startsWith("a") || (pin >= 26 && pin <= 28),
        };
      }
    }

    return null;
  }

  getReachablePinNumber(mcuNodeId: string, reachable: Set<string>): number | null {
    for (let pin = 0; pin <= 28; pin++) {
      if (reachable.has(`${mcuNodeId}:gp${pin}`)) return pin;
    }
    return null;
  }
}

export class Esp32BoardAdapter implements BoardAdapter {
  readonly boardType: BoardType = "esp32";

  parseHandleToPinNumber(handleId: string | null | undefined): BoardPinDefinition | null {
    if (!handleId) return null;
    const str = String(handleId).trim();

    // GPIO pins: gpio0..gpio39 or gp0..gp39
    const match = str.match(/^(?:gpio|gp)(\d+)$/i);
    if (match) {
      const pin = Number(match[1]);
      // GPIO 6..11 are reserved for internal SPI flash memory and return null
      if (pin >= 6 && pin <= 11) return null;
      if (Number.isInteger(pin) && pin >= 0 && pin <= 39) {
        // ADC channels: gpio32-39 are input-only ADC, gpio0/2/4/12/13/14/15/25/26/27 have ADC
        const adcPins = new Set([0, 2, 4, 12, 13, 14, 15, 25, 26, 27, 32, 33, 34, 35, 36, 39]);
        return {
          boardType: "esp32",
          pinNumber: pin,
          handleId: str,
          isAnalogChannel: adcPins.has(pin),
        };
      }
    }

    return null;
  }

  getReachablePinNumber(mcuNodeId: string, reachable: Set<string>): number | null {
    for (let pin = 0; pin <= 39; pin++) {
      if (pin >= 6 && pin <= 11) continue; // Skip reserved flash pins
      if (reachable.has(`${mcuNodeId}:gpio${pin}`)) return pin;
    }
    return null;
  }
}

const arduinoAdapter = new ArduinoBoardAdapter();
const picoAdapter = new PicoBoardAdapter();
const esp32Adapter = new Esp32BoardAdapter();

export function findMCUBoardNode(nodes: CircuitNode[]): CircuitNode | null {
  return (
    nodes.find(
      (n) =>
        getNodeSimulationModelForStore(n) === "arduino" ||
        getNodeSimulationModelForStore(n) === "raspberrypipico" ||
        getNodeSimulationModelForStore(n) === "esp32" ||
        n.data.componentType === "arduino" ||
        n.data.componentType === "raspberrypipico" ||
        n.data.componentType === "esp32",
    ) ?? null
  );
}

export function getBoardAdapter(boardNodeOrType?: CircuitNode | BoardType | null): BoardAdapter {
  let type: string = "arduino";
  if (typeof boardNodeOrType === "string") {
    type = boardNodeOrType;
  } else if (boardNodeOrType) {
    type = getNodeSimulationModelForStore(boardNodeOrType) || boardNodeOrType.data.componentType || "arduino";
  }
  return type === "raspberrypipico" ? picoAdapter : type === "esp32" ? esp32Adapter : arduinoAdapter;
}
