# CoreUI Dashboard Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom dashboard shell with a legally attributed CoreUI MIT shell while preserving the existing simulation and Olist pilot data contracts.

**Architecture:** Vendor only the selected CoreUI layout source and its MIT notice, then adapt it into small local shell components. Existing providers remain mutually exclusive below the shell. Route-level views lazy-load their chart-heavy content and retain their current API boundaries.

**Tech Stack:** React 19, Vite 8, TypeScript, CoreUI React 5, Bootstrap 5, ECharts, Vitest, Playwright.

## Global Constraints

- Copy source only from `coreui/coreui-free-react-admin-template` commit `1c09f27`, whose license is MIT.
- Preserve CoreUI copyright and full MIT text in `THIRD_PARTY_NOTICES.md`; record the upstream URL, commit, copied paths, and local changes.
- Do not alter `/api/pilot/*`, SQLite schemas, Olist importer/replay semantics, or trusted pilot-analysis request boundary.
- Olist pages show only their existing seven supported KPIs and never render inventory, margin, traffic, advertising, refund, target, or forecast placeholders.
- Simulation and pilot providers must be mutually exclusive; inactive providers and chart-heavy pages must be unmounted.
- All user-visible copy and documentation are Simplified Chinese.
- Each task follows RED -> GREEN, writes a report under `.superpowers/sdd/2026-08-13-coreui-dashboard-refactor/`, commits only task files, and runs no command longer than 90 seconds.

---

### Task 1: Vendor CoreUI shell and attribution

**Files:**
- Create: `src/coreui/AppShell.tsx`, `src/coreui/AppSidebar.tsx`, `src/coreui/AppTopbar.tsx`, `src/coreui/navigation.ts`, `src/coreui/AppShell.test.tsx`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `package.json`, `pnpm-lock.yaml`, `src/styles/global.css`, `README.md`

**Interfaces:**
- Produces `AppShell({ activeView, onViewChange, source, onSourceChange, children })`.
- `activeView` is `'overview' | 'realtime' | 'analysis' | 'pilot'`; `source` is `'simulation' | 'pilot'`.
- `onViewChange` and `onSourceChange` are called only from user interactions.

- [ ] **Step 1: Write failing shell tests**

```tsx
test('renders CoreUI-style navigation and changes views', async () => {
  const onViewChange = vi.fn();
  render(<AppShell activeView="overview" onViewChange={onViewChange} source="simulation" onSourceChange={vi.fn()}><p>内容</p></AppShell>);
  await userEvent.click(screen.getByRole('button', { name: '实时监控' }));
  expect(onViewChange).toHaveBeenCalledWith('realtime');
  expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
});

test('switches data source without changing the active view', async () => {
  const onSourceChange = vi.fn();
  render(<AppShell activeView="overview" onViewChange={vi.fn()} source="simulation" onSourceChange={onSourceChange}><p>内容</p></AppShell>);
  await userEvent.click(screen.getByRole('button', { name: 'Olist 真实试点' }));
  expect(onSourceChange).toHaveBeenCalledWith('pilot');
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run src/coreui/AppShell.test.tsx`

Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 3: Copy and adapt the permitted CoreUI source**

Copy the selected MIT layout patterns from upstream `src/layout/DefaultLayout.jsx`, `src/components/AppSidebar.jsx`, and `src/components/AppHeader.jsx`; adapt imports and props to TypeScript. Add only `@coreui/coreui`, `@coreui/react`, `@coreui/icons`, and `@coreui/icons-react` dependencies. Use sidebar/header/container/card primitives, not upstream demo views, Redux, router, authentication, or theme demo code.

- [ ] **Step 4: Add complete attribution**

Create `THIRD_PARTY_NOTICES.md` containing the upstream repository URL, commit `1c09f27`, copied source paths, local modification statement, CoreUI copyright notice, and full MIT text. Add a README link titled `第三方源码与许可`.

- [ ] **Step 5: Run GREEN**

Run:

```text
pnpm exec vitest run src/coreui/AppShell.test.tsx
pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```text
git add package.json pnpm-lock.yaml src/coreui src/styles/global.css README.md THIRD_PARTY_NOTICES.md
git commit -m "feat: add attributed coreui application shell"
```

### Task 2: Integrate four lazy views and preserve data boundaries

**Files:**
- Modify: `src/App.tsx`, `src/App.test.tsx`
- Create: `src/features/overview/OverviewPage.tsx`, `src/features/overview/OverviewPage.test.tsx`
- Modify: `src/features/pilot/PilotApp.tsx`, `src/features/pilot/PilotApp.test.tsx`

**Interfaces:**
- `App` owns `activeView` and source mode.
- `overview` displays simulation KPI/summary only; `realtime` and `analysis` keep existing simulation implementations; `pilot` mounts `PilotDashboardProvider` only when source is `pilot`.
- Lazy page modules are loaded with `React.lazy`; inactive pages return `null` and their providers unmount.

- [ ] **Step 1: Write failing navigation and lifecycle tests**

```tsx
test('shows exactly four top-level views and mounts only the selected data provider', async () => {
  render(<App />);
  expect(screen.getByRole('button', { name: '概览' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '实时监控' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '智能分析' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Olist 试点' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Olist 真实试点' }));
  await userEvent.click(screen.getByRole('button', { name: 'Olist 试点' }));
  expect(screen.queryByText('支付转化率')).not.toBeInTheDocument();
});

test('does not show unsupported pilot metric names', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Olist 真实试点' }));
  await userEvent.click(screen.getByRole('button', { name: 'Olist 试点' }));
  expect(screen.queryByText(/毛利|库存|广告|预测|目标/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run src/App.test.tsx src/features/overview/OverviewPage.test.tsx`

Expected: FAIL because the four-view shell and overview page do not exist.

- [ ] **Step 3: Integrate shell and views**

Render `AppShell` above one selected lazy view. Map overview to a compact management summary built from existing simulation snapshot fields; map realtime and analysis to the existing pages; map pilot to `PilotApp` under `PilotDashboardProvider`. Remove the old custom top-level header and data source switch from `App`, but do not delete reusable content components.

- [ ] **Step 4: Make pilot mode page-level rather than tab-level**

Have `PilotApp` render its existing realtime/analysis content based on the shell-selected view. It must retain Olist header, source attribution, license, replay controls, filters, errors, retry and stale result behavior. Return no pilot provider content for overview/realtime/analysis when source is simulation.

- [ ] **Step 5: Run GREEN**

Run:

```text
pnpm exec vitest run src/App.test.tsx src/features/overview/OverviewPage.test.tsx src/features/pilot/PilotApp.test.tsx tests/app/pilotDashboardFlow.test.tsx
pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```text
git add src/App.tsx src/App.test.tsx src/features/overview src/features/pilot/PilotApp.tsx src/features/pilot/PilotApp.test.tsx
git commit -m "feat: organize dashboards in coreui navigation"
```

### Task 3: Acceptance, attribution audit and scorecard

**Files:**
- Create: `docs/coreui-dashboard-scorecard.md`, `e2e/coreui-shell.spec.ts`
- Modify: `README.md`, `playwright.config.ts` only if required for the new E2E selection

**Interfaces:**
- Scorecard records six rubric scores, concrete evidence, total, and known limits.
- E2E uses existing isolated `OLIST_DATA_DIR`; no user `var/olist` data is read or written.

- [ ] **Step 1: Write failing browser acceptance test**

```ts
test('navigates the coreui shell on desktop and mobile without overflow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '展开导航' }).click();
  await page.getByRole('button', { name: '智能分析' }).click();
  await expect(page.getByText('今日经营结论')).toBeVisible();
  await page.getByRole('button', { name: 'Olist 真实试点' }).click();
  await page.getByRole('button', { name: 'Olist 试点' }).click();
  await expect(page.getByText('真实匿名历史数据回放')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec playwright test e2e/coreui-shell.spec.ts --reporter=line`

Expected: FAIL because the new shell controls do not yet exist.

- [ ] **Step 3: Add only required accessibility and responsive behavior**

Ensure sidebar expand/collapse has a visible accessible name, current view has `aria-current="page"`, keyboard focus remains visible, and mobile layout has no clipped shell content. Keep chart rendering lazy and do not change business metrics.

- [ ] **Step 4: Write scorecard and attribution audit**

Document the exact 100-point rubric, evidence from test results and source paths, total score, score target, and residual non-production limits. README must link to the scorecard and third-party notice.

- [ ] **Step 5: Run final gates sequentially**

Run:

```text
pnpm test
pnpm exec tsc --noEmit
pnpm build
pnpm e2e
pnpm screenshots
git diff --check
git ls-files var .env .env.local
git grep -n -I -E "DEEPSEEK_API_KEY=|sk-[A-Za-z0-9_-]{10,}"
```

- [ ] **Step 6: Commit**

```text
git add README.md docs/coreui-dashboard-scorecard.md e2e/coreui-shell.spec.ts playwright.config.ts
git commit -m "test: verify coreui dashboard shell"
```
