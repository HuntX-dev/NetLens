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

export type DnsLookupStatus = 'ok' | 'partial' | 'nxdomain' | 'problem' | 'failed';

export type DnsLookupResult = {
  summary: { domain: string; status: DnsLookupStatus };
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
  let transportFailures = 0;
  let completedResponses = 0;
  let nxdomainResponses = 0;
  let problemResponses = 0;

  for (const type of types) {
    recordsByType[type] = [];
    rawByType[type] = null;
  }

  await Promise.all(
    types.map(async (type) => {
      try {
        const raw = await queryCloudflareDoh(domain, type, fetcher);
        completedResponses += 1;
        if (raw.Status === 3) nxdomainResponses += 1;
        if (raw.Status !== 0 && raw.Status !== 3) problemResponses += 1;
        rawByType[type] = raw;
        recordsByType[type] = raw.Answer ?? [];
      } catch (error) {
        transportFailures += 1;
        rawByType[type] = { error: error instanceof Error ? error.message : String(error) };
        recordsByType[type] = [];
      }
    })
  );

  return {
    summary: {
      domain,
      status: getLookupStatus({
        completedResponses,
        nxdomainResponses,
        problemResponses,
        transportFailures,
        totalRequests: types.length
      })
    },
    recordsByType,
    rawByType
  };
}

function getLookupStatus(input: {
  completedResponses: number;
  nxdomainResponses: number;
  problemResponses: number;
  transportFailures: number;
  totalRequests: number;
}): DnsLookupStatus {
  if (input.transportFailures === input.totalRequests) return 'failed';
  if (input.problemResponses > 0) return 'problem';
  if (input.transportFailures > 0) return 'partial';
  if (
    input.completedResponses > 0 &&
    input.nxdomainResponses === input.completedResponses
  ) {
    return 'nxdomain';
  }
  return 'ok';
}
