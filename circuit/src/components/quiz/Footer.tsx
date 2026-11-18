import React from 'react';
import { RotateCcw, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { formatLiveDuration } from '../../lib/quiz-utils';

interface FooterProps {
  answeredCount: number;
  questionsCount: number;
  elapsedSeconds: number;
  progressPercent: number;
  isSubmitted: boolean;
  isPending: boolean;
  submitting: boolean;
  isSubmitDisabled: boolean;
  onRestart: () => void;
}

export function Footer({
  answeredCount,
  questionsCount,
  elapsedSeconds,
  progressPercent,
  isSubmitted,
  isPending,
  submitting,
  isSubmitDisabled,
  onRestart,
}: FooterProps) {
  return (
    <div className="sticky bottom-0 z-20 rounded-lg border border-[#d8e3ec] bg-white p-4 shadow-xl shadow-black/10">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs font-black text-[#526070]">
        <span>
          {answeredCount} of {questionsCount} answered
        </span>
        {!isSubmitted && !isPending && <span>{formatLiveDuration(elapsedSeconds)} elapsed</span>}
        {isSubmitted && <span>✅ Submitted — answers locked</span>}
        {isPending && <span>⏳ Submitting...</span>}
        <span>{progressPercent}% complete</span>
      </div>
      <div className="mb-4 h-2 rounded-full bg-[#e5e9f0]">
        <div
          className={`h-2 rounded-full ${
            isSubmitted
              ? 'bg-[#1f7a37]'
              : isPending
              ? 'bg-[#b7791f] animate-pulse'
              : 'bg-[#006aa0]'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        {!isSubmitted && !isPending && (
          <button
            type="button"
            onClick={onRestart}
            className="flex h-10 items-center gap-2 rounded-md border border-[#cbd7e1] bg-white px-4 text-sm font-black text-[#425466] transition hover:bg-[#f6fafc]"
          >
            <RotateCcw size={17} />
            Reset
          </button>
        )}
        {!isSubmitted && !isPending && (
          <button
            type="submit"
            disabled={submitting || isSubmitDisabled}
            className="flex h-10 items-center gap-2 rounded-md bg-[#006aa0] px-5 text-sm font-black text-white transition hover:bg-[#005a8a] disabled:bg-[#9aa8b4] disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            {submitting ? 'Saving...' : 'Submit quiz'}
          </button>
        )}
        {isSubmitted && (
          <div className="flex h-10 items-center gap-2 rounded-md bg-[#edf7ed] px-5 text-sm font-black text-[#1f7a37]">
            <CheckCircle2 size={17} />
            Quiz submitted — this is your final review
          </div>
        )}
        {isPending && (
          <button
            type="button"
            disabled
            className="flex h-10 items-center gap-2 rounded-md bg-[#b7791f] px-5 text-sm font-black text-white cursor-not-allowed"
          >
            <Loader2 size={17} className="animate-spin" />
            Submitting...
          </button>
        )}
      </div>
    </div>
  );
}