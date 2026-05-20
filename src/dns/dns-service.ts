import { queryCloudflareDoh, type DnsJsonAnswer } from './doh-client';

export const DEFAULT_DNS_TYPES = [
  'A',
  'AAAA',
  'MX',
  'NS',
  'SOA',
  'TXT',
  'CAA',
  'CNAME',
  'SRV',
  'SVCB',
  'HTTPS',
  'DS',
  'DNSKEY',
  'TLSA'
] as const;

export type DnsLookupResult = {
  summary: { domain: string; status: 'ok' | 'partial' };
  recordsByType: Record<string, DnsJsonAnswer[]>;
  rawByType: Record<string, unknown>;
};

export async function lookupDns(
  domain: string,
  types: readonly string[] = DEFAULT_DNS_TYPES,
  fetcher: typeof fetch = fetch
): Promise<DnsLookupResult> {
  const recordsByType: Record<string, DnsJsonAnswer[]> = {};
  const rawByType: Record<string, unknown> = {};
  let partial = false;

  await Promise.all(
    types.map(async (type) => {
      try {
        const raw = await queryCloudflareDoh(domain, type, fetcher);
        rawByType[type] = raw;
        recordsByType[type] = raw.Answer ?? [];
      } catch (error) {
        partial = true;
        rawByType[type] = { error: error instanceof Error ? error.message : String(error) };
        recordsByType[type] = [];
      }
    })
  );

  return {
    summary: { domain, status: partial ? 'partial' : 'ok' },
    recordsByType,
    rawByType
  };
}
