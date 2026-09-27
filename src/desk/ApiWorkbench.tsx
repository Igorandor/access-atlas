import { useEffect, useMemo, useRef, useState } from 'react';
import {
  readOperations,
  validateReadQuery,
  parseQueryPlan,
  compareQueryValues,
  describeResultShape,
  type SavedQuery,
  type QueryResult,
  type QueryPlan,
} from '../../shared/query-workbench';
import { plainDescription } from '../../shared/schema';
import { iris, download, RequestError } from '../api';
import { DataView, DataValue } from '../components/DataView';
import { Badge, ErrorBox, PageHeader } from '../components/ui';
import './workbench.css';

const operations = readOperations();
export function ApiWorkbench() {
  const [path, setPath] = useState(operations[0]?.path || '/info');
  const operation = operations.find((item) => item.path === path)!;
  const [query, setQuery] = useState<Record<string, string>>({});
  const [group, setGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('Read plan');
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [selected, setSelected] = useState('');
  const [baseline, setBaseline] = useState<QueryResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('result');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const chosen = results.find((result) => result.id === selected) || results.at(-1);
  const visible = operations.filter(
    (item) =>
      (group === 'all' || item.group === group) &&
      (item.path + ' ' + item.title).toLowerCase().includes(search.toLowerCase()),
  );
  const comparison = useMemo(
    () => (baseline && chosen ? compareQueryValues(baseline.data, chosen.data) : undefined),
    [baseline, chosen],
  );
  function choose(next: string) {
    setPath(next);
    setQuery({});
    setError('');
  }
  function add() {
    try {
      if (queries.length >= 8) throw new Error('Read plans are limited to eight queries.');
      const validated = validateReadQuery(path, query);
      setQueries([
        ...queries,
        {
          id: crypto.randomUUID(),
          title: plainDescription(operation.title).slice(0, 160) || path,
          path,
          query: validated,
        },
      ]);
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  async function collect(items: SavedQuery[]) {
    const token = ++generation.current;
    setBusy(true);
    setError('');
    const output: QueryResult[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < items.length && generation.current === token) {
        const item = items[cursor++];
        const started = performance.now();
        const base = {
          id: crypto.randomUUID(),
          title: item.title,
          path: item.path,
          query: item.query,
          at: new Date().toISOString(),
        };
        let result: QueryResult;
        try {
          const validated = validateReadQuery(item.path, item.query);
          const response = await iris(item.path, validated);
          const bytes = new TextEncoder().encode(JSON.stringify(response.data)).length;
          result =
            bytes > 300_000
              ? {
                  ...base,
                  elapsedMs: Math.round(performance.now() - started),
                  status: 'oversized',
                  httpStatus: response.status,
                  error: 'Result exceeded the 300 KB workbench retention limit. Narrow the query.',
                }
              : {
                  ...base,
                  elapsedMs: Math.round(performance.now() - started),
                  status: 'complete',
                  httpStatus: response.status,
                  data: response.data,
                };
        } catch (failure) {
          result = {
            ...base,
            elapsedMs: Math.round(performance.now() - started),
            status: 'failed',
            httpStatus: failure instanceof RequestError ? failure.status : undefined,
            error: (failure as Error).message,
          };
        }
        output.push(result);
        if (generation.current === token) {
          setResults((previous) => [...previous, result].slice(-24));
          setSelected(result.id);
        }
      }
    };
    await Promise.all([worker(), worker()]);
    if (generation.current === token) setBusy(false);
    return output;
  }
  function runCurrent() {
    try {
      void collect([
        {
          id: crypto.randomUUID(),
          title: plainDescription(operation.title),
          path,
          query: validateReadQuery(path, query),
        },
      ]);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  const plan: QueryPlan = { version: 1, title, queries };
  return (
    <>
      <PageHeader
        title="REST query workbench"
        description="Inspect native read operations, build a query plan and compare responses."
      />
      {error && <ErrorBox error={error} />}
      <div className="query-workbench">
        <aside className="panel query-index">
          <label className="field">
            Find operation
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="field">
            Area
            <select value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="all">All areas</option>
              {[...new Set(operations.map((operation) => operation.group))].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <p>{visible.length} read operations</p>
          <nav aria-label="Read operations">
            {visible.map((item) => (
              <button
                key={item.path}
                aria-pressed={item.path === path}
                disabled={busy}
                onClick={() => choose(item.path)}
              >
                <span>GET {item.path}</span>
                <small>{plainDescription(item.title)}</small>
              </button>
            ))}
          </nav>
        </aside>
        <div className="query-editor">
          <section className="panel padded">
            <h2>{plainDescription(operation.title)}</h2>
            <code>GET {path}</code>
            {operation.description && <p>{plainDescription(operation.description)}</p>}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                runCurrent();
              }}
            >
              <fieldset disabled={busy}>
                {operation.fields.map((field) => (
                  <label className="field" key={field.name}>
                    {field.name}
                    {field.required ? ' *' : ''}
                    {field.choices.length ? (
                      <select
                        required={field.required}
                        value={query[field.name] || ''}
                        onChange={(event) =>
                          setQuery({ ...query, [field.name]: event.target.value })
                        }
                      >
                        <option value="">Choose value</option>
                        {field.choices.map((choice) => (
                          <option key={choice}>{choice}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={query[field.name] || ''}
                        required={field.required}
                        maxLength={2000}
                        placeholder={field.name === 'maxRows' ? '250 (maximum 1,000)' : field.type}
                        onChange={(event) =>
                          setQuery({ ...query, [field.name]: event.target.value })
                        }
                      />
                    )}
                    <small>{plainDescription(field.description)}</small>
                  </label>
                ))}
                <div className="inline-actions">
                  <button className="primary">Run query</button>
                  <button type="button" disabled={queries.length >= 8} onClick={add}>
                    Add to plan
                  </button>
                </div>
              </fieldset>
            </form>
            <p className="muted">
              Read-only operations use your current IRIS account. Credential retrieval endpoints are
              excluded.
            </p>
          </section>
          <section className="panel padded">
            <div className="section-heading">
              <h2>Query plan</h2>
              <span>{queries.length}/8 queries</span>
            </div>
            <label className="field">
              Plan title
              <input
                value={title}
                maxLength={160}
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <ol className="query-plan">
              {queries.map((item, index) => (
                <li key={item.id}>
                  <div>
                    <input
                      aria-label={'Query ' + (index + 1) + ' title'}
                      maxLength={160}
                      value={item.title}
                      disabled={busy}
                      onChange={(event) =>
                        setQueries(
                          queries.map((query) =>
                            query.id === item.id ? { ...query, title: event.target.value } : query,
                          ),
                        )
                      }
                    />
                    <code>{item.path}</code>
                    <span>
                      {Object.entries(item.query)
                        .map(([key, value]) => key + '=' + value)
                        .join(' · ') || 'No parameters'}
                    </span>
                  </div>
                  <div className="inline-actions">
                    <button
                      disabled={busy || index === 0}
                      aria-label={'Move query ' + (index + 1) + ' earlier'}
                      onClick={() => {
                        const next = [...queries];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setQueries(next);
                      }}
                    >
                      Up
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setQueries(queries.filter((query) => query.id !== item.id))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="inline-actions">
              <button
                disabled={
                  busy ||
                  !queries.length ||
                  !title.trim() ||
                  queries.some((query) => !query.title.trim())
                }
                onClick={() => void collect(queries)}
              >
                Run plan
              </button>
              <button
                disabled={!queries.length || !title.trim()}
                onClick={() => download('atlas-read-plan.json', plan)}
              >
                Export plan
              </button>
              <label className="field">
                Import plan
                <input
                  type="file"
                  disabled={busy}
                  accept="application/json,.json"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    try {
                      if (file.size > 64_000) throw new Error('Read plans are limited to 64 KB.');
                      const imported = parseQueryPlan(JSON.parse(await file.text()));
                      setTitle(imported.title);
                      setQueries(imported.queries);
                      setError('');
                    } catch (failure) {
                      setError((failure as Error).message);
                    }
                  }}
                />
              </label>
            </div>
            <p>
              Plans run two reads at a time. Results are independently timed and may describe
              different instants.
            </p>
          </section>
        </div>
      </div>
      <section className="panel padded query-results">
        <div className="section-heading">
          <h2>Results</h2>
          <div className="inline-actions">
            <button
              disabled={!results.length}
              onClick={() => download('atlas-query-results.json', { version: 1, results })}
            >
              Export retained results
            </button>
            <button
              disabled={busy || !results.length}
              onClick={() => {
                setResults([]);
                setSelected('');
                setBaseline(undefined);
              }}
            >
              Clear results
            </button>
          </div>
        </div>
        {busy && <p role="status">Reading native sources…</p>}
        <p>
          Up to 24 results remain in this tab, limited to 300 KB each. Export before signing out or
          reloading.
        </p>
        <div className="query-result-layout">
          <nav aria-label="Query result history">
            {[...results].reverse().map((result) => (
              <button
                key={result.id}
                aria-pressed={chosen?.id === result.id}
                onClick={() => setSelected(result.id)}
              >
                <strong>{result.title}</strong>
                <span>
                  {result.status} · {result.elapsedMs} ms
                </span>
                <small>{new Date(result.at).toLocaleString()}</small>
              </button>
            ))}
          </nav>
          <div>
            {chosen && (
              <>
                <h3>{chosen.title}</h3>
                <p>
                  <code>{chosen.path}</code> ·{' '}
                  {chosen.httpStatus ? 'HTTP ' + chosen.httpStatus : 'No HTTP response'} ·{' '}
                  {new Date(chosen.at).toLocaleString()}
                </p>
                {chosen.error && <ErrorBox error={chosen.error} />}
                {chosen.status === 'complete' && (
                  <>
                    <div className="inline-actions">
                      <button
                        onClick={() => {
                          setBaseline(chosen);
                          setView('comparison');
                        }}
                      >
                        Use as comparison baseline
                      </button>
                      <button onClick={() => setView('result')}>Result</button>
                      <button disabled={!baseline} onClick={() => setView('comparison')}>
                        Compare
                      </button>
                      <button onClick={() => setView('shape')}>Fields</button>
                    </div>
                    {view === 'result' && <DataView data={chosen.data} title="Query result" />}
                    {view === 'shape' && <ResultShape data={chosen.data} />}
                    {view === 'comparison' && (
                      <>
                        {baseline && (
                          <p>
                            Baseline: {baseline.title} · {new Date(baseline.at).toLocaleString()}
                          </p>
                        )}
                        {baseline && baseline.path !== chosen.path && (
                          <p className="notice">These results come from different API paths.</p>
                        )}
                        {comparison && (
                          <>
                            <p>
                              {comparison.rows.length} changed value paths
                              {comparison.truncated ? ' · comparison limit reached' : ''}. Array
                              order is significant.
                            </p>
                            {comparison.rows.map((row) => (
                              <details key={row.path}>
                                <summary>
                                  <Badge>{row.change}</Badge> {row.path}
                                </summary>
                                <div className="query-compare">
                                  <div>
                                    <h4>Before</h4>
                                    <DataValue value={row.before} />
                                  </div>
                                  <div>
                                    <h4>After</h4>
                                    <DataValue value={row.after} />
                                  </div>
                                </div>
                              </details>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {!chosen && <p>Run a query to inspect a result.</p>}
          </div>
        </div>
      </section>
    </>
  );
}
function ResultShape({ data }: { data: unknown }) {
  const shape = describeResultShape(data);
  return (
    <section>
      <h3>Response shape</h3>
      <p>
        {shape.kind} · {shape.records} records
      </p>
      <p>Fields sampled from the first 100 records:</p>
      <ul className="query-fields">
        {shape.fields.map((field) => (
          <li key={field}>
            <code>{field}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
