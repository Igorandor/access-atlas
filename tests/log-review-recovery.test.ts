import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as schema from '../shared/schema';
import * as logs from '../shared/log-review';
import { RequestError } from '../src/api';

// Execute the actual component and its event handlers with deterministic hook state.
// CSS and presentation-only child components are irrelevant to these state transitions.
function componentFixture() {
  const slots: any[] = [];
  let cursor = 0;
  let response: () => Promise<any> = async () => ({ data: { lines: ['private log evidence'] } });
  const module = { exports: {} as any };
  const exportsSent: unknown[] = [];
  const hooks = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (next: any) => {
          slots[index] = typeof next === 'function' ? next(slots[index]) : next;
        },
      ];
    },
    useRef(initial: any) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useMemo(calculate: () => unknown) {
      return calculate();
    },
    useEffect() {},
  };
  const require = createRequire(import.meta.url);
  const code = transformSync(
    readFileSync(new URL('../src/desk/LogReview.tsx', import.meta.url), 'utf8'),
    { loader: 'tsx', jsx: 'automatic', format: 'cjs' },
  ).code;
  runInNewContext(code, {
    module,
    performance,
    require(id: string) {
      if (id === 'react') return hooks;
      if (id === 'react/jsx-runtime') return require(id);
      if (id === '../api')
        return {
          RequestError,
          iris: () => response(),
          request: async () => (await response()).data,
          download: (_name: string, data: unknown) => exportsSent.push(data),
        };
      if (id === '../../shared/schema') return schema;
      if (id === '../../shared/log-review') return logs;
      return {};
    },
  });
  function render() {
    cursor = 0;
    return module.exports.LogReview();
  }
  function nodes(node?: any): any[] {
    if (arguments.length === 0) node = render();
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap((item) => nodes(item));
    return [node, ...nodes(node.props?.children ?? null)];
  }
  function text(node: any): string {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    if (Array.isArray(node)) return node.map(text).join('');
    return text(node.props?.children);
  }
  function button(label: string) {
    return nodes().find((node) => node.type === 'button' && text(node) === label);
  }
  async function flush() {
    await new Promise((resolve) => setImmediate(resolve));
  }
  async function load() {
    nodes()
      .find((node) => node.type === 'form')
      .props.onSubmit({ preventDefault() {} });
    await flush();
  }
  async function annotate() {
    await load();
    const entry = nodes().find(
      (node) => node.type === 'button' && text(node).includes('private log evidence'),
    );
    assert.ok(entry, 'actual component displays the loaded fixture');
    entry.props.onClick();
    nodes()
      .find((node) => node.type === 'textarea')
      .props.onChange({ target: { value: 'private annotation' } });
    button('Use this window as baseline').props.onClick();
    button('Entries').props.onClick();
  }
  return {
    render,
    nodes,
    text,
    button,
    load,
    annotate,
    flush,
    exportsSent,
    respond: (next: () => Promise<any>) => {
      response = next;
    },
  };
}

test('log source read 403 removes capture, baseline, inspection, notes and exports', async () => {
  const ui = componentFixture();
  await ui.annotate();
  ui.respond(async () => {
    throw new RequestError('Logs permission revoked', 403);
  });
  await ui.load();
  assert.equal(ui.button('Export filtered JSON'), undefined);
  assert.equal(ui.button('Export filtered CSV'), undefined);
  assert.ok(!ui.text(ui.render()).includes('private log evidence'));
  assert.equal(
    ui.nodes().find((node) => node.type === 'textarea'),
    undefined,
  );
  ui.respond(async () => ({ data: { lines: ['private log evidence'] } }));
  await ui.load();
  assert.equal(
    ui.button('Compare windows').props.disabled,
    true,
    'revoked baseline is not restored',
  );
  ui.button('Export filtered JSON').props.onClick();
  assert.deepEqual(Object.keys((ui.exportsSent[0] as any).notes), []);
});

test('temporary log failure retains the selected record, baseline, annotation and export', async () => {
  const ui = componentFixture();
  await ui.annotate();
  ui.respond(async () => {
    throw new RequestError('Temporary source failure', 500);
  });
  await ui.load();
  assert.ok(ui.text(ui.render()).includes('private log evidence'));
  assert.equal(
    ui.nodes().find((node) => node.type === 'textarea').props.value,
    'private annotation',
  );
  assert.equal(ui.button('Compare windows').props.disabled, false);
  ui.button('Export filtered JSON').props.onClick();
  assert.deepEqual(Object.values((ui.exportsSent[0] as any).notes), ['private annotation']);
});

test('a late response cannot repopulate or invalidate a different selected log source', async () => {
  for (const denied of [false, true]) {
    const ui = componentFixture();
    await ui.annotate();
    let finish!: (value: any) => void;
    let fail!: (error: Error) => void;
    ui.respond(
      () =>
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
    );
    await ui.load();
    assert.equal(
      ui.button('IRIS alerts').props.disabled,
      true,
      'source switching is disabled during reads',
    );
    // Even a previously queued callback must be made obsolete by the source generation.
    ui.button('IRIS alerts').props.onClick();
    if (denied) fail(new RequestError('Old messages refusal', 403));
    else finish({ data: { lines: ['late private log evidence'] } });
    await ui.flush();
    assert.ok(!ui.text(ui.render()).includes('private log evidence'));
    assert.equal(ui.button('Export filtered JSON'), undefined);
    ui.respond(async () => ({ data: { lines: ['new alerts evidence'] } }));
    await ui.load();
    assert.ok(ui.text(ui.render()).includes('new alerts evidence'));
    assert.ok(!ui.nodes().some((node) => node.props?.error === 'Old messages refusal'));
  }
});
