import { DashboardShell } from './DashboardShell';

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <DashboardShell>
      <div className="mx-auto max-w-[960px] px-6 py-10">
        <div className="rounded-lg border border-[#d9e3ec] bg-white p-8 shadow-sm">
          <h1 className="text-[32px] font-bold tracking-[0] text-black">{title}</h1>
          <p className="mt-3 max-w-[560px] text-base leading-7 text-[#1f2937]">{description}</p>
        </div>
      </div>
    </DashboardShell>
  );
}
