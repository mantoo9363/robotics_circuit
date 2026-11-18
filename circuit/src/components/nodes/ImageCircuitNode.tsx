/* eslint-disable @next/next/no-img-element */
import { type NodeProps } from '@xyflow/react';
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BaseCircuitNode } from './BaseCircuitNode';
import { getSimulationSocket } from '@cs/lib/socket-client';
import { refreshSimulationFrameFromCurrentCircuit, useCircuitStore } from '@cs/lib/store';
import { getSharedAudioContext } from '@cs/lib/audio';
import { getComponentDefinition, getComponentThumbnail, useDynamicComponentsStore } from '@cs/store/useDynamicComponentsStore';
import type { CircuitNode, DynamicComponentAction, DynamicFieldDefinition } from '@cs/lib/types';

type GasOffset = { x: number; y: number };
type DynamicOverlay = { type: 'text'; value: string } | { type: 'image'; value: string } | null;
type DynamicFieldValues = Record<string, string>;

const GAS_CLOUD_SIZE = { width: 260, height: 210 };
const DEFAULT_GAS_OFFSET: GasOffset = { x: -60, y: -35 };

function getConnectedServoPin(servoNodeId: string) {
  const { nodes, edges } = useCircuitStore.getState();
  const arduinoNode = nodes.find((node) => node.data.componentType === 'arduino');
  if (!arduinoNode) return 10;

  const signalEdge = edges.find((edge) => {
    const servoToArduino =
      edge.source === servoNodeId &&
      edge.sourceHandle === 'signal' &&
      edge.target === arduinoNode.id &&
      typeof edge.targetHandle === 'string' &&
      /^d\d+$/.test(edge.targetHandle);
    const arduinoToServo =
      edge.target === servoNodeId &&
      edge.targetHandle === 'signal' &&
      edge.source === arduinoNode.id &&
      typeof edge.sourceHandle === 'string' &&
      /^d\d+$/.test(edge.sourceHandle);

    return servoToArduino || arduinoToServo;
  });

  const pinHandle =
    signalEdge?.source === arduinoNode.id
      ? signalEdge.sourceHandle
      : signalEdge?.target === arduinoNode.id
        ? signalEdge.targetHandle
        : null;

  return pinHandle ? Number(pinHandle.replace('d', '')) : 10;
}

function buildServoControllerCode(servoPin: number, angle: number, speed: number) {
  const safeAngle = Math.max(0, Math.min(180, Math.round(angle)));
  const safeSpeed = Math.max(1, Math.min(100, Math.round(speed)));
  const offTime = Math.round(2000 - ((safeSpeed - 1) / 99) * 1900);

  return `#include <Servo.h>  // Include the Servo library

int servoPin = ${servoPin};   // Declare the Servo pin
Servo Servo1;        // Create a servo object
int angle = ${safeAngle};
int speedPercent = ${safeSpeed};
int offTime = ${offTime};

void setup() {
  Servo1.attach(servoPin); // Attach the servo to the used pin number
}

void loop() {
  Servo1.write(angle); // Move servo to selected angle
  delay(offTime);      // Higher speed means shorter wait time
}`;
}

function emitServoControl(payload: {
  nodeId: string;
  angle: number;
  speed: number;
  active: boolean;
}) {
  const socket = getSimulationSocket();
  const logPayload = {
    ...payload,
    socketConnected: socket.connected,
    socketId: socket.id,
  };

  console.log('[Servo Control] change requested', logPayload);

  let sent = false;
  const send = () => {
    if (sent) return;
    sent = true;
    console.log('[Servo Control] emitting simulation:servo-control', {
      ...payload,
      socketConnected: socket.connected,
      socketId: socket.id,
    });
    socket.once('simulation:servo-control', (echo: unknown) => {
      console.log('[Servo Control] server echo received', echo);
    });
    socket.emit('simulation:servo-control', payload);
  };

  if (socket.connected) {
    send();
    return;
  }

  socket.once('connect', send);
  socket.once('simulation:ready', send);
  socket.connect();
  console.warn('[Servo Control] socket was disconnected; connecting before emit', logPayload);
}

function isGasOffset(value: unknown): value is GasOffset {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as GasOffset).x === 'number' &&
    typeof (value as GasOffset).y === 'number'
  );
}

function isDynamicFieldValues(value: unknown): value is DynamicFieldValues {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function ImageCircuitNode(props: NodeProps<CircuitNode>) {
  const piezoTimerRef = useRef<number | null>(null);
  // Shared AudioContext to avoid creating/closing many contexts which browsers may throttle.
  // Keep it alive for the page lifetime and resume on user gesture when necessary.
  const sharedAudioContextRef = useRef<AudioContext | null>(null);
  const [dynamicOverlay, setDynamicOverlay] = useState<DynamicOverlay>(null);
  const [servoSvg, setServoSvg] = useState<string | null>(null);
  const [servoControllerOpen, setServoControllerOpen] = useState(false);
  const [servoControllerOffset, setServoControllerOffset] = useState({ x: 0, y: 0 });
  const [displayServoAngle, setDisplayServoAngle] = useState(0);
  const displayServoAngleRef = useRef(0);
  const componentType = props.data.componentType;
  const dynamicComponents = useDynamicComponentsStore((state) => state.components);
  const hydrateDynamicComponents = useDynamicComponentsStore((state) => state.hydrate);
  const imageSrc = getComponentThumbnail(componentType, dynamicComponents);
  const def = getComponentDefinition(componentType, dynamicComponents);
  const simulationModel = def?.simulationModel && def.simulationModel !== 'generic'
    ? def.simulationModel
    : componentType;
  const isSimulating = useCircuitStore((state) => state.isSimulating);
  const simulationBrightness = useCircuitStore(
    (state) => state.simulationFrame?.components[props.id]?.brightness ?? 0
  );
  const componentDamaged = useCircuitStore(
    (state) => state.simulationFrame?.components[props.id]?.telemetry?.burnt === true
  );
  const rgbRed = useCircuitStore(
    (state) => Number(state.simulationFrame?.components[props.id]?.telemetry?.red ?? 0)
  );
  const rgbGreen = useCircuitStore(
    (state) => Number(state.simulationFrame?.components[props.id]?.telemetry?.green ?? 0)
  );
  const rgbBlue = useCircuitStore(
    (state) => Number(state.simulationFrame?.components[props.id]?.telemetry?.blue ?? 0)
  );
  const servoAngle = useCircuitStore((state) => {
    const angle = state.simulationFrame?.components[props.id]?.telemetry?.angle;
    return typeof angle === 'number' ? angle : 0;
  });
  const servoSpeed = useCircuitStore((state) => {
    const speed = state.simulationFrame?.components[props.id]?.telemetry?.speed;
    return typeof speed === 'number' ? speed : Number(props.data.servoControlSpeed ?? 50);
  });
  const piezoFrequency = useCircuitStore((state) => {
    const freq = state.simulationFrame?.components[props.id]?.telemetry?.frequency;
    return typeof freq === 'number' ? freq : 880;
  });
  const maxGasLevel = useCircuitStore((state) =>
    state.nodes.reduce((max, node) => {
      const nodeDef = getComponentDefinition(node.data.componentType, dynamicComponents);
      const nodeModel = nodeDef?.simulationModel && nodeDef.simulationModel !== 'generic'
        ? nodeDef.simulationModel
        : node.data.componentType;
      if (nodeModel !== 'gasSensor') return max;
      return Math.max(max, Number(node.data.properties?.gasLevel?.value ?? 0));
    }, 0)
  );
  // Power-source components report a non-zero brightness (used for voltage display)
  // but should never show the LED glow / drop-shadow effect.
  const POWER_SOURCE_MODELS = new Set([
    'battery9v', 'battery1_5v', 'battery12v', 'battery3v',
    'coincell', 'coinCell', 'powerSupply', 'functionGenerator',
  ]);
  const isPowerSource = POWER_SOURCE_MODELS.has(simulationModel) || POWER_SOURCE_MODELS.has(componentType);
  const componentLit = isSimulating && simulationBrightness > 0.01 && !componentDamaged && !isPowerSource;
  const rgbGlow = simulationModel === 'ledrgb'
    ? {
        red: Math.round(Math.max(0, Math.min(1, rgbRed)) * 255),
        green: Math.round(Math.max(0, Math.min(1, rgbGreen)) * 255),
        blue: Math.round(Math.max(0, Math.min(1, rgbBlue)) * 255),
      }
    : { red: 255, green: 40, blue: 40 };
  const rgbGlowColor = `rgba(${rgbGlow.red}, ${rgbGlow.green}, ${rgbGlow.blue}, 0.9)`;
  const rgbGlowFill = `radial-gradient(circle, rgba(${rgbGlow.red}, ${rgbGlow.green}, ${rgbGlow.blue}, 0.75) 0 18%, rgba(${rgbGlow.red}, ${rgbGlow.green}, ${rgbGlow.blue}, 0.34) 40%, rgba(${rgbGlow.red}, ${rgbGlow.green}, ${rgbGlow.blue}, 0) 72%)`;

  useEffect(() => {
    hydrateDynamicComponents();
  }, [hydrateDynamicComponents]);

  const dynamicBehavior = def?.dynamicBehavior;
  const dynamicFieldValues = isDynamicFieldValues(props.data.dynamicFieldValues)
    ? props.data.dynamicFieldValues
    : {};

  const applyDynamicAction = (action?: DynamicComponentAction) => {
    if (!action || action.kind === 'none') return;
    const textValue = action.text?.trim() || props.data.label;
    const imageValue = action.imageSrc?.trim() || imageSrc;

    if (action.kind === 'showText') {
      setDynamicOverlay({ type: 'text', value: textValue });
      return;
    }
    if (action.kind === 'showImage') {
      setDynamicOverlay({ type: 'image', value: imageValue });
      return;
    }
    if (action.kind === 'toggleText') {
      setDynamicOverlay((current) =>
        current?.type === 'text' && current.value === textValue
          ? null
          : { type: 'text', value: textValue }
      );
      return;
    }
    if (action.kind === 'toggleImage') {
      setDynamicOverlay((current) =>
        current?.type === 'image' && current.value === imageValue
          ? null
          : { type: 'image', value: imageValue }
      );
    }
  };

  useEffect(() => {
    if (!dynamicBehavior) return;
    if (isSimulating) {
      applyDynamicAction(dynamicBehavior.simulationStart);
      return;
    }
    setDynamicOverlay(null);
  }, [dynamicBehavior, isSimulating]);

  useEffect(() => {
    if (simulationModel !== 'servo') return;

    const startAngle = displayServoAngleRef.current;
    const targetAngle = Math.max(0, Math.min(180, servoAngle));
    const delta = targetAngle - startAngle;
    if (Math.abs(delta) < 0.1) return;

    const clampedSpeed = Math.max(1, Math.min(100, servoSpeed));
    const degreesPerSecond = 30 + clampedSpeed * 6.9;
    const duration = Math.max(80, Math.min(1000, (Math.abs(delta) / degreesPerSecond) * 1000));
    const startTime = performance.now();
    let frameId = 0;

    const animate = (time: number) => {
      const progress = Math.min(1, (time - startTime) / duration);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const nextAngle = startAngle + delta * eased;

      displayServoAngleRef.current = nextAngle;
      setDisplayServoAngle(nextAngle);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [simulationModel, servoAngle, servoSpeed]);

  useEffect(() => {
    if (simulationModel !== 'servo' || !imageSrc) return;
    let cancelled = false;

    fetch(imageSrc)
      .then((response) => (response.ok ? response.text() : null))
      .then((svg) => {
        if (!cancelled) setServoSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setServoSvg(null);
      });

    return () => {
      cancelled = true;
    };
  }, [simulationModel, imageSrc]);

  const rotatedServoSvg = useMemo(() => {
    if (simulationModel !== 'servo' || !servoSvg) return null;
    const angle = Math.max(0, Math.min(180, displayServoAngle));

    return servoSvg
      .replace(
        /class="cgfx__servohorn cgfx__eg-servohorn"\s+transform="[^"]+"/,
        `class="cgfx__servohorn cgfx__eg-servohorn" transform="translate(0, 87.5) rotate(${angle}, 0,0)"`
      )
      .replace(
        /class="cgfx__servowheel cgfx__eg-servohorn"\s+transform="[^"]+"/,
        `class="cgfx__servowheel cgfx__eg-servohorn" transform="translate(0, 87.5) rotate(${angle}, 0,0)"`
      );
  }, [simulationModel, displayServoAngle, servoSvg]);

  useEffect(() => {
    if (simulationModel !== 'piezo' || !componentLit) {
      if (piezoTimerRef.current) {
        window.clearInterval(piezoTimerRef.current);
        piezoTimerRef.current = null;
      }
      return;
    }

    const playWarningBeep = () => {
      try {
        const context = getSharedAudioContext();
        if (!context) return;

        // Resume context if suspended (browser may suspend when inactive)
        if (context.state === 'suspended') void context.resume();

        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(piezoFrequency, context.currentTime);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.2);
      } catch {
        // Browser may block audio until the page has received a user gesture.
      }
    };

    const gasRatio = Math.max(0, Math.min(1, maxGasLevel / 1023));
    const beepInterval = Math.round(850 - gasRatio * 620);

    playWarningBeep();
    piezoTimerRef.current = window.setInterval(playWarningBeep, beepInterval);

    return () => {
      if (piezoTimerRef.current) {
        window.clearInterval(piezoTimerRef.current);
        piezoTimerRef.current = null;
      }
    };
  }, [componentLit, simulationModel, maxGasLevel, piezoFrequency]);

  // Auto-activate gas cloud when simulation starts so sensor shows a value immediately
  useEffect(() => {
    if (simulationModel !== 'gasSensor' || !def) return;
    if (!isSimulating) return;
    // Only auto-activate if not already active
    if (props.data.gasCloudActive === true) return;

    const offset = DEFAULT_GAS_OFFSET;
    const cloudCenterX = offset.x + GAS_CLOUD_SIZE.width / 2;
    const cloudCenterY = offset.y + GAS_CLOUD_SIZE.height / 2;
    const sensorCenterX = def.defaultWidth / 2;
    const sensorCenterY = def.defaultHeight / 2;
    const distance = Math.hypot(cloudCenterX - sensorCenterX, cloudCenterY - sensorCenterY);
    const normalized = Math.max(0, 1 - distance / 260);
    const nextLevel = Math.round(normalized * 1023);

    useCircuitStore.setState((state) => {
      const nodes = state.nodes.map((node) => {
        if (node.id !== props.id) return node;
        return {
          ...node,
          data: {
            ...node.data,
            gasCloudActive: true,
            gasCloudOffset: offset,
            properties: {
              ...node.data.properties,
              gasLevel: {
                label: 'Gas Level',
                type: 'number' as const,
                value: nextLevel,
                min: 0,
                max: 1023,
              },
            },
          },
        };
      });

      const simulationFrame = state.simulationFrame
        ? {
            ...state.simulationFrame,
            components: {
              ...state.simulationFrame.components,
              [props.id]: {
                ...(state.simulationFrame.components[props.id] ?? {
                  nodeId: props.id,
                  componentType,
                  label: props.data.label,
                  isPowered: false,
                  brightness: 0,
                  voltage: 0,
                  pins: {},
                  telemetry: {},
                }),
                isPowered: nextLevel > 0,
                brightness: nextLevel / 1023,
                telemetry: {
                  ...(state.simulationFrame.components[props.id]?.telemetry ?? {}),
                  gasLevel: nextLevel,
                },
              },
            },
          }
        : state.simulationFrame;

      return { nodes, simulationFrame };
    });
    refreshSimulationFrameFromCurrentCircuit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulating, simulationModel]);

  if (!def) return null;

  const gasLevel = Number(props.data.properties?.gasLevel?.value ?? 0);
  const gasCloudActive = props.data.gasCloudActive === true;
  const gasVisible = simulationModel === 'gasSensor' && isSimulating && gasCloudActive;
  const gasOffset = isGasOffset(props.data.gasCloudOffset)
    ? props.data.gasCloudOffset
    : DEFAULT_GAS_OFFSET;

  const calculateGasLevel = (offset: GasOffset) => {
    const cloudCenterX = offset.x + GAS_CLOUD_SIZE.width / 2;
    const cloudCenterY = offset.y + GAS_CLOUD_SIZE.height / 2;
    const sensorCenterX = def.defaultWidth / 2;
    const sensorCenterY = def.defaultHeight / 2;
    const distance = Math.hypot(cloudCenterX - sensorCenterX, cloudCenterY - sensorCenterY);
    const normalized = Math.max(0, 1 - distance / 260);
    return Math.round(normalized * 1023);
  };

  const setGasStimulus = (active: boolean, offset: GasOffset) => {
    const nextLevel = active ? calculateGasLevel(offset) : 0;

    useCircuitStore.setState((state) => {
      const nodes = state.nodes.map((node) => {
        if (node.id !== props.id) return node;

        return {
          ...node,
          data: {
            ...node.data,
            gasCloudActive: active,
            gasCloudOffset: offset,
            properties: {
              ...node.data.properties,
              gasLevel: {
                label: 'Gas Level',
                type: 'number' as const,
                value: nextLevel,
                min: 0,
                max: 1023,
              },
            },
          },
        };
      });

      const simulationFrame = state.simulationFrame
        ? {
            ...state.simulationFrame,
            components: {
              ...state.simulationFrame.components,
              [props.id]: {
                ...(state.simulationFrame.components[props.id] ?? {
                  nodeId: props.id,
                  componentType,
                  label: props.data.label,
                  isPowered: false,
                  brightness: 0,
                  voltage: 0,
                  pins: {},
                  telemetry: {},
                }),
                isPowered: nextLevel > 0,
                brightness: nextLevel / 1023,
                telemetry: {
                  ...(state.simulationFrame.components[props.id]?.telemetry ?? {}),
                  gasLevel: nextLevel,
                },
              },
            },
          }
        : state.simulationFrame;

      return { nodes, simulationFrame };
    });
    refreshSimulationFrameFromCurrentCircuit();
  };

  const toggleGasStimulus = (event: React.MouseEvent<HTMLDivElement>) => {
    if (simulationModel !== 'gasSensor') return;
    event.preventDefault();
    event.stopPropagation();
    if (!isSimulating) return;

    setGasStimulus(!gasCloudActive, gasCloudActive ? gasOffset : DEFAULT_GAS_OFFSET);
  };

  const setServoControl = (updates: {
    angle?: number;
    speed?: number;
    active?: boolean;
  }) => {
    const currentAngle = Number(props.data.servoControlAngle ?? servoAngle);
    const currentSpeed = Number(props.data.servoControlSpeed ?? servoSpeed);
    const nextAngle = Math.max(
      0,
      Math.min(180, updates.angle ?? (Number.isFinite(currentAngle) ? currentAngle : 90))
    );
    const nextSpeed = Math.max(
      1,
      Math.min(100, updates.speed ?? (Number.isFinite(currentSpeed) ? currentSpeed : 50))
    );
    const nextActive = updates.active ?? props.data.servoControllerActive === true;

    useCircuitStore.setState((state) => {
      const nodes = state.nodes.map((node) => {
        if (node.id !== props.id) return node;
        return {
          ...node,
          data: {
            ...node.data,
            servoControllerActive: nextActive,
            servoControlAngle: nextAngle,
            servoControlSpeed: nextSpeed,
          },
        };
      });

      const simulationFrame =
          state.simulationFrame && simulationModel === 'servo'
          ? {
              ...state.simulationFrame,
              components: {
                ...state.simulationFrame.components,
                [props.id]: {
                  ...(state.simulationFrame.components[props.id] ?? {
                    nodeId: props.id,
                    componentType,
                    label: props.data.label,
                    isPowered: false,
                    brightness: 0,
                    voltage: 0,
                    pins: {},
                    telemetry: {},
                  }),
                  isPowered: state.isSimulating,
                  brightness: state.isSimulating ? 1 : 0,
                  telemetry: {
                    ...(state.simulationFrame.components[props.id]?.telemetry ?? {}),
                    angle: nextAngle,
                    speed: nextSpeed,
                    manualControl: nextActive,
                  },
                },
              },
            }
          : state.simulationFrame;

      const arduinoCode =
        simulationModel === 'servo' && nextActive
          ? buildServoControllerCode(getConnectedServoPin(props.id), nextAngle, nextSpeed)
          : state.arduinoCode;

      return { nodes, simulationFrame, arduinoCode };
    });

    emitServoControl({
      nodeId: props.id,
      angle: nextAngle,
      speed: nextSpeed,
      active: nextActive,
    });
  };

  const handleServoDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (simulationModel !== 'servo') return;
    event.preventDefault();
    event.stopPropagation();
    if (!isSimulating) return;

    setServoControllerOpen(true);
    setServoControl({
      active: true,
      angle: Number(props.data.servoControlAngle ?? servoAngle) || 90,
      speed: Number(props.data.servoControlSpeed ?? servoSpeed) || 50,
    });
  };

  const handleNodeDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (dynamicBehavior) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (simulationModel === 'gasSensor') {
      toggleGasStimulus(event);
      return;
    }
    if (simulationModel === 'servo') {
      handleServoDoubleClick(event);
    }
  };

  const handleNodeClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dynamicBehavior) return;
    event.stopPropagation();
    useCircuitStore.setState((state) => ({
      nodes: state.nodes.map((node) => ({ ...node, selected: node.id === props.id })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: [props.id],
      selectedEdgeIds: [],
    }));
  };

  const startServoControllerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (simulationModel !== 'servo') return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const initialOffset = servoControllerOffset;

    const moveController = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      setServoControllerOffset({
        x: initialOffset.x + moveEvent.clientX - startX,
        y: initialOffset.y + moveEvent.clientY - startY,
      });
    };

    const stopDragging = () => {
      window.removeEventListener('pointermove', moveController, true);
      window.removeEventListener('pointerup', stopDragging, true);
      window.removeEventListener('pointercancel', stopDragging, true);
    };

    window.addEventListener('pointermove', moveController, true);
    window.addEventListener('pointerup', stopDragging, true);
    window.addEventListener('pointercancel', stopDragging, true);
  };

  const startGasDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (simulationModel !== 'gasSensor' || !isSimulating) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const parent = event.currentTarget.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const grabX = event.clientX - parentRect.left - gasOffset.x;
    const grabY = event.clientY - parentRect.top - gasOffset.y;

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const nextOffset = {
        x: moveEvent.clientX - parentRect.left - grabX,
        y: moveEvent.clientY - parentRect.top - grabY,
      };
      setGasStimulus(true, nextOffset);
    };

    const stopDrag = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', stopDrag, true);
      window.removeEventListener('pointercancel', stopDrag, true);
    };

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('pointerup', stopDrag, true);
    window.addEventListener('pointercancel', stopDrag, true);
  };

  return (
    <BaseCircuitNode
      {...props}
      width={def.defaultWidth}
      height={def.defaultHeight}
      pins={def.pins}
      onClick={handleNodeClick}
      onDoubleClick={handleNodeDoubleClick}
    >
      <div style={{ position: 'relative', width: def.defaultWidth, height: def.defaultHeight }}>
        {simulationModel === 'servo' && isSimulating && servoControllerOpen && (
          <div
            className="servo-controller nodrag nopan"
            style={{
              transform: `translate(calc(-50% + ${servoControllerOffset.x}px), ${servoControllerOffset.y}px)`,
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div
              className="servo-controller-header"
              onPointerDown={startServoControllerDrag}
            >
              <span>Servo Control</span>
              <button
                type="button"
                aria-label="Close servo control"
                title="Close"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setServoControllerOpen(false);
                  setServoControl({ active: false });
                }}
              >
                <X size={14} />
              </button>
            </div>

            <label className="servo-control-row">
              <span>Angle</span>
              <input
                type="range"
                min="0"
                max="180"
                value={Math.round(Number(props.data.servoControlAngle ?? servoAngle ?? 90))}
                onChange={(event) => setServoControl({ active: true, angle: Number(event.target.value) })}
              />
              <input
                type="number"
                min="0"
                max="180"
                value={Math.round(Number(props.data.servoControlAngle ?? servoAngle ?? 90))}
                onChange={(event) => setServoControl({ active: true, angle: Number(event.target.value) || 0 })}
              />
              <small>deg</small>
            </label>

            <label className="servo-control-row">
              <span>Speed</span>
              <input
                type="range"
                min="1"
                max="100"
                value={Math.round(Number(props.data.servoControlSpeed ?? servoSpeed ?? 50))}
                onChange={(event) => setServoControl({ active: true, speed: Number(event.target.value) })}
              />
              <input
                type="number"
                min="1"
                max="100"
                value={Math.round(Number(props.data.servoControlSpeed ?? servoSpeed ?? 50))}
                onChange={(event) => setServoControl({ active: true, speed: Number(event.target.value) || 1 })}
              />
              <small>%</small>
            </label>
          </div>
        )}

        {gasVisible && (
          <div
            className="gas-cloud-drag-zone nodrag nopan"
            onPointerDownCapture={startGasDrag}
            style={{
              left: gasOffset.x,
              top: gasOffset.y,
              width: GAS_CLOUD_SIZE.width,
              height: GAS_CLOUD_SIZE.height,
            }}
            title="Drag gas closer or farther from sensor"
          >
            <div className="gas-cloud gas-cloud-a" />
            <div className="gas-cloud gas-cloud-b" />
            <div className="gas-value">{gasLevel}</div>
            <div className="gas-drag-chip">drag gas</div>
          </div>
        )}

        {simulationModel === 'servo' && rotatedServoSvg ? (
          <div
            className="servo-inline-svg"
            style={{
              width: def.defaultWidth,
              height: def.defaultHeight,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            dangerouslySetInnerHTML={{ __html: rotatedServoSvg }}
          />
        ) : imageSrc ? (
          <>
            {(simulationModel === 'led' || simulationModel === 'ledrgb') && componentLit && (
              <div className="component-led-glow" style={{ background: rgbGlowFill }} />
            )}
            {(simulationModel === 'led' || simulationModel === 'ledrgb') && componentDamaged && (
              <div className="component-burn-effect">
                <span className="burn-spark burn-spark-a" />
                <span className="burn-spark burn-spark-b" />
                <span className="burn-smoke burn-smoke-a" />
                <span className="burn-smoke burn-smoke-b" />
                <strong>BURNT</strong>
              </div>
            )}
            {simulationModel === 'piezo' && componentLit && (
              <div className="piezo-active">
                <span />
                <span />
                <span />
              </div>
            )}
            <img
              src={imageSrc?.endsWith('.svg') ? `${imageSrc}?v=2026` : imageSrc}
              alt={def.label}
              width={def.defaultWidth}
              height={def.defaultHeight}
              style={{
                width: def.defaultWidth,
                height: def.defaultHeight,
                display: 'block',
                objectFit: 'contain',
                pointerEvents: 'none',
                userSelect: 'none',
                filter: componentDamaged
                  ? 'grayscale(1) brightness(0.48) contrast(1.35) sepia(0.65) drop-shadow(0 0 7px rgba(0, 0, 0, 0.75))'
                  : componentLit
                  ? `brightness(${1 + simulationBrightness * 0.7}) saturate(${1 + simulationBrightness * 1.2}) drop-shadow(0 0 ${Math.round(8 + simulationBrightness * 14)}px ${rgbGlowColor})`
                  : undefined,
              }}
              draggable={false}
            />
          </>
        ) : (
          <svg
            width={def.defaultWidth}
            height={def.defaultHeight}
            viewBox={`0 0 ${def.defaultWidth} ${def.defaultHeight}`}
            style={{ display: 'block' }}
          >
            <rect
              x="0"
              y="0"
              width={def.defaultWidth}
              height={def.defaultHeight}
              rx="4"
              fill="#f7f8fa"
              stroke="#cbd5e1"
            />
            <text
              x={def.defaultWidth / 2}
              y={def.defaultHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="12"
              fill="#334155"
            >
              {def.label}
            </text>
          </svg>
        )}

        {simulationModel === 'gasSensor' && isSimulating && !gasVisible && (
          <div className="gas-hint">dbl click</div>
        )}

        {dynamicOverlay && (
          <div className="dynamic-overlay nodrag nopan">
            {dynamicOverlay.type === 'text' ? (
              <span>{dynamicOverlay.value}</span>
            ) : (
              <img src={dynamicOverlay.value} alt="" draggable={false} />
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .gas-cloud-drag-zone {
          position: absolute;
          border-radius: 50%;
          cursor: grab;
          z-index: 3;
          pointer-events: auto;
          touch-action: none;
          user-select: none;
        }

        .dynamic-overlay {
          position: absolute;
          left: 50%;
          top: calc(100% + 8px);
          transform: translateX(-50%);
          min-width: 92px;
          max-width: 180px;
          border: 1px solid rgba(47, 128, 255, 0.45);
          background: rgba(255, 255, 255, 0.96);
          color: #172033;
          border-radius: 6px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
          padding: 7px 9px;
          z-index: 30;
          pointer-events: none;
          text-align: center;
        }


        .dynamic-overlay span {
          display: block;
          overflow-wrap: anywhere;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.25;
        }

        .dynamic-overlay img {
          display: block;
          width: 100%;
          max-height: 96px;
          object-fit: contain;
        }

        .servo-inline-svg :global(svg) {
          display: block;
          width: 100%;
          height: 100%;
        }

        .servo-controller {
          position: absolute;
          left: 50%;
          top: calc(100% + 14px);
          width: 240px;
          background: #ffffff;
          border: 1px solid rgba(148, 163, 184, 0.45);
          border-radius: 8px;
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.18);
          overflow: hidden;
          z-index: 20;
          pointer-events: auto;
          color: #172033;
        }

        .servo-controller-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #2f80ff;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          line-height: 1;
          padding: 9px 10px;
          cursor: grab;
          user-select: none;
          touch-action: none;
        }

        .servo-controller-header:active {
          cursor: grabbing;
        }

        .servo-controller-header button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: 0;
          border-radius: 4px;
          background: transparent;
          color: #ffffff;
          cursor: pointer;
        }

        .servo-controller-header button:hover {
          background: rgba(255, 255, 255, 0.16);
        }

        .servo-control-row {
          display: grid;
          grid-template-columns: 46px 1fr 50px 24px;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-top: 1px solid #eef2f7;
          font-size: 12px;
        }

        .servo-control-row span {
          color: #475569;
          font-weight: 600;
        }

        .servo-control-row input[type='range'] {
          width: 100%;
          accent-color: #2f80ff;
        }

        .servo-control-row input[type='number'] {
          width: 50px;
          border: 1px solid #bfdbfe;
          border-radius: 4px;
          background: #eff6ff;
          color: #0f172a;
          font-size: 12px;
          padding: 4px 5px;
        }

        .servo-control-row small {
          color: #64748b;
          font-size: 11px;
        }

        .gas-cloud-drag-zone:active {
          cursor: grabbing;
        }

        .gas-cloud {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 48%, rgba(44, 44, 44, 0.72) 0 18%, rgba(90, 90, 90, 0.46) 28%, rgba(150, 150, 150, 0.28) 48%, rgba(210, 210, 210, 0) 72%),
            radial-gradient(circle at 27% 39%, rgba(80, 80, 80, 0.45) 0 18%, rgba(180, 180, 180, 0) 44%),
            radial-gradient(circle at 72% 35%, rgba(90, 90, 90, 0.42) 0 18%, rgba(190, 190, 190, 0) 46%);
          filter: blur(8px);
          opacity: 0.86;
          animation: gas-pulse 2.1s ease-in-out infinite;
          z-index: 0;
        }

        .gas-cloud-b {
          left: 24px;
          top: -28px;
          width: 220px;
          height: 180px;
          opacity: 0.46;
          animation-delay: 0.55s;
        }

        .gas-value {
          position: absolute;
          left: -12px;
          top: -18px;
          border: 2px solid #0b96d0;
          background: #ffffff;
          color: #0f304a;
          font-size: 14px;
          line-height: 1;
          padding: 4px 7px;
          border-radius: 3px;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
          pointer-events: none;
          z-index: 2;
        }

        .gas-drag-chip {
          position: absolute;
          left: 50%;
          bottom: 24px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(15, 23, 42, 0.18);
          color: #334155;
          font-size: 11px;
          line-height: 1;
          padding: 5px 9px;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.16);
          pointer-events: none;
          z-index: 2;
        }

        .gas-hint {
          position: absolute;
          left: 50%;
          top: -18px;
          transform: translateX(-50%);
          color: #64748b;
          font-size: 10px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0.75;
        }

        .component-led-glow {
          position: absolute;
          left: 50%;
          top: 38%;
          width: 54px;
          height: 54px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 38, 38, 0.75) 0 18%, rgba(255, 74, 74, 0.34) 40%, rgba(255, 74, 74, 0) 72%);
          filter: blur(4px);
          pointer-events: none;
          z-index: 1;
        }

        .component-burn-effect {
          position: absolute;
          inset: -18px;
          pointer-events: none;
          z-index: 3;
        }

        .component-burn-effect strong {
          position: absolute;
          left: 50%;
          top: -8px;
          transform: translateX(-50%);
          border-radius: 3px;
          background: rgba(17, 24, 39, 0.9);
          color: #fef3c7;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0;
          line-height: 1;
          padding: 4px 5px;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.28);
        }

        .burn-spark {
          position: absolute;
          left: 50%;
          top: 34%;
          width: 34px;
          height: 34px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 237, 113, 0.95) 0 12%, rgba(249, 115, 22, 0.72) 24%, rgba(239, 68, 68, 0) 64%);
          animation: burn-flash 0.58s ease-in-out infinite;
        }

        .burn-spark-b {
          width: 46px;
          height: 46px;
          opacity: 0.55;
          animation-delay: 0.18s;
        }

        .burn-smoke {
          position: absolute;
          left: 50%;
          top: 28%;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(55, 65, 81, 0.58), rgba(55, 65, 81, 0));
          filter: blur(2px);
          animation: burn-smoke 1.5s ease-out infinite;
        }

        .burn-smoke-b {
          left: 60%;
          animation-delay: 0.45s;
        }

        .piezo-active {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 2;
        }

        .piezo-active span {
          position: absolute;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: 3px solid rgba(56, 189, 248, 0.72);
          animation: piezo-ring 1.05s ease-out infinite;
        }

        .piezo-active span:nth-child(2) {
          animation-delay: 0.25s;
        }

        .piezo-active span:nth-child(3) {
          animation-delay: 0.5s;
        }

        @keyframes piezo-ring {
          0% {
            transform: scale(0.55);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.65);
            opacity: 0;
          }
        }

        @keyframes burn-flash {
          0%, 100% {
            opacity: 0.42;
            transform: translate(-50%, -50%) scale(0.82);
          }
          50% {
            opacity: 0.9;
            transform: translate(-50%, -50%) scale(1.08);
          }
        }

        @keyframes burn-smoke {
          0% {
            opacity: 0;
            transform: translate(-50%, 12px) scale(0.65);
          }
          18% {
            opacity: 0.72;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -28px) scale(1.5);
          }
        }

        @keyframes gas-pulse {
          0%, 100% {
            transform: translate(0, 0) scale(0.95);
            opacity: 0.58;
          }
          50% {
            transform: translate(8px, -5px) scale(1.06);
            opacity: 0.9;
          }
        }
      `}</style>
    </BaseCircuitNode>
  );
}
