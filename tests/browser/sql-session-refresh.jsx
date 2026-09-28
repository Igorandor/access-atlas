import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import { revisionCampaign } from './certification-revision-data';
import '../../src/styles.css';
import '../../src/features/access/review.css';
import '../../src/layout/AtlasShell.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('probe'));
const reportFetch = window.fetch.bind(window),
  results = [];
let mode = '503',
  armed = false,
  ended = 0,
  reads = 0;
window.addEventListener('session-ended', () => ended++);
window.fetch = async (url, options) => {
  if (url === '/api/session') {
    if (!armed)
      return Response.json({
        csrf: 'synthetic-csrf',
        instance: 'synthetic-only',
        info: { username: 'Fixture' },
      });
    return mode === 'malformed401'
      ? new Response('not JSON', { status: 401 })
      : Response.json({ error: 'Synthetic session HTTP ' + mode }, { status: Number(mode) });
  }
  if (url === '/api/access-snapshot') return Response.json(revisionCampaign().captures[0].snapshot);
  if (url === '/api/iris') {
    reads++;
    return Response.json({
      data: JSON.parse(options.body).path.endsWith('/sql-privileges')
        ? [{ Type: 'TABLE', Name: 'Fixture.Table', Privilege: 'SELECT' }]
        : [{ Privilege: '%ALTER_TABLE' }],
      status: 200,
      console: [],
    });
  }
  throw Error('Unexpected request ' + url);
};
function Harness() {
  const [epoch, setEpoch] = useState(0),
    [selected, setSelected] = useState('503'),
    [fault, setFault] = useState(false);
  return (
    <>
      <section style={{ padding: '1rem', border: '2px solid #888' }}>
        <p>Synthetic App session fixture. No native calls or durable writes.</p>
        <label>
          Next session read{' '}
          <select
            aria-label="Next session read"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              mode = event.target.value;
            }}
          >
            <option value="503">503 temporary failure</option>
            <option value="403">403 refusal</option>
            <option value="401">401 expired session</option>
            <option value="malformed401">401 unreadable body</option>
          </select>
        </label>
        <button
          onClick={() => {
            armed = false;
            setFault(false);
            setEpoch((value) => value + 1);
          }}
        >
          Reset signed-in fixture
        </button>
        <button
          onClick={() => {
            armed = true;
            setFault(true);
          }}
        >
          Arm selected response
        </button>
        <p>
          {fault ? 'Next SQL refresh uses selected failure.' : 'Session reads succeed until armed.'}
        </p>
      </section>
      <App key={epoch} />
    </>
  );
}
function button(text) {
  return [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === text);
}
async function settle(ready) {
  for (let i = 0; i < 150; i++) {
    if (ready()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw Error('Fixture did not settle');
}
async function click(text) {
  await settle(() => button(text) && !button(text).disabled);
  await act(async () => button(text).click());
}
async function prepare(scenario) {
  const select = document.querySelector('select[aria-label="Next session read"]');
  await act(async () => {
    select.value = scenario;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Reset signed-in fixture');
  await click('SQL privileges');
  const grantee = [...document.querySelectorAll('label')]
    .find((label) => label.textContent.includes('User or role'))
    .querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      grantee,
      'Fixture',
    );
    grantee.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Read SQL privileges');
  await settle(
    () =>
      document.querySelector('table')?.textContent.includes('Fixture.Table') &&
      button('Read SQL privileges') &&
      !button('Read SQL privileges').disabled,
  );
}
function check(name, pass) {
  results.push({ name, pass: !!pass });
  if (!pass) throw Error(name);
}
async function suite() {
  location.hash = 'atlas';
  await act(async () => root.render(<Harness />));
  if (location.search === '?manual') {
    document.getElementById('result').textContent =
      'Manual actual App fixture ready. Open SQL privileges, capture Fixture, arm a response, then refresh.';
    return;
  }
  for (const scenario of ['503', '403', '401', 'malformed401']) {
    await prepare(scenario);
    const beforeEnded = ended,
      beforeReads = reads;
    await click('Arm selected response');
    await click('Read SQL privileges');
    if (scenario === '503' || scenario === '403') {
      await settle(() => document.body.textContent.includes('Synthetic session HTTP ' + scenario));
      check(
        'Session ' + scenario + ' preserves previously captured grants and export',
        document.querySelector('table')?.textContent.includes('Fixture.Table') &&
          !button('Export all captured evidence').disabled &&
          ended === beforeEnded,
      );
    } else {
      await settle(() => button('Sign in'));
      check(
        'Active session ' + scenario + ' returns actual App to sign-in and removes SQL export',
        !button('Export all captured evidence') &&
          !document.body.textContent.includes('Fixture.Table') &&
          ended === beforeEnded + 1,
      );
    }
    check(
      'Session ' + scenario + ' performs no SQL reads or automatic retry after refusal',
      reads === beforeReads,
    );
  }
}
suite()
  .then(async () => {
    if (location.search === '?manual') return;
    const report = { results, nativeCalls: 0, appliedWrites: 0 };
    document.getElementById('result').textContent = JSON.stringify(report, null, 2);
    await reportFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
  })
  .catch(async (error) => {
    const report = {
      results,
      error: String(error),
      stack: error.stack,
      nativeCalls: 0,
      appliedWrites: 0,
    };
    document.getElementById('result').textContent = JSON.stringify(report, null, 2);
    await reportFetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
  });
