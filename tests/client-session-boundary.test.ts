import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AtlasConnection, iris, request, RequestError } from '../src/api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}
function setup(t: any, read: (url: string, options: RequestInit) => Promise<Response>) {
  const browser = new EventTarget();
  const previousWindow = globalThis.window;
  Object.assign(globalThis, { window: browser });
  t.after(() => {
    Object.assign(globalThis, { window: previousWindow });
  });
  let ended = 0;
  browser.addEventListener('session-ended', () => {
    ended++;
  });
  const sent: Array<{ url: string; options: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    sent.push({ url, options });
    if (url === '/api/login') {
      const username = JSON.parse(String(options.body)).username;
      return Response.json({ csrf: 'token-' + username, info: { username } });
    }
    if (url === '/api/logout') return Response.json({ ok: true });
    return read(url, options);
  });
  return { sent, ended: () => ended };
}
const stale = (error: unknown) =>
  error instanceof RequestError &&
  error.status === 409 &&
  /earlier Atlas session/.test(error.message);

test('a restricted BroadcastChannel constructor cannot prevent local session protection', async (t) => {
  const previousWindow = globalThis.window;
  const previousChannel = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel');
  Object.assign(globalThis, { window: new EventTarget() });
  t.after(() => {
    Object.assign(globalThis, { window: previousWindow });
    if (previousChannel) Object.defineProperty(globalThis, 'BroadcastChannel', previousChannel);
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel');
  });
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    value: class {
      constructor() {
        throw new DOMException('Storage is blocked', 'SecurityError');
      }
    },
  });
  const connection = new AtlasConnection(undefined, () => assert.fail('unexpected expiry'));
  const oldReply = deferred<Response>();
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    url === '/api/old'
      ? oldReply.promise
      : Response.json({ csrf: 'new-token', info: { username: 'B' } }),
  );
  const old = connection.send('old');
  const rejected = assert.rejects(old, stale);
  await connection.send('login', { username: 'B' });
  oldReply.resolve(Response.json({ private: 'A evidence' }));
  await rejected;
});

test('duplicate initial session discovery preserves the live StrictMode effect in either response order', async (t) => {
  for (const firstToFinish of [0, 1]) {
    const connection = new AtlasConnection(undefined, () =>
      assert.fail('discovery ended a session'),
    );
    const responses = [deferred<Response>(), deferred<Response>()];
    let reads = 0;
    let token: unknown;
    t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
      if (options.method === 'GET') return responses[reads++].promise;
      token = (options.headers as Record<string, string>)['X-CSRF-Token'];
      return Response.json({ ok: true });
    });
    let mountedAccount: unknown;
    let firstEffectDisposed = false;
    const first = connection.send('session').then((session) => {
      if (!firstEffectDisposed) mountedAccount = session;
    });
    firstEffectDisposed = true;
    const live = connection.send('session').then((session) => {
      mountedAccount = session;
    });
    const session = { csrf: 'existing-token', info: { username: 'Existing' } };
    responses[firstToFinish].resolve(Response.json(session));
    await (firstToFinish === 0 ? first : live);
    responses[1 - firstToFinish].resolve(Response.json(session));
    await Promise.all([first, live]);
    assert.deepEqual(mountedAccount, session);
    await connection.send('probe', {});
    assert.equal(token, 'existing-token');
    t.mock.restoreAll();
  }
});

test('a late A 401 cannot end B after logout and another login', async (t) => {
  const pending = deferred<Response>();
  const fixture = setup(t, async () => pending.promise);
  await request('login', { username: 'A' });
  const old = request('protected-old');
  const rejected = assert.rejects(old, stale);
  await request('logout', {});
  await request('login', { username: 'B' });
  pending.resolve(Response.json({ error: 'A no longer has a session' }, { status: 401 }));
  await rejected;
  assert.equal(fixture.ended(), 0);
});

test('a late successful A session response cannot replace B CSRF or disclose its old payload', async (t) => {
  const pending = deferred<Response>();
  const fixture = setup(t, async (url) =>
    url === '/api/session' ? pending.promise : Response.json({ ok: true }),
  );
  await request('login', { username: 'A' });
  const old = request('session');
  const rejected = assert.rejects(old, stale);
  await request('logout', {});
  await request('login', { username: 'B' });
  pending.resolve(
    Response.json({ csrf: 'token-A', info: { username: 'A' }, protected: 'A evidence' }),
  );
  await rejected;
  await request('probe', {});
  assert.equal(
    (fixture.sent.at(-1)!.options.headers as Record<string, string>)['X-CSRF-Token'],
    'token-B',
  );
  assert.equal(fixture.ended(), 0);
});

test('session changes during JSON parsing discard both successful and unreadable old replies', async (t) => {
  for (const unreadable of [false, true]) {
    const parsed = deferred<unknown>();
    const started = deferred<void>();
    const fixture = setup(
      t,
      async () =>
        ({
          ok: !unreadable,
          status: unreadable ? 401 : 200,
          json: () => {
            started.resolve();
            return parsed.promise;
          },
        }) as Response,
    );
    await request('login', { username: 'A' });
    const old = request('protected-old');
    const rejected = assert.rejects(old, stale);
    await started.promise;
    await request('login', { username: 'B' });
    if (unreadable) parsed.reject(new SyntaxError('Old broken body'));
    else parsed.resolve({ csrf: 'token-A', data: 'A evidence' });
    await rejected;
    assert.equal(fixture.ended(), 0);
    t.mock.restoreAll();
  }
});

test('current 401 ends the current session once and clears its CSRF token', async (t) => {
  for (const unreadable of [false, true]) {
    const fixture = setup(t, async (url) =>
      url === '/api/protected-current'
        ? unreadable
          ? new Response('not JSON', { status: 401 })
          : Response.json({ error: 'Session ended' }, { status: 401 })
        : Response.json({ ok: true }),
    );
    await request('login', { username: 'Current' });
    await assert.rejects(
      request('protected-current'),
      (error: unknown) => error instanceof RequestError && error.status === 401,
    );
    await request('probe', {});
    assert.equal(
      (fixture.sent.at(-1)!.options.headers as Record<string, string>)['X-CSRF-Token'],
      '',
    );
    assert.equal(fixture.ended(), 1);
    t.mock.restoreAll();
  }
});

test('a delayed poll for A cannot be sent using B credentials', async (t) => {
  const delay = deferred<void>();
  const waiting = deferred<void>();
  const fixture = setup(t, async () =>
    Response.json({ data: {}, status: 202, console: [], asyncId: 'A-job' }),
  );
  t.mock.method(globalThis, 'setTimeout', (callback: () => void) => {
    waiting.resolve();
    void delay.promise.then(callback);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  });
  await request('login', { username: 'A' });
  const operation = iris('/v2/task/run', { id: '7' }, 'POST', {});
  const rejected = assert.rejects(operation, stale);
  await waiting.promise;
  await request('logout', {});
  await request('login', { username: 'B' });
  delay.resolve();
  await rejected;
  const nativeReads = fixture.sent.filter((call) => call.url === '/api/iris');
  assert.equal(
    nativeReads.length,
    1,
    'only the initial A operation is sent; no cross-session poll',
  );
  assert.equal(fixture.ended(), 0);
});

test('another tab invalidates cached identity on session change without receiving account data or rebroadcasting', async (t) => {
  const events = [new EventTarget(), new EventTarget()];
  const signals: unknown[] = [];
  const channels = events.map((eventsHere, index) => ({
    addEventListener: eventsHere.addEventListener.bind(eventsHere),
    postMessage: (value: unknown) => {
      signals.push(value);
      events[1 - index].dispatchEvent(new MessageEvent('message', { data: value }));
    },
  }));
  const ended = [0, 0];
  const first = new AtlasConnection(channels[0] as BroadcastChannel, () => {
    ended[0]++;
  });
  const second = new AtlasConnection(channels[1] as BroadcastChannel, () => {
    ended[1]++;
  });
  const pending = deferred<Response>();
  const sent: Array<{ url: string; options: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    sent.push({ url, options });
    if (url === '/api/login') {
      const username = JSON.parse(String(options.body)).username;
      return Response.json({ csrf: 'token-' + username, info: { username } });
    }
    if (url === '/api/old-tab-read') return pending.promise;
    if (url === '/api/unauthorized')
      return Response.json({ error: 'Session ended' }, { status: 401 });
    return Response.json({ ok: true });
  });
  await first.send('login', { username: 'A' });
  const old = first.send('old-tab-read');
  const rejected = assert.rejects(old, stale);
  await second.send('login', { username: 'B' });
  assert.equal(ended[0], 1, 'the first tab must unmount A rather than silently become B');
  pending.resolve(Response.json({ protected: 'A evidence', csrf: 'token-A' }));
  await rejected;
  await first.send('probe', {});
  assert.equal((sent.at(-1)!.options.headers as Record<string, string>)['X-CSRF-Token'], '');
  await second.send('logout', {});
  assert.equal(ended[0], 2);
  await second.send('login', { username: 'B-again' });
  await assert.rejects(
    second.send('unauthorized'),
    (error: unknown) => error instanceof RequestError && error.status === 401,
  );
  assert.equal(ended[0], 4);
  assert.equal(ended[1], 2, 'one incoming A login plus its own current 401');
  assert.deepEqual(signals, Array(5).fill('atlas-session-changed'));
});
