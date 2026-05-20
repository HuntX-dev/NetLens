import { describe, expect, it, vi } from 'vitest';
import { queryCloudflareDoh } from '../../src/dns/doh-client';
import { lookupDns } from '../../src/dns/dns-service';

describe('lookupDns', () => {
  it('aggregates answers by record type', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const type = new URL(url.toString()).searchParams.get('type');
      return new Response(
        JSON.stringify({
          Status: 0,
          Answer: [
            {
              name: 'example.com.',
              type: type === 'A' ? 1 : 28,
              TTL: 300,
              data:
                type === 'A'
                  ? '93.184.216.34'
                  : '2606:2800:220:1:248:1893:25c8:1946'
            }
          ]
        })
      );
    });

    await expect(lookupDns('example.com', ['A', 'AAAA'], fetcher)).resolves.toMatchObject({
      summary: { domain: 'example.com', status: 'ok' },
      recordsByType: {
        A: [{ data: '93.184.216.34' }],
        AAAA: [{ data: '2606:2800:220:1:248:1893:25c8:1946' }]
      }
    });
  });

  it('marks lookup partial when one record type transport fails', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const type = new URL(url.toString()).searchParams.get('type');
      if (type === 'AAAA') throw new Error('network unavailable');
      return new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ name: 'example.com.', type: 1, TTL: 300, data: '93.184.216.34' }]
        })
      );
    });

    await expect(lookupDns('example.com', ['A', 'AAAA'], fetcher)).resolves.toMatchObject({
      summary: { domain: 'example.com', status: 'partial' },
      recordsByType: {
        A: [{ data: '93.184.216.34' }],
        AAAA: []
      },
      rawByType: {
        AAAA: { error: 'network unavailable' }
      }
    });
  });

  it('marks lookup failed when every record type transport fails', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('gateway timeout');
    });

    await expect(lookupDns('example.com', ['A', 'AAAA'], fetcher)).resolves.toMatchObject({
      summary: { domain: 'example.com', status: 'failed' },
      recordsByType: { A: [], AAAA: [] }
    });
  });

  it('preserves NXDOMAIN as a DNS result status', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ Status: 3 })));

    await expect(lookupDns('missing.example', ['A', 'AAAA'], fetcher)).resolves.toMatchObject({
      summary: { domain: 'missing.example', status: 'nxdomain' },
      recordsByType: { A: [], AAAA: [] },
      rawByType: {
        A: { Status: 3 },
        AAAA: { Status: 3 }
      }
    });
  });

  it('marks non-NXDOMAIN DNS errors as problem results', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const type = new URL(url.toString()).searchParams.get('type');
      return new Response(
        JSON.stringify({
          Status: type === 'A' ? 0 : 2,
          Answer:
            type === 'A'
              ? [{ name: 'example.com.', type: 1, TTL: 300, data: '93.184.216.34' }]
              : undefined
        })
      );
    });

    await expect(lookupDns('example.com', ['A', 'AAAA'], fetcher)).resolves.toMatchObject({
      summary: { domain: 'example.com', status: 'problem' },
      recordsByType: {
        A: [{ data: '93.184.216.34' }],
        AAAA: []
      },
      rawByType: {
        AAAA: { Status: 2 }
      }
    });
  });

  it('keeps record maps in requested type order', async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const type = new URL(url.toString()).searchParams.get('type');
      if (type === 'A') await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ Status: 0, Answer: [] }));
    });

    const result = await lookupDns('example.com', ['AAAA', 'A'], fetcher);

    expect(Object.keys(result.recordsByType)).toEqual(['AAAA', 'A']);
    expect(Object.keys(result.rawByType)).toEqual(['AAAA', 'A']);
  });
});

describe('queryCloudflareDoh', () => {
  it('sends DNS JSON request parameters and accept header', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ Status: 0 })));

    await queryCloudflareDoh('example.com', 'AAAA', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const call = fetcher.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url.toString()).toBe('https://cloudflare-dns.com/dns-query?name=example.com&type=AAAA');
    expect(init).toMatchObject({ headers: { accept: 'application/dns-json' } });
  });
});
