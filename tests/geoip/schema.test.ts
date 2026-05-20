import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('D1 schema', () => {
  it('defines geoip network, ASN, location, and import tables with lookup indexes', () => {
    const sql = readFileSync('schema.sql', 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS geoip_imports');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS geoip_networks');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS geoip_asn_networks');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS geoip_locations');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_geoip_networks_range');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_geoip_asn_networks_range');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_geoip_imports_edition');
  });
});
