import { useEffect, useRef, useState } from 'react';
import type { ChangeReceipt } from '../../shared/change-review';
import { receiptExplanation } from '../../shared/change-review';
import { download } from '../api';
import { refreshEvidence } from '../saved-evidence';
import { Badge, ErrorBox, Loading } from '../components/ui';
import { DataValue } from '../components/DataView';

export function ReceiptHistory({ onClose }: { onClose: () => void }) {
  const [receipts, setReceipts] = useState<ChangeReceipt[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const sequence = useRef(0);
  async function refresh() {
    const token = ++sequence.current;
    setPending(true);
    setError('');
    try {
      await refreshEvidence<ChangeReceipt[]>('changes/receipts', {
        current: () => sequence.current === token,
        received: (loaded) => {
          setReceipts(loaded);
          setSelected((id) => (loaded.some((receipt) => receipt.id === id) ? id : ''));
        },
        refused: () => {
          setReceipts([]);
          setSelected('');
        },
        failed: setError,
      });
    } finally {
      if (sequence.current === token) setPending(false);
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, []);
  const visible = receipts.filter(
    (receipt) =>
      (status === 'all' || receipt.status === status) &&
      (receipt.target + ' ' + receipt.path + ' ' + receipt.message)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const activePage = Math.min(page, Math.max(0, Math.ceil(visible.length / 20) - 1));
  const current = receipts.find((receipt) => receipt.id === selected);
  return (
    <section className="panel padded receipt-history">
      <header className="section-heading">
        <div>
          <h2>Session change receipts</h2>
          <p>Up to 100 receipts, retained for eight hours in this gateway session.</p>
        </div>
        <div className="inline-actions">
          <button disabled={pending} onClick={() => void refresh()}>
            Refresh receipts
          </button>
          <button onClick={onClose}>Close receipts</button>
        </div>
      </header>
      <p>
        Loading this list checks your current native access to every included source. Sign-out or
        gateway restart removes session receipts. Campaign remediations have separate durable
        records.
      </p>
      {error && <ErrorBox error={error} retry={() => void refresh()} />}
      {pending && <Loading />}
      <div className="report-filters">
        <label className="field">
          Find receipt
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="field">
          Result
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All results</option>
            {['verified', 'acknowledged', 'different', 'unverified', 'uncertain', 'failed'].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <div className="inquiry-table-wrap">
        <table className="inquiry-table">
          <thead>
            <tr>
              <th>Target</th>
              <th>Operation</th>
              <th>At</th>
              <th>Result</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(activePage * 20, activePage * 20 + 20).map((receipt) => (
              <tr key={receipt.id}>
                <td>
                  <code>{receipt.target}</code>
                </td>
                <td>
                  {receipt.method} {receipt.path}
                </td>
                <td>{new Date(receipt.at).toLocaleString()}</td>
                <td>
                  <Badge tone={receipt.status === 'verified' ? 'good' : 'warning'}>
                    {receipt.status}
                  </Badge>
                </td>
                <td>
                  <button onClick={() => setSelected(receipt.id)}>Inspect receipt</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!pending && !error && !visible.length && <p>No receipts match these filters.</p>}
      <div className="inline-actions">
        <button disabled={!activePage} onClick={() => setPage(activePage - 1)}>
          Previous receipts
        </button>
        <span>
          {visible.length ? activePage * 20 + 1 : 0}–
          {Math.min((activePage + 1) * 20, visible.length)} of {visible.length}
        </span>
        <button
          disabled={(activePage + 1) * 20 >= visible.length}
          onClick={() => setPage(activePage + 1)}
        >
          Next receipts
        </button>
        <button
          disabled={!visible.length}
          onClick={() =>
            download('atlas-session-receipts.json', {
              exportedAt: new Date().toISOString(),
              receipts: visible,
            })
          }
        >
          Export filtered receipts
        </button>
      </div>
      {current && (
        <article className="receipt-detail">
          <h3>
            {current.target} · {current.status}
          </h3>
          <p>{receiptExplanation(current.status)}</p>
          <p>{current.message}</p>
          <dl className="report-facts">
            <dt>Operation</dt>
            <dd>
              {current.method} {current.path}
            </dd>
            <dt>Native HTTP status</dt>
            <dd>{current.nativeStatus ?? 'No response recorded'}</dd>
            <dt>Checked fields</dt>
            <dd>{current.checkedFields.join(', ') || 'None confirmed'}</dd>
            <dt>Receipt ID</dt>
            <dd>{current.id}</dd>
            <dt>Review ID</dt>
            <dd>{current.reviewId}</dd>
          </dl>
          {current.asyncId && (
            <p className="notice">
              Native asynchronous job: <code>{current.asyncId}</code>. Inspect the job before
              repeating this operation.
            </p>
          )}
          {!!current.differences.length && (
            <>
              <h4>Readback differences</h4>
              <DataValue value={current.differences} />
            </>
          )}
          <button onClick={() => download('atlas-receipt-' + current.id + '.json', current)}>
            Export this receipt
          </button>
        </article>
      )}
    </section>
  );
}
