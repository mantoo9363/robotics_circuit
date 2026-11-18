import { create } from 'zustand';
import {
  authenticate,
  clearAuth,
  listDevices,
  listThings,
  listThingProperties,
  writePropertyValue,
  PropertyPoller,
  type ArduinoCredentials,
  type ArduinoDevice,
  type ArduinoThing,
  type ArduinoProperty,
} from './arduino-cloud';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ArduinoCloudStore {
  // Connection state
  status: ConnectionStatus;
  error: string | null;
  accessToken: string | null;
  credentials: ArduinoCredentials | null;

  // Data
  devices: ArduinoDevice[];
  things: ArduinoThing[];
  selectedThingId: string | null;
  properties: ArduinoProperty[];
  liveValues: Record<string, unknown>; // propertyName → latest value

  // Poller
  poller: PropertyPoller | null;

  // Actions
  connect: (credentials: ArduinoCredentials) => Promise<void>;
  disconnect: () => void;
  selectThing: (thingId: string) => Promise<void>;
  writeProperty: (propertyId: string, value: unknown) => Promise<void>;
  refreshProperties: () => Promise<void>;
}

export const useArduinoCloudStore = create<ArduinoCloudStore>((set, get) => ({
  status: 'disconnected',
  error: null,
  accessToken: null,
  credentials: null,

  devices: [],
  things: [],
  selectedThingId: null,
  properties: [],
  liveValues: {},

  poller: null,

  connect: async (credentials) => {
    set({ status: 'connecting', error: null });

    try {
      const token = await authenticate(credentials);

      // Fetch devices and things in parallel
      const [devices, things] = await Promise.all([
        listDevices(token.accessToken),
        listThings(token.accessToken),
      ]);

      set({
        status: 'connected',
        accessToken: token.accessToken,
        credentials,
        devices,
        things,
        error: null,
      });
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'Connection failed',
        accessToken: null,
      });
    }
  },

  disconnect: () => {
    const { poller } = get();
    if (poller) poller.stop();

    clearAuth();
    set({
      status: 'disconnected',
      error: null,
      accessToken: null,
      credentials: null,
      devices: [],
      things: [],
      selectedThingId: null,
      properties: [],
      liveValues: {},
      poller: null,
    });
  },

  selectThing: async (thingId) => {
    const { accessToken, poller: oldPoller } = get();
    if (!accessToken) return;

    // Stop previous polling
    if (oldPoller) oldPoller.stop();

    try {
      const properties = await listThingProperties(accessToken, thingId);
      const liveValues: Record<string, unknown> = {};
      for (const prop of properties) {
        liveValues[prop.variable_name || prop.name] = prop.last_value;
      }

      // Start polling for live updates
      const poller = new PropertyPoller(accessToken, thingId, (updatedProps) => {
        const newValues: Record<string, unknown> = {};
        for (const prop of updatedProps) {
          newValues[prop.variable_name || prop.name] = prop.last_value;
        }
        set({ properties: updatedProps, liveValues: newValues });
      });
      poller.start();

      set({
        selectedThingId: thingId,
        properties,
        liveValues,
        poller,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load properties',
      });
    }
  },

  writeProperty: async (propertyId, value) => {
    const { accessToken, selectedThingId } = get();
    if (!accessToken || !selectedThingId) return;

    try {
      await writePropertyValue(accessToken, selectedThingId, propertyId, value);
    } catch (err) {
      console.error('[ArduinoCloud] Write error:', err);
    }
  },

  refreshProperties: async () => {
    const { accessToken, selectedThingId } = get();
    if (!accessToken || !selectedThingId) return;

    try {
      const properties = await listThingProperties(accessToken, selectedThingId);
      const liveValues: Record<string, unknown> = {};
      for (const prop of properties) {
        liveValues[prop.variable_name || prop.name] = prop.last_value;
      }
      set({ properties, liveValues });
    } catch (err) {
      console.error('[ArduinoCloud] Refresh error:', err);
    }
  },
}));
