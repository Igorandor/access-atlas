import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { AccessSnapshot } from '../../../shared/access-model';
import {
  collectSqlEvidence,
  filterSqlRows,
  type SqlEvidence as Report,
  type SqlSource,
} from '../../../shared/sql-evidence';
import { download, iris, request } from '../../api';
import { Badge, ErrorBox } from '../../components/ui';
import './analysis.css';

export function SqlEvidence({ snapshot }: { snapshot?: AccessSnapshot }) {
  const [namespace, setNamespace] = useState('USER');
  const [grantee, setGrantee] = useState('');
  const [report, setReport] = useState<Report>();
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const listId = useId();
  const suggestions = useMemo(
    () =>
      [
        ...new Set([
          ...(snapshot?.users.map((user) => user.Name) ?? []),
          ...(snapshot?.roles.map((role) => role.Name) ?? []),
        ]),
      ].sort(),
    [snapshot],
  );
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  function changeScope(change: () => void) {
    generation.current++;
    change();
    setLoading(false);
    setReport(undefined);
    setError('');
    setFilter('');
  }
  async function capture() {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const session = await request<{ instance?: string }>('session');
      if (current !== generation.current) return;
      const instance = session.instance ?? snapshot?.instance ?? '';
      const result = await collectSqlEvidence(instance, { namespace, grantee }, iris);
      if (current === generation.current) setReport(result);
    } catch (failure) {
      if (current === generation.current) setError((failure as Error).message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  return (
    <section className="panel padded">
      <div className="section-heading">
        <div>
          <h2>SQL privileges</h2>
          <p>Read grants for one user or role in one namespace.</p>
        </div>
        <button
          disabled={!report}
          onClick={() => report && download('atlas-sql-evidence.json', report)}
        >
          <Download size={16} /> Export all captured evidence
        </button>
      </div>
      <p>
        Choose a namespace and grantee. This does not sign in as that grantee or change any grants.
      </p>
      <form
        className="atlas-register-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void capture();
        }}
      >
        <label className="field">
          Namespace
          <input
            required
            maxLength={256}
            value={namespace}
            onChange={(event) => changeScope(() => setNamespace(event.target.value))}
          />
        </label>
        <label className="field">
          User or role
          <input
            required
            maxLength={256}
            list={listId}
            value={grantee}
            onChange={(event) => changeScope(() => setGrantee(event.target.value))}
          />
        </label>
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button className="primary" disabled={loading || !namespace.trim() || !grantee.trim()}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />{' '}
          {loading ? 'Reading SQL privileges…' : 'Read SQL privileges'}
        </button>
      </form>
      <p className="muted">
        You can type a user or role even when the access-map capture is unavailable. Each source
        requires %Admin_Secure:U.
      </p>
      {error && <ErrorBox error={error} />}
      {loading && (
        <p role="status">
          Reading object and administration grants. Each source is limited to 500 rows.
        </p>
      )}
      {report && (
        <>
          <div className="analysis-account-summary">
            <strong>
              {report.scope.grantee} · {report.scope.namespace}
            </strong>
            <p>
              {report.instance} · Captured {new Date(report.capturedAt).toLocaleString()}
            </p>
            {loading && <p>The previous capture is shown while the new read runs.</p>}
          </div>
          <label className="field">
            Filter captured privileges
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Object, privilege, grant source…"
            />
          </label>
          <p className="muted">
            Filtering changes the tables only. Export includes both sources and every captured row.
          </p>
          {report.sources.map((source) => (
            <SourceEvidence key={source.kind} source={source} filter={filter} />
          ))}
          <details className="notice">
            <summary>How to interpret this evidence</summary>
            <ul>
              {report.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

function flag(value: boolean | undefined) {
  return value === undefined ? 'Unknown' : value ? 'Yes' : 'No';
}
function SourceEvidence({ source, filter }: { source: SqlSource; filter: string }) {
  const rows = filterSqlRows(source.rows, filter);
  const object = source.kind === 'object';
  return (
    <section aria-label={object ? 'Object SQL privileges' : 'SQL administration privileges'}>
      <div className="section-heading">
        <h3>{object ? 'Object privileges' : 'Administration privileges'}</h3>
        <Badge tone={source.status === 'read' ? 'neutral' : 'warning'}>
          {source.status === 'read'
            ? 'Read'
            : source.status === 'partial'
              ? 'Partial evidence'
              : 'Unavailable'}
        </Badge>
      </div>
      <p className="muted">
        {new Date(source.finishedAt).toLocaleString()} · {source.rows.length} retained
        {source.returnedCount !== undefined ? ` of ${source.returnedCount} returned` : ''} · Limit{' '}
        {source.limit} rows{source.httpStatus ? ` · HTTP ${source.httpStatus}` : ''}
      </p>
      <details>
        <summary>Source request</summary>
        <code>
          {source.path}?{new URLSearchParams(source.query).toString()}
        </code>
      </details>
      {source.error && <ErrorBox error={source.error} />}
      {source.warnings.map((warning) => (
        <p className="notice" key={warning}>
          {warning}
        </p>
      ))}
      {source.status !== 'unavailable' && (
        <>
          <p>
            {rows.length} displayed · {source.rows.length} captured
          </p>
          {!rows.length ? (
            <p>
              {source.rows.length
                ? 'No captured privileges match this filter.'
                : source.status === 'partial'
                  ? 'No readable privilege rows were retained; see the source warnings.'
                  : 'No privileges returned for this scope. Check the grantee spelling and existence; an unknown grantee can also return an empty list. This is not proof of denied access.'}
            </p>
          ) : (
            <div
              className="analysis-table-wrap"
              tabIndex={0}
              role="region"
              aria-label={
                object
                  ? 'Scrollable object privileges table'
                  : 'Scrollable administration privileges table'
              }
            >
              <table className="analysis-table">
                <thead>
                  <tr>
                    {object && (
                      <>
                        <th>Type</th>
                        <th>Object</th>
                      </>
                    )}
                    <th>Privilege</th>
                    <th>Granted via</th>
                    <th>{object ? 'Grant option' : 'Admin option'}</th>
                    {object && (
                      <>
                        <th>Granted by</th>
                        <th>Column privileges</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      {object && (
                        <>
                          <td>{row.Type}</td>
                          <td>{row.Name}</td>
                        </>
                      )}
                      <td>{row.Privilege}</td>
                      <td>{row.GrantedVia || 'Unknown'}</td>
                      <td>{flag(row.GrantOption)}</td>
                      {object && (
                        <>
                          <td>{row.GrantedBy || 'Unknown'}</td>
                          <td>{flag(row.HasColumnPriv)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
