import { describe, expect, it, vi } from 'vitest';
import { GeoIpRepository } from '../../src/ip/geoip-repository';

function fakeDb(result: unknown): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => result)
      }))
    }))
  } as unknown as D1Database;
}

describe('GeoIpRepository', () => {
  it('returns merged geo and ASN rows', async () => {
    const db = fakeDb({
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

    const repo = new GeoIpRepository(db);
    await expect(repo.lookup('1.1.1.1')).resolves.toMatchObject({
      ip: '1.1.1.1',
      location: { countryIsoCode: 'AU', cityName: 'Research' },
      asn: { number: 13335, organization: 'Cloudflare, Inc.' }
    });
  });
});
