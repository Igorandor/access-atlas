import { useEffect, useMemo, useRef, useState } from 'react';
import { iris, request, download, RequestError } from '../api';
import { parameters, plainDescription } from '../../shared/schema';
import {
  normalizeLogEntries,
  filterLogEntries,
  logSummary,
  compareLogWindows,
  logCsv,
  type LogEntry,
} from '../../shared/log-review';
import { DataValue } from '../components/DataView';
import { Badge, ErrorBox, PageHeader } from '../components/ui';
import './logs.css';
const logSources = [
  { id: 'messages', title: 'IRIS messages', path: '/extension/logs', watch: true },
  { id: 'alerts', title: 'IRIS alerts', path: '/extension/logs', watch: true },
  { id: 'tasks', title: 'Task history', path: '/v2/task/history', watch: true },
  { id: 'audit', title: 'Security audit', path: '/v2/security/audit/records', watch: false },
  { id: 'journals', title: 'Journal inventory', path: '/v2/journal/files', watch: false },
  { id: 'activity', title: 'This session', path: 'activity', watch: false },
];
type Capture = { source: string; at: string; entries: LogEntry[]; notice: string; elapsed: number };
export function LogReview() {
  const [source, setSource] = useState('messages');
  const definition = logSources.find((item) => item.id === source)!;
  const [query, setQuery] = useState<Record<string, string>>({});
  const [capture, setCapture] = useState<Capture>();
  const [baseline, setBaseline] = useState<Capture>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [watch, setWatch] = useState(0);
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [actor, setActor] = useState('');
  const [level, setLevel] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [unknownTime, setUnknownTime] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [onlyNoted, setOnlyNoted] = useState(false);
  const [view, setView] = useState('entries');
  const generation = useRef(0);
  const inFlight = useRef(false);
  const reader = useRef<() => Promise<void>>(async () => {});
  const fields = ['messages', 'alerts'].includes(source)
    ? [
        {
          name: 'limit',
          required: false,
          description: 'Maximum 500 lines within the 1 MiB tail window.',
        },
      ]
    : source === 'activity'
      ? []
      : parameters(definition.path, source === 'audit' ? 'POST' : 'GET');
  async function load() {
    if (inFlight.current) return;
    inFlight.current = true;
    const token = ++generation.current;
    const started = performance.now();
    setBusy(true);
    setError('');
    try {
      const options = Object.fromEntries(Object.entries(query).filter(([, value]) => value));
      if (['messages', 'alerts'].includes(source)) {
        options.source = source;
        options.limit ||= '300';
        if (!/^\d+$/.test(options.limit) || +options.limit < 1 || +options.limit > 500)
          throw new Error('Choose from 1 to 500 log lines.');
      } else if (fields.some((field) => field.name === 'maxRows')) options.maxRows ||= '250';
      const result =
        source === 'activity'
          ? { data: await request('activity') }
          : await iris(definition.path, options, source === 'audit' ? 'POST' : 'GET');
      const entries = normalizeLogEntries(source, result.data);
      if (token === generation.current) {
        setCapture({
          source,
          at: new Date().toISOString(),
          entries,
          notice: result.data?.notice || result.data?.scope || '',
          elapsed: Math.round(performance.now() - started),
        });
        setPage(0);
        setSelected('');
      }
    } catch (failure) {
      if (token === generation.current) {
        setError((failure as Error).message);
        if (failure instanceof RequestError && [401, 403].includes(failure.status)) setWatch(0);
      }
    } finally {
      inFlight.current = false;
      if (token === generation.current) setBusy(false);
    }
  }
  reader.current = load;
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (!watch || !definition.watch) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reader.current();
    }, watch * 1000);
    return () => window.clearInterval(timer);
  }, [watch, source]);
  const summary = useMemo(() => logSummary(capture?.entries || []), [capture]);
  const filtered = useMemo(
    () =>
      filterLogEntries(capture?.entries || [], {
        include,
        exclude,
        actor,
        levels: level === 'all' ? [] : [level as LogEntry['level']],
        from: from ? Date.parse(from + 'Z') : undefined,
        to: to ? Date.parse(to + 'Z') : undefined,
        includeUnknownTime: unknownTime,
      }).filter((entry) => !onlyNoted || notes[entry.id]),
    [capture, include, exclude, actor, level, from, to, unknownTime, onlyNoted, notes],
  );
  const shown = filtered.slice(page * 50, page * 50 + 50);
  const inspected = capture?.entries.find((entry) => entry.id === selected);
  const comparison = useMemo(
    () =>
      baseline && capture && baseline.source === capture.source
        ? compareLogWindows(baseline.entries, capture.entries)
        : undefined,
    [baseline, capture],
  );
  function changeSource(id: string) {
    generation.current++;
    setSource(id);
    setQuery({});
    setCapture(undefined);
    setBaseline(undefined);
    setSelected('');
    setError('');
    setWatch(0);
    setActor('');
    setNotes({});
    setBusy(false);
  }
  return (
    <>
      <PageHeader
        title="Log review"
        description="Search loaded records, inspect native details and compare bounded log windows."
      />
      <nav className="log-source-tabs" aria-label="Log sources">
        {logSources.map((item) => (
          <button
            key={item.id}
            disabled={busy}
            aria-pressed={source === item.id}
            onClick={() => changeSource(item.id)}
          >
            {item.title}
          </button>
        ))}
      </nav>
      <section className="panel padded">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <fieldset disabled={busy}>
            <div className="log-native-query">
              {fields.map((field) => (
                <label className="field" key={field.name}>
                  {field.name}
                  {field.required ? ' *' : ''}
                  <input
                    maxLength={2000}
                    required={field.required}
                    value={query[field.name] || ''}
                    onChange={(event) => setQuery({ ...query, [field.name]: event.target.value })}
                  />
                  <small>{plainDescription(field.description)}</small>
                </label>
              ))}
            </div>
            <div className="inline-actions">
              <button className="primary">{busy ? 'Loading…' : 'Load source'}</button>
              {definition.watch && (
                <label className="field">
                  Refresh while visible
                  <select value={watch} onChange={(event) => setWatch(Number(event.target.value))}>
                    <option value={0}>Manual</option>
                    <option value={15}>Every 15 seconds</option>
                    <option value={30}>Every 30 seconds</option>
                    <option value={60}>Every minute</option>
                  </select>
                </label>
              )}
            </div>
          </fieldset>
        </form>
        {watch > 0 && (
          <p>Refresh pauses while this tab is hidden. No overlapping reads are started.</p>
        )}
        {source === 'audit' && (
          <p>
            Audit queries run as native asynchronous jobs. An empty result can also mean auditing is
            disabled.
          </p>
        )}
        {source === 'activity' && (
          <p>
            This gateway session retains up to 100 operations. It is not the authoritative IRIS
            audit trail.
          </p>
        )}
      </section>
      {error && <ErrorBox error={error} />}
      {capture && (
        <>
          <div className="log-capture-heading">
            <strong>{definition.title}</strong>
            <span>
              {new Date(capture.at).toLocaleString()} · {capture.elapsed} ms ·{' '}
              {capture.entries.length} loaded records
            </span>
            {capture.notice && <p>{capture.notice}</p>}
          </div>
          <div className="log-counts">
            {Object.entries(summary.counts).map(([name, count]) => (
              <button
                key={name}
                aria-pressed={level === name}
                onClick={() => {
                  setLevel(level === name ? 'all' : name);
                  setPage(0);
                }}
              >
                <strong>{count}</strong>
                <span>{name}</span>
              </button>
            ))}
          </div>
          {summary.heuristic > 0 && (
            <p className="muted">
              {summary.heuristic} records use text-keyword classification. These labels are search
              aids, not native severity judgments.
            </p>
          )}
          <section className="panel padded">
            <div className="log-filter-grid">
              <label className="field">
                Include text
                <input
                  value={include}
                  maxLength={1000}
                  onChange={(event) => {
                    setInclude(event.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <label className="field">
                Exclude text
                <input
                  value={exclude}
                  maxLength={1000}
                  onChange={(event) => {
                    setExclude(event.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <label className="field">
                Actor
                <select
                  value={actor}
                  onChange={(event) => {
                    setActor(event.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All actors</option>
                  {summary.actors.map(([name, count]) => (
                    <option key={name} value={name}>
                      {name} ({count})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Classification
                <select
                  value={level}
                  onChange={(event) => {
                    setLevel(event.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">All</option>
                  {Object.keys(summary.counts).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <details>
              <summary>Time filter (UTC)</summary>
              <div className="analysis-pair">
                <label className="field">
                  From
                  <input
                    type="datetime-local"
                    value={from}
                    onChange={(event) => {
                      setFrom(event.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <label className="field">
                  To
                  <input
                    type="datetime-local"
                    value={to}
                    onChange={(event) => {
                      setTo(event.target.value);
                      setPage(0);
                    }}
                  />
                </label>
              </div>
              <label className="analysis-check">
                <input
                  type="checkbox"
                  checked={unknownTime}
                  onChange={(event) => {
                    setUnknownTime(event.target.checked);
                    setPage(0);
                  }}
                />
                Keep records without an absolute timestamp
              </label>
              <p>
                {summary.unknownTime} records have no parseable timestamp with a timezone. Native
                host-local timestamps are not converted.
              </p>
            </details>
            <div className="inline-actions">
              <button onClick={() => setView('entries')}>Entries</button>
              <button
                onClick={() => {
                  setBaseline(capture);
                  setView('comparison');
                }}
              >
                Use this window as baseline
              </button>
              <button disabled={!baseline} onClick={() => setView('comparison')}>
                Compare windows
              </button>
              <button
                onClick={() =>
                  download('atlas-log-review.json', {
                    source,
                    collectedAt: capture.at,
                    entries: filtered,
                    notes,
                    classification:
                      'Native textual severity when available; otherwise keyword-based.',
                    limits:
                      'Loaded window only, at most 1000 records and 16000 display characters per entry.',
                  })
                }
              >
                Export filtered JSON
              </button>
              <button onClick={() => download('atlas-log-review.csv', logCsv(filtered))}>
                Export filtered CSV
              </button>
            </div>
            <label className="analysis-check">
              <input
                type="checkbox"
                checked={onlyNoted}
                onChange={(event) => {
                  setOnlyNoted(event.target.checked);
                  setPage(0);
                }}
              />
              Only annotated entries
            </label>
          </section>
          {view === 'entries' ? (
            <section className="panel log-entries">
              <div className="log-entry-layout">
                <div>
                  <div className="log-pagination">
                    <span>
                      {filtered.length} matches · {shown.length} shown
                    </span>
                    <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                      Previous
                    </button>
                    <button
                      disabled={(page + 1) * 50 >= filtered.length}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                  <div className="log-entry-list">
                    {shown.map((entry) => (
                      <button
                        key={entry.id}
                        aria-pressed={selected === entry.id}
                        onClick={() => setSelected(entry.id)}
                      >
                        <span className={'log-level log-level-' + entry.level}>{entry.level}</span>
                        <span>
                          <small>
                            {entry.timestamp || 'No timestamp'}
                            {entry.actor ? ' · ' + entry.actor : ''}
                          </small>
                          <span>
                            {entry.message.slice(0, 600)}
                            {entry.message.length > 600 ? '…' : ''}
                          </span>
                          {notes[entry.id] && <strong>Review note attached</strong>}
                        </span>
                      </button>
                    ))}
                  </div>
                  {!shown.length && (
                    <p className="padded">No records match the selected filters.</p>
                  )}
                </div>
                <aside className="log-inspector">
                  {inspected ? (
                    <>
                      <h3>Record details</h3>
                      <p>
                        {inspected.levelBasis} · {inspected.source}
                      </p>
                      <pre>{inspected.message}</pre>
                      <details>
                        <summary>Original loaded record</summary>
                        <DataValue value={inspected.raw} />
                      </details>
                      <label className="field">
                        Review note
                        <textarea
                          rows={4}
                          maxLength={2000}
                          value={notes[inspected.id] || ''}
                          onChange={(event) =>
                            setNotes({ ...notes, [inspected.id]: event.target.value })
                          }
                        />
                      </label>
                      <p>
                        Notes stay in this tab. Export them before reloading or changing sources.
                      </p>
                    </>
                  ) : (
                    <p>Select a record to inspect its source fields and add a note.</p>
                  )}
                </aside>
              </div>
            </section>
          ) : (
            <section className="panel padded">
              <h2>Window comparison</h2>
              {baseline && <p>Baseline collected {new Date(baseline.at).toLocaleString()}</p>}
              {comparison ? (
                <>
                  <p>
                    {comparison.shared} records in both windows · {comparison.newlyObserved.length}{' '}
                    newly observed · {comparison.noLongerInWindow} no longer in the loaded window
                  </p>
                  <p>
                    Leaving the tail window is not evidence that a log record was deleted. Duplicate
                    messages are counted separately.
                  </p>
                  <ul className="log-new-records">
                    {comparison.newlyObserved.map((entry) => (
                      <li key={entry.id}>
                        <Badge tone={entry.level === 'error' ? 'warning' : 'neutral'}>
                          {entry.level}
                        </Badge>
                        <span>{entry.timestamp}</span>
                        <p>{entry.message}</p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Choose a baseline from the same source, then load a newer window.</p>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
