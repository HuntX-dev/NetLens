import { parseDomain, parseIpInput } from '../http/input';

const INVALID_RDAP_QUERY_MESSAGE = 'Enter a valid domain, IP address, or ASN.';

type RdapQueryKind = 'domain' | 'ip' | 'autnum';
type RdapQueryClassification =
  | { ok: true; kind: RdapQueryKind; value: string }
  | { ok: false; message: string };

export function classifyRdapQuery(query: string): RdapQueryClassification {
  const value = query.trim();
  if (!value || value.includes('://') || value.includes('/') || value.includes('@')) {
    return invalidRdapQuery();
  }

  const ip = parseIpInput(value);
  if (ip.ok) return { ok: true, kind: 'ip', value: ip.value };

  const autnum = /^(?:AS)?(\d+)$/i.exec(value);
  if (autnum?.[1]) return { ok: true, kind: 'autnum', value: autnum[1] };

  const domain = parseDomain(value);
  if (domain.ok) return { ok: true, kind: 'domain', value: domain.value };

  return invalidRdapQuery();
}

export function rdapUrlFor(query: string): string {
  const classified = classifyRdapQuery(query);
  if (!classified.ok) throw new Error(classified.message);

  if (classified.kind === 'ip') {
    return `https://rdap.org/ip/${encodeURIComponent(classified.value)}`;
  }
  if (classified.kind === 'autnum') {
    return `https://rdap.org/autnum/${encodeURIComponent(classified.value)}`;
  }
  return `https://rdap.org/domain/${encodeURIComponent(classified.value)}`;
}

export async function fetchRdap(query: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  const res = await fetcher(rdapUrlFor(query), {
    headers: {
      accept: 'application/rdap+json, application/json',
      'user-agent': 'NetLens/0.1 (+https://github.com/nayacco/NetLens)'
    }
  });
  if (!res.ok) throw new Error(`RDAP returned HTTP ${res.status}`);
  return res.json();
}

function invalidRdapQuery(): RdapQueryClassification {
  return { ok: false, message: INVALID_RDAP_QUERY_MESSAGE };
}
