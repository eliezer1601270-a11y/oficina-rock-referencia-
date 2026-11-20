import { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  LogOut,
  MessageSquareText,
  RefreshCw,
  Mail,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  MailCheck,
  ArrowLeft,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { ClubInfo, DEFAULT_CREST_URL, MEMBER_CATEGORIES, MemberCategory, User, getMemberDisplayName } from '../types';
import { StorageService, playSound } from '../services/storage';
import {
  auth,
  validateEmailInput,
  validatePasswordInput,
  signInWithEmailPasswordClean,
  registerWithEmailPasswordClean,
  resendVerificationEmailClean,
  sendPasswordResetClean,
  signInWithGoogleAdaptive,
  signOutCleanly,
  formatAuthError,
} from '../services/firebase';
import { FirestoreSync, SessionResolutionResult } from '../services/firestoreSync';

interface AspirantDraft {
  name: string;
  nickname: string;
  phone: string;
  motorcycle: string;
  emergencyContact: string;
  bloodType: string;
  birthDate: string;
  memberCategory?: MemberCategory;
}

const DRAFT_STORAGE_KEY = 'oficina_pending_aspirant_draft_v1';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  needsGoogleRegistration: boolean;
  needsEmailVerification?: boolean;
  externalError?: string;
  clubInfo: ClubInfo;
  onOpenSupporters?: () => void;
  onResolveFirebaseUser?: (fbUser: FirebaseUser) => Promise<SessionResolutionResult>;
  onSwitchGoogleAccount?: () => Promise<void>;
  onGoogleUserResolved: (user: User) => void;
  onSelectUser: (user: User | null) => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  currentUser,
  firebaseUser,
  needsGoogleRegistration,
  needsEmailVerification = false,
  externalError,
  clubInfo,
  onOpenSupporters,
  onResolveFirebaseUser,
  onSwitchGoogleAccount,
  onGoogleUserResolved,
  onSelectUser,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // E-mail & Senha Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  // Password Reset State
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Google Secondary / Legacy Migration State
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');

  // Pending Registration / Verification State
  const [pendingFirebaseUser, setPendingFirebaseUser] = useState<FirebaseUser | null>(null);
  const [showCompleteReg, setShowCompleteReg] = useState(false);
  const [awaitingEmailVerification, setAwaitingEmailVerification] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [statusNoticeUser, setStatusNoticeUser] = useState<User | null>(null);

  // Aspirant registration fields
  const [regName, setRegName] = useState('');
  const [regNickname, setRegNickname] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regPhone, setRegPhone] = useState('');
  const [regMotorcycle, setRegMotorcycle] = useState('');
  const [regEmergencyContact, setRegEmergencyContact] = useState('');
  const [regBloodType, setRegBloodType] = useState('O+');
  const [regBirthDate, setRegBirthDate] = useState('');
  const [regCategory, setRegCategory] = useState<MemberCategory>('Motociclista');
  const [regSuccess, setRegSuccess] = useState(false);
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);

  const loadSavedDraft = (): AspirantDraft | null => {
    try {
      const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AspirantDraft;
    } catch {
      return null;
    }
  };

  const saveDraft = (draft: AspirantDraft) => {
    try {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage errors
    }
  };

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setAuthError(externalError || '');
    setAuthNotice('');
    setIsEmailLoading(false);
    setIsGoogleLoading(false);
    setIsResetMode(false);
    setResetSuccessMsg('');
    setStatusNoticeUser(null);

    if (firebaseUser && needsEmailVerification) {
      setPendingFirebaseUser(firebaseUser);
      setAwaitingEmailVerification(true);
      setShowCompleteReg(false);
      setRegSuccess(false);
    } else if (firebaseUser && needsGoogleRegistration) {
      const draft = loadSavedDraft();
      setPendingFirebaseUser(firebaseUser);
      setAwaitingEmailVerification(false);
      setShowCompleteReg(true);
      setRegSuccess(false);
      setRegName(draft?.name || firebaseUser.displayName || '');
      setRegNickname(draft?.nickname || '');
      setRegEmail(firebaseUser.email || '');
      if (draft) {
        setRegPhone(draft.phone || '');
        setRegMotorcycle(draft.motorcycle || '');
        setRegEmergencyContact(draft.emergencyContact || '');
        setRegBloodType(draft.bloodType || 'O+');
        setRegBirthDate(draft.birthDate || '');
        setRegCategory(draft.memberCategory || 'Motociclista');
      }
    } else {
      setAwaitingEmailVerification(false);
      setShowCompleteReg(false);
      setPendingFirebaseUser(null);
      setRegSuccess(false);
    }
  }, [isOpen, firebaseUser, needsGoogleRegistration, needsEmailVerification, externalError]);

  if (!isOpen) return null;

  const buildLocalSeed = () => ({
    clubInfo: StorageService.getClubInfo(),
    boardRoles: StorageService.getBoardRoles(),
    users: StorageService.getUsers(),
    events: StorageService.getEvents(),
    forumPosts: StorageService.getForumPosts(),
    sosAlerts: StorageService.getSOSAlerts(),
    fees: StorageService.getFees(),
    expenses: StorageService.getExpenses(),
    tabs: StorageService.getTabs(),
    boardChat: StorageService.getBoardChat(),
    supporters: StorageService.getSupporters(),
  });

  const handleResolvedUserOutcome = async (
    fbUser: FirebaseUser,
    result: SessionResolutionResult
  ) => {
    if (result.needsEmailVerification) {
      setPendingFirebaseUser(fbUser);
      setAwaitingEmailVerification(true);
      setShowCompleteReg(false);
      playSound('beep');
      return;
    }

    setAwaitingEmailVerification(false);

    if (result.needsRegistration) {
      const draft = loadSavedDraft();
      if (draft && draft.name.trim() && draft.phone.trim()) {
        try {
          const created = await FirestoreSync.registerGoogleCandidate(fbUser, draft);
          clearDraft();
          setRegSuccess(true);
          setShowCompleteReg(false);
          setActiveTab('register');
          onGoogleUserResolved(created);
          playSound('success');
          return;
        } catch (regErr) {
          setAuthError(formatAuthError(regErr));
        }
      }
      setPendingFirebaseUser(fbUser);
      setRegName(draft?.name || fbUser.displayName || '');
      setRegEmail(fbUser.email || '');
      setShowCompleteReg(true);
      setRegSuccess(false);
      playSound('beep');
      return;
    }

    if (result.user) {
      clearDraft();
      if (result.user.status === 'pending') {
        setStatusNoticeUser(result.user);
        setAuthError(
          'Seu cadastro já foi recebido e aguarda liberação ou associação pelo Administrador Geral.'
        );
        playSound('beep');
        return;
      }
      if (result.user.status === 'suspended') {
        setStatusNoticeUser(result.user);
        setAuthError('Seu acesso encontra-se suspenso. Fale com a Mesa Diretora.');
        playSound('beep');
        return;
      }

      StorageService.applyRemoteCurrentUser(result.user);
      onSelectUser(result.user);
      onGoogleUserResolved(result.user);
      playSound('success');
      onClose();
    }
  };

  // Primary: E-mail e Senha Login
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');
    setStatusNoticeUser(null);

    const emailErr = validateEmailInput(loginEmail);
    if (emailErr) {
      setAuthError(emailErr);
      playSound('beep');
      return;
    }
    if (!loginPassword) {
      setAuthError('Informe sua senha para entrar.');
      playSound('beep');
      return;
    }

    setIsEmailLoading(true);
    try {
      const cred = await signInWithEmailPasswordClean(loginEmail, loginPassword);
      const fbUser = cred.user;
      const result = onResolveFirebaseUser
        ? await onResolveFirebaseUser(fbUser)
        : await FirestoreSync.resolveUserSession(fbUser, buildLocalSeed());
      await handleResolvedUserOutcome(fbUser, result);
    } catch (err: unknown) {
      console.error('E-mail Sign-In error:', err);
      setAuthError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsEmailLoading(false);
    }
  };

  // Password Reset Flow
  const handleSendPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setResetSuccessMsg('');

    const targetEmail = (resetEmail || loginEmail).trim();
    const emailErr = validateEmailInput(targetEmail);
    if (emailErr) {
      setAuthError(emailErr);
      playSound('beep');
      return;
    }

    setIsSendingReset(true);
    try {
      await sendPasswordResetClean(targetEmail);
      setResetSuccessMsg(
        `Link de redefinição enviado para ${targetEmail.toLowerCase()}. Verifique sua caixa de entrada e spam.`
      );
      playSound('success');
    } catch (err: unknown) {
      setAuthError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsSendingReset(false);
    }
  };

  // Tab 2: New Aspirant Registration with E-mail + Senha
  const handleRegisterWithEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');

    if (!regName.trim()) {
      setAuthError('Informe seu nome completo.');
      playSound('beep');
      return;
    }
    if (!regPhone.trim()) {
      setAuthError('Informe seu telefone / WhatsApp para contato da diretoria.');
      playSound('beep');
      return;
    }
    const emailErr = validateEmailInput(regEmail);
    if (emailErr) {
      setAuthError(emailErr);
      playSound('beep');
      return;
    }
    const passErr = validatePasswordInput(regPassword, regConfirmPassword);
    if (passErr) {
      setAuthError(passErr);
      playSound('beep');
      return;
    }

    const draft: AspirantDraft = {
      name: regName.trim(),
      nickname: regNickname.trim(),
      phone: regPhone.trim(),
      motorcycle: regMotorcycle.trim(),
      emergencyContact: regEmergencyContact.trim(),
      bloodType: regBloodType || 'O+',
      birthDate: regBirthDate.trim(),
      memberCategory: regCategory,
    };
    saveDraft(draft);

    setIsSubmittingReg(true);
    try {
      const cred = await registerWithEmailPasswordClean(regEmail, regPassword);
      const fbUser = cred.user;
      setPendingFirebaseUser(fbUser);

      // Se já estiver verificado (casos especiais), finaliza direto; caso padrão, solicita confirmação de e-mail
      if (fbUser.emailVerified) {
        const result = onResolveFirebaseUser
          ? await onResolveFirebaseUser(fbUser)
          : await FirestoreSync.resolveUserSession(fbUser, buildLocalSeed());
        await handleResolvedUserOutcome(fbUser, result);
      } else {
        setAwaitingEmailVerification(true);
        setAuthNotice(
          `Enviamos um link de confirmação para ${fbUser.email}. Clique no link no seu e-mail e depois toque em "Já Confirmei Meu E-mail".`
        );
        playSound('success');
      }
    } catch (err: unknown) {
      console.error('E-mail Sign-Up error:', err);
      setAuthError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsSubmittingReg(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    const activeFb = pendingFirebaseUser || firebaseUser || auth.currentUser;
    if (!activeFb) return;
    setAuthError('');
    setAuthNotice('');
    setIsResendingVerification(true);
    try {
      await resendVerificationEmailClean(activeFb);
      setAuthNotice(
        `Novo link de verificação enviado para ${activeFb.email}. Confira sua caixa de entrada e pasta de spam.`
      );
      playSound('success');
    } catch (err: unknown) {
      setAuthError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleCheckEmailVerifiedAndProceed = async () => {
    const activeFb = pendingFirebaseUser || firebaseUser || auth.currentUser;
    if (!activeFb) return;
    setAuthError('');
    setAuthNotice('');
    setIsEmailLoading(true);
    try {
      await activeFb.reload();
      await activeFb.getIdToken(true);
      if (!activeFb.emailVerified) {
        setAuthError(
          'Seu e-mail ainda consta como não confirmado. Abra o link enviado para sua caixa de entrada e clique aqui novamente.'
        );
        playSound('beep');
        return;
      }
      FirestoreSync.resetAuthCaches();
      const result = onResolveFirebaseUser
        ? await onResolveFirebaseUser(activeFb)
        : await FirestoreSync.resolveUserSession(activeFb, buildLocalSeed());
      await handleResolvedUserOutcome(activeFb, result);
    } catch (err: unknown) {
      setAuthError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsEmailLoading(false);
    }
  };

  // Secondary: Google Auth (Migration & Existing Accounts)
  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthNotice('');
    setStatusNoticeUser(null);
    setIsGoogleLoading(true);
    try {
      const authOutcome = await signInWithGoogleAdaptive();
      if (authOutcome.mode === 'redirect') {
        setAuthNotice('Redirecionando para a autenticação segura do Google...');
        return;
      }

      const fbUser = authOutcome.credential.user;
      const result = onResolveFirebaseUser
        ? await onResolveFirebaseUser(fbUser)
        : await FirestoreSync.resolveUserSession(fbUser, buildLocalSeed());

      await handleResolvedUserOutcome(fbUser, result);
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      if (
        code === 'auth/user-token-expired' ||
        code === 'auth/invalid-user-token' ||
        code === 'auth/requires-recent-login'
      ) {
        await handleSwitchAccount();
      } else {
        console.error('Google Sign-In error:', err);
      }
      setAuthError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleRetryResolveExistingSession = async () => {
    const activeFb = auth.currentUser || firebaseUser;
    if (!activeFb) return;
    setAuthError('');
    setAuthNotice('');
    setIsEmailLoading(true);
    try {
      await activeFb.reload().catch(() => {});
      await activeFb.getIdToken(true);
      FirestoreSync.resetAuthCaches();
      const result = onResolveFirebaseUser
        ? await onResolveFirebaseUser(activeFb)
        : await FirestoreSync.resolveUserSession(activeFb, buildLocalSeed());
      await handleResolvedUserOutcome(activeFb, result);
    } catch (err: unknown) {
      console.error('Erro ao reconectar sessão:', err);
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      const isAuthTokenDead =
        code === 'auth/user-token-expired' ||
        code === 'auth/invalid-user-token' ||
        code === 'auth/requires-recent-login' ||
        code === 'auth/user-disabled' ||
        code === 'auth/user-not-found';
      if (isAuthTokenDead) {
        await handleSwitchAccount();
      }
      setAuthError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleSwitchAccount = async () => {
    setIsSwitchingAccount(true);
    setAuthError('');
    setAuthNotice('');
    setStatusNoticeUser(null);
    setShowCompleteReg(false);
    setAwaitingEmailVerification(false);
    setPendingFirebaseUser(null);
    setRegSuccess(false);
    clearDraft();
    try {
      if (onSwitchGoogleAccount) {
        await onSwitchGoogleAccount();
      } else {
        FirestoreSync.resetAuthCaches();
        await signOutCleanly();
        StorageService.applyRemoteCurrentUser(null);
        onSelectUser(null);
      }
      playSound('click');
    } catch (err) {
      console.error('Erro ao desconectar conta:', err);
    } finally {
      setIsSwitchingAccount(false);
    }
  };

  const handleCompletePostAuthRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeFbUser = pendingFirebaseUser || firebaseUser || auth.currentUser;
    if (!activeFbUser || !regName.trim()) return;

    setIsSubmittingReg(true);
    setAuthError('');
    try {
      const created = await FirestoreSync.registerGoogleCandidate(activeFbUser, {
        name: regName,
        nickname: regNickname,
        phone: regPhone,
        motorcycle: regMotorcycle,
        bloodType: regBloodType,
        emergencyContact: regEmergencyContact,
        birthDate: regBirthDate,
        memberCategory: regCategory,
      });
      clearDraft();
      setRegSuccess(true);
      setShowCompleteReg(false);
      setActiveTab('register');
      onGoogleUserResolved(created);
      playSound('success');
    } catch (err) {
      console.error('Erro ao concluir cadastro:', err);
      setAuthError(formatAuthError(err));
      playSound('beep');
    } finally {
      setIsSubmittingReg(false);
    }
  };

  const accessMessage =
    clubInfo.accessRequestMessage?.trim() ||
    'Acesse com seu E-mail e Senha cadastrados. Novos integrantes podem preencher a ficha na aba Solicitar Acesso para análise da Mesa Diretora.';

  const GoogleIcon = () => (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 sm:px-4 pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))] sm:pt-10 pb-8 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-[#121216] border border-amber-400/40 rounded-2xl w-full max-w-md p-6 space-y-5 my-auto shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-white"
          aria-label="Fechar janela de acesso"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-2">
          <img
            src={clubInfo.leftCrestUrl || DEFAULT_CREST_URL}
            alt="Brasão Oficina do Rock"
            referrerPolicy="no-referrer"
            className="w-16 h-16 object-contain mx-auto border-0"
          />
          <h3 className="font-rock text-2xl font-bold uppercase text-white tracking-wider">
            Portal do Motoclube
          </h3>
          <p className="text-xs text-zinc-400">
            Acesso individual seguro para integrantes, diretoria e aspirantes.
          </p>
        </div>

        {/* Admin-Editable Access Request Message */}
        <div className="p-3.5 bg-zinc-950/90 border border-amber-400/30 rounded-xl space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-amber-400 tracking-wider">
            <MessageSquareText className="w-3.5 h-3.5 shrink-0" />
            <span>Aviso de Acesso</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
            {accessMessage}
          </p>
        </div>

        {/* Status Info Banner */}
        {authNotice && (
          <div className="p-3 bg-amber-400/15 border border-amber-400/40 text-amber-200 rounded-lg text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{authNotice}</span>
          </div>
        )}

        {/* Auth Error Alert */}
        {authError && (
          <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 rounded-lg text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}

        {/* Flow 0: E-mail Verification Waiting Screen */}
        {awaitingEmailVerification ? (
          <div className="p-5 bg-zinc-950 border border-amber-400/40 rounded-xl space-y-4 text-xs">
            <div className="flex items-center gap-2.5 text-amber-400 font-bold uppercase">
              <MailCheck className="w-5 h-5 shrink-0" />
              <span>Confirme Seu Endereço de E-mail</span>
            </div>
            <p className="text-zinc-300 leading-relaxed">
              Para segurança do Motoclube, clique no link de confirmação enviado para{' '}
              <strong className="text-white break-all">
                {pendingFirebaseUser?.email || firebaseUser?.email || regEmail || loginEmail}
              </strong>
              . Após confirmar, toque no botão abaixo para continuar.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                disabled={isEmailLoading}
                onClick={handleCheckEmailVerifiedAndProceed}
                className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black font-rock text-xs font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2"
              >
                {isEmailLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Já Confirmei Meu E-mail — Entrar Agora</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isResendingVerification}
                  onClick={handleResendVerificationEmail}
                  className="flex-1 py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-bold uppercase flex items-center justify-center gap-1.5"
                >
                  {isResendingVerification ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Mail className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>Reenviar Link</span>
                </button>
                <button
                  type="button"
                  disabled={isSwitchingAccount}
                  onClick={handleSwitchAccount}
                  className="py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-red-400 border border-zinc-700 rounded-lg font-bold uppercase flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Trocar Conta</span>
                </button>
              </div>
            </div>
          </div>
        ) : showCompleteReg ? (
          /* Flow A: Authenticated User completing Aspirante Registration */
          <form onSubmit={handleCompletePostAuthRegistration} className="space-y-3 text-xs">
            <div className="p-3 bg-amber-400/10 border border-amber-400/30 rounded-xl flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-amber-300 block uppercase">
                  E-mail Autenticado!
                </span>
                <p className="text-zinc-300 leading-relaxed">
                  Complete seus dados abaixo para enviar sua solicitação de ingresso ao administrador.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">Apelido (Colete)</label>
                <input
                  type="text"
                  placeholder="Ex: Caveira / Estradeiro"
                  value={regNickname}
                  onChange={(e) => setRegNickname(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">E-mail de Acesso</label>
                <input
                  type="email"
                  readOnly
                  value={regEmail}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-400"
                />
              </div>
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">WhatsApp *</label>
                <input
                  type="text"
                  required
                  placeholder="(15) 99888-7766"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">Motocicleta</label>
                <input
                  type="text"
                  placeholder="Ex: Shadow 750 / Fat Boy"
                  value={regMotorcycle}
                  onChange={(e) => setRegMotorcycle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">Tipo Sanguíneo</label>
                <select
                  value={regBloodType}
                  onChange={(e) => setRegBloodType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">Nascimento</label>
                <input
                  type="date"
                  value={regBirthDate}
                  onChange={(e) => setRegBirthDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block font-bold text-zinc-300 uppercase mb-1">Categoria *</label>
                <select
                  value={regCategory}
                  onChange={(e) => setRegCategory(e.target.value as MemberCategory)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  {MEMBER_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-zinc-300 uppercase mb-1">Emergência</label>
              <input
                type="text"
                placeholder="Nome e telefone"
                value={regEmergencyContact}
                onChange={(e) => setRegEmergencyContact(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSwitchAccount}
                disabled={isSwitchingAccount}
                className="px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase rounded-lg"
              >
                Trocar Conta
              </button>
              <button
                type="submit"
                disabled={isSubmittingReg}
                className="flex-1 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black font-rock font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2"
              >
                {isSubmittingReg ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                <span>Enviar Solicitação</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Mode Switcher Tabs */}
            <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('login');
                  setIsResetMode(false);
                  setAuthError('');
                  setAuthNotice('');
                }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                  activeTab === 'login' ? 'bg-amber-400 text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('register');
                  setRegSuccess(false);
                  setAuthError('');
                  setAuthNotice('');
                }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                  activeTab === 'register' ? 'bg-amber-400 text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Solicitar Acesso
              </button>
            </div>

            {/* Tab 1: E-mail & Senha Login + Password Reset + Secondary Google */}
            {activeTab === 'login' && (
              <div className="space-y-4">
                {isResetMode ? (
                  <form
                    onSubmit={handleSendPasswordReset}
                    className="p-4 bg-zinc-950 border border-amber-400/35 rounded-xl space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-400 uppercase flex items-center gap-1.5">
                        <KeyRound className="w-4 h-4" />
                        <span>Recuperar / Definir Senha</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsResetMode(false);
                          setResetSuccessMsg('');
                          setAuthError('');
                        }}
                        className="text-zinc-400 hover:text-white flex items-center gap-1 text-[11px] font-semibold"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Voltar</span>
                      </button>
                    </div>

                    <p className="text-zinc-300 leading-relaxed">
                      Informe o e-mail vinculado ao seu cadastro. Enviaremos um link oficial para você criar ou redefinir sua senha com segurança.
                    </p>

                    <div>
                      <label className="block font-bold text-zinc-300 uppercase mb-1">
                        Seu E-mail Cadastrado *
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                        <input
                          type="email"
                          required
                          autoComplete="email"
                          placeholder="integrante@email.com"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    {resetSuccessMsg && (
                      <div className="p-2.5 bg-green-950/60 border border-green-700 text-green-200 rounded-lg flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                        <span>{resetSuccessMsg}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSendingReset}
                      className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black font-rock font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2"
                    >
                      {isSendingReset ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      <span>{isSendingReset ? 'Enviando...' : 'Enviar E-mail de Recuperação'}</span>
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={handleEmailSignIn}
                    className="p-4 bg-zinc-950 border border-amber-400/35 rounded-xl space-y-3 text-xs"
                  >
                    <div>
                      <label className="block font-bold text-zinc-300 uppercase mb-1">
                        E-mail *
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                        <input
                          type="email"
                          required
                          autoComplete="email"
                          placeholder="seu.email@exemplo.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-zinc-300 uppercase">Senha *</label>
                        <button
                          type="button"
                          onClick={() => {
                            setResetEmail(loginEmail);
                            setResetSuccessMsg('');
                            setAuthError('');
                            setIsResetMode(true);
                          }}
                          className="text-[11px] font-semibold text-amber-400 hover:text-amber-300"
                        >
                          Esqueci minha senha
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                        <input
                          type={showLoginPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          placeholder="Digite sua senha"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-10 py-2 text-white focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((prev) => !prev)}
                          className="absolute right-2.5 top-2 text-zinc-400 hover:text-white p-0.5"
                          aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          {showLoginPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isEmailLoading}
                      className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black font-rock font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 shadow-lg"
                    >
                      {isEmailLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <KeyRound className="w-4 h-4" />
                      )}
                      <span>{isEmailLoading ? 'Autenticando...' : 'Entrar com E-mail e Senha'}</span>
                    </button>

                    <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                      <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                        Integrantes que já entravam via Google podem continuar entrando abaixo para acessar e criar sua senha em <strong className="text-zinc-200">Meu Perfil</strong>:
                      </p>
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isGoogleLoading}
                        className="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-zinc-200 border border-zinc-700 font-bold text-[11px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-colors"
                      >
                        {isGoogleLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <GoogleIcon />
                        )}
                        <span>
                          {isGoogleLoading ? 'Conectando...' : 'Entrar / Migrar Conta Google'}
                        </span>
                      </button>
                    </div>
                  </form>
                )}

                {(firebaseUser || statusNoticeUser) && !currentUser && !showCompleteReg && (
                  <div className="p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-2.5 text-xs">
                    <div className="text-zinc-300 break-all">
                      Conta autenticada:{' '}
                      <strong className="text-amber-400">
                        {firebaseUser?.email || statusNoticeUser?.email || 'Conectada'}
                      </strong>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={handleRetryResolveExistingSession}
                        disabled={isEmailLoading}
                        className="flex-1 py-2 px-3 bg-amber-400/15 hover:bg-amber-400/25 disabled:opacity-60 text-amber-300 border border-amber-400/40 rounded-lg text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 transition-colors"
                      >
                        {isEmailLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>Reconectar Cadastro</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSwitchAccount}
                        disabled={isSwitchingAccount}
                        className="py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-red-400 border border-zinc-700 rounded-lg text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{isSwitchingAccount ? 'Saindo...' : 'Trocar Conta'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {currentUser && (
                  <div className="p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-400">
                      Conectado como{' '}
                      <strong className="text-amber-400">{getMemberDisplayName(currentUser)}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleSwitchAccount}
                      className="text-red-400 hover:text-red-300 font-bold uppercase text-[11px]"
                    >
                      Desconectar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Request Access with E-mail + Senha */}
            {activeTab === 'register' && (
              <div>
                {regSuccess ? (
                  <div className="p-6 bg-zinc-950 rounded-xl border border-green-800 text-center space-y-3">
                    <ShieldCheck className="w-10 h-10 text-green-400 mx-auto" />
                    <h4 className="font-rock text-lg font-bold uppercase text-white">
                      Solicitação Enviada com Sucesso!
                    </h4>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      Sua ficha cadastral foi enviada para a Mesa Diretora e o Administrador Geral. Assim que aprovada, basta entrar com seu <strong className="text-amber-400">E-mail e Senha</strong>!
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('login');
                        setRegSuccess(false);
                      }}
                      className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold uppercase rounded-lg"
                    >
                      Voltar para Entrar
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={handleRegisterWithEmailPassword}
                    className="p-4 bg-zinc-950 border border-amber-400/35 rounded-xl space-y-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 font-bold text-amber-400 uppercase pb-1">
                      <UserPlus className="w-4 h-4" />
                      <span>Novo Cadastro com E-mail e Senha</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Nome Completo *</label>
                        <input
                          type="text"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Apelido (Colete)</label>
                        <input
                          type="text"
                          placeholder="Ex: Estradeiro"
                          value={regNickname}
                          onChange={(e) => setRegNickname(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">E-mail *</label>
                        <input
                          type="email"
                          required
                          autoComplete="email"
                          placeholder="seu@email.com"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">WhatsApp *</label>
                        <input
                          type="text"
                          required
                          placeholder="(15) 99888-7766"
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Criar Senha (mín. 6) *</label>
                        <div className="relative">
                          <input
                            type={showRegPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            placeholder="Mínimo 6 caracteres"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 pr-8 py-1.5 text-white focus:outline-none focus:border-amber-400"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword((p) => !p)}
                            className="absolute right-2 top-1.5 text-zinc-400 hover:text-white"
                            aria-label="Alternar visibilidade da senha"
                          >
                            {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Confirmar Senha *</label>
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          placeholder="Repita a senha"
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Motocicleta</label>
                        <input
                          type="text"
                          placeholder="Ex: Shadow 750"
                          value={regMotorcycle}
                          onChange={(e) => setRegMotorcycle(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Tipo Sanguíneo</label>
                        <select
                          value={regBloodType}
                          onChange={(e) => setRegBloodType(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                        >
                          <option value="O+">O+</option>
                          <option value="O-">O-</option>
                          <option value="A+">A+</option>
                          <option value="A-">A-</option>
                          <option value="B+">B+</option>
                          <option value="B-">B-</option>
                          <option value="AB+">AB+</option>
                          <option value="AB-">AB-</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Nascimento</label>
                        <input
                          type="date"
                          value={regBirthDate}
                          onChange={(e) => setRegBirthDate(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-zinc-300 uppercase mb-1">Categoria *</label>
                        <select
                          value={regCategory}
                          onChange={(e) => setRegCategory(e.target.value as MemberCategory)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                        >
                          {MEMBER_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-300 uppercase mb-1">Emergência</label>
                      <input
                        type="text"
                        placeholder="Nome e telefone"
                        value={regEmergencyContact}
                        onChange={(e) => setRegEmergencyContact(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingReg}
                      className="w-full py-2.5 mt-1 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-black font-rock font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-2"
                    >
                      {isSubmittingReg ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      <span>{isSubmittingReg ? 'Criando Acesso...' : 'Criar Conta e Solicitar Acesso'}</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </>
        )}

        {onOpenSupporters && (
          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-400">
              Visitante ou parceiro? Acesse a área pública:
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSupporters();
              }}
              className="px-3 py-1.5 bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/40 rounded-lg text-[11px] font-bold uppercase tracking-wider shrink-0 transition-colors"
            >
              SUPPORT XV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
