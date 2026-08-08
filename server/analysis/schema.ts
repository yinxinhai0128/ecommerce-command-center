import { z } from 'zod';
import type { AnalysisContext, AnalysisResult } from '../../src/domain/types';

const text = z.string().trim().min(1).max(1_000);
const finiteNumber = z.number().finite();
const kpiSchema = z.object({
  value: finiteNumber,
  comparisonValue: finiteNumber,
  changeRate: finiteNumber,
}).strict();
const insightSchema = z.object({ title: text, evidence: text }).strict();
const actionSchema = z.object({ title: text, rationale: text }).strict();

export const analysisContextSchema = z.object({
  range: z.object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    platform: z.enum(['天猫', '京东', '抖音电商', '自营小程序']).optional(),
    storeId: z.string().trim().min(1).max(200).optional(),
    categoryId: z.string().trim().min(1).max(200).optional(),
  }).strict(),
  comparisonLabel: z.string().trim().min(1).max(200),
  kpis: z.object({
    gmv: kpiSchema,
    netSales: kpiSchema,
    orderCount: kpiSchema,
    conversionRate: kpiSchema,
    averageOrderValue: kpiSchema,
    grossMarginRate: kpiSchema,
    refundRate: kpiSchema,
    targetAchievementRate: kpiSchema,
  }).strict(),
  topContributors: z.object({
    channels: z.array(z.object({ label: text, value: finiteNumber }).strict()).max(50),
    products: z.array(z.object({ label: text, value: finiteNumber }).strict()).max(50),
    regions: z.array(z.object({ label: text, value: finiteNumber }).strict()).max(50),
  }).strict(),
  alerts: z.array(z.object({
    severity: z.enum(['critical', 'warning']),
    metric: z.enum(['refundRate', 'conversionRate', 'targetAchievementRate', 'inventoryDays']),
    title: text,
    evidence: text,
    impactAmount: finiteNumber,
    suggestion: text,
  }).strict()).max(50),
  forecast7d: z.array(z.object({
    date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    gmv: finiteNumber,
  }).strict()).min(1).max(7),
  targetProbability: finiteNumber.min(0).max(1),
  question: z.string().trim().min(1).max(500).optional(),
}).strict();

export const modelAnalysisSchema = z.object({
  summary: text,
  signals: z.array(insightSchema).min(1).max(12),
  causes: z.array(insightSchema).max(12),
  risks: z.array(insightSchema).max(12),
  actions: z.array(actionSchema).min(1).max(12),
  followUps: z.array(text).min(1).max(12),
}).strict();

export const analysisResultSchema = modelAnalysisSchema.extend({
  source: z.enum(['deepseek', 'local']),
  generatedAt: z.string().datetime({ offset: true }),
  fallbackReason: z.enum(['not_configured', 'upstream_error', 'timeout', 'invalid_response', 'network_error']).optional(),
}).strict();

export type RequestAnalysisContext = z.infer<typeof analysisContextSchema>;
export type ModelAnalysis = z.infer<typeof modelAnalysisSchema>;

const _contextContract: AnalysisContext = {} as RequestAnalysisContext;
const _resultContract: AnalysisResult = {} as z.infer<typeof analysisResultSchema>;
void _contextContract;
void _resultContract;
