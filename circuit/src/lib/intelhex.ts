/**
 * Intel HEX format parser
 * Loads compiled AVR firmware into a memory buffer
 */
export function loadHex(hex: string, target: Uint8Array) {
  for (const line of hex.split('\n')) {
    if (!line.startsWith(':') || line.length < 11) continue;
    const byteCount = parseInt(line.substring(1, 3), 16);
    const address = parseInt(line.substring(3, 7), 16);
    const recordType = parseInt(line.substring(7, 9), 16);
    if (recordType === 0) {
      for (let i = 0; i < byteCount; i++) {
        target[address + i] = parseInt(line.substring(9 + i * 2, 11 + i * 2), 16);
      }
    }
  }
}
