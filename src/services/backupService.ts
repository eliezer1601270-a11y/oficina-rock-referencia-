import {
  BoardRoleConfig,
  ClubExpense,
  ClubInfo,
  MemberMonthlyFee,
  MemberTabDebt,
  User,
} from '../types';
import { auth } from './firebase';
import {
  IndexedDbCache,
  StoredBackupSnapshotRecord,
  computeSha256,
} from './indexedDbCache';
import { telemetryMonitor } from './telemetryMonitor';

export interface FinancialBackupDataset {
  fees: MemberMonthlyFee[];
  tabs: MemberTabDebt[];
  expenses: ClubExpense[];
  users?: User[];
  boardRoles?: BoardRoleConfig[];
  clubInfo?: Partial<ClubInfo>;
}

export interface BackupRestorePreview {
  snapshotId: string;
  kind: StoredBackupSnapshotRecord['kind'];
  createdAt: string;
  createdByName: string;
  sha256: string;
  checksumValid: boolean;
  newFeesCount: number;
  updatedFeesCount: number;
  newTabsCount: number;
  updatedTabsCount: number;
  newExpensesCount: number;
  updatedExpensesCount: number;
  newUsersCount: number;
  totalRecordsInSnapshot: number;
}

const WORKER_BASE_URL = String(
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_CLOUDFLARE_WORKER_URL || ''
)
  .trim()
  .replace(/\/+$/, '');

function sanitizeUsersForBackup(users: User[] = []): User[] {
  return users.map((u) => {
    const clone = { ...(u as User & { password?: unknown }) };
    delete clone.password;
    return clone as User;
  });
}

function diffById<T extends { id: string }>(
  items: T[],
  previousMap: Map<string, string>
): { changed: T[]; hashes: Record<string, string> } {
  const changed: T[] = [];
  const hashes: Record<string, string> = {};
  for (const item of items) {
    const raw = JSON.stringify(item);
    hashes[item.id] = `${raw.length}:${raw.slice(0, 32)}:${raw.slice(-16)}`;
    if (previousMap.get(item.id) !== hashes[item.id]) {
      changed.push(item);
    }
  }
  return { changed, hashes };
}

export const BackupService = {
  isCloudflareConfigured(): boolean {
    return WORKER_BASE_URL.length > 0;
  },

  getWorkerUrl(): string {
    return WORKER_BASE_URL;
  },

  async createBackupSnapshot(params: {
    kind: StoredBackupSnapshotRecord['kind'];
    dataset: FinancialBackupDataset;
    actor: Pick<User, 'id' | 'name' | 'nickname'>;
  }): Promise<StoredBackupSnapshotRecord> {
    const createdAt = new Date().toISOString();
    const id = `bkp-${params.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cleanUsers = sanitizeUsersForBackup(params.dataset.users || []);

    let payloadData: Record<string, unknown> = {
      schemaVersion: 2,
      kind: params.kind,
      createdAt,
      fees: params.dataset.fees,
      tabs: params.dataset.tabs,
      expenses: params.dataset.expenses,
      users: cleanUsers,
      boardRoles: params.dataset.boardRoles || [],
      clubInfo: params.dataset.clubInfo || undefined,
    };

    let changedKeys: string[] | undefined;

    if (params.kind === 'incremental') {
      const history = await IndexedDbCache.listBackupSnapshots();
      const latestFullOrInc = history.find((b) => b.kind === 'full' || b.kind === 'incremental');
      const prevHashes = new Map<string, string>(
        Object.entries(
          ((latestFullOrInc?.payload as { entityHashes?: Record<string, string> } | undefined)
            ?.entityHashes) || {}
        )
      );

      const feeDiff = diffById(params.dataset.fees, prevHashes);
      const tabDiff = diffById(params.dataset.tabs, prevHashes);
      const expDiff = diffById(params.dataset.expenses, prevHashes);

      changedKeys = [
        ...feeDiff.changed.map((f) => `fee:${f.id}`),
        ...tabDiff.changed.map((t) => `tab:${t.id}`),
        ...expDiff.changed.map((e) => `exp:${e.id}`),
      ];

      payloadData = {
        schemaVersion: 2,
        kind: 'incremental',
        baseSnapshotId: latestFullOrInc?.id || null,
        createdAt,
        fees: feeDiff.changed,
        tabs: tabDiff.changed,
        expenses: expDiff.changed,
        users: cleanUsers,
        entityHashes: {
          ...feeDiff.hashes,
          ...tabDiff.hashes,
          ...expDiff.hashes,
        },
      };
    } else {
      const entityHashes: Record<string, string> = {};
      for (const f of params.dataset.fees) {
        const raw = JSON.stringify(f);
        entityHashes[f.id] = `${raw.length}:${raw.slice(0, 32)}:${raw.slice(-16)}`;
      }
      for (const t of params.dataset.tabs) {
        const raw = JSON.stringify(t);
        entityHashes[t.id] = `${raw.length}:${raw.slice(0, 32)}:${raw.slice(-16)}`;
      }
      for (const e of params.dataset.expenses) {
        const raw = JSON.stringify(e);
        entityHashes[e.id] = `${raw.length}:${raw.slice(0, 32)}:${raw.slice(-16)}`;
      }
      payloadData.entityHashes = entityHashes;
    }

    const serialized = JSON.stringify(payloadData);
    const sha256 = await computeSha256(serialized);
    const sizeBytes = serialized.length;

    const record: StoredBackupSnapshotRecord = {
      id,
      kind: params.kind,
      createdAt,
      createdByUid: params.actor.id,
      createdByName: params.actor.nickname || params.actor.name,
      sha256,
      sizeBytes,
      syncStatus: WORKER_BASE_URL ? 'queued_offline' : 'local_only',
      retryCount: 0,
      manifest: {
        feesCount: Array.isArray(payloadData.fees) ? payloadData.fees.length : 0,
        tabsCount: Array.isArray(payloadData.tabs) ? payloadData.tabs.length : 0,
        expensesCount: Array.isArray(payloadData.expenses) ? payloadData.expenses.length : 0,
        usersCount: cleanUsers.length,
        boardRolesCount: (params.dataset.boardRoles || []).length,
        changedKeys,
      },
      payload: payloadData,
    };

    await IndexedDbCache.saveBackupSnapshot(record);

    if (WORKER_BASE_URL) {
      return this.uploadSnapshotToWorker(record);
    }

    telemetryMonitor.recordBackupRun(true, `Backup local (${params.kind}) SHA-256 ${sha256.slice(0, 12)}`);
    return record;
  },

  async uploadSnapshotToWorker(
    record: StoredBackupSnapshotRecord
  ): Promise<StoredBackupSnapshotRecord> {
    if (!WORKER_BASE_URL) return record;
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline) {
      const queued: StoredBackupSnapshotRecord = {
        ...record,
        syncStatus: 'queued_offline',
        lastError: 'Sem conexão de rede; aguardando envio automático.',
      };
      await IndexedDbCache.saveBackupSnapshot(queued);
      return queued;
    }

    try {
      const token = await auth.currentUser?.getIdToken().catch(() => undefined);
      const response = await fetch(`${WORKER_BASE_URL}/api/backups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': record.id,
          'X-Checksum-SHA256': record.sha256,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id: record.id,
          kind: record.kind,
          createdAt: record.createdAt,
          sha256: record.sha256,
          manifest: record.manifest,
          payload: record.payload,
        }),
      });

      if (!response.ok) {
        const msg = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${msg || 'Falha no Worker R2'}`);
      }

      const data = (await response.json().catch(() => ({}))) as { remoteKey?: string };
      const synced: StoredBackupSnapshotRecord = {
        ...record,
        syncStatus: 'synced_r2',
        remoteKey: data.remoteKey || `backups/${record.id}.json`,
        lastError: undefined,
      };
      await IndexedDbCache.saveBackupSnapshot(synced);
      telemetryMonitor.recordBackupRun(true, `Backup R2 concluído (${record.id})`);
      return synced;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar backup para R2';
      const queued: StoredBackupSnapshotRecord = {
        ...record,
        syncStatus: 'queued_offline',
        retryCount: record.retryCount + 1,
        lastError: msg,
      };
      await IndexedDbCache.saveBackupSnapshot(queued);
      telemetryMonitor.recordBackupRun(false, msg);
      return queued;
    }
  },

  async flushOfflineQueue(): Promise<{ synced: number; remaining: number }> {
    if (!WORKER_BASE_URL) return { synced: 0, remaining: 0 };
    const list = await IndexedDbCache.listBackupSnapshots();
    const pending = list.filter((b) => b.syncStatus === 'queued_offline');
    let synced = 0;
    for (const item of pending) {
      const updated = await this.uploadSnapshotToWorker(item);
      if (updated.syncStatus === 'synced_r2') {
        synced += 1;
      }
    }
    const after = await IndexedDbCache.listBackupSnapshots();
    return {
      synced,
      remaining: after.filter((b) => b.syncStatus === 'queued_offline').length,
    };
  },

  async previewRestore(
    snapshot: StoredBackupSnapshotRecord,
    currentDataset: FinancialBackupDataset
  ): Promise<BackupRestorePreview> {
    const serialized = JSON.stringify(snapshot.payload ?? {});
    const computedSha = await computeSha256(serialized);
    const checksumValid = computedSha === snapshot.sha256;

    const snapFees = Array.isArray(snapshot.payload.fees)
      ? (snapshot.payload.fees as MemberMonthlyFee[])
      : [];
    const snapTabs = Array.isArray(snapshot.payload.tabs)
      ? (snapshot.payload.tabs as MemberTabDebt[])
      : [];
    const snapExpenses = Array.isArray(snapshot.payload.expenses)
      ? (snapshot.payload.expenses as ClubExpense[])
      : [];
    const snapUsers = Array.isArray(snapshot.payload.users)
      ? (snapshot.payload.users as User[])
      : [];

    const existingFeeIds = new Set(currentDataset.fees.map((f) => f.id));
    const existingTabIds = new Set(currentDataset.tabs.map((t) => t.id));
    const existingExpIds = new Set(currentDataset.expenses.map((e) => e.id));
    const existingUserIds = new Set((currentDataset.users || []).map((u) => u.id));

    return {
      snapshotId: snapshot.id,
      kind: snapshot.kind,
      createdAt: snapshot.createdAt,
      createdByName: snapshot.createdByName,
      sha256: snapshot.sha256,
      checksumValid,
      newFeesCount: snapFees.filter((f) => !existingFeeIds.has(f.id)).length,
      updatedFeesCount: snapFees.filter((f) => existingFeeIds.has(f.id)).length,
      newTabsCount: snapTabs.filter((t) => !existingTabIds.has(t.id)).length,
      updatedTabsCount: snapTabs.filter((t) => existingTabIds.has(t.id)).length,
      newExpensesCount: snapExpenses.filter((e) => !existingExpIds.has(e.id)).length,
      updatedExpensesCount: snapExpenses.filter((e) => existingExpIds.has(e.id)).length,
      newUsersCount: snapUsers.filter((u) => !existingUserIds.has(u.id)).length,
      totalRecordsInSnapshot:
        snapFees.length + snapTabs.length + snapExpenses.length + snapUsers.length,
    };
  },

  /**
   * Executes restore idempotently, ALWAYS creating a pre-restore safety backup first.
   * Never mutates existing member UIDs.
   */
  async executeSafeRestore(params: {
    snapshot: StoredBackupSnapshotRecord;
    currentDataset: FinancialBackupDataset;
    actor: Pick<User, 'id' | 'name' | 'nickname'>;
    mode: 'merge_preserve' | 'restore_financial_snapshot';
    applyRestored: (next: {
      fees: MemberMonthlyFee[];
      tabs: MemberTabDebt[];
      expenses: ClubExpense[];
      safetyBackup: StoredBackupSnapshotRecord;
    }) => Promise<void> | void;
  }): Promise<{
    safetyBackup: StoredBackupSnapshotRecord;
    mergedFeesCount: number;
    mergedTabsCount: number;
    mergedExpensesCount: number;
  }> {
    // Verify integrity before modifying anything
    const serialized = JSON.stringify(params.snapshot.payload ?? {});
    const computedSha = await computeSha256(serialized);
    if (computedSha !== params.snapshot.sha256) {
      throw new Error(
        'Falha na verificação de integridade SHA-256 do backup selecionado. Restauração cancelada.'
      );
    }

    // Step 1: Mandatory safety backup BEFORE restoring
    const safetyBackup = await this.createBackupSnapshot({
      kind: 'pre_restore_safety',
      dataset: params.currentDataset,
      actor: params.actor,
    });

    const snapFees = Array.isArray(params.snapshot.payload.fees)
      ? (params.snapshot.payload.fees as MemberMonthlyFee[])
      : [];
    const snapTabs = Array.isArray(params.snapshot.payload.tabs)
      ? (params.snapshot.payload.tabs as MemberTabDebt[])
      : [];
    const snapExpenses = Array.isArray(params.snapshot.payload.expenses)
      ? (params.snapshot.payload.expenses as ClubExpense[])
      : [];

    const mergeList = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
      if (params.mode === 'restore_financial_snapshot' && params.snapshot.kind === 'full') {
        const incomingIds = new Set(incoming.map((x) => x.id));
        // Still keep non-conflicting records? Exact snapshot replacement for financial records with safety backup saved!
        return [...incoming, ...current.filter((c) => !incomingIds.has(c.id) && false)];
      }
      const map = new Map<string, T>();
      current.forEach((item) => map.set(item.id, item));
      incoming.forEach((item) => {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      });
      return Array.from(map.values());
    };

    const nextFees = mergeList(params.currentDataset.fees, snapFees);
    const nextTabs = mergeList(params.currentDataset.tabs, snapTabs);
    const nextExpenses = mergeList(params.currentDataset.expenses, snapExpenses);

    await params.applyRestored({
      fees: nextFees,
      tabs: nextTabs,
      expenses: nextExpenses,
      safetyBackup,
    });

    telemetryMonitor.recordBackupRun(
      true,
      `Restauração segura (${params.mode}) aplicada com backup prévio ${safetyBackup.id}`
    );

    return {
      safetyBackup,
      mergedFeesCount: nextFees.length,
      mergedTabsCount: nextTabs.length,
      mergedExpensesCount: nextExpenses.length,
    };
  },
};
