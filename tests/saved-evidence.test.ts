import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshEvidence } from '../src/saved-evidence';
import { request, RequestError } from '../src/api';

test('saved campaign and receipt GET refusals remove their evidence and preserve the server error', async () => {
  for (const resource of ['campaigns/campaign-1', 'campaigns', 'changes/receipts']) {
    let visible: unknown = { protected: true };
    let error = '';
    const calls: unknown[][] = [];
    await refreshEvidence(
      resource,
      {
        current: () => true,
        received: (value) => {
          visible = value;
        },
        refused: () => {
          visible = undefined;
        },
        failed: (message) => {
          error = message;
        },
      },
      (async (...args: unknown[]) => {
        calls.push(args);
        throw new RequestError('Current access to the source is required.', 403);
      }) as typeof request,
    );
    assert.equal(visible, undefined);
    assert.equal(error, 'Current access to the source is required.');
    assert.deepEqual(calls, [[resource]], 'the helper sends only a GET without mutation content');
  }
});

test('temporary saved-evidence failure preserves the selected receipt or campaign object', async () => {
  for (const status of [500, 502, 429]) {
    const existing = { id: 'selected', captures: [{ id: 'capture-1' }] };
    let visible = existing;
    let message = '';
    await refreshEvidence(
      'campaigns/selected',
      {
        current: () => true,
        received: (value: typeof existing) => {
          visible = value;
        },
        refused: () => assert.fail('temporary failure must not unmount the detail or its draft'),
        failed: (value) => {
          message = value;
        },
      },
      (async () => {
        throw new RequestError('Read temporarily unavailable.', status);
      }) as typeof request,
    );
    assert.equal(visible, existing);
    assert.equal(message, 'Read temporarily unavailable.');
  }
});

test('an obsolete response cannot replace or clear evidence selected by a newer request', async () => {
  for (const status of [200, 403, 500]) {
    let active = true;
    let complete!: (value: unknown) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise((resolve, rejectPromise) => {
      complete = resolve;
      reject = rejectPromise;
    });
    const read = refreshEvidence(
      'campaigns/old-selection',
      {
        current: () => active,
        received: () => assert.fail('obsolete success replaced the new selection'),
        refused: () => assert.fail('obsolete denial cleared the new selection'),
        failed: () => assert.fail('obsolete error replaced the current message'),
      },
      (() => pending) as typeof request,
    );
    active = false;
    if (status === 200) complete({ id: 'old-selection' });
    else reject(new RequestError('Old read failed.', status));
    await read;
  }
});

test('a current successful response replaces evidence without an invalidation or error', async () => {
  const value = [{ id: 'receipt-1' }];
  let displayed: unknown;
  await refreshEvidence(
    'changes/receipts',
    {
      current: () => true,
      received: (received) => {
        displayed = received;
      },
      refused: () => assert.fail('successful refresh was invalidated'),
      failed: () => assert.fail('successful refresh reported an error'),
    },
    (async () => value) as typeof request,
  );
  assert.equal(displayed, value);
});
