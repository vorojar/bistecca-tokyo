import "./styles/app.css";
import { AudioEngine } from "./core/audio";
import { MISTAKE_TYPES } from "./core/config";
import { openListeningDb, type ListeningDb } from "./core/db";
import { parseRoute, transitionDirection } from "./core/router";
import { $, $$, clamp, downloadJson, localDate, normalizeWords, readJsonFile, slugify } from "./core/utils";
import {
  dictationTarget,
  dueCards,
  findLesson,
  getSentenceIndex,
  loopState,
  nextDueDate,
  renderContext,
  renderPage,
  renderShell,
  revealState,
  trainMode,
  type ViewModel
} from "./ui/views";
import type {
  Lesson,
  LessonPayload,
  Rating,
  RouteState,
  UserSettings
} from "./types/domain";

interface AppState extends ViewModel {
  db: ListeningDb | null;
  audio: AudioEngine;
  route: RouteState | null;
  previousRoute: RouteState | null;
  lastTab: string;
  suppressTransition: boolean;
}

const state: AppState = {
  lessons: [],
  db: null,
  audio: new AudioEngine(),
  settings: {
    key: "user",
    dailyGoalMinutes: 45,
    defaultRate: 1,
    showTranscriptFirst: false,
    preferredAccent: "自动",
    reduceMotion: false
  },
  snapshot: {
    progress: [],
    attempts: [],
    mistakes: [],
    vocabCards: []
  },
  route: null,
  previousRoute: null,
  lastTab: "today",
  libraryFilter: "全部",
  sentenceIndex: {},
  revealByLesson: {},
  loopByLesson: {},
  modeByLesson: {},
  dictationText: "",
  dictationResult: null,
  vocabIndex: 0,
  vocabRevealed: false,
  suppressTransition: false
};

document.addEventListener("DOMContentLoaded", init);

async function init(): Promise<void> {
  try {
    const [payload, db] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/lessons.json`).then((response) => response.json() as Promise<LessonPayload>),
      openListeningDb()
    ]);

    state.lessons = payload.lessons;
    state.db = db;
    await db.seed(state.lessons);
    await refreshData();

    const app = $("#app");
    if (!app) throw new Error("缺少 #app 根节点");
    app.innerHTML = renderShell();
    bindEvents();
    registerServiceWorker();

    if (!location.hash) {
      location.hash = "#/today";
      return;
    }

    await renderRoute();
  } catch (error) {
    console.error(error);
    const app = $("#app");
    if (app) {
      app.innerHTML = `
        <main class="boot-screen">
          <div class="boot-card">
            <div class="brand-mark">A</div>
            <h1>初始化失败</h1>
            <p>请刷新页面，或检查浏览器是否允许 IndexedDB 和本地缓存。</p>
          </div>
        </main>
      `;
    }
  }
}

async function refreshData(): Promise<void> {
  const db = requireDb();
  const [settings, snapshot] = await Promise.all([db.loadSettings(), db.snapshot()]);
  state.settings = settings;
  state.snapshot = snapshot;
}

function bindEvents(): void {
  window.addEventListener("hashchange", () => void renderRoute());
  document.addEventListener("click", (event) => void onClick(event));
  document.addEventListener("input", onInput);
  document.addEventListener("change", (event) => void onChange(event));
  window.addEventListener("keydown", (event) => void onKeydown(event));
}

async function renderRoute(): Promise<void> {
  await refreshData();
  const parsed = parseRoute(state.lastTab);
  const route = parsed.route;
  state.lastTab = parsed.nextLastTab;
  const direction = transitionDirection(state.route, route, state.suppressTransition || state.settings.reduceMotion);
  state.previousRoute = state.route;
  state.route = route;
  state.suppressTransition = false;

  setActiveNavigation(route.tab);
  const view = $("#view");
  const context = $("#context-panel");
  if (!view || !context) return;

  view.innerHTML = renderPage(route, state);
  context.innerHTML = renderContext(route, state);
  animateView(direction);
  (view as HTMLElement).focus({ preventScroll: true });
}

function setActiveNavigation(tab: string): void {
  $$(".nav-link, .tab-link").forEach((link) => {
    const active = (link as HTMLElement).dataset.tab === tab;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function animateView(direction: "none" | "forward" | "back" | "tab"): void {
  const view = $("#view") as HTMLElement | null;
  if (!view || direction === "none" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const from = {
    forward: "translate3d(28px,0,0)",
    back: "translate3d(-22px,0,0)",
    tab: "translate3d(0,10px,0)"
  }[direction];

  view.animate([
    { opacity: 0.001, transform: from },
    { opacity: 1, transform: "translate3d(0,0,0)" }
  ], {
    duration: direction === "tab" ? 170 : 230,
    easing: "cubic-bezier(0.32, 0.72, 0, 1)"
  });
}

async function onClick(event: MouseEvent): Promise<void> {
  const target = (event.target as Element | null)?.closest<HTMLElement>("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const route = parseRoute(state.lastTab).route;
  const lesson = route.id ? findLesson(state.lessons, route.id) : undefined;

  if (action === "filter-level") {
    state.libraryFilter = target.dataset.level || "全部";
    rerender();
    return;
  }

  if (action === "set-mode" && lesson) {
    const mode = target.dataset.mode;
    if (mode === "精听" || mode === "跟读") state.modeByLesson[lesson.id] = mode;
    rerender();
    return;
  }

  if (action === "set-sentence" && lesson) {
    state.sentenceIndex[lesson.id] = Number(target.dataset.index || 0);
    rerender();
    return;
  }

  if (action === "prev-sentence" && lesson) {
    shiftSentence(lesson, -1);
    return;
  }

  if (action === "next-sentence" && lesson) {
    shiftSentence(lesson, 1);
    return;
  }

  if (action === "toggle-reveal" && lesson) {
    state.revealByLesson[lesson.id] = !revealState(state, lesson);
    rerender();
    return;
  }

  if (action === "toggle-loop" && lesson) {
    state.loopByLesson[lesson.id] = !loopState(state, lesson);
    rerender();
    return;
  }

  if (action === "play-current" && lesson) {
    await playCurrent(lesson);
    return;
  }

  if (action === "speed") {
    await saveSetting("defaultRate", Number(target.dataset.speed || 1));
    toast(`语速 ${target.dataset.speed}x`);
    rerender();
    return;
  }

  if (action === "toggle-mistake" && lesson) {
    await toggleMistake(lesson, target.dataset.type || MISTAKE_TYPES[0]);
    rerender();
    return;
  }

  if (action === "complete-lesson" && lesson) {
    await completeAttempt(lesson);
    rerender();
    return;
  }

  if (action === "play-dictation" && lesson) {
    await state.audio.playText(dictationTarget(lesson), lesson.accent, state.settings.defaultRate);
    return;
  }

  if (action === "check-dictation" && lesson) {
    await checkDictation(lesson);
    rerender();
    return;
  }

  if (action === "clear-dictation") {
    state.dictationText = "";
    state.dictationResult = null;
    rerender();
    return;
  }

  if (action === "play-vocab") {
    await state.audio.playText(target.dataset.term || "", "US", state.settings.defaultRate);
    return;
  }

  if (action === "reveal-vocab") {
    state.vocabRevealed = true;
    rerender();
    return;
  }

  if (action === "review-vocab") {
    const rating = target.dataset.rating;
    if (rating === "again" || rating === "hard" || rating === "good") {
      await reviewVocab(rating);
      rerender();
    }
    return;
  }

  if (action === "export-data") {
    const data = await requireDb().exportData();
    downloadJson(`auralift-backup-${localDate()}.json`, data);
    toast("数据已导出");
    return;
  }

  if (action === "import-data") {
    $("#import-file")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return;
  }

  if (action === "reset-data") {
    if (window.confirm("确认清空本机训练数据？此操作不可撤销。")) {
      await requireDb().clearUserData();
      state.vocabIndex = 0;
      toast("本机数据已清空");
      await renderRoute();
    }
  }
}

function onInput(event: Event): void {
  const target = event.target as HTMLTextAreaElement | null;
  if (target?.matches("[data-role='dictation-input']")) {
    state.dictationText = target.value;
  }
}

async function onChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  if (!target) return;

  if (target.id === "import-file" && target instanceof HTMLInputElement && target.files?.[0]) {
    try {
      const payload = await readJsonFile(target.files[0]);
      await requireDb().importData(payload);
      toast("数据已导入");
      await renderRoute();
    } catch (error) {
      console.error(error);
      toast("导入失败：文件格式不正确");
    }
    return;
  }

  const key = target.dataset.setting as keyof UserSettings | undefined;
  if (!key) return;

  let value: unknown = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
  if (key === "dailyGoalMinutes" || key === "defaultRate") value = Number(value);
  await saveSetting(key, value as never);
  toast("设置已保存");
  rerender();
}

async function onKeydown(event: KeyboardEvent): Promise<void> {
  const route = parseRoute(state.lastTab).route;
  const lesson = route.id ? findLesson(state.lessons, route.id) : undefined;
  if (!lesson || route.name !== "train") return;

  if (event.key === " ") {
    event.preventDefault();
    await playCurrent(lesson);
  }
  if (event.key === "ArrowLeft") shiftSentence(lesson, -1);
  if (event.key === "ArrowRight") shiftSentence(lesson, 1);
}

function rerender(): void {
  state.suppressTransition = true;
  void renderRoute();
}

function shiftSentence(lesson: Lesson, delta: number): void {
  const current = getSentenceIndex(state, lesson);
  state.sentenceIndex[lesson.id] = clamp(current + delta, 0, lesson.sentences.length - 1);
  rerender();
}

async function playCurrent(lesson: Lesson): Promise<void> {
  const index = getSentenceIndex(state, lesson);
  const sentence = lesson.sentences[index];
  await state.audio.playSentence(lesson, sentence, state.settings.defaultRate);
  if (!loopState(state, lesson) && index < lesson.sentences.length - 1) {
    state.sentenceIndex[lesson.id] = index + 1;
    rerender();
  }
}

async function saveSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): Promise<void> {
  state.settings = { ...state.settings, [key]: value };
  await requireDb().saveSettings(state.settings);
}

async function toggleMistake(lesson: Lesson, type: string): Promise<void> {
  const sentence = lesson.sentences[getSentenceIndex(state, lesson)];
  const id = `${sentence.id}-${slugify(type)}`;
  const existing = await requireDb().get("mistakes", id);
  if (existing) {
    await requireDb().delete("mistakes", id);
    toast(`已取消：${type}`);
    return;
  }

  await requireDb().put("mistakes", {
    id,
    lessonId: lesson.id,
    sentenceId: sentence.id,
    type,
    note: sentence.note,
    text: sentence.text,
    date: localDate(),
    createdAt: new Date().toISOString()
  });
  toast(`已标记：${type}`);
}

async function completeAttempt(lesson: Lesson): Promise<void> {
  const current = getSentenceIndex(state, lesson);
  const existing = await requireDb().get("progress", lesson.id);
  const completedSentences = Math.max(existing?.completedSentences || 0, current + 1);
  const completed = completedSentences >= lesson.sentences.length;

  await requireDb().put("progress", {
    lessonId: lesson.id,
    completedSentences,
    completed,
    updatedAt: new Date().toISOString()
  });

  await requireDb().add("attempts", {
    lessonId: lesson.id,
    mode: trainMode(state, lesson),
    date: localDate(),
    durationSeconds: Math.max(120, (current + 1) * 70),
    createdAt: new Date().toISOString()
  });

  toast(completed ? "材料已完成" : "本轮已记录");
}

async function checkDictation(lesson: Lesson): Promise<void> {
  const target = dictationTarget(lesson);
  const correct = normalizeWords(target);
  const input = normalizeWords(state.dictationText);
  const words = correct.map((word, index) => ({ word, missed: input[index] !== word }));
  const matched = words.filter((item) => !item.missed).length;
  const score = correct.length ? Math.round((matched / correct.length) * 100) : 0;
  state.dictationResult = { score, words };

  await requireDb().add("attempts", {
    lessonId: lesson.id,
    mode: "听写",
    date: localDate(),
    durationSeconds: 300,
    score,
    createdAt: new Date().toISOString()
  });

  if (score < 85) {
    await requireDb().put("mistakes", {
      id: `${lesson.id}-dictation-${Date.now()}`,
      lessonId: lesson.id,
      sentenceId: `${lesson.id}-dictation`,
      type: "听写漏听",
      note: `听写得分 ${score}%`,
      text: target,
      date: localDate(),
      createdAt: new Date().toISOString()
    });
  }

  toast(`听写 ${score}%`);
}

async function reviewVocab(rating: Rating): Promise<void> {
  const cards = dueCards(state);
  if (!cards.length) return;
  const card = cards[Math.min(state.vocabIndex, cards.length - 1)];
  const easeDelta = rating === "again" ? -1 : rating === "good" ? 1 : 0;

  await requireDb().put("vocabCards", {
    ...card,
    ease: clamp(card.ease + easeDelta, 1, 7),
    reviewCount: card.reviewCount + 1,
    lastRating: rating,
    dueDate: nextDueDate(rating, card.ease)
  });

  state.vocabIndex = Math.min(state.vocabIndex + 1, cards.length - 1);
  state.vocabRevealed = false;
  toast("复习已保存");
}

function toast(message: string): void {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove("show"), 1800);
}

let toastTimer = 0;

function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  const swUrl = `${import.meta.env.BASE_URL}service-worker.js`;
  navigator.serviceWorker.register(swUrl).catch(() => {});
}

function requireDb(): ListeningDb {
  if (!state.db) throw new Error("数据库尚未初始化");
  return state.db;
}
