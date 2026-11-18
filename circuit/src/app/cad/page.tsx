import { DashboardShell } from '@cs/components/dashboard/DashboardShell';
import { CAD_SERVER_URL } from '@cs/components/dashboard/routes';

export default function CadPage() {
  return (
    <DashboardShell>
      <div className="h-[calc(100vh-62px)] bg-[#f3f6f8] p-3">
        <iframe
          src={CAD_SERVER_URL}
          title="3D CAD workspace"
          className="h-full w-full rounded-lg border border-[#d0d7df] bg-white shadow-sm"
        />
      </div>
    </DashboardShell>
  );
}
