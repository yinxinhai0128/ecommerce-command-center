import { importOlistDataset } from '../server/pilot/importer';
import { resolveOlistPaths } from '../server/pilot/paths';

const dataDir = process.argv[2] ?? 'var/olist';
console.log(JSON.stringify(await importOlistDataset({ sourceDir: resolveOlistPaths(dataDir).sourceDir, dataDir }), null, 2));
