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

  it('labels query inputs and announces status updates', () => {
    const html = readFileSync('src/ui/app.html', 'utf8');
    expect(html).toContain('name="ip"');
    expect(html).toContain('aria-label="IP address"');
    expect(html).toContain('name="name"');
    expect(html).toContain('aria-label="DNS name"');
    expect(html).toContain('name="query"');
    expect(html).toContain('aria-label="RDAP query"');
    expect(html).toContain('id="status"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it('uses guarded selectors and error status styling in client script', () => {
    const js = readFileSync('src/ui/app.js', 'utf8');
    expect(js).toContain('function requiredSelector');
    expect(js).toContain('function setStatus');
    expect(js).toContain("statusEl.classList.toggle('is-error'");
    expect(js).toContain("setStatus('error");
    expect(js).toContain('!res.ok || json.ok === false');
  });
});
