/** Keep small diagnostic cards, never retain the backing string of a large result. */
export function consolePreview(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const lines: string[] = [];
  let shortened = input.length > 100;
  const notice = '[Console preview truncated; inspect the original response for full output.]';
  let used = Buffer.byteLength(JSON.stringify([notice])) + 1;
  for (const item of input.slice(0, 100)) {
    if (used + 3 > 16384) {
      shortened = true;
      break;
    }
    const source = typeof item === 'string' ? item : (JSON.stringify(item) ?? '');
    // Work only on a bounded prefix, then account for JSON escaping per code point.
    let available = 16384 - used - 3,
      excerpt = '',
      consumed = 0;
    for (const character of source) {
      const bytes = Buffer.byteLength(JSON.stringify(character)) - 2;
      if (available < bytes) break;
      excerpt += character;
      consumed += character.length;
      available -= bytes;
    }
    if (consumed < source.length) shortened = true;
    lines.push(Buffer.from(excerpt).toString());
    used += Buffer.byteLength(JSON.stringify(excerpt)) + 1;
    if (shortened && consumed < source.length) break;
  }
  if (shortened) lines.push(notice);
  return lines;
}
