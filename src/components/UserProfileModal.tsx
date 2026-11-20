import { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  User as UserIcon,
  Camera,
  Upload,
  DollarSign,
  QrCode,
  Copy,
  Check,
  AlertCircle,
  BellRing,
  X,
  LogOut,
  CheckCircle2,
  Save,
  ArrowLeft,
  ArrowDown,
  Cake,
  Loader2,
  ShieldCheck,
  Edit3,
  RotateCcw,
  KeyRound,
  Eye,
  EyeOff,
  MailCheck,
  ExternalLink,
  Award,
} from 'lucide-react';
import {
  User,
  UserRole,
  MemberCategory,
  MEMBER_CATEGORIES,
  MemberBadgeAuditEntry,
  MemberMonthlyFee,
  MemberTabDebt,
  MemberFinancialNote,
  FeeRateScheduleEntry,
  ClubInfo,
  BoardRoleConfig,
  getMemberDisplayName,
  getMemberRoleLabel,
  reconcileBoardRolesWithUsers,
} from '../types';
import { generatePixPayload, formatPixRecipientCnpj } from '../services/pix';
import { StorageService, playSound } from '../services/storage';
import { compressImageFile } from '../services/imageUtils';
import {
  buildAutoMemberMonthlyFees,
  classifyMonthlyFee,
  getMemberAccessBadges,
  hasExplicitManualPagante,
  isMemberCurrentlyMinor,
  isTabWrittenOff,
  resolveMemberFeeStatusInfo,
  getBrazilTodayIso,
} from '../services/financeSchedule';
import {
  auth,
  FIREBASE_PROJECT_ID,
  FIREBASE_AUTH_PROVIDERS_URL,
  getAuthProviderStatus,
  linkPasswordToCurrentUser,
  changeCurrentUserPassword,
  sendPasswordResetClean,
  validatePasswordInput,
  formatAuthError,
  isOperationNotAllowedError,
  consumePendingReauthForPasswordLink,
} from '../services/firebase';
import MemberYearlyFinancePanel from './MemberYearlyFinancePanel';
import { PhotoSourcePicker } from './PhotoSourcePicker';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  users: User[];
  boardRoles?: BoardRoleConfig[];
  fees: MemberMonthlyFee[];
  tabs: MemberTabDebt[];
  feeSchedules?: FeeRateScheduleEntry[];
  financialNotes?: MemberFinancialNote[];
  clubInfo: ClubInfo;
  onUpdateCurrentUser: (user: User) => void;
  onUpdateUsers: (users: User[]) => void;
  onUpdateBoardRoles?: (roles: BoardRoleConfig[]) => void;
  onUpdateFees: (fees: MemberMonthlyFee[]) => void;
  onUpdateTabs: (tabs: MemberTabDebt[]) => void;
  onUpdateFinancialNotes?: (notes: MemberFinancialNote[]) => void;
  onUpdateClubInfo?: (info: ClubInfo) => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export default function UserProfileModal({
  isOpen,
  onClose,
  currentUser,
  users,
  boardRoles = [],
  fees,
  tabs,
  feeSchedules = [],
  financialNotes = [],
  clubInfo,
  onUpdateCurrentUser,
  onUpdateUsers,
  onUpdateBoardRoles,
  onUpdateFees,
  onUpdateTabs,
  onUpdateFinancialNotes,
  onUpdateClubInfo,
  onOpenAuth,
  onLogout,
}: UserProfileModalProps) {
  const personalSectionRef = useRef<HTMLDivElement>(null);
  const financeSectionRef = useRef<HTMLDivElement>(null);
  const triggeredDebtAlertForOpenRef = useRef(false);

  const isAdminUser = Boolean(
    currentUser &&
      (currentUser.role === 'admin' ||
        currentUser.email?.toLowerCase() === 'eliezerrmartins@gmail.com')
  );

  const isActivePresidente = Boolean(
    currentUser &&
      currentUser.status === 'active' &&
      currentUser.boardRoleId === 'role-pres'
  );
  const canManageSeals = isAdminUser || isActivePresidente;

  // Admin can choose any member profile to inspect & edit all fields
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser?.id || '');
  const targetUser: User | null = currentUser
    ? isAdminUser
      ? users.find((u) => u.id === selectedUserId) || currentUser
      : currentUser
    : null;

  // Profile Edit State
  const [name, setName] = useState(targetUser?.name || '');
  const [nickname, setNickname] = useState(targetUser?.nickname || '');
  const [email, setEmail] = useState(targetUser?.email || '');
  const [phone, setPhone] = useState(targetUser?.phone || '');
  const [motorcycle, setMotorcycle] = useState(targetUser?.motorcycle || '');
  const [bloodType, setBloodType] = useState(targetUser?.bloodType || 'O+');
  const [emergencyContact, setEmergencyContact] = useState(targetUser?.emergencyContact || '');
  const [birthDate, setBirthDate] = useState(targetUser?.birthDate || '');
  const [joinedDate, setJoinedDate] = useState(
    targetUser?.joinedDate || (targetUser?.joinedYear ? `${targetUser.joinedYear}-01-01` : '')
  );
  const [joinedYear, setJoinedYear] = useState<number>(
    targetUser?.joinedYear || new Date().getFullYear()
  );
  const [avatarUrl, setAvatarUrl] = useState(targetUser?.avatarUrl || '');
  const [role, setRole] = useState<UserRole>(targetUser?.role || 'member');
  const [status, setStatus] = useState<'active' | 'pending' | 'suspended'>(
    targetUser?.status || 'active'
  );
  const [sosApproved, setSosApproved] = useState<boolean>(Boolean(targetUser?.sosApproved));
  const [canEditFinances, setCanEditFinances] = useState<boolean>(
    Boolean(targetUser?.canEditFinances)
  );
  const [boardRoleId, setBoardRoleId] = useState<string>(targetUser?.boardRoleId || '');
  const [customRoleTitle, setCustomRoleTitle] = useState<string>(
    targetUser?.customRoleTitle || ''
  );
  const [memberCategory, setMemberCategory] = useState<MemberCategory>(
    targetUser?.memberCategory || 'Motociclista'
  );
  const [nomadeBadge, setNomadeBadge] = useState<boolean>(Boolean(targetUser?.nomadeBadge));
  const [ossoBadge, setOssoBadge] = useState<boolean>(Boolean(targetUser?.ossoBadge));
  const [isEditingInlineCargo, setIsEditingInlineCargo] = useState(false);
  const [inlineBoardRoleDraft, setInlineBoardRoleDraft] = useState<string>(
    targetUser?.boardRoleId || ''
  );
  const [inlineCustomCargoDraft, setInlineCustomCargoDraft] = useState<string>(
    targetUser?.customRoleTitle || ''
  );
  const [inlineCargoSavedNotice, setInlineCargoSavedNotice] = useState(false);
  const [isMinor, setIsMinor] = useState<boolean>(Boolean(targetUser?.isMinor));
  const [responsibleMemberId, setResponsibleMemberId] = useState<string>(
    targetUser?.responsibleMemberId || ''
  );
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  // Save & photo feedback state
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [profileSavedFeedback, setProfileSavedFeedback] = useState(false);
  const [photoSavedFeedback, setPhotoSavedFeedback] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState('');
  const [debtNotificationDismissed, setDebtNotificationDismissed] = useState(false);
  const [showDebtOpenPopup, setShowDebtOpenPopup] = useState(false);

  // Pix Payment Drawer / Modal
  const [pixPaymentData, setPixPaymentData] = useState<{
    title: string;
    baseAmount: number;
    amount: number;
    installments: number;
    txIdBase: string;
    description: string;
    payload: string;
    qrCodeUrl: string;
  } | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState('');

  // Account Security & Password State
  const [secCurrentPass, setSecCurrentPass] = useState('');
  const [secNewPass, setSecNewPass] = useState('');
  const [secConfirmPass, setSecConfirmPass] = useState('');
  const [showSecPasswords, setShowSecPasswords] = useState(false);
  const [isSavingSecPass, setIsSavingSecPass] = useState(false);
  const [secPassError, setSecPassError] = useState('');
  const [secPassSuccess, setSecPassSuccess] = useState('');
  const [isProviderDisabledError, setIsProviderDisabledError] = useState(false);
  const [, setProviderRefreshTick] = useState(0);

  const hiddenYearsSet = new Set(clubInfo.hiddenFinancialYears || []);

  const todayIso = getBrazilTodayIso();
  const ownIsMinorExempt = Boolean(
    currentUser &&
      isMemberCurrentlyMinor(currentUser, todayIso) &&
      !hasExplicitManualPagante(currentUser)
  );
  const targetFeeStatusInfo = resolveMemberFeeStatusInfo(targetUser, todayIso);
  const targetIsMinorExempt = Boolean(
    targetUser &&
      isMemberCurrentlyMinor(targetUser, todayIso) &&
      !hasExplicitManualPagante(targetUser)
  );

  // Own financial dossier (for automatic pending debt popup when opening profile)
  const ownFees = currentUser
    ? currentUser.status === 'active'
      ? buildAutoMemberMonthlyFees(currentUser, fees, clubInfo, { feeSchedules }).filter(
          (f) => !(f.isAutoGenerated && hiddenYearsSet.has(f.yearNumber))
        )
      : fees.filter((f) => f.memberId === currentUser.id)
    : [];
  const ownTabs = currentUser ? tabs.filter((t) => t.memberId === currentUser.id) : [];
  const ownPendingFees = ownIsMinorExempt
    ? []
    : ownFees.filter((f) => classifyMonthlyFee(f, currentUser, todayIso).isDebt);
  const ownPendingTabs = ownIsMinorExempt
    ? []
    : ownTabs.filter((t) => !isTabWrittenOff(t) && t.status === 'pending');
  const ownTotalPendingFees = ownPendingFees.reduce((acc, f) => acc + f.amount, 0);
  const ownTotalPendingTabs = ownPendingTabs.reduce((acc, t) => acc + t.amount, 0);
  const ownTotalDebt = ownIsMinorExempt ? 0 : ownTotalPendingFees + ownTotalPendingTabs;

  // Target member financial dossier (self, or selected member when admin switches target)
  const myFees = targetUser
    ? targetUser.status === 'active'
      ? buildAutoMemberMonthlyFees(targetUser, fees, clubInfo, { feeSchedules }).filter(
          (f) => !(f.isAutoGenerated && hiddenYearsSet.has(f.yearNumber))
        )
      : fees.filter((f) => f.memberId === targetUser.id)
    : [];
  const myTabs = targetUser ? tabs.filter((t) => t.memberId === targetUser.id) : [];

  const pendingFees = targetIsMinorExempt
    ? []
    : myFees.filter((f) => classifyMonthlyFee(f, targetUser, todayIso).isDebt);
  const paidFees = myFees.filter((f) => classifyMonthlyFee(f, targetUser, todayIso).countsAsRevenue);

  const pendingTabs = targetIsMinorExempt
    ? []
    : myTabs.filter((t) => !isTabWrittenOff(t) && t.status === 'pending');
  const paidTabs = myTabs.filter((t) => !isTabWrittenOff(t) && t.status === 'paid');

  const totalPendingFees = pendingFees.reduce((acc, f) => acc + f.amount, 0);
  const totalPendingTabs = pendingTabs.reduce((acc, t) => acc + t.amount, 0);
  const totalDebt = targetIsMinorExempt ? 0 : totalPendingFees + totalPendingTabs;
  const totalPaid =
    paidFees.reduce((acc, f) => acc + f.amount, 0) +
    paidTabs.reduce((acc, t) => acc + t.amount, 0);

  // Reset selected profile to self when modal opens
  useEffect(() => {
    if (isOpen && currentUser) {
      setSelectedUserId(currentUser.id);
    }
  }, [isOpen, currentUser?.id]);

  useEffect(() => {
    if (targetUser && isOpen) {
      setName(targetUser.name || '');
      setNickname(targetUser.nickname || '');
      setEmail(targetUser.email || '');
      setPhone(targetUser.phone || '');
      setMotorcycle(targetUser.motorcycle || '');
      setBloodType(targetUser.bloodType || 'O+');
      setEmergencyContact(targetUser.emergencyContact || '');
      setBirthDate(targetUser.birthDate || '');
      setJoinedDate(
        targetUser.joinedDate || (targetUser.joinedYear ? `${targetUser.joinedYear}-01-01` : '')
      );
      setJoinedYear(targetUser.joinedYear || new Date().getFullYear());
      setAvatarUrl(targetUser.avatarUrl || '');
      setRole(targetUser.role || 'member');
      setStatus(targetUser.status || 'active');
      setSosApproved(Boolean(targetUser.sosApproved));
      setCanEditFinances(Boolean(targetUser.canEditFinances));
      setBoardRoleId(targetUser.boardRoleId || '');
      setCustomRoleTitle(targetUser.customRoleTitle || '');
      setMemberCategory(targetUser.memberCategory || 'Motociclista');
      setNomadeBadge(Boolean(targetUser.nomadeBadge));
      setOssoBadge(Boolean(targetUser.ossoBadge));
      setIsEditingInlineCargo(false);
      setInlineBoardRoleDraft(targetUser.boardRoleId || '');
      setInlineCustomCargoDraft(targetUser.customRoleTitle || '');
      setInlineCargoSavedNotice(false);
      setIsMinor(Boolean(targetUser.isMinor));
      setResponsibleMemberId(targetUser.responsibleMemberId || '');
      setAvatarLoadError(false);
      setPhotoUploadError('');
      setPhotoSavedFeedback('');
      setProfileSaveError('');
      setProfileSavedFeedback(false);
      setPixPaymentData(null);
      setSecCurrentPass('');
      setSecNewPass('');
      setSecConfirmPass('');
      setSecPassError('');
      setIsProviderDisabledError(false);
      setSecPassSuccess(
        consumePendingReauthForPasswordLink()
          ? 'Sessão Google confirmada! Digite e confirme sua nova senha abaixo para concluir o vínculo.'
          : ''
      );
    }
  }, [targetUser, isOpen]);

  const targetIsMinor = targetIsMinorExempt;

  // Always show pending debt message & popup every time the member opens their profile
  useEffect(() => {
    if (!isOpen) {
      triggeredDebtAlertForOpenRef.current = false;
      setShowDebtOpenPopup(false);
      return;
    }
    if (ownTotalDebt > 0 && !triggeredDebtAlertForOpenRef.current) {
      triggeredDebtAlertForOpenRef.current = true;
      setDebtNotificationDismissed(false);
      setShowDebtOpenPopup(true);
      playSound('beep');
    }
  }, [isOpen, ownTotalDebt]);

  if (!isOpen || !currentUser || !targetUser) return null;

  const persistUpdatedUser = async (updatedUser: User) => {
    const canSyncBoard =
      currentUser.role === 'admin' ||
      currentUser.email?.toLowerCase().trim() === 'eliezerrmartins@gmail.com';

    const previousUser = users.find((u) => u.id === updatedUser.id) || targetUser;

    const updatedList = users.some((u) => u.id === updatedUser.id)
      ? users.map((u) => {
          if (u.id === updatedUser.id) return updatedUser;
          if (
            canSyncBoard &&
            updatedUser.boardRoleId &&
            updatedUser.status === 'active' &&
            u.boardRoleId === updatedUser.boardRoleId
          ) {
            return { ...u, boardRoleId: undefined };
          }
          return u;
        })
      : [updatedUser, ...users];

    await StorageService.saveUsersConfirmed(updatedList);
    onUpdateUsers(updatedList);

    if (updatedUser.id === currentUser.id) {
      onUpdateCurrentUser(updatedUser);
      StorageService.setCurrentUser(updatedUser);
    }

    if (canSyncBoard && boardRoles.length > 0) {
      const vacatedRoleIds: string[] = [];
      if (
        previousUser?.boardRoleId &&
        (updatedUser.boardRoleId !== previousUser.boardRoleId || updatedUser.status !== 'active')
      ) {
        vacatedRoleIds.push(previousUser.boardRoleId);
      }

      const reconciled = reconcileBoardRolesWithUsers(boardRoles, updatedList, {
        vacatedRoleIds,
      });
      if (JSON.stringify(reconciled) !== JSON.stringify(boardRoles)) {
        await StorageService.saveBoardRolesConfirmed(reconciled);
        onUpdateBoardRoles?.(reconciled);
      }
    }
  };

  // Handle Photo Upload from Smartphone Gallery or Google Photos
  const handleDevicePhotoFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setPhotoUploadError('');
    setPhotoSavedFeedback('');
    setProfileSaveError('');
    setIsUploadingPhoto(true);
    try {
      const dataUrl = await compressImageFile(file, { maxDimension: 420, maxChars: 120_000 });
      const updatedUser: User = { ...targetUser, avatarUrl: dataUrl };
      await persistUpdatedUser(updatedUser);
      setAvatarUrl(dataUrl);
      setAvatarLoadError(false);
      setPhotoSavedFeedback('Foto carregada e sincronizada na nuvem com sucesso!');
      playSound('success');
      setTimeout(() => setPhotoSavedFeedback(''), 4000);
    } catch (err) {
      setPhotoUploadError(
        err instanceof Error
          ? `Sincronização não concluída: ${err.message}`
          : 'Erro ao salvar foto no servidor.'
      );
      playSound('beep');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Save Profile Form Changes (Apelido, Nome, Dados Pessoais + Campos Admin/Presidente se aplicável)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaveError('');
    setProfileSavedFeedback(false);
    setIsSavingProfile(true);
    try {
      const cleanJoinedDate = joinedDate.trim();
      const parsedFromDate = cleanJoinedDate ? parseInt(cleanJoinedDate.slice(0, 4), 10) : NaN;
      const rawYear = !Number.isNaN(parsedFromDate)
        ? parsedFromDate
        : Number(joinedYear) || targetUser.joinedYear || new Date().getFullYear();
      const clampedJoinedYear = Math.min(2100, Math.max(2000, Math.round(rawYear)));

      const responsibleObj =
        isMinor && responsibleMemberId
          ? users.find((u) => u.id === responsibleMemberId)
          : undefined;

      const actorName = getMemberDisplayName(currentUser);
      const nowIso = new Date().toISOString();
      const nextBadgeHistory: MemberBadgeAuditEntry[] = [
        ...(targetUser.badgeHistory || []),
      ];

      let nomadeFields: Partial<User> = {};
      let ossoFields: Partial<User> = {};

      if (canManageSeals) {
        if (nomadeBadge !== Boolean(targetUser.nomadeBadge)) {
          nextBadgeHistory.unshift({
            id: `badge-nomade-${Date.now()}`,
            badge: 'NÔMADE',
            action: nomadeBadge ? 'granted' : 'revoked',
            at: nowIso,
            byId: currentUser.id,
            byName: actorName,
            byUid: currentUser.id,
          });
          nomadeFields = nomadeBadge
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
              };
        }

        if (ossoBadge !== Boolean(targetUser.ossoBadge)) {
          nextBadgeHistory.unshift({
            id: `badge-osso-${Date.now() + 1}`,
            badge: 'O.S.S.O.',
            action: ossoBadge ? 'granted' : 'revoked',
            at: nowIso,
            byId: currentUser.id,
            byName: actorName,
            byUid: currentUser.id,
          });
          ossoFields = ossoBadge
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
              };
        }
      }

      const updatedUser: User = {
        ...targetUser,
        name: name.trim(),
        nickname: nickname.trim() || undefined,
        phone: phone.trim(),
        motorcycle: motorcycle.trim(),
        bloodType,
        emergencyContact: emergencyContact.trim(),
        birthDate: birthDate.trim() || undefined,
        joinedDate: cleanJoinedDate || undefined,
        joinedYear: clampedJoinedYear,
        avatarUrl: avatarUrl.trim() || undefined,
        ...(canManageSeals
          ? {
              ...nomadeFields,
              ...ossoFields,
              badgeHistory: nextBadgeHistory.slice(0, 60),
            }
          : {}),
        ...(isAdminUser
          ? {
              email: email.trim().toLowerCase() || targetUser.email,
              role,
              status,
              sosApproved,
              canEditFinances,
              boardRoleId: boardRoleId.trim() || undefined,
              customRoleTitle: customRoleTitle.trim() || undefined,
              memberCategory,
              isMinor,
              responsibleMemberId: isMinor ? responsibleMemberId || undefined : undefined,
              responsibleMemberName: isMinor
                ? responsibleObj
                  ? getMemberDisplayName(responsibleObj)
                  : targetUser.responsibleMemberName
                : undefined,
            }
          : {}),
      };

      await persistUpdatedUser(updatedUser);
      setProfileSavedFeedback(true);
      playSound('success');
      setTimeout(() => setProfileSavedFeedback(false), 3500);
    } catch (err) {
      setProfileSaveError(
        err instanceof Error
          ? `Falha ao sincronizar alteração no Firebase: ${err.message}. Seus dados preenchidos foram mantidos.`
          : 'Sincronização não concluída. Seus dados preenchidos foram mantidos.'
      );
      playSound('beep');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveInlineCargo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminUser) return;
    setProfileSaveError('');
    setIsSavingProfile(true);
    try {
      const cleanBoardId = inlineBoardRoleDraft.trim() || undefined;
      const cleanCustomTitle = inlineCustomCargoDraft.trim() || undefined;
      const nextRole: UserRole =
        targetUser.role === 'admin'
          ? 'admin'
          : cleanBoardId
          ? 'board'
          : targetUser.role;
      const updatedUser: User = {
        ...targetUser,
        role: nextRole,
        boardRoleId: cleanBoardId,
        customRoleTitle: cleanCustomTitle,
      };
      await persistUpdatedUser(updatedUser);
      setBoardRoleId(cleanBoardId || '');
      setCustomRoleTitle(cleanCustomTitle || '');
      setRole(nextRole);
      setIsEditingInlineCargo(false);
      setInlineCargoSavedNotice(true);
      playSound('success');
      setTimeout(() => setInlineCargoSavedNotice(false), 3500);
    } catch (err) {
      setProfileSaveError(
        err instanceof Error
          ? `Sincronização de cargo não concluída: ${err.message}`
          : 'Erro ao sincronizar cargo no servidor.'
      );
      playSound('beep');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const buildPixCheckoutState = async ({
    title,
    baseAmount,
    installments,
    txIdBase,
    description,
  }: {
    title: string;
    baseAmount: number;
    installments: number;
    txIdBase: string;
    description: string;
  }) => {
    const safeInstallments = Math.max(1, Math.min(12, Math.round(installments)));
    const chargeAmount = Number((baseAmount / safeInstallments).toFixed(2));
    const txId = safeInstallments > 1 ? `${txIdBase}P${safeInstallments}` : txIdBase;
    const payload = generatePixPayload({
      pixKey: clubInfo.pixCnpj,
      merchantName: formatPixRecipientCnpj(clubInfo.pixCnpj),
      merchantCity: 'IBIUNA',
      amount: chargeAmount,
      txId,
    });

    const qrCodeUrl = await QRCode.toDataURL(payload, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    setPixPaymentData({
      title,
      baseAmount,
      amount: chargeAmount,
      installments: safeInstallments,
      txIdBase,
      description,
      payload,
      qrCodeUrl,
    });
  };

  // Generate Pix for specific amount (debt, single fee, or single tab)
  const handleGenerateMemberPix = async (title: string, amount: number, description: string) => {
    const safeTxId = `MENS${targetUser.name
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase()}${Date.now().toString().slice(-4)}`;

    try {
      await buildPixCheckoutState({
        title,
        baseAmount: amount,
        installments: 1,
        txIdBase: safeTxId,
        description,
      });
      setCopiedPix(false);
      playSound('click');
      setTimeout(() => scrollToSection(financeSectionRef), 100);
    } catch (err) {
      console.error('Erro ao gerar Pix:', err);
    }
  };

  const handleChangePixInstallments = async (nextInstallments: number) => {
    if (!pixPaymentData) return;
    try {
      await buildPixCheckoutState({
        title: pixPaymentData.title,
        baseAmount: pixPaymentData.baseAmount,
        installments: nextInstallments,
        txIdBase: pixPaymentData.txIdBase,
        description: pixPaymentData.description,
      });
      setCopiedPix(false);
      playSound('click');
    } catch (err) {
      console.error('Erro ao recalcular parcela Pix:', err);
    }
  };

  const handleCopyPixCode = () => {
    if (!pixPaymentData) return;
    navigator.clipboard.writeText(pixPaymentData.payload);
    setCopiedPix(true);
    playSound('beep');
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const handleNotifyPaymentDone = () => {
    setPaymentNotice(
      'Aviso de pagamento registrado! A tesouraria fará a conciliação e dará baixa em sua conta.'
    );
    playSound('beep');
    setTimeout(() => {
      setPaymentNotice('');
      setPixPaymentData(null);
    }, 4500);
  };

  const handleLinkOrCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecPassError('');
    setSecPassSuccess('');
    setIsProviderDisabledError(false);
    const passErr = validatePasswordInput(secNewPass, secConfirmPass);
    if (passErr) {
      setSecPassError(passErr);
      playSound('beep');
      return;
    }
    setIsSavingSecPass(true);
    try {
      const outcome = await linkPasswordToCurrentUser(secNewPass);
      if (outcome === 'reauth_redirect') {
        setSecPassSuccess(
          'Redirecionando para confirmar sua conta Google... Após retornar, informe e salve sua nova senha.'
        );
        return;
      }

      setSecNewPass('');
      setSecConfirmPass('');
      setProviderRefreshTick((v) => v + 1);

      if (outcome === 'already_linked') {
        setSecPassSuccess(
          'Sua conta já possui o login por E-mail e Senha vinculado! Caso queira trocar, utilize o formulário de Alterar Senha abaixo.'
        );
      } else {
        setSecPassSuccess(
          'Senha criada e vinculada com sucesso! Seu cadastro original foi preservado e você já pode entrar com E-mail e Senha.'
        );
      }
      playSound('success');
    } catch (err) {
      setIsProviderDisabledError(isOperationNotAllowedError(err));
      setSecPassError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsSavingSecPass(false);
    }
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecPassError('');
    setSecPassSuccess('');
    if (!secCurrentPass) {
      setSecPassError('Informe sua senha atual.');
      playSound('beep');
      return;
    }
    const passErr = validatePasswordInput(secNewPass, secConfirmPass);
    if (passErr) {
      setSecPassError(passErr);
      playSound('beep');
      return;
    }
    setIsSavingSecPass(true);
    try {
      await changeCurrentUserPassword(secCurrentPass, secNewPass);
      setSecCurrentPass('');
      setSecNewPass('');
      setSecConfirmPass('');
      setSecPassSuccess('Senha alterada com sucesso!');
      playSound('success');
    } catch (err) {
      setSecPassError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsSavingSecPass(false);
    }
  };

  const handleSendPasswordResetForTarget = async (targetEmail: string) => {
    setSecPassError('');
    setSecPassSuccess('');
    setIsSavingSecPass(true);
    try {
      await sendPasswordResetClean(targetEmail);
      setSecPassSuccess(`E-mail de redefinição enviado para ${targetEmail.toLowerCase()}.`);
      playSound('success');
    } catch (err) {
      setSecPassError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsSavingSecPass(false);
    }
  };

  const isAdmin =
    currentUser.role === 'admin' ||
    currentUser.email?.toLowerCase().trim() === 'eliezerrmartins@gmail.com';
  const isBoardMember = currentUser.role === 'board' && currentUser.status === 'active';
  const isFinancialDirector = Boolean(
    currentUser.boardRoleId === 'role-finance' ||
      currentUser.email?.toLowerCase().includes('financeiro') ||
      currentUser.canEditFinances
  );
  const canEditOwnFinances = Boolean(isAdmin || (isBoardMember && isFinancialDirector));

  const formatShortDate = (iso?: string) => {
    if (!iso) return null;
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const formatBirthdayShort = (iso?: string) => {
    if (!iso) return 'Não informado';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}`;
  };

  const displayAvatar = avatarUrl || targetUser.avatarUrl || '';
  const displayTitle = getMemberDisplayName(targetUser);
  const sortedUsersForAdmin = [...users].sort((a, b) =>
    getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-3xl p-5 sm:p-7 space-y-6 my-auto shadow-2xl relative">
        {/* Top Navigation Row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-amber-400 border border-zinc-800 text-xs font-bold uppercase flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar</span>
          </button>

          <div className="flex items-center gap-2">
            {!targetIsMinorExempt && (
              <button
                type="button"
                onClick={() => scrollToSection(financeSectionRef)}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-zinc-800 hover:border-amber-400/40 text-xs font-bold uppercase flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Ir para Financeiro</span>
                {totalDebt > 0 && (
                  <span className="font-mono text-[11px] text-red-400 font-bold">
                    (R$ {totalDebt.toFixed(2)})
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
              aria-label="Fechar perfil"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Debt Notification Alert on Profile Access */}
        {!targetIsMinorExempt && totalDebt > 0 && !debtNotificationDismissed && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-red-950/60 border border-red-500/60 shadow-lg space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 shrink-0 mt-0.5">
                  <BellRing className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-rock text-base sm:text-lg font-bold uppercase text-white tracking-wide">
                    Você possui débitos pendentes no Motoclube
                  </h4>
                  <p className="text-xs text-red-100/90 leading-relaxed">
                    Total em aberto:{' '}
                    <strong className="font-mono tabular-nums text-white text-sm">
                      R$ {totalDebt.toFixed(2)}
                    </strong>
                    {pendingFees.length > 0 && (
                      <>
                        {' '}
                        ·{' '}
                        <span className="font-semibold">
                          {pendingFees.length} mensalidade(s) (R${' '}
                          <span className="font-mono tabular-nums">
                            {totalPendingFees.toFixed(2)}
                          </span>
                          )
                        </span>
                      </>
                    )}
                    {pendingTabs.length > 0 && (
                      <>
                        {' '}
                        ·{' '}
                        <span className="font-semibold">
                          {pendingTabs.length} fiado(s) na sede (R${' '}
                          <span className="font-mono tabular-nums">
                            {totalPendingTabs.toFixed(2)}
                          </span>
                          )
                        </span>
                      </>
                    )}
                    .
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDebtNotificationDismissed(true)}
                className="p-1 text-red-200/70 hover:text-white rounded-lg hover:bg-red-900/50 transition-colors shrink-0"
                aria-label="Dispensar notificação de débito"
                title="Ocultar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button
                type="button"
                onClick={() =>
                  handleGenerateMemberPix(
                    'Quitação Total de Débitos',
                    totalDebt,
                    `Pagamento consolidado de mensalidades e consumo na sede de ${getMemberDisplayName(
                      targetUser
                    )}`
                  )
                }
                className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <QrCode className="w-4 h-4" />
                <span>Pagar Agora via Pix</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection(financeSectionRef)}
                className="px-3.5 py-2 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-100 border border-red-400/40 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowDown className="w-3.5 h-3.5 text-red-400" />
                <span>Ver Detalhes dos Débitos</span>
              </button>
            </div>
          </div>
        )}

        {/* Admin Profile Switcher (Edit own profile or any member's full profile) */}
        {isAdminUser && (
          <div className="p-3.5 rounded-xl bg-amber-400/10 border border-amber-400/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 text-amber-300 font-bold uppercase">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Modo Administrador · Editar Perfil</span>
            </div>
            <select
              value={targetUser.id}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="bg-zinc-950 border border-amber-400/50 rounded-lg px-3 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-amber-400 sm:min-w-[260px]"
            >
              {sortedUsersForAdmin.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === currentUser.id ? `Meu Perfil (${getMemberDisplayName(u)})` : `${getMemberDisplayName(u)} (${u.name})`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Header Profile Identity */}
        <div
          ref={personalSectionRef}
          className="flex flex-col sm:flex-row items-center sm:items-start gap-4 pb-5 border-b border-zinc-800"
        >
          <div className="relative group shrink-0">
            <PhotoSourcePicker
              disabled={isUploadingPhoto}
              title="Alterar Foto do Perfil"
              subtitle="Escolha enviar da Galeria Nativa do Smartphone ou do Google Fotos."
              onSelectFiles={handleDevicePhotoFiles}
              className="inline-block"
            >
              <div
                className="w-20 h-20 rounded-full relative cursor-pointer"
                title="Enviar foto do dispositivo ou Google Fotos"
              >
                {displayAvatar && !avatarLoadError ? (
                  <img
                    src={displayAvatar}
                    alt={displayTitle}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarLoadError(true)}
                    className="w-20 h-20 rounded-full object-cover border-2 border-amber-400 shadow-md shadow-amber-400/20"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-zinc-900 border-2 border-amber-400 flex items-center justify-center text-amber-400 shadow-md shadow-amber-400/20">
                    <UserIcon className="w-8 h-8" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/65 rounded-full flex flex-col items-center justify-center text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5" />
                  <span className="text-[9px] font-bold uppercase mt-0.5">Trocar</span>
                </div>
              </div>
            </PhotoSourcePicker>
          </div>

          <div className="text-center sm:text-left space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h3 className="font-rock text-2xl font-bold uppercase text-white tracking-wide">
                {displayTitle}
              </h3>
              {(() => {
                const accessBadges = getMemberAccessBadges(targetUser, boardRoles);
                return (
                  <>
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/40 text-xs font-bold uppercase tracking-wide text-amber-300">
                      {accessBadges.officialCargo}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-[10px] font-bold uppercase tracking-wide text-zinc-200">
                      {targetUser.memberCategory || 'Motociclista'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${
                        targetFeeStatusInfo.isExempt
                          ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                      }`}
                    >
                      {targetFeeStatusInfo.label}
                    </span>
                    {targetUser.nomadeBadge && (
                      <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-400/50 text-[10px] font-rock font-bold uppercase tracking-wider text-purple-200 inline-flex items-center gap-1">
                        <Award className="w-3 h-3 text-purple-300" />
                        NÔMADE
                      </span>
                    )}
                    {targetUser.ossoBadge && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/60 text-[10px] font-rock font-bold uppercase tracking-wider text-amber-200 inline-flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-amber-300" />
                        O.S.S.O.
                      </span>
                    )}
                    {accessBadges.accessBadge && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                        {accessBadges.accessBadge}
                      </span>
                    )}
                    {accessBadges.canEditFinances && !accessBadges.isAdmin && (
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/40 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                        Dir. Financeiro
                      </span>
                    )}
                  </>
                );
              })()}
              {isAdminUser && (
                <button
                  type="button"
                  onClick={() => {
                    setInlineBoardRoleDraft(targetUser.boardRoleId || '');
                    setInlineCustomCargoDraft(targetUser.customRoleTitle || '');
                    setIsEditingInlineCargo((prev) => !prev);
                  }}
                  className="px-2 py-0.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-400/50 text-[11px] font-bold uppercase text-zinc-200 hover:text-amber-300 inline-flex items-center gap-1 transition-colors"
                  title="Editar cargo exibido ao lado da foto"
                >
                  <Edit3 className="w-3 h-3 text-amber-400" />
                  <span>{isEditingInlineCargo ? 'Fechar' : 'Editar Cargo'}</span>
                </button>
              )}
              {inlineCargoSavedNotice && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Cargo atualizado</span>
                </span>
              )}
            </div>

            {isAdminUser && isEditingInlineCargo && (
              <form
                onSubmit={handleSaveInlineCargo}
                className="p-3 mt-2 rounded-xl bg-zinc-950 border border-amber-400/40 space-y-2.5 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase text-amber-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Editar Cargo do Integrante (Admin)</span>
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    Automático atual:{' '}
                    <strong className="text-zinc-200">
                      {getMemberRoleLabel(
                        {
                          ...targetUser,
                          boardRoleId: inlineBoardRoleDraft || undefined,
                          customRoleTitle: undefined,
                        },
                        boardRoles
                      )}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                      Cargo na Mesa Diretora
                    </label>
                    <select
                      value={inlineBoardRoleDraft}
                      onChange={(e) => {
                        setInlineBoardRoleDraft(e.target.value);
                        setInlineCustomCargoDraft('');
                      }}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="">Sem cargo específico (Automático)</option>
                      {boardRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                      Título Personalizado (Opcional)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        maxLength={80}
                        value={inlineCustomCargoDraft}
                        onChange={(e) => setInlineCustomCargoDraft(e.target.value)}
                        placeholder={getMemberRoleLabel(
                          {
                            ...targetUser,
                            boardRoleId: inlineBoardRoleDraft || undefined,
                            customRoleTitle: undefined,
                          },
                          boardRoles
                        )}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                      {inlineCustomCargoDraft.trim() && (
                        <button
                          type="button"
                          onClick={() => setInlineCustomCargoDraft('')}
                          className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-amber-300 hover:border-amber-400/50 shrink-0"
                          title="Voltar ao cargo automático"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingInlineCargo(false)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-[11px] font-bold uppercase text-zinc-300 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-[11px] font-bold uppercase inline-flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" />
                    <span>Salvar Cargo</span>
                  </button>
                </div>
              </form>
            )}

            {targetUser.nickname?.trim() &&
              targetUser.nickname.trim().toLowerCase() !== targetUser.name.trim().toLowerCase() && (
                <p className="text-xs text-zinc-400">Nome: {targetUser.name}</p>
              )}

            <p className="text-xs text-zinc-400 font-medium">
              {targetUser.motorcycle ? `${targetUser.motorcycle} · ` : ''}{targetUser.email}
            </p>
            <div className="flex items-center justify-center sm:justify-start gap-2.5 flex-wrap text-[11px] text-zinc-400 pt-0.5">
              <span>
                Ingresso no MC:{' '}
                <strong className="text-zinc-200">
                  {formatShortDate(targetUser.joinedDate) || targetUser.joinedYear}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Cake className="w-3.5 h-3.5 text-amber-400" />
                Aniversário:{' '}
                <strong className="text-amber-300">
                  {formatBirthdayShort(targetUser.birthDate)}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Sangue: <strong className="text-zinc-200">{targetUser.bloodType || 'O+'}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                SOS:{' '}
                <strong className="text-zinc-200">
                  {targetUser.sosApproved ? 'Liberado' : 'Sob Análise'}
                </strong>
              </span>
              {targetUser.isMinor && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Menor de idade · Responsável:{' '}
                    <strong className="text-amber-300">
                      {targetUser.responsibleMemberName ||
                        getMemberDisplayName(
                          users.find((u) => u.id === targetUser.responsibleMemberId)
                        ) ||
                        'Não vinculado'}
                    </strong>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 1: Informações Pessoais, Apelido e Foto do Colete */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="font-rock text-lg font-bold uppercase text-amber-400 flex items-center gap-2 tracking-wide">
              <UserIcon className="w-4 h-4" />
              <span>Informações Pessoais & Foto do Perfil</span>
            </h4>
            <span className="text-[11px] text-zinc-400">
              Edite seu apelido, foto e dados cadastrais
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            {profileSaveError && (
              <div className="p-3 bg-red-950/60 border border-red-500/50 text-red-200 rounded-xl text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{profileSaveError}</span>
              </div>
            )}

            {profileSavedFeedback && (
              <div className="p-3 bg-green-500/10 border border-green-500/40 text-green-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400 shrink-0" />
                <span>Alterações de perfil confirmadas e salvas na nuvem!</span>
              </div>
            )}

            {photoSavedFeedback && (
              <div className="p-3 bg-green-500/10 border border-green-500/40 text-green-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400 shrink-0" />
                <span>{photoSavedFeedback}</span>
              </div>
            )}

            {/* Profile Photo Controls (Smartphone Gallery or Google Photos) */}
            <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
              <span className="block text-xs font-bold text-amber-400 uppercase">
                Alterar Foto do Perfil
              </span>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                {displayAvatar && !avatarLoadError ? (
                  <img
                    src={displayAvatar}
                    alt="Pré-visualização da foto de perfil"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarLoadError(true)}
                    className="w-16 h-16 rounded-full object-cover border-2 border-amber-400 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-zinc-900 border-2 border-amber-400 flex items-center justify-center text-amber-400 shrink-0">
                    <UserIcon className="w-6 h-6" />
                  </div>
                )}

                <div className="space-y-2 flex-1 w-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    <PhotoSourcePicker
                      disabled={isUploadingPhoto}
                      title="Alterar Foto do Perfil"
                      subtitle="Escolha enviar da Galeria Nativa do Smartphone ou do Google Fotos."
                      onSelectFiles={handleDevicePhotoFiles}
                    >
                      <div className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase rounded-lg flex items-center gap-1.5 transition-colors font-rock whitespace-nowrap shrink-0">
                        {isUploadingPhoto ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isUploadingPhoto
                            ? 'Processando Foto...'
                            : 'Enviar Foto (Galeria / Google)'}
                        </span>
                      </div>
                    </PhotoSourcePicker>
                  </div>

                  {photoUploadError && (
                    <p className="text-[11px] text-red-400 font-semibold">{photoUploadError}</p>
                  )}

                  {isAdminUser && (
                    <div className="pt-1">
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                        URL Direta da Foto (Admin)
                      </label>
                      <input
                        type="text"
                        value={avatarUrl}
                        onChange={(e) => {
                          setAvatarUrl(e.target.value);
                          setAvatarLoadError(false);
                        }}
                        placeholder="https://..."
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  )}

                  <p className="text-[11px] text-zinc-400">
                    Envie uma foto da galeria do smartphone ou do Google Fotos.
                  </p>
                </div>
              </div>
            </div>

            {/* Personal Fields + Apelido */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-amber-300 uppercase mb-1">
                  Apelido (Exibido no Perfil)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  placeholder="Ex: Caveira"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full bg-zinc-950 border border-amber-400/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Telefone / WhatsApp {isMinor ? '(Opcional)' : ''}
                </label>
                <input
                  type="text"
                  required={!isMinor}
                  maxLength={40}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Motocicleta (Opcional)
                </label>
                <input
                  type="text"
                  maxLength={150}
                  value={motorcycle}
                  onChange={(e) => setMotorcycle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Tipo Sanguíneo
                </label>
                <select
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Data de Aniversário
                </label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Data de Ingresso no MC
                </label>
                <input
                  type="date"
                  value={joinedDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setJoinedDate(val);
                    const yr = val ? parseInt(val.slice(0, 4), 10) : NaN;
                    if (!Number.isNaN(yr) && yr >= 2000 && yr <= 2100) {
                      setJoinedYear(yr);
                    }
                  }}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Ano de Ingresso
                </label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  required
                  value={joinedYear}
                  onChange={(e) => {
                    const yr = parseInt(e.target.value, 10);
                    setJoinedYear(Number.isNaN(yr) ? new Date().getFullYear() : yr);
                  }}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                Contato de Emergência
              </label>
              <input
                type="text"
                maxLength={150}
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="Ex: Nome (Parentesco) - (15) 99999-9999"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Admin-Only Full Field Editing Controls */}
            {isAdminUser && (
              <div className="p-4 bg-zinc-950 rounded-xl border border-amber-400/35 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-amber-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Acesso, Cargo & Privilégios (Administrador)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      E-mail de Acesso {isMinor ? '(Opcional p/ Menor)' : ''}
                    </label>
                    <input
                      type="email"
                      required={!isMinor}
                      maxLength={150}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      Cargo na Mesa Diretora
                    </label>
                    <select
                      value={boardRoleId}
                      onChange={(e) => {
                        setBoardRoleId(e.target.value);
                        setCustomRoleTitle('');
                      }}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="">Sem cargo específico</option>
                      {boardRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      Cargo Exibido na Frente da Foto (Deixe em branco para automático)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={80}
                        value={customRoleTitle}
                        onChange={(e) => setCustomRoleTitle(e.target.value)}
                        placeholder={`Automático: ${getMemberRoleLabel(
                          {
                            ...targetUser,
                            role,
                            boardRoleId: boardRoleId || undefined,
                            customRoleTitle: undefined,
                          },
                          boardRoles
                        )}`}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                      {customRoleTitle.trim() && (
                        <button
                          type="button"
                          onClick={() => setCustomRoleTitle('')}
                          className="px-2.5 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-amber-300 hover:border-amber-400/50 text-[11px] font-bold uppercase inline-flex items-center gap-1 shrink-0"
                          title="Usar cargo automático"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Auto</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      Nível / Função no Clube
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="member">Integrante Pleno</option>
                      <option value="board">Diretoria</option>
                      <option value="admin">Administrador Geral</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      Categoria do Integrante
                    </label>
                    <select
                      value={memberCategory}
                      onChange={(e) => setMemberCategory(e.target.value as MemberCategory)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      {MEMBER_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      Status do Cadastro
                    </label>
                    <select
                      value={status}
                      onChange={(e) =>
                        setStatus(e.target.value as 'active' | 'pending' | 'suspended')
                      }
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="active">Ativo / Aprovado</option>
                      <option value="pending">Pendente de Aprovação</option>
                      <option value="suspended">Suspenso</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-200 font-semibold">
                    <input
                      type="checkbox"
                      checked={sosApproved}
                      onChange={(e) => setSosApproved(e.target.checked)}
                      className="w-4 h-4 accent-amber-400 rounded"
                    />
                    <span>Acesso Liberado ao SOS Estrada</span>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-200 font-semibold">
                    <input
                      type="checkbox"
                      checked={canEditFinances}
                      onChange={(e) => setCanEditFinances(e.target.checked)}
                      className="w-4 h-4 accent-amber-400 rounded"
                    />
                    <span>Autorizado Editar Finanças (Diretor Financeiro)</span>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer text-amber-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={isMinor}
                      onChange={(e) => {
                        setIsMinor(e.target.checked);
                        if (!e.target.checked) setResponsibleMemberId('');
                      }}
                      className="w-4 h-4 accent-amber-400 rounded"
                    />
                    <span>Integrante Menor de Idade</span>
                  </label>
                </div>

                {isMinor && (
                  <div className="pt-1">
                    <label className="block text-xs font-bold text-amber-300 uppercase mb-1">
                      Integrante Adulto Responsável *
                    </label>
                    <select
                      required
                      value={responsibleMemberId}
                      onChange={(e) => setResponsibleMemberId(e.target.value)}
                      className="w-full bg-zinc-900 border border-amber-400/50 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="">Selecione o integrante responsável...</option>
                      {sortedUsersForAdmin
                        .filter((u) => !u.isMinor && u.id !== targetUser.id && u.status === 'active')
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {getMemberDisplayName(u)} ({u.name})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Seals Management: Exclusive to General Admin or Active Presidente */}
            {canManageSeals && (
              <div className="p-4 bg-zinc-950 rounded-xl border border-purple-500/35 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase text-purple-300 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-purple-400" />
                    <span>Selos de Identificação (Admin Geral / Presidente)</span>
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    Independentes da categoria e situação financeira
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-purple-200 font-bold">
                    <input
                      type="checkbox"
                      checked={nomadeBadge}
                      onChange={(e) => setNomadeBadge(e.target.checked)}
                      className="w-4 h-4 accent-purple-400 rounded"
                    />
                    <span>Selo NÔMADE</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-amber-200 font-bold">
                    <input
                      type="checkbox"
                      checked={ossoBadge}
                      onChange={(e) => setOssoBadge(e.target.checked)}
                      className="w-4 h-4 accent-amber-400 rounded"
                    />
                    <span>Selo O.S.S.O.</span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-5 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black rounded-lg text-xs font-bold uppercase font-rock flex items-center gap-1.5 shadow-md shadow-amber-400/20 transition-colors whitespace-nowrap shrink-0"
              >
                {isSavingProfile ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{isSavingProfile ? 'Sincronizando...' : 'Salvar Alterações do Perfil'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* SECTION 1.5: Segurança da Conta & Senha Individual */}
        {(() => {
          const isSelfProfile = targetUser.id === currentUser.id;
          const providerStatus = getAuthProviderStatus(auth.currentUser);
          const hasAuthUser = Boolean(auth.currentUser);
          if (!isSelfProfile && !(isAdminUser && targetUser.email)) return null;

          return (
            <section
              id="profile-security-section"
              className="pt-5 border-t border-zinc-800 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="font-rock text-base font-bold uppercase text-amber-400 flex items-center gap-2 tracking-wide">
                  <KeyRound className="w-4 h-4" />
                  <span>Segurança da Conta & Login por Senha</span>
                </h4>
                {isSelfProfile && hasAuthUser && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase">
                    {providerStatus.hasPassword && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                        E-mail & Senha Ativo
                      </span>
                    )}
                    {providerStatus.hasGoogle && (
                      <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/40 text-sky-300">
                        Google Vinculado
                      </span>
                    )}
                  </div>
                )}
              </div>

              {secPassError && (
                <div className="space-y-2.5">
                  <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 rounded-xl text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{secPassError}</span>
                  </div>

                  {isProviderDisabledError && (
                    <div className="p-3.5 bg-amber-950/35 border border-amber-500/40 rounded-xl text-xs space-y-2 text-zinc-200">
                      <div className="font-bold text-amber-300 uppercase tracking-wide">
                        Como ativar E-mail/Senha no projeto ({FIREBASE_PROJECT_ID})
                      </div>
                      {isAdminUser ? (
                        <>
                          <ol className="list-decimal list-inside space-y-1 text-zinc-300 leading-relaxed">
                            <li>
                              Acesse no Console Firebase: <strong className="text-white">Authentication &rarr; Sign-in method</strong>.
                            </li>
                            <li>
                              Clique em <strong className="text-white">Adicionar novo provedor</strong> (ou selecione <strong className="text-white">E-mail/senha</strong>), ative a primeira chave (<strong className="text-white">E-mail/senha</strong>) e clique em <strong className="text-white">Salvar</strong>.
                            </li>
                            <li>
                              Mantenha o provedor <strong className="text-white">Google</strong> ativado e tente criar a senha novamente aqui.
                            </li>
                          </ol>
                          <div className="pt-1">
                            <a
                              href={FIREBASE_AUTH_PROVIDERS_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase rounded-lg transition-colors"
                            >
                              <span>Abrir Sign-in Method no Console Firebase</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </>
                      ) : (
                        <p className="text-zinc-300 leading-relaxed">
                          O Administrador Geral precisa habilitar a opção <strong className="text-white">E-mail/senha</strong> no Console Firebase antes do primeiro vínculo. Enquanto isso, seu acesso via Google continua normal.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {secPassSuccess && (
                <div className="p-3 bg-green-950/60 border border-green-700 text-green-200 rounded-xl text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  <span>{secPassSuccess}</span>
                </div>
              )}

              {isSelfProfile && hasAuthUser ? (
                providerStatus.hasPassword ? (
                  <form
                    onSubmit={handleChangeOwnPassword}
                    className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 text-xs"
                  >
                    <p className="text-zinc-300 leading-relaxed">
                      Sua conta já utiliza login por <strong className="text-white">E-mail e Senha</strong> ({auth.currentUser?.email}). Você pode atualizar sua senha abaixo ou enviar um link de recuperação por e-mail.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Senha Atual</label>
                        <input
                          type={showSecPasswords ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={secCurrentPass}
                          onChange={(e) => setSecCurrentPass(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Nova Senha (mín. 6)</label>
                        <input
                          type={showSecPasswords ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          value={secNewPass}
                          onChange={(e) => setSecNewPass(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Confirmar Nova</label>
                        <input
                          type={showSecPasswords ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          value={secConfirmPass}
                          onChange={(e) => setSecConfirmPass(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowSecPasswords((p) => !p)}
                        className="text-zinc-400 hover:text-white inline-flex items-center gap-1 font-semibold"
                      >
                        {showSecPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showSecPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}</span>
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        {auth.currentUser?.email && (
                          <button
                            type="button"
                            disabled={isSavingSecPass}
                            onClick={() => handleSendPasswordResetForTarget(auth.currentUser!.email!)}
                            className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-700 rounded-lg font-bold uppercase inline-flex items-center gap-1.5"
                          >
                            <MailCheck className="w-3.5 h-3.5" />
                            <span>Enviar Reset p/ E-mail</span>
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={isSavingSecPass}
                          className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black font-rock font-bold uppercase rounded-lg inline-flex items-center gap-1.5"
                        >
                          {isSavingSecPass ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>Atualizar Senha</span>
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <form
                    onSubmit={handleLinkOrCreatePassword}
                    className="p-4 bg-zinc-950 border border-amber-400/35 rounded-xl space-y-3 text-xs"
                  >
                    <p className="text-zinc-300 leading-relaxed">
                      Sua conta foi criada via Google. Defina agora uma <strong className="text-amber-300">senha individual</strong> para entrar diretamente com seu e-mail (<strong className="text-white">{auth.currentUser?.email}</strong>) mantendo seu UID, histórico e cargo intactos.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Nova Senha (mín. 6) *</label>
                        <input
                          type={showSecPasswords ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          value={secNewPass}
                          onChange={(e) => setSecNewPass(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Confirmar Senha *</label>
                        <input
                          type={showSecPasswords ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          value={secConfirmPass}
                          onChange={(e) => setSecConfirmPass(e.target.value)}
                          placeholder="Repita a senha"
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowSecPasswords((p) => !p)}
                        className="text-zinc-400 hover:text-white inline-flex items-center gap-1 font-semibold"
                      >
                        {showSecPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showSecPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}</span>
                      </button>

                      <button
                        type="submit"
                        disabled={isSavingSecPass}
                        className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black font-rock font-bold uppercase rounded-lg inline-flex items-center gap-1.5"
                      >
                        {isSavingSecPass ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                        <span>Criar Senha Individual</span>
                      </button>
                    </div>
                  </form>
                )
              ) : isAdminUser && targetUser.email ? (
                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <p className="text-zinc-300">
                    Envie um link oficial de redefinição de senha para <strong className="text-white">{targetUser.email}</strong>.
                  </p>
                  <button
                    type="button"
                    disabled={isSavingSecPass}
                    onClick={() => handleSendPasswordResetForTarget(targetUser.email)}
                    className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-400/40 rounded-lg font-bold uppercase inline-flex items-center gap-1.5 shrink-0"
                  >
                    <MailCheck className="w-3.5 h-3.5" />
                    <span>Enviar Redefinição por E-mail</span>
                  </button>
                </div>
              ) : null}
            </section>
          );
        })()}

        {/* SECTION 2: Informações Financeiras do Membro — Excluída integralmente para menores de 18 anos */}
        {!targetIsMinor && (
        <section
          ref={financeSectionRef}
          id="profile-finance-section"
          className="pt-6 border-t border-zinc-800 space-y-5"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="font-rock text-lg font-bold uppercase text-amber-400 flex items-center gap-2 tracking-wide">
              <DollarSign className="w-4 h-4" />
              <span>Informações Financeiras do Integrante & Pix</span>
            </h4>
            <span className="text-[11px] text-zinc-400">
              Mensalidades, fiados na sede e comprovantes
            </span>
          </div>

          {/* Payment Notification Toast */}
          {paymentNotice && (
            <div className="p-3 bg-green-500/10 border border-green-500/40 text-green-300 rounded-xl text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400 shrink-0" />
              <span>{paymentNotice}</span>
            </div>
          )}

          {totalDebt === 0 ? (
            <div className="p-5 rounded-2xl bg-green-950/30 border border-green-500/40 space-y-2 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center text-green-400 shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="font-rock text-lg font-bold uppercase text-white">
                    {targetFeeStatusInfo.isExempt
                      ? `Situação: ${targetFeeStatusInfo.label}`
                      : 'Situação Financeira 100% Em Dia!'}
                  </h5>
                  <p className="text-xs text-green-300/80">
                    {targetFeeStatusInfo.isExempt
                      ? 'Integrante isento de novas cobranças de mensalidade. Histórico de pagamentos anteriores preservado.'
                      : 'Você não possui mensalidades em atraso nem fiados pendentes na sede.'}
                  </p>
                </div>
              </div>
              <div className="text-center sm:text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                  Total Quitado
                </span>
                <span className="font-mono tabular-nums text-xl font-bold text-green-400">
                  R$ {totalPaid.toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-red-950/30 border border-red-500/40 space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="font-rock text-lg font-bold uppercase text-white">
                      Você Possui Pendências em Aberto
                    </h5>
                    <p className="text-xs text-zinc-300">
                      Regularize sua situação via Pix ou anexe seu comprovante abaixo.
                    </p>
                  </div>
                </div>

                <div className="text-center sm:text-right shrink-0">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                    Total a Pagar
                  </span>
                  <span className="font-rock text-3xl font-bold text-red-400 font-mono tabular-nums">
                    R$ {totalDebt.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Sub-breakdown metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs pt-1">
                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">
                    Mensalidades Pendentes
                  </span>
                  <span className="font-mono tabular-nums font-bold text-yellow-400 text-sm block">
                    R$ {totalPendingFees.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {pendingFees.length} mês(es) em aberto
                  </span>
                </div>

                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">
                    Fiados na Sede (Bar)
                  </span>
                  <span className="font-mono tabular-nums font-bold text-red-400 text-sm block">
                    R$ {totalPendingTabs.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {pendingTabs.length} item(ns) a acertar
                  </span>
                </div>
              </div>

              {/* Main Action: Pay Total Debt via Pix */}
              <button
                type="button"
                onClick={() =>
                  handleGenerateMemberPix(
                    'Quitação Total de Débitos',
                    totalDebt,
                    `Pagamento consolidado de mensalidades e consumo na sede de ${getMemberDisplayName(
                      targetUser
                    )}`
                  )
                }
                className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-black font-rock text-sm font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 transition-all"
              >
                <QrCode className="w-5 h-5" />
                <span>Pagar Total via Pix (R$ {totalDebt.toFixed(2)})</span>
              </button>
            </div>
          )}

          {/* Active Pix Code Card */}
          {pixPaymentData && (
            <div className="p-5 bg-zinc-950 border border-amber-400/60 rounded-2xl space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-amber-400" />
                  <div>
                    <h5 className="font-rock text-base font-bold uppercase text-white">
                      {pixPaymentData.title}
                    </h5>
                    <span className="text-[11px] text-zinc-400">{pixPaymentData.description}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPixPaymentData(null)}
                  className="p-1 text-zinc-400 hover:text-white"
                  aria-label="Fechar código Pix"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
                <div className="p-2.5 bg-white rounded-xl shadow-lg shrink-0">
                  <img
                    src={pixPaymentData.qrCodeUrl}
                    alt="QR Code Pix"
                    className="w-44 h-44 object-contain"
                  />
                </div>

                <div className="space-y-3 flex-1 w-full text-xs">
                  <div>
                    <span className="text-zinc-500 uppercase font-bold block text-[10px]">
                      Chave Oficial CNPJ · Destinatário Banco
                    </span>
                    <span className="font-mono text-sm text-white font-bold block">
                      {clubInfo.pixCnpj}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      Destinatário Pix: CNPJ {clubInfo.pixCnpj} (Oficina do Rock Motoclube)
                    </span>
                  </div>

                  <div>
                    <label className="text-zinc-400 uppercase font-bold block text-[10px] mb-1">
                      Parcelamento no Pix (1x a 12x)
                    </label>
                    <select
                      value={pixPaymentData.installments}
                      onChange={(e) => void handleChangePixInstallments(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    >
                      {Array.from({ length: 12 }, (_, idx) => idx + 1).map((parcelas) => {
                        const partValue = (pixPaymentData.baseAmount / parcelas).toFixed(2);
                        return (
                          <option key={parcelas} value={parcelas}>
                            {parcelas === 1
                              ? `1x À vista — R$ ${partValue}`
                              : `${parcelas}x de R$ ${partValue} (Total R$ ${pixPaymentData.baseAmount.toFixed(2)})`}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <span className="text-zinc-500 uppercase font-bold block text-[10px]">
                      {pixPaymentData.installments > 1
                        ? `Valor da Parcela (${pixPaymentData.installments}x)`
                        : 'Valor da Cobrança'}
                    </span>
                    <span className="font-rock text-2xl font-bold text-amber-400 block font-mono tabular-nums">
                      R$ {pixPaymentData.amount.toFixed(2)}
                    </span>
                    {pixPaymentData.installments > 1 && (
                      <span className="text-[11px] text-zinc-400 font-mono">
                        Total do débito: R$ {pixPaymentData.baseAmount.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-400 uppercase font-bold block text-[10px]">
                      Código Copia e Cola
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={pixPaymentData.payload}
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-zinc-300 truncate"
                      />
                      <button
                        type="button"
                        onClick={handleCopyPixCode}
                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase rounded-lg shrink-0 flex items-center gap-1 transition-colors"
                      >
                        {copiedPix ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedPix ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleNotifyPaymentDone}
                    className="w-full py-2 bg-zinc-800 hover:bg-green-700 hover:text-white text-zinc-300 rounded-lg text-xs font-bold uppercase transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Já fiz o Pix / Notificar Pagamento</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Year & Months Financial Breakdown + Receipt Upload & Archive */}
          <MemberYearlyFinancePanel
            member={targetUser}
            fees={fees}
            tabs={tabs}
            clubInfo={clubInfo}
            canEdit={canEditOwnFinances}
            currentUser={currentUser}
            financialNotes={financialNotes}
            allUsers={users}
            allowMemberReceiptUpload={true}
            defaultMonthsCollapsed={true}
            onUpdateFees={onUpdateFees}
            onUpdateTabs={onUpdateTabs}
            onUpdateClubInfo={onUpdateClubInfo}
            onUpdateFinancialNotes={onUpdateFinancialNotes}
            onUpdateUsers={onUpdateUsers}
            onPayPix={handleGenerateMemberPix}
          />
        </section>
        )}

        {/* Automatic Pending Debt Popup on Every Profile Open (Excluded for <18 minors) */}
        {!ownIsMinorExempt && showDebtOpenPopup && ownTotalDebt > 0 && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-[#121216] border-2 border-red-500/80 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/60 flex items-center justify-center text-red-400 shrink-0">
                    <BellRing className="w-6 h-6 animate-bounce" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-400 block">
                      Aviso Financeiro
                    </span>
                    <h4 className="font-rock text-xl font-bold uppercase text-white">
                      Você possui débitos pendentes no Motoclube
                    </h4>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDebtOpenPopup(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg"
                  aria-label="Fechar aviso"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/40 space-y-1.5 text-xs text-red-100">
                <p>
                  Olá <strong className="text-white">{getMemberDisplayName(currentUser)}</strong>, você possui débitos pendentes no Motoclube no valor de{' '}
                  <strong className="font-mono text-base text-white">R$ {ownTotalDebt.toFixed(2)}</strong>:
                </p>
                {ownPendingFees.length > 0 && (
                  <p>
                    • <strong>{ownPendingFees.length}</strong> mensalidade(s) em aberto (R${' '}
                    <span className="font-mono">{ownTotalPendingFees.toFixed(2)}</span>)
                  </p>
                )}
                {ownPendingTabs.length > 0 && (
                  <p>
                    • <strong>{ownPendingTabs.length}</strong> fiado(s) na sede (R${' '}
                    <span className="font-mono">{ownTotalPendingTabs.toFixed(2)}</span>)
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowDebtOpenPopup(false);
                    setSelectedUserId(currentUser.id);
                    handleGenerateMemberPix(
                      'Quitação Total de Débitos',
                      ownTotalDebt,
                      `Pagamento consolidado de mensalidades e consumo na sede de ${getMemberDisplayName(
                        currentUser
                      )}`
                    );
                  }}
                  className="flex-1 py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Pagar Agora via Pix</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDebtOpenPopup(false);
                    setSelectedUserId(currentUser.id);
                    scrollToSection(financeSectionRef);
                  }}
                  className="py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold uppercase rounded-xl"
                >
                  Ver Débitos
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions: Switch Account / Logout */}
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAuth();
            }}
            className="text-zinc-400 hover:text-amber-400 flex items-center gap-1 transition-colors"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Alternar Usuário</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="text-zinc-400 hover:text-red-400 flex items-center gap-1 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair da Conta</span>
          </button>
        </div>
      </div>
    </div>
  );
}
