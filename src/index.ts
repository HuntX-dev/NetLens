import { Hono } from 'hono';
import type { Env } from './env';
import { success } from './http/envelope';

export const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => {
  return c.json(
    success({
      summary: { status: 'ok' },
      sections: [],
      raw: {},
      meta: { source: 'worker' }
    })
  );
});

export default app;
