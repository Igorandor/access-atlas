import { useMemo, useRef, useState } from 'react';
import { checkDuties, dutyRulesSchema, type DutyRule } from '../../../shared/duty-rules';
import type { AccessSnapshot } from '../../../shared/access-model';
import { download } from '../../api';
import { DataView } from '../../components/DataView';
import { ErrorBox } from '../../components/ui';

export function DutyReview({
  snapshot,
  rules: savedRules,
  onRulesChange,
  persisted = false,
}: {
  snapshot: AccessSnapshot;
  rules?: DutyRule[];
  onRulesChange?: (rules: DutyRule[]) => boolean | Promise<boolean>;
  persisted?: boolean;
}) {
  const [localRules, setLocalRules] = useState<DutyRule[]>([]),
    [title, setTitle] = useState('');
  const [left, setLeft] = useState(''),
    [right, setRight] = useState(''),
    [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const adding = useRef(false),
    draftVersion = useRef(0);
  const snapshotKey = JSON.stringify([snapshot.instance, snapshot.capturedAt]);
  const currentSnapshot = useRef(snapshotKey);
  currentSnapshot.current = snapshotKey;
  const rules = savedRules ?? localRules;
  async function setRules(next: DutyRule[]) {
    try {
      if (onRulesChange) return await onRulesChange(next);
      setLocalRules(next);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the review rules.');
      return false;
    }
  }
  const results = useMemo(() => checkDuties(snapshot, rules), [snapshot, rules]);
  async function add() {
    if (adding.current) return;
    let next: DutyRule[];
    try {
      next = dutyRulesSchema.parse([...rules, { title, left, right }]);
    } catch {
      setError('Give the rule a title, choose two different roles, and keep at most 20 rules.');
      return;
    }
    const version = draftVersion.current;
    adding.current = true;
    setSaving(true);
    setError('');
    try {
      if (
        (await setRules(next)) &&
        draftVersion.current === version &&
        currentSnapshot.current === snapshotKey
      )
        setTitle('');
    } finally {
      adding.current = false;
      setSaving(false);
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
        unknown.{' '}
        {persisted
          ? 'Rules are saved in this campaign.'
          : 'Export rules before sign-out or reload.'}
      </p>
      <div className="duty-form">
        <label className="field">
          Rule title
          <input
            maxLength={160}
            disabled={saving}
            value={title}
            onChange={(e) => {
              draftVersion.current++;
              setTitle(e.target.value);
            }}
            placeholder="Request and approve payments"
          />
        </label>
        <label className="field">
          First role
          <select
            disabled={saving}
            value={left}
            onChange={(e) => {
              draftVersion.current++;
              setLeft(e.target.value);
            }}
          >
            <option value="">Choose role</option>
            {snapshot.roles.map((role) => (
              <option key={role.Name}>{role.Name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Conflicting role
          <select
            disabled={saving}
            value={right}
            onChange={(e) => {
              draftVersion.current++;
              setRight(e.target.value);
            }}
          >
            <option value="">Choose role</option>
            {snapshot.roles.map((role) => (
              <option key={role.Name}>{role.Name}</option>
            ))}
          </select>
        </label>
        <button onClick={() => void add()} disabled={saving || rules.length >= 20}>
          {saving ? 'Saving review rule…' : 'Add review rule'}
        </button>
      </div>
      {error && <ErrorBox error={error} />}
      <ul>
        {rules.map((rule, index) => (
          <li key={index}>
            <strong>{rule.title}</strong> · {rule.left} + {rule.right}{' '}
            <button
              aria-label={'Remove rule ' + rule.title}
              disabled={saving}
              onClick={() => void setRules(rules.filter((_, i) => i !== index))}
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
            disabled={saving}
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > 32_000) throw Error();
                if (await setRules(dutyRulesSchema.parse(JSON.parse(await file.text()))))
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
