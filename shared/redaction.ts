/** Atlas exports configuration evidence; credentials never belong in that evidence. */
const credentialName = (name: string) => {
  const letters = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    ['password', 'token', 'privatekey', 'walletsecretconfig', 'hotpkey'].some((part) =>
      letters.includes(part),
    ) ||
    letters.endsWith('secret') ||
    letters.endsWith('secrets')
  );
};
// These documented account-policy flags contain no credential material.
const accountPolicyFlag = (name: string, value: unknown) =>
  typeof value === 'boolean' &&
  ['ChangePassword', 'PasswordNeverExpires', 'HOTPKeyDisplay'].includes(name);
export function credentialValues(root: unknown, classified = false): string[] {
  const found: string[] = [],
    stack: Array<[unknown, boolean]> = [[root, classified]];
  while (stack.length) {
    const [value, protectedBranch] = stack.pop()!;
    if (typeof value === 'string') {
      if (protectedBranch && value.length) found.push(value);
    } else if (Array.isArray(value)) for (const item of value) stack.push([item, protectedBranch]);
    else if (value && typeof value === 'object')
      for (const [name, item] of Object.entries(value))
        stack.push([item, protectedBranch || credentialName(name)]);
  }
  return found;
}
export function redact(root: any, known: readonly string[] = []): any {
  const dictionary = Array.from(new Set(known))
    .filter((s) => s.length)
    .sort((x, y) => y.length - x.length);
  const escapeLiteral = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = dictionary.length
    ? new RegExp(dictionary.map(escapeLiteral).join('|'), 'g')
    : null;
  const holder: any = { value: null };
  const jobs: Array<{ source: any; target: any; key: string }> = [
    { source: root, target: holder, key: 'value' },
  ];
  while (jobs.length) {
    const { source, target, key } = jobs.pop()!;
    if (!source || typeof source !== 'object') {
      Object.defineProperty(target, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value:
          typeof source === 'string' && matcher
            ? source.replace(matcher, () => '[redacted]')
            : source,
      });
      continue;
    }
    const copy: any = Array.isArray(source) ? [] : {};
    Object.defineProperty(target, key, {
      value: copy,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    for (const [name, child] of Object.entries(source)) {
      if (!Array.isArray(source) && credentialName(name) && !accountPolicyFlag(name, child))
        Object.defineProperty(copy, name, {
          value: '[redacted]',
          enumerable: true,
          configurable: true,
          writable: true,
        });
      else jobs.push({ source: child, target: copy, key: name });
    }
  }
  return holder.value;
}
