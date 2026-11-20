import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  linkWithCredential,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  UserCredential,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const ADMIN_EMAIL = 'eliezerrmartins@gmail.com';
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_AUTH_PROVIDERS_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

export function isActiveAdminUser(
  user: { role?: string; status?: string; email?: string } | null | undefined
): boolean {
  if (!user || user.status !== 'active') return false;
  return (
    user.role === 'admin' ||
    user.email?.toLowerCase().trim() === ADMIN_EMAIL
  );
}

export function isPresidenteUser(
  user: { status?: string; boardRoleId?: string } | null | undefined
): boolean {
  if (!user || user.status !== 'active') return false;
  return user.boardRoleId === 'role-pres';
}

export function canManageBadgesUser(
  user: { role?: string; status?: string; email?: string; boardRoleId?: string } | null | undefined
): boolean {
  return isActiveAdminUser(user) || isPresidenteUser(user);
}

export function canEditFinancesUser(
  user: {
    role?: string;
    status?: string;
    email?: string;
    boardRoleId?: string;
    canEditFinances?: boolean;
  } | null | undefined
): boolean {
  if (!user || user.status !== 'active') return false;
  if (isActiveAdminUser(user)) return true;
  if (user.role !== 'board') return false;
  return Boolean(
    user.canEditFinances ||
      user.boardRoleId === 'role-finance' ||
      user.email?.toLowerCase().includes('financeiro')
  );
}

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    // Fallback when already initialized (e.g. test/HMR) or IndexedDB unavailable
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db: Firestore = createFirestoreInstance();
export const auth = getAuth(app);
auth.languageCode = 'pt';

// Persistência local segura via Firebase Authentication SDK (tokens gerenciados pelo próprio SDK)
setPersistence(auth, browserLocalPersistence).catch(() => {
  // Ignore persistence fallback on restrictive environments
});

// --- Validação de entrada para E-mail e Senha (antes de qualquer requisição Firebase) ---

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmailInput(email: string): string | null {
  const cleaned = (email || '').trim();
  if (!cleaned) {
    return 'Informe seu endereço de e-mail.';
  }
  if (!EMAIL_REGEX.test(cleaned) || cleaned.length > 150) {
    return 'Digite um endereço de e-mail válido.';
  }
  return null;
}

export function validatePasswordInput(
  password: string,
  confirmPassword?: string
): string | null {
  if (!password) {
    return 'Informe sua senha.';
  }
  if (password.length < 6) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }
  if (password.length > 128) {
    return 'A senha excedeu o tamanho máximo permitido.';
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return 'A confirmação de senha não confere.';
  }
  return null;
}

// --- Autenticação Primária: E-mail e Senha ---

export async function signInWithEmailPasswordClean(
  email: string,
  password: string
): Promise<UserCredential> {
  const emailErr = validateEmailInput(email);
  if (emailErr) throw new Error(emailErr);
  if (!password) throw new Error('Informe sua senha para entrar.');
  return signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
}

export async function registerWithEmailPasswordClean(
  email: string,
  password: string
): Promise<UserCredential> {
  const emailErr = validateEmailInput(email);
  if (emailErr) throw new Error(emailErr);
  const passErr = validatePasswordInput(password);
  if (passErr) throw new Error(passErr);

  const cred = await createUserWithEmailAndPassword(
    auth,
    email.trim().toLowerCase(),
    password
  );
  // Envia verificação de e-mail para habilitar request.auth.token.email_verified nas regras de segurança
  await sendEmailVerification(cred.user).catch(() => {
    // Usuário pode reenviar manualmente caso haja atraso transitório
  });
  return cred;
}

export async function resendVerificationEmailClean(
  targetUser?: FirebaseUser | null
): Promise<void> {
  const fbUser = targetUser || auth.currentUser;
  if (!fbUser) {
    throw new Error('Nenhuma sessão conectada para reenviar a verificação.');
  }
  await sendEmailVerification(fbUser);
}

export async function sendPasswordResetClean(email: string): Promise<void> {
  const emailErr = validateEmailInput(email);
  if (emailErr) throw new Error(emailErr);
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

export interface AuthProviderStatus {
  hasPassword: boolean;
  hasGoogle: boolean;
  providerIds: string[];
}

export function getAuthProviderStatus(
  fbUser: FirebaseUser | null | undefined
): AuthProviderStatus {
  const providerIds = (fbUser?.providerData || [])
    .map((p) => p?.providerId || '')
    .filter(Boolean);
  return {
    hasPassword: providerIds.includes('password'),
    hasGoogle: providerIds.includes('google.com'),
    providerIds,
  };
}

export type LinkPasswordResult = 'linked' | 'already_linked' | 'reauth_redirect';

const REAUTH_PASSWORD_LINK_KEY = 'oficina_pending_reauth_password_link_v1';

function markPendingReauthForPasswordLink(): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(REAUTH_PASSWORD_LINK_KEY, '1');
    }
  } catch {
    // Ignore storage restriction
  }
}

export function consumePendingReauthForPasswordLink(): boolean {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const pending = window.sessionStorage.getItem(REAUTH_PASSWORD_LINK_KEY) === '1';
      if (pending) {
        window.sessionStorage.removeItem(REAUTH_PASSWORD_LINK_KEY);
      }
      return pending;
    }
  } catch {
    // Ignore storage restriction
  }
  return false;
}

export function isOperationNotAllowedError(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  if (code === 'auth/operation-not-allowed') return true;
  const msg = err instanceof Error ? err.message : String(err || '');
  return msg.includes('auth/operation-not-allowed');
}

async function reauthenticateWithGoogleAdaptive(
  fbUser: FirebaseUser,
  hintEmail?: string
): Promise<'reauthenticated' | 'redirect'> {
  const provider = createFreshGoogleProvider(hintEmail);

  if (isCapacitorOrMobileWebView()) {
    markPendingReauthForPasswordLink();
    await reauthenticateWithRedirect(fbUser, provider);
    return 'redirect';
  }

  try {
    await reauthenticateWithPopup(fbUser, provider);
    return 'reauthenticated';
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (shouldFallbackToRedirect(code)) {
      markPendingReauthForPasswordLink();
      await reauthenticateWithRedirect(fbUser, createFreshGoogleProvider(hintEmail));
      return 'redirect';
    }
    throw err;
  }
}

/**
 * Permite que integrante já cadastrado com Google crie sua senha individual
 * mantendo exatamente o mesmo Firebase Auth UID, membro e histórico.
 */
export async function linkPasswordToCurrentUser(
  newPassword: string
): Promise<LinkPasswordResult> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('Entre primeiro na sua conta para configurar uma senha de acesso.');
  }

  const passErr = validatePasswordInput(newPassword);
  if (passErr) throw new Error(passErr);

  // Atualiza metadados do usuário para garantir providerData e email atualizados
  await fbUser.reload().catch(() => {});

  const targetEmail = (
    fbUser.email ||
    fbUser.providerData.find((p) => p?.email)?.email ||
    ''
  )
    .trim()
    .toLowerCase();

  if (!targetEmail) {
    throw new Error(
      'Sua conta atual não possui um endereço de e-mail disponível para vinculação de senha.'
    );
  }

  const { hasPassword, hasGoogle } = getAuthProviderStatus(fbUser);
  if (hasPassword) {
    await fbUser.getIdToken(true).catch(() => {});
    return 'already_linked';
  }

  const credential = EmailAuthProvider.credential(targetEmail, newPassword);

  const finalizeLinkedAccount = async (userObj: FirebaseUser) => {
    await userObj.reload().catch(() => {});
    await userObj.getIdToken(true).catch(() => {});
    if (!userObj.emailVerified) {
      await sendEmailVerification(userObj).catch(() => {
        // Verificação pode ser reenviada caso falhe transitoriamente
      });
    }
  };

  try {
    await linkWithCredential(fbUser, credential);
    await finalizeLinkedAccount(fbUser);
    return 'linked';
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';

    if (code === 'auth/provider-already-linked') {
      await fbUser.reload().catch(() => {});
      await fbUser.getIdToken(true).catch(() => {});
      if (getAuthProviderStatus(fbUser).hasPassword) {
        return 'already_linked';
      }
      throw err;
    }

    if (code === 'auth/requires-recent-login' && hasGoogle) {
      const reauthStatus = await reauthenticateWithGoogleAdaptive(fbUser, targetEmail);
      if (reauthStatus === 'redirect') {
        return 'reauth_redirect';
      }
      const activeUser = auth.currentUser || fbUser;
      try {
        await linkWithCredential(activeUser, credential);
        await finalizeLinkedAccount(activeUser);
        return 'linked';
      } catch (retryErr: unknown) {
        const retryCode = (retryErr as { code?: string })?.code || '';
        if (retryCode === 'auth/provider-already-linked') {
          await activeUser.reload().catch(() => {});
          await activeUser.getIdToken(true).catch(() => {});
          if (getAuthProviderStatus(activeUser).hasPassword) {
            return 'already_linked';
          }
        }
        throw retryErr;
      }
    }

    throw err;
  }
}

export async function changeCurrentUserPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const fbUser = auth.currentUser;
  const targetEmail = (
    fbUser?.email ||
    fbUser?.providerData.find((p) => p?.email)?.email ||
    ''
  )
    .trim()
    .toLowerCase();

  if (!fbUser || !targetEmail) {
    throw new Error('Conecte sua conta antes de alterar a senha.');
  }
  if (!currentPassword) {
    throw new Error('Informe sua senha atual.');
  }
  const passErr = validatePasswordInput(newPassword);
  if (passErr) throw new Error(passErr);

  const cred = EmailAuthProvider.credential(targetEmail, currentPassword);
  await reauthenticateWithCredential(fbUser, cred);
  await updatePassword(fbUser, newPassword);
  await fbUser.reload().catch(() => {});
  await fbUser.getIdToken(true).catch(() => {});
}

// --- Suporte Secundário / Migração Segura para Contas Google Existentes ---

export function createFreshGoogleProvider(loginHint?: string): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  const params: Record<string, string> = {
    prompt: 'select_account',
  };
  if (loginHint && loginHint.trim()) {
    params.login_hint = loginHint.trim().toLowerCase();
  }
  provider.setCustomParameters(params);
  return provider;
}

export const googleProvider = createFreshGoogleProvider();

export function isCapacitorOrMobileWebView(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (win.Capacitor?.isNativePlatform?.()) return true;
  if (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:') {
    return true;
  }
  const ua = navigator.userAgent || '';
  return /;\s*wv\)/i.test(ua);
}

export type AdaptiveGoogleSignInResult =
  | { mode: 'popup'; credential: UserCredential }
  | { mode: 'redirect'; credential: null };

function shouldFallbackToRedirect(code: string): boolean {
  return (
    code === 'auth/popup-blocked' ||
    code === 'auth/operation-not-supported-in-this-environment' ||
    code === 'auth/web-storage-unsupported'
  );
}

function isTokenRecoveryAuthCode(code: string): boolean {
  return (
    code === 'auth/user-token-expired' ||
    code === 'auth/invalid-user-token' ||
    code === 'auth/requires-recent-login'
  );
}

export async function signInWithGoogleAdaptive(): Promise<AdaptiveGoogleSignInResult> {
  const provider = createFreshGoogleProvider();

  if (isCapacitorOrMobileWebView()) {
    await signInWithRedirect(auth, provider);
    return { mode: 'redirect', credential: null };
  }

  try {
    const credential = await signInWithPopup(auth, provider);
    return { mode: 'popup', credential };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (shouldFallbackToRedirect(code)) {
      await signInWithRedirect(auth, createFreshGoogleProvider());
      return { mode: 'redirect', credential: null };
    }
    if (isTokenRecoveryAuthCode(code)) {
      try {
        await signOut(auth);
      } catch {
        // Ignore signOut failure
      }
      try {
        const retried = await signInWithPopup(auth, createFreshGoogleProvider());
        return { mode: 'popup', credential: retried };
      } catch (retryErr: unknown) {
        const retryCode = (retryErr as { code?: string })?.code || '';
        if (shouldFallbackToRedirect(retryCode)) {
          await signInWithRedirect(auth, createFreshGoogleProvider());
          return { mode: 'redirect', credential: null };
        }
        throw retryErr;
      }
    }
    throw err;
  }
}

export async function consumeGoogleRedirectResult(): Promise<UserCredential | null> {
  try {
    const res = await getRedirectResult(auth);
    return res;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (
      code === 'auth/user-token-expired' ||
      code === 'auth/invalid-user-token' ||
      code === 'auth/credential-already-in-use'
    ) {
      try {
        await signOut(auth);
      } catch {
        // Ignore
      }
      return null;
    }
    if (code === 'auth/no-current-user') {
      return null;
    }
    throw err;
  }
}

export async function signOutCleanly(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // Ignore transient signOut issues
  }
}

export const signOutGoogleCleanly = signOutCleanly;

export function formatAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'E-mail ou senha incorretos. Se sua conta foi criada anteriormente pelo Google e você ainda não criou senha, entre uma vez pelo botão Google abaixo ou clique em "Esqueci minha senha".';
  }
  if (code === 'auth/user-not-found') {
    return 'Nenhuma conta encontrada com este e-mail. Use a aba "Solicitar Acesso" para criar seu login.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Este e-mail já possui uma conta cadastrada. Faça login na aba "Entrar" ou use "Esqueci minha senha".';
  }
  if (code === 'auth/weak-password') {
    return 'A senha escolhida é muito fraca. Utilize no mínimo 6 caracteres combinando letras e números.';
  }
  if (code === 'auth/invalid-email') {
    return 'O endereço de e-mail informado não é válido.';
  }
  if (code === 'auth/missing-password') {
    return 'Informe sua senha para continuar.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'O provedor E-mail/Senha ainda precisa ser ativado no Console Firebase (Authentication -> Sign-in method -> E-mail/senha). Enquanto isso, contas existentes podem acessar via Google.';
  }
  if (code === 'auth/provider-already-linked' || code === 'auth/credential-already-in-use') {
    return 'Este método de login já está vinculado à sua conta.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Autenticação cancelada antes de concluir.';
  }
  if (code === 'auth/popup-blocked') {
    return 'O navegador bloqueou a janela de autenticação. Permita pop-ups para este site e tente novamente.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Este endereço ainda não está autorizado no Firebase Authentication. Verifique os domínios autorizados no projeto.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'Este e-mail já está vinculado ao acesso Google. Entre pelo botão Google abaixo para acessar e criar sua senha no Perfil.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Muitas tentativas seguidas. Aguarde alguns minutos ou redefina sua senha por e-mail.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Sem conexão com os servidores de autenticação. Verifique sua internet e tente novamente.';
  }
  if (code === 'auth/user-mismatch') {
    return 'A conta Google selecionada não corresponde à conta conectada atualmente. Escolha o mesmo e-mail para confirmar.';
  }
  if (
    code === 'auth/user-token-expired' ||
    code === 'auth/invalid-user-token' ||
    code === 'auth/requires-recent-login'
  ) {
    return 'Por segurança, sua sessão precisa ser confirmada novamente. Faça login outra vez.';
  }
  if (code === 'auth/user-disabled') {
    return 'Esta conta encontra-se desativada no Firebase Authentication.';
  }
  if (code === 'auth/internal-error' || code === 'auth/web-storage-unsupported') {
    return 'O navegador restringiu o armazenamento de login. Permita cookies ou abra o aplicativo no navegador padrão.';
  }

  let rawMessage = err instanceof Error ? err.message : String(err || '');
  if (rawMessage.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage) as { error?: string };
      if (parsed?.error) rawMessage = parsed.error;
    } catch {
      // keep rawMessage
    }
  }

  const lower = rawMessage.toLowerCase();
  if (lower.includes('permission-denied') || lower.includes('missing or insufficient permissions')) {
    return 'A nuvem recusou a verificação de permissão para este cadastro. Verifique se seu e-mail foi confirmado ou solicite revisão ao Administrador.';
  }
  if (lower.includes('quota exceeded') || lower.includes('resource-exhausted')) {
    return 'Limite diário de consultas do Firestore atingido no momento. O login local continua disponível via cache seguro.';
  }
  if (lower.includes('unavailable') || lower.includes('client is offline') || lower.includes('offline')) {
    return 'Sem conexão estável com o banco de dados na nuvem no momento. Verifique sua internet e tente reconectar.';
  }

  if (
    err instanceof Error &&
    rawMessage &&
    !rawMessage.trim().startsWith('{') &&
    !rawMessage.startsWith('Firebase:')
  ) {
    return rawMessage;
  }

  return 'Não foi possível concluir a autenticação agora. Confira seus dados e tente novamente.';
}

export const formatGoogleAuthError = formatAuthError;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
