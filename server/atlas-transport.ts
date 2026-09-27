import { ApiError, type Operation } from './atlas-errors.js';
import { parameters, spec } from '../shared/schema.js';
import { credentialValues, redact } from '../shared/redaction.js';
import { boundedJson } from './json-limits.js';

const mutations = new Set([
  ...[
    'user',
    'user/password',
    'role',
    'resource',
    'service',
    'ssl-configuration',
    'x509-credential',
    'audit/enabled',
    'audit/records',
    'oauth2/resource-server',
    'oauth2/client/server-definition',
    'oauth2/client/client-configuration',
    'oauth2/client/client-configuration/secrets',
  ].map((s) => '/v2/security/' + s),
  ...[
    'web-app',
    'device',
    'wallet/collection',
    'wallet/secret',
    'task',
    'task/run',
    'task/suspend',
    'task/resume',
    'process/suspend',
    'process/resume',
    'process/terminate',
  ].map((s) => '/v2/' + s),
]);

export function validateOperation(operation: Operation) {
  if (!boundedJson(operation.body, 32, 20000))
    throw new ApiError(400, 'Request complexity limit exceeded.');
  const credentials = credentialValues(operation.body);
  if (credentials.length > 128 || credentials.join('').length > 32768)
    throw new ApiError(400, 'Credential fields exceed the accepted count or size.');
  const { path, method, query = {} } = operation;
  if (['/extension/logs', '/extension/telemetry'].includes(path)) {
    if (method !== 'GET' || Object.keys(query).some((k) => k !== 'source' && k !== 'limit'))
      throw new ApiError(400, 'Unsupported telemetry request.');
    return;
  }
  if (!Object.hasOwn(spec.paths, path) || !Object.hasOwn(spec.paths[path], method.toLowerCase()))
    throw new ApiError(400, 'The request is outside the published API contract.');
  if (['/login', '/logout', '/refresh', '/revoke'].includes(path))
    throw new ApiError(403, 'Use the Atlas sign-in service.');
  const lastSegment = path.substring(path.lastIndexOf('/') + 1);
  if (
    method === 'GET' &&
    path !== '/v2/wallet/secrets' &&
    ['secret', 'secrets', 'password', 'initial-access-token', 'search-password'].includes(
      lastSegment,
    )
  )
    throw new ApiError(403, 'Atlas does not read credential values.');
  if (method !== 'GET' && !mutations.has(path))
    throw new ApiError(403, 'This write is not enabled.');
  const contract = parameters(path, method);
  const names = new Set(contract.map((p) => p.name));
  for (const key in query)
    if (!names.has(key)) throw new ApiError(400, 'Unexpected parameter: ' + key);
  for (const field of contract)
    if (field.required && !query[field.name])
      throw new ApiError(400, 'Required parameter: ' + field.name);
  if (
    query.maxRows !== undefined &&
    (!/^\d+$/.test(query.maxRows) || +query.maxRows < 1 || +query.maxRows > 1000)
  )
    throw new ApiError(400, 'maxRows must be an integer from 1 to 1000.');
}

/** A native error list is evidence of failure even if its diagnostics are empty. */
export function irisError(document: any): string | undefined {
  const safe = redact(document);
  const errors = safe?.status?.errors ?? safe?.status?.Errors;
  if (Array.isArray(errors) && errors.length) {
    const messages: string[] = [];
    for (const entry of errors) {
      const value =
        entry && typeof entry === 'object'
          ? (entry.message ?? entry.error ?? entry.text ?? entry)
          : entry;
      const message =
        typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
      messages.push(
        message?.trim() ? message : 'IRIS reported an error without a diagnostic message.',
      );
    }
    return messages.join('; ');
  }
  if (safe?.error) return typeof safe.error === 'string' ? safe.error : JSON.stringify(safe.error);
  const summary = safe?.status?.summary;
  if (summary && !['ok', 'success'].includes(String(summary).toLowerCase())) return String(summary);
}

async function decode(response: Response): Promise<any> {
  const buffers: Uint8Array[] = [];
  const stream = response.body?.getReader();
  let bytes = 0;
  if (stream) {
    try {
      for (;;) {
        const next = await stream.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 8_000_000) {
          await stream.cancel();
          throw new ApiError(502, 'IRIS returned too much data. Add a narrower filter.');
        }
        buffers.push(next.value);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        502,
        'The native response ended unexpectedly. Check state before retrying a write.',
      );
    } finally {
      stream.releaseLock();
    }
  }
  const denial =
    response.status === 401
      ? 'IRIS rejected these credentials.'
      : response.status === 403
        ? 'Your IRIS account does not have the required privilege.'
        : '';
  let value: any;
  try {
    value = JSON.parse(Buffer.concat(buffers).toString('utf8'));
  } catch {
    throw new ApiError(
      denial ? response.status : 502,
      denial || 'IRIS returned an unreadable JSON document.',
    );
  }
  if (!value || typeof value !== 'object')
    throw new ApiError(
      denial ? response.status : 502,
      denial || 'IRIS returned an invalid response document.',
    );
  if (!boundedJson(value, 64, 200000))
    throw new ApiError(502, 'IRIS response complexity limit exceeded.');
  return value;
}

function diagnosticDictionary(authorization: string, operation: Operation): string[] {
  const values = credentialValues(operation.body);
  if (authorization.startsWith('Basic ')) {
    const encoded = authorization.substring(6),
      plain = Buffer.from(encoded, 'base64').toString();
    if (plain.includes(':')) values.push(plain.substring(plain.indexOf(':') + 1));
    values.push(encoded, authorization);
  }
  return values.flatMap((s) => [
    s,
    JSON.stringify(s).slice(1, -1),
    encodeURIComponent(Buffer.from(s).toString()),
    new URLSearchParams({ value: s }).toString().substring(6),
  ]);
}

/** Atlas transport separates policy, bounded decoding and diagnostic projection. */
export class AtlasTransport {
  private leases = new Map<string, number>();
  private total = 0;
  constructor(
    private origin: string,
    private send: typeof fetch = fetch,
  ) {}

  async request(authorization: string, operation: Operation, callerSignal?: AbortSignal) {
    validateOperation(operation);
    const readSignal = operation.method === 'GET' ? callerSignal : undefined;
    if (readSignal?.aborted) throw new ApiError(499, 'The requesting client cancelled this read.');
    const count = this.leases.get(authorization) || 0;
    if (count === 8 || this.total === 16)
      throw new ApiError(429, 'The native request pool is full. Try after current reads finish.');
    this.leases.set(authorization, count + 1);
    this.total++;
    try {
      return await this.exchange(authorization, operation, readSignal);
    } finally {
      this.total--;
      const count = this.leases.get(authorization)! - 1;
      if (count) this.leases.set(authorization, count);
      else this.leases.delete(authorization);
    }
  }

  private async exchange(authorization: string, operation: Operation, callerSignal?: AbortSignal) {
    const extension = operation.path.startsWith('/extension/');
    const endpoint = new URL(
      extension
        ? operation.path.replace('/extension/', '/api/atlas/')
        : '/api/admin' + operation.path,
      this.origin,
    );
    Object.entries(operation.query ?? {}).forEach(([key, value]) =>
      endpoint.searchParams.append(key, value),
    );
    const payload = operation.body && { ...operation.body };
    const oauth = operation.path === '/v2/security/oauth2/client/client-configuration';
    if (oauth && payload && Object.hasOwn(payload, 'OAuth2ServerDefinition')) {
      payload.ServerDefinition = payload.OAuth2ServerDefinition;
      delete payload.OAuth2ServerDefinition;
    }
    let response: Response;
    try {
      response = await this.send(endpoint, {
        method: operation.method,
        redirect: 'error',
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Accept-Language': 'en',
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: callerSignal
          ? AbortSignal.any([callerSignal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
      });
    } catch {
      if (callerSignal?.aborted)
        throw new ApiError(499, 'The requesting client cancelled this read.');
      throw new ApiError(
        502,
        'IRIS did not respond within the connection deadline. A write may have completed; inspect before retrying.',
      );
    }
    const envelope = redact(await decode(response));
    const dictionary = diagnosticDictionary(authorization, operation);
    const problem = irisError(
      redact({ status: envelope.status, error: envelope.error }, dictionary),
    );
    if (problem || !response.ok)
      throw new ApiError(
        response.ok ? 422 : response.status,
        problem ||
          (response.status === 403
            ? 'Your IRIS account does not have the required privilege.'
            : 'IRIS returned HTTP ' + response.status),
      );
    if (oauth && envelope.result?.ServerDefinition !== undefined) {
      envelope.result.OAuth2ServerDefinition = envelope.result.ServerDefinition;
      delete envelope.result.ServerDefinition;
    }
    const result = envelope.result ?? envelope;
    if (['/v2/async-result', '/v2/async-results'].includes(operation.path)) {
      for (const job of Array.isArray(result) ? result : [result])
        if (job && typeof job === 'object')
          for (const key of ['Console', 'FailureReason'])
            if (Object.hasOwn(job, key)) job[key] = redact(job[key], dictionary);
    }
    const diagnostics = redact(envelope.console ?? [], dictionary);
    const output = operation.path === '/extension/logs' ? redact(result, dictionary) : result;
    if (result === envelope && Object.hasOwn(output, 'console')) output.console = diagnostics;
    let asyncId: string | undefined;
    if (response.status === 202) {
      try {
        const location = response.headers.get('location');
        const id = location && new URL(location, this.origin).searchParams.get('id');
        if (!id?.trim() || id.length > 2000) throw new Error();
        asyncId = id;
      } catch {
        throw new ApiError(
          502,
          'The accepted write has no usable job identifier. Inspect native state before retrying.',
        );
      }
    }
    return { data: output, console: diagnostics, status: response.status, asyncId };
  }
}
