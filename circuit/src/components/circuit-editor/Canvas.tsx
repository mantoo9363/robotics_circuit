'use client';

import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Controls,
  ViewportPortal,
  useReactFlow,
  ConnectionMode,
  Background,
  BackgroundVariant,
  type OnSelectionChangeFunc,
  type Connection,
  type ConnectionLineComponentProps,
  type OnNodeDrag,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { nodeTypes } from '@cs/components/nodes';
import { edgeTypes } from '@cs/components/edges';
import { SparkConnectionLine, SparkWirePath } from '@cs/components/edges/SparkConnectionLine';
import { useCircuitStore } from '@cs/lib/store';
import { getComponentDefinition, useDynamicComponentsStore } from '@cs/store/useDynamicComponentsStore';
import type { CircuitEdge, CircuitNode } from '@cs/lib/types';
import { getSnappedNodePosition } from '@cs/lib/breadboard-autoconnect';

type WirePoint = { x: number; y: number };
type PinWireEvent = CustomEvent<{
  nodeId: string;
  handleId: string;
  clientX: number;
  clientY: number;
  button: number;
}>;
type DraftWire = {
  sourceNode: string;
  sourceHandle: string;
  sourcePoint: WirePoint;
  cursorPoint: WirePoint;
  waypoints: WirePoint[];
};

function snap(value: number) {
  return Math.round(value / 20) * 20;
}

export function Canvas() {
  const nodes = useCircuitStore((state) => state.nodes);
  const edges = useCircuitStore((state) => state.edges);
  const onNodesChange = useCircuitStore((state) => state.onNodesChange);
  const onEdgesChange = useCircuitStore((state) => state.onEdgesChange);
  const setSelection = useCircuitStore((state) => state.setSelection);
  const wireColor = useCircuitStore((state) => state.wireColor);
  const notesVisible = useCircuitStore((state) => state.notesVisible);
  const { screenToFlowPosition } = useReactFlow();
  const dynamicComponents = useDynamicComponentsStore((state) => state.components);
  const hydrateDynamicComponents = useDynamicComponentsStore((state) => state.hydrate);
  const [connectionWaypoints, setConnectionWaypoints] = useState<WirePoint[]>([]);
  const [draftWire, setDraftWire] = useState<DraftWire | null>(null);

  const pendingStickyNote = useCircuitStore((state: any) => state.pendingStickyNote);
  const [ghostPosition, setGhostPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!pendingStickyNote) {
      setGhostPosition(null);
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setGhostPosition({
        x: position.x - 110,
        y: position.y - 32,
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        useCircuitStore.setState({ pendingStickyNote: false });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pendingStickyNote, screenToFlowPosition]);
  const connectionWaypointsRef = useRef<WirePoint[]>([]);
  const draftWireRef = useRef<DraftWire | null>(null);
  const isDrawingWireRef = useRef(false);
  const connectionStartedAtRef = useRef(0);
  const visibleNodes = useMemo(
    () => notesVisible ? nodes : nodes.filter((n) => n.type !== 'stickyNote'),
    [nodes, notesVisible]
  );
  const visibleEdges = useMemo(
    () => edges.map((edge) => ({ ...edge, zIndex: edge.zIndex ?? 1000 })),
    [edges]
  );

  useEffect(() => {
    hydrateDynamicComponents();
  }, [hydrateDynamicComponents]);

  // Track rotational angles during active drag-and-drop operations
  const activeDragRotation = useRef<number>(0);

  // ── Keyboard Shortcut: "R" Key Rotation Listener ─────────────────
    // ── Keyboard Shortcut: "R" Key Rotation & Auto Wire Adjust Listener ──
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        activeDragRotation.current = (activeDragRotation.current + 90) % 360;

        // Batch update nodes and edges simultaneously within the Zustand store
        useCircuitStore.setState((state) => {
          const selectedNode = state.nodes.find((node) => node.selected);
          if (!selectedNode) return state;

          const currentRotation = selectedNode.data.rotation ?? 0;
          const nextRotation = (currentRotation + 90) % 360;

          // 1. Rotate the selected component node
          const updatedNodes = state.nodes.map((node) =>
            node.selected
              ? { ...node, data: { ...node.data, rotation: nextRotation } }
              : node
          );

          // 2. Mathematically pivot the connected wire waypoints by 90 degrees
          const updatedEdges = state.edges.map((edge) => {
            const isSource = edge.source === selectedNode.id;
            const isTarget = edge.target === selectedNode.id;

            if ((isSource || isTarget) && edge.data?.waypoints) {
              const currentWps = (edge.data.waypoints as { x: number; y: number }[]) || [];
              
              // Calculate center point of the rotating component to act as origin pivot axis
              const cx = selectedNode.position.x + 50; 
              const cy = selectedNode.position.y + 50;

              // Apply 90-degree clockwise rotation matrix: (x', y') = (cx - (y - cy), cy + (x - cx))
              const rotatedWps = currentWps.map((wp) => {
                const rx = wp.x - cx;
                const ry = wp.y - cy;
                return {
                  x: Math.round((cx - ry) / 20) * 20,
                  y: Math.round((cy + rx) / 20) * 20,
                };
              });

              return {
                ...edge,
                data: { ...edge.data, waypoints: rotatedWps },
              };
            }
            return edge;
          });

          return {
            ...state,
            nodes: updatedNodes,
            edges: updatedEdges,
          };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Ctrl+A / Cmd+A: select all nodes and edges
  useEffect(() => {
    const selectAll = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        useCircuitStore.setState((state) => ({
          selectedNodeIds: state.nodes.map((n) => n.id),
          selectedEdgeIds: state.edges.map((e) => e.id),
          nodes: state.nodes.map((n) => ({ ...n, selected: true })),
          edges: state.edges.map((e) => ({ ...e, selected: true })),
        }));
      }
    };
    window.addEventListener('keydown', selectAll);
    return () => window.removeEventListener('keydown', selectAll);
  }, []);


  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const componentType = event.dataTransfer.getData('application/circuit-component');
      if (!componentType) return;

      if (componentType === 'stickyNote') {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        // Center the sticky note (width 220px, height 64px)
        position.x -= 110;
        position.y -= 32;

        const newNode: CircuitNode = {
          id: uuidv4(),
          type: 'stickyNote',
          position,
          data: {
            componentType: 'stickyNote',
            label: 'Sticky Note',
            properties: {},
            rotation: 0,
            text: 'Write your note here.',
          },
        };

        useCircuitStore.getState().addNode(newNode);
        return;
      }

      const def = getComponentDefinition(componentType, dynamicComponents);
      if (!def) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Center the component at the drop point
      position.x -= def.defaultWidth / 2;
      position.y -= def.defaultHeight / 2;

      const newNode: CircuitNode = {
        id: uuidv4(),
        type: def.type.startsWith('dynamic-') ? 'dynamicComponent' : componentType,
        position,
        data: {
          componentType,
          simulationModel: def.simulationModel,
          label: def.label,
          properties: structuredClone(def.defaultProperties),
          rotation: activeDragRotation.current, // 👈 Injects rotation changes captured during dragging phase
        },
      };
      const snappedPosition = getSnappedNodePosition(newNode, nodes, dynamicComponents);
      newNode.position = snappedPosition;

      useCircuitStore.getState().addNode(newNode);
      
      // Reset tracker variables ready for subsequent operations
      activeDragRotation.current = 0;
    },
    [dynamicComponents, nodes, screenToFlowPosition]
  );

  const handleNodeDragStop: OnNodeDrag<CircuitNode> = useCallback(
    (_event, node) => {
      const snappedPosition = getSnappedNodePosition(node, nodes, dynamicComponents);
      if (snappedPosition.x === node.position.x && snappedPosition.y === node.position.y) return;

      useCircuitStore.setState((state) => ({
        nodes: state.nodes.map((candidate) =>
          candidate.id === node.id
            ? {
                ...candidate,
                position: snappedPosition,
              }
            : candidate
        ),
      }));
    },
    [dynamicComponents, nodes]
  );

  const setLiveConnectionWaypoints = useCallback((waypoints: WirePoint[]) => {
    connectionWaypointsRef.current = waypoints;
    setConnectionWaypoints(waypoints);
  }, []);

  const setActiveDraftWire = useCallback((draft: DraftWire | null) => {
    draftWireRef.current = draft;
    setDraftWire(draft);
  }, []);

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes, edges }) => {
      setSelection(
        nodes.map((n) => n.id),
        edges.map((e) => e.id)
      );
    },
    [setSelection]
  );

  const isValidConnection = useCallback((connection: { source: string; target: string }) => {
    return connection.source !== connection.target;
  }, []);

  const handleConnectStart = useCallback(() => {
    isDrawingWireRef.current = true;
    connectionStartedAtRef.current = Date.now();
    setLiveConnectionWaypoints([]);
  }, [setLiveConnectionWaypoints]);

  const handleConnectEnd = useCallback(() => {
    window.setTimeout(() => {
      isDrawingWireRef.current = false;
      setLiveConnectionWaypoints([]);
    }, 0);
  }, [setLiveConnectionWaypoints]);

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if ((useCircuitStore.getState() as any).pendingStickyNote) {
        event.preventDefault();
        event.stopPropagation();

        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const newNode: CircuitNode = {
          id: uuidv4(),
          type: 'stickyNote',
          position: {
            x: position.x - 110,
            y: position.y - 32,
          },
          data: {
            componentType: 'stickyNote',
            label: 'Sticky Note',
            properties: {},
            rotation: 0,
            text: 'Write your note here.',
          },
        };

        const store = useCircuitStore.getState();
        store.pushHistory();
        store.addNode(newNode);
        useCircuitStore.setState({ pendingStickyNote: false });
        return;
      }

      if (!isDrawingWireRef.current) return;

      event.preventDefault();
      event.stopPropagation();

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const nextPoint = {
        x: snap(position.x),
        y: snap(position.y),
      };

      setLiveConnectionWaypoints([...connectionWaypointsRef.current, nextPoint]);
    },
    [screenToFlowPosition, setLiveConnectionWaypoints, pendingStickyNote]
  );

  useEffect(() => {
    const addWaypointFromPointer = (event: MouseEvent) => {
      if (!isDrawingWireRef.current || event.button !== 0) return;
      if (Date.now() - connectionStartedAtRef.current < 120) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('.react-flow__pane')) return;
      if (target.closest('.react-flow__handle')) return;

      event.preventDefault();
      event.stopPropagation();

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const nextPoint = {
        x: snap(position.x),
        y: snap(position.y),
      };

      const current = connectionWaypointsRef.current;
      const previous = current[current.length - 1];
      if (previous && previous.x === nextPoint.x && previous.y === nextPoint.y) return;

      setLiveConnectionWaypoints([...current, nextPoint]);
    };

    window.addEventListener('mousedown', addWaypointFromPointer, true);
    return () => window.removeEventListener('mousedown', addWaypointFromPointer, true);
  }, [screenToFlowPosition, setLiveConnectionWaypoints]);

  useEffect(() => {
    const pointFromClient = (clientX: number, clientY: number) => {
      const position = screenToFlowPosition({ x: clientX, y: clientY });
      return { x: snap(position.x), y: snap(position.y) };
    };

    const finishDraftToPin = (nodeId: string, handleId: string) => {
      const current = draftWireRef.current;
      if (!current) return;
      if (current.sourceNode === nodeId && current.sourceHandle === handleId) return;

      const newEdge: CircuitEdge = {
        id: `wire-${uuidv4()}`,
        source: current.sourceNode,
        sourceHandle: current.sourceHandle,
        target: nodeId,
        targetHandle: handleId,
        type: 'wire',
        zIndex: 1000,
        selected: true,
        data: {
          color: wireColor,
          waypoints: current.waypoints,
        },
      };

      const store = useCircuitStore.getState();
      store.pushHistory();
      useCircuitStore.setState((state) => ({
        edges: [...state.edges, newEdge],
      }));
      isDrawingWireRef.current = false;
      setActiveDraftWire(null);
    };

    const startDraftWire = (event: Event) => {
      const pinEvent = event as PinWireEvent;
      if (!pinEvent.detail || pinEvent.detail.nodeId === null) return;
      if (pinEvent.detail.button !== 0) return;

      if (draftWireRef.current) {
        finishDraftToPin(pinEvent.detail.nodeId, pinEvent.detail.handleId);
        return;
      }

      const point = pointFromClient(pinEvent.detail.clientX, pinEvent.detail.clientY);
      isDrawingWireRef.current = true;
      setActiveDraftWire({
        sourceNode: pinEvent.detail.nodeId,
        sourceHandle: pinEvent.detail.handleId,
        sourcePoint: point,
        cursorPoint: point,
        waypoints: [],
      });
    };

    const finishDraftWire = (event: Event) => {
      const pinEvent = event as PinWireEvent;
      if (!pinEvent.detail) return;
      finishDraftToPin(pinEvent.detail.nodeId, pinEvent.detail.handleId);
    };

    const moveDraftWire = (event: MouseEvent) => {
      const current = draftWireRef.current;
      if (!current) return;

      setActiveDraftWire({
        ...current,
        cursorPoint: pointFromClient(event.clientX, event.clientY),
      });
    };

    const lockDraftCorner = (event: MouseEvent) => {
      const current = draftWireRef.current;
      if (!current || event.button !== 0) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const pinTarget = target.closest('[data-circuit-pin-node]');
      if (pinTarget instanceof HTMLElement) {
        const nodeId = pinTarget.dataset.circuitPinNode;
        const handleId = pinTarget.dataset.circuitPinHandle;
        if (nodeId && handleId) {
          event.preventDefault();
          event.stopPropagation();
          finishDraftToPin(nodeId, handleId);
        }
        return;
      }

      // Only intercept clicks on the canvas pane (not on nodes/components)
      if (!target.closest('.react-flow__pane')) return;

      const nextPoint = pointFromClient(event.clientX, event.clientY);
      const previous = current.waypoints[current.waypoints.length - 1] ?? current.sourcePoint;
      if (previous.x === nextPoint.x && previous.y === nextPoint.y) return;

      setActiveDraftWire({
        ...current,
        cursorPoint: nextPoint,
        waypoints: [...current.waypoints, nextPoint],
      });
    };

    const cancelDraftWire = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      isDrawingWireRef.current = false;
      setActiveDraftWire(null);
    };

    window.addEventListener('circuit-wire-pin-down', startDraftWire);
    window.addEventListener('circuit-wire-pin-up', finishDraftWire);
    window.addEventListener('mousemove', moveDraftWire);
    // Use bubble phase (not capture) so node drag mouseup events are not intercepted
    window.addEventListener('mouseup', lockDraftCorner);
    window.addEventListener('keydown', cancelDraftWire);

    return () => {
      window.removeEventListener('circuit-wire-pin-down', startDraftWire);
      window.removeEventListener('circuit-wire-pin-up', finishDraftWire);
      window.removeEventListener('mousemove', moveDraftWire);
      window.removeEventListener('mouseup', lockDraftCorner);
      window.removeEventListener('keydown', cancelDraftWire);
    };
  }, [screenToFlowPosition, setActiveDraftWire, wireColor]);

  // ── Custom Connect Handler: Injects Store Color into New Wires ──
  const handleConnect = useCallback(
    (params: Connection) => {
      const newEdge: CircuitEdge = {
        ...params,
        id: `wire-${uuidv4()}`,
        type: 'wire',
        zIndex: 1000,
        selected: true, // Auto-selects wire upon link placement to show configuration menu hooks
        data: {
          color: wireColor, 
          waypoints: connectionWaypointsRef.current,
        },
      };

      const store = useCircuitStore.getState();
      store.pushHistory();
      useCircuitStore.setState((state) => ({
        edges: [...state.edges, newEdge],
      }));
      isDrawingWireRef.current = false;
      setLiveConnectionWaypoints([]);
    },
    [setLiveConnectionWaypoints, wireColor]
  );

  // Dynamic connection line style matching selected wire color
  const connectionLineStyle = useMemo(
    () => ({
      stroke: wireColor,
      strokeWidth: 2,
    }),
    [wireColor]
  );

  // Dynamic fallback defaults for interactive drawing loops
  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'wire',
      zIndex: 1000,
      data: { color: wireColor, waypoints: [] },
    }),
    [wireColor]
  );

  const ConnectionLine = useCallback(
    (props: ConnectionLineComponentProps) => (
      <SparkConnectionLine {...props} waypoints={connectionWaypoints} />
    ),
    [connectionWaypoints]
  );

  return (
    <ReactFlow
      nodes={visibleNodes}
      edges={visibleEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={handleConnect}
      onConnectStart={handleConnectStart}
      onConnectEnd={handleConnectEnd}
      onClickConnectStart={handleConnectStart}
      onClickConnectEnd={handleConnectEnd}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onNodeDragStop={handleNodeDragStop}
      onPaneClick={handlePaneClick}
      onSelectionChange={onSelectionChange}
      isValidConnection={isValidConnection}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      connectionMode={ConnectionMode.Loose}
      nodesConnectable={false}
      connectOnClick={false}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineStyle={connectionLineStyle}
      connectionLineComponent={ConnectionLine}
      connectionLineContainerStyle={{ zIndex: 6 }}
      elevateEdgesOnSelect
      connectionDragThreshold={1}
      fitView
      snapToGrid
      snapGrid={[20, 20]}
      deleteKeyCode={['Delete', 'Backspace']}
      multiSelectionKeyCode="Shift"
      panActivationKeyCode={null}
      style={{ background: '#f4f5f6' }}
    >
      {draftWire && (
        <ViewportPortal>
          <svg
            className="draft-wire-overlay"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 1,
              height: 1,
              overflow: 'visible',
              pointerEvents: 'none',
            }}
          >
            <SparkWirePath
              fromX={draftWire.sourcePoint.x}
              fromY={draftWire.sourcePoint.y}
              toX={draftWire.cursorPoint.x}
              toY={draftWire.cursorPoint.y}
              color={wireColor}
              waypoints={draftWire.waypoints}
              interactive
              onAddWaypoint={(clientX, clientY) => {
                const current = draftWireRef.current;
                if (!current) return;
                const position = screenToFlowPosition({ x: clientX, y: clientY });
                const nextPoint = { x: snap(position.x), y: snap(position.y) };
                const previous = current.waypoints[current.waypoints.length - 1] ?? current.sourcePoint;
                if (previous.x === nextPoint.x && previous.y === nextPoint.y) return;
                setActiveDraftWire({
                  ...current,
                  cursorPoint: nextPoint,
                  waypoints: [...current.waypoints, nextPoint],
                });
              }}
            />
          </svg>
        </ViewportPortal>
      )}
      {pendingStickyNote && ghostPosition && (
        <ViewportPortal>
          <div
            style={{
              position: 'absolute',
              left: ghostPosition.x,
              top: ghostPosition.y,
              pointerEvents: 'none',
              opacity: 0.6,
              zIndex: 1000,
            }}
          >
            <div className="relative flex flex-col items-center select-none pb-12">
              <div className="relative w-[220px] min-h-[64px] rounded-2xl border-2 border-[#1d70b8] bg-white px-4 py-3 shadow-lg flex items-center justify-center">
                <div className="text-slate-400 text-sm font-medium text-center">
                  Write your note here.
                </div>
                <svg
                  width="24"
                  height="14"
                  viewBox="0 0 24 14"
                  fill="none"
                  className="absolute -bottom-[13px] left-1/2 -translate-x-1/2"
                >
                  <polygon points="2,2 12,12 22,2" fill="white" />
                  <path
                    d="M 2 2 L 12 12 L 22 2"
                    stroke="#1d70b8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line x1="3" y1="2" x2="21" y2="2" stroke="white" strokeWidth="2" />
                </svg>
              </div>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center justify-center">
                <div className="absolute w-8 h-8 rounded-full bg-[#1d70b8]/15 border border-[#1d70b8]/30" />
                <div className="relative z-10 w-5 h-5 rounded-full bg-white border border-slate-800 flex items-center justify-center">
                  <span className="w-2.5 h-0.5 bg-slate-800" />
                </div>
              </div>
            </div>
          </div>
        </ViewportPortal>
      )}
      <Controls
        position="top-left"
        showZoom={false}
        showFitView
        showInteractive={false}
      />
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#94a3b8" />
    </ReactFlow>
  );
}
