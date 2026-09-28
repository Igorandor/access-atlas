import 'dotenv/config';
import assert from 'node:assert/strict';
import { IrisClient } from '../server/upstream';

// Read-only native contract probe: does not create accounts, grants or tables.
const { IRIS_TEST_USER: username, IRIS_TEST_PASSWORD: password } = process.env;
if (!username || !password) throw new Error('Set IRIS_TEST_USER and IRIS_TEST_PASSWORD.');
const client = new IrisClient(process.env.IRIS_URL ?? 'http://127.0.0.1:52780');
const authorization = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
const query = {
  grantee: process.env.IRIS_SQL_GRANTEE || username,
  namespace: process.env.IRIS_SQL_NAMESPACE || 'USER',
  maxRows: '5',
};
for (const source of ['sql-privileges', 'sql-admin-privileges']) {
  const result = await client.request(authorization, {
    path: '/v2/security/' + source,
    method: 'GET',
    query: source === 'sql-privileges' ? { ...query, includeSystem: '1' } : query,
  });
  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.data), 'Expected a native SQL privilege array.');
  assert.ok(result.data.length <= 5, 'Native row cap was not respected.');
  for (const row of result.data) {
    assert.equal(typeof row.GrantedVia, 'string');
    assert.equal(typeof row.GrantOption, 'boolean');
    if (source === 'sql-privileges') {
      // IRIS 2026.2 returned Object/Action while its OpenAPI lists Name/Privilege.
      assert.equal(typeof (row.Object ?? row.Name), 'string');
      assert.equal(typeof (row.Action ?? row.Privilege), 'string');
    } else assert.equal(typeof row.Privilege, 'string');
  }
  console.log(
    `PASS ${source}: HTTP 200, ${result.data.length} bounded rows; ${result.data.length ? 'row shape checked' : 'empty response, row shape not exercised'}`,
  );
}
