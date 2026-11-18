'use client';
 
import { useEffect, useRef, useState, Suspense } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { CircuitEditor } from '@cs/components/circuit-editor/CircuitEditor';
import { DashboardSidebar } from '@cs/components/dashboard/DashboardSidebar';
import type { CircuitPreset } from '@cs/lib/circuit-presets';
import { useCircuitStore } from '@cs/lib/store';
import type { CircuitEdge, CircuitNode } from '@cs/lib/types';
import { serverApiUrl } from '@cs/lib/server-api';
import { useSearchParams } from 'next/navigation';
import { GlobalSkeleton } from '@cs/components/ui/GlobalSkeleton';
 
type DbCircuit = {
  id: string;
  name: string;
  nodes: unknown;
  edges: unknown;
  arduinoCode?: string;
  picoCode?: string;
  accessMode?: string;
  invitedEmails?: unknown;
};

const AUTH_USER_KEY = 'circuit-studio-auth-user';
const CURRENT_CIRCUIT_ACCESS_KEY = 'circuit-studio-current-circuit-access';

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
 
function CircuitEditorContent() {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const loadedCircuitId = useRef<string | null>(null);
  const searchParams = useSearchParams();
  const circuitId = searchParams.get('circuitId');
 
  useEffect(() => {
    if (circuitId) {
      if (loadedCircuitId.current === circuitId) return;
      loadedCircuitId.current = circuitId;
      const selectedCircuitId = circuitId;
 
      async function loadCircuitFromDb() {
        try {
          const viewerEmail = getStoredUserEmail();
          const path = viewerEmail
            ? `/circuits/${encodeURIComponent(selectedCircuitId)}?viewerEmail=${encodeURIComponent(viewerEmail)}`
            : `/circuits/${encodeURIComponent(selectedCircuitId)}`;
          const response = await fetch(serverApiUrl(path), {
            cache: 'no-store',
          });
          const result = await response.json().catch(() => null);
          const circuit = result?.circuit as DbCircuit | undefined;
 
          if (!response.ok || !circuit) {
            console.warn('[Circuit Editor] Circuit not found', { status: response.status, result });
            return;
          }
 
          const preset: CircuitPreset = {
            id: circuit.id,
            label: circuit.name,
            group: 'Basic',
            nodes: Array.isArray(circuit.nodes) ? (circuit.nodes as CircuitNode[]) : [],
            edges: Array.isArray(circuit.edges) ? (circuit.edges as CircuitEdge[]) : [],
            arduinoCode: typeof circuit.arduinoCode === 'string' ? circuit.arduinoCode : '',
            picoCode: typeof circuit.picoCode === 'string' ? circuit.picoCode : '',
          };
 
          useCircuitStore.getState().loadPreset(preset);
          window.localStorage.setItem(
            CURRENT_CIRCUIT_ACCESS_KEY,
            JSON.stringify({
              accessMode:
                circuit.accessMode === 'private' || circuit.accessMode === 'invite'
                  ? circuit.accessMode
                  : 'public',
              invitedEmails: Array.isArray(circuit.invitedEmails) ? circuit.invitedEmails : [],
            }),
          );
        } catch (error) {
          console.error('[Circuit Editor] DB circuit load failed', error);
        }
      }
 
      void loadCircuitFromDb();
    } else {
      loadedCircuitId.current = null;
      window.localStorage.removeItem(CURRENT_CIRCUIT_ACCESS_KEY);
      useCircuitStore.getState().resetToDefault();
    }
  }, [circuitId]);
 
  return (
    <div className="h-screen overflow-hidden bg-[#f3f6f8]">
      {sidebarVisible ? (
        <DashboardSidebar onHide={() => setSidebarVisible(false)} />
      ) : (
        <button
          onClick={() => setSidebarVisible(true)}
          className="fixed left-4 top-4 z-[120] flex h-10 w-10 items-center justify-center rounded-full border border-[#d0d7df] bg-white text-[#005a95] shadow-md transition hover:bg-[#eef5fa]"
          title="Show sidebar"
        >
          <PanelLeftOpen size={20} />
        </button>
      )}
 
      <main className={`${sidebarVisible ? 'ml-[225px]' : 'ml-0'} h-screen transition-[margin] duration-200`}>
        <CircuitEditor embedded />
      </main>
    </div>
  );
}
 
export default function CurcuitPage() {
  return (
    <Suspense fallback={<GlobalSkeleton variant="page" rows={5} />}>
      <CircuitEditorContent />
    </Suspense>
  );
}
 
 
