import { join, resolve } from 'node:path';
import type { OlistPaths } from './contracts';

export function resolveOlistPaths(dataDir = join('var', 'olist')): OlistPaths {
  const resolvedDataDir = resolve(dataDir);
  return {
    dataDir: resolvedDataDir,
    sourceDir: join(resolvedDataDir, 'source'),
    archivePath: join(resolvedDataDir, 'source.zip'),
    databasePath: join(resolvedDataDir, 'olist.sqlite'),
    manifestPath: join(resolvedDataDir, 'manifest.json'),
  };
}
