import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const date = z.iso.date();

export const snapshotQuerySchema = z.object({
  start: date,
  end: date,
  category: z.string().min(1).optional(),
  sellerId: z.string().min(1).optional(),
  customerState: z.string().min(1).optional(),
});

export const replayActionSchema = z.object({
  action: z.enum(['start', 'pause', 'reset']),
});

export function ensureReplayStateSchema(database: DatabaseSync) {
  const columns = database.prepare('PRAGMA table_info(replay_state)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'source_local_now')) database.exec('ALTER TABLE replay_state ADD COLUMN source_local_now TEXT');
  if (!columns.some((column) => column.name === 'is_running')) database.exec('ALTER TABLE replay_state ADD COLUMN is_running INTEGER');
}
