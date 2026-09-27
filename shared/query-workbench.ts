import { z } from 'zod';
import { spec, parameters } from './schema.js';

export type QueryField = {
  name: string;
  required: boolean;
  description: string;
  type: string;
  choices: string[];
  minimum?: number;
  maximum?: number;
};
export type ReadOperation = {
  path: string;
  title: string;
  group: string;
  description: string;
  fields: QueryField[];
};
const prohibitedSegments = new Set([
  'secret',
  'secrets',
  'password',
  'initial-access-token',
  'search-password',
]);
const noGateway = new Set(['/login', '/logout', '/refresh', '/revoke']);
function group(path: string) {
  if (path.startsWith('/v2/security/')) return 'Security';
  if (path.startsWith('/v2/wallet/')) return 'Wallet metadata';
  if (path.includes('task')) return 'Tasks';
  if (path.includes('process') || path.includes('device')) return 'Host';
  if (path.includes('monitor') || path.includes('performance')) return 'Monitoring';
  if (path.includes('database') || path.includes('namespace') || path.includes('journal'))
    return 'Storage';
  if (path.includes('web-app')) return 'Web applications';
  return 'Instance';
}
export function readOperations(): ReadOperation[] {
  return Object.entries(spec.paths)
    .flatMap(([path, definition]: [string, any]) => {
      if (!definition.get || noGateway.has(path)) return [];
      if (path !== '/v2/wallet/secrets' && prohibitedSegments.has(path.split('/').at(-1)!))
        return [];
      return [
        {
          path,
          title: String(definition.get.summary || path),
          description: String(definition.get.description || ''),
          group: group(path),
          fields: parameters(path, 'GET').map((parameter) => ({
            name: parameter.name,
            required: parameter.required === true,
            description: String(parameter.description || ''),
            type: parameter.schema?.type || 'string',
            choices: (parameter.schema?.enum || []).map(String),
            minimum: parameter.schema?.minimum,
            maximum: parameter.name === 'maxRows' ? 1000 : parameter.schema?.maximum,
          })),
        },
      ];
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path));
}
export const queryPlanSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(160),
    queries: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            title: z.string().trim().min(1).max(160),
            path: z.string().min(1).max(160),
            query: z.record(z.string().max(80), z.string().max(2000)),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export type QueryPlan = z.infer<typeof queryPlanSchema>;
export type SavedQuery = QueryPlan['queries'][number];
export function validateReadQuery(path: string, values: Record<string, string>) {
  const operation = readOperations().find((item) => item.path === path);
  if (!operation) throw new Error('This operation is not available in the read workbench.');
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = operation.fields.find((field) => field.name === key);
    if (!field) throw new Error('Unknown parameter: ' + key);
    if (!value && !field.required) continue;
    if (value.length > 2000) throw new Error(key + ' is limited to 2,000 characters.');
    if (
      field.type === 'integer' &&
      (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    )
      throw new Error(key + ' must be an integer.');
    if (field.type === 'number' && !Number.isFinite(Number(value)))
      throw new Error(key + ' must be a number.');
    if (field.type === 'boolean' && !['true', 'false', '0', '1'].includes(value))
      throw new Error(key + ' must be true, false, 0 or 1.');
    if (field.choices.length && !field.choices.includes(value))
      throw new Error(key + ' must use one of the listed choices.');
    if (field.minimum !== undefined && Number(value) < field.minimum)
      throw new Error(key + ' is below the minimum.');
    if (field.maximum !== undefined && Number(value) > field.maximum)
      throw new Error(key + ' exceeds ' + field.maximum + '.');
    if (key === 'maxRows' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1000))
      throw new Error('maxRows must be from 1 to 1,000.');
    result[key] = value;
  }
  for (const field of operation.fields)
    if (field.required && !result[field.name]) throw new Error('Required parameter: ' + field.name);
  if (operation.fields.some((field) => field.name === 'maxRows') && result.maxRows === undefined)
    result.maxRows = '250';
  return result;
}
export function parseQueryPlan(input: unknown): QueryPlan {
  const plan = queryPlanSchema.parse(input);
  if (new Set(plan.queries.map((query) => query.id)).size !== plan.queries.length)
    throw new Error('Query IDs must be unique.');
  return {
    ...plan,
    queries: plan.queries.map((query) => ({
      ...query,
      query: validateReadQuery(query.path, query.query),
    })),
  };
}
export type QueryResult = {
  id: string;
  title: string;
  path: string;
  query: Record<string, string>;
  at: string;
  elapsedMs: number;
  status: 'complete' | 'failed' | 'oversized';
  httpStatus?: number;
  error?: string;
  data?: unknown;
};

export function compareQueryValues(before: unknown, after: unknown, maximum = 300) {
  const rows: Array<{
    path: string;
    before: unknown;
    after: unknown;
    change: 'added' | 'removed' | 'changed';
  }> = [];
  let truncated = false;
  const queue: Array<{ path: string; left: any; right: any; depth: number }> = [
    { path: '$', left: before, right: after, depth: 0 },
  ];
  let visited = 0;
  while (queue.length && visited++ < 20_000) {
    const { path, left, right, depth } = queue.shift()!;
    if (Object.is(left, right)) continue;
    if (rows.length >= maximum) {
      truncated = true;
      break;
    }
    const leftObject = left !== null && typeof left === 'object';
    const rightObject = right !== null && typeof right === 'object';
    if (depth < 12 && leftObject && rightObject && Array.isArray(left) === Array.isArray(right)) {
      const names = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const name of names)
        queue.push({
          path: Array.isArray(left) ? path + '[' + name + ']' : path + '.' + name,
          left: left[name],
          right: right[name],
          depth: depth + 1,
        });
    } else
      rows.push({
        path,
        before: left,
        after: right,
        change: left === undefined ? 'added' : right === undefined ? 'removed' : 'changed',
      });
  }
  if (queue.length) truncated = true;
  return { rows, truncated };
}

export function describeResultShape(value: unknown) {
  if (value === null) return { kind: 'null', records: 0, fields: [] as string[] };
  if (Array.isArray(value))
    return {
      kind: 'list',
      records: value.length,
      fields: [
        ...new Set(
          value
            .slice(0, 100)
            .flatMap((item) => (item && typeof item === 'object' ? Object.keys(item) : [])),
        ),
      ].slice(0, 100),
    };
  if (typeof value === 'object')
    return { kind: 'object', records: 1, fields: Object.keys(value as object).slice(0, 100) };
  return { kind: typeof value, records: 1, fields: [] as string[] };
}
