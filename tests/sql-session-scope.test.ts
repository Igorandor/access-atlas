import { test } from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { createApp } from '../server/app';
import { IrisClient } from '../server/upstream';

test('SQL evidence can identify the configured instance without permission to capture the access graph', async () => {
  const client = {
    async request(_auth: string, operation: { path: string }) {
      assert.equal(
        operation.path,
        '/info',
        'Session inspection must not collect privileged graph data.',
      );
      return { data: { username: 'reviewer', apiVersion: 2 }, status: 200, console: [] };
    },
  } as unknown as IrisClient;
  for (const configured of [undefined, 'production-reviewed-instance']) {
    const app = createApp({
      irisUrl: 'http://native.internal:52773',
      instanceId: configured,
      client,
    });
    const browser = supertest.agent(app);
    await browser.get('/api/session').expect(401);
    const login = await browser
      .post('/api/login')
      .send({ username: 'reviewer', password: 'fixture' })
      .expect(200);
    const session = await browser.get('/api/session').expect(200);
    const expected = configured || 'http://native.internal:52773';
    assert.equal(login.body.instance, expected);
    assert.equal(session.body.instance, expected);
  }
});
