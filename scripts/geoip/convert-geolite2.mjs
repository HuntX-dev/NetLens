import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { finished } from 'node:stream/promises';

const DECIMAL_WIDTH = 39;

const args = parseArgs(process.argv.slice(2));
if (!args.output || args.cityBlocks.length === 0 || args.asnBlocks.length === 0 || !args.locations) {
  console.error(
    'Usage: node scripts/geoip/convert-geolite2.mjs --city-blocks <csv...> --asn-blocks <csv...> --locations <csv> --output <sql> [--source <source>] [--build-epoch <epoch>] [--checksum <checksum>] [--imported-at <iso>]'
  );
  process.exit(1);
}

await mkdir(dirname(args.output), { recursive: true });
const out = createWriteStream(args.output, { encoding: 'utf8' });
const importedAt = args.importedAt || new Date().toISOString();
const importId = args.buildEpoch ? `${importedAt}-${args.buildEpoch}` : importedAt;
let rowCount = 0;

out.write('BEGIN TRANSACTION;\n');
out.write('DELETE FROM geoip_networks;\n');
out.write('DELETE FROM geoip_asn_networks;\n');
out.write('DELETE FROM geoip_locations;\n');

for await (const row of readCsv(args.locations)) {
  rowCount += 1;
  writeInsert(out, 'geoip_locations', [
    ['geoname_id', sqlNumber(row.geoname_id)],
    ['locale_code', sqlString(row.locale_code)],
    ['continent_code', sqlString(row.continent_code)],
    ['continent_name', sqlString(row.continent_name)],
    ['country_iso_code', sqlString(row.country_iso_code)],
    ['country_name', sqlString(row.country_name)],
    ['subdivision_1_iso_code', sqlString(row.subdivision_1_iso_code)],
    ['subdivision_1_name', sqlString(row.subdivision_1_name)],
    ['subdivision_2_iso_code', sqlString(row.subdivision_2_iso_code)],
    ['subdivision_2_name', sqlString(row.subdivision_2_name)],
    ['city_name', sqlString(row.city_name)],
    ['metro_code', sqlNumber(row.metro_code)],
    ['time_zone', sqlString(row.time_zone)],
    ['is_in_european_union', sqlBoolean(row.is_in_european_union)]
  ]);
}

for (const file of args.cityBlocks) {
  for await (const row of readCsv(file)) {
    rowCount += 1;
    const range = cidrToRange(row.network);
    writeInsert(out, 'geoip_networks', [
      ['id', sqlString(row.network)],
      ['ip_version', range.version],
      ['network', sqlString(row.network)],
      ['start_ip_num', sqlString(range.start)],
      ['end_ip_num', sqlString(range.end)],
      ['geoname_id', sqlNumber(row.geoname_id)],
      ['registered_country_geoname_id', sqlNumber(row.registered_country_geoname_id)],
      ['represented_country_geoname_id', sqlNumber(row.represented_country_geoname_id)],
      ['is_anonymous_proxy', sqlBoolean(row.is_anonymous_proxy)],
      ['is_satellite_provider', sqlBoolean(row.is_satellite_provider)],
      ['postal_code', sqlString(row.postal_code)],
      ['latitude', sqlNumber(row.latitude)],
      ['longitude', sqlNumber(row.longitude)],
      ['accuracy_radius', sqlNumber(row.accuracy_radius)],
      ['metro_code', sqlNumber(row.metro_code)],
      ['time_zone', sqlString(row.time_zone)]
    ]);
  }
}

for (const file of args.asnBlocks) {
  for await (const row of readCsv(file)) {
    rowCount += 1;
    const range = cidrToRange(row.network);
    writeInsert(out, 'geoip_asn_networks', [
      ['id', sqlString(row.network)],
      ['ip_version', range.version],
      ['network', sqlString(row.network)],
      ['start_ip_num', sqlString(range.start)],
      ['end_ip_num', sqlString(range.end)],
      ['autonomous_system_number', sqlNumber(row.autonomous_system_number)],
      ['autonomous_system_organization', sqlString(row.autonomous_system_organization)]
    ]);
  }
}

writeInsert(out, 'geoip_imports', [
  ['id', sqlString(importId)],
  ['source', sqlString(args.source || 'maxmind')],
  ['edition', sqlString('GeoLite2-City-ASN')],
  ['build_epoch', sqlNumber(args.buildEpoch)],
  ['imported_at', sqlString(importedAt)],
  ['row_count', rowCount],
  ['checksum', sqlString(args.checksum)]
]);
out.write('COMMIT;\n');
out.end();
await finished(out);

function parseArgs(argv) {
  const parsed = {
    cityBlocks: [],
    asnBlocks: [],
    locations: '',
    output: '',
    source: '',
    buildEpoch: '',
    checksum: '',
    importedAt: ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--city-blocks') {
      while (argv[index + 1] && !argv[index + 1].startsWith('--')) {
        parsed.cityBlocks.push(argv[++index]);
      }
    } else if (arg === '--asn-blocks') {
      while (argv[index + 1] && !argv[index + 1].startsWith('--')) {
        parsed.asnBlocks.push(argv[++index]);
      }
    } else if (arg === '--locations') {
      parsed.locations = argv[++index] ?? '';
    } else if (arg === '--output') {
      parsed.output = argv[++index] ?? '';
    } else if (arg === '--source') {
      parsed.source = argv[++index] ?? '';
    } else if (arg === '--build-epoch') {
      parsed.buildEpoch = argv[++index] ?? '';
    } else if (arg === '--checksum') {
      parsed.checksum = argv[++index] ?? '';
    } else if (arg === '--imported-at') {
      parsed.importedAt = argv[++index] ?? '';
    }
  }
  return parsed;
}

async function* readCsv(file) {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  let header = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (header.length === 0) {
      header = cols.map((column) => column.replace(/^\uFEFF/, ''));
      continue;
    }
    yield Object.fromEntries(header.map((key, index) => [key, cols[index] ?? '']));
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function cidrToRange(cidr) {
  const [ip, prefixRaw] = cidr.split('/');
  const version = ip.includes(':') ? 6 : 4;
  const bits = version === 6 ? 128n : 32n;
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || BigInt(prefix) > bits) {
    throw new Error(`Invalid CIDR prefix: ${cidr}`);
  }

  const base = version === 6 ? ipv6ToBigInt(ip) : ipv4ToBigInt(ip);
  const size = 1n << (bits - BigInt(prefix));
  const start = base & ~(size - 1n);
  const end = start + size - 1n;
  return { version, start: pad(start), end: pad(end) };
}

function ipv4ToBigInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8n) + BigInt(parseIpv4Part(part)), 0n);
}

function ipv6ToBigInt(ip) {
  const normalizedIp = normalizeIpv4Tail(ip);
  const [leftRaw, rightRaw = ''] = normalizedIp.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) throw new Error(`Invalid IPv6 address: ${ip}`);

  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  if (groups.length !== 8) throw new Error(`Invalid IPv6 address: ${ip}`);

  return groups.reduce((acc, group) => {
    const value = parseInt(group || '0', 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new Error(`Invalid IPv6 group: ${group}`);
    }
    return (acc << 16n) + BigInt(value);
  }, 0n);
}

function normalizeIpv4Tail(ip) {
  if (!ip.includes('.')) return ip;

  const tailStart = ip.lastIndexOf(':') + 1;
  const prefix = ip.slice(0, tailStart);
  const value = ipv4ToBigInt(ip.slice(tailStart));
  const high = Number((value >> 16n) & 0xffffn).toString(16);
  const low = Number(value & 0xffffn).toString(16);
  return `${prefix}${high}:${low}`;
}

function parseIpv4Part(part) {
  const value = Number(part);
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`Invalid IPv4 segment: ${part}`);
  }
  return value;
}

function pad(value) {
  return value.toString(10).padStart(DECIMAL_WIDTH, '0');
}

function writeInsert(out, table, columns) {
  out.write(
    `INSERT OR REPLACE INTO ${table} (${columns.map(([column]) => column).join(',')}) VALUES (${columns
      .map(([, value]) => value)
      .join(',')});\n`
  );
}

function sqlString(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid number: ${value}`);
  return String(number);
}

function sqlBoolean(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return value === '1' || value === 'true' ? '1' : '0';
}
