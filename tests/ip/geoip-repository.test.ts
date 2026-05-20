import { describe, expect, it, vi } from 'vitest';
import { GeoIpRepository } from '../../src/ip/geoip-repository';

function fakeDb(result: unknown): {
  db: D1Database;
  prepare: ReturnType<typeof vi.fn>;
  bind: ReturnType<typeof vi.fn>;
} {
  const bind = vi.fn(() => ({
    first: vi.fn(async () => result)
  }));
  const prepare = vi.fn(() => ({ bind }));

  return {
    db: { prepare } as unknown as D1Database,
    prepare,
    bind
  };
}

describe('GeoIpRepository', () => {
  it('returns merged geo and ASN rows', async () => {
    const fake = fakeDb({
      ip_version: 4,
      network: '1.1.1.0/24',
      country_iso_code: 'AU',
      country_name: 'Australia',
      city_name: 'Research',
      latitude: -37.7,
      longitude: 145.18,
      autonomous_system_number: 13335,
      autonomous_system_organization: 'Cloudflare, Inc.'
    });

    const repo = new GeoIpRepository(fake.db);
    await expect(repo.lookup('1.1.1.1')).resolves.toMatchObject({
      ip: '1.1.1.1',
      location: { countryIsoCode: 'AU', cityName: 'Research' },
      asn: { number: 13335, organization: 'Cloudflare, Inc.' }
    });

    const sql = fake.prepare.mock.calls[0]?.[0];
    expect(sql).toContain('n.start_ip_num <= ?');
    expect(sql).toContain('n.end_ip_num >= ?');
    expect(sql).toContain('a.start_ip_num <= ?');
    expect(sql).toContain('a.end_ip_num >= ?');
    expect(fake.bind).toHaveBeenCalledWith(
      '000000000000000000000000000000016843009',
      '000000000000000000000000000000016843009',
      4,
      '000000000000000000000000000000016843009',
      '000000000000000000000000000000016843009'
    );
  });
});
