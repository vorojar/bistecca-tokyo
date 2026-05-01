import { clamp, localDate, normalizeWords } from "./utils";
import type {
  DailyPlanItem,
  DataSnapshot,
  DictationResult,
  GoalOption,
  GoalProfile,
  GoalRoadmap,
  LearnerLevel,
  Lesson,
  ListeningGoal,
  Rating,
  TargetHorizonDays,
  UserSettings,
  VocabCard
} from "../types/domain";

interface LearningModel {
  lessons: Lesson[];
  settings: UserSettings;
  snapshot: DataSnapshot;
}

export const LEARNER_LEVEL_OPTIONS: GoalOption<LearnerLevel>[] = [
  {
    value: "foundation",
    label: "刚打基础",
    caption: "能听懂慢速材料，需要建立声音到意义的连接。"
  },
  {
    value: "reader",
    label: "看得懂听不出",
    caption: "阅读词汇不少，但自然语速会丢词、漏词。"
  },
  {
    value: "realworld",
    label: "冲真实材料",
    caption: "想进入播客、会议、美剧、新闻等真实语速。"
  }
];

export const TARGET_HORIZON_OPTIONS: GoalOption<TargetHorizonDays>[] = [
  { value: 30, label: "30 天", caption: "先建立稳定训练和慢速理解。" },
  { value: 90, label: "90 天", caption: "把无字幕理解率推到可感知。" },
  { value: 180, label: "180 天", caption: "完成从精听到真实材料的迁移。" }
];

export const GOAL_PROFILES: Record<ListeningGoal, GoalProfile> = {
  daily: {
    id: "daily",
    title: "日常交流听懂",
    promise: "6 个月内，把看得懂的日常英语变成能直接听懂的声音。",
    audience: "适合想听懂生活对话、学习播客、短视频和普通聊天的人。",
    evidence: "用可懂输入、跟读和听写，把连读、弱读、熟词听不出逐个打掉。",
    topicHints: ["生活", "周末", "Daily"],
    milestones: [
      { day: 30, title: "声音地基", outcome: "能稳定听懂慢速英语和 B1 生活对话主旨。", evidence: "连续训练 20 天，完成 12 小时可理解输入。" },
      { day: 90, title: "无字幕入门", outcome: "生活类视频第一遍能抓住 60%-70% 信息。", evidence: "听写平均 75% 以上，常见连读弱读可复述。" },
      { day: 180, title: "真实语速迁移", outcome: "进入真实语速播客/访谈，能先听懂主线再补细节。", evidence: "完成 100 小时以上训练，盲区从生词转向口音和信息密度。" }
    ]
  },
  shows: {
    id: "shows",
    title: "无字幕看生活类剧",
    promise: "从字幕依赖，推进到能听懂生活类剧集和 vlog 的主要情节。",
    audience: "适合想看 Friends、Modern Family、YouTube vlog 的学习者。",
    evidence: "优先训练日常高频表达、弱读、语调和短句反应速度。",
    topicHints: ["生活", "周末", "Daily"],
    milestones: [
      { day: 30, title: "台词识别", outcome: "能听出常见日常句型和高频功能词。", evidence: "完成 8 篇生活对话，错句复听能还原关键词。" },
      { day: 90, title: "片段理解", outcome: "无字幕 3 分钟生活片段能抓住人物关系和主要动作。", evidence: "跟读节奏稳定，弱读/连读标记下降。" },
      { day: 180, title: "整集迁移", outcome: "生活类剧集能先无字幕看主线，再用字幕补细节。", evidence: "听写平均 85% 左右，熟词听不出明显减少。" }
    ]
  },
  work: {
    id: "work",
    title: "工作会议听懂",
    promise: "把会议、产品讨论和工作更新从关键词猜测变成结构化理解。",
    audience: "适合需要听英文会议、跨境协作、产品/技术讨论的人。",
    evidence: "训练会议话题、信息密度、商务词汇和真实语速下的要点捕捉。",
    topicHints: ["工作", "会议", "Work", "Product"],
    milestones: [
      { day: 30, title: "会议关键词", outcome: "能听出会议中的任务、时间、风险和结论。", evidence: "完成工作类材料精听，商务词汇进入听力卡。" },
      { day: 90, title: "要点复述", outcome: "5 分钟工作更新能听出结构，并用中文复述主线。", evidence: "听写平均 75% 以上，数字和动词短语漏听减少。" },
      { day: 180, title: "实时跟会", outcome: "普通产品/运营会议能跟上主旨，记录下一步行动。", evidence: "真实语速材料完成率稳定，错因集中到专业词和口音。" }
    ]
  },
  podcast: {
    id: "podcast",
    title: "播客新闻听懂",
    promise: "从学习材料过渡到真实播客、访谈和新闻摘要。",
    audience: "适合想听 TED、访谈、新闻 brief 和知识类播客的人。",
    evidence: "训练信息密度、数字、口音切换和长句中的重音线索。",
    topicHints: ["新闻", "News", "信息"],
    milestones: [
      { day: 30, title: "摘要抓主旨", outcome: "慢速新闻和短播客能听出主题、人物、时间。", evidence: "完成 10 小时泛听和 4 次听写校准。" },
      { day: 90, title: "信息密度适应", outcome: "真实播客片段能听出主线和 3 个以上关键细节。", evidence: "数字、地名、转折词漏听下降。" },
      { day: 180, title: "真实材料常态化", outcome: "能把播客作为日常输入，不再只依赖学习型音频。", evidence: "每周至少 3 次真实材料，盲区有针对性复听。" }
    ]
  }
};

export function recommendLesson(model: LearningModel): Lesson {
  const scored = model.lessons.map((lesson) => ({ lesson, score: lessonScore(model, lesson) }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.lesson;
  if (!best) throw new Error("课程数据为空");
  return best;
}

export function buildGoalRoadmap(model: LearningModel): GoalRoadmap {
  const profile = GOAL_PROFILES[model.settings.listeningGoal] || GOAL_PROFILES.daily;
  const horizonDays = model.settings.targetHorizonDays || 180;
  const completedMinutes = totalMinutes(model.snapshot);
  const targetMinutes = Math.max(1, model.settings.dailyGoalMinutes * horizonDays);
  const progressPercent = clamp(Math.round((completedMinutes / targetMinutes) * 100), 0, 100);
  const milestones = profile.milestones.filter((item) => item.day <= horizonDays);
  const visibleMilestones = milestones.length ? milestones : [profile.milestones[0]];
  const nextMilestone = visibleMilestones.find((item) => completedMinutes < item.day * model.settings.dailyGoalMinutes) || visibleMilestones[visibleMilestones.length - 1];
  const phase = phaseForProgress(progressPercent);

  return {
    profile,
    levelLabel: optionLabel(LEARNER_LEVEL_OPTIONS, model.settings.learnerLevel),
    horizonDays,
    targetDateLabel: targetDateLabel(model.settings.startedAt || localDate(), horizonDays),
    targetMinutes,
    completedMinutes,
    activeDays: activeDays(model.snapshot),
    progressPercent,
    phaseName: phase.name,
    phaseDescription: phase.description,
    nextMilestone,
    milestones: visibleMilestones,
    weeklyProof: weeklyProof(model.snapshot)
  };
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
  const profile = GOAL_PROFILES[model.settings.listeningGoal] || GOAL_PROFILES.daily;
  const targetComprehension = model.settings.learnerLevel === "foundation" ? 86 : model.settings.learnerLevel === "realworld" ? 70 : 78;

  let score = 100 - Math.abs(lesson.comprehension - targetComprehension);
  if (model.settings.preferredAccent !== "自动" && lesson.accent === model.settings.preferredAccent) score += 12;
  if (lesson.focus.some((item) => topTypes.has(item))) score += 18;
  if (profile.topicHints.some((hint) => lesson.topic.includes(hint) || lesson.series.includes(hint) || lesson.summary.includes(hint))) score += 14;
  if (model.settings.learnerLevel === "foundation" && lesson.level === "B1") score += 8;
  if (model.settings.learnerLevel === "realworld" && lesson.level === "B2") score += 8;
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

function totalMinutes(snapshot: DataSnapshot): number {
  return Math.round(snapshot.attempts.reduce((sum, item) => sum + item.durationSeconds, 0) / 60);
}

function activeDays(snapshot: DataSnapshot): number {
  return new Set(snapshot.attempts.map((item) => item.date)).size;
}

function weeklyProof(snapshot: DataSnapshot): string {
  const recent = snapshot.attempts.slice(-12);
  const scores = recent.map((item) => item.score).filter((score): score is number => typeof score === "number");
  const avg = average(scores);
  if (avg !== null) return `最近听写平均 ${Math.round(avg)}%，用结果判断是否升级材料。`;
  if (snapshot.mistakes.length) return `已经记录 ${snapshot.mistakes.length} 个盲区，下一步按最高频错因复听。`;
  return "先完成 3 轮训练，系统会用听写和盲区生成下一周重点。";
}

function phaseForProgress(progressPercent: number): { name: string; description: string } {
  if (progressPercent < 20) {
    return {
      name: "第 1 阶段 · 打地基",
      description: "建立声音到意义的直连，先把可懂材料听稳。"
    };
  }
  if (progressPercent < 65) {
    return {
      name: "第 2 阶段 · 扩大输入",
      description: "提高语速、口音和生活场景覆盖，减少字幕依赖。"
    };
  }
  return {
    name: "第 3 阶段 · 真实迁移",
    description: "进入真实语速材料，用听写和盲区复听补细节。"
  };
}

function targetDateLabel(startedAt: string, horizonDays: number): string {
  const base = new Date(`${startedAt}T00:00:00`);
  const date = Number.isNaN(base.getTime()) ? new Date() : base;
  date.setDate(date.getDate() + horizonDays);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function optionLabel<T extends string | number>(options: GoalOption<T>[], value: T): string {
  return options.find((item) => item.value === value)?.label || String(value);
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
