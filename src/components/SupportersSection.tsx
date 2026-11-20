import { useState } from 'react';
import {
  HeartHandshake,
  Building2,
  User as UserIcon,
  Plus,
  Edit3,
  Trash2,
  MapPin,
  Phone,
  Globe,
  Upload,
  Image as ImageIcon,
  X,
  Save,
  ArrowLeft,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { ClubInfo, Supporter, User } from '../types';
import { StorageService, playSound } from '../services/storage';
import { compressImageFile } from '../services/imageUtils';
import { PhotoSourcePicker } from './PhotoSourcePicker';

interface SupportersSectionProps {
  supporters: Supporter[];
  clubInfo: ClubInfo;
  currentUser: User | null;
  onUpdateSupporters: (list: Supporter[]) => void;
  onUpdateClubInfo: (info: ClubInfo) => void;
  onNavigateBack?: () => void;
}

export default function SupportersSection({
  supporters,
  clubInfo,
  currentUser,
  onUpdateSupporters,
  onUpdateClubInfo,
  onNavigateBack,
}: SupportersSectionProps) {
  const [filterType, setFilterType] = useState<'all' | 'individual' | 'company'>('all');
  const [isEditingHistory, setIsEditingHistory] = useState(false);
  const [historyDraft, setHistoryDraft] = useState(clubInfo.supportersHistoryText || '');

  // Cover Photo Modal State
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [coverDraftUrl, setCoverDraftUrl] = useState(clubInfo.supportersCoverUrl || '');
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState('');

  // Supporter Add / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupporter, setEditingSupporter] = useState<Supporter | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'individual' | 'company'>('company');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [city, setCity] = useState('');
  const [contact, setContact] = useState('');
  const [website, setWebsite] = useState('');
  const [order, setOrder] = useState<number>(supporters.length + 1);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [cloudError, setCloudError] = useState('');

  const isAdmin = Boolean(
    currentUser &&
      currentUser.status === 'active' &&
      (currentUser.role === 'admin' ||
        currentUser.email?.toLowerCase().trim() === 'eliezerrmartins@gmail.com')
  );

  const sortedSupporters = [...supporters].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const filteredSupporters =
    filterType === 'all'
      ? sortedSupporters
      : sortedSupporters.filter((s) => s.type === filterType);

  const handleSaveHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || isSavingCloud) return;
    setCloudError('');
    setIsSavingCloud(true);
    const updated: ClubInfo = {
      ...clubInfo,
      supportersHistoryText: historyDraft.trim(),
    };
    try {
      await StorageService.saveClubInfoAndAwaitCloud(updated);
      onUpdateClubInfo(updated);
      setIsEditingHistory(false);
      playSound('success');
    } catch (err) {
      setCloudError(
        err instanceof Error
          ? err.message
          : 'Sincronização não concluída. Seus textos foram preservados.'
      );
      playSound('beep');
    } finally {
      setIsSavingCloud(false);
    }
  };

  const handleOpenCoverModal = () => {
    setCoverDraftUrl(clubInfo.supportersCoverUrl || '');
    setCoverError('');
    setCloudError('');
    setIsCoverModalOpen(true);
  };

  const handleCoverFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setCoverError('');
    setIsUploadingCover(true);
    try {
      const dataUrl = await compressImageFile(file, { maxDimension: 1400, maxChars: 220_000 });
      setCoverDraftUrl(dataUrl);
      playSound('success');
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Erro ao processar foto de capa.');
      playSound('beep');
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleSaveCover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || isSavingCloud) return;
    setCoverError('');
    setIsSavingCloud(true);
    const updated: ClubInfo = {
      ...clubInfo,
      supportersCoverUrl: coverDraftUrl.trim(),
    };
    try {
      await StorageService.saveClubInfoAndAwaitCloud(updated);
      onUpdateClubInfo(updated);
      setIsCoverModalOpen(false);
      playSound('success');
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Não foi possível salvar a capa na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingCloud(false);
    }
  };

  const handleRemoveCover = async () => {
    if (!isAdmin || isSavingCloud) return;
    setCoverError('');
    setIsSavingCloud(true);
    const updated: ClubInfo = {
      ...clubInfo,
      supportersCoverUrl: '',
    };
    try {
      await StorageService.saveClubInfoAndAwaitCloud(updated);
      onUpdateClubInfo(updated);
      setCoverDraftUrl('');
      setIsCoverModalOpen(false);
      playSound('click');
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Não foi possível remover a capa na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingCloud(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingSupporter(null);
    setName('');
    setType('company');
    setDescription('');
    setPhotoUrl('');
    setCity(clubInfo.city || 'Ibiúna - SP');
    setContact('');
    setWebsite('');
    setOrder(supporters.length + 1);
    setUploadError('');
    setModalOpen(true);
  };

  const handleOpenEditModal = (sup: Supporter) => {
    setEditingSupporter(sup);
    setName(sup.name);
    setType(sup.type);
    setDescription(sup.description);
    setPhotoUrl(sup.photoUrl);
    setCity(sup.city || '');
    setContact(sup.contact || '');
    setWebsite(sup.website || '');
    setOrder(sup.order ?? 0);
    setUploadError('');
    setModalOpen(true);
  };

  const handleSupporterFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadError('');
    setIsUploading(true);
    try {
      const dataUrl = await compressImageFile(file, { maxDimension: 900, maxChars: 220_000 });
      setPhotoUrl(dataUrl);
      playSound('success');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao processar foto.');
      playSound('beep');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveSupporter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !name.trim() || isSavingCloud) return;
    setUploadError('');
    setIsSavingCloud(true);

    const updated = editingSupporter
      ? supporters.map((s) =>
          s.id === editingSupporter.id
            ? {
                ...s,
                name: name.trim(),
                type,
                description: description.trim(),
                photoUrl: photoUrl.trim(),
                city: city.trim() || undefined,
                contact: contact.trim() || undefined,
                website: website.trim() || undefined,
                order: Number(order) || 0,
              }
            : s
        )
      : [
          ...supporters,
          {
            id: `supporter-${Date.now()}`,
            name: name.trim(),
            type,
            description: description.trim(),
            photoUrl: photoUrl.trim(),
            city: city.trim() || undefined,
            contact: contact.trim() || undefined,
            website: website.trim() || undefined,
            order: Number(order) || supporters.length + 1,
          },
        ];

    try {
      await StorageService.saveSupportersConfirmed(updated);
      onUpdateSupporters(updated);
      setModalOpen(false);
      setEditingSupporter(null);
      playSound('success');
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Sincronização não concluída. Os dados preenchidos foram preservados.'
      );
      playSound('beep');
    } finally {
      setIsSavingCloud(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId || !isAdmin || isSavingCloud) return;
    setCloudError('');
    setIsSavingCloud(true);
    const updated = supporters.filter((s) => s.id !== confirmDeleteId);
    try {
      await StorageService.saveSupportersConfirmed(updated);
      onUpdateSupporters(updated);
      setConfirmDeleteId(null);
      playSound('click');
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Falha ao sincronizar remoção na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingCloud(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Tab Cover Photo Banner */}
      {clubInfo.supportersCoverUrl && (
        <div className="relative w-full h-48 sm:h-64 md:h-72 rounded-2xl overflow-hidden border border-amber-400/40 bg-zinc-950 shadow-2xl">
          <img
            src={clubInfo.supportersCoverUrl}
            alt="Capa SUPPORT XV"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0e] via-black/30 to-transparent" />
          <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400 block">
                Oficina do Rock Motoclube · {clubInfo.city}
              </span>
              <h1 className="font-rock text-2xl sm:text-4xl font-bold uppercase text-white tracking-wider drop-shadow">
                SUPPORT XV
              </h1>
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenCoverModal}
              className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/80 hover:bg-amber-400 text-amber-400 hover:text-black border border-amber-400/50 text-[11px] font-bold uppercase flex items-center gap-1.5 transition-colors shadow-lg"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Alterar Capa</span>
            </button>
          )}
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            {onNavigateBack && (
              <button
                type="button"
                onClick={onNavigateBack}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-amber-400 border border-zinc-800 rounded-lg text-[11px] font-bold uppercase flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Início</span>
              </button>
            )}
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
              <HeartHandshake className="w-4 h-4" />
              <span>Parceiros & Amigos da Estrada</span>
            </span>
          </div>
          <h2 className="font-rock text-3xl font-bold uppercase text-white tracking-wide">
            SUPPORT XV
          </h2>
          <p className="text-xs text-zinc-400">
            Pessoas físicas e empresas parceiras do SUPPORT XV que fortalecem nossa irmandade e projetos sociais em {clubInfo.city}.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleOpenCoverModal}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-400/40 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
              <span>{clubInfo.supportersCoverUrl ? 'Editar Capa' : 'Foto de Capa'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setHistoryDraft(clubInfo.supportersHistoryText || '');
                setIsEditingHistory(true);
              }}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-400/40 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              <span>Editar Histórico</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar SUPPORT XV</span>
            </button>
          </div>
        )}
      </div>

      {cloudError && (
        <div className="p-3 bg-red-950/70 border border-red-700/70 rounded-xl text-xs text-red-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{cloudError}</span>
          </div>
          <button
            type="button"
            onClick={() => setCloudError('')}
            className="text-red-300 hover:text-white font-bold uppercase text-[10px]"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Brief History Card */}
      <section className="bg-gradient-to-br from-zinc-900/90 to-[#121216] border border-amber-400/30 rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] uppercase font-bold text-amber-400 tracking-wider block">
                Nossa Gratidão & Parceria
              </span>
              <h3 className="font-rock text-xl uppercase font-bold text-white">
                Histórico SUPPORT XV
              </h3>
            </div>
          </div>

          {isAdmin && !isEditingHistory && (
            <button
              type="button"
              onClick={() => {
                setHistoryDraft(clubInfo.supportersHistoryText || '');
                setIsEditingHistory(true);
              }}
              className="text-xs font-bold uppercase text-amber-400 hover:text-amber-300 flex items-center gap-1"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Editar Texto</span>
            </button>
          )}
        </div>

        {isEditingHistory && isAdmin ? (
          <form onSubmit={handleSaveHistory} className="space-y-3">
            <textarea
              rows={5}
              maxLength={5000}
              value={historyDraft}
              onChange={(e) => setHistoryDraft(e.target.value)}
              placeholder="Escreva o breve histórico dos apoiadores e parceiros do motoclube..."
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-amber-400"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditingHistory(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black rounded-lg text-xs font-bold uppercase font-rock flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Histórico</span>
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
            {clubInfo.supportersHistoryText ||
              'Pessoas físicas e empresas que caminham lado a lado com o Oficina do Rock Motoclube desde 2008.'}
          </p>
        )}
      </section>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-amber-400 text-black'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            Todos ({supporters.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('company')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'company'
                ? 'bg-amber-400 text-black'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Empresas ({supporters.filter((s) => s.type === 'company').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType('individual')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'individual'
                ? 'bg-amber-400 text-black'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Pessoas Físicas ({supporters.filter((s) => s.type === 'individual').length})</span>
          </button>
        </div>
      </div>

      {/* Supporters Grid */}
      {filteredSupporters.length === 0 ? (
        <div className="p-10 bg-[#121216] border border-zinc-800 rounded-2xl text-center space-y-2">
          <HeartHandshake className="w-10 h-10 text-zinc-600 mx-auto" />
          <p className="text-sm font-semibold text-zinc-300">
            Nenhum parceiro SUPPORT XV cadastrado neste filtro ainda.
          </p>
          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="mt-2 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black rounded-lg text-xs font-bold uppercase"
            >
              Cadastrar Primeiro SUPPORT XV
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSupporters.map((sup) => (
            <div
              key={sup.id}
              className="bg-[#121216] border border-zinc-800/90 hover:border-amber-400/50 rounded-2xl overflow-hidden flex flex-col justify-between transition-all shadow-lg"
            >
              <div>
                <div className="aspect-[16/10] w-full bg-zinc-950 relative overflow-hidden">
                  {sup.photoUrl ? (
                    <img
                      src={sup.photoUrl}
                      alt={sup.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700">
                      {sup.type === 'company' ? (
                        <Building2 className="w-14 h-14" />
                      ) : (
                        <UserIcon className="w-14 h-14" />
                      )}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

                  <div className="absolute top-3 left-3">
                    <span
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-1 shadow ${
                        sup.type === 'company'
                          ? 'bg-amber-400 text-black'
                          : 'bg-sky-500 text-black'
                      }`}
                    >
                      {sup.type === 'company' ? (
                        <>
                          <Building2 className="w-3 h-3" />
                          <span>Empresa Parceira</span>
                        </>
                      ) : (
                        <>
                          <UserIcon className="w-3 h-3" />
                          <span>Pessoa Física</span>
                        </>
                      )}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(sup)}
                        className="p-1.5 rounded-lg bg-black/75 hover:bg-amber-400 text-amber-400 hover:text-black border border-amber-400/40 transition-colors"
                        title="Editar apoiador"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(sup.id)}
                        className="p-1.5 rounded-lg bg-black/75 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/40 transition-colors"
                        title="Remover apoiador"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="absolute bottom-3 left-4 right-4">
                    <h4 className="font-rock text-lg font-bold uppercase text-white leading-tight truncate">
                      {sup.name}
                    </h4>
                    {sup.city && (
                      <span className="text-[11px] text-amber-300 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{sup.city}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                    {sup.description || 'Parceiro oficial SUPPORT XV do Oficina do Rock Motoclube.'}
                  </p>
                </div>
              </div>

              {(sup.contact || sup.website) && (
                <div className="px-5 py-3 bg-zinc-950/80 border-t border-zinc-800/80 flex items-center justify-between gap-2 flex-wrap text-[11px]">
                  {sup.contact && (
                    <span className="text-zinc-300 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{sup.contact}</span>
                    </span>
                  )}
                  {sup.website && (
                    <a
                      href={sup.website.startsWith('http') ? sup.website : `https://${sup.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:text-amber-300 font-bold uppercase flex items-center gap-1 ml-auto"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Visitar</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: Adicionar / Editar SUPPORT XV */}
      {modalOpen && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/50 rounded-2xl w-full max-w-lg p-6 space-y-4 my-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <HeartHandshake className="w-5 h-5 text-amber-400" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  {editingSupporter ? 'Editar SUPPORT XV' : 'Adicionar ao SUPPORT XV'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupporter} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1.5">
                  Categoria SUPPORT XV *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('company')}
                    className={`p-2.5 rounded-xl border font-bold uppercase flex items-center justify-center gap-2 transition-colors ${
                      type === 'company'
                        ? 'bg-amber-400 text-black border-amber-400'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Empresa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('individual')}
                    className={`p-2.5 rounded-xl border font-bold uppercase flex items-center justify-center gap-2 transition-colors ${
                      type === 'individual'
                        ? 'bg-sky-400 text-black border-sky-400'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    <UserIcon className="w-4 h-4" />
                    <span>Pessoa Física</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    {type === 'company' ? 'Nome da Empresa *' : 'Nome do Parceiro *'}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={150}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={type === 'company' ? 'Ex: Oficina Custom Garage' : 'Ex: Carlos "Estradeiro"'}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">Ordem</label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={order}
                    onChange={(e) => setOrder(Number(e.target.value) || 0)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">Cidade / Bairro</label>
                  <input
                    type="text"
                    maxLength={120}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ibiúna - SP"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    maxLength={120}
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="(15) 99999-9999"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Site / Instagram (Opcional)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://instagram.com/..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Breve Histórico / Descrição do Apoio *
                </label>
                <textarea
                  rows={3}
                  required
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Conte brevemente sobre este parceiro e sua contribuição ao motoclube..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-zinc-300 uppercase">
                  Foto / Logotipo SUPPORT XV
                </label>
                <div>
                  <PhotoSourcePicker
                    multiple={false}
                    disabled={isUploading}
                    title="Foto / Logotipo SUPPORT XV"
                    onSelectFiles={handleSupporterFiles}
                  >
                    <div className="w-full py-2 px-3 bg-zinc-950 hover:bg-zinc-900 border border-dashed border-amber-400/50 rounded-lg text-amber-300 font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer">
                      {isUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{isUploading ? 'Processando...' : 'Upload (Galeria / Google)'}</span>
                    </div>
                  </PhotoSourcePicker>
                </div>

                {uploadError && (
                  <p className="text-[11px] text-red-400 font-semibold">{uploadError}</p>
                )}

                <input
                  type="text"
                  placeholder="Ou cole a URL da imagem (https://...)"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />

                {photoUrl && (
                  <div className="rounded-xl overflow-hidden border border-zinc-800 h-28 bg-black">
                    <img
                      src={photoUrl}
                      alt="Prévia do apoiador"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-bold uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black rounded-lg font-bold uppercase font-rock"
                >
                  {editingSupporter ? 'Salvar Alterações' : 'Cadastrar SUPPORT XV'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cover Photo Upload Modal */}
      {isCoverModalOpen && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/50 rounded-2xl w-full max-w-lg p-6 space-y-4 my-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-amber-400" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  Foto de Capa da Aba SUPPORT XV
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCoverModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCover} className="space-y-4 text-xs">
              <div className="rounded-xl overflow-hidden border border-zinc-800 h-40 bg-zinc-950 flex items-center justify-center">
                {coverDraftUrl ? (
                  <img
                    src={coverDraftUrl}
                    alt="Prévia da Capa SUPPORT XV"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-zinc-500 text-xs">Nenhuma foto de capa selecionada</span>
                )}
              </div>

              <div>
                <PhotoSourcePicker
                  multiple={false}
                  disabled={isUploadingCover}
                  title="Foto de Capa da Aba SUPPORT XV"
                  onSelectFiles={handleCoverFiles}
                >
                  <div className="w-full py-2.5 px-3 bg-zinc-950 hover:bg-zinc-900 border border-dashed border-amber-400/50 rounded-lg text-amber-300 font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer">
                    {isUploadingCover ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span>{isUploadingCover ? 'Processando...' : 'Upload (Galeria / Google)'}</span>
                  </div>
                </PhotoSourcePicker>
              </div>

              {coverError && (
                <p className="text-[11px] text-red-400 font-semibold">{coverError}</p>
              )}

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Ou URL da Imagem de Capa
                </label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={coverDraftUrl}
                  onChange={(e) => setCoverDraftUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-800">
                {clubInfo.supportersCoverUrl ? (
                  <button
                    type="button"
                    onClick={handleRemoveCover}
                    className="px-3 py-2 bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800 rounded-lg font-bold uppercase flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover Capa</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCoverModalOpen(false)}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-bold uppercase"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black rounded-lg font-bold uppercase font-rock flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Capa</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121216] border border-red-500/50 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              <h4 className="font-rock text-base font-bold uppercase text-white">
                Remover do SUPPORT XV
              </h4>
            </div>
            <p className="text-xs text-zinc-300">
              Deseja remover este parceiro da lista oficial SUPPORT XV do motoclube?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold uppercase"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
