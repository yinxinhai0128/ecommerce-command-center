import { downloadOlistSource } from '../server/pilot/source';

console.log(JSON.stringify(await downloadOlistSource({ dataDir: process.argv[2] ?? 'var/olist' }), null, 2));
