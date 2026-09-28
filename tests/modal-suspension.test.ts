import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

test('a suspended boundary closes a top-layer dialog while retaining its draft, then restores it after access succeeds', () => {
  let suspended = false,
    cursor = 0;
  const slots: any[] = [];
  let effect: (() => void | (() => void)) | undefined;
  let cleanup: (() => void) | undefined;
  const events: string[] = [];
  const draft = { type: 'textarea', props: { value: 'Unsubmitted review note' } };
  const element = {
    open: false,
    showModal() {
      this.open = true;
      events.push('show');
    },
    close() {
      this.open = false;
      events.push('close');
    },
  };
  const jsx = (type: any, props: any) => ({ type, props });
  const react = {
    createContext: (value: unknown) => ({ defaultValue: value, Provider: 'Provider' }),
    useContext: (context: { defaultValue: unknown }) => suspended || context.defaultValue,
    useRef(initial: unknown) {
      return (slots[cursor++] ??= { current: initial });
    },
    useEffect(callback: () => void | (() => void), deps: unknown[]) {
      const index = cursor++,
        previous = slots[index];
      if (!previous || deps.some((value, i) => value !== previous[i])) {
        slots[index] = deps;
        effect = callback;
      }
    },
  };
  const module = { exports: {} as any };
  runInNewContext(
    transformSync(readFileSync(new URL('../src/components/ui.tsx', import.meta.url), 'utf8'), {
      loader: 'tsx',
      jsx: 'automatic',
      format: 'cjs',
    }).code,
    {
      module,
      require: (id: string) => (id === 'react' ? react : { jsx, jsxs: jsx }),
      document: { activeElement: { focus: () => events.push('focus') } },
    },
  );
  const render = () => {
    cursor = 0;
    const node = module.exports.Modal({ title: 'Sensitive report', children: draft, onClose() {} });
    node.props.ref.current = element;
    if (effect) {
      cleanup?.();
      cleanup = effect() || undefined;
      effect = undefined;
    }
    return node;
  };
  assert.equal(render().props.hidden, false);
  assert.equal(element.open, true);
  suspended = true;
  const hidden = render();
  assert.equal(hidden.props.hidden, true);
  assert.equal(element.open, false, 'CSS hiding alone must not leave a native modal open');
  assert.ok(hidden.props.children.includes(draft), 'Draft children remain mounted');
  render();
  assert.equal(events.filter((event) => event === 'close').length, 1);
  suspended = false;
  assert.ok(render().props.children.includes(draft));
  assert.equal(element.open, true);
  cleanup?.();
  assert.equal(element.open, false);
});
