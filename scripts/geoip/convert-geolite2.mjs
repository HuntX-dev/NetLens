import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { finished } from 'node:stream/promises';

const DECIMAL_WIDTH = 39;
const MAX_INSERT_STATEMENT_BYTES = 80_000;
const TABLES = {
  imports: 'geoip_imports',
  locations: 'geoip_locations_next',
  networks: 'geoip_networks_next',
  asnNetworks: 'geoip_asn_networks_next'
};

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
const stats = {
  locations: 0,
  networks: 0,
  asnNetworks: 0,
  metadataRows: 0,
  insertStatements: 0
};
let currentInsertBatch = null;

writeStagingPreamble(out);
writeStagingIndexes(out);

for await (const row of readCsv(args.locations)) {
  rowCount += 1;
  stats.locations += 1;
  writeInsert(out, TABLES.locations, [
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
    stats.networks += 1;
    const range = cidrToRange(row.network);
    writeInsert(out, TABLES.networks, [
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
    stats.asnNetworks += 1;
    const range = cidrToRange(row.network);
    writeInsert(out, TABLES.asnNetworks, [
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

stats.metadataRows += 1;
flushInsertBatch(out);
writeInsert(out, TABLES.imports, [
  ['id', sqlString(importId)],
  ['source', sqlString(args.source || 'maxmind')],
  ['edition', sqlString('GeoLite2-City-ASN')],
  ['build_epoch', sqlNumber(args.buildEpoch)],
  ['imported_at', sqlString(importedAt)],
  ['row_count', rowCount],
  ['checksum', sqlString(args.checksum)]
]);
flushInsertBatch(out);
writeSwap(out);
out.write(
  `-- netlens-import total_rows=${rowCount} locations=${stats.locations} networks=${stats.networks} asn_networks=${stats.asnNetworks} metadata_rows=${stats.metadataRows} insert_statements=${stats.insertStatements} max_insert_statement_bytes=${MAX_INSERT_STATEMENT_BYTES}\n`
);
out.end();
await finished(out);
console.log(
  `Generated GeoIP import: total_rows=${rowCount} locations=${stats.locations} networks=${stats.networks} asn_networks=${stats.asnNetworks} metadata_rows=${stats.metadataRows} insert_statements=${stats.insertStatements} max_insert_statement_bytes=${MAX_INSERT_STATEMENT_BYTES}`
);

function writeStagingPreamble(out) {
  out.write(`DROP TABLE IF EXISTS ${TABLES.networks};\n`);
  out.write(`DROP TABLE IF EXISTS ${TABLES.asnNetworks};\n`);
  out.write(`DROP TABLE IF EXISTS ${TABLES.locations};\n`);
  out.write(`CREATE TABLE ${TABLES.networks} (
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
);\n`);
  out.write(`CREATE TABLE ${TABLES.asnNetworks} (
  id TEXT PRIMARY KEY,
  ip_version INTEGER NOT NULL,
  network TEXT NOT NULL,
  start_ip_num TEXT NOT NULL,
  end_ip_num TEXT NOT NULL,
  autonomous_system_number INTEGER,
  autonomous_system_organization TEXT
);\n`);
  out.write(`CREATE TABLE ${TABLES.locations} (
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
);\n`);
}

function writeStagingIndexes(out) {
  out.write(`CREATE INDEX idx_geoip_networks_next_range
  ON ${TABLES.networks} (ip_version, start_ip_num, end_ip_num);\n`);
  out.write(`CREATE INDEX idx_geoip_networks_next_start_desc
  ON ${TABLES.networks} (ip_version, start_ip_num DESC);\n`);
  out.write(`CREATE INDEX idx_geoip_asn_networks_next_range
  ON ${TABLES.asnNetworks} (ip_version, start_ip_num, end_ip_num);\n`);
  out.write(`CREATE INDEX idx_geoip_asn_networks_next_start_desc
  ON ${TABLES.asnNetworks} (ip_version, start_ip_num DESC);\n`);
}

function writeSwap(out) {
  out.write('ALTER TABLE geoip_networks RENAME TO geoip_networks_old;\n');
  out.write('ALTER TABLE geoip_asn_networks RENAME TO geoip_asn_networks_old;\n');
  out.write('ALTER TABLE geoip_locations RENAME TO geoip_locations_old;\n');
  out.write(`ALTER TABLE ${TABLES.networks} RENAME TO geoip_networks;\n`);
  out.write(`ALTER TABLE ${TABLES.asnNetworks} RENAME TO geoip_asn_networks;\n`);
  out.write(`ALTER TABLE ${TABLES.locations} RENAME TO geoip_locations;\n`);
  out.write('DROP TABLE IF EXISTS geoip_networks_old;\n');
  out.write('DROP TABLE IF EXISTS geoip_asn_networks_old;\n');
  out.write('DROP TABLE IF EXISTS geoip_locations_old;\n');
}

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
  const columnNames = columns.map(([column]) => column);
  const prefix = `INSERT OR REPLACE INTO ${table} (${columnNames.join(',')}) VALUES `;
  const rowSql = `(${columns.map(([, value]) => value).join(',')})`;
  const key = `${table}:${columnNames.join(',')}`;

  if (currentInsertBatch && currentInsertBatch.key !== key) {
    flushInsertBatch(out);
  }

  if (!currentInsertBatch) {
    currentInsertBatch = {
      key,
      prefix,
      rows: [],
      byteLength: Buffer.byteLength(`${prefix};\n`, 'utf8')
    };
  }

  const separatorBytes = currentInsertBatch.rows.length > 0 ? 1 : 0;
  const rowBytes = Buffer.byteLength(rowSql, 'utf8');
  if (
    currentInsertBatch.rows.length > 0 &&
    currentInsertBatch.byteLength + separatorBytes + rowBytes > MAX_INSERT_STATEMENT_BYTES
  ) {
    flushInsertBatch(out);
    currentInsertBatch = {
      key,
      prefix,
      rows: [],
      byteLength: Buffer.byteLength(`${prefix};\n`, 'utf8')
    };
  }

  currentInsertBatch.rows.push(rowSql);
  currentInsertBatch.byteLength += separatorBytes + rowBytes;
}

function flushInsertBatch(out) {
  if (!currentInsertBatch || currentInsertBatch.rows.length === 0) return;

  out.write(`${currentInsertBatch.prefix}${currentInsertBatch.rows.join(',')};\n`);
  stats.insertStatements += 1;
  currentInsertBatch = null;
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
