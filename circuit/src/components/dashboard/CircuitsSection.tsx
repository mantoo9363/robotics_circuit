'use client';

import { useEffect, useState } from 'react';
import { CircuitBoard, Heart } from 'lucide-react';
import { COMPONENT_CATALOG, COMPONENT_THUMBNAILS } from '@cs/lib/circuit-components';
import type { CircuitEdge, CircuitNode } from '@cs/lib/types';
import { serverApiUrl, serverAssetUrl } from '@cs/lib/server-api';
import { ProjectCard, SectionHeader, ViewAllCard } from './DashboardCards';

export type SavedCircuit = {
  id: string;
  name: string;
  ownerEmail?: string;
  creatorName?: string;
  likesCount?: number;
  likedByViewer?: boolean;
  nodes?: unknown;
  edges?: unknown;
  thumbnailPath?: string;
  updatedAt?: string;
  createdAt?: string;
};

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const AUTH_USER_KEY = 'circuit-studio-auth-user';

function getStoredUserEmail() {
  if (typeof window === 'undefined') return '';
  try {
    const user = JSON.parse(window.localStorage.getItem(AUTH_USER_KEY) || '{}') as {
      email?: unknown;
    };
    return typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

function formatCircuitSubtitle(circuit: SavedCircuit) {
  const updatedAt = circuit.updatedAt ?? circuit.createdAt;
  const componentCount = Array.isArray(circuit.nodes) ? circuit.nodes.length : 0;
  const componentText = `${componentCount} component${componentCount === 1 ? '' : 's'}`;

  if (updatedAt) {
    const date = new Date(updatedAt);
    if (!Number.isNaN(date.getTime())) {
      const savedDate = `${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
      return `${componentText} saved ${savedDate}`;
    }
  }

  return componentText;
}

function isCircuitNode(value: unknown): value is CircuitNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as Partial<CircuitNode>;
  return (
    typeof node.id === 'string' &&
    typeof node.position?.x === 'number' &&
    typeof node.position?.y === 'number' &&
    typeof node.data?.componentType === 'string'
  );
}

function isCircuitEdge(value: unknown): value is CircuitEdge {
  if (!value || typeof value !== 'object') return false;
  const edge = value as Partial<CircuitEdge>;
  return typeof edge.source === 'string' && typeof edge.target === 'string';
}

function CircuitPreview({ circuit }: { circuit: SavedCircuit }) {
  const nodes = Array.isArray(circuit.nodes) ? circuit.nodes.filter(isCircuitNode) : [];
  const edges = Array.isArray(circuit.edges) ? circuit.edges.filter(isCircuitEdge) : [];

  if (nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase tracking-[0.14em] text-[#6b7280]">
        Empty Circuit
      </div>
    );
  }

  const nodeSize = 64;
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + nodeSize));
  const maxY = Math.max(...nodes.map((node) => node.position.y + nodeSize));
  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  const scale = Math.min(2.2, 184 / boundsWidth, 138 / boundsHeight);
  const offsetX = (240 - boundsWidth * scale) / 2;
  const offsetY = (190 - boundsHeight * scale) / 2;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const positionFor = (node: CircuitNode) => {
    const size = Math.max(24, Math.min(58, nodeSize * scale));
    return {
      x: (node.position.x - minX) * scale + offsetX,
      y: (node.position.y - minY) * scale + offsetY,
      size,
    };
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#eef8f4]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 240 190" aria-hidden="true">
        {edges.map((edge) => {
          const source = nodeById.get(edge.source);
          const target = nodeById.get(edge.target);
          if (!source || !target) return null;

          const sourcePosition = positionFor(source);
          const targetPosition = positionFor(target);
          const color = typeof edge.data?.color === 'string' ? edge.data.color : '#22c55e';

          return (
            <line
              key={edge.id}
              x1={sourcePosition.x + sourcePosition.size / 2}
              y1={sourcePosition.y + sourcePosition.size / 2}
              x2={targetPosition.x + targetPosition.size / 2}
              y2={targetPosition.y + targetPosition.size / 2}
              stroke={color}
              strokeLinecap="round"
              strokeWidth="3"
            />
          );
        })}
      </svg>

      {nodes.map((node) => {
        const componentType = node.data.componentType;
        const thumbnail = COMPONENT_THUMBNAILS[componentType];
        const component = COMPONENT_CATALOG.find((item) => item.type === componentType);
        const { x, y, size } = positionFor(node);

        return (
          <div
            key={node.id}
            className="absolute flex items-center justify-center"
            style={{
              left: x,
              top: y,
              width: size,
              height: size,
              transform: `rotate(${Number(node.data.rotation ?? 0)}deg)`,
            }}
          >
            {thumbnail ? (
              <img src={thumbnail} alt="" className="h-full w-full object-contain drop-shadow-sm" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded border border-[#9fb5c5] bg-white px-1 text-center text-[9px] font-bold leading-3 text-[#24516b] shadow-sm">
                {component?.label ?? componentType}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CircuitsSection({
  circuits,
  loadError = false,
}: {
  circuits: SavedCircuit[];
  loadError?: boolean;
}) {
  const [items, setItems] = useState(circuits);
  const [viewerEmail, setViewerEmail] = useState('');
  const [likingId, setLikingId] = useState<string | null>(null);

  useEffect(() => {
    setItems(circuits);
  }, [circuits]);

  useEffect(() => {
    setViewerEmail(getStoredUserEmail());
  }, []);

  const maxVisible = 5;
  const showViewAll = items.length > maxVisible;
  const visibleCircuits = showViewAll
    ? items.slice(0, maxVisible)
    : items;

  const handleLike = async (circuit: SavedCircuit) => {
    if (!viewerEmail || likingId) return;
    setLikingId(circuit.id);
    try {
      const response = await fetch(serverApiUrl(`/circuits/${encodeURIComponent(circuit.id)}/like`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerEmail }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true || !result?.circuit) {
        throw new Error(result?.error || 'Unable to like circuit');
      }
      setItems((current) =>
        current.map((item) => (item.id === circuit.id ? { ...item, ...result.circuit } : item)),
      );
    } catch (error) {
      console.error('[Circuit Like] failed', error);
    } finally {
      setLikingId(null);
    }
  };

  return (
    <section className="mt-6">
      <SectionHeader icon={CircuitBoard} title="Circuits" viewAllHref="/curcuit" />
      <div className="grid grid-flow-col auto-cols-[220px] overflow-x-auto gap-4 pb-4 lg:grid-flow-row lg:grid-cols-5 lg:overflow-x-visible lg:pb-0">
        {loadError ? (
          <div className="flex min-h-[255px] items-center justify-center rounded-lg border border-[#ffd2d2] bg-[#fff7f7] px-5 text-center text-sm font-semibold text-[#b42318] shadow-sm">
            Saved circuits could not be loaded
          </div>
        ) : null}

        {!loadError && visibleCircuits.length === 0 ? (
          <div className="flex min-h-[255px] items-center justify-center rounded-lg border border-[#d9e3ec] bg-white px-5 text-center text-sm font-semibold text-[#586170] shadow-sm">
            No database circuits yet
          </div>
        ) : null}

        {visibleCircuits.map((circuit) => {
          const ownerEmail = (circuit.ownerEmail || '').toLowerCase();
          const isOwner = !!viewerEmail && ownerEmail === viewerEmail;
          const canLike = !!viewerEmail && !isOwner;

          return (
            <ProjectCard
              key={circuit.id}
              href={`/curcuit?circuitId=${encodeURIComponent(circuit.id)}`}
              image={serverAssetUrl(circuit.thumbnailPath)}
              imageMode="contain"
              preview={circuit.thumbnailPath ? undefined : <CircuitPreview circuit={circuit} />}
              title={circuit.name}
              subtitle={formatCircuitSubtitle(circuit)}
              creatorName={circuit.creatorName}
              badge="DB"
              footerAction={
                <button
                  type="button"
                  disabled={!canLike || likingId === circuit.id}
                  onClick={() => void handleLike(circuit)}
                  className={`flex h-8 min-w-[58px] items-center justify-center gap-1 rounded-full border px-2 text-xs font-black transition ${
                    circuit.likedByViewer
                      ? 'border-rose-200 bg-rose-50 text-rose-600'
                      : 'border-[#d9e3ec] bg-white text-[#586170] hover:border-rose-200 hover:text-rose-600'
                  } ${!canLike || likingId === circuit.id ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                  title={isOwner ? 'You cannot like your own circuit' : 'Like circuit'}
                >
                  <Heart size={15} fill={circuit.likedByViewer ? 'currentColor' : 'none'} />
                  <span>{Number(circuit.likesCount || 0)}</span>
                </button>
              }
            />
          );
        })}

        {maxVisible>5 ? (
          <ViewAllCard
            href="/projects"
            title="View All"
            subtitle={`Browse all ${items.length} circuits`}
          />
        ) : (
          null
        )}

        {/* <Link
          href="/curcuit"
          className="flex min-h-[255px] flex-col justify-between rounded-lg bg-[#1f719d] p-6 text-white shadow-sm transition hover:bg-[#17658e]"
        >
          <Zap size={28} />
          <div>
            <div className="text-[24px] font-bold">Circuit Pro</div>
            <p className="mt-2 text-xs leading-4">You&apos;ve mastered 5 basic logic gates!</p>
          </div>
          <div>
            <div className="h-2 rounded-full bg-white/45">
              <div className="h-2 w-[66%] rounded-full bg-white" />
            </div>
            <div className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.16em]">
              66% to logic expert
            </div>
          </div>
        </Link> */}
      </div>
    </section>
  );
}
