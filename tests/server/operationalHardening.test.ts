import request from 'supertest';
import { afterEach, expect, test } from 'vitest';
import { createApp, type App } from '../../server/index';

const applications: App[] = [];

function application(env: Record<string, string>): App {
  const app = createApp({ env });
  applications.push(app);
  return app;
}

afterEach(() => applications.splice(0).forEach((app) => app.dispose()));

test('exposes health status with secure response headers and a request ID', async () => {
  const response = await request(application({ LOG_LEVEL: 'silent' })).get('/healthz');

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
});

test('limits API requests without rate-limiting the health probe', async () => {
  const app = application({ LOG_LEVEL: 'silent', API_RATE_LIMIT_MAX: '2' });

  await request(app).get('/healthz').expect(200);
  await request(app).get('/api/missing').expect(404);
  await request(app).get('/api/missing').expect(404);
  const limited = await request(app).get('/api/missing');

  expect(limited.status).toBe(429);
  expect(limited.body).toEqual({ error: '请求过于频繁，请稍后重试' });
});
