'use client';

import { HelpCircle } from 'lucide-react';
import { refreshSimulationFrameFromCurrentCircuit, useCircuitStore } from '@cs/lib/store';
import { getComponentDefinition, useDynamicComponentsStore } from '@cs/store/useDynamicComponentsStore';
import type { DynamicFieldDefinition } from '@cs/lib/types';

type DynamicFieldValues = Record<string, string>;
type PinPositionOverrides = Record<string, { x: number; y: number }>;

const RESISTANCE_UNIT_OPTIONS = [
  'p\u03A9',
  'n\u03A9',
  '\u00B5\u03A9',
  'm\u03A9',
  '\u03A9',
  'k\u03A9',
  'M\u03A9',
  'G\u03A9',
];

const CAPACITANCE_UNIT_OPTIONS = [
  'pF',
  'nF',
  '\u00B5F',
  'mF',
  'F',
];

const VOLTAGE_UNIT_OPTIONS = [
  'pV',
  'nV',
  '\u00B5V',
  'mV',
  'V',
  'kV',
  'MV',
  'GV',
];

function isDynamicFieldValues(value: unknown): value is DynamicFieldValues {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPinPositionOverrides(value: unknown): value is PinPositionOverrides {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function PropertiesPanel() {
  const node = useCircuitStore((state) => {
    if (state.selectedNodeIds.length !== 1) return undefined;
    return state.nodes.find((n) => n.id === state.selectedNodeIds[0]);
  });
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const updateNodeData = useCircuitStore((state) => state.updateNodeData);
  const pushHistory = useCircuitStore((state) => state.pushHistory);
  const dynamicComponents = useDynamicComponentsStore((state) => state.components);

  if (!node) return null;

  const componentDef = getComponentDefinition(node.data.componentType, dynamicComponents);
  const isDynamicComponent =
    node.type === 'dynamicComponent' ||
    node.data.componentType.startsWith('dynamic-') ||
    componentDef?.dynamicBehavior ||
    node.data.dynamicFieldValues;

  const dynamicFields = componentDef?.dynamicFields ?? [];
  const dynamicValues = isDynamicFieldValues(node.data.dynamicFieldValues)
    ? node.data.dynamicFieldValues
    : {};
  const dynamicDisplayName =
    dynamicValues.name ??
    String(node.data.properties?.name?.value ?? node.data.label);
  const defaultWidth = Math.round(Number(componentDef?.defaultWidth ?? node.width ?? 80));
  const defaultHeight = Math.round(Number(componentDef?.defaultHeight ?? node.height ?? 80));
  const nodeWidth = Math.round(Math.max(20, Number(node.data.width ?? defaultWidth)));
  const nodeHeight = Math.round(Math.max(20, Number(node.data.height ?? defaultHeight)));
  const pinPositionOverrides = isPinPositionOverrides(node.data.pinPositions)
    ? node.data.pinPositions
    : {};
  const pins = componentDef?.pins ?? [];

  const handleSizeChange = (key: 'width' | 'height', value: number) => {
    pushHistory();
    updateNodeData(node.id, {
      [key]: Math.max(20, Math.min(1200, Math.round(value || 20))),
    });
  };

  const renderSizeControls = () => (
    <div className="rounded border border-gray-200 bg-gray-50 p-2">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Size
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="text-[11px] text-gray-500">Width</span>
          <input
            type="number"
            min={20}
            max={1200}
            value={nodeWidth}
            onChange={(event) => handleSizeChange('width', Number(event.target.value))}
            className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 bg-blue-50 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] text-gray-500">Height</span>
          <input
            type="number"
            min={20}
            max={1200}
            value={nodeHeight}
            onChange={(event) => handleSizeChange('height', Number(event.target.value))}
            className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 bg-blue-50 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => {
          pushHistory();
          updateNodeData(node.id, {
            width: defaultWidth,
            height: defaultHeight,
          });
        }}
        className="mt-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        Reset size
      </button>
    </div>
  );

  const getRenderedPinPosition = (pinId: string, fallback: { x: number; y: number }) => {
    const override = pinPositionOverrides[pinId];
    return {
      x: Math.round(Number(override?.x ?? (fallback.x * nodeWidth) / defaultWidth)),
      y: Math.round(Number(override?.y ?? (fallback.y * nodeHeight) / defaultHeight)),
    };
  };

  const handlePinPositionChange = (pinId: string, axis: 'x' | 'y', value: number) => {
    const pin = pins.find((candidate) => candidate.id === pinId);
    if (!pin) return;

    const current = getRenderedPinPosition(pinId, pin.position);
    pushHistory();
    updateNodeData(node.id, {
      pinPositions: {
        ...pinPositionOverrides,
        [pinId]: {
          ...current,
          [axis]: Math.max(0, Math.min(axis === 'x' ? nodeWidth : nodeHeight, Math.round(value || 0))),
        },
      },
    });
  };

  const renderPinControls = () => {
    if (pins.length === 0) return null;

    return (
      <details className="rounded border border-gray-200 bg-gray-50">
        <summary className="cursor-pointer select-none px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Advanced pins
        </summary>
        <div className="border-t border-gray-200 p-2">
          <div className="mb-2 grid grid-cols-[1fr_58px_58px] items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            <span>Pin</span>
            <span>X</span>
            <span>Y</span>
          </div>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                pushHistory();
                updateNodeData(node.id, { pinPositions: {} });
              }}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100"
            >
              Reset pins
            </button>
          </div>
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
            {pins.map((pin) => {
              const position = getRenderedPinPosition(pin.id, pin.position);

              return (
                <div key={pin.id} className="grid grid-cols-[1fr_58px_58px] items-center gap-1">
                  <div className="truncate text-[11px] font-medium text-gray-600" title={pin.label}>
                    {pin.label || pin.id}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={nodeWidth}
                    value={position.x}
                    title={`${pin.label || pin.id} X`}
                    onChange={(event) => handlePinPositionChange(pin.id, 'x', Number(event.target.value))}
                    className="w-full rounded border border-blue-300 bg-blue-50 px-1 py-1 text-xs text-gray-800 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    max={nodeHeight}
                    value={position.y}
                    title={`${pin.label || pin.id} Y`}
                    onChange={(event) => handlePinPositionChange(pin.id, 'y', Number(event.target.value))}
                    className="w-full rounded border border-blue-300 bg-blue-50 px-1 py-1 text-xs text-gray-800 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </details>
    );
  };

  const handleDynamicFieldChange = (field: DynamicFieldDefinition, value: string) => {
    updateNodeData(node.id, {
      dynamicFieldValues: {
        ...dynamicValues,
        [field.id]: value,
      },
      ...(field.id === 'name'
        ? {
          label: value.trim() || node.data.label,
          properties: {
            ...node.data.properties,
            name: {
              ...(node.data.properties.name ?? {
                label: 'Name',
                type: 'string' as const,
                value: node.data.label,
              }),
              value: value.trim() || node.data.label,
            },
          },
        }
        : {}),
    });
  };

  const handleDynamicFile = (field: DynamicFieldDefinition, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      handleDynamicFieldChange(field, result);
    };
    reader.readAsDataURL(file);
  };

  if (isDynamicComponent) {
    return (
      <div className="absolute top-4 right-4 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
        <div className="bg-blue-500 text-white px-3 py-2 flex items-center justify-between">
          <span className="font-semibold text-sm">{dynamicDisplayName}</span>
          <button
            className="p-0.5 hover:bg-blue-600 rounded transition-colors"
            title="Help"
          >
            <HelpCircle size={14} />
          </button>
        </div>

        <div className="p-3 space-y-2.5">
          {dynamicFields.length === 0 ? (
            <div className="text-xs text-gray-400">No fields configured</div>
          ) : (
            dynamicFields.map((field) => {
              const value = dynamicValues[field.id] ?? field.defaultValue ?? '';
              return (
                <div key={field.id} className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-20 shrink-0 text-right">
                    {field.label}
                  </label>
                  <div className="flex-1 flex min-w-0 items-center gap-1">
                    {field.type === 'file' ? (
                      <div className="grid flex-1 gap-1">
                        <input
                          type="file"
                          onChange={(event) => handleDynamicFile(field, event.target.files?.[0] ?? null)}
                          className="w-full text-xs text-gray-700"
                        />
                        <input
                          type="text"
                          value={value.startsWith('data:') ? 'Selected file' : value}
                          onChange={(event) => handleDynamicFieldChange(field, event.target.value)}
                          placeholder="File URL"
                          className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 bg-blue-50 focus:outline-none focus:border-blue-500 focus:bg-white"
                        />
                      </div>
                    ) : (
                      <input
                        type={field.type === 'color' ? 'color' : 'text'}
                        value={value}
                        onChange={(event) => handleDynamicFieldChange(field, event.target.value)}
                        className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 bg-blue-50 focus:outline-none focus:border-blue-500 focus:bg-white"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  const properties = {
    ...componentDef?.defaultProperties,
    ...node.data.properties,
  };
  const visibleProperties = Object.entries(properties).filter(
    ([key]) => !(node.data.componentType === 'dcmotor' && key === 'speed') &&
               !(node.data.componentType === 'led' && key === 'maxVoltage') &&
               !(['capacitor', 'polarizedCapacitor'].includes(node.data.componentType) && key === 'capacitanceUnit') &&
               !(['battery1_5v', 'coincell'].includes(node.data.componentType) && key === 'voltage')
  );

  const handlePropertyChange = (key: string, value: string | number) => {
    pushHistory();
    const updatedProperties = {
      ...properties,
      [key]: { ...properties[key], value },
    };

    if (key === 'color' && node.data.componentType === 'led') {
      const color = String(value).toLowerCase();
      let defaultVf = 2.0;
      if (color === 'white') defaultVf = 3.2;
      else if (color === 'blue') defaultVf = 3.0;
      else if (color === 'green') defaultVf = 2.1;
      else if (color === 'yellow') defaultVf = 2.0;
      else if (color === 'red') defaultVf = 2.0;

      if (updatedProperties['voltage']) {
        updatedProperties['voltage'] = { ...updatedProperties['voltage'], value: defaultVf };
      }
    }

    updateNodeData(node.id, {
      properties: updatedProperties,
    });
    if (isSimulating) {
      requestAnimationFrame(() => refreshSimulationFrameFromCurrentCircuit());
    }
  };

  const handlePropertyUnitChange = (key: string, unit: string) => {
    pushHistory();
    const updatedProps = {
      ...properties,
      [key]: { ...properties[key], unit },
    };
    if (key === 'capacitance' && properties['capacitanceUnit']) {
      updatedProps['capacitanceUnit'] = {
        ...properties['capacitanceUnit'],
        value: unit,
      };
    }
    updateNodeData(node.id, {
      properties: updatedProps,
    });
    if (isSimulating) {
      requestAnimationFrame(() => refreshSimulationFrameFromCurrentCircuit());
    }
  };

  const simulationModel = componentDef?.simulationModel && componentDef.simulationModel !== 'generic'
    ? componentDef.simulationModel
    : node.data.componentType;


  if (simulationModel === 'multimeter' || simulationModel === 'oscilloscope') {
    const isScope = simulationModel === 'oscilloscope';
    const title = isScope ? 'Oscilloscope' : 'Multimeter';
    let modeValue = String(properties.mode?.value ?? 'voltage');
    if (modeValue === 'Voltage') modeValue = 'voltage';
    if (modeValue === 'Amperage') modeValue = 'current';
    if (modeValue === 'Resistance') modeValue = 'resistance';
    if (!isScope && modeValue === 'voltage_ac') modeValue = 'voltage';
    if (!isScope && modeValue === 'current_ac') modeValue = 'current';

    const nameValue = String(properties.name?.value ?? (isScope ? '4' : '1'));
    const timeValue = Number(properties.timeScale?.value ?? 1);
    const timeUnit = String(properties.timeUnit?.value ?? 'ms');
    const timeOptions = Array.isArray(properties.timeUnit?.options)
      ? properties.timeUnit.options
      : ['ps', 'ns', 'μs', 'ms', 's', 'ks', 'Ms', 'Gs'];

    const modeOptions = isScope
      ? [
        { value: 'voltage', label: 'DC Voltage (VDC)' },
        { value: 'voltage_ac', label: 'AC Voltage (VAC)' },
        { value: 'current', label: 'DC Current (ADC)' },
        { value: 'current_ac', label: 'AC Current (AAC)' },
        { value: 'resistance', label: 'Resistance (Ω)' },
        { value: 'continuity', label: 'Continuity Test' },
        { value: 'diode', label: 'Diode Test' },
      ]
      : [
        { value: 'voltage', label: 'DC Voltage (VDC)' },
        { value: 'current', label: 'DC Current (ADC)' },
        { value: 'resistance', label: 'Resistance (Ω)' },
        { value: 'continuity', label: 'Continuity Test' },
        { value: 'diode', label: 'Diode Test' },
      ];

    return (
      <div className="absolute right-3 top-3 z-50 w-[320px] overflow-hidden rounded border border-[#007eb9] bg-white shadow-xl">
        <div className="flex h-12 items-center justify-between bg-[#129bd3] px-3 text-white">
          <span className="text-xl font-bold leading-none">{title}</span>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white/65 text-lg font-bold leading-none"
            title="Help"
          >
            ?
          </button>
        </div>

        <div className="border-x-[6px] border-b-[6px] border-[#f2aa16] bg-white">
          <label className="grid h-10 grid-cols-[76px_1fr] border-b border-[#d4e8f2]">
            <span className="flex items-center bg-[#129bd3] px-3 text-lg font-bold text-white">
              Name
            </span>
            <input
              value={nameValue}
              onChange={(event) => handlePropertyChange('name', event.target.value)}
              className="min-w-0 border-0 bg-white px-3 text-lg font-semibold text-[#008bd0] outline-none"
            />
          </label>

          {!isScope ? (
            <label className="grid h-11 grid-cols-[76px_1fr]">
              <span className="flex items-center bg-[#129bd3] px-3 text-lg font-bold text-white">
                Mode
              </span>
              <select
                value={modeValue}
                onChange={(event) => handlePropertyChange('mode', event.target.value)}
                className="min-w-0 appearance-auto border-0 bg-white px-3 text-lg font-semibold text-[#008bd0] outline-none"
              >
                {modeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="grid h-11 grid-cols-[174px_74px_1fr]">
              <span className="flex items-center bg-[#129bd3] px-3 text-lg font-bold text-white">
                Time Per Division
              </span>
              <input
                type="number"
                min={1}
                value={timeValue}
                onChange={(event) => handlePropertyChange('timeScale', Number(event.target.value) || 1)}
                className="min-w-0 border border-[#89d1f1] bg-white px-2 text-lg text-[#008bd0] outline-none"
              />
              <select
                value={timeUnit}
                onChange={(event) => handlePropertyChange('timeUnit', event.target.value)}
                className="min-w-0 appearance-auto border-l border-[#89d1f1] bg-white px-1 text-lg text-black outline-none"
              >
                {timeOptions.map((option) => (
                  <option key={String(option)} value={String(option)}>
                    {String(option)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (simulationModel === 'lcd16x2') {
    const backpackType = String(properties.backpackType?.value ?? 'PCF8574');
    const i2cAddress = String(properties.i2cAddress?.value ?? '0x27');
    const nameValue = String(properties.name?.value ?? 'LCD1');

    return (
      <div className="absolute top-4 right-4 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden font-sans">
        {/* Header */}
        <div className="bg-blue-500 text-white px-3 py-2 flex items-center justify-between">
          <span className="font-semibold text-sm">LCD 16 x 2 (I2C)</span>
          <button
            className="p-0.5 hover:bg-blue-600 rounded transition-colors"
            title="Help"
          >
            <HelpCircle size={14} />
          </button>
        </div>

        {/* Properties */}
        <div className="p-3 space-y-2.5">
          {/* Name Field */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20 shrink-0 text-right">
              Name
            </label>
            <div className="flex-1 flex items-center gap-1">
              <input
                type="text"
                value={nameValue}
                onChange={(e) => handlePropertyChange('name', e.target.value)}
                className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 bg-blue-50 focus:outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Type Field */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20 shrink-0 text-right">
              Type
            </label>
            <div className="flex-1">
              <select
                value={backpackType.endsWith('-based') ? backpackType : `${backpackType}-based`}
                onChange={(e) => {
                  const rawVal = e.target.value.replace('-based', '');
                  handlePropertyChange('backpackType', rawVal);

                  // Address constraint validation
                  const pcfAddrs = ['0x20', '0x21', '0x22', '0x23', '0x24', '0x25', '0x26', '0x27'];
                  const mcpAddrs = ['0x20', '0x21', '0x22', '0x23', '0x24', '0x25', '0x26', '0x27'];
                  const allowed = rawVal === 'MCP23008' ? mcpAddrs : pcfAddrs;
                  if (!allowed.includes(i2cAddress)) {
                    handlePropertyChange('i2cAddress', allowed[0]);
                  }
                }}
                className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 bg-blue-50 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="PCF8574-based" title="Most common I2C LCD backpack used with HD44780 displays.">
                  PCF8574-based
                </option>
                <option value="MCP23008-based" title="Alternative I2C GPIO expander supported by some LCD backpacks.">
                  MCP23008-based
                </option>
              </select>
            </div>
          </div>

          {/* Address Field */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20 shrink-0 text-right">
              Address
            </label>
            <div className="flex-1 flex items-center gap-1">
              <select
                value={i2cAddress}
                onChange={(e) => handlePropertyChange('i2cAddress', e.target.value)}
                className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 bg-blue-50 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {/* x20 - 27 count */}
                {['0x20', '0x21', '0x22', '0x23', '0x24', '0x25', '0x26', '0x27'].map(addr => {
                  const dec = parseInt(addr, 16);
                  return (
                    <option key={addr} value={addr}>
                      {dec} ({addr})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (

    <div className="absolute top-4 right-4 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
      {/* Header */}
      <div className="bg-blue-500 text-white px-3 py-2 flex items-center justify-between">
        <span className="font-semibold text-sm">{componentDef?.label ?? node.data.label}</span>
        <button
          className="p-0.5 hover:bg-blue-600 rounded transition-colors"
          title="Help"
        >
          <HelpCircle size={14} />
        </button>
      </div>

      {/* Properties */}
      <div className="p-3 space-y-2.5">
        {visibleProperties.map(([key, prop]) => (
          <div key={key} className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-20 shrink-0 text-right">
              {prop.label}
            </label>
            <div className="flex-1 flex items-center gap-1">
              {prop.type === 'number' && (
                <>
                  <input
                    type="number"
                    value={prop.value}
                    min={prop.min}
                    max={prop.max}
                    onChange={(e) => {
                      let v = parseFloat(e.target.value) || 0;
                      if (prop.min !== undefined && v < prop.min) v = prop.min;
                      if (prop.max !== undefined && v > prop.max) v = prop.max;
                      handlePropertyChange(key, v);
                    }}
                    className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 bg-blue-50 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                  {['resistor', 'potentiometer'].includes(node.data.componentType) && key === 'resistance' ? (
                    <select
                      value={prop.unit ?? '\u03A9'}
                      onChange={(e) => handlePropertyUnitChange(key, e.target.value)}
                      className="w-16 border border-blue-300 rounded px-1 py-1 text-sm text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                    >
                      {RESISTANCE_UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  ) : ['capacitor', 'polarizedCapacitor'].includes(node.data.componentType) && key === 'capacitance' ? (
                    <select
                      value={prop.unit ?? properties['capacitanceUnit']?.value ?? '\u00B5F'}
                      onChange={(e) => handlePropertyUnitChange(key, e.target.value)}
                      className="w-16 border border-blue-300 rounded px-1 py-1 text-sm text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                    >
                      {CAPACITANCE_UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  ) : node.data.componentType === 'polarizedCapacitor' && key === 'voltageRating' ? (
                    <select
                      value={prop.unit ?? 'V'}
                      onChange={(e) => handlePropertyUnitChange(key, e.target.value)}
                      className="w-16 border border-blue-300 rounded px-1 py-1 text-sm text-gray-800 bg-white focus:outline-none focus:border-blue-500"
                    >
                      {VOLTAGE_UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  ) : prop.unit ? (
                    <span className="text-xs text-gray-500 whitespace-nowrap">{prop.unit}</span>
                  ) : null}
                       </>
              )}
              {prop.type === 'string' && (
                <input
                  type="text"
                  value={prop.value}
                  onChange={(e) => handlePropertyChange(key, e.target.value)}
                  className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 bg-blue-50 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              )}
              {prop.type === 'select' && (
                <select
                  value={prop.value}
                  onChange={(e) => handlePropertyChange(key, e.target.value)}
                  className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 bg-blue-50 focus:outline-none focus:border-blue-500"
                >
                  {prop.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
