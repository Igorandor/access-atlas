import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as model from '../shared/access-model';
import * as schema from '../shared/snapshot-schema';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const snapshot = (at: string) => ({
  version: 1,
  instance: 'synthetic-instance',
  startedAt: at,
  capturedAt: at,
  warnings: [],
  users: [],
  roles: [],
  resources: [],
  apps: [],
});
const current = snapshot('2026-09-27T16:00:00Z');
const earlier = snapshot('2026-09-01T00:00:00Z');
const recent = snapshot('2026-09-15T00:00:00Z');
function file(body: string, size = Buffer.byteLength(body)) {
  let reads = 0;
  return {
    size,
    text: async () => {
      reads++;
      return body;
    },
    get reads() {
      return reads;
    },
  };
}
function deferredFile() {
  let resolve!: (body: string) => void, reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { value: { size: 1000, text: () => promise }, resolve, reject };
}

// Execute actual AccessReview callbacks with controlled file reads; the actual
// dynamically loaded schema validates each completed import.
async function harness() {
  const slots: any[] = [],
    effects: Array<() => () => void> = [];
  let cursor = 0,
    stateChanges = 0;
  const hooks = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[i],
        (next: any) => {
          stateChanges++;
          slots[i] = typeof next === 'function' ? next(slots[i]) : next;
        },
      ];
    },
    useRef(initial: any) {
      const i = cursor++;
      return (slots[i] ??= { current: initial });
    },
    useMemo(calculate: () => unknown) {
      cursor++;
      return calculate();
    },
    useEffect(effect: () => () => void, deps: any[]) {
      const i = cursor++;
      if (!slots[i] || deps.some((value, at) => value !== slots[i][at])) {
        slots[i] = deps;
        effects.push(effect);
      }
    },
  };
  const jsx = (type: any, props: any) => ({ type, props });
  const DriftReview = () => null,
    ErrorBox = () => null;
  const dependencies: Record<string, any> = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../api': { request: async () => structuredClone(current) },
    '../../shared/access-model': model,
    '../../shared/snapshot-schema': schema,
    '../components/ui': {
      ErrorBox,
      Badge: () => null,
      Loading: () => null,
      PageHeader: () => null,
    },
    '../features/access/DriftReview': { DriftReview },
  };
  const module = { exports: {} as any };
  runInNewContext(
    transformSync(readFileSync(new URL('../src/pages/AccessReview.tsx', import.meta.url), 'utf8'), {
      loader: 'tsx',
      format: 'cjs',
      jsx: 'automatic',
      supported: { 'dynamic-import': false },
    }).code,
    { module, require: (id: string) => dependencies[id] || {} },
  );
  function walk(node: any): any[] {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(walk);
    return [node, ...walk(node.props?.children)];
  }
  function text(node: any): string {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    if (Array.isArray(node)) return node.map(text).join('');
    return text(node.props?.children);
  }
  function nodes() {
    cursor = 0;
    return walk(module.exports.AccessReview({ navigate() {}, onManageAccount() {} }));
  }
  const button = (label: string) => {
    const node = nodes().find((value) => value.type === 'button' && text(value).trim() === label);
    assert.ok(node, label);
    assert.ok(!node.props.disabled, label + ' enabled');
    return node;
  };
  nodes();
  const cleanup = effects.shift()!();
  await tick();
  button('Changes').props.onClick();
  return {
    button,
    cleanup,
    get stateChanges() {
      return stateChanges;
    },
    baseline: () => nodes().find((value) => value.type === DriftReview)?.props.before,
    error: () => nodes().find((value) => value.type === ErrorBox)?.props.error,
    select(value: any) {
      const input = nodes().find((node) => node.type === 'input' && node.props.type === 'file');
      assert.ok(input);
      assert.ok(!input.props.disabled);
      input.props.onChange({ target: { files: value ? [value] : [], value: 'fixture.json' } });
    },
  };
}

test('a newer successful baseline import owns late success and errors from an earlier file', async () => {
  for (const failure of [false, true]) {
    const ui = await harness(),
      pending = deferredFile();
    ui.select(pending.value);
    await tick();
    ui.select(file(JSON.stringify(recent)));
    await tick();
    if (failure) pending.reject(new Error('Older file failed'));
    else pending.resolve(JSON.stringify(earlier));
    await tick();
    assert.deepEqual(ui.baseline(), recent);
    assert.equal(ui.error(), undefined);
  }
});

test('clear and use-current baseline explicitly supersede pending file reads', async () => {
  for (const action of ['Clear baseline', 'Use current as baseline']) {
    const ui = await harness(),
      pending = deferredFile();
    ui.select(file(JSON.stringify(earlier)));
    await tick();
    ui.select(pending.value);
    await tick();
    ui.button(action).props.onClick();
    pending.resolve(JSON.stringify(recent));
    await tick();
    assert.deepEqual(ui.baseline(), action === 'Clear baseline' ? undefined : current);
  }
});

test('invalid newer imports retain the previous baseline and cannot be replaced by older pending files', async () => {
  const partial = { ...recent, warnings: ['Synthetic incomplete capture'] };
  for (const input of [
    file('{bad'),
    file('{"version":1}'),
    file('{}', 2_000_001),
    file(JSON.stringify({ ...recent, instance: 'other-instance' })),
  ]) {
    const ui = await harness(),
      pending = deferredFile();
    ui.select(file(JSON.stringify(partial)));
    await tick();
    ui.select(pending.value);
    await tick();
    ui.select(input);
    await tick();
    const rejection = ui.error();
    assert.match(rejection, /^Could not import the baseline:/);
    pending.resolve(JSON.stringify(earlier));
    await tick();
    assert.deepEqual(ui.baseline(), partial);
    assert.equal(ui.error(), rejection);
    if (input.size > 2_000_000) assert.equal(input.reads, 0);
  }
});

test('unmount invalidates pending import success and failure without further state updates', async () => {
  for (const failure of [false, true]) {
    const ui = await harness(),
      pending = deferredFile();
    ui.select(pending.value);
    await tick();
    ui.cleanup();
    const before = ui.stateChanges;
    if (failure) pending.reject(new Error('Read failed after unmount'));
    else pending.resolve(JSON.stringify(earlier));
    await tick();
    assert.equal(ui.stateChanges, before);
  }
});
