import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import { Badge, ErrorBox } from '../../components/ui';
import { permissions, resolveAccess, type AccessSnapshot } from '../../../shared/access-model';
export function AccessMap({
  snapshot,
  onManage,
}: {
  snapshot: AccessSnapshot;
  onManage: () => void;
}) {
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState(''),
    [omitted, setOmitted] = useState<string[]>([]),
    [filter, setFilter] = useState('');
  const users = snapshot.users.filter((u) => u.Name.toLowerCase().includes(search.toLowerCase()));
  const user = users.find((u) => u.Name === selected) ?? users[0];
  useEffect(() => {
    setOmitted([]);
    setFilter('');
  }, [user?.Name, snapshot]);
  const access = useMemo(
    () => resolveAccess(snapshot, user?.Roles.filter((r) => !omitted.includes(r)) ?? []),
    [snapshot, user, omitted],
  );
  const original = useMemo(() => resolveAccess(snapshot, user?.Roles ?? []), [snapshot, user]);
  const grants = [...access.grants]
    .filter(([name]) => name.toLowerCase().includes(filter.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  const changed = [...original.grants].filter(
    ([name, grant]) => grant.permissions !== (access.grants.get(name)?.permissions ?? ''),
  ).length;
  return (
    <div className="access-workbench">
      <section className="panel identity-list" aria-label="Accounts">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Find an account"
            placeholder="Find an account…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="identity-options">
          {users.map((u) => (
            <button
              key={u.Name}
              aria-pressed={u.Name === user?.Name}
              className={u.Name === user?.Name ? 'selected' : ''}
              onClick={() => setSelected(u.Name)}
            >
              <span className="identity-avatar">{u.Name.slice(0, 2).toUpperCase()}</span>
              <span>
                <strong>{u.Name}</strong>
                <small>
                  {u.unavailable
                    ? 'Details unavailable'
                    : u.Enabled
                      ? 'Enabled account'
                      : 'Disabled account'}
                </small>
              </span>
              <ArrowRight size={14} />
            </button>
          ))}
          {!users.length && <p className="padded muted">No matching accounts.</p>}
        </div>
      </section>
      <section className="panel access-detail">
        {user ? (
          <>
            <div className="section-heading">
              <div>
                <span className="eyebrow">Account configuration</span>
                <h2>{user.Name}</h2>
              </div>
              <div className="inline-actions">
                <Badge tone={user.Enabled ? 'good' : 'neutral'}>
                  {user.Enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <button onClick={onManage}>
                  Manage accounts <ArrowRight size={14} />
                </button>
              </div>
            </div>
            {user.unavailable ? (
              <ErrorBox error={user.unavailable} />
            ) : (
              <>
                <div className="role-path-intro">
                  <h3>Assigned roles</h3>
                  <p>
                    Uncheck a role to preview the declared grants that would change. This does not
                    modify IRIS.
                  </p>
                  <div className="role-switches">
                    {user.Roles.map((r) => (
                      <label key={r}>
                        <input
                          type="checkbox"
                          checked={!omitted.includes(r)}
                          onChange={() =>
                            setOmitted((v) =>
                              v.includes(r) ? v.filter((n) => n !== r) : [...v, r],
                            )
                          }
                        />
                        <code>{r}</code>
                      </label>
                    ))}
                    {!user.Roles.length && <span className="muted">No login roles assigned.</span>}
                  </div>
                  {omitted.length > 0 && (
                    <div className="simulation-note">
                      <strong>Preview only</strong> · {changed} resource grant sets change.{' '}
                      {original.broadAccess && !access.broadAccess
                        ? 'The declared path to %All is also removed.'
                        : ''}
                      <button className="text-link" onClick={() => setOmitted([])}>
                        Reset preview
                      </button>
                    </div>
                  )}
                </div>
                {access.broadAccess && (
                  <div className="broad-note">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>%All is reachable</strong>
                      <p>
                        This account has a declared path to the broad administration role. The
                        explicit grant list below is not its full runtime access. Special
                        restrictions still apply.
                      </p>
                      <code>{[user.Name, ...access.roles.get('%All')!.roles].join(' → ')}</code>
                    </div>
                  </div>
                )}
                {user.EscalationRoles.length > 0 && (
                  <div className="notice">
                    Escalation roles are separate from the login-role graph:{' '}
                    {user.EscalationRoles.join(', ')}. They are not automatically added to this
                    view.
                  </div>
                )}
                {access.warnings.map((w) => (
                  <p key={w} className="notice">
                    {w}
                  </p>
                ))}
                <details className="reached-roles">
                  <summary>{access.roles.size} reachable role definitions · inspect paths</summary>
                  {[...access.roles].map(([name, path]) => (
                    <div key={name}>
                      <code>{[user.Name, ...path.roles].join(' → ')}</code>
                      {path.conditional && <Badge tone="warning">Escalation-only path</Badge>}
                    </div>
                  ))}
                </details>
                <div className="table-toolbar">
                  <div>
                    <h3>Explicit resource grants</h3>
                    <span className="muted">Select a row for its source roles.</span>
                  </div>
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      aria-label="Filter resources"
                      placeholder="Filter resources…"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grant-list">
                  {grants.map(([name, grant]) => (
                    <details key={name}>
                      <summary>
                        <code>{name}</code>
                        <span className="permission-bits">
                          {grant.permissions.split('').map((p) => (
                            <b key={p}>{p}</b>
                          ))}
                        </span>
                        <span>
                          {grant.sources.length} source{grant.sources.length === 1 ? '' : 's'}
                        </span>
                      </summary>
                      <div className="evidence-paths">
                        {grant.sources.map((role) => (
                          <div key={role}>
                            <code>
                              {[user.Name, ...(access.roles.get(role)?.roles ?? [role]), name].join(
                                ' → ',
                              )}
                            </code>
                            {access.roles.get(role)?.conditional && (
                              <Badge tone="warning">Escalation-only</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                  {!grants.length && (
                    <p className="padded muted">
                      No explicit resource grants match. Public privileges and special role behavior
                      are separate.
                    </p>
                  )}
                </div>
                <div className="public-note">
                  <strong>Public permissions apply separately</strong>
                  <span>
                    {snapshot.resources.filter((r) => permissions(r.PublicPermission)).length}{' '}
                    resources have public permissions. Inspect them in Resource matrix.
                  </span>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="atlas-empty">
            <h2>No readable accounts</h2>
            <p>Check capture warnings and your security administration permissions.</p>
          </div>
        )}
      </section>
    </div>
  );
}
