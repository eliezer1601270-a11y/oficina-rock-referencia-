import { QuotaSyncStatus } from '../types';

export const QUOTA_BANNER_MESSAGE =
  'Limite diário de acesso ao servidor atingido. O aplicativo está em modo apenas leitura — novas alterações não serão salvas até a renovação da cota (aprox. 04h00).';

export const QUOTA_WRITE_BLOCK_MESSAGE =
  'Savamento temporariamente indisponível devido ao limite de acesso ao servidor.';

export class QuotaWriteBlockedError extends Error {
  readonly code = 'resource-exhausted';
  constructor(message = QUOTA_WRITE_BLOCK_MESSAGE) {
    super(message);
    this.name = 'QuotaWriteBlockedError';
  }
}

export function extractErrorMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message || '');
  }
  return String(err);
}

export function extractErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code: unknown }).code || '').toLowerCase();
  }
  return '';
}

export function extractErrorStatus(err: unknown): number | null {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const num = Number((err as { status: unknown }).status);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function isQuotaError(err: unknown): boolean {
  const code = extractErrorCode(err);
  const status = extractErrorStatus(err);
  const msg = extractErrorMessage(err).toLowerCase();
  return (
    status === 429 ||
    code === '429' ||
    code.includes('resource-exhausted') ||
    code.includes('quota-exceeded') ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota exceeded') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('free daily read units') ||
    msg.includes('http 429')
  );
}

export function isOfflineOrNetworkError(err: unknown): boolean {
  const code = extractErrorCode(err);
  const msg = extractErrorMessage(err).toLowerCase();
  return (
    code.includes('unavailable') ||
    msg.includes('unavailable') ||
    msg.includes('client is offline') ||
    msg.includes('failed to get document because the client is offline') ||
    msg.includes('network-request-failed') ||
    msg.includes('network error')
  );
}

export function isPermissionOrAuthError(err: unknown): boolean {
  const code = extractErrorCode(err);
  const msg = extractErrorMessage(err).toLowerCase();
  return (
    code.includes('permission-denied') ||
    code.includes('unauthenticated') ||
    msg.includes('permission-denied') ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('unauthenticated')
  );
}

export function computeBackoffMs(
  attempt: number,
  baseMs = 1500,
  maxMs = 60_000
): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt)));
  return Math.round(exp);
}

export interface QuotaCircuitBreaker {
  getStatus: () => QuotaSyncStatus;
  isBlocked: () => boolean;
  trip: (err: unknown) => QuotaSyncStatus;
  reset: () => QuotaSyncStatus;
  subscribe: (listener: (status: QuotaSyncStatus) => void) => () => void;
}

const QUOTA_STORAGE_KEY = 'oficina_firestore_quota_until_v1';

export function createQuotaCircuitBreaker(options?: {
  cooldownMs?: number;
  persistInStorage?: boolean;
}): QuotaCircuitBreaker {
  const cooldownMs = options?.cooldownMs ?? 30 * 60 * 1000;
  const persistInStorage = options?.persistInStorage ?? true;
  const listeners = new Set<(status: QuotaSyncStatus) => void>();

  let blockedUntilMs = 0;
  let reason = '';

  if (persistInStorage && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { until?: number; reason?: string };
        if (parsed.until && parsed.until > Date.now()) {
          blockedUntilMs = parsed.until;
          reason = parsed.reason || QUOTA_BANNER_MESSAGE;
        } else {
          localStorage.removeItem(QUOTA_STORAGE_KEY);
        }
      }
    } catch {
      // Ignore storage read issues
    }
  }

  const getStatus = (): QuotaSyncStatus => {
    const now = Date.now();
    const blocked = blockedUntilMs > now;
    if (!blocked && blockedUntilMs > 0) {
      blockedUntilMs = 0;
      reason = '';
    }
    return {
      blocked,
      blockedUntilMs: blocked ? blockedUntilMs : 0,
      reason: blocked ? reason : undefined,
    };
  };

  const emit = () => {
    const snap = getStatus();
    listeners.forEach((fn) => {
      try {
        fn(snap);
      } catch {
        // Ignore subscriber error
      }
    });
  };

  const trip = (err: unknown): QuotaSyncStatus => {
    const now = Date.now();
    const nextUntil = now + cooldownMs;
    const nextReason = isQuotaError(err)
      ? QUOTA_BANNER_MESSAGE
      : 'Sincronização temporariamente pausada para preservar conexões.';

    const shouldNotify = blockedUntilMs <= now;
    blockedUntilMs = Math.max(blockedUntilMs, nextUntil);
    reason = nextReason;

    if (persistInStorage && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          QUOTA_STORAGE_KEY,
          JSON.stringify({ until: blockedUntilMs, reason })
        );
      } catch {
        // Ignore storage write issues
      }
    }
    if (shouldNotify) emit();
    return getStatus();
  };

  const reset = (): QuotaSyncStatus => {
    const wasBlocked = blockedUntilMs > Date.now();
    blockedUntilMs = 0;
    reason = '';
    if (persistInStorage && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(QUOTA_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
    }
    if (wasBlocked) emit();
    return getStatus();
  };

  const subscribe = (listener: (status: QuotaSyncStatus) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    getStatus,
    isBlocked: () => getStatus().blocked,
    trip,
    reset,
    subscribe,
  };
}

export interface RequestDeduplicator {
  run: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
  runWithTtl: <T>(key: string, ttlMs: number, fn: () => Promise<T>) => Promise<T>;
  invalidate: (keyPrefix?: string) => void;
  inFlightCount: () => number;
}

export function createRequestDeduplicator(): RequestDeduplicator {
  const inFlight = new Map<string, Promise<unknown>>();
  const cache = new Map<string, { expiresAt: number; value: unknown }>();

  const run = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const existing = inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = fn().finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  };

  const runWithTtl = async <T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>
  ): Promise<T> => {
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    const result = await run(key, fn);
    cache.set(key, { expiresAt: Date.now() + ttlMs, value: result });
    return result;
  };

  const invalidate = (keyPrefix?: string) => {
    if (!keyPrefix) {
      cache.clear();
      return;
    }
    Array.from(cache.keys()).forEach((k) => {
      if (k.startsWith(keyPrefix)) cache.delete(k);
    });
  };

  return {
    run,
    runWithTtl,
    invalidate,
    inFlightCount: () => inFlight.size,
  };
}

export function paginateList<T>(
  items: T[],
  pageSize: number,
  pageCount: number
): { visibleItems: T[]; hasMore: boolean; remainingCount: number } {
  const safeSize = Math.max(1, pageSize);
  const safePages = Math.max(1, pageCount);
  const limitCount = safeSize * safePages;
  const visibleItems = items.slice(0, limitCount);
  const remainingCount = Math.max(0, items.length - visibleItems.length);
  return {
    visibleItems,
    hasMore: remainingCount > 0,
    remainingCount,
  };
}
