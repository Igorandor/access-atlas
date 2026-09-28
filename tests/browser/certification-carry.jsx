import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CertificationReview } from '../../src/features/campaigns/CertificationReview';
import { revisionCampaign, advanceRevision } from './certification-revision-data';
import { carryCertifications } from '../../shared/certification';
import { validateCampaign } from '../../shared/campaign';
import '../../src/styles.css';
import '../../src/features/access/review.css';
import '../../src/layout/AtlasShell.css';
import '../../src/features/campaigns/campaigns.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function fixture(count = 3) {
  let campaign = revisionCampaign();
  campaign.certificationScope.includeDisabled = true;
  campaign.captures[0].snapshot.users = campaign.captures[0].snapshot.users.slice(0, count);
  campaign.certifications = campaign.captures[0].snapshot.users.map((user, index) => ({
    kind: 'accounts',
    name: user.Name,
    captureId: campaign.captures[0].id,
    outcome: index === 2 ? 'investigate' : 'retain',
    note: index === 2 ? 'Missing owner confirmation.' : 'Account required for assigned work.',
    reviewedAt: '2026-09-28T12:00:00.000Z',
  }));
  return advanceRevision(campaign, 'capture', (next) => {
    const capture = structuredClone(next.captures[0]);
    capture.id = '33333333-3333-4333-8333-333333333333';
    capture.label = 'Current access';
    capture.snapshot.capturedAt = '2026-09-28T13:00:00.000Z';
    capture.snapshot.users[1].Enabled = false;
    next.captures.push(capture);
  });
}
let current,
  replace,
  calls = [],
  refused = false,
  pending = false,
  finish;
const results = [];
function App({ initial }) {
  const [campaign, setCampaign] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  current = campaign;
  replace = setCampaign;
  const change = (update) => setCampaign((value) => advanceRevision(value, 'details', update));
  return (
    <main style={{ padding: 16, minWidth: 0 }}>
      <h1>Atlas carry-forward preview</h1>
      <p>Synthetic evidence. Saves affect this page only; no IRIS or persistent writes.</p>
      <div className="inline-actions">
        <button
          onClick={() => {
            refused = !refused;
            setError(refused ? 'Next save will be refused.' : 'Save refusal cleared.');
          }}
        >
          Toggle save refusal
        </button>
        <button
          onClick={() =>
            change((next) => {
              next.captures.at(-1).snapshot.warnings = ['Synthetic role source unavailable'];
            })
          }
        >
          Make capture incomplete
        </button>
        <button
          onClick={() => {
            calls = [];
            refused = false;
            setError('');
            setCampaign(fixture(31));
          }}
        >
          Load 31 decisions
        </button>
        <button
          onClick={() => {
            calls = [];
            refused = false;
            setError('');
            setCampaign(fixture());
          }}
        >
          Reset fixture
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <CertificationReview
        campaign={campaign}
        scope={campaign.certificationScope}
        decisions={campaign.certifications}
        disabled={busy}
        save={async (input, revision) => {
          calls.push({ input, revision });
          setBusy(true);
          if (pending)
            await new Promise((resolve) => {
              finish = resolve;
            });
          if (refused || revision !== current.revision) {
            setError('Synthetic save refused; campaign unchanged.');
            setBusy(false);
            return;
          }
          if (input.action !== 'carry-certifications') {
            setBusy(false);
            return;
          }
          const previous = current.captures.find((c) => c.id === input.fromCaptureId);
          const carried = carryCertifications({
            before: previous.snapshot,
            after: current.captures.at(-1).snapshot,
            previousCaptureId: previous.id,
            currentCaptureId: current.captures.at(-1).id,
            scope: current.certificationScope,
            decisions: current.certifications,
            at: '2026-09-28T14:00:00.000Z',
          });
          const next = advanceRevision(current, 'carry-certifications', (value) => {
            value.certifications = carried.decisions;
          });
          validateCampaign(next);
          setCampaign(next);
          setBusy(false);
          setError('');
        }}
      />
    </main>
  );
}
const root = createRoot(document.getElementById('probe'));
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });
const section = () => document.querySelector('.certification-carry');
const button = (name) =>
  [...section().querySelectorAll('button')].find((b) => b.textContent.trim() === name);
const carryButton = () =>
  [...section().querySelectorAll('button')].find((b) => /^Carry \d/.test(b.textContent.trim()));
const tick = () => act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
async function reset(count = 3) {
  calls = [];
  refused = false;
  pending = false;
  await act(async () => root.render(<App key={Math.random()} initial={fixture(count)} />));
  section().open = true;
  await tick();
}
async function change(update) {
  await act(async () => replace(advanceRevision(current, 'details', update)));
  await tick();
}
async function select(value) {
  await act(async () => {
    const field = section().querySelector('select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, value);
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await tick();
}
async function suite() {
  await reset();
  check(
    'Exact source and target capture names are shown',
    section().textContent.includes('From Original access to Current access'),
  );
  check(
    'One eligible subject and two omission reasons are visible',
    carryButton().textContent.trim() === 'Carry 1 decision' &&
      section().textContent.includes('Account01') &&
      section().textContent.includes('evidence changed') &&
      section().textContent.includes('Only retain or exception'),
  );
  check('Preview does not save automatically', calls.length === 0);
  refused = true;
  await act(async () => carryButton().click());
  check(
    'Refusal preserves preview and original capture assignments',
    carryButton().textContent.trim() === 'Carry 1 decision' &&
      current.certifications.every((d) => d.captureId === current.captures[0].id),
  );
  check(
    'Save binds displayed campaign revision and prior capture',
    calls[0].revision === 2 && calls[0].input.fromCaptureId === current.captures[0].id,
  );
  refused = false;
  pending = true;
  await act(async () => carryButton().click());
  check(
    'Pending save disables source selection and carry',
    carryButton().disabled && section().querySelector('select').disabled,
  );
  await act(async () => finish());
  await tick();
  check(
    'Success carries only eligible record without changing review time',
    current.certifications[0].captureId === current.captures.at(-1).id &&
      current.certifications[0].reviewedAt === '2026-09-28T12:00:00.000Z' &&
      current.certifications[1].captureId === current.captures[0].id,
  );
  check(
    'After success preview explains current decision and prevents repeat',
    carryButton().disabled &&
      section().textContent.includes('Decision already belongs to the current capture'),
  );
  await reset();
  await change((next) => {
    next.certificationScope.prefix = 'Account02';
  });
  check(
    'Saved scope changes recompute eligibility and omissions',
    carryButton().disabled && section().textContent.includes('outside the saved scope'),
  );
  await reset();
  await change((next) => {
    next.captures.at(-1).snapshot.warnings = ['Source unavailable'];
  });
  check(
    'Incomplete evidence is displayed and cannot carry',
    carryButton().disabled &&
      section().textContent.includes('Both captures must be complete') &&
      section().textContent.includes('Eligibility unavailable') &&
      section().querySelectorAll('li').length === 0 &&
      section().textContent.split('Both captures must be complete').length === 2,
  );
  await reset();
  await change((next) => {
    next.certifications[0].captureId = next.captures.at(-1).id;
  });
  check(
    'Concurrent current-capture decisions cannot be overwritten',
    carryButton().disabled && section().textContent.includes('Decision already belongs'),
  );
  await reset();
  await change((next) => {
    const capture = structuredClone(next.captures[0]);
    capture.id = '44444444-4444-4444-8444-444444444444';
    capture.label = 'Intermediate capture';
    next.captures.splice(1, 0, capture);
  });
  await select(current.captures[1].id);
  check(
    'Selecting another source explains unmatched decisions',
    carryButton().disabled &&
      section().textContent.includes('another capture') &&
      section().textContent.includes('From Intermediate capture to Current access'),
  );
  await select(current.captures[0].id);
  check(
    'Non-penultimate source uses exact selected evidence',
    !carryButton().disabled && carryButton().textContent.trim() === 'Carry 1 decision',
  );
  await reset(31);
  check(
    'Large preview is bounded to ten rows with aggregate count',
    section().querySelectorAll('li').length === 10 &&
      carryButton().textContent.trim() === 'Carry 29 decisions',
  );
  await act(async () => button('Next decisions').click());
  check(
    'Pagination shows the next bounded page',
    section().querySelectorAll('li').length === 10 &&
      section().textContent.includes('Account11') &&
      !section().querySelector('ul').textContent.includes('Account01'),
  );
  await select('');
  check(
    'Clearing source hides preview and disables carry',
    !section().querySelector('ul') && carryButton().disabled,
  );
  await reset();
  const scope = [...document.querySelectorAll('details')].find(
    (d) => d.querySelector('summary')?.textContent === 'Certification scope',
  );
  const prefix = [...scope.querySelectorAll('label')]
    .find((l) => l.textContent.includes('Name prefix'))
    .querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      prefix,
      'Account02',
    );
    prefix.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check(
    'Dirty scope is excluded explicitly without changing eligible count',
    section().textContent.includes('Unsaved scope changes are not included') &&
      carryButton().textContent.trim() === 'Carry 1 decision',
  );
  return { results, nativeCalls: 0, appliedWrites: 0 };
}
if (new URLSearchParams(location.search).has('manual')) {
  root.render(<App initial={fixture()} />);
} else {
  suite()
    .then((report) => {
      document.getElementById('result').textContent = JSON.stringify(report, null, 2);
      return fetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
    })
    .catch((error) => {
      const report = {
        error: String(error),
        stack: error.stack,
        results,
        nativeCalls: 0,
        appliedWrites: 0,
      };
      document.getElementById('result').textContent = JSON.stringify(report, null, 2);
      fetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
    });
}
