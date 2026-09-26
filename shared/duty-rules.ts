import { z } from 'zod';
import { resolveAccess, type AccessSnapshot } from './access-model.js';

const name = z.string().trim().min(1).max(128);
export const dutyRulesSchema = z
  .array(
    z
      .object({
        title: z.string().trim().min(1).max(160),
        left: name,
        right: name,
      })
      .strict()
      .refine((rule) => rule.left !== rule.right, 'Choose two different roles.'),
  )
  .max(20);
export type DutyRule = z.infer<typeof dutyRulesSchema>[number];
export type DutyResult = {
  rule: string;
  user: string;
  status: 'conflict' | 'conditional' | 'unknown' | 'no conflict observed';
  left: string[];
  right: string[];
  explanation: string;
};

/** Review declared role membership only. This never predicts a live authorization decision. */
export function checkDuties(snapshot: AccessSnapshot, input: unknown): DutyResult[] {
  const rules = dutyRulesSchema.parse(input);
  const definitions = new Map(snapshot.roles.map((role) => [role.Name, role]));
  return snapshot.users.flatMap((user) => {
    if (!user.Enabled && !Object.hasOwn(user, 'unavailable')) return [];
    const ordinary = resolveAccess(snapshot, user.Roles);
    const escalated = resolveAccess(snapshot, user.EscalationRoles);
    const path = (role: string) => {
      const direct = ordinary.roles.get(role);
      if (direct && !direct.conditional) return { roles: direct.roles, conditional: false };
      const extra = escalated.roles.get(role);
      return direct ?? (extra ? { roles: extra.roles, conditional: true } : undefined);
    };
    return rules.map((rule) => {
      const left = path(rule.left),
        right = path(rule.right);
      const missing =
        snapshot.warnings.length > 0 ||
        Object.hasOwn(user, 'unavailable') ||
        [...ordinary.warnings, ...escalated.warnings].length > 0 ||
        [rule.left, rule.right].some(
          (role) => !definitions.has(role) || Object.hasOwn(definitions.get(role)!, 'unavailable'),
        );
      const status: DutyResult['status'] =
        left && right && !Object.hasOwn(user, 'unavailable')
          ? left.conditional || right.conditional
            ? 'conditional'
            : 'conflict'
          : missing
            ? 'unknown'
            : 'no conflict observed';
      return {
        rule: rule.title,
        user: user.Name,
        status,
        left: left?.roles ?? [],
        right: right?.roles ?? [],
        explanation:
          status === 'conflict'
            ? 'Both declared roles are reachable through ordinary assignments.'
            : status === 'conditional'
              ? 'Both roles are reachable, but at least one requires an escalation path. Activation is not proven.'
              : status === 'unknown'
                ? 'Missing configuration prevents a complete membership check.'
                : 'This capture does not show both role memberships. This is not proof of denied access; broad privileges and application rules may grant equivalent authority.',
      };
    });
  });
}
