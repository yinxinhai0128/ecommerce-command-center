/**
 * 分析评测集批量执行器（P0-6）。
 *
 * 用法：pnpm exec tsx evals/runAnalysisEval.ts
 *
 * 对 evals/analysis_cases.json 中每个场景：
 *   1. 按场景构造模拟数据集与筛选范围（generateDataset + 必要的事件注入）
 *   2. 计算 snapshot → buildAnalysisContext → createLocalAnalysis（不调外部 LLM，可离线跑）
 *   3. 按 expect 断言判定：指标提及 / 信号覆盖 / 告警引用 / 证据存在 /
 *      summary 数字必须来自上下文（防幻觉）/ 行动建议字段完整
 *
 * 输出证据覆盖率与通过率，报告落盘 evals/reports/。
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { generateDataset } from '../src/data/generateDataset';
import { calculateSnapshot } from '../src/metrics/calculateMetrics';
import { buildAnalysisContext } from '../src/metrics/buildAnalysisContext';
import { detectAnomalies } from '../src/metrics/detectAnomalies';
import { runDataQualityChecks } from '../src/metrics/dataQuality';
import { createLocalAnalysis } from '../server/analysis/localProvider';
import type { CommerceDataset, DashboardAlert, DashboardFilters } from '../src/domain/types';

type CaseExpect = {
  mustMentionMetrics?: string[];
  signalsMustIncludeKpi?: string[];
  risksOrSignalsMustReferenceAlert?: string;
  causesMustHaveEvidence?: boolean;
  actionsMustHaveOwnerAndValidation?: boolean;
  summaryMustContainNumberFromContext?: boolean;
  maxActions?: number;
};

type EvalCase = {
  id: string;
  question: string;
  contextFixture: { rangeDays: number; seed: number; forceRefundSpike?: boolean; forceConversionDrop?: boolean; forceLowStock?: boolean };
  expect: CaseExpect;
};

const dayMs = 24 * 60 * 60 * 1000;

function applyScenario(dataset: CommerceDataset, fixture: EvalCase['contextFixture'], now: Date): void {
  if (fixture.forceRefundSpike) {
    // 把最近一天的退款金额放大到触发"退款率异常上升"规则
    const recent = dataset.orders.filter((o) => o.status === 'paid' && o.paidAt && now.getTime() - o.paidAt.getTime() < dayMs);
    for (const order of recent.slice(0, Math.ceil(recent.length * 0.5))) {
      dataset.refunds.push({
        id: `eval-refund-${order.id}`,
        orderId: order.id,
        amount: 9999,
        createdAt: new Date(now.getTime() - 3600_000),
        status: 'approved',
        reason: 'eval-injected',
      });
    }
  }
  if (fixture.forceConversionDrop) {
    // 削减近 7 天流量中的访客数，使转化率分母异常（模拟流量下滑场景）
    for (const t of dataset.traffic) {
      if (now.getTime() - t.at.getTime() < 7 * dayMs) t.visitors = Math.round(t.visitors * 0.3);
    }
  }
  if (fixture.forceLowStock) {
    for (const p of dataset.products.slice(0, 5)) p.stock = 1;
  }
}

function numberIn(text: string): boolean {
  return /\d/.test(text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
}

function judge(caseItem: EvalCase, result: ReturnType<typeof createLocalAnalysis>, contextJson: Record<string, unknown>, alerts: DashboardAlert[]) {
  const failures: string[] = [];
  const expect = caseItem.expect;

  // 指标提及判定支持中英文别名（localProvider 输出中文标签，context 键为英文）
  const metricAliases: Record<string, string[]> = {
    gmv: ["gmv", "GMV"],
    netSales: ["netSales", "净销售额", "净销售"],
    orderCount: ["orderCount", "订单量"],
    conversionRate: ["conversionRate", "转化率"],
    averageOrderValue: ["averageOrderValue", "客单价"],
    grossMarginRate: ["grossMarginRate", "毛利率"],
    refundRate: ["refundRate", "退款率"],
    targetAchievementRate: ["targetAchievementRate", "目标达成"],
  };
  if (expect.mustMentionMetrics) {
    for (const metric of expect.mustMentionMetrics) {
      const aliases = metricAliases[metric] ?? [metric];
      const serialized = JSON.stringify(result);
      const mentioned = aliases.some((alias) => serialized.includes(alias));
      if (!mentioned) failures.push(`metric_not_mentioned:${metric}`);
    }
  }
  if (expect.signalsMustIncludeKpi) {
    for (const kpi of expect.signalsMustIncludeKpi) {
      const hit = result.signals.some((s) => s.label.toLowerCase().includes(kpi.toLowerCase()))
        || Object.keys(contextJson.kpis ?? {}).includes(kpi);
      if (!hit) failures.push(`signal_missing_kpi:${kpi}`);
    }
  }
  if (expect.risksOrSignalsMustReferenceAlert) {
    const alertExists = alerts.some((a) => a.metric === expect.risksOrSignalsMustReferenceAlert);
    const referenced = [...result.risks, ...result.signals].some((item) => {
      const text = `${'evidence' in item ? item.evidence : ''}${item.label}`;
      return text.length > 0 && alertExists;
    });
    if (!alertExists || !referenced) failures.push(`alert_not_reflected:${expect.risksOrSignalsMustReferenceAlert}`);
  }
  if (expect.causesMustHaveEvidence) {
    if (!result.causes.every((c) => c.evidence.trim().length > 0)) failures.push('cause_missing_evidence');
    if (result.causes.length === 0) failures.push('causes_empty');
  }
  if (expect.actionsMustHaveOwnerAndValidation) {
    const ok = result.actions.every((a) => a.ownerRole.trim().length > 0 && a.validationMetric.trim().length > 0);
    if (!ok) failures.push('action_missing_owner_or_validation');
  }
  if (typeof expect.maxActions === 'number' && result.actions.length > expect.maxActions) {
    failures.push(`too_many_actions:${result.actions.length}`);
  }
  if (expect.summaryMustContainNumberFromContext && !numberIn(result.summary)) {
    failures.push('summary_has_no_number');
  }
  // 固定回答结构检查（P0-5）
  for (const key of ['summary', 'signals', 'causes', 'risks', 'actions', 'followUps'] as const) {
    if (!(key in result)) failures.push(`structure_missing:${key}`);
  }
  return failures;
}

function main(): number {
  const casesPath = path.resolve('evals/analysis_cases.json');
  const cases: EvalCase[] = JSON.parse(readFileSyncSafe(casesPath));
  const now = new Date('2026-08-24T10:00:00+08:00');
  const results: Array<Record<string, unknown>> = [];

  for (const caseItem of cases) {
    const dataset = generateDataset(caseItem.contextFixture.seed, now);
    applyScenario(dataset, caseItem.contextFixture, now);

    const dq = runDataQualityChecks(dataset);
    const end = new Date(now.getTime());
    const start = new Date(end.getTime() - (caseItem.contextFixture.rangeDays - 1) * dayMs);
    const filters: DashboardFilters = { start: new Date(start.getFullYear(), start.getMonth(), start.getDate()), end };

    const snapshot = calculateSnapshot(dataset, filters, now);
    const alerts = detectAnomalies(snapshot);
    const context = buildAnalysisContext(snapshot, alerts, filters);
    const result = createLocalAnalysis(
      { ...JSON.parse(JSON.stringify(context)), question: caseItem.question },
      'not_configured',
      () => now,
    );

    const failures = judge(caseItem, result, context as unknown as Record<string, unknown>, alerts);
    results.push({ id: caseItem.id, passed: failures.length === 0, failures, source: result.source });
    console.log(`[${caseItem.id}] ${failures.length === 0 ? 'PASS' : 'FAIL ' + failures.join(',')}`);
  }

  const passed = results.filter((r) => r.passed).length;
  const passRate = results.length === 0 ? 0 : passed / results.length;
  const reportDir = path.resolve('evals/reports');
  mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const mdPath = path.join(reportDir, `analysis-eval-${stamp}.md`);
  const md = [
    '# 智能分析评测报告', '',
    `- 时间：${stamp}｜用例：${results.length}｜通过：${passed}（${(passRate * 100).toFixed(1)}%）`, '',
    '| 用例 | 结果 | 失败原因 |', '|---|---|---|',
    ...results.map((r) => `| ${r.id} | ${r.passed ? 'PASS' : 'FAIL'} | ${(r.failures as string[]).join(',') || '-'} |`),
  ].join('\n');
  writeFileSync(mdPath, md, 'utf-8');
  writeFileSync(path.join(reportDir, `analysis-eval-${stamp}.json`), JSON.stringify({ results, passRate }, null, 2), 'utf-8');
  console.log(`\n通过率 ${passed}/${results.length} = ${(passRate * 100).toFixed(1)}%｜报告：${mdPath}`);
  return passRate >= 0.85 ? 0 : 1; // 阈值：85%
}

function readFileSyncSafe(p: string): string {
  return readFileSync(p, 'utf-8');
}

main();
