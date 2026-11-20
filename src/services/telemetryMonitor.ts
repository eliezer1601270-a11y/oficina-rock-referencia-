export type TelemetryReadContext =
  | 'startup'
  | 'login'
  | 'auth'
  | 'section'
  | 'tab_switch'
  | 'document_open'
  | 'manual'
  | 'listener';

export interface TelemetryEventEntry {
  id: string;
  timestamp: string;
  kind: 'read' | 'write' | 'cache_hit' | 'read_avoided' | 'dedupe' | 'doc_download' | 'doc_cache_hit' | 'sync_check' | 'error' | 'quota_error' | 'backup';
  module: string;
  context?: TelemetryReadContext;
  count: number;
  detail?: string;
}

export interface TelemetrySnapshot {
  startedAt: string;
  totalReads: number;
  totalWrites: number;
  cacheHitsMemory: number;
  cacheHitsIndexedDb: number;
  readsAvoided: number;
  dedupeBlocked: number;
  documentDownloads: number;
  documentCacheHits: number;
  syncChecks: number;
  connectionErrors: number;
  quotaErrors: number;
  backupSuccessCount: number;
  backupFailureCount: number;
  lastSyncAt: string | null;
  lastSyncReason: string | null;
  readsByModule: Record<string, number>;
  readsByContext: Record<TelemetryReadContext, number>;
  recentEvents: TelemetryEventEntry[];
}

export interface LoadProjection100Members {
  measuredReadsPerSession: number;
  baselineUncachedReadsPerSession: number;
  reductionPercent: number;
  projected100SporadicDailyReads: number;
  projected100SimultaneousBurstReads: number;
  freeTierDailyReadLimit: number;
  estimatedFreeTierHeadroomPercent: number;
}

const MAX_RECENT_EVENTS = 80;

class TelemetryMonitorService {
  private startedAt = new Date().toISOString();
  private totalReads = 0;
  private totalWrites = 0;
  private cacheHitsMemory = 0;
  private cacheHitsIndexedDb = 0;
  private readsAvoided = 0;
  private dedupeBlocked = 0;
  private documentDownloads = 0;
  private documentCacheHits = 0;
  private syncChecks = 0;
  private connectionErrors = 0;
  private quotaErrors = 0;
  private backupSuccessCount = 0;
  private backupFailureCount = 0;
  private lastSyncAt: string | null = null;
  private lastSyncReason: string | null = null;
  private readsByModule: Record<string, number> = {};
  private readsByContext: Record<TelemetryReadContext, number> = {
    startup: 0,
    login: 0,
    auth: 0,
    section: 0,
    tab_switch: 0,
    document_open: 0,
    manual: 0,
    listener: 0,
  };
  private recentEvents: TelemetryEventEntry[] = [];
  private subscribers = new Set<(snapshot: TelemetrySnapshot) => void>();

  private pushEvent(
    kind: TelemetryEventEntry['kind'],
    module: string,
    count: number,
    context?: TelemetryReadContext,
    detail?: string
  ): void {
    const entry: TelemetryEventEntry = {
      id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      kind,
      module,
      context,
      count,
      detail,
    };
    this.recentEvents = [entry, ...this.recentEvents].slice(0, MAX_RECENT_EVENTS);
    this.notify();
  }

  private notify(): void {
    if (this.subscribers.size === 0) return;
    const snap = this.getSnapshot();
    this.subscribers.forEach((cb) => {
      try {
        cb(snap);
      } catch {
        // Isolate subscriber UI errors
      }
    });
  }

  subscribe(cb: (snapshot: TelemetrySnapshot) => void): () => void {
    this.subscribers.add(cb);
    cb(this.getSnapshot());
    return () => {
      this.subscribers.delete(cb);
    };
  }

  recordRead(
    module: string,
    docCount = 1,
    context: TelemetryReadContext = 'listener',
    detail?: string
  ): void {
    const safeCount = Math.max(0, Math.round(docCount));
    if (safeCount === 0) return;
    this.totalReads += safeCount;
    this.readsByModule[module] = (this.readsByModule[module] || 0) + safeCount;
    this.readsByContext[context] = (this.readsByContext[context] || 0) + safeCount;
    this.pushEvent('read', module, safeCount, context, detail);
  }

  recordWrite(module: string, writeCount = 1, detail?: string): void {
    const safeCount = Math.max(1, Math.round(writeCount));
    this.totalWrites += safeCount;
    this.pushEvent('write', module, safeCount, undefined, detail);
  }

  recordCacheHit(
    layer: 'memory' | 'indexeddb',
    module: string,
    estimatedAvoidedReads = 1,
    detail?: string
  ): void {
    if (layer === 'memory') {
      this.cacheHitsMemory += 1;
    } else {
      this.cacheHitsIndexedDb += 1;
    }
    const avoided = Math.max(0, Math.round(estimatedAvoidedReads));
    this.readsAvoided += avoided;
    this.pushEvent('cache_hit', module, avoided || 1, undefined, detail || `Cache ${layer}`);
  }

  recordReadsAvoided(module: string, avoidedCount: number, reason: string): void {
    const safeCount = Math.max(1, Math.round(avoidedCount));
    this.readsAvoided += safeCount;
    this.pushEvent('read_avoided', module, safeCount, undefined, reason);
  }

  recordDedupeBlocked(module: string, estimatedAvoidedReads = 1, reason?: string): void {
    this.dedupeBlocked += 1;
    this.readsAvoided += Math.max(0, Math.round(estimatedAvoidedReads));
    this.pushEvent('dedupe', module, 1, undefined, reason || 'Requisição duplicada bloqueada');
  }

  recordDocumentDownload(docId: string, bytes = 0): void {
    this.documentDownloads += 1;
    this.pushEvent(
      'doc_download',
      'clubDocuments',
      1,
      undefined,
      `Download nuvem (${docId}${bytes ? ` · ${Math.round(bytes / 1024)} KB` : ''})`
    );
  }

  recordDocumentCacheHit(docId: string, bytes = 0): void {
    this.documentCacheHits += 1;
    this.readsAvoided += 1;
    this.pushEvent(
      'doc_cache_hit',
      'clubDocuments',
      1,
      undefined,
      `Abertura offline IndexedDB (${docId}${bytes ? ` · ${Math.round(bytes / 1024)} KB` : ''})`
    );
  }

  recordSyncCheck(reason: string): void {
    this.syncChecks += 1;
    this.lastSyncAt = new Date().toISOString();
    this.lastSyncReason = reason;
    this.pushEvent('sync_check', 'sync', 1, 'manual', reason);
  }

  recordError(module: string, errorMessage: string, isQuota = false): void {
    if (isQuota) {
      this.quotaErrors += 1;
      this.pushEvent('quota_error', module, 1, undefined, errorMessage);
    } else {
      this.connectionErrors += 1;
      this.pushEvent('error', module, 1, undefined, errorMessage);
    }
  }

  recordBackupRun(success: boolean, detail: string): void {
    if (success) {
      this.backupSuccessCount += 1;
    } else {
      this.backupFailureCount += 1;
    }
    this.pushEvent('backup', 'backups', 1, undefined, detail);
  }

  resetSessionCounters(): void {
    this.startedAt = new Date().toISOString();
    this.totalReads = 0;
    this.totalWrites = 0;
    this.cacheHitsMemory = 0;
    this.cacheHitsIndexedDb = 0;
    this.readsAvoided = 0;
    this.dedupeBlocked = 0;
    this.documentDownloads = 0;
    this.documentCacheHits = 0;
    this.syncChecks = 0;
    this.connectionErrors = 0;
    this.quotaErrors = 0;
    this.backupSuccessCount = 0;
    this.backupFailureCount = 0;
    this.readsByModule = {};
    this.readsByContext = {
      startup: 0,
      login: 0,
      auth: 0,
      section: 0,
      tab_switch: 0,
      document_open: 0,
      manual: 0,
      listener: 0,
    };
    this.recentEvents = [];
    this.notify();
  }

  getSnapshot(): TelemetrySnapshot {
    return {
      startedAt: this.startedAt,
      totalReads: this.totalReads,
      totalWrites: this.totalWrites,
      cacheHitsMemory: this.cacheHitsMemory,
      cacheHitsIndexedDb: this.cacheHitsIndexedDb,
      readsAvoided: this.readsAvoided,
      dedupeBlocked: this.dedupeBlocked,
      documentDownloads: this.documentDownloads,
      documentCacheHits: this.documentCacheHits,
      syncChecks: this.syncChecks,
      connectionErrors: this.connectionErrors,
      quotaErrors: this.quotaErrors,
      backupSuccessCount: this.backupSuccessCount,
      backupFailureCount: this.backupFailureCount,
      lastSyncAt: this.lastSyncAt,
      lastSyncReason: this.lastSyncReason,
      readsByModule: { ...this.readsByModule },
      readsByContext: { ...this.readsByContext },
      recentEvents: [...this.recentEvents],
    };
  }

  getProjectionFor100Members(): LoadProjection100Members {
    const measuredReadsPerSession = this.totalReads;
    const uncachedEquivalent = Math.max(measuredReadsPerSession, measuredReadsPerSession + this.readsAvoided);
    const reductionPercent =
      uncachedEquivalent > 0
        ? Math.round(((uncachedEquivalent - measuredReadsPerSession) / uncachedEquivalent) * 1000) / 10
        : 0;

    // Conservative projection based on measured session reads (or realistic 12-read cached floor if zero reads happened yet)
    const perOpenReads = measuredReadsPerSession > 0 ? measuredReadsPerSession : 12;
    const projected100SporadicDailyReads = perOpenReads * 100; // 100 members * 1-2 openings/day cached
    const projected100SimultaneousBurstReads = perOpenReads * 100;
    const freeTierDailyReadLimit = 50_000;
    const headroom = Math.max(
      0,
      Math.round(((freeTierDailyReadLimit - projected100SporadicDailyReads) / freeTierDailyReadLimit) * 1000) / 10
    );

    return {
      measuredReadsPerSession,
      baselineUncachedReadsPerSession: uncachedEquivalent,
      reductionPercent,
      projected100SporadicDailyReads,
      projected100SimultaneousBurstReads,
      freeTierDailyReadLimit,
      estimatedFreeTierHeadroomPercent: headroom,
    };
  }
}

export const telemetryMonitor = new TelemetryMonitorService();
