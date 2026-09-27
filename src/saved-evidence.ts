import { request, RequestError } from './api';

type EvidenceRead<T> = {
  current: () => boolean;
  received: (value: T) => void;
  refused: () => void;
  failed: (message: string) => void;
};

/** Refresh saved evidence without turning a temporary failure into loss of the current view. */
export async function refreshEvidence<T>(
  resource: string,
  handlers: EvidenceRead<T>,
  transport: typeof request = request,
): Promise<void> {
  try {
    const value = await transport<T>(resource);
    if (handlers.current()) handlers.received(value);
  } catch (failure) {
    if (!handlers.current()) return;
    if (failure instanceof RequestError && failure.status === 403) handlers.refused();
    handlers.failed((failure as Error).message);
  }
}
