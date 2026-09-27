import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { findings, type AccessSnapshot } from '../shared/access-model';

type Hooks = { slots: any[]; cursor: number; effects: Array<() => void> };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const snapshot: AccessSnapshot = {
  version: 1,
  instance: 'Fixture',
  startedAt: '2026-09-27T10:00:00Z',
  capturedAt: '2026-09-27T10:00:01Z',
  warnings: [],
  users: [],
  roles: [],
  resources: [],
  apps: [],
};
function nodes(tree: any): any[] {
  return Array.isArray(tree)
    ? tree.flatMap(nodes)
    : tree && typeof tree === 'object'
      ? [tree, ...nodes(tree.props?.children)]
      : [];
}
function text(tree: any): string {
  return Array.isArray(tree)
    ? tree.map(text).join('')
    : tree && typeof tree === 'object'
      ? text(tree.props?.children)
      : typeof tree === 'boolean'
        ? ''
        : String(tree ?? '');
}
function button(tree: any, label: string) {
  const found = nodes(tree).find((node) => node.type === 'button' && text(node).trim() === label);
  assert.ok(found, label);
  return found;
}
async function harness(first: number | AccessSnapshot, campaignStatus = 200) {
  class RequestError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  const review: Hooks = { slots: [], cursor: 0, effects: [] },
    campaigns: Hooks = { slots: [], cursor: 0, effects: [] };
  let active = review,
    result = first;
  const calls: Array<{ path: string; body: unknown }> = [];
  const campaign = {
    id: 'saved-campaign',
    title: 'Saved review',
    description: 'Existing review scope',
    state: 'active',
    captureCount: 0,
    updatedAt: '2026-09-27T10:00:00Z',
  };
  async function request(path: string, body?: unknown) {
    calls.push({ path, body });
    if (path === 'access-snapshot') {
      if (typeof result === 'number')
        throw new RequestError(
          result === 429 ? 'Wait five seconds between captures.' : 'Capture gateway unavailable.',
          result,
        );
      return result;
    }
    assert.equal(body, undefined, 'Opening saved campaigns must only read');
    if (campaignStatus !== 200)
      throw new RequestError('Current campaign permission is required.', campaignStatus);
    if (path === 'campaigns') return [campaign];
    assert.equal(path, 'campaigns/' + campaign.id);
    return campaign;
  }
  const hooks = {
    useState(initial: any) {
      const target = active,
        index = target.cursor++;
      if (!(index in target.slots))
        target.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        target.slots[index],
        (value: any) => {
          target.slots[index] = typeof value === 'function' ? value(target.slots[index]) : value;
        },
      ];
    },
    useRef(initial: any) {
      const index = active.cursor++;
      return (active.slots[index] ??= { current: initial });
    },
    useMemo(calculate: () => unknown) {
      active.cursor++;
      return calculate();
    },
    useEffect(callback: () => void, dependencies: any[]) {
      const index = active.cursor++;
      const previous = active.slots[index];
      if (!previous || dependencies.some((value, i) => value !== previous[i])) {
        active.slots[index] = dependencies;
        active.effects.push(callback);
      }
    },
  };
  const jsx = (type: any, props: any) => ({ type, props });
  const ui = { Badge: 'Badge', ErrorBox: 'ErrorBox', Loading: 'Loading', PageHeader: 'PageHeader' };
  const modules: Record<string, any> = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '../api': { request },
    '../../api': { request },
    './api': { request, RequestError },
    '../components/ui': ui,
    '../../components/ui': ui,
    '../../shared/access-model': { findings },
    '../features/access/AccessMap': { AccessMap: 'AccessMap' },
    '../features/access/ResourceMatrix': { ResourceMatrix: 'ResourceMatrix' },
    '../features/access/DutyReview': { DutyReview: 'DutyReview' },
    '../features/access/ReviewQueue': { ReviewQueue: 'ReviewQueue' },
    '../features/access/AnalysisTools': { AnalysisTools: 'AnalysisTools' },
  };
  function load(file: string) {
    const module = { exports: {} as any };
    runInNewContext(
      transformSync(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
        loader: file.endsWith('tsx') ? 'tsx' : 'ts',
        jsx: 'automatic',
        format: 'cjs',
      }).code,
      { module, require: (id: string) => modules[id] || {} },
    );
    return module.exports;
  }
  modules['../../saved-evidence'] = load('src/saved-evidence.ts');
  modules['../features/campaigns/Campaigns'] = load('src/features/campaigns/Campaigns.tsx');
  const { AccessReview } = load('src/pages/AccessReview.tsx');
  function render(component: any, props: any, target: Hooks) {
    active = target;
    target.cursor = 0;
    return component(props);
  }
  function page() {
    return render(AccessReview, { navigate() {}, onManageAccount() {} }, review);
  }
  function saved() {
    const child = nodes(page()).find((node) => node.type?.name === 'Campaigns');
    assert.ok(child, 'Saved campaigns must be reachable');
    return render(child.type, child.props, campaigns);
  }
  function flush() {
    for (const target of [review, campaigns])
      while (target.effects.length) target.effects.shift()!();
  }
  page();
  flush();
  await tick();
  return {
    page,
    saved,
    flush,
    calls,
    snapshot: () => {
      result = snapshot;
    },
  };
}

for (const status of [503, 429])
  test(`saved campaigns remain reachable after the first whole snapshot request returns ${status}`, async () => {
    const f = await harness(status),
      view = f.page();
    assert.equal(button(view, 'Campaigns').props.disabled, false);
    for (const label of ['Access map', 'Resource matrix', 'Changes', 'Duty rules', 'Analysis'])
      assert.equal(button(view, label).props.disabled, true);
    assert.equal(
      nodes(view).find((node) => node.props?.className === 'tab-count')?.props.children,
      0,
    );
    assert.equal(button(view, 'Snapshot').props.disabled, true);
    assert.ok(
      !nodes(view).some((node) =>
        ['AccessMap', 'DutyReview', 'ResourceMatrix'].includes(node.type),
      ),
    );
    button(view, 'Campaigns').props.onClick();
    f.saved();
    f.flush();
    await tick();
    const list = f.saved();
    assert.match(text(list), /Saved review/);
    assert.deepEqual(
      f.calls.map((call) => call.path),
      ['access-snapshot', 'campaigns'],
    );
    nodes(list)
      .find((node) => node.type === 'button' && text(node).includes('Saved review'))
      .props.onClick();
    await tick();
    assert.equal(
      nodes(f.saved()).find((node) => node.type?.name === 'CampaignDetail')?.props.campaign.id,
      'saved-campaign',
    );
    assert.deepEqual(
      f.calls.map((call) => call.path),
      ['access-snapshot', 'campaigns', 'campaigns/saved-campaign'],
    );
    f.snapshot();
    button(f.page(), 'Capture again').props.onClick();
    await tick();
    assert.equal(button(f.page(), 'Access map').props.disabled, false);
    assert.ok(
      nodes(f.page()).some((node) => node.type?.name === 'Campaigns'),
      'Snapshot recovery must not navigate away from saved work',
    );
  });

test('partial snapshot warnings preserve configuration navigation and independent saved-campaign reads', async () => {
  const f = await harness({ ...snapshot, warnings: ['Native resources temporarily unavailable.'] });
  const view = f.page();
  assert.match(text(view), /Native resources temporarily unavailable/);
  assert.equal(button(view, 'Access map').props.disabled, false);
  assert.equal(button(view, 'Campaigns').props.disabled, false);
  assert.ok(nodes(view).some((node) => node.type === 'AccessMap'));
  button(view, 'Campaigns').props.onClick();
  f.saved();
  f.flush();
  await tick();
  assert.match(text(f.saved()), /Saved review/);
  assert.deepEqual(
    f.calls.map((call) => call.path),
    ['access-snapshot', 'campaigns'],
  );
});

test('independent campaign navigation still honors a denied campaign read', async () => {
  const f = await harness(503, 403);
  button(f.page(), 'Campaigns').props.onClick();
  f.saved();
  f.flush();
  await tick();
  const view = f.saved();
  assert.equal(
    nodes(view).find((node) => node.type === 'ErrorBox')?.props.error,
    'Current campaign permission is required.',
  );
  assert.ok(!text(view).includes('Saved review'));
  assert.ok(!nodes(view).some((node) => node.type?.name === 'CampaignDetail'));
  assert.deepEqual(
    f.calls.map((call) => call.path),
    ['access-snapshot', 'campaigns'],
  );
});
