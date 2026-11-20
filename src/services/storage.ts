import {
  ClubInfo,
  BoardRoleConfig,
  User,
  RideEvent,
  ForumPost,
  SOSAlert,
  MemberMonthlyFee,
  ClubExpense,
  MemberTabDebt,
  BoardChatMessage,
  Supporter,
  ClubDocument,
  ClubGovernanceDoc,
  ClubAnnouncement,
  AdminAuditEntry,
  DeletedRecordBackup,
  FeeRateScheduleEntry,
  ManualFinancialEntry,
  MemberHonoraryTitle,
  WalkInClient,
  WalkInTabRecord,
  MemberPublicProfile,
  MemberFinancialNote,
  DEFAULT_CREST_URL,
  LEGACY_DEFAULT_CREST_URL,
  DEFAULT_FEDERATION_LOGO_URL,
} from '../types';
import {
  INITIAL_CLUB_INFO,
  INITIAL_GOVERNANCE_DOCS,
} from '../data/initialData';
import { FirestoreSync } from './firestoreSync';
import { IndexedDbCache } from './indexedDbCache';

const STORAGE_KEYS = {
  CLUB_INFO: 'oficina_rock_club_info_v1',
  BOARD_ROLES: 'oficina_rock_board_roles_v1',
  USERS: 'oficina_rock_users_v1',
  PUBLIC_PROFILES: 'oficina_rock_public_profiles_v1',
  FINANCIAL_NOTES: 'oficina_rock_financial_notes_v1',
  CURRENT_USER: 'oficina_rock_current_user_v1',
  EVENTS: 'oficina_rock_events_v1',
  FORUM: 'oficina_rock_forum_v1',
  SOS: 'oficina_rock_sos_v1',
  FEES: 'oficina_rock_fees_v1',
  FEE_SCHEDULES: 'oficina_rock_fee_schedules_v1',
  MANUAL_RECEIPTS: 'oficina_rock_manual_receipts_v1',
  MEMBER_TITLES: 'oficina_rock_member_titles_v1',
  WALKIN_CLIENTS: 'oficina_rock_walkin_clients_v1',
  WALKIN_TABS: 'oficina_rock_walkin_tabs_v1',
  EXPENSES: 'oficina_rock_expenses_v1',
  TABS: 'oficina_rock_tabs_v1',
  BOARD_CHAT: 'oficina_rock_board_chat_v1',
  SUPPORTERS: 'oficina_rock_supporters_v1',
  DOCUMENTS: 'oficina_rock_documents_v1',
  GOVERNANCE: 'oficina_rock_governance_v2',
  ANNOUNCEMENTS: 'oficina_rock_announcements_v1',
  AUDIT_LOGS: 'oficina_rock_audit_logs_v1',
  DELETED_BACKUPS: 'oficina_rock_deleted_backups_v1',
  READ_NOTIF_IDS: 'oficina_rock_read_notif_ids_v1',
};

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export async function unlockAudioContext(): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch {
    // Ignore autoplay restriction until user gesture
  }
}

// Play realistic sound effects via Web Audio API
export function playSound(type: 'siren' | 'beep' | 'success' | 'click') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    if (type === 'siren') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.linearRampToValueAtTime(1020, now + 0.28);
      osc.frequency.linearRampToValueAtTime(620, now + 0.56);
      osc.frequency.linearRampToValueAtTime(1020, now + 0.84);
      osc.frequency.linearRampToValueAtTime(620, now + 1.12);
      osc.frequency.linearRampToValueAtTime(1020, now + 1.4);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.setValueAtTime(0.24, now + 1.25);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.55);
    } else if (type === 'success') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'beep') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  } catch (err) {
    console.debug('Audio play skipped', err);
  }
}

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, value: T, notify = true): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Local cache quota exceeded (cloud sync active):', e);
  }
  if (notify && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('oficina_data_changed', { detail: { key } }));
  }
}

function triggerCloudSync(promise: Promise<void>) {
  promise.catch((err) => {
    console.error('Cloud sync error:', err);
  });
}

function sanitizeUserNoPassword(user: User): User {
  const copy = { ...user } as User & { password?: unknown };
  if ('password' in copy) {
    delete copy.password;
  }
  return copy;
}

export const StorageService = {
  getClubInfo(): ClubInfo {
    const raw = getStored<ClubInfo>(STORAGE_KEYS.CLUB_INFO, INITIAL_CLUB_INFO);
    return {
      ...INITIAL_CLUB_INFO,
      ...raw,
      leftCrestUrl:
        !raw.leftCrestUrl || raw.leftCrestUrl === LEGACY_DEFAULT_CREST_URL
          ? DEFAULT_CREST_URL
          : raw.leftCrestUrl,
      rightCrestUrl:
        !raw.rightCrestUrl || raw.rightCrestUrl === LEGACY_DEFAULT_CREST_URL
          ? DEFAULT_CREST_URL
          : raw.rightCrestUrl,
      federationLogoUrl: raw.federationLogoUrl || DEFAULT_FEDERATION_LOGO_URL,
    };
  },
  setClubInfo(info: ClubInfo): void {
    setStored(STORAGE_KEYS.CLUB_INFO, info);
    triggerCloudSync(FirestoreSync.saveClubInfo(info));
  },
  async saveClubInfoAndAwaitCloud(info: ClubInfo): Promise<void> {
    await FirestoreSync.saveClubInfo(info, { throwOnError: true });
    setStored(STORAGE_KEYS.CLUB_INFO, info);
  },
  applyRemoteClubInfo(info: ClubInfo): void {
    setStored(STORAGE_KEYS.CLUB_INFO, info, false);
  },

  getBoardRoles(): BoardRoleConfig[] {
    return getStored<BoardRoleConfig[]>(STORAGE_KEYS.BOARD_ROLES, []);
  },
  setBoardRoles(roles: BoardRoleConfig[]): void {
    setStored(STORAGE_KEYS.BOARD_ROLES, roles);
    triggerCloudSync(FirestoreSync.saveBoardRoles(roles));
  },
  async saveBoardRolesConfirmed(roles: BoardRoleConfig[]): Promise<void> {
    await FirestoreSync.saveBoardRoles(roles, { throwOnError: true });
    setStored(STORAGE_KEYS.BOARD_ROLES, roles);
  },
  applyRemoteBoardRoles(roles: BoardRoleConfig[]): void {
    setStored(STORAGE_KEYS.BOARD_ROLES, roles, false);
  },

  getUsers(): User[] {
    const list = getStored<User[]>(STORAGE_KEYS.USERS, []);
    return Array.isArray(list) ? list.map(sanitizeUserNoPassword) : [];
  },
  setUsers(users: User[]): void {
    const clean = users.map(sanitizeUserNoPassword);
    setStored(STORAGE_KEYS.USERS, clean);
    triggerCloudSync(FirestoreSync.saveUsers(clean));
  },
  async saveUsersConfirmed(users: User[]): Promise<void> {
    const clean = users.map(sanitizeUserNoPassword);
    await FirestoreSync.saveUsers(clean, { throwOnError: true });
    setStored(STORAGE_KEYS.USERS, clean);
  },
  applyRemoteUsers(users: User[]): void {
    setStored(STORAGE_KEYS.USERS, users.map(sanitizeUserNoPassword), false);
  },

  getPublicProfiles(): MemberPublicProfile[] {
    const list = getStored<MemberPublicProfile[]>(STORAGE_KEYS.PUBLIC_PROFILES, []);
    return Array.isArray(list) ? list : [];
  },
  applyRemotePublicProfiles(profiles: MemberPublicProfile[]): void {
    setStored(STORAGE_KEYS.PUBLIC_PROFILES, profiles, false);
  },

  getFinancialNotes(): MemberFinancialNote[] {
    const list = getStored<MemberFinancialNote[]>(STORAGE_KEYS.FINANCIAL_NOTES, []);
    return Array.isArray(list) ? list : [];
  },
  async saveFinancialNoteConfirmed(note: MemberFinancialNote): Promise<MemberFinancialNote[]> {
    const saved = await FirestoreSync.saveFinancialNote(note, { throwOnError: true });
    const existing = this.getFinancialNotes();
    const next = existing.some((n) => n.memberId === saved.memberId)
      ? existing.map((n) => (n.memberId === saved.memberId ? saved : n))
      : [saved, ...existing];
    setStored(STORAGE_KEYS.FINANCIAL_NOTES, next);
    return next;
  },
  applyRemoteFinancialNotes(notes: MemberFinancialNote[]): void {
    setStored(STORAGE_KEYS.FINANCIAL_NOTES, notes, false);
  },

  clearPrivateUsersCache(): void {
    try {
      [
        STORAGE_KEYS.USERS,
        STORAGE_KEYS.PUBLIC_PROFILES,
        STORAGE_KEYS.FINANCIAL_NOTES,
        STORAGE_KEYS.FEES,
        STORAGE_KEYS.FEE_SCHEDULES,
        STORAGE_KEYS.MANUAL_RECEIPTS,
        STORAGE_KEYS.MEMBER_TITLES,
        STORAGE_KEYS.WALKIN_CLIENTS,
        STORAGE_KEYS.WALKIN_TABS,
        STORAGE_KEYS.EXPENSES,
        STORAGE_KEYS.TABS,
        STORAGE_KEYS.FORUM,
        STORAGE_KEYS.SOS,
        STORAGE_KEYS.BOARD_CHAT,
        STORAGE_KEYS.DOCUMENTS,
        STORAGE_KEYS.ANNOUNCEMENTS,
        STORAGE_KEYS.AUDIT_LOGS,
        STORAGE_KEYS.DELETED_BACKUPS,
      ].forEach((k) => localStorage.removeItem(k));
    } catch {
      // Ignore storage removal errors
    }
    void IndexedDbCache.clearPrivateCaches();
  },
  async clearAllPrivateCaches(): Promise<void> {
    this.clearPrivateUsersCache();
    try {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    } catch {
      // Ignore
    }
    await IndexedDbCache.clearPrivateCaches();
  },

  getCurrentUser(): User | null {
    const raw = getStored<User | null>(STORAGE_KEYS.CURRENT_USER, null);
    return raw ? sanitizeUserNoPassword(raw) : null;
  },
  setCurrentUser(user: User | null): void {
    setStored(STORAGE_KEYS.CURRENT_USER, user ? sanitizeUserNoPassword(user) : null);
  },
  applyRemoteCurrentUser(user: User | null): void {
    setStored(STORAGE_KEYS.CURRENT_USER, user ? sanitizeUserNoPassword(user) : null, false);
  },

  getEvents(): RideEvent[] {
    return getStored<RideEvent[]>(STORAGE_KEYS.EVENTS, []);
  },
  setEvents(events: RideEvent[]): void {
    setStored(STORAGE_KEYS.EVENTS, events);
    triggerCloudSync(FirestoreSync.saveEvents(events));
  },
  async saveEventsConfirmed(events: RideEvent[]): Promise<void> {
    await FirestoreSync.saveEvents(events, { throwOnError: true });
    setStored(STORAGE_KEYS.EVENTS, events);
  },
  applyRemoteEvents(events: RideEvent[]): void {
    setStored(STORAGE_KEYS.EVENTS, events, false);
  },

  getForumPosts(): ForumPost[] {
    return getStored<ForumPost[]>(STORAGE_KEYS.FORUM, []);
  },
  setForumPosts(posts: ForumPost[]): void {
    setStored(STORAGE_KEYS.FORUM, posts);
    triggerCloudSync(FirestoreSync.saveForumPosts(posts));
  },
  async saveForumPostsConfirmed(posts: ForumPost[]): Promise<void> {
    await FirestoreSync.saveForumPosts(posts, { throwOnError: true });
    setStored(STORAGE_KEYS.FORUM, posts);
  },
  applyRemoteForumPosts(posts: ForumPost[]): void {
    setStored(STORAGE_KEYS.FORUM, posts, false);
  },

  getSOSAlerts(): SOSAlert[] {
    return getStored<SOSAlert[]>(STORAGE_KEYS.SOS, []);
  },
  setSOSAlerts(alerts: SOSAlert[]): void {
    setStored(STORAGE_KEYS.SOS, alerts);
    triggerCloudSync(FirestoreSync.saveSOSAlerts(alerts));
  },
  async saveSOSAlertsConfirmed(alerts: SOSAlert[]): Promise<void> {
    await FirestoreSync.saveSOSAlerts(alerts, { throwOnError: true });
    setStored(STORAGE_KEYS.SOS, alerts);
  },
  applyRemoteSOSAlerts(alerts: SOSAlert[]): void {
    setStored(STORAGE_KEYS.SOS, alerts, false);
  },

  getFees(): MemberMonthlyFee[] {
    return getStored<MemberMonthlyFee[]>(STORAGE_KEYS.FEES, []);
  },
  setFees(fees: MemberMonthlyFee[]): void {
    setStored(STORAGE_KEYS.FEES, fees);
    triggerCloudSync(FirestoreSync.saveFees(fees));
  },
  async saveFeesConfirmed(fees: MemberMonthlyFee[]): Promise<void> {
    await FirestoreSync.saveFees(fees, { throwOnError: true });
    setStored(STORAGE_KEYS.FEES, fees);
  },
  applyRemoteFees(fees: MemberMonthlyFee[]): void {
    setStored(STORAGE_KEYS.FEES, fees, false);
  },

  getFeeSchedules(): FeeRateScheduleEntry[] {
    return getStored<FeeRateScheduleEntry[]>(STORAGE_KEYS.FEE_SCHEDULES, []);
  },
  setFeeSchedules(entries: FeeRateScheduleEntry[]): void {
    setStored(STORAGE_KEYS.FEE_SCHEDULES, entries);
    triggerCloudSync(FirestoreSync.saveFeeSchedules(entries));
  },
  async saveFeeSchedulesConfirmed(entries: FeeRateScheduleEntry[]): Promise<void> {
    await FirestoreSync.saveFeeSchedules(entries, { throwOnError: true });
    setStored(STORAGE_KEYS.FEE_SCHEDULES, entries);
  },
  applyRemoteFeeSchedules(entries: FeeRateScheduleEntry[]): void {
    setStored(STORAGE_KEYS.FEE_SCHEDULES, entries, false);
  },

  getManualReceipts(): ManualFinancialEntry[] {
    return getStored<ManualFinancialEntry[]>(STORAGE_KEYS.MANUAL_RECEIPTS, []);
  },
  setManualReceipts(entries: ManualFinancialEntry[]): void {
    setStored(STORAGE_KEYS.MANUAL_RECEIPTS, entries);
    triggerCloudSync(FirestoreSync.saveManualReceipts(entries));
  },
  async saveManualReceiptsConfirmed(entries: ManualFinancialEntry[]): Promise<void> {
    await FirestoreSync.saveManualReceipts(entries, { throwOnError: true });
    setStored(STORAGE_KEYS.MANUAL_RECEIPTS, entries);
  },
  applyRemoteManualReceipts(entries: ManualFinancialEntry[]): void {
    setStored(STORAGE_KEYS.MANUAL_RECEIPTS, entries, false);
  },

  getMemberTitles(): MemberHonoraryTitle[] {
    return getStored<MemberHonoraryTitle[]>(STORAGE_KEYS.MEMBER_TITLES, []);
  },
  setMemberTitles(titles: MemberHonoraryTitle[]): void {
    setStored(STORAGE_KEYS.MEMBER_TITLES, titles);
    triggerCloudSync(FirestoreSync.saveMemberTitles(titles));
  },
  async saveMemberTitlesConfirmed(titles: MemberHonoraryTitle[]): Promise<void> {
    await FirestoreSync.saveMemberTitles(titles, { throwOnError: true });
    setStored(STORAGE_KEYS.MEMBER_TITLES, titles);
  },
  applyRemoteMemberTitles(titles: MemberHonoraryTitle[]): void {
    setStored(STORAGE_KEYS.MEMBER_TITLES, titles, false);
  },

  getWalkInClients(): WalkInClient[] {
    return getStored<WalkInClient[]>(STORAGE_KEYS.WALKIN_CLIENTS, []);
  },
  setWalkInClients(clients: WalkInClient[]): void {
    setStored(STORAGE_KEYS.WALKIN_CLIENTS, clients);
    triggerCloudSync(FirestoreSync.saveWalkInClients(clients));
  },
  async saveWalkInClientsConfirmed(clients: WalkInClient[]): Promise<void> {
    await FirestoreSync.saveWalkInClients(clients, { throwOnError: true });
    setStored(STORAGE_KEYS.WALKIN_CLIENTS, clients);
  },
  applyRemoteWalkInClients(clients: WalkInClient[]): void {
    setStored(STORAGE_KEYS.WALKIN_CLIENTS, clients, false);
  },

  getWalkInTabs(): WalkInTabRecord[] {
    return getStored<WalkInTabRecord[]>(STORAGE_KEYS.WALKIN_TABS, []);
  },
  setWalkInTabs(tabs: WalkInTabRecord[]): void {
    setStored(STORAGE_KEYS.WALKIN_TABS, tabs);
    triggerCloudSync(FirestoreSync.saveWalkInTabs(tabs));
  },
  async saveWalkInTabsConfirmed(tabs: WalkInTabRecord[]): Promise<void> {
    await FirestoreSync.saveWalkInTabs(tabs, { throwOnError: true });
    setStored(STORAGE_KEYS.WALKIN_TABS, tabs);
  },
  applyRemoteWalkInTabs(tabs: WalkInTabRecord[]): void {
    setStored(STORAGE_KEYS.WALKIN_TABS, tabs, false);
  },

  getExpenses(): ClubExpense[] {
    return getStored<ClubExpense[]>(STORAGE_KEYS.EXPENSES, []);
  },
  setExpenses(expenses: ClubExpense[]): void {
    setStored(STORAGE_KEYS.EXPENSES, expenses);
    triggerCloudSync(FirestoreSync.saveExpenses(expenses));
  },
  async saveExpensesConfirmed(expenses: ClubExpense[]): Promise<void> {
    await FirestoreSync.saveExpenses(expenses, { throwOnError: true });
    setStored(STORAGE_KEYS.EXPENSES, expenses);
  },
  applyRemoteExpenses(expenses: ClubExpense[]): void {
    setStored(STORAGE_KEYS.EXPENSES, expenses, false);
  },

  getTabs(): MemberTabDebt[] {
    return getStored<MemberTabDebt[]>(STORAGE_KEYS.TABS, []);
  },
  setTabs(tabs: MemberTabDebt[]): void {
    setStored(STORAGE_KEYS.TABS, tabs);
    triggerCloudSync(FirestoreSync.saveTabs(tabs));
  },
  async saveTabsConfirmed(tabs: MemberTabDebt[]): Promise<void> {
    await FirestoreSync.saveTabs(tabs, { throwOnError: true });
    setStored(STORAGE_KEYS.TABS, tabs);
  },
  applyRemoteTabs(tabs: MemberTabDebt[]): void {
    setStored(STORAGE_KEYS.TABS, tabs, false);
  },
  async saveFinanceBatchConfirmed(changes: {
    fees?: MemberMonthlyFee[];
    tabs?: MemberTabDebt[];
    expenses?: ClubExpense[];
  }): Promise<void> {
    await FirestoreSync.saveFinanceBatchConfirmed(changes);
    if (changes.fees) setStored(STORAGE_KEYS.FEES, changes.fees);
    if (changes.tabs) setStored(STORAGE_KEYS.TABS, changes.tabs);
    if (changes.expenses) setStored(STORAGE_KEYS.EXPENSES, changes.expenses);
  },

  getBoardChat(): BoardChatMessage[] {
    return getStored<BoardChatMessage[]>(STORAGE_KEYS.BOARD_CHAT, []);
  },
  setBoardChat(chat: BoardChatMessage[]): void {
    setStored(STORAGE_KEYS.BOARD_CHAT, chat);
    triggerCloudSync(FirestoreSync.saveBoardChat(chat));
  },
  async saveBoardChatConfirmed(chat: BoardChatMessage[]): Promise<void> {
    await FirestoreSync.saveBoardChat(chat, { throwOnError: true });
    setStored(STORAGE_KEYS.BOARD_CHAT, chat);
  },
  applyRemoteBoardChat(chat: BoardChatMessage[]): void {
    setStored(STORAGE_KEYS.BOARD_CHAT, chat, false);
  },

  getSupporters(): Supporter[] {
    return getStored<Supporter[]>(STORAGE_KEYS.SUPPORTERS, []);
  },
  setSupporters(supporters: Supporter[]): void {
    setStored(STORAGE_KEYS.SUPPORTERS, supporters);
    triggerCloudSync(FirestoreSync.saveSupporters(supporters));
  },
  async saveSupportersConfirmed(supporters: Supporter[]): Promise<void> {
    await FirestoreSync.saveSupporters(supporters, { throwOnError: true });
    setStored(STORAGE_KEYS.SUPPORTERS, supporters);
  },
  applyRemoteSupporters(supporters: Supporter[]): void {
    setStored(STORAGE_KEYS.SUPPORTERS, supporters, false);
  },

  getDocuments(): ClubDocument[] {
    return getStored<ClubDocument[]>(STORAGE_KEYS.DOCUMENTS, []);
  },
  applyRemoteDocuments(docs: ClubDocument[]): void {
    const light = docs.map((d) =>
      d.fileDataUrl && d.fileDataUrl.length > 150_000 ? { ...d, fileDataUrl: '' } : d
    );
    setStored(STORAGE_KEYS.DOCUMENTS, light, false);
  },

  getGovernanceDocs(): ClubGovernanceDoc[] {
    return getStored<ClubGovernanceDoc[]>(STORAGE_KEYS.GOVERNANCE, INITIAL_GOVERNANCE_DOCS);
  },
  setGovernanceDoc(docItem: ClubGovernanceDoc, allDocs: ClubGovernanceDoc[]): void {
    setStored(STORAGE_KEYS.GOVERNANCE, allDocs);
    triggerCloudSync(FirestoreSync.saveGovernanceDoc(docItem));
  },
  async saveGovernanceDocConfirmed(docItem: ClubGovernanceDoc, allDocs: ClubGovernanceDoc[]): Promise<void> {
    await FirestoreSync.saveGovernanceDoc(docItem, { throwOnError: true });
    setStored(STORAGE_KEYS.GOVERNANCE, allDocs);
  },
  applyRemoteGovernanceDocs(docs: ClubGovernanceDoc[]): void {
    setStored(STORAGE_KEYS.GOVERNANCE, docs, false);
  },

  getAnnouncements(): ClubAnnouncement[] {
    return getStored<ClubAnnouncement[]>(STORAGE_KEYS.ANNOUNCEMENTS, []);
  },
  setAnnouncements(items: ClubAnnouncement[]): void {
    setStored(STORAGE_KEYS.ANNOUNCEMENTS, items.slice(0, 40));
  },
  async saveAnnouncementConfirmed(item: ClubAnnouncement, allItems: ClubAnnouncement[]): Promise<void> {
    await FirestoreSync.saveAnnouncement(item, { throwOnError: true });
    setStored(STORAGE_KEYS.ANNOUNCEMENTS, allItems.slice(0, 40));
  },
  async deleteAnnouncementConfirmed(id: string, remainingItems: ClubAnnouncement[]): Promise<void> {
    await FirestoreSync.deleteAnnouncement(id, { throwOnError: true });
    setStored(STORAGE_KEYS.ANNOUNCEMENTS, remainingItems.slice(0, 40));
  },
  applyRemoteAnnouncements(items: ClubAnnouncement[]): void {
    setStored(STORAGE_KEYS.ANNOUNCEMENTS, items.slice(0, 40), false);
  },

  getAuditLogs(): AdminAuditEntry[] {
    return getStored<AdminAuditEntry[]>(STORAGE_KEYS.AUDIT_LOGS, []);
  },
  setAuditLogs(logs: AdminAuditEntry[]): void {
    setStored(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 120));
  },
  applyRemoteAuditLogs(logs: AdminAuditEntry[]): void {
    setStored(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 120), false);
  },

  getDeletedBackups(): DeletedRecordBackup[] {
    return getStored<DeletedRecordBackup[]>(STORAGE_KEYS.DELETED_BACKUPS, []);
  },
  setDeletedBackups(items: DeletedRecordBackup[]): void {
    setStored(STORAGE_KEYS.DELETED_BACKUPS, items.slice(0, 60));
  },
  applyRemoteDeletedBackups(items: DeletedRecordBackup[]): void {
    setStored(STORAGE_KEYS.DELETED_BACKUPS, items.slice(0, 60), false);
  },

  getReadNotificationIds(): string[] {
    return getStored<string[]>(STORAGE_KEYS.READ_NOTIF_IDS, []);
  },
  markNotificationRead(id: string): string[] {
    const existing = this.getReadNotificationIds();
    if (existing.includes(id)) return existing;
    const next = [...existing, id].slice(-250);
    setStored(STORAGE_KEYS.READ_NOTIF_IDS, next, false);
    return next;
  },
  markManyNotificationsRead(ids: string[]): string[] {
    const set = new Set(this.getReadNotificationIds());
    ids.forEach((id) => set.add(id));
    const next = Array.from(set).slice(-250);
    setStored(STORAGE_KEYS.READ_NOTIF_IDS, next, false);
    return next;
  },

  exportFullBackupPayload() {
    return {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      clubInfo: this.getClubInfo(),
      boardRoles: this.getBoardRoles(),
      users: this.getUsers(),
      events: this.getEvents(),
      forumPosts: this.getForumPosts(),
      fees: this.getFees(),
      feeSchedules: this.getFeeSchedules(),
      manualReceipts: this.getManualReceipts(),
      memberTitles: this.getMemberTitles(),
      walkInClients: this.getWalkInClients(),
      walkInTabs: this.getWalkInTabs(),
      expenses: this.getExpenses(),
      tabs: this.getTabs(),
      supporters: this.getSupporters(),
      governanceDocs: this.getGovernanceDocs(),
      announcements: this.getAnnouncements(),
    };
  },

  resetAll(): void {
    try {
      localStorage.clear();
    } catch {
      // Ignore clear error
    }
    void IndexedDbCache.clearPrivateCaches();
    setStored(STORAGE_KEYS.CLUB_INFO, INITIAL_CLUB_INFO);
    setStored(STORAGE_KEYS.BOARD_ROLES, []);
    setStored(STORAGE_KEYS.USERS, []);
    setStored(STORAGE_KEYS.PUBLIC_PROFILES, []);
    setStored(STORAGE_KEYS.FINANCIAL_NOTES, []);
    setStored(STORAGE_KEYS.CURRENT_USER, null);
    setStored(STORAGE_KEYS.EVENTS, []);
    setStored(STORAGE_KEYS.FORUM, []);
    setStored(STORAGE_KEYS.SOS, []);
    setStored(STORAGE_KEYS.FEES, []);
    setStored(STORAGE_KEYS.FEE_SCHEDULES, []);
    setStored(STORAGE_KEYS.MANUAL_RECEIPTS, []);
    setStored(STORAGE_KEYS.MEMBER_TITLES, []);
    setStored(STORAGE_KEYS.WALKIN_CLIENTS, []);
    setStored(STORAGE_KEYS.WALKIN_TABS, []);
    setStored(STORAGE_KEYS.EXPENSES, []);
    setStored(STORAGE_KEYS.TABS, []);
    setStored(STORAGE_KEYS.BOARD_CHAT, []);
    setStored(STORAGE_KEYS.SUPPORTERS, []);
    setStored(STORAGE_KEYS.DOCUMENTS, []);
    setStored(STORAGE_KEYS.GOVERNANCE, INITIAL_GOVERNANCE_DOCS);
    setStored(STORAGE_KEYS.ANNOUNCEMENTS, []);
    setStored(STORAGE_KEYS.AUDIT_LOGS, []);
    setStored(STORAGE_KEYS.DELETED_BACKUPS, []);
    setStored(STORAGE_KEYS.READ_NOTIF_IDS, []);
  },
};
