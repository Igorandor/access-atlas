import { useMemo, useState } from 'react';
import type { AccessSnapshot } from '../../../shared/access-model';
import {
  evaluatePolicies,
  reviewPoliciesSchema,
  type ReviewPolicy,
} from '../../../shared/review-policies';
import { download } from '../../api';
import { Badge, ErrorBox } from '../../components/ui';

export function PolicyReview({
  snapshot,
  policies: stored,
  onSave,
  disabled = false,
}: {
  snapshot: AccessSnapshot;
  policies?: ReviewPolicy[];
  onSave?: (policies: ReviewPolicy[]) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState<ReviewPolicy[]>([]);
  const policies = stored ?? local;
  const [error, setError] = useState('');
  const [kind, setKind] = useState<ReviewPolicy['kind']>('account-roles');
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<ReviewPolicy['severity']>('medium');
  const [rationale, setRationale] = useState('');
  const [prefix, setPrefix] = useState('');
  const [names, setNames] = useState('');
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [requirement, setRequirement] = useState<'all' | 'any' | 'none'>('none');
  const [escalation, setEscalation] = useState(true);
  const [resource, setResource] = useState(snapshot.resources[0]?.Name || '');
  const [prohibited, setProhibited] = useState('W');
  const [requireAuthentication, setRequireAuthentication] = useState(true);
  const [requireResource, setRequireResource] = useState(true);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [maximumDepth, setMaximumDepth] = useState(5);
  const [status, setStatus] = useState('actionable');
  const [policyId, setPolicyId] = useState('');
  const results = useMemo(() => evaluatePolicies(snapshot, policies), [snapshot, policies]);
  const visible = results.filter(
    (row) =>
      (!policyId || row.policyId === policyId) &&
      (status === 'all' || status === 'actionable'
        ? status === 'all' || !['pass', 'excluded'].includes(row.result)
        : row.result === status),
  );
  function save(next: ReviewPolicy[]) {
    try {
      const valid = reviewPoliciesSchema.parse(next);
      onSave ? onSave(valid) : setLocal(valid);
      setError('');
    } catch {
      setError(
        'Check the policy fields. At most 30 policies, 20 roles per rule and 50 exact scope names are allowed.',
      );
    }
  }
  function add() {
    const common = {
      id: crypto.randomUUID(),
      title,
      severity,
      rationale,
      enabled: true,
      scope: {
        names: names
          .split('\n')
          .map((name) => name.trim())
          .filter(Boolean),
        prefix,
        includeDisabled,
      },
    };
    let policy: ReviewPolicy;
    switch (kind) {
      case 'account-roles':
        policy = { ...common, kind, roles, requirement, includeEscalation: escalation };
        break;
      case 'account-resource':
        policy = { ...common, kind, resource, prohibited, includeEscalation: escalation };
        break;
      case 'public-resource':
        policy = { ...common, kind, prohibited };
        break;
      case 'application-entry':
        policy = { ...common, kind, requireAuthentication, requireResource, namespaces };
        break;
      case 'role-inheritance':
        policy = { ...common, kind, maximumDepth, prohibitedRoles: roles };
        break;
    }
    save([...policies, policy]);
  }
  return (
    <section className="panel padded policy-review">
      <div className="section-heading">
        <div>
          <h2>Review policies</h2>
          <p>Evaluate your access requirements against captured configuration.</p>
        </div>
        <button
          disabled={!policies.length}
          onClick={() =>
            download('atlas-review-policies.json', {
              version: 1,
              instance: snapshot.instance,
              policies,
            })
          }
        >
          Export policies
        </button>
      </div>
      <p className="notice">
        Policies produce findings for review; they do not enforce access in IRIS.{' '}
        {onSave
          ? 'Changes are saved in this campaign.'
          : 'Export policies before reloading or signing out.'}
      </p>
      {error && <ErrorBox error={error} />}
      <details className="policy-editor">
        <summary>Add a policy</summary>
        <fieldset disabled={disabled}>
          <div className="analysis-pair">
            <label className="field">
              Policy title
              <input
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="field">
              Type
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as ReviewPolicy['kind'])}
              >
                <option value="account-roles">Account role requirements</option>
                <option value="account-resource">Prohibited resource privileges</option>
                <option value="public-resource">Public resource permissions</option>
                <option value="application-entry">Application entry controls</option>
                <option value="role-inheritance">Role inheritance boundary</option>
              </select>
            </label>
          </div>
          <div className="analysis-pair">
            <label className="field">
              Severity
              <select
                value={severity}
                onChange={(event) => setSeverity(event.target.value as ReviewPolicy['severity'])}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="field">
              Scope prefix
              <input
                value={prefix}
                maxLength={128}
                onChange={(event) => setPrefix(event.target.value)}
                placeholder="Blank includes all prefixes"
              />
            </label>
          </div>
          <label className="field">
            Exact scope names, one per line
            <textarea
              value={names}
              rows={3}
              maxLength={25000}
              onChange={(event) => setNames(event.target.value)}
              placeholder="Leave blank to include all names matching the prefix"
            />
          </label>
          <label className="field">
            Reason for this policy
            <textarea
              value={rationale}
              rows={3}
              maxLength={2000}
              onChange={(event) => setRationale(event.target.value)}
            />
          </label>
          <label className="analysis-check">
            <input
              type="checkbox"
              checked={includeDisabled}
              onChange={(event) => setIncludeDisabled(event.target.checked)}
            />
            Include disabled accounts or applications
          </label>
          {['account-roles', 'role-inheritance'].includes(kind) && (
            <label className="field">
              {kind === 'account-roles' ? 'Roles in requirement' : 'Prohibited inherited roles'}
              <select
                multiple
                value={roles}
                size={Math.min(8, snapshot.roles.length || 3)}
                onChange={(event) =>
                  setRoles([...event.target.selectedOptions].map((option) => option.value))
                }
              >
                {snapshot.roles.map((role) => (
                  <option key={role.Name}>{role.Name}</option>
                ))}
              </select>
            </label>
          )}
          {kind === 'account-roles' && (
            <label className="field">
              Membership requirement
              <select
                value={requirement}
                onChange={(event) => setRequirement(event.target.value as typeof requirement)}
              >
                <option value="none">None of these roles</option>
                <option value="all">All of these roles</option>
                <option value="any">At least one of these roles</option>
              </select>
            </label>
          )}
          {['account-roles', 'account-resource'].includes(kind) && (
            <label className="analysis-check">
              <input
                type="checkbox"
                checked={escalation}
                onChange={(event) => setEscalation(event.target.checked)}
              />
              Report conditional escalation paths
            </label>
          )}
          {kind === 'account-resource' && (
            <label className="field">
              Resource
              <select value={resource} onChange={(event) => setResource(event.target.value)}>
                {snapshot.resources.map((item) => (
                  <option key={item.Name}>{item.Name}</option>
                ))}
              </select>
            </label>
          )}
          {['account-resource', 'public-resource'].includes(kind) && (
            <label className="field">
              Prohibited permissions
              <select value={prohibited} onChange={(event) => setProhibited(event.target.value)}>
                {['R', 'W', 'U', 'RW', 'RU', 'WU', 'RWU'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          )}
          {kind === 'application-entry' && (
            <>
              <label className="analysis-check">
                <input
                  type="checkbox"
                  checked={requireAuthentication}
                  onChange={(event) => setRequireAuthentication(event.target.checked)}
                />
                Require authenticated entry
              </label>
              <label className="analysis-check">
                <input
                  type="checkbox"
                  checked={requireResource}
                  onChange={(event) => setRequireResource(event.target.checked)}
                />
                Require an entry resource
              </label>
              <label className="field">
                Allowed namespaces (none selected means any)
                <select
                  multiple
                  value={namespaces}
                  onChange={(event) =>
                    setNamespaces([...event.target.selectedOptions].map((option) => option.value))
                  }
                >
                  {[...new Set(snapshot.apps.map((app) => app.NameSpace).filter(Boolean))]
                    .sort()
                    .map((namespace) => (
                      <option key={namespace}>{namespace}</option>
                    ))}
                </select>
              </label>
            </>
          )}
          {kind === 'role-inheritance' && (
            <label className="field">
              Maximum inheritance depth
              <input
                type="number"
                min={1}
                max={30}
                value={maximumDepth}
                onChange={(event) => setMaximumDepth(Number(event.target.value))}
              />
            </label>
          )}
          <button disabled={!title.trim() || policies.length >= 30} onClick={add}>
            Add policy
          </button>
        </fieldset>
      </details>
      <label className="field">
        Import policies
        <input
          type="file"
          accept="application/json,.json"
          disabled={disabled}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            try {
              if (file.size > 150_000) throw new Error('Policy files are limited to 150 KB.');
              const parsed = JSON.parse(await file.text());
              if (parsed.version !== 1 || parsed.instance !== snapshot.instance)
                throw new Error('Use a policy export for this instance.');
              save(reviewPoliciesSchema.parse(parsed.policies));
            } catch (failure) {
              setError((failure as Error).message);
            }
          }}
        />
      </label>
      <div className="policy-list">
        {policies.map((policy) => (
          <article key={policy.id}>
            <div>
              <h3>{policy.title}</h3>
              <span>
                {policy.kind} · {policy.severity}
              </span>
              <p>{policy.rationale}</p>
              <p>
                Scope: {policy.scope.prefix || 'any prefix'} ·{' '}
                {policy.scope.names.length ? policy.scope.names.join(', ') : 'all matching names'}
              </p>
            </div>
            <div className="inline-actions">
              <button
                disabled={disabled}
                onClick={() =>
                  save(
                    policies.map((item) =>
                      item.id === policy.id ? { ...item, enabled: !item.enabled } : item,
                    ),
                  )
                }
              >
                {policy.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                disabled={disabled}
                onClick={() => save(policies.filter((item) => item.id !== policy.id))}
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="section-heading">
        <h3>Evaluation results</h3>
        <button
          disabled={!results.length}
          onClick={() =>
            download('atlas-policy-evaluation.json', {
              instance: snapshot.instance,
              capturedAt: snapshot.capturedAt,
              warnings: snapshot.warnings,
              policies,
              results,
            })
          }
        >
          Export evaluation
        </button>
      </div>
      <div className="analysis-pair">
        <label className="field">
          Result status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="actionable">Findings, conditional and unknown</option>
            <option value="all">All results</option>
            {['finding', 'conditional', 'unknown', 'pass', 'excluded'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Policy
          <select value={policyId} onChange={(event) => setPolicyId(event.target.value)}>
            <option value="">All policies</option>
            {policies.map((policy) => (
              <option value={policy.id} key={policy.id}>
                {policy.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {results.filter((row) => row.result === 'finding').length} findings ·{' '}
        {results.filter((row) => row.result === 'conditional').length} conditional ·{' '}
        {results.filter((row) => row.result === 'unknown').length} unknown
      </p>
      {visible.map((row) => (
        <details key={row.id} className="policy-result">
          <summary>
            <strong>{row.target}</strong>
            <span>{row.policy}</span>
            <Badge tone={['unknown', 'finding'].includes(row.result) ? 'warning' : 'neutral'}>
              {row.result}
            </Badge>
          </summary>
          <p>{row.explanation}</p>
          <dl>
            {row.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value || 'None captured'}</dd>
              </div>
            ))}
          </dl>
          {row.paths.length > 0 && (
            <ul>
              {row.paths.map((path, index) => (
                <li key={index}>{path.join(' → ')}</li>
              ))}
            </ul>
          )}
        </details>
      ))}
      {!visible.length && <p>No results in this filter.</p>}
    </section>
  );
}
