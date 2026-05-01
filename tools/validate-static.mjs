import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "styles/app.css",
  "scripts/app.js",
  "scripts/audio.js",
  "scripts/config.js",
  "scripts/db.js",
  "scripts/utils.js",
  "data/lessons.json",
  "assets/icon.svg"
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`缺少静态资源：${file}`);
  }
}

const manifest = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
if (!manifest.start_url || manifest.display !== "standalone") {
  throw new Error("manifest.webmanifest 缺少 PWA 必要字段");
}

const data = JSON.parse(readFileSync("data/lessons.json", "utf8"));
if (!Array.isArray(data.lessons) || data.lessons.length < 1) {
  throw new Error("data/lessons.json 必须包含 lessons 数组");
}

for (const lesson of data.lessons) {
  const requiredLessonFields = ["id", "title", "level", "accent", "duration", "sentences", "vocab"];
  for (const field of requiredLessonFields) {
    if (!(field in lesson)) throw new Error(`${lesson.id || "未知课程"} 缺少字段：${field}`);
  }
  if (!Array.isArray(lesson.sentences) || lesson.sentences.length < 1) {
    throw new Error(`${lesson.id} 必须包含 sentences`);
  }
}

const serviceWorker = readFileSync("service-worker.js", "utf8");
for (const file of requiredFiles.filter((file) => file !== "service-worker.js")) {
  if (!serviceWorker.includes(`./${file}`) && file !== "index.html") {
    throw new Error(`service-worker.js 未缓存：${file}`);
  }
}

console.log("静态资源校验通过");
