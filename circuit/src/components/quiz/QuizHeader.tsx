// components/quiz/QuizHeader.tsx
import React from 'react';
import { ClipboardCheck, ListChecks, Clock3, History, Award } from 'lucide-react';
import { QuizAttempt } from '@cs/types/quiz';

interface QuizHeaderProps {
  questionsCount: number;
  answeredCount: number;
  classAttemptsLength: number;
  latestAttempt: QuizAttempt | null;
  progressPercent: number;
}

export function QuizHeader({ 
  questionsCount, 
  answeredCount, 
  classAttemptsLength, 
  latestAttempt,
  progressPercent 
}: QuizHeaderProps) {
  return (
    <section className="mb-5 overflow-hidden rounded-lg border border-[#d8e3ec] bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="p-6 lg:p-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#cfe0eb] bg-[#f3faf8] px-3 py-1 text-xs font-black uppercase text-[#007a6a]">
            <ClipboardCheck size={15} />
            Student quiz
          </div>
          <h1 className="text-[34px] font-black tracking-[0] text-[#101828]">Take your quiz</h1>
          <p className="mt-2 max-w-[690px] text-sm font-semibold leading-6 text-[#526070]">
            Start a quiz, submit your answers, and review your score in history after submission.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[#e2edf3] bg-[#f8fbfd] p-4">
              <ListChecks size={22} className="text-[#006aa0]" />
              <div className="mt-3 text-xs font-black uppercase text-[#667789]">Available</div>
              <div className="text-2xl font-black text-[#101828]">{questionsCount}</div>
            </div>
            <div className="rounded-lg border border-[#e2edf3] bg-[#fffaf0] p-4">
              <Clock3 size={22} className="text-[#b7791f]" />
              <div className="mt-3 text-xs font-black uppercase text-[#7a5b18]">Answered</div>
              <div className="text-2xl font-black text-[#101828]">{answeredCount}</div>
            </div>
            <div className="rounded-lg border border-[#e2edf3] bg-[#f1f8f4] p-4">
              <History size={22} className="text-[#1f7a37]" />
              <div className="mt-3 text-xs font-black uppercase text-[#526070]">Completed</div>
              <div className="text-2xl font-black text-[#101828]">{classAttemptsLength}</div>
            </div>
          </div>
        </div>

        <aside className="border-t border-[#e5edf3] bg-[#f8fbfd] p-6 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-[#006aa0] shadow-sm">
              <Award size={23} />
            </span>
            <div>
              <div className="text-xs font-black uppercase text-[#667789]">Latest score</div>
              <div className="text-2xl font-black text-[#101828]">
                {latestAttempt ? `${latestAttempt.percentage}%` : 'Not yet'}
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-lg bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-xs font-black text-[#526070]">
              <span>Current progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-[#e5e9f0]">
              <div className="h-2 rounded-full bg-[#006aa0]" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-[#667789]">
              Complete all sections to submit your quiz.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}