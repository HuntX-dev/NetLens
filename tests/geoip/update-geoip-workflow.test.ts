import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('update geoip workflow', () => {
  it('validates source files and generated SQL before importing to D1', () => {
    const workflow = readFileSync('.github/workflows/update-geoip.yml', 'utf8');

    expect(workflow).toContain('test -n "$CITY_DIR"');
    expect(workflow).toContain('test -n "$ASN_DIR"');
    expect(workflow).toContain('test -s "$CITY_DIR/GeoLite2-City-Blocks-IPv4.csv"');
    expect(workflow).toContain('test -s "$CITY_DIR/GeoLite2-City-Blocks-IPv6.csv"');
    expect(workflow).toContain('test -s "$ASN_DIR/GeoLite2-ASN-Blocks-IPv4.csv"');
    expect(workflow).toContain('test -s "$ASN_DIR/GeoLite2-ASN-Blocks-IPv6.csv"');
    expect(workflow).toContain('test -s "$CITY_DIR/GeoLite2-City-Locations-en.csv"');
    expect(workflow).toContain('sha256sum tmp/maxmind/city.zip');
    expect(workflow).toContain('sha256sum tmp/maxmind/asn.zip');
    expect(workflow).toContain('--build-epoch "$BUILD_EPOCH"');
    expect(workflow).toContain('--checksum "$CHECKSUM"');
    expect(workflow).toContain('grep -q "INSERT OR REPLACE INTO geoip_networks_next" tmp/maxmind/geoip.sql');
    expect(workflow).toContain('grep -q "INSERT OR REPLACE INTO geoip_asn_networks_next" tmp/maxmind/geoip.sql');
    expect(workflow).toContain('grep -q "INSERT OR REPLACE INTO geoip_locations_next" tmp/maxmind/geoip.sql');
    expect(workflow).toContain('grep -q "INSERT OR REPLACE INTO geoip_imports" tmp/maxmind/geoip.sql');
    expect(workflow).toContain('grep -q "ALTER TABLE geoip_networks_next RENAME TO geoip_networks" tmp/maxmind/geoip.sql');
    expect(workflow).toContain('grep -q "^-- netlens-import total_rows=" tmp/maxmind/geoip.sql');
    expect(workflow).toContain('test "$INSERT_COUNT" -gt 10');
    expect(workflow).toContain('name: Report import size');
    expect(workflow).toContain('echo "$SUMMARY"');
    expect(workflow).toContain('echo "sql_file_bytes=$SQL_BYTES"');
    expect(workflow).toContain('node scripts/geoip/split-d1-sql.mjs');
    expect(workflow).toContain('--output-dir tmp/maxmind/d1-chunks');
    expect(workflow).toContain('for chunk in tmp/maxmind/d1-chunks/*.sql; do');
    expect(workflow).toContain('npx wrangler d1 execute netlens-geoip --remote --file="$chunk"');
    expect(workflow).not.toContain('npx wrangler d1 execute netlens-geoip --remote --file=tmp/maxmind/geoip.sql');
  });
});
