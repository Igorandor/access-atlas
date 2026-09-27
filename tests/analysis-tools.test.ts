import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  explainAccount,
  accountResources,
  compareAccounts,
  roleCycles,
  roleImpact,
  resourceCoverage,
  cleanupSuggestions,
} from '../shared/access-analysis';
import { simulateAccess } from '../shared/access-simulation';
import type { AccessSnapshot } from '../shared/access-model';
function graph(): AccessSnapshot {
  return {
    version: 1,
    instance: 'A',
    startedAt: '2026-09-27T00:00:00Z',
    capturedAt: '2026-09-27T00:00:00Z',
    warnings: [],
    users: [
      { Name: 'alice', Enabled: true, Roles: ['Reader', 'Team'], EscalationRoles: ['Writer'] },
      { Name: 'bob', Enabled: true, Roles: ['Reader'], EscalationRoles: [] },
    ],
    roles: [
      {
        Name: 'Reader',
        Description: '',
        GrantedRoles: [],
        Resources: [{ Name: 'Data', Permissions: 'R' }],
        EscalationOnly: false,
      },
      {
        Name: 'Team',
        Description: '',
        GrantedRoles: ['Reader'],
        Resources: [],
        EscalationOnly: false,
      },
      {
        Name: 'Writer',
        Description: '',
        GrantedRoles: [],
        Resources: [{ Name: 'Data', Permissions: 'W' }],
        EscalationOnly: false,
      },
    ],
    resources: [{ Name: 'Data', PublicPermission: '', ResourceType: 'User' }],
    apps: [{ Name: '/app', Enabled: true, Resource: 'Data', NameSpace: 'USER', AutheEnabled: 32 }],
  };
}
test('analysis keeps conditional grants separate and explains inherited ordinary paths', () => {
  const snapshot = graph();
  const access = explainAccount(snapshot, snapshot.users[0]);
  const resource = accountResources(snapshot, access)[0];
  assert.equal(resource.ordinary, 'R');
  assert.equal(resource.conditional, 'W');
  assert.equal(resourceCoverage(snapshot, 'Data', 'W')[0].status, 'conditional grant');
  const impact = roleImpact(snapshot, 'Reader');
  assert.deepEqual(impact.directParents, ['Team']);
  assert.equal(impact.applications[0].Name, '/app');
});
test('same resource exposed through an ordinary and conditional path retains both', () => {
  const snapshot = graph();
  snapshot.users[0].Roles.push('Writer');
  const access = explainAccount(snapshot, snapshot.users[0]);
  assert.equal(accountResources(snapshot, access)[0].ordinary, 'RW');
  assert.equal(accountResources(snapshot, access)[0].conditional, 'W');
  assert.equal(resourceCoverage(snapshot, 'Data', 'W')[0].status, 'ordinary grant');
});
test('undefined resources and unreadable roles never become asserted denial', () => {
  const snapshot = graph();
  snapshot.roles[0].Resources.push({ Name: 'Missing', Permissions: 'U' });
  const comparison = compareAccounts(snapshot, 'alice', 'bob');
  assert.ok(comparison.resources.find((row) => row.name === 'Missing')?.left.unknown);
  snapshot.users[1].Roles = ['MissingRole'];
  assert.equal(resourceCoverage(snapshot, 'Data', 'W')[1].status, 'unknown');
});
test('cycle components and redundant assignment candidates do not recurse indefinitely', () => {
  const snapshot = graph();
  assert.ok(
    cleanupSuggestions(snapshot).some(
      (row) => row.kind === 'redundant-assignment' && row.subject === 'alice',
    ),
  );
  snapshot.roles[0].GrantedRoles = ['Team'];
  assert.deepEqual(roleCycles(snapshot), [['Reader', 'Team']]);
  assert.ok(
    explainAccount(snapshot, snapshot.users[0]).unknown.some((warning) =>
      warning.includes('cycle'),
    ),
  );
});
test('role-removal simulation preserves alternate inherited grant and never mutates its input', () => {
  const snapshot = graph();
  const before = JSON.stringify(snapshot);
  const result = simulateAccess(snapshot, [
    { kind: 'account-role', account: 'alice', role: 'Reader', mode: 'remove', escalation: false },
  ]);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(result.affected.length, 1);
  assert.equal(result.affected[0].resources.length, 0);
  assert.equal(result.affected[0].assignedChanged, true);
  const removed = simulateAccess(snapshot, [
    { kind: 'account-role', account: 'alice', role: 'Reader', mode: 'remove', escalation: false },
    { kind: 'role-inheritance', role: 'Team', inherited: 'Reader', mode: 'remove' },
  ]);
  assert.equal(removed.affected[0].resources[0].after.ordinary, '');
});
test('public grant simulation affects every captured account and rejects unknown targets', () => {
  const snapshot = graph();
  assert.equal(
    simulateAccess(snapshot, [{ kind: 'public-grant', resource: 'Data', permissions: 'RW' }])
      .affected.length,
    2,
  );
  assert.throws(
    () => simulateAccess(snapshot, [{ kind: 'account-state', account: 'unknown', enabled: true }]),
    /readable/,
  );
});
