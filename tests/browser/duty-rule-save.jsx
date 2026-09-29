import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Campaigns } from '../../src/features/campaigns/Campaigns';
import { DutyReview } from '../../src/features/access/DutyReview';
import { revisionCampaign, advanceRevision } from './certification-revision-data';
import { campaignSummary, validateCampaign } from '../../shared/campaign';
import '../../src/styles.css';
import '../../src/features/access/review.css';
import '../../src/layout/AtlasShell.css';
import '../../src/features/campaigns/campaigns.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const realFetch = window.fetch.bind(window),
  results = [];
let root,
  campaign,
  posts,
  release,
  listFailure = false,
  manual = false;
function fresh() {
  campaign = revisionCampaign();
  campaign.captures[0].snapshot.roles = ['Requester', 'Approver'].map((Name) => ({
    Name,
    Description: '',
    GrantedRoles: [],
    Resources: [],
    EscalationOnly: false,
  }));
  validateCampaign(campaign);
  posts = [];
  listFailure = false;
  release = undefined;
}
window.fetch = async (url, options = {}) => {
  if (url === '/_test/result') return realFetch(url, options);
  if (url === '/api/campaigns')
    return listFailure
      ? Response.json({ error: 'Synthetic list refresh unavailable' }, { status: 503 })
      : Response.json([campaignSummary(campaign)]);
  if (url === '/api/campaigns/' + campaign.id) {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      posts.push(body);
      return new Promise((resolve) => {
        release = (status) => {
          release = undefined;
          if (status) resolve(Response.json({ error: 'Synthetic rule save refused' }, { status }));
          else {
            campaign = advanceRevision(campaign, 'rules', (next) => {
              next.rules = body.rules;
            });
            resolve(Response.json(campaign));
          }
        };
      });
    }
    return Response.json(campaign);
  }
  throw Error('Unexpected request ' + url);
};
async function settle(ready) {
  for (let i = 0; i < 150; i++) {
    if (ready()) return;
    await act(async () => new Promise((r) => setTimeout(r, 10)));
  }
  throw Error('Fixture did not settle');
}
const button = (text) =>
  [...document.querySelectorAll('#probe button')].find(
    (node) =>
      node.textContent.trim() === text || node.querySelector('strong')?.textContent === text,
  );
async function click(text) {
  await settle(() => button(text) && !button(text).disabled);
  await act(async () => button(text).click());
}
const fields = () => [...document.querySelectorAll('.duty-form input,.duty-form select')];
async function edit(node, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      'value',
    ).set.call(node, value);
    node.dispatchEvent(
      new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
    );
  });
}
async function fill() {
  for (const [i, value] of ['Request and approve payments', 'Requester', 'Approver'].entries())
    await edit(fields()[i], value);
}
async function mount(element) {
  if (root) await act(async () => root.unmount());
  root = createRoot(document.getElementById('probe'));
  await act(async () => root.render(element));
}
async function open() {
  fresh();
  await mount(<Campaigns onManageAccount={() => {}} />);
  await click(campaign.title);
  await click('Duty rules');
}
function check(label, pass) {
  results.push({ label, pass: !!pass });
  if (!pass) throw Error(label);
}
async function respond(status) {
  await act(async () => release(status));
  await settle(() => button('Add review rule') && !button('Add review rule').disabled);
}
async function suite() {
  await open();
  await fill();
  await click('Add review rule');
  check(
    'Pending save preserves and locks all three fields',
    fields().every((field) => field.disabled) &&
      fields()[0].value === 'Request and approve payments',
  );
  await act(async () => button('Saving review rule…').click());
  check('Repeated click while pending sends one request', posts.length === 1);
  await respond(409);
  check(
    'Refusal retains title and roles, keeps saved rules unchanged',
    fields()
      .map((field) => field.value)
      .join('|') === 'Request and approve payments|Requester|Approver' &&
      campaign.rules.length === 0 &&
      document.body.textContent.includes('Synthetic rule save refused'),
  );
  await click('Add review rule');
  await respond();
  check(
    'Confirmed save clears title and keeps role choices',
    fields()[0].value === '' &&
      fields()[1].value === 'Requester' &&
      campaign.rules.length === 1 &&
      document.querySelector('.duty-review li strong')?.textContent ===
        'Request and approve payments',
  );
  await open();
  await fill();
  await click('Add review rule');
  listFailure = true;
  await respond();
  check(
    'Saved rule remains accepted when list refresh fails',
    fields()[0].value === '' &&
      campaign.rules.length === 1 &&
      document.body.textContent.includes('saved'),
  );

  fresh();
  let resolve;
  let callback = () =>
    new Promise((yes) => {
      resolve = yes;
    });
  let snapshot = campaign.captures[0].snapshot;
  await mount(<DutyReview snapshot={snapshot} rules={[]} onRulesChange={callback} />);
  await fill();
  await click('Add review rule');
  snapshot = { ...snapshot, capturedAt: '2026-09-29T12:00:00.000Z' };
  await act(async () =>
    root.render(<DutyReview snapshot={snapshot} rules={[]} onRulesChange={callback} />),
  );
  await act(async () => resolve(true));
  check(
    'Late accepted save does not clear draft belonging to replacement snapshot',
    fields()[0].value === 'Request and approve payments',
  );

  await mount(<DutyReview snapshot={snapshot} rules={[]} onRulesChange={callback} />);
  await fill();
  await click('Add review rule');
  // Defensive stale-handler case: normal keyboard input is disabled while pending.
  await edit(fields()[0], 'Newer draft');
  await act(async () => resolve(true));
  check('Late accepted save does not erase newer input', fields()[0].value === 'Newer draft');
  await mount(
    <DutyReview
      snapshot={snapshot}
      rules={[]}
      onRulesChange={async () => {
        throw Error('Synthetic callback failed');
      }}
    />,
  );
  await fill();
  await click('Add review rule');
  check(
    'Rejected callback preserves draft and displays failure',
    fields()[0].value === 'Request and approve payments' &&
      document.body.textContent.includes('Synthetic callback failed'),
  );
  await mount(<DutyReview snapshot={snapshot} />);
  await fill();
  await click('Add review rule');
  check(
    'Standalone rules still save locally and clear title',
    fields()[0].value === '' &&
      document.querySelector('.duty-review li strong')?.textContent ===
        'Request and approve payments',
  );
  const badImport = document.querySelector('input[type=file]');
  await mount(
    <DutyReview
      snapshot={snapshot}
      rules={[]}
      onRulesChange={async () => {
        throw Error('Import callback failed');
      }}
    />,
  );
  const fileInput = document.querySelector('input[type=file]');
  Object.defineProperty(fileInput, 'files', {
    configurable: true,
    value: [
      new File(
        [JSON.stringify([{ title: 'Imported rule', left: 'Requester', right: 'Approver' }])],
        'rules.json',
        { type: 'application/json' },
      ),
    ],
  });
  await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
  await settle(() => document.body.textContent.includes('Import callback failed'));
  check(
    'Import retains callback failure after awaited helper',
    document.body.textContent.includes('Import callback failed'),
  );
}
async function startManual() {
  manual = true;
  const controls = document.createElement('div');
  controls.className = 'inline-actions';
  for (const [label, fn] of [
    ['Reset synthetic review', () => open()],
    ['Resolve save successfully', () => release?.()],
    ['Refuse save (409)', () => release?.(409)],
    [
      'Save, then fail list refresh (503)',
      () => {
        listFailure = true;
        release?.();
      },
    ],
  ]) {
    const node = document.createElement('button');
    node.textContent = label;
    node.onclick = async () => {
      await act(async () => fn());
    };
    controls.append(node);
  }
  document.getElementById('probe').before(controls);
  await open();
  document.getElementById('result').textContent =
    'Manual synthetic mode. Add a rule, then resolve its pending save using the fixture controls above.';
}
if (location.search === '?manual') startManual();
else
  suite()
    .then(() => finish())
    .catch((error) => finish(error));
async function finish(error) {
  const report = {
    results,
    nativeCalls: 0,
    appliedWrites: 0,
    ...(error ? { error: String(error), stack: error.stack } : {}),
  };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await realFetch('/_test/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
}
