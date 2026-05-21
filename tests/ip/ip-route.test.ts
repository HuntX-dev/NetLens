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

function envWithDbThrow(error = new Error('D1 unavailable')) {
  return {
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            throw error;
          })
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
        end_ip_num: '000000000000000000000000000000016843263',
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

  it('does not include current request diagnostics for explicit IP lookups', async () => {
    const res = await app.request(
      '/api/ip?ip=1.1.1.1',
      {
        headers: {
          'accept-language': 'en-US',
          'cf-ray': 'test-ray',
          'user-agent': 'vitest'
        }
      },
      envWithDb({
        network: '1.1.1.0/24',
        end_ip_num: '000000000000000000000000000000016843263',
        country_iso_code: 'AU',
        country_name: 'Australia',
        city_name: 'Research',
        latitude: -37.7,
        longitude: 145.18,
        autonomous_system_number: 13335,
        autonomous_system_organization: 'Cloudflare, Inc.'
      }) as never
    );

    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      raw: { request: null }
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
        end_ip_num: '000000000000000000000000000007974518783',
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

  it('rejects invalid explicit IP input', async () => {
    const res = await app.request('/api/ip?ip=999.1.1.1', {}, envWithDb(null) as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_input' }
    });
  });

  it('rejects current visitor lookups without CF-Connecting-IP', async () => {
    const res = await app.request('/api/ip', {}, envWithDb(null) as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_input' }
    });
  });

  it('returns not_found when D1 has no matching row', async () => {
    const res = await app.request('/api/ip?ip=203.0.113.1', {}, envWithDb(null) as never);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'not_found',
        message: 'No GeoLite2 match was found for this IP address.'
      }
    });
  });

  it('wraps D1 lookup failures in the API error envelope', async () => {
    const res = await app.request('/api/ip?ip=1.1.1.1', {}, envWithDbThrow() as never);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'd1_unavailable',
        message: 'GeoIP database is unavailable.'
      }
    });
  });
});
