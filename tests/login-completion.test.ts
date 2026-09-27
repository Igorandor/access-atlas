import test from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { createApp } from '../server/app';
import { ApiError, type IrisClient } from '../server/upstream';

function fixture() {
  let time = 1_000;
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const client = {
    async request(auth: string) {
      const [username, password] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
      if (username === 'Delayed') {
        entered();
        await gate;
      }
      if (password === 'wrong') throw new ApiError(401, 'Synthetic rejection');
      return { data: { username, apiVersion: 2 }, status: 200, console: [] };
    },
  } as unknown as IrisClient;
  const app = createApp({
    irisUrl: 'http://synthetic.invalid',
    origin: 'http://portal.test',
    client,
    now: () => time,
  });
  const login = (username: string, cookie = '', password = 'fixture') =>
    supertest(app).post('/api/login').set('Cookie', cookie).send({ username, password });
  return {
    app,
    login,
    waiting,
    release,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
function cookie(response: any): string {
  return response.headers['set-cookie'][0].split(';')[0];
}
function rejected(response: any) {
  assert.equal(response.status, 409);
  assert.equal(response.headers['set-cookie'], undefined, 'must not set or clear a newer cookie');
  assert.match(response.body.error, /session changed during sign-in/i);
}

test('a pending replacement login cannot restore a session after acknowledged logout', async () => {
  const f = fixture();
  const first = await f.login('Original').expect(200);
  const pending = f.login('Delayed', cookie(first)).then((response) => response);
  await f.waiting;
  await supertest(f.app)
    .post('/api/logout')
    .set('Cookie', cookie(first))
    .set('X-CSRF-Token', first.body.csrf)
    .send({})
    .expect(200);
  f.release();
  rejected(await pending);
  await supertest(f.app).get('/api/session').set('Cookie', cookie(first)).expect(401);
});

test('a later completed replacement wins over an older pending login', async () => {
  const f = fixture();
  const first = await f.login('Original').expect(200);
  const pending = f.login('Delayed', cookie(first)).then((response) => response);
  await f.waiting;
  const latest = await f.login('Latest', cookie(first)).expect(200);
  f.release();
  rejected(await pending);
  const current = await supertest(f.app)
    .get('/api/session')
    .set('Cookie', cookie(latest))
    .expect(200);
  assert.equal(current.body.info.username, 'Latest');
});

test('expiry while identity verification waits prevents replacement without touching the idle deadline', async () => {
  const f = fixture();
  const first = await f.login('Original').expect(200);
  const pending = f.login('Delayed', cookie(first)).then((response) => response);
  await f.waiting;
  f.advance(1_800_001);
  f.release();
  rejected(await pending);
  await supertest(f.app).get('/api/session').set('Cookie', cookie(first)).expect(401);
});

test('failed identity verification preserves the previous session and never sets a cookie', async () => {
  const f = fixture();
  const first = await f.login('Original').expect(200);
  const failed = await f.login('Other', cookie(first), 'wrong').expect(401);
  assert.equal(failed.headers['set-cookie'], undefined);
  const current = await supertest(f.app)
    .get('/api/session')
    .set('Cookie', cookie(first))
    .expect(200);
  assert.equal(current.body.csrf, first.body.csrf);
});

test('a cookie already absent or expired at login start does not prevent fresh sign-in', async () => {
  const f = fixture();
  const first = await f.login('Original').expect(200);
  f.advance(1_800_001);
  const fresh = await f.login('Fresh', cookie(first)).expect(200);
  const stale = await f.login('StaleCookie', 'atlas_session=not-a-session').expect(200);
  for (const response of [fresh, stale]) {
    const current = await supertest(f.app)
      .get('/api/session')
      .set('Cookie', cookie(response))
      .expect(200);
    assert.equal(current.body.csrf, response.body.csrf);
  }
});
