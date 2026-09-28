import { useEffect, useMemo, useState } from 'react';
import { Badge, ErrorBox, Modal } from '../../components/ui';
import {
  permissions,
  resolveAccess,
  type AccessSnapshot,
  type AccessUser,
} from '../../../shared/access-model';
export function ResourceMatrix({
  snapshot,
  initialResourceSearch = '%Admin',
}: {
  snapshot: AccessSnapshot;
  initialResourceSearch?: string;
}) {
  const [search, setSearch] = useState(initialResourceSearch),
    [page, setPage] = useState(0),
    [account, setAccount] = useState('');
  const [cell, setCell] = useState<{ user: AccessUser; resource: string }>();
  useEffect(() => {
    setPage(0);
    setCell(undefined);
  }, [snapshot]);
  const resources = snapshot.resources.filter((r) =>
    r.Name.toLowerCase().includes(search.toLowerCase()),
  );
  const columns = resources.slice(page * 6, page * 6 + 6),
    users = snapshot.users
      .filter((u) => u.Name.toLowerCase().includes(account.toLowerCase()))
      .slice(0, 50);
  const access = useMemo(
    () => new Map(snapshot.users.map((u) => [u.Name, resolveAccess(snapshot, u.Roles)])),
    [snapshot],
  );
  return (
    <section className="panel matrix-panel">
      <div className="section-heading">
        <div>
          <h2>Declared resource access</h2>
          <p>R = read · W = write · U = use. %All is shown separately from explicit grants.</p>
        </div>
      </div>
      <div className="matrix-filters">
        <label>
          Resource name
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Account name
          <input value={account} onChange={(e) => setAccount(e.target.value)} />
        </label>
        <div>
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous resources
          </button>
          <button
            disabled={(page + 1) * 6 >= resources.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next resources
          </button>
        </div>
      </div>
      <div
        className="table-scroll"
        role="region"
        aria-label="Declared resource access matrix"
        tabIndex={0}
      >
        <table className="access-matrix">
          <thead>
            <tr>
              <th>Account / public</th>
              <th>Broad role</th>
              {columns.map((r) => (
                <th key={r.Name}>
                  <code>{r.Name}</code>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="public-row">
              <th>Public permissions</th>
              <td>—</td>
              {columns.map((r) => (
                <td key={r.Name}>{permissions(r.PublicPermission) || '—'}</td>
              ))}
            </tr>
            {users.map((u) => (
              <tr key={u.Name}>
                <th>
                  {u.Name}
                  {u.unavailable !== undefined ? (
                    <small>State unknown</small>
                  ) : (
                    !u.Enabled && <small>Disabled</small>
                  )}
                </th>
                <td>
                  {access.get(u.Name)?.broadAccess ? <Badge tone="warning">%All</Badge> : '—'}
                </td>
                {columns.map((r) => (
                  <td key={r.Name}>
                    <button
                      aria-label={`Explain ${u.Name} on ${r.Name}`}
                      onClick={() => setCell({ user: u, resource: r.Name })}
                    >
                      {u.unavailable !== undefined
                        ? '?'
                        : access.get(u.Name)?.grants.get(r.Name)?.permissions || '—'}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="padded muted">
        Showing up to 50 matching accounts and {columns.length} of {resources.length} resources. A
        dash means no explicit grant in this capture; it is not a denial. Disabled accounts retain
        their configuration.
      </p>
      {cell && (
        <Modal
          title={cell.resource}
          subtitle={cell.user.Name + ' · configuration evidence'}
          onClose={() => setCell(undefined)}
        >
          <div className="modal-body">
            <p>
              Public:{' '}
              {snapshot.resources.find((r) => r.Name === cell.resource)?.PublicPermission || 'none'}
            </p>
            {cell.user.unavailable !== undefined && (
              <ErrorBox error={cell.user.unavailable || 'Details unavailable.'} />
            )}
            <p>
              Reachable %All:{' '}
              {access.get(cell.user.Name)?.broadAccess
                ? 'yes — broad privileges are not expanded into this matrix'
                : 'no declared path'}
            </p>
            {access
              .get(cell.user.Name)
              ?.grants.get(cell.resource)
              ?.sources.map((role) => (
                <p key={role}>
                  <code>
                    {[
                      cell.user.Name,
                      ...(access.get(cell.user.Name)?.roles.get(role)?.roles ?? [role]),
                      cell.resource,
                    ].join(' → ')}
                  </code>
                </p>
              ))}
            <p className="notice">
              Runtime application roles, escalation, SQL privileges and row policies are outside
              this configuration projection.
            </p>
          </div>
        </Modal>
      )}
    </section>
  );
}
