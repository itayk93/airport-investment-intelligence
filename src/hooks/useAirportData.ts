import { useEffect, useState } from 'react';
import { fetchAirportData } from '../api/client';
import type { AirportDataResponse } from '../api/types';

export function useAirportData() {
  const [data, setData] = useState<AirportDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchAirportData(controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load scores');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return { data, error, loading };
}
