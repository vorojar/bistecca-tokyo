const DB_NAME = "auralift-listening-v1";
const DB_VERSION = 1;
const STORE_NAMES = ["progress", "attempts", "mistakes", "vocabCards", "settings"];
const MISTAKE_TYPES = ["连读", "弱读", "生词", "口音", "语速快", "熟词听不出"];
const ROUTE_TABS = [
  { id: "today", label: "今日", icon: "T", href: "#/today" },
  { id: "library", label: "素材", icon: "L", href: "#/library" },
  { id: "vocab", label: "词汇", icon: "V", href: "#/vocab" },
  { id: "stats", label: "统计", icon: "S", href: "#/stats" },
  { id: "settings", label: "设置", icon: "G", href: "#/settings" }
];

const state = {
  lessons: [],
  db: null,
  settings: null,
  snapshot: null,
  lastRoute: null,
  libraryFilter: "全部",
  sentenceIndex: {},
  revealByLesson: {},
  loopByLesson: {},
  trainModeByLesson: {},
  dictationText: "",
  dictationResult: null,
  vocabIndex: 0,
  vocabRevealed: false,
  lastTab: "today",
  skipAnimation: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const [lessonPayload, db] = await Promise.all([
      fetch("data/lessons.json").then((response) => response.json()),
      openDatabase()
    ]);

    state.lessons = lessonPayload.lessons;
    state.db = db;
    await seedDatabase();
    await loadSettings();
    renderShell();
    bindGlobalEvents();

    if (!location.hash) {
      location.hash = "#/today";
      return;
    }

    await renderRoute();
  } catch (error) {
    $("#app").innerHTML = `
      <div class="boot-screen">
        <div class="boot-mark">A</div>
        <p>应用初始化失败。请通过本地服务或 GitHub Pages 打开，而不是直接双击 HTML。</p>
      </div>
    `;
    console.error(error);
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "lessonId" });
      }
      if (!db.objectStoreNames.contains("attempts")) {
        const store = db.createObjectStore("attempts", { keyPath: "id", autoIncrement: true });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("lessonId", "lessonId", { unique: false });
      }
      if (!db.objectStoreNames.contains("mistakes")) {
        const store = db.createObjectStore("mistakes", { keyPath: "id" });
        store.createIndex("lessonId", "lessonId", { unique: false });
        store.createIndex("sentenceId", "sentenceId", { unique: false });
      }
      if (!db.objectStoreNames.contains("vocabCards")) {
        const store = db.createObjectStore("vocabCards", { keyPath: "id" });
        store.createIndex("dueDate", "dueDate", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const dbApi = {
  get(storeName, key) {
    const tx = state.db.transaction(storeName, "readonly");
    return dbRequest(tx.objectStore(storeName).get(key));
  },
  getAll(storeName) {
    const tx = state.db.transaction(storeName, "readonly");
    return dbRequest(tx.objectStore(storeName).getAll());
  },
  put(storeName, value) {
    const tx = state.db.transaction(storeName, "readwrite");
    return dbRequest(tx.objectStore(storeName).put(value));
  },
  add(storeName, value) {
    const tx = state.db.transaction(storeName, "readwrite");
    return dbRequest(tx.objectStore(storeName).add(value));
  },
  delete(storeName, key) {
    const tx = state.db.transaction(storeName, "readwrite");
    return dbRequest(tx.objectStore(storeName).delete(key));
  }
};

async function seedDatabase() {
  const existingSettings = await dbApi.get("settings", "user");
  if (!existingSettings) {
    await dbApi.put("settings", {
      key: "user",
      dailyGoalMinutes: 45,
      defaultRate: 1,
      showTranscriptFirst: false,
      preferredAccent: "自动"
    });
  }

  const existingCards = await dbApi.getAll("vocabCards");
  if (existingCards.length > 0) return;

  const today = localDate();
  const cards = state.lessons.flatMap((lesson) => lesson.vocab.map((item) => ({
    id: `${lesson.id}-${slugify(item.term)}`,
    lessonId: lesson.id,
    term: item.term,
    meaning: item.meaning,
    example: item.example,
    dueDate: today,
    ease: 2,
    reviewCount: 0,
    lastRating: null
  })));

  await Promise.all(cards.map((card) => dbApi.put("vocabCards", card)));
}

async function loadSettings() {
  const record = await dbApi.get("settings", "user");
  state.settings = record;
}

async function loadSnapshot() {
  const [progress, attempts, mistakes, vocabCards] = await Promise.all([
    dbApi.getAll("progress"),
    dbApi.getAll("attempts"),
    dbApi.getAll("mistakes"),
    dbApi.getAll("vocabCards")
  ]);

  state.snapshot = { progress, attempts, mistakes, vocabCards };
}

function renderShell() {
  const app = $("#app");
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#/today" aria-label="返回今日训练">
          <span class="brand-mark">A</span>
          <span>
            <span class="brand-title">Auralift</span>
            <span class="brand-sub">听力训练工作台</span>
          </span>
        </a>
        <nav class="side-nav" aria-label="主导航">
          ${ROUTE_TABS.map(renderNavLink).join("")}
        </nav>
        <div class="sidebar-card">
          <strong>训练原则</strong>
          <p>先听，后看文字。每次只抓一个盲区，重复比数量更重要。</p>
        </div>
      </aside>
      <main class="main-area">
        <div class="topbar">
          <a class="brand" href="#/today" aria-label="返回今日训练">
            <span class="brand-mark">A</span>
            <span>
              <span class="brand-title">Auralift</span>
              <span class="brand-sub">今日训练</span>
            </span>
          </a>
          <a class="btn compact" href="#/library">选材料</a>
        </div>
        <div class="view-shell">
          <div class="app-grid">
            <section id="view" tabindex="-1"></section>
            <aside id="context-panel" class="context-panel" aria-label="训练上下文"></aside>
          </div>
        </div>
      </main>
      <nav class="bottom-tabs" aria-label="底部导航">
        ${ROUTE_TABS.map(renderTabLink).join("")}
      </nav>
    </div>
    <div id="toast" role="status" aria-live="polite"></div>
  `;
}

function renderNavLink(item) {
  return `
    <a class="nav-link" data-tab="${item.id}" href="${item.href}">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </a>
  `;
}

function renderTabLink(item) {
  return `
    <a class="tab-link" data-tab="${item.id}" href="${item.href}">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </a>
  `;
}

function bindGlobalEvents() {
  window.addEventListener("hashchange", renderRoute);
  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
}

async function renderRoute() {
  await loadSettings();
  await loadSnapshot();

  const route = parseRoute();
  const view = $("#view");
  if (!view) return;

  setActiveNavigation(route.tab);

  const direction = getTransitionDirection(route);
  state.lastRoute = route;
  view.innerHTML = await renderPage(route);
  $("#context-panel").innerHTML = renderContext(route);
  animateView(direction);
  view.focus({ preventScroll: true });
}

function parseRoute() {
  const rawPath = location.hash.replace(/^#/, "") || "/today";
  const parts = rawPath.split("/").filter(Boolean);
  const name = parts[0] || "today";
  const id = parts[1] || null;
  const isDetail = name === "train" || name === "dictation";
  const isKnownTab = ROUTE_TABS.some((item) => item.id === name);
  const tab = isDetail ? state.lastTab : name;
  if (!isDetail && isKnownTab) state.lastTab = name;
  return {
    name,
    id,
    path: rawPath,
    tab,
    depth: isDetail ? 1 : 0
  };
}

function getTransitionDirection(route) {
  if (state.skipAnimation) {
    state.skipAnimation = false;
    return "none";
  }

  if (!state.lastRoute) return "forward";
  if (route.depth > state.lastRoute.depth) return "forward";
  if (route.depth < state.lastRoute.depth) return "back";
  if (route.path !== state.lastRoute.path) return "tab";
  return "none";
}

function animateView(direction) {
  const view = $("#view");
  if (!view || direction === "none" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const from = {
    forward: "translate3d(28px, 0, 0)",
    back: "translate3d(-22px, 0, 0)",
    tab: "translate3d(0, 12px, 0)"
  }[direction] || "translate3d(0, 8px, 0)";

  view.animate([
    { opacity: 0.001, transform: from },
    { opacity: 1, transform: "translate3d(0, 0, 0)" }
  ], {
    duration: direction === "tab" ? 180 : 240,
    easing: "cubic-bezier(0.32, 0.72, 0, 1)"
  });
}

function setActiveNavigation(tab) {
  $$(".nav-link, .tab-link").forEach((link) => {
    const active = link.dataset.tab === tab;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

async function renderPage(route) {
  if (route.name === "today") return renderToday();
  if (route.name === "library") return renderLibrary();
  if (route.name === "train") return renderTrain(route.id);
  if (route.name === "dictation") return renderDictation(route.id);
  if (route.name === "vocab") return renderVocab();
  if (route.name === "stats") return renderStats();
  if (route.name === "settings") return renderSettings();
  return renderNotFound();
}

function renderToday() {
  const todayMinutes = getTodayMinutes();
  const goal = state.settings.dailyGoalMinutes;
  const recommended = pickRecommendedLesson();
  const progress = getProgressMap();
  const completedLessons = state.snapshot.progress.filter((item) => item.completed).length;
  const dueCards = getDueVocabCards().length;
  const streak = getStreakDays();

  return `
    <div class="stack">
      <header class="page-head">
        <div>
          <p class="eyebrow">Today</p>
          <h1>今天完成一个听力闭环</h1>
          <p class="lead">先精听一句，再跟读和标记盲区。系统会把真实听错的内容推到词汇和复习里。</p>
        </div>
      </header>

      <section class="hero-panel">
        <div class="hero-content">
          <p class="eyebrow">推荐材料 · ${escapeHtml(recommended.level)} · ${escapeHtml(recommended.accent)}</p>
          <h2>${escapeHtml(recommended.title)}</h2>
          <p class="lead">${escapeHtml(recommended.summary)}</p>
          <div class="actions">
            <a class="btn primary" href="#/train/${recommended.id}">开始精听</a>
            <a class="btn" href="#/dictation/${recommended.id}">做听写</a>
            <a class="btn ghost" href="#/library">换一个材料</a>
          </div>
        </div>
      </section>

      <section class="grid-3">
        <div class="metric"><strong>${todayMinutes}</strong><span>今日已练分钟 / 目标 ${goal}</span></div>
        <div class="metric"><strong>${streak}</strong><span>连续训练天数</span></div>
        <div class="metric"><strong>${dueCards}</strong><span>今日待复习听力词汇</span></div>
      </section>

      <section class="panel">
        <div class="lesson-card-head">
          <div>
            <p class="eyebrow">Daily Plan</p>
            <h2>今日训练</h2>
          </div>
          <a class="btn compact" href="#/stats">看盲区</a>
        </div>
        <div class="lesson-list">
          ${state.lessons.slice(0, 3).map((lesson) => renderPlanLesson(lesson, progress.get(lesson.id))).join("")}
        </div>
      </section>

      <section class="grid-2">
        <div class="panel">
          <h3>精听流程</h3>
          <p class="muted">听一句，暂停，复述，再看原文。每次训练只标记最明显的盲区。</p>
        </div>
        <div class="panel">
          <h3>输入比例</h3>
          <p class="muted">主动听优先，泛听用于补充暴露。听不懂 90% 的材料先降级。</p>
        </div>
      </section>
    </div>
  `;
}

function renderPlanLesson(lesson, progress) {
  const value = progress ? Math.min(100, Math.round((progress.completedSentences / lesson.sentences.length) * 100)) : 0;
  return `
    <article class="lesson-card">
      <div class="lesson-card-head">
        <div>
          <h3 class="lesson-title">${escapeHtml(lesson.title)}</h3>
          <div class="lesson-meta">
            <span>${escapeHtml(lesson.series)}</span>
            <span>${escapeHtml(lesson.level)}</span>
            <span>${formatDuration(lesson.duration)}</span>
            <span>可懂度 ${lesson.comprehension}%</span>
          </div>
        </div>
        <a class="btn compact primary" href="#/train/${lesson.id}">训练</a>
      </div>
      <div class="tags">
        ${lesson.focus.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
      </div>
      <div class="progress-line" aria-label="完成进度" style="--value:${value}%"><span></span></div>
    </article>
  `;
}

function renderLibrary() {
  const levels = ["全部", ...new Set(state.lessons.map((lesson) => lesson.level))];
  const lessons = state.libraryFilter === "全部"
    ? state.lessons
    : state.lessons.filter((lesson) => lesson.level === state.libraryFilter);

  return `
    <div class="stack">
      <header class="page-head">
        <div>
          <p class="eyebrow">Library</p>
          <h1>选择可理解材料</h1>
          <p class="lead">从略低于当前水平的材料开始。精听材料要短、清晰、可重复。</p>
        </div>
        <div class="segmented" aria-label="等级筛选">
          ${levels.map((level) => `<button data-action="filter-level" data-level="${level}" class="${state.libraryFilter === level ? "active" : ""}">${level}</button>`).join("")}
        </div>
      </header>
      <section class="lesson-list">
        ${lessons.map(renderLibraryCard).join("")}
      </section>
    </div>
  `;
}

function renderLibraryCard(lesson) {
  const progress = getProgressMap().get(lesson.id);
  const value = progress ? Math.min(100, Math.round((progress.completedSentences / lesson.sentences.length) * 100)) : 0;
  return `
    <article class="lesson-card">
      <div class="lesson-card-head">
        <div>
          <p class="eyebrow">${escapeHtml(lesson.topic)} · ${escapeHtml(lesson.recommendedMode)}</p>
          <h2 class="lesson-title">${escapeHtml(lesson.title)}</h2>
          <p class="muted">${escapeHtml(lesson.summary)}</p>
          <div class="lesson-meta">
            <span>${escapeHtml(lesson.level)}</span>
            <span>${escapeHtml(lesson.accent)}</span>
            <span>${formatDuration(lesson.duration)}</span>
            <span>可懂度 ${lesson.comprehension}%</span>
          </div>
        </div>
        <div class="actions">
          <a class="btn compact primary" href="#/train/${lesson.id}">精听</a>
          <a class="btn compact" href="#/dictation/${lesson.id}">听写</a>
        </div>
      </div>
      <div class="tags">
        ${lesson.focus.map((item, index) => `<span class="tag ${index === 0 ? "green" : ""}">${escapeHtml(item)}</span>`).join("")}
      </div>
      <div class="progress-line" style="--value:${value}%"><span></span></div>
    </article>
  `;
}

function renderTrain(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson) return renderNotFound();

  const index = getSentenceIndex(lesson);
  const sentence = lesson.sentences[index];
  const reveal = getRevealState(lesson);
  const loop = getLoopState(lesson);
  const mode = getTrainMode(lesson);
  const rate = state.settings.defaultRate;
  const markedTypes = getMarkedTypes(sentence.id);

  return `
    <div class="stack">
      <header class="page-head">
        <div>
          <a class="btn compact ghost" href="#/library">返回素材库</a>
          <p class="eyebrow">${escapeHtml(lesson.series)} · ${escapeHtml(lesson.level)} · ${escapeHtml(lesson.accent)}</p>
          <h1>${escapeHtml(lesson.title)}</h1>
          <p class="lead">${escapeHtml(lesson.summary)}</p>
        </div>
        <div class="segmented" aria-label="训练模式">
          ${["精听", "跟读"].map((item) => `<button data-action="set-mode" data-mode="${item}" class="${mode === item ? "active" : ""}">${item}</button>`).join("")}
        </div>
      </header>

      <section class="panel player">
        <div class="player-top">
          <div class="lesson-meta">
            <span>${mode}</span>
            <span>第 ${index + 1} / ${lesson.sentences.length} 句</span>
            <span>语速 ${rate}x</span>
            <span>${loop ? "单句循环" : "顺序训练"}</span>
          </div>
        </div>
        <div class="player-stage">
          <div class="waveform" aria-hidden="true"></div>
          <div class="sentence-display">
            <div class="sentence-number">Sentence ${index + 1}</div>
            <div class="sentence-text ${reveal ? "" : "hidden-text"}">${escapeHtml(sentence.text)}</div>
            <p class="sentence-meaning">${reveal ? escapeHtml(sentence.meaning) : "先听，再决定是否显示原文"}</p>
          </div>
        </div>
        <div class="control-row">
          <button class="btn compact" data-action="prev-sentence">上一句</button>
          <button class="btn primary" data-action="play-current">播放句子</button>
          <button class="btn compact" data-action="next-sentence">下一句</button>
          <button class="btn compact ${reveal ? "success" : ""}" data-action="toggle-reveal">${reveal ? "隐藏原文" : "显示原文"}</button>
          <button class="btn compact ${loop ? "success" : ""}" data-action="toggle-loop">${loop ? "关闭循环" : "单句循环"}</button>
        </div>
      </section>

      <section class="grid-2">
        <div class="panel">
          <h3>标记听力盲区</h3>
          <div class="mark-grid">
            ${MISTAKE_TYPES.map((type) => `<button class="mark-btn ${markedTypes.includes(type) ? "marked" : ""}" data-action="toggle-mistake" data-type="${type}">${type}</button>`).join("")}
          </div>
          <p class="small" style="margin-top:12px;">${escapeHtml(sentence.note)}</p>
        </div>
        <div class="panel">
          <h3>${mode === "跟读" ? "跟读提示" : "精听提示"}</h3>
          <p class="muted">${mode === "跟读" ? "播放后立刻跟读，不看文字。把节奏和重音放在第一位，不急着追求每个音完美。" : "第一遍只听意义，第二遍抓关键词，第三遍再显示原文确认盲区。"}</p>
          <div class="actions">
            <button class="btn compact" data-action="speed" data-speed="0.75">0.75x</button>
            <button class="btn compact" data-action="speed" data-speed="1">1x</button>
            <button class="btn compact" data-action="speed" data-speed="1.15">1.15x</button>
            <button class="btn compact success" data-action="complete-lesson">完成本轮</button>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="lesson-card-head">
          <div>
            <h2>逐句训练</h2>
            <p class="muted">点击任一句直接跳转，适合重复同一段材料。</p>
          </div>
          <a class="btn compact" href="#/dictation/${lesson.id}">进入听写</a>
        </div>
        <div class="sentence-list">
          ${lesson.sentences.map((item, itemIndex) => renderSentenceRow(item, itemIndex, index)).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderSentenceRow(sentence, itemIndex, activeIndex) {
  return `
    <button class="sentence-row ${itemIndex === activeIndex ? "active" : ""}" data-action="set-sentence" data-index="${itemIndex}">
      <strong>${itemIndex + 1}. ${escapeHtml(sentence.text)}</strong>
      <span class="small">${escapeHtml(sentence.meaning)}</span>
    </button>
  `;
}

function renderDictation(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson) return renderNotFound();
  const target = getDictationTarget(lesson);

  return `
    <div class="stack">
      <header class="page-head">
        <div>
          <a class="btn compact ghost" href="#/train/${lesson.id}">返回训练</a>
          <p class="eyebrow">Dictation · ${escapeHtml(lesson.level)} · ${escapeHtml(lesson.accent)}</p>
          <h1>30 秒听写</h1>
          <p class="lead">先播放，不看原文。写完再对照，错词会暴露真实盲区。</p>
        </div>
        <button class="btn primary" data-action="play-dictation">播放片段</button>
      </header>

      <section class="dictation-box">
        <textarea class="dictation-input" data-role="dictation-input" placeholder="听完后把你听到的英文写在这里">${escapeHtml(state.dictationText)}</textarea>
        <div class="actions">
          <button class="btn success" data-action="check-dictation">对照原文</button>
          <button class="btn" data-action="clear-dictation">清空</button>
        </div>
        ${state.dictationResult ? renderDictationResult(target) : ""}
      </section>

      <section class="panel">
        <h2>听写材料</h2>
        <p class="muted">当前片段来自 ${escapeHtml(lesson.title)} 的前 ${Math.min(3, lesson.sentences.length)} 句。第一版使用系统 TTS 播放，后续可以替换为真实音频。</p>
      </section>
    </div>
  `;
}

function renderDictationResult(target) {
  const result = state.dictationResult;
  return `
    <div style="margin-top:18px;">
      <h3>得分 ${result.score}%</h3>
      <p class="muted">绿色为对齐词，红色为漏听或写错。原文如下：</p>
      <div class="compare-result">
        ${result.words.map((item) => `<span class="word ${item.missed ? "missed" : ""}">${escapeHtml(item.word)}</span>`).join("")}
      </div>
      <p class="small" style="margin-top:14px;">${escapeHtml(target)}</p>
    </div>
  `;
}

function renderVocab() {
  const cards = getDueVocabCards();
  if (cards.length === 0) {
    return `
      <div class="stack">
        <header class="page-head">
          <div>
            <p class="eyebrow">Vocab</p>
            <h1>今天没有到期卡片</h1>
            <p class="lead">训练中标记的熟词、生词和听写错词会自动进入这里。</p>
          </div>
        </header>
        <div class="empty">去素材库开始一轮精听，系统会继续生成复习内容。</div>
      </div>
    `;
  }

  const index = Math.min(state.vocabIndex, cards.length - 1);
  const card = cards[index];
  const lesson = findLesson(card.lessonId);

  return `
    <div class="stack">
      <header class="page-head">
        <div>
          <p class="eyebrow">Listening Vocab</p>
          <h1>先听音，再识义</h1>
          <p class="lead">这里不训练拼写优先，而是训练“声音 -> 意义”的直接连接。</p>
        </div>
        <div class="lesson-meta"><span>${index + 1} / ${cards.length}</span><span>${escapeHtml(lesson?.title || "训练材料")}</span></div>
      </header>

      <section class="vocab-card">
        <p class="eyebrow">Audio First</p>
        <button class="btn primary" data-action="play-vocab" data-term="${escapeAttr(card.term)}">播放音频</button>
        <div class="vocab-term ${state.vocabRevealed ? "" : "masked"}">${escapeHtml(card.term)}</div>
        <p class="lead">${state.vocabRevealed ? escapeHtml(card.meaning) : "播放后先在脑中说出意思，再显示答案。"}</p>
        ${state.vocabRevealed ? `<p class="muted">${escapeHtml(card.example)}</p>` : ""}
        <div class="actions">
          <button class="btn" data-action="reveal-vocab">显示答案</button>
          <button class="btn compact" data-action="review-vocab" data-rating="again">没听出</button>
          <button class="btn compact" data-action="review-vocab" data-rating="hard">模糊</button>
          <button class="btn compact success" data-action="review-vocab" data-rating="good">认识</button>
        </div>
      </section>
    </div>
  `;
}

function renderStats() {
  const attempts = state.snapshot.attempts;
  const mistakes = state.snapshot.mistakes;
  const minutes = Math.round(attempts.reduce((sum, item) => sum + (item.durationSeconds || 0), 0) / 60);
  const finishedLessons = state.snapshot.progress.filter((item) => item.completed).length;
  const distribution = getMistakeDistribution();

  return `
    <div class="stack">
      <header class="page-head">
        <div>
          <p class="eyebrow">Stats</p>
          <h1>盲区报告</h1>
          <p class="lead">统计不为了制造焦虑，而是帮你知道下一次该听什么、重复什么。</p>
        </div>
      </header>
      <section class="stat-grid">
        <div class="stat-card"><div class="metric"><strong>${minutes}</strong><span>累计训练分钟</span></div></div>
        <div class="stat-card"><div class="metric"><strong>${attempts.length}</strong><span>训练轮次</span></div></div>
        <div class="stat-card"><div class="metric"><strong>${mistakes.length}</strong><span>已标记盲区</span></div></div>
        <div class="stat-card"><div class="metric"><strong>${finishedLessons}</strong><span>完成材料</span></div></div>
      </section>
      <section class="panel">
        <h2>错误类型分布</h2>
        ${distribution.total === 0 ? `<div class="empty">还没有盲区记录。去训练页标记几处听错原因。</div>` : renderBars(distribution.items)}
      </section>
      <section class="panel">
        <h2>下一步建议</h2>
        <p class="muted">${getNextAdvice(distribution.items)}</p>
      </section>
    </div>
  `;
}

function renderBars(items) {
  return `
    <div class="bar-list">
      ${items.map((item) => `
        <div class="bar-row">
          <span>${escapeHtml(item.type)}</span>
          <div class="bar-track" style="--value:${item.percent}%"><span></span></div>
          <strong>${item.count}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="stack">
      <header class="page-head">
        <div>
          <p class="eyebrow">Settings</p>
          <h1>训练偏好</h1>
          <p class="lead">这些设置保存在本机 IndexedDB。第一版不上传个人数据。</p>
        </div>
      </header>
      <section class="panel">
        <div class="setting-row">
          <div>
            <h3>每日目标</h3>
            <p class="muted">建议 30-60 分钟，保持每天不断比偶尔长时间更有效。</p>
          </div>
          <input class="setting-control" data-setting="dailyGoalMinutes" type="number" min="10" max="180" step="5" value="${state.settings.dailyGoalMinutes}" />
        </div>
        <div class="setting-row">
          <div>
            <h3>默认语速</h3>
            <p class="muted">精听阶段可以降速，但最终要回到正常语速复听。</p>
          </div>
          <select class="setting-control" data-setting="defaultRate">
            ${[0.75, 0.9, 1, 1.15, 1.25].map((rate) => `<option value="${rate}" ${Number(state.settings.defaultRate) === rate ? "selected" : ""}>${rate}x</option>`).join("")}
          </select>
        </div>
        <div class="setting-row">
          <div>
            <h3>首次显示原文</h3>
            <p class="muted">关闭时更符合声音优先；打开适合刚开始建立声音和意义连接。</p>
          </div>
          <label class="switch">
            <input data-setting="showTranscriptFirst" type="checkbox" ${state.settings.showTranscriptFirst ? "checked" : ""} />
            <span></span>
          </label>
        </div>
        <div class="setting-row">
          <div>
            <h3>偏好口音</h3>
            <p class="muted">自动会优先按材料等级推荐，后续可扩展为多口音训练计划。</p>
          </div>
          <select class="setting-control" data-setting="preferredAccent">
            ${["自动", "US", "UK", "AU"].map((accent) => `<option value="${accent}" ${state.settings.preferredAccent === accent ? "selected" : ""}>${accent}</option>`).join("")}
          </select>
        </div>
      </section>
    </div>
  `;
}

function renderContext(route) {
  const lesson = route.id ? findLesson(route.id) : pickRecommendedLesson();
  if (route.name === "stats") {
    return `
      <div class="panel">
        <h3>读图方式</h3>
        <p class="muted">最高频盲区就是下一周精听时最该主动标记和重复的对象。</p>
      </div>
      <div class="panel">
        <h3>有效阈值</h3>
        <p class="muted">材料可懂度低于 60% 时先降级；高于 90% 时可以提速或换真实材料。</p>
      </div>
    `;
  }

  if (route.name === "settings") {
    return `
      <div class="panel">
        <h3>本地数据</h3>
        <p class="muted">进度、听写记录和词汇卡都写入 IndexedDB。换浏览器或清站点数据会丢失。</p>
      </div>
      <div class="panel">
        <h3>后续扩展</h3>
        <p class="muted">账号同步、真实音频和 AI 纠音可以在训练闭环稳定后再接入。</p>
      </div>
    `;
  }

  return `
    <div class="panel">
      <p class="eyebrow">当前材料</p>
      <h3>${escapeHtml(lesson?.title || "未选择材料")}</h3>
      <p class="muted">${escapeHtml(lesson?.summary || "从素材库选择一个可理解材料开始训练。")}</p>
      <div class="tags">
        <span class="tag green">${escapeHtml(lesson?.level || "B1")}</span>
        <span class="tag">${escapeHtml(lesson?.accent || "自动")}</span>
        <span class="tag amber">${lesson?.comprehension || 80}% 可懂</span>
      </div>
    </div>
    <div class="panel">
      <h3>本轮目标</h3>
      <p class="muted">听完 3-6 句即可结束。关键是把一个听错原因记录下来，而不是一次刷完。</p>
    </div>
    <div class="panel">
      <h3>焦点</h3>
      <div class="tags">
        ${(lesson?.focus || ["精听", "跟读"]).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderNotFound() {
  return `
    <div class="stack">
      <header class="page-head">
        <div>
          <p class="eyebrow">Not Found</p>
          <h1>没有找到这个训练页面</h1>
          <p class="lead">可能是材料不存在，或者路由拼写有误。</p>
        </div>
        <a class="btn primary" href="#/today">回到今日</a>
      </header>
    </div>
  `;
}

async function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const route = parseRoute();
  const lesson = route.id ? findLesson(route.id) : null;

  if (action === "filter-level") {
    state.libraryFilter = target.dataset.level;
    refreshRoute();
    return;
  }

  if (action === "set-sentence" && lesson) {
    state.sentenceIndex[lesson.id] = Number(target.dataset.index);
    refreshRoute();
    return;
  }

  if (action === "prev-sentence" && lesson) {
    moveSentence(lesson, -1);
    return;
  }

  if (action === "next-sentence" && lesson) {
    moveSentence(lesson, 1);
    return;
  }

  if (action === "toggle-reveal" && lesson) {
    state.revealByLesson[lesson.id] = !getRevealState(lesson);
    refreshRoute();
    return;
  }

  if (action === "toggle-loop" && lesson) {
    state.loopByLesson[lesson.id] = !getLoopState(lesson);
    refreshRoute();
    return;
  }

  if (action === "set-mode" && lesson) {
    state.trainModeByLesson[lesson.id] = target.dataset.mode;
    refreshRoute();
    return;
  }

  if (action === "speed") {
    await updateSetting("defaultRate", Number(target.dataset.speed));
    toast(`语速已设为 ${target.dataset.speed}x`);
    refreshRoute();
    return;
  }

  if (action === "play-current" && lesson) {
    await playCurrentSentence(lesson);
    return;
  }

  if (action === "toggle-mistake" && lesson) {
    await toggleMistake(lesson, target.dataset.type);
    refreshRoute();
    return;
  }

  if (action === "complete-lesson" && lesson) {
    await completeLessonAttempt(lesson);
    refreshRoute();
    return;
  }

  if (action === "play-dictation" && lesson) {
    await speakText(getDictationTarget(lesson), lesson.accent, state.settings.defaultRate);
    return;
  }

  if (action === "check-dictation" && lesson) {
    await checkDictation(lesson);
    refreshRoute();
    return;
  }

  if (action === "clear-dictation") {
    state.dictationText = "";
    state.dictationResult = null;
    refreshRoute();
    return;
  }

  if (action === "play-vocab") {
    await speakText(target.dataset.term, "US", state.settings.defaultRate);
    return;
  }

  if (action === "reveal-vocab") {
    state.vocabRevealed = true;
    refreshRoute();
    return;
  }

  if (action === "review-vocab") {
    await reviewCurrentVocab(target.dataset.rating);
    refreshRoute();
  }
}

function handleInput(event) {
  if (event.target.matches("[data-role='dictation-input']")) {
    state.dictationText = event.target.value;
  }
}

async function handleChange(event) {
  const settingName = event.target.dataset.setting;
  if (!settingName) return;

  let value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
  if (settingName === "dailyGoalMinutes" || settingName === "defaultRate") {
    value = Number(value);
  }

  await updateSetting(settingName, value);
  toast("设置已保存");
  refreshRoute();
}

function refreshRoute() {
  state.skipAnimation = true;
  renderRoute();
}

function moveSentence(lesson, delta) {
  const current = getSentenceIndex(lesson);
  const next = Math.max(0, Math.min(lesson.sentences.length - 1, current + delta));
  state.sentenceIndex[lesson.id] = next;
  refreshRoute();
}

async function playCurrentSentence(lesson) {
  const index = getSentenceIndex(lesson);
  const sentence = lesson.sentences[index];
  await speakText(sentence.text, lesson.accent, state.settings.defaultRate);

  if (!getLoopState(lesson) && index < lesson.sentences.length - 1) {
    state.sentenceIndex[lesson.id] = index + 1;
    refreshRoute();
  }
}

function speakText(text, accent, rate = 1) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      toast("当前浏览器不支持语音合成");
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = accentToLang(accent);
    utterance.rate = Number(rate) || 1;
    utterance.pitch = 1;

    const voice = pickVoice(utterance.lang);
    if (voice) utterance.voice = voice;

    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
}

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang === lang) || voices.find((voice) => voice.lang.startsWith(lang.split("-")[0])) || null;
}

function accentToLang(accent) {
  if (accent === "UK") return "en-GB";
  if (accent === "AU") return "en-AU";
  return "en-US";
}

async function toggleMistake(lesson, type) {
  const sentence = lesson.sentences[getSentenceIndex(lesson)];
  const id = `${sentence.id}-${slugify(type)}`;
  const existing = await dbApi.get("mistakes", id);

  if (existing) {
    await dbApi.delete("mistakes", id);
    toast(`已取消标记：${type}`);
    return;
  }

  await dbApi.put("mistakes", {
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

async function completeLessonAttempt(lesson) {
  const current = getSentenceIndex(lesson);
  const progress = await dbApi.get("progress", lesson.id);
  const completedSentences = Math.max(progress?.completedSentences || 0, current + 1);
  const completed = completedSentences >= lesson.sentences.length;

  await dbApi.put("progress", {
    lessonId: lesson.id,
    completedSentences,
    completed,
    updatedAt: new Date().toISOString()
  });

  await dbApi.add("attempts", {
    lessonId: lesson.id,
    mode: getTrainMode(lesson),
    date: localDate(),
    durationSeconds: Math.max(120, Math.round((current + 1) * 70)),
    createdAt: new Date().toISOString()
  });

  toast(completed ? "这篇材料已完成" : "本轮训练已记录");
}

async function checkDictation(lesson) {
  const target = getDictationTarget(lesson);
  const correctWords = normalizeWords(target);
  const inputWords = normalizeWords(state.dictationText);
  const words = correctWords.map((word, index) => ({ word, missed: inputWords[index] !== word }));
  const matched = words.filter((item) => !item.missed).length;
  const score = correctWords.length === 0 ? 0 : Math.round((matched / correctWords.length) * 100);

  state.dictationResult = { score, words };

  await dbApi.add("attempts", {
    lessonId: lesson.id,
    mode: "听写",
    date: localDate(),
    durationSeconds: 300,
    score,
    createdAt: new Date().toISOString()
  });

  if (score < 85) {
    await addDictationMistake(lesson, score);
  }

  toast(`听写得分 ${score}%`);
}

async function addDictationMistake(lesson, score) {
  const id = `${lesson.id}-dictation-${Date.now()}`;
  await dbApi.put("mistakes", {
    id,
    lessonId: lesson.id,
    sentenceId: `${lesson.id}-dictation`,
    type: "听写漏听",
    note: `听写得分 ${score}%`,
    text: getDictationTarget(lesson),
    date: localDate(),
    createdAt: new Date().toISOString()
  });
}

async function reviewCurrentVocab(rating) {
  const cards = getDueVocabCards();
  if (cards.length === 0) return;
  const index = Math.min(state.vocabIndex, cards.length - 1);
  const card = cards[index];
  const nextDays = { again: 0, hard: 1, good: Math.max(2, card.ease + 1) }[rating];
  const easeDelta = { again: -1, hard: 0, good: 1 }[rating];

  await dbApi.put("vocabCards", {
    ...card,
    ease: Math.max(1, Math.min(7, card.ease + easeDelta)),
    reviewCount: card.reviewCount + 1,
    lastRating: rating,
    dueDate: localDate(nextDays)
  });

  state.vocabIndex = Math.min(index + 1, cards.length - 1);
  state.vocabRevealed = false;
  toast("复习记录已保存");
}

async function updateSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  await dbApi.put("settings", state.settings);
}

function pickRecommendedLesson() {
  const progress = getProgressMap();
  const accent = state.settings?.preferredAccent;
  const candidates = state.lessons
    .filter((lesson) => !progress.get(lesson.id)?.completed)
    .filter((lesson) => !accent || accent === "自动" || lesson.accent === accent);

  return candidates[0] || state.lessons[0];
}

function findLesson(id) {
  return state.lessons.find((lesson) => lesson.id === id) || null;
}

function getProgressMap() {
  return new Map((state.snapshot?.progress || []).map((item) => [item.lessonId, item]));
}

function getTodayMinutes() {
  const today = localDate();
  const seconds = (state.snapshot?.attempts || [])
    .filter((item) => item.date === today)
    .reduce((sum, item) => sum + (item.durationSeconds || 0), 0);
  return Math.round(seconds / 60);
}

function getStreakDays() {
  const dates = new Set((state.snapshot?.attempts || []).map((item) => item.date));
  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    if (!dates.has(localDate(-offset))) break;
    streak += 1;
  }
  return streak;
}

function getDueVocabCards() {
  const today = localDate();
  return (state.snapshot?.vocabCards || [])
    .filter((card) => card.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function getSentenceIndex(lesson) {
  return state.sentenceIndex[lesson.id] || 0;
}

function getRevealState(lesson) {
  if (state.revealByLesson[lesson.id] === undefined) {
    state.revealByLesson[lesson.id] = Boolean(state.settings.showTranscriptFirst);
  }
  return state.revealByLesson[lesson.id];
}

function getLoopState(lesson) {
  return Boolean(state.loopByLesson[lesson.id]);
}

function getTrainMode(lesson) {
  if (!state.trainModeByLesson[lesson.id]) {
    state.trainModeByLesson[lesson.id] = lesson.recommendedMode === "跟读" ? "跟读" : "精听";
  }
  return state.trainModeByLesson[lesson.id];
}

function getMarkedTypes(sentenceId) {
  return (state.snapshot?.mistakes || [])
    .filter((item) => item.sentenceId === sentenceId)
    .map((item) => item.type);
}

function getDictationTarget(lesson) {
  return lesson.sentences.slice(0, 3).map((sentence) => sentence.text).join(" ");
}

function getMistakeDistribution() {
  const counts = new Map();
  (state.snapshot?.mistakes || []).forEach((item) => {
    counts.set(item.type, (counts.get(item.type) || 0) + 1);
  });
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  const items = Array.from(counts.entries())
    .map(([type, count]) => ({ type, count, percent: total === 0 ? 0 : Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
  return { total, items };
}

function getNextAdvice(items) {
  if (!items.length) return "先完成一轮精听，并至少标记 2 个听错原因。";
  const top = items[0].type;
  if (top === "连读") return "下一轮选生活对话材料，重点重复动词短语和介词连接。";
  if (top === "弱读") return "把功能词放进跟读目标，尤其是 to、of、and、would、have。";
  if (top === "生词") return "先降低材料难度，把新词做成听音识义卡片再回听原句。";
  if (top === "口音") return "保持同一主题，切换 US、UK、AU 口音各听一遍。";
  if (top === "语速快") return "先 0.75x 精听，再 1x 复听，最后只听关键词复述。";
  return "继续用同一材料重复 3 轮，每轮只解决一个最高频盲区。";
}

function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function localDate(dayOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} 分钟`;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function toast(message) {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.remove("show"), 1800);
}
