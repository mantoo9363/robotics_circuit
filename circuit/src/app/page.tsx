import { StudioDashboard } from '@cs/components/dashboard/StudioDashboard';
import { serverApiUrl } from '@cs/lib/server-api';

export const dynamic = 'force-dynamic';

async function getDashboardCircuitsFromApi() {
  try {
    const response = await fetch(serverApiUrl('/circuits'), {
      cache: 'no-store',
    });
    
    const result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result?.circuits)) {
      throw new Error('Unable to load circuits from API');
    }

    return {
      circuits: result.circuits.slice(0, 4),
      loadError: false,
    };
  } catch (error) {
    console.error('[Dashboard Circuits] API load failed', error);
    return { circuits: [], loadError: true };
  }
}

export default async function Home() {
  const { circuits, loadError } = await getDashboardCircuitsFromApi();

  return <StudioDashboard circuits={circuits} circuitsLoadError={loadError} />;
}
