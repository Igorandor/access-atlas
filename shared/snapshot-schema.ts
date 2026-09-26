import { z } from 'zod';
import type { AccessSnapshot } from './access-model';
const name = z.string().max(512);
const strings = z.array(name).max(1000);
const unavailable = z.string().max(2000).optional();
/** Imports are data only. Unknown keys are rejected, and no import can issue a write. */
export const snapshotSchema = z
  .object({
    version: z.literal(1),
    startedAt: z.string().datetime(),
    capturedAt: z.string().datetime(),
    instance: z.string().max(1024),
    warnings: z.array(z.string().max(4000)).max(1000),
    users: z
      .array(
        z
          .object({
            Name: name,
            Enabled: z.boolean(),
            Roles: strings,
            EscalationRoles: strings,
            unavailable,
          })
          .strict(),
      )
      .max(200),
    roles: z
      .array(
        z
          .object({
            Name: name,
            Description: z.string().max(10000),
            GrantedRoles: strings,
            Resources: z
              .array(z.object({ Name: name, Permissions: z.string().max(20) }).strict())
              .max(2000),
            EscalationOnly: z.boolean(),
            unavailable,
          })
          .strict(),
      )
      .max(200),
    resources: z
      .array(
        z.object({ Name: name, PublicPermission: z.string().max(20), ResourceType: name }).strict(),
      )
      .max(999),
    apps: z
      .array(
        z
          .object({
            Name: name,
            Enabled: z.boolean(),
            AutheEnabled: z.number(),
            Resource: name,
            NameSpace: name,
            unavailable,
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export function parseSnapshot(value: unknown): AccessSnapshot {
  const result = snapshotSchema.parse(value);
  for (const kind of ['users', 'roles', 'resources', 'apps'] as const) {
    const names = result[kind].map((row) => row.Name);
    if (new Set(names).size !== names.length) throw new Error(`Duplicate identities in ${kind}.`);
  }
  return result;
}
