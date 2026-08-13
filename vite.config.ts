import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const DEFAULT_API_PORT = 8787;

export function resolveApiPort(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    return DEFAULT_API_PORT;
  }

  const port = Number(value);
  return port >= 1 && port <= 65_535 ? port : DEFAULT_API_PORT;
}

export default defineConfig(({ mode }) => {
  const { PORT: filePort } = loadEnv(mode, process.cwd(), '');
  const apiPort = resolveApiPort(process.env.PORT ?? filePort);

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './tests/setup.ts',
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.{ts,tsx}'],
    },
  };
});
