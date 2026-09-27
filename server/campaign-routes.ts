import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { CampaignStore, type CampaignScope } from './campaign-store.js';
import { ApiError, type IrisClient } from './upstream.js';
import { captureAccess } from './access-snapshot.js';
import type { AtlasSession } from './atlas-sessions.js';
import { findings } from '../shared/access-model.js';
import { canonical } from '../shared/access-model.js';
import {
  draftRemediation,
  remediationRequestSchema,
  remediationNeedsReadback,
} from '../shared/remediation.js';
import type { ReviewedChanges } from './reviewed-changes.js';
import { certificationSubjects, carryCertifications } from '../shared/certification.js';
import { nextPeriodSchema } from '../shared/campaign-period.js';
import {
  createCampaignSchema,
  campaignChangeSchema,
  appendCampaignCapture,
  campaignBounds,
  campaignProgress,
  campaignFindings,
} from '../shared/campaign.js';

export function campaignRoutes(settings: {
  transport: IrisClient;
  store: CampaignStore;
  instance: string;
  now: () => number;
  changes: ReviewedChanges;
}) {
  const router = Router();
  const activeCaptures = new Set<string>();
  const activeRemediations = new Set<string>();
  const captureTimes = new Map<string, number>();
  router.use(async (_request, response, next) => {
    const session = response.locals.atlas as AtlasSession;
    // A valid portal cookie cannot preserve access after the native privilege is revoked.
    const identity = await settings.transport.request(session.auth, {
      path: '/info',
      method: 'GET',
    });
    if (identity.data?.username !== session.info.username)
      throw new ApiError(403, 'The native identity changed. Sign in again.');
    await settings.transport.request(session.auth, {
      path: '/v2/security/users',
      method: 'GET',
      query: { maxRows: '1' },
    });
    await settings.transport.request(session.auth, {
      path: '/v2/security/roles',
      method: 'GET',
      query: { maxRows: '1' },
    });
    response.locals.campaignScope = {
      instance: settings.instance,
      owner: session.info.username,
    } satisfies CampaignScope;
    next();
  });
  router.get('/', async (_request, response) => {
    response.json(await settings.store.list(response.locals.campaignScope));
  });
  router.post('/', async (request, response) => {
    const input = createCampaignSchema.parse(request.body);
    response
      .status(201)
      .json(
        await settings.store.create(response.locals.campaignScope, input.title, input.description),
      );
  });
  router.get('/:id', async (request, response) => {
    response.json(
      await settings.store.read(response.locals.campaignScope, String(request.params.id)),
    );
  });
  router.post('/:id/next-period', async (request, response) => {
    const input = nextPeriodSchema.parse(request.body);
    const created = await settings.store.create(
      response.locals.campaignScope,
      input.title,
      input.description,
      { id: String(request.params.id), input },
    );
    response.status(201).json(created);
  });
  router.post('/:id', async (request, response) => {
    const input = campaignChangeSchema.parse(request.body);
    const scope: CampaignScope = response.locals.campaignScope;
    const id = String(request.params.id);
    const session = response.locals.atlas as AtlasSession;
    const current = await settings.store.read(scope, id);
    if (current.revision !== input.revision)
      throw new ApiError(409, 'This campaign changed. Reload it before saving.');
    if (input.action !== 'state' && current.state !== 'active')
      throw new ApiError(409, 'Reopen this campaign before making changes.');
    if (current.remediations.some((item) => item.status === 'dispatching'))
      throw new ApiError(
        409,
        'Reconcile the interrupted remediation before editing this campaign.',
      );
    let snapshot;
    if (input.action === 'capture') {
      if (current.captures.length >= campaignBounds.captures)
        throw new ApiError(409, 'This campaign has reached its 12 capture limit.');
      const ownerKey = JSON.stringify([scope.instance, scope.owner]);
      if (
        activeCaptures.has(ownerKey) ||
        settings.now() - (captureTimes.get(ownerKey) ?? -Infinity) < 5000
      )
        throw new ApiError(
          429,
          'A capture is running or just finished. Wait five seconds before starting another.',
        );
      activeCaptures.add(ownerKey);
      try {
        snapshot = await captureAccess(settings.transport, session.auth, scope.instance);
        if (Buffer.byteLength(JSON.stringify(snapshot)) > campaignBounds.captureBytes)
          throw new ApiError(413, 'The captured data exceeds the 1.5 MB campaign limit.');
      } finally {
        activeCaptures.delete(ownerKey);
        captureTimes.set(ownerKey, settings.now());
        for (const [key, at] of captureTimes)
          if (settings.now() - at > 60_000) captureTimes.delete(key);
      }
    }
    const detail =
      input.action === 'capture'
        ? input.label
        : input.action === 'state'
          ? input.state + ': ' + input.reason
          : input.action === 'decision'
            ? input.findingId + ': ' + input.outcome
            : input.action === 'rules'
              ? input.rules.length + ' duty rules'
              : input.action === 'certification-scope'
                ? 'Certification scope updated'
                : input.action === 'certify'
                  ? input.kind + ':' + input.name + ': ' + input.outcome
                  : input.action === 'carry-certifications'
                    ? 'Carry decisions from ' + input.fromCaptureId
                    : input.action === 'policies'
                      ? input.policies.length + ' review policies'
                      : input.title;
    const updated = await settings.store.change(
      scope,
      id,
      input.revision,
      input.action,
      detail,
      (campaign) => {
        if (input.action !== 'state' && campaign.state !== 'active')
          throw new ApiError(409, 'Reopen this campaign before making changes.');
        switch (input.action) {
          case 'certification-scope':
            campaign.certificationScope = input.scope;
            break;
          case 'certify': {
            const latest = campaign.captures.at(-1);
            if (!latest || latest.id !== input.captureId)
              throw new ApiError(409, 'Review the latest capture before certifying an object.');
            const subject = certificationSubjects(
              latest.snapshot,
              campaign.certificationScope,
            ).find((row) => row.kind === input.kind && row.name === input.name);
            if (!subject)
              throw new ApiError(409, 'This object is outside the current certification scope.');
            if (subject.unknown.length && ['retain', 'exception'].includes(input.outcome))
              throw new ApiError(409, 'Resolve the missing evidence before accepting this object.');
            const decision = {
              kind: input.kind,
              name: input.name,
              captureId: input.captureId,
              outcome: input.outcome,
              note: input.note,
              dueDate: input.dueDate,
              reviewedAt: new Date(settings.now()).toISOString(),
            };
            const index = campaign.certifications.findIndex(
              (row) => row.kind === input.kind && row.name === input.name,
            );
            if (index >= 0) campaign.certifications[index] = decision;
            else {
              if (campaign.certifications.length >= 2000)
                throw new ApiError(409, 'Certification decision limit reached.');
              campaign.certifications.push(decision);
            }
            break;
          }
          case 'carry-certifications': {
            const previous = campaign.captures.find(
              (capture) => capture.id === input.fromCaptureId,
            );
            const latest = campaign.captures.at(-1);
            if (!previous || !latest || previous.id === latest.id)
              throw new ApiError(400, 'Choose an earlier capture.');
            try {
              campaign.certifications = carryCertifications({
                before: previous.snapshot,
                after: latest.snapshot,
                previousCaptureId: previous.id,
                currentCaptureId: latest.id,
                scope: campaign.certificationScope,
                decisions: campaign.certifications,
                at: new Date(settings.now()).toISOString(),
              }).decisions;
            } catch (failure) {
              throw new ApiError(409, (failure as Error).message);
            }
            break;
          }
          case 'policies':
            campaign.policies = input.policies;
            break;
          case 'details':
            campaign.title = input.title;
            campaign.description = input.description;
            break;
          case 'rules':
            campaign.rules = input.rules;
            break;
          case 'capture':
            appendCampaignCapture(campaign, snapshot!, randomUUID(), input.label);
            break;
          case 'decision': {
            const latest = campaign.captures.at(-1);
            const finding = campaignFindings(campaign).find((item) => item.id === input.findingId);
            if (!finding || finding.fingerprint !== input.fingerprint)
              throw new ApiError(
                409,
                'The finding is not current. Reload the campaign and review its latest capture.',
              );
            const decision = {
              findingId: input.findingId,
              fingerprint: finding.fingerprint,
              outcome: input.outcome,
              note: input.note,
              dueDate: input.dueDate,
              captureId: latest!.id,
              reviewedAt: new Date(settings.now()).toISOString(),
            };
            const previous = campaign.decisions.findIndex(
              (item) => item.findingId === input.findingId,
            );
            if (previous < 0) {
              if (campaign.decisions.length >= campaignBounds.decisions)
                throw new ApiError(409, 'Campaign decision limit reached.');
              campaign.decisions.push(decision);
            } else campaign.decisions[previous] = decision;
            break;
          }
          case 'state': {
            if (campaign.state === input.state)
              throw new ApiError(409, 'This campaign already has that status.');
            if (input.state === 'closed') {
              const progress = campaignProgress(campaign);
              if (
                progress.incomplete ||
                progress.remaining ||
                progress.openChanges ||
                progress.investigating ||
                progress.certificationIncomplete
              )
                throw new ApiError(
                  409,
                  'Complete the capture and certification, and record a final decision for every finding before closing. Resolve change-required and investigating decisions first.',
                );
              if (campaign.remediations.some(remediationNeedsReadback))
                throw new ApiError(
                  409,
                  'Read back submitted changes and record reconciliation before closing. A recorded difference can remain visible; it does not require replaying the write.',
                );
            }
            campaign.state = input.state;
            break;
          }
        }
      },
    );
    response.json(updated);
  });
  router.post('/:id/remediation-review', async (request, response) => {
    const input = remediationRequestSchema.parse(request.body);
    const scope: CampaignScope = response.locals.campaignScope;
    const id = String(request.params.id);
    const campaign = await settings.store.read(scope, id);
    if (campaign.revision !== input.revision || campaign.state !== 'active')
      throw new ApiError(409, 'Reload an active campaign before preparing remediation.');
    if (campaign.remediations.length >= 200)
      throw new ApiError(409, 'Remediation history limit reached. Start another campaign.');
    const finding = campaignFindings(campaign).find((row) => row.id === input.findingId);
    if (!finding || finding.fingerprint !== input.fingerprint)
      throw new ApiError(409, 'This finding changed. Review the latest campaign capture.');
    const latest = campaign.captures.at(-1)!;
    let draft;
    try {
      draft = draftRemediation(latest.snapshot, finding, input);
    } catch (failure) {
      throw new ApiError(400, (failure as Error).message);
    }
    const review = await settings.changes.prepare(
      response.locals.atlas,
      { ...draft.operation, baseline: draft.baseline },
      id,
    );
    try {
      const updated = await settings.store.change(
        scope,
        id,
        input.revision,
        'remediation-reviewed',
        draft.title,
        (document) => {
          if (document.state !== 'active') throw new ApiError(409, 'Campaign is no longer active.');
          document.remediations.push({
            id: review.id,
            findingId: finding.id,
            fingerprint: finding.fingerprint,
            title: draft.title,
            target: review.target,
            reason: input.reason,
            createdAt: review.createdAt,
            updatedAt: review.createdAt,
            status: 'reviewed',
            path: draft.operation.path,
            method: draft.operation.method,
            message: review.verification,
            checkedFields: [],
            expected: draft.operation.body as any,
          });
        },
      );
      response.json({
        campaign: updated,
        review,
        warnings: draft.warnings,
        affected: draft.projection?.affected || [],
      });
    } catch (failure) {
      settings.changes.cancel(response.locals.atlas, review.id);
      throw failure;
    }
  });
  router.post('/:id/remediation-apply', async (request, response) => {
    const input = z
      .object({
        revision: z.number().int().positive(),
        reviewId: z.string().uuid(),
        confirmation: z.string().max(2000),
      })
      .strict()
      .parse(request.body);
    const scope: CampaignScope = response.locals.campaignScope;
    const id = String(request.params.id);
    if (activeRemediations.has(id))
      throw new ApiError(409, 'A remediation is executing for this campaign.');
    activeRemediations.add(id);
    try {
      const dispatching = await settings.store.change(
        scope,
        id,
        input.revision,
        'remediation-dispatch',
        input.reviewId,
        (campaign) => {
          const record = campaign.remediations.find((item) => item.id === input.reviewId);
          if (campaign.state !== 'active' || !record || record.status !== 'reviewed')
            throw new ApiError(409, 'This remediation cannot be submitted.');
          if (record.target !== input.confirmation)
            throw new ApiError(400, 'Confirm the exact target.');
          if (campaign.remediations.some((item) => item.status === 'dispatching'))
            throw new ApiError(
              409,
              'Reconcile the previous interrupted remediation before submitting another.',
            );
          record.status = 'dispatching';
          record.updatedAt = new Date(settings.now()).toISOString();
          record.message =
            'Dispatch started. If execution is interrupted, inspect the target before another attempt.';
        },
      );
      let receipt;
      try {
        receipt = await settings.changes.execute(
          response.locals.atlas,
          input.reviewId,
          input.confirmation,
          id,
        );
      } catch (failure) {
        // Failure before dispatch (for example an expired memory ticket) is still recorded.
        const failed = await settings.store.change(
          scope,
          id,
          dispatching.revision,
          'remediation-not-sent',
          input.reviewId,
          (campaign) => {
            const record = campaign.remediations.find((item) => item.id === input.reviewId)!;
            record.status = 'failed';
            record.message =
              failure instanceof ApiError
                ? failure.message
                : 'The proposal could not be dispatched.';
          },
          input.reviewId,
        );
        response.json({ campaign: failed });
        return;
      }
      const updated = await settings.store.change(
        scope,
        id,
        dispatching.revision,
        'remediation-result',
        receipt.status,
        (campaign) => {
          const record = campaign.remediations.find((item) => item.id === input.reviewId)!;
          record.status = receipt.status;
          record.updatedAt = receipt.at;
          record.message = receipt.message;
          record.checkedFields = receipt.checkedFields;
        },
        input.reviewId,
      );
      response.json({ campaign: updated, receipt });
    } finally {
      activeRemediations.delete(id);
    }
  });
  router.post('/:id/remediation-reconcile', async (request, response) => {
    const input = z
      .object({
        revision: z.number().int().positive(),
        reviewId: z.string().uuid(),
        note: z.string().trim().min(1).max(4000),
      })
      .strict()
      .parse(request.body);
    const scope: CampaignScope = response.locals.campaignScope;
    const id = String(request.params.id);
    if (activeRemediations.has(id))
      throw new ApiError(409, 'Wait for the active remediation before checking its state.');
    activeRemediations.add(id);
    try {
      const campaign = await settings.store.read(scope, id);
      const record = campaign.remediations.find((item) => item.id === input.reviewId);
      if (
        !record ||
        !record.expected ||
        !['/v2/security/user', '/v2/security/resource', '/v2/web-app'].includes(record.path)
      )
        throw new ApiError(409, 'This record has no supported reconciliation target.');
      if (record.status === 'reviewed')
        throw new ApiError(409, 'This proposal has not been submitted.');
      const observed = await settings.transport.request(
        (response.locals.atlas as AtlasSession).auth,
        { path: record.path, method: 'GET', query: { name: record.target } },
      );
      const fields = Object.keys(record.expected);
      const matches = fields.every(
        (field) => canonical(observed.data?.[field]) === canonical(record.expected![field]),
      );
      const updated = await settings.store.change(
        scope,
        id,
        input.revision,
        'remediation-reconciled',
        input.reviewId,
        (document) => {
          const target = document.remediations.find((item) => item.id === input.reviewId)!;
          target.status = matches ? 'verified' : 'different';
          target.updatedAt = new Date(settings.now()).toISOString();
          target.message = matches
            ? 'The current native fields match this proposal. This observation does not prove which operation caused them.'
            : 'The current native fields differ from this proposal. No write was attempted during reconciliation.';
          target.checkedFields = fields;
          target.reconciliation = input.note;
        },
        input.reviewId,
      );
      response.json({ campaign: updated });
    } finally {
      activeRemediations.delete(id);
    }
  });
  return router;
}
