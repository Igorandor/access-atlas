import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

function harness(initialSubject = '["accounts","A:one"]') {
  const slots: any[] = [];
  const submissions: Array<{ input: any; revision?: number }> = [];
  let cursor = 0,
    writes = 0,
    returns = 0;
  const jsx = (type: any, props: any) => ({ type, props });
  const hooks = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (value: any) => {
          slots[index] = typeof value === 'function' ? value(slots[index]) : value;
        },
      ];
    },
    useRef(value: any) {
      return { current: value };
    },
    useEffect() {},
    useMemo(value: () => unknown) {
      return value();
    },
  };
  const rows = ['A:one', 'B'].map((name) => ({
    subject: { kind: 'accounts', name, state: 'enabled', facts: [], unknown: [] },
    decision: {
      outcome: 'investigate',
      note: 'Saved ' + name,
      dueDate: '2026-10-03',
      reviewedAt: '2026-09-28T01:00:00Z',
    },
  }));
  const module = { exports: {} as any };
  const modules: Record<string, any> = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '../../../shared/certification': {
      certificationCoverage: () => ({ rows, total: 2, pending: 0, reviewed: 2 }),
      certificationEvidence: () => ({}),
    },
    '../../components/ui': { Modal: function Modal() {} },
  };
  runInNewContext(
    transformSync(
      readFileSync(
        new URL('../src/features/campaigns/CertificationReview.tsx', import.meta.url),
        'utf8',
      ),
      { loader: 'tsx', jsx: 'automatic', format: 'cjs' },
    ).code,
    { module, require: (id: string) => modules[id] || {} },
  );
  const props = {
    campaign: { revision: 1, captures: [{ id: 'capture', snapshot: { warnings: [] } }] },
    scope: { enabled: true, kinds: ['accounts'], prefix: '', includeDisabled: false },
    decisions: [],
    disabled: false,
    initialSubject,
    onBackToFollowups: () => {
      returns++;
    },
    save: async (input: any, revision?: number) => {
      writes++;
      submissions.push({ input, revision });
    },
  };
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
  const nodes = () => {
    cursor = 0;
    return walk(module.exports.CertificationReview(props));
  };
  const button = (label: string) => nodes().find((n) => n.type === 'button' && text(n) === label);
  const note = () => nodes().find((n) => n.type === 'textarea');
  return {
    nodes,
    submissions,
    reload(captureId = 'capture') {
      props.campaign.revision++;
      props.campaign.captures = [{ id: captureId, snapshot: { warnings: [] } }];
    },
    removeSelectedSubject() {
      rows.shift();
      props.campaign.revision++;
    },
    submitCallback: () => nodes().find((node) => node.type === 'form').props.onSubmit,
    button,
    note,
    text,
    modal: () => nodes().find((n) => n.props?.title === 'Discard unsaved certification changes?'),
    get writes() {
      return writes;
    },
    get returns() {
      return returns;
    },
    selectB() {
      nodes()
        .find((n) => n.type === 'button' && n.props['aria-pressed'] === false)
        .props.onClick();
    },
  };
}

test('certification follow-up opens the exact saved subject and returns without a write', () => {
  const ui = harness();
  assert.equal(ui.note().props.value, 'Saved A:one');
  assert.ok(ui.nodes().some((n) => n.type === 'select' && n.props.value === 'all'));
  assert.ok(
    ui
      .nodes()
      .some((n) => n.type === 'input' && n.props.type === 'date' && n.props.value === '2026-10-03'),
  );
  ui.button('Back to follow-ups').props.onClick();
  assert.equal(ui.returns, 1);
  assert.equal(ui.writes, 0);
  assert.equal(ui.modal(), undefined);
});
test('certification navigation retains or explicitly discards unsaved review text', () => {
  const ui = harness();
  ui.note().props.onChange({ target: { value: 'Unsaved review' } });
  ui.selectB();
  assert.ok(ui.modal());
  ui.button('Keep editing').props.onClick();
  assert.equal(ui.note().props.value, 'Unsaved review');
  ui.selectB();
  ui.button('Discard draft').props.onClick();
  assert.equal(ui.note().props.value, 'Saved B');
  ui.note().props.onChange({ target: { value: 'Another draft' } });
  ui.button('Back to follow-ups').props.onClick();
  ui.modal().props.onClose();
  assert.equal(ui.note().props.value, 'Another draft');
  assert.equal(ui.returns, 0);
  ui.button('Back to follow-ups').props.onClick();
  ui.button('Discard draft').props.onClick();
  assert.equal(ui.returns, 1);
  assert.equal(ui.writes, 0);
});
test('return also protects a changed scope; an absent subject opens no misleading decision', () => {
  const ui = harness('missing');
  assert.equal(ui.note(), undefined);
  ui.nodes()
    .find((n) => n.type === 'input' && n.props.maxLength === 128)
    .props.onChange({ target: { value: 'Team' } });
  ui.button('Back to follow-ups').props.onClick();
  assert.ok(ui.modal());
  ui.button('Keep editing').props.onClick();
  assert.equal(ui.returns, 0);
  assert.equal(ui.writes, 0);
});

test('certification draft submit is guarded against a newer revision and capture', () => {
  const ui = harness();
  ui.note().props.onChange({ target: { value: 'Review of the original capture' } });
  const oldSubmit = ui.submitCallback();
  ui.reload('new-capture');
  assert.equal(ui.button('Record certification decision').props.disabled, true);
  ui.submitCallback()({ preventDefault() {} });
  assert.equal(ui.writes, 0, 'A programmatic submit also obeys the conflict');
  assert.equal(ui.note().props.value, 'Review of the original capture');
  oldSubmit({ preventDefault() {} });
  assert.equal(ui.submissions[0].input.captureId, 'capture');
  assert.equal(ui.submissions[0].revision, 1, 'A retained handler cannot adopt the new revision');
});

test('explicit saved-decision reset binds the next edit to the current revision', () => {
  const ui = harness();
  ui.note().props.onChange({ target: { value: 'Old unsaved note' } });
  ui.reload();
  assert.equal(ui.button('Record certification decision').props.disabled, true);
  ui.button('Use saved decision').props.onClick();
  assert.equal(ui.note().props.value, 'Saved A:one');
  assert.equal(ui.button('Record certification decision').props.disabled, false);
  ui.note().props.onChange({ target: { value: 'Reconsidered against current review' } });
  ui.submitCallback()({ preventDefault() {} });
  assert.equal(ui.submissions[0].revision, 2);
  assert.equal(ui.submissions[0].input.name, 'A:one');
  assert.equal(ui.submissions[0].input.note, 'Reconsidered against current review');
});

test('an out-of-scope certification draft remains guarded until explicitly discarded', () => {
  const ui = harness();
  ui.note().props.onChange({ target: { value: 'Keep the unavailable subject draft' } });
  ui.removeSelectedSubject();
  assert.equal(ui.note(), undefined);
  assert.ok(ui.button('Discard unavailable decision draft'));
  ui.button('Back to follow-ups').props.onClick();
  assert.ok(ui.modal());
  ui.button('Keep editing').props.onClick();
  assert.equal(ui.returns, 0);
  ui.button('Discard unavailable decision draft').props.onClick();
  ui.button('Back to follow-ups').props.onClick();
  assert.equal(ui.returns, 1);
  assert.equal(ui.writes, 0);
});
