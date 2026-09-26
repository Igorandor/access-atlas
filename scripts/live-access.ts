import 'dotenv/config';
import assert from 'node:assert/strict';
import { IrisClient, type Operation } from '../server/upstream';
import { captureAccess } from '../server/access-snapshot';
import { compareSnapshots, resolveAccess } from '../shared/access-model';
import { parseSnapshot } from '../shared/snapshot-schema';
const { IRIS_TEST_USER: user, IRIS_TEST_PASSWORD: password } = process.env;
if (!user || !password) throw new Error('Set credentials for a disposable IRIS test instance.');
const url = process.env.IRIS_URL ?? 'http://127.0.0.1:52780';
const client = new IrisClient(url),
  auth = 'Basic ' + Buffer.from(user + ':' + password).toString('base64');
const prefix = 'AtlasGraph' + Date.now(),
  cleanup: Array<[string, string]> = [];
async function call(
  path: string,
  name: string,
  method: Operation['method'],
  body?: Record<string, unknown>,
) {
  return client.request(auth, { path, method, query: { name }, body });
}
async function create(path: string, name: string, body: Record<string, unknown>) {
  await call(path, name, path === '/v2/security/user' ? 'POST' : 'PUT', body);
  cleanup.push([path, name]);
}
try {
  await create('/v2/security/resource', prefix, {
    Description: 'Temporary graph test',
    PublicPermission: 'R',
  });
  await create('/v2/security/role', prefix + 'Child', {
    Description: 'Temporary child',
    GrantedRoles: [],
    EscalationOnly: false,
    Resources: [{ Name: prefix, Permissions: 'W' }],
  });
  await create('/v2/security/role', prefix + 'Parent', {
    Description: 'Temporary parent',
    GrantedRoles: [prefix + 'Child'],
    EscalationOnly: false,
    Resources: [],
  });
  await create('/v2/security/user', prefix, {
    User: { Enabled: false, Roles: [prefix + 'Parent'] },
    Password: 'AtlasDisposable!2026xyz',
  });
  const before = parseSnapshot(await captureAccess(client, auth, new URL(url).host));
  assert.equal(before.warnings.length, 0, before.warnings.join('\n'));
  const account = before.users.find((u) => u.Name === prefix)!;
  const graph = resolveAccess(before, account.Roles);
  assert.equal(graph.grants.get(prefix)?.permissions, 'W');
  assert.deepEqual(graph.roles.get(prefix + 'Child')?.roles, [prefix + 'Parent', prefix + 'Child']);
  assert.equal(resolveAccess(before, []).grants.has(prefix), false);
  console.log('PASS real nested role capture, source path and local removal preview');
  await call('/v2/security/role', prefix + 'Child', 'PUT', {
    Resources: [{ Name: prefix, Permissions: 'RW' }],
  });
  const after = parseSnapshot(await captureAccess(client, auth, new URL(url).host));
  const drift = compareSnapshots(before, after);
  assert.ok(
    drift.some((d) => d.kind === 'roles' && d.name === prefix + 'Child' && d.change === 'changed'),
  );
  assert.equal(resolveAccess(after, account.Roles).grants.get(prefix)?.permissions, 'RW');
  console.log('PASS real grant change detected by snapshot comparison');
} finally {
  for (const [path, name] of cleanup.reverse()) await call(path, name, 'DELETE');
}
console.log('Access Atlas live graph checks passed.');
