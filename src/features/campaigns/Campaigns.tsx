import { useEffect, useMemo, useRef, useState } from 'react';
import { request, download } from '../../api';
import { refreshEvidence } from '../../saved-evidence';
import { ErrorBox, Loading, Badge, Modal } from '../../components/ui';
import { DriftReview, CaptureTrend } from '../access/DriftReview';
import { AccessMap } from '../access/AccessMap';
import { ResourceMatrix } from '../access/ResourceMatrix';
import { DutyReview } from '../access/DutyReview';
import { AnalysisTools } from '../access/AnalysisTools';
import { PolicyReview } from '../access/PolicyReview';
import { RemediationPanel } from './RemediationPanel';
import { CertificationReview } from './CertificationReview';
import { CampaignReport } from './CampaignReport';
import { NextPeriod } from './NextPeriod';
import type { NextPeriod as PeriodInput } from '../../../shared/campaign-period';
import {
  campaignProgress,
  type Campaign,
  type CampaignSummary,
  type CampaignChange,
  type ReviewOutcome,
} from '../../../shared/campaign';
import './campaigns.css';

export function Campaigns({ onManageAccount }: { onManageAccount: (account: string) => void }) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [current, setCurrent] = useState<Campaign>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [filter, setFilter] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const sequence = useRef(0);
  const [draftDirty, setDraftDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<() => void>();
  function replaceCampaign(next: () => void) {
    if (draftDirty) setPendingNavigation(() => next);
    else next();
  }
  async function refresh() {
    const token = ++sequence.current;
    setPending(true);
    setError('');
    try {
      await refreshEvidence<CampaignSummary[]>('campaigns', {
        current: () => token === sequence.current,
        received: setCampaigns,
        refused: () => setCampaigns([]),
        failed: setError,
      });
    } finally {
      if (token === sequence.current) setPending(false);
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, []);
  async function open(id: string) {
    const token = ++sequence.current;
    setPending(true);
    setError('');
    try {
      await refreshEvidence<Campaign>('campaigns/' + id, {
        current: () => token === sequence.current,
        received: setCurrent,
        refused: () => {
          setCurrent((previous) => (previous?.id === id ? undefined : previous));
          setCampaigns((previous) => previous.filter((campaign) => campaign.id !== id));
        },
        failed: setError,
      });
    } finally {
      if (token === sequence.current) setPending(false);
    }
  }
  async function create() {
    setPending(true);
    setError('');
    try {
      const result = await request<Campaign>('campaigns', { title, description });
      setCurrent(result);
      setTitle('');
      setDescription('');
      setCampaigns(await request('campaigns'));
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function change(
    input: Omit<CampaignChange, 'revision'>,
    expectedRevision?: number,
    onRefused?: (message: string) => void,
  ) {
    if (!current) return;
    setPending(true);
    setError('');
    let applied = false;
    try {
      const result = await request<Campaign>('campaigns/' + current.id, {
        ...input,
        revision: expectedRevision ?? current.revision,
      });
      applied = true;
      setCurrent(result);
      setCampaigns(await request('campaigns'));
    } catch (failure) {
      if (!applied && onRefused) onRefused((failure as Error).message);
      else setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }
  const visible = campaigns.filter(
    (campaign) =>
      (includeArchived || campaign.state !== 'archived') &&
      (campaign.title + ' ' + campaign.description).toLowerCase().includes(filter.toLowerCase()),
  );
  async function remediation(action: string, payload: Record<string, unknown>) {
    if (!current) throw new Error('Select a campaign first.');
    setPending(true);
    setError('');
    try {
      const result = await request<any>('campaigns/' + current.id + '/' + action, {
        ...payload,
        revision: current.revision,
      });
      setCurrent(result.campaign);
      setCampaigns(await request('campaigns'));
      return result;
    } catch (failure) {
      setError((failure as Error).message);
      throw failure;
    } finally {
      setPending(false);
    }
  }
  async function nextPeriod(input: PeriodInput, discardConfirmed = false) {
    if (draftDirty && !discardConfirmed) {
      replaceCampaign(() => {
        void nextPeriod(input, true).catch(() => {});
      });
      return;
    }
    if (!current) throw new Error('Choose a campaign first.');
    setPending(true);
    setError('');
    try {
      const created = await request<Campaign>('campaigns/' + current.id + '/next-period', input);
      setCurrent(created);
      setCampaigns(await request('campaigns'));
    } catch (failure) {
      setError((failure as Error).message);
      throw failure;
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="campaign-workspace">
      <header className="section-heading">
        <div>
          <h2>Review campaigns</h2>
          <p>Save captures, decisions and duty rules for a recurring access review.</p>
        </div>
        <button disabled={pending} onClick={() => void refresh()}>
          Refresh list
        </button>
      </header>
      {error && <ErrorBox error={error} />}
      <div className="campaign-columns">
        <aside className="campaign-index panel">
          <label className="field">
            Find campaign
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              type="search"
            />
          </label>
          <label className="campaign-check">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            Include archived
          </label>
          <nav aria-label="Saved campaigns">
            {visible.map((campaign) => (
              <button
                key={campaign.id}
                disabled={pending}
                aria-pressed={current?.id === campaign.id}
                onClick={() => {
                  if (campaign.id !== current?.id) replaceCampaign(() => void open(campaign.id));
                }}
              >
                <strong>{campaign.title}</strong>
                <span>
                  {campaign.state} · {campaign.captureCount} captures
                </span>
                <small>{new Date(campaign.updatedAt).toLocaleString()}</small>
              </button>
            ))}
          </nav>
          {!visible.length && !pending && <p>No matching campaigns.</p>}
          <details>
            <summary>Create a campaign</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                replaceCampaign(() => void create());
              }}
            >
              <fieldset disabled={pending}>
                <label className="field">
                  Title
                  <input
                    required
                    maxLength={160}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="field">
                  Scope and review period
                  <textarea
                    maxLength={4000}
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <button className="primary" disabled={!title.trim()}>
                  Create campaign
                </button>
              </fieldset>
            </form>
          </details>
        </aside>
        <div className="campaign-content">
          {pending && <Loading />}
          {current ? (
            <CampaignDetail
              key={current.id}
              onDirtyChange={setDraftDirty}
              campaign={current}
              pending={pending}
              change={change}
              reload={() => void open(current.id)}
              onManageAccount={onManageAccount}
              remediation={remediation}
              nextPeriod={nextPeriod}
            />
          ) : (
            <div className="panel padded">
              <h3>Start an access review</h3>
              <p>
                Create a campaign or select a saved review. Campaigns are stored on the gateway and
                visible only to your account on this configured instance.
              </p>
            </div>
          )}
        </div>
      </div>
      {pendingNavigation && (
        <Modal
          title="Discard unsaved campaign changes?"
          onClose={() => setPendingNavigation(undefined)}
        >
          <p>
            This campaign has changes that have not been saved. They will be discarded only if the
            next campaign opens successfully.
          </p>
          <div className="inline-actions">
            <button onClick={() => setPendingNavigation(undefined)}>Keep editing</button>
            <button
              onClick={() => {
                const next = pendingNavigation;
                setPendingNavigation(undefined);
                next();
              }}
            >
              Discard and continue
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

// Distributive omission retains the payload for each individual change variant.
type WithoutRevision<T> = T extends unknown ? Omit<T, 'revision'> : never;
type ChangePayload = WithoutRevision<CampaignChange>;

function CampaignDetail({
  campaign,
  onDirtyChange,
  pending,
  change,
  reload,
  onManageAccount,
  remediation,
  nextPeriod,
}: {
  campaign: Campaign;
  onDirtyChange?: (dirty: boolean) => void;
  pending: boolean;
  change: (
    input: ChangePayload,
    expectedRevision?: number,
    onRefused?: (message: string) => void,
  ) => Promise<void>;
  reload: () => void;
  onManageAccount: (account: string) => void;
  remediation: (action: string, payload: Record<string, unknown>) => Promise<any>;
  nextPeriod: (input: PeriodInput) => Promise<void>;
}) {
  const [tab, setTab] = useState('decisions');
  const [decisionDirty, setDecisionDirty] = useState(false);
  const [certificationDirty, setCertificationDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<() => void>();
  function leaveDraft(next: () => void, dirty = decisionDirty || certificationDirty) {
    if (dirty) setPendingNavigation(() => next);
    else next();
  }
  const [reportVisited, setReportVisited] = useState(false);
  const [followupFinding, setFollowupFinding] = useState('');
  const [followupCertification, setFollowupCertification] = useState('');
  const reportRegion = useRef<HTMLDivElement>(null);
  const returnToReport = useRef(false);
  useEffect(() => {
    if (tab === 'report' && returnToReport.current) {
      returnToReport.current = false;
      reportRegion.current?.focus({ preventScroll: true });
      reportRegion.current?.scrollIntoView({ block: 'start' });
    }
  }, [tab]);
  const [label, setLabel] = useState('Access review ' + new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [statusFailure, setStatusFailure] = useState<{ message: string }>();
  const statusAlert = useRef<HTMLElement>(null);
  const focusedFailure = useRef<typeof statusFailure>(undefined);
  useEffect(() => {
    if (
      !pending &&
      statusFailure &&
      focusedFailure.current !== statusFailure &&
      statusAlert.current
    ) {
      focusedFailure.current = statusFailure;
      statusAlert.current.focus({ preventScroll: true });
      statusAlert.current.scrollIntoView({ block: 'center' });
    }
  }, [pending, statusFailure]);
  async function changeStatus(state: Campaign['state']) {
    setStatusFailure(undefined);
    await change({ action: 'state', state, reason }, undefined, (message) =>
      setStatusFailure({ message }),
    );
  }
  const [title, setTitle] = useState(campaign.title);
  const [description, setDescription] = useState(campaign.description);
  const [detailsBase, setDetailsBase] = useState({
    revision: campaign.revision,
    title: campaign.title,
    description: campaign.description,
  });
  const detailsDirty = title !== detailsBase.title || description !== detailsBase.description;
  useEffect(() => {
    onDirtyChange?.(detailsDirty || decisionDirty || certificationDirty);
  }, [detailsDirty, decisionDirty, certificationDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const detailsConflict = detailsDirty && detailsBase.revision !== campaign.revision;
  function useSavedDetails() {
    setTitle(campaign.title);
    setDescription(campaign.description);
    setDetailsBase({
      revision: campaign.revision,
      title: campaign.title,
      description: campaign.description,
    });
  }
  useEffect(() => {
    if (
      detailsBase.revision !== campaign.revision &&
      (!detailsDirty || (title === campaign.title && description === campaign.description))
    )
      useSavedDetails();
  }, [
    campaign.revision,
    campaign.title,
    campaign.description,
    detailsBase,
    detailsDirty,
    title,
    description,
  ]);
  const progress = useMemo(() => campaignProgress(campaign), [campaign]);
  const active = campaign.state === 'active';
  const latest = campaign.captures.at(-1);
  return (
    <>
      <section className="panel padded campaign-summary">
        <div className="section-heading">
          <div>
            <h2>{campaign.title}</h2>
            <p>{campaign.description}</p>
          </div>
          <Badge tone={active ? 'neutral' : 'warning'}>{campaign.state}</Badge>
        </div>
        <p>
          {campaign.instance} · {campaign.owner} · revision {campaign.revision}
        </p>
        <div className="inline-actions">
          <button disabled={pending} onClick={() => leaveDraft(reload, decisionDirty)}>
            Reload campaign
          </button>
          <button onClick={() => download('atlas-campaign-' + campaign.id + '.json', campaign)}>
            Export campaign
          </button>
        </div>
        <div className="campaign-metrics">
          <span>
            <strong>{campaign.captures.length}/12</strong> saved captures
          </span>
          <span>
            <strong>
              {progress.reviewed}/{progress.rows.length}
            </strong>{' '}
            current decisions
          </span>
          <span>
            <strong>{progress.openChanges}</strong> changes required
          </span>
          <span>
            <strong>{progress.overdue}</strong> overdue follow-ups
          </span>
        </div>
        {active && (
          <form
            className="campaign-capture"
            onSubmit={(event) => {
              event.preventDefault();
              leaveDraft(() => void change({ action: 'capture', label }));
            }}
          >
            <label className="field">
              Capture label
              <input
                value={label}
                maxLength={160}
                required
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={pending || !label.trim() || campaign.captures.length >= 12}
            >
              Capture access
            </button>
          </form>
        )}
        {latest?.snapshot.warnings.length ? (
          <details className="notice">
            <summary>Latest capture has {latest.snapshot.warnings.length} warnings</summary>
            <ul>
              {latest.snapshot.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
      <nav className="campaign-tabs" aria-label="Campaign tools">
        {[
          ['decisions', 'Decisions'],
          ['map', 'Access map'],
          ['matrix', 'Resources'],
          ['rules', 'Duty rules'],
          ['captures', 'Capture history'],
          ['history', 'Activity'],
          ['settings', 'Settings'],
          ['analysis', 'Analysis'],
          ['policies', 'Policies'],
          ['remediation', 'Remediation'],
          ['certification', 'Certification'],
          ['report', 'Report & follow-ups'],
          ['next-period', 'Next review period'],
        ].map(([id, text]) => (
          <button
            key={id}
            aria-pressed={tab === id}
            disabled={pending}
            onClick={() => {
              if (id === tab) return;
              leaveDraft(() => {
                if (id === 'report') setReportVisited(true);
                setFollowupFinding('');
                setFollowupCertification('');
                setTab(id);
              });
            }}
          >
            {text}
          </button>
        ))}
      </nav>
      {tab === 'decisions' && (
        <CampaignDecisions
          onDirtyChange={setDecisionDirty}
          campaign={campaign}
          disabled={pending || !active}
          change={change}
          initialFindingId={followupFinding}
          backDisabled={pending}
          onBackToFollowups={
            followupFinding
              ? () => {
                  returnToReport.current = true;
                  setTab('report');
                }
              : undefined
          }
        />
      )}
      {tab === 'map' && latest && (
        <AccessMap snapshot={latest.snapshot} onManage={onManageAccount} />
      )}
      {tab === 'matrix' && latest && <ResourceMatrix snapshot={latest.snapshot} />}
      {tab === 'rules' && latest && (
        <fieldset disabled={pending || !active}>
          <DutyReview
            snapshot={latest.snapshot}
            rules={campaign.rules}
            persisted
            onRulesChange={(rules) => void change({ action: 'rules', rules })}
          />
        </fieldset>
      )}
      {['map', 'matrix', 'rules'].includes(tab) && !latest && (
        <p className="panel padded">Capture access to use this tool.</p>
      )}
      {tab === 'captures' && <CampaignCaptures campaign={campaign} />}
      {reportVisited && (
        <div
          hidden={tab !== 'report'}
          ref={reportRegion}
          tabIndex={-1}
          aria-label="Campaign report"
        >
          <CampaignReport
            campaign={campaign}
            onReviewFinding={(id) => {
              setFollowupFinding(id);
              setTab('decisions');
            }}
            onReviewCertification={(key) => {
              setFollowupCertification(key);
              setTab('certification');
            }}
          />
        </div>
      )}
      {tab === 'next-period' && (
        <NextPeriod campaign={campaign} disabled={pending} create={nextPeriod} />
      )}
      {tab === 'certification' && (
        <CertificationReview
          onDirtyChange={setCertificationDirty}
          campaign={campaign}
          scope={campaign.certificationScope}
          decisions={campaign.certifications}
          disabled={pending || !active}
          initialSubject={followupCertification}
          backDisabled={pending}
          onBackToFollowups={
            followupCertification
              ? () => {
                  returnToReport.current = true;
                  setTab('report');
                }
              : undefined
          }
          save={(input, revision) => change(input as ChangePayload, revision)}
        />
      )}
      {tab === 'remediation' && (
        <RemediationPanel
          campaign={campaign}
          disabled={pending}
          submit={remediation}
          reload={reload}
        />
      )}
      {tab === 'analysis' && latest && <AnalysisTools snapshot={latest.snapshot} />}
      {tab === 'policies' && latest && (
        <PolicyReview
          snapshot={latest.snapshot}
          policies={campaign.policies}
          disabled={pending || !active}
          onSave={(policies) => void change({ action: 'policies', policies })}
        />
      )}
      {tab === 'history' && (
        <section className="panel padded">
          <h3>Campaign activity</h3>
          <p>
            This history records campaign edits. Use IRIS audit records for native administration
            events.
          </p>
          <ol className="campaign-history">
            {[...campaign.history].reverse().map((event) => (
              <li key={event.revision}>
                <strong>{event.action}</strong>
                <span>
                  Revision {event.revision} · {new Date(event.at).toLocaleString()} · {event.actor}
                </span>
                <p>{event.detail}</p>
                {event.decision && (
                  <details>
                    <summary>Saved decision</summary>
                    <p>
                      {event.decision.outcome} · {event.decision.note}
                    </p>
                    <p>
                      {event.decision.dueDate
                        ? 'Follow up by ' + event.decision.dueDate
                        : 'No follow-up date'}
                    </p>
                  </details>
                )}
                {event.dutyRules && (
                  <details>
                    <summary>Saved duty rules ({event.dutyRules.length})</summary>
                    <ul>
                      {event.dutyRules.map((rule, index) => (
                        <li key={index}>
                          {rule.title}: {rule.left} + {rule.right}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {event.policies && (
                  <details>
                    <summary>Saved policies ({event.policies.length})</summary>
                    <ul>
                      {event.policies.map((policy) => (
                        <li key={policy.id}>
                          {policy.title} · {policy.kind} · {policy.enabled ? 'enabled' : 'disabled'}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {tab === 'settings' && (
        <section className="panel padded">
          <h3>Campaign settings</h3>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!detailsConflict)
                void change({ action: 'details', title, description }, detailsBase.revision);
            }}
          >
            <fieldset disabled={pending || !active}>
              <label className="field">
                Title
                <input
                  value={title}
                  maxLength={160}
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="field">
                Scope and review period
                <textarea
                  value={description}
                  maxLength={4000}
                  rows={4}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              {detailsConflict && (
                <p className="notice" role="status">
                  This campaign changed after you started editing. Your draft is preserved. Use
                  saved details to discard it and edit the current revision.
                </p>
              )}
              {detailsConflict && (
                <button type="button" onClick={useSavedDetails}>
                  Use saved details
                </button>
              )}
              <button disabled={!title.trim() || detailsConflict}>Save details</button>
            </fieldset>
          </form>
          <h3>Review status</h3>
          <p>
            Closing requires a complete capture and certification, final decisions for all current
            findings, and readback of submitted changes. Resolve investigating and change-required
            decisions first. A recorded readback difference remains visible and does not require
            another write. Archiving preserves an unfinished review without marking it complete.
          </p>
          <label className="field">
            Reason for status change
            <textarea
              value={reason}
              maxLength={4000}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="inline-actions">
            {(['active', 'closed', 'archived'] as const)
              .filter((state) => state !== campaign.state)
              .map((state) => (
                <button
                  key={state}
                  disabled={pending || !reason.trim()}
                  onClick={() => void changeStatus(state)}
                >
                  {state === 'active' ? 'Reopen' : state === 'closed' ? 'Close review' : 'Archive'}
                </button>
              ))}
          </div>
          {statusFailure && (
            <aside
              ref={statusAlert}
              className="error-box"
              role="alert"
              tabIndex={-1}
              aria-label="Campaign status change not completed"
            >
              <strong>Status change not completed</strong>
              <p>{statusFailure.message}</p>
            </aside>
          )}
        </section>
      )}
      {pendingNavigation && (
        <Modal
          title="Discard unsaved review changes?"
          onClose={() => setPendingNavigation(undefined)}
        >
          <p>Your decision or certification changes have not been saved.</p>
          <div className="inline-actions">
            <button onClick={() => setPendingNavigation(undefined)}>Keep editing</button>
            <button
              onClick={() => {
                const next = pendingNavigation;
                setPendingNavigation(undefined);
                next();
              }}
            >
              Discard draft
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CampaignDecisions({
  campaign,
  onDirtyChange,
  disabled,
  change,
  initialFindingId = '',
  onBackToFollowups,
  backDisabled = false,
}: {
  campaign: Campaign;
  onDirtyChange?: (dirty: boolean) => void;
  disabled: boolean;
  change: (input: ChangePayload) => Promise<void>;
  initialFindingId?: string;
  onBackToFollowups?: () => void;
  backDisabled?: boolean;
}) {
  const progress = useMemo(() => campaignProgress(campaign), [campaign]);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(initialFindingId);
  const [decisionDirty, setDecisionDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<() => void>();
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    onDirtyChange?.(decisionDirty);
  }, [decisionDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  function leaveDecision(next: () => void) {
    if (decisionDirty) setPendingNavigation(() => next);
    else next();
  }
  const selected = progress.rows.find((row) => row.finding.id === selectedId);
  const visible = progress.rows.filter(
    (row) =>
      filter === 'all' ||
      (filter === 'pending'
        ? !row.decision
        : filter === 'overdue'
          ? row.overdue
          : row.decision?.outcome === filter),
  );
  return (
    <section className="panel padded">
      <div className="section-heading">
        <h3>Finding decisions</h3>
        <label className="field">
          Show
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All findings</option>
            <option value="pending">Needs review</option>
            <option value="change-required">Change required</option>
            <option value="investigating">Investigating</option>
            <option value="exception">Accepted exception</option>
            <option value="accepted">Accepted</option>
            <option value="overdue">Overdue</option>
          </select>
        </label>
      </div>
      {!campaign.captures.length && <p>Capture access to generate review findings.</p>}
      {campaign.captures.length > 0 && !visible.length && (
        <p>No findings match this filter. This is not a security certification.</p>
      )}
      {visible.map((row) => (
        <article className="campaign-finding" key={row.finding.id}>
          <div>
            <h4>{row.finding.title}</h4>
            <code>{row.finding.target}</code>
            <p>{row.finding.detail}</p>
            <Badge tone={row.overdue || !row.decision ? 'warning' : 'neutral'}>
              {row.outdated ? 'Changed since review' : row.decision?.outcome || 'Needs review'}
              {row.overdue ? ' · overdue' : ''}
            </Badge>
            {row.decision && (
              <p>
                {row.decision.note}
                {row.decision.dueDate ? ' · Due ' + row.decision.dueDate : ''}
              </p>
            )}
          </div>
          <button
            disabled={disabled}
            onClick={() => {
              const open = () => {
                setSelectedId(row.finding.id);
                setFocusRequest((request) => request + 1);
              };
              if (row.finding.id !== selectedId) leaveDecision(open);
              else open();
            }}
          >
            Review
          </button>
        </article>
      ))}
      {selected && (
        <DecisionForm
          key={selected.finding.id + ':' + campaign.revision}
          row={selected}
          focusRequest={focusRequest}
          disabled={disabled}
          onDirtyChange={setDecisionDirty}
          save={async (input) => {
            await change(input);
          }}
          cancel={() => {
            leaveDecision(() => {
              setSelectedId('');
              setDecisionDirty(false);
            });
          }}
        />
      )}
      {onBackToFollowups && (
        <button
          disabled={backDisabled}
          onClick={() => {
            leaveDecision(onBackToFollowups);
          }}
        >
          Back to follow-ups
        </button>
      )}
      {pendingNavigation && (
        <Modal title="Discard unsaved decision?" onClose={() => setPendingNavigation(undefined)}>
          <p>Your changes to this decision have not been saved.</p>
          <div className="inline-actions">
            <button onClick={() => setPendingNavigation(undefined)}>Keep editing</button>
            <button
              onClick={() => {
                const next = pendingNavigation;
                setPendingNavigation(undefined);
                setDecisionDirty(false);
                next();
              }}
            >
              Discard draft
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function DecisionForm({
  row,
  focusRequest,
  disabled,
  save,
  cancel,
  onDirtyChange,
}: {
  row: ReturnType<typeof campaignProgress>['rows'][number];
  focusRequest: number;
  disabled: boolean;
  save: (input: ChangePayload) => Promise<void>;
  cancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [outcome, setOutcome] = useState<ReviewOutcome>(row.decision?.outcome || 'investigating');
  const [note, setNote] = useState(row.decision?.note || '');
  const [dueDate, setDueDate] = useState(row.decision?.dueDate || '');
  useEffect(() => {
    onDirtyChange?.(
      outcome !== (row.decision?.outcome || 'investigating') ||
        note !== (row.decision?.note || '') ||
        dueDate !== (row.decision?.dueDate || ''),
    );
  }, [outcome, note, dueDate, row.decision, onDirtyChange]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start' });
  }, [focusRequest]);
  return (
    <form
      className="campaign-decision-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save({
          action: 'decision',
          findingId: row.finding.id,
          fingerprint: row.finding.fingerprint,
          outcome,
          note,
          ...(dueDate ? { dueDate } : {}),
        });
      }}
    >
      <h4 ref={heading} tabIndex={-1}>
        Review {row.finding.target}
      </h4>
      {row.decision && !row.outdated && (
        <p role="status">
          Saved decision: {row.decision.outcome} ·{' '}
          <time dateTime={row.decision.reviewedAt}>
            {new Date(row.decision.reviewedAt).toLocaleString()}
          </time>
          {row.decision.dueDate ? ' · Follow-up ' + row.decision.dueDate : ''}
        </p>
      )}
      <fieldset disabled={disabled}>
        <label className="field">
          Decision
          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as ReviewOutcome)}
          >
            <option value="investigating">Investigating</option>
            <option value="change-required">Change required</option>
            <option value="accepted">Accept current configuration</option>
            <option value="exception">Accept documented exception</option>
          </select>
        </label>
        <label className="field">
          Reason and follow-up
          <textarea
            required
            value={note}
            rows={4}
            maxLength={4000}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <label className="field">
          Follow-up date
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <p>
          Decisions apply to this exact finding. A changed finding requires another review. Do not
          include passwords or private keys in notes.
        </p>
        <div className="inline-actions">
          <button type="button" onClick={cancel}>
            Cancel
          </button>
          <button className="primary" disabled={!note.trim()}>
            Save decision
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function CampaignCaptures({ campaign }: { campaign: Campaign }) {
  const [before, setBefore] = useState(campaign.captures.at(-2)?.id || '');
  const [after, setAfter] = useState(campaign.captures.at(-1)?.id || '');
  const previous = campaign.captures.find((capture) => capture.id === before);
  const next = campaign.captures.find((capture) => capture.id === after);
  return (
    <section className="panel padded">
      <h3>Saved captures</h3>
      <CaptureTrend captures={campaign.captures} />
      <ul className="campaign-capture-list">
        {campaign.captures.map((capture) => (
          <li key={capture.id}>
            <div>
              <strong>{capture.label}</strong>
              <span>
                {new Date(capture.snapshot.capturedAt).toLocaleString()} ·{' '}
                {capture.snapshot.users.length} accounts · {capture.snapshot.warnings.length}{' '}
                warnings
              </span>
            </div>
            <button
              onClick={() => download('atlas-capture-' + capture.id + '.json', capture.snapshot)}
            >
              Export snapshot
            </button>
          </li>
        ))}
      </ul>
      {campaign.captures.length >= 2 ? (
        <>
          <div className="campaign-comparison">
            <label className="field">
              Before
              <select value={before} onChange={(event) => setBefore(event.target.value)}>
                <option value="">Choose capture</option>
                {campaign.captures.map((capture) => (
                  <option value={capture.id} key={capture.id}>
                    {capture.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              After
              <select value={after} onChange={(event) => setAfter(event.target.value)}>
                <option value="">Choose capture</option>
                {campaign.captures.map((capture) => (
                  <option value={capture.id} key={capture.id}>
                    {capture.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {previous && next && <DriftReview before={previous.snapshot} after={next.snapshot} />}
        </>
      ) : (
        <p>Save a second capture to compare configuration changes.</p>
      )}
    </section>
  );
}
