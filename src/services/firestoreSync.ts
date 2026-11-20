import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
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
  QuotaSyncStatus,
  FeeRateScheduleEntry,
  ManualFinancialEntry,
  MemberHonoraryTitle,
  WalkInClient,
  WalkInTabRecord,
  MemberCategory,
  MEMBER_CATEGORIES,
  MemberFeeStatus,
  MemberFeeStatusAuditEntry,
  MemberBadgeAuditEntry,
  MemberPublicProfile,
  MemberFinancialNote,
  MemberFinancialObservationEntry,
  FinanceHistoryEntry,
  ExpenseTabConfig,
  DocumentCategoryConfig,
  DocumentCustomField,
  DEFAULT_CREST_URL,
  LEGACY_DEFAULT_CREST_URL,
  DEFAULT_FEDERATION_LOGO_URL,
  DEFAULT_EXPENSE_TABS,
  DEFAULT_DOCUMENT_CATEGORIES,
  VACANT_BOARD_HOLDER_LABEL,
  isVacantBoardHolder,
  reconcileBoardRolesWithUsers,
} from '../types';
import {
  INITIAL_CLUB_INFO,
  INITIAL_BOARD_ROLES,
  INITIAL_USERS,
  INITIAL_GOVERNANCE_DOCS,
} from '../data/initialData';
import { auth, db, ADMIN_EMAIL, OperationType, handleFirestoreError } from './firebase';
import { sanitizeImageString, compressDataUrlIfNeeded, normalizeDocumentDataUrl } from './imageUtils';
import {
  createQuotaCircuitBreaker,
  createRequestDeduplicator,
  isQuotaError,
  isOfflineOrNetworkError,
  isPermissionOrAuthError,
  QUOTA_BANNER_MESSAGE,
  QuotaWriteBlockedError,
} from './syncResilience';
import { telemetryMonitor, TelemetryReadContext } from './telemetryMonitor';
import { IndexedDbCache } from './indexedDbCache';

function safeId(raw: string): string {
  const cleaned = (raw || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

function clampStr(val: string | undefined, max: number): string {
  if (!val) return '';
  return val.length > max ? val.slice(0, max) : val;
}

function tsToIso(val: unknown, fallback?: string): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return fallback || new Date().toISOString();
}

function isFinancialDirectorUser(user: Partial<User>): boolean {
  return Boolean(
    user.boardRoleId === 'role-finance' ||
    user.email?.toLowerCase().includes('financeiro') ||
    user.canEditFinances
  );
}

function isCloudAdmin(fbUser: FirebaseUser): boolean {
  const email = (fbUser.email || '').toLowerCase().trim();
  if (email === ADMIN_EMAIL) {
    return !currentResolvedUser || currentResolvedUser.status === 'active';
  }
  return Boolean(
    currentResolvedUser &&
    currentResolvedUser.status === 'active' &&
    currentResolvedUser.role === 'admin'
  );
}

function isCloudBoardOrAdmin(fbUser: FirebaseUser): boolean {
  if (isCloudAdmin(fbUser)) return true;
  return Boolean(
    currentResolvedUser &&
    currentResolvedUser.status === 'active' &&
    currentResolvedUser.role === 'board'
  );
}

function isCloudFinanceEditor(fbUser: FirebaseUser): boolean {
  if (isCloudAdmin(fbUser)) return true;
  if (currentResolvedUser?.role === 'board' && currentResolvedUser?.status === 'active') {
    return Boolean(currentResolvedUser.canEditFinances || isFinancialDirectorUser(currentResolvedUser));
  }
  return false;
}

function isCloudPresidente(): boolean {
  return Boolean(
    currentResolvedUser &&
    currentResolvedUser.status === 'active' &&
    currentResolvedUser.boardRoleId === 'role-pres'
  );
}

const DEFAULT_BOARD_ROLE_ORDER = new Map(INITIAL_BOARD_ROLES.map((r, idx) => [r.id, idx]));

function sortBoardRoles(list: BoardRoleConfig[]): BoardRoleConfig[] {
  return [...list].sort((a, b) => {
    const oa = typeof a.order === 'number' ? a.order : (DEFAULT_BOARD_ROLE_ORDER.get(a.id) ?? 999);
    const ob = typeof b.order === 'number' ? b.order : (DEFAULT_BOARD_ROLE_ORDER.get(b.id) ?? 999);
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
}

function sanitizeYearList(years: unknown): number[] {
  if (!Array.isArray(years)) return [];
  const valid = years
    .map((y) => Math.round(Number(y)))
    .filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100);
  return Array.from(new Set(valid)).sort((a, b) => b - a).slice(0, 50);
}

function sanitizeExpenseTabs(tabs: unknown): ExpenseTabConfig[] {
  if (!Array.isArray(tabs)) return DEFAULT_EXPENSE_TABS;
  const seen = new Set<string>();
  const cleaned: ExpenseTabConfig[] = [];
  tabs.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const item = raw as { id?: unknown; label?: unknown };
    const id = safeId(String(item.id || '')).slice(0, 64);
    const label = clampStr(String(item.label || '').trim(), 60);
    if (!id || !label || seen.has(id)) return;
    seen.add(id);
    cleaned.push({ id, label });
  });
  return cleaned.length > 0 ? cleaned.slice(0, 20) : DEFAULT_EXPENSE_TABS;
}

function sanitizeDocumentCategories(cats: unknown): DocumentCategoryConfig[] {
  if (!Array.isArray(cats)) return DEFAULT_DOCUMENT_CATEGORIES;
  const seen = new Set<string>();
  const cleaned: DocumentCategoryConfig[] = [];
  cats.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const item = raw as { id?: unknown; label?: unknown };
    const id = safeId(String(item.id || '')).slice(0, 64);
    const label = clampStr(String(item.label || '').trim(), 60);
    if (!id || !label || seen.has(id)) return;
    seen.add(id);
    cleaned.push({ id, label });
  });
  return cleaned.length > 0 ? cleaned.slice(0, 20) : DEFAULT_DOCUMENT_CATEGORIES;
}

function sanitizeDocumentCustomFieldLabels(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  labels.forEach((raw) => {
    const val = clampStr(String(raw || '').trim(), 80);
    if (!val || seen.has(val.toLowerCase())) return;
    seen.add(val.toLowerCase());
    cleaned.push(val);
  });
  return cleaned.slice(0, 20);
}

function sanitizeDocumentCustomFields(fields: unknown): DocumentCustomField[] {
  if (!Array.isArray(fields)) return [];
  const cleaned: DocumentCustomField[] = [];
  fields.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const item = raw as { key?: unknown; value?: unknown };
    const key = clampStr(String(item.key || '').trim(), 80);
    const value = clampStr(String(item.value ?? '').trim(), 500);
    if (!key) return;
    cleaned.push({ key, value });
  });
  return cleaned.slice(0, 20);
}

// --- Serializers adhering strictly to firebase-blueprint.json & firestore.rules ---

function serializeClubSettings(info: ClubInfo) {
  const docData: Record<string, unknown> = {
    name: clampStr((info.name || '').trim() || 'Oficina do Rock Motoclube', 150),
    foundationYear: Math.min(2100, Math.max(1900, Math.round(Number(info.foundationYear) || 2008))),
    city: clampStr(info.city, 120),
    address: clampStr(info.address, 300),
    googleMapsUrl: clampStr(info.googleMapsUrl, 500),
    contactEmail: clampStr(info.contactEmail, 150),
    contactPhone: clampStr(info.contactPhone, 40),
    instagram: clampStr(info.instagram, 300),
    facebook: clampStr(info.facebook, 300),
    youtube: clampStr(info.youtube, 300),
    historyText: clampStr(info.historyText, 10000),
    rulesText: clampStr(info.rulesText, 10000),
    pixCnpj: clampStr(info.pixCnpj, 100),
    monthlyFeeAmount: Math.min(100000, Math.max(0, Number(info.monthlyFeeAmount) || 0)),
    financialDirectorAuthorized: Boolean(info.financialDirectorAuthorized),
    isPublic: true,
    updatedAt: serverTimestamp(),
  };
  if (Array.isArray(info.financialYears)) {
    docData.financialYears = sanitizeYearList(info.financialYears);
  }
  if (Array.isArray(info.hiddenFinancialYears)) {
    docData.hiddenFinancialYears = sanitizeYearList(info.hiddenFinancialYears);
  }
  if (info.leftCrestUrl !== undefined) {
    const resolvedLeft =
      !info.leftCrestUrl || info.leftCrestUrl === LEGACY_DEFAULT_CREST_URL
        ? DEFAULT_CREST_URL
        : info.leftCrestUrl;
    docData.leftCrestUrl = sanitizeImageString(resolvedLeft, 160_000);
  }
  if (info.rightCrestUrl !== undefined) {
    const resolvedRight =
      !info.rightCrestUrl || info.rightCrestUrl === LEGACY_DEFAULT_CREST_URL
        ? DEFAULT_CREST_URL
        : info.rightCrestUrl;
    docData.rightCrestUrl = sanitizeImageString(resolvedRight, 160_000);
  }
  if (info.isHeadquartersOpen !== undefined) {
    docData.isHeadquartersOpen = Boolean(info.isHeadquartersOpen);
  }
  if (info.headquartersOpenText !== undefined) {
    docData.headquartersOpenText = clampStr(info.headquartersOpenText, 2000);
  }
  if (Array.isArray(info.headquartersOpenPhotos)) {
    docData.headquartersOpenPhotos = info.headquartersOpenPhotos
      .slice(0, 20)
      .map((p) => sanitizeImageString(p, 110_000))
      .filter(Boolean);
  }
  if (info.accessRequestMessage !== undefined) {
    docData.accessRequestMessage = clampStr(info.accessRequestMessage, 1000);
  }
  if (info.supportersButtonTitle !== undefined) {
    docData.supportersButtonTitle = clampStr(info.supportersButtonTitle, 120);
  }
  if (info.supportersButtonSubtitle !== undefined) {
    docData.supportersButtonSubtitle = clampStr(info.supportersButtonSubtitle, 160);
  }
  if (info.supportersButtonDescription !== undefined) {
    docData.supportersButtonDescription = clampStr(info.supportersButtonDescription, 600);
  }
  if (info.supportersButtonCta !== undefined) {
    docData.supportersButtonCta = clampStr(info.supportersButtonCta, 80);
  }
  if (info.supportersHistoryText !== undefined) {
    docData.supportersHistoryText = clampStr(info.supportersHistoryText, 5000);
  }
  if (info.supportersCoverUrl !== undefined) {
    docData.supportersCoverUrl = sanitizeImageString(info.supportersCoverUrl, 280_000);
  }
  if (info.eventsButtonLabel !== undefined) {
    docData.eventsButtonLabel = clampStr(info.eventsButtonLabel, 80);
  }
  if (Array.isArray(info.expenseTabs)) {
    docData.expenseTabs = sanitizeExpenseTabs(info.expenseTabs);
  }
  if (Array.isArray(info.documentCategories)) {
    docData.documentCategories = sanitizeDocumentCategories(info.documentCategories);
  }
  if (Array.isArray(info.documentCustomFieldLabels)) {
    docData.documentCustomFieldLabels = sanitizeDocumentCustomFieldLabels(info.documentCustomFieldLabels);
  }
  if (info.appUpdateId !== undefined) {
    docData.appUpdateId = clampStr(info.appUpdateId, 64);
  }
  if (info.appUpdateVersion !== undefined) {
    docData.appUpdateVersion = clampStr(info.appUpdateVersion, 60);
  }
  if (info.appUpdateMessage !== undefined) {
    docData.appUpdateMessage = clampStr(info.appUpdateMessage, 500);
  }
  if (info.appUpdatePublishedAt !== undefined) {
    docData.appUpdatePublishedAt = clampStr(info.appUpdatePublishedAt, 40);
  }
  if (info.federationBadgeLabel !== undefined) {
    docData.federationBadgeLabel = clampStr(info.federationBadgeLabel, 120);
  }
  if (info.federationTitle !== undefined) {
    docData.federationTitle = clampStr(info.federationTitle, 300);
  }
  if (info.federationDescription !== undefined) {
    docData.federationDescription = clampStr(info.federationDescription, 5000);
  }
  if (info.federationLogoUrl !== undefined) {
    docData.federationLogoUrl = sanitizeImageString(
      info.federationLogoUrl || DEFAULT_FEDERATION_LOGO_URL,
      340_000
    );
  }
  if (info.federationWebsite !== undefined) {
    docData.federationWebsite = clampStr(info.federationWebsite, 500);
  }
  if (info.federationWebsiteLabel !== undefined) {
    docData.federationWebsiteLabel = clampStr(info.federationWebsiteLabel, 100);
  }
  if (info.federationRegistrationCode !== undefined) {
    docData.federationRegistrationCode = clampStr(info.federationRegistrationCode, 120);
  }
  if (info.federationHidden !== undefined) {
    docData.federationHidden = Boolean(info.federationHidden);
  }
  return docData;
}

function serializeBoardRole(role: BoardRoleConfig) {
  const vacant = isVacantBoardHolder(role.holderName);
  return {
    id: safeId(role.id),
    title: clampStr(role.title || 'Diretor', 120),
    holderName: vacant ? VACANT_BOARD_HOLDER_LABEL : clampStr((role.holderName || '').trim(), 120),
    avatarUrl: vacant ? '' : sanitizeImageString(role.avatarUrl, 390_000),
    motorcycle: vacant ? '' : clampStr(role.motorcycle, 150),
    isCustom: Boolean(role.isCustom),
    order: typeof role.order === 'number' ? Math.max(0, Math.min(1000, Math.round(role.order))) : (DEFAULT_BOARD_ROLE_ORDER.get(role.id) ?? 0),
    visibility: 'public',
    updatedAt: serverTimestamp(),
  };
}

function serializeBoardRoleContact(role: BoardRoleConfig) {
  const vacant = isVacantBoardHolder(role.holderName);
  return {
    id: safeId(role.id),
    email: vacant ? '' : clampStr(role.email, 150),
    phone: vacant ? '' : clampStr(role.phone, 40),
    boardOnly: true,
    updatedAt: serverTimestamp(),
  };
}

function sanitizeMemberCategory(raw: unknown): MemberCategory {
  if (typeof raw === 'string' && (MEMBER_CATEGORIES as string[]).includes(raw)) {
    return raw as MemberCategory;
  }
  return 'Motociclista';
}

function sanitizeFeeStatusHistory(raw: unknown): MemberFeeStatusAuditEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-30)
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => {
      const e = item as Partial<MemberFeeStatusAuditEntry>;
      return {
        id: clampStr(safeId(String(e.id || `fs_${idx}`)), 128),
        previousStatus: e.previousStatus === 'ISENTO' ? 'ISENTO' : 'PAGANTE',
        nextStatus: e.nextStatus === 'ISENTO' ? 'ISENTO' : 'PAGANTE',
        changedAt: clampStr(String(e.changedAt || ''), 40),
        changedById: clampStr(String(e.changedById || ''), 128),
        changedByName: clampStr(String(e.changedByName || 'Diretoria'), 120),
        ...(e.changedByUid ? { changedByUid: clampStr(String(e.changedByUid), 128) } : {}),
        ...(e.reason ? { reason: clampStr(String(e.reason), 300) } : {}),
      };
    });
}

function sanitizeBadgeHistory(raw: unknown): MemberBadgeAuditEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-40)
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => {
      const e = item as Partial<MemberBadgeAuditEntry>;
      return {
        id: clampStr(safeId(String(e.id || `bdg_${idx}`)), 128),
        badge: e.badge === 'O.S.S.O.' ? 'O.S.S.O.' : 'NÔMADE',
        action: e.action === 'revoked' ? 'revoked' : 'granted',
        at: clampStr(String(e.at || ''), 40),
        byId: clampStr(String(e.byId || ''), 128),
        byName: clampStr(String(e.byName || 'Diretoria'), 120),
        ...(e.byUid ? { byUid: clampStr(String(e.byUid), 128) } : {}),
        ...(e.reason ? { reason: clampStr(String(e.reason), 300) } : {}),
      };
    });
}

function sanitizeFinanceHistory(raw: unknown): FinanceHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-40)
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => {
      const e = item as Partial<FinanceHistoryEntry>;
      return {
        id: clampStr(safeId(String(e.id || `fh_${idx}`)), 128),
        action: clampStr(String(e.action || 'update'), 60),
        status: clampStr(String(e.status || ''), 40),
        at: clampStr(String(e.at || ''), 40),
        byId: clampStr(String(e.byId || ''), 128),
        byName: clampStr(String(e.byName || 'Diretoria'), 120),
        ...(e.byUid ? { byUid: clampStr(String(e.byUid), 128) } : {}),
        ...(e.reason ? { reason: clampStr(String(e.reason), 300) } : {}),
        ...(typeof e.amount === 'number' && Number.isFinite(e.amount) ? { amount: Math.max(0, e.amount) } : {}),
      };
    });
}

function sanitizeObservationHistory(raw: unknown): MemberFinancialObservationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-40)
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => {
      const e = item as Partial<MemberFinancialObservationEntry>;
      return {
        id: clampStr(safeId(String(e.id || `obs_${idx}`)), 128),
        note: clampStr(String(e.note || ''), 2000),
        updatedAt: clampStr(String(e.updatedAt || ''), 40),
        updatedById: clampStr(String(e.updatedById || ''), 128),
        updatedByName: clampStr(String(e.updatedByName || 'Diretoria'), 120),
        ...(e.updatedByUid ? { updatedByUid: clampStr(String(e.updatedByUid), 128) } : {}),
      };
    });
}

function serializeMemberPublic(user: User, uidOverride?: string) {
  const docData: Record<string, unknown> = {
    id: safeId(user.id),
    uid: clampStr(uidOverride !== undefined ? uidOverride : (user as User & { uid?: string }).uid || '', 128),
    name: clampStr(user.name || 'Integrante', 120),
    role: user.role === 'admin' || user.role === 'board' ? user.role : 'member',
    status: user.status === 'pending' || user.status === 'suspended' ? user.status : 'active',
    sosApproved: Boolean(user.sosApproved),
    motorcycle: clampStr(user.motorcycle || '', 150),
    joinedYear: Math.min(2100, Math.max(2000, Math.round(Number(user.joinedYear) || new Date().getFullYear()))),
    canEditFinances: Boolean(user.canEditFinances),
    memberCategory: sanitizeMemberCategory(user.memberCategory),
    nomadeBadge: Boolean(user.nomadeBadge),
    ossoBadge: Boolean(user.ossoBadge),
    clubDirectory: true,
    updatedAt: serverTimestamp(),
  };
  if (user.nickname && user.nickname.trim()) {
    docData.nickname = clampStr(user.nickname.trim(), 80);
  }
  if (user.joinedDate) {
    docData.joinedDate = clampStr(user.joinedDate, 20);
  }
  if (user.birthDate) {
    docData.birthDate = clampStr(user.birthDate, 20);
  }
  if (user.boardRoleId) {
    docData.boardRoleId = clampStr(user.boardRoleId, 128);
  }
  if (user.customRoleTitle && user.customRoleTitle.trim()) {
    docData.customRoleTitle = clampStr(user.customRoleTitle.trim(), 80);
  }
  if (user.avatarUrl) {
    docData.avatarUrl = sanitizeImageString(user.avatarUrl, 390_000);
  }
  if (user.isMinor !== undefined) {
    docData.isMinor = Boolean(user.isMinor);
  }
  if (user.responsibleMemberId) {
    docData.responsibleMemberId = clampStr(user.responsibleMemberId, 128);
  }
  if (user.responsibleMemberName) {
    docData.responsibleMemberName = clampStr(user.responsibleMemberName, 120);
  }
  if (user.feeStatus === 'PAGANTE' || user.feeStatus === 'ISENTO') {
    docData.feeStatus = user.feeStatus;
  }
  if (user.feeStatusUpdatedAt) docData.feeStatusUpdatedAt = clampStr(user.feeStatusUpdatedAt, 40);
  if (user.feeStatusUpdatedById) docData.feeStatusUpdatedById = clampStr(user.feeStatusUpdatedById, 128);
  if (user.feeStatusUpdatedByName) docData.feeStatusUpdatedByName = clampStr(user.feeStatusUpdatedByName, 120);
  const feeHistory = sanitizeFeeStatusHistory(user.feeStatusHistory);
  if (feeHistory.length > 0) docData.feeStatusHistory = feeHistory;

  if (user.nomadeGrantedAt) docData.nomadeGrantedAt = clampStr(user.nomadeGrantedAt, 40);
  if (user.nomadeGrantedById) docData.nomadeGrantedById = clampStr(user.nomadeGrantedById, 128);
  if (user.nomadeGrantedByName) docData.nomadeGrantedByName = clampStr(user.nomadeGrantedByName, 120);
  if (user.ossoGrantedAt) docData.ossoGrantedAt = clampStr(user.ossoGrantedAt, 40);
  if (user.ossoGrantedById) docData.ossoGrantedById = clampStr(user.ossoGrantedById, 128);
  if (user.ossoGrantedByName) docData.ossoGrantedByName = clampStr(user.ossoGrantedByName, 120);
  const badgeHist = sanitizeBadgeHistory(user.badgeHistory);
  if (badgeHist.length > 0) docData.badgeHistory = badgeHist;

  return docData;
}

function serializeMemberPublicProfile(user: User, uidOverride?: string) {
  const docData: Record<string, unknown> = {
    id: safeId(user.id),
    uid: clampStr(uidOverride !== undefined ? uidOverride : (user as User & { uid?: string }).uid || '', 128),
    name: clampStr(user.name || 'Integrante', 120),
    phone: clampStr(user.phone || '', 40),
    joinedYear: Math.min(2100, Math.max(2000, Math.round(Number(user.joinedYear) || new Date().getFullYear()))),
    clubDirectory: true,
    updatedAt: serverTimestamp(),
  };
  if (user.nickname && user.nickname.trim()) {
    docData.nickname = clampStr(user.nickname.trim(), 80);
  }
  if (user.avatarUrl) {
    docData.avatarUrl = sanitizeImageString(user.avatarUrl, 390_000);
  }
  if (user.birthDate) {
    docData.birthDate = clampStr(user.birthDate, 20);
  }
  if (user.joinedDate) {
    docData.joinedDate = clampStr(user.joinedDate, 20);
  }
  return docData;
}

function serializeMemberPrivate(user: User, uidOverride?: string) {
  const docData: Record<string, unknown> = {
    id: safeId(user.id),
    uid: clampStr(uidOverride !== undefined ? uidOverride : (user as User & { uid?: string }).uid || '', 128),
    email: clampStr((user.email || '').toLowerCase().trim(), 150),
    phone: clampStr(user.phone || '', 40),
    updatedAt: serverTimestamp(),
  };
  if (user.bloodType) {
    docData.bloodType = clampStr(user.bloodType, 10);
  }
  if (user.emergencyContact) {
    docData.emergencyContact = clampStr(user.emergencyContact, 150);
  }
  return docData;
}

function serializeUserLink(uid: string, user: User) {
  const docData: Record<string, unknown> = {
    uid: safeId(uid),
    memberId: safeId(user.id),
    email: clampStr((user.email || '').toLowerCase().trim(), 150),
    role: user.role === 'admin' || user.role === 'board' ? user.role : 'member',
    status: user.status === 'pending' || user.status === 'suspended' ? user.status : 'active',
    sosApproved: Boolean(user.sosApproved),
    canEditFinances: Boolean(user.canEditFinances),
    isFinancialDirector: isFinancialDirectorUser(user),
    updatedAt: serverTimestamp(),
  };
  if (user.boardRoleId) {
    docData.boardRoleId = clampStr(user.boardRoleId, 128);
  }
  return docData;
}

function serializeRideEvent(ev: RideEvent) {
  const cleanEndDate = ev.endDate && ev.endDate.trim() && ev.endDate >= ev.date ? clampStr(ev.endDate.trim(), 20) : '';
  const docData: Record<string, unknown> = {
    id: safeId(ev.id),
    title: clampStr(ev.title || 'Evento', 200),
    description: clampStr(ev.description || '', 5000),
    date: clampStr(ev.date || '', 20),
    time: clampStr(ev.time || '08:00', 10),
    meetingPoint: clampStr(ev.meetingPoint || '', 300),
    destination: clampStr(ev.destination || '', 300),
    distanceKm: Math.max(0, Math.min(100000, Number(ev.distanceKm) || 0)),
    averageSpeed: clampStr(ev.averageSpeed || '', 80),
    roadCaptain: clampStr(ev.roadCaptain || '', 120),
    isExclusiveBoard: Boolean(ev.isExclusiveBoard),
    isPinned: Boolean(ev.isPinned),
    attendees: Array.isArray(ev.attendees) ? ev.attendees.slice(0, 500).map((a) => clampStr(String(a), 128)) : [],
    updatedAt: serverTimestamp(),
  };
  if (cleanEndDate) {
    docData.endDate = cleanEndDate;
  }
  if (ev.imageUrl) {
    docData.imageUrl = sanitizeImageString(ev.imageUrl, 390_000);
  }
  return docData;
}

function serializeSupporter(supporter: Supporter, idx = 0) {
  const docData: Record<string, unknown> = {
    id: safeId(supporter.id),
    name: clampStr(supporter.name || 'Apoiador', 150),
    type: supporter.type === 'company' ? 'company' : 'individual',
    description: clampStr(supporter.description || '', 2000),
    photoUrl: sanitizeImageString(supporter.photoUrl || '', 390_000),
    order: typeof supporter.order === 'number' ? Math.max(0, Math.min(1000, Math.round(supporter.order))) : idx,
    visibility: 'public',
    updatedAt: serverTimestamp(),
  };
  if (supporter.city) docData.city = clampStr(supporter.city, 120);
  if (supporter.contact) docData.contact = clampStr(supporter.contact, 120);
  if (supporter.website) docData.website = clampStr(supporter.website, 300);
  return docData;
}

function serializeForumPost(post: ForumPost, authorUid: string, isCreate: boolean, existingCreatedAt?: unknown) {
  const docData: Record<string, unknown> = {
    id: safeId(post.id),
    authorUid: clampStr(authorUid, 128),
    authorId: clampStr(post.authorId, 128),
    authorName: clampStr(post.authorName || 'Integrante', 150),
    authorRole: clampStr(post.authorRole || 'member', 40),
    title: clampStr(post.title || 'Tópico', 200),
    content: clampStr(post.content || '', 10000),
    category: ['trip_report', 'route_tips', 'mechanics', 'general'].includes(post.category)
      ? post.category
      : 'general',
    images: Array.isArray(post.images)
      ? post.images.slice(0, 3).map((img) => sanitizeImageString(img, 390_000)).filter(Boolean)
      : [],
    likes: Array.isArray(post.likes) ? post.likes.slice(0, 500).map((l) => clampStr(String(l), 128)) : [],
    comments: Array.isArray(post.comments) ? post.comments.slice(0, 200) : [],
    clubOnly: true,
    createdAt: isCreate ? serverTimestamp() : (existingCreatedAt || serverTimestamp()),
    updatedAt: serverTimestamp(),
  };
  if (post.authorAvatar) {
    docData.authorAvatar = sanitizeImageString(post.authorAvatar, 390_000);
  }
  return docData;
}

function serializeSOSAlert(alert: SOSAlert, authorUid: string, isCreate: boolean, existingCreatedAt?: unknown) {
  const docData: Record<string, unknown> = {
    id: safeId(alert.id),
    authorUid: clampStr(authorUid, 128),
    memberId: clampStr(alert.memberId, 128),
    memberName: clampStr(alert.memberName || 'Integrante', 120),
    memberPhone: clampStr(alert.memberPhone || '', 40),
    memberMotorcycle: clampStr(alert.memberMotorcycle || '', 150),
    type: ['mechanical', 'tire', 'accident', 'fuel', 'medical', 'support'].includes(alert.type)
      ? alert.type
      : 'support',
    description: clampStr(alert.description || 'Socorro na estrada', 1000),
    locationAddress: clampStr(alert.locationAddress || '', 300),
    status: ['active', 'in_progress', 'resolved'].includes(alert.status) ? alert.status : 'active',
    responders: Array.isArray(alert.responders) ? alert.responders.slice(0, 100) : [],
    sosOnly: true,
    createdAt: isCreate ? serverTimestamp() : (existingCreatedAt || serverTimestamp()),
    updatedAt: serverTimestamp(),
  };
  if (alert.bloodType) docData.bloodType = clampStr(alert.bloodType, 10);
  if (typeof alert.latitude === 'number' && !Number.isNaN(alert.latitude)) docData.latitude = alert.latitude;
  if (typeof alert.longitude === 'number' && !Number.isNaN(alert.longitude)) docData.longitude = alert.longitude;
  return docData;
}

function serializeFee(fee: MemberMonthlyFee, memberUid: string, memberEmail: string) {
  const docData: Record<string, unknown> = {
    id: safeId(fee.id),
    memberId: safeId(fee.memberId),
    memberUid: clampStr(memberUid, 128),
    memberEmail: clampStr(memberEmail.toLowerCase().trim(), 150),
    month: clampStr(fee.month || '', 20),
    monthName: clampStr(fee.monthName || '', 40),
    amount: Math.max(0, Number(fee.amount) || 0),
    dueDate: clampStr(fee.dueDate || '', 20),
    status: ['paid', 'pending', 'overdue'].includes(fee.status) ? fee.status : 'pending',
    updatedAt: serverTimestamp(),
  };
  if (fee.memberName) docData.memberName = clampStr(fee.memberName, 120);
  if (fee.paidAt) docData.paidAt = clampStr(fee.paidAt, 40);
  if (fee.pixTxId) docData.pixTxId = clampStr(fee.pixTxId, 60);
  if (fee.notes) docData.notes = clampStr(fee.notes, 500);
  if (fee.receiptUrl) docData.receiptUrl = sanitizeImageString(fee.receiptUrl, 390_000);
  if (fee.receiptUploadedAt) docData.receiptUploadedAt = clampStr(fee.receiptUploadedAt, 40);
  if (fee.receiptFileName) docData.receiptFileName = clampStr(fee.receiptFileName, 120);
  if (typeof fee.partialPaidAmount === 'number' && Number.isFinite(fee.partialPaidAmount)) {
    docData.partialPaidAmount = Math.max(0, fee.partialPaidAmount);
  }
  if (fee.settlementStatus) {
    docData.settlementStatus = clampStr(fee.settlementStatus, 30);
  }
  if (fee.writeOffReason) docData.writeOffReason = clampStr(fee.writeOffReason, 500);
  if (fee.writeOffAt) docData.writeOffAt = clampStr(fee.writeOffAt, 40);
  if (fee.writeOffById) docData.writeOffById = clampStr(fee.writeOffById, 128);
  if (fee.writeOffByName) docData.writeOffByName = clampStr(fee.writeOffByName, 120);
  if (typeof fee.exerciseYear === 'number' && Number.isFinite(fee.exerciseYear)) {
    docData.exerciseYear = Math.round(fee.exerciseYear);
  }
  const hist = sanitizeFinanceHistory(fee.history);
  if (hist.length > 0) docData.history = hist;
  return docData;
}

function serializeFeeSchedule(entry: FeeRateScheduleEntry) {
  const validStatus = ['scheduled', 'active', 'applied', 'cancelled'].includes(entry.status)
    ? entry.status
    : 'scheduled';
  const docData: Record<string, unknown> = {
    id: safeId(entry.id),
    previousAmount: Math.min(100000, Math.max(0, Number(entry.previousAmount) || 0)),
    newAmount: Math.min(100000, Math.max(0, Number(entry.newAmount) || 0)),
    effectiveCompetency: clampStr(entry.effectiveCompetency, 20),
    status: validStatus,
    createdById: clampStr(entry.createdById || 'user-admin', 128),
    createdByName: clampStr(entry.createdByName || 'Diretoria', 120),
    createdAt: clampStr(entry.createdAt || new Date().toISOString(), 40),
    clubOnly: true,
    updatedAt: serverTimestamp(),
  };
  if (entry.effectiveDate) docData.effectiveDate = clampStr(entry.effectiveDate, 20);
  if (entry.reason || entry.justification) {
    docData.reason = clampStr(entry.reason || entry.justification || '', 500);
  }
  if (entry.createdByUid) docData.createdByUid = clampStr(entry.createdByUid, 128);
  if (entry.cancelledAt) docData.cancelledAt = clampStr(entry.cancelledAt, 40);
  if (entry.cancelledById) docData.cancelledById = clampStr(entry.cancelledById, 128);
  if (entry.cancelledByName) docData.cancelledByName = clampStr(entry.cancelledByName, 120);
  return docData;
}

function serializeManualReceipt(
  entry: ManualFinancialEntry,
  memberUid?: string,
  memberEmail?: string
) {
  const isUnidentified = entry.identificationStatus === 'unidentified' || !entry.memberId;
  const docData: Record<string, unknown> = {
    id: safeId(entry.id),
    identificationStatus: isUnidentified ? 'unidentified' : 'identified',
    originType: ['fee', 'tab', 'donation', 'event', 'other'].includes(entry.originType)
      ? entry.originType
      : 'other',
    amount: Math.min(1000000, Math.max(0, Number(entry.amount) || 0)),
    paymentDate: clampStr(entry.paymentDate || '', 20),
    paymentMethod: clampStr(entry.paymentMethod || 'pix', 30),
    description: clampStr(entry.description || '', 500),
    status: ['active', 'confirmed', 'reversed'].includes(entry.status) ? entry.status : 'active',
    createdAt: clampStr(entry.createdAt || new Date().toISOString(), 40),
    createdById: clampStr(entry.createdById || 'user-admin', 128),
    createdByName: clampStr(entry.createdByName || 'Diretoria', 120),
    boardOnly: isUnidentified,
    updatedAt: serverTimestamp(),
  };
  if (entry.idempotencyKey) docData.idempotencyKey = clampStr(entry.idempotencyKey, 128);
  if (entry.memberId) docData.memberId = clampStr(entry.memberId, 128);
  if (memberUid || entry.memberUid) docData.memberUid = clampStr(memberUid || entry.memberUid || '', 128);
  if (memberEmail || entry.memberEmail) {
    docData.memberEmail = clampStr((memberEmail || entry.memberEmail || '').toLowerCase().trim(), 150);
  }
  if (entry.memberName) docData.memberName = clampStr(entry.memberName, 120);
  if (entry.competencyMonth || entry.competency) {
    docData.competencyMonth = clampStr(entry.competencyMonth || entry.competency || '', 20);
  }
  if (entry.notes) docData.notes = clampStr(entry.notes, 500);
  if (entry.receiptUrl) docData.receiptUrl = sanitizeImageString(entry.receiptUrl, 390_000);
  if (entry.receiptFileName) docData.receiptFileName = clampStr(entry.receiptFileName, 120);
  if (entry.receiptUploadedAt) docData.receiptUploadedAt = clampStr(entry.receiptUploadedAt, 40);
  if (entry.linkedFeeId) docData.linkedFeeId = clampStr(entry.linkedFeeId, 128);
  if (entry.linkedFeeMonth) docData.linkedFeeMonth = clampStr(entry.linkedFeeMonth, 20);
  if (entry.linkedAt) docData.linkedAt = clampStr(entry.linkedAt, 40);
  if (entry.linkedById) docData.linkedById = clampStr(entry.linkedById, 128);
  if (entry.linkedByName) docData.linkedByName = clampStr(entry.linkedByName, 120);
  if (entry.reversalReason) docData.reversalReason = clampStr(entry.reversalReason, 500);
  if (entry.reversedAt) docData.reversedAt = clampStr(entry.reversedAt, 40);
  if (entry.reversedById) docData.reversedById = clampStr(entry.reversedById, 128);
  if (entry.reversedByName) docData.reversedByName = clampStr(entry.reversedByName, 120);
  if (entry.createdByUid) docData.createdByUid = clampStr(entry.createdByUid, 128);
  return docData;
}

function serializeMemberTitle(entry: MemberHonoraryTitle) {
  const docData: Record<string, unknown> = {
    id: safeId(entry.id),
    memberId: clampStr(entry.memberId, 128),
    memberName: clampStr(entry.memberName || 'Integrante', 120),
    titleType:
      entry.titleType === 'INTEGRANTE BENEMÉRITO'
        ? 'INTEGRANTE BENEMÉRITO'
        : 'INTEGRANTE HONORÁRIO',
    grantedAt: clampStr(entry.grantedAt || '', 40),
    grantedById: clampStr(entry.grantedById || 'user-admin', 128),
    grantedByName: clampStr(entry.grantedByName || 'Administrador Geral', 120),
    status: entry.status === 'revoked' ? 'revoked' : 'active',
    clubOnly: true,
    updatedAt: serverTimestamp(),
  };
  if (entry.customLabel) docData.customLabel = clampStr(entry.customLabel, 120);
  if (entry.grantedByUid) docData.grantedByUid = clampStr(entry.grantedByUid, 128);
  if (entry.notes) docData.notes = clampStr(entry.notes, 500);
  if (entry.reason || entry.justification) {
    docData.reason = clampStr(entry.reason || entry.justification || '', 500);
  }
  if (entry.revokedAt) docData.revokedAt = clampStr(entry.revokedAt, 40);
  if (entry.revokedById) docData.revokedById = clampStr(entry.revokedById, 128);
  if (entry.revokedByName) docData.revokedByName = clampStr(entry.revokedByName, 120);
  if (entry.revokeReason) docData.revokeReason = clampStr(entry.revokeReason, 500);
  return docData;
}

function serializeWalkInClient(client: WalkInClient) {
  const validStatus = ['active', 'inactive', 'archived'].includes(client.status)
    ? client.status
    : 'active';
  const docData: Record<string, unknown> = {
    id: safeId(client.id),
    name: clampStr(client.name || 'Cliente Avulso', 120),
    status: validStatus,
    createdAt: clampStr(client.createdAt || new Date().toISOString(), 40),
    createdById: clampStr(client.createdById || 'user-admin', 128),
    createdByName: clampStr(client.createdByName || 'Diretoria', 120),
    financeOnly: true,
    updatedAt: serverTimestamp(),
  };
  if (client.phone) docData.phone = clampStr(client.phone, 40);
  if (client.notes) docData.notes = clampStr(client.notes, 500);
  if (client.createdByUid) docData.createdByUid = clampStr(client.createdByUid, 128);
  return docData;
}

function serializeWalkInTab(tab: WalkInTabRecord) {
  const docData: Record<string, unknown> = {
    id: safeId(tab.id),
    clientId: clampStr(tab.clientId, 128),
    clientName: clampStr(tab.clientName || 'Cliente Avulso', 120),
    status: ['open', 'partial', 'paid', 'cancelled'].includes(tab.status) ? tab.status : 'open',
    items: (Array.isArray(tab.items) ? tab.items : []).slice(0, 100),
    payments: (Array.isArray(tab.payments) ? tab.payments : []).slice(0, 100),
    totalAmount: Math.max(0, Number(tab.totalAmount) || 0),
    paidAmount: Math.max(0, Number(tab.paidAmount) || 0),
    balanceDue: Math.max(0, Number(tab.balanceDue) || 0),
    openedAt: clampStr(tab.openedAt || new Date().toISOString().slice(0, 10), 40),
    createdById: clampStr(tab.createdById || 'user-admin', 128),
    createdByName: clampStr(tab.createdByName || 'Diretoria', 120),
    financeOnly: true,
    updatedAt: serverTimestamp(),
  };
  if (tab.closedAt) docData.closedAt = clampStr(tab.closedAt, 40);
  if (tab.notes) docData.notes = clampStr(tab.notes, 500);
  if (tab.createdByUid) docData.createdByUid = clampStr(tab.createdByUid, 128);
  return docData;
}

function serializeExpense(exp: ClubExpense) {
  const docData: Record<string, unknown> = {
    id: safeId(exp.id),
    title: clampStr(exp.title || 'Despesa', 200),
    category: clampStr(safeId(exp.category || 'outros'), 64) || 'outros',
    amount: Math.max(0, Number(exp.amount) || 0),
    date: clampStr(exp.date || '', 20),
    status: exp.status === 'pending' ? 'pending' : 'paid',
    boardOnly: true,
    updatedAt: serverTimestamp(),
  };
  if (exp.paidBy) docData.paidBy = clampStr(exp.paidBy, 120);
  if (exp.notes) docData.notes = clampStr(exp.notes, 500);
  return docData;
}

function serializeTabDebt(tab: MemberTabDebt, memberUid: string, memberEmail: string) {
  const docData: Record<string, unknown> = {
    id: safeId(tab.id),
    memberId: safeId(tab.memberId),
    memberUid: clampStr(memberUid, 128),
    memberEmail: clampStr(memberEmail.toLowerCase().trim(), 150),
    memberName: clampStr(tab.memberName || 'Integrante', 120),
    itemDescription: clampStr(tab.itemDescription || 'Consumo', 200),
    category: ['bar', 'churrasco', 'loja_patch', 'outros'].includes(tab.category) ? tab.category : 'bar',
    amount: Math.max(0, Number(tab.amount) || 0),
    date: clampStr(tab.date || '', 20),
    status: tab.status === 'paid' ? 'paid' : 'pending',
    updatedAt: serverTimestamp(),
  };
  if (tab.paidAt) docData.paidAt = clampStr(tab.paidAt, 40);
  if (tab.notes) docData.notes = clampStr(tab.notes, 500);
  if (tab.receiptUrl) docData.receiptUrl = sanitizeImageString(tab.receiptUrl, 390_000);
  if (tab.receiptUploadedAt) docData.receiptUploadedAt = clampStr(tab.receiptUploadedAt, 40);
  if (tab.receiptFileName) docData.receiptFileName = clampStr(tab.receiptFileName, 120);
  if (typeof tab.partialPaidAmount === 'number' && Number.isFinite(tab.partialPaidAmount)) {
    docData.partialPaidAmount = Math.max(0, tab.partialPaidAmount);
  }
  if (tab.settlementStatus) {
    docData.settlementStatus = clampStr(tab.settlementStatus, 30);
  }
  if (tab.writeOffReason) docData.writeOffReason = clampStr(tab.writeOffReason, 500);
  if (tab.writeOffAt) docData.writeOffAt = clampStr(tab.writeOffAt, 40);
  if (tab.writeOffById) docData.writeOffById = clampStr(tab.writeOffById, 128);
  if (tab.writeOffByName) docData.writeOffByName = clampStr(tab.writeOffByName, 120);
  if (typeof tab.exerciseYear === 'number' && Number.isFinite(tab.exerciseYear)) {
    docData.exerciseYear = Math.round(tab.exerciseYear);
  }
  const hist = sanitizeFinanceHistory(tab.history);
  if (hist.length > 0) docData.history = hist;
  return docData;
}

function serializeFinancialNote(note: MemberFinancialNote, uid: string) {
  const docData: Record<string, unknown> = {
    id: safeId(note.memberId),
    memberId: safeId(note.memberId),
    note: clampStr(note.note || '', 2000),
    updatedAt: clampStr(note.updatedAt || new Date().toISOString(), 40),
    updatedById: clampStr(note.updatedById || 'user-admin', 128),
    updatedByName: clampStr(note.updatedByName || 'Diretoria', 120),
    updatedByUid: clampStr(note.updatedByUid || uid, 128),
    financeOnly: true,
    serverUpdatedAt: serverTimestamp(),
  };
  if (note.memberName) docData.memberName = clampStr(note.memberName, 120);
  const hist = sanitizeObservationHistory(note.history);
  if (hist.length > 0) docData.history = hist;
  return docData;
}

function serializeBoardChat(msg: BoardChatMessage, authorUid: string) {
  const docData: Record<string, unknown> = {
    id: safeId(msg.id),
    authorUid: clampStr(authorUid, 128),
    senderId: clampStr(msg.senderId, 128),
    senderName: clampStr(msg.senderName || 'Diretor', 120),
    senderRole: clampStr(msg.senderRole || 'Diretoria', 60),
    message: clampStr(msg.message || '', 2000),
    boardOnly: true,
    timestamp: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (msg.senderAvatar) {
    docData.senderAvatar = sanitizeImageString(msg.senderAvatar, 390_000);
  }
  return docData;
}

const DOC_CHUNK_SIZE = 550_000;
const MAX_DOC_CHUNKS = 65;

function serializeClubDocument(
  item: ClubDocument,
  authorUid: string,
  inlineDataUrl: string,
  chunkCount: number,
  isCreate: boolean,
  existingCreatedAt?: unknown
) {
  const customFields = sanitizeDocumentCustomFields(item.customFields);
  const docData: Record<string, unknown> = {
    id: safeId(item.id),
    title: clampStr(item.title || item.fileName || 'Documento', 200),
    category: clampStr(safeId(item.category || 'outros'), 64) || 'outros',
    fileType: item.fileType === 'image' ? 'image' : 'pdf',
    fileName: clampStr(item.fileName || 'documento', 180),
    mimeType: clampStr(item.mimeType || (item.fileType === 'image' ? 'image/jpeg' : 'application/pdf'), 100),
    fileSizeBytes: Math.max(0, Math.min(26_000_000, Math.round(Number(item.fileSizeBytes) || 0))),
    fileDataUrl: inlineDataUrl,
    chunkCount: Math.max(0, Math.min(MAX_DOC_CHUNKS, Math.round(chunkCount))),
    uploadedById: clampStr(item.uploadedById || 'user-admin', 128),
    uploadedByName: clampStr(item.uploadedByName || 'Integrante', 120),
    authorUid: clampStr(authorUid, 128),
    date: clampStr(item.date || new Date().toISOString().split('T')[0], 20),
    clubOnly: true,
    createdAt: isCreate ? serverTimestamp() : (existingCreatedAt || serverTimestamp()),
    updatedAt: serverTimestamp(),
  };
  if (item.description && item.description.trim()) {
    docData.description = clampStr(item.description.trim(), 2000);
  }
  if (customFields.length > 0) {
    docData.customFields = customFields;
  }
  return docData;
}

function serializeClubGovernance(docItem: ClubGovernanceDoc) {
  const cleanSections = (Array.isArray(docItem.sections) ? docItem.sections : [])
    .slice(0, 80)
    .map((sec, idx) => ({
      id: clampStr(safeId(sec.id || `sec_${idx}`), 128),
      heading: clampStr(sec.heading || `Seção ${idx + 1}`, 300),
      content: clampStr(sec.content || '', 20000),
    }));

  const docData: Record<string, unknown> = {
    id: safeId(docItem.id),
    kind: docItem.kind === 'rdi' ? 'rdi' : 'estatuto',
    title: clampStr(docItem.title || (docItem.kind === 'rdi' ? 'RDI' : 'Estatuto Social'), 200),
    versionLabel: clampStr(docItem.versionLabel || '', 100),
    preamble: clampStr(docItem.preamble || '', 5000),
    sections: cleanSections,
    clubOnly: true,
    updatedAt: serverTimestamp(),
  };
  if (docItem.updatedById) docData.updatedById = clampStr(docItem.updatedById, 128);
  if (docItem.updatedByName) docData.updatedByName = clampStr(docItem.updatedByName, 120);
  return docData;
}

// --- In-memory snapshot caches to compute clean diffs & preserve metadata ---

const metaStore = {
  isSeededInFirestore: false,
  memberUidByMemberId: new Map<string, string>(),
  memberEmailByMemberId: new Map<string, string>(),
  forumAuthorById: new Map<string, string>(),
  forumCreatedAtById: new Map<string, unknown>(),
  sosAuthorById: new Map<string, string>(),
  sosCreatedAtById: new Map<string, unknown>(),
  boardChatAuthorById: new Map<string, string>(),
  documentAuthorById: new Map<string, string>(),
  documentCreatedAtById: new Map<string, unknown>(),
  announcementCreatedAtById: new Map<string, unknown>(),
  assembledDocCache: new Map<string, string>(),
  boardContactsById: new Map<string, { email: string; phone: string }>(),
  membersPublicById: new Map<string, User>(),
  membersPrivateById: new Map<string, Partial<User> & { uid?: string }>(),
  lastSnapshotJson: new Map<string, string>(),
};

export interface SyncCallbacks {
  onClubInfo: (info: ClubInfo) => void;
  onBoardRoles: (roles: BoardRoleConfig[]) => void;
  onUsers: (users: User[]) => void;
  onCurrentUser: (user: User | null) => void;
  onEvents: (events: RideEvent[]) => void;
  onForumPosts: (posts: ForumPost[]) => void;
  onSOSAlerts: (alerts: SOSAlert[]) => void;
  onFees: (fees: MemberMonthlyFee[]) => void;
  onFeeSchedules?: (schedules: FeeRateScheduleEntry[]) => void;
  onManualReceipts?: (entries: ManualFinancialEntry[]) => void;
  onMemberTitles?: (titles: MemberHonoraryTitle[]) => void;
  onWalkInClients?: (clients: WalkInClient[]) => void;
  onWalkInTabs?: (tabs: WalkInTabRecord[]) => void;
  onExpenses: (expenses: ClubExpense[]) => void;
  onTabs: (tabs: MemberTabDebt[]) => void;
  onBoardChat: (chat: BoardChatMessage[]) => void;
  onSupporters?: (supporters: Supporter[]) => void;
  onPublicProfiles?: (profiles: MemberPublicProfile[]) => void;
  onFinancialNotes?: (notes: MemberFinancialNote[]) => void;
  onPublicAnnouncements?: (items: ClubAnnouncement[]) => void;
  onDocuments?: (docs: ClubDocument[]) => void;
  onGovernance?: (docs: ClubGovernanceDoc[]) => void;
  onAnnouncements?: (items: ClubAnnouncement[]) => void;
  onAuditLogs?: (logs: AdminAuditEntry[]) => void;
  onDeletedBackups?: (items: DeletedRecordBackup[]) => void;
  onQuotaStatusChange?: (status: QuotaSyncStatus) => void;
  onSyncError?: (msg: string) => void;
}

export interface SessionResolutionResult {
  user: User | null;
  needsRegistration: boolean;
  needsEmailVerification?: boolean;
  fromLocalFallback?: boolean;
}

let activeCallbacks: SyncCallbacks | null = null;
let sosUnsub: Unsubscribe | null = null;
let boardChatUnsub: Unsubscribe | null = null;
const sectionSyncedAt = new Map<string, number>();
let activePrivateUser: User | null = null;
let activePrivateFbUser: FirebaseUser | null = null;
let activeSectionName = 'history';
let currentResolvedUser: User | null = null;
const pendingSessionResolves = new Map<string, Promise<SessionResolutionResult>>();

const CACHE_TTL_30M_MS = 30 * 60 * 1000;
const PUBLIC_CACHE_TTL_MS = CACHE_TTL_30M_MS;
const CADASTRAL_CACHE_TTL_MS = CACHE_TTL_30M_MS;
const FINANCE_CACHE_TTL_MS = CACHE_TTL_30M_MS;
const SECTION_TTL_MS = CACHE_TTL_30M_MS;

function trackSnapshotTelemetry(
  module: string,
  snap: { size?: number; exists?: () => boolean; metadata?: { fromCache?: boolean } },
  context: TelemetryReadContext = 'listener'
) {
  const count = typeof snap.size === 'number' ? Math.max(1, snap.size) : snap.exists?.() ? 1 : 1;
  if (snap.metadata?.fromCache) {
    telemetryMonitor.recordCacheHit('indexeddb', module, count, 'Cache local Firestore');
  } else {
    telemetryMonitor.recordRead(module, count, context);
  }
}

const quotaBreaker = createQuotaCircuitBreaker({
  cooldownMs: CACHE_TTL_30M_MS,
  persistInStorage: true,
});
const requestDedupe = createRequestDeduplicator();

quotaBreaker.subscribe((status) => {
  activeCallbacks?.onQuotaStatusChange?.(status);
});

function stopBoardChatListener() {
  if (boardChatUnsub) {
    try {
      boardChatUnsub();
    } catch {
      // Ignore unsubscribe error
    }
    boardChatUnsub = null;
  }
}

function stopSosListener() {
  if (sosUnsub) {
    try {
      sosUnsub();
    } catch {
      // Ignore unsubscribe error
    }
    sosUnsub = null;
  }
}

function handleQuotaOrListenerError(err: unknown, op: OperationType, path: string) {
  const errMsg = err instanceof Error ? err.message : String(err);
  if (isQuotaError(err)) {
    telemetryMonitor.recordError(path, errMsg, true);
    const status = quotaBreaker.trip(err);
    activeCallbacks?.onQuotaStatusChange?.(status);
    activeCallbacks?.onSyncError?.(QUOTA_BANNER_MESSAGE);
    FirestoreSync.stopPublicListeners();
    FirestoreSync.stopPrivateListeners();
    return;
  }
  if (isOfflineOrNetworkError(err)) {
    telemetryMonitor.recordError(path, errMsg, false);
    console.debug(`Listener offline/transient notice on ${path}:`, err);
    return;
  }
  if (isPermissionOrAuthError(err)) {
    telemetryMonitor.recordError(path, errMsg, false);
    console.warn(`Listener permission notice on ${path}:`, err);
    return;
  }
  telemetryMonitor.recordError(path, errMsg, false);
  console.warn(`Listener error on ${path} (${op}):`, err);
}

function notifySyncError(err: unknown, contextMsg: string) {
  if (isQuotaError(err)) {
    const status = quotaBreaker.trip(err);
    activeCallbacks?.onQuotaStatusChange?.(status);
    activeCallbacks?.onSyncError?.(QUOTA_BANNER_MESSAGE);
    return;
  }
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('exceeds the maximum allowed size') || lower.includes('maximum size')) {
    activeCallbacks?.onSyncError?.(
      `${contextMsg}: as fotos/textos excederam o tamanho máximo permitido pela nuvem. Reduza a quantidade de fotos ou escolha imagens menores.`
    );
  } else if (raw.includes('permission-denied') || raw.includes('Missing or insufficient permissions')) {
    activeCallbacks?.onSyncError?.(
      `${contextMsg}: conecte uma conta com permissão de Administrador e e-mail verificado para salvar na nuvem.`
    );
  } else if (isOfflineOrNetworkError(err)) {
    activeCallbacks?.onSyncError?.(
      `${contextMsg}: sem conexão estável no momento. Tente novamente quando a internet retornar.`
    );
  } else {
    activeCallbacks?.onSyncError?.(`${contextMsg}: erro ao sincronizar com a nuvem.`);
  }
}

export interface LocalSeedData {
  clubInfo?: ClubInfo;
  boardRoles?: BoardRoleConfig[];
  users?: User[];
  events?: RideEvent[];
  forumPosts?: ForumPost[];
  sosAlerts?: SOSAlert[];
  fees?: MemberMonthlyFee[];
  expenses?: ClubExpense[];
  tabs?: MemberTabDebt[];
  boardChat?: BoardChatMessage[];
  supporters?: Supporter[];
}

function ensureCloudAuth(throwOnError = false): FirebaseUser | null {
  if (quotaBreaker.isBlocked()) {
    if (throwOnError) {
      throw new QuotaWriteBlockedError();
    }
    activeCallbacks?.onSyncError?.(QUOTA_BANNER_MESSAGE);
    return null;
  }
  if (!auth.currentUser) {
    const msg = 'Faça login com sua conta para salvar alterações na nuvem permanentemente.';
    activeCallbacks?.onSyncError?.(msg);
    if (throwOnError) {
      throw new Error(msg);
    }
    return null;
  }
  return auth.currentUser;
}

function mergeMembersIntoUsers(): User[] {
  const result: User[] = [];
  metaStore.membersPublicById.forEach((pub, id) => {
    const priv = metaStore.membersPrivateById.get(id);
    const merged: User = {
      ...pub,
      email: priv?.email || pub.email || '',
      phone: priv?.phone || pub.phone || '',
      bloodType: priv?.bloodType || pub.bloodType,
      emergencyContact: priv?.emergencyContact || pub.emergencyContact,
    };
    if (priv?.uid) metaStore.memberUidByMemberId.set(id, priv.uid);
    if (merged.email) metaStore.memberEmailByMemberId.set(id, merged.email.toLowerCase());
    result.push(merged);
  });
  return result;
}

function mergeBoardRolesWithContacts(publicRoles: BoardRoleConfig[]): BoardRoleConfig[] {
  return sortBoardRoles(
    publicRoles.map((r) => {
      const contact = metaStore.boardContactsById.get(r.id);
      return {
        ...r,
        email: contact?.email || r.email || '',
        phone: contact?.phone || r.phone || '',
      };
    })
  );
}

let latestPublicBoardRoles: BoardRoleConfig[] = [];
let lastPublicServerRefreshMs = 0;
let hasServerBoardRolesSnap = false;
let hasServerMembersSnap = false;
let hasServerMembersPrivateSnap = false;
let hasAutoReconciledBoardRoles = false;

function maybeAutoReconcileBoardRoles() {
  if (
    hasAutoReconciledBoardRoles ||
    quotaBreaker.isBlocked() ||
    !activePrivateUser ||
    !activePrivateFbUser?.emailVerified
  ) {
    return;
  }
  const isAdmin =
    activePrivateUser.status === 'active' &&
    (activePrivateUser.role === 'admin' ||
      activePrivateFbUser.email?.toLowerCase().trim() === ADMIN_EMAIL);
  if (!isAdmin) return;
  if (
    !hasServerBoardRolesSnap ||
    !hasServerMembersSnap ||
    !hasServerMembersPrivateSnap ||
    latestPublicBoardRoles.length === 0 ||
    metaStore.membersPublicById.size === 0
  ) {
    return;
  }

  hasAutoReconciledBoardRoles = true;
  const mergedUsers = mergeMembersIntoUsers();
  const currentRoles = mergeBoardRolesWithContacts(latestPublicBoardRoles);
  const reconciled = reconcileBoardRolesWithUsers(currentRoles, mergedUsers);

  const hasPublicDiff =
    reconciled.length !== currentRoles.length ||
    reconciled.some((nextRole, index) => {
      const prevRole = currentRoles[index];
      if (!prevRole || prevRole.id !== nextRole.id) return true;
      return (
        prevRole.holderName !== nextRole.holderName ||
        (prevRole.avatarUrl || '') !== (nextRole.avatarUrl || '') ||
        (prevRole.motorcycle || '') !== (nextRole.motorcycle || '') ||
        prevRole.title !== nextRole.title
      );
    });

  if (hasPublicDiff) {
    activeCallbacks?.onBoardRoles(reconciled);
    void FirestoreSync.saveBoardRoles(reconciled);
  }
}

function parseClubInfoDoc(d: Record<string, any>): ClubInfo {
  return {
    name: d.name,
    foundationYear: d.foundationYear,
    city: d.city,
    address: d.address,
    googleMapsUrl: d.googleMapsUrl,
    contactEmail: d.contactEmail,
    contactPhone: d.contactPhone,
    instagram: d.instagram,
    facebook: d.facebook,
    youtube: d.youtube,
    historyText: d.historyText,
    rulesText: d.rulesText,
    pixCnpj: d.pixCnpj,
    monthlyFeeAmount: d.monthlyFeeAmount,
    financialDirectorAuthorized: Boolean(d.financialDirectorAuthorized),
    financialYears: Array.isArray(d.financialYears) ? sanitizeYearList(d.financialYears) : undefined,
    hiddenFinancialYears: Array.isArray(d.hiddenFinancialYears) ? sanitizeYearList(d.hiddenFinancialYears) : undefined,
    leftCrestUrl:
      !d.leftCrestUrl || d.leftCrestUrl === LEGACY_DEFAULT_CREST_URL
        ? DEFAULT_CREST_URL
        : d.leftCrestUrl,
    rightCrestUrl:
      !d.rightCrestUrl || d.rightCrestUrl === LEGACY_DEFAULT_CREST_URL
        ? DEFAULT_CREST_URL
        : d.rightCrestUrl,
    isHeadquartersOpen: typeof d.isHeadquartersOpen === 'boolean' ? d.isHeadquartersOpen : INITIAL_CLUB_INFO.isHeadquartersOpen,
    headquartersOpenText: typeof d.headquartersOpenText === 'string' ? d.headquartersOpenText : INITIAL_CLUB_INFO.headquartersOpenText,
    headquartersOpenPhotos: Array.isArray(d.headquartersOpenPhotos) ? d.headquartersOpenPhotos : INITIAL_CLUB_INFO.headquartersOpenPhotos,
    accessRequestMessage: typeof d.accessRequestMessage === 'string' ? d.accessRequestMessage : INITIAL_CLUB_INFO.accessRequestMessage,
    supportersButtonTitle:
      typeof d.supportersButtonTitle === 'string' &&
      d.supportersButtonTitle.trim() &&
      d.supportersButtonTitle.trim().toLowerCase() !== 'apoiadores do motoclube'
        ? d.supportersButtonTitle
        : INITIAL_CLUB_INFO.supportersButtonTitle,
    supportersButtonSubtitle: typeof d.supportersButtonSubtitle === 'string' ? d.supportersButtonSubtitle : INITIAL_CLUB_INFO.supportersButtonSubtitle,
    supportersButtonDescription: typeof d.supportersButtonDescription === 'string' ? d.supportersButtonDescription : INITIAL_CLUB_INFO.supportersButtonDescription,
    supportersButtonCta:
      typeof d.supportersButtonCta === 'string' &&
      d.supportersButtonCta.trim() &&
      d.supportersButtonCta.trim().toLowerCase() !== 'conhecer apoiadores'
        ? d.supportersButtonCta
        : INITIAL_CLUB_INFO.supportersButtonCta,
    supportersHistoryText: typeof d.supportersHistoryText === 'string' ? d.supportersHistoryText : INITIAL_CLUB_INFO.supportersHistoryText,
    supportersCoverUrl: typeof d.supportersCoverUrl === 'string' ? d.supportersCoverUrl : INITIAL_CLUB_INFO.supportersCoverUrl,
    eventsButtonLabel:
      typeof d.eventsButtonLabel === 'string' && d.eventsButtonLabel.trim()
        ? d.eventsButtonLabel
        : INITIAL_CLUB_INFO.eventsButtonLabel,
    expenseTabs: Array.isArray(d.expenseTabs) ? sanitizeExpenseTabs(d.expenseTabs) : INITIAL_CLUB_INFO.expenseTabs,
    documentCategories: Array.isArray(d.documentCategories)
      ? sanitizeDocumentCategories(d.documentCategories)
      : INITIAL_CLUB_INFO.documentCategories,
    documentCustomFieldLabels: Array.isArray(d.documentCustomFieldLabels)
      ? sanitizeDocumentCustomFieldLabels(d.documentCustomFieldLabels)
      : INITIAL_CLUB_INFO.documentCustomFieldLabels,
    appUpdateId: typeof d.appUpdateId === 'string' ? d.appUpdateId : undefined,
    appUpdateVersion: typeof d.appUpdateVersion === 'string' ? d.appUpdateVersion : undefined,
    appUpdateMessage: typeof d.appUpdateMessage === 'string' ? d.appUpdateMessage : undefined,
    appUpdatePublishedAt: typeof d.appUpdatePublishedAt === 'string' ? d.appUpdatePublishedAt : undefined,
    federationBadgeLabel:
      typeof d.federationBadgeLabel === 'string'
        ? d.federationBadgeLabel
        : INITIAL_CLUB_INFO.federationBadgeLabel,
    federationTitle:
      typeof d.federationTitle === 'string'
        ? d.federationTitle
        : INITIAL_CLUB_INFO.federationTitle,
    federationDescription:
      typeof d.federationDescription === 'string'
        ? d.federationDescription
        : INITIAL_CLUB_INFO.federationDescription,
    federationLogoUrl:
      typeof d.federationLogoUrl === 'string' && d.federationLogoUrl.trim()
        ? d.federationLogoUrl
        : DEFAULT_FEDERATION_LOGO_URL,
    federationWebsite:
      typeof d.federationWebsite === 'string'
        ? d.federationWebsite
        : INITIAL_CLUB_INFO.federationWebsite,
    federationWebsiteLabel:
      typeof d.federationWebsiteLabel === 'string'
        ? d.federationWebsiteLabel
        : undefined,
    federationRegistrationCode:
      typeof d.federationRegistrationCode === 'string'
        ? d.federationRegistrationCode
        : undefined,
    federationHidden:
      typeof d.federationHidden === 'boolean'
        ? d.federationHidden
        : false,
  };
}

function applyClubInfoSnapshotData(d: Record<string, any>) {
  metaStore.isSeededInFirestore = true;
  const clubInfo = parseClubInfoDoc(d);
  const json = JSON.stringify(clubInfo);
  if (metaStore.lastSnapshotJson.get('clubInfo') !== json) {
    metaStore.lastSnapshotJson.set('clubInfo', json);
    activeCallbacks?.onClubInfo(clubInfo);
  }
}

function applyBoardRolesSnapshotDocs(
  docs: Array<{ id: string; data: () => Record<string, any> }>,
  fromCache = false
) {
  if (docs.length > 0) metaStore.isSeededInFirestore = true;
  if (!fromCache) hasServerBoardRolesSnap = true;
  const roles: BoardRoleConfig[] = docs.map((docSnap) => {
    const d = docSnap.data();
    const rawHolder = typeof d.holderName === 'string' ? d.holderName : '';
    const vacant = isVacantBoardHolder(rawHolder);
    return {
      id: d.id || docSnap.id,
      title: d.title,
      holderName: vacant ? VACANT_BOARD_HOLDER_LABEL : rawHolder,
      email: '',
      phone: '',
      avatarUrl: vacant ? '' : d.avatarUrl || '',
      motorcycle: vacant ? '' : d.motorcycle || '',
      isCustom: Boolean(d.isCustom),
      order: typeof d.order === 'number' ? d.order : undefined,
    };
  });
  latestPublicBoardRoles = sortBoardRoles(roles);
  const merged = mergeBoardRolesWithContacts(latestPublicBoardRoles);
  const json = JSON.stringify(merged);
  if (metaStore.lastSnapshotJson.get('boardRoles') !== json) {
    metaStore.lastSnapshotJson.set('boardRoles', json);
    activeCallbacks?.onBoardRoles(merged);
  }
  if (!fromCache) {
    maybeAutoReconcileBoardRoles();
  }
}


function applyPublicEventsSnapshotDocs(docs: Array<{ id: string; data: () => Record<string, any> }>) {
  if (docs.length > 0) metaStore.isSeededInFirestore = true;
  const evs: RideEvent[] = docs.map((docSnap) => {
    const d = docSnap.data();
    return {
      id: d.id || docSnap.id,
      title: d.title,
      description: d.description,
      date: d.date,
      endDate: d.endDate || undefined,
      time: d.time,
      meetingPoint: d.meetingPoint,
      destination: d.destination,
      distanceKm: d.distanceKm,
      averageSpeed: d.averageSpeed,
      roadCaptain: d.roadCaptain,
      isExclusiveBoard: Boolean(d.isExclusiveBoard),
      isPinned: Boolean(d.isPinned),
      attendees: Array.isArray(d.attendees) ? d.attendees : [],
      imageUrl: d.imageUrl,
    };
  });
  const json = JSON.stringify(evs);
  if (metaStore.lastSnapshotJson.get('events') !== json) {
    metaStore.lastSnapshotJson.set('events', json);
    activeCallbacks?.onEvents(evs);
  }
}

function applySupportersSnapshotDocs(docs: Array<{ id: string; data: () => Record<string, any> }>) {
  if (docs.length > 0) metaStore.isSeededInFirestore = true;
  const list: Supporter[] = docs
    .map((docSnap) => {
      const d = docSnap.data();
      return {
        id: d.id || docSnap.id,
        name: d.name,
        type: (d.type === 'company' ? 'company' : 'individual') as 'individual' | 'company',
        description: d.description || '',
        photoUrl: d.photoUrl || '',
        city: d.city || undefined,
        contact: d.contact || undefined,
        website: d.website || undefined,
        order: typeof d.order === 'number' ? d.order : 0,
      };
    })
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const json = JSON.stringify(list);
  if (metaStore.lastSnapshotJson.get('supporters') !== json) {
    metaStore.lastSnapshotJson.set('supporters', json);
    activeCallbacks?.onSupporters?.(list);
  }
}

function parseFeeDoc(id: string, d: Record<string, any>): MemberMonthlyFee {
  return {
    id: d.id || id,
    memberId: d.memberId,
    memberName: d.memberName,
    month: d.month,
    monthName: d.monthName,
    amount: Number(d.amount) || 0,
    dueDate: d.dueDate,
    status: d.status,
    paidAt: d.paidAt,
    pixTxId: d.pixTxId,
    notes: d.notes,
    receiptUrl: d.receiptUrl || undefined,
    receiptUploadedAt: d.receiptUploadedAt || undefined,
    receiptFileName: d.receiptFileName || undefined,
    partialPaidAmount: typeof d.partialPaidAmount === 'number' ? d.partialPaidAmount : undefined,
    settlementStatus: d.settlementStatus || undefined,
    writeOffReason: d.writeOffReason || undefined,
    writeOffAt: d.writeOffAt || undefined,
    writeOffById: d.writeOffById || undefined,
    writeOffByName: d.writeOffByName || undefined,
    exerciseYear: typeof d.exerciseYear === 'number' ? d.exerciseYear : undefined,
    history: Array.isArray(d.history) ? sanitizeFinanceHistory(d.history) : undefined,
  };
}

function parseTabDebtDoc(id: string, d: Record<string, any>): MemberTabDebt {
  return {
    id: d.id || id,
    memberId: d.memberId,
    memberName: d.memberName,
    itemDescription: d.itemDescription,
    category: d.category,
    amount: Number(d.amount) || 0,
    date: d.date,
    status: d.status,
    paidAt: d.paidAt,
    notes: d.notes,
    receiptUrl: d.receiptUrl || undefined,
    receiptUploadedAt: d.receiptUploadedAt || undefined,
    receiptFileName: d.receiptFileName || undefined,
    partialPaidAmount: typeof d.partialPaidAmount === 'number' ? d.partialPaidAmount : undefined,
    settlementStatus: d.settlementStatus || undefined,
    writeOffReason: d.writeOffReason || undefined,
    writeOffAt: d.writeOffAt || undefined,
    writeOffById: d.writeOffById || undefined,
    writeOffByName: d.writeOffByName || undefined,
    exerciseYear: typeof d.exerciseYear === 'number' ? d.exerciseYear : undefined,
    history: Array.isArray(d.history) ? sanitizeFinanceHistory(d.history) : undefined,
  };
}

function parseFinancialNoteDoc(id: string, d: Record<string, any>): MemberFinancialNote {
  return {
    id: d.id || id,
    memberId: d.memberId || id,
    memberName: d.memberName || undefined,
    note: d.note || '',
    updatedAt: d.updatedAt || tsToIso(d.serverUpdatedAt),
    updatedById: d.updatedById || '',
    updatedByName: d.updatedByName || 'Diretoria',
    updatedByUid: d.updatedByUid || undefined,
    history: Array.isArray(d.history) ? sanitizeObservationHistory(d.history) : undefined,
  };
}

function parseMemberPublicDocFields(id: string, d: Record<string, any>): User {
  return {
    id: d.id || id,
    name: d.name,
    nickname: d.nickname || undefined,
    email: '',
    phone: '',
    role: d.role,
    status: d.status,
    sosApproved: Boolean(d.sosApproved),
    motorcycle: d.motorcycle,
    joinedYear: d.joinedYear,
    joinedDate: d.joinedDate || undefined,
    birthDate: d.birthDate || undefined,
    boardRoleId: d.boardRoleId,
    customRoleTitle: d.customRoleTitle || undefined,
    avatarUrl: d.avatarUrl,
    canEditFinances: Boolean(d.canEditFinances),
    isMinor: Boolean(d.isMinor),
    responsibleMemberId: d.responsibleMemberId || undefined,
    responsibleMemberName: d.responsibleMemberName || undefined,
    memberCategory: d.memberCategory ? sanitizeMemberCategory(d.memberCategory) : 'Motociclista',
    feeStatus: d.feeStatus === 'ISENTO' || d.feeStatus === 'PAGANTE' ? d.feeStatus : undefined,
    feeStatusUpdatedAt: d.feeStatusUpdatedAt || undefined,
    feeStatusUpdatedById: d.feeStatusUpdatedById || undefined,
    feeStatusUpdatedByName: d.feeStatusUpdatedByName || undefined,
    feeStatusHistory: Array.isArray(d.feeStatusHistory) ? sanitizeFeeStatusHistory(d.feeStatusHistory) : undefined,
    nomadeBadge: Boolean(d.nomadeBadge),
    nomadeGrantedAt: d.nomadeGrantedAt || undefined,
    nomadeGrantedById: d.nomadeGrantedById || undefined,
    nomadeGrantedByName: d.nomadeGrantedByName || undefined,
    ossoBadge: Boolean(d.ossoBadge),
    ossoGrantedAt: d.ossoGrantedAt || undefined,
    ossoGrantedById: d.ossoGrantedById || undefined,
    ossoGrantedByName: d.ossoGrantedByName || undefined,
    badgeHistory: Array.isArray(d.badgeHistory) ? sanitizeBadgeHistory(d.badgeHistory) : undefined,
  };
}

function parseFeeScheduleDoc(id: string, d: Record<string, any>): FeeRateScheduleEntry {
  return {
    id: d.id || id,
    previousAmount: Number(d.previousAmount) || 0,
    newAmount: Number(d.newAmount ?? d.monthlyAmount) || 0,
    effectiveCompetency: d.effectiveCompetency || '',
    effectiveDate: d.effectiveDate || undefined,
    reason: d.reason || d.notes || undefined,
    status: ['scheduled', 'active', 'applied', 'cancelled'].includes(d.status) ? d.status : 'scheduled',
    createdById: d.createdById || '',
    createdByName: d.createdByName || 'Diretoria',
    createdByUid: d.createdByUid || undefined,
    createdAt: d.createdAt || '',
    cancelledAt: d.cancelledAt || undefined,
    cancelledById: d.cancelledById || undefined,
    cancelledByName: d.cancelledByName || undefined,
  };
}

function parseManualReceiptDoc(id: string, d: Record<string, any>): ManualFinancialEntry {
  const isUnid =
    d.identificationStatus === 'unidentified' || Boolean(d.isUnidentified) || !d.memberId;
  return {
    id: d.id || id,
    idempotencyKey: d.idempotencyKey || undefined,
    memberId: d.memberId || undefined,
    memberUid: d.memberUid || undefined,
    memberEmail: d.memberEmail || undefined,
    memberName: d.memberName || undefined,
    identificationStatus: isUnid ? 'unidentified' : 'identified',
    originType: ['fee', 'tab', 'donation', 'event', 'other'].includes(d.originType)
      ? d.originType
      : 'other',
    competencyMonth: d.competencyMonth || d.competency || undefined,
    amount: Number(d.amount) || 0,
    paymentDate: d.paymentDate || d.referenceDate || '',
    paymentMethod: d.paymentMethod || 'pix',
    description: d.description || '',
    notes: d.notes || undefined,
    receiptUrl: d.receiptUrl || undefined,
    receiptFileName: d.receiptFileName || undefined,
    receiptUploadedAt: d.receiptUploadedAt || undefined,
    linkedFeeId: d.linkedFeeId || undefined,
    linkedFeeMonth: d.linkedFeeMonth || undefined,
    linkedAt: d.linkedAt || undefined,
    linkedById: d.linkedById || undefined,
    linkedByName: d.linkedByName || undefined,
    status: d.status === 'reversed' ? 'reversed' : d.status === 'confirmed' ? 'confirmed' : 'active',
    reversalReason: d.reversalReason || undefined,
    reversedAt: d.reversedAt || undefined,
    reversedById: d.reversedById || undefined,
    reversedByName: d.reversedByName || undefined,
    createdAt: tsToIso(d.createdAt),
    createdById: d.createdById || '',
    createdByName: d.createdByName || 'Diretoria',
    createdByUid: d.createdByUid || undefined,
  };
}

function parseMemberTitleDoc(id: string, d: Record<string, any>): MemberHonoraryTitle {
  return {
    id: d.id || id,
    memberId: d.memberId || '',
    memberName: d.memberName || 'Integrante',
    titleType:
      d.titleType === 'INTEGRANTE BENEMÉRITO'
        ? 'INTEGRANTE BENEMÉRITO'
        : 'INTEGRANTE HONORÁRIO',
    customLabel: d.customLabel || undefined,
    grantedAt: d.grantedAt || '',
    grantedById: d.grantedById || '',
    grantedByName: d.grantedByName || 'Administrador Geral',
    grantedByUid: d.grantedByUid || undefined,
    reason: d.reason || undefined,
    notes: d.notes || undefined,
    status: d.status === 'revoked' ? 'revoked' : 'active',
    revokedAt: d.revokedAt || undefined,
    revokedById: d.revokedById || undefined,
    revokedByName: d.revokedByName || undefined,
    revokeReason: d.revokeReason || undefined,
  };
}

function parseWalkInClientDoc(id: string, d: Record<string, any>): WalkInClient {
  return {
    id: d.id || id,
    name: d.name || 'Cliente Avulso',
    phone: d.phone || undefined,
    notes: d.notes || undefined,
    status:
      d.status === 'inactive' || d.status === 'archived'
        ? d.status
        : d.active === false
        ? 'inactive'
        : 'active',
    createdAt: tsToIso(d.createdAt),
    createdById: d.createdById || '',
    createdByName: d.createdByName || 'Diretoria',
    createdByUid: d.createdByUid || undefined,
  };
}

function parseWalkInTabDoc(id: string, d: Record<string, any>): WalkInTabRecord {
  const totalAmount = Number(d.totalAmount) || 0;
  const paidAmount = Number(d.paidAmount) || 0;
  const balanceDue =
    typeof d.balanceDue === 'number'
      ? d.balanceDue
      : typeof d.remainingBalance === 'number'
      ? d.remainingBalance
      : Math.max(0, totalAmount - paidAmount);
  return {
    id: d.id || id,
    clientId: d.clientId || '',
    clientName: d.clientName || 'Cliente Avulso',
    status: ['open', 'partial', 'paid', 'cancelled'].includes(d.status) ? d.status : 'open',
    items: Array.isArray(d.items) ? d.items : [],
    payments: Array.isArray(d.payments) ? d.payments : [],
    totalAmount,
    paidAmount,
    balanceDue,
    openedAt: d.openedAt || tsToIso(d.createdAt).slice(0, 10),
    closedAt: d.closedAt || undefined,
    notes: d.notes || undefined,
    createdById: d.createdById || '',
    createdByName: d.createdByName || 'Diretoria',
    createdByUid: d.createdByUid || undefined,
  };
}

export const FirestoreSync = {
  registerCallbacks(cbs: SyncCallbacks) {
    activeCallbacks = cbs;
    cbs.onQuotaStatusChange?.(quotaBreaker.getStatus());
  },

  getQuotaStatus(): QuotaSyncStatus {
    return quotaBreaker.getStatus();
  },

  async retryAfterQuota(): Promise<void> {
    quotaBreaker.reset();
    requestDedupe.invalidate();
    lastPublicServerRefreshMs = 0;
    await this.refreshPublicFromServer(true);
    if (activePrivateUser && activePrivateFbUser) {
      await this.startPrivateListeners(activePrivateUser, activePrivateFbUser, activeSectionName);
    }
  },

  async manualSyncRefresh(): Promise<void> {
    if (quotaBreaker.isBlocked()) return;
    telemetryMonitor.recordSyncCheck('Sincronização manual solicitada');
    lastPublicServerRefreshMs = 0;
    sectionSyncedAt.clear();
    requestDedupe.invalidate();
    await this.refreshPublicFromServer(true);
    if (activePrivateUser && activePrivateFbUser) {
      await this.reloadPrivateCoreData(activePrivateUser, activePrivateFbUser, true);
      await this.setActiveSection(activeSectionName, true);
    }
  },

  async refreshPublicFromServer(force = false): Promise<void> {
    if (quotaBreaker.isBlocked()) return;

    const now = Date.now();
    const minCooldownMs = force ? 15_000 : 0;
    if (force && now - lastPublicServerRefreshMs < minCooldownMs) {
      telemetryMonitor.recordDedupeBlocked('refreshPublicFromServer', 4, 'Cooldown de atualização manual ativo');
      return;
    }

    return requestDedupe.run('refreshPublicFromServer', async () => {
      const [cachedClub, cachedBoard, cachedEvents, cachedSupporters, cachedPubAnn] = await Promise.all([
        IndexedDbCache.getDataset<ClubInfo>({ domain: 'public', key: 'clubInfo', allowExpired: true }),
        IndexedDbCache.getDataset<BoardRoleConfig[]>({ domain: 'public', key: 'boardRoles', allowExpired: true }),
        IndexedDbCache.getDataset<RideEvent[]>({ domain: 'public', key: 'events', allowExpired: true }),
        IndexedDbCache.getDataset<Supporter[]>({ domain: 'public', key: 'supporters', allowExpired: true }),
        IndexedDbCache.getDataset<ClubAnnouncement[]>({ domain: 'public', key: 'publicAnnouncements', allowExpired: true }),
      ]);

      if (cachedClub?.payload && !metaStore.lastSnapshotJson.has('clubInfo')) {
        IndexedDbCache.recordCacheHit('indexeddb', 'clubSettings', 1, 'Hidratação IndexedDB (TTL 30m)');
        metaStore.lastSnapshotJson.set('clubInfo', JSON.stringify(cachedClub.payload));
        activeCallbacks?.onClubInfo(cachedClub.payload);
      }
      if (cachedBoard?.payload?.length && !metaStore.lastSnapshotJson.has('boardRoles')) {
        IndexedDbCache.recordCacheHit('indexeddb', 'boardRoles', cachedBoard.payload.length, 'Hidratação IndexedDB (TTL 30m)');
        latestPublicBoardRoles = sortBoardRoles(cachedBoard.payload);
        const mergedBoard = mergeBoardRolesWithContacts(latestPublicBoardRoles);
        metaStore.lastSnapshotJson.set('boardRoles', JSON.stringify(mergedBoard));
        activeCallbacks?.onBoardRoles(mergedBoard);
      }
      if (cachedEvents?.payload?.length && !metaStore.lastSnapshotJson.has('events')) {
        IndexedDbCache.recordCacheHit('indexeddb', 'events', cachedEvents.payload.length, 'Hidratação IndexedDB (TTL 30m)');
        metaStore.lastSnapshotJson.set('events', JSON.stringify(cachedEvents.payload));
        activeCallbacks?.onEvents(cachedEvents.payload);
      }
      if (cachedSupporters?.payload?.length && !metaStore.lastSnapshotJson.has('supporters')) {
        IndexedDbCache.recordCacheHit('indexeddb', 'supporters', cachedSupporters.payload.length, 'Hidratação IndexedDB (TTL 30m)');
        metaStore.lastSnapshotJson.set('supporters', JSON.stringify(cachedSupporters.payload));
        activeCallbacks?.onSupporters?.(cachedSupporters.payload);
      }
      if (cachedPubAnn?.payload && !metaStore.lastSnapshotJson.has('publicAnnouncements')) {
        metaStore.lastSnapshotJson.set('publicAnnouncements', JSON.stringify(cachedPubAnn.payload));
        activeCallbacks?.onPublicAnnouncements?.(cachedPubAnn.payload);
      }

      const clubFresh = Boolean(!force && cachedClub?.syncStatus === 'fresh' && cachedClub.payload);
      const boardFresh = Boolean(!force && cachedBoard?.syncStatus === 'fresh' && cachedBoard.payload?.length);
      const eventsFresh = Boolean(!force && cachedEvents?.syncStatus === 'fresh' && cachedEvents.payload?.length);
      const supportersFresh = Boolean(!force && cachedSupporters?.syncStatus === 'fresh' && cachedSupporters.payload?.length);
      const pubAnnFresh = Boolean(!force && cachedPubAnn?.syncStatus === 'fresh');

      if (clubFresh && boardFresh && eventsFresh && supportersFresh && pubAnnFresh) {
        telemetryMonitor.recordCacheHit('indexeddb', 'public(bundle)', 5, 'Cache público 30 min válido');
        return;
      }

      if (force) lastPublicServerRefreshMs = now;

      const boardQ = query(collection(db, 'boardRoles'), where('visibility', '==', 'public'), limit(80));
      const publicEventsQ = query(collection(db, 'events'), where('isExclusiveBoard', '==', false), limit(60));
      const supportersQ = query(collection(db, 'supporters'), where('visibility', '==', 'public'), limit(60));
      const publicAnnQ = query(collection(db, 'clubAnnouncements'), where('isPublic', '==', true), limit(25));
      const ctx: TelemetryReadContext = force ? 'manual' : 'startup';

      const isBoardUser = Boolean(
        currentResolvedUser &&
          (currentResolvedUser.role === 'admin' || currentResolvedUser.role === 'board') &&
          currentResolvedUser.status === 'active'
      );

      const tasks: Promise<unknown>[] = [];

      if (!clubFresh) {
        tasks.push(
          getDoc(doc(db, 'clubSettings', 'main')).then(async (snap) => {
            trackSnapshotTelemetry('clubSettings', snap, ctx);
            if (snap.exists()) {
              applyClubInfoSnapshotData(snap.data());
              const parsed = parseClubInfoDoc(snap.data());
              await IndexedDbCache.setDataset({
                domain: 'public',
                key: 'clubInfo',
                scope: 'public',
                payload: parsed,
                ttlMs: CACHE_TTL_30M_MS,
              });
            }
          })
        );
      }

      if (!boardFresh) {
        tasks.push(
          getDocs(boardQ).then(async (snap) => {
            trackSnapshotTelemetry('boardRoles', snap, ctx);
            if (!snap.empty || metaStore.isSeededInFirestore) {
              applyBoardRolesSnapshotDocs(snap.docs, snap.metadata.fromCache);
              await IndexedDbCache.setDataset({
                domain: 'public',
                key: 'boardRoles',
                scope: 'public',
                payload: latestPublicBoardRoles,
                ttlMs: CACHE_TTL_30M_MS,
              });
            }
          })
        );
      }

      if (!isBoardUser && !eventsFresh) {
        tasks.push(
          getDocs(publicEventsQ).then(async (snap) => {
            trackSnapshotTelemetry('events(public)', snap, ctx);
            if (!snap.empty || metaStore.isSeededInFirestore) {
              applyPublicEventsSnapshotDocs(snap.docs);
              const evs = JSON.parse(metaStore.lastSnapshotJson.get('events') || '[]');
              await IndexedDbCache.setDataset({
                domain: 'public',
                key: 'events',
                scope: 'public',
                payload: evs,
                ttlMs: CACHE_TTL_30M_MS,
              });
            }
          })
        );
      }

      if (!supportersFresh) {
        tasks.push(
          getDocs(supportersQ).then(async (snap) => {
            trackSnapshotTelemetry('supporters', snap, ctx);
            if (!snap.empty || metaStore.isSeededInFirestore) {
              applySupportersSnapshotDocs(snap.docs);
              const sups = JSON.parse(metaStore.lastSnapshotJson.get('supporters') || '[]');
              await IndexedDbCache.setDataset({
                domain: 'public',
                key: 'supporters',
                scope: 'public',
                payload: sups,
                ttlMs: CACHE_TTL_30M_MS,
              });
            }
          })
        );
      }

      if (!pubAnnFresh) {
        tasks.push(
          getDocs(publicAnnQ).then(async (snap) => {
            trackSnapshotTelemetry('clubAnnouncements(public)', snap, ctx);
            const items: ClubAnnouncement[] = snap.docs.map((docSnap) => {
              const d = docSnap.data();
              return {
                id: d.id || docSnap.id,
                title: d.title || '',
                message: d.message || '',
                kind:
                  d.kind === 'urgent' || d.kind === 'event' || d.kind === 'meeting'
                    ? d.kind
                    : 'info',
                pinned: Boolean(d.pinned),
                isPublic: Boolean(d.isPublic),
                authorId: d.authorId || '',
                authorName: d.authorName || '',
                authorUid: d.authorUid || undefined,
                createdAt: tsToIso(d.createdAt),
              };
            });
            items.sort((a, b) => {
              if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
              return b.createdAt.localeCompare(a.createdAt);
            });
            metaStore.lastSnapshotJson.set('publicAnnouncements', JSON.stringify(items));
            await IndexedDbCache.setDataset({
              domain: 'public',
              key: 'publicAnnouncements',
              scope: 'public',
              payload: items,
              ttlMs: CACHE_TTL_30M_MS,
            });
            activeCallbacks?.onPublicAnnouncements?.(items);
          })
        );
      }

      const results = await Promise.allSettled(tasks);
      for (const r of results) {
        if (r.status === 'rejected') {
          if (isQuotaError(r.reason)) {
            handleQuotaOrListenerError(r.reason, OperationType.GET, 'refreshPublic');
            break;
          }
          if (!isOfflineOrNetworkError(r.reason)) {
            telemetryMonitor.recordError('refreshPublic', String(r.reason), false);
          }
        }
      }
    });
  },

  startPublicListeners() {
    this.stopPublicListeners();
    if (quotaBreaker.isBlocked()) {
      activeCallbacks?.onQuotaStatusChange?.(quotaBreaker.getStatus());
      return;
    }
    // Leitura sob demanda com cache centralizado de 30 minutos (zero listeners permanentes públicos)
    void this.refreshPublicFromServer(false);
  },

  stopPublicListeners() {
    requestDedupe.invalidate('refreshPublicFromServer');
  },

  stopPrivateListeners() {
    stopSosListener();
    stopBoardChatListener();
    sectionSyncedAt.clear();
    void IndexedDbCache.clearPrivateCaches();
    activePrivateUser = null;
    activePrivateFbUser = null;
    currentResolvedUser = null;
    hasServerMembersSnap = false;
    hasServerMembersPrivateSnap = false;
    hasAutoReconciledBoardRoles = false;

    metaStore.memberUidByMemberId.clear();
    metaStore.memberEmailByMemberId.clear();
    metaStore.forumAuthorById.clear();
    metaStore.forumCreatedAtById.clear();
    metaStore.sosAuthorById.clear();
    metaStore.sosCreatedAtById.clear();
    metaStore.boardChatAuthorById.clear();
    metaStore.documentAuthorById.clear();
    metaStore.documentCreatedAtById.clear();
    metaStore.assembledDocCache.clear();
    const hadBoardContacts = metaStore.boardContactsById.size > 0;
    metaStore.boardContactsById.clear();
    metaStore.membersPublicById.clear();
    metaStore.membersPrivateById.clear();
    [
      'users',
      'publicProfiles',
      'financialNotes',
      'events',
      'forumPosts',
      'sosAlerts',
      'fees',
      'feeSchedules',
      'manualReceipts',
      'memberTitles',
      'walkInClients',
      'walkInTabs',
      'expenses',
      'tabs',
      'boardChat',
      'clubDocuments',
      'clubGovernance',
      'clubAnnouncements',
      'auditLogs',
      'deletedBackups',
    ].forEach((k) => {
      metaStore.lastSnapshotJson.delete(k);
    });

    if (hadBoardContacts && latestPublicBoardRoles.length > 0) {
      const publicOnly = mergeBoardRolesWithContacts(latestPublicBoardRoles);
      metaStore.lastSnapshotJson.set('boardRoles', JSON.stringify(publicOnly));
      activeCallbacks?.onBoardRoles(publicOnly);
    }
  },

  async setActiveSection(section: string, force = false): Promise<void> {
    activeSectionName = section || 'history';
    if (!activePrivateUser || !activePrivateFbUser || quotaBreaker.isBlocked()) return;

    const user = activePrivateUser;
    const fbUser = activePrivateFbUser;
    const isAdmin =
      user.status === 'active' &&
      (user.role === 'admin' || fbUser.email?.toLowerCase().trim() === ADMIN_EMAIL);
    const isBoard = isAdmin || (user.role === 'board' && user.status === 'active');
    const isActiveMember = isAdmin || user.status === 'active';
    if (!isActiveMember) return;

    // Único listener em tempo real sob demanda da seção ativa: chat da diretoria (apenas na aba 'board')
    if (section !== 'board' || !isBoard) {
      stopBoardChatListener();
    }

    const fetchSectionWithTtl = async (
      sectionKey: string,
      snapshotCacheKey: string | null,
      hydrateCallback: (() => boolean) | null,
      fetcher: () => Promise<void>
    ) => {
      const lastSync = sectionSyncedAt.get(sectionKey) || 0;
      const isWithinTtl = !force && lastSync > 0 && Date.now() - lastSync < CACHE_TTL_30M_MS;
      if (isWithinTtl && snapshotCacheKey && metaStore.lastSnapshotJson.has(snapshotCacheKey) && hydrateCallback?.()) {
        telemetryMonitor.recordCacheHit('memory', sectionKey, 1, 'Cache 30 min válido na troca de aba');
        return;
      }
      await requestDedupe.run(`section:${sectionKey}`, async () => {
        try {
          await fetcher();
          sectionSyncedAt.set(sectionKey, Date.now());
        } catch (err) {
          if (isQuotaError(err)) {
            handleQuotaOrListenerError(err, OperationType.LIST, sectionKey);
          } else if (!isOfflineOrNetworkError(err)) {
            telemetryMonitor.recordError(sectionKey, String(err), false);
          }
        }
      });
    };

    const readCtx: TelemetryReadContext = force ? 'manual' : 'tab_switch';

    if (section === 'forum') {
      await fetchSectionWithTtl(
        'forum',
        'forumPosts',
        () => {
          const raw = metaStore.lastSnapshotJson.get('forumPosts');
          if (!raw) return false;
          activeCallbacks?.onForumPosts(JSON.parse(raw) as ForumPost[]);
          return true;
        },
        async () => {
          const snap = await getDocs(
            query(collection(db, 'forumPosts'), where('clubOnly', '==', true), limit(50))
          );
          trackSnapshotTelemetry('forumPosts', snap, readCtx);
          if (snap.empty && !metaStore.isSeededInFirestore) return;
          const posts: ForumPost[] = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            metaStore.forumAuthorById.set(docSnap.id, d.authorUid || '');
            metaStore.forumCreatedAtById.set(docSnap.id, d.createdAt);
            return {
              id: d.id || docSnap.id,
              authorId: d.authorId,
              authorName: d.authorName,
              authorRole: d.authorRole,
              authorAvatar: d.authorAvatar,
              title: d.title,
              content: d.content,
              category: d.category,
              images: Array.isArray(d.images) ? d.images : [],
              likes: Array.isArray(d.likes) ? d.likes : [],
              comments: Array.isArray(d.comments) ? d.comments : [],
              createdAt: tsToIso(d.createdAt),
            };
          });
          posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          metaStore.lastSnapshotJson.set('forumPosts', JSON.stringify(posts));
          activeCallbacks?.onForumPosts(posts);
        }
      );
    }

    if (section === 'board' && isBoard) {
      if (!boardChatUnsub) {
        boardChatUnsub = onSnapshot(
          query(collection(db, 'boardChat'), where('boardOnly', '==', true), limit(60)),
          (snap) => {
            trackSnapshotTelemetry('boardChat', snap, 'tab_switch');
            if (snap.empty && !metaStore.isSeededInFirestore) return;
            const msgs: BoardChatMessage[] = snap.docs.map((docSnap) => {
              const d = docSnap.data();
              metaStore.boardChatAuthorById.set(docSnap.id, d.authorUid || '');
              return {
                id: d.id || docSnap.id,
                senderId: d.senderId,
                senderName: d.senderName,
                senderRole: d.senderRole,
                senderAvatar: d.senderAvatar,
                message: d.message,
                timestamp: tsToIso(d.timestamp),
              };
            });
            msgs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
            metaStore.lastSnapshotJson.set('boardChat', JSON.stringify(msgs));
            activeCallbacks?.onBoardChat(msgs);
          },
          (err) => handleQuotaOrListenerError(err, OperationType.LIST, 'boardChat')
        );
      }

      await fetchSectionWithTtl(
        'boardCore',
        'events',
        () => {
          const evRaw = metaStore.lastSnapshotJson.get('events');
          if (!evRaw) return false;
          activeCallbacks?.onEvents(JSON.parse(evRaw) as RideEvent[]);
          return true;
        },
        async () => {
          const [evSnap, contactsSnap] = await Promise.all([
            getDocs(query(collection(db, 'events'), limit(60))),
            getDocs(query(collection(db, 'boardRoleContacts'), where('boardOnly', '==', true), limit(40))),
          ]);
          trackSnapshotTelemetry('events(board)', evSnap, readCtx);
          trackSnapshotTelemetry('boardRoleContacts', contactsSnap, readCtx);
          if (!evSnap.empty || metaStore.isSeededInFirestore) {
            const evs: RideEvent[] = evSnap.docs.map((docSnap) => {
              const d = docSnap.data();
              return {
                id: d.id || docSnap.id,
                title: d.title,
                description: d.description,
                date: d.date,
                endDate: d.endDate || undefined,
                time: d.time,
                meetingPoint: d.meetingPoint,
                destination: d.destination,
                distanceKm: d.distanceKm,
                averageSpeed: d.averageSpeed,
                roadCaptain: d.roadCaptain,
                isExclusiveBoard: Boolean(d.isExclusiveBoard),
                isPinned: Boolean(d.isPinned),
                attendees: Array.isArray(d.attendees) ? d.attendees : [],
                imageUrl: d.imageUrl,
              };
            });
            metaStore.lastSnapshotJson.set('events', JSON.stringify(evs));
            activeCallbacks?.onEvents(evs);
          }

          metaStore.boardContactsById.clear();
          contactsSnap.docs.forEach((docSnap) => {
            const d = docSnap.data();
            metaStore.boardContactsById.set(docSnap.id, {
              email: d.email || '',
              phone: d.phone || '',
            });
          });
          if (latestPublicBoardRoles.length > 0) {
            const merged = mergeBoardRolesWithContacts(latestPublicBoardRoles);
            metaStore.lastSnapshotJson.set('boardRoles', JSON.stringify(merged));
            activeCallbacks?.onBoardRoles(merged);
          }
        }
      );
    }

    if (section === 'finance' && isBoard) {
      await fetchSectionWithTtl(
        'financeExpenses',
        'expenses',
        () => {
          const raw = metaStore.lastSnapshotJson.get('expenses');
          if (!raw) return false;
          activeCallbacks?.onExpenses(JSON.parse(raw) as ClubExpense[]);
          return true;
        },
        async () => {
          if (!force) {
            const cachedExp = await IndexedDbCache.getDataset<ClubExpense[]>({
              domain: 'finance',
              key: 'expenses',
              ownerUid: fbUser.uid,
              allowExpired: false,
            });
            if (cachedExp?.syncStatus === 'fresh' && cachedExp.payload) {
              IndexedDbCache.recordCacheHit('indexeddb', 'expenses', cachedExp.payload.length, 'Cache IndexedDB 30 min válido');
              metaStore.lastSnapshotJson.set('expenses', JSON.stringify(cachedExp.payload));
              activeCallbacks?.onExpenses(cachedExp.payload);
              return;
            }
          }
          const snap = await getDocs(
            query(collection(db, 'expenses'), where('boardOnly', '==', true), limit(200))
          );
          trackSnapshotTelemetry('expenses', snap, readCtx);
          if (snap.empty && !metaStore.isSeededInFirestore) return;
          const list: ClubExpense[] = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: d.id || docSnap.id,
              title: d.title,
              category: d.category,
              amount: d.amount,
              date: d.date,
              status: d.status,
              paidBy: d.paidBy,
              notes: d.notes,
            };
          });
          metaStore.lastSnapshotJson.set('expenses', JSON.stringify(list));
          await IndexedDbCache.setDataset({
            domain: 'finance',
            key: 'expenses',
            scope: 'board',
            ownerUid: fbUser.uid,
            payload: list,
            ttlMs: CACHE_TTL_30M_MS,
          });
          activeCallbacks?.onExpenses(list);
        }
      );
    }

    if (section === 'documents' && isBoard) {
      await fetchSectionWithTtl(
        'documents',
        'clubDocuments',
        () => {
          const raw = metaStore.lastSnapshotJson.get('clubDocuments');
          if (!raw) return false;
          activeCallbacks?.onDocuments?.(JSON.parse(raw) as ClubDocument[]);
          return true;
        },
        async () => {
          const snap = await getDocs(
            query(collection(db, 'clubDocuments'), where('clubOnly', '==', true), limit(100))
          );
          trackSnapshotTelemetry('clubDocuments', snap, readCtx);
          const docsList: ClubDocument[] = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            metaStore.documentAuthorById.set(docSnap.id, d.authorUid || '');
            metaStore.documentCreatedAtById.set(docSnap.id, d.createdAt);
            return {
              id: d.id || docSnap.id,
              title: d.title,
              description: d.description || undefined,
              category: d.category,
              fileType: d.fileType === 'image' ? 'image' : 'pdf',
              fileName: d.fileName,
              mimeType: d.mimeType,
              fileSizeBytes: Number(d.fileSizeBytes) || 0,
              fileDataUrl: d.fileDataUrl || '',
              chunkCount: typeof d.chunkCount === 'number' ? d.chunkCount : 0,
              customFields: Array.isArray(d.customFields)
                ? sanitizeDocumentCustomFields(d.customFields)
                : undefined,
              uploadedById: d.uploadedById,
              uploadedByName: d.uploadedByName,
              authorUid: d.authorUid || undefined,
              date: d.date,
              createdAt: tsToIso(d.createdAt),
            };
          });
          docsList.sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));
          metaStore.lastSnapshotJson.set('clubDocuments', JSON.stringify(docsList));
          await IndexedDbCache.setDataset({
            domain: 'cadastral',
            key: 'clubDocumentsMeta',
            scope: 'board',
            ownerUid: fbUser.uid,
            payload: docsList.map((docItem) => ({ ...docItem, fileDataUrl: '' })),
            ttlMs: CACHE_TTL_30M_MS,
          });
          activeCallbacks?.onDocuments?.(docsList);
        }
      );
    }

    if (section === 'statute') {
      await fetchSectionWithTtl(
        'statute',
        'clubGovernance',
        () => {
          const raw = metaStore.lastSnapshotJson.get('clubGovernance');
          if (!raw) return false;
          activeCallbacks?.onGovernance?.(JSON.parse(raw) as ClubGovernanceDoc[]);
          return true;
        },
        async () => {
          const snap = await getDocs(
            query(collection(db, 'clubGovernance'), where('clubOnly', '==', true), limit(10))
          );
          trackSnapshotTelemetry('clubGovernance', snap, readCtx);
          if (snap.empty) return;
          const byId = new Map<string, ClubGovernanceDoc>();
          INITIAL_GOVERNANCE_DOCS.forEach((def) => byId.set(def.id, def));
          snap.docs.forEach((docSnap) => {
            const d = docSnap.data();
            const docId = (d.id || docSnap.id) as 'estatuto' | 'rdi';
            if (docId !== 'estatuto' && docId !== 'rdi') return;
            const parsedGov: ClubGovernanceDoc = {
              id: docId,
              kind: d.kind === 'rdi' ? 'rdi' : 'estatuto',
              title: d.title,
              versionLabel: d.versionLabel || '',
              preamble: d.preamble || '',
              sections: Array.isArray(d.sections) ? d.sections : [],
              updatedAt: tsToIso(d.updatedAt),
              updatedById: d.updatedById || undefined,
              updatedByName: d.updatedByName || undefined,
            };
            byId.set(docId, parsedGov);
            void IndexedDbCache.cacheDocumentBinary({
              kind: 'governance',
              id: docId,
              title: parsedGov.title,
              mimeType: 'application/json',
              version: parsedGov.versionLabel || parsedGov.updatedAt || 'v1',
              payload: parsedGov,
              updatedByName: parsedGov.updatedByName,
            });
          });
          const merged = [byId.get('estatuto')!, byId.get('rdi')!];
          metaStore.lastSnapshotJson.set('clubGovernance', JSON.stringify(merged));
          activeCallbacks?.onGovernance?.(merged);
        }
      );
    }

    if (section === 'admin' && isAdmin) {
      await fetchSectionWithTtl(
        'adminGovernanceTools',
        'auditLogs',
        () => {
          const logsRaw = metaStore.lastSnapshotJson.get('auditLogs');
          const delRaw = metaStore.lastSnapshotJson.get('deletedBackups');
          if (logsRaw) activeCallbacks?.onAuditLogs?.(JSON.parse(logsRaw) as AdminAuditEntry[]);
          if (delRaw) activeCallbacks?.onDeletedBackups?.(JSON.parse(delRaw) as DeletedRecordBackup[]);
          return Boolean(logsRaw);
        },
        async () => {
          const [logsSnap, delSnap] = await Promise.all([
            getDocs(query(collection(db, 'auditLogs'), where('boardOnly', '==', true), limit(60))),
            getDocs(query(collection(db, 'deletedBackups'), where('adminOnly', '==', true), limit(40))),
          ]);
          trackSnapshotTelemetry('auditLogs', logsSnap, readCtx);
          trackSnapshotTelemetry('deletedBackups', delSnap, readCtx);

          const logs: AdminAuditEntry[] = logsSnap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: d.id || docSnap.id,
              action: d.action || '',
              targetType: d.targetType || 'settings',
              targetId: d.targetId || undefined,
              targetLabel: d.targetLabel || undefined,
              actorId: d.actorId || '',
              actorName: d.actorName || '',
              actorUid: d.actorUid || undefined,
              details: d.details || undefined,
              timestamp: tsToIso(d.timestamp),
            };
          });
          logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          metaStore.lastSnapshotJson.set('auditLogs', JSON.stringify(logs));
          activeCallbacks?.onAuditLogs?.(logs);

          const backups: DeletedRecordBackup[] = delSnap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: d.id || docSnap.id,
              entityType: d.entityType || 'member',
              recordId: d.recordId || '',
              label: d.label || '',
              payloadJson: d.payloadJson || '{}',
              deletedById: d.deletedById || '',
              deletedByName: d.deletedByName || '',
              deletedByUid: d.deletedByUid || undefined,
              deletedAt: tsToIso(d.deletedAt),
            };
          });
          backups.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
          metaStore.lastSnapshotJson.set('deletedBackups', JSON.stringify(backups));
          activeCallbacks?.onDeletedBackups?.(backups);
        }
      );
    }
  },

  async reloadPrivateCoreData(
    user: User,
    firebaseUser: FirebaseUser,
    force = false
  ): Promise<void> {
    if (quotaBreaker.isBlocked() || activePrivateFbUser?.uid !== firebaseUser.uid) return;

    const isAdmin =
      user.status === 'active' &&
      (user.role === 'admin' || firebaseUser.email?.toLowerCase().trim() === ADMIN_EMAIL);
    const isBoard = isAdmin || (user.role === 'board' && user.status === 'active');
    const isFinanceEditor =
      isAdmin || (isBoard && (Boolean(user.canEditFinances) || isFinancialDirectorUser(user)));
    const email = (firebaseUser.email || user.email || '').toLowerCase().trim();
    const uid = firebaseUser.uid;
    const readCtx: TelemetryReadContext = force ? 'manual' : 'startup';

    return requestDedupe.run(`privateCore:${uid}`, async () => {
      const [
        cachedUsers,
        cachedPublicProfiles,
        cachedFinancialNotes,
        cachedFees,
        cachedTabs,
        cachedSchedules,
        cachedManual,
        cachedTitles,
        cachedWalkInClients,
        cachedWalkInTabs,
        cachedAnnouncements,
      ] = await Promise.all([
        IndexedDbCache.getDataset<User[]>({ domain: 'cadastral', key: 'users', ownerUid: uid, allowExpired: true }),
        IndexedDbCache.getDataset<MemberPublicProfile[]>({ domain: 'cadastral', key: 'publicProfiles', ownerUid: uid, allowExpired: true }),
        isFinanceEditor
          ? IndexedDbCache.getDataset<MemberFinancialNote[]>({ domain: 'finance', key: 'financialNotes', ownerUid: uid, allowExpired: true })
          : Promise.resolve(null),
        IndexedDbCache.getDataset<MemberMonthlyFee[]>({ domain: 'finance', key: 'fees', ownerUid: uid, allowExpired: true }),
        IndexedDbCache.getDataset<MemberTabDebt[]>({ domain: 'finance', key: 'tabs', ownerUid: uid, allowExpired: true }),
        IndexedDbCache.getDataset<FeeRateScheduleEntry[]>({ domain: 'finance', key: 'feeSchedules', ownerUid: uid, allowExpired: true }),
        IndexedDbCache.getDataset<ManualFinancialEntry[]>({ domain: 'finance', key: 'manualReceipts', ownerUid: uid, allowExpired: true }),
        IndexedDbCache.getDataset<MemberHonoraryTitle[]>({ domain: 'cadastral', key: 'memberTitles', ownerUid: uid, allowExpired: true }),
        IndexedDbCache.getDataset<WalkInClient[]>({ domain: 'finance', key: 'walkInClients', ownerUid: uid, allowExpired: true }),
        IndexedDbCache.getDataset<WalkInTabRecord[]>({ domain: 'finance', key: 'walkInTabs', ownerUid: uid, allowExpired: true }),
        IndexedDbCache.getDataset<ClubAnnouncement[]>({ domain: 'cadastral', key: 'announcements', ownerUid: uid, allowExpired: true }),
      ]);

      if (activePrivateFbUser?.uid !== uid) return;

      if (cachedUsers?.payload?.length) {
        IndexedDbCache.recordCacheHit('indexeddb', 'members', cachedUsers.payload.length, 'Hidratação cadastral IndexedDB (30m)');
        metaStore.lastSnapshotJson.set('users', JSON.stringify(cachedUsers.payload));
        activeCallbacks?.onUsers(cachedUsers.payload);
      }
      if (cachedPublicProfiles?.payload?.length) {
        metaStore.lastSnapshotJson.set('publicProfiles', JSON.stringify(cachedPublicProfiles.payload));
        activeCallbacks?.onPublicProfiles?.(cachedPublicProfiles.payload);
      }
      if (isFinanceEditor && cachedFinancialNotes?.payload) {
        metaStore.lastSnapshotJson.set('financialNotes', JSON.stringify(cachedFinancialNotes.payload));
        activeCallbacks?.onFinancialNotes?.(cachedFinancialNotes.payload);
      }
      if (cachedFees?.payload?.length) {
        IndexedDbCache.recordCacheHit('indexeddb', 'fees', cachedFees.payload.length, 'Hidratação financeira IndexedDB (30m)');
        metaStore.lastSnapshotJson.set('fees', JSON.stringify(cachedFees.payload));
        activeCallbacks?.onFees(cachedFees.payload);
      }
      if (cachedTabs?.payload?.length) {
        IndexedDbCache.recordCacheHit('indexeddb', 'tabs', cachedTabs.payload.length, 'Hidratação fiados IndexedDB (30m)');
        metaStore.lastSnapshotJson.set('tabs', JSON.stringify(cachedTabs.payload));
        activeCallbacks?.onTabs(cachedTabs.payload);
      }
      if (cachedSchedules?.payload) {
        metaStore.lastSnapshotJson.set('feeSchedules', JSON.stringify(cachedSchedules.payload));
        activeCallbacks?.onFeeSchedules?.(cachedSchedules.payload);
      }
      if (cachedManual?.payload) {
        metaStore.lastSnapshotJson.set('manualReceipts', JSON.stringify(cachedManual.payload));
        activeCallbacks?.onManualReceipts?.(cachedManual.payload);
      }
      if (cachedTitles?.payload) {
        metaStore.lastSnapshotJson.set('memberTitles', JSON.stringify(cachedTitles.payload));
        activeCallbacks?.onMemberTitles?.(cachedTitles.payload);
      }
      if (isFinanceEditor && cachedWalkInClients?.payload) {
        metaStore.lastSnapshotJson.set('walkInClients', JSON.stringify(cachedWalkInClients.payload));
        activeCallbacks?.onWalkInClients?.(cachedWalkInClients.payload);
      }
      if (isFinanceEditor && cachedWalkInTabs?.payload) {
        metaStore.lastSnapshotJson.set('walkInTabs', JSON.stringify(cachedWalkInTabs.payload));
        activeCallbacks?.onWalkInTabs?.(cachedWalkInTabs.payload);
      }
      if (cachedAnnouncements?.payload) {
        metaStore.lastSnapshotJson.set('clubAnnouncements', JSON.stringify(cachedAnnouncements.payload));
        activeCallbacks?.onAnnouncements?.(cachedAnnouncements.payload);
      }

      const isUsersFresh = Boolean(!force && cachedUsers?.syncStatus === 'fresh' && cachedUsers.payload?.length);
      const isPublicProfilesFresh = Boolean(!force && cachedPublicProfiles?.syncStatus === 'fresh' && cachedPublicProfiles.payload?.length);
      const isFinancialNotesFresh = !isFinanceEditor || Boolean(!force && cachedFinancialNotes?.syncStatus === 'fresh');
      const isFeesFresh = Boolean(!force && cachedFees?.syncStatus === 'fresh');
      const isTabsFresh = Boolean(!force && cachedTabs?.syncStatus === 'fresh');
      const isSchedulesFresh = Boolean(!force && cachedSchedules?.syncStatus === 'fresh');
      const isManualFresh = Boolean(!force && cachedManual?.syncStatus === 'fresh');
      const isTitlesFresh = Boolean(!force && cachedTitles?.syncStatus === 'fresh');
      const isWalkInClientsFresh = !isFinanceEditor || Boolean(!force && cachedWalkInClients?.syncStatus === 'fresh');
      const isWalkInTabsFresh = !isFinanceEditor || Boolean(!force && cachedWalkInTabs?.syncStatus === 'fresh');
      const isAnnFresh = Boolean(!force && cachedAnnouncements?.syncStatus === 'fresh');

      const tasks: Promise<unknown>[] = [];

      if (!isUsersFresh) {
        const membersRef = isBoard
          ? query(collection(db, 'members'), limit(300))
          : query(collection(db, 'members'), where('uid', '==', uid), limit(10));
        const membersPrivateRef = isBoard
          ? query(collection(db, 'membersPrivate'), limit(300))
          : query(collection(db, 'membersPrivate'), where('email', '==', email), limit(10));

        tasks.push(
          Promise.all([
            getDocs(membersRef),
            getDocs(membersPrivateRef),
          ]).then(async ([pubSnap, privSnap]) => {
            trackSnapshotTelemetry('members', pubSnap, readCtx);
            trackSnapshotTelemetry('membersPrivate', privSnap, readCtx);
            if (activePrivateFbUser?.uid !== uid) return;

            if (!pubSnap.empty || metaStore.isSeededInFirestore) {
              metaStore.membersPublicById.clear();
              pubSnap.docs.forEach((docSnap) => {
                const d = docSnap.data();
                if (d.uid) metaStore.memberUidByMemberId.set(docSnap.id, d.uid);
                metaStore.membersPublicById.set(docSnap.id, parseMemberPublicDocFields(docSnap.id, d));
              });
            }

            if (isBoard) metaStore.membersPrivateById.clear();
            privSnap.docs.forEach((docSnap) => {
              const d = docSnap.data();
              if (d.uid) metaStore.memberUidByMemberId.set(docSnap.id, d.uid);
              if (d.email) metaStore.memberEmailByMemberId.set(docSnap.id, String(d.email).toLowerCase());
              metaStore.membersPrivateById.set(docSnap.id, {
                uid: d.uid,
                email: d.email,
                phone: d.phone,
                bloodType: d.bloodType,
                emergencyContact: d.emergencyContact,
              });
            });

            if (metaStore.membersPublicById.size > 0) {
              const merged = mergeMembersIntoUsers();
              metaStore.lastSnapshotJson.set('users', JSON.stringify(merged));
              await IndexedDbCache.setDataset({
                domain: 'cadastral',
                key: 'users',
                scope: isBoard ? 'board' : 'member',
                ownerUid: uid,
                payload: merged,
                ttlMs: CACHE_TTL_30M_MS,
              });
              activeCallbacks?.onUsers(merged);
              const updatedMe = merged.find((m) => m.id === user.id);
              if (updatedMe) {
                currentResolvedUser = updatedMe;
                activeCallbacks?.onCurrentUser(updatedMe);
              }
              hasServerMembersSnap = true;
              hasServerMembersPrivateSnap = true;
              maybeAutoReconcileBoardRoles();
            }
          })
        );
      }

      if (!isPublicProfilesFresh) {
        tasks.push(
          getDocs(query(collection(db, 'memberPublicProfiles'), where('clubDirectory', '==', true), limit(300))).then(
            async (snap) => {
              trackSnapshotTelemetry('memberPublicProfiles', snap, readCtx);
              if (snap.empty && !metaStore.isSeededInFirestore) return;
              const profiles: MemberPublicProfile[] = snap.docs.map((docSnap) => {
                const d = docSnap.data();
                return {
                  id: d.id || docSnap.id,
                  uid: d.uid || undefined,
                  name: d.name || '',
                  nickname: d.nickname || undefined,
                  avatarUrl: d.avatarUrl || undefined,
                  birthDate: d.birthDate || undefined,
                  joinedDate: d.joinedDate || undefined,
                  joinedYear: typeof d.joinedYear === 'number' ? d.joinedYear : undefined,
                  phone: d.phone || undefined,
                  updatedAt: d.updatedAt ? tsToIso(d.updatedAt) : undefined,
                };
              });
              metaStore.lastSnapshotJson.set('publicProfiles', JSON.stringify(profiles));
              await IndexedDbCache.setDataset({
                domain: 'cadastral',
                key: 'publicProfiles',
                scope: isBoard ? 'board' : 'member',
                ownerUid: uid,
                payload: profiles,
                ttlMs: CACHE_TTL_30M_MS,
              });
              activeCallbacks?.onPublicProfiles?.(profiles);
            }
          )
        );
      }

      if (isFinanceEditor && !isFinancialNotesFresh) {
        tasks.push(
          getDocs(query(collection(db, 'memberFinancialNotes'), where('financeOnly', '==', true), limit(300))).then(
            async (snap) => {
              trackSnapshotTelemetry('memberFinancialNotes', snap, readCtx);
              const list = snap.docs.map((docSnap) => parseFinancialNoteDoc(docSnap.id, docSnap.data()));
              metaStore.lastSnapshotJson.set('financialNotes', JSON.stringify(list));
              await IndexedDbCache.setDataset({
                domain: 'finance',
                key: 'financialNotes',
                scope: 'board',
                ownerUid: uid,
                payload: list,
                ttlMs: CACHE_TTL_30M_MS,
              });
              activeCallbacks?.onFinancialNotes?.(list);
            }
          )
        );
      }

      if (!isFeesFresh) {
        const feesRef = isBoard
          ? query(collection(db, 'fees'), limit(500))
          : query(collection(db, 'fees'), where('memberEmail', '==', email), limit(160));
        tasks.push(
          getDocs(feesRef).then(async (snap) => {
            trackSnapshotTelemetry('fees', snap, readCtx);
            if (snap.empty && !metaStore.isSeededInFirestore) return;
            const list = snap.docs.map((docSnap) => parseFeeDoc(docSnap.id, docSnap.data()));
            metaStore.lastSnapshotJson.set('fees', JSON.stringify(list));
            await IndexedDbCache.setDataset({
              domain: 'finance',
              key: 'fees',
              scope: isBoard ? 'board' : 'member',
              ownerUid: uid,
              payload: list,
              ttlMs: CACHE_TTL_30M_MS,
            });
            activeCallbacks?.onFees(list);
          })
        );
      }

      if (!isTabsFresh) {
        const tabsRef = isBoard
          ? query(collection(db, 'tabs'), limit(400))
          : query(collection(db, 'tabs'), where('memberEmail', '==', email), limit(120));
        tasks.push(
          getDocs(tabsRef).then(async (snap) => {
            trackSnapshotTelemetry('tabs', snap, readCtx);
            if (snap.empty && !metaStore.isSeededInFirestore) return;
            const list: MemberTabDebt[] = snap.docs.map((docSnap) =>
              parseTabDebtDoc(docSnap.id, docSnap.data())
            );
            metaStore.lastSnapshotJson.set('tabs', JSON.stringify(list));
            await IndexedDbCache.setDataset({
              domain: 'finance',
              key: 'tabs',
              scope: isBoard ? 'board' : 'member',
              ownerUid: uid,
              payload: list,
              ttlMs: CACHE_TTL_30M_MS,
            });
            activeCallbacks?.onTabs(list);
          })
        );
      }

      if (!isSchedulesFresh) {
        tasks.push(
          getDocs(query(collection(db, 'feeSchedules'), where('clubOnly', '==', true), limit(120))).then(
            async (snap) => {
              trackSnapshotTelemetry('feeSchedules', snap, readCtx);
              const list = snap.docs.map((docSnap) => parseFeeScheduleDoc(docSnap.id, docSnap.data()));
              metaStore.lastSnapshotJson.set('feeSchedules', JSON.stringify(list));
              await IndexedDbCache.setDataset({
                domain: 'finance',
                key: 'feeSchedules',
                scope: isBoard ? 'board' : 'member',
                ownerUid: uid,
                payload: list,
                ttlMs: CACHE_TTL_30M_MS,
              });
              activeCallbacks?.onFeeSchedules?.(list);
            }
          )
        );
      }

      if (!isManualFresh) {
        const manualRef = isBoard
          ? query(collection(db, 'manualReceipts'), limit(500))
          : query(collection(db, 'manualReceipts'), where('memberEmail', '==', email), limit(120));
        tasks.push(
          getDocs(manualRef).then(async (snap) => {
            trackSnapshotTelemetry('manualReceipts', snap, readCtx);
            const list = snap.docs.map((docSnap) => parseManualReceiptDoc(docSnap.id, docSnap.data()));
            metaStore.lastSnapshotJson.set('manualReceipts', JSON.stringify(list));
            await IndexedDbCache.setDataset({
              domain: 'finance',
              key: 'manualReceipts',
              scope: isBoard ? 'board' : 'member',
              ownerUid: uid,
              payload: list,
              ttlMs: CACHE_TTL_30M_MS,
            });
            activeCallbacks?.onManualReceipts?.(list);
          })
        );
      }

      if (!isTitlesFresh) {
        tasks.push(
          getDocs(query(collection(db, 'memberTitles'), where('clubOnly', '==', true), limit(250))).then(
            async (snap) => {
              trackSnapshotTelemetry('memberTitles', snap, readCtx);
              const list = snap.docs.map((docSnap) => parseMemberTitleDoc(docSnap.id, docSnap.data()));
              metaStore.lastSnapshotJson.set('memberTitles', JSON.stringify(list));
              await IndexedDbCache.setDataset({
                domain: 'cadastral',
                key: 'memberTitles',
                scope: isBoard ? 'board' : 'member',
                ownerUid: uid,
                payload: list,
                ttlMs: CACHE_TTL_30M_MS,
              });
              activeCallbacks?.onMemberTitles?.(list);
            }
          )
        );
      }

      if (isFinanceEditor && !isWalkInClientsFresh) {
        tasks.push(
          getDocs(query(collection(db, 'walkInClients'), where('financeOnly', '==', true), limit(150))).then(
            async (snap) => {
              trackSnapshotTelemetry('walkInClients', snap, readCtx);
              const list = snap.docs.map((docSnap) => parseWalkInClientDoc(docSnap.id, docSnap.data()));
              metaStore.lastSnapshotJson.set('walkInClients', JSON.stringify(list));
              await IndexedDbCache.setDataset({
                domain: 'finance',
                key: 'walkInClients',
                scope: 'board',
                ownerUid: uid,
                payload: list,
                ttlMs: CACHE_TTL_30M_MS,
              });
              activeCallbacks?.onWalkInClients?.(list);
            }
          )
        );
      }

      if (isFinanceEditor && !isWalkInTabsFresh) {
        tasks.push(
          getDocs(query(collection(db, 'walkInTabs'), where('financeOnly', '==', true), limit(300))).then(
            async (snap) => {
              trackSnapshotTelemetry('walkInTabs', snap, readCtx);
              const list = snap.docs.map((docSnap) => parseWalkInTabDoc(docSnap.id, docSnap.data()));
              metaStore.lastSnapshotJson.set('walkInTabs', JSON.stringify(list));
              await IndexedDbCache.setDataset({
                domain: 'finance',
                key: 'walkInTabs',
                scope: 'board',
                ownerUid: uid,
                payload: list,
                ttlMs: CACHE_TTL_30M_MS,
              });
              activeCallbacks?.onWalkInTabs?.(list);
            }
          )
        );
      }

      if (!isAnnFresh) {
        tasks.push(
          getDocs(query(collection(db, 'clubAnnouncements'), where('clubOnly', '==', true), limit(40))).then(
            async (snap) => {
              trackSnapshotTelemetry('clubAnnouncements', snap, readCtx);
              const items: ClubAnnouncement[] = snap.docs.map((docSnap) => {
                const d = docSnap.data();
                const docId = d.id || docSnap.id;
                if (d.createdAt) {
                  metaStore.announcementCreatedAtById.set(docId, d.createdAt);
                }
                return {
                  id: docId,
                  title: d.title || '',
                  message: d.message || '',
                  kind:
                    d.kind === 'urgent' || d.kind === 'event' || d.kind === 'meeting'
                      ? d.kind
                      : 'info',
                  pinned: Boolean(d.pinned),
                  isPublic: Boolean(d.isPublic),
                  authorId: d.authorId || '',
                  authorName: d.authorName || '',
                  authorUid: d.authorUid || undefined,
                  createdAt: tsToIso(d.createdAt),
                };
              });
              items.sort((a, b) => {
                if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
                return b.createdAt.localeCompare(a.createdAt);
              });
              metaStore.lastSnapshotJson.set('clubAnnouncements', JSON.stringify(items));
              await IndexedDbCache.setDataset({
                domain: 'cadastral',
                key: 'announcements',
                scope: isBoard ? 'board' : 'member',
                ownerUid: uid,
                payload: items,
                ttlMs: CACHE_TTL_30M_MS,
              });
              activeCallbacks?.onAnnouncements?.(items);
            }
          )
        );
      }

      const settled = await Promise.allSettled(tasks);
      for (const res of settled) {
        if (res.status === 'rejected') {
          if (isQuotaError(res.reason)) {
            handleQuotaOrListenerError(res.reason, OperationType.LIST, 'reloadPrivateCore');
            break;
          }
          if (!isOfflineOrNetworkError(res.reason)) {
            telemetryMonitor.recordError('reloadPrivateCore', String(res.reason), false);
          }
        }
      }
    });
  },

  startPrivateListeners(user: User, firebaseUser: FirebaseUser, initialSection = 'history') {
    this.stopPrivateListeners();
    if (quotaBreaker.isBlocked()) {
      currentResolvedUser = user;
      activeCallbacks?.onQuotaStatusChange?.(quotaBreaker.getStatus());
      return;
    }

    currentResolvedUser = user;
    activePrivateUser = user;
    activePrivateFbUser = firebaseUser;
    activeSectionName = initialSection || 'history';

    const isAdmin =
      user.status === 'active' &&
      (user.role === 'admin' || firebaseUser.email?.toLowerCase().trim() === ADMIN_EMAIL);
    const isActiveMember = isAdmin || user.status === 'active';
    const isSosApproved = isAdmin || (isActiveMember && user.sosApproved);

    if (!isActiveMember) return;

    // Único listener permanente permitido: alertas de emergência S.O.S.
    if (isSosApproved) {
      sosUnsub = onSnapshot(
        query(collection(db, 'sosAlerts'), where('sosOnly', '==', true), limit(40)),
        (snap) => {
          trackSnapshotTelemetry('sosAlerts', snap, 'startup');
          if (snap.empty && !metaStore.isSeededInFirestore) return;
          const list: SOSAlert[] = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            metaStore.sosAuthorById.set(docSnap.id, d.authorUid || '');
            metaStore.sosCreatedAtById.set(docSnap.id, d.createdAt);
            return {
              id: d.id || docSnap.id,
              memberId: d.memberId,
              memberName: d.memberName,
              memberPhone: d.memberPhone,
              memberMotorcycle: d.memberMotorcycle,
              bloodType: d.bloodType,
              type: d.type,
              description: d.description,
              latitude: d.latitude,
              longitude: d.longitude,
              locationAddress: d.locationAddress,
              createdAt: tsToIso(d.createdAt),
              status: d.status,
              responders: Array.isArray(d.responders) ? d.responders : [],
            };
          });
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          metaStore.lastSnapshotJson.set('sosAlerts', JSON.stringify(list));
          activeCallbacks?.onSOSAlerts(list);
        },
        (err) => handleQuotaOrListenerError(err, OperationType.LIST, 'sosAlerts')
      );
    }

    void this.reloadPrivateCoreData(user, firebaseUser, false);
    void this.setActiveSection(activeSectionName, false);
  },

  async seedDatabaseIfEmpty(
    adminUid: string,
    localSeed: LocalSeedData
  ): Promise<void> {
    if (metaStore.isSeededInFirestore || quotaBreaker.isBlocked()) {
      return;
    }
    const clubDocRef = doc(db, 'clubSettings', 'main');
    let exists = false;
    try {
      const snap = await requestDedupe.run('seedCheck:clubSettings', () => getDoc(clubDocRef));
      trackSnapshotTelemetry('clubSettings(seedCheck)', snap, 'startup');
      exists = snap.exists();
    } catch (err) {
      if (isQuotaError(err)) {
        quotaBreaker.trip(err);
        return;
      }
      if (isOfflineOrNetworkError(err) || isPermissionOrAuthError(err)) {
        console.warn('seedDatabaseIfEmpty ignorada por indisponibilidade transitória:', err);
        return;
      }
      console.warn('Falha ao verificar seedDatabaseIfEmpty:', err);
      return;
    }

    if (exists) {
      metaStore.isSeededInFirestore = true;
      return;
    }

    // Seed limpo apenas com configurações institucionais, cargos estruturais vagos e o Administrador Geral real (sem dados de teste)
    const clubInfo = localSeed.clubInfo || INITIAL_CLUB_INFO;
    const boardRoles = await Promise.all(
      (localSeed.boardRoles?.length ? localSeed.boardRoles : INITIAL_BOARD_ROLES).map(async (r) => ({
        ...r,
        avatarUrl: r.avatarUrl
          ? await compressDataUrlIfNeeded(r.avatarUrl, { maxDimension: 420, maxChars: 120_000 })
          : '',
      }))
    );

    const adminTemplate: User = {
      ...INITIAL_USERS[0],
      boardRoleId: undefined,
    };
    const existingUsers = localSeed.users?.length ? localSeed.users : [adminTemplate];
    const users = await Promise.all(
      existingUsers.map(async (u) => ({
        ...u,
        avatarUrl: u.avatarUrl
          ? await compressDataUrlIfNeeded(u.avatarUrl, { maxDimension: 420, maxChars: 120_000 })
          : u.avatarUrl,
      }))
    );

    const ops: { ref: ReturnType<typeof doc>; data: Record<string, unknown> }[] = [];
    ops.push({ ref: clubDocRef, data: serializeClubSettings(clubInfo) });

    boardRoles.forEach((r) => {
      ops.push({ ref: doc(db, 'boardRoles', safeId(r.id)), data: serializeBoardRole(r) });
      ops.push({ ref: doc(db, 'boardRoleContacts', safeId(r.id)), data: serializeBoardRoleContact(r) });
    });

    users.forEach((u) => {
      const isBootAdmin = u.email.toLowerCase().trim() === ADMIN_EMAIL;
      const uid = isBootAdmin ? adminUid : '';
      ops.push({ ref: doc(db, 'members', safeId(u.id)), data: serializeMemberPublic(u, uid) });
      ops.push({ ref: doc(db, 'memberPublicProfiles', safeId(u.id)), data: serializeMemberPublicProfile(u, uid) });
      ops.push({ ref: doc(db, 'membersPrivate', safeId(u.id)), data: serializeMemberPrivate(u, uid) });
      if (isBootAdmin) {
        ops.push({ ref: doc(db, 'userLinks', safeId(adminUid)), data: serializeUserLink(adminUid, u) });
      }
    });

    try {
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        const slice = ops.slice(i, i + 400);
        slice.forEach((op) => batch.set(op.ref, op.data));
        await batch.commit();
        telemetryMonitor.recordWrite('seedInitialDatabase', slice.length, 'Inicialização limpa');
      }
      metaStore.isSeededInFirestore = true;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'seedInitialDatabase');
    }
  },

  resetAuthCaches() {
    pendingSessionResolves.clear();
    requestDedupe.invalidate();
    this.stopPrivateListeners();
  },

  async resolveUserSession(
    firebaseUser: FirebaseUser,
    localSeed?: LocalSeedData
  ): Promise<SessionResolutionResult> {
    const uid = firebaseUser.uid;
    const inFlight = pendingSessionResolves.get(uid);
    if (inFlight) {
      telemetryMonitor.recordDedupeBlocked('resolveUserSession', 3, 'Chamada simultânea deduplicada');
      return inFlight;
    }

    const run = (async (): Promise<SessionResolutionResult> => {
      const rawEmail = (firebaseUser.email || '').trim();
      const email = rawEmail.toLowerCase();

      if (!email) {
        throw new Error('A conta autenticada não possui um endereço de e-mail válido.');
      }

      const findLocalFallbackUser = async (): Promise<User | null> => {
        const cachedUsers = await IndexedDbCache.getDataset<User[]>({
          domain: 'cadastral',
          key: 'users',
          ownerUid: uid,
          allowExpired: true,
        });
        const candidates = [...(cachedUsers?.payload || []), ...(localSeed?.users || [])];
        const exact = candidates.find(
          (u) => u.email && u.email.toLowerCase().trim() === email
        );
        if (exact) return exact;
        if (email === ADMIN_EMAIL) {
          return {
            ...INITIAL_USERS[0],
            boardRoleId: undefined,
            email: ADMIN_EMAIL,
            name: firebaseUser.displayName || INITIAL_USERS[0].name,
            avatarUrl: firebaseUser.photoURL || INITIAL_USERS[0].avatarUrl,
          };
        }
        return null;
      };

      if (!firebaseUser.emailVerified) {
        await firebaseUser.reload().catch(() => {});
        await firebaseUser.getIdToken(true).catch(() => {});
        if (!firebaseUser.emailVerified) {
          const isPasswordProvider = (firebaseUser.providerData || []).some(
            (p) => p?.providerId === 'password'
          );
          if (isPasswordProvider) {
            // Regras Firestore exigem email_verified == true; devolve estado amigável para confirmação por e-mail
            return {
              user: await findLocalFallbackUser(),
              needsRegistration: false,
              needsEmailVerification: true,
            };
          }
          throw new Error(
            'O e-mail desta conta ainda não está verificado. Confirme a verificação enviada para seu e-mail e tente novamente.'
          );
        }
      }

      // Se a cota diária estiver esgotada no momento, libera acesso imediato via cache local seguro sem travar o login
      if (quotaBreaker.isBlocked()) {
        const localUser = await findLocalFallbackUser();
        if (localUser) {
          return {
            user: localUser,
            needsRegistration: false,
            fromLocalFallback: true,
          };
        }
        return { user: null, needsRegistration: true, fromLocalFallback: true };
      }

      const buildResolvedUser = (
        memberId: string,
        p: Record<string, any>,
        pr: Record<string, any>
      ): User => ({
        ...parseMemberPublicDocFields(memberId, p),
        id: p.id || memberId,
        name: p.name || firebaseUser.displayName || 'Integrante',
        email: pr.email || email,
        phone: pr.phone || '',
        role: p.role === 'admin' || p.role === 'board' ? p.role : 'member',
        status: p.status === 'pending' || p.status === 'suspended' ? p.status : 'active',
        motorcycle: p.motorcycle || '',
        bloodType: pr.bloodType || undefined,
        emergencyContact: pr.emergencyContact || undefined,
        joinedYear: Number(p.joinedYear) || new Date().getFullYear(),
      });

      const resolveAttempt = async (allowTokenRefresh: boolean): Promise<SessionResolutionResult> => {
        let hadBlockingLookupError = false;
        let lastLookupError: unknown = null;

        // 1. Admin bootstrap seed (seguro, nunca quebra o login em caso de cota/offline)
        if (email === ADMIN_EMAIL && localSeed && !metaStore.isSeededInFirestore) {
          await this.seedDatabaseIfEmpty(uid, localSeed);
        }

        // 2. Check existing userLinks/{uid} usando cache-first SDK (1 leitura em cache/delta)
        let userLinkSnap = null;
        try {
          userLinkSnap = await getDoc(doc(db, 'userLinks', safeId(uid)));
          trackSnapshotTelemetry('userLinks', userLinkSnap, 'auth');
        } catch (err) {
          if (isQuotaError(err)) {
            quotaBreaker.trip(err);
            const fallback = await findLocalFallbackUser();
            if (fallback) {
              return { user: fallback, needsRegistration: false, fromLocalFallback: true };
            }
          }
          if (allowTokenRefresh && isPermissionOrAuthError(err)) {
            await firebaseUser.getIdToken(true).catch(() => {});
            return resolveAttempt(false);
          }
          console.warn('Falha ao consultar userLinks:', err);
          hadBlockingLookupError = true;
          lastLookupError = err;
        }

        if (userLinkSnap && userLinkSnap.exists()) {
          const link = userLinkSnap.data();
          const memberId = String(link.memberId || '').trim();
          if (memberId) {
            try {
              const pubSnap = await getDoc(doc(db, 'members', safeId(memberId)));
              trackSnapshotTelemetry('members(auth)', pubSnap, 'auth');
              if (pubSnap.exists()) {
                const p = pubSnap.data();
                let pr: Record<string, any> = {};
                try {
                  const privSnap = await getDoc(doc(db, 'membersPrivate', safeId(memberId)));
                  trackSnapshotTelemetry('membersPrivate(auth)', privSnap, 'auth');
                  if (privSnap.exists()) pr = privSnap.data();
                } catch (privErr) {
                  console.debug('Leitura complementar membersPrivate ignorada:', privErr);
                }

                const resolved = buildResolvedUser(memberId, p, pr);

                if (!quotaBreaker.isBlocked()) {
                  if (!p.uid || p.uid !== uid) {
                    updateDoc(doc(db, 'members', safeId(memberId)), {
                      uid,
                      updatedAt: serverTimestamp(),
                    }).catch(() => {});
                  }
                  if (Object.keys(pr).length > 0 && (!pr.uid || pr.uid !== uid)) {
                    updateDoc(doc(db, 'membersPrivate', safeId(memberId)), {
                      uid,
                      updatedAt: serverTimestamp(),
                    }).catch(() => {});
                  }
                  if (
                    link.role !== resolved.role ||
                    link.status !== resolved.status ||
                    String(link.email || '').toLowerCase() !== resolved.email.toLowerCase() ||
                    Boolean(link.sosApproved) !== Boolean(resolved.sosApproved) ||
                    Boolean(link.canEditFinances) !== Boolean(resolved.canEditFinances) ||
                    String(link.boardRoleId || '') !== String(resolved.boardRoleId || '')
                  ) {
                    setDoc(
                      doc(db, 'userLinks', safeId(uid)),
                      serializeUserLink(uid, resolved)
                    ).catch(() => {});
                  }
                }

                return { user: resolved, needsRegistration: false };
              }
            } catch (err) {
              if (isQuotaError(err)) {
                quotaBreaker.trip(err);
                const fallback = await findLocalFallbackUser();
                if (fallback) {
                  return { user: fallback, needsRegistration: false, fromLocalFallback: true };
                }
              }
              console.warn(`userLinks/${uid} aponta para members/${memberId} indisponível:`, err);
            }
          }
        }

        // 2.5 Orphan recovery: lookup member directly by uid if userLink missing or pointed to old deleted doc
        if (!quotaBreaker.isBlocked()) {
          try {
            const uidSnap = await getDocs(
              query(collection(db, 'members'), where('uid', '==', uid), limit(1))
            );
            if (!uidSnap.empty) {
              const pubDoc = uidSnap.docs[0];
              const p = pubDoc.data();
              const memberId = pubDoc.id;
              let pr: Record<string, any> = {};
              try {
                const privSnap = await getDoc(doc(db, 'membersPrivate', safeId(memberId)));
                if (privSnap.exists()) pr = privSnap.data();
              } catch (privErr) {
                console.debug('membersPrivate não disponível na recuperação por UID:', privErr);
              }
              const resolved = buildResolvedUser(memberId, p, pr);
              setDoc(doc(db, 'userLinks', safeId(uid)), serializeUserLink(uid, resolved)).catch(
                () => {}
              );
              return { user: resolved, needsRegistration: false };
            }
          } catch (err) {
            if (isQuotaError(err)) quotaBreaker.trip(err);
            console.debug('UID recovery lookup skipped:', err);
          }
        }

        // 3. Look up pre-registered member by verified email (or UID) in membersPrivate
        if (!quotaBreaker.isBlocked()) {
          const candidateQueries = [
            query(collection(db, 'membersPrivate'), where('email', '==', email), limit(1)),
            ...(rawEmail && rawEmail !== email
              ? [query(collection(db, 'membersPrivate'), where('email', '==', rawEmail), limit(1))]
              : []),
            query(collection(db, 'membersPrivate'), where('uid', '==', uid), limit(1)),
          ];

          for (const q of candidateQueries) {
            try {
              const privDocs = await getDocs(q);
              if (!privDocs.empty) {
                const privDoc = privDocs.docs[0];
                const memberId = privDoc.id;
                const pubSnap = await getDoc(doc(db, 'members', safeId(memberId)));
                if (pubSnap.exists()) {
                  const p = pubSnap.data();
                  const pr = privDoc.data();
                  const resolved = buildResolvedUser(memberId, p, pr);

                  if (!p.uid || p.uid !== uid) {
                    await updateDoc(doc(db, 'members', safeId(memberId)), {
                      uid,
                      updatedAt: serverTimestamp(),
                    }).catch((err) => console.warn('Aviso ao vincular UID em members:', err));
                  }
                  if (!pr.uid || pr.uid !== uid) {
                    await updateDoc(doc(db, 'membersPrivate', safeId(memberId)), {
                      uid,
                      updatedAt: serverTimestamp(),
                    }).catch((err) => console.warn('Aviso ao vincular UID em membersPrivate:', err));
                  }
                  await setDoc(
                    doc(db, 'userLinks', safeId(uid)),
                    serializeUserLink(uid, resolved)
                  ).catch((err) => {
                    console.warn('Erro ao atualizar userLinks no login:', err);
                  });

                  return { user: resolved, needsRegistration: false };
                }
              }
            } catch (err) {
              if (isQuotaError(err)) {
                quotaBreaker.trip(err);
                const fallback = await findLocalFallbackUser();
                if (fallback) {
                  return { user: fallback, needsRegistration: false, fromLocalFallback: true };
                }
              }
              if (allowTokenRefresh && isPermissionOrAuthError(err)) {
                await firebaseUser.getIdToken(true).catch(() => {});
                return resolveAttempt(false);
              }
              console.warn('Falha em consulta membersPrivate no login:', err);
              hadBlockingLookupError = true;
              lastLookupError = err;
            }
          }
        }

        // 4. Fallback seguro se houver erro de cota/rede antes de tentar criar doc
        if (hadBlockingLookupError && (isQuotaError(lastLookupError) || isOfflineOrNetworkError(lastLookupError))) {
          const fallback = await findLocalFallbackUser();
          if (fallback) {
            return { user: fallback, needsRegistration: false, fromLocalFallback: true };
          }
        }

        // 5. If Admin email had no member doc yet (edge case), create admin profile
        if (email === ADMIN_EMAIL) {
          const adminProfile: User = {
            ...INITIAL_USERS[0],
            boardRoleId: undefined,
            email: ADMIN_EMAIL,
            name: firebaseUser.displayName || INITIAL_USERS[0].name,
            avatarUrl: firebaseUser.photoURL || INITIAL_USERS[0].avatarUrl,
          };
          if (!quotaBreaker.isBlocked()) {
            try {
              await setDoc(doc(db, 'members', 'user-admin'), serializeMemberPublic(adminProfile, uid));
              await setDoc(
                doc(db, 'membersPrivate', 'user-admin'),
                serializeMemberPrivate(adminProfile, uid)
              );
              await setDoc(
                doc(db, 'userLinks', safeId(uid)),
                serializeUserLink(uid, adminProfile)
              );
              telemetryMonitor.recordWrite('userLinks/members', 3, 'Bootstrap Admin');
            } catch (err) {
              if (isQuotaError(err) || isOfflineOrNetworkError(err)) {
                if (isQuotaError(err)) quotaBreaker.trip(err);
                return { user: adminProfile, needsRegistration: false, fromLocalFallback: true };
              }
              console.error('Erro ao criar perfil do Administrador Geral na nuvem:', err);
              throw new Error(
                'Não foi possível inicializar o cadastro do Administrador Geral na nuvem. Verifique sua conexão e tente novamente.'
              );
            }
          }
          return { user: adminProfile, needsRegistration: false };
        }

        if (hadBlockingLookupError) {
          const fallback = await findLocalFallbackUser();
          if (fallback) {
            return { user: fallback, needsRegistration: false, fromLocalFallback: true };
          }
          if (isQuotaError(lastLookupError)) {
            throw new Error(
              'Cota diária de consultas na nuvem atingida no momento. Tente novamente após o reinício da cota ou faça upgrade do plano Firestore.'
            );
          }
          if (isOfflineOrNetworkError(lastLookupError)) {
            throw new Error(
              'Sem conexão estável com o servidor na nuvem no momento. Verifique sua internet e toque em "Reconectar Cadastro".'
            );
          }
          if (isPermissionOrAuthError(lastLookupError)) {
            throw new Error(
              'A verificação de segurança da conta na nuvem falhou. Confirme seu e-mail ou toque em "Reconectar Cadastro".'
            );
          }
          throw new Error(
            'Não foi possível consultar seu cadastro na nuvem agora. Tente novamente em instantes.'
          );
        }

        return { user: null, needsRegistration: true };
      };

      return resolveAttempt(true);
    })();

    pendingSessionResolves.set(uid, run);
    try {
      return await run;
    } finally {
      pendingSessionResolves.delete(uid);
    }
  },

  resolveGoogleUserSession(
    firebaseUser: FirebaseUser,
    localSeed?: LocalSeedData
  ): Promise<SessionResolutionResult> {
    return this.resolveUserSession(firebaseUser, localSeed);
  },

  async linkGoogleRequestToPreRegisteredMember(
    pendingUserId: string,
    targetMemberId: string
  ): Promise<User> {
    const fbUser = ensureCloudAuth();
    if (!fbUser) {
      throw new Error('Conecte sua conta de Administrador para associar cadastros.');
    }
    const pendingSafeId = safeId(pendingUserId);
    const targetSafeId = safeId(targetMemberId);

    try {
      const [pendingPubSnap, pendingPrivSnap, targetPubSnap, targetPrivSnap] = await Promise.all([
        getDoc(doc(db, 'members', pendingSafeId)),
        getDoc(doc(db, 'membersPrivate', pendingSafeId)),
        getDoc(doc(db, 'members', targetSafeId)),
        getDoc(doc(db, 'membersPrivate', targetSafeId)),
      ]);

      if (!targetPubSnap.exists()) {
        throw new Error('Cadastro pré-registrado de destino não encontrado na nuvem.');
      }

      const pendingPub = pendingPubSnap.exists() ? pendingPubSnap.data() : {};
      const pendingPriv = pendingPrivSnap.exists() ? pendingPrivSnap.data() : {};
      const targetPub = targetPubSnap.data();
      const targetPriv = targetPrivSnap.exists() ? targetPrivSnap.data() : {};

      const googleUid = String(
        pendingPub.uid ||
          pendingPriv.uid ||
          metaStore.memberUidByMemberId.get(pendingUserId) ||
          ''
      ).trim();
      const googleEmail = String(
        pendingPriv.email ||
          metaStore.memberEmailByMemberId.get(pendingUserId) ||
          targetPriv.email ||
          ''
      )
        .toLowerCase()
        .trim();

      const baseTarget = parseMemberPublicDocFields(targetSafeId, targetPub);
      const mergedUser: User = {
        ...baseTarget,
        id: targetSafeId,
        name: targetPub.name || pendingPub.name || 'Integrante',
        nickname: targetPub.nickname || pendingPub.nickname || undefined,
        email: googleEmail || targetPriv.email || '',
        phone: targetPriv.phone || pendingPriv.phone || '',
        role:
          targetPub.role === 'admin' || targetPub.role === 'board'
            ? targetPub.role
            : 'member',
        status: targetPub.status === 'suspended' ? 'suspended' : 'active',
        sosApproved: Boolean(targetPub.sosApproved),
        motorcycle: targetPub.motorcycle || pendingPub.motorcycle || '',
        bloodType: targetPriv.bloodType || pendingPriv.bloodType || undefined,
        emergencyContact: targetPriv.emergencyContact || pendingPriv.emergencyContact || undefined,
        joinedYear: Number(targetPub.joinedYear) || new Date().getFullYear(),
        joinedDate: targetPub.joinedDate || pendingPub.joinedDate || undefined,
        birthDate: targetPub.birthDate || pendingPub.birthDate || undefined,
        boardRoleId: targetPub.boardRoleId || undefined,
        customRoleTitle: targetPub.customRoleTitle || pendingPub.customRoleTitle || undefined,
        avatarUrl: targetPub.avatarUrl || pendingPub.avatarUrl || undefined,
        canEditFinances: Boolean(targetPub.canEditFinances),
        isMinor: Boolean(targetPub.isMinor),
        responsibleMemberId: targetPub.responsibleMemberId || undefined,
        responsibleMemberName: targetPub.responsibleMemberName || undefined,
        memberCategory: targetPub.memberCategory
          ? sanitizeMemberCategory(targetPub.memberCategory)
          : sanitizeMemberCategory(pendingPub.memberCategory),
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'members', targetSafeId), serializeMemberPublic(mergedUser, googleUid));
      batch.set(doc(db, 'memberPublicProfiles', targetSafeId), serializeMemberPublicProfile(mergedUser, googleUid));
      batch.set(doc(db, 'membersPrivate', targetSafeId), serializeMemberPrivate(mergedUser, googleUid));
      if (googleUid) {
        batch.set(doc(db, 'userLinks', safeId(googleUid)), serializeUserLink(googleUid, mergedUser));
      }
      if (pendingSafeId !== targetSafeId) {
        batch.delete(doc(db, 'members', pendingSafeId));
        batch.delete(doc(db, 'memberPublicProfiles', pendingSafeId));
        batch.delete(doc(db, 'membersPrivate', pendingSafeId));
      }

      // Migrate fees and tabs belonging to target or duplicate pending profile to use googleUid & googleEmail
      const [feesTargetSnap, feesPendingSnap, tabsTargetSnap, tabsPendingSnap] = await Promise.all([
        getDocs(query(collection(db, 'fees'), where('memberId', '==', targetSafeId))),
        getDocs(query(collection(db, 'fees'), where('memberId', '==', pendingSafeId))),
        getDocs(query(collection(db, 'tabs'), where('memberId', '==', targetSafeId))),
        getDocs(query(collection(db, 'tabs'), where('memberId', '==', pendingSafeId))),
      ]);

      const updateFinanceRefs = (snaps: typeof feesTargetSnap, colName: 'fees' | 'tabs') => {
        snaps.docs.forEach((dSnap) => {
          batch.update(doc(db, colName, dSnap.id), {
            memberId: targetSafeId,
            memberUid: googleUid,
            memberEmail: googleEmail,
            memberName: mergedUser.name,
            updatedAt: serverTimestamp(),
          });
        });
      };
      updateFinanceRefs(feesTargetSnap, 'fees');
      updateFinanceRefs(feesPendingSnap, 'fees');
      updateFinanceRefs(tabsTargetSnap, 'tabs');
      updateFinanceRefs(tabsPendingSnap, 'tabs');

      await batch.commit();

      if (googleUid) metaStore.memberUidByMemberId.set(targetSafeId, googleUid);
      if (googleEmail) metaStore.memberEmailByMemberId.set(targetSafeId, googleEmail);
      metaStore.memberUidByMemberId.delete(pendingSafeId);
      metaStore.memberEmailByMemberId.delete(pendingSafeId);

      return mergedUser;
    } catch (err) {
      notifySyncError(err, 'Erro ao associar conta Google ao cadastro');
      handleFirestoreError(err, OperationType.WRITE, `members/${targetSafeId}`);
    }
  },

  async registerGoogleCandidate(
    firebaseUser: FirebaseUser,
    candidate: {
      name: string;
      nickname?: string;
      phone: string;
      motorcycle: string;
      bloodType: string;
      emergencyContact: string;
      birthDate?: string;
      memberCategory?: MemberCategory;
    }
  ): Promise<User> {
    const memberId = `user-${Date.now()}`;
    const email = (firebaseUser.email || '').toLowerCase().trim();
    const todayIso = new Date().toISOString().split('T')[0];
    const newUser: User = {
      id: memberId,
      name: candidate.name.trim(),
      nickname: candidate.nickname?.trim() || undefined,
      email,
      phone: candidate.phone.trim(),
      role: 'member',
      status: 'pending',
      sosApproved: false,
      motorcycle: candidate.motorcycle.trim(),
      bloodType: candidate.bloodType || 'O+',
      emergencyContact: candidate.emergencyContact.trim(),
      joinedYear: new Date().getFullYear(),
      joinedDate: todayIso,
      birthDate: candidate.birthDate?.trim() || undefined,
      avatarUrl:
        firebaseUser.photoURL ||
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
      canEditFinances: false,
      memberCategory: sanitizeMemberCategory(candidate.memberCategory),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'members', memberId), serializeMemberPublic(newUser, firebaseUser.uid));
      batch.set(doc(db, 'memberPublicProfiles', memberId), serializeMemberPublicProfile(newUser, firebaseUser.uid));
      batch.set(doc(db, 'membersPrivate', memberId), serializeMemberPrivate(newUser, firebaseUser.uid));
      batch.set(doc(db, 'userLinks', safeId(firebaseUser.uid)), serializeUserLink(firebaseUser.uid, newUser));
      await batch.commit();
      return newUser;
    } catch (err) {
      notifySyncError(err, 'Erro ao enviar cadastro');
      handleFirestoreError(err, OperationType.CREATE, `members/${memberId}`);
    }
  },

  // --- Cloud Write Sync Methods ---

  async saveClubInfo(next: ClubInfo, options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser) return;
    const prevJson = metaStore.lastSnapshotJson.get('clubInfo');
    if (prevJson === JSON.stringify(next)) return;

    const isAdmin = isCloudAdmin(fbUser);
    const canEditFinSettings = isCloudFinanceEditor(fbUser);
    if (!isAdmin && !canEditFinSettings) return;

    try {
      if (isAdmin) {
        const hqPhotos = Array.isArray(next.headquartersOpenPhotos)
          ? next.headquartersOpenPhotos.slice(0, 20)
          : [];

        let leftCrest = next.leftCrestUrl
          ? await compressDataUrlIfNeeded(next.leftCrestUrl, { maxDimension: 512, maxChars: 110_000 })
          : next.leftCrestUrl;
        let rightCrest = next.rightCrestUrl
          ? await compressDataUrlIfNeeded(next.rightCrestUrl, { maxDimension: 512, maxChars: 110_000 })
          : next.rightCrestUrl;
        let fedLogo = next.federationLogoUrl
          ? await compressDataUrlIfNeeded(next.federationLogoUrl, { maxDimension: 512, maxChars: 120_000 })
          : next.federationLogoUrl;
        let supportersCover = next.supportersCoverUrl
          ? await compressDataUrlIfNeeded(next.supportersCoverUrl, { maxDimension: 800, maxChars: 140_000 })
          : next.supportersCoverUrl;

        const basePerPhotoMax =
          hqPhotos.length > 10 ? 24_000 : hqPhotos.length > 4 ? 42_000 : 85_000;
        const basePerPhotoDim = hqPhotos.length > 10 ? 580 : 760;

        let compressedHqPhotos = Array.isArray(next.headquartersOpenPhotos)
          ? (
              await Promise.all(
                hqPhotos.map((p) =>
                  compressDataUrlIfNeeded(p, { maxDimension: basePerPhotoDim, maxChars: basePerPhotoMax })
                )
              )
            ).filter(Boolean)
          : next.headquartersOpenPhotos;

        const calcTotalImgChars = () =>
          (leftCrest?.length || 0) +
          (rightCrest?.length || 0) +
          (fedLogo?.length || 0) +
          (supportersCover?.length || 0) +
          (Array.isArray(compressedHqPhotos)
            ? compressedHqPhotos.reduce((acc, item) => acc + (item?.length || 0), 0)
            : 0);

        if (calcTotalImgChars() > 700_000) {
          leftCrest = leftCrest
            ? await compressDataUrlIfNeeded(leftCrest, { maxDimension: 360, maxChars: 70_000 })
            : leftCrest;
          rightCrest = rightCrest
            ? await compressDataUrlIfNeeded(rightCrest, { maxDimension: 360, maxChars: 70_000 })
            : rightCrest;
          fedLogo = fedLogo
            ? await compressDataUrlIfNeeded(fedLogo, { maxDimension: 360, maxChars: 80_000 })
            : fedLogo;
          supportersCover = supportersCover
            ? await compressDataUrlIfNeeded(supportersCover, { maxDimension: 600, maxChars: 90_000 })
            : supportersCover;

          if (Array.isArray(compressedHqPhotos) && compressedHqPhotos.length > 0) {
            const fixedChars =
              (leftCrest?.length || 0) +
              (rightCrest?.length || 0) +
              (fedLogo?.length || 0) +
              (supportersCover?.length || 0);
            const hqBudget = Math.max(120_000, 680_000 - fixedChars);
            const perHqMax = Math.max(16_000, Math.floor(hqBudget / compressedHqPhotos.length));
            compressedHqPhotos = (
              await Promise.all(
                compressedHqPhotos.map((p) =>
                  compressDataUrlIfNeeded(p, { maxDimension: 480, maxChars: perHqMax })
                )
              )
            ).filter(Boolean);
          }
        }

        const compressedInfo: ClubInfo = {
          ...next,
          leftCrestUrl: leftCrest,
          rightCrestUrl: rightCrest,
          federationLogoUrl: fedLogo,
          supportersCoverUrl: supportersCover,
          headquartersOpenPhotos: compressedHqPhotos,
        };
        await setDoc(doc(db, 'clubSettings', 'main'), serializeClubSettings(compressedInfo));
      } else {
        const finUpdate: Record<string, unknown> = {
          pixCnpj: clampStr(next.pixCnpj, 100),
          monthlyFeeAmount: Math.min(100000, Math.max(0, Number(next.monthlyFeeAmount) || 0)),
          updatedAt: serverTimestamp(),
        };
        if (Array.isArray(next.financialYears)) {
          finUpdate.financialYears = sanitizeYearList(next.financialYears);
        }
        if (Array.isArray(next.hiddenFinancialYears)) {
          finUpdate.hiddenFinancialYears = sanitizeYearList(next.hiddenFinancialYears);
        }
        if (Array.isArray(next.expenseTabs)) {
          finUpdate.expenseTabs = sanitizeExpenseTabs(next.expenseTabs);
        }
        await updateDoc(doc(db, 'clubSettings', 'main'), finUpdate);
      }
      telemetryMonitor.recordWrite('clubSettings', 1);
      metaStore.lastSnapshotJson.set('clubInfo', JSON.stringify(next));
      void IndexedDbCache.setDataset({
        domain: 'public',
        key: 'clubInfo',
        scope: 'public',
        payload: next,
        ttlMs: CACHE_TTL_30M_MS,
      });
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar dados do motoclube');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.UPDATE, 'clubSettings/main');
    }
  },

  async saveBoardRoles(next: BoardRoleConfig[], options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudAdmin(fbUser)) return;
    const prevRaw = metaStore.lastSnapshotJson.get('boardRoles');
    const prevList: BoardRoleConfig[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((r) => [r.id, r]));
    const nextIds = new Set(next.map((r) => r.id));

    try {
      const batch = writeBatch(db);
      let writeCount = 0;
      next.forEach((role) => {
        const prev = prevMap.get(role.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(role)) {
          batch.set(doc(db, 'boardRoles', safeId(role.id)), serializeBoardRole(role));
          batch.set(doc(db, 'boardRoleContacts', safeId(role.id)), serializeBoardRoleContact(role));
          writeCount += 2;
        }
      });
      prevList.forEach((oldRole) => {
        if (!nextIds.has(oldRole.id)) {
          batch.delete(doc(db, 'boardRoles', safeId(oldRole.id)));
          batch.delete(doc(db, 'boardRoleContacts', safeId(oldRole.id)));
          writeCount += 2;
        }
      });
      if (writeCount > 0) {
        await batch.commit();
        telemetryMonitor.recordWrite('boardRoles', writeCount);
        latestPublicBoardRoles = sortBoardRoles(next);
        metaStore.lastSnapshotJson.set('boardRoles', JSON.stringify(next));
        void IndexedDbCache.setDataset({
          domain: 'public',
          key: 'boardRoles',
          scope: 'public',
          payload: latestPublicBoardRoles,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar Diretoria');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'boardRoles');
    }
  },

  async saveUsers(next: User[], options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser) return;
    const prevRaw = metaStore.lastSnapshotJson.get('users');
    const prevList: User[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((u) => [u.id, u]));
    const nextIds = new Set(next.map((u) => u.id));
    const isAdmin = isCloudAdmin(fbUser);
    const isFinanceEd = isCloudFinanceEditor(fbUser);
    const isPresidente = isCloudPresidente();

    try {
      const batch = writeBatch(db);
      let hasChanges = false;
      const updatedPublicProfiles: MemberPublicProfile[] = [];

      next.forEach((user) => {
        const prev = prevMap.get(user.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(user)) {
          const existingUid =
            metaStore.memberUidByMemberId.get(user.id) ||
            (user.email.toLowerCase().trim() === fbUser.email?.toLowerCase()
              ? fbUser.uid
              : '');

          if (isAdmin) {
            batch.set(doc(db, 'members', safeId(user.id)), serializeMemberPublic(user, existingUid));
            batch.set(doc(db, 'memberPublicProfiles', safeId(user.id)), serializeMemberPublicProfile(user, existingUid));
            batch.set(doc(db, 'membersPrivate', safeId(user.id)), serializeMemberPrivate(user, existingUid));
            if (existingUid) {
              batch.set(doc(db, 'userLinks', safeId(existingUid)), serializeUserLink(existingUid, user));
            }
            updatedPublicProfiles.push({
              id: safeId(user.id),
              uid: existingUid || undefined,
              name: user.name,
              nickname: user.nickname,
              avatarUrl: user.avatarUrl,
              birthDate: user.birthDate,
              joinedDate: user.joinedDate,
              joinedYear: user.joinedYear,
              phone: user.phone,
            });
            hasChanges = true;
          } else if (existingUid && existingUid === fbUser.uid) {
            const safeJoinedYear = Math.min(
              2100,
              Math.max(2000, Math.round(Number(user.joinedYear) || new Date().getFullYear()))
            );
            const pubUpdate: Record<string, unknown> = {
              name: clampStr(user.name, 120),
              nickname: clampStr((user.nickname || '').trim(), 80),
              motorcycle: clampStr(user.motorcycle, 150),
              joinedYear: safeJoinedYear,
              birthDate: clampStr(user.birthDate || '', 20),
              joinedDate: clampStr(user.joinedDate || '', 20),
              updatedAt: serverTimestamp(),
            };
            if (user.avatarUrl) {
              pubUpdate.avatarUrl = sanitizeImageString(user.avatarUrl, 390_000);
            }
            batch.update(doc(db, 'members', safeId(user.id)), pubUpdate);
            batch.set(doc(db, 'memberPublicProfiles', safeId(user.id)), serializeMemberPublicProfile(user, existingUid));

            const privUpdate: Record<string, unknown> = {
              uid: existingUid,
              phone: clampStr(user.phone, 40),
              updatedAt: serverTimestamp(),
            };
            if (user.bloodType) privUpdate.bloodType = clampStr(user.bloodType, 10);
            if (user.emergencyContact !== undefined) {
              privUpdate.emergencyContact = clampStr(user.emergencyContact, 150);
            }
            batch.update(doc(db, 'membersPrivate', safeId(user.id)), privUpdate);
            hasChanges = true;
          } else if (prev) {
            // Financial Director updating manual feeStatus only
            const feeStatusChanged =
              prev.feeStatus !== user.feeStatus ||
              prev.feeStatusUpdatedAt !== user.feeStatusUpdatedAt ||
              JSON.stringify(prev.feeStatusHistory || []) !== JSON.stringify(user.feeStatusHistory || []);
            if (isFinanceEd && feeStatusChanged) {
              batch.update(doc(db, 'members', safeId(user.id)), {
                feeStatus: user.feeStatus === 'ISENTO' ? 'ISENTO' : 'PAGANTE',
                feeStatusUpdatedAt: clampStr(user.feeStatusUpdatedAt || new Date().toISOString(), 40),
                feeStatusUpdatedById: clampStr(user.feeStatusUpdatedById || '', 128),
                feeStatusUpdatedByName: clampStr(user.feeStatusUpdatedByName || 'Diretor Financeiro', 120),
                feeStatusHistory: sanitizeFeeStatusHistory(user.feeStatusHistory),
                updatedAt: serverTimestamp(),
              });
              hasChanges = true;
            }
            // Presidente updating NÔMADE / O.S.S.O. badges only
            const badgeChanged =
              Boolean(prev.nomadeBadge) !== Boolean(user.nomadeBadge) ||
              Boolean(prev.ossoBadge) !== Boolean(user.ossoBadge) ||
              JSON.stringify(prev.badgeHistory || []) !== JSON.stringify(user.badgeHistory || []);
            if (isPresidente && badgeChanged) {
              batch.update(doc(db, 'members', safeId(user.id)), {
                nomadeBadge: Boolean(user.nomadeBadge),
                nomadeGrantedAt: clampStr(user.nomadeGrantedAt || '', 40),
                nomadeGrantedById: clampStr(user.nomadeGrantedById || '', 128),
                nomadeGrantedByName: clampStr(user.nomadeGrantedByName || '', 120),
                ossoBadge: Boolean(user.ossoBadge),
                ossoGrantedAt: clampStr(user.ossoGrantedAt || '', 40),
                ossoGrantedById: clampStr(user.ossoGrantedById || '', 128),
                ossoGrantedByName: clampStr(user.ossoGrantedByName || '', 120),
                badgeHistory: sanitizeBadgeHistory(user.badgeHistory),
                updatedAt: serverTimestamp(),
              });
              hasChanges = true;
            }
          }
        }
      });

      if (isAdmin) {
        prevList.forEach((oldUser) => {
          if (!nextIds.has(oldUser.id)) {
            batch.delete(doc(db, 'members', safeId(oldUser.id)));
            batch.delete(doc(db, 'memberPublicProfiles', safeId(oldUser.id)));
            batch.delete(doc(db, 'membersPrivate', safeId(oldUser.id)));
            const oldUid = metaStore.memberUidByMemberId.get(oldUser.id);
            if (oldUid) batch.delete(doc(db, 'userLinks', safeId(oldUid)));
            hasChanges = true;
          }
        });
      }

      if (hasChanges) {
        await batch.commit();
        telemetryMonitor.recordWrite('members', next.length);
        metaStore.lastSnapshotJson.set('users', JSON.stringify(next));
        void IndexedDbCache.setDataset({
          domain: 'cadastral',
          key: 'users',
          scope: isCloudBoardOrAdmin(fbUser) ? 'board' : 'member',
          ownerUid: fbUser.uid,
          payload: next,
          ttlMs: CACHE_TTL_30M_MS,
        });
        if (updatedPublicProfiles.length > 0) {
          const allPubs: MemberPublicProfile[] = next.map((u) => ({
            id: safeId(u.id),
            name: u.name,
            nickname: u.nickname,
            avatarUrl: u.avatarUrl,
            birthDate: u.birthDate,
            joinedDate: u.joinedDate,
            joinedYear: u.joinedYear,
            phone: u.phone,
          }));
          metaStore.lastSnapshotJson.set('publicProfiles', JSON.stringify(allPubs));
          activeCallbacks?.onPublicProfiles?.(allPubs);
        }
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar perfil/integrantes');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'members');
    }
  },

  async saveEvents(next: RideEvent[], options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser) return;
    const prevRaw = metaStore.lastSnapshotJson.get('events');
    const prevList: RideEvent[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((e) => [e.id, e]));
    const nextIds = new Set(next.map((e) => e.id));
    const isAdmin = isCloudAdmin(fbUser);

    try {
      const batch = writeBatch(db);
      let hasChanges = false;
      next.forEach((ev) => {
        const prev = prevMap.get(ev.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(ev)) {
          if (isAdmin) {
            batch.set(doc(db, 'events', safeId(ev.id)), serializeRideEvent(ev));
          } else {
            batch.update(doc(db, 'events', safeId(ev.id)), {
              attendees: ev.attendees.slice(0, 500),
              updatedAt: serverTimestamp(),
            });
          }
          hasChanges = true;
        }
      });
      if (isAdmin) {
        prevList.forEach((oldEv) => {
          if (!nextIds.has(oldEv.id)) {
            batch.delete(doc(db, 'events', safeId(oldEv.id)));
            hasChanges = true;
          }
        });
      }
      if (hasChanges) {
        await batch.commit();
        telemetryMonitor.recordWrite('events', next.length);
        metaStore.lastSnapshotJson.set('events', JSON.stringify(next));
        void IndexedDbCache.setDataset({
          domain: 'public',
          key: 'events',
          scope: 'public',
          payload: next.filter((e) => !e.isExclusiveBoard),
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar passeio/evento');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'events');
    }
  },

  async saveForumPosts(next: ForumPost[], options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser) return;
    const prevRaw = metaStore.lastSnapshotJson.get('forumPosts');
    const prevList: ForumPost[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((p) => [p.id, p]));
    const nextIds = new Set(next.map((p) => p.id));

    const uid = fbUser.uid;
    const isAdmin = isCloudAdmin(fbUser);

    try {
      const batch = writeBatch(db);
      let hasChanges = false;
      next.forEach((post) => {
        const prev = prevMap.get(post.id);
        if (!prev) {
          batch.set(doc(db, 'forumPosts', safeId(post.id)), serializeForumPost(post, uid, true));
          hasChanges = true;
        } else if (JSON.stringify(prev) !== JSON.stringify(post)) {
          if (isAdmin) {
            const existingAuthor = metaStore.forumAuthorById.get(post.id) || uid;
            const existingCreated = metaStore.forumCreatedAtById.get(post.id);
            batch.set(
              doc(db, 'forumPosts', safeId(post.id)),
              serializeForumPost(post, existingAuthor, false, existingCreated)
            );
          } else {
            batch.update(doc(db, 'forumPosts', safeId(post.id)), {
              likes: post.likes.slice(0, 500),
              comments: post.comments.slice(0, 200),
              updatedAt: serverTimestamp(),
            });
          }
          hasChanges = true;
        }
      });
      if (isAdmin) {
        prevList.forEach((oldPost) => {
          if (!nextIds.has(oldPost.id)) {
            batch.delete(doc(db, 'forumPosts', safeId(oldPost.id)));
            hasChanges = true;
          }
        });
      }
      if (hasChanges) {
        await batch.commit();
        metaStore.lastSnapshotJson.set('forumPosts', JSON.stringify(next));
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar publicação no fórum');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'forumPosts');
    }
  },

  async saveSOSAlerts(next: SOSAlert[], options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser) return;
    const prevRaw = metaStore.lastSnapshotJson.get('sosAlerts');
    const prevList: SOSAlert[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((a) => [a.id, a]));
    const nextIds = new Set(next.map((a) => a.id));

    const uid = fbUser.uid;
    const isAdmin = isCloudAdmin(fbUser);

    try {
      const batch = writeBatch(db);
      let hasChanges = false;
      next.forEach((alert) => {
        const prev = prevMap.get(alert.id);
        if (!prev) {
          batch.set(doc(db, 'sosAlerts', safeId(alert.id)), serializeSOSAlert(alert, uid, true));
          hasChanges = true;
        } else if (JSON.stringify(prev) !== JSON.stringify(alert)) {
          if (isAdmin) {
            const existingAuthor = metaStore.sosAuthorById.get(alert.id) || uid;
            const existingCreated = metaStore.sosCreatedAtById.get(alert.id);
            batch.set(
              doc(db, 'sosAlerts', safeId(alert.id)),
              serializeSOSAlert(alert, existingAuthor, false, existingCreated)
            );
          } else {
            batch.update(doc(db, 'sosAlerts', safeId(alert.id)), {
              responders: alert.responders.slice(0, 100),
              status: alert.status,
              updatedAt: serverTimestamp(),
            });
          }
          hasChanges = true;
        }
      });
      if (isAdmin) {
        prevList.forEach((oldAlert) => {
          if (!nextIds.has(oldAlert.id)) {
            batch.delete(doc(db, 'sosAlerts', safeId(oldAlert.id)));
            hasChanges = true;
          }
        });
      }
      if (hasChanges) {
        await batch.commit();
        metaStore.lastSnapshotJson.set('sosAlerts', JSON.stringify(next));
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar alerta SOS');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'sosAlerts');
    }
  },

  async saveFees(next: MemberMonthlyFee[], options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser) return;
    const prevRaw = metaStore.lastSnapshotJson.get('fees');
    const prevList: MemberMonthlyFee[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((f) => [f.id, f]));
    const nextIds = new Set(next.map((f) => f.id));
    const canEdit = isCloudFinanceEditor(fbUser);

    try {
      const batch = writeBatch(db);
      let writeOps = 0;
      next.forEach((fee) => {
        const prev = prevMap.get(fee.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(fee)) {
          if (canEdit) {
            const memberUid =
              metaStore.memberUidByMemberId.get(fee.memberId) ||
              (currentResolvedUser?.id === fee.memberId ? fbUser.uid : '');
            const memberEmail =
              metaStore.memberEmailByMemberId.get(fee.memberId) ||
              (currentResolvedUser?.id === fee.memberId ? (fbUser.email || '').toLowerCase() : '');
            batch.set(doc(db, 'fees', safeId(fee.id)), serializeFee(fee, memberUid, memberEmail));
            writeOps += 1;
          } else if (prev) {
            batch.update(doc(db, 'fees', safeId(fee.id)), {
              receiptUrl: sanitizeImageString(fee.receiptUrl, 390_000),
              receiptUploadedAt: clampStr(fee.receiptUploadedAt || new Date().toISOString(), 40),
              receiptFileName: clampStr(fee.receiptFileName || 'comprovante', 120),
              updatedAt: serverTimestamp(),
            });
            writeOps += 1;
          }
        }
      });
      if (canEdit) {
        prevList.forEach((oldFee) => {
          if (!nextIds.has(oldFee.id)) {
            batch.delete(doc(db, 'fees', safeId(oldFee.id)));
            writeOps += 1;
          }
        });
      }
      if (writeOps > 0) {
        await batch.commit();
        telemetryMonitor.recordWrite('fees', writeOps);
        metaStore.lastSnapshotJson.set('fees', JSON.stringify(next));
        void IndexedDbCache.setDataset({
          domain: 'finance',
          key: 'fees',
          scope: isCloudBoardOrAdmin(fbUser) ? 'board' : 'member',
          ownerUid: fbUser.uid,
          payload: next,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar mensalidades');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'fees');
    }
  },

  async saveFeeSchedules(
    next: FeeRateScheduleEntry[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudFinanceEditor(fbUser)) {
      if (options?.throwOnError) {
        throw new Error('Acesso restrito ao Administrador Geral ou Diretor Financeiro.');
      }
      return;
    }
    const prevRaw = metaStore.lastSnapshotJson.get('feeSchedules');
    const prevList: FeeRateScheduleEntry[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((e) => [e.id, e]));

    try {
      const batch = writeBatch(db);
      let writeOps = 0;
      // Histórico auditável imutável: não apaga documentos existentes, cancelamento muda status
      next.forEach((entry) => {
        const prev = prevMap.get(entry.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(entry)) {
          batch.set(
            doc(db, 'feeSchedules', safeId(entry.id)),
            serializeFeeSchedule({ ...entry, createdByUid: entry.createdByUid || fbUser.uid })
          );
          writeOps += 1;
        }
      });
      if (writeOps > 0) {
        await batch.commit();
        telemetryMonitor.recordWrite('feeSchedules', writeOps);
        metaStore.lastSnapshotJson.set('feeSchedules', JSON.stringify(next));
        await IndexedDbCache.setDataset({
          domain: 'finance',
          key: 'feeSchedules',
          scope: 'board',
          ownerUid: fbUser.uid,
          payload: next,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar alteração programada da mensalidade');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'feeSchedules');
    }
  },

  async saveManualReceipts(
    next: ManualFinancialEntry[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudFinanceEditor(fbUser)) {
      if (options?.throwOnError) {
        throw new Error('Acesso restrito ao Administrador Geral ou Diretor Financeiro.');
      }
      return;
    }
    const prevRaw = metaStore.lastSnapshotJson.get('manualReceipts');
    const prevList: ManualFinancialEntry[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((e) => [e.id, e]));

    try {
      const batch = writeBatch(db);
      let writeOps = 0;
      // Razão contábil auditável: nunca remove lançamentos (estorno altera status)
      next.forEach((entry) => {
        const prev = prevMap.get(entry.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(entry)) {
          const memberUid = entry.memberId
            ? metaStore.memberUidByMemberId.get(entry.memberId) || entry.memberUid
            : undefined;
          const memberEmail = entry.memberId
            ? metaStore.memberEmailByMemberId.get(entry.memberId) || entry.memberEmail
            : undefined;
          batch.set(
            doc(db, 'manualReceipts', safeId(entry.id)),
            serializeManualReceipt(
              { ...entry, createdByUid: entry.createdByUid || fbUser.uid },
              memberUid,
              memberEmail
            )
          );
          writeOps += 1;
        }
      });
      if (writeOps > 0) {
        await batch.commit();
        telemetryMonitor.recordWrite('manualReceipts', writeOps);
        metaStore.lastSnapshotJson.set('manualReceipts', JSON.stringify(next));
        await IndexedDbCache.setDataset({
          domain: 'finance',
          key: 'manualReceipts',
          scope: 'board',
          ownerUid: fbUser.uid,
          payload: next,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar lançamento financeiro manual');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'manualReceipts');
    }
  },

  async saveMemberTitles(
    next: MemberHonoraryTitle[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudAdmin(fbUser)) {
      if (options?.throwOnError) {
        throw new Error('Apenas o Administrador Geral pode conceder ou revogar títulos honoríficos.');
      }
      return;
    }
    const prevRaw = metaStore.lastSnapshotJson.get('memberTitles');
    const prevList: MemberHonoraryTitle[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((e) => [e.id, e]));

    try {
      const batch = writeBatch(db);
      let writeOps = 0;
      next.forEach((title) => {
        const prev = prevMap.get(title.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(title)) {
          batch.set(
            doc(db, 'memberTitles', safeId(title.id)),
            serializeMemberTitle({ ...title, grantedByUid: title.grantedByUid || fbUser.uid })
          );
          writeOps += 1;
        }
      });
      if (writeOps > 0) {
        await batch.commit();
        telemetryMonitor.recordWrite('memberTitles', writeOps);
        metaStore.lastSnapshotJson.set('memberTitles', JSON.stringify(next));
        await IndexedDbCache.setDataset({
          domain: 'cadastral',
          key: 'memberTitles',
          scope: 'board',
          ownerUid: fbUser.uid,
          payload: next,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar título honorífico');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'memberTitles');
    }
  },

  async saveWalkInClients(
    next: WalkInClient[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudFinanceEditor(fbUser)) {
      if (options?.throwOnError) {
        throw new Error('Acesso restrito ao Administrador Geral ou Diretor Financeiro.');
      }
      return;
    }
    const prevRaw = metaStore.lastSnapshotJson.get('walkInClients');
    const prevList: WalkInClient[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((c) => [c.id, c]));
    const nextIds = new Set(next.map((c) => c.id));

    try {
      const batch = writeBatch(db);
      let writeOps = 0;
      next.forEach((client) => {
        const prev = prevMap.get(client.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(client)) {
          batch.set(
            doc(db, 'walkInClients', safeId(client.id)),
            serializeWalkInClient({ ...client, createdByUid: client.createdByUid || fbUser.uid })
          );
          writeOps += 1;
        }
      });
      prevList.forEach((oldClient) => {
        if (!nextIds.has(oldClient.id)) {
          batch.delete(doc(db, 'walkInClients', safeId(oldClient.id)));
          writeOps += 1;
        }
      });
      if (writeOps > 0) {
        await batch.commit();
        telemetryMonitor.recordWrite('walkInClients', writeOps);
        metaStore.lastSnapshotJson.set('walkInClients', JSON.stringify(next));
        await IndexedDbCache.setDataset({
          domain: 'finance',
          key: 'walkInClients',
          scope: 'board',
          ownerUid: fbUser.uid,
          payload: next,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar clientes avulsos');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'walkInClients');
    }
  },

  async saveWalkInTabs(
    next: WalkInTabRecord[],
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudFinanceEditor(fbUser)) {
      if (options?.throwOnError) {
        throw new Error('Acesso restrito ao Administrador Geral ou Diretor Financeiro.');
      }
      return;
    }
    const prevRaw = metaStore.lastSnapshotJson.get('walkInTabs');
    const prevList: WalkInTabRecord[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((t) => [t.id, t]));
    const nextIds = new Set(next.map((t) => t.id));

    try {
      const batch = writeBatch(db);
      let writeOps = 0;
      next.forEach((tab) => {
        const prev = prevMap.get(tab.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(tab)) {
          batch.set(
            doc(db, 'walkInTabs', safeId(tab.id)),
            serializeWalkInTab({ ...tab, createdByUid: tab.createdByUid || fbUser.uid })
          );
          writeOps += 1;
        }
      });
      prevList.forEach((oldTab) => {
        if (!nextIds.has(oldTab.id)) {
          batch.delete(doc(db, 'walkInTabs', safeId(oldTab.id)));
          writeOps += 1;
        }
      });
      if (writeOps > 0) {
        await batch.commit();
        telemetryMonitor.recordWrite('walkInTabs', writeOps);
        metaStore.lastSnapshotJson.set('walkInTabs', JSON.stringify(next));
        await IndexedDbCache.setDataset({
          domain: 'finance',
          key: 'walkInTabs',
          scope: 'board',
          ownerUid: fbUser.uid,
          payload: next,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar fiados de clientes avulsos');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'walkInTabs');
    }
  },

  async saveExpenses(next: ClubExpense[], options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudFinanceEditor(fbUser)) return;
    const prevRaw = metaStore.lastSnapshotJson.get('expenses');
    const prevList: ClubExpense[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((e) => [e.id, e]));
    const nextIds = new Set(next.map((e) => e.id));

    try {
      const batch = writeBatch(db);
      let writeOps = 0;
      next.forEach((exp) => {
        const prev = prevMap.get(exp.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(exp)) {
          batch.set(doc(db, 'expenses', safeId(exp.id)), serializeExpense(exp));
          writeOps += 1;
        }
      });
      prevList.forEach((oldExp) => {
        if (!nextIds.has(oldExp.id)) {
          batch.delete(doc(db, 'expenses', safeId(oldExp.id)));
          writeOps += 1;
        }
      });
      if (writeOps > 0) {
        await batch.commit();
        telemetryMonitor.recordWrite('expenses', writeOps);
        metaStore.lastSnapshotJson.set('expenses', JSON.stringify(next));
        void IndexedDbCache.setDataset({
          domain: 'finance',
          key: 'expenses',
          scope: 'board',
          ownerUid: fbUser.uid,
          payload: next,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar despesas');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'expenses');
    }
  },

  async saveTabs(next: MemberTabDebt[], options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser) return;
    const prevRaw = metaStore.lastSnapshotJson.get('tabs');
    const prevList: MemberTabDebt[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((t) => [t.id, t]));
    const nextIds = new Set(next.map((t) => t.id));
    const canEdit = isCloudFinanceEditor(fbUser);

    try {
      const batch = writeBatch(db);
      let writeOps = 0;
      next.forEach((tab) => {
        const prev = prevMap.get(tab.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(tab)) {
          if (canEdit) {
            const memberUid =
              metaStore.memberUidByMemberId.get(tab.memberId) ||
              (currentResolvedUser?.id === tab.memberId ? fbUser.uid : '');
            const memberEmail =
              metaStore.memberEmailByMemberId.get(tab.memberId) ||
              (currentResolvedUser?.id === tab.memberId ? (fbUser.email || '').toLowerCase() : '');
            batch.set(doc(db, 'tabs', safeId(tab.id)), serializeTabDebt(tab, memberUid, memberEmail));
            writeOps += 1;
          } else if (prev) {
            batch.update(doc(db, 'tabs', safeId(tab.id)), {
              receiptUrl: sanitizeImageString(tab.receiptUrl, 390_000),
              receiptUploadedAt: clampStr(tab.receiptUploadedAt || new Date().toISOString(), 40),
              receiptFileName: clampStr(tab.receiptFileName || 'comprovante', 120),
              updatedAt: serverTimestamp(),
            });
            writeOps += 1;
          }
        }
      });
      if (canEdit) {
        prevList.forEach((oldTab) => {
          if (!nextIds.has(oldTab.id)) {
            batch.delete(doc(db, 'tabs', safeId(oldTab.id)));
            writeOps += 1;
          }
        });
      }
      if (writeOps > 0) {
        await batch.commit();
        telemetryMonitor.recordWrite('tabs', writeOps);
        metaStore.lastSnapshotJson.set('tabs', JSON.stringify(next));
        void IndexedDbCache.setDataset({
          domain: 'finance',
          key: 'tabs',
          scope: isCloudBoardOrAdmin(fbUser) ? 'board' : 'member',
          ownerUid: fbUser.uid,
          payload: next,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar fiados na sede');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'tabs');
    }
  },

  async saveBoardChat(next: BoardChatMessage[], options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser) return;
    const prevRaw = metaStore.lastSnapshotJson.get('boardChat');
    const prevList: BoardChatMessage[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((m) => [m.id, m]));
    const nextIds = new Set(next.map((m) => m.id));

    const uid = fbUser.uid;
    const isAdmin = isCloudAdmin(fbUser);

    try {
      const batch = writeBatch(db);
      let hasChanges = false;
      next.forEach((msg) => {
        const prev = prevMap.get(msg.id);
        if (!prev) {
          batch.set(doc(db, 'boardChat', safeId(msg.id)), serializeBoardChat(msg, uid));
          hasChanges = true;
        }
      });
      if (isAdmin) {
        prevList.forEach((oldMsg) => {
          if (!nextIds.has(oldMsg.id)) {
            batch.delete(doc(db, 'boardChat', safeId(oldMsg.id)));
            hasChanges = true;
          }
        });
      }
      if (hasChanges) {
        await batch.commit();
        metaStore.lastSnapshotJson.set('boardChat', JSON.stringify(next));
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao enviar mensagem da diretoria');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'boardChat');
    }
  },

  async saveSupporters(next: Supporter[], options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudAdmin(fbUser)) return;
    const prevRaw = metaStore.lastSnapshotJson.get('supporters');
    const prevList: Supporter[] = prevRaw ? JSON.parse(prevRaw) : [];
    const prevMap = new Map(prevList.map((s) => [s.id, s]));
    const nextIds = new Set(next.map((s) => s.id));

    try {
      const batch = writeBatch(db);
      let hasChanges = false;
      next.forEach((supporter, idx) => {
        const prev = prevMap.get(supporter.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(supporter)) {
          batch.set(doc(db, 'supporters', safeId(supporter.id)), serializeSupporter(supporter, idx));
          hasChanges = true;
        }
      });
      prevList.forEach((oldSup) => {
        if (!nextIds.has(oldSup.id)) {
          batch.delete(doc(db, 'supporters', safeId(oldSup.id)));
          hasChanges = true;
        }
      });
      if (hasChanges) {
        await batch.commit();
        telemetryMonitor.recordWrite('supporters', next.length);
        metaStore.lastSnapshotJson.set('supporters', JSON.stringify(next));
        void IndexedDbCache.setDataset({
          domain: 'public',
          key: 'supporters',
          scope: 'public',
          payload: next,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar apoiadores');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, 'supporters');
    }
  },

  async uploadClubDocument(
    item: ClubDocument,
    onProgress?: (percent: number) => void
  ): Promise<ClubDocument> {
    const fbUser = ensureCloudAuth();
    if (!fbUser) {
      throw new Error('Conecte sua Conta Google para enviar documentos.');
    }
    const uid = fbUser.uid;
    const docId = safeId(item.id);
    const fullDataUrl = item.fileDataUrl || '';

    const needsChunking = fullDataUrl.length > DOC_CHUNK_SIZE;
    const chunks: string[] = [];
    if (needsChunking) {
      for (let i = 0; i < fullDataUrl.length; i += DOC_CHUNK_SIZE) {
        chunks.push(fullDataUrl.slice(i, i + DOC_CHUNK_SIZE));
      }
      if (chunks.length > MAX_DOC_CHUNKS) {
        throw new Error('Arquivo excede o limite máximo suportado na nuvem (até 25 MB).');
      }
    }
    if (fullDataUrl) {
      metaStore.assembledDocCache.set(docId, fullDataUrl);
    }

    const storedDoc: ClubDocument = {
      ...item,
      id: docId,
      authorUid: uid,
      fileDataUrl: needsChunking ? '' : fullDataUrl,
      chunkCount: chunks.length,
    };

    try {
      onProgress?.(chunks.length > 0 ? 5 : 50);
      await setDoc(
        doc(db, 'clubDocuments', docId),
        serializeClubDocument(storedDoc, uid, storedDoc.fileDataUrl, chunks.length, true)
      );

      if (chunks.length > 0) {
        const CHUNKS_PER_BATCH = 8; // <= 4.4MB per WriteBatch (well within Firestore 10MB limit)
        for (let start = 0; start < chunks.length; start += CHUNKS_PER_BATCH) {
          const batch = writeBatch(db);
          const slice = chunks.slice(start, start + CHUNKS_PER_BATCH);
          slice.forEach((chunkStr, offset) => {
            const idx = start + offset;
            const chunkId = `chunk_${idx}`;
            batch.set(doc(db, 'clubDocuments', docId, 'chunks', chunkId), {
              id: chunkId,
              docId,
              authorUid: uid,
              index: idx,
              content: chunkStr,
              clubOnly: true,
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
          const doneCount = Math.min(chunks.length, start + slice.length);
          onProgress?.(Math.min(99, Math.round((doneCount / chunks.length) * 95) + 5));
        }
      }
      if (fullDataUrl) {
        await IndexedDbCache.cacheDocumentBinary({
          kind: 'clubDocument',
          id: docId,
          title: item.title || item.fileName,
          mimeType: item.mimeType || (item.fileType === 'image' ? 'image/jpeg' : 'application/pdf'),
          version: item.date || new Date().toISOString().split('T')[0],
          dataUrl: fullDataUrl,
          updatedByName: item.uploadedByName,
        });
      }
      telemetryMonitor.recordWrite('clubDocuments', 1 + chunks.length);
      onProgress?.(100);
      metaStore.documentAuthorById.set(docId, uid);
      return storedDoc;
    } catch (err) {
      notifySyncError(err, 'Erro ao enviar documento');
      handleFirestoreError(err, OperationType.CREATE, `clubDocuments/${docId}`);
    }
  },

  async updateClubDocument(
    item: ClubDocument,
    options?: { replaceFile?: boolean; onProgress?: (percent: number) => void }
  ): Promise<ClubDocument | void> {
    const fbUser = ensureCloudAuth();
    if (!fbUser) return;
    const docId = safeId(item.id);
    const uid = fbUser.uid;
    const isAdmin = isCloudAdmin(fbUser);
    const customFields = sanitizeDocumentCustomFields(item.customFields);

    try {
      if (isAdmin && options?.replaceFile) {
        const existingChunksSnap = await getDocs(
          query(collection(db, 'clubDocuments', docId, 'chunks'), where('clubOnly', '==', true))
        );
        if (!existingChunksSnap.empty) {
          const chunkDocs = existingChunksSnap.docs;
          for (let i = 0; i < chunkDocs.length; i += 200) {
            const delBatch = writeBatch(db);
            chunkDocs.slice(i, i + 200).forEach((d) => delBatch.delete(d.ref));
            await delBatch.commit();
          }
        }

        const fullDataUrl = item.fileDataUrl || '';
        const needsChunking = fullDataUrl.length > DOC_CHUNK_SIZE;
        const chunks: string[] = [];
        if (needsChunking) {
          for (let i = 0; i < fullDataUrl.length; i += DOC_CHUNK_SIZE) {
            chunks.push(fullDataUrl.slice(i, i + DOC_CHUNK_SIZE));
          }
          if (chunks.length > MAX_DOC_CHUNKS) {
            throw new Error('Arquivo excede o limite máximo suportado na nuvem (até 25 MB).');
          }
          metaStore.assembledDocCache.set(docId, fullDataUrl);
        } else {
          metaStore.assembledDocCache.delete(docId);
        }

        const existingCreated = metaStore.documentCreatedAtById.get(docId);
        const storedDoc: ClubDocument = {
          ...item,
          id: docId,
          authorUid: uid,
          fileDataUrl: needsChunking ? '' : fullDataUrl,
          chunkCount: chunks.length,
          customFields,
        };

        options.onProgress?.(chunks.length > 0 ? 5 : 50);
        await setDoc(
          doc(db, 'clubDocuments', docId),
          serializeClubDocument(storedDoc, uid, storedDoc.fileDataUrl, chunks.length, false, existingCreated)
        );

        if (chunks.length > 0) {
          const CHUNKS_PER_BATCH = 8;
          for (let start = 0; start < chunks.length; start += CHUNKS_PER_BATCH) {
            const batch = writeBatch(db);
            const slice = chunks.slice(start, start + CHUNKS_PER_BATCH);
            slice.forEach((chunkStr, offset) => {
              const idx = start + offset;
              const chunkId = `chunk_${idx}`;
              batch.set(doc(db, 'clubDocuments', docId, 'chunks', chunkId), {
                id: chunkId,
                docId,
                authorUid: uid,
                index: idx,
                content: chunkStr,
                clubOnly: true,
                updatedAt: serverTimestamp(),
              });
            });
            await batch.commit();
            const doneCount = Math.min(chunks.length, start + slice.length);
            options.onProgress?.(Math.min(99, Math.round((doneCount / chunks.length) * 95) + 5));
          }
        }
        if (fullDataUrl) {
          await IndexedDbCache.cacheDocumentBinary({
            kind: 'clubDocument',
            id: docId,
            title: storedDoc.title || storedDoc.fileName,
            mimeType: storedDoc.mimeType || (storedDoc.fileType === 'image' ? 'image/jpeg' : 'application/pdf'),
            version: storedDoc.date || new Date().toISOString(),
            dataUrl: fullDataUrl,
            updatedByName: storedDoc.uploadedByName,
          });
        }
        telemetryMonitor.recordWrite('clubDocuments', 1 + chunks.length);
        options.onProgress?.(100);
        metaStore.documentAuthorById.set(docId, uid);
        return storedDoc;
      }

      const updatePayload: Record<string, unknown> = {
        title: clampStr(item.title || item.fileName || 'Documento', 200),
        description: clampStr((item.description || '').trim(), 2000),
        category: clampStr(safeId(item.category || 'outros'), 64) || 'outros',
        date: clampStr(item.date || new Date().toISOString().split('T')[0], 20),
        customFields,
        updatedAt: serverTimestamp(),
      };
      if (isAdmin) {
        updatePayload.fileName = clampStr(item.fileName || 'documento', 180);
        updatePayload.uploadedByName = clampStr(item.uploadedByName || 'Diretoria', 120);
      }

      await updateDoc(doc(db, 'clubDocuments', docId), updatePayload);
      telemetryMonitor.recordWrite('clubDocuments', 1);
    } catch (err) {
      notifySyncError(err, 'Erro ao atualizar documento');
      handleFirestoreError(err, OperationType.UPDATE, `clubDocuments/${docId}`);
    }
  },

  async deleteClubDocument(item: ClubDocument): Promise<void> {
    const fbUser = ensureCloudAuth();
    if (!fbUser) return;
    const docId = safeId(item.id);

    try {
      const chunksSnap = await getDocs(
        query(collection(db, 'clubDocuments', docId, 'chunks'), where('clubOnly', '==', true))
      );
      const refsToDelete = chunksSnap.docs.map((d) => d.ref);
      for (let i = 0; i < refsToDelete.length; i += 200) {
        const batch = writeBatch(db);
        refsToDelete.slice(i, i + 200).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
      const finalBatch = writeBatch(db);
      finalBatch.delete(doc(db, 'clubDocuments', docId));
      await finalBatch.commit();
      telemetryMonitor.recordWrite('clubDocuments', 1 + refsToDelete.length);
      metaStore.assembledDocCache.delete(docId);
    } catch (err) {
      notifySyncError(err, 'Erro ao excluir documento');
      handleFirestoreError(err, OperationType.DELETE, `clubDocuments/${docId}`);
    }
  },

  async loadClubDocumentDataUrl(item: ClubDocument): Promise<string> {
    const fallbackMime =
      item.mimeType || (item.fileType === 'image' ? 'image/jpeg' : 'application/pdf');
    const docId = safeId(item.id);

    if (item.fileDataUrl && item.fileDataUrl.trim()) {
      const normalized = normalizeDocumentDataUrl(item.fileDataUrl, fallbackMime);
      void IndexedDbCache.cacheDocumentBinary({
        kind: 'clubDocument',
        id: docId,
        title: item.title || item.fileName,
        mimeType: fallbackMime,
        version: item.date || item.createdAt || 'v1',
        dataUrl: normalized,
        updatedByName: item.uploadedByName,
      });
      return normalized;
    }

    const cached = metaStore.assembledDocCache.get(docId);
    if (cached) {
      telemetryMonitor.recordDocumentCacheHit(docId);
      telemetryMonitor.recordCacheHit('memory', 'clubDocuments(chunks)', Math.max(1, item.chunkCount || 1), item.title);
      return normalizeDocumentDataUrl(cached, fallbackMime);
    }

    // Verifica cache permanente em IndexedDB antes de baixar qualquer chunk da nuvem
    const idbDoc = await IndexedDbCache.getCachedDocument('clubDocument', docId);
    if (idbDoc?.dataUrl) {
      const normalizedIdb = normalizeDocumentDataUrl(idbDoc.dataUrl, fallbackMime);
      metaStore.assembledDocCache.set(docId, normalizedIdb);
      telemetryMonitor.recordDocumentCacheHit(docId);
      telemetryMonitor.recordCacheHit('indexeddb', 'clubDocuments(chunks)', Math.max(1, item.chunkCount || 1), item.title);
      return normalizedIdb;
    }

    return requestDedupe.run(`doc:${docId}`, async () => {
      try {
        await auth.authStateReady();
      } catch {
        // Ignore authStateReady errors and inspect auth.currentUser directly
      }
      const fbUser = auth.currentUser;
      if (!fbUser) {
        throw new Error(
          'Entre com sua conta da Diretoria para abrir os documentos armazenados na nuvem.'
        );
      }
      try {
        await fbUser.getIdToken();
      } catch {
        // Continue and let Firestore report if token is invalid
      }

      try {
        let expectedChunkCount = typeof item.chunkCount === 'number' ? item.chunkCount : 0;
        let resolvedMime = fallbackMime;
        let parentSnap = null;
        try {
          parentSnap = await getDoc(doc(db, 'clubDocuments', docId));
          trackSnapshotTelemetry('clubDocuments(parent)', parentSnap, 'document_open');
        } catch (parentErr) {
          parentSnap = null;
          if (isQuotaError(parentErr)) {
            quotaBreaker.trip(parentErr);
            throw parentErr;
          }
          const msg = parentErr instanceof Error ? parentErr.message : String(parentErr);
          if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
            throw parentErr;
          }
        }

        if (parentSnap && parentSnap.exists()) {
          const pd = parentSnap.data();
          if (typeof pd.mimeType === 'string' && pd.mimeType.trim()) {
            resolvedMime = pd.mimeType.trim();
          }
          if (typeof pd.chunkCount === 'number' && pd.chunkCount > expectedChunkCount) {
            expectedChunkCount = pd.chunkCount;
          }
          if (typeof pd.fileDataUrl === 'string' && pd.fileDataUrl.trim()) {
            const normalized = normalizeDocumentDataUrl(pd.fileDataUrl, resolvedMime);
            metaStore.assembledDocCache.set(docId, normalized);
            await IndexedDbCache.cacheDocumentBinary({
              kind: 'clubDocument',
              id: docId,
              title: item.title || item.fileName,
              mimeType: resolvedMime,
              version: item.date || item.createdAt || 'v1',
              dataUrl: normalized,
              updatedByName: item.uploadedByName,
            });
            telemetryMonitor.recordDocumentDownload(docId, normalized.length);
            return normalized;
          }
        }

        const chunksMap = new Map<number, string>();
        const chunksQuery = query(
          collection(db, 'clubDocuments', docId, 'chunks'),
          where('clubOnly', '==', true),
          limit(MAX_DOC_CHUNKS + 5)
        );

        let listError: unknown = null;
        try {
          const snap = await getDocs(chunksQuery);
          trackSnapshotTelemetry('clubDocuments(chunks)', snap, 'document_open');
          snap.docs.forEach((d) => {
            const data = d.data() as { index?: unknown; content?: unknown };
            const idx = typeof data.index === 'number' ? data.index : Number(d.id.replace(/\D+/g, '') || 0);
            if (typeof data.content === 'string' && data.content.length > 0) {
              chunksMap.set(idx, data.content);
            }
          });
        } catch (err) {
          listError = err;
        }

        if (expectedChunkCount > 0 && chunksMap.size < expectedChunkCount) {
          const missingIndices: number[] = [];
          for (let i = 0; i < expectedChunkCount; i++) {
            if (!chunksMap.has(i)) missingIndices.push(i);
          }
          const CONCURRENCY = 6;
          for (let start = 0; start < missingIndices.length; start += CONCURRENCY) {
            const batchIndices = missingIndices.slice(start, start + CONCURRENCY);
            await Promise.all(
              batchIndices.map(async (idx) => {
                const ref = doc(db, 'clubDocuments', docId, 'chunks', `chunk_${idx}`);
                const chunkSnap = await getDoc(ref);
                trackSnapshotTelemetry('clubDocuments(chunk)', chunkSnap, 'document_open');
                if (chunkSnap && chunkSnap.exists()) {
                  const data = chunkSnap.data() as { index?: unknown; content?: unknown };
                  if (typeof data.content === 'string' && data.content.length > 0) {
                    chunksMap.set(idx, data.content);
                  }
                }
              })
            );
          }
        }

        if (chunksMap.size === 0 && listError) {
          throw listError;
        }

        if (expectedChunkCount > 0 && chunksMap.size < expectedChunkCount) {
          throw new Error(
            `Arquivo incompleto na nuvem (${chunksMap.size} de ${expectedChunkCount} partes encontradas). Tente reenviar o documento.`
          );
        }

        const orderedIndices = Array.from(chunksMap.keys()).sort((a, b) => a - b);
        const joinedRaw = orderedIndices.map((idx) => chunksMap.get(idx) || '').join('');
        const joined = normalizeDocumentDataUrl(joinedRaw, resolvedMime);
        if (joined) {
          metaStore.assembledDocCache.set(docId, joined);
          await IndexedDbCache.cacheDocumentBinary({
            kind: 'clubDocument',
            id: docId,
            title: item.title || item.fileName,
            mimeType: resolvedMime,
            version: item.date || item.createdAt || 'v1',
            dataUrl: joined,
            updatedByName: item.uploadedByName,
          });
          telemetryMonitor.recordDocumentDownload(docId, joined.length);
        }
        return joined;
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        const lower = rawMsg.toLowerCase();
        notifySyncError(err, 'Erro ao abrir documento da nuvem');
        if (isQuotaError(err)) {
          throw new Error(
            'Limite diário gratuito do Cloud Firestore atingido no momento. Tente abrir este documento mais tarde.'
          );
        }
        if (rawMsg.includes('permission-denied') || rawMsg.includes('Missing or insufficient permissions')) {
          throw new Error(
            'Permissão negada na nuvem. Verifique se você está conectado com uma conta ativa da Diretoria.'
          );
        }
        if (lower.includes('unavailable') || lower.includes('offline') || lower.includes('network')) {
          throw new Error(
            'Não foi possível baixar o documento da nuvem no momento. Verifique sua conexão com a internet e tente novamente.'
          );
        }
        if (err instanceof Error && !rawMsg.trim().startsWith('{')) {
          throw err;
        }
        throw new Error('Não foi possível abrir o documento da nuvem. Tente novamente.');
      }
    });
  },

  async saveGovernanceDoc(docItem: ClubGovernanceDoc, options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudBoardOrAdmin(fbUser)) {
      if (options?.throwOnError) throw new Error('Permissão restrita à Diretoria.');
      return;
    }
    const docId = safeId(docItem.id);
    try {
      await setDoc(doc(db, 'clubGovernance', docId), serializeClubGovernance(docItem));
      telemetryMonitor.recordWrite('clubGovernance', 1);
      await IndexedDbCache.cacheDocumentBinary({
        kind: 'governance',
        id: docId,
        title: docItem.title,
        mimeType: 'application/json',
        version: docItem.versionLabel || docItem.updatedAt || new Date().toISOString(),
        payload: docItem,
        updatedByName: docItem.updatedByName,
      });
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar Estatuto / RDI');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, `clubGovernance/${docId}`);
    }
  },

  async saveFinancialNote(
    note: MemberFinancialNote,
    options?: { throwOnError?: boolean }
  ): Promise<MemberFinancialNote> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudFinanceEditor(fbUser)) {
      const msg = 'Apenas o Administrador Geral ou Diretor Financeiro pode registrar observações financeiras.';
      if (options?.throwOnError) throw new Error(msg);
      throw new Error(msg);
    }
    const docId = safeId(note.memberId);
    const payload = serializeFinancialNote(note, fbUser.uid);
    try {
      await setDoc(doc(db, 'memberFinancialNotes', docId), payload);
      telemetryMonitor.recordWrite('memberFinancialNotes', 1);
      const prevRaw = metaStore.lastSnapshotJson.get('financialNotes');
      const prevList: MemberFinancialNote[] = prevRaw ? JSON.parse(prevRaw) : [];
      const savedNote: MemberFinancialNote = {
        ...note,
        id: docId,
        memberId: docId,
        updatedByUid: note.updatedByUid || fbUser.uid,
      };
      const nextList = prevList.some((n) => n.memberId === docId)
        ? prevList.map((n) => (n.memberId === docId ? savedNote : n))
        : [savedNote, ...prevList];
      metaStore.lastSnapshotJson.set('financialNotes', JSON.stringify(nextList));
      await IndexedDbCache.setDataset({
        domain: 'finance',
        key: 'financialNotes',
        scope: 'board',
        ownerUid: fbUser.uid,
        payload: nextList,
        ttlMs: CACHE_TTL_30M_MS,
      });
      return savedNote;
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar observação financeira');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      handleFirestoreError(err, OperationType.WRITE, `memberFinancialNotes/${docId}`);
    }
  },

  async saveFinanceBatchConfirmed(changes: {
    fees?: MemberMonthlyFee[];
    tabs?: MemberTabDebt[];
    expenses?: ClubExpense[];
  }): Promise<void> {
    const fbUser = ensureCloudAuth(true);
    if (!fbUser || !isCloudFinanceEditor(fbUser)) {
      throw new Error('Acesso restrito ao Administrador Geral ou Diretor Financeiro.');
    }

    const batch = writeBatch(db);
    let writeOps = 0;

    if (changes.fees) {
      const prevFees: MemberMonthlyFee[] = JSON.parse(metaStore.lastSnapshotJson.get('fees') || '[]');
      const prevFeeMap = new Map(prevFees.map((f) => [f.id, f]));
      const nextFeeIds = new Set(changes.fees.map((f) => f.id));
      changes.fees.forEach((fee) => {
        const prev = prevFeeMap.get(fee.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(fee)) {
          const memberUid = metaStore.memberUidByMemberId.get(fee.memberId) || '';
          const memberEmail = metaStore.memberEmailByMemberId.get(fee.memberId) || '';
          batch.set(doc(db, 'fees', safeId(fee.id)), serializeFee(fee, memberUid, memberEmail));
          writeOps += 1;
        }
      });
      prevFees.forEach((oldFee) => {
        if (!nextFeeIds.has(oldFee.id)) {
          batch.delete(doc(db, 'fees', safeId(oldFee.id)));
          writeOps += 1;
        }
      });
    }

    if (changes.tabs) {
      const prevTabs: MemberTabDebt[] = JSON.parse(metaStore.lastSnapshotJson.get('tabs') || '[]');
      const prevTabMap = new Map(prevTabs.map((t) => [t.id, t]));
      const nextTabIds = new Set(changes.tabs.map((t) => t.id));
      changes.tabs.forEach((tab) => {
        const prev = prevTabMap.get(tab.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(tab)) {
          const memberUid = metaStore.memberUidByMemberId.get(tab.memberId) || '';
          const memberEmail = metaStore.memberEmailByMemberId.get(tab.memberId) || '';
          batch.set(doc(db, 'tabs', safeId(tab.id)), serializeTabDebt(tab, memberUid, memberEmail));
          writeOps += 1;
        }
      });
      prevTabs.forEach((oldTab) => {
        if (!nextTabIds.has(oldTab.id)) {
          batch.delete(doc(db, 'tabs', safeId(oldTab.id)));
          writeOps += 1;
        }
      });
    }

    if (changes.expenses) {
      const prevExp: ClubExpense[] = JSON.parse(metaStore.lastSnapshotJson.get('expenses') || '[]');
      const prevExpMap = new Map(prevExp.map((e) => [e.id, e]));
      const nextExpIds = new Set(changes.expenses.map((e) => e.id));
      changes.expenses.forEach((exp) => {
        const prev = prevExpMap.get(exp.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(exp)) {
          batch.set(doc(db, 'expenses', safeId(exp.id)), serializeExpense(exp));
          writeOps += 1;
        }
      });
      prevExp.forEach((oldExp) => {
        if (!nextExpIds.has(oldExp.id)) {
          batch.delete(doc(db, 'expenses', safeId(oldExp.id)));
          writeOps += 1;
        }
      });
    }

    if (writeOps === 0) return;

    try {
      await batch.commit();
      telemetryMonitor.recordWrite('financeBatch', writeOps);
      if (changes.fees) {
        metaStore.lastSnapshotJson.set('fees', JSON.stringify(changes.fees));
        await IndexedDbCache.setDataset({
          domain: 'finance',
          key: 'fees',
          scope: 'board',
          ownerUid: fbUser.uid,
          payload: changes.fees,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
      if (changes.tabs) {
        metaStore.lastSnapshotJson.set('tabs', JSON.stringify(changes.tabs));
        await IndexedDbCache.setDataset({
          domain: 'finance',
          key: 'tabs',
          scope: 'board',
          ownerUid: fbUser.uid,
          payload: changes.tabs,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
      if (changes.expenses) {
        metaStore.lastSnapshotJson.set('expenses', JSON.stringify(changes.expenses));
        await IndexedDbCache.setDataset({
          domain: 'finance',
          key: 'expenses',
          scope: 'board',
          ownerUid: fbUser.uid,
          payload: changes.expenses,
          ttlMs: CACHE_TTL_30M_MS,
        });
      }
    } catch (err) {
      notifySyncError(err, 'Erro ao salvar lote financeiro na nuvem');
      if (isQuotaError(err)) throw new QuotaWriteBlockedError();
      handleFirestoreError(err, OperationType.WRITE, 'financeBatch');
    }
  },

  async saveAnnouncement(item: ClubAnnouncement, options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudBoardOrAdmin(fbUser)) {
      if (options?.throwOnError) throw new Error('Permissão restrita à Diretoria.');
      return;
    }
    const docId = safeId(item.id);
    let existingCreatedAt = metaStore.announcementCreatedAtById.get(docId);
    if (!existingCreatedAt) {
      try {
        const existingSnap = await getDoc(doc(db, 'clubAnnouncements', docId));
        if (existingSnap.exists() && existingSnap.data()?.createdAt) {
          existingCreatedAt = existingSnap.data().createdAt;
          metaStore.announcementCreatedAtById.set(docId, existingCreatedAt);
        }
      } catch {
        // Ignore lookup errors before write validation
      }
    }
    const payload: Record<string, unknown> = {
      id: docId,
      title: clampStr(item.title, 200),
      message: clampStr(item.message, 4000),
      kind: item.kind === 'urgent' || item.kind === 'event' || item.kind === 'meeting' ? item.kind : 'info',
      pinned: Boolean(item.pinned),
      isPublic: Boolean(item.isPublic),
      authorId: clampStr(item.authorId, 128),
      authorName: clampStr(item.authorName, 120),
      authorUid: fbUser.uid,
      clubOnly: true,
      createdAt: existingCreatedAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'clubAnnouncements', docId), payload);
      telemetryMonitor.recordWrite('clubAnnouncements', 1);
      const prevRaw = metaStore.lastSnapshotJson.get('clubAnnouncements');
      const prevList: ClubAnnouncement[] = prevRaw ? JSON.parse(prevRaw) : [];
      const nextList = prevList.some((a) => a.id === docId)
        ? prevList.map((a) => (a.id === docId ? item : a))
        : [item, ...prevList];
      metaStore.lastSnapshotJson.set('clubAnnouncements', JSON.stringify(nextList));
      void IndexedDbCache.setDataset({
        domain: 'cadastral',
        key: 'announcements',
        scope: isCloudBoardOrAdmin(fbUser) ? 'board' : 'member',
        ownerUid: fbUser.uid,
        payload: nextList,
        ttlMs: CACHE_TTL_30M_MS,
      });
    } catch (err) {
      notifySyncError(err, 'Erro ao publicar comunicado');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      if (options?.throwOnError) {
        handleFirestoreError(err, OperationType.WRITE, `clubAnnouncements/${docId}`);
      }
    }
  },

  async deleteAnnouncement(id: string, options?: { throwOnError?: boolean }): Promise<void> {
    const fbUser = ensureCloudAuth(options?.throwOnError);
    if (!fbUser || !isCloudAdmin(fbUser)) {
      if (options?.throwOnError) throw new Error('Permissão restrita ao Administrador Geral.');
      return;
    }
    const docId = safeId(id);
    try {
      await deleteDoc(doc(db, 'clubAnnouncements', docId));
      telemetryMonitor.recordWrite('clubAnnouncements', 1);
      metaStore.announcementCreatedAtById.delete(docId);
      const prevRaw = metaStore.lastSnapshotJson.get('clubAnnouncements');
      const prevList: ClubAnnouncement[] = prevRaw ? JSON.parse(prevRaw) : [];
      const nextList = prevList.filter((a) => a.id !== docId && a.id !== id);
      metaStore.lastSnapshotJson.set('clubAnnouncements', JSON.stringify(nextList));
      void IndexedDbCache.setDataset({
        domain: 'cadastral',
        key: 'announcements',
        scope: 'board',
        ownerUid: fbUser.uid,
        payload: nextList,
        ttlMs: CACHE_TTL_30M_MS,
      });
    } catch (err) {
      notifySyncError(err, 'Erro ao remover comunicado');
      if (isQuotaError(err) && options?.throwOnError) {
        throw new QuotaWriteBlockedError();
      }
      if (options?.throwOnError) {
        handleFirestoreError(err, OperationType.DELETE, `clubAnnouncements/${id}`);
      }
    }
  },

  async logAdminAudit(entry: AdminAuditEntry): Promise<void> {
    const fbUser = ensureCloudAuth();
    if (!fbUser || !isCloudBoardOrAdmin(fbUser)) return;
    const docId = safeId(entry.id);
    const payload: Record<string, unknown> = {
      id: docId,
      action: clampStr(entry.action, 120),
      targetType: entry.targetType,
      actorId: clampStr(entry.actorId, 128),
      actorName: clampStr(entry.actorName, 120),
      actorUid: fbUser.uid,
      boardOnly: true,
      timestamp: serverTimestamp(),
    };
    if (entry.targetId) payload.targetId = clampStr(entry.targetId, 128);
    if (entry.targetLabel) payload.targetLabel = clampStr(entry.targetLabel, 200);
    if (entry.details) payload.details = clampStr(entry.details, 1000);
    try {
      await setDoc(doc(db, 'auditLogs', docId), payload);
    } catch (err) {
      console.warn('Auditoria salva apenas localmente:', err);
    }
  },

  async saveDeletedBackup(backup: DeletedRecordBackup): Promise<void> {
    const fbUser = ensureCloudAuth();
    if (!fbUser || !isCloudAdmin(fbUser)) return;
    const docId = safeId(backup.id);
    const payload = {
      id: docId,
      entityType: backup.entityType,
      recordId: clampStr(backup.recordId, 128),
      label: clampStr(backup.label, 200),
      payloadJson: clampStr(backup.payloadJson, 240_000),
      deletedById: clampStr(backup.deletedById, 128),
      deletedByName: clampStr(backup.deletedByName, 120),
      deletedByUid: fbUser.uid,
      adminOnly: true,
      deletedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'deletedBackups', docId), payload);
    } catch (err) {
      console.warn('Backup de exclusão mantido apenas localmente:', err);
    }
  },

  async deleteBackupRecord(id: string): Promise<void> {
    const fbUser = ensureCloudAuth();
    if (!fbUser || !isCloudAdmin(fbUser)) return;
    try {
      await deleteDoc(doc(db, 'deletedBackups', safeId(id)));
    } catch (err) {
      notifySyncError(err, 'Erro ao limpar item da lixeira');
    }
  },
};

