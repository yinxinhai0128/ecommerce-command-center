import { existsSync, readFileSync } from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import type { FetchImplementation } from '../analysis/deepseekProvider';
import { buildPilotAnalysisContext } from './analysisContext';
import { requestPilotDeepSeekAnalysis } from './deepseekAnalysis';
import { analyzeLocally } from './localAnalysis';
import { createPilotRepository } from './repository';
import { createPilotIndexes, openPilotDatabase } from './database';
import { resolveOlistPaths } from './paths';
import { createReplayController, type PilotReplayController, type ReplayStateStore } from './replay';
import { ensureReplayStateSchema, MAX_DATE_RANGE_DAYS, replayActionSchema, snapshotQuerySchema } from './schema';
import type { OlistManifest, PilotFilterOptions, PilotReplayState } from './contracts';

export type PilotRouterOptions = {
  dataDir?: string;
  fetchImpl?: FetchImplementation;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

type PilotService = {
  repository: ReturnType<typeof createPilotRepository>;
  replay: PilotReplayController;
  database: ReturnType<typeof openPilotDatabase>;
};

export type PilotRouter = Router & { dispose(): void };

function rangeDays(start: string, end: string) {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  return (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86_400_000 + 1;
}

const analysisRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  filters: z.object({
    start: z.iso.date(),
    end: z.iso.date(),
    category: z.string().trim().min(1).max(200).optional(),
    sellerId: z.string().trim().min(1).max(200).optional(),
    customerState: z.string().trim().min(1).max(200).optional(),
  }).strict(),
}).strict();

function filtersExist(
  filters: z.infer<typeof analysisRequestSchema>['filters'],
  options: PilotFilterOptions,
) {
  return (!filters.category || options.categories.includes(filters.category))
    && (!filters.sellerId || options.sellerIds.includes(filters.sellerId))
    && (!filters.customerState || options.customerStates.includes(filters.customerState));
}

function loadManifest(dataDir: string): OlistManifest | undefined {
  const manifestPath = resolveOlistPaths(dataDir).manifestPath;
  if (!existsSync(manifestPath)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as OlistManifest;
    return manifest.ready && manifest.importerVersion === 2 ? manifest : undefined;
  } catch {
    return undefined;
  }
}

function replayStore(database: ReturnType<typeof openPilotDatabase>): ReplayStateStore {
  ensureReplayStateSchema(database);
  return {
    readReplayState() {
      const row = database.prepare('SELECT source_local_now, is_running FROM replay_state WHERE id = 1').get() as { source_local_now: string | null; is_running: number | null } | undefined;
      if (!row?.source_local_now || row.is_running === null) return undefined;
      return { sourceLocalNow: row.source_local_now, isRunning: Boolean(row.is_running) };
    },
    writeReplayState(state: PilotReplayState) {
      database.prepare(`INSERT INTO replay_state (id, imported_at, source_local_now, is_running)
        VALUES (1, '', :sourceLocalNow, :isRunning)
        ON CONFLICT(id) DO UPDATE SET source_local_now = excluded.source_local_now, is_running = excluded.is_running`
      ).run({ sourceLocalNow: state.sourceLocalNow, isRunning: state.isRunning ? 1 : 0 });
    },
  };
}

export function createPilotRouter(options: PilotRouterOptions = {}): PilotRouter {
  const router = Router();
  const dataDir = options.dataDir ?? 'var/olist';
  const fetchImpl = options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  let service: PilotService | undefined;

  const getService = () => {
    if (service) return service;
    const manifest = loadManifest(dataDir);
    if (!manifest) return undefined;
    const databasePath = resolveOlistPaths(dataDir).databasePath;
    if (!existsSync(databasePath)) throw new Error('Pilot database is unavailable');
    const database = openPilotDatabase(databasePath);
    createPilotIndexes(database);
    service = {
      repository: createPilotRepository(database),
      replay: createReplayController({ store: replayStore(database), range: manifest.range }),
      database,
    };
    return service;
  };

  router.get('/status', (_req, res) => {
    const manifest = loadManifest(dataDir);
    if (!manifest) {
      res.json({ ready: false, importCommand: 'pnpm data:olist:import' });
      return;
    }
    try {
      res.json({ ready: true, range: manifest.range, replay: getService()?.replay.getState() });
    } catch {
      res.status(503).json({ error: 'PILOT_DATABASE_UNAVAILABLE' });
    }
  });

  router.get('/snapshot', (req, res) => {
    const parsed = snapshotQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_QUERY' });
      return;
    }
    if (parsed.data.start > parsed.data.end || rangeDays(parsed.data.start, parsed.data.end) > MAX_DATE_RANGE_DAYS) {
      res.status(400).json({ error: 'INVALID_DATE_RANGE' });
      return;
    }
    try {
      const current = getService();
      if (!current) {
        res.status(503).json({ error: 'PILOT_NOT_READY' });
        return;
      }
      const filterOptions = current.repository.getFilterOptions();
      if ((parsed.data.category && !filterOptions.categories.includes(parsed.data.category))
        || (parsed.data.sellerId && !filterOptions.sellerIds.includes(parsed.data.sellerId))
        || (parsed.data.customerState && !filterOptions.customerStates.includes(parsed.data.customerState))) {
        res.status(400).json({ error: 'INVALID_QUERY' });
        return;
      }
      res.json(current.repository.getSnapshot(parsed.data, current.replay.getState().sourceLocalNow));
    } catch {
      res.status(503).json({ error: 'PILOT_DATABASE_UNAVAILABLE' });
    }
  });

  router.get('/filter-options', (_req, res) => {
    try {
      const current = getService();
      if (!current) {
        res.status(503).json({ error: 'PILOT_NOT_READY' });
        return;
      }
      res.json(current.repository.getFilterOptions());
    } catch {
      res.status(503).json({ error: 'PILOT_DATABASE_UNAVAILABLE' });
    }
  });

  router.post('/analysis', async (req, res) => {
    const parsed = analysisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_QUERY' });
      return;
    }
    const { filters, question } = parsed.data;
    if (filters.start > filters.end || rangeDays(filters.start, filters.end) > MAX_DATE_RANGE_DAYS) {
      res.status(400).json({ error: 'INVALID_DATE_RANGE' });
      return;
    }

    try {
      const current = getService();
      if (!current) {
        res.status(503).json({ error: 'PILOT_NOT_READY' });
        return;
      }
      if (!filtersExist(filters, current.repository.getFilterOptions())) {
        res.status(400).json({ error: 'INVALID_QUERY' });
        return;
      }

      const replayNow = current.replay.getState().sourceLocalNow;
      const snapshot = current.repository.getSnapshot(filters, replayNow);
      const context = buildPilotAnalysisContext(snapshot, question);
      const metadata = { sourceLocalNow: snapshot.sourceLocalNow };
      const apiKey = env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        res.json({ ...analyzeLocally(context, question, 'not_configured', now), metadata });
        return;
      }

      const outcome = await requestPilotDeepSeekAnalysis({
        fetchImpl,
        apiKey,
        model: env.DEEPSEEK_MODEL,
        context,
        now,
      });
      res.json('analysis' in outcome
        ? { ...outcome.analysis, metadata }
        : { ...analyzeLocally(context, question, outcome.fallbackReason, now), metadata });
    } catch {
      res.status(503).json({ error: 'PILOT_DATABASE_UNAVAILABLE' });
    }
  });

  router.post('/replay', (req, res) => {
    const parsed = replayActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_QUERY' });
      return;
    }
    try {
      const current = getService();
      if (!current) {
        res.status(503).json({ error: 'PILOT_NOT_READY' });
        return;
      }
      res.json(current.replay[parsed.data.action]());
    } catch {
      res.status(503).json({ error: 'PILOT_DATABASE_UNAVAILABLE' });
    }
  });

  return Object.assign(router, {
    dispose() {
      if (!service) return;
      service.replay.dispose();
      service.database.close();
      service = undefined;
    },
  });
}
