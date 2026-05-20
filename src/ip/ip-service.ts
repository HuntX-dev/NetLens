import type { Context } from 'hono';
import type { Env } from '../env';
import { failure, success } from '../http/envelope';
import { parseIpInput } from '../http/input';
import { GeoIpRepository } from './geoip-repository';

export async function handleIpLookup(c: Context<{ Bindings: Env }>) {
  const explicit = c.req.query('ip');
  const candidate = explicit ?? c.req.header('cf-connecting-ip') ?? '';
  const parsed = parseIpInput(candidate);

  if (!parsed.ok) {
    return c.json(failure(parsed.code, parsed.message), 400);
  }

  const repo = new GeoIpRepository(c.env.DB);
  let result;
  try {
    result = await repo.lookup(parsed.value);
  } catch {
    return c.json(failure('d1_unavailable', 'GeoIP database is unavailable.'), 503);
  }

  if (!result) {
    return c.json(failure('not_found', 'No GeoLite2 match was found for this IP address.'), 404);
  }

  return c.json(
    success({
      query: { ip: parsed.value, source: explicit ? 'explicit' : 'current_visitor' },
      summary: {
        ip: parsed.value,
        country: result.location.countryIsoCode,
        city: result.location.cityName,
        asn: result.asn.number,
        organization: result.asn.organization
      },
      sections: [
        { title: 'Location', data: result.location },
        { title: 'Network', data: result.asn },
        { title: 'Matched ranges', data: { network: result.matchedNetwork } }
      ],
      raw: {
        d1: result.raw,
        request: explicit ? null : buildRequestDiagnostics(c)
      },
      meta: { source: 'd1' }
    })
  );
}

function buildRequestDiagnostics(c: Context<{ Bindings: Env }>) {
  return {
    colo: c.req.raw.cf?.colo,
    httpProtocol: c.req.raw.cf?.httpProtocol,
    tlsVersion: c.req.raw.cf?.tlsVersion,
    tlsCipher: c.req.raw.cf?.tlsCipher,
    headers: {
      acceptLanguage: c.req.header('accept-language'),
      userAgent: c.req.header('user-agent'),
      cfRay: c.req.header('cf-ray')
    }
  };
}
