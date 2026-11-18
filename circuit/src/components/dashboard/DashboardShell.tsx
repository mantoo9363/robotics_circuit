'use client';

import { useState } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { DashboardSidebar } from './DashboardSidebar';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarVisible, setSidebarVisible] = useState(true);

  return (
    <div className="min-h-screen bg-[#f3f6f8] text-[#111827]">
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

      <main className={`${sidebarVisible ? 'ml-[220px]' : 'ml-0'} transition-[margin] duration-200`}>
        {children}
      </main>
    </div>
  );
}
