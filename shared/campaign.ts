import { z } from 'zod';
import { snapshotSchema, parseSnapshot } from './snapshot-schema.js';
import { dutyRulesSchema } from './duty-rules.js';
import { reviewPoliciesSchema, evaluatePolicies } from './review-policies.js';
import { remediationRecordSchema } from './remediation.js';
import {
  certificationSchema,
  certificationScopeSchema,
  certificationKindSchema,
  defaultCertificationScope,
  certificationCoverage,
} from './certification.js';
import { findings, compareSnapshots, type AccessSnapshot } from './access-model.js';
import { reviewDateSchema } from './review-date.js';

export const campaignBounds = {
  campaigns: 100,
  captures: 12,
  decisions: 500,
  history: 1000,
  captureBytes: 1_500_000,
  fileBytes: 20_000_000,
} as const;
const identity = z.string().uuid();
const title = z.string().trim().min(1).max(160);
const note = z.string().trim().max(4000);
export const outcomeSchema = z.enum(['accepted', 'change-required', 'investigating', 'exception']);
export type ReviewOutcome = z.infer<typeof outcomeSchema>;
export const decisionSchema = z
  .object({
    findingId: z.string().min(1).max(1024),
    fingerprint: z.string().min(1).max(100_000),
    outcome: outcomeSchema,
    note: note.min(1),
    dueDate: reviewDateSchema.optional(),
    captureId: identity,
    reviewedAt: z.string().datetime(),
  })
  .strict();
export const campaignSchema = z
  .object({
    version: z.literal(1),
    id: identity,
    instance: z.string().min(1).max(1024),
    owner: z.string().min(1).max(128),
    title,
    description: note,
    state: z.enum(['active', 'closed', 'archived']),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    rules: dutyRulesSchema,
    policies: reviewPoliciesSchema.default([]),
    remediations: z.array(remediationRecordSchema).max(200).default([]),
    certificationScope: certificationScopeSchema.default(defaultCertificationScope),
    certifications: z.array(certificationSchema).max(2000).default([]),
    captures: z
      .array(
        z
          .object({
            id: identity,
            label: title,
            snapshot: snapshotSchema,
          })
          .strict(),
      )
      .max(campaignBounds.captures),
    decisions: z.array(decisionSchema).max(campaignBounds.decisions),
    history: z
      .array(
        z
          .object({
            revision: z.number().int().positive(),
            at: z.string().datetime(),
            actor: z.string().min(1).max(128),
            action: z.string().min(1).max(100),
            detail: z.string().max(1000),
            decision: decisionSchema.optional(),
            dutyRules: dutyRulesSchema.optional(),
            policies: reviewPoliciesSchema.optional(),
            certification: certificationSchema.optional(),
          })
          .strict(),
      )
      .max(campaignBounds.history),
  })
  .strict();
export type Campaign = z.infer<typeof campaignSchema>;
export type CampaignSummary = Omit<
  Campaign,
  'captures' | 'decisions' | 'rules' | 'history' | 'policies' | 'remediations' | 'certifications'
> & {
  captureCount: number;
  decisionCount: number;
  latestCaptureAt?: string;
};
export const createCampaignSchema = z.object({ title, description: note.default('') }).strict();
const revision = z.number().int().positive();
export const campaignChangeSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('certification-scope'), revision, scope: certificationScopeSchema })
    .strict(),
  z
    .object({
      action: z.literal('certify'),
      revision,
      kind: certificationKindSchema,
      name: z.string().min(1).max(512),
      captureId: z.string().uuid(),
      outcome: certificationSchema.shape.outcome,
      note: certificationSchema.shape.note,
      dueDate: certificationSchema.shape.dueDate,
    })
    .strict(),
  z
    .object({
      action: z.literal('carry-certifications'),
      revision,
      fromCaptureId: z.string().uuid(),
    })
    .strict(),
  z.object({ action: z.literal('policies'), revision, policies: reviewPoliciesSchema }).strict(),
  z.object({ action: z.literal('details'), revision, title, description: note }).strict(),
  z.object({ action: z.literal('rules'), revision, rules: dutyRulesSchema }).strict(),
  z
    .object({
      action: z.literal('decision'),
      revision,
      findingId: z.string().min(1).max(1024),
      fingerprint: z.string().min(1).max(100_000),
      outcome: outcomeSchema,
      note: note.min(1),
      dueDate: reviewDateSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('state'),
      revision,
      state: z.enum(['active', 'closed', 'archived']),
      reason: note.min(1),
    })
    .strict(),
  z.object({ action: z.literal('capture'), revision, label: title }).strict(),
]);
export type CampaignChange = z.infer<typeof campaignChangeSchema>;

export function validateCampaign(input: unknown): Campaign {
  const campaign = campaignSchema.parse(input);
  const captureIds = new Set<string>();
  for (const capture of campaign.captures) {
    parseSnapshot(capture.snapshot);
    if (capture.snapshot.instance !== campaign.instance || captureIds.has(capture.id))
      throw new Error('Campaign contains an invalid capture identity.');
    captureIds.add(capture.id);
  }
  if (campaign.decisions.some((decision) => !captureIds.has(decision.captureId)))
    throw new Error('Campaign decision refers to missing data.');
  if (
    new Set(campaign.decisions.map((decision) => decision.findingId)).size !==
    campaign.decisions.length
  )
    throw new Error('Campaign contains duplicate decisions.');
  if (
    campaign.history.some((event, index) => event.revision !== index + 1) ||
    campaign.history.length !== campaign.revision
  )
    throw new Error('Campaign history is incomplete.');
  return campaign;
}

export function campaignSummary(campaign: Campaign): CampaignSummary {
  const {
    captures,
    decisions,
    rules: _rules,
    history: _history,
    policies: _policies,
    remediations: _remediations,
    certifications: _certifications,
    ...summary
  } = campaign;
  return {
    ...summary,
    captureCount: captures.length,
    decisionCount: decisions.length,
    latestCaptureAt: captures.at(-1)?.snapshot.capturedAt,
  };
}

export function campaignProgress(campaign: Campaign, now = new Date()) {
  const latest = campaign.captures.at(-1);
  const items = campaignFindings(campaign);
  const decisions = new Map(campaign.decisions.map((decision) => [decision.findingId, decision]));
  const today = now.toISOString().slice(0, 10);
  const rows = items.map((finding) => {
    const saved = decisions.get(finding.id);
    const decision = saved?.fingerprint === finding.fingerprint ? saved : undefined;
    return {
      finding,
      decision,
      outdated: Boolean(saved && !decision),
      overdue: Boolean(
        decision?.dueDate &&
        decision.dueDate < today &&
        ['change-required', 'investigating'].includes(decision.outcome),
      ),
    };
  });
  return {
    rows,
    reviewed: rows.filter((row) => row.decision).length,
    remaining: rows.filter((row) => !row.decision).length,
    overdue: rows.filter((row) => row.overdue).length,
    openChanges: rows.filter((row) => row.decision?.outcome === 'change-required').length,
    certificationIncomplete:
      campaign.certificationScope.enabled &&
      (!latest ||
        !certificationCoverage(
          latest.snapshot,
          latest.id,
          campaign.certificationScope,
          campaign.certifications,
        ).complete),
    incomplete:
      !latest ||
      latest.snapshot.warnings.length > 0 ||
      [...latest.snapshot.users, ...latest.snapshot.roles, ...latest.snapshot.apps].some((row) =>
        Object.hasOwn(row, 'unavailable'),
      ) ||
      evaluatePolicies(latest.snapshot, campaign.policies).some((row) => row.result === 'unknown'),
  };
}

export function campaignFindings(campaign: Campaign) {
  const latest = campaign.captures.at(-1);
  if (!latest) return [];
  return [
    ...findings(latest.snapshot),
    ...evaluatePolicies(latest.snapshot, campaign.policies)
      .filter((row) => ['finding', 'conditional', 'unknown'].includes(row.result))
      .map((row) => ({
        id: 'policy:' + row.id,
        fingerprint: row.fingerprint,
        target: row.target,
        title: row.policy + ' · ' + row.result,
        detail: row.explanation,
        category: 'Policy' as const,
        kind:
          row.entity === 'account'
            ? ('user' as const)
            : row.entity === 'application'
              ? ('app' as const)
              : row.entity === 'resource'
                ? ('resource' as const)
                : ('role' as const),
      })),
  ];
}

export function campaignChanges(campaign: Campaign, beforeId: string, afterId: string) {
  const before = campaign.captures.find((capture) => capture.id === beforeId);
  const after = campaign.captures.find((capture) => capture.id === afterId);
  if (!before || !after) throw new Error('Choose two saved captures.');
  return compareSnapshots(before.snapshot, after.snapshot);
}

export function appendCampaignCapture(
  campaign: Campaign,
  snapshot: AccessSnapshot,
  id: string,
  label: string,
) {
  if (campaign.captures.length >= campaignBounds.captures)
    throw new Error(
      'This campaign has 12 captures. Start a new campaign to preserve the existing history.',
    );
  if (snapshot.instance !== campaign.instance)
    throw new Error('The capture belongs to another instance.');
  campaign.captures.push({ id, label, snapshot });
}
