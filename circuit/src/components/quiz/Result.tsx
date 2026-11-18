import React from 'react';
import { Trophy, Clock } from 'lucide-react';
import { QuizAttempt } from '../../types/quiz';
import { formatDuration } from '../../lib/quiz-utils';

interface ResultProps {
  attempt: QuizAttempt;
  score: number;
  total: number;
  percentage: number;
  isPending?: boolean;
}

export function Result({ attempt, score, total, percentage, isPending }: ResultProps) {
  if (isPending) {
    return (
      <div className="rounded-lg border border-[#f0e6b0] bg-[#fdf8e6] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-white text-[#b7791f] shadow-sm">
            <Clock size={26} />
          </span>
          <div>
            <h2 className="text-2xl font-black text-[#101828]">Result Pending</h2>
            <p className="mt-1 text-sm font-semibold text-[#667789]">
              Your answers have been submitted and saved. Evaluation is still in progress —
              your score will appear here once it&apos;s ready.
            </p>
            <p className="mt-1 text-xs font-bold text-[#667789]">
              Solve time: {formatDuration(attempt?.timeToSolveSeconds)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#cfe5d5] bg-[#f7fcf8] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-white text-[#1f7a37] shadow-sm">
            <Trophy size={26} />
          </span>
          <div>
            <h2 className="text-2xl font-black text-[#101828]">Quiz Submitted Successfully!</h2>
            <p className="mt-1 text-sm font-semibold text-[#667789]">
              You scored {score} out of {total}.
            </p>
            <p className="mt-1 text-xs font-bold text-[#667789]">
              Solve time: {formatDuration(attempt?.timeToSolveSeconds)}
            </p>
            {attempt?.questionTimings && attempt.questionTimings.length > 0 && (
              <p className="mt-1 text-xs font-bold text-[#667789]">
                Avg time per question:{' '}
                {formatDuration(
                  Math.round(
                    attempt.questionTimings.reduce((sum, t) => sum + t.timeSpentSeconds, 0) /
                      attempt.questionTimings.length
                  )
                )}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-lg bg-[#e9f5fb] px-5 py-3 text-center">
          <div className="text-xs font-black uppercase text-[#006aa0]">Score</div>
          <div className="text-3xl font-black text-[#101828]">{percentage}%</div>
        </div>
      </div>
    </div>
  );
}