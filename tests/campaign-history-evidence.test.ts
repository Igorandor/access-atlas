import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateCampaign } from '../shared/campaign';
import {
  buildCampaignReport,
  campaignActivityEvidence,
  campaignReportHtml,
  campaignReportMarkdown,
} from '../shared/campaign-report';

const at = '2026-09-28T12:00:00.000Z';
const captureId = '11111111-1111-4111-8111-111111111111';
function campaign() {
  const first = {
    kind: 'accounts',
    name: 'alice',
    captureId,
    outcome: 'investigate',
    note: 'Original historical reason',
    dueDate: '2026-10-02',
    reviewedAt: at,
  };
  const second = {
    ...first,
    outcome: 'retain',
    note: 'Replacement current reason',
    dueDate: '2026-12-01',
    reviewedAt: '2026-09-28T12:05:00.000Z',
  };
  return validateCampaign({
    version: 1,
    id: '22222222-2222-4222-8222-222222222222',
    instance: 'synthetic-only',
    owner: 'Fixture',
    title: 'Certification evidence review',
    description: '',
    state: 'active',
    revision: 4,
    createdAt: at,
    updatedAt: second.reviewedAt,
    rules: [],
    policies: [],
    decisions: [],
    remediations: [],
    certificationScope: { enabled: true, kinds: ['accounts'], prefix: '', includeDisabled: false },
    certifications: [second],
    captures: [
      {
        id: captureId,
        label: 'Monday access',
        snapshot: {
          version: 1,
          instance: 'synthetic-only',
          startedAt: at,
          capturedAt: at,
          warnings: [],
          users: [{ Name: 'alice', Enabled: true, Roles: [], EscalationRoles: [] }],
          roles: [],
          resources: [],
          apps: [],
        },
      },
    ],
    history: [
      { revision: 1, at, actor: 'Fixture', action: 'created', detail: 'Campaign created' },
      {
        revision: 2,
        at,
        actor: 'Fixture',
        action: 'certify',
        detail: 'accounts:alice: investigate',
        certification: first,
      },
      {
        revision: 3,
        at: second.reviewedAt,
        actor: 'Fixture',
        action: 'certify',
        detail: 'accounts:alice: retain',
        certification: second,
      },
      {
        revision: 4,
        at: second.reviewedAt,
        actor: 'Fixture',
        action: 'decision',
        detail: 'Finding investigated',
        decision: {
          findingId: 'finding-1',
          fingerprint: 'INTERNAL-FINGERPRINT',
          captureId,
          outcome: 'investigating',
          note: 'Historical finding reason',
          reviewedAt: at,
        },
      },
    ],
  });
}

test('selected report activity preserves each historical decision independently of current certification', () => {
  const saved = campaign(),
    before = JSON.stringify(saved);
  const report = buildCampaignReport(
    saved,
    { authorNote: '', include: ['activity', 'certifications'] },
    new Date(at),
  );
  assert.equal(report.activity?.[1].certification?.note, 'Original historical reason');
  assert.equal(report.activity?.[2].certification?.note, 'Replacement current reason');
  assert.equal(report.activity?.[1].certification?.dueDate, '2026-10-02');
  assert.equal(report.activity?.[2].certification?.dueDate, '2026-12-01');
  assert.equal(report.activity?.[1].certification?.captureId, captureId);
  assert.equal(report.certifications?.[0].decision?.outcome, 'retain');
  assert.equal(report.certifications?.[0].decision?.note, 'Replacement current reason');
  assert.equal(report.activity?.[3].decision?.note, 'Historical finding reason');
  assert.ok(!JSON.stringify(report.activity).includes('INTERNAL-FINGERPRINT'));
  assert.equal(JSON.stringify(saved), before);
  const htmlActivity = campaignReportHtml(report)
    .split('<h2>Activity</h2>')[1]
    .split('<h2>Scope and limitations</h2>')[0];
  assert.equal(
    (htmlActivity.match(/<section class="activity-event">/g) || []).length,
    saved.history.length,
  );
  assert.ok(htmlActivity.includes('<dt>Reason</dt><dd>Original historical reason</dd>'));
  assert.ok(!htmlActivity.includes('<table>'));
  for (const text of [
    campaignReportHtml(report),
    campaignReportMarkdown(report),
    JSON.stringify(report),
  ]) {
    assert.match(text, /Original historical reason/);
    assert.match(text, /Replacement current reason/);
    assert.match(text, /Historical finding reason/);
    assert.match(text, /2026-10-02/);
    assert.ok(text.includes(captureId));
  }
});

test('activity is opt-in independently of current finding and certification sections', () => {
  const saved = campaign();
  const history = buildCampaignReport(saved, { authorNote: '', include: ['activity'] });
  assert.equal(history.findings, undefined);
  assert.equal(history.certifications, undefined);
  assert.equal(history.activity?.length, saved.history.length);
  const currentOnly = buildCampaignReport(saved, { authorNote: '', include: ['certifications'] });
  assert.equal(currentOnly.activity, undefined);
  for (const text of [
    campaignReportHtml(currentOnly),
    campaignReportMarkdown(currentOnly),
    JSON.stringify(currentOnly),
  ]) {
    assert.ok(!text.includes('Original historical reason'));
    assert.ok(!text.includes('Historical finding reason'));
  }
});

test('historical user text remains inert in HTML and literal in Markdown', () => {
  const saved = campaign();
  saved.history[1].certification!.note =
    '<img src=x onerror=alert(1)>\n[owner](https://invalid.example) **approve**';
  const report = buildCampaignReport(saved, { authorNote: '', include: ['activity'] });
  const html = campaignReportHtml(report),
    markdown = campaignReportMarkdown(report);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img'));
  assert.ok(markdown.includes('\\<img src=x onerror=alert\\(1\\)\\>'));
  assert.ok(markdown.includes('\\[owner\\]\\(https://invalid\\.example\\) \\*\\*approve\\*\\*'));
  assert.equal(report.activity?.[1].certification?.note, saved.history[1].certification!.note);
});

test('legacy activity without a saved decision does not invent review evidence', () => {
  const saved = campaign();
  delete saved.history[1].certification;
  const report = buildCampaignReport(saved, { authorNote: '', include: ['activity'] });
  assert.equal(campaignActivityEvidence(report.activity![0]), undefined);
  assert.equal(campaignActivityEvidence(report.activity![1]), undefined);
  assert.ok(!campaignReportHtml(report).includes('Original historical reason'));
  const finding = campaignActivityEvidence(report.activity![3]);
  assert.equal(finding?.title, 'Saved finding decision');
  assert.deepEqual(
    finding?.facts.find(([name]) => name === 'Follow-up date'),
    ['Follow-up date', 'No follow-up date'],
  );
});

test('report activity remains one entry per bounded saved revision without borrowing later decisions', () => {
  const saved = campaign();
  const initial = saved.history[0];
  saved.history = Array.from({ length: 1000 }, (_, index) => ({ ...initial, revision: index + 1 }));
  saved.revision = 1000;
  const report = buildCampaignReport(validateCampaign(saved), {
    authorNote: '',
    include: ['activity'],
  });
  assert.equal(report.activity?.length, 1000);
  assert.equal(report.activity?.at(-1)?.revision, 1000);
  assert.ok(report.activity?.every((event) => !event.certification && !event.decision));
  assert.ok(
    !campaignReportHtml(report)
      .split('<h2>Activity</h2>')[1]
      .includes('Replacement current reason'),
  );
});

test('shared actual history component renders saved facts safely and omits absent evidence', () => {
  const built = buildSync({
    entryPoints: [
      fileURLToPath(new URL('../src/features/campaigns/SavedReviewEvidence.tsx', import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    loader: { '.css': 'empty' },
  });
  const module = { exports: {} as any };
  runInNewContext(built.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: createRequire(import.meta.url),
  });
  const saved = campaign();
  saved.history[1].certification!.note = '<script>example</script>\nHistorical reason';
  const html = renderToStaticMarkup(
    createElement(module.exports.SavedReviewEvidence, { event: saved.history[1] }),
  );
  assert.match(html, /Saved certification decision/);
  assert.match(html, /accounts: alice/);
  assert.match(html, /2026-10-02/);
  assert.ok(html.includes(captureId));
  assert.ok(html.includes('&lt;script&gt;example&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /Saved at this revision/);
  assert.equal(
    renderToStaticMarkup(
      createElement(module.exports.SavedReviewEvidence, { event: saved.history[0] }),
    ),
    '',
  );
  const finding = renderToStaticMarkup(
    createElement(module.exports.SavedReviewEvidence, { event: saved.history[3] }),
  );
  assert.match(finding, /Saved finding decision/);
  assert.match(finding, /Historical finding reason/);
  assert.match(finding, /No follow-up date/);
});
