# Olist Real-Data Replay Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-commercial Olist real-data pilot that imports and reconciles official anonymous orders, computes trusted metrics on the server, replays historical time, and answers questions from server-owned evidence without changing the existing simulation mode.

**Architecture:** Keep the browser simulation isolated. Add a `server/pilot` vertical slice backed by Node 24 `node:sqlite`, expose `/api/pilot/*`, and mount a separate React provider and dashboard when the user selects “真实数据试点”. Use small self-authored CSV fixtures in normal tests and keep official Olist files under ignored `var/olist/` for an explicit full-data verification command.

**Tech Stack:** TypeScript 7, Node.js 24 `node:sqlite`, Express 5, React 19, Vitest 4, Playwright, `csv-parse`, `fflate`, existing ECharts and Zod.

## Global Constraints

- Olist data is for personal learning, demonstration, and portfolio use only under CC BY-NC-SA 4.0.
- Never commit Olist CSV files, downloaded archives, generated databases, credentials, or `.env` files.
- Preserve the existing simulation mode and its public contracts.
- Never map unsupported inventory, cost, margin, traffic, advertising ROI, refund amount, target, or forecast fields to zero.
- Olist timestamps remain source-local wall-clock values; label them “源数据本地时间” and do not convert them to Beijing time or an assumed Brazilian offset.
- The browser sends only filters, replay actions, and questions. All pilot metrics and analysis evidence are computed by the server.
- Use Node.js built-in `node:sqlite`; do not add a native SQLite package or Docker requirement.
- New CSV and ZIP dependencies must be pure JavaScript.
- Every production behavior follows RED → observed failure → minimal GREEN → focused regression before commit.
- Do not run full Vitest, build, and Playwright concurrently on this Windows host.

---

### Task 1: Olist source acquisition, manifest, and transactional import

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tsconfig.json`
- Create: `server/pilot/contracts.ts`
- Create: `server/pilot/paths.ts`
- Create: `server/pilot/database.ts`
- Create: `server/pilot/source.ts`
- Create: `server/pilot/importer.ts`
- Create: `server/pilot/verifier.ts`
- Create: `scripts/olist-download.ts`
- Create: `scripts/olist-import.ts`
- Create: `scripts/olist-verify.ts`
- Create: `tests/fixtures/olist/olist_orders_dataset.csv`
- Create: `tests/fixtures/olist/olist_order_items_dataset.csv`
- Create: `tests/fixtures/olist/olist_order_reviews_dataset.csv`
- Create: `tests/fixtures/olist/olist_products_dataset.csv`
- Create: `tests/fixtures/olist/olist_customers_dataset.csv`
- Create: `tests/fixtures/olist/olist_sellers_dataset.csv`
- Create: `tests/fixtures/olist/product_category_name_translation.csv`
- Test: `tests/pilot/importer.test.ts`
- Test: `tests/pilot/verifier.test.ts`

**Interfaces:**
- Produces `resolveOlistPaths(dataDir?: string): OlistPaths`.
- Produces `downloadOlistSource(options: DownloadOptions): Promise<OlistSourceReceipt>`.
- Produces `importOlistDataset(options: ImportOptions): Promise<OlistManifest>`.
- Produces `verifyOlistDataset(options: VerifyOptions): OlistVerification`.
- Produces `openPilotDatabase(path: string): DatabaseSync` for later repository tasks.

- [ ] **Step 1: Add self-authored fixture CSVs and failing import tests**

Use eight orders across normal, canceled, unavailable, shipped, on-time delivered, and late delivered states. Include a two-item order, two categories, two sellers, two customer states, one missing review, and exact decimal values.

```ts
test('imports required Olist files and records matching source rows', async () => {
  const result = await importOlistDataset({ sourceDir: fixtureDir, dataDir: tempDir, now: fixedNow });

  expect(result.ready).toBe(true);
  expect(result.tables.orders).toEqual({ sourceRows: 8, importedRows: 8 });
  expect(result.tables.orderItems).toEqual({ sourceRows: 9, importedRows: 9 });
  expect(result.source.license).toBe('CC BY-NC-SA 4.0');
});

test('reimporting the same source is idempotent', async () => {
  await importOlistDataset({ sourceDir: fixtureDir, dataDir: tempDir, now: fixedNow });
  const first = verifyOlistDataset({ dataDir: tempDir });
  await importOlistDataset({ sourceDir: fixtureDir, dataDir: tempDir, now: fixedNow });
  const second = verifyOlistDataset({ dataDir: tempDir });

  expect(second.tableRows).toEqual(first.tableRows);
  expect(second.itemGmv).toBe(first.itemGmv);
});

test('rolls back when a required foreign key is missing', async () => {
  await expect(importOlistDataset({ sourceDir: brokenFixtureDir, dataDir: tempDir, now: fixedNow }))
    .rejects.toThrow('订单明细引用不存在的商品');
  expect(existsSync(join(tempDir, 'manifest.json'))).toBe(false);
});
```

- [ ] **Step 2: Run the focused tests and record RED**

Run: `pnpm exec vitest run tests/pilot/importer.test.ts tests/pilot/verifier.test.ts`

Expected: FAIL because `server/pilot/importer` and `server/pilot/verifier` do not exist.

- [ ] **Step 3: Add only the required dependencies and scripts**

Add `csv-parse` and `fflate`. Add these scripts exactly:

```json
{
  "data:olist:download": "tsx scripts/olist-download.ts",
  "data:olist:import": "tsx scripts/olist-import.ts",
  "data:olist:verify": "tsx scripts/olist-verify.ts"
}
```

Add `scripts` to `tsconfig.json` includes and add `var/` to `.gitignore` before any dataset command runs.

- [ ] **Step 4: Define the source and manifest contracts**

```ts
export type OlistManifest = {
  ready: true;
  importedAt: string;
  importerVersion: 1;
  source: {
    dataset: 'olistbr/brazilian-ecommerce';
    url: 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce';
    license: 'CC BY-NC-SA 4.0';
    archiveSha256?: string;
  };
  files: Record<string, { sha256: string }>;
  tables: Record<string, { sourceRows: number; importedRows: number }>;
  range: { start: string; end: string };
};

export type OlistVerification = {
  valid: boolean;
  tableRows: Record<string, number>;
  itemGmv: number;
  duplicatePrimaryKeys: number;
  orphanReferences: number;
  range: { start: string; end: string };
};
```

- [ ] **Step 5: Implement transactional import and verification**

Create normalized SQLite tables for orders, items, reviews, products, customers, sellers, category translations, and one-row replay state. Store source timestamps as canonical `YYYY-MM-DD HH:mm:ss` text. Use prepared statements, enable foreign keys, import inside one transaction, write to a temporary database, verify it, then atomically replace the previous database and manifest.

The verifier must independently query row counts, duplicate keys, orphan references, min/max purchase time, and the item-price sum for non-canceled/non-unavailable orders.

- [ ] **Step 6: Implement official download without hiding authentication failures**

```ts
export async function downloadOlistSource({ dataDir, fetchImpl = fetch }: DownloadOptions): Promise<OlistSourceReceipt> {
  // Request only Kaggle's official dataset download endpoint.
  // On 401/403, throw an error containing the official manual-download URL.
  // Write to a temporary archive, verify non-empty ZIP bytes, then rename.
}
```

Extract only the required seven CSV files. Reject path traversal entries and unexpected duplicate filenames.

- [ ] **Step 7: Run focused GREEN and repository hygiene checks**

Run:

```text
pnpm exec vitest run tests/pilot/importer.test.ts tests/pilot/verifier.test.ts
pnpm exec tsc --noEmit
git status --short
git check-ignore var/olist/source.zip var/olist/olist.sqlite
```

Expected: focused tests and typecheck pass; both local data files are ignored.

- [ ] **Step 8: Commit Task 1**

```text
git add .gitignore package.json pnpm-lock.yaml tsconfig.json server/pilot scripts tests/fixtures/olist tests/pilot
git commit -m "feat: import verified olist data"
```

---

### Task 2: Trusted pilot metric repository

**Files:**
- Modify: `server/pilot/contracts.ts`
- Create: `server/pilot/repository.ts`
- Test: `tests/pilot/repository.test.ts`

**Interfaces:**
- Consumes `openPilotDatabase()` and the imported schema from Task 1.
- Produces `createPilotRepository(db: DatabaseSync): PilotRepository`.
- Produces `PilotStatus`, `PilotFilterOptions`, `PilotFilters`, `PilotSnapshot`, and `PilotCapability`.

- [ ] **Step 1: Write hand-calculated failing repository tests**

```ts
test('calculates only metrics supported by Olist facts', () => {
  const snapshot = repository.getSnapshot({ start: '2018-01-01', end: '2018-01-31' }, replayNow);

  expect(snapshot.kpis.itemGmv.value).toBe(490);
  expect(snapshot.kpis.validOrderCount.value).toBe(4);
  expect(snapshot.kpis.averageOrderValue.value).toBe(122.5);
  expect(snapshot.kpis.cancellationRate.value).toBe(1 / 6);
  expect(snapshot.kpis.onTimeDeliveryRate.value).toBe(2 / 3);
  expect(snapshot.kpis.averageDeliveryDays.value).toBe(6);
  expect(snapshot.kpis.averageReviewScore.value).toBe(4);
  expect(Object.keys(snapshot.kpis)).not.toContain('grossMarginRate');
});

test('uses one cohort for the fulfillment funnel', () => {
  expect(repository.getSnapshot(filters, replayNow).fulfillmentFunnel).toEqual([
    { stage: 'purchased', value: 8 },
    { stage: 'approved', value: 7 },
    { stage: 'carrier', value: 5 },
    { stage: 'delivered', value: 4 },
  ]);
});

test('applies category seller and customer-state filters to every module', () => {
  const snapshot = repository.getSnapshot({ ...filters, category: 'books', sellerId: 'seller-1', customerState: 'SP' }, replayNow);
  expect(snapshot.recentOrders.every((order) => order.customerState === 'SP')).toBe(true);
  expect(snapshot.categoryRanking.map((row) => row.category)).toEqual(['books']);
  expect(snapshot.sellerRanking.map((row) => row.sellerId)).toEqual(['seller-1']);
});
```

- [ ] **Step 2: Run focused RED**

Run: `pnpm exec vitest run tests/pilot/repository.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Define the exact public snapshot contract**

```ts
export type PilotFilters = {
  start: string;
  end: string;
  category?: string;
  sellerId?: string;
  customerState?: string;
};

export type PilotKpi = { value: number; comparisonValue: number; changeRate: number };

export type PilotSnapshot = {
  filters: PilotFilters;
  sourceLocalNow: string;
  comparisonLabel: string;
  kpis: {
    itemGmv: PilotKpi;
    validOrderCount: PilotKpi;
    averageOrderValue: PilotKpi;
    cancellationRate: PilotKpi;
    onTimeDeliveryRate: PilotKpi;
    averageDeliveryDays: PilotKpi;
    averageReviewScore: PilotKpi;
  };
  dailyTrend: Array<{ date: string; itemGmv: number; validOrderCount: number }>;
  fulfillmentFunnel: Array<{ stage: 'purchased' | 'approved' | 'carrier' | 'delivered'; value: number }>;
  categoryRanking: Array<{ category: string; itemGmv: number }>;
  sellerRanking: Array<{ sellerId: string; itemGmv: number }>;
  customerStateRanking: Array<{ customerState: string; itemGmv: number }>;
  recentOrders: Array<{ orderId: string; purchasedAt: string; status: string; itemGmv: number; itemCount: number; customerState: string }>;
  capabilities: PilotCapability[];
};
```

- [ ] **Step 4: Implement parameterized aggregate queries**

Use a shared filtered-order CTE for every KPI, trend, funnel, ranking, and recent-order query. Category filtering must first select matching items and then include only their item price in item GMV; order-level rates remain based on distinct matching orders. End dates are normalized to `23:59:59` and capped by replay time.

Comparison period uses the immediately preceding equal-length calendar interval. Zero denominators return zero, never `NaN` or infinity.

- [ ] **Step 5: Run focused GREEN and typecheck**

Run:

```text
pnpm exec vitest run tests/pilot/repository.test.ts
pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit Task 2**

```text
git add server/pilot/contracts.ts server/pilot/repository.ts tests/pilot/repository.test.ts
git commit -m "feat: calculate trusted olist metrics"
```

---

### Task 3: Persistent replay controller and Pilot API

**Files:**
- Modify: `server/pilot/contracts.ts`
- Create: `server/pilot/replay.ts`
- Create: `server/pilot/schema.ts`
- Create: `server/pilot/route.ts`
- Modify: `server/index.ts`
- Test: `tests/pilot/replay.test.ts`
- Test: `tests/server/pilotRoute.test.ts`

**Interfaces:**
- Consumes `PilotRepository` from Task 2.
- Produces `createReplayController(options): PilotReplayController`.
- Produces `createPilotRouter(options?: PilotRouterOptions): Router`.
- Adds `pilot?: PilotRouterOptions` to `AppOptions` without opening a database during module import.

- [ ] **Step 1: Write failing replay state tests with an injected scheduler**

```ts
test('advances six source-local hours per tick and persists state', () => {
  const replay = createReplayController({ store, scheduler, tickMs: 3000, stepHours: 6, wallNow });
  replay.start();
  scheduler.tick();
  expect(replay.getState().sourceLocalNow).toBe('2017-01-31 06:00:00');
  expect(store.readReplayState()?.sourceLocalNow).toBe('2017-01-31 06:00:00');
});

test('pause prevents later ticks and reset restores the initial point', () => {
  replay.pause();
  scheduler.tick();
  expect(replay.getState().sourceLocalNow).toBe(beforePause);
  expect(replay.reset().sourceLocalNow).toBe(initialReplayTime);
});

test('automatically pauses at the dataset end', () => {
  replay.start();
  scheduler.tickPast(datasetEnd);
  expect(replay.getState()).toMatchObject({ sourceLocalNow: datasetEnd, isRunning: false });
});
```

- [ ] **Step 2: Run replay RED**

Run: `pnpm exec vitest run tests/pilot/replay.test.ts`

Expected: FAIL because `server/pilot/replay` does not exist.

- [ ] **Step 3: Implement replay with no import-time timer**

```ts
export type PilotReplayController = {
  getState(): PilotReplayState;
  start(): PilotReplayState;
  pause(): PilotReplayState;
  reset(): PilotReplayState;
  dispose(): void;
};
```

Create timers only when the controller is constructed by `createApp`, not when modules are imported. Persist each transition. `dispose()` clears the interval for tests and shutdown.

- [ ] **Step 4: Write failing route tests**

```ts
test('reports an actionable not-ready state without breaking simulation APIs', async () => {
  const response = await request(createApp({ pilot: { dataDir: emptyDir } })).get('/api/pilot/status');
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ ready: false, importCommand: 'pnpm data:olist:import' });
});

test('returns a server-computed snapshot and rejects invalid date order', async () => {
  const ok = await request(app).get('/api/pilot/snapshot?start=2018-01-01&end=2018-01-31');
  expect(ok.status).toBe(200);
  expect(ok.body.kpis.itemGmv.value).toBe(490);

  const bad = await request(app).get('/api/pilot/snapshot?start=2018-02-01&end=2018-01-01');
  expect(bad.status).toBe(400);
  expect(bad.body).toEqual({ error: 'INVALID_DATE_RANGE' });
});

test('controls start pause and reset through the server', async () => {
  expect((await request(app).post('/api/pilot/replay').send({ action: 'pause' })).body.isRunning).toBe(false);
  expect((await request(app).post('/api/pilot/replay').send({ action: 'start' })).body.isRunning).toBe(true);
  expect((await request(app).post('/api/pilot/replay').send({ action: 'reset' })).body.sourceLocalNow).toBe(initialReplayTime);
});
```

- [ ] **Step 5: Run route RED**

Run: `pnpm exec vitest run tests/server/pilotRoute.test.ts`

Expected: FAIL because `/api/pilot/*` is not mounted.

- [ ] **Step 6: Implement Zod validation and lazy route dependencies**

Mount `createPilotRouter(options.pilot)` before the generic `/api` JSON 404. Open the manifest/database lazily inside the pilot service factory. Use stable error codes `INVALID_QUERY`, `INVALID_DATE_RANGE`, `PILOT_NOT_READY`, and `PILOT_DATABASE_UNAVAILABLE`.

- [ ] **Step 7: Run focused GREEN and existing server regression**

Run:

```text
pnpm exec vitest run tests/pilot/replay.test.ts tests/server/pilotRoute.test.ts tests/server/analysisRoute.test.ts
pnpm exec tsc --noEmit
```

- [ ] **Step 8: Commit Task 3**

```text
git add server/index.ts server/pilot tests/pilot/replay.test.ts tests/server/pilotRoute.test.ts
git commit -m "feat: serve persistent olist replay"
```

---

### Task 4: Server-owned pilot analysis and evidence validation

**Files:**
- Modify: `server/pilot/contracts.ts`
- Create: `server/pilot/analysisContext.ts`
- Create: `server/pilot/localAnalysis.ts`
- Create: `server/pilot/deepseekAnalysis.ts`
- Modify: `server/pilot/route.ts`
- Test: `tests/server/pilotAnalysis.test.ts`

**Interfaces:**
- Consumes only `{ question, filters }` from the browser.
- Calls `PilotRepository.getSnapshot(filters, replayNow)` inside the server.
- Produces the existing public `AnalysisResult` plus trusted snapshot time in response metadata.

- [ ] **Step 1: Write failing trust-boundary and relevance tests**

```ts
test('ignores browser KPI injection and rebuilds evidence from the repository', async () => {
  const response = await request(app).post('/api/pilot/analysis').send({
    question: '当前成交额表现如何？',
    filters,
    kpis: { itemGmv: { value: 999_999_999 } },
  });
  expect(response.status).toBe(400);
  expect(repository.getSnapshot).toHaveBeenCalledWith(filters, replayNow);
});

test('local fallback answers cancellation and delivery questions differently', async () => {
  const cancellation = await analyzeLocally(context, '为什么取消率较高？');
  const delivery = await analyzeLocally(context, '配送是否存在问题？');
  expect(cancellation.summary).toContain('取消率');
  expect(delivery.summary).toMatch(/准时送达|配送/);
  expect(delivery.summary).not.toBe(cancellation.summary);
});

test('rejects DeepSeek numbers that are absent from the trusted snapshot', async () => {
  const response = await request(appWithDeepSeekValue(123456789)).post('/api/pilot/analysis').send({ question: '表现如何？', filters });
  expect(response.body).toMatchObject({ source: 'local', fallbackReason: 'invalid_response' });
  expect(JSON.stringify(response.body)).not.toContain('123456789');
});
```

- [ ] **Step 2: Run analysis RED**

Run: `pnpm exec vitest run tests/server/pilotAnalysis.test.ts`

Expected: FAIL because pilot analysis modules and route do not exist.

- [ ] **Step 3: Build a bounded trusted context**

```ts
export type PilotAnalysisContext = {
  question?: string;
  sourceLocalNow: string;
  filters: PilotFilters;
  comparisonLabel: string;
  facts: Array<{ id: string; label: string; value: number; unit: 'currency' | 'count' | 'ratio' | 'days' | 'score' }>;
  trendChanges: Array<{ id: string; label: string; value: number; unit: 'currency' | 'count' | 'ratio' }>;
  contributors: Array<{ id: string; dimension: 'category' | 'seller' | 'customerState'; label: string; itemGmv: number }>;
};
```

Limit context JSON to 30 KB using deterministic top-N truncation. Generate the numeric allow-list from `facts`, `trendChanges`, and `contributors`.

- [ ] **Step 4: Implement question-aware local analysis**

Classify normalized questions into `performance`, `cancellation`, `delivery`, `reviews`, `contributors`, or `general`. Each branch must cite the matching facts and return distinct follow-up questions. Label the result as `source: 'local'` and include the actual fallback reason.

- [ ] **Step 5: Implement DeepSeek pilot prompting and numeric guard**

Reuse the current endpoint, timeout, key handling, and `analysisResultSchema`, but build prompt content from `PilotAnalysisContext`. Reject any finite number found in model `signals.value` or `causes.contribution` that is not in the allow-list within a currency rounding tolerance of `0.01` or a ratio tolerance of `0.0001`.

- [ ] **Step 6: Run focused GREEN and existing analysis regression**

Run:

```text
pnpm exec vitest run tests/server/pilotAnalysis.test.ts tests/server/analysisRoute.test.ts tests/server/localAnalysis.test.ts
pnpm exec tsc --noEmit
```

- [ ] **Step 7: Commit Task 4**

```text
git add server/pilot tests/server/pilotAnalysis.test.ts
git commit -m "feat: analyze trusted olist evidence"
```

---

### Task 5: Pilot API client and React state boundary

**Files:**
- Create: `src/pilot/types.ts`
- Create: `src/api/pilotClient.ts`
- Create: `src/api/pilotClient.test.ts`
- Create: `src/app/PilotDashboardProvider.tsx`
- Create: `src/app/usePilotDashboard.ts`
- Test: `tests/app/pilotDashboardFlow.test.tsx`

**Interfaces:**
- Consumes `/api/pilot/status`, `/api/pilot/filter-options`, `/api/pilot/snapshot`, and `/api/pilot/replay`.
- Produces `PilotDashboardContextValue` with status, snapshot, filters, options, loading/error state, replay actions, and manual retry.

- [ ] **Step 1: Write failing runtime-validation client tests**

```ts
test('rejects an invalid nested pilot snapshot', async () => {
  fetchMock.mockResolvedValue(response({ kpis: { itemGmv: { value: '490' } } }));
  await expect(requestPilotSnapshot(filters)).rejects.toThrow('试点数据响应无效');
});

test('sends only filters when requesting a snapshot', async () => {
  await requestPilotSnapshot(filters);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('category=books'), expect.objectContaining({ signal }));
  expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('kpis');
});
```

- [ ] **Step 2: Run client RED**

Run: `pnpm exec vitest run src/api/pilotClient.test.ts`

Expected: FAIL because `pilotClient` does not exist.

- [ ] **Step 3: Implement shared Zod response schemas and abortable client calls**

Provide `requestPilotStatus`, `requestPilotFilterOptions`, `requestPilotSnapshot`, `controlPilotReplay`, and `requestPilotAnalysis`. Dates are strings in the API boundary; parsing for display happens only in view helpers.

- [ ] **Step 4: Write failing Provider behavior tests**

```tsx
test('polls only while pilot mode is mounted and preserves the last snapshot on failure', async () => {
  const { unmount } = render(<PilotDashboardProvider><Probe /></PilotDashboardProvider>);
  await screen.findByText('¥490.00');
  fetchSnapshot.mockRejectedValueOnce(new Error('offline'));
  await advancePilotPoll();
  expect(screen.getByText('¥490.00')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('offline');
  unmount();
  await advancePilotPoll();
  expect(fetchSnapshot).toHaveBeenCalledTimes(2);
});

test('pause is sent to the server and does not fabricate local clock changes', async () => {
  await user.click(screen.getByRole('button', { name: '暂停回放' }));
  expect(controlReplay).toHaveBeenCalledWith('pause', expect.any(AbortSignal));
  expect(screen.getByText('已暂停')).toBeInTheDocument();
});
```

- [ ] **Step 5: Run Provider RED**

Run: `pnpm exec vitest run tests/app/pilotDashboardFlow.test.tsx`

Expected: FAIL because the Provider does not exist.

- [ ] **Step 6: Implement Provider with one poll timer and request cancellation**

Fetch status first. If `ready` is false, do not request options or snapshot. When ready, fetch options and snapshot, poll status/snapshot every 3 seconds, abort replaced/unmounted requests, preserve the previous snapshot on transient errors, and expose retry.

- [ ] **Step 7: Run focused GREEN**

Run:

```text
pnpm exec vitest run src/api/pilotClient.test.ts tests/app/pilotDashboardFlow.test.tsx
pnpm exec tsc --noEmit
```

- [ ] **Step 8: Commit Task 5**

```text
git add src/pilot src/api/pilotClient.ts src/api/pilotClient.test.ts src/app/PilotDashboardProvider.tsx src/app/usePilotDashboard.ts tests/app/pilotDashboardFlow.test.tsx
git commit -m "feat: add olist pilot client state"
```

---

### Task 6: Honest pilot dashboard and source switching

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Create: `src/ui/DataSourceSwitch.tsx`
- Create: `src/features/pilot/PilotApp.tsx`
- Create: `src/features/pilot/PilotHeader.tsx`
- Create: `src/features/pilot/PilotFilters.tsx`
- Create: `src/features/pilot/PilotRealtimeDashboard.tsx`
- Create: `src/features/pilot/PilotSalesChart.tsx`
- Create: `src/features/pilot/PilotAnalysisDashboard.tsx`
- Test: `src/features/pilot/PilotApp.test.tsx`
- Test: `src/features/pilot/PilotRealtimeDashboard.test.tsx`
- Test: `src/features/pilot/PilotAnalysisDashboard.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes `PilotDashboardContextValue` from Task 5.
- Reuses `Panel`, `MetricValue`, `ExecutiveSummary`, `ContributionChart`, `ActionList`, and `AnalysisChat`.
- Does not render `ForecastPanel`, simulation KPI components, or unsupported capability placeholders.

- [ ] **Step 1: Write failing source-switch and not-ready tests**

```tsx
test('switches to the isolated real-data pilot and unmounts simulation runtime', async () => {
  render(<App />);
  await user.click(screen.getByRole('button', { name: '真实数据试点' }));
  expect(screen.getByText('真实匿名历史数据回放')).toBeInTheDocument();
  expect(screen.queryByText('支付转化率')).not.toBeInTheDocument();
  expect(screen.queryByText('毛利率')).not.toBeInTheDocument();
});

test('shows official import guidance when data is not ready', () => {
  renderPilot({ status: { ready: false, importCommand: 'pnpm data:olist:import', sourceUrl } });
  expect(screen.getByRole('link', { name: 'Olist 官方数据集' })).toHaveAttribute('href', sourceUrl);
  expect(screen.getByText('pnpm data:olist:import')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run UI RED**

Run: `pnpm exec vitest run src/App.test.tsx src/features/pilot/PilotApp.test.tsx`

Expected: FAIL because source switching and pilot components do not exist.

- [ ] **Step 3: Implement the pilot header, filters, and tab structure**

The header displays “Olist 真实数据试点”, “真实匿名历史数据回放”, virtual source-local time, running/paused state, CC BY-NC-SA 4.0, and start/pause/reset buttons. Keep accessible `tab`/`tabpanel` bindings for “实时监控” and “智能分析”.

The filter form has explicit labels for start date, end date, category, seller, and customer state. Reject start-after-end before requesting the server and provide a clear-filter action.

- [ ] **Step 4: Write failing metric mapping and independent empty-state tests**

```tsx
test('renders exactly the seven supported KPIs with their source-local cutoff', () => {
  renderRealtime(snapshot);
  expect(screen.getAllByTestId('pilot-kpi')).toHaveLength(7);
  expect(screen.getByText('商品成交额')).toBeInTheDocument();
  expect(screen.getByText('准时送达率')).toBeInTheDocument();
  expect(screen.queryByText('库存风险')).not.toBeInTheDocument();
});

test('keeps each ranking independently available when another ranking is empty', () => {
  renderRealtime({ ...snapshot, categoryRanking: [], sellerRanking: [{ sellerId: 'seller-1', itemGmv: 490 }] });
  expect(within(screen.getByRole('region', { name: '类目排行' })).getByText('暂无类目数据')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: '卖家排行' })).getByText('seller-1')).toBeInTheDocument();
});
```

- [ ] **Step 5: Implement the restrained pilot dashboard**

Render seven KPI cards, daily item-GMV/order-count chart, fulfillment funnel, category/seller/state rankings, recent orders, data capability explanation, error retry, and clear-filter actions. Keep the existing light visual tokens; add no new decoration or animation beyond replay status.

- [ ] **Step 6: Write failing pilot analysis UI tests**

```tsx
test('submits only question and filters and marks old analysis stale after replay advances', async () => {
  renderAnalysis({ snapshot, active: true });
  await user.type(screen.getByLabelText('经营问题'), '配送是否存在问题？');
  await user.click(screen.getByRole('button', { name: '提问' }));
  expect(requestAnalysis).toHaveBeenCalledWith({ question: '配送是否存在问题？', filters: snapshot.filters }, expect.any(AbortSignal));
  rerenderWithSnapshot({ ...snapshot, sourceLocalNow: '2018-02-01 06:00:00' });
  expect(screen.getByText('数据已变化，重新分析')).toBeInTheDocument();
});
```

- [ ] **Step 7: Implement pilot analysis without a forecast panel**

Reuse summary, contribution, action, and chat components. Show response source, trusted snapshot time, stale state, abort behavior, error retry, and the last three questions. Do not render forecast or target probability.

- [ ] **Step 8: Run focused GREEN and simulation regression**

Run:

```text
pnpm exec vitest run src/App.test.tsx src/features/pilot/PilotApp.test.tsx src/features/pilot/PilotRealtimeDashboard.test.tsx src/features/pilot/PilotAnalysisDashboard.test.tsx tests/app/dashboardFlow.test.tsx
pnpm exec tsc --noEmit
```

- [ ] **Step 9: Commit Task 6**

```text
git add src/App.tsx src/App.test.tsx src/ui/DataSourceSwitch.tsx src/features/pilot src/styles/global.css
git commit -m "feat: present honest olist pilot dashboard"
```

---

### Task 7: Full-data reconciliation, browser acceptance, and handoff

**Files:**
- Modify: `README.md`
- Create: `docs/olist-pilot.md`
- Create: `e2e/pilot.spec.ts`
- Modify: `playwright.config.ts` only if the existing config cannot select the pilot test without affecting screenshots

**Interfaces:**
- Consumes the completed `/api/pilot/*` and pilot UI.
- Produces reproducible user commands and final verification evidence.

- [ ] **Step 1: Write the failing Playwright pilot flow**

```ts
test('replays trusted Olist history and pauses without changing the snapshot', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '真实数据试点' }).click();
  await expect(page.getByText('真实匿名历史数据回放')).toBeVisible();
  const before = await page.getByTestId('pilot-item-gmv').textContent();
  await expect.poll(async () => page.getByTestId('pilot-item-gmv').textContent()).not.toBe(before);
  await page.getByRole('button', { name: '暂停回放' }).click();
  const paused = await page.getByTestId('pilot-item-gmv').textContent();
  await page.waitForTimeout(3500);
  expect(await page.getByTestId('pilot-item-gmv').textContent()).toBe(paused);
});

test('answers two different questions with matching trusted evidence', async ({ page }) => {
  await ask(page, '为什么取消率较高？');
  await expect(page.getByTestId('analysis-summary')).toContainText('取消率');
  await ask(page, '配送是否存在问题？');
  await expect(page.getByTestId('analysis-summary')).toContainText(/准时送达|配送/);
});
```

- [ ] **Step 2: Run Playwright RED against fixture-backed pilot startup**

Run: `pnpm exec playwright test e2e/pilot.spec.ts --reporter=line`

Expected: at least one assertion fails until the fixture-backed startup and selectors are fully wired.

- [ ] **Step 3: Document exact non-commercial setup and attribution**

README and `docs/olist-pilot.md` must include:

```text
pnpm data:olist:download
pnpm data:olist:import
pnpm data:olist:verify
pnpm dev
```

Explain manual Kaggle download fallback, `var/olist` location, source-local time, replay controls, unsupported metrics, DeepSeek optional behavior, CC BY-NC-SA attribution, and why this is not an enterprise production connection.

- [ ] **Step 4: Import and verify the official dataset**

Run the official download. If Kaggle returns 401/403, do not use a mirror; report the exact manual download requirement and complete automated verification with the committed fixture. If the official archive downloads, run:

```text
pnpm data:olist:import
pnpm data:olist:verify
```

Expected: `valid: true`, zero duplicate primary keys, zero orphan references, imported counts equal source rows, and repeated import preserves counts and item GMV.

- [ ] **Step 5: Run the final quality gates sequentially**

Run each command after the previous command exits:

```text
pnpm test
pnpm exec tsc --noEmit
pnpm build
pnpm e2e
git diff --check
git status --short
```

Expected: all commands exit zero; no relevant browser console errors; only documented pre-existing bundle-size guidance is acceptable.

- [ ] **Step 6: Verify repository hygiene**

Run:

```text
git ls-files var .env .env.local
git grep -n -I -E "DEEPSEEK_API_KEY=|sk-[A-Za-z0-9_-]{10,}"
git status --short
```

Expected: no local data or env files tracked; no secret-like values; only intentional documentation and test placeholders may match variable names without values.

- [ ] **Step 7: Commit Task 7**

```text
git add README.md docs/olist-pilot.md e2e/pilot.spec.ts playwright.config.ts
git commit -m "test: verify olist replay pilot"
```

## Plan Self-Review Record

- Spec coverage: Tasks 1–7 cover provenance, import, reconciliation, trusted metrics, replay, API, trusted analysis, UI capability honesty, browser verification, licensing, and repository hygiene.
- Scope: Olist-specific contracts remain isolated; no generic metric platform or production authentication is introduced.
- Type consistency: `PilotFilters`, `PilotSnapshot`, `PilotRepository`, `PilotReplayController`, and `PilotAnalysisContext` have one defining task and named consumers.
- Unsupported data: No task maps inventory, margin, traffic, advertising, refunds, target, or forecast into pilot output.
- Resource control: Routine implementation and focused tests can use Terra; Sol is reserved for metric/analysis review and final completion review. Luna is not an available model in this environment.
