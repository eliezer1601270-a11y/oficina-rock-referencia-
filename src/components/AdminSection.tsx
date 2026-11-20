import { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  UserCheck, 
  UserX, 
  ShieldCheck, 
  ShieldAlert, 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  Award, 
  Check, 
  X, 
  Mail, 
  Phone, 
  Key, 
  Plus,
  Lock,
  UserPlus,
  Upload,
  Camera,
  Cake,
  Calendar,
  DollarSign,
  ArrowLeft,
  AlertCircle,
  MessageSquareText,
  Save,
  Link2,
  Loader2,
  RefreshCw,
  Megaphone,
  RotateCcw,
  FileJson,
  Download,
  History,
  Pin,
  Send,
  Cloud,
  CloudOff,
  Database,
  Activity,
  HardDrive,
  CheckCircle2,
  FileDiff,
  Gauge,
} from 'lucide-react';
import {
  User,
  UserRole,
  MemberCategory,
  MEMBER_CATEGORIES,
  MemberBadge,
  MemberBadgeAuditEntry,
  MemberPublicProfile,
  MemberFinancialNote,
  BoardRoleConfig,
  MemberMonthlyFee,
  MemberTabDebt,
  ClubExpense,
  ClubInfo,
  ClubAnnouncement,
  AnnouncementKind,
  AdminAuditEntry,
  DeletedRecordBackup,
  QuotaSyncStatus,
  getMemberDisplayName,
  getMemberRoleLabel,
  reconcileBoardRolesWithUsers,
} from '../types';
import { StorageService, playSound } from '../services/storage';
import { compressImageFile } from '../services/imageUtils';
import { FirestoreSync } from '../services/firestoreSync';
import { ADMIN_EMAIL, formatAuthError, isActiveAdminUser, sendPasswordResetClean } from '../services/firebase';
import {
  hasExplicitManualPagante,
  isMemberCurrentlyMinor,
  resolveMemberFeeStatusInfo,
} from '../services/financeSchedule';
import { BackupService, BackupRestorePreview } from '../services/backupService';
import {
  IndexedDbCache,
  IndexedDbCacheStats,
  StoredBackupSnapshotRecord,
} from '../services/indexedDbCache';
import { telemetryMonitor, TelemetrySnapshot } from '../services/telemetryMonitor';
import MemberYearlyFinancePanel from './MemberYearlyFinancePanel';
import { PhotoSourcePicker } from './PhotoSourcePicker';

interface AdminSectionProps {
  users: User[];
  publicProfiles?: MemberPublicProfile[];
  boardRoles: BoardRoleConfig[];
  fees: MemberMonthlyFee[];
  tabs: MemberTabDebt[];
  expenses?: ClubExpense[];
  financialNotes?: MemberFinancialNote[];
  clubInfo: ClubInfo;
  currentUser: User | null;
  announcements?: ClubAnnouncement[];
  auditLogs?: AdminAuditEntry[];
  deletedBackups?: DeletedRecordBackup[];
  onUpdateUsers: (users: User[]) => void;
  onUpdateBoardRoles?: (roles: BoardRoleConfig[]) => void;
  onUpdateFees: (fees: MemberMonthlyFee[]) => void;
  onUpdateTabs: (tabs: MemberTabDebt[]) => void;
  onUpdateExpenses?: (items: ClubExpense[]) => void;
  onUpdateFinancialNotes?: (notes: MemberFinancialNote[]) => void;
  onUpdateClubInfo?: (info: ClubInfo) => void;
  onUpdateAnnouncements?: (items: ClubAnnouncement[]) => void;
  onUpdateAuditLogs?: (logs: AdminAuditEntry[]) => void;
  onUpdateDeletedBackups?: (items: DeletedRecordBackup[]) => void;
  isAdminPanelFocus?: boolean;
  adminNavSignal?: number;
  onOpenAuth: () => void;
}

export default function AdminSection({
  users,
  publicProfiles = [],
  boardRoles,
  fees,
  tabs,
  expenses = [],
  financialNotes = [],
  clubInfo,
  currentUser,
  announcements = [],
  auditLogs = [],
  deletedBackups = [],
  onUpdateUsers,
  onUpdateBoardRoles,
  onUpdateFees,
  onUpdateTabs,
  onUpdateExpenses,
  onUpdateFinancialNotes,
  onUpdateClubInfo,
  onUpdateAnnouncements,
  onUpdateAuditLogs,
  onUpdateDeletedBackups,
  isAdminPanelFocus = false,
  adminNavSignal = 0,
  onOpenAuth,
}: AdminSectionProps) {
  const [adminTab, setAdminTab] = useState<'members' | 'announcements' | 'trash' | 'audit' | 'backup' | 'monitoring'>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Modals state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isAddingAdminModal, setIsAddingAdminModal] = useState(false);
  const [selectedMemberToPromote, setSelectedMemberToPromote] = useState('');
  const [isAppointDirectorModal, setIsAppointDirectorModal] = useState(false);
  const [appointMemberId, setAppointMemberId] = useState('');
  const [appointMode, setAppointMode] = useState<'existing' | 'custom'>('existing');
  const [appointRoleId, setAppointRoleId] = useState('');
  const [appointCustomTitle, setAppointCustomTitle] = useState('');
  const [appointCanEditFinances, setAppointCanEditFinances] = useState(false);

  // Form State (used for both Add and Edit)
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [motorcycle, setMotorcycle] = useState('');
  const [role, setRole] = useState<UserRole>('member');
  const [status, setStatus] = useState<'active' | 'pending' | 'suspended'>('active');
  const [sosApproved, setSosApproved] = useState(true);
  const [canEditFinances, setCanEditFinances] = useState(false);
  const [bloodType, setBloodType] = useState('O+');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [joinedYear, setJoinedYear] = useState<number>(new Date().getFullYear());
  const [joinedDate, setJoinedDate] = useState<string>('');
  const [birthDate, setBirthDate] = useState<string>('');
  const [boardRoleId, setBoardRoleId] = useState<string>('');
  const [customRoleTitle, setCustomRoleTitle] = useState<string>('');
  const [memberCategory, setMemberCategory] = useState<MemberCategory>('Motociclista');
  const [nomadeBadge, setNomadeBadge] = useState(false);
  const [ossoBadge, setOssoBadge] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [responsibleMemberId, setResponsibleMemberId] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isSavingAdminAction, setIsSavingAdminAction] = useState(false);
  const [adminNotice, setAdminNotice] = useState('');
  const [resetEmailSending, setResetEmailSending] = useState(false);
  const [resetEmailFeedback, setResetEmailFeedback] = useState('');
  const [financeMemberModal, setFinanceMemberModal] = useState<User | null>(null);
  const [accessMessageDraft, setAccessMessageDraft] = useState(clubInfo.accessRequestMessage || '');
  const [accessMessageSaved, setAccessMessageSaved] = useState(false);
  const [appUpdateVersionDraft, setAppUpdateVersionDraft] = useState(
    clubInfo.appUpdateVersion || 'Nova Atualização'
  );
  const [appUpdateMessageDraft, setAppUpdateMessageDraft] = useState(
    clubInfo.appUpdateMessage ||
      'O administrador publicou melhorias e novidades no app. Atualize agora para carregar a versão mais recente.'
  );
  const [appUpdatePublishedNotice, setAppUpdatePublishedNotice] = useState(false);

  // Announcements Tab state
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annKind, setAnnKind] = useState<AnnouncementKind>('info');
  const [annPinned, setAnnPinned] = useState(false);
  const [annIsPublic, setAnnIsPublic] = useState(false);

  // Audit & Backup Tab state
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [backupImportPreview, setBackupImportPreview] = useState<{
    fileName: string;
    exportedAt?: string;
    usersCount: number;
    eventsCount: number;
    feesCount: number;
    announcementsCount: number;
    rawPayload: Record<string, unknown>;
  } | null>(null);
  const [backupImportError, setBackupImportError] = useState('');

  // Inline confirm dialog (delete member / revoke admin)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Link Pending Request -> Pre-registered Member Modal
  const [linkingPendingUser, setLinkingPendingUser] = useState<User | null>(null);
  const [linkTargetMemberId, setLinkTargetMemberId] = useState('');
  const [linkSearchTerm, setLinkSearchTerm] = useState('');
  const [isLinkingMember, setIsLinkingMember] = useState(false);

  // Android mobile modal scroll-top refs + Central de Backups + Monitoramento state
  const addUserFormRef = useRef<HTMLFormElement | null>(null);
  const editUserFormRef = useRef<HTMLFormElement | null>(null);
  const [snapshots, setSnapshots] = useState<StoredBackupSnapshotRecord[]>([]);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [isFlushingQueue, setIsFlushingQueue] = useState(false);
  const [selectedSnapshotForRestore, setSelectedSnapshotForRestore] =
    useState<StoredBackupSnapshotRecord | null>(null);
  const [restorePreview, setRestorePreview] = useState<BackupRestorePreview | null>(null);
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState(false);
  const [telemetrySnap, setTelemetrySnap] = useState<TelemetrySnapshot>(() =>
    telemetryMonitor.getSnapshot()
  );
  const [idbStats, setIdbStats] = useState<IndexedDbCacheStats | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaSyncStatus>(() =>
    FirestoreSync.getQuotaStatus()
  );
  const [isRefreshingSync, setIsRefreshingSync] = useState(false);

  const loadBackupCenterData = async () => {
    try {
      const list = await IndexedDbCache.listBackupSnapshots();
      setSnapshots(list);
      const stats = await IndexedDbCache.getStorageStats();
      setIdbStats(stats);
    } catch {
      // Non-fatal
    }
  };

  useEffect(() => {
    if (isAddingUser) {
      requestAnimationFrame(() => {
        if (addUserFormRef.current) {
          addUserFormRef.current.scrollTop = 0;
        }
      });
    }
  }, [isAddingUser]);

  useEffect(() => {
    if (editingUser) {
      requestAnimationFrame(() => {
        if (editUserFormRef.current) {
          editUserFormRef.current.scrollTop = 0;
        }
      });
    }
  }, [editingUser?.id]);

  useEffect(() => {
    const unsubTelemetry = telemetryMonitor.subscribe((snap) => {
      setTelemetrySnap(snap);
      setQuotaStatus(FirestoreSync.getQuotaStatus());
    });
    return () => {
      unsubTelemetry();
    };
  }, []);

  useEffect(() => {
    if (adminTab === 'backup' || adminTab === 'monitoring') {
      void loadBackupCenterData();
      setQuotaStatus(FirestoreSync.getQuotaStatus());
    }
  }, [adminTab]);

  const handleDevicePhotoFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadError('');
    setIsUploadingPhoto(true);
    try {
      const dataUrl = await compressImageFile(file, { maxDimension: 420, maxChars: 120_000 });
      setAvatarUrl(dataUrl);
      playSound('success');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao processar foto.');
      playSound('beep');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const isAdmin = isActiveAdminUser(currentUser);

  useEffect(() => {
    if (!isAdmin) {
      if (adminTab !== 'members') {
        setAdminTab('members');
      }
      setIsAddingUser(false);
      setEditingUser(null);
      setIsAddingAdminModal(false);
      setIsAppointDirectorModal(false);
      setLinkingPendingUser(null);
      setConfirmModal(null);
      return;
    }

    if (!isAdminPanelFocus && adminTab !== 'members') {
      setAdminTab('members');
    }
  }, [isAdmin, isAdminPanelFocus, adminNavSignal]);

  const isBoardFinance = Boolean(
    currentUser &&
    currentUser.status === 'active' &&
    currentUser.role === 'board' &&
    (currentUser.boardRoleId === 'role-finance' ||
      currentUser.email?.toLowerCase().includes('financeiro') ||
      currentUser.canEditFinances)
  );
  const isActivePresidente = Boolean(
    currentUser &&
      currentUser.status === 'active' &&
      currentUser.boardRoleId === 'role-pres'
  );
  const canManageSeals = Boolean(isAdmin || isActivePresidente);
  const canEditAnyFinances = Boolean(isAdmin || isBoardFinance);
  const isApprovedMember = Boolean(currentUser && currentUser.status === 'active');
  const isRestrictedPeerDirectory = Boolean(
    !isAdmin && !isBoardFinance && currentUser?.role !== 'board'
  );

  const nowDate = new Date();
  const todayMonth = String(nowDate.getMonth() + 1).padStart(2, '0');
  const todayDay = String(nowDate.getDate()).padStart(2, '0');
  const todayMonthDay = `${todayMonth}-${todayDay}`;

  const formatBrDate = (iso?: string) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  };

  const formatBirthdayShort = (iso?: string) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
    const [, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}`;
  };

  const todaysBirthdays = users.filter(
    (u) => u.status === 'active' && Boolean(u.birthDate) && u.birthDate!.slice(5, 10) === todayMonthDay
  );
  const monthBirthdays = users
    .filter((u) => u.status === 'active' && Boolean(u.birthDate) && u.birthDate!.slice(5, 7) === todayMonth)
    .sort((a, b) => (a.birthDate || '').slice(8, 10).localeCompare((b.birthDate || '').slice(8, 10)));

  // Visível apenas sob login individual dos membros sob liberação do administrador
  if (!currentUser) {
    return (
      <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 my-8 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mx-auto text-amber-400">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="font-rock text-3xl font-bold uppercase text-white">
            Área de Integrantes do Motoclube
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto">
            Esta área é restrita e visível apenas sob login individual dos integrantes sob liberação do administrador geral.
          </p>
        </div>

        <button
          onClick={onOpenAuth}
          className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-md shadow-amber-400/20"
        >
          Fazer Login Individual de Integrante
        </button>
      </div>
    );
  }

  // Se logado mas pendente de liberação pelo administrador
  if (!isApprovedMember) {
    return (
      <div className="bg-[#121216] border border-yellow-500/40 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 my-8 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center mx-auto text-yellow-400">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-3">
          <h2 className="font-rock text-3xl font-bold uppercase text-white">
            Cadastro Pendente de Liberação
          </h2>
          <p className="text-zinc-300 text-sm leading-relaxed max-w-md mx-auto">
            Olá, <strong className="text-white">{getMemberDisplayName(currentUser)}</strong>. Seu cadastro individual está registrado e aguarda homologação da Mesa Diretora.
          </p>
          {clubInfo.accessRequestMessage && (
            <div className="p-4 rounded-xl bg-amber-400/10 border border-amber-400/30 text-left max-w-lg mx-auto space-y-1">
              <span className="text-[10px] font-bold uppercase text-amber-400 flex items-center gap-1.5">
                <MessageSquareText className="w-3.5 h-3.5" />
                <span>Instruções do Motoclube</span>
              </span>
              <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line">
                {clubInfo.accessRequestMessage}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Filtered members list (full roster for Admin/Board, strict 5-field public directory for regular members)
  const peerDirectoryList: MemberPublicProfile[] =
    publicProfiles.length > 0
      ? publicProfiles
      : users
          .filter((u) => u.status === 'active')
          .map((u) => ({
            id: u.id,
            uid: u.id,
            name: u.name,
            nickname: u.nickname,
            avatarUrl: u.avatarUrl,
            birthDate: u.birthDate,
            joinedDate: u.joinedDate,
            joinedYear: u.joinedYear,
            phone: u.phone,
          }));

  const filteredPeerDirectory = peerDirectoryList.filter((p) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.nickname || '').toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q)
    );
  });

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.nickname || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.motorcycle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    const matchesCategory =
      filterCategory === 'all' || (u.memberCategory || 'Motociclista') === filterCategory;
    const matchesStatus = filterStatus === 'all' || u.status === filterStatus;
    return matchesSearch && matchesRole && matchesCategory && matchesStatus;
  });

  const recordAudit = (
    action: string,
    targetType: AdminAuditEntry['targetType'],
    targetId?: string,
    targetLabel?: string,
    details?: string
  ) => {
    const entry: AdminAuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      targetType,
      targetId,
      targetLabel,
      actorId: currentUser?.id || 'admin',
      actorName: currentUser ? getMemberDisplayName(currentUser) : 'Administrador',
      details,
      timestamp: new Date().toISOString(),
    };
    const nextLogs = [entry, ...auditLogs].slice(0, 120);
    onUpdateAuditLogs?.(nextLogs);
    StorageService.setAuditLogs(nextLogs);
    void FirestoreSync.logAdminAudit(entry);
  };

  const syncBoardRolesSnapshot = async (
    nextUsersList: User[],
    vacatedRoleIds: string[] = [],
    baseRoles: BoardRoleConfig[] = boardRoles
  ) => {
    if (!onUpdateBoardRoles || baseRoles.length === 0) return;
    const reconciled = reconcileBoardRolesWithUsers(baseRoles, nextUsersList, {
      vacatedRoleIds,
    });
    if (JSON.stringify(reconciled) !== JSON.stringify(baseRoles)) {
      await StorageService.saveBoardRolesConfirmed(reconciled);
      onUpdateBoardRoles(reconciled);
    }
  };

  const handleToggleMemberSeal = async (userId: string, seal: MemberBadge) => {
    if (!canManageSeals || isSavingAdminAction) return;
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    setIsSavingAdminAction(true);
    try {
      const currentlyHas =
        seal === 'NÔMADE' ? Boolean(target.nomadeBadge) : Boolean(target.ossoBadge);
      const nextHas = !currentlyHas;
      const nowIso = new Date().toISOString();
      const actorName = getMemberDisplayName(currentUser);
      const auditEntry: MemberBadgeAuditEntry = {
        id: `badge-${seal === 'NÔMADE' ? 'nom' : 'osso'}-${Date.now()}`,
        badge: seal,
        action: nextHas ? 'granted' : 'revoked',
        at: nowIso,
        byId: currentUser.id,
        byName: actorName,
        byUid: currentUser.id,
      };
      const updatedUser: User = {
        ...target,
        ...(seal === 'NÔMADE'
          ? nextHas
            ? {
                nomadeBadge: true,
                nomadeGrantedAt: nowIso,
                nomadeGrantedById: currentUser.id,
                nomadeGrantedByName: actorName,
              }
            : {
                nomadeBadge: false,
                nomadeGrantedAt: undefined,
                nomadeGrantedById: undefined,
                nomadeGrantedByName: undefined,
              }
          : nextHas
          ? {
              ossoBadge: true,
              ossoGrantedAt: nowIso,
              ossoGrantedById: currentUser.id,
              ossoGrantedByName: actorName,
            }
          : {
              ossoBadge: false,
              ossoGrantedAt: undefined,
              ossoGrantedById: undefined,
              ossoGrantedByName: undefined,
            }),
        badgeHistory: [auditEntry, ...(target.badgeHistory || [])].slice(0, 60),
      };
      const updatedList = users.map((u) => (u.id === userId ? updatedUser : u));
      await StorageService.saveUsersConfirmed(updatedList);
      onUpdateUsers(updatedList);
      recordAudit(
        `${nextHas ? 'Atribuir' : 'Remover'} selo ${seal}`,
        'member',
        userId,
        getMemberDisplayName(target)
      );
      setAdminNotice(
        `Selo ${seal} ${nextHas ? 'atribuído a' : 'removido de'} ${getMemberDisplayName(target)} com confirmação no Firebase.`
      );
      playSound('success');
    } catch (err) {
      setAdminNotice(
        err instanceof Error
          ? `Falha ao sincronizar selo ${seal}: ${err.message}`
          : `Não foi possível atualizar o selo ${seal} no servidor.`
      );
      playSound('beep');
    } finally {
      setIsSavingAdminAction(false);
    }
  };

  const handleApproveMember = async (userId: string) => {
    if (!isAdmin || isSavingAdminAction) return;
    const target = users.find((u) => u.id === userId);
    const updated = users.map((u) =>
      u.id === userId ? { ...u, status: 'active' as const, sosApproved: true } : u
    );
    setIsSavingAdminAction(true);
    try {
      await StorageService.saveUsersConfirmed(updated);
      onUpdateUsers(updated);
      if (target?.boardRoleId) {
        await syncBoardRolesSnapshot(updated);
      }
      recordAudit('Aprovar integrante e liberar SOS', 'member', userId, getMemberDisplayName(target));
      setAdminNotice(`Integrante ${getMemberDisplayName(target)} aprovado e salvo na nuvem.`);
      playSound('success');
    } catch (err) {
      setAdminNotice(
        err instanceof Error
          ? `Falha ao aprovar no servidor: ${err.message}`
          : 'Erro ao sincronizar aprovação com o servidor.'
      );
      playSound('beep');
    } finally {
      setIsSavingAdminAction(false);
    }
  };

  const handleSuspendMember = async (userId: string) => {
    if (!isAdmin || isSavingAdminAction) return;
    const target = users.find((u) => u.id === userId);
    const willReactivate = target?.status === 'suspended';
    const updated = users.map((u) =>
      u.id === userId
        ? {
            ...u,
            status: (u.status === 'suspended' ? 'active' : 'suspended') as User['status'],
            sosApproved: u.status === 'suspended',
          }
        : u
    );
    setIsSavingAdminAction(true);
    try {
      await StorageService.saveUsersConfirmed(updated);
      onUpdateUsers(updated);
      if (target?.boardRoleId) {
        await syncBoardRolesSnapshot(updated, willReactivate ? [] : [target.boardRoleId]);
      }
      recordAudit(
        willReactivate ? 'Reativar integrante' : 'Suspender integrante',
        'member',
        userId,
        getMemberDisplayName(target)
      );
      setAdminNotice(
        `${getMemberDisplayName(target)} ${willReactivate ? 'reativado' : 'suspenso'} e confirmado no servidor.`
      );
      playSound('click');
    } catch (err) {
      setAdminNotice(
        err instanceof Error
          ? `Falha ao alterar status no servidor: ${err.message}`
          : 'Erro ao sincronizar status no servidor.'
      );
      playSound('beep');
    } finally {
      setIsSavingAdminAction(false);
    }
  };

  const handleDeleteMember = (userId: string) => {
    if (!isAdmin) return;
    const target = users.find((u) => u.id === userId);
    setConfirmModal({
      title: 'Mover Integrante para Lixeira?',
      message: `Deseja remover ${getMemberDisplayName(target) || 'este integrante'} do cadastro ativo? Um backup de recuperação será guardado na Lixeira Administrativa.`,
      confirmLabel: 'Confirmar Remoção',
      onConfirm: async () => {
        setIsSavingAdminAction(true);
        try {
          const updated = users.filter((u) => u.id !== userId);
          await StorageService.saveUsersConfirmed(updated);
          if (target) {
            const backup: DeletedRecordBackup = {
              id: `bkp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              entityType: 'member',
              recordId: target.id,
              label: `${getMemberDisplayName(target)} (${target.name})`,
              payloadJson: JSON.stringify(target),
              deletedById: currentUser?.id || 'admin',
              deletedByName: currentUser ? getMemberDisplayName(currentUser) : 'Administrador',
              deletedAt: new Date().toISOString(),
            };
            const nextBackups = [backup, ...deletedBackups].slice(0, 60);
            onUpdateDeletedBackups?.(nextBackups);
            StorageService.setDeletedBackups(nextBackups);
            await FirestoreSync.saveDeletedBackup(backup);
            recordAudit(
              'Excluir integrante (backup salvo na lixeira)',
              'member',
              target.id,
              getMemberDisplayName(target),
              `E-mail: ${target.email || 'Sem e-mail'}`
            );
          }
          onUpdateUsers(updated);
          if (target?.boardRoleId) {
            await syncBoardRolesSnapshot(updated, [target.boardRoleId]);
          }
          setAdminNotice('Integrante movido para a lixeira e sincronizado com o Firestore.');
          playSound('click');
        } catch (err) {
          setAdminNotice(
            err instanceof Error
              ? `Falha ao remover integrante: ${err.message}`
              : 'Sincronização não concluída ao remover integrante.'
          );
          playSound('beep');
        } finally {
          setIsSavingAdminAction(false);
        }
      },
    });
  };

  const handlePromoteMemberToAdmin = async (userId: string) => {
    if (!isAdmin || isSavingAdminAction) return;
    const target = users.find((u) => u.id === userId);
    const updated = users.map((u) =>
      u.id === userId
        ? { ...u, role: 'admin' as UserRole, status: 'active' as const, sosApproved: true }
        : u
    );
    setIsSavingAdminAction(true);
    try {
      await StorageService.saveUsersConfirmed(updated);
      onUpdateUsers(updated);
      setIsAddingAdminModal(false);
      recordAudit('Promover a Administrador Geral', 'member', userId, getMemberDisplayName(target));
      setAdminNotice(`${getMemberDisplayName(target)} promovido a Administrador Geral com sucesso.`);
      playSound('success');
    } catch (err) {
      setAdminNotice(
        err instanceof Error
          ? `Falha ao promover administrador: ${err.message}`
          : 'Erro ao salvar promoção no servidor.'
      );
      playSound('beep');
    } finally {
      setIsSavingAdminAction(false);
    }
  };

  const syncMemberToBoardRoles = async (
    member: User,
    targetRoleId: string,
    customTitle?: string,
    nextUsersList: User[] = users,
    vacatedRoleIds: string[] = []
  ) => {
    const existingRole = boardRoles.find((r) => r.id === targetRoleId);
    const displayNickname = getMemberDisplayName(member);

    let seedRoles: BoardRoleConfig[];
    if (existingRole) {
      seedRoles = boardRoles.map((r) =>
        r.id === targetRoleId
          ? {
              ...r,
              holderName: displayNickname,
              avatarUrl: member.avatarUrl || '',
              motorcycle: member.motorcycle || '',
              email: member.email || '',
              phone: member.phone || '',
            }
          : r
      );
    } else if (customTitle) {
      const newRole: BoardRoleConfig = {
        id: targetRoleId,
        order: boardRoles.length,
        title: customTitle,
        holderName: displayNickname,
        email: member.email || '',
        phone: member.phone || '',
        avatarUrl: member.avatarUrl || '',
        motorcycle: member.motorcycle || '',
        isCustom: true,
      };
      seedRoles = [...boardRoles, newRole];
    } else {
      return;
    }

    const reconciled = reconcileBoardRolesWithUsers(seedRoles, nextUsersList, {
      vacatedRoleIds,
    });
    await StorageService.saveBoardRolesConfirmed(reconciled);
    onUpdateBoardRoles?.(reconciled);
  };

  const handleOpenAppointDirector = (preselectedMemberId?: string) => {
    if (!isAdmin) return;
    const targetUser = preselectedMemberId
      ? users.find((u) => u.id === preselectedMemberId)
      : undefined;
    const defaultRoleId =
      targetUser?.boardRoleId && boardRoles.some((r) => r.id === targetUser.boardRoleId)
        ? targetUser.boardRoleId
        : boardRoles[0]?.id || '';

    setAppointMemberId(preselectedMemberId || '');
    setAppointMode(boardRoles.length > 0 ? 'existing' : 'custom');
    setAppointRoleId(defaultRoleId);
    setAppointCustomTitle('');
    setAppointCanEditFinances(
      Boolean(targetUser?.canEditFinances || defaultRoleId === 'role-finance')
    );
    setIsAppointDirectorModal(true);
  };

  const handleConfirmAppointDirector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || isSavingAdminAction) return;
    const member = users.find((u) => u.id === appointMemberId);
    if (!member) return;

    const isCustom = appointMode === 'custom';
    const customTitle = appointCustomTitle.trim();
    if (isCustom && !customTitle) return;
    if (!isCustom && !appointRoleId) return;

    const targetRoleId = isCustom ? `role-custom-${Date.now()}` : appointRoleId;
    const targetRoleTitle = isCustom
      ? customTitle
      : boardRoles.find((r) => r.id === targetRoleId)?.title || 'Diretor';

    const appointedUser: User = {
      ...member,
      role: member.role === 'admin' ? 'admin' : 'board',
      status: 'active',
      sosApproved: true,
      boardRoleId: targetRoleId,
      customRoleTitle: undefined,
      canEditFinances:
        member.role === 'admin' ||
        appointCanEditFinances ||
        targetRoleId === 'role-finance' ||
        targetRoleTitle.toLowerCase().includes('financeir'),
    };

    const updatedUsers = users.map((u) => {
      if (u.id === appointedUser.id) return appointedUser;
      if (u.boardRoleId === targetRoleId) {
        return {
          ...u,
          boardRoleId: undefined,
          role: u.role === 'admin' ? ('admin' as UserRole) : ('member' as UserRole),
          canEditFinances: u.role === 'admin',
        };
      }
      return u;
    });

    setIsSavingAdminAction(true);
    try {
      await StorageService.saveUsersConfirmed(updatedUsers);
      onUpdateUsers(updatedUsers);
      if (currentUser && currentUser.id === appointedUser.id) {
        StorageService.setCurrentUser(appointedUser);
      }

      const vacatedIds =
        member.boardRoleId && member.boardRoleId !== targetRoleId ? [member.boardRoleId] : [];
      await syncMemberToBoardRoles(
        appointedUser,
        targetRoleId,
        isCustom ? customTitle : undefined,
        updatedUsers,
        vacatedIds
      );

      setIsAppointDirectorModal(false);
      recordAudit('Nomear Diretor da Mesa Diretora', 'member', appointedUser.id, getMemberDisplayName(appointedUser), `Cargo: ${targetRoleTitle}`);
      setAdminNotice(
        `${getMemberDisplayName(appointedUser)} foi nomeado(a) como ${targetRoleTitle}. Alteração sincronizada na Mesa Diretora!`
      );
      playSound('success');
    } catch (err) {
      setAdminNotice(
        err instanceof Error
          ? `Falha ao nomear diretor: ${err.message}`
          : 'Erro ao sincronizar nomeação no Firestore.'
      );
      playSound('beep');
    } finally {
      setIsSavingAdminAction(false);
    }
  };

  const handleRevokeAdmin = (userId: string) => {
    if (!isAdmin) return;
    const user = users.find((u) => u.id === userId);
    if (user?.email?.toLowerCase().trim() === ADMIN_EMAIL) {
      setAdminNotice('Não é possível revogar o Administrador Geral titular da instituição.');
      playSound('beep');
      return;
    }
    setConfirmModal({
      title: 'Revogar Administrador Geral?',
      message: `Deseja remover as permissões de administrador de ${getMemberDisplayName(user) || 'este integrante'}?`,
      confirmLabel: 'Revogar Privilégios',
      onConfirm: async () => {
        setIsSavingAdminAction(true);
        try {
          const updated = users.map((u) =>
            u.id === userId
              ? { ...u, role: 'member' as UserRole }
              : u
          );
          await StorageService.saveUsersConfirmed(updated);
          onUpdateUsers(updated);
          recordAudit('Revogar Administrador Geral', 'member', userId, getMemberDisplayName(user));
          setAdminNotice(`Privilégios de ${getMemberDisplayName(user)} revogados com sucesso.`);
          playSound('click');
        } catch (err) {
          setAdminNotice(
            err instanceof Error
              ? `Falha ao revogar privilégio: ${err.message}`
              : 'Erro ao salvar revogação no Firestore.'
          );
          playSound('beep');
        } finally {
          setIsSavingAdminAction(false);
        }
      },
    });
  };

  const handleOpenLinkModal = (pendingUser: User) => {
    if (!isAdmin) return;
    setLinkingPendingUser(pendingUser);
    setLinkTargetMemberId('');
    setLinkSearchTerm('');
  };

  const handleConfirmLinkGoogleRequest = async () => {
    if (!isAdmin || !linkingPendingUser || !linkTargetMemberId) return;
    setIsLinkingMember(true);
    try {
      const mergedUser = await FirestoreSync.linkGoogleRequestToPreRegisteredMember(
        linkingPendingUser.id,
        linkTargetMemberId
      );
      const nextUsers = users
        .filter((u) => u.id !== linkingPendingUser.id)
        .map((u) => (u.id === mergedUser.id ? mergedUser : u));
      onUpdateUsers(nextUsers);
      StorageService.applyRemoteUsers(nextUsers);
      setLinkingPendingUser(null);
      recordAudit(
        'Associar solicitação de ingresso a cadastro existente',
        'member',
        mergedUser.id,
        getMemberDisplayName(mergedUser),
        `Conta vinculada: ${linkingPendingUser.email}`
      );
      setAdminNotice(
        `Conta (${linkingPendingUser.email}) associada com sucesso a ${getMemberDisplayName(mergedUser)}! Todos os dados, UID e débitos foram unificados.`
      );
      playSound('success');
    } catch (err) {
      setAdminNotice(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsLinkingMember(false);
    }
  };

  const handleOpenAdd = () => {
    if (!isAdmin) return;
    const todayIso = new Date().toISOString().split('T')[0];
    setName('');
    setNickname('');
    setEmail('');
    setPhone('');
    setMotorcycle('');
    setRole('member');
    setStatus('active');
    setSosApproved(true);
    setCanEditFinances(false);
    setBloodType('O+');
    setEmergencyContact('');
    setJoinedYear(new Date().getFullYear());
    setJoinedDate(todayIso);
    setBirthDate('');
    setBoardRoleId('');
    setCustomRoleTitle('');
    setMemberCategory('Motociclista');
    setNomadeBadge(false);
    setOssoBadge(false);
    setIsMinor(false);
    setResponsibleMemberId('');
    setAvatarUrl('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80');
    setIsAddingUser(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || isSavingAdminAction) return;
    if (!name.trim()) return;
    if (!isMinor && !email.trim()) return;
    if (isMinor && !responsibleMemberId) return;

    const responsibleUser = isMinor
      ? users.find((u) => u.id === responsibleMemberId)
      : undefined;

    const derivedJoinedYear = joinedDate
      ? parseInt(joinedDate.slice(0, 4), 10) || Number(joinedYear) || new Date().getFullYear()
      : Number(joinedYear) || new Date().getFullYear();

    const assignedBoardRoleId =
      (role === 'board' || role === 'admin') && boardRoleId ? boardRoleId : undefined;
    const assignedBoardTitle =
      boardRoles.find((r) => r.id === assignedBoardRoleId)?.title.toLowerCase() || '';
    const autoFinanceDir =
      assignedBoardRoleId === 'role-finance' || assignedBoardTitle.includes('financeir');

    const nowIso = new Date().toISOString();
    const actorName = currentUser ? getMemberDisplayName(currentUser) : 'Administrador';
    const initialBadgeHist: MemberBadgeAuditEntry[] = [];
    if (nomadeBadge && currentUser) {
      initialBadgeHist.push({
        id: `badge-nom-${Date.now()}`,
        badge: 'NÔMADE',
        action: 'granted',
        at: nowIso,
        byId: currentUser.id,
        byName: actorName,
        byUid: currentUser.id,
      });
    }
    if (ossoBadge && currentUser) {
      initialBadgeHist.push({
        id: `badge-osso-${Date.now() + 1}`,
        badge: 'O.S.S.O.',
        action: 'granted',
        at: nowIso,
        byId: currentUser.id,
        byName: actorName,
        byUid: currentUser.id,
      });
    }

    const newUser: User = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      nickname: nickname.trim() || undefined,
      email: email.trim(),
      phone: phone.trim() || responsibleUser?.phone || '(15) 99000-0000',
      motorcycle: motorcycle.trim(),
      role: isMinor ? 'member' : role,
      status,
      sosApproved: isMinor ? false : sosApproved,
      canEditFinances: role === 'admin' ? true : role === 'board' ? (canEditFinances || autoFinanceDir) : false,
      bloodType: bloodType || 'O+',
      emergencyContact: emergencyContact.trim() || (responsibleUser ? `Resp.: ${getMemberDisplayName(responsibleUser)} ${responsibleUser.phone || ''}` : ''),
      joinedYear: derivedJoinedYear,
      joinedDate: joinedDate.trim() || undefined,
      birthDate: birthDate.trim() || undefined,
      boardRoleId: isMinor ? undefined : assignedBoardRoleId,
      customRoleTitle: customRoleTitle.trim() || undefined,
      memberCategory,
      nomadeBadge,
      ...(nomadeBadge && currentUser
        ? {
            nomadeGrantedAt: nowIso,
            nomadeGrantedById: currentUser.id,
            nomadeGrantedByName: actorName,
          }
        : {}),
      ossoBadge,
      ...(ossoBadge && currentUser
        ? {
            ossoGrantedAt: nowIso,
            ossoGrantedById: currentUser.id,
            ossoGrantedByName: actorName,
          }
        : {}),
      badgeHistory: initialBadgeHist.length > 0 ? initialBadgeHist : undefined,
      isMinor,
      responsibleMemberId: isMinor && responsibleUser ? responsibleUser.id : undefined,
      responsibleMemberName: isMinor && responsibleUser ? getMemberDisplayName(responsibleUser) : undefined,
      avatarUrl: avatarUrl.trim() || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
    };

    const clearedUsers = newUser.boardRoleId
      ? users.map((u) =>
          u.boardRoleId === newUser.boardRoleId
            ? { ...u, boardRoleId: undefined }
            : u
        )
      : users;
    const updated = [newUser, ...clearedUsers];

    setIsSavingAdminAction(true);
    try {
      await StorageService.saveUsersConfirmed(updated);
      onUpdateUsers(updated);
      if (newUser.boardRoleId && status === 'active') {
        await syncMemberToBoardRoles(newUser, newUser.boardRoleId, undefined, updated);
      } else {
        await syncBoardRolesSnapshot(updated);
      }
      recordAudit('Cadastrar novo integrante', 'member', newUser.id, getMemberDisplayName(newUser));
      setIsAddingUser(false);
      setAdminNotice(`${getMemberDisplayName(newUser)} cadastrado e sincronizado no Firebase.`);
      playSound('success');
    } catch (err) {
      setAdminNotice(
        err instanceof Error
          ? `Falha ao cadastrar integrante no servidor: ${err.message}. Dados preservados.`
          : 'Sincronização não concluída. Os dados preenchidos foram preservados.'
      );
      playSound('beep');
    } finally {
      setIsSavingAdminAction(false);
    }
  };

  const handleOpenEdit = (user: User) => {
    if (!isAdmin) return;
    setEditingUser(user);
    setName(user.name);
    setNickname(user.nickname || '');
    setEmail(user.email);
    setPhone(user.phone);
    setMotorcycle(user.motorcycle);
    setRole(user.role);
    setStatus(user.status);
    setSosApproved(user.sosApproved);
    setCanEditFinances(Boolean(user.canEditFinances));
    setBloodType(user.bloodType || 'O+');
    setEmergencyContact(user.emergencyContact || '');
    setResetEmailFeedback('');
    setJoinedYear(user.joinedYear || new Date().getFullYear());
    setJoinedDate(user.joinedDate || (user.joinedYear ? `${user.joinedYear}-01-01` : ''));
    setBirthDate(user.birthDate || '');
    setBoardRoleId(user.boardRoleId || '');
    setCustomRoleTitle(user.customRoleTitle || '');
    setMemberCategory(user.memberCategory || 'Motociclista');
    setNomadeBadge(Boolean(user.nomadeBadge));
    setOssoBadge(Boolean(user.ossoBadge));
    setIsMinor(Boolean(user.isMinor));
    setResponsibleMemberId(user.responsibleMemberId || '');
    setAvatarUrl(user.avatarUrl || '');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingUser || isSavingAdminAction) return;
    if (isMinor && !responsibleMemberId) return;

    const responsibleUser = isMinor
      ? users.find((u) => u.id === responsibleMemberId)
      : undefined;

    const derivedJoinedYear = joinedDate
      ? parseInt(joinedDate.slice(0, 4), 10) || Number(joinedYear) || editingUser.joinedYear
      : Number(joinedYear) || editingUser.joinedYear;

    const assignedBoardRoleId =
      (role === 'board' || role === 'admin') && boardRoleId ? boardRoleId : undefined;
    const assignedBoardTitle =
      boardRoles.find((r) => r.id === assignedBoardRoleId)?.title.toLowerCase() || '';
    const autoFinanceDir =
      assignedBoardRoleId === 'role-finance' || assignedBoardTitle.includes('financeir');

    const nowIso = new Date().toISOString();
    const actorName = currentUser ? getMemberDisplayName(currentUser) : 'Administrador';
    const nextBadgeHistory: MemberBadgeAuditEntry[] = [
      ...(editingUser.badgeHistory || []),
    ];
    let nomadePatch: Partial<User> = {};
    let ossoPatch: Partial<User> = {};
    if (nomadeBadge !== Boolean(editingUser.nomadeBadge)) {
      nextBadgeHistory.unshift({
        id: `badge-nom-${Date.now()}`,
        badge: 'NÔMADE',
        action: nomadeBadge ? 'granted' : 'revoked',
        at: nowIso,
        byId: currentUser?.id || 'admin',
        byName: actorName,
        byUid: currentUser?.id || 'admin',
      });
      nomadePatch = nomadeBadge
        ? {
            nomadeBadge: true,
            nomadeGrantedAt: nowIso,
            nomadeGrantedById: currentUser?.id,
            nomadeGrantedByName: actorName,
          }
        : {
            nomadeBadge: false,
            nomadeGrantedAt: undefined,
            nomadeGrantedById: undefined,
            nomadeGrantedByName: undefined,
          };
    }
    if (ossoBadge !== Boolean(editingUser.ossoBadge)) {
      nextBadgeHistory.unshift({
        id: `badge-osso-${Date.now() + 1}`,
        badge: 'O.S.S.O.',
        action: ossoBadge ? 'granted' : 'revoked',
        at: nowIso,
        byId: currentUser?.id || 'admin',
        byName: actorName,
        byUid: currentUser?.id || 'admin',
      });
      ossoPatch = ossoBadge
        ? {
            ossoBadge: true,
            ossoGrantedAt: nowIso,
            ossoGrantedById: currentUser?.id,
            ossoGrantedByName: actorName,
          }
        : {
            ossoBadge: false,
            ossoGrantedAt: undefined,
            ossoGrantedById: undefined,
            ossoGrantedByName: undefined,
          };
    }

    const savedUser: User = {
      ...editingUser,
      name: name.trim(),
      nickname: nickname.trim() || undefined,
      email: email.trim(),
      phone: phone.trim(),
      motorcycle: motorcycle.trim(),
      role: isMinor ? 'member' : role,
      status,
      sosApproved: isMinor ? false : sosApproved,
      canEditFinances: role === 'admin' ? true : role === 'board' ? (canEditFinances || autoFinanceDir) : false,
      bloodType,
      emergencyContact: emergencyContact.trim(),
      joinedYear: derivedJoinedYear,
      joinedDate: joinedDate.trim() || undefined,
      birthDate: birthDate.trim() || undefined,
      boardRoleId: isMinor ? undefined : assignedBoardRoleId,
      customRoleTitle: customRoleTitle.trim() || undefined,
      memberCategory,
      ...nomadePatch,
      ...ossoPatch,
      badgeHistory: nextBadgeHistory.slice(0, 60),
      isMinor,
      responsibleMemberId: isMinor && responsibleUser ? responsibleUser.id : undefined,
      responsibleMemberName: isMinor && responsibleUser ? getMemberDisplayName(responsibleUser) : undefined,
      avatarUrl: avatarUrl.trim() || editingUser.avatarUrl,
    };

    const updated = users.map((u) => {
      if (u.id === editingUser.id) return savedUser;
      if (savedUser.boardRoleId && u.boardRoleId === savedUser.boardRoleId) {
        return { ...u, boardRoleId: undefined };
      }
      return u;
    });

    setIsSavingAdminAction(true);
    try {
      await StorageService.saveUsersConfirmed(updated);
      onUpdateUsers(updated);
      if (currentUser && currentUser.id === editingUser.id) {
        StorageService.setCurrentUser(savedUser);
      }
      const vacatedIds: string[] = [];
      if (
        editingUser.boardRoleId &&
        (savedUser.boardRoleId !== editingUser.boardRoleId || savedUser.status !== 'active')
      ) {
        vacatedIds.push(editingUser.boardRoleId);
      }

      if (savedUser.boardRoleId && status === 'active') {
        await syncMemberToBoardRoles(savedUser, savedUser.boardRoleId, undefined, updated, vacatedIds);
      } else if (vacatedIds.length > 0 || editingUser.boardRoleId) {
        await syncBoardRolesSnapshot(updated, vacatedIds);
      }
      recordAudit('Editar cadastro do integrante', 'member', savedUser.id, getMemberDisplayName(savedUser));
      setEditingUser(null);
      setAdminNotice(`${getMemberDisplayName(savedUser)} atualizado e sincronizado no Firebase.`);
      playSound('success');
    } catch (err) {
      setAdminNotice(
        err instanceof Error
          ? `Falha ao salvar alterações no servidor: ${err.message}. Dados preenchidos mantidos.`
          : 'Sincronização não concluída. Os dados preenchidos foram mantidos.'
      );
      playSound('beep');
    } finally {
      setIsSavingAdminAction(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest block flex items-center gap-1.5">
            <Users className="w-4 h-4 text-amber-400" />
            <span>Gestão Administrativa & Níveis de Acesso</span>
          </span>
          <h2 className="font-rock text-3xl font-bold uppercase text-white tracking-wide">
            Controle de Integrantes do Clube
          </h2>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleOpenAppointDirector()}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-400/40 font-rock text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Award className="w-4 h-4 text-amber-400" />
              <span>Nomear Diretor</span>
            </button>

            <button
              onClick={() => setIsAddingAdminModal(true)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-400/40 font-rock text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Key className="w-4 h-4 text-amber-400" />
              <span>Nomear Administrador Geral</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>Adicionar Novo Integrante</span>
            </button>
          </div>
        )}
      </div>

      {adminNotice && (
        <div className="p-3 bg-amber-400/10 border border-amber-400/40 text-amber-200 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{adminNotice}</span>
          </div>
          <button onClick={() => setAdminNotice('')} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Admin Sub-Navigation Tabs */}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 bg-[#121216] border border-zinc-800 rounded-2xl p-2">
          {[
            { id: 'members', label: `Integrantes (${users.length})`, icon: Users },
            { id: 'announcements', label: `Comunicados (${announcements.length})`, icon: Megaphone },
            { id: 'trash', label: `Lixeira & Recuperação (${deletedBackups.length})`, icon: RotateCcw },
            { id: 'audit', label: `Auditoria (${auditLogs.length})`, icon: History },
            { id: 'backup', label: 'Central de Backups', icon: Database },
            { id: 'monitoring', label: 'Monitoramento & Economia', icon: Activity },
          ].map((tabItem) => {
            const TabIcon = tabItem.icon;
            const active = adminTab === tabItem.id;
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setAdminTab(tabItem.id as typeof adminTab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-amber-400 text-black font-rock shadow-sm'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" />
                <span>{tabItem.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sub-Tab: Comunicados Oficiais */}
      {isAdmin && adminTab === 'announcements' && (
        <div className="space-y-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!annTitle.trim() || !annMessage.trim() || isSavingAdminAction) return;
              const newItem: ClubAnnouncement = {
                id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                title: annTitle.trim(),
                message: annMessage.trim(),
                kind: annKind,
                pinned: annPinned,
                isPublic: annIsPublic,
                authorId: currentUser?.id || 'admin',
                authorName: currentUser ? getMemberDisplayName(currentUser) : 'Diretoria',
                createdAt: new Date().toISOString(),
              };
              const nextList = [newItem, ...announcements];
              setIsSavingAdminAction(true);
              try {
                await StorageService.saveAnnouncementConfirmed(newItem, nextList);
                onUpdateAnnouncements?.(nextList);
                recordAudit('Publicar comunicado oficial', 'announcement', newItem.id, newItem.title);
                setAnnTitle('');
                setAnnMessage('');
                setAnnKind('info');
                setAnnPinned(false);
                setAnnIsPublic(false);
                setAdminNotice('Comunicado oficial publicado e sincronizado com o Firebase!');
                playSound('success');
              } catch (err) {
                setAdminNotice(
                  err instanceof Error
                    ? `Falha ao publicar comunicado: ${err.message}. Conteúdo preservado.`
                    : 'Não foi possível salvar o comunicado no servidor.'
                );
                playSound('beep');
              } finally {
                setIsSavingAdminAction(false);
              }
            }}
            className="bg-[#121216] border border-amber-400/35 rounded-2xl p-5 space-y-4 text-xs"
          >
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-amber-400" />
              <h3 className="font-rock text-base font-bold uppercase text-white">
                Publicar Comunicado Oficial
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Título do Comunicado *
                </label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="Ex: Reunião Geral na Sede / Comboio Confirmado"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">Tipo</label>
                <select
                  value={annKind}
                  onChange={(e) => setAnnKind(e.target.value as AnnouncementKind)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="info">Informativo</option>
                  <option value="event">Evento / Passeio</option>
                  <option value="meeting">Reunião</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-zinc-300 uppercase mb-1">
                Mensagem aos Integrantes *
              </label>
              <textarea
                rows={3}
                required
                maxLength={2000}
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                placeholder="Escreva o aviso que aparecerá no Mural da página inicial e nas notificações..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white leading-relaxed focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 font-semibold text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={annPinned}
                    onChange={(e) => setAnnPinned(e.target.checked)}
                    className="w-4 h-4 accent-amber-400 rounded"
                  />
                  <span>Fixar comunicado no topo da Página Inicial</span>
                </label>

                <label className="flex items-center gap-2 font-semibold text-emerald-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={annIsPublic}
                    onChange={(e) => setAnnIsPublic(e.target.checked)}
                    className="w-4 h-4 accent-emerald-400 rounded"
                  />
                  <span>Visível também para visitantes sem login</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSavingAdminAction}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black font-rock text-xs font-bold uppercase rounded-lg flex items-center gap-1.5"
              >
                {isSavingAdminAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Publicar Comunicado</span>
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {announcements.length === 0 ? (
              <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-8 text-center text-xs text-zinc-400">
                Nenhum comunicado publicado ainda.
              </div>
            ) : (
              announcements.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#121216] border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.pinned && (
                        <span className="px-2 py-0.5 rounded bg-amber-400 text-black text-[10px] font-extrabold uppercase">
                          Fixado
                        </span>
                      )}
                      {item.isPublic && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold uppercase">
                          Público
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          item.kind === 'urgent'
                            ? 'bg-red-950/60 text-red-300 border-red-700'
                            : item.kind === 'event'
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
                            : item.kind === 'meeting'
                            ? 'bg-sky-950/60 text-sky-300 border-sky-700'
                            : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                        }`}
                      >
                        {item.kind === 'urgent'
                          ? 'Urgente'
                          : item.kind === 'event'
                          ? 'Evento'
                          : item.kind === 'meeting'
                          ? 'Reunião'
                          : 'Informativo'}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {new Date(item.createdAt).toLocaleString('pt-BR')} · {item.authorName}
                      </span>
                    </div>
                    <h4 className="font-rock text-base font-bold uppercase text-white">
                      {item.title}
                    </h4>
                    <p className="text-xs text-zinc-300 whitespace-pre-line">{item.message}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isSavingAdminAction}
                      onClick={async () => {
                        const toggled = { ...item, pinned: !item.pinned };
                        const nextList = announcements.map((a) => (a.id === item.id ? toggled : a));
                        setIsSavingAdminAction(true);
                        try {
                          await StorageService.saveAnnouncementConfirmed(toggled, nextList);
                          onUpdateAnnouncements?.(nextList);
                          recordAudit(
                            toggled.pinned ? 'Fixar comunicado' : 'Desafixar comunicado',
                            'announcement',
                            item.id,
                            item.title
                          );
                          playSound('click');
                        } catch (err) {
                          setAdminNotice(
                            err instanceof Error
                              ? `Falha ao atualizar comunicado: ${err.message}`
                              : 'Erro ao atualizar comunicado no servidor.'
                          );
                          playSound('beep');
                        } finally {
                          setIsSavingAdminAction(false);
                        }
                      }}
                      className={`p-2 rounded-lg border transition-colors ${
                        item.pinned
                          ? 'bg-amber-400/20 text-amber-300 border-amber-400/50'
                          : 'bg-zinc-900 text-zinc-400 hover:text-amber-300 border-zinc-800'
                      }`}
                      title={item.pinned ? 'Desafixar' : 'Fixar no topo'}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isSavingAdminAction}
                      onClick={async () => {
                        const nextList = announcements.filter((a) => a.id !== item.id);
                        setIsSavingAdminAction(true);
                        try {
                          await StorageService.deleteAnnouncementConfirmed(item.id, nextList);
                          onUpdateAnnouncements?.(nextList);
                          recordAudit('Excluir comunicado', 'announcement', item.id, item.title);
                          playSound('click');
                        } catch (err) {
                          setAdminNotice(
                            err instanceof Error
                              ? `Falha ao excluir comunicado: ${err.message}`
                              : 'Erro ao excluir comunicado no servidor.'
                          );
                          playSound('beep');
                        } finally {
                          setIsSavingAdminAction(false);
                        }
                      }}
                      className="p-2 rounded-lg bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-400 border border-zinc-800"
                      title="Excluir comunicado"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab: Lixeira & Recuperação */}
      {isAdmin && adminTab === 'trash' && (
        <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <h3 className="font-rock text-base font-bold uppercase text-white">
                Lixeira Administrativa & Recuperação de Registros
              </h3>
            </div>
            <span className="text-[11px] text-zinc-400">
              Cadastros removidos podem ser restaurados preservando ID original e histórico.
            </span>
          </div>

          {deletedBackups.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              Nenhum registro na lixeira no momento.
            </div>
          ) : (
            <div className="space-y-2.5">
              {deletedBackups.map((bkp) => (
                <div
                  key={bkp.id}
                  className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30 text-[10px] font-bold uppercase">
                        {bkp.entityType}
                      </span>
                      <span className="font-bold text-white truncate">{bkp.label}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Removido por <strong className="text-zinc-200">{bkp.deletedByName}</strong> em{' '}
                      {new Date(bkp.deletedAt).toLocaleString('pt-BR')} · ID: {bkp.recordId}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const parsed = JSON.parse(bkp.payloadJson) as User;
                          if (bkp.entityType === 'member' && parsed && parsed.id) {
                            const cleanMember: User = { ...parsed };
                            delete (cleanMember as unknown as Record<string, unknown>).password;
                            if (!users.some((u) => u.id === cleanMember.id)) {
                              const nextUsers = [cleanMember, ...users];
                              await StorageService.saveUsersConfirmed(nextUsers);
                              onUpdateUsers(nextUsers);
                            }
                            const nextBackups = deletedBackups.filter((x) => x.id !== bkp.id);
                            onUpdateDeletedBackups?.(nextBackups);
                            StorageService.setDeletedBackups(nextBackups);
                            await FirestoreSync.deleteBackupRecord(bkp.id);
                            recordAudit(
                              'Restaurar integrante da lixeira',
                              'backup',
                              cleanMember.id,
                              bkp.label
                            );
                            setAdminNotice(`${bkp.label} restaurado e sincronizado no servidor!`);
                            playSound('success');
                          }
                        } catch (err) {
                          setAdminNotice(
                            err instanceof Error
                              ? `Falha ao restaurar cadastro: ${err.message}`
                              : 'Não foi possível interpretar os dados do backup.'
                          );
                          playSound('beep');
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase rounded-lg flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restaurar Cadastro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextBackups = deletedBackups.filter((x) => x.id !== bkp.id);
                        onUpdateDeletedBackups?.(nextBackups);
                        StorageService.setDeletedBackups(nextBackups);
                        void FirestoreSync.deleteBackupRecord(bkp.id);
                        playSound('click');
                      }}
                      className="p-1.5 bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-400 border border-zinc-800 rounded-lg"
                      title="Remover backup definitivamente"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab: Trilha de Auditoria */}
      {isAdmin && adminTab === 'audit' && (
        <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              <h3 className="font-rock text-base font-bold uppercase text-white">
                Registro de Auditoria Administrativa
              </h3>
            </div>
            <input
              type="text"
              placeholder="Filtrar por ação, autor ou alvo..."
              value={auditSearchTerm}
              onChange={(e) => setAuditSearchTerm(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 sm:w-64"
            />
          </div>

          {auditLogs.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              Nenhuma ação registrada nesta sessão ainda.
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 text-xs">
              {auditLogs
                .filter((log) => {
                  const q = auditSearchTerm.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    log.action.toLowerCase().includes(q) ||
                    log.actorName.toLowerCase().includes(q) ||
                    (log.targetLabel || '').toLowerCase().includes(q) ||
                    (log.details || '').toLowerCase().includes(q)
                  );
                })
                .map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-amber-400 text-[10px] font-bold uppercase">
                          {log.targetType}
                        </span>
                        <span className="font-bold text-white">{log.action}</span>
                        {log.targetLabel && (
                          <span className="text-zinc-300">— {log.targetLabel}</span>
                        )}
                      </div>
                      {log.details && (
                        <p className="text-[11px] text-zinc-400">{log.details}</p>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 sm:text-right shrink-0">
                      <span className="text-zinc-200 font-semibold block">{log.actorName}</span>
                      <span>{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-Tab: Central de Backups (R2, IndexedDB, SHA-256 & Restauração Segura) */}
      {isAdmin && adminTab === 'backup' && (() => {
        const workerConfigured = BackupService.isCloudflareConfigured();
        const queuedCount = snapshots.filter((s) => s.syncStatus === 'queued_offline').length;

        const handleCreateSnapshot = async (kind: 'full' | 'incremental') => {
          setIsCreatingSnapshot(true);
          try {
            const snap = await BackupService.createBackupSnapshot({
              kind,
              dataset: { fees, tabs, expenses, users, boardRoles, clubInfo },
              actor: currentUser,
            });
            await loadBackupCenterData();
            recordAudit(
              kind === 'full'
                ? 'Criar snapshot completo (Full)'
                : 'Criar snapshot incremental',
              'backup',
              snap.id,
              `SHA ${snap.sha256.slice(0, 12)}`,
              `Status: ${snap.syncStatus} · ${snap.manifest.feesCount} mensalidades, ${snap.manifest.tabsCount} fiados, ${snap.manifest.expensesCount} despesas`
            );
            setAdminNotice(
              `Snapshot ${kind.toUpperCase()} criado com SHA-256 ${snap.sha256.slice(0, 12)} (${
                snap.syncStatus === 'synced_r2'
                  ? 'enviado ao Cloudflare R2'
                  : snap.syncStatus === 'queued_offline'
                  ? 'enfileirado para envio automático ao Cloudflare R2'
                  : 'armazenado localmente no IndexedDB'
              }).`
            );
            playSound('success');
          } catch (err) {
            setAdminNotice(err instanceof Error ? err.message : 'Erro ao criar snapshot.');
            playSound('beep');
          } finally {
            setIsCreatingSnapshot(false);
          }
        };

        const handleFlushR2Queue = async () => {
          setIsFlushingQueue(true);
          try {
            const res = await BackupService.flushOfflineQueue();
            await loadBackupCenterData();
            setAdminNotice(
              res.synced > 0
                ? `${res.synced} snapshot(s) enviado(s) para o Cloudflare R2 (${res.remaining} restante(s)).`
                : res.remaining > 0
                ? 'Não foi possível sincronizar a fila R2 agora. Verifique o Worker URL ou conexão.'
                : 'Nenhum snapshot pendente na fila offline.'
            );
            playSound(res.synced > 0 ? 'success' : 'click');
          } finally {
            setIsFlushingQueue(false);
          }
        };

        const handleOpenPreviewRestore = async (snap: StoredBackupSnapshotRecord) => {
          const preview = await BackupService.previewRestore(snap, {
            fees,
            tabs,
            expenses,
            users,
          });
          setSelectedSnapshotForRestore(snap);
          setRestorePreview(preview);
        };

        const handleExecuteRestore = async (
          mode: 'merge_preserve' | 'restore_financial_snapshot'
        ) => {
          if (!selectedSnapshotForRestore) return;
          setIsRestoringSnapshot(true);
          try {
            const result = await BackupService.executeSafeRestore({
              snapshot: selectedSnapshotForRestore,
              currentDataset: { fees, tabs, expenses, users, boardRoles, clubInfo },
              actor: currentUser,
              mode,
              applyRestored: async ({ fees: nextFees, tabs: nextTabs, expenses: nextExpenses }) => {
                await StorageService.saveFinanceBatchConfirmed({
                  fees: nextFees,
                  tabs: nextTabs,
                  expenses: nextExpenses,
                });
                onUpdateFees(nextFees);
                onUpdateTabs(nextTabs);
                onUpdateExpenses?.(nextExpenses);
              },
            });
            await loadBackupCenterData();
            recordAudit(
              `Restaurar snapshot (${mode})`,
              'backup',
              selectedSnapshotForRestore.id,
              `Backup prévio: ${result.safetyBackup.id}`,
              `${result.mergedFeesCount} mensalidades, ${result.mergedTabsCount} fiados, ${result.mergedExpensesCount} despesas`
            );
            setSelectedSnapshotForRestore(null);
            setRestorePreview(null);
            setAdminNotice(
              `Restauração concluída! Um snapshot de segurança prévio (${result.safetyBackup.id}) foi gravado antes da aplicação.`
            );
            playSound('success');
          } catch (err) {
            setAdminNotice(err instanceof Error ? err.message : 'Falha ao restaurar snapshot.');
            playSound('beep');
          } finally {
            setIsRestoringSnapshot(false);
          }
        };

        return (
          <div className="space-y-6 text-xs">
            {/* Cloudflare R2 & Snapshot Generator */}
            <div className="bg-[#121216] border border-amber-400/35 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Database className="w-4 h-4 text-amber-400" />
                    <h3 className="font-rock text-base font-bold uppercase text-white">
                      Central de Backups (IndexedDB + Cloudflare R2)
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        workerConfigured
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                      }`}
                    >
                      {workerConfigured ? (
                        <>
                          <Cloud className="w-3 h-3" />
                          <span>Worker R2 Configurado</span>
                        </>
                      ) : (
                        <>
                          <CloudOff className="w-3 h-3 text-amber-400" />
                          <span>Modo Local IndexedDB (Worker R2 opcional via env)</span>
                        </>
                      )}
                    </span>
                    {queuedCount > 0 && (
                      <span className="px-2 py-0.5 rounded bg-yellow-500/15 border border-yellow-500/40 text-yellow-300 text-[10px] font-bold uppercase">
                        {queuedCount} na fila offline
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-400 max-w-3xl">
                    Gere snapshots completos ou incrementais com assinatura criptográfica SHA-256 armazenados localmente no IndexedDB e replicados automaticamente para Cloudflare R2 quando configurado. Toda restauração cria um snapshot de segurança prévio automático.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isCreatingSnapshot}
                    onClick={() => handleCreateSnapshot('full')}
                    className="px-3.5 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-rock text-xs font-bold uppercase rounded-xl flex items-center gap-1.5"
                  >
                    {isCreatingSnapshot ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <HardDrive className="w-4 h-4" />
                    )}
                    <span>Snapshot Completo (Full)</span>
                  </button>

                  <button
                    type="button"
                    disabled={isCreatingSnapshot}
                    onClick={() => handleCreateSnapshot('incremental')}
                    className="px-3.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-amber-300 border border-amber-400/40 font-rock text-xs font-bold uppercase rounded-xl flex items-center gap-1.5"
                  >
                    <FileDiff className="w-4 h-4" />
                    <span>Snapshot Incremental</span>
                  </button>

                  {workerConfigured && (
                    <button
                      type="button"
                      disabled={isFlushingQueue || queuedCount === 0}
                      onClick={handleFlushR2Queue}
                      className="px-3.5 py-2.5 bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-40 text-sky-300 border border-sky-500/40 text-xs font-bold uppercase rounded-xl flex items-center gap-1.5"
                    >
                      {isFlushingQueue ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      <span>Reenviar Fila R2 ({queuedCount})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Snapshots List */}
              {snapshots.length === 0 ? (
                <div className="p-6 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-zinc-400">
                  Nenhum snapshot criado neste dispositivo ainda. Clique em <strong>Snapshot Completo (Full)</strong> para gravar o primeiro ponto de restauração verificado por SHA-256.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              snap.kind === 'pre_restore_safety'
                                ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                                : snap.kind === 'incremental'
                                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                                : 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                            }`}
                          >
                            {snap.kind === 'pre_restore_safety'
                              ? 'Segurança Pré-Restauração'
                              : snap.kind === 'incremental'
                              ? 'Incremental'
                              : 'Completo (Full)'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              snap.syncStatus === 'synced_r2'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : snap.syncStatus === 'queued_offline'
                                ? 'bg-yellow-500/15 text-yellow-300'
                                : 'bg-zinc-800 text-zinc-300'
                            }`}
                          >
                            {snap.syncStatus === 'synced_r2'
                              ? 'Sincronizado R2'
                              : snap.syncStatus === 'queued_offline'
                              ? 'Na fila R2'
                              : 'Local IndexedDB'}
                          </span>
                          <span className="font-mono text-[11px] text-zinc-400">
                            SHA {snap.sha256.slice(0, 12)}
                          </span>
                        </div>
                        <p className="text-white font-semibold">
                          {new Date(snap.createdAt).toLocaleString('pt-BR')} · Por {snap.createdByName}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {snap.manifest.feesCount} mensalidade(s) · {snap.manifest.tabsCount} fiado(s) ·{' '}
                          {snap.manifest.expensesCount} despesa(s) · {snap.manifest.usersCount} cadastro(s) ·{' '}
                          {(snap.sizeBytes / 1024).toFixed(1)} KB
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleOpenPreviewRestore(snap)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold uppercase flex items-center gap-1"
                        >
                          <FileDiff className="w-3.5 h-3.5" />
                          <span>Analisar & Restaurar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(snap, null, 2)], {
                              type: 'application/json',
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${snap.id}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            setTimeout(() => URL.revokeObjectURL(url), 10_000);
                          }}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700"
                          title="Baixar snapshot JSON"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {snap.kind !== 'pre_restore_safety' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await IndexedDbCache.deleteBackupSnapshot(snap.id);
                              await loadBackupCenterData();
                            }}
                            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 border border-zinc-800"
                            title="Remover snapshot local"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Classic Portable JSON Export / Import */}
            <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileJson className="w-4 h-4 text-amber-400" />
                    <h3 className="font-rock text-base font-bold uppercase text-white">
                      Exportação e Importação Portátil (JSON)
                    </h3>
                  </div>
                  <p className="text-zinc-400 max-w-2xl">
                    Exporte uma cópia integral dos integrantes, diretoria, eventos, financeiro e comunicados sem senhas. Você também pode importar um backup válido mesclando registros ausentes sem alterar UIDs existentes.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const payload = StorageService.exportFullBackupPayload();
                    const blob = new Blob([JSON.stringify(payload, null, 2)], {
                      type: 'application/json',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `oficina-do-rock-backup-${new Date().toISOString().slice(0, 10)}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 10_000);
                    recordAudit('Exportar backup completo JSON', 'backup', 'export', 'Backup JSON');
                    setAdminNotice('Backup JSON exportado com sucesso!');
                    playSound('success');
                  }}
                  className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase rounded-xl flex items-center gap-2 shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar Backup (.json)</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <label className="block font-bold text-amber-400 uppercase">
                  Importar Arquivo de Backup JSON
                </label>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    setBackupImportError('');
                    setBackupImportPreview(null);
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const parsed = JSON.parse(String(reader.result || '{}')) as Record<string, unknown>;
                        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.users)) {
                          setBackupImportError('Arquivo JSON inválido: campo "users" não encontrado.');
                          return;
                        }
                        setBackupImportPreview({
                          fileName: file.name,
                          exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
                          usersCount: Array.isArray(parsed.users) ? parsed.users.length : 0,
                          eventsCount: Array.isArray(parsed.events) ? parsed.events.length : 0,
                          feesCount: Array.isArray(parsed.fees) ? parsed.fees.length : 0,
                          announcementsCount: Array.isArray(parsed.announcements) ? parsed.announcements.length : 0,
                          rawPayload: parsed,
                        });
                      } catch {
                        setBackupImportError('Não foi possível ler o arquivo JSON selecionado.');
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                  className="block w-full text-xs text-zinc-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-amber-300 file:font-bold hover:file:bg-zinc-700 cursor-pointer"
                />

                {backupImportError && (
                  <p className="text-red-400 font-semibold">{backupImportError}</p>
                )}

                {backupImportPreview && (
                  <div className="p-4 rounded-xl bg-zinc-900/70 border border-emerald-500/40 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-bold text-white">{backupImportPreview.fileName}</span>
                      {backupImportPreview.exportedAt && (
                        <span className="text-[11px] text-zinc-400">
                          Exportado em {new Date(backupImportPreview.exportedAt).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-300">
                      Conteúdo validado: <strong>{backupImportPreview.usersCount}</strong> integrante(s),{' '}
                      <strong>{backupImportPreview.eventsCount}</strong> passeio(s),{' '}
                      <strong>{backupImportPreview.feesCount}</strong> lançamento(s) e{' '}
                      <strong>{backupImportPreview.announcementsCount}</strong> comunicado(s).
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setIsSavingAdminAction(true);
                          try {
                            const raw = backupImportPreview.rawPayload;
                            const importedUsers = (Array.isArray(raw.users) ? raw.users : []).map((u) => {
                              const clone = { ...(u as User & { password?: unknown }) };
                              delete clone.password;
                              return clone as User;
                            });
                            const existingIds = new Set(users.map((u) => u.id));
                            const mergedUsers = [
                              ...users,
                              ...importedUsers.filter((u) => u && u.id && !existingIds.has(u.id)),
                            ];
                            await StorageService.saveUsersConfirmed(mergedUsers);
                            onUpdateUsers(mergedUsers);

                            if (Array.isArray(raw.announcements)) {
                              const annIds = new Set(announcements.map((a) => a.id));
                              const addedAnns = (raw.announcements as ClubAnnouncement[]).filter(
                                (a) => a && a.id && !annIds.has(a.id)
                              );
                              let runningAnns = [...announcements];
                              for (const ann of addedAnns) {
                                runningAnns = [...runningAnns, ann];
                                await StorageService.saveAnnouncementConfirmed(ann, runningAnns);
                              }
                              onUpdateAnnouncements?.(runningAnns);
                            }

                            recordAudit(
                              'Importar backup JSON (mesclagem segura)',
                              'backup',
                              backupImportPreview.fileName,
                              backupImportPreview.fileName
                            );
                            setBackupImportPreview(null);
                            setAdminNotice('Backup importado e sincronizado com segurança (cadastros ausentes mesclados sem duplicação).');
                            playSound('success');
                          } catch (err) {
                            setAdminNotice(
                              err instanceof Error
                                ? `Falha ao importar backup: ${err.message}`
                                : 'Erro ao sincronizar importação com o servidor.'
                            );
                            playSound('beep');
                          } finally {
                            setIsSavingAdminAction(false);
                          }
                        }}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase rounded-lg"
                      >
                        Mesclar Registros Ausentes com Segurança
                      </button>
                      <button
                        type="button"
                        onClick={() => setBackupImportPreview(null)}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase rounded-lg"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pre-Restore Diff Modal */}
            {selectedSnapshotForRestore && restorePreview && (
              <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
                <div className="bg-[#121216] border border-emerald-400/40 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <FileDiff className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-rock text-lg font-bold uppercase text-white">
                        Análise Pré-Restauração (Diff)
                      </h3>
                    </div>
                    <button
                      type="button"
                      disabled={isRestoringSnapshot}
                      onClick={() => {
                        setSelectedSnapshotForRestore(null);
                        setRestorePreview(null);
                      }}
                      className="text-zinc-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div
                    className={`p-3 rounded-xl border flex items-center gap-2 ${
                      restorePreview.checksumValid
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                        : 'bg-red-950/40 border-red-500/40 text-red-300'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="font-bold uppercase block">
                        {restorePreview.checksumValid
                          ? 'Integridade SHA-256 Verificada'
                          : 'ALERTA: Divergência de Checksum SHA-256'}
                      </span>
                      <span className="font-mono text-[11px] opacity-90">
                        {restorePreview.sha256.slice(0, 24)}...
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                      <span className="block text-[10px] uppercase text-zinc-400 font-bold">
                        Mensalidades
                      </span>
                      <span className="font-rock text-lg text-amber-400 block">
                        +{restorePreview.newFeesCount} / {restorePreview.updatedFeesCount} exist.
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                      <span className="block text-[10px] uppercase text-zinc-400 font-bold">
                        Fiados Bar
                      </span>
                      <span className="font-rock text-lg text-sky-400 block">
                        +{restorePreview.newTabsCount} / {restorePreview.updatedTabsCount} exist.
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                      <span className="block text-[10px] uppercase text-zinc-400 font-bold">
                        Despesas Sede
                      </span>
                      <span className="font-rock text-lg text-emerald-400 block">
                        +{restorePreview.newExpensesCount} / {restorePreview.updatedExpensesCount} exist.
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Antes de restaurar qualquer dado financeiro, o sistema gravará automaticamente um <strong>Snapshot de Segurança Pré-Restauração</strong> para reversão instantânea e preservará intactos todos os UIDs dos integrantes.
                  </p>

                  <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-zinc-800">
                    <button
                      type="button"
                      disabled={!restorePreview.checksumValid || isRestoringSnapshot}
                      onClick={() => handleExecuteRestore('merge_preserve')}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-bold uppercase rounded-lg"
                    >
                      Mesclar Ausentes (Seguro)
                    </button>
                    {selectedSnapshotForRestore.kind === 'full' && (
                      <button
                        type="button"
                        disabled={!restorePreview.checksumValid || isRestoringSnapshot}
                        onClick={() => handleExecuteRestore('restore_financial_snapshot')}
                        className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black font-bold uppercase rounded-lg"
                      >
                        Aplicar Estado do Snapshot
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Sub-Tab: Monitoramento, Cota & Economia de Cache */}
      {isAdmin && adminTab === 'monitoring' && (() => {
        const projection = telemetryMonitor.getProjectionFor100Members();
        const moduleEntries = Object.entries(telemetrySnap.readsByModule).sort(
          (a, b) => b[1] - a[1]
        );
        return (
          <div className="space-y-6 text-xs">
            <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <h3 className="font-rock text-base font-bold uppercase text-white">
                    Telemetria Firestore, Cache Local & Capacidade 100 Integrantes
                  </h3>
                </div>
                <p className="text-zinc-400">
                  Sessão iniciada em {new Date(telemetrySnap.startedAt).toLocaleString('pt-BR')}
                  {telemetrySnap.lastSyncAt
                    ? ` · Último sync: ${new Date(telemetrySnap.lastSyncAt).toLocaleTimeString('pt-BR')} (${telemetrySnap.lastSyncReason || 'ok'})`
                    : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isRefreshingSync}
                  onClick={async () => {
                    setIsRefreshingSync(true);
                    try {
                      if (quotaStatus.blocked) {
                        await FirestoreSync.retryAfterQuota();
                      } else {
                        await FirestoreSync.manualSyncRefresh();
                      }
                      await loadBackupCenterData();
                      setAdminNotice('Sincronização manual concluída com o Firestore.');
                    } finally {
                      setIsRefreshingSync(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-rock font-bold uppercase flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSync ? 'animate-spin' : ''}`} />
                  <span>{quotaStatus.blocked ? 'Retentar Pós-Cota' : 'Sincronizar Agora'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    telemetryMonitor.resetSessionCounters();
                    playSound('click');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold uppercase"
                >
                  Zerar Contadores
                </button>
              </div>
            </div>

            {quotaStatus.blocked && (
              <div className="p-4 rounded-xl bg-red-950/35 border border-red-500/40 text-red-200 flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold uppercase block">Modo Proteção de Cota Ativo</span>
                  <span className="text-[11px] text-red-300">
                    {quotaStatus.reason || 'Aguardando recuperação da cota diária; operando em cache offline.'}
                  </span>
                </div>
              </div>
            )}

            {/* Main Telemetry KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-[#121216] border border-zinc-800 rounded-xl p-4">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                  Leituras Firestore
                </span>
                <span className="font-rock text-2xl font-bold text-white">
                  {telemetrySnap.totalReads}
                </span>
                <span className="text-[11px] text-zinc-500 block">
                  Escritas: {telemetrySnap.totalWrites}
                </span>
              </div>
              <div className="bg-[#121216] border border-emerald-500/30 rounded-xl p-4">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                  Economizadas pelo Cache
                </span>
                <span className="font-rock text-2xl font-bold text-emerald-300">
                  {telemetrySnap.readsAvoided}
                </span>
                <span className="text-[11px] text-zinc-400 block">
                  Mem: {telemetrySnap.cacheHitsMemory} · IDB: {telemetrySnap.cacheHitsIndexedDb}
                </span>
              </div>
              <div className="bg-[#121216] border border-sky-500/30 rounded-xl p-4">
                <span className="text-[10px] uppercase font-bold text-sky-400 block">
                  Deduplicação & Docs
                </span>
                <span className="font-rock text-2xl font-bold text-sky-300">
                  {telemetrySnap.dedupeBlocked} dedup.
                </span>
                <span className="text-[11px] text-zinc-400 block">
                  Docs IDB: {telemetrySnap.documentCacheHits} vs Nuvem: {telemetrySnap.documentDownloads}
                </span>
              </div>
              <div className="bg-[#121216] border border-zinc-800 rounded-xl p-4">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                  Backups & Erros
                </span>
                <span className="font-rock text-2xl font-bold text-amber-400">
                  {telemetrySnap.backupSuccessCount} OK
                </span>
                <span className="text-[11px] text-zinc-400 block">
                  Cota: {telemetrySnap.quotaErrors} · Rede: {telemetrySnap.connectionErrors}
                </span>
              </div>
            </div>

            {/* 100-Member Capacity Projection & IndexedDB Storage */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-amber-400" />
                  <h4 className="font-rock text-sm font-bold uppercase text-white">
                    Projeção para 100 Integrantes (Plano Free 50.000 leituras/dia)
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] uppercase text-zinc-400 block">
                      Redução Estimada
                    </span>
                    <span className="font-rock text-xl font-bold text-emerald-400">
                      {projection.reductionPercent}%
                    </span>
                    <span className="text-[10px] text-zinc-500 block">
                      {projection.measuredReadsPerSession} vs {projection.baselineUncachedReadsPerSession} sem cache
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                    <span className="text-[10px] uppercase text-zinc-400 block">
                      Folga Diária (100 acessos)
                    </span>
                    <span className="font-rock text-xl font-bold text-amber-400">
                      {projection.estimatedFreeTierHeadroomPercent}%
                    </span>
                    <span className="text-[10px] text-zinc-500 block">
                      ~{projection.projected100SporadicDailyReads.toLocaleString('pt-BR')} leituras/dia
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Pico simultâneo projetado (100 integrantes):{' '}
                  <strong className="text-zinc-200">
                    {projection.projected100SimultaneousBurstReads.toLocaleString('pt-BR')} leituras
                  </strong>{' '}
                  de {projection.freeTierDailyReadLimit.toLocaleString('pt-BR')} permitidas/dia.
                </p>
              </div>

              <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-sky-400" />
                  <h4 className="font-rock text-sm font-bold uppercase text-white">
                    Cache Local Persistente (IndexedDB)
                  </h4>
                </div>
                {idbStats ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                      <span className="text-[10px] uppercase text-zinc-400 block">
                        Datasets em Cache
                      </span>
                      <span className="font-rock text-xl font-bold text-white">
                        {idbStats.datasetsCount}
                      </span>
                      <span className="text-[10px] text-zinc-500 block">
                        {idbStats.publicDatasetsCount} públicos · {idbStats.privateDatasetsCount} privados
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                      <span className="text-[10px] uppercase text-zinc-400 block">
                        Documentos & Backups
                      </span>
                      <span className="font-rock text-xl font-bold text-sky-300">
                        {idbStats.documentsCount} docs
                      </span>
                      <span className="text-[10px] text-zinc-500 block">
                        {(idbStats.documentsBytes / (1024 * 1024)).toFixed(2)} MB · {idbStats.backupsCount} snapshots
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-400">Carregando estatísticas do IndexedDB...</p>
                )}
              </div>
            </div>

            {/* Breakdown by Module + Recent Telemetry Events */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-5 space-y-3">
                <h4 className="font-rock text-sm font-bold uppercase text-white">
                  Leituras por Módulo
                </h4>
                {moduleEntries.length === 0 ? (
                  <p className="text-zinc-500">Nenhuma leitura de rede registrada nesta sessão.</p>
                ) : (
                  <div className="space-y-1.5">
                    {moduleEntries.map(([mod, count]) => (
                      <div
                        key={mod}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800"
                      >
                        <span className="font-mono text-zinc-200">{mod}</span>
                        <span className="font-bold text-amber-400">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-5 space-y-3">
                <h4 className="font-rock text-sm font-bold uppercase text-white">
                  Eventos Recentes ({telemetrySnap.recentEvents.length})
                </h4>
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {telemetrySnap.recentEvents.slice(0, 20).map((ev) => (
                    <div
                      key={ev.id}
                      className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-amber-300 uppercase mr-1.5">
                          {ev.kind}
                        </span>
                        <span className="text-zinc-200 font-mono">{ev.module}</span>
                        {ev.detail && (
                          <span className="block text-[10px] text-zinc-400 truncate">
                            {ev.detail}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 shrink-0">
                        {new Date(ev.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Active Administrators Overview & Members Content */}
      {(!isAdmin || adminTab === 'members') && (
        <>
      {isAdmin && (
        <div className="bg-[#121216] border border-amber-400/30 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              <span className="font-rock text-sm uppercase font-bold text-white tracking-wide">
                Mesa de Administradores Gerais
              </span>
            </div>
            <span className="text-[11px] text-zinc-400">
              Acesso irrestrito a cadastros, finanças e diretoria
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {users.filter(u => u.role === 'admin').map(admin => (
              <div key={admin.id} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <img
                    src={admin.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'}
                    alt={getMemberDisplayName(admin)}
                    className="w-8 h-8 rounded-full object-cover border border-amber-400"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">{getMemberDisplayName(admin)}</span>
                    <span className="text-[10px] text-amber-400 font-mono block">{admin.email}</span>
                  </div>
                </div>

                {admin.email?.toLowerCase().trim() !== ADMIN_EMAIL && (
                  <button
                    onClick={() => handleRevokeAdmin(admin.id)}
                    className="text-[10px] text-zinc-400 hover:text-red-400 font-semibold px-2 py-1 rounded bg-zinc-900 border border-zinc-800"
                    title="Remover privilégio de administrador"
                  >
                    Revogar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin Editable: Mensagem de Solicitação de Acesso */}
      {isAdmin && (
        <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-amber-400" />
              <span className="font-rock text-sm uppercase font-bold text-white tracking-wide">
                Mensagem de Solicitação de Acesso (Portal de Login)
              </span>
            </div>
            <span className="text-[11px] text-zinc-400">
              Exibida na tela de login por E-mail/Senha e para cadastros pendentes
            </span>
          </div>

          <textarea
            rows={3}
            value={accessMessageDraft}
            onChange={(e) => {
              setAccessMessageDraft(e.target.value);
              setAccessMessageSaved(false);
            }}
            placeholder="Informe as instruções para novos integrantes que solicitam acesso ao portal..."
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-zinc-200 leading-relaxed focus:outline-none focus:border-amber-400"
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[11px] text-zinc-500">
              {accessMessageSaved ? (
                <span className="text-green-400 font-semibold">Mensagem salva e atualizada no portal!</span>
              ) : (
                'O acesso dos integrantes utiliza E-mail e Senha com suporte à migração de Conta Google existente.'
              )}
            </span>

            <button
              type="button"
              disabled={isSavingAdminAction}
              onClick={async () => {
                const updatedInfo: ClubInfo = {
                  ...clubInfo,
                  accessRequestMessage: accessMessageDraft.trim(),
                };
                setIsSavingAdminAction(true);
                try {
                  await StorageService.saveClubInfoAndAwaitCloud(updatedInfo);
                  onUpdateClubInfo?.(updatedInfo);
                  recordAudit('Atualizar mensagem de solicitação de acesso', 'settings', 'main', 'Portal de Login');
                  setAccessMessageSaved(true);
                  playSound('success');
                } catch (err) {
                  setAdminNotice(
                    err instanceof Error
                      ? `Falha ao salvar mensagem de acesso: ${err.message}`
                      : 'Erro ao sincronizar mensagem de acesso.'
                  );
                  playSound('beep');
                } finally {
                  setIsSavingAdminAction(false);
                }
              }}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Mensagem de Acesso</span>
            </button>
          </div>
        </div>
      )}

      {/* Admin Editable: Publicar Aviso de Atualização Disponível do App */}
      {isAdmin && (
        <div className="bg-[#121216] border border-amber-400/35 rounded-2xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <span className="font-rock text-sm uppercase font-bold text-white tracking-wide">
                Aviso de Atualização Disponível no App
              </span>
            </div>
            {clubInfo.appUpdatePublishedAt && (
              <span className="text-[11px] text-zinc-400">
                Última publicação:{' '}
                <strong className="text-amber-300">
                  {new Date(clubInfo.appUpdatePublishedAt).toLocaleString('pt-BR')}
                </strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-zinc-300 uppercase mb-1">
                Versão / Título
              </label>
              <input
                type="text"
                maxLength={60}
                value={appUpdateVersionDraft}
                onChange={(e) => {
                  setAppUpdateVersionDraft(e.target.value);
                  setAppUpdatePublishedNotice(false);
                }}
                placeholder="Ex: Versão 2.4"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-zinc-300 uppercase mb-1">
                Mensagem da Atualização para os Integrantes
              </label>
              <input
                type="text"
                maxLength={450}
                value={appUpdateMessageDraft}
                onChange={(e) => {
                  setAppUpdateMessageDraft(e.target.value);
                  setAppUpdatePublishedNotice(false);
                }}
                placeholder="Descreva o que foi atualizado no aplicativo..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[11px] text-zinc-400">
              {appUpdatePublishedNotice ? (
                <span className="text-green-400 font-semibold">
                  Aviso de atualização publicado! Todos os integrantes receberão a notificação no app.
                </span>
              ) : (
                'Ao publicar, todos os usuários com o app aberto ou ao acessar verão o aviso para atualizar.'
              )}
            </span>

            <button
              type="button"
              disabled={isSavingAdminAction}
              onClick={async () => {
                const nowIso = new Date().toISOString();
                const updatedInfo: ClubInfo = {
                  ...clubInfo,
                  appUpdateId: `upd-${Date.now()}`,
                  appUpdateVersion: appUpdateVersionDraft.trim() || 'Nova Atualização',
                  appUpdateMessage:
                    appUpdateMessageDraft.trim() ||
                    'O administrador publicou uma nova atualização no aplicativo.',
                  appUpdatePublishedAt: nowIso,
                };
                setIsSavingAdminAction(true);
                try {
                  await StorageService.saveClubInfoAndAwaitCloud(updatedInfo);
                  onUpdateClubInfo?.(updatedInfo);
                  recordAudit('Publicar atualização disponível do app', 'settings', 'main', updatedInfo.appUpdateVersion);
                  setAppUpdatePublishedNotice(true);
                  playSound('success');
                } catch (err) {
                  setAdminNotice(
                    err instanceof Error
                      ? `Falha ao publicar atualização: ${err.message}`
                      : 'Erro ao sincronizar aviso de atualização.'
                  );
                  playSound('beep');
                } finally {
                  setIsSavingAdminAction(false);
                }
              }}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Publicar Atualização do App</span>
            </button>
          </div>
        </div>
      )}

      {/* Aniversariantes do Clube */}
      {(todaysBirthdays.length > 0 || monthBirthdays.length > 0) && (
        <div className="bg-[#121216] border border-amber-400/35 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Cake className="w-5 h-5 text-amber-400" />
              <span className="font-rock text-sm uppercase font-bold text-white tracking-wide">
                Aniversariantes do Clube
              </span>
            </div>
            <span className="text-[11px] text-zinc-400">
              {todaysBirthdays.length > 0
                ? `${todaysBirthdays.length} aniversário(s) hoje (${todayDay}/${todayMonth})!`
                : `Mês ${todayMonth} · ${monthBirthdays.length} irmão(s)`}
            </span>
          </div>

          {todaysBirthdays.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {todaysBirthdays.map((bUser) => (
                <div
                  key={bUser.id}
                  className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/50 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={bUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'}
                      alt={getMemberDisplayName(bUser)}
                      className="w-10 h-10 rounded-full object-cover border-2 border-amber-400"
                    />
                    <div>
                      <span className="text-[10px] font-bold uppercase text-amber-400 block">
                        🎂 Parabéns Hoje ({formatBirthdayShort(bUser.birthDate)})
                      </span>
                      <span className="text-sm font-bold text-white block">{getMemberDisplayName(bUser)}</span>
                      {!isRestrictedPeerDirectory && (
                        <span className="text-[11px] text-zinc-300 block">{bUser.motorcycle}</span>
                      )}
                    </div>
                  </div>
                  {bUser.phone && (
                    <a
                      href={`https://wa.me/55${bUser.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `Parabéns irmão ${getMemberDisplayName(bUser)}! Felicidades e muitas estradas pela frente! — Oficina do Rock MC`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-[10px] font-bold uppercase shrink-0 transition-colors"
                    >
                      Parabenizar
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {monthBirthdays.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-[10px] uppercase font-bold text-zinc-400">No mês {todayMonth}:</span>
              {monthBirthdays.map((mUser) => {
                const isTodayBday = mUser.birthDate?.slice(5, 10) === todayMonthDay;
                return (
                  <span
                    key={mUser.id}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                      isTodayBday
                        ? 'bg-amber-400 text-black border-amber-400 font-bold'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800'
                    }`}
                  >
                    {formatBirthdayShort(mUser.birthDate)} · {getMemberDisplayName(mUser)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#121216] border border-zinc-800/90 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder={
              isRestrictedPeerDirectory
                ? 'Buscar integrante por apelido, nome ou telefone...'
                : 'Buscar por apelido, nome, moto ou e-mail...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
          />
        </div>

        {!isRestrictedPeerDirectory && (
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
            >
              <option value="all">Todos os Níveis</option>
              <option value="admin">Administrador</option>
              <option value="board">Diretoria</option>
              <option value="member">Integrante Pleno</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
            >
              <option value="all">Todas as Categorias</option>
              {MEMBER_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
            >
              <option value="all">Todos os Status</option>
              <option value="active">Ativos</option>
              <option value="pending">Pendentes</option>
              <option value="suspended">Suspensos</option>
            </select>
          </div>
        )}
      </div>

      {/* Directory View: Strictly 5 Authorized Public Fields for Regular Members */}
      {isRestrictedPeerDirectory ? (
        <div className="bg-[#121216] border border-zinc-800/90 rounded-2xl overflow-hidden shadow-xl">
          <div className="px-4 py-3 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
            <span>Diretório de Integrantes (5 campos públicos autorizados: Foto, Nome, Aniversário, Entrada no MC e Telefone)</span>
            <span className="font-mono text-amber-400 font-bold">{filteredPeerDirectory.length} ativo(s)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {filteredPeerDirectory.map((peer) => {
              const isBdayToday = Boolean(
                peer.birthDate && peer.birthDate.slice(5, 10) === todayMonthDay
              );
              const peerDisplayName = getMemberDisplayName(peer);
              return (
                <div
                  key={peer.id}
                  className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center gap-3.5"
                >
                  <img
                    src={
                      peer.avatarUrl ||
                      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80'
                    }
                    alt={peerDisplayName}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-full object-cover border border-amber-400/50 shrink-0"
                  />
                  <div className="min-w-0 space-y-1 text-xs">
                    <div className="font-bold text-white text-sm truncate">
                      {peerDisplayName}
                    </div>
                    {peer.nickname?.trim() &&
                      peer.nickname.trim().toLowerCase() !== peer.name.trim().toLowerCase() && (
                        <div className="text-[11px] text-zinc-400 truncate">{peer.name}</div>
                      )}
                    <div className="text-[11px] text-zinc-300 flex items-center gap-1.5">
                      <Cake className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        Aniversário:{' '}
                        <strong className="text-zinc-100">
                          {peer.birthDate ? formatBirthdayShort(peer.birthDate) : 'Não informado'}
                        </strong>
                      </span>
                      {isBdayToday && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-400 text-black text-[9px] font-extrabold uppercase">
                          Hoje!
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span>
                        Entrada:{' '}
                        {peer.joinedDate
                          ? formatBrDate(peer.joinedDate)
                          : peer.joinedYear
                          ? `Ano ${peer.joinedYear}`
                          : 'Não informado'}
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-300 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{peer.phone || 'Não informado'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
      /* Members Table (Board / Financial Director / General Admin) */
      <div className="bg-[#121216] border border-zinc-800/90 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-800">
              <tr>
                <th className="py-3.5 px-4">Integrante / Colete / Selos</th>
                <th className="py-3.5 px-4">Motocicleta / Categoria</th>
                <th className="py-3.5 px-4">Aniversário / Ingresso</th>
                <th className="py-3.5 px-4">Nível / Mensalidade</th>
                <th className="py-3.5 px-4">Permissão SOS</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {filteredUsers.map((user) => {
                const isActive = user.status === 'active';
                const isPending = user.status === 'pending';
                const isSuspended = user.status === 'suspended';
                const isBdayToday = Boolean(user.birthDate && user.birthDate.slice(5, 10) === todayMonthDay);
                const feeStatusInfo = resolveMemberFeeStatusInfo(user);
                const isTargetMinorExempt = Boolean(
                  isMemberCurrentlyMinor(user) && !hasExplicitManualPagante(user)
                );
                const canOpenFinance = (canEditAnyFinances || user.id === currentUser.id) && !isTargetMinorExempt;

                return (
                  <tr key={user.id} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'}
                          alt={getMemberDisplayName(user)}
                          className="w-9 h-9 rounded-full object-cover border border-zinc-700"
                        />
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-white text-sm">{getMemberDisplayName(user)}</span>
                            {user.isMinor && (
                              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[9px] font-bold uppercase">
                                Menor{user.responsibleMemberName ? ` · Resp.: ${user.responsibleMemberName}` : ''}
                              </span>
                            )}
                            {user.nomadeBadge && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-400/50 text-[9px] font-rock font-bold uppercase tracking-wider">
                                NÔMADE
                              </span>
                            )}
                            {user.ossoBadge && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-400/60 text-[9px] font-rock font-bold uppercase tracking-wider">
                                O.S.S.O.
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-zinc-400 block">
                            {user.email || 'Sem e-mail'} · {user.phone}
                          </span>
                          {canManageSeals && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <button
                                type="button"
                                disabled={isSavingAdminAction}
                                onClick={() => void handleToggleMemberSeal(user.id, 'NÔMADE')}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border transition-colors ${
                                  user.nomadeBadge
                                    ? 'bg-purple-500/30 border-purple-400 text-purple-100'
                                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-purple-200'
                                }`}
                                title="Atribuir ou remover selo NÔMADE (Admin / Presidente)"
                              >
                                {user.nomadeBadge ? '− NÔMADE' : '+ NÔMADE'}
                              </button>
                              <button
                                type="button"
                                disabled={isSavingAdminAction}
                                onClick={() => void handleToggleMemberSeal(user.id, 'O.S.S.O.')}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border transition-colors ${
                                  user.ossoBadge
                                    ? 'bg-amber-500/30 border-amber-400 text-amber-100'
                                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-amber-200'
                                }`}
                                title="Atribuir ou remover selo O.S.S.O. (Admin / Presidente)"
                              >
                                {user.ossoBadge ? '− O.S.S.O.' : '+ O.S.S.O.'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="text-zinc-200 font-medium block">{user.motorcycle || 'Moto não informada'}</span>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[9px] font-bold uppercase text-zinc-200">
                          {user.memberCategory || 'Motociclista'}
                        </span>
                        <span className="text-[10px] text-zinc-500">Sangue: {user.bloodType || 'N/A'}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <span className="text-[11px] text-zinc-200 flex items-center gap-1">
                          <Cake className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>{user.birthDate ? formatBirthdayShort(user.birthDate) : '—'}</span>
                          {isBdayToday && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-400 text-black text-[9px] font-extrabold uppercase">
                              Hoje!
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-zinc-500 shrink-0" />
                          <span>
                            {user.joinedDate
                              ? `Ingresso: ${formatBrDate(user.joinedDate)}`
                              : user.joinedYear
                              ? `Desde ${user.joinedYear}`
                              : '—'}
                          </span>
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        user.role === 'admin'
                          ? 'bg-amber-400 text-black'
                          : user.role === 'board'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {user.role === 'admin' ? 'Admin Geral' : user.role === 'board' ? 'Mesa Diretora' : 'Integrante'}
                      </span>
                      <span className="block text-[10px] text-amber-400 font-semibold mt-1">
                        {getMemberRoleLabel(user, boardRoles)}
                      </span>
                      <span
                        className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                          feeStatusInfo.isExempt
                            ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                            : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                        }`}
                      >
                        {feeStatusInfo.label}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        user.sosApproved
                          ? 'bg-green-950 text-green-300 border border-green-800'
                          : 'bg-red-950 text-red-300 border border-red-800'
                      }`}>
                        {user.sosApproved ? 'SOS Liberado' : 'Sem Acesso'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isActive
                          ? 'bg-green-500/20 text-green-400'
                          : isPending
                          ? 'bg-yellow-500/20 text-yellow-400 animate-pulse'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {isActive ? 'Ativo' : isPending ? 'Pendente' : 'Suspenso'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canOpenFinance && (
                          <button
                            onClick={() => setFinanceMemberModal(user)}
                            className="px-2 py-1.5 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/30 text-[10px] font-bold uppercase flex items-center gap-1 transition-colors"
                            title="Visualizar Pagos, Débitos por Ano/Mês e Comprovantes"
                          >
                            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                            <span className="hidden sm:inline">Financeiro</span>
                          </button>
                        )}

                        {isAdmin && (
                          <>
                            {isPending && (
                              <>
                                <button
                                  onClick={() => void handleApproveMember(user.id)}
                                  className="p-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white"
                                  title="Aprovar Integrante e Liberar SOS"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleOpenLinkModal(user)}
                                  className="px-2 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold uppercase flex items-center gap-1"
                                  title="Associar Conta Google solicitante a um integrante já cadastrado"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                  <span className="hidden lg:inline">Associar</span>
                                </button>
                              </>
                            )}

                            <button
                              onClick={() => handleOpenAppointDirector(user.id)}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-amber-400/20 text-amber-400 transition-colors"
                              title="Nomear como Diretor na Mesa Diretora"
                            >
                              <Award className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleOpenEdit(user)}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white"
                              title="Editar Cadastro do Integrante"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                            </button>

                            {user.role !== 'admin' ? (
                              <button
                                onClick={() => void handlePromoteMemberToAdmin(user.id)}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-amber-400 hover:text-black text-amber-400 transition-colors"
                                title="Promover a Administrador Geral"
                              >
                                <Key className="w-3.5 h-3.5" />
                              </button>
                            ) : user.email?.toLowerCase().trim() !== ADMIN_EMAIL ? (
                              <button
                                onClick={() => handleRevokeAdmin(user.id)}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-950 text-amber-400 hover:text-red-400 transition-colors"
                                title="Revogar Privilégio de Administrador"
                              >
                                <Key className="w-3.5 h-3.5" />
                              </button>
                            ) : null}

                            {user.role !== 'admin' && (
                              <>
                                <button
                                  onClick={() => void handleSuspendMember(user.id)}
                                  className={`p-1.5 rounded-lg text-xs font-semibold ${
                                    isSuspended
                                      ? 'bg-green-900/60 hover:bg-green-800 text-green-200'
                                      : 'bg-zinc-800 hover:bg-yellow-950 text-zinc-400 hover:text-yellow-400'
                                  }`}
                                  title={isSuspended ? 'Reativar integrante' : 'Suspender integrante'}
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => handleDeleteMember(user.id)}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-400"
                                  title="Excluir integrante"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
        </>
      )}

      {/* Add New Member Modal */}
      {isAddingUser && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(4.75rem,calc(env(safe-area-inset-top)+1.5rem))] sm:pt-10 pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg my-auto max-h-[calc(100dvh-6rem)] sm:max-h-[calc(100dvh-4.5rem)] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400 shrink-0" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  Cadastrar Novo Integrante no Clube
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingUser(false)}
                className="p-1 text-zinc-400 hover:text-white shrink-0"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form ref={addUserFormRef} onSubmit={handleCreateUser} className="px-5 sm:px-6 pt-6 pb-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Roberto Andrade"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Apelido (Exibido no Perfil)</label>
                  <input
                    type="text"
                    placeholder="Ex: Estradeiro"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Integrante Menor de Idade + Responsável */}
              <div className="p-3 bg-sky-950/25 border border-sky-500/30 rounded-xl space-y-2.5">
                <label className="flex items-center gap-2 text-xs font-bold text-sky-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMinor}
                    onChange={(e) => setIsMinor(e.target.checked)}
                    className="w-4 h-4 accent-amber-400 rounded"
                  />
                  <span>Integrante Menor de Idade (associar a um integrante responsável)</span>
                </label>

                {isMinor && (
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 uppercase mb-1">
                      Integrante Responsável Legal *
                    </label>
                    <select
                      required
                      value={responsibleMemberId}
                      onChange={(e) => setResponsibleMemberId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="">Selecione o integrante responsável...</option>
                      {users
                        .filter((u) => u.status === 'active' && !u.isMinor)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {getMemberDisplayName(u)} ({u.name})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    E-mail {isMinor ? '(Opcional para menor)' : '*'}
                  </label>
                  <input
                    type="email"
                    required={!isMinor}
                    placeholder={isMinor ? 'Opcional' : 'integrante@oficinadorock.com'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Telefone / WhatsApp {isMinor ? '(Opcional)' : '*'}
                  </label>
                  <input
                    type="text"
                    required={!isMinor}
                    placeholder="(15) 99888-1122"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Motocicleta (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Harley-Davidson Heritage 114"
                    value={motorcycle}
                    onChange={(e) => setMotorcycle(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Tipo Sanguíneo</label>
                  <select
                    value={bloodType}
                    onChange={(e) => setBloodType(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Nível de Acesso</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="member">Integrante Pleno</option>
                    <option value="board">Mesa Diretora</option>
                    <option value="admin">Administrador Geral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Status do Colete</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="active">Ativo (Colete Liberado)</option>
                    <option value="pending">Pendente de Avaliação</option>
                    <option value="suspended">Suspenso</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Contato de Emergência</label>
                  <input
                    type="text"
                    placeholder="Nome e telefone"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center text-[11px] text-zinc-400 leading-snug">
                  A senha pessoal é definida pelo próprio integrante ao solicitar acesso ou redefinir por e-mail. Nenhuma senha é armazenada no aplicativo.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Data de Nascimento (Aniversário)
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Data de Ingresso no Motoclube
                  </label>
                  <input
                    type="date"
                    value={joinedDate}
                    onChange={(e) => {
                      setJoinedDate(e.target.value);
                      const y = parseInt(e.target.value.slice(0, 4), 10);
                      if (!Number.isNaN(y) && y >= 2008) setJoinedYear(y);
                    }}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Ano de Ingresso</label>
                  <input
                    type="number"
                    min="2008"
                    max="2099"
                    value={joinedYear}
                    onChange={(e) => setJoinedYear(Number(e.target.value) || new Date().getFullYear())}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                {(role === 'board' || role === 'admin') && (
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Cargo na Diretoria</label>
                    <select
                      value={boardRoleId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setBoardRoleId(nextId);
                        setCustomRoleTitle('');
                        const nextTitle = boardRoles.find((r) => r.id === nextId)?.title.toLowerCase() || '';
                        if (nextId === 'role-finance' || nextTitle.includes('financeir')) {
                          setCanEditFinances(true);
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="">Sem cargo específico</option>
                      {boardRoles.map((br) => (
                        <option key={br.id} value={br.id}>
                          {br.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Cargo Exibido no Perfil (Opcional · Automático se vazio)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={customRoleTitle}
                  onChange={(e) => setCustomRoleTitle(e.target.value)}
                  placeholder={`Automático: ${getMemberRoleLabel(
                    { email, role, boardRoleId: boardRoleId || undefined },
                    boardRoles
                  )}`}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Categoria do Integrante</label>
                  <select
                    value={memberCategory}
                    onChange={(e) => setMemberCategory(e.target.value as MemberCategory)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    {MEMBER_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Selos de Identificação</label>
                  <div className="flex items-center gap-4 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-purple-200 font-bold">
                      <input
                        type="checkbox"
                        checked={nomadeBadge}
                        onChange={(e) => setNomadeBadge(e.target.checked)}
                        className="w-4 h-4 accent-purple-400 rounded"
                      />
                      <span>NÔMADE</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-amber-200 font-bold">
                      <input
                        type="checkbox"
                        checked={ossoBadge}
                        onChange={(e) => setOssoBadge(e.target.checked)}
                        className="w-4 h-4 accent-amber-400 rounded"
                      />
                      <span>O.S.S.O.</span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1.5">Foto do Perfil (Smartphone / Google Fotos)</label>
                <div className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                  <img
                    src={avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80'}
                    alt="Prévia do perfil"
                    className="w-12 h-12 rounded-full object-cover border border-amber-400/50 shrink-0"
                  />
                  <div className="flex-1 flex flex-wrap gap-2">
                    <PhotoSourcePicker
                      onSelectFiles={handleDevicePhotoFiles}
                      disabled={isUploadingPhoto}
                      title="Foto do Perfil"
                    >
                      <div className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black text-[11px] font-bold uppercase rounded-lg flex items-center gap-1.5 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingPhoto ? 'Otimizando...' : 'Galeria / Google Fotos'}</span>
                      </div>
                    </PhotoSourcePicker>
                  </div>
                </div>
                {uploadError && (
                  <p className="text-[11px] text-red-400 font-semibold mt-1">{uploadError}</p>
                )}
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="addSosApproved"
                    checked={sosApproved}
                    onChange={(e) => setSosApproved(e.target.checked)}
                    className="w-4 h-4 accent-amber-400 rounded"
                  />
                  <label htmlFor="addSosApproved" className="text-xs font-semibold text-zinc-200 cursor-pointer">
                    Liberar Acesso Imediato ao Sistema de SOS na Estrada
                  </label>
                </div>

                {role === 'board' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="addCanEditFinances"
                      checked={canEditFinances}
                      onChange={(e) => setCanEditFinances(e.target.checked)}
                      className="w-4 h-4 accent-amber-400 rounded"
                    />
                    <label htmlFor="addCanEditFinances" className="text-xs font-semibold text-amber-300 cursor-pointer">
                      Autorizar Edição Financeira (Diretor Financeiro)
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  disabled={isSavingAdminAction}
                  onClick={() => setIsAddingUser(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingAdminAction}
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black rounded-lg text-xs font-bold uppercase font-rock"
                >
                  {isSavingAdminAction ? 'Salvando no Servidor...' : 'Salvar e Ativar Integrante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(4.75rem,calc(env(safe-area-inset-top)+1.5rem))] sm:pt-10 pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div key={editingUser.id} className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg my-auto max-h-[calc(100dvh-6rem)] sm:max-h-[calc(100dvh-4.5rem)] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400 shrink-0" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  Editar Cadastro do Integrante
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 text-zinc-400 hover:text-white shrink-0"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form ref={editUserFormRef} onSubmit={handleSaveUser} className="px-5 sm:px-6 pt-6 pb-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Apelido (Exibido no Perfil)</label>
                  <input
                    type="text"
                    placeholder="Ex: Caveira"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Integrante Menor de Idade + Responsável */}
              <div className="p-3 bg-sky-950/25 border border-sky-500/30 rounded-xl space-y-2.5">
                <label className="flex items-center gap-2 text-xs font-bold text-sky-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMinor}
                    onChange={(e) => setIsMinor(e.target.checked)}
                    className="w-4 h-4 accent-amber-400 rounded"
                  />
                  <span>Integrante Menor de Idade (associar a um integrante responsável)</span>
                </label>

                {isMinor && (
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 uppercase mb-1">
                      Integrante Responsável Legal *
                    </label>
                    <select
                      required
                      value={responsibleMemberId}
                      onChange={(e) => setResponsibleMemberId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="">Selecione o integrante responsável...</option>
                      {users
                        .filter((u) => u.status === 'active' && !u.isMinor && u.id !== editingUser.id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {getMemberDisplayName(u)} ({u.name})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    E-mail {isMinor ? '(Opcional para menor)' : '*'}
                  </label>
                  <input
                    type="email"
                    required={!isMinor}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Telefone / WhatsApp {isMinor ? '(Opcional)' : ''}
                  </label>
                  <input
                    type="text"
                    required={!isMinor}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Motocicleta (Opcional)</label>
                  <input
                    type="text"
                    value={motorcycle}
                    onChange={(e) => setMotorcycle(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Tipo Sanguíneo</label>
                  <select
                    value={bloodType}
                    onChange={(e) => setBloodType(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Nível de Acesso</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="member">Integrante Pleno</option>
                    <option value="board">Mesa Diretora</option>
                    <option value="admin">Administrador Geral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Status da Conta</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="active">Ativo</option>
                    <option value="pending">Pendente de Avaliação</option>
                    <option value="suspended">Suspenso</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Contato de Emergência</label>
                  <input
                    type="text"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="Nome e telefone"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Redefinição de Senha</label>
                  <button
                    type="button"
                    disabled={resetEmailSending || !email.trim()}
                    onClick={async () => {
                      setResetEmailSending(true);
                      setResetEmailFeedback('');
                      try {
                        await sendPasswordResetClean(email);
                        setResetEmailFeedback(`Link enviado para ${email.trim()}.`);
                        playSound('success');
                      } catch (err) {
                        setResetEmailFeedback(formatAuthError(err));
                        playSound('beep');
                      } finally {
                        setResetEmailSending(false);
                      }
                    }}
                    className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 border border-amber-400/40 rounded-lg px-3 py-2 text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {resetEmailSending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Mail className="w-3.5 h-3.5" />
                    )}
                    <span>Enviar E-mail de Redefinição</span>
                  </button>
                  {resetEmailFeedback && (
                    <span className="block text-[10px] text-amber-300 mt-1">{resetEmailFeedback}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Data de Nascimento (Aniversário)
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Data de Ingresso no Motoclube
                  </label>
                  <input
                    type="date"
                    value={joinedDate}
                    onChange={(e) => {
                      setJoinedDate(e.target.value);
                      const y = parseInt(e.target.value.slice(0, 4), 10);
                      if (!Number.isNaN(y) && y >= 2008) setJoinedYear(y);
                    }}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Ano de Ingresso</label>
                  <input
                    type="number"
                    min="2008"
                    max="2099"
                    value={joinedYear}
                    onChange={(e) => setJoinedYear(Number(e.target.value) || new Date().getFullYear())}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                {(role === 'board' || role === 'admin') && (
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Cargo na Diretoria</label>
                    <select
                      value={boardRoleId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setBoardRoleId(nextId);
                        setCustomRoleTitle('');
                        const nextTitle = boardRoles.find((r) => r.id === nextId)?.title.toLowerCase() || '';
                        if (nextId === 'role-finance' || nextTitle.includes('financeir')) {
                          setCanEditFinances(true);
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="">Sem cargo específico</option>
                      {boardRoles.map((br) => (
                        <option key={br.id} value={br.id}>
                          {br.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Cargo Exibido no Perfil (Opcional · Automático se vazio)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={customRoleTitle}
                  onChange={(e) => setCustomRoleTitle(e.target.value)}
                  placeholder={`Automático: ${getMemberRoleLabel(
                    { email, role, boardRoleId: boardRoleId || undefined },
                    boardRoles
                  )}`}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Categoria do Integrante</label>
                  <select
                    value={memberCategory}
                    onChange={(e) => setMemberCategory(e.target.value as MemberCategory)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    {MEMBER_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Selos de Identificação</label>
                  <div className="flex items-center gap-4 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-purple-200 font-bold">
                      <input
                        type="checkbox"
                        checked={nomadeBadge}
                        onChange={(e) => setNomadeBadge(e.target.checked)}
                        className="w-4 h-4 accent-purple-400 rounded"
                      />
                      <span>NÔMADE</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-amber-200 font-bold">
                      <input
                        type="checkbox"
                        checked={ossoBadge}
                        onChange={(e) => setOssoBadge(e.target.checked)}
                        className="w-4 h-4 accent-amber-400 rounded"
                      />
                      <span>O.S.S.O.</span>
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1.5">Foto de Perfil (Smartphone / Google Fotos)</label>
                <div className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl mb-2">
                  <img
                    src={avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80'}
                    alt="Prévia do perfil"
                    className="w-12 h-12 rounded-full object-cover border border-amber-400/50 shrink-0"
                  />
                  <div className="flex-1 flex flex-wrap gap-2">
                    <PhotoSourcePicker
                      onSelectFiles={handleDevicePhotoFiles}
                      disabled={isUploadingPhoto}
                      title="Foto do Perfil"
                    >
                      <div className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black text-[11px] font-bold uppercase rounded-lg flex items-center gap-1.5 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingPhoto ? 'Otimizando...' : 'Galeria / Google Fotos'}</span>
                      </div>
                    </PhotoSourcePicker>
                  </div>
                </div>
                {uploadError && (
                  <p className="text-[11px] text-red-400 font-semibold mt-1">{uploadError}</p>
                )}
                <input
                  type="text"
                  placeholder="Ou cole a URL da imagem..."
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-xs text-zinc-300 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sosModalApproved"
                    checked={sosApproved}
                    onChange={(e) => setSosApproved(e.target.checked)}
                    className="w-4 h-4 accent-amber-400 rounded"
                  />
                  <label htmlFor="sosModalApproved" className="text-xs font-semibold text-zinc-200 cursor-pointer">
                    Liberar Acesso ao Sistema de Notificações SOS na Estrada
                  </label>
                </div>

                {role === 'board' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="editCanEditFinances"
                      checked={canEditFinances}
                      onChange={(e) => setCanEditFinances(e.target.checked)}
                      className="w-4 h-4 accent-amber-400 rounded"
                    />
                    <label htmlFor="editCanEditFinances" className="text-xs font-semibold text-amber-300 cursor-pointer">
                      Autorizar Edição na Área Financeira (Diretor Financeiro)
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  disabled={isSavingAdminAction}
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingAdminAction}
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black rounded-lg text-xs font-bold uppercase font-rock"
                >
                  {isSavingAdminAction ? 'Sincronizando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nomear Integrante como Diretor */}
      {isAppointDirectorModal && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg p-6 space-y-5 my-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  Nomear Integrante como Diretor
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAppointDirectorModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAppointDirector} className="space-y-4 text-xs">
              <p className="text-zinc-300 leading-relaxed">
                Selecione o integrante e o cargo da diretoria. O cargo, a foto e o apelido aparecerão automaticamente na{' '}
                <strong className="text-amber-400">Composição da Mesa Diretora</strong> na página inicial.
              </p>

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Integrante do Clube *
                </label>
                <select
                  required
                  value={appointMemberId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setAppointMemberId(id);
                    const m = users.find((u) => u.id === id);
                    if (m?.boardRoleId && boardRoles.some((r) => r.id === m.boardRoleId)) {
                      setAppointRoleId(m.boardRoleId);
                      setAppointMode('existing');
                    }
                    setAppointCanEditFinances(
                      Boolean(m?.canEditFinances || m?.boardRoleId === 'role-finance')
                    );
                  }}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="">Selecione um integrante...</option>
                  {users
                    .filter((u) => u.status !== 'suspended')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {getMemberDisplayName(u)}{u.motorcycle ? ` (${u.motorcycle})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <span className="block font-bold text-zinc-300 uppercase">
                  Cargo na Mesa Diretora *
                </span>
                <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 gap-1">
                  <button
                    type="button"
                    onClick={() => setAppointMode('existing')}
                    className={`flex-1 py-1.5 rounded text-[11px] font-bold uppercase transition-colors ${
                      appointMode === 'existing'
                        ? 'bg-amber-400 text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Cargo Existente
                  </button>
                  <button
                    type="button"
                    onClick={() => setAppointMode('custom')}
                    className={`flex-1 py-1.5 rounded text-[11px] font-bold uppercase transition-colors ${
                      appointMode === 'custom'
                        ? 'bg-amber-400 text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Criar Novo Cargo
                  </button>
                </div>

                {appointMode === 'existing' ? (
                  <select
                    required
                    value={appointRoleId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setAppointRoleId(nextId);
                      if (nextId === 'role-finance') {
                        setAppointCanEditFinances(true);
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="">Selecione o cargo da diretoria...</option>
                    {boardRoles.map((br) => (
                      <option key={br.id} value={br.id}>
                        {br.title} (Atual: {br.holderName})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="Ex: Diretor de Eventos / Capitão de Comboio"
                    value={appointCustomTitle}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAppointCustomTitle(val);
                      if (val.toLowerCase().includes('financeir')) {
                        setAppointCanEditFinances(true);
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="appointCanEditFinances"
                  checked={appointCanEditFinances}
                  onChange={(e) => setAppointCanEditFinances(e.target.checked)}
                  className="w-4 h-4 accent-amber-400 rounded"
                />
                <label
                  htmlFor="appointCanEditFinances"
                  className="text-xs font-semibold text-amber-300 cursor-pointer"
                >
                  Autorizar Edição Financeira (Diretor Financeiro)
                </label>
              </div>

              {/* Live Home Page Preview */}
              {(() => {
                const previewMember = users.find((u) => u.id === appointMemberId);
                const previewTitle =
                  appointMode === 'custom'
                    ? appointCustomTitle.trim() || 'Novo Cargo'
                    : boardRoles.find((r) => r.id === appointRoleId)?.title || 'Cargo da Diretoria';

                if (!previewMember) return null;

                return (
                  <div className="p-3.5 bg-zinc-950/90 border border-amber-400/30 rounded-xl space-y-2">
                    <span className="text-[10px] font-bold uppercase text-zinc-400 block">
                      Prévia na Página Inicial (Mesa Diretora)
                    </span>
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          previewMember.avatarUrl ||
                          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80'
                        }
                        alt={getMemberDisplayName(previewMember)}
                        className="w-12 h-12 rounded-full object-cover border border-amber-400/60 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                          {previewTitle}
                        </span>
                        <span className="text-sm font-semibold text-white block truncate">
                          {getMemberDisplayName(previewMember)}
                        </span>
                        <span className="text-[11px] text-zinc-400 block truncate">
                          {previewMember.motorcycle || 'Sem motocicleta informada'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAppointDirectorModal(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!appointMemberId || (appointMode === 'custom' ? !appointCustomTitle.trim() : !appointRoleId)}
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black rounded-lg text-xs font-bold uppercase font-rock flex items-center gap-1.5"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Confirmar Nomeação</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nomear Novo Administrador Geral */}
      {isAddingAdminModal && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg p-6 space-y-5 my-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  Nomear Novo Administrador Geral
                </h3>
              </div>
              <button onClick={() => setIsAddingAdminModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-zinc-300">
                O Administrador Geral titular (<span className="text-amber-400 font-mono">eliezerrmartins@gmail.com</span>) pode conceder privilégios administrativos completos a outros irmãos do motoclube ou cadastrar um novo administrador.
              </p>

              <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
                <label className="block font-bold text-amber-400 uppercase">
                  Opção 1: Promover Integrante Cadastrado
                </label>
                <select
                  value={selectedMemberToPromote}
                  onChange={(e) => setSelectedMemberToPromote(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="">Selecione um integrante para promover a Admin...</option>
                  {users.filter(u => u.role !== 'admin').map(u => (
                    <option key={u.id} value={u.id}>
                      {getMemberDisplayName(u)}{u.motorcycle ? ` (${u.motorcycle})` : ''} - {u.email}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!selectedMemberToPromote}
                  onClick={() => handlePromoteMemberToAdmin(selectedMemberToPromote)}
                  className="w-full py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-rock font-bold uppercase rounded-lg transition-colors"
                >
                  Confirmar Promoção para Administrador
                </button>
              </div>

              <div className="text-center text-zinc-500 font-semibold uppercase text-[10px]">
                — OU —
              </div>

              <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-2">
                <span className="block font-bold text-zinc-300 uppercase">
                  Opção 2: Cadastrar Novo Administrador do Zero
                </span>
                <p className="text-zinc-400 text-[11px]">
                  Abra o formulário de cadastro com permissão administrativa já pré-selecionada.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingAdminModal(false);
                    handleOpenAdd();
                    setRole('admin');
                  }}
                  className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-rock font-bold uppercase rounded-lg border border-zinc-700 transition-colors"
                >
                  Cadastrar Novo Perfil de Administrador
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Dossiê Financeiro por Ano/Mês & Comprovantes do Integrante */}
      {financeMemberModal && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-4xl p-6 space-y-5 my-auto shadow-2xl">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFinanceMemberModal(null)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-zinc-700 text-xs font-bold uppercase flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar</span>
                </button>
                <img
                  src={financeMemberModal.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80'}
                  alt={getMemberDisplayName(financeMemberModal)}
                  className="w-11 h-11 rounded-full object-cover border-2 border-amber-400 shrink-0"
                />
                <div>
                  <h3 className="font-rock text-lg sm:text-xl font-bold uppercase text-white">
                    {getMemberDisplayName(financeMemberModal)}
                  </h3>
                  <span className="text-[11px] text-zinc-400 block">
                    {financeMemberModal.motorcycle || 'Moto não informada'}
                    {financeMemberModal.birthDate
                      ? ` · Aniversário: ${formatBirthdayShort(financeMemberModal.birthDate)}`
                      : ''}
                    {financeMemberModal.joinedDate
                      ? ` · Ingresso: ${formatBrDate(financeMemberModal.joinedDate)}`
                      : financeMemberModal.joinedYear
                      ? ` · Desde ${financeMemberModal.joinedYear}`
                      : ''}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFinanceMemberModal(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <MemberYearlyFinancePanel
              member={financeMemberModal}
              fees={fees}
              tabs={tabs}
              clubInfo={clubInfo}
              canEdit={canEditAnyFinances}
              currentUser={currentUser}
              financialNotes={financialNotes}
              allUsers={users}
              allowMemberReceiptUpload={
                canEditAnyFinances || financeMemberModal.id === currentUser.id
              }
              onUpdateFees={onUpdateFees}
              onUpdateTabs={onUpdateTabs}
              onUpdateClubInfo={onUpdateClubInfo}
              onUpdateFinancialNotes={onUpdateFinancialNotes}
              onUpdateUsers={onUpdateUsers}
            />
          </div>
        </div>
      )}

      {/* Modal: Associar Solicitação Google Pendente -> Cadastro Pré-Registrado */}
      {linkingPendingUser && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-sky-400/40 rounded-2xl w-full max-w-lg p-6 space-y-4 my-auto shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-sky-400" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  Associar Solicitação a Cadastro Existente
                </h3>
              </div>
              <button
                type="button"
                disabled={isLinkingMember}
                onClick={() => setLinkingPendingUser(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1">
              <span className="text-[10px] font-bold uppercase text-amber-400 block">
                Solicitação de Ingresso Pendente
              </span>
              <p className="text-sm font-bold text-white">
                {getMemberDisplayName(linkingPendingUser)} ({linkingPendingUser.name})
              </p>
              <p className="text-zinc-400 font-mono">{linkingPendingUser.email}</p>
            </div>

            <div className="space-y-2">
              <label className="block font-bold text-zinc-300 uppercase">
                Buscar Integrante Pré-Cadastrado *
              </label>
              <input
                type="text"
                placeholder="Digite nome, apelido ou e-mail do cadastro existente..."
                value={linkSearchTerm}
                onChange={(e) => setLinkSearchTerm(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-400"
              />

              <div className="max-h-56 overflow-y-auto space-y-1.5 border border-zinc-800 rounded-xl p-2 bg-zinc-950">
                {users
                  .filter((u) => {
                    if (u.id === linkingPendingUser.id) return false;
                    const q = linkSearchTerm.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      u.name.toLowerCase().includes(q) ||
                      (u.nickname || '').toLowerCase().includes(q) ||
                      (u.email || '').toLowerCase().includes(q)
                    );
                  })
                  .map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setLinkTargetMemberId(candidate.id)}
                      className={`w-full text-left p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                        linkTargetMemberId === candidate.id
                          ? 'bg-sky-500/20 border-sky-400 text-white'
                          : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="font-bold block truncate">
                          {getMemberDisplayName(candidate)} ({candidate.name})
                        </span>
                        <span className="text-[10px] text-zinc-400 block truncate">
                          {candidate.email || 'Sem e-mail'} · {candidate.role.toUpperCase()} · {candidate.status.toUpperCase()}
                        </span>
                      </div>
                      {linkTargetMemberId === candidate.id && (
                        <Check className="w-4 h-4 text-sky-400 shrink-0" />
                      )}
                    </button>
                  ))}
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Ao confirmar, a conta solicitante (<strong className="text-zinc-200">{linkingPendingUser.email}</strong>) será vinculada definitivamente ao cadastro selecionado, ativando o acesso e preservando UID, histórico financeiro e cargos existentes.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                disabled={isLinkingMember}
                onClick={() => setLinkingPendingUser(null)}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!linkTargetMemberId || isLinkingMember}
                onClick={handleConfirmLinkGoogleRequest}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-rock font-bold uppercase rounded-lg flex items-center gap-1.5"
              >
                {isLinkingMember ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Associando...</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Associar e Ativar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Action Modal */}
      {confirmModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121216] border border-red-500/40 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="font-rock text-lg font-bold uppercase text-white">
              {confirmModal.title}
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">{confirmModal.message}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
