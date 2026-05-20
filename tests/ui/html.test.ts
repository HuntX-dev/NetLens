import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('UI shell', () => {
  it('contains the three tool tabs and no framework root', () => {
    const html = readFileSync('src/ui/app.html', 'utf8');
    expect(html).toContain('data-tool="ip"');
    expect(html).toContain('data-tool="dns"');
    expect(html).toContain('data-tool="rdap"');
    expect(html).not.toContain('react');
    expect(html).not.toContain('vue');
  });
});
