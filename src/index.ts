import { Hono } from 'hono';
import { lookupDns } from './dns/dns-service';
import type { Env } from './env';
import { failure, success } from './http/envelope';
import { parseDomain } from './http/input';
import { handleIpLookup } from './ip/ip-service';
import { classifyRdapQuery } from './rdap/rdap-client';
import { lookupRdap } from './rdap/rdap-service';

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
  if (result.summary.status === 'failed') {
    return c.json(
      failure('upstream_error', 'DNS lookup failed for all requested record types.', {
        source: 'cloudflare-doh'
      }),
      502
    );
  }

  return c.json(
    success({
      query: { name: parsed.value },
      summary: result.summary,
      sections: Object.entries(result.recordsByType).map(([title, data]) => ({ title, data })),
      raw: result.rawByType,
      meta: {
        source: 'cloudflare-doh',
        partial: result.summary.status === 'partial' || result.summary.status === 'problem'
      }
    })
  );
});

app.get('/api/rdap', async (c) => {
  const query = (c.req.query('query') ?? '').trim();
  if (!query) return c.json(failure('invalid_input', 'Enter a domain, IP address, or ASN.'), 400);
  const parsed = classifyRdapQuery(query);
  if (!parsed.ok) return c.json(failure('invalid_input', parsed.message), 400);

  try {
    const result = await lookupRdap(parsed.value);
    return c.json(
      success({
        query: { query: parsed.value },
        summary: result.summary,
        sections: result.sections,
        raw: result.raw,
        meta: { source: 'rdap' }
      })
    );
  } catch {
    return c.json(
      failure('upstream_error', 'RDAP lookup failed.', {
        source: 'rdap'
      }),
      502
    );
  }
});

export default app;
