import { z } from 'zod';
import type { AccessSnapshot, Finding } from './access-model.js';
import type { ReviewOperation } from './change-review.js';
import { simulateAccess, type SimulationChange } from './access-simulation.js';

export const remediationRequestSchema = z
  .object({
    revision: z.number().int().positive(),
    findingId: z.string().min(1).max(1024),
    fingerprint: z.string().min(1).max(100_000),
    action: z.enum([
      'remove-role',
      'disable-account',
      'remove-public-write',
      'require-authentication',
      'disable-application',
    ]),
    role: z.string().max(512).optional(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export type RemediationRequest = z.infer<typeof remediationRequestSchema>;
export type RemediationDraft = {
  title: string;
  operation: ReviewOperation;
  baseline: Record<string, unknown>;
  warnings: string[];
  projection?: ReturnType<typeof simulateAccess>;
};

/** Fixed remediation actions; campaign imports cannot manufacture arbitrary native requests. */
export function draftRemediation(
  snapshot: AccessSnapshot,
  finding: Finding,
  input: Pick<RemediationRequest, 'action' | 'role'>,
): RemediationDraft {
  if (finding.kind === 'user' && ['remove-role', 'disable-account'].includes(input.action)) {
    const user = snapshot.users.find((item) => item.Name === finding.target);
    if (!user || Object.hasOwn(user, 'unavailable'))
      throw new Error('The captured account is unreadable.');
    let change: SimulationChange;
    if (input.action === 'remove-role') {
      if (!input.role || !user.Roles.includes(input.role))
        throw new Error('Choose a directly assigned role from this capture.');
      change = {
        kind: 'account-role',
        account: user.Name,
        role: input.role,
        mode: 'remove',
        escalation: false,
      };
      return {
        title: 'Remove direct role ' + input.role + ' from ' + user.Name,
        operation: {
          path: '/v2/security/user',
          method: 'PUT',
          query: { name: user.Name },
          body: { Roles: user.Roles.filter((role) => role !== input.role) },
        },
        baseline: { Roles: user.Roles },
        warnings: [
          'Other roles, public grants and application privileges can preserve access. Review the projected impact before applying.',
        ],
        projection: simulateAccess(snapshot, [change]),
      };
    }
    change = { kind: 'account-state', account: user.Name, enabled: false };
    return {
      title: 'Disable account ' + user.Name,
      operation: {
        path: '/v2/security/user',
        method: 'PUT',
        query: { name: user.Name },
        body: { Enabled: false },
      },
      baseline: { Enabled: user.Enabled },
      warnings: [
        'Disabling an account can interrupt dependent services. Existing sessions may have separate lifetime rules.',
      ],
      projection: simulateAccess(snapshot, [change]),
    };
  }
  if (finding.kind === 'resource' && input.action === 'remove-public-write') {
    const resource = snapshot.resources.find((item) => item.Name === finding.target);
    if (!resource) throw new Error('The resource was not captured.');
    const next = resource.PublicPermission.replace(/W/gi, '');
    return {
      title: 'Remove public write from ' + resource.Name,
      operation: {
        path: '/v2/security/resource',
        method: 'PUT',
        query: { name: resource.Name },
        body: { PublicPermission: next },
      },
      baseline: { PublicPermission: resource.PublicPermission },
      warnings: [
        'Clients relying on public write access may stop working. Explicit role grants remain unchanged.',
      ],
      projection: simulateAccess(snapshot, [
        { kind: 'public-grant', resource: resource.Name, permissions: next },
      ]),
    };
  }
  if (
    finding.kind === 'app' &&
    ['require-authentication', 'disable-application'].includes(input.action)
  ) {
    if (/^\/api\/(?:admin|atlas)(?:\/|$)/i.test(finding.target))
      throw new Error(
        'Automatic remediation cannot change the management API entry points. Use the application register with a separate recovery path.',
      );
    const app = snapshot.apps.find((item) => item.Name === finding.target);
    if (!app || Object.hasOwn(app, 'unavailable'))
      throw new Error('The application was not captured.');
    if (input.action === 'require-authentication') {
      const next = app.AutheEnabled & ~64;
      if (!next)
        throw new Error(
          'This application has no other authentication method. Configure one in the application register before removing unauthenticated entry.',
        );
      return {
        title: 'Require authentication for ' + app.Name,
        operation: {
          path: '/v2/web-app',
          method: 'PUT',
          query: { name: app.Name },
          body: { AutheEnabled: next },
        },
        baseline: { AutheEnabled: app.AutheEnabled },
        warnings: [
          'Unauthenticated clients will need another enabled authentication method. The portal cannot verify application-specific login flows.',
        ],
      };
    }
    return {
      title: 'Disable application ' + app.Name,
      operation: {
        path: '/v2/web-app',
        method: 'PUT',
        query: { name: app.Name },
        body: { Enabled: false },
      },
      baseline: { Enabled: app.Enabled },
      warnings: [
        'Requests using this application entry point may fail. Confirm an alternative administration path before proceeding.',
      ],
    };
  }
  throw new Error('Choose a supported remediation for this finding type.');
}

export const remediationStorageBounds = {
  message: 2000,
  checkedFields: 100,
  checkedFieldLength: 256,
  reconciliation: 4000,
} as const;

export const remediationRecordSchema = z
  .object({
    id: z.string().uuid(),
    findingId: z.string().max(1024),
    fingerprint: z.string().max(100_000),
    title: z.string().max(1000),
    target: z.string().max(1024),
    reason: z.string().max(2000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: z.enum([
      'reviewed',
      'dispatching',
      'verified',
      'acknowledged',
      'different',
      'unverified',
      'uncertain',
      'failed',
      'resolved',
    ]),
    path: z.string().max(160),
    method: z.string().max(10),
    message: z.string().max(remediationStorageBounds.message),
    checkedFields: z
      .array(z.string().max(remediationStorageBounds.checkedFieldLength))
      .max(remediationStorageBounds.checkedFields),
    reconciliation: z.string().max(remediationStorageBounds.reconciliation).optional(),
    expected: z
      .record(
        z.string().max(100),
        z.union([
          z.boolean(),
          z.number(),
          z.string().max(4000),
          z.array(z.string().max(512)).max(1000),
        ]),
      )
      .optional(),
  })
  .strict();
export type RemediationRecord = z.infer<typeof remediationRecordSchema>;
