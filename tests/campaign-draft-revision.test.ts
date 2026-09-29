import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as campaignModel from '../shared/campaign';
import * as campaignReport from '../shared/campaign-report';
import * as certification from '../shared/certification';
import * as dutyRules from '../shared/duty-rules';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
type Scenario = 'settings' | 'scope' | 'status' | 'rules';
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
  if (scenario === 'rules')
    stored.captures = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        label: 'Saved access',
        snapshot: {
          version: 1,
          instance: stored.instance,
          startedAt: stored.createdAt,
          capturedAt: stored.createdAt,
          users: [],
          resources: [],
          apps: [],
          warnings: [],
          roles: ['Requester', 'Approver'].map((Name) => ({
            Name,
            Description: '',
            GrantedRoles: [],
            Resources: [],
            EscalationOnly: false,
          })),
        },
      },
    ];
  const writes: any[] = [];
  let applied = 0;
  let refuseStatus = true;
  let failList = false;
  let listFailureStatus = 500;
  let mutationFailureStatus: number | undefined;
  let caseFailureStatus: number | undefined;
  const reads: string[] = [];
  let readGate:
    | { promise: Promise<any>; resolve: (value: any) => void; reject: (error: Error) => void }
    | undefined;
  const focusEvents: string[] = [];
  let scrolls = 0;
  class RequestError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  async function request(path: string, body?: any) {
    if (path === 'campaigns' && body === undefined) {
      if (failList) throw new RequestError('List refresh failed', listFailureStatus);
      return [campaignModel.campaignSummary(structuredClone(stored))];
    }
    assert.equal(path, 'campaigns/' + stored.id);
    if (body === undefined) {
      reads.push(path);
      if (readGate) return readGate.promise;
      if (caseFailureStatus) throw new RequestError('Case read failed', caseFailureStatus);
    }
    if (body !== undefined) {
      writes.push(structuredClone(body));
      if (mutationFailureStatus) throw new RequestError('Mutation refused', mutationFailureStatus);
      if (body.revision !== stored.revision)
        throw new RequestError('Reload before saving: revision conflict', 409);
      if (body.action === 'details')
        Object.assign(stored, { title: body.title, description: body.description });
      else if (body.action === 'certification-scope')
        stored.certificationScope = structuredClone(body.scope);
      else if (body.action === 'rules') stored.rules = structuredClone(body.rules);
      else if (body.action === 'state') {
        if (refuseStatus) throw new RequestError('Resolve investigating decisions first.', 409);
        stored.state = body.state;
      } else throw new Error('Unexpected mutation');
      stored.revision++;
      applied++;
    }
    return structuredClone(stored);
  }
  const state = (): Hooks => ({ slots: [], cursor: 0, effects: [] });
  const parent = state(),
    detail = state(),
    cert = state(),
    duty = state();
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
    '../../api': { request, RequestError },
    './api': { request, RequestError },
    '../../../shared/campaign': campaignModel,
    '../../../shared/campaign-report': campaignReport,
    '../../../shared/certification': certification,
    '../../../shared/duty-rules': dutyRules,
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
  modules['../access/DutyReview'] = load('src/features/access/DutyReview.tsx');
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
    const nodes = walk(component(props));
    for (const node of nodes) {
      if (node.props?.ref && node.props['aria-label'] === 'Campaign status change not completed')
        node.props.ref.current = {
          focus() {
            focusEvents.push(node.props['aria-label']);
          },
          scrollIntoView() {
            scrolls++;
          },
        };
    }
    return nodes;
  }
  const page = () => render(components.Campaigns, { onManageAccount() {} }, parent);
  const content = () => {
    const node = page().find((node) => node.type?.name === 'CampaignDetail');
    return node ? render(node.type, node.props, detail) : [];
  };
  const formNodes = () => {
    if (scenario === 'rules') {
      const node = content().find((node) => node.type?.name === 'DutyReview');
      return node ? render(node.type, node.props, duty) : [];
    }
    if (scenario !== 'scope') return content();
    const node = content().find((node) => node.type?.name === 'CertificationReview');
    return node ? render(node.type, node.props, cert) : [];
  };
  function flush() {
    for (let i = 0; i < 3; i++) {
      formNodes();
      for (const target of [parent, detail, cert, duty])
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
      scenario !== 'scope'
        ? node.type === 'textarea' && node.props.rows === (scenario === 'status' ? 3 : 4)
        : node.type === 'input' && node.props.maxLength === 128,
    );
  flush();
  await tick();
  page()
    .find((node) => node.type === 'button' && text(node).includes('Original title'))
    .props.onClick();
  await tick();
  button(
    scenario === 'rules' ? 'Duty rules' : scenario !== 'scope' ? 'Settings' : 'Certification',
    content(),
  ).props.onClick();
  flush();
  return {
    writes,
    reads,
    ruleFields: () =>
      formNodes().filter(
        (node) => node.type === 'select' || (node.type === 'input' && node.props.maxLength === 160),
      ),
    fillRule() {
      const fields = formNodes().filter(
        (node) => node.type === 'select' || (node.type === 'input' && node.props.maxLength === 160),
      );
      ['Request and approve payments', 'Requester', 'Approver'].forEach((value, i) =>
        fields[i].props.onChange({ target: { value } }),
      );
      flush();
    },
    workspaceHidden: () =>
      page().some(
        (node) =>
          node.props?.hidden && walk(node).some((child) => child.type?.name === 'CampaignDetail'),
      ),
    pending: () => button('Refresh list', page()).props.disabled,
    refuseMutation(readStatus?: number) {
      mutationFailureStatus = 403;
      caseFailureStatus = readStatus;
    },
    allowCaseRead() {
      caseFailureStatus = undefined;
    },
    deferCaseRead() {
      let resolve!: (value: any) => void, reject!: (error: Error) => void;
      const promise = new Promise<any>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      readGate = { promise, resolve, reject };
    },
    releaseCaseRead(status?: number) {
      const gate = readGate!;
      readGate = undefined;
      if (status) gate.reject(new RequestError('Delayed read refused', status));
      else gate.resolve(structuredClone(stored));
    },
    async retryAccess() {
      button('Check access again', page()).props.onClick();
      await tick();
      flush();
    },
    shownRevision: () =>
      page().find((node) => node.type?.name === 'CampaignDetail')?.props.campaign.revision,
    pageError: () => page().find((node) => node.props?.error)?.props.error,
    detailVisible: () => content().length > 0,
    exportVisible: () =>
      content().some((node) => node.type === 'button' && text(node).trim() === 'Export campaign'),
    refuseList(status: number) {
      failList = true;
      listFailureStatus = status;
    },
    async refreshList() {
      button('Refresh list', page()).props.onClick();
      await tick();
      flush();
    },
    button,
    input,
    flush,
    focusEvents,
    get scrolls() {
      return scrolls;
    },
    localAlert: () =>
      content().find(
        (node) => node.props?.['aria-label'] === 'Campaign status change not completed',
      ),
    allowStatus(listFailure = false) {
      refuseStatus = false;
      failList = listFailure;
    },
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

test('status refusal focuses the local message once per attempt, preserves reason and does not refocus on reload', async () => {
  const ui = await harness('status');
  ui.edit('Keep this closure reason');
  ui.button('Close review').props.onClick();
  await ui.settle();
  assert.equal(ui.localAlert().props.role, 'alert');
  assert.equal(ui.localAlert().props.tabIndex, -1);
  assert.equal(
    ui.localAlert().props.children[1].props.children,
    'Resolve investigating decisions first.',
  );
  assert.deepEqual(ui.focusEvents, ['Campaign status change not completed']);
  assert.equal(ui.scrolls, 1);
  assert.equal(ui.input().props.value, 'Keep this closure reason');
  assert.equal(ui.stored.state, 'active');
  assert.equal(ui.stored.revision, 1);
  ui.flush();
  await ui.reload();
  assert.equal(ui.focusEvents.length, 1);
  ui.button('Close review').props.onClick();
  await ui.settle();
  assert.equal(ui.focusEvents.length, 2);
  assert.equal(ui.scrolls, 2);
  assert.equal(ui.writes.length, 2);
  ui.allowStatus();
  ui.button('Close review').props.onClick();
  await ui.settle();
  assert.equal(ui.localAlert(), undefined);
  assert.equal(ui.stored.state, 'closed');
  assert.equal(ui.applied, 1);
  assert.equal(ui.button('Reopen').props.disabled, false);
  assert.equal(ui.focusEvents.length, 2);
});

test('successful status mutation followed by a failed list refresh is not reported as a local refusal', async () => {
  const ui = await harness('status');
  ui.edit('Archive completed review');
  ui.allowStatus(true);
  ui.button('Archive').props.onClick();
  await ui.settle();
  assert.equal(ui.stored.state, 'archived');
  assert.equal(ui.applied, 1);
  assert.equal(ui.localAlert(), undefined);
  assert.equal(ui.focusEvents.length, 0);
  assert.equal(ui.button('Reopen').props.disabled, false);
});

for (const status of [403, 500]) {
  test(`campaign list ${status} ${status === 403 ? 'removes' : 'retains'} the open workspace and its export`, async () => {
    const ui = await harness('settings');
    ui.edit('Unsubmitted campaign details');
    ui.refuseList(status);
    await ui.refreshList();
    assert.equal(ui.detailVisible(), status !== 403);
    assert.equal(ui.exportVisible(), status !== 403);
    if (status === 500) assert.equal(ui.input().props.value, 'Unsubmitted campaign details');
    assert.equal(ui.writes.length, 0);
  });
  test(`post-save campaign list ${status} applies the same workspace access boundary`, async () => {
    const ui = await harness('settings');
    ui.edit('Saved before list read');
    ui.refuseList(status);
    ui.submitCallback()();
    await ui.settle();
    assert.equal(ui.applied, 1, 'The completed save is not undone by a failed list read');
    assert.equal(ui.stored.description, 'Saved before list read');
    assert.match(ui.pageError(), /Change saved.*Do not repeat/);
    assert.equal(ui.detailVisible(), status !== 403);
    assert.equal(ui.exportVisible(), status !== 403);
  });
}

for (const status of [403, 404]) {
  test(`mutation403 followed by campaign GET${status} clears the workspace and all exports`, async () => {
    const ui = await harness('settings');
    ui.edit('Draft');
    ui.refuseMutation(status);
    ui.submitCallback()();
    await ui.settle();
    assert.equal(ui.reads.length, 2, 'One initial read and one authorization recheck');
    assert.equal(ui.detailVisible(), false);
    assert.equal(ui.exportVisible(), false);
    assert.equal(ui.applied, 0);
  });
}

test('independently refused mutation retains its authorized draft and requests a guarded reload', async () => {
  const ui = await harness('settings');
  ui.edit('Preserved draft');
  ui.refuseMutation();
  ui.remote();
  ui.submitCallback()();
  await ui.settle();
  assert.equal(ui.workspaceHidden(), false);
  assert.equal(ui.input().props.value, 'Preserved draft');
  assert.equal(ui.shownRevision(), 1);
  assert.equal(ui.stored.revision, 2);
  assert.match(ui.pageError(), /Reload before retrying/);
  assert.equal(ui.exportVisible(), true);
  assert.equal(ui.applied, 0);
});

test('temporary revalidation failure hides evidence and retains the draft until a successful read', async () => {
  const ui = await harness('scope');
  ui.edit('Unsubmitted prefix');
  ui.refuseMutation(503);
  ui.submitCallback()();
  await ui.settle();
  assert.equal(ui.workspaceHidden(), true);
  assert.equal(ui.input().props.value, 'Unsubmitted prefix');
  ui.allowCaseRead();
  await ui.retryAccess();
  assert.equal(ui.workspaceHidden(), false);
  assert.equal(ui.input().props.value, 'Unsubmitted prefix');
  assert.equal(ui.pageError(), undefined);
  assert.equal(ui.applied, 0);
});

test('mutation revalidation holds pending and ignores a late refusal after a newer authorized refresh', async () => {
  const ui = await harness('settings');
  ui.edit('Draft');
  ui.refuseMutation();
  ui.deferCaseRead();
  ui.submitCallback()();
  await ui.settle();
  assert.equal(ui.workspaceHidden(), true);
  assert.equal(ui.pending(), true);
  // Simulate an already queued newer read. The old check must not own the view.
  await ui.refreshList();
  assert.equal(ui.workspaceHidden(), false);
  ui.releaseCaseRead(403);
  await ui.settle();
  assert.equal(ui.detailVisible(), true);
  assert.equal(ui.exportVisible(), true);
  assert.equal(ui.input().props.value, 'Draft');
});

for (const outcome of ['refused', 'saved', 'saved-list-failure'] as const) {
  test(`duty rule draft follows confirmed parent save: ${outcome}`, async () => {
    const ui = await harness('rules');
    ui.fillRule();
    if (outcome === 'refused') ui.refuseMutation();
    if (outcome === 'saved-list-failure') ui.refuseList(503);
    const submit = ui.button('Add review rule').props.onClick;
    submit();
    submit(); // A retained callback must not dispatch a second pending addition.
    ui.flush();
    assert.ok(ui.ruleFields().every((field) => field.props.disabled));
    await ui.settle();
    assert.equal(ui.writes.length, 1);
    assert.equal(ui.stored.rules.length, outcome === 'refused' ? 0 : 1);
    assert.deepEqual(
      ui.ruleFields().map((field) => field.props.value),
      [outcome === 'refused' ? 'Request and approve payments' : '', 'Requester', 'Approver'],
    );
    assert.ok(ui.ruleFields().every((field) => !field.props.disabled));
    if (outcome === 'saved-list-failure') assert.match(ui.pageError(), /saved.*list|list.*failed/i);
  });
}
