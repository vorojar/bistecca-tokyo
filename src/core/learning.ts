import { clamp, localDate, normalizeWords } from "./utils";
import type { DailyPlanItem, DataSnapshot, DictationResult, Lesson, Rating, UserSettings, VocabCard } from "../types/domain";

interface LearningModel {
  lessons: Lesson[];
  settings: UserSettings;
  snapshot: DataSnapshot;
}

export function recommendLesson(model: LearningModel): Lesson {
  const scored = model.lessons.map((lesson) => ({ lesson, score: lessonScore(model, lesson) }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.lesson;
  if (!best) throw new Error("课程数据为空");
  return best;
}

export function buildDailyPlan(model: LearningModel): DailyPlanItem[] {
  const lesson = recommendLesson(model);
  const dueCount = dueCards(model.snapshot.vocabCards).length;
  const top = topMistake(model.snapshot)?.type;
  const reviewLessonId = topMistake(model.snapshot)?.lessonId || lesson.id;

  return [
    {
      id: "review",
      title: top ? `${top} 错句复听` : "昨天错句复听",
      minutes: 10,
      mode: "复听",
      reason: top ? `最高频盲区是 ${top}` : "先用旧错句热身",
      href: `#/train/${reviewLessonId}`
    },
    {
      id: "intensive",
      title: lesson.title,
      minutes: 18,
      mode: "精听",
      reason: `${lesson.comprehension}% 可懂，适合今天的新输入`,
      href: `#/train/${lesson.id}`
    },
    {
      id: "shadow",
      title: lesson.title,
      minutes: 7,
      mode: "跟读",
      reason: "用同一材料巩固节奏和弱读",
      href: `#/train/${lesson.id}`
    },
    {
      id: "vocab",
      title: dueCount ? `${dueCount} 张听力词汇` : "听力词汇维护",
      minutes: 5,
      mode: "复习",
      reason: "保持声音到意义的直接连接",
      href: "#/vocab"
    }
  ];
}

export function scoreDictation(targetText: string, inputText: string): DictationResult {
  const target = normalizeWords(targetText);
  const input = normalizeWords(inputText);
  const dp = buildEditMatrix(target, input);
  const words: DictationResult["words"] = [];
  let i = target.length;
  let j = input.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsEqual(target[i - 1], input[j - 1])) {
      words.unshift({ word: target[i - 1], status: "match" });
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && isNearWord(target[i - 1], input[j - 1]) && dp[i][j] === dp[i - 1][j - 1] + 1) {
      words.unshift({ word: target[i - 1], status: "near" });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      words.unshift({ word: target[i - 1], status: "missed" });
      i -= 1;
    } else if (j > 0) {
      words.unshift({ word: input[j - 1], status: "extra" });
      j -= 1;
    }
  }

  const missed = words.filter((word) => word.status === "missed").length;
  const extra = words.filter((word) => word.status === "extra").length;
  const near = words.filter((word) => word.status === "near").length;
  const matched = words.filter((word) => word.status === "match").length;
  const score = target.length ? Math.round(((matched + near * 0.5) / target.length) * 100) : 0;
  return { score: clamp(score, 0, 100), words, missed, extra, near };
}

export function nextReview(card: VocabCard, rating: Rating): Pick<VocabCard, "ease" | "dueDate"> {
  const nextEase = rating === "again"
    ? Math.max(1, card.ease - 1)
    : rating === "hard"
      ? card.ease
      : Math.min(9, card.ease + 1);
  const base = rating === "again"
    ? 0
    : rating === "hard"
      ? Math.max(1, Math.ceil(card.ease / 2))
      : Math.max(2, Math.round(nextEase * Math.max(1, card.reviewCount + 1) * 0.9));
  return { ease: nextEase, dueDate: localDate(base) };
}

export function nextAdvice(snapshot: DataSnapshot): string {
  const top = topMistake(snapshot);
  if (!top) return "先完成一轮精听，并至少标记两个听错原因。";
  if (top.type === "连读") return "下一轮选生活对话，重点重复动词短语和介词连接。";
  if (top.type === "弱读") return "跟读时专门盯 to、of、and、would、have 这些功能词。";
  if (top.type === "生词") return "先降低材料难度，把新词做成听音识义卡再回听原句。";
  if (top.type === "口音") return "保持同一主题，轮换 US、UK、AU 口音各听一遍。";
  if (top.type === "语速快") return "先 0.75x 精听，再 1x 复听，最后只听关键词复述。";
  return `围绕 ${top.type} 做一组专项复听，把错句重复到能直接听出意义。`;
}

function lessonScore(model: LearningModel, lesson: Lesson): number {
  const progress = model.snapshot.progress.find((item) => item.lessonId === lesson.id);
  const attempts = model.snapshot.attempts.filter((item) => item.lessonId === lesson.id);
  const mistakes = model.snapshot.mistakes;
  const topTypes = new Set(mistakes.slice(-12).map((item) => item.type));
  const avgScore = average(attempts.map((item) => item.score).filter((score): score is number => typeof score === "number"));

  let score = 100 - Math.abs(lesson.comprehension - 78);
  if (model.settings.preferredAccent !== "自动" && lesson.accent === model.settings.preferredAccent) score += 12;
  if (lesson.focus.some((item) => topTypes.has(item))) score += 18;
  if (avgScore !== null && avgScore < 75) score -= 10;
  if (avgScore !== null && avgScore > 90) score += 6;
  if (progress?.completed) score -= 30;
  score -= attempts.length * 4;
  return score;
}

function topMistake(snapshot: DataSnapshot): { type: string; lessonId: string; count: number } | null {
  const counts = new Map<string, { type: string; lessonId: string; count: number }>();
  for (const item of snapshot.mistakes) {
    const existing = counts.get(item.type);
    counts.set(item.type, {
      type: item.type,
      lessonId: item.lessonId,
      count: (existing?.count || 0) + 1
    });
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)[0] || null;
}

function dueCards(cards: VocabCard[]): VocabCard[] {
  const today = localDate();
  return cards.filter((card) => card.dueDate <= today);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildEditMatrix(target: string[], input: string[]): number[][] {
  const dp = Array.from({ length: target.length + 1 }, () => Array(input.length + 1).fill(0));
  for (let i = 0; i <= target.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= input.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= target.length; i += 1) {
    for (let j = 1; j <= input.length; j += 1) {
      const cost = wordsEqual(target[i - 1], input[j - 1]) ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp;
}

function wordsEqual(a: string, b: string): boolean {
  return a === b;
}

function isNearWord(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  return levenshtein(a, b) <= 1;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}
