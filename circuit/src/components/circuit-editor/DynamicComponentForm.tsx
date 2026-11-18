'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { COMPONENT_CATALOG, COMPONENT_THUMBNAILS } from '@cs/lib/circuit-components';
import { useDynamicComponentsStore, type DynamicComponentDefinition } from '@cs/store/useDynamicComponentsStore';
import type {
  ComponentCategory,
  DynamicActionKind,
  DynamicFieldDefinition,
  DynamicFieldType,
  PinDefinition,
} from '@cs/lib/types';

const ACTIONS: Array<{ value: DynamicActionKind; label: string }> = [
  { value: 'none', label: 'Do nothing' },
  { value: 'showText', label: 'Show text' },
  { value: 'showImage', label: 'Show image' },
  { value: 'toggleText', label: 'Toggle text' },
  { value: 'toggleImage', label: 'Toggle image' },
];

const CATEGORIES: ComponentCategory[] = ['basic', 'input', 'output', 'power'];
const SIMULATION_MODELS = [
  { value: 'generic', label: 'Generic / visual only' },
  { value: 'led', label: 'LED' },
  { value: 'ledrgb', label: 'RGB LED' },
  { value: 'resistor', label: 'Resistor / wire-through' },
  { value: 'dcmotor', label: 'DC motor' },
  { value: 'piezo', label: 'Piezo buzzer' },
  { value: 'servo', label: 'Servo motor' },
  { value: 'multimeter', label: 'Multimeter' },
  { value: 'oscilloscope', label: 'Oscilloscope' },
  { value: 'gasSensor', label: 'Gas sensor' },
  { value: 'battery9v', label: 'Battery / power source' },
  { value: 'slideswitch', label: 'Slide switch' },
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function makeAction(kind: DynamicActionKind, text: string, imageSrc: string) {
  return {
    kind,
    text: text.trim(),
    imageSrc: imageSrc.trim(),
  };
}

function createDefaultPins(): PinDefinition[] {
  return [
    { id: 'pin1', label: 'Pin 1', description: 'Connect wire here', position: { x: 20, y: 60 } },
    { id: 'pin2', label: 'Pin 2', description: 'Connect wire here', position: { x: 100, y: 60 } },
  ];
}

function createPinsForSimulationModel(model: string, width: number, height: number): PinDefinition[] {
  const left = Math.round(width * 0.12);
  const right = Math.round(width * 0.88);
  const center = Math.round(width * 0.5);
  const top = Math.round(height * 0.22);
  const middle = Math.round(height * 0.5);
  const bottom = Math.round(height * 0.82);

  if (model === 'led') {
    return [
      { id: 'anode', label: 'Anode', description: 'Positive LED pin', position: { x: left, y: middle } },
      { id: 'cathode', label: 'Cathode', description: 'Negative LED pin', position: { x: right, y: middle } },
    ];
  }
  if (model === 'ledrgb') {
    return [
      { id: 'red', label: 'Red', description: 'Red channel', position: { x: left, y: top } },
      { id: 'green', label: 'Green', description: 'Green channel', position: { x: left, y: middle } },
      { id: 'blue', label: 'Blue', description: 'Blue channel', position: { x: left, y: bottom } },
      { id: 'ground', label: 'Ground', description: 'Common ground', position: { x: right, y: middle } },
    ];
  }
  if (model === 'servo') {
    return [
      { id: 'power', label: 'Power', description: 'Servo VCC', position: { x: left, y: top } },
      { id: 'ground', label: 'Ground', description: 'Servo GND', position: { x: left, y: middle } },
      { id: 'signal', label: 'Signal', description: 'Servo control signal', position: { x: left, y: bottom } },
    ];
  }
  if (model === 'multimeter') {
    return [
      { id: 'positive', label: 'Positive', description: 'Red probe', position: { x: left, y: middle } },
      { id: 'negative', label: 'Negative', description: 'Black probe', position: { x: right, y: middle } },
    ];
  }
  if (model === 'oscilloscope') {
    return [
      { id: 'signal', label: 'Signal', description: 'Probe signal', position: { x: left, y: middle } },
      { id: 'ground', label: 'Ground', description: 'Probe ground', position: { x: right, y: middle } },
    ];
  }
  if (model === 'piezo') {
    return [
      { id: 'positive', label: 'Positive', description: 'Positive buzzer pin', position: { x: left, y: middle } },
      { id: 'negative', label: 'Negative', description: 'Negative buzzer pin', position: { x: right, y: middle } },
    ];
  }
  if (model === 'battery9v') {
    return [
      { id: 'positive', label: 'Positive', description: 'Power output', position: { x: center, y: top } },
      { id: 'negative', label: 'Negative', description: 'Ground output', position: { x: center, y: bottom } },
    ];
  }
  if (model === 'gasSensor') {
    return [
      { id: 'vcc', label: 'VCC', description: 'Power input', position: { x: left, y: top } },
      { id: 'gnd', label: 'GND', description: 'Ground input', position: { x: left, y: middle } },
      { id: 'analog', label: 'Analog', description: 'Analog output', position: { x: left, y: bottom } },
    ];
  }
  if (model === 'slideswitch') {
    return [
      { id: 'pin1', label: 'Pin 1', description: 'Switch throw 1', position: { x: left, y: top } },
      { id: 'common', label: 'Common', description: 'Switch common', position: { x: center, y: middle } },
      { id: 'pin2', label: 'Pin 2', description: 'Switch throw 2', position: { x: right, y: bottom } },
    ];
  }
  return createDefaultPins();
}

function createDefaultFields(): DynamicFieldDefinition[] {
  return [
    { id: 'name', label: 'Name', type: 'text', defaultValue: 'My Component' },
    { id: 'color', label: 'Color', type: 'color', defaultValue: '#2f80ff' },
  ];
}

function createDefaultPropertiesForModel(model: string, name: string): DynamicComponentDefinition['defaultProperties'] {
  const base: DynamicComponentDefinition['defaultProperties'] = {
    name: { label: 'Name', type: 'string', value: name },
  };
  if (model === 'battery9v') {
    base.voltage = { label: 'Voltage', type: 'number', value: 9, unit: 'V', min: 0, max: 24 };
  }
  if (model === 'resistor') {
    base.resistance = { label: 'Resistance', type: 'number', value: 220, unit: 'ohm', min: 1 };
  }
  if (model === 'gasSensor') {
    base.gasLevel = { label: 'Gas Level', type: 'number', value: 0, min: 0, max: 1023 };
  }
  if (model === 'slideswitch') {
    base.state = { label: 'State', type: 'select', value: 'off', options: ['off', 'on'] };
  }
  if (model === 'led') {
    base.color = { label: 'Color', type: 'select', value: 'red', options: ['red', 'green', 'blue', 'yellow', 'white'] };
  }
  return base;
}

function clampPinPosition(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function clampDimension(value: number) {
  return Math.max(24, Math.min(420, Math.round(value)));
}

function sizeFromSvgText(svgText: string) {
  try {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;
    const width = Number.parseFloat(svg.getAttribute('width') ?? '');
    const height = Number.parseFloat(svg.getAttribute('height') ?? '');
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width: clampDimension(width), height: clampDimension(height) };
    }

    const viewBox = svg.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
    if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
      return { width: clampDimension(viewBox[2]), height: clampDimension(viewBox[3]) };
    }
  } catch {
    /* ignore malformed SVG dimensions */
  }

  return null;
}

export function DynamicComponentForm({ onClose }: { onClose: () => void }) {
  const { components, addComponent, removeComponent } = useDynamicComponentsStore();
  const [label, setLabel] = useState('My Component');
  const [category, setCategory] = useState<ComponentCategory>('basic');
  const [svgMode, setSvgMode] = useState<'existing' | 'url' | 'upload'>('existing');
  const [selectedSvgType, setSelectedSvgType] = useState('led');
  const [simulationModel, setSimulationModel] = useState('led');
  const [customSvgUrl, setCustomSvgUrl] = useState('/parts/led.svg');
  const [uploadedSvg, setUploadedSvg] = useState('');
  const [componentWidth, setComponentWidth] = useState(52);
  const [componentHeight, setComponentHeight] = useState(68);
  const [simulationKind, setSimulationKind] = useState<DynamicActionKind>('showText');
  const [simulationText, setSimulationText] = useState('Simulation started');
  const [simulationImage, setSimulationImage] = useState('/parts/battery9v.svg');
  const [pins, setPins] = useState<PinDefinition[]>(createDefaultPins);
  const [fields, setFields] = useState<DynamicFieldDefinition[]>(createDefaultFields);
  const [selectedPinIndex, setSelectedPinIndex] = useState(0);
  const [error, setError] = useState('');

  const selectedSvg = svgMode === 'existing'
    ? COMPONENT_THUMBNAILS[selectedSvgType] ?? ''
    : svgMode === 'upload'
      ? uploadedSvg
      : customSvgUrl.trim();

  const previewOptions = useMemo(
    () => COMPONENT_CATALOG.filter((component) => COMPONENT_THUMBNAILS[component.type]),
    []
  );
  const previewScale = Math.min(260 / componentWidth, 260 / componentHeight);
  const previewWidth = componentWidth * previewScale;
  const previewHeight = componentHeight * previewScale;

  useEffect(() => {
    if (svgMode !== 'existing') return;
    const definition = COMPONENT_CATALOG.find((component) => component.type === selectedSvgType);
    if (!definition) return;
    setComponentWidth(definition.defaultWidth);
    setComponentHeight(definition.defaultHeight);
    setSimulationModel(definition.simulationModel ?? definition.type);
    setPins(definition.pins.length > 0 ? structuredClone(definition.pins) : createPinsForSimulationModel(definition.type, definition.defaultWidth, definition.defaultHeight));
  }, [selectedSvgType, svgMode]);

  useEffect(() => {
    setPins((current) =>
      current.map((pin) => ({
        ...pin,
        position: {
          x: clampPinPosition(pin.position.x, componentWidth),
          y: clampPinPosition(pin.position.y, componentHeight),
        },
      }))
    );
  }, [componentHeight, componentWidth]);

  const saveComponent = () => {
    const name = label.trim();
    const slug = slugify(name);
    if (!name || !slug) {
      setError('Component name required.');
      return;
    }
    if (!selectedSvg) {
      setError('Select an SVG/image or enter a URL.');
      return;
    }

    const component: DynamicComponentDefinition = {
      type: `dynamic-${slug}`,
      label: name,
      category,
      simulationModel,
      defaultWidth: componentWidth,
      defaultHeight: componentHeight,
      thumbnail: selectedSvg,
      pins,
      defaultProperties: createDefaultPropertiesForModel(simulationModel, name),
      dynamicBehavior: {
        singleClick: makeAction('none', '', ''),
        doubleClick: makeAction('none', '', ''),
        simulationStart: makeAction(simulationKind, simulationText, simulationImage),
      },
      dynamicFields: fields,
    };

    addComponent(component);
    setError('');
  };

  const updatePin = (index: number, updates: Partial<PinDefinition>) => {
    setPins((current) =>
      current.map((pin, pinIndex) =>
        pinIndex === index
          ? {
              ...pin,
              ...updates,
              position: {
                ...pin.position,
                ...(updates.position
                  ? {
                      x: clampPinPosition(updates.position.x ?? pin.position.x, componentWidth),
                      y: clampPinPosition(updates.position.y ?? pin.position.y, componentHeight),
                    }
                  : {}),
              },
            }
          : pin
      )
    );
  };

  const addPin = () => {
    setPins((current) => {
      const nextNumber = current.length + 1;
      return [
        ...current,
        {
          id: `pin${nextNumber}`,
          label: `Pin ${nextNumber}`,
          description: 'Connect wire here',
          position: {
            x: 20 + ((nextNumber - 1) % 4) * 26,
            y: nextNumber % 2 === 0 ? 100 : 20,
          },
        },
      ];
    });
  };

  const removePin = (index: number) => {
    setPins((current) => current.filter((_, pinIndex) => pinIndex !== index));
    setSelectedPinIndex((current) => Math.max(0, Math.min(current, pins.length - 2)));
  };

  const updateField = (index: number, updates: Partial<DynamicFieldDefinition>) => {
    setFields((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index
          ? {
              ...field,
              ...updates,
              id: updates.label !== undefined ? slugify(updates.label) || field.id : updates.id ?? field.id,
            }
          : field
      )
    );
  };

  const addField = () => {
    setFields((current) => {
      const nextNumber = current.length + 1;
      return [
        ...current,
        {
          id: `field-${nextNumber}`,
          label: `Field ${nextNumber}`,
          type: 'text',
          defaultValue: '',
        },
      ];
    });
  };

  const removeField = (index: number) => {
    setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
  };

  const handleSvgUpload = (file: File | null) => {
    if (!file) return;

    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      const reader = new FileReader();
      reader.onload = () => {
        const svgText = typeof reader.result === 'string' ? reader.result : '';
        if (!svgText.trim()) return;

        const size = sizeFromSvgText(svgText);
        if (size) {
          setComponentWidth(size.width);
          setComponentHeight(size.height);
        }
        setUploadedSvg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`);
      };
      reader.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;

      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          setComponentWidth(clampDimension(image.naturalWidth));
          setComponentHeight(clampDimension(image.naturalHeight));
        }
      };
      image.src = dataUrl;
      setUploadedSvg(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const setSelectedPinPositionFromPreview = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pins[selectedPinIndex]) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * componentWidth;
    const y = ((event.clientY - bounds.top) / bounds.height) * componentHeight;

    updatePin(selectedPinIndex, {
      position: {
        x: clampPinPosition(x, componentWidth),
        y: clampPinPosition(y, componentHeight),
      },
    });
  };

  const renderActionFields = (
    labelText: string,
    kind: DynamicActionKind,
    setKind: (kind: DynamicActionKind) => void,
    text: string,
    setText: (value: string) => void,
    image: string,
    setImage: (value: string) => void,
  ) => (
    <div className="rounded border border-[#dfe4ea] bg-white p-2">
      <label className="text-[11px] font-semibold text-[#34495e]">{labelText}</label>
      <select
        value={kind}
        onChange={(event) => setKind(event.target.value as DynamicActionKind)}
        className="mt-1 h-8 w-full border border-[#dfe4ea] bg-[#f8fafc] px-2 text-xs outline-none"
      >
        {ACTIONS.map((action) => (
          <option key={action.value} value={action.value}>{action.label}</option>
        ))}
      </select>
      {(kind === 'showText' || kind === 'toggleText') && (
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="mt-2 h-8 w-full border border-[#dfe4ea] px-2 text-xs outline-none"
          placeholder="Text"
        />
      )}
      {(kind === 'showImage' || kind === 'toggleImage') && (
        <input
          value={image}
          onChange={(event) => setImage(event.target.value)}
          className="mt-2 h-8 w-full border border-[#dfe4ea] px-2 text-xs outline-none"
          placeholder="/parts/example.svg"
        />
      )}
    </div>
  );

  return (
    <div className="absolute inset-0 z-[70] flex flex-col border-l border-[#d5dbe2] bg-[#eef1f5] text-[#2f4054]">
      <div className="flex h-12 items-center justify-between border-b border-[#d5dbe2] bg-white px-3">
        <span className="text-sm font-semibold">Dynamic Component</span>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-100" title="Close">
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="rounded border border-[#dfe4ea] bg-white p-2">
          <label className="text-[11px] font-semibold text-[#34495e]">Component name</label>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="mt-1 h-9 w-full border border-[#dfe4ea] px-2 text-sm outline-none"
          />
          <label className="mt-2 block text-[11px] font-semibold text-[#34495e]">Category</label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as ComponentCategory)}
            className="mt-1 h-9 w-full border border-[#dfe4ea] bg-[#f8fafc] px-2 text-sm outline-none"
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <label className="mt-2 block text-[11px] font-semibold text-[#34495e]">Simulation behavior</label>
          <select
            value={simulationModel}
            onChange={(event) => {
              const nextModel = event.target.value;
              setSimulationModel(nextModel);
              setPins(createPinsForSimulationModel(nextModel, componentWidth, componentHeight));
              setSelectedPinIndex(0);
            }}
            className="mt-1 h-9 w-full border border-[#dfe4ea] bg-[#f8fafc] px-2 text-sm outline-none"
          >
            {SIMULATION_MODELS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div className="rounded border border-[#dfe4ea] bg-white p-2">
          <label className="text-[11px] font-semibold text-[#34495e]">SVG / image</label>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <button
              onClick={() => setSvgMode('existing')}
              className={`h-8 border text-xs ${svgMode === 'existing' ? 'border-[#2f80ff] bg-[#e8f2ff]' : 'border-[#dfe4ea] bg-white'}`}
            >
              Existing
            </button>
            <button
              onClick={() => setSvgMode('url')}
              className={`h-8 border text-xs ${svgMode === 'url' ? 'border-[#2f80ff] bg-[#e8f2ff]' : 'border-[#dfe4ea] bg-white'}`}
            >
              URL
            </button>
            <button
              onClick={() => setSvgMode('upload')}
              className={`h-8 border text-xs ${svgMode === 'upload' ? 'border-[#2f80ff] bg-[#e8f2ff]' : 'border-[#dfe4ea] bg-white'}`}
            >
              Upload
            </button>
          </div>
          {svgMode === 'existing' ? (
            <select
              value={selectedSvgType}
              onChange={(event) => setSelectedSvgType(event.target.value)}
              className="mt-2 h-9 w-full border border-[#dfe4ea] bg-[#f8fafc] px-2 text-sm outline-none"
            >
              {previewOptions.map((component) => (
                <option key={component.type} value={component.type}>{component.label}</option>
              ))}
            </select>
          ) : (
            svgMode === 'url' ? (
              <input
                value={customSvgUrl}
                onChange={(event) => setCustomSvgUrl(event.target.value)}
                className="mt-2 h-9 w-full border border-[#dfe4ea] px-2 text-sm outline-none"
                placeholder="/parts/my-part.svg or https://..."
              />
            ) : (
              <input
                type="file"
                accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => handleSvgUpload(event.target.files?.[0] ?? null)}
                className="mt-2 w-full border border-[#dfe4ea] bg-white px-2 py-2 text-xs outline-none"
              />
            )
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-[#34495e]">
              Width
              <input
                type="number"
                min="24"
                max="420"
                value={componentWidth}
                onChange={(event) => setComponentWidth(clampDimension(Number(event.target.value)))}
                className="mt-1 h-8 w-full border border-[#dfe4ea] px-2 text-xs font-normal outline-none"
              />
            </label>
            <label className="text-[11px] font-semibold text-[#34495e]">
              Height
              <input
                type="number"
                min="24"
                max="420"
                value={componentHeight}
                onChange={(event) => setComponentHeight(clampDimension(Number(event.target.value)))}
                className="mt-1 h-8 w-full border border-[#dfe4ea] px-2 text-xs font-normal outline-none"
              />
            </label>
          </div>
          {selectedSvg && (
            <div className="mt-2">
              <div
                className="relative mx-auto cursor-crosshair border border-dashed border-[#b8c7d8] bg-[#f8fafc]"
                onPointerDown={setSelectedPinPositionFromPreview}
                title="Select a pin below, then click here to set its position"
                style={{
                  width: previewWidth,
                  height: previewHeight,
                }}
              >
                <img
                  src={selectedSvg}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
                {pins.map((pin, index) => (
                  <button
                    key={`${pin.id}-preview-${index}`}
                    type="button"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelectedPinIndex(index);
                    }}
                    className={`absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[9px] font-bold shadow-sm ${
                      selectedPinIndex === index
                        ? 'border-[#1d4ed8] bg-[#2f80ff] text-white ring-4 ring-[#bfdbfe]'
                        : 'border-[#64748b] bg-white text-[#334155]'
                    }`}
                    style={{
                      left: `${(pin.position.x / componentWidth) * 100}%`,
                      top: `${(pin.position.y / componentHeight) * 100}%`,
                    }}
                    title={pin.label}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-center text-[10px] leading-4 text-slate-500">
                Select a pin, then click the preview to set its position.
              </div>
            </div>
          )}
        </div>

        <div className="rounded border border-[#dfe4ea] bg-white p-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-semibold text-[#34495e]">Wire pins</label>
            <button
              onClick={addPin}
              className="flex h-7 items-center gap-1 rounded bg-[#eef6ff] px-2 text-xs font-semibold text-[#1f6fe8] hover:bg-[#dbeeff]"
            >
              <Plus size={13} />
              Pin
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {pins.map((pin, index) => (
              <div
                key={`${pin.id}-${index}`}
                onClick={() => setSelectedPinIndex(index)}
                className={`rounded border p-1.5 ${
                  selectedPinIndex === index
                    ? 'border-[#2f80ff] bg-[#eef6ff]'
                    : 'border-[#eef1f5] bg-[#fbfcfe]'
                }`}
              >
                <div className="grid grid-cols-[1fr_46px_46px_26px] items-center gap-1">
                  <input
                    value={pin.label}
                    onChange={(event) =>
                      updatePin(index, {
                        id: slugify(event.target.value) || `pin${index + 1}`,
                        label: event.target.value,
                      })
                    }
                    className="h-8 border border-[#dfe4ea] px-2 text-xs outline-none"
                    placeholder={`Pin ${index + 1}`}
                  />
                  <input
                    type="number"
                    min="0"
                    max={componentWidth}
                    value={pin.position.x}
                    onChange={(event) =>
                      updatePin(index, {
                        position: {
                          x: clampPinPosition(Number(event.target.value), componentWidth),
                          y: pin.position.y,
                        },
                      })
                    }
                    className="h-8 border border-[#dfe4ea] px-1 text-xs outline-none"
                    title="X"
                  />
                  <input
                    type="number"
                    min="0"
                    max={componentHeight}
                    value={pin.position.y}
                    onChange={(event) =>
                      updatePin(index, {
                        position: {
                          x: pin.position.x,
                          y: clampPinPosition(Number(event.target.value), componentHeight),
                        },
                      })
                    }
                    className="h-8 border border-[#dfe4ea] px-1 text-xs outline-none"
                    title="Y"
                  />
                  <button
                    onClick={() => removePin(index)}
                    disabled={pins.length <= 1}
                    className="flex h-8 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                    title="Remove pin"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  value={pin.description ?? ''}
                  onChange={(event) => updatePin(index, { description: event.target.value })}
                  className="mt-1 h-8 w-full border border-[#dfe4ea] px-2 text-xs outline-none"
                  placeholder="Hover description"
                />
              </div>
            ))}
          </div>

          <div className="mt-2 text-[10px] leading-4 text-slate-500">
            X/Y component width-height ke andar hai. Har pin par wire connect handle automatically banega.
          </div>
        </div>

        <div className="rounded border border-[#dfe4ea] bg-white p-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-semibold text-[#34495e]">Double click edit fields</label>
            <button
              onClick={addField}
              className="flex h-7 items-center gap-1 rounded bg-[#eef6ff] px-2 text-xs font-semibold text-[#1f6fe8] hover:bg-[#dbeeff]"
            >
              <Plus size={13} />
              Field
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {fields.map((field, index) => (
              <div key={`${field.id}-${index}`} className="rounded border border-[#eef1f5] bg-[#fbfcfe] p-1.5">
                <div className="grid grid-cols-[1fr_74px_26px] items-center gap-1">
                  <input
                    value={field.label}
                    onChange={(event) => updateField(index, { label: event.target.value })}
                    className="h-8 border border-[#dfe4ea] px-2 text-xs outline-none"
                    placeholder="Field label"
                  />
                  <select
                    value={field.type}
                    onChange={(event) =>
                      updateField(index, { type: event.target.value as DynamicFieldType })
                    }
                    className="h-8 border border-[#dfe4ea] bg-white px-1 text-xs outline-none"
                  >
                    <option value="text">Input</option>
                    <option value="color">Color</option>
                    <option value="file">File</option>
                  </select>
                  <button
                    onClick={() => removeField(index)}
                    className="flex h-8 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500"
                    title="Remove field"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {field.type !== 'file' && (
                  <input
                    type={field.type === 'color' ? 'color' : 'text'}
                    value={field.defaultValue ?? ''}
                    onChange={(event) => updateField(index, { defaultValue: event.target.value })}
                    className="mt-1 h-8 w-full border border-[#dfe4ea] px-2 text-xs outline-none"
                    placeholder="Default value"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] leading-4 text-slate-500">
            Double click par ye fields component ke andar edit honge. File field image/file URL save karega.
          </div>
        </div>

        {renderActionFields('Simulation start', simulationKind, setSimulationKind, simulationText, setSimulationText, simulationImage, setSimulationImage)}

        {error && <div className="text-xs text-red-600">{error}</div>}

        <button
          onClick={saveComponent}
          className="flex h-10 w-full items-center justify-center gap-2 rounded bg-[#2f80ff] text-sm font-semibold text-white hover:bg-[#1f6fe8]"
        >
          <Plus size={16} />
          Save component
        </button>

        {components.length > 0 && (
          <div className="rounded border border-[#dfe4ea] bg-white">
            <div className="border-b border-[#dfe4ea] px-2 py-2 text-[11px] font-semibold uppercase text-slate-500">
              Saved dynamic
            </div>
            {components.map((component) => (
              <div key={component.type} className="flex items-center gap-2 px-2 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{component.label}</span>
                <button
                  onClick={() => removeComponent(component.type)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
