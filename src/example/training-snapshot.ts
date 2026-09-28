import { parseSnapshot } from '../../shared/snapshot-schema';

// Deliberately synthetic configuration, shared by both example views.
export const trainingSnapshot = parseSnapshot({
  version: 1,
  instance: 'synthetic-training',
  startedAt: '2026-09-28T09:00:00.000Z',
  capturedAt: '2026-09-28T09:00:00.000Z',
  warnings: [],
  users: [
    {
      Name: 'alex.training',
      Enabled: true,
      Roles: ['SupportTeam', 'ReportingReader'],
      EscalationRoles: [],
    },
  ],
  roles: [
    {
      Name: 'SupportTeam',
      Description: 'Training support assignment',
      GrantedRoles: ['OrdersWriter'],
      Resources: [],
      EscalationOnly: false,
    },
    {
      Name: 'OrdersWriter',
      Description: 'Read and write training orders',
      GrantedRoles: [],
      Resources: [{ Name: 'TrainingOrders', Permissions: 'RW' }],
      EscalationOnly: false,
    },
    {
      Name: 'ReportingReader',
      Description: 'Independent reporting assignment',
      GrantedRoles: ['OrdersReader'],
      Resources: [],
      EscalationOnly: false,
    },
    {
      Name: 'OrdersReader',
      Description: 'Read training orders',
      GrantedRoles: [],
      Resources: [{ Name: 'TrainingOrders', Permissions: 'R' }],
      EscalationOnly: false,
    },
  ],
  resources: [
    { Name: 'TrainingOrders', PublicPermission: '', ResourceType: 'User-defined' },
    { Name: 'TrainingStatus', PublicPermission: 'R', ResourceType: 'User-defined' },
  ],
  apps: [],
});
