import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("今日训练首页可用且无严重可访问性问题", async ({ page }) => {
  await page.goto("#/today");
  await expect(page.getByRole("heading", { name: /今天练/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /开始训练/ })).toBeVisible();

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
  await expect(page.getByText("连读")).toBeVisible();
});

test("设置页支持数据管理入口", async ({ page }) => {
  await page.goto("#/settings");
  await expect(page.getByRole("heading", { name: "本地训练数据" })).toBeVisible();
  await expect(page.getByRole("button", { name: /导出数据/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /导入数据/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /清空数据/ })).toBeVisible();
});
