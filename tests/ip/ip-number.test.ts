import { describe, expect, it } from 'vitest';
import { ipToRangeKey } from '../../src/ip/ip-number';

describe('ipToRangeKey', () => {
  it('converts IPv4 to decimal key', () => {
    expect(ipToRangeKey('1.1.1.1')).toEqual({ version: 4, key: '000000000000000000000000000000016843009' });
  });

  it('converts IPv6 to padded decimal key', () => {
    expect(ipToRangeKey('2606:4700:4700::1111')).toEqual({
      version: 6,
      key: '050543257694033307102031451402929180945'
    });
  });

  it('keeps low IPv6 keys fixed-width for text sorting', () => {
    const key = ipToRangeKey('::1');

    expect(key).toEqual({ version: 6, key: '000000000000000000000000000000000000001' });
    expect(key.key).toHaveLength(39);
  });

  it('supports the max IPv6 key without truncation', () => {
    const key = ipToRangeKey('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff');

    expect(key).toEqual({ version: 6, key: '340282366920938463463374607431768211455' });
    expect(key.key).toHaveLength(39);
  });
});
