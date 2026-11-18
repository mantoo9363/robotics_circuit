import assert from "node:assert";
import { describe, it } from "node:test";
import { getOrCreateSession, clearSimSessions } from "../lib/codeParsing/picoParser";

describe("Pico vs ESP32 Pin Guards Isolation", () => {
  it("Pico GP6 NeoPixel write() commits colors without SPI flash error", () => {
    clearSimSessions();
    const picoCode = `
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(Pin(6), 8)
np[0] = (255, 0, 128)
np.write()
`;
    const session = getOrCreateSession(picoCode, 100, "pico");

    // Must not have SPI flash ValueError
    const hasFlashError = session.serialLines.some((l) => l.includes("SPI flash memory"));
    assert.strictEqual(hasFlashError, false, "Pico GP6 NeoPixel must not trigger SPI flash guard");

    // Neopixel state must be captured on pin 6
    assert.ok(session.neopixelStates && session.neopixelStates.has(6), "session.neopixelStates must contain pin 6");
    const p6State = session.neopixelStates.get(6);
    assert.deepStrictEqual(p6State?.pixels[0], { r: 255, g: 0, b: 128 });
  });

  it("Pico GP6 IRReceiver / NEC_8 initializes without SPI flash error", () => {
    clearSimSessions();
    const picoCode = `
from machine import Pin
from ir_rx.nec import NEC_8

def cb(data, addr, ctrl):
    pass

rx = NEC_8(Pin(6, Pin.IN), cb)
`;
    const session = getOrCreateSession(picoCode, 100, "pico");
    const hasFlashError = session.serialLines.some((l) => l.includes("SPI flash memory"));
    assert.strictEqual(hasFlashError, false, "Pico GP6 IRReceiver must not trigger SPI flash guard");
    assert.strictEqual(session.irReceivers?.length, 1, "Pico GP6 IRReceiver must be registered in session");
    assert.strictEqual(session.irReceivers?.[0]?.pin, 6);
  });

  it("ESP32 still enforces SPI flash and input-only pin guards", () => {
    clearSimSessions();
    const esp32FlashCode = `
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(Pin(6), 8)
np[0] = (255, 0, 0)
np.write()
`;
    const sessionEsp32 = getOrCreateSession(esp32FlashCode, 100, "esp32");
    const hasFlashError = sessionEsp32.serialLines.some((l) =>
      l.includes("ValueError: Pin(6) reserved for internal SPI flash memory")
    );
    assert.strictEqual(hasFlashError, true, "ESP32 on GP6 must trigger SPI flash guard");
    // Neopixel state must NOT be committed on ESP32 for pin 6
    assert.strictEqual(
      sessionEsp32.neopixelStates?.has(6) ?? false,
      false,
      "ESP32 pin 6 must not commit neopixelStates"
    );

    clearSimSessions();
    const esp32InputOnlyCode = `
from machine import Pin
p = Pin(34, Pin.OUT)
`;
    const sessionInputOnly = getOrCreateSession(esp32InputOnlyCode, 100, "esp32");
    const hasInputOnlyError = sessionInputOnly.serialLines.some((l) =>
      l.includes("ValueError: Pin(34) doesn't have an output driver")
    );
    assert.strictEqual(hasInputOnlyError, true, "ESP32 Pin(34, Pin.OUT) must trigger input-only guard");
  });
});
