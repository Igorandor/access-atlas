import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectSqlEvidence,
  filterSqlRows,
  SQL_EVIDENCE_LIMIT,
  type SqlRead,
} from '../shared/sql-evidence';
const scope = { namespace: 'USER', grantee: 'Operator' };
const object = {
  Type: 'TABLE',
  Name: 'Demo.Orders',
  Privilege: 'SELECT',
  GrantedVia: 'Role:Readers',
};
const ok: SqlRead = async (path) => ({
  data: path.endsWith('/sql-privileges') ? [object] : [{ Privilege: '%ALTER_TABLE' }],
  status: 200,
});

test('SQL collector uses two fixed native GET sources and bounded named queries', async () => {
  const calls: unknown[] = [];
  const special = { namespace: ' USER ', grantee: 'Reader&namespace=OTHER' };
  const report = await collectSqlEvidence(
    'instance-1',
    special,
    async (...args) => {
      calls.push(args);
      return ok(...args);
    },
    () => '2026-09-28T10:00:00Z',
  );
  assert.deepEqual(calls, [
    [
      '/v2/security/sql-privileges',
      { namespace: 'USER', grantee: 'Reader&namespace=OTHER', maxRows: '500', includeSystem: '1' },
      'GET',
    ],
    [
      '/v2/security/sql-admin-privileges',
      { namespace: 'USER', grantee: 'Reader&namespace=OTHER', maxRows: '500' },
      'GET',
    ],
  ]);
  assert.equal(report.instance, 'instance-1');
  assert.equal(report.scope.namespace, 'USER');
  assert.equal(report.sources[0].finishedAt, report.capturedAt);
  assert.equal(report.sources[0].rows[0].GrantedVia, 'Role:Readers');
});

test('SQL source failure preserves the other source and explicit failure status', async () => {
  const report = await collectSqlEvidence('instance', scope, async (...args) => {
    if (args[0].endsWith('/sql-admin-privileges'))
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    return ok(...args);
  });
  assert.equal(report.sources[0].status, 'read');
  assert.equal(report.sources[0].rows.length, 1);
  assert.equal(report.sources[1].status, 'unavailable');
  assert.equal(report.sources[1].httpStatus, 403);
  assert.equal(report.sources[1].error, 'Forbidden');
  assert.equal(report.sources[1].returnedCount, undefined);
});

test('nonarray replies are unavailable, while malformed rows preserve valid evidence with warning', async () => {
  const report = await collectSqlEvidence('instance', scope, async (path) => ({
    status: 200,
    data: path.endsWith('/sql-privileges')
      ? [
          object,
          null,
          { ...object, GrantOption: 'false' },
          { ...object, Name: 5 },
          { unexpected: true },
        ]
      : { privileges: [] },
  }));
  assert.equal(report.sources[0].status, 'partial');
  assert.equal(report.sources[0].rows.length, 1);
  assert.equal(report.sources[0].skippedCount, 4);
  assert.equal(report.sources[1].status, 'unavailable');
  assert.match(report.sources[1].error!, /expected an array/);
});

test('native Object/Action aliases normalize; conflicting documented aliases never silently win', async () => {
  const report = await collectSqlEvidence('instance', scope, async (path) => ({
    status: 200,
    data: path.endsWith('/sql-privileges')
      ? [
          { Type: 'VIEW', Object: 'Demo.View', Action: 'SELECT', GrantedVia: 'Owner Privilege' },
          { ...object, Object: 'Other.Table' },
          { ...object, Action: 'UPDATE' },
          { ...object, Object: object.Name, Action: object.Privilege },
        ]
      : [],
  }));
  assert.deepEqual(
    report.sources[0].rows.map((row) => row.Name),
    ['Demo.View', 'Demo.Orders'],
  );
  assert.equal(report.sources[0].rows[0].GrantedVia, 'Owner Privilege');
  assert.equal(report.sources[0].skippedCount, 2);
});

test('omitted and null flags remain unknown; explicit false and column-level warning survive', async () => {
  const report = await collectSqlEvidence('instance', scope, async (path) => ({
    status: 200,
    data: path.endsWith('/sql-privileges')
      ? [
          object,
          { ...object, GrantOption: null, HasColumnPriv: null },
          { ...object, GrantOption: false, HasColumnPriv: true },
        ]
      : [{ Privilege: '%ALTER_TABLE', GrantOption: false }],
  }));
  assert.equal(report.sources[0].rows[0].GrantOption, undefined);
  assert.equal(report.sources[0].rows[1].HasColumnPriv, undefined);
  assert.equal(report.sources[0].rows[2].GrantOption, false);
  assert.equal(report.sources[1].rows[0].GrantOption, false);
  assert.match(report.sources[0].warnings.join(' '), /not expanded/);
});

test('500 is a potentially truncated boundary; overlarge replies are capped locally', async () => {
  for (const count of [500, 501]) {
    const report = await collectSqlEvidence('instance', scope, async () => ({
      status: 200,
      data: Array.from({ length: count }, () => object),
    }));
    assert.equal(report.sources[0].rows.length, SQL_EVIDENCE_LIMIT);
    assert.equal(report.sources[0].returnedCount, count);
    assert.equal(report.sources[0].status, 'partial');
    assert.equal(report.sources[0].limitReached, true);
    assert.match(report.sources[0].warnings.join(' '), /additional records may exist/);
  }
});

test('empty successful sources are read evidence without a denial conclusion; filtering preserves original rows', async () => {
  const report = await collectSqlEvidence('instance', scope, async () => ({
    status: 200,
    data: [],
  }));
  assert.ok(report.sources.every((source) => source.status === 'read' && source.rows.length === 0));
  assert.match(report.warnings.join(' '), /do not mean access is denied/);
  const rows = [object, { ...object, Privilege: 'UPDATE' }];
  assert.equal(filterSqlRows(rows, 'update').length, 1);
  assert.equal(filterSqlRows(rows, ' role:readers ').length, 2);
  assert.equal(rows.length, 2);
});

test('invalid scope fails before any native read and cannot produce an unlabeled export', async () => {
  let calls = 0;
  const read: SqlRead = async () => {
    calls++;
    return { status: 200, data: [] };
  };
  for (const value of ['', ' ', 'x\u0000', 'x'.repeat(257)])
    await assert.rejects(collectSqlEvidence('instance', { ...scope, grantee: value }, read));
  await assert.rejects(collectSqlEvidence('', scope, read));
  assert.equal(calls, 0);
});
