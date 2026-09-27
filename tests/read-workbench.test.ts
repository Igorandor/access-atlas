import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOperations, validateReadQuery, compareQueryValues } from '../shared/query-workbench';
import {
  normalizeLogEntries,
  filterLogEntries,
  compareLogWindows,
  logCsv,
} from '../shared/log-review';
import { agendaCsv } from '../shared/campaign-report';

test('read catalog excludes credential retrieval and cannot add arbitrary operations', () => {
  const paths = new Set(readOperations().map((operation) => operation.path));
  assert.equal(paths.has('/v2/wallet/secret'), false);
  assert.equal(paths.has('/v2/wallet/secrets'), true);
  assert.equal(paths.has('/login'), false);
  assert.throws(() => validateReadQuery('https://example.invalid', {}), /not available/);
  assert.throws(() => validateReadQuery('/v2/security/user', {}), /Required/);
  assert.throws(
    () => validateReadQuery('/v2/security/users', { maxRows: '1001' }),
    /1,000|exceeds/,
  );
  assert.throws(() => validateReadQuery('/v2/security/users', { arbitrary: 'yes' }), /Unknown/);
});
test('workbench comparison preserves ordered arrays and flags truncation rather than equality', () => {
  const result = compareQueryValues({ rows: ['a', 'b'] }, { rows: ['b', 'a'] });
  assert.equal(result.rows.length, 2);
  assert.equal(result.truncated, false);
  const capped = compareQueryValues({ a: 1, b: 2 }, { a: 2, b: 3 }, 1);
  assert.equal(capped.rows.length, 1);
  assert.equal(capped.truncated, true);
});
test('host-local log timestamps stay unknown while native task time remains visible', () => {
  const rows = normalizeLogEntries('tasks', [
    { LastStart: '2026-09-27 10:12:15', Result: 'Success' },
    { Timestamp: '2026-09-27T10:12:15Z', Message: 'Failed request', Severity: 'info' },
  ]);
  assert.equal(rows[0].timestamp, '2026-09-27 10:12:15');
  assert.equal(rows[0].epoch, undefined);
  assert.equal(rows[1].epoch, Date.parse('2026-09-27T10:12:15Z'));
  assert.equal(rows[1].level, 'information');
  assert.equal(rows[1].levelBasis, 'native field');
  const filter = {
    include: '',
    exclude: '',
    actor: '',
    levels: [],
    from: Date.parse('2026-09-27T00:00:00Z'),
    includeUnknownTime: false,
  };
  assert.equal(filterLogEntries(rows, filter).length, 1);
  assert.equal(filterLogEntries(rows, { ...filter, includeUnknownTime: true }).length, 2);
});
test('log comparison accounts for repeated identical lines instead of discarding duplicates', () => {
  const before = normalizeLogEntries('messages', ['same', 'same']);
  const after = normalizeLogEntries('messages', ['same', 'same', 'same']);
  const compared = compareLogWindows(before, after);
  assert.equal(compared.shared, 2);
  assert.equal(compared.newlyObserved.length, 1);
  assert.equal(compared.noLongerInWindow, 0);
});
test('CSV protects leading whitespace formulas in log and review-note columns', () => {
  assert.match(logCsv(normalizeLogEntries('messages', ['  =SUM(1)'])), /"'  =SUM\(1\)"/);
  assert.match(
    agendaCsv([
      {
        id: 'a',
        source: 'campaign',
        target: 'A',
        title: 'Review',
        state: 'pending',
        note: ' \t@Formula()',
        overdue: false,
        nextStep: 'Inspect',
      },
    ]),
    /"' \t@Formula\(\)"/,
  );
});
