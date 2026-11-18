"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignVerticalJustifyCenter,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Code,
  Copy,
  Database,
  Download,
  Eye,
  Globe2,
  Lock,
  Mail,
  MessageSquare,
  Navigation,
  Play,
  Redo2,
  RotateCw,
  Save,
  Square,
  Pencil,
  Trash,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useCircuitStore } from "@cs/lib/store";
import { WIRE_COLORS, COMPONENT_CATALOG } from "@cs/lib/circuit-components";
import { CIRCUIT_PRESETS, type CircuitPreset } from "@cs/lib/circuit-presets";
import { serverApiUrl } from "@cs/lib/server-api";
import { useCustomPresetsStore } from "@cs/store/useCustomPresetsStore";
import { unlockAudioContext } from "@cs/lib/audio";
import {
  getComponentDefinition,
  getComponentThumbnail,
  useDynamicComponentsStore,
} from "@cs/store/useDynamicComponentsStore";
import type { CircuitEdge, CircuitNode, PinDefinition } from "@cs/lib/types";
import { resolveEsp32Language } from "@cs/lib/circuit/languageUtils";
import { checkEsp32CppSupport } from "@cs/lib/esp32/parser";

type WirePoint = { x: number; y: number };
type CircuitAccessMode = "public" | "private" | "invite";
type CircuitSaveOptions = {
  name: string;
  accessMode: CircuitAccessMode;
  invitedEmails: string[];
};

const AUTH_USER_KEY = "circuit-studio-auth-user";
const CURRENT_CIRCUIT_ACCESS_KEY = "circuit-studio-current-circuit-access";

function getStoredUserEmail() {
  if (typeof window === "undefined") return "";
  try {
    const user = JSON.parse(window.localStorage.getItem(AUTH_USER_KEY) || "{}") as {
      email?: unknown;
    };
    return typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  } catch {
    return "";
  }
}

function parseInviteEmails(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes("@")),
    ),
  );
}

function getSavedCircuitAccess(): Pick<CircuitSaveOptions, "accessMode" | "invitedEmails"> {
  if (typeof window === "undefined") {
    return { accessMode: "public", invitedEmails: [] };
  }
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(CURRENT_CIRCUIT_ACCESS_KEY) || "{}",
    ) as Partial<CircuitSaveOptions>;
    return {
      accessMode:
        saved.accessMode === "private" || saved.accessMode === "invite"
          ? saved.accessMode
          : "public",
      invitedEmails: Array.isArray(saved.invitedEmails)
        ? saved.invitedEmails.filter((email): email is string => typeof email === "string")
        : [],
    };
  } catch {
    return { accessMode: "public", invitedEmails: [] };
  }
}

function StickyNoteIcon({
  size = 26,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="overflow-visible"
    >
      {/* Halo glow around the anchor point */}
      <circle
        cx="16"
        cy="25"
        r="4.5"
        fill="#1d70b8"
        fillOpacity="0.15"
        stroke="#1d70b8"
        strokeWidth="1"
        strokeOpacity="0.3"
      />
      {/* Anchor point circle */}
      <circle
        cx="16"
        cy="25"
        r="2.5"
        fill="white"
        stroke="#333333"
        strokeWidth="1.5"
      />

      {/* Speech bubble path with rounded corners and pointer */}
      <path
        d="M 9 2 L 23 2 A 4 4 0 0 1 27 6 L 27 14 A 4 4 0 0 1 23 18 L 18.5 18 L 16 22 L 13.5 18 L 9 18 A 4 4 0 0 1 5 14 L 5 6 A 4 4 0 0 1 9 2 Z"
        fill="#f4f8fe"
        stroke="#1d70b8"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Text lines in the bubble */}
      <line
        x1="9"
        y1="6"
        x2="23"
        y2="6"
        stroke="#475569"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="9"
        x2="19"
        y2="9"
        stroke="#475569"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="12"
        x2="23"
        y2="12"
        stroke="#475569"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="15"
        x2="16"
        y2="15"
        stroke="#475569"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[50px] w-[48px] items-center justify-center border-r border-[#dfe4ea] transition-colors ${
        disabled
          ? "cursor-not-allowed text-[#c5ced8]"
          : "text-[#34495e] hover:bg-[#e9eef3]"
      }`}
      title={label}
    >
      <Icon size={26} strokeWidth={2.1} />
    </button>
  );
}

function Separator() {
  return <div className="h-[50px] w-px bg-[#d9dee5]" />;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function copyComputedStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source);
  const targetElement = target as HTMLElement;
  targetElement.style.cssText = computed.cssText;

  for (const property of computed) {
    targetElement.style.setProperty(
      property,
      computed.getPropertyValue(property),
      computed.getPropertyPriority(property),
    );
  }

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  for (let index = 0; index < sourceChildren.length; index += 1) {
    const sourceChild = sourceChildren[index];
    const targetChild = targetChildren[index];
    if (sourceChild && targetChild)
      copyComputedStyles(sourceChild, targetChild);
  }
}

async function imageToDataUrl(src: string) {
  try {
    const response = await fetch(src);
    if (!response.ok) return src;
    const blob = await response.blob();

    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : src);
      reader.onerror = () => resolve(src);
      reader.readAsDataURL(blob);
    });
  } catch {
    return src;
  }
}

async function inlineCloneImages(source: Element, clone: Element) {
  const sourceImages = Array.from(source.querySelectorAll("img"));
  const cloneImages = Array.from(clone.querySelectorAll("img"));

  await Promise.all(
    cloneImages.map(async (image, index) => {
      const sourceImage = sourceImages[index];
      const src = sourceImage?.currentSrc || sourceImage?.src || image.src;
      if (!src) return;
      image.src = src.startsWith("data:") ? src : await imageToDataUrl(src);
    }),
  );
}

function removeSnapshotUi(clone: HTMLElement) {
  clone
    .querySelectorAll(
      ".react-flow__controls, .react-flow__panel, .react-flow__attribution",
    )
    .forEach((element) => element.remove());
}

async function waitForImages(element: Element) {
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(
    images.map((image) => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
      });
    }),
  );
}

async function serializeNodeForForeignObject(
  element: HTMLElement,
  width: number,
  height: number,
) {
  const clone = element.cloneNode(true) as HTMLElement;
  copyComputedStyles(element, clone);
  await inlineCloneImages(element, clone);
  removeSnapshotUi(clone);
  clone.style.margin = "0";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.overflow = "hidden";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:#f4f5f6;">
          ${new XMLSerializer().serializeToString(clone)}
        </div>
      </foreignObject>
    </svg>
  `;
}

async function createDomSnapshotThumbnail() {
  if (typeof document === "undefined") return "";

  const source =
    document.querySelector<HTMLElement>(".react-flow") ??
    document.querySelector<HTMLElement>(".react-flow__renderer");
  if (!source) return "";

  await waitForImages(source);

  const rect = source.getBoundingClientRect();
  const captureWidth = Math.max(1, Math.round(rect.width));
  const captureHeight = Math.max(1, Math.round(rect.height));
  if (captureWidth < 20 || captureHeight < 20) return "";

  const sourceSvg = await serializeNodeForForeignObject(
    source,
    captureWidth,
    captureHeight,
  );
  const image = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sourceSvg)}`,
  );

  const canvas = document.createElement("canvas");
  canvas.width = captureWidth;
  canvas.height = captureHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#f4f5f6";
  ctx.fillRect(0, 0, captureWidth, captureHeight);
  ctx.drawImage(image, 0, 0, captureWidth, captureHeight);

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function toWaypoints(value: unknown): WirePoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (point): point is WirePoint =>
      typeof point?.x === "number" && typeof point?.y === "number",
  );
}

function getExactPinPoint(
  node: CircuitNode | undefined,
  handleId: string | null | undefined,
  dynamicComponents = useDynamicComponentsStore.getState().components,
): WirePoint | null {
  if (!node || !handleId) return null;

  const def = getComponentDefinition(
    node.data.componentType,
    dynamicComponents,
  );
  const pin: PinDefinition | undefined = def?.pins.find(
    (item) => item.id === handleId,
  );
  if (!def || !pin) return null;

  const rotation = Number(node.data.rotation ?? 0);
  const radians = (rotation * Math.PI) / 180;
  const centerX = def.defaultWidth / 2;
  const centerY = def.defaultHeight / 2;
  const relativeX = pin.position.x - centerX;
  const relativeY = pin.position.y - centerY;

  return {
    x:
      node.position.x +
      centerX +
      (relativeX * Math.cos(radians) - relativeY * Math.sin(radians)),
    y:
      node.position.y +
      centerY +
      (relativeX * Math.sin(radians) + relativeY * Math.cos(radians)),
  };
}

async function createCircuitThumbnail(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
) {
  if (typeof document === "undefined" || nodes.length === 0) return "";

  const width = 960;
  const height = 540;
  const padding = 64;
  const dynamicComponents = useDynamicComponentsStore.getState().components;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const nodeBounds = nodes.map((node) => {
    const def = getComponentDefinition(
      node.data.componentType,
      dynamicComponents,
    );
    return {
      node,
      width: def?.defaultWidth ?? 90,
      height: def?.defaultHeight ?? 70,
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const pointsForBounds: WirePoint[] = [];

  for (const { node, width: nodeWidth, height: nodeHeight } of nodeBounds) {
    pointsForBounds.push(node.position, {
      x: node.position.x + nodeWidth,
      y: node.position.y + nodeHeight,
    });
  }

  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const sourcePoint = getExactPinPoint(
      source,
      edge.sourceHandle,
      dynamicComponents,
    );
    const targetPoint = getExactPinPoint(
      target,
      edge.targetHandle,
      dynamicComponents,
    );
    if (sourcePoint) pointsForBounds.push(sourcePoint);
    pointsForBounds.push(...toWaypoints(edge.data?.waypoints));
    if (targetPoint) pointsForBounds.push(targetPoint);
  }

  const minX = Math.min(...pointsForBounds.map((point) => point.x));
  const minY = Math.min(...pointsForBounds.map((point) => point.y));
  const maxX = Math.max(...pointsForBounds.map((point) => point.x));
  const maxY = Math.max(...pointsForBounds.map((point) => point.y));
  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  const scale = Math.min(
    (width - padding * 2) / boundsWidth,
    (height - padding * 2) / boundsHeight,
    1.4,
  );
  const offsetX = (width - boundsWidth * scale) / 2;
  const offsetY = (height - boundsHeight * scale) / 2;

  const transformPoint = (point: WirePoint) => ({
    x: (point.x - minX) * scale + offsetX,
    y: (point.y - minY) * scale + offsetY,
  });

  const getRect = (node: CircuitNode) => {
    const def = getComponentDefinition(
      node.data.componentType,
      dynamicComponents,
    );
    const nodeWidth = (def?.defaultWidth ?? 90) * scale;
    const nodeHeight = (def?.defaultHeight ?? 70) * scale;
    const transformed = transformPoint(node.position);
    return {
      x: transformed.x,
      y: transformed.y,
      width: nodeWidth,
      height: nodeHeight,
    };
  };

  ctx.fillStyle = "#f4f5f6";
  ctx.fillRect(0, 0, width, height);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;

    const sourcePoint = getExactPinPoint(
      source,
      edge.sourceHandle,
      dynamicComponents,
    );
    const targetPoint = getExactPinPoint(
      target,
      edge.targetHandle,
      dynamicComponents,
    );
    if (!sourcePoint || !targetPoint) continue;

    const points = [
      sourcePoint,
      ...toWaypoints(edge.data?.waypoints),
      targetPoint,
    ].map(transformPoint);
    ctx.strokeStyle =
      typeof edge.data?.color === "string" ? edge.data.color : "#22c55e";
    ctx.lineWidth = Math.max(3, 4 * scale);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  for (const { node } of nodeBounds) {
    const rect = getRect(node);
    const thumbnail = getComponentThumbnail(
      node.data.componentType,
      dynamicComponents,
    );
    const rotation = Number(node.data.rotation ?? 0);

    ctx.save();
    ctx.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    if (thumbnail) {
      try {
        const image = await loadImage(await imageToDataUrl(thumbnail));
        ctx.drawImage(
          image,
          -rect.width / 2,
          -rect.height / 2,
          rect.width,
          rect.height,
        );
      } catch {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#9fb5c5";
        ctx.fillRect(
          -rect.width / 2,
          -rect.height / 2,
          rect.width,
          rect.height,
        );
        ctx.strokeRect(
          -rect.width / 2,
          -rect.height / 2,
          rect.width,
          rect.height,
        );
      }
    } else {
      const label = node.data.label || node.data.componentType;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#9fb5c5";
      ctx.lineWidth = 2;
      ctx.fillRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height);
      ctx.strokeRect(
        -rect.width / 2,
        -rect.height / 2,
        rect.width,
        rect.height,
      );
      ctx.fillStyle = "#24516b";
      ctx.font = `${Math.max(12, 16 * scale)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 0, rect.width - 8);
    }

    ctx.restore();
  }

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 min-w-[76px] items-center justify-center gap-3 rounded border border-[#dfe4ea] bg-[#f8f9fa] px-3 text-[#34495e] transition-colors hover:bg-[#eef2f5]"
        title="Wire color"
      >
        <span
          className="h-6 w-6 rounded-md"
          style={{ backgroundColor: value }}
        />
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[100] mt-1 w-max rounded-md border border-[#d9dee5] bg-white p-2 shadow-lg">
          <div className="grid grid-cols-5 gap-1.5">
            {WIRE_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded border-2 transition-transform hover:scale-110 ${
                  value === color
                    ? "scale-110 border-[#34495e]"
                    : "border-[#d9dee5]"
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PromptModal({
  isOpen,
  title,
  defaultValue,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  title: string;
  defaultValue: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 backdrop-blur-xs transition-all">
      <div className="relative w-full max-w-[420px] rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl transition-all duration-300 transform scale-100 animate-in fade-in zoom-in-95 ease-out">
        {/* Close button top-right */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors cursor-pointer"
          title="Close modal"
        >
          <X size={16} />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#006aa0]">
            <Database size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900 leading-6">
              {title}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Provide a name for your circuit so you can identify it later in
              your dashboard.
            </p>
          </div>
        </div>

        {/* Modal Body / Input */}
        <div className="mt-5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
            Circuit Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm font-semibold text-slate-800 outline-none focus:border-[#006aa0] focus:bg-white focus:ring-4 focus:ring-[#006aa0]/10 transition-all placeholder-slate-400"
            placeholder="e.g. My Robotics Project"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (value.trim()) {
                  onConfirm(value.trim());
                  onClose();
                }
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />
        </div>

        {/* Modal Footer / Buttons */}
        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (value.trim()) {
                onConfirm(value.trim());
                onClose();
              }
            }}
            disabled={!value.trim()}
            className="h-10 rounded-xl bg-[#006aa0] px-6 text-sm font-bold text-white hover:bg-[#005a8a] transition-all active:scale-95 shadow-lg shadow-[#006aa0]/15 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
          >
            Save Circuit
          </button>
        </div>
      </div>
    </div>
  );
}

function CircuitSaveModal({
  isOpen,
  title,
  defaultValue,
  defaultAccessMode,
  defaultInvitedEmails,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  title: string;
  defaultValue: string;
  defaultAccessMode: CircuitAccessMode;
  defaultInvitedEmails: string[];
  onClose: () => void;
  onConfirm: (options: CircuitSaveOptions) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [accessMode, setAccessMode] = useState<CircuitAccessMode>(defaultAccessMode);
  const [inviteText, setInviteText] = useState(defaultInvitedEmails.join(", "));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setAccessMode(defaultAccessMode);
      setInviteText(defaultInvitedEmails.join(", "));
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, defaultValue, defaultAccessMode, defaultInvitedEmails]);

  if (!isOpen) return null;

  const confirm = () => {
    const name = value.trim();
    if (!name) return;
    onConfirm({
      name,
      accessMode,
      invitedEmails: accessMode === "invite" ? parseInviteEmails(inviteText) : [],
    });
    onClose();
  };

  const options: Array<{
    value: CircuitAccessMode;
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    title: string;
    detail: string;
  }> = [
    {
      value: "public",
      icon: Globe2,
      title: "Public",
      detail: "Any student can view",
    },
    {
      value: "private",
      icon: Lock,
      title: "Private",
      detail: "Only me",
    },
    {
      value: "invite",
      icon: Mail,
      title: "Invite friends",
      detail: "Only invited emails",
    },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 backdrop-blur-xs transition-all">
      <div className="relative w-full max-w-[560px] rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl transition-all duration-300 transform scale-100 animate-in fade-in zoom-in-95 ease-out">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors cursor-pointer"
          title="Close modal"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#006aa0]">
            <Database size={24} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold leading-6 text-slate-900">
              {title}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Save this circuit and choose who can view the design.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">
            Circuit Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm font-semibold text-slate-800 outline-none transition-all placeholder-slate-400 focus:border-[#006aa0] focus:bg-white focus:ring-4 focus:ring-[#006aa0]/10"
            placeholder="e.g. My Robotics Project"
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
              if (e.key === "Escape") onClose();
            }}
          />
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">
            Access
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {options.map((option) => {
              const Icon = option.icon;
              const active = accessMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAccessMode(option.value)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-[#006aa0] bg-sky-50 text-[#005a8a] ring-4 ring-[#006aa0]/10"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Icon size={16} />
                    <span>{option.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{option.detail}</p>
                </button>
              );
            })}
          </div>
        </div>

        {accessMode === "invite" ? (
          <div className="mt-4">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">
              Friend Emails
            </label>
            <textarea
              value={inviteText}
              onChange={(e) => setInviteText(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all placeholder-slate-400 focus:border-[#006aa0] focus:bg-white focus:ring-4 focus:ring-[#006aa0]/10"
              placeholder="friend@email.com, classmate@email.com"
            />
          </div>
        ) : null}

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-800 active:scale-95 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!value.trim()}
            className="h-10 rounded-xl bg-[#006aa0] px-6 text-sm font-bold text-white transition-all hover:bg-[#005a8a] active:scale-95 shadow-lg shadow-[#006aa0]/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none cursor-pointer"
          >
            Save Circuit
          </button>
        </div>
      </div>
    </div>
  );
}

function PresetDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { customPresets, addPreset, removePreset, updatePreset } =
    useCustomPresetsStore();
  const builtInGroups = ["Arduino", "Raspberry Pi Pico", "Basic"] as const;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaultVal, setModalDefaultVal] = useState("");
  const [renamePreset, setRenamePreset] = useState<CircuitPreset | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const groupColor = (group: string) => {
    if (group === "Arduino") return "text-teal-600";
    if (group === "Raspberry Pi Pico") return "text-green-600";
    return "text-purple-600";
  };

  const saveCurrentCircuit = () => {
    const defaultName = `Circuit ${new Date().toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    setModalDefaultVal(defaultName);
    setModalOpen(true);
  };

  const handleSaveConfirm = (name: string) => {
    const store = useCircuitStore.getState();
    const boardType = store.detectBoardType();
    addPreset({
      id: `custom-${Date.now()}`,
      label: name,
      group:
        boardType === "arduino"
          ? "Arduino"
          : "Basic",
      nodes: structuredClone(store.nodes),
      edges: structuredClone(store.edges),
      arduinoCode: store.arduinoCode,
      picoCode: store.picoCode,
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-[50px] shrink-0 whitespace-nowrap items-center gap-2 border-r border-[#dfe4ea] px-4 text-sm font-medium text-[#34495e] transition-colors hover:bg-[#e9eef3]"
        title="Save or load circuit"
      >
        <span>Saved</span>
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[100] mt-1 max-h-[calc(100vh-64px)] w-64 overflow-x-hidden overflow-y-auto rounded-md border border-[#d9dee5] bg-white shadow-xl">
          <button
            onClick={() => {
              saveCurrentCircuit();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-b border-[#edf0f3] px-4 py-2.5 text-sm text-[#2f80c7] transition-colors hover:bg-[#eef6ff]"
          >
            <Save size={14} />
            <span className="font-medium">Save current circuit...</span>
          </button>

          <div className="border-b border-[#edf0f3] bg-[#f7f9fb] px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
              Saved Circuits
            </span>
          </div>

          {customPresets.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">
              No saved circuits yet
            </div>
          ) : (
            customPresets.map((preset) => (
              <div
                key={preset.id}
                className="group flex items-center transition-colors hover:bg-[#eef6ff]"
              >
                <button
                  onClick={() => {
                    useCircuitStore.getState().loadPreset(preset);
                    setOpen(false);
                  }}
                  className="flex-1 px-4 py-2 text-left text-sm text-slate-700 font-medium"
                  title={preset.group}
                >
                  {preset.label}
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setRenamePreset(preset);
                  }}
                  className="px-2 py-2 text-slate-300 opacity-0 transition-all hover:text-sky-600 group-hover:opacity-100 cursor-pointer"
                  title="Rename saved circuit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    removePreset(preset.id);
                  }}
                  className="px-2 py-2 text-slate-300 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100 cursor-pointer"
                  title="Delete saved circuit"
                >
                  <Trash size={13} />
                </button>
              </div>
            ))
          )}

          {builtInGroups.map((group) => {
            const presets = CIRCUIT_PRESETS.filter(
              (preset) => preset.group === group,
            );
            if (presets.length === 0) return null;

            return (
              <div key={group}>
                <div className="border-b border-[#edf0f3] bg-[#f7f9fb] px-3 py-1.5">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${groupColor(group)}`}
                  >
                    {group}
                  </span>
                </div>

                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      useCircuitStore.getState().loadPreset(preset);
                      setOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-[#eef6ff]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <PromptModal
        isOpen={modalOpen}
        title="Save Preset Name"
        defaultValue={modalDefaultVal}
        onClose={() => setModalOpen(false)}
        onConfirm={handleSaveConfirm}
      />

      <PromptModal
        isOpen={renamePreset !== null}
        title="Rename Saved Circuit"
        defaultValue={renamePreset?.label || ""}
        onClose={() => setRenamePreset(null)}
        onConfirm={(newName) => {
          if (renamePreset) {
            updatePreset(renamePreset.id, {
              ...renamePreset,
              label: newName,
            });
            setRenamePreset(null);
          }
        }}
      />
    </div>
  );
}

function SendToModal({
  isOpen,
  designImage,
  onClose,
}: {
  isOpen: boolean;
  designImage: string;
  onClose: () => void;
}) {
  const [inviteText, setInviteText] = useState("Invite people");

  const handleDownloadImage = () => {
    if (!designImage) return;
    const link = document.createElement("a");
    link.href = designImage;
    link.download = "circuit-design.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadBrd = () => {
    const store = useCircuitStore.getState();
    const brdData = {
      format: "RoboticsCircuitBRD",
      version: 1.0,
      circuitName: store.circuitName,
      nodes: store.nodes,
      edges: store.edges,
      arduinoCode: store.arduinoCode,
      picoCode: store.picoCode,
    };
    const blob = new Blob([JSON.stringify(brdData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${store.circuitName || "circuit"}.brd`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleInvite = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setInviteText("Link copied!");
      setTimeout(() => setInviteText("Invite people"), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 backdrop-blur-xs transition-all">
      <div className="relative w-full max-w-[460px] max-h-[85vh] rounded-2xl border border-slate-100 bg-slate-50 shadow-2xl overflow-hidden flex flex-col transform scale-100 animate-in fade-in zoom-in-95 ease-out">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 flex-shrink-0">
          <h3 className="text-lg font-bold text-slate-800">Send To</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Card 1: Picture of your design */}
          <div className="rounded-xl border border-[#dfe4ea] bg-white p-4 shadow-sm flex flex-col gap-3">
            <span className="text-sm font-semibold text-slate-600">
              Picture of your design
            </span>
            <div className="flex items-center gap-4">
              <div className="h-20 w-28 border border-slate-200 rounded-lg flex items-center justify-center bg-slate-50/50 overflow-hidden">
                {designImage ? (
                  <img
                    src={designImage}
                    alt="Design Thumbnail"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#006aa0]" />
                    <span>Generating...</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleDownloadImage}
                disabled={!designImage}
                className="h-12 w-12 rounded-full bg-[#f1f3f5] text-slate-600 flex items-center justify-center hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Download picture"
              >
                <Download size={22} />
              </button>
            </div>
          </div>

          {/* Card 2: Take your designs further with Autodesk */}
          <div className="rounded-xl border border-[#dfe4ea] bg-white p-4 shadow-sm flex flex-col gap-3">
            <span className="text-sm font-semibold text-slate-600">
              Take your designs further with Autodesk
            </span>
            <button className="flex items-center w-full border border-slate-200 rounded-xl p-3 hover:bg-slate-50/50 transition-all cursor-pointer justify-between text-left group">
              <div className="flex items-center">
                {/* Fusion Logo mock */}
                <div className="h-12 w-12 bg-[#eb6100] rounded-lg flex items-center justify-center font-bold text-white text-3xl font-serif select-none shadow-md shadow-orange-500/10">
                  F
                </div>
                <span className="font-semibold text-slate-700 ml-4 text-sm">
                  Autodesk Fusion
                </span>
              </div>
              <ChevronRight
                size={16}
                className="text-slate-400 group-hover:text-slate-600 transition-colors"
              />
            </button>
          </div>

          {/* Card 3: Electrical design files */}
          <div className="rounded-xl border border-[#dfe4ea] bg-white p-4 shadow-sm flex flex-col gap-3">
            <span className="text-sm font-semibold text-slate-600">
              Electrical design files
            </span>
            <button
              onClick={handleDownloadBrd}
              className="w-full border border-[#dfe4ea] rounded-xl py-3 hover:bg-slate-50 transition-all cursor-pointer font-bold text-slate-700 text-sm text-center shadow-xs"
            >
              .BRD
            </button>
          </div>

          {/* Card 4: Share over IM or email */}
          <div className="rounded-xl border border-[#dfe4ea] bg-white p-4 shadow-sm flex flex-col gap-3">
            <span className="text-sm font-semibold text-slate-600">
              Share over IM or email
            </span>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create with others by sharing a link to your design. People with
              the link may view and make changes to your design.
            </p>
            <button
              onClick={handleInvite}
              className="w-full border border-[#dfe4ea] rounded-xl py-3 hover:bg-slate-50 transition-all cursor-pointer text-[#006aa0] font-bold text-sm text-center shadow-xs"
            >
              {inviteText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


export function Toolbar() {
  const {
    deleteSelected,
    undo,
    redo,
    rotateSelected,
    wireColor,
    setWireColor,
    isSimulating,
    simulationStatus,
    toggleSimulation,
    detectBoardType,
    history,
    nodes,
    selectedLanguage,
    arduinoCode,
    picoCode,
    selectedNodeIds,
    selectedEdgeIds,
    showCodeEditor,
    circuitName,
    resetToDefault,
    notesVisible,
    setNotesVisible,
  } = useCircuitStore();

  const hasPico = nodes.some((node) => node.data.componentType === "raspberrypipico");
  const hasEsp32 = nodes.some((node) => node.data.componentType === "esp32");
  const hasArduino = nodes.some((node) => node.data.componentType === "arduino");
  const esp32Buffer = hasEsp32 && !hasArduino
    ? resolveEsp32Language(selectedLanguage, arduinoCode, picoCode)
    : null;
  const isEsp32Cpp = hasEsp32 && !hasPico && !hasArduino && (esp32Buffer ? !esp32Buffer.isPython : selectedLanguage === "cpp");
  const activeEsp32Code = esp32Buffer ? (esp32Buffer.buffer === "pico" ? picoCode : arduinoCode) : arduinoCode;
  const esp32CppSupport = isEsp32Cpp ? checkEsp32CppSupport(activeEsp32Code) : { isSupported: true, unsupportedConstructs: [] };
  const isEsp32CppBlocked = isEsp32Cpp && !esp32CppSupport.isSupported;

  const hasSelection = selectedNodeIds.length > 0 || selectedEdgeIds.length > 0;
  const [dbSaveStatus, setDbSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const simulationStoppingAvailable =
    isSimulating || simulationStatus === "connecting";

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalDefaultVal, setModalDefaultVal] = useState("");
  const [modalDefaultAccess, setModalDefaultAccess] =
    useState<CircuitAccessMode>("public");
  const [modalDefaultInvites, setModalDefaultInvites] = useState<string[]>([]);
  const [sendToModalOpen, setSendToModalOpen] = useState(false);
  const [designImage, setDesignImage] = useState("");

  const { getViewport, fitView } = useReactFlow();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".brd")) {
      alert("Invalid file format. Please upload a valid Robotics Circuit design file (.brd).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;

        let preset: CircuitPreset;

        const parsedData = JSON.parse(content);

        if (!parsedData || (!Array.isArray(parsedData.nodes) && !Array.isArray(parsedData.edges))) {
          alert("Invalid file format. Please upload a valid Robotics Circuit design file (.brd).");
          return;
        }

        const nodes = Array.isArray(parsedData.nodes) ? parsedData.nodes : [];
        const edges = Array.isArray(parsedData.edges) ? parsedData.edges : [];
        const arduinoCode = typeof parsedData.arduinoCode === "string" ? parsedData.arduinoCode : "";
        const picoCode = typeof parsedData.picoCode === "string" ? parsedData.picoCode : "";
        const label = parsedData.circuitName || file.name.replace(/\.brd$/, "");

        preset = {
          id: "imported",
          label,
          group: "Imported",
          nodes,
          edges,
          arduinoCode,
          picoCode,
        };

        useCircuitStore.getState().loadPreset(preset);

        if (typeof window !== "undefined") {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete("circuitId");
          window.history.replaceState(null, "", nextUrl.toString());
        }

        setTimeout(() => {
          try {
            fitView({ padding: 0.2, duration: 400 });
          } catch (fitErr) {
            console.warn("fitView failed", fitErr);
          }
        }, 100);

        alert(
          `Imported successfully: "${preset.label}"\n- Components: ${preset.nodes.length}\n- Wires: ${preset.edges.length}`,
        );
      } catch (err) {
        console.error("Import error", err);
        alert("Failed to parse the file. Ensure it is a valid Robotics Circuit .brd file.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  useEffect(() => {
    return () => {
      const store = useCircuitStore.getState();
      if (store.isSimulating || store.simulationStatus === "connecting") {
        void store.toggleSimulation();
      }
    };
  }, []);

  const addStickyNote = () => {
    useCircuitStore.setState({ pendingStickyNote: true });
  };

  const prepareSendToModal = async () => {
    const store = useCircuitStore.getState();
    setDesignImage("");
    setSendToModalOpen(true);
    try {
      const dataUrl = await createCircuitThumbnail(store.nodes, store.edges);
      setDesignImage(dataUrl);
    } catch (error) {
      console.error("Failed to generate design image", error);
    }
  };

  const startOrStopSimulation = () => {
    if (!simulationStoppingAvailable) {
      if (isEsp32CppBlocked) {
        alert(
          `ESP32 C++ simulation currently supports Digital I/O only. Unsupported construct(s) detected: ${esp32CppSupport.unsupportedConstructs.join(", ")}.`
        );
        return;
      }
      unlockAudioContext();
      detectBoardType();
    }
    void toggleSimulation();
  };

  const saveCircuitToDb = async () => {
    const currentCircuitId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("circuitId")
        : null;

    setModalTitle(
      currentCircuitId ? "Update Circuit Name" : "Save Circuit to DB",
    );
    setModalDefaultVal(
      circuitName ||
        `Circuit ${new Date().toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
    );
    const savedAccess = getSavedCircuitAccess();
    setModalDefaultAccess(savedAccess.accessMode);
    setModalDefaultInvites(savedAccess.invitedEmails);
    setModalOpen(true);
  };

  const handleSaveConfirm = async ({
    name,
    accessMode,
    invitedEmails,
  }: CircuitSaveOptions) => {
    const store = useCircuitStore.getState();
    const currentCircuitId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("circuitId")
        : null;

    // Synchronize the name in the store
    useCircuitStore.setState({ circuitName: name });

    const thumbnailDataUrl = await createCircuitThumbnail(
      store.nodes,
      store.edges,
    );
    const payload = {
      name,
      nodes: store.nodes,
      edges: store.edges,
      arduinoCode: store.arduinoCode,
      picoCode: store.picoCode,
      thumbnailDataUrl,
      accessMode,
      ownerEmail: getStoredUserEmail(),
      invitedEmails,
    };
    const saveToEndpoint = async () => {
      const endpoint = currentCircuitId
        ? serverApiUrl(`/circuits/${encodeURIComponent(currentCircuitId)}`)
        : serverApiUrl("/circuits");
      const response = await fetch(endpoint, {
        method: currentCircuitId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true || !result?.circuit)
        throw new Error("Save failed");
      return result;
    };

    setDbSaveStatus("saving");
    try {
      const result = await saveToEndpoint();
      if (
        !currentCircuitId &&
        result.circuit?.id &&
        typeof window !== "undefined"
      ) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("circuitId", result.circuit.id);
        window.history.replaceState(null, "", nextUrl.toString());
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          CURRENT_CIRCUIT_ACCESS_KEY,
          JSON.stringify({ accessMode, invitedEmails }),
        );
      }
      setDbSaveStatus("saved");
      window.setTimeout(() => setDbSaveStatus("idle"), 1800);
    } catch (error) {
      console.error("[Circuit DB] save failed", error);
      setDbSaveStatus("error");
      window.setTimeout(() => setDbSaveStatus("idle"), 2400);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const store = useCircuitStore.getState();
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        store.undo();
      } else if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        store.redo();
      } else if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
        store.rotateSelected();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <div className="relative z-50 h-[50px] shrink-0 overflow-visible border-b border-[#d9dee5] bg-[#f6f7f8]">
        <div className="flex h-full items-center">
          <ToolbarButton
            icon={Copy}
            label="Copy"
            onClick={() => {}}
            disabled={!hasSelection}
          />
          <ToolbarButton
            icon={Clipboard}
            label="Paste"
            onClick={() => {}}
            disabled
          />
          <ToolbarButton
            icon={Trash2}
            label="Delete (Del)"
            onClick={deleteSelected}
            disabled={!hasSelection}
          />

          <Separator />

          <ToolbarButton
            icon={Undo2}
            label="Undo (Ctrl+Z)"
            onClick={undo}
            disabled={history.past.length === 0}
          />
          <ToolbarButton
            icon={Redo2}
            label="Redo (Ctrl+Y)"
            onClick={redo}
            disabled={history.future.length === 0}
          />

          <Separator />

          <button
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(
                "application/circuit-component",
                "stickyNote",
              );
              event.dataTransfer.effectAllowed = "move";
            }}
            onClick={addStickyNote}
            className="flex h-[50px] w-[48px] items-center justify-center border-r border-[#dfe4ea] transition-colors text-[#34495e] hover:bg-[#e9eef3] cursor-grab active:cursor-grabbing"
            title="Comments"
          >
            <StickyNoteIcon size={26} />
          </button>
          <ToolbarButton icon={Eye} label="Toggle notes" onClick={() => setNotesVisible(!notesVisible)} />

          <Separator />

          <button
            onClick={resetToDefault}
            className="flex h-[50px] shrink-0 whitespace-nowrap items-center gap-2 border-r border-[#dfe4ea] px-4 text-sm font-medium text-[#34495e] transition-colors hover:bg-[#e9eef3]"
            title="Create new circuit"
          >
            <span className="flex items-center justify-center h-5 w-5 rounded bg-[#34495e] text-white text-xs font-bold leading-none">
              +
            </span>
            <span>New</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-[50px] shrink-0 whitespace-nowrap items-center gap-2 border-r border-[#dfe4ea] px-4 text-sm font-medium text-[#34495e] transition-colors hover:bg-[#e9eef3]"
            title="Import circuit from .brd file"
          >
            <Upload size={18} />
            <span>Import</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".brd"
            className="hidden"
          />
          <PresetDropdown />

          <button
            onClick={() => void saveCircuitToDb()}
            disabled={dbSaveStatus === "saving"}
            className={`flex h-[50px] shrink-0 whitespace-nowrap items-center gap-2 border-r border-[#dfe4ea] px-4 text-sm font-medium transition-colors ${
              dbSaveStatus === "saved"
                ? "bg-emerald-50 text-emerald-700"
                : dbSaveStatus === "error"
                  ? "bg-red-50 text-red-600"
                  : "text-[#34495e] hover:bg-[#e9eef3]"
            } ${dbSaveStatus === "saving" ? "cursor-wait opacity-70" : ""}`}
            title="Save current circuit to DB"
          >
            <Database size={18} />
            <span>
              {dbSaveStatus === "saving"
                ? "Saving..."
                : dbSaveStatus === "saved"
                  ? "Saved DB"
                  : dbSaveStatus === "error"
                    ? "DB Error"
                    : "Save DB"}
            </span>
          </button>

          <div className="flex h-[50px] items-center border-r border-[#dfe4ea] px-5">
            <ColorPicker value={wireColor} onChange={setWireColor} />
          </div>

          <div className="flex-1" />

          <button
            onClick={rotateSelected}
            disabled={!hasSelection}
            className={`flex h-10 shrink-0 items-center justify-center rounded border px-3 text-base transition-colors ${
              hasSelection
                ? "border-[#d9dee5] bg-[#f8f9fa] text-[#34495e] hover:bg-[#eef2f5]"
                : "cursor-not-allowed border-[#e8ebef] bg-[#f8f9fa] text-[#c5ced8]"
            }`}
            title="Rotate (R)"
          >
            <RotateCw size={20} strokeWidth={2.1} />
          </button>

          <button
            onClick={() => useCircuitStore.setState((s) => ({ showCodeEditor: !s.showCodeEditor }))}
            className={`ml-2 flex h-10 shrink-0 whitespace-nowrap items-center gap-2 rounded border px-3 text-base transition-colors ${
              showCodeEditor
                ? "border-[#0097d7] bg-[#0097d7] text-white"
                : "border-[#d9dee5] bg-[#f8f9fa] text-[#34495e] hover:bg-[#eef2f5]"
            }`}
            title="Code Editor"
          >
            <Code size={22} />
            <span>Code</span>
          </button>

          <button
            onClick={startOrStopSimulation}
            disabled={!simulationStoppingAvailable && isEsp32CppBlocked}
            title={
              !simulationStoppingAvailable && isEsp32CppBlocked
                ? `ESP32 C++ supports Digital I/O only. Unsupported: ${esp32CppSupport.unsupportedConstructs.join(", ")}`
                : undefined
            }
            className={`ml-2 flex h-10 shrink-0 whitespace-nowrap items-center gap-3 rounded border px-4 text-base transition-colors ${
              !simulationStoppingAvailable && isEsp32CppBlocked
                ? "cursor-not-allowed border-[#e8ebef] bg-[#f8f9fa] text-[#94a3b8]"
                : "border-[#d9dee5] bg-[#f8f9fa] text-[#34495e] hover:bg-[#eef2f5]"
            }`}
          >
            {simulationStoppingAvailable ? (
              <Square size={20} />
            ) : (
              <Play size={20} fill={!simulationStoppingAvailable && isEsp32CppBlocked ? "#94a3b8" : "#2f4054"} />
            )}
            {simulationStoppingAvailable
              ? "Stop Simulation"
              : "Start Simulation"}
          </button>

          <button
            onClick={() => void prepareSendToModal()}
            className="ml-2 flex h-10 shrink-0 whitespace-nowrap items-center rounded border border-[#d9dee5] bg-[#f8f9fa] px-5 text-base text-[#34495e] transition-colors hover:bg-[#eef2f5] cursor-pointer"
            title="Send to"
          >
            Send To
          </button>
        </div>
      </div>

      <CircuitSaveModal
        isOpen={modalOpen}
        title={modalTitle}
        defaultValue={modalDefaultVal}
        defaultAccessMode={modalDefaultAccess}
        defaultInvitedEmails={modalDefaultInvites}
        onClose={() => setModalOpen(false)}
        onConfirm={handleSaveConfirm}
      />

      <SendToModal
        isOpen={sendToModalOpen}
        designImage={designImage}
        onClose={() => setSendToModalOpen(false)}
      />
    </>
  );
}
