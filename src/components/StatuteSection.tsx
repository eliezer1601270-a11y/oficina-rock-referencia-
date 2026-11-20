import React, { useState, useMemo, useEffect } from 'react';
import {
  Scale,
  Search,
  Edit3,
  Save,
  X,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Lock,
  ShieldAlert,
  MessageSquareText,
  BookOpen,
  FileCheck2,
  Copy,
  Check,
  Download,
  FileInput,
  ArrowUp,
  ArrowDown,
  History,
  HardDrive,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  ClubGovernanceDoc,
  ClubInfo,
  GovernanceSectionItem,
  User,
  getMemberDisplayName,
} from '../types';
import { StorageService, playSound } from '../services/storage';
import { IndexedDbCache, CachedDocumentRecord } from '../services/indexedDbCache';

interface StatuteSectionProps {
  governanceDocs: ClubGovernanceDoc[];
  currentUser: User | null;
  clubInfo: ClubInfo;
  onUpdateGovernanceDocs: (docs: ClubGovernanceDoc[]) => void;
  onOpenAuth: () => void;
}

interface TextMatchRange {
  start: number;
  end: number;
}

function normalizeChar(ch: string): string {
  return ch
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function findAccentInsensitiveMatches(text: string, rawQuery: string): TextMatchRange[] {
  const normQuery = normalizeChar(rawQuery.trim());
  if (!normQuery || !text) return [];

  let normText = '';
  const origStarts: number[] = [];
  const origEnds: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const piece = normalizeChar(text[i]);
    if (!piece) continue;
    for (let k = 0; k < piece.length; k++) {
      normText += piece[k];
      origStarts.push(i);
      origEnds.push(i + 1);
    }
  }

  const ranges: TextMatchRange[] = [];
  let cursor = 0;
  while (cursor <= normText.length - normQuery.length) {
    const foundAt = normText.indexOf(normQuery, cursor);
    if (foundAt === -1) break;
    const start = origStarts[foundAt];
    const end = origEnds[foundAt + normQuery.length - 1];
    ranges.push({ start, end });
    cursor = foundAt + normQuery.length;
  }
  return ranges;
}

function formatBrDateTime(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function StatuteSection({
  governanceDocs,
  currentUser,
  clubInfo,
  onUpdateGovernanceDocs,
  onOpenAuth,
}: StatuteSectionProps) {
  const [activeDocTab, setActiveDocTab] = useState<'estatuto' | 'rdi' | 'both'>('estatuto');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editingKind, setEditingKind] = useState<'estatuto' | 'rdi'>('estatuto');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftVersion, setDraftVersion] = useState('');
  const [draftPreamble, setDraftPreamble] = useState('');
  const [draftSections, setDraftSections] = useState<GovernanceSectionItem[]>([]);
  const [copiedFlag, setCopiedFlag] = useState(false);

  // Bulk import text modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkTextDraft, setBulkTextDraft] = useState('');

  // IndexedDB cache metadata & rollback modal
  const [cachedGovMap, setCachedGovMap] = useState<Record<string, CachedDocumentRecord>>({});
  const [historyDoc, setHistoryDoc] = useState<ClubGovernanceDoc | null>(null);

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

  const refreshCachedGovernance = async () => {
    try {
      const cached = await IndexedDbCache.listCachedDocuments('governance');
      const next: Record<string, CachedDocumentRecord> = {};
      for (const rec of cached) {
        next[rec.id] = rec;
      }
      setCachedGovMap(next);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const d of governanceDocs) {
        await IndexedDbCache.cacheDocumentBinary({
          kind: 'governance',
          id: d.id,
          title: d.title,
          mimeType: 'application/json',
          version: d.versionLabel || d.updatedAt || 'v1',
          payload: d,
          updatedByName: d.updatedByName,
        });
      }
      if (!cancelled) {
        await refreshCachedGovernance();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [governanceDocs]);

  const estatutoDoc = useMemo(
    () => governanceDocs.find((d) => d.id === 'estatuto') || governanceDocs[0],
    [governanceDocs]
  );
  const rdiDoc = useMemo(
    () => governanceDocs.find((d) => d.id === 'rdi') || governanceDocs[1] || governanceDocs[0],
    [governanceDocs]
  );

  const visibleDocs: ClubGovernanceDoc[] = useMemo(() => {
    if (activeDocTab === 'both') {
      return [estatutoDoc, rdiDoc].filter(Boolean);
    }
    return activeDocTab === 'rdi' ? [rdiDoc].filter(Boolean) : [estatutoDoc].filter(Boolean);
  }, [activeDocTab, estatutoDoc, rdiDoc]);

  // Compute match counts across visible docs and assign deterministic global match offsets
  const matchData = useMemo(() => {
    const q = searchQuery.trim();
    const docStats = new Map<string, number>();
    const sectionMatches = new Map<string, number>();
    let totalMatches = 0;

    if (!q) {
      return { totalMatches: 0, docStats, sectionMatches };
    }

    [estatutoDoc, rdiDoc].filter(Boolean).forEach((docItem) => {
      let docCount = 0;
      docCount += findAccentInsensitiveMatches(docItem.preamble, q).length;
      docItem.sections.forEach((sec) => {
        const headingCount = findAccentInsensitiveMatches(sec.heading, q).length;
        const contentCount = findAccentInsensitiveMatches(sec.content, q).length;
        const secTotal = headingCount + contentCount;
        sectionMatches.set(`${docItem.id}:${sec.id}`, secTotal);
        docCount += secTotal;
      });
      docStats.set(docItem.id, docCount);
    });

    visibleDocs.forEach((docItem) => {
      totalMatches += docStats.get(docItem.id) || 0;
    });

    return { totalMatches, docStats, sectionMatches };
  }, [searchQuery, estatutoDoc, rdiDoc, visibleDocs]);

  useEffect(() => {
    setActiveMatchIdx(0);
  }, [searchQuery, activeDocTab, onlyMatching]);

  // Gate 1: Unauthenticated visitor
  if (!currentUser) {
    return (
      <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 my-8 shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mx-auto text-amber-400">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="font-rock text-3xl font-bold uppercase text-white">
            Estatuto & RDI — Área Restrita
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto">
            O Estatuto Social e o Regimento Disciplinar Interno (RDI) são documentos institucionais exclusivos para integrantes aprovados do motoclube.
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
            Olá, <strong className="text-white">{getMemberDisplayName(currentUser)}</strong>. Seu acesso ao Estatuto e RDI será liberado assim que a Diretoria homologar seu cadastro.
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

  const jumpToMatch = (nextIdx: number) => {
    if (matchData.totalMatches === 0) return;
    const wrapped =
      ((nextIdx % matchData.totalMatches) + matchData.totalMatches) % matchData.totalMatches;
    setActiveMatchIdx(wrapped);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-match-idx="${wrapped}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  };

  const handleStartEdit = (kind: 'estatuto' | 'rdi') => {
    const target = kind === 'rdi' ? rdiDoc : estatutoDoc;
    if (!target) return;
    setEditingKind(kind);
    setActiveDocTab(kind);
    setDraftTitle(target.title);
    setDraftVersion(target.versionLabel);
    setDraftPreamble(target.preamble);
    setDraftSections(target.sections.map((s) => ({ ...s })));
    setIsEditing(true);
    playSound('click');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBoardOrAdmin || !currentUser) return;
    const cleanedSections = draftSections
      .map((s, idx) => ({
        id: s.id || `${editingKind}-sec-${idx + 1}`,
        heading: s.heading.trim() || `CAPÍTULO ${idx + 1}`,
        content: s.content.trim(),
      }))
      .filter((s) => s.heading || s.content);

    const updatedDoc: ClubGovernanceDoc = {
      id: editingKind,
      kind: editingKind,
      title:
        draftTitle.trim() ||
        (editingKind === 'rdi'
          ? 'RDI — Regimento Disciplinar Interno'
          : 'Estatuto Social — Oficina do Rock Motoclube'),
      versionLabel: draftVersion.trim(),
      preamble: draftPreamble.trim(),
      sections: cleanedSections,
      updatedAt: new Date().toISOString(),
      updatedById: currentUser.id,
      updatedByName: getMemberDisplayName(currentUser),
    };

    const nextDocs = [
      editingKind === 'estatuto' ? updatedDoc : estatutoDoc,
      editingKind === 'rdi' ? updatedDoc : rdiDoc,
    ].filter(Boolean);

    try {
      await StorageService.saveGovernanceDocConfirmed(updatedDoc, nextDocs);
      onUpdateGovernanceDocs(nextDocs);
      void IndexedDbCache.cacheDocumentBinary({
        kind: 'governance',
        id: updatedDoc.id,
        title: updatedDoc.title,
        mimeType: 'application/json',
        version: updatedDoc.versionLabel || updatedDoc.updatedAt || 'v1',
        payload: updatedDoc,
        updatedByName: updatedDoc.updatedByName,
      }).then(() => refreshCachedGovernance());
      setIsEditing(false);
      playSound('success');
    } catch {
      playSound('beep');
    }
  };

  const handleRollbackGovernanceVersion = async (
    docItem: ClubGovernanceDoc,
    targetSha256: string
  ) => {
    if (!isAdmin) return;
    const rolled = await IndexedDbCache.rollbackCachedDocument(
      'governance',
      docItem.id,
      targetSha256
    );
    if (!rolled || !rolled.payload || typeof rolled.payload !== 'object') {
      playSound('beep');
      return;
    }
    const restoredDoc = {
      ...(rolled.payload as ClubGovernanceDoc),
      updatedAt: new Date().toISOString(),
      updatedById: currentUser?.id,
      updatedByName: currentUser ? getMemberDisplayName(currentUser) : docItem.updatedByName,
    };
    const nextDocs = [
      restoredDoc.kind === 'estatuto' ? restoredDoc : estatutoDoc,
      restoredDoc.kind === 'rdi' ? restoredDoc : rdiDoc,
    ].filter(Boolean);
    try {
      await StorageService.saveGovernanceDocConfirmed(restoredDoc, nextDocs);
      onUpdateGovernanceDocs(nextDocs);
      await refreshCachedGovernance();
      setHistoryDoc(null);
      playSound('success');
    } catch {
      playSound('beep');
    }
  };

  const handleAddSection = () => {
    const nextNum = draftSections.length + 1;
    setDraftSections((prev) => [
      ...prev,
      {
        id: `${editingKind}-cap-${Date.now()}-${nextNum}`,
        heading: `CAPÍTULO ${nextNum} — NOVO TÍTULO`,
        content: '',
      },
    ]);
  };

  const handleMoveSection = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= draftSections.length) return;
    const copy = [...draftSections];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    setDraftSections(copy);
  };

  const handleRemoveSection = (index: number) => {
    setDraftSections((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleApplyBulkImport = () => {
    const raw = bulkTextDraft.trim();
    if (!raw) {
      setIsBulkModalOpen(false);
      return;
    }

    const lines = raw.split(/\r?\n/);
    const headingRegex = /^(cap[ií]tulo|cl[aá]usula|t[ií]tulo|se[çc][ãa]o|parte|disposi[çc][õo]es\s+finais)\b/i;
    const parsed: GovernanceSectionItem[] = [];
    let currentHeading = '';
    let buffer: string[] = [];

    lines.forEach((line) => {
      if (headingRegex.test(line.trim())) {
        if (currentHeading || buffer.join('\n').trim()) {
          parsed.push({
            id: `${editingKind}-imp-${parsed.length + 1}-${Date.now()}`,
            heading: currentHeading || 'DISPOSIÇÕES INICIAIS',
            content: buffer.join('\n').trim(),
          });
        }
        currentHeading = line.trim();
        buffer = [];
      } else {
        buffer.push(line);
      }
    });

    if (currentHeading || buffer.join('\n').trim()) {
      parsed.push({
        id: `${editingKind}-imp-${parsed.length + 1}-${Date.now()}`,
        heading: currentHeading || `CAPÍTULO ${parsed.length + 1}`,
        content: buffer.join('\n').trim(),
      });
    }

    if (parsed.length > 0) {
      setDraftSections(parsed);
      playSound('success');
    }
    setIsBulkModalOpen(false);
    setBulkTextDraft('');
  };

  const buildPlainTextExport = (docList: ClubGovernanceDoc[]) => {
    return docList
      .map((docItem) => {
        const parts = [
          docItem.title.toUpperCase(),
          docItem.versionLabel,
          '',
          docItem.preamble,
          '',
          ...docItem.sections.map((s) => `${s.heading}\n\n${s.content}\n`),
        ];
        return parts.filter((p) => p !== undefined).join('\n');
      })
      .join('\n========================================\n\n');
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainTextExport(visibleDocs));
      setCopiedFlag(true);
      playSound('success');
      setTimeout(() => setCopiedFlag(false), 3000);
    } catch {
      playSound('beep');
    }
  };

  const handleDownloadTxt = () => {
    const content = buildPlainTextExport(visibleDocs);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      activeDocTab === 'rdi'
        ? 'RDI-Oficina-do-Rock-MC.txt'
        : activeDocTab === 'estatuto'
        ? 'Estatuto-Oficina-do-Rock-MC.txt'
        : 'Estatuto-e-RDI-Oficina-do-Rock-MC.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    playSound('success');
  };

  // Render helper that tracks match indices monotonically per render
  let matchCounter = 0;
  const renderHighlightedText = (text: string) => {
    const q = searchQuery.trim();
    if (!q || !text) return text;
    const ranges = findAccentInsensitiveMatches(text, q);
    if (ranges.length === 0) return text;

    const nodes: React.ReactNode[] = [];
    let lastEnd = 0;

    ranges.forEach((range, i) => {
      if (range.start > lastEnd) {
        nodes.push(text.slice(lastEnd, range.start));
      }
      const thisIdx = matchCounter++;
      const isCurrent = thisIdx === activeMatchIdx;
      nodes.push(
        <mark
          key={`${thisIdx}-${i}`}
          data-match-idx={thisIdx}
          className={`px-0.5 rounded font-bold transition-all ${
            isCurrent
              ? 'bg-amber-300 text-black ring-2 ring-white shadow-sm'
              : 'bg-amber-400/80 text-black'
          }`}
        >
          {text.slice(range.start, range.end)}
        </mark>
      );
      lastEnd = range.end;
    });

    if (lastEnd < text.length) {
      nodes.push(text.slice(lastEnd));
    }
    return nodes;
  };

  const trimmedQuery = searchQuery.trim();

  return (
    <div className="space-y-6 pb-20 xl:pb-6">
      {/* Header Banner */}
      <section className="bg-gradient-to-br from-zinc-900 via-[#121216] to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-400">
            <Scale className="w-4 h-4" />
            <span>Governança & Disciplina · Área Restrita</span>
          </div>
          <h1 className="font-rock text-3xl sm:text-4xl font-bold uppercase text-white tracking-wide">
            Estatuto Social & RDI
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Consulte o Estatuto Oficial e o Regimento Disciplinar Interno (RDI) com busca rápida por palavra-chave entre capítulos e artigos.
          </p>
        </div>

        {!isEditing && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyText}
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs font-bold uppercase flex items-center gap-1.5"
            >
              {copiedFlag ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-amber-400" />
                  <span>Copiar</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadTxt}
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs font-bold uppercase flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Exportar .TXT</span>
            </button>

            {isBoardOrAdmin && (
              <button
                type="button"
                onClick={() => handleStartEdit(activeDocTab === 'rdi' ? 'rdi' : 'estatuto')}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-amber-400/20"
              >
                <Edit3 className="w-4 h-4" />
                <span>
                  {activeDocTab === 'rdi' ? 'Editar RDI' : 'Editar Estatuto'}
                </span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* Sub-navigation + Keyword Search Toolbar (Hidden while editing) */}
      {!isEditing && (
        <section className="bg-[#121216] border border-zinc-800/90 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Document Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveDocTab('estatuto')}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
                  activeDocTab === 'estatuto'
                    ? 'bg-amber-400 text-black shadow'
                    : 'bg-zinc-950 text-zinc-300 border border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Estatuto Social</span>
                {trimmedQuery && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      activeDocTab === 'estatuto'
                        ? 'bg-black/20 text-black'
                        : 'bg-amber-400/20 text-amber-300'
                    }`}
                  >
                    {matchData.docStats.get('estatuto') || 0}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveDocTab('rdi')}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
                  activeDocTab === 'rdi'
                    ? 'bg-amber-400 text-black shadow'
                    : 'bg-zinc-950 text-zinc-300 border border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>RDI (Regimento Disciplinar)</span>
                {trimmedQuery && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      activeDocTab === 'rdi'
                        ? 'bg-black/20 text-black'
                        : 'bg-amber-400/20 text-amber-300'
                    }`}
                  >
                    {matchData.docStats.get('rdi') || 0}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveDocTab('both')}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
                  activeDocTab === 'both'
                    ? 'bg-amber-400 text-black shadow'
                    : 'bg-zinc-950 text-zinc-300 border border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <Scale className="w-4 h-4" />
                <span>Ambos</span>
              </button>
            </div>

            {isBoardOrAdmin && activeDocTab === 'both' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStartEdit('estatuto')}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-400/40 text-[11px] font-bold uppercase flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar Estatuto</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStartEdit('rdi')}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-400/40 text-[11px] font-bold uppercase flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar RDI</span>
                </button>
              </div>
            )}
          </div>

          {/* Keyword Search Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matchData.totalMatches > 0) {
                    e.preventDefault();
                    jumpToMatch(e.shiftKey ? activeMatchIdx - 1 : activeMatchIdx + 1);
                  }
                }}
                placeholder="Buscar por palavra-chave (ex: colete, mensalidade, comboio, suspensão, eleição, voto)..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  title="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {trimmedQuery && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs">
                  <span className="font-bold text-amber-400 mr-1">
                    {matchData.totalMatches === 0
                      ? '0 ocorrências'
                      : `${activeMatchIdx + 1} de ${matchData.totalMatches}`}
                  </span>
                  <button
                    type="button"
                    disabled={matchData.totalMatches === 0}
                    onClick={() => jumpToMatch(activeMatchIdx - 1)}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-300 disabled:opacity-40"
                    title="Ocorrência anterior"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={matchData.totalMatches === 0}
                    onClick={() => jumpToMatch(activeMatchIdx + 1)}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-300 disabled:opacity-40"
                    title="Próxima ocorrência"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setOnlyMatching((prev) => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold uppercase border transition-colors ${
                    onlyMatching
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {onlyMatching ? 'Mostrando só encontrados' : 'Filtrar só encontrados'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* EDIT MODE */}
      {isEditing && isBoardOrAdmin ? (
        <form
          onSubmit={handleSaveEdit}
          className="bg-[#121216] border border-amber-400/50 rounded-2xl p-6 sm:p-8 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block">
                Modo de Edição · Diretoria & Administração
              </span>
              <h2 className="font-rock text-2xl font-bold uppercase text-white">
                Editar {editingKind === 'rdi' ? 'RDI (Regimento Disciplinar)' : 'Estatuto Social'}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBulkTextDraft('');
                  setIsBulkModalOpen(true);
                }}
                className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-300 border border-amber-400/40 text-xs font-bold uppercase flex items-center gap-1.5"
              >
                <FileInput className="w-4 h-4" />
                <span>Colar / Importar Texto</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-zinc-300 uppercase mb-1">
                Título do Documento
              </label>
              <input
                type="text"
                required
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block font-bold text-zinc-300 uppercase mb-1">
                Versão / Subtítulo de Vigência
              </label>
              <input
                type="text"
                value={draftVersion}
                onChange={(e) => setDraftVersion(e.target.value)}
                placeholder="Ex: Versão Consolidada 2026"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="block font-bold text-zinc-300 uppercase mb-1">
              Preâmbulo / Introdução
            </label>
            <textarea
              rows={3}
              value={draftPreamble}
              onChange={(e) => setDraftPreamble(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-rock text-lg font-bold uppercase text-amber-400">
                Capítulos e Artigos ({draftSections.length})
              </h3>
              <button
                type="button"
                onClick={handleAddSection}
                className="px-3.5 py-2 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/40 text-xs font-bold uppercase flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Capítulo</span>
              </button>
            </div>

            {draftSections.length === 0 && (
              <div className="p-6 rounded-xl bg-zinc-950 border border-dashed border-zinc-700 text-center space-y-3">
                <p className="text-xs text-zinc-400">
                  Nenhum capítulo ou cláusula adicionado ainda. Clique em <strong>Adicionar Capítulo</strong> ou use <strong>Colar / Importar Texto</strong> acima.
                </p>
              </div>
            )}

            {draftSections.map((sec, idx) => (
              <div
                key={sec.id}
                className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase text-amber-400">
                    Bloco #{idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveSection(idx, -1)}
                      className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
                      title="Mover para cima"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draftSections.length - 1}
                      onClick={() => handleMoveSection(idx, 1)}
                      className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
                      title="Mover para baixo"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(idx)}
                      className="p-1.5 rounded bg-zinc-900 hover:bg-red-950/60 text-zinc-400 hover:text-red-400"
                      title="Remover capítulo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={sec.heading}
                  onChange={(e) => {
                    const next = [...draftSections];
                    next[idx] = { ...next[idx], heading: e.target.value };
                    setDraftSections(next);
                  }}
                  placeholder="Título do Capítulo ou Seção"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                />

                <textarea
                  rows={6}
                  value={sec.content}
                  onChange={(e) => {
                    const next = [...draftSections];
                    next[idx] = { ...next[idx], content: e.target.value };
                    setDraftSections(next);
                  }}
                  placeholder="Artigos, parágrafos e incisos..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs sm:text-sm leading-relaxed text-zinc-100 focus:outline-none focus:border-amber-400"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Salvar na Nuvem</span>
            </button>
          </div>
        </form>
      ) : (
        /* VIEW MODE */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Quick Table of Contents Sidebar */}
          <aside className="lg:col-span-4 xl:col-span-3 bg-[#121216] border border-zinc-800/90 rounded-2xl p-4 space-y-4 lg:sticky lg:top-24 max-h-[75vh] overflow-y-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block border-b border-zinc-800 pb-2">
              Índice de Capítulos
            </span>

            {visibleDocs.every((d) => d.sections.length === 0) && (
              <p className="text-xs text-zinc-500 italic">
                Nenhum capítulo ou cláusula cadastrado neste documento.
              </p>
            )}

            {visibleDocs.map((docItem) => (
              <div key={`toc-${docItem.id}`} className="space-y-1.5">
                {visibleDocs.length > 1 && (
                  <span className="text-[10px] font-extrabold uppercase text-zinc-400 tracking-wider block pt-1">
                    {docItem.kind === 'rdi' ? 'RDI' : 'Estatuto Social'}
                  </span>
                )}
                {docItem.sections.map((sec) => {
                  const secMatchCount =
                    matchData.sectionMatches.get(`${docItem.id}:${sec.id}`) || 0;
                  if (trimmedQuery && onlyMatching && secMatchCount === 0) return null;

                  return (
                    <button
                      key={`toc-item-${docItem.id}-${sec.id}`}
                      type="button"
                      onClick={() => {
                        const target = document.getElementById(
                          `gov-sec-${docItem.id}-${sec.id}`
                        );
                        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg bg-zinc-950/70 hover:bg-zinc-900 border border-zinc-800/80 hover:border-amber-400/40 text-xs text-zinc-300 hover:text-white flex items-center justify-between gap-2 transition-colors"
                    >
                      <span className="line-clamp-2 font-medium">{sec.heading}</span>
                      {trimmedQuery && secMatchCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-black text-[10px] font-extrabold shrink-0">
                          {secMatchCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>

          {/* Main Document Body */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-8">
            {trimmedQuery && matchData.totalMatches === 0 && (
              <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-8 text-center space-y-2">
                <Search className="w-8 h-8 text-zinc-500 mx-auto" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  Nenhuma ocorrência para "{trimmedQuery}"
                </h3>
                <p className="text-xs text-zinc-400">
                  Tente buscar por outra palavra-chave ou clique em "Ambos" para pesquisar no Estatuto e no RDI ao mesmo tempo.
                </p>
              </div>
            )}

            {visibleDocs.map((docItem) => {
              const displayedSections =
                trimmedQuery && onlyMatching
                  ? docItem.sections.filter(
                      (s) => (matchData.sectionMatches.get(`${docItem.id}:${s.id}`) || 0) > 0
                    )
                  : docItem.sections;

              const preambleMatches =
                trimmedQuery
                  ? findAccentInsensitiveMatches(docItem.preamble, trimmedQuery).length
                  : 0;

              if (
                trimmedQuery &&
                onlyMatching &&
                displayedSections.length === 0 &&
                preambleMatches === 0
              ) {
                return null;
              }

              return (
                <section
                  key={docItem.id}
                  className="bg-[#121216] border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl"
                >
                  <div className="border-b border-zinc-800 pb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold uppercase tracking-widest text-amber-400 block">
                        {docItem.versionLabel || 'Documento Oficial'}
                      </span>
                      <h2 className="font-rock text-2xl sm:text-3xl font-bold uppercase text-white">
                        {docItem.title}
                      </h2>
                      {(docItem.updatedAt || docItem.updatedByName) && (
                        <p className="text-[11px] text-zinc-500">
                          Atualizado em {formatBrDateTime(docItem.updatedAt)}
                          {docItem.updatedByName ? ` por ${docItem.updatedByName}` : ''}
                        </p>
                      )}
                      {cachedGovMap[docItem.id] && (
                        <div className="flex items-center gap-2 flex-wrap pt-1 text-[10px]">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-bold uppercase">
                            <HardDrive className="w-3 h-3" />
                            <span>
                              Offline IndexedDB · SHA {cachedGovMap[docItem.id].sha256.slice(0, 8)}
                            </span>
                          </span>
                          {cachedGovMap[docItem.id].history.length > 0 && (
                            <span className="text-zinc-400 font-semibold">
                              {cachedGovMap[docItem.id].history.length} revisão(ões) anterior(es)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-start">
                      {isAdmin && cachedGovMap[docItem.id] && (
                        <button
                          type="button"
                          onClick={() => setHistoryDoc(docItem)}
                          className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-sky-300 border border-sky-500/35 text-xs font-bold uppercase flex items-center gap-1.5"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>Versões</span>
                        </button>
                      )}
                      {isBoardOrAdmin && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(docItem.kind)}
                          className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-400/40 text-xs font-bold uppercase flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar {docItem.kind === 'rdi' ? 'RDI' : 'Estatuto'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {docItem.preamble && (!onlyMatching || !trimmedQuery || preambleMatches > 0) && (
                    <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 text-sm text-zinc-300 leading-relaxed italic">
                      {renderHighlightedText(docItem.preamble)}
                    </div>
                  )}

                  {!docItem.preamble && docItem.sections.length === 0 ? (
                    <div className="p-8 rounded-xl bg-zinc-950/70 border border-dashed border-zinc-800 text-center space-y-3">
                      <FileCheck2 className="w-8 h-8 text-zinc-600 mx-auto" />
                      <div className="space-y-1">
                        <h3 className="font-rock text-base font-bold uppercase text-zinc-300">
                          Documento em branco
                        </h3>
                        <p className="text-xs text-zinc-500 max-w-md mx-auto">
                          {docItem.kind === 'rdi'
                            ? 'O Regimento Disciplinar Interno (RDI) ainda está em branco e aguarda preenchimento pela Diretoria.'
                            : 'Nenhuma cláusula cadastrada ainda.'}
                        </p>
                      </div>
                      {isBoardOrAdmin && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(docItem.kind)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Preencher {docItem.kind === 'rdi' ? 'RDI' : 'Estatuto'}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {displayedSections.map((sec) => (
                        <article
                          key={sec.id}
                          id={`gov-sec-${docItem.id}-${sec.id}`}
                          className="scroll-mt-24 p-5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3"
                        >
                          <h3 className="font-rock text-lg font-bold uppercase text-amber-400 tracking-wide">
                            {renderHighlightedText(sec.heading)}
                          </h3>
                          <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
                            {renderHighlightedText(sec.content)}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* Bulk Text Import Modal (while editing) */}
      {isBulkModalOpen && isBoardOrAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-rock text-lg font-bold uppercase text-white flex items-center gap-2">
                <FileInput className="w-5 h-5 text-amber-400" />
                <span>Colar Texto Completo (Divisão Automática por Capítulos)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Cole abaixo o texto completo do {editingKind === 'rdi' ? 'RDI' : 'Estatuto'}. Linhas iniciadas com <strong>CAPÍTULO</strong>, <strong>TÍTULO</strong> ou <strong>SEÇÃO</strong> serão organizadas automaticamente em blocos editáveis.
            </p>

            <textarea
              rows={12}
              value={bulkTextDraft}
              onChange={(e) => setBulkTextDraft(e.target.value)}
              placeholder={`CAPÍTULO I — DA FINALIDADE\nArt. 1º — ...\n\nCAPÍTULO II — DOS INTEGRANTES\nArt. 2º — ...`}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyBulkImport}
                className="px-5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-rock text-xs font-bold uppercase"
              >
                Organizar em Capítulos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Governance Version History & Rollback Modal */}
      {historyDoc && isAdmin && (() => {
        const rec = cachedGovMap[historyDoc.id];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <div className="bg-[#121216] border border-sky-400/40 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-sky-400" />
                  <div>
                    <h3 className="font-rock text-lg font-bold uppercase text-white">
                      Histórico & Rollback Oficial
                    </h3>
                    <p className="text-[11px] text-zinc-400">{historyDoc.title}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryDoc(null)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {rec ? (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  <div className="p-3.5 rounded-xl bg-emerald-950/25 border border-emerald-500/40 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-emerald-300 font-bold uppercase">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Versão Publicada Atual</span>
                      </span>
                      <span className="font-mono text-[11px] text-emerald-200">
                        SHA {rec.sha256.slice(0, 12)}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {rec.version} · {new Date(rec.updatedAt).toLocaleString('pt-BR')}
                    </p>
                  </div>

                  {rec.history.length === 0 ? (
                    <p className="text-zinc-400 text-center py-6 bg-zinc-950 rounded-xl border border-zinc-800">
                      Nenhuma revisão anterior registrada ainda neste dispositivo.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <span className="block text-[10px] font-bold uppercase text-zinc-400 tracking-wider">
                        Revisões Anteriores ({rec.history.length})
                      </span>
                      {rec.history.map((h, i) => (
                        <div
                          key={`${h.sha256}-${i}`}
                          className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <span className="font-bold text-white block truncate">
                              {h.version || 'Revisão salva'}
                            </span>
                            <span className="font-mono text-[11px] text-amber-300 block">
                              SHA {h.sha256.slice(0, 12)}
                            </span>
                            <span className="text-[11px] text-zinc-400 block">
                              {new Date(h.updatedAt).toLocaleString('pt-BR')}
                              {h.updatedByName ? ` · ${h.updatedByName}` : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={!h.payload}
                            onClick={() => handleRollbackGovernanceVersion(historyDoc, h.sha256)}
                            className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-40 text-sky-300 border border-sky-500/40 font-bold uppercase flex items-center gap-1 shrink-0"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restaurar</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-zinc-400 py-4 text-center">
                  Cache de versionamento indisponível para este documento.
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
