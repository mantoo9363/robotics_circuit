'use client';

import { useEffect, useMemo, useState, useRef, FormEvent } from 'react';
import { useSetterRow } from '@cs/hooks/useSetterRow';
import { useGetter } from '@cs/hooks/getter';
import { DashboardShell } from '@cs/components/dashboard/DashboardShell';
import { serverApiUrl } from '@cs/lib/server-api';
import {
  QuizQuestion,
  QuizAttempt,
  AttemptResponse,
  Answers,
  QuestionTiming,
  QuizSetSummary,
} from '../../types/quiz';
import {
  normalizeOptions,
  groupQuestionsBySection,
  getStoredStudentClass,
  normalizeClassLevel,
} from '../../lib/quiz-utils';
import { QuizPageSkeleton } from '../../components/quiz/Skeleton';
import { QuizHeader } from '../../components/quiz/QuizHeader';
import { EmptyState } from '../../components/quiz/EmptyState';
import { History } from '../../components/quiz/History';
import { StartScreen } from '../../components/quiz/StartScreen';
import { QuizReview } from '../../components/quiz/QuizReview';
import { Timer } from '../../components/quiz/Timer';
import { QuizSection } from '../../components/quiz/QuizSection';
import { Footer } from '../../components/quiz/Footer';
import { Result } from '../../components/quiz/Result';
import { BookOpenCheck, CheckCircle2, PlayCircle } from 'lucide-react';

type CallGetter = (value: { url: string; bodyData?: Record<string, any> }) => Promise<any | false>;

type InitialQuizLoadData = {
  loadedAttempts: QuizAttempt[];
  firstCourseId: string;
  selectedQuizSetId: string;
  selectedQuizTitle: string;
  availableQuizSets: QuizSetSummary[];
  flattenedQuestions: QuizQuestion[];
};

let initialQuizLoad: { key: string; promise: Promise<InitialQuizLoadData> } | null = null;

async function fetchInitialQuizLoad(callGetter: CallGetter, selectedClass: string): Promise<InitialQuizLoadData> {
  const cacheKey = selectedClass || 'all';

  initialQuizLoad = {
    key: cacheKey,
    promise: (async () => {
      const classParams = new URLSearchParams();
      if (selectedClass) classParams.set('classLevel', selectedClass);
      const classesUrl = classParams.toString() ? `/quizzes/classes?${classParams.toString()}` : '/quizzes/classes';

      const classesData = await callGetter({ url: serverApiUrl(classesUrl) });
      if (!classesData || classesData.ok === false || !Array.isArray(classesData?.classes)) {
        throw new Error(classesData?.error ?? 'Data not available.');
      }

      const historyData = (await callGetter({ url: serverApiUrl('/quizzes/history') })) as AttemptResponse | false;
      if (!historyData) {
        throw new Error('Could not load quiz history.');
      }
      if (historyData.ok === false || !Array.isArray(historyData.attempts)) {
        throw new Error(historyData.error ?? 'Could not load quiz history.');
      }

      const loadedClasses = classesData.classes.map((item: any) => ({
        ...item,
        quizCount: Number(item.quizCount ?? 0),
      }));
      const firstWithQuiz = loadedClasses.find((item: any) => item.quizCount > 0) ?? loadedClasses[0];

      if (!firstWithQuiz) {
        return {
          loadedAttempts: historyData.attempts,
          firstCourseId: '',
          selectedQuizSetId: '',
          selectedQuizTitle: '',
          availableQuizSets: [],
          flattenedQuestions: [],
        };
      }

      const setParams = new URLSearchParams({ courseId: firstWithQuiz.id, status: 'live' });
      if (selectedClass) setParams.set('classLevel', selectedClass);
      const setsData = await callGetter({ url: serverApiUrl(`/quizzes/sets?${setParams.toString()}`) });
      if (!setsData || setsData.ok === false || !Array.isArray(setsData?.quizSets)) {
        throw new Error(setsData?.error ?? 'Could not load quizzes.');
      }

      const quizSets = (setsData.quizSets as QuizSetSummary[]).filter((quizSet) => quizSet.status === 'live');
      const attemptedSetIds = new Set(historyData.attempts.map((attempt) => attempt.quizSetId).filter(Boolean));
      const selectedQuizSet = quizSets.find((quizSet: QuizSetSummary) => !attemptedSetIds.has(quizSet.id)) ?? quizSets[0];
      const flattenedQuestions = selectedQuizSet
        ? await loadQuizSetQuestions(callGetter, selectedQuizSet.id)
        : [];

      return {
        loadedAttempts: historyData.attempts,
        firstCourseId: firstWithQuiz.id,
        selectedQuizSetId: selectedQuizSet?.id ?? '',
        selectedQuizTitle: selectedQuizSet?.title ?? '',
        availableQuizSets: quizSets,
        flattenedQuestions,
      };
    })(),
  };

  initialQuizLoad.promise.catch(() => {
    if (initialQuizLoad?.key === cacheKey) {
      initialQuizLoad = null;
    }
  });

  return initialQuizLoad.promise;
}

async function loadQuizSetQuestions(callGetter: CallGetter, quizSetId: string): Promise<QuizQuestion[]> {
  const params = new URLSearchParams({ quizSetId });
  const questionsData = await callGetter({ url: serverApiUrl(`/quizzes?${params.toString()}`) });
  if (!questionsData || questionsData.ok === false || !Array.isArray(questionsData?.quizzes)) {
    throw new Error(questionsData?.error ?? 'Could not load questions.');
  }

  return questionsData.quizzes.flatMap((section: any, sectionIndex: number) =>
    (section.questions ?? []).map((quiz: QuizQuestion & { options: unknown; order?: number }) => ({
      ...quiz,
      options: normalizeOptions(quiz.options),
      sectionId: section.id,
      sectionLabel: section.label,
      sectionHeading: section.heading,
      bloomLevel: section.bloomLevel,
      targetMarks: section.targetMarks,
      targetTimeMinutes: section.targetTimeMinutes,
      sectionOrder: section.order ?? sectionIndex,
      questionOrder: quiz?.order,
    }))
  );
}

export default function QuizzesPage() {
  const { callGetter } = useGetter();
  const { callSetterRow } = useSetterRow();
  const [currentCourseId, setCurrentCourseId] = useState('');
  const [currentQuizSetId, setCurrentQuizSetId] = useState('');
  const [currentQuizTitle, setCurrentQuizTitle] = useState('');
  const [availableQuizSets, setAvailableQuizSets] = useState<QuizSetSummary[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [resultAttempt, setResultAttempt] = useState<QuizAttempt | null>(null);
  const [studentClass, setStudentClass] = useState('');
  const [classesLoading, setClassesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());
  const [isPending, setIsPending] = useState(false);
  const [reviewAttempt, setReviewAttempt] = useState<QuizAttempt | null>(null);

  const [questionTimings, setQuestionTimings] = useState<Record<string, QuestionTiming>>({});
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const questionStartTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length;
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  // Memoized so identity only changes when `questions` actually changes,
  // preventing the completedSections effect from re-running on every render.
  const quizSections = useMemo(() => groupQuestionsBySection(questions), [questions]);

  const classAttempts = studentClass
    ? attempts.filter((a) => normalizeClassLevel(a.classLevel) === studentClass)
    : attempts;
  const latestAttempt = classAttempts[0] ?? null;
  const completedAttemptForCurrentCourse = currentCourseId
    ? classAttempts.find((attempt) =>
        currentQuizSetId ? attempt.quizSetId === currentQuizSetId : attempt.courseId === currentCourseId
      ) ?? null
    : null;
  const solvedQuizSetIds = new Set(classAttempts.map((attempt) => attempt.quizSetId).filter(Boolean));

  const isPendingResult = resultAttempt?.status === 'pending';
  const score = resultAttempt?.score ?? 0;
  const total = resultAttempt?.total ?? questions.length;
  const percentage = resultAttempt?.percentage ?? 0;

  function isSectionComplete(sectionKey: string): boolean {
    const section = quizSections.find((s) => s.key === sectionKey);
    if (!section) return false;
    return section.questions.every((q: any) => answers[q.id]?.trim() !== '');
  }

  function isSectionAccessible(sectionIndex: number): boolean {
    if (sectionIndex === 0) return true;
    return quizSections.slice(0, sectionIndex).every((s) => completedSections.has(s.key));
  }

  function startQuestionTimer(questionId: string) {
    if (submitted || isPending) return;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (currentQuestionId && questionStartTimeRef.current) {
      const elapsed = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
      setQuestionTimings((prev) => ({
        ...prev,
        [currentQuestionId]: {
          ...prev[currentQuestionId],
          timeSpentSeconds: (prev[currentQuestionId]?.timeSpentSeconds || 0) + elapsed,
        },
      }));
    }

    setCurrentQuestionId(questionId);
    questionStartTimeRef.current = Date.now();

    if (!questionTimings[questionId]) {
      setQuestionTimings((prev) => ({
        ...prev,
        [questionId]: {
          questionId,
          timeSpentSeconds: 0,
          isAnswered: false,
        },
      }));
    }

    timerIntervalRef.current = setInterval(() => {}, 1000);
  }

  function stopQuestionTimer() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (currentQuestionId && questionStartTimeRef.current) {
      const elapsed = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
      setQuestionTimings((prev) => ({
        ...prev,
        [currentQuestionId]: {
          ...prev[currentQuestionId],
          timeSpentSeconds: (prev[currentQuestionId]?.timeSpentSeconds || 0) + elapsed,
        },
      }));
    }

    setCurrentQuestionId(null);
    questionStartTimeRef.current = null;
  }

  function getQuestionTime(questionId: string): number {
    let time = questionTimings[questionId]?.timeSpentSeconds || 0;

    if (currentQuestionId === questionId && questionStartTimeRef.current && !submitted && !isPending) {
      time += Math.floor((Date.now() - questionStartTimeRef.current) / 1000);
    }

    return time;
  }

  useEffect(() => {
    if (!started || submitted || isPending || !startedAt) return;

    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    };
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [started, startedAt, submitted, isPending]);

  useEffect(() => {
    if (completedSections.size === 0) return;

    const nextIncompleteIndex = quizSections.findIndex((section, index) => {
      return isSectionAccessible(index) && !isSectionComplete(section.key);
    });

    if (nextIncompleteIndex > 0) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`section-${quizSections[nextIncompleteIndex].key}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [completedSections, quizSections]);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  async function loadClasses() {
    setClassesLoading(true);
    setError('');

    try {
      const selectedClass = getStoredStudentClass();
      setStudentClass(selectedClass);

      const data = await fetchInitialQuizLoad(callGetter, selectedClass);
      setAttempts(data.loadedAttempts);
      if (data.firstCourseId) {
        setCurrentCourseId(data.firstCourseId);
        setCurrentQuizSetId(data.selectedQuizSetId);
        setCurrentQuizTitle(data.selectedQuizTitle);
        setAvailableQuizSets(data.availableQuizSets);
        setQuestions(data.flattenedQuestions);
      } else {
        setCurrentCourseId('');
        setCurrentQuizSetId('');
        setCurrentQuizTitle('');
        setAvailableQuizSets([]);
        setQuestions([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Data not available.');
    } finally {
      setClassesLoading(false);
    }
  }

  useEffect(() => {
    void loadClasses();
  }, []);

  async function handleSelectQuizSet(quizSet: QuizSetSummary) {
    if (quizSet.id === currentQuizSetId || classesLoading) return;

    try {
      setClassesLoading(true);
      setError('');
      setStarted(false);
      setSubmitted(false);
      setIsPending(false);
      setResultAttempt(null);
      setReviewAttempt(null);
      setAnswers({});
      setCompletedSections(new Set());
      setQuestionTimings({});
      setCurrentQuestionId(null);
      questionStartTimeRef.current = null;
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      const loadedQuestions = await loadQuizSetQuestions(callGetter, quizSet.id);
      setCurrentCourseId(quizSet.courseId);
      setCurrentQuizSetId(quizSet.id);
      setCurrentQuizTitle(quizSet.title);
      setQuestions(loadedQuestions);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load quiz.');
    } finally {
      setClassesLoading(false);
    }
  }

  function handleStart() {
    setStarted(true);
    setReviewAttempt(null);
    setStartedAt(Date.now());
    setElapsedSeconds(0);
    setSubmitted(false);
    setIsPending(false);
    setAnswers({});
    setCompletedSections(new Set());
    setQuestionTimings({});
    setCurrentQuestionId(null);
    questionStartTimeRef.current = null;

    if (questions.length > 0) {
      startQuestionTimer(questions[0].id);
    }
  }

  function handleRestart() {
    setSubmitted(false);
    setIsPending(false);
    setResultAttempt(null);
    setStartedAt(Date.now());
    setElapsedSeconds(0);
    setAnswers({});
    setCompletedSections(new Set());
    setQuestionTimings({});
    setCurrentQuestionId(null);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    questionStartTimeRef.current = null;
    setStarted(true);

    if (questions.length > 0) {
      startQuestionTimer(questions[0].id);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !currentCourseId) return;

    stopQuestionTimer();
    setIsPending(true);

    const allSectionsComplete = quizSections.every((section) => isSectionComplete(section.key));
    if (!allSectionsComplete) {
      setError('Please complete all sections before submitting.');
      setIsPending(false);
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const data = (await callSetterRow<AttemptResponse>({
        url: serverApiUrl('/quizzes/submit'),
        bodyData: {
          courseId: currentCourseId,
          quizSetId: currentQuizSetId,
          questionResponses: questions.map((q) => ({
            quizId: q.id,
            prompt: q.prompt,
            selectedAnswer: answers[q.id] ?? '',
            timeSpentSeconds: getQuestionTime(q.id),
          })),
          timeToSolveSeconds: startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : elapsedSeconds,
        },
      })) as AttemptResponse | null;

      if (!data || data.ok === false || !data?.attempt) {
        throw new Error(data?.error ?? 'Quiz submit fail.');
      }

      setResultAttempt(data.attempt);
      setAttempts((current) => [
        data.attempt!,
        ...current.filter((a) =>
          data.attempt!.quizSetId
            ? a.quizSetId !== data.attempt!.quizSetId
            : a.courseId !== data.attempt!.courseId
        ),
      ]);
      setSubmitted(true);
      setIsPending(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Quiz submit fail.');
      setIsPending(false);
    } finally {
      setSubmitting(false);
    }
  }

  function updateAnswer(questionId: string, value: string) {
    if (submitted || isPending) return;

    if (!questionTimings[questionId]) {
      startQuestionTimer(questionId);
    } else if (currentQuestionId !== questionId) {
      startQuestionTimer(questionId);
    }

    setAnswers((current) => {
      const updated = { ...current, [questionId]: value };

      setQuestionTimings((prev) => ({
        ...prev,
        [questionId]: {
          ...prev[questionId],
          isAnswered: true,
        },
      }));

      quizSections.forEach((section) => {
        const allAnswered = section.questions.every((q: any) => updated[q.id]?.trim() !== '');
        if (allAnswered) {
          setCompletedSections((prev) => new Set([...prev, section.key]));
        }
      });

      return updated;
    });
  }

  function preventQuizCopy(event: any) {
    event.preventDefault();
  }

  const isLoading = classesLoading;
  const hasNoQuestions = questions.length === 0;
  const hasHistory = classAttempts.length > 0;
  const isSubmitDisabled = quizSections.some((section, index) =>
    isSectionAccessible(index) && !isSectionComplete(section.key)
  );

  return (
    <DashboardShell>
      <div className="mx-auto max-w-[1220px] px-6 py-7">
        <QuizHeader
          questionsCount={questions.length}
          answeredCount={answeredCount}
          classAttemptsLength={classAttempts.length}
          latestAttempt={latestAttempt}
          progressPercent={progressPercent}
        />

        {isLoading && <QuizPageSkeleton />}

        {!isLoading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {!isLoading && !error && hasNoQuestions && !hasHistory && <EmptyState />}

        {!isLoading && !error && hasNoQuestions && hasHistory && (
          <History attempts={classAttempts} studentClass={studentClass} />
        )}

        {!isLoading && !error && reviewAttempt && (
          <QuizReview
            attempt={reviewAttempt}
            onClose={() => setReviewAttempt(null)}
            studentClass={studentClass}
          />
        )}

        {!isLoading && !error && !reviewAttempt && availableQuizSets.length > 0 && (
          <section className="mb-5 rounded-lg border border-[#d8e3ec] bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-[#101828]">Available quizzes</h2>
                <p className="text-sm font-semibold text-[#667789]">
                  Select the quiz you want to solve or review for {studentClass || 'your class'}.
                </p>
              </div>
              <span className="rounded-full border border-[#d8e3ec] bg-[#f8fbfd] px-3 py-1 text-xs font-black text-[#526070]">
                {availableQuizSets.length} {availableQuizSets.length === 1 ? 'quiz' : 'quizzes'}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {availableQuizSets.map((quizSet, index) => {
                const solved = solvedQuizSetIds.has(quizSet.id);
                const selected = quizSet.id === currentQuizSetId;

                return (
                  <button
                    key={quizSet.id}
                    type="button"
                    onClick={() => void handleSelectQuizSet(quizSet)}
                    className={`rounded-lg border p-4 text-left transition ${
                      selected
                        ? 'border-[#006aa0] bg-[#f0f8fc] shadow-sm'
                        : 'border-[#e5edf3] bg-white hover:border-[#b7d7e8] hover:bg-[#f8fbfd]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                            solved ? 'bg-[#e8f6ef] text-[#1f7a37]' : 'bg-[#e9f5fb] text-[#006aa0]'
                          }`}
                        >
                          {solved ? <CheckCircle2 size={21} /> : <BookOpenCheck size={21} />}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-black uppercase text-[#667789]">Quiz {index + 1}</div>
                          <div className="truncate text-base font-black text-[#101828]">{quizSet.title}</div>
                          <div className="mt-1 text-xs font-semibold text-[#667789]">
                            {quizSet._count?.questions ?? 0} question{quizSet._count?.questions === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
                          solved ? 'bg-[#e8f6ef] text-[#1f7a37]' : 'bg-[#fff4df] text-[#9a5b00]'
                        }`}
                      >
                        {solved ? 'Solved' : 'Open'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-[#e8f6ef] px-2.5 py-1 text-[10px] font-black uppercase text-[#1f7a37]">
                        Published
                      </span>
                    </div>
                    {selected && (
                      <div className="mt-3 inline-flex items-center gap-2 text-xs font-black text-[#006aa0]">
                        <PlayCircle size={15} />
                        Selected quiz
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!isLoading && !error && !reviewAttempt && !hasNoQuestions && !started && (
          <StartScreen
            questionsCount={questions.length}
            quizSections={quizSections}
            quizTitle={currentQuizTitle}
            onStart={handleStart}
            completedAttempt={completedAttemptForCurrentCourse}
            onReview={() => {
              if (completedAttemptForCurrentCourse) {
                setReviewAttempt(completedAttemptForCurrentCourse);
              }
            }}
          />
        )}

        {!isLoading && !error && !reviewAttempt && started && !hasNoQuestions && (
          <form
            onSubmit={handleSubmit}
            onCopy={preventQuizCopy}
            onCut={preventQuizCopy}
            onContextMenu={preventQuizCopy}
            className="space-y-5 select-none"
          >
            {!submitted && (
              <Timer
                elapsedSeconds={elapsedSeconds}
                isSubmitted={submitted}
                isPending={isPending}
              />
            )}

            {submitted && resultAttempt && (
              <Result
                attempt={resultAttempt}
                score={score}
                total={total}
                percentage={percentage}
                isPending={isPendingResult}
              />
            )}

            {isPending && !submitted && (
              <div className="rounded-lg border border-[#f0e6b0] bg-[#fdf8e6] p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#b7791f] border-t-transparent" />
                  <div>
                    <h2 className="text-lg font-black text-[#101828]">Submitting your quiz...</h2>
                    <p className="text-sm font-semibold text-[#667789]">
                      Please wait while we save your answers. Do not refresh the page.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {quizSections.map((section, sectionIndex) => {
              const priorQuestionCount = quizSections
                .slice(0, sectionIndex)
                .reduce((sum, item) => sum + item.questions.length, 0);

              return (
                <QuizSection
                  key={section.key}
                  section={section}
                  sectionIndex={sectionIndex}
                  priorQuestionCount={priorQuestionCount}
                  answers={answers}
                  isAccessible={isSectionAccessible(sectionIndex)}
                  isComplete={isSectionComplete(section.key)}
                  isSubmitted={submitted}
                  isPending={isPending}
                  getQuestionTime={getQuestionTime}
                  updateAnswer={updateAnswer}
                  startQuestionTimer={startQuestionTimer}
                />
              );
            })}

            <Footer
              answeredCount={answeredCount}
              questionsCount={questions.length}
              elapsedSeconds={elapsedSeconds}
              progressPercent={progressPercent}
              isSubmitted={submitted}
              isPending={isPending}
              submitting={submitting}
              isSubmitDisabled={isSubmitDisabled}
              onRestart={handleRestart}
            />
          </form>
        )}
      </div>
    </DashboardShell>
  );
}
