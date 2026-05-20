import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

describe('convert-geolite2', () => {
  it('writes 39-character range keys and escapes SQL strings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'netlens-geoip-'));
    const locations = join(dir, 'locations.csv');
    const cityBlocks = join(dir, 'city.csv');
    const asnBlocks = join(dir, 'asn.csv');
    const output = join(dir, 'geoip.sql');

    writeFileSync(
      locations,
      [
        'geoname_id,locale_code,continent_code,continent_name,country_iso_code,country_name,subdivision_1_iso_code,subdivision_1_name,subdivision_2_iso_code,subdivision_2_name,city_name,metro_code,time_zone,is_in_european_union',
        "123,en,NA,North America,US,United States,CA,California,,,O'Fallon,807,America/Chicago,0"
      ].join('\n')
    );
    writeFileSync(
      cityBlocks,
      [
        'network,geoname_id,registered_country_geoname_id,represented_country_geoname_id,is_anonymous_proxy,is_satellite_provider,postal_code,latitude,longitude,accuracy_radius,metro_code,time_zone',
        '::1/128,123,123,,0,0,63366,38.8106,-90.6998,20,807,America/Chicago'
      ].join('\n')
    );
    writeFileSync(
      asnBlocks,
      [
        'network,autonomous_system_number,autonomous_system_organization',
        "2606:4700:4700::/48,13335,Cloudflare's Network"
      ].join('\n')
    );

    execFileSync('node', [
      'scripts/geoip/convert-geolite2.mjs',
      '--city-blocks',
      cityBlocks,
      '--asn-blocks',
      asnBlocks,
      '--locations',
      locations,
      '--output',
      output
    ]);

    const sql = readFileSync(output, 'utf8');

    expect(sql).toContain("'000000000000000000000000000000000000001'");
    expect(sql).toContain("'050543257694033307102031451402929176576'");
    expect(sql).toContain("'050543257694034516027851066032103882751'");
    expect(sql).toContain("'O''Fallon'");
    expect(sql).toContain("'Cloudflare''s Network'");
  });
});
