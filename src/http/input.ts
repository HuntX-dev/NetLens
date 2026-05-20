import type { ApiErrorCode } from './envelope';

type ParseError = { ok: false; code: ApiErrorCode; message: string };
type IpParseSuccess = { ok: true; value: string; version: 4 | 6 };
type DomainParseSuccess = { ok: true; value: string };

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;

export function parseIpInput(input: string): IpParseSuccess | ParseError {
  const value = input.trim();
  if (IPV4_RE.test(value)) return { ok: true, value, version: 4 };
  if (value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)) {
    try {
      new URL(`http://[${value}]`);
      return { ok: true, value: value.toLowerCase(), version: 6 };
    } catch {
      return invalidIp();
    }
  }
  return invalidIp();
}

export function parseDomain(input: string): DomainParseSuccess | ParseError {
  const value = input.trim().replace(/\.$/, '').toLowerCase();
  if (value.includes('://') || value.includes('/') || value.includes('@')) {
    return invalidDomain();
  }
  if (!DOMAIN_RE.test(value)) return invalidDomain();
  return { ok: true, value };
}

function invalidIp(): ParseError {
  return { ok: false, code: 'invalid_input', message: 'Enter a valid IPv4 or IPv6 address.' };
}

function invalidDomain(): ParseError {
  return {
    ok: false,
    code: 'invalid_input',
    message: 'Enter a valid domain name without protocol or path.'
  };
}
