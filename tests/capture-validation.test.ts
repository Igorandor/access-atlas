import test from 'node:test';
import assert from 'node:assert/strict';
import { captureAccess } from '../server/access-snapshot';
import { compareSnapshots } from '../shared/access-model';
import { parseSnapshot } from '../shared/snapshot-schema';
import { IrisClient } from '../server/upstream';

const validUser = { Enabled: true, Roles: ['Reader'], EscalationRoles: [] };
const validRole = { Description: '', GrantedRoles: [], Resources: [], EscalationOnly: false };
const validApp = { Enabled: true, AutheEnabled: 32, Resource: '', NameSpace: 'USER' };
async function capture(responses: Record<string, unknown>) {
  const client = {
    async request(_auth: string, op: { path: string }) {
      return { data: structuredClone(responses[op.path] ?? []), status: 200, console: [] };
    },
  } as unknown as IrisClient;
  return captureAccess(client, 'fixture', 'fixture-instance');
}

test('missing or malformed detail fields remain unknown rather than complete evidence', async () => {
  for (const [list, detail, kind, values] of [
    [
      '/v2/security/users',
      '/v2/security/user',
      'users',
      [{}, { ...validUser, Enabled: 'false' }, { ...validUser, Roles: [42] }],
    ],
    [
      '/v2/security/roles',
      '/v2/security/role',
      'roles',
      [{}, { ...validRole, Resources: [null] }, { ...validRole, GrantedRoles: 'Reader' }],
    ],
    [
      '/v2/web-apps',
      '/v2/web-app',
      'apps',
      [{}, { ...validApp, AutheEnabled: '64' }, { ...validApp, Enabled: null }],
    ],
  ] as const) {
    for (const value of values) {
      const result = await capture({ [list]: [{ Name: 'fixture' }], [detail]: value });
      assert.ok(result.warnings.length > 0);
      assert.ok(result[kind][0].unavailable);
      assert.throws(() => compareSnapshots(result, result), /complete/);
      assert.doesNotThrow(() => parseSnapshot(result));
    }
  }
});

test('malformed and duplicate list identities cannot crash or silently collapse a capture', async () => {
  const result = await capture({
    '/v2/security/users': [null, 'bad', {}, { Name: '' }, { Name: 'reader' }, { Name: 'reader' }],
    '/v2/security/user': validUser,
    '/v2/security/resources': [{ Name: 'broken', PublicPermission: 42 }, null],
  });
  assert.deepEqual(
    result.users.map((r) => r.Name),
    ['reader'],
  );
  assert.deepEqual(result.resources, []);
  assert.ok(result.warnings.length > 0);
  assert.doesNotThrow(() => parseSnapshot(result));
  assert.throws(() => compareSnapshots(result, result), /complete/);
});

test('detail responses cannot rename the requested identity', async () => {
  const result = await capture({
    '/v2/security/users': [{ Name: 'reader' }],
    '/v2/security/user': { ...validUser, Name: 'another-account' },
  });
  assert.equal(result.users[0].Name, 'reader');
  assert.ok(result.users[0].unavailable);
  assert.ok(result.warnings.length);
});

test('complete native metadata survives validation without exposing unrelated fields', async () => {
  const result = await capture({
    '/v2/security/users': [{ Name: 'reader' }],
    '/v2/security/user': { ...validUser, Password: 'fixture-secret' },
    '/v2/security/roles': [{ Name: 'Reader' }],
    '/v2/security/role': validRole,
    '/v2/web-apps': [{ Name: '/fixture' }],
    '/v2/web-app': validApp,
    '/v2/security/resources': [
      { Name: 'Data', PublicPermission: 'R', ResourceType: 'Database', Description: 'ignored' },
    ],
  });
  assert.deepEqual(result.warnings, []);
  assert.equal(result.users[0].Enabled, true);
  assert.equal(result.apps[0].AutheEnabled, 32);
  assert.equal(JSON.stringify(result).includes('fixture-secret'), false);
  assert.deepEqual(parseSnapshot(result), result);
  assert.deepEqual(compareSnapshots(result, result), []);
});
