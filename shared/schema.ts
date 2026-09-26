import contract from './iris-contract.json';
export type RecordData = Record<string, any>;
export interface Schema {
  type?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  items?: Schema;
  $ref?: string;
  allOf?: Schema[];
  readOnly?: boolean;
  writeOnly?: boolean;
  example?: unknown;
  default?: unknown;
  required?: string[];
  additionalProperties?: Schema | boolean;
}
export const spec = contract as unknown as {
  paths: Record<string, RecordData>;
  components: { schemas: Record<string, Schema>; parameters: Record<string, RecordData> };
};
function reference(pointer: string): any {
  let cursor: any = spec;
  for (const token of pointer.replace(/^#\//, '').split('/')) {
    if (!cursor || !Object.hasOwn(cursor, token)) return {};
    cursor = cursor[token];
  }
  return cursor;
}
/** Resolve a reference tree without mutating the organizer's contract. */
export function resolveSchema(input: Schema = {}): Schema {
  const pending = [input],
    properties: Record<string, Schema> = Object.create(null);
  const required = new Set<string>(),
    visited = new Set<Schema>();
  let result: Schema = {};
  while (pending.length) {
    const part = pending.shift()!;
    if (!part || visited.has(part)) continue;
    visited.add(part);
    if (part.$ref) {
      pending.unshift(reference(part.$ref));
      continue;
    }
    result = { ...result, ...part };
    for (const [key, value] of Object.entries(part.properties ?? {})) properties[key] = value;
    for (const key of part.required ?? []) required.add(key);
    pending.push(...(part.allOf ?? []));
  }
  delete result.$ref;
  delete result.allOf;
  if (Object.keys(properties).length) result.properties = properties;
  if (required.size) result.required = [...required];
  return result;
}
export function parameters(path: string, verb = 'get'): RecordData[] {
  const route = Object.hasOwn(spec.paths, path) ? spec.paths[path] : {};
  return [...(route.parameters ?? []), ...(route[verb.toLowerCase()]?.parameters ?? [])].map(
    (parameter) => (parameter.$ref ? reference(parameter.$ref) : parameter),
  );
}
export function bodySchema(path: string, verb: string): Schema {
  const entry = Object.hasOwn(spec.paths, path) ? spec.paths[path][verb.toLowerCase()] : undefined;
  return resolveSchema(entry?.requestBody?.content?.['application/json']?.schema);
}
export const readablePaths = Object.keys(spec.paths).flatMap((path) =>
  spec.paths[path].get &&
  !/\/(?:secret|secrets|password|initial-access-token|search-password)$/.test(path)
    ? [{ path, summary: String(spec.paths[path].get.summary ?? path) }]
    : [],
);
export const plainDescription = (value = '') =>
  value
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
