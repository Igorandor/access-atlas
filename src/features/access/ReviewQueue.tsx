import { useState, type Dispatch, type SetStateAction } from 'react';
import { Download, FileCheck2, ShieldCheck } from 'lucide-react';
import { download } from '../../api';
import { Modal } from '../../components/ui';
import { type AccessSnapshot, type Finding } from '../../../shared/access-model';
export type Decision = { fingerprint: string; note: string; reviewedAt: string };
export function ReviewQueue({
  items,
  decisions,
  setDecisions,
  snapshot,
  navigate,
}: {
  items: Finding[];
  decisions: Record<string, Decision>;
  setDecisions: Dispatch<SetStateAction<Record<string, Decision>>>;
  snapshot: AccessSnapshot;
  navigate: (s: string) => void;
}) {
  const [selected, setSelected] = useState<Finding>(),
    [note, setNote] = useState(''),
    [showReviewed, setShowReviewed] = useState(false);
  const isReviewed = (f: Finding) => decisions[f.id]?.fingerprint === f.fingerprint;
  const visible = items.filter((f) => showReviewed || !isReviewed(f));
  return (
    <section className="panel review-panel">
      <div className="section-heading">
        <div>
          <h2>Review the exceptions</h2>
          <p>These are prompts for an administrator, not automatic vulnerability verdicts.</p>
        </div>
        <button
          onClick={() =>
            download('atlas-review-evidence.json', {
              version: 1,
              instance: snapshot.instance,
              capturedAt: snapshot.capturedAt,
              warnings: snapshot.warnings,
              items: items.map((f) => ({ ...f, decision: isReviewed(f) ? decisions[f.id] : null })),
            })
          }
        >
          <Download size={15} /> Review evidence
        </button>
      </div>
      <label className="review-filter">
        <input
          type="checkbox"
          checked={showReviewed}
          onChange={(e) => setShowReviewed(e.target.checked)}
        />{' '}
        Include reviewed items
      </label>
      {visible.map((f) => (
        <article className="finding" key={f.id}>
          <div className="finding-marker">
            <ShieldCheck size={20} />
          </div>
          <div>
            <span className="eyebrow">{f.category}</span>
            <h3>{f.title}</h3>
            <code>{f.target}</code>
            <p>{f.detail}</p>
            {isReviewed(f) && (
              <p className="reviewed-note">
                <strong>Reviewed:</strong> {decisions[f.id].note}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setSelected(f);
              setNote(decisions[f.id]?.note ?? '');
            }}
          >
            {isReviewed(f) ? 'Edit note' : 'Review'}
          </button>
        </article>
      ))}
      {!visible.length && (
        <div className="atlas-empty">
          <FileCheck2 size={32} />
          <h2>
            {items.length
              ? 'All current items have review notes'
              : 'No review prompts in this capture'}
          </h2>
          <p>
            This does not certify the instance as secure. Capture completeness and runtime policy
            still matter.
          </p>
        </div>
      )}
      {selected && (
        <Modal
          title="Record a review"
          subtitle={selected.target}
          onClose={() => setSelected(undefined)}
        >
          <div className="modal-body">
            <h3>{selected.title}</h3>
            <p>{selected.detail}</p>
            <label className="field">
              Reason or follow-up
              <textarea
                rows={4}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explain why this is expected, or what needs to change."
              />
            </label>
            <p className="notice">
              Notes apply to this exact finding and stay in this browser session until exported.
              They do not change IRIS permissions.
            </p>
          </div>
          <footer>
            <button
              onClick={() => {
                navigate(selected.kind === 'app' ? 'apps' : 'permissions');
                setSelected(undefined);
              }}
            >
              Open administration
            </button>
            <button
              className="primary"
              disabled={!note.trim()}
              onClick={() => {
                setDecisions((d) => ({
                  ...d,
                  [selected.id]: {
                    fingerprint: selected.fingerprint,
                    note: note.trim(),
                    reviewedAt: new Date().toISOString(),
                  },
                }));
                setSelected(undefined);
              }}
            >
              Save review note
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
