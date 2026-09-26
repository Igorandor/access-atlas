import { useEffect, useRef, useState } from 'react';
import { parameters, readablePaths } from '../../shared/schema';
import { iris, request } from '../api';
import { DataView, caption } from '../components/DataView';
import { ErrorBox, Loading, PageHeader } from '../components/ui';

const sources = {
  overview: [
    { path: '/v2/monitor/dashboard/main', summary: 'Native instance dashboard' },
    { path: '/info', summary: 'Account and instance capabilities' },
    { path: '/extension/telemetry', summary: 'Host capacity and counters' },
  ],
  logs: [
    { path: '/extension/logs', summary: 'IRIS messages and alerts' },
    { path: '/v2/security/audit/records', summary: 'Security audit records' },
    { path: '/v2/task/history', summary: 'Task execution history' },
    { path: '/v2/journal/files', summary: 'Journal file inventory' },
    { path: 'activity', summary: 'Session operation history' },
  ],
  explorer: readablePaths,
};
export function ReadDesk({ kind }: { kind: keyof typeof sources }) {
  const choices = sources[kind],
    [search, setSearch] = useState('');
  const [path, setPath] = useState(choices[0]?.path ?? '/info');
  const [query, setQuery] = useState<Record<string, string>>({}),
    [result, setResult] = useState<any>();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [at, setAt] = useState('');
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const verb = path === '/v2/security/audit/records' ? 'POST' : 'GET';
  const fields =
    path === '/extension/logs'
      ? [
          { name: 'source', required: false },
          { name: 'limit', required: false },
        ]
      : parameters(path, verb);
  async function read() {
    const sequence = ++generation.current;
    setBusy(true);
    setResult(undefined);
    setError('');
    setAt('');
    try {
      const response =
        path === 'activity'
          ? { data: await request('activity') }
          : await iris(
              path,
              Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '')),
              verb,
            );
      if (generation.current === sequence) {
        setResult(response.data);
        setAt(new Date().toLocaleString());
      }
    } catch (failure) {
      if (generation.current === sequence) setError((failure as Error).message);
    } finally {
      if (generation.current === sequence) setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title={
          kind === 'logs'
            ? 'Operational evidence'
            : kind === 'explorer'
              ? 'Read API catalog'
              : 'Instance evidence'
        }
        description="Choose a source and collect a bounded view with your current IRIS privileges."
      />
      <div className="atlas-read-desk">
        <aside className="atlas-source-index">
          <label className="field">
            Find a source
            <input
              disabled={busy}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {choices
            .filter((item) =>
              (item.summary + item.path).toLowerCase().includes(search.toLowerCase()),
            )
            .map((item) => (
              <button
                key={item.path}
                aria-current={item.path === path ? 'true' : undefined}
                disabled={busy}
                onClick={() => {
                  setPath(item.path);
                  setQuery({});
                  setResult(undefined);
                  setError('');
                  setAt('');
                }}
              >
                {item.summary}
              </button>
            ))}
        </aside>
        <section className="panel">
          <h2>{choices.find((item) => item.path === path)?.summary}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void read();
            }}
          >
            <fieldset disabled={busy} className="atlas-query-grid">
              {fields.map((field) => (
                <label className="field" key={field.name}>
                  {caption(field.name)}
                  {field.required ? ' *' : ''}
                  {field.name === 'source' ? (
                    <select
                      value={query.source ?? 'messages'}
                      onChange={(event) => {
                        setQuery({ ...query, source: event.target.value });
                        setResult(undefined);
                      }}
                    >
                      <option value="messages">Messages</option>
                      <option value="alerts">Alerts</option>
                    </select>
                  ) : (
                    <input
                      required={field.required}
                      value={query[field.name] ?? ''}
                      onChange={(event) => {
                        setQuery({ ...query, [field.name]: event.target.value });
                        setResult(undefined);
                      }}
                    />
                  )}
                </label>
              ))}
              <button className="primary" type="submit">
                Collect evidence
              </button>
            </fieldset>
          </form>
          {busy && <Loading />}
          {error && <ErrorBox error={error} />}
          {result !== undefined && (
            <>
              <p className="muted">
                Captured {at}. This is a loaded view, not a full-instance backup.
              </p>
              {result?.notice && <p className="notice">{result.notice}</p>}
              {path === '/v2/monitor/dashboard/main' && result?.Status?.SystemMonitor !== true && (
                <p className="notice">
                  The IRIS system monitor is not updating. Returned performance values may be stale.
                </p>
              )}
              {path === '/extension/telemetry' && (
                <p className="notice">
                  {result.scope}. CPU ticks are cumulative; memory uses available bytes rather than
                  free-only bytes.
                </p>
              )}
              <DataView data={result?.lines ?? result} title="Collected evidence" />
            </>
          )}
        </section>
      </div>
    </>
  );
}
