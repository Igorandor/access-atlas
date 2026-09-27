import { test } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { ReviewedChanges } from '../server/reviewed-changes';
import { ApiError, type IrisClient } from '../server/upstream';
import { createApp } from '../server/app';
import type { AtlasSession } from '../server/atlas-sessions';
import { receiptAuthorizationProbe, canonicalChangeTarget } from '../server/receipt-authorization';
const session: AtlasSession = {
  auth: 'test-auth',
  info: { username: 'reviewer' },
  csrf: 'unique-session',
  issued: 0,
  touched: 0,
  activity: [],
};
function fixture() {
  let record: any = { Name: 'Example', Description: 'Before', Roles: [], Enabled: true };
  let writes = 0;
  let failReadback = false;
  let failWrite = false;
  let wrongReadback = false;
  const client = {
    async request(_auth: string, operation: any) {
      if (operation.path === '/info')
        return { data: { username: 'reviewer', apiVersion: 2 }, status: 200, console: [] };
      if (operation.method === 'GET') {
        if (failReadback && writes) throw new ApiError(403, 'Readback denied');
        if (!record) throw new ApiError(404, 'Not found');
        return { data: structuredClone(record), status: 200, console: [] };
      }
      writes++;
      if (failWrite) throw new ApiError(502, 'Connection lost');
      if (operation.method === 'DELETE') record = undefined;
      else if (!wrongReadback) record = { ...record, ...(operation.body?.User || operation.body) };
      return { data: {}, status: 200, console: [] };
    },
  } as unknown as IrisClient;
  return {
    client,
    service: new ReviewedChanges(client, () => 1_000),
    writes: () => writes,
    patch: (fields: object) => Object.assign(record, fields),
    replace: (fields: object) => {
      record = fields;
    },
    unreadable: () => {
      failReadback = true;
    },
    lostWrite: () => {
      failWrite = true;
    },
    wrong: () => {
      wrongReadback = true;
    },
  };
}
test('reviewed change preserves other fields, verifies readback and cannot execute twice', async () => {
  const f = fixture();
  const review = await f.service.prepare(session, {
    path: '/v2/security/user',
    method: 'PUT',
    query: { name: 'Example' },
    body: { Description: 'After' },
    baseline: { Description: 'Before' },
  });
  f.patch({ Enabled: false });
  const receipt = await f.service.execute(session, review.id, 'Example');
  assert.equal(receipt.status, 'verified');
  assert.deepEqual(receipt.checkedFields, ['Description']);
  await assert.rejects(
    f.service.execute(session, review.id, 'Example'),
    (error: any) => error.status === 409,
  );
  assert.equal(f.writes(), 1);
});

test('stored receipts require fresh source authorization even in the original session', async () => {
  const f = fixture();
  const review = await f.service.prepare(session, {
    path: '/v2/security/user',
    method: 'PUT',
    query: { name: 'Example' },
    body: { Description: 'After' },
  });
  await f.service.execute(session, review.id, 'Example');
  assert.equal((await f.service.list(session)).length, 1);
  f.unreadable();
  await assert.rejects(f.service.list(session), (error: any) => error.status === 403);
});

test('receipt authorization uses wallet, device and distinct OAuth native privilege families', () => {
  assert.equal(receiptAuthorizationProbe('/v2/wallet/secret').path, '/v2/wallet/collections');
  assert.equal(receiptAuthorizationProbe('/v2/device').path, '/v2/devices');
  assert.equal(
    receiptAuthorizationProbe('/v2/security/oauth2/client/client-configuration/secrets').path,
    '/v2/security/oauth2/client/server-definitions',
  );
  assert.equal(
    receiptAuthorizationProbe('/v2/security/oauth2/resource-server').path,
    '/v2/security/oauth2/resource-servers',
  );
  assert.throws(
    () => receiptAuthorizationProbe('/v2/unknown'),
    (error: any) => error.status === 403,
  );
});

test('native target aliases share one in-process execution lock identity', () => {
  assert.equal(
    canonicalChangeTarget('/v2/task/run', { id: '01' }, '01'),
    canonicalChangeTarget('/v2/task/suspend', { id: '1' }, '1'),
  );
  assert.equal(
    canonicalChangeTarget('/v2/web-app', { name: '/App/' }, '/App/'),
    canonicalChangeTarget('/v2/web-app', { name: '/app' }, '/app'),
  );
  assert.equal(
    canonicalChangeTarget('/v2/security/user/password', { name: 'Alice' }, 'Alice'),
    canonicalChangeTarget('/v2/security/user', { name: 'alice' }, 'alice'),
  );
  assert.notEqual(
    canonicalChangeTarget('/v2/wallet/secret', { name: 'Key', collection: 'A' }, 'Key'),
    canonicalChangeTarget('/v2/wallet/secret', { name: 'Key', collection: 'B' }, 'Key'),
  );
});
test('same-field drift and deletion drift prevent native dispatch', async () => {
  const f = fixture();
  const review = await f.service.prepare(session, {
    path: '/v2/security/user',
    method: 'PUT',
    query: { name: 'Example' },
    body: { Description: 'After' },
  });
  f.patch({ Description: 'Concurrent' });
  assert.equal((await f.service.execute(session, review.id, 'Example')).status, 'failed');
  assert.equal(f.writes(), 0);
  const deletion = await f.service.prepare(session, {
    path: '/v2/security/user',
    method: 'DELETE',
    query: { name: 'Example' },
  });
  f.patch({ Roles: ['new-role'] });
  assert.equal((await f.service.execute(session, deletion.id, 'Example')).status, 'failed');
  assert.equal(f.writes(), 0);
});
test('new process generation cannot receive a command reviewed for the old PID', async () => {
  const f = fixture();
  f.replace({
    Pid: 777,
    JobNumber: 4,
    StartTimeUTC: '2026-09-27 01:00:00',
    UserName: 'reviewer',
    CanBeTerminated: true,
  });
  const review = await f.service.prepare(session, {
    path: '/v2/process/terminate',
    method: 'POST',
    query: { id: '777' },
    body: {},
  });
  f.patch({ JobNumber: 5, StartTimeUTC: '2026-09-27 02:00:00' });
  assert.equal((await f.service.execute(session, review.id, '777')).status, 'failed');
  assert.equal(f.writes(), 0);
});
test('different native result, denied readback and uncertain dispatch have distinct statuses', async () => {
  for (const [mode, status] of [
    ['wrong', 'different'],
    ['unreadable', 'unverified'],
    ['lostWrite', 'uncertain'],
  ] as const) {
    const f = fixture();
    const review = await f.service.prepare(session, {
      path: '/v2/security/user',
      method: 'PUT',
      query: { name: 'Example' },
      body: { Enabled: false },
    });
    f[mode]();
    assert.equal((await f.service.execute(session, review.id, 'Example')).status, status);
    assert.equal(f.writes(), 1);
  }
});
test('password proposals and receipts never echo the submitted secret and are not marked verified', async () => {
  const f = fixture();
  const review = await f.service.prepare(session, {
    path: '/v2/security/user/password',
    method: 'POST',
    query: { name: 'Example' },
    body: { Password: 'private-test-value' },
  });
  assert.doesNotMatch(JSON.stringify(review), /private-test-value/);
  const receipt = await f.service.execute(session, review.id, 'Example');
  assert.equal(receipt.status, 'acknowledged');
  assert.doesNotMatch(
    JSON.stringify(await f.service.list(session)),
    /private-test-value|test-auth/,
  );
});
test('proposal tickets belong to a single session and require exact confirmation', async () => {
  const f = fixture();
  const review = await f.service.prepare(session, {
    path: '/v2/security/user',
    method: 'PUT',
    query: { name: 'Example' },
    body: { Enabled: false },
  });
  await assert.rejects(
    f.service.execute({ ...session, csrf: 'another-session' }, review.id, 'Example'),
    (error: any) => error.status === 404,
  );
  await assert.rejects(
    f.service.execute(session, review.id, 'wrong'),
    (error: any) => error.status === 400,
  );
  assert.equal(f.writes(), 0);
});
test('generic gateway writes cannot bypass proposal review', async () => {
  const f = fixture();
  const agent = supertest.agent(
    createApp({ irisUrl: 'http://iris', origin: 'http://portal.test', client: f.client }),
  );
  const login = await agent
    .post('/api/login')
    .send({ username: 'reviewer', password: 'temporary' })
    .expect(200);
  await agent
    .post('/api/iris')
    .set('X-CSRF-Token', login.body.csrf)
    .send({
      path: '/v2/security/user',
      method: 'PUT',
      query: { name: 'Example' },
      body: { Enabled: false },
    })
    .expect(409);
  assert.equal(f.writes(), 0);
});
test('process generation is checked between UI inspection and server review', async () => {
  const f = fixture();
  const old = {
    Pid: 777,
    JobNumber: 4,
    StartTimeUTC: '2026-09-27 01:00:00',
    UserName: 'reviewer',
    CanBeTerminated: true,
  };
  f.replace({ ...old, JobNumber: 5 });
  await assert.rejects(
    f.service.prepare(session, {
      path: '/v2/process/terminate',
      method: 'POST',
      query: { id: '777' },
      body: {},
      baseline: old,
    }),
    (error: any) => error.status === 409,
  );
  assert.equal(f.writes(), 0);
});
test('ordered nested task settings cannot bypass conflict detection by permuting an array', async () => {
  const f = fixture();
  f.replace({ Name: 'Task', Settings: { steps: ['A', 'B'] } });
  const review = await f.service.prepare(session, {
    path: '/v2/task',
    method: 'PUT',
    query: { id: '7' },
    body: { Settings: { steps: ['C', 'D'] } },
  });
  f.patch({ Settings: { steps: ['B', 'A'] } });
  assert.equal((await f.service.execute(session, review.id, '7')).status, 'failed');
  assert.equal(f.writes(), 0);
});
test('two separately reviewed proposals for one target cannot dispatch concurrently', async () => {
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let record = { Name: 'Example', Enabled: true };
  let writes = 0;
  const client = {
    async request(_auth: string, operation: any) {
      if (operation.path === '/info')
        return { status: 200, data: { username: 'reviewer', apiVersion: 2 }, console: [] };
      if (operation.method === 'GET') return { status: 200, data: { ...record }, console: [] };
      writes++;
      started();
      await gate;
      record = { ...record, ...operation.body };
      return { status: 200, data: {}, console: [] };
    },
  } as unknown as IrisClient;
  const service = new ReviewedChanges(client);
  const first = await service.prepare(session, {
    path: '/v2/security/user',
    method: 'PUT',
    query: { name: 'Example' },
    body: { Enabled: false },
  });
  const second = await service.prepare(session, {
    path: '/v2/security/user',
    method: 'PUT',
    query: { name: 'Example' },
    body: { Enabled: false },
  });
  const execution = service.execute(session, first.id, 'Example');
  await entered;
  await assert.rejects(
    service.execute(session, second.id, 'Example'),
    (error: any) => error.status === 409,
  );
  assert.equal(writes, 1);
  release();
  assert.equal((await execution).status, 'verified');
});
