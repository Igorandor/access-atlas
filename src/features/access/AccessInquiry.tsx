import { useMemo, useRef, useState } from 'react';
import type { AccessSnapshot } from '../../../shared/access-model';
import {
  candidateRoles,
  inquiryBatchSchema,
  inquiryCsv,
  inquiryKey,
  investigateAccess,
  runInquiryBatch,
  type AccessInquiry as Inquiry,
  type InquiryBatch,
  type InquiryResult,
} from '../../../shared/access-inquiry';
import { Badge, ErrorBox } from '../../components/ui';
import { download } from '../../api';
import './inquiry.css';

export function AccessInquiry({ snapshot }: { snapshot: AccessSnapshot }) {
  const [account, setAccount] = useState(snapshot.users[0]?.Name || '');
  const [targetKind, setTargetKind] = useState<Inquiry['targetKind']>('resource');
  const [target, setTarget] = useState(snapshot.resources[0]?.Name || '');
  const [permission, setPermission] = useState<Inquiry['permission']>('U');
  const [result, setResult] = useState<InquiryResult>();
  const [error, setError] = useState('');
  const [queries, setQueries] = useState<Inquiry[]>([]);
  const [title, setTitle] = useState('Access questions');
  const [batchResults, setBatchResults] = useState<ReturnType<typeof runInquiryBatch>>();
  const [resultFilter, setResultFilter] = useState('all');
  const [showCandidates, setShowCandidates] = useState(false);
  const [candidateFilter, setCandidateFilter] = useState('');
  const [candidatePage, setCandidatePage] = useState(0);
  const importFile = useRef<HTMLInputElement>(null);
  const targets = targetKind === 'resource' ? snapshot.resources : snapshot.apps;
  const query: Inquiry = {
    account,
    targetKind,
    target,
    permission: targetKind === 'application' ? 'U' : permission,
  };
  const candidates = useMemo(() => {
    if (!showCandidates || !result?.resource) return [];
    return candidateRoles(snapshot, result.resource, result.request.permission);
  }, [snapshot, result, showCandidates]);
  const visibleCandidates = candidates.filter((item) =>
    item.role.toLowerCase().includes(candidateFilter.toLowerCase()),
  );
  const shownCandidates = visibleCandidates.slice(candidatePage * 20, candidatePage * 20 + 20);
  const visibleBatch = batchResults?.filter(
    (item) =>
      resultFilter === 'all' || (item.result?.disposition || 'unavailable') === resultFilter,
  );
  function inspect(input = query) {
    try {
      setResult(investigateAccess(snapshot, input));
      setShowCandidates(false);
      setCandidatePage(0);
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
      setResult(undefined);
    }
  }
  function add() {
    try {
      investigateAccess(snapshot, query);
      if (queries.length >= 50) throw new Error('An inquiry list can contain up to 50 questions.');
      if (queries.some((item) => inquiryKey(item) === inquiryKey(query)))
        throw new Error('This question is already in the list.');
      setQueries([...queries, query]);
      setBatchResults(undefined);
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  function batch(): InquiryBatch {
    return inquiryBatchSchema.parse({
      format: 'atlas-access-inquiries-1',
      instance: snapshot.instance,
      title,
      inquiries: queries,
    });
  }
  function run() {
    try {
      setBatchResults(runInquiryBatch(snapshot, batch()));
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  async function importQuestions(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error('Inquiry lists are limited to 100 KB.');
      const parsed = inquiryBatchSchema.parse(JSON.parse(await file.text()));
      if (parsed.instance !== snapshot.instance)
        throw new Error('The inquiry list belongs to a different instance.');
      if (new Set(parsed.inquiries.map(inquiryKey)).size !== parsed.inquiries.length)
        throw new Error('The inquiry list contains duplicate questions.');
      setQueries(parsed.inquiries);
      setTitle(parsed.title);
      setBatchResults(undefined);
      setError('');
    } catch (failure) {
      setError('Could not import questions. ' + (failure as Error).message);
    }
  }
  return (
    <section className="inquiry-workspace">
      <header className="section-heading">
        <div>
          <h2>Explain access</h2>
          <p>Trace a captured grant from an account to a resource or application entry point.</p>
        </div>
        <span className="muted">{new Date(snapshot.capturedAt).toLocaleString()}</span>
      </header>
      {error && <ErrorBox error={error} />}
      <form
        className="panel padded inquiry-form"
        onSubmit={(event) => {
          event.preventDefault();
          inspect();
        }}
      >
        <label className="field">
          Account
          <select value={account} onChange={(event) => setAccount(event.target.value)} required>
            {!snapshot.users.length && <option value="">No accounts captured</option>}
            {snapshot.users.map((user) => (
              <option key={user.Name} value={user.Name}>
                {user.Name}
                {Object.hasOwn(user, 'unavailable')
                  ? ' · unreadable'
                  : user.Enabled
                    ? ''
                    : ' · disabled'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Target type
          <select
            value={targetKind}
            onChange={(event) => {
              const kind = event.target.value as Inquiry['targetKind'];
              setTargetKind(kind);
              setTarget((kind === 'resource' ? snapshot.resources : snapshot.apps)[0]?.Name || '');
              setResult(undefined);
            }}
          >
            <option value="resource">Resource grant</option>
            <option value="application">Application entry</option>
          </select>
        </label>
        <label className="field">
          {targetKind === 'resource' ? 'Resource' : 'Application'}
          <select value={target} onChange={(event) => setTarget(event.target.value)} required>
            {!targets.length && <option value="">No targets captured</option>}
            {targets.map((item) => (
              <option key={item.Name}>{item.Name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Permission
          <select
            value={targetKind === 'application' ? 'U' : permission}
            disabled={targetKind === 'application'}
            onChange={(event) => setPermission(event.target.value as Inquiry['permission'])}
          >
            <option value="R">Read</option>
            <option value="W">Write</option>
            <option value="U">Use</option>
          </select>
        </label>
        <div className="inquiry-actions">
          <button className="primary" disabled={!account || !target}>
            Explain
          </button>
          <button
            type="button"
            disabled={!account || !target || queries.length >= 50}
            onClick={add}
          >
            Add to inquiry list
          </button>
        </div>
      </form>
      {result && <InquiryExplanation result={result} />}
      {result?.resource && (
        <section className="panel padded">
          <div className="section-heading">
            <h3>Roles containing this grant</h3>
            <button onClick={() => setShowCandidates(!showCandidates)}>
              {showCandidates ? 'Hide roles' : 'Find roles'}
            </button>
          </div>
          {showCandidates && (
            <>
              <p className="notice">
                Review every privilege in a role before assigning it. A smaller captured resource
                count does not establish least privilege.
              </p>
              <label className="field">
                Find role
                <input
                  type="search"
                  value={candidateFilter}
                  onChange={(event) => {
                    setCandidateFilter(event.target.value);
                    setCandidatePage(0);
                  }}
                />
              </label>
              <div className="inquiry-table-wrap">
                <table className="inquiry-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Grant path</th>
                      <th>Other resources</th>
                      <th>Conditions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownCandidates.map((item) => (
                      <tr key={item.role}>
                        <td>
                          <code>{item.role}</code>
                          <br />
                          {item.permissions}
                        </td>
                        <td>{item.path.join(' → ')}</td>
                        <td>{item.additionalResources}</td>
                        <td>
                          {[
                            item.escalationOnly && 'Escalation',
                            item.reachesAll && 'Reaches %All',
                            item.incomplete && 'Incomplete data',
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Ordinary path'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!visibleCandidates.length && (
                <p>No captured role explicitly supplies this permission.</p>
              )}
              <div className="inquiry-actions">
                <button
                  disabled={candidatePage === 0}
                  onClick={() => setCandidatePage(candidatePage - 1)}
                >
                  Previous roles
                </button>
                <span>
                  {visibleCandidates.length ? candidatePage * 20 + 1 : 0}–
                  {Math.min((candidatePage + 1) * 20, visibleCandidates.length)} of{' '}
                  {visibleCandidates.length}
                </span>
                <button
                  disabled={(candidatePage + 1) * 20 >= visibleCandidates.length}
                  onClick={() => setCandidatePage(candidatePage + 1)}
                >
                  Next roles
                </button>
              </div>
            </>
          )}
        </section>
      )}
      <section className="panel padded inquiry-list">
        <div className="section-heading">
          <h3>Saved inquiry list · {queries.length}/50</h3>
          <button onClick={() => importFile.current?.click()}>Import questions</button>
          <input
            ref={importFile}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              void importQuestions(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
        <label className="field">
          List title
          <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <p>
          Export questions to reuse them after a new capture. Lists stay in this view until
          exported.
        </p>
        {queries.length ? (
          <ol className="inquiry-questions">
            {queries.map((item, index) => (
              <li key={inquiryKey(item)}>
                <span>
                  <strong>{item.account}</strong> → <code>{item.target}</code> ·{' '}
                  {item.targetKind === 'application' ? 'entry Use' : item.permission}
                </span>
                <button aria-label={`Explain question ${index + 1}`} onClick={() => inspect(item)}>
                  Explain
                </button>
                <button
                  aria-label={`Remove question ${index + 1}`}
                  onClick={() => {
                    setQueries(queries.filter((_, position) => position !== index));
                    setBatchResults(undefined);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>No questions added yet.</p>
        )}
        <div className="inquiry-actions">
          <button className="primary" disabled={!queries.length || !title.trim()} onClick={run}>
            Evaluate list
          </button>
          <button
            disabled={!queries.length || !title.trim()}
            onClick={() => {
              try {
                download('atlas-inquiry-questions.json', batch());
                setError('');
              } catch (failure) {
                setError((failure as Error).message);
              }
            }}
          >
            Export questions
          </button>
          <button
            disabled={!queries.length}
            onClick={() => {
              setQueries([]);
              setBatchResults(undefined);
            }}
          >
            Clear list
          </button>
        </div>
        {batchResults && (
          <>
            <div className="section-heading">
              <h4>Evaluation · {batchResults.length} questions</h4>
              <label className="field">
                Observation
                <select
                  value={resultFilter}
                  onChange={(event) => setResultFilter(event.target.value)}
                >
                  <option value="all">All results</option>
                  {[
                    ...new Set(
                      batchResults.map((item) => item.result?.disposition || 'unavailable'),
                    ),
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="inquiry-table-wrap">
              <table className="inquiry-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Target</th>
                    <th>Observed configuration</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBatch?.map((item) => (
                    <tr key={inquiryKey(item.query)}>
                      <td>{item.query.account}</td>
                      <td>
                        <code>{item.query.target}</code> ·{' '}
                        {item.query.targetKind === 'application' ? 'U' : item.query.permission}
                      </td>
                      <td>
                        {item.result?.headline || item.error}
                        {!!item.result?.warnings.length && (
                          <p>{item.result.warnings.length} warnings</p>
                        )}
                      </td>
                      <td>
                        <button onClick={() => inspect(item.query)}>Details</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="inquiry-actions">
              <button
                onClick={() =>
                  download('atlas-inquiry-results.json', {
                    title,
                    instance: snapshot.instance,
                    capturedAt: snapshot.capturedAt,
                    results: batchResults,
                    meaning: 'Configuration observations, not runtime authorization decisions.',
                  })
                }
              >
                Export results JSON
              </button>
              <button
                onClick={() =>
                  saveText(
                    'atlas-inquiry-results.csv',
                    inquiryCsv(batchResults),
                    'text/csv;charset=utf-8',
                  )
                }
              >
                Export results CSV
              </button>
            </div>
          </>
        )}
      </section>
    </section>
  );
}

function InquiryExplanation({ result }: { result: InquiryResult }) {
  const [showAllPaths, setShowAllPaths] = useState(false);
  const matching = result.sources.filter((source) =>
    source.permissions.includes(result.request.permission),
  );
  const visible = showAllPaths ? result.sources : matching;
  return (
    <section className="panel padded inquiry-result" aria-live="polite">
      <header className="section-heading">
        <div>
          <span className="eyebrow">
            {result.request.account} → {result.request.target}
          </span>
          <h3>{result.headline}</h3>
        </div>
        <Badge
          tone={
            ['unknown', 'disabled', 'conditional-grant'].includes(result.disposition)
              ? 'warning'
              : 'neutral'
          }
        >
          {result.disposition}
        </Badge>
      </header>
      <p className="notice">
        This is a configuration explanation. It does not authenticate as the selected account or
        test a live request.
      </p>
      <ol className="inquiry-steps">
        {result.steps.map((step) => (
          <li key={step.label} data-state={step.state}>
            <strong>{step.label}</strong>
            <Badge
              tone={
                step.state === 'unknown' || step.state === 'conditional' ? 'warning' : 'neutral'
              }
            >
              {step.state}
            </Badge>
            <p>{step.detail}</p>
          </li>
        ))}
      </ol>
      <h4>Grant paths</h4>
      <label className="inquiry-checkbox">
        <input
          type="checkbox"
          checked={showAllPaths}
          onChange={(event) => setShowAllPaths(event.target.checked)}
        />
        Include paths granting other permissions on this resource
      </label>
      {visible.length ? (
        <div className="inquiry-table-wrap">
          <table className="inquiry-table">
            <thead>
              <tr>
                <th>Path</th>
                <th>Permissions</th>
                <th>Activation</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((source, index) => (
                <tr key={JSON.stringify([source.path, source.conditional, index])}>
                  <td>
                    {source.path.join(' → ')} → <code>{source.resource}</code>
                  </td>
                  <td>{source.permissions}</td>
                  <td>{source.conditional ? 'Escalation required' : 'Ordinary assignment'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No matching explicit role path was captured.</p>
      )}
      {!!result.warnings.length && (
        <details open>
          <summary>{result.warnings.length} evidence warnings</summary>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <h4>Checks before changing access</h4>
      <ul>
        {result.questions.map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ul>
      <button onClick={() => download('atlas-access-explanation.json', result)}>
        Export explanation
      </button>
    </section>
  );
}

export function saveText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
