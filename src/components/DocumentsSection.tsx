import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Upload,
  Search,
  Download,
  Eye,
  Trash2,
  Edit3,
  X,
  Lock,
  ShieldAlert,
  MessageSquareText,
  FolderOpen,
  Calendar,
  User as UserIcon,
  Check,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Plus,
  Settings2,
  RefreshCw,
  History,
  HardDrive,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  ClubDocument,
  ClubDocumentCategory,
  ClubInfo,
  DEFAULT_DOCUMENT_CATEGORIES,
  DocumentCategoryConfig,
  DocumentCustomField,
  User,
  getMemberDisplayName,
} from '../types';
import { StorageService, playSound } from '../services/storage';
import { FirestoreSync } from '../services/firestoreSync';
import { IndexedDbCache, CachedDocumentRecord } from '../services/indexedDbCache';
import { processClubDocumentFile, dataUrlToBlobUrl } from '../services/imageUtils';
import { paginateList } from '../services/syncResilience';
import { PhotoSourcePicker } from './PhotoSourcePicker';
import PdfCanvasViewer from './PdfCanvasViewer';

interface DocumentsSectionProps {
  documents: ClubDocument[];
  currentUser: User | null;
  clubInfo: ClubInfo;
  onUpdateDocuments: (docs: ClubDocument[]) => void;
  onUpdateClubInfo?: (info: ClubInfo) => void;
  onOpenAuth: () => void;
}

const KNOWN_CATEGORY_BADGE_COLORS: Record<string, string> = {
  ata: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  estatuto_regimento: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
  financeiro_fiscal: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  eventos_viagens: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  carteirinhas_cnh: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  outros: 'bg-zinc-800 text-zinc-300 border-zinc-700',
};

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatBrDate(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function DocumentsSection({
  documents,
  currentUser,
  clubInfo,
  onUpdateDocuments,
  onUpdateClubInfo,
  onOpenAuth,
}: DocumentsSectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ClubDocumentCategory>('all');
  const [selectedType, setSelectedType] = useState<'all' | 'pdf' | 'image'>('all');
  const [pageCount, setPageCount] = useState<number>(1);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<ClubDocumentCategory>('ata');
  const [uploadDate, setUploadDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadCustomFields, setUploadCustomFields] = useState<DocumentCustomField[]>([]);
  const [pendingFile, setPendingFile] = useState<{
    fileType: 'pdf' | 'image';
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    dataUrl: string;
  } | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isUploadingToCloud, setIsUploadingToCloud] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');

  // Edit metadata & file modal state
  const [editingDoc, setEditingDoc] = useState<ClubDocument | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<ClubDocumentCategory>('outros');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFileName, setEditFileName] = useState('');
  const [editUploadedByName, setEditUploadedByName] = useState('');
  const [editCustomFields, setEditCustomFields] = useState<DocumentCustomField[]>([]);
  const [editReplacementFile, setEditReplacementFile] = useState<{
    fileType: 'pdf' | 'image';
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    dataUrl: string;
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editProgress, setEditProgress] = useState(0);
  const [editError, setEditError] = useState('');

  // Admin Categories & Custom Fields Management Modal
  const [isManagingSchema, setIsManagingSchema] = useState(false);
  const [draftCategories, setDraftCategories] = useState<DocumentCategoryConfig[]>([]);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [draftFieldLabels, setDraftFieldLabels] = useState<string[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');

  // Delete confirmation modal
  const [deletingDoc, setDeletingDoc] = useState<ClubDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Viewer modal
  const [viewingDoc, setViewingDoc] = useState<ClubDocument | null>(null);
  const [viewerResolvedUrl, setViewerResolvedUrl] = useState<string>('');
  const [viewerBlobUrl, setViewerBlobUrl] = useState<string>('');
  const [isLoadingViewer, setIsLoadingViewer] = useState(false);
  const [viewerError, setViewerError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [cachedDocsMap, setCachedDocsMap] = useState<Record<string, CachedDocumentRecord>>({});
  const [versionHistoryDoc, setVersionHistoryDoc] = useState<ClubDocument | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const viewerRequestIdRef = useRef(0);

  const isAdmin = Boolean(
    currentUser?.role === 'admin' ||
      currentUser?.email?.toLowerCase() === 'eliezerrmartins@gmail.com'
  );
  const isBoardOrAdmin = Boolean(
    currentUser &&
      currentUser.status === 'active' &&
      (isAdmin || currentUser.role === 'board')
  );
  const isApprovedMember = Boolean(currentUser && currentUser.status === 'active');

  const refreshCachedDocsMap = async () => {
    try {
      const records = await IndexedDbCache.listCachedDocuments('clubDocument');
      const nextMap: Record<string, CachedDocumentRecord> = {};
      for (const rec of records) {
        nextMap[rec.id] = rec;
      }
      setCachedDocsMap(nextMap);
    } catch {
      // Non-fatal
    }
  };

  useEffect(() => {
    void refreshCachedDocsMap();
  }, [documents.length]);

  const categoriesList: DocumentCategoryConfig[] = useMemo(() => {
    const base =
      clubInfo.documentCategories && clubInfo.documentCategories.length > 0
        ? clubInfo.documentCategories
        : DEFAULT_DOCUMENT_CATEGORIES;
    return base;
  }, [clubInfo.documentCategories]);

  const getCategoryLabel = (catId: string): string =>
    categoriesList.find((c) => c.id === catId)?.label || catId || 'Outros';

  const getCategoryBadgeColor = (catId: string): string =>
    KNOWN_CATEGORY_BADGE_COLORS[catId] || 'bg-amber-400/15 text-amber-300 border-amber-400/30';

  // Cleanup blob URL when viewer closes or changes
  useEffect(() => {
    return () => {
      if (viewerBlobUrl && viewerBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(viewerBlobUrl);
      }
    };
  }, [viewerBlobUrl]);

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(''), 4000);
  };

  const filteredDocuments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return documents.filter((doc) => {
      if (selectedCategory !== 'all' && doc.category !== selectedCategory) return false;
      if (selectedType !== 'all' && doc.fileType !== selectedType) return false;
      if (!q) return true;
      const customMatch = (doc.customFields || []).some(
        (cf) =>
          cf.key.toLowerCase().includes(q) || cf.value.toLowerCase().includes(q)
      );
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.fileName.toLowerCase().includes(q) ||
        (doc.description || '').toLowerCase().includes(q) ||
        doc.uploadedByName.toLowerCase().includes(q) ||
        getCategoryLabel(doc.category).toLowerCase().includes(q) ||
        customMatch
      );
    });
  }, [documents, searchTerm, selectedCategory, selectedType, categoriesList]);

  useEffect(() => {
    setPageCount(1);
  }, [searchTerm, selectedCategory, selectedType]);

  const {
    visibleItems: pagedDocuments,
    hasMore: hasMoreDocuments,
    remainingCount: remainingDocumentsCount,
  } = paginateList(filteredDocuments, 12, pageCount);

  const pdfCount = documents.filter((d) => d.fileType === 'pdf').length;
  const imageCount = documents.filter((d) => d.fileType === 'image').length;

  // Gate 1: Unauthenticated visitor
  if (!currentUser) {
    return (
      <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 my-8 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mx-auto text-amber-400">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="font-rock text-3xl font-bold uppercase text-white">
            Documentos — Área Restrita
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto">
            O acervo de documentos em PDF e fotos oficiais é exclusivo para integrantes ativos com login aprovado.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenAuth}
          className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-md shadow-amber-400/20"
        >
          Fazer Login de Integrante
        </button>
      </div>
    );
  }

  // Gate 2: Logged in but pending approval
  if (!isApprovedMember) {
    return (
      <div className="bg-[#121216] border border-yellow-500/40 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 my-8 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-yellow-400/10 border border-yellow-400/30 flex items-center justify-center mx-auto text-yellow-400">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-3">
          <h2 className="font-rock text-3xl font-bold uppercase text-white">
            Acesso Pendente de Homologação
          </h2>
          <p className="text-zinc-300 text-sm leading-relaxed max-w-md mx-auto">
            Olá, <strong className="text-white">{getMemberDisplayName(currentUser)}</strong>. Assim que a Mesa Diretora aprovar seu cadastro, você terá acesso aos documentos oficiais do clube.
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

  // Gate 3: Strictly restricted to Diretoria (Board & Admin)
  if (!isBoardOrAdmin) {
    return (
      <div className="bg-[#121216] border border-amber-400/30 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 my-8 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mx-auto text-amber-400">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="font-rock text-3xl font-bold uppercase text-white">
            Documentos — Área Restrita à Diretoria
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto">
            O acervo de documentos oficiais em PDF e arquivos administrativos é exclusivo para integrantes da Mesa Diretora e Administração Geral.
          </p>
        </div>
      </div>
    );
  }

  const handleOpenUploadModal = () => {
    setUploadTitle('');
    setUploadCategory(categoriesList[0]?.id || 'ata');
    setUploadDate(new Date().toISOString().split('T')[0]);
    setUploadDescription('');
    const presetLabels = clubInfo.documentCustomFieldLabels || [];
    setUploadCustomFields(presetLabels.map((k) => ({ key: k, value: '' })));
    setPendingFile(null);
    setUploadProgress(0);
    setUploadError('');
    setIsUploadOpen(true);
  };

  const processSelectedDocumentFile = async (file: File) => {
    setUploadError('');
    setIsProcessingFile(true);
    try {
      const processed = await processClubDocumentFile(file);
      setPendingFile(processed);
      if (!uploadTitle.trim()) {
        const strippedName = processed.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        setUploadTitle(strippedName);
      }
      playSound('success');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao processar arquivo.');
      playSound('beep');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processSelectedDocumentFile(file);
    e.target.value = '';
  };

  const handlePhotoFilesPick = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    await processSelectedDocumentFile(file);
  };

  const handleSubmitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingFile) {
      setUploadError('Selecione um arquivo PDF ou foto.');
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadError('Informe um título para identificar o documento.');
      return;
    }

    setUploadError('');
    setIsUploadingToCloud(true);
    setUploadProgress(0);
    try {
      const cleanedCustomFields = uploadCustomFields
        .map((cf) => ({ key: cf.key.trim(), value: cf.value.trim() }))
        .filter((cf) => cf.key.length > 0 && cf.value.length > 0);

      const newDoc: ClubDocument = {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: uploadTitle.trim(),
        description: uploadDescription.trim() || undefined,
        category: uploadCategory,
        fileType: pendingFile.fileType,
        fileName: pendingFile.fileName,
        mimeType: pendingFile.mimeType,
        fileSizeBytes: pendingFile.fileSizeBytes,
        fileDataUrl: pendingFile.dataUrl,
        customFields: cleanedCustomFields.length > 0 ? cleanedCustomFields : undefined,
        uploadedById: currentUser.id,
        uploadedByName: getMemberDisplayName(currentUser),
        date: uploadDate || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
      };

      const savedDoc = await FirestoreSync.uploadClubDocument(newDoc, (pct) => {
        setUploadProgress(pct);
      });
      await IndexedDbCache.cacheDocumentBinary({
        kind: 'clubDocument',
        id: savedDoc.id,
        title: savedDoc.title,
        mimeType: savedDoc.mimeType,
        version: savedDoc.createdAt || new Date().toISOString(),
        dataUrl: savedDoc.fileDataUrl || pendingFile.dataUrl,
        updatedByName: savedDoc.uploadedByName,
      });
      void refreshCachedDocsMap();
      onUpdateDocuments([savedDoc, ...documents.filter((d) => d.id !== savedDoc.id)]);
      setIsUploadOpen(false);
      playSound('success');
      showToast(
        pendingFile.fileType === 'pdf'
          ? 'PDF enviado e salvo no cache permanente do app!'
          : 'Foto enviada e salva no cache permanente do app!'
      );
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Erro ao salvar documento na nuvem. Verifique sua conexão.'
      );
      playSound('beep');
    } finally {
      setIsUploadingToCloud(false);
    }
  };

  const handleOpenViewer = async (docItem: ClubDocument) => {
    const reqId = ++viewerRequestIdRef.current;
    setViewingDoc(docItem);
    setViewerError('');
    setViewerResolvedUrl('');
    if (viewerBlobUrl && viewerBlobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(viewerBlobUrl);
      setViewerBlobUrl('');
    }
    setIsLoadingViewer(true);
    try {
      const dataUrl = await FirestoreSync.loadClubDocumentDataUrl(docItem);
      if (viewerRequestIdRef.current !== reqId) return;
      if (!dataUrl) {
        throw new Error('Conteúdo do documento não encontrado na nuvem.');
      }
      setViewerResolvedUrl(dataUrl);
      void refreshCachedDocsMap();
      try {
        const fallbackMime =
          docItem.mimeType ||
          (docItem.fileType === 'pdf' ? 'application/pdf' : 'image/jpeg');
        const bUrl = dataUrlToBlobUrl(dataUrl, fallbackMime);
        if (viewerRequestIdRef.current === reqId && bUrl && bUrl !== dataUrl) {
          setViewerBlobUrl(bUrl);
        } else if (bUrl && bUrl.startsWith('blob:') && viewerRequestIdRef.current !== reqId) {
          URL.revokeObjectURL(bUrl);
        }
      } catch {
        // Fallback smoothly to dataUrl when blob conversion is unsupported
      }
    } catch (err) {
      if (viewerRequestIdRef.current !== reqId) return;
      setViewerError(err instanceof Error ? err.message : 'Erro ao abrir documento.');
    } finally {
      if (viewerRequestIdRef.current === reqId) {
        setIsLoadingViewer(false);
      }
    }
  };

  const handleCloseViewer = () => {
    viewerRequestIdRef.current += 1;
    setViewingDoc(null);
    setViewerResolvedUrl('');
    setViewerError('');
    if (viewerBlobUrl && viewerBlobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(viewerBlobUrl);
      setViewerBlobUrl('');
    }
  };

  const handleDownloadDocument = async (docItem: ClubDocument) => {
    setDownloadingId(docItem.id);
    try {
      const dataUrl = await FirestoreSync.loadClubDocumentDataUrl(docItem);
      if (!dataUrl) {
        showToast('Arquivo ainda não disponível para download.');
        return;
      }
      const fallbackMime =
        docItem.mimeType ||
        (docItem.fileType === 'pdf' ? 'application/pdf' : 'image/jpeg');
      let urlToDownload = dataUrl;
      try {
        urlToDownload = dataUrl.startsWith('data:')
          ? dataUrlToBlobUrl(dataUrl, fallbackMime)
          : dataUrl;
      } catch {
        urlToDownload = dataUrl;
      }
      const a = document.createElement('a');
      a.href = urlToDownload;
      a.download = docItem.fileName || `${docItem.title}.${docItem.fileType === 'pdf' ? 'pdf' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (urlToDownload.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(urlToDownload), 30_000);
      }
      playSound('success');
    } catch (err) {
      playSound('beep');
      showToast(err instanceof Error ? err.message : 'Erro ao baixar documento.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenEditModal = (docItem: ClubDocument) => {
    setEditingDoc(docItem);
    setEditTitle(docItem.title);
    setEditCategory(docItem.category);
    setEditDate(docItem.date);
    setEditDescription(docItem.description || '');
    setEditFileName(docItem.fileName || '');
    setEditUploadedByName(docItem.uploadedByName || '');
    const existingFields = docItem.customFields ? [...docItem.customFields] : [];
    const presetLabels = clubInfo.documentCustomFieldLabels || [];
    presetLabels.forEach((lbl) => {
      if (!existingFields.some((f) => f.key.toLowerCase() === lbl.toLowerCase())) {
        existingFields.push({ key: lbl, value: '' });
      }
    });
    setEditCustomFields(existingFields);
    setEditReplacementFile(null);
    setEditProgress(0);
    setEditError('');
  };

  const handleEditReplacementFile = async (file: File) => {
    setEditError('');
    setIsProcessingFile(true);
    try {
      const processed = await processClubDocumentFile(file);
      setEditReplacementFile(processed);
      setEditFileName(processed.fileName);
      playSound('success');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erro ao processar novo arquivo.');
      playSound('beep');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc || !editTitle.trim()) return;
    setIsSavingEdit(true);
    setEditError('');
    setEditProgress(0);
    try {
      const cleanedCustomFields = editCustomFields
        .map((cf) => ({ key: cf.key.trim(), value: cf.value.trim() }))
        .filter((cf) => cf.key.length > 0 && cf.value.length > 0);

      const replaceFile = Boolean(isAdmin && editReplacementFile);
      const updated: ClubDocument = {
        ...editingDoc,
        title: editTitle.trim(),
        category: editCategory,
        date: editDate || editingDoc.date,
        description: editDescription.trim() || undefined,
        fileName: isAdmin ? editFileName.trim() || editingDoc.fileName : editingDoc.fileName,
        uploadedByName: isAdmin
          ? editUploadedByName.trim() || editingDoc.uploadedByName
          : editingDoc.uploadedByName,
        customFields: cleanedCustomFields.length > 0 ? cleanedCustomFields : undefined,
        ...(replaceFile && editReplacementFile
          ? {
              fileType: editReplacementFile.fileType,
              fileName: editFileName.trim() || editReplacementFile.fileName,
              mimeType: editReplacementFile.mimeType,
              fileSizeBytes: editReplacementFile.fileSizeBytes,
              fileDataUrl: editReplacementFile.dataUrl,
            }
          : {}),
      };

      const saved = await FirestoreSync.updateClubDocument(updated, {
        replaceFile,
        onProgress: (pct) => setEditProgress(pct),
      });
      const finalDoc = saved || updated;
      if (replaceFile && finalDoc.fileDataUrl) {
        await IndexedDbCache.cacheDocumentBinary({
          kind: 'clubDocument',
          id: finalDoc.id,
          title: finalDoc.title,
          mimeType: finalDoc.mimeType,
          version: new Date().toISOString(),
          dataUrl: finalDoc.fileDataUrl,
          updatedByName: getMemberDisplayName(currentUser),
        });
      }
      void refreshCachedDocsMap();
      onUpdateDocuments(documents.map((d) => (d.id === finalDoc.id ? finalDoc : d)));
      setEditingDoc(null);
      playSound('success');
      showToast('Documento atualizado com sucesso!');
    } catch (err) {
      playSound('beep');
      setEditError(
        err instanceof Error ? err.message : 'Não foi possível atualizar o documento.'
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleRollbackDocumentVersion = async (docItem: ClubDocument, targetSha256: string) => {
    if (!isAdmin) return;
    setIsRollingBack(true);
    try {
      const rolled = await IndexedDbCache.rollbackCachedDocument('clubDocument', docItem.id, targetSha256);
      if (!rolled || !rolled.dataUrl) {
        showToast('Conteúdo binário desta versão não está mais disponível no cache local.');
        return;
      }
      const restoredDoc: ClubDocument = {
        ...docItem,
        fileDataUrl: rolled.dataUrl,
        fileSizeBytes: rolled.sizeBytes || docItem.fileSizeBytes,
      };
      const saved = await FirestoreSync.updateClubDocument(restoredDoc, { replaceFile: true });
      const finalDoc = saved || restoredDoc;
      onUpdateDocuments(documents.map((d) => (d.id === finalDoc.id ? finalDoc : d)));
      await refreshCachedDocsMap();
      setVersionHistoryDoc(null);
      playSound('success');
      showToast(`Versão SHA ${targetSha256.slice(0, 8)} restaurada com sucesso!`);
    } catch (err) {
      playSound('beep');
      showToast(err instanceof Error ? err.message : 'Erro ao restaurar versão do documento.');
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleOpenManageSchema = () => {
    setDraftCategories([...categoriesList]);
    setDraftFieldLabels([...(clubInfo.documentCustomFieldLabels || [])]);
    setNewCategoryLabel('');
    setNewFieldLabel('');
    setIsManagingSchema(true);
  };

  const handleSaveSchema = async () => {
    const cleanedCats = draftCategories
      .map((c) => ({ id: c.id.trim(), label: c.label.trim() }))
      .filter((c) => c.id && c.label);
    const finalCats = cleanedCats.length > 0 ? cleanedCats : DEFAULT_DOCUMENT_CATEGORIES;
    const cleanedFields = Array.from(
      new Set(draftFieldLabels.map((l) => l.trim()).filter(Boolean))
    );
    const updatedInfo: ClubInfo = {
      ...clubInfo,
      documentCategories: finalCats,
      documentCustomFieldLabels: cleanedFields,
    };
    try {
      await StorageService.saveClubInfoAndAwaitCloud(updatedInfo);
      onUpdateClubInfo?.(updatedInfo);
      setIsManagingSchema(false);
      playSound('success');
      showToast('Pastas e campos extras atualizados!');
    } catch (err) {
      playSound('beep');
      showToast(err instanceof Error ? err.message : 'Erro ao sincronizar pastas no servidor. Alterações preservadas.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingDoc) return;
    setIsDeleting(true);
    try {
      await FirestoreSync.deleteClubDocument(deletingDoc);
      onUpdateDocuments(documents.filter((d) => d.id !== deletingDoc.id));
      if (viewingDoc?.id === deletingDoc.id) {
        handleCloseViewer();
      }
      setDeletingDoc(null);
      playSound('beep');
      showToast('Documento removido do acervo.');
    } catch {
      playSound('beep');
      showToast('Erro ao excluir documento.');
    } finally {
      setIsDeleting(false);
    }
  };

  const canManageDoc = (docItem: ClubDocument) =>
    isBoardOrAdmin || docItem.uploadedById === currentUser.id;

  return (
    <div className="space-y-6 pb-20 xl:pb-6">
      {/* Feedback Toast */}
      {feedbackMsg && (
        <div className="fixed bottom-20 xl:bottom-6 right-4 z-50 bg-zinc-950 border border-amber-400 text-amber-300 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-semibold max-w-sm">
          <Check className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Header */}
      <section className="bg-gradient-to-br from-zinc-900 via-[#121216] to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-400">
            <FolderOpen className="w-4 h-4" />
            <span>Área Restrita à Diretoria</span>
          </div>
          <h1 className="font-rock text-3xl sm:text-4xl font-bold uppercase text-white tracking-wide">
            Documentos do Motoclube
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Arquivo seguro da Mesa Diretora para atas, documentos fiscais, comprovantes e fotos em PDF (até 25 MB, multi-páginas) ou imagem.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <div className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
              <span className="font-rock text-lg font-bold text-white block leading-none">
                {documents.length}
              </span>
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Total</span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
              <span className="font-rock text-lg font-bold text-red-400 block leading-none">
                {pdfCount}
              </span>
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">PDFs</span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
              <span className="font-rock text-lg font-bold text-amber-400 block leading-none">
                {imageCount}
              </span>
              <span className="text-[10px] text-zinc-400 uppercase font-semibold">Fotos</span>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenManageSchema}
              className="px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-400/40 font-rock text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              <span>Pastas e Campos</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenUploadModal}
            className="px-5 py-3 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs sm:text-sm font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Enviar PDF ou Foto</span>
          </button>
        </div>
      </section>

      {/* Filters & Search */}
      <section className="bg-[#121216] border border-zinc-800/90 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar documento por título, nome do arquivo, descrição ou autor..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800 shrink-0">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'pdf', label: 'Somente PDFs' },
              { id: 'image', label: 'Somente Fotos' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedType(item.id as 'all' | 'pdf' | 'image')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${
                  selectedType === item.id
                    ? 'bg-amber-400 text-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border transition-colors ${
              selectedCategory === 'all'
                ? 'bg-amber-400 text-black border-amber-400'
                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
            }`}
          >
            Todas as Pastas ({documents.length})
          </button>
          {categoriesList.map((cat) => {
            const count = documents.filter((d) => d.category === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-amber-400 text-black border-amber-400'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
      </section>

      {/* Documents List */}
      {filteredDocuments.length === 0 ? (
        <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-10 sm:p-14 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
            <FileText className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-rock text-xl font-bold uppercase text-white">
              {documents.length === 0
                ? 'Nenhum documento enviado ainda'
                : 'Nenhum documento encontrado com esses filtros'}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
              {documents.length === 0
                ? 'Clique em "Enviar PDF ou Foto" para armazenar atas, contratos, comprovantes, documentos ou fotos do motoclube.'
                : 'Tente limpar a busca ou selecionar outra pasta.'}
            </p>
          </div>
          {documents.length === 0 && (
            <button
              type="button"
              onClick={handleOpenUploadModal}
              className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase rounded-xl inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Enviar Primeiro Documento</span>
            </button>
          )}
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {pagedDocuments.map((docItem) => (
            <article
              key={docItem.id}
              className="bg-[#121216] border border-zinc-800/90 hover:border-amber-400/50 rounded-2xl overflow-hidden flex flex-col justify-between transition-all shadow-lg"
            >
              <div>
                {/* Preview Banner */}
                {docItem.fileType === 'image' ? (
                  <button
                    type="button"
                    onClick={() => handleOpenViewer(docItem)}
                    className="relative w-full aspect-[16/9] bg-black overflow-hidden group block text-left"
                    title="Clique para ampliar foto"
                  >
                    {docItem.fileDataUrl ? (
                      <img
                        src={docItem.fileDataUrl}
                        alt={docItem.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        <ImageIcon className="w-10 h-10" />
                      </div>
                    )}
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/80 border border-amber-400/50 text-amber-300 text-[10px] font-bold uppercase flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      <span>FOTO · {formatFileSize(docItem.fileSizeBytes)}</span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenViewer(docItem)}
                    className="w-full h-36 bg-gradient-to-br from-red-950/35 via-zinc-950 to-zinc-900 border-b border-zinc-800 p-4 flex items-center gap-4 text-left group hover:bg-red-950/45 transition-colors"
                    title="Clique para visualizar PDF"
                  >
                    <div className="w-14 h-16 rounded-xl bg-red-500/15 border border-red-500/40 flex flex-col items-center justify-center text-red-400 shrink-0 group-hover:scale-105 transition-transform">
                      <FileText className="w-7 h-7" />
                      <span className="text-[9px] font-extrabold uppercase mt-0.5">PDF</span>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-300 block">
                        Documento PDF · {formatFileSize(docItem.fileSizeBytes)}
                      </span>
                      <p className="text-xs font-mono text-zinc-300 truncate">
                        {docItem.fileName}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400">
                        <Eye className="w-3 h-3" />
                        <span>Clique para abrir PDF</span>
                      </span>
                    </div>
                  </button>
                )}

                {/* Details */}
                <div className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getCategoryBadgeColor(
                        docItem.category
                      )}`}
                    >
                      {getCategoryLabel(docItem.category)}
                    </span>
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-amber-400" />
                      {formatBrDate(docItem.date)}
                    </span>
                  </div>

                  <h3 className="font-rock text-lg font-bold text-white leading-snug">
                    {docItem.title}
                  </h3>

                  {docItem.description && (
                    <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                      {docItem.description}
                    </p>
                  )}

                  {docItem.customFields && docItem.customFields.length > 0 && (
                    <div className="pt-1 space-y-1">
                      {docItem.customFields.map((cf, idx) => (
                        <div
                          key={`${cf.key}-${idx}`}
                          className="text-[11px] bg-zinc-950/90 border border-zinc-800/80 rounded px-2 py-1 flex items-center justify-between gap-2"
                        >
                          <span className="text-amber-400/90 font-semibold truncate">{cf.key}:</span>
                          <span className="text-zinc-200 truncate">{cf.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 pt-1">
                    <UserIcon className="w-3 h-3 text-zinc-400" />
                    <span className="truncate">Enviado por {docItem.uploadedByName}</span>
                  </div>
                  {cachedDocsMap[docItem.id] && (
                    <div className="flex items-center justify-between gap-2 pt-1 text-[10px]">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-bold uppercase">
                        <HardDrive className="w-3 h-3" />
                        <span>Cache offline · SHA {cachedDocsMap[docItem.id].sha256.slice(0, 8)}</span>
                      </span>
                      {cachedDocsMap[docItem.id].history.length > 0 && (
                        <span className="text-zinc-400 font-semibold">
                          +{cachedDocsMap[docItem.id].history.length} rev.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Footer */}
              <div className="px-4 py-3 bg-zinc-950/70 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenViewer(docItem)}
                    className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-[11px] font-bold uppercase flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Abrir</span>
                  </button>

                  <button
                    type="button"
                    disabled={downloadingId === docItem.id}
                    onClick={() => handleDownloadDocument(docItem)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-[11px] font-bold uppercase flex items-center gap-1.5 transition-colors disabled:opacity-60"
                  >
                    {downloadingId === docItem.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span>Baixar</span>
                  </button>
                </div>

                {(canManageDoc(docItem) || (isAdmin && cachedDocsMap[docItem.id])) && (
                  <div className="flex items-center gap-1">
                    {isAdmin && cachedDocsMap[docItem.id] && (
                      <button
                        type="button"
                        onClick={() => setVersionHistoryDoc(docItem)}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-sky-300 border border-zinc-800"
                        title="Histórico de versões e rollback"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canManageDoc(docItem) && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(docItem)}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 border border-zinc-800"
                          title="Editar informações"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingDoc(docItem)}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 border border-zinc-800"
                          title="Excluir documento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        {hasMoreDocuments && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => {
                setPageCount((prev) => prev + 1);
                playSound('click');
              }}
              className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-400/40 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Carregar mais documentos (+{remainingDocumentsCount} restante{remainingDocumentsCount === 1 ? '' : 's'})
            </button>
          </div>
        )}
        </>
      )}

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg p-6 space-y-5 my-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-rock text-xl font-bold uppercase text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-amber-400" />
                <span>Enviar Documento (PDF ou Foto)</span>
              </h3>
              <button
                type="button"
                onClick={() => !isUploadingToCloud && setIsUploadOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitUpload} className="space-y-4 text-xs">
              {/* File Picker: PDF (multi-page up to 25 MB) OR Photo via Galeria/Google Fotos */}
              <div className="p-4 rounded-xl bg-zinc-950 border-2 border-dashed border-amber-400/40 space-y-3">
                {isProcessingFile ? (
                  <div className="flex flex-col items-center gap-2 text-amber-400 py-4">
                    <Loader2 className="w-7 h-7 animate-spin" />
                    <span className="font-bold uppercase">Processando arquivo...</span>
                  </div>
                ) : pendingFile ? (
                  <div className="space-y-2 text-center">
                    {pendingFile.fileType === 'image' ? (
                      <img
                        src={pendingFile.dataUrl}
                        alt="Prévia"
                        className="max-h-40 mx-auto rounded-lg object-contain border border-zinc-800"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center mx-auto text-red-400">
                        <FileText className="w-7 h-7" />
                      </div>
                    )}
                    <p className="text-white font-bold truncate">{pendingFile.fileName}</p>
                    <p className="text-[11px] text-emerald-400 font-semibold">
                      Pronto · {pendingFile.fileType === 'pdf' ? 'PDF' : 'Foto'} (
                      {formatFileSize(pendingFile.fileSizeBytes)})
                    </p>
                  </div>
                ) : (
                  <div className="text-center space-y-1 py-1">
                    <Upload className="w-7 h-7 text-amber-400 mx-auto" />
                    <p className="text-sm font-bold text-white">Selecione um PDF ou Foto</p>
                    <p className="text-[11px] text-zinc-400">
                      Aceita PDF multi-páginas (até 25 MB) e fotos (Galeria / Google Fotos)
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="cursor-pointer py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-red-500/40 rounded-lg text-xs font-bold text-red-300 flex items-center justify-center gap-2 transition-colors">
                    <FileText className="w-4 h-4" />
                    <span>Selecionar PDF (até 25 MB)</span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      disabled={isProcessingFile || isUploadingToCloud}
                      onChange={handleFilePick}
                      className="hidden"
                    />
                  </label>

                  <PhotoSourcePicker
                    onSelectFiles={handlePhotoFilesPick}
                    disabled={isProcessingFile || isUploadingToCloud}
                    title="Enviar Foto para Documentos"
                    className="w-full"
                  >
                    <div className="w-full py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-amber-400/40 rounded-lg text-xs font-bold text-amber-300 flex items-center justify-center gap-2 transition-colors">
                      <ImageIcon className="w-4 h-4" />
                      <span>Selecionar Foto</span>
                    </div>
                  </PhotoSourcePicker>
                </div>
              </div>

              {isUploadingToCloud && uploadProgress > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-amber-300 font-bold">
                    <span>Enviando documento para a nuvem...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      className="h-full bg-amber-400 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/50 text-red-300 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Título do Documento *
                </label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Ex: Ata da Reunião de Novembro 2026"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Pasta / Categoria
                  </label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">
                    Data do Documento
                  </label>
                  <input
                    type="date"
                    value={uploadDate}
                    onChange={(e) => setUploadDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Observações / Descrição (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Detalhes importantes sobre o documento ou foto..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Extra Custom Fields */}
              <div className="space-y-2 p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-400 uppercase text-[11px]">
                    Campos Adicionais (Opcional)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setUploadCustomFields([...uploadCustomFields, { key: '', value: '' }])
                    }
                    className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-700 text-[10px] font-bold uppercase flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Novo Campo</span>
                  </button>
                </div>
                {uploadCustomFields.map((cf, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                    <input
                      type="text"
                      placeholder="Nome do campo"
                      value={cf.key}
                      onChange={(e) =>
                        setUploadCustomFields(
                          uploadCustomFields.map((item, i) =>
                            i === idx ? { ...item, key: e.target.value } : item
                          )
                        )
                      }
                      className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                    <input
                      type="text"
                      placeholder="Valor"
                      value={cf.value}
                      onChange={(e) =>
                        setUploadCustomFields(
                          uploadCustomFields.map((item, i) =>
                            i === idx ? { ...item, value: e.target.value } : item
                          )
                        )
                      }
                      className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setUploadCustomFields(uploadCustomFields.filter((_, i) => i !== idx))
                      }
                      className="p-1.5 text-zinc-500 hover:text-red-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isUploadingToCloud}
                  onClick={() => setIsUploadOpen(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!pendingFile || isProcessingFile || isUploadingToCloud}
                  className="px-5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-rock font-bold uppercase flex items-center gap-2"
                >
                  {isUploadingToCloud ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Salvar Documento</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Metadata & Admin Full-Edit Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg p-6 space-y-4 my-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-rock text-lg font-bold uppercase text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                <span>{isAdmin ? 'Editar Documento Completo (Admin)' : 'Editar Documento'}</span>
              </h3>
              <button
                type="button"
                onClick={() => !isSavingEdit && setEditingDoc(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">Título *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">Pasta</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    {categoriesList.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-zinc-300 uppercase mb-1">Data</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {isAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-zinc-300 uppercase mb-1">Nome do Arquivo</label>
                    <input
                      type="text"
                      value={editFileName}
                      onChange={(e) => setEditFileName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-zinc-300 uppercase mb-1">Autor / Enviado Por</label>
                    <input
                      type="text"
                      value={editUploadedByName}
                      onChange={(e) => setEditUploadedByName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Extra Custom Fields Editor */}
              <div className="space-y-2 p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-400 uppercase text-[11px]">
                    Campos Adicionais
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditCustomFields([...editCustomFields, { key: '', value: '' }])
                    }
                    className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-zinc-700 text-[10px] font-bold uppercase flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Adicionar Campo</span>
                  </button>
                </div>
                {editCustomFields.length === 0 && (
                  <p className="text-[11px] text-zinc-500">
                    Nenhum campo extra preenchido. Clique em "Adicionar Campo" para incluir informações extras.
                  </p>
                )}
                {editCustomFields.map((cf, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                    <input
                      type="text"
                      placeholder="Nome do campo"
                      value={cf.key}
                      onChange={(e) =>
                        setEditCustomFields(
                          editCustomFields.map((item, i) =>
                            i === idx ? { ...item, key: e.target.value } : item
                          )
                        )
                      }
                      className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                    <input
                      type="text"
                      placeholder="Valor"
                      value={cf.value}
                      onChange={(e) =>
                        setEditCustomFields(
                          editCustomFields.map((item, i) =>
                            i === idx ? { ...item, value: e.target.value } : item
                          )
                        )
                      }
                      className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditCustomFields(editCustomFields.filter((_, i) => i !== idx))
                      }
                      className="p-1.5 text-zinc-500 hover:text-red-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Admin-only Replace File Option */}
              {isAdmin && (
                <div className="p-3 bg-zinc-950 border border-amber-400/30 rounded-xl space-y-2">
                  <span className="block font-bold text-amber-400 uppercase text-[11px]">
                    Substituir Arquivo PDF ou Foto (Opcional)
                  </span>
                  {editReplacementFile && (
                    <div className="p-2 rounded bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-[11px] flex items-center justify-between gap-2">
                      <span className="truncate">
                        Novo arquivo: {editReplacementFile.fileName} (
                        {formatFileSize(editReplacementFile.fileSizeBytes)})
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditReplacementFile(null)}
                        className="text-zinc-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="cursor-pointer py-2 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-bold text-red-300 flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Novo PDF (até 25 MB)</span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={isProcessingFile || isSavingEdit}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) await handleEditReplacementFile(f);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                    </label>
                    <PhotoSourcePicker
                      onSelectFiles={(files) => files[0] && handleEditReplacementFile(files[0])}
                      disabled={isProcessingFile || isSavingEdit}
                      title="Substituir por Foto"
                      className="w-full"
                    >
                      <div className="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-bold text-amber-300 flex items-center justify-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Nova Foto</span>
                      </div>
                    </PhotoSourcePicker>
                  </div>
                </div>
              )}

              {isSavingEdit && editProgress > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-amber-300 font-bold">
                    <span>Atualizando arquivo na nuvem...</span>
                    <span>{editProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      className="h-full bg-amber-400 transition-all duration-200"
                      style={{ width: `${editProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {editError && (
                <p className="text-[11px] text-red-400 font-semibold">{editError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingDoc(null)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 font-bold uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || isProcessingFile}
                  className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-rock font-bold uppercase"
                >
                  {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Schema Manager Modal (Categories + Preset Extra Fields) */}
      {isManagingSchema && isAdmin && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-lg p-6 space-y-5 my-auto shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-rock text-lg font-bold uppercase text-white flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-amber-400" />
                <span>Gerenciar Pastas e Campos (Admin)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsManagingSchema(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Categories */}
            <div className="space-y-2.5">
              <span className="font-bold text-amber-400 uppercase block">Pastas / Categorias</span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {draftCategories.map((cat, idx) => (
                  <div key={cat.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={cat.label}
                      onChange={(e) =>
                        setDraftCategories(
                          draftCategories.map((c, i) =>
                            i === idx ? { ...c, label: e.target.value } : c
                          )
                        )
                      }
                      className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                    />
                    {draftCategories.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftCategories(draftCategories.filter((_, i) => i !== idx))
                        }
                        className="p-1.5 rounded bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nome da nova pasta (ex: Contratos Sede)"
                  value={newCategoryLabel}
                  onChange={(e) => setNewCategoryLabel(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    const lbl = newCategoryLabel.trim();
                    if (!lbl) return;
                    const id =
                      lbl
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]+/g, '_')
                        .replace(/^_|_$/g, '') || `pasta_${Date.now()}`;
                    setDraftCategories([...draftCategories, { id: `${id}_${Date.now().toString(36).slice(-3)}`, label: lbl }]);
                    setNewCategoryLabel('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>

            {/* Preset Custom Field Labels */}
            <div className="space-y-2.5 pt-3 border-t border-zinc-800">
              <span className="font-bold text-amber-400 uppercase block">
                Campos Extras Padrão nos Documentos
              </span>
              <p className="text-[11px] text-zinc-400">
                Campos criados aqui aparecem automaticamente ao enviar ou editar qualquer documento (ex: Número do Protocolo, Cartório, Validade).
              </p>
              <div className="flex flex-wrap gap-1.5">
                {draftFieldLabels.map((lbl, idx) => (
                  <span
                    key={`${lbl}-${idx}`}
                    className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 flex items-center gap-1.5"
                  >
                    <span>{lbl}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftFieldLabels(draftFieldLabels.filter((_, i) => i !== idx))
                      }
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Novo campo padrão (ex: Validade)"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    const lbl = newFieldLabel.trim();
                    if (!lbl) return;
                    if (!draftFieldLabels.some((x) => x.toLowerCase() === lbl.toLowerCase())) {
                      setDraftFieldLabels([...draftFieldLabels, lbl]);
                    }
                    setNewFieldLabel('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 font-bold uppercase flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Incluir</span>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsManagingSchema(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveSchema}
                className="px-5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-rock font-bold uppercase"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121216] border border-red-500/40 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  Excluir Documento?
                </h3>
                <p className="text-xs text-zinc-400 truncate max-w-[230px]">
                  {deletingDoc.title}
                </p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Esta ação removerá permanentemente o arquivo do acervo restrito do motoclube.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingDoc(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase flex items-center gap-1.5"
              >
                {isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal (PDF & Photo) */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-sm">
          <div className="bg-[#121216] border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                  {getCategoryLabel(viewingDoc.category)} · {formatBrDate(viewingDoc.date)}
                </span>
                <h3 className="font-rock text-lg sm:text-xl font-bold text-white truncate">
                  {viewingDoc.title}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {(viewerBlobUrl || viewerResolvedUrl) && (
                  <>
                    <a
                      href={viewerBlobUrl || viewerResolvedUrl}
                      download={viewingDoc.fileName}
                      className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar</span>
                    </a>
                    {viewingDoc.fileType === 'pdf' && viewerBlobUrl && (
                      <a
                        href={viewerBlobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Abrir em Nova Guia</span>
                      </a>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={handleCloseViewer}
                  className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                  aria-label="Fechar visualizador"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-zinc-950 flex flex-col items-center justify-start min-h-[300px]">
              {isLoadingViewer ? (
                <div className="flex flex-col items-center justify-center gap-3 text-amber-400 py-16 my-auto">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-xs font-bold uppercase">
                    Carregando documento da nuvem...
                  </span>
                </div>
              ) : viewerError ? (
                <div className="text-center space-y-3 py-12 my-auto max-w-md">
                  <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                  <p className="text-sm text-red-300 font-semibold">{viewerError}</p>
                  <button
                    type="button"
                    onClick={() => handleOpenViewer(viewingDoc)}
                    className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tentar Novamente</span>
                  </button>
                </div>
              ) : viewingDoc.fileType === 'image' ? (
                <img
                  src={viewerBlobUrl || viewerResolvedUrl}
                  alt={viewingDoc.title}
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (viewerResolvedUrl && img.src !== viewerResolvedUrl) {
                      img.src = viewerResolvedUrl;
                    }
                  }}
                  className="max-h-[74vh] w-auto rounded-xl object-contain border border-zinc-800 my-auto"
                />
              ) : (
                <PdfCanvasViewer
                  dataUrl={viewerResolvedUrl}
                  blobUrl={viewerBlobUrl}
                  title={viewingDoc.title}
                  fileName={viewingDoc.fileName}
                />
              )}
            </div>

            {viewingDoc.description && (
              <div className="px-4 py-3 bg-[#121216] border-t border-zinc-800 text-xs text-zinc-300">
                <strong className="text-amber-400 uppercase mr-2">Descrição:</strong>
                <span>{viewingDoc.description}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Version History & Rollback Modal */}
      {versionHistoryDoc && isAdmin && (() => {
        const cacheRec = cachedDocsMap[versionHistoryDoc.id];
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <div className="bg-[#121216] border border-sky-400/40 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-sky-400" />
                  <div>
                    <h3 className="font-rock text-lg font-bold uppercase text-white">
                      Histórico & Rollback Local
                    </h3>
                    <p className="text-[11px] text-zinc-400 truncate max-w-xs sm:max-w-sm">
                      {versionHistoryDoc.title}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVersionHistoryDoc(null)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {cacheRec ? (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  <div className="p-3.5 rounded-xl bg-emerald-950/25 border border-emerald-500/40 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-emerald-300 font-bold uppercase">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Versão Ativa em Cache</span>
                      </span>
                      <span className="font-mono text-[11px] text-emerald-200">
                        SHA {cacheRec.sha256.slice(0, 12)}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Atualizado em {new Date(cacheRec.updatedAt).toLocaleString('pt-BR')} ·{' '}
                      {formatFileSize(cacheRec.sizeBytes)}
                    </p>
                  </div>

                  {cacheRec.history.length === 0 ? (
                    <p className="text-zinc-400 text-center py-6 bg-zinc-950 rounded-xl border border-zinc-800">
                      Nenhuma revisão anterior armazenada ainda para este arquivo.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <span className="block text-[10px] font-bold uppercase text-zinc-400 tracking-wider">
                        Revisões Anteriores ({cacheRec.history.length})
                      </span>
                      {cacheRec.history.map((hist, idx) => (
                        <div
                          key={`${hist.sha256}-${idx}`}
                          className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <span className="font-mono font-bold text-amber-300 block">
                              SHA {hist.sha256.slice(0, 12)}
                            </span>
                            <span className="text-[11px] text-zinc-400 block">
                              {new Date(hist.updatedAt).toLocaleString('pt-BR')} ·{' '}
                              {formatFileSize(hist.sizeBytes)}
                              {hist.updatedByName ? ` · ${hist.updatedByName}` : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={isRollingBack || !hist.dataUrl}
                            onClick={() =>
                              handleRollbackDocumentVersion(versionHistoryDoc, hist.sha256)
                            }
                            className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-40 text-sky-300 border border-sky-500/40 font-bold uppercase flex items-center gap-1 shrink-0"
                          >
                            {isRollingBack ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            <span>Restaurar</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-zinc-400 py-4 text-center">
                  Este documento ainda não foi armazenado no cache local. Abra ou baixe-o uma vez para registrar o hash offline.
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
