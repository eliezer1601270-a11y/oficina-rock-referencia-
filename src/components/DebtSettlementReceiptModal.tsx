import { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { playSound } from '../services/storage';
import { processReceiptFile } from '../services/imageUtils';
import { PhotoSourcePicker } from './PhotoSourcePicker';
import { FeeSettlementStatus } from '../types';

export interface ReceiptDraft {
  url: string;
  fileName: string;
  uploadedAt: string;
}

interface ReceiptAttachmentControlProps {
  receipt: ReceiptDraft | null;
  onChange: (next: ReceiptDraft | null) => void;
  label?: string;
}

export function ReceiptAttachmentControl({
  receipt,
  onChange,
  label = 'Anexar Comprovante (Foto ou PDF)',
}: ReceiptAttachmentControlProps) {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const processSelectedReceiptFile = async (file: File) => {
    setError('');
    setIsProcessing(true);
    try {
      const { dataUrl, fileName } = await processReceiptFile(file);
      onChange({
        url: dataUrl,
        fileName,
        uploadedAt: new Date().toISOString(),
      });
      playSound('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo de comprovante.');
      playSound('beep');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processSelectedReceiptFile(file);
    e.target.value = '';
  };

  const isPdf = Boolean(receipt?.url.startsWith('data:application/pdf'));

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-zinc-300 uppercase">
        {label}
      </label>

      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <PhotoSourcePicker
          disabled={isProcessing}
          title="Origem da Foto do Comprovante"
          subtitle="Escolha enviar o comprovante da galeria do dispositivo ou do Google Fotos."
          onSelectFiles={(files) => {
            if (files[0]) {
              void processSelectedReceiptFile(files[0]);
            }
          }}
        >
          <div className="w-full px-3 py-2 bg-zinc-950 hover:bg-zinc-900 border border-dashed border-amber-400/50 rounded-lg text-[11px] font-bold uppercase text-amber-300 flex items-center justify-center gap-1.5 transition-colors">
            {isProcessing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>Foto (Dispositivo / Google)</span>
          </div>
        </PhotoSourcePicker>

        <button
          type="button"
          disabled={isProcessing}
          onClick={() => pdfInputRef.current?.click()}
          className="px-3 py-2 bg-zinc-950 hover:bg-zinc-900 disabled:opacity-60 border border-dashed border-sky-400/50 rounded-lg text-[11px] font-bold uppercase text-sky-300 flex items-center justify-center gap-1.5 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Anexar PDF</span>
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-red-400 font-semibold">{error}</p>
      )}

      {receipt && (
        <div className="p-2.5 bg-zinc-950 border border-emerald-500/40 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {isPdf ? (
              <div className="w-10 h-10 rounded-lg bg-red-950/60 border border-red-700/60 flex flex-col items-center justify-center text-red-300 shrink-0">
                <FileText className="w-4 h-4" />
                <span className="text-[8px] font-bold">PDF</span>
              </div>
            ) : (
              <img
                src={receipt.url}
                alt={receipt.fileName}
                className="w-10 h-10 rounded-lg object-cover border border-zinc-700 shrink-0"
              />
            )}
            <div className="min-w-0">
              <span className="text-xs font-bold text-emerald-300 flex items-center gap-1 truncate">
                <Paperclip className="w-3 h-3 shrink-0" />
                <span className="truncate">{receipt.fileName}</span>
              </span>
              <span className="text-[10px] text-zinc-400 block">
                Comprovante pronto para salvar
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-400 border border-zinc-800 shrink-0"
            title="Remover comprovante"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export type SettlementModalAction = Extract<
  FeeSettlementStatus,
  'paid' | 'forgiven' | 'cancelled' | 'written_off'
>;

export interface SettlementConfirmPayload {
  notes: string;
  receipt: ReceiptDraft | null;
  settlementStatus: SettlementModalAction;
  reason: string;
  exerciseYear: number;
}

interface DebtSettlementReceiptModalProps {
  isOpen: boolean;
  title: string;
  itemLabel: string;
  memberName: string;
  amount: number;
  initialNotes?: string;
  initialReceipt?: ReceiptDraft | null;
  initialSettlementStatus?: SettlementModalAction;
  initialExerciseYear?: number;
  allowWriteOffModes?: boolean;
  onConfirm: (data: SettlementConfirmPayload) => Promise<void> | void;
  onCancel: () => void;
}

const SETTLEMENT_OPTIONS: Array<{
  value: SettlementModalAction;
  label: string;
  hint: string;
  colorClass: string;
}> = [
  {
    value: 'paid',
    label: 'PAGO',
    hint: 'Quitação normal com entrada de receita no caixa.',
    colorClass: 'bg-emerald-500/20 border-emerald-400 text-emerald-300',
  },
  {
    value: 'written_off',
    label: 'BAIXADO',
    hint: 'Baixa administrativa de cobrança (não gera receita).',
    colorClass: 'bg-sky-500/20 border-sky-400 text-sky-300',
  },
  {
    value: 'forgiven',
    label: 'PERDOADO',
    hint: 'Perdão de débito concedido ao integrante (não gera receita).',
    colorClass: 'bg-amber-500/20 border-amber-400 text-amber-300',
  },
  {
    value: 'cancelled',
    label: 'CANCELADO',
    hint: 'Cancelamento de cobrança indevida (não gera receita).',
    colorClass: 'bg-red-500/20 border-red-400 text-red-300',
  },
];

export default function DebtSettlementReceiptModal({
  isOpen,
  title,
  itemLabel,
  memberName,
  amount,
  initialNotes = '',
  initialReceipt = null,
  initialSettlementStatus = 'paid',
  initialExerciseYear = new Date().getFullYear(),
  allowWriteOffModes = false,
  onConfirm,
  onCancel,
}: DebtSettlementReceiptModalProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [receipt, setReceipt] = useState<ReceiptDraft | null>(initialReceipt);
  const [settlementStatus, setSettlementStatus] = useState<SettlementModalAction>(initialSettlementStatus);
  const [reason, setReason] = useState('');
  const [exerciseYear, setExerciseYear] = useState<number>(initialExerciseYear);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNotes(initialNotes || '');
      setReceipt(initialReceipt || null);
      setSettlementStatus(initialSettlementStatus || 'paid');
      setReason('');
      setExerciseYear(initialExerciseYear || new Date().getFullYear());
      setIsSubmitting(false);
      setSubmitError('');
    }
  }, [isOpen, initialNotes, initialReceipt, initialSettlementStatus, initialExerciseYear]);

  if (!isOpen) return null;

  const requiresReason = allowWriteOffModes && settlementStatus !== 'paid';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError('');
    if (requiresReason && !reason.trim()) {
      setSubmitError('Informe o motivo oficial para registrar a baixa, perdão ou cancelamento.');
      playSound('beep');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        notes: notes.trim(),
        receipt,
        settlementStatus: allowWriteOffModes ? settlementStatus : 'paid',
        reason: reason.trim() || notes.trim() || 'Pagamento confirmado',
        exerciseYear: Number(exerciseYear) || new Date().getFullYear(),
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a sincronização com a nuvem. Os dados preenchidos foram preservados.'
      );
      playSound('beep');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#121216] border border-emerald-500/50 rounded-2xl w-full max-w-lg p-5 sm:p-6 space-y-4 my-auto shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-rock text-lg font-bold uppercase text-white">
              {title}
            </h3>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="text-zinc-400 hover:text-white p-1 disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3 text-xs">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase text-zinc-400 block">
              {memberName} · Exercício {exerciseYear}
            </span>
            <span className="font-bold text-white text-sm block truncate">
              {itemLabel}
            </span>
          </div>
          <span className="font-mono text-lg font-bold text-emerald-400 shrink-0">
            R$ {amount.toFixed(2)}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {allowWriteOffModes && (
            <div className="space-y-2">
              <label className="block font-bold text-zinc-300 uppercase">
                Tipo de Registro / Estado Final *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SETTLEMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setSettlementStatus(opt.value)}
                    className={`py-2 px-2.5 rounded-lg border text-[11px] font-bold uppercase transition-colors ${
                      settlementStatus === opt.value
                        ? opt.colorClass
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-zinc-400">
                {SETTLEMENT_OPTIONS.find((o) => o.value === settlementStatus)?.hint}
              </p>
            </div>
          )}

          {allowWriteOffModes && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Exercício
                </label>
                <input
                  type="number"
                  min={2008}
                  max={2100}
                  value={exerciseYear}
                  onChange={(e) => setExerciseYear(Number(e.target.value) || new Date().getFullYear())}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-zinc-300 uppercase mb-1">
                  Motivo da Operação {requiresReason ? '*' : '(Opcional)'}
                </label>
                <input
                  type="text"
                  maxLength={500}
                  required={requiresReason}
                  placeholder={
                    requiresReason
                      ? 'Ex: Isenção aprovada em reunião / Lançamento duplicado...'
                      : 'Ex: Pago via Pix para tesouraria'
                  }
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-bold text-zinc-300 uppercase mb-1">
              Observações Adicionais (Opcional)
            </label>
            <textarea
              rows={3}
              maxLength={500}
              placeholder="Ex: Quitado via Pix na sede em 14/11, conferido pela tesouraria..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-400"
            />
          </div>

          <ReceiptAttachmentControl
            receipt={receipt}
            onChange={setReceipt}
            label="Anexar Comprovante (Foto ou PDF)"
          />

          {submitError && (
            <div className="p-3 bg-red-950/60 border border-red-700 text-red-200 rounded-lg flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded-lg text-xs font-bold uppercase"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-xs font-bold uppercase font-rock flex items-center gap-1.5 shadow-md shadow-emerald-950/40"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>
                {isSubmitting
                  ? 'Salvando na Nuvem...'
                  : settlementStatus === 'paid' || !allowWriteOffModes
                  ? 'Confirmar Baixa / Pago'
                  : `Confirmar ${SETTLEMENT_OPTIONS.find((o) => o.value === settlementStatus)?.label}`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
