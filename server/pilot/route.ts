import { existsSync, readFileSync } from 'node:fs';
import { Router } from 'express';
import { createPilotRepository } from './repository';
import { openPilotDatabase } from './database';
import { resolveOlistPaths } from './paths';
import { createReplayController, type PilotReplayController, type ReplayStateStore } from './replay';
import { ensureReplayStateSchema, replayActionSchema, snapshotQuerySchema } from './schema';
import type { OlistManifest, PilotReplayState } from './contracts';

export type PilotRouterOptions = {
  dataDir?: string;
};

type PilotService = {
  repository: ReturnType<typeof createPilotRepository>;
  replay: PilotReplayController;
};

function loadManifest(dataDir: string): OlistManifest | undefined {
  const manifestPath = resolveOlistPaths(dataDir).manifestPath;
  if (!existsSync(manifestPath)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as OlistManifest;
    return manifest.ready ? manifest : undefined;
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

export function createPilotRouter(options: PilotRouterOptions = {}): Router {
  const router = Router();
  const dataDir = options.dataDir ?? 'var/olist';
  let service: PilotService | undefined;

  const getService = () => {
    if (service) return service;
    const manifest = loadManifest(dataDir);
    if (!manifest) return undefined;
    const databasePath = resolveOlistPaths(dataDir).databasePath;
    if (!existsSync(databasePath)) throw new Error('Pilot database is unavailable');
    const database = openPilotDatabase(databasePath);
    service = {
      repository: createPilotRepository(database),
      replay: createReplayController({ store: replayStore(database), range: manifest.range }),
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
    if (parsed.data.start > parsed.data.end) {
      res.status(400).json({ error: 'INVALID_DATE_RANGE' });
      return;
    }
    try {
      const current = getService();
      if (!current) {
        res.status(503).json({ error: 'PILOT_NOT_READY' });
        return;
      }
      res.json(current.repository.getSnapshot(parsed.data, current.replay.getState().sourceLocalNow));
    } catch {
      res.status(503).json({ error: 'PILOT_DATABASE_UNAVAILABLE' });
    }
  });

  router.get('/filters', (_req, res) => {
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

  return router;
}
