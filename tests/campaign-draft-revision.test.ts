import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as campaignModel from '../shared/campaign';
import * as certification from '../shared/certification';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
type Scenario = 'settings' | 'scope';
type Hooks = { slots: any[]; cursor: number; effects: Array<() => void> };

// Real parent, detail, certification and saved-read callbacks, with independent
// persistent hook state and a revision-checking in-memory transport.
async function harness(scenario: Scenario) {
  let stored: any = {
    version: 1,
    id: '11111111-1111-4111-8111-111111111111',
    instance: 'synthetic',
    owner: 'Fixture',
    title: 'Original title',
    description: 'Original description',
    state: 'active',
    revision: 1,
    createdAt: '2026-09-27T12:00:00Z',
    updatedAt: '2026-09-27T12:00:00Z',
    captures: [],
    decisions: [],
    rules: [],
    policies: [],
    remediations: [],
    certifications: [],
    certificationScope: {
      enabled: true,
      kinds: ['accounts'],
      prefix: 'Original',
      includeDisabled: false,
    },
    history: [
      {
        revision: 1,
        at: '2026-09-27T12:00:00Z',
        actor: 'Fixture',
        action: 'created',
        detail: 'Synthetic',
      },
    ],
  };
  const writes: any[] = [];
  let applied = 0;
  class RequestError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  async function request(path: string, body?: any) {
    if (path === 'campaigns' && body === undefined)
      return [campaignModel.campaignSummary(structuredClone(stored))];
    assert.equal(path, 'campaigns/' + stored.id);
    if (body !== undefined) {
      writes.push(structuredClone(body));
      if (body.revision !== stored.revision)
        throw new RequestError('Reload before saving: revision conflict', 409);
      if (body.action === 'details')
        Object.assign(stored, { title: body.title, description: body.description });
      else if (body.action === 'certification-scope')
        stored.certificationScope = structuredClone(body.scope);
      else throw new Error('Unexpected mutation');
      stored.revision++;
      applied++;
    }
    return structuredClone(stored);
  }
  const state = (): Hooks => ({ slots: [], cursor: 0, effects: [] });
  const parent = state(),
    detail = state(),
    cert = state();
  let active = parent;
  const hooks = {
    useState(initial: any) {
      const target = active,
        i = target.cursor++;
      if (!(i in target.slots))
        target.slots[i] = typeof initial === 'function' ? initial() : initial;
      return [
        target.slots[i],
        (next: any) => {
          target.slots[i] = typeof next === 'function' ? next(target.slots[i]) : next;
        },
      ];
    },
    useRef(initial: any) {
      const i = active.cursor++;
      return (active.slots[i] ??= { current: initial });
    },
    useMemo(calculate: () => unknown) {
      active.cursor++;
      return calculate();
    },
    useEffect(effect: () => void, deps: any[]) {
      const i = active.cursor++;
      if (!active.slots[i] || deps.some((value, index) => value !== active.slots[i][index])) {
        active.slots[i] = deps;
        active.effects.push(effect);
      }
    },
  };
  const jsx = (type: any, props: any, key: any) => ({ type, props, key });
  const modules: Record<string, any> = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../../api': { request },
    './api': { request, RequestError },
    '../../../shared/campaign': campaignModel,
    '../../../shared/certification': certification,
    '../../components/ui': { ErrorBox: () => null, Loading: () => null, Badge: () => null },
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
  modules['./CertificationReview'] = load('src/features/campaigns/CertificationReview.tsx');
  const components = load('src/features/campaigns/Campaigns.tsx');
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
  function render(component: any, props: any, target: Hooks) {
    active = target;
    target.cursor = 0;
    return walk(component(props));
  }
  const page = () => render(components.Campaigns, { onManageAccount() {} }, parent);
  const content = () => {
    const node = page().find((node) => node.type?.name === 'CampaignDetail');
    return node ? render(node.type, node.props, detail) : [];
  };
  const formNodes = () => {
    if (scenario === 'settings') return content();
    const node = content().find((node) => node.type?.name === 'CertificationReview');
    return node ? render(node.type, node.props, cert) : [];
  };
  function flush() {
    for (let i = 0; i < 3; i++) {
      formNodes();
      for (const target of [parent, detail, cert])
        while (target.effects.length) target.effects.shift()!();
    }
  }
  const button = (label: string, nodes = formNodes()) => {
    const node = nodes.find((node) => node.type === 'button' && text(node).trim() === label);
    assert.ok(node, label);
    return node;
  };
  const input = () =>
    formNodes().find((node) =>
      scenario === 'settings'
        ? node.type === 'textarea' && node.props.rows === 4
        : node.type === 'input' && node.props.maxLength === 128,
    );
  flush();
  await tick();
  page()
    .find((node) => node.type === 'button' && text(node).includes('Original title'))
    .props.onClick();
  await tick();
  button(scenario === 'settings' ? 'Settings' : 'Certification', content()).props.onClick();
  flush();
  return {
    writes,
    button,
    input,
    flush,
    get applied() {
      return applied;
    },
    get stored() {
      return stored;
    },
    edit(value: string) {
      input().props.onChange({ target: { value } });
      flush();
    },
    remote() {
      stored = {
        ...stored,
        revision: stored.revision + 1,
        title: 'Remote title',
        certificationScope: { ...stored.certificationScope, includeDisabled: true },
      };
    },
    async reload() {
      const reload = button('Reload campaign', content());
      assert.ok(!reload.props.disabled);
      reload.props.onClick();
      flush();
      await tick();
      flush();
    },
    submitCallback() {
      if (scenario === 'scope') return button('Save scope').props.onClick;
      const form = content().find(
        (node) => node.type === 'form' && text(node).includes('Save details'),
      );
      return () => form.props.onSubmit({ preventDefault() {} });
    },
    async settle() {
      await tick();
      flush();
    },
  };
}

for (const scenario of ['settings', 'scope'] as const) {
  const save = scenario === 'settings' ? 'Save details' : 'Save scope';
  const reset = scenario === 'settings' ? 'Use saved details' : 'Use saved scope';
  test(`${scenario} keeps a dirty draft after reload, blocks stale submission and explicitly loads current fields`, async () => {
    const ui = await harness(scenario);
    ui.edit('Local draft');
    ui.remote();
    await ui.reload();
    assert.equal(ui.input().props.value, 'Local draft');
    assert.equal(ui.button(save).props.disabled, true);
    ui.submitCallback()();
    await ui.settle();
    assert.equal(ui.writes.length, 0);
    ui.button(reset).props.onClick();
    ui.flush();
    assert.equal(ui.button(save).props.disabled, false);
    ui.edit('Reviewed new draft');
    ui.submitCallback()();
    await ui.settle();
    assert.equal(ui.writes.length, 1);
    assert.equal(ui.writes[0].revision, 2);
    assert.equal(ui.applied, 1);
    if (scenario === 'settings') assert.equal(ui.stored.title, 'Remote title');
    else assert.equal(ui.stored.certificationScope.includeDisabled, true);
    // Acknowledged save advances the baseline: another edit does not conflict
    // with this form's own successful revision.
    ui.edit('Next local draft');
    assert.equal(ui.button(save).props.disabled, false);
    ui.submitCallback()();
    await ui.settle();
    assert.equal(ui.writes[1].revision, 3);
    assert.equal(ui.applied, 2);
  });
  test(`${scenario} refreshes a clean form and retained callbacks preserve their original revision`, async () => {
    const ui = await harness(scenario);
    ui.edit('Original local draft');
    const oldSubmit = ui.submitCallback();
    ui.remote();
    await ui.reload();
    oldSubmit();
    await ui.settle();
    assert.equal(ui.writes[0].revision, 1);
    assert.equal(ui.applied, 0);
    assert.equal(ui.input().props.value, 'Original local draft');
    ui.button(reset).props.onClick();
    ui.flush();
    // A clean form follows a later unrelated campaign revision without becoming
    // permanently pinned or requiring another discard action.
    ui.remote();
    await ui.reload();
    assert.equal(ui.button(save).props.disabled, false);
    ui.submitCallback()();
    await ui.settle();
    assert.equal(ui.writes[1].revision, 3);
    assert.equal(ui.applied, 1);
  });
}
