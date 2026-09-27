import { useEffect, useReducer, useState } from 'react';
import { iris, RequestError } from './api';
export function useData<T = any>(path: string, query: Record<string, string> = {}, interval = 0) {
  const signature = JSON.stringify(query);
  const key = JSON.stringify([path, signature]);
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  const [state, update] = useState<{
    key: string;
    data?: T;
    error: string;
    loading: boolean;
    at?: Date;
  }>({
    key,
    error: '',
    loading: !!path,
  });
  useEffect(() => {
    let disposed = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    update((previous) =>
      path && previous.key === key
        ? { ...previous, error: '', loading: true }
        : { key, error: '', loading: !!path },
    );
    async function read() {
      if (disposed || !path) return;
      update((previous) => ({ ...previous, loading: true }));
      try {
        const response = await iris<T>(path, JSON.parse(signature));
        if (!disposed)
          update({ key, data: response.data, error: '', loading: false, at: new Date() });
      } catch (error) {
        if (!disposed)
          update((previous) =>
            error instanceof RequestError && error.status === 403
              ? { key, error: error.message, loading: false }
              : { ...previous, error: (error as Error).message, loading: false },
          );
      } finally {
        if (!disposed && interval) timer = setTimeout(visibleSample, interval);
      }
    }
    function visibleSample() {
      if (disposed) return;
      if (document.hidden) timer = setTimeout(visibleSample, interval);
      else void read();
    }
    void read();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [path, signature, revision, interval]);
  // Effects run after render. Never relabel the previous source while its new read starts.
  const current =
    path && state.key === key
      ? state
      : { error: '', loading: !!path, data: undefined, at: undefined };
  return {
    data: current.data,
    error: current.error,
    loading: current.loading,
    at: current.at,
    refresh,
  };
}
