import { telemetryMonitor } from './telemetryMonitor';

export type CacheDomain = 'public' | 'cadastral' | 'finance' | 'private';
export type CacheScope = 'public' | 'member' | 'board' | 'admin';

export interface CachedDatasetRecord<T = unknown> {
  fullKey: string;
  domain: CacheDomain;
  key: string;
  scope: CacheScope;
  ownerUid?: string;
  version: string;
  updatedAt: number;
  expiresAt: number;
  sha256: string;
  syncStatus: 'fresh' | 'stale' | 'local_only';
  payload: T;
}

export interface CachedDocumentVersionEntry {
  version: string;
  updatedAt: number;
  sizeBytes: number;
  sha256: string;
  updatedByName?: string;
  dataUrl?: string;
  payload?: unknown;
}

export interface CachedDocumentRecord {
  docKey: string;
  kind: 'clubDocument' | 'governance';
  id: string;
  title: string;
  version: string;
  updatedAt: number;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  dataUrl?: string;
  payload?: unknown;
  history: CachedDocumentVersionEntry[];
}

export interface StoredBackupSnapshotRecord {
  id: string;
  kind: 'full' | 'incremental' | 'pre_restore_safety';
  createdAt: string;
  createdByUid: string;
  createdByName: string;
  sha256: string;
  sizeBytes: number;
  syncStatus: 'synced_r2' | 'local_only' | 'queued_offline';
  remoteKey?: string;
  lastError?: string;
  retryCount: number;
  manifest: {
    feesCount: number;
    tabsCount: number;
    expensesCount: number;
    usersCount: number;
    boardRolesCount: number;
    changedKeys?: string[];
  };
  payload: Record<string, unknown>;
}

export interface IndexedDbCacheStats {
  backend: 'indexeddb' | 'memory_fallback';
  datasetsCount: number;
  publicDatasetsCount: number;
  privateDatasetsCount: number;
  documentsCount: number;
  documentsBytes: number;
  backupsCount: number;
  pendingBackupsCount: number;
}

const DB_NAME = 'oficina_do_rock_cache_v1';
const DB_VERSION = 1;
const STORE_DATASETS = 'datasets';
const STORE_DOCUMENTS = 'documents';
const STORE_BACKUPS = 'backups';
const MAX_VERSION_HISTORY = 6;

// Fallback storage for non-browser environments (Node/CLI test scripts)
const memoryDatasets = new Map<string, CachedDatasetRecord<unknown>>();
const memoryDocuments = new Map<string, CachedDocumentRecord>();
const memoryBackups = new Map<string, StoredBackupSnapshotRecord>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

export async function computeSha256(raw: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoded = new TextEncoder().encode(raw);
      const digest = await crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fall through to deterministic FNV-1a multi-lane digest when WebCrypto subtle is absent
  }

  // Deterministic 64-hex digest fallback when subtle crypto is unavailable (e.g. insecure localhost HTTP context)
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca77) >>> 0;
    h3 = Math.imul(h3 ^ (c << 3), 0xc2b2ae3d) >>> 0;
    h4 = Math.imul(h4 ^ (c ^ (i & 0xff)), 0x27d4eb2f) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}${hex(h1 ^ h3)}${hex(h2 ^ h4)}${hex(raw.length >>> 0)}${hex((h1 + h2 + h3 + h4) >>> 0)}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_DATASETS)) {
          db.createObjectStore(STORE_DATASETS, { keyPath: 'fullKey' });
        }
        if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
          db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'docKey' });
        }
        if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
          db.createObjectStore(STORE_BACKUPS, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  if (!hasIndexedDb()) return null;
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbPut<T>(storeName: string, value: T): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Non-fatal cache write failure (quota/private mode)
  }
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore
  }
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  if (!hasIndexedDb()) return [];
  try {
    const db = await openDb();
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export const IndexedDbCache = {
  buildDatasetKey(domain: CacheDomain, key: string, ownerUid?: string): string {
    return ownerUid ? `${domain}:${ownerUid}:${key}` : `${domain}:${key}`;
  },

  async setDataset<T>(params: {
    domain: CacheDomain;
    key: string;
    scope: CacheScope;
    payload: T;
    ttlMs: number;
    version?: string;
    ownerUid?: string;
  }): Promise<CachedDatasetRecord<T>> {
    const fullKey = this.buildDatasetKey(params.domain, params.key, params.ownerUid);
    const serialized = JSON.stringify(params.payload ?? null);
    const sha256 = await computeSha256(serialized);
    const now = Date.now();
    const record: CachedDatasetRecord<T> = {
      fullKey,
      domain: params.domain,
      key: params.key,
      scope: params.scope,
      ownerUid: params.ownerUid,
      version: params.version || new Date(now).toISOString(),
      updatedAt: now,
      expiresAt: now + Math.max(0, params.ttlMs),
      sha256,
      syncStatus: 'fresh',
      payload: params.payload,
    };

    memoryDatasets.set(fullKey, record as CachedDatasetRecord<unknown>);
    await idbPut(STORE_DATASETS, record);
    return record;
  },

  async getDataset<T>(params: {
    domain: CacheDomain;
    key: string;
    ownerUid?: string;
    allowExpired?: boolean;
  }): Promise<CachedDatasetRecord<T> | null> {
    const fullKey = this.buildDatasetKey(params.domain, params.key, params.ownerUid);
    const mem = memoryDatasets.get(fullKey) as CachedDatasetRecord<T> | undefined;
    if (mem) {
      if (params.allowExpired || Date.now() <= mem.expiresAt) {
        return mem;
      }
      return { ...mem, syncStatus: 'stale' };
    }

    const stored = await idbGet<CachedDatasetRecord<T>>(STORE_DATASETS, fullKey);
    if (!stored) return null;

    // Verify owner boundary before returning private datasets
    if (stored.scope !== 'public' && params.ownerUid && stored.ownerUid && stored.ownerUid !== params.ownerUid) {
      return null;
    }

    const isFresh = Date.now() <= stored.expiresAt;
    const normalized: CachedDatasetRecord<T> = {
      ...stored,
      syncStatus: isFresh ? 'fresh' : 'stale',
    };
    memoryDatasets.set(fullKey, normalized as CachedDatasetRecord<unknown>);
    return params.allowExpired || isFresh ? normalized : null;
  },

  async isDatasetFresh(domain: CacheDomain, key: string, ownerUid?: string): Promise<boolean> {
    const rec = await this.getDataset({ domain, key, ownerUid, allowExpired: true });
    return Boolean(rec && rec.syncStatus === 'fresh' && Date.now() <= rec.expiresAt);
  },

  /**
   * Immediately purges ALL private, cadastral PII, and financial dataset caches as well as
   * restricted document binaries on logout, account switch, or role revocation.
   */
  async clearPrivateCaches(): Promise<void> {
    for (const [k, rec] of Array.from(memoryDatasets.entries())) {
      if (rec.domain !== 'public' || rec.scope !== 'public') {
        memoryDatasets.delete(k);
      }
    }
    for (const [k, docRec] of Array.from(memoryDocuments.entries())) {
      if (docRec.kind === 'clubDocument' || docRec.kind === 'governance') {
        memoryDocuments.delete(k);
      }
    }

    if (hasIndexedDb()) {
      const allDatasets = await idbGetAll<CachedDatasetRecord<unknown>>(STORE_DATASETS);
      for (const ds of allDatasets) {
        if (ds.domain !== 'public' || ds.scope !== 'public') {
          await idbDelete(STORE_DATASETS, ds.fullKey);
        }
      }
      const allDocs = await idbGetAll<CachedDocumentRecord>(STORE_DOCUMENTS);
      for (const d of allDocs) {
        if (d.kind === 'clubDocument' || d.kind === 'governance') {
          await idbDelete(STORE_DOCUMENTS, d.docKey);
        }
      }
    }
  },

  // --- Permanent Offline Document & Governance Cache with Version History + Rollback ---

  async cacheDocumentBinary(params: {
    kind: 'clubDocument' | 'governance';
    id: string;
    title: string;
    mimeType: string;
    version: string;
    dataUrl?: string;
    payload?: unknown;
    updatedByName?: string;
  }): Promise<CachedDocumentRecord> {
    const docKey = `${params.kind}:${params.id}`;
    const rawContent = params.dataUrl || JSON.stringify(params.payload ?? null);
    const sha256 = await computeSha256(rawContent);
    const sizeBytes = rawContent.length;
    const now = Date.now();

    const existing =
      memoryDocuments.get(docKey) || (await idbGet<CachedDocumentRecord>(STORE_DOCUMENTS, docKey));

    let nextHistory: CachedDocumentVersionEntry[] = existing?.history ? [...existing.history] : [];

    // Push prior version into history only if content/hash actually changed
    if (existing && existing.sha256 !== sha256) {
      const previousEntry: CachedDocumentVersionEntry = {
        version: existing.version,
        updatedAt: existing.updatedAt,
        sizeBytes: existing.sizeBytes,
        sha256: existing.sha256,
        dataUrl: existing.dataUrl,
        payload: existing.payload,
      };
      nextHistory = [
        previousEntry,
        ...nextHistory.filter((h) => h.sha256 !== previousEntry.sha256),
      ].slice(0, MAX_VERSION_HISTORY);
    }

    const record: CachedDocumentRecord = {
      docKey,
      kind: params.kind,
      id: params.id,
      title: params.title,
      version: params.version,
      updatedAt: now,
      sizeBytes,
      sha256,
      mimeType: params.mimeType,
      dataUrl: params.dataUrl,
      payload: params.payload,
      history: nextHistory,
    };

    memoryDocuments.set(docKey, record);
    await idbPut(STORE_DOCUMENTS, record);
    return record;
  },

  async getCachedDocument(
    kind: 'clubDocument' | 'governance',
    id: string
  ): Promise<CachedDocumentRecord | null> {
    const docKey = `${kind}:${id}`;
    const mem = memoryDocuments.get(docKey);
    if (mem) return mem;

    const stored = await idbGet<CachedDocumentRecord>(STORE_DOCUMENTS, docKey);
    if (stored) {
      memoryDocuments.set(docKey, stored);
    }
    return stored;
  },

  async rollbackCachedDocument(
    kind: 'clubDocument' | 'governance',
    id: string,
    targetSha256: string
  ): Promise<CachedDocumentRecord | null> {
    const existing = await this.getCachedDocument(kind, id);
    if (!existing) return null;

    const target = existing.history.find((h) => h.sha256 === targetSha256);
    if (!target) return null;

    return this.cacheDocumentBinary({
      kind,
      id,
      title: existing.title,
      mimeType: existing.mimeType,
      version: `${target.version} (rollback)`,
      dataUrl: target.dataUrl,
      payload: target.payload,
    });
  },

  async listCachedDocuments(kind?: 'clubDocument' | 'governance'): Promise<CachedDocumentRecord[]> {
    const all = hasIndexedDb()
      ? await idbGetAll<CachedDocumentRecord>(STORE_DOCUMENTS)
      : Array.from(memoryDocuments.values());
    return kind ? all.filter((d) => d.kind === kind) : all;
  },

  // --- Backup Snapshots & Offline Retry Queue ---

  async saveBackupSnapshot(snapshot: StoredBackupSnapshotRecord): Promise<void> {
    memoryBackups.set(snapshot.id, snapshot);
    await idbPut(STORE_BACKUPS, snapshot);
  },

  async getBackupSnapshot(id: string): Promise<StoredBackupSnapshotRecord | null> {
    const mem = memoryBackups.get(id);
    if (mem) return mem;
    const stored = await idbGet<StoredBackupSnapshotRecord>(STORE_BACKUPS, id);
    if (stored) memoryBackups.set(id, stored);
    return stored;
  },

  async listBackupSnapshots(): Promise<StoredBackupSnapshotRecord[]> {
    const list = hasIndexedDb()
      ? await idbGetAll<StoredBackupSnapshotRecord>(STORE_BACKUPS)
      : Array.from(memoryBackups.values());
    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async deleteBackupSnapshot(id: string): Promise<void> {
    memoryBackups.delete(id);
    await idbDelete(STORE_BACKUPS, id);
  },

  async getStorageStats(): Promise<IndexedDbCacheStats> {
    const datasets = hasIndexedDb()
      ? await idbGetAll<CachedDatasetRecord<unknown>>(STORE_DATASETS)
      : Array.from(memoryDatasets.values());
    const docs = hasIndexedDb()
      ? await idbGetAll<CachedDocumentRecord>(STORE_DOCUMENTS)
      : Array.from(memoryDocuments.values());
    const backups = hasIndexedDb()
      ? await idbGetAll<StoredBackupSnapshotRecord>(STORE_BACKUPS)
      : Array.from(memoryBackups.values());

    return {
      backend: hasIndexedDb() ? 'indexeddb' : 'memory_fallback',
      datasetsCount: datasets.length,
      publicDatasetsCount: datasets.filter((d) => d.domain === 'public').length,
      privateDatasetsCount: datasets.filter((d) => d.domain !== 'public').length,
      documentsCount: docs.length,
      documentsBytes: docs.reduce((sum, d) => sum + (d.sizeBytes || 0), 0),
      backupsCount: backups.length,
      pendingBackupsCount: backups.filter((b) => b.syncStatus === 'queued_offline').length,
    };
  },

  recordCacheHit(layer: 'memory' | 'indexeddb', module: string, estimatedReadsSaved = 1, detail?: string): void {
    telemetryMonitor.recordCacheHit(layer, module, estimatedReadsSaved, detail);
  },
};
