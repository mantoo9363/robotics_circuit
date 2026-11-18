// types/quiz.ts
export type QuestionType = "MCQ" | "True/False" | "Short";

export type CourseClass = {
  id: string;
  title: string;
  instructorName?: string;
  moduleCount?: number;
  studentCount?: number;
  status?: string;
  quizCount: number;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  questionInputMode?: 'text' | 'image';
  imageUrl?: string;
  options: string[];
  answer: string;
  explanation: string;
  questionType: QuestionType;
  difficulty: string;
  sectionLabel?: string;
  sectionHeading?: string;
  bloomLevel?: string;
  targetMarks?: number;
  targetTimeMinutes?: number;
  sectionOrder?: number;
  questionOrder?: number;
};

export type QuizSetSummary = {
  id: string;
  courseId: string;
  title: string;
  classLevel: string;
  status: 'draft' | 'live';
  _count?: {
    questions?: number;
    sections?: number;
  };
};

export type QuizSection = {
  key: string;
  label: string;
  heading: string;
  bloomLevel: string;
  targetMarks: number;
  targetTimeMinutes: number;
  questions: QuizQuestion[];
};

export type Answers = Record<string, string>;

export type QuestionTiming = {
  questionId: string;
  timeSpentSeconds: number;
  isAnswered: boolean;
};

export type QuizAttempt = {
  id: string;
  courseId: string;
  quizSetId?: string;
  classLevel?: string;
  quizIds?: string[];
  score: number;
  total: number;
  percentage: number;
  timeToSolveSeconds?: number;
  createdAt: string;
  course?: {
    title?: string;
    instructorName?: string;
  };
  quizSet?: {
    id: string;
    title: string;
    classLevel?: string;
    status?: string;
  };
  answers?: Record<string, string>;
  questionTimings?: QuestionTiming[];
  status?: "pending" | "checked" | "completed" | "submitted";
};

export type AttemptResponse = {
  ok?: boolean;
  error?: string;
  attempt?: QuizAttempt;
  attempts?: QuizAttempt[];
  alreadySubmitted?: boolean;
};
