import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

const question = '今天 GMV 变化的主要原因是什么？';
const viewports = [
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 1440, height: 900, name: '1440x900' },
  { width: 1280, height: 800, name: '1280x800' },
];

function collectRelevantConsole(page: Page): ConsoleMessage[] {
  const messages: ConsoleMessage[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') messages.push(message);
  });
  return messages;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('经营驾驶舱关键经营流在桌面视口可用', async ({ page }) => {
  const consoleMessages = collectRelevantConsole(page);
  let analysisRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/analysis') analysisRequests += 1;
  });

  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
  await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Internal Server Error|Vite Error|Unexpected Application Error/);

  await page.getByRole('button', { name: '实时监控' }).click();
  await expect(page.getByRole('heading', { name: '分钟经营脉冲' })).toBeVisible();
  await expect(page.getByLabel('平台')).toBeVisible();

  await page.getByRole('button', { name: '智能分析' }).click();
  await expect(page.getByText('今日经营结论')).toBeVisible();
  await expect(page.getByText('本地分析')).toBeVisible();
  // React StrictMode 会取消并重发首次 effect；记录稳定后的基线，
  // 后续只验证用户交互确实触发了新的分析请求。
  const initialAnalysisRequests = analysisRequests;
  expect(initialAnalysisRequests).toBeGreaterThan(0);

  const preset = page.getByRole('button', { name: question });
  await expect(preset).toBeEnabled();
  await preset.click();
  await expect(page.getByRole('log', { name: '分析对话记录' })).toContainText(question);
  await expect(page.getByRole('log', { name: '分析对话记录' })).toContainText(/GMV|经营/);
  await expect(page.getByText('行动建议')).toBeVisible();
  await expect.poll(() => analysisRequests).toBeGreaterThan(initialAnalysisRequests);

  await page.getByRole('button', { name: '实时监控' }).click();
  await page.getByLabel('平台').selectOption({ index: 1 });
  await expect(page.getByLabel('平台')).toHaveValue('京东');
  await page.getByRole('button', { name: '智能分析' }).click();
  await expect(page.getByText('本地分析')).toBeVisible();
  await expect.poll(() => analysisRequests).toBeGreaterThan(initialAnalysisRequests + 1);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
  }

  const relevantMessages = consoleMessages.filter((message) => !/chart container.*(width|height).*0/i.test(message.text()));
  expect(relevantMessages.map((message) => `${message.type()}: ${message.text()}`)).toEqual([]);
});

test('保存三个桌面视口的实时监控与智能分析截图 @screenshots', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: '实时监控' }).click();
    await expect(page.getByRole('heading', { name: '分钟经营脉冲' })).toBeVisible();
    await page.waitForTimeout(500);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `screenshots/realtime-${viewport.name}.png`, fullPage: false });

    await page.getByRole('button', { name: '智能分析' }).click();
    await expect(page.getByText('今日经营结论')).toBeVisible();
    await expect(page.getByText('本地分析')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `screenshots/analysis-${viewport.name}.png`, fullPage: false });
  }
});
