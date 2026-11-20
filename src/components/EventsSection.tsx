import { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  Gauge, 
  Navigation, 
  UserCheck, 
  Plus, 
  Edit3, 
  Trash2, 
  Download, 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ShieldAlert, 
  Users,
  Upload,
  Cake,
  Award,
  Pin,
  PinOff,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { MemberPublicProfile, RideEvent, User, getMemberDisplayName } from '../types';
import {
  formatEventPeriodLabel,
  getNormalizedEventEndDate,
  isEventActiveOnDate,
  isMultiDayEvent,
} from '../services/financeSchedule';
import { StorageService, playSound } from '../services/storage';
import { compressImageFile } from '../services/imageUtils';
import { PhotoSourcePicker } from './PhotoSourcePicker';

interface EventsSectionProps {
  events: RideEvent[];
  users?: User[];
  publicProfiles?: MemberPublicProfile[];
  currentUser: User | null;
  onUpdateEvents: (events: RideEvent[]) => void;
  onOpenAuth: () => void;
  openCalendarSignal?: number;
}

export default function EventsSection({
  events,
  users = [],
  publicProfiles = [],
  currentUser,
  onUpdateEvents,
  onOpenAuth,
  openCalendarSignal = 0,
}: EventsSectionProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'calendar'>('cards');

  useEffect(() => {
    if (openCalendarSignal > 0) {
      setViewMode('calendar');
    }
  }, [openCalendarSignal]);
  const [editingEvent, setEditingEvent] = useState<RideEvent | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formTime, setFormTime] = useState('08:00');
  const [formMeetingPoint, setFormMeetingPoint] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formDistanceKm, setFormDistanceKm] = useState(150);
  const [formAverageSpeed, setFormAverageSpeed] = useState('90 - 100 km/h');
  const [formRoadCaptain, setFormRoadCaptain] = useState('');
  const [formIsExclusiveBoard, setFormIsExclusiveBoard] = useState(false);
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [formImageUrl, setFormImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [eventSyncError, setEventSyncError] = useState('');

  // Calendar month state
  const [currentCalendarDate, setCurrentCalendarDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const isAdmin = currentUser?.role === 'admin' || currentUser?.email?.toLowerCase() === 'eliezerrmartins@gmail.com';

  const handleEventImageFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadError('');
    setIsUploadingImage(true);
    try {
      const dataUrl = await compressImageFile(file, { maxDimension: 1024, maxChars: 240_000 });
      setFormImageUrl(dataUrl);
      playSound('success');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao processar imagem.');
      playSound('beep');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const openCreateModal = () => {
    setFormTitle('');
    setFormDescription('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormEndDate('');
    setFormTime('08:00');
    setFormMeetingPoint('Sede Oficina do Rock (Rua Fortunato Antônio de Camargo, 215)');
    setFormDestination('');
    setFormDistanceKm(120);
    setFormAverageSpeed('90 - 100 km/h');
    setFormRoadCaptain(currentUser?.name || 'Road Captain');
    setFormIsExclusiveBoard(false);
    setFormIsPinned(false);
    setFormImageUrl('https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=800&q=80');
    setUploadError('');
    setEventSyncError('');
    setEditingEvent(null);
    setIsCreating(true);
  };

  const openEditModal = (event: RideEvent) => {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormDescription(event.description);
    setFormDate(event.date);
    setFormEndDate(event.endDate && event.endDate > event.date ? event.endDate : '');
    setFormTime(event.time);
    setFormMeetingPoint(event.meetingPoint);
    setFormDestination(event.destination);
    setFormDistanceKm(event.distanceKm);
    setFormAverageSpeed(event.averageSpeed);
    setFormRoadCaptain(event.roadCaptain);
    setFormIsExclusiveBoard(Boolean(event.isExclusiveBoard));
    setFormIsPinned(Boolean(event.isPinned));
    setFormImageUrl(event.imageUrl || '');
    setUploadError('');
    setEventSyncError('');
    setIsCreating(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDate || isSavingEvent) return;
    setUploadError('');
    setEventSyncError('');

    const normalizedEndDate =
      formEndDate && formEndDate >= formDate ? (formEndDate > formDate ? formEndDate : undefined) : undefined;
    if (formEndDate && formEndDate < formDate) {
      setUploadError('A data final não pode ser anterior à data inicial.');
      playSound('beep');
      return;
    }

    setIsSavingEvent(true);
    const updated = editingEvent
      ? events.map((ev) =>
          ev.id === editingEvent.id
            ? {
                ...ev,
                title: formTitle.trim(),
                description: formDescription,
                date: formDate,
                endDate: normalizedEndDate,
                time: formTime,
                meetingPoint: formMeetingPoint,
                destination: formDestination,
                distanceKm: Number(formDistanceKm),
                averageSpeed: formAverageSpeed,
                roadCaptain: formRoadCaptain,
                isExclusiveBoard: formIsExclusiveBoard,
                isPinned: formIsPinned,
                imageUrl: formImageUrl || undefined,
              }
            : ev
        )
      : [
          ...events,
          {
            id: `evt-${Date.now()}`,
            title: formTitle.trim(),
            description: formDescription,
            date: formDate,
            endDate: normalizedEndDate,
            time: formTime,
            meetingPoint: formMeetingPoint,
            destination: formDestination,
            distanceKm: Number(formDistanceKm),
            averageSpeed: formAverageSpeed,
            roadCaptain: formRoadCaptain,
            isExclusiveBoard: formIsExclusiveBoard,
            isPinned: formIsPinned,
            attendees: currentUser ? [currentUser.id] : [],
            imageUrl: formImageUrl || undefined,
          },
        ];

    try {
      await StorageService.saveEventsConfirmed(updated);
      onUpdateEvents(updated);
      setIsCreating(false);
      setEditingEvent(null);
      playSound('success');
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Sincronização não concluída. Os dados preenchidos foram preservados.'
      );
      playSound('beep');
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleTogglePinEvent = async (eventId: string) => {
    if (!isAdmin || isSavingEvent) return;
    setEventSyncError('');
    setIsSavingEvent(true);
    const updated = events.map((ev) =>
      ev.id === eventId ? { ...ev, isPinned: !ev.isPinned } : ev
    );
    try {
      await StorageService.saveEventsConfirmed(updated);
      onUpdateEvents(updated);
      playSound('click');
    } catch (err) {
      setEventSyncError(err instanceof Error ? err.message : 'Falha ao atualizar destaque na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleConfirmDeleteEvent = async () => {
    if (!confirmDeleteEventId || isSavingEvent) return;
    setEventSyncError('');
    setIsSavingEvent(true);
    const updated = events.filter((e) => e.id !== confirmDeleteEventId);
    try {
      await StorageService.saveEventsConfirmed(updated);
      onUpdateEvents(updated);
      setConfirmDeleteEventId(null);
      playSound('click');
    } catch (err) {
      setEventSyncError(err instanceof Error ? err.message : 'Falha ao excluir evento na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleToggleAttendance = async (eventId: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (isSavingEvent) return;
    setEventSyncError('');
    setIsSavingEvent(true);

    const updated = events.map((ev) => {
      if (ev.id === eventId) {
        const isAttending = ev.attendees.includes(currentUser.id);
        const attendees = isAttending
          ? ev.attendees.filter((id) => id !== currentUser.id)
          : [...ev.attendees, currentUser.id];
        return { ...ev, attendees };
      }
      return ev;
    });

    try {
      await StorageService.saveEventsConfirmed(updated);
      onUpdateEvents(updated);
      playSound('success');
    } catch (err) {
      setEventSyncError(err instanceof Error ? err.message : 'Falha ao confirmar presença na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Generate iCalendar (.ics) download for easy smartphone integration
  const downloadIcs = (event: RideEvent) => {
    const cleanDate = event.date.replace(/-/g, '');
    const endDate = getNormalizedEventEndDate(event);
    const cleanTime = event.time.replace(':', '') + '00';
    const startIso = `${cleanDate}T${cleanTime}`;
    const dtEndLine =
      endDate > event.date ? `\nDTEND:${endDate.replace(/-/g, '')}T235900` : '';

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Oficina do Rock Motoclube//PT-BR
BEGIN:VEVENT
SUMMARY:${event.title} - Oficina do Rock MC
DESCRIPTION:${event.description}\\nPeríodo: ${formatEventPeriodLabel(event)}\\nPonto de Encontro: ${event.meetingPoint}\\nDestino: ${event.destination}\\nCapitão de Estrada: ${event.roadCaptain}
LOCATION:${event.meetingPoint}
DTSTART:${startIso}${dtEndLine}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `evento-oficina-do-rock-${event.id}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    playSound('beep');
  };

  // Filter out board-exclusive events if not board/admin, and prioritize pinned events
  const visibleEvents = [...events]
    .filter((ev) => {
      if (!ev.isExclusiveBoard) return true;
      return currentUser?.role === 'admin' || currentUser?.role === 'board';
    })
    .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)));

  // Calendar rendering helper
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const isActiveMember = currentUser?.status === 'active';
  const calendarMembers = isActiveMember
    ? publicProfiles.length > 0
      ? publicProfiles.map((p) => ({
          id: p.id,
          name: p.name,
          nickname: p.nickname,
          avatarUrl: p.avatarUrl,
          birthDate: p.birthDate,
          joinedDate: p.joinedDate,
        }))
      : users
          .filter((u) => u.status === 'active')
          .map((u) => ({
            id: u.id,
            name: u.name,
            nickname: u.nickname,
            avatarUrl: u.avatarUrl,
            birthDate: u.birthDate,
            joinedDate: u.joinedDate,
          }))
    : [];
  const monthStr = String(month + 1).padStart(2, '0');

  const monthBirthdays = calendarMembers
    .filter((u) => Boolean(u.birthDate && u.birthDate.length >= 10 && u.birthDate.slice(5, 7) === monthStr))
    .map((u) => ({
      user: u,
      day: parseInt(u.birthDate!.slice(8, 10), 10),
      monthDay: u.birthDate!.slice(5, 10),
    }))
    .sort((a, b) => a.day - b.day);

  const monthClubAnniversaries = calendarMembers
    .filter((u) => {
      if (!u.joinedDate || u.joinedDate.length < 10) return false;
      if (u.joinedDate.slice(5, 7) !== monthStr) return false;
      const joinedYr = parseInt(u.joinedDate.slice(0, 4), 10);
      return !Number.isNaN(joinedYr) && year >= joinedYr;
    })
    .map((u) => {
      const joinedYr = parseInt(u.joinedDate!.slice(0, 4), 10);
      return {
        user: u,
        day: parseInt(u.joinedDate!.slice(8, 10), 10),
        monthDay: u.joinedDate!.slice(5, 10),
        joinedDate: u.joinedDate!,
        yearsInClub: Math.max(0, year - joinedYr),
      };
    })
    .sort((a, b) => a.day - b.day);

  return (
    <div className="space-y-8">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest block">
            Estrada & Confraternização
          </span>
          <h2 className="font-rock text-3xl font-bold uppercase text-white tracking-wide">
            Próximos Eventos & Passeios
          </h2>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {/* Switch View Mode */}
          <div className="bg-zinc-900 p-1 rounded-lg border border-zinc-800 flex items-center">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                viewMode === 'cards'
                  ? 'bg-amber-400 text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Lista de Passeios
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${
                viewMode === 'calendar'
                  ? 'bg-amber-400 text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Calendário
            </button>
          </div>

          {isAdmin && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Evento (Admin)</span>
            </button>
          )}
        </div>
      </div>

      {eventSyncError && (
        <div className="p-3 bg-red-950/70 border border-red-700/70 rounded-xl text-xs text-red-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{eventSyncError}</span>
          </div>
          <button
            type="button"
            onClick={() => setEventSyncError('')}
            className="text-red-300 hover:text-white font-bold uppercase text-[10px]"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Create / Edit Modal */}
      {isCreating && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-2xl p-6 space-y-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-amber-400" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  {editingEvent ? 'Editar Evento / Passeio' : 'Cadastrar Novo Passeio / Evento'}
                </h3>
              </div>
              <button
                onClick={() => setIsCreating(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Título do Evento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Passeio das Serras - Paranapiacaba"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Data Inicial *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormDate(val);
                      if (formEndDate && val && formEndDate < val) {
                        setFormEndDate(val);
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Data Final (Opcional)
                  </label>
                  <input
                    type="date"
                    min={formDate || undefined}
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Horário de Concentração *
                  </label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Ponto de Encontro *
                  </label>
                  <input
                    type="text"
                    required
                    value={formMeetingPoint}
                    onChange={(e) => setFormMeetingPoint(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Destino Final *
                  </label>
                  <input
                    type="text"
                    required
                    value={formDestination}
                    onChange={(e) => setFormDestination(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Distância Estimada (Km total)
                  </label>
                  <input
                    type="number"
                    value={formDistanceKm}
                    onChange={(e) => setFormDistanceKm(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Velocidade de Cruzeiro do Comboio
                  </label>
                  <input
                    type="text"
                    value={formAverageSpeed}
                    onChange={(e) => setFormAverageSpeed(e.target.value)}
                    placeholder="90 - 100 km/h"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Capitão de Estrada (Road Captain)
                  </label>
                  <input
                    type="text"
                    value={formRoadCaptain}
                    onChange={(e) => setFormRoadCaptain(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                    Imagem de Capa (URL, Galeria Nativa ou Google Fotos)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <PhotoSourcePicker
                      multiple={false}
                      disabled={isUploadingImage}
                      title="Imagem de Capa do Evento"
                      onSelectFiles={handleEventImageFiles}
                      className="shrink-0"
                    >
                      <div className="cursor-pointer px-3.5 py-2 bg-zinc-950 hover:bg-zinc-900 border border-dashed border-amber-400/50 rounded-lg text-xs font-bold text-amber-400 flex items-center justify-center gap-1.5 transition-colors">
                        {isUploadingImage ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>{isUploadingImage ? 'Otimizando...' : 'Carregar Foto'}</span>
                      </div>
                    </PhotoSourcePicker>
                    <input
                      type="text"
                      placeholder="https://... ou foto carregada"
                      value={formImageUrl}
                      onChange={(e) => setFormImageUrl(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  {uploadError && (
                    <p className="text-[11px] text-red-400 font-semibold mt-1">{uploadError}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Briefing & Detalhes do Passeio
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Informações sobre paradas, abastecimento, café e almoço..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="exclusiveBoard"
                    checked={formIsExclusiveBoard}
                    onChange={(e) => setFormIsExclusiveBoard(e.target.checked)}
                    className="w-4 h-4 accent-amber-400 rounded"
                  />
                  <label htmlFor="exclusiveBoard" className="text-xs font-semibold text-zinc-300 cursor-pointer">
                    Evento exclusivo para integrantes da Diretoria
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pinEventCheck"
                    checked={formIsPinned}
                    onChange={(e) => setFormIsPinned(e.target.checked)}
                    className="w-4 h-4 accent-amber-400 rounded"
                  />
                  <label htmlFor="pinEventCheck" className="text-xs font-semibold text-amber-300 cursor-pointer flex items-center gap-1.5">
                    <Pin className="w-3.5 h-3.5 text-amber-400" />
                    <span>Fixar evento no topo da lista (Destaque)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black rounded-lg text-xs font-bold uppercase font-rock"
                >
                  {editingEvent ? 'Atualizar Evento' : 'Salvar Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cards View */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {visibleEvents.map((event) => {
            const isAttending = currentUser ? event.attendees.includes(currentUser.id) : false;
            
            return (
              <div
                key={event.id}
                className="bg-[#121216] border border-zinc-800/90 rounded-2xl overflow-hidden hover:border-amber-400/40 transition-colors flex flex-col justify-between shadow-lg"
              >
                <div>
                  {event.imageUrl && (
                    <div className="w-full bg-black border-b border-zinc-800/80 flex items-center justify-center p-2">
                      <img
                        src={event.imageUrl}
                        alt={event.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-auto max-h-[560px] object-contain mx-auto block rounded-lg"
                      />
                    </div>
                  )}

                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-zinc-800">
                      <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                        {formatEventPeriodLabel(event)} · {event.time}h
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isMultiDayEvent(event) && (
                          <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold uppercase border border-sky-400/40">
                            Multidias
                          </span>
                        )}
                        {event.isPinned && (
                          <span className="px-2 py-0.5 rounded bg-amber-400 text-black text-[10px] font-bold uppercase flex items-center gap-1">
                            <Pin className="w-3 h-3" />
                            <span>Fixado</span>
                          </span>
                        )}
                        {event.isExclusiveBoard && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase border border-amber-500/40">
                            Exclusivo Diretoria
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-rock text-2xl font-bold uppercase text-white leading-tight">
                      {event.title}
                    </h3>

                    <p className="text-sm text-zinc-300 leading-relaxed">
                      {event.description}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-zinc-300 pt-2">
                      <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Saída</span>
                          <span className="truncate block font-medium">{event.meetingPoint}</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 flex items-start gap-2">
                        <Navigation className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Destino</span>
                          <span className="truncate block font-medium">{event.destination}</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 flex items-center gap-2">
                        <Gauge className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Velocidade Comboio</span>
                          <span className="font-medium">{event.averageSpeed}</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Road Captain</span>
                          <span className="font-medium truncate">{event.roadCaptain}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 pt-0 space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400 pt-3 border-t border-zinc-800/80">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      {event.attendees.length} {event.attendees.length === 1 ? 'integrante confirmado' : 'integrantes confirmados'}
                    </span>

                    <button
                      onClick={() => downloadIcs(event)}
                      className="text-xs text-zinc-400 hover:text-amber-400 flex items-center gap-1 transition-colors"
                      title="Baixar arquivo .ICS para adicionar ao Google Agenda / Celular"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Adicionar à Agenda</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleAttendance(event.id)}
                      className={`flex-1 py-2.5 px-4 rounded-lg font-rock text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
                        isAttending
                          ? 'bg-zinc-800 text-amber-400 border border-amber-400/40 hover:bg-zinc-700'
                          : 'bg-amber-400 hover:bg-amber-300 text-black'
                      }`}
                    >
                      {isAttending ? (
                        <>
                          <Check className="w-4 h-4 text-amber-400" />
                          <span>Presença Confirmada! (Vou Rodar)</span>
                        </>
                      ) : (
                        <>
                          <Navigation className="w-4 h-4" />
                          <span>Confirmar Presença no Passeio</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-800 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleTogglePinEvent(event.id)}
                        className={`py-2 px-3 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5 transition-colors border ${
                          event.isPinned
                            ? 'bg-amber-400 text-black border-amber-400 hover:bg-amber-300'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
                        }`}
                        title={event.isPinned ? 'Desafixar evento do topo' : 'Fixar evento no topo'}
                      >
                        {event.isPinned ? (
                          <PinOff className="w-3.5 h-3.5" />
                        ) : (
                          <Pin className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>{event.isPinned ? 'Desafixar' : 'Fixar'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(event)}
                        className="flex-1 py-2 px-3 rounded-lg bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/40 text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-colors font-rock"
                        title="Editar Passeio ou Evento"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Editar Passeio / Evento</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteEventId(event.id)}
                        className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-red-950/70 text-zinc-400 hover:text-red-400 border border-zinc-700 text-xs font-bold uppercase flex items-center gap-1.5 transition-colors"
                        title="Excluir Evento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div className="bg-[#121216] border border-zinc-800/90 rounded-2xl p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-rock text-2xl font-bold uppercase text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-amber-400" />
              <span>{monthNames[month]} {year}</span>
            </h3>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setCurrentCalendarDate(new Date(now.getFullYear(), now.getMonth(), 1));
                }}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-zinc-800 text-xs font-bold uppercase"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setCurrentCalendarDate(new Date(year, month - 1, 1))}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentCalendarDate(new Date(year, month + 1, 1))}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300"
                aria-label="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Calendar Legend */}
          <div className="flex items-center flex-wrap gap-3 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
              Passeios & Eventos
            </span>
            <span className="inline-flex items-center gap-1.5 text-sky-300">
              <Cake className="w-3.5 h-3.5 text-sky-400" />
              Aniversário do Integrante
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              Aniversário de Entrada no MC
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs uppercase text-zinc-400 pb-2 border-b border-zinc-800">
            <span>Dom</span>
            <span>Seg</span>
            <span>Ter</span>
            <span>Qua</span>
            <span>Qui</span>
            <span>Sex</span>
            <span>Sáb</span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[92px] p-2 bg-zinc-950/20 rounded-lg" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayStr = String(day).padStart(2, '0');
              const dateString = `${year}-${monthStr}-${dayStr}`;
              const monthDay = `${monthStr}-${dayStr}`;

              const dayEvents = visibleEvents.filter((e) => isEventActiveOnDate(e, dateString));
              const dayBirthdays = monthBirthdays.filter((b) => b.monthDay === monthDay);
              const dayAnniversaries = monthClubAnniversaries.filter((a) => a.monthDay === monthDay);

              const hasItems =
                dayEvents.length > 0 || dayBirthdays.length > 0 || dayAnniversaries.length > 0;

              return (
                <div
                  key={`day-${day}`}
                  className={`min-h-[92px] p-1.5 sm:p-2 rounded-lg border flex flex-col justify-between transition-colors ${
                    dayEvents.length > 0
                      ? 'bg-amber-400/10 border-amber-400/50'
                      : dayBirthdays.length > 0 || dayAnniversaries.length > 0
                      ? 'bg-zinc-900/80 border-sky-500/35'
                      : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <span
                    className={`text-xs font-bold block ${
                      dayEvents.length > 0
                        ? 'text-amber-400'
                        : hasItems
                        ? 'text-sky-300'
                        : 'text-zinc-400'
                    }`}
                  >
                    {day}
                  </span>

                  <div className="space-y-1 mt-1">
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => {
                          if (isAdmin) openEditModal(ev);
                        }}
                        className={`text-[10px] p-1 rounded bg-amber-400 text-black font-bold uppercase truncate ${
                          isAdmin ? 'cursor-pointer hover:bg-amber-300' : ''
                        }`}
                        title={isAdmin ? `Editar: ${ev.title} (${ev.time}h)` : `${ev.title} (${ev.time}h)`}
                      >
                        {ev.title}
                      </div>
                    ))}

                    {dayBirthdays.map(({ user }) => (
                      <div
                        key={`bday-${user.id}`}
                        className="text-[10px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-200 border border-sky-400/40 font-semibold flex items-center gap-1 truncate"
                        title={`Aniversário de ${getMemberDisplayName(user)} (${user.name})`}
                      >
                        <Cake className="w-3 h-3 text-sky-400 shrink-0" />
                        <span className="truncate">{getMemberDisplayName(user)}</span>
                      </div>
                    ))}

                    {dayAnniversaries.map(({ user, yearsInClub }) => (
                      <div
                        key={`mc-${user.id}`}
                        className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 font-semibold flex items-center gap-1 truncate"
                        title={
                          yearsInClub > 0
                            ? `${yearsInClub} ano(s) de Motoclube: ${getMemberDisplayName(user)}`
                            : `Entrada no Motoclube: ${getMemberDisplayName(user)}`
                        }
                      >
                        <Award className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="truncate">
                          {yearsInClub > 0 ? `${yearsInClub}a MC` : 'MC'} · {getMemberDisplayName(user)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Monthly Member Dates Summary */}
          {isActiveMember ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-zinc-800/80">
              <div className="p-4 rounded-xl bg-zinc-950/70 border border-sky-500/30 space-y-2.5">
                <h4 className="font-rock text-sm font-bold uppercase text-sky-300 flex items-center gap-2">
                  <Cake className="w-4 h-4 text-sky-400" />
                  <span>Aniversariantes de {monthNames[month]}</span>
                </h4>
                {monthBirthdays.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Nenhum integrante faz aniversário em {monthNames[month].toLowerCase()}.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {monthBirthdays.map(({ user, day }) => (
                      <div
                        key={`summary-bday-${user.id}`}
                        className="flex items-center justify-between gap-2 text-xs bg-zinc-900/70 px-3 py-2 rounded-lg border border-zinc-800"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={
                              user.avatarUrl ||
                              'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'
                            }
                            alt={getMemberDisplayName(user)}
                            className="w-6 h-6 rounded-full object-cover border border-sky-400/50 shrink-0"
                          />
                          <span className="font-semibold text-white truncate">
                            {getMemberDisplayName(user)}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-sky-300 shrink-0">
                          {String(day).padStart(2, '0')}/{monthStr}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-zinc-950/70 border border-emerald-500/30 space-y-2.5">
                <h4 className="font-rock text-sm font-bold uppercase text-emerald-300 flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <span>Aniversário de Entrada no MC ({monthNames[month]})</span>
                </h4>
                {monthClubAnniversaries.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Nenhuma data de ingresso registrada em {monthNames[month].toLowerCase()}.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {monthClubAnniversaries.map(({ user, day, joinedDate, yearsInClub }) => (
                      <div
                        key={`summary-mc-${user.id}`}
                        className="flex items-center justify-between gap-2 text-xs bg-zinc-900/70 px-3 py-2 rounded-lg border border-zinc-800"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={
                              user.avatarUrl ||
                              'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'
                            }
                            alt={getMemberDisplayName(user)}
                            className="w-6 h-6 rounded-full object-cover border border-emerald-400/50 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="font-semibold text-white truncate block">
                              {getMemberDisplayName(user)}
                            </span>
                            <span className="text-[10px] text-emerald-300/80 block">
                              {yearsInClub > 0
                                ? `${yearsInClub} ${yearsInClub === 1 ? 'ano' : 'anos'} de Motoclube`
                                : 'Ingresso no Motoclube'}{' '}
                              (desde {joinedDate.slice(0, 4)})
                            </span>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-emerald-300 shrink-0">
                          {String(day).padStart(2, '0')}/{monthStr}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-400 pt-3 border-t border-zinc-800/80 text-center">
              Faça login como integrante ativo para visualizar os aniversários e datas de entrada no Motoclube no calendário.
            </p>
          )}
        </div>
      )}

      {/* Delete Event Confirmation Modal */}
      {confirmDeleteEventId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121216] border border-red-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              <h4 className="font-rock text-base font-bold uppercase text-white">
                Excluir Evento / Passeio
              </h4>
            </div>
            <p className="text-xs text-zinc-300">
              Deseja realmente excluir este evento da agenda do Motoclube?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteEventId(null)}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteEvent}
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
