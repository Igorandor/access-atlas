import { useMemo, useState } from 'react';
import type { AccessSnapshot } from '../../../shared/access-model';
import {
  buildDriftReport,
  driftCsv,
  captureTimeline,
  type AccountMovement,
  type ConfigurationChange,
} from '../../../shared/access-drift';
import { Badge, ErrorBox } from '../../components/ui';
import { DataDiff } from '../../components/DataView';
import { download } from '../../api';
import { saveText } from './AccessInquiry';
import './drift.css';

export function DriftReview({ before, after }: { before: AccessSnapshot; after: AccessSnapshot }) {
  const [tab, setTab] = useState('objects');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [change, setChange] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [includeUnchangedFindings, setIncludeUnchangedFindings] = useState(false);
  const evaluation = useMemo(() => {
    try {
      return { report: buildDriftReport(before, after), error: '' };
    } catch (failure) {
      return { report: undefined, error: (failure as Error).message };
    }
  }, [before, after]);
  const report = evaluation.report;
  if (!report) return <ErrorBox error={evaluation.error} />;
  const objects = report.objects.filter(
    (row) =>
      (kind === 'all' || row.kind === kind) &&
      (change === 'all' || row.change === change) &&
      (row.name + ' ' + row.explanation).toLowerCase().includes(search.toLowerCase()),
  );
  const accounts = report.accounts.filter(
    (row) =>
      row.account.toLowerCase().includes(search.toLowerCase()) &&
      (change === 'all' ||
        (change === 'gained' &&
          row.grants.some(
            (grant) => grant.ordinaryAdded || grant.conditionalAdded || grant.publicAdded,
          )) ||
        (change === 'lost' &&
          row.grants.some(
            (grant) => grant.ordinaryRemoved || grant.conditionalRemoved || grant.publicRemoved,
          )) ||
        (change === 'unknown' && row.warnings.length > 0) ||
        (change === 'broad' && row.broadBefore !== row.broadAfter)),
  );
  const findings = report.findings.filter(
    (row) =>
      (includeUnchangedFindings || row.status !== 'unchanged') &&
      (change === 'all' || row.status === change) &&
      ((row.after || row.before)?.target + ' ' + (row.after || row.before)?.title)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selected = report.accounts.find((row) => row.account === selectedAccount);
  const totals =
    tab === 'objects' ? objects.length : tab === 'accounts' ? accounts.length : findings.length;
  const pages = Math.max(1, Math.ceil(totals / 25));
  const activePage = Math.min(page, pages - 1);
  const start = activePage * 25;
  function reset() {
    setPage(0);
    setChange('all');
  }
  return (
    <section className="drift-review">
      <header className="section-heading">
        <div>
          <h3>Access changes</h3>
          <p>
            {new Date(report.beforeAt).toLocaleString()} →{' '}
            {new Date(report.afterAt).toLocaleString()}
          </p>
        </div>
        <Badge tone={report.complete ? 'good' : 'warning'}>
          {report.complete ? 'Complete captures' : 'Partial comparison'}
        </Badge>
      </header>
      <p className="notice">
        Captures are sequential reads. Changes describe configured access, not actions performed by
        a particular person or permissions active in a session.
      </p>
      {!!report.warnings.length && (
        <details open>
          <summary>{report.warnings.length} comparison warnings</summary>
          <ul>
            {report.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="drift-metrics">
        <Metric value={report.summary.changedObjects} label="changed objects" />
        <Metric value={report.summary.uncertainObjects} label="uncertain objects" />
        <Metric value={report.summary.affectedAccounts} label="account observations" />
        <Metric value={report.summary.gainedOrdinaryGrants} label="ordinary grants added" />
        <Metric value={report.summary.lostOrdinaryGrants} label="ordinary grants removed" />
        <Metric value={report.summary.publicPermissionChanges} label="public grant changes" />
      </div>
      <p className="muted">
        Grant totals count account/resource/permission combinations only where account evidence is
        complete. %All is tracked separately.
      </p>
      <nav className="analysis-tabs" aria-label="Drift result sections">
        {[
          ['objects', 'Configuration'],
          ['accounts', 'Account impact'],
          ['findings', 'Finding changes'],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              reset();
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="drift-filters">
        <label className="field">
          Search changes
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        {tab === 'objects' && (
          <label className="field">
            Object type
            <select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">All types</option>
              <option value="account">Accounts</option>
              <option value="role">Roles</option>
              <option value="resource">Resources</option>
              <option value="application">Applications</option>
            </select>
          </label>
        )}
        <label className="field">
          Change
          <select
            value={change}
            onChange={(event) => {
              setChange(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All changes</option>
            {(tab === 'objects'
              ? [
                  ['added', 'Added'],
                  ['removed', 'Removed'],
                  ['changed', 'Changed fields'],
                  ['unknown', 'Unknown'],
                ]
              : tab === 'accounts'
                ? [
                    ['gained', 'Grant gained'],
                    ['lost', 'Grant lost'],
                    ['broad', '%All path changed'],
                    ['unknown', 'Incomplete evidence'],
                  ]
                : [
                    ['new', 'New finding'],
                    ['no-longer-observed', 'No longer observed'],
                    ['changed', 'Changed finding'],
                    ['unchanged', 'Unchanged'],
                    ['unknown', 'Unknown'],
                  ]
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tab === 'objects' && (
        <div className="drift-object-list">
          {objects.slice(start, start + 25).map((row) => (
            <ObjectChange key={row.kind + '\0' + row.name} row={row} />
          ))}
        </div>
      )}
      {tab === 'accounts' && (
        <>
          <div className="inquiry-table-wrap">
            <table className="inquiry-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>State</th>
                  <th>Reachable roles</th>
                  <th>Resource changes</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {accounts.slice(start, start + 25).map((row) => (
                  <tr key={row.account}>
                    <td>
                      <strong>{row.account}</strong>
                      {!!row.warnings.length && (
                        <p>
                          <Badge tone="warning">Incomplete evidence</Badge>
                        </p>
                      )}
                    </td>
                    <td>
                      {row.enabledBefore ? 'Enabled' : 'Disabled'} →{' '}
                      {row.enabledAfter ? 'Enabled' : 'Disabled'}
                      <br />
                      %All: {row.broadBefore} → {row.broadAfter}
                    </td>
                    <td>
                      +{row.ordinaryRolesAdded.length} / −{row.ordinaryRolesRemoved.length} ordinary
                      <br />+{row.conditionalRolesAdded.length} / −
                      {row.conditionalRolesRemoved.length} conditional
                    </td>
                    <td>{row.grants.length}</td>
                    <td>
                      <button
                        onClick={() =>
                          setSelectedAccount(selectedAccount === row.account ? '' : row.account)
                        }
                      >
                        {selectedAccount === row.account ? 'Hide impact' : 'Inspect impact'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && <AccountImpact key={selected.account} account={selected} />}
        </>
      )}
      {tab === 'findings' && (
        <>
          <label className="inquiry-checkbox">
            <input
              type="checkbox"
              checked={includeUnchangedFindings}
              onChange={(event) => {
                setIncludeUnchangedFindings(event.target.checked);
                setPage(0);
              }}
            />
            Include unchanged findings
          </label>
          <div className="drift-object-list">
            {findings.slice(start, start + 25).map((row) => (
              <article key={row.id} className="drift-finding">
                <Badge tone={row.status === 'unknown' ? 'warning' : 'neutral'}>{row.status}</Badge>
                <h4>{(row.after || row.before)?.title}</h4>
                <code>{(row.after || row.before)?.target}</code>
                {row.before && (
                  <p>
                    <strong>Before:</strong> {row.before.detail}
                  </p>
                )}
                {row.after && (
                  <p>
                    <strong>After:</strong> {row.after.detail}
                  </p>
                )}
                {row.status === 'no-longer-observed' && (
                  <p>
                    The finding predicate no longer matches the capture. This is not proof that a
                    remediation was executed or that runtime access is safe.
                  </p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {!totals && <p>No changes match these filters.</p>}
      <div className="inquiry-actions">
        <button disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>
          Previous changes
        </button>
        <span>
          {totals ? start + 1 : 0}–{Math.min(start + 25, totals)} of {totals}
        </span>
        <button disabled={activePage + 1 >= pages} onClick={() => setPage(activePage + 1)}>
          Next changes
        </button>
      </div>
      <div className="inquiry-actions">
        <button onClick={() => download('atlas-access-drift.json', report)}>
          Export full comparison
        </button>
        <button
          onClick={() =>
            saveText('atlas-grant-changes.csv', driftCsv(report), 'text/csv;charset=utf-8')
          }
        >
          Export grant changes CSV
        </button>
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ObjectChange({ row }: { row: ConfigurationChange }) {
  return (
    <details className="drift-object">
      <summary>
        <Badge tone={row.change === 'unknown' ? 'warning' : 'neutral'}>{row.change}</Badge>
        <span>
          {row.kind} · <strong>{row.name}</strong>
        </span>
      </summary>
      <p>{row.explanation}</p>
      {row.fields.map((field) => (
        <section key={field.field}>
          <h4>{field.field}</h4>
          <DataDiff before={field.before} after={field.after} />
        </section>
      ))}
    </details>
  );
}

function AccountImpact({ account }: { account: AccountMovement }) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const grants = account.grants.filter((grant) =>
    grant.resource.toLowerCase().includes(filter.toLowerCase()),
  );
  const activePage = Math.min(page, Math.max(0, Math.ceil(grants.length / 25) - 1));
  return (
    <section className="panel padded drift-account">
      <h4>Impact on {account.account}</h4>
      <p>
        {account.directAssignmentChanged
          ? 'Direct role assignments changed.'
          : 'Direct assignments did not change; differences may come from inherited roles or public grants.'}
      </p>
      {!!account.warnings.length && (
        <ul className="notice">
          {account.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <div className="drift-role-changes">
        <RoleChange title="Ordinary roles added" names={account.ordinaryRolesAdded} />
        <RoleChange title="Ordinary roles removed" names={account.ordinaryRolesRemoved} />
        <RoleChange title="Conditional roles added" names={account.conditionalRolesAdded} />
        <RoleChange title="Conditional roles removed" names={account.conditionalRolesRemoved} />
      </div>
      <label className="field">
        Find affected resource
        <input
          type="search"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(0);
          }}
        />
      </label>
      <div className="inquiry-table-wrap">
        <table className="inquiry-table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Ordinary</th>
              <th>Conditional</th>
              <th>Public</th>
            </tr>
          </thead>
          <tbody>
            {grants.slice(activePage * 25, activePage * 25 + 25).map((grant) => (
              <tr key={grant.resource}>
                <td>
                  <code>{grant.resource}</code>
                </td>
                <td>
                  <GrantDelta
                    before={grant.before.ordinary}
                    after={grant.after.ordinary}
                    added={grant.ordinaryAdded}
                    removed={grant.ordinaryRemoved}
                  />
                </td>
                <td>
                  <GrantDelta
                    before={grant.before.conditional}
                    after={grant.after.conditional}
                    added={grant.conditionalAdded}
                    removed={grant.conditionalRemoved}
                  />
                </td>
                <td>
                  <GrantDelta
                    before={grant.before.public}
                    after={grant.after.public}
                    added={grant.publicAdded}
                    removed={grant.publicRemoved}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inquiry-actions">
        <button disabled={!activePage} onClick={() => setPage(activePage - 1)}>
          Previous resources
        </button>
        <span>{grants.length} resources</span>
        <button
          disabled={(activePage + 1) * 25 >= grants.length}
          onClick={() => setPage(activePage + 1)}
        >
          Next resources
        </button>
      </div>
    </section>
  );
}

function RoleChange({ title, names }: { title: string; names: string[] }) {
  return (
    <div>
      <strong>{title}</strong>
      {names.length ? (
        <ul>
          {names.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>None</p>
      )}
    </div>
  );
}
function GrantDelta({
  before,
  after,
  added,
  removed,
}: {
  before: string;
  after: string;
  added: string;
  removed: string;
}) {
  return (
    <>
      <span>
        {before || '—'} → {after || '—'}
      </span>
      {(added || removed) && (
        <p>
          {added && <span>+{added} </span>}
          {removed && <span>−{removed}</span>}
        </p>
      )}
    </>
  );
}

export function CaptureTrend({
  captures,
}: {
  captures: Array<{ id: string; label: string; snapshot: AccessSnapshot }>;
}) {
  const timeline = useMemo(() => captureTimeline(captures), [captures]);
  const [metric, setMetric] = useState<
    'accounts' | 'roles' | 'resources' | 'applications' | 'findings'
  >('findings');
  const maximum = Math.max(1, ...timeline.map((point) => point[metric]));
  return (
    <section className="panel padded capture-trend">
      <div className="section-heading">
        <h3>Capture timeline</h3>
        <label className="field">
          Measure
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as typeof metric)}
          >
            {['findings', 'accounts', 'roles', 'resources', 'applications'].map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </label>
      </div>
      <p>
        Counts include only captured objects. A lower count in a partial capture does not prove that
        objects or findings were removed.
      </p>
      <ol className="capture-bars">
        {timeline.map((point) => (
          <li key={point.id}>
            <div>
              <strong>{point.label}</strong>
              <span>{new Date(point.at).toLocaleString()}</span>
              {!point.complete && <Badge tone="warning">Partial</Badge>}
            </div>
            <div className="capture-bar-track">
              <span style={{ width: `${(point[metric] / maximum) * 100}%` }} />
            </div>
            <strong>{point[metric]}</strong>
          </li>
        ))}
      </ol>
      <div className="inquiry-table-wrap">
        <table className="inquiry-table">
          <thead>
            <tr>
              <th>Capture</th>
              <th>Accounts</th>
              <th>Roles</th>
              <th>Resources</th>
              <th>Applications</th>
              <th>Changed objects since previous</th>
              <th>New / no longer observed findings</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((point) => (
              <tr key={point.id}>
                <td>{point.label}</td>
                <td>{point.accounts}</td>
                <td>{point.roles}</td>
                <td>{point.resources}</td>
                <td>{point.applications}</td>
                <td>
                  {point.changedObjects ?? '—'}
                  {point.uncertainObjects ? ` · ${point.uncertainObjects} unknown` : ''}
                </td>
                <td>
                  {point.newFindings ?? '—'} / {point.noLongerObserved ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() =>
          download('atlas-capture-timeline.json', {
            instance: captures[0]?.snapshot.instance,
            timeline,
          })
        }
      >
        Export timeline
      </button>
    </section>
  );
}
