# NetLens MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working NetLens Cloudflare Worker: a plain HTML/CSS/JS toolbox with IP Intelligence, DNS lookup, and RDAP lookup.

**Architecture:** Use one Hono Worker for static UI and JSON APIs. Keep domain logic in small TypeScript modules, store MaxMind GeoLite2 data in D1, and treat Cloudflare request metadata as diagnostics only for the default current-IP view. The UI is framework-free and consumes a common API response envelope.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, Vitest, Wrangler, plain HTML/CSS/JavaScript, GitHub Actions.

---

## File Structure

- `package.json`: npm scripts and dependencies.
- `tsconfig.json`: strict TypeScript config for Workers.
- `vitest.config.ts`: unit test config.
- `wrangler.toml`: Cloudflare Worker and D1 binding config.
- `src/index.ts`: Hono app entrypoint and route wiring.
- `src/env.ts`: Worker binding and request metadata types.
- `src/http/envelope.ts`: common success/error response helpers.
- `src/http/input.ts`: domain and IP input parsing.
- `src/ip/ip-number.ts`: IPv4/IPv6 parsing into sortable range keys.
- `src/ip/geoip-repository.ts`: D1 queries for GeoLite2 rows.
- `src/ip/ip-service.ts`: current/explicit IP lookup orchestration.
- `src/dns/doh-client.ts`: Cloudflare DNS over HTTPS client.
- `src/dns/dns-service.ts`: DNS record type aggregation and normalization.
- `src/rdap/rdap-client.ts`: RDAP endpoint selection and fetch logic.
- `src/rdap/rdap-service.ts`: RDAP response normalization.
- `src/ui/app.html`: single-page shell.
- `src/ui/styles.css`: Hybrid Terminal Dashboard styles.
- `src/ui/app.js`: framework-free UI state, form handling, and rendering.
- `scripts/geoip/convert-geolite2.mjs`: MaxMind CSV to D1 SQL converter.
- `.github/workflows/update-geoip.yml`: daily GeoLite2 D1 update.
- `tests/**/*.test.ts`: unit tests for parsing, services, and route behavior.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `wrangler.toml`
- Create: `src/index.ts`
- Create: `src/env.ts`
- Test: `tests/smoke.test.ts`

- [ ] **Step 1: Create package metadata**

Create `package.json`:

```json
{
  "name": "netlens",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260520.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0",
    "wrangler": "^4.18.0"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src", "tests", "scripts"]
}
```

- [ ] **Step 3: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
```

- [ ] **Step 4: Create Worker config**

Create `wrangler.toml`:

```toml
name = "netlens"
main = "src/index.ts"
compatibility_date = "2026-05-20"

[[d1_databases]]
binding = "DB"
database_name = "netlens-geoip"
database_id = "replace-with-cloudflare-d1-database-id"
```

- [ ] **Step 5: Create Worker env types**

Create `src/env.ts`:

```ts
export type Env = {
  DB: D1Database;
};
```

- [ ] **Step 6: Create minimal Hono app**

Create `src/index.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from './env';

export const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    summary: { status: 'ok' },
    sections: [],
    raw: {},
    meta: { source: 'worker' }
  });
});

export default app;
```

- [ ] **Step 7: Add smoke test**

Create `tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';

describe('worker smoke test', () => {
  it('returns health envelope', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      summary: { status: 'ok' }
    });
  });
});
```

- [ ] **Step 8: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and npm exits with code 0.

- [ ] **Step 9: Verify scaffold**

Run: `npm test`

Expected: `1 passed`.

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts wrangler.toml src/index.ts src/env.ts tests/smoke.test.ts
git commit -m "chore: scaffold worker project"
```

## Task 2: Common API Envelope And Input Parsing

**Files:**
- Create: `src/http/envelope.ts`
- Create: `src/http/input.ts`
- Test: `tests/http/input.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write input parsing tests**

Create `tests/http/input.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseDomain, parseIpInput } from '../../src/http/input';

describe('parseIpInput', () => {
  it('accepts IPv4 input', () => {
    expect(parseIpInput(' 1.1.1.1 ')).toEqual({ ok: true, value: '1.1.1.1', version: 4 });
  });

  it('accepts IPv6 input', () => {
    expect(parseIpInput('2606:4700:4700::1111')).toEqual({
      ok: true,
      value: '2606:4700:4700::1111',
      version: 6
    });
  });

  it('rejects invalid IP input', () => {
    expect(parseIpInput('999.1.1.1')).toEqual({
      ok: false,
      code: 'invalid_input',
      message: 'Enter a valid IPv4 or IPv6 address.'
    });
  });
});

describe('parseDomain', () => {
  it('normalizes a valid domain', () => {
    expect(parseDomain(' Example.COM. ')).toEqual({ ok: true, value: 'example.com' });
  });

  it('rejects invalid domain text', () => {
    expect(parseDomain('http://example.com')).toEqual({
      ok: false,
      code: 'invalid_input',
      message: 'Enter a valid domain name without protocol or path.'
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/http/input.test.ts`

Expected: FAIL because `src/http/input.ts` does not exist.

- [ ] **Step 3: Add envelope helpers**

Create `src/http/envelope.ts`:

```ts
export type ApiErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'upstream_timeout'
  | 'upstream_error'
  | 'partial_result'
  | 'd1_unavailable'
  | 'rate_limited';

export type ApiMeta = {
  latencyMs?: number;
  source?: string;
  partial?: boolean;
};

export type ApiSuccess<TSummary, TSection = unknown, TRaw = unknown> = {
  ok: true;
  query?: Record<string, unknown>;
  summary: TSummary;
  sections: TSection[];
  raw: TRaw;
  meta: ApiMeta;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
  };
  meta: ApiMeta;
};

export function success<TSummary, TSection = unknown, TRaw = unknown>(
  value: Omit<ApiSuccess<TSummary, TSection, TRaw>, 'ok'>
): ApiSuccess<TSummary, TSection, TRaw> {
  return { ok: true, ...value };
}

export function failure(code: ApiErrorCode, message: string, meta: ApiMeta = {}): ApiFailure {
  return { ok: false, error: { code, message }, meta };
}
```

- [ ] **Step 4: Add input parser**

Create `src/http/input.ts`:

```ts
import type { ApiErrorCode } from './envelope';

type ParseError = { ok: false; code: ApiErrorCode; message: string };
type IpParseSuccess = { ok: true; value: string; version: 4 | 6 };
type DomainParseSuccess = { ok: true; value: string };

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

export function parseIpInput(input: string): IpParseSuccess | ParseError {
  const value = input.trim();
  if (IPV4_RE.test(value)) return { ok: true, value, version: 4 };
  if (value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)) {
    try {
      new URL(`http://[${value}]`);
      return { ok: true, value: value.toLowerCase(), version: 6 };
    } catch {
      return invalidIp();
    }
  }
  return invalidIp();
}

export function parseDomain(input: string): DomainParseSuccess | ParseError {
  const value = input.trim().replace(/\.$/, '').toLowerCase();
  if (value.includes('://') || value.includes('/') || value.includes('@')) {
    return invalidDomain();
  }
  if (!DOMAIN_RE.test(value)) return invalidDomain();
  return { ok: true, value };
}

function invalidIp(): ParseError {
  return { ok: false, code: 'invalid_input', message: 'Enter a valid IPv4 or IPv6 address.' };
}

function invalidDomain(): ParseError {
  return {
    ok: false,
    code: 'invalid_input',
    message: 'Enter a valid domain name without protocol or path.'
  };
}
```

- [ ] **Step 5: Update health route to use envelope**

Modify `src/index.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from './env';
import { success } from './http/envelope';

export const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => {
  return c.json(
    success({
      summary: { status: 'ok' },
      sections: [],
      raw: {},
      meta: { source: 'worker' }
    })
  );
});

export default app;
```

- [ ] **Step 6: Verify tests pass**

Run: `npm test`

Expected: all tests pass.

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 7: Commit**

```bash
git add src/http/envelope.ts src/http/input.ts src/index.ts tests/http/input.test.ts
git commit -m "feat: add api envelope and input parsing"
```

## Task 3: IP Numbering And D1 GeoIP Repository

**Files:**
- Create: `src/ip/ip-number.ts`
- Create: `src/ip/geoip-repository.ts`
- Test: `tests/ip/ip-number.test.ts`
- Test: `tests/ip/geoip-repository.test.ts`

- [ ] **Step 1: Write IP number tests**

Create `tests/ip/ip-number.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ipToRangeKey } from '../../src/ip/ip-number';

describe('ipToRangeKey', () => {
  it('converts IPv4 to decimal key', () => {
    expect(ipToRangeKey('1.1.1.1')).toEqual({ version: 4, key: '0000000000000000000000000016843009' });
  });

  it('converts IPv6 to padded decimal key', () => {
    expect(ipToRangeKey('2606:4700:4700::1111')).toEqual({
      version: 6,
      key: '05051571572183030902454628234286131217'
    });
  });
});
```

- [ ] **Step 2: Write repository tests with a fake D1 database**

Create `tests/ip/geoip-repository.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { GeoIpRepository } from '../../src/ip/geoip-repository';

function fakeDb(result: unknown): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => result)
      }))
    }))
  } as unknown as D1Database;
}

describe('GeoIpRepository', () => {
  it('returns merged geo and ASN rows', async () => {
    const db = fakeDb({
      ip_version: 4,
      network: '1.1.1.0/24',
      country_iso_code: 'AU',
      country_name: 'Australia',
      city_name: 'Research',
      latitude: -37.7,
      longitude: 145.18,
      autonomous_system_number: 13335,
      autonomous_system_organization: 'Cloudflare, Inc.'
    });

    const repo = new GeoIpRepository(db);
    await expect(repo.lookup('1.1.1.1')).resolves.toMatchObject({
      ip: '1.1.1.1',
      location: { countryIsoCode: 'AU', cityName: 'Research' },
      asn: { number: 13335, organization: 'Cloudflare, Inc.' }
    });
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- tests/ip`

Expected: FAIL because IP modules do not exist.

- [ ] **Step 4: Implement IP range key conversion**

Create `src/ip/ip-number.ts`:

```ts
export type IpRangeKey = {
  version: 4 | 6;
  key: string;
};

const DECIMAL_WIDTH = 38;

export function ipToRangeKey(ip: string): IpRangeKey {
  if (ip.includes('.')) {
    const value = ip.split('.').reduce((acc, part) => (acc << 8n) + BigInt(Number(part)), 0n);
    return { version: 4, key: pad(value) };
  }

  const value = ipv6ToBigInt(ip);
  return { version: 6, key: pad(value) };
}

function ipv6ToBigInt(ip: string): bigint {
  const [leftRaw, rightRaw = ''] = ip.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  return groups.reduce((acc, group) => (acc << 16n) + BigInt(parseInt(group || '0', 16)), 0n);
}

function pad(value: bigint): string {
  return value.toString(10).padStart(DECIMAL_WIDTH, '0');
}
```

- [ ] **Step 5: Implement GeoIP repository**

Create `src/ip/geoip-repository.ts`:

```ts
import { ipToRangeKey } from './ip-number';

export type GeoIpLookup = {
  ip: string;
  location: {
    countryIsoCode: string | null;
    countryName: string | null;
    cityName: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  asn: {
    number: number | null;
    organization: string | null;
  };
  matchedNetwork: string | null;
  raw: unknown;
};

type GeoIpRow = {
  network: string | null;
  country_iso_code: string | null;
  country_name: string | null;
  city_name: string | null;
  latitude: number | null;
  longitude: number | null;
  autonomous_system_number: number | null;
  autonomous_system_organization: string | null;
};

export class GeoIpRepository {
  constructor(private readonly db: D1Database) {}

  async lookup(ip: string): Promise<GeoIpLookup | null> {
    const key = ipToRangeKey(ip);
    const row = await this.db
      .prepare(
        `SELECT
          n.network,
          l.country_iso_code,
          l.country_name,
          l.city_name,
          n.latitude,
          n.longitude,
          a.autonomous_system_number,
          a.autonomous_system_organization
        FROM geoip_networks n
        LEFT JOIN geoip_locations l ON l.geoname_id = n.geoname_id
        LEFT JOIN geoip_asn_networks a
          ON a.ip_version = n.ip_version
          AND a.start_ip_num <= ?
          AND a.end_ip_num >= ?
        WHERE n.ip_version = ?
          AND n.start_ip_num <= ?
          AND n.end_ip_num >= ?
        ORDER BY n.start_ip_num DESC
        LIMIT 1`
      )
      .bind(key.key, key.key, key.version, key.key, key.key)
      .first<GeoIpRow>();

    if (!row) return null;

    return {
      ip,
      location: {
        countryIsoCode: row.country_iso_code,
        countryName: row.country_name,
        cityName: row.city_name,
        latitude: row.latitude,
        longitude: row.longitude
      },
      asn: {
        number: row.autonomous_system_number,
        organization: row.autonomous_system_organization
      },
      matchedNetwork: row.network,
      raw: row
    };
  }
}
```

- [ ] **Step 6: Verify IP tests**

Run: `npm test -- tests/ip`

Expected: all IP tests pass.

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 7: Commit**

```bash
git add src/ip tests/ip
git commit -m "feat: add geoip range lookup"
```

## Task 4: `/api/ip` Route And Current Request Diagnostics

**Files:**
- Create: `src/ip/ip-service.ts`
- Modify: `src/index.ts`
- Test: `tests/ip/ip-route.test.ts`

- [ ] **Step 1: Write route tests**

Create `tests/ip/ip-route.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

function envWithDb(row: unknown) {
  return {
    DB: {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => row)
        }))
      }))
    }
  };
}

describe('/api/ip', () => {
  it('uses explicit IP when provided', async () => {
    const res = await app.request('/api/ip?ip=1.1.1.1', {}, envWithDb({
      network: '1.1.1.0/24',
      country_iso_code: 'AU',
      country_name: 'Australia',
      city_name: 'Research',
      latitude: -37.7,
      longitude: 145.18,
      autonomous_system_number: 13335,
      autonomous_system_organization: 'Cloudflare, Inc.'
    }) as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      query: { ip: '1.1.1.1', source: 'explicit' },
      summary: { ip: '1.1.1.1', country: 'AU', asn: 13335 }
    });
  });

  it('uses CF-Connecting-IP by default', async () => {
    const req = new Request('https://netlens.test/api/ip', {
      headers: { 'cf-connecting-ip': '47.129.35.106' }
    });
    const res = await app.request(req, envWithDb({
      network: '47.129.0.0/16',
      country_iso_code: 'SG',
      country_name: 'Singapore',
      city_name: 'Singapore',
      latitude: 1.28967,
      longitude: 103.85007,
      autonomous_system_number: 16509,
      autonomous_system_organization: 'Amazon Data Services Singapore'
    }) as never);

    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      query: { source: 'current_visitor' },
      summary: { ip: '47.129.35.106', country: 'SG', asn: 16509 }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/ip/ip-route.test.ts`

Expected: FAIL because `/api/ip` is not implemented.

- [ ] **Step 3: Implement IP service**

Create `src/ip/ip-service.ts`:

```ts
import type { Context } from 'hono';
import type { Env } from '../env';
import { failure, success } from '../http/envelope';
import { parseIpInput } from '../http/input';
import { GeoIpRepository } from './geoip-repository';

export async function handleIpLookup(c: Context<{ Bindings: Env }>) {
  const explicit = c.req.query('ip');
  const candidate = explicit ?? c.req.header('cf-connecting-ip') ?? '';
  const parsed = parseIpInput(candidate);

  if (!parsed.ok) {
    return c.json(failure(parsed.code, parsed.message), 400);
  }

  const repo = new GeoIpRepository(c.env.DB);
  const result = await repo.lookup(parsed.value);

  if (!result) {
    return c.json(failure('not_found', 'No GeoLite2 match was found for this IP address.'), 404);
  }

  return c.json(
    success({
      query: { ip: parsed.value, source: explicit ? 'explicit' : 'current_visitor' },
      summary: {
        ip: parsed.value,
        country: result.location.countryIsoCode,
        city: result.location.cityName,
        asn: result.asn.number,
        organization: result.asn.organization
      },
      sections: [
        { title: 'Location', data: result.location },
        { title: 'Network', data: result.asn },
        { title: 'Matched ranges', data: { network: result.matchedNetwork } }
      ],
      raw: {
        d1: result.raw,
        request: explicit ? null : buildRequestDiagnostics(c)
      },
      meta: { source: 'd1' }
    })
  );
}

function buildRequestDiagnostics(c: Context<{ Bindings: Env }>) {
  return {
    colo: c.req.raw.cf?.colo,
    httpProtocol: c.req.raw.cf?.httpProtocol,
    tlsVersion: c.req.raw.cf?.tlsVersion,
    tlsCipher: c.req.raw.cf?.tlsCipher,
    headers: {
      acceptLanguage: c.req.header('accept-language'),
      userAgent: c.req.header('user-agent'),
      cfRay: c.req.header('cf-ray')
    }
  };
}
```

- [ ] **Step 4: Wire route**

Modify `src/index.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from './env';
import { success } from './http/envelope';
import { handleIpLookup } from './ip/ip-service';

export const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => {
  return c.json(
    success({
      summary: { status: 'ok' },
      sections: [],
      raw: {},
      meta: { source: 'worker' }
    })
  );
});

app.get('/api/ip', handleIpLookup);

export default app;
```

- [ ] **Step 5: Verify route tests**

Run: `npm test -- tests/ip`

Expected: all IP tests pass.

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/ip/ip-service.ts tests/ip/ip-route.test.ts
git commit -m "feat: add ip intelligence api"
```

## Task 5: DNS Lookup API

**Files:**
- Create: `src/dns/doh-client.ts`
- Create: `src/dns/dns-service.ts`
- Modify: `src/index.ts`
- Test: `tests/dns/dns-service.test.ts`

- [ ] **Step 1: Write DNS service tests**

Create `tests/dns/dns-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { lookupDns } from '../../src/dns/dns-service';

describe('lookupDns', () => {
  it('aggregates answers by record type', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const type = new URL(url).searchParams.get('type');
      return new Response(JSON.stringify({
        Status: 0,
        Answer: [{ name: 'example.com.', type: type === 'A' ? 1 : 28, TTL: 300, data: type === 'A' ? '93.184.216.34' : '2606:2800:220:1:248:1893:25c8:1946' }]
      }));
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/dns/dns-service.test.ts`

Expected: FAIL because DNS modules do not exist.

- [ ] **Step 3: Implement DoH client**

Create `src/dns/doh-client.ts`:

```ts
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
```

- [ ] **Step 4: Implement DNS aggregation**

Create `src/dns/dns-service.ts`:

```ts
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

  await Promise.all(types.map(async (type) => {
    try {
      const raw = await queryCloudflareDoh(domain, type, fetcher);
      rawByType[type] = raw;
      recordsByType[type] = raw.Answer ?? [];
    } catch (error) {
      partial = true;
      rawByType[type] = { error: error instanceof Error ? error.message : String(error) };
      recordsByType[type] = [];
    }
  }));

  return {
    summary: { domain, status: partial ? 'partial' : 'ok' },
    recordsByType,
    rawByType
  };
}
```

- [ ] **Step 5: Wire `/api/dns`**

Modify `src/index.ts` to import `failure`, `parseDomain`, and `lookupDns`, then add:

```ts
app.get('/api/dns', async (c) => {
  const parsed = parseDomain(c.req.query('name') ?? '');
  if (!parsed.ok) return c.json(failure(parsed.code, parsed.message), 400);

  const result = await lookupDns(parsed.value);
  return c.json(
    success({
      query: { name: parsed.value },
      summary: result.summary,
      sections: Object.entries(result.recordsByType).map(([title, data]) => ({ title, data })),
      raw: result.rawByType,
      meta: { source: 'cloudflare-doh', partial: result.summary.status === 'partial' }
    })
  );
});
```

- [ ] **Step 6: Verify DNS tests**

Run: `npm test -- tests/dns`

Expected: all DNS tests pass.

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 7: Commit**

```bash
git add src/dns src/index.ts tests/dns
git commit -m "feat: add dns lookup api"
```

## Task 6: RDAP API

**Files:**
- Create: `src/rdap/rdap-client.ts`
- Create: `src/rdap/rdap-service.ts`
- Modify: `src/index.ts`
- Test: `tests/rdap/rdap-service.test.ts`

- [ ] **Step 1: Write RDAP tests**

Create `tests/rdap/rdap-service.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/rdap/rdap-service.test.ts`

Expected: FAIL because RDAP modules do not exist.

- [ ] **Step 3: Implement RDAP endpoint selection**

Create `src/rdap/rdap-client.ts`:

```ts
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
```

- [ ] **Step 4: Implement RDAP normalization**

Create `src/rdap/rdap-service.ts`:

```ts
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
```

- [ ] **Step 5: Wire `/api/rdap`**

Modify `src/index.ts` to import `lookupRdap`, then add:

```ts
app.get('/api/rdap', async (c) => {
  const query = (c.req.query('query') ?? '').trim();
  if (!query) return c.json(failure('invalid_input', 'Enter a domain, IP address, or ASN.'), 400);

  const result = await lookupRdap(query);
  return c.json(
    success({
      query: { query },
      summary: result.summary,
      sections: result.sections,
      raw: result.raw,
      meta: { source: 'rdap' }
    })
  );
});
```

- [ ] **Step 6: Verify RDAP tests**

Run: `npm test -- tests/rdap`

Expected: all RDAP tests pass.

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 7: Commit**

```bash
git add src/rdap src/index.ts tests/rdap
git commit -m "feat: add rdap lookup api"
```

## Task 7: Framework-Free UI

**Files:**
- Create: `src/ui/app.html`
- Create: `src/ui/styles.css`
- Create: `src/ui/app.js`
- Modify: `src/index.ts`
- Test: `tests/ui/html.test.ts`

- [ ] **Step 1: Write UI smoke test**

Create `tests/ui/html.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('UI shell', () => {
  it('contains the three tool tabs and no framework root', () => {
    const html = readFileSync('src/ui/app.html', 'utf8');
    expect(html).toContain('data-tool="ip"');
    expect(html).toContain('data-tool="dns"');
    expect(html).toContain('data-tool="rdap"');
    expect(html).not.toContain('react');
    expect(html).not.toContain('vue');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/ui/html.test.ts`

Expected: FAIL because UI files do not exist.

- [ ] **Step 3: Create HTML shell**

Create `src/ui/app.html` with a compact command bar, three tool panels, and result panes:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>NetLens</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div class="brand">NetLens</div>
        <nav class="tabs" aria-label="Tools">
          <button data-tool="ip" class="tab is-active">IP</button>
          <button data-tool="dns" class="tab">DNS</button>
          <button data-tool="rdap" class="tab">RDAP</button>
        </nav>
        <div id="status" class="status">ready</div>
      </header>

      <section id="tool-ip" class="tool is-active">
        <form data-form="ip" class="query">
          <input name="ip" placeholder="Current IP, or enter IPv4 / IPv6">
          <button type="submit">Query</button>
        </form>
      </section>

      <section id="tool-dns" class="tool">
        <form data-form="dns" class="query">
          <input name="name" placeholder="example.com">
          <button type="submit">Query</button>
        </form>
      </section>

      <section id="tool-rdap" class="tool">
        <form data-form="rdap" class="query">
          <input name="query" placeholder="domain, IP, or ASN">
          <button type="submit">Query</button>
        </form>
      </section>

      <section class="results">
        <div id="summary" class="summary"></div>
        <div id="sections" class="sections"></div>
        <pre id="raw" class="raw"></pre>
      </section>
    </main>
    <script src="/app.js" type="module"></script>
  </body>
</html>
```

- [ ] **Step 4: Create CSS**

Create `src/ui/styles.css` with dark terminal dashboard styling:

```css
:root {
  color-scheme: dark;
  --bg: #0d1117;
  --panel: #161b22;
  --line: #30363d;
  --text: #e6edf3;
  --muted: #8b949e;
  --accent: #7ee787;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.5 Inter, ui-sans-serif, system-ui, sans-serif;
}
.shell { width: min(1180px, calc(100vw - 32px)); margin: 24px auto; }
.topbar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; border-bottom: 1px solid var(--line); padding-bottom: 12px; }
.brand { font: 700 18px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--accent); }
.tabs { display: flex; gap: 8px; }
.tab, button { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--text); padding: 8px 12px; cursor: pointer; }
.tab.is-active { border-color: var(--accent); color: var(--accent); }
.status { justify-self: end; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.tool { display: none; margin: 20px 0; }
.tool.is-active { display: block; }
.query { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
input { width: 100%; border: 1px solid var(--line); border-radius: 8px; background: #050807; color: var(--text); padding: 10px 12px; font: inherit; }
.results { display: grid; gap: 14px; }
.summary, .sections, .raw { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 14px; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.kv { min-width: 0; }
.kv span { display: block; color: var(--muted); font-size: 12px; }
.kv strong { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
.raw { overflow: auto; max-height: 460px; white-space: pre-wrap; }
```

- [ ] **Step 5: Create client JavaScript**

Create `src/ui/app.js`:

```js
const tabs = document.querySelectorAll('[data-tool]');
const tools = document.querySelectorAll('.tool');
const statusEl = document.querySelector('#status');
const summaryEl = document.querySelector('#summary');
const sectionsEl = document.querySelector('#sections');
const rawEl = document.querySelector('#raw');

for (const tab of tabs) {
  tab.addEventListener('click', () => switchTool(tab.dataset.tool));
}

document.querySelector('[data-form="ip"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ip = new FormData(event.currentTarget).get('ip').trim();
  await requestJson(ip ? `/api/ip?ip=${encodeURIComponent(ip)}` : '/api/ip');
});

document.querySelector('[data-form="dns"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = new FormData(event.currentTarget).get('name').trim();
  await requestJson(`/api/dns?name=${encodeURIComponent(name)}`);
});

document.querySelector('[data-form="rdap"]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = new FormData(event.currentTarget).get('query').trim();
  await requestJson(`/api/rdap?query=${encodeURIComponent(query)}`);
});

function switchTool(tool) {
  tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tool === tool));
  tools.forEach((panel) => panel.classList.toggle('is-active', panel.id === `tool-${tool}`));
}

async function requestJson(url) {
  statusEl.textContent = 'loading';
  const started = performance.now();
  const res = await fetch(url);
  const json = await res.json();
  render(json);
  statusEl.textContent = `${Math.round(performance.now() - started)}ms`;
}

function render(json) {
  summaryEl.innerHTML = '';
  sectionsEl.innerHTML = '';
  const summary = json.ok ? json.summary : json.error;
  for (const [key, value] of Object.entries(summary ?? {})) {
    const div = document.createElement('div');
    div.className = 'kv';
    div.innerHTML = `<span>${escapeHtml(key)}</span><strong>${escapeHtml(String(value ?? ''))}</strong>`;
    summaryEl.append(div);
  }
  for (const section of json.sections ?? []) {
    const pre = document.createElement('pre');
    pre.className = 'raw';
    pre.textContent = `${section.title}\n${JSON.stringify(section.data, null, 2)}`;
    sectionsEl.append(pre);
  }
  rawEl.textContent = JSON.stringify(json.raw ?? json, null, 2);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

requestJson('/api/ip');
```

- [ ] **Step 6: Serve UI assets from Worker**

Modify `src/index.ts` to import assets with Wrangler's text loader and serve them from the Worker:

```ts
import html from './ui/app.html?raw';
import css from './ui/styles.css?raw';
import js from './ui/app.js?raw';

app.get('/', (c) => c.html(html));
app.get('/styles.css', (c) => c.text(css, 200, { 'content-type': 'text/css; charset=utf-8' }));
app.get('/app.js', (c) => c.text(js, 200, { 'content-type': 'application/javascript; charset=utf-8' }));
```

Add `src/assets.d.ts`:

```ts
declare module '*?raw' {
  const value: string;
  export default value;
}
```

- [ ] **Step 7: Verify UI tests and local rendering**

Run: `npm test -- tests/ui`

Expected: UI smoke test passes.

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

Run: `npm run dev`

Expected: Wrangler prints a localhost URL and `/` renders NetLens.

- [ ] **Step 8: Commit**

```bash
git add src/ui src/index.ts src/assets.d.ts tests/ui
git commit -m "feat: add framework-free ui"
```

## Task 8: GeoLite2 D1 Import Script And Schema

**Files:**
- Create: `schema.sql`
- Create: `scripts/geoip/convert-geolite2.mjs`
- Create: `.github/workflows/update-geoip.yml`
- Test: `tests/geoip/schema.test.ts`

- [ ] **Step 1: Write schema test**

Create `tests/geoip/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('D1 schema', () => {
  it('defines geoip network, ASN, location, and import tables', () => {
    const sql = readFileSync('schema.sql', 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS geoip_imports');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS geoip_networks');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS geoip_asn_networks');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS geoip_locations');
    expect(sql).toContain('idx_geoip_networks_range');
    expect(sql).toContain('idx_geoip_asn_networks_range');
  });
});
```

- [ ] **Step 2: Run schema test to verify failure**

Run: `npm test -- tests/geoip/schema.test.ts`

Expected: FAIL because `schema.sql` does not exist.

- [ ] **Step 3: Create D1 schema**

Create `schema.sql` with the tables and indexes from the design spec:

```sql
CREATE TABLE IF NOT EXISTS geoip_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  edition TEXT NOT NULL,
  build_epoch INTEGER,
  imported_at TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  checksum TEXT
);

CREATE TABLE IF NOT EXISTS geoip_networks (
  id TEXT PRIMARY KEY,
  ip_version INTEGER NOT NULL,
  network TEXT NOT NULL,
  start_ip_num TEXT NOT NULL,
  end_ip_num TEXT NOT NULL,
  geoname_id INTEGER,
  registered_country_geoname_id INTEGER,
  represented_country_geoname_id INTEGER,
  is_anonymous_proxy INTEGER,
  is_satellite_provider INTEGER,
  postal_code TEXT,
  latitude REAL,
  longitude REAL,
  accuracy_radius INTEGER,
  metro_code INTEGER,
  time_zone TEXT
);

CREATE TABLE IF NOT EXISTS geoip_asn_networks (
  id TEXT PRIMARY KEY,
  ip_version INTEGER NOT NULL,
  network TEXT NOT NULL,
  start_ip_num TEXT NOT NULL,
  end_ip_num TEXT NOT NULL,
  autonomous_system_number INTEGER,
  autonomous_system_organization TEXT
);

CREATE TABLE IF NOT EXISTS geoip_locations (
  geoname_id INTEGER PRIMARY KEY,
  locale_code TEXT,
  continent_code TEXT,
  continent_name TEXT,
  country_iso_code TEXT,
  country_name TEXT,
  subdivision_1_iso_code TEXT,
  subdivision_1_name TEXT,
  subdivision_2_iso_code TEXT,
  subdivision_2_name TEXT,
  city_name TEXT,
  metro_code INTEGER,
  time_zone TEXT,
  is_in_european_union INTEGER
);

CREATE INDEX IF NOT EXISTS idx_geoip_networks_range
  ON geoip_networks (ip_version, start_ip_num, end_ip_num);

CREATE INDEX IF NOT EXISTS idx_geoip_asn_networks_range
  ON geoip_asn_networks (ip_version, start_ip_num, end_ip_num);

CREATE INDEX IF NOT EXISTS idx_geoip_imports_edition
  ON geoip_imports (edition, imported_at);
```

- [ ] **Step 4: Create converter script**

Create `scripts/geoip/convert-geolite2.mjs`:

```js
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';

const args = parseArgs(process.argv.slice(2));
if (!args.output || !args.cityBlocks || !args.asnBlocks || !args.locations) {
  console.error('Usage: node scripts/geoip/convert-geolite2.mjs --city-blocks <csv...> --asn-blocks <csv...> --locations <csv> --output <sql>');
  process.exit(1);
}

await mkdir(dirname(args.output), { recursive: true });
const out = createWriteStream(args.output, { encoding: 'utf8' });

out.write('BEGIN TRANSACTION;\n');
out.write('DELETE FROM geoip_networks;\n');
out.write('DELETE FROM geoip_asn_networks;\n');
out.write('DELETE FROM geoip_locations;\n');

let rowCount = 0;
for await (const row of readCsv(args.locations)) {
  rowCount += 1;
  out.write(`INSERT OR REPLACE INTO geoip_locations (${[
    'geoname_id',
    'locale_code',
    'continent_code',
    'continent_name',
    'country_iso_code',
    'country_name',
    'subdivision_1_iso_code',
    'subdivision_1_name',
    'subdivision_2_iso_code',
    'subdivision_2_name',
    'city_name',
    'metro_code',
    'time_zone',
    'is_in_european_union'
  ].join(',')}) VALUES (${[
    sqlNumber(row.geoname_id),
    sqlString(row.locale_code),
    sqlString(row.continent_code),
    sqlString(row.continent_name),
    sqlString(row.country_iso_code),
    sqlString(row.country_name),
    sqlString(row.subdivision_1_iso_code),
    sqlString(row.subdivision_1_name),
    sqlString(row.subdivision_2_iso_code),
    sqlString(row.subdivision_2_name),
    sqlString(row.city_name),
    sqlNumber(row.metro_code),
    sqlString(row.time_zone),
    sqlBoolean(row.is_in_european_union)
  ].join(',')});\n`);
}

for (const file of args.cityBlocks) {
  for await (const row of readCsv(file)) {
    rowCount += 1;
    const range = cidrToRange(row.network);
    out.write(`INSERT OR REPLACE INTO geoip_networks (${[
      'id',
      'ip_version',
      'network',
      'start_ip_num',
      'end_ip_num',
      'geoname_id',
      'registered_country_geoname_id',
      'represented_country_geoname_id',
      'is_anonymous_proxy',
      'is_satellite_provider',
      'postal_code',
      'latitude',
      'longitude',
      'accuracy_radius',
      'metro_code',
      'time_zone'
    ].join(',')}) VALUES (${[
      sqlString(row.network),
      range.version,
      sqlString(row.network),
      sqlString(range.start),
      sqlString(range.end),
      sqlNumber(row.geoname_id),
      sqlNumber(row.registered_country_geoname_id),
      sqlNumber(row.represented_country_geoname_id),
      sqlBoolean(row.is_anonymous_proxy),
      sqlBoolean(row.is_satellite_provider),
      sqlString(row.postal_code),
      sqlNumber(row.latitude),
      sqlNumber(row.longitude),
      sqlNumber(row.accuracy_radius),
      sqlNumber(row.metro_code),
      sqlString(row.time_zone)
    ].join(',')});\n`);
  }
}

for (const file of args.asnBlocks) {
  for await (const row of readCsv(file)) {
    rowCount += 1;
    const range = cidrToRange(row.network);
    out.write(`INSERT OR REPLACE INTO geoip_asn_networks (${[
      'id',
      'ip_version',
      'network',
      'start_ip_num',
      'end_ip_num',
      'autonomous_system_number',
      'autonomous_system_organization'
    ].join(',')}) VALUES (${[
      sqlString(row.network),
      range.version,
      sqlString(row.network),
      sqlString(range.start),
      sqlString(range.end),
      sqlNumber(row.autonomous_system_number),
      sqlString(row.autonomous_system_organization)
    ].join(',')});\n`);
  }
}

out.write(`INSERT OR REPLACE INTO geoip_imports (id, source, edition, imported_at, row_count) VALUES (${[
  sqlString(new Date().toISOString()),
  sqlString('maxmind'),
  sqlString('GeoLite2-City-Country-ASN'),
  sqlString(new Date().toISOString()),
  rowCount
].join(',')});\n`);
out.write('COMMIT;\n');
out.end();

function parseArgs(argv) {
  const parsed = { cityBlocks: [], asnBlocks: [], locations: '', output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--city-blocks') {
      while (argv[index + 1] && !argv[index + 1].startsWith('--')) parsed.cityBlocks.push(argv[++index]);
    } else if (arg === '--asn-blocks') {
      while (argv[index + 1] && !argv[index + 1].startsWith('--')) parsed.asnBlocks.push(argv[++index]);
    } else if (arg === '--locations') {
      parsed.locations = argv[++index];
    } else if (arg === '--output') {
      parsed.output = argv[++index];
    }
  }
  return parsed;
}

async function* readCsv(file) {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }) });
  let header = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (header.length === 0) {
      header = cols;
      continue;
    }
    yield Object.fromEntries(header.map((key, index) => [key, cols[index] ?? '']));
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else current += char;
  }
  values.push(current);
  return values;
}

function cidrToRange(cidr) {
  const [ip, prefixRaw] = cidr.split('/');
  const prefix = Number(prefixRaw);
  const version = ip.includes(':') ? 6 : 4;
  const bits = version === 6 ? 128n : 32n;
  const base = version === 6 ? ipv6ToBigInt(ip) : ipv4ToBigInt(ip);
  const hostBits = bits - BigInt(prefix);
  const size = 1n << hostBits;
  const start = base & ~(size - 1n);
  const end = start + size - 1n;
  return { version, start: pad(start), end: pad(end) };
}

function ipv4ToBigInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8n) + BigInt(Number(part)), 0n);
}

function ipv6ToBigInt(ip) {
  const [leftRaw, rightRaw = ''] = ip.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  return groups.reduce((acc, group) => (acc << 16n) + BigInt(parseInt(group || '0', 16)), 0n);
}

function pad(value) {
  return value.toString(10).padStart(38, '0');
}

function sqlString(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return Number(value);
}

function sqlBoolean(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return value === '1' || value === 'true' ? 1 : 0;
}
```

- [ ] **Step 5: Create GitHub Actions workflow**

Create `.github/workflows/update-geoip.yml`:

```yaml
name: Update GeoLite2 D1

on:
  workflow_dispatch:
  schedule:
    - cron: "17 3 * * *"

jobs:
  update-geoip:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
      - run: npm ci
      - name: Download GeoLite2 archives
        env:
          MAXMIND_LICENSE_KEY: ${{ secrets.MAXMIND_LICENSE_KEY }}
          MAXMIND_ACCOUNT_ID: ${{ secrets.MAXMIND_ACCOUNT_ID }}
        run: |
          mkdir -p tmp/maxmind
          curl --fail --location --user "$MAXMIND_ACCOUNT_ID:$MAXMIND_LICENSE_KEY" \
            "https://download.maxmind.com/geoip/databases/GeoLite2-City-CSV/download?suffix=zip" \
            --output tmp/maxmind/city.zip
          curl --fail --location --user "$MAXMIND_ACCOUNT_ID:$MAXMIND_LICENSE_KEY" \
            "https://download.maxmind.com/geoip/databases/GeoLite2-ASN-CSV/download?suffix=zip" \
            --output tmp/maxmind/asn.zip
          unzip -q tmp/maxmind/city.zip -d tmp/maxmind/city
          unzip -q tmp/maxmind/asn.zip -d tmp/maxmind/asn
      - name: Convert GeoLite2 CSV to SQL
        run: |
          CITY_DIR="$(find tmp/maxmind/city -maxdepth 1 -type d -name 'GeoLite2-City-CSV_*' | head -1)"
          ASN_DIR="$(find tmp/maxmind/asn -maxdepth 1 -type d -name 'GeoLite2-ASN-CSV_*' | head -1)"
          node scripts/geoip/convert-geolite2.mjs \
            --city-blocks "$CITY_DIR/GeoLite2-City-Blocks-IPv4.csv" "$CITY_DIR/GeoLite2-City-Blocks-IPv6.csv" \
            --asn-blocks "$ASN_DIR/GeoLite2-ASN-Blocks-IPv4.csv" "$ASN_DIR/GeoLite2-ASN-Blocks-IPv6.csv" \
            --locations "$CITY_DIR/GeoLite2-City-Locations-en.csv" \
            --output tmp/maxmind/geoip.sql
      - name: Apply schema
        run: npx wrangler d1 execute netlens-geoip --remote --file=schema.sql
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      - name: Import generated SQL
        run: npx wrangler d1 execute netlens-geoip --remote --file=tmp/maxmind/geoip.sql
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

- [ ] **Step 6: Verify schema test**

Run: `npm test -- tests/geoip/schema.test.ts`

Expected: schema test passes.

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 7: Commit**

```bash
git add schema.sql scripts/geoip/convert-geolite2.mjs .github/workflows/update-geoip.yml tests/geoip/schema.test.ts
git commit -m "feat: add geoip d1 import workflow"
```

## Task 9: End-To-End Verification And Documentation

**Files:**
- Create: `README.md`
- Modify: `docs/superpowers/specs/2026-05-20-netlens-design.md` if implementation decisions changed.

- [ ] **Step 1: Create README**

Create `README.md`:

```md
# NetLens

NetLens is a lightweight Cloudflare Workers network inspection toolbox built with Hono and plain HTML/CSS/JavaScript.

## Tools

- IP Intelligence: defaults to the current visitor IP, or accepts explicit IPv4/IPv6 input. Geo and ASN data comes from MaxMind GeoLite2 in D1.
- DNS Lookup: queries Cloudflare DNS over HTTPS for common record types.
- RDAP Lookup: queries structured RDAP endpoints for domains and IPs.

## Development

```bash
npm install
npm test
npm run typecheck
npm run dev
```

## Cloudflare

Create a D1 database named `netlens-geoip`, update `wrangler.toml` with its database id, then apply:

```bash
npx wrangler d1 execute netlens-geoip --remote --file=schema.sql
```

## Secrets

GitHub Actions expects:

- `MAXMIND_ACCOUNT_ID`
- `MAXMIND_LICENSE_KEY`
- `CLOUDFLARE_API_TOKEN`
```

- [ ] **Step 2: Run full verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

Run: `npm run dev`

Expected: local Worker starts and renders the NetLens UI. Manually verify `/api/health`, `/api/ip`, `/api/dns?name=example.com`, and `/api/rdap?query=example.com`.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-05-20-netlens-design.md
git commit -m "docs: add netlens development guide"
```

## Self-Review

- Spec coverage: IP Intelligence, DNS lookup, RDAP lookup, Hono Worker runtime, D1 schema, GitHub Actions update flow, and framework-free UI each have tasks.
- Import coverage: the MaxMind task downloads GeoLite2 City and ASN archives, converts IPv4/IPv6 City blocks, ASN blocks, and English location rows into SQL, then imports the generated SQL into remote D1.
- Placeholder scan: all steps include concrete files, commands, and expected results. Text such as HTML `placeholder` attributes and SQL `WHERE` clauses are legitimate code content, not unfinished plan markers.
- Type consistency: route names use `/api/ip`, `/api/dns`, `/api/rdap`, and `/api/health`; the old `/api/visitor` route is not present.
