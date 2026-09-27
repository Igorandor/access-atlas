export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export interface ApiResult<T = any> {
  data: T;
  status: number;
  console: string[];
  asyncId?: string;
}
type SessionSignal = Pick<BroadcastChannel, 'postMessage' | 'addEventListener'>;
const sessionSignal = 'atlas-session-changed';
function sessionChannel(): SessionSignal | undefined {
  try {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined')
      return new BroadcastChannel('access-atlas-session');
  } catch {
    // Restricted browser contexts can expose the API but forbid opening it.
    // Same-tab generation protection must remain available in those contexts.
  }
  return undefined;
}

export class AtlasConnection {
  private token = '';
  private generation = 0;
  constructor(
    private channel: SessionSignal | undefined = sessionChannel(),
    private notifySessionEnded: () => void = () => window.dispatchEvent(new Event('session-ended')),
  ) {
    this.channel?.addEventListener('message', (event) => {
      if (event.data !== sessionSignal) return;
      this.endSession();
      this.notifySessionEnded();
    });
  }
  currentGeneration() {
    return this.generation;
  }
  requireGeneration(expected: number) {
    if (expected !== this.generation)
      throw new RequestError(
        'A response from an earlier Atlas session was discarded. Nothing was retried.',
        409,
      );
  }
  private endSession(announce = false) {
    this.token = '';
    this.generation++;
    if (announce) this.channel?.postMessage(sessionSignal);
  }
  private rejectSession(resource: string, status: number) {
    if (status === 401 && !['login', 'session'].includes(resource)) {
      this.endSession(true);
      this.notifySessionEnded();
    }
  }
  async send<T>(resource: string, payload?: unknown): Promise<T> {
    const generation = this.generation;
    const options: RequestInit =
      payload === undefined
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.token },
            body: JSON.stringify(payload),
          };
    const response = await fetch('/api/' + resource, options);
    this.requireGeneration(generation);
    let document: any;
    try {
      document = await response.json();
    } catch {
      this.requireGeneration(generation);
      this.rejectSession(resource, response.status);
      throw new RequestError('Atlas received an unreadable gateway reply.', response.status);
    }
    this.requireGeneration(generation);
    if (!response.ok) {
      this.rejectSession(resource, response.status);
      throw new RequestError(
        document?.error || 'Atlas could not complete this request.',
        response.status,
      );
    }
    if (typeof document?.csrf === 'string') {
      // StrictMode may run initial session discovery twice. Adopting the same
      // existing session is not a login boundary and must not stale its sibling read.
      if (resource === 'session' && this.token && document.csrf !== this.token)
        throw new RequestError('The discovered Atlas session changed. Sign in again.', 409);
      if (resource === 'login') this.generation++;
      this.token = document.csrf;
    }
    if (resource === 'login') this.channel?.postMessage(sessionSignal);
    if (resource === 'logout') this.endSession(true);
    return document;
  }
}
const connection = new AtlasConnection();
export const request = <T = any>(resource: string, payload?: unknown) =>
  connection.send<T>(resource, payload);
export async function iris<T = any>(
  path: string,
  query: Record<string, string> = {},
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' = 'GET',
  body?: Record<string, any>,
): Promise<ApiResult<T>> {
  const generation = connection.currentGeneration();
  const initial = await request<ApiResult<T>>('iris', { path, query, method, body });
  if (!initial.asyncId) return initial;
  for (let remaining = 20; remaining > 0; remaining--) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    connection.requireGeneration(generation);
    const job = await request<ApiResult>('iris', {
      path: '/v2/async-result',
      method: 'GET',
      query: { id: initial.asyncId },
    });
    switch (job.data?.State) {
      case 'Finished':
        return { data: job.data.Result, console: job.data.Console ?? [], status: job.status };
      case 'Failed':
      case 'Paused':
      case 'Canceled':
        throw new RequestError(
          'The native job stopped: ' + (job.data.FailureReason || job.data.State),
          422,
        );
    }
  }
  throw new RequestError(
    'Job ' +
      initial.asyncId +
      ' is still running. Inspect its state before repeating this operation.',
    202,
  );
}
export function download(filename: string, value: unknown) {
  const objectUrl = URL.createObjectURL(
    new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], {
      type: typeof value === 'string' ? 'text/plain;charset=utf-8' : 'application/json',
    }),
  );
  const link = Object.assign(document.createElement('a'), { href: objectUrl, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
