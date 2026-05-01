export type Accent = "US" | "UK" | "AU";
export type LessonMode = "精听" | "跟读" | "听写" | "泛听";
export type Rating = "again" | "hard" | "good";
export type LearnerLevel = "foundation" | "reader" | "realworld";
export type ListeningGoal = "daily" | "shows" | "work" | "podcast";
export type TargetHorizonDays = 30 | 90 | 180;

export type DictationWordStatus = "match" | "missed" | "extra" | "near";

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
  learnerLevel: LearnerLevel;
  listeningGoal: ListeningGoal;
  targetHorizonDays: TargetHorizonDays;
  onboardingComplete: boolean;
  startedAt: string;
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

export interface DictationWordResult {
  word: string;
  status: DictationWordStatus;
}

export interface DictationResult {
  score: number;
  words: DictationWordResult[];
  missed: number;
  extra: number;
  near: number;
}

export interface DailyPlanItem {
  id: string;
  title: string;
  minutes: number;
  mode: LessonMode | "复听" | "复习";
  reason: string;
  href: string;
}

export interface GoalOption<T extends string | number> {
  value: T;
  label: string;
  caption: string;
}

export interface GoalMilestone {
  day: number;
  title: string;
  outcome: string;
  evidence: string;
}

export interface GoalProfile {
  id: ListeningGoal;
  title: string;
  promise: string;
  audience: string;
  evidence: string;
  topicHints: string[];
  milestones: GoalMilestone[];
}

export interface GoalRoadmap {
  profile: GoalProfile;
  levelLabel: string;
  horizonDays: TargetHorizonDays;
  targetDateLabel: string;
  targetMinutes: number;
  completedMinutes: number;
  activeDays: number;
  progressPercent: number;
  phaseName: string;
  phaseDescription: string;
  nextMilestone: GoalMilestone;
  milestones: GoalMilestone[];
  weeklyProof: string;
}
