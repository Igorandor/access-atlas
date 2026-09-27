import { useMemo, useState } from 'react';
import type { AccessSnapshot } from '../../../shared/access-model';
import {
  analysisSummary,
  compareAccounts,
  roleImpact,
  resourceCoverage,
  type PermissionLetter,
} from '../../../shared/access-analysis';
import {
  simulateAccess,
  simulationPlanSchema,
  type SimulationChange,
  type SimulationPlan,
} from '../../../shared/access-simulation';
import { Badge, ErrorBox } from '../../components/ui';
import { download } from '../../api';
import './analysis.css';
import { PolicyReview } from './PolicyReview';
import { AccessInquiry } from './AccessInquiry';

export function AnalysisTools({ snapshot }: { snapshot: AccessSnapshot }) {
  const [tab, setTab] = useState('summary');
  return (
    <section className="analysis-workspace">
      <nav className="analysis-tabs" aria-label="Access analysis tools">
        {[
          ['summary', 'Review overview'],
          ['compare', 'Compare accounts'],
          ['roles', 'Role impact'],
          ['coverage', 'Resource coverage'],
          ['simulation', 'Change simulation'],
          ['policies', 'Policies'],
          ['inquiry', 'Explain access'],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      <p className="notice">
        Analysis uses the selected capture. Conditional roles indicate possible escalation, not an
        active session. Runtime policies can change the result.
      </p>
      {tab === 'summary' && <AnalysisOverview snapshot={snapshot} />}
      {tab === 'compare' && <AccountComparison snapshot={snapshot} />}
      {tab === 'roles' && <RoleInspection snapshot={snapshot} />}
      {tab === 'coverage' && <Coverage snapshot={snapshot} />}
      {tab === 'simulation' && <Simulation snapshot={snapshot} />}
      {tab === 'policies' && <PolicyReview snapshot={snapshot} />}
      {tab === 'inquiry' && <AccessInquiry key={snapshot.capturedAt} snapshot={snapshot} />}
    </section>
  );
}

function AnalysisOverview({ snapshot }: { snapshot: AccessSnapshot }) {
  const summary = useMemo(() => analysisSummary(snapshot), [snapshot]);
  const [kind, setKind] = useState('all');
  const rows = summary.cleanup.filter((row) => kind === 'all' || row.kind === kind);
  return (
    <section className="panel padded">
      <div className="section-heading">
        <h2>Review overview</h2>
        <button
          onClick={() =>
            download('atlas-access-analysis.json', {
              instance: snapshot.instance,
              capturedAt: snapshot.capturedAt,
              ...summary,
            })
          }
        >
          Export analysis
        </button>
      </div>
      <div className="analysis-metrics">
        <div>
          <strong>{summary.enabled}</strong>
          <span>known enabled accounts</span>
        </div>
        <div>
          <strong>{summary.ordinaryBroad}</strong>
          <span>ordinary %All access</span>
        </div>
        <div>
          <strong>{summary.conditionalBroad}</strong>
          <span>conditional %All access</span>
        </div>
        <div>
          <strong>{summary.publicWriteResources}</strong>
          <span>public write resources</span>
        </div>
        <div>
          <strong>{summary.guestApplications}</strong>
          <span>enabled guest entry points</span>
        </div>
        <div>
          <strong>{summary.unreadable}</strong>
          <span>unreadable accounts</span>
        </div>
      </div>
      {summary.warnings.length > 0 && (
        <p className="notice">Incomplete capture: counts describe only the available data.</p>
      )}
      <h3>Role cycles</h3>
      {summary.cycles.length ? (
        <ul>
          {summary.cycles.map((cycle) => (
            <li key={cycle.join('\0')}>{cycle.join(' ↔ ')}</li>
          ))}
        </ul>
      ) : (
        <p>No cycles found among captured role definitions.</p>
      )}
      <div className="section-heading">
        <h3>Cleanup candidates</h3>
        <label className="field">
          Kind
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="all">All kinds</option>
            {[...new Set(summary.cleanup.map((row) => row.kind))].sort().map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <p>These suggestions require review. No access is changed by this analysis.</p>
      {rows.map((row) => (
        <article className="analysis-candidate" key={row.id}>
          <span className="eyebrow">{row.kind}</span>
          <h4>{row.title}</h4>
          <code>{row.subject}</code>
          <p>{row.explanation}</p>
          {row.details.length > 0 && (
            <details>
              <summary>Details</summary>
              <ul>
                {row.details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            </details>
          )}
        </article>
      ))}
      {!rows.length && <p>No candidates in this category.</p>}
    </section>
  );
}

function AccountComparison({ snapshot }: { snapshot: AccessSnapshot }) {
  const [left, setLeft] = useState(snapshot.users[0]?.Name || '');
  const [right, setRight] = useState(snapshot.users[1]?.Name || snapshot.users[0]?.Name || '');
  const [differentOnly, setDifferentOnly] = useState(true);
  const result = useMemo(() => {
    try {
      return { data: compareAccounts(snapshot, left, right), error: '' };
    } catch (failure) {
      return { data: undefined, error: (failure as Error).message };
    }
  }, [snapshot, left, right]);
  return (
    <section className="panel padded">
      <h2>Compare accounts</h2>
      <div className="analysis-pair">
        <NamePicker
          label="First account"
          names={snapshot.users.map((user) => user.Name)}
          value={left}
          change={setLeft}
        />
        <NamePicker
          label="Second account"
          names={snapshot.users.map((user) => user.Name)}
          value={right}
          change={setRight}
        />
      </div>
      {result.error && <ErrorBox error={result.error} />}
      {result.data && (
        <>
          <div className="analysis-pair">
            {[result.data.left, result.data.right].map((account, index) => (
              <article key={index} className="analysis-account-summary">
                <h3>{account.name}</h3>
                <Badge tone={account.enabled ? 'neutral' : 'warning'}>
                  {account.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <p>%All: {account.broad}</p>
                <p>Ordinary roles: {account.ordinaryRoles.join(', ') || 'None observed'}</p>
                <p>Conditional roles: {account.conditionalRoles.join(', ') || 'None observed'}</p>
                {account.unknown.length > 0 && (
                  <details>
                    <summary>Unknown data</summary>
                    <ul>
                      {account.unknown.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            ))}
          </div>
          <label className="analysis-check">
            <input
              type="checkbox"
              checked={differentOnly}
              onChange={(event) => setDifferentOnly(event.target.checked)}
            />
            Only resources with different declared grants
          </label>
          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>{left}</th>
                  <th>{right}</th>
                  <th>Public</th>
                </tr>
              </thead>
              <tbody>
                {result.data.resources
                  .filter((row) => !differentOnly || row.different)
                  .map((row) => (
                    <tr key={row.name}>
                      <th>{row.name}</th>
                      <td>
                        <GrantCell
                          ordinary={row.left.ordinary}
                          conditional={row.left.conditional}
                          unknown={row.left.unknown}
                        />
                      </td>
                      <td>
                        <GrantCell
                          ordinary={row.right.ordinary}
                          conditional={row.right.conditional}
                          unknown={row.right.unknown}
                        />
                      </td>
                      <td>{row.left.public || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p>
            R = read · W = write · U = use. %All is shown separately; it is not expanded into
            invented per-resource grants.
          </p>
          <button
            onClick={() =>
              download('atlas-account-comparison.json', {
                instance: snapshot.instance,
                capturedAt: snapshot.capturedAt,
                comparison: result.data,
              })
            }
          >
            Export comparison
          </button>
        </>
      )}
    </section>
  );
}

function GrantCell({
  ordinary,
  conditional,
  unknown,
}: {
  ordinary: string;
  conditional: string;
  unknown: boolean;
}) {
  return (
    <>
      <strong>{ordinary || '—'}</strong>
      {conditional && <small>Conditional: {conditional}</small>}
      {unknown && <small>Incomplete data</small>}
    </>
  );
}

function RoleInspection({ snapshot }: { snapshot: AccessSnapshot }) {
  const [role, setRole] = useState(snapshot.roles[0]?.Name || '');
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const result = useMemo(() => {
    try {
      return { data: roleImpact(snapshot, role), error: '' };
    } catch (failure) {
      return { data: undefined, error: (failure as Error).message };
    }
  }, [snapshot, role]);
  return (
    <section className="panel padded">
      <h2>Role impact</h2>
      <NamePicker
        label="Role"
        names={snapshot.roles.map((item) => item.Name)}
        value={role}
        change={setRole}
      />
      {result.error && <ErrorBox error={result.error} />}
      {result.data && (
        <>
          <p>{result.data.role.Description}</p>
          <p>Direct parent roles: {result.data.directParents.join(', ') || 'None captured'}</p>
          <p>Inherited roles: {result.data.role.GrantedRoles.join(', ') || 'None captured'}</p>
          <p>Broad privilege: {result.data.projection.broad}</p>
          <label className="analysis-check">
            <input
              type="checkbox"
              checked={includeDisabled}
              onChange={(event) => setIncludeDisabled(event.target.checked)}
            />
            Include disabled accounts
          </label>
          <h3>Accounts affected by this role</h3>
          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Assignment</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {result.data.accounts
                  .filter((account) => includeDisabled || account.enabled)
                  .map((account) => (
                    <tr key={account.name}>
                      <th>{account.name}</th>
                      <td>
                        {account.direct
                          ? 'Direct'
                          : account.ordinary
                            ? 'Inherited'
                            : account.conditional
                              ? 'Conditional only'
                              : 'Unknown'}
                        {account.unknown.length > 0 && <small>Incomplete data</small>}
                      </td>
                      <td>{account.enabled ? 'Enabled' : 'Disabled'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <h3>Resource grants reachable through this role</h3>
          {result.data.resources.map((resource) => (
            <details key={resource.name}>
              <summary>
                {resource.name} · {resource.ordinary || '—'}
                {resource.conditional ? ' · conditional ' + resource.conditional : ''}
              </summary>
              <ul>
                {resource.sources.map((source, index) => (
                  <li key={index}>
                    {source.path.join(' → ')}: {source.permissions}
                    {source.conditional ? ' (conditional)' : ''}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <h3>Applications using these entry resources</h3>
          <ul>
            {result.data.applications.map((app) => (
              <li key={app.Name}>
                {app.Name} · {app.Resource} · {app.Enabled ? 'enabled' : 'disabled'}
              </li>
            ))}
          </ul>
          <p>
            An entry-resource match does not prove full access to an application's data or APIs.
          </p>
          <button
            onClick={() =>
              download('atlas-role-impact.json', {
                instance: snapshot.instance,
                capturedAt: snapshot.capturedAt,
                impact: result.data,
              })
            }
          >
            Export role impact
          </button>
        </>
      )}
    </section>
  );
}

function Coverage({ snapshot }: { snapshot: AccessSnapshot }) {
  const [resource, setResource] = useState(snapshot.resources[0]?.Name || '');
  const [permission, setPermission] = useState<PermissionLetter>('R');
  const [filter, setFilter] = useState('');
  const rows = useMemo(
    () => resourceCoverage(snapshot, resource, permission),
    [snapshot, resource, permission],
  );
  return (
    <section className="panel padded">
      <h2>Resource coverage</h2>
      <div className="analysis-pair">
        <NamePicker
          label="Resource"
          names={snapshot.resources.map((item) => item.Name)}
          value={resource}
          change={setResource}
        />
        <label className="field">
          Permission
          <select
            value={permission}
            onChange={(event) => setPermission(event.target.value as PermissionLetter)}
          >
            <option value="R">Read</option>
            <option value="W">Write</option>
            <option value="U">Use</option>
          </select>
        </label>
      </div>
      <label className="field">
        Find account
        <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
      </label>
      {rows
        .filter((row) => row.account.toLowerCase().includes(filter.toLowerCase()))
        .map((row) => (
          <details className="analysis-coverage" key={row.account}>
            <summary>
              <strong>{row.account}</strong>
              <Badge tone={row.status === 'unknown' ? 'warning' : 'neutral'}>{row.status}</Badge>
            </summary>
            <ul>
              {row.sources.map((source, index) => (
                <li key={index}>
                  {source.path.join(' → ')} · {source.permissions}
                  {source.conditional ? ' · conditional' : ''}
                </li>
              ))}
            </ul>
            {row.warnings.length > 0 && <p>{row.warnings.join(' ')}</p>}
          </details>
        ))}
      <p>
        “Not observed” means no matching declared grant was found. It does not mean that a live
        authorization check would deny access.
      </p>
      <button
        onClick={() =>
          download('atlas-resource-coverage.json', {
            instance: snapshot.instance,
            capturedAt: snapshot.capturedAt,
            resource,
            permission,
            rows,
          })
        }
      >
        Export coverage
      </button>
    </section>
  );
}

function NamePicker({
  label,
  names,
  value,
  change,
}: {
  label: string;
  names: string[];
  value: string;
  change: (value: string) => void;
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(event) => change(event.target.value)}>
        <option value="">Choose {label.toLowerCase()}</option>
        {names.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
    </label>
  );
}

function Simulation({ snapshot }: { snapshot: AccessSnapshot }) {
  const [changes, setChanges] = useState<SimulationChange[]>([]);
  const [title, setTitle] = useState('Access change plan');
  const [kind, setKind] = useState<SimulationChange['kind']>('account-role');
  const [account, setAccount] = useState(snapshot.users[0]?.Name || '');
  const [role, setRole] = useState(snapshot.roles[0]?.Name || '');
  const [inherited, setInherited] = useState(snapshot.roles[0]?.Name || '');
  const [resource, setResource] = useState(snapshot.resources[0]?.Name || '');
  const [mode, setMode] = useState<'assign' | 'remove'>('remove');
  const [escalation, setEscalation] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [letters, setLetters] = useState('R');
  const [error, setError] = useState('');
  const result = useMemo(() => {
    try {
      return { data: simulateAccess(snapshot, changes), error: '' };
    } catch (failure) {
      return { data: undefined, error: (failure as Error).message };
    }
  }, [snapshot, changes]);
  const plan = (): SimulationPlan => ({ version: 1, title, instance: snapshot.instance, changes });
  function add() {
    let change: SimulationChange;
    switch (kind) {
      case 'account-role':
        change = { kind, account, role, mode, escalation };
        break;
      case 'account-state':
        change = { kind, account, enabled };
        break;
      case 'role-inheritance':
        change = { kind, role, inherited, mode };
        break;
      case 'resource-grant':
        change = { kind, role, resource, permissions: letters };
        break;
      case 'public-grant':
        change = { kind, resource, permissions: letters };
        break;
    }
    try {
      simulateAccess(snapshot, [...changes, change]);
      setChanges([...changes, change]);
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  return (
    <section className="panel padded">
      <h2>Change simulation</h2>
      <p>
        Preview up to 40 configuration changes against this capture. Simulation and imported plans
        cannot change IRIS.
      </p>
      <label className="field">
        Plan title
        <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="analysis-simulation-form">
        <label className="field">
          Change type
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as SimulationChange['kind'])}
          >
            <option value="account-role">Account role assignment</option>
            <option value="account-state">Enable or disable account</option>
            <option value="role-inheritance">Role inheritance</option>
            <option value="resource-grant">Role resource grant</option>
            <option value="public-grant">Public resource grant</option>
          </select>
        </label>
        {['account-role', 'account-state'].includes(kind) && (
          <NamePicker
            label="Account"
            names={snapshot.users.map((user) => user.Name)}
            value={account}
            change={setAccount}
          />
        )}
        {['account-role', 'role-inheritance', 'resource-grant'].includes(kind) && (
          <NamePicker
            label="Role"
            names={snapshot.roles.map((item) => item.Name)}
            value={role}
            change={setRole}
          />
        )}
        {kind === 'role-inheritance' && (
          <NamePicker
            label="Inherited role"
            names={snapshot.roles.map((item) => item.Name)}
            value={inherited}
            change={setInherited}
          />
        )}
        {['resource-grant', 'public-grant'].includes(kind) && (
          <>
            <NamePicker
              label="Resource"
              names={snapshot.resources.map((item) => item.Name)}
              value={resource}
              change={setResource}
            />
            <label className="field">
              Grant
              <select value={letters} onChange={(event) => setLetters(event.target.value)}>
                {['', 'R', 'W', 'U', 'RW', 'RU', 'WU', 'RWU'].map((value) => (
                  <option value={value} key={value}>
                    {value || 'Remove grant'}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {['account-role', 'role-inheritance'].includes(kind) && (
          <label className="field">
            Action
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as 'assign' | 'remove')}
            >
              <option value="remove">Remove</option>
              <option value="assign">Assign</option>
            </select>
          </label>
        )}
        {kind === 'account-role' && (
          <label className="analysis-check">
            <input
              type="checkbox"
              checked={escalation}
              onChange={(event) => setEscalation(event.target.checked)}
            />
            Escalation assignment
          </label>
        )}
        {kind === 'account-state' && (
          <label className="analysis-check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enabled after change
          </label>
        )}
        <button disabled={changes.length >= 40} onClick={add}>
          Add to simulation
        </button>
      </div>
      {(error || result.error) && <ErrorBox error={error || result.error} />}
      <ol className="analysis-plan">
        {changes.map((change, index) => (
          <li key={index}>
            <code>
              {change.kind}: {JSON.stringify(change)}
            </code>
            <button
              aria-label={'Remove change ' + (index + 1)}
              onClick={() => setChanges(changes.filter((_, row) => row !== index))}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <div className="inline-actions">
        <button disabled={!changes.length} onClick={() => setChanges([])}>
          Clear plan
        </button>
        <button
          disabled={!changes.length || !title.trim()}
          onClick={() => download('atlas-simulation-plan.json', plan())}
        >
          Export plan
        </button>
        <label className="field">
          Import plan
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              try {
                if (file.size > 64_000) throw new Error('Simulation plans are limited to 64 KB.');
                const imported = simulationPlanSchema.parse(JSON.parse(await file.text()));
                if (imported.instance !== snapshot.instance)
                  throw new Error('This plan belongs to another configured instance.');
                simulateAccess(snapshot, imported.changes);
                setTitle(imported.title);
                setChanges(imported.changes);
                setError('');
              } catch (failure) {
                setError((failure as Error).message);
              }
            }}
          />
        </label>
      </div>
      {result.data && (
        <>
          <h3>{result.data.affected.length} affected accounts</h3>
          {result.data.affected.map((row) => (
            <details key={row.name}>
              <summary>
                {row.name} · {row.resources.length} changed resource grants
              </summary>
              <p>
                State: {row.enabledBefore ? 'enabled' : 'disabled'} →{' '}
                {row.enabledAfter ? 'enabled' : 'disabled'} · %All: {row.broadBefore} →{' '}
                {row.broadAfter}
              </p>
              {row.assignedChanged && <p>Direct role assignments change.</p>}
              {row.warnings.length > 0 && <p className="notice">{row.warnings.join(' ')}</p>}
              <div className="analysis-table-wrap">
                <table className="analysis-table">
                  <thead>
                    <tr>
                      <th>Resource</th>
                      <th>Before</th>
                      <th>After</th>
                      <th>Public change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.resources.map((resource) => (
                      <tr key={resource.name}>
                        <th>{resource.name}</th>
                        <td>
                          <GrantCell
                            ordinary={resource.before.ordinary}
                            conditional={resource.before.conditional}
                            unknown={resource.before.unknown}
                          />
                        </td>
                        <td>
                          <GrantCell
                            ordinary={resource.after.ordinary}
                            conditional={resource.after.conditional}
                            unknown={resource.after.unknown}
                          />
                        </td>
                        <td>
                          {resource.before.public || '—'} → {resource.after.public || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          <button
            disabled={!changes.length}
            onClick={() =>
              download('atlas-simulation-result.json', {
                plan: plan(),
                sourceCapturedAt: snapshot.capturedAt,
                affected: result.data!.affected,
              })
            }
          >
            Export projected impact
          </button>
        </>
      )}
    </section>
  );
}
