import { z } from 'zod';
import type { AnalysisRequest, AnalysisResult, FollowUpQuestion } from '../../src/domain/types';

const text = z.string().trim().min(1).max(1_000);
const finiteNumber = z.number().finite();
const kpiSchema = z.object({
  value: finiteNumber,
  comparisonValue: finiteNumber,
  changeRate: finiteNumber,
}).strict();
const signalSchema = z.object({
  label: text,
  value: finiteNumber,
  direction: z.enum(['up', 'down', 'flat']),
}).strict();
const causeSchema = z.object({ label: text, contribution: finiteNumber, evidence: text }).strict();
const riskSchema = z.object({ severity: z.enum(['critical', 'warning']), title: text, evidence: text }).strict();
const actionSchema = z.object({
  priority: z.enum(['high', 'medium', 'low']),
  title: text,
  rationale: text,
  ownerRole: text,
  expectedImpact: text,
  validationMetric: text,
}).strict();
const followUpSchema = text.regex(/[？?]$/, '后续问题必须以问号结尾').transform((value) => value as FollowUpQuestion);

export const analysisRequestSchema = z.object({
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
  signals: z.array(signalSchema).min(1).max(12),
  causes: z.array(causeSchema).max(12),
  risks: z.array(riskSchema).max(12),
  actions: z.array(actionSchema).min(1).max(12),
  followUps: z.array(followUpSchema).min(1).max(12),
}).strict();

export const analysisResultSchema = modelAnalysisSchema.extend({
  source: z.enum(['deepseek', 'local']),
  generatedAt: z.string().datetime({ offset: true }),
  fallbackReason: z.enum(['not_configured', 'upstream_error', 'timeout', 'invalid_response', 'network_error']).optional(),
}).strict();

export type RequestAnalysisContext = z.infer<typeof analysisRequestSchema>;
export type ModelAnalysis = z.infer<typeof modelAnalysisSchema>;

const _requestContract: AnalysisRequest = {} as RequestAnalysisContext;
const _schemaContract: RequestAnalysisContext = {} as AnalysisRequest;
const _resultContract: AnalysisResult = {} as z.infer<typeof analysisResultSchema>;
void _requestContract;
void _schemaContract;
void _resultContract;
