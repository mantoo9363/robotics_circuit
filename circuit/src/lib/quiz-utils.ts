// lib/quiz-utils.ts
import { QuizQuestion, QuizSection, QuestionTiming, Answers } from '@cs/types/quiz';

export function normalizeOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((option): option is string => typeof option === 'string') : [];
}

export function normalizeAnswer(value: string) {
  return value.trim().toLowerCase();
}

export function groupQuestionsBySection(questions: QuizQuestion[]): QuizSection[] {
 // console.log(questions)
  const grouped = new Map<string, QuizQuestion[]>();

  questions.forEach((question) => {
    const key = `${question.sectionOrder ?? 0}:${question.sectionLabel || 'SECTION A'}`;
    grouped.set(key, [...(grouped.get(key) ?? []), question]);
  });

  return Array.from(grouped.entries())
    .sort(([, leftQuestions], [, rightQuestions]) => (leftQuestions[0]?.sectionOrder ?? 0) - (rightQuestions[0]?.sectionOrder ?? 0))
    .map(([key, sectionQuestions]) => {
      const firstQuestion = sectionQuestions[0];
      const sortedQuestions = sectionQuestions
        .slice()
        .sort((left, right) => (left.questionOrder ?? 0) - (right.questionOrder ?? 0));

      return {
        key,
        label: firstQuestion?.sectionLabel || 'SECTION A',
        heading: firstQuestion?.sectionHeading || 'Quiz Section ',
        bloomLevel: firstQuestion?.bloomLevel || '',
        targetMarks: Number(firstQuestion?.targetMarks) || sortedQuestions.length,
        targetTimeMinutes: Number(firstQuestion?.targetTimeMinutes) || sortedQuestions.length,
        questions: sortedQuestions,
      };
    });
}

export function formatDuration(seconds = 0) {
  if (seconds <= 0) return 'Not tracked';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatLiveDuration(seconds = 0) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainingSeconds = Math.max(0, seconds) % 60;
  if (minutes <= 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

export function normalizeClassLevel(value?: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const rawValue = String(value).trim();
  if (!rawValue) return '';
  if (/^engineering$/i.test(rawValue)) return 'Engineering';
  const classMatch = rawValue.match(/(?:class\s*)?(\d{1,2})/i);
  return classMatch ? `Class ${classMatch[1]}` : rawValue;
}

export function getStoredStudentClass() {
  if (typeof window === 'undefined') return '';
  const rawUser = window.localStorage.getItem('circuit-studio-auth-user');
  if (!rawUser) return '';

  try {
    const user = JSON.parse(rawUser) as {
      className?: string;
      classLevel?: string;
      studentProfile?: { grade?: string | number };
    };
    return normalizeClassLevel(user.className || user.classLevel || user.studentProfile?.grade);
  } catch {
    return '';
  }
}

export function getAuthHeaders() {
  const token = window.localStorage.getItem('circuit-studio-auth-token');
  if (!token) throw new Error('Please login before taking a quiz.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export const AUTH_TOKEN_KEY = 'circuit-studio-auth-token';
export const AUTH_USER_KEY = 'circuit-studio-auth-user';