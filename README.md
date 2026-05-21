# NetLens

[English](README.md) | [简体中文](README.zh-CN.md)

🔎 NetLens is a lightweight network inspection toolbox built for Cloudflare Workers. It gives you IP intelligence, DNS lookup, and RDAP lookup from one plain HTML/CSS/JavaScript interface.

🌐 Live site: [net.huntx.dev](https://net.huntx.dev)

## ✨ Features

- 🌍 **IP Intelligence**: looks up IPv4 and IPv6 addresses with MaxMind GeoLite2 data stored in Cloudflare D1.
- 🧭 **DNS Lookup**: aggregates Cloudflare DNS over HTTPS responses across common record types.
- 🪪 **RDAP Lookup**: fetches structured registration data for domains, IP addresses, and ASNs.
- ⚡ **Fast GeoIP queries**: uses indexed range lookups for City and ASN data.
- 🔁 **Safer GeoIP updates**: imports into shadow tables first, then swaps them into place to avoid long downtime windows.
- 🚀 **GitHub Actions deployment**: pushes to `main` can automatically deploy the Worker to Cloudflare.

## 🧰 API Routes

| Route | Purpose |
| --- | --- |
| `GET /api/ip` | Look up the current visitor IP from `CF-Connecting-IP`. |
| `GET /api/ip?ip=1.1.1.1` | Look up an explicit IPv4 or IPv6 address. |
| `GET /api/dns?name=example.com` | Query common DNS record types. |
| `GET /api/rdap?query=example.com` | Query RDAP for a domain. |
| `GET /api/rdap?query=1.1.1.1` | Query RDAP for an IP address. |
| `GET /api/rdap?query=AS13335` | Query RDAP for an ASN. |
| `GET /api/health` | Basic Worker health check. |

## 🧪 Local Development

Install dependencies:

```sh
npm install
```

Start a local Worker:

```sh
npm run dev
```

Open:

```text
http://127.0.0.1:8787
```

Run checks:

```sh
npm test
npm run typecheck
```

Common smoke checks:

```sh
curl http://localhost:8787/api/health
curl "http://localhost:8787/api/dns?name=example.com"
curl "http://localhost:8787/api/rdap?query=example.com"
curl "http://localhost:8787/api/ip?ip=1.1.1.1"
```

The IP smoke check requires local D1 schema and GeoLite2 data. Without seeded data, a valid IP request may return `not_found`.

## 🌍 Tool Behavior

### IP Intelligence

IP lookups query D1 tables populated from GeoLite2 City and ASN CSV data. Range bounds are stored as sortable fixed-width 39-character decimal strings so IPv4 and IPv6 can share predictable lookup behavior without JavaScript number precision loss.

The repository performs two indexed point-style range lookups:

1. Find the nearest City network by `ip_version` and descending `start_ip_num`, then verify `end_ip_num`.
2. Find the nearest ASN network the same way, then verify `end_ip_num`.

When `/api/ip` is called without `?ip=`, the Worker uses the `CF-Connecting-IP` header. Plain local requests to `wrangler dev` may not include that header, so use an explicit query such as `/api/ip?ip=1.1.1.1` while developing.

### DNS Lookup

DNS lookup validates a domain name and queries Cloudflare DNS over HTTPS once per supported record type. The normalized status is one of:

- `ok`: all transport requests completed without DNS errors.
- `nxdomain`: completed responses report NXDOMAIN.
- `partial`: at least one record-type request failed at the transport layer.
- `problem`: at least one completed DNS response returned a non-zero status other than NXDOMAIN.
- `failed`: all record-type requests failed.

Default record types: `A`, `AAAA`, `MX`, `NS`, `SOA`, `TXT`, `CAA`, `CNAME`, `SRV`, `SVCB`, `HTTPS`, `DS`, `DNSKEY`, and `TLSA`.

### RDAP Lookup

RDAP is the Worker-friendly WHOIS-compatible path. NetLens routes through `rdap.org`:

- Domains: `https://rdap.org/domain/<name>`
- IPs: `https://rdap.org/ip/<ip>`
- ASNs: `https://rdap.org/autnum/<asn>`

Inputs may be domains, IPv4/IPv6 addresses, bare ASN numbers, or `AS`-prefixed ASN values.

## 🗄️ Cloudflare D1 Setup

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

Apply the schema:

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

## 🔁 GeoLite2 Updates

`.github/workflows/update-geoip.yml` runs daily at `03:17 UTC` and can also be started manually.

The workflow:

- downloads GeoLite2 City and ASN CSV archives
- records archive checksums in import metadata
- converts CSV rows into D1-compatible SQL
- validates the generated SQL
- applies `schema.sql`
- imports the generated SQL into remote D1

The converter imports into `geoip_*_next` shadow tables, builds indexes there, then swaps them into the live table names with a short rename transaction. This keeps the old data available during most of the update process.

Required GitHub Secrets:

- `MAXMIND_ACCOUNT_ID`
- `MAXMIND_LICENSE_KEY`
- `CLOUDFLARE_API_TOKEN`

The Cloudflare token must be able to execute D1 commands for the target account/database.

## 🚀 Deployment

Run a dry run before deploying:

```sh
npx wrangler deploy --dry-run
```

Deploy manually:

```sh
npm run deploy
```

Pushes to `main` can deploy automatically through `.github/workflows/deploy-worker.yml` using `CLOUDFLARE_API_TOKEN`.

The current Worker route is configured in `wrangler.toml`:

```toml
routes = [
  { pattern = "net.huntx.dev", custom_domain = true }
]
```
