import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Loader2,
  AlertTriangle,
  FileText,
  Download,
} from 'lucide-react';
import { dataUrlToUint8Array } from '../services/imageUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface PdfCanvasViewerProps {
  dataUrl: string;
  blobUrl?: string;
  title: string;
  fileName: string;
}

export default function PdfCanvasViewer({
  dataUrl,
  blobUrl,
  title,
  fileName,
}: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [renderError, setRenderError] = useState('');
  const [useNativeFallback, setUseNativeFallback] = useState(false);
  const [renderingPages, setRenderingPages] = useState(false);

  // Load PDF document via pdfjs-dist
  useEffect(() => {
    let cancelled = false;
    let loadedDoc: pdfjsLib.PDFDocumentProxy | null = null;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

    setLoadingPdf(true);
    setRenderError('');
    setUseNativeFallback(false);
    setPdfDoc(null);
    setNumPages(0);

    const load = async () => {
      try {
        let source: { data: Uint8Array } | { url: string };
        const decoded = dataUrlToUint8Array(dataUrl, 'application/pdf');
        if (decoded && decoded.bytes.byteLength > 0) {
          source = { data: decoded.bytes };
        } else if (blobUrl || dataUrl) {
          const res = await fetch(blobUrl || dataUrl);
          if (!res.ok) {
            throw new Error(`Falha ao carregar dados do PDF (${res.status}).`);
          }
          const buf = await res.arrayBuffer();
          source = { data: new Uint8Array(buf) };
        } else {
          throw new Error('Conteúdo do PDF vazio ou indisponível.');
        }

        loadingTask = pdfjsLib.getDocument({
          ...source,
          useWorkerFetch: false,
        });
        loadedDoc = await loadingTask.promise;

        if (cancelled) {
          await loadedDoc.cleanup().catch(() => {});
          await loadingTask.destroy().catch(() => {});
          return;
        }
        setPdfDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
      } catch (err) {
        if (!cancelled) {
          console.warn('PDF.js render warning:', err);
          setRenderError(
            err instanceof Error
              ? err.message
              : 'Não foi possível renderizar o PDF diretamente na tela.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingPdf(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (loadedDoc) {
        loadedDoc.cleanup().catch(() => {});
      }
      if (loadingTask) {
        loadingTask.destroy().catch(() => {});
      }
    };
  }, [dataUrl, blobUrl]);

  // Render all pages into canvas elements inside containerRef
  useEffect(() => {
    const container = containerRef.current;
    if (!pdfDoc || !container || useNativeFallback) return;

    let cancelled = false;
    const renderTasks: Array<{ cancel: () => void }> = [];

    const renderAllPages = async () => {
      setRenderingPages(true);
      container.innerHTML = '';

      const availableWidth = Math.max(280, (container.clientWidth || 720) - 24);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      try {
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (cancelled) break;

          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) break;

          const baseViewport = page.getViewport({ scale: 1 });
          const fitScale = availableWidth / baseViewport.width;
          const displayScale = Math.max(0.4, Math.min(3.5, fitScale * zoom));
          const viewport = page.getViewport({ scale: displayScale });

          const pageWrapper = document.createElement('div');
          pageWrapper.className =
            'relative bg-white rounded-lg shadow-xl overflow-hidden border border-zinc-800 mx-auto';
          pageWrapper.style.width = `${Math.floor(viewport.width)}px`;
          pageWrapper.style.maxWidth = '100%';

          const pageBadge = document.createElement('div');
          pageBadge.className =
            'bg-zinc-900/90 text-zinc-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 border-b border-zinc-800 flex items-center justify-between';
          pageBadge.textContent = `Página ${pageNum} de ${pdfDoc.numPages}`;
          pageWrapper.appendChild(pageBadge);

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'block bg-white';
          pageWrapper.appendChild(canvas);

          container.appendChild(pageWrapper);

          if (ctx) {
            const task = page.render({
              canvasContext: ctx,
              canvas,
              viewport,
              transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
            });
            renderTasks.push(task);
            await task.promise;
          }
        }
      } catch (err: unknown) {
        const name = (err as { name?: string })?.name || '';
        if (!cancelled && name !== 'RenderingCancelledException') {
          console.warn('PDF page render error:', err);
          setRenderError('Erro ao desenhar páginas do PDF.');
        }
      } finally {
        if (!cancelled) {
          setRenderingPages(false);
        }
      }
    };

    renderAllPages();

    return () => {
      cancelled = true;
      renderTasks.forEach((t) => {
        try {
          t.cancel();
        } catch {
          // Ignore cancel error
        }
      });
    };
  }, [pdfDoc, zoom, useNativeFallback]);

  if (useNativeFallback) {
    const fallbackSrc = blobUrl || dataUrl;
    return (
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[11px] text-zinc-400">
            Visualização alternativa do navegador
          </span>
          <button
            type="button"
            onClick={() => setUseNativeFallback(false)}
            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-[11px] font-bold uppercase"
          >
            Voltar ao Leitor Integrado
          </button>
        </div>
        <iframe
          src={fallbackSrc}
          title={title}
          className="w-full h-[68vh] rounded-xl bg-white border border-zinc-800"
        />
      </div>
    );
  }

  if (loadingPdf) {
    return (
      <div className="flex flex-col items-center gap-3 text-amber-400 py-14">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-xs font-bold uppercase">
          Preparando páginas do PDF...
        </span>
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="text-center space-y-4 py-10 max-w-md mx-auto">
        <AlertTriangle className="w-9 h-9 text-amber-400 mx-auto" />
        <div className="space-y-1">
          <p className="text-sm text-red-300 font-semibold">{renderError}</p>
          <p className="text-xs text-zinc-400">
            Você pode tentar o modo alternativo do navegador ou baixar o arquivo PDF para abrir no seu dispositivo.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setUseNativeFallback(true)}
            className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold uppercase"
          >
            Tentar Modo Alternativo
          </button>
          {(blobUrl || dataUrl) && (
            <a
              href={blobUrl || dataUrl}
              download={fileName}
              className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar PDF</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {/* PDF Toolbar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-900/95 border border-zinc-800 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs text-zinc-300 font-semibold">
          <FileText className="w-4 h-4 text-red-400 shrink-0" />
          <span>
            {numPages} {numPages === 1 ? 'página' : 'páginas'}
          </span>
          {renderingPages && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Renderizando...</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(2))))}
            disabled={zoom <= 0.6}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200"
            title="Diminuir zoom"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono text-zinc-300 min-w-[46px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.2).toFixed(2))))}
            disabled={zoom >= 2.4}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200"
            title="Aumentar zoom"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300"
              title="Zoom padrão (100%)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Rendered Pages Canvas Stack */}
      <div
        ref={containerRef}
        className="w-full space-y-4 pb-2"
      />
    </div>
  );
}
