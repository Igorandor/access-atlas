import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AtlasSessionVault, type AtlasSession } from './atlas-sessions.js';
import { ApiError, IrisClient, type Operation } from './upstream.js';
import { captureAccess } from './access-snapshot.js';
import { consolePreview } from './activity.js';
import { parameters } from '../shared/schema.js';
import { CampaignStore } from './campaign-store.js';
import { campaignRoutes } from './campaign-routes.js';
import { ReviewedChanges, reviewedChangeRoutes } from './reviewed-changes.js';

export type AppOptions = {
  irisUrl: string;
  instanceId?: string;
  origin?: string;
  secure?: boolean;
  client?: IrisClient;
  now?: () => number;
  campaignDirectory?: string;
};
const cookie = 'atlas_session';
const loginInput = z.object({
  username: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[^:\r\n]+$/),
  password: z.string().min(1).max(1024),
});
const operationInput = z
  .object({
    path: z.string().max(160),
    method: z.enum(['GET', 'PUT', 'POST', 'DELETE']),
    query: z.record(z.string().max(80), z.string().max(2000)).optional(),
    body: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

function verifyIdentity(data: any) {
  const version = data?.apiVersion;
  if (
    (typeof version !== 'number' && !(typeof version === 'string' && /^\d+$/.test(version))) ||
    !Number.isSafeInteger(Number(version)) ||
    Number(version) < 0 ||
    typeof data?.username !== 'string' ||
    !data.username.trim() ||
    data.username.length > 128
  )
    throw new ApiError(502, 'IRIS supplied an invalid identity or API version.');
  if (Number(version) < 2) throw new ApiError(409, 'Atlas requires the IRIS SysAdmin v2 API.');
}

export function createApp(options: AppOptions) {
  const app = express();
  const instance = options.instanceId || new URL(options.irisUrl).origin;
  const clock = options.now ?? Date.now;
  const vault = new AtlasSessionVault(clock);
  const transport = options.client ?? new IrisClient(options.irisUrl);
  const reviewedChanges = new ReviewedChanges(transport, clock);
  const readSession = (response: express.Response): AtlasSession => response.locals.atlas;
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '256kb' }), cookieParser());
  const api = express.Router();
  app.use('/api', api);
  api.use((request, _response, next) => {
    const host = request.headers.host ?? '';
    if (!options.origin && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host))
      throw new ApiError(403, 'Configure PUBLIC_ORIGIN before exposing Atlas beyond loopback.');
    if (!['GET', 'HEAD'].includes(request.method)) {
      const expected = options.origin || 'http://' + host;
      if (
        request.headers['sec-fetch-site'] === 'cross-site' ||
        (request.headers.origin && request.headers.origin !== expected)
      )
        throw new ApiError(403, 'This origin cannot issue Atlas requests.');
      if (!request.is('application/json'))
        throw new ApiError(415, 'Atlas accepts JSON request bodies.');
    }
    next();
  });
  api.get('/health', (_request, response) =>
    response.json({
      ok: true,
      app: 'Access Atlas',
      target: new URL(options.irisUrl).host,
    }),
  );
  api.post('/login', async (request, response) => {
    const credentials = loginInput.parse(request.body);
    vault.budget(request.ip ?? 'local');
    const requireUnchangedSession = vault.replacementGuard(request.cookies[cookie]);
    const authorization =
      'Basic ' + Buffer.from(credentials.username + ':' + credentials.password).toString('base64');
    const { data } = await transport.request(authorization, { path: '/info', method: 'GET' });
    verifyIdentity(data);
    requireUnchangedSession();
    const { id, session } = vault.create(authorization, data, request.cookies[cookie]);
    response.cookie(cookie, id, {
      httpOnly: true,
      sameSite: 'strict',
      secure: options.secure === true,
      maxAge: 28800000,
      path: '/',
    });
    response.json({ info: session.info, csrf: session.csrf, instance });
  });
  api.use((request, response, next) => {
    const token = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : String(request.headers['x-csrf-token'] ?? '');
    response.locals.atlas = vault.access(request.cookies[cookie], token);
    next();
  });
  api.get('/session', (_request, response) => {
    const session = readSession(response);
    response.json({ info: session.info, csrf: session.csrf, instance });
  });
  api.post('/logout', (request, response) => {
    vault.forget(request.cookies[cookie]);
    response.clearCookie(cookie, { path: '/' });
    response.json({ ok: true });
  });
  api.get('/activity', (_request, response) => response.json(readSession(response).activity));
  api.use('/changes', reviewedChangeRoutes(reviewedChanges));
  api.use(
    '/campaigns',
    campaignRoutes({
      transport,
      store: new CampaignStore(options.campaignDirectory || 'data/campaigns', clock),
      instance: options.instanceId || new URL(options.irisUrl).origin,
      now: clock,
      changes: reviewedChanges,
    }),
  );
  api.post('/access-snapshot', async (_request, response) => {
    const session = readSession(response);
    if (
      !session.capture &&
      session.lastCapture !== undefined &&
      clock() - session.lastCapture < 5000
    )
      throw new ApiError(429, 'Wait five seconds between captures.');
    session.capture ??= captureAccess(
      transport,
      session.auth,
      options.instanceId || new URL(options.irisUrl).origin,
    );
    try {
      response.json(await session.capture);
    } finally {
      session.lastCapture = clock();
      session.capture = undefined;
    }
  });
  api.post('/iris', async (request, response) => {
    const operation = operationInput.parse(request.body) as Operation;
    if (operation.method !== 'GET' && operation.path !== '/v2/security/audit/records')
      throw new ApiError(409, 'Administrative writes require a server-reviewed proposal.');
    if (
      (operation.method === 'GET' || operation.path === '/v2/security/audit/records') &&
      parameters(operation.path, operation.method).some((field) => field.name === 'maxRows') &&
      !operation.query?.maxRows
    )
      operation.query = { ...operation.query, maxRows: '250' };
    const session = readSession(response),
      began = clock();
    const record = (status: number, diagnostics?: unknown) => {
      session.activity = [
        {
          at: new Date(clock()).toISOString(),
          method: operation.method,
          path: operation.path,
          status,
          elapsed: clock() - began,
          ...(diagnostics === undefined
            ? {}
            : {
                target:
                  operation.query?.name ?? operation.query?.id ?? operation.query?.alias ?? '',
                console: consolePreview(diagnostics),
              }),
        },
        ...session.activity,
      ].slice(0, 100);
    };
    const readCancellation = operation.method === 'GET' ? new AbortController() : undefined;
    function cancelDisconnectedRead() {
      if (!response.writableEnded) readCancellation?.abort();
    }
    if (readCancellation) {
      response.once('close', cancelDisconnectedRead);
      if (response.destroyed) readCancellation.abort();
    }
    try {
      const result = await transport.request(session.auth, operation, readCancellation?.signal);
      if (readCancellation?.signal.aborted) return;
      if (operation.method !== 'GET' || result.console?.length)
        record(result.status, result.console);
      response.json(result);
    } catch (error) {
      if (readCancellation?.signal.aborted) return;
      record(error instanceof ApiError ? error.status : 500);
      throw error;
    } finally {
      if (readCancellation) response.off('close', cancelDisconnectedRead);
    }
  });
  api.use((_request, _response) => {
    throw new ApiError(404, 'No such Atlas endpoint.');
  });
  app.use(express.static(resolve('dist')));
  app.get('/{*page}', (_request, response) => response.sendFile(resolve('dist/index.html')));
  app.use(
    (
      error: any,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        error instanceof ApiError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : error.type === 'entity.too.large'
              ? 413
              : error.type === 'entity.parse.failed'
                ? 400
                : 500;
      response.status(status).json({
        error:
          error instanceof ApiError
            ? error.message
            : status === 400
              ? 'Invalid Atlas request.'
              : 'Atlas could not complete the request.',
      });
    },
  );
  return app;
}
