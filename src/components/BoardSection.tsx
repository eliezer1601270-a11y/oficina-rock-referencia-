import { useMemo, useState } from 'react';
import { 
  Award, 
  MessageSquare, 
  Send, 
  Calendar, 
  Plus, 
  Edit3, 
  Trash2, 
  UserCheck, 
  Lock, 
  ShieldAlert, 
  Check, 
  X,
  Phone,
  Mail,
  Upload,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Loader2,
  User as UserIcon,
} from 'lucide-react';
import {
  BoardRoleConfig,
  BoardChatMessage,
  RideEvent,
  User,
  VACANT_BOARD_HOLDER_LABEL,
  getMemberDisplayName,
  getMemberRoleLabel,
  isVacantBoardHolder,
  reconcileBoardRolesWithUsers,
  resolveBoardComposition,
  vacateBoardRole,
} from '../types';
import { StorageService, playSound } from '../services/storage';
import { compressImageFile } from '../services/imageUtils';
import { PhotoSourcePicker } from './PhotoSourcePicker';

interface BoardSectionProps {
  boardRoles: BoardRoleConfig[];
  boardChat: BoardChatMessage[];
  events: RideEvent[];
  users?: User[];
  currentUser: User | null;
  onUpdateBoardRoles: (roles: BoardRoleConfig[]) => void;
  onUpdateBoardChat: (chat: BoardChatMessage[]) => void;
  onUpdateEvents: (events: RideEvent[]) => void;
  onUpdateUsers?: (users: User[]) => void;
  onOpenAuth: () => void;
}

export default function BoardSection({
  boardRoles,
  boardChat,
  events,
  users = [],
  currentUser,
  onUpdateBoardRoles,
  onUpdateBoardChat,
  onUpdateEvents,
  onUpdateUsers,
  onOpenAuth,
}: BoardSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState<'roles' | 'chat' | 'meetings'>('roles');
  
  // Chat state
  const [chatInput, setChatInput] = useState('');

  // Role edit / add modal
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [linkedMemberId, setLinkedMemberId] = useState<string>('');
  const [roleTitle, setRoleTitle] = useState('');
  const [roleHolderName, setRoleHolderName] = useState('');
  const [roleEmail, setRoleEmail] = useState('');
  const [rolePhone, setRolePhone] = useState('');
  const [roleMotorcycle, setRoleMotorcycle] = useState('');
  const [roleAvatarUrl, setRoleAvatarUrl] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  // Board Meeting edit / add modal
  const [isEditingMeeting, setIsEditingMeeting] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('19:30');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingConductor, setMeetingConductor] = useState('');
  const [meetingDescription, setMeetingDescription] = useState('');

  // Inline confirmation modal state (PWA/iOS/iframe safe)
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: 'role' | 'chat' | 'meeting';
    id: string;
    title: string;
    message: string;
  } | null>(null);
  const [boardSyncError, setBoardSyncError] = useState('');
  const [isSavingBoard, setIsSavingBoard] = useState(false);

  const orderedBoardRoles = useMemo(
    () =>
      boardRoles
        .map((r, index) => ({ r, index }))
        .sort((a, b) => {
          const oa = typeof a.r.order === 'number' ? a.r.order : a.index;
          const ob = typeof b.r.order === 'number' ? b.r.order : b.index;
          return oa - ob || a.index - b.index;
        })
        .map((entry) => entry.r),
    [boardRoles]
  );

  const isAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.email?.toLowerCase().trim() === 'eliezerrmartins@gmail.com';
  const isBoardMember = Boolean(currentUser && currentUser.status === 'active' && (currentUser.role === 'board' || isAdmin));

  // If user is visitor or standard member, block access
  if (!isBoardMember) {
    return (
      <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 my-8">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mx-auto text-amber-400">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="font-rock text-3xl font-bold uppercase text-white">
            Aba Exclusiva da Diretoria
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto">
            Este canal confidencial é reservado para a Mesa Diretora do Oficina do Rock Motoclube: 
            Presidente, Vice-Presidente, Diretor Geral, Diretor Financeiro e Diretores de Disciplina.
          </p>
        </div>

        <button
          onClick={onOpenAuth}
          className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-lg transition-colors"
        >
          Entrar com Credenciais da Diretoria
        </button>
      </div>
    );
  }

  // Handle Send Chat
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentUser || isSavingBoard) return;
    setBoardSyncError('');
    setIsSavingBoard(true);

    const newMessage: BoardChatMessage = {
      id: `bmsg-${Date.now()}`,
      senderId: currentUser.id,
      senderName: getMemberDisplayName(currentUser),
      senderRole: getMemberRoleLabel(currentUser, boardRoles),
      senderAvatar: currentUser.avatarUrl,
      message: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };

    const updated = [...boardChat, newMessage];
    try {
      await StorageService.saveBoardChatConfirmed(updated);
      onUpdateBoardChat(updated);
      setChatInput('');
      playSound('beep');
    } catch (err) {
      setBoardSyncError(
        err instanceof Error ? err.message : 'Sincronização não concluída. Mensagem preservada.'
      );
      playSound('beep');
    } finally {
      setIsSavingBoard(false);
    }
  };

  const handleDeleteChatMessage = (msgId: string) => {
    if (!isAdmin) return;
    setConfirmDelete({
      kind: 'chat',
      id: msgId,
      title: 'Excluir Mensagem do Chat',
      message: 'Deseja remover esta mensagem do chat interno da diretoria?',
    });
  };

  const handleRoleAvatarFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setAvatarError('');
    setIsUploadingAvatar(true);
    try {
      const dataUrl = await compressImageFile(file, { maxDimension: 420, maxChars: 120_000 });
      setRoleAvatarUrl(dataUrl);
      playSound('success');
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Erro ao processar foto.');
      playSound('beep');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Open edit role
  const handleOpenEditRole = (role: BoardRoleConfig) => {
    const linked = users.find((u) => u.boardRoleId === role.id && u.status === 'active');
    const vacant = !linked && isVacantBoardHolder(role.holderName);
    setEditingRoleId(role.id);
    setLinkedMemberId(linked?.id || '');
    setRoleTitle(role.title);
    setRoleHolderName(linked ? getMemberDisplayName(linked) : vacant ? '' : role.holderName);
    setRoleEmail(linked?.email || (vacant ? '' : role.email));
    setRolePhone(linked?.phone || (vacant ? '' : role.phone));
    setRoleMotorcycle(linked?.motorcycle || (vacant ? '' : role.motorcycle));
    setRoleAvatarUrl(linked?.avatarUrl || (vacant ? '' : role.avatarUrl));
    setIsEditingRole(true);
  };

  const handleOpenAddRole = () => {
    setEditingRoleId(null);
    setLinkedMemberId('');
    setRoleTitle('');
    setRoleHolderName('');
    setRoleEmail('');
    setRolePhone('');
    setRoleMotorcycle('');
    setRoleAvatarUrl('');
    setIsEditingRole(true);
  };

  const handleMarkRoleVacantDraft = () => {
    setLinkedMemberId('');
    setRoleHolderName('');
    setRoleEmail('');
    setRolePhone('');
    setRoleMotorcycle('');
    setRoleAvatarUrl('');
  };

  const handleSelectLinkedMember = (memberId: string) => {
    setLinkedMemberId(memberId);
    if (!memberId) {
      handleMarkRoleVacantDraft();
      return;
    }
    const member = users.find((u) => u.id === memberId);
    if (member) {
      setRoleHolderName(getMemberDisplayName(member));
      setRoleEmail(member.email);
      setRolePhone(member.phone);
      setRoleMotorcycle(member.motorcycle);
      setRoleAvatarUrl(member.avatarUrl || '');
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleTitle.trim() || isSavingBoard) return;
    setBoardSyncError('');
    setIsSavingBoard(true);

    const targetRoleId = editingRoleId || `role-custom-${Date.now()}`;
    const isSettingVacant = !linkedMemberId && isVacantBoardHolder(roleHolderName);

    let nextUsers = users;
    let hasLinkedChange = false;
    if (users.length > 0 && onUpdateUsers) {
      hasLinkedChange = users.some(
        (u) => u.boardRoleId === targetRoleId || (linkedMemberId && u.id === linkedMemberId)
      );
      if (hasLinkedChange) {
        nextUsers = users.map((u) => {
          if (!isSettingVacant && linkedMemberId && u.id === linkedMemberId) {
            const isFinTitle = roleTitle.toLowerCase().includes('financeir') || targetRoleId === 'role-finance';
            return {
              ...u,
              role: u.role === 'admin' ? ('admin' as const) : ('board' as const),
              status: 'active' as const,
              sosApproved: true,
              boardRoleId: targetRoleId,
              canEditFinances: u.role === 'admin' || isFinTitle || Boolean(u.canEditFinances),
            };
          }
          if (u.boardRoleId === targetRoleId && (isSettingVacant || u.id !== linkedMemberId)) {
            return {
              ...u,
              boardRoleId: undefined,
            };
          }
          return u;
        });
      }
    }

    const baseRole: BoardRoleConfig = editingRoleId
      ? orderedBoardRoles.find((r) => r.id === editingRoleId)!
      : {
          id: targetRoleId,
          order: orderedBoardRoles.length,
          title: roleTitle.trim(),
          holderName: VACANT_BOARD_HOLDER_LABEL,
          email: '',
          phone: '',
          motorcycle: '',
          avatarUrl: '',
          isCustom: true,
        };

    const editedRole: BoardRoleConfig = isSettingVacant
      ? vacateBoardRole({
          ...baseRole,
          title: roleTitle.trim(),
        })
      : {
          ...baseRole,
          title: roleTitle.trim(),
          holderName: roleHolderName.trim(),
          email: roleEmail.trim(),
          phone: rolePhone.trim(),
          motorcycle: roleMotorcycle.trim(),
          avatarUrl: roleAvatarUrl.trim(),
        };

    const rawUpdatedRoles = editingRoleId
      ? orderedBoardRoles.map((r, idx) =>
          r.id === editingRoleId
            ? { ...editedRole, order: typeof r.order === 'number' ? r.order : idx }
            : r
        )
      : [...orderedBoardRoles, editedRole].map((r, idx) => ({
          ...r,
          order: typeof r.order === 'number' ? r.order : idx,
        }));

    const finalRoles = reconcileBoardRolesWithUsers(rawUpdatedRoles, nextUsers, {
      vacatedRoleIds: isSettingVacant ? [targetRoleId] : [],
    });

    try {
      if (hasLinkedChange && onUpdateUsers) {
        await StorageService.saveUsersConfirmed(nextUsers);
        onUpdateUsers(nextUsers);
      }
      await StorageService.saveBoardRolesConfirmed(finalRoles);
      onUpdateBoardRoles(finalRoles);
      setIsEditingRole(false);
      playSound('success');
    } catch (err) {
      setBoardSyncError(
        err instanceof Error ? err.message : 'Sincronização não concluída. Alterações do cargo não confirmadas.'
      );
      playSound('beep');
    } finally {
      setIsSavingBoard(false);
    }
  };

  const persistReorderedRoles = async (list: BoardRoleConfig[]) => {
    if (isSavingBoard) return;
    setBoardSyncError('');
    setIsSavingBoard(true);
    const reindexed = list.map((r, idx) => ({ ...r, order: idx }));
    try {
      await StorageService.saveBoardRolesConfirmed(reindexed);
      onUpdateBoardRoles(reindexed);
      playSound('click');
    } catch (err) {
      setBoardSyncError(err instanceof Error ? err.message : 'Falha ao reordenar mesa na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingBoard(false);
    }
  };

  const handleMoveRole = (roleId: string, direction: 'up' | 'down') => {
    if (!isAdmin) return;
    const currentIndex = orderedBoardRoles.findIndex((r) => r.id === roleId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= orderedBoardRoles.length) return;
    const copy = [...orderedBoardRoles];
    const [moved] = copy.splice(currentIndex, 1);
    copy.splice(targetIndex, 0, moved);
    persistReorderedRoles(copy);
  };

  const handleMoveRoleToIndex = (roleId: string, targetIndex: number) => {
    if (!isAdmin) return;
    const currentIndex = orderedBoardRoles.findIndex((r) => r.id === roleId);
    if (
      currentIndex === -1 ||
      targetIndex < 0 ||
      targetIndex >= orderedBoardRoles.length ||
      targetIndex === currentIndex
    ) {
      return;
    }
    const copy = [...orderedBoardRoles];
    const [moved] = copy.splice(currentIndex, 1);
    copy.splice(targetIndex, 0, moved);
    persistReorderedRoles(copy);
  };

  const handleDeleteRole = (role: BoardRoleConfig) => {
    if (!isAdmin) return;
    setConfirmDelete({
      kind: 'role',
      id: role.id,
      title: 'Excluir Cargo da Diretoria',
      message: `Deseja excluir "${role.title}" (${role.holderName}) da mesa diretora?`,
    });
  };

  // Board Meetings CRUD
  const handleOpenAddMeeting = () => {
    setEditingMeetingId(null);
    setMeetingTitle('');
    setMeetingDate(new Date().toISOString().split('T')[0]);
    setMeetingTime('19:30');
    setMeetingLocation('Sede Oficial - Sala da Diretoria');
    setMeetingConductor(getMemberDisplayName(currentUser) || 'Presidente');
    setMeetingDescription('');
    setIsEditingMeeting(true);
  };

  const handleOpenEditMeeting = (evt: RideEvent) => {
    setEditingMeetingId(evt.id);
    setMeetingTitle(evt.title);
    setMeetingDate(evt.date);
    setMeetingTime(evt.time);
    setMeetingLocation(evt.meetingPoint);
    setMeetingConductor(evt.roadCaptain);
    setMeetingDescription(evt.description);
    setIsEditingMeeting(true);
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingTitle.trim() || !meetingDate || isSavingBoard) return;
    setBoardSyncError('');
    setIsSavingBoard(true);

    const updated = editingMeetingId
      ? events.map((ev) =>
          ev.id === editingMeetingId
            ? {
                ...ev,
                title: meetingTitle.trim(),
                date: meetingDate,
                time: meetingTime,
                meetingPoint: meetingLocation.trim(),
                roadCaptain: meetingConductor.trim(),
                description: meetingDescription.trim(),
                isExclusiveBoard: true,
              }
            : ev
        )
      : [
          {
            id: `evt-board-${Date.now()}`,
            title: meetingTitle.trim(),
            description: meetingDescription.trim(),
            date: meetingDate,
            time: meetingTime,
            meetingPoint: meetingLocation.trim() || 'Sede Oficial',
            destination: 'Sede Oficina do Rock',
            distanceKm: 0,
            averageSpeed: 'Reunião Interna',
            roadCaptain: meetingConductor.trim() || 'Presidente',
            isExclusiveBoard: true,
            attendees: currentUser ? [currentUser.id] : [],
          },
          ...events,
        ];

    try {
      await StorageService.saveEventsConfirmed(updated);
      onUpdateEvents(updated);
      setIsEditingMeeting(false);
      setEditingMeetingId(null);
      playSound('success');
    } catch (err) {
      setBoardSyncError(err instanceof Error ? err.message : 'Falha ao salvar pauta na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingBoard(false);
    }
  };

  const handleDeleteMeeting = (id: string) => {
    if (!isAdmin) return;
    setConfirmDelete({
      kind: 'meeting',
      id,
      title: 'Excluir Reunião / Pauta',
      message: 'Deseja excluir esta reunião/pauta da diretoria?',
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete || isSavingBoard) return;
    setBoardSyncError('');
    setIsSavingBoard(true);
    try {
      if (confirmDelete.kind === 'role') {
        const updated = orderedBoardRoles
          .filter((r) => r.id !== confirmDelete.id)
          .map((r, idx) => ({ ...r, order: idx }));
        if (onUpdateUsers && users.some((u) => u.boardRoleId === confirmDelete.id)) {
          const nextUsers = users.map((u) =>
            u.boardRoleId === confirmDelete.id ? { ...u, boardRoleId: undefined } : u
          );
          await StorageService.saveUsersConfirmed(nextUsers);
          onUpdateUsers(nextUsers);
        }
        await StorageService.saveBoardRolesConfirmed(updated);
        onUpdateBoardRoles(updated);
      } else if (confirmDelete.kind === 'chat') {
        const updated = boardChat.filter((m) => m.id !== confirmDelete.id);
        await StorageService.saveBoardChatConfirmed(updated);
        onUpdateBoardChat(updated);
      } else if (confirmDelete.kind === 'meeting') {
        const updated = events.filter((e) => e.id !== confirmDelete.id);
        await StorageService.saveEventsConfirmed(updated);
        onUpdateEvents(updated);
      }
      setConfirmDelete(null);
      playSound('click');
    } catch (err) {
      setBoardSyncError(err instanceof Error ? err.message : 'Falha ao excluir registro na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingBoard(false);
    }
  };

  // Exclusive board meetings
  const boardEvents = events.filter((e) => e.isExclusiveBoard);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest block flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-400" />
            <span>Mesa Diretora · Oficina do Rock Motoclube</span>
          </span>
          <h2 className="font-rock text-3xl font-bold uppercase text-white tracking-wide">
            Gabinete da Diretoria
          </h2>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setActiveSubTab('roles')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
              activeSubTab === 'roles' ? 'bg-amber-400 text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Composição da Mesa
          </button>
          <button
            onClick={() => setActiveSubTab('chat')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
              activeSubTab === 'chat' ? 'bg-amber-400 text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Chat Interno
          </button>
          <button
            onClick={() => setActiveSubTab('meetings')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
              activeSubTab === 'meetings' ? 'bg-amber-400 text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Reuniões & Pautas
          </button>
        </div>
      </div>

      {boardSyncError && (
        <div className="p-3 bg-red-950/70 border border-red-700/70 rounded-xl text-xs text-red-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{boardSyncError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBoardSyncError('')}
            className="text-red-300 hover:text-white font-bold uppercase text-[10px]"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Subtab 1: Composição da Mesa Diretora */}
      {activeSubTab === 'roles' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-zinc-400 max-w-2xl">
              Composição oficial: Presidente, Vice-Presidente, Diretor Geral, Diretor Financeiro e 3 Diretores de Disciplina. 
              O Administrador Geral pode editar titulares, alternar a ordem de exibição na mesa e acrescentar novos cargos.
            </p>

            {isAdmin && (
              <button
                onClick={handleOpenAddRole}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Acrescentar Cargo</span>
              </button>
            )}
          </div>

          {/* Edit / Add Role Modal */}
          {isEditingRole && isAdmin && (
            <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
              <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg p-6 space-y-4 my-auto">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400" />
                    <h3 className="font-rock text-lg font-bold uppercase text-white">
                      {editingRoleId ? 'Editar Cargo da Diretoria' : 'Acrescentar Novo Cargo à Diretoria'}
                    </h3>
                  </div>
                  <button onClick={() => setIsEditingRole(false)} className="text-zinc-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveRole} className="space-y-4">
                  {users.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="block text-xs font-bold text-amber-300 uppercase">
                          Vincular Integrante do Clube (Opcional)
                        </label>
                        <button
                          type="button"
                          onClick={handleMarkRoleVacantDraft}
                          className="text-[11px] font-bold uppercase text-zinc-400 hover:text-amber-300 underline"
                        >
                          Deixar Cargo Vago
                        </button>
                      </div>
                      <select
                        value={linkedMemberId}
                        onChange={(e) => handleSelectLinkedMember(e.target.value)}
                        className="w-full bg-zinc-950 border border-amber-400/40 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                      >
                        <option value="">Sem vínculo / Cargo vago</option>
                        {users
                          .filter((u) => u.status === 'active')
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {getMemberDisplayName(u)}{u.motorcycle ? ` (${u.motorcycle})` : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      Título do Cargo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Diretor de Eventos / Capitão de Comboio"
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      Apelido / Nome do Titular (Deixe vazio para Cargo vago)
                    </label>
                    <input
                      type="text"
                      placeholder="Deixe vazio para exibir 'Cargo vago'"
                      value={roleHolderName}
                      onChange={(e) => setRoleHolderName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                        Telefone / WhatsApp
                      </label>
                      <input
                        type="text"
                        value={rolePhone}
                        onChange={(e) => setRolePhone(e.target.value)}
                        placeholder="(15) 99812-4520"
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                        E-mail de Contato
                      </label>
                      <input
                        type="email"
                        value={roleEmail}
                        onChange={(e) => setRoleEmail(e.target.value)}
                        placeholder="contato@oficinadorock.com"
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      Motocicleta do Diretor
                    </label>
                    <input
                      type="text"
                      value={roleMotorcycle}
                      onChange={(e) => setRoleMotorcycle(e.target.value)}
                      placeholder="Ex: Harley-Davidson Fat Boy 114"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      Foto de Perfil (Galeria Nativa, Google Fotos ou URL)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <PhotoSourcePicker
                        multiple={false}
                        disabled={isUploadingAvatar}
                        title="Foto de Perfil da Diretoria"
                        onSelectFiles={handleRoleAvatarFiles}
                        className="shrink-0"
                      >
                        <div className="cursor-pointer px-3.5 py-2 bg-zinc-950 hover:bg-zinc-900 border border-dashed border-amber-400/50 rounded-lg text-xs font-bold text-amber-400 flex items-center justify-center gap-1.5 transition-colors">
                          {isUploadingAvatar ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>{isUploadingAvatar ? 'Otimizando...' : 'Carregar Foto'}</span>
                        </div>
                      </PhotoSourcePicker>
                      <input
                        type="text"
                        value={roleAvatarUrl}
                        onChange={(e) => setRoleAvatarUrl(e.target.value)}
                        placeholder="https://... ou foto carregada"
                        className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    {avatarError && (
                      <p className="text-[11px] text-red-400 font-semibold mt-1">{avatarError}</p>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setIsEditingRole(false)}
                      className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase hover:bg-zinc-700"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black rounded-lg text-xs font-bold uppercase font-rock"
                    >
                      Salvar Cargo
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Roles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {resolveBoardComposition(orderedBoardRoles, users, {
              isAuthenticatedActiveMember: true,
            }).map(({ role, displayName, avatarUrl, motorcycle, email, phone, isVacant }, idx) => (
              <div
                key={role.id}
                className="bg-[#121216] border border-zinc-800/90 rounded-2xl p-5 space-y-4 hover:border-amber-400/40 transition-colors flex flex-col justify-between shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[10px] font-mono font-bold text-zinc-300 shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-bold text-amber-400 uppercase tracking-wider truncate">
                        {role.title}
                      </span>
                    </div>
                    {role.isCustom && (
                      <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-300 shrink-0">
                        Adicional
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3.5 pt-3">
                    {!isVacant && avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-full object-cover border-2 border-amber-400/50 shrink-0"
                      />
                    ) : (
                      <div
                        className={`w-14 h-14 rounded-full bg-zinc-900 border-2 flex items-center justify-center shrink-0 ${
                          isVacant
                            ? 'border-zinc-700 text-zinc-500'
                            : 'border-amber-400/50 text-amber-400'
                        }`}
                      >
                        <UserIcon className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4
                        className={`font-semibold text-base leading-tight truncate ${
                          isVacant ? 'text-zinc-400 italic' : 'text-white'
                        }`}
                      >
                        {isVacant ? 'Cargo vago' : displayName}
                      </h4>
                      <span
                        className={`text-xs block mt-1 truncate ${
                          isVacant ? 'text-zinc-500 italic' : 'text-zinc-400'
                        }`}
                      >
                        {isVacant ? 'Sem titular definido' : motorcycle || 'Moto não informada'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-zinc-900 space-y-1 text-xs text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{isVacant ? 'Sem titular' : phone || 'Sem telefone'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="truncate">{isVacant ? '—' : email || 'Sem e-mail'}</span>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2 flex-wrap">
                    {/* Ordering controls (Admin only) */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveRole(role.id, 'up')}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-35 disabled:cursor-not-allowed text-zinc-300 hover:text-amber-400 border border-zinc-800 transition-colors"
                        title="Mover para cima / posição anterior"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === orderedBoardRoles.length - 1}
                        onClick={() => handleMoveRole(role.id, 'down')}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-35 disabled:cursor-not-allowed text-zinc-300 hover:text-amber-400 border border-zinc-800 transition-colors"
                        title="Mover para baixo / próxima posição"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <select
                        value={idx}
                        onChange={(e) => handleMoveRoleToIndex(role.id, Number(e.target.value))}
                        aria-label={`Ordem de ${role.holderName}`}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-1.5 py-1 text-[10px] font-bold text-zinc-300 focus:outline-none focus:border-amber-400"
                        title="Definir posição na diretoria"
                      >
                        {orderedBoardRoles.map((_, pos) => (
                          <option key={pos} value={pos}>
                            {pos + 1}º
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditRole(role)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Editar</span>
                      </button>
                      {role.id !== 'role-pres' && role.id !== 'role-president' && (
                        <button
                          onClick={() => handleDeleteRole(role)}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-400"
                          title="Remover Cargo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtab 2: Chat Interno da Diretoria */}
      {activeSubTab === 'chat' && (
        <div className="bg-[#121216] border border-zinc-800/90 rounded-2xl p-6 flex flex-col h-[650px] shadow-lg">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <div>
                <h3 className="font-rock text-lg uppercase font-bold text-white">
                  Canal Confidencial da Mesa Diretora
                </h3>
                <span className="text-[11px] text-zinc-400 block">
                  Visível apenas para o Presidente, Vice, Diretores e Disciplinares
                </span>
              </div>
            </div>
            <span className="text-xs bg-zinc-900 border border-zinc-800 px-3 py-1 rounded text-zinc-300">
              {boardChat.length} mensagens
            </span>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-2">
            {boardChat.map((msg) => {
              const isMe = currentUser?.id === msg.senderId;

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-xl ${isMe ? 'ml-auto flex-row-reverse text-right' : ''}`}
                >
                  <img
                    src={msg.senderAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'}
                    alt={msg.senderName}
                    className="w-9 h-9 rounded-full object-cover border border-amber-400/40 shrink-0 mt-1"
                  />
                  <div>
                    <div className={`flex items-center gap-2 mb-1 ${isMe ? 'justify-end' : ''}`}>
                      <span className="text-xs font-bold text-amber-400">{msg.senderName}</span>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteChatMessage(msg.id)}
                          className="text-zinc-500 hover:text-red-400 transition-colors"
                          title="Excluir Mensagem (Admin)"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                      isMe
                        ? 'bg-amber-400 text-black font-medium rounded-tr-none'
                        : 'bg-zinc-950 text-zinc-200 border border-zinc-800 rounded-tl-none'
                    }`}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chat Form */}
          <form onSubmit={handleSendChat} className="pt-3 border-t border-zinc-800 flex items-center gap-2">
            <input
              type="text"
              placeholder="Digite uma mensagem estratégica para a diretoria..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-rock font-bold text-xs uppercase flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Enviar</span>
            </button>
          </form>
        </div>
      )}

      {/* Subtab 3: Reuniões Exclusivas da Diretoria */}
      {activeSubTab === 'meetings' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-zinc-400">
              Pautas administrativas, votação de novos coletes e encontros exclusivos dos diretores.
            </p>
            {isAdmin && (
              <button
                onClick={handleOpenAddMeeting}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Reunião / Pauta</span>
              </button>
            )}
          </div>

          {/* Modal Create / Edit Board Meeting */}
          {isEditingMeeting && isAdmin && (
            <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
              <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg p-6 space-y-4 my-auto">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-amber-400" />
                    <h3 className="font-rock text-lg font-bold uppercase text-white">
                      {editingMeetingId ? 'Editar Reunião da Diretoria' : 'Agendar Reunião da Diretoria'}
                    </h3>
                  </div>
                  <button onClick={() => setIsEditingMeeting(false)} className="text-zinc-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveMeeting} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                      Título da Pauta / Reunião *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Reunião Ordinária da Mesa Diretora"
                      value={meetingTitle}
                      onChange={(e) => setMeetingTitle(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Data *</label>
                      <input
                        type="date"
                        required
                        value={meetingDate}
                        onChange={(e) => setMeetingDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Horário *</label>
                      <input
                        type="time"
                        required
                        value={meetingTime}
                        onChange={(e) => setMeetingTime(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Local *</label>
                      <input
                        type="text"
                        required
                        value={meetingLocation}
                        onChange={(e) => setMeetingLocation(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Condutor da Pauta</label>
                      <input
                        type="text"
                        value={meetingConductor}
                        onChange={(e) => setMeetingConductor(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">Pauta & Assuntos</label>
                    <textarea
                      rows={3}
                      value={meetingDescription}
                      onChange={(e) => setMeetingDescription(e.target.value)}
                      placeholder="Assuntos administrativos, novos coletes, finanças..."
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setIsEditingMeeting(false)}
                      className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase hover:bg-zinc-700"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black rounded-lg text-xs font-bold uppercase font-rock"
                    >
                      {editingMeetingId ? 'Atualizar Reunião' : 'Salvar Reunião'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {boardEvents.length === 0 ? (
              <div className="col-span-2 p-8 text-center text-xs text-zinc-400 bg-[#121216] rounded-xl border border-zinc-800">
                Nenhuma reunião exclusiva da diretoria agendada no momento.
              </div>
            ) : (
              boardEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="bg-[#121216] border border-amber-400/40 rounded-2xl p-6 space-y-3 shadow-md flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded bg-amber-400 text-black text-[10px] font-bold uppercase tracking-wider">
                        Pauta Restrita
                      </span>
                      <span className="text-xs text-amber-400 font-mono font-bold">
                        {evt.date} às {evt.time}h
                      </span>
                    </div>

                    <h4 className="font-rock text-xl uppercase font-bold text-white">
                      {evt.title}
                    </h4>

                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {evt.description}
                    </p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-zinc-800">
                    <div className="text-xs text-zinc-400 flex items-center justify-between gap-2 flex-wrap">
                      <span>Local: <strong className="text-zinc-200">{evt.meetingPoint}</strong></span>
                      <span>Condutor: <strong className="text-zinc-200">{evt.roadCaptain}</strong></span>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/60">
                        <button
                          onClick={() => handleOpenEditMeeting(evt)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Editar Pauta</span>
                        </button>
                        <button
                          onClick={() => handleDeleteMeeting(evt.id)}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-400"
                          title="Excluir Reunião"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121216] border border-red-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
              <h4 className="font-rock text-base font-bold uppercase text-white">
                {confirmDelete.title}
              </h4>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">{confirmDelete.message}</p>
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold uppercase"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
