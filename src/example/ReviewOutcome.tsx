import { useState } from 'react';
import { trainingAfter, trainingReviewOutcome, trainingReviewReport } from './review-outcome';
import { trainingSnapshot } from './training-snapshot';

export function ReviewOutcome() {
  const [compared, setCompared] = useState(false);
  const [note, setNote] = useState('');
  const [exported, setExported] = useState(false);
  const outcome = trainingReviewOutcome();
  function downloadReport() {
    const url = URL.createObjectURL(
      new Blob([trainingReviewReport(note)], { type: 'text/plain;charset=utf-8' }),
    );
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: 'atlas-training-review.txt',
    });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  }
  return (
    <section className="panel example-outcome" aria-labelledby="outcome-title">
      <h2 id="outcome-title">What remains after the role change?</h2>
      <p>
        Alex has moved from support to reporting. Removing SupportTeam should remove the declared
        write grant to TrainingOrders. ReportingReader is a separate assignment: its read grant
        needs its own review.
      </p>
      <p>
        Compare two supplied training captures. The second has SupportTeam removed; it is
        independent of the checkboxes in Access map. No change or readback is performed on IRIS.
      </p>
      {!compared ? (
        <button className="primary" onClick={() => setCompared(true)}>
          Compare supplied captures
        </button>
      ) : (
        <>
          <div className="example-result" role="status">
            <strong>
              {outcome.resource}: {outcome.before} → {outcome.after}
            </strong>
            <p>Write permission removed from the declared paths. Read permission remains.</p>
          </div>
          <dl className="example-evidence">
            <dt>Before capture</dt>
            <dd>
              <time dateTime={trainingSnapshot.capturedAt}>28 Sep 2026, 09:00 UTC</time>
            </dd>
            <dt>After capture</dt>
            <dd>
              <time dateTime={trainingAfter.capturedAt}>28 Sep 2026, 09:10 UTC</time>
            </dd>
            <dt>Changed configuration</dt>
            <dd>
              {outcome.changes.length} account changed: {outcome.account}. SupportTeam removed;
              ReportingReader retained.
            </dd>
            <dt>Remaining path</dt>
            <dd>
              {outcome.afterPaths.map((path) => (
                <code key={path}>{path}</code>
              ))}
            </dd>
            <dt>Unchanged public permission</dt>
            <dd>
              TrainingStatus still has public R. Removing an account’s roles does not remove public
              permissions.
            </dd>
            <dt>Still to review</dt>
            <dd>
              Confirm whether reporting access is required with the account owner. This comparison
              alone is not approval to retain it.
            </dd>
          </dl>
          <label className="example-note">
            Reviewer note{' '}
            <span className="muted">(optional; kept only until you leave this view)</span>
            <textarea
              maxLength={500}
              rows={3}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setExported(false);
              }}
              placeholder="What should the next reviewer check?"
            />
          </label>
          <div className="inline-actions">
            <button onClick={downloadReport}>Download training report</button>
            <button
              onClick={() => {
                setCompared(false);
                setNote('');
                setExported(false);
              }}
            >
              Reset exercise
            </button>
          </div>
          {exported && (
            <p role="status">
              Report download requested. Keep the file to retain this exercise and your note.
            </p>
          )}
          <details className="example-report">
            <summary>Read the report</summary>
            <pre>{trainingReviewReport(note)}</pre>
          </details>
          <p>
            In a connected review, save a baseline in Campaigns, prepare and confirm a reviewed
            change, then capture again. Preserve any uncertain outcome for reconciliation instead of
            replaying the write. Export the campaign report with its remaining decisions.
          </p>
          <a href="https://github.com/Igorandor/access-atlas/blob/main/docs/FIRST_REVIEW.md">
            Follow a review on your own instance
          </a>
        </>
      )}
    </section>
  );
}
