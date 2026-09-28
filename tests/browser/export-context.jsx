import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CertificationReview } from '../../src/features/campaigns/CertificationReview';
import { CampaignReport } from '../../src/features/campaigns/CampaignReport';
import { revisionCampaign, advanceRevision } from './certification-revision-data';
import { validateCampaign } from '../../shared/campaign';
import '../../src/styles.css';
import '../../src/features/access/review.css';
import '../../src/layout/AtlasShell.css';
import '../../src/features/campaigns/campaigns.css';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reportFetch = window.fetch.bind(window);
window.fetch = async () => {
  throw Error('No API calls allowed in export fixture');
};
const root = createRoot(document.getElementById('probe'));
const downloads = [],
  results = [],
  blobs = new Map();
let showDownload = () => {};
URL.createObjectURL = (blob) => {
  const url = 'blob:synthetic-' + blobs.size;
  blobs.set(url, blob);
  return url;
};
URL.revokeObjectURL = () => {};
HTMLAnchorElement.prototype.click = function () {
  const record = { filename: this.download, text: '' };
  downloads.push(record);
  record.ready = blobs
    .get(this.href)
    .text()
    .then((text) => {
      record.text = text;
      showDownload({ filename: record.filename, text });
    });
};
const warning = 'Application inventory could not be read (403).';
const humanDate = '2026-09-20T12:05:00.000Z';
const campaign = revisionCampaign();
campaign.captures[0].snapshot.users = campaign.captures[0].snapshot.users.slice(0, 1);
campaign.captures[0].snapshot.warnings = [warning];
campaign.captures[0].snapshot.startedAt = '2026-09-28T11:59:00.000Z';
campaign.certifications = [
  {
    kind: 'accounts',
    name: 'Account01',
    captureId: campaign.captures[0].id,
    outcome: 'retain',
    note: 'Confirmed job access.',
    reviewedAt: '2026-09-28T12:05:00.000Z',
  },
];
validateCampaign(campaign);
let carried = revisionCampaign();
carried.captures[0].snapshot.users = carried.captures[0].snapshot.users.slice(0, 1);
carried.createdAt = '2026-09-20T12:00:00.000Z';
carried.history[0].at = carried.createdAt;
carried.captures[0].snapshot.startedAt = carried.createdAt;
carried.captures[0].snapshot.capturedAt = carried.createdAt;
carried = advanceRevision(carried, 'capture', (next) => {
  const capture = structuredClone(next.captures[0]);
  capture.id = '33333333-3333-4333-8333-333333333333';
  capture.label = 'Current [access](https://invalid.example)';
  capture.snapshot.startedAt = '2026-09-28T11:59:00.000Z';
  capture.snapshot.capturedAt = '2026-09-28T12:00:00.000Z';
  next.captures.push(capture);
  next.certifications = [
    {
      kind: 'accounts',
      name: 'Account01',
      captureId: capture.id,
      outcome: 'retain',
      note: 'Confirmed job access.',
      reviewedAt: humanDate,
      dueDate: '2026-10-04',
    },
  ];
});
function Harness() {
  const [download, setDownload] = useState(null);
  showDownload = setDownload;
  return (
    <main style={{ padding: '1rem', minWidth: 0 }}>
      <p>Synthetic fixtures only. Export buttons capture real generated files below.</p>
      <h2>Incomplete capture: standalone certification export</h2>
      <CertificationReview
        campaign={campaign}
        scope={campaign.certificationScope}
        decisions={campaign.certifications}
        disabled={false}
        save={async () => {
          throw Error('No writes allowed');
        }}
      />
      <h2>Carried decision: campaign report</h2>
      <CampaignReport campaign={carried} />
      {download && (
        <section id="download-output">
          <h2>Captured download: {download.filename}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%' }}>
            {download.text}
          </pre>
        </section>
      )}
    </main>
  );
}
function button(text) {
  return [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === text);
}
function check(name, pass) {
  results.push({ name, pass: !!pass });
  if (!pass) throw Error(name);
}
async function click(text) {
  await act(async () => button(text).click());
}
async function latestDownload() {
  const value = downloads.at(-1);
  await act(async () => value.ready);
  return value;
}
async function toggleSection(title) {
  const label = [...document.querySelectorAll('.report-section-option')].find(
    (node) => node.querySelector('strong')?.textContent === title,
  );
  await act(async () => label.querySelector('input').click());
}
async function suite() {
  await act(async () => root.render(<Harness />));
  if (location.search === '?manual') {
    document.getElementById('result').textContent = 'Manual synthetic export fixture ready.';
    return;
  }
  await click('Export certification report');
  let file = await latestDownload(),
    exported = JSON.parse(file.text);
  check(
    'Actual standalone JSON preserves existing identity, scope and coverage fields',
    file.filename === 'atlas-certification-report.json' &&
      exported.instance === campaign.instance &&
      exported.campaign === campaign.title &&
      exported.captureId === campaign.captures[0].id &&
      exported.capturedAt === campaign.captures[0].snapshot.capturedAt &&
      exported.coverage.total === 1,
  );
  check(
    'Standalone JSON identifies exact saved campaign revision and export time',
    exported.campaignId === campaign.id &&
      exported.campaignRevision === campaign.revision &&
      Number.isFinite(Date.parse(exported.generatedAt)),
  );
  check(
    'Standalone JSON distinguishes capture start, completion and label',
    exported.captureStartedAt === campaign.captures[0].snapshot.startedAt &&
      exported.captureLabel === campaign.captures[0].label &&
      exported.captureStartedAt !== exported.capturedAt,
  );
  check(
    'Incomplete capture retains exact source warning and incomplete coverage',
    exported.warnings.includes(warning) &&
      exported.coverage.complete === false &&
      exported.coverage.unknown > 0,
  );
  check(
    'Export explains relevant evidence, carry and follow-up limits without a full snapshot',
    exported.limits.length === 4 &&
      exported.limits.some((text) => text.includes('original human review date')) &&
      exported.limits.some((text) => text.includes('do not expire')) &&
      !Object.hasOwn(exported, 'snapshot'),
  );
  const prefix = document.querySelector('input[placeholder="Blank includes all names"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      prefix,
      'UNSAVED-NO-MATCH',
    );
    prefix.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Export certification report');
  exported = JSON.parse((await latestDownload()).text);
  check(
    'Unsaved scope draft does not change exported saved scope or coverage',
    prefix.value === 'UNSAVED-NO-MATCH' &&
      exported.scope.prefix === '' &&
      exported.coverage.total === 1,
  );
  await click('Export report');
  await toggleSection('Campaign activity');
  await click('Download Markdown');
  file = await latestDownload();
  check(
    'Actual Markdown download preserves original human review date with activity excluded',
    file.filename === 'atlas-campaign-report.md' &&
      file.text.includes('Human review date: ' + humanDate) &&
      !file.text.includes('## Activity'),
  );
  check(
    'Markdown identifies decision capture, campaign and follow-up separately',
    file.text.includes(carried.id) &&
      file.text.includes('Decision capture ID: ' + carried.captures[1].id) &&
      file.text.includes('Follow-up: 2026-10-04'),
  );
  check(
    'Markdown capture labels are escaped and safe text preview does not render links',
    file.text.includes('Current \\[access\\]\\(https://invalid\\.example\\)') &&
      !document.querySelector('#download-output a'),
  );
  await toggleSection('Object certification');
  await click('Download Markdown');
  check(
    'Excluded certification section does not leak its human review date',
    !(await latestDownload()).text.includes('Human review date: ' + humanDate),
  );
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
