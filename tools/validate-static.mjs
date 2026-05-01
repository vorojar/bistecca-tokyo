import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = existsSync("dist") ? "dist" : ".";
const requiredFiles = [
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "data/lessons.json",
  "assets/icon.svg"
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    throw new Error(`缺少静态资源：${join(root, file)}`);
  }
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
if (!manifest.start_url || manifest.display !== "standalone" || !manifest.icons?.length) {
  throw new Error("manifest.webmanifest 缺少 PWA 必要字段");
}

const data = JSON.parse(readFileSync(join(root, "data/lessons.json"), "utf8"));
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

const index = readFileSync(join(root, "index.html"), "utf8");
if (!index.includes("Auralift")) throw new Error("index.html 缺少应用标识");

if (root === "dist") {
  const assetFiles = readdirSync(join(root, "assets"));
  const hasBuiltScript = assetFiles.some((file) => file.endsWith(".js"));
  const hasBuiltStyle = assetFiles.some((file) => file.endsWith(".css"));
  if (!hasBuiltScript || !hasBuiltStyle) {
    throw new Error("dist/assets 缺少构建后的 JS 或 CSS");
  }
}

console.log(`静态资源校验通过：${root}`);
