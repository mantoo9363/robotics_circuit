export interface CompilerMarker {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning';
}

const ARDUINO_ERROR_RE = /(?:.*\.ino:)?(\d+):(\d+):\s*(error|warning|fatal error):\s*(.+)$/im;

export function parseCompilerErrors(errorString: string | null): CompilerMarker[] {
  if (!errorString) return [];

  const markers: CompilerMarker[] = [];

  for (const rawLine of errorString.split('\n')) {
    const line = rawLine.trim();
    const match = line.match(ARDUINO_ERROR_RE);
    if (match) {
      const lineNum = parseInt(match[1], 10);
      markers.push({
        line: lineNum,
        column: parseInt(match[2], 10),
        endLine: lineNum,
        endColumn: parseInt(match[2], 10) + 1,
        message: match[4].trim(),
        severity: match[3].toLowerCase() === 'warning' ? 'warning' : 'error',
      });
    }
  }

  return markers;
}
