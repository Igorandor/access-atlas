import { useMemo, useState } from 'react';
import type { Campaign } from '../../../shared/campaign';
import {
  buildCampaignReport,
  campaignReportHtml,
  campaignReportMarkdown,
  agendaCsv,
  type ReportSection,
  type CampaignReport as Report,
  type AgendaItem,
} from '../../../shared/campaign-report';
import { Badge, ErrorBox, Modal } from '../../components/ui';
import { download } from '../../api';
import { saveText } from '../access/AccessInquiry';
import './report.css';

const sections: Array<{ id: ReportSection; title: string; description: string }> = [
  {
    id: 'findings',
    title: 'Finding decisions',
    description: 'Current findings, reasons and follow-up dates.',
  },
  {
    id: 'certifications',
    title: 'Object certification',
    description: 'In-scope objects and their current certification decisions.',
  },
  {
    id: 'remediations',
    title: 'Remediation receipts',
    description: 'Reviewed changes, verification and reconciliation results.',
  },
  {
    id: 'timeline',
    title: 'Capture timeline',
    description: 'Capture dates, counts and completeness.',
  },
  {
    id: 'activity',
    title: 'Campaign activity',
    description: 'Saved revisions, actors and actions.',
  },
];

export function CampaignReport({
  campaign,
  onReviewFinding,
}: {
  campaign: Campaign;
  onReviewFinding?: (findingId: string) => void;
}) {
  const [note, setNote] = useState('');
  const [include, setInclude] = useState<ReportSection[]>(sections.map((section) => section.id));
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [generatedAt, setGeneratedAt] = useState(() => new Date());
  const report = useMemo(
    () => buildCampaignReport(campaign, { authorNote: note, include }, generatedAt),
    [campaign, note, include, generatedAt],
  );
  const attention = report.readiness.filter((item) => !item.satisfied);
  function exportReport(format: 'preview' | 'html' | 'json' | 'md') {
    try {
      const current = buildCampaignReport(campaign, { authorNote: note, include }, new Date());
      if (format === 'preview') setPreview(campaignReportHtml(current));
      else if (format === 'html')
        saveText(
          'atlas-campaign-report.html',
          campaignReportHtml(current),
          'text/html;charset=utf-8',
        );
      else if (format === 'md')
        saveText(
          'atlas-campaign-report.md',
          campaignReportMarkdown(current),
          'text/markdown;charset=utf-8',
        );
      else download('atlas-campaign-report.json', current);
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  return (
    <section className="campaign-report">
      <header className="section-heading">
        <div>
          <h3>Review report</h3>
          <p>
            Campaign revision {campaign.revision} · {campaign.owner} · {campaign.instance}
          </p>
        </div>
        <button onClick={() => setGeneratedAt(new Date())}>Refresh dates</button>
      </header>
      {error && <ErrorBox error={error} />}
      <div className="report-summary">
        <ReportMetric
          value={report.counts.findingDecisions + '/' + report.counts.findings}
          label="current finding decisions"
        />
        <ReportMetric
          value={report.counts.certifiedSubjects + '/' + report.counts.certificationSubjects}
          label="objects with decisions"
        />
        <ReportMetric value={String(report.counts.overdueFollowups)} label="overdue follow-ups" />
        <ReportMetric
          value={String(report.counts.unresolvedRemediations)}
          label="unresolved writes"
        />
      </div>
      <nav className="analysis-tabs" aria-label="Campaign report sections">
        {[
          ['overview', 'Readiness'],
          ['agenda', 'Follow-ups'],
          ['decisions', 'Decision register'],
          ['receipts', 'Change receipts'],
          ['activity', 'Activity'],
          ['export', 'Export report'],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'overview' && (
        <section className="panel padded">
          <h4>
            {attention.length
              ? `${attention.length} checks need attention`
              : 'The recorded review checks are satisfied'}
          </h4>
          <p>
            This checklist describes the saved review. It does not certify runtime security or
            replace the campaign closure rules.
          </p>
          <ul className="report-readiness">
            {report.readiness.map((item) => (
              <li key={item.label}>
                <Badge tone={item.satisfied ? 'good' : 'warning'}>
                  {item.satisfied ? 'Satisfied' : 'Needs attention'}
                </Badge>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <h4>Scope</h4>
          <dl className="report-facts">
            <dt>Latest capture</dt>
            <dd>
              {report.latestCapture
                ? report.latestCapture.label +
                  ' · ' +
                  new Date(report.latestCapture.capturedAt).toLocaleString()
                : 'No capture saved'}
            </dd>
            <dt>Certification</dt>
            <dd>{report.scope.enabled ? report.scope.kinds.join(', ') : 'Not enabled'}</dd>
            <dt>Name prefix</dt>
            <dd>{report.scope.prefix || 'All names'}</dd>
            <dt>Disabled objects</dt>
            <dd>{report.scope.includeDisabled ? 'Included' : 'Excluded from certification'}</dd>
            <dt>Review due date</dt>
            <dd>{report.scope.dueDate || 'Not set'}</dd>
          </dl>
          <details>
            <summary>Scope and limitations</summary>
            <ul>
              {report.limits.map((limit, index) => (
                <li key={index}>{limit}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {tab === 'agenda' && <Agenda items={report.agenda} onReviewFinding={onReviewFinding} />}
      {tab === 'decisions' && (
        <DecisionRegister
          report={buildCampaignReport(
            campaign,
            { authorNote: note, include: ['findings', 'certifications'] },
            generatedAt,
          )}
        />
      )}
      {tab === 'receipts' && <Receipts campaign={campaign} />}
      {tab === 'activity' && <ReportActivity campaign={campaign} />}
      {tab === 'export' && (
        <section className="panel padded report-export">
          <h4>Build a report</h4>
          <p>
            The report contains saved review data. Downloaded files can include account names,
            grants and operational notes.
          </p>
          <fieldset>
            <legend>Include sections</legend>
            {sections.map((section) => (
              <label key={section.id} className="report-section-option">
                <input
                  type="checkbox"
                  checked={include.includes(section.id)}
                  onChange={(event) =>
                    setInclude(
                      event.target.checked
                        ? [...include, section.id]
                        : include.filter((id) => id !== section.id),
                    )
                  }
                />
                <span>
                  <strong>{section.title}</strong>
                  <small>{section.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            Reviewer note
            <textarea
              rows={5}
              value={note}
              maxLength={4000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional scope, conclusions or next review period"
            />
          </label>
          <p className="muted">
            This note is included in the report preview and downloads. It is not saved as a campaign
            decision.
          </p>
          <div className="inquiry-actions">
            <button className="primary" onClick={() => exportReport('preview')}>
              Preview report
            </button>
            <button onClick={() => exportReport('html')}>Download printable HTML</button>
            <button onClick={() => exportReport('md')}>Download Markdown</button>
            <button onClick={() => exportReport('json')}>Download report JSON</button>
          </div>
          <p>
            HTML reports work offline and can be printed to PDF by your browser. No scripts or
            external assets are included.
          </p>
          <h4>Included data</h4>
          <ul>
            {include.map((id) => (
              <li key={id}>{sections.find((section) => section.id === id)?.title}</li>
            ))}
          </ul>
          <p>Campaign identity, readiness, follow-up agenda and limitations are always included.</p>
        </section>
      )}
      {preview && (
        <Modal title="Review report preview" onClose={() => setPreview('')} wide>
          <iframe
            title="Review report content"
            className="report-preview-frame"
            sandbox=""
            srcDoc={preview}
          />
        </Modal>
      )}
    </section>
  );
}

function ReportMetric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Agenda({
  items,
  onReviewFinding,
}: {
  items: AgendaItem[];
  onReviewFinding?: (findingId: string) => void;
}) {
  const [source, setSource] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [page, setPage] = useState(0);
  const visible = items.filter(
    (item) =>
      (source === 'all' || item.source === source) &&
      (!onlyOverdue || item.overdue) &&
      (item.target + ' ' + item.title + ' ' + item.note)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const activePage = Math.min(page, Math.max(0, Math.ceil(visible.length / 20) - 1));
  return (
    <section className="panel padded report-agenda">
      <div className="section-heading">
        <h4>Follow-up agenda</h4>
        <button
          onClick={() =>
            saveText('atlas-review-followups.csv', agendaCsv(visible), 'text/csv;charset=utf-8')
          }
        >
          Export filtered agenda CSV
        </button>
      </div>
      <div className="report-filters">
        <label className="field">
          Find follow-up
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="field">
          Source
          <select
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All sources</option>
            {['finding', 'certification', 'remediation', 'campaign'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="inquiry-checkbox">
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(event) => {
              setOnlyOverdue(event.target.checked);
              setPage(0);
            }}
          />
          Overdue only
        </label>
      </div>
      <p>
        Dates are interpreted as UTC calendar days. Follow-up dates do not automatically expire a
        decision or remove access.
      </p>
      <div className="report-agenda-items">
        {visible.slice(activePage * 20, activePage * 20 + 20).map((item) => (
          <article key={item.id}>
            <div className="section-heading">
              <span className="eyebrow">{item.source}</span>
              <Badge tone={item.overdue ? 'warning' : 'neutral'}>{item.state}</Badge>
            </div>
            <h4>{item.title}</h4>
            <code>{item.target}</code>
            <p>{item.note}</p>
            <p>
              <strong>Next step:</strong> {item.nextStep}
            </p>
            <span>
              {item.dueDate
                ? `Follow-up ${item.dueDate}${item.overdue ? ' · overdue' : ''}`
                : 'No follow-up date set'}
            </span>
            {item.source === 'finding' && onReviewFinding && (
              <div className="inquiry-actions">
                <button
                  aria-label={`Open finding: ${item.title} (${item.target})`}
                  onClick={() => onReviewFinding(item.id.slice('finding:'.length))}
                >
                  Open finding
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {!visible.length && <p>No follow-ups match these filters.</p>}
      <Pagination
        page={activePage}
        count={visible.length}
        size={20}
        change={setPage}
        label="follow-ups"
      />
    </section>
  );
}

function DecisionRegister({ report }: { report: Report }) {
  const [kind, setKind] = useState('all');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const [page, setPage] = useState(0);
  const entries = [
    ...(report.findings || []).map((row) => ({
      id: 'finding:' + row.finding.id,
      kind: 'finding',
      target: row.finding.target,
      title: row.finding.title,
      state: row.outdated ? 'outdated' : row.decision?.outcome || 'pending',
      note: row.decision?.note || row.finding.detail,
      reviewedAt: row.decision?.reviewedAt,
      dueDate: row.decision?.dueDate,
      captureId: row.decision?.captureId,
    })),
    ...(report.certifications || []).map((row) => ({
      id: 'certification:' + JSON.stringify([row.subject.kind, row.subject.name]),
      kind: 'certification',
      target: row.subject.name,
      title: row.subject.kind,
      state: row.outdated ? 'outdated' : row.decision?.outcome || 'pending',
      note: row.decision?.note || row.subject.unknown.join(' | '),
      reviewedAt: row.decision?.reviewedAt,
      dueDate: row.decision?.dueDate,
      captureId: row.decision?.captureId,
    })),
  ];
  const visible = entries.filter(
    (item) =>
      (kind === 'all' || item.kind === kind) &&
      (state === 'all' || item.state === state) &&
      (item.target + ' ' + item.title + ' ' + item.note)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const activePage = Math.min(page, Math.max(0, Math.ceil(visible.length / 25) - 1));
  return (
    <section className="panel padded">
      <h4>Decision register</h4>
      <div className="report-filters">
        <label className="field">
          Search decisions
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="field">
          Decision type
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All decisions</option>
            <option value="finding">Findings</option>
            <option value="certification">Certification</option>
          </select>
        </label>
        <label className="field">
          State
          <select
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All states</option>
            {[...new Set(entries.map((entry) => entry.state))].sort().map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="report-decision-list">
        {visible.slice(activePage * 25, activePage * 25 + 25).map((entry) => (
          <details key={entry.id}>
            <summary>
              <Badge tone={['pending', 'outdated'].includes(entry.state) ? 'warning' : 'neutral'}>
                {entry.state}
              </Badge>
              <span>
                {entry.target} · {entry.title}
              </span>
            </summary>
            <p className="report-note">{entry.note || 'No review note'}</p>
            <dl className="report-facts">
              <dt>Human review date</dt>
              <dd>
                {entry.reviewedAt ? new Date(entry.reviewedAt).toLocaleString() : 'Not reviewed'}
              </dd>
              <dt>Follow-up</dt>
              <dd>{entry.dueDate || 'Not set'}</dd>
              <dt>Decision capture</dt>
              <dd>{entry.captureId || 'None'}</dd>
            </dl>
          </details>
        ))}
      </div>
      {!visible.length && <p>No decisions match these filters.</p>}
      <Pagination
        page={activePage}
        count={visible.length}
        size={25}
        change={setPage}
        label="decisions"
      />
      <button
        disabled={!visible.length}
        onClick={() =>
          download('atlas-decision-register.json', {
            campaignId: report.campaign.id,
            revision: report.campaign.revision,
            instance: report.campaign.instance,
            decisions: visible,
          })
        }
      >
        Export filtered register
      </button>
    </section>
  );
}

function Receipts({ campaign }: { campaign: Campaign }) {
  const [state, setState] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const visible = [...campaign.remediations]
    .reverse()
    .filter(
      (record) =>
        (state === 'all' || record.status === state) &&
        (record.target + ' ' + record.title + ' ' + record.reason)
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const activePage = Math.min(page, Math.max(0, Math.ceil(visible.length / 20) - 1));
  return (
    <section className="panel padded">
      <h4>Change receipts</h4>
      <p>
        Receipts describe the named mutation and its readback. Uncertain results require
        reconciliation before another attempt.
      </p>
      <div className="report-filters">
        <label className="field">
          Find receipt
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="field">
          Status
          <select
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All statuses</option>
            {[...new Set(campaign.remediations.map((item) => item.status))].sort().map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="report-decision-list">
        {visible.slice(activePage * 20, activePage * 20 + 20).map((record) => (
          <details key={record.id}>
            <summary>
              <Badge tone={record.status === 'verified' ? 'good' : 'warning'}>
                {record.status}
              </Badge>
              <span>{record.title}</span>
            </summary>
            <dl className="report-facts">
              <dt>Target</dt>
              <dd>{record.target}</dd>
              <dt>Operation</dt>
              <dd>
                {record.method} {record.path}
              </dd>
              <dt>Review created</dt>
              <dd>{new Date(record.createdAt).toLocaleString()}</dd>
              <dt>Last updated</dt>
              <dd>{new Date(record.updatedAt).toLocaleString()}</dd>
              <dt>Checked fields</dt>
              <dd>{record.checkedFields.join(', ') || 'No named fields confirmed'}</dd>
            </dl>
            <p>{record.reason}</p>
            <p>{record.message}</p>
            {record.reconciliation && (
              <p>
                <strong>Reconciliation:</strong> {record.reconciliation}
              </p>
            )}
            <button
              onClick={() =>
                download('atlas-remediation-' + record.id + '.json', {
                  instance: campaign.instance,
                  campaignId: campaign.id,
                  receipt: record,
                })
              }
            >
              Export receipt
            </button>
          </details>
        ))}
      </div>
      {!visible.length && <p>No remediation receipts match these filters.</p>}
      <Pagination
        page={activePage}
        count={visible.length}
        size={20}
        change={setPage}
        label="receipts"
      />
    </section>
  );
}

function ReportActivity({ campaign }: { campaign: Campaign }) {
  const [action, setAction] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const visible = [...campaign.history]
    .reverse()
    .filter(
      (event) =>
        (action === 'all' || event.action === action) &&
        (event.actor + ' ' + event.detail).toLowerCase().includes(search.toLowerCase()),
    );
  const activePage = Math.min(page, Math.max(0, Math.ceil(visible.length / 30) - 1));
  return (
    <section className="panel padded">
      <h4>Campaign activity</h4>
      <div className="report-filters">
        <label className="field">
          Find actor or detail
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="field">
          Action
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All actions</option>
            {[...new Set(campaign.history.map((event) => event.action))].sort().map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <ol className="report-activity">
        {visible.slice(activePage * 30, activePage * 30 + 30).map((event) => (
          <li key={event.revision}>
            <div>
              <strong>
                Revision {event.revision} · {event.action}
              </strong>
              <span>
                {new Date(event.at).toLocaleString()} · {event.actor}
              </span>
            </div>
            <p>{event.detail}</p>
            {event.certification && (
              <p>
                Certification: {event.certification.kind} {event.certification.name} ·{' '}
                {event.certification.outcome}
              </p>
            )}
            {event.decision && (
              <p>
                Finding: {event.decision.findingId} · {event.decision.outcome}
              </p>
            )}
          </li>
        ))}
      </ol>
      {!visible.length && <p>No activity matches these filters.</p>}
      <Pagination
        page={activePage}
        count={visible.length}
        size={30}
        change={setPage}
        label="events"
      />
      <button
        disabled={!visible.length}
        onClick={() =>
          download('atlas-campaign-activity.json', {
            campaignId: campaign.id,
            revision: campaign.revision,
            activity: visible,
          })
        }
      >
        Export filtered activity
      </button>
    </section>
  );
}

function Pagination({
  page,
  count,
  size,
  change,
  label,
}: {
  page: number;
  count: number;
  size: number;
  change: (value: number) => void;
  label: string;
}) {
  return (
    <div className="inquiry-actions report-pagination">
      <button disabled={!page} onClick={() => change(page - 1)}>
        Previous {label}
      </button>
      <span>
        {count ? page * size + 1 : 0}–{Math.min((page + 1) * size, count)} of {count}
      </span>
      <button disabled={(page + 1) * size >= count} onClick={() => change(page + 1)}>
        Next {label}
      </button>
    </div>
  );
}
