import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Campaigns } from '../../src/features/campaigns/Campaigns';
import { revisionCampaign, advanceRevision } from './certification-revision-data';
import { campaignSummary, validateCampaign } from '../../shared/campaign';
import { nextPeriodSettings } from '../../shared/campaign-period';
import '../../src/styles.css';
import '../../src/features/access/review.css';
import '../../src/layout/AtlasShell.css';
import '../../src/features/campaigns/campaigns.css';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window),
  root = createRoot(document.getElementById('probe')),
  results = [],
  calls = [];
let source,
  records,
  fault = 'transport',
  listStatus = 200,
  empty = false,
  holdPost = false,
  holdRead = false,
  release,
  afterSaveListFailure = false;
const original = revisionCampaign();
window.fetch = async (url, options = {}) => {
  const method = options.method || 'GET',
    input = options.body ? JSON.parse(options.body) : undefined;
  calls.push({ url, method, input });
  if (url === '/api/campaigns' && method === 'GET') {
    const respond = () =>
      Response.json(
        listStatus === 'shape'
          ? [{}]
          : listStatus === 200
            ? empty
              ? []
              : [...records.values()].map(campaignSummary)
            : { error: 'Synthetic list ' + listStatus },
        { status: listStatus === 'shape' ? 200 : listStatus },
      );
    if (holdRead)
      return new Promise((resolve) => {
        release = () => resolve(respond());
      });
    return respond();
  }
  if (method === 'GET' && records.has(url.slice('/api/campaigns/'.length)))
    return Response.json(records.get(url.slice('/api/campaigns/'.length)));
  if (
    method === 'POST' &&
    (url === '/api/campaigns' || url === '/api/campaigns/' + source.id + '/next-period')
  ) {
    const child = structuredClone(source);
    child.id = crypto.randomUUID();
    child.title = input.title;
    child.description = input.description;
    child.revision = 1;
    child.captures = [];
    child.certifications = [];
    child.rules = [];
    child.policies = [];
    child.certificationScope = {
      enabled: false,
      kinds: ['accounts'],
      prefix: '',
      includeDisabled: false,
    };
    child.history = [
      {
        revision: 1,
        at: source.createdAt,
        actor: 'Fixture',
        action: 'created',
        detail: input.title,
      },
    ];
    if (url.endsWith('/next-period')) {
      if (input.revision !== source.revision)
        return Response.json({ error: 'Source changed' }, { status: 409 });
      Object.assign(child, nextPeriodSettings(source, input));
      child.history[0].action = 'next-period';
    }
    validateCampaign(child);
    if (['transport', 'malformed', 'shape', 503, 200].includes(fault)) records.set(child.id, child);
    const respond = () => {
      if (fault === 'transport')
        throw new TypeError('Synthetic response lost after saving campaign');
      if (fault === 'malformed') return new Response('truncated', { status: 201 });
      if (fault === 'shape') return Response.json({}, { status: 201 });
      if (fault === 200 && afterSaveListFailure) listStatus = 503;
      return Response.json(fault === 200 ? child : { error: 'Synthetic create refusal ' + fault }, {
        status: fault === 200 ? 201 : fault,
      });
    };
    if (holdPost)
      return new Promise((resolve, reject) => {
        release = () => {
          try {
            resolve(respond());
          } catch (e) {
            reject(e);
          }
        };
      });
    return respond();
  }
  throw Error('Unexpected request ' + url);
};
function App() {
  return (
    <main style={{ padding: 16, minWidth: 0 }}>
      <h1>Campaign creation recovery</h1>
      <p>Synthetic records only. No native or persistent writes.</p>
      <div className="inline-actions">
        <button onClick={() => (fault = 'transport')}>Lose next response</button>
        <button onClick={() => (fault = 409)}>Refuse creation</button>
        <button onClick={() => (fault = 200)}>Allow creation</button>
        <button onClick={() => (listStatus = 503)}>Refuse list</button>
        <button onClick={() => (listStatus = 403)}>Deny list</button>
        <button
          onClick={() => {
            listStatus = 200;
            empty = false;
          }}
        >
          Allow list
        </button>
        <button
          onClick={() => {
            listStatus = 200;
            empty = true;
          }}
        >
          Empty list
        </button>
        <button onClick={() => location.reload()}>Reset fixture</button>
      </div>
      <Campaigns onManageAccount={() => {}} />
    </main>
  );
}
const button = (text) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const recovery = () => document.querySelector('.campaign-creation-recovery');
const ordinary = () => document.querySelector('.campaign-index form');
const next = () => document.querySelector('.next-period');
const posts = () => calls.filter((c) => c.method === 'POST');
const check = (name, pass) => results.push({ name, pass: !!pass });
const tick = () => act(async () => new Promise((r) => setTimeout(r, 10)));
async function settle(test) {
  for (let i = 0; i < 100; i++) {
    if (test()) return;
    await tick();
  }
  throw Error('Fixture did not settle');
}
async function click(b) {
  if (!b) throw Error('Missing button');
  await act(async () => b.click());
  await tick();
}
async function fill(node, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    ).set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await tick();
}
async function submit(form) {
  await act(async () =>
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  await tick();
}
function init() {
  source = structuredClone(original);
  records = new Map([[source.id, source]]);
  fault = 'transport';
  listStatus = 200;
  empty = false;
  holdPost = false;
  holdRead = false;
  release = undefined;
  afterSaveListFailure = false;
  calls.length = 0;
}
async function reset() {
  init();
  await act(async () => root.render(<App key={Math.random()} />));
  await settle(() => !button('Refresh list').disabled);
  ordinary().closest('details').open = true;
  await fill(ordinary().querySelector('input'), 'Quarterly access review');
  await fill(ordinary().querySelector('textarea'), 'Retained ordinary scope');
}
async function openNext() {
  await click(document.querySelector('.campaign-index nav button'));
  await settle(() => !!button('Next review period'));
  await click(button('Next review period'));
  await fill(next().querySelector('input[maxlength="160"]'), 'Next quarter');
  await fill(next().querySelector('textarea'), 'Retained next-period scope');
  await click(
    [...next().querySelectorAll('label')]
      .find((l) => l.textContent.includes('I reviewed the settings'))
      .querySelector('input'),
  );
}
async function suite() {
  for (const kind of ['transport', 'malformed', 'shape', 503]) {
    await reset();
    fault = kind;
    await submit(ordinary());
    await submit(ordinary());
    check(
      kind + ' ordinary creation uncertainty retains draft and blocks direct replay',
      posts().length === 1 &&
        button('Create campaign').disabled &&
        !!recovery() &&
        ordinary().querySelector('input').value === 'Quarterly access review',
    );
  }
  await reset();
  fault = 409;
  await submit(ordinary());
  check(
    'Definite refusal permits retry and preserves ordinary fields',
    !recovery() &&
      !button('Create campaign').disabled &&
      ordinary().querySelector('textarea').value === 'Retained ordinary scope',
  );
  await reset();
  holdPost = true;
  await submit(ordinary());
  await submit(ordinary());
  check(
    'Synchronous pending guard prevents duplicate ordinary submissions',
    posts().length === 1 && ordinary().querySelector('fieldset').disabled,
  );
  await act(async () => release());
  await tick();
  await reset();
  await openNext();
  const sourceId = source.id;
  await submit(next().querySelector('form'));
  await submit(next().querySelector('form'));
  await submit(ordinary());
  check(
    'Next-period uncertainty blocks both entrypoints and retains original source',
    posts().length === 1 &&
      button('Create next-period campaign').disabled &&
      button('Create campaign').disabled &&
      recovery().textContent.includes(sourceId) &&
      next().querySelector('textarea').value === 'Retained next-period scope' &&
      source.revision === 1,
  );
  await fill(document.querySelector('.campaign-index input[type=search]'), 'no matches');
  await click(button('Check saved campaigns'));
  check(
    'Explicit read resets filters and retains next-period draft without selecting a child',
    !document.querySelector('.campaign-index input[type=search]').value &&
      document.querySelector('.campaign-check input').checked &&
      next().querySelector('textarea').value === 'Retained next-period scope' &&
      document.querySelector('.campaign-summary h2').textContent === source.title &&
      button('Create next-period campaign').disabled &&
      posts().length === 1,
  );
  await click(button('I checked saved campaigns; allow another campaign'));
  check(
    'Explicit acknowledgement permits deliberate creation without automatic POST',
    !button('Create next-period campaign').disabled && !recovery() && posts().length === 1,
  );
  await reset();
  await submit(ordinary());
  listStatus = 503;
  await click(button('Check saved campaigns'));
  check(
    'Read failure stays beside recovery and cannot enable acknowledgement',
    recovery().querySelector('[role=alert]')?.textContent.includes('Synthetic list 503') &&
      !button('I checked saved campaigns; allow another campaign') &&
      button('Create campaign').disabled,
  );
  listStatus = 'shape';
  await click(button('Check saved campaigns'));
  check(
    'Malformed list remains blocked without publishing broken summaries',
    !!recovery().querySelector('[role=alert]') &&
      !button('I checked saved campaigns; allow another campaign'),
  );
  listStatus = 200;
  empty = true;
  await click(button('Check saved campaigns'));
  check(
    'Empty list does not imply failed creation and still needs acknowledgement',
    recovery().textContent.includes('absent campaign does not prove') &&
      button('Create campaign').disabled &&
      !!button('I checked saved campaigns; allow another campaign'),
  );
  listStatus = 503;
  await click(button('Refresh list'));
  check(
    'Ordinary refresh invalidates prior recovery acknowledgement even on transient failure',
    !button('I checked saved campaigns; allow another campaign') &&
      button('Create campaign').disabled,
  );
  listStatus = 200;
  empty = false;
  await click(button('Check saved campaigns'));
  listStatus = 403;
  await click(button('Refresh list'));
  check(
    'Denied history clears saved campaigns and previous acknowledgement',
    !document.querySelector('.campaign-index nav button') &&
      !button('I checked saved campaigns; allow another campaign') &&
      button('Create campaign').disabled,
  );
  await reset();
  await submit(ordinary());
  holdRead = true;
  await click(button('Check saved campaigns'));
  await click(button('Check saved campaigns'));
  await submit(ordinary());
  check(
    'Pending recovery read cannot repeat GET or POST',
    posts().length === 1 &&
      calls.filter((c) => c.url === '/api/campaigns' && c.method === 'GET').length === 2,
  );
  await act(async () => release());
  await tick();
  await reset();
  fault = 200;
  afterSaveListFailure = true;
  await submit(ordinary());
  check(
    'Known successful creation stays separate from list refresh failure',
    !recovery() &&
      document.querySelector('.campaign-summary h2').textContent === 'Quarterly access review' &&
      ordinary().querySelector('input').value === '' &&
      document.querySelector('[role=alert]').textContent.includes('Change saved') &&
      posts().length === 1,
  );
  await reset();
  await openNext();
  fault = 409;
  await submit(next().querySelector('form'));
  check(
    'Definite next-period refusal preserves fields and acknowledgement',
    !recovery() &&
      !button('Create next-period campaign').disabled &&
      next().querySelector('textarea').value === 'Retained next-period scope',
  );
  fault = 'transport';
  await submit(next().querySelector('form'));
  await click(button('Check saved campaigns'));
  await click(button('I checked saved campaigns; allow another campaign'));
  source = advanceRevision(source, 'details', (value) => {
    value.title = 'Updated source';
  });
  records.set(source.id, source);
  await click(button('Reload campaign'));
  check(
    'Existing source revision review guard remains effective after recovery',
    button('Create next-period campaign').disabled &&
      next().textContent.includes('campaign changed') &&
      next().querySelector('textarea').value === 'Retained next-period scope',
  );
  await reset();
  await openNext();
  fault = 200;
  await submit(next().querySelector('form'));
  check(
    'Known next-period success selects validated child and leaves source revision unchanged',
    !recovery() &&
      document.querySelector('.campaign-summary h2').textContent === 'Next quarter' &&
      posts().length === 1 &&
      source.revision === 1,
  );
  return { results, nativeCalls: 0, appliedWrites: 0 };
}
if (new URLSearchParams(location.search).has('manual')) {
  init();
  root.render(<App />);
} else
  suite()
    .then((report) => {
      document.getElementById('result').textContent = JSON.stringify(report, null, 2);
      return reportFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
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
      reportFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
    });
