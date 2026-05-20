export type IpRangeKey = {
  version: 4 | 6;
  key: string;
};

const DECIMAL_WIDTH = 38;

export function ipToRangeKey(ip: string): IpRangeKey {
  if (ip.includes('.')) {
    const value = ip.split('.').reduce((acc, part) => (acc << 8n) + BigInt(Number(part)), 0n);
    return { version: 4, key: pad(value) };
  }

  const value = ipv6ToBigInt(ip);
  return { version: 6, key: pad(value) };
}

function ipv6ToBigInt(ip: string): bigint {
  const [leftRaw, rightRaw = ''] = ip.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  return groups.reduce((acc, group) => (acc << 16n) + BigInt(parseInt(group || '0', 16)), 0n);
}

function pad(value: bigint): string {
  return value.toString(10).padStart(DECIMAL_WIDTH, '0');
}
