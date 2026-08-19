import { z } from 'zod';
import type { FollowUpQuestion } from '../../src/domain/types';
import type { PilotAnalysisResult } from './contracts';

const text = z.string().trim().min(1).max(1_000);
const finiteNumber = z.number().finite();
const unit = z.enum(['currency', 'count', 'ratio', 'days', 'score']);
const signal = z.object({
  factId: text,
  label: text,
  unit,
  value: finiteNumber,
  direction: z.enum(['up', 'down', 'flat']),
}).strict();
const cause = z.object({
  factId: text,
  label: text,
  unit,
  contribution: finiteNumber,
  evidence: text,
}).strict();
const followUp = text.regex(/[？?]$/, '后续问题必须以问号结尾').transform((value) => value as FollowUpQuestion);

export const pilotModelAnalysisSchema = z.object({
  summary: text,
  signals: z.array(signal).min(1).max(12),
  causes: z.array(cause).max(12),
  risks: z.array(z.object({ severity: z.enum(['critical', 'warning']), title: text, evidence: text }).strict()).max(12),
  actions: z.array(z.object({
    priority: z.enum(['high', 'medium', 'low']),
    title: text,
    rationale: text,
    ownerRole: text,
    expectedImpact: text,
    validationMetric: text,
  }).strict()).min(1).max(12),
  followUps: z.array(followUp).min(1).max(12),
}).strict();

export const pilotAnalysisResultSchema = pilotModelAnalysisSchema.extend({
  source: z.enum(['deepseek', 'local']),
  generatedAt: z.string().datetime({ offset: true }),
  fallbackReason: z.enum(['not_configured', 'upstream_error', 'timeout', 'invalid_response', 'network_error']).optional(),
}).strict();

const _resultContract: PilotAnalysisResult = {} as z.infer<typeof pilotAnalysisResultSchema>;
void _resultContract;

export type PilotModelAnalysis = z.infer<typeof pilotModelAnalysisSchema>;
