export type DnsJsonAnswer = {
  name: string;
  type: number;
  TTL: number;
  data: string;
};

export type DnsJsonResponse = {
  Status: number;
  TC?: boolean;
  RD?: boolean;
  RA?: boolean;
  AD?: boolean;
  CD?: boolean;
  Answer?: DnsJsonAnswer[];
  Authority?: DnsJsonAnswer[];
  Additional?: DnsJsonAnswer[];
  Comment?: string;
};

export async function queryCloudflareDoh(
  name: string,
  type: string,
  fetcher: typeof fetch = fetch
): Promise<DnsJsonResponse> {
  const url = new URL('https://cloudflare-dns.com/dns-query');
  url.searchParams.set('name', name);
  url.searchParams.set('type', type);

  const res = await fetcher(url.toString(), { headers: { accept: 'application/dns-json' } });
  if (!res.ok) throw new Error(`Cloudflare DoH returned HTTP ${res.status}`);
  return (await res.json()) as DnsJsonResponse;
}
