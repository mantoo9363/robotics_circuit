'use client';

import { useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Circle,
  Send,
  X,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { useArduinoCloudStore } from '@cs/lib/arduino-cloud-store';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ONLINE: 'bg-green-500',
    OFFLINE: 'bg-gray-400',
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    disconnected: 'bg-gray-400',
    error: 'bg-red-500',
  };

  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? 'bg-gray-400'}`} />
  );
}

function ConnectForm({ onConnect }: { onConnect: (id: string, secret: string) => void }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const status = useArduinoCloudStore((s) => s.status);
  const error = useArduinoCloudStore((s) => s.error);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientId.trim() && clientSecret.trim()) {
      onConnect(clientId.trim(), clientSecret.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Client ID</label>
        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Enter Arduino Cloud Client ID"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:border-teal-500"
          disabled={status === 'connecting'}
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Client Secret</label>
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="Enter Arduino Cloud Client Secret"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:border-teal-500"
          disabled={status === 'connecting'}
        />
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded px-2 py-1.5">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={status === 'connecting' || !clientId.trim() || !clientSecret.trim()}
        className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white text-sm font-medium py-2 rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === 'connecting' ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Wifi size={14} />
            Connect
          </>
        )}
      </button>
      <p className="text-[10px] text-gray-400 text-center leading-tight">
        Get API credentials from{' '}
        <a
          href="https://cloud.arduino.cc"
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-600 hover:underline inline-flex items-center gap-0.5"
        >
          Arduino Cloud <ExternalLink size={8} />
        </a>
      </p>
    </form>
  );
}

function DeviceList() {
  const devices = useArduinoCloudStore((s) => s.devices);

  if (devices.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-2">No devices found</p>;
  }

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Devices</h4>
      {devices.map((device) => (
        <div
          key={device.id}
          className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded text-xs"
        >
          <StatusBadge status={device.status} />
          <span className="text-gray-700 flex-1 truncate">{device.name}</span>
          <span className="text-gray-400 text-[10px]">{device.board}</span>
        </div>
      ))}
    </div>
  );
}

function ThingSelector() {
  const things = useArduinoCloudStore((s) => s.things);
  const selectedThingId = useArduinoCloudStore((s) => s.selectedThingId);
  const selectThing = useArduinoCloudStore((s) => s.selectThing);

  if (things.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-2">No things found</p>;
  }

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Things</h4>
      <select
        value={selectedThingId ?? ''}
        onChange={(e) => e.target.value && selectThing(e.target.value)}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-teal-500"
      >
        <option value="">Select a Thing...</option>
        {things.map((thing) => (
          <option key={thing.id} value={thing.id}>
            {thing.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function PropertyCard({ property }: { property: { id: string; name: string; type: string; permission: string; variable_name: string; last_value: unknown } }) {
  const liveValues = useArduinoCloudStore((s) => s.liveValues);
  const writeProperty = useArduinoCloudStore((s) => s.writeProperty);
  const [editValue, setEditValue] = useState('');
  const [editing, setEditing] = useState(false);

  const varName = property.variable_name || property.name;
  const value = liveValues[varName] ?? property.last_value;
  const isWritable = property.permission === 'READ_WRITE';

  const handleWrite = async () => {
    let parsed: unknown = editValue;
    if (property.type === 'INT') parsed = parseInt(editValue, 10);
    else if (property.type === 'FLOAT') parsed = parseFloat(editValue);
    else if (property.type === 'BOOL') parsed = editValue === 'true' || editValue === '1';

    await writeProperty(property.id, parsed);
    setEditing(false);
    setEditValue('');
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-700 truncate">{property.name}</span>
          <span className="text-[9px] text-gray-400 bg-gray-200 rounded px-1">{property.type}</span>
          {isWritable && (
            <span className="text-[9px] text-teal-600 bg-teal-50 rounded px-1">RW</span>
          )}
        </div>
        <div className="text-xs text-gray-500 font-mono truncate">
          {value !== null && value !== undefined ? String(value) : '—'}
        </div>
      </div>
      {isWritable && (
        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleWrite()}
                className="w-16 border border-teal-400 rounded px-1 py-0.5 text-xs text-gray-800 focus:outline-none"
                autoFocus
                placeholder="value"
              />
              <button
                onClick={handleWrite}
                className="p-0.5 text-teal-600 hover:bg-teal-50 rounded"
                title="Send"
              >
                <Send size={12} />
              </button>
              <button
                onClick={() => setEditing(false)}
                className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <button
              onClick={() => { setEditing(true); setEditValue(String(value ?? '')); }}
              className="text-[10px] text-teal-600 hover:bg-teal-50 px-1.5 py-0.5 rounded"
            >
              Write
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LiveProperties() {
  const properties = useArduinoCloudStore((s) => s.properties);
  const refreshProperties = useArduinoCloudStore((s) => s.refreshProperties);
  const selectedThingId = useArduinoCloudStore((s) => s.selectedThingId);

  if (!selectedThingId) return null;

  if (properties.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-2">No properties found</p>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Live Properties
        </h4>
        <button
          onClick={refreshProperties}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {properties.map((prop) => (
          <PropertyCard key={prop.id} property={prop} />
        ))}
      </div>
    </div>
  );
}

export function ArduinoCloudPanel() {
  const [expanded, setExpanded] = useState(false);
  const status = useArduinoCloudStore((s) => s.status);
  const disconnect = useArduinoCloudStore((s) => s.disconnect);
  const connect = useArduinoCloudStore((s) => s.connect);

  return (
    <div className="absolute bottom-4 left-4 z-50 w-72">
      {/* Header bar - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-t-lg text-sm font-medium transition-colors ${
          expanded ? '' : 'rounded-b-lg'
        } ${
          status === 'connected'
            ? 'bg-teal-600 text-white hover:bg-teal-700'
            : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
        }`}
      >
        {status === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span className="flex-1 text-left">Arduino Cloud</span>
        <StatusBadge status={status} />
        {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg shadow-xl p-3 space-y-3">
          {status === 'disconnected' || status === 'error' || status === 'connecting' ? (
            <ConnectForm
              onConnect={(id, secret) => connect({ clientId: id, clientSecret: secret })}
            />
          ) : (
            <>
              {/* Connected state */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Circle size={8} className="text-green-500 fill-green-500" />
                  <span className="text-xs text-green-700 font-medium">Connected</span>
                </div>
                <button
                  onClick={disconnect}
                  className="text-xs text-red-500 hover:bg-red-50 px-2 py-0.5 rounded transition-colors"
                >
                  Disconnect
                </button>
              </div>

              <DeviceList />
              <ThingSelector />
              <LiveProperties />
            </>
          )}
        </div>
      )}
    </div>
  );
}
