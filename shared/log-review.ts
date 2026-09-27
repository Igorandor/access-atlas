export type LogEntry = {
  id: string;
  index: number;
  source: string;
  timestamp: string;
  epoch?: number;
  level: 'error' | 'warning' | 'information' | 'unclassified';
  levelBasis: 'native field' | 'text keyword' | 'not classified';
  actor: string;
  message: string;
  raw: unknown;
};
export type LogFilter = {
  include: string;
  exclude: string;
  actor: string;
  levels: LogEntry['level'][];
  from?: number;
  to?: number;
  includeUnknownTime: boolean;
};
const label = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';
function firstField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys)
    if (record[key] !== undefined && record[key] !== null) return label(record[key]);
  return '';
}
function stableId(source: string, index: number, text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return source + ':' + index + ':' + (hash >>> 0).toString(16);
}
export function normalizeLogEntries(source: string, value: unknown): LogEntry[] {
  const object =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(object?.lines)
      ? object.lines
      : Array.isArray(object?.Records)
        ? object.Records
        : Array.isArray(object?.records)
          ? object.records
          : Array.isArray(object?.Entries)
            ? object.Entries
            : object
              ? [object]
              : typeof value === 'string'
                ? value.split('\n')
                : [];
  return rows.slice(0, 1000).map((raw, index) => {
    const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const text =
      typeof raw === 'string'
        ? raw
        : firstField(record, [
            'Message',
            'message',
            'Description',
            'description',
            'Text',
            'text',
            'Event',
            'Result',
            'Error',
          ]) || JSON.stringify(raw);
    const message = text.slice(0, 16_000);
    const timestamp =
      firstField(record, [
        'TimeStamp',
        'Timestamp',
        'timestamp',
        'DateTime',
        'Time',
        'time',
        'at',
        'StartTimeUTC',
        'StartTime',
        'LastStart',
        'LogDatetime',
      ]) ||
      message.match(/^\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:\d{2})?/)?.[0] ||
      message.match(/^\d{2}\/\d{2}\/\d{2,4}[- ][\d:.]+/)?.[0] ||
      '';
    // Host-local strings remain text. Do not invent a timezone for a native log.
    const parsed = /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? Date.parse(timestamp) : NaN;
    const nativeLevel = firstField(record, [
      'Severity',
      'severity',
      'Level',
      'level',
      'Status',
      'status',
    ]).toLowerCase();
    let level: LogEntry['level'] = 'unclassified';
    let levelBasis: LogEntry['levelBasis'] = 'not classified';
    if (/^(error|fatal|failed|failure|critical)$/.test(nativeLevel)) {
      level = 'error';
      levelBasis = 'native field';
    } else if (/^(warn|warning)$/.test(nativeLevel)) {
      level = 'warning';
      levelBasis = 'native field';
    } else if (/^(info|information|informational|success|completed)$/.test(nativeLevel)) {
      level = 'information';
      levelBasis = 'native field';
    } else if (/\b(error|fatal|failure|failed|exception)\b/i.test(message)) {
      level = 'error';
      levelBasis = 'text keyword';
    } else if (/\b(warn|warning)\b/i.test(message)) {
      level = 'warning';
      levelBasis = 'text keyword';
    }
    return {
      id: stableId(source, index, message),
      index,
      source,
      timestamp,
      epoch: Number.isFinite(parsed) ? parsed : undefined,
      level,
      levelBasis,
      actor: firstField(record, [
        'Username',
        'UserName',
        'User',
        'user',
        'Actor',
        'actor',
        'RunAsUser',
      ]),
      message,
      raw,
    };
  });
}
export function filterLogEntries(entries: LogEntry[], filter: LogFilter) {
  const include = filter.include.toLowerCase();
  const exclude = filter.exclude.toLowerCase();
  return entries.filter((entry) => {
    if (include && !(entry.message + ' ' + entry.actor).toLowerCase().includes(include))
      return false;
    if (exclude && (entry.message + ' ' + entry.actor).toLowerCase().includes(exclude))
      return false;
    if (filter.actor && entry.actor !== filter.actor) return false;
    if (filter.levels.length && !filter.levels.includes(entry.level)) return false;
    if (filter.from !== undefined || filter.to !== undefined) {
      if (entry.epoch === undefined) return filter.includeUnknownTime;
      if (filter.from !== undefined && entry.epoch < filter.from) return false;
      if (filter.to !== undefined && entry.epoch > filter.to) return false;
    }
    return true;
  });
}
export function logSummary(entries: LogEntry[]) {
  const counts = { error: 0, warning: 0, information: 0, unclassified: 0 };
  const actors = new Map<string, number>();
  let heuristic = 0;
  let unknownTime = 0;
  for (const entry of entries) {
    counts[entry.level]++;
    if (entry.actor) actors.set(entry.actor, (actors.get(entry.actor) || 0) + 1);
    if (entry.levelBasis === 'text keyword') heuristic++;
    if (entry.epoch === undefined) unknownTime++;
  }
  return { counts, actors: [...actors].sort((a, b) => b[1] - a[1]), heuristic, unknownTime };
}
export function compareLogWindows(before: LogEntry[], after: LogEntry[]) {
  const key = (entry: LogEntry) =>
    JSON.stringify([entry.source, entry.timestamp, entry.actor, entry.message]);
  const available = new Map<string, number>();
  for (const entry of before) available.set(key(entry), (available.get(key(entry)) || 0) + 1);
  let shared = 0;
  const newlyObserved: LogEntry[] = [];
  for (const entry of after) {
    const count = available.get(key(entry)) || 0;
    if (count) {
      shared++;
      available.set(key(entry), count - 1);
    } else newlyObserved.push(entry);
  }
  return { shared, newlyObserved, noLongerInWindow: before.length - shared };
}
export function logCsv(entries: LogEntry[]) {
  const cell = (value: unknown) => {
    const text = String(value ?? '');
    // CSV opened in a spreadsheet must not interpret log text as a formula.
    const escaped = /^(?:\s*[=+\-@]|[\t\r\n])/.test(text) ? "'" + text : text;
    return '"' + escaped.replace(/"/g, '""') + '"';
  };
  return [
    ['source', 'timestamp', 'level', 'classification basis', 'actor', 'message']
      .map(cell)
      .join(','),
    ...entries.map((entry) =>
      [entry.source, entry.timestamp, entry.level, entry.levelBasis, entry.actor, entry.message]
        .map(cell)
        .join(','),
    ),
  ].join('\r\n');
}
