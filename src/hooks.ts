import { useEffect, useReducer, useState } from 'react';
import { iris } from './api';
export function useData<T = any>(path: string, query: Record<string, string> = {}, interval = 0) {
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  const [state, update] = useState<{ data?: T; error: string; loading: boolean; at?: Date }>({
    error: '',
    loading: !!path,
  });
  const signature = JSON.stringify(query);
  useEffect(() => {
    let disposed = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    update({ error: '', loading: !!path });
    async function read() {
      if (disposed || !path) return;
      update((previous) => ({ ...previous, loading: true }));
      try {
        const response = await iris<T>(path, JSON.parse(signature));
        if (!disposed) update({ data: response.data, error: '', loading: false, at: new Date() });
      } catch (error) {
        if (!disposed)
          update((previous) => ({ ...previous, error: (error as Error).message, loading: false }));
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
  return { ...state, refresh };
}
