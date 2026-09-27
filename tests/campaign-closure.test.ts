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
import { campaignFindings, validateCampaign, type ReviewOutcome } from '../shared/campaign';
import { buildCampaignReport } from '../shared/campaign-report';
import type { RemediationRecord } from '../shared/remediation';

const scope = { owner: 'Fixture', instance: 'synthetic-closure' };
const at = '2026-09-27T12:00:00.000Z';
async function fixture(
  t: any,
  outcome: ReviewOutcome = 'accepted',
  status?: RemediationRecord['status'],
  reconciliation?: string,
) {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-closure-regression-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('atlas-closure-regression-'));
    await rm(directory, { recursive: true, force: true });
  });
  const now = () => Date.parse(at);
  const store = new CampaignStore(directory, now);
  const campaign = await store.create(scope, 'Closure review', 'Synthetic only');
  const captureId = randomUUID();
  campaign.captures.push({
    id: captureId,
    label: 'Complete capture',
    snapshot: {
      version: 1,
      instance: scope.instance,
      startedAt: at,
      capturedAt: at,
      warnings: [],
      users: [{ Name: 'FixtureOperator', Enabled: true, Roles: ['%All'], EscalationRoles: [] }],
      roles: [
        { Name: '%All', Description: '', GrantedRoles: [], Resources: [], EscalationOnly: false },
      ],
      resources: [],
      apps: [],
    },
  });
  campaign.decisions = campaignFindings(campaign).map((finding) => ({
    findingId: finding.id,
    fingerprint: finding.fingerprint,
    captureId,
    outcome,
    note: 'Synthetic decision',
    reviewedAt: at,
  }));
  assert.equal(campaign.decisions.length, 1);
  if (status)
    campaign.remediations.push({
      id: randomUUID(),
      findingId: campaign.decisions[0].findingId,
      fingerprint: campaign.decisions[0].fingerprint,
      title: 'Remove broad role',
      target: 'FixtureOperator',
      reason: 'Synthetic remediation',
      createdAt: at,
      updatedAt: at,
      status,
      path: '/v2/security/user',
      method: 'PUT',
      message: 'Synthetic result',
      checkedFields: [],
      expected: { Roles: [] },
      reconciliation,
    });
  validateCampaign(campaign);
  const partition = createHash('sha256')
    .update(JSON.stringify([scope.instance, scope.owner]))
    .digest('hex');
  const file = join(directory, partition, campaign.id + '.json');
  await writeFile(file, JSON.stringify(campaign));
  let executes = 0,
    targetReads = 0;
  const transport = {
    async request(_auth: string, operation: any) {
      assert.equal(operation.method, 'GET');
      if (operation.path === '/v2/security/user') {
        targetReads++;
        return { data: { Roles: ['%All'] }, status: 200, console: [] };
      }
      return {
        data: operation.path === '/info' ? { username: scope.owner, apiVersion: 2 } : [],
        status: 200,
        console: [],
      };
    },
  };
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.atlas = { auth: 'synthetic', info: { username: scope.owner } };
    next();
  });
  app.use(
    '/campaigns',
    campaignRoutes({
      transport: transport as any,
      store,
      instance: scope.instance,
      now,
      changes: {
        async execute() {
          executes++;
          throw new Error('Unexpected execution');
        },
      } as any,
    }),
  );
  app.use((error: any, _req: any, res: any, _next: any) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  const request = supertest(app),
    url = '/campaigns/' + campaign.id;
  const state = (value: string, revision = 1) =>
    request
      .post(url)
      .send({ action: 'state', state: value, revision, reason: 'Synthetic status reason' });
  const read = () => store.read(scope, campaign.id);
  const report = async () =>
    buildCampaignReport(
      await read(),
      { authorNote: '', include: ['findings', 'remediations'] },
      new Date(at),
    );
  t.after(() => assert.equal(executes, 0));
  return { campaign, file, request, url, state, read, report, targetReads: () => targetReads };
}

test('investigating refuses closure without changing bytes, then a final decision permits closure', async (t) => {
  const f = await fixture(t, 'investigating');
  const before = await readFile(f.file);
  const refused = await f.state('closed');
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /investigating/);
  assert.deepEqual(await readFile(f.file), before);
  const report = await f.report();
  assert.equal(
    report.readiness.find((row) => row.label === 'Investigations complete')?.satisfied,
    false,
  );
  assert.match(report.agenda[0].nextStep, /Complete the investigation/);
  const decision = f.campaign.decisions[0];
  assert.equal(
    (
      await f.request
        .post(f.url)
        .send({
          action: 'decision',
          revision: 1,
          findingId: decision.findingId,
          fingerprint: decision.fingerprint,
          outcome: 'accepted',
          note: 'Investigation finished; accepted.',
        })
    ).status,
    200,
  );
  assert.equal((await f.state('closed', 2)).status, 200);
  assert.equal((await f.read()).state, 'closed');
  assert.equal(
    (await f.report()).readiness.every((row) => row.satisfied),
    true,
  );
});

test('submitted unresolved states need readback; recorded mismatch permits closure without becoming verified', async (t) => {
  for (const status of [
    'dispatching',
    'uncertain',
    'unverified',
    'acknowledged',
    'different',
  ] as const) {
    const f = await fixture(
      t,
      'accepted',
      status,
      status === 'different' ? '   ' : 'An old note is not a current readback.',
    );
    const before = await readFile(f.file);
    assert.equal((await f.state('closed')).status, 409, status);
    assert.deepEqual(await readFile(f.file), before);
    assert.equal(
      (await f.report()).readiness.find((row) => row.label === 'Writes reconciled')?.satisfied,
      false,
    );
    const reconciled = await f.request
      .post(f.url + '/remediation-reconcile')
      .send({
        revision: 1,
        reviewId: f.campaign.remediations[0].id,
        note: 'Readback confirms broad role remains; accepted finding documents the disposition.',
      });
    assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body));
    assert.equal(f.targetReads(), 1);
    assert.equal((await f.state('closed', 2)).status, 200);
    const report = await f.report();
    assert.equal(report.counts.verifiedRemediations, 0);
    assert.equal(report.counts.unresolvedRemediations, 0);
    assert.equal(report.remediations?.[0].status, 'different');
    assert.match(
      report.agenda.find((row) => row.source === 'remediation')!.nextStep,
      /Readback recorded a difference/,
    );
    assert.equal(
      report.readiness.every((row) => row.satisfied),
      true,
    );
  }
});

test('reviewed drafts, failures and explained differences do not prevent terminal closure', async (t) => {
  for (const status of ['reviewed', 'failed', 'different'] as const) {
    const f = await fixture(
      t,
      'accepted',
      status,
      status === 'different' ? 'Known mismatch accepted after readback.' : undefined,
    );
    assert.equal((await f.state('closed')).status, 200, status);
    assert.equal((await f.read()).remediations[0].status, status);
    assert.equal(f.targetReads(), 0);
  }
});

test('archive preserves unfinished review while active dispatch still prevents state changes', async (t) => {
  const f = await fixture(t, 'investigating', 'uncertain');
  assert.equal((await f.state('archived')).status, 200);
  const campaign = await f.read();
  assert.equal(campaign.state, 'archived');
  assert.equal(campaign.decisions[0].outcome, 'investigating');
  assert.equal(campaign.remediations[0].status, 'uncertain');
  assert.equal(
    (await f.report()).readiness.every((row) => row.satisfied),
    false,
  );
  const dispatching = await fixture(t, 'accepted', 'dispatching');
  const before = await readFile(dispatching.file);
  assert.equal((await dispatching.state('archived')).status, 409);
  assert.deepEqual(await readFile(dispatching.file), before);
});
