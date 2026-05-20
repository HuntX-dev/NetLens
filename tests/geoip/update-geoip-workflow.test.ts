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
    expect(workflow).toContain('grep -q "INSERT OR REPLACE INTO geoip_networks" tmp/maxmind/geoip.sql');
    expect(workflow).toContain('grep -q "INSERT OR REPLACE INTO geoip_asn_networks" tmp/maxmind/geoip.sql');
    expect(workflow).toContain('grep -q "INSERT OR REPLACE INTO geoip_locations" tmp/maxmind/geoip.sql');
    expect(workflow).toContain('grep -q "INSERT OR REPLACE INTO geoip_imports" tmp/maxmind/geoip.sql');
    expect(workflow).not.toContain('BEGIN TRANSACTION');
    expect(workflow).not.toContain('COMMIT;');
    expect(workflow).toContain('test "$INSERT_COUNT" -gt 1000');
  });
});
