import {
  BoardRoleConfig,
  ClubExpense,
  ClubInfo,
  FeeRateScheduleEntry,
  ManualFinancialEntry,
  MemberHonoraryTitle,
  MemberMonthlyFee,
  MemberTabDebt,
  User,
  WalkInTabRecord,
  getMemberDisplayName,
} from '../types';

export const DUE_DAY_OF_MONTH = 15;

export const PT_BR_MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const PT_BR_SHORT_MONTHS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export interface BrazilDateParts {
  year: number;
  month: number;
  day: number;
  isoDate: string;
  yearMonth: string;
}

export function getBrazilTodayParts(now: Date = new Date()): BrazilDateParts {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    if (year > 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return {
        year,
        month,
        day,
        isoDate: `${year}-${mm}-${dd}`,
        yearMonth: `${year}-${mm}`,
      };
    }
  } catch {
    // Fallback below if Intl fails
  }

  const shifted = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return {
    year,
    month,
    day,
    isoDate: `${year}-${mm}-${dd}`,
    yearMonth: `${year}-${mm}`,
  };
}

export function getBrazilTodayIso(now: Date = new Date()): string {
  return getBrazilTodayParts(now).isoDate;
}

export function parseIsoDateParts(
  raw?: string | null
): { year: number; month: number; day: number } | null {
  const val = (raw || '').trim();
  if (!val) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    const year = parseInt(val.slice(0, 4), 10);
    const month = parseInt(val.slice(5, 7), 10);
    const day = parseInt(val.slice(8, 10), 10);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
    const [dd, mm, yyyy] = val.split('/');
    const year = parseInt(yyyy, 10);
    const month = parseInt(mm, 10);
    const day = parseInt(dd, 10);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  return null;
}

export function computeAgeAtDate(
  birthDateIso?: string | null,
  refDateIso: string = getBrazilTodayIso()
): number | null {
  const birth = parseIsoDateParts(birthDateIso);
  const ref = parseIsoDateParts(refDateIso);
  if (!birth || !ref) return null;
  let age = ref.year - birth.year;
  if (ref.month < birth.month || (ref.month === birth.month && ref.day < birth.day)) {
    age -= 1;
  }
  return age;
}

export function getEighteenthBirthdayCompetency(birthDateIso?: string | null): string | null {
  const birth = parseIsoDateParts(birthDateIso);
  if (!birth) return null;
  const year18 = birth.year + 18;
  const mm = String(birth.month).padStart(2, '0');
  return `${year18}-${mm}`;
}

export function isMemberCurrentlyMinor(
  member: Pick<User, 'birthDate' | 'isMinor'> | null | undefined,
  referenceDateIso: string = getBrazilTodayIso()
): boolean {
  if (!member) return false;
  const age = computeAgeAtDate(member.birthDate, referenceDateIso);
  if (age !== null) return age < 18;
  return Boolean(member.isMinor);
}

export function isMemberMinorAtCompetency(
  member: Pick<User, 'birthDate' | 'isMinor'> | null | undefined,
  year: number,
  month: number
): boolean {
  if (!member) return false;
  const comp18 = getEighteenthBirthdayCompetency(member.birthDate);
  const targetYm = `${year}-${String(month).padStart(2, '0')}`;
  if (comp18) {
    return targetYm < comp18;
  }
  return Boolean(member.isMinor);
}

export function getApplicableMonthlyFeeAmount(
  year: number,
  month: number,
  clubInfo: Pick<ClubInfo, 'monthlyFeeAmount'>,
  feeSchedules: FeeRateScheduleEntry[] = []
): number {
  const targetYm = `${year}-${String(month).padStart(2, '0')}`;
  const validSchedules = feeSchedules
    .filter(
      (s) =>
        s.status !== 'cancelled' &&
        /^\d{4}-\d{2}/.test((s.effectiveCompetency || '').trim()) &&
        s.effectiveCompetency.slice(0, 7) <= targetYm
    )
    .sort((a, b) => {
      const cmp = b.effectiveCompetency.slice(0, 7).localeCompare(a.effectiveCompetency.slice(0, 7));
      if (cmp !== 0) return cmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

  if (validSchedules.length > 0 && Number(validSchedules[0].newAmount) > 0) {
    return Number(validSchedules[0].newAmount);
  }

  return Number(clubInfo.monthlyFeeAmount) > 0 ? Number(clubInfo.monthlyFeeAmount) : 60;
}

export function getActiveMemberTitles(
  memberId: string,
  memberTitles: MemberHonoraryTitle[] = []
): MemberHonoraryTitle[] {
  return memberTitles.filter((t) => t.memberId === memberId && t.status === 'active');
}

/**
 * Canonical fallback titles for standard board role IDs so role resolution never falls back
 * to wrong cargo names (e.g. "Presidente") even before boardRoles snapshot completes loading.
 */
const CANONICAL_BOARD_ROLE_TITLES: Record<string, string> = {
  'role-pres': 'Presidente',
  'role-vpres': 'Vice-Presidente',
  'role-general': 'Diretor Geral',
  'role-finance': 'Diretor Financeiro',
  'role-disc-1': 'Diretor de Disciplina 1',
  'role-disc-2': 'Diretor de Disciplina 2',
  'role-disc-3': 'Diretor de Disciplina 3',
};

export interface MemberAccessBadges {
  /** Institutional cargo resolved strictly from Integrantes / boardRoles */
  officialCargo: string;
  /** Administrative / technical access level separated cleanly from cargo */
  accessBadge: 'Administrador Geral' | 'Mesa Diretora' | null;
  /** Whether the member is allowed to edit financial entries */
  canEditFinances: boolean;
  /** Whether this user is an admin */
  isAdmin: boolean;
  /** Whether this user has explicit Vice-Presidente or other board seat */
  isBoardSeat: boolean;
}

/**
 * Resolves a member's official cargo exclusively from their `Integrantes` record and `boardRoles`.
 * Never overrides cargo by hardcoded email matching (fixes bug showing Vice-Presidente as Presidente).
 */
export function resolveMemberOfficialRole(
  user: Pick<User, 'id' | 'email' | 'role' | 'boardRoleId' | 'customRoleTitle' | 'canEditFinances'> | null | undefined,
  boardRoles: BoardRoleConfig[] = []
): string {
  if (!user) return 'Integrante Pleno';

  const customTitle = user.customRoleTitle?.trim();
  if (customTitle) return customTitle;

  if (user.boardRoleId) {
    const matchedRole = boardRoles.find((r) => r.id === user.boardRoleId);
    if (matchedRole?.title?.trim()) {
      return matchedRole.title.trim();
    }
    if (CANONICAL_BOARD_ROLE_TITLES[user.boardRoleId]) {
      return CANONICAL_BOARD_ROLE_TITLES[user.boardRoleId];
    }
  }

  // Secondary resolution via boardRoles by memberId first, then email (only if not assigned to another role)
  if (user.id) {
    const byHolderId = boardRoles.find((r) => r.holderId && r.holderId === user.id);
    if (byHolderId?.title?.trim()) return byHolderId.title.trim();
  }

  const normalizedEmail = user.email?.toLowerCase().trim();
  if (normalizedEmail && boardRoles.length > 0) {
    const byEmail = boardRoles.find((r) => r.email?.toLowerCase().trim() === normalizedEmail);
    if (byEmail?.title?.trim()) return byEmail.title.trim();
  }

  if (user.canEditFinances) return 'Diretor Financeiro';
  if (user.role === 'board') return 'Mesa Diretora';
  if (user.role === 'admin') return 'Integrante Pleno';
  return 'Integrante Pleno';
}

/**
 * Separates institutional cargo (Integrantes) from technical admin / finance permissions.
 */
export function getMemberAccessBadges(
  user: Pick<User, 'id' | 'email' | 'role' | 'boardRoleId' | 'customRoleTitle' | 'canEditFinances'> | null | undefined,
  boardRoles: BoardRoleConfig[] = []
): MemberAccessBadges {
  const officialCargo = resolveMemberOfficialRole(user, boardRoles);
  const isAdmin = Boolean(user?.role === 'admin');
  const canEditFinances = Boolean(
    isAdmin || user?.canEditFinances || user?.boardRoleId === 'role-finance'
  );
  const accessBadge: MemberAccessBadges['accessBadge'] = isAdmin
    ? 'Administrador Geral'
    : user?.role === 'board'
    ? 'Mesa Diretora'
    : null;
  const isBoardSeat = Boolean(
    user?.boardRoleId || user?.role === 'board' || (officialCargo !== 'Integrante Pleno' && officialCargo !== 'Administrador Geral')
  );

  return {
    officialCargo,
    accessBadge,
    canEditFinances,
    isAdmin,
    isBoardSeat,
  };
}

export interface MemberEntryDate {
  startYear: number;
  startMonth: number; // 1..12
}

/**
 * Extracts starting year & month from `joinedDate` (`YYYY-MM-DD` or `DD/MM/YYYY`), falling back to `joinedYear`-01.
 */
export function extractMemberEntryYearMonth(
  member: Pick<User, 'joinedDate' | 'joinedYear'>,
  fallbackYear = getBrazilTodayParts().year
): MemberEntryDate {
  const rawDate = (member.joinedDate || '').trim();
  const minYear = 2008;
  const maxYear = getBrazilTodayParts().year + 1;

  if (/^\d{4}-\d{2}/.test(rawDate)) {
    const y = parseInt(rawDate.slice(0, 4), 10);
    const m = parseInt(rawDate.slice(5, 7), 10);
    if (!Number.isNaN(y) && y >= minYear && y <= maxYear) {
      return {
        startYear: y,
        startMonth: !Number.isNaN(m) && m >= 1 && m <= 12 ? m : 1,
      };
    }
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
    const [, mm, yyyy] = rawDate.split('/');
    const y = parseInt(yyyy, 10);
    const m = parseInt(mm, 10);
    if (!Number.isNaN(y) && y >= minYear && y <= maxYear) {
      return {
        startYear: y,
        startMonth: !Number.isNaN(m) && m >= 1 && m <= 12 ? m : 1,
      };
    }
  }

  if (member.joinedYear && member.joinedYear >= minYear && member.joinedYear <= maxYear) {
    return {
      startYear: member.joinedYear,
      startMonth: 1,
    };
  }

  return {
    startYear: Math.max(minYear, Math.min(maxYear, fallbackYear)),
    startMonth: 1,
  };
}

export function hasExplicitManualPagante(
  member?: Pick<User, 'feeStatus' | 'feeStatusUpdatedAt' | 'feeStatusHistory'> | null
): boolean {
  if (!member || member.feeStatus !== 'PAGANTE') return false;
  return Boolean(
    member.feeStatusUpdatedAt ||
      (Array.isArray(member.feeStatusHistory) && member.feeStatusHistory.length > 0)
  );
}

export interface EffectiveMemberFeeStatusInfo {
  status: 'PAGANTE' | 'ISENTO';
  isExempt: boolean;
  isMinorAutoExempt: boolean;
  isManualExempt: boolean;
  label: string;
  shortLabel: string;
}

export function resolveMemberFeeStatusInfo(
  member?: Pick<User, 'birthDate' | 'isMinor' | 'feeStatus' | 'feeStatusUpdatedAt' | 'feeStatusHistory'> | null,
  referenceDateIso: string = getBrazilTodayIso()
): EffectiveMemberFeeStatusInfo {
  if (!member) {
    return {
      status: 'PAGANTE',
      isExempt: false,
      isMinorAutoExempt: false,
      isManualExempt: false,
      label: 'PAGANTE',
      shortLabel: 'PAGANTE',
    };
  }

  if (member.feeStatus === 'ISENTO') {
    const isMinor = isMemberCurrentlyMinor(member, referenceDateIso);
    return {
      status: 'ISENTO',
      isExempt: true,
      isMinorAutoExempt: isMinor,
      isManualExempt: true,
      label: isMinor ? 'ISENTO – MENOR DE IDADE' : 'ISENTO',
      shortLabel: isMinor ? 'ISENTO (<18)' : 'ISENTO',
    };
  }

  if (isMemberCurrentlyMinor(member, referenceDateIso) && !hasExplicitManualPagante(member)) {
    return {
      status: 'ISENTO',
      isExempt: true,
      isMinorAutoExempt: true,
      isManualExempt: false,
      label: 'ISENTO – MENOR DE IDADE',
      shortLabel: 'ISENTO (<18)',
    };
  }

  return {
    status: 'PAGANTE',
    isExempt: false,
    isMinorAutoExempt: false,
    isManualExempt: false,
    label: 'PAGANTE',
    shortLabel: 'PAGANTE',
  };
}

export type FeeClassificationCode =
  | 'paid'
  | 'partial'
  | 'open_before_due'
  | 'overdue'
  | 'future'
  | 'exempt_minor'
  | 'exempt_manual'
  | 'written_off';

export interface FeeClassification {
  code: FeeClassificationCode;
  label: string;
  shortLabel: string;
  isPaid: boolean;
  isPartial: boolean;
  isDebt: boolean;
  isOverdue: boolean;
  isOpenBeforeDue: boolean;
  isFuture: boolean;
  isMinorExempt: boolean;
  isManualExempt: boolean;
  isExempt: boolean;
  isWrittenOff: boolean;
  countsAsRevenue: boolean;
  realizedAmount: number;
  pendingDebtAmount: number;
}

export function normalizeYearMonthKey(rawMonth: string): string {
  const trimmed = (rawMonth || '').trim();
  if (/^\d{4}-\d{2}/.test(trimmed)) return trimmed.slice(0, 7);
  return trimmed;
}

export function classifyMonthlyFee(
  fee: MemberMonthlyFee,
  member?: Pick<User, 'birthDate' | 'isMinor' | 'feeStatus' | 'feeStatusUpdatedAt' | 'feeStatusHistory'> | null,
  referenceDateIso: string = getBrazilTodayIso()
): FeeClassification {
  const refIso = /^\d{4}-\d{2}-\d{2}/.test(referenceDateIso)
    ? referenceDateIso.slice(0, 10)
    : getBrazilTodayIso();
  const refYm = refIso.slice(0, 7);
  const refDay = parseInt(refIso.slice(8, 10), 10) || 1;
  const feeYm = normalizeYearMonthKey(fee.month);
  const amount = Math.max(0, Number(fee.amount) || 0);

  const isExplicitlyWrittenOff =
    fee.settlementStatus === 'forgiven' ||
    fee.settlementStatus === 'cancelled' ||
    fee.settlementStatus === 'written_off';

  if (isExplicitlyWrittenOff) {
    const label =
      fee.settlementStatus === 'forgiven'
        ? 'PERDOADO (Baixa)'
        : fee.settlementStatus === 'cancelled'
        ? 'CANCELADO'
        : 'BAIXADO';
    const shortLabel =
      fee.settlementStatus === 'forgiven'
        ? 'PERDOADO'
        : fee.settlementStatus === 'cancelled'
        ? 'CANCELADO'
        : 'BAIXADO';
    return {
      code: 'written_off',
      label,
      shortLabel,
      isPaid: false,
      isPartial: false,
      isDebt: false,
      isOverdue: false,
      isOpenBeforeDue: false,
      isFuture: false,
      isMinorExempt: false,
      isManualExempt: false,
      isExempt: false,
      isWrittenOff: true,
      countsAsRevenue: false,
      realizedAmount: 0,
      pendingDebtAmount: 0,
    };
  }

  if (fee.status === 'paid' || fee.settlementStatus === 'paid') {
    return {
      code: 'paid',
      label: 'PAGO',
      shortLabel: 'PAGO',
      isPaid: true,
      isPartial: false,
      isDebt: false,
      isOverdue: false,
      isOpenBeforeDue: false,
      isFuture: false,
      isMinorExempt: false,
      isManualExempt: false,
      isExempt: false,
      isWrittenOff: false,
      countsAsRevenue: true,
      realizedAmount: amount,
      pendingDebtAmount: 0,
    };
  }

  const manualPaganteOverride = hasExplicitManualPagante(member);
  let isMinorCompetency = false;
  if (member && !manualPaganteOverride && /^\d{4}-\d{2}$/.test(feeYm)) {
    const fy = parseInt(feeYm.slice(0, 4), 10);
    const fm = parseInt(feeYm.slice(5, 7), 10);
    isMinorCompetency = isMemberMinorAtCompetency(member, fy, fm);
  } else if (member && !manualPaganteOverride && !member.birthDate && member.isMinor) {
    isMinorCompetency = true;
  }

  if (isMinorCompetency) {
    return {
      code: 'exempt_minor',
      label: 'ISENTO – MENOR DE IDADE',
      shortLabel: 'ISENTO <18',
      isPaid: false,
      isPartial: false,
      isDebt: false,
      isOverdue: false,
      isOpenBeforeDue: false,
      isFuture: false,
      isMinorExempt: true,
      isManualExempt: false,
      isExempt: true,
      isWrittenOff: false,
      countsAsRevenue: false,
      realizedAmount: 0,
      pendingDebtAmount: 0,
    };
  }

  const isManualExempt =
    fee.settlementStatus === 'exempt' || member?.feeStatus === 'ISENTO';

  if (isManualExempt) {
    return {
      code: 'exempt_manual',
      label: 'ISENTO (Situação Isenta)',
      shortLabel: 'ISENTO',
      isPaid: false,
      isPartial: false,
      isDebt: false,
      isOverdue: false,
      isOpenBeforeDue: false,
      isFuture: false,
      isMinorExempt: false,
      isManualExempt: true,
      isExempt: true,
      isWrittenOff: false,
      countsAsRevenue: false,
      realizedAmount: 0,
      pendingDebtAmount: 0,
    };
  }

  const isFuture = /^\d{4}-\d{2}$/.test(feeYm) && feeYm > refYm;
  const isCurrentBeforeDue =
    /^\d{4}-\d{2}$/.test(feeYm) && feeYm === refYm && refDay <= DUE_DAY_OF_MONTH;

  if (fee.settlementStatus === 'partial' && (Number(fee.partialPaidAmount) || 0) > 0) {
    const partialPaid = Math.min(amount, Math.max(0, Number(fee.partialPaidAmount) || 0));
    const remaining = Math.max(0, Math.round((amount - partialPaid) * 100) / 100);
    const isDebt = !isFuture && !isCurrentBeforeDue && remaining > 0;
    return {
      code: 'partial',
      label: isDebt ? 'Parcial (Saldo em Atraso)' : 'Pagamento Parcial',
      shortLabel: 'Parcial',
      isPaid: false,
      isPartial: true,
      isDebt,
      isOverdue: isDebt,
      isOpenBeforeDue: isCurrentBeforeDue,
      isFuture,
      isMinorExempt: false,
      isManualExempt: false,
      isExempt: false,
      isWrittenOff: false,
      countsAsRevenue: true,
      realizedAmount: partialPaid,
      pendingDebtAmount: isDebt ? remaining : 0,
    };
  }

  if (isFuture) {
    return {
      code: 'future',
      label: 'Mês Futuro (Não Vencido)',
      shortLabel: 'Futuro',
      isPaid: false,
      isPartial: false,
      isDebt: false,
      isOverdue: false,
      isOpenBeforeDue: false,
      isFuture: true,
      isMinorExempt: false,
      isManualExempt: false,
      isExempt: false,
      isWrittenOff: false,
      countsAsRevenue: false,
      realizedAmount: 0,
      pendingDebtAmount: 0,
    };
  }

  if (isCurrentBeforeDue) {
    return {
      code: 'open_before_due',
      label: 'Em Aberto (Vence dia 15)',
      shortLabel: 'A vencer (dia 15)',
      isPaid: false,
      isPartial: false,
      isDebt: false,
      isOverdue: false,
      isOpenBeforeDue: true,
      isFuture: false,
      isMinorExempt: false,
      isManualExempt: false,
      isExempt: false,
      isWrittenOff: false,
      countsAsRevenue: false,
      realizedAmount: 0,
      pendingDebtAmount: 0,
    };
  }

  return {
    code: 'overdue',
    label: 'Em Atraso (Débito)',
    shortLabel: 'Em Atraso',
    isPaid: false,
    isPartial: false,
    isDebt: true,
    isOverdue: true,
    isOpenBeforeDue: false,
    isFuture: false,
    isMinorExempt: false,
    isManualExempt: false,
    isExempt: false,
    isWrittenOff: false,
    countsAsRevenue: false,
    realizedAmount: 0,
    pendingDebtAmount: amount,
  };
}

export interface AutoGeneratedMemberFee extends MemberMonthlyFee {
  isAutoGenerated?: boolean;
  yearNumber: number;
  monthNumber: number;
  classification: FeeClassification;
}

export interface YearlyMemberFinanceGroup {
  year: number;
  fees: AutoGeneratedMemberFee[];
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  writtenOffCount: number;
  exemptCount: number;
  totalPaidAmount: number;
  totalOpenAmount: number;
}

/**
 * Generates and idempotently merges months across years from max(joinedDate, 18th birthday competency)
 * up through the current Brazil month (or `targetEndYear` when `includeFutureMonthsInYear` is set).
 * - Days 1-15 of current month are NEVER overdue or real debt.
 * - Future months are NEVER counted as debt or overdue.
 * - Minors (< 18) and manually ISENTO members accrue zero charges/debt/overdue.
 * - Past paid records are always preserved regardless of exemptions.
 */
export function buildAutoMemberMonthlyFees(
  member: User,
  existingFees: MemberMonthlyFee[],
  clubInfo: Pick<ClubInfo, 'monthlyFeeAmount'>,
  options?: {
    targetEndYear?: number;
    referenceDateIso?: string;
    feeSchedules?: FeeRateScheduleEntry[];
    includeFutureMonthsInYear?: boolean;
  }
): AutoGeneratedMemberFee[] {
  const nowIso = options?.referenceDateIso || getBrazilTodayIso();
  const currentYear = parseInt(nowIso.slice(0, 4), 10) || getBrazilTodayParts().year;
  const currentMonth = parseInt(nowIso.slice(5, 7), 10) || getBrazilTodayParts().month;
  const currentYm = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const targetEndYear = Math.max(currentYear, options?.targetEndYear || currentYear);
  const entry = extractMemberEntryYearMonth(member, currentYear);
  const entryYm = `${entry.startYear}-${String(entry.startMonth).padStart(2, '0')}`;
  const manualPaganteOverride = hasExplicitManualPagante(member);
  const comp18 = manualPaganteOverride ? null : getEighteenthBirthdayCompetency(member.birthDate);
  const effectiveStartYm = comp18 && comp18 > entryYm ? comp18 : entryYm;

  const startYear = parseInt(effectiveStartYm.slice(0, 4), 10);
  const startMonth = parseInt(effectiveStartYm.slice(5, 7), 10);
  const feeSchedules = options?.feeSchedules || [];

  const memberPersisted = existingFees.filter((f) => f.memberId === member.id);
  const byMonthKey = new Map<string, MemberMonthlyFee>();
  let maxPersistedYear = targetEndYear;

  for (const fee of memberPersisted) {
    const key = normalizeYearMonthKey(fee.month);
    if (/^\d{4}-\d{2}$/.test(key)) {
      const y = parseInt(key.slice(0, 4), 10);
      if (y > maxPersistedYear) maxPersistedYear = y;
    }
    const existing = byMonthKey.get(key);
    if (!existing || (existing.status !== 'paid' && fee.status === 'paid')) {
      byMonthKey.set(key, fee);
    }
  }

  const safeMemberId = member.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const results: AutoGeneratedMemberFee[] = [];
  const effectiveEndYear = Math.max(startYear, targetEndYear, maxPersistedYear);
  const minorWithoutBirthDate = !manualPaganteOverride && !member.birthDate && Boolean(member.isMinor);
  const isMemberManuallyExempt = member.feeStatus === 'ISENTO';

  if (startYear <= effectiveEndYear) {
    for (let y = startYear; y <= effectiveEndYear; y++) {
      const firstMonth = y === startYear ? startMonth : 1;
      for (let m = firstMonth; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        const monthKey = `${y}-${mm}`;
        const standardDueDate = `${y}-${mm}-15`;
        const persisted = byMonthKey.get(monthKey);

        if (persisted) {
          const isPersistedUnpaid =
            persisted.status !== 'paid' &&
            persisted.settlementStatus !== 'paid' &&
            persisted.settlementStatus !== 'forgiven' &&
            persisted.settlementStatus !== 'cancelled' &&
            persisted.settlementStatus !== 'written_off';

          const isPersistedMinorUnpaid =
            isPersistedUnpaid &&
            !manualPaganteOverride &&
            isMemberMinorAtCompetency(member, y, m);

          const effectiveDue =
            persisted.dueDate && /^\d{4}-\d{2}-\d{2}/.test(persisted.dueDate)
              ? persisted.dueDate
              : standardDueDate;

          const baseFee: MemberMonthlyFee = {
            ...persisted,
            dueDate: effectiveDue,
            settlementStatus:
              isPersistedMinorUnpaid || (isPersistedUnpaid && isMemberManuallyExempt)
                ? 'exempt'
                : persisted.settlementStatus,
            exerciseYear: persisted.exerciseYear || y,
          };
          const classification = classifyMonthlyFee(baseFee, member, nowIso);
          results.push({
            ...baseFee,
            status: classification.isPaid
              ? 'paid'
              : classification.isOverdue
              ? 'overdue'
              : 'pending',
            isAutoGenerated: false,
            yearNumber: y,
            monthNumber: m,
            classification,
          });
          byMonthKey.delete(monthKey);
        } else {
          // Do not generate unpaid records for minors (< 18), manual ISENTO members, or future months unless explicitly requested
          if (
            isMemberManuallyExempt ||
            minorWithoutBirthDate ||
            (!manualPaganteOverride && isMemberMinorAtCompetency(member, y, m))
          ) {
            continue;
          }
          const isFutureMonth = monthKey > currentYm;
          if (isFutureMonth && !options?.includeFutureMonthsInYear) {
            continue;
          }

          const applicableAmount = getApplicableMonthlyFeeAmount(y, m, clubInfo, feeSchedules);
          const draftFee: MemberMonthlyFee = {
            id: `fee-auto-${safeMemberId}-${y}${mm}`,
            memberId: member.id,
            memberName: getMemberDisplayName(member),
            month: monthKey,
            monthName: `${PT_BR_MONTH_NAMES[m - 1]} ${y}`,
            amount: applicableAmount,
            dueDate: standardDueDate,
            status: 'pending',
            exerciseYear: y,
          };
          const classification = classifyMonthlyFee(draftFee, member, nowIso);
          results.push({
            ...draftFee,
            status: classification.isOverdue ? 'overdue' : 'pending',
            isAutoGenerated: true,
            yearNumber: y,
            monthNumber: m,
            classification,
          });
        }
      }
    }
  }

  for (const leftover of byMonthKey.values()) {
    const key = normalizeYearMonthKey(leftover.month);
    const parsedYear = parseInt(key.slice(0, 4), 10) || entry.startYear;
    const parsedMonth = parseInt(key.slice(5, 7), 10) || 1;
    const baseFee: MemberMonthlyFee = {
      ...leftover,
      dueDate: leftover.dueDate || `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-15`,
      exerciseYear: leftover.exerciseYear || parsedYear,
    };
    const classification = classifyMonthlyFee(baseFee, member, nowIso);
    results.push({
      ...baseFee,
      status: classification.isPaid
        ? 'paid'
        : classification.isOverdue
        ? 'overdue'
        : 'pending',
      isAutoGenerated: false,
      yearNumber: parsedYear,
      monthNumber: parsedMonth,
      classification,
    });
  }

  return results.sort((a, b) => a.month.localeCompare(b.month));
}

export function groupMemberFeesByYear(
  fees: AutoGeneratedMemberFee[],
  sortOrder: 'desc' | 'asc' = 'desc'
): YearlyMemberFinanceGroup[] {
  const byYear = new Map<number, AutoGeneratedMemberFee[]>();
  for (const fee of fees) {
    const y =
      fee.yearNumber || parseInt((fee.month || '').slice(0, 4), 10) || getBrazilTodayParts().year;
    const bucket = byYear.get(y) || [];
    bucket.push(fee);
    byYear.set(y, bucket);
  }

  const years = Array.from(byYear.keys()).sort((a, b) => (sortOrder === 'desc' ? b - a : a - b));
  return years.map((year) => {
    const list = (byYear.get(year) || []).sort((a, b) => a.month.localeCompare(b.month));
    let paidCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let writtenOffCount = 0;
    let exemptCount = 0;
    let totalPaidAmount = 0;
    let totalOpenAmount = 0;

    for (const f of list) {
      const c = f.classification || classifyMonthlyFee(f);
      if (c.countsAsRevenue) {
        totalPaidAmount += c.realizedAmount;
      }
      if (c.isPaid) {
        paidCount += 1;
      } else if (c.isWrittenOff) {
        writtenOffCount += 1;
      } else if (c.isExempt || c.isMinorExempt) {
        exemptCount += 1;
      } else if (c.isDebt) {
        overdueCount += 1;
        totalOpenAmount += c.pendingDebtAmount;
      } else {
        pendingCount += 1;
      }
    }

    return {
      year,
      fees: list,
      paidCount,
      pendingCount,
      overdueCount,
      writtenOffCount,
      exemptCount,
      totalPaidAmount,
      totalOpenAmount,
    };
  });
}

export function buildAllMembersAutoFeesSchedule(
  members: User[],
  persistedFees: MemberMonthlyFee[],
  clubInfo: Pick<ClubInfo, 'monthlyFeeAmount'>,
  options?: {
    targetEndYear?: number;
    referenceDateIso?: string;
    includeSuspended?: boolean;
    feeSchedules?: FeeRateScheduleEntry[];
    includeFutureMonthsInYear?: boolean;
  }
): AutoGeneratedMemberFee[] {
  const targetMembers = members.filter((m) =>
    options?.includeSuspended ? true : m.status === 'active'
  );
  const merged: AutoGeneratedMemberFee[] = [];
  for (const member of targetMembers) {
    merged.push(...buildAutoMemberMonthlyFees(member, persistedFees, clubInfo, options));
  }
  return merged;
}

export interface IntegratedClubFinanceSummary {
  realizedFeeRevenue: number;
  standaloneManualIdentifiedRevenue: number;
  manualUnidentifiedRevenue: number;
  memberTabPaidRevenue: number;
  walkInPaidRevenue: number;
  totalConfirmedRevenue: number;
  expensesPaid: number;
  expensesPending: number;
  netCashBalance: number;
  openOverdueFeeDebt: number;
  openCurrentBeforeDueAmount: number;
  memberTabOpenDebt: number;
  walkInOpenBalance: number;
  writtenOffCount: number;
  writtenOffAmount: number;
  minorExemptMembersCount: number;
  manualExemptMembersCount: number;
}

export function isTabWrittenOff(t: Pick<MemberTabDebt, 'settlementStatus'>): boolean {
  return (
    t.settlementStatus === 'forgiven' ||
    t.settlementStatus === 'cancelled' ||
    t.settlementStatus === 'written_off'
  );
}

export function getTabClassificationLabel(t: MemberTabDebt): string {
  if (t.settlementStatus === 'forgiven') return 'PERDOADO (Baixa)';
  if (t.settlementStatus === 'cancelled') return 'CANCELADO';
  if (t.settlementStatus === 'written_off') return 'BAIXADO';
  if (t.status === 'paid' || t.settlementStatus === 'paid') return 'PAGO';
  return 'PENDENTE';
}

export function summarizeIntegratedClubFinance(params: {
  members: User[];
  scheduledFees: AutoGeneratedMemberFee[];
  tabs: MemberTabDebt[];
  expenses: ClubExpense[];
  manualReceipts: ManualFinancialEntry[];
  walkInTabs: WalkInTabRecord[];
  referenceDateIso?: string;
}): IntegratedClubFinanceSummary {
  const refIso = params.referenceDateIso || getBrazilTodayIso();
  const memberById = new Map(params.members.map((m) => [m.id, m]));

  let realizedFeeRevenue = 0;
  let openOverdueFeeDebt = 0;
  let openCurrentBeforeDueAmount = 0;
  let writtenOffCount = 0;
  let writtenOffAmount = 0;

  for (const f of params.scheduledFees) {
    const member = memberById.get(f.memberId);
    const c = f.classification || classifyMonthlyFee(f, member, refIso);
    if (c.countsAsRevenue) {
      realizedFeeRevenue += c.realizedAmount;
    }
    if (c.isDebt) {
      openOverdueFeeDebt += c.pendingDebtAmount;
    }
    if (c.isOpenBeforeDue) {
      const partialPaid = Math.max(0, Number(f.partialPaidAmount) || 0);
      openCurrentBeforeDueAmount += Math.max(0, (Number(f.amount) || 0) - partialPaid);
    }
    if (c.isWrittenOff) {
      writtenOffCount += 1;
      writtenOffAmount += Number(f.amount) || 0;
    }
  }

  let standaloneManualIdentifiedRevenue = 0;
  let manualUnidentifiedRevenue = 0;

  for (const entry of params.manualReceipts) {
    if (entry.status === 'reversed') continue;
    const amt = Math.max(0, Number(entry.amount) || 0);
    if (entry.identificationStatus === 'unidentified' || !entry.memberId) {
      manualUnidentifiedRevenue += amt;
    } else if (!entry.linkedFeeId) {
      standaloneManualIdentifiedRevenue += amt;
    }
  }

  // Baixas / perdões / cancelamentos de fiado NUNCA geram receita nem dívida aberta
  const memberTabPaidRevenue = params.tabs
    .filter((t) => !isTabWrittenOff(t) && (t.status === 'paid' || t.settlementStatus === 'paid'))
    .reduce((acc, t) => acc + Math.max(0, Number(t.amount) || 0), 0);

  const memberTabOpenDebt = params.tabs
    .filter((t) => !isTabWrittenOff(t) && t.status === 'pending' && t.settlementStatus !== 'paid')
    .reduce((acc, t) => acc + Math.max(0, Number(t.amount) || 0), 0);

  params.tabs.forEach((t) => {
    if (isTabWrittenOff(t)) {
      writtenOffCount += 1;
      writtenOffAmount += Number(t.amount) || 0;
    }
  });

  const walkInPaidRevenue = params.walkInTabs
    .filter((w) => w.status !== 'cancelled')
    .reduce((acc, w) => acc + Math.max(0, Number(w.paidAmount) || 0), 0);

  const walkInOpenBalance = params.walkInTabs
    .filter((w) => w.status === 'open' || w.status === 'partial')
    .reduce((acc, w) => acc + Math.max(0, Number(w.balanceDue) || 0), 0);

  const expensesPaid = params.expenses
    .filter((e) => e.status === 'paid')
    .reduce((acc, e) => acc + Math.max(0, Number(e.amount) || 0), 0);

  const expensesPending = params.expenses
    .filter((e) => e.status !== 'paid')
    .reduce((acc, e) => acc + Math.max(0, Number(e.amount) || 0), 0);

  const totalConfirmedRevenue =
    realizedFeeRevenue +
    standaloneManualIdentifiedRevenue +
    manualUnidentifiedRevenue +
    memberTabPaidRevenue +
    walkInPaidRevenue;

  const netCashBalance = totalConfirmedRevenue - expensesPaid;

  const minorExemptMembersCount = params.members.filter(
    (m) => m.status === 'active' && isMemberCurrentlyMinor(m, refIso) && !hasExplicitManualPagante(m)
  ).length;

  const manualExemptMembersCount = params.members.filter(
    (m) => m.status === 'active' && m.feeStatus === 'ISENTO'
  ).length;

  return {
    realizedFeeRevenue: Math.round(realizedFeeRevenue * 100) / 100,
    standaloneManualIdentifiedRevenue: Math.round(standaloneManualIdentifiedRevenue * 100) / 100,
    manualUnidentifiedRevenue: Math.round(manualUnidentifiedRevenue * 100) / 100,
    memberTabPaidRevenue: Math.round(memberTabPaidRevenue * 100) / 100,
    walkInPaidRevenue: Math.round(walkInPaidRevenue * 100) / 100,
    totalConfirmedRevenue: Math.round(totalConfirmedRevenue * 100) / 100,
    expensesPaid: Math.round(expensesPaid * 100) / 100,
    expensesPending: Math.round(expensesPending * 100) / 100,
    netCashBalance: Math.round(netCashBalance * 100) / 100,
    openOverdueFeeDebt: Math.round(openOverdueFeeDebt * 100) / 100,
    openCurrentBeforeDueAmount: Math.round(openCurrentBeforeDueAmount * 100) / 100,
    memberTabOpenDebt: Math.round(memberTabOpenDebt * 100) / 100,
    walkInOpenBalance: Math.round(walkInOpenBalance * 100) / 100,
    writtenOffCount,
    writtenOffAmount: Math.round(writtenOffAmount * 100) / 100,
    minorExemptMembersCount,
    manualExemptMembersCount,
  };
}

// --- Multi-day RideEvent helpers ---

export function getNormalizedEventEndDate(ev: { date: string; endDate?: string }): string {
  const start = (ev.date || '').slice(0, 10);
  const end = (ev.endDate || '').slice(0, 10);
  if (end && start && end >= start) return end;
  return start;
}

export function isMultiDayEvent(ev: { date: string; endDate?: string }): boolean {
  const start = (ev.date || '').slice(0, 10);
  const end = getNormalizedEventEndDate(ev);
  return Boolean(start && end && end > start);
}

export function isEventActiveOnDate(
  ev: { date: string; endDate?: string },
  targetIso: string
): boolean {
  const start = (ev.date || '').slice(0, 10);
  const end = getNormalizedEventEndDate(ev);
  if (!start || !targetIso) return false;
  return targetIso >= start && targetIso <= end;
}

export function isEventUpcomingOrOngoing(
  ev: { date: string; endDate?: string },
  refIso: string = getBrazilTodayIso()
): boolean {
  const end = getNormalizedEventEndDate(ev);
  return Boolean(end && end >= refIso);
}

export function formatIsoDateBr(iso?: string | null): string {
  const parts = parseIsoDateParts(iso);
  if (!parts) return iso || '';
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

export function formatEventPeriodLabel(ev: { date: string; endDate?: string }): string {
  const start = formatIsoDateBr(ev.date);
  if (!isMultiDayEvent(ev)) return start;
  return `${start} a ${formatIsoDateBr(getNormalizedEventEndDate(ev))}`;
}

// --- Structured Financial PDF Report Data Builder ---

export interface FinancialReportLineItem {
  date: string;
  type: 'receita_mensalidade' | 'receita_avulsa' | 'receita_fiado' | 'receita_cliente' | 'despesa' | 'inadimplencia';
  categoryLabel: string;
  memberOrClient: string;
  description: string;
  statusLabel: string;
  amount: number;
}

export interface FinancialPdfReportData {
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  totals: {
    feesRevenue: number;
    manualRevenue: number;
    memberTabsRevenue: number;
    walkInRevenue: number;
    totalRevenues: number;
    totalExpensesPaid: number;
    totalExpensesPending: number;
    totalDelinquencies: number;
    netBalance: number;
    exemptMembersCount: number;
  };
  revenues: FinancialReportLineItem[];
  expenses: FinancialReportLineItem[];
  monthlyFees: FinancialReportLineItem[];
  individualPayments: FinancialReportLineItem[];
  delinquencies: FinancialReportLineItem[];
}

export function buildFinancialPdfReportData(params: {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  members: User[];
  scheduledFees: AutoGeneratedMemberFee[];
  manualReceipts: ManualFinancialEntry[];
  tabs: MemberTabDebt[];
  walkInTabs: WalkInTabRecord[];
  expenses: ClubExpense[];
  referenceDateIso?: string;
}): FinancialPdfReportData {
  const start = (params.periodStart || '2008-01-01').slice(0, 10);
  const end = (params.periodEnd || getBrazilTodayIso()).slice(0, 10);
  const refIso = params.referenceDateIso || getBrazilTodayIso();
  const memberById = new Map(params.members.map((m) => [m.id, m]));

  const inRange = (rawDate?: string | null) => {
    const d = (rawDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    return d >= start && d <= end;
  };

  const revenues: FinancialReportLineItem[] = [];
  const expenses: FinancialReportLineItem[] = [];
  const monthlyFees: FinancialReportLineItem[] = [];
  const individualPayments: FinancialReportLineItem[] = [];
  const delinquencies: FinancialReportLineItem[] = [];

  let feesRevenue = 0;
  let manualRevenue = 0;
  let memberTabsRevenue = 0;
  let walkInRevenue = 0;
  let totalExpensesPaid = 0;
  let totalExpensesPending = 0;
  let totalDelinquencies = 0;

  for (const fee of params.scheduledFees) {
    const member = memberById.get(fee.memberId);
    const c = fee.classification || classifyMonthlyFee(fee, member, refIso);
    const memberName = getMemberDisplayName(member) || fee.memberName || 'Integrante';
    const feeDate = (fee.paidAt || fee.dueDate || `${fee.month}-15`).slice(0, 10);

    if (c.isExempt || c.isMinorExempt || c.isWrittenOff) {
      if (inRange(`${fee.month}-15`)) {
        monthlyFees.push({
          date: `${fee.month}-15`,
          type: 'receita_mensalidade',
          categoryLabel: 'Mensalidade',
          memberOrClient: memberName,
          description: `Competência ${fee.monthName || fee.month}`,
          statusLabel: c.label,
          amount: 0,
        });
      }
      continue;
    }

    if (c.countsAsRevenue && c.realizedAmount > 0 && inRange(feeDate)) {
      feesRevenue += c.realizedAmount;
      const item: FinancialReportLineItem = {
        date: feeDate,
        type: 'receita_mensalidade',
        categoryLabel: 'Mensalidade',
        memberOrClient: memberName,
        description: `Mensalidade ${fee.monthName || fee.month}`,
        statusLabel: c.label,
        amount: c.realizedAmount,
      };
      revenues.push(item);
      monthlyFees.push(item);
      individualPayments.push(item);
    } else if (c.isDebt && c.pendingDebtAmount > 0 && inRange(fee.dueDate || `${fee.month}-15`)) {
      totalDelinquencies += c.pendingDebtAmount;
      const item: FinancialReportLineItem = {
        date: (fee.dueDate || `${fee.month}-15`).slice(0, 10),
        type: 'inadimplencia',
        categoryLabel: 'Mensalidade em Atraso',
        memberOrClient: memberName,
        description: `Competência ${fee.monthName || fee.month}`,
        statusLabel: c.label,
        amount: c.pendingDebtAmount,
      };
      delinquencies.push(item);
      monthlyFees.push(item);
    }
  }

  for (const entry of params.manualReceipts) {
    if (entry.status === 'reversed') continue;
    const d = (entry.paymentDate || entry.createdAt).slice(0, 10);
    if (!inRange(d)) continue;
    const amt = Math.max(0, Number(entry.amount) || 0);
    if (!entry.linkedFeeId) {
      manualRevenue += amt;
      const item: FinancialReportLineItem = {
        date: d,
        type: 'receita_avulsa',
        categoryLabel:
          entry.identificationStatus === 'unidentified'
            ? 'Receita Não Identificada'
            : 'Lançamento Manual',
        memberOrClient: entry.memberName || 'Não identificado',
        description: entry.description || 'Recebimento avulso',
        statusLabel: 'Confirmado',
        amount: amt,
      };
      revenues.push(item);
      if (entry.memberId) {
        individualPayments.push(item);
      }
    }
  }

  for (const t of params.tabs) {
    if (isTabWrittenOff(t)) continue;
    const member = memberById.get(t.memberId);
    const memberName = getMemberDisplayName(member) || t.memberName || 'Integrante';
    const amt = Math.max(0, Number(t.amount) || 0);
    if (t.status === 'paid' || t.settlementStatus === 'paid') {
      const paidDate = (t.paidAt || t.date).slice(0, 10);
      if (!inRange(paidDate)) continue;
      memberTabsRevenue += amt;
      const item: FinancialReportLineItem = {
        date: paidDate,
        type: 'receita_fiado',
        categoryLabel: 'Fiado Sede (Integrante)',
        memberOrClient: memberName,
        description: t.itemDescription,
        statusLabel: 'PAGO',
        amount: amt,
      };
      revenues.push(item);
      individualPayments.push(item);
    } else if (t.status === 'pending' && inRange(t.date)) {
      totalDelinquencies += amt;
      delinquencies.push({
        date: (t.date || '').slice(0, 10),
        type: 'inadimplencia',
        categoryLabel: 'Fiado Sede Aberto',
        memberOrClient: memberName,
        description: t.itemDescription,
        statusLabel: 'PENDENTE',
        amount: amt,
      });
    }
  }

  for (const wt of params.walkInTabs) {
    if (wt.status === 'cancelled') continue;
    const wtPayments = wt.payments || [];
    if (wtPayments.length > 0) {
      for (const p of wtPayments) {
        const pd = (p.paymentDate || p.paidAt || wt.openedAt).slice(0, 10);
        if (!inRange(pd)) continue;
        const amt = Math.max(0, Number(p.amount) || 0);
        walkInRevenue += amt;
        const item: FinancialReportLineItem = {
          date: pd,
          type: 'receita_cliente',
          categoryLabel: 'Fiado Sede (Visitante/Avulso)',
          memberOrClient: wt.clientName,
          description: `Pagamento comanda #${wt.id.slice(-6)}`,
          statusLabel: 'PAGO',
          amount: amt,
        };
        revenues.push(item);
        individualPayments.push(item);
      }
    } else if (Number(wt.paidAmount) > 0) {
      const pd = (wt.closedAt || wt.openedAt).slice(0, 10);
      if (inRange(pd)) {
        const amt = Math.max(0, Number(wt.paidAmount) || 0);
        walkInRevenue += amt;
        const item: FinancialReportLineItem = {
          date: pd,
          type: 'receita_cliente',
          categoryLabel: 'Fiado Sede (Visitante/Avulso)',
          memberOrClient: wt.clientName,
          description: `Pagamento comanda #${wt.id.slice(-6)}`,
          statusLabel: 'PAGO',
          amount: amt,
        };
        revenues.push(item);
        individualPayments.push(item);
      }
    }
    if ((wt.status === 'open' || wt.status === 'partial') && wt.balanceDue > 0 && inRange(wt.openedAt)) {
      totalDelinquencies += wt.balanceDue;
      delinquencies.push({
        date: (wt.openedAt || '').slice(0, 10),
        type: 'inadimplencia',
        categoryLabel: 'Fiado Avulso Aberto',
        memberOrClient: wt.clientName,
        description: `Saldo em aberto comanda #${wt.id.slice(-6)}`,
        statusLabel: wt.status === 'partial' ? 'PARCIAL' : 'ABERTO',
        amount: wt.balanceDue,
      });
    }
  }

  for (const e of params.expenses) {
    const d = (e.date || '').slice(0, 10);
    if (!inRange(d)) continue;
    const amt = Math.max(0, Number(e.amount) || 0);
    if (e.status === 'paid') {
      totalExpensesPaid += amt;
    } else {
      totalExpensesPending += amt;
    }
    expenses.push({
      date: d,
      type: 'despesa',
      categoryLabel: e.category || 'outros',
      memberOrClient: e.paidBy || 'Tesouraria',
      description: e.title,
      statusLabel: e.status === 'paid' ? 'PAGA' : 'PENDENTE',
      amount: amt,
    });
  }

  const totalRevenues =
    feesRevenue + manualRevenue + memberTabsRevenue + walkInRevenue;
  const netBalance = totalRevenues - totalExpensesPaid;
  const exemptMembersCount = params.members.filter(
    (m) => m.status === 'active' && resolveMemberFeeStatusInfo(m, refIso).isExempt
  ).length;

  const sortByDateDesc = (a: FinancialReportLineItem, b: FinancialReportLineItem) =>
    b.date.localeCompare(a.date);

  return {
    periodStart: start,
    periodEnd: end,
    generatedAt: new Date().toISOString(),
    totals: {
      feesRevenue: Math.round(feesRevenue * 100) / 100,
      manualRevenue: Math.round(manualRevenue * 100) / 100,
      memberTabsRevenue: Math.round(memberTabsRevenue * 100) / 100,
      walkInRevenue: Math.round(walkInRevenue * 100) / 100,
      totalRevenues: Math.round(totalRevenues * 100) / 100,
      totalExpensesPaid: Math.round(totalExpensesPaid * 100) / 100,
      totalExpensesPending: Math.round(totalExpensesPending * 100) / 100,
      totalDelinquencies: Math.round(totalDelinquencies * 100) / 100,
      netBalance: Math.round(netBalance * 100) / 100,
      exemptMembersCount,
    },
    revenues: revenues.sort(sortByDateDesc),
    expenses: expenses.sort(sortByDateDesc),
    monthlyFees: monthlyFees.sort(sortByDateDesc),
    individualPayments: individualPayments.sort(sortByDateDesc),
    delinquencies: delinquencies.sort(sortByDateDesc),
  };
}

