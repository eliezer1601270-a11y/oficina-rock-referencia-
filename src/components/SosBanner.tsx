import { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  MapPin,
  Phone,
  CheckCircle2,
  ChevronRight,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { SOSAlert, User, getMemberDisplayName } from '../types';
import { StorageService, playSound, unlockAudioContext } from '../services/storage';

interface SosBannerProps {
  currentUser: User | null;
  onNavigateToSos: () => void;
}

export default function SosBanner({ currentUser, onNavigateToSos }: SosBannerProps) {
  const [activeAlerts, setActiveAlerts] = useState<SOSAlert[]>([]);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const lastAlertKeyRef = useRef<string>('');

  const reloadAlerts = () => {
    const alerts = StorageService.getSOSAlerts().filter((a) => a.status !== 'resolved');
    setActiveAlerts(alerts);
    if (alerts.length > 0) {
      const nextKey = alerts.map((a) => a.id).join('|');
      if (nextKey !== lastAlertKeyRef.current) {
        setIsDismissed(false);
      }
    }
  };

  useEffect(() => {
    reloadAlerts();
    const handleDataChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (!customEvent.detail?.key || customEvent.detail.key.includes('sos')) {
        reloadAlerts();
      }
    };
    window.addEventListener('oficina_data_changed', handleDataChange);
    return () => window.removeEventListener('oficina_data_changed', handleDataChange);
  }, []);

  // Unlock browser AudioContext on first user interaction so background SOS alerts can chime
  useEffect(() => {
    const unlock = () => {
      unlockAudioContext();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const canReceiveSos = Boolean(currentUser && currentUser.status === 'active' && currentUser.sosApproved);
  const activeKey = activeAlerts.map((a) => a.id).join('|');

  // Play siren immediately on new/active SOS and repeat periodically while active & unmuted
  useEffect(() => {
    if (!canReceiveSos || activeAlerts.length === 0 || isMuted) {
      lastAlertKeyRef.current = activeKey;
      return;
    }

    lastAlertKeyRef.current = activeKey;
    playSound('siren');

    const interval = setInterval(() => {
      playSound('siren');
    }, 7000);

    return () => clearInterval(interval);
  }, [canReceiveSos, activeAlerts.length, activeKey, isMuted]);

  if (!canReceiveSos || activeAlerts.length === 0 || isDismissed) return null;

  const latest = activeAlerts[0];

  const handleImComing = () => {
    if (!currentUser) return;
    const all = StorageService.getSOSAlerts();
    const updated = all.map((a) => {
      if (a.id === latest.id) {
        const already = a.responders.some((r) => r.memberId === currentUser.id);
        const responders = already
          ? a.responders
          : [
              ...a.responders,
              { memberId: currentUser.id, memberName: getMemberDisplayName(currentUser), etaMinutes: 15 },
            ];
        return { ...a, status: 'in_progress' as const, responders };
      }
      return a;
    });
    StorageService.setSOSAlerts(updated);
    playSound('success');
  };

  const mapLink =
    latest.latitude && latest.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${latest.latitude},${latest.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(latest.locationAddress)}`;

  return (
    <div className="bg-red-950/90 border-b border-red-600/80 px-4 py-3 text-white backdrop-blur-md sticky top-0 z-50 animate-pulse-slow">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center shrink-0 shadow-lg shadow-red-900/50">
            <AlertTriangle className="w-6 h-6 text-yellow-300 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-rock text-xs uppercase tracking-wider bg-red-600 px-2 py-0.5 rounded text-black font-bold">
                ALERTA SOS NA ESTRADA
              </span>
              <span className="text-sm font-semibold text-yellow-400">
                {latest.memberName}
                {latest.memberMotorcycle ? ` (${latest.memberMotorcycle})` : ''}
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{latest.description}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-red-400" />
                {latest.locationAddress}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => {
              unlockAudioContext();
              const nextMuted = !isMuted;
              setIsMuted(nextMuted);
              if (!nextMuted) {
                playSound('siren');
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
              isMuted
                ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-amber-400'
                : 'bg-red-700 border-red-400 text-white hover:bg-red-600'
            }`}
            title={isMuted ? 'Ativar aviso sonoro do SOS' : 'Silenciar aviso sonoro temporariamente'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-zinc-400" /> : <Volume2 className="w-3.5 h-3.5 text-yellow-300" />}
            <span>{isMuted ? 'Som Mudo' : 'Som Ativo'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              unlockAudioContext();
              playSound('siren');
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded bg-zinc-900 border border-zinc-700 hover:border-amber-400 text-amber-300 transition-colors"
            title="Testar sirene de alerta SOS"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Testar</span>
          </button>

          <a
            href={mapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-zinc-900 border border-zinc-700 hover:border-yellow-400 text-yellow-400 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" />
            Ver no Maps
          </a>

          <a
            href={`tel:${latest.memberPhone.replace(/\D/g, '')}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-200 transition-colors"
          >
            <Phone className="w-3.5 h-3.5 text-green-400" />
            Ligar
          </a>

          {currentUser && (
            <button
              type="button"
              onClick={handleImComing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded bg-amber-500 hover:bg-amber-400 text-black transition-colors shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Estou a caminho!
            </button>
          )}

          <button
            type="button"
            onClick={onNavigateToSos}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:text-white"
          >
            Painel SOS
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 text-zinc-400 hover:text-white ml-1"
            title="Fechar aviso temporariamente"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
