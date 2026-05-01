import { AudioEngine } from "./audio.js";
import { MISTAKE_TYPES, ROUTES } from "./config.js";
import { openListeningDb } from "./db.js";
import {
  $,
  $$,
  attr,
  clamp,
  downloadJson,
  formatDuration,
  html,
  icon,
  localDate,
  normalizeWords,
  readJsonFile,
  slugify
} from "./utils.js";

const state = {
  lessons: [],
  db: null,
  audio: new AudioEngine(),
  settings: null,
  snapshot: null,
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

async function init() {
  try {
    const [payload, db] = await Promise.all([
      fetch("data/lessons.json").then((response) => response.json()),
      openListeningDb()
    ]);

    state.lessons = payload.lessons;
    state.db = db;
    await state.db.seed(state.lessons);
    await refreshData();

    renderShell();
    bindEvents();
    registerServiceWorker();

    if (!location.hash) {
      location.hash = "#/today";
      return;
    }
    await renderRoute();
  } catch (error) {
    console.error(error);
    $("#app").innerHTML = `
      <main class="boot-screen">
        <div class="boot-card">
          <div class="brand-mark">A</div>
          <h1>初始化失败</h1>
          <p>请通过本地服务或 GitHub Pages 打开应用。直接双击 HTML 会阻止数据文件加载。</p>
        </div>
      </main>
    `;
  }
}

async function refreshData() {
  const [settings, snapshot] = await Promise.all([
    state.db.loadSettings(),
    state.db.snapshot()
  ]);
  state.settings = settings;
  state.snapshot = snapshot;
}

function renderShell() {
  $("#app").innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="应用导航">
        <a class="brand" href="#/today" aria-label="返回今日训练">
          <span class="brand-mark">A</span>
          <span>
            <span class="brand-title">Auralift</span>
            <span class="brand-sub">Listening OS</span>
          </span>
        </a>
        <nav class="side-nav">
          ${ROUTES.map(renderNavItem).join("")}
        </nav>
        <section class="side-note">
          <span class="note-kicker">今日原则</span>
          <strong>先听懂，再看懂。</strong>
          <p>每轮只解决一个最明显的声音盲区。</p>
        </section>
      </aside>

      <main class="main-area">
        <header class="mobile-topbar">
          <a class="brand compact-brand" href="#/today" aria-label="返回今日训练">
            <span class="brand-mark">A</span>
            <span>
              <span class="brand-title">Auralift</span>
              <span class="brand-sub">听力训练</span>
            </span>
          </a>
          <a class="icon-btn" href="#/library" aria-label="选择材料">${icon("library")}</a>
        </header>

        <div class="view-shell">
          <section id="view" class="view" tabindex="-1"></section>
          <aside id="context-panel" class="context-panel" aria-label="训练上下文"></aside>
        </div>
      </main>

      <nav class="bottom-tabs" aria-label="底部导航">
        ${ROUTES.map(renderTabItem).join("")}
      </nav>
    </div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  `;
}

function renderNavItem(item) {
  return `
    <a class="nav-link" data-tab="${item.id}" href="${item.href}">
      ${icon(item.icon)}
      <span>${html(item.label)}</span>
    </a>
  `;
}

function renderTabItem(item) {
  return `
    <a class="tab-link" data-tab="${item.id}" href="${item.href}">
      ${icon(item.icon)}
      <span>${html(item.label)}</span>
    </a>
  `;
}

function bindEvents() {
  window.addEventListener("hashchange", renderRoute);
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  window.addEventListener("keydown", onKeydown);
}

async function renderRoute() {
  await refreshData();
  const route = parseRoute();
  const direction = transitionDirection(route);
  state.previousRoute = state.route;
  state.route = route;

  setActiveNav(route.tab);
  $("#view").innerHTML = renderPage(route);
  $("#context-panel").innerHTML = renderContext(route);
  animateView(direction);
  $("#view").focus({ preventScroll: true });
}

function parseRoute() {
  const path = location.hash.replace(/^#/, "") || "/today";
  const parts = path.split("/").filter(Boolean);
  const name = parts[0] || "today";
  const id = parts[1] || null;
  const isDetail = name === "train" || name === "dictation";
  const knownTab = ROUTES.some((item) => item.id === name);
  const tab = isDetail ? state.lastTab : name;
  if (!isDetail && knownTab) state.lastTab = name;
  return { name, id, path, tab, depth: isDetail ? 1 : 0 };
}

function transitionDirection(route) {
  if (state.suppressTransition || state.settings?.reduceMotion) {
    state.suppressTransition = false;
    return "none";
  }
  if (!state.route) return "forward";
  if (route.depth > state.route.depth) return "forward";
  if (route.depth < state.route.depth) return "back";
  if (route.path !== state.route.path) return "tab";
  return "none";
}

function animateView(direction) {
  const view = $("#view");
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

function setActiveNav(tab) {
  $$(".nav-link, .tab-link").forEach((link) => {
    const active = link.dataset.tab === tab;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function renderPage(route) {
  if (route.name === "today") return renderToday();
  if (route.name === "library") return renderLibrary();
  if (route.name === "train") return renderTrain(route.id);
  if (route.name === "dictation") return renderDictation(route.id);
  if (route.name === "vocab") return renderVocab();
  if (route.name === "stats") return renderStats();
  if (route.name === "settings") return renderSettings();
  return renderMissing();
}

function renderToday() {
  const lesson = recommendedLesson();
  const minutes = todayMinutes();
  const goal = state.settings.dailyGoalMinutes;
  const percent = clamp(Math.round((minutes / goal) * 100), 0, 100);
  const due = dueCards().length;
  const progress = progressMap();

  return `
    <div class="screen">
      <header class="screen-head">
        <div>
          <p class="kicker">Today</p>
          <h1>今天练 ${Math.max(goal - minutes, 0)} 分钟就够了</h1>
          <p>完成一轮精听、一次跟读、几张听力词汇卡。少而稳定，比刷材料更有效。</p>
        </div>
      </header>

      <section class="hero-card">
        <div class="hero-copy">
          <p class="kicker">推荐 · ${html(lesson.level)} · ${html(lesson.accent)}</p>
          <h2>${html(lesson.title)}</h2>
          <p>${html(lesson.summary)}</p>
          <div class="action-row">
            <a class="btn primary" href="#/train/${lesson.id}">${icon("play")}开始训练</a>
            <a class="btn" href="#/dictation/${lesson.id}">${icon("pen")}听写</a>
          </div>
        </div>
        <div class="daily-ring" style="--value:${percent * 3.6}deg">
          <strong>${minutes}</strong>
          <span>/${goal} 分钟</span>
        </div>
      </section>

      <section class="metric-grid">
        ${metric("连续", `${streakDays()} 天`, "每天 30 分钟优先")}
        ${metric("待复习", `${due} 张`, "先听音再识义")}
        ${metric("完成", `${state.snapshot.progress.filter((item) => item.completed).length} 篇`, "重复比数量重要")}
      </section>

      <section class="panel">
        <div class="section-title">
          <div>
            <p class="kicker">Plan</p>
            <h2>今日路径</h2>
          </div>
          <a class="text-link" href="#/stats">看盲区</a>
        </div>
        <div class="plan-list">
          ${state.lessons.slice(0, 3).map((item) => lessonRow(item, progress.get(item.id))).join("")}
        </div>
      </section>
    </div>
  `;
}

function metric(label, value, caption) {
  return `
    <article class="metric">
      <span>${html(label)}</span>
      <strong>${html(value)}</strong>
      <small>${html(caption)}</small>
    </article>
  `;
}

function lessonRow(lesson, progress) {
  const done = progress ? clamp(Math.round((progress.completedSentences / lesson.sentences.length) * 100), 0, 100) : 0;
  return `
    <article class="lesson-row">
      <div>
        <h3>${html(lesson.title)}</h3>
        <p>${html(lesson.series)} · ${html(lesson.level)} · ${formatDuration(lesson.duration)} · 可懂度 ${lesson.comprehension}%</p>
        <div class="tag-row">${lesson.focus.map((item) => `<span class="tag">${html(item)}</span>`).join("")}</div>
        <div class="progress" style="--progress:${done}%"><span></span></div>
      </div>
      <a class="icon-btn filled" href="#/train/${lesson.id}" aria-label="训练 ${attr(lesson.title)}">${icon("play")}</a>
    </article>
  `;
}

function renderLibrary() {
  const levels = ["全部", ...new Set(state.lessons.map((lesson) => lesson.level))];
  const lessons = state.libraryFilter === "全部"
    ? state.lessons
    : state.lessons.filter((lesson) => lesson.level === state.libraryFilter);

  return `
    <div class="screen">
      <header class="screen-head split">
        <div>
          <p class="kicker">Library</p>
          <h1>选一段听得懂的材料</h1>
          <p>可懂度 60%-90% 最适合训练。太难先降级，太简单就提速或做听写。</p>
        </div>
        <div class="segmented" aria-label="等级筛选">
          ${levels.map((level) => `<button data-action="filter-level" data-level="${attr(level)}" class="${level === state.libraryFilter ? "active" : ""}">${html(level)}</button>`).join("")}
        </div>
      </header>
      <section class="lesson-list">
        ${lessons.map(libraryCard).join("")}
      </section>
    </div>
  `;
}

function libraryCard(lesson) {
  const progress = progressMap().get(lesson.id);
  const done = progress ? clamp(Math.round((progress.completedSentences / lesson.sentences.length) * 100), 0, 100) : 0;
  return `
    <article class="lesson-card">
      <div class="card-main">
        <p class="kicker">${html(lesson.topic)} · ${html(lesson.recommendedMode)}</p>
        <h2>${html(lesson.title)}</h2>
        <p>${html(lesson.summary)}</p>
        <div class="meta-line">
          <span>${html(lesson.level)}</span>
          <span>${html(lesson.accent)}</span>
          <span>${formatDuration(lesson.duration)}</span>
          <span>${lesson.comprehension}% 可懂</span>
        </div>
        <div class="tag-row">${lesson.focus.map((item) => `<span class="tag">${html(item)}</span>`).join("")}</div>
        <div class="progress" style="--progress:${done}%"><span></span></div>
      </div>
      <div class="card-actions">
        <a class="btn primary" href="#/train/${lesson.id}">${icon("play")}精听</a>
        <a class="btn" href="#/dictation/${lesson.id}">${icon("pen")}听写</a>
      </div>
    </article>
  `;
}

function renderTrain(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson) return renderMissing();

  const index = sentenceIndex(lesson);
  const sentence = lesson.sentences[index];
  const reveal = revealState(lesson);
  const loop = loopState(lesson);
  const mode = trainMode(lesson);
  const marked = markedTypes(sentence.id);

  return `
    <div class="screen train-screen">
      <header class="screen-head split">
        <div>
          <a class="back-link" href="#/library">${icon("back")}素材库</a>
          <p class="kicker">${html(lesson.series)} · ${html(lesson.level)} · ${html(lesson.accent)}</p>
          <h1>${html(lesson.title)}</h1>
        </div>
        <div class="segmented" aria-label="训练模式">
          ${["精听", "跟读"].map((item) => `<button data-action="set-mode" data-mode="${item}" class="${mode === item ? "active" : ""}">${item}</button>`).join("")}
        </div>
      </header>

      <section class="player-card">
        <div class="player-meta">
          <span>${mode}</span>
          <span>第 ${index + 1}/${lesson.sentences.length} 句</span>
          <span>${state.settings.defaultRate}x</span>
          <span>${loop ? "单句循环" : "顺序"}</span>
        </div>
        <div class="sentence-stage">
          <div class="wave" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
          <p class="sentence-count">Sentence ${index + 1}</p>
          <h2 class="${reveal ? "" : "masked-text"}">${html(sentence.text)}</h2>
          <p>${reveal ? html(sentence.meaning) : "先用耳朵判断意义，再显示原文。"}</p>
        </div>
        <div class="control-dock">
          <button class="icon-btn" data-action="prev-sentence" aria-label="上一句">${icon("prev")}</button>
          <button class="play-btn" data-action="play-current">${icon("play")}播放</button>
          <button class="icon-btn" data-action="next-sentence" aria-label="下一句">${icon("next")}</button>
          <button class="icon-btn ${reveal ? "active" : ""}" data-action="toggle-reveal" aria-label="显示或隐藏原文">${icon("eye")}</button>
          <button class="icon-btn ${loop ? "active" : ""}" data-action="toggle-loop" aria-label="单句循环">${icon("repeat")}</button>
        </div>
      </section>

      <section class="content-grid">
        <div class="panel">
          <div class="section-title">
            <div>
              <p class="kicker">Blind Spot</p>
              <h2>这句卡在哪里</h2>
            </div>
          </div>
          <div class="mark-grid">
            ${MISTAKE_TYPES.map((type) => `<button class="mark-btn ${marked.includes(type) ? "marked" : ""}" data-action="toggle-mistake" data-type="${type}">${html(type)}</button>`).join("")}
          </div>
          <p class="hint">${html(sentence.note)}</p>
        </div>

        <div class="panel">
          <div class="section-title">
            <div>
              <p class="kicker">Session</p>
              <h2>本轮控制</h2>
            </div>
          </div>
          <div class="chip-row">
            ${[0.75, 0.9, 1, 1.15].map((rate) => `<button class="chip ${Number(state.settings.defaultRate) === rate ? "active" : ""}" data-action="speed" data-speed="${rate}">${rate}x</button>`).join("")}
          </div>
          <p class="hint">${mode === "跟读" ? "播放后立刻跟读，不看文字。优先模仿节奏、重音和停顿。" : "第一遍抓意义，第二遍抓关键词，第三遍显示原文确认盲区。"}</p>
          <div class="action-row">
            <button class="btn primary" data-action="complete-lesson">${icon("check")}完成本轮</button>
            <a class="btn" href="#/dictation/${lesson.id}">${icon("pen")}听写</a>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="section-title">
          <div>
            <p class="kicker">Transcript</p>
            <h2>逐句复听</h2>
          </div>
        </div>
        <div class="sentence-list">
          ${lesson.sentences.map((item, itemIndex) => sentenceRow(item, itemIndex, index)).join("")}
        </div>
      </section>
    </div>
  `;
}

function sentenceRow(sentence, itemIndex, activeIndex) {
  return `
    <button class="sentence-row ${itemIndex === activeIndex ? "active" : ""}" data-action="set-sentence" data-index="${itemIndex}">
      <span>${itemIndex + 1}</span>
      <strong>${html(sentence.text)}</strong>
      <small>${html(sentence.meaning)}</small>
    </button>
  `;
}

function renderDictation(lessonId) {
  const lesson = findLesson(lessonId);
  if (!lesson) return renderMissing();
  const target = dictationTarget(lesson);

  return `
    <div class="screen">
      <header class="screen-head split">
        <div>
          <a class="back-link" href="#/train/${lesson.id}">${icon("back")}训练页</a>
          <p class="kicker">Dictation · ${html(lesson.level)}</p>
          <h1>听写暴露盲区</h1>
          <p>只写 30 秒。写完再看原文，错词就是下一轮精听材料。</p>
        </div>
        <button class="btn primary" data-action="play-dictation">${icon("speaker")}播放片段</button>
      </header>

      <section class="panel">
        <textarea class="dictation-input" data-role="dictation-input" placeholder="写下你听到的英文">${html(state.dictationText)}</textarea>
        <div class="action-row">
          <button class="btn primary" data-action="check-dictation">${icon("check")}对照原文</button>
          <button class="btn" data-action="clear-dictation">${icon("close")}清空</button>
        </div>
        ${state.dictationResult ? dictationResult(target) : ""}
      </section>
    </div>
  `;
}

function dictationResult(target) {
  const result = state.dictationResult;
  return `
    <div class="result-box">
      <h2>${result.score}%</h2>
      <p>红色是漏听或错位。把这些词放回原句复听。</p>
      <div class="word-grid">
        ${result.words.map((item) => `<span class="word ${item.missed ? "missed" : ""}">${html(item.word)}</span>`).join("")}
      </div>
      <small>${html(target)}</small>
    </div>
  `;
}

function renderVocab() {
  const cards = dueCards();
  if (cards.length === 0) {
    return emptyScreen("Vocab", "今天没有到期卡片", "训练中标记的熟词、生词和听写错词会进入这里。", "#/library", "去选材料");
  }

  const index = Math.min(state.vocabIndex, cards.length - 1);
  const card = cards[index];
  const lesson = findLesson(card.lessonId);

  return `
    <div class="screen">
      <header class="screen-head">
        <div>
          <p class="kicker">Listening Vocab</p>
          <h1>听音识义</h1>
          <p>不要先看拼写。播放后先在脑中说出意思，再显示答案。</p>
        </div>
      </header>

      <section class="vocab-card">
        <div class="vocab-top">
          <span>${index + 1}/${cards.length}</span>
          <span>${html(lesson?.title || "训练材料")}</span>
        </div>
        <button class="listen-orb" data-action="play-vocab" data-term="${attr(card.term)}" aria-label="播放词汇音频">${icon("speaker")}</button>
        <h2 class="${state.vocabRevealed ? "" : "masked-text"}">${html(card.term)}</h2>
        <p>${state.vocabRevealed ? html(card.meaning) : "先听，再说出意思。"}</p>
        ${state.vocabRevealed ? `<small>${html(card.example)}</small>` : ""}
        <div class="action-row center">
          <button class="btn" data-action="reveal-vocab">${icon("eye")}显示答案</button>
          <button class="btn" data-action="review-vocab" data-rating="again">没听出</button>
          <button class="btn" data-action="review-vocab" data-rating="hard">模糊</button>
          <button class="btn primary" data-action="review-vocab" data-rating="good">${icon("check")}认识</button>
        </div>
      </section>
    </div>
  `;
}

function renderStats() {
  const attempts = state.snapshot.attempts;
  const mistakes = state.snapshot.mistakes;
  const minutes = Math.round(attempts.reduce((sum, item) => sum + (item.durationSeconds || 0), 0) / 60);
  const distribution = mistakeDistribution();

  return `
    <div class="screen">
      <header class="screen-head">
        <div>
          <p class="kicker">Stats</p>
          <h1>下一次该练什么</h1>
          <p>统计只回答一个问题：最高频的听力盲区是什么。</p>
        </div>
      </header>

      <section class="metric-grid">
        ${metric("累计", `${minutes} 分钟`, "训练时长")}
        ${metric("轮次", `${attempts.length} 次`, "精听/跟读/听写")}
        ${metric("盲区", `${mistakes.length} 个`, "已标记问题")}
      </section>

      <section class="panel">
        <div class="section-title">
          <div>
            <p class="kicker">Distribution</p>
            <h2>错误类型</h2>
          </div>
        </div>
        ${distribution.total ? bars(distribution.items) : `<div class="empty">还没有数据。完成一轮训练后这里会出现分布。</div>`}
      </section>

      <section class="panel">
        <p class="kicker">Advice</p>
        <h2>下轮建议</h2>
        <p>${html(nextAdvice(distribution.items))}</p>
      </section>
    </div>
  `;
}

function bars(items) {
  return `
    <div class="bar-list">
      ${items.map((item) => `
        <div class="bar-row">
          <span>${html(item.type)}</span>
          <div class="bar-track" style="--progress:${item.percent}%"><i></i></div>
          <strong>${item.count}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="screen">
      <header class="screen-head">
        <div>
          <p class="kicker">Settings</p>
          <h1>本地训练数据</h1>
          <p>个人数据只保存在当前浏览器。正式上线必须让用户能导出、导入和清空。</p>
        </div>
      </header>

      <section class="panel settings-list">
        ${settingNumber("dailyGoalMinutes", "每日目标", "建议 30-60 分钟，稳定优先。", state.settings.dailyGoalMinutes)}
        ${settingSelect("defaultRate", "默认语速", "精听可以降速，复听要回到正常语速。", state.settings.defaultRate, [0.75, 0.9, 1, 1.15, 1.25], "x")}
        ${settingSelect("preferredAccent", "偏好口音", "自动会按材料等级推荐。", state.settings.preferredAccent, ["自动", "US", "UK", "AU"], "")}
        ${settingToggle("showTranscriptFirst", "首次显示原文", "关闭时更符合声音优先。", state.settings.showTranscriptFirst)}
        ${settingToggle("reduceMotion", "减少动效", "需要更稳的界面时打开。", state.settings.reduceMotion)}
      </section>

      <section class="panel">
        <div class="section-title">
          <div>
            <p class="kicker">Backup</p>
            <h2>数据管理</h2>
          </div>
        </div>
        <div class="action-row">
          <button class="btn" data-action="export-data">${icon("download")}导出数据</button>
          <button class="btn" data-action="import-data">${icon("upload")}导入数据</button>
          <button class="btn danger" data-action="reset-data">${icon("trash")}清空数据</button>
        </div>
        <input id="import-file" type="file" accept="application/json" hidden />
      </section>
    </div>
  `;
}

function settingNumber(key, title, caption, value) {
  return `
    <label class="setting-row">
      <span><strong>${html(title)}</strong><small>${html(caption)}</small></span>
      <input class="field" data-setting="${key}" type="number" min="10" max="180" step="5" value="${value}">
    </label>
  `;
}

function settingSelect(key, title, caption, value, options, suffix) {
  return `
    <label class="setting-row">
      <span><strong>${html(title)}</strong><small>${html(caption)}</small></span>
      <select class="field" data-setting="${key}">
        ${options.map((option) => `<option value="${attr(option)}" ${String(option) === String(value) ? "selected" : ""}>${html(option)}${suffix}</option>`).join("")}
      </select>
    </label>
  `;
}

function settingToggle(key, title, caption, checked) {
  return `
    <label class="setting-row">
      <span><strong>${html(title)}</strong><small>${html(caption)}</small></span>
      <span class="switch">
        <input data-setting="${key}" type="checkbox" ${checked ? "checked" : ""}>
        <i></i>
      </span>
    </label>
  `;
}

function renderContext(route) {
  if (route.name === "settings") {
    return `
      <section class="context-card">
        <p class="kicker">Privacy</p>
        <h3>离线优先</h3>
        <p>所有进度和词汇卡保存在 IndexedDB。导出文件是完整备份。</p>
      </section>
      <section class="context-card">
        <p class="kicker">Deploy</p>
        <h3>自动发布</h3>
        <p>main 分支更新会触发 GitHub Pages 部署。</p>
      </section>
    `;
  }

  if (route.name === "stats") {
    return `
      <section class="context-card">
        <p class="kicker">Read</p>
        <h3>最高频优先</h3>
        <p>连续三天最高的盲区，就是下一周素材选择的依据。</p>
      </section>
    `;
  }

  const lesson = route.id ? findLesson(route.id) : recommendedLesson();
  return `
    <section class="context-card">
      <p class="kicker">Now</p>
      <h3>${html(lesson.title)}</h3>
      <p>${html(lesson.summary)}</p>
      <div class="tag-row">
        <span class="tag strong">${html(lesson.level)}</span>
        <span class="tag">${html(lesson.accent)}</span>
        <span class="tag">${lesson.comprehension}%</span>
      </div>
    </section>
    <section class="context-card">
      <p class="kicker">Focus</p>
      <div class="tag-row">${lesson.focus.map((item) => `<span class="tag">${html(item)}</span>`).join("")}</div>
    </section>
  `;
}

function emptyScreen(kicker, title, caption, href, action) {
  return `
    <div class="screen">
      <section class="empty-state">
        <p class="kicker">${html(kicker)}</p>
        <h1>${html(title)}</h1>
        <p>${html(caption)}</p>
        <a class="btn primary" href="${href}">${html(action)}</a>
      </section>
    </div>
  `;
}

function renderMissing() {
  return emptyScreen("Not Found", "没有找到这个页面", "路由可能已失效。", "#/today", "回到今日");
}

async function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const route = parseRoute();
  const lesson = route.id ? findLesson(route.id) : null;

  if (action === "filter-level") {
    state.libraryFilter = target.dataset.level;
    rerender();
    return;
  }

  if (action === "set-mode" && lesson) {
    state.modeByLesson[lesson.id] = target.dataset.mode;
    rerender();
    return;
  }

  if (action === "set-sentence" && lesson) {
    state.sentenceIndex[lesson.id] = Number(target.dataset.index);
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
    state.revealByLesson[lesson.id] = !revealState(lesson);
    rerender();
    return;
  }

  if (action === "toggle-loop" && lesson) {
    state.loopByLesson[lesson.id] = !loopState(lesson);
    rerender();
    return;
  }

  if (action === "play-current" && lesson) {
    await playCurrent(lesson);
    return;
  }

  if (action === "speed") {
    await saveSetting("defaultRate", Number(target.dataset.speed));
    toast(`语速 ${target.dataset.speed}x`);
    rerender();
    return;
  }

  if (action === "toggle-mistake" && lesson) {
    await toggleMistake(lesson, target.dataset.type);
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
    await state.audio.playText(target.dataset.term, "US", state.settings.defaultRate);
    return;
  }

  if (action === "reveal-vocab") {
    state.vocabRevealed = true;
    rerender();
    return;
  }

  if (action === "review-vocab") {
    await reviewVocab(target.dataset.rating);
    rerender();
    return;
  }

  if (action === "export-data") {
    const data = await state.db.exportData();
    downloadJson(`auralift-backup-${localDate()}.json`, data);
    toast("数据已导出");
    return;
  }

  if (action === "import-data") {
    $("#import-file")?.click();
    return;
  }

  if (action === "reset-data") {
    if (window.confirm("确认清空本机训练数据？此操作不可撤销。")) {
      await state.db.clearUserData();
      state.vocabIndex = 0;
      toast("本机数据已清空");
      rerender();
    }
  }
}

function onInput(event) {
  if (event.target.matches("[data-role='dictation-input']")) {
    state.dictationText = event.target.value;
  }
}

async function onChange(event) {
  if (event.target.id === "import-file" && event.target.files?.[0]) {
    try {
      const payload = await readJsonFile(event.target.files[0]);
      await state.db.importData(payload);
      toast("数据已导入");
      await renderRoute();
    } catch (error) {
      console.error(error);
      toast("导入失败：文件格式不正确");
    }
    return;
  }

  const key = event.target.dataset.setting;
  if (!key) return;
  let value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
  if (key === "dailyGoalMinutes" || key === "defaultRate") value = Number(value);
  await saveSetting(key, value);
  toast("设置已保存");
  rerender();
}

function onKeydown(event) {
  const route = parseRoute();
  const lesson = route.id ? findLesson(route.id) : null;
  if (!lesson || route.name !== "train") return;
  if (event.key === " ") {
    event.preventDefault();
    playCurrent(lesson);
  }
  if (event.key === "ArrowLeft") shiftSentence(lesson, -1);
  if (event.key === "ArrowRight") shiftSentence(lesson, 1);
}

function rerender() {
  state.suppressTransition = true;
  renderRoute();
}

function shiftSentence(lesson, delta) {
  const current = sentenceIndex(lesson);
  state.sentenceIndex[lesson.id] = clamp(current + delta, 0, lesson.sentences.length - 1);
  rerender();
}

async function playCurrent(lesson) {
  const index = sentenceIndex(lesson);
  const sentence = lesson.sentences[index];
  await state.audio.playSentence(lesson, sentence, state.settings.defaultRate);
  if (!loopState(lesson) && index < lesson.sentences.length - 1) {
    state.sentenceIndex[lesson.id] = index + 1;
    rerender();
  }
}

async function saveSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  await state.db.saveSettings(state.settings);
}

async function toggleMistake(lesson, type) {
  const sentence = lesson.sentences[sentenceIndex(lesson)];
  const id = `${sentence.id}-${slugify(type)}`;
  const existing = await state.db.get("mistakes", id);
  if (existing) {
    await state.db.delete("mistakes", id);
    toast(`已取消：${type}`);
    return;
  }

  await state.db.put("mistakes", {
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

async function completeAttempt(lesson) {
  const current = sentenceIndex(lesson);
  const existing = await state.db.get("progress", lesson.id);
  const completedSentences = Math.max(existing?.completedSentences || 0, current + 1);
  const completed = completedSentences >= lesson.sentences.length;

  await state.db.put("progress", {
    lessonId: lesson.id,
    completedSentences,
    completed,
    updatedAt: new Date().toISOString()
  });

  await state.db.add("attempts", {
    lessonId: lesson.id,
    mode: trainMode(lesson),
    date: localDate(),
    durationSeconds: Math.max(120, (current + 1) * 70),
    createdAt: new Date().toISOString()
  });

  toast(completed ? "材料已完成" : "本轮已记录");
}

async function checkDictation(lesson) {
  const target = dictationTarget(lesson);
  const correct = normalizeWords(target);
  const input = normalizeWords(state.dictationText);
  const words = correct.map((word, index) => ({ word, missed: input[index] !== word }));
  const matched = words.filter((item) => !item.missed).length;
  const score = correct.length ? Math.round((matched / correct.length) * 100) : 0;
  state.dictationResult = { score, words };

  await state.db.add("attempts", {
    lessonId: lesson.id,
    mode: "听写",
    date: localDate(),
    durationSeconds: 300,
    score,
    createdAt: new Date().toISOString()
  });

  if (score < 85) {
    await state.db.put("mistakes", {
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

async function reviewVocab(rating) {
  const cards = dueCards();
  if (!cards.length) return;
  const card = cards[Math.min(state.vocabIndex, cards.length - 1)];
  const nextDays = { again: 0, hard: 1, good: Math.max(2, card.ease + 1) }[rating];
  const easeDelta = { again: -1, hard: 0, good: 1 }[rating];

  await state.db.put("vocabCards", {
    ...card,
    ease: clamp(card.ease + easeDelta, 1, 7),
    reviewCount: card.reviewCount + 1,
    lastRating: rating,
    dueDate: localDate(nextDays)
  });

  state.vocabIndex = Math.min(state.vocabIndex + 1, cards.length - 1);
  state.vocabRevealed = false;
  toast("复习已保存");
}

function recommendedLesson() {
  const progress = progressMap();
  const preferred = state.settings?.preferredAccent;
  const pool = state.lessons
    .filter((lesson) => !progress.get(lesson.id)?.completed)
    .filter((lesson) => preferred === "自动" || !preferred || lesson.accent === preferred);
  return pool[0] || state.lessons[0];
}

function findLesson(id) {
  return state.lessons.find((lesson) => lesson.id === id) || null;
}

function progressMap() {
  return new Map((state.snapshot?.progress || []).map((item) => [item.lessonId, item]));
}

function todayMinutes() {
  const today = localDate();
  const seconds = state.snapshot.attempts
    .filter((item) => item.date === today)
    .reduce((sum, item) => sum + (item.durationSeconds || 0), 0);
  return Math.round(seconds / 60);
}

function streakDays() {
  const dates = new Set(state.snapshot.attempts.map((item) => item.date));
  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    if (!dates.has(localDate(-offset))) break;
    streak += 1;
  }
  return streak;
}

function dueCards() {
  const today = localDate();
  return state.snapshot.vocabCards
    .filter((card) => card.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function sentenceIndex(lesson) {
  return state.sentenceIndex[lesson.id] || 0;
}

function revealState(lesson) {
  if (state.revealByLesson[lesson.id] === undefined) {
    state.revealByLesson[lesson.id] = Boolean(state.settings.showTranscriptFirst);
  }
  return state.revealByLesson[lesson.id];
}

function loopState(lesson) {
  return Boolean(state.loopByLesson[lesson.id]);
}

function trainMode(lesson) {
  if (!state.modeByLesson[lesson.id]) {
    state.modeByLesson[lesson.id] = lesson.recommendedMode === "跟读" ? "跟读" : "精听";
  }
  return state.modeByLesson[lesson.id];
}

function markedTypes(sentenceId) {
  return state.snapshot.mistakes
    .filter((item) => item.sentenceId === sentenceId)
    .map((item) => item.type);
}

function dictationTarget(lesson) {
  return lesson.sentences.slice(0, 3).map((sentence) => sentence.text).join(" ");
}

function mistakeDistribution() {
  const counts = new Map();
  state.snapshot.mistakes.forEach((item) => counts.set(item.type, (counts.get(item.type) || 0) + 1));
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  return {
    total,
    items: Array.from(counts.entries())
      .map(([type, count]) => ({ type, count, percent: total ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
  };
}

function nextAdvice(items) {
  if (!items.length) return "先完成一轮精听，并至少标记两个听错原因。";
  const top = items[0].type;
  if (top === "连读") return "下一轮选生活对话，重点重复动词短语和介词连接。";
  if (top === "弱读") return "跟读时专门盯 to、of、and、would、have 这些功能词。";
  if (top === "生词") return "先降低材料难度，把新词做成听音识义卡再回听原句。";
  if (top === "口音") return "保持同一主题，轮换 US、UK、AU 口音各听一遍。";
  if (top === "语速快") return "先 0.75x 精听，再 1x 复听，最后只听关键词复述。";
  return "继续用同一材料重复三轮，每轮只解决一个最高频盲区。";
}

function toast(message) {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 1800);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
