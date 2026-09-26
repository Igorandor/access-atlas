import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonical,
  compareSnapshots,
  findings,
  resolveAccess,
  type AccessSnapshot,
} from '../shared/access-model';
import { parseSnapshot } from '../shared/snapshot-schema';
import { captureAccess } from '../server/access-snapshot';
import { IrisClient } from '../server/upstream';

const fixture = (): AccessSnapshot => ({
  version: 1,
  instance: 'iris:52773',
  startedAt: '2026-09-26T00:00:00.000Z',
  capturedAt: '2026-09-26T00:00:01.000Z',
  warnings: [],
  users: [
    { Name: 'operator', Enabled: true, Roles: ['Parent', 'Writer'], EscalationRoles: ['Elevated'] },
  ],
  roles: [
    {
      Name: 'Parent',
      Description: '',
      GrantedRoles: ['Reader'],
      Resources: [],
      EscalationOnly: false,
    },
    {
      Name: 'Reader',
      Description: '',
      GrantedRoles: [],
      Resources: [{ Name: 'Data', Permissions: 'R' }],
      EscalationOnly: false,
    },
    {
      Name: 'Writer',
      Description: '',
      GrantedRoles: ['Reader'],
      Resources: [{ Name: 'Data', Permissions: 'W' }],
      EscalationOnly: false,
    },
    {
      Name: 'Elevated',
      Description: '',
      GrantedRoles: ['%All'],
      Resources: [],
      EscalationOnly: true,
    },
    { Name: '%All', Description: '', GrantedRoles: [], Resources: [], EscalationOnly: false },
  ],
  resources: [
    { Name: 'Data', PublicPermission: '', ResourceType: 'Database' },
    { Name: 'PublicData', PublicPermission: 'RW', ResourceType: 'Database' },
  ],
  apps: [],
});

test('an unconditional role path remains unconditional when a shorter escalation path exists', () => {
  const data = fixture();
  data.roles = [
    {
      Name: 'Conditional',
      Description: '',
      GrantedRoles: ['Target'],
      Resources: [],
      EscalationOnly: true,
    },
    {
      Name: 'Ordinary',
      Description: '',
      GrantedRoles: ['Middle'],
      Resources: [],
      EscalationOnly: false,
    },
    {
      Name: 'Middle',
      Description: '',
      GrantedRoles: ['Target'],
      Resources: [],
      EscalationOnly: false,
    },
    {
      Name: 'Target',
      Description: '',
      GrantedRoles: ['Leaf'],
      Resources: [],
      EscalationOnly: false,
    },
    {
      Name: 'Leaf',
      Description: '',
      GrantedRoles: [],
      Resources: [{ Name: 'Data', Permissions: 'R' }],
      EscalationOnly: false,
    },
  ];
  for (const roots of [
    ['Conditional', 'Ordinary'],
    ['Ordinary', 'Conditional'],
  ]) {
    const access = resolveAccess(data, roots);
    assert.equal(access.roles.get('Target')?.conditional, false);
    assert.deepEqual(access.roles.get('Target')?.roles, ['Ordinary', 'Middle', 'Target']);
    assert.equal(access.roles.get('Leaf')?.conditional, false);
    assert.equal(access.grants.get('Data')?.permissions, 'R');
  }
});

test('empty unavailable markers do not make unknown metadata authoritative', () => {
  const data = fixture();
  data.roles[1].unavailable = '';
  const resolved = resolveAccess(data, ['Reader']);
  assert.equal(resolved.grants.size, 0);
  assert.match(resolved.warnings.join(' '), /unknown/);
  data.users[0].Roles = ['%All'];
  data.users[0].unavailable = '';
  data.apps = [
    {
      Name: '/public',
      Enabled: true,
      AutheEnabled: 64,
      Resource: '',
      NameSpace: 'USER',
      unavailable: '',
    },
  ];
  assert.ok(!findings(data).some((f) => f.kind === 'user' || f.kind === 'app'));
});

test('generated cyclic graphs agree with independent unconditional reachability', () => {
  let seed = 1701;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let sample = 0; sample < 80; sample++) {
    const data = fixture();
    data.roles = Array.from({ length: 8 }, (_, i) => ({
      Name: 'R' + i,
      Description: '',
      GrantedRoles: Array.from({ length: random() % 5 }, () => 'R' + (random() % 8)),
      EscalationOnly: random() % 4 === 0,
      Resources: [{ Name: 'Data', Permissions: i % 2 ? 'R' : 'W' }],
    }));
    const roots = ['R' + (random() % 8), 'R' + (random() % 8)];
    function reachable(ordinaryOnly: boolean) {
      const seen = new Set<string>(),
        pending = [...roots];
      while (pending.length) {
        const name = pending.pop()!,
          role = data.roles.find((r) => r.Name === name)!;
        if (seen.has(name) || (ordinaryOnly && role.EscalationOnly)) continue;
        seen.add(name);
        pending.push(...role.GrantedRoles);
      }
      return seen;
    }
    const all = reachable(false),
      ordinary = reachable(true);
    const actual = resolveAccess(data, roots);
    assert.deepEqual([...actual.roles.keys()].sort(), [...all].sort());
    for (const [name, path] of actual.roles) {
      assert.equal(path.conditional, !ordinary.has(name));
      assert.ok(roots.includes(path.roles[0]));
      assert.equal(path.roles.at(-1), name);
      assert.equal(new Set(path.roles).size, path.roles.length);
    }
  }
});

test('nested role grants are unioned with a shortest source path', () => {
  const access = resolveAccess(fixture(), ['Parent', 'Writer']);
  assert.equal(access.grants.get('Data')?.permissions, 'RW');
  assert.deepEqual(access.roles.get('Reader')?.roles, ['Parent', 'Reader']);
  assert.equal(access.broadAccess, false);
  assert.equal(access.roles.has('Elevated'), false);
});
test('removing one root preserves grants from remaining paths', () => {
  const access = resolveAccess(fixture(), ['Parent']);
  assert.equal(access.grants.get('Data')?.permissions, 'R');
  assert.equal(access.roles.has('Writer'), false);
});
test('cycles terminate and missing details remain explicit unknowns', () => {
  const data = fixture();
  data.roles[1].GrantedRoles = ['Parent', 'Missing'];
  const access = resolveAccess(data, ['Parent']);
  assert.equal(access.roles.size, 3);
  assert.equal(access.warnings.length, 2);
  assert.match(access.warnings.join(' '), /cycle/);
  assert.match(access.warnings.join(' '), /unknown/);
});
test('%All is marked but never expanded into fabricated explicit permissions', () => {
  const access = resolveAccess(fixture(), ['Elevated']);
  assert.equal(access.broadAccess, true);
  assert.equal(access.grants.size, 0);
  assert.equal(access.roles.get('%All')?.conditional, true);
});
test('review prompts distinguish active accounts, public write and enabled guest routes', () => {
  const data = fixture();
  data.users[0].Roles = ['%All'];
  data.users.push({ Name: 'disabled', Enabled: false, Roles: ['%All'], EscalationRoles: [] });
  data.apps = [
    { Name: '/public', Enabled: true, AutheEnabled: 64, Resource: '', NameSpace: 'USER' },
    { Name: '/off', Enabled: false, AutheEnabled: 64, Resource: '', NameSpace: 'USER' },
  ];
  assert.deepEqual(
    findings(data).map((f) => f.id),
    ['all:operator', 'public:PublicData', 'guest:/public'],
  );
});
test('comparison ignores unordered lists and reports actual changed records', () => {
  const before = fixture(),
    after = fixture();
  after.users[0].Roles.reverse();
  after.roles.reverse();
  assert.equal(compareSnapshots(before, after).length, 0);
  after.users[0].Enabled = false;
  assert.deepEqual(
    compareSnapshots(before, after).map((d) => [d.kind, d.name, d.change]),
    [['users', 'operator', 'changed']],
  );
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
});
test('incomplete or different-instance captures cannot imply deleted records', () => {
  const before = fixture(),
    after = fixture();
  after.users = [];
  after.warnings = ['Permission denied'];
  assert.throws(() => compareSnapshots(before, after), /complete/);
  after.warnings = [];
  after.instance = 'another:52773';
  assert.throws(() => compareSnapshots(before, after), /different/);
});
test('baseline parser rejects injected fields and oversized collections', () => {
  assert.equal(parseSnapshot(fixture()).version, 1);
  assert.throws(() => parseSnapshot({ ...fixture(), command: 'delete' }));
  assert.throws(() => parseSnapshot({ ...fixture(), users: Array(201).fill(fixture().users[0]) }));
});

test('a baseline cannot hide changed identities by omitting incompleteness warnings', () => {
  for (const kind of ['users', 'roles', 'apps'] as const) {
    const before = fixture(),
      after = fixture();
    before.apps = [
      { Name: '/private', Enabled: true, AutheEnabled: 32, Resource: 'Data', NameSpace: 'USER' },
    ];
    after.apps = structuredClone(before.apps);
    before[kind][0].unavailable = '';
    after.users[0].Roles = ['%All'];
    const imported = parseSnapshot(JSON.parse(JSON.stringify(before)));
    assert.deepEqual(imported.warnings, []);
    assert.throws(() => compareSnapshots(imported, after), /complete/);
    assert.throws(() => compareSnapshots(after, imported), /complete/);
  }
});

test('baseline parser rejects nested prototype fields and keeps identity names as data', () => {
  const baseline = JSON.parse(JSON.stringify(fixture()));
  baseline.users[0] = JSON.parse(
    '{"Name":"__proto__","Enabled":true,"Roles":[],"EscalationRoles":[],"__proto__":{"polluted":true}}',
  );
  assert.throws(() => parseSnapshot(baseline));
  delete baseline.users[0].__proto__;
  const parsed = parseSnapshot(baseline);
  assert.equal(parsed.users[0].Name, '__proto__');
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
test('capture only returns selected access metadata, never account secrets', async () => {
  const client = new IrisClient('http://iris', async (input) => {
    const path = new URL(String(input)).pathname;
    const data = path.endsWith('/users')
      ? [{ Name: 'u', Enabled: true }]
      : path.endsWith('/user')
        ? { Roles: ['Reader'], Password: 'must-not-leak', EmailAddress: 'private@example.test' }
        : [];
    return Response.json({ result: data });
  });
  const result = await captureAccess(client, 'auth', 'iris');
  assert.equal(result.users[0].Name, 'u');
  assert.equal(JSON.stringify(result).includes('Password'), false);
  assert.equal(JSON.stringify(result).includes('EmailAddress'), false);
});
test('capture reports denied lists and caps detail concurrency', async () => {
  let active = 0,
    max = 0;
  const client = new IrisClient('http://iris', async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/roles'))
      return Response.json({ status: { errors: ['denied'] } }, { status: 403 });
    if (path.endsWith('/users'))
      return Response.json({
        result: Array.from({ length: 20 }, (_, i) => ({ Name: 'u' + i, Enabled: true })),
      });
    if (path.endsWith('/user')) {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 3));
      active--;
      return Response.json({ result: { Roles: [] } });
    }
    return Response.json({ result: [] });
  });
  const result = await captureAccess(client, 'auth', 'iris');
  assert.ok(max <= 6);
  assert.equal(result.users.length, 20);
  assert.match(result.warnings.join(' '), /denied/);
});
