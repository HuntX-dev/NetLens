# NetLens

[English](README.md) | [简体中文](README.zh-CN.md)

🔎 NetLens 是一个运行在 Cloudflare Workers 上的轻量网络信息查询工具。它用一个原生 HTML/CSS/JavaScript 界面提供 IP 情报、DNS 查询和 RDAP 查询。

## ✨ 功能特性

- 🌍 **IP 情报**：基于存储在 Cloudflare D1 中的 MaxMind GeoLite2 数据查询 IPv4 / IPv6。
- 🧭 **DNS 查询**：通过 Cloudflare DNS over HTTPS 聚合常见 DNS 记录类型。
- 🪪 **RDAP 查询**：查询域名、IP 地址和 ASN 的结构化注册信息。
- ⚡ **更快的 GeoIP 查询**：City 和 ASN 数据使用索引范围查询。
- 🔁 **更稳的 GeoIP 更新**：先导入影子表，再快速切换到正式表，减少更新期间不可用窗口。
- 🚀 **GitHub Actions 自动部署**：推送到 `main` 后可自动部署到 Cloudflare Workers。

## 🧰 API 路由

| 路由 | 用途 |
| --- | --- |
| `GET /api/ip` | 从 `CF-Connecting-IP` 查询当前访问者 IP。 |
| `GET /api/ip?ip=1.1.1.1` | 查询指定 IPv4 或 IPv6 地址。 |
| `GET /api/dns?name=example.com` | 查询常见 DNS 记录类型。 |
| `GET /api/rdap?query=example.com` | 查询域名 RDAP。 |
| `GET /api/rdap?query=1.1.1.1` | 查询 IP 地址 RDAP。 |
| `GET /api/rdap?query=AS13335` | 查询 ASN RDAP。 |
| `GET /api/health` | Worker 健康检查。 |

## 🧪 本地开发

安装依赖：

```sh
npm install
```

启动本地 Worker：

```sh
npm run dev
```

打开：

```text
http://127.0.0.1:8787
```

运行检查：

```sh
npm test
npm run typecheck
```

常用冒烟测试：

```sh
curl http://localhost:8787/api/health
curl "http://localhost:8787/api/dns?name=example.com"
curl "http://localhost:8787/api/rdap?query=example.com"
curl "http://localhost:8787/api/ip?ip=1.1.1.1"
```

IP 冒烟测试依赖本地 D1 schema 和 GeoLite2 数据。如果还没有导入数据，合法 IP 请求可能返回 `not_found`。

## 🌍 工具行为

### IP 情报

IP 查询会读取由 GeoLite2 City 和 ASN CSV 数据导入的 D1 表。IP 范围边界被保存为固定宽度 39 位十进制字符串，让 IPv4 和 IPv6 可以共用稳定的排序和查询逻辑，同时避免 JavaScript 数字精度问题。

查询流程分为两个带索引的范围查找：

1. 按 `ip_version` 和倒序 `start_ip_num` 找到最接近的 City 网络，再校验 `end_ip_num`。
2. ASN 网络也使用同样方式查找并校验 `end_ip_num`。

当 `/api/ip` 没有传 `?ip=` 时，Worker 会使用 `CF-Connecting-IP` 请求头。普通本地 `wrangler dev` 请求通常没有这个头，所以开发时建议使用显式查询，例如 `/api/ip?ip=1.1.1.1`。

### DNS 查询

DNS 查询会校验域名，并对每个支持的记录类型请求一次 Cloudflare DNS over HTTPS。返回状态包括：

- `ok`：所有传输请求完成且没有 DNS 错误。
- `nxdomain`：完成的响应报告 NXDOMAIN。
- `partial`：至少一个记录类型出现传输层失败。
- `problem`：至少一个完成的 DNS 响应返回非 0 状态，且不是 NXDOMAIN。
- `failed`：所有记录类型请求都失败。

默认记录类型：`A`、`AAAA`、`MX`、`NS`、`SOA`、`TXT`、`CAA`、`CNAME`、`SRV`、`SVCB`、`HTTPS`、`DS`、`DNSKEY`、`TLSA`。

### RDAP 查询

RDAP 是适合 Worker 环境的 WHOIS 兼容查询方式。NetLens 通过 `rdap.org` 查询：

- 域名：`https://rdap.org/domain/<name>`
- IP：`https://rdap.org/ip/<ip>`
- ASN：`https://rdap.org/autnum/<asn>`

输入可以是域名、IPv4/IPv6 地址、纯数字 ASN，或带 `AS` 前缀的 ASN。

## 🗄️ Cloudflare D1 设置

创建 D1 数据库：

```sh
npx wrangler d1 create netlens-geoip
```

把返回的数据库 ID 写入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "netlens-geoip"
database_id = "replace-with-cloudflare-d1-database-id"
```

应用 schema：

```sh
npx wrangler d1 execute netlens-geoip --local --file=schema.sql
npx wrangler d1 execute netlens-geoip --remote --file=schema.sql
```

从 MaxMind CSV 生成 GeoLite2 SQL：

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

导入生成的 SQL：

```sh
npx wrangler d1 execute netlens-geoip --local --file=tmp/maxmind/geoip.sql
npx wrangler d1 execute netlens-geoip --remote --file=tmp/maxmind/geoip.sql
```

## 🔁 GeoLite2 更新

`.github/workflows/update-geoip.yml` 每天 `03:17 UTC` 自动运行，也可以手动触发。

该流程会：

- 下载 GeoLite2 City 和 ASN CSV 压缩包
- 把压缩包 checksum 记录进导入元数据
- 把 CSV 转换为 D1 可执行 SQL
- 校验生成的 SQL
- 应用 `schema.sql`
- 把生成的 SQL 导入远端 D1

转换器会把新数据导入 `geoip_*_next` 影子表，在影子表上建好索引，然后用很短的 rename 事务切换到正式表名。这样更新的大部分时间里，旧数据仍然可用。

需要的 GitHub Secrets：

- `MAXMIND_ACCOUNT_ID`
- `MAXMIND_LICENSE_KEY`
- `CLOUDFLARE_API_TOKEN`

Cloudflare token 需要具备目标账号/数据库的 D1 执行权限。

## 🚀 部署

部署前 dry run：

```sh
npx wrangler deploy --dry-run
```

手动部署：

```sh
npm run deploy
```

推送到 `main` 后，可以通过 `.github/workflows/deploy-worker.yml` 使用 `CLOUDFLARE_API_TOKEN` 自动部署。

当前 Worker 自定义域名配置在 `wrangler.toml`：

```toml
routes = [
  { pattern = "net.huntx.dev", custom_domain = true }
]
```
