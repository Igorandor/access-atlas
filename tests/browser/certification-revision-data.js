import { validateCampaign } from '../../shared/campaign';
export const originalCaptureId = '11111111-1111-4111-8111-111111111111';
export const nextCaptureId = '33333333-3333-4333-8333-333333333333';
export function revisionCampaign() {
  const at = '2026-09-28T12:00:00.000Z';
  return validateCampaign({
    version: 1,
    id: '22222222-2222-4222-8222-222222222222',
    instance: 'synthetic-only',
    owner: 'Fixture',
    title: 'Certification revision review',
    description: 'Synthetic review; no native or durable changes.',
    state: 'active',
    revision: 1,
    createdAt: at,
    updatedAt: at,
    rules: [],
    policies: [],
    decisions: [],
    remediations: [],
    certificationScope: { enabled: true, kinds: ['accounts'], prefix: '', includeDisabled: false },
    certifications: [],
    captures: [
      {
        id: originalCaptureId,
        label: 'Original access',
        snapshot: {
          version: 1,
          instance: 'synthetic-only',
          startedAt: at,
          capturedAt: at,
          warnings: [],
          users: Array.from({ length: 31 }, (_, i) => ({
            Name: 'Account' + String(i + 1).padStart(2, '0'),
            Enabled: true,
            Roles: [],
            EscalationRoles: [],
          })),
          roles: [],
          resources: [],
          apps: [],
        },
      },
    ],
    history: [{ revision: 1, at, actor: 'Fixture', action: 'created', detail: 'Campaign created' }],
  });
}
export function advanceRevision(campaign, action, update) {
  const next = structuredClone(campaign);
  update(next);
  next.revision++;
  next.history.push({
    revision: next.revision,
    at: '2026-09-28T16:00:00.000Z',
    actor: 'Fixture',
    action,
    detail: 'Synthetic ' + action,
  });
  return validateCampaign(next);
}
export function addCapture(campaign) {
  return advanceRevision(campaign, 'capture', (next) => {
    const capture = structuredClone(next.captures.at(-1));
    capture.id = nextCaptureId;
    capture.label = 'New administrator grant';
    capture.snapshot.users[0].Roles = ['%All'];
    capture.snapshot.roles = [
      {
        Name: '%All',
        Description: 'All privileges',
        GrantedRoles: [],
        Resources: [],
        EscalationOnly: false,
      },
    ];
    next.captures.push(capture);
  });
}
export function decision(
  campaign,
  note = 'Other reviewer requires investigation',
  outcome = 'investigate',
) {
  return {
    kind: 'accounts',
    name: 'Account01',
    captureId: campaign.captures.at(-1).id,
    outcome,
    note,
    reviewedAt: '2026-09-28T16:00:00.000Z',
  };
}
