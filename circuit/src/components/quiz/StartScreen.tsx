// components/quiz/StartScreen.tsx
import React from 'react';
import { BookOpen, CheckCircle2, Sparkles, Play, Eye } from 'lucide-react';
import { QuizAttempt, QuizSection } from '../../types/quiz';

interface StartScreenProps {
  questionsCount: number;
  quizSections: QuizSection[];
  quizTitle?: string;
  onStart: () => void;
  completedAttempt?: QuizAttempt | null;
  onReview?: () => void;
}

export function StartScreen({ questionsCount, quizSections, quizTitle, onStart, completedAttempt, onReview }: StartScreenProps) {
  const isCompleted = Boolean(completedAttempt);

  return (
    <section className="grid gap-5 rounded-lg border border-[#d8e3ec] bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-lg bg-[#f8fbfd] p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#e9f5fb] text-[#006aa0]">
            <BookOpen size={29} />
          </span>
          <div>
            {quizTitle && (
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-[#006aa0]">
                {quizTitle}
              </div>
            )}
            <h2 className="text-2xl font-black text-[#101828]">
              {isCompleted ? 'Quiz already submitted' : 'Ready for the quiz?'}
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#667789]">
              {isCompleted
                ? 'You have already solved this quiz. Review your submitted answers.'
                : `${questionsCount} questions are available. Click Start quiz to begin your attempt.`}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="text-xs font-black uppercase text-[#667789]">Sections</div>
            <div className="mt-2 text-xl font-black text-[#101828]">{quizSections.length}</div>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="text-xs font-black uppercase text-[#667789]">Questions</div>
            <div className="mt-2 text-xl font-black text-[#101828]">{questionsCount}</div>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="text-xs font-black uppercase text-[#667789]">Status</div>
            <div className="mt-2 text-xl font-black text-[#007a6a]">
              {isCompleted ? 'Solved' : 'Open'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={isCompleted ? onReview : onStart}
          className="mt-5 inline-flex h-12 items-center gap-2 rounded-md bg-[#006aa0] px-6 text-sm font-black text-white shadow-sm transition hover:bg-[#005a8a]"
        >
          {isCompleted ? <Eye size={18} /> : <Play size={18} />}
          {isCompleted ? 'Review quiz' : 'Start quiz'}
        </button>
      </div>
      <aside className="rounded-lg border border-[#e5edf3] bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-[#101828]">
          <Sparkles size={19} className="text-[#b7791f]" />
          Before you begin
        </div>
        {[
          'Complete each section before moving to the next.',
          'Your final score is saved after submission.',
          'Submitted quizzes move to history.',
        ].map((item) => (
          <div key={item} className="mb-3 flex gap-3 last:mb-0">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#1f7a37]" />
            <p className="text-sm font-semibold leading-5 text-[#526070]">{item}</p>
          </div>
        ))}
      </aside>
    </section>
  );
}
