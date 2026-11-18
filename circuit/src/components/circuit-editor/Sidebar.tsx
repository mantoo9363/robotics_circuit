"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Search, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import {
  COMPONENT_CATALOG,
  COMPONENT_CATEGORIES,
} from "@cs/lib/circuit-components";
import {
  getComponentThumbnail,
  useDynamicComponentsStore,
} from "@cs/store/useDynamicComponentsStore";
import { useCircuitStore } from "@cs/lib/store";
import type { ComponentCategory } from "@cs/lib/types";
import { ComponentGuidePanel } from "./ComponentGuidePanel";
function ComponentThumbnail({
  type,
  dynamicComponents,
}: {
  type: string;
  dynamicComponents: ReturnType<
    typeof useDynamicComponentsStore.getState
  >["components"];
}) {
  const imageSrc = getComponentThumbnail(type, dynamicComponents);

  // If thumbnail is image
  if (imageSrc) {
    return (
      <div className="flex h-[40px] w-full items-center justify-center">
        <img
          src={imageSrc}
          alt={type}
          className="block h-full"
          draggable={false}
        />
      </div>
    );
  }

  const thumbnails: Record<string, React.ReactNode> = {};

  return (
    thumbnails[type] || (
      <svg viewBox="0 0 40 40" className="h-16 w-full">
        <rect
          x="5"
          y="5"
          width="30"
          height="30"
          rx="3"
          fill="#555"
          stroke="#777"
          strokeWidth="1"
        />
        <text x="20" y="24" textAnchor="middle" fontSize="8" fill="#ccc">
          ?
        </text>
      </svg>
    )
  );
}

export function Sidebar() {
  const [category, setCategory] = useState<ComponentCategory>("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<{ type: string; label: string } | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const dynamicComponents = useDynamicComponentsStore(
    (state) => state.components,
  );
  const hydrateDynamicComponents = useDynamicComponentsStore(
    (state) => state.hydrate,
  );

  const showCodeEditor = useCircuitStore((s) => s.showCodeEditor);

  useEffect(() => {
    setCollapsed(showCodeEditor);
  }, [showCodeEditor]);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    hydrateDynamicComponents();
  }, [hydrateDynamicComponents]);

  const componentCatalog = useMemo(() => COMPONENT_CATALOG, []);

  const filteredComponents = useMemo(() => {
    return componentCatalog.filter((c) => {
      const matchesCategory = category === "all" || c.category === category;

      const matchesSearch = c.label
        .toLowerCase()
        .includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [category, componentCatalog, search]);

  const onDragStart = useCallback(
    (event: React.DragEvent, componentType: string) => {
      event.dataTransfer.setData(
        "application/circuit-component",
        componentType,
      );

      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  return (
    <aside
      className={`relative flex h-full min-h-0 border-l border-[#d5dbe2] text-[#2f4054] transition-all duration-300 ease-in-out ${
        collapsed ? "w-8 bg-[#eef1f5]" : "w-[332px] bg-[#e9edf3]"
      }`}
    >
      {/* Content wrapper with curtain width and opacity transition */}
      <div
        className={`flex flex-col h-full min-h-0 overflow-hidden transition-all duration-300 ${collapsed
          ? "w-0 opacity-0 pointer-events-none"
          : "w-[300px] opacity-100"
          }`}
      >
        <div className="border-b border-[#d5dbe2] px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#dfe4ea] bg-white text-[#607085] shadow-sm hover:bg-[#eef2f5] hover:text-[#20354d]"
              title="Collapse panel"
            >
              <ChevronLeft size={14} strokeWidth={2.5} />
            </button>
          <div className="flex items-center gap-3 flex-1">
            {/* Left Side: Custom Dropdown Box */}
            <div className="relative flex-1" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full text-left rounded-lg border border-[#dfe4ea] bg-white px-3 py-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#006aa0]/25 transition-all hover:bg-slate-50 cursor-pointer"
              >
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Components
                </span>
                <span className="mt-0.5 block text-sm font-semibold text-slate-800 leading-tight">
                  {COMPONENT_CATEGORIES.find((cat) => cat.value === category)
                    ?.label || "All"}
                </span>
                <ChevronDown
                  size={14}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-transform duration-200 ${
                    dropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 right-0 z-50 mt-1.5 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="space-y-0.5">
                    {COMPONENT_CATEGORIES.map((cat) => {
                      const isSelected = cat.value === category;
                      return (
                        <button
                          key={cat.value}
                          onClick={() => {
                            setCategory(cat.value as ComponentCategory);
                            setDropdownOpen(false);
                          }}
                          className={`w-full text-left rounded-lg px-3 py-2 text-sm font-semibold transition-colors cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? "bg-[#006aa0]/10 text-[#006aa0]"
                              : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                          }`}
                        >
                          <span>{cat.label}</span>
                          {isSelected && (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#006aa0]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>

        <div className="border-b border-[#d5dbe2] bg-[#eef1f5] px-3 py-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full border border-[#dfe4ea] bg-white px-3 pr-9 text-sm text-[#2f4054] placeholder:text-[#607085] focus:outline-none focus:ring-1 focus:ring-[#b8c7d8]"
            />

            <Search
              size={18}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#c7ced8]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
          <div className="grid grid-cols-3 gap-2">
            {filteredComponents.map((component) => (
              <div
                key={component.type}
                draggable
                onDragStart={(e) => onDragStart(e, component.type)}
                onPointerDown={(event) => {
                  pointerStart.current = { x: event.clientX, y: event.clientY };
                }}
                onPointerUp={(event) => {
                  const start = pointerStart.current;
                  pointerStart.current = null;
                  if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
                  setSelectedComponent({ type: component.type, label: component.label });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedComponent({ type: component.type, label: component.label });
                  }
                }}
                role="button"
                tabIndex={0}
                className="flex h-[120px] cursor-grab select-none flex-col items-center justify-between rounded-md bg-[#f7f8fa] p-2 text-center shadow-sm transition-colors hover:bg-white hover:ring-1 hover:ring-[#b8c7d8] active:cursor-grabbing"
                title={`Click for ${component.label} information or drag to add`}
              >
                <div className="flex h-[92px] w-full items-center justify-center">
                  <ComponentThumbnail
                    type={component.type}
                    dynamicComponents={dynamicComponents}
                  />
                </div>

                <span className="line-clamp-2 min-h-[32px] w-full text-[10px] leading-4 text-[#243b5a]">
                  {component.label}
                </span>
              </div>
            ))}
          </div>

          {filteredComponents.length === 0 && (
            <div className="space-y-3 py-8 text-center text-sm text-gray-500">
              <div>No components found</div>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setCategory("all");
                  setSearch("");
                }}
              >
                Show all components
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Decorative vertical line when expanded, aligned to the right edge */}
      {!collapsed && (
        <div className="w-8 flex-shrink-0 border-l border-[#d5dbe2] bg-[#eef1f5]" />
      )}

      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="absolute left-0 top-0 flex h-10 w-8 items-center justify-center text-[#607085] hover:text-[#20354d] cursor-pointer z-10"
          title="Expand components panel"
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      )}
      {selectedComponent && (
        <ComponentGuidePanel
          componentType={selectedComponent.type}
          componentLabel={selectedComponent.label}
          fallbackThumbnail={getComponentThumbnail(selectedComponent.type, dynamicComponents)}
          onClose={() => setSelectedComponent(null)}
        />
      )}
    </aside>
  );
}
