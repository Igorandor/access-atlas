import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  investigateAccess,
  runInquiryBatch,
  candidateRoles,
  inquiryCsv,
} from '../shared/access-inquiry';
import { buildDriftReport, captureTimeline, driftCsv } from '../shared/access-drift';
import { reviewDateSchema } from '../shared/review-date';
import {
  carryCertifications,
  certificationCoverage,
  certificationScopeSchema,
} from '../shared/certification';
import {
  buildCampaignReport,
  campaignReportHtml,
  campaignReportMarkdown,
  campaignAgenda,
} from '../shared/campaign-report';
import { nextPeriodSettings } from '../shared/campaign-period';
import { validateCampaign, type Campaign } from '../shared/campaign';
import type { AccessSnapshot } from '../shared/access-model';

function snapshot(): AccessSnapshot {
  return {
    version: 1,
    instance: 'review-test',
    startedAt: '2026-09-27T10:00:00.000Z',
    capturedAt: '2026-09-27T10:01:00.000Z',
    warnings: [],
    users: [{ Name: 'alice', Enabled: true, Roles: ['Team'], EscalationRoles: ['Writer'] }],
    roles: [
      {
        Name: 'Team',
        Description: '',
        GrantedRoles: ['Reader'],
        Resources: [],
        EscalationOnly: false,
      },
      {
        Name: 'Reader',
        Description: '',
        GrantedRoles: [],
        Resources: [{ Name: 'Data', Permissions: 'RU' }],
        EscalationOnly: false,
      },
      {
        Name: 'Writer',
        Description: '',
        GrantedRoles: [],
        Resources: [{ Name: 'Data', Permissions: 'W' }],
        EscalationOnly: false,
      },
      { Name: '%All', Description: '', GrantedRoles: [], Resources: [], EscalationOnly: false },
    ],
    resources: [{ Name: 'Data', PublicPermission: '', ResourceType: 'Application' }],
    apps: [{ Name: '/app', Enabled: true, Resource: 'Data', NameSpace: 'USER', AutheEnabled: 32 }],
  };
}
function campaign(): Campaign {
  const now = '2026-09-27T10:01:00.000Z';
  return validateCampaign({
    version: 1,
    id: randomUUID(),
    instance: 'review-test',
    owner: 'reviewer',
    title: 'Quarterly review',
    description: '',
    state: 'active',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    rules: [],
    policies: [],
    captures: [{ id: randomUUID(), label: 'First', snapshot: snapshot() }],
    decisions: [],
    remediations: [],
    certificationScope: { enabled: true, kinds: ['accounts'], prefix: '', includeDisabled: true },
    certifications: [],
    history: [{ revision: 1, at: now, actor: 'reviewer', action: 'created', detail: '' }],
  });
}

test('access inquiry distinguishes ordinary, conditional, public and disabled observations', () => {
  const data = snapshot();
  const query = {
    account: 'alice',
    targetKind: 'resource' as const,
    target: 'Data',
    permission: 'R' as const,
  };
  const ordinary = investigateAccess(data, query);
  assert.equal(ordinary.disposition, 'ordinary-grant');
  assert.deepEqual(ordinary.sources.find((grant) => grant.permissions.includes('R'))?.path, [
    'Team',
    'Reader',
  ]);
  assert.equal(
    investigateAccess(data, { ...query, permission: 'W' }).disposition,
    'conditional-grant',
  );
  data.resources[0].PublicPermission = 'W';
  assert.equal(investigateAccess(data, { ...query, permission: 'W' }).disposition, 'public-grant');
  data.users[0].Enabled = false;
  assert.equal(investigateAccess(data, query).disposition, 'disabled');
});
test('application inquiry fixes entry permission to Use and does not claim no-resource entry is authorized', () => {
  const data = snapshot();
  const query = {
    account: 'alice',
    targetKind: 'application' as const,
    target: '/app',
    permission: 'W' as const,
  };
  const result = investigateAccess(data, query);
  assert.equal(result.request.permission, 'U');
  assert.equal(result.disposition, 'ordinary-grant');
  data.apps[0].Resource = '';
  assert.equal(investigateAccess(data, query).disposition, 'unknown');
  data.apps[0].Enabled = false;
  assert.equal(investigateAccess(data, query).disposition, 'disabled');
});
test('missing role and resource details never produce a definite denial', () => {
  const data = snapshot();
  data.roles = [];
  const result = investigateAccess(data, {
    account: 'alice',
    targetKind: 'resource',
    target: 'Data',
    permission: 'R',
  });
  assert.equal(result.disposition, 'unknown');
  assert.ok(result.warnings.length);
  assert.throws(
    () =>
      investigateAccess(data, {
        account: 'other',
        targetKind: 'resource',
        target: 'Data',
        permission: 'R',
      }),
    /account/,
  );
});
test('inquiry lists reject cross-instance replay and retain per-question missing-target failures', () => {
  const data = snapshot();
  const input = {
    format: 'atlas-access-inquiries-1' as const,
    instance: data.instance,
    title: 'Checks',
    inquiries: [
      {
        account: 'alice',
        targetKind: 'resource' as const,
        target: 'Data',
        permission: 'R' as const,
      },
      {
        account: 'removed',
        targetKind: 'resource' as const,
        target: 'Data',
        permission: 'R' as const,
      },
    ],
  };
  const results = runInquiryBatch(data, input);
  assert.equal(results[0].result?.disposition, 'ordinary-grant');
  assert.ok(results[1].error);
  assert.throws(() => runInquiryBatch(data, { ...input, instance: 'other' }), /different/);
  assert.throws(() =>
    runInquiryBatch(data, { ...input, inquiries: Array(51).fill(input.inquiries[0]) }),
  );
  results[0].query.account = '=DANGEROUS()';
  assert.match(inquiryCsv(results), /"'=DANGEROUS\(\)"/);
});
test('candidate roles count collateral resources and mark broad-role reachability', () => {
  const data = snapshot();
  data.roles[0].GrantedRoles.push('%All');
  const candidates = candidateRoles(data, 'Data', 'R');
  assert.equal(candidates[0].role, 'Reader');
  assert.equal(candidates.find((row) => row.role === 'Team')?.reachesAll, true);
  assert.equal(candidates.find((row) => row.role === 'Team')?.inherited, true);
});
test('drift traces inherited grant changes without attributing them to a direct assignment', () => {
  const before = snapshot();
  const after = structuredClone(before);
  after.capturedAt = '2026-09-27T11:00:00.000Z';
  after.roles[1].Resources[0].Permissions = 'RWU';
  const report = buildDriftReport(before, after);
  assert.equal(report.objects.length, 1);
  assert.equal(report.objects[0].kind, 'role');
  assert.equal(report.accounts[0].directAssignmentChanged, false);
  assert.equal(report.accounts[0].grants[0].ordinaryAdded, 'W');
  assert.equal(report.summary.gainedOrdinaryGrants, 1);
  assert.equal(report.summary.lostOrdinaryGrants, 0);
});
test('partial captures mark missing objects and finding disappearance as unknown', () => {
  const before = snapshot();
  before.users[0].Roles = ['%All'];
  const after = structuredClone(before);
  after.users = [];
  after.warnings.push('User list could not be read.');
  const report = buildDriftReport(before, after);
  assert.equal(report.objects.find((row) => row.kind === 'account')?.change, 'unknown');
  assert.equal(report.findings[0].status, 'unknown');
  assert.equal(report.summary.lostOrdinaryGrants, 0);
  assert.equal(report.complete, false);
});
test('drift flags reverse chronology, preserves CSV cells and rejects cross-instance data', () => {
  const before = snapshot();
  const after = structuredClone(before);
  after.capturedAt = '2026-09-26T00:00:00.000Z';
  after.resources[0].PublicPermission = 'R';
  const report = buildDriftReport(before, after);
  assert.equal(report.chronological, false);
  report.accounts[0].account = '@SUM(1)';
  assert.match(driftCsv(report), /"'@SUM\(1\)"/);
  after.instance = 'other';
  assert.throws(() => buildDriftReport(before, after), /same configured instance/);
});
test('capture timeline retains zero as a real count and no previous comparison as undefined', () => {
  const first = snapshot();
  const second = structuredClone(first);
  second.users = [];
  const rows = captureTimeline([
    { id: 'a', label: 'First', snapshot: first },
    { id: 'b', label: 'Second', snapshot: second },
  ]);
  assert.equal(rows[0].changedObjects, undefined);
  assert.equal(rows[1].accounts, 0);
  assert.equal(rows[1].changedObjects, 1);
});
test('review dates validate actual calendar days including leap years', () => {
  for (const value of ['2026-02-29', '2026-02-31', '2026-99-99', '2026-00-01', '2026-13-01'])
    assert.equal(reviewDateSchema.safeParse(value).success, false);
  for (const value of ['2024-02-29', '2026-09-27', '2000-02-29'])
    assert.equal(reviewDateSchema.safeParse(value).success, true);
  assert.equal(
    certificationScopeSchema.safeParse({
      enabled: true,
      kinds: ['accounts'],
      prefix: '',
      includeDisabled: true,
      dueDate: '2026-02-31',
    }).success,
    false,
  );
});
test('carried certification preserves human review time and invalidates changed dependencies', () => {
  const document = campaign();
  const capture = document.captures[0];
  const reviewedAt = '2026-09-25T00:00:00.000Z';
  const decision = {
    kind: 'accounts' as const,
    name: 'alice',
    captureId: capture.id,
    outcome: 'retain' as const,
    note: 'Required job access',
    reviewedAt,
  };
  const options = {
    before: capture.snapshot,
    after: structuredClone(capture.snapshot),
    previousCaptureId: capture.id,
    currentCaptureId: randomUUID(),
    scope: document.certificationScope,
    decisions: [decision],
    at: '2026-10-01T00:00:00.000Z',
  };
  const carried = carryCertifications(options);
  assert.equal(carried.carried, 1);
  assert.equal(carried.decisions[0].reviewedAt, reviewedAt);
  assert.equal(carried.decisions[0].captureId, options.currentCaptureId);
  options.after.roles[1].Resources[0].Permissions = 'RWU';
  assert.equal(carryCertifications(options).carried, 0);
});
test('certification coverage refuses unreadable and stale subjects', () => {
  const document = campaign();
  const latest = document.captures[0];
  const decision = {
    kind: 'accounts' as const,
    name: 'alice',
    captureId: latest.id,
    outcome: 'retain' as const,
    note: 'Job access',
    reviewedAt: latest.snapshot.capturedAt,
  };
  assert.equal(
    certificationCoverage(latest.snapshot, latest.id, document.certificationScope, [decision])
      .complete,
    true,
  );
  assert.equal(
    certificationCoverage(latest.snapshot, randomUUID(), document.certificationScope, [decision])
      .complete,
    false,
  );
  latest.snapshot.users[0].unavailable = '';
  assert.equal(
    certificationCoverage(latest.snapshot, latest.id, document.certificationScope, [decision])
      .complete,
    false,
  );
});
test('reports escape hostile notes and exclude optional sections without excluding limitations', () => {
  const document = campaign();
  document.title = '<script>alert(1)</script>';
  const report = buildCampaignReport(document, {
    authorNote: '<img src=x onerror=alert(2)>',
    include: [],
  });
  const html = campaignReportHtml(report);
  assert.doesNotMatch(html, /<script>|<img /);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /default-src 'none'/);
  assert.equal(report.findings, undefined);
  assert.equal(report.activity, undefined);
  assert.ok(report.limits.length);
  assert.match(campaignReportMarkdown(report), /\\<script\\>/);
});

test('Markdown retains remediation readback and reconciliation evidence when selected', () => {
  const document = campaign();
  document.remediations.push({
    id: randomUUID(),
    findingId: 'fixture',
    fingerprint: 'fixture',
    title: 'Disable account',
    target: 'alice',
    reason: 'Owner review',
    createdAt: document.createdAt,
    updatedAt: '2026-09-28T02:00:00Z',
    status: 'different',
    path: '/v2/security/user',
    method: 'PUT',
    message: 'Readback differs from the proposal.',
    checkedFields: ['Enabled', 'Roles'],
    reconciliation: 'Owner kept the service account. <script>data</script>',
  });
  const report = buildCampaignReport(document, { authorNote: '', include: ['remediations'] });
  const markdown = campaignReportMarkdown(report);
  assert.match(markdown, /Updated: 2026-09-28T02:00:00Z/);
  assert.match(markdown, /Checked fields: Enabled, Roles/);
  assert.ok(
    markdown.includes(
      'Reconciliation: Owner kept the service account\\. \\<script\\>data\\</script\\>',
    ),
  );
  assert.doesNotMatch(markdown, /<script>/);
  assert.doesNotMatch(
    campaignReportMarkdown(buildCampaignReport(document, { authorNote: '', include: [] })),
    /Owner kept the service account/,
  );
});
test('HTML and Markdown distinguish certification scopes even when their captured objects match', () => {
  const document = campaign();
  document.certificationScope = {
    enabled: true,
    kinds: ['accounts'],
    prefix: 'a',
    includeDisabled: false,
  };
  const options = { authorNote: '', include: [] };
  const at = new Date('2026-09-27T12:00:00Z');
  const first = buildCampaignReport(document, options, at);
  document.certificationScope = {
    ...document.certificationScope,
    prefix: 'alice',
    includeDisabled: true,
  };
  const second = buildCampaignReport(document, options, at);
  assert.deepEqual(first.counts, second.counts);
  assert.deepEqual(first.latestCapture, second.latestCapture);
  assert.equal(first.generatedAt, second.generatedAt);
  assert.notEqual(campaignReportHtml(first), campaignReportHtml(second));
  assert.notEqual(campaignReportMarkdown(first), campaignReportMarkdown(second));
  assert.match(campaignReportHtml(first), /<dt>Name prefix<\/dt><dd>a<\/dd>/);
  assert.match(campaignReportHtml(second), /<dt>Name prefix<\/dt><dd>alice<\/dd>/);
  assert.match(campaignReportMarkdown(first), /Disabled accounts and applications: Excluded/);
  assert.match(
    campaignReportMarkdown(second),
    /Disabled accounts and applications: Included when their object kind is selected/,
  );
});

test('scope is always exported with kinds, unrestricted names, disabled state and review due date', () => {
  const document = campaign();
  document.certificationScope = {
    enabled: false,
    kinds: ['roles', 'applications'],
    prefix: '',
    includeDisabled: false,
    dueDate: '2026-10-31',
  };
  const report = buildCampaignReport(document, { authorNote: '', include: [] });
  for (const rendered of [campaignReportHtml(report), campaignReportMarkdown(report)]) {
    for (const value of [
      'Certification scope',
      'Not enabled',
      'roles, applications',
      'All names',
      'Excluded',
      '2026-10-31',
    ])
      assert.ok(rendered.includes(value), value);
  }
});

test('scope prefixes remain escaped data in HTML and Markdown exports', () => {
  const document = campaign();
  document.certificationScope.prefix =
    '<img src=x onerror=alert(1)> & "team"\n## [Run](javascript:alert(1))';
  const report = buildCampaignReport(document, { authorNote: '', include: [] });
  const html = campaignReportHtml(report);
  const markdown = campaignReportMarkdown(report);
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;team&quot;/);
  assert.ok(markdown.includes('\\<img'));
  assert.ok(markdown.includes('\\#\\# \\[Run\\]\\(javascript:alert\\(1\\)\\)'));
  assert.doesNotMatch(markdown, /\n## \[Run\]/);
});

test('follow-up deadlines do not silently revoke accepted certification', () => {
  const document = campaign();
  document.certifications.push({
    kind: 'accounts',
    name: 'alice',
    captureId: document.captures[0].id,
    outcome: 'exception',
    note: 'Scheduled follow-up',
    reviewedAt: document.createdAt,
    dueDate: '2026-09-01',
  });
  const report = buildCampaignReport(
    document,
    { authorNote: '', include: ['certifications'] },
    new Date('2026-09-27T00:00:00Z'),
  );
  assert.equal(report.certifications?.[0].decision?.outcome, 'exception');
  assert.equal(report.counts.overdueFollowups, 1);
  assert.equal(campaignAgenda(document)[0].overdue, true);
});
test('next-period settings copy only selected definitions and clear old due dates', () => {
  const document = campaign();
  document.rules = [{ title: 'Duty', left: 'Reader', right: 'Writer' }];
  document.certificationScope.dueDate = '2026-09-27';
  const input = {
    revision: document.revision,
    title: 'Next quarter',
    description: '',
    copyDutyRules: true,
    copyPolicies: false,
    copyCertificationScope: true,
  };
  const next = nextPeriodSettings(document, input);
  assert.equal(next.rules.length, 1);
  assert.equal(next.certificationScope.dueDate, undefined);
  next.rules[0].title = 'Changed';
  assert.equal(document.rules[0].title, 'Duty');
  assert.throws(() => nextPeriodSettings(document, { ...input, revision: 999 }), /changed/);
});
