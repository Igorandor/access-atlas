import { z } from 'zod';
import { canonical, permissions, type AccessSnapshot } from './access-model.js';
import { explainAccount, roleCycles, type AccountAccess } from './access-analysis.js';

const name = z.string().trim().min(1).max(512);
const scopeSchema = z
  .object({
    names: z.array(name).max(50),
    prefix: z.string().max(128),
    includeDisabled: z.boolean(),
  })
  .strict();
const common = {
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  severity: z.enum(['high', 'medium', 'low']),
  enabled: z.boolean(),
  scope: scopeSchema,
  rationale: z.string().max(2000),
};
export const reviewPolicySchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...common,
      kind: z.literal('account-roles'),
      roles: z.array(name).min(1).max(20),
      requirement: z.enum(['all', 'any', 'none']),
      includeEscalation: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('account-resource'),
      resource: name,
      prohibited: z.string().regex(/^[RWU]{1,3}$/),
      includeEscalation: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('public-resource'),
      prohibited: z.string().regex(/^[RWU]{1,3}$/),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('application-entry'),
      requireAuthentication: z.boolean(),
      requireResource: z.boolean(),
      namespaces: z.array(name).max(30),
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal('role-inheritance'),
      maximumDepth: z.number().int().min(1).max(30),
      prohibitedRoles: z.array(name).max(20),
    })
    .strict(),
]);
export const reviewPoliciesSchema = z
  .array(reviewPolicySchema)
  .max(30)
  .refine(
    (rules) => new Set(rules.map((rule) => rule.id)).size === rules.length,
    'Policy IDs must be unique.',
  );
export type ReviewPolicy = z.infer<typeof reviewPolicySchema>;
export type PolicyResult = {
  id: string;
  policyId: string;
  policy: string;
  kind: ReviewPolicy['kind'];
  severity: ReviewPolicy['severity'];
  target: string;
  entity: 'account' | 'resource' | 'application' | 'role';
  result: 'pass' | 'finding' | 'conditional' | 'unknown' | 'excluded';
  explanation: string;
  paths: string[][];
  facts: Array<{ label: string; value: string }>;
  fingerprint: string;
};
function selected(scope: ReviewPolicy['scope'], name: string) {
  return (
    (!scope.names.length || scope.names.includes(name)) &&
    (!scope.prefix || name.startsWith(scope.prefix))
  );
}
function policyRow(
  policy: ReviewPolicy,
  target: string,
  entity: PolicyResult['entity'],
  result: PolicyResult['result'],
  explanation: string,
  paths: string[][] = [],
  facts: PolicyResult['facts'] = [],
): PolicyResult {
  const row = {
    id: policy.id + ':' + entity + ':' + target,
    policyId: policy.id,
    policy: policy.title,
    kind: policy.kind,
    severity: policy.severity,
    target,
    entity,
    result,
    explanation,
    paths,
    facts,
  };
  return { ...row, fingerprint: canonical(row) };
}
function rolePaths(access: AccountAccess, roles: string[]) {
  return access.grants
    .filter((grant) => roles.some((role) => grant.path.includes(role)))
    .map((grant) => grant.path);
}
export function evaluatePolicies(snapshot: AccessSnapshot, input: unknown): PolicyResult[] {
  const policies = reviewPoliciesSchema.parse(input).filter((policy) => policy.enabled);
  const accounts = new Map(
    snapshot.users.map((user) => [user.Name, explainAccount(snapshot, user)]),
  );
  const definitions = new Map(snapshot.roles.map((role) => [role.Name, role]));
  const cycles = roleCycles(snapshot);
  const rows: PolicyResult[] = [];
  for (const policy of policies) {
    if (policy.kind === 'account-roles' || policy.kind === 'account-resource') {
      for (const user of snapshot.users.filter((user) => selected(policy.scope, user.Name))) {
        if (Object.hasOwn(user, 'unavailable')) {
          rows.push(
            policyRow(
              policy,
              user.Name,
              'account',
              'unknown',
              'Account details could not be read.',
            ),
          );
          continue;
        }
        if (!user.Enabled && !policy.scope.includeDisabled) {
          rows.push(
            policyRow(
              policy,
              user.Name,
              'account',
              'excluded',
              'This policy excludes disabled accounts.',
            ),
          );
          continue;
        }
        const access = accounts.get(user.Name)!;
        if (policy.kind === 'account-roles') {
          const ordinary = policy.roles.filter((role) => access.ordinaryRoles.includes(role));
          const conditional = policy.roles.filter(
            (role) => !ordinary.includes(role) && access.conditionalRoles.includes(role),
          );
          const observed = policy.includeEscalation ? [...ordinary, ...conditional] : ordinary;
          const condition =
            policy.requirement === 'none'
              ? observed.length === 0
              : policy.requirement === 'all'
                ? observed.length === policy.roles.length
                : observed.length > 0;
          const missing = policy.roles.some(
            (role) =>
              !definitions.has(role) || Object.hasOwn(definitions.get(role)!, 'unavailable'),
          );
          const uncertain = missing || access.unknown.length > 0;
          const conditionalChangesOutcome =
            policy.includeEscalation &&
            conditional.length > 0 &&
            (policy.requirement === 'none'
              ? ordinary.length === 0
              : policy.requirement === 'all'
                ? ordinary.length < policy.roles.length
                : ordinary.length === 0);
          const status: PolicyResult['result'] = conditionalChangesOutcome
            ? 'conditional'
            : condition
              ? uncertain
                ? 'unknown'
                : 'pass'
              : uncertain && policy.requirement !== 'none'
                ? 'unknown'
                : 'finding';
          rows.push(
            policyRow(
              policy,
              user.Name,
              'account',
              status,
              'Requirement: ' +
                policy.requirement +
                ' of [' +
                policy.roles.join(', ') +
                ']. Ordinary memberships: ' +
                (ordinary.join(', ') || 'none') +
                '. Conditional memberships: ' +
                (conditional.join(', ') || 'none') +
                (uncertain ? '. Missing definitions prevent a complete conclusion.' : '.'),
              rolePaths(access, observed),
              [
                { label: 'Requirement', value: policy.requirement },
                { label: 'Ordinary', value: ordinary.join(', ') },
                { label: 'Conditional', value: conditional.join(', ') },
              ],
            ),
          );
        } else {
          const resource = snapshot.resources.find((item) => item.Name === policy.resource);
          const letters = permissions(policy.prohibited);
          const publicMatch = permissions(resource?.PublicPermission || '')
            .split('')
            .filter((letter) => letters.includes(letter));
          const sources = access.grants.filter(
            (grant) =>
              grant.resource === policy.resource &&
              grant.permissions.split('').some((letter) => letters.includes(letter)),
          );
          const ordinary = sources.filter((grant) => !grant.conditional);
          const conditional = sources.filter((grant) => grant.conditional);
          const status: PolicyResult['result'] =
            publicMatch.length || ordinary.length || access.broad === 'ordinary'
              ? 'finding'
              : policy.includeEscalation && (conditional.length || access.broad === 'conditional')
                ? 'conditional'
                : !resource || access.unknown.length
                  ? 'unknown'
                  : 'pass';
          rows.push(
            policyRow(
              policy,
              user.Name,
              'account',
              status,
              'Checks declared ' +
                letters +
                ' access to ' +
                policy.resource +
                '. ' +
                (publicMatch.length ? 'The resource has matching public permissions. ' : '') +
                (access.broad !== 'not observed'
                  ? '%All is reachable through ' + access.broad + ' roles. '
                  : '') +
                (status === 'pass'
                  ? 'No matching grant was observed; runtime access is not evaluated.'
                  : 'Inspect the listed role paths and runtime policy.'),
              sources.map((source) => source.path),
              [
                { label: 'Resource', value: policy.resource },
                { label: 'Public', value: publicMatch.join('') },
                { label: '%All', value: access.broad },
              ],
            ),
          );
        }
      }
    } else if (policy.kind === 'public-resource') {
      for (const resource of snapshot.resources.filter((resource) =>
        selected(policy.scope, resource.Name),
      )) {
        const matched = permissions(resource.PublicPermission)
          .split('')
          .filter((letter) => policy.prohibited.includes(letter));
        rows.push(
          policyRow(
            policy,
            resource.Name,
            'resource',
            matched.length ? 'finding' : 'pass',
            matched.length
              ? 'Public permissions include prohibited ' + matched.join('') + '.'
              : 'The captured public permission does not include ' + policy.prohibited + '.',
            [],
            [{ label: 'Public permission', value: resource.PublicPermission || 'none' }],
          ),
        );
      }
    } else if (policy.kind === 'application-entry') {
      for (const app of snapshot.apps.filter((app) => selected(policy.scope, app.Name))) {
        if (Object.hasOwn(app, 'unavailable')) {
          rows.push(
            policyRow(
              policy,
              app.Name,
              'application',
              'unknown',
              'Application details are unavailable.',
            ),
          );
          continue;
        }
        if (!app.Enabled && !policy.scope.includeDisabled) {
          rows.push(
            policyRow(
              policy,
              app.Name,
              'application',
              'excluded',
              'This policy excludes disabled applications.',
            ),
          );
          continue;
        }
        const problems: string[] = [];
        if (policy.requireAuthentication && Boolean(app.AutheEnabled & 64))
          problems.push('Unauthenticated entry is enabled.');
        if (policy.requireResource && !app.Resource)
          problems.push('No entry resource is configured.');
        if (policy.namespaces.length && !policy.namespaces.includes(app.NameSpace))
          problems.push('The namespace is outside this policy list.');
        const resourceMissing =
          !!app.Resource && !snapshot.resources.some((resource) => resource.Name === app.Resource);
        const noKnownAuthentication = policy.requireAuthentication && app.AutheEnabled === 0;
        rows.push(
          policyRow(
            policy,
            app.Name,
            'application',
            problems.length
              ? 'finding'
              : resourceMissing || noKnownAuthentication
                ? 'unknown'
                : 'pass',
            problems.join(' ') ||
              (resourceMissing
                ? 'The configured entry resource was not captured.'
                : noKnownAuthentication
                  ? 'No authentication flags are present; confirm the application authentication behavior.'
                  : 'The captured entry configuration matches this policy. Application-internal authorization is not evaluated.'),
            [],
            [
              { label: 'Namespace', value: app.NameSpace },
              { label: 'Entry resource', value: app.Resource },
              { label: 'Authentication flags', value: String(app.AutheEnabled) },
            ],
          ),
        );
      }
    } else {
      for (const role of snapshot.roles.filter((role) => selected(policy.scope, role.Name))) {
        const access = explainAccount(snapshot, {
          Name: role.Name,
          Enabled: true,
          Roles: [role.Name],
          EscalationRoles: [],
        });
        const cycle = cycles.find((component) =>
          component.some(
            (name) => access.ordinaryRoles.includes(name) || access.conditionalRoles.includes(name),
          ),
        );
        const depths = new Map<string, number>();
        const queue = [{ name: role.Name, depth: 0 }];
        let exceeded = false;
        for (let index = 0; index < queue.length; index++) {
          const current = queue[index];
          if (current.depth > policy.maximumDepth) {
            exceeded = true;
            continue;
          }
          if ((depths.get(current.name) ?? -1) >= current.depth) continue;
          depths.set(current.name, current.depth);
          for (const child of definitions.get(current.name)?.GrantedRoles || [])
            queue.push({ name: child, depth: current.depth + 1 });
        }
        const prohibited = policy.prohibitedRoles.filter(
          (name) =>
            name !== role.Name &&
            (access.ordinaryRoles.includes(name) || access.conditionalRoles.includes(name)),
        );
        const unknown = access.unknown.length > 0 || !!cycle;
        rows.push(
          policyRow(
            policy,
            role.Name,
            'role',
            prohibited.length || exceeded ? 'finding' : unknown ? 'unknown' : 'pass',
            [
              prohibited.length ? 'Reaches prohibited roles: ' + prohibited.join(', ') + '.' : '',
              exceeded ? 'An inheritance path exceeds ' + policy.maximumDepth + ' edges.' : '',
              cycle ? 'Contains a cycle: ' + cycle.join(', ') + '.' : '',
              unknown ? 'Missing or cyclic configuration limits the analysis.' : '',
              !prohibited.length && !exceeded && !unknown
                ? 'Captured inheritance is within the configured boundary.'
                : '',
            ]
              .filter(Boolean)
              .join(' '),
            [],
            [
              { label: 'Maximum depth', value: String(policy.maximumDepth) },
              { label: 'Prohibited roles reached', value: prohibited.join(', ') },
            ],
          ),
        );
      }
    }
    // A scope that matched nothing must be visible; silently returning zero findings is misleading.
    if (!rows.some((row) => row.policyId === policy.id))
      rows.push(
        policyRow(
          policy,
          '(no matching records)',
          policy.kind.startsWith('account')
            ? 'account'
            : policy.kind === 'public-resource'
              ? 'resource'
              : policy.kind === 'application-entry'
                ? 'application'
                : 'role',
          'unknown',
          'The scope matched no captured records. Check names, prefixes and capture completeness.',
        ),
      );
  }
  return rows;
}
