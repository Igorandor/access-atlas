import { parseSnapshot } from '../../shared/snapshot-schema';
export const scenarios = [
  'Missing role',
  'Denied role',
  'Known grants plus unknown',
  'Proven broad path plus unknown',
  'Readable cycle',
  'Unrelated denied role',
  'Unavailable account',
  'Complete empty role',
];
export function incompleteSnapshot(scenario) {
  const role = (Name, GrantedRoles = [], Resources = []) => ({
    Name,
    Description: 'Synthetic role',
    GrantedRoles,
    Resources,
    EscalationOnly: false,
  });
  const value = {
    version: 1,
    instance: 'synthetic-only',
    startedAt: '2026-09-28T12:00:00.000Z',
    capturedAt: '2026-09-28T12:00:00.000Z',
    users: [{ Name: 'review.training', Enabled: true, Roles: ['HiddenRole'], EscalationRoles: [] }],
    roles: [],
    resources: [{ Name: 'TrainingOrders', PublicPermission: 'R', ResourceType: 'User-defined' }],
    apps: [],
    warnings: [],
  };
  if (scenario === 'Denied role')
    value.roles = [{ ...role('HiddenRole'), unavailable: 'Synthetic role read denied403' }];
  if (scenario === 'Complete empty role') value.roles = [role('HiddenRole')];
  if (scenario === 'Known grants plus unknown') {
    value.users[0].Roles = ['Reader', 'HiddenRole'];
    value.roles = [role('Reader', [], [{ Name: 'TrainingOrders', Permissions: 'R' }])];
  }
  if (scenario === 'Proven broad path plus unknown') {
    value.users[0].Roles = ['%All', 'HiddenRole'];
    value.roles = [role('%All')];
  }
  if (scenario === 'Readable cycle') {
    value.users[0].Roles = ['Cycle'];
    value.roles = [role('Cycle', ['Cycle'], [{ Name: 'TrainingOrders', Permissions: 'R' }])];
  }
  if (scenario === 'Unrelated denied role') {
    value.users[0].Roles = ['Reader'];
    value.roles = [
      role('Reader', [], [{ Name: 'TrainingOrders', Permissions: 'R' }]),
      { ...role('Unused'), unavailable: 'Synthetic unrelated refusal' },
    ];
  }
  if (scenario === 'Unavailable account') {
    value.users[0].Roles = ['Reader', '%All'];
    value.users[0].unavailable = 'Synthetic account read denied403';
    value.roles = [
      role('Reader', [], [{ Name: 'TrainingOrders', Permissions: 'RW' }]),
      role('%All'),
    ];
  }
  return parseSnapshot(value);
}
