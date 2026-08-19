import { verifyOlistDataset } from '../server/pilot/verifier';

console.log(JSON.stringify(verifyOlistDataset({ dataDir: process.argv[2] ?? 'var/olist' }), null, 2));
