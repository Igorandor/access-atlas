/** Configuration evidence, not an authorization engine. IRIS remains authoritative. */
export type Grant = { Name: string; Permissions: string };
export type AccessUser = {
  Name: string;
  Enabled: boolean;
  Roles: string[];
  EscalationRoles: string[];
  unavailable?: string;
};
export type AccessRole = {
  Name: string;
  Description: string;
  GrantedRoles: string[];
  Resources: Grant[];
  EscalationOnly: boolean;
  unavailable?: string;
};
export type AccessResource = { Name: string; PublicPermission: string; ResourceType: string };
export type AccessApp = {
  Name: string;
  Enabled: boolean;
  AutheEnabled: number;
  Resource: string;
  NameSpace: string;
  unavailable?: string;
};
export type AccessSnapshot = {
  version: 1;
  startedAt: string;
  capturedAt: string;
  instance: string;
  users: AccessUser[];
  roles: AccessRole[];
  resources: AccessResource[];
  apps: AccessApp[];
  warnings: string[];
};
export type EvidencePath = { roles: string[]; conditional: boolean };
export type ResolvedAccess = {
  roles: Map<string, EvidencePath>;
  grants: Map<string, { permissions: string; sources: string[] }>;
  broadAccess: boolean;
  warnings: string[];
};
export function permissions(value: string): string {
  return ['R', 'W', 'U'].filter((p) => value.toUpperCase().includes(p)).join('');
}

/** Breadth-first traversal keeps one shortest explanation per role; cycles terminate. */
export function resolveAccess(snapshot: AccessSnapshot, roots: string[]): ResolvedAccess {
  const definitions = new Map(snapshot.roles.map((r) => [r.Name, r]));
  const roles = new Map<string, EvidencePath>();
  const warnings = new Set<string>();
  const grants = new Map<string, { permissions: string; sources: string[] }>();
  const queue = roots.map((name) => ({ name, path: [] as string[], conditional: false }));
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const next = queue[cursor];
    if (roles.has(next.name)) continue;
    const role = definitions.get(next.name);
    const path = [...next.path, next.name];
    const conditional = next.conditional || !!role?.EscalationOnly;
    roles.set(next.name, { roles: path, conditional });
    if (!role || role.unavailable) {
      warnings.add(`Role ${next.name} could not be read; its privileges are unknown.`);
      continue;
    }
    for (const grant of role.Resources) {
      const old = grants.get(grant.Name) ?? { permissions: '', sources: [] };
      grants.set(grant.Name, {
        permissions: permissions(old.permissions + grant.Permissions),
        sources: [...new Set([...old.sources, role.Name])],
      });
    }
    for (const name of role.GrantedRoles) {
      if (path.includes(name)) warnings.add(`Role cycle: ${[...path, name].join(' → ')}`);
      else queue.push({ name, path, conditional });
    }
  }
  return { roles, grants, broadAccess: roles.has('%All'), warnings: [...warnings] };
}

export type Finding = {
  id: string;
  category: 'Broad access' | 'Public access' | 'Application entry';
  target: string;
  title: string;
  detail: string;
  kind: 'user' | 'resource' | 'app';
  fingerprint: string;
};
export function findings(snapshot: AccessSnapshot): Finding[] {
  const result: Finding[] = [];
  const add = (finding: Omit<Finding, 'fingerprint'>) =>
    result.push({ ...finding, fingerprint: JSON.stringify(finding) });
  for (const user of snapshot.users) {
    if (!user.unavailable && user.Enabled && resolveAccess(snapshot, user.Roles).broadAccess)
      add({
        id: `all:${user.Name}`,
        category: 'Broad access',
        target: user.Name,
        kind: 'user',
        title: 'Enabled account reaches %All',
        detail: `Declared role path: ${resolveAccess(snapshot, user.Roles).roles.get('%All')!.roles.join(' → ')}. Confirm that this account needs broad administration privileges.`,
      });
  }
  for (const resource of snapshot.resources) {
    if (permissions(resource.PublicPermission).includes('W'))
      add({
        id: `public:${resource.Name}`,
        category: 'Public access',
        target: resource.Name,
        kind: 'resource',
        title: 'Resource permits public writes',
        detail: `Public permission is ${resource.PublicPermission}. Check whether application and service controls provide the intended boundary.`,
      });
  }
  for (const app of snapshot.apps) {
    if (!app.unavailable && app.Enabled && app.AutheEnabled & 64)
      add({
        id: `guest:${app.Name}`,
        category: 'Application entry',
        target: app.Name,
        kind: 'app',
        title: 'Enabled route allows unauthenticated entry',
        detail: `Namespace ${app.NameSpace || '(unspecified)'}. ${app.Resource ? `Entry resource: ${app.Resource}.` : 'No entry resource is configured.'} This may be intentional for a public application; inspect its own authorization.`,
      });
  }
  return result;
}

export type Drift = {
  kind: string;
  name: string;
  change: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
};
/** Stable serialization makes object order and unordered role/grant lists irrelevant. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).sort().join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
export function compareSnapshots(before: AccessSnapshot, after: AccessSnapshot): Drift[] {
  if (before.instance !== after.instance)
    throw new Error('Snapshots belong to different configured instances.');
  if (before.warnings.length || after.warnings.length)
    throw new Error('Both captures must be complete before comparing changes.');
  const changes: Drift[] = [];
  for (const kind of ['users', 'roles', 'resources', 'apps'] as const) {
    const left = new Map(before[kind].map((r) => [r.Name, r]));
    const right = new Map(after[kind].map((r) => [r.Name, r]));
    for (const name of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      const a = left.get(name),
        b = right.get(name);
      // Missing detail data is reported in snapshot warnings, never fabricated as a removal.
      if ((a && 'unavailable' in a) || (b && 'unavailable' in b)) continue;
      if (!a) changes.push({ kind, name, change: 'added', after: b });
      else if (!b) changes.push({ kind, name, change: 'removed', before: a });
      else if (canonical(a) !== canonical(b))
        changes.push({ kind, name, change: 'changed', before: a, after: b });
    }
  }
  return changes;
}
