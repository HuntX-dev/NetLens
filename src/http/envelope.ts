export type ApiErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'upstream_timeout'
  | 'upstream_error'
  | 'partial_result'
  | 'd1_unavailable'
  | 'rate_limited';

export type ApiMeta = {
  latencyMs?: number;
  source?: string;
  partial?: boolean;
};

export type ApiSuccess<TSummary, TSection = unknown, TRaw = unknown> = {
  ok: true;
  query?: Record<string, unknown>;
  summary: TSummary;
  sections: TSection[];
  raw: TRaw;
  meta: ApiMeta;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
  };
  meta: ApiMeta;
};

export function success<TSummary, TSection = unknown, TRaw = unknown>(
  value: Omit<ApiSuccess<TSummary, TSection, TRaw>, 'ok'>
): ApiSuccess<TSummary, TSection, TRaw> {
  return { ok: true, ...value };
}

export function failure(code: ApiErrorCode, message: string, meta: ApiMeta = {}): ApiFailure {
  return { ok: false, error: { code, message }, meta };
}
