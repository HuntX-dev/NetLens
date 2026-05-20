import { describe, expect, it, vi } from 'vitest';
import { lookupRdap } from '../../src/rdap/rdap-service';

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
