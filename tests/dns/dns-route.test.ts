import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

describe('/api/dns', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects invalid domain input with the shared failure envelope', async () => {
    const res = await app.request('/api/dns?name=https://example.com/path');

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'Enter a valid domain name without protocol or path.'
      }
    });
  });

  it('returns upstream failure envelope when every DNS request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream unavailable', { status: 502 }))
    );

    const res = await app.request('/api/dns?name=example.com');

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'upstream_error',
        message: 'DNS lookup failed for all requested record types.'
      }
    });
  });
});
