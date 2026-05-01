import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function dismissOnboarding(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "先定一个听力目标" });
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "稍后再说" }).click();
    await expect(dialog).toBeHidden();
  }
}

async function completeOnboarding(page: Page): Promise<void> {
  await expect(page.getByRole("dialog", { name: "先定一个听力目标" })).toBeVisible();
  await page.getByRole("button", { name: /刚打基础/ }).click();
  await page.getByRole("button", { name: /工作会议听懂/ }).click();
  await page.getByRole("button", { name: /^30\s*分钟$/ }).click();
  await page.locator('[data-setting="targetHorizonDays"][data-value="90"]').click();
  await page.getByRole("button", { name: /生成今日训练/ }).click();
  await expect(page.getByRole("dialog", { name: "先定一个听力目标" })).toBeHidden();
}

test("刷新直达页面时不闪出启动文案", async ({ page }) => {
  await page.route(/\/bistecca-tokyo\/assets\/index-.*\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });

  const navigation = page.goto("#/library", { waitUntil: "commit" });
  await page.waitForTimeout(120);
  await expect(page.getByText("正在准备今日训练")).toBeHidden();
  await navigation;
  await expect(page.getByRole("heading", { name: "选一段听得懂的材料" })).toBeVisible();
});

test("首次进入先完成目标引导并持久化", async ({ page }) => {
  await page.goto("#/today");
  await completeOnboarding(page);
  await expect(page.getByText("今日训练已生成")).toBeVisible();
  await expect(page.getByRole("heading", { name: "今天听一轮，找到你的听力盲区" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "先定一个听力目标" })).toBeHidden();
  await expect(page.getByText(/你的目标：90 天 工作会议听懂/)).toBeVisible();
});

test("今日训练首页可用且无严重可访问性问题", async ({ page }) => {
  await page.goto("#/today");
  await dismissOnboarding(page);
  await expect(page.getByRole("heading", { name: "今天听一轮，找到你的听力盲区" })).toBeVisible();
  await expect(page.getByRole("link", { name: /开始 15 分钟精听/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日路径" })).toBeVisible();
  await expect(page.getByRole("link", { name: /错句复听.*完成第一轮后自动收集错句/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /听力词汇/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /听写记录/ })).toBeVisible();
  await expect(page.getByText(/你的目标：180 天 日常交流听懂/)).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test("切换 tab 时滚动位置互不污染", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await page.goto("#/library");
  await dismissOnboarding(page);
  await expect(page.getByRole("heading", { name: "选一段听得懂的材料" })).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(120);

  await page.locator('[data-tab="today"]:visible').click();
  await expect(page.getByRole("heading", { name: "今天听一轮，找到你的听力盲区" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(30);

  await page.locator('[data-tab="library"]:visible').click();
  await expect(page.getByRole("heading", { name: "选一段听得懂的材料" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(120);
});

test("核心训练流程可完成一轮并进入统计", async ({ page }) => {
  await page.goto("#/train/coffee-chat-b1");
  await dismissOnboarding(page);
  await expect(page.locator("h1", { hasText: "A Short Coffee Chat" })).toBeVisible();

  await page.getByRole("button", { name: "显示或隐藏原文" }).click();
  await expect(page.locator(".sentence-stage h2")).toContainText("I was going to grab a coffee before the meeting starts.");

  await page.getByRole("button", { name: "连读" }).click();
  await page.getByRole("button", { name: /完成本轮/ }).click();
  await expect(page.getByText("本轮已记录")).toBeVisible();

  await page.goto("#/stats");
  await expect(page.getByRole("heading", { name: "下一次该练什么" })).toBeVisible();
  await expect(page.locator(".bar-row", { hasText: "连读" })).toBeVisible();
  await expect(page.getByRole("link", { name: /专项训练/ })).toBeVisible();
});

test("设置页支持数据管理入口", async ({ page }) => {
  await page.goto("#/settings");
  await dismissOnboarding(page);
  await expect(page.getByRole("heading", { name: "目标和本地训练数据" })).toBeVisible();
  await expect(page.getByLabel("训练目标")).toBeVisible();
  await page.getByLabel("训练目标").selectOption("work");
  await expect(page.getByText("设置已保存")).toBeVisible();
  await expect(page.getByRole("button", { name: /导出数据/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /导入数据/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /清空数据/ })).toBeVisible();
});

test("听写评分能标出漏词和近似词", async ({ page }) => {
  await page.goto("#/dictation/coffee-chat-b1");
  await dismissOnboarding(page);
  await page.getByPlaceholder("写下你听到的英文").fill("I was going to grab coffee before meeting start");
  await page.getByRole("button", { name: /对照原文/ }).click();
  await expect(page.locator(".result-box")).toBeVisible();
  await expect(page.locator(".word.missed").first()).toBeVisible();
});
