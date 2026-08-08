import { Router } from 'express';
import type { AnalysisResult } from '../../src/domain/types';
import { requestDeepSeekAnalysis, type FetchImplementation } from './deepseekProvider';
import { createLocalAnalysis } from './localProvider';
import { analysisRequestSchema } from './schema';

export type AnalysisRouterOptions = {
  fetchImpl?: FetchImplementation;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

export function createAnalysisRouter(options: AnalysisRouterOptions = {}): Router {
  const router = Router();
  const fetchImpl = options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());

  router.post('/', async (req, res) => {
    const parsed = analysisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: '请求数据无效' });
      return;
    }

    const apiKey = env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      res.json(createLocalAnalysis(parsed.data, 'not_configured', now));
      return;
    }

    const outcome = await requestDeepSeekAnalysis({
      fetchImpl,
      apiKey,
      model: env.DEEPSEEK_MODEL,
      context: parsed.data,
    });
    const result: AnalysisResult = 'analysis' in outcome
      ? { ...outcome.analysis, source: 'deepseek', generatedAt: now().toISOString() }
      : createLocalAnalysis(parsed.data, outcome.fallbackReason, now);

    res.json(result);
  });

  return router;
}
