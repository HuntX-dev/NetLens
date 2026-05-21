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

  it('renders results as structured sections with collapsible raw data', () => {
    const html = readFileSync('src/ui/app.html', 'utf8');
    const js = readFileSync('src/ui/app.js', 'utf8');

    expect(html).toContain('<details class="raw-panel">');
    expect(html).toContain('<summary>Raw data</summary>');
    expect(js).toContain('function renderSection');
    expect(js).toContain('function renderDnsRecords');
    expect(js).toContain('function renderRdapItems');
    expect(js).toContain('function renderObjectGrid');
    expect(js).toContain("article.className = 'section-card'");
    expect(js).not.toContain('`${section.title}\\n${JSON.stringify(section.data, null, 2)}`');
  });

  it('shows skeleton loading before the first result and a soft update state afterward', () => {
    const js = readFileSync('src/ui/app.js', 'utf8');
    const css = readFileSync('src/ui/styles.css', 'utf8');

    expect(js).toContain("const resultsEl = requiredSelector('.results')");
    expect(js).toContain('function renderLoading');
    expect(js).toContain("summaryEl.setAttribute('aria-busy', 'true')");
    expect(js).toContain("sectionsEl.setAttribute('aria-busy', 'true')");
    expect(js).toContain("resultsEl.classList.add('is-updating')");
    expect(js).toContain("createSkeleton('skeleton skeleton-card')");
    expect(css).toContain('.skeleton');
    expect(css).toContain('@keyframes skeleton-pulse');
    expect(css).toContain('.results.is-updating::before');
  });

  it('keeps results scoped to the selected tool tab', () => {
    const js = readFileSync('src/ui/app.js', 'utf8');
    const css = readFileSync('src/ui/styles.css', 'utf8');

    expect(js).toContain("let activeTool = 'ip'");
    expect(js).toContain('const resultsByTool = new Map()');
    expect(js).toContain('let currentRequestId = 0');
    expect(js).toContain('function showToolResult');
    expect(js).toContain('function renderEmptyTool');
    expect(js).toContain('if (requestId !== currentRequestId || tool !== activeTool) return');
    expect(js).toContain("resultsByTool.set(tool, json)");
    expect(css).toContain('.empty-panel');
  });
});
