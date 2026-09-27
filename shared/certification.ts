import { z } from 'zod';
import { canonical, type AccessSnapshot } from './access-model.js';
import { explainAccount, accountResources, roleImpact } from './access-analysis.js';
import { reviewDateSchema } from './review-date.js';

export const certificationKindSchema = z.enum(['accounts', 'roles', 'resources', 'applications']);
export type CertificationKind = z.infer<typeof certificationKindSchema>;
export const certificationScopeSchema = z
  .object({
    enabled: z.boolean(),
    kinds: z.array(certificationKindSchema).min(1).max(4),
    prefix: z.string().max(128),
    includeDisabled: z.boolean(),
    dueDate: reviewDateSchema.optional(),
  })
  .strict();
export type CertificationScope = z.infer<typeof certificationScopeSchema>;
export const certificationSchema = z
  .object({
    kind: certificationKindSchema,
    name: z.string().min(1).max(512),
    captureId: z.string().uuid(),
    outcome: z.enum(['retain', 'change', 'remove', 'investigate', 'exception']),
    note: z.string().trim().min(1).max(4000),
    reviewedAt: z.string().datetime(),
    dueDate: reviewDateSchema.optional(),
  })
  .strict();
export type Certification = z.infer<typeof certificationSchema>;
export type CertificationSubject = {
  kind: CertificationKind;
  name: string;
  description: string;
  state: 'enabled' | 'disabled' | 'configured' | 'unknown';
  unknown: string[];
  facts: Array<{ label: string; value: string }>;
};
export const defaultCertificationScope: CertificationScope = {
  enabled: false,
  kinds: ['accounts'],
  prefix: '',
  includeDisabled: false,
};
export function certificationSubjects(
  snapshot: AccessSnapshot,
  scope: CertificationScope,
): CertificationSubject[] {
  if (!scope.enabled) return [];
  const rows: CertificationSubject[] = [];
  if (scope.kinds.includes('accounts'))
    for (const user of snapshot.users) {
      if (!user.Enabled && !Object.hasOwn(user, 'unavailable') && !scope.includeDisabled) continue;
      const access = explainAccount(snapshot, user);
      rows.push({
        kind: 'accounts',
        name: user.Name,
        description: 'Account role assignments and reachable resource grants',
        state: Object.hasOwn(user, 'unavailable')
          ? 'unknown'
          : user.Enabled
            ? 'enabled'
            : 'disabled',
        unknown: access.unknown,
        facts: [
          { label: 'Direct roles', value: user.Roles.join(', ') },
          { label: 'Escalation roles', value: user.EscalationRoles.join(', ') },
          { label: 'Ordinary %All', value: String(access.broad === 'ordinary') },
          {
            label: 'Reachable role count',
            value: String(new Set([...access.ordinaryRoles, ...access.conditionalRoles]).size),
          },
        ],
      });
    }
  if (scope.kinds.includes('roles'))
    for (const role of snapshot.roles) {
      rows.push({
        kind: 'roles',
        name: role.Name,
        description: role.Description,
        state: Object.hasOwn(role, 'unavailable') ? 'unknown' : 'configured',
        unknown: Object.hasOwn(role, 'unavailable') ? ['Role details could not be read.'] : [],
        facts: [
          { label: 'Inherited roles', value: role.GrantedRoles.join(', ') },
          { label: 'Resource grants', value: String(role.Resources.length) },
          { label: 'Escalation only', value: String(role.EscalationOnly) },
        ],
      });
    }
  if (scope.kinds.includes('resources'))
    for (const resource of snapshot.resources) {
      rows.push({
        kind: 'resources',
        name: resource.Name,
        description: resource.ResourceType,
        state: 'configured',
        unknown: [],
        facts: [
          { label: 'Public permission', value: resource.PublicPermission || 'None' },
          {
            label: 'Direct role references',
            value: String(
              snapshot.roles.filter((role) =>
                role.Resources.some((grant) => grant.Name === resource.Name),
              ).length,
            ),
          },
          {
            label: 'Application entry references',
            value: String(snapshot.apps.filter((app) => app.Resource === resource.Name).length),
          },
        ],
      });
    }
  if (scope.kinds.includes('applications'))
    for (const app of snapshot.apps) {
      if (!app.Enabled && !Object.hasOwn(app, 'unavailable') && !scope.includeDisabled) continue;
      rows.push({
        kind: 'applications',
        name: app.Name,
        description: app.NameSpace,
        state: Object.hasOwn(app, 'unavailable') ? 'unknown' : app.Enabled ? 'enabled' : 'disabled',
        unknown: Object.hasOwn(app, 'unavailable')
          ? ['Application details could not be read.']
          : [],
        facts: [
          { label: 'Namespace', value: app.NameSpace },
          { label: 'Entry resource', value: app.Resource || 'None' },
          { label: 'Authentication flags', value: String(app.AutheEnabled) },
          { label: 'Unauthenticated entry', value: String(Boolean(app.AutheEnabled & 64)) },
        ],
      });
    }
  return rows.filter((row) => !scope.prefix || row.name.startsWith(scope.prefix));
}

/** Carry-forward compares dependency data as well as the object's own properties. */
export function certificationEvidence(
  snapshot: AccessSnapshot,
  kind: CertificationKind,
  name: string,
): unknown {
  switch (kind) {
    case 'accounts': {
      const user = snapshot.users.find((item) => item.Name === name);
      if (!user) return undefined;
      const access = explainAccount(snapshot, user);
      const reachable = new Set([...access.ordinaryRoles, ...access.conditionalRoles]);
      const roleDefinitions = snapshot.roles.filter((role) => reachable.has(role.Name));
      return {
        user,
        roles: roleDefinitions,
        resources: accountResources(snapshot, access),
        warnings: access.unknown,
      };
    }
    case 'roles': {
      const role = snapshot.roles.find((item) => item.Name === name);
      if (!role) return undefined;
      const impact = roleImpact(snapshot, name);
      return {
        role,
        parents: impact.directParents,
        accounts: impact.accounts,
        resources: impact.resources,
        applications: impact.applications,
        warnings: impact.projection.unknown,
      };
    }
    case 'resources': {
      const resource = snapshot.resources.find((item) => item.Name === name);
      if (!resource) return undefined;
      return {
        resource,
        roles: snapshot.roles.filter((role) => role.Resources.some((grant) => grant.Name === name)),
        apps: snapshot.apps.filter((app) => app.Resource === name),
      };
    }
    case 'applications': {
      const app = snapshot.apps.find((item) => item.Name === name);
      if (!app) return undefined;
      return {
        app,
        resource: snapshot.resources.find((resource) => resource.Name === app.Resource),
        roles: snapshot.roles.filter((role) =>
          role.Resources.some((grant) => grant.Name === app.Resource),
        ),
      };
    }
  }
}

export function certificationCoverage(
  snapshot: AccessSnapshot,
  captureId: string,
  scope: CertificationScope,
  decisions: Certification[],
) {
  const subjects = certificationSubjects(snapshot, scope);
  const current = new Map(
    decisions.map((decision) => [JSON.stringify([decision.kind, decision.name]), decision]),
  );
  const rows = subjects.map((subject) => {
    const previous = current.get(JSON.stringify([subject.kind, subject.name]));
    const decision = previous?.captureId === captureId ? previous : undefined;
    return { subject, decision, outdated: Boolean(previous && !decision) };
  });
  return {
    rows,
    total: rows.length,
    decided: rows.filter((row) => row.decision).length,
    pending: rows.filter((row) => !row.decision).length,
    unresolved: rows.filter(
      (row) => row.decision && !['retain', 'exception'].includes(row.decision.outcome),
    ).length,
    unknown: rows.filter((row) => row.subject.unknown.length > 0).length,
    complete:
      scope.enabled &&
      snapshot.warnings.length === 0 &&
      rows.length > 0 &&
      rows.every(
        (row) =>
          row.subject.unknown.length === 0 &&
          row.decision &&
          ['retain', 'exception'].includes(row.decision.outcome),
      ),
  };
}

export function carryCertifications(options: {
  before: AccessSnapshot;
  after: AccessSnapshot;
  previousCaptureId: string;
  currentCaptureId: string;
  scope: CertificationScope;
  decisions: Certification[];
  at: string;
}) {
  if (options.before.instance !== options.after.instance)
    throw new Error('Captures belong to different instances.');
  if (options.before.warnings.length || options.after.warnings.length)
    throw new Error('Both captures must be complete before carrying decisions forward.');
  const subjects = certificationSubjects(options.after, options.scope);
  const subjectsByKey = new Map(
    subjects.map((subject) => [JSON.stringify([subject.kind, subject.name]), subject]),
  );
  let carried = 0;
  const decisions = options.decisions.map((decision) => {
    const subject = subjectsByKey.get(JSON.stringify([decision.kind, decision.name]));
    if (
      !subject ||
      subject.unknown.length ||
      decision.captureId !== options.previousCaptureId ||
      !['retain', 'exception'].includes(decision.outcome)
    )
      return decision;
    const before = certificationEvidence(options.before, decision.kind, decision.name);
    const after = certificationEvidence(options.after, decision.kind, decision.name);
    if (before === undefined || after === undefined || canonical(before) !== canonical(after))
      return decision;
    carried++;
    return { ...decision, captureId: options.currentCaptureId };
  });
  return { carried, decisions };
}
