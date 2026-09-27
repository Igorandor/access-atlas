import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import supertest from 'supertest';
import { CampaignStore } from '../server/campaign-store';
import { campaignRoutes } from '../server/campaign-routes';
import { campaignBounds, campaignFindings, validateCampaign } from '../shared/campaign';
import { receiptExplanation, type ChangeReceipt } from '../shared/change-review';

const scope = { owner: 'Fixture', instance: 'synthetic-capacity' };
const at = '2026-09-27T12:00:00.000Z',
  clock = () => Date.parse(at);
const partition = createHash('sha256')
  .update(JSON.stringify([scope.instance, scope.owner]))
  .digest('hex');
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const record = (id: string) => ({
  id,
  findingId: 'fixture-public-write',
  fingerprint: '',
  title: 'Remove public write',
  target: 'FixtureResource',
  reason: 'Synthetic capacity check',
  createdAt: at,
  updatedAt: at,
  status: 'reviewed',
  path: '/v2/security/resource',
  method: 'PUT',
  message: 'A fresh read will compare submitted nonsecret fields.',
  checkedFields: [],
  expected: { PublicPermission: 'R' },
});
async function fixture(
  t: any,
  options: { history?: number; fileBytes?: number; status?: ChangeReceipt['status'] } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-remediation-capacity-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('atlas-remediation-capacity-'));
    await rm(directory, { recursive: true, force: true });
  });
  const store = new CampaignStore(directory, clock);
  const campaign: any = await store.create(scope, 'Capacity boundary', 'Synthetic only');
  const reviewId = randomUUID();
  campaign.remediations = [record(reviewId)];
  campaign.captures = [
    {
      id: randomUUID(),
      label: 'Synthetic access capture',
      snapshot: {
        version: 1,
        instance: scope.instance,
        startedAt: at,
        capturedAt: at,
        warnings: [],
        users: [],
        roles: [],
        apps: [],
        resources: [
          { Name: 'FixtureResource', PublicPermission: 'RW', ResourceType: 'Application' },
        ],
      },
    },
  ];
  if (options.history) {
    campaign.revision = options.history;
    campaign.history = Array.from({ length: options.history }, (_, index) => ({
      revision: index + 1,
      at,
      actor: scope.owner,
      action: index ? 'details' : 'created',
      detail: 'Synthetic history',
    }));
  }
  if (options.fileBytes) {
    campaign.remediations.push(
      ...Array.from({ length: 199 }, () => ({ ...record(randomUUID()), status: 'verified' })),
    );
    let padding = options.fileBytes - bytes(campaign);
    for (const entry of campaign.remediations) {
      const count = Math.min(padding, 100_000);
      entry.fingerprint = 'f'.repeat(count);
      padding -= count;
    }
    assert.equal(padding, 0);
    assert.equal(bytes(campaign), options.fileBytes);
  }
  validateCampaign(campaign);
  const file = join(directory, partition, campaign.id + '.json');
  await writeFile(file, JSON.stringify(campaign));
  const initial = await readFile(file);
  let executes = 0,
    prepares = 0,
    cancels = 0,
    observedPermission = 'R',
    release: (() => void) | undefined,
    entered: (() => void) | undefined;
  let gate: Promise<void> | undefined;
  const transport = {
    async request(_auth: string, operation: any) {
      assert.equal(operation.method, 'GET');
      return {
        data:
          operation.path === '/info'
            ? { username: scope.owner, apiVersion: 2 }
            : operation.path === '/v2/security/resource'
              ? { PublicPermission: observedPermission }
              : [],
        status: 200,
        console: [],
      };
    },
  };
  const changes = {
    async prepare() {
      prepares++;
      return {
        id: randomUUID(),
        target: 'FixtureResource',
        createdAt: at,
        verification: 'Synthetic review',
      };
    },
    cancel() {
      cancels++;
    },
    async execute() {
      executes++;
      entered?.();
      if (gate) await gate;
      assert.equal((await store.read(scope, campaign.id)).remediations[0].status, 'dispatching');
      const status = options.status || 'verified';
      return {
        id: randomUUID(),
        reviewId,
        target: 'FixtureResource',
        path: '/v2/security/resource',
        method: 'PUT',
        at,
        status,
        nativeStatus: 200,
        message: receiptExplanation(status),
        checkedFields: ['PublicPermission'],
        differences: [],
      };
    },
  };
  const app = express();
  app.use(express.json());
  app.use((_request, response, next) => {
    response.locals.atlas = { auth: 'synthetic', info: { username: scope.owner }, csrf: 'fixture' };
    next();
  });
  app.use(
    '/campaigns',
    campaignRoutes({
      transport: transport as any,
      store,
      instance: scope.instance,
      now: clock,
      changes: changes as any,
    }),
  );
  app.use((error: any, _request: any, response: any, _next: any) =>
    response.status(error.status || 500).json({ error: error.message }),
  );
  const path = '/campaigns/' + campaign.id;
  return {
    store,
    campaign,
    initial,
    file,
    reviewId,
    get executes() {
      return executes;
    },
    get prepares() {
      return prepares;
    },
    get cancels() {
      return cancels;
    },
    read: () => store.read(scope, campaign.id),
    post: (suffix: string, body: object) =>
      supertest(app)
        .post(path + suffix)
        .send(body),
    apply: () =>
      supertest(app)
        .post(path + '/remediation-apply')
        .send({ revision: campaign.revision, reviewId, confirmation: 'FixtureResource' }),
    reconcile: (revision: number, note = 'Synthetic readback', matches = true) => {
      observedPermission = matches ? 'R' : 'RW';
      return supertest(app)
        .post(path + '/remediation-reconcile')
        .send({ revision, reviewId, note });
    },
    hold() {
      gate = new Promise<void>((done) => {
        release = done;
      });
      return {
        entered: new Promise<void>((done) => {
          entered = done;
        }),
        release: () => release!(),
      };
    },
  };
}

test('history near its cap refuses dispatch before execution and leaves the reviewed record byte-for-byte intact', async (t) => {
  for (const history of [998, 999]) {
    const f = await fixture(t, { history });
    const rejected = await f.apply().expect(409);
    assert.match(rejected.body.error, /capacity.*result.*reconciliation/);
    assert.equal(f.executes, 0);
    assert.deepEqual(await readFile(f.file), f.initial);
    assert.equal((await f.read()).remediations[0].status, 'reviewed');
  }
});

test('file bytes near the real 20 MB cap refuse dispatch before execution', async (t) => {
  const f = await fixture(t, { fileBytes: campaignBounds.fileBytes - 230 });
  const rejected = await f.apply().expect(413);
  assert.match(rejected.body.error, /storage capacity.*reconciliation/);
  assert.equal(f.executes, 0);
  assert.deepEqual(await readFile(f.file), f.initial);
});

test('reserved history stores finalization and one reconciliation, including an unresolved readback', async (t) => {
  for (const status of ['verified', 'uncertain'] as const) {
    const f = await fixture(t, { history: 997, status });
    const result = await f.apply().expect(200);
    assert.equal(f.executes, 1);
    assert.equal(result.body.campaign.revision, 999);
    if (status === 'uncertain') {
      const before = await readFile(f.file);
      await f
        .post('', { action: 'details', revision: 999, title: 'Ordinary change', description: '' })
        .expect(409);
      assert.deepEqual(await readFile(f.file), before);
    }
    const reconciled = await f
      .reconcile(999, 'Readback recorded even if still different', status === 'verified')
      .expect(200);
    assert.equal(reconciled.body.campaign.revision, 1000);
    assert.equal(
      reconciled.body.campaign.remediations[0].status,
      status === 'verified' ? 'verified' : 'different',
    );
    assert.equal(reconciled.body.campaign.history.length, 1000);
    assert.equal(f.executes, 1);
  }
});

test('ordinary edits cannot spend bytes reserved for unresolved remediation recovery', async (t) => {
  const f = await fixture(t, { fileBytes: 19_800_000, status: 'uncertain' });
  const result = await f.apply().expect(200);
  const revision = result.body.campaign.revision,
    before = await readFile(f.file);
  await f
    .post('', {
      action: 'details',
      revision,
      title: 'Ordinary change',
      description: '\0'.repeat(4000),
    })
    .expect(413);
  assert.deepEqual(await readFile(f.file), before);
  const recovered = await f.reconcile(revision, '\0'.repeat(4000), false).expect(200);
  assert.equal(recovered.body.campaign.remediations[0].status, 'different');
  assert.ok((await readFile(f.file)).length <= campaignBounds.fileBytes);
  assert.equal(f.executes, 1);
});

test('a pending dispatch excludes a second stored edit so finalization keeps its revision', async (t) => {
  const f = await fixture(t),
    gate = f.hold();
  const pending = f.apply().then((response) => response);
  await gate.entered;
  const current = await f.read();
  try {
    const finding = campaignFindings(current)[0];
    assert.ok(finding);
    await f
      .post('/remediation-review', {
        revision: current.revision,
        findingId: finding.id,
        fingerprint: finding.fingerprint,
        action: 'remove-public-write',
        reason: 'Second proposal while dispatch is pending',
      })
      .expect(409);
    assert.equal(f.prepares, 1);
    assert.equal(f.cancels, 1);
    await assert.rejects(
      f.store.change(
        scope,
        current.id,
        current.revision,
        'remediation-reviewed',
        'Second proposal',
        () => {},
      ),
      (error: any) => error.status === 409,
    );
    await assert.rejects(
      f.store.change(
        scope,
        current.id,
        current.revision,
        'remediation-result',
        'Wrong completion',
        () => {},
        randomUUID(),
      ),
      (error: any) => error.status === 409,
    );
    assert.equal((await f.read()).revision, current.revision);
  } finally {
    gate.release();
  }
  assert.equal((await pending).status, 200);
  assert.equal((await f.read()).remediations[0].status, 'verified');
});
