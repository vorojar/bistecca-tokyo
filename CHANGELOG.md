# 更新日志

## 2026-05-01

- 将原 BISTECCA 静态落地页改造成英语听力学习 SPA。
- 新增今日训练、素材库、精听/跟读、听写、听力词汇、统计和设置路由。
- 新增 `data/lessons.json` 示例课程数据和 IndexedDB 本地进度存储。
- 新增 GitHub Pages 自动部署 workflow，`main` 分支每次推送后自动发布。
- 打磨为更清爽的 App 视觉风格，优化桌面、iPad 和手机布局。
- 拆分前端脚本为配置、数据层、音频层、工具函数和应用入口模块。
- 新增 PWA manifest、应用图标、service worker 离线缓存。
- 新增 IndexedDB 数据导出、导入、清空和静态资源校验脚本。
- 迁移到 `Vite + TypeScript`，按 `core / ui / types / styles` 拆分应用结构。
- 新增 Playwright + axe 三端端到端测试，覆盖今日训练、训练闭环和设置页数据管理。
- GitHub Pages 部署流程改为 `npm ci --include=dev`、构建、端到端验证、发布 `dist`。
