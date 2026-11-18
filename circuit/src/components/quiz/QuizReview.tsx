import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, Clock3, FileQuestion, Hourglass, Target, XCircle } from 'lucide-react';
import { QuizAttempt, QuizSection } from '@cs/types/quiz';
import { serverApiUrl, serverAssetUrl } from '@cs/lib/server-api';
import { formatDuration, normalizeOptions } from '@cs/lib/quiz-utils';
import { useGetter } from '@cs/hooks/getter';

interface QuizReviewProps {
  attempt: QuizAttempt;
  onClose: () => void;
  studentClass: string;
}

export function QuizReview({ attempt, studentClass }: QuizReviewProps) {
  const [sections, setSections] = useState<QuizSection[]>([]);
  const [reviewAttempt, setReviewAttempt] = useState<QuizAttempt>(attempt);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { callGetter } = useGetter();

  const loadedQuestionCount = sections.reduce((sum, section) => sum + (section.questions?.length ?? 0), 0);
  const totalQuestions = loadedQuestionCount || reviewAttempt.quizIds?.length || reviewAttempt.total || 0;
  const obtainedMarks = Number(reviewAttempt.score ?? 0);
  const totalMarks =
    sections.reduce(
      (sum, section) =>
        sum + (section.questions ?? []).reduce((questionSum, question: any) => questionSum + Number(question.questionMarks ?? 1), 0),
      0,
    ) || Number(reviewAttempt.total ?? totalQuestions);
  const reviewStatus = reviewAttempt.status ?? 'pending';
  const isChecked = reviewStatus === 'checked' || reviewStatus === 'completed';
  const statusLabel = isChecked ? 'Checked' : 'Pending';
  const statusTone = isChecked
    ? 'border-[#bfe6c8] bg-[#f3fbf5] text-[#1f7a37]'
    : 'border-[#f0d998] bg-[#fff8df] text-[#9a6b10]';

  useEffect(() => {
    let cancelled = false;

    async function fetchQuizSections() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ attemptId: attempt.id });
        const data = await callGetter({ url: serverApiUrl(`/history-detials?${params.toString()}`) });

        if (!data || data.ok === false || !data?.attempt || !Array.isArray(data?.sections)) {
          throw new Error(data?.error ?? 'Could not load review.');
        }
        const grouped = data.sections.map((section: any) => ({
          key: section.key,
          label: section.label ?? 'Section',
          heading: section.heading ?? '',
          bloomLevel: section.bloomLevel ?? '',
          targetMarks: Number(section.targetMarks ?? 0),
          targetTimeMinutes: Number(section.targetTimeMinutes ?? 0),
          questions: (section.questions ?? []).map((quiz: any) => ({
            ...quiz,
            options: normalizeOptions(quiz.options),
          })),
        }));

        if (!cancelled) {
          setReviewAttempt(data.attempt);
          setSections(grouped);
        }
      } catch (err) {
        console.error('QuizReview fetch error:', err);
        if (!cancelled) setError('Could not load review. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchQuizSections();
    return () => {
      cancelled = true;
    };
  }, [attempt.id]);

  const metricCards = [
    { label: 'Questions', value: totalQuestions, icon: FileQuestion, tone: 'text-[#006aa0]', bg: 'bg-[#e9f5fb]' },
    { label: 'Marks', value: isChecked ? `${obtainedMarks} / ${totalMarks}` : 'Pending', icon: Award, tone: 'text-[#7b5b00]', bg: 'bg-[#fff4c7]' },
    { label: 'Percentage', value: isChecked ? `${reviewAttempt.percentage}%` : 'Pending', icon: Target, tone: 'text-[#7a2e58]', bg: 'bg-[#fdeaf3]' },
    { label: 'Sections', value: sections.length || '-', icon: CheckCircle2, tone: 'text-[#1f7a37]', bg: 'bg-[#edf7ed]' },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-[#d8e3ec] bg-white shadow-sm">
      <div className="border-b border-[#e5edf3] bg-[#f8fbfd] px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase ${statusTone}`}>
              {isChecked ? <CheckCircle2 size={15} /> : <Hourglass size={15} />}
              {statusLabel}
            </div>
            <h2 className="text-2xl font-black text-[#101828]">Quiz Review</h2>
            <p className="mt-2 text-sm font-semibold text-[#667789]">
              {reviewAttempt.course?.title || attempt.course?.title || studentClass} ·{' '}
              {new Date(reviewAttempt.createdAt || attempt.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="rounded-lg border border-[#d8e3ec] bg-white px-4 py-3 text-right shadow-sm">
            <div className="text-xs font-black uppercase text-[#667789]">Attempt time</div>
            <div className="mt-1 text-xl font-black text-[#101828]">
              {formatDuration(reviewAttempt.timeToSolveSeconds)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metricCards.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-[#e5edf3] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase text-[#667789]">{item.label}</div>
                    <div className="mt-2 text-2xl font-black text-[#101828]">{item.value}</div>
                  </div>
                  <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${item.bg} ${item.tone}`}>
                    <Icon size={21} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && (
        <div className="py-14 text-center text-sm font-bold text-[#667789]">Loading review...</div>
      )}

      {error && (
        <div className="m-5 rounded-lg border border-red-200 bg-red-50 py-8 text-center text-sm font-bold text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-5 p-5">
          {sections.map((section) => (
            <div key={section.key} className="overflow-hidden rounded-lg border border-[#d8e3ec] bg-[#f8fbfd]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5edf3] bg-white px-5 py-4">
                <div>
                  <h3 className="text-lg font-black text-[#101828]">
                    {section.label} - {section.heading}
                  </h3>
                  <p className="mt-1 text-xs font-bold text-[#667789]">
                    {section.bloomLevel || 'Review section'}
                  </p>
                </div>
                <div className="flex gap-2 text-xs font-black text-[#526070]">
                  <span className="flex items-center gap-1 rounded-full border border-[#e5edf3] bg-[#f8fbfd] px-3 py-1">
                    <Target size={14} /> {section.targetMarks} marks
                  </span>
                  <span className="flex items-center gap-1 rounded-full border border-[#e5edf3] bg-[#f8fbfd] px-3 py-1">
                    <Clock3 size={14} /> {section.targetTimeMinutes} min
                  </span>
                </div>
              </div>

              <div className="space-y-4 p-4">
                {section.questions.map((q: any, idx: number) => {
                  const studentAnswer = q.selectedAnswer ?? reviewAttempt.answers?.[q.id] ?? '';
                  const isCorrect = studentAnswer.trim().toLowerCase() === String(q.answer ?? '').trim().toLowerCase();
                  const questionMarks = Number(q.questionMarks ?? 1);
                  const marksObtained = isChecked ? q.marksObtained ?? (isCorrect ? questionMarks : 0) : null;
                  const timeSpentSeconds = Number(q.timeSpentSeconds ?? 0);
                  const isShortQuestion = String(q.questionType ?? '').toLowerCase() === 'short';
                  const tipsText = q.explanation || 'Teacher will review this written answer and share feedback.';

                  return (
                    <div key={q.id} className="overflow-hidden rounded-lg border border-[#e5edf3] bg-white shadow-sm">
                      <div className="flex items-start justify-between gap-3 border-b border-[#eef2f5] px-4 py-4">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap gap-2">
                            <span className="rounded-full bg-[#e9f5fb] px-3 py-1 text-xs font-black text-[#006aa0]">
                              Question {idx + 1}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black ${
                                isChecked
                                  ? isCorrect
                                    ? 'bg-[#edf7ed] text-[#1f7a37]'
                                    : 'bg-red-50 text-red-600'
                                  : 'bg-[#fff8df] text-[#9a6b10]'
                              }`}
                            >
                              {isChecked ? (isCorrect ? 'Correct' : 'Needs review') : 'Teacher checking'}
                            </span>
                          </div>
                          <p className="font-black leading-6 text-[#101828]">
                            {idx + 1}. {q.prompt || (q.imageUrl ? 'Image question' : '')}
                          </p>
                          {q.imageUrl && (
                            <div className="mt-3 overflow-hidden rounded-lg border border-[#e5edf3] bg-white">
                              <img src={serverAssetUrl(q.imageUrl) ?? ''} alt={`Question ${idx + 1}`} className="max-h-72 w-full object-contain" />
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-[#526070]">
                            <span className="rounded-full border border-[#e5edf3] bg-[#f8fbfd] px-3 py-1">
                              Question marks: {questionMarks}
                            </span>
                            <span className="rounded-full border border-[#e5edf3] bg-[#f8fbfd] px-3 py-1">
                              Marks obtained: {marksObtained ?? 'Pending'}
                            </span>
                            <span className="rounded-full border border-[#e5edf3] bg-[#f8fbfd] px-3 py-1">
                              Time: {formatDuration(timeSpentSeconds)}
                            </span>
                          </div>
                        </div>
                        {isChecked && (
                          <div className="shrink-0">
                            {isCorrect ? (
                              <CheckCircle2 size={22} className="text-[#1f7a37]" />
                            ) : (
                              <XCircle size={22} className="text-red-600" />
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid gap-3 p-4 text-sm font-semibold text-[#526070] md:grid-cols-2">
                        <div className="rounded-lg border border-[#d8e3ec] bg-[#f8fbfd] p-3">
                          <div className="mb-1 text-xs font-black uppercase text-[#667789]">Submitted answer</div>
                          <p className="font-black text-[#101828]">{studentAnswer || 'Not answered'}</p>
                        </div>
                        <div className="rounded-lg border border-[#d8e3ec] bg-[#f8fbfd] p-3">
                          <div className="mb-1 text-xs font-black uppercase text-[#667789]">
                            {isShortQuestion ? 'Tips' : 'Correct answer'}
                          </div>
                          <p className="font-black text-[#101828]">
                            {isShortQuestion
                              ? tipsText
                              : isChecked
                                ? q.answer || 'Not available'
                                : 'Visible after teacher review'}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
                        {(q.options ?? []).map((opt: string) => {
                          const isStudentPick = opt === studentAnswer;
                          const isCorrectOption = isChecked && opt === q.answer;
                          return (
                            <div
                              key={opt}
                              className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                                isCorrectOption ? 'border-[#1f7a37] bg-[#edf7ed] text-[#1f7a37]' : ''
                              } ${
                                isStudentPick && !isCorrectOption
                                  ? isChecked
                                    ? 'border-red-500 bg-red-50 text-red-600'
                                    : 'border-[#006aa0] bg-[#e9f5fb] text-[#006aa0]'
                                  : ''
                              } ${!isStudentPick && !isCorrectOption ? 'border-[#e5edf3] text-[#526070]' : ''}`}
                            >
                              {opt}
                              {isStudentPick && ' (your answer)'}
                              {isCorrectOption && !isStudentPick && ' (correct)'}
                            </div>
                          );
                        })}
                      </div>

                      {isChecked && q.explanation && (
                        <p className="mx-4 mb-4 rounded-lg border border-[#e5edf3] bg-[#fbfdfe] p-3 text-xs font-semibold leading-5 text-[#667789]">
                          Explanation: {q.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
