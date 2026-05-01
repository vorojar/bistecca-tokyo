# 10 分上线升级任务

## 目标

除真人音频资产外，把项目提升到正式上线 App 的 10 分标准：工程可维护、体验清爽、数据可靠、部署可验证。

## 任务

- [x] 1. 迁移到 `Vite + TypeScript`，保留 GitHub Pages 静态部署。
- [x] 2. 拆分 `router / db / audio / views / utils / types`，避免单文件应用继续膨胀。
- [x] 3. 将 UI 统一为设计 token 驱动的清爽 App 工具风格。
- [x] 4. IndexedDB 增加版本迁移、默认设置合并、导入格式校验。
- [x] 5. PWA 静态资源迁入 `public`，构建后自动校验。
- [x] 6. GitHub Actions 改为 `npm ci -> npm run build -> deploy dist`。
- [x] 7. 加入 Playwright + axe 核心流程测试。
- [x] 8. 跑完整验证、提交、推送并确认部署。

## 10 分验收维度

- 产品路径：打开即训练，核心闭环不被次级功能打断。
- UX：手机底部 Tab、训练页固定控制、iPad/桌面 split view。
- 工程：TypeScript strict、构建校验、端到端测试。
- 数据：IndexedDB 本地优先，支持导出、导入、清空和默认值迁移。
- PWA：可安装、可离线、缓存版本可控。
- 部署：每次 `main` 更新自动构建并发布。
