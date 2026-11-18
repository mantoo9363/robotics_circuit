// components/quiz/EmptyState.tsx
import React from 'react';
import { FileQuestion, ShieldCheck } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex min-h-[380px] items-center justify-center rounded-lg border border-[#d8e3ec] bg-white text-center shadow-sm">
      <div className="max-w-[430px] p-6">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-[#fff4de] text-[#b7791f]">
          <FileQuestion size={30} />
        </span>
        <h2 className="text-2xl font-black text-[#101828]">No quiz assigned</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#667789]">
          No questions are available yet. When your teacher publishes a quiz, it will appear here automatically.
        </p>
        <div className="mx-auto mt-5 flex max-w-[310px] items-center gap-3 rounded-lg bg-[#f8fbfd] px-4 py-3 text-left">
          <ShieldCheck size={22} className="shrink-0 text-[#007a6a]" />
          <span className="text-xs font-bold leading-5 text-[#526070]">
            Your submitted results will be saved securely in quiz history.
          </span>
        </div>
      </div>
    </div>
  );
}