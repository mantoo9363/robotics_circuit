'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { CircuitsSection, type SavedCircuit } from './CircuitsSection';
import { DashboardShell } from './DashboardShell';
import { DesignsSection } from './DesignsSection';
import { HeroContestCard } from './HeroContestCard';
import { LearningAndClassSection } from './LearningAndClassSection';
import { serverApiUrl } from '@cs/lib/server-api';

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

export function StudioDashboard({
  circuits,
  circuitsLoadError = false,
}: {
  circuits: SavedCircuit[];
  circuitsLoadError?: boolean;
}) {
  const [visibleCircuits, setVisibleCircuits] = useState(circuits);
  const [visibleLoadError, setVisibleLoadError] = useState(circuitsLoadError);

  useEffect(() => {
    const viewerEmail = getStoredUserEmail();
    if (!viewerEmail) return;

    async function loadViewerCircuits() {
      try {
        const response = await fetch(
          serverApiUrl(`/circuits?viewerEmail=${encodeURIComponent(viewerEmail)}`),
          { cache: 'no-store' },
        );
        const result = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(result?.circuits)) {
          throw new Error('Unable to load viewer circuits');
        }
        setVisibleCircuits(result.circuits);
        setVisibleLoadError(false);
      } catch (error) {
        console.error('[Dashboard Circuits] viewer API load failed', error);
        setVisibleLoadError(true);
      }
    }

    void loadViewerCircuits();
  }, []);

  return (
    <DashboardShell>
      <div className="mx-auto px-6 py-6">
        <HeroContestCard />
        <DesignsSection />
        <CircuitsSection circuits={visibleCircuits} loadError={visibleLoadError} />
        {/* <LearningAndClassSection /> */}
      </div>

      <a
        href="/curcuit"
        className="fixed bottom-8 right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#006aa0] text-white shadow-xl transition hover:bg-[#005a8a]"
        title="Create"
      >
        <Plus size={30} />
      </a>
    </DashboardShell>
  );
}
