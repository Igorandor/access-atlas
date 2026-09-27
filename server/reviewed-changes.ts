import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { ApiError, type Operation } from './atlas-errors.js';
import { IrisClient, validateOperation } from './upstream.js';
import type { AtlasSession } from './atlas-sessions.js';
import { register } from '../shared/register.js';
import { spec, parameters } from '../shared/schema.js';
import { credentialValues, redact } from '../shared/redaction.js';
import { receiptAuthorizationProbe, canonicalChangeTarget } from './receipt-authorization.js';
import {
  receiptExplanation,
  type ChangeReview,
  type ChangeReceipt,
  type ReviewOperation,
} from '../shared/change-review.js';

const inputSchema = z
  .object({
    path: z.string().max(160),
    method: z.enum(['PUT', 'POST', 'DELETE']),
    query: z.record(z.string().max(80), z.string().max(2000)).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
    baseline: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
type Baseline = { data: any; existence: ChangeReview['existence']; read?: Operation };
type Ticket = {
  ownerSession: string;
  expires: number;
  operation: ReviewOperation;
  baseline: Baseline;
  fields: string[];
  review: ChangeReview;
  consumed: boolean;
  binding?: string;
};

function isWriteOnly(path: string) {
  return path === '/v2/wallet/secret' || path.endsWith('/password') || path.endsWith('/secrets');
}
function projectedBody(operation: ReviewOperation): Record<string, unknown> {
  const body = operation.body || {};
  return operation.path === '/v2/security/user' && operation.method === 'POST'
    ? (body.User as Record<string, unknown>) || {}
    : body;
}
function compareFields(current: any, expected: any, fields: string[]) {
  const sets = new Set([
    'Roles',
    'EscalationRoles',
    'GrantedRoles',
    'Resources',
    'OwnerList',
    'AllowedHosts',
  ]);
  const value = (field: string, input: unknown) =>
    sets.has(field) && Array.isArray(input)
      ? '[' + input.map(canonical).sort().join(',') + ']'
      : canonical(input);
  return fields.filter(
    (field) => value(field, current?.[field]) !== value(field, expected?.[field]),
  );
}
/** Object keys are unordered; arbitrary array order remains significant. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'undefined';
}
function targetLabel(operation: ReviewOperation) {
  const query = operation.query || {};
  return (
    query.name ||
    query.alias ||
    query.id ||
    query.applicationName ||
    query.serverId ||
    String(operation.body?.Name || operation.body?.IssuerEndpoint || 'New record')
  );
}
function publicFields(operation: ReviewOperation) {
  const body = projectedBody(operation);
  return Object.keys(body).filter(
    (name) =>
      redact({ [name]: body[name] })[name] !== '[redacted]' &&
      credentialValues({ [name]: body[name] }).length === 0,
  );
}

export class ReviewedChanges {
  private tickets = new Map<string, Ticket>();
  private lockedTargets = new Set<string>();
  private receipts = new Map<string, { owner: string; expires: number; receipt: ChangeReceipt }>();
  constructor(
    private client: IrisClient,
    private clock: () => number = Date.now,
  ) {}
  private collectExpired() {
    const now = this.clock();
    for (const [id, ticket] of this.tickets) if (ticket.expires <= now) this.tickets.delete(id);
    for (const [id, receipt] of this.receipts) if (receipt.expires <= now) this.receipts.delete(id);
  }
  private async checkIdentity(session: AtlasSession) {
    const response = await this.client.request(session.auth, { path: '/info', method: 'GET' });
    if (response.data?.username !== session.info.username)
      throw new ApiError(403, 'Native identity changed. Sign in again.');
  }
  private async readBaseline(session: AtlasSession, operation: ReviewOperation): Promise<Baseline> {
    const query = operation.query || {};
    let path = operation.path;
    if (path.startsWith('/v2/process/')) path = '/v2/process';
    if (path.startsWith('/v2/task/')) path = '/v2/task';
    if (path.endsWith('/password')) path = path.slice(0, -9);
    if (path.endsWith('/secrets')) path = path.slice(0, -8);
    if (path === '/v2/wallet/secret') {
      const response = await this.client.request(session.auth, {
        path: '/v2/wallet/secrets',
        method: 'GET',
        query: { collection: query.collection || '', maxRows: '1000' },
      });
      if (!Array.isArray(response.data)) throw new ApiError(502, 'Wallet metadata is unreadable.');
      const existing = response.data.find((row: any) => row.Name === query.name);
      if (!existing && response.data.length >= 1000)
        throw new ApiError(
          409,
          'Wallet listing is incomplete. Narrow the collection before changing this target.',
        );
      return { data: existing || {}, existence: existing ? 'present' : 'absent' };
    }
    if (!spec.paths[path]?.get) return { data: {}, existence: 'not-readable' };
    const contract = parameters(path, 'GET');
    if (contract.some((field) => field.required && !query[field.name]))
      return { data: {}, existence: 'not-readable' };
    const read: Operation = {
      path,
      method: 'GET',
      query: Object.fromEntries(
        contract
          .filter((field) => query[field.name] !== undefined)
          .map((field) => [field.name, query[field.name]]),
      ),
    };
    try {
      const response = await this.client.request(session.auth, read);
      if (!response.data || typeof response.data !== 'object' || Array.isArray(response.data))
        throw new ApiError(502, 'Native target details are unreadable.');
      return { data: response.data, existence: 'present', read };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404)
        return { data: {}, existence: 'absent', read };
      throw error;
    }
  }
  private processIdentity(data: any) {
    if (
      !Number.isFinite(Number(data?.Pid)) ||
      typeof data?.StartTimeUTC !== 'string' ||
      !data.StartTimeUTC ||
      data?.JobNumber === undefined
    )
      throw new ApiError(
        409,
        'Native process generation cannot be established. Atlas will not issue this command.',
      );
    return [
      String(data.Pid),
      data.StartTimeUTC,
      String(data.JobNumber),
      String(data.UserName ?? ''),
    ];
  }
  private targetKey(operation: ReviewOperation) {
    return canonicalChangeTarget(operation.path, operation.query || {}, targetLabel(operation));
  }
  async prepare(session: AtlasSession, input: unknown, binding?: string): Promise<ChangeReview> {
    this.collectExpired();
    const parsed = inputSchema.parse(input);
    const { baseline: inspected, ...operation } = parsed;
    validateOperation(operation);
    if (operation.path === '/v2/security/audit/records')
      throw new ApiError(400, 'Audit queries use the read API.');
    if (
      this.tickets.size >= 300 ||
      [...this.tickets.values()].filter((ticket) => ticket.ownerSession === session.csrf).length >=
        10
    )
      throw new ApiError(429, 'Too many pending proposals. Wait for old proposals to expire.');
    await this.checkIdentity(session);
    const baseline = await this.readBaseline(session, operation);
    const fields = publicFields(operation);
    if (
      inspected &&
      baseline.existence === 'present' &&
      compareFields(baseline.data, inspected, fields).length
    )
      throw new ApiError(
        409,
        'A selected field changed after inspection. Reload the record before reviewing this proposal.',
      );
    if (operation.method === 'DELETE' && baseline.existence === 'absent')
      throw new ApiError(409, 'The selected record no longer exists.');
    if (operation.path.startsWith('/v2/process/')) {
      if (baseline.existence !== 'present')
        throw new ApiError(409, 'The process no longer exists.');
      this.processIdentity(baseline.data);
      if (
        inspected &&
        canonical(this.processIdentity(inspected)) !==
          canonical(this.processIdentity(baseline.data))
      )
        throw new ApiError(
          409,
          'The selected PID has changed generation since inspection. Inspect the process again.',
        );
      const action = operation.path.split('/').at(-1);
      if (
        (action === 'suspend' && baseline.data.CanBeSuspended !== true) ||
        (action === 'terminate' && baseline.data.CanBeTerminated !== true)
      )
        throw new ApiError(403, 'IRIS does not permit this process operation.');
    }
    const entry = register.find(
      (item) =>
        operation.path === item.record || operation.path.startsWith((item.record || '#') + '/'),
    );
    const id = randomUUID();
    const at = this.clock();
    const secrets = credentialValues(operation.body);
    const review: ChangeReview = {
      id,
      title: entry?.title || 'Administrative change',
      target: targetLabel(operation),
      createdAt: new Date(at).toISOString(),
      expiresAt: new Date(at + 300_000).toISOString(),
      operation: redact(operation, secrets),
      before: redact(baseline.data, secrets),
      expected: redact(projectedBody(operation), secrets),
      existence: baseline.existence,
      verification: isWriteOnly(operation.path)
        ? 'Credential values are write-only. Only native acknowledgement and nonsecret metadata can be checked.'
        : operation.path.endsWith('/task/run')
          ? 'A run request does not prove that task code completed successfully. Inspect task history.'
          : operation.method === 'DELETE'
            ? 'A fresh read will check that the target is absent.'
            : baseline.read
              ? 'A fresh read will compare submitted nonsecret fields.'
              : 'The API does not provide a known target identifier before creation; the response will be recorded as acknowledged.',
      warnings: [
        ...(baseline.existence === 'not-readable'
          ? ['The target cannot be read before this operation.']
          : []),
        ...(secrets.length
          ? [
              'This proposal contains credentials. Values are retained only in gateway memory until expiry or execution.',
            ]
          : []),
        ...(operation.path.startsWith('/v2/process/')
          ? ['A process command affects a specific PID generation and may interrupt active work.']
          : []),
      ],
    };
    this.tickets.set(id, {
      ownerSession: session.csrf,
      expires: at + 300_000,
      operation: structuredClone(operation),
      baseline,
      fields,
      review,
      consumed: false,
      binding,
    });
    return review;
  }
  async list(session: AtlasSession) {
    this.collectExpired();
    await this.checkIdentity(session);
    const receipts = [...this.receipts.values()]
      .filter((entry) => entry.owner === session.csrf)
      .map((entry) => entry.receipt)
      .sort((a, b) => b.at.localeCompare(a.at));
    const checked = new Set<string>();
    for (const receipt of receipts) {
      const probe = receiptAuthorizationProbe(receipt.path);
      if (checked.has(probe.path)) continue;
      await this.client.request(session.auth, probe);
      checked.add(probe.path);
    }
    return receipts;
  }
  cancel(session: AtlasSession, id: string) {
    const ticket = this.tickets.get(id);
    if (!ticket || ticket.ownerSession !== session.csrf)
      throw new ApiError(404, 'Proposal not found.');
    if (ticket.consumed) throw new ApiError(409, 'This proposal has already been submitted.');
    this.tickets.delete(id);
  }
  async execute(
    session: AtlasSession,
    id: string,
    confirmation: string,
    binding?: string,
  ): Promise<ChangeReceipt> {
    this.collectExpired();
    const ticket = this.tickets.get(id);
    if (!ticket || ticket.ownerSession !== session.csrf)
      throw new ApiError(404, 'Proposal expired or not found.');
    if (ticket.binding !== binding)
      throw new ApiError(409, 'Submit this proposal through its campaign.');
    if (ticket.consumed)
      throw new ApiError(
        409,
        'This proposal was already submitted. Inspect its receipt before another operation.',
      );
    if (confirmation !== ticket.review.target)
      throw new ApiError(400, 'Type the exact target to confirm this proposal.');
    const targetKey = this.targetKey(ticket.operation);
    if (this.lockedTargets.has(targetKey))
      throw new ApiError(
        409,
        'Another proposal is executing for this target. Wait for its result.',
      );
    this.lockedTargets.add(targetKey);
    // Mark consumed before an await so two requests cannot dispatch the same write.
    ticket.consumed = true;
    const receipt: ChangeReceipt = {
      id: randomUUID(),
      reviewId: id,
      target: ticket.review.target,
      path: ticket.operation.path,
      method: ticket.operation.method,
      at: new Date(this.clock()).toISOString(),
      status: 'failed',
      message: '',
      checkedFields: [],
      differences: [],
    };
    let dispatched = false;
    try {
      await this.checkIdentity(session);
      const fresh = await this.readBaseline(session, ticket.operation);
      if (fresh.existence !== ticket.baseline.existence)
        throw new ApiError(
          409,
          'The target appeared or disappeared after review. Prepare another proposal.',
        );
      if (ticket.operation.path.startsWith('/v2/process/')) {
        if (
          canonical(this.processIdentity(fresh.data)) !==
          canonical(this.processIdentity(ticket.baseline.data))
        )
          throw new ApiError(
            409,
            'The PID now belongs to a different process. Prepare another proposal.',
          );
        if (
          (ticket.operation.path.endsWith('/suspend') && fresh.data.CanBeSuspended !== true) ||
          (ticket.operation.path.endsWith('/terminate') && fresh.data.CanBeTerminated !== true)
        )
          throw new ApiError(403, 'The process no longer permits this operation.');
      } else if (ticket.operation.method === 'DELETE') {
        if (canonical(fresh.data) !== canonical(ticket.baseline.data))
          throw new ApiError(409, 'The target changed after review. Inspect it before deletion.');
      } else if (compareFields(fresh.data, ticket.baseline.data, ticket.fields).length)
        throw new ApiError(
          409,
          'A submitted field changed after review. Prepare another proposal.',
        );
      dispatched = true;
      const outcome = await this.client.request(session.auth, ticket.operation);
      receipt.nativeStatus = outcome.status;
      if (outcome.asyncId) {
        receipt.asyncId = outcome.asyncId;
        receipt.status = 'acknowledged';
      } else if (
        isWriteOnly(ticket.operation.path) ||
        !fresh.read ||
        ticket.operation.path.startsWith('/v2/process/') ||
        ticket.operation.path === '/v2/task/run'
      ) {
        receipt.status = 'acknowledged';
      } else {
        try {
          if (
            ticket.operation.path === '/v2/task/suspend' ||
            ticket.operation.path === '/v2/task/resume'
          ) {
            const info = await this.client.request(session.auth, {
              path: '/v2/task/info',
              method: 'GET',
              query: { id: ticket.operation.query!.id },
            });
            const expected = ticket.operation.path.endsWith('suspend');
            receipt.checkedFields = ['Suspended'];
            receipt.differences =
              info.data?.Suspended === expected
                ? []
                : [{ field: 'Suspended', expected, observed: info.data?.Suspended }];
          } else {
            const after = await this.readBaseline(session, ticket.operation);
            if (ticket.operation.method === 'DELETE') {
              receipt.checkedFields = ['existence'];
              if (after.existence !== 'absent')
                receipt.differences.push({
                  field: 'existence',
                  expected: 'absent',
                  observed: after.existence,
                });
            } else {
              receipt.checkedFields = ticket.fields;
              const expected = projectedBody(ticket.operation);
              receipt.differences = compareFields(after.data, expected, ticket.fields).map(
                (field) => ({
                  field,
                  expected: redact({ [field]: expected[field] })[field],
                  observed: redact({ [field]: after.data?.[field] })[field],
                }),
              );
            }
          }
          receipt.status = receipt.differences.length
            ? 'different'
            : receipt.checkedFields.length
              ? 'verified'
              : 'acknowledged';
        } catch {
          receipt.status = 'unverified';
        }
      }
      receipt.message = receiptExplanation(receipt.status);
    } catch (error) {
      receipt.status =
        dispatched && (!(error instanceof ApiError) || error.status >= 500)
          ? 'uncertain'
          : 'failed';
      receipt.message = dispatched
        ? receiptExplanation(receipt.status)
        : error instanceof ApiError
          ? error.message
          : 'The proposal could not be validated.';
    } finally {
      this.lockedTargets.delete(targetKey);
      // Credentials and record bodies do not survive in receipts or consumed proposals.
      ticket.operation = { path: ticket.operation.path, method: ticket.operation.method };
      ticket.baseline = { data: {}, existence: 'not-readable' };
      ticket.review.before = {};
      ticket.review.expected = {};
      this.receipts.set(receipt.id, {
        owner: session.csrf,
        expires: this.clock() + 28_800_000,
        receipt,
      });
      const own = [...this.receipts.entries()].filter(([, entry]) => entry.owner === session.csrf);
      for (const [old] of own.slice(0, Math.max(0, own.length - 100))) this.receipts.delete(old);
    }
    return receipt;
  }
}

export function reviewedChangeRoutes(service: ReviewedChanges) {
  const router = Router();
  router.get('/receipts', async (request, response) =>
    response.json(await service.list(response.locals.atlas)),
  );
  router.post('/review', async (request, response) =>
    response.json(await service.prepare(response.locals.atlas, request.body)),
  );
  router.post('/apply', async (request, response) => {
    const input = z
      .object({ id: z.string().uuid(), confirmation: z.string().max(2000) })
      .strict()
      .parse(request.body);
    response.json(await service.execute(response.locals.atlas, input.id, input.confirmation));
  });
  router.post('/cancel', (request, response) => {
    const input = z.object({ id: z.string().uuid() }).strict().parse(request.body);
    service.cancel(response.locals.atlas, input.id);
    response.json({ ok: true });
  });
  return router;
}
