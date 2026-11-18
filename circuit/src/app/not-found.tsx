import Link from 'next/link';
import { ArrowLeft, Box, CircuitBoard, Home, Plus, Zap } from 'lucide-react';
import { DashboardShell } from '@cs/components/dashboard/DashboardShell';

export default function NotFound() {
  return (
    <DashboardShell>
      <div className="min-h-[calc(100vh-62px)] px-6 py-6">
        <section className="relative min-h-[calc(100vh-110px)] overflow-hidden rounded-xl border border-[#d9e3ec] bg-white shadow-sm">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,106,160,0.06)_1px,transparent_1px),linear-gradient(rgba(0,106,160,0.05)_1px,transparent_1px)] bg-[length:42px_42px]" />
          <div className="relative grid min-h-[calc(100vh-110px)] lg:grid-cols-[48%_52%]">
            <div className="relative min-h-[420px] overflow-hidden bg-[#eef7fc]">
              <div className="absolute left-8 top-8 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#006aa0]">
                <CircuitBoard size={16} />
                Missing circuit route
              </div>

              <div className="absolute left-[9%] top-[27%] h-[3px] w-[48%] bg-[#006aa0]" />
              <div className="absolute left-[31%] top-[27%] h-[32%] w-[3px] bg-[#006aa0]" />
              <div className="absolute left-[31%] top-[59%] h-[3px] w-[31%] bg-[#006aa0]" />
              <div className="absolute left-[52%] top-[18%] h-[3px] w-[24%] bg-[#ef4444]" />
              <div className="absolute left-[52%] top-[18%] h-[40%] w-[3px] bg-[#ef4444]" />
              <div className="absolute left-[10%] top-[23%] h-14 w-14 rounded-full border-[12px] border-[#006aa0] bg-white shadow-sm" />
              <div className="absolute left-[48%] top-[13%] h-12 w-12 rounded-full border-[10px] border-[#ef4444] bg-white shadow-sm" />
              <div className="absolute left-[61%] top-[55%] h-10 w-10 rounded-full border-[8px] border-[#006aa0] bg-white shadow-sm" />

              <div className="absolute bottom-[14%] left-1/2 h-44 w-44 -translate-x-1/2 rotate-45 rounded-xl border border-[#94bad4] bg-[linear-gradient(135deg,#ffffff,#cbe5f5)] shadow-xl">
                <div className="absolute inset-6 rounded-lg border border-[#7fa9c5]" />
                <div className="absolute left-1/2 top-[-38px] h-16 w-[3px] -translate-x-1/2 bg-[#7fa9c5]" />
                <div className="absolute left-1/2 top-[-62px] flex h-12 w-12 -translate-x-1/2 -rotate-45 items-center justify-center rounded-full bg-white text-[#006aa0] shadow">
                  <Box size={22} />
                </div>
              </div>

              <div className="absolute bottom-8 left-8 rounded-full bg-[#172033] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white">
                Not connected
              </div>
            </div>

            <div className="flex min-h-[520px] flex-col justify-center px-8 py-12 lg:px-14">
              <div className="flex items-center gap-4">
                <div className="text-[88px] font-black leading-none tracking-[0] text-[#006aa0]">
                  404
                </div>
                <div className="h-16 w-px bg-[#d9e3ec]" />
                <div className="text-sm font-bold uppercase tracking-[0.22em] text-[#006aa0]">
                  Page not found
                </div>
              </div>

              <h1 className="mt-7 max-w-[540px] text-[42px] font-bold leading-tight tracking-[0] text-black">
                This circuit or CAD page is not available
              </h1>
              <p className="mt-5 max-w-[560px] text-[17px] leading-8 text-[#334155]">
                The link you opened does not match any project, class, circuit, or 3D design in this workspace.
                It may be mistyped, deleted, or moved to a different location.
              </p>

              <div className="mt-7 grid max-w-[560px] gap-3 rounded-lg border border-[#d9e3ec] bg-[#f8fbfd] p-4 text-sm text-[#334155]">
                <div className="flex gap-3">
                  <CircuitBoard size={18} className="mt-0.5 shrink-0 text-[#006aa0]" />
                  <span>Check the URL if you typed it manually.</span>
                </div>
                <div className="flex gap-3">
                  <Box size={18} className="mt-0.5 shrink-0 text-[#006aa0]" />
                  <span>Open All Projects to find saved circuit and 3D designs.</span>
                </div>
              </div>

              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#006aa0] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#005a8a]"
                >
                  <Home size={17} />
                  Dashboard
                </Link>
                <Link
                  href="/curcuit"
                  className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-[#006aa0] px-5 text-sm font-bold text-[#006aa0] hover:bg-[#eef7fc]"
                >
                  <Zap size={18} />
                  New Circuit
                </Link>
                <Link
                  href="/projects"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d0d7df] px-5 text-sm font-bold text-[#334155] hover:bg-[#f5f7fa]"
                >
                  <ArrowLeft size={17} />
                  All Projects
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
