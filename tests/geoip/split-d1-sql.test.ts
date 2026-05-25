import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

describe('split-d1-sql', () => {
  it('streams input instead of reading the whole SQL file into a string', () => {
    const script = readFileSync('scripts/geoip/split-d1-sql.mjs', 'utf8');

    expect(script).toContain('createReadStream');
    expect(script).not.toContain('readFileSync');
  });

  it('splits generated SQL on statement boundaries and keeps transactions together', () => {
    const dir = mkdtempSync(join(tmpdir(), 'netlens-split-sql-'));
    const input = join(dir, 'geoip.sql');
    const outputDir = join(dir, 'chunks');

    writeFileSync(
      input,
      [
        'DROP TABLE IF EXISTS geoip_networks_next;',
        'CREATE TABLE geoip_networks_next (id TEXT PRIMARY KEY);',
        "INSERT OR REPLACE INTO geoip_networks_next (id) VALUES ('a');",
        "INSERT OR REPLACE INTO geoip_networks_next (id) VALUES ('b');",
        'BEGIN TRANSACTION;',
        'ALTER TABLE geoip_networks_next RENAME TO geoip_networks;',
        'COMMIT;',
        'DROP TABLE IF EXISTS geoip_networks_old;',
        '-- netlens-import total_rows=2'
      ].join('\n')
    );

    execFileSync('node', [
      'scripts/geoip/split-d1-sql.mjs',
      '--input',
      input,
      '--output-dir',
      outputDir,
      '--max-statements',
      '2'
    ]);

    const files = readdirSync(outputDir).sort();
    expect(files).toEqual(['chunk-0001.sql', 'chunk-0002.sql', 'chunk-0003.sql', 'chunk-0004.sql']);

    const chunks = files.map((file) => readFileSync(join(outputDir, file), 'utf8'));
    expect(chunks[0]).toContain('DROP TABLE IF EXISTS geoip_networks_next;');
    expect(chunks[0]).toContain('CREATE TABLE geoip_networks_next');
    expect(chunks[1]).toContain("VALUES ('a');");
    expect(chunks[1]).toContain("VALUES ('b');");
    expect(chunks[2]).toContain('BEGIN TRANSACTION;');
    expect(chunks[2]).toContain('ALTER TABLE geoip_networks_next RENAME TO geoip_networks;');
    expect(chunks[2]).toContain('COMMIT;');
    expect(chunks[3]).toContain('DROP TABLE IF EXISTS geoip_networks_old;');
    expect(chunks[3]).toContain('-- netlens-import total_rows=2');
  });
});
