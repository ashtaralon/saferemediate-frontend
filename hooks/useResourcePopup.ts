/**
 * useResourcePopup Hook
 *
 * Fetches resource popup data from the backend API with:
 * - Loading and error states
 * - Request cancellation
 * - Caching support
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ResourcePopupResponse } from '@/types/template-types';

// Backend API URL - configure based on environment
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://saferemediate-backend-f.onrender.com';

export interface UseResourcePopupOptions {
  resourceId: string | null;
  systemName?: string;
  evidenceWindow?: '7d' | '30d' | '90d';
  autoFetch?: boolean;
}

export interface UseResourcePopupReturn {
  data: ResourcePopupResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Simple cache for resource popup data
const popupCache = new Map<string, { data: ResourcePopupResponse; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

function getCacheKey(resourceId: string, systemName?: string): string {
  return `${resourceId}:${systemName || ''}`;
}

export function useResourcePopup({
  resourceId,
  systemName,
  evidenceWindow = '30d',
  autoFetch = true,
}: UseResourcePopupOptions): UseResourcePopupReturn {
  const [data, setData] = useState<ResourcePopupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!resourceId) {
      setData(null);
      return;
    }

    // Check cache first
    const cacheKey = getCacheKey(resourceId, systemName);
    const cached = popupCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setData(cached.data);
      setLoading(false);
      setError(null);
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (systemName) params.append('system_name', systemName);
      params.append('evidence_window', evidenceWindow);

      const url = `${API_BASE_URL}/api/resource-popup/${encodeURIComponent(resourceId)}?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.error || `Failed to fetch resource: ${response.statusText}`);
      }

      const responseData = await response.json();

      setData(responseData);
      setError(null);

      // Cache the result
      popupCache.set(cacheKey, {
        data: responseData,
        timestamp: Date.now(),
      });

      // Limit cache size
      if (popupCache.size > 50) {
        const oldestKey = popupCache.keys().next().value;
        if (oldestKey) popupCache.delete(oldestKey);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;

      setError(err.message || 'Failed to fetch resource popup data');
      console.error('Resource popup fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [resourceId, systemName, evidenceWindow]);

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData, autoFetch]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
  };
}

export default useResourcePopup;
