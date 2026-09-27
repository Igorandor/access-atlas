import { z } from 'zod';
import { parseSnapshot } from './snapshot-schema.js';
import { canonical, type AccessSnapshot } from './access-model.js';
import { accountResources, explainAccount } from './access-analysis.js';
const name = z.string().min(1).max(512);
export const simulationChangeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('account-role'),
      account: name,
      role: name,
      mode: z.enum(['assign', 'remove']),
      escalation: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal('account-state'), account: name, enabled: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal('role-inheritance'),
      role: name,
      inherited: name,
      mode: z.enum(['assign', 'remove']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('resource-grant'),
      role: name,
      resource: name,
      permissions: z.string().regex(/^(?:R?W?U?)$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('public-grant'),
      resource: name,
      permissions: z.string().regex(/^(?:R?W?U?)$/),
    })
    .strict(),
]);
export const simulationPlanSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(160),
    instance: name,
    changes: z.array(simulationChangeSchema).min(1).max(40),
  })
  .strict();
export type SimulationChange = z.infer<typeof simulationChangeSchema>;
export type SimulationPlan = z.infer<typeof simulationPlanSchema>;

export function simulateAccess(snapshot: AccessSnapshot, changes: SimulationChange[]) {
  const after = parseSnapshot(structuredClone(snapshot));
  z.array(simulationChangeSchema).max(40).parse(changes);
  for (const change of changes) {
    if (change.kind === 'account-role' || change.kind === 'account-state') {
      const account = after.users.find((user) => user.Name === change.account);
      if (!account || Object.hasOwn(account, 'unavailable'))
        throw new Error('Account must have readable details: ' + change.account);
      if (change.kind === 'account-state') {
        account.Enabled = change.enabled;
        continue;
      }
      const role = after.roles.find((item) => item.Name === change.role);
      if (!role || Object.hasOwn(role, 'unavailable'))
        throw new Error('Role must have readable details: ' + change.role);
      const key = change.escalation ? 'EscalationRoles' : 'Roles';
      account[key] =
        change.mode === 'assign'
          ? [...new Set([...account[key], change.role])]
          : account[key].filter((role) => role !== change.role);
    } else if (change.kind === 'public-grant') {
      const resource = after.resources.find((item) => item.Name === change.resource);
      if (!resource) throw new Error('Resource was not captured: ' + change.resource);
      resource.PublicPermission = change.permissions;
    } else {
      const role = after.roles.find((item) => item.Name === change.role);
      if (!role || Object.hasOwn(role, 'unavailable'))
        throw new Error('Role must have readable details: ' + change.role);
      if (change.kind === 'role-inheritance') {
        if (!after.roles.some((item) => item.Name === change.inherited))
          throw new Error('Inherited role was not captured.');
        role.GrantedRoles =
          change.mode === 'assign'
            ? [...new Set([...role.GrantedRoles, change.inherited])]
            : role.GrantedRoles.filter((item) => item !== change.inherited);
      } else {
        if (!after.resources.some((item) => item.Name === change.resource))
          throw new Error('Resource was not captured.');
        role.Resources = role.Resources.filter((item) => item.Name !== change.resource);
        if (change.permissions)
          role.Resources.push({ Name: change.resource, Permissions: change.permissions });
      }
    }
  }
  const accounts = snapshot.users.map((user) => {
    const changed = after.users.find((item) => item.Name === user.Name)!;
    const beforeAccess = explainAccount(snapshot, user);
    const afterAccess = explainAccount(after, changed);
    const beforeResources = accountResources(snapshot, beforeAccess);
    const afterResources = accountResources(after, afterAccess);
    const rows = beforeResources
      .map((resource) => {
        const next = afterResources.find((item) => item.name === resource.name)!;
        return {
          name: resource.name,
          before: resource,
          after: next,
          changed:
            resource.ordinary !== next.ordinary ||
            resource.conditional !== next.conditional ||
            resource.public !== next.public,
        };
      })
      .filter((row) => row.changed);
    const assignedChanged =
      canonical(user.Roles) !== canonical(changed.Roles) ||
      canonical(user.EscalationRoles) !== canonical(changed.EscalationRoles);
    return {
      name: user.Name,
      enabledBefore: user.Enabled,
      enabledAfter: changed.Enabled,
      broadBefore: beforeAccess.broad,
      broadAfter: afterAccess.broad,
      assignedChanged,
      resources: rows,
      warnings: [...new Set([...beforeAccess.unknown, ...afterAccess.unknown])],
      changed:
        assignedChanged ||
        user.Enabled !== changed.Enabled ||
        beforeAccess.broad !== afterAccess.broad ||
        rows.length > 0,
    };
  });
  return { projected: after, accounts, affected: accounts.filter((account) => account.changed) };
}
