import { revisionCampaign, advanceRevision } from './certification-revision-data';
import { validateCampaign } from '../../shared/campaign';
export function remediationCampaign() {
  const campaign = revisionCampaign();
  campaign.captures[0].snapshot.users = [
    { Name: 'Account01', Enabled: true, Roles: ['%All', 'Reader'], EscalationRoles: [] },
  ];
  campaign.captures[0].snapshot.roles = ['%All', 'Reader', 'Backup'].map((Name) => ({
    Name,
    Description: Name,
    GrantedRoles: [],
    Resources: [],
    EscalationOnly: false,
  }));
  return validateCampaign(campaign);
}
export function remediationReview(campaign, sequence = 1) {
  const before = { Roles: campaign.captures.at(-1).snapshot.users[0].Roles };
  const expected = { Roles: before.Roles.filter((role) => role !== '%All') };
  const now = Date.now();
  return {
    id: '44444444-4444-4444-8444-' + String(sequence).padStart(12, '0'),
    title: 'Remove direct role %All from Account01',
    target: 'Account01',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 600000).toISOString(),
    operation: {
      path: '/v2/security/user',
      method: 'PUT',
      query: { name: 'Account01' },
      body: expected,
    },
    before,
    expected,
    existence: 'present',
    verification: 'Synthetic current roles read',
    warnings: [],
  };
}
export function recordReview(campaign, input, review) {
  return advanceRevision(campaign, 'remediation-reviewed', (next) =>
    next.remediations.push({
      id: review.id,
      findingId: input.findingId,
      fingerprint: input.fingerprint,
      title: review.title,
      target: review.target,
      reason: input.reason,
      createdAt: review.createdAt,
      updatedAt: review.createdAt,
      status: 'reviewed',
      path: review.operation.path,
      method: 'PUT',
      message: review.verification,
      checkedFields: [],
      expected: review.expected,
    }),
  );
}
export function remoteCapture(campaign, remove = false) {
  return advanceRevision(campaign, 'capture', (next) => {
    const capture = structuredClone(next.captures.at(-1));
    capture.id = '55555555-5555-4555-8555-' + String(next.revision).padStart(12, '0');
    capture.label = 'Remote access change';
    capture.snapshot.users[0].Roles = remove ? ['Reader'] : ['%All', 'Reader', 'Backup'];
    next.captures.push(capture);
  });
}
