import { compareSnapshots, resolveAccess } from '../../shared/access-model';
import { parseSnapshot } from '../../shared/snapshot-schema';
import { trainingSnapshot } from './training-snapshot';

// A second supplied training capture, never an API response or write receipt.
export const trainingAfter = parseSnapshot({
  ...trainingSnapshot,
  startedAt: '2026-09-28T09:10:00.000Z',
  capturedAt: '2026-09-28T09:10:00.000Z',
  users: trainingSnapshot.users.map((user) => ({
    ...user,
    Roles: user.Roles.filter((role) => role !== 'SupportTeam'),
  })),
});

export function trainingReviewOutcome() {
  const account = trainingSnapshot.users[0];
  const before = resolveAccess(trainingSnapshot, account.Roles);
  const after = resolveAccess(trainingAfter, trainingAfter.users[0].Roles);
  const resource = 'TrainingOrders';
  const paths = (access: ReturnType<typeof resolveAccess>) =>
    (access.grants.get(resource)?.sources ?? []).map((role) =>
      [account.Name, ...(access.roles.get(role)?.roles ?? [role]), resource].join(' → '),
    );
  return {
    account: account.Name,
    resource,
    before: before.grants.get(resource)?.permissions ?? '—',
    after: after.grants.get(resource)?.permissions ?? '—',
    beforePaths: paths(before),
    afterPaths: paths(after),
    changes: compareSnapshots(trainingSnapshot, trainingAfter),
  };
}

export function trainingReviewReport(note: string): string {
  const result = trainingReviewOutcome();
  return [
    'Access Atlas — training review',
    'SYNTHETIC EXAMPLE. No IRIS connection, native change or live readback.',
    '',
    'Objective: remove the support assignment after an employee moves to reporting.',
    `Account: ${result.account}`,
    `Resource: ${result.resource}`,
    `Supplied before capture: ${trainingSnapshot.capturedAt}`,
    `Supplied after capture: ${trainingAfter.capturedAt}`,
    '',
    'Before — declared paths:',
    ...result.beforePaths,
    '',
    'After — declared paths:',
    ...result.afterPaths,
    '',
    `Declared permissions: ${result.before} → ${result.after}`,
    `Changed objects: ${result.changes.map((change) => `${change.kind}/${change.name} (${change.change})`).join(', ')}`,
    'SupportTeam is absent from the supplied after capture. ReportingReader remains assigned.',
    'Write permission is absent from these declared paths. Read permission remains through OrdersReader.',
    '',
    'Open follow-up: confirm with the account owner whether reporting access is still required.',
    'Public TrainingStatus read permission is unchanged and independent of these assignments.',
    'Configuration comparison does not establish runtime authorization or who made a change.',
    'Application roles, escalation, SQL privileges and row policies are outside this example.',
    '',
    'Reviewer note (entered in this browser; not a saved campaign decision):',
    note.trim() || '(none)',
    '',
    'This file records a training exercise. It is not a remediation receipt or approval.',
  ].join('\n');
}
