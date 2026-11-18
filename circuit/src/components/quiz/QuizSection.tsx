// components/quiz/QuizSection.tsx
import React from 'react';
import { QuizSection as QuizSectionType, Answers } from '../../types/quiz';
import { Question } from '../../components/quiz/Question';

interface QuizSectionProps {
  section: QuizSectionType;
  sectionIndex: number;
  priorQuestionCount: number;
  answers: Answers;
  isAccessible: boolean;
  isComplete: boolean;
  isSubmitted: boolean;
  isPending: boolean;
  getQuestionTime: (questionId: string) => number;
  updateAnswer: (questionId: string, value: string) => void;
  startQuestionTimer: (questionId: string) => void;
}

export function QuizSection({
  section,
  sectionIndex,
  priorQuestionCount,
  answers,
  isAccessible,
  isComplete,
  isSubmitted,
  isPending,
  getQuestionTime,
  updateAnswer,
  startQuestionTimer,
}: QuizSectionProps) {
   
  const isDisabled = isSubmitted || isPending;
   // console.log(`Rendering QuizSection: ${JSON.stringify(section)}`);
  return (
    <section
      id={`section-${section.key}`}
      className={`overflow-hidden rounded-lg border shadow-sm ${
        !isAccessible && !isSubmitted && !isPending
          ? 'border-[#e5edf3] bg-[#f8fbfd] opacity-60'
          : 'border-[#d8e3ec] bg-white'
      }`}
    >
      <div className="border-b border-[#e5edf3] bg-[#f8fbfd] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#006aa0] px-3 py-1 text-xs font-black text-white">
                {section.label}
              </span>
              {section.bloomLevel && (
                <span className="rounded-full bg-[#e9f5fb] px-3 py-1 text-xs font-black text-[#006aa0]">
                  {section.bloomLevel}
                </span>
              )}
              {!isAccessible && !isSubmitted && !isPending && (
                <span className="rounded-full bg-[#e9f5fb] px-3 py-1 text-xs font-black text-[#006aa0]">
                  🔒 Locked
                </span>
              )}
              {isAccessible && isComplete && !isSubmitted && !isPending && (
                <span className="rounded-full bg-[#edf7ed] px-3 py-1 text-xs font-black text-[#1f7a37]">
                  ✅ Complete
                </span>
              )}
              {isAccessible && !isComplete && !isSubmitted && !isPending && (
                <span className="rounded-full bg-[#fff4de] px-3 py-1 text-xs font-black text-[#b7791f]">
                  ⏳ In Progress
                </span>
              )}
              {isSubmitted && (
                <span className="rounded-full bg-[#edf7ed] px-3 py-1 text-xs font-black text-[#1f7a37]">
                  ✅ Submitted
                </span>
              )}
              {isPending && (
                <span className="rounded-full bg-[#fdf8e6] px-3 py-1 text-xs font-black text-[#b7791f]">
                  ⏳ Pending...
                </span>
              )}
            </div>
            <h2 className="text-xl font-black text-[#101828]">{section.heading}</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black text-[#526070]">
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">{section.questions.length} questions</span>
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">{section.targetMarks} marks</span>
            <span className="rounded-full bg-white px-3 py-1 shadow-sm">{section.targetTimeMinutes} min</span>
          </div>
        </div>
      </div>

      {isAccessible || isSubmitted || isPending ? (
        <div className="space-y-4 p-5">
          
          {section.questions.map((question, questionIndex) => {
            const index = priorQuestionCount + questionIndex;
            const selectedAnswer = answers[question.id] ?? '';
            const isCorrect = selectedAnswer.toLowerCase() === question?.answer?.toLowerCase();
            const timeSpent = getQuestionTime(question.id);
            // console.log(question);
            return (
              <Question
                key={question.id}
                question={question}
                index={index}
                selectedAnswer={selectedAnswer}
                isSubmitted={isSubmitted}
                isPending={isPending}
                isCorrect={isCorrect}
                timeSpent={timeSpent}
                onAnswerChange={updateAnswer}
                onFocus={() => !isDisabled && startQuestionTimer(question.id)}
                onMouseEnter={() => {
                  if (!isDisabled && !timeSpent) {
                    startQuestionTimer(question.id);
                  }
                }}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="mb-3 text-4xl">🔒</div>
            <p className="text-sm font-semibold text-[#526070]">Complete previous section to unlock</p>
          </div>
        </div>
      )}
    </section>
  );
}