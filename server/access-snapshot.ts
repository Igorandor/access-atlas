import { IrisClient } from './upstream.js';
import type { AccessSnapshot } from '../shared/access-model.js';
import { z } from 'zod';
import { snapshotSchema } from '../shared/snapshot-schema.js';

const identitySchema = z.object({ Name: z.string().min(1).max(512) });
const resourceSchema = snapshotSchema.shape.resources.element
  .extend({ Name: identitySchema.shape.Name })
  .strip();
const detailSchemas = {
  user: snapshotSchema.shape.users.element.omit({ Name: true, unavailable: true }).strip(),
  role: snapshotSchema.shape.roles.element.omit({ Name: true, unavailable: true }).strip(),
  app: snapshotSchema.shape.apps.element.omit({ Name: true, unavailable: true }).strip(),
};

const names = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Fixed endpoints, a bounded pool and no credential/configuration body in the snapshot. */
export async function captureAccess(
  client: IrisClient,
  auth: string,
  instance: string,
): Promise<AccessSnapshot> {
  const started = Date.now();
  const warnings: string[] = [];
  const read = async (path: string, query: Record<string, string> = {}) =>
    (await client.request(auth, { path, method: 'GET', query })).data;
  async function list(
    path: string,
    limit: number,
    schema: z.ZodType<any> = identitySchema,
  ): Promise<any[]> {
    try {
      const rows = await read(path, { maxRows: String(limit + 1) });
      if (!Array.isArray(rows)) throw new Error('The API did not return a list.');
      if (rows.length > limit)
        warnings.push(`${path}: capture limited to ${limit} records; analysis is incomplete.`);
      const valid: any[] = [],
        seen = new Set<string>();
      let rejected = 0;
      for (const row of rows.slice(0, limit)) {
        const parsed = schema.safeParse(row);
        if (!parsed.success || seen.has(parsed.data.Name)) {
          rejected++;
          continue;
        }
        seen.add(parsed.data.Name);
        valid.push(parsed.data);
      }
      if (rejected)
        warnings.push(
          `${path}: ${rejected} malformed or duplicate records excluded; analysis is incomplete.`,
        );
      return valid;
    } catch (error) {
      warnings.push(`${path}: ${(error as Error).message.slice(0, 1000)}`);
      return [];
    }
  }
  const [users, roles, resources, apps] = await Promise.all([
    list('/v2/security/users', 200),
    list('/v2/security/roles', 200),
    list('/v2/security/resources', 999, resourceSchema),
    list('/v2/web-apps', 200),
  ]);
  const jobs = [
    ...users.map((row) => ({ row, path: '/v2/security/user', schema: detailSchemas.user })),
    ...roles.map((row) => ({ row, path: '/v2/security/role', schema: detailSchemas.role })),
    ...apps.map((row) => ({ row, path: '/v2/web-app', schema: detailSchemas.app })),
  ];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (cursor < jobs.length) {
        const { row, path, schema } = jobs[cursor++];
        try {
          if (Date.now() - started > 45000) throw new Error('Capture time budget reached.');
          const detail = await read(path, { name: row.Name });
          if (detail && Object.hasOwn(detail, 'Name') && detail.Name !== row.Name)
            throw new Error('Detail identity differs from the requested record.');
          const parsed = schema.safeParse(detail);
          if (!parsed.success) throw new Error('Access metadata is missing or malformed.');
          Object.assign(row, parsed.data);
        } catch (error) {
          row.unavailable = (error as Error).message.slice(0, 1000) || 'Details unavailable.';
          warnings.push(`${path} ${row.Name}: ${row.unavailable}`);
        }
      }
    }),
  );
  return {
    version: 1,
    startedAt: new Date(started).toISOString(),
    capturedAt: new Date().toISOString(),
    instance,
    warnings,
    users: users.map((r) => ({
      Name: text(r.Name),
      Enabled: !!r.Enabled,
      Roles: names(r.Roles),
      EscalationRoles: names(r.EscalationRoles),
      ...(r.unavailable ? { unavailable: r.unavailable } : {}),
    })),
    roles: roles.map((r) => ({
      Name: text(r.Name),
      Description: text(r.Description),
      GrantedRoles: names(r.GrantedRoles),
      EscalationOnly: !!r.EscalationOnly,
      Resources: Array.isArray(r.Resources)
        ? r.Resources.map((g: any) => ({ Name: text(g.Name), Permissions: text(g.Permissions) }))
        : [],
      ...(r.unavailable ? { unavailable: r.unavailable } : {}),
    })),
    resources: resources.map((r) => ({
      Name: text(r.Name),
      PublicPermission: text(r.PublicPermission),
      ResourceType: text(r.ResourceType),
    })),
    apps: apps.map((r) => ({
      Name: text(r.Name),
      Enabled: !!r.Enabled,
      AutheEnabled: Number(r.AutheEnabled) || 0,
      Resource: text(r.Resource),
      NameSpace: text(r.NameSpace),
      ...(r.unavailable ? { unavailable: r.unavailable } : {}),
    })),
  };
}
