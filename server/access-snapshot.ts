import { IrisClient } from './upstream.js';
import type { AccessSnapshot } from '../shared/access-model.js';

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
  async function list(path: string, limit: number): Promise<any[]> {
    try {
      const rows = await read(path, { maxRows: String(limit + 1) });
      if (!Array.isArray(rows)) throw new Error('The API did not return a list.');
      if (rows.length > limit)
        warnings.push(`${path}: capture limited to ${limit} records; analysis is incomplete.`);
      return rows.slice(0, limit);
    } catch (error) {
      warnings.push(`${path}: ${(error as Error).message}`);
      return [];
    }
  }
  const [users, roles, resources, apps] = await Promise.all([
    list('/v2/security/users', 200),
    list('/v2/security/roles', 200),
    list('/v2/security/resources', 999),
    list('/v2/web-apps', 200),
  ]);
  const jobs = [
    ...users.map((row) => ({ row, path: '/v2/security/user' })),
    ...roles.map((row) => ({ row, path: '/v2/security/role' })),
    ...apps.map((row) => ({ row, path: '/v2/web-app' })),
  ];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (cursor < jobs.length) {
        const { row, path } = jobs[cursor++];
        try {
          if (Date.now() - started > 45000) throw new Error('Capture time budget reached.');
          Object.assign(row, await read(path, { name: String(row.Name) }));
        } catch (error) {
          row.unavailable = (error as Error).message;
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
