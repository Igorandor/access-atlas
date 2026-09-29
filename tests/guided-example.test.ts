import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { trainingSnapshot } from '../src/example/training-snapshot';
import { parseSnapshot } from '../shared/snapshot-schema';
import { resolveAccess } from '../shared/access-model';
import {
  trainingAfter,
  trainingReviewOutcome,
  trainingReviewReport,
} from '../src/example/review-outcome';

test('training comparison records only the removed assignment and preserves independent read evidence', () => {
  const original = JSON.stringify(trainingSnapshot);
  const result = trainingReviewOutcome();
  assert.equal(result.before, 'RW');
  assert.equal(result.after, 'R');
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].kind, 'users');
  assert.equal(result.changes[0].name, 'alex.training');
  assert.equal(result.beforePaths.length, 2);
  assert.deepEqual(result.afterPaths, [
    'alex.training → ReportingReader → OrdersReader → TrainingOrders',
  ]);
  assert.deepEqual(trainingAfter.resources, trainingSnapshot.resources);
  assert.deepEqual(trainingAfter.roles, trainingSnapshot.roles);
  assert.equal(JSON.stringify(trainingSnapshot), original);
});

test('downloadable training evidence identifies synthetic captures, open follow-up and the entered note', () => {
  const report = trainingReviewReport(' Confirm reporting requirement with owner. ');
  assert.match(report, /SYNTHETIC EXAMPLE/);
  assert.match(report, /No IRIS connection, native change or live readback/);
  assert.match(report, /09:00:00.000Z/);
  assert.match(report, /09:10:00.000Z/);
  assert.match(report, /Declared permissions: RW → R/);
  assert.match(report, /Open follow-up:/);
  assert.match(report, /not a remediation receipt or approval/);
  assert.match(report, /Confirm reporting requirement with owner\./);
  assert.match(trainingReviewReport('  '), /\(none\)/);
});

test('training capture keeps an independent read path when the support assignment is removed', () => {
  const snapshot = parseSnapshot(trainingSnapshot);
  const before = JSON.stringify(snapshot);
  const account = snapshot.users[0];
  const original = resolveAccess(snapshot, account.Roles);
  const preview = resolveAccess(
    snapshot,
    account.Roles.filter((role) => role !== 'SupportTeam'),
  );
  assert.equal(original.grants.get('TrainingOrders')?.permissions, 'RW');
  assert.deepEqual(original.roles.get('OrdersWriter')?.roles, ['SupportTeam', 'OrdersWriter']);
  assert.equal(preview.grants.get('TrainingOrders')?.permissions, 'R');
  assert.deepEqual(preview.roles.get('OrdersReader')?.roles, ['ReportingReader', 'OrdersReader']);
  assert.equal(
    [...original.grants].filter(
      ([resource, grant]) => grant.permissions !== preview.grants.get(resource)?.permissions,
    ).length,
    1,
  );
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(
    resolveAccess(snapshot, account.Roles).grants.get('TrainingOrders')?.permissions,
    'RW',
  );
});

test('public training permission is separate from the account’s explicit grants', () => {
  const account = trainingSnapshot.users[0];
  assert.equal(
    trainingSnapshot.resources.find((resource) => resource.Name === 'TrainingStatus')
      ?.PublicPermission,
    'R',
  );
  assert.equal(resolveAccess(trainingSnapshot, account.Roles).grants.has('TrainingStatus'), false);
  assert.equal(resolveAccess(trainingSnapshot, []).grants.size, 0);
  assert.deepEqual(account.EscalationRoles, []);
});

test('static example dependency graph excludes connected application, API and server modules', () => {
  const result = buildSync({
    entryPoints: ['src/example/main.tsx'],
    bundle: true,
    write: false,
    outdir: 'test-results/example-contract',
    metafile: true,
    platform: 'browser',
    loader: { '.woff2': 'file', '.woff': 'file' },
  });
  const inputs = Object.keys(result.metafile!.inputs).map((path) => path.replaceAll('\\', '/'));
  assert.ok(inputs.some((path) => path.endsWith('src/features/access/AccessMap.tsx')));
  assert.ok(inputs.some((path) => path.endsWith('src/features/access/ResourceMatrix.tsx')));
  assert.ok(inputs.some((path) => path.endsWith('shared/access-model.ts')));
  assert.deepEqual(
    inputs.filter((path) => /(^|\/)server\/|src\/(App\.tsx|api\.ts|hooks\/)/.test(path)),
    [],
  );
  const html = readFileSync(new URL('../src/example/index.html', import.meta.url), 'utf8');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});
