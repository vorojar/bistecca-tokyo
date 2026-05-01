export type Accent = "US" | "UK" | "AU";
export type LessonMode = "精听" | "跟读" | "听写" | "泛听";
export type Rating = "again" | "hard" | "good";

export interface LessonSentence {
  id: string;
  text: string;
  meaning: string;
  note: string;
  keywords: string[];
  audioUrl?: string;
  audioStart?: number;
  audioEnd?: number;
}

export interface VocabSeed {
  term: string;
  meaning: string;
  example: string;
}

export interface Lesson {
  id: string;
  title: string;
  series: string;
  level: string;
  accent: Accent;
  duration: number;
  comprehension: number;
  recommendedMode: LessonMode;
  topic: string;
  summary: string;
  focus: string[];
  sentences: LessonSentence[];
  vocab: VocabSeed[];
}

export interface LessonPayload {
  lessons: Lesson[];
}

export interface UserSettings {
  key: "user";
  dailyGoalMinutes: number;
  defaultRate: number;
  showTranscriptFirst: boolean;
  preferredAccent: "自动" | Accent;
  reduceMotion: boolean;
}

export interface ProgressRecord {
  lessonId: string;
  completedSentences: number;
  completed: boolean;
  updatedAt: string;
}

export interface AttemptRecord {
  id?: number;
  lessonId: string;
  mode: LessonMode;
  date: string;
  durationSeconds: number;
  score?: number;
  createdAt: string;
}

export interface MistakeRecord {
  id: string;
  lessonId: string;
  sentenceId: string;
  type: string;
  note: string;
  text: string;
  date: string;
  createdAt: string;
}

export interface VocabCard {
  id: string;
  lessonId: string;
  term: string;
  meaning: string;
  example: string;
  dueDate: string;
  ease: number;
  reviewCount: number;
  lastRating: Rating | null;
}

export interface DataSnapshot {
  progress: ProgressRecord[];
  attempts: AttemptRecord[];
  mistakes: MistakeRecord[];
  vocabCards: VocabCard[];
}

export interface ExportPayload {
  app: "Auralift";
  version: number;
  exportedAt: string;
  stores: {
    progress: ProgressRecord[];
    attempts: AttemptRecord[];
    mistakes: MistakeRecord[];
    vocabCards: VocabCard[];
    settings: UserSettings[];
  };
}

export interface RouteState {
  name: string;
  id: string | null;
  path: string;
  tab: string;
  depth: number;
}
