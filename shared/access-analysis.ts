import {
  permissions,
  type AccessSnapshot,
  type AccessRole,
  type AccessUser,
} from './access-model.js';

export type PermissionLetter = 'R' | 'W' | 'U';
export type GrantTrace = {
  resource: string;
  permissions: string;
  role: string;
  path: string[];
  conditional: boolean;
};
export type AccountAccess = {
  name: string;
  enabled: boolean;
  unknown: string[];
  ordinaryRoles: string[];
  conditionalRoles: string[];
  grants: GrantTrace[];
  broad: 'ordinary' | 'conditional' | 'not observed';
};
export type ResourceAccess = {
  name: string;
  ordinary: string;
  conditional: string;
  public: string;
  sources: GrantTrace[];
  unknown: boolean;
};

/** Separate ordinary assignment from possible escalation; neither proves runtime activation. */
export function explainAccount(snapshot: AccessSnapshot, user: AccessUser): AccountAccess {
  const definitions = new Map(snapshot.roles.map((role) => [role.Name, role]));
  const unknown = new Set<string>();
  if (snapshot.warnings.length) unknown.add('Capture contains incomplete sources.');
  if (Object.hasOwn(user, 'unavailable')) unknown.add('Account details are unavailable.');
  const states = new Map<string, { name: string; path: string[]; conditional: boolean }>();
  const queue = [
    ...user.Roles.map((name) => ({ name, path: [] as string[], conditional: false })),
    ...user.EscalationRoles.map((name) => ({ name, path: [] as string[], conditional: true })),
  ];
  const grants: GrantTrace[] = [];
  for (let index = 0; index < queue.length; index++) {
    const next = queue[index];
    const definition = definitions.get(next.name);
    const conditional = next.conditional || definition?.EscalationOnly === true;
    const state = JSON.stringify([next.name, conditional]);
    if (states.has(state)) continue;
    const path = [...next.path, next.name];
    states.set(state, { name: next.name, path, conditional });
    if (!definition || Object.hasOwn(definition, 'unavailable')) {
      unknown.add('Role ' + next.name + ' is unreadable or missing.');
      continue;
    }
    for (const grant of definition.Resources) {
      const letters = permissions(grant.Permissions);
      if (letters)
        grants.push({
          resource: grant.Name,
          permissions: letters,
          role: definition.Name,
          path,
          conditional,
        });
    }
    for (const inherited of definition.GrantedRoles) {
      if (path.includes(inherited)) {
        unknown.add('Role cycle encountered: ' + [...path, inherited].join(' → '));
        continue;
      }
      queue.push({ name: inherited, path, conditional });
    }
  }
  const all = [...states.values()];
  const ordinaryRoles = all
    .filter((state) => !state.conditional)
    .map((state) => state.name)
    .sort();
  const conditionalRoles = all
    .filter((state) => state.conditional)
    .map((state) => state.name)
    .sort();
  for (const cycle of roleCycles(snapshot))
    if (cycle.some((name) => ordinaryRoles.includes(name) || conditionalRoles.includes(name)))
      unknown.add('Role cycle encountered: ' + cycle.join(' ↔ '));
  return {
    name: user.Name,
    enabled: user.Enabled,
    unknown: [...unknown],
    ordinaryRoles,
    conditionalRoles,
    grants,
    broad: ordinaryRoles.includes('%All')
      ? 'ordinary'
      : conditionalRoles.includes('%All')
        ? 'conditional'
        : 'not observed',
  };
}

export function accountResources(
  snapshot: AccessSnapshot,
  access: AccountAccess,
): ResourceAccess[] {
  const publicResources = new Map(
    snapshot.resources.map((resource) => [resource.Name, permissions(resource.PublicPermission)]),
  );
  const names = new Set([
    ...publicResources.keys(),
    ...access.grants.map((grant) => grant.resource),
  ]);
  return [...names].sort().map((name) => {
    const sources = access.grants.filter((grant) => grant.resource === name);
    return {
      name,
      ordinary: permissions(
        sources
          .filter((grant) => !grant.conditional)
          .map((grant) => grant.permissions)
          .join(''),
      ),
      conditional: permissions(
        sources
          .filter((grant) => grant.conditional)
          .map((grant) => grant.permissions)
          .join(''),
      ),
      public: publicResources.get(name) || '',
      sources,
      unknown: access.unknown.length > 0 || !publicResources.has(name),
    };
  });
}

export function compareAccounts(snapshot: AccessSnapshot, leftName: string, rightName: string) {
  const left = snapshot.users.find((user) => user.Name === leftName);
  const right = snapshot.users.find((user) => user.Name === rightName);
  if (!left || !right) throw new Error('Select two accounts from the current capture.');
  const leftAccess = explainAccount(snapshot, left);
  const rightAccess = explainAccount(snapshot, right);
  const a = new Map(
    accountResources(snapshot, leftAccess).map((resource) => [resource.name, resource]),
  );
  const b = new Map(
    accountResources(snapshot, rightAccess).map((resource) => [resource.name, resource]),
  );
  const resources = [...new Set([...a.keys(), ...b.keys()])].sort().map((name) => {
    const empty = { name, ordinary: '', conditional: '', public: '', sources: [], unknown: true };
    const before = a.get(name) || empty;
    const after = b.get(name) || empty;
    return {
      name,
      left: before,
      right: after,
      different: before.ordinary !== after.ordinary || before.conditional !== after.conditional,
    };
  });
  return { left: leftAccess, right: rightAccess, resources };
}

export function roleImpact(snapshot: AccessSnapshot, roleName: string) {
  const role = snapshot.roles.find((item) => item.Name === roleName);
  if (!role) throw new Error('Select a role from the capture.');
  const directParents = snapshot.roles
    .filter((item) => item.GrantedRoles.includes(roleName))
    .map((item) => item.Name);
  const accounts = snapshot.users
    .map((user) => {
      const access = explainAccount(snapshot, user);
      return {
        name: user.Name,
        enabled: user.Enabled,
        direct: user.Roles.includes(roleName),
        ordinary: access.ordinaryRoles.includes(roleName),
        conditional: access.conditionalRoles.includes(roleName),
        unknown: access.unknown,
        paths: access.grants.filter((grant) => grant.path.includes(roleName)),
      };
    })
    .filter((account) => account.ordinary || account.conditional || account.unknown.length > 0);
  const synthetic: AccessUser = {
    Name: 'Role inspection',
    Enabled: true,
    Roles: [roleName],
    EscalationRoles: [],
  };
  const projection = explainAccount(snapshot, synthetic);
  const resources = accountResources(snapshot, projection).filter(
    (resource) => resource.sources.length > 0,
  );
  const resourceNames = new Set(resources.map((resource) => resource.name));
  const applications = snapshot.apps.filter(
    (app) => app.Resource && resourceNames.has(app.Resource),
  );
  return { role, directParents, accounts, projection, resources, applications };
}

export type CleanupSuggestion = {
  id: string;
  kind:
    | 'redundant-assignment'
    | 'unused-role'
    | 'duplicate-grant'
    | 'undefined-resource'
    | 'unknown-role';
  subject: string;
  title: string;
  explanation: string;
  details: string[];
};

/** These are configuration cleanup candidates; application-activated roles may be absent. */
export function cleanupSuggestions(snapshot: AccessSnapshot): CleanupSuggestion[] {
  const rows: CleanupSuggestion[] = [];
  const roles = new Map(snapshot.roles.map((role) => [role.Name, role]));
  const resources = new Set(snapshot.resources.map((resource) => resource.Name));
  const used = new Set<string>();
  for (const user of snapshot.users) {
    const access = explainAccount(snapshot, user);
    for (const role of [...access.ordinaryRoles, ...access.conditionalRoles]) used.add(role);
    if (access.unknown.length || !user.Enabled) continue;
    for (const role of user.Roles) {
      if (role.startsWith('%')) continue;
      const without = explainAccount(snapshot, {
        ...user,
        Roles: user.Roles.filter((value) => value !== role),
      });
      if (without.ordinaryRoles.includes(role))
        rows.push({
          id: 'redundant:' + JSON.stringify([user.Name, role]),
          kind: 'redundant-assignment',
          subject: user.Name,
          title: role + ' is also inherited',
          explanation:
            'Another assigned role reaches this role without escalation. Removing the direct assignment would retain this declared role path in this capture.',
          details: [role, ...without.ordinaryRoles],
        });
    }
  }
  for (const role of snapshot.roles) {
    if (!used.has(role.Name) && !role.Name.startsWith('%'))
      rows.push({
        id: 'unused:' + role.Name,
        kind: 'unused-role',
        subject: role.Name,
        title: 'No captured account reaches this role',
        explanation:
          'This is not proof the role is unused. Applications, dynamic assignments and sources outside this capture may activate it.',
        details: snapshot.warnings.length ? ['Capture is incomplete.'] : [],
      });
    const seen = new Set<string>();
    for (const grant of role.Resources) {
      if (seen.has(grant.Name))
        rows.push({
          id: 'duplicate:' + JSON.stringify([role.Name, grant.Name]),
          kind: 'duplicate-grant',
          subject: role.Name,
          title: 'Repeated resource grant: ' + grant.Name,
          explanation: 'Inspect the resource entries before consolidating permissions.',
          details: role.Resources.filter((item) => item.Name === grant.Name).map(
            (item) => item.Permissions,
          ),
        });
      seen.add(grant.Name);
      if (!resources.has(grant.Name))
        rows.push({
          id: 'resource:' + JSON.stringify([role.Name, grant.Name]),
          kind: 'undefined-resource',
          subject: role.Name,
          title: 'Resource definition not captured: ' + grant.Name,
          explanation:
            'Check capture limits and permissions before treating this as a missing definition.',
          details: [grant.Permissions],
        });
    }
    for (const inherited of role.GrantedRoles)
      if (!roles.has(inherited))
        rows.push({
          id: 'unknown-role:' + JSON.stringify([role.Name, inherited]),
          kind: 'unknown-role',
          subject: role.Name,
          title: 'Inherited role not captured: ' + inherited,
          explanation:
            'Its grants are unknown. Do not assume an absent definition grants no access.',
          details: [],
        });
  }
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

export function resourceCoverage(
  snapshot: AccessSnapshot,
  resourceName: string,
  required: PermissionLetter,
) {
  const resource = snapshot.resources.find((item) => item.Name === resourceName);
  const publicGrant = permissions(resource?.PublicPermission || '').includes(required);
  return snapshot.users.map((user) => {
    const access = explainAccount(snapshot, user);
    const sources = access.grants.filter(
      (grant) => grant.resource === resourceName && grant.permissions.includes(required),
    );
    return {
      account: user.Name,
      enabled: user.Enabled,
      status: Object.hasOwn(user, 'unavailable')
        ? 'unknown'
        : !user.Enabled
          ? 'disabled'
          : publicGrant
            ? 'public grant'
            : access.broad === 'ordinary'
              ? '%All role'
              : sources.some((grant) => !grant.conditional)
                ? 'ordinary grant'
                : access.broad === 'conditional' || sources.some((grant) => grant.conditional)
                  ? 'conditional grant'
                  : !resource || access.unknown.length
                    ? 'unknown'
                    : 'not observed',
      sources,
      warnings: access.unknown,
    };
  });
}

export function roleCycles(snapshot: AccessSnapshot): string[][] {
  const roles = new Map(snapshot.roles.map((role) => [role.Name, role]));
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let counter = 0;
  const visit = (name: string) => {
    index.set(name, counter);
    low.set(name, counter++);
    stack.push(name);
    onStack.add(name);
    for (const child of roles.get(name)?.GrantedRoles || []) {
      if (!roles.has(child)) continue;
      if (!index.has(child)) {
        visit(child);
        low.set(name, Math.min(low.get(name)!, low.get(child)!));
      } else if (onStack.has(child)) low.set(name, Math.min(low.get(name)!, index.get(child)!));
    }
    if (low.get(name) === index.get(name)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== name);
      if (component.length > 1 || roles.get(name)?.GrantedRoles.includes(name))
        components.push(component.sort());
    }
  };
  for (const role of snapshot.roles) if (!index.has(role.Name)) visit(role.Name);
  return components;
}

export function analysisSummary(snapshot: AccessSnapshot) {
  const accounts = snapshot.users.map((user) => explainAccount(snapshot, user));
  const knownEnabled = accounts.filter((account) => account.enabled && !account.unknown.length);
  return {
    accounts: accounts.length,
    enabled: snapshot.users.filter((user) => user.Enabled && !Object.hasOwn(user, 'unavailable'))
      .length,
    unreadable: snapshot.users.filter((user) => Object.hasOwn(user, 'unavailable')).length,
    ordinaryBroad: knownEnabled.filter((account) => account.broad === 'ordinary').length,
    conditionalBroad: knownEnabled.filter((account) => account.broad === 'conditional').length,
    publicWriteResources: snapshot.resources.filter((resource) =>
      permissions(resource.PublicPermission).includes('W'),
    ).length,
    guestApplications: snapshot.apps.filter(
      (app) => !Object.hasOwn(app, 'unavailable') && app.Enabled && Boolean(app.AutheEnabled & 64),
    ).length,
    cycles: roleCycles(snapshot),
    cleanup: cleanupSuggestions(snapshot),
    warnings: snapshot.warnings,
  };
}
