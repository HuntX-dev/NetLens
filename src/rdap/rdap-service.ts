import { fetchRdap } from './rdap-client';

type RdapObject = {
  objectClassName?: string;
  ldhName?: string;
  name?: string;
  handle?: string;
  status?: string[];
  events?: unknown[];
  nameservers?: unknown[];
  entities?: unknown[];
};

export async function lookupRdap(query: string, fetcher: typeof fetch = fetch) {
  const raw = (await fetchRdap(query, fetcher)) as RdapObject;
  return {
    summary: {
      query,
      objectClassName: raw.objectClassName ?? null,
      name: raw.ldhName ?? raw.name ?? raw.handle ?? query,
      status: raw.status ?? []
    },
    sections: [
      { title: 'Events', data: raw.events ?? [] },
      { title: 'Nameservers', data: raw.nameservers ?? [] },
      { title: 'Entities', data: raw.entities ?? [] }
    ],
    raw
  };
}
