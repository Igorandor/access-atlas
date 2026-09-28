import { useEffect, useMemo, useRef, useState } from 'react';
import { RequestError } from '../../api';
import { campaignFindings, type Campaign } from '../../../shared/campaign';
import { draftRemediation, type RemediationRequest } from '../../../shared/remediation';
import type { ChangeReview } from '../../../shared/change-review';
import { DataDiff, DataValue } from '../../components/DataView';
import { ErrorBox, Badge } from '../../components/ui';

export function RemediationPanel({
  campaign,
  disabled,
  submit,
  reload,
}: {
  campaign: Campaign;
  disabled: boolean;
  submit: (
    action: string,
    payload: Record<string, unknown>,
    expectedRevision?: number,
  ) => Promise<any>;
  reload: () => void;
}) {
  const findings = useMemo(() => campaignFindings(campaign), [campaign]);
  const supported = findings.filter((finding) =>
    ['user', 'resource', 'app'].includes(finding.kind),
  );
  const [selected, setSelected] = useState(supported[0]?.id || '');
  const heading = useRef<HTMLHeadingElement>(null);
  const [draftFocusRequest, setDraftFocusRequest] = useState(0);
  useEffect(() => {
    if (!draftFocusRequest) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start' });
  }, [draftFocusRequest]);
  const [action, setAction] = useState<RemediationRequest['action']>('remove-role');
  const [role, setRole] = useState('');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [review, setReview] = useState<ChangeReview>();
  const [reviewBasis, setReviewBasis] = useState<{
    campaignId: string;
    captureId?: string;
    revision: number;
  }>();
  const [reviewInvalid, setReviewInvalid] = useState(false);
  const staleNotice = useRef<HTMLElement>(null);
  const focusedStaleReview = useRef<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [reconcile, setReconcile] = useState('');
  const [reconcileNote, setReconcileNote] = useState('');
  const [applyAttempt, setApplyAttempt] = useState<{ id: string; uncertain: boolean }>();
  const submittedReviews = useRef(new Set<string>());
  const recovery = useRef<HTMLElement>(null);
  const focusedAttempt = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      !disabled &&
      error &&
      applyAttempt &&
      recovery.current &&
      focusedAttempt.current !== applyAttempt.id
    ) {
      focusedAttempt.current = applyAttempt.id;
      recovery.current.focus({ preventScroll: true });
      recovery.current.scrollIntoView({ block: 'center' });
    }
  }, [disabled, error, applyAttempt]);
  const capture = campaign.captures.at(-1);
  const snapshot = capture?.snapshot;
  const basisChanged = Boolean(
    review &&
    (!reviewBasis ||
      reviewBasis.campaignId !== campaign.id ||
      reviewBasis.captureId !== capture?.id ||
      reviewBasis.revision !== campaign.revision),
  );
  const staleReview = Boolean(review && (reviewInvalid || basisChanged));
  useEffect(() => {
    if (!review || !staleReview || applyAttempt?.id === review.id) return;
    setReviewInvalid(true);
    setConfirmation('');
    if (!disabled && focusedStaleReview.current !== review.id) {
      focusedStaleReview.current = review.id;
      staleNotice.current?.focus({ preventScroll: true });
      staleNotice.current?.scrollIntoView({ block: 'center' });
    }
  }, [review, staleReview, applyAttempt, disabled]);
  const finding = findings.find((item) => item.id === selected);
  const account = snapshot?.users.find((user) => user.Name === finding?.target);
  const actions: Array<[RemediationRequest['action'], string]> =
    finding?.kind === 'user'
      ? [
          ['remove-role', 'Remove a direct role'],
          ['disable-account', 'Disable account'],
        ]
      : finding?.kind === 'resource'
        ? [['remove-public-write', 'Remove public write permission']]
        : finding?.kind === 'app'
          ? [
              ['require-authentication', 'Remove unauthenticated entry'],
              ['disable-application', 'Disable application'],
            ]
          : [];
  const chosenAction = actions.some(([id]) => id === action) ? action : actions[0]?.[0];
  const chosenRole = role || account?.Roles[0] || '';
  const draft = useMemo(() => {
    if (!snapshot || !finding || !chosenAction) return { error: '', data: undefined };
    try {
      return {
        error: '',
        data: draftRemediation(snapshot, finding, { action: chosenAction, role: chosenRole }),
      };
    } catch (failure) {
      return { error: (failure as Error).message, data: undefined };
    }
  }, [snapshot, finding, chosenAction, chosenRole]);
  async function prepare() {
    if (disabled || !finding || !chosenAction) return;
    setError('');
    try {
      const result = await submit(
        'remediation-review',
        {
          findingId: finding.id,
          fingerprint: finding.fingerprint,
          action: chosenAction,
          role: chosenRole,
          reason,
        },
        campaign.revision,
      );
      setReviewBasis({
        campaignId: result.campaign.id,
        captureId: result.campaign.captures.at(-1)?.id,
        revision: result.campaign.revision,
      });
      setReviewInvalid(false);
      focusedStaleReview.current = undefined;
      setReview(result.review);
      setApplyAttempt(undefined);
      setConfirmation('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  async function apply() {
    if (
      disabled ||
      !review ||
      !reviewBasis ||
      staleReview ||
      submittedReviews.current.has(review.id)
    )
      return;
    const id = review.id;
    submittedReviews.current.add(id);
    setApplyAttempt({ id, uncertain: false });
    setError('');
    try {
      await submit('remediation-apply', { reviewId: id, confirmation }, reviewBasis.revision);
      setApplyAttempt(undefined);
      setReview(undefined);
      setConfirmation('');
    } catch (failure) {
      setError((failure as Error).message);
      setApplyAttempt({
        id,
        uncertain: !(
          failure instanceof RequestError &&
          failure.status >= 400 &&
          failure.status < 500
        ),
      });
    }
  }
  return (
    <section className="panel padded remediation-panel">
      <h2 ref={heading} tabIndex={-1}>
        Remediation
      </h2>
      <p>
        Prepare a change from a campaign finding. Atlas checks current fields again before writing
        and records the result in this campaign.
      </p>
      {error && <ErrorBox error={error} />}
      {applyAttempt && !disabled && (
        <aside
          ref={recovery}
          tabIndex={-1}
          className="notice"
          role="status"
          aria-label="Submitted change recovery"
        >
          <p>
            {applyAttempt.uncertain
              ? 'The apply response did not confirm an outcome. A failed response does not prove that the change was rejected. Reload this campaign to check its recorded remediation history, then use Read current state before preparing another proposal.'
              : 'This submission returned an error. Its review cannot be sent again. Reload this campaign and inspect the error and current state before preparing another proposal.'}
          </p>
          <p>
            Review ID: <code>{applyAttempt.id}</code>
          </p>
          <button onClick={reload}>Reload remediation history</button>
        </aside>
      )}
      {!snapshot && <p>Capture access before preparing remediation.</p>}
      {snapshot && supported.length === 0 && (
        <p>
          No current findings have an automatic remediation. Use the configuration register for
          other changes.
        </p>
      )}
      {snapshot && supported.length > 0 && !review && (
        <fieldset disabled={disabled || campaign.state !== 'active'}>
          <label className="field">
            Finding
            <select
              disabled={!!review}
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setRole('');
              }}
            >
              <option value="">Choose finding</option>
              {supported.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.target} · {item.title}
                </option>
              ))}
            </select>
          </label>
          {finding && (
            <>
              <p>{finding.detail}</p>
              <label className="field">
                Proposed action
                <select
                  disabled={!!review}
                  value={chosenAction}
                  onChange={(event) =>
                    setAction(event.target.value as RemediationRequest['action'])
                  }
                >
                  {actions.map(([id, label]) => (
                    <option value={id} key={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {chosenAction === 'remove-role' && (
                <label className="field">
                  Direct role to remove
                  <select
                    disabled={!!review}
                    value={chosenRole}
                    onChange={(event) => setRole(event.target.value)}
                  >
                    {account?.Roles.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
              )}
              {draft.error && <ErrorBox error={draft.error} />}
              {draft.data && (
                <>
                  <h3>{draft.data.title}</h3>
                  <DataDiff
                    before={draft.data.baseline}
                    after={draft.data.operation.body}
                    beforeLabel="Captured"
                    afterLabel="Proposed"
                  />
                  {draft.data.warnings.map((warning) => (
                    <p className="notice" key={warning}>
                      {warning}
                    </p>
                  ))}
                  {draft.data.projection && (
                    <details>
                      <summary>
                        Projected impact: {draft.data.projection.affected.length} accounts
                      </summary>
                      {draft.data.projection.affected.map((row) => (
                        <article key={row.name}>
                          <h4>{row.name}</h4>
                          <p>
                            %All: {row.broadBefore} → {row.broadAfter} · {row.resources.length}{' '}
                            changed resource grants
                          </p>
                          {row.resources.length > 0 && <DataValue value={row.resources} />}
                        </article>
                      ))}
                    </details>
                  )}
                  <label className="field">
                    Reason for this change
                    <textarea
                      disabled={!!review}
                      maxLength={2000}
                      rows={3}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  {!review && (
                    <button
                      className="primary"
                      disabled={!reason.trim()}
                      onClick={() => void prepare()}
                    >
                      Check current state and review
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </fieldset>
      )}
      {review && (
        <fieldset disabled={disabled || campaign.state !== 'active'}>
          <div className="remediation-confirmation">
            <h3>Server-reviewed proposal</h3>
            {staleReview && applyAttempt?.id !== review.id && (
              <aside
                ref={staleNotice}
                tabIndex={-1}
                className="notice"
                role="status"
                aria-label="Proposal needs a new review"
              >
                <p>
                  This campaign changed after the proposal was reviewed. Its confirmation is no
                  longer valid. Leave the proposal unsubmitted, then check current state and review
                  the change again. Your reason is kept.
                </p>
              </aside>
            )}
            <p>{review.verification}</p>
            <p>Expires {new Date(review.expiresAt).toLocaleTimeString()}</p>
            <p>
              Target: <code>{review.target}</code>
            </p>
            <DataDiff
              before={review.before}
              after={review.expected}
              beforeLabel="Reviewed"
              afterLabel="Expected after change"
            />
            <label className="field">
              Reason for reviewed change
              <textarea readOnly rows={3} value={reason} />
            </label>
            <label className="field">
              Type {review.target} to confirm
              <input
                disabled={staleReview || applyAttempt?.id === review.id}
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <div className="inline-actions">
              <button
                onClick={() => {
                  setReview(undefined);
                  setDraftFocusRequest((request) => request + 1);
                }}
              >
                {applyAttempt?.id === review.id ? 'Return to draft' : 'Leave proposal unsubmitted'}
              </button>
              <button
                className="primary"
                disabled={
                  staleReview || applyAttempt?.id === review.id || confirmation !== review.target
                }
                onClick={() => void apply()}
              >
                Apply this change once
              </button>
            </div>
          </div>
        </fieldset>
      )}
      <h3>Remediation history</h3>
      {!campaign.remediations.length && <p>No remediation proposals recorded.</p>}
      {[...campaign.remediations].reverse().map((record) => (
        <article key={record.id} className="remediation-record">
          <div className="section-heading">
            <h4>{record.title}</h4>
            <Badge
              tone={
                record.status === 'verified'
                  ? 'good'
                  : ['failed', 'uncertain', 'different', 'dispatching'].includes(record.status)
                    ? 'warning'
                    : 'neutral'
              }
            >
              {record.status}
            </Badge>
          </div>
          <p>
            {new Date(record.updatedAt).toLocaleString()} · {record.target}
          </p>
          <p>{record.reason}</p>
          <p>{record.message}</p>
          {record.checkedFields.length > 0 && (
            <p>Checked fields: {record.checkedFields.join(', ')}</p>
          )}
          {record.reconciliation && <p>Reconciliation note: {record.reconciliation}</p>}
          {record.status !== 'reviewed' && (
            <button
              disabled={disabled}
              onClick={() => {
                setReconcile(record.id);
                setReconcileNote('');
              }}
            >
              Read current state
            </button>
          )}
          {reconcile === record.id && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setError('');
                void submit('remediation-reconcile', { reviewId: record.id, note: reconcileNote })
                  .then(() => setReconcile(''))
                  .catch((failure) => setError((failure as Error).message));
              }}
            >
              <label className="field">
                Reason for checking
                <textarea
                  maxLength={4000}
                  required
                  rows={3}
                  value={reconcileNote}
                  onChange={(event) => setReconcileNote(event.target.value)}
                />
              </label>
              <p>
                This reads the target and compares the proposed fields. It does not retry the write.
              </p>
              <button disabled={disabled || !reconcileNote.trim()}>
                Check and record current state
              </button>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}
