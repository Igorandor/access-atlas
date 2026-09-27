import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as schema from '../shared/schema';
import * as campaigns from '../shared/campaign';
import * as remediation from '../shared/remediation';
import { register } from '../shared/register';
import { redact } from '../shared/redaction';
import { RequestError } from '../src/api';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const ErrorBox = () => null,
  TypedProposal = () => null,
  ReceiptHistory = () => null;
const review = {
  id: 'review-once',
  target: 'FixtureResource',
  before: { Description: 'old' },
  expected: { Description: 'new' },
  warnings: [],
  verification: 'Fixture review',
  expiresAt: '2026-09-27T23:59:00Z',
};

// Invoke actual component callbacks with deterministic hook state; no copied apply logic.
function harness(file: string, name: string, props: any, dependencies: Record<string, any>) {
  const slots: any[] = [];
  let cursor = 0;
  const hooks = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [
        slots[i],
        (next: any) => {
          slots[i] = typeof next === 'function' ? next(slots[i]) : next;
        },
      ];
    },
    useRef(initial: any) {
      const i = cursor++;
      return (slots[i] ??= { current: initial });
    },
    useMemo(calculate: () => unknown) {
      return calculate();
    },
    useEffect() {},
  };
  const require = createRequire(import.meta.url),
    module = { exports: {} as any };
  let source = readFileSync(new URL(file, import.meta.url), 'utf8');
  if (name === 'Register') source += '\nexport { Register };';
  runInNewContext(transformSync(source, { loader: 'tsx', jsx: 'automatic', format: 'cjs' }).code, {
    module,
    require: (id: string) =>
      id === 'react' ? hooks : id === 'react/jsx-runtime' ? require(id) : dependencies[id] || {},
  });
  function render() {
    cursor = 0;
    return module.exports[name](props);
  }
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
  const nodes = () => walk(render());
  return {
    render,
    text,
    nodes,
    button: (label: string) =>
      nodes().find((node) => node.type === 'button' && text(node) === label),
    props,
  };
}

function configuration() {
  const calls: string[] = [];
  let failure: Error | undefined, prepareFailure: Error | undefined;
  const ui = harness(
    '../src/desk/ConfigurationDesk.tsx',
    'Register',
    { entry: register.find((entry) => entry.key === 'resources'), username: 'Fixture' },
    {
      '../../shared/register': { register },
      '../../shared/schema': schema,
      '../../shared/redaction': { redact },
      '../hooks': {
        useData: () => ({
          data: [{ Name: 'FixtureResource', Description: 'old' }],
          refresh() {},
          loading: false,
          error: '',
        }),
      },
      '../api': {
        RequestError,
        iris: async () => ({ data: { Name: 'FixtureResource', Description: 'old' } }),
        request: async (resource: string) => {
          calls.push(resource);
          if (resource === 'changes/review') {
            if (prepareFailure) throw prepareFailure;
            return review;
          }
          if (failure) throw failure;
          return {
            id: 'receipt',
            reviewId: review.id,
            target: review.target,
            status: 'verified',
            message: 'Verified fixture',
            checkedFields: [],
            differences: [],
          };
        },
      },
      '../components/ui': { ErrorBox },
      './TypedProposal': { TypedProposal, initialValue: () => ({}) },
      '../components/DataView': { caption: (value: string) => value },
      './ReceiptHistory': { ReceiptHistory },
    },
  );
  async function draft() {
    ui.button('FixtureResourceold').props.onClick();
    await tick();
    ui.button('Propose changes').props.onClick();
    ui.nodes()
      .find((node) => node.type === TypedProposal)
      .props.onChange({ Description: 'new' });
  }
  async function prepare() {
    ui.nodes()
      .find((node) => node.type === 'form')
      .props.onSubmit({ preventDefault() {} });
    await tick();
  }
  function confirm() {
    ui.nodes()
      .find((node) => node.type === 'input' && node.props.autoComplete === 'off')
      .props.onChange({ target: { value: review.target } });
  }
  return {
    ...ui,
    calls,
    draft,
    prepare,
    confirm,
    fail: (error?: Error) => {
      failure = error;
    },
    failPrepare: (error?: Error) => {
      prepareFailure = error;
    },
  };
}

function campaignPanel() {
  const calls: string[] = [];
  let failure: Error | undefined,
    reloads = 0;
  const snapshot = {
    version: 1,
    instance: 'fixture',
    startedAt: '2026-09-27T00:00:00Z',
    capturedAt: '2026-09-27T00:00:01Z',
    warnings: [],
    users: [],
    roles: [],
    resources: [{ Name: review.target, PublicPermission: 'RW', ResourceType: 'custom' }],
    apps: [],
  };
  const campaign = {
    id: 'fixture',
    revision: 1,
    state: 'active',
    captures: [{ id: 'capture', snapshot }],
    decisions: [],
    rules: [],
    policies: [],
    remediations: [],
  };
  const ui = harness(
    '../src/features/campaigns/RemediationPanel.tsx',
    'RemediationPanel',
    {
      campaign,
      disabled: false,
      reload: () => {
        reloads++;
        ui.props.campaign = { ...ui.props.campaign, revision: 3 };
      },
      submit: async (action: string) => {
        calls.push(action);
        if (action === 'remediation-review') return { review };
        if (failure) throw failure;
        return {};
      },
    },
    {
      '../../../shared/campaign': campaigns,
      '../../../shared/remediation': remediation,
      '../../components/ui': { ErrorBox },
      '../../api': { RequestError },
    },
  );
  async function prepare() {
    ui.nodes()
      .find((node) => node.type === 'textarea')
      .props.onChange({ target: { value: 'Keep this reason' } });
    ui.button('Check current state and review').props.onClick();
    await tick();
    ui.nodes()
      .find((node) => node.type === 'input')
      .props.onChange({ target: { value: review.target } });
  }
  return {
    ...ui,
    calls,
    prepare,
    fail: (error?: Error) => {
      failure = error;
    },
    reloads: () => reloads,
  };
}

const ambiguous = () => [
  new TypeError('Failed to fetch'),
  new RequestError('Gateway reply unreadable', 200),
  new RequestError('Gateway unavailable', 503),
];
test('configuration lost or unreadable apply reply blocks replay and offers read-only receipts while retaining the draft', async () => {
  for (const failure of ambiguous()) {
    const ui = configuration();
    await ui.draft();
    await ui.prepare();
    ui.confirm();
    ui.fail(failure);
    const originalClick = ui.button('Apply reviewed proposal').props.onClick;
    originalClick();
    await tick();
    assert.equal(ui.button('Apply reviewed proposal').props.disabled, true);
    originalClick();
    await tick();
    assert.equal(ui.calls.filter((call) => call === 'changes/apply').length, 1);
    assert.ok(ui.text(ui.render()).includes('The apply response did not confirm an outcome.'));
    assert.ok(ui.text(ui.render()).includes(review.id));
    assert.equal(ui.nodes().find((node) => node.type === ErrorBox).props.error, failure.message);
    ui.button('Check session receipts').props.onClick();
    assert.ok(ui.nodes().some((node) => node.type === ReceiptHistory));
    const receiptVersion = ui.nodes().find((node) => node.type === ReceiptHistory).key;
    ui.button('Check session receipts').props.onClick();
    assert.notEqual(
      ui.nodes().find((node) => node.type === ReceiptHistory).key,
      receiptVersion,
      'an already open receipt list is remounted for a fresh read',
    );
    ui.button('Revise proposal').props.onClick();
    assert.equal(
      ui.nodes().find((node) => node.type === TypedProposal).props.value.Description,
      'new',
    );
    assert.equal(
      ui.calls.length,
      2,
      'opening receipt UI or revising never resubmits/prepares a change',
    );
  }
});

test('configuration keeps exact 4xx refusal without claiming an uncertain applied change', async () => {
  const ui = configuration();
  await ui.draft();
  await ui.prepare();
  ui.confirm();
  ui.fail(new RequestError('Missing native privilege', 403));
  ui.button('Apply reviewed proposal').props.onClick();
  await tick();
  assert.equal(
    ui.nodes().find((node) => node.type === ErrorBox).props.error,
    'Missing native privilege',
  );
  assert.ok(!ui.text(ui.render()).includes('The apply response did not confirm an outcome.'));
  assert.equal(ui.button('Apply reviewed proposal').props.disabled, true);
});

test('configuration prepare failure does not consume the draft and successful apply still shows its receipt', async () => {
  const ui = configuration();
  await ui.draft();
  ui.failPrepare(new RequestError('Preflight conflict', 409));
  await ui.prepare();
  assert.ok(ui.button('Review proposal'));
  assert.equal(ui.calls.filter((call) => call === 'changes/apply').length, 0);
  assert.equal(
    ui.nodes().find((node) => node.type === TypedProposal).props.value.Description,
    'new',
  );
  ui.failPrepare();
  await ui.prepare();
  ui.confirm();
  ui.button('Apply reviewed proposal').props.onClick();
  await tick();
  assert.equal(ui.button('Apply reviewed proposal'), undefined);
  assert.ok(ui.text(ui.render()).includes('Verified fixture'));
});

test('campaign lost apply reply blocks replay and read-only reload retains reason and refreshed revision', async () => {
  for (const failure of ambiguous()) {
    const ui = campaignPanel();
    await ui.prepare();
    ui.fail(failure);
    const originalClick = ui.button('Apply this change once').props.onClick;
    originalClick();
    await tick();
    originalClick();
    await tick();
    assert.equal(ui.calls.filter((call) => call === 'remediation-apply').length, 1);
    assert.equal(ui.button('Apply this change once').props.disabled, true);
    assert.equal(ui.button('Leave proposal unsubmitted'), undefined);
    assert.ok(ui.text(ui.render()).includes('The apply response did not confirm an outcome.'));
    ui.button('Reload remediation history').props.onClick();
    assert.equal(ui.reloads(), 1);
    assert.equal(ui.props.campaign.revision, 3);
    assert.equal(
      ui.nodes().find((node) => node.type === 'textarea').props.value,
      'Keep this reason',
    );
    assert.equal(ui.button('Apply this change once').props.disabled, true);
    assert.equal(ui.calls.length, 2);
  }
});

test('campaign exact 4xx remains explicit, and successful apply removes confirmation without recovery warning', async () => {
  for (const status of [400, 409, 200]) {
    const ui = campaignPanel();
    await ui.prepare();
    if (status !== 200) ui.fail(new RequestError('Exact server refusal', status));
    ui.button('Apply this change once').props.onClick();
    await tick();
    assert.ok(!ui.text(ui.render()).includes('The apply response did not confirm an outcome.'));
    if (status === 200) {
      assert.equal(ui.button('Apply this change once'), undefined);
      assert.equal(ui.button('Reload remediation history'), undefined);
    } else {
      assert.equal(
        ui.nodes().find((node) => node.type === ErrorBox).props.error,
        'Exact server refusal',
      );
      assert.equal(ui.button('Apply this change once').props.disabled, true);
    }
  }
});
