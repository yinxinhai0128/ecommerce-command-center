import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { importOlistDataset } from '../server/pilot/importer';

const dataDir = join(process.cwd(), 'var', 'olist');
const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'olist');
let createdFixtureData = false;

test.beforeAll(async () => {
  if (existsSync(dataDir)) return;
  await importOlistDataset({ sourceDir: fixtureDir, dataDir });
  createdFixtureData = true;
});

test.afterAll(async () => {
  if (createdFixtureData) await rm(dataDir, { force: true, recursive: true });
});

async function ask(page: Page, question: string): Promise<void> {
  await page.getByRole('tab', { name: '智能分析' }).click();
  await page.getByLabel('经营问题').fill(question);
  await page.getByRole('button', { name: '提问' }).click();
}

async function openResetPilot(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: '真实数据试点' }).click();
  await expect(page.getByText('真实匿名历史数据回放')).toBeVisible();
  await expect(page.getByTestId('pilot-source-local-now')).toBeVisible();
  await page.getByRole('button', { name: '重置回放' }).click();
  await expect(page.getByText('已暂停')).toBeVisible();
  await expect(page.getByTestId('pilot-source-local-now')).toContainText('2017-01-31 00:00:00');
}

test('回放可信 Olist 历史，暂停后时间和当前快照保持不变', async ({ page }) => {
  await openResetPilot(page);
  await page.getByRole('button', { name: '开始回放' }).click();
  await expect(page.getByRole('button', { name: '暂停回放' })).toBeVisible();
  const before = await page.getByTestId('pilot-source-local-now').textContent();
  await expect.poll(async () => page.getByTestId('pilot-source-local-now').textContent()).not.toBe(before);
  await page.getByRole('button', { name: '暂停回放' }).click();
  await expect(page.getByRole('button', { name: '开始回放' })).toBeVisible();
  const pausedTime = await page.getByTestId('pilot-source-local-now').textContent();
  const paused = await page.getByTestId('pilot-item-gmv').textContent();
  await page.waitForTimeout(3500);
  await expect(page.getByTestId('pilot-source-local-now')).toHaveText(pausedTime ?? '');
  await expect(page.getByTestId('pilot-item-gmv')).toHaveText(paused ?? '');
});

test('不同问题返回匹配的可信证据', async ({ page }) => {
  await openResetPilot(page);
  await ask(page, '为什么取消率较高？');
  await expect(page.getByTestId('analysis-summary')).toContainText('取消率');
  await ask(page, '配送是否存在问题？');
  await expect(page.getByTestId('analysis-summary')).toContainText(/准时送达|配送/);
});
