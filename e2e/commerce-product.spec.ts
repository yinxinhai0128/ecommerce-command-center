import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { importOlistDataset } from '../server/pilot/importer';

const fixtureDir = join(process.cwd(), 'tests', 'fixtures', 'olist');
const dataDir = join(process.cwd(), 'test-results', 'olist-e2e-data');
const sourceTime = '2017-01-31 00:00:00';

test.beforeAll(async () => {
  if (existsSync(join(dataDir, 'manifest.json'))) return;
  await rm(dataDir, { force: true, recursive: true });
  await importOlistDataset({ sourceDir: fixtureDir, dataDir });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:8788/api/pilot/replay', { data: { action: 'reset' } });
});

async function openOperations(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: '经营数据' }).click();
  await expect(page.getByRole('heading', { name: '经营数据中心' })).toBeVisible();
  await expect(page.getByTestId('pilot-source-local-now')).toContainText(sourceTime);
}

async function ask(page: Page, question: string): Promise<string> {
  await page.getByRole('tab', { name: '智能分析' }).click();
  await page.getByLabel('经营问题').fill(question);
  await page.getByRole('button', { name: '提问' }).click();
  const summary = page.getByTestId('analysis-summary');
  await expect(summary).toBeVisible();
  await expect(page.getByText(`可信快照：源数据本地时间 ${sourceTime}`)).toBeVisible();
  return (await summary.textContent()) ?? '';
}

test('桌面经营数据流程使用可访问侧栏、筛选与稳定的回放快照', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const sidebar = page.getByRole('navigation', { name: '主导航' });
  await expect(sidebar).toBeVisible();
  await page.getByRole('button', { name: '概览' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '实时监控' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '经营数据中心' })).toBeVisible();
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);

  await expect(page.getByRole('form', { name: '经营数据筛选' })).toBeVisible();
  await page.getByLabel('开始日期').fill('2017-01-01');
  await page.getByRole('button', { name: '应用筛选' }).click();
  await expect(page.getByTestId('pilot-source-local-now')).toContainText(sourceTime);

  await page.getByRole('button', { name: '开始回放' }).click();
  await expect(page.getByRole('button', { name: '暂停回放' })).toBeVisible();
  const startedAt = await page.getByTestId('pilot-source-local-now').textContent();
  await expect.poll(async () => page.getByTestId('pilot-source-local-now').textContent()).not.toBe(startedAt);
  await page.getByRole('button', { name: '暂停回放' }).click();
  await expect(page.getByRole('button', { name: '开始回放' })).toBeVisible();
  await page.waitForTimeout(3500);
  const pausedAt = await page.getByTestId('pilot-source-local-now').textContent();
  await page.waitForTimeout(3500);
  await expect(page.getByTestId('pilot-source-local-now')).toHaveText(pausedAt ?? '');
  await page.getByRole('button', { name: '重置回放' }).click();
  await expect(page.getByTestId('pilot-source-local-now')).toContainText(sourceTime);
});

test('分析将支付、配送和评价问题映射为不同的可信快照回答', async ({ page }) => {
  await openOperations(page);
  const payment = await ask(page, '支付结构有什么变化？');
  const delivery = await ask(page, '配送时效是否存在问题？');
  const reviews = await ask(page, '评价情况怎么样？');
  expect(payment).toContain('支付金额');
  expect(delivery).toContain('准时送达率');
  expect(reviews).toContain('平均评分');
  expect(new Set([payment, delivery, reviews]).size).toBe(3);
});

test('状态请求失败后，重试恢复经营数据控制台', async ({ page }) => {
  const failStatus = async (route: Route): Promise<void> => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  await page.route('**/api/pilot/status', failStatus);
  await page.goto('/');
  await page.getByRole('button', { name: '经营数据' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible();

  await page.unroute('**/api/pilot/status', failStatus);
  const recoveredStatus = page.waitForResponse((response) => response.url().includes('/api/pilot/status') && response.ok());
  await page.getByRole('button', { name: '重试' }).click();
  await recoveredStatus;
  await expect(page.getByRole('heading', { name: '经营数据中心' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始回放' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('390 宽度下可实际筛选并控制回放且没有产品禁用文案或水平溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openOperations(page);
  await page.getByLabel('开始日期').fill('2017-01-03');
  await page.getByLabel('结束日期').fill('2017-01-31');
  const filteredSnapshot = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/pilot/snapshot' && url.searchParams.get('start') === '2017-01-03' && url.searchParams.get('end') === '2017-01-31' && response.ok();
  });
  await page.getByRole('button', { name: '应用筛选' }).click();
  await filteredSnapshot;
  await expect(page.getByLabel('开始日期')).toHaveValue('2017-01-03');
  await expect(page.getByLabel('结束日期')).toHaveValue('2017-01-31');
  await page.getByRole('button', { name: '开始回放' }).click();
  await expect(page.getByRole('button', { name: '暂停回放' })).toBeVisible();
  await page.getByRole('button', { name: '暂停回放' }).click();
  await expect(page.getByRole('button', { name: '开始回放' })).toBeVisible();
  await page.getByRole('button', { name: '重置回放' }).click();
  await expect(page.getByTestId('pilot-source-local-now')).toContainText(sourceTime);
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Olist|Kaggle|许可证|试点|Demo|模拟数据/i);
});
