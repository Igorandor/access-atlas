import { useMemo, useState } from 'react';
import { checkDuties, dutyRulesSchema, type DutyRule } from '../../../shared/duty-rules';
import type { AccessSnapshot } from '../../../shared/access-model';
import { download } from '../../api';
import { DataView } from '../../components/DataView';
import { ErrorBox } from '../../components/ui';

export function DutyReview({ snapshot }: { snapshot: AccessSnapshot }) {
  const [rules, setRules] = useState<DutyRule[]>([]),
    [title, setTitle] = useState('');
  const [left, setLeft] = useState(''),
    [right, setRight] = useState(''),
    [error, setError] = useState('');
  const results = useMemo(() => checkDuties(snapshot, rules), [snapshot, rules]);
  function add() {
    try {
      setRules(dutyRulesSchema.parse([...rules, { title, left, right }]));
      setTitle('');
      setError('');
    } catch {
      setError('Give the rule a title, choose two different roles, and keep at most 20 rules.');
    }
  }
  return (
    <section className="panel duty-review">
      <div className="section-heading">
        <div>
          <h2>Separation of duties</h2>
          <p>
            Define role pairs that should be reviewed when assigned to the same enabled account.
          </p>
        </div>
      </div>
      <p className="notice">
        These are local review rules, not IRIS enforcement. Ordinary inheritance and conditional
        escalation are distinguished. Disabled accounts are excluded; unreadable accounts remain
        unknown. Rules stay in this view until sign-out or reload.
      </p>
      <div className="duty-form">
        <label className="field">
          Rule title
          <input
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Request and approve payments"
          />
        </label>
        <label className="field">
          First role
          <select value={left} onChange={(e) => setLeft(e.target.value)}>
            <option value="">Choose role</option>
            {snapshot.roles.map((role) => (
              <option key={role.Name}>{role.Name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Conflicting role
          <select value={right} onChange={(e) => setRight(e.target.value)}>
            <option value="">Choose role</option>
            {snapshot.roles.map((role) => (
              <option key={role.Name}>{role.Name}</option>
            ))}
          </select>
        </label>
        <button onClick={add} disabled={rules.length >= 20}>
          Add review rule
        </button>
      </div>
      {error && <ErrorBox error={error} />}
      <ul>
        {rules.map((rule, index) => (
          <li key={index}>
            <strong>{rule.title}</strong> · {rule.left} + {rule.right}{' '}
            <button
              aria-label={'Remove rule ' + rule.title}
              onClick={() => setRules(rules.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="inline-actions">
        <button disabled={!rules.length} onClick={() => download('atlas-duty-rules.json', rules)}>
          Export rules
        </button>
        <label className="field">
          Import rules
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > 32_000) throw Error();
                setRules(dutyRulesSchema.parse(JSON.parse(await file.text())));
                setError('');
              } catch {
                setError(
                  'Invalid rules file. Use an exported JSON array with at most 20 role pairs (32 KB maximum).',
                );
              }
            }}
          />
        </label>
        <button
          disabled={!rules.length}
          onClick={() =>
            download('atlas-duty-review.json', {
              version: 1,
              instance: snapshot.instance,
              capturedAt: snapshot.capturedAt,
              warnings: snapshot.warnings,
              rules,
              results,
            })
          }
        >
          Export evaluation
        </button>
      </div>
      <p>
        {results.filter((row) => row.status === 'conflict').length} ordinary conflicts ·{' '}
        {results.filter((row) => row.status === 'conditional').length} conditional ·{' '}
        {results.filter((row) => row.status === 'unknown').length} unknown. Each row explains the
        observed role paths.
      </p>
      <DataView data={results} title="Duty evaluation" />
    </section>
  );
}
