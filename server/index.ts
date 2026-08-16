import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createAnalysisRouter, type AnalysisRouterOptions } from './analysis/route';
import { createPilotRouter, type PilotRouterOptions } from './pilot/route';

export type AppOptions = AnalysisRouterOptions & { pilot?: PilotRouterOptions };
export type App = Express & { dispose(): void };

function apiRateLimitMax(env: Record<string, string | undefined>) {
  const configured = Number(env.API_RATE_LIMIT_MAX);
  return Number.isInteger(configured) && configured > 0 ? configured : 120;
}

export function runtimeHost(env: Record<string, string | undefined> = process.env) {
  return env.HOST?.trim() || '127.0.0.1';
}

export function createApp(options: AppOptions = {}): App {
  const app = express();
  const env = options.env ?? process.env;
  const logger = pino({ level: env.LOG_LEVEL ?? 'info', base: undefined });
  app.use(helmet());
  app.use((req, res, next) => {
    const requestId = randomUUID();
    const startedAt = performance.now();
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      logger.info({
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }, 'http_request');
    });
    next();
  });
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api', rateLimit({
    windowMs: 60_000,
    max: apiRateLimitMax(env),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '请求过于频繁，请稍后重试' },
  }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/analysis', createAnalysisRouter(options));
  const pilotRouter = createPilotRouter({
    fetchImpl: options.fetchImpl,
    env: options.env,
    now: options.now,
    ...options.pilot,
  });
  app.use('/api/pilot', pilotRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '未找到 API 路由' });
  });

  app.use(express.static(resolve(process.cwd(), 'dist')));
  app.use((req, res, next) => {
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
  const application = Object.assign(app, { dispose: () => pilotRouter.dispose() }) as App;
  const listen = application.listen.bind(application);
  const activeServers = new Set<ReturnType<typeof listen>>();
  application.listen = ((...args: Parameters<typeof listen>) => {
    const server = listen(...args);
    activeServers.add(server);
    server.once('close', () => {
      activeServers.delete(server);
      if (activeServers.size === 0) application.dispose();
    });
    return server;
  }) as typeof application.listen;
  return application;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  const app = createApp({ pilot: process.env.OLIST_DATA_DIR ? { dataDir: process.env.OLIST_DATA_DIR } : undefined });
  app.listen(port, runtimeHost());
}
