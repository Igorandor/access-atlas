import { z } from 'zod';
import type { AccessSnapshot, AccessUser } from './access-model.js';
import { permissions } from './access-model.js';
import { explainAccount, type AccountAccess, type GrantTrace } from './access-analysis.js';

export const inquirySchema = z
  .object({
    account: z.string().min(1).max(512),
    targetKind: z.enum(['resource', 'application']),
    target: z.string().min(1).max(512),
    permission: z.enum(['R', 'W', 'U']),
  })
  .strict();
export type AccessInquiry = z.infer<typeof inquirySchema>;
export type InquiryDisposition =
  | 'ordinary-grant'
  | 'conditional-grant'
  | 'public-grant'
  | 'broad-role'
  | 'not-observed'
  | 'unknown'
  | 'disabled';
export type InquiryStep = {
  label: string;
  state: 'observed' | 'conditional' | 'unknown' | 'absent' | 'disabled';
  detail: string;
};
export type InquiryResult = {
  request: AccessInquiry;
  instance: string;
  capturedAt: string;
  disposition: InquiryDisposition;
  headline: string;
  steps: InquiryStep[];
  sources: GrantTrace[];
  publicPermissions: string;
  ordinaryPermissions: string;
  conditionalPermissions: string;
  broad: AccountAccess['broad'];
  warnings: string[];
  questions: string[];
  resource: string;
};

const headlines: Record<InquiryDisposition, string> = {
  'ordinary-grant': 'An ordinary role path supplies the requested grant',
  'conditional-grant': 'The grant depends on role escalation',
  'public-grant': 'The resource has the requested public permission',
  'broad-role': 'The account reaches the broad %All role',
  'not-observed': 'No matching grant was found in this capture',
  unknown: 'The available configuration cannot answer this inquiry',
  disabled: 'The selected account or application is disabled',
};

function accountStep(user: AccessUser): InquiryStep {
  if (Object.hasOwn(user, 'unavailable'))
    return {
      label: 'Account',
      state: 'unknown',
      detail: 'Account details could not be read.',
    };
  return {
    label: 'Account',
    state: user.Enabled ? 'observed' : 'disabled',
    detail: user.Enabled
      ? 'The account is configured as enabled.'
      : 'The account is configured as disabled.',
  };
}

/** Configuration explanation only: no impersonation or runtime authorization request. */
export function investigateAccess(snapshot: AccessSnapshot, input: AccessInquiry): InquiryResult {
  const request = inquirySchema.parse(input);
  const user = snapshot.users.find((item) => item.Name === request.account);
  if (!user) throw new Error('Choose an account present in the selected capture.');
  const access = explainAccount(snapshot, user);
  const steps: InquiryStep[] = [accountStep(user)];
  const warnings = new Set(access.unknown);
  const questions = new Set<string>([
    'Confirm the privileges active in the real session, including application roles and runtime policies.',
  ]);
  let resourceName = request.target;
  let permission = request.permission;
  let unavailableTarget = false;
  let disabledTarget = false;
  let noEntryResource = false;
  if (request.targetKind === 'application') {
    const app = snapshot.apps.find((item) => item.Name === request.target);
    if (!app) throw new Error('Choose an application present in the selected capture.');
    resourceName = app.Resource;
    permission = 'U';
    unavailableTarget = Object.hasOwn(app, 'unavailable');
    disabledTarget = !unavailableTarget && !app.Enabled;
    noEntryResource = !app.Resource && !unavailableTarget;
    steps.push({
      label: 'Application',
      state: unavailableTarget ? 'unknown' : disabledTarget ? 'disabled' : 'observed',
      detail: unavailableTarget
        ? 'Application details could not be read.'
        : `${app.Name} is ${app.Enabled ? 'enabled' : 'disabled'} in ${app.NameSpace || 'an unspecified namespace'}.`,
    });
    if (unavailableTarget) warnings.add('Application entry settings are unavailable.');
    else {
      steps.push({
        label: 'Authentication configuration',
        state: app.AutheEnabled & 64 ? 'conditional' : 'observed',
        detail:
          app.AutheEnabled & 64
            ? 'Unauthenticated entry is configured. The selected account may not be the identity used by a guest request.'
            : `Configured authentication bit mask: ${app.AutheEnabled}. Successful authentication has not been tested.`,
      });
      steps.push({
        label: 'Entry resource',
        state: app.Resource ? 'observed' : 'absent',
        detail: app.Resource
          ? `Application entry requires Use on ${app.Resource}.`
          : 'No entry resource is configured; this does not establish authorization inside the application.',
      });
    }
    questions.add(
      'Verify application-specific authorization, added roles, matching roles, session roles and dispatch code.',
    );
    questions.add('Check the web gateway, authentication method and actual request identity.');
  }
  const resource = snapshot.resources.find((item) => item.Name === resourceName);
  const sources = access.grants.filter((grant) => grant.resource === resourceName);
  const ordinaryPermissions = permissions(
    sources
      .filter((grant) => !grant.conditional)
      .map((grant) => grant.permissions)
      .join(''),
  );
  const conditionalPermissions = permissions(
    sources
      .filter((grant) => grant.conditional)
      .map((grant) => grant.permissions)
      .join(''),
  );
  const publicPermissions = permissions(resource?.PublicPermission || '');
  if (resourceName && !resource)
    warnings.add(`Resource ${resourceName} is not present in this capture.`);
  if (resourceName) {
    steps.push({
      label: 'Public permission',
      state: !resource ? 'unknown' : publicPermissions.includes(permission) ? 'observed' : 'absent',
      detail: !resource
        ? 'The resource definition is missing.'
        : `Configured public grants: ${publicPermissions || 'none'}.`,
    });
    steps.push({
      label: 'Ordinary role paths',
      state: ordinaryPermissions.includes(permission)
        ? 'observed'
        : access.unknown.length
          ? 'unknown'
          : 'absent',
      detail: `Explicit resource grants through ordinary paths: ${ordinaryPermissions || 'none observed'}.`,
    });
    steps.push({
      label: 'Escalation paths',
      state: conditionalPermissions.includes(permission)
        ? 'conditional'
        : access.unknown.length
          ? 'unknown'
          : 'absent',
      detail: `Explicit grants through possible escalation: ${conditionalPermissions || 'none observed'}.`,
    });
  }
  steps.push({
    label: 'Broad role',
    state:
      access.broad === 'ordinary'
        ? 'observed'
        : access.broad === 'conditional'
          ? 'conditional'
          : 'absent',
    detail:
      access.broad === 'not observed'
        ? '%All was not observed among reachable roles.'
        : `%All is reachable through an ${access.broad} role path. It is not expanded into fabricated resource grants.`,
  });
  let disposition: InquiryDisposition;
  if ((!Object.hasOwn(user, 'unavailable') && !user.Enabled) || disabledTarget)
    disposition = 'disabled';
  else if (Object.hasOwn(user, 'unavailable') || unavailableTarget || noEntryResource || !resource)
    disposition = 'unknown';
  else if (publicPermissions.includes(permission)) disposition = 'public-grant';
  else if (ordinaryPermissions.includes(permission)) disposition = 'ordinary-grant';
  else if (access.broad === 'ordinary') disposition = 'broad-role';
  else if (conditionalPermissions.includes(permission) || access.broad === 'conditional')
    disposition = 'conditional-grant';
  else if (warnings.size) disposition = 'unknown';
  else disposition = 'not-observed';
  if (disposition === 'conditional-grant')
    questions.add(
      'Determine whether the escalation path is permitted and activated for this operation.',
    );
  if (disposition === 'disabled')
    questions.add(
      'Check existing sessions independently; configured disablement is not a session-termination test.',
    );
  if (disposition === 'not-observed')
    questions.add(
      'Investigate application-added roles and policies before treating the missing grant as a denial.',
    );
  return {
    request: { ...request, permission },
    instance: snapshot.instance,
    capturedAt: snapshot.capturedAt,
    disposition,
    headline: headlines[disposition],
    steps,
    sources,
    publicPermissions,
    ordinaryPermissions,
    conditionalPermissions,
    broad: access.broad,
    warnings: [...warnings],
    questions: [...questions],
    resource: resourceName,
  };
}

export const inquiryBatchSchema = z
  .object({
    format: z.literal('atlas-access-inquiries-1'),
    instance: z.string().min(1).max(1024),
    title: z.string().trim().min(1).max(160),
    inquiries: z.array(inquirySchema).min(1).max(50),
  })
  .strict();
export type InquiryBatch = z.infer<typeof inquiryBatchSchema>;

export function runInquiryBatch(snapshot: AccessSnapshot, batch: InquiryBatch) {
  const parsed = inquiryBatchSchema.parse(batch);
  if (parsed.instance !== snapshot.instance)
    throw new Error('This inquiry list belongs to a different configured instance.');
  return parsed.inquiries.map((query) => {
    try {
      return { query, result: investigateAccess(snapshot, query), error: '' };
    } catch (failure) {
      return { query, result: undefined, error: (failure as Error).message };
    }
  });
}

export function inquiryKey(query: AccessInquiry) {
  return JSON.stringify([
    query.account,
    query.targetKind,
    query.target,
    query.targetKind === 'application' ? 'U' : query.permission,
  ]);
}

export function inquiryCsv(results: ReturnType<typeof runInquiryBatch>) {
  const cell = (value: string) => {
    const plain = /^(?:\s*[=+@\-]|[\t\r\n])/.test(value) ? "'" + value : value;
    return '"' + plain.replaceAll('"', '""') + '"';
  };
  const rows = results.map(({ query, result, error }) => [
    query.account,
    query.targetKind,
    query.target,
    query.targetKind === 'application' ? 'U' : query.permission,
    result?.disposition || 'unavailable',
    result?.resource || '',
    result?.ordinaryPermissions || '',
    result?.conditionalPermissions || '',
    result?.publicPermissions || '',
    result?.broad || '',
    result?.warnings.join(' | ') || error,
  ]);
  return [
    [
      'Account',
      'Target kind',
      'Target',
      'Permission',
      'Observation',
      'Resource',
      'Ordinary',
      'Conditional',
      'Public',
      'Broad role',
      'Warnings',
    ],
    ...rows,
  ]
    .map((row) => row.map(cell).join(','))
    .join('\r\n');
}

export type EntitlementCandidate = {
  role: string;
  permissions: string;
  inherited: boolean;
  escalationOnly: boolean;
  additionalResources: number;
  reachesAll: boolean;
  incomplete: boolean;
  path: string[];
};

/** Candidate roles are a discovery aid, never an automatic assignment recommendation. */
export function candidateRoles(
  snapshot: AccessSnapshot,
  resource: string,
  permission: 'R' | 'W' | 'U',
): EntitlementCandidate[] {
  const result: EntitlementCandidate[] = [];
  for (const role of snapshot.roles) {
    if (Object.hasOwn(role, 'unavailable')) continue;
    const projection = explainAccount(snapshot, {
      Name: '(role projection)',
      Enabled: true,
      Roles: [role.Name],
      EscalationRoles: [],
    });
    const matches = projection.grants.filter(
      (grant) => grant.resource === resource && grant.permissions.includes(permission),
    );
    if (!matches.length) continue;
    const shortest = [...matches].sort(
      (left, right) =>
        Number(left.conditional) - Number(right.conditional) ||
        left.path.length - right.path.length,
    )[0];
    result.push({
      role: role.Name,
      permissions: permissions(matches.map((grant) => grant.permissions).join('')),
      inherited: shortest.path.length > 1,
      escalationOnly: shortest.conditional,
      additionalResources: new Set(
        projection.grants
          .filter((grant) => grant.resource !== resource)
          .map((grant) => grant.resource),
      ).size,
      reachesAll: projection.broad !== 'not observed',
      incomplete: projection.unknown.length > 0,
      path: shortest.path,
    });
  }
  return result.sort(
    (left, right) =>
      Number(left.reachesAll) - Number(right.reachesAll) ||
      left.additionalResources - right.additionalResources ||
      left.role.localeCompare(right.role),
  );
}
