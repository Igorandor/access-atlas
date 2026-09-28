import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Campaigns } from '../../src/features/campaigns/Campaigns';
import { campaignSummary } from '../../shared/campaign';
import {
  revisionCampaign,
  advanceRevision,
  addCapture,
  decision,
  originalCaptureId,
  nextCaptureId,
} from './certification-revision-data';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const realFetch = window.fetch.bind(window);
const root = createRoot(document.getElementById('probe'));
let stored,
  writes,
  reads,
  epoch = 0,
  readStatus = 200,
  writeStatus = 200,
  applied = 0;
const results = [];
const check = (name, pass) => results.push({ name, pass: !!pass });
const tick = () => act(async () => new Promise((r) => setTimeout(r, 10)));
const button = (name) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
const field = (label, type = 'input') =>
  [...document.querySelectorAll('label')]
    .find((l) => l.firstChild?.textContent.trim() === label)
    ?.querySelector(type);
const click = async (b) => {
  if (!b) throw Error('Missing button');
  await act(async () => b.click());
  await tick();
};
const fill = async (el, value) => {
  if (!el) throw Error('Missing input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype,
      'value',
    ).set.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
    );
  });
  await tick();
};
async function settle(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await tick();
  }
  throw Error('Certification fixture did not settle');
}
window.fetch = async (url, init = {}) => {
  if (url === '/api/campaigns') return Response.json([campaignSummary(stored)]);
  if (url === '/api/campaigns/' + stored.id) {
    if ((init.method || 'GET') !== 'GET') {
      const input = JSON.parse(init.body);
      writes.push(input);
      if (writeStatus !== 200)
        return Response.json({ error: 'Synthetic save refusal' }, { status: writeStatus });
      if (input.revision !== stored.revision || input.captureId !== stored.captures.at(-1).id)
        return Response.json({ error: 'Synthetic revision conflict' }, { status: 409 });
      stored = advanceRevision(stored, 'certify', (next) => {
        const { action, revision, ...data } = input;
        next.certifications = [{ ...data, reviewedAt: '2026-09-28T17:00:00.000Z' }];
      });
      applied++;
      return Response.json(stored);
    }
    reads.push(stored.revision);
    return Response.json(readStatus === 200 ? stored : { error: 'Synthetic read refusal' }, {
      status: readStatus,
    });
  }
  throw Error('Unexpected URL ' + url);
};
async function reset(saved) {
  stored = revisionCampaign();
  if (saved)
    stored = advanceRevision(
      stored,
      'certify',
      (next) => (next.certifications = [decision(next, 'Saved original reason', 'retain')]),
    );
  writes = [];
  reads = [];
  applied = 0;
  readStatus = 200;
  writeStatus = 200;
  await act(async () => root.render(<Campaigns key={++epoch} onManageAccount={() => {}} />));
  await settle(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes(stored.title)),
  );
  await click(
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes(stored.title)),
  );
  await settle(() => button('Certification'));
  await click(button('Certification'));
  if (saved) await fill(field('Decision', 'select'), 'all');
  await settle(() => document.querySelector('.certification-list button'));
}
const row = (name) =>
  [...document.querySelectorAll('.certification-list button')].find(
    (b) => b.querySelector('strong').textContent === name,
  );
const save = () => button('Record certification decision');
const note = () => field('Reason', 'textarea');
const conflict = () => button('Use saved decision')?.parentElement;
const submit = async () => {
  await act(async () =>
    document
      .querySelector('.certification-details form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  await tick();
};
(async () => {
  await reset();
  await click(button('Next'));
  await click(row('Account31'));
  await fill(note(), 'Review for Account31');
  await fill(field('Find object'), 'Account01');
  await click(save());
  check(
    'Filters and page changes never retarget the explicit selected account',
    writes[0]?.name === 'Account31' &&
      writes[0]?.revision === 1 &&
      writes[0]?.captureId === originalCaptureId &&
      document.querySelector('.certification-details h3').textContent === 'Account31',
  );
  check(
    'Acknowledged save adopts its revision without a false conflict',
    !conflict() && !save().disabled && applied === 1,
  );
  await fill(note(), 'Second review for Account31');
  await click(save());
  check(
    'A second deliberate edit uses the acknowledged revision',
    writes[1]?.revision === 2 && applied === 2,
  );
  await reset();
  await click(row('Account01'));
  await fill(note(), 'Old capture reason');
  stored = addCapture(stored);
  await click(button('Reload campaign'));
  await settle(() => !!conflict());
  check(
    'New capture retains the old draft but disables saving',
    note().value === 'Old capture reason' && save().disabled && !!conflict(),
  );
  check('New conflict receives keyboard focus once', document.activeElement === conflict());
  note().focus();
  await fill(note(), 'Old capture reason amended');
  check(
    'Ordinary typing does not steal focus back to the conflict',
    document.activeElement === note(),
  );
  await submit();
  check(
    'Programmatic submit cannot bypass a capture conflict',
    writes.length === 0 && applied === 0,
  );
  await click(button('Use saved decision'));
  check(
    'Explicit reset loads the current capture with an empty new decision',
    note().value === '' && !conflict(),
  );
  await fill(note(), 'Reviewed the newly granted administrator role');
  await click(save());
  check(
    'Newly reviewed decision submits only against the new capture and revision',
    writes[0]?.captureId === nextCaptureId && writes[0]?.revision === 2 && applied === 1,
  );
  await reset();
  await click(row('Account01'));
  await fill(note(), 'Local prior reason');
  stored = advanceRevision(stored, 'certify', (next) => (next.certifications = [decision(next)]));
  await click(button('Reload campaign'));
  await submit();
  check(
    'Concurrent saved decision cannot be silently overwritten by the older draft',
    !!conflict() && note().value === 'Local prior reason' && writes.length === 0,
  );
  await click(button('Use saved decision'));
  check(
    'Explicit reset loads the other reviewer outcome and reason',
    note().value === 'Other reviewer requires investigation' &&
      document.querySelector('.certification-details select').value === 'investigate' &&
      !conflict(),
  );
  await reset(true);
  await click(row('Account01'));
  stored = advanceRevision(stored, 'certify', (next) => (next.certifications = [decision(next)]));
  await click(button('Reload campaign'));
  check(
    'Pristine saved form follows an updated saved decision',
    note().value === 'Other reviewer requires investigation' && !conflict(),
  );
  await reset();
  await click(row('Account01'));
  await fill(note(), 'Retain same revision draft');
  await click(button('Reload campaign'));
  check(
    'Same-revision reload preserves editable draft without conflict',
    note().value === 'Retain same revision draft' && !save().disabled && !conflict(),
  );
  stored = advanceRevision(
    stored,
    'details',
    (next) => (next.description = 'Remote metadata change'),
  );
  await click(button('Reload campaign'));
  await submit();
  check(
    'Unrelated newer campaign revision preserves draft but blocks stale submission',
    note().value === 'Retain same revision draft' && !!conflict() && writes.length === 0,
  );
  await reset();
  await click(row('Account01'));
  await fill(note(), 'Matching text on another capture');
  stored = addCapture(stored);
  stored = advanceRevision(
    stored,
    'certify',
    (next) =>
      (next.certifications = [decision(next, 'Matching text on another capture', 'retain')]),
  );
  await click(button('Reload campaign'));
  await submit();
  check(
    'Matching remote text on a different capture cannot adopt a dirty draft',
    !!conflict() && writes.length === 0,
  );
  await reset();
  await click(row('Account01'));
  await fill(note(), 'Keep out-of-scope draft');
  stored = advanceRevision(
    stored,
    'certification-scope',
    (next) => (next.certificationScope.prefix = 'Account02'),
  );
  await click(button('Reload campaign'));
  check(
    'Removed subject retains dirty ownership and explains why it cannot save',
    !!button('Discard unavailable decision draft') &&
      !document.querySelector('.certification-details') &&
      document
        .querySelector('.certification-review')
        .textContent.includes('Keep out-of-scope draft'),
  );
  await click(button('Activity'));
  check(
    'Out-of-scope dirty draft still guards campaign tab navigation',
    !!document.querySelector('dialog') && !!button('Keep editing'),
  );
  await click(button('Keep editing'));
  await click(button('Discard unavailable decision draft'));
  await click(button('Activity'));
  check(
    'Explicit discard releases unavailable subject ownership',
    !document.querySelector('dialog') && !document.querySelector('.certification-review'),
  );
  await reset();
  await click(row('Account01'));
  await fill(note(), 'Keep draft after certification is disabled');
  stored = advanceRevision(stored, 'certification-scope', (next) => {
    next.certificationScope.enabled = false;
  });
  await click(button('Reload campaign'));
  check(
    'Disabling certification keeps the unavailable draft inspectable and explicitly discardable',
    !!button('Discard unavailable decision draft') &&
      document
        .querySelector('.certification-review')
        .textContent.includes('Keep draft after certification is disabled'),
  );
  await reset();
  await click(row('Account01'));
  await fill(note(), 'Refused draft');
  writeStatus = 409;
  await click(save());
  check(
    'Known save refusal retains draft and original revision',
    note().value === 'Refused draft' && writes[0]?.revision === 1 && !conflict() && applied === 0,
  );
  await reset();
  await click(row('Account01'));
  await fill(note(), 'Protected draft');
  readStatus = 403;
  await click(button('Reload campaign'));
  check(
    'Read denial still removes protected form and campaign export',
    !document.querySelector('.certification-review') && !button('Export campaign'),
  );
  await reset();
  await click(row('Account01'));
  await fill(note(), 'Preserved through temporary revalidation');
  writeStatus = 403;
  readStatus = 503;
  await click(save());
  check(
    'Temporary post-refusal access check hides but retains the draft',
    !!button('Check access again') &&
      document.querySelector('.certification-review').closest('[hidden]') !== null &&
      note().value === 'Preserved through temporary revalidation',
  );
  readStatus = 200;
  await click(button('Check access again'));
  check(
    'Authorized recovery restores same-revision draft without replay',
    note().value === 'Preserved through temporary revalidation' &&
      !document.querySelector('.certification-review').closest('[hidden]') &&
      writes.length === 1 &&
      !conflict(),
  );
  const report = { results, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await realFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
})().catch(async (error) => {
  const report = { results, error: error.stack, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await realFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
});
