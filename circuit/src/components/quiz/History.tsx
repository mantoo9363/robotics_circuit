// components/quiz/History.tsx
import React, { useState } from 'react';
import { Trophy, Eye, Clock3 } from 'lucide-react';
import { QuizAttempt } from '../../types/quiz';
import { formatDuration } from '../../lib/quiz-utils';
import { QuizReview } from '../../components/quiz/QuizReview';

interface HistoryProps {
  attempts: QuizAttempt[];
  studentClass: string;
}

export function History({ attempts, studentClass }: HistoryProps) {
  const [selectedAttempt, setSelectedAttempt] = useState<QuizAttempt | null>(null);
  const [showReview, setShowReview] = useState(false);

  const handleReviewClick = (attempt: QuizAttempt) => {
    setSelectedAttempt(attempt);
    setShowReview(true);
  };

  const handleCloseReview = () => {
    setShowReview(false);
    setSelectedAttempt(null);
  };

  if (showReview && selectedAttempt) {
    return (
      <QuizReview
        attempt={selectedAttempt}
        onClose={handleCloseReview}
        studentClass={studentClass}
      />
    );
  }

  return (
    <section className="rounded-lg border border-[#d8e3ec] bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#edf7ed] text-[#1f7a37]">
            <Trophy size={24} />
          </span>
          <div>
            <h2 className="text-2xl font-black text-[#101828]">Quiz history</h2>
            <p className="mt-1 text-sm font-semibold text-[#667789]">
              Click "Review" to see your submitted answers.
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-[#f8fbfd] px-4 py-3 text-sm font-black text-[#526070]">
          {attempts.length} completed
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {attempts.map((attempt) => (
          <div key={attempt.id} className="rounded-lg border border-[#e5edf3] bg-[#f8fbfd] p-4 transition hover:border-[#b9d7e8] hover:bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black text-[#101828]">{attempt.classLevel || 'Class'}</div>
                <div className="mt-1 text-xs font-semibold text-[#667789]">
                  Submitted on {new Date(attempt.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="rounded-md bg-[#e9f5fb] px-3 py-2 text-center">
                <div className="text-xs font-black text-[#006aa0]">Score</div>
                <div className="text-lg font-black text-[#101828]">{attempt.percentage}%</div>
              </div>
            </div>
            <div className="mt-3 text-sm font-bold text-[#526070]">
              {attempt.score} of {attempt.total} correct
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-[#667789]">
              <span className="rounded-full bg-white px-2.5 py-1">{formatDuration(attempt.timeToSolveSeconds)} solve time</span>
              <span className="rounded-full bg-white px-2.5 py-1">{attempt.quizIds?.length ?? 0} questions</span>
            </div>
            <button
              onClick={() => handleReviewClick(attempt)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#006aa0] px-4 py-2 text-sm font-black text-white transition hover:bg-[#005a8a]"
            >
              <Eye size={16} />
              Review Answers
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
