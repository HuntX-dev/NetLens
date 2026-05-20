import { ipToRangeKey } from './ip-number';

export type GeoIpLookup = {
  ip: string;
  location: {
    countryIsoCode: string | null;
    countryName: string | null;
    cityName: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  asn: {
    number: number | null;
    organization: string | null;
  };
  matchedNetwork: string | null;
  raw: unknown;
};

type GeoIpRow = {
  network: string | null;
  country_iso_code: string | null;
  country_name: string | null;
  city_name: string | null;
  latitude: number | null;
  longitude: number | null;
  autonomous_system_number: number | null;
  autonomous_system_organization: string | null;
};

export class GeoIpRepository {
  constructor(private readonly db: D1Database) {}

  async lookup(ip: string): Promise<GeoIpLookup | null> {
    const key = ipToRangeKey(ip);
    const row = await this.db
      .prepare(
        `SELECT
          n.network,
          l.country_iso_code,
          l.country_name,
          l.city_name,
          n.latitude,
          n.longitude,
          a.autonomous_system_number,
          a.autonomous_system_organization
        FROM geoip_networks n
        LEFT JOIN geoip_locations l ON l.geoname_id = n.geoname_id
        LEFT JOIN geoip_asn_networks a
          ON a.ip_version = n.ip_version
          AND a.start_ip_num <= ?
          AND a.end_ip_num >= ?
        WHERE n.ip_version = ?
          AND n.start_ip_num <= ?
          AND n.end_ip_num >= ?
        ORDER BY n.start_ip_num DESC
        LIMIT 1`
      )
      .bind(key.key, key.key, key.version, key.key, key.key)
      .first<GeoIpRow>();

    if (!row) return null;

    return {
      ip,
      location: {
        countryIsoCode: row.country_iso_code,
        countryName: row.country_name,
        cityName: row.city_name,
        latitude: row.latitude,
        longitude: row.longitude
      },
      asn: {
        number: row.autonomous_system_number,
        organization: row.autonomous_system_organization
      },
      matchedNetwork: row.network,
      raw: row
    };
  }
}
