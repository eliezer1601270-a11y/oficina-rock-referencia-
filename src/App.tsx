/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import SosBanner from './components/SosBanner';
import HistorySection from './components/HistorySection';
import EventsSection from './components/EventsSection';
import ForumSection from './components/ForumSection';
import SosSection from './components/SosSection';
import FinanceSection, { FinanceSubTab } from './components/FinanceSection';
import BoardSection from './components/BoardSection';
import AdminSection from './components/AdminSection';
import SupportersSection from './components/SupportersSection';
import DocumentsSection from './components/DocumentsSection';
import StatuteSection from './components/StatuteSection';
import AuthModal from './components/AuthModal';
import UserProfileModal from './components/UserProfileModal';
import { OfflineIndicator } from './components/PWAInstallButton';

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
  MemberPublicProfile,
  MemberFinancialNote,
  DEFAULT_CREST_URL,
  getMemberDisplayName,
} from './types';
import { StorageService, playSound } from './services/storage';
import {
  buildAutoMemberMonthlyFees,
  classifyMonthlyFee,
  formatEventPeriodLabel,
  getBrazilTodayIso,
  hasExplicitManualPagante,
  isEventUpcomingOrOngoing,
  isMemberCurrentlyMinor,
  isTabWrittenOff,
  resolveMemberFeeStatusInfo,
} from './services/financeSchedule';
import { BackupService } from './services/backupService';
import {
  sendBrowserNotification,
  requestBrowserNotificationPermission,
} from './services/notifications';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  consumeGoogleRedirectResult,
  signOutCleanly,
  formatAuthError,
  isActiveAdminUser,
} from './services/firebase';
import { FirestoreSync, SessionResolutionResult } from './services/firestoreSync';
import { 
  BookOpen, 
  Calendar, 
  MessageSquare, 
  ShieldAlert, 
  ShieldCheck,
  DollarSign, 
  Users, 
  MapPin, 
  ExternalLink,
  Flame,
  Share2,
  Check,
  AlertCircle,
  X,
  Cake,
  Award,
  BellRing,
  Bell,
  RefreshCw,
  ArrowRight,
  UserCheck,
  Search,
  Megaphone,
  FileText,
  Pin,
  CheckCheck,
} from 'lucide-react';

export default function App() {
  const [clubInfo, setClubInfo] = useState<ClubInfo>(StorageService.getClubInfo());
  const [boardRoles, setBoardRoles] = useState<BoardRoleConfig[]>(StorageService.getBoardRoles());
  const [users, setUsers] = useState<User[]>(() =>
    StorageService.getCurrentUser()?.status === 'active' ? StorageService.getUsers() : []
  );
  const [currentUser, setCurrentUser] = useState<User | null>(StorageService.getCurrentUser());
  const [events, setEvents] = useState<RideEvent[]>(StorageService.getEvents());
  const [publicProfiles, setPublicProfiles] = useState<MemberPublicProfile[]>(() =>
    StorageService.getCurrentUser()?.status === 'active' ? StorageService.getPublicProfiles() : []
  );
  const [financialNotes, setFinancialNotes] = useState<MemberFinancialNote[]>(() =>
    StorageService.getCurrentUser()?.status === 'active' ? StorageService.getFinancialNotes() : []
  );
  const [forumPosts, setForumPosts] = useState<ForumPost[]>(StorageService.getForumPosts());
  const [sosAlerts, setSOSAlerts] = useState<SOSAlert[]>(StorageService.getSOSAlerts());
  const [fees, setFees] = useState<MemberMonthlyFee[]>(StorageService.getFees());
  const [feeSchedules, setFeeSchedules] = useState<FeeRateScheduleEntry[]>(StorageService.getFeeSchedules());
  const [manualReceipts, setManualReceipts] = useState<ManualFinancialEntry[]>(StorageService.getManualReceipts());
  const [memberTitles, setMemberTitles] = useState<MemberHonoraryTitle[]>(StorageService.getMemberTitles());
  const [walkInClients, setWalkInClients] = useState<WalkInClient[]>(StorageService.getWalkInClients());
  const [walkInTabs, setWalkInTabs] = useState<WalkInTabRecord[]>(StorageService.getWalkInTabs());
  const [expenses, setExpenses] = useState<ClubExpense[]>(StorageService.getExpenses());
  const [tabs, setTabs] = useState<MemberTabDebt[]>(StorageService.getTabs());
  const [boardChat, setBoardChat] = useState<BoardChatMessage[]>(StorageService.getBoardChat());
  const [supporters, setSupporters] = useState<Supporter[]>(StorageService.getSupporters());
  const [documents, setDocuments] = useState<ClubDocument[]>(StorageService.getDocuments());
  const [governanceDocs, setGovernanceDocs] = useState<ClubGovernanceDoc[]>(StorageService.getGovernanceDocs());
  const [announcements, setAnnouncements] = useState<ClubAnnouncement[]>(StorageService.getAnnouncements());
  const [publicAnnouncements, setPublicAnnouncements] = useState<ClubAnnouncement[]>(() =>
    StorageService.getAnnouncements().filter((a) => a.isPublic)
  );
  const [auditLogs, setAuditLogs] = useState<AdminAuditEntry[]>(() =>
    isActiveAdminUser(StorageService.getCurrentUser()) ? StorageService.getAuditLogs() : []
  );
  const [deletedBackups, setDeletedBackups] = useState<DeletedRecordBackup[]>(() =>
    isActiveAdminUser(StorageService.getCurrentUser()) ? StorageService.getDeletedBackups() : []
  );
  const [quotaStatus, setQuotaStatus] = useState<QuotaSyncStatus>(() => FirestoreSync.getQuotaStatus());
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => StorageService.getReadNotificationIds());

  const [currentTab, setCurrentTab] = useState<string>('history');
  const [adminPanelMode, setAdminPanelMode] = useState<boolean>(false);
  const [adminNavSignal, setAdminNavSignal] = useState<number>(0);
  const [financeSubTab, setFinanceSubTab] = useState<FinanceSubTab>('members');
  const [isFinanceDirty, setIsFinanceDirty] = useState(false);
  const [pendingTabAfterFinanceGuard, setPendingTabAfterFinanceGuard] = useState<string | null>(null);
  const [isSavingFinanceBeforeLeave, setIsSavingFinanceBeforeLeave] = useState(false);
  const [financeLeaveError, setFinanceLeaveError] = useState('');
  const [isRefreshingSync, setIsRefreshingSync] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [dismissedBirthdayBanner, setDismissedBirthdayBanner] = useState(false);
  const [celebrationModalOpen, setCelebrationModalOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [forumCelebrationSent, setForumCelebrationSent] = useState(false);
  const [openCalendarSignal, setOpenCalendarSignal] = useState(0);
  const [shareNotice, setShareNotice] = useState<string>('');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [needsGoogleRegistration, setNeedsGoogleRegistration] = useState(false);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [authResolutionError, setAuthResolutionError] = useState<string>('');
  const [syncError, setSyncError] = useState<string>('');
  const [acknowledgedUpdateId, setAcknowledgedUpdateId] = useState<string>(() => {
    try {
      return localStorage.getItem('oficina_ack_app_update_id') || '';
    } catch {
      return '';
    }
  });
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [dismissedUpdateBanner, setDismissedUpdateBanner] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);

  const currentTabRef = useRef(currentTab);
  const financeSubTabRef = useRef(financeSubTab);
  const isFinanceDirtyRef = useRef(isFinanceDirty);
  const isProfileOpenRef = useRef(isProfileOpen);
  const isAuthOpenRef = useRef(isAuthOpen);
  const tabHistoryRef = useRef<string[]>([]);
  const privateListenerKeyRef = useRef<string>('');
  const authEpochRef = useRef<number>(0);
  const financeBatchControlRef = useRef<{ save: () => Promise<boolean>; discard: () => void } | null>(null);

  const ensurePrivateListeners = (user: User, fbUser: FirebaseUser) => {
    const key = `${user.id}:${fbUser.uid}`;
    if (privateListenerKeyRef.current === key) return;
    privateListenerKeyRef.current = key;
    FirestoreSync.startPrivateListeners(user, fbUser, currentTabRef.current);
  };

  const buildLocalSeed = () => ({
    clubInfo: StorageService.getClubInfo(),
    boardRoles: StorageService.getBoardRoles(),
    users: StorageService.getUsers(),
    events: StorageService.getEvents(),
    forumPosts: StorageService.getForumPosts(),
    sosAlerts: StorageService.getSOSAlerts(),
    fees: StorageService.getFees(),
    expenses: StorageService.getExpenses(),
    tabs: StorageService.getTabs(),
    boardChat: StorageService.getBoardChat(),
    supporters: StorageService.getSupporters(),
  });

  const resolveFirebaseSession = async (
    fbUser: FirebaseUser,
    expectedEpoch: number = authEpochRef.current
  ): Promise<SessionResolutionResult> => {
    if (authEpochRef.current !== expectedEpoch) {
      return { user: null, needsRegistration: false };
    }
    setAuthResolutionError('');
    try {
      const resolved = await FirestoreSync.resolveUserSession(fbUser, buildLocalSeed());
      if (authEpochRef.current !== expectedEpoch) {
        return { user: null, needsRegistration: false };
      }

      setFirebaseUser(fbUser);
      setAuthResolutionError('');
      if (resolved.needsEmailVerification) {
        setNeedsEmailVerification(true);
        setNeedsGoogleRegistration(false);
        privateListenerKeyRef.current = '';
        FirestoreSync.stopPrivateListeners();
      } else if (resolved.needsRegistration) {
        setNeedsEmailVerification(false);
        setNeedsGoogleRegistration(true);
        setIsAuthOpen(true);
      } else if (resolved.user) {
        setNeedsEmailVerification(false);
        setNeedsGoogleRegistration(false);
        setCurrentUser(resolved.user);
        StorageService.applyRemoteCurrentUser(resolved.user);
        if (resolved.user.status === 'active') {
          ensurePrivateListeners(resolved.user, fbUser);
        } else {
          privateListenerKeyRef.current = '';
          setUsers([]);
          setPublicProfiles([]);
          setFinancialNotes([]);
          setFees([]);
          setFeeSchedules([]);
          setManualReceipts([]);
          setMemberTitles([]);
          setWalkInClients([]);
          setWalkInTabs([]);
          setExpenses([]);
          setTabs([]);
          setForumPosts([]);
          setSOSAlerts([]);
          setBoardChat([]);
          setDocuments([]);
          setAnnouncements([]);
          setAuditLogs([]);
          setDeletedBackups([]);
          setIsFinanceDirty(false);
          setPendingTabAfterFinanceGuard(null);
          StorageService.clearPrivateUsersCache();
          FirestoreSync.stopPrivateListeners();
        }
      }
      return resolved;
    } catch (err) {
      if (authEpochRef.current === expectedEpoch) {
        setAuthResolutionError(formatAuthError(err));
      }
      throw err;
    }
  };

  useEffect(() => {
    currentTabRef.current = currentTab;
  }, [currentTab]);

  useEffect(() => {
    financeSubTabRef.current = financeSubTab;
  }, [financeSubTab]);

  useEffect(() => {
    isFinanceDirtyRef.current = isFinanceDirty;
  }, [isFinanceDirty]);

  useEffect(() => {
    isProfileOpenRef.current = isProfileOpen;
  }, [isProfileOpen]);

  useEffect(() => {
    isAuthOpenRef.current = isAuthOpen;
  }, [isAuthOpen]);

  useEffect(() => {
    window.history.replaceState({ tab: 'history', financeSubTab: 'members', root: true }, '');

    const handlePopState = (event: PopStateEvent) => {
      if (isProfileOpenRef.current) {
        setIsProfileOpen(false);
        return;
      }
      if (isAuthOpenRef.current) {
        setIsAuthOpen(false);
        return;
      }
      const state = event.state as { tab?: string; financeSubTab?: FinanceSubTab } | null;
      if (
        currentTabRef.current === 'finance' &&
        isFinanceDirtyRef.current &&
        state?.tab !== 'finance'
      ) {
        window.history.pushState({ tab: 'finance', financeSubTab: financeSubTabRef.current }, '');
        setFinanceLeaveError('');
        setPendingTabAfterFinanceGuard(state?.tab || 'history');
        return;
      }
      if (state?.tab) {
        setCurrentTab(state.tab);
        if (state.financeSubTab) {
          setFinanceSubTab(state.financeSubTab);
        }
        return;
      }
      if (currentTabRef.current !== 'history') {
        setCurrentTab('history');
        setFinanceSubTab('members');
        window.history.pushState({ tab: 'history', financeSubTab: 'members', root: true }, '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToMainTab = (nextTab: string, bypassFinanceGuard = false) => {
    const prevTab = currentTabRef.current;
    if (
      !bypassFinanceGuard &&
      prevTab === 'finance' &&
      nextTab !== 'finance' &&
      isFinanceDirtyRef.current
    ) {
      setFinanceLeaveError('');
      setPendingTabAfterFinanceGuard(nextTab);
      return;
    }
    setAdminPanelMode(false);
    if (nextTab === 'admin') {
      setAdminNavSignal((prev) => prev + 1);
    }
    if (nextTab === prevTab) return;
    tabHistoryRef.current = [...tabHistoryRef.current, prevTab];
    const nextFinanceSub: FinanceSubTab = nextTab === 'finance' ? 'members' : financeSubTabRef.current;
    if (nextTab === 'finance') {
      setFinanceSubTab('members');
    }
    setCurrentTab(nextTab);
    window.history.pushState({ tab: nextTab, financeSubTab: nextFinanceSub }, '');
  };

  const handleOpenAdminPanel = (bypassFinanceGuard = false) => {
    const activeUser = StorageService.getCurrentUser() || currentUser;
    if (!isActiveAdminUser(activeUser)) return;
    const prevTab = currentTabRef.current;
    if (!bypassFinanceGuard && prevTab === 'finance' && isFinanceDirtyRef.current) {
      setFinanceLeaveError('');
      setPendingTabAfterFinanceGuard('__admin_panel__');
      return;
    }
    setAdminPanelMode(true);
    setAdminNavSignal((prev) => prev + 1);
    if (prevTab !== 'admin') {
      tabHistoryRef.current = [...tabHistoryRef.current, prevTab];
      setCurrentTab('admin');
      window.history.pushState({ tab: 'admin', financeSubTab: financeSubTabRef.current, adminPanel: true }, '');
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleChangeFinanceSubTab = (sub: FinanceSubTab) => {
    setFinanceSubTab(sub);
    window.history.pushState({ tab: 'finance', financeSubTab: sub }, '');
  };

  const handleFinanceNavigateBack = () => {
    const prev = tabHistoryRef.current[tabHistoryRef.current.length - 1];
    const targetTab = prev || 'history';
    if (isFinanceDirtyRef.current && targetTab !== 'finance') {
      setFinanceLeaveError('');
      setPendingTabAfterFinanceGuard(targetTab);
      return;
    }
    tabHistoryRef.current.pop();
    setCurrentTab(targetTab);
    playSound('click');
  };

  const handleOpenAuthModal = () => {
    setIsAuthOpen(true);
    window.history.pushState(
      { tab: currentTabRef.current, financeSubTab: financeSubTabRef.current, modal: 'auth' },
      ''
    );
  };

  const handleOpenProfileModal = () => {
    setIsProfileOpen(true);
    window.history.pushState(
      { tab: currentTabRef.current, financeSubTab: financeSubTabRef.current, modal: 'profile' },
      ''
    );
  };

  // Sync state on local storage events
  const reloadFromStorage = () => {
    setClubInfo(StorageService.getClubInfo());
    setBoardRoles(StorageService.getBoardRoles());
    const storedCurrentUser = StorageService.getCurrentUser();
    const isActiveStored = storedCurrentUser?.status === 'active';
    setUsers(isActiveStored ? StorageService.getUsers() : []);
    setPublicProfiles(isActiveStored ? StorageService.getPublicProfiles() : []);
    setFinancialNotes(isActiveStored ? StorageService.getFinancialNotes() : []);
    setCurrentUser(storedCurrentUser);
    setEvents(StorageService.getEvents());
    setForumPosts(StorageService.getForumPosts());
    setSOSAlerts(StorageService.getSOSAlerts());
    setFees(StorageService.getFees());
    setFeeSchedules(StorageService.getFeeSchedules());
    setManualReceipts(StorageService.getManualReceipts());
    setMemberTitles(StorageService.getMemberTitles());
    setWalkInClients(StorageService.getWalkInClients());
    setWalkInTabs(StorageService.getWalkInTabs());
    setExpenses(StorageService.getExpenses());
    setTabs(StorageService.getTabs());
    setBoardChat(StorageService.getBoardChat());
    setSupporters(StorageService.getSupporters());
    setDocuments(StorageService.getDocuments());
    setGovernanceDocs(StorageService.getGovernanceDocs());
    const storedAnnouncements = StorageService.getAnnouncements();
    setAnnouncements(storedAnnouncements);
    if (storedAnnouncements.length > 0) {
      setPublicAnnouncements(storedAnnouncements.filter((a) => a.isPublic));
    }
    const allowAdminData = isActiveAdminUser(storedCurrentUser);
    setAuditLogs(allowAdminData ? StorageService.getAuditLogs() : []);
    setDeletedBackups(allowAdminData ? StorageService.getDeletedBackups() : []);
  };

  useEffect(() => {
    window.addEventListener('oficina_data_changed', reloadFromStorage);
    const handleSwUpdate = () => setSwUpdateAvailable(true);
    window.addEventListener('oficina_sw_update_available', handleSwUpdate);
    return () => {
      window.removeEventListener('oficina_data_changed', reloadFromStorage);
      window.removeEventListener('oficina_sw_update_available', handleSwUpdate);
    };
  }, []);

  useEffect(() => {
    FirestoreSync.setActiveSection(currentTab);
  }, [currentTab, currentUser?.status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  // Register Firestore real-time callbacks & listen to Firebase Auth
  useEffect(() => {
    let errorTimer: ReturnType<typeof setTimeout> | null = null;

    FirestoreSync.registerCallbacks({
      onClubInfo: (info) => {
        setClubInfo(info);
        StorageService.applyRemoteClubInfo(info);
      },
      onBoardRoles: (roles) => {
        setBoardRoles(roles);
        StorageService.applyRemoteBoardRoles(roles);
      },
      onUsers: (list) => {
        setUsers(list);
        StorageService.applyRemoteUsers(list);
      },
      onPublicProfiles: (profiles) => {
        setPublicProfiles(profiles);
        StorageService.applyRemotePublicProfiles(profiles);
      },
      onFinancialNotes: (notes) => {
        setFinancialNotes(notes);
        StorageService.applyRemoteFinancialNotes(notes);
      },
      onCurrentUser: (user) => {
        setCurrentUser(user);
        StorageService.applyRemoteCurrentUser(user);
      },
      onEvents: (list) => {
        setEvents(list);
        StorageService.applyRemoteEvents(list);
      },
      onForumPosts: (list) => {
        setForumPosts(list);
        StorageService.applyRemoteForumPosts(list);
      },
      onSOSAlerts: (list) => {
        setSOSAlerts(list);
        StorageService.applyRemoteSOSAlerts(list);
      },
      onFees: (list) => {
        setFees(list);
        StorageService.applyRemoteFees(list);
      },
      onFeeSchedules: (schedules) => {
        setFeeSchedules(schedules);
        StorageService.applyRemoteFeeSchedules(schedules);
      },
      onManualReceipts: (entries) => {
        setManualReceipts(entries);
        StorageService.applyRemoteManualReceipts(entries);
      },
      onMemberTitles: (titles) => {
        setMemberTitles(titles);
        StorageService.applyRemoteMemberTitles(titles);
      },
      onWalkInClients: (clients) => {
        setWalkInClients(clients);
        StorageService.applyRemoteWalkInClients(clients);
      },
      onWalkInTabs: (list) => {
        setWalkInTabs(list);
        StorageService.applyRemoteWalkInTabs(list);
      },
      onExpenses: (list) => {
        setExpenses(list);
        StorageService.applyRemoteExpenses(list);
      },
      onTabs: (list) => {
        setTabs(list);
        StorageService.applyRemoteTabs(list);
      },
      onBoardChat: (list) => {
        setBoardChat(list);
        StorageService.applyRemoteBoardChat(list);
      },
      onSupporters: (list) => {
        setSupporters(list);
        StorageService.applyRemoteSupporters(list);
      },
      onDocuments: (list) => {
        setDocuments(list);
        StorageService.applyRemoteDocuments(list);
      },
      onGovernance: (list) => {
        setGovernanceDocs(list);
        StorageService.applyRemoteGovernanceDocs(list);
      },
      onAnnouncements: (items) => {
        setAnnouncements(items);
        StorageService.applyRemoteAnnouncements(items);
      },
      onPublicAnnouncements: (items) => {
        setPublicAnnouncements(items);
      },
      onAuditLogs: (logs) => {
        if (!isActiveAdminUser(StorageService.getCurrentUser())) {
          setAuditLogs([]);
          return;
        }
        setAuditLogs(logs);
        StorageService.applyRemoteAuditLogs(logs);
      },
      onDeletedBackups: (items) => {
        if (!isActiveAdminUser(StorageService.getCurrentUser())) {
          setDeletedBackups([]);
          return;
        }
        setDeletedBackups(items);
        StorageService.applyRemoteDeletedBackups(items);
      },
      onQuotaStatusChange: (status) => {
        setQuotaStatus(status);
      },
      onSyncError: (msg) => {
        setSyncError(msg);
        if (errorTimer) clearTimeout(errorTimer);
        errorTimer = setTimeout(() => setSyncError(''), 6000);
      },
    });

    FirestoreSync.startPublicListeners();

    consumeGoogleRedirectResult()
      .then(async (cred) => {
        if (cred?.user) {
          const epoch = authEpochRef.current;
          try {
            await resolveFirebaseSession(cred.user, epoch);
          } catch (err) {
            console.error('Erro ao concluir autenticação via redirecionamento:', err);
            const msg = formatAuthError(err);
            setAuthResolutionError(msg);
            setSyncError(msg);
            setIsAuthOpen(true);
          }
        }
      })
      .catch((err) => {
        console.warn('Redirect auth notice:', err);
        const msg = formatAuthError(err);
        setAuthResolutionError(msg);
        setSyncError(msg);
      });

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      const epoch = authEpochRef.current;
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          await resolveFirebaseSession(fbUser, epoch);
        } catch (err) {
          console.error('Erro ao resolver sessão:', err);
          setAuthResolutionError(formatAuthError(err));
        }
      } else {
        privateListenerKeyRef.current = '';
        setAuthResolutionError('');
        setCurrentUser(null);
        setUsers([]);
        setPublicProfiles([]);
        setFinancialNotes([]);
        setFees([]);
        setFeeSchedules([]);
        setManualReceipts([]);
        setMemberTitles([]);
        setWalkInClients([]);
        setWalkInTabs([]);
        setExpenses([]);
        setTabs([]);
        setForumPosts([]);
        setSOSAlerts([]);
        setBoardChat([]);
        setDocuments([]);
        setAnnouncements([]);
        setAuditLogs([]);
        setDeletedBackups([]);
        setIsFinanceDirty(false);
        setPendingTabAfterFinanceGuard(null);
        StorageService.applyRemoteCurrentUser(null);
        void StorageService.clearAllPrivateCaches();
        setNeedsGoogleRegistration(false);
        setNeedsEmailVerification(false);
        FirestoreSync.stopPrivateListeners();
      }
    });

    const handleOnline = () => {
      FirestoreSync.refreshPublicFromServer(false).catch(() => {});
      const activeUser = StorageService.getCurrentUser();
      if (
        activeUser &&
        activeUser.status === 'active' &&
        (activeUser.role === 'admin' || activeUser.role === 'board')
      ) {
        void BackupService.flushOfflineQueue();
      }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      if (errorTimer) clearTimeout(errorTimer);
      window.removeEventListener('online', handleOnline);
      unsubAuth();
      FirestoreSync.stopPublicListeners();
      FirestoreSync.stopPrivateListeners();
    };
  }, []);

  useEffect(() => {
    const isBoardOrAdmin = Boolean(
      currentUser &&
        currentUser.status === 'active' &&
        (currentUser.role === 'admin' || currentUser.role === 'board')
    );
    if (['documents', 'finance', 'board'].includes(currentTab) && !isBoardOrAdmin) {
      setIsFinanceDirty(false);
      setCurrentTab('history');
    }
    if (!isActiveAdminUser(currentUser)) {
      if (adminPanelMode) setAdminPanelMode(false);
    }
  }, [currentTab, currentUser, adminPanelMode]);

  const handleResetSessionForSwitch = async () => {
    authEpochRef.current += 1;
    privateListenerKeyRef.current = '';
    setAuthResolutionError('');
    setNeedsGoogleRegistration(false);
    setNeedsEmailVerification(false);
    FirestoreSync.resetAuthCaches();
    await signOutCleanly();
    setFirebaseUser(null);
    setCurrentUser(null);
    setUsers([]);
    setPublicProfiles([]);
    setFinancialNotes([]);
    setFees([]);
    setFeeSchedules([]);
    setManualReceipts([]);
    setMemberTitles([]);
    setWalkInClients([]);
    setWalkInTabs([]);
    setExpenses([]);
    setTabs([]);
    setForumPosts([]);
    setSOSAlerts([]);
    setBoardChat([]);
    setIsFinanceDirty(false);
    setPendingTabAfterFinanceGuard(null);
    StorageService.applyRemoteCurrentUser(null);
    await StorageService.clearAllPrivateCaches();
    setDocuments([]);
    StorageService.applyRemoteDocuments([]);
    setAnnouncements([]);
    setAuditLogs([]);
    setDeletedBackups([]);
    FirestoreSync.refreshPublicFromServer(false).catch(() => {});
  };

  const handleLogout = async () => {
    setIsProfileOpen(false);
    setIsAuthOpen(false);
    await handleResetSessionForSwitch();
    if (['forum', 'admin', 'finance', 'board', 'sos', 'documents', 'statute'].includes(currentTab)) {
      setCurrentTab('history');
    }
    playSound('beep');
  };

  const handleShareApp = async () => {
    const isDevOrLocal =
      window.location.hostname.includes('ais-dev-') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    const shareUrl = isDevOrLocal
      ? 'https://ais-pre-77cpndelgwvk7mcxm44ixn-312435081010.us-west1.run.app/'
      : `${window.location.origin}/`;
    const shareData = {
      title: 'Oficina do Rock Motoclube | Ibiúna - SP',
      text: 'Confira o portal oficial do Oficina do Rock Motoclube (Ibiúna - SP): História, Sede, Passeios e SUPPORT XV!',
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        playSound('success');
        return;
      }
    } catch (err) {
      // User cancelled share sheet or not supported; fallback to clipboard below
      console.debug('Share skipped/fallback', err);
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareNotice('Link oficial copiado! Agora é só colar e compartilhar no WhatsApp.');
      playSound('success');
      setTimeout(() => setShareNotice(''), 4000);
    } catch {
      setShareNotice(`Compartilhe o link: ${shareUrl}`);
      setTimeout(() => setShareNotice(''), 5000);
    }
  };

  const activeSosCount = sosAlerts.filter((a) => a.status !== 'resolved').length;

  const hiddenFinancialYearsSet = new Set(clubInfo.hiddenFinancialYears || []);
  const currentMemberIsExempt = Boolean(
    currentUser &&
      ((isMemberCurrentlyMinor(currentUser) && !hasExplicitManualPagante(currentUser)) ||
        resolveMemberFeeStatusInfo(currentUser).isExempt)
  );
  const myPendingDebtCount =
    currentUser && !currentMemberIsExempt
      ? (currentUser.status === 'active'
          ? buildAutoMemberMonthlyFees(currentUser, fees, clubInfo, { feeSchedules }).filter(
              (f) => !(f.isAutoGenerated && hiddenFinancialYearsSet.has(f.yearNumber))
            )
          : fees.filter((f) => f.memberId === currentUser.id)
        ).filter((f) => classifyMonthlyFee(f, currentUser).isDebt).length +
        tabs.filter(
          (t) =>
            t.memberId === currentUser.id &&
            !isTabWrittenOff(t) &&
            t.status === 'pending' &&
            t.settlementStatus !== 'paid'
        ).length
      : 0;

  const isSosPrivileged = Boolean(currentUser && currentUser.status === 'active' && currentUser.sosApproved);

  const nowLocal = new Date();
  const todayIso = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
  const todayMonthDay = `${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

  const todaysBirthdays = users.filter(
    (u) => u.status === 'active' && Boolean(u.birthDate && u.birthDate.length >= 10) && u.birthDate!.slice(5, 10) === todayMonthDay
  );

  const todaysClubAnniversaries = users
    .filter((u) => {
      if (u.status !== 'active' || !u.joinedDate || u.joinedDate.length < 10) return false;
      if (u.joinedDate.slice(5, 10) !== todayMonthDay) return false;
      const joinedYr = parseInt(u.joinedDate.slice(0, 4), 10);
      return !Number.isNaN(joinedYr) && nowLocal.getFullYear() >= joinedYr;
    })
    .map((u) => {
      const joinedYr = parseInt(u.joinedDate!.slice(0, 4), 10);
      return {
        user: u,
        yearsInClub: Math.max(0, nowLocal.getFullYear() - joinedYr),
      };
    });

  const hasTodaysCelebrations = todaysBirthdays.length > 0 || todaysClubAnniversaries.length > 0;
  const celebrationSignature = [
    ...todaysBirthdays.map((u) => `b:${u.id}`),
    ...todaysClubAnniversaries.map((c) => `c:${c.user.id}`),
  ].join(',');

  const buildCelebrationSummaryText = () => {
    const parts: string[] = [];
    if (todaysBirthdays.length > 0) {
      parts.push(
        `🎂 Aniversário: ${todaysBirthdays.map((u) => getMemberDisplayName(u)).join(', ')}`
      );
    }
    if (todaysClubAnniversaries.length > 0) {
      parts.push(
        `🏆 Entrada no Motoclube: ${todaysClubAnniversaries
          .map(({ user, yearsInClub }) =>
            `${getMemberDisplayName(user)} (${yearsInClub > 0 ? `${yearsInClub} ${yearsInClub === 1 ? 'ano' : 'anos'}` : 'Ingresso hoje'})`
          )
          .join(', ')}`
      );
    }
    return parts.join(' | ');
  };

  useEffect(() => {
    if (!currentUser || currentUser.status !== 'active' || !hasTodaysCelebrations) return;

    const popupKey = `oficina_celebration_popup_${todayIso}_${currentUser.id}_${celebrationSignature}`;
    const sysNotifKey = `oficina_celebration_sys_${todayIso}_${currentUser.id}_${celebrationSignature}`;

    try {
      if (!localStorage.getItem(popupKey)) {
        localStorage.setItem(popupKey, '1');
        setCelebrationModalOpen(true);
        playSound('success');
      }
      if (notificationPermission === 'granted' && !localStorage.getItem(sysNotifKey)) {
        localStorage.setItem(sysNotifKey, '1');
        const title = 'Oficina do Rock MC — Celebrações do Dia!';
        const body = buildCelebrationSummaryText();
        sendBrowserNotification(title, body, `celebration-${todayIso}`).catch(() => {});
      }
    } catch {
      setCelebrationModalOpen(true);
    }
  }, [currentUser?.id, currentUser?.status, todayIso, celebrationSignature, hasTodaysCelebrations, notificationPermission]);

  const handleEnableNotifications = async () => {
    const result = await requestBrowserNotificationPermission();
    setNotificationPermission(result);
    if (result === 'granted') {
      playSound('success');
      if (hasTodaysCelebrations) {
        const body = buildCelebrationSummaryText();
        sendBrowserNotification(
          'Oficina do Rock MC — Celebrações do Dia!',
          body,
          `celebration-${todayIso}`
        ).catch(() => {});
      }
    } else {
      playSound('beep');
    }
  };

  const handlePublishCelebrationToForum = async () => {
    if (!currentUser || !hasTodaysCelebrations) return;
    const lines: string[] = [];
    if (todaysBirthdays.length > 0) {
      lines.push(
        `🎂 Feliz Aniversário aos irmãos: ${todaysBirthdays
          .map((u) => getMemberDisplayName(u))
          .join(', ')}! Muita saúde, paz e estradas livres!`
      );
    }
    if (todaysClubAnniversaries.length > 0) {
      lines.push(
        `🏆 Parabéns pelo Aniversário de Entrada no Oficina do Rock Motoclube: ${todaysClubAnniversaries
          .map(({ user, yearsInClub }) =>
            `${getMemberDisplayName(user)} (${yearsInClub > 0 ? `${yearsInClub} ${yearsInClub === 1 ? 'ano' : 'anos'} de irmandade` : 'ingresso hoje'})`
          )
          .join(', ')}!`
      );
    }

    const post: ForumPost = {
      id: `post-celebration-${todayIso}-${Date.now()}`,
      authorId: currentUser.id,
      authorName: getMemberDisplayName(currentUser),
      authorRole: currentUser.role,
      authorAvatar: currentUser.avatarUrl,
      title: 'Celebrações do Dia no Oficina do Rock MC!',
      content: lines.join('\n\n'),
      category: 'general',
      createdAt: new Date().toISOString(),
      likes: [],
      comments: [],
    };
    const updatedPosts = [post, ...forumPosts];
    try {
      await StorageService.saveForumPostsConfirmed(updatedPosts);
      setForumPosts(updatedPosts);
      setForumCelebrationSent(true);
      playSound('success');
    } catch (err) {
      setSyncError(formatAuthError(err));
      playSound('beep');
    }
  };

  const handleGoToCalendarCelebrations = () => {
    setCelebrationModalOpen(false);
    setOpenCalendarSignal((prev) => prev + 1);
    navigateToMainTab('events');
  };

  const isAdminUser = isActiveAdminUser(currentUser);
  const pendingMembersCount = isAdminUser
    ? users.filter((u) => u.status === 'pending').length
    : 0;

  const hasPendingAdminUpdate = Boolean(
    clubInfo.appUpdateId && clubInfo.appUpdateId !== acknowledgedUpdateId
  );
  const hasAppUpdateAvailable = hasPendingAdminUpdate || swUpdateAvailable;

  useEffect(() => {
    setDismissedUpdateBanner(false);
  }, [clubInfo.appUpdateId]);

  useEffect(() => {
    if (!hasPendingAdminUpdate || !clubInfo.appUpdateId || notificationPermission !== 'granted') {
      return;
    }
    const notifKey = `oficina_app_update_sys_${clubInfo.appUpdateId}`;
    try {
      if (!localStorage.getItem(notifKey)) {
        localStorage.setItem(notifKey, '1');
        sendBrowserNotification(
          `Oficina do Rock MC — Nova Atualização ${clubInfo.appUpdateVersion || 'Disponível'}!`,
          clubInfo.appUpdateMessage ||
            'O administrador publicou uma atualização no app. Clique em Atualizar Agora para carregar a versão mais recente.',
          `app-update-${clubInfo.appUpdateId}`
        ).catch(() => {});
      }
    } catch {
      // ignore storage failures
    }
  }, [hasPendingAdminUpdate, clubInfo.appUpdateId, clubInfo.appUpdateVersion, clubInfo.appUpdateMessage, notificationPermission]);

  const handleApplyAppUpdate = async () => {
    if (clubInfo.appUpdateId) {
      try {
        localStorage.setItem('oficina_ack_app_update_id', clubInfo.appUpdateId);
      } catch {
        // ignore storage failures
      }
      setAcknowledgedUpdateId(clubInfo.appUpdateId);
    }
    setDismissedUpdateBanner(true);
    setSwUpdateAvailable(false);
    setNotificationsModalOpen(false);
    playSound('success');
    try {
      await FirestoreSync.refreshPublicFromServer(true);
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(async (reg) => {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            await reg.update().catch(() => {});
          })
        );
      }
    } catch {
      // proceed to reload cleanly
    }
    window.location.reload();
  };

  interface NotificationEntry {
    id: string;
    kind: 'update' | 'birthday' | 'anniversary' | 'debt' | 'sos' | 'pending_member' | 'announcement';
    title: string;
    subtitle: string;
    actionLabel: string;
    onAction: () => void;
  }

  const notificationsList: NotificationEntry[] = [];

  if (hasAppUpdateAvailable) {
    notificationsList.push({
      id: `notif-update-${clubInfo.appUpdateId || 'sw'}`,
      kind: 'update',
      title: `Atualização Disponível no App${clubInfo.appUpdateVersion ? ` (${clubInfo.appUpdateVersion})` : ''}`,
      subtitle:
        clubInfo.appUpdateMessage ||
        'Nova atualização publicada pelo administrador. Atualize agora para carregar as novidades.',
      actionLabel: 'Atualizar Agora',
      onAction: () => {
        void handleApplyAppUpdate();
      },
    });
  }

  if (currentUser?.status === 'active') {
    announcements.slice(0, 6).forEach((ann) => {
      notificationsList.push({
        id: `notif-ann-${ann.id}`,
        kind: 'announcement',
        title: `${ann.pinned ? '📌 ' : ''}${ann.title}`,
        subtitle: ann.message,
        actionLabel: 'Ver Início',
        onAction: () => {
          setReadNotifIds(StorageService.markNotificationRead(`notif-ann-${ann.id}`));
          setNotificationsModalOpen(false);
          navigateToMainTab('history');
        },
      });
    });

    todaysBirthdays.forEach((bUser) => {
      notificationsList.push({
        id: `notif-bday-${bUser.id}`,
        kind: 'birthday',
        title: `Aniversário de ${getMemberDisplayName(bUser)}`,
        subtitle: 'Integrante aniversariando hoje! Veja no calendário do Motoclube.',
        actionLabel: 'Ver Calendário',
        onAction: () => {
          setReadNotifIds(StorageService.markNotificationRead(`notif-bday-${bUser.id}`));
          setNotificationsModalOpen(false);
          setOpenCalendarSignal((prev) => prev + 1);
          navigateToMainTab('events');
        },
      });
    });

    todaysClubAnniversaries.forEach(({ user: cUser, yearsInClub }) => {
      notificationsList.push({
        id: `notif-mc-${cUser.id}`,
        kind: 'anniversary',
        title: `Aniversário no Motoclube: ${getMemberDisplayName(cUser)}`,
        subtitle:
          yearsInClub > 0
            ? `Completa hoje ${yearsInClub} ${yearsInClub === 1 ? 'ano' : 'anos'} de Oficina do Rock MC!`
            : 'Data de ingresso oficial celebrada hoje no Motoclube!',
        actionLabel: 'Ver Calendário',
        onAction: () => {
          setReadNotifIds(StorageService.markNotificationRead(`notif-mc-${cUser.id}`));
          setNotificationsModalOpen(false);
          setOpenCalendarSignal((prev) => prev + 1);
          navigateToMainTab('events');
        },
      });
    });

    if (myPendingDebtCount > 0) {
      notificationsList.push({
        id: 'notif-my-debt',
        kind: 'debt',
        title: 'Você possui débitos pendentes no Motoclube',
        subtitle: `${myPendingDebtCount} ${myPendingDebtCount === 1 ? 'pendência financeira aberta' : 'pendências financeiras abertas'} em sua conta.`,
        actionLabel: 'Ver Meu Perfil / Pix',
        onAction: () => {
          setReadNotifIds(StorageService.markNotificationRead('notif-my-debt'));
          setNotificationsModalOpen(false);
          handleOpenProfileModal();
        },
      });
    }
  }

  if (isSosPrivileged && activeSosCount > 0) {
    notificationsList.push({
      id: 'notif-sos-active',
      kind: 'sos',
      title: `Alerta SOS Rodovia Ativo (${activeSosCount})`,
      subtitle: 'Há integrante solicitando apoio em rota agora. Verifique imediatamente.',
      actionLabel: 'Abrir SOS',
      onAction: () => {
        setReadNotifIds(StorageService.markNotificationRead('notif-sos-active'));
        setNotificationsModalOpen(false);
        navigateToMainTab('sos');
      },
    });
  }

  if (isAdminUser && pendingMembersCount > 0) {
    notificationsList.push({
      id: 'notif-admin-pending-users',
      kind: 'pending_member',
      title: `${pendingMembersCount} ${pendingMembersCount === 1 ? 'integrante aguardando aprovação' : 'integrantes aguardando aprovação'}`,
      subtitle: 'Acesse o Painel Admin para aprovar ou associar cadastros pendentes.',
      actionLabel: 'Abrir Admin',
      onAction: () => {
        setReadNotifIds(StorageService.markNotificationRead('notif-admin-pending-users'));
        setNotificationsModalOpen(false);
        handleOpenAdminPanel();
      },
    });
  }

  const unreadNotificationsCount = notificationsList.filter(
    (item) => !readNotifIds.includes(item.id)
  ).length;

  const brazilTodayIso = getBrazilTodayIso();
  const upcomingRides = events
    .filter(
      (ev) =>
        !ev.isExclusiveBoard ||
        (currentUser?.status === 'active' &&
          (currentUser.role === 'admin' || currentUser.role === 'board'))
    )
    .filter((ev) => isEventUpcomingOrOngoing(ev, brazilTodayIso))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  const handleManualHeaderRefresh = async () => {
    if (isRefreshingSync) return;
    setIsRefreshingSync(true);
    try {
      await FirestoreSync.manualSyncRefresh();
      playSound('success');
    } catch (err) {
      setSyncError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsRefreshingSync(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-100 flex flex-col selection:bg-amber-400 selection:text-black">
      {/* Offline Indicator */}
      <OfflineIndicator />

      {/* Share Toast Feedback */}
      {shareNotice && (
        <div className="fixed bottom-20 xl:bottom-6 right-4 z-50 bg-zinc-950 border border-amber-400 text-amber-300 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold max-w-sm">
          <Check className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{shareNotice}</span>
        </div>
      )}

      {/* Cloud Sync Error Toast */}
      {syncError && (
        <div className="fixed bottom-20 xl:bottom-6 left-4 z-50 bg-zinc-950 border border-red-500/70 text-red-200 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold max-w-md">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="flex-1">{syncError}</span>
          <button
            onClick={() => setSyncError('')}
            className="text-zinc-400 hover:text-white p-0.5"
            aria-label="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Floating SOS Banner (if emergency is active) */}
      <SosBanner
        currentUser={currentUser}
        onNavigateToSos={() => navigateToMainTab('sos')}
      />

      {/* Main Header with Crest on Top Left & Menu Lateral */}
      <Header
        currentTab={currentTab}
        onSelectTab={(nextTab) => navigateToMainTab(nextTab)}
        onOpenCalendar={() => {
          setOpenCalendarSignal((prev) => prev + 1);
          navigateToMainTab('events');
        }}
        currentUser={currentUser}
        clubInfo={clubInfo}
        onUpdateClubInfo={setClubInfo}
        onOpenAuth={handleOpenAuthModal}
        onOpenProfile={handleOpenProfileModal}
        onShareApp={handleShareApp}
        onLogout={handleLogout}
        activeSosCount={activeSosCount}
        notificationsCount={unreadNotificationsCount}
        onOpenNotifications={() => setNotificationsModalOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        adminPanelActive={adminPanelMode && isAdminUser}
        onOpenAdminPanel={() => handleOpenAdminPanel()}
        pendingMembersCount={pendingMembersCount}
        onManualRefresh={handleManualHeaderRefresh}
        isRefreshingSync={isRefreshingSync}
        quotaBlocked={quotaStatus.blocked}
      />

      {/* Firestore Quota Circuit Breaker Economic Cache Banner */}
      {quotaStatus.blocked && (
        <div className="bg-amber-950/50 border-b border-amber-500/40 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {quotaStatus.reason ||
                  'Modo econômico via cache local ativo para preservar a cota diária do Firestore.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                void FirestoreSync.retryAfterQuota();
                playSound('click');
              }}
              className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase text-[10px] rounded-lg flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Tentar Sincronizar Agora</span>
            </button>
          </div>
        </div>
      )}

      {/* App Update Available Notification Banner */}
      {hasAppUpdateAvailable && !dismissedUpdateBanner && (
        <div className="bg-gradient-to-r from-emerald-600/25 via-amber-500/20 to-zinc-900 border-b border-emerald-400/50 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 text-center sm:text-left">
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-emerald-300 shrink-0">
                <RefreshCw className="w-4 h-4 animate-spin" />
              </div>
              <div className="space-y-0.5">
                <span className="font-rock text-sm uppercase font-bold text-emerald-300 block">
                  Atualização Disponível no Aplicativo
                  {clubInfo.appUpdateVersion ? ` — ${clubInfo.appUpdateVersion}` : ''}
                </span>
                <p className="text-zinc-200 text-xs">
                  {clubInfo.appUpdateMessage ||
                    'O administrador publicou novidades e melhorias no sistema. Clique em Atualizar Agora para aplicar.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  void handleApplyAppUpdate();
                }}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-rock text-xs font-bold uppercase rounded-lg flex items-center gap-1.5 shadow-lg"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualizar Agora</span>
              </button>
              <button
                type="button"
                onClick={() => setDismissedUpdateBanner(true)}
                className="px-2.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg text-[10px] font-bold uppercase"
              >
                Depois
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Daily Birthday & Club Entry Anniversary Notification Banner */}
      {currentUser?.status === 'active' && hasTodaysCelebrations && !dismissedBirthdayBanner && (
        <div className="bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-zinc-900 border-b border-amber-400/40 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
              <div className="w-8 h-8 rounded-full bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0">
                <BellRing className="w-4 h-4 animate-bounce" />
              </div>
              <div className="text-center sm:text-left space-y-1">
                <span className="font-rock text-sm uppercase font-bold text-amber-400 block">
                  Notificação de Aniversários & Tempo de Motoclube Hoje!
                </span>
                <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                  {todaysBirthdays.map((bUser) => (
                    <div
                      key={`banner-bday-${bUser.id}`}
                      className="flex items-center gap-1.5 bg-zinc-950/80 border border-sky-400/40 rounded-lg px-2 py-1"
                    >
                      <Cake className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <img
                        src={bUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=60&q=80'}
                        alt={getMemberDisplayName(bUser)}
                        className="w-5 h-5 rounded-full object-cover border border-sky-400"
                      />
                      <span className="font-bold text-white">{getMemberDisplayName(bUser)}</span>
                      <span className="text-[10px] text-sky-300 font-semibold">Aniversário</span>
                      {bUser.phone && (
                        <a
                          href={`https://wa.me/55${bUser.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                            `Parabéns irmão ${getMemberDisplayName(bUser)}! Feliz aniversário, saúde e muitas estradas pela frente! — Oficina do Rock MC`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 px-1.5 py-0.5 bg-green-600 hover:bg-green-500 text-white rounded text-[9px] font-bold uppercase"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  ))}

                  {todaysClubAnniversaries.map(({ user: cUser, yearsInClub }) => (
                    <div
                      key={`banner-mc-${cUser.id}`}
                      className="flex items-center gap-1.5 bg-zinc-950/80 border border-emerald-400/40 rounded-lg px-2 py-1"
                    >
                      <Award className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <img
                        src={cUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=60&q=80'}
                        alt={getMemberDisplayName(cUser)}
                        className="w-5 h-5 rounded-full object-cover border border-emerald-400"
                      />
                      <span className="font-bold text-white">{getMemberDisplayName(cUser)}</span>
                      <span className="text-[10px] text-emerald-300 font-semibold">
                        {yearsInClub > 0
                          ? `${yearsInClub} ${yearsInClub === 1 ? 'ano' : 'anos'} de MC`
                          : 'Entrada no MC'}
                      </span>
                      {cUser.phone && (
                        <a
                          href={`https://wa.me/55${cUser.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                            `Parabéns irmão ${getMemberDisplayName(cUser)} pelo seu aniversário de entrada no Oficina do Rock Motoclube (${yearsInClub > 0 ? `${yearsInClub} ${yearsInClub === 1 ? 'ano' : 'anos'} de irmandade` : 'ingresso oficial'})! — Oficina do Rock MC`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 px-1.5 py-0.5 bg-green-600 hover:bg-green-500 text-white rounded text-[9px] font-bold uppercase"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-center">
              {notificationPermission === 'default' && (
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-black rounded-lg text-[10px] font-bold uppercase flex items-center gap-1"
                >
                  <BellRing className="w-3 h-3" />
                  <span>Ativar Notificações</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleGoToCalendarCelebrations}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-400/40 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1"
              >
                <Calendar className="w-3 h-3" />
                <span>Calendário</span>
              </button>
              <button
                type="button"
                onClick={() => setDismissedBirthdayBanner(true)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/80 shrink-0"
                title="Ocultar lembrete de hoje"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-24 xl:pb-10">
        {currentTab === 'history' && (
          <div className="space-y-12">
            {( (currentUser?.status === 'active' && announcements.length > 0) || upcomingRides.length > 0 ) && (
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {currentUser?.status === 'active' && announcements.length > 0 && (
                  <div className="bg-[#121216] border border-amber-400/35 rounded-2xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-rock text-sm uppercase font-bold text-amber-400 flex items-center gap-2">
                        <Megaphone className="w-4 h-4" />
                        <span>Comunicados Oficiais</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setNotificationsModalOpen(true)}
                        className="text-[11px] font-bold uppercase text-zinc-400 hover:text-amber-300"
                      >
                        Ver Todos
                      </button>
                    </div>
                    <div className="space-y-2">
                      {announcements.slice(0, 2).map((ann) => (
                        <div
                          key={ann.id}
                          className={`p-3 rounded-xl border text-xs space-y-1 ${
                            ann.kind === 'urgent'
                              ? 'bg-red-950/35 border-red-500/40'
                              : 'bg-zinc-950/80 border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-white flex items-center gap-1.5 truncate">
                              {ann.pinned && <Pin className="w-3 h-3 text-amber-400 shrink-0" />}
                              <span className="truncate">{ann.title}</span>
                            </span>
                            <span className="text-[10px] text-zinc-500 shrink-0">
                              {ann.createdAt ? new Date(ann.createdAt).toLocaleDateString('pt-BR') : ''}
                            </span>
                          </div>
                          <p className="text-zinc-300 line-clamp-2 leading-relaxed">{ann.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {upcomingRides.length > 0 && (
                  <div
                    className={`bg-[#121216] border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-3 ${
                      !(currentUser?.status === 'active' && announcements.length > 0) ? 'lg:col-span-2' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-rock text-sm uppercase font-bold text-amber-400 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{clubInfo.eventsButtonLabel || 'Próximos Passeios & Eventos'}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => navigateToMainTab('events')}
                        className="text-[11px] font-bold uppercase text-amber-300 hover:text-amber-200 flex items-center gap-1"
                      >
                        <span>Ver Agenda</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {upcomingRides.map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => navigateToMainTab('events')}
                          className="text-left p-3 rounded-xl bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-amber-400/40 transition-colors space-y-1"
                        >
                          <div className="flex items-center justify-between text-[10px] font-bold text-amber-400 uppercase">
                            <span>{formatEventPeriodLabel(ev)} · {ev.time}</span>
                            {ev.isPinned && <Pin className="w-3 h-3" />}
                          </div>
                          <p className="text-xs font-bold text-white truncate">{ev.title}</p>
                          <p className="text-[11px] text-zinc-400 truncate">{ev.destination}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            <HistorySection
              clubInfo={clubInfo}
              boardRoles={boardRoles}
              users={currentUser?.status === 'active' ? users : []}
              publicAnnouncements={publicAnnouncements}
              events={events}
              currentUser={currentUser}
              onUpdateClubInfo={setClubInfo}
              onNavigateToTab={(tab) => navigateToMainTab(tab)}
            />
          </div>
        )}


        {currentTab === 'supporters' && (
          <SupportersSection
            supporters={supporters}
            clubInfo={clubInfo}
            currentUser={currentUser}
            onUpdateSupporters={setSupporters}
            onUpdateClubInfo={setClubInfo}
            onNavigateBack={() => navigateToMainTab('history')}
          />
        )}

        {currentTab === 'events' && (
          <EventsSection
            events={events}
            users={users}
            publicProfiles={publicProfiles}
            currentUser={currentUser}
            onUpdateEvents={setEvents}
            onOpenAuth={handleOpenAuthModal}
            openCalendarSignal={openCalendarSignal}
          />
        )}

        {currentTab === 'forum' && (
          <ForumSection
            posts={forumPosts}
            currentUser={currentUser}
            onUpdatePosts={setForumPosts}
            onOpenAuth={handleOpenAuthModal}
          />
        )}

        {currentTab === 'sos' && (
          <SosSection
            alerts={sosAlerts}
            users={users}
            currentUser={currentUser}
            onUpdateAlerts={setSOSAlerts}
            onUpdateUsers={setUsers}
            onOpenAuth={handleOpenAuthModal}
          />
        )}

        {currentTab === 'finance' && (
          <FinanceSection
            fees={fees}
            expenses={expenses}
            tabs={tabs}
            users={users}
            boardRoles={boardRoles}
            clubInfo={clubInfo}
            currentUser={currentUser}
            financialNotes={financialNotes}
            manualReceipts={manualReceipts}
            feeSchedules={feeSchedules}
            walkInClients={walkInClients}
            walkInTabs={walkInTabs}
            onUpdateFees={setFees}
            onUpdateExpenses={setExpenses}
            onUpdateTabs={setTabs}
            onUpdateClubInfo={setClubInfo}
            onUpdateFinancialNotes={setFinancialNotes}
            onUpdateUsers={setUsers}
            onDirtyChange={setIsFinanceDirty}
            batchControlRef={financeBatchControlRef}
            onOpenAuth={handleOpenAuthModal}
            activeSubTab={financeSubTab}
            onChangeSubTab={handleChangeFinanceSubTab}
            onNavigateBack={handleFinanceNavigateBack}
          />
        )}

        {currentTab === 'board' && (
          <BoardSection
            boardRoles={boardRoles}
            boardChat={boardChat}
            events={events}
            users={users}
            currentUser={currentUser}
            onUpdateBoardRoles={setBoardRoles}
            onUpdateBoardChat={setBoardChat}
            onUpdateEvents={setEvents}
            onUpdateUsers={setUsers}
            onOpenAuth={handleOpenAuthModal}
          />
        )}

        {currentTab === 'admin' && (
          <AdminSection
            users={users}
            publicProfiles={publicProfiles}
            boardRoles={boardRoles}
            fees={fees}
            tabs={tabs}
            expenses={expenses}
            financialNotes={financialNotes}
            clubInfo={clubInfo}
            currentUser={currentUser}
            announcements={announcements}
            auditLogs={isAdminUser ? auditLogs : []}
            deletedBackups={isAdminUser ? deletedBackups : []}
            isAdminPanelFocus={adminPanelMode && isAdminUser}
            adminNavSignal={adminNavSignal}
            onUpdateUsers={setUsers}
            onUpdateBoardRoles={setBoardRoles}
            onUpdateFees={setFees}
            onUpdateTabs={setTabs}
            onUpdateExpenses={setExpenses}
            onUpdateFinancialNotes={setFinancialNotes}
            onUpdateClubInfo={setClubInfo}
            onUpdateAnnouncements={setAnnouncements}
            onUpdateAuditLogs={setAuditLogs}
            onUpdateDeletedBackups={setDeletedBackups}
            onOpenAuth={handleOpenAuthModal}
          />
        )}

        {currentTab === 'documents' && (
          <DocumentsSection
            documents={documents}
            currentUser={currentUser}
            clubInfo={clubInfo}
            onUpdateDocuments={setDocuments}
            onUpdateClubInfo={setClubInfo}
            onOpenAuth={handleOpenAuthModal}
          />
        )}

        {currentTab === 'statute' && (
          <StatuteSection
            governanceDocs={governanceDocs}
            currentUser={currentUser}
            clubInfo={clubInfo}
            onUpdateGovernanceDocs={setGovernanceDocs}
            onOpenAuth={handleOpenAuthModal}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#09090b] border-t border-zinc-800/80 py-12 text-zinc-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4 text-center md:text-left">
              <img
                src={clubInfo.leftCrestUrl || DEFAULT_CREST_URL}
                alt="Brasão Oficial"
                referrerPolicy="no-referrer"
                className="h-16 w-auto object-contain border-0"
              />
              <div>
                <span className="font-rock text-xl font-bold uppercase text-white tracking-wider block">
                  OFICINA DO <span className="text-amber-400">ROCK</span> MOTOCLUBE
                </span>
                <span className="text-xs text-zinc-400 block mt-0.5">
                  Estância Turística de Ibiúna - SP · Fundado em 2008
                </span>
                <span className="text-[11px] text-zinc-500 block">
                  Sede: {clubInfo.address}
                </span>
              </div>
            </div>

            <div className="flex items-center flex-wrap justify-center gap-4 text-xs font-semibold">
              <a
                href={clubInfo.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 flex items-center gap-1 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>Google Maps Sede</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <span className="text-zinc-700">·</span>

              <a
                href={`https://wa.me/55${clubInfo.contactPhone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors text-zinc-300"
              >
                Contato: <strong className="text-amber-400">{clubInfo.contactPhone}</strong>
              </a>

              <span className="text-zinc-700">·</span>

              <button
                onClick={handleShareApp}
                className="px-3 py-1.5 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-400 border border-amber-400/40 flex items-center gap-1.5 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Compartilhar App</span>
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-zinc-800/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-500">
            <p>
              © 2008 - {new Date().getFullYear()} Oficina do Rock Motoclube. Todos os direitos reservados.
            </p>
            <p className="flex items-center gap-1">
              <span>Irmandade, Rock'n Roll & Respeito à Estrada</span>
              <Flame className="w-3.5 h-3.5 text-amber-500" />
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (Sticky Thumb-Friendly) */}
      <div className="xl:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0e0e12]/95 backdrop-blur-md border-t border-zinc-800/80 px-1.5 sm:px-2 py-2 flex items-center justify-around">
        <button
          onClick={() => navigateToMainTab('history')}
          className={`flex flex-col items-center gap-0.5 p-1 text-[9px] sm:text-[10px] font-bold uppercase ${
            currentTab === 'history' ? 'text-amber-400' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Sede</span>
        </button>

        <button
          onClick={() => navigateToMainTab('events')}
          className={`flex flex-col items-center gap-0.5 p-1 text-[9px] sm:text-[10px] font-bold uppercase ${
            currentTab === 'events' ? 'text-amber-400' : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Passeios</span>
        </button>

        {isSosPrivileged && (
          <button
            onClick={() => navigateToMainTab('sos')}
            className={`relative flex flex-col items-center gap-0.5 p-1 text-[9px] sm:text-[10px] font-bold uppercase ${
              currentTab === 'sos' ? 'text-red-400' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span>SOS</span>
          </button>
        )}


        {currentUser && currentUser.status === 'active' ? (
          <>
            {(currentUser.role === 'admin' || currentUser.role === 'board') ? (
              <button
                onClick={() => navigateToMainTab('finance')}
                className={`flex flex-col items-center gap-0.5 p-1 text-[9px] sm:text-[10px] font-bold uppercase ${
                  currentTab === 'finance' ? 'text-amber-400' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>Finanças</span>
              </button>
            ) : (
              <button
                onClick={() => navigateToMainTab('forum')}
                className={`flex flex-col items-center gap-0.5 p-1 text-[9px] sm:text-[10px] font-bold uppercase ${
                  currentTab === 'forum' ? 'text-amber-400' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Fórum</span>
              </button>
            )}

            {isAdminUser && (
              <button
                type="button"
                onClick={() => handleOpenAdminPanel()}
                className={`relative flex flex-col items-center gap-0.5 p-1 text-[9px] sm:text-[10px] font-bold uppercase ${
                  currentTab === 'admin' && adminPanelMode
                    ? 'text-amber-400'
                    : 'text-amber-300/90 hover:text-amber-200'
                }`}
                title="Painel Administrativo Geral"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>Admin</span>
                {pendingMembersCount > 0 && (
                  <span className="absolute -top-0.5 right-0 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-600 text-white text-[8px] font-extrabold flex items-center justify-center">
                    {pendingMembersCount > 9 ? '9+' : pendingMembersCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={handleOpenProfileModal}
              className="relative flex flex-col items-center gap-0.5 p-1 text-[9px] sm:text-[10px] font-bold uppercase text-amber-400 hover:text-amber-300"
            >
              <img
                src={currentUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'}
                alt={getMemberDisplayName(currentUser)}
                className="w-4 h-4 rounded-full object-cover border border-amber-400"
              />
              <span>Perfil</span>
            </button>
          </>
        ) : (
          <button
            onClick={handleOpenAuthModal}
            className="flex flex-col items-center gap-0.5 p-1 text-[9px] sm:text-[10px] font-bold uppercase text-amber-400 hover:text-amber-300"
          >
            <Users className="w-4 h-4" />
            <span>Entrar</span>
          </button>
        )}
      </div>

      {/* Auth / Account Switcher Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={currentUser}
        firebaseUser={firebaseUser}
        needsGoogleRegistration={needsGoogleRegistration}
        needsEmailVerification={needsEmailVerification}
        externalError={authResolutionError}
        clubInfo={clubInfo}
        onOpenSupporters={() => {
          setIsAuthOpen(false);
          navigateToMainTab('supporters');
        }}
        onResolveFirebaseUser={(fbUser) => resolveFirebaseSession(fbUser, authEpochRef.current)}
        onSwitchGoogleAccount={handleResetSessionForSwitch}
        onGoogleUserResolved={(resolvedUser) => {
          setAuthResolutionError('');
          setNeedsGoogleRegistration(false);
          setNeedsEmailVerification(false);
          setCurrentUser(resolvedUser);
          StorageService.applyRemoteCurrentUser(resolvedUser);
          const activeFb = auth.currentUser || firebaseUser;
          if (activeFb && resolvedUser.status === 'active') {
            ensurePrivateListeners(resolvedUser, activeFb);
          }
        }}
        onSelectUser={setCurrentUser}
      />

      {/* Member Profile, Photo Upload & Personal Pix Dossier Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        users={users}
        boardRoles={boardRoles}
        fees={fees}
        tabs={tabs}
        feeSchedules={feeSchedules}
        financialNotes={financialNotes}
        clubInfo={clubInfo}
        onUpdateCurrentUser={setCurrentUser}
        onUpdateUsers={setUsers}
        onUpdateBoardRoles={setBoardRoles}
        onUpdateFees={setFees}
        onUpdateTabs={setTabs}
        onUpdateFinancialNotes={setFinancialNotes}
        onUpdateClubInfo={setClubInfo}
        onOpenAuth={handleOpenAuthModal}
        onLogout={handleLogout}
      />
      {/* Automatic Daily Celebration Notification Modal for All Active Members */}
      {celebrationModalOpen && currentUser?.status === 'active' && hasTodaysCelebrations && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-[#121216] border-2 border-amber-400/70 rounded-2xl w-full max-w-lg p-6 space-y-4 my-auto shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-400/15 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0">
                  <BellRing className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 block">
                    Notificação Oficial do Clube
                  </span>
                  <h3 className="font-rock text-xl font-bold uppercase text-white">
                    Celebrações do Dia na Irmandade
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCelebrationModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg"
                aria-label="Fechar notificação"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {todaysBirthdays.length > 0 && (
                <div className="p-3.5 rounded-xl bg-sky-950/40 border border-sky-500/40 space-y-2">
                  <h4 className="font-rock text-sm font-bold uppercase text-sky-300 flex items-center gap-1.5">
                    <Cake className="w-4 h-4 text-sky-400" />
                    <span>Aniversariante(s) do Dia</span>
                  </h4>
                  <div className="space-y-2">
                    {todaysBirthdays.map((bUser) => (
                      <div
                        key={`modal-bday-${bUser.id}`}
                        className="flex items-center justify-between gap-2 bg-zinc-950/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={
                              bUser.avatarUrl ||
                              'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'
                            }
                            alt={getMemberDisplayName(bUser)}
                            className="w-8 h-8 rounded-full object-cover border border-sky-400 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-white block truncate">
                              {getMemberDisplayName(bUser)}
                            </span>
                            {bUser.motorcycle && (
                              <span className="text-[10px] text-zinc-400 block truncate">
                                {bUser.motorcycle}
                              </span>
                            )}
                          </div>
                        </div>
                        {bUser.phone && (
                          <a
                            href={`https://wa.me/55${bUser.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                              `Parabéns irmão ${getMemberDisplayName(bUser)}! Feliz aniversário, muita saúde e estradas livres! — Oficina do Rock MC`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white rounded-lg text-[10px] font-bold uppercase shrink-0"
                          >
                            WhatsApp
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {todaysClubAnniversaries.length > 0 && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2">
                  <h4 className="font-rock text-sm font-bold uppercase text-emerald-300 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-emerald-400" />
                    <span>Aniversário de Entrada no Motoclube</span>
                  </h4>
                  <div className="space-y-2">
                    {todaysClubAnniversaries.map(({ user: cUser, yearsInClub }) => (
                      <div
                        key={`modal-mc-${cUser.id}`}
                        className="flex items-center justify-between gap-2 bg-zinc-950/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={
                              cUser.avatarUrl ||
                              'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'
                            }
                            alt={getMemberDisplayName(cUser)}
                            className="w-8 h-8 rounded-full object-cover border border-emerald-400 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-white block truncate">
                              {getMemberDisplayName(cUser)}
                            </span>
                            <span className="text-[10px] text-emerald-300 font-semibold block">
                              {yearsInClub > 0
                                ? `${yearsInClub} ${yearsInClub === 1 ? 'ano' : 'anos'} de Oficina do Rock MC`
                                : 'Ingresso Oficial no Oficina do Rock MC'}
                            </span>
                          </div>
                        </div>
                        {cUser.phone && (
                          <a
                            href={`https://wa.me/55${cUser.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                              `Parabéns irmão ${getMemberDisplayName(cUser)} pelo seu aniversário de entrada no Oficina do Rock Motoclube (${yearsInClub > 0 ? `${yearsInClub} ${yearsInClub === 1 ? 'ano' : 'anos'} de irmandade` : 'ingresso oficial'})! — Oficina do Rock MC`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white rounded-lg text-[10px] font-bold uppercase shrink-0"
                          >
                            WhatsApp
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                {notificationPermission === 'default' && (
                  <button
                    type="button"
                    onClick={handleEnableNotifications}
                    className="px-3 py-2 bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/40 rounded-lg text-[11px] font-bold uppercase flex items-center gap-1.5"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    <span>Ativar Alertas no Celular</span>
                  </button>
                )}

                {(currentUser.role === 'admin' || currentUser.role === 'board') && (
                  <button
                    type="button"
                    disabled={forumCelebrationSent}
                    onClick={handlePublishCelebrationToForum}
                    className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-zinc-200 border border-zinc-700 rounded-lg text-[11px] font-bold uppercase flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {forumCelebrationSent ? 'Publicado no Fórum!' : 'Divulgar no Fórum'}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleGoToCalendarCelebrations}
                  className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase rounded-lg flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Ver Calendário</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCelebrationModalOpen(false)}
                  className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold uppercase rounded-lg"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Notifications Center Modal */}
      {notificationsModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-[#121216] border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4 my-auto shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0 relative">
                  <Bell className="w-5 h-5" />
                  {notificationsList.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {notificationsList.length}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 block">
                    Avisos & Alertas
                  </span>
                  <h3 className="font-rock text-xl font-bold uppercase text-white">
                    Central de Notificações ({notificationsList.length})
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg"
                aria-label="Fechar central de notificações"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {notificationsList.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Bell className="w-10 h-10 text-zinc-600 mx-auto" />
                <p className="text-sm font-semibold text-zinc-300">
                  Nenhum aviso pendente no momento.
                </p>
                <p className="text-xs text-zinc-500">
                  Quando houver comunicados, atualizações do app, aniversários ou alertas, aparecerão aqui com a contagem no sino.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {notificationsList.map((item) => {
                  const isRead = readNotifIds.includes(item.id);
                  const iconBox =
                    item.kind === 'update'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : item.kind === 'birthday'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : item.kind === 'anniversary' || item.kind === 'announcement'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : item.kind === 'debt' || item.kind === 'sos'
                      ? 'bg-red-500/20 text-red-300 border-red-500/40'
                      : 'bg-zinc-800 text-amber-400 border-zinc-700';

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isRead
                          ? 'bg-zinc-950/40 border-zinc-800/60 opacity-75'
                          : 'bg-zinc-950/90 border-amber-400/35'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${iconBox}`}
                        >
                          {item.kind === 'update' && <RefreshCw className="w-4 h-4" />}
                          {item.kind === 'announcement' && <Megaphone className="w-4 h-4" />}
                          {item.kind === 'birthday' && <Cake className="w-4 h-4" />}
                          {item.kind === 'anniversary' && <Award className="w-4 h-4" />}
                          {item.kind === 'debt' && <DollarSign className="w-4 h-4" />}
                          {item.kind === 'sos' && <ShieldAlert className="w-4 h-4" />}
                          {item.kind === 'pending_member' && <UserCheck className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <h4 className="text-xs font-bold text-white leading-snug flex items-center gap-1.5">
                            {!isRead && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                            <span>{item.title}</span>
                          </h4>
                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={item.onAction}
                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1 shrink-0"
                      >
                        <span>{item.actionLabel}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
              <div className="flex items-center gap-2 flex-wrap">
                {notificationsList.length > 0 && unreadNotificationsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = StorageService.markManyNotificationsRead(
                        notificationsList.map((n) => n.id)
                      );
                      setReadNotifIds(next);
                      playSound('click');
                    }}
                    className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg text-[11px] font-bold uppercase flex items-center gap-1.5"
                  >
                    <CheckCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>Marcar tudo como lido</span>
                  </button>
                )}

                {notificationPermission === 'default' && (
                  <button
                    type="button"
                    onClick={handleEnableNotifications}
                    className="px-3 py-2 bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/40 rounded-lg text-[11px] font-bold uppercase flex items-center gap-1.5"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    <span>Ativar Alertas</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setNotificationsModalOpen(false)}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold uppercase rounded-lg ml-auto"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Search Modal (Ctrl+K or Header Search Button) */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3.5rem,calc(env(safe-area-inset-top)+1.5rem))] pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto"
          onClick={() => setIsSearchOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Busca Global"
            onClick={(e) => e.stopPropagation()}
            className="bg-[#121216] border border-amber-400/45 rounded-2xl w-full max-w-2xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
              <Search className="w-5 h-5 text-amber-400 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Buscar integrantes, passeios, comunicados, fórum ou documentos..."
                value={globalSearchTerm}
                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg"
                aria-label="Fechar busca"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const q = globalSearchTerm.trim().toLowerCase();
              const isActive = currentUser?.status === 'active';
              const isBoard =
                isActive && (currentUser?.role === 'admin' || currentUser?.role === 'board');

              if (!q) {
                return (
                  <p className="text-xs text-zinc-400 py-6 text-center">
                    Digite um termo para pesquisar em passeios, comunicados, membros{isBoard ? ' e documentos' : ''}.
                  </p>
                );
              }

              const matchedEvents = events
                .filter((e) => !e.isExclusiveBoard || isBoard)
                .filter(
                  (e) =>
                    e.title.toLowerCase().includes(q) ||
                    e.destination.toLowerCase().includes(q) ||
                    e.meetingPoint.toLowerCase().includes(q)
                )
                .slice(0, 5);

              const peerSource = isBoard
                ? users.map((u) => ({
                    id: u.id,
                    displayName: getMemberDisplayName(u),
                    name: u.name,
                    subtitle: u.motorcycle || u.email,
                  }))
                : (publicProfiles.length > 0
                    ? publicProfiles
                    : users
                        .filter((u) => u.status === 'active')
                        .map((u) => ({
                          id: u.id,
                          name: u.name,
                          nickname: u.nickname,
                          avatarUrl: u.avatarUrl,
                          birthDate: u.birthDate,
                          joinedDate: u.joinedDate,
                          joinedYear: u.joinedYear,
                          phone: u.phone,
                        }))
                  ).map((p) => ({
                    id: p.id,
                    displayName: p.nickname ? `${p.nickname} (${p.name})` : p.name,
                    name: p.name,
                    subtitle: p.phone || 'Integrante Ativo',
                  }));

              const matchedMembers = isActive
                ? peerSource
                    .filter(
                      (m) =>
                        m.name.toLowerCase().includes(q) ||
                        m.displayName.toLowerCase().includes(q) ||
                        (isBoard && m.subtitle.toLowerCase().includes(q))
                    )
                    .slice(0, 6)
                : [];

              const matchedAnnouncements = isActive
                ? announcements
                    .filter(
                      (a) =>
                        a.title.toLowerCase().includes(q) ||
                        a.message.toLowerCase().includes(q)
                    )
                    .slice(0, 4)
                : [];

              const matchedForum = isActive
                ? forumPosts
                    .filter(
                      (p) =>
                        p.title.toLowerCase().includes(q) ||
                        p.content.toLowerCase().includes(q)
                    )
                    .slice(0, 4)
                : [];

              const matchedDocs = isBoard
                ? documents
                    .filter(
                      (d) =>
                        d.title.toLowerCase().includes(q) ||
                        (d.description || '').toLowerCase().includes(q) ||
                        d.fileName.toLowerCase().includes(q)
                    )
                    .slice(0, 4)
                : [];

              const totalResults =
                matchedEvents.length +
                matchedMembers.length +
                matchedAnnouncements.length +
                matchedForum.length +
                matchedDocs.length;

              if (totalResults === 0) {
                return (
                  <p className="text-xs text-zinc-400 py-8 text-center">
                    Nenhum resultado encontrado para "<strong className="text-white">{globalSearchTerm}</strong>".
                  </p>
                );
              }

              return (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1 text-xs">
                  {matchedEvents.map((ev) => (
                    <button
                      key={`sr-ev-${ev.id}`}
                      type="button"
                      onClick={() => {
                        setIsSearchOpen(false);
                        navigateToMainTab('events');
                      }}
                      className="w-full text-left p-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">{ev.title}</span>
                          <span className="text-[11px] text-zinc-400 block truncate">
                            {formatEventPeriodLabel(ev)} · {ev.destination}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase text-amber-400 shrink-0">Passeio</span>
                    </button>
                  ))}

                  {matchedAnnouncements.map((ann) => (
                    <button
                      key={`sr-ann-${ann.id}`}
                      type="button"
                      onClick={() => {
                        setIsSearchOpen(false);
                        navigateToMainTab('history');
                      }}
                      className="w-full text-left p-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Megaphone className="w-4 h-4 text-amber-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">{ann.title}</span>
                          <span className="text-[11px] text-zinc-400 block truncate">{ann.message}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase text-amber-400 shrink-0">Comunicado</span>
                    </button>
                  ))}

                  {matchedMembers.map((m) => (
                    <button
                      key={`sr-u-${m.id}`}
                      type="button"
                      onClick={() => {
                        setIsSearchOpen(false);
                        navigateToMainTab('admin');
                      }}
                      className="w-full text-left p-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Users className="w-4 h-4 text-sky-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">
                            {m.displayName}
                          </span>
                          <span className="text-[11px] text-zinc-400 block truncate">{m.subtitle}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase text-sky-400 shrink-0">Integrante</span>
                    </button>
                  ))}

                  {matchedForum.map((fp) => (
                    <button
                      key={`sr-fp-${fp.id}`}
                      type="button"
                      onClick={() => {
                        setIsSearchOpen(false);
                        navigateToMainTab('forum');
                      }}
                      className="w-full text-left p-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">{fp.title}</span>
                          <span className="text-[11px] text-zinc-400 block truncate">{fp.authorName}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase text-emerald-400 shrink-0">Fórum</span>
                    </button>
                  ))}

                  {matchedDocs.map((docItem) => (
                    <button
                      key={`sr-doc-${docItem.id}`}
                      type="button"
                      onClick={() => {
                        setIsSearchOpen(false);
                        navigateToMainTab('documents');
                      }}
                      className="w-full text-left p-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-amber-300 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">{docItem.title}</span>
                          <span className="text-[11px] text-zinc-400 block truncate">{docItem.fileName}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase text-amber-300 shrink-0">Documento</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Unsaved Batch Finance Changes Exit Guard Modal */}
      {pendingTabAfterFinanceGuard !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6 bg-black/85 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Alterações financeiras pendentes"
            className="bg-[#121216] border-2 border-amber-400/70 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  Alterações Pendentes no Financeiro
                </h3>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                  Você possui edições em lote não gravadas na nuvem. O que deseja fazer antes de sair desta aba?
                </p>
              </div>
            </div>

            {financeLeaveError && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-xs text-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{financeLeaveError}</span>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={isSavingFinanceBeforeLeave}
                onClick={async () => {
                  const target = pendingTabAfterFinanceGuard;
                  setIsSavingFinanceBeforeLeave(true);
                  setFinanceLeaveError('');
                  try {
                    const ok = financeBatchControlRef.current
                      ? await financeBatchControlRef.current.save()
                      : true;
                    if (!ok) {
                      setFinanceLeaveError(
                        'A sincronização com o Firestore não foi concluída. Suas alterações foram preservadas.'
                      );
                      return;
                    }
                    setIsFinanceDirty(false);
                    setPendingTabAfterFinanceGuard(null);
                    if (target === '__admin_panel__') {
                      handleOpenAdminPanel(true);
                    } else if (target) {
                      navigateToMainTab(target, true);
                    }
                  } catch (err) {
                    setFinanceLeaveError(formatAuthError(err));
                  } finally {
                    setIsSavingFinanceBeforeLeave(false);
                  }
                }}
                className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-black font-rock text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>{isSavingFinanceBeforeLeave ? 'Salvando na Nuvem...' : 'Salvar e sair'}</span>
              </button>

              <button
                type="button"
                disabled={isSavingFinanceBeforeLeave}
                onClick={() => {
                  const target = pendingTabAfterFinanceGuard;
                  financeBatchControlRef.current?.discard();
                  setIsFinanceDirty(false);
                  setFinanceLeaveError('');
                  setPendingTabAfterFinanceGuard(null);
                  if (target === '__admin_panel__') {
                    handleOpenAdminPanel(true);
                  } else if (target) {
                    navigateToMainTab(target, true);
                  }
                }}
                className="w-full py-2.5 px-4 bg-red-600/80 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-bold uppercase rounded-xl"
              >
                Descartar e sair
              </button>

              <button
                type="button"
                disabled={isSavingFinanceBeforeLeave}
                onClick={() => {
                  setFinanceLeaveError('');
                  setPendingTabAfterFinanceGuard(null);
                }}
                className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-200 text-xs font-bold uppercase rounded-xl"
              >
                Continuar editando
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
