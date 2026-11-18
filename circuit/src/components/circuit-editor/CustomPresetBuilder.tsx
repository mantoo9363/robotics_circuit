// src/components/circuit-editor/CustomPresetBuilder.tsx
// Replace your existing file with this.
//
// What changed:
//  Step 3 (Code) now has two tabs:
//    • "Blockly"  — embed the Blockly editor; code auto-generates as you drag blocks
//    • "Manual"   — write Arduino / MicroPython by hand (previous behaviour)
//  When saving in Blockly mode, the preset stores the latest Blockly-generated code.
//  The modal expands to full-screen on the Blockly code step.

'use client';

import { useState, useCallback } from 'react';
import { X, Plus, Trash2, ChevronRight, ChevronLeft, Save, Zap, Blocks, Code2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { COMPONENT_CATALOG } from '@cs/lib/circuit-components';
import { useCustomPresetsStore } from '@cs/store/useCustomPresetsStore';
import { useBlocklyStore } from '@cs/store/useBlocklyStore';
import BlocklyEditor from './BlocklyEditor';
import type { CircuitPreset } from '@cs/lib/circuit-presets';
import type { CircuitNode, CircuitEdge } from '@cs/lib/types';

// ─────────────────────────────────────────────────────────────
// Pin catalogue
// ─────────────────────────────────────────────────────────────
const COMPONENT_PINS: Record<string, string[]> = {
  resistor:       ['pin1', 'pin2'],
  led:            ['anode', 'cathode'],
  ledrgb:         ['red', 'ground', 'green', 'blue'],
  pushbutton:     ['pin1a', 'pin1b', 'pin2a', 'pin2b'],
  potentiometer:  ['pin1', 'wiper', 'pin2'],
  capacitor:      ['pin1', 'pin2'],
  slideswitch:    ['pin1', 'common', 'pin2'],
  battery9v:      ['positive', 'negative'],
  battery1_5v:    ['positive', 'negative'],
  coincell:       ['positive', 'negative'],
  dcmotor:        ['pin1', 'pin2'],
  servo:          ['signal', 'power', 'ground'],
  npn:            ['collector', 'base', 'emitter'],
  diode:          ['anode', 'cathode'],
  photoresistor:  ['pin1', 'pin2'],
  arduino: [
    'd2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12','d13',
    'a0','a1','a2','a3','a4',
    'gnd1','gnd2','gnd3','5v','3v3','vin',
  ],
  raspberrypipico: [
    'gp0','gp1','gp2','gp3','gp4','gp5','gp6','gp7','gp8','gp9',
    'gp10','gp11','gp12','gp13','gp14','gp15','gp16','gp17','gp18',
    'gp19','gp20','gp21','gp22','gp26','gp27','gp28',
    'pico_gnd1','pico_gnd2','pico_gnd3','pico_gnd4','pico_3v3',
  ],
};

const WIRE_COLORS = ['#22c55e','#3b82f6','#ef4444','#eab308','#a855f7','#f97316','#ec4899','#ffffff'];

function autoPosition(index: number, type: string) {
  const isMicro = type === 'arduino' || type === 'raspberrypipico';
  return isMicro
    ? { x: 60, y: 80 }
    : { x: 350 + (index - 1) * 200, y: 80 + (index % 3) * 150 };
}

// ─────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────
interface ComponentEntry {
  uid: string;
  type: string;
  label: string;
  name: string;
  color?: string;
}
interface WireEntry {
  uid: string;
  sourceUid: string;
  sourceHandle: string;
  targetUid: string;
  targetHandle: string;
  color: string;
}

// ─────────────────────────────────────────────────────────────
// Step bar
// ─────────────────────────────────────────────────────────────
const STEPS = ['Info', 'Components', 'Wires', 'Code', 'Save'];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 mb-6 flex-wrap">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
            i < current  ? 'bg-emerald-500 text-white' :
            i === current ? 'bg-cyan-500 text-white'    :
                            'bg-gray-700 text-gray-400'
          }`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`text-xs hidden sm:block ${i === current ? 'text-white' : 'text-gray-500'}`}>{s}</span>
          {i < STEPS.length - 1 && (
            <div className={`w-5 h-px mx-1 ${i < current ? 'bg-emerald-500' : 'bg-gray-700'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────
interface Props { onClose: () => void; }

export default function CustomPresetBuilder({ onClose }: Props) {
  const addPreset = useCustomPresetsStore((s) => s.addPreset);
  const blocklyCode = useBlocklyStore((s) => s.code); // live from BlocklyEditor

  const [step, setStep]           = useState(0);
  const [presetName, setPresetName] = useState('');
  const [group, setGroup]         = useState<'Arduino' | 'Raspberry Pi Pico' | 'Basic'>('Arduino');
  const [components, setComponents] = useState<ComponentEntry[]>([]);
  const [wires, setWires]         = useState<WireEntry[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [codeMode, setCodeMode]   = useState<'blockly' | 'manual'>('blockly');
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState('');

  // ── Step 1 helpers ──
  const [addType, setAddType]   = useState('arduino');
  const [addColor, setAddColor] = useState('red');

  const handleAddComponent = useCallback(() => {
    const def = COMPONENT_CATALOG.find((c) => c.type === addType);
    if (!def) return;
    const count = components.filter((c) => c.type === addType).length + 1;
    setComponents((prev) => [...prev, {
      uid:   uuidv4(),
      type:  addType,
      label: def.label,
      name:  `${def.label.replace(/\s+/g, '').toUpperCase().slice(0, 3)}${count}`,
      color: addType === 'led' ? addColor : undefined,
    }]);
  }, [addType, addColor, components]);

  const removeComponent = useCallback((uid: string) => {
    setComponents((prev) => prev.filter((c) => c.uid !== uid));
    setWires((prev) => prev.filter((w) => w.sourceUid !== uid && w.targetUid !== uid));
  }, []);

  // ── Step 2 helpers ──
  const [wireSrcUid, setWireSrcUid] = useState('');
  const [wireSrcPin, setWireSrcPin] = useState('');
  const [wireDstUid, setWireDstUid] = useState('');
  const [wireDstPin, setWireDstPin] = useState('');
  const [wireColor,  setWireColor]  = useState('#22c55e');

  const handleAddWire = useCallback(() => {
    if (!wireSrcUid || !wireSrcPin || !wireDstUid || !wireDstPin) return;
    setWires((prev) => [...prev, {
      uid: uuidv4(),
      sourceUid: wireSrcUid, sourceHandle: wireSrcPin,
      targetUid: wireDstUid, targetHandle: wireDstPin,
      color: wireColor,
    }]);
  }, [wireSrcUid, wireSrcPin, wireDstUid, wireDstPin, wireColor]);

  // ── Build & save ──
  const buildAndSave = useCallback(() => {
    if (!presetName.trim()) { setError('Please enter a preset name.'); return; }
    if (components.length === 0) { setError('Add at least one component.'); return; }

    // Pick code source
    const finalCode = codeMode === 'blockly' ? blocklyCode : manualCode;

    const nodes: CircuitNode[] = components.map((comp, idx) => {
      const def  = COMPONENT_CATALOG.find((c) => c.type === comp.type)!;
      const pos  = autoPosition(idx, comp.type);
      const props = structuredClone(def.defaultProperties);
      if (props.name)  props.name  = { ...props.name,  value: comp.name };
      if (comp.color && props.color) props.color = { ...props.color, value: comp.color };
      return { id: comp.uid, type: comp.type, position: pos, data: { componentType: comp.type, label: def.label, properties: props, rotation: 0 } };
    });

    const edges: CircuitEdge[] = wires.map((w) => ({
      id: uuidv4(),
      source: w.sourceUid, sourceHandle: w.sourceHandle,
      target: w.targetUid, targetHandle: w.targetHandle,
      type: 'wire',
      data: { color: w.color },
    }));

    const preset: CircuitPreset = {
      id:    `custom-${uuidv4()}`,
      label: presetName.trim(),
      group,
      nodes,
      edges,
      ...(group === 'Arduino'           ? { arduinoCode: finalCode } : {}),
      ...(group === 'Raspberry Pi Pico' ? { picoCode:    finalCode } : {}),
    };

    addPreset(preset);
    setSaved(true);
    setError('');
  }, [presetName, group, components, wires, codeMode, blocklyCode, manualCode, addPreset]);

  // ── Helpers ──
  const pinsForComponent = (uid: string) => {
    const comp = components.find((c) => c.uid === uid);
    return comp ? (COMPONENT_PINS[comp.type] ?? []) : [];
  };
  const compLabel = (uid: string) => {
    const comp = components.find((c) => c.uid === uid);
    return comp ? `${comp.name} (${comp.type})` : '';
  };

  // ── Modal width: expand to full screen when Blockly editor is shown ──
  const isBlocklyCodeStep = step === 3 && codeMode === 'blockly';
  const modalCls = isBlocklyCodeStep
    ? 'fixed inset-4 z-[9999] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden'
    : 'relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6';

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className={modalCls}>

        {/* Header */}
        <div className={`flex items-center justify-between ${isBlocklyCodeStep ? 'px-6 py-4 border-b border-gray-700 shrink-0' : 'mb-4'}`}>
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-cyan-400" />
            <span className="text-white font-semibold text-base">Custom Preset Builder</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body — normal steps */}
        {!isBlocklyCodeStep && (
          <div>
            <StepBar current={step} />

            {/* ── STEP 0: Info ── */}
            {step === 0 && (
              <div className="space-y-4">
                <h2 className="text-white font-medium">Preset info</h2>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Preset name *</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                    placeholder="e.g. Button LED Controller"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Board / Group</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                    value={group}
                    onChange={(e) => setGroup(e.target.value as typeof group)}
                  >
                    <option value="Arduino">Arduino</option>
                    <option value="Raspberry Pi Pico">Raspberry Pi Pico</option>
                    <option value="Basic">Basic (no microcontroller)</option>
                  </select>
                </div>
              </div>
            )}

            {/* ── STEP 1: Components ── */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-white font-medium">Add components</h2>
                <div className="flex gap-2 flex-wrap">
                  <select
                    className="flex-1 min-w-[160px] bg-gray-800 border border-gray-600 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-cyan-500"
                    value={addType}
                    onChange={(e) => setAddType(e.target.value)}
                  >
                    {COMPONENT_CATALOG.map((c) => (
                      <option key={c.type} value={c.type}>{c.label}</option>
                    ))}
                  </select>
                  {addType === 'led' && (
                    <select
                      className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-2 text-white text-xs focus:outline-none"
                      value={addColor}
                      onChange={(e) => setAddColor(e.target.value)}
                    >
                      {['red','green','blue','yellow','white'].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <button onClick={handleAddComponent} className="flex items-center gap-1 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded-lg transition-colors">
                    <Plus size={14} /> Add
                  </button>
                </div>
                {components.length === 0 && (
                  <p className="text-gray-500 text-sm text-center py-6">No components yet.</p>
                )}
                <div className="space-y-2">
                  {components.map((comp) => (
                    <div key={comp.uid} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2 border border-gray-700">
                      <div className="flex-1">
                        <span className="text-white text-xs font-medium">{comp.name}</span>
                        <span className="text-gray-400 text-xs ml-2">({comp.type}{comp.color ? ` · ${comp.color}` : ''})</span>
                      </div>
                      <input
                        className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none"
                        value={comp.name}
                        onChange={(e) => setComponents((prev) => prev.map((c) => c.uid === comp.uid ? { ...c, name: e.target.value } : c))}
                      />
                      <button onClick={() => removeComponent(comp.uid)} className="text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP 2: Wires ── */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-white font-medium">Connect wires</h2>
                {components.length < 2 ? (
                  <p className="text-amber-400 text-sm">Add at least 2 components first.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'From component', uid: wireSrcUid, setUid: (v: string) => { setWireSrcUid(v); setWireSrcPin(''); }, pin: wireSrcPin, setPin: setWireSrcPin, exclude: '' },
                        { label: 'To component',   uid: wireDstUid, setUid: (v: string) => { setWireDstUid(v); setWireDstPin(''); }, pin: wireDstPin, setPin: setWireDstPin, exclude: wireSrcUid },
                      ].map(({ label, uid, setUid, pin, setPin, exclude }) => (
                        <div key={label} className="contents">
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">{label}</label>
                            <select className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-2 text-white text-xs focus:outline-none" value={uid} onChange={(e) => setUid(e.target.value)}>
                              <option value="">Select…</option>
                              {components.filter((c) => c.uid !== exclude).map((c) => <option key={c.uid} value={c.uid}>{c.name} ({c.type})</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Pin</label>
                            <select className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-2 text-white text-xs focus:outline-none" value={pin} onChange={(e) => setPin(e.target.value)} disabled={!uid}>
                              <option value="">Select…</option>
                              {pinsForComponent(uid).map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-400">Wire colour</label>
                      <div className="flex gap-1">
                        {WIRE_COLORS.map((c) => (
                          <button key={c} onClick={() => setWireColor(c)}
                            className={`w-5 h-5 rounded border-2 transition-transform hover:scale-110 ${wireColor === c ? 'border-white scale-110' : 'border-gray-600'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <button onClick={handleAddWire} disabled={!wireSrcPin || !wireDstPin}
                        className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs rounded-lg transition-colors">
                        <Plus size={13} /> Add wire
                      </button>
                    </div>
                    {wires.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No wires yet.</p>}
                    <div className="space-y-1.5">
                      {wires.map((w) => (
                        <div key={w.uid} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 border border-gray-700">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
                          <span className="text-white text-xs flex-1 truncate">
                            {compLabel(w.sourceUid)} <span className="text-cyan-400">{w.sourceHandle}</span>
                            {' → '}
                            {compLabel(w.targetUid)} <span className="text-cyan-400">{w.targetHandle}</span>
                          </span>
                          <button onClick={() => setWires((p) => p.filter((x) => x.uid !== w.uid))} className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── STEP 3: Code — tab selector only (Blockly expands full screen) ── */}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-white font-medium">Program the circuit</h2>

                {/* Tab switcher */}
                <div className="flex rounded-lg overflow-hidden border border-gray-700">
                  <button
                    onClick={() => setCodeMode('blockly')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${codeMode === 'blockly' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    <Blocks size={15} /> Blockly (visual)
                  </button>
                  <button
                    onClick={() => setCodeMode('manual')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${codeMode === 'manual' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                  >
                    <Code2 size={15} /> Manual code
                  </button>
                </div>

                {codeMode === 'blockly' && (
                  <div className="bg-cyan-950/30 border border-cyan-800/40 rounded-xl p-4 space-y-2">
                    <p className="text-cyan-300 text-sm font-medium flex items-center gap-2">
                      <Blocks size={14} /> Blockly editor will open full-screen
                    </p>
                    <p className="text-gray-400 text-xs">
                      Click <strong className="text-white">Next</strong> to open the Blockly canvas.
                      Drag blocks to build your program — code generates automatically and is saved with this preset.
                    </p>
                    {blocklyCode && blocklyCode.trim() && blocklyCode !== '// Drag blocks to generate code\n' && (
                      <div className="mt-2">
                        <p className="text-gray-400 text-[10px] mb-1">Current Blockly output preview:</p>
                        <pre className="text-green-400 text-[10px] font-mono bg-gray-950 rounded-lg p-2 max-h-28 overflow-auto">
                          {blocklyCode}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {codeMode === 'manual' && (
                  <textarea
                    className="w-full h-56 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-green-400 text-xs font-mono resize-none focus:outline-none focus:border-cyan-500"
                    placeholder={group === 'Raspberry Pi Pico'
                      ? '# MicroPython\nfrom machine import Pin\nimport time\n\nled = Pin(15, Pin.OUT)\nwhile True:\n    led.value(1)\n    time.sleep(1)\n    led.value(0)\n    time.sleep(1)'
                      : '// Arduino C/C++\nvoid setup() {\n  pinMode(13, OUTPUT);\n}\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(1000);\n  digitalWrite(13, LOW);\n  delay(1000);\n}'
                    }
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    spellCheck={false}
                  />
                )}
              </div>
            )}

            {/* ── STEP 4: Save ── */}
            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-white font-medium">Review & save</h2>
                <div className="bg-gray-800 rounded-xl p-4 space-y-2 border border-gray-700">
                  {[
                    ['Name',       presetName || '—'],
                    ['Group',      group],
                    ['Components', String(components.length)],
                    ['Wires',      String(wires.length)],
                    ['Code source', codeMode === 'blockly' ? 'Blockly (visual)' : 'Manual'],
                    ['Code', codeMode === 'blockly'
                      ? (blocklyCode?.trim() && blocklyCode !== '// Drag blocks to generate code\n' ? `${blocklyCode.split('\n').length} lines` : '⚠ No blocks placed yet')
                      : (manualCode.trim() ? `${manualCode.split('\n').length} lines` : 'None')],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span className="text-gray-400">{k}</span>
                      <span className={`font-medium ${k === 'Code source' ? 'text-cyan-300' : 'text-white'}`}>{v}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  {components.map((c) => (
                    <div key={c.uid} className="flex items-center gap-2 text-xs text-gray-300">
                      <span className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0" />
                      {c.name} — {c.type}{c.color ? ` (${c.color})` : ''}
                    </div>
                  ))}
                  {wires.map((w) => (
                    <div key={w.uid} className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
                      {compLabel(w.sourceUid)}.{w.sourceHandle} → {compLabel(w.targetUid)}.{w.targetHandle}
                    </div>
                  ))}
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                {saved ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white text-2xl">✓</div>
                    <p className="text-white font-medium">Preset saved!</p>
                    <p className="text-gray-400 text-sm text-center">
                      Open <strong>Presets</strong> in the toolbar → <strong>{group} — Custom</strong>.
                      Load it, then press <strong>▶ Start Simulation</strong> — your Blockly code runs.
                    </p>
                    <button onClick={onClose} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
                      Done
                    </button>
                  </div>
                ) : (
                  <button onClick={buildAndSave} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors">
                    <Save size={16} /> Save preset to toolbar
                  </button>
                )}
              </div>
            )}

            {/* Navigation */}
            {!saved && (
              <div className="flex justify-between mt-6 pt-4 border-t border-gray-800">
                <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
                  className="flex items-center gap-1 px-4 py-2 text-gray-400 hover:text-white disabled:opacity-30 text-sm transition-colors">
                  <ChevronLeft size={16} /> Back
                </button>
                {step < STEPS.length - 1 && (
                  <button
                    onClick={() => {
                      if (step === 0 && !presetName.trim()) { setError('Please enter a preset name.'); return; }
                      if (step === 1 && components.length === 0) { setError('Add at least one component.'); return; }
                      setError(''); setStep((s) => s + 1);
                    }}
                    className="flex items-center gap-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                )}
              </div>
            )}
            {error && step < 4 && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>
        )}

        {/* ── STEP 3 BLOCKLY: Full-screen Blockly canvas ── */}
        {isBlocklyCodeStep && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Sub-header */}
            <div className="flex items-center gap-3 px-6 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
              <StepBar current={step} />
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setCodeMode('manual')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
                  <Code2 size={13} /> Switch to manual
                </button>
                <button onClick={() => { setError(''); setStep((s) => s + 1); }}
                  className="flex items-center gap-1 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors">
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>

            {/* Blockly canvas fills remaining height */}
            <div className="flex-1 overflow-hidden">
              <BlocklyEditor />
            </div>

            {/* Live code preview strip */}
            <div className="shrink-0 bg-gray-950 border-t border-gray-800 px-4 py-2 flex items-center gap-3">
              <span className="text-gray-500 text-[10px] font-mono shrink-0">Generated:</span>
              <pre className="text-green-400 text-[10px] font-mono flex-1 truncate">
                {blocklyCode?.split('\n').slice(0, 3).join(' | ') || '// drag blocks above…'}
              </pre>
              <span className="text-gray-600 text-[10px] shrink-0">
                {blocklyCode ? `${blocklyCode.split('\n').length} lines` : ''}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}