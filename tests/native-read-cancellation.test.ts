import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../server/app';
import { AtlasTransport } from '../server/atlas-transport';
import { ApiError } from '../server/atlas-errors';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
async function gateway(t: TestContext, send: typeof fetch) {
  const client = new AtlasTransport('http://synthetic.invalid', async (url, options) =>
    new URL(String(url)).pathname.endsWith('/info')
      ? Response.json({ result: { username: 'Fixture', apiVersion: 2 } })
      : send(url, options),
  );
  const app = createApp({ irisUrl: 'http://synthetic.invalid', client });
  let response: ServerResponse | undefined;
  const server = createServer((req, res) => {
    if (req.url === '/api/iris') response = res;
    app(req, res);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const login = await fetch(origin + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Fixture', password: 'synthetic-only' }),
  });
  const { csrf } = await login.json();
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrf,
    Cookie: login.headers.get('set-cookie')!.split(';')[0],
  };
  return {
    response: () => response!,
    request(signal?: AbortSignal, method = 'GET') {
      return fetch(origin + '/api/iris', {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          path: method === 'GET' ? '/v2/security/users' : '/v2/security/audit/records',
          method,
        }),
      });
    },
  };
}

test(
  'router disconnect aborts its single GET through the actual transport and removes its listener',
  { timeout: 5000 },
  async (t) => {
    const entered = deferred(),
      aborted = deferred();
    let signal!: AbortSignal;
    const fixture = await gateway(t, async (_url, options) => {
      signal = options!.signal!;
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted.resolve();
            reject(signal.reason);
          },
          { once: true },
        );
        entered.resolve();
      });
    });
    const controller = new AbortController();
    const request = fixture.request(controller.signal);
    const rejected = assert.rejects(request, (error: any) => error.name === 'AbortError');
    await entered.promise;
    controller.abort();
    await rejected;
    await aborted.promise;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(signal.aborted, true);
    assert.ok(
      !fixture
        .response()
        .listeners('close')
        .some((listener) => listener.name === 'cancelDisconnectedRead'),
    );
  },
);

test('normal response completion does not cancel its native read', { timeout: 5000 }, async (t) => {
  let signal!: AbortSignal;
  const fixture = await gateway(t, async (_url, options) => {
    signal = options!.signal!;
    return Response.json({ result: [{ Name: 'Fixture' }] });
  });
  const response = await fixture.request();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, [{ Name: 'Fixture' }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(signal.aborted, false);
  assert.ok(
    !fixture
      .response()
      .listeners('close')
      .some((listener) => listener.name === 'cancelDisconnectedRead'),
  );
});

test('an already-cancelled GET never invokes the transport sender; a later read still completes', async () => {
  let calls = 0;
  const client = new AtlasTransport('http://synthetic.invalid', async () => {
    calls++;
    return Response.json({ result: [] });
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.request('fixture', { path: '/v2/security/users', method: 'GET' }, controller.signal),
    (error: unknown) => error instanceof ApiError && error.status === 499,
  );
  assert.equal(calls, 0);
  await client.request('fixture', { path: '/v2/security/users', method: 'GET' });
  assert.equal(calls, 1);
});

test('adding a caller signal retains the existing twenty-second deadline', async (t) => {
  const deadline = new AbortController(),
    caller = new AbortController();
  const entered = deferred();
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, 20000);
    return deadline.signal;
  });
  const client = new AtlasTransport(
    'http://synthetic.invalid',
    async (_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = options!.signal!;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        entered.resolve();
      }),
  );
  const read = client.request(
    'fixture',
    { path: '/v2/security/users', method: 'GET' },
    caller.signal,
  );
  const rejected = assert.rejects(
    read,
    (error: unknown) => error instanceof ApiError && error.status === 502,
  );
  await entered.promise;
  deadline.abort();
  await rejected;
  assert.equal(caller.signal.aborted, false);
});

test(
  'audit POST is not cancelled when its HTTP caller disconnects',
  { timeout: 5000 },
  async (t) => {
    const entered = deferred(),
      release = deferred(),
      finished = deferred();
    let signal!: AbortSignal;
    const fixture = await gateway(t, async (_url, options) => {
      signal = options!.signal!;
      entered.resolve();
      await release.promise;
      finished.resolve();
      return Response.json({ result: [] });
    });
    t.after(() => release.resolve());
    const controller = new AbortController();
    const request = fixture.request(controller.signal, 'POST');
    const rejected = assert.rejects(request, (error: any) => error.name === 'AbortError');
    await entered.promise;
    const closed = once(fixture.response(), 'close');
    controller.abort();
    await rejected;
    await closed;
    assert.equal(signal.aborted, false);
    release.resolve();
    await finished.promise;
  },
);
