import express, { type Express } from 'express';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createAnalysisRouter, type AnalysisRouterOptions } from './analysis/route';

export type AppOptions = AnalysisRouterOptions;

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/analysis', createAnalysisRouter(options));

  app.use(express.static(resolve(process.cwd(), 'dist')));
  app.use((req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      res.status(404).json({ error: '未找到 API 路由' });
      return;
    }
    if (req.method === 'GET') {
      res.sendFile(resolve(process.cwd(), 'dist', 'index.html'));
      return;
    }
    next();
  });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error && typeof error === 'object' && 'type' in error && (error as { type?: string }).type === 'entity.too.large') {
      res.status(400).json({ error: '请求过大' });
      return;
    }
    res.status(400).json({ error: '请求数据无效' });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  createApp().listen(port, '127.0.0.1');
}
