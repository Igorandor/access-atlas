// Run against the production-built static example via scripts/preview-example.mjs --audit.
const checks = [];
let connectionAttempts = 0;
window.fetch = () => {
  connectionAttempts++;
  throw Error('Example must not request a backend.');
};
const check = (name, pass) => {
  checks.push({ name, pass: Boolean(pass) });
  if (!pass) throw Error(name);
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 30));
const button = (name) =>
  [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === name);
async function click(node) {
  if (!node) throw Error('Control missing');
  node.click();
  await pause();
}
const grants = () => document.querySelector('.grant-list details');
const bits = () => grants()?.querySelector('.permission-bits')?.textContent;
async function run() {
  for (let wait = 0; !grants() && wait < 100; wait++) await pause();
  check(
    'Synthetic label is visible and connected-account action is absent',
    document.querySelector('.example-label')?.textContent.includes('No IRIS connection') &&
      !button('Inspect account'),
  );
  check('Original map grants RW', bits() === 'RW');
  await click(grants().querySelector('summary'));
  check(
    'Expanded map shows both independent paths',
    grants().open &&
      grants().textContent.includes(
        'alex.training → SupportTeam → OrdersWriter → TrainingOrders',
      ) &&
      grants().textContent.includes(
        'alex.training → ReportingReader → OrdersReader → TrainingOrders',
      ),
  );
  const support = [...document.querySelectorAll('.role-switches label')]
    .find((node) => node.textContent.trim() === 'SupportTeam')
    .querySelector('input');
  await click(support);
  check(
    'Removing support drops W, retains R through ReportingReader and reports one changed resource',
    bits() === 'R' &&
      grants().textContent.includes('ReportingReader → OrdersReader') &&
      !grants().textContent.includes('OrdersWriter') &&
      document
        .querySelector('.simulation-note')
        ?.textContent.includes('1 resource grant set changes'),
  );
  await click(button('Resource matrix'));
  let cell = document.querySelector('[aria-label="Explain alex.training on TrainingOrders"]');
  check(
    'Matrix keeps original RW despite an active map preview',
    cell?.textContent === 'RW' &&
      document.querySelector('.example-guide')?.textContent.includes('original training capture'),
  );
  await click(cell);
  check(
    'Matrix explains both original paths in a real modal',
    document.querySelector('dialog')?.open &&
      document.querySelector('dialog').textContent.includes('SupportTeam → OrdersWriter') &&
      document.querySelector('dialog').textContent.includes('ReportingReader → OrdersReader'),
  );
  await click(document.querySelector('dialog button[aria-label="Close dialog"]'));
  const publicCells = [...document.querySelectorAll('.public-row td')];
  check(
    'Public R and explicit account dash remain separate for TrainingStatus',
    publicCells.at(-1)?.textContent === 'R' &&
      document.querySelector('[aria-label="Explain alex.training on TrainingStatus"]')
        ?.textContent === '—',
  );
  await click(document.querySelector('[aria-label="Explain alex.training on TrainingStatus"]'));
  check(
    'Public-resource explanation labels the public permission and runtime limits',
    document.querySelector('dialog')?.textContent.includes('Public: R') &&
      document
        .querySelector('dialog')
        ?.textContent.includes('outside this configuration projection'),
  );
  await click(document.querySelector('dialog button[aria-label="Close dialog"]'));
  await click(button('Access map'));
  await click(
    [...document.querySelectorAll('.role-switches label')]
      .find((node) => node.textContent.trim() === 'SupportTeam')
      .querySelector('input'),
  );
  await click(button('Reset preview'));
  check(
    'Reset restores original RW and clears preview notice',
    bits() === 'RW' && !document.querySelector('.simulation-note'),
  );
  check('Flow made no backend request', connectionAttempts === 0);
}
run()
  .catch((error) => checks.push({ name: error.message, pass: false }))
  .finally(() => {
    window.exampleTestResults = { checks, connectionAttempts };
    const result = document.createElement('pre');
    result.id = 'example-test-results';
    result.textContent = JSON.stringify(window.exampleTestResults, null, 2);
    document.body.prepend(result);
  });
