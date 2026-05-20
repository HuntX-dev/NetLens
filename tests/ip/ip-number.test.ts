import { describe, expect, it } from 'vitest';
import { ipToRangeKey } from '../../src/ip/ip-number';

describe('ipToRangeKey', () => {
  it('converts IPv4 to decimal key', () => {
    expect(ipToRangeKey('1.1.1.1')).toEqual({ version: 4, key: '00000000000000000000000000000016843009' });
  });

  it('converts IPv6 to padded decimal key', () => {
    expect(ipToRangeKey('2606:4700:4700::1111')).toEqual({
      version: 6,
      key: '50543257694033307102031451402929180945'
    });
  });
});
