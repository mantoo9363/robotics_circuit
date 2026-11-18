type GlobalSkeletonProps = {
  variant?: 'page' | 'table' | 'cards' | 'panel' | 'auth';
  rows?: number;
  className?: string;
};

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#dfe8ef] ${className}`} />;
}

export function GlobalSkeleton({ variant = 'page', rows = 5, className = '' }: GlobalSkeletonProps) {
  if (variant === 'auth') {
    return (
      <main className={`min-h-screen bg-[#eef3f7] text-[#101828] ${className}`}>
        <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
          <section className="flex min-h-[320px] items-center justify-center bg-[#006aa0] px-8 py-10">
            <div className="w-full max-w-[560px]">
              <div className="mb-7 flex items-center gap-3">
                <SkeletonBlock className="h-14 w-14 bg-white/20" />
                <SkeletonBlock className="h-9 w-60 bg-white/25" />
              </div>
              <SkeletonBlock className="h-14 w-full max-w-[520px] bg-white/25" />
              <SkeletonBlock className="mt-4 h-14 w-full max-w-[470px] bg-white/25" />
              <SkeletonBlock className="mt-4 h-14 w-full max-w-[380px] bg-white/25" />
              <SkeletonBlock className="mt-8 h-5 w-full max-w-[520px] bg-white/20" />
              <SkeletonBlock className="mt-4 h-5 w-full max-w-[440px] bg-white/20" />
            </div>
          </section>

          <section className="flex items-center justify-center px-5 py-10">
            <div className="w-full max-w-[430px] rounded-lg border border-[#d8e3ec] bg-white p-6 shadow-sm">
              <SkeletonBlock className="mb-5 h-8 w-44" />
              <SkeletonBlock className="h-10 w-36" />
              <SkeletonBlock className="mt-4 h-4 w-full" />
              <SkeletonBlock className="mt-2 h-4 w-4/5" />

              <div className="mt-8 space-y-4">
                {Array.from({ length: rows }).map((_, index) => (
                  <div key={index}>
                    <SkeletonBlock className="mb-2 h-3 w-24" />
                    <SkeletonBlock className="h-11 w-full" />
                  </div>
                ))}
                <SkeletonBlock className="h-11 w-full bg-[#b7d7e7]" />
                <SkeletonBlock className="mx-auto mt-5 h-4 w-56" />
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (variant === 'table') {
    return (
      <div className={`overflow-hidden rounded-lg border border-[#d8e3ec] bg-white shadow-sm ${className}`}>
        <div className="flex items-center justify-between border-b border-[#e5edf3] px-5 py-4">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-10 w-10" />
            <div>
              <SkeletonBlock className="h-4 w-36" />
              <SkeletonBlock className="mt-2 h-3 w-52" />
            </div>
          </div>
          <SkeletonBlock className="h-10 w-72" />
        </div>
        <div className="p-5">
          <SkeletonBlock className="mb-4 h-9 w-full" />
          <div className="space-y-3">
            {Array.from({ length: rows }).map((_, index) => (
              <div key={index} className="grid grid-cols-[1.4fr_1fr_0.7fr_0.7fr_0.7fr_0.8fr] gap-4">
                <SkeletonBlock className="h-10" />
                <SkeletonBlock className="h-10" />
                <SkeletonBlock className="h-10" />
                <SkeletonBlock className="h-10" />
                <SkeletonBlock className="h-10" />
                <SkeletonBlock className="h-10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="rounded-lg border border-[#d8e3ec] bg-white p-4 shadow-sm">
            <SkeletonBlock className="h-36 w-full" />
            <SkeletonBlock className="mt-4 h-4 w-3/4" />
            <SkeletonBlock className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'panel') {
    return (
      <div className={`space-y-3 rounded-lg border border-[#d8e3ec] bg-white p-4 shadow-sm ${className}`}>
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-10 w-10" />
          <div className="flex-1">
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="mt-2 h-3 w-1/2" />
          </div>
        </div>
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonBlock key={index} className={index === rows - 1 ? 'h-16 w-full' : 'h-10 w-full'} />
        ))}
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#f3f6f8] text-[#111827] ${className}`}>
      <header className="fixed left-0 right-0 top-0 z-[150] flex h-[62px] items-center bg-[#006aa0] px-12 shadow-md">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-10 w-10 bg-white/20" />
          <SkeletonBlock className="h-8 w-32 bg-white/25" />
        </div>
        <SkeletonBlock className="mx-auto h-10 w-[315px] rounded-full bg-white/20" />
        <div className="flex items-center gap-7">
          <SkeletonBlock className="h-10 w-28 rounded-full bg-white" />
          <SkeletonBlock className="h-7 w-7 rounded-full bg-white/25" />
          <SkeletonBlock className="h-10 w-24 rounded-full bg-white/20" />
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-[62px] z-30 w-[222px] border-r border-[#d0d7df] bg-white">
        <div className="flex items-center justify-between px-5 py-5">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-7 w-7" />
        </div>
        <div className="space-y-4 pr-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className={index === 0 ? 'rounded-r-[24px] bg-[#d7e8f3] px-6 py-3' : 'px-6 py-2'}>
              <div className="flex items-center gap-4">
                <SkeletonBlock className="h-6 w-6 bg-[#b9d5e7]" />
                <SkeletonBlock className="h-4 w-28 bg-[#d8e5ee]" />
              </div>
            </div>
          ))}
        </div>
        <div className="mx-6 my-8 border-t border-[#e5e9ef]" />
        <div className="space-y-4 pr-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="px-6 py-2">
              <div className="flex items-center gap-4">
                <SkeletonBlock className="h-6 w-6" />
                <SkeletonBlock className="h-4 w-28" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="ml-[222px] pt-[62px]">
        <div className="px-7 py-6">
          <section className="overflow-hidden rounded-lg border border-[#d8e3ec] bg-white shadow-sm">
            <div className="grid min-h-[290px] lg:grid-cols-[47%_53%]">
              <div className="bg-[#775532] p-7">
                <SkeletonBlock className="mx-auto h-full min-h-[230px] w-[62%] rounded-[36px] bg-[#0d8f8f]/55" />
              </div>
              <div className="flex flex-col justify-center px-9 py-8">
                <SkeletonBlock className="h-5 w-36 bg-[#c9dbe7]" />
                <SkeletonBlock className="mt-8 h-10 w-[62%]" />
                <SkeletonBlock className="mt-5 h-5 w-[86%]" />
                <SkeletonBlock className="mt-3 h-5 w-[76%]" />
                <SkeletonBlock className="mt-8 h-12 w-52 rounded-full bg-[#b7d7e7]" />
              </div>
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-8 w-8 bg-[#b7d7e7]" />
                <SkeletonBlock className="h-9 w-52" />
              </div>
              <SkeletonBlock className="h-5 w-28 bg-[#c9dbe7]" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-lg border border-[#d8e3ec] bg-white shadow-sm">
                  <div className="flex h-[190px] items-center justify-center bg-[#f4f8fb]">
                    <SkeletonBlock className="h-32 w-24 bg-[#d4e1ea]" />
                  </div>
                  <div className="border-t border-[#eef2f5] px-4 py-4">
                    <SkeletonBlock className="h-5 w-40" />
                    <div className="mt-3 flex items-center justify-between">
                      <SkeletonBlock className="h-4 w-20" />
                      <SkeletonBlock className="h-5 w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
