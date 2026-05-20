import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

describe('convert-geolite2', () => {
  it('writes metadata, range keys, multiple block files, and escaped CSV strings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'netlens-geoip-'));
    const locations = join(dir, 'locations.csv');
    const cityBlocksIpv4 = join(dir, 'city-ipv4.csv');
    const cityBlocksIpv6 = join(dir, 'city-ipv6.csv');
    const asnBlocksIpv4 = join(dir, 'asn-ipv4.csv');
    const asnBlocksIpv6 = join(dir, 'asn-ipv6.csv');
    const output = join(dir, 'geoip.sql');

    writeFileSync(
      locations,
      [
        'geoname_id,locale_code,continent_code,continent_name,country_iso_code,country_name,subdivision_1_iso_code,subdivision_1_name,subdivision_2_iso_code,subdivision_2_name,city_name,metro_code,time_zone,is_in_european_union',
        '123,en,NA,North America,US,United States,CA,California,,,"O\'Fallon, City",807,America/Chicago,0'
      ].join('\n')
    );
    writeFileSync(
      cityBlocksIpv4,
      [
        'network,geoname_id,registered_country_geoname_id,represented_country_geoname_id,is_anonymous_proxy,is_satellite_provider,postal_code,latitude,longitude,accuracy_radius,metro_code,time_zone',
        '1.1.1.0/24,123,123,,0,0,63366,38.8106,-90.6998,20,807,America/Chicago'
      ].join('\n')
    );
    writeFileSync(
      cityBlocksIpv6,
      [
        'network,geoname_id,registered_country_geoname_id,represented_country_geoname_id,is_anonymous_proxy,is_satellite_provider,postal_code,latitude,longitude,accuracy_radius,metro_code,time_zone',
        '::1/128,123,123,,0,0,63366,38.8106,-90.6998,20,807,America/Chicago'
      ].join('\n')
    );
    writeFileSync(
      asnBlocksIpv4,
      [
        'network,autonomous_system_number,autonomous_system_organization',
        '1.1.1.0/24,13335,"Cloudflare, Inc."'
      ].join('\n')
    );
    writeFileSync(
      asnBlocksIpv6,
      [
        'network,autonomous_system_number,autonomous_system_organization',
        "2606:4700:4700::/48,13335,Cloudflare's Network"
      ].join('\n')
    );

    const stdout = String(execFileSync('node', [
      'scripts/geoip/convert-geolite2.mjs',
      '--city-blocks',
      cityBlocksIpv4,
      cityBlocksIpv6,
      '--asn-blocks',
      asnBlocksIpv4,
      asnBlocksIpv6,
      '--locations',
      locations,
      '--source',
      "maxmind city.zip+asn.zip",
      '--build-epoch',
      '1716200000',
      '--checksum',
      'city-sha256:abc asn-sha256:def',
      '--imported-at',
      '2026-05-20T16:00:00.000Z',
      '--output',
      output
    ]));

    const sql = readFileSync(output, 'utf8');

    expect(sql).not.toContain('BEGIN TRANSACTION;');
    expect(sql).not.toContain('COMMIT;');
    expect(sql).toContain('-- netlens-import total_rows=5 locations=1 networks=2 asn_networks=2 metadata_rows=1');
    expect(stdout).toContain('Generated GeoIP import: total_rows=5 locations=1 networks=2 asn_networks=2 metadata_rows=1');
    expect(sql).toContain("VALUES ('1.1.1.0/24'");
    expect(sql).toContain("),('2606:4700:4700::/48'");
    const encoder = new TextEncoder();
    for (const statement of sql.split(';\n').filter((value) => value.startsWith('INSERT OR REPLACE'))) {
      expect(encoder.encode(`${statement};\n`).length).toBeLessThanOrEqual(80_000);
    }
    expect(sql).toContain("'000000000000000000000000000000016843008'");
    expect(sql).toContain("'000000000000000000000000000000016843263'");
    expect(sql).toContain("'000000000000000000000000000000000000001'");
    expect(sql).toContain("'050543257694033307102031451402929176576'");
    expect(sql).toContain("'050543257694034516027851066032103882751'");
    expect(sql).toContain("'O''Fallon, City'");
    expect(sql).toContain("'Cloudflare, Inc.'");
    expect(sql).toContain("'Cloudflare''s Network'");
    expect(sql).toContain(
      "INSERT OR REPLACE INTO geoip_imports (id,source,edition,build_epoch,imported_at,row_count,checksum) VALUES ('2026-05-20T16:00:00.000Z-1716200000','maxmind city.zip+asn.zip','GeoLite2-City-ASN',1716200000,'2026-05-20T16:00:00.000Z',5,'city-sha256:abc asn-sha256:def');"
    );
  });
});
