import { describe, expect, it } from 'vitest';
import { parseDomain, parseIpInput } from '../../src/http/input';

describe('parseIpInput', () => {
  it('accepts IPv4 input', () => {
    expect(parseIpInput(' 1.1.1.1 ')).toEqual({ ok: true, value: '1.1.1.1', version: 4 });
  });

  it('accepts IPv6 input', () => {
    expect(parseIpInput('2606:4700:4700::1111')).toEqual({
      ok: true,
      value: '2606:4700:4700::1111',
      version: 6
    });
  });

  it('rejects invalid IP input', () => {
    expect(parseIpInput('999.1.1.1')).toEqual({
      ok: false,
      code: 'invalid_input',
      message: 'Enter a valid IPv4 or IPv6 address.'
    });
  });

  it('rejects IPv4 input with leading-zero octets', () => {
    expect(parseIpInput('001.002.003.004')).toEqual({
      ok: false,
      code: 'invalid_input',
      message: 'Enter a valid IPv4 or IPv6 address.'
    });
  });

  it('rejects IPv4 input with a leading-zero octet', () => {
    expect(parseIpInput('01.2.3.4')).toEqual({
      ok: false,
      code: 'invalid_input',
      message: 'Enter a valid IPv4 or IPv6 address.'
    });
  });
});

describe('parseDomain', () => {
  it('normalizes a valid domain', () => {
    expect(parseDomain(' Example.COM. ')).toEqual({ ok: true, value: 'example.com' });
  });

  it('rejects invalid domain text', () => {
    expect(parseDomain('http://example.com')).toEqual({
      ok: false,
      code: 'invalid_input',
      message: 'Enter a valid domain name without protocol or path.'
    });
  });

  it('rejects IPv4 literals', () => {
    expect(parseDomain('1.1.1.1')).toEqual({
      ok: false,
      code: 'invalid_input',
      message: 'Enter a valid domain name without protocol or path.'
    });
  });
});
