import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { importOlistDataset } from '../server/pilot/importer';

const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'olist');
const dataDir = join(process.cwd(), 'test-results', 'olist-e2e-data');

test.beforeAll(async () => {
  if (existsSync(join(dataDir, 'manifest.json'))) return;
  await rm(dataDir, { force: true, recursive: true });
  await importOlistDataset({ sourceDir: fixtureDir, dataDir });
});

async function ask(page: Page, question: string): Promise<void> {
  await page.getByRole('tab', { name: '智能分析' }).click();
  await page.getByLabel('经营问题').fill(question);
  await page.getByRole('button', { name: '提问' }).click();
}

async function openResetPilot(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: '经营数据' }).click();
  await expect(page.getByRole('heading', { name: '经营数据中心' })).toBeVisible();
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
  const pauseResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/pilot/replay'
    && response.request().method() === 'POST' && response.request().postData() === JSON.stringify({ action: 'pause' }));
  await page.getByRole('button', { name: '暂停回放' }).click();
  const pausedReplay = await (await pauseResponse).json() as { sourceLocalNow: string; isRunning: boolean };
  expect(pausedReplay.isRunning).toBe(false);
  await expect(page.getByRole('button', { name: '开始回放' })).toBeVisible();
  await expect(page.getByTestId('pilot-source-local-now')).toHaveText(`数据更新时间 ${pausedReplay.sourceLocalNow}`);
  const pausedTime = await page.getByTestId('pilot-source-local-now').textContent();
  const paused = await page.getByTestId('pilot-item-gmv').textContent();
  await page.waitForTimeout(3500);
  await expect(page.getByTestId('pilot-source-local-now')).toHaveText(pausedTime ?? '');
  await expect(page.getByTestId('pilot-item-gmv')).toHaveText(paused ?? '');
});

test('不同问题返回匹配的可信证据', async ({ page }) => {
  await openResetPilot(page);
  await ask(page, '为什么取消率较高？');
  const cancellationSummary = page.getByTestId('analysis-summary');
  await expect(cancellationSummary).toContainText('不可判定');
  const cancellationText = await cancellationSummary.textContent();
  await expect(page.getByText(/可信快照：源数据本地时间/)).toContainText('2017-01-31 00:00:00');
  await ask(page, '配送是否存在问题？');
  const deliverySummary = page.getByTestId('analysis-summary');
  await expect(deliverySummary).toContainText(/准时送达|配送/);
  expect(await deliverySummary.textContent()).not.toBe(cancellationText);
});
