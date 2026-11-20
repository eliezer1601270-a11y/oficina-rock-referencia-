import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Smartphone, Cloud, X, Image as ImageIcon, Info } from 'lucide-react';

interface PhotoSourcePickerProps {
  onSelectFiles: (files: File[]) => void | Promise<void>;
  multiple?: boolean;
  disabled?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
}

export const PhotoSourcePicker: React.FC<PhotoSourcePickerProps> = ({
  onSelectFiles,
  multiple = false,
  disabled = false,
  title = 'Escolher origem da foto',
  subtitle = 'Selecione se deseja enviar da Galeria Nativa do Smartphone ou do Google Fotos.',
  className = '',
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const nativeGalleryInputRef = useRef<HTMLInputElement>(null);
  const googlePhotosInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = async (fileList: FileList | null, inputEl: HTMLInputElement | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    if (inputEl) {
      inputEl.value = '';
    }
    setIsOpen(false);
    await onSelectFiles(files);
  };

  return (
    <>
      {children ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
          className={className || (disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}
        >
          {children}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(true)}
          className={
            className ||
            'inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-bold text-zinc-200 transition-colors disabled:opacity-50'
          }
        >
          <ImageIcon className="w-4 h-4 text-amber-400" />
          <span>{multiple ? 'Selecionar Fotos' : 'Selecionar Foto'}</span>
        </button>
      )}

      {/* Inputs ocultos preservando o gesto direto do usuário */}
      <input
        ref={nativeGalleryInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files, nativeGalleryInputRef.current)}
      />
      <input
        ref={googlePhotosInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/octet-stream"
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files, googlePhotosInputRef.current)}
      />

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white">{title}</h3>
                  <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-3">
                <button
                  type="button"
                  onClick={() => nativeGalleryInputRef.current?.click()}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-amber-500/50 text-left transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Smartphone className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Galeria Nativa do Smartphone</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {multiple
                        ? 'Selecionar uma ou várias fotos da câmera / galeria do aparelho'
                        : 'Abrir seletor de fotos padrão do seu celular ou computador'}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => googlePhotosInputRef.current?.click()}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-blue-500/50 text-left transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Cloud className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Google Fotos / Arquivos na Nuvem</p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {multiple
                        ? 'Abrir gerenciador para escolher fotos em lote do Google Fotos ou Drive'
                        : 'Abrir gerenciador para selecionar fotos do Google Fotos ou nuvem'}
                    </p>
                  </div>
                </button>

                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-[11px] text-zinc-400">
                  <Info className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                  <span>
                    No celular Android, caso abra a lista de pastas, toque em{' '}
                    <strong className="text-zinc-300">Procurar / ☰</strong> e escolha{' '}
                    <strong className="text-zinc-300">Google Fotos</strong> ou{' '}
                    <strong className="text-zinc-300">Galeria</strong>.
                  </span>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
