import { resolve } from 'node:path';

/** Parse deployment settings before opening a listener or writing campaign data. */
export function readConfiguration(env: NodeJS.ProcessEnv) {
  const endpoint = new URL(env.IRIS_URL || 'http://127.0.0.1:52780');
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error('IRIS_URL must be an HTTP(S) address without credentials, query or fragment.');
  const port = Number(env.PORT || 3200);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a valid TCP port.');
  const origin = env.PUBLIC_ORIGIN || undefined;
  if (origin) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin)
      throw new Error('PUBLIC_ORIGIN must contain only an HTTP(S) scheme, host and port.');
  }
  if (env.COOKIE_SECURE && !['true', 'false'].includes(env.COOKIE_SECURE))
    throw new Error('COOKIE_SECURE must be true or false.');
  const secure = env.COOKIE_SECURE === 'true';
  if (origin?.startsWith('https:') && !secure)
    throw new Error('HTTPS deployments require COOKIE_SECURE=true.');
  const instanceId = env.IRIS_INSTANCE_ID || env.ATLAS_INSTANCE_ID || endpoint.origin;
  if (!instanceId.trim() || instanceId.length > 256 || /[\x00-\x1f]/.test(instanceId))
    throw new Error(
      'IRIS_INSTANCE_ID must be a nonempty deployment identifier, at most 256 characters.',
    );
  return {
    irisUrl: endpoint.href,
    instanceId,
    origin,
    secure,
    port,
    host: env.HOST || '127.0.0.1',
    campaignDirectory: resolve(env.ATLAS_DATA_DIR || 'data/campaigns'),
  };
}
