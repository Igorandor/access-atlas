import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AccessMap } from '../../src/features/access/AccessMap';
import { ResourceMatrix } from '../../src/features/access/ResourceMatrix';
import { parseSnapshot } from '../../shared/snapshot-schema';
import { resolveAccess } from '../../shared/access-model';
import '../../src/styles.css';
import '../../src/features/access/review.css';
import '../../src/layout/AtlasShell.css';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById('probe'));
let generation = 0;
import { scenarios, incompleteSnapshot } from './incomplete-snapshot';
const tick = () => act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
async function render(node) {
  await act(async () => root.render(<div key={++generation}>{node}</div>));
  await tick();
}
const results = [];
const check = (name, pass) => results.push({ name, pass: !!pass });
(async () => {
  const expected = ['?', '?', 'R + ?', '?', 'R', 'R', '?', '—'];
  for (const [index, scenario] of scenarios.entries()) {
    const snapshot = incompleteSnapshot(scenario);
    await render(<ResourceMatrix snapshot={snapshot} initialResourceSearch="Training" />);
    const cell = document.querySelector(
      'button[aria-label="Explain review.training on TrainingOrders"]',
    );
    check(
      `${scenario}: matrix retains known grants and separate public permission`,
      cell.textContent === expected[index] &&
        document.querySelector('.public-row td:last-child').textContent === 'R',
    );
    await act(async () => cell.click());
    await tick();
    const text = document.querySelector('dialog').textContent;
    const incomplete = [0, 1, 2, 3, 6].includes(index);
    check(
      `${scenario}: explanation distinguishes unknown from complete absence and keeps proven paths`,
      index === 3
        ? text.includes('yes — broad privileges') && text.includes('HiddenRole')
        : incomplete
          ? text.includes('unknown — account or role details are incomplete') &&
            !text.includes('no declared path') &&
            (index === 6 ? !text.includes('review.training → Reader') : text.includes('HiddenRole'))
          : text.includes('no declared path') &&
            !text.includes('role definitions could not be read'),
    );
    await act(async () =>
      document.querySelector('dialog button[aria-label="Close dialog"]').click(),
    );
    await tick();
    if (index < 4) {
      await render(<AccessMap snapshot={snapshot} />);
      check(
        `${scenario}: original unread role is visible before preview`,
        document
          .querySelector('#probe')
          .textContent.includes('Role HiddenRole could not be read; its privileges are unknown.'),
      );
      const toggle = [...document.querySelectorAll('.role-switches label')]
        .find((label) => label.textContent === 'HiddenRole')
        .querySelector('input');
      await act(async () => toggle.click());
      await tick();
      const text = document.querySelector('#probe').textContent;
      check(
        `${scenario}: omitting unread role keeps baseline limitation and qualifies the count`,
        text.includes('0 known resource grant sets change.') &&
          text.includes('The full effect is unknown') &&
          text.includes('original assignment includes unread role definitions: HiddenRole') &&
          (index !== 3 || text.includes('%All is reachable')),
      );
    }
  }
  const report = { results, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await fetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
})().catch(async (error) => {
  const report = { results, error: error.stack, nativeCalls: 0, appliedWrites: 0 };
  document.getElementById('result').textContent = JSON.stringify(report, null, 2);
  await fetch('/_test/result', { method: 'POST', body: JSON.stringify(report) });
});
