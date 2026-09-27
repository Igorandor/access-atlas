import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  evaluatePolicies,
  reviewPoliciesSchema,
  type ReviewPolicy,
} from '../shared/review-policies';
import { draftRemediation } from '../shared/remediation';
import { findings, type AccessSnapshot } from '../shared/access-model';
const snapshot: AccessSnapshot = {
  version: 1,
  instance: 'policy-test',
  startedAt: '2026-09-27T00:00:00Z',
  capturedAt: '2026-09-27T00:00:00Z',
  warnings: [],
  users: [
    { Name: 'alice', Enabled: true, Roles: ['Reader'], EscalationRoles: ['Writer'] },
    { Name: 'disabled', Enabled: false, Roles: ['Writer'], EscalationRoles: [] },
  ],
  roles: [
    {
      Name: 'Reader',
      Description: '',
      GrantedRoles: [],
      EscalationOnly: false,
      Resources: [{ Name: 'Data', Permissions: 'R' }],
    },
    {
      Name: 'Writer',
      Description: '',
      GrantedRoles: [],
      EscalationOnly: false,
      Resources: [{ Name: 'Data', Permissions: 'W' }],
    },
  ],
  resources: [{ Name: 'Data', PublicPermission: '', ResourceType: 'User' }],
  apps: [{ Name: '/public', Enabled: true, AutheEnabled: 96, Resource: 'Data', NameSpace: 'USER' }],
};
function common() {
  return {
    id: randomUUID(),
    title: 'Policy',
    rationale: '',
    severity: 'medium' as const,
    enabled: true,
    scope: { names: [], prefix: '', includeDisabled: false },
  };
}
test('role policies distinguish conditional membership, missing evidence and excluded accounts', () => {
  const policy: ReviewPolicy = {
    ...common(),
    kind: 'account-roles',
    roles: ['Writer'],
    requirement: 'none',
    includeEscalation: true,
  };
  const rows = evaluatePolicies(snapshot, [policy]);
  assert.equal(rows[0].result, 'conditional');
  assert.equal(rows[1].result, 'excluded');
  assert.match(rows[0].explanation, /Conditional memberships: Writer/);
  const changed = structuredClone(snapshot);
  changed.users[0].unavailable = 'Denied';
  assert.equal(evaluatePolicies(changed, [policy])[0].result, 'unknown');
});
test('public privilege policies and empty scopes do not imply silent compliance', () => {
  const policy: ReviewPolicy = { ...common(), kind: 'public-resource', prohibited: 'W' };
  assert.equal(evaluatePolicies(snapshot, [policy])[0].result, 'pass');
  const changed = structuredClone(snapshot);
  changed.resources[0].PublicPermission = 'RW';
  assert.equal(evaluatePolicies(changed, [policy])[0].result, 'finding');
  policy.scope.prefix = 'Missing';
  assert.equal(evaluatePolicies(changed, [policy])[0].result, 'unknown');
});
test('application policy points to the actual guest flag and resource boundary', () => {
  const policy: ReviewPolicy = {
    ...common(),
    kind: 'application-entry',
    requireAuthentication: true,
    requireResource: true,
    namespaces: ['USER'],
  };
  const rows = evaluatePolicies(snapshot, [policy]);
  assert.equal(rows[0].result, 'finding');
  assert.match(rows[0].explanation, /Unauthenticated/);
  const finding = findings(snapshot)[0];
  const draft = draftRemediation(snapshot, finding, { action: 'require-authentication' });
  assert.deepEqual(draft.operation.body, { AutheEnabled: 32 });
  const changed = structuredClone(snapshot);
  changed.apps[0].AutheEnabled = 64;
  assert.throws(
    () => draftRemediation(changed, findings(changed)[0], { action: 'require-authentication' }),
    /no other authentication/,
  );
});
test('policy IDs are unique and remediation cannot be redirected to an arbitrary action', () => {
  const policy: ReviewPolicy = { ...common(), kind: 'public-resource', prohibited: 'W' };
  assert.throws(() => reviewPoliciesSchema.parse([policy, policy]));
  assert.throws(
    () => draftRemediation(snapshot, findings(snapshot)[0], { action: 'disable-account' }),
    /supported remediation/,
  );
});
test('inheritance policies terminate cycles and explain the affected graph', () => {
  const changed = structuredClone(snapshot);
  changed.roles[0].GrantedRoles = ['Writer'];
  changed.roles[1].GrantedRoles = ['Reader'];
  const policy: ReviewPolicy = {
    ...common(),
    kind: 'role-inheritance',
    maximumDepth: 3,
    prohibitedRoles: ['Writer'],
  };
  const rows = evaluatePolicies(changed, [policy]);
  assert.equal(rows[0].result, 'finding');
  assert.match(rows[0].explanation, /cycle/);
});
