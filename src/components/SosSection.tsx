import { useState } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  Wrench, 
  Flame, 
  HeartHandshake, 
  Fuel, 
  Activity, 
  Navigation, 
  UserCheck, 
  UserX, 
  ShieldCheck, 
  Lock,
  Plus,
  Trash2
} from 'lucide-react';
import { SOSAlert, SOSType, User, getMemberDisplayName } from '../types';
import { StorageService, playSound } from '../services/storage';

interface SosSectionProps {
  alerts: SOSAlert[];
  users: User[];
  currentUser: User | null;
  onUpdateAlerts: (alerts: SOSAlert[]) => void;
  onUpdateUsers: (users: User[]) => void;
  onOpenAuth: () => void;
}

export default function SosSection({
  alerts,
  users,
  currentUser,
  onUpdateAlerts,
  onUpdateUsers,
  onOpenAuth,
}: SosSectionProps) {
  const [isTriggering, setIsTriggering] = useState(false);
  const [selectedType, setSelectedType] = useState<SOSType>('mechanical');
  const [description, setDescription] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [coords, setCoords] = useState<{ lat?: number; lng?: number }>({});
  const [gpsStatus, setGpsStatus] = useState<string>('');
  const [confirmDeleteAlertId, setConfirmDeleteAlertId] = useState<string | null>(null);
  const [sosSyncError, setSosSyncError] = useState('');
  const [isSavingSos, setIsSavingSos] = useState(false);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.email?.toLowerCase() === 'eliezerrmartins@gmail.com';
  const isApproved = Boolean(currentUser && currentUser.status === 'active' && currentUser.sosApproved);

  const sosTypesConfig: { [key in SOSType]: { label: string; icon: any; color: string } } = {
    mechanical: { label: 'Pane Mecânica / Elétrica', icon: Wrench, color: 'text-amber-400' },
    tire: { label: 'Pneu Furado', icon: Wrench, color: 'text-yellow-400' },
    fuel: { label: 'Pane Seca (Sem Gasolina)', icon: Fuel, color: 'text-orange-400' },
    accident: { label: 'Acidente / Queda', icon: AlertTriangle, color: 'text-red-500' },
    medical: { label: 'Emergência Médica', icon: Activity, color: 'text-red-400' },
    support: { label: 'Apoio em Comboio', icon: HeartHandshake, color: 'text-blue-400' },
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('GPS não suportado pelo navegador.');
      return;
    }
    setGpsStatus('Obtendo coordenadas do satélite...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus(`GPS capturado: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      (err) => {
        setGpsStatus('Não foi possível obter GPS. Digite o local manualmente.');
        console.warn('Geolocation error', err);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSendSos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || isSavingSos) return;
    if (!description.trim() && !customLocation.trim()) return;
    setSosSyncError('');
    setIsSavingSos(true);

    const newAlert: SOSAlert = {
      id: `sos-${Date.now()}`,
      memberId: currentUser.id,
      memberName: getMemberDisplayName(currentUser),
      memberPhone: currentUser.phone,
      memberMotorcycle: currentUser.motorcycle,
      bloodType: currentUser.bloodType,
      type: selectedType,
      description: description.trim() || 'Necessito de apoio imediato na estrada!',
      latitude: coords.lat,
      longitude: coords.lng,
      locationAddress: customLocation.trim() || (coords.lat ? `Coordenadas: ${coords.lat.toFixed(5)}, ${coords.lng?.toFixed(5)}` : 'Rodovia / Local a confirmar'),
      createdAt: new Date().toISOString(),
      status: 'active',
      responders: [],
    };

    const updated = [newAlert, ...alerts];
    try {
      await StorageService.saveSOSAlertsConfirmed(updated);
      onUpdateAlerts(updated);
      playSound('siren');
      setDescription('');
      setCustomLocation('');
      setCoords({});
      setGpsStatus('');
      setIsTriggering(false);
    } catch (err) {
      setSosSyncError(err instanceof Error ? err.message : 'Falha ao sincronizar alerta SOS na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingSos(false);
    }
  };

  const handleRespondToSos = async (alertId: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    if (isSavingSos) return;
    setSosSyncError('');
    setIsSavingSos(true);

    const updated = alerts.map((a) => {
      if (a.id === alertId) {
        const already = a.responders.some((r) => r.memberId === currentUser.id);
        const responders = already
          ? a.responders
          : [...a.responders, { memberId: currentUser.id, memberName: getMemberDisplayName(currentUser), etaMinutes: 20 }];
        return { ...a, status: 'in_progress' as const, responders };
      }
      return a;
    });

    try {
      await StorageService.saveSOSAlertsConfirmed(updated);
      onUpdateAlerts(updated);
      playSound('success');
    } catch (err) {
      setSosSyncError(err instanceof Error ? err.message : 'Falha ao confirmar apoio na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingSos(false);
    }
  };

  const handleResolveSos = async (alertId: string) => {
    if (isSavingSos) return;
    setSosSyncError('');
    setIsSavingSos(true);
    const updated = alerts.map((a) =>
      a.id === alertId ? { ...a, status: 'resolved' as const } : a
    );
    try {
      await StorageService.saveSOSAlertsConfirmed(updated);
      onUpdateAlerts(updated);
      playSound('beep');
    } catch (err) {
      setSosSyncError(err instanceof Error ? err.message : 'Falha ao encerrar chamado SOS na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingSos(false);
    }
  };

  const handleToggleMemberSosApproval = async (userId: string) => {
    if (!isAdmin || isSavingSos) return;
    setSosSyncError('');
    setIsSavingSos(true);
    const updated = users.map((u) =>
      u.id === userId ? { ...u, sosApproved: !u.sosApproved } : u
    );
    try {
      await StorageService.saveUsersConfirmed(updated);
      onUpdateUsers(updated);
      playSound('click');
    } catch (err) {
      setSosSyncError(err instanceof Error ? err.message : 'Falha ao sincronizar liberação SOS.');
      playSound('beep');
    } finally {
      setIsSavingSos(false);
    }
  };

  const handleDeleteSos = (alertId: string) => {
    if (!isAdmin) return;
    setConfirmDeleteAlertId(alertId);
  };

  const handleConfirmDeleteSos = async () => {
    if (!isAdmin || !confirmDeleteAlertId || isSavingSos) return;
    setSosSyncError('');
    setIsSavingSos(true);
    const updated = alerts.filter((a) => a.id !== confirmDeleteAlertId);
    try {
      await StorageService.saveSOSAlertsConfirmed(updated);
      onUpdateAlerts(updated);
      setConfirmDeleteAlertId(null);
      playSound('click');
    } catch (err) {
      setSosSyncError(err instanceof Error ? err.message : 'Falha ao excluir chamado SOS na nuvem.');
      playSound('beep');
    } finally {
      setIsSavingSos(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <span className="text-xs font-bold text-red-500 uppercase tracking-widest block flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />
            <span>Rede de Socorro Mútuo · Estrada & Irmandade</span>
          </span>
          <h2 className="font-rock text-3xl font-bold uppercase text-white tracking-wide">
            Sistema de Notificações SOS
          </h2>
        </div>

        {isApproved && (
          <button
            onClick={() => {
              setIsTriggering(true);
              handleCaptureGps();
            }}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-rock text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-red-900/50 animate-bounce-short"
          >
            <AlertTriangle className="w-4 h-4 text-yellow-300" />
            <span>Disparar Alerta SOS</span>
          </button>
        )}
      </div>

      {sosSyncError && (
        <div className="p-3 bg-red-950/70 border border-red-700/70 rounded-xl text-xs text-red-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{sosSyncError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSosSyncError('')}
            className="text-red-300 hover:text-white font-bold uppercase text-[10px]"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Permission check notice */}
      {!currentUser && (
        <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-6 text-center space-y-3">
          <Lock className="w-8 h-8 text-amber-400 mx-auto" />
          <h3 className="font-rock text-lg uppercase font-bold text-white">
            Acesso Restrito aos Integrantes Cadastrados
          </h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            O sistema SOS é exclusivo para irmãos de colete autorizados pelo Administrador Geral do Oficina do Rock.
          </p>
          <button
            onClick={onOpenAuth}
            className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase rounded-lg"
          >
            Fazer Login
          </button>
        </div>
      )}

      {currentUser && !currentUser.sosApproved && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-6 text-center space-y-2">
          <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
          <h3 className="font-rock text-lg uppercase font-bold text-amber-400">
            Acesso ao SOS sob Liberação do Administrador
          </h3>
          <p className="text-xs text-zinc-300 max-w-lg mx-auto">
            Olá, <strong>{getMemberDisplayName(currentUser)}</strong>. Seu cadastro no motoclube foi recebido, porém o acesso ao canal de emergência SOS requer liberação oficial do Administrador Geral (<span className="text-amber-400 font-mono">eliezerrmartins@gmail.com</span>) após validação do colete.
          </p>
        </div>
      )}

      {/* Trigger Modal */}
      {isTriggering && isApproved && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#141418] border-2 border-red-600 rounded-2xl w-full max-w-lg p-6 space-y-5 my-auto shadow-2xl shadow-red-950">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-yellow-400 animate-pulse" />
                <h3 className="font-rock text-xl font-bold uppercase text-white">
                  Disparar Alerta SOS na Estrada
                </h3>
              </div>
              <button
                onClick={() => setIsTriggering(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendSos} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-2">
                  Tipo de Emergência *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(sosTypesConfig) as SOSType[]).map((key) => {
                    const cfg = sosTypesConfig[key];
                    const Icon = cfg.icon;
                    const isSelected = selectedType === key;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedType(key)}
                        className={`p-3 rounded-xl border text-left text-xs font-semibold flex items-center gap-2 transition-all ${
                          isSelected
                            ? 'bg-red-950/80 border-red-500 text-white shadow-md'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${cfg.color}`} />
                        <span className="leading-tight">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  Localização / Rodovia / Referência *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Rod. Bunjiro Nakao km 62, sentido Ibiúna"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                />

                <div className="mt-2 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleCaptureGps}
                    className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Atualizar Coordenadas GPS</span>
                  </button>
                  {gpsStatus && <span className="text-[11px] text-zinc-400">{gpsStatus}</span>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase mb-1">
                  O que aconteceu? (Detalhes breves)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ex: Pneu traseiro furou por parafuso, estou em acostamento seguro..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-xs text-zinc-300 space-y-1">
                <span className="font-bold text-yellow-400 block uppercase">
                  Informações Transmitidas Automaticamente:
                </span>
                <p>Nome: <strong>{getMemberDisplayName(currentUser)}</strong> · Moto: <strong>{currentUser?.motorcycle || 'Não informada'}</strong></p>
                <p>Tipo Sanguíneo: <strong>{currentUser?.bloodType || 'Não informado'}</strong> · Tel: <strong>{currentUser?.phone}</strong></p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsTriggering(false)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold uppercase font-rock flex items-center gap-1.5 shadow-lg shadow-red-950"
                >
                  <AlertTriangle className="w-4 h-4 text-yellow-300" />
                  Transmitir Alerta para Todos os Integrantes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active Alerts List (Restricted to Approved Members) */}
      {isApproved && (
        <div className="space-y-4">
          <h3 className="font-rock text-xl uppercase font-bold text-white flex items-center gap-2">
            <span>Ocorrências & Chamados SOS</span>
            <span className="text-xs bg-zinc-800 px-2.5 py-0.5 rounded-full text-zinc-300 font-sans">
              {alerts.length} registros
            </span>
          </h3>

        {alerts.length === 0 ? (
          <div className="bg-[#121216] border border-zinc-800 rounded-xl p-8 text-center text-zinc-400 text-xs">
            Nenhum alerta de emergência ativo no momento. Todos os irmãos rodando em segurança!
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => {
              const cfg = sosTypesConfig[alert.type] || sosTypesConfig.mechanical;
              const Icon = cfg.icon;
              const isResolved = alert.status === 'resolved';
              const isInProgress = alert.status === 'in_progress';

              const mapLink = alert.latitude && alert.longitude
                ? `https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alert.locationAddress)}`;

              return (
                <div
                  key={alert.id}
                  className={`border rounded-2xl p-6 transition-all ${
                    isResolved
                      ? 'bg-zinc-950/60 border-zinc-800/80 opacity-70'
                      : isInProgress
                      ? 'bg-amber-950/20 border-amber-500/60 shadow-lg'
                      : 'bg-red-950/30 border-red-600/80 shadow-xl'
                  }`}
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isResolved ? 'bg-zinc-800 text-zinc-400' : 'bg-red-600 text-yellow-300 shadow-md shadow-red-950'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-rock text-lg font-bold text-white uppercase">
                            {alert.memberName}
                          </span>
                          {alert.memberMotorcycle && (
                            <span className="text-xs px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-400 font-medium">
                              {alert.memberMotorcycle}
                            </span>
                          )}
                          {alert.bloodType && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-900/60 text-red-200">
                              Sangue: {alert.bloodType}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-zinc-400">
                          {cfg.label} · {new Date(alert.createdAt).toLocaleTimeString('pt-BR')} de {new Date(alert.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        isResolved
                          ? 'bg-zinc-800 text-zinc-400'
                          : isInProgress
                          ? 'bg-amber-400 text-black font-extrabold animate-pulse'
                          : 'bg-red-600 text-white font-extrabold animate-pulse'
                      }`}>
                        {isResolved ? 'Resolvido' : isInProgress ? 'Socorro a Caminho' : 'Aguardando Apoio'}
                      </span>
                    </div>
                  </div>

                  <div className="py-4 space-y-3">
                    <p className="text-sm text-zinc-200 leading-relaxed font-medium">
                      "{alert.description}"
                    </p>

                    <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-between flex-wrap gap-2 text-xs">
                      <span className="flex items-center gap-1.5 text-zinc-300">
                        <MapPin className="w-4 h-4 text-red-400 shrink-0" />
                        <span>{alert.locationAddress}</span>
                      </span>

                      <a
                        href={mapLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase text-[10px] tracking-wider flex items-center gap-1"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Traçar Rota GPS</span>
                      </a>
                    </div>

                    {/* Responders List */}
                    {alert.responders.length > 0 && (
                      <div className="text-xs text-zinc-400 flex items-center gap-2 flex-wrap pt-1">
                        <span className="font-bold text-amber-400">Irmãos prestando socorro:</span>
                        {alert.responders.map((r, idx) => (
                          <span key={idx} className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-zinc-200 font-medium">
                            {r.memberName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between flex-wrap gap-2">
                    <a
                      href={`tel:${alert.memberPhone.replace(/\D/g, '')}`}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5 text-green-400" />
                      <span>Ligar para {alert.memberPhone}</span>
                    </a>

                    <div className="flex items-center gap-2">
                      {!isResolved && currentUser && (
                        <button
                          onClick={() => handleRespondToSos(alert.id)}
                          className="px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase font-rock flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Estou Indo Socorrer!</span>
                        </button>
                      )}

                      {!isResolved && (isAdmin || currentUser?.id === alert.memberId) && (
                        <button
                          onClick={() => handleResolveSos(alert.id)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
                        >
                          Marcar como Resolvido
                        </button>
                      )}

                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteSos(alert.id)}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-400 transition-colors"
                          title="Excluir Registro SOS (Admin)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      )}

      {/* Admin Authorization Panel */}
      {isAdmin && (
        <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <h3 className="font-rock text-xl uppercase font-bold text-white">
                Controle de Liberação do SOS (Administrador Geral)
              </h3>
            </div>
            <span className="text-xs text-zinc-400">
              Autorize os integrantes que podem disparar e receber socorro
            </span>
          </div>

          <p className="text-xs text-zinc-400">
            Como administrador geral (<span className="text-amber-400 font-mono">eliezerrmartins@gmail.com</span>), você gerencia quais integrantes do motoclube têm acesso liberado à rede de socorro na estrada.
          </p>

          <div className="divide-y divide-zinc-800/80">
            {users.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src={u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'}
                    alt={getMemberDisplayName(u)}
                    className="w-9 h-9 rounded-full object-cover border border-zinc-700"
                  />
                  <div>
                    <span className="text-sm font-semibold text-white block">{getMemberDisplayName(u)}</span>
                    <span className="text-xs text-zinc-400 block">{u.motorcycle ? `${u.motorcycle} · ` : ''}{u.phone}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    u.sosApproved ? 'bg-green-950 text-green-300 border border-green-800' : 'bg-red-950 text-red-300 border border-red-800'
                  }`}>
                    {u.sosApproved ? 'Liberado para SOS' : 'Acesso Bloqueado'}
                  </span>

                  <button
                    onClick={() => handleToggleMemberSosApproval(u.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-colors ${
                      u.sosApproved
                        ? 'bg-zinc-800 hover:bg-red-950 text-zinc-300 hover:text-red-300'
                        : 'bg-amber-400 hover:bg-amber-300 text-black'
                    }`}
                  >
                    {u.sosApproved ? 'Revogar Liberação' : 'Liberar Acesso SOS'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirm Delete SOS Modal */}
      {confirmDeleteAlertId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="bg-[#121216] border border-red-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              <h4 className="font-rock text-base font-bold uppercase text-white">
                Excluir Registro de SOS
              </h4>
            </div>
            <p className="text-xs text-zinc-300">
              Deseja excluir este registro de chamado SOS permanentemente?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteAlertId(null)}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSos}
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
