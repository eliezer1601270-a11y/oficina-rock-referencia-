import { useState } from 'react';
import {
  MapPin,
  ExternalLink,
  Instagram,
  Facebook,
  Youtube,
  Phone,
  Mail,
  Edit3,
  Save,
  X,
  Calendar,
  Shield,
  Navigation,
  Flame,
  Music2,
  Award,
  User as UserIcon,
  DoorOpen,
  DoorClosed,
  Upload,
  Trash2,
  HeartHandshake,
  ArrowRight,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  ClubAnnouncement,
  ClubInfo,
  BoardRoleConfig,
  RideEvent,
  User,
  DEFAULT_CREST_URL,
  DEFAULT_FEDERATION_LOGO_URL,
  resolveBoardComposition,
} from '../types';
import { StorageService, playSound } from '../services/storage';
import { auth } from '../services/firebase';
import { formatEventPeriodLabel, isEventUpcomingOrOngoing } from '../services/financeSchedule';
import { compressImageFile } from '../services/imageUtils';
import { PhotoSourcePicker } from './PhotoSourcePicker';

interface HistorySectionProps {
  clubInfo: ClubInfo;
  boardRoles: BoardRoleConfig[];
  users?: User[];
  publicAnnouncements?: ClubAnnouncement[];
  events?: RideEvent[];
  currentUser: User | null;
  onUpdateClubInfo: (info: ClubInfo) => void;
  onNavigateToTab: (tab: string) => void;
}

export default function HistorySection({
  clubInfo,
  boardRoles,
  users = [],
  publicAnnouncements = [],
  events = [],
  currentUser,
  onUpdateClubInfo,
  onNavigateToTab,
}: HistorySectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<ClubInfo>(clubInfo);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [assetUploadError, setAssetUploadError] = useState('');
  const [previewHeadquartersPhoto, setPreviewHeadquartersPhoto] = useState<string | null>(null);

  // Quick Admin modals for top-right Crest and Sede Aberta
  const [isEditingRightCrest, setIsEditingRightCrest] = useState(false);
  const [rightCrestInput, setRightCrestInput] = useState('');
  const [isEditingSedeOpen, setIsEditingSedeOpen] = useState(false);
  const [sedeOpenDraft, setSedeOpenDraft] = useState(Boolean(clubInfo.isHeadquartersOpen));
  const [sedeTextDraft, setSedeTextDraft] = useState(clubInfo.headquartersOpenText || '');
  const [sedePhotosDraft, setSedePhotosDraft] = useState<string[]>(
    clubInfo.headquartersOpenPhotos || []
  );
  const [notifyAppUpdateOnSave, setNotifyAppUpdateOnSave] = useState(false);

  // Quick Admin modal for Federation Affiliation (FMC-SP)
  const [isEditingFederation, setIsEditingFederation] = useState(false);
  const [fedBadgeDraft, setFedBadgeDraft] = useState(clubInfo.federationBadgeLabel || '');
  const [fedTitleDraft, setFedTitleDraft] = useState(
    clubInfo.federationTitle || 'Filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP)'
  );
  const [fedDescDraft, setFedDescDraft] = useState(clubInfo.federationDescription || '');
  const [fedLogoDraft, setFedLogoDraft] = useState(
    clubInfo.federationLogoUrl || DEFAULT_FEDERATION_LOGO_URL
  );
  const [fedWebsiteDraft, setFedWebsiteDraft] = useState(clubInfo.federationWebsite || '');
  const [fedWebsiteLabelDraft, setFedWebsiteLabelDraft] = useState(
    clubInfo.federationWebsiteLabel || ''
  );
  const [fedRegCodeDraft, setFedRegCodeDraft] = useState(
    clubInfo.federationRegistrationCode || ''
  );
  const [fedHiddenDraft, setFedHiddenDraft] = useState(Boolean(clubInfo.federationHidden));
  const [isSavingClubInfo, setIsSavingClubInfo] = useState(false);
  const [cloudSaveSuccessNotice, setCloudSaveSuccessNotice] = useState('');

  const isAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.email?.toLowerCase().trim() === 'eliezerrmartins@gmail.com';

  const normalizeOptionalUrl = (raw?: string): string => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    if (/^(https?:\/\/|mailto:|tel:|\/|data:)/i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const commitClubInfoUpdate = async (
    updated: ClubInfo,
    onSuccess: () => void,
    successMsg = 'Dados salvos na nuvem!'
  ) => {
    setAssetUploadError('');
    if (!auth.currentUser) {
      setAssetUploadError(
        'Conecte sua Conta Google de Administrador (clique em Entrar no topo) para salvar as alterações na nuvem.'
      );
      playSound('beep');
      return;
    }
    setIsSavingClubInfo(true);
    try {
      await StorageService.saveClubInfoAndAwaitCloud(updated);
      onUpdateClubInfo(updated);
      onSuccess();
      setCloudSaveSuccessNotice(successMsg);
      setTimeout(() => setCloudSaveSuccessNotice(''), 4000);
      playSound('success');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.toLowerCase().includes('maximum') || raw.toLowerCase().includes('size')) {
        setAssetUploadError(
          'As fotos da página principal estão muito pesadas juntas. Remova uma foto ou escolha uma imagem menor.'
        );
      } else if (raw.toLowerCase().includes('permission')) {
        setAssetUploadError(
          'Permissão recusada na nuvem. Verifique se você está conectado com a Conta Google de Administrador.'
        );
      } else {
        setAssetUploadError('Não foi possível salvar os dados na nuvem. Tente novamente.');
      }
      playSound('beep');
    } finally {
      setIsSavingClubInfo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const merged: ClubInfo = {
      ...clubInfo,
      ...formData,
      name: (formData.name || '').trim() || 'Oficina do Rock Motoclube',
      googleMapsUrl: normalizeOptionalUrl(formData.googleMapsUrl),
      instagram: normalizeOptionalUrl(formData.instagram),
      facebook: normalizeOptionalUrl(formData.facebook),
      youtube: normalizeOptionalUrl(formData.youtube),
      federationWebsite: normalizeOptionalUrl(formData.federationWebsite),
      ...(notifyAppUpdateOnSave
        ? {
            appUpdateId: `upd-${Date.now()}`,
            appUpdateVersion: 'Atualização Administrativa',
            appUpdateMessage:
              'O administrador atualizou informações oficiais do Motoclube. Toque em Atualizar Agora para aplicar.',
            appUpdatePublishedAt: new Date().toISOString(),
          }
        : {}),
    };
    await commitClubInfoUpdate(
      merged,
      () => {
        setNotifyAppUpdateOnSave(false);
        setIsEditing(false);
      },
      'Dados do Motoclube atualizados com sucesso!'
    );
  };

  const handleUploadCrestFiles = async (
    files: File[],
    target: 'left' | 'right' | 'quickRight' | 'federationForm' | 'federationQuick'
  ) => {
    const file = files[0];
    if (!file) return;
    setAssetUploadError('');
    setIsUploadingAsset(true);
    try {
      const dataUrl = await compressImageFile(file, { maxDimension: 512, maxChars: 110_000 });
      if (target === 'left') {
        setFormData((prev) => ({ ...prev, leftCrestUrl: dataUrl }));
      } else if (target === 'right') {
        setFormData((prev) => ({ ...prev, rightCrestUrl: dataUrl }));
      } else if (target === 'federationForm') {
        setFormData((prev) => ({ ...prev, federationLogoUrl: dataUrl }));
      } else if (target === 'federationQuick') {
        setFedLogoDraft(dataUrl);
      } else {
        setRightCrestInput(dataUrl);
      }
      playSound('success');
    } catch (err) {
      setAssetUploadError(err instanceof Error ? err.message : 'Erro ao processar imagem.');
      playSound('beep');
    } finally {
      setIsUploadingAsset(false);
    }
  };

  const handleUploadSedeFiles = async (
    files: File[],
    mode: 'fullForm' | 'quickModal'
  ) => {
    if (!files || files.length === 0) return;
    setAssetUploadError('');
    setIsUploadingAsset(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const dataUrl = await compressImageFile(file, { maxDimension: 760, maxChars: 44_000 });
        uploadedUrls.push(dataUrl);
      }
      if (mode === 'fullForm') {
        setFormData((prev) => ({
          ...prev,
          headquartersOpenPhotos: [...(prev.headquartersOpenPhotos || []), ...uploadedUrls].slice(0, 20),
        }));
      } else {
        setSedePhotosDraft((prev) => [...prev, ...uploadedUrls].slice(0, 20));
      }
      playSound('success');
    } catch (err) {
      setAssetUploadError(err instanceof Error ? err.message : 'Erro ao processar foto da sede.');
      playSound('beep');
    } finally {
      setIsUploadingAsset(false);
    }
  };

  const handleSaveQuickRightCrest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const updated: ClubInfo = {
      ...clubInfo,
      rightCrestUrl: rightCrestInput.trim() || DEFAULT_CREST_URL,
    };
    await commitClubInfoUpdate(
      updated,
      () => setIsEditingRightCrest(false),
      'Brasão atualizado na nuvem!'
    );
  };

  const handleSaveQuickSedeOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const updated: ClubInfo = {
      ...clubInfo,
      isHeadquartersOpen: sedeOpenDraft,
      headquartersOpenText: sedeTextDraft.trim(),
      headquartersOpenPhotos: sedePhotosDraft.slice(0, 20),
    };
    await commitClubInfoUpdate(
      updated,
      () => setIsEditingSedeOpen(false),
      'Status e fotos da sede salvos na nuvem!'
    );
  };

  const handleSaveQuickFederation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const updated: ClubInfo = {
      ...clubInfo,
      federationBadgeLabel: fedBadgeDraft.trim() || 'Filiação Oficial',
      federationTitle:
        fedTitleDraft.trim() ||
        'Filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP)',
      federationDescription: fedDescDraft.trim(),
      federationLogoUrl: fedLogoDraft.trim() || DEFAULT_FEDERATION_LOGO_URL,
      federationWebsite: normalizeOptionalUrl(fedWebsiteDraft),
      federationWebsiteLabel: fedWebsiteLabelDraft.trim(),
      federationRegistrationCode: fedRegCodeDraft.trim(),
      federationHidden: fedHiddenDraft,
    };
    await commitClubInfoUpdate(
      updated,
      () => setIsEditingFederation(false),
      'Dados da filiação à federação salvos com sucesso!'
    );
  };

  const sedePhotos = clubInfo.headquartersOpenPhotos || [];

  return (
    <div className="space-y-10">
      {/* Hero Presentation */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-900 to-[#101014] border border-zinc-800 p-6 md:p-12">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-widest">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>
                {clubInfo.city} · Desde {clubInfo.foundationYear}
              </span>
            </div>

            <h1 className="font-rock text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white uppercase leading-none">
              {clubInfo.name}
            </h1>

            <p className="text-base sm:text-lg text-zinc-300 leading-relaxed max-w-3xl">
              Irmandade construída sobre duas rodas, riffs de guitarra e o respeito sagrado da estrada.
              Sede oficial em {clubInfo.city}, acolhendo motociclistas e apaixonados pelo bom e velho Rock'n Roll.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href={clubInfo.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-rock text-sm font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-amber-400/20"
              >
                <Navigation className="w-4 h-4" />
                <span>Como Chegar na Sede</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={() => onNavigateToTab('events')}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-rock text-sm font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-2 border border-zinc-700"
              >
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>{clubInfo.eventsButtonLabel?.trim() || 'Próximos Passeios'}</span>
              </button>

              {isAdmin && !isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setFormData(clubInfo);
                    setAssetUploadError('');
                    setIsEditing(true);
                  }}
                  className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-amber-400 hover:text-amber-300 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 border border-amber-400/30 ml-auto"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Editar Informações (Admin)</span>
                </button>
              )}
            </div>
          </div>

          {/* Top-Right Crest Display (Borderless) + Admin Photo Editor */}
          <div className="lg:col-span-4 flex justify-center">
            <div className="relative group flex flex-col items-center">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setRightCrestInput(clubInfo.rightCrestUrl || DEFAULT_CREST_URL);
                    setAssetUploadError('');
                    setIsEditingRightCrest(true);
                  }}
                  className="absolute top-1 right-1 z-10 p-1.5 rounded-lg bg-zinc-900 hover:bg-amber-400 text-amber-400 hover:text-black border border-amber-400/50 transition-colors shadow"
                  title="Editar Foto do Brasão Superior Direito (Admin)"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              <img
                src={clubInfo.rightCrestUrl || DEFAULT_CREST_URL}
                alt="Brasão Oficial Oficina do Rock"
                referrerPolicy="no-referrer"
                className="w-60 sm:w-64 h-auto object-contain border-0 transition-transform duration-300 group-hover:scale-105"
              />
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mt-3 text-center">
                Brasão Oficial Registrado · {clubInfo.city}
              </span>
            </div>
          </div>
        </div>
      </section>

      {cloudSaveSuccessNotice && (
        <div className="rounded-xl bg-emerald-950/60 border border-emerald-500/40 px-4 py-3 text-xs text-emerald-200 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{cloudSaveSuccessNotice}</span>
        </div>
      )}

      {/* Federation Affiliation Card (FMC-SP - Admin Editable) */}
      {clubInfo.federationHidden ? (
        isAdmin && (
          <section className="rounded-xl bg-zinc-900/60 border border-dashed border-zinc-700 px-5 py-3 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-zinc-400">
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Bloco de Filiação à Federação está oculto na página principal.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFedBadgeDraft(clubInfo.federationBadgeLabel || 'Filiação Oficial');
                setFedTitleDraft(
                  clubInfo.federationTitle ||
                    'Filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP)'
                );
                setFedDescDraft(
                  clubInfo.federationDescription ||
                    'O Oficina do Rock Motoclube é oficialmente filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP), reafirmando o compromisso com a irmandade motociclística, a segurança na estrada e a representatividade do motociclismo paulista.'
                );
                setFedLogoDraft(clubInfo.federationLogoUrl || DEFAULT_FEDERATION_LOGO_URL);
                setFedWebsiteDraft(clubInfo.federationWebsite || '');
                setFedWebsiteLabelDraft(clubInfo.federationWebsiteLabel || '');
                setFedRegCodeDraft(clubInfo.federationRegistrationCode || '');
                setFedHiddenDraft(Boolean(clubInfo.federationHidden));
                setAssetUploadError('');
                setIsEditingFederation(true);
              }}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-400/40 rounded-lg font-bold uppercase flex items-center gap-1.5 shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Editar / Exibir Filiação</span>
            </button>
          </section>
        )
      ) : (
        <section className="rounded-2xl bg-[#121216] border border-zinc-800/90 p-6 sm:p-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
              <img
                src={clubInfo.federationLogoUrl || DEFAULT_FEDERATION_LOGO_URL}
                alt="Logotipo Federação dos Motoclubes do Estado de São Paulo (FMC-SP)"
                referrerPolicy="no-referrer"
                className="w-24 h-24 sm:w-28 sm:h-28 object-contain border-0 rounded-full shrink-0"
              />
              <div className="space-y-2">
                {clubInfo.federationRegistrationCode?.trim() && (
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-xs font-bold uppercase tracking-widest text-amber-400">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-400/15 border border-amber-400/35 text-[11px] font-semibold text-amber-200">
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                      <span>{clubInfo.federationRegistrationCode.trim()}</span>
                    </span>
                  </div>
                )}
                <h2 className="font-rock text-xl sm:text-2xl font-bold uppercase text-white tracking-wide">
                  {clubInfo.federationTitle ||
                    'Filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP)'}
                </h2>
                <p className="text-sm text-zinc-300 leading-relaxed max-w-3xl whitespace-pre-line">
                  {clubInfo.federationDescription ||
                    'O Oficina do Rock Motoclube é oficialmente filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP), reafirmando o compromisso com a irmandade motociclística, a segurança na estrada e a representatividade do motociclismo paulista.'}
                </p>
                {clubInfo.federationWebsite && (
                  <a
                    href={normalizeOptionalUrl(clubInfo.federationWebsite)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold uppercase text-amber-400 hover:text-amber-300 pt-1"
                  >
                    <span>
                      {clubInfo.federationWebsiteLabel?.trim() || 'Acessar Portal da Federação'}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setFedBadgeDraft(clubInfo.federationBadgeLabel || '');
                  setFedTitleDraft(
                    clubInfo.federationTitle ||
                      'Filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP)'
                  );
                  setFedDescDraft(
                    clubInfo.federationDescription ||
                      'O Oficina do Rock Motoclube é oficialmente filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP), reafirmando o compromisso com a irmandade motociclística, a segurança na estrada e a representatividade do motociclismo paulista.'
                  );
                  setFedLogoDraft(clubInfo.federationLogoUrl || DEFAULT_FEDERATION_LOGO_URL);
                  setFedWebsiteDraft(clubInfo.federationWebsite || '');
                  setFedWebsiteLabelDraft(clubInfo.federationWebsiteLabel || '');
                  setFedRegCodeDraft(clubInfo.federationRegistrationCode || '');
                  setFedHiddenDraft(Boolean(clubInfo.federationHidden));
                  setAssetUploadError('');
                  setIsEditingFederation(true);
                }}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-400/40 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5 shrink-0 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar Filiação</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* Live Status Card: Sede Aberta + Photo Showcase */}
      <section
        className={`rounded-2xl border p-6 sm:p-8 space-y-5 transition-colors ${
          clubInfo.isHeadquartersOpen
            ? 'bg-emerald-950/20 border-emerald-500/40'
            : 'bg-[#121216] border-zinc-800/90'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${
                clubInfo.isHeadquartersOpen
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-400'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-400'
              }`}
            >
              {clubInfo.isHeadquartersOpen ? (
                <DoorOpen className="w-6 h-6" />
              ) : (
                <DoorClosed className="w-6 h-6" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                    clubInfo.isHeadquartersOpen
                      ? 'bg-emerald-500 text-black'
                      : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                  }`}
                >
                  {clubInfo.isHeadquartersOpen ? 'SEDE ABERTA AGORA' : 'SEDE FECHADA NO MOMENTO'}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Informativo da Sede · {clubInfo.city}
                </span>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
                {clubInfo.headquartersOpenText ||
                  'Consulte nossos horários de funcionamento e encontros semanais na sede oficial.'}
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setSedeOpenDraft(Boolean(clubInfo.isHeadquartersOpen));
                setSedeTextDraft(clubInfo.headquartersOpenText || '');
                setSedePhotosDraft(clubInfo.headquartersOpenPhotos || []);
                setAssetUploadError('');
                setIsEditingSedeOpen(true);
              }}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-400/40 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5 shrink-0 self-start sm:self-center transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Editar Sede Aberta & Fotos</span>
            </button>
          )}
        </div>

        {sedePhotos.length > 0 && (
          <div className="space-y-2 pt-1">
            {sedePhotos.length > 4 && (
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Role para o lado para ver todas as {sedePhotos.length} fotos</span>
              </div>
            )}
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scroll-smooth">
              {sedePhotos.map((photoUrl, idx) => (
                <button
                  key={`${idx}-${photoUrl.slice(0, 24)}`}
                  type="button"
                  onClick={() => setPreviewHeadquartersPhoto(photoUrl)}
                  className="group relative shrink-0 w-[68vw] sm:w-[220px] md:w-[240px] aspect-[4/3] rounded-xl overflow-hidden border border-zinc-800 hover:border-amber-400/60 bg-black transition-all snap-start"
                >
                  <img
                    src={photoUrl}
                    alt={`Foto da Sede ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Public Announcements & Upcoming Agenda Preview (Safe Read-Only for Visitors & Members) */}
      {(publicAnnouncements.length > 0 || events.some((ev) => !ev.isExclusiveBoard && isEventUpcomingOrOngoing(ev))) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {publicAnnouncements.length > 0 && (
            <div className="bg-[#121216] border border-amber-400/35 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400 block">
                    Quadro Oficial
                  </span>
                  <h2 className="font-rock text-xl font-bold uppercase text-white">
                    Avisos & Comunicados Públicos
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30 text-[10px] font-bold uppercase">
                  Público
                </span>
              </div>
              <div className="space-y-3">
                {publicAnnouncements.slice(0, 4).map((ann) => (
                  <div
                    key={ann.id}
                    className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-white">{ann.title}</h3>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(ann.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">
                      {ann.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const upcomingPublicEvents = events
              .filter((ev) => !ev.isExclusiveBoard && isEventUpcomingOrOngoing(ev))
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 4);
            if (upcomingPublicEvents.length === 0) return null;
            return (
              <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400 block">
                      Agenda Aberta
                    </span>
                    <h2 className="font-rock text-xl font-bold uppercase text-white">
                      Próximos Eventos & Passeios
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateToTab('events')}
                    className="text-xs font-bold uppercase text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    <span>Ver Agenda</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-3">
                  {upcomingPublicEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <span className="text-[11px] font-bold text-amber-400 uppercase block">
                          {formatEventPeriodLabel(ev)} · {ev.time}h
                        </span>
                        <h3 className="text-sm font-bold text-white truncate">{ev.title}</h3>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {ev.meetingPoint} → {ev.destination}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* Clickable CTA Button/Card -> SUPPORT XV (All fields editable by Admin) */}
      <section className="relative">
        <button
          type="button"
          onClick={() => onNavigateToTab('supporters')}
          className="w-full text-left group relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#15151a] to-amber-500/10 border border-amber-400/40 hover:border-amber-300 p-6 sm:p-8 transition-all shadow-xl hover:shadow-amber-500/10"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/50 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
                <HeartHandshake className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400 block">
                  {clubInfo.supportersButtonSubtitle || 'Empresas & Parceiros do Clube'}
                </span>
                <h2 className="font-rock text-2xl sm:text-3xl font-bold uppercase text-white tracking-wide group-hover:text-amber-300 transition-colors">
                  {clubInfo.supportersButtonTitle &&
                  clubInfo.supportersButtonTitle.trim().toLowerCase() !== 'apoiadores do motoclube'
                    ? clubInfo.supportersButtonTitle
                    : 'SUPPORT XV'}
                </h2>
                <p className="text-sm text-zinc-300 max-w-2xl leading-relaxed">
                  {clubInfo.supportersButtonDescription ||
                    'Conheça a história, as empresas e as pessoas que caminham com o Oficina do Rock Motoclube no SUPPORT XV.'}
                </p>
              </div>
            </div>

            <span className="px-5 py-3 rounded-xl bg-amber-400 group-hover:bg-amber-300 text-black font-rock text-sm font-bold uppercase tracking-wider flex items-center gap-2 shrink-0 shadow-lg shadow-amber-400/20 transition-colors">
              <span>
                {clubInfo.supportersButtonCta &&
                clubInfo.supportersButtonCta.trim().toLowerCase() !== 'conhecer apoiadores'
                  ? clubInfo.supportersButtonCta
                  : 'Conhecer SUPPORT XV'}
              </span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </div>
        </button>

        {isAdmin && !isEditing && (
          <button
            type="button"
            onClick={() => {
              setFormData(clubInfo);
              setAssetUploadError('');
              setIsEditing(true);
            }}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-amber-400 hover:text-amber-300"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Editar textos do botão SUPPORT XV e campos gerais</span>
          </button>
        )}
      </section>

      {/* Admin Edit Modal / Banner Form */}
      {isEditing && isAdmin && (
        <section className="bg-zinc-900 border border-amber-400/50 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-amber-400" />
              <h2 className="font-rock text-xl uppercase font-bold text-white">
                Editar Dados do Motoclube (Administrador Geral)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-zinc-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {assetUploadError && (
              <p className="text-xs text-red-400 font-semibold">{assetUploadError}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Nome Oficial do Clube
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Cidade / Estância Oficial
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Ano de Fundação
                </label>
                <input
                  type="number"
                  value={formData.foundationYear}
                  onChange={(e) =>
                    setFormData({ ...formData, foundationYear: Number(e.target.value) || 2008 })
                  }
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Endereço da Sede Oficial
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Link Google Maps da Sede
                </label>
                <input
                  type="text"
                  value={formData.googleMapsUrl}
                  onChange={(e) => setFormData({ ...formData, googleMapsUrl: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Chave Pix Oficial (CNPJ)
                </label>
                <input
                  type="text"
                  value={formData.pixCnpj}
                  onChange={(e) => setFormData({ ...formData, pixCnpj: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  WhatsApp / Telefone de Contato
                </label>
                <input
                  type="text"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  E-mail Oficial
                </label>
                <input
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Instagram (URL)
                </label>
                <input
                  type="text"
                  value={formData.instagram}
                  onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Facebook (URL)
                </label>
                <input
                  type="text"
                  value={formData.facebook}
                  onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  YouTube (URL)
                </label>
                <input
                  type="text"
                  placeholder="https://youtube.com/@oficinadorockmc"
                  value={formData.youtube}
                  onChange={(e) => setFormData({ ...formData, youtube: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-300 uppercase mb-1">
                  Nome do Botão "Próximos Passeios" (Tela Principal)
                </label>
                <input
                  type="text"
                  maxLength={60}
                  placeholder="Próximos Passeios"
                  value={formData.eventsButtonLabel ?? ''}
                  onChange={(e) => setFormData({ ...formData, eventsButtonLabel: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Brasões (Top Left & Top Right) */}
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4">
              <h3 className="font-rock text-sm font-bold uppercase text-amber-400">
                Fotos dos Brasões (Superior Esquerdo & Superior Direito)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <label className="block font-bold text-zinc-300 uppercase">
                    Brasão Superior Esquerdo (Topo)
                  </label>
                  <div className="flex items-center gap-3">
                    <img
                      src={formData.leftCrestUrl || DEFAULT_CREST_URL}
                      alt="Brasão Esquerdo"
                      className="w-12 h-12 object-contain border-0"
                    />
                    <PhotoSourcePicker
                      multiple={false}
                      disabled={isUploadingAsset}
                      title="Brasão Superior Esquerdo"
                      onSelectFiles={(files) => handleUploadCrestFiles(files, 'left')}
                    >
                      <div className="cursor-pointer px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase rounded-lg flex items-center gap-1.5">
                        {isUploadingAsset ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>{isUploadingAsset ? 'Enviando...' : 'Upload Foto'}</span>
                      </div>
                    </PhotoSourcePicker>
                  </div>
                  <input
                    type="text"
                    value={formData.leftCrestUrl || ''}
                    onChange={(e) => setFormData({ ...formData, leftCrestUrl: e.target.value })}
                    placeholder={DEFAULT_CREST_URL}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block font-bold text-zinc-300 uppercase">
                    Brasão Superior Direito (Destaque)
                  </label>
                  <div className="flex items-center gap-3">
                    <img
                      src={formData.rightCrestUrl || DEFAULT_CREST_URL}
                      alt="Brasão Direito"
                      className="w-12 h-12 object-contain border-0"
                    />
                    <PhotoSourcePicker
                      multiple={false}
                      disabled={isUploadingAsset}
                      title="Brasão Superior Direito"
                      onSelectFiles={(files) => handleUploadCrestFiles(files, 'right')}
                    >
                      <div className="cursor-pointer px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase rounded-lg flex items-center gap-1.5">
                        {isUploadingAsset ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>{isUploadingAsset ? 'Enviando...' : 'Upload Foto'}</span>
                      </div>
                    </PhotoSourcePicker>
                  </div>
                  <input
                    type="text"
                    value={formData.rightCrestUrl || ''}
                    onChange={(e) => setFormData({ ...formData, rightCrestUrl: e.target.value })}
                    placeholder={DEFAULT_CREST_URL}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Sede Aberta Config */}
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-rock text-sm font-bold uppercase text-amber-400">
                  Informação de Sede Aberta & Fotos (Página Inicial)
                </h3>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.isHeadquartersOpen)}
                    onChange={(e) =>
                      setFormData({ ...formData, isHeadquartersOpen: e.target.checked })
                    }
                    className="w-4 h-4 accent-emerald-500"
                  />
                  <span className="font-bold uppercase text-emerald-300">
                    Sede Aberta Agora
                  </span>
                </label>
              </div>
              <textarea
                rows={3}
                value={formData.headquartersOpenText || ''}
                onChange={(e) =>
                  setFormData({ ...formData, headquartersOpenText: e.target.value })
                }
                placeholder="Ex: Sede aberta às sextas e sábados a partir das 19h com som ao vivo..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold uppercase text-zinc-300">
                    Fotos da Sede ({(formData.headquartersOpenPhotos || []).length}/20)
                  </span>
                  {(formData.headquartersOpenPhotos || []).length < 20 && (
                    <PhotoSourcePicker
                      multiple={true}
                      disabled={isUploadingAsset}
                      title="Adicionar Fotos na Aba Principal"
                      subtitle="Escolha da Galeria Nativa ou Google Fotos (pode selecionar várias fotos)."
                      onSelectFiles={(files) => handleUploadSedeFiles(files, 'fullForm')}
                    >
                      <div className="cursor-pointer px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase rounded-lg flex items-center gap-1.5">
                        {isUploadingAsset ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>{isUploadingAsset ? 'Enviando...' : 'Adicionar Fotos (Em Lote)'}</span>
                      </div>
                    </PhotoSourcePicker>
                  )}
                </div>
                {(formData.headquartersOpenPhotos || []).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(formData.headquartersOpenPhotos || []).map((url, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-[4/3] rounded-lg overflow-hidden border border-zinc-700 bg-black"
                      >
                        <img src={url} alt={`Sede ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              headquartersOpenPhotos: (prev.headquartersOpenPhotos || []).filter(
                                (_, i) => i !== idx
                              ),
                            }))
                          }
                          className="absolute top-1 right-1 p-1 rounded bg-red-600 text-white hover:bg-red-500"
                          title="Remover foto"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Federation Affiliation Editable Fields inside Full Admin Form */}
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-rock text-sm font-bold uppercase text-amber-400">
                  Filiação à Federação dos Motoclubes (Página Principal)
                </h3>
                <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-200 font-semibold">
                  <input
                    type="checkbox"
                    checked={!formData.federationHidden}
                    onChange={(e) =>
                      setFormData({ ...formData, federationHidden: !e.target.checked })
                    }
                    className="w-4 h-4 accent-amber-400 rounded"
                  />
                  <span>Exibir na página principal</span>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Selo / Rótulo da Filiação
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={formData.federationBadgeLabel ?? ''}
                    onChange={(e) =>
                      setFormData({ ...formData, federationBadgeLabel: e.target.value })
                    }
                    placeholder="Opcional"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Registro / Matrícula (Opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={formData.federationRegistrationCode ?? ''}
                    onChange={(e) =>
                      setFormData({ ...formData, federationRegistrationCode: e.target.value })
                    }
                    placeholder="Ex: Registro FMC-SP Nº ..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Título da Filiação
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={formData.federationTitle ?? ''}
                    onChange={(e) =>
                      setFormData({ ...formData, federationTitle: e.target.value })
                    }
                    placeholder="Filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP)"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Texto Informativo da Filiação
                </label>
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={formData.federationDescription ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, federationDescription: e.target.value })
                  }
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                <div className="space-y-2">
                  <label className="block font-bold text-zinc-300 uppercase">
                    Logotipo da Federação
                  </label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <img
                      src={formData.federationLogoUrl || DEFAULT_FEDERATION_LOGO_URL}
                      alt="Logotipo Federação"
                      className="w-12 h-12 object-contain border-0 rounded-full"
                    />
                    <PhotoSourcePicker
                      multiple={false}
                      disabled={isUploadingAsset}
                      title="Logotipo da Federação"
                      onSelectFiles={(files) => handleUploadCrestFiles(files, 'federationForm')}
                    >
                      <div className="cursor-pointer px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase rounded-lg flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Logo</span>
                      </div>
                    </PhotoSourcePicker>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, federationLogoUrl: DEFAULT_FEDERATION_LOGO_URL })
                      }
                      className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg font-bold uppercase flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Padrão</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formData.federationLogoUrl ?? ''}
                    onChange={(e) =>
                      setFormData({ ...formData, federationLogoUrl: e.target.value })
                    }
                    placeholder={DEFAULT_FEDERATION_LOGO_URL}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block font-bold text-zinc-300 uppercase mb-1">
                      Site / Link Oficial (Opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={500}
                      value={formData.federationWebsite ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, federationWebsite: e.target.value })
                      }
                      placeholder="https://..."
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-zinc-300 uppercase mb-1">
                      Texto do Botão do Portal (Opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={formData.federationWebsiteLabel ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, federationWebsiteLabel: e.target.value })
                      }
                      placeholder="Acessar Portal da Federação"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SUPPORT XV CTA Button Editable Fields */}
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 text-xs">
              <h3 className="font-rock text-sm font-bold uppercase text-amber-400">
                Botão & Aba SUPPORT XV (Campos Editáveis)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Subtítulo do Botão
                  </label>
                  <input
                    type="text"
                    value={formData.supportersButtonSubtitle || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, supportersButtonSubtitle: e.target.value })
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Título do Botão
                  </label>
                  <input
                    type="text"
                    value={formData.supportersButtonTitle || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, supportersButtonTitle: e.target.value })
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Texto do Botão de Ação (CTA)
                  </label>
                  <input
                    type="text"
                    value={formData.supportersButtonCta || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, supportersButtonCta: e.target.value })
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Descrição do Botão
                  </label>
                  <input
                    type="text"
                    value={formData.supportersButtonDescription || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, supportersButtonDescription: e.target.value })
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Breve Histórico da Aba SUPPORT XV
                </label>
                <textarea
                  rows={3}
                  value={formData.supportersHistoryText || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, supportersHistoryText: e.target.value })
                  }
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-sm text-white"
                />
              </div>
            </div>

            {/* Editable Access Request Message */}
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 text-xs">
              <label className="block font-bold text-amber-400 uppercase">
                Mensagem de Solicitação de Acesso (Portal Google)
              </label>
              <textarea
                rows={3}
                value={formData.accessRequestMessage || ''}
                onChange={(e) =>
                  setFormData({ ...formData, accessRequestMessage: e.target.value })
                }
                placeholder="Mensagem exibida ao visitante quando solicitar acesso ao aplicativo com Conta Google..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                Texto de História do Motoclube
              </label>
              <textarea
                rows={5}
                value={formData.historyText}
                onChange={(e) => setFormData({ ...formData, historyText: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                Código de Honra da Estrada e do Colete (Regras & Estatuto)
              </label>
              <textarea
                rows={6}
                value={formData.rulesText}
                onChange={(e) => setFormData({ ...formData, rulesText: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm font-mono text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="p-3 bg-zinc-950 border border-amber-400/30 rounded-xl">
              <label className="flex items-center gap-2.5 text-xs font-semibold text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyAppUpdateOnSave}
                  onChange={(e) => setNotifyAppUpdateOnSave(e.target.checked)}
                  className="w-4 h-4 accent-amber-400 rounded"
                />
                <span>
                  Enviar aviso de "Atualização Disponível no App" para todos os usuários ao salvar
                </span>
              </label>
            </div>

            {assetUploadError && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-xs text-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{assetUploadError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isSavingClubInfo}
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold uppercase hover:bg-zinc-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingClubInfo}
                className="px-5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase flex items-center gap-1.5 disabled:opacity-60"
              >
                {isSavingClubInfo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{isSavingClubInfo ? 'Salvando na nuvem...' : 'Salvar Alterações'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Quick Admin Modal: Top-Right Crest */}
      {isEditingRightCrest && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-rock text-lg font-bold uppercase text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                <span>Editar Brasão Superior Direito</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditingRightCrest(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickRightCrest} className="space-y-4 text-xs">
              <div className="p-4 flex justify-center">
                <img
                  src={rightCrestInput || DEFAULT_CREST_URL}
                  alt="Prévia Brasão Direito"
                  referrerPolicy="no-referrer"
                  className="h-32 w-auto object-contain border-0"
                />
              </div>

              <PhotoSourcePicker
                multiple={false}
                disabled={isUploadingAsset}
                title="Enviar Foto do Brasão Superior Direito"
                onSelectFiles={(files) => handleUploadCrestFiles(files, 'quickRight')}
                className="w-full"
              >
                <div className="cursor-pointer w-full py-2.5 px-3 bg-zinc-950 hover:bg-zinc-900 border border-dashed border-amber-400/50 rounded-lg text-xs font-bold text-amber-400 flex items-center justify-center gap-2">
                  {isUploadingAsset ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>{isUploadingAsset ? 'Otimizando...' : 'Enviar Foto (Galeria / Google Fotos)'}</span>
                </div>
              </PhotoSourcePicker>

              {assetUploadError && (
                <p className="text-[11px] text-red-400 font-semibold">{assetUploadError}</p>
              )}

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Ou URL da Imagem
                </label>
                <input
                  type="text"
                  value={rightCrestInput}
                  onChange={(e) => setRightCrestInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRightCrestInput(DEFAULT_CREST_URL)}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg text-[11px] font-bold uppercase flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Padrão</span>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingRightCrest(false)}
                    className="px-3.5 py-2 bg-zinc-800 text-zinc-300 rounded-lg font-bold uppercase"
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

      {/* Quick Admin Modal: Federation Affiliation (FMC-SP) */}
      {isEditingFederation && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg p-6 space-y-4 my-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-rock text-lg font-bold uppercase text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-400" />
                <span>Editar Filiação à Federação (Admin)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditingFederation(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickFederation} className="space-y-4 text-xs">
              <div className="flex flex-col items-center gap-3 p-3">
                <img
                  src={fedLogoDraft || DEFAULT_FEDERATION_LOGO_URL}
                  alt="Prévia Logotipo Federação"
                  referrerPolicy="no-referrer"
                  className="w-24 h-24 object-contain border-0 rounded-full"
                />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <PhotoSourcePicker
                    multiple={false}
                    disabled={isUploadingAsset}
                    title="Upload Logotipo da Federação"
                    onSelectFiles={(files) => handleUploadCrestFiles(files, 'federationQuick')}
                  >
                    <div className="cursor-pointer px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase rounded-lg flex items-center gap-1.5">
                      {isUploadingAsset ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{isUploadingAsset ? 'Otimizando...' : 'Trocar Logotipo'}</span>
                    </div>
                  </PhotoSourcePicker>
                  <button
                    type="button"
                    onClick={() => setFedLogoDraft(DEFAULT_FEDERATION_LOGO_URL)}
                    className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg font-bold uppercase flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Padrão FMC-SP</span>
                  </button>
                </div>
              </div>

              {assetUploadError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-xs text-red-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{assetUploadError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Selo / Subtítulo
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={fedBadgeDraft}
                    onChange={(e) => setFedBadgeDraft(e.target.value)}
                    placeholder="Opcional"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Registro / Matrícula (Opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={fedRegCodeDraft}
                    onChange={(e) => setFedRegCodeDraft(e.target.value)}
                    placeholder="Ex: Registro FMC-SP Nº ..."
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Título da Filiação
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={fedTitleDraft}
                  onChange={(e) => setFedTitleDraft(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Descrição / Informações da Filiação
                </label>
                <textarea
                  rows={4}
                  maxLength={5000}
                  value={fedDescDraft}
                  onChange={(e) => setFedDescDraft(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  URL do Logotipo (Opcional)
                </label>
                <input
                  type="text"
                  value={fedLogoDraft}
                  onChange={(e) => setFedLogoDraft(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Site Oficial da Federação (Opcional)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={500}
                      value={fedWebsiteDraft}
                      onChange={(e) => setFedWebsiteDraft(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    />
                    {fedWebsiteDraft && (
                      <button
                        type="button"
                        onClick={() => setFedWebsiteDraft('')}
                        className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white shrink-0"
                        title="Limpar link"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Texto do Botão do Portal (Opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={fedWebsiteLabelDraft}
                    onChange={(e) => setFedWebsiteLabelDraft(e.target.value)}
                    placeholder="Acessar Portal da Federação"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-zinc-200 font-semibold pt-1">
                <input
                  type="checkbox"
                  checked={!fedHiddenDraft}
                  onChange={(e) => setFedHiddenDraft(!e.target.checked)}
                  className="w-4 h-4 accent-amber-400 rounded"
                />
                <span>Exibir bloco de Filiação à Federação na página principal</span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setFedBadgeDraft('');
                    setFedTitleDraft('Filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP)');
                    setFedDescDraft(
                      'O Oficina do Rock Motoclube é oficialmente filiado à Federação dos Motoclubes do Estado de São Paulo (FMC-SP), reafirmando o compromisso com a irmandade motociclística, a segurança na estrada e a representatividade do motociclismo paulista.'
                    );
                    setFedLogoDraft(DEFAULT_FEDERATION_LOGO_URL);
                    setFedWebsiteLabelDraft('');
                    setFedRegCodeDraft('');
                    setFedHiddenDraft(false);
                  }}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg font-bold uppercase flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurar Texto Padrão</span>
                </button>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    disabled={isSavingClubInfo}
                    onClick={() => setIsEditingFederation(false)}
                    className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg font-bold uppercase disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingClubInfo}
                    className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black font-rock font-bold uppercase rounded-lg flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {isSavingClubInfo ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>{isSavingClubInfo ? 'Salvando...' : 'Salvar Filiação'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Admin Modal: Sede Aberta Status & Photos */}
      {isEditingSedeOpen && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg p-6 space-y-4 my-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-rock text-lg font-bold uppercase text-white flex items-center gap-2">
                <DoorOpen className="w-5 h-5 text-amber-400" />
                <span>Status de Sede Aberta & Fotos</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsEditingSedeOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickSedeOpen} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSedeOpenDraft(true)}
                  className={`p-3 rounded-xl border font-bold uppercase flex items-center justify-center gap-2 transition-colors ${
                    sedeOpenDraft
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <DoorOpen className="w-4 h-4" />
                  <span>Sede Aberta</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSedeOpenDraft(false)}
                  className={`p-3 rounded-xl border font-bold uppercase flex items-center justify-center gap-2 transition-colors ${
                    !sedeOpenDraft
                      ? 'bg-zinc-800 border-zinc-500 text-white'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <DoorClosed className="w-4 h-4" />
                  <span>Sede Fechada</span>
                </button>
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Texto Informativo de Funcionamento da Sede
                </label>
                <textarea
                  rows={3}
                  value={sedeTextDraft}
                  onChange={(e) => setSedeTextDraft(e.target.value)}
                  placeholder="Informe dias, horários, eventos na sede ou avisos para visitantes..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-zinc-300 uppercase">
                    Fotos da Sede ({sedePhotosDraft.length}/20)
                  </span>
                  {sedePhotosDraft.length < 20 && (
                    <PhotoSourcePicker
                      multiple={true}
                      disabled={isUploadingAsset}
                      title="Adicionar Fotos na Aba Principal"
                      subtitle="Escolha da Galeria Nativa ou Google Fotos (pode selecionar várias fotos)."
                      onSelectFiles={(files) => handleUploadSedeFiles(files, 'quickModal')}
                    >
                      <div className="cursor-pointer px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase rounded-lg flex items-center gap-1.5">
                        {isUploadingAsset ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>{isUploadingAsset ? 'Enviando...' : 'Upload Fotos (Em Lote)'}</span>
                      </div>
                    </PhotoSourcePicker>
                  )}
                </div>

                {assetUploadError && (
                  <p className="text-[11px] text-red-400 font-semibold">{assetUploadError}</p>
                )}

                {sedePhotosDraft.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {sedePhotosDraft.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-[4/3] rounded-lg overflow-hidden border border-zinc-800 bg-black"
                      >
                        <img src={url} alt={`Sede ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() =>
                            setSedePhotosDraft((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="absolute top-1 right-1 p-1 rounded bg-red-600 text-white hover:bg-red-500"
                          title="Remover"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEditingSedeOpen(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg font-bold uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black font-rock font-bold uppercase rounded-lg flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Sede</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Headquarters Photo Lightbox */}
      {previewHeadquartersPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setPreviewHeadquartersPhoto(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-[#121216] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewHeadquartersPhoto(null)}
              className="absolute top-3 right-3 z-20 p-2 bg-black/75 hover:bg-black text-white rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            {sedePhotos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const idx = sedePhotos.indexOf(previewHeadquartersPhoto);
                    const prevIdx = (idx - 1 + sedePhotos.length) % sedePhotos.length;
                    setPreviewHeadquartersPhoto(sedePhotos[prevIdx]);
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/70 hover:bg-amber-400 text-white hover:text-black border border-zinc-700 transition-colors"
                  aria-label="Foto anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const idx = sedePhotos.indexOf(previewHeadquartersPhoto);
                    const nextIdx = (idx + 1) % sedePhotos.length;
                    setPreviewHeadquartersPhoto(sedePhotos[nextIdx]);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-black/70 hover:bg-amber-400 text-white hover:text-black border border-zinc-700 transition-colors"
                  aria-label="Próxima foto"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            <img
              src={previewHeadquartersPhoto}
              alt="Foto da Sede"
              className="max-h-[75vh] w-full object-contain bg-black"
            />
          </div>
        </div>
      )}

      {/* History Narrative & Values */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 bg-[#121216] border border-zinc-800/90 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Music2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs uppercase font-bold text-amber-400 tracking-wider block">
                Nossa Trajetória
              </span>
              <h2 className="font-rock text-2xl uppercase font-bold text-white">
                História do {clubInfo.name}
              </h2>
            </div>
          </div>

          <div className="text-zinc-300 text-sm leading-relaxed space-y-4 whitespace-pre-line">
            {clubInfo.historyText}
          </div>

          <div className="pt-4 border-t border-zinc-800 grid grid-cols-3 gap-4 text-center">
            <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80">
              <span className="font-rock text-2xl font-bold text-amber-400 block">
                {clubInfo.foundationYear}
              </span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-400">Ano de Fundação</span>
            </div>
            <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80">
              <span className="font-rock text-2xl font-bold text-amber-400 block">
                +{Math.max(1, new Date().getFullYear() - clubInfo.foundationYear)} Anos
              </span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-400">De Estrada</span>
            </div>
            <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80">
              <span className="font-rock text-2xl font-bold text-amber-400 block">100%</span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-400">Irmandade</span>
            </div>
          </div>
        </div>

        {/* Location & Sede Card */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#121216] border border-zinc-800/90 rounded-2xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs uppercase font-bold text-amber-400 tracking-wider block">
                    Localização da Sede
                  </span>
                  <h3 className="font-rock text-xl uppercase font-bold text-white">
                    Ponto de Encontro Oficial
                  </h3>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-2">
              <p className="text-sm font-semibold text-white flex items-start gap-2">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{clubInfo.address}</span>
              </p>
              <p className="text-xs text-zinc-400 pl-6">
                {clubInfo.city} · Encontros às terças, quintas e fins de semana.
              </p>
            </div>

            <div className="space-y-3">
              <a
                href={clubInfo.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-black font-rock text-sm font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md shadow-amber-400/10"
              >
                <Navigation className="w-4 h-4" />
                <span>Abrir Rota no Google Maps</span>
                <ExternalLink className="w-4 h-4 ml-1" />
              </a>

              <p className="text-[11px] text-zinc-500 text-center">
                Clique acima para traçar rota direta no seu GPS ou celular.
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <span className="text-xs uppercase font-bold text-zinc-400 tracking-wider block">
                Canais Oficiais & Redes Sociais
              </span>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://wa.me/55${clubInfo.contactPhone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-2 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <Phone className="w-4 h-4 text-green-400" />
                  <span>WhatsApp Sede</span>
                </a>

                <a
                  href={`mailto:${clubInfo.contactEmail}`}
                  className="p-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-2 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <Mail className="w-4 h-4 text-amber-400" />
                  <span>E-mail Oficial</span>
                </a>

                <a
                  href={clubInfo.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-2 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <Instagram className="w-4 h-4 text-pink-400" />
                  <span>Instagram</span>
                </a>

                <a
                  href={clubInfo.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-2 border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <Facebook className="w-4 h-4 text-blue-400" />
                  <span>Facebook</span>
                </a>

                {clubInfo.youtube && (
                  <a
                    href={clubInfo.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="col-span-2 p-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-800 hover:border-zinc-700 transition-colors"
                  >
                    <Youtube className="w-4 h-4 text-red-500" />
                    <span>Canal no YouTube</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Board of Directors Showcase */}
      <section className="bg-[#121216] border border-zinc-800/90 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs uppercase font-bold text-amber-400 tracking-wider block">
                Hierarquia & Liderança
              </span>
              <h2 className="font-rock text-2xl uppercase font-bold text-white">
                Mesa Diretora do Motoclube
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToTab('board')}
            className="text-xs font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300 flex items-center gap-1"
          >
            <span>Ver Painel da Diretoria</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-sm text-zinc-400 max-w-3xl">
          Composição oficial da mesa diretora: Presidente, Vice-Presidente, Diretor Geral, Diretor Financeiro e
          Diretores de Disciplina responsáveis pela honra do brasão, organização dos comboios e respeito mútuo.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {(() => {
            const isAuthenticatedActiveMember = Boolean(
              currentUser && currentUser.status === 'active'
            );
            const resolvedCards = resolveBoardComposition(boardRoles, users, {
              isAuthenticatedActiveMember,
            });

            if (resolvedCards.length === 0) {
              return (
                <div className="col-span-full bg-zinc-950/70 border border-zinc-800/90 rounded-xl p-6 text-center text-xs text-zinc-400">
                  Composição da mesa diretora indisponível no momento.
                </div>
              );
            }

            return resolvedCards.map(({ role, displayName, avatarUrl, motorcycle, isVacant }) => (
              <div
                key={role.id}
                className="bg-zinc-950/70 border border-zinc-800/90 rounded-xl p-4 flex flex-col justify-between hover:border-amber-400/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {!isVacant && avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full object-cover border border-amber-400/40 shrink-0"
                    />
                  ) : (
                    <div
                      className={`w-12 h-12 rounded-full bg-zinc-900 border flex items-center justify-center shrink-0 ${
                        isVacant
                          ? 'border-zinc-700 text-zinc-500'
                          : 'border-amber-400/40 text-amber-400'
                      }`}
                    >
                      <UserIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block leading-tight">
                      {role.title}
                    </span>
                    <span
                      className={`text-sm font-semibold block mt-0.5 truncate ${
                        isVacant ? 'text-zinc-400 italic' : 'text-white'
                      }`}
                    >
                      {isVacant ? 'Cargo vago' : displayName}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-zinc-900 text-xs text-zinc-400 flex items-center justify-between gap-2">
                  <span>Moto:</span>
                  <span
                    className={`font-medium truncate max-w-[140px] ${
                      isVacant ? 'text-zinc-500 italic' : 'text-zinc-200'
                    }`}
                  >
                    {isVacant ? 'Sem titular' : motorcycle || 'Não informada'}
                  </span>
                </div>
              </div>
            ));
          })()}
        </div>
      </section>

      {/* Code of Conduct & Rules */}
      <section className="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2 text-amber-400">
          <Shield className="w-5 h-5" />
          <h3 className="font-rock text-lg uppercase font-bold text-white tracking-wider">
            Código de Honra da Estrada e do Colete
          </h3>
        </div>
        <div className="text-zinc-300 leading-relaxed whitespace-pre-line bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/60 font-mono text-xs">
          {clubInfo.rulesText}
        </div>
      </section>
    </div>
  );
}
