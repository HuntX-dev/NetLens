import { describe, expect, it, vi } from 'vitest';
import { GeoIpRepository } from '../../src/ip/geoip-repository';

function fakeDb(...results: unknown[]): {
  db: D1Database;
  prepare: ReturnType<typeof vi.fn>;
  binds: ReturnType<typeof vi.fn>[];
} {
  const binds: ReturnType<typeof vi.fn>[] = [];
  let index = 0;
  const prepare = vi.fn(() => {
    const result = results[index] ?? null;
    index += 1;
    const fixedBind = vi.fn(() => ({
      first: vi.fn(async () => result)
    }));
    binds.push(fixedBind);
    return { bind: fixedBind };
  });

  return {
    db: { prepare } as unknown as D1Database,
    prepare,
    binds
  };
}

describe('GeoIpRepository', () => {
  it('returns merged geo and ASN rows', async () => {
    const fake = fakeDb(
      {
        ip_version: 4,
        network: '1.1.1.0/24',
        end_ip_num: '000000000000000000000000000000016843263',
        country_iso_code: 'AU',
        country_name: 'Australia',
        city_name: 'Research',
        latitude: -37.7,
        longitude: 145.18
      },
      {
        end_ip_num: '000000000000000000000000000000016843263',
        autonomous_system_number: 13335,
        autonomous_system_organization: 'Cloudflare, Inc.'
      }
    );

    const repo = new GeoIpRepository(fake.db);
    await expect(repo.lookup('1.1.1.1')).resolves.toMatchObject({
      ip: '1.1.1.1',
      location: { countryIsoCode: 'AU', cityName: 'Research' },
      asn: { number: 13335, organization: 'Cloudflare, Inc.' }
    });

    expect(fake.prepare).toHaveBeenCalledTimes(2);

    const citySql = fake.prepare.mock.calls[0]?.[0];
    expect(citySql).toContain('FROM geoip_networks n');
    expect(citySql).toContain('n.start_ip_num <= ?');
    expect(citySql).toContain('ORDER BY n.start_ip_num DESC');
    expect(citySql).toContain('LIMIT 1');
    expect(citySql).not.toContain('geoip_asn_networks');

    const asnSql = fake.prepare.mock.calls[1]?.[0];
    expect(asnSql).toContain('FROM geoip_asn_networks');
    expect(asnSql).toContain('start_ip_num <= ?');
    expect(asnSql).toContain('ORDER BY start_ip_num DESC');
    expect(asnSql).toContain('LIMIT 1');

    expect(fake.binds[0]).toHaveBeenCalledWith(
      4,
      '000000000000000000000000000000016843009'
    );
    expect(fake.binds[1]).toHaveBeenCalledWith(
      4,
      '000000000000000000000000000000016843009'
    );
  });

  it('rejects the nearest preceding range when the IP falls in a gap', async () => {
    const fake = fakeDb({
      network: '1.1.0.0/24',
      end_ip_num: '000000000000000000000000000000016842999',
      country_iso_code: 'AU',
      country_name: 'Australia',
      city_name: 'Research',
      latitude: -37.7,
      longitude: 145.18
    });

    const repo = new GeoIpRepository(fake.db);

    await expect(repo.lookup('1.1.1.1')).resolves.toBeNull();
    expect(fake.prepare).toHaveBeenCalledTimes(1);
  });
});
