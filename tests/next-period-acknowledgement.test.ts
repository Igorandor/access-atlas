import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { nextPeriodPreview, type NextPeriod } from '../shared/campaign-period';

function harness() {
  const slots: any[] = [];
  let cursor = 0;
  const writes: NextPeriod[] = [];
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
    useMemo(value: () => unknown) {
      return value();
    },
  };
  const module = { exports: {} as any };
  const modules: Record<string, any> = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '../../../shared/campaign-period': { nextPeriodPreview },
    '../../components/ui': {},
  };
  runInNewContext(
    transformSync(
      readFileSync(new URL('../src/features/campaigns/NextPeriod.tsx', import.meta.url), 'utf8'),
      {
        loader: 'tsx',
        jsx: 'automatic',
        format: 'cjs',
      },
    ).code,
    { module, require: (id: string) => modules[id] || {} },
  );
  const props = {
    campaign: {
      id: 'source',
      revision: 1,
      title: 'Quarterly',
      description: 'Original period',
      rules: [] as unknown[],
      policies: [],
      captures: [],
      decisions: [],
      certifications: [],
      remediations: [],
      certificationScope: {
        enabled: true,
        kinds: ['accounts'],
        prefix: 'Finance',
        includeDisabled: false,
      },
    },
    disabled: false,
    create: async (input: NextPeriod) => {
      writes.push(input);
    },
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
  const nodes = () => {
    cursor = 0;
    return walk(module.exports.NextPeriod(props));
  };
  const checkbox = () =>
    nodes()
      .filter((node) => node.type === 'input' && node.props.type === 'checkbox')
      .at(-1);
  return {
    props,
    writes,
    acknowledge() {
      checkbox().props.onChange({ target: { checked: true } });
    },
    acknowledged: () => checkbox().props.checked,
    disabled: () => nodes().find((node) => node.type === 'button').props.disabled,
    notice: () =>
      nodes().find(
        (node) => node.props?.role === 'status' && text(node).includes('campaign changed'),
      ),
    title(value?: string) {
      const node = nodes().find((node) => node.type === 'input' && node.props.maxLength === 160);
      if (value !== undefined) node.props.onChange({ target: { value } });
      return node.props.value;
    },
    description(value?: string) {
      const node = nodes().find((node) => node.type === 'textarea');
      if (value !== undefined) node.props.onChange({ target: { value } });
      return node.props.value;
    },
    async submit() {
      nodes()
        .find((node) => node.type === 'form')
        .props.onSubmit({ preventDefault() {} });
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
  };
}

test('a reloaded campaign revision invalidates next-period acknowledgement and submit, preserving entered fields', async () => {
  const ui = harness();
  ui.title('Next quarter');
  ui.description('Locally entered review period');
  ui.acknowledge();
  assert.equal(ui.disabled(), false);
  ui.props.campaign = {
    ...ui.props.campaign,
    revision: 2,
    rules: [{ leftRole: 'Writers', rightRole: 'Auditors' }],
    certificationScope: {
      ...ui.props.campaign.certificationScope,
      prefix: 'AllDepartments',
      includeDisabled: true,
    },
  };
  assert.equal(ui.acknowledged(), false);
  assert.equal(ui.disabled(), true);
  assert.ok(ui.notice());
  assert.equal(ui.title(), 'Next quarter');
  assert.equal(ui.description(), 'Locally entered review period');
  // Bypass the disabled button to exercise the actual submit callback too.
  await ui.submit();
  assert.equal(ui.writes.length, 0);
  ui.acknowledge();
  assert.equal(ui.notice(), undefined);
  await ui.submit();
  assert.equal(ui.writes.length, 1);
  assert.equal(ui.writes[0].revision, 2);
  assert.equal(ui.writes[0].title, 'Next quarter');
});

test('same-revision rerenders preserve acknowledgement but another campaign does not inherit it', async () => {
  const ui = harness();
  ui.acknowledge();
  ui.props.campaign = structuredClone(ui.props.campaign);
  assert.equal(ui.acknowledged(), true);
  assert.equal(ui.disabled(), false);
  ui.props.campaign = { ...ui.props.campaign, id: 'another-campaign' };
  assert.equal(ui.acknowledged(), false);
  await ui.submit();
  assert.equal(ui.writes.length, 0);
});

test('editing reviewed fields or submitting while busy cannot create a campaign', async () => {
  const ui = harness();
  await ui.submit();
  assert.equal(ui.writes.length, 0);
  ui.acknowledge();
  ui.description('Changed after review');
  assert.equal(ui.acknowledged(), false);
  await ui.submit();
  assert.equal(ui.writes.length, 0);
  ui.acknowledge();
  ui.props.disabled = true;
  await ui.submit();
  assert.equal(ui.writes.length, 0);
  ui.props.disabled = false;
  await ui.submit();
  assert.equal(ui.writes.length, 1);
});
