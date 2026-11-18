// components/quiz/Question.tsx
import React from 'react';
import { CheckCircle2, XCircle, Clock3, Loader2 } from 'lucide-react';
import { QuizQuestion } from '../../types/quiz';
import { formatLiveDuration } from '../../lib/quiz-utils';
import { serverAssetUrl } from '../../lib/server-api';

interface QuestionProps {
  question: QuizQuestion;
  index: number;
  selectedAnswer: string;
  isSubmitted: boolean;
  isPending: boolean;
  isCorrect: boolean;
  timeSpent: number;
  onAnswerChange: (questionId: string, value: string) => void;
  onFocus: () => void;
  onMouseEnter: () => void;
}

export function Question({
  question,
  index,
  selectedAnswer,
  isSubmitted,
  isPending,
  isCorrect,
  timeSpent,
  onAnswerChange,
  onFocus,
  onMouseEnter,
}: QuestionProps) {
  //console.log(`Rendering Question: ${JSON.stringify(question)}`);
  const isDisabled = isSubmitted || isPending;
  const options = question.questionType === 'True/False' ? ['True', 'False'] : question.options;
  const hasImageQuestion = question.questionInputMode === 'image' && Boolean(question.imageUrl);
  const questionImageUrl = serverAssetUrl(question.imageUrl) ?? '';

  return (
    <article
      key={question.id}
      className={`overflow-hidden rounded-lg border ${
        isDisabled ? 'border-[#d8e3ec]' : 'border-[#d8e3ec]'
      } bg-white shadow-sm ${isDisabled ? 'opacity-90' : ''}`}
      onFocus={onFocus}
      onMouseEnter={onMouseEnter}
    >
      <div className="border-b border-[#eef2f5] bg-[#f8fbfd] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#e9f5fb] px-3 py-1 text-xs font-black text-[#006aa0]">
                Question {index + 1}
              </span>
              <span className="rounded-full bg-[#f0f4f8] px-3 py-1 text-xs font-black capitalize text-[#526070]">
                {question.difficulty||"Hard"}
              </span>
              <span className="rounded-full bg-[#f0f4f8] px-3 py-1 text-xs font-black text-[#526070]">
                {question.questionType}
              </span>
              {!isDisabled && (
                <span className="rounded-full bg-[#e9f5fb] px-3 py-1 text-xs font-black text-[#006aa0]">
                  ⏱️ {formatLiveDuration(timeSpent)}
                </span>
              )}
              {isPending && (
                <span className="rounded-full bg-[#fdf8e6] px-3 py-1 text-xs font-black text-[#b7791f]">
                  ⏳ Pending...
                </span>
              )}
            </div>
            {question.prompt && <h3 className="text-lg font-black leading-7 text-[#101828]">{question.prompt}</h3>}
            {hasImageQuestion && (
              <div className="mt-3 overflow-hidden rounded-lg border border-[#d8e3ec] bg-white">
                <img
                  src={questionImageUrl}
                  alt={`Question ${index + 1}`}
                  className="max-h-80 w-full object-contain"
                />
              </div>
            )}
          </div>
          {isSubmitted ? (
            isCorrect ? (
              <CheckCircle2 size={24} className="shrink-0 text-[#1f7a37]" />
            ) : (
              <XCircle size={24} className="shrink-0 text-red-600" />
            )
          ) : isPending ? (
            <Loader2 size={24} className="shrink-0 animate-spin text-[#b7791f]" />
          ) : timeSpent > 0 && (
            <div className="text-xs font-bold text-[#667789]">
              <Clock3 size={14} className="inline mr-1" />
              {formatLiveDuration(timeSpent)}
            </div>
          )}
        </div>
      </div>

      {options.length > 0 ? (
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {options.map((option, optionIndex) => {
            const isSelected = selectedAnswer === option;
            const isCorrectAnswer = isSubmitted && option.toLowerCase() === question.answer.toLowerCase();
            return (
              <label
                key={`${question.id}-${option}`}
                className={`flex min-h-12 items-center gap-3 rounded-md border px-4 py-3 text-sm font-bold transition ${
                  isCorrectAnswer
                    ? 'border-[#5dbb75] bg-[#f0faf2] text-[#155724]'
                    : isSelected
                    ? 'border-[#006aa0] bg-[#e9f5fb] text-[#005a95]'
                    : isDisabled
                    ? 'border-[#d8e3ec] bg-[#f8fbfd] text-[#425466] cursor-not-allowed'
                    : 'border-[#d8e3ec] bg-white text-[#425466] hover:border-[#006aa0] hover:bg-[#f8fbfd] cursor-pointer'
                } ${isDisabled ? 'cursor-not-allowed' : ''}`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={(event) => onAnswerChange(question.id, event.target.value)}
                  className="h-4 w-4 accent-[#006aa0] disabled:opacity-60"
                />
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#eef5fa] text-xs font-black text-[#006aa0]">
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="p-5">
          <textarea
            value={selectedAnswer}
            disabled={isDisabled}
            onChange={(event) => onAnswerChange(question.id, event.target.value)}
            onFocus={onFocus}
            className={`min-h-28 w-full resize-none rounded-md border px-3 py-3 text-sm font-semibold leading-6 outline-none ${
              isDisabled
                ? 'border-[#d8e3ec] bg-[#f3f6f8] text-[#667789] cursor-not-allowed'
                : 'border-[#cfdbe6] bg-[#fbfdfe] focus:border-[#006aa0] focus:ring-2 focus:ring-[#d7ebf6]'
            }`}
            placeholder={isDisabled ? 'Answer submitted' : 'Type your answer'}
          />
        </div>
      )}

     
    </article>
  );
}
