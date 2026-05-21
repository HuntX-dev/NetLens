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
  end_ip_num: string;
  country_iso_code: string | null;
  country_name: string | null;
  city_name: string | null;
  latitude: number | null;
  longitude: number | null;
};

type GeoIpAsnRow = {
  end_ip_num: string;
  autonomous_system_number: number | null;
  autonomous_system_organization: string | null;
};

export class GeoIpRepository {
  constructor(private readonly db: D1Database) {}

  async lookup(ip: string): Promise<GeoIpLookup | null> {
    const key = ipToRangeKey(ip);
    const location = await this.db
      .prepare(
        `SELECT
          n.network,
          n.end_ip_num,
          l.country_iso_code,
          l.country_name,
          l.city_name,
          n.latitude,
          n.longitude
        FROM geoip_networks n
        LEFT JOIN geoip_locations l ON l.geoname_id = n.geoname_id
        WHERE n.ip_version = ?
          AND n.start_ip_num <= ?
        ORDER BY n.start_ip_num DESC
        LIMIT 1`
      )
      .bind(key.version, key.key)
      .first<GeoIpRow>();

    if (!location || location.end_ip_num < key.key) return null;

    const asn = await this.db
      .prepare(
        `SELECT
          end_ip_num,
          autonomous_system_number,
          autonomous_system_organization
        FROM geoip_asn_networks
        WHERE ip_version = ?
          AND start_ip_num <= ?
        ORDER BY start_ip_num DESC
        LIMIT 1`
      )
      .bind(key.version, key.key)
      .first<GeoIpAsnRow>();

    const matchedAsn = asn && asn.end_ip_num >= key.key ? asn : null;
    const raw = { ...location, ...(matchedAsn ?? {}) };

    return {
      ip,
      location: {
        countryIsoCode: location.country_iso_code,
        countryName: location.country_name,
        cityName: location.city_name,
        latitude: location.latitude,
        longitude: location.longitude
      },
      asn: {
        number: matchedAsn?.autonomous_system_number ?? null,
        organization: matchedAsn?.autonomous_system_organization ?? null
      },
      matchedNetwork: location.network,
      raw
    };
  }
}
