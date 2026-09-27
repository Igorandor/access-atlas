import {
  canonical,
  permissions,
  type AccessSnapshot,
  type AccessUser,
  type Finding,
  findings,
} from './access-model.js';
import {
  explainAccount,
  accountResources,
  type AccountAccess,
  type ResourceAccess,
} from './access-analysis.js';

export type DriftKind = 'account' | 'role' | 'resource' | 'application';
export type DriftField = { field: string; before: unknown; after: unknown };
export type ConfigurationChange = {
  kind: DriftKind;
  name: string;
  change: 'added' | 'removed' | 'changed' | 'unknown';
  fields: DriftField[];
  explanation: string;
};
export type GrantMovement = {
  resource: string;
  ordinaryAdded: string;
  ordinaryRemoved: string;
  conditionalAdded: string;
  conditionalRemoved: string;
  publicAdded: string;
  publicRemoved: string;
  before: Pick<ResourceAccess, 'ordinary' | 'conditional' | 'public'>;
  after: Pick<ResourceAccess, 'ordinary' | 'conditional' | 'public'>;
};
export type AccountMovement = {
  account: string;
  enabledBefore: boolean;
  enabledAfter: boolean;
  ordinaryRolesAdded: string[];
  ordinaryRolesRemoved: string[];
  conditionalRolesAdded: string[];
  conditionalRolesRemoved: string[];
  broadBefore: AccountAccess['broad'];
  broadAfter: AccountAccess['broad'];
  grants: GrantMovement[];
  warnings: string[];
  directAssignmentChanged: boolean;
};
export type FindingMovement = {
  id: string;
  status: 'new' | 'no-longer-observed' | 'changed' | 'unchanged' | 'unknown';
  before?: Finding;
  after?: Finding;
};
export type DriftReport = {
  version: 1;
  instance: string;
  beforeAt: string;
  afterAt: string;
  chronological: boolean;
  complete: boolean;
  warnings: string[];
  objects: ConfigurationChange[];
  accounts: AccountMovement[];
  findings: FindingMovement[];
  summary: {
    changedObjects: number;
    uncertainObjects: number;
    affectedAccounts: number;
    gainedOrdinaryGrants: number;
    lostOrdinaryGrants: number;
    gainedConditionalGrants: number;
    lostConditionalGrants: number;
    newlyBroadAccounts: number;
    noLongerBroadAccounts: number;
    publicPermissionChanges: number;
  };
};

function unreadable(value: unknown): boolean {
  return !!value && typeof value === 'object' && Object.hasOwn(value, 'unavailable');
}
function complete(snapshot: AccessSnapshot) {
  return (
    !snapshot.warnings.length &&
    ![...snapshot.users, ...snapshot.roles, ...snapshot.apps].some(unreadable)
  );
}
function difference(first: string[], second: string[]) {
  const existing = new Set(second);
  return first.filter((value) => !existing.has(value)).sort();
}
function letters(first: string, second: string) {
  return permissions(first)
    .split('')
    .filter((value) => !permissions(second).includes(value))
    .join('');
}
function changeFields(before: object, after: object): DriftField[] {
  const first = before as Record<string, unknown>;
  const next = after as Record<string, unknown>;
  return [...new Set([...Object.keys(first), ...Object.keys(next)])]
    .sort()
    .filter((field) => canonical(first[field]) !== canonical(next[field]))
    .map((field) => ({ field, before: first[field], after: next[field] }));
}

function objectChanges(before: AccessSnapshot, after: AccessSnapshot): ConfigurationChange[] {
  const groups = [
    ['account', before.users, after.users],
    ['role', before.roles, after.roles],
    ['resource', before.resources, after.resources],
    ['application', before.apps, after.apps],
  ] as const;
  const rows: ConfigurationChange[] = [];
  for (const [kind, first, next] of groups) {
    const a = new Map<string, { Name: string }>(first.map((item) => [item.Name, item]));
    const b = new Map<string, { Name: string }>(next.map((item) => [item.Name, item]));
    for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const previous = a.get(name);
      const current = b.get(name);
      if (!previous || !current) {
        const missingCapture = previous ? after : before;
        const certain = complete(missingCapture);
        rows.push({
          kind,
          name,
          change: certain ? (previous ? 'removed' : 'added') : 'unknown',
          fields: [],
          explanation: certain
            ? previous
              ? 'Present only in the earlier complete capture.'
              : 'Present only in the later complete capture.'
            : 'An object is missing from an incomplete capture; addition or deletion cannot be established.',
        });
        continue;
      }
      if (unreadable(previous) || unreadable(current)) {
        rows.push({
          kind,
          name,
          change: 'unknown',
          fields: [],
          explanation: 'Details were unavailable in at least one capture.',
        });
        continue;
      }
      const fields = changeFields(previous, current);
      if (fields.length)
        rows.push({
          kind,
          name,
          change: 'changed',
          fields,
          explanation: `${fields.length} captured fields changed.`,
        });
    }
  }
  return rows;
}

function grantMovement(
  resource: string,
  before: ResourceAccess | undefined,
  after: ResourceAccess | undefined,
): GrantMovement {
  const empty = { ordinary: '', conditional: '', public: '' };
  const a = before || empty;
  const b = after || empty;
  return {
    resource,
    ordinaryAdded: letters(b.ordinary, a.ordinary),
    ordinaryRemoved: letters(a.ordinary, b.ordinary),
    conditionalAdded: letters(b.conditional, a.conditional),
    conditionalRemoved: letters(a.conditional, b.conditional),
    publicAdded: letters(b.public, a.public),
    publicRemoved: letters(a.public, b.public),
    before: { ordinary: a.ordinary, conditional: a.conditional, public: a.public },
    after: { ordinary: b.ordinary, conditional: b.conditional, public: b.public },
  };
}

function accountMovement(
  before: AccessSnapshot,
  after: AccessSnapshot,
  user: AccessUser,
  next: AccessUser,
): AccountMovement | undefined {
  const a = explainAccount(before, user);
  const b = explainAccount(after, next);
  const warnings = [...new Set([...a.unknown, ...b.unknown])];
  const resourcesBefore = new Map(
    accountResources(before, a).map((resource) => [resource.name, resource]),
  );
  const resourcesAfter = new Map(
    accountResources(after, b).map((resource) => [resource.name, resource]),
  );
  const grants = [...new Set([...resourcesBefore.keys(), ...resourcesAfter.keys()])]
    .sort()
    .map((name) => grantMovement(name, resourcesBefore.get(name), resourcesAfter.get(name)))
    .filter(
      (row) =>
        row.ordinaryAdded ||
        row.ordinaryRemoved ||
        row.conditionalAdded ||
        row.conditionalRemoved ||
        row.publicAdded ||
        row.publicRemoved,
    );
  const row: AccountMovement = {
    account: user.Name,
    enabledBefore: user.Enabled,
    enabledAfter: next.Enabled,
    ordinaryRolesAdded: difference(b.ordinaryRoles, a.ordinaryRoles),
    ordinaryRolesRemoved: difference(a.ordinaryRoles, b.ordinaryRoles),
    conditionalRolesAdded: difference(b.conditionalRoles, a.conditionalRoles),
    conditionalRolesRemoved: difference(a.conditionalRoles, b.conditionalRoles),
    broadBefore: a.broad,
    broadAfter: b.broad,
    grants,
    warnings,
    directAssignmentChanged:
      canonical(user.Roles) !== canonical(next.Roles) ||
      canonical(user.EscalationRoles) !== canonical(next.EscalationRoles),
  };
  if (
    grants.length ||
    row.enabledBefore !== row.enabledAfter ||
    row.broadBefore !== row.broadAfter ||
    row.directAssignmentChanged ||
    row.ordinaryRolesAdded.length ||
    row.ordinaryRolesRemoved.length ||
    row.conditionalRolesAdded.length ||
    row.conditionalRolesRemoved.length ||
    warnings.length
  )
    return row;
  return undefined;
}

/** Partial snapshots remain inspectable, but missing objects are never called deletions. */
export function buildDriftReport(before: AccessSnapshot, after: AccessSnapshot): DriftReport {
  if (before.instance !== after.instance)
    throw new Error('Choose captures from the same configured instance.');
  const warnings = [
    ...new Set([
      ...before.warnings.map((warning) => 'Before: ' + warning),
      ...after.warnings.map((warning) => 'After: ' + warning),
    ]),
  ];
  const isComplete = complete(before) && complete(after);
  if (!isComplete)
    warnings.push(
      'Incomplete captures: apparent losses and absent objects are observations, not verified removals.',
    );
  const chronological =
    new Date(before.capturedAt).getTime() <= new Date(after.capturedAt).getTime();
  if (!chronological) warnings.push('The selected comparison runs backwards in time.');
  const objects = objectChanges(before, after);
  const nextUsers = new Map(after.users.map((user) => [user.Name, user]));
  const accounts: AccountMovement[] = [];
  for (const user of before.users) {
    const next = nextUsers.get(user.Name);
    if (!next || unreadable(user) || unreadable(next)) continue;
    const row = accountMovement(before, after, user, next);
    if (row) accounts.push(row);
  }
  const beforeFindings = new Map(findings(before).map((finding) => [finding.id, finding]));
  const afterFindings = new Map(findings(after).map((finding) => [finding.id, finding]));
  const findingRows = [...new Set([...beforeFindings.keys(), ...afterFindings.keys()])]
    .sort()
    .map((id): FindingMovement => {
      const previous = beforeFindings.get(id);
      const next = afterFindings.get(id);
      return {
        id,
        before: previous,
        after: next,
        status: !previous
          ? complete(before)
            ? 'new'
            : 'unknown'
          : !next
            ? complete(after)
              ? 'no-longer-observed'
              : 'unknown'
            : previous.fingerprint === next.fingerprint
              ? 'unchanged'
              : 'changed',
      };
    });
  const reliable = accounts.filter((row) => !row.warnings.length);
  const count = (
    field: keyof Pick<
      GrantMovement,
      'ordinaryAdded' | 'ordinaryRemoved' | 'conditionalAdded' | 'conditionalRemoved'
    >,
  ) =>
    reliable.reduce(
      (total, account) =>
        total + account.grants.reduce((sum, grant) => sum + grant[field].length, 0),
      0,
    );
  return {
    version: 1,
    instance: before.instance,
    beforeAt: before.capturedAt,
    afterAt: after.capturedAt,
    chronological,
    complete: isComplete,
    warnings,
    objects,
    accounts,
    findings: findingRows,
    summary: {
      changedObjects: objects.filter((row) => row.change !== 'unknown').length,
      uncertainObjects: objects.filter((row) => row.change === 'unknown').length,
      affectedAccounts: accounts.length,
      gainedOrdinaryGrants: count('ordinaryAdded'),
      lostOrdinaryGrants: count('ordinaryRemoved'),
      gainedConditionalGrants: count('conditionalAdded'),
      lostConditionalGrants: count('conditionalRemoved'),
      newlyBroadAccounts: reliable.filter(
        (row) => row.broadBefore !== 'ordinary' && row.broadAfter === 'ordinary',
      ).length,
      noLongerBroadAccounts: reliable.filter(
        (row) => row.broadBefore === 'ordinary' && row.broadAfter !== 'ordinary',
      ).length,
      publicPermissionChanges: objects.filter(
        (row) =>
          row.kind === 'resource' && row.fields.some((field) => field.field === 'PublicPermission'),
      ).length,
    },
  };
}

export function driftCsv(report: DriftReport) {
  const quote = (value: string) =>
    '"' +
    (/^(?:\s*[=+@\-]|[\t\r\n])/.test(value) ? "'" + value : value).replaceAll('"', '""') +
    '"';
  const rows = report.accounts.flatMap((account) =>
    account.grants.map((grant) => [
      account.account,
      grant.resource,
      grant.before.ordinary,
      grant.after.ordinary,
      grant.before.conditional,
      grant.after.conditional,
      grant.before.public,
      grant.after.public,
      account.warnings.join(' | '),
    ]),
  );
  return [
    [
      'Account',
      'Resource',
      'Ordinary before',
      'Ordinary after',
      'Conditional before',
      'Conditional after',
      'Public before',
      'Public after',
      'Warnings',
    ],
    ...rows,
  ]
    .map((row) => row.map(quote).join(','))
    .join('\r\n');
}

export function captureTimeline(
  captures: Array<{ id: string; label: string; snapshot: AccessSnapshot }>,
) {
  return captures.map((capture, index) => {
    const previous = captures[index - 1];
    const report = previous ? buildDriftReport(previous.snapshot, capture.snapshot) : undefined;
    return {
      id: capture.id,
      label: capture.label,
      at: capture.snapshot.capturedAt,
      complete: complete(capture.snapshot),
      accounts: capture.snapshot.users.length,
      roles: capture.snapshot.roles.length,
      resources: capture.snapshot.resources.length,
      applications: capture.snapshot.apps.length,
      findings: findings(capture.snapshot).length,
      changedObjects: report?.summary.changedObjects,
      uncertainObjects: report?.summary.uncertainObjects,
      newFindings: report?.findings.filter((finding) => finding.status === 'new').length,
      noLongerObserved: report?.findings.filter(
        (finding) => finding.status === 'no-longer-observed',
      ).length,
      comparable: report?.complete,
    };
  });
}
