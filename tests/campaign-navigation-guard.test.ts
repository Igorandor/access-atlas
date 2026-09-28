import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

// Execute the real campaign component tree with separate keyed hook state and
// effect cleanup. Unlike a static JSX assertion, removed forms really unmount.
async function harness(kind: 'scope' | 'finding') {
  const campaign: any = {
    id: 'first',
    title: 'First campaign',
    description: '',
    instance: 'Fixture',
    owner: 'Reviewer',
    state: 'active',
    revision: 1,
    captures: [{ id: 'capture', snapshot: { warnings: [] } }],
    decisions: [],
    certifications: [],
    rules: [],
    policies: [],
    remediations: [],
    history: [],
    certificationScope: { enabled: true, kinds: ['accounts'], prefix: '', includeDisabled: false },
  };
  const second = { ...structuredClone(campaign), id: 'second', title: 'Second campaign' };
  const documents = new Map([
    ['first', campaign],
    ['second', second],
  ]);
  const writes: any[] = [];
  let refuseRead = false,
    refuseSave = false;
  let saveFailureStatus = 409;
  class RequestError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  async function request(path: string, input?: any) {
    if (path === 'campaigns' && input === undefined)
      return [...documents.values()].map((value) => ({
        ...value,
        captureCount: 1,
        updatedAt: '2026-09-28',
      }));
    if (refuseRead && input === undefined) throw new RequestError('Temporary read failure', 500);
    const stored = documents.get(path.split('/')[1])!;
    if (input) {
      writes.push(structuredClone(input));
      if (refuseSave) throw new RequestError('Save refused', saveFailureStatus);
      if (input.action === 'certification-scope')
        stored.certificationScope = structuredClone(input.scope);
      if (input.action === 'decision')
        stored.decisions = [{ ...input, reviewedAt: '2026-09-28T12:00:00Z' }];
      stored.revision++;
    }
    return structuredClone(stored);
  }
  const finding = {
    id: 'finding',
    target: 'Operator',
    title: 'Review operator',
    detail: 'Synthetic evidence',
    fingerprint: 'fp',
  };
  type HookState = { slots: any[]; cursor: number };
  const states = new Map<string, HookState>();
  let active: HookState,
    used = new Set<string>(),
    effects: Array<() => void> = [],
    changed = false;
  const hooks = {
    useState(initial: any) {
      const target = active,
        index = target.cursor++;
      if (!target.slots[index]) {
        const slot: any = { value: typeof initial === 'function' ? initial() : initial };
        slot.set = (next: any) => {
          const value = typeof next === 'function' ? next(slot.value) : next;
          if (!Object.is(value, slot.value)) {
            slot.value = value;
            changed = true;
          }
        };
        target.slots[index] = slot;
      }
      return [target.slots[index].value, target.slots[index].set];
    },
    useRef(value: any) {
      return (active.slots[active.cursor++] ??= { current: value });
    },
    useMemo(calculate: () => unknown) {
      active.cursor++;
      return calculate();
    },
    useEffect(effect: () => unknown, deps?: any[]) {
      const target = active,
        index = target.cursor++,
        previous = target.slots[index];
      if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
        const slot: any = { deps, cleanup: previous?.cleanup };
        target.slots[index] = slot;
        effects.push(() => {
          slot.cleanup?.();
          slot.cleanup = effect();
        });
      }
    },
  };
  const jsx = (type: any, props: any, key: any) => ({ type, props, key });
  const modules: Record<string, any> = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../../api': { request, RequestError, download() {} },
    './api': { request, RequestError },
    '../../components/ui': { Modal: function Modal() {}, ErrorBox: function ErrorBox() {} },
    '../../../shared/campaign': {
      campaignProgress: (value: any) => ({
        reviewed: value.decisions.length,
        rows: [{ finding, decision: value.decisions[0] }],
        openChanges: 0,
        overdue: 0,
      }),
    },
    '../../../shared/certification': {
      certificationCoverage: () => ({ rows: [], total: 0, pending: 0 }),
      certificationEvidence() {},
    },
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
  const owned = new Set([
    'Campaigns',
    'CampaignDetail',
    'CampaignDecisions',
    'DecisionForm',
    'CertificationReview',
  ]);
  function render(node: any, path: string): any {
    if (Array.isArray(node))
      return node.map((item, index) => render(item, path + '/' + (item?.key ?? index)));
    if (!node || typeof node !== 'object') return node;
    if (owned.has(node.type?.name)) {
      const identity = path + '/' + node.type.name + ':' + (node.key ?? '');
      used.add(identity);
      active = states.get(identity) ?? { slots: [], cursor: 0 };
      states.set(identity, active);
      active.cursor = 0;
      return render(node.type(node.props), identity);
    }
    return {
      ...node,
      props: { ...node.props, children: render(node.props?.children, path + '/children') },
    };
  }
  function walk(node: any): any[] {
    return Array.isArray(node)
      ? node.flatMap(walk)
      : node && typeof node === 'object'
        ? [node, ...walk(node.props?.children)]
        : [];
  }
  const text = (node: any): string =>
    Array.isArray(node)
      ? node.map(text).join('')
      : node && typeof node === 'object'
        ? text(node.props?.children)
        : node == null || typeof node === 'boolean'
          ? ''
          : String(node);
  let nodes: any[] = [];
  function flush() {
    for (let attempts = 0; attempts < 20; attempts++) {
      changed = false;
      used = new Set();
      effects = [];
      nodes = walk(render(jsx(components.Campaigns, { onManageAccount() {} }, null), 'root'));
      for (const [key, state] of states)
        if (!used.has(key)) {
          for (const slot of state.slots) slot?.cleanup?.();
          states.delete(key);
        }
      for (const effect of effects) effect();
      if (!changed) return;
    }
    throw new Error('Hook tree did not settle');
  }
  const button = (label: string) => {
    flush();
    const node = nodes.find((value) => value.type === 'button' && text(value).trim() === label);
    assert.ok(node, label);
    return node;
  };
  const click = (label: string) => {
    const node = button(label);
    assert.ok(!node.props.disabled, label);
    node.props.onClick();
    flush();
  };
  const tick = async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    flush();
  };
  flush();
  await tick();
  nodes
    .find((value) => value.type === 'button' && text(value).startsWith('First campaign'))
    .props.onClick();
  await tick();
  if (kind === 'scope') click('Certification');
  else click('Review');
  const input = () => {
    flush();
    return nodes.find((node) =>
      kind === 'scope'
        ? node.type === 'input' && node.props.maxLength === 128
        : node.type === 'textarea' && node.props.maxLength === 4000 && node.props.rows === 4,
    );
  };
  return {
    click,
    button,
    tick,
    writes,
    edit(value: string) {
      input().props.onChange({ target: { value } });
      flush();
    },
    value: () => input()?.props.value,
    modal() {
      flush();
      return nodes.find((node) => node.props?.title?.startsWith('Discard unsaved'));
    },
    switchCampaign() {
      flush();
      nodes
        .find((node) => node.type === 'button' && text(node).startsWith('Second campaign'))
        .props.onClick();
      flush();
    },
    failRead() {
      refuseRead = true;
    },
    failSave(status = 409) {
      refuseSave = true;
      saveFailureStatus = status;
    },
    remoteRevision() {
      campaign.revision++;
    },
    async save() {
      if (kind === 'scope') click('Save scope');
      else {
        flush();
        nodes
          .find((node) => node.type === 'form' && node.props.className === 'campaign-decision-form')
          .props.onSubmit({ preventDefault() {} });
      }
      await tick();
    },
    campaignTitle() {
      flush();
      return nodes.filter((node) => node.type === 'h2').map(text);
    },
  };
}

for (const kind of ['scope', 'finding'] as const) {
  test(`${kind}: campaign tab navigation protects draft, Escape keeps editing, explicit discard leaves`, async () => {
    const ui = await harness(kind);
    ui.edit('Unsaved review');
    ui.click('Activity');
    assert.equal(ui.modal().props.title, 'Discard unsaved review changes?');
    assert.equal(ui.value(), 'Unsaved review');
    ui.modal().props.onClose();
    assert.equal(ui.value(), 'Unsaved review');
    assert.equal(ui.modal(), undefined);
    ui.click('Activity');
    ui.click('Keep editing');
    assert.equal(ui.value(), 'Unsaved review');
    ui.click('Activity');
    ui.click('Discard draft');
    ui.click(kind === 'scope' ? 'Certification' : 'Decisions');
    if (kind === 'finding') ui.click('Review');
    assert.equal(ui.value(), '');
    assert.equal(ui.writes.length, 0);
  });
  test(`${kind}: campaign replacement preserves drafts on cancellation or failed reads`, async () => {
    const ui = await harness(kind);
    ui.edit('Unsaved review');
    ui.switchCampaign();
    assert.equal(ui.modal().props.title, 'Discard unsaved campaign changes?');
    ui.click('Keep editing');
    assert.equal(ui.value(), 'Unsaved review');
    ui.failRead();
    ui.switchCampaign();
    ui.click('Discard and continue');
    await ui.tick();
    assert.equal(ui.value(), 'Unsaved review');
    assert.ok(ui.campaignTitle().includes('First campaign'));
    ui.switchCampaign();
    assert.ok(ui.modal(), 'failed replacement must not clear dirty state');
    assert.equal(ui.writes.length, 0);
  });
  test(`${kind}: refused save retains draft protection; successful save permits navigation`, async () => {
    const refused = await harness(kind);
    refused.edit('Draft');
    refused.failSave();
    await refused.save();
    assert.equal(refused.value(), 'Draft');
    refused.click('Activity');
    assert.ok(refused.modal());
    const saved = await harness(kind);
    saved.edit('Saved');
    await saved.save();
    saved.click('Activity');
    assert.equal(saved.modal(), undefined);
    assert.equal(saved.writes.length, 1);
  });
}

test('authorized revalidation of a newer revision does not remount or discard a finding draft', async () => {
  const ui = await harness('finding');
  ui.edit('Unsubmitted reasoning');
  ui.remoteRevision();
  ui.failSave(403);
  await ui.save();
  assert.equal(ui.value(), 'Unsubmitted reasoning');
  ui.click('Activity');
  assert.ok(ui.modal(), 'The retained finding draft must still be guarded');
  assert.equal(ui.writes.length, 1, 'Authorization revalidation must never replay the write');
});
