import { useCallback, useEffect, useState } from 'react';
import { fetchLogs } from '../services/supabase.js';

/**
 * Reads the matix_content_publishing_logs table. Auto-polls every 10s while the
 * consuming component is mounted so new entries (written by n8n) appear without a
 * manual refresh. `refresh()` is also exposed for the page-level Refresh button.
 */
export function useLogs({ pollMs = 10000, limit = 200 } = {}) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchLogs({ limit });
      setLogs(data);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!pollMs) return;
    const i = setInterval(refresh, pollMs);
    return () => clearInterval(i);
  }, [refresh, pollMs]);

  return { logs, loading, error, refresh };
}
