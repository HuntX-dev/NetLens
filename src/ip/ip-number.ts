export type IpRangeKey = {
  version: 4 | 6;
  key: string;
};

const DECIMAL_WIDTH = 39;

export function ipToRangeKey(ip: string): IpRangeKey {
  if (!ip.includes(':')) {
    const value = ipv4ToBigInt(ip);
    return { version: 4, key: pad(value) };
  }

  const value = ipv6ToBigInt(ip);
  return { version: 6, key: pad(value) };
}

function ipv4ToBigInt(ip: string): bigint {
  return ip.split('.').reduce((acc, part) => (acc << 8n) + BigInt(parseIpv4Part(part)), 0n);
}

function ipv6ToBigInt(ip: string): bigint {
  const normalizedIp = normalizeIpv4Tail(ip);
  const [leftRaw, rightRaw = ''] = normalizedIp.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  return groups.reduce((acc, group) => (acc << 16n) + BigInt(parseInt(group || '0', 16)), 0n);
}

function normalizeIpv4Tail(ip: string): string {
  if (!ip.includes('.')) return ip;

  const tailStart = ip.lastIndexOf(':') + 1;
  const prefix = ip.slice(0, tailStart);
  const value = ipv4ToBigInt(ip.slice(tailStart));
  const high = Number((value >> 16n) & 0xffffn).toString(16);
  const low = Number(value & 0xffffn).toString(16);
  return `${prefix}${high}:${low}`;
}

function parseIpv4Part(part: string): number {
  const value = Number(part);
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`Invalid IPv4 segment: ${part}`);
  }

  return value;
}

function pad(value: bigint): string {
  return value.toString(10).padStart(DECIMAL_WIDTH, '0');
}
