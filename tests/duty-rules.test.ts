import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDuties } from '../shared/duty-rules.js';
import type { AccessSnapshot } from '../shared/access-model.js';
function fixture(): AccessSnapshot {
  return {
    version: 1,
    startedAt: '2026-09-26',
    capturedAt: '2026-09-26',
    instance: 'test',
    warnings: [],
    apps: [],
    resources: [],
    users: [{ Name: 'operator', Enabled: true, Roles: ['Parent'], EscalationRoles: [] }],
    roles: ['Parent', 'Request', 'Approve'].map((Name) => ({
      Name,
      Description: '',
      GrantedRoles: Name === 'Parent' ? ['Request', 'Approve'] : [],
      Resources: [],
      EscalationOnly: false,
    })),
  };
}
const rules = [{ title: 'Independent approval', left: 'Request', right: 'Approve' }];
test('inherited duty conflict includes both paths and terminates cycles', () => {
  const s = fixture();
  s.roles[1].GrantedRoles = ['Parent'];
  const [r] = checkDuties(s, rules);
  assert.equal(r.status, 'conflict');
  assert.deepEqual(r.right, ['Parent', 'Approve']);
});
test('escalation is conditional while an ordinary path wins', () => {
  const s = fixture();
  s.roles[0].GrantedRoles = ['Request'];
  s.users[0].EscalationRoles = ['Approve'];
  assert.equal(checkDuties(s, rules)[0].status, 'conditional');
  s.users[0].Roles.push('Approve');
  assert.equal(checkDuties(s, rules)[0].status, 'conflict');
});
test('unreadable users never establish a definite conflict', () => {
  const s = fixture();
  s.users[0].unavailable = '';
  assert.equal(checkDuties(s, rules)[0].status, 'unknown');
});
test('missing role evidence is unknown; disabled accounts are excluded', () => {
  const s = fixture();
  s.roles[0].GrantedRoles = ['Request'];
  s.roles.pop();
  assert.equal(checkDuties(s, rules)[0].status, 'unknown');
  s.users[0].Enabled = false;
  assert.deepEqual(checkDuties(s, rules), []);
});
test('no observed pair is not an authorization denial, and invalid rules are rejected', () => {
  const s = fixture();
  s.roles[0].GrantedRoles = ['Request'];
  assert.equal(checkDuties(s, rules)[0].status, 'no conflict observed');
  assert.throws(() => checkDuties(s, [{ title: 'same', left: 'Request', right: 'Request' }]));
  assert.throws(() => checkDuties(s, Array(21).fill(rules[0])));
});
