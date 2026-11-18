'use client';
 
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { COMPONENT_CATALOG, COMPONENT_CATEGORIES } from '@cs/lib/circuit-components';
import { getComponentThumbnail, useDynamicComponentsStore } from '@cs/store/useDynamicComponentsStore';
import type { ComponentCategory } from '@cs/lib/types';
 
function ComponentThumbnail({
  type,
  dynamicComponents,
}: {
  type: string;
  dynamicComponents: ReturnType<typeof useDynamicComponentsStore.getState>['components'];
}) {
  const imageSrc = getComponentThumbnail(type, dynamicComponents);
 
  // If thumbnail is image
  if (imageSrc) {
    return (
      <div className="flex h-[86px] w-full items-center justify-center">
        <img
          src={imageSrc}
          alt={type}
          className="block h-full max-h-full w-full object-contain"
          draggable={false}
        />
      </div>
    );
  }
 
  const thumbnails: Record<string, React.ReactNode> = {
 
  };
 
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
  const [category, setCategory] = useState<ComponentCategory>('all');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const dynamicComponents = useDynamicComponentsStore((state) => state.components);
  const hydrateDynamicComponents = useDynamicComponentsStore((state) => state.hydrate);
 
  useEffect(() => {
    hydrateDynamicComponents();
  }, [hydrateDynamicComponents]);
 
  const componentCatalog = useMemo(
    () => COMPONENT_CATALOG,
    []
  );
 
  const filteredComponents = useMemo(() => {
    return componentCatalog.filter((c) => {
      const matchesCategory =
        category === 'all' || c.category === category;
 
      const matchesSearch = c.label
        .toLowerCase()
        .includes(search.toLowerCase());
 
      return matchesCategory && matchesSearch;
    });
  }, [category, componentCatalog, search]);
 
  const onDragStart = useCallback(
    (event: React.DragEvent, componentType: string) => {
      event.dataTransfer.setData(
        'application/circuit-component',
        componentType
      );
 
      event.dataTransfer.effectAllowed = 'move';
    },
    []
  );
 
  if (collapsed) {
    return (
      <div className="flex w-8 items-start justify-center border-l border-[#d5dbe2] bg-[#eef1f5] pt-8">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded bg-white p-1 text-[#34495e] shadow-sm hover:bg-gray-100"
          title="Expand components panel"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
    );
  }
 
  return (
    <aside className="relative flex h-full min-h-0 overflow-hidden border-l border-[#d5dbe2] bg-[#e9edf3] text-[#2f4054]">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-[#d5dbe2] px-3 py-3">
          <div className="relative rounded-sm border border-[#dfe4ea] bg-white px-4 py-2.5 shadow-[0_2px_8px_rgba(31,45,61,0.06)]">
            <label className="block text-[11px] leading-none text-[#2f4054]">
              Components
            </label>
 
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as ComponentCategory)
              }
              className="mt-1 w-full appearance-none bg-transparent pr-8 text-lg leading-6 text-[#111827] outline-none"
            >
              {COMPONENT_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
 
            <ChevronRight
              size={18}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-black"
            />
          </div>
        </div>
 
        <div className="border-b border-[#d5dbe2] bg-[#eef1f5] px-3 py-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full border border-[#dfe4ea] bg-white px-3 pr-11 text-lg text-[#2f4054] placeholder:text-[#607085] focus:outline-none focus:ring-1 focus:ring-[#b8c7d8]"
            />
 
            <Search
              size={28}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c7ced8]"
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
                className="flex h-[140px] cursor-grab select-none flex-col items-center justify-between rounded-md bg-[#f7f8fa] p-2 text-center shadow-sm transition-colors hover:bg-white hover:ring-1 hover:ring-[#b8c7d8] active:cursor-grabbing"
                title={`Drag to add ${component.label}`}
              >
                <div className="flex h-[92px] w-full items-center justify-center">
                  <ComponentThumbnail type={component.type} dynamicComponents={dynamicComponents} />
                </div>
 
                <span className="line-clamp-2 min-h-[32px] w-full text-[13px] leading-4 text-[#243b5a]">
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
                  setCategory('all');
                  setSearch('');
                }}
              >
                Show all components
              </button>
            </div>
          )}
        </div>
      </div>
 
      <div className="flex w-12 flex-col items-center border-l border-[#d5dbe2] bg-[#eef1f5] pt-6">
        <button
          onClick={() => setCollapsed(true)}
          className="absolute left-[-12px] top-[275px] flex h-14 w-6 items-center justify-center border border-[#d5dbe2] bg-white text-[#111827] shadow-sm"
          title="Collapse components panel"
        >
          <ChevronRight size={26} strokeWidth={3} />
        </button>
      </div>
    </aside>
  );
}
