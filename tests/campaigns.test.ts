import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { readConfiguration } from '../server/configuration';
import { CampaignStore } from '../server/campaign-store';
import { createApp } from '../server/app';
import { ApiError, type IrisClient } from '../server/upstream';
import { campaignProgress, appendCampaignCapture, type Campaign } from '../shared/campaign';
import { findings, type AccessSnapshot } from '../shared/access-model';

const scope = { instance: 'iris-a', owner: 'reviewer' };
const snapshot: AccessSnapshot = {
  version: 1,
  instance: 'iris-a',
  startedAt: '2026-09-27T12:00:00.000Z',
  capturedAt: '2026-09-27T12:01:00.000Z',
  warnings: [],
  users: [{ Name: 'operator', Enabled: true, Roles: ['%All'], EscalationRoles: [] }],
  roles: [
    { Name: '%All', Description: '', GrantedRoles: [], Resources: [], EscalationOnly: false },
  ],
  apps: [],
  resources: [],
};
async function directory(t: any) {
  const path = await mkdtemp(join(tmpdir(), 'atlas-campaign-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
test('configuration reads documented instance variable and rejects unsafe deployment syntax', () => {
  const config = readConfiguration({
    IRIS_INSTANCE_ID: 'production-west',
    ATLAS_INSTANCE_ID: 'legacy',
    PUBLIC_ORIGIN: 'https://atlas.example',
    COOKIE_SECURE: 'true',
  });
  assert.equal(config.instanceId, 'production-west');
  assert.throws(
    () => readConfiguration({ PUBLIC_ORIGIN: 'https://atlas.example' }),
    /COOKIE_SECURE/,
  );
  assert.throws(() => readConfiguration({ IRIS_URL: 'http://user:password@iris' }), /credentials/);
  assert.throws(
    () => readConfiguration({ PUBLIC_ORIGIN: 'https://atlas.example/path' }),
    /PUBLIC_ORIGIN/,
  );
  assert.throws(() => readConfiguration({ PORT: '1.5' }), /PORT/);
  assert.throws(() => readConfiguration({ COOKIE_SECURE: 'yes' }), /COOKIE_SECURE/);
});
test('campaign survives process repository recreation and is isolated by account and instance', async (t) => {
  const path = await directory(t);
  const first = new CampaignStore(path);
  const created = await first.create(scope, 'Quarterly review', 'Finance users');
  const reopened = new CampaignStore(path);
  assert.equal((await reopened.read(scope, created.id)).title, 'Quarterly review');
  assert.deepEqual(await reopened.list({ ...scope, owner: 'another' }), []);
  assert.deepEqual(await reopened.list({ ...scope, instance: 'iris-b' }), []);
  await assert.rejects(
    reopened.read({ ...scope, owner: 'another' }, created.id),
    (error: any) => error.status === 404,
  );
  await assert.rejects(reopened.read(scope, '../campaign'), (error: any) => error.status === 404);
});

test('next-period creation preserves source evidence and atomically starts without decisions', async (t) => {
  const store = new CampaignStore(await directory(t));
  const source = await store.create(scope, 'First review', 'Scope');
  const captured = await store.change(scope, source.id, 1, 'capture', 'First', (document) => {
    appendCampaignCapture(document, structuredClone(snapshot), randomUUID(), 'First');
    document.rules = [{ title: 'Duty', left: 'RoleA', right: 'RoleB' }];
    document.certificationScope = {
      enabled: true,
      kinds: ['accounts'],
      prefix: '',
      includeDisabled: true,
      dueDate: '2026-09-01',
    };
  });
  const input = {
    revision: captured.revision,
    title: 'Second review',
    description: '',
    copyDutyRules: true,
    copyPolicies: false,
    copyCertificationScope: true,
    dueDate: '2026-12-31',
  };
  const next = await store.create(scope, input.title, input.description, { id: source.id, input });
  assert.equal(next.captures.length, 0);
  assert.equal(next.decisions.length, 0);
  assert.equal(next.certifications.length, 0);
  assert.equal(next.remediations.length, 0);
  assert.equal(next.rules.length, 1);
  assert.equal(next.certificationScope.dueDate, '2026-12-31');
  assert.equal(next.history[0].action, 'next-period');
  assert.equal((await store.read(scope, source.id)).captures.length, 1);
  await assert.rejects(
    store.create(scope, input.title, '', { id: source.id, input: { ...input, revision: 1 } }),
    (error: any) => error.status === 409,
  );
  await assert.rejects(
    store.create({ ...scope, owner: 'other' }, input.title, '', { id: source.id, input }),
    (error: any) => error.status === 404,
  );
});

test('certification history preserves the decision changed at an equal timestamp', async (t) => {
  const store = new CampaignStore(await directory(t), () => Date.parse(snapshot.capturedAt));
  const created = await store.create(scope, 'Review', '');
  const first = await store.change(scope, created.id, 1, 'certify', 'operator', (document) => {
    const captureId = randomUUID();
    appendCampaignCapture(document, structuredClone(snapshot), captureId, 'First');
    document.certifications.push({
      kind: 'accounts',
      name: 'operator',
      captureId,
      outcome: 'retain',
      note: 'First reason',
      reviewedAt: snapshot.capturedAt,
    });
  });
  const second = await store.change(
    scope,
    first.id,
    first.revision,
    'certify',
    'operator',
    (document) => {
      document.certifications[0].note = 'Changed reason';
    },
  );
  assert.equal(second.history[1].certification?.note, 'First reason');
  assert.equal(second.history[2].certification?.note, 'Changed reason');
});
test('concurrent campaign edits cannot silently overwrite each other', async (t) => {
  const store = new CampaignStore(await directory(t));
  const campaign = await store.create(scope, 'Review', '');
  const results = await Promise.allSettled([
    store.change(scope, campaign.id, 1, 'details', 'first', (document) => {
      document.title = 'first';
    }),
    store.change(scope, campaign.id, 1, 'details', 'second', (document) => {
      document.title = 'second';
    }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const failure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(failure.reason.status, 409);
  const current = await store.read(scope, campaign.id);
  assert.equal(current.revision, 2);
  assert.equal(current.history.length, 2);
});
test('corrupted campaign data fails closed and is not silently recreated', async (t) => {
  const path = await directory(t);
  const store = new CampaignStore(path);
  const created = await store.create(scope, 'Review', '');
  const partition = (await readdir(path))[0];
  await writeFile(join(path, partition, created.id + '.json'), '{bad');
  await assert.rejects(store.read(scope, created.id), (error: any) => error.status === 503);
});
test('decisions become outdated when the finding fingerprint changes', async (t) => {
  const store = new CampaignStore(await directory(t));
  const created = await store.create(scope, 'Review', '');
  const captureId = randomUUID();
  const campaign = await store.change(scope, created.id, 1, 'capture', '', (document) => {
    appendCampaignCapture(document, structuredClone(snapshot), captureId, 'First');
    const finding = findings(snapshot)[0];
    document.decisions.push({
      findingId: finding.id,
      fingerprint: finding.fingerprint,
      captureId,
      outcome: 'change-required',
      note: 'Remove broad role',
      reviewedAt: snapshot.capturedAt,
      dueDate: '2026-09-01',
    });
  });
  assert.equal(campaignProgress(campaign).reviewed, 1);
  assert.equal(campaignProgress(campaign).overdue, 1);
  campaign.captures[0].snapshot.roles.push({
    Name: 'Administrators',
    Description: '',
    GrantedRoles: ['%All'],
    Resources: [],
    EscalationOnly: false,
  });
  campaign.captures[0].snapshot.users[0].Roles = ['Administrators'];
  assert.equal(campaignProgress(campaign).reviewed, 0);
  assert.equal(campaignProgress(campaign).rows[0].outdated, true);
});

async function fixture(t: any) {
  const native = structuredClone(snapshot);
  let writeGate: Promise<void> | undefined;
  let writeStarted = () => {};
  let revoked = false;
  let alteredIdentity = false;
  const client = {
    async request(auth: string, operation: any) {
      const user = Buffer.from(auth.slice(6), 'base64').toString().split(':')[0];
      if (revoked && operation.path.startsWith('/v2/security/'))
        throw new ApiError(403, 'Access revoked');
      if (operation.path === '/v2/security/user' && operation.method === 'PUT') {
        writeStarted();
        if (writeGate) await writeGate;
        Object.assign(native.users[0], operation.body);
      }
      const data =
        operation.path === '/info'
          ? { username: alteredIdentity ? 'other' : user, apiVersion: 2 }
          : operation.path === '/v2/security/users'
            ? native.users
            : operation.path === '/v2/security/roles'
              ? native.roles
              : operation.path === '/v2/security/user'
                ? native.users[0]
                : operation.path === '/v2/security/role'
                  ? native.roles[0]
                  : [];
      return { data, status: 200, console: [] };
    },
  } as unknown as IrisClient;
  const app = createApp({
    irisUrl: 'http://iris',
    instanceId: scope.instance,
    client,
    campaignDirectory: await directory(t),
    origin: 'http://portal.test',
  });
  const agent = supertest.agent(app);
  const session = await agent
    .post('/api/login')
    .send({ username: scope.owner, password: 'test-only-password' })
    .expect(200);
  const post = (path: string, input: object) =>
    agent.post(path).set('X-CSRF-Token', session.body.csrf).send(input);
  return {
    agent,
    post,
    revoke: () => {
      revoked = true;
    },
    changeIdentity: () => {
      alteredIdentity = true;
    },
    holdWrite: () => {
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        writeStarted = resolve;
      });
      writeGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { entered, release };
    },
  };
}
test('campaign routes deny missing CSRF, revoked native access and changed identity', async (t) => {
  const f = await fixture(t);
  await f.agent.post('/api/campaigns').send({ title: 'Review' }).expect(403);
  const created = await f.post('/api/campaigns', { title: 'Review' }).expect(201);
  await f.agent.get('/api/campaigns/' + created.body.id).expect(200);
  f.revoke();
  await f.agent.get('/api/campaigns').expect(403);
  await f.agent.get('/api/campaigns/' + created.body.id).expect(403);
  await f
    .post('/api/campaigns/' + created.body.id, {
      action: 'details',
      revision: 1,
      title: 'Changed',
      description: '',
    })
    .expect(403);
  const second = await fixture(t);
  second.changeIdentity();
  await second.agent.get('/api/campaigns').expect(403);
});
test('campaign remediation is bound to its workflow and cannot reconcile during an active write', async (t) => {
  const f = await fixture(t);
  const created = (await f.post('/api/campaigns', { title: 'Remediation review' }).expect(201))
    .body as Campaign;
  const path = '/api/campaigns/' + created.id;
  const captured = (
    await f.post(path, { action: 'capture', revision: 1, label: 'Before' }).expect(200)
  ).body as Campaign;
  const finding = findings(captured.captures[0].snapshot)[0];
  const prepared = (
    await f
      .post(path + '/remediation-review', {
        revision: 2,
        findingId: finding.id,
        fingerprint: finding.fingerprint,
        action: 'remove-role',
        role: '%All',
        reason: 'Remove unnecessary broad role',
      })
      .expect(200)
  ).body;
  await f
    .post('/api/changes/apply', { id: prepared.review.id, confirmation: 'operator' })
    .expect(409);
  const gate = f.holdWrite();
  const applying = f
    .post(path + '/remediation-apply', {
      revision: prepared.campaign.revision,
      reviewId: prepared.review.id,
      confirmation: 'operator',
    })
    .then((result) => result);
  await gate.entered;
  try {
    const current = (await f.agent.get(path).expect(200)).body;
    assert.equal(current.remediations[0].status, 'dispatching');
    await f
      .post(path + '/remediation-reconcile', {
        revision: current.revision,
        reviewId: prepared.review.id,
        note: 'Check while running',
      })
      .expect(409);
    await f
      .post(path, {
        action: 'state',
        revision: current.revision,
        state: 'archived',
        reason: 'Concurrent edit',
      })
      .expect(409);
  } finally {
    gate.release();
  }
  const completed = await applying;
  assert.equal(completed.status, 200);
  assert.equal(completed.body.campaign.remediations[0].status, 'verified');
  const reconciled = await f
    .post(path + '/remediation-reconcile', {
      revision: completed.body.campaign.revision,
      reviewId: prepared.review.id,
      note: 'Confirmed after completion',
    })
    .expect(200);
  assert.equal(reconciled.body.campaign.remediations[0].status, 'verified');
});
test('campaign capture, decision, conflict and lifecycle are enforced on the server', async (t) => {
  const f = await fixture(t);
  const created = (await f.post('/api/campaigns', { title: 'Review' }).expect(201))
    .body as Campaign;
  const path = '/api/campaigns/' + created.id;
  await f
    .post(path, { action: 'state', revision: 1, state: 'closed', reason: 'Finished' })
    .expect(409);
  const captured = (
    await f.post(path, { action: 'capture', revision: 1, label: 'Before' }).expect(200)
  ).body as Campaign;
  assert.equal(captured.captures[0].snapshot.instance, scope.instance);
  assert.doesNotMatch(JSON.stringify(captured), /test-only-password|Basic /);
  const finding = findings(captured.captures[0].snapshot)[0];
  await f
    .post(path, {
      action: 'decision',
      revision: 2,
      findingId: finding.id,
      fingerprint: 'incorrect',
      outcome: 'accepted',
      note: 'Reason',
    })
    .expect(409);
  const decision = (
    await f
      .post(path, {
        action: 'decision',
        revision: 2,
        findingId: finding.id,
        fingerprint: finding.fingerprint,
        outcome: 'accepted',
        note: 'Approved administration account',
      })
      .expect(200)
  ).body;
  assert.equal(decision.revision, 3);
  await f
    .post(path, { action: 'details', revision: 2, title: 'Stale', description: '' })
    .expect(409);
  await f
    .post(path, { action: 'state', revision: 3, state: 'closed', reason: 'All findings reviewed' })
    .expect(200);
  await f.post(path, { action: 'rules', revision: 4, rules: [] }).expect(409);
  await f
    .post(path, { action: 'state', revision: 4, state: 'active', reason: 'New review period' })
    .expect(200);
});
