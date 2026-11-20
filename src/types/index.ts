export type UserRole = 'visitor' | 'member' | 'board' | 'admin';

export interface BoardRoleConfig {
  id: string;
  title: string;
  holderId?: string;
  holderName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  motorcycle: string;
  isCustom?: boolean;
  order?: number;
}

export type MemberCategory =
  | 'Motociclista'
  | 'Garupa'
  | 'Support XV'
  | 'Benemérito'
  | 'Honorário';

export const MEMBER_CATEGORIES: MemberCategory[] = [
  'Motociclista',
  'Garupa',
  'Support XV',
  'Benemérito',
  'Honorário',
];

export type MemberFeeStatus = 'PAGANTE' | 'ISENTO';

export type MemberBadge = 'NÔMADE' | 'O.S.S.O.';

export interface MemberFeeStatusAuditEntry {
  id: string;
  previousStatus: MemberFeeStatus;
  nextStatus: MemberFeeStatus;
  changedAt: string;
  changedById: string;
  changedByName: string;
  changedByUid?: string;
  reason?: string;
}

export interface MemberBadgeAuditEntry {
  id: string;
  badge: MemberBadge;
  action: 'granted' | 'revoked';
  at: string;
  byId: string;
  byName: string;
  byUid?: string;
  reason?: string;
}

export interface User {
  id: string;
  name: string;
  nickname?: string;
  email: string;
  phone: string;
  role: UserRole;
  status: 'active' | 'pending' | 'suspended';
  sosApproved: boolean;
  motorcycle: string;
  bloodType?: string;
  emergencyContact?: string;
  joinedYear: number;
  joinedDate?: string; // YYYY-MM-DD - Data de ingresso no Motoclube
  birthDate?: string; // YYYY-MM-DD - Data de aniversário
  boardRoleId?: string; // If part of board
  customRoleTitle?: string; // Título de cargo personalizado/editado pelo administrador
  avatarUrl?: string;
  canEditFinances?: boolean; // Permitted by admin to edit finances
  isMinor?: boolean; // Integrante menor de idade
  responsibleMemberId?: string; // ID do integrante adulto responsável
  responsibleMemberName?: string; // Nome de exibição do responsável
  memberCategory?: MemberCategory; // Categoria do integrante
  feeStatus?: MemberFeeStatus; // Situação manual da mensalidade ('PAGANTE' | 'ISENTO')
  feeStatusUpdatedAt?: string;
  feeStatusUpdatedById?: string;
  feeStatusUpdatedByName?: string;
  feeStatusHistory?: MemberFeeStatusAuditEntry[];
  nomadeBadge?: boolean;
  nomadeGrantedAt?: string;
  nomadeGrantedById?: string;
  nomadeGrantedByName?: string;
  ossoBadge?: boolean;
  ossoGrantedAt?: string;
  ossoGrantedById?: string;
  ossoGrantedByName?: string;
  badgeHistory?: MemberBadgeAuditEntry[];
}

/** Projeção pública restrita exclusivamente aos 5 campos autorizados para integrantes autenticados */
export interface MemberPublicProfile {
  id: string;
  uid?: string;
  name: string;
  nickname?: string;
  avatarUrl?: string;
  birthDate?: string;
  joinedDate?: string;
  joinedYear?: number;
  phone?: string;
  updatedAt?: string;
}

export function getMemberDisplayName(
  user?: { name?: string; nickname?: string } | null
): string {
  if (!user) return '';
  return user.nickname?.trim() || user.name || '';
}

const CANONICAL_BOARD_ROLE_TITLES: Record<string, string> = {
  'role-pres': 'Presidente',
  'role-vpres': 'Vice-Presidente',
  'role-general': 'Diretor Geral',
  'role-finance': 'Diretor Financeiro',
  'role-disc-1': 'Diretor de Disciplina 1',
  'role-disc-2': 'Diretor de Disciplina 2',
  'role-disc-3': 'Diretor de Disciplina 3',
};

export function getMemberRoleLabel(
  user?: Partial<User> | null,
  boardRoles: BoardRoleConfig[] = []
): string {
  if (!user) return '';
  if (user.customRoleTitle?.trim()) return user.customRoleTitle.trim();

  if (user.boardRoleId) {
    const byId = boardRoles.find((r) => r.id === user.boardRoleId);
    if (byId?.title?.trim()) return byId.title.trim();
    if (CANONICAL_BOARD_ROLE_TITLES[user.boardRoleId]) {
      return CANONICAL_BOARD_ROLE_TITLES[user.boardRoleId];
    }
  }

  if (user.id && boardRoles.length > 0) {
    const byHolderId = boardRoles.find((r) => r.holderId && r.holderId === user.id);
    if (byHolderId?.title?.trim()) return byHolderId.title.trim();
  }

  const normalizedEmail = user.email?.toLowerCase().trim();
  if (normalizedEmail && boardRoles.length > 0) {
    const byEmail = boardRoles.find(
      (r) => r.email && r.email.toLowerCase().trim() === normalizedEmail
    );
    if (byEmail?.title?.trim()) return byEmail.title.trim();
  }

  if (user.canEditFinances) return 'Diretor Financeiro';
  if (user.role === 'board') return 'Mesa Diretora';
  if (user.role === 'admin') return 'Administrador Geral';
  return 'Integrante Pleno';
}

export const VACANT_BOARD_HOLDER_LABEL = 'Cargo vago';

export function normalizeBoardTextKey(value?: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function isVacantBoardHolder(holderName?: string | null): boolean {
  const key = normalizeBoardTextKey(holderName);
  return (
    !key ||
    key === 'cargo vago' ||
    key === 'vago' ||
    key === 'titular' ||
    key === 'sem titular' ||
    key === 'disponivel' ||
    key === 'em aberto'
  );
}

export function normalizeBoardRolesOrder(roles: BoardRoleConfig[]): BoardRoleConfig[] {
  return roles
    .map((role, index) => ({ role, index }))
    .sort((a, b) => {
      const oa = typeof a.role.order === 'number' ? a.role.order : a.index;
      const ob = typeof b.role.order === 'number' ? b.role.order : b.index;
      return oa - ob || a.index - b.index;
    })
    .map((entry) => entry.role);
}

export function vacateBoardRole(role: BoardRoleConfig): BoardRoleConfig {
  return {
    ...role,
    holderName: VACANT_BOARD_HOLDER_LABEL,
    email: '',
    phone: '',
    avatarUrl: '',
    motorcycle: '',
  };
}

export interface ResolvedBoardCard {
  role: BoardRoleConfig;
  linkedMember?: User;
  displayName: string;
  avatarUrl: string;
  motorcycle: string;
  email: string;
  phone: string;
  isVacant: boolean;
}

export function resolveBoardComposition(
  boardRoles: BoardRoleConfig[],
  users: User[],
  options: { isAuthenticatedActiveMember: boolean }
): ResolvedBoardCard[] {
  const ordered = normalizeBoardRolesOrder(boardRoles);
  const activeMembers = options.isAuthenticatedActiveMember
    ? users.filter((u) => u.status === 'active')
    : [];

  const claimedMemberIds = new Set<string>();
  const claimedHolderKeys = new Set<string>();
  const linkedByRoleId = new Map<string, User>();

  if (activeMembers.length > 0) {
    ordered.forEach((role) => {
      const match = activeMembers.find(
        (u) => u.boardRoleId === role.id && !claimedMemberIds.has(u.id)
      );
      if (match) {
        linkedByRoleId.set(role.id, match);
        claimedMemberIds.add(match.id);
        const dispKey = normalizeBoardTextKey(getMemberDisplayName(match));
        const fullKey = normalizeBoardTextKey(match.name);
        const nickKey = normalizeBoardTextKey(match.nickname);
        if (dispKey) claimedHolderKeys.add(dispKey);
        if (fullKey) claimedHolderKeys.add(fullKey);
        if (nickKey) claimedHolderKeys.add(nickKey);
      }
    });
  }

  return ordered.map((role) => {
    const linkedMember = linkedByRoleId.get(role.id);
    if (linkedMember) {
      return {
        role,
        linkedMember,
        displayName: getMemberDisplayName(linkedMember),
        avatarUrl: linkedMember.avatarUrl || '',
        motorcycle: linkedMember.motorcycle || '',
        email: linkedMember.email || role.email || '',
        phone: linkedMember.phone || role.phone || '',
        isVacant: false,
      };
    }

    const rawHolder = (role.holderName || '').trim();
    const holderKey = normalizeBoardTextKey(rawHolder);
    const isDuplicateHolder = Boolean(holderKey && claimedHolderKeys.has(holderKey));

    if (isVacantBoardHolder(rawHolder) || isDuplicateHolder) {
      return {
        role,
        linkedMember: undefined,
        displayName: VACANT_BOARD_HOLDER_LABEL,
        avatarUrl: '',
        motorcycle: '',
        email: '',
        phone: '',
        isVacant: true,
      };
    }

    claimedHolderKeys.add(holderKey);
    return {
      role,
      linkedMember: undefined,
      displayName: rawHolder,
      avatarUrl: role.avatarUrl || '',
      motorcycle: role.motorcycle || '',
      email: role.email || '',
      phone: role.phone || '',
      isVacant: false,
    };
  });
}

export function reconcileBoardRolesWithUsers(
  boardRoles: BoardRoleConfig[],
  users: User[],
  options?: { vacatedRoleIds?: string[] }
): BoardRoleConfig[] {
  const ordered = normalizeBoardRolesOrder(boardRoles);
  const vacatedSet = new Set((options?.vacatedRoleIds || []).filter(Boolean));
  const activeMembers = users.filter((u) => u.status === 'active');

  const activeByRoleId = new Map<string, User>();
  const assignedMemberIds = new Set<string>();
  ordered.forEach((role) => {
    const match = activeMembers.find(
      (u) => u.boardRoleId === role.id && !assignedMemberIds.has(u.id)
    );
    if (match) {
      activeByRoleId.set(role.id, match);
      assignedMemberIds.add(match.id);
    }
  });

  const assignedIdentityKeys = new Set<string>();
  activeByRoleId.forEach((member) => {
    const dispKey = normalizeBoardTextKey(getMemberDisplayName(member));
    const fullKey = normalizeBoardTextKey(member.name);
    const nickKey = normalizeBoardTextKey(member.nickname);
    const mailKey = normalizeBoardTextKey(member.email);
    if (dispKey) assignedIdentityKeys.add(dispKey);
    if (fullKey) assignedIdentityKeys.add(fullKey);
    if (nickKey) assignedIdentityKeys.add(nickKey);
    if (mailKey) assignedIdentityKeys.add(mailKey);
  });

  const nonBoardEmails = new Set<string>();
  users.forEach((u) => {
    if (u.status !== 'active' || !u.boardRoleId) {
      const mailKey = normalizeBoardTextKey(u.email);
      if (mailKey) nonBoardEmails.add(mailKey);
    }
  });

  const seenManualKeys = new Set<string>();

  return ordered.map((role) => {
    const activeHolder = activeByRoleId.get(role.id);
    if (activeHolder) {
      const displayName = getMemberDisplayName(activeHolder);
      const dispKey = normalizeBoardTextKey(displayName);
      if (dispKey) seenManualKeys.add(dispKey);
      return {
        ...role,
        holderName: displayName,
        avatarUrl: activeHolder.avatarUrl || '',
        motorcycle: activeHolder.motorcycle || '',
        email: activeHolder.email || '',
        phone: activeHolder.phone || '',
      };
    }

    if (vacatedSet.has(role.id) || isVacantBoardHolder(role.holderName)) {
      return vacateBoardRole(role);
    }

    const holderKey = normalizeBoardTextKey(role.holderName);
    const roleEmailKey = normalizeBoardTextKey(role.email);
    if (
      (holderKey && (assignedIdentityKeys.has(holderKey) || seenManualKeys.has(holderKey))) ||
      (roleEmailKey && (assignedIdentityKeys.has(roleEmailKey) || nonBoardEmails.has(roleEmailKey)))
    ) {
      return vacateBoardRole(role);
    }

    if (holderKey) seenManualKeys.add(holderKey);
    return role;
  });
}

export interface RideEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  endDate?: string; // YYYY-MM-DD - Data final opcional para eventos multidias
  time: string;
  meetingPoint: string;
  destination: string;
  distanceKm: number;
  averageSpeed: string;
  roadCaptain: string;
  isExclusiveBoard?: boolean;
  isPinned?: boolean;
  attendees: string[]; // Member IDs
  imageUrl?: string;
}

export const LEGACY_DEFAULT_CREST_URL = '/assets/aistudio/FB_IMG_1785305229667_25f1d8eb.jpg';
export const DEFAULT_CREST_URL = '/assets/aistudio/IMG-20261114-WA0003_1__5c71d413.jpg';
export const DEFAULT_FEDERATION_LOGO_URL = '/assets/aistudio/images__2__843b5c2e.jpeg';

export interface ExpenseTabConfig {
  id: string;
  label: string;
}

export const DEFAULT_EXPENSE_TABS: ExpenseTabConfig[] = [
  { id: 'aluguel', label: 'Aluguel' },
  { id: 'energia', label: 'Energia' },
  { id: 'agua', label: 'Água' },
  { id: 'manutencao', label: 'Manutenção' },
  { id: 'insumos', label: 'Insumos / Bar' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'outros', label: 'Outros' },
];

export interface DocumentCategoryConfig {
  id: string;
  label: string;
}

export const DEFAULT_DOCUMENT_CATEGORIES: DocumentCategoryConfig[] = [
  { id: 'ata', label: 'Atas de Reunião' },
  { id: 'estatuto_regimento', label: 'Estatuto & Regimento' },
  { id: 'financeiro_fiscal', label: 'Financeiro & Fiscal' },
  { id: 'eventos_viagens', label: 'Eventos & Viagens' },
  { id: 'carteirinhas_cnh', label: 'Documentos & CNH' },
  { id: 'outros', label: 'Outros Arquivos' },
];

export interface DocumentCustomField {
  key: string;
  value: string;
}

export interface Supporter {
  id: string;
  name: string;
  type: 'individual' | 'company';
  description: string;
  photoUrl: string;
  city?: string;
  contact?: string;
  website?: string;
  order?: number;
}

export interface ForumComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
}

export interface ForumPost {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  title: string;
  content: string;
  category: 'trip_report' | 'route_tips' | 'mechanics' | 'general';
  images?: string[];
  likes: string[]; // User IDs
  comments: ForumComment[];
  createdAt: string;
}

export type SOSType = 'mechanical' | 'tire' | 'accident' | 'fuel' | 'medical' | 'support';

export interface SOSAlert {
  id: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  memberMotorcycle: string;
  bloodType?: string;
  type: SOSType;
  description: string;
  latitude?: number;
  longitude?: number;
  locationAddress: string;
  createdAt: string;
  status: 'active' | 'in_progress' | 'resolved';
  responders: {
    memberId: string;
    memberName: string;
    etaMinutes?: number;
  }[];
}

export type FeeSettlementStatus =
  | 'open'
  | 'paid'
  | 'partial'
  | 'forgiven'
  | 'cancelled'
  | 'written_off'
  | 'exempt';

export interface FinanceHistoryEntry {
  id: string;
  action: string;
  status: string;
  at: string;
  byId: string;
  byName: string;
  byUid?: string;
  reason?: string;
  amount?: number;
}

export interface MemberFinancialObservationEntry {
  id: string;
  note: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
  updatedByUid?: string;
}

export interface MemberFinancialNote {
  id: string;
  memberId: string;
  memberName?: string;
  note: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
  updatedByUid?: string;
  history?: MemberFinancialObservationEntry[];
}

export interface MemberMonthlyFee {
  id: string;
  memberId: string;
  memberName?: string;
  month: string; // e.g. "2026-11"
  monthName: string; // e.g. "Novembro 2026"
  amount: number;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue';
  paidAt?: string;
  pixTxId?: string;
  notes?: string;
  receiptUrl?: string;
  receiptUploadedAt?: string;
  receiptFileName?: string;
  partialPaidAmount?: number;
  settlementStatus?: FeeSettlementStatus;
  writeOffReason?: string;
  writeOffAt?: string;
  writeOffById?: string;
  writeOffByName?: string;
  exerciseYear?: number;
  history?: FinanceHistoryEntry[];
}

export interface FeeRateScheduleEntry {
  id: string;
  previousAmount: number;
  newAmount: number;
  effectiveCompetency: string; // YYYY-MM
  effectiveDate?: string;
  reason?: string;
  justification?: string;
  status: 'scheduled' | 'active' | 'applied' | 'cancelled';
  createdById: string;
  createdByName: string;
  createdByUid?: string;
  responsibleId?: string;
  responsibleName?: string;
  responsibleUid?: string;
  createdAt: string;
  cancelledAt?: string;
  cancelledById?: string;
  cancelledByName?: string;
}

export type ManualPaymentMethod = 'pix' | 'cash' | 'transfer' | 'card' | 'other';
export type ManualEntryOriginType = 'fee' | 'tab' | 'donation' | 'event' | 'other';

export interface ManualFinancialEntry {
  id: string;
  idempotencyKey?: string;
  memberId?: string;
  memberUid?: string;
  memberEmail?: string;
  memberName?: string;
  identificationStatus: 'identified' | 'unidentified';
  originType: ManualEntryOriginType;
  competency?: string;
  competencyMonth?: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  receivedAt?: string;
  paymentMethod: ManualPaymentMethod;
  description: string;
  notes?: string;
  receiptUrl?: string;
  receiptFileName?: string;
  receiptUploadedAt?: string;
  linkedFeeId?: string;
  linkedFeeMonth?: string;
  linkedCompetency?: string;
  linkedAt?: string;
  linkedById?: string;
  linkedByName?: string;
  status: 'active' | 'confirmed' | 'reversed';
  reversalReason?: string;
  reversedAt?: string;
  reversedById?: string;
  reversedByName?: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  createdByUid?: string;
}

export type HonoraryTitleType = 'INTEGRANTE HONORÁRIO' | 'INTEGRANTE BENEMÉRITO';

export interface MemberHonoraryTitle {
  id: string;
  memberId: string;
  memberName: string;
  titleType: HonoraryTitleType;
  title?: HonoraryTitleType;
  customLabel?: string;
  grantedAt: string;
  grantedById: string;
  grantedByName: string;
  grantedByUid?: string;
  justification?: string;
  reason?: string;
  responsibleId?: string;
  responsibleName?: string;
  responsibleUid?: string;
  notes?: string;
  status: 'active' | 'revoked';
  revokedAt?: string;
  revokedById?: string;
  revokedByName?: string;
  revokeReason?: string;
}

export interface WalkInClient {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  createdById: string;
  createdByName: string;
  createdByUid?: string;
}

export interface WalkInTabItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  unitAmount?: number;
  totalAmount?: number;
  date?: string;
  addedAt?: string;
  addedById?: string;
  addedByName?: string;
  notes?: string;
}

export interface WalkInTabPayment {
  id: string;
  amount: number;
  paymentDate: string;
  paidAt?: string;
  method: ManualPaymentMethod;
  notes?: string;
  recordedById: string;
  recordedByName: string;
}

export interface WalkInTabRecord {
  id: string;
  clientId: string;
  clientName: string;
  status: 'open' | 'partial' | 'paid' | 'cancelled';
  items: WalkInTabItem[];
  payments: WalkInTabPayment[];
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  openedAt: string;
  closedAt?: string;
  notes?: string;
  createdById: string;
  createdByName: string;
  createdByUid?: string;
  updatedAt?: string;
}

export interface ClubExpense {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  status: 'paid' | 'pending';
  paidBy?: string;
  notes?: string;
}

export interface MemberTabDebt {
  id: string;
  memberId: string;
  memberName: string;
  itemDescription: string;
  category: 'bar' | 'churrasco' | 'loja_patch' | 'outros';
  amount: number;
  date: string;
  status: 'pending' | 'paid';
  paidAt?: string;
  notes?: string;
  receiptUrl?: string;
  receiptUploadedAt?: string;
  receiptFileName?: string;
  partialPaidAmount?: number;
  settlementStatus?: FeeSettlementStatus;
  writeOffReason?: string;
  writeOffAt?: string;
  writeOffById?: string;
  writeOffByName?: string;
  exerciseYear?: number;
  history?: FinanceHistoryEntry[];
}

export interface BoardChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderAvatar?: string;
  message: string;
  timestamp: string;
}

export interface ClubInfo {
  name: string;
  foundationYear: number;
  city: string;
  address: string;
  googleMapsUrl: string;
  contactEmail: string;
  contactPhone: string;
  instagram: string;
  facebook: string;
  youtube: string;
  historyText: string;
  rulesText: string;
  pixCnpj: string;
  monthlyFeeAmount: number;
  financialDirectorAuthorized?: boolean;
  financialYears?: number[];
  hiddenFinancialYears?: number[];
  leftCrestUrl?: string;
  rightCrestUrl?: string;
  isHeadquartersOpen?: boolean;
  headquartersOpenText?: string;
  headquartersOpenPhotos?: string[];
  accessRequestMessage?: string;
  supportersButtonTitle?: string;
  supportersButtonSubtitle?: string;
  supportersButtonDescription?: string;
  supportersButtonCta?: string;
  supportersHistoryText?: string;
  supportersCoverUrl?: string;
  eventsButtonLabel?: string;
  expenseTabs?: ExpenseTabConfig[];
  documentCategories?: DocumentCategoryConfig[];
  documentCustomFieldLabels?: string[];
  appUpdateId?: string;
  appUpdateVersion?: string;
  appUpdateMessage?: string;
  appUpdatePublishedAt?: string;
  federationBadgeLabel?: string;
  federationTitle?: string;
  federationDescription?: string;
  federationLogoUrl?: string;
  federationWebsite?: string;
  federationWebsiteLabel?: string;
  federationRegistrationCode?: string;
  federationHidden?: boolean;
}

export type ClubDocumentCategory = string;

export interface ClubDocument {
  id: string;
  title: string;
  description?: string;
  category: ClubDocumentCategory;
  fileType: 'pdf' | 'image';
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  fileDataUrl: string;
  chunkCount?: number;
  customFields?: DocumentCustomField[];
  uploadedById: string;
  uploadedByName: string;
  authorUid?: string;
  date: string; // YYYY-MM-DD
  createdAt?: string;
}

export interface GovernanceSectionItem {
  id: string;
  heading: string;
  content: string;
}

export interface ClubGovernanceDoc {
  id: 'estatuto' | 'rdi';
  kind: 'estatuto' | 'rdi';
  title: string;
  versionLabel: string;
  preamble: string;
  sections: GovernanceSectionItem[];
  updatedAt: string;
  updatedById?: string;
  updatedByName?: string;
}

export type AnnouncementKind = 'info' | 'event' | 'meeting' | 'urgent';

export interface ClubAnnouncement {
  id: string;
  title: string;
  message: string;
  kind: AnnouncementKind;
  pinned?: boolean;
  isPublic?: boolean;
  authorId: string;
  authorName: string;
  authorUid?: string;
  createdAt: string;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  targetType: 'member' | 'event' | 'forum' | 'document' | 'finance' | 'settings' | 'announcement' | 'backup';
  targetId?: string;
  targetLabel?: string;
  actorId: string;
  actorName: string;
  actorUid?: string;
  details?: string;
  timestamp: string;
}

export type BackupEntityType = 'member' | 'event' | 'forum' | 'document' | 'expense' | 'fee' | 'tab' | 'supporter' | 'announcement';

export interface DeletedRecordBackup {
  id: string;
  entityType: BackupEntityType;
  recordId: string;
  label: string;
  payloadJson: string;
  deletedById: string;
  deletedByName: string;
  deletedByUid?: string;
  deletedAt: string;
}

export interface QuotaSyncStatus {
  blocked: boolean;
  blockedUntilMs: number;
  reason?: string;
}



