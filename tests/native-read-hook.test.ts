import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { RequestError } from '../src/api';

// Actual hook body, with deterministic render/effect phases and native-read responses.
function fixture() {
  const slots: any[] = [],
    effects: any[] = [],
    pending: Array<() => void> = [];
  let cursor = 0,
    timer: (() => void) | undefined;
  let read: (path: string, query: any) => Promise<any> = async (_path, query) => ({
    data: [{ Name: query.collection || 'A' }],
  });
  const hooks = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (next: any) => {
          slots[index] = typeof next === 'function' ? next(slots[index]) : next;
        },
      ];
    },
    useReducer(reducer: (value: any) => any, initial: any) {
      const [value, set] = hooks.useState(initial);
      return [value, () => set(reducer)];
    },
    useEffect(callback: () => unknown, deps: unknown[]) {
      const index = cursor++,
        previous = effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i]))
        pending.push(() => {
          previous?.cleanup?.();
          effects[index] = { deps, cleanup: callback() };
        });
    },
  };
  const module = { exports: {} as any };
  const code = transformSync(readFileSync(new URL('../src/hooks.ts', import.meta.url), 'utf8'), {
    loader: 'ts',
    format: 'cjs',
  }).code;
  const requests: Array<{ path: string; query: any }> = [];
  runInNewContext(code, {
    module,
    require: (id: string) =>
      id === 'react'
        ? hooks
        : {
            RequestError,
            iris: (path: string, query: any) => {
              requests.push({ path, query });
              return read(path, query);
            },
          },
    document: { hidden: false },
    setTimeout: (callback: () => void) => {
      timer = callback;
      return 1;
    },
    clearTimeout: () => {
      timer = undefined;
    },
  });
  return {
    render(path = '/v2/wallet/secrets', query = { collection: 'A' }, interval = 0) {
      cursor = 0;
      return module.exports.useData(path, query, interval);
    },
    commit() {
      while (pending.length) pending.shift()!();
    },
    async settle() {
      await new Promise((resolve) => setImmediate(resolve));
    },
    respond(next: typeof read) {
      read = next;
    },
    poll() {
      timer?.();
    },
    requests,
  };
}

test('same-query refresh preserves evidence and collection time through 500, but 403 clears both', async () => {
  const ui = fixture();
  ui.render();
  ui.commit();
  await ui.settle();
  const loaded = ui.render();
  for (const status of [500, 403]) {
    loaded.refresh();
    ui.respond(async () => {
      throw new RequestError('Read failed ' + status, status);
    });
    ui.render();
    ui.commit();
    assert.equal(ui.render().data, loaded.data, 'pending same-key refresh keeps its evidence');
    await ui.settle();
    const result = ui.render();
    assert.equal(result.error, 'Read failed ' + status);
    assert.equal(result.data, status === 500 ? loaded.data : undefined);
    assert.equal(result.at, status === 500 ? loaded.at : undefined);
  }
});

test('query or path changes hide previous data/time before effects and ignore obsolete completions', async () => {
  for (const change of ['query', 'path']) {
    const ui = fixture();
    ui.render();
    ui.commit();
    await ui.settle();
    let finish!: (value: any) => void;
    ui.respond(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    ui.render().refresh();
    ui.render();
    ui.commit();
    const path = change === 'path' ? '/v2/other' : '/v2/wallet/secrets';
    const query = { collection: change === 'query' ? 'B' : 'A' };
    const first = ui.render(path, query);
    assert.equal(first.data, undefined);
    assert.equal(first.at, undefined);
    assert.equal(first.loading, true);
    ui.respond(async () => ({ data: [{ Name: 'new source' }] }));
    ui.commit();
    await ui.settle();
    const current = ui.render(path, query);
    finish({ data: [{ Name: 'obsolete source' }] });
    await ui.settle();
    assert.equal(ui.render(path, query).data, current.data);
    assert.equal(current.data[0].Name, 'new source');
  }
});

test('disabled path immediately clears data, timestamp and error and issues no read', async () => {
  const ui = fixture();
  ui.render();
  ui.commit();
  await ui.settle();
  ui.respond(async () => {
    throw new RequestError('Temporary failure', 500);
  });
  ui.render().refresh();
  ui.render();
  ui.commit();
  await ui.settle();
  const previous = ui.render();
  assert.ok(previous.data);
  assert.ok(previous.at);
  assert.ok(previous.error);
  const disabled = ui.render('');
  assert.equal(disabled.data, undefined);
  assert.equal(disabled.at, undefined);
  assert.equal(disabled.error, '');
  assert.equal(disabled.loading, false);
  const count = ui.requests.length;
  ui.commit();
  await ui.settle();
  assert.equal(ui.requests.length, count);
  assert.equal(ui.render('').data, undefined);
});

test('optional polling retains earlier timestamp on 500 and removes refused evidence on 403', async () => {
  const ui = fixture();
  ui.render(undefined, undefined, 1000);
  ui.commit();
  await ui.settle();
  const original = ui.render(undefined, undefined, 1000);
  for (const status of [500, 403]) {
    ui.respond(async () => {
      throw new RequestError('Poll failed', status);
    });
    ui.poll();
    await ui.settle();
    const result = ui.render(undefined, undefined, 1000);
    assert.equal(result.data, status === 500 ? original.data : undefined);
    assert.equal(result.at, status === 500 ? original.at : undefined);
  }
});
