import { Hono } from 'hono';
import type { Env } from './env';
import { success } from './http/envelope';
import { handleIpLookup } from './ip/ip-service';

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

app.get('/api/ip', handleIpLookup);

export default app;
