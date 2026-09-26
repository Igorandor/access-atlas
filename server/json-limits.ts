/** Inspect JSON breadth and depth before transformations or retention. */
export function boundedJson(value: unknown, maxDepth: number, maxNodes: number): boolean {
  const todo: Array<{ value: unknown; level: number }> = [{ value, level: 0 }];
  let remaining = maxNodes;
  while (todo.length) {
    const current = todo.pop()!;
    if (--remaining < 0 || current.level > maxDepth) return false;
    if (current.value && typeof current.value === 'object') {
      const children = Object.values(current.value);
      if (children.length + todo.length > remaining) return false;
      for (const child of children) todo.push({ value: child, level: current.level + 1 });
    }
  }
  return true;
}
