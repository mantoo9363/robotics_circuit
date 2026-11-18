// components/quiz/Timer.tsx
import React from 'react';
import { Clock3, Loader2 } from 'lucide-react';
import { formatLiveDuration } from '../../lib/quiz-utils';

interface TimerProps {
  elapsedSeconds: number;
  isSubmitted: boolean;
  isPending: boolean;
}

export function Timer({ elapsedSeconds, isSubmitted, isPending }: TimerProps) {
  if (isSubmitted) return null;
  if (isPending) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#f0e6b0] bg-[#fdf8e6] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Loader2 size={24} className="animate-spin text-[#b7791f]" />
          <div>
            <div className="text-xs font-black uppercase text-[#b7791f]">Submitting</div>
            <div className="text-sm font-bold text-[#101828]">Please wait...</div>
          </div>
        </div>
        <div className="rounded-lg bg-[#fdf8e6] px-4 py-3 text-sm font-bold text-[#b7791f]">
          ⏳ Processing your answers
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d8e3ec] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#fff4de] text-[#b7791f]">
          <Clock3 size={22} />
        </span>
        <div>
          <div className="text-xs font-black uppercase text-[#667789]">Time running</div>
          <div className="text-2xl font-black text-[#101828]">{formatLiveDuration(elapsedSeconds)}</div>
        </div>
      </div>
      <div className="rounded-lg bg-[#f8fbfd] px-4 py-3 text-sm font-bold text-[#526070]">
        Complete all sections to submit
      </div>
    </div>
  );
}