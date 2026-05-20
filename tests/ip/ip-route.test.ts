import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

function envWithDb(row: unknown) {
  return {
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => row)
        }))
      }))
    }
  };
}

describe('/api/ip', () => {
  it('uses explicit IP when provided', async () => {
    const res = await app.request(
      '/api/ip?ip=1.1.1.1',
      {},
      envWithDb({
        network: '1.1.1.0/24',
        country_iso_code: 'AU',
        country_name: 'Australia',
        city_name: 'Research',
        latitude: -37.7,
        longitude: 145.18,
        autonomous_system_number: 13335,
        autonomous_system_organization: 'Cloudflare, Inc.'
      }) as never
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      query: { ip: '1.1.1.1', source: 'explicit' },
      summary: { ip: '1.1.1.1', country: 'AU', asn: 13335 }
    });
  });

  it('uses CF-Connecting-IP by default', async () => {
    const req = new Request('https://netlens.test/api/ip', {
      headers: { 'cf-connecting-ip': '47.129.35.106' }
    });
    const res = await app.request(
      req,
      {},
      envWithDb({
        network: '47.129.0.0/16',
        country_iso_code: 'SG',
        country_name: 'Singapore',
        city_name: 'Singapore',
        latitude: 1.28967,
        longitude: 103.85007,
        autonomous_system_number: 16509,
        autonomous_system_organization: 'Amazon Data Services Singapore'
      }) as never
    );

    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      query: { source: 'current_visitor' },
      summary: { ip: '47.129.35.106', country: 'SG', asn: 16509 }
    });
  });
});
