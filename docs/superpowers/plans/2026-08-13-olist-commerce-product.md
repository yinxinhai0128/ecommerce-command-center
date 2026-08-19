# Olist Commerce Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a management-facing e-commerce operating product backed by the complete Olist dataset, then present those verified capabilities in an attributed CoreUI shell.

**Architecture:** SQLite importer and repository remain the only data and metric source. The API returns one validated snapshot for pages and analysis. CoreUI components provide layout only; business content is produced solely from repository contracts.

**Tech Stack:** React 19, TypeScript, Vite 8, Express 5, node:sqlite, Zod, ECharts, CoreUI React 5, Vitest, Playwright.

## Global Constraints

- All visible text and documentation are Simplified Chinese.
- Directly copy code only from the CoreUI MIT source at commit `1c09f27ef436a1e358be5d10daf3b1f27f2e20a6`; retain complete attribution internally.
- Treat Apache Superset/Cube as behavioural and semantic references, not vendored runtime code.
- Adapt only verified, order-level-safe query logic from `seajoyer/olist-ecommerce-analytics` at `af09e7e6aa5753ce75887882d7749ef5c3a8f48b`; payment and item aggregates must be computed separately before joining.
- The Olist raw archive and imported SQLite database remain ignored by Git.
- Do not invent inventory, margin, advertising, traffic, refunds, targets, or forecasts.
- Every snapshot field applies the same date range, optional category, seller and customer-state filters, and replay-time cutoff.
- Each task follows RED -> minimal GREEN -> scoped tests -> TypeScript check -> diff check -> commit and report. No command may run over 90 seconds.
- This plan supersedes `2026-08-13-coreui-dashboard-refactor.md`; do not implement its Task 1 in isolation.

---

### Task 1: Complete the Olist import and verification contract

**Files:**
- Modify: `server/pilot/source.ts`, `server/pilot/database.ts`, `server/pilot/importer.ts`, `server/pilot/verifier.ts`, `server/pilot/contracts.ts`
- Modify: `tests/pilot/importer.test.ts`, `tests/pilot/verifier.test.ts`

**Produces:** SQLite `payments` and `geolocations` tables; manifest and verification results covering all nine source files.

- [ ] **Step 1: Add failing importer and verifier cases**

Create a CSV fixture with two payments for one order and two geolocation rows sharing a zip prefix. Assert `importOlistDataset()` imports both payment rows, keeps both geolocation rows, and records the two CSV hashes in the manifest. Add verifier cases for duplicate `(order_id, payment_sequential)` and a payment whose order ID is absent; both must make `valid` false.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/pilot/importer.test.ts tests/pilot/verifier.test.ts`

Expected: FAIL because payments/geolocations are not accepted source files or verified tables.

- [ ] **Step 3: Implement the smallest transactional schema extension**

Add `payments(order_id, payment_sequential, payment_type, payment_installments, payment_value, PRIMARY KEY(order_id, payment_sequential))` with `order_id` foreign key. Add `geolocations(zip_code_prefix, latitude, longitude, city, state)` without an artificial zip primary key. Require and hash `olist_order_payments_dataset.csv` and `olist_geolocation_dataset.csv`; parse their official headers into those tables inside the existing transaction. Extend verification with table rows, payment composite-key/foreign-key checks and the existing hash/range contract.

- [ ] **Step 4: Run GREEN and commit**

Run:

```text
pnpm exec vitest run tests/pilot/importer.test.ts tests/pilot/verifier.test.ts
pnpm exec tsc --noEmit
git diff --check
```

Commit: `feat: import complete olist source dataset`

### Task 2: Add one Olist semantic metrics contract

**Files:**
- Modify: `server/pilot/contracts.ts`, `server/pilot/repository.ts`, `tests/pilot/repository.test.ts`
- Create: `server/pilot/metricDefinitions.ts`, `server/pilot/metricDefinitions.test.ts`

**Produces:** A single `PilotSnapshot` with payment, customer, fulfillment, experience and contribution sections.

- [ ] **Step 1: Write hand-calculated repository failures**

Use a fixture with repeated `customer_unique_id`, credit-card and voucher payments, delivered/canceled/late orders and reviews 1 through 5. Assert: payment amount differs from item GMV; payment types sum to payment amount; repeat buyers count once by unique customer; fulfillment durations use only timestamps available before replay; low-score rate is reviews 1–2 divided by reviewed orders; and seller/category/customer-state rankings obey all filters.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/pilot/repository.test.ts server/pilot/metricDefinitions.test.ts`

Expected: FAIL because the snapshot does not expose these real sections.

- [ ] **Step 3: Centralize metric definitions and query them only in the repository**

Define named metrics and supported dimensions in `metricDefinitions.ts`. Extend the filtered-order CTE once, then compute: payment amount/type/installment mix; unique/repeat buyer counts; order status distribution; approval/carrier/delivery durations; late delivery rate/days; review score distribution/low-score rate/reply duration; translated category, seller and customer geography rankings; and recent order trace fields. Use purchase time plus replay cutoff consistently. Do not add metrics unavailable in Olist.

- [ ] **Step 4: Run GREEN and commit**

Run:

```text
pnpm exec vitest run tests/pilot/repository.test.ts server/pilot/metricDefinitions.test.ts
pnpm exec tsc --noEmit
git diff --check
```

Commit: `feat: add olist commerce semantic metrics`

### Task 3: Extend trusted Olist API and analysis from the semantic snapshot

**Files:**
- Modify: `server/pilot/route.ts`, `server/pilot/analysisContext.ts`, `server/pilot/localAnalysis.ts`, `server/pilot/deepseekAnalysis.ts`, `src/pilot/types.ts`
- Modify: `tests/server/pilotRoute.test.ts`, `tests/server/pilotAnalysis.test.ts`

**Consumes:** Task 2 `PilotSnapshot` sections.

- [ ] **Step 1: Add failing API and analysis scenarios**

Assert the API validates every expanded snapshot field. Ask separate questions about payment composition, repeat buyers, delivery delays and low reviews. Assert every response cites the same `sourceLocalNow`, uses only matching metric labels and changes its conclusion when the relevant fixture facts change. Reject model output with values not bound to allowed evidence.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/server/pilotRoute.test.ts tests/server/pilotAnalysis.test.ts`

- [ ] **Step 3: Add only fact-bound analysis branches**

Build analysis context from the repository snapshot sections. Expand local and DeepSeek allow-list evidence to payments, customers, fulfillment and reviews; retain timeout, abort and local fallback rules. Keep the existing request boundary and never recompute metrics in the model provider.

- [ ] **Step 4: Run GREEN and commit**

Run:

```text
pnpm exec vitest run tests/server/pilotRoute.test.ts tests/server/pilotAnalysis.test.ts
pnpm exec tsc --noEmit
git diff --check
```

Commit: `feat: analyze olist operating drivers from evidence`

### Task 4: Vendor the permitted CoreUI product shell

**Files:**
- Create: `src/coreui/AppShell.tsx`, `src/coreui/AppSidebar.tsx`, `src/coreui/AppTopbar.tsx`, `src/coreui/navigation.ts`, `src/coreui/AppShell.test.tsx`, `THIRD_PARTY_NOTICES.md`
- Modify: `package.json`, `pnpm-lock.yaml`, `src/styles/global.css`, `README.md`

**Produces:** `AppShell({ activeView, onViewChange, children })` with accessible fixed navigation: overview, realtime, analysis, operating-data.

- [ ] **Step 1: Write failing navigation and mobile shell tests**

Assert four named navigation buttons, `aria-current="page"` on the active button, keyboard activation, and a collapse button with an accessible name. The tests must not assert visible license or demo copy.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run src/coreui/AppShell.test.tsx`

- [ ] **Step 3: Copy and adapt only the allowed upstream shell source**

Copy/adapt patterns from upstream `src/layout/DefaultLayout.jsx`, `src/components/AppSidebar.jsx`, and `src/components/AppHeader.jsx` at the fixed CoreUI commit. Add only the CoreUI/Bootstrap dependencies required by those shell primitives. Add full MIT text, copyright, upstream URL, fixed commit, copied paths and local modifications to `THIRD_PARTY_NOTICES.md`; link it from README only.

- [ ] **Step 4: Run GREEN and commit**

Run:

```text
pnpm exec vitest run src/coreui/AppShell.test.tsx
pnpm exec tsc --noEmit
git diff --check
```

Commit: `feat: add attributed coreui product shell`

### Task 5: Compose management views with exclusive providers

**Files:**
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/app/PilotDashboardProvider.tsx`
- Create: `src/features/overview/OverviewPage.tsx`, `src/features/overview/OverviewPage.test.tsx`, `src/features/operations/OperationsPage.tsx`, `src/features/operations/OperationsPage.test.tsx`
- Modify: `src/features/pilot/PilotApp.tsx`, `src/features/pilot/PilotApp.test.tsx`

**Produces:** lazy route-level view modules and one mounted data provider at a time.

- [ ] **Step 1: Write lifecycle and supported-content failures**

Assert changing workspace unmounts the prior provider and stops its interval. Assert the operating-data page renders payment, customer, fulfillment, experience and contribution modules only when present in `PilotSnapshot`; it never renders unsupported inventory, margin, advertising, traffic, refund, target or forecast cards. Assert error states expose a retry control.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run src/App.test.tsx src/features/overview/OverviewPage.test.tsx src/features/operations/OperationsPage.test.tsx src/features/pilot/PilotApp.test.tsx`

- [ ] **Step 3: Integrate CoreUI layout without changing data ownership**

Place a single selected lazy view below `AppShell`. Overview uses top-level verified KPI/health facts. Realtime and analysis retain their existing functionality. Operating-data mounts the pilot provider and exposes real Olist modules. Standardize loading, empty, error/retry, source time and replay controls; use compact charts/cards and tables backed by snapshot fields. Keep source and license metadata out of product-page copy.

- [ ] **Step 4: Run GREEN and commit**

Run:

```text
pnpm exec vitest run src/App.test.tsx src/features/overview/OverviewPage.test.tsx src/features/operations/OperationsPage.test.tsx src/features/pilot/PilotApp.test.tsx tests/app/pilotDashboardFlow.test.tsx
pnpm exec tsc --noEmit
git diff --check
```

Commit: `feat: present evidence-backed commerce management views`

### Task 6: Browser acceptance, internal provenance and scorecard

**Files:**
- Create: `e2e/commerce-product.spec.ts`, `docs/commerce-product-scorecard.md`
- Modify: `README.md`, `docs/olist-pilot.md`, `playwright.config.ts` only if isolation requires it

- [ ] **Step 1: Create browser assertions first**

At desktop and mobile sizes, assert accessible sidebar navigation, no horizontal overflow, working date/filter/retry/replay controls, stable pause snapshots, and distinct evidence-backed answers for payment, delivery and review questions. Assert page content does not display `Demo`, `模拟数据`, `试点`, or license copy.

- [ ] **Step 2: Run RED**

Run: `pnpm exec playwright test e2e/commerce-product.spec.ts --reporter=line`

- [ ] **Step 3: Add the minimum responsive/accessibility fixes and internal documentation**

Fix only behaviors the tests expose. Record Olist data source/license, CoreUI attribution, source-copy boundaries, score rubric, evidence, total score and remaining non-production risks in internal docs. Ensure raw data, SQLite databases and keys remain ignored.

- [ ] **Step 4: Run final gates and commit**

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

Commit: `test: verify commerce product experience`
