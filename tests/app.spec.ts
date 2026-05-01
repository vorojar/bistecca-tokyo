import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("今日训练首页可用且无严重可访问性问题", async ({ page }) => {
  await page.goto("#/today");
  await expect(page.getByRole("heading", { name: /看得懂/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "你会逐步拿到什么结果" })).toBeVisible();
  await expect(page.getByRole("button", { name: /确认我的路线/ })).toBeVisible();
  await page.getByRole("button", { name: /确认我的路线/ }).click();
  await expect(page.getByText(/路线已生成/)).toBeVisible();
  await expect(page.getByText(/每天 45 分钟/)).toBeVisible();
  await expect(page.getByRole("link", { name: /开始今天/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日 40 分钟计划" })).toBeVisible();
  await expect(page.getByText(/错句复听|昨天错句复听/)).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test("核心训练流程可完成一轮并进入统计", async ({ page }) => {
  await page.goto("#/train/coffee-chat-b1");
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
  await page.getByPlaceholder("写下你听到的英文").fill("I was going to grab coffee before meeting start");
  await page.getByRole("button", { name: /对照原文/ }).click();
  await expect(page.locator(".result-box")).toBeVisible();
  await expect(page.locator(".word.missed").first()).toBeVisible();
});
