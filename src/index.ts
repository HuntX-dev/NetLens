import { Hono } from 'hono';
import { lookupDns } from './dns/dns-service';
import type { Env } from './env';
import { failure, success } from './http/envelope';
import { parseDomain } from './http/input';
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

app.get('/api/dns', async (c) => {
  const parsed = parseDomain(c.req.query('name') ?? '');
  if (!parsed.ok) return c.json(failure(parsed.code, parsed.message), 400);

  const result = await lookupDns(parsed.value);
  return c.json(
    success({
      query: { name: parsed.value },
      summary: result.summary,
      sections: Object.entries(result.recordsByType).map(([title, data]) => ({ title, data })),
      raw: result.rawByType,
      meta: { source: 'cloudflare-doh', partial: result.summary.status === 'partial' }
    })
  );
});

export default app;
