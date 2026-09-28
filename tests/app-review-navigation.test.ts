import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

function harness() {
  type Hooks = { slots: any[]; cursor: number; effects: Array<() => void> };
  const app: Hooks = { slots: [], cursor: 0, effects: [] };
  const finder: Hooks = { slots: [], cursor: 0, effects: [] };
  let active = app;
  const handlers = new Map<string, (event?: any) => void>();
  const react = {
    lazy: () => function LazyWorkspace() {},
    useState(initial: any) {
      const state = active,
        index = state.cursor++;
      if (!(index in state.slots))
        state.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        state.slots[index],
        (value: any) => {
          state.slots[index] = typeof value === 'function' ? value(state.slots[index]) : value;
        },
      ];
    },
    useRef: (value: any) => (active.slots[active.cursor++] ??= { current: value }),
    useEffect(callback: () => void, dependencies: any[]) {
      const index = active.cursor++,
        previous = active.slots[index];
      if (!previous || dependencies.some((value, i) => value !== previous[i])) {
        active.slots[index] = dependencies;
        active.effects.push(callback);
      }
    },
  };
  const jsx = (type: any, props: any) => ({ type, props });
  const modules: Record<string, any> = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    './api': { request: async () => ({ info: { username: 'Synthetic reviewer' } }) },
    './layout/AtlasShell': { AtlasShell: function AtlasShell() {} },
    './components/DeferredWorkspace': { DeferredWorkspace: function DeferredWorkspace() {} },
    './components/ui': { ModalBoundary: function ModalBoundary() {}, Modal: function Modal() {} },
  };
  const module = { exports: {} as any };
  const location = { hash: '#atlas' };
  runInNewContext(
    transformSync(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), {
      loader: 'tsx',
      jsx: 'automatic',
      format: 'cjs',
    }).code,
    {
      module,
      require: (id: string) => modules[id] || {},
      location,
      localStorage: { getItem: () => 'light', setItem() {} },
      document: { documentElement: { dataset: {} } },
      window: {
        addEventListener: (name: string, handler: () => void) => handlers.set(name, handler),
        removeEventListener() {},
      },
    },
  );
  const walk = (node: any): any[] =>
    Array.isArray(node)
      ? node.flatMap(walk)
      : node && typeof node === 'object'
        ? [node, ...walk(node.props?.children)]
        : [];
  const text = (node: any): string =>
    Array.isArray(node)
      ? node.map(text).join('')
      : node && typeof node === 'object'
        ? text(node.props?.children)
        : node == null || typeof node === 'boolean'
          ? ''
          : String(node);
  function render() {
    active = app;
    app.cursor = 0;
    const nodes = walk(module.exports.default());
    while (app.effects.length) app.effects.shift()!();
    return nodes;
  }
  render();
  return {
    boundary: () => render().find((node) => node.type === modules['./components/ui'].ModalBoundary),
    workspace() {
      const retained = render().find(
        (node) => node.type === 'div' && typeof node.props.hidden === 'boolean',
      );
      assert.ok(retained, 'retained review container');
      return walk(retained).find((node) => node.type?.name === 'LazyWorkspace')?.type;
    },
    move(page: string) {
      render()
        .find((node) => node.type === modules['./layout/AtlasShell'].AtlasShell)
        .props.navigate(page);
    },
    hashMove(page: string) {
      location.hash = '#' + page;
      handlers.get('hashchange')!();
    },
    endSession() {
      handlers.get('session-ended')!();
    },
    openFinder() {
      handlers.get('keydown')!({ ctrlKey: true, key: 'k', preventDefault() {} });
      assert.ok(render().find((node) => node.type?.name === 'ToolFinder'));
    },
    search(query: string) {
      const node = render().find((node) => node.type?.name === 'ToolFinder');
      active = finder;
      finder.cursor = 0;
      walk(node.type(node.props))
        .find((item) => item.type === 'input')
        .props.onChange({ target: { value: query } });
      finder.cursor = 0;
      return walk(node.type(node.props))
        .filter((item) => item.type === 'button')
        .map(text);
    },
  };
}

test('workspace navigation suspends retained review modals and restoring review preserves its component identity', async () => {
  const app = harness();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const workspace = app.workspace();
  assert.ok(workspace);
  assert.equal(app.boundary()?.props.suspended, false);
  app.openFinder();
  app.move('logs');
  assert.equal(app.boundary()?.props.suspended, true);
  assert.equal(app.workspace(), workspace, 'review and its drafts stay mounted');
  app.hashMove('atlas');
  assert.equal(app.boundary()?.props.suspended, false);
  assert.equal(app.workspace(), workspace);
  app.endSession();
  assert.equal(app.boundary(), undefined, 'session end removes retained evidence');
});

test('tool finder makes the SQL privilege workspace discoverable by SQL and grant keywords', async () => {
  const app = harness();
  await new Promise<void>((resolve) => setImmediate(resolve));
  app.openFinder();
  assert.deepEqual(app.search('sql'), ['Access review']);
  assert.deepEqual(app.search('grants'), ['Access review']);
});
