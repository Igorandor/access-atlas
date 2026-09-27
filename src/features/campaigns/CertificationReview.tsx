import { useMemo, useState } from 'react';
import type { Campaign } from '../../../shared/campaign';
import {
  certificationCoverage,
  certificationEvidence,
  type CertificationScope,
  type CertificationKind,
  type Certification,
} from '../../../shared/certification';
import { download } from '../../api';
import { DataValue } from '../../components/DataView';
import { Badge } from '../../components/ui';

export function CertificationReview({
  campaign,
  scope,
  decisions,
  disabled,
  save,
}: {
  campaign: Campaign;
  scope: CertificationScope;
  decisions: Certification[];
  disabled: boolean;
  save: (input: Record<string, unknown>) => Promise<void>;
}) {
  const latest = campaign.captures.at(-1);
  const [scopeDraft, setScopeDraft] = useState(scope);
  const [kind, setKind] = useState('all');
  const [state, setState] = useState('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const [outcome, setOutcome] = useState<Certification['outcome']>('retain');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [carryFrom, setCarryFrom] = useState(campaign.captures.at(-2)?.id || '');
  const coverage = useMemo(
    () =>
      latest ? certificationCoverage(latest.snapshot, latest.id, scope, decisions) : undefined,
    [latest, scope, decisions],
  );
  const visible =
    coverage?.rows.filter(
      (row) =>
        (kind === 'all' || row.subject.kind === kind) &&
        row.subject.name.toLowerCase().includes(search.toLowerCase()) &&
        (state === 'all' || state === 'pending'
          ? state === 'all' || !row.decision
          : row.decision?.outcome === state),
    ) || [];
  const shown = visible.slice(page * 30, page * 30 + 30);
  const selectedRow = coverage?.rows.find(
    (row) => JSON.stringify([row.subject.kind, row.subject.name]) === selected,
  );
  const evidence = useMemo(
    () =>
      latest && selectedRow
        ? certificationEvidence(latest.snapshot, selectedRow.subject.kind, selectedRow.subject.name)
        : undefined,
    [latest, selectedRow],
  );
  return (
    <section className="panel padded certification-review">
      <div className="section-heading">
        <div>
          <h2>Access certification</h2>
          <p>
            Review every object in a defined scope, including objects without automatic findings.
          </p>
        </div>
        {coverage && (
          <button
            onClick={() =>
              download('atlas-certification-report.json', {
                instance: campaign.instance,
                campaign: campaign.title,
                scope,
                captureId: latest?.id,
                capturedAt: latest?.snapshot.capturedAt,
                coverage,
              })
            }
          >
            Export certification report
          </button>
        )}
      </div>
      <details>
        <summary>Certification scope</summary>
        <fieldset disabled={disabled}>
          <label className="analysis-check">
            <input
              type="checkbox"
              checked={scopeDraft.enabled}
              onChange={(event) => setScopeDraft({ ...scopeDraft, enabled: event.target.checked })}
            />
            Require certification before closing this campaign
          </label>
          <div className="certification-kinds">
            {(['accounts', 'roles', 'resources', 'applications'] as CertificationKind[]).map(
              (value) => (
                <label className="analysis-check" key={value}>
                  <input
                    type="checkbox"
                    checked={scopeDraft.kinds.includes(value)}
                    onChange={(event) =>
                      setScopeDraft({
                        ...scopeDraft,
                        kinds: event.target.checked
                          ? [...scopeDraft.kinds, value]
                          : scopeDraft.kinds.filter((kind) => kind !== value),
                      })
                    }
                  />
                  {value}
                </label>
              ),
            )}
          </div>
          <label className="field">
            Name prefix
            <input
              maxLength={128}
              value={scopeDraft.prefix}
              onChange={(event) => setScopeDraft({ ...scopeDraft, prefix: event.target.value })}
              placeholder="Blank includes all names"
            />
          </label>
          <label className="analysis-check">
            <input
              type="checkbox"
              checked={scopeDraft.includeDisabled}
              onChange={(event) =>
                setScopeDraft({ ...scopeDraft, includeDisabled: event.target.checked })
              }
            />
            Include disabled accounts and applications
          </label>
          <label className="field">
            Review due date
            <input
              type="date"
              value={scopeDraft.dueDate || ''}
              onChange={(event) =>
                setScopeDraft({ ...scopeDraft, dueDate: event.target.value || undefined })
              }
            />
          </label>
          <button
            disabled={!scopeDraft.kinds.length}
            onClick={() => void save({ action: 'certification-scope', scope: scopeDraft })}
          >
            Save scope
          </button>
        </fieldset>
      </details>
      {!scope.enabled && (
        <p className="notice">
          Certification is optional for this campaign. Enable it above to build a review list.
        </p>
      )}
      {!latest && <p>Capture access to populate the review scope.</p>}
      {coverage && scope.enabled && (
        <>
          <div className="campaign-metrics">
            <span>
              <strong>{coverage.total}</strong> objects in scope
            </span>
            <span>
              <strong>{coverage.decided}</strong> decisions on this capture
            </span>
            <span>
              <strong>{coverage.pending}</strong> awaiting review
            </span>
            <span>
              <strong>{coverage.unresolved}</strong> changes or investigations open
            </span>
          </div>
          {(coverage.unknown > 0 || latest!.snapshot.warnings.length > 0) && (
            <p className="notice">
              Incomplete evidence prevents completion. Missing data is not a negative access
              decision.
            </p>
          )}
          {coverage.total === 0 && (
            <p>
              The current scope matches no captured objects. Check its prefix and selected object
              kinds.
            </p>
          )}
          <div className="analysis-pair">
            <label className="field">
              Object kind
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All kinds</option>
                {scope.kinds.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Decision
              <select
                value={state}
                onChange={(event) => {
                  setState(event.target.value);
                  setPage(0);
                }}
              >
                <option value="pending">Awaiting current review</option>
                <option value="all">All objects</option>
                {['retain', 'exception', 'change', 'remove', 'investigate'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Find object
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </label>
          <div className="certification-list">
            {shown.map((row) => (
              <button
                key={JSON.stringify([row.subject.kind, row.subject.name])}
                aria-pressed={selected === JSON.stringify([row.subject.kind, row.subject.name])}
                onClick={() => {
                  setSelected(JSON.stringify([row.subject.kind, row.subject.name]));
                  setOutcome(row.decision?.outcome || 'retain');
                  setNote(row.decision?.note || '');
                  setDueDate(row.decision?.dueDate || '');
                }}
              >
                <span>
                  <strong>{row.subject.name}</strong>
                  <small>
                    {row.subject.kind} · {row.subject.state}
                  </small>
                </span>
                <Badge tone={row.subject.unknown.length || !row.decision ? 'warning' : 'neutral'}>
                  {row.outdated
                    ? 'New capture needs review'
                    : row.decision?.outcome || 'Awaiting review'}
                </Badge>
              </button>
            ))}
          </div>
          <div className="inline-actions">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              {visible.length ? page * 30 + 1 : 0}–{Math.min(visible.length, page * 30 + 30)} of{' '}
              {visible.length}
            </span>
            <button disabled={(page + 1) * 30 >= visible.length} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
          {selectedRow && (
            <section className="certification-details">
              <h3>{selectedRow.subject.name}</h3>
              <p>{selectedRow.subject.description}</p>
              <dl>
                {selectedRow.subject.facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value || 'None captured'}</dd>
                  </div>
                ))}
              </dl>
              {selectedRow.subject.unknown.length > 0 && (
                <p className="notice">{selectedRow.subject.unknown.join(' ')}</p>
              )}
              <details>
                <summary>Captured configuration and dependencies</summary>
                <DataValue value={evidence} />
              </details>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void save({
                    action: 'certify',
                    captureId: latest!.id,
                    kind: selectedRow.subject.kind,
                    name: selectedRow.subject.name,
                    outcome,
                    note,
                    ...(dueDate ? { dueDate } : {}),
                  });
                }}
              >
                <fieldset disabled={disabled}>
                  <label className="field">
                    Decision
                    <select
                      value={outcome}
                      onChange={(event) =>
                        setOutcome(event.target.value as Certification['outcome'])
                      }
                    >
                      <option value="retain">Retain configuration</option>
                      <option value="exception">Accept documented exception</option>
                      <option value="change">Change required</option>
                      <option value="remove">Remove access or object</option>
                      <option value="investigate">Investigate</option>
                    </select>
                  </label>
                  <label className="field">
                    Reason
                    <textarea
                      rows={4}
                      maxLength={4000}
                      required
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Follow-up date
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </label>
                  <p>
                    This records a review decision. Follow-up dates schedule a review; they do not
                    expire permissions or automatically revoke exceptions.
                  </p>
                  <button className="primary" disabled={!note.trim()}>
                    Record certification decision
                  </button>
                </fieldset>
              </form>
            </section>
          )}
          {campaign.captures.length >= 2 && (
            <details className="certification-carry">
              <summary>Carry forward unchanged decisions</summary>
              <p>
                Atlas compares each object's configuration and dependency data. Only retained or
                excepted objects with equal evidence can be carried to the latest capture. The
                original human review date is preserved; the carry action is recorded in campaign
                activity.
              </p>
              <label className="field">
                Previous capture
                <select value={carryFrom} onChange={(event) => setCarryFrom(event.target.value)}>
                  <option value="">Choose capture</option>
                  {campaign.captures.slice(0, -1).map((capture) => (
                    <option value={capture.id} key={capture.id}>
                      {capture.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={disabled || !carryFrom}
                onClick={() =>
                  void save({ action: 'carry-certifications', fromCaptureId: carryFrom })
                }
              >
                Compare and carry forward
              </button>
            </details>
          )}
        </>
      )}
    </section>
  );
}
