import { campaignProgress, type Campaign } from './campaign.js';
import { certificationCoverage } from './certification.js';
import { captureTimeline } from './access-drift.js';
import { evaluatePolicies } from './review-policies.js';
import { checkDuties } from './duty-rules.js';
import { remediationNeedsReadback } from './remediation.js';

export type AgendaItem = {
  id: string;
  source: 'finding' | 'certification' | 'remediation' | 'campaign';
  target: string;
  title: string;
  state: string;
  note: string;
  dueDate?: string;
  overdue: boolean;
  nextStep: string;
};
export type ReportSection =
  'findings' | 'certifications' | 'remediations' | 'timeline' | 'activity';
export type CampaignReportOptions = {
  authorNote: string;
  include: ReportSection[];
};
export type CampaignReport = {
  format: 'atlas-campaign-report-1';
  generatedAt: string;
  campaign: {
    id: string;
    title: string;
    description: string;
    instance: string;
    owner: string;
    state: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
  };
  authorNote: string;
  scope: Campaign['certificationScope'];
  latestCapture?: { id: string; label: string; startedAt: string; capturedAt: string };
  limits: string[];
  readiness: Array<{ label: string; satisfied: boolean; detail: string }>;
  counts: {
    findings: number;
    findingDecisions: number;
    pendingFindings: number;
    certificationSubjects: number;
    certifiedSubjects: number;
    pendingCertifications: number;
    overdueFollowups: number;
    verifiedRemediations: number;
    unresolvedRemediations: number;
  };
  agenda: AgendaItem[];
  findings?: ReturnType<typeof campaignProgress>['rows'];
  certifications?: ReturnType<typeof certificationCoverage>['rows'];
  remediations?: Campaign['remediations'];
  timeline?: ReturnType<typeof captureTimeline>;
  activity?: Array<
    Pick<Campaign['history'][number], 'revision' | 'at' | 'actor' | 'action' | 'detail'>
  >;
};

const terminalCertification = new Set(['retain', 'exception']);

function overdue(date: string | undefined, today: string) {
  return Boolean(date && date < today);
}
export function campaignAgenda(campaign: Campaign, now = new Date()): AgendaItem[] {
  const today = now.toISOString().slice(0, 10);
  const progress = campaignProgress(campaign, now);
  const latest = campaign.captures.at(-1);
  const items: AgendaItem[] = [];
  for (const row of progress.rows) {
    const decision = row.decision;
    if (decision?.outcome === 'accepted' && !decision.dueDate) continue;
    const pending = !decision || ['change-required', 'investigating'].includes(decision.outcome);
    if (!pending && !decision?.dueDate) continue;
    items.push({
      id: 'finding:' + row.finding.id,
      source: 'finding',
      target: row.finding.target,
      title: row.finding.title,
      state: row.outdated ? 'outdated decision' : decision?.outcome || 'not reviewed',
      note: decision?.note || row.finding.detail,
      dueDate: decision?.dueDate,
      overdue: overdue(decision?.dueDate, today),
      nextStep: !decision
        ? 'Review the current finding and record a decision.'
        : decision.outcome === 'change-required'
          ? 'Review a targeted remediation, then capture access again.'
          : decision.outcome === 'investigating'
            ? 'Complete the investigation and update the decision.'
            : 'Perform the scheduled follow-up; the existing decision does not expire automatically.',
    });
  }
  if (latest && campaign.certificationScope.enabled) {
    const coverage = certificationCoverage(
      latest.snapshot,
      latest.id,
      campaign.certificationScope,
      campaign.certifications,
    );
    for (const row of coverage.rows) {
      const decision = row.decision;
      if (decision && terminalCertification.has(decision.outcome) && !decision.dueDate) continue;
      items.push({
        id: 'certification:' + JSON.stringify([row.subject.kind, row.subject.name]),
        source: 'certification',
        target: row.subject.name,
        title: `Certify ${row.subject.kind}`,
        state: row.outdated ? 'outdated decision' : decision?.outcome || 'not reviewed',
        note:
          decision?.note ||
          row.subject.unknown.join(' ') ||
          'No certification decision for this capture.',
        dueDate: decision?.dueDate || campaign.certificationScope.dueDate,
        overdue: overdue(decision?.dueDate || campaign.certificationScope.dueDate, today),
        nextStep: !decision
          ? 'Inspect the object and its dependencies, then record a decision.'
          : terminalCertification.has(decision.outcome)
            ? 'Perform the scheduled follow-up review.'
            : 'Resolve the requested change, removal or investigation before closing certification.',
      });
    }
  }
  for (const record of campaign.remediations) {
    if (
      !remediationNeedsReadback(record) &&
      record.status !== 'different' &&
      record.status !== 'failed' &&
      record.status !== 'reviewed'
    )
      continue;
    items.push({
      id: 'remediation:' + record.id,
      source: 'remediation',
      target: record.target,
      title: record.title,
      state: record.status,
      note: record.message || record.reason,
      overdue: false,
      nextStep: remediationNeedsReadback(record)
        ? 'Reconcile by reading the target. Do not replay a write with an unknown result.'
        : record.status === 'different'
          ? 'Readback recorded a difference. Review the recorded explanation and final finding decision; another write is not implied.'
          : record.status === 'reviewed'
            ? 'Apply the reviewed proposal or leave it unexecuted; expired session tickets require a new review.'
            : 'Inspect the failure and current target before preparing another proposal.',
    });
  }
  if (!latest)
    items.push({
      id: 'campaign:capture',
      source: 'campaign',
      target: campaign.title,
      title: 'Capture access configuration',
      state: 'no capture',
      note: '',
      overdue: false,
      nextStep: 'Save a capture before recording access decisions.',
    });
  return items.sort(
    (left, right) =>
      Number(right.overdue) - Number(left.overdue) ||
      (left.dueDate || '9999').localeCompare(right.dueDate || '9999') ||
      left.target.localeCompare(right.target),
  );
}

export function buildCampaignReport(
  campaign: Campaign,
  options: CampaignReportOptions,
  now = new Date(),
): CampaignReport {
  if (options.authorNote.length > 4000)
    throw new Error('The report note is limited to 4,000 characters.');
  const latest = campaign.captures.at(-1);
  const progress = campaignProgress(campaign, now);
  const coverage = latest
    ? certificationCoverage(
        latest.snapshot,
        latest.id,
        campaign.certificationScope,
        campaign.certifications,
      )
    : undefined;
  const policies = latest ? evaluatePolicies(latest.snapshot, campaign.policies) : [];
  const duties = latest ? checkDuties(latest.snapshot, campaign.rules) : [];
  const agenda = campaignAgenda(campaign, now);
  const unresolved = campaign.remediations.filter(remediationNeedsReadback);
  const limits = [
    'Configured access is not a runtime authorization decision. Active sessions, application roles and policies can alter access.',
    'Captures are sequential reads and may contain concurrent configuration changes.',
    'Follow-up dates schedule review work. They do not expire exceptions or revoke permissions.',
    'Campaigns are partitioned by reviewer and configured instance. This report is not an independent second-person approval.',
    'A verified remediation confirms its named fields at readback time, not every side effect or future state.',
  ];
  if (latest) limits.push(...latest.snapshot.warnings);
  const readiness = [
    {
      label: 'Capture saved',
      satisfied: Boolean(latest),
      detail: latest ? latest.label : 'No saved capture.',
    },
    {
      label: 'Capture readable',
      satisfied: Boolean(latest) && !progress.incomplete,
      detail: progress.incomplete
        ? 'Missing source or object details require review.'
        : 'No incomplete evidence was reported.',
    },
    {
      label: 'Finding decisions current',
      satisfied: Boolean(latest) && progress.remaining === 0,
      detail: `${progress.remaining} findings without a current decision.`,
    },
    {
      label: 'Required changes addressed',
      satisfied: progress.openChanges === 0,
      detail: `${progress.openChanges} findings still require a change.`,
    },
    {
      label: 'Investigations complete',
      satisfied: progress.investigating === 0,
      detail: `Findings still under investigation: ${progress.investigating}.`,
    },
    {
      label: 'Certification complete',
      satisfied: !campaign.certificationScope.enabled || Boolean(coverage?.complete),
      detail: campaign.certificationScope.enabled
        ? `${coverage?.pending || 0} pending subjects; ${coverage?.unresolved || 0} unresolved decisions.`
        : 'Object certification is not enabled for this campaign.',
    },
    {
      label: 'Writes reconciled',
      satisfied: unresolved.length === 0,
      detail: `${unresolved.length} remediations require target reconciliation.`,
    },
    {
      label: 'Follow-ups current',
      satisfied: !agenda.some((item) => item.overdue),
      detail: `${agenda.filter((item) => item.overdue).length} follow-ups are overdue.`,
    },
    {
      label: 'Policy results known',
      satisfied: !policies.some((item) => item.result === 'unknown'),
      detail: `${policies.filter((item) => item.result === 'unknown').length} policy results are unknown.`,
    },
    {
      label: 'Duty rule results known',
      satisfied: !duties.some((item) => item.status === 'unknown'),
      detail: `${duties.filter((item) => item.status === 'unknown').length} duty results are unknown.`,
    },
  ];
  const include = new Set(options.include);
  return {
    format: 'atlas-campaign-report-1',
    generatedAt: now.toISOString(),
    campaign: {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      instance: campaign.instance,
      owner: campaign.owner,
      state: campaign.state,
      revision: campaign.revision,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    },
    authorNote: options.authorNote.trim(),
    scope: campaign.certificationScope,
    latestCapture: latest
      ? {
          id: latest.id,
          label: latest.label,
          startedAt: latest.snapshot.startedAt,
          capturedAt: latest.snapshot.capturedAt,
        }
      : undefined,
    limits,
    readiness,
    counts: {
      findings: progress.rows.length,
      findingDecisions: progress.reviewed,
      pendingFindings: progress.remaining,
      certificationSubjects: coverage?.total || 0,
      certifiedSubjects: coverage?.decided || 0,
      pendingCertifications: coverage?.pending || 0,
      overdueFollowups: agenda.filter((item) => item.overdue).length,
      verifiedRemediations: campaign.remediations.filter((record) => record.status === 'verified')
        .length,
      unresolvedRemediations: unresolved.length,
    },
    agenda,
    ...(include.has('findings') ? { findings: progress.rows } : {}),
    ...(include.has('certifications') && coverage ? { certifications: coverage.rows } : {}),
    ...(include.has('remediations') ? { remediations: campaign.remediations } : {}),
    ...(include.has('timeline') ? { timeline: captureTimeline(campaign.captures) } : {}),
    ...(include.has('activity')
      ? {
          activity: campaign.history.map(({ revision, at, actor, action, detail }) => ({
            revision,
            at,
            actor,
            action,
            detail,
          })),
        }
      : {}),
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}
function table(headers: string[], rows: unknown[][]) {
  return (
    '<div class="table-wrap"><table><thead><tr>' +
    headers.map((header) => '<th>' + escapeHtml(header) + '</th>').join('') +
    '</tr></thead><tbody>' +
    rows
      .map(
        (row) => '<tr>' + row.map((cell) => '<td>' + escapeHtml(cell) + '</td>').join('') + '</tr>',
      )
      .join('') +
    '</tbody></table></div>'
  );
}
function heading(text: string) {
  return '<h2>' + escapeHtml(text) + '</h2>';
}

function certificationScopeFacts(scope: CampaignReport['scope']): Array<[string, string]> {
  return [
    ['Certification', scope.enabled ? 'Required before campaign closure' : 'Not enabled'],
    ['Object kinds', scope.kinds.join(', ') || 'None'],
    ['Name prefix', scope.prefix || 'All names'],
    [
      'Disabled accounts and applications',
      scope.includeDisabled ? 'Included when their object kind is selected' : 'Excluded',
    ],
    ['Review due date', scope.dueDate || 'Not set'],
  ];
}

/** A standalone report contains escaped data, no scripts, forms, requests or external assets. */
export function campaignReportHtml(report: CampaignReport): string {
  const sections: string[] = [];
  sections.push(
    heading('Certification scope'),
    '<dl>' +
      certificationScopeFacts(report.scope)
        .map(
          ([label, value]) =>
            '<dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd>',
        )
        .join('') +
      '</dl>',
  );
  sections.push(
    heading('Review status'),
    table(
      ['Check', 'Result', 'Detail'],
      report.readiness.map((item) => [
        item.label,
        item.satisfied ? 'Satisfied' : 'Needs attention',
        item.detail,
      ]),
    ),
  );
  sections.push(
    heading('Follow-up agenda'),
    table(
      ['Source', 'Target', 'Status', 'Due', 'Next step', 'Note'],
      report.agenda.map((item) => [
        item.source,
        item.target,
        item.state,
        (item.dueDate || '—') + (item.overdue ? ' · overdue' : ''),
        item.nextStep,
        item.note,
      ]),
    ),
  );
  if (report.findings)
    sections.push(
      heading('Finding decisions'),
      table(
        ['Target', 'Finding', 'Decision', 'Reviewed', 'Due', 'Reason'],
        report.findings.map((row) => [
          row.finding.target,
          row.finding.title,
          row.decision?.outcome || (row.outdated ? 'Outdated decision' : 'Not reviewed'),
          row.decision?.reviewedAt || '',
          row.decision?.dueDate || '',
          row.decision?.note || row.finding.detail,
        ]),
      ),
    );
  if (report.certifications)
    sections.push(
      heading('Object certification'),
      table(
        ['Kind', 'Object', 'Decision', 'Human review date', 'Follow-up', 'Reason', 'Warnings'],
        report.certifications.map((row) => [
          row.subject.kind,
          row.subject.name,
          row.decision?.outcome || (row.outdated ? 'Outdated decision' : 'Not reviewed'),
          row.decision?.reviewedAt || '',
          row.decision?.dueDate || '',
          row.decision?.note || '',
          row.subject.unknown.join(' | '),
        ]),
      ),
    );
  if (report.remediations)
    sections.push(
      heading('Remediation receipts'),
      table(
        ['Target', 'Action', 'Status', 'Updated', 'Checked fields', 'Message', 'Reconciliation'],
        report.remediations.map((item) => [
          item.target,
          item.title,
          item.status,
          item.updatedAt,
          item.checkedFields.join(', '),
          item.message,
          item.reconciliation || '',
        ]),
      ),
    );
  if (report.timeline)
    sections.push(
      heading('Capture timeline'),
      table(
        ['Capture', 'At', 'Complete', 'Accounts', 'Roles', 'Resources', 'Applications', 'Findings'],
        report.timeline.map((item) => [
          item.label,
          item.at,
          item.complete,
          item.accounts,
          item.roles,
          item.resources,
          item.applications,
          item.findings,
        ]),
      ),
    );
  if (report.activity)
    sections.push(
      heading('Activity'),
      table(
        ['Revision', 'At', 'Actor', 'Action', 'Detail'],
        report.activity.map((item) => [
          item.revision,
          item.at,
          item.actor,
          item.action,
          item.detail,
        ]),
      ),
    );
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>' +
    escapeHtml(report.campaign.title) +
    ' — Access Atlas</title><style>' +
    'body{font:15px/1.55 system-ui,sans-serif;color:#182437;background:#fff;max-width:1100px;margin:2rem auto;padding:0 1rem}h1{font-size:2rem}h2{margin-top:2rem;border-bottom:2px solid #d9dfe7;padding-bottom:.4rem}h1,h2,p,li,td,dd,footer{overflow-wrap:anywhere}dl{display:grid;grid-template-columns:160px minmax(0,1fr);gap:.4rem}dt{font-weight:600}dd{margin:0}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:.5rem;border:1px solid #d9dfe7;text-align:left;vertical-align:top;white-space:pre-wrap}th{background:#f3f5f8}.table-wrap{overflow-x:auto}.note{white-space:pre-wrap;padding:1rem;background:#f3f5f8}footer{margin:2rem 0;color:#516075}@media screen and (max-width:600px){dl{grid-template-columns:minmax(0,1fr)}dd{margin-bottom:.6rem}h1{font-size:1.6rem}}@media print{body{max-width:none;font-size:11px;margin:0}table{font-size:9px}h2{break-after:avoid}tr{break-inside:avoid}.table-wrap{overflow:visible}thead{display:table-header-group}}' +
    '</style></head><body><h1>' +
    escapeHtml(report.campaign.title) +
    '</h1><p>' +
    escapeHtml(report.campaign.description) +
    '</p><dl>' +
    [
      ['Instance', report.campaign.instance],
      ['Reviewer', report.campaign.owner],
      ['Campaign state', report.campaign.state],
      ['Revision', report.campaign.revision],
      ['Report generated', report.generatedAt],
      ['Latest capture', report.latestCapture?.capturedAt || 'None'],
    ]
      .map(([key, value]) => '<dt>' + escapeHtml(key) + '</dt><dd>' + escapeHtml(value) + '</dd>')
      .join('') +
    '</dl>' +
    (report.authorNote
      ? '<h2>Reviewer note</h2><p class="note">' + escapeHtml(report.authorNote) + '</p>'
      : '') +
    sections.join('') +
    heading('Scope and limitations') +
    '<ul>' +
    report.limits.map((limit) => '<li>' + escapeHtml(limit) + '</li>').join('') +
    '</ul><footer>Access Atlas · ' +
    escapeHtml(report.campaign.id) +
    ' · Report content reflects the selected saved campaign revision.</footer></body></html>'
  );
}

export function agendaCsv(items: AgendaItem[]) {
  const quote = (value: string) =>
    '"' +
    (/^(?:\s*[=+@\-]|[\t\r\n])/.test(value) ? "'" + value : value).replaceAll('"', '""') +
    '"';
  const rows = items.map((item) => [
    item.source,
    item.target,
    item.title,
    item.state,
    item.dueDate || '',
    String(item.overdue),
    item.nextStep,
    item.note,
  ]);
  return [
    ['Source', 'Target', 'Title', 'State', 'Follow-up date', 'Overdue', 'Next step', 'Note'],
    ...rows,
  ]
    .map((row) => row.map(quote).join(','))
    .join('\r\n');
}

export function campaignReportMarkdown(report: CampaignReport) {
  const literal = (value: string) =>
    value.replace(/[\\`*_{}\[\]()#+.!<>|~]/g, '\\$&').replace(/\r?\n/g, '  \n');
  const lines = [
    '# ' + literal(report.campaign.title),
    '',
    literal(report.campaign.description),
    '',
    '- Instance: ' + literal(report.campaign.instance),
    '- Reviewer: ' + literal(report.campaign.owner),
    '- Campaign revision: ' + report.campaign.revision,
    '- State: ' + report.campaign.state,
    '- Generated: ' + report.generatedAt,
    '- Latest capture: ' + (report.latestCapture?.capturedAt || 'None'),
    '',
  ];
  lines.push(
    '## Certification scope',
    '',
    ...certificationScopeFacts(report.scope).map(
      ([label, value]) => '- ' + label + ': ' + literal(value),
    ),
    '',
  );
  if (report.authorNote) lines.push('## Reviewer note', '', literal(report.authorNote), '');
  lines.push('## Review status', '');
  for (const item of report.readiness)
    lines.push(
      `- ${item.satisfied ? '[x]' : '[ ]'} ${literal(item.label)}: ${literal(item.detail)}`,
    );
  lines.push('', '## Follow-up agenda', '');
  for (const item of report.agenda)
    lines.push(
      '### ' + literal(item.target + ' · ' + item.title),
      '',
      literal(
        item.state +
          (item.dueDate ? ' · due ' + item.dueDate : '') +
          (item.overdue ? ' · overdue' : ''),
      ),
      '',
      literal(item.nextStep),
      '',
      literal(item.note),
      '',
    );
  if (report.findings) {
    lines.push('## Finding decisions', '');
    for (const row of report.findings)
      lines.push(
        '### ' + literal(row.finding.target + ' · ' + row.finding.title),
        '',
        'Decision: ' + literal(row.decision?.outcome || 'Not reviewed'),
        '',
        literal(row.decision?.note || row.finding.detail),
        '',
      );
  }
  if (report.certifications) {
    lines.push('## Certification', '');
    for (const row of report.certifications)
      lines.push(
        '- ' +
          literal(
            `${row.subject.kind} ${row.subject.name}: ${row.decision?.outcome || 'Not reviewed'} · ${row.decision?.note || ''}`,
          ),
      );
    lines.push('');
  }
  if (report.remediations) {
    lines.push('## Remediation receipts', '');
    for (const row of report.remediations)
      lines.push('- ' + literal(`${row.target}: ${row.title} · ${row.status} · ${row.message}`));
    lines.push('');
  }
  if (report.timeline) {
    lines.push('## Capture timeline', '');
    for (const row of report.timeline)
      lines.push(
        '- ' +
          literal(
            `${row.label} · ${row.at} · ${row.complete ? 'complete' : 'partial'} · ${row.accounts} accounts · ${row.findings} findings`,
          ),
      );
    lines.push('');
  }
  if (report.activity) {
    lines.push('## Activity', '');
    for (const row of report.activity)
      lines.push(
        '- ' +
          literal(
            `Revision ${row.revision} · ${row.at} · ${row.actor} · ${row.action}: ${row.detail}`,
          ),
      );
    lines.push('');
  }
  lines.push(
    '## Scope and limitations',
    '',
    ...report.limits.map((limit) => '- ' + literal(limit)),
    '',
  );
  return lines.join('\n');
}
