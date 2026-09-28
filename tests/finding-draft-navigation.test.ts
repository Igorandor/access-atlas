import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

function harness() {
  type Hooks = { slots: any[]; cursor: number; effects: Array<() => void> };
  const fresh = (): Hooks => ({ slots: [], cursor: 0, effects: [] });
  const parent = fresh();
  let form = fresh(),
    active = parent,
    formKey: unknown;
  let returns = 0,
    writes = 0;
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
    useRef(value: any) {
      const i = active.cursor++;
      return (active.slots[i] ??= { current: value });
    },
    useMemo(value: () => unknown) {
      active.cursor++;
      return value();
    },
    useEffect(effect: () => void, deps: any[]) {
      const i = active.cursor++;
      if (!active.slots[i] || deps.some((v, j) => v !== active.slots[i][j])) {
        active.slots[i] = deps;
        active.effects.push(effect);
      }
    },
  };
  const rows = ['A', 'B'].map((id) => ({
    finding: {
      id,
      target: 'Account' + id,
      title: 'Review ' + id,
      detail: 'Synthetic',
      fingerprint: id,
    },
    decision: {
      outcome: 'investigating',
      note: 'Saved ' + id,
      dueDate: '2026-10-02',
      reviewedAt: '2026-09-28T01:00:00Z',
    },
    outdated: false,
    overdue: false,
  }));
  const jsx = (type: any, props: any, key: any) => ({ type, props, key });
  const module = { exports: {} as any };
  const source =
    readFileSync(new URL('../src/features/campaigns/Campaigns.tsx', import.meta.url), 'utf8') +
    '\nexport { CampaignDecisions };';
  const modules: Record<string, any> = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '../../../shared/campaign': { campaignProgress: () => ({ rows }) },
    '../../components/ui': { Modal: function Modal() {}, Badge: function Badge() {} },
  };
  runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
    module,
    require: (id: string) => modules[id] || {},
  });
  const walk = (n: any): any[] =>
    Array.isArray(n)
      ? n.flatMap(walk)
      : n && typeof n === 'object'
        ? [n, ...walk(n.props?.children)]
        : [];
  const text = (n: any): string =>
    Array.isArray(n)
      ? n.map(text).join('')
      : n && typeof n === 'object'
        ? text(n.props?.children)
        : n == null || typeof n === 'boolean'
          ? ''
          : String(n);
  const props = {
    campaign: { revision: 1, captures: [{}] },
    disabled: false,
    initialFindingId: 'A',
    change: async () => {
      writes++;
    },
    onBackToFollowups: () => {
      returns++;
    },
  };
  let parentNodes: any[] = [],
    formNodes: any[] = [];
  function render() {
    active = parent;
    parent.cursor = 0;
    parentNodes = walk(module.exports.CampaignDecisions(props));
    const child = parentNodes.find((n) => n.type?.name === 'DecisionForm');
    if (child) {
      if (child.key !== formKey) {
        form = fresh();
        formKey = child.key;
      }
      active = form;
      form.cursor = 0;
      formNodes = walk(child.type(child.props));
    } else formNodes = [];
  }
  function flush() {
    for (let i = 0; i < 3; i++) {
      render();
      for (const target of [parent, form]) while (target.effects.length) target.effects.shift()!();
    }
    render();
  }
  const button = (label: string) =>
    [...parentNodes, ...formNodes].find((n) => n.type === 'button' && text(n) === label);
  const note = () => formNodes.find((n) => n.type === 'textarea');
  const modal = () => parentNodes.find((n) => n.props?.title === 'Discard unsaved decision?');
  flush();
  return {
    flush,
    button,
    note,
    modal,
    get returns() {
      return returns;
    },
    get writes() {
      return writes;
    },
    edit(value: string) {
      note().props.onChange({ target: { value } });
      flush();
    },
    review(index: number) {
      parentNodes.filter((n) => n.type === 'button' && text(n) === 'Review')[index].props.onClick();
      flush();
    },
  };
}

test('returning from an unchanged decision does not prompt or save', () => {
  const ui = harness();
  ui.button('Back to follow-ups').props.onClick();
  ui.flush();
  assert.equal(ui.returns, 1);
  assert.equal(ui.writes, 0);
  assert.equal(ui.modal(), undefined);
});
test('keep editing retains a draft, explicit discard returns without saving', () => {
  const ui = harness();
  ui.edit('Unfinished review');
  ui.button('Back to follow-ups').props.onClick();
  ui.flush();
  assert.ok(ui.modal());
  ui.button('Keep editing').props.onClick();
  ui.flush();
  assert.equal(ui.note().props.value, 'Unfinished review');
  assert.equal(ui.returns, 0);
  ui.button('Back to follow-ups').props.onClick();
  ui.flush();
  ui.button('Discard draft').props.onClick();
  ui.flush();
  assert.equal(ui.returns, 1);
  assert.equal(ui.writes, 0);
  assert.equal(ui.modal(), undefined);
});
test('reselecting preserves the draft; changing finding or cancelling requires discard', () => {
  const ui = harness();
  ui.edit('Unfinished A');
  ui.review(0);
  assert.equal(ui.modal(), undefined);
  assert.equal(ui.note().props.value, 'Unfinished A');
  ui.review(1);
  assert.ok(ui.modal());
  ui.modal().props.onClose();
  ui.flush();
  assert.equal(ui.note().props.value, 'Unfinished A');
  ui.button('Cancel').props.onClick();
  ui.flush();
  assert.ok(ui.modal());
  ui.button('Keep editing').props.onClick();
  ui.flush();
  ui.review(1);
  ui.button('Discard draft').props.onClick();
  ui.flush();
  assert.equal(ui.note().props.value, 'Saved B');
  assert.equal(ui.writes, 0);
});
