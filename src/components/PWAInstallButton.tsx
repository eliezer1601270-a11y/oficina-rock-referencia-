import { useState } from 'react';
import { Smartphone, Download, X, WifiOff, ExternalLink, Copy, Check } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar';
  onActionDone?: () => void;
}

export function PWAInstallButton({ variant = 'header', onActionDone }: PWAInstallButtonProps) {
  const { isInstallable, isBrowserSession, isIOS, isInIframe, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Only show Download App when opened in a web browser (not already installed PWA or Capacitor APK)
  if (!isBrowserSession) {
    return null;
  }

  const getPublicAppUrl = () => {
    if (typeof window === 'undefined') return 'https://ais-pre-77cpndelgwvk7mcxm44ixn-312435081010.us-west1.run.app/';
    const isDevOrLocal =
      window.location.hostname.includes('ais-dev-') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    return isDevOrLocal
      ? 'https://ais-pre-77cpndelgwvk7mcxm44ixn-312435081010.us-west1.run.app/'
      : `${window.location.origin}/`;
  };

  const handleClickInstall = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        onActionDone?.();
        return;
      }
    }
    setShowGuide(true);
  };

  const handleCopyUrl = async () => {
    const url = getPublicAppUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 3000);
    } catch {
      setCopiedUrl(false);
    }
  };

  const publicAppUrl = getPublicAppUrl();

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          onClick={handleClickInstall}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
          title="Baixar e Instalar Aplicativo no Celular ou Computador"
        >
          <span className="flex items-center gap-2.5">
            <Download className="w-4 h-4 shrink-0" />
            <span>Baixar App</span>
          </span>
          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-black/15">
            Navegador
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClickInstall}
          className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
          title="Baixar e Instalar Aplicativo no Celular ou Computador"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Baixar App</span>
        </button>
      )}

      {showGuide && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#121216] border border-amber-400/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-amber-400" />
                <h3 className="font-rock text-lg font-bold uppercase text-white">
                  Baixar Aplicativo Oficina do Rock
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
              {isInIframe && (
                <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/40 space-y-2">
                  <p className="text-amber-200 font-semibold">
                    Para baixar e instalar diretamente no aparelho, abra o aplicativo direto no navegador:
                  </p>
                  <a
                    href={publicAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-rock font-bold uppercase flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir Link Oficial para Baixar</span>
                  </a>
                </div>
              )}

              {isIOS ? (
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
                  <span className="font-bold text-amber-400 uppercase block">
                    iPhone / iPad (Safari):
                  </span>
                  <p>1. Toque no ícone <strong>Compartilhar</strong> na barra inferior do Safari.</p>
                  <p>2. Role para baixo e toque em <strong>Adicionar à Tela de Início</strong>.</p>
                  <p>3. Confirme em <strong>Adicionar</strong> para instalar o ícone oficial.</p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5">
                  <span className="font-bold text-amber-400 uppercase block">
                    Android / Chrome / Computador:
                  </span>
                  <p>
                    1. No celular Android (Chrome), toque no menu <strong>⋮</strong> (canto superior direito) e selecione{' '}
                    <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.
                  </p>
                  <p>
                    2. No computador (Chrome / Edge), clique no ícone de instalação{' '}
                    <strong>(⊕ / computador)</strong> na barra de endereço do navegador.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="flex-1 py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-bold uppercase flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-green-400">Link Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-amber-400" />
                      <span>Copiar Link do App</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowGuide(false);
                    onActionDone?.();
                  }}
                  className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-rock font-bold uppercase"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 xl:bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black shadow-lg">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Modo Offline — Dados em cache ativos</span>
    </div>
  );
}
