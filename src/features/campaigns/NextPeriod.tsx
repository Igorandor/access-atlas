import { useMemo, useState } from 'react';
import type { Campaign } from '../../../shared/campaign';
import { nextPeriodPreview, type NextPeriod as PeriodInput } from '../../../shared/campaign-period';
import { ErrorBox } from '../../components/ui';

export function NextPeriod({
  campaign,
  disabled,
  create,
}: {
  campaign: Campaign;
  disabled: boolean;
  create: (input: PeriodInput) => Promise<void>;
}) {
  const [title, setTitle] = useState((campaign.title + ' · next period').slice(0, 160));
  const [description, setDescription] = useState(campaign.description);
  const [copyDutyRules, setCopyDutyRules] = useState(true);
  const [copyPolicies, setCopyPolicies] = useState(true);
  const [copyCertificationScope, setCopyCertificationScope] = useState(true);
  const [dueDate, setDueDate] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const input: PeriodInput = {
    revision: campaign.revision,
    title,
    description,
    copyDutyRules,
    copyPolicies,
    copyCertificationScope,
    ...(dueDate ? { dueDate } : {}),
  };
  const preview = useMemo(() => {
    try {
      return nextPeriodPreview(campaign, { ...input, title: title.trim() || 'Next period' });
    } catch {
      return [];
    }
  }, [campaign, title, description, copyDutyRules, copyPolicies, copyCertificationScope, dueDate]);
  const unresolved = campaign.remediations.filter((receipt) =>
    ['dispatching', 'uncertain', 'unverified', 'different'].includes(receipt.status),
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await create(input);
      setError('');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  return (
    <section className="panel padded next-period">
      <h3>Start the next review period</h3>
      <p>
        Create a separate campaign with selected review settings. The original campaign remains
        available with its captures and decisions.
      </p>
      {error && <ErrorBox error={error} />}
      {!!unresolved.length && (
        <aside className="notice">
          <strong>{unresolved.length} unresolved remediations remain in this campaign.</strong>
          <p>
            Starting a new period does not reconcile those writes. Read their targets before
            considering another operation.
          </p>
        </aside>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={disabled}>
          <legend>Next campaign</legend>
          <label className="field">
            Title
            <input
              value={title}
              required
              maxLength={160}
              onChange={(event) => {
                setTitle(event.target.value);
                setReviewed(false);
              }}
            />
          </label>
          <label className="field">
            Scope and period
            <textarea
              value={description}
              maxLength={4000}
              rows={4}
              onChange={(event) => {
                setDescription(event.target.value);
                setReviewed(false);
              }}
            />
          </label>
          <div className="period-options">
            <label className="report-section-option">
              <input
                type="checkbox"
                checked={copyDutyRules}
                onChange={(event) => {
                  setCopyDutyRules(event.target.checked);
                  setReviewed(false);
                }}
              />
              <span>
                <strong>Copy duty rules</strong>
                <small>{campaign.rules.length} role pair definitions</small>
              </span>
            </label>
            <label className="report-section-option">
              <input
                type="checkbox"
                checked={copyPolicies}
                onChange={(event) => {
                  setCopyPolicies(event.target.checked);
                  setReviewed(false);
                }}
              />
              <span>
                <strong>Copy review policies</strong>
                <small>{campaign.policies.length} policy definitions</small>
              </span>
            </label>
            <label className="report-section-option">
              <input
                type="checkbox"
                checked={copyCertificationScope}
                onChange={(event) => {
                  setCopyCertificationScope(event.target.checked);
                  setReviewed(false);
                }}
              />
              <span>
                <strong>Copy certification scope</strong>
                <small>
                  {campaign.certificationScope.enabled
                    ? campaign.certificationScope.kinds.join(', ')
                    : 'Certification currently disabled'}
                </small>
              </span>
            </label>
          </div>
          {copyCertificationScope && campaign.certificationScope.enabled && (
            <>
              <dl className="report-facts">
                <dt>Object types</dt>
                <dd>{campaign.certificationScope.kinds.join(', ')}</dd>
                <dt>Name prefix</dt>
                <dd>{campaign.certificationScope.prefix || 'All names'}</dd>
                <dt>Disabled objects</dt>
                <dd>{campaign.certificationScope.includeDisabled ? 'Included' : 'Excluded'}</dd>
              </dl>
              <label className="field">
                New review due date
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => {
                    setDueDate(event.target.value);
                    setReviewed(false);
                  }}
                />
              </label>
              <p>
                The previous due date is cleared. Set a new date if the next review has a deadline.
              </p>
            </>
          )}
          <h4>What starts the new period</h4>
          <div className="inquiry-table-wrap">
            <table className="inquiry-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>This campaign</th>
                  <th>Next campaign</th>
                  <th>Effect</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.before}</td>
                    <td>{row.after}</td>
                    <td>{row.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="inquiry-checkbox">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I reviewed the settings for the next period.
          </label>
          <div className="inquiry-actions">
            <button className="primary" disabled={!reviewed || !title.trim() || !preview.length}>
              Create next-period campaign
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
