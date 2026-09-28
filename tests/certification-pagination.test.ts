import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

test('certification returns to a valid page when the pending list shrinks', () => {
  const slots: any[] = [];
  let cursor = 0;
  let count = 31;
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
  const model = {
    certificationCoverage: () => ({
      rows: Array.from({ length: count }, (_, i) => ({
        subject: { kind: 'accounts', name: `Account${i + 1}`, state: 'enabled', unknown: [] },
      })),
      reviewed: 0,
      pending: count,
    }),
  };
  const module = { exports: {} as any };
  runInNewContext(
    transformSync(
      readFileSync(
        new URL('../src/features/campaigns/CertificationReview.tsx', import.meta.url),
        'utf8',
      ),
      {
        loader: 'tsx',
        jsx: 'automatic',
        format: 'cjs',
      },
    ).code,
    {
      module,
      require: (id: string) =>
        ({
          react: hooks,
          'react/jsx-runtime': { jsx, jsxs: jsx },
          '../../../shared/certification': model,
          '../../components/ui': {},
          '../../components/DataView': {},
          '../../api': {},
        })[id],
    },
  );
  const props = {
    campaign: { revision: 1, captures: [{ id: 'fixture', snapshot: { warnings: [] } }] },
    scope: { enabled: true, kinds: ['accounts'], prefix: '', includeDisabled: false },
    decisions: [],
    disabled: false,
    save() {},
  };
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
  const render = () => {
    cursor = 0;
    return walk(module.exports.CertificationReview(props));
  };
  const button = (nodes: any[], name: string) =>
    nodes.find((n) => n.type === 'button' && text(n) === name);
  button(render(), 'Next').props.onClick();
  assert.ok(render().some((n) => n.type === 'strong' && text(n) === 'Account31'));
  // Saving the last pending decision removes that row from the active filter.
  count = 30;
  let nodes = render();
  assert.ok(nodes.some((n) => n.type === 'span' && text(n) === '1–30 of 30'));
  assert.equal(button(nodes, 'Previous').props.disabled, true);
  assert.equal(button(nodes, 'Next').props.disabled, true);
  assert.ok(nodes.some((n) => n.type === 'strong' && text(n) === 'Account1'));
  count = 0;
  nodes = render();
  assert.ok(nodes.some((n) => n.type === 'span' && text(n) === '0–0 of 0'));
  assert.equal(button(nodes, 'Previous').props.disabled, true);
});
