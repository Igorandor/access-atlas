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
class AtlasConnection {
  private token = '';
  async send<T>(resource: string, payload?: unknown): Promise<T> {
    const options: RequestInit =
      payload === undefined
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.token },
            body: JSON.stringify(payload),
          };
    const response = await fetch('/api/' + resource, options);
    let document: any;
    try {
      document = await response.json();
    } catch {
      throw new RequestError('Atlas received an unreadable gateway reply.', response.status);
    }
    if (!response.ok) {
      if (response.status === 401 && !['login', 'session'].includes(resource))
        window.dispatchEvent(new Event('session-ended'));
      throw new RequestError(
        document?.error || 'Atlas could not complete this request.',
        response.status,
      );
    }
    if (typeof document?.csrf === 'string') this.token = document.csrf;
    if (resource === 'logout') this.token = '';
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
  const initial = await request<ApiResult<T>>('iris', { path, query, method, body });
  if (!initial.asyncId) return initial;
  for (let remaining = 20; remaining > 0; remaining--) {
    await new Promise((resolve) => setTimeout(resolve, 700));
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
