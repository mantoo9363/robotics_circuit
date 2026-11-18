/**
 * Arduino IoT Cloud API integration.
 * Uses direct fetch calls to the Arduino REST API.
 *
 * Auth: OAuth2 client_credentials → https://api2.arduino.cc/iot/v1/clients/token
 * API:  https://api2.arduino.cc/iot/v2/...
 *
 * To get credentials:
 * 1. Go to https://cloud.arduino.cc
 * 2. Navigate to API Keys section
 * 3. Generate a new API key (client_id + client_secret)
 */

const AUTH_URL = 'https://api2.arduino.cc/iot/v1/clients/token';
const API_BASE = 'https://api2.arduino.cc/iot/v2';

// ---- Types ----

export interface ArduinoCredentials {
  clientId: string;
  clientSecret: string;
}

export interface ArduinoToken {
  accessToken: string;
  expiresAt: number; // timestamp
}

export interface ArduinoDevice {
  id: string;
  name: string;
  board: string;
  serial: string;
  status: string; // "ONLINE" | "OFFLINE"
  thing_id?: string;
}

export interface ArduinoThing {
  id: string;
  name: string;
  device_id?: string;
  properties: ArduinoProperty[];
}

export interface ArduinoProperty {
  id: string;
  name: string;
  type: string; // "INT", "FLOAT", "BOOL", "STRING", "CHARSTRING"
  permission: string; // "READ_ONLY" | "READ_WRITE"
  last_value: unknown;
  update_strategy: string;
  variable_name: string;
}

// ---- Authentication ----

let cachedToken: ArduinoToken | null = null;

export async function authenticate(credentials: ArduinoCredentials): Promise<ArduinoToken> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    audience: 'https://api2.arduino.cc/iot',
  });

  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Authentication failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 300) * 1000,
  };

  return cachedToken;
}

export function clearAuth() {
  cachedToken = null;
}

// ---- API helpers ----

async function apiGet<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

async function apiPut<T>(path: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

// ---- Devices ----

export async function listDevices(token: string): Promise<ArduinoDevice[]> {
  return apiGet<ArduinoDevice[]>('/devices', token);
}

export async function getDevice(token: string, deviceId: string): Promise<ArduinoDevice> {
  return apiGet<ArduinoDevice>(`/devices/${deviceId}`, token);
}

export async function getDeviceProperties(
  token: string,
  deviceId: string
): Promise<ArduinoProperty[]> {
  return apiGet<ArduinoProperty[]>(`/devices/${deviceId}/properties`, token);
}

// ---- Things ----

export async function listThings(token: string): Promise<ArduinoThing[]> {
  return apiGet<ArduinoThing[]>('/things', token);
}

export async function getThing(token: string, thingId: string): Promise<ArduinoThing> {
  return apiGet<ArduinoThing>(`/things/${thingId}`, token);
}

export async function listThingProperties(
  token: string,
  thingId: string
): Promise<ArduinoProperty[]> {
  return apiGet<ArduinoProperty[]>(`/things/${thingId}/properties`, token);
}

// ---- Properties (read/write) ----

export async function getPropertyValue(
  token: string,
  thingId: string,
  propertyId: string
): Promise<ArduinoProperty> {
  return apiGet<ArduinoProperty>(`/things/${thingId}/properties/${propertyId}`, token);
}

export async function writePropertyValue(
  token: string,
  thingId: string,
  propertyId: string,
  value: unknown
): Promise<void> {
  await apiPut(`/things/${thingId}/properties/${propertyId}/publish`, token, {
    value,
  });
}

// ---- Polling helper ----

export class PropertyPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onUpdate: (properties: ArduinoProperty[]) => void;
  private token: string;
  private thingId: string;
  private intervalMs: number;

  constructor(
    token: string,
    thingId: string,
    onUpdate: (properties: ArduinoProperty[]) => void,
    intervalMs: number = 2000
  ) {
    this.token = token;
    this.thingId = thingId;
    this.onUpdate = onUpdate;
    this.intervalMs = intervalMs;
  }

  start() {
    this.poll(); // immediate first poll
    this.intervalId = setInterval(() => this.poll(), this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  updateToken(token: string) {
    this.token = token;
  }

  private async poll() {
    try {
      const properties = await listThingProperties(this.token, this.thingId);
      this.onUpdate(properties);
    } catch (err) {
      console.error('[ArduinoCloud] Poll error:', err);
    }
  }
}
