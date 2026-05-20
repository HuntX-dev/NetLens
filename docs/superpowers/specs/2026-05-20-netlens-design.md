# NetLens Design Spec

Date: 2026-05-20
Status: Draft approved for planning

## Goal

NetLens is a lightweight network inspection toolbox deployed on Cloudflare Workers. It uses Hono for routing, Cloudflare D1 for IP intelligence data, and plain HTML/CSS/JavaScript for the UI. The site exposes three independent tools that can be switched from one page:

1. IP intelligence lookup backed by MaxMind GeoLite2 data imported into D1.
2. Domain DNS record lookup through Cloudflare DNS over HTTPS.
3. WHOIS / RDAP lookup.

The product should feel minimal, technical, and fast. The chosen visual direction is a **Hybrid Terminal Dashboard**: terminal-like typography, dark technical surfaces, and raw JSON/record panels, balanced with shadcn-like spacing and hierarchy so primary facts remain easy to scan.

## Non-Goals

- No React, Vue, Svelte, or other client application framework.
- No user accounts, saved history, billing, or collaboration features.
- No backend service outside Cloudflare Workers for the main runtime.
- No live MaxMind download from Workers. MaxMind data is updated by GitHub Actions and queried from D1 at request time.
- No claim that DNS lookup can discover every record that exists at an authoritative nameserver. NetLens will enumerate a broad, explicit record type list and show what the resolver returns.

## Architecture

NetLens is a single Cloudflare Worker application:

- Hono serves the HTML shell and API routes.
- Static assets are embedded or served from the Worker bundle.
- The browser runs plain JavaScript to switch tools, submit forms, render summaries, and expand raw data.
- External lookups are made server-side from the Worker where possible, keeping response normalization in one place.
- D1 stores MaxMind GeoLite2 City, Country, and ASN data, plus import metadata.

Primary routes:

| Route | Purpose |
| --- | --- |
| `GET /` | Serve the app shell. |
| `GET /api/ip` | Return GeoLite2-backed IP intelligence for the current visitor IP. |
| `GET /api/ip?ip=1.1.1.1` | Return GeoLite2-backed IP intelligence for an explicit IP input. |
| `GET /api/dns?name=example.com` | Return aggregated DNS results for a domain. |
| `GET /api/rdap?query=example.com` | Return RDAP / WHOIS-oriented registration data. |
| `GET /api/health` | Return app, data version, and D1 availability status. |

## UI Design

The UI is one page with a compact top command bar:

- Brand: `NetLens`.
- Tool switcher: `IP`, `DNS`, `RDAP`.
- Small status area: Worker colo, GeoLite2 data version, and request latency.

Each tool follows the same information hierarchy:

1. **Primary summary**: the facts a user came for.
2. **Grouped details**: structured sections for related fields.
3. **Raw panel**: JSON or record-level output for completeness and debugging.
4. **Copy affordances**: copy IP, domain, JSON, or selected records.

The style should use:

- Dark base background with high-contrast text.
- Monospace for identifiers, IPs, domains, DNS records, and raw data.
- Sans-serif for labels and explanatory text.
- 8px or smaller radius for panels and controls.
- Subtle borders rather than heavy cards.
- No marketing hero, decorative gradients, or illustrative landing page.

## Feature 1: IP Intelligence

This is the default tool shown when a user first opens NetLens. On initial page load, it queries the current visitor IP. If the user enters an IP address, NetLens queries that explicit IP instead. In both cases, geolocation and network ownership must come from MaxMind GeoLite2 data in D1, not from Cloudflare's `request.cf` geolocation fields.

Cloudflare request metadata is still useful, but only as request diagnostics for the current visit. It should not be mixed into the IP intelligence result for an explicitly entered IP.

Primary fields:

- Queried IP address. Defaults to the visitor IP from `CF-Connecting-IP` when the `ip` query parameter is absent.
- Country, continent, subdivision, city, postal code, timezone, latitude, longitude, and accuracy radius from GeoLite2 City / Country.
- ASN, organization, and matched network from GeoLite2 ASN.
- Data version / import date.

Detailed fields:

- Registered country and represented country.
- Metro code when present.
- Traits available in GeoLite2 data.
- Matching network ranges from each MaxMind dataset.
- Raw D1 rows used to produce the result.

Current-visitor diagnostics:

When the tool is showing the current visitor IP, it may include an additional `requestDiagnostics` section sourced from Cloudflare Workers request data. This section explains how the current request reached the Worker; it is not the authoritative source for IP location.

Known Worker-accessible diagnostic fields from the provided sample:

| Group | Fields |
| --- | --- |
| Identity | `ip`, `headers.cf-connecting-ip`, `headers.x-real-ip` |
| Cloudflare location hints | `country`, `isEUCountry`, `city`, `continent`, `timezone`, `longitude`, `latitude`, `postalCode`, `headers.cf-ipcountry` |
| Network | `colo`, `asn`, `asOrganization`, `clientTcpRtt`, `clientQuicRtt`, `edgeL4.deliveryRate` |
| HTTP | `httpProtocol`, `clientAcceptEncoding`, `requestPriority`, `edgeRequestKeepAliveStatus`, `requestHeaderNames`, `headers` |
| TLS | `tlsVersion`, `tlsCipher`, `tlsClientRandom`, `tlsClientCiphersSha1`, `tlsClientExtensionsSha1`, `tlsClientExtensionsSha1Le`, `tlsClientHelloLength`, `tlsExportedAuthenticator` |
| Client certificate | `tlsClientAuth.certPresented`, `certVerified`, `certRevoked`, issuer / subject names, serials, fingerprints, validity dates, RFC9440 fields |
| Bot management | `botManagement.score`, `corporateProxy`, `verifiedBot`, `staticResource`, `ja3Hash`, `ja4`, `ja4Signals`, `jsDetection.passed`, `detectionIds`, `clientTrustScore`, `verifiedBotCategory` |
| Browser hints | `headers.user-agent`, `accept-language`, `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`, `sec-fetch-*`, `upgrade-insecure-requests` |

Output shape:

```json
{
  "ok": true,
  "query": {
    "ip": "47.129.35.106",
    "source": "current_visitor"
  },
  "primary": {
    "ip": "47.129.35.106",
    "country": "SG",
    "city": "Singapore",
    "asn": 16509,
    "organization": "Amazon Data Services Singapore"
  },
  "sections": {
    "location": {},
    "network": {},
    "matchedRanges": {},
    "requestDiagnostics": {}
  },
  "raw": {
    "d1": {},
    "request": {}
  }
}
```

Notes:

- Missing GeoLite2 rows must render as unavailable rather than errors.
- For explicit IP input, `requestDiagnostics` should be omitted or clearly labeled as current-session diagnostics, never as data about the queried IP.
- Cloudflare location hints may be displayed only under diagnostics for the current visitor. They must not override MaxMind values in the primary summary.
- The UI should treat TLS hashes, exported authenticators, certificate fields, and bot-management signals as advanced current-request details: searchable and copyable, but below the primary summary.
- Header rendering must mask or omit sensitive values such as cookies, authorization, and any future secret-bearing headers. The provided sample headers are safe to display, but the implementation should not assume all deployments are safe.
- `requestHeaderNames` may be an empty object; render it as empty rather than hiding the HTTP section.

## Feature 2: DNS Lookup

Cloudflare DNS over HTTPS endpoint:

`https://cloudflare-dns.com/dns-query`

NetLens should use the JSON format with `Accept: application/dns-json`. Cloudflare documents that each DNS query maps to one HTTP request, so NetLens will issue one request per record type and aggregate the results.

Default record type set:

- Address: `A`, `AAAA`
- Mail: `MX`
- Name delegation: `NS`, `SOA`, `DS`, `DNSKEY`
- Text and policy: `TXT`, `CAA`, `SPF`
- Service and aliasing: `CNAME`, `SRV`, `SVCB`, `HTTPS`
- Reverse-related / misc where useful: `PTR`, `NAPTR`, `TLSA`

Primary display:

- Resolution status summary.
- A / AAAA addresses.
- Nameservers.
- MX records.
- Security / policy records such as CAA, DS, DNSKEY.

Detailed display:

- All answers grouped by RR type.
- Authority and additional sections.
- TTLs and DNSSEC flags (`AD`, `CD`, `DO` when relevant).
- Resolver comments / extended DNS errors if returned.
- Raw response per RR type.

Edge behavior:

- Normalize domains with IDNA / punycode handling.
- Reject malformed domains before querying.
- Time out slow record type queries and show partial results.
- Preserve `NXDOMAIN`, `SERVFAIL`, and `NOERROR/NODATA` distinctions.

## Feature 3: WHOIS / RDAP Lookup

RDAP is the preferred protocol because it returns structured JSON over HTTPS. WHOIS is less uniform and often requires port 43 access, which is not a good fit for Workers. The Worker should therefore implement RDAP first and treat WHOIS as a compatibility label in the UI.

Lookup strategy:

- For domain names, query an RDAP bootstrap source or known RDAP endpoint.
- For IP addresses and ASNs, use RIR RDAP endpoints.
- Normalize RDAP entities, events, notices, links, nameservers, status values, and registration dates.

Primary display:

- Registered object name.
- Registrar / registry when available.
- Registration, update, and expiration dates.
- Status values.
- Nameservers for domains.
- Abuse contact when available.

Detailed display:

- Entities and roles.
- Event timeline.
- Notices and terms.
- Links.
- Raw RDAP JSON.

Future WHOIS option:

- If true WHOIS text output is required, add an explicit external WHOIS-over-HTTPS provider or a separate backend later. This is intentionally outside the first implementation so the Cloudflare Worker remains self-contained.

## GeoIP Data With MaxMind + D1

The IP intelligence feature should use the broadest GeoLite2 coverage available:

- GeoLite2 City
- GeoLite2 Country
- GeoLite2 ASN

### D1 Data Model

The schema should favor predictable point lookup by numeric IP range.

Tables:

- `geoip_imports`
  - `id`
  - `source`
  - `edition`
  - `build_epoch`
  - `imported_at`
  - `row_count`
  - `checksum`

- `geoip_networks`
  - `id`
  - `ip_version`
  - `network`
  - `start_ip_num`
  - `end_ip_num`
  - `geoname_id`
  - `registered_country_geoname_id`
  - `represented_country_geoname_id`
  - `is_anonymous_proxy`
  - `is_satellite_provider`
  - `postal_code`
  - `latitude`
  - `longitude`
  - `accuracy_radius`
  - `metro_code`
  - `time_zone`

- `geoip_asn_networks`
  - `id`
  - `ip_version`
  - `network`
  - `start_ip_num`
  - `end_ip_num`
  - `autonomous_system_number`
  - `autonomous_system_organization`

- `geoip_locations`
  - `geoname_id`
  - `locale_code`
  - `continent_code`
  - `continent_name`
  - `country_iso_code`
  - `country_name`
  - `subdivision_1_iso_code`
  - `subdivision_1_name`
  - `subdivision_2_iso_code`
  - `subdivision_2_name`
  - `city_name`
  - `metro_code`
  - `time_zone`
  - `is_in_european_union`

Indexes:

- `(ip_version, start_ip_num, end_ip_num)` on network tables.
- `geoname_id` on locations.
- `(edition, imported_at)` on import metadata.

IPv4 can be stored as an integer. IPv6 should be stored as sortable fixed-width text or split high/low integer-compatible parts, because JavaScript number precision is not safe for 128-bit integers.

### GitHub Actions Data Update

The daily update workflow should:

1. Run once per day and support manual dispatch.
2. Download GeoLite2 City, Country, and ASN using MaxMind license credentials stored in GitHub Secrets.
3. Verify archive checksums when available.
4. Convert CSV ranges into SQL import files.
5. Import to a staging set of D1 tables or use versioned import IDs.
6. Validate row counts and sample lookups.
7. Promote the new import metadata.
8. Clean old import versions according to a retention policy.

Wrangler should import SQL into remote D1 using `wrangler d1 execute --remote --file=...`.

## API Response Pattern

All API routes should return a common envelope:

```json
{
  "ok": true,
  "query": {},
  "summary": {},
  "sections": [],
  "raw": {},
  "meta": {
    "latencyMs": 12,
    "source": "cloudflare-doh",
    "partial": false
  }
}
```

Error responses:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_input",
    "message": "Enter a valid domain name."
  },
  "meta": {
    "latencyMs": 1
  }
}
```

Common error codes:

- `invalid_input`
- `not_found`
- `upstream_timeout`
- `upstream_error`
- `partial_result`
- `d1_unavailable`
- `rate_limited`

## Validation And Limits

- Domain inputs must be trimmed, lowercased where safe, and converted through IDNA handling.
- IP inputs must support IPv4 and IPv6.
- DNS lookup should cap the number of record type queries per request.
- RDAP responses should have timeout and size limits.
- Raw output should be escaped and rendered as text, never injected as HTML.
- Worker responses should be cache-aware only where safe. The default current-visitor IP response should not be shared-cacheable because it depends on the incoming request identity. Explicit IP lookups may be cacheable when they do not include request diagnostics.

## Testing Strategy

Unit-level tests:

- Domain validation.
- IP parsing and numeric conversion.
- DNS response normalization.
- RDAP response normalization.
- D1 range lookup query construction.

Integration tests:

- Hono routes return the common envelope.
- DNS route handles `NOERROR`, `NXDOMAIN`, and partial timeout cases.
- IP route returns merged City / Country / ASN data for both default current-visitor lookup and explicit IP input.
- IP route tolerates missing Cloudflare diagnostic fields because the authoritative IP intelligence comes from D1.

UI tests:

- Tool switching works without a framework.
- Long DNS records and raw JSON do not overflow the layout.
- Mobile viewport keeps forms and results readable.

Operational checks:

- GitHub Action can run manually.
- D1 import validates row counts and sample IP lookups.
- `/api/health` exposes current GeoLite2 import metadata.

## Documentation To Maintain

- `README.md`: product overview, local development, deployment, secrets.
- `docs/architecture.md`: Worker, API, D1, and data update architecture.
- `docs/api.md`: request and response contracts.
- `docs/geoip-data.md`: MaxMind editions, D1 schema, import workflow.
- `docs/ui.md`: Hybrid Terminal Dashboard style guide and information hierarchy.
- `.github/workflows/update-geoip.yml`: documented in comments once implemented.

## Open Inputs Needed Later

- MaxMind account/license setup details.
- Cloudflare account, D1 database name, and Worker name.
- Whether RDAP-only is acceptable for the first release or whether true WHOIS text must be added through an external provider.

## References

- Cloudflare DNS over HTTPS JSON format: https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/
- Cloudflare DNS over HTTPS endpoint behavior: https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/
- Cloudflare Workers `request.cf` metadata: https://developers.cloudflare.com/workers/runtime-apis/request/
- Cloudflare D1 import/export: https://developers.cloudflare.com/d1/best-practices/import-export-data/
- Cloudflare D1 Worker API and SQL compatibility: https://developers.cloudflare.com/d1/
