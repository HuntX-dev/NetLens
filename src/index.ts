import { Hono } from 'hono';
import type { Env } from './env';

export const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    summary: { status: 'ok' },
    sections: [],
    raw: {},
    meta: { source: 'worker' }
  });
});

export default app;
