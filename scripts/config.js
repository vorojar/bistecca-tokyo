export const DB_NAME = "auralift-listening-v1";
export const DB_VERSION = 1;

export const STORES = ["progress", "attempts", "mistakes", "vocabCards", "settings"];

export const DEFAULT_SETTINGS = {
  key: "user",
  dailyGoalMinutes: 45,
  defaultRate: 1,
  showTranscriptFirst: false,
  preferredAccent: "自动",
  reduceMotion: false
};

export const MISTAKE_TYPES = ["连读", "弱读", "生词", "口音", "语速快", "熟词听不出"];

export const ROUTES = [
  { id: "today", label: "今日", icon: "today", href: "#/today" },
  { id: "library", label: "素材", icon: "library", href: "#/library" },
  { id: "vocab", label: "词汇", icon: "cards", href: "#/vocab" },
  { id: "stats", label: "统计", icon: "chart", href: "#/stats" },
  { id: "settings", label: "设置", icon: "settings", href: "#/settings" }
];

export const ICON_PATHS = {
  today: "M8 2v3M16 2v3M3.5 9h17M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  library: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM4 5.5v16M8 7h8M8 11h8",
  cards: "M7 4h12a2 2 0 0 1 2 2v12M5 8h12a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM7 13h7",
  chart: "M4 19V5M4 19h17M8 16v-5M13 16V8M18 16v-9",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4",
  play: "M8 5v14l11-7-11-7Z",
  prev: "M15 18 9 12l6-6M20 18l-6-6 6-6",
  next: "m9 18 6-6-6-6M4 18l6-6-6-6",
  back: "M15 18 9 12l6-6",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  repeat: "M17 2l4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4M21 13v3a2 2 0 0 1-2 2H3",
  check: "m5 12 4 4L19 6",
  speaker: "M4 10v4h4l5 4V6l-5 4H4ZM17 9a4 4 0 0 1 0 6",
  pen: "M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  upload: "M12 21V9M7 14l5-5 5 5M4 3h16",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3",
  close: "M6 6l12 12M18 6 6 18"
};
