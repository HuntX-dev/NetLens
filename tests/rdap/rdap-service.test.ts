import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';
import { classifyRdapQuery, fetchRdap, rdapUrlFor } from '../../src/rdap/rdap-client';
import { lookupRdap } from '../../src/rdap/rdap-service';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classifyRdapQuery', () => {
  it('classifies domains, IP addresses, and ASNs', () => {
    expect(classifyRdapQuery('Example.COM')).toEqual({
      ok: true,
      kind: 'domain',
      value: 'example.com'
    });
    expect(classifyRdapQuery('1.1.1.1')).toEqual({
      ok: true,
      kind: 'ip',
      value: '1.1.1.1'
    });
    expect(classifyRdapQuery('2606:4700:4700::1111')).toEqual({
      ok: true,
      kind: 'ip',
      value: '2606:4700:4700::1111'
    });
    expect(classifyRdapQuery('AS13335')).toEqual({
      ok: true,
      kind: 'autnum',
      value: '13335'
    });
    expect(classifyRdapQuery('13335')).toEqual({
      ok: true,
      kind: 'autnum',
      value: '13335'
    });
  });

  it('rejects malformed RDAP inputs before upstream lookup', () => {
    for (const query of ['https://example.com', 'example.com:443', '999.1.1.1', 'not a host']) {
      expect(classifyRdapQuery(query)).toEqual({
        ok: false,
        message: 'Enter a valid domain, IP address, or ASN.'
      });
    }
  });
});

describe('rdapUrlFor', () => {
  it('routes RDAP queries through rdap.org by classified kind', () => {
    expect(rdapUrlFor('example.com')).toBe('https://rdap.org/domain/example.com');
    expect(rdapUrlFor('1.1.1.1')).toBe('https://rdap.org/ip/1.1.1.1');
    expect(rdapUrlFor('2606:4700:4700::1111')).toBe('https://rdap.org/ip/2606:4700:4700::1111');
    expect(rdapUrlFor('AS13335')).toBe('https://rdap.org/autnum/13335');
  });
});

describe('RDAP upstream URL compatibility', () => {
  it('keeps IPv6 colons literal because rdap.org rejects encoded IPv6 paths', () => {
    expect(rdapUrlFor('2606:4700:4700::1111')).not.toContain('%3A');
  });
});

describe('fetchRdap', () => {
  it('normalizes ASN query before fetching autnum RDAP', async () => {
    const fetcher = vi.fn(async () => new Response('{}'));

    await fetchRdap('AS13335', fetcher);

    expect(fetcher).toHaveBeenCalledWith('https://rdap.org/autnum/13335', {
      headers: {
        accept: 'application/rdap+json, application/json',
        'user-agent': 'NetLens/0.1 (+https://github.com/nayacco/NetLens)'
      }
    });
  });
});

describe('lookupRdap', () => {
  it('normalizes domain RDAP response', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      objectClassName: 'domain',
      ldhName: 'EXAMPLE.COM',
      status: ['active'],
      events: [{ eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' }],
      nameservers: [{ ldhName: 'A.IANA-SERVERS.NET' }]
    })));

    await expect(lookupRdap('example.com', fetcher)).resolves.toMatchObject({
      summary: { query: 'example.com', objectClassName: 'domain', name: 'EXAMPLE.COM' }
    });
  });
});

describe('/api/rdap', () => {
  it('rejects URL-shaped input with the shared failure envelope', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    const res = await app.request('/api/rdap?query=https://example.com');

    expect(res.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'Enter a valid domain, IP address, or ASN.'
      }
    });
  });

  it('uses normalized autnum path for AS-prefixed queries', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      objectClassName: 'autnum',
      handle: 'AS13335'
    })));
    vi.stubGlobal('fetch', fetcher);

    const res = await app.request('/api/rdap?query=AS13335');

    expect(res.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith('https://rdap.org/autnum/13335', {
      headers: {
        accept: 'application/rdap+json, application/json',
        'user-agent': 'NetLens/0.1 (+https://github.com/nayacco/NetLens)'
      }
    });
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      query: { query: '13335' },
      summary: { query: '13335', objectClassName: 'autnum', name: 'AS13335' }
    });
  });

  it('returns upstream failure envelope when RDAP fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream unavailable', { status: 503 }))
    );

    const res = await app.request('/api/rdap?query=example.com');

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'upstream_error',
        message: 'RDAP lookup failed.'
      }
    });
  });
});
