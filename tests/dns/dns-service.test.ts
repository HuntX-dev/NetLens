import { describe, expect, it, vi } from 'vitest';
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
});
