# NetLens

NetLens is a lightweight network inspection toolbox for Cloudflare Workers. It provides three tools from one plain HTML/CSS/JavaScript interface:

- **IP Intelligence**: looks up IPv4 and IPv6 addresses against MaxMind GeoLite2 data stored in Cloudflare D1.
- **DNS Lookup**: aggregates Cloudflare DNS over HTTPS JSON responses across common record types.
- **RDAP Lookup**: fetches structured registration data for domains, IP addresses, and ASNs.

The Worker exposes these API routes:

- `GET /api/ip` for the current visitor IP from `CF-Connecting-IP`.
- `GET /api/ip?ip=1.1.1.1` for an explicit IP lookup.
- `GET /api/dns?name=example.com` for DNS records.
- `GET /api/rdap?query=example.com`, `?query=1.1.1.1`, or `?query=AS13335` for RDAP.
- `GET /api/health` for basic Worker health.

## Tools And Behavior

### IP Intelligence

IP lookups query D1 tables populated from GeoLite2 City and ASN CSV data. Range bounds are stored as sortable fixed-width 39-character decimal strings so IPv4 and IPv6 can share predictable lookup behavior without JavaScript number precision loss.

When `/api/ip` is called without `?ip=`, the Worker uses the `CF-Connecting-IP` header. Plain local requests to `wrangler dev` may not include that header, so the route can return `invalid_input` locally. Use an explicit query such as `/api/ip?ip=1.1.1.1` while developing.

If D1 has not been seeded with GeoLite2 data, valid IP requests can return `not_found`. Apply `schema.sql` and import converted GeoLite2 SQL before expecting IP intelligence results.

### DNS Lookup

DNS lookup validates a domain name and queries Cloudflare DNS over HTTPS once per supported record type. The normalized status is one of:

- `ok`: all transport requests completed without DNS errors.
- `nxdomain`: completed responses report NXDOMAIN.
- `partial`: at least one record-type request failed at the transport layer.
- `problem`: at least one completed DNS response returned a non-zero status other than NXDOMAIN.
- `failed`: all record-type requests failed.

The default record types are `A`, `AAAA`, `MX`, `NS`, `SOA`, `TXT`, `CAA`, `CNAME`, `SRV`, `SVCB`, `HTTPS`, `DS`, `DNSKEY`, and `TLSA`.

### RDAP Lookup

RDAP is used as the Worker-friendly WHOIS-compatible path. NetLens routes through `rdap.org`:

- Domains: `https://rdap.org/domain/<name>`
- IPs: `https://rdap.org/ip/<ip>`
- ASNs: `https://rdap.org/autnum/<asn>`

Inputs may be domains, IPv4/IPv6 addresses, bare ASN numbers, or `AS`-prefixed ASN values.

## Development

Install dependencies:

```sh
npm install
```

Run the test suite:

```sh
npm test
```

Run TypeScript checks:

```sh
npm run typecheck
```

Start a local Worker:

```sh
npm run dev
```

Common local smoke checks:

```sh
curl http://localhost:8787/api/health
curl "http://localhost:8787/api/dns?name=example.com"
curl "http://localhost:8787/api/rdap?query=example.com"
curl "http://localhost:8787/api/ip?ip=1.1.1.1"
```

The IP smoke check requires local D1 schema and GeoLite2 data. Without seeded data, a valid response may be `not_found`.

## Cloudflare D1 Setup

Create the D1 database:

```sh
npx wrangler d1 create netlens-geoip
```

Copy the returned database ID into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "netlens-geoip"
database_id = "replace-with-cloudflare-d1-database-id"
```

Apply the schema locally or remotely:

```sh
npx wrangler d1 execute netlens-geoip --local --file=schema.sql
npx wrangler d1 execute netlens-geoip --remote --file=schema.sql
```

Generate GeoLite2 SQL from downloaded MaxMind CSV files:

```sh
node scripts/geoip/convert-geolite2.mjs \
  --city-blocks path/to/GeoLite2-City-Blocks-IPv4.csv path/to/GeoLite2-City-Blocks-IPv6.csv \
  --asn-blocks path/to/GeoLite2-ASN-Blocks-IPv4.csv path/to/GeoLite2-ASN-Blocks-IPv6.csv \
  --locations path/to/GeoLite2-City-Locations-en.csv \
  --source "manual" \
  --build-epoch 0 \
  --checksum "manual" \
  --output tmp/maxmind/geoip.sql
```

Import generated SQL:

```sh
npx wrangler d1 execute netlens-geoip --local --file=tmp/maxmind/geoip.sql
npx wrangler d1 execute netlens-geoip --remote --file=tmp/maxmind/geoip.sql
```

## GeoLite2 Updates

`.github/workflows/update-geoip.yml` runs daily at `03:17 UTC` and can also be started manually. The workflow downloads GeoLite2 City and ASN CSV archives, records archive checksums in import metadata, converts CSV rows into D1-compatible SQL, validates that expected inserts exist, applies `schema.sql`, and imports the generated SQL into remote D1.

Required GitHub Secrets:

- `MAXMIND_ACCOUNT_ID`
- `MAXMIND_LICENSE_KEY`
- `CLOUDFLARE_API_TOKEN`

The Cloudflare token must be able to execute D1 commands for the target account/database.

## Deployment

Run a dry run before deploying:

```sh
npx wrangler deploy --dry-run
```

Deploy:

```sh
npm run deploy
```

Before production deployment, replace the `wrangler.toml` D1 `database_id` placeholder with the real Cloudflare D1 database ID and ensure remote D1 has both schema and GeoLite2 data imported.
