import { MISTAKE_TYPES, ROUTES } from "../core/config";
import {
  buildDailyPlan,
  buildGoalRoadmap,
  LEARNER_LEVEL_OPTIONS,
  nextAdvice,
  recommendLesson,
  TARGET_HORIZON_OPTIONS,
  GOAL_PROFILES
} from "../core/learning";
import { attr, clamp, formatDuration, html, icon } from "../core/utils";
import type {
  DailyPlanItem,
  DataSnapshot,
  DictationResult,
  GoalOption,
  Lesson,
  LessonSentence,
  ListeningGoal,
  RouteState,
  UserSettings,
  VocabCard
} from "../types/domain";

export interface ViewModel {
  lessons: Lesson[];
  settings: UserSettings;
  snapshot: DataSnapshot;
  libraryFilter: string;
  sentenceIndex: Record<string, number>;
  revealByLesson: Record<string, boolean | undefined>;
  loopByLesson: Record<string, boolean | undefined>;
  modeByLesson: Record<string, "精听" | "跟读" | undefined>;
  heardBySentence: Record<string, boolean | undefined>;
  activePlayback: { lessonId: string; sentenceId: string } | null;
  dictationText: string;
  dictationResult: DictationResult | null;
  vocabIndex: number;
  vocabRevealed: boolean;
  online: boolean;
  updateReady: boolean;
}

export function renderShell(): string {
  return `
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
          ${ROUTES.map((item) => `
            <a class="nav-link" data-tab="${item.id}" href="${item.href}">
              ${icon(item.icon)}
              <span>${html(item.label)}</span>
            </a>
          `).join("")}
        </nav>
        <section class="side-note">
          <span class="note-kicker">今日原则</span>
          <strong>先听懂，再看懂。</strong>
          <p>每轮只解决一个最明显的声音盲区。</p>
        </section>
        <section class="app-state" aria-live="polite">
          <span id="network-state"></span>
          <button class="text-link update-action" data-action="reload-app" hidden>更新</button>
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
        ${ROUTES.map((item) => `
          <a class="tab-link" data-tab="${item.id}" href="${item.href}">
            ${icon(item.icon)}
            <span>${html(item.label)}</span>
          </a>
        `).join("")}
      </nav>
    </div>
    <div id="modal-root"></div>
    <div id="player-root"></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  `;
}

export function renderPage(route: RouteState, model: ViewModel): string {
  if (route.name === "today") return renderToday(model);
  if (route.name === "library") return renderLibrary(model);
  if (route.name === "train") return renderTrain(route.id, model);
  if (route.name === "dictation") return renderDictation(route.id, model);
  if (route.name === "vocab") return renderVocab(model);
  if (route.name === "stats") return renderStats(model);
  if (route.name === "settings") return renderSettings(model);
  return emptyScreen("Not Found", "没有找到这个页面", "路由可能已失效。", "#/today", "回到今日");
}

export function renderGlobalPlayer(route: RouteState, model: ViewModel): string {
  if (route.name !== "train" || !route.id) return "";
  const lesson = findLesson(model.lessons, route.id);
  if (!lesson) return "";
  const index = getSentenceIndex(model, lesson);
  const sentence = lesson.sentences[index];
  const reveal = revealState(model, lesson);
  const loop = loopState(model, lesson);
  const isPlaying = isCurrentSentencePlaying(model, lesson, sentence);

  return `
    <div class="mobile-control-bar" role="toolbar" aria-label="移动端播放器控制">
      <button class="icon-btn" data-action="prev-sentence" aria-label="上一句">${icon("prev")}</button>
      ${playButton(isPlaying)}
      <button class="icon-btn" data-action="next-sentence" aria-label="下一句">${icon("next")}</button>
      <button class="icon-btn ${reveal ? "active" : ""}" data-action="toggle-reveal" aria-label="显示或隐藏原文">${icon("eye")}</button>
      <button class="icon-btn ${loop ? "active" : ""}" data-action="toggle-loop" aria-label="单句循环">${icon("repeat")}</button>
    </div>
  `;
}

export function renderContext(route: RouteState, model: ViewModel): string {
  if (route.name === "today") {
    const roadmap = buildGoalRoadmap(model);
    return `
      <section class="context-card">
        <p class="kicker">Goal</p>
        <h3>${html(roadmap.profile.title)}</h3>
        <p>${html(roadmap.profile.evidence)}</p>
      </section>
      <section class="context-card">
        <p class="kicker">Next</p>
        <h3>${html(roadmap.nextMilestone.title)}</h3>
        <p>${html(roadmap.nextMilestone.outcome)}</p>
      </section>
    `;
  }

  if (route.name === "settings") {
    return `
      <section class="context-card">
        <p class="kicker">Privacy</p>
        <h3>离线优先</h3>
        <p>所有进度和词汇卡保存在 IndexedDB。导出文件是完整备份。</p>
      </section>
      <section class="context-card">
        <p class="kicker">Quality</p>
        <h3>上线标准</h3>
        <p>构建、静态校验和端到端流程会在部署前执行。</p>
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

  const lesson = route.id ? findLesson(model.lessons, route.id) ?? recommendLesson(model) : recommendLesson(model);
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

function renderToday(model: ViewModel): string {
  const lesson = recommendLesson(model);
  const minutes = todayMinutes(model);
  const goal = model.settings.dailyGoalMinutes;
  const percent = clamp(Math.round((minutes / goal) * 100), 0, 100);
  const due = dueCards(model).length;
  const plan = buildDailyPlan(model);
  const roadmap = buildGoalRoadmap(model);
  const reviewLessonId = model.snapshot.mistakes.at(-1)?.lessonId || lesson.id;
  const dictationCount = model.snapshot.attempts.filter((item) => item.mode === "听写").length;
  const remainingSessions = Math.max(0, Math.ceil(((roadmap.nextMilestone.day * goal) - roadmap.completedMinutes) / Math.max(goal, 1)));

  return `
    <div class="screen today-screen">
      <section class="asset-strip" aria-label="学习资产">
        ${assetShortcut("错句复听", model.snapshot.mistakes.length ? `${model.snapshot.mistakes.length} 句` : "待生成", model.snapshot.mistakes.length ? "把听错的句子重复到能直接懂。" : "完成第一轮后自动收集错句。", `#/train/${reviewLessonId}`, "repeat")}
        ${assetShortcut("听力词汇", due ? `${due} 张` : "已清空", due ? "先听音，再说出意思。" : "今天没有到期卡片。", "#/vocab", "cards")}
        ${assetShortcut("听写记录", dictationCount ? `${dictationCount} 次` : "未校准", dictationCount ? "用漏词判断是否升级材料。" : "做一次听写就知道哪里漏。", `#/dictation/${lesson.id}`, "pen")}
      </section>

      <section class="today-focus">
        <div class="task-orb" aria-hidden="true">${icon("speaker")}</div>
        <p class="kicker">Today</p>
        <h1>今天听一轮，找到你的听力盲区</h1>
        <p>${html(lesson.title)} · ${html(lesson.level)} · ${lesson.comprehension}% 可懂。做完会得到错句、漏词和下一轮复听重点。</p>
        <div class="today-actions">
          <a class="btn primary task-cta" href="#/train/${lesson.id}">${icon("play")}开始 15 分钟精听</a>
          <a class="btn task-secondary" href="#/dictation/${lesson.id}">${icon("pen")}听写查漏词</a>
        </div>
        <div class="today-progress-line">
          <span>今日 ${minutes}/${goal} 分钟</span>
          <span>下一步：${html(roadmap.nextMilestone.title)}</span>
        </div>
      </section>

      <section class="panel today-path-panel">
        <div class="section-title compact-title">
          <div>
            <p class="kicker">Path</p>
            <h2>今日路径</h2>
          </div>
          <a class="text-link" href="#/stats">看盲区</a>
        </div>
        <div class="today-path">
          ${plan.map(pathStep).join("")}
        </div>
      </section>

      <section class="panel recommended-panel">
        <div>
          <p class="kicker">Material</p>
          <h2>当前推荐：${html(lesson.title)}</h2>
          <p>${html(lesson.summary)}</p>
          <div class="action-row">
            <a class="btn primary" href="#/train/${lesson.id}">${icon("play")}精听找盲区</a>
            <a class="btn" href="#/library">换一段材料</a>
          </div>
        </div>
        <div class="daily-ring" style="--value:${percent * 3.6}deg" aria-label="今日训练进度">
          <strong>${minutes}</strong>
          <span>/${goal} 分钟</span>
        </div>
      </section>

      <details class="panel roadmap-details">
        <summary>
          <span>
            <span class="kicker">Goal</span>
            <strong>你的目标：${roadmap.horizonDays} 天 ${html(roadmap.profile.title)}</strong>
            <small>距离 ${html(roadmap.nextMilestone.title)}，还差 ${remainingSessions} 次训练。</small>
          </span>
          <span>${roadmap.progressPercent}%</span>
        </summary>
        <div class="progress large" style="--progress:${roadmap.progressPercent}%"><span></span></div>
        <div class="milestone-list compact">
          ${roadmap.milestones.map((item) => milestoneItem(item.day, item.title, item.outcome, item.evidence)).join("")}
        </div>
      </details>
    </div>
  `;
}

function renderLibrary(model: ViewModel): string {
  const levels = ["全部", ...new Set(model.lessons.map((lesson) => lesson.level))];
  const lessons = model.libraryFilter === "全部"
    ? model.lessons
    : model.lessons.filter((lesson) => lesson.level === model.libraryFilter);

  return `
    <div class="screen">
      <header class="screen-head split">
        <div>
          <p class="kicker">Library</p>
          <h1>选一段听得懂的材料</h1>
          <p>可懂度 60%-90% 最适合训练。太难先降级，太简单就提速或做听写。</p>
        </div>
        <div class="segmented" aria-label="等级筛选">
          ${levels.map((level) => `<button data-action="filter-level" data-level="${attr(level)}" class="${level === model.libraryFilter ? "active" : ""}">${html(level)}</button>`).join("")}
        </div>
      </header>
      <section class="lesson-list">
        ${lessons.map((lesson) => libraryCard(lesson, progressMap(model).get(lesson.id))).join("")}
      </section>
    </div>
  `;
}

function renderTrain(lessonId: string | null, model: ViewModel): string {
  const lesson = lessonId ? findLesson(model.lessons, lessonId) : null;
  if (!lesson) return emptyScreen("Not Found", "没有找到这篇材料", "请回到素材库重新选择。", "#/library", "返回素材库");

  const index = getSentenceIndex(model, lesson);
  const sentence = lesson.sentences[index];
  const reveal = revealState(model, lesson);
  const loop = loopState(model, lesson);
  const mode = trainMode(model, lesson);
  const marked = markedTypes(model, sentence.id);
  const heard = Boolean(model.heardBySentence[sentence.id]);
  const isPlaying = isCurrentSentencePlaying(model, lesson, sentence);
  const diagnosisReady = heard || reveal || marked.length > 0;
  const stageLabel = reveal ? "核对原文" : heard ? "听后判断" : "盲听";

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
          <span>${stageLabel}</span>
          <span>${model.settings.defaultRate}x</span>
          <span>${loop ? "单句循环" : "顺序"}</span>
        </div>
        <div class="sentence-stage">
          <div class="wave ${isPlaying ? "playing" : ""}" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
          <p class="sentence-count">Sentence ${index + 1}</p>
          <h2 class="${reveal ? "" : "masked-text"}">${html(sentence.text)}</h2>
          <p>${reveal ? html(sentence.meaning) : isPlaying ? "正在播放。先不要看文字，抓住这句话的大意。" : heard ? "现在判断：听懂了吗？没听清再显示原文。" : "先听一遍，再判断有没有卡住。"}</p>
        </div>
        <div class="control-dock" role="toolbar" aria-label="播放器控制">
          <button class="icon-btn" data-action="prev-sentence" aria-label="上一句">${icon("prev")}</button>
          ${playButton(isPlaying)}
          <button class="icon-btn" data-action="next-sentence" aria-label="下一句">${icon("next")}</button>
          <button class="icon-btn ${reveal ? "active" : ""}" data-action="toggle-reveal" aria-label="显示或隐藏原文">${icon("eye")}</button>
          <button class="icon-btn ${loop ? "active" : ""}" data-action="toggle-loop" aria-label="单句循环">${icon("repeat")}</button>
        </div>
      </section>

      <section class="content-grid">
        <div class="panel">
          <div class="section-title">
            <div>
              <p class="kicker">After Listening</p>
              <h2>${diagnosisReady ? "听完再标记" : "先听，不急着判断"}</h2>
            </div>
          </div>
          ${diagnosisReady ? `
            <p class="diagnosis-copy">${reveal ? "对照原文后，只标记真正卡住的声音问题。" : "如果没完全听懂，先显示原文核对，再标记卡点。"}</p>
            <div class="mark-grid">
              ${MISTAKE_TYPES.map((type) => `<button class="mark-btn ${marked.includes(type) ? "marked" : ""}" data-action="toggle-mistake" data-type="${type}">${html(type)}</button>`).join("")}
            </div>
            <p class="hint">${html(sentence.note)}</p>
          ` : `
            <div class="diagnosis-empty">
              ${icon("speaker")}
              <strong>播放这一句，先只靠耳朵理解。</strong>
              <span>听完后这里才会出现卡点标记，避免你被答案牵着走。</span>
            </div>
          `}
        </div>

        <div class="panel">
          <div class="section-title">
            <div>
              <p class="kicker">Session</p>
              <h2>本轮控制</h2>
            </div>
          </div>
          <div class="chip-row">
            ${[0.75, 0.9, 1, 1.15].map((rate) => `<button class="chip ${model.settings.defaultRate === rate ? "active" : ""}" data-action="speed" data-speed="${rate}">${rate}x</button>`).join("")}
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

function renderDictation(lessonId: string | null, model: ViewModel): string {
  const lesson = lessonId ? findLesson(model.lessons, lessonId) : null;
  if (!lesson) return emptyScreen("Not Found", "没有找到听写材料", "请回到素材库重新选择。", "#/library", "返回素材库");
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
        <textarea class="dictation-input" data-role="dictation-input" placeholder="写下你听到的英文" autocomplete="off" autocapitalize="off" spellcheck="false">${html(model.dictationText)}</textarea>
        <div class="action-row">
          <button class="btn primary" data-action="check-dictation">${icon("check")}对照原文</button>
          <button class="btn" data-action="clear-dictation">${icon("close")}清空</button>
        </div>
        ${model.dictationResult ? dictationResult(model, target) : ""}
      </section>
    </div>
  `;
}

function renderVocab(model: ViewModel): string {
  const cards = dueCards(model);
  if (cards.length === 0) {
    return emptyScreen("Vocab", "今天没有到期卡片", "训练中标记的熟词、生词和听写错词会进入这里。", "#/library", "去选材料");
  }

  const index = Math.min(model.vocabIndex, cards.length - 1);
  const card = cards[index];
  const lesson = findLesson(model.lessons, card.lessonId);

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
        <h2 class="${model.vocabRevealed ? "" : "masked-text"}">${html(card.term)}</h2>
        <p>${model.vocabRevealed ? html(card.meaning) : "先听，再说出意思。"}</p>
        ${model.vocabRevealed ? `<small>${html(card.example)}</small>` : ""}
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

function renderStats(model: ViewModel): string {
  const attempts = model.snapshot.attempts;
  const mistakes = model.snapshot.mistakes;
  const minutes = Math.round(attempts.reduce((sum, item) => sum + (item.durationSeconds || 0), 0) / 60);
  const distribution = mistakeDistribution(model);
  const roadmap = buildGoalRoadmap(model);

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
            <p class="kicker">Roadmap</p>
            <h2>${html(roadmap.phaseName)}</h2>
          </div>
          <strong>${roadmap.progressPercent}%</strong>
        </div>
        <p>${html(roadmap.phaseDescription)}</p>
        <div class="progress large" style="--progress:${roadmap.progressPercent}%"><span></span></div>
        <div class="milestone-list compact">
          ${roadmap.milestones.map((item) => milestoneItem(item.day, item.title, item.outcome, item.evidence)).join("")}
        </div>
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
        <p>${html(nextAdvice(model.snapshot))}</p>
        ${distribution.items[0] ? `<a class="btn primary" href="#/train/${html(model.snapshot.mistakes.find((item) => item.type === distribution.items[0].type)?.lessonId || recommendLesson(model).id)}">${icon("play")}${html(distribution.items[0].type)} 专项训练</a>` : ""}
      </section>
    </div>
  `;
}

function renderSettings(model: ViewModel): string {
  return `
    <div class="screen">
      <header class="screen-head">
        <div>
          <p class="kicker">Settings</p>
          <h1>目标和本地训练数据</h1>
          <p>目标决定素材难度、每日计划和统计口径。个人数据只保存在当前浏览器。</p>
        </div>
      </header>

      <section class="panel settings-list">
        ${settingChoice("learnerLevel", "当前状态", "用来决定材料可懂度和第一阶段节奏。", model.settings.learnerLevel, LEARNER_LEVEL_OPTIONS)}
        ${settingChoice("listeningGoal", "训练目标", "首页路线和素材推荐会围绕这个目标组织。", model.settings.listeningGoal, goalOptions())}
        ${settingChoice("targetHorizonDays", "目标周期", "周期越长，路线会覆盖更多真实语速迁移。", model.settings.targetHorizonDays, TARGET_HORIZON_OPTIONS)}
        ${settingNumber("dailyGoalMinutes", "每日目标", "建议 30-60 分钟，稳定优先。", model.settings.dailyGoalMinutes)}
        ${settingSelect("defaultRate", "默认语速", "精听可以降速，复听要回到正常语速。", model.settings.defaultRate, [0.75, 0.9, 1, 1.15, 1.25], "x")}
        ${settingSelect("preferredAccent", "偏好口音", "自动会按材料等级推荐。", model.settings.preferredAccent, ["自动", "US", "UK", "AU"], "")}
        ${settingToggle("showTranscriptFirst", "首次显示原文", "关闭时更符合声音优先。", model.settings.showTranscriptFirst)}
        ${settingToggle("reduceMotion", "减少动效", "需要更稳的界面时打开。", model.settings.reduceMotion)}
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

function metric(label: string, value: string, caption: string): string {
  return `
    <article class="metric">
      <span>${html(label)}</span>
      <strong>${html(value)}</strong>
      <small>${html(caption)}</small>
    </article>
  `;
}

export function renderOnboarding(model: ViewModel): string {
  if (model.settings.onboardingComplete) return "";
  return `
    <section class="onboarding-layer" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div class="onboarding-sheet">
        <button class="sheet-close" data-action="dismiss-goal" aria-label="稍后再说">${icon("close")}</button>
        <p class="kicker">Start</p>
        <h2 id="onboarding-title">先定一个听力目标</h2>
        <p>告诉我几件事，我会按合适的难度和材料安排训练。</p>

        <div class="onboarding-section">
          <span class="step-badge">1</span>
          <strong>当前状态</strong>
          <div class="choice-grid three">
            ${LEARNER_LEVEL_OPTIONS.map((option) => onboardingChoice("learnerLevel", option.value, option.label, option.caption, model.settings.learnerLevel)).join("")}
          </div>
        </div>

        <div class="onboarding-section">
          <span class="step-badge">2</span>
          <strong>训练目标</strong>
          <div class="choice-grid two">
            ${goalOptions().map((option) => onboardingChoice("listeningGoal", option.value, option.label, option.caption, model.settings.listeningGoal)).join("")}
          </div>
        </div>

        <div class="onboarding-section">
          <span class="step-badge">3</span>
          <strong>每天时间</strong>
          <div class="time-grid">
            ${[20, 30, 45, 60].map((minutes) => `
              <button class="time-choice ${model.settings.dailyGoalMinutes === minutes ? "active" : ""}" data-action="set-setting" data-setting="dailyGoalMinutes" data-value="${minutes}">
                <strong>${minutes}</strong>
                <span>分钟</span>
              </button>
            `).join("")}
          </div>
        </div>

        <div class="onboarding-section compact">
          <span class="step-badge">4</span>
          <strong>目标周期</strong>
          <div class="time-grid">
            ${TARGET_HORIZON_OPTIONS.map((option) => `
              <button class="time-choice ${model.settings.targetHorizonDays === option.value ? "active" : ""}" data-action="set-setting" data-setting="targetHorizonDays" data-value="${option.value}">
                <strong>${option.label}</strong>
                <span>${html(option.caption)}</span>
              </button>
            `).join("")}
          </div>
        </div>

        <button class="btn primary sheet-cta" data-action="confirm-goal">${icon("check")}生成今日训练</button>
      </div>
    </section>
  `;
}

function milestoneItem(day: number, title: string, outcome: string, evidence: string): string {
  return `
    <article class="milestone-item">
      <span>${day} 天</span>
      <div>
        <strong>${html(title)}</strong>
        <p>${html(outcome)}</p>
        <small>${html(evidence)}</small>
      </div>
    </article>
  `;
}

function pathStep(item: DailyPlanItem): string {
  return `
    <a class="path-step" href="${item.href}">
      <span>${item.minutes}m</span>
      <strong>${html(shortPlanTitle(item))}</strong>
      <small>${html(planOutcome(item))}</small>
    </a>
  `;
}

function shortPlanTitle(item: DailyPlanItem): string {
  if (item.id === "review") return "错句复听";
  if (item.id === "intensive") return "精听";
  if (item.id === "shadow") return "跟读";
  return "词汇";
}

function planOutcome(item: DailyPlanItem): string {
  if (item.id === "review") return "热身旧盲区";
  if (item.id === "intensive") return "找听不出的句子";
  if (item.id === "shadow") return "修正节奏弱读";
  return "听音识义";
}

function assetShortcut(title: string, value: string, caption: string, href: string, iconName: "repeat" | "cards" | "pen"): string {
  return `
    <a class="asset-card" href="${href}">
      <span class="asset-icon">${icon(iconName)}</span>
      <span>
        <strong>${html(title)}</strong>
        <small>${html(caption)}</small>
      </span>
      <em>${html(value)}</em>
    </a>
  `;
}

function onboardingChoice<T extends string>(key: string, value: T, label: string, caption: string, current: T): string {
  return `
    <button class="choice-card ${value === current ? "active" : ""}" data-action="set-setting" data-setting="${key}" data-value="${attr(value)}">
      <span class="choice-icon">${icon(choiceIcon(value))}</span>
      <strong>${html(label)}</strong>
      <small>${html(caption)}</small>
    </button>
  `;
}

function choiceIcon(value: string): "today" | "library" | "speaker" | "chart" {
  if (value === "foundation" || value === "daily") return "today";
  if (value === "reader" || value === "shows") return "library";
  if (value === "work") return "chart";
  return "speaker";
}

function libraryCard(lesson: Lesson, progress: { completedSentences: number } | undefined): string {
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
        <a class="btn primary" href="#/train/${lesson.id}">${icon("play")}精听找盲区</a>
        <a class="btn" href="#/dictation/${lesson.id}">${icon("pen")}听写查漏词</a>
      </div>
    </article>
  `;
}

function sentenceRow(sentence: LessonSentence, itemIndex: number, activeIndex: number): string {
  return `
    <button class="sentence-row ${itemIndex === activeIndex ? "active" : ""}" data-action="set-sentence" data-index="${itemIndex}">
      <span>${itemIndex + 1}</span>
      <strong>${html(sentence.text)}</strong>
      <small>${html(sentence.meaning)}</small>
    </button>
  `;
}

function dictationResult(model: ViewModel, target: string): string {
  const result = model.dictationResult;
  if (!result) return "";
  return `
    <div class="result-box">
      <h2>${result.score}%</h2>
      <p>红色是漏听或错位。把这些词放回原句复听。</p>
      <div class="word-grid">
        ${result.words.map((item) => `<span class="word ${item.status}">${html(item.word)}</span>`).join("")}
      </div>
      <p class="hint">漏词 ${result.missed} · 多词 ${result.extra} · 近似 ${result.near}</p>
      <small>${html(target)}</small>
    </div>
  `;
}

function bars(items: { type: string; count: number; percent: number }[]): string {
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

function settingNumber(key: string, title: string, caption: string, value: number): string {
  return `
    <label class="setting-row">
      <span><strong>${html(title)}</strong><small>${html(caption)}</small></span>
      <input class="field" data-setting="${key}" type="number" min="10" max="180" step="5" value="${value}">
    </label>
  `;
}

function settingSelect(key: string, title: string, caption: string, value: string | number, options: (string | number)[], suffix: string): string {
  return `
    <label class="setting-row">
      <span><strong>${html(title)}</strong><small>${html(caption)}</small></span>
      <select class="field" data-setting="${key}">
        ${options.map((option) => `<option value="${attr(option)}" ${String(option) === String(value) ? "selected" : ""}>${html(option)}${suffix}</option>`).join("")}
      </select>
    </label>
  `;
}

function settingChoice<T extends string | number>(key: string, title: string, caption: string, value: T, options: GoalOption<T>[]): string {
  return `
    <label class="setting-row">
      <span><strong>${html(title)}</strong><small>${html(caption)}</small></span>
      <select class="field" data-setting="${key}">
        ${options.map((option) => `<option value="${attr(option.value)}" ${option.value === value ? "selected" : ""}>${html(option.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function goalOptions(): GoalOption<ListeningGoal>[] {
  return Object.values(GOAL_PROFILES).map((item) => ({
    value: item.id,
    label: item.title,
    caption: item.promise
  }));
}

function settingToggle(key: string, title: string, caption: string, checked: boolean): string {
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

function emptyScreen(kicker: string, title: string, caption: string, href: string, action: string): string {
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

export function findLesson(lessons: Lesson[], id: string): Lesson | undefined {
  return lessons.find((lesson) => lesson.id === id);
}

export function progressMap(model: ViewModel): Map<string, { completedSentences: number; completed: boolean }> {
  return new Map(model.snapshot.progress.map((item) => [item.lessonId, item]));
}

export function todayMinutes(model: ViewModel): number {
  const today = currentLocalDate();
  const seconds = model.snapshot.attempts
    .filter((item) => item.date === today)
    .reduce((sum, item) => sum + item.durationSeconds, 0);
  return Math.round(seconds / 60);
}

export function dueCards(model: ViewModel): VocabCard[] {
  const today = currentLocalDate();
  return model.snapshot.vocabCards
    .filter((card) => card.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getSentenceIndex(model: ViewModel, lesson: Lesson): number {
  return model.sentenceIndex[lesson.id] ?? 0;
}

export function revealState(model: ViewModel, lesson: Lesson): boolean {
  return model.revealByLesson[lesson.id] ?? model.settings.showTranscriptFirst;
}

export function loopState(model: ViewModel, lesson: Lesson): boolean {
  return Boolean(model.loopByLesson[lesson.id]);
}

export function trainMode(model: ViewModel, lesson: Lesson): "精听" | "跟读" {
  return model.modeByLesson[lesson.id] ?? (lesson.recommendedMode === "跟读" ? "跟读" : "精听");
}

function isCurrentSentencePlaying(model: ViewModel, lesson: Lesson, sentence: LessonSentence): boolean {
  return model.activePlayback?.lessonId === lesson.id && model.activePlayback.sentenceId === sentence.id;
}

function playButton(isPlaying: boolean): string {
  return `
    <button class="play-btn ${isPlaying ? "playing" : ""}" data-action="play-current" aria-label="${isPlaying ? "暂停播放" : "播放当前句"}">
      ${icon(isPlaying ? "pause" : "play")}${isPlaying ? "暂停" : "播放"}
    </button>
  `;
}

export function markedTypes(model: ViewModel, sentenceId: string): string[] {
  return model.snapshot.mistakes.filter((item) => item.sentenceId === sentenceId).map((item) => item.type);
}

export function dictationTarget(lesson: Lesson): string {
  return lesson.sentences.slice(0, 3).map((sentence) => sentence.text).join(" ");
}

export function mistakeDistribution(model: ViewModel): { total: number; items: { type: string; count: number; percent: number }[] } {
  const counts = new Map<string, number>();
  model.snapshot.mistakes.forEach((item) => counts.set(item.type, (counts.get(item.type) || 0) + 1));
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  return {
    total,
    items: Array.from(counts.entries())
      .map(([type, count]) => ({ type, count, percent: total ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
  };
}

function currentLocalDate(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
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
