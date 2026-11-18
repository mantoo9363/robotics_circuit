import { useCircuitStore } from '@cs/lib/store';
import type { CircuitEdge, CircuitNode } from '@cs/lib/types';

const CHANNEL_NAME = 'circuit-studio-circuit-v1';
const LS_KEY = 'circuit-studio:circuit-state';

let initialized = false;
let broadcastChannel: BroadcastChannel | null = null;
let applyingRemote = false;
let lastDigest = '';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastNodesRef: CircuitNode[] | null = null;
let lastEdgesRef: CircuitEdge[] | null = null;
let lastArduino = '';
let lastPico = '';

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return broadcastChannel;
}

function digest(
  nodes: CircuitNode[],
  edges: CircuitEdge[],
  arduinoCode: string,
  picoCode: string
): string {
  const snapshot = createStableCircuitSnapshot({ nodes, edges, arduinoCode, picoCode });
  return JSON.stringify(snapshot);
}

function createStableCircuitSnapshot(payload: {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  arduinoCode: string;
  picoCode: string;
}) {
  const { nodes, edges, arduinoCode, picoCode } = payload;
  const stableNodes = nodes.map(({ selected, dragging, ...node }) => {
    const {
      gasCloudActive,
      gasCloudOffset,
      servoControllerActive,
      servoControlAngle,
      servoControlSpeed,
      ...data
    } = node.data;
    const { gasLevel, ...properties } = data.properties ?? {};

    return {
      ...node,
      data: {
        ...data,
        properties,
      },
    };
  });
  const stableEdges = edges.map(({ selected, ...edge }) => edge);
  return {
    nodes: stableNodes,
    edges: stableEdges,
    arduinoCode,
    picoCode,
  };
}

function applyCircuitSnapshot(payload: {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  arduinoCode: string;
  picoCode: string;
}) {
  const nextDigest = digest(payload.nodes, payload.edges, payload.arduinoCode, payload.picoCode);
  if (nextDigest === lastDigest) return;

  const current = useCircuitStore.getState();
  const currentDigest = digest(current.nodes, current.edges, current.arduinoCode, current.picoCode);
  if (nextDigest === currentDigest) {
    lastDigest = nextDigest;
    return;
  }

  applyingRemote = true;

  useCircuitStore.setState({
    nodes: structuredClone(payload.nodes),
    edges: structuredClone(payload.edges),
    arduinoCode: payload.arduinoCode,
    picoCode: payload.picoCode,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    history: { past: [], future: [] },
  });

  lastDigest = nextDigest;
  applyingRemote = false;

  lastNodesRef = useCircuitStore.getState().nodes;
  lastEdgesRef = useCircuitStore.getState().edges;
  lastArduino = useCircuitStore.getState().arduinoCode;
  lastPico = useCircuitStore.getState().picoCode;

  try {
    localStorage.setItem(LS_KEY, lastDigest);
  } catch {
    /* quota */
  }
}

function schedulePublish() {
  if (typeof window === 'undefined' || applyingRemote) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const { nodes, edges, arduinoCode, picoCode } = useCircuitStore.getState();
    const d = digest(nodes, edges, arduinoCode, picoCode);
    if (d === lastDigest) return;
    const snapshot = createStableCircuitSnapshot({ nodes, edges, arduinoCode, picoCode });
    lastDigest = d;
    try {
      getChannel()?.postMessage({
        t: 'circuit',
        ...snapshot,
      });
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem(LS_KEY, d);
    } catch {
      /* ignore */
    }
  }, 200);
}

/** Keep editor tabs on the same schematic + code. */
export function initCircuitCrossTabSync() {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  const ch = getChannel();
  if (ch) {
    ch.onmessage = (ev: MessageEvent<{ t?: string; nodes?: CircuitNode[]; edges?: CircuitEdge[]; arduinoCode?: string; picoCode?: string }>) => {
      if (ev.data?.t !== 'circuit' || !ev.data.nodes || !ev.data.edges) return;
      applyCircuitSnapshot({
        nodes: ev.data.nodes,
        edges: ev.data.edges,
        arduinoCode: typeof ev.data.arduinoCode === 'string' ? ev.data.arduinoCode : useCircuitStore.getState().arduinoCode,
        picoCode: typeof ev.data.picoCode === 'string' ? ev.data.picoCode : useCircuitStore.getState().picoCode,
      });
    };
  }

  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        nodes?: CircuitNode[];
        edges?: CircuitEdge[];
        arduinoCode?: string;
        picoCode?: string;
      };
      if (parsed?.nodes && parsed?.edges) {
        applyCircuitSnapshot({
          nodes: parsed.nodes,
          edges: parsed.edges,
          arduinoCode: typeof parsed.arduinoCode === 'string' ? parsed.arduinoCode : useCircuitStore.getState().arduinoCode,
          picoCode: typeof parsed.picoCode === 'string' ? parsed.picoCode : useCircuitStore.getState().picoCode,
        });
      }
    } else {
      const s = useCircuitStore.getState();
      lastDigest = digest(s.nodes, s.edges, s.arduinoCode, s.picoCode);
      lastNodesRef = s.nodes;
      lastEdgesRef = s.edges;
      lastArduino = s.arduinoCode;
      lastPico = s.picoCode;
    }
  } catch {
    /* ignore */
  }

  if (!lastDigest) {
    const s = useCircuitStore.getState();
    lastDigest = digest(s.nodes, s.edges, s.arduinoCode, s.picoCode);
    lastNodesRef = s.nodes;
    lastEdgesRef = s.edges;
    lastArduino = s.arduinoCode;
    lastPico = s.picoCode;
  }

  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== LS_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as {
        nodes?: CircuitNode[];
        edges?: CircuitEdge[];
        arduinoCode?: string;
        picoCode?: string;
      };
      if (parsed?.nodes && parsed?.edges) {
        applyCircuitSnapshot({
          nodes: parsed.nodes,
          edges: parsed.edges,
          arduinoCode: typeof parsed.arduinoCode === 'string' ? parsed.arduinoCode : useCircuitStore.getState().arduinoCode,
          picoCode: typeof parsed.picoCode === 'string' ? parsed.picoCode : useCircuitStore.getState().picoCode,
        });
      }
    } catch {
      /* ignore */
    }
  });

  useCircuitStore.subscribe((state) => {
    if (applyingRemote) return;
    if (
      state.nodes === lastNodesRef &&
      state.edges === lastEdgesRef &&
      state.arduinoCode === lastArduino &&
      state.picoCode === lastPico
    ) {
      return;
    }
    lastNodesRef = state.nodes;
    lastEdgesRef = state.edges;
    lastArduino = state.arduinoCode;
    lastPico = state.picoCode;

    const d = digest(state.nodes, state.edges, state.arduinoCode, state.picoCode);
    if (d === lastDigest) return;
    schedulePublish();
  });
}
