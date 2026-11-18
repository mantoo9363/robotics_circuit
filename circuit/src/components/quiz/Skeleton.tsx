// components/quiz/Skeleton.tsx
import React from 'react';

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#dbe6ee] ${className}`} />;
}

export function QuizPageSkeleton() {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-[#d8e3ec] bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div>
            <SkeletonBlock className="h-7 w-36 bg-[#c8dde8]" />
            <SkeletonBlock className="mt-5 h-10 w-72" />
            <SkeletonBlock className="mt-4 h-4 w-full max-w-[620px]" />
            <SkeletonBlock className="mt-2 h-4 w-full max-w-[500px]" />
          </div>
          <div className="rounded-lg bg-[#f7fafc] p-4">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="mt-4 h-24 w-full" />
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-[#d8e3ec] bg-white p-4 shadow-sm">
            <SkeletonBlock className="h-10 w-10" />
            <SkeletonBlock className="mt-4 h-5 w-28" />
            <SkeletonBlock className="mt-3 h-8 w-16" />
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-[#d8e3ec] bg-white p-5 shadow-sm">
        <SkeletonBlock className="h-6 w-44" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-16 w-full" />
          ))}
        </div>
      </section>
    </div>
  );
}