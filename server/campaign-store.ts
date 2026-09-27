import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, lstat, readdir, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { ApiError } from './atlas-errors.js';
import { defaultCertificationScope } from '../shared/certification.js';
import { nextPeriodSettings, type NextPeriod } from '../shared/campaign-period.js';
import { canonical } from '../shared/access-model.js';
import { remediationStorageBounds } from '../shared/remediation.js';
import {
  campaignBounds,
  campaignSummary,
  validateCampaign,
  type Campaign,
} from '../shared/campaign.js';

export type CampaignScope = { instance: string; owner: string };

const unresolvedRemediation = new Set([
  'uncertain',
  'unverified',
  'different',
  'acknowledged',
  'failed',
]);
// A JSON-escaped control character costs six bytes per permitted UTF-16 unit.
const reservedMessage = '\0'.repeat(remediationStorageBounds.message);
const reservedFields = Array(remediationStorageBounds.checkedFields).fill(
  '\0'.repeat(remediationStorageBounds.checkedFieldLength),
);
const reservedReconciliation = '\0'.repeat(remediationStorageBounds.reconciliation);
const reservedTimestamp = new Date(8.64e15).toISOString();
const encodedBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

/** Keep bounded finalization/recovery room inside the existing document caps. */
function requireRemediationCapacity(campaign: Campaign) {
  const pending = campaign.remediations.flatMap((record) => {
    if (record.status === 'dispatching') return [{ record, events: 2 }];
    if (unresolvedRemediation.has(record.status) && !record.reconciliation)
      return [{ record, events: 1 }];
    return [];
  });
  if (!pending.length) return;
  const events = pending.reduce((sum, item) => sum + item.events, 0);
  if (campaign.history.length + events > campaignBounds.history)
    throw new ApiError(
      409,
      'This campaign has no history capacity for the remediation result and one reconciliation. Export it and start another campaign.',
    );
  let bytes = encodedBytes(campaign);
  let revision = campaign.revision;
  for (const { record, events: count } of pending) {
    bytes += Math.max(
      0,
      encodedBytes({
        ...record,
        status: 'acknowledged',
        updatedAt: reservedTimestamp,
        message: reservedMessage,
        checkedFields: reservedFields,
        reconciliation: reservedReconciliation,
      }) - encodedBytes(record),
    );
    for (let event = 0; event < count; event++) {
      revision++;
      bytes +=
        1 +
        encodedBytes({
          revision,
          at: reservedTimestamp,
          actor: campaign.owner,
          // Longest of the finalization/reconciliation action names; UUID detail
          // also bounds the shorter result status recorded by finalization.
          action: 'remediation-reconciled',
          detail: record.id,
        });
    }
  }
  bytes += String(revision).length - String(campaign.revision).length;
  bytes += Math.max(0, encodedBytes(reservedTimestamp) - encodedBytes(campaign.updatedAt));
  if (bytes > campaignBounds.fileBytes)
    throw new ApiError(
      413,
      'This campaign has no storage capacity for the remediation result and one reconciliation. Export it and start another campaign.',
    );
}

/** Private single-process document repository. No filenames come from request bodies. */
export class CampaignStore {
  private readonly root: string;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    directory: string,
    private readonly now: () => number = Date.now,
  ) {
    this.root = resolve(directory);
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work, work);
    this.tail = result.catch(() => undefined);
    return result;
  }
  private partition(scope: CampaignScope) {
    return createHash('sha256')
      .update(JSON.stringify([scope.instance, scope.owner]))
      .digest('hex');
  }
  private async directory(scope: CampaignScope) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const rootStat = await lstat(this.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
      throw new ApiError(503, 'Campaign storage must be a real directory.');
    const directory = join(this.root, this.partition(scope));
    await mkdir(directory, { mode: 0o700 }).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new ApiError(503, 'Campaign storage is unavailable.');
    return directory;
  }
  private file(directory: string, id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      throw new ApiError(404, 'Campaign not found.');
    return join(directory, id + '.json');
  }
  private async load(scope: CampaignScope, id: string): Promise<Campaign> {
    const path = this.file(await this.directory(scope), id);
    let handle;
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > campaignBounds.fileBytes)
        throw new Error('Invalid stored document.');
      handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > campaignBounds.fileBytes)
        throw new Error('Invalid stored document.');
      const buffer = Buffer.alloc(opened.size + 1);
      const result = await handle.read(buffer, 0, buffer.length, 0);
      if (result.bytesRead !== opened.size) throw new Error('Stored document changed during read.');
      const campaign = validateCampaign(
        JSON.parse(buffer.subarray(0, result.bytesRead).toString('utf8')),
      );
      if (
        campaign.id !== id ||
        campaign.instance !== scope.instance ||
        campaign.owner !== scope.owner
      )
        throw new Error('Invalid campaign partition.');
      return campaign;
    } catch (error: any) {
      if (error.code === 'ENOENT') throw new ApiError(404, 'Campaign not found.');
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        'A saved campaign could not be read. Preserve the data directory and inspect its backup.',
      );
    } finally {
      await handle?.close();
    }
  }
  private async save(scope: CampaignScope, campaign: Campaign) {
    validateCampaign(campaign);
    const encoded = Buffer.from(JSON.stringify(campaign));
    if (encoded.byteLength > campaignBounds.fileBytes)
      throw new ApiError(
        413,
        'Campaign storage limit reached. Export this campaign and start another.',
      );
    const directory = await this.directory(scope);
    const destination = this.file(directory, campaign.id);
    const temporary = join(directory, '.' + randomUUID() + '.pending');
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(encoded);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  async list(scope: CampaignScope) {
    return this.exclusive(async () => {
      const names = (await readdir(await this.directory(scope))).filter((name) =>
        /^[0-9a-f-]{36}\.json$/i.test(name),
      );
      if (names.length > campaignBounds.campaigns)
        throw new ApiError(503, 'Campaign directory exceeds its supported limit.');
      const results = [];
      for (const name of names)
        results.push(campaignSummary(await this.load(scope, name.slice(0, -5))));
      return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }
  async read(scope: CampaignScope, id: string) {
    return this.exclusive(() => this.load(scope, id));
  }
  async create(
    scope: CampaignScope,
    title: string,
    description: string,
    source?: { id: string; input: NextPeriod },
  ) {
    return this.exclusive(async () => {
      const names = await readdir(await this.directory(scope));
      if (names.filter((name) => name.endsWith('.json')).length >= campaignBounds.campaigns)
        throw new ApiError(409, 'This owner has reached the 100 campaign limit.');
      const at = new Date(this.now()).toISOString();
      const previous = source ? await this.load(scope, source.id) : undefined;
      if (previous && previous.revision !== source!.input.revision)
        throw new ApiError(
          409,
          'The source campaign changed. Reload it before starting the next period.',
        );
      const settings = previous ? nextPeriodSettings(previous, source!.input) : undefined;
      const campaign: Campaign = {
        version: 1,
        id: randomUUID(),
        instance: scope.instance,
        owner: scope.owner,
        title,
        description,
        state: 'active',
        revision: 1,
        createdAt: at,
        updatedAt: at,
        captures: [],
        decisions: [],
        rules: [],
        policies: [],
        remediations: [],
        certificationScope: structuredClone(defaultCertificationScope),
        certifications: [],
        history: [{ revision: 1, at, actor: scope.owner, action: 'created', detail: title }],
      };
      if (settings) {
        Object.assign(campaign, settings);
        campaign.history[0].detail = `Started from campaign ${previous!.id}, revision ${previous!.revision}; settings copied, decisions and captures reset.`;
        campaign.history[0].action = 'next-period';
      }
      await this.save(scope, campaign);
      return campaign;
    });
  }
  async change(
    scope: CampaignScope,
    id: string,
    expectedRevision: number,
    action: string,
    detail: string,
    apply: (campaign: Campaign) => void,
    completionId?: string,
  ) {
    return this.exclusive(async () => {
      const campaign = await this.load(scope, id);
      if (campaign.revision !== expectedRevision)
        throw new ApiError(
          409,
          'This campaign changed in another tab. Reload it before saving your changes.',
        );
      if (campaign.history.length >= campaignBounds.history)
        throw new ApiError(
          409,
          'Campaign history limit reached. Export it and start a new campaign.',
        );
      const dispatching = campaign.remediations.filter((record) => record.status === 'dispatching');
      if (
        dispatching.length &&
        (!['remediation-result', 'remediation-not-sent', 'remediation-reconciled'].includes(
          action,
        ) ||
          dispatching.some((record) => record.id !== completionId))
      )
        throw new ApiError(
          409,
          'Reconcile the interrupted remediation before editing this campaign.',
        );
      const previousDecisions = new Map(
        campaign.decisions.map((decision) => [decision.findingId, canonical(decision)]),
      );
      const previousCertifications = new Map(
        campaign.certifications.map((decision) => [
          JSON.stringify([decision.kind, decision.name]),
          canonical(decision),
        ]),
      );
      apply(campaign);
      campaign.revision++;
      campaign.updatedAt = new Date(this.now()).toISOString();
      campaign.history.push({
        revision: campaign.revision,
        at: campaign.updatedAt,
        actor: scope.owner,
        action,
        detail: detail.slice(0, 1000),
        ...(action === 'decision'
          ? {
              decision: structuredClone(
                campaign.decisions.find(
                  (decision) => previousDecisions.get(decision.findingId) !== canonical(decision),
                ),
              ),
            }
          : {}),
        ...(action === 'rules' ? { dutyRules: structuredClone(campaign.rules) } : {}),
        ...(action === 'policies' ? { policies: structuredClone(campaign.policies) } : {}),
        ...(action === 'certify'
          ? {
              certification: structuredClone(
                campaign.certifications.find(
                  (decision) =>
                    previousCertifications.get(JSON.stringify([decision.kind, decision.name])) !==
                    canonical(decision),
                ),
              ),
            }
          : {}),
      });
      requireRemediationCapacity(campaign);
      await this.save(scope, campaign);
      return campaign;
    });
  }
}
