export const SQL_EVIDENCE_LIMIT = 500;
export type SqlScope = { namespace: string; grantee: string };
export type SqlPrivilege = {
  Type?: string;
  Name?: string;
  Privilege: string;
  GrantedBy?: string;
  GrantedVia?: string;
  GrantOption?: boolean;
  HasColumnPriv?: boolean;
};
export type SqlSource = {
  kind: 'object' | 'admin';
  path: string;
  query: Record<string, string>;
  startedAt: string;
  finishedAt: string;
  status: 'read' | 'partial' | 'unavailable';
  httpStatus?: number;
  rows: SqlPrivilege[];
  returnedCount?: number;
  skippedCount: number;
  limit: number;
  limitReached: boolean;
  warnings: string[];
  error?: string;
};
export type SqlEvidence = {
  version: 1;
  instance: string;
  scope: SqlScope;
  startedAt: string;
  capturedAt: string;
  sources: SqlSource[];
  warnings: string[];
};
export type SqlRead = (
  path: string,
  query: Record<string, string>,
  method: 'GET',
) => Promise<{ data: unknown; status: number }>;

export function sqlScope(input: SqlScope): SqlScope {
  const result = { namespace: input.namespace.trim(), grantee: input.grantee.trim() };
  for (const [key, value] of Object.entries(result)) {
    if (!value || value.length > 256 || /[\x00-\x1f\x7f]/.test(value))
      throw new Error(`Enter a ${key} of 1–256 characters without control characters.`);
  }
  return result;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024;
}
function parseRow(value: unknown, kind: SqlSource['kind']): SqlPrivilege | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const row = value as Record<string, unknown>;
  // IRIS 2026.2 also returns Object/Action where the published contract uses Name/Privilege.
  const name = row.Name ?? row.Object;
  const privilege = row.Privilege ?? (kind === 'object' ? row.Action : undefined);
  if (row.Name !== undefined && row.Object !== undefined && row.Name !== row.Object) return;
  if (
    kind === 'object' &&
    row.Privilege !== undefined &&
    row.Action !== undefined &&
    row.Privilege !== row.Action
  )
    return;
  if (!text(privilege) || (kind === 'object' && (!text(row.Type) || !text(name)))) return;
  const result: SqlPrivilege = { Privilege: privilege };
  if (kind === 'object') {
    result.Type = row.Type as string;
    result.Name = name as string;
  }
  for (const key of ['GrantedBy', 'GrantedVia'] as const) {
    if (row[key] === undefined || row[key] === null) continue;
    if (typeof row[key] !== 'string' || row[key].length > 1024) return;
    result[key] = row[key];
  }
  for (const key of ['GrantOption', 'HasColumnPriv'] as const) {
    if (row[key] === undefined || row[key] === null) continue;
    if (typeof row[key] !== 'boolean') return;
    result[key] = row[key];
  }
  return result;
}

export async function collectSqlEvidence(
  instance: string,
  input: SqlScope,
  read: SqlRead,
  now: () => string = () => new Date().toISOString(),
): Promise<SqlEvidence> {
  if (!instance.trim()) throw new Error('The configured instance could not be identified.');
  const scope = sqlScope(input);
  const startedAt = now();
  const sources = await Promise.all(
    (['object', 'admin'] as const).map(async (kind): Promise<SqlSource> => {
      const path =
        kind === 'object' ? '/v2/security/sql-privileges' : '/v2/security/sql-admin-privileges';
      const query: Record<string, string> = { ...scope, maxRows: String(SQL_EVIDENCE_LIMIT) };
      if (kind === 'object') query.includeSystem = '1';
      const source: SqlSource = {
        kind,
        path,
        query,
        startedAt: now(),
        finishedAt: '',
        status: 'unavailable',
        rows: [],
        skippedCount: 0,
        limit: SQL_EVIDENCE_LIMIT,
        limitReached: false,
        warnings: [],
      };
      try {
        const reply = await read(path, query, 'GET');
        source.httpStatus = reply.status;
        if (reply.status < 200 || reply.status >= 300)
          throw new Error(`IRIS returned HTTP ${reply.status}.`);
        if (!Array.isArray(reply.data))
          throw new Error('IRIS returned an unreadable privilege list; expected an array.');
        source.returnedCount = reply.data.length;
        source.limitReached = reply.data.length >= SQL_EVIDENCE_LIMIT;
        if (source.limitReached)
          source.warnings.push('The 500-row limit was reached; additional records may exist.');
        for (const value of reply.data.slice(0, SQL_EVIDENCE_LIMIT)) {
          const parsed = parseRow(value, kind);
          if (parsed) source.rows.push(parsed);
          else source.skippedCount++;
        }
        if (source.skippedCount)
          source.warnings.push(
            `${source.skippedCount} malformed rows were omitted; this source is incomplete.`,
          );
        if (source.rows.some((row) => row.HasColumnPriv === true))
          source.warnings.push(
            'Column privileges exist for some objects. Their individual columns and grants are not expanded in this report.',
          );
        source.status = source.skippedCount || source.limitReached ? 'partial' : 'read';
      } catch (failure) {
        if (
          failure &&
          typeof failure === 'object' &&
          'status' in failure &&
          typeof failure.status === 'number'
        )
          source.httpStatus = failure.status;
        source.error =
          failure instanceof Error
            ? failure.message.slice(0, 2000)
            : 'This privilege source could not be read.';
      } finally {
        source.finishedAt = now();
      }
      return source;
    }),
  );
  return {
    version: 1,
    instance,
    scope,
    startedAt,
    capturedAt: now(),
    sources,
    warnings: [
      'These are two bounded, non-transactional reads of configured SQL privileges, not a live authorization test or impersonation.',
      'Missing rows, unknown flags and unavailable sources do not mean access is denied. Row policies, current sessions and application behavior can affect runtime access.',
      'Object and Action response fields are normalized to Name and Privilege. Object privileges include system-defined objects.',
    ],
  };
}

export function filterSqlRows(rows: SqlPrivilege[], filter: string): SqlPrivilege[] {
  const query = filter.trim().toLocaleLowerCase();
  return query
    ? rows.filter((row) =>
        Object.values(row).some((value) => String(value).toLocaleLowerCase().includes(query)),
      )
    : rows;
}
