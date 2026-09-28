import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import * as campaignModel from '../shared/campaign';
import * as reports from '../shared/campaign-report';
import type { Campaign } from '../shared/campaign';

const observedAt = '2026-09-27T10:00:00Z';
function fixture(): Campaign {
  return {
    version: 1,
    id: 'campaign',
    instance: 'Fixture',
    owner: 'Reviewer',
    title: 'Scheduled follow-ups',
    description: '',
    state: 'active',
    revision: 1,
    createdAt: observedAt,
    updatedAt: observedAt,
    rules: [],
    policies: [],
    decisions: [],
    remediations: [],
    certifications: [],
    history: [],
    certificationScope: { enabled: true, kinds: ['accounts'], prefix: '', includeDisabled: false },
    captures: [
      {
        id: 'capture',
        label: 'Initial',
        snapshot: {
          version: 1,
          instance: 'Fixture',
          startedAt: observedAt,
          capturedAt: observedAt,
          warnings: [],
          users: [{ Name: 'alice', Enabled: true, Roles: ['%All'], EscalationRoles: [] }],
          roles: [
            {
              Name: '%All',
              Description: '',
              GrantedRoles: [],
              Resources: [],
              EscalationOnly: false,
            },
          ],
          resources: [],
          apps: [],
        },
      },
    ],
  };
}

// Render the real detail component while leaving its nested editors unevaluated.
// Both the header and exported report use real domain models, not mocked counts.
function summaryCount(campaign: Campaign) {
  const jsx = (type: any, props: any) => ({ type, props });
  const modules: Record<string, any> = {
    react: {
      useState: (value: any) => [typeof value === 'function' ? value() : value, () => {}],
      useRef: (value: any) => ({ current: value }),
      useMemo: (calculate: () => unknown) => calculate(),
      useEffect() {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '../../../shared/campaign': campaignModel,
    '../../../shared/campaign-report': reports,
  };
  const source =
    readFileSync(new URL('../src/features/campaigns/Campaigns.tsx', import.meta.url), 'utf8') +
    '\nexport { CampaignDetail };';
  const module = { exports: {} as any };
  runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code, {
    module,
    require: (id: string) => modules[id] || {},
  });
  const walk = (node: any): any[] =>
    Array.isArray(node)
      ? node.flatMap(walk)
      : node && typeof node === 'object'
        ? [node, ...walk(node.props?.children)]
        : [];
  const text = (node: any): string =>
    Array.isArray(node)
      ? node.map(text).join('')
      : node && typeof node === 'object'
        ? text(node.props?.children)
        : node == null || typeof node === 'boolean'
          ? ''
          : String(node);
  const tree = module.exports.CampaignDetail({ campaign, pending: false });
  const metric = walk(tree).find(
    (node) => node.type === 'span' && text(node).includes('overdue follow-ups'),
  );
  assert.ok(metric, 'campaign header exposes its overdue follow-ups count');
  return Number(text(metric).match(/^\d+/)?.[0]);
}

function reportCount(campaign: Campaign) {
  return reports.buildCampaignReport(campaign, { authorNote: '', include: [] }).counts
    .overdueFollowups;
}

test('campaign header includes overdue certification decisions without revoking their outcome', () => {
  const campaign = fixture();
  campaign.certifications.push({
    kind: 'accounts',
    name: 'alice',
    captureId: 'capture',
    outcome: 'exception',
    note: 'Follow up later',
    reviewedAt: observedAt,
    dueDate: '2000-01-01',
  });
  assert.equal(campaignModel.campaignProgress(campaign).overdue, 0);
  assert.equal(reportCount(campaign), 1);
  assert.equal(summaryCount(campaign), 1);
  assert.equal(campaign.certifications[0].outcome, 'exception');
});

test('campaign header includes an unreviewed subject whose certification deadline passed', () => {
  const campaign = fixture();
  campaign.certificationScope.dueDate = '2000-01-01';
  assert.equal(reportCount(campaign), 1);
  assert.equal(summaryCount(campaign), reportCount(campaign));
  campaign.certificationScope.dueDate = '9999-12-31';
  assert.equal(summaryCount(campaign), 0);
});

test('scheduled accepted findings count as follow-ups without becoming pending finding decisions', () => {
  const campaign = fixture();
  campaign.certificationScope.enabled = false;
  const finding = campaignModel.campaignFindings(campaign)[0];
  assert.ok(finding, 'fixture has an actual privileged-account finding');
  campaign.decisions.push({
    captureId: 'capture',
    findingId: finding.id,
    fingerprint: finding.fingerprint,
    outcome: 'accepted',
    note: 'Accepted with scheduled follow-up',
    reviewedAt: observedAt,
    dueDate: '2000-01-01',
  });
  assert.equal(campaignModel.campaignProgress(campaign).overdue, 0);
  assert.equal(reportCount(campaign), 1);
  assert.equal(summaryCount(campaign), reportCount(campaign));
  campaign.decisions[0].dueDate = undefined;
  assert.equal(summaryCount(campaign), 0);
});

function clockHarness() {
  let now = '2026-09-28T23:59:59Z';
  class Clock extends Date {
    constructor(value?: string | number) {
      super(value ?? now);
    }
  }
  type Hooks = { slots: any[]; cursor: number; effects: Array<() => void> };
  const parent: Hooks = { slots: [], cursor: 0, effects: [] };
  const child: Hooks = { slots: [], cursor: 0, effects: [] };
  const agenda: Hooks = { slots: [], cursor: 0, effects: [] };
  let active = parent;
  const hooks = {
    useState(initial: any) {
      const state = active,
        index = state.cursor++;
      if (!(index in state.slots)) {
        state.slots[index] = {
          value: typeof initial === 'function' ? initial() : initial,
          set(value: any) {
            state.slots[index].value =
              typeof value === 'function' ? value(state.slots[index].value) : value;
          },
        };
      }
      return [state.slots[index].value, state.slots[index].set];
    },
    useRef(value: any) {
      return (active.slots[active.cursor++] ??= { current: value });
    },
    useMemo(calculate: () => any, dependencies: any[]) {
      const index = active.cursor++,
        previous = active.slots[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i]))
        active.slots[index] = { dependencies, value: calculate() };
      return active.slots[index].value;
    },
    useEffect(effect: () => void, dependencies: any[]) {
      const index = active.cursor++,
        previous = active.slots[index];
      if (!previous || dependencies.some((value, i) => value !== previous[i])) {
        active.slots[index] = dependencies;
        active.effects.push(effect);
      }
    },
  };
  const jsx = (type: any, props: any) => ({ type, props });
  const exports: any[] = [];
  const textExports: Array<{ name: string; text: string }> = [];
  let exportFailure = false;
  const modules: Record<string, any> = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '../../../shared/campaign': campaignModel,
    '../../../shared/campaign-report': {
      ...reports,
      campaignAgenda: (campaign: Campaign, date = new Clock()) =>
        reports.campaignAgenda(campaign, date),
    },
    '../../api': {
      download(_name: string, data: any) {
        exports.push(data);
      },
    },
    '../access/AccessInquiry': {
      saveText(name: string, text: string) {
        if (exportFailure) throw new Error('Synthetic export unavailable.');
        textExports.push({ name, text });
      },
    },
  };
  function load(file: string, extra = '') {
    const module = { exports: {} as any };
    const source =
      readFileSync(new URL('../src/features/campaigns/' + file, import.meta.url), 'utf8') + extra;
    runInNewContext(
      transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code,
      {
        module,
        Date: Clock,
        require: (id: string) => modules[id] || {},
      },
    );
    return module.exports;
  }
  modules['./CampaignReport'] = load('CampaignReport.tsx');
  const detail = load('Campaigns.tsx', '\nexport { CampaignDetail };').CampaignDetail;
  let campaign = fixture();
  campaign.certificationScope.dueDate = '2026-09-28';
  const walk = (node: any): any[] =>
    Array.isArray(node)
      ? node.flatMap(walk)
      : node && typeof node === 'object'
        ? [node, ...walk(node.props?.children)]
        : [];
  const text = (node: any): string =>
    Array.isArray(node)
      ? node.map(text).join('')
      : node && typeof node === 'object'
        ? text(node.props?.children)
        : node == null || typeof node === 'boolean'
          ? ''
          : String(node);
  let parentNodes: any[] = [],
    reportNodes: any[] = [];
  function render() {
    for (let i = 0; i < 3; i++) {
      active = parent;
      parent.cursor = 0;
      parentNodes = walk(detail({ campaign, pending: false }));
      const report = parentNodes.find(
        (node) => node.type === modules['./CampaignReport'].CampaignReport,
      );
      if (report) {
        active = child;
        child.cursor = 0;
        reportNodes = walk(report.type(report.props));
        const agendaNode = reportNodes.find((node) => node.type?.name === 'Agenda');
        if (agendaNode) {
          active = agenda;
          agenda.cursor = 0;
          const agendaNodes = walk(agendaNode.type(agendaNode.props));
          const pagination = agendaNodes.find((node) => node.type?.name === 'Pagination');
          reportNodes.push(...agendaNodes, ...walk(pagination.type(pagination.props)));
        }
      }
      for (const state of [parent, child, agenda])
        while (state.effects.length) state.effects.shift()!();
    }
  }
  function click(label: string, nodes = reportNodes) {
    const button = nodes.find((node) => node.type === 'button' && text(node) === label);
    assert.ok(button, label);
    button.props.onClick();
    render();
  }
  render();
  return {
    openReport() {
      click('Report & follow-ups', parentNodes);
    },
    nextDay() {
      now = '2026-09-29T00:00:01Z';
      render();
    },
    refresh() {
      click('Refresh dates');
    },
    exportJson() {
      click('Export report');
      click('Download report JSON');
    },
    openAgenda() {
      click('Follow-ups');
    },
    exportCsv() {
      click('Export filtered agenda CSV');
    },
    filter(source: string, search = '', onlyOverdue = false) {
      reportNodes
        .find((node) => node.type === 'select')
        .props.onChange({ target: { value: source } });
      reportNodes
        .find((node) => node.type === 'input' && node.props.type === 'search')
        .props.onChange({ target: { value: search } });
      reportNodes
        .find((node) => node.type === 'input' && node.props.type === 'checkbox')
        .props.onChange({ target: { checked: onlyOverdue } });
      render();
    },
    revise(update: (value: Campaign) => void) {
      campaign = structuredClone(campaign);
      campaign.revision++;
      update(campaign);
      render();
    },
    nextPage() {
      click('Next follow-ups');
    },
    page() {
      return reportNodes.find((node) => node.type?.name === 'Pagination').props.page;
    },
    filters() {
      return {
        source: reportNodes.find((node) => node.type === 'select').props.value,
        search: reportNodes.find((node) => node.type === 'input' && node.props.type === 'search')
          .props.value,
        overdue: reportNodes.find((node) => node.type === 'input' && node.props.type === 'checkbox')
          .props.checked,
      };
    },
    failExport(value: boolean) {
      exportFailure = value;
    },
    error() {
      return reportNodes.find((node) => typeof node.props?.error === 'string')?.props.error;
    },
    counts() {
      const metric = parentNodes.find(
        (node) => node.type === 'span' && text(node).includes('overdue follow-ups'),
      );
      return {
        header: Number(text(metric).match(/^\d+/)?.[0]),
        report: Number(
          reportNodes.find((node) => node.props?.label === 'overdue follow-ups')?.props.value,
        ),
      };
    },
    exports,
    textExports,
  };
}

test('refreshing report dates after UTC midnight updates the parent header from the same timestamp', () => {
  const app = clockHarness();
  app.openReport();
  assert.deepEqual(app.counts(), { header: 0, report: 0 });
  app.nextDay();
  assert.deepEqual(app.counts(), { header: 0, report: 0 });
  app.refresh();
  assert.deepEqual(app.counts(), { header: 1, report: 1 });
});

test('opening the report after UTC midnight brings its parent summary to the same date', () => {
  const app = clockHarness();
  app.nextDay();
  app.openReport();
  assert.deepEqual(app.counts(), { header: 1, report: 1 });
});

test('exporting a fresh report updates the displayed report and header to its timestamp', () => {
  const app = clockHarness();
  app.openReport();
  app.nextDay();
  app.exportJson();
  assert.equal(app.exports.length, 1);
  assert.equal(app.exports[0].counts.overdueFollowups, 1);
  assert.deepEqual(app.counts(), { header: 1, report: 1 });
});

test('agenda CSV evaluates overdue rows at click time and synchronizes the parent summary', () => {
  const app = clockHarness();
  app.openReport();
  app.openAgenda();
  app.filter('certification', 'alice', true);
  app.exportCsv();
  assert.equal(app.textExports[0].text.split('\r\n').length, 1, 'No overdue row before midnight');
  app.nextDay();
  app.exportCsv();
  assert.match(app.textExports[1].text, /"certification","alice"/);
  assert.match(app.textExports[1].text, /"2026-09-28","true"/);
  assert.deepEqual(app.counts(), { header: 1, report: 1 });
  assert.deepEqual(app.filters(), { source: 'certification', search: 'alice', overdue: true });
});

test('agenda CSV uses the latest saved certification, current filters and escaped note', () => {
  const app = clockHarness();
  app.openReport();
  app.openAgenda();
  app.nextDay();
  const note = '=SUM(1,2)\n"Owner"';
  app.revise((campaign) => {
    campaign.certifications = [
      {
        kind: 'accounts',
        name: 'alice',
        captureId: 'capture',
        outcome: 'exception',
        note,
        reviewedAt: '2026-09-29T00:00:00Z',
        dueDate: '2026-09-28',
      },
    ];
  });
  app.filter('certification', 'owner', true);
  app.exportCsv();
  const csv = app.textExports[0].text;
  assert.match(csv, /"certification","alice","Certify accounts","exception"/);
  assert.match(csv, /"2026-09-28","true"/);
  assert.ok(
    csv.includes('"\'=SUM(1,2)\n""Owner"""'),
    'Spreadsheet-neutralized quoted multiline note',
  );
  assert.ok(!csv.includes('"finding"'), 'Source filter excludes unrelated finding rows');
  assert.deepEqual(app.filters(), { source: 'certification', search: 'owner', overdue: true });
});

test('agenda CSV exports all matching rows while preserving the selected page', () => {
  const app = clockHarness();
  app.revise((campaign) => {
    campaign.captures[0].snapshot.users = Array.from({ length: 23 }, (_, i) => ({
      Name: 'Account' + String(i + 1).padStart(2, '0'),
      Enabled: true,
      Roles: [],
      EscalationRoles: [],
    }));
  });
  app.openReport();
  app.openAgenda();
  app.filter('certification', 'account');
  app.nextPage();
  assert.equal(app.page(), 1);
  app.nextDay();
  app.exportCsv();
  assert.equal(app.textExports[0].text.split('\r\n').length, 24);
  assert.equal(app.page(), 1);
  assert.deepEqual(app.filters(), { source: 'certification', search: 'account', overdue: false });
});

test('agenda export failure is visible and a successful explicit retry clears it', () => {
  const app = clockHarness();
  app.openReport();
  app.openAgenda();
  app.failExport(true);
  assert.doesNotThrow(() => app.exportCsv());
  assert.equal(app.error(), 'Synthetic export unavailable.');
  assert.equal(app.textExports.length, 0);
  app.failExport(false);
  app.exportCsv();
  assert.equal(app.error(), undefined);
  assert.equal(app.textExports.length, 1);
});
