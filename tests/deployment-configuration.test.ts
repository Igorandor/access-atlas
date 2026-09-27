import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfiguration } from '../server/configuration';

test('upstream configuration refuses prefixes that fixed native endpoint routing would discard', () => {
  for (const url of [
    'https://iris.example/production-prefix/',
    'https://iris.example/api/admin',
    'http://127.0.0.1:52780/iris',
  ])
    assert.throws(() => readConfiguration({ IRIS_URL: url }), /root origin.*path prefix/);
  for (const url of ['https://iris.example', 'https://iris.example/', 'http://127.0.0.1:52780']) {
    const config = readConfiguration({ IRIS_URL: url });
    assert.equal(new URL(config.irisUrl).pathname, '/');
    assert.equal(new URL(config.irisUrl).origin, new URL(url).origin);
  }
});

test('cookie and public-origin validation preserves local development and secure deployment', () => {
  assert.throws(
    () => readConfiguration({ PUBLIC_ORIGIN: 'http://atlas.example', COOKIE_SECURE: 'true' }),
    /HTTPS PUBLIC_ORIGIN/,
  );
  assert.throws(
    () => readConfiguration({ PUBLIC_ORIGIN: 'http://localhost:3200', COOKIE_SECURE: 'true' }),
    /HTTPS PUBLIC_ORIGIN/,
  );
  assert.throws(
    () => readConfiguration({ PUBLIC_ORIGIN: 'https://atlas.example', COOKIE_SECURE: 'false' }),
    /COOKIE_SECURE=true/,
  );
  const local = readConfiguration({
    IRIS_URL: 'http://127.0.0.1:52780',
    PUBLIC_ORIGIN: 'http://localhost:5174',
    COOKIE_SECURE: 'false',
  });
  assert.equal(local.host, '127.0.0.1');
  assert.equal(local.port, 3200);
  assert.equal(local.secure, false);
  const production = readConfiguration({
    IRIS_URL: 'https://iris.example',
    IRIS_INSTANCE_ID: 'production',
    PUBLIC_ORIGIN: 'https://atlas.example',
    COOKIE_SECURE: 'true',
    HOST: '0.0.0.0',
    PORT: '3100',
  });
  assert.equal(production.secure, true);
  assert.equal(production.origin, 'https://atlas.example');
  assert.equal(production.port, 3100);
  assert.equal(readConfiguration({}).host, '127.0.0.1');
});
