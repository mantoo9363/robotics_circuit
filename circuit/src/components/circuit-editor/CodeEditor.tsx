'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bluetooth, ChevronDown, ChevronRight, Code, Download, Puzzle, Send, Terminal, Trash2, X } from 'lucide-react';
import BlocklyEditor from './BlocklyEditor';
import { MonacoEditor } from './MonacoEditor';
import { parseCompilerErrors } from './parseCompilerErrors';
import { useCircuitStore } from '@cs/lib/store';
import { useBlocklyStore } from '@cs/store/useBlocklyStore';
import { getSimulationSocket } from '@cs/lib/socket-client';
import { resolveEsp32Language } from '@cs/lib/circuit/languageUtils';
import { checkEsp32CppSupport } from '@cs/lib/esp32/parser';

type EditorMode = 'blocks' | 'code';

type ImportedStatement =
  | { type: 'builtin_led'; state: 'HIGH' | 'LOW' }
  | { type: 'set_pin'; pin: number | string; state: 'HIGH' | 'LOW' }
  | { type: 'analog_write'; pin: number | string; value: number | string }
  | { type: 'serial_print'; text: string }
  | { type: 'delay'; ms: number }
  | { type: 'servo'; pin: number | string; angle: number | string };

const XML_NS = 'https://developers.google.com/blockly/xml';

function escapeXml(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseNumberValue(code: string, value: string, fallback: number) {
  const trimmed = value.trim();
  const literal = Number(trimmed);
  if (Number.isFinite(literal)) return literal;

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variableMatch = code.match(new RegExp(`(?:int|long|const\\s+int|const\\s+long)\\s+${escaped}\\s*=\\s*(-?\\d+)`, 'i'));
  return variableMatch ? Number(variableMatch[1]) : fallback;
}

function statementToXml(statement: ImportedStatement, nextXml: string) {
  const nextTag = nextXml ? `<next>${nextXml}</next>` : '';

  switch (statement.type) {
    case 'builtin_led':
      return `<block type="builtin_led"><field name="STATE">${statement.state}</field>${nextTag}</block>`;

    case 'set_pin': {
      const pinXml = typeof statement.pin === 'number'
        ? `<block type="math_number"><field name="NUM">${statement.pin}</field></block>`
        : `<block type="text"><field name="TEXT">${escapeXml(statement.pin)}</field></block>`;
      const stateXml = `<block type="high_low"><field name="STATE">${statement.state}</field></block>`;
      return `<block type="set_pin"><value name="PIN">${pinXml}</value><value name="STATE">${stateXml}</value>${nextTag}</block>`;
    }

    case 'analog_write': {
      const pinXml = typeof statement.pin === 'number'
        ? `<block type="math_number"><field name="NUM">${statement.pin}</field></block>`
        : `<block type="text"><field name="TEXT">${escapeXml(statement.pin)}</field></block>`;
      const valXml = typeof statement.value === 'number'
        ? `<block type="math_number"><field name="NUM">${statement.value}</field></block>`
        : `<block type="text"><field name="TEXT">${escapeXml(statement.value)}</field></block>`;
      return `<block type="analog_write"><value name="PIN">${pinXml}</value><value name="VALUE">${valXml}</value>${nextTag}</block>`;
    }

    case 'serial_print': {
      const textXml = `<block type="text"><field name="TEXT">${escapeXml(statement.text)}</field></block>`;
      return `<block type="serial_print"><value name="TEXT">${textXml}</value>${nextTag}</block>`;
    }

    case 'delay': {
      const msXml = `<block type="math_number"><field name="NUM">${statement.ms}</field></block>`;
      return `<block type="delay_ms"><value name="MS">${msXml}</value>${nextTag}</block>`;
    }

    case 'servo': {
      const pinXml = typeof statement.pin === 'number'
        ? `<block type="math_number"><field name="NUM">${statement.pin}</field></block>`
        : `<block type="text"><field name="TEXT">${escapeXml(statement.pin)}</field></block>`;
      const angleXml = typeof statement.angle === 'number'
        ? `<block type="math_number"><field name="NUM">${statement.angle}</field></block>`
        : `<block type="text"><field name="TEXT">${escapeXml(statement.angle)}</field></block>`;
      return `<block type="servo_write"><value name="PIN">${pinXml}</value><value name="ANGLE">${angleXml}</value>${nextTag}</block>`;
    }

    default:
      return nextXml;
  }
}

function arduinoCodeToBlocklyXml(code: string) {
  const loopMatch = code.match(/void\s+loop\s*\(\s*\)\s*\{([\s\S]*)\}\s*$/i);
  const loopBody = loopMatch ? loopMatch[1] : code;
  const rawStatements = loopBody.split(';');
  const statements: ImportedStatement[] = [];

  for (let stmt of rawStatements) {
    stmt = stmt.trim();
    if (!stmt || stmt.startsWith('//') || stmt.startsWith('/*')) continue;

    // 1. Built-in LED: digitalWrite(13, HIGH);
    const builtinLedMatch = stmt.match(/digitalWrite\s*\(\s*13\s*,\s*(HIGH|LOW)\s*\)/i);
    if (builtinLedMatch) {
      statements.push({ type: 'builtin_led', state: builtinLedMatch[1].toUpperCase() as 'HIGH' | 'LOW' });
      continue;
    }

    // 2. Set Pin: digitalWrite(PIN, STATE);
    const digitalWriteMatch = stmt.match(/digitalWrite\s*\(\s*(\d+)\s*,\s*(HIGH|LOW)\s*\)/i);
    if (digitalWriteMatch) {
      const pin = Number(digitalWriteMatch[1]);
      const state = digitalWriteMatch[2].toUpperCase() as 'HIGH' | 'LOW';
      if (pin !== 13) {
        statements.push({ type: 'set_pin', pin, state });
      } else {
        statements.push({ type: 'builtin_led', state });
      }
      continue;
    }

    // 3. Analog Write: analogWrite(PIN, VALUE);
    const analogWriteMatch = stmt.match(/analogWrite\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (analogWriteMatch) {
      statements.push({
        type: 'analog_write',
        pin: Number(analogWriteMatch[1]),
        value: Number(analogWriteMatch[2])
      });
      continue;
    }

    // 4. Serial Print: Serial.println("TEXT");
    const serialPrintMatch = stmt.match(/Serial\.println\s*\(\s*"?([^"]*)"?\s*\)/i);
    if (serialPrintMatch) {
      statements.push({ type: 'serial_print', text: serialPrintMatch[1] });
      continue;
    }

    // 5. Delay: delay(MS);
    const delayMatch = stmt.match(/delay\s*\(\s*(\d+)\s*\)/i);
    if (delayMatch) {
      statements.push({ type: 'delay', ms: Number(delayMatch[1]) });
      continue;
    }

    // 6. Servo: servo.write(ANGLE);
    const servoMatch = stmt.match(/(?:servo|\w+)\.write\s*\(\s*(\d+)\s*\)/i);
    if (servoMatch) {
      statements.push({ type: 'servo', pin: 9, angle: Number(servoMatch[1]) });
      continue;
    }
  }

  if (statements.length === 0) return null;

  const blocks = statements.reduceRight((nextXml, statement) => statementToXml(statement, nextXml), '');
  return `<xml xmlns="${XML_NS}">${blocks}</xml>`;
}

export function CodeEditor() {
  const [editorMode, setEditorMode] = useState<EditorMode>('code');
  const [panelWidth, setPanelWidth] = useState(640);
  const [serialHeight, setSerialHeight] = useState(160);
  const [serialCollapsed, setSerialCollapsed] = useState(false);
  const [serialInputText, setSerialInputText] = useState('');
  const [activeTerminalTab, setActiveTerminalTab] = useState<'usb' | 'bluetooth'>('usb');
  const [bluetoothInputText, setBluetoothInputText] = useState('');
  const [lineEnding, setLineEnding] = useState<'newline' | 'none' | 'both'>('newline');
  const selectedLanguage = useCircuitStore((s) => s.selectedLanguage);
  const setSelectedLanguage = useCircuitStore((s) => s.setSelectedLanguage);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isResizingPanel = useRef(false);
  const isResizingSerial = useRef(false);
  const serialContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const showCodeEditor = useCircuitStore((s) => s.showCodeEditor);
  const toggleCodeEditor = useCircuitStore((s) => s.toggleCodeEditor);
  const serialOutput = useCircuitStore((s) => s.serialOutput);
  const bluetoothOutput = useCircuitStore((s) => s.bluetoothOutput);
  const bluetoothDeviceName = useCircuitStore((s) => s.bluetoothDeviceName);
  const sendBluetoothSerial = useCircuitStore((s) => s.sendBluetoothSerial);
  const clearBluetoothSerial = useCircuitStore((s) => s.clearBluetoothSerial);
  const isSimulating = useCircuitStore((s) => s.isSimulating);
  const simulationStatus = useCircuitStore((s) => s.simulationStatus);
  const simulationBackendConnected = useCircuitStore((s) => s.simulationBackendConnected);
  const nodes = useCircuitStore((s) => s.nodes);

  const arduinoCode = useCircuitStore((s) => s.arduinoCode);
  const setArduinoCode = useCircuitStore((s) => s.setArduinoCode);
  const picoCode = useCircuitStore((s) => s.picoCode);
  const setPicoCode = useCircuitStore((s) => s.setPicoCode);
  const blocklyCode = useBlocklyStore((s) => s.code);
  const setBlocklyWorkspaceXml = useBlocklyStore((s) => s.setWorkspaceXml);

  const hasPico = nodes.some((node) => node.data.componentType === 'raspberrypipico');
  const hasEsp32 = nodes.some((node) => node.data.componentType === 'esp32');
  const hasArduino = nodes.some((node) => node.data.componentType === 'arduino');
  const simulationError = useCircuitStore((s) => s.simulationError);
  // ESP32 supports both languages from one "Auto" dropdown state; resolve which
  // buffer is actually live (see resolveEsp32Language for why this isn't just arduinoCode).
  const esp32Buffer = hasEsp32 && !hasArduino
    ? resolveEsp32Language(selectedLanguage, arduinoCode, picoCode)
    : null;
  const effectiveIsPython = esp32Buffer
    ? esp32Buffer.isPython
    : (selectedLanguage === 'auto' ? hasPico && !hasArduino : selectedLanguage === 'python');
  const code = esp32Buffer ? (esp32Buffer.buffer === 'pico' ? picoCode : arduinoCode) : (effectiveIsPython ? picoCode : arduinoCode);
  const setCode = esp32Buffer ? (esp32Buffer.buffer === 'pico' ? setPicoCode : setArduinoCode) : (effectiveIsPython ? setPicoCode : setArduinoCode);

  const handleSendSerial = useCallback(() => {
    if (!serialInputText.trim() || !isSimulating) return;
    let textToSend = serialInputText;
    if (lineEnding === 'newline') textToSend += '\n';
    else if (lineEnding === 'both') textToSend += '\r\n';

    const socket = getSimulationSocket();
    if (socket.connected) {
      socket.emit('simulation:serial-input', { data: textToSend });
    }
    setSerialInputText('');
  }, [serialInputText, lineEnding, isSimulating]);

  const handleSendBluetooth = useCallback(() => {
    if (!bluetoothInputText.trim() || !isSimulating) return;
    let textToSend = bluetoothInputText;
    if (lineEnding === 'newline') textToSend += '\n';
    else if (lineEnding === 'both') textToSend += '\r\n';

    sendBluetoothSerial(textToSend);
    setBluetoothInputText('');
  }, [bluetoothInputText, lineEnding, isSimulating, sendBluetoothSerial]);

  const handlePanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingPanel.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingPanel.current) return;
      const delta = startX - e.clientX;
      const newWidth = Math.max(360, Math.min(startWidth + delta, window.innerWidth - 60));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingPanel.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [panelWidth]);

  const handleSerialResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingSerial.current = true;
    const startY = e.clientY;
    const startHeight = serialHeight;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSerial.current) return;
      const parent = (e.target as HTMLElement).closest('[data-panel-root]');
      const parentHeight = parent ? parent.clientHeight : 800;
      const delta = startY - e.clientY;
      const newHeight = Math.max(48, Math.min(startHeight + delta, parentHeight * 0.5));
      setSerialHeight(newHeight);
    };

    const handleMouseUp = () => {
      isResizingSerial.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [serialHeight]);

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  }, []);

  useEffect(() => {
    if (showCodeEditor) {
      useCircuitStore.getState().detectBoardType();
    }
  }, [showCodeEditor]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen]);

  useEffect(() => {
    if (!showCodeEditor || effectiveIsPython || editorMode !== 'code') return;
    if (blocklyCode.trim()) {
      setArduinoCode(blocklyCode);
    }
  }, [blocklyCode, editorMode, effectiveIsPython, setArduinoCode, showCodeEditor]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    if (simulationStatus === 'error' && simulationError) {
      const markers = parseCompilerErrors(simulationError);
      if (markers.length > 0) {
        monaco.editor.setModelMarkers(model, 'simulation', markers.map((m) => ({
          startLineNumber: m.line,
          startColumn: m.column,
          endLineNumber: m.endLine,
          endColumn: m.endColumn,
          message: m.message,
          severity: m.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        })));
      } else {
        const firstLine = simulationError.split('\n')[0].trim();
        monaco.editor.setModelMarkers(model, 'simulation', [{
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
          message: firstLine || simulationError,
          severity: monaco.MarkerSeverity.Error,
        }]);
      }
    } else {
      monaco.editor.setModelMarkers(model, 'simulation', []);
    }
  }, [simulationStatus, simulationError, effectiveIsPython]);

  useEffect(() => {
    if (serialContainerRef.current) {
      serialContainerRef.current.scrollTop = serialContainerRef.current.scrollHeight;
    }
  }, [serialOutput]);

  const monacoOptions = useMemo(() => ({
    minimap: { enabled: true },
    fontSize: 13,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    padding: { top: 16 },
    bracketPairColorization: { enabled: true },
    tabSize: effectiveIsPython ? 4 : 2,
    suggestOnTriggerCharacters: true,
    quickSuggestions: true,
    formatOnPaste: true,
    folding: true,
    renderWhitespace: 'selection',
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    fontFamily: 'Cascadia Code, Fira Code, JetBrains Mono, Consolas, monospace',
    fontLigatures: true,
  } as const), [effectiveIsPython]);

  if (!showCodeEditor) return null;

  return (
    <div
      className={`flex flex-col border-l border-[#d9dee5] bg-[#f7f8fa] shadow-2xl ${isFullscreen ? 'fixed top-26 right-0 z-[100] h-[90vh] w-[85vw]' : 'absolute bottom-0 right-0 top-0 z-40'}`}
      style={isFullscreen ? {} : { width: `min(${panelWidth}px, 100%)` }}
      data-panel-root
    >
      <div
        className="absolute left-0 top-0 z-50 h-full w-1.5 cursor-col-resize transition-all hover:w-2 hover:bg-[#0097d7]/20 active:bg-[#0097d7]/40"
        onMouseDown={handlePanelResizeStart}
      />

      <div className="flex min-h-[48px] shrink-0 flex-wrap items-center gap-1.5 border-b border-[#d9dee5] bg-[#f2f4f6] px-2">
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex rounded-md border border-[#dfe4ea] bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setEditorMode('code')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                editorMode === 'code'
                  ? 'bg-[#0097d7] text-white'
                  : 'text-[#475569] hover:bg-[#f1f5f9]'
              }`}
              title="Code editor"
            >
              <Code size={14} />
              Code
            </button>
            <button
              onClick={() => {
                if (!effectiveIsPython) {
                  const workspaceXml = arduinoCodeToBlocklyXml(arduinoCode);
                  if (workspaceXml) {
                    setBlocklyWorkspaceXml(workspaceXml);
                  }
                }
                setEditorMode('blocks');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                editorMode === 'blocks'
                  ? 'bg-[#4C97FF] text-white'
                  : 'text-[#475569] hover:bg-[#f1f5f9]'
              }`}
              title="Block editor"
            >
              <Puzzle size={14} />
              Blocks
            </button>
          </div>

          <button
            className="flex h-7 w-7 items-center justify-center rounded border border-[#dfe4ea] bg-white text-[#2f4054] shadow-sm hover:bg-[#eef2f5]"
            title="Download code"
            onClick={() => {
              const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = effectiveIsPython ? 'main.py' : 'sketch.ino';
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={13} />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <label className="relative">
            <select
              value={selectedLanguage}
              onChange={(e) => {
                const lang = e.target.value as 'auto' | 'cpp' | 'python';
                setSelectedLanguage(lang);
                if (lang === 'python') setEditorMode('code');
              }}
              className="h-7 appearance-none rounded border border-[#dfe4ea] bg-white pl-2 pr-6 text-[11px] text-[#607085] shadow-sm outline-none hover:border-[#0097d7] focus:border-[#0097d7] focus:ring-1 focus:ring-[#7db4e6]"
            >
              <option value="auto">Auto ({effectiveIsPython ? 'Python' : 'C++'})</option>
              <option value="cpp">C++</option>
              <option value="python">Python</option>
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[#607085]" />
          </label>

          <button
            onClick={() => setIsFullscreen((v) => !v)}
            className={`flex items-center gap-1 rounded border px-2 text-[#34495e] shadow-sm hover:bg-[#eef2f5] ${
              isFullscreen ? 'h-7 border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100' : 'h-7 border-[#dfe4ea] bg-white'
            }`}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none">
              {isFullscreen ? (
                <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>
              ) : (
                <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>
              )}
            </svg>
            {isFullscreen && <span className="text-[11px] font-medium">Exit</span>}
          </button>

          <button
            onClick={toggleCodeEditor}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#dfe4ea] bg-white text-[#34495e] shadow-sm hover:bg-[#eef2f5] hover:text-rose-500"
            title="Close code editor"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-[#d9dee5] bg-white px-3 py-1">
        <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${simulationBackendConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        <span className="truncate text-[11px] text-[#607085]">
          {isSimulating
            ? 'Simulation running - code changes apply on restart'
            : simulationStatus === 'connecting'
              ? 'Connecting to simulation backend...'
              : editorMode === 'blocks'
                ? 'Visual block editor'
                : 'Edit code, then click Start Simulation'}
        </span>
      </div>

      {(hasPico || hasEsp32) && hasArduino && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1">
          <span className="text-[10px] text-amber-700">
            Both boards detected — remove one for clarity
          </span>
        </div>
      )}
      {effectiveIsPython && (
        <div className="shrink-0 border-b border-sky-200 bg-sky-50 px-4 py-1">
          <span className="text-[10px] text-sky-700">
            MicroPython simulation mode is active for {hasEsp32 && !hasPico ? 'ESP32' : 'Raspberry Pi Pico'}
          </span>
        </div>
      )}
      {hasEsp32 && !hasPico && !hasArduino && !effectiveIsPython && !checkEsp32CppSupport(code).isSupported && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 flex items-center justify-between">
          <span className="text-[11px] text-amber-800 font-medium">
            ⚠️ ESP32 C++ partial support: Digital I/O is supported, but unsupported construct(s) detected: <strong>{checkEsp32CppSupport(code).unsupportedConstructs.join(', ')}</strong>.
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden nokey">
        {editorMode === 'blocks' ? (
          <div className="h-full bg-white">
            <BlocklyEditor />
          </div>
        ) : (
          <MonacoEditor
            language={effectiveIsPython ? 'python' : 'cpp'}
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value ?? '')}
            onMount={handleEditorMount}
            options={monacoOptions}
            loading={
              <div className="flex h-full flex-col bg-[#1e1e1e] p-4 font-mono text-sm leading-relaxed text-gray-500">
                <div className="flex items-center gap-4 border-b border-[#333] pb-2 text-xs text-gray-600">
                  <span className="w-8" />
                  <span className="flex-1">sketch.ino</span>
                </div>
                {[1,2,3,4,5,6,7,8].map(i => (
                  <div key={i} className="flex gap-4 py-[1px]">
                    <span className="w-8 select-none text-right text-gray-600">{i}</span>
                    <span className="flex-1">&nbsp;</span>
                  </div>
                ))}
              </div>
            }
          />
        )}
      </div>

      {!serialCollapsed && (
        <div
          className="h-1.5 shrink-0 cursor-row-resize transition-all hover:h-2 hover:bg-[#0097d7]/20 active:bg-[#0097d7]/40"
          onMouseDown={handleSerialResizeStart}
        />
      )}

      <div
        className="flex shrink-0 flex-col border-t border-[#d9dee5]"
        style={{ height: serialCollapsed ? 'auto' : serialHeight }}
      >
        <div className="flex shrink-0 items-center justify-between bg-white px-3 py-1">
          {hasEsp32 ? (
            <div className="flex items-center gap-3 min-w-0">
              <button
                className="flex items-center gap-1.5 min-w-0 hover:opacity-70"
                onClick={() => setSerialCollapsed((v) => !v)}
                title={serialCollapsed ? 'Show terminal monitor' : 'Hide terminal monitor'}
              >
                {serialCollapsed ? <ChevronRight size={12} className="shrink-0 text-[#607085]" /> : <ChevronDown size={12} className="shrink-0 text-[#607085]" />}
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#607085]">Terminal</span>
              </button>

              {/* Tab selector — only visible for ESP32 */}
              <div className="flex items-center bg-[#f1f5f9] rounded p-0.5 text-[11px]">
                <button
                  onClick={() => setActiveTerminalTab('usb')}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-medium transition-colors ${
                    activeTerminalTab === 'usb'
                      ? 'bg-white text-[#0f172a] shadow-sm'
                      : 'text-[#64748b] hover:text-[#0f172a]'
                  }`}
                >
                  <Terminal size={11} />
                  <span>USB Serial</span>
                  {serialOutput.length > 0 && (
                    <span className="rounded-full bg-[#e2e8f0] px-1.5 text-[9px] text-[#475569]">
                      {serialOutput.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTerminalTab('bluetooth')}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-medium transition-colors ${
                    activeTerminalTab === 'bluetooth'
                      ? 'bg-white text-[#0097d7] shadow-sm'
                      : 'text-[#64748b] hover:text-[#0f172a]'
                  }`}
                >
                  <Bluetooth size={11} />
                  <span>Bluetooth{bluetoothDeviceName ? ` (${bluetoothDeviceName})` : ''}</span>
                  {bluetoothOutput.length > 0 && (
                    <span className="rounded-full bg-[#e0f2fe] px-1.5 text-[9px] text-[#0284c7]">
                      {bluetoothOutput.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="flex items-center gap-2 min-w-0 hover:opacity-70"
              onClick={() => setSerialCollapsed((v) => !v)}
              title={serialCollapsed ? 'Show serial monitor' : 'Hide serial monitor'}
            >
              {serialCollapsed ? <ChevronRight size={12} className="shrink-0 text-[#607085]" /> : <ChevronDown size={12} className="shrink-0 text-[#607085]" />}
              <Terminal size={12} className="shrink-0 text-[#607085]" />
              <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#607085]">Serial</span>
              {serialOutput.length > 0 && (
                <span className="shrink-0 rounded bg-[#eef2f5] px-1.5 text-[10px] text-[#607085]">
                  {serialOutput.length} lines
                </span>
              )}
            </button>
          )}

          {(((!hasEsp32 || activeTerminalTab === 'usb') && serialOutput.length > 0) || (hasEsp32 && activeTerminalTab === 'bluetooth' && bluetoothOutput.length > 0)) && (
            <button
              className="shrink-0 p-0.5 text-[#607085] hover:text-[#20354d]"
              title={`Clear ${(!hasEsp32 || activeTerminalTab === 'usb') ? 'Serial' : 'Bluetooth'} Monitor`}
              onClick={() => {
                if (!hasEsp32 || activeTerminalTab === 'usb') {
                  useCircuitStore.setState({ serialOutput: [] });
                } else {
                  clearBluetoothSerial();
                }
              }}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
        {!serialCollapsed && (
          <>
            <div
              ref={serialContainerRef}
              className="flex-1 overflow-y-auto bg-[#0b1220] px-4 py-2 font-mono text-xs"
            >
              {(!hasEsp32 || activeTerminalTab === 'usb') ? (
                serialOutput.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <span className="italic text-gray-500">Serial output will appear here...</span>
                  </div>
                ) : (
                  serialOutput.map((line, index) => (
                    <div key={`${line}-${index}`} className="leading-relaxed text-gray-300 hover:bg-white/[0.03]">
                      <span className="mr-2 select-none text-gray-600">{`>`}</span>
                      {line}
                    </div>
                  ))
                )
              ) : (
                bluetoothOutput.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-1">
                    <span className="italic text-sky-400/70">
                      Bluetooth Serial ({bluetoothDeviceName || 'SerialBT'}) output will appear here...
                    </span>
                    <span className="text-[10px] text-gray-500">
                      Use SerialBT.print() / SerialBT.println() in code and send commands below
                    </span>
                  </div>
                ) : (
                  bluetoothOutput.map((line, index) => (
                    <div key={`${line}-${index}`} className="leading-relaxed text-sky-200 hover:bg-white/[0.03]">
                      <span className="mr-2 select-none text-sky-600">{`[BT]>`}</span>
                      {line}
                    </div>
                  ))
                )
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-[#1e293b] bg-[#0f172a] px-3 py-1.5">
              {(!hasEsp32 || activeTerminalTab === 'usb') ? (
                <input
                  type="text"
                  value={serialInputText}
                  onChange={(e) => setSerialInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendSerial();
                  }}
                  placeholder={isSimulating ? 'Send text to RX (D0)...' : 'Start simulation to send serial data'}
                  disabled={!isSimulating}
                  className="flex-1 rounded border border-[#334155] bg-[#020617] px-2 py-1 text-xs text-white placeholder-gray-500 outline-none focus:border-[#0097d7] disabled:opacity-50"
                />
              ) : (
                <input
                  type="text"
                  value={bluetoothInputText}
                  onChange={(e) => setBluetoothInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendBluetooth();
                  }}
                  placeholder={isSimulating ? `Send text to Bluetooth (${bluetoothDeviceName || 'SerialBT'})...` : 'Start simulation to send Bluetooth data'}
                  disabled={!isSimulating}
                  className="flex-1 rounded border border-[#0369a1] bg-[#020617] px-2 py-1 text-xs text-white placeholder-gray-500 outline-none focus:border-[#38bdf8] disabled:opacity-50"
                />
              )}
              <select
                value={lineEnding}
                onChange={(e) => setLineEnding(e.target.value as any)}
                disabled={!isSimulating}
                className="rounded border border-[#334155] bg-[#020617] px-2 py-1 text-[11px] text-gray-300 outline-none disabled:opacity-50"
              >
                <option value="newline">Newline (\n)</option>
                <option value="none">No line ending</option>
                <option value="both">Both (\r\n)</option>
              </select>
              <button
                onClick={activeTerminalTab === 'usb' ? handleSendSerial : handleSendBluetooth}
                disabled={!isSimulating || (activeTerminalTab === 'usb' ? !serialInputText.trim() : !bluetoothInputText.trim())}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-white shadow disabled:opacity-40 ${
                  activeTerminalTab === 'usb' ? 'bg-[#0097d7] hover:bg-[#0081b8]' : 'bg-[#0284c7] hover:bg-[#0369a1]'
                }`}
                title={activeTerminalTab === 'usb' ? 'Send serial input to Arduino/ESP32 RX pin' : 'Send Bluetooth data to ESP32 SerialBT'}
              >
                <Send size={11} />
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
