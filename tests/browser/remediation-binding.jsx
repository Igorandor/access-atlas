import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Campaigns } from '../../src/features/campaigns/Campaigns';
import { DataDiff } from '../../src/components/DataView';
import { campaignSummary } from '../../shared/campaign';
import { advanceRevision } from './certification-revision-data';
import {
  remediationCampaign,
  remediationReview,
  recordReview,
  remoteCapture,
} from './remediation-binding-data';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const realFetch = window.fetch.bind(window),
  root = createRoot(document.getElementById('probe')),
  results = [];
let stored,
  payloads,
  epoch = 0,
  reviewSequence = 0,
  applyStatus = 409,
  readStatus = 200;
window.fetch = async (url, init = {}) => {
  if (url === '/api/campaigns') return Response.json([campaignSummary(stored)]);
  if (url === '/api/campaigns/' + stored.id)
    return Response.json(readStatus === 200 ? stored : { error: 'Synthetic denied read' }, {
      status: readStatus,
    });
  const input = JSON.parse(init.body);
  payloads.push({ url, ...input });
  if (input.revision !== stored.revision)
    return Response.json({ error: 'Synthetic revision conflict' }, { status: 409 });
  if (url.endsWith('/remediation-review')) {
    const review = remediationReview(stored, ++reviewSequence);
    stored = recordReview(stored, input, review);
    return Response.json({ campaign: stored, review, warnings: [], affected: [] });
  }
  if (url.endsWith('/remediation-apply')) {
    if (applyStatus !== 200)
      return Response.json({ error: 'Synthetic apply response failure' }, { status: applyStatus });
    stored = advanceRevision(stored, 'remediation-result', (next) => {
      next.remediations.find((row) => row.id === input.reviewId).status = 'verified';
    });
    return Response.json({ campaign: stored });
  }
  throw Error('Unexpected fixture request ' + url);
};
const tick = () => act(async () => new Promise((r) => setTimeout(r, 10)));
const button = (name) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
const check = (name, pass) => results.push({ name, pass: !!pass });
const confirm = () => document.querySelector('.remediation-confirmation input');
const stale = () => document.querySelector('[aria-label="Proposal needs a new review"]');
const recovery = () => document.querySelector('[aria-label="Submitted change recovery"]');
async function wait(f) {
  for (let i = 0; i < 100; i++) {
    if (f()) return;
    await tick();
  }
  throw Error('Remediation fixture did not settle');
}
async function click(node) {
  if (!node) throw Error('Missing button');
  await act(async () => node.click());
  await tick();
}
async function fill(el, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    ).set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await tick();
}
async function reset() {
  stored = remediationCampaign();
  payloads = [];
  applyStatus = 409;
  readStatus = 200;
  await act(async () => root.render(<Campaigns key={++epoch} onManageAccount={() => {}} />));
  await wait(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes(stored.title)),
  );
  await click(
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes(stored.title)),
  );
  await click(button('Remediation'));
  await fill(
    document.querySelector('.remediation-panel textarea'),
    'Preserve separately required roles',
  );
}
async function prepare() {
  await click(button('Check current state and review'));
  await wait(() => confirm());
  await fill(confirm(), 'Account01');
}
const applies = () => payloads.filter((p) => p.url.endsWith('/remediation-apply'));
(async () => {
  await reset();
  check(
    'Draft table labels captured and proposed values, never Current',
    document.querySelector('.remediation-panel table thead').textContent ===
      'FieldCapturedProposed',
  );
  await prepare();
  check(
    'Own prepare revision increment leaves its exact confirmation enabled',
    stored.revision === 2 && !button('Apply this change once').disabled && !stale(),
  );
  check(
    'Reviewed table is the only proposal table and labels expected values honestly',
    document.querySelectorAll('.remediation-panel table').length === 1 &&
      document.querySelector('.remediation-panel table thead').textContent ===
        'FieldReviewedExpected after change' &&
      !document.querySelector('.remediation-panel select'),
  );
  await click(button('Reload campaign'));
  check(
    'Same-revision read preserves valid proposal and confirmation',
    confirm().value === 'Account01' && !button('Apply this change once').disabled && !stale(),
  );
  stored = remoteCapture(stored);
  await click(button('Reload campaign'));
  check(
    'Changed capture clears typed confirmation and blocks the prior proposal',
    confirm().value === '' && button('Apply this change once').disabled && !!stale(),
  );
  check(
    'Conflict receives focus and hides the contradictory recalculated draft',
    document.activeElement === stale() &&
      !document.querySelector('.remediation-confirmation').textContent.includes('Backup') &&
      !document.querySelector('.remediation-panel select'),
  );
  button('Leave proposal unsubmitted').focus();
  await click(button('Reload campaign'));
  check(
    'Another read does not steal focus back to the same conflict',
    document.activeElement !== stale(),
  );
  await click(button('Apply this change once'));
  check('Blocked stale apply does not make a request', applies().length === 0);
  await click(button('Leave proposal unsubmitted'));
  check(
    'Explicit return restores current draft and original reason',
    document.querySelector('.remediation-panel').textContent.includes('Backup') &&
      document.querySelector('.remediation-panel textarea').value ===
        'Preserve separately required roles',
  );
  const returnedHeadingFocused =
    document.activeElement === document.querySelector('.remediation-panel h2');
  document.querySelector('.remediation-panel textarea').focus();
  await fill(
    document.querySelector('.remediation-panel textarea'),
    'Preserve separately required roles after current review',
  );
  check(
    'Leaving the proposal focuses the draft heading once and subsequent typing keeps focus',
    returnedHeadingFocused &&
      document.activeElement === document.querySelector('.remediation-panel textarea'),
  );
  await prepare();
  check(
    'Explicit new review uses latest revision and new expected roles',
    payloads.at(-1).revision === 3 &&
      stored.revision === 4 &&
      !stale() &&
      document.querySelector('.remediation-confirmation').textContent.includes('Backup') &&
      !button('Apply this change once').disabled,
  );
  applyStatus = 200;
  await click(button('Apply this change once'));
  check(
    'Confirmed success removes the review and preserves truthful history',
    !confirm() &&
      !recovery() &&
      stored.remediations.at(-1).status === 'verified' &&
      applies()[0].revision === 4,
  );
  await reset();
  await prepare();
  stored = advanceRevision(
    stored,
    'details',
    (next) => (next.description = 'Updated review scope narrative'),
  );
  await click(button('Reload campaign'));
  check(
    'Different campaign revision also invalidates the earlier approval',
    !!stale() && button('Apply this change once').disabled && confirm().value === '',
  );
  await reset();
  await prepare();
  const original = structuredClone(stored);
  stored = remoteCapture(stored);
  await click(button('Reload campaign'));
  stored = original;
  await click(button('Reload campaign'));
  check(
    'Returning old data never silently reactivates invalidated confirmation',
    !!stale() && button('Apply this change once').disabled,
  );
  await reset();
  await prepare();
  stored = remoteCapture(stored, true);
  await click(button('Reload campaign'));
  check(
    'Disappeared finding leaves old proposal visible only as stale and offers explicit return',
    !!stale() &&
      !!button('Leave proposal unsubmitted') &&
      button('Apply this change once').disabled &&
      !document.querySelector('.remediation-panel select'),
  );
  await reset();
  await prepare();
  applyStatus = 503;
  await click(button('Apply this change once'));
  const id = applies()[0].reviewId;
  stored = remoteCapture(stored);
  await click(button('Reload remediation history'));
  check(
    'Unknown apply outcome survives changed capture without becoming unsubmitted',
    !!recovery() &&
      recovery().textContent.includes(id) &&
      !stale() &&
      !!button('Return to draft') &&
      !button('Leave proposal unsubmitted') &&
      button('Apply this change once').disabled,
  );
  await click(button('Apply this change once'));
  check('Reload never replays a consumed review', applies().length === 1);
  await reset();
  await prepare();
  readStatus = 403;
  await click(button('Reload campaign'));
  check(
    'Denied campaign read still removes proposal, recovery and protected exports',
    !document.querySelector('.remediation-panel') && !button('Export campaign'),
  );
  await act(async () =>
    root.render(<DataDiff before={{ Enabled: true }} after={{ Enabled: false }} />),
  );
  check(
    'Other diff consumers keep Baseline and Current defaults',
    document.querySelector('table thead').textContent === 'FieldBaselineCurrent',
  );
  const report = { results, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await realFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
})().catch(async (error) => {
  const report = { results, error: error.stack, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await realFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
});
