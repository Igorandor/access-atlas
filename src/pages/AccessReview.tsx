import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileCheck2,
  GitCompareArrows,
  Layers,
  Network,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';
import { request, download } from '../api';
import { Badge, ErrorBox, Loading, PageHeader } from '../components/ui';
import { compareSnapshots, findings, type AccessSnapshot } from '../../shared/access-model';

import { AccessMap } from '../features/access/AccessMap';
import { ResourceMatrix } from '../features/access/ResourceMatrix';
import { ReviewQueue, type Decision } from '../features/access/ReviewQueue';
export function AccessReview({ navigate }: { navigate: (page: string) => void }) {
  const [snapshot, setSnapshot] = useState<AccessSnapshot>();
  const [baseline, setBaseline] = useState<AccessSnapshot>();
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [view, setView] = useState('map');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const generation = useRef(0),
    file = useRef<HTMLInputElement>(null);
  async function capture() {
    const id = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const result = await request('access-snapshot', {});
      if (id === generation.current) setSnapshot(result as AccessSnapshot);
    } catch (e) {
      if (id === generation.current) setError((e as Error).message);
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void capture();
    return () => {
      generation.current++;
    };
  }, []);
  const items = useMemo(() => (snapshot ? findings(snapshot) : []), [snapshot]);
  const reviewed = items.filter((f) => decisions[f.id]?.fingerprint === f.fingerprint).length;
  const complete = !!snapshot && !snapshot.warnings.length;
  const delta = useMemo(() => {
    if (!baseline || !snapshot) return { rows: [], error: '' };
    try {
      return { rows: compareSnapshots(baseline, snapshot), error: '' };
    } catch (e) {
      return { rows: [], error: (e as Error).message };
    }
  }, [baseline, snapshot]);
  async function importBaseline(input: File | undefined) {
    if (!input) return;
    try {
      if (input.size > 2_000_000) throw new Error('Snapshot files are limited to 2 MB.');
      const { parseSnapshot } = await import('../../shared/snapshot-schema');
      const parsed = parseSnapshot(JSON.parse(await input.text()));
      if (snapshot && parsed.instance !== snapshot.instance)
        throw new Error('This file belongs to a different configured instance.');
      setBaseline(parsed);
      setView('changes');
      setError('');
    } catch (e) {
      setError('Could not import the baseline: ' + (e as Error).message);
    }
  }
  return (
    <>
      <PageHeader
        title="Access review"
        description="Role inheritance, resource grants and configuration changes."
      >
        <button
          disabled={!snapshot}
          onClick={() => snapshot && download('atlas-access-snapshot.json', snapshot)}
        >
          <Download size={16} /> Snapshot
        </button>
        <button className="primary" disabled={loading} onClick={() => void capture()}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {loading ? 'Reading configuration…' : 'Capture again'}
        </button>
      </PageHeader>
      <div className="atlas-context">
        <span className="context-dot" />
        <strong>{snapshot?.instance ?? 'Connected IRIS'}</strong>
        <span>
          {snapshot
            ? 'Captured ' + new Date(snapshot.capturedAt).toLocaleString()
            : 'Preparing configuration evidence'}
        </span>
        <Badge tone={complete ? 'good' : 'warning'}>
          {snapshot
            ? complete
              ? 'Complete within capture limits'
              : 'Incomplete evidence'
            : 'Read-only capture'}
        </Badge>
      </div>
      {error && <ErrorBox error={error} />}
      {loading && !snapshot && <Loading />}
      {snapshot && (
        <>
          {snapshot.warnings.length > 0 && (
            <details className="notice" open>
              <summary>
                {snapshot.warnings.length} capture warnings · missing data is unknown, not denied
                access
              </summary>
              <ul>
                {snapshot.warnings.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="atlas-summary">
            <div>
              <Users size={19} />
              <strong>{snapshot.users.length}</strong>
              <span>accounts</span>
            </div>
            <div>
              <Layers size={19} />
              <strong>{snapshot.roles.length}</strong>
              <span>role definitions</span>
            </div>
            <div>
              <ShieldCheck size={19} />
              <strong>{snapshot.resources.length}</strong>
              <span>resources</span>
            </div>
            <div>
              <FileCheck2 size={19} />
              <strong>{items.length - reviewed}</strong>
              <span>review items left</span>
            </div>
          </div>
          <div className="atlas-tabs" aria-label="Access review views">
            {[
              ['map', 'Access map', Network],
              ['matrix', 'Resource matrix', Layers],
              ['queue', 'Review queue', FileCheck2],
              ['changes', 'Changes', GitCompareArrows],
            ].map(([id, label, Icon]) => (
              <button
                key={String(id)}
                aria-pressed={view === id}
                className={view === id ? 'active' : ''}
                onClick={() => setView(String(id))}
              >
                {typeof Icon !== 'string' && <Icon size={17} />}
                <span>{String(label)}</span>
                {id === 'queue' && <span className="tab-count">{items.length - reviewed}</span>}
              </button>
            ))}
          </div>
          {view === 'map' && (
            <AccessMap snapshot={snapshot} onManage={() => navigate('permissions')} />
          )}
          {view === 'matrix' && <ResourceMatrix snapshot={snapshot} />}
          {view === 'queue' && (
            <ReviewQueue
              items={items}
              decisions={decisions}
              setDecisions={setDecisions}
              snapshot={snapshot}
              navigate={navigate}
            />
          )}
          {view === 'changes' && (
            <section className="panel drift-panel">
              <div className="section-heading">
                <div>
                  <h2>Configuration changes</h2>
                  <p>Compare two captures from the same configured instance.</p>
                </div>
                <div className="inline-actions">
                  <button disabled={!complete} onClick={() => setBaseline(snapshot)}>
                    Use current as baseline
                  </button>
                  <button onClick={() => file.current?.click()}>
                    <Upload size={15} /> Import baseline
                  </button>
                </div>
              </div>
              <input
                ref={file}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  void importBaseline(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {baseline ? (
                <>
                  <div className="baseline-strip">
                    <span>Baseline: {new Date(baseline.capturedAt).toLocaleString()}</span>
                    <button className="text-link" onClick={() => setBaseline(undefined)}>
                      Clear baseline
                    </button>
                  </div>
                  {delta.error ? (
                    <ErrorBox error={delta.error} />
                  ) : (
                    <>
                      <p className="padded muted">
                        {delta.rows.length} changed records. Capture again after an administrative
                        change to compare. Review notes are excluded.
                      </p>
                      {delta.rows.map((d) => (
                        <details className="drift-row" key={d.kind + ':' + d.name}>
                          <summary>
                            <Badge tone={d.change === 'removed' ? 'warning' : 'neutral'}>
                              {d.change}
                            </Badge>
                            <span>{d.kind}</span>
                            <strong>{d.name}</strong>
                          </summary>
                          <div className="diff-columns">
                            <div>
                              <h3>Before</h3>
                              <pre>{JSON.stringify(d.before ?? null, null, 2)}</pre>
                            </div>
                            <div>
                              <h3>After</h3>
                              <pre>{JSON.stringify(d.after ?? null, null, 2)}</pre>
                            </div>
                          </div>
                        </details>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <div className="atlas-empty">
                  <GitCompareArrows size={32} />
                  <h2>Start a comparison</h2>
                  <p>
                    Save this capture as a baseline, make a reviewed change in the administration
                    tools, then capture again. You can also import a previously exported snapshot.
                  </p>
                </div>
              )}
            </section>
          )}
          <p className="atlas-footnote">
            Configuration evidence, not a live authorization decision. Application roles,
            escalation, SQL/row policies and current sessions can change runtime access. Captures
            are bounded and are not transactional. Data and review notes stay in memory until
            exported.
          </p>
        </>
      )}
    </>
  );
}
