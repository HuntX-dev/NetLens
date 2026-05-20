export function rdapUrlFor(query: string): string {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(query) || query.includes(':')) {
    return `https://rdap.arin.net/registry/ip/${encodeURIComponent(query)}`;
  }
  return `https://rdap.org/domain/${encodeURIComponent(query)}`;
}

export async function fetchRdap(query: string, fetcher: typeof fetch = fetch): Promise<unknown> {
  const res = await fetcher(rdapUrlFor(query), { headers: { accept: 'application/rdap+json, application/json' } });
  if (!res.ok) throw new Error(`RDAP returned HTTP ${res.status}`);
  return res.json();
}
