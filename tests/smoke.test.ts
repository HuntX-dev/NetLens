import { describe, expect, it } from 'vitest';
import { app } from '../src/index';

describe('worker smoke test', () => {
  it('returns health envelope', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      summary: { status: 'ok' }
    });
  });
});
