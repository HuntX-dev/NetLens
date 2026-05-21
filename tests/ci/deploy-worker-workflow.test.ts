import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('deploy worker workflow', () => {
  it('deploys the Worker on pushes to main with the Cloudflare token secret', () => {
    const workflow = readFileSync('.github/workflows/deploy-worker.yml', 'utf8');

    expect(workflow).toContain('name: Deploy Worker');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('branches: ["main"]');
    expect(workflow).toContain('uses: actions/checkout@v4');
    expect(workflow).toContain('uses: actions/setup-node@v4');
    expect(workflow).toContain('node-version: "22"');
    expect(workflow).toContain('cache: "npm"');
    expect(workflow).toContain('run: npm ci');
    expect(workflow).toContain('run: npm test');
    expect(workflow).toContain('run: npm run typecheck');
    expect(workflow).toContain('run: npm run deploy');
    expect(workflow).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
  });
});
