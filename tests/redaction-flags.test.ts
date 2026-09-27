import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialValues, redact } from '../shared/redaction';

test('documented boolean account policy remains visible in configuration evidence', () => {
  for (const value of [false, true]) {
    const User = { ChangePassword: value, PasswordNeverExpires: value, HOTPKeyDisplay: value };
    assert.deepEqual(redact({ User }), { User });
    assert.deepEqual(credentialValues({ User }), []);
  }
});

test('policy names with unexpected values never expose credential material', () => {
  for (const value of ['false', 'sensitive-value', 0, 1, null, { nested: 'secret' }, ['secret']]) {
    assert.deepEqual(
      redact({ ChangePassword: value, PasswordNeverExpires: value, HOTPKeyDisplay: value }),
      {
        ChangePassword: '[redacted]',
        PasswordNeverExpires: '[redacted]',
        HOTPKeyDisplay: '[redacted]',
      },
    );
  }
});

test('flag exceptions do not expose secrets, secret branches or known secret text', () => {
  const input = {
    User: { ChangePassword: true, PasswordNeverExpires: false, HOTPKeyDisplay: true },
    Password: 'credential-text',
    HOTPKey: 'totp-key',
    privateKey: 'private-key',
    token: true,
    clientSecret: { ChangePassword: true, value: 'nested-secret' },
    Comment: 'contains credential-text',
  };
  const known = credentialValues(input);
  assert.ok(known.includes('credential-text'));
  assert.ok(known.includes('nested-secret'));
  assert.deepEqual(redact(input, known), {
    User: input.User,
    Password: '[redacted]',
    HOTPKey: '[redacted]',
    privateKey: '[redacted]',
    token: '[redacted]',
    clientSecret: '[redacted]',
    Comment: 'contains [redacted]',
  });
});
