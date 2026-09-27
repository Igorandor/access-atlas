import { ApiError, type Operation } from './atlas-errors.js';

/** Current native read authorization for the material retained in each receipt family. */
export function receiptAuthorizationProbe(path: string): Operation {
  let source: string;
  if (path === '/v2/wallet/collection' || path === '/v2/wallet/secret') {
    source = '/v2/wallet/collections';
  } else if (path.startsWith('/v2/security/oauth2/client/')) {
    source = '/v2/security/oauth2/client/server-definitions';
  } else if (path === '/v2/security/oauth2/resource-server') {
    source = '/v2/security/oauth2/resource-servers';
  } else if (path === '/v2/device') {
    source = '/v2/devices';
  } else if (path === '/v2/task' || path.startsWith('/v2/task/')) {
    source = '/v2/tasks';
  } else if (path.startsWith('/v2/process/')) {
    source = '/v2/processes';
  } else if (
    path === '/v2/web-app' ||
    [
      '/v2/security/user',
      '/v2/security/user/password',
      '/v2/security/role',
      '/v2/security/resource',
      '/v2/security/service',
      '/v2/security/ssl-configuration',
      '/v2/security/x509-credential',
      '/v2/security/audit/enabled',
    ].includes(path)
  ) {
    source = '/v2/security/users';
  } else {
    throw new ApiError(403, 'The source authorization for this receipt is unavailable.');
  }
  return { path: source, method: 'GET', query: { maxRows: '1' } };
}

export function canonicalChangeTarget(
  path: string,
  query: Record<string, string>,
  fallback: string,
) {
  let family = path;
  if (family.startsWith('/v2/process/')) family = '/v2/process';
  if (family.startsWith('/v2/task/')) family = '/v2/task';
  if (family.endsWith('/password')) family = family.slice(0, -9);
  if (family.endsWith('/secrets')) family = family.slice(0, -8);
  const normalize = (value: string) => value.toLocaleLowerCase('en-US');
  let target =
    query.name || query.id || query.alias || query.applicationName || query.serverId || fallback;
  if (family === '/v2/task' || family === '/v2/process') {
    if (/^\d+$/.test(target)) target = BigInt(target).toString();
  }
  if (family === '/v2/web-app') target = target.replace(/\/+$/, '') || '/';
  return JSON.stringify([
    family,
    normalize(target),
    normalize(query.collection || ''),
    normalize(query.serverId || ''),
  ]);
}
