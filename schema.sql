CREATE TABLE IF NOT EXISTS geoip_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  edition TEXT NOT NULL,
  build_epoch INTEGER,
  imported_at TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  checksum TEXT
);

CREATE TABLE IF NOT EXISTS geoip_networks (
  id TEXT PRIMARY KEY,
  ip_version INTEGER NOT NULL,
  network TEXT NOT NULL,
  start_ip_num TEXT NOT NULL,
  end_ip_num TEXT NOT NULL,
  geoname_id INTEGER,
  registered_country_geoname_id INTEGER,
  represented_country_geoname_id INTEGER,
  is_anonymous_proxy INTEGER,
  is_satellite_provider INTEGER,
  postal_code TEXT,
  latitude REAL,
  longitude REAL,
  accuracy_radius INTEGER,
  metro_code INTEGER,
  time_zone TEXT
);

CREATE TABLE IF NOT EXISTS geoip_asn_networks (
  id TEXT PRIMARY KEY,
  ip_version INTEGER NOT NULL,
  network TEXT NOT NULL,
  start_ip_num TEXT NOT NULL,
  end_ip_num TEXT NOT NULL,
  autonomous_system_number INTEGER,
  autonomous_system_organization TEXT
);

CREATE TABLE IF NOT EXISTS geoip_locations (
  geoname_id INTEGER PRIMARY KEY,
  locale_code TEXT,
  continent_code TEXT,
  continent_name TEXT,
  country_iso_code TEXT,
  country_name TEXT,
  subdivision_1_iso_code TEXT,
  subdivision_1_name TEXT,
  subdivision_2_iso_code TEXT,
  subdivision_2_name TEXT,
  city_name TEXT,
  metro_code INTEGER,
  time_zone TEXT,
  is_in_european_union INTEGER
);

CREATE INDEX IF NOT EXISTS idx_geoip_networks_range
  ON geoip_networks (ip_version, start_ip_num, end_ip_num);

CREATE INDEX IF NOT EXISTS idx_geoip_asn_networks_range
  ON geoip_asn_networks (ip_version, start_ip_num, end_ip_num);

CREATE INDEX IF NOT EXISTS idx_geoip_imports_edition
  ON geoip_imports (edition, imported_at);
