import { useState } from 'react';
import {
  ShieldAlert,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  Calendar,
  Globe,
  RefreshCw,
  MessageSquare,
  DollarSign,
  Award,
  Users,
  BookOpen,
  Share2,
  HeartHandshake,
  Edit3,
  Upload,
  RotateCcw,
  FileText,
  Scale,
  Bell,
  BellRing,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { ClubInfo, DEFAULT_CREST_URL, User } from '../types';
import { isActiveAdminUser } from '../services/firebase';
import { StorageService, playSound } from '../services/storage';
import { compressImageFile } from '../services/imageUtils';
import { PWAInstallButton } from './PWAInstallButton';
import { PhotoSourcePicker } from './PhotoSourcePicker';

interface HeaderProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenCalendar: () => void;
  currentUser: User | null;
  clubInfo: ClubInfo;
  onUpdateClubInfo?: (info: ClubInfo) => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onShareApp: () => void;
  onLogout: () => void;
  activeSosCount: number;
  notificationsCount?: number;
  onOpenNotifications?: () => void;
  onOpenSearch?: () => void;
  adminPanelActive?: boolean;
  onOpenAdminPanel?: () => void;
  pendingMembersCount?: number;
  onOpenSocialLinks?: () => void;
  onManualRefresh?: () => void;
  isRefreshingSync?: boolean;
  quotaBlocked?: boolean;
}

export default function Header({
  currentTab,
  onSelectTab,
  onOpenCalendar,
  currentUser,
  clubInfo,
  onUpdateClubInfo,
  onOpenAuth,
  onOpenProfile,
  onShareApp,
  onLogout,
  activeSosCount,
  notificationsCount = 0,
  onOpenNotifications,
  onOpenSearch,
  adminPanelActive = false,
  onOpenAdminPanel,
  pendingMembersCount = 0,
  onOpenSocialLinks,
  onManualRefresh,
  isRefreshingSync = false,
  quotaBlocked = false,
}: HeaderProps) {
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [isEditingLeftCrest, setIsEditingLeftCrest] = useState(false);
  const [crestUrlInput, setCrestUrlInput] = useState('');
  const [isUploadingCrest, setIsUploadingCrest] = useState(false);
  const [crestUploadError, setCrestUploadError] = useState('');

  const isApprovedMember = Boolean(currentUser && currentUser.status === 'active');
  const isSosApproved = Boolean(isApprovedMember && currentUser?.sosApproved);
  const isApprovedBoard = Boolean(
    currentUser && currentUser.status === 'active' && (currentUser.role === 'admin' || currentUser.role === 'board')
  );
  const isAdmin = isActiveAdminUser(currentUser);

  const navItems: Array<{
    id: string;
    label: string;
    icon: typeof BookOpen;
    memberOnly?: boolean;
    boardOnly?: boolean;
    sosApprovedOnly?: boolean;
    adminOnly?: boolean;
  }> = [
    { id: 'history', label: 'História & Sede', icon: BookOpen },
    { id: 'events', label: 'Passeios & Agenda', icon: Calendar },
    { id: 'supporters', label: 'SUPPORT XV', icon: HeartHandshake },
    {
      id: 'sos',
      label: 'SOS',
      icon: ShieldAlert,
      sosApprovedOnly: true,
    },
    { id: 'forum', label: 'Fórum Privado', icon: MessageSquare, memberOnly: true },
    { id: 'admin', label: 'Integrantes', icon: Users, memberOnly: true },
    { id: 'documents', label: 'Documentos', icon: FileText, boardOnly: true },
    { id: 'statute', label: 'Estatuto & RDI', icon: Scale, memberOnly: true },
    { id: 'finance', label: 'Financeiro & Sede', icon: DollarSign, boardOnly: true },
    { id: 'board', label: 'Diretoria', icon: Award, boardOnly: true },
    { id: 'admin_panel', label: 'ADMIN', icon: ShieldCheck, adminOnly: true },
  ];

  const handleNavClick = (id: string) => {
    if (id === 'admin_panel') {
      if (!isAdmin) return;
      if (onOpenAdminPanel) {
        onOpenAdminPanel();
      } else {
        onSelectTab('admin');
      }
      setSideMenuOpen(false);
      return;
    }
    onSelectTab(id);
    setSideMenuOpen(false);
  };

  const handleCalendarMenuClick = () => {
    setSideMenuOpen(false);
    onOpenCalendar();
  };

  const handleOpenLeftCrestModal = () => {
    setCrestUrlInput(clubInfo.leftCrestUrl || DEFAULT_CREST_URL);
    setCrestUploadError('');
    setIsEditingLeftCrest(true);
  };

  const handleLeftCrestFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setCrestUploadError('');
    setIsUploadingCrest(true);
    try {
      const dataUrl = await compressImageFile(file, { maxDimension: 512, maxChars: 110_000 });
      setCrestUrlInput(dataUrl);
      playSound('success');
    } catch (err) {
      setCrestUploadError(err instanceof Error ? err.message : 'Erro ao processar imagem do brasão.');
      playSound('beep');
    } finally {
      setIsUploadingCrest(false);
    }
  };

  const handleSaveLeftCrest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setCrestUploadError('');
    const updated: ClubInfo = {
      ...clubInfo,
      leftCrestUrl: crestUrlInput.trim() || DEFAULT_CREST_URL,
    };
    try {
      await StorageService.saveClubInfoAndAwaitCloud(updated);
      onUpdateClubInfo?.(updated);
      setIsEditingLeftCrest(false);
      playSound('success');
    } catch (err) {
      setCrestUploadError(
        err instanceof Error ? err.message : 'Não foi possível salvar o brasão na nuvem.'
      );
      playSound('beep');
    }
  };

  return (
    <>
      <header className="bg-[#0e0e11] border-b border-zinc-800/80 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-2">
            {/* Top Left: Menu Lateral Button + Official Crest & Title */}
            <div className="flex items-center gap-2.5 sm:gap-3.5 group min-w-0">
              <button
                type="button"
                onClick={() => setSideMenuOpen(true)}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 hover:text-amber-300 border border-zinc-800 hover:border-amber-400/50 transition-colors shrink-0 flex items-center gap-1.5"
                aria-label="Abrir Menu Lateral"
                title="Abrir Menu Lateral (Calendário, Notificações & Abas)"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => handleNavClick('history')}
                  className="focus:outline-none block"
                  title="Ir para História & Sede"
                >
                  <img
                    src={clubInfo.leftCrestUrl || DEFAULT_CREST_URL}
                    alt="Brasão Oficial Oficina do Rock Motoclube"
                    referrerPolicy="no-referrer"
                    className="h-12 sm:h-14 w-auto object-contain border-0 transition-transform duration-200 group-hover:scale-105"
                  />
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleOpenLeftCrestModal}
                    className="absolute -bottom-1 -right-1 p-1 rounded-full bg-zinc-900 hover:bg-amber-400 text-amber-400 hover:text-black border border-amber-400/60 shadow transition-colors"
                    title="Editar Foto do Brasão Esquerdo (Admin)"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleNavClick('history')}
                className="text-left focus:outline-none min-w-0"
              >
                <span className="font-rock text-lg sm:text-2xl font-bold tracking-wider text-white uppercase block leading-none truncate">
                  OFICINA DO <span className="text-amber-400">ROCK</span>
                </span>
                <span className="text-[10px] sm:text-xs text-zinc-400 font-medium tracking-widest uppercase block mt-1 truncate">
                  MOTOCLUBE · IBIÚNA-SP · EST. {clubInfo.foundationYear}
                </span>
              </button>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden xl:flex items-center justify-center gap-1 flex-wrap py-1 max-w-2xl">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.id === 'admin_panel'
                    ? currentTab === 'admin' && adminPanelActive
                    : item.id === 'admin'
                    ? currentTab === 'admin' && !adminPanelActive
                    : currentTab === item.id;

                if (item.memberOnly && !isApprovedMember) return null;
                if (item.boardOnly && !isApprovedBoard) return null;
                if (item.sosApprovedOnly && !isSosApproved) return null;
                if (item.adminOnly && !isAdmin) return null;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`relative px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md transition-colors flex items-center gap-1 whitespace-nowrap ${
                      isActive
                        ? 'bg-amber-400 text-black font-bold shadow-sm'
                        : item.adminOnly
                        ? 'text-amber-300 hover:text-amber-200 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/35'
                        : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-black' : item.adminOnly ? 'text-amber-400' : 'text-zinc-400'}`} />
                    <span>{item.label}</span>
                    {item.adminOnly && pendingMembersCount > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[9px] font-extrabold leading-tight">
                        {pendingMembersCount > 99 ? '99+' : pendingMembersCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Action Zone: Busca + Baixar App + Notificações + Share + SOS Quick + User Account */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {onOpenSearch && (
                <button
                  type="button"
                  onClick={onOpenSearch}
                  className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-amber-400 border border-zinc-800 transition-colors"
                  aria-label="Busca Global"
                  title="Buscar no Portal (Ctrl+K)"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}

              <div className="hidden sm:block">
                <PWAInstallButton variant="header" />
              </div>

              {/* Notifications Bell with Numeric Count Badge */}
              <button
                type="button"
                onClick={onOpenNotifications}
                className={`relative p-2 rounded-lg border transition-colors ${
                  notificationsCount > 0
                    ? 'bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border-amber-400/50'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border-zinc-800'
                }`}
                aria-label={`Notificações (${notificationsCount} avisos)`}
                title={
                  notificationsCount > 0
                    ? `Central de Notificações · ${notificationsCount} aviso(s)`
                    : 'Central de Notificações (Nenhum aviso ativo)'
                }
              >
                {notificationsCount > 0 ? (
                  <BellRing className="w-4 h-4 text-amber-400" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {notificationsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 px-1.5 min-w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow border border-[#0e0e11]">
                    {notificationsCount > 99 ? '99+' : notificationsCount}
                  </span>
                )}
              </button>

              {onManualRefresh && (
                <button
                  type="button"
                  onClick={onManualRefresh}
                  disabled={isRefreshingSync}
                  className={`p-2 rounded border transition-colors flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${
                    quotaBlocked
                      ? 'bg-red-950/60 border-red-700/60 text-red-300 hover:bg-red-900/70'
                      : 'bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border-zinc-800 hover:border-emerald-400/40'
                  } disabled:opacity-60`}
                  title="Sincronizar e atualizar dados manualmente (economiza leituras)"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshingSync ? 'animate-spin' : ''}`} />
                  <span className="hidden 2xl:inline">
                    {isRefreshingSync ? 'Atualizando' : 'ATUALIZAR'}
                  </span>
                </button>
              )}

              {onOpenSocialLinks && (
                <button
                  type="button"
                  onClick={onOpenSocialLinks}
                  className="hidden sm:flex p-2 rounded bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-zinc-800 hover:border-amber-400/40 transition-colors items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                  title="Redes Sociais Oficiais do Motoclube"
                >
                  <Globe className="w-4 h-4" />
                  <span className="hidden 2xl:inline">Redes Sociais</span>
                </button>
              )}

              <button
                type="button"
                onClick={onShareApp}
                className="p-2 rounded bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-zinc-800 hover:border-amber-400/40 transition-colors flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                title="Compartilhar Link do Aplicativo"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden 2xl:inline">Compartilhar</span>
              </button>

              {isSosApproved && (
                <button
                  type="button"
                  onClick={() => onSelectTab('sos')}
                  className={`relative px-2.5 sm:px-3 py-1.5 rounded text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md ${
                    activeSosCount > 0
                      ? 'bg-red-600 hover:bg-red-500 shadow-red-900/40'
                      : 'bg-red-600/90 hover:bg-red-500 shadow-red-900/30'
                  }`}
                  title="Pedir ou Acompanhar Socorro SOS"
                >
                  <ShieldAlert className="w-4 h-4 text-yellow-300" />
                  <span className="hidden sm:inline">SOS</span>
                </button>
              )}

              {currentUser ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="hidden sm:inline-flex p-2 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 border border-zinc-800 transition-colors"
                  title="Sair da conta"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 transition-colors"
                >
                  <UserIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span>Entrar</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Slide-out Menu Lateral (Side Drawer) */}
      {sideMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu Lateral"
        >
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setSideMenuOpen(false)}
          />

          <aside className="relative z-10 w-80 max-w-[86vw] h-full bg-[#0e0e12] border-r border-zinc-800 flex flex-col shadow-2xl overflow-y-auto">
            {/* Sidebar Top */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-3 bg-[#121216]">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={clubInfo.leftCrestUrl || DEFAULT_CREST_URL}
                  alt="Brasão"
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 object-contain border-0 shrink-0"
                />
                <div className="min-w-0">
                  <span className="font-rock text-sm font-bold uppercase text-white block truncate">
                    Oficina do <span className="text-amber-400">Rock</span> MC
                  </span>
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
                    Menu Lateral do Clube
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSideMenuOpen(false)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800"
                aria-label="Fechar Menu Lateral"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 flex-1">
              {/* Quick Highlights in Menu Lateral: Calendário + Notificações + Baixar App */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleCalendarMenuClick}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/50 text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-amber-400 text-black flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold uppercase text-amber-300 block">
                        Calendário do Clube
                      </span>
                      <span className="text-[10px] text-zinc-300 block truncate">
                        Aniversários, Ingresso & Passeios
                      </span>
                    </div>
                  </div>
                </button>

                {onOpenSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setSideMenuOpen(false);
                      onOpenSearch();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-100 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Search className="w-4 h-4 text-amber-400" />
                      <span>Busca Global no Clube</span>
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">Ctrl+K</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    onOpenNotifications?.();
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-100 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    {notificationsCount > 0 ? (
                      <BellRing className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Bell className="w-4 h-4 text-zinc-400" />
                    )}
                    <span>Notificações & Avisos</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      notificationsCount > 0
                        ? 'bg-red-600 text-white'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {notificationsCount}
                  </span>
                </button>

                {onOpenSocialLinks && (
                  <button
                    type="button"
                    onClick={() => {
                      setSideMenuOpen(false);
                      onOpenSocialLinks();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-100 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Globe className="w-4 h-4 text-amber-400" />
                      <span>Redes Sociais</span>
                    </span>
                  </button>
                )}

                {onManualRefresh && (
                  <button
                    type="button"
                    disabled={isRefreshingSync}
                    onClick={() => {
                      setSideMenuOpen(false);
                      onManualRefresh();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold uppercase tracking-wider text-emerald-300 transition-colors disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2.5">
                      <RefreshCw className={`w-4 h-4 ${isRefreshingSync ? 'animate-spin' : ''}`} />
                      <span>{isRefreshingSync ? 'Atualizando Dados...' : 'ATUALIZAR Dados'}</span>
                    </span>
                  </button>
                )}

                <PWAInstallButton
                  variant="sidebar"
                  onActionDone={() => setSideMenuOpen(false)}
                />
              </div>

              {/* Navigation Sections */}
              <div className="space-y-1 pt-2 border-t border-zinc-800/80">
                <span className="px-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-1.5">
                  Navegação do Portal
                </span>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.id === 'admin_panel'
                      ? currentTab === 'admin' && adminPanelActive
                      : item.id === 'admin'
                      ? currentTab === 'admin' && !adminPanelActive
                      : currentTab === item.id;
                  if (item.memberOnly && !isApprovedMember) return null;
                  if (item.boardOnly && !isApprovedBoard) return null;
                  if (item.sosApprovedOnly && !isSosApproved) return null;
                  if (item.adminOnly && !isAdmin) return null;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                        isActive
                          ? 'bg-amber-400 text-black'
                          : item.adminOnly
                          ? 'text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/35'
                          : 'text-zinc-300 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${!isActive && item.adminOnly ? 'text-amber-400' : ''}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.adminOnly && pendingMembersCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-extrabold">
                          {pendingMembersCount > 99 ? '99+' : pendingMembersCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-zinc-800 bg-[#121216] space-y-2">
              <button
                type="button"
                onClick={() => {
                  setSideMenuOpen(false);
                  onShareApp();
                }}
                className="w-full py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-zinc-800 text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                <span>Compartilhar Aplicativo</span>
              </button>

              {currentUser ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSideMenuOpen(false);
                      onOpenProfile();
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase flex items-center justify-center gap-1.5"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Meu Perfil</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSideMenuOpen(false);
                      onLogout();
                    }}
                    className="py-2 px-3 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-800/50 text-xs font-bold uppercase flex items-center justify-center gap-1"
                    title="Sair da conta"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSideMenuOpen(false);
                    onOpenAuth();
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase flex items-center justify-center gap-2"
                >
                  <UserIcon className="w-4 h-4" />
                  <span>Entrar / Acessar Portal</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Admin Edit Modal: Top-Left Crest Photo */}
      {isEditingLeftCrest && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-rock text-lg font-bold uppercase text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                <span>Editar Brasão Superior Esquerdo</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditingLeftCrest(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLeftCrest} className="space-y-4 text-xs">
              <div className="p-4 flex justify-center">
                <img
                  src={crestUrlInput || DEFAULT_CREST_URL}
                  alt="Prévia Brasão Esquerdo"
                  referrerPolicy="no-referrer"
                  className="h-24 w-auto object-contain border-0"
                />
              </div>

              <PhotoSourcePicker
                onSelectFiles={handleLeftCrestFiles}
                disabled={isUploadingCrest}
                title="Foto do Brasão Superior Esquerdo"
                className="w-full"
              >
                <div className="w-full py-2.5 px-3 bg-zinc-950 hover:bg-zinc-900 border border-dashed border-amber-400/50 rounded-lg text-xs font-bold text-amber-400 flex items-center justify-center gap-2 transition-colors">
                  <Upload className="w-4 h-4" />
                  <span>{isUploadingCrest ? 'Otimizando...' : 'Escolher Foto (Galeria / Google Fotos)'}</span>
                </div>
              </PhotoSourcePicker>

              {crestUploadError && (
                <p className="text-[11px] text-red-400 font-semibold">{crestUploadError}</p>
              )}

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Ou URL da Imagem
                </label>
                <input
                  type="text"
                  value={crestUrlInput}
                  onChange={(e) => setCrestUrlInput(e.target.value)}
                  placeholder={DEFAULT_CREST_URL}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCrestUrlInput(DEFAULT_CREST_URL)}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg text-[11px] font-bold uppercase flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Padrão</span>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingLeftCrest(false)}
                    className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-bold uppercase"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-rock font-bold uppercase rounded-lg"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
